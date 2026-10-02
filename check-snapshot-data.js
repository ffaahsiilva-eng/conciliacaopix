import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
import initSqlJs from 'sql.js';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.SQL_HOST,
  port: parseInt(process.env.SQL_PORT || '6543'),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function checkData() {
  console.log('Verificando snapshot do Supabase...');

  // Load snapshot
  const res = await pool.query(`SELECT data FROM system_snapshots WHERE key = 'main_db'`);
  if (!res.rows.length) {
    console.log('Snapshot nao encontrado!');
    return;
  }

  const b64 = res.rows[0].data;
  const buffer = Buffer.from(b64, 'base64');
  console.log(`Snapshot carregado: ${buffer.length} bytes`);

  // Load into sql.js
  const SQL = await initSqlJs();
  const db = new SQL.Database(buffer);

  // Count transactions
  const tx = db.exec('SELECT COUNT(*) as total FROM transactions');
  const users = db.exec('SELECT COUNT(*) as total FROM users');
  const drivers = db.exec('SELECT COUNT(*) as total FROM drivers');
  const batches = db.exec('SELECT COUNT(*) as total FROM import_batches');

  console.log(`\n=== Dados dentro do snapshot ===`);
  console.log(`Transações: ${tx[0]?.values[0][0]}`);
  console.log(`Usuários: ${users[0]?.values[0][0]}`);
  console.log(`Motoristas: ${drivers[0]?.values[0][0]}`);
  console.log(`Lotes: ${batches[0]?.values[0][0]}`);

  db.close();
  await pool.end();
}

checkData().catch(console.error);
