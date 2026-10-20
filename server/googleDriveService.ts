import { getDatabase, persistDatabase } from './db.js';

let debounceTimer: NodeJS.Timeout | null = null;
let isSyncing = false;

export async function getGoogleDriveWebhookUrl(): Promise<string | null> {
  try {
    const db = await getDatabase();
    const res = db.exec("SELECT value FROM system_settings WHERE key = 'google_drive_webhook_url'");
    if (res && res.length && res[0].values.length) {
      return String(res[0].values[0][0] || '').trim() || null;
    }
  } catch (_) {}
  return process.env.GOOGLE_DRIVE_WEBHOOK_URL?.trim() || null;
}

export async function setGoogleDriveWebhookUrl(url: string): Promise<void> {
  const db = await getDatabase();
  const cleanUrl = url ? url.trim() : '';
  db.run(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ('google_drive_webhook_url', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [cleanUrl]
  );
  try {
    await persistDatabase();
  } catch (err: any) {
    console.warn('[GoogleDrive] Falha ao persistir webhookUrl no Supabase:', err.message);
  }
}

export async function getGoogleDriveSyncStatus(): Promise<{
  configured: boolean;
  webhookUrl: string | null;
  rawWebhookUrl: string | null;
  lastSync: string | null;
  lastStatus: 'success' | 'error' | 'idle';
  lastMessage: string | null;
}> {
  try {
    const db = await getDatabase();
    const getVal = (k: string) => {
      const r = db.exec(`SELECT value FROM system_settings WHERE key = '${k}'`);
      return r[0]?.values[0]?.[0] ? String(r[0].values[0][0]) : null;
    };
    const webhookUrl = await getGoogleDriveWebhookUrl();
    return {
      configured: Boolean(webhookUrl && webhookUrl.startsWith('https://script.google.com')),
      webhookUrl: webhookUrl ? `${webhookUrl.slice(0, 45)}...` : null,
      rawWebhookUrl: webhookUrl || null,
      lastSync: getVal('google_drive_last_sync'),
      lastStatus: (getVal('google_drive_last_status') as any) || 'idle',
      lastMessage: getVal('google_drive_last_message'),
    };
  } catch (_) {
    return {
      configured: false,
      webhookUrl: null,
      rawWebhookUrl: null,
      lastSync: null,
      lastStatus: 'idle',
      lastMessage: null,
    };
  }
}

export async function executeGoogleDriveSync(
  triggerReason = 'manual',
  explicitUrl?: string
): Promise<{
  success: boolean;
  message: string;
}> {
  let webhookUrl = (explicitUrl && explicitUrl.trim()) || (await getGoogleDriveWebhookUrl());
  if (explicitUrl && explicitUrl.trim() && explicitUrl.startsWith('https://script.google.com')) {
    await setGoogleDriveWebhookUrl(explicitUrl.trim());
  }

  if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com')) {
    return {
      success: false,
      message: 'URL do Webhook do Google Apps Script não configurada.',
    };
  }

  if (isSyncing) {
    return {
      success: false,
      message: 'Uma sincronização com o Google Drive já está em andamento.',
    };
  }

  isSyncing = true;
  try {
    const db = await getDatabase();

    // 1. Preparar backup completo JSON
    const queryAll = (sql: string, params: any[] = []) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    };

    const companies = queryAll('SELECT * FROM companies');
    const users = queryAll('SELECT id, name, email, role, avatar, active, created_at, allowed_companies FROM users');
    const drivers = queryAll('SELECT * FROM drivers');
    const bank_accounts = queryAll('SELECT * FROM bank_accounts');
    const import_batches = queryAll('SELECT * FROM import_batches');
    const transactions = queryAll(`
      SELECT id, company_id, import_batch_id, bank_name, bank_code, fitid, date, type, amount,
             original_amount, returned_amount, description, memo, document_number, is_pix,
             is_pix_return, return_reason, status, reconciled_at, reconciled_by_user_id,
             reconciled_by_user_name, driver_id, driver_name, driver_plate, session_id,
             voucher_number, notes, counterparty_name, counterparty_doc, linked_tx_id, created_at
      FROM transactions
      ORDER BY date DESC, created_at DESC
    `);
    const reconciliation_sessions = queryAll('SELECT * FROM reconciliation_sessions ORDER BY started_at DESC');
    const audit_logs = queryAll('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500');

    const backupData = {
      system: 'ConciliaPix Pro',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      stats: {
        companiesCount: companies.length,
        usersCount: users.length,
        driversCount: drivers.length,
        transactionsCount: transactions.length,
        sessionsCount: reconciliation_sessions.length,
      },
      data: {
        companies,
        users,
        drivers,
        bank_accounts,
        import_batches,
        transactions,
        reconciliation_sessions,
        audit_logs,
      },
    };

    // 2. Preparar linhas estruturadas para o Google Sheets / Excel
    // O backup JSON completo acima preserva 100% de todas as 12.000 transações.
    // Na planilha, enviamos as 1.000 mais recentes para carregar instantaneamente sem estourar o limite de tempo do Google Apps Script.
    const recentTransactions = transactions.slice(0, 1000);
    const transactionsHeaders = [
      'Data',
      'Empresa',
      'Banco',
      'Tipo',
      'Valor (R$)',
      'Status',
      'Descrição',
      'Documento / FITID',
      'É Pix?',
      'Motorista Vinculado',
      'Placa',
      'Sessão Acerto',
      'Observações',
    ];

    const transactionsRows = recentTransactions.map((t: any) => [
      t.date || '',
      t.company_id === 'filial' ? 'Filial 01' : 'Matriz',
      t.bank_name || '',
      t.type === 'CREDIT' ? 'CRÉDITO' : 'DÉBITO',
      Number(t.amount) || 0,
      t.status === 'RECONCILED'
        ? 'CONCILIADO'
        : t.status === 'RETURNED'
        ? 'DEVOLVIDO'
        : t.status === 'IGNORED'
        ? 'IGNORADO'
        : 'PENDENTE',
      t.description || t.memo || '',
      t.document_number || t.fitid || '',
      t.is_pix ? 'Sim' : 'Não',
      t.driver_name || '',
      t.driver_plate || '',
      t.session_id || '',
      t.notes || '',
    ]);

    const sessionsHeaders = [
      'Nº Acerto',
      'Data Acerto',
      'Empresa',
      'Motorista',
      'Placa',
      'Status',
      'Qtd Itens',
      'Total Acertado (R$)',
      'Falta/Sobra (R$)',
      'Operador',
      'Observações',
    ];

    const sessionsRows = reconciliation_sessions.map((s: any) => [
      s.id || '',
      s.started_at ? s.started_at.slice(0, 19).replace('T', ' ') : '',
      s.company_id === 'filial' ? 'Filial 01' : 'Matriz',
      s.driver_name || '',
      s.driver_plate || '',
      s.status === 'COMPLETED' ? 'FINALIZADO' : s.status,
      Number(s.total_items) || 0,
      Number(s.total_amount) || 0,
      Number(s.missing_amount) || 0,
      s.operator_user_name || '',
      s.notes || '',
    ]);

    const driversHeaders = [
      'Código',
      'Nome do Motorista',
      'Placa Veículo',
      'Veículo',
      'Rota',
      'Status',
      'Total Acertos',
      'Total Conciliado (R$)',
    ];

    const driversRows = drivers.map((d: any) => [
      d.code || '',
      d.name || '',
      d.vehicle_plate || '',
      d.vehicle_model || '',
      d.route || '',
      d.active ? 'Ativo' : 'Inativo',
      Number(d.total_sessions) || 0,
      Number(d.total_amount_reconciled) || 0,
    ]);

    const payload = {
      triggerReason,
      timestamp: new Date().toISOString(),
      backupData,
      spreadsheetData: {
        transactionsHeaders,
        transactionsRows,
        sessionsHeaders,
        sessionsRows,
        driversHeaders,
        driversRows,
      },
    };

    console.log(`[GoogleDrive] Enviando backup e planilha para ${webhookUrl.slice(0, 45)}...`);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const respText = await response.text();
    const isHtmlResponse =
      respText.includes('<html') ||
      respText.includes('<!DOCTYPE') ||
      respText.includes('Você precisa ter acesso') ||
      respText.includes("window['ppConfig']") ||
      respText.includes('accounts.google.com');

    if (response.status === 403 || response.status === 401 || isHtmlResponse) {
      const msg =
        "Permissão necessária no Google Apps Script: No Apps Script, clique no botão azul 'Implantar' > 'Gerenciar implantações' > Editar (ícone de lápis) > Em 'Quem pode acessar', selecione 'Qualquer pessoa' (Anyone) e salve. Atualmente o Google está exigindo login e bloqueando o envio automático.";
      db.run(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('google_drive_last_status', 'error', datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = 'error', updated_at = datetime('now')`
      );
      db.run(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('google_drive_last_message', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        [msg]
      );
      return { success: false, message: msg };
    }

    let respJson: any;
    try {
      respJson = JSON.parse(respText);
    } catch (_) {
      respJson = { success: response.ok, message: respText };
    }

    const now = new Date().toISOString();
    const success = response.ok && respJson.success !== false;
    const msg = respJson.message || (success ? 'Sincronizado com sucesso!' : `Erro na sincronização (HTTP ${response.status}).`);

    db.run(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ('google_drive_last_sync', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [now]
    );
    db.run(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ('google_drive_last_status', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [success ? 'success' : 'error']
    );
    db.run(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ('google_drive_last_message', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [msg]
    );

    console.log(`[GoogleDrive] Resultado: ${success ? '✅ SUCESSO' : '❌ ERRO'} - ${msg}`);

    return {
      success,
      message: msg,
    };
  } catch (err: any) {
    console.error('[GoogleDrive] Erro na sincronização:', err);
    try {
      const db = await getDatabase();
      db.run(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('google_drive_last_status', 'error', datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = 'error', updated_at = datetime('now')`
      );
      db.run(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('google_drive_last_message', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        [err.message || String(err)]
      );
    } catch (_) {}
    return {
      success: false,
      message: err.message || 'Falha ao conectar ao Google Drive.',
    };
  } finally {
    isSyncing = false;
  }
}

/**
 * Dispara uma sincronização automática em segundo plano com debounce de 10s.
 * Usado após inserções de extratos ou finalização de acertos.
 */
export function scheduleGoogleDriveAutoSync(reason = 'auto'): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(async () => {
    const url = await getGoogleDriveWebhookUrl();
    if (url) {
      console.log(`[GoogleDrive] Disparando auto-sincronização por: ${reason}...`);
      executeGoogleDriveSync(reason).catch((e) => console.warn('[GoogleDrive AutoSync Notice]', e.message));
    }
  }, 10000); // 10 segundos para acumular operações próximas
}
