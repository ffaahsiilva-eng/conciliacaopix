import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { getDatabase, persistDatabase, createLocalBackup } from './server/db.ts';

function getValidTableColumns(db: any, tableName: string): Set<string> {
  try {
    const res = db.exec(`PRAGMA table_info(${tableName})`);
    if (res && res.length && res[0].values) {
      return new Set(res[0].values.map((v: any) => String(v[1])));
    }
  } catch (err: any) {
    console.error(`Erro ao obter colunas de ${tableName}:`, err.message);
  }
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
  const sql = `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;
  db.run(sql, params);
}

async function runImport() {
  const targetFile = process.argv[2] || 'conciliapix.json';
  console.log(`=== INICIANDO RESTAURAÇÃO DE BACKUP: ${targetFile} ===\n`);

  if (!fs.existsSync(targetFile)) {
    console.error(`ERRO: O arquivo ${targetFile} não foi encontrado.`);
    process.exit(1);
  }

  console.log(`1. Lendo e analisando arquivo ${targetFile}...`);
  const rawData = fs.readFileSync(targetFile, 'utf8');
  let parsed: any;
  try {
    parsed = JSON.parse(rawData);
  } catch (e: any) {
    console.error('ERRO: O arquivo JSON é inválido ou está corrompido:', e.message);
    process.exit(1);
  }

  let d = parsed.data || parsed;
  if (Array.isArray(d)) {
    d = { transactions: d };
  }

  console.log(`   Exportado em: ${parsed.exportedAt || 'data não informada'}`);
  console.log(`   Estatísticas no arquivo:`, parsed.stats || 'N/A');

  console.log('\n2. Inicializando banco de dados...');
  const db = await getDatabase();

  console.log('\n3. Criando backup de segurança do estado atual do banco...');
  try {
    createLocalBackup('pre-json-restore');
    console.log('   Backup local criado com sucesso em data/backups/');
  } catch (err: any) {
    console.warn('   Aviso ao criar backup local prévio:', err.message);
  }

  const companyCols = getValidTableColumns(db, 'companies');
  const userCols = getValidTableColumns(db, 'users');
  const driverCols = getValidTableColumns(db, 'drivers');
  const bankCols = getValidTableColumns(db, 'bank_accounts');
  const batchCols = getValidTableColumns(db, 'import_batches');
  const txCols = getValidTableColumns(db, 'transactions');
  const sessionCols = getValidTableColumns(db, 'reconciliation_sessions');
  const auditCols = getValidTableColumns(db, 'audit_logs');

  console.log('\n4. Executando restauração dentro de transação atômica...');
  db.run('BEGIN TRANSACTION');
  try {
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

    console.log(`   Inseridas:`);
    console.log(`   - Empresas: ${companiesCount}`);
    console.log(`   - Usuários: ${usersCount}`);
    console.log(`   - Motoristas: ${driversCount}`);
    console.log(`   - Contas bancárias: ${banksCount}`);
    console.log(`   - Lotes de importação: ${batchesCount}`);
    console.log(`   - Transações: ${txCount}`);
    console.log(`   - Sessões de conciliação: ${sessionsCount}`);
    console.log(`   - Logs de auditoria: ${auditCount}`);

  } catch (err: any) {
    console.error('ERRO DURANTE TRANSAÇÃO DE RESTAURAÇÃO:', err);
    try { db.run('ROLLBACK'); } catch (_) {}
    process.exit(1);
  }

  console.log('\n5. Persistindo banco local e sincronizando snapshot no Supabase...');
  try {
    await persistDatabase();
    console.log('   Persistência concluída com sucesso!');
  } catch (err: any) {
    console.error('   Erro ao persistir banco no Supabase:', err.message);
  }

  console.log('\n6. Conferência de dados após restauração:');
  const tables = ['companies', 'users', 'drivers', 'bank_accounts', 'import_batches', 'transactions', 'reconciliation_sessions', 'audit_logs'];
  for (const t of tables) {
    const res = db.exec(`SELECT COUNT(*) FROM ${t}`);
    console.log(`   Tabela ${t}: ${res[0].values[0][0]} registros`);
  }

  console.log('\n=== RESTAURAÇÃO DO BACKUP CONCLUÍDA COM SUCESSO! ===');
  process.exit(0);
}

runImport().catch((err) => {
  console.error('Falha geral no processo de importação:', err);
  process.exit(1);
});
