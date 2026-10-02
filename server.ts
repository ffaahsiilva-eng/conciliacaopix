import * as dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { getDatabase, scheduleSaveDatabase, persistDatabaseSync, getCloudSqlPool, safeCloudSqlQuery } from './server/db.js';
import { parseOfx, isBalanceLine } from './server/parsers/ofxParser.js';
import { parseCsvStatement } from './server/parsers/csvParser.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parsers with large limits for big statement files (over 1 year of data)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Vercel Serverless Middleware: Ensure DB is loaded before processing API requests
app.use('/api', async (req, res, next) => {
  if (req.path === '/debug-db') return next(); // Skip DB init for debug
  try {
    await getDatabase();
    next();
  } catch (err: any) {
    console.error('[VERCEL DB INIT ERROR]', err);
    res.status(500).json({ error: 'Failed to initialize database on Vercel', details: err?.message, stack: err?.stack });
  }
});

app.get('/api/debug-db', async (req, res) => {
  const pool = getCloudSqlPool();
  if (!pool) {
    return res.json({ status: 'NO_POOL', env: { host: !!process.env.SQL_HOST, user: !!process.env.SQL_USER, pass: !!process.env.SQL_PASSWORD } });
  }
  try {
    const r = await pool.query('SELECT 1 as test');
    res.json({ status: 'OK', test: r.rows });
  } catch (err: any) {
    res.json({ status: 'ERROR', error: err?.message });
  }
});

// List of SSE subscribers for real-time synchronization
interface SseClient {
  id: string;
  res: Response;
}
let sseClients: SseClient[] = [];

// Global process guards to prevent dev server crashes
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

export function broadcastEvent(eventType: string, payload: any) {
  const data = JSON.stringify({ type: eventType, payload, timestamp: new Date().toISOString() });
  sseClients = sseClients.filter((client) => {
    try {
      if (client.res.writableEnded || client.res.destroyed) {
        return false;
      }
      client.res.write(`data: ${data}\n\n`);
      return true;
    } catch {
      return false;
    }
  });
}

// SSE Endpoint for real-time cloud sync across all connected operators
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const clientObj: SseClient = { id: clientId, res };
  sseClients.push(clientObj);

  // Initial welcome event
  try {
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId, timestamp: new Date().toISOString() })}\n\n`);
  } catch {}

  // Periodic heartbeat
  const heartbeat = setInterval(() => {
    try {
      if (res.writableEnded || res.destroyed) {
        clearInterval(heartbeat);
        sseClients = sseClients.filter((c) => c.id !== clientId);
      } else {
        res.write(': heartbeat\n\n');
      }
    } catch {
      clearInterval(heartbeat);
      sseClients = sseClients.filter((c) => c.id !== clientId);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter((c) => c.id !== clientId);
  });
});

// Helper for running SQL with proper mapping and guaranteed stmt.free()
async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDatabase();
  let stmt: any = null;
  try {
    stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as T);
    }
    return rows;
  } catch (err) {
    console.error('[DB Query Error]', err, 'SQL:', sql);
    throw err;
  } finally {
    if (stmt) {
      try {
        stmt.free();
      } catch {}
    }
  }
}

async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await queryAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function runSql(sql: string, params: any[] = []): Promise<void> {
  const db = await getDatabase();
  try {
    db.run(sql, params);
    scheduleSaveDatabase();
  } catch (err) {
    console.error('[DB Run Error]', err, 'SQL:', sql);
    throw err;
  }
}

function getCompanyId(req: express.Request): string {
  const comp = (req.headers['x-company-id'] || req.query.company_id || req.body?.company_id || 'matriz') as string;
  return comp ? String(comp).trim().toLowerCase() : 'matriz';
}

async function logAudit(
  action: string,
  entityType: string,
  entityId: string,
  user: { id: string; name: string; role: string },
  details: any,
  companyId: string = 'matriz'
) {
  const now = new Date().toISOString();
  const id = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  await runSql(
    `INSERT INTO audit_logs (id, company_id, action, entity_type, entity_id, user_id, user_name, user_role, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, companyId, action, entityType, entityId, user.id, user.name, user.role, JSON.stringify(details), now]
  );
}

// -------------------------------------------------------------
// Companies Endpoints (Matriz & Filial)
// -------------------------------------------------------------
app.get('/api/companies', async (req, res) => {
  try {
    const companies = await queryAll(`SELECT * FROM companies WHERE active = 1 ORDER BY is_main DESC, name ASC`);
    res.json(companies);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Authentication & User Management Endpoints
// -------------------------------------------------------------
app.get('/api/users', async (req, res) => {
  try {
    const rawUsers = await queryAll(`SELECT id, name, email, role, avatar, allowed_companies, active, created_at FROM users ORDER BY name ASC`);
    const users = rawUsers.map((u: any) => {
      let allowed_companies = ['matriz', 'filial'];
      try {
        if (u.allowed_companies) {
          allowed_companies = typeof u.allowed_companies === 'string' ? JSON.parse(u.allowed_companies) : u.allowed_companies;
        }
      } catch {
        allowed_companies = ['matriz', 'filial'];
      }
      return { ...u, allowed_companies };
    });
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, email, role, pin, allowed_companies, actorUser } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Nome, email e perfil são obrigatórios.' });
    }
    if (actorUser && actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores podem cadastrar novos usuários.' });
    }

    const existing = await queryOne(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
    }

    const id = `usr-${Date.now()}`;
    const now = new Date().toISOString();
    const allowedCompJson = JSON.stringify(allowed_companies && Array.isArray(allowed_companies) ? allowed_companies : ['matriz', 'filial']);

    await runSql(
      `INSERT INTO users (id, name, email, role, pin, allowed_companies, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, name.trim(), email.toLowerCase().trim(), role, pin || '1234', allowedCompJson, now]
    );

    if (actorUser) {
      await logAudit('USER_CREATED', 'USER', id, actorUser, { name, email, role, allowed_companies });
    }

    const created = await queryOne(`SELECT id, name, email, role, avatar, allowed_companies, active, created_at FROM users WHERE id = ?`, [id]);
    const safeCreated = {
      ...created,
      allowed_companies: JSON.parse(created.allowed_companies || '["matriz","filial"]')
    };
    broadcastEvent('USERS_UPDATED', { action: 'CREATED', user: safeCreated });
    res.status(201).json(safeCreated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, active, pin, allowed_companies, actorUser } = req.body;

    if (actorUser && actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores podem alterar usuários.' });
    }

    const user = await queryOne(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const newName = name !== undefined ? name.trim() : user.name;
    const newRole = role !== undefined ? role : user.role;
    const newActive = active !== undefined ? (active ? 1 : 0) : user.active;
    const newPin = pin !== undefined ? pin : user.pin;
    const newAllowedComp = allowed_companies !== undefined 
      ? JSON.stringify(allowed_companies) 
      : (user.allowed_companies || '["matriz","filial"]');

    let newEmail = user.email;
    if (email !== undefined && email.trim() !== '') {
      const cleanEmail = email.toLowerCase().trim();
      const existingEmail = await queryOne(`SELECT id FROM users WHERE email = ? AND id != ?`, [cleanEmail, id]);
      if (existingEmail) {
        return res.status(400).json({ error: 'Já existe outro usuário cadastrado com este e-mail corporativo.' });
      }
      newEmail = cleanEmail;
    }

    await runSql(
      `UPDATE users SET name = ?, email = ?, role = ?, active = ?, pin = ?, allowed_companies = ? WHERE id = ?`,
      [newName, newEmail, newRole, newActive, newPin, newAllowedComp, id]
    );

    if (actorUser) {
      await logAudit('USER_UPDATED', 'USER', id, actorUser, { newName, newEmail, newRole, newActive, allowed_companies });
    }

    const updated = await queryOne(`SELECT id, name, email, role, avatar, allowed_companies, active, created_at FROM users WHERE id = ?`, [id]);
    const safeUpdated = {
      ...updated,
      allowed_companies: JSON.parse(updated.allowed_companies || '["matriz","filial"]')
    };
    broadcastEvent('USERS_UPDATED', { action: 'UPDATED', user: safeUpdated });
    res.json(safeUpdated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user (Admin only)
app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { actorUser } = req.body || {};

    if (!actorUser || actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores podem excluir usuários do sistema.' });
    }

    if (actorUser.id === id) {
      return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário em uso.' });
    }

    const user = await queryOne(`SELECT * FROM users WHERE id = ?`, [id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    // If deleting an ADMIN, ensure at least 1 other active admin remains
    if (user.role === 'ADMIN') {
      const adminCountRow = await queryOne(`SELECT COUNT(*) as c FROM users WHERE role = 'ADMIN' AND id != ? AND active = 1`, [id]);
      if (!adminCountRow || adminCountRow.c < 1) {
        return res.status(400).json({ error: 'Não é possível excluir o único Administrador ativo do sistema.' });
      }
    }

    await runSql(`DELETE FROM users WHERE id = ?`, [id]);

    await logAudit('USER_DELETED', 'USER', id, actorUser, {
      deletedUserName: user.name,
      deletedUserEmail: user.email,
      deletedUserRole: user.role
    });

    broadcastEvent('USERS_UPDATED', { action: 'DELETED', userId: id, userName: user.name });

    res.json({
      success: true,
      message: `Usuário "${user.name}" (${user.email}) excluído com sucesso do sistema.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Authentication: Login with Password verification
app.post('/api/auth/login', async (req, res) => {
  try {
    const { emailOrId, password } = req.body;
    if (!emailOrId || !password) {
      return res.status(400).json({ error: 'Informe o usuário e a respectiva senha de acesso.' });
    }

    const trimmed = String(emailOrId).trim();
    const user = await queryOne(
      `SELECT * FROM users WHERE (id = ? OR LOWER(email) = ? OR LOWER(name) = ?) AND active = 1`,
      [trimmed, trimmed.toLowerCase(), trimmed.toLowerCase()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado ou cadastro inativo no sistema.' });
    }

    const expectedPassword = user.pin || '1234';
    if (String(password).trim() !== String(expectedPassword).trim()) {
      return res.status(401).json({
        error: `Senha incorreta para o usuário "${user.name}". Não é permitido acessar este cadastro sem a senha correta.`
      });
    }

    await logAudit('USER_LOGIN', 'USER', user.id, user, { ip: req.ip });

    let allowed_companies = ['matriz', 'filial'];
    try {
      if (user.allowed_companies) {
        allowed_companies = JSON.parse(user.allowed_companies);
      }
    } catch {}

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      allowed_companies,
      active: user.active,
      created_at: user.created_at
    };

    res.json({ success: true, user: safeUser });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Authentication: Change Password
app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword, actorUser } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'Usuário e nova senha são obrigatórios.' });
    }

    const user = await queryOne(`SELECT * FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const isAdminActor = actorUser && actorUser.role === 'ADMIN';
    const isSelf = actorUser && actorUser.id === userId;

    if (!isAdminActor && !isSelf) {
      return res.status(403).json({ error: 'Apenas o próprio usuário ou o Administrador podem alterar a senha.' });
    }

    // If changing own password, verify current password
    if (isSelf && !isAdminActor) {
      const expectedPassword = user.pin || '1234';
      if (String(currentPassword).trim() !== String(expectedPassword).trim()) {
        return res.status(401).json({ error: 'A senha atual informada está incorreta.' });
      }
    }

    if (String(newPassword).trim().length < 3) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 3 caracteres.' });
    }

    await runSql(`UPDATE users SET pin = ? WHERE id = ?`, [String(newPassword).trim(), userId]);

    if (actorUser) {
      await logAudit('PASSWORD_CHANGED', 'USER', userId, actorUser, { targetUserName: user.name });
    }

    res.json({ success: true, message: `Senha do usuário "${user.name}" atualizada com sucesso.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Driver Management Endpoints (Cadastro de Motoristas)
// -------------------------------------------------------------
app.get('/api/drivers', async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const drivers = await queryAll(
      `
      SELECT d.*,
             COUNT(DISTINCT s.id) as total_sessions,
             COUNT(DISTINCT CASE WHEN t.status = 'RECONCILED' THEN t.id END) as total_reconciled_pix_count,
             COALESCE(SUM(CASE WHEN t.status = 'RECONCILED' THEN t.amount ELSE 0 END), 0) as total_reconciled_amount,
             COALESCE(SUM(s.missing_amount), 0) as total_missing_amount
      FROM drivers d
      LEFT JOIN reconciliation_sessions s ON s.driver_id = d.id AND s.status = 'COMPLETED'
      LEFT JOIN transactions t ON t.driver_id = d.id AND t.status = 'RECONCILED'
      WHERE d.company_id = ?
      GROUP BY d.id
      ORDER BY d.name ASC
    `,
      [companyId]
    );
    res.json(drivers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/drivers', async (req, res) => {
  try {
    const companyId = req.body.company_id || getCompanyId(req);
    const { code, name, cpf, phone, vehicle_plate, vehicle_model, route, notes, actorUser } = req.body;
    if (!name || !vehicle_plate) {
      return res.status(400).json({ error: 'Nome do motorista e Placa do veículo são obrigatórios.' });
    }

    // Auto-generate driver code if not provided
    let driverCode = code ? code.trim().toUpperCase() : '';
    if (!driverCode) {
      const countRow = await queryOne(`SELECT COUNT(*) as c FROM drivers WHERE company_id = ?`, [companyId]);
      const nextNum = (countRow?.c || 0) + 1;
      driverCode = `MOT-${String(nextNum).padStart(2, '0')}`;
    }

    const existing = await queryOne(`SELECT id FROM drivers WHERE company_id = ? AND (code = ? OR vehicle_plate = ?)`, [
      companyId,
      driverCode,
      vehicle_plate.trim().toUpperCase()
    ]);
    if (existing) {
      return res.status(400).json({ error: 'Já existe um motorista cadastrado nesta empresa com este código ou placa de veículo.' });
    }

    const id = `drv-${Date.now()}`;
    const now = new Date().toISOString();

    await runSql(
      `INSERT INTO drivers (id, company_id, code, name, cpf, phone, vehicle_plate, vehicle_model, route, active, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        id,
        companyId,
        driverCode,
        name.trim(),
        cpf ? cpf.trim() : null,
        phone ? phone.trim() : null,
        vehicle_plate.trim().toUpperCase(),
        vehicle_model ? vehicle_model.trim() : null,
        route ? route.trim() : null,
        notes ? notes.trim() : null,
        now,
        now
      ]
    );

    if (actorUser) {
      await logAudit('DRIVER_CREATED', 'DRIVER', id, actorUser, { name, driverCode, vehicle_plate }, companyId);
    }

    const created = await queryOne(`SELECT * FROM drivers WHERE id = ?`, [id]);
    broadcastEvent('DRIVERS_UPDATED', { action: 'CREATED', driver: created, company_id: companyId });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/drivers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, cpf, phone, vehicle_plate, vehicle_model, route, active, notes, actorUser } = req.body;

    const driver = await queryOne(`SELECT * FROM drivers WHERE id = ?`, [id]);
    if (!driver) return res.status(404).json({ error: 'Motorista não encontrado.' });

    const companyId = driver.company_id || 'matriz';
    const now = new Date().toISOString();
    await runSql(
      `UPDATE drivers SET 
        code = ?,
        name = ?,
        cpf = ?,
        phone = ?,
        vehicle_plate = ?,
        vehicle_model = ?,
        route = ?,
        active = ?,
        notes = ?,
        updated_at = ?
       WHERE id = ?`,
      [
        code !== undefined ? code.trim().toUpperCase() : driver.code,
        name !== undefined ? name.trim() : driver.name,
        cpf !== undefined ? cpf.trim() : driver.cpf,
        phone !== undefined ? phone.trim() : driver.phone,
        vehicle_plate !== undefined ? vehicle_plate.trim().toUpperCase() : driver.vehicle_plate,
        vehicle_model !== undefined ? vehicle_model.trim() : driver.vehicle_model,
        route !== undefined ? route.trim() : driver.route,
        active !== undefined ? (active ? 1 : 0) : driver.active,
        notes !== undefined ? notes.trim() : driver.notes,
        now,
        id
      ]
    );

    if (actorUser) {
      await logAudit('DRIVER_UPDATED', 'DRIVER', id, actorUser, { id, name }, companyId);
    }

    const updated = await queryOne(`SELECT * FROM drivers WHERE id = ?`, [id]);
    broadcastEvent('DRIVERS_UPDATED', { action: 'UPDATED', driver: updated, company_id: companyId });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Bank Accounts Endpoints
// -------------------------------------------------------------
app.get('/api/banks', async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const banks = await queryAll(`SELECT * FROM bank_accounts WHERE company_id = ? AND active = 1 ORDER BY bank_name ASC`, [companyId]);
    res.json(banks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Statement Upload & Processing (OFX / CSV / Multi-banco)
// -------------------------------------------------------------
app.post('/api/statements/upload', async (req, res) => {
  try {
    const { filename, content, format, bankName, bankCode, actorUser } = req.body;
    if (!content || !filename) {
      return res.status(400).json({ error: 'Arquivo e conteúdo são obrigatórios.' });
    }
    if (!actorUser) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    let parsedResult;
    const isOfx = format === 'OFX' || filename.toLowerCase().endsWith('.ofx');

    if (isOfx) {
      parsedResult = parseOfx(content, bankName || 'Extrato Bancário');
    } else {
      parsedResult = parseCsvStatement(content, bankName || 'Extrato Bancário', bankCode || '');
    }

    if (!parsedResult.transactions || parsedResult.transactions.length === 0) {
      return res.status(400).json({ error: 'Nenhuma transação válida encontrada no arquivo fornecido. Verifique o formato do arquivo.' });
    }

    const companyId = req.body.company_id || getCompanyId(req);
    const batchId = `batch-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const finalBankName = bankName || parsedResult.bankName || 'Extrato Bancário';
    const finalBankCode = bankCode || parsedResult.bankCode || '';

    let totalCredit = 0;
    let totalDebit = 0;
    let importedCount = 0;
    let skippedDuplicateCount = 0;

    const db = await getDatabase();

    // Check for duplicate transactions across the database using fitid + bank + date + amount
    // to allow uploading multi-month or full-year statements without duplicating records
    for (const tx of parsedResult.transactions) {
      // RULE 0: Never import daily/monthly balance lines (Saldo do dia, Saldo anterior, etc.)
      if (isBalanceLine(tx.description, tx.memo, tx.counterpartyName || '')) {
        continue;
      }

      // RULE 1: Only import credit transactions OR Pix returns (which can be debit)
      const isPixReturn = tx.isPixReturn;
      if (tx.type !== 'CREDIT' && !isPixReturn) {
        continue; // Skip non-credit non-pix-return transactions
      }

      if (tx.type === 'CREDIT') totalCredit += tx.amount;
      if (tx.type === 'DEBIT') totalDebit += tx.amount;

      // Duplicate prevention query (scoped by company_id)
      const existing = await queryOne(
        `SELECT id, status, driver_name FROM transactions 
         WHERE company_id = ? AND fitid = ? AND bank_name = ? AND date = ? AND amount = ?`,
        [companyId, tx.fitid, finalBankName, tx.date, tx.amount]
      );

      if (existing) {
        skippedDuplicateCount++;
        continue;
      }

      const isPix = tx.isPix;
      // isPixReturn already declared at line 449
      const initialStatus = isPixReturn ? 'RETURNED' : 'PENDING';
      const returnReason = isPixReturn ? 'Detectado automaticamente no extrato como devolução/estorno de Pix' : null;
      const txId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Ensure status is valid
      const status = ['PENDING', 'RECONCILED', 'IGNORED', 'RETURNED'].includes(initialStatus) 
        ? initialStatus 
        : 'PENDING';

      db.run(
        `INSERT INTO transactions (
          id, company_id, import_batch_id, bank_name, bank_code, fitid, date, type, amount, original_amount, returned_amount,
          description, memo, document_number, is_pix, is_pix_return, return_reason, status,
          counterparty_name, counterparty_doc, raw_data, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          txId,
          companyId,
          batchId,
          finalBankName,
          finalBankCode,
          tx.fitid,
          tx.date,
          tx.type,
          tx.amount,
          tx.amount, // original_amount
          0, // returned_amount
          tx.description,
          tx.memo,
          tx.documentNumber || null,
          isPix ? 1 : 0,
          isPixReturn ? 1 : 0,
          returnReason,
          status,
          tx.counterpartyName || null,
          tx.counterpartyDoc || null,
          tx.rawData || null,
          nowIso
        ]
      );
      importedCount++;
    }

    // Save batch record
    db.run(
      `INSERT INTO import_batches (
        id, company_id, filename, bank_name, bank_code, format, total_transactions, total_credit, total_debit,
        period_start, period_end, imported_by_user_id, imported_by_user_name, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchId,
        companyId,
        filename,
        finalBankName,
        finalBankCode,
        isOfx ? 'OFX' : 'CSV',
        importedCount,
        totalCredit,
        totalDebit,
        parsedResult.periodStart || null,
        parsedResult.periodEnd || null,
        actorUser.id,
        actorUser.name,
        nowIso
      ]
    );

    scheduleSaveDatabase();

    await logAudit(
      'STATEMENT_IMPORTED',
      'BATCH',
      batchId,
      actorUser,
      {
        filename,
        bank: finalBankName,
        importedCount,
        skippedDuplicateCount,
        totalCredit
      },
      companyId
    );

    // Notify all users in real-time
    broadcastEvent('STATEMENT_IMPORTED', {
      batchId,
      company_id: companyId,
      filename,
      importedCount,
      skippedDuplicateCount,
      bankName: finalBankName
    });

    res.json({
      success: true,
      batchId,
      importedCount,
      skippedDuplicateCount,
      totalTransactionsInFile: parsedResult.transactions.length,
      periodStart: parsedResult.periodStart,
      periodEnd: parsedResult.periodEnd,
      bankName: finalBankName
    });
  } catch (err: any) {
    console.error('Error importing statement:', err);
    res.status(500).json({ error: err.message || 'Erro ao processar arquivo de extrato.' });
  }
});

// Delete an entire imported batch and its transactions
app.delete('/api/statements/batches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { actorUser, force } = req.body || {};

    if (!actorUser || actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores têm permissão para excluir extratos importados.' });
    }

    const batch = await queryOne(`SELECT * FROM import_batches WHERE id = ?`, [id]);
    if (!batch) return res.status(404).json({ error: 'Lote de extrato não encontrado.' });

    const recCountRow = await queryOne(
      `SELECT COUNT(*) as count FROM transactions WHERE import_batch_id = ? AND status = 'RECONCILED'`,
      [id]
    );
    const recCount = recCountRow?.count || 0;

    if (recCount > 0 && !force) {
      return res.status(400).json({
        error: `Este lote possui ${recCount} transação(ões) já conciliada(s) e vinculada(s) a motoristas. Reabra as conciliações antes de excluir ou confirme a exclusão forçada.`,
        hasReconciled: true,
        reconciledCount: recCount
      });
    }

    // Delete all transactions from this batch
    await runSql(`DELETE FROM transactions WHERE import_batch_id = ?`, [id]);
    // Delete batch record
    await runSql(`DELETE FROM import_batches WHERE id = ?`, [id]);

    if (actorUser) {
      await logAudit('STATEMENT_DELETED', 'BATCH', id, actorUser, {
        filename: batch.filename,
        bankName: batch.bank_name,
        totalTransactions: batch.total_transactions
      });
    }

    broadcastEvent('STATEMENT_DELETED', { batchId: id, filename: batch.filename });
    res.json({ success: true, message: `Lote "${batch.filename}" e suas transações foram excluídos.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin-only: Update transaction details (e.g. counterparty name verified at bank, description, memo)
app.patch('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { counterparty_name, counterparty_doc, description, memo, actorUser } = req.body || {};

    if (!actorUser || actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores possuem permissão para alterar os dados da transação.' });
    }

    const tx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [id]);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada.' });

    const newCounterpartyName = counterparty_name !== undefined ? (counterparty_name ? counterparty_name.trim() : null) : tx.counterparty_name;
    const newCounterpartyDoc = counterparty_doc !== undefined ? (counterparty_doc ? counterparty_doc.trim() : null) : tx.counterparty_doc;
    const newDescription = description !== undefined ? (description ? description.trim() : tx.description) : tx.description;
    const newMemo = memo !== undefined ? (memo ? memo.trim() : null) : tx.memo;

    await runSql(
      `UPDATE transactions SET 
        counterparty_name = ?, 
        counterparty_doc = ?, 
        description = ?, 
        memo = ? 
       WHERE id = ?`,
      [newCounterpartyName, newCounterpartyDoc, newDescription, newMemo, id]
    );

    await logAudit('TRANSACTION_MANUALLY_EDITED', 'TRANSACTION', id, actorUser, {
      previous: {
        counterparty_name: tx.counterparty_name,
        counterparty_doc: tx.counterparty_doc,
        description: tx.description,
        memo: tx.memo
      },
      updated: {
        counterparty_name: newCounterpartyName,
        counterparty_doc: newCounterpartyDoc,
        description: newDescription,
        memo: newMemo
      }
    });

    const updatedTx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [id]);

    broadcastEvent('TRANSACTION_UPDATED', {
      transactionId: id,
      counterparty_name: newCounterpartyName,
      counterparty_doc: newCounterpartyDoc,
      description: newDescription,
      memo: newMemo
    });

    res.json({
      success: true,
      message: 'Dados do lançamento atualizados com sucesso!',
      transaction: updatedTx
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an individual transaction
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { actorUser } = req.body || {};

    if (!actorUser || actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores têm permissão para excluir lançamentos do extrato.' });
    }

    const tx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [id]);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada.' });

    if (tx.status === 'RECONCILED') {
      return res.status(400).json({
        error: `A transação já está conciliada para o motorista "${tx.driver_name}". Reabra a conciliação antes de excluí-la.`
      });
    }

    await runSql(`DELETE FROM transactions WHERE id = ?`, [id]);

    if (actorUser) {
      await logAudit('TRANSACTION_DELETED', 'TRANSACTION', id, actorUser, {
        description: tx.description,
        amount: tx.amount,
        date: tx.date,
        bank: tx.bank_name
      });
    }

    broadcastEvent('TRANSACTION_DELETED', { transactionId: id });
    res.json({ success: true, message: 'Lançamento excluído com sucesso do extrato.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete multiple transactions
app.post('/api/transactions/delete-many', async (req, res) => {
  try {
    const { ids, actorUser } = req.body || {};

    if (!actorUser || actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores têm permissão para excluir lançamentos.' });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Informe os IDs das transações para exclusão.' });
    }

    const db = await getDatabase();
    
    // Check for reconciled transactions
    const placeholders = ids.map(() => '?').join(',');
    const reconciled = await queryAll(
      `SELECT id, description FROM transactions WHERE id IN (${placeholders}) AND status = 'RECONCILED'`,
      ids
    );

    if (reconciled.length > 0) {
      return res.status(400).json({
        error: `Não é possível excluir, pois as seguintes transações já estão conciliadas: ${reconciled.map(t => t.description).join(', ')}`
      });
    }

    db.run('BEGIN TRANSACTION');
    try {
      const deleteStmt = db.prepare(`DELETE FROM transactions WHERE id = ?`);
      for (const id of ids) {
        deleteStmt.run([id]);
      }
      deleteStmt.free();
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }

    await logAudit('TRANSACTIONS_DELETED', 'TRANSACTION', ids.join(','), actorUser, { count: ids.length });
    broadcastEvent('TRANSACTION_DELETED', { count: ids.length });

    res.json({ success: true, message: `${ids.length} lançamentos excluídos com sucesso.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle non-reconciliation status: IGNORED (e.g. depósito em agência, lançamento interno)
app.post('/api/transactions/:id/ignore', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, actorUser } = req.body || {};

    if (!actorUser || actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores têm permissão para desconsiderar ou reativar lançamentos.' });
    }

    const tx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [id]);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada.' });

    if (tx.status === 'RECONCILED') {
      return res.status(400).json({ error: 'Transações já conciliadas não podem ser marcadas como ignoradas.' });
    }

    const newStatus = tx.status === 'IGNORED' ? 'PENDING' : 'IGNORED';
    const noteText = newStatus === 'IGNORED'
      ? `Desconsiderado por ${actorUser?.name || 'Administrador'}: ${reason || 'Não aplicável ao acerto de motoristas (ex: depósito bancário em agência)'}`
      : null;

    await runSql(`UPDATE transactions SET status = ?, notes = ? WHERE id = ?`, [newStatus, noteText, id]);

    if (actorUser) {
      await logAudit('TRANSACTION_IGNORED_TOGGLED', 'TRANSACTION', id, actorUser, {
        newStatus,
        reason,
        description: tx.description
      });
    }

    broadcastEvent('TRANSACTION_UPDATED', { transactionId: id, status: newStatus });
    res.json({
      success: true,
      newStatus,
      message: newStatus === 'IGNORED'
        ? 'Lançamento desconsiderado do acerto de motoristas com sucesso.'
        : 'Lançamento reativado para conciliação.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mark / Unmark as Pix Return (Devolução de Pix / Estorno ao Cliente - Total ou Parcial)
app.post('/api/transactions/:id/mark-return', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, isPartial, returnedAmount, actorUser } = req.body || {};

    const tx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [id]);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada.' });

    if (tx.status === 'RECONCILED') {
      return res.status(400).json({ error: 'Esta transação já foi conciliada. É necessário reabri-la antes de alterá-la.' });
    }

    const origAmount = tx.original_amount !== null && tx.original_amount !== undefined ? Number(tx.original_amount) : Number(tx.amount);
    const isCurrentlyReturned = tx.status === 'RETURNED' || (tx.returned_amount && tx.returned_amount > 0);

    // If restoring back to normal without return
    if (req.body && req.body.action === 'RESTORE') {
      await runSql(
        `UPDATE transactions SET status = 'PENDING', is_pix_return = 0, returned_amount = 0, amount = ?, return_reason = NULL WHERE id = ?`,
        [origAmount, id]
      );
      if (actorUser) {
        await logAudit('TRANSACTION_PIX_RETURN_RESTORED', 'TRANSACTION', id, actorUser, { origAmount });
      }
      broadcastEvent('TRANSACTION_UPDATED', { transactionId: id, status: 'PENDING', is_pix_return: 0, amount: origAmount, returned_amount: 0 });
      return res.json({ success: true, message: 'Lançamento restaurado ao valor original integral.' });
    }

    // Partial refund flow
    if (isPartial && returnedAmount && Number(returnedAmount) > 0 && Number(returnedAmount) < origAmount) {
      const refund = Number(returnedAmount);
      const newNet = origAmount - refund;
      const note = reason || `Devolução parcial de R$ ${refund.toFixed(2)} ao cliente (Valor original: R$ ${origAmount.toFixed(2)})`;

      await runSql(
        `UPDATE transactions SET 
          status = 'PENDING', 
          is_pix_return = 0, 
          original_amount = ?, 
          returned_amount = ?, 
          amount = ?, 
          return_reason = ? 
         WHERE id = ?`,
        [origAmount, refund, newNet, note, id]
      );

      if (actorUser) {
        await logAudit('TRANSACTION_PIX_PARTIAL_RETURN', 'TRANSACTION', id, actorUser, {
          origAmount,
          returnedAmount: refund,
          newNet,
          reason: note
        });
      }

      broadcastEvent('TRANSACTION_UPDATED', {
        transactionId: id,
        status: 'PENDING',
        is_pix_return: 0,
        original_amount: origAmount,
        returned_amount: refund,
        amount: newNet
      });

      return res.json({
        success: true,
        isPartial: true,
        originalAmount: origAmount,
        returnedAmount: refund,
        netAmount: newNet,
        message: `Devolução parcial de R$ ${refund.toFixed(2)} registrada! O saldo disponível para conciliação foi ajustado para R$ ${newNet.toFixed(2)}.`
      });
    }

    // Total refund / Toggle flow
    const willBeReturned = !(tx.status === 'RETURNED');
    const newStatus = willBeReturned ? 'RETURNED' : 'PENDING';
    const isPixReturn = willBeReturned ? 1 : 0;
    const finalAmount = willBeReturned ? origAmount : origAmount;
    const finalReturnedAmount = willBeReturned ? origAmount : 0;
    const returnReason = willBeReturned
      ? (reason || 'Marcado pelo operador como Devolução Total de Pix (estornado ao cliente)')
      : null;

    await runSql(
      `UPDATE transactions SET 
        status = ?, 
        is_pix_return = ?, 
        original_amount = ?, 
        returned_amount = ?, 
        amount = ?, 
        return_reason = ? 
       WHERE id = ?`,
      [newStatus, isPixReturn, origAmount, finalReturnedAmount, finalAmount, returnReason, id]
    );

    if (actorUser) {
      await logAudit('TRANSACTION_PIX_RETURN_TOGGLED', 'TRANSACTION', id, actorUser, {
        newStatus,
        returnReason,
        description: tx.description
      });
    }

    broadcastEvent('TRANSACTION_UPDATED', {
      transactionId: id,
      status: newStatus,
      is_pix_return: isPixReturn,
      original_amount: origAmount,
      returned_amount: finalReturnedAmount,
      amount: finalAmount
    });

    res.json({
      success: true,
      newStatus,
      isPixReturn,
      message: willBeReturned
        ? 'Transação bloqueada permanentemente como Devolução Total de Pix.'
        : 'Status de devolução removido; transação voltou para pendente.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Link a DEBIT (saída de devolução) to a CREDIT (entrada de Pix recebido) - Total ou Parcial
app.post('/api/transactions/link-return', async (req, res) => {
  try {
    const { debitTxId, creditTxId, returnedAmount, reason, actorUser } = req.body;
    if (!debitTxId || !creditTxId) {
      return res.status(400).json({ error: 'Informe o débito (saída de devolução) e a entrada (crédito) correspondente.' });
    }

    const debitTx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [debitTxId]);
    if (!debitTx) return res.status(404).json({ error: 'Lançamento de saída (débito) não encontrado.' });

    const creditTx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [creditTxId]);
    if (!creditTx) return res.status(404).json({ error: 'Lançamento de entrada (crédito) não encontrado.' });

    if (creditTx.status === 'RECONCILED') {
      return res.status(400).json({
        error: `A entrada já está conciliada para o motorista "${creditTx.driver_name}". Reabra a conciliação antes de vinculá-la como devolução.`
      });
    }

    const origAmount = creditTx.original_amount !== null && creditTx.original_amount !== undefined ? Number(creditTx.original_amount) : Number(creditTx.amount);
    const refundValue = returnedAmount ? Number(returnedAmount) : Number(debitTx.amount);
    const nowIso = new Date().toISOString();

    const isPartial = refundValue < origAmount;
    let newCreditStatus = 'RETURNED';
    let newCreditAmount = origAmount;
    let newCreditReturned = origAmount;
    let isPixReturnFlag = 1;
    let returnReason = '';

    if (isPartial) {
      const newNetAmount = origAmount - refundValue;
      newCreditStatus = 'PENDING'; // Still available for driver reconciliation!
      newCreditAmount = newNetAmount;
      newCreditReturned = refundValue;
      isPixReturnFlag = 0;
      returnReason = reason || `Devolução parcial de R$ ${refundValue.toFixed(2)} vinculada à Saída de R$ ${debitTx.amount.toFixed(2)} em ${debitTx.date}. Saldo líquido disponível: R$ ${newNetAmount.toFixed(2)}.`;
    } else {
      // Total return
      newCreditStatus = 'RETURNED';
      newCreditAmount = origAmount;
      newCreditReturned = origAmount;
      isPixReturnFlag = 1;
      returnReason = reason || `Devolução total vinculada à Saída de R$ ${debitTx.amount.toFixed(2)} em ${debitTx.date} (${debitTx.description})`;
    }

    // Update credit transaction
    await runSql(
      `UPDATE transactions SET 
        status = ?, 
        is_pix_return = ?, 
        original_amount = ?, 
        returned_amount = ?, 
        amount = ?, 
        return_reason = ?, 
        linked_tx_id = ?, 
        locked_at = ? 
       WHERE id = ?`,
      [newCreditStatus, isPixReturnFlag, origAmount, newCreditReturned, newCreditAmount, returnReason, debitTx.id, isPartial ? null : nowIso, creditTx.id]
    );

    // Mark the debit transaction as processed / matched to this return
    await runSql(
      `UPDATE transactions SET 
        status = 'RECONCILED', 
        linked_tx_id = ?, 
        notes = ? 
       WHERE id = ?`,
      [creditTx.id, `Estorno vinculado à Entrada #${creditTx.id} (Original: R$ ${origAmount.toFixed(2)}, Devolvido: R$ ${refundValue.toFixed(2)})`, debitTx.id]
    );

    if (actorUser) {
      await logAudit('PIX_RETURN_LINKED', 'TRANSACTION', creditTx.id, actorUser, {
        creditTxId: creditTx.id,
        origAmount,
        refundValue,
        isPartial,
        newCreditAmount,
        debitTxId: debitTx.id,
        reason: returnReason
      });
    }

    broadcastEvent('TRANSACTION_UPDATED', {
      transactionId: creditTx.id,
      status: newCreditStatus,
      is_pix_return: isPixReturnFlag,
      original_amount: origAmount,
      returned_amount: newCreditReturned,
      amount: newCreditAmount,
      linked_tx_id: debitTx.id
    });

    broadcastEvent('TRANSACTION_UPDATED', {
      transactionId: debitTx.id,
      status: 'RECONCILED',
      linked_tx_id: creditTx.id
    });

    res.json({
      success: true,
      isPartial,
      originalAmount: origAmount,
      returnedAmount: refundValue,
      netAmount: newCreditAmount,
      message: isPartial
        ? `Devolução parcial vinculada! A entrada de R$ ${origAmount.toFixed(2)} teve R$ ${refundValue.toFixed(2)} devolvido e seu saldo a conciliar agora é R$ ${newCreditAmount.toFixed(2)}.`
        : `Devolução total vinculada com sucesso! A entrada de R$ ${origAmount.toFixed(2)} foi bloqueada permanentemente para conciliação.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Unlink a return connection (desvincular saída da entrada)
app.post('/api/transactions/unlink-return', async (req, res) => {
  try {
    const { transactionId, actorUser } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'ID da transação obrigatório.' });

    const tx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [transactionId]);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada.' });

    const linkedId = tx.linked_tx_id;
    if (!linkedId) {
      return res.status(400).json({ error: 'Esta transação não possui um estorno/devolução vinculado.' });
    }

    const linkedTx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [linkedId]);

    const origTxAmount = tx.original_amount !== null && tx.original_amount !== undefined ? Number(tx.original_amount) : Number(tx.amount);

    // Unlink and reset status
    await runSql(
      `UPDATE transactions SET 
        status = 'PENDING', 
        is_pix_return = 0, 
        original_amount = ?, 
        returned_amount = 0, 
        amount = ?, 
        return_reason = null, 
        linked_tx_id = null, 
        locked_at = null 
       WHERE id = ?`,
      [origTxAmount, origTxAmount, tx.id]
    );

    if (linkedTx) {
      const origLinkedAmount = linkedTx.original_amount !== null && linkedTx.original_amount !== undefined ? Number(linkedTx.original_amount) : Number(linkedTx.amount);
      await runSql(
        `UPDATE transactions SET 
          status = 'PENDING', 
          is_pix_return = 0, 
          original_amount = ?, 
          returned_amount = 0, 
          amount = ?, 
          return_reason = null, 
          linked_tx_id = null, 
          notes = null, 
          locked_at = null 
         WHERE id = ?`,
        [origLinkedAmount, origLinkedAmount, linkedTx.id]
      );
    }

    if (actorUser) {
      await logAudit('PIX_RETURN_UNLINKED', 'TRANSACTION', tx.id, actorUser, {
        txId: tx.id,
        linkedId
      });
    }

    broadcastEvent('TRANSACTION_UPDATED', { transactionId: tx.id, status: 'PENDING', linked_tx_id: null, amount: origTxAmount, returned_amount: 0 });
    if (linkedTx) {
      broadcastEvent('TRANSACTION_UPDATED', { transactionId: linkedTx.id, status: 'PENDING', linked_tx_id: null, amount: linkedTx.original_amount || linkedTx.amount, returned_amount: 0 });
    }

    res.json({ success: true, message: 'Vínculo de devolução desfeito com sucesso. O lançamento foi restaurado ao valor original.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Find candidates for matching return (credit transactions that could match a debit)
app.get('/api/transactions/return-candidates/:debitId', async (req, res) => {
  try {
    const { debitId } = req.params;
    const { q, start_date, end_date, bank, status_filter, mode, limit } = req.query as Record<string, string>;

    const debitTx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [debitId]);
    if (!debitTx) return res.status(404).json({ error: 'Débito não encontrado.' });

    const companyId = debitTx.company_id || getCompanyId(req);

    // If searching across whole statement (mode === 'search' or any filter supplied)
    if (mode === 'search' || q || start_date || end_date || bank || status_filter) {
      const whereClauses: string[] = [
        "company_id = ?",
        "type = 'CREDIT'",
        "id != ?"
      ];
      const params: any[] = [companyId, debitId];

      if (status_filter && status_filter !== 'ALL') {
        whereClauses.push("status = ?");
        params.push(status_filter);
      } else if (!status_filter) {
        // Default to PENDING, or whatever is already linked
        whereClauses.push("(status = 'PENDING' OR id = ?)");
        params.push(debitTx.linked_tx_id || '');
      }

      if (bank && bank !== 'ALL') {
        whereClauses.push("bank_name = ?");
        params.push(bank);
      }

      if (start_date && start_date.trim() !== '') {
        whereClauses.push("date >= ?");
        params.push(start_date.trim());
      }

      if (end_date && end_date.trim() !== '') {
        whereClauses.push("date <= ?");
        params.push(end_date.trim());
      }

      if (q && q.trim() !== '') {
        const rawQ = q.trim();
        const cleanNum = rawQ.replace(/^r\$\s*/i, '').replace(/\./g, '').replace(',', '.').trim();
        const parsedNum = parseFloat(cleanNum);
        const searchPattern = `%${rawQ}%`;

        if (!isNaN(parsedNum) && parsedNum > 0) {
          whereClauses.push(
            `(counterparty_name LIKE ? OR counterparty_doc LIKE ? OR description LIKE ? OR memo LIKE ? OR document_number LIKE ? OR fitid LIKE ? OR id LIKE ? OR ABS(amount - ?) < 0.01 OR ABS(COALESCE(original_amount, amount) - ?) < 0.01)`
          );
          params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, parsedNum, parsedNum);
        } else {
          whereClauses.push(
            `(counterparty_name LIKE ? OR counterparty_doc LIKE ? OR description LIKE ? OR memo LIKE ? OR document_number LIKE ? OR fitid LIKE ? OR id LIKE ?)`
          );
          params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }
      }

      const maxLimit = Math.min(250, parseInt(limit, 10) || 100);
      const candidates = await queryAll(
        `SELECT * FROM transactions 
         WHERE ${whereClauses.join(' AND ')}
         ORDER BY 
           CASE WHEN amount = ? THEN 0 ELSE 1 END,
           date DESC
         LIMIT ?`,
        [...params, debitTx.amount, maxLimit]
      );

      return res.json({
        debitTx,
        candidates,
        isSearch: true
      });
    }

    // Default 'suggested' candidates mode:
    let namePattern = '';
    if (debitTx.counterparty_name && debitTx.counterparty_name.trim().length > 3) {
      namePattern = `%${debitTx.counterparty_name.trim()}%`;
    }

    const candidates = await queryAll(
      `SELECT * FROM transactions 
       WHERE company_id = ? AND type = 'CREDIT' AND (status = 'PENDING' OR id = ?)
       ORDER BY 
         CASE WHEN amount = ? THEN 0 ELSE 1 END,
         CASE WHEN ? != '' AND (counterparty_name LIKE ? OR description LIKE ?) THEN 0 ELSE 1 END,
         ABS(JULIANDAY(date) - JULIANDAY(?)) ASC,
         date DESC
       LIMIT 50`,
      [companyId, debitTx.linked_tx_id || '', debitTx.amount, namePattern, namePattern, namePattern, debitTx.date]
    );

    res.json({
      debitTx,
      candidates,
      isSearch: false
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/statements/batches', async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const batches = await queryAll(
      `
      SELECT b.*,
             COUNT(t.id) as current_transaction_count,
             COUNT(CASE WHEN t.status = 'RECONCILED' THEN t.id END) as reconciled_count,
             COUNT(CASE WHEN t.status = 'PENDING' THEN t.id END) as pending_count
      FROM import_batches b
      LEFT JOIN transactions t ON t.import_batch_id = b.id
      WHERE b.company_id = ?
      GROUP BY b.id
      ORDER BY b.imported_at DESC
    `,
      [companyId]
    );
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function parseSearchAmounts(query: string): number[] {
  const cleaned = query.trim().replace(/^R\$\s*/i, '').trim();
  const amounts: number[] = [];

  const addVal = (v: number) => {
    if (!isNaN(v) && v > 0 && !amounts.some(a => Math.abs(a - v) < 0.001)) {
      amounts.push(v);
    }
  };

  // 1. Brazilian formatted: e.g. "1.000,00" or "10.500,50"
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(cleaned)) {
    addVal(parseFloat(cleaned.replace(/\./g, '').replace(',', '.')));
  }

  // 2. Comma decimal: e.g. "1000,00" or "800,00" or "250,5"
  if (/^\d+,\d{1,2}$/.test(cleaned)) {
    addVal(parseFloat(cleaned.replace(',', '.')));
  }

  // 3. Dot thousand separator: e.g. "1.000" or "10.000"
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    addVal(parseFloat(cleaned.replace(/\./g, '')));
  }

  // 4. Dot decimal: e.g. "1000.00" or "800.00" or "250.5"
  if (/^\d+\.\d{1,2}$/.test(cleaned)) {
    addVal(parseFloat(cleaned));
  }

  // 5. Plain integer: e.g. "1000" or "800"
  if (/^\d+$/.test(cleaned)) {
    addVal(parseFloat(cleaned));
  }

  return amounts;
}

// -------------------------------------------------------------
// Transactions Queries (Optimized for large 1-year data)
// -------------------------------------------------------------
app.get('/api/transactions', async (req, res) => {
  try {
    const {
      status, // 'ALL' | 'PENDING' | 'RECONCILED'
      bank,
      driver_id,
      batch_id,
      is_pix,
      is_pix_return,
      unidentified_payer,
      search,
      start_date,
      end_date,
      min_amount,
      max_amount,
      type, // 'CREDIT' | 'DEBIT' | 'ALL' | 'DEBIT_RETURN'
      order_by = 'DATE_DESC', // 'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC'
      page = '1',
      limit = '100'
    } = req.query as Record<string, string>;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    const companyId = req.query.company_id ? String(req.query.company_id).trim().toLowerCase() : getCompanyId(req);
    if (companyId && companyId !== 'ALL') {
      conditions.push('company_id = ?');
      params.push(companyId);
    }

    if (status && status !== 'ALL') {
      conditions.push('status = ?');
      params.push(status);
    }

    if (bank && bank !== 'ALL') {
      conditions.push('bank_name = ?');
      params.push(bank);
    }

    if (batch_id && batch_id !== 'ALL') {
      conditions.push('import_batch_id = ?');
      params.push(batch_id);
    }

    if (driver_id && driver_id !== 'ALL') {
      conditions.push('driver_id = ?');
      params.push(driver_id);
    }

    if (is_pix === 'true' || is_pix === '1') {
      conditions.push('is_pix = 1');
    }

    if (is_pix_return === 'true' || is_pix_return === '1') {
      conditions.push('is_pix_return = 1');
    }

    if (unidentified_payer === 'true' || unidentified_payer === '1') {
      conditions.push("(counterparty_name IS NULL OR TRIM(counterparty_name) = '')");
    }

    if (type && type !== 'ALL') {
      if (type === 'DEBIT_RETURN') {
        conditions.push("type = 'DEBIT' AND is_pix_return = 1");
      } else {
        conditions.push('type = ?');
        params.push(type);
      }
    }

    if (start_date) {
      conditions.push('date >= ?');
      params.push(start_date);
    }

    if (end_date) {
      conditions.push('date <= ?');
      params.push(end_date);
    }

    if (min_amount) {
      conditions.push('amount >= ?');
      params.push(parseFloat(min_amount));
    }

    if (max_amount) {
      conditions.push('amount <= ?');
      params.push(parseFloat(max_amount));
    }

    if (search && search.trim()) {
      const trimmed = search.trim();
      const q = `%${trimmed.toUpperCase()}%`;
      const numVals = parseSearchAmounts(trimmed);

      const searchOrClauses = [
        'UPPER(description) LIKE ?',
        'UPPER(memo) LIKE ?',
        'UPPER(counterparty_name) LIKE ?',
        'UPPER(counterparty_doc) LIKE ?',
        'UPPER(document_number) LIKE ?',
        'UPPER(fitid) LIKE ?',
        'UPPER(driver_name) LIKE ?',
        'UPPER(voucher_number) LIKE ?',
        'CAST(amount AS TEXT) LIKE ?',
        'CAST(COALESCE(original_amount, amount) AS TEXT) LIKE ?',
        'REPLACE(PRINTF("%.2f", amount), ".", ",") LIKE ?'
      ];
      const searchBindings: any[] = [q, q, q, q, q, q, q, q, q, q, q];

      for (const num of numVals) {
        searchOrClauses.push('ABS(amount - ?) < 0.01');
        searchBindings.push(num);
        searchOrClauses.push('ABS(COALESCE(original_amount, amount) - ?) < 0.01');
        searchBindings.push(num);
        searchOrClauses.push('ABS(COALESCE(returned_amount, 0) - ?) < 0.01');
        searchBindings.push(num);
      }

      conditions.push(`(${searchOrClauses.join(' OR ')})`);
      params.push(...searchBindings);
    }

    const whereClause = conditions.join(' AND ');

    // Get aggregated statistics
    const statsSql = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount), 0) as total_sum,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) as pending_sum,
        COUNT(CASE WHEN status = 'RECONCILED' THEN 1 END) as reconciled_count,
        COALESCE(SUM(CASE WHEN status = 'RECONCILED' THEN amount ELSE 0 END), 0) as reconciled_sum,
        COUNT(CASE WHEN is_pix = 1 THEN 1 END) as pix_count,
        COALESCE(SUM(CASE WHEN is_pix = 1 THEN amount ELSE 0 END), 0) as pix_sum,
        COUNT(CASE WHEN status = 'RETURNED' OR is_pix_return = 1 THEN 1 END) as returned_count,
        COALESCE(SUM(CASE WHEN status = 'RETURNED' OR is_pix_return = 1 THEN amount ELSE 0 END), 0) as returned_sum,
        COUNT(CASE WHEN status = 'IGNORED' THEN 1 END) as ignored_count,
        COALESCE(SUM(CASE WHEN status = 'IGNORED' THEN amount ELSE 0 END), 0) as ignored_sum,
        COUNT(CASE WHEN (counterparty_name IS NULL OR TRIM(counterparty_name) = '') THEN 1 END) as unidentified_payer_count
      FROM transactions
      WHERE ${whereClause}
    `;
    const stats = await queryOne(statsSql, params);

    // Get paginated results
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageLimit = Math.min(500, Math.max(10, parseInt(limit, 10)));
    const offset = (pageNum - 1) * pageLimit;

    let orderBySql = 'ORDER BY date DESC, created_at DESC';
    if (order_by === 'DATE_ASC') {
      orderBySql = 'ORDER BY date ASC, created_at ASC';
    } else if (order_by === 'AMOUNT_DESC') {
      orderBySql = 'ORDER BY amount DESC, date DESC';
    } else if (order_by === 'AMOUNT_ASC') {
      orderBySql = 'ORDER BY amount ASC, date DESC';
    }

    const listSql = `
      SELECT * FROM transactions
      WHERE ${whereClause}
      ${orderBySql}
      LIMIT ${pageLimit} OFFSET ${offset}
    `;
    const transactions = await queryAll(listSql, params);

    res.json({
      transactions,
      stats: stats || {},
      pagination: {
        page: pageNum,
        limit: pageLimit,
        totalItems: stats?.total_count || 0,
        totalPages: Math.ceil((stats?.total_count || 0) / pageLimit)
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Reconciliation Session & Locking Endpoints (CRITICAL BUSINESS RULES)
// -------------------------------------------------------------

// Start or check active driver reconciliation session
app.post('/api/reconciliation/start-session', async (req, res) => {
  try {
    const { driver_id, notes, actorUser } = req.body;
    const companyId = req.body.company_id || getCompanyId(req);

    if (!driver_id) {
      return res.status(400).json({ error: 'O motorista deve ser informado para iniciar a conciliação.' });
    }
    if (!actorUser) {
      return res.status(401).json({ error: 'Operador não identificado.' });
    }

    const driver = await queryOne(`SELECT * FROM drivers WHERE id = ? AND company_id = ?`, [driver_id, companyId]);
    if (!driver) {
      return res.status(404).json({ error: 'Motorista não encontrado no cadastro desta empresa.' });
    }

    const sessionId = `sess-${Date.now()}`;
    const nowIso = new Date().toISOString();

    await runSql(
      `INSERT INTO reconciliation_sessions (
        id, company_id, driver_id, driver_name, driver_plate, operator_user_id, operator_user_name,
        status, started_at, total_items, total_amount, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, 0, 0, ?)`,
      [
        sessionId,
        companyId,
        driver.id,
        driver.name,
        driver.vehicle_plate,
        actorUser.id,
        actorUser.name,
        nowIso,
        notes || null
      ]
    );

    await logAudit('SESSION_STARTED', 'SESSION', sessionId, actorUser, {
      driver: driver.name,
      plate: driver.vehicle_plate
    }, companyId);

    const session = await queryOne(`SELECT * FROM reconciliation_sessions WHERE id = ?`, [sessionId]);

    broadcastEvent('RECONCILIATION_SESSION_STARTED', { session, company_id: companyId });
    res.status(201).json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Complete and Lock Reconciliation (Atomically link Pix to Driver)
// Enforces: "não aceitando mais que aquela transação seja selecionada"
app.post('/api/reconciliation/finish-session', async (req, res) => {
  try {
    const {
      session_id,
      driver_id,
      transaction_ids,
      voucher_numbers, // map of txId -> voucher
      general_voucher,
      notes,
      missing_amount,
      actorUser
    } = req.body;
    const companyId = req.body.company_id || getCompanyId(req);
    const missingAmountVal = Math.max(0, parseFloat(missing_amount) || 0);

    if (!driver_id || !Array.isArray(transaction_ids)) {
      return res.status(400).json({ error: 'Dados da sessão inválidos.' });
    }

    if (!actorUser) {
      return res.status(401).json({ error: 'Operador não autenticado.' });
    }

    const driver = await queryOne(`SELECT * FROM drivers WHERE id = ? AND company_id = ?`, [driver_id, companyId]);
    if (!driver) {
      return res.status(404).json({ error: 'Motorista não encontrado nesta empresa.' });
    }

    const db = await getDatabase();
    const nowIso = new Date().toISOString();

    // 1. ATOMIC VALIDATION: Check if ANY selected transaction is ALREADY reconciled!
    const placeholders = transaction_ids.map(() => '?').join(',');
    const checkStmt = db.prepare(
      `SELECT id, status, reconciled_by_user_name, driver_name, amount, description, date 
       FROM transactions WHERE id IN (${placeholders}) AND company_id = ?`
    );
    checkStmt.bind([...transaction_ids, companyId]);
    const existingSelected: any[] = [];
    while (checkStmt.step()) {
      existingSelected.push(checkStmt.getAsObject());
    }
    checkStmt.free();

    const alreadyReconciled = existingSelected.filter((t) => t.status === 'RECONCILED');
    if (alreadyReconciled.length > 0) {
      const conflict = alreadyReconciled[0];
      return res.status(409).json({
        error: `A transação "${conflict.description}" (R$ ${Number(conflict.amount).toFixed(2)}) de ${conflict.date} já foi conferida e conciliada por "${conflict.reconciled_by_user_name}" para o motorista "${conflict.driver_name}". Esta transação está bloqueada e não pode mais ser selecionada!`,
        conflictTx: conflict
      });
    }

    // Check if any selected transaction is a RETURNED Pix or IGNORED
    const returnedOrIgnored = existingSelected.filter(
      (t) => t.status === 'RETURNED' || t.is_pix_return === 1 || t.status === 'IGNORED'
    );
    if (returnedOrIgnored.length > 0) {
      const badTx = returnedOrIgnored[0];
      const isRet = badTx.status === 'RETURNED' || badTx.is_pix_return === 1;
      return res.status(409).json({
        error: isRet
          ? `A transação "${badTx.description}" (R$ ${Number(badTx.amount).toFixed(2)}) é uma DEVOLUÇÃO/ESTORNO de Pix devolvido ao cliente e está bloqueada para conciliação!`
          : `A transação "${badTx.description}" (R$ ${Number(badTx.amount).toFixed(2)}) foi desconsiderada da prestação de contas e não pode ser conciliada!`,
        conflictTx: badTx
      });
    }

    // 2. Perform atomic reconciliation & lock
    let totalSum = 0;
    const finalSessionId = session_id || `sess-${Date.now()}`;

    for (const tx of existingSelected) {
      totalSum += Number(tx.amount);
      const voucher = (voucher_numbers && voucher_numbers[tx.id]) || general_voucher || null;

      db.run(
        `UPDATE transactions SET
          status = 'RECONCILED',
          reconciled_at = ?,
          reconciled_by_user_id = ?,
          reconciled_by_user_name = ?,
          driver_id = ?,
          driver_name = ?,
          driver_plate = ?,
          session_id = ?,
          voucher_number = ?,
          notes = ?,
          locked_at = ?
         WHERE id = ? AND status = 'PENDING' AND company_id = ?`,
        [
          nowIso,
          actorUser.id,
          actorUser.name,
          driver.id,
          driver.name,
          driver.vehicle_plate,
          finalSessionId,
          voucher,
          notes || null,
          nowIso,
          tx.id,
          companyId
        ]
      );
    }

    // 3. Upsert session record
    const existingSession = await queryOne(`SELECT id FROM reconciliation_sessions WHERE id = ? AND company_id = ?`, [finalSessionId, companyId]);
    if (existingSession) {
      db.run(
        `UPDATE reconciliation_sessions SET
          status = 'COMPLETED',
          completed_at = ?,
          total_items = ?,
          total_amount = ?,
          missing_amount = ?,
          notes = ?
         WHERE id = ?`,
        [nowIso, existingSelected.length, totalSum, missingAmountVal, notes || null, finalSessionId]
      );
    } else {
      db.run(
        `INSERT INTO reconciliation_sessions (
          id, company_id, driver_id, driver_name, driver_plate, operator_user_id, operator_user_name,
          status, started_at, completed_at, total_items, total_amount, missing_amount, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
        [
          finalSessionId,
          companyId,
          driver.id,
          driver.name,
          driver.vehicle_plate,
          actorUser.id,
          actorUser.name,
          nowIso,
          nowIso,
          existingSelected.length,
          totalSum,
          missingAmountVal,
          notes || null
        ]
      );
    }

    scheduleSaveDatabase();

    await logAudit('RECONCILIATION_COMPLETED', 'SESSION', finalSessionId, actorUser, {
      driver: driver.name,
      plate: driver.vehicle_plate,
      itemCount: existingSelected.length,
      totalAmount: totalSum,
      missingAmount: missingAmountVal,
      transactionIds: transaction_ids
    }, companyId);

    // 4. Real-time broadcast to all users
    broadcastEvent('RECONCILIATION_COMPLETED', {
      sessionId: finalSessionId,
      company_id: companyId,
      driverName: driver.name,
      driverPlate: driver.vehicle_plate,
      operatorName: actorUser.name,
      itemCount: existingSelected.length,
      totalAmount: totalSum,
      missingAmount: missingAmountVal,
      transactionIds: transaction_ids
    });

    res.json({
      success: true,
      sessionId: finalSessionId,
      driverName: driver.name,
      itemCount: existingSelected.length,
      totalAmount: totalSum,
      missingAmount: missingAmountVal,
      completedAt: nowIso
    });
  } catch (err: any) {
    console.error('Error completing reconciliation:', err);
    res.status(500).json({ error: err.message || 'Erro ao finalizar conciliação.' });
  }
});

// Admin-only: Reopen/unlock a transaction in case of audited correction
app.post('/api/reconciliation/reopen', async (req, res) => {
  try {
    const { transaction_id, reason, actorUser } = req.body;
    if (!transaction_id) return res.status(400).json({ error: 'ID da transação não fornecido.' });
    if (!actorUser || actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores possuem permissão para reabrir conciliações.' });
    }

    const tx = await queryOne(`SELECT * FROM transactions WHERE id = ?`, [transaction_id]);
    if (!tx) return res.status(404).json({ error: 'Transação não encontrada.' });
    if (tx.status !== 'RECONCILED') {
      return res.status(400).json({ error: 'A transação não está em estado conciliado.' });
    }

    const companyId = tx.company_id || 'matriz';

    await runSql(
      `UPDATE transactions SET 
        status = 'PENDING',
        reconciled_at = NULL,
        reconciled_by_user_id = NULL,
        reconciled_by_user_name = NULL,
        driver_id = NULL,
        driver_name = NULL,
        driver_plate = NULL,
        session_id = NULL,
        voucher_number = NULL,
        notes = ?,
        locked_at = NULL
       WHERE id = ?`,
      [`Reaberto por ${actorUser.name}: ${reason || 'Sem justificativa'}`, transaction_id]
    );

    await logAudit('RECONCILIATION_REOPENED', 'TRANSACTION', transaction_id, actorUser, {
      previousDriver: tx.driver_name,
      previousOperator: tx.reconciled_by_user_name,
      amount: tx.amount,
      reason
    }, companyId);

    broadcastEvent('TRANSACTION_REOPENED', { transactionId: transaction_id, reopenedBy: actorUser.name, company_id: companyId });
    res.json({ success: true, message: 'Transação desbloqueada com sucesso para nova conciliação.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List sessions history
app.get('/api/reconciliation/sessions', async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { driver_id, start_date, end_date, search } = req.query;

    const whereClauses: string[] = ['company_id = ?'];
    const params: any[] = [companyId];

    if (driver_id && driver_id !== 'ALL') {
      whereClauses.push('driver_id = ?');
      params.push(driver_id);
    }

    if (start_date && typeof start_date === 'string' && start_date.trim() !== '') {
      whereClauses.push('date(COALESCE(completed_at, started_at)) >= date(?)');
      params.push(start_date.trim());
    }

    if (end_date && typeof end_date === 'string' && end_date.trim() !== '') {
      whereClauses.push('date(COALESCE(completed_at, started_at)) <= date(?)');
      params.push(end_date.trim());
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = `%${search.trim()}%`;
      whereClauses.push('(driver_name LIKE ? OR driver_plate LIKE ? OR operator_user_name LIKE ? OR notes LIKE ? OR id LIKE ?)');
      params.push(q, q, q, q, q);
    }

    const sql = `SELECT * FROM reconciliation_sessions WHERE ${whereClauses.join(' AND ')} ORDER BY COALESCE(completed_at, started_at) DESC`;
    const sessions = await queryAll(sql, params);
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Session details with all reconciled transactions
app.get('/api/reconciliation/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await queryOne(`SELECT * FROM reconciliation_sessions WHERE id = ?`, [id]);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });

    const transactions = await queryAll(`SELECT * FROM transactions WHERE session_id = ? ORDER BY date DESC`, [id]);
    res.json({ session, transactions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin-only: Delete an entire finished reconciliation session (acerto finalizado) and reopen its transactions
app.delete('/api/reconciliation/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { actorUser } = req.body || {};

    if (!actorUser || actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores têm permissão para excluir um acerto finalizado.' });
    }

    const session = await queryOne(`SELECT * FROM reconciliation_sessions WHERE id = ?`, [id]);
    if (!session) return res.status(404).json({ error: 'Acerto não encontrado.' });

    const companyId = session.company_id || 'matriz';

    // Reopen and unlock all transactions linked to this session
    await runSql(
      `UPDATE transactions SET 
        status = 'PENDING',
        reconciled_at = NULL,
        reconciled_by_user_id = NULL,
        reconciled_by_user_name = NULL,
        driver_id = NULL,
        driver_name = NULL,
        driver_plate = NULL,
        session_id = NULL,
        voucher_number = NULL,
        notes = ?,
        locked_at = NULL
       WHERE session_id = ?`,
      [`Acerto #${id} excluído pelo administrador ${actorUser.name}. Lançamentos reabertos para Pendente.`, id]
    );

    // Delete session record
    await runSql(`DELETE FROM reconciliation_sessions WHERE id = ?`, [id]);

    // Update driver statistics: decrease number of sessions and amount reconciled
    await runSql(
      `UPDATE drivers 
       SET total_sessions = total_sessions - 1,
           total_amount_reconciled = total_amount_reconciled - ?
       WHERE id = ?`,
      [session.total_amount, session.driver_id]
    );

    scheduleSaveDatabase();

    await logAudit('SESSION_DELETED', 'SESSION', id, actorUser, {
      driver: session.driver_name,
      plate: session.driver_plate,
      totalItems: session.total_items,
      totalAmount: session.total_amount
    }, companyId);

    broadcastEvent('SESSION_DELETED', { sessionId: id, company_id: companyId });
    broadcastEvent('TRANSACTION_REOPENED', { sessionId: id, reopenedBy: actorUser.name, company_id: companyId });

    res.json({
      success: true,
      message: `Acerto do motorista "${session.driver_name}" excluído com sucesso. Todos os lançamentos foram devolvidos ao extrato como Pendentes.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Reports & Auditing Endpoints
// -------------------------------------------------------------
app.get('/api/reports/driver-summary', async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { start_date, end_date, driver_id } = req.query as Record<string, string>;

    const sessionConditions = ["company_id = ?", "status = 'COMPLETED'"];
    const sessionParams: any[] = [companyId];

    if (driver_id && driver_id !== 'ALL') {
      sessionConditions.push('driver_id = ?');
      sessionParams.push(driver_id);
    }

    if (start_date && start_date.trim() !== '') {
      sessionConditions.push('date(COALESCE(completed_at, started_at)) >= date(?)');
      sessionParams.push(start_date.trim());
    }
    if (end_date && end_date.trim() !== '') {
      sessionConditions.push('date(COALESCE(completed_at, started_at)) <= date(?)');
      sessionParams.push(end_date.trim());
    }

    const sessionWhere = sessionConditions.join(' AND ');

    const summary = await queryAll(`
      SELECT 
        d.id as driver_id,
        d.code as driver_code,
        d.name as driver_name,
        d.vehicle_plate,
        d.route,
        COUNT(DISTINCT t.id) as total_pix_reconciled,
        COALESCE(SUM(t.amount), 0) as total_amount_reconciled,
        COALESCE(sub.total_missing_amount, 0) as total_missing_amount,
        COALESCE(sub.total_sessions_count, 0) as total_sessions,
        MIN(t.date) as first_receipt_date,
        MAX(t.date) as last_receipt_date
      FROM drivers d
      INNER JOIN (
        SELECT 
          driver_id, 
          COALESCE(SUM(missing_amount), 0) as total_missing_amount,
          COUNT(id) as total_sessions_count
        FROM reconciliation_sessions
        WHERE ${sessionWhere}
        GROUP BY driver_id
      ) sub ON sub.driver_id = d.id
      LEFT JOIN reconciliation_sessions s ON s.driver_id = d.id AND s.status = 'COMPLETED'
      LEFT JOIN transactions t ON t.session_id = s.id AND t.status = 'RECONCILED'
      WHERE d.company_id = ? ${driver_id && driver_id !== 'ALL' ? 'AND d.id = ?' : ''}
      GROUP BY d.id
      ORDER BY (total_amount_reconciled + total_missing_amount) DESC
    `, driver_id && driver_id !== 'ALL' ? [...sessionParams, companyId, driver_id] : [...sessionParams, companyId]);

    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/bank-summary', async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const summary = await queryAll(`
      SELECT 
        bank_name,
        COUNT(*) as total_transactions,
        COALESCE(SUM(amount), 0) as total_volume,
        COUNT(CASE WHEN status = 'RECONCILED' THEN 1 END) as reconciled_count,
        COALESCE(SUM(CASE WHEN status = 'RECONCILED' THEN amount ELSE 0 END), 0) as reconciled_sum,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_count,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) as pending_sum,
        COUNT(CASE WHEN is_pix = 1 THEN 1 END) as pix_count,
        COALESCE(SUM(CASE WHEN is_pix = 1 THEN amount ELSE 0 END), 0) as pix_sum
      FROM transactions
      WHERE company_id = ?
      GROUP BY bank_name
      ORDER BY total_volume DESC
    `, [companyId]);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/audit', async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { start_date, end_date, action, search } = req.query as Record<string, string>;
    const whereClauses: string[] = ['company_id = ?'];
    const params: any[] = [companyId];

    if (action && action !== 'ALL') {
      whereClauses.push('action = ?');
      params.push(action);
    }
    if (start_date && start_date.trim() !== '') {
      whereClauses.push('date(created_at) >= date(?)');
      params.push(start_date.trim());
    }
    if (end_date && end_date.trim() !== '') {
      whereClauses.push('date(created_at) <= date(?)');
      params.push(end_date.trim());
    }
    if (search && search.trim() !== '') {
      const q = `%${search.trim()}%`;
      whereClauses.push('(user_name LIKE ? OR action LIKE ? OR details_json LIKE ? OR entity_id LIKE ?)');
      params.push(q, q, q, q);
    }

    const logs = await queryAll(`SELECT * FROM audit_logs WHERE ${whereClauses.join(' AND ')} ORDER BY created_at DESC LIMIT 300`, params);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Real-time Database Persistence Status (Google Cloud SQL)
app.get('/api/database/status', async (req, res) => {
  try {
    const hasHost = !!process.env.SQL_HOST;
    let cloudSqlActive = false;
    let lastCloudSqlSync = null;

    if (hasHost) {
      try {
        const result = await safeCloudSqlQuery<{ updated_at: string }>(
          'SELECT updated_at FROM system_snapshots WHERE key = $1',
          ['main_db'],
          4000
        );
        if (result && result.rows.length > 0) {
          cloudSqlActive = true;
          lastCloudSqlSync = result.rows[0].updated_at;
        } else if (result) {
          cloudSqlActive = true;
        }
      } catch (e: any) {
        console.warn('[CloudSQL Status] Instance warming up or unreachable:', e?.message || e);
      }
    }

    res.json({
      persistent: cloudSqlActive,
      engine: cloudSqlActive ? 'Google Cloud SQL (PostgreSQL)' : 'Local Cache (Syncing to Cloud SQL)',
      cloudSqlActive,
      lastSync: lastCloudSqlSync,
      databaseName: process.env.SQL_DB_NAME || 'cloud_sql_development_database'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Clean/Reset Database (Wipes transactions, batches, sessions - preserves users and banks)
app.post('/api/database/clean', async (req, res) => {
  try {
    const { actorUser, preserveDrivers = true, company_id } = req.body || {};
    const companyId = company_id || getCompanyId(req);

    if (!actorUser || actorUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas Administradores têm permissão para limpar o banco de dados.' });
    }

    const db = await getDatabase();

    db.run(`DELETE FROM transactions WHERE company_id = ?`, [companyId]);
    db.run(`DELETE FROM import_batches WHERE company_id = ?`, [companyId]);
    db.run(`DELETE FROM reconciliation_sessions WHERE company_id = ?`, [companyId]);

    if (!preserveDrivers) {
      db.run(`DELETE FROM drivers WHERE company_id = ?`, [companyId]);
    }

    persistDatabaseSync();

    if (actorUser) {
      await logAudit('DATABASE_CLEANED', 'SYSTEM', 'company_' + companyId, actorUser, {
        companyId,
        preserveDrivers,
        cleanedAt: new Date().toISOString()
      }, companyId);
    }

    broadcastEvent('DATABASE_CLEANED', { action: 'CLEANED', company_id: companyId, preserveDrivers });
    res.json({
      success: true,
      message: 'Banco de dados desta empresa limpo com sucesso! Lançamentos e extratos zerados.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Full System Backup Export (JSON / SQLite)
app.get('/api/database/backup', async (req, res) => {
  try {
    const format = req.query.format || 'json';

    if (format === 'sqlite') {
      const dbPath = path.resolve(process.cwd(), 'data', 'conciliapix.sqlite');
      if (fs.existsSync(dbPath)) {
        res.setHeader('Content-Type', 'application/x-sqlite3');
        res.setHeader('Content-Disposition', `attachment; filename="conciliapix-backup-${new Date().toISOString().slice(0, 10)}.sqlite"`);
        return res.sendFile(dbPath);
      }
    }

    // JSON Snapshot containing all tables
    const [companies, users, drivers, bank_accounts, import_batches, transactions, reconciliation_sessions, audit_logs] = await Promise.all([
      queryAll('SELECT * FROM companies'),
      queryAll('SELECT * FROM users'),
      queryAll('SELECT * FROM drivers'),
      queryAll('SELECT * FROM bank_accounts'),
      queryAll('SELECT * FROM import_batches'),
      queryAll('SELECT * FROM transactions'),
      queryAll('SELECT * FROM reconciliation_sessions'),
      queryAll('SELECT * FROM audit_logs')
    ]);

    const backupPayload = {
      system: 'ConciliaPix Pro',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      stats: {
        companiesCount: companies.length,
        usersCount: users.length,
        driversCount: drivers.length,
        transactionsCount: transactions.length,
        sessionsCount: reconciliation_sessions.length
      },
      data: {
        companies,
        users,
        drivers,
        bank_accounts,
        import_batches,
        transactions,
        reconciliation_sessions,
        audit_logs
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="conciliapix-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(backupPayload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to get columns for a table in SQLite to avoid column mismatch errors
function getValidTableColumns(db: any, tableName: string): Set<string> {
  try {
    const res = db.exec(`PRAGMA table_info(${tableName})`);
    if (res && res.length && res[0].values) {
      return new Set(res[0].values.map((v: any) => String(v[1])));
    }
  } catch (_) {}
  return new Set();
}

function insertDynamicRow(db: any, tableName: string, row: Record<string, any>, validCols: Set<string>) {
  if (!row || typeof row !== 'object') return;
  const cols: string[] = [];
  const placeholders: string[] = [];
  const params: any[] = [];

  for (const [key, val] of Object.entries(row)) {
    if (validCols.has(key)) {
      cols.push(key);
      placeholders.push('?');
      if (typeof val === 'boolean') {
        params.push(val ? 1 : 0);
      } else if (typeof val === 'object' && val !== null) {
        params.push(JSON.stringify(val));
      } else {
        params.push(val === undefined ? null : val);
      }
    }
  }

  if (cols.length === 0) return;
  const sql = `INSERT OR REPLACE INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;
  db.run(sql, params);
}

// Full System Backup Restore
app.post('/api/database/restore', async (req, res) => {
  try {
    const { backupData, actorUser } = req.body || {};

    if (!backupData) {
      return res.status(400).json({ error: 'Nenhum dado de backup foi enviado.' });
    }

    // Support wrapped { data: { transactions: ... } }, raw { transactions: ... }, or array of transactions
    let d: any = backupData.data || backupData;
    if (Array.isArray(d)) {
      d = { transactions: d };
    }

    const db = await getDatabase();
    const currentUserInfo = actorUser || { id: 'usr-admin', name: 'Administrador', role: 'ADMIN' };

    // Get valid columns for each table dynamically
    const companyCols = getValidTableColumns(db, 'companies');
    const userCols = getValidTableColumns(db, 'users');
    const driverCols = getValidTableColumns(db, 'drivers');
    const bankCols = getValidTableColumns(db, 'bank_accounts');
    const batchCols = getValidTableColumns(db, 'import_batches');
    const txCols = getValidTableColumns(db, 'transactions');
    const sessionCols = getValidTableColumns(db, 'reconciliation_sessions');
    const auditCols = getValidTableColumns(db, 'audit_logs');

    db.run('BEGIN TRANSACTION');
    try {
      // Clear existing records if replacement arrays exist
      if (Array.isArray(d.audit_logs)) db.run('DELETE FROM audit_logs');
      if (Array.isArray(d.transactions)) db.run('DELETE FROM transactions');
      if (Array.isArray(d.reconciliation_sessions)) db.run('DELETE FROM reconciliation_sessions');
      if (Array.isArray(d.import_batches)) db.run('DELETE FROM import_batches');
      if (Array.isArray(d.bank_accounts)) db.run('DELETE FROM bank_accounts');
      if (Array.isArray(d.drivers)) db.run('DELETE FROM drivers');
      if (Array.isArray(d.users)) db.run('DELETE FROM users');
      if (Array.isArray(d.companies)) db.run('DELETE FROM companies');

      let companiesCount = 0;
      let usersCount = 0;
      let driversCount = 0;
      let banksCount = 0;
      let batchesCount = 0;
      let txCount = 0;
      let sessionsCount = 0;
      let auditCount = 0;

      for (const c of (d.companies || [])) {
        insertDynamicRow(db, 'companies', c, companyCols);
        companiesCount++;
      }

      for (const u of (d.users || [])) {
        insertDynamicRow(db, 'users', u, userCols);
        usersCount++;
      }

      for (const drv of (d.drivers || [])) {
        insertDynamicRow(db, 'drivers', drv, driverCols);
        driversCount++;
      }

      for (const b of (d.bank_accounts || [])) {
        insertDynamicRow(db, 'bank_accounts', b, bankCols);
        banksCount++;
      }

      for (const ib of (d.import_batches || [])) {
        insertDynamicRow(db, 'import_batches', ib, batchCols);
        batchesCount++;
      }

      for (const tx of (d.transactions || [])) {
        insertDynamicRow(db, 'transactions', tx, txCols);
        txCount++;
      }

      for (const s of (d.reconciliation_sessions || [])) {
        insertDynamicRow(db, 'reconciliation_sessions', s, sessionCols);
        sessionsCount++;
      }

      for (const a of (d.audit_logs || [])) {
        insertDynamicRow(db, 'audit_logs', a, auditCols);
        auditCount++;
      }

      db.run('COMMIT');

      // Synchronize immediately to disk and Google Cloud SQL persistent database
      persistDatabaseSync();

      try {
        await logAudit('DATABASE_RESTORED', 'SYSTEM', 'full_backup', currentUserInfo, {
          restoredAt: new Date().toISOString(),
          transactionsCount: txCount,
          driversCount: driversCount,
          sessionsCount: sessionsCount,
          batchesCount: batchesCount
        });
      } catch (_) {}

      broadcastEvent('DATABASE_RESTORED', { action: 'RESTORED' });

      console.log(`[RESTORE SUCCESS] Restored ${txCount} transactions, ${driversCount} drivers, ${sessionsCount} sessions.`);

      res.json({
        success: true,
        message: `Backup restaurado com sucesso! ${txCount} lançamentos, ${driversCount} motoristas e ${sessionsCount} acertos foram carregados e salvos no sistema e na nuvem.`,
        stats: {
          transactions: txCount,
          drivers: driversCount,
          sessions: sessionsCount,
          batches: batchesCount,
          companies: companiesCount,
          users: usersCount
        }
      });
    } catch (err: any) {
      console.error('[RESTORE ERROR DURING TRANSACTION]', err);
      try { db.run('ROLLBACK'); } catch (_) {}
      throw err;
    }
  } catch (err: any) {
    console.error('[RESTORE FAILED]', err);
    res.status(500).json({ error: err.message || 'Falha ao restaurar banco de dados.' });
  }
});

// Setup Vite middleware or Static files
async function startServer() {
  // Initialize Database
  await getDatabase();
  console.log('[DB] Database ready with full schema and indexes.');

  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  if (!isProduction) {
    // Use dynamic function to completely hide the import from Vercel's bundler (@vercel/nft)
    const { createServer: createViteServer } = await new Function('return import("vite")')();
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);

    // Explicit fallback for SPA routes to ensure index.html is always returned
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        if (vite) vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] ConciliaPix server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[FATAL] Failed to start server:', err);
});

// Export app for Vercel Serverless Functions
export default app;
