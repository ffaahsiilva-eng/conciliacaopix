import fs from 'fs';
import 'dotenv/config';
import { getDatabase, persistDatabaseSync } from './server/db.js';

// We implement the same logic as /api/database/restore but natively
// so it bypasses all Vercel/Express limits and imports the massive file securely.

function getValidTableColumns(db, tableName) {
  try {
    const cols = db.exec(`PRAGMA table_info(${tableName})`);
    if (!cols || cols.length === 0) return [];
    return cols[0].values.map((v) => v[1]);
  } catch (err) {
    return [];
  }
}

function insertDynamicRow(db, tableName, rowObj, validCols) {
  if (!rowObj || typeof rowObj !== 'object') return;
  const insertData = {};
  for (const key of Object.keys(rowObj)) {
    if (validCols.includes(key)) {
      insertData[key] = rowObj[key];
    }
  }
  const keys = Object.keys(insertData);
  if (keys.length === 0) return;
  
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map((k) => {
    let val = insertData[k];
    if (typeof val === 'object' && val !== null) {
      return JSON.stringify(val);
    }
    return val;
  });

  const sql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`;
  db.run(sql, values);
}

async function runImport() {
  console.log('Iniciando importação segura do backup gigante direto no Banco...');
  
  if (!fs.existsSync('backup-conciliapix.json')) {
    console.error('ERRO: O arquivo backup-conciliapix.json não foi encontrado na pasta principal.');
    return;
  }

  console.log('1. Lendo arquivo backup-conciliapix.json...');
  const rawData = fs.readFileSync('backup-conciliapix.json', 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(rawData);
  } catch (e) {
    console.error('ERRO: O arquivo JSON é inválido ou está corrompido.');
    return;
  }

  let d = parsed.data || parsed;
  if (Array.isArray(d)) {
    d = { transactions: d };
  }

  console.log('2. Inicializando banco de dados local e conectando ao Supabase (Cloud SQL)...');
  const db = await getDatabase();

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
    console.log('3. Limpando dados antigos para receber o backup íntegro...');
    if (Array.isArray(d.audit_logs)) db.run('DELETE FROM audit_logs');
    if (Array.isArray(d.transactions)) db.run('DELETE FROM transactions');
    if (Array.isArray(d.reconciliation_sessions)) db.run('DELETE FROM reconciliation_sessions');
    if (Array.isArray(d.import_batches)) db.run('DELETE FROM import_batches');
    if (Array.isArray(d.bank_accounts)) db.run('DELETE FROM bank_accounts');
    if (Array.isArray(d.drivers)) db.run('DELETE FROM drivers');
    if (Array.isArray(d.users)) db.run('DELETE FROM users');
    if (Array.isArray(d.companies)) db.run('DELETE FROM companies');

    let txCount = 0;
    
    for (const c of (d.companies || [])) insertDynamicRow(db, 'companies', c, companyCols);
    for (const u of (d.users || [])) insertDynamicRow(db, 'users', u, userCols);
    for (const drv of (d.drivers || [])) insertDynamicRow(db, 'drivers', drv, driverCols);
    for (const b of (d.bank_accounts || [])) insertDynamicRow(db, 'bank_accounts', b, bankCols);
    for (const ib of (d.import_batches || [])) insertDynamicRow(db, 'import_batches', ib, batchCols);
    
    for (const tx of (d.transactions || [])) {
      insertDynamicRow(db, 'transactions', tx, txCols);
      txCount++;
    }
    
    for (const s of (d.reconciliation_sessions || [])) insertDynamicRow(db, 'reconciliation_sessions', s, sessionCols);
    for (const a of (d.audit_logs || [])) insertDynamicRow(db, 'audit_logs', a, auditCols);

    db.run('COMMIT');

    console.log(`4. Sucesso! Inseridas ${txCount} transações.`);
    console.log('5. Sincronizando e enviando snapshot para a nuvem (Supabase)...');
    
    persistDatabaseSync();

    console.log('=== IMPORTAÇÃO CONCLUÍDA COM SUCESSO ===');
    console.log('O seu sistema agora irá continuar salvando corretamente a partir deste ponto, totalmente seguro na nuvem!');
    
    // Allow process to finish naturally after sync
    setTimeout(() => {
      console.log('Pode fechar esta janela ou abrir o servidor local.');
      process.exit(0);
    }, 3000);

  } catch (err) {
    console.error('ERRO DURANTE RESTAURAÇÃO:', err);
    try { db.run('ROLLBACK'); } catch (_) {}
  }
}

runImport();
