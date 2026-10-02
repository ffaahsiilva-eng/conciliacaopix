import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'conciliapix.sqlite');

let dbInstance: Database | null = null;
let dbInitPromise: Promise<Database> | null = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;
let pgPool: pg.Pool | null = null;
let isSavingToCloudSql = false;
let pendingSaveBuffer: Buffer | null = null;

export function getCloudSqlPool(): pg.Pool | null {
  if (process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_PASSWORD) {
    if (!pgPool) {
      pgPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME || 'cloud_sql_development_database',
        max: 5,
        connectionTimeoutMillis: 20000, // 20s to allow Cloud SQL scale-to-zero to wake up
        idleTimeoutMillis: 30000,
        allowExitOnIdle: true,
        keepAlive: true,
        keepAliveInitialDelayMillis: 5000,
        statement_timeout: 45000,
        query_timeout: 45000,
      });

      pgPool.on('error', (err: any) => {
        const msg = err?.message || '';
        if (
          msg.includes('Connection terminated') ||
          msg.includes('timeout') ||
          err?.code === 'ECONNRESET' ||
          err?.code === '57P01' ||
          err?.code === 'ETIMEDOUT'
        ) {
          // Expected idle socket teardown by Cloud SQL scale-to-zero; pg purges the client
          return;
        }
        console.warn('[CloudSQL Pool Notice]', msg);
      });
    }
    return pgPool;
  }
  return null;
}

export async function resetCloudSqlPool(): Promise<void> {
  if (pgPool) {
    const oldPool = pgPool;
    pgPool = null;
    try {
      await oldPool.end();
    } catch (_) {}
  }
}

export async function safeCloudSqlQuery<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[],
  timeoutMs = 30000
): Promise<pg.QueryResult<T> | null> {
  const pool = getCloudSqlPool();
  if (!pool) return null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const queryPromise = pool.query<T>(text, params);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Cloud SQL query timed out')), timeoutMs)
      );
      return await Promise.race([queryPromise, timeoutPromise]);
    } catch (err: any) {
      const msg = err?.message || '';
      const isConnectionIssue =
        msg.includes('Connection terminated') ||
        msg.includes('timed out') ||
        msg.includes('timeout') ||
        err?.code === 'ECONNRESET' ||
        err?.code === '57P01' ||
        err?.code === 'ETIMEDOUT';

      if (isConnectionIssue) {
        await resetCloudSqlPool();
      }

      if (attempt < 3 && isConnectionIssue) {
        const backoffMs = attempt * 1500;
        console.log(`[CloudSQL] Waiting ${backoffMs}ms for database to respond (attempt ${attempt}/3)...`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      console.warn(`[CloudSQL Query] Transient issue (${attempt}/3):`, msg);
      return null;
    }
  }
  return null;
}

export async function loadSnapshotFromCloudSql(): Promise<Buffer | null> {
  // Try up to 4 times with backoff to handle cold start when Cloud SQL is spinning up from scale-to-zero
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await safeCloudSqlQuery<{ data: string }>(
        `SELECT data FROM system_snapshots WHERE key = 'main_db'`,
        undefined,
        35000
      );
      if (res && res.rows.length > 0 && res.rows[0]?.data) {
        const buf = Buffer.from(res.rows[0].data, 'base64');
        if (buf.length > 0) {
          console.log(`[CloudSQL] Loaded database snapshot (${buf.length} bytes) from Google Cloud SQL.`);
          return buf;
        }
      }
      if (res && res.rows.length === 0) {
        // Table exists and query succeeded, but no snapshot row yet
        console.log('[CloudSQL] Connected to Cloud SQL; no existing snapshot row found.');
        return null;
      }
    } catch (err: any) {
      console.warn(`[CloudSQL] Attempt ${attempt}/4 could not load snapshot:`, err?.message || err);
    }

    if (attempt < 4) {
      console.log(`[CloudSQL] Cold start detected; retrying Cloud SQL connection in 2s (attempt ${attempt}/4)...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

export async function saveSnapshotToCloudSql(buffer: Buffer): Promise<void> {
  if (isSavingToCloudSql) {
    pendingSaveBuffer = buffer;
    return;
  }

  isSavingToCloudSql = true;
  try {
    // SAFETY SHIELD: Before overwriting main_db, check the size of the existing snapshot
    const checkRes = await safeCloudSqlQuery<{ len: number }>(
      `SELECT length(data) as len FROM system_snapshots WHERE key = 'main_db'`,
      undefined,
      15000
    );
    const existingLen = Number(checkRes?.rows?.[0]?.len || 0);

    // If an existing database snapshot had substantial data (>500KB base64, ~375KB sqlite)
    // and the new buffer is an empty blank database (<300KB), REFUSE to overwrite main_db!
    if (existingLen > 500000 && buffer.length < 300000) {
      console.error(
        `[CloudSQL SAFETY SHIELD] BLOCKED overwrite! Cloud SQL has a healthy snapshot of ${existingLen} bytes, but current buffer is only ${buffer.length} bytes. Saving to emergency backup instead of overwriting.`
      );
      await safeCloudSqlQuery(
        `INSERT INTO system_snapshots (key, data, updated_at) 
         VALUES ('main_db_emergency_backup', $1, NOW()) 
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [buffer.toString('base64')],
        15000
      );
      return;
    }

    const b64 = buffer.toString('base64');

    // 1. Primary snapshot save
    await safeCloudSqlQuery(
      `INSERT INTO system_snapshots (key, data, updated_at) 
       VALUES ('main_db', $1, NOW()) 
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [b64],
      20000
    );

    // 2. Rolling backup copy in Cloud SQL for safety
    await safeCloudSqlQuery(
      `INSERT INTO system_snapshots (key, data, updated_at) 
       VALUES ('main_db_backup', $1, NOW()) 
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [b64],
      20000
    );
  } catch (err: any) {
    console.warn('[CloudSQL] Warning persisting snapshot to Cloud SQL:', err?.message || err);
  } finally {
    isSavingToCloudSql = false;
    if (pendingSaveBuffer) {
      const next = pendingSaveBuffer;
      pendingSaveBuffer = null;
      saveSnapshotToCloudSql(next);
    }
  }
}

export async function getDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }
  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = (async () => {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const init = typeof initSqlJs === 'function' ? initSqlJs : (initSqlJs as any)?.default || initSqlJs;
    const SQL = await init();

    let instance: Database | undefined;

    // 1. Try restoring from Cloud SQL permanent persistent storage first!
    try {
      const cloudBuffer = await loadSnapshotFromCloudSql();
      if (cloudBuffer && cloudBuffer.length > 0) {
        instance = new SQL.Database(cloudBuffer);
        try {
          fs.writeFileSync(DB_FILE, cloudBuffer);
        } catch (_) {}
        console.log(`[DB] Database successfully restored from Cloud SQL permanent storage (${cloudBuffer.length} bytes).`);
      }
    } catch (err) {
      console.error('[DB] Failed restoring from Cloud SQL:', err);
    }

    // 2. Try restoring from local cached file if Cloud SQL was unreachable
    if (!instance && fs.existsSync(DB_FILE)) {
      try {
        const fileBuffer = fs.readFileSync(DB_FILE);
        if (fileBuffer.length > 0) {
          instance = new SQL.Database(fileBuffer);
          console.log(`[DB] Database restored from local cached file (${fileBuffer.length} bytes).`);
        }
      } catch (err) {
        console.error('[DB] Failed to load local database file:', err);
      }
    }

    // 3. If neither exists, create fresh and seed schema
    const isBrandNew = !instance;
    const dbToUse: Database = instance || new SQL.Database();
    dbInstance = dbToUse;

    // Initialize schemas, indexes, migrations, and bank catalogs
    initSchema(dbToUse);

    // Only sync to Cloud SQL on fresh creation if it is truly brand new
    // NEVER overwrite Cloud SQL on boot if we restored existing data
    if (isBrandNew) {
      persistDatabaseSync();
    }

    return dbToUse;
  })();

  return dbInitPromise;
}

export function persistDatabaseSync(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, buffer);
    fs.renameSync(tempFile, DB_FILE);

    // Asynchronously synchronize snapshot to Google Cloud SQL permanent storage with safety shield
    saveSnapshotToCloudSql(buffer);
  } catch (err) {
    console.error('[DB] Error persisting database to disk:', err);
  }
}

export function scheduleSaveDatabase(): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }
  saveDebounceTimer = setTimeout(() => {
    persistDatabaseSync();
  }, 150);
}

// Graceful process exit handler to flush to Cloud SQL before container shuts down
process.on('SIGTERM', () => {
  if (dbInstance) {
    try {
      const data = dbInstance.export();
      const buffer = Buffer.from(data);
      const pool = getCloudSqlPool();
      if (pool) {
        pool.query(
          `INSERT INTO system_snapshots (key, data, updated_at) VALUES ('main_db', $1, NOW()) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          [buffer.toString('base64')]
        );
      }
    } catch (_) {}
  }
});

function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      cnpj TEXT,
      color TEXT DEFAULT '#2563eb',
      is_main INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'OPERATOR', 'AUDITOR')),
      pin TEXT NOT NULL DEFAULT '1234',
      avatar TEXT,
      allowed_companies TEXT NOT NULL DEFAULT '["matriz","filial"]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      cpf TEXT,
      phone TEXT,
      vehicle_plate TEXT NOT NULL,
      vehicle_model TEXT,
      route TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      bank_code TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      agency TEXT,
      account_number TEXT,
      color TEXT DEFAULT '#0284c7',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      filename TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      bank_code TEXT,
      format TEXT NOT NULL,
      total_transactions INTEGER NOT NULL DEFAULT 0,
      total_credit REAL NOT NULL DEFAULT 0,
      total_debit REAL NOT NULL DEFAULT 0,
      period_start TEXT,
      period_end TEXT,
      imported_by_user_id TEXT NOT NULL,
      imported_by_user_name TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      import_batch_id TEXT,
      bank_name TEXT NOT NULL,
      bank_code TEXT,
      fitid TEXT,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('CREDIT', 'DEBIT')),
      amount REAL NOT NULL,
      original_amount REAL,
      returned_amount REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      memo TEXT,
      document_number TEXT,
      is_pix INTEGER NOT NULL DEFAULT 0,
      is_pix_return INTEGER NOT NULL DEFAULT 0,
      return_reason TEXT,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'RECONCILED', 'IGNORED', 'RETURNED')) DEFAULT 'PENDING',
      reconciled_at TEXT,
      reconciled_by_user_id TEXT,
      reconciled_by_user_name TEXT,
      driver_id TEXT,
      driver_name TEXT,
      driver_plate TEXT,
      session_id TEXT,
      voucher_number TEXT,
      notes TEXT,
      counterparty_name TEXT,
      counterparty_doc TEXT,
      linked_tx_id TEXT,
      raw_data TEXT,
      created_at TEXT NOT NULL,
      locked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reconciliation_sessions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      driver_id TEXT NOT NULL,
      driver_name TEXT NOT NULL,
      driver_plate TEXT,
      operator_user_id TEXT NOT NULL,
      operator_user_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      total_items INTEGER NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      missing_amount REAL NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Auto-migrate transactions table if it has the older CHECK constraint without 'RETURNED'
  try {
    const tableMaster = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'");
    const sqlSchema = (tableMaster[0]?.values[0]?.[0] as string) || '';
    if (sqlSchema && !sqlSchema.includes("'RETURNED'")) {
      console.log('[DB Migration] Updating transactions table to support RETURNED status...');
      db.run(`
        CREATE TABLE transactions_new (
          id TEXT PRIMARY KEY,
          import_batch_id TEXT,
          bank_name TEXT NOT NULL,
          bank_code TEXT,
          fitid TEXT,
          date TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('CREDIT', 'DEBIT')),
          amount REAL NOT NULL,
          description TEXT NOT NULL,
          memo TEXT,
          document_number TEXT,
          is_pix INTEGER NOT NULL DEFAULT 0,
          is_pix_return INTEGER NOT NULL DEFAULT 0,
          return_reason TEXT,
          status TEXT NOT NULL CHECK(status IN ('PENDING', 'RECONCILED', 'IGNORED', 'RETURNED')) DEFAULT 'PENDING',
          reconciled_at TEXT,
          reconciled_by_user_id TEXT,
          reconciled_by_user_name TEXT,
          driver_id TEXT,
          driver_name TEXT,
          driver_plate TEXT,
          session_id TEXT,
          voucher_number TEXT,
          notes TEXT,
          counterparty_name TEXT,
          counterparty_doc TEXT,
          linked_tx_id TEXT,
          raw_data TEXT,
          created_at TEXT NOT NULL,
          locked_at TEXT
        );
      `);

      // Copy all existing columns dynamically
      db.run(`
        INSERT INTO transactions_new (
          id, import_batch_id, bank_name, bank_code, fitid, date, type, amount,
          description, memo, document_number, is_pix, status,
          reconciled_at, reconciled_by_user_id, reconciled_by_user_name,
          driver_id, driver_name, driver_plate, session_id, voucher_number, notes,
          created_at, locked_at
        )
        SELECT 
          id, import_batch_id, bank_name, bank_code, fitid, date, type, amount,
          description, memo, document_number, COALESCE(is_pix, 0), status,
          reconciled_at, reconciled_by_user_id, reconciled_by_user_name,
          driver_id, driver_name, driver_plate, session_id, voucher_number, notes,
          created_at, locked_at
        FROM transactions;
      `);

      db.run(`DROP TABLE transactions;`);
      db.run(`ALTER TABLE transactions_new RENAME TO transactions;`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_trans_status ON transactions(status);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(date);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_trans_driver ON transactions(driver_id);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_trans_session ON transactions(session_id);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_trans_fitid ON transactions(fitid);`);
      console.log('[DB Migration] Transactions table successfully migrated.');
    }
  } catch (migErr) {
    console.error('[DB Migration Warning]', migErr);
  }

  // Column migrations in case table was created previously without new fields
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN is_pix_return INTEGER NOT NULL DEFAULT 0`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN return_reason TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN counterparty_name TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN counterparty_doc TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN linked_tx_id TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN raw_data TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN original_amount REAL`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN returned_amount REAL NOT NULL DEFAULT 0`);
  } catch (_) {}
  try {
    db.run(`UPDATE transactions SET original_amount = amount WHERE original_amount IS NULL`);
  } catch (_) {}

  // Clean counterparty_name on existing transactions if it contains raw PIX memo
  try {
    const rawTxs = db.exec("SELECT id, counterparty_name FROM transactions WHERE counterparty_name LIKE '%PIX%'");
    if (rawTxs[0]?.values) {
      for (const row of rawTxs[0].values) {
        const id = row[0] as string;
        const currentName = (row[1] as string) || '';
        const m = currentName.match(/(?:PIX\s*[-–]?\s*RECEBIDO(?:\s*QR\s*CODE)?|PIX\s*[-–]?\s*ENVIADO|DEV(?:\.?|OLUÇÃO|OLUCAO)?\s*PIX)\s*[-–]?\s*(?:\d{2}\/\d{2}\s*\d{2}:\d{2}\s*)?(?:\d{11,14}\s*)?(.*)/i);
        let cleaned = m && m[1] && m[1].trim().length >= 2 ? m[1].trim() : currentName;
        cleaned = cleaned.replace(/\b\d{2}\/\d{2}\s+\d{2}:\d{2}\b/g, '');
        cleaned = cleaned.replace(/\b\d{11,14}\b/g, '');
        cleaned = cleaned.replace(/^(?:PIX|TRANSF|TRANSFERENCIA|PAGAMENTO|RECEBIMENTO|CREDITO|DEBITO|TED|DOC|ESTORNO|DEV PIX)\s*[-–:]?\s*/i, '');
        cleaned = cleaned.replace(/\s*[-–:]\s*$/, '').trim();
        if (cleaned && cleaned !== currentName) {
          db.run(`UPDATE transactions SET counterparty_name = ? WHERE id = ?`, [cleaned, id]);
        }
      }
    }
  } catch (_) {}

  // Purge any accidental balance rows (e.g. Saldo do dia, Saldo anterior, etc.) from transactions
  try {
    db.run(`
      DELETE FROM transactions 
      WHERE (UPPER(description) LIKE '%SALDO DO DIA%' 
         OR UPPER(description) LIKE '%SALDO ANTERIOR%'
         OR UPPER(description) LIKE '%SALDO FINAL%'
         OR UPPER(description) LIKE '%SALDO ATUAL%'
         OR UPPER(description) LIKE '%SALDO INICIAL%'
         OR UPPER(description) LIKE '%SDO DO DIA%'
         OR UPPER(description) LIKE '%SDO ANTERIOR%'
         OR UPPER(description) LIKE '%SALDO TOTAL%'
         OR UPPER(description) LIKE '%SALDO DISPONIVEL%'
         OR UPPER(description) LIKE '%SALDO BLOQUEADO%'
         OR UPPER(description) LIKE '%SALDO APLIC%'
         OR UPPER(description) LIKE '%SALDO CONTA%'
         OR UPPER(description) LIKE 'SALDO %'
         OR UPPER(description) = 'SALDO'
         OR UPPER(description) = 'SDO'
         OR UPPER(memo) LIKE '%SALDO DO DIA%'
         OR UPPER(memo) LIKE '%SALDO ANTERIOR%'
         OR UPPER(memo) LIKE '%SALDO FINAL%')
        AND status = 'PENDING'
    `);
  } catch (_) {}

  // Migration for multi-company (Matriz vs Filial)
  try {
    db.run(`ALTER TABLE users ADD COLUMN allowed_companies TEXT NOT NULL DEFAULT '["matriz","filial"]'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE drivers ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE bank_accounts ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE import_batches ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE reconciliation_sessions ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE reconciliation_sessions ADD COLUMN general_voucher TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE reconciliation_sessions ADD COLUMN missing_amount REAL DEFAULT 0`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE drivers ADD COLUMN total_sessions INTEGER DEFAULT 0`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE drivers ADD COLUMN total_amount_reconciled REAL DEFAULT 0`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE audit_logs ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}

  // Safe index creations after all columns and tables are guaranteed to exist
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_company ON transactions(company_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_status ON transactions(status)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(date)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_driver ON transactions(driver_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_session ON transactions(session_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_fitid ON transactions(fitid)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_drv_company ON drivers(company_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_batch_company ON import_batches(company_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_sess_company ON reconciliation_sessions(company_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_logs(company_id)`); } catch (_) {}

  // Seed default companies if none exist
  const companyCount = db.exec("SELECT COUNT(*) as count FROM companies")[0]?.values[0]?.[0] as number;
  if (!companyCount || companyCount === 0) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO companies (id, name, code, cnpj, color, is_main, active, created_at) VALUES
       ('matriz', 'Matriz (Sede Principal)', 'MATRIZ', '00.000.000/0001-00', '#2563eb', 1, 1, ?),
       ('filial', 'Filial 01 (Unidade Filial)', 'FILIAL', '00.000.000/0002-00', '#059669', 0, 1, ?)`,
      [now, now]
    );
  }

  // Default system users for access and role testing
  const userCount = db.exec("SELECT COUNT(*) as count FROM users")[0]?.values[0]?.[0] as number;
  if (!userCount || userCount === 0) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO users (id, name, email, role, pin, allowed_companies, created_at) VALUES 
       ('usr-admin', 'Administrador do Sistema', 'admin@empresa.com.br', 'ADMIN', '1234', '["matriz","filial"]', ?),
       ('usr-op1', 'Carlos Silva (Operador Matriz e Filial)', 'carlos.silva@empresa.com.br', 'OPERATOR', '1234', '["matriz","filial"]', ?),
       ('usr-op2', 'Mariana Costa (Operadora Apenas Filial)', 'mariana.costa@empresa.com.br', 'OPERATOR', '1234', '["filial"]', ?),
       ('usr-aud', 'Roberto Santos (Auditor Fiscal)', 'roberto.santos@empresa.com.br', 'AUDITOR', '1234', '["matriz","filial"]', ?)`,
      [now, now, now, now]
    );
  }

  // Standard Brazilian bank accounts catalog for the upload dropdown (Matriz)
  const bankCount = db.exec("SELECT COUNT(*) as count FROM bank_accounts WHERE company_id = 'matriz'")[0]?.values[0]?.[0] as number;
  if (!bankCount || bankCount === 0) {
    db.run(`
      INSERT INTO bank_accounts (id, company_id, bank_code, bank_name, agency, account_number, color) VALUES
      ('bnk-itau', 'matriz', '341', 'Banco Itaú Unibanco', '0001', '', '#ea580c'),
      ('bnk-bb', 'matriz', '001', 'Banco do Brasil', '0001', '', '#facc15'),
      ('bnk-bradesco', 'matriz', '237', 'Banco Bradesco', '0001', '', '#dc2626'),
      ('bnk-santander', 'matriz', '033', 'Banco Santander', '0001', '', '#ef4444'),
      ('bnk-inter', 'matriz', '077', 'Banco Inter', '0001', '', '#f97316'),
      ('bnk-nubank', 'matriz', '260', 'Nubank / Nu Pagamentos', '0001', '', '#8b5cf6'),
      ('bnk-sicoob', 'matriz', '756', 'Sicoob Cooperativa', '0001', '', '#059669'),
      ('bnk-caixa', 'matriz', '104', 'Caixa Econômica Federal', '0001', '', '#2563eb'),
      ('bnk-c6', 'matriz', '336', 'Banco C6 S.A. / C6 Bank', '0001', '', '#1e293b')
    `);
  }

  // Standard Brazilian bank accounts catalog for Filial
  const filialBankCount = db.exec("SELECT COUNT(*) as count FROM bank_accounts WHERE company_id = 'filial'")[0]?.values[0]?.[0] as number;
  if (!filialBankCount || filialBankCount === 0) {
    db.run(`
      INSERT INTO bank_accounts (id, company_id, bank_code, bank_name, agency, account_number, color) VALUES
      ('bnk-fil-itau', 'filial', '341', 'Banco Itaú Unibanco (Filial)', '0001', '', '#ea580c'),
      ('bnk-fil-bb', 'filial', '001', 'Banco do Brasil (Filial)', '0001', '', '#facc15'),
      ('bnk-fil-bradesco', 'filial', '237', 'Banco Bradesco (Filial)', '0001', '', '#dc2626'),
      ('bnk-fil-santander', 'filial', '033', 'Banco Santander (Filial)', '0001', '', '#ef4444'),
      ('bnk-fil-inter', 'filial', '077', 'Banco Inter (Filial)', '0001', '', '#f97316'),
      ('bnk-fil-nubank', 'filial', '260', 'Nubank (Filial)', '0001', '', '#8b5cf6'),
      ('bnk-fil-sicoob', 'filial', '756', 'Sicoob Cooperativa (Filial)', '0001', '', '#059669'),
      ('bnk-fil-caixa', 'filial', '104', 'Caixa Econômica Federal (Filial)', '0001', '', '#2563eb'),
      ('bnk-fil-c6', 'filial', '336', 'Banco C6 S.A. (Filial)', '0001', '', '#1e293b')
    `);
  }

  // Ensure C6 Bank is present on any existing database for both Matriz and Filial
  try {
    const existingC6Matriz = db.exec("SELECT id FROM bank_accounts WHERE bank_code = '336' AND company_id = 'matriz'");
    if (!existingC6Matriz[0]?.values?.length) {
      db.run(`INSERT INTO bank_accounts (id, company_id, bank_code, bank_name, agency, account_number, color, active) VALUES ('bnk-c6', 'matriz', '336', 'Banco C6 S.A. / C6 Bank', '0001', '', '#1e293b', 1)`);
    }
    const existingC6Filial = db.exec("SELECT id FROM bank_accounts WHERE bank_code = '336' AND company_id = 'filial'");
    if (!existingC6Filial[0]?.values?.length) {
      db.run(`INSERT INTO bank_accounts (id, company_id, bank_code, bank_name, agency, account_number, color, active) VALUES ('bnk-fil-c6', 'filial', '336', 'Banco C6 S.A. (Filial)', '0001', '', '#1e293b', 1)`);
    }
  } catch (_) {}

  // NOTE: NO FICTIONAL TRANSACTIONS, NO FICTIONAL DRIVERS, NO FICTIONAL BATCHES OR SESSIONS.
  // The database starts 100% clean and pristine, ready for real user bank statements and real driver entries.
}
