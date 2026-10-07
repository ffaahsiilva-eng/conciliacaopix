import pg from 'pg';
import dotenv from 'dotenv';
import initSqlJs from 'sql.js';
import { gunzipSync } from 'zlib';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.SQL_HOST,
  port: parseInt(process.env.SQL_PORT || '6543'),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  ssl: { rejectUnauthorized: false }
});

const snap = await pool.query(
  `SELECT data FROM system_snapshots WHERE key = 'main_db' ORDER BY updated_at DESC LIMIT 1`
);
const raw = Buffer.isBuffer(snap.rows[0].data) ? snap.rows[0].data : Buffer.from(snap.rows[0].data, 'base64');
const sqliteBuffer = (raw[0] === 0x1f && raw[1] === 0x8b) ? gunzipSync(raw) : raw;

const SQL = await initSqlJs();
const db = new SQL.Database(sqliteBuffer);
const result = db.exec(
  `SELECT id, name, email, role, active FROM users WHERE LOWER(email) = 'fabricio@cristalsul.com.br'`
);
if (result.length && result[0].values.length) {
  const r = result[0].values[0];
  console.log('Confirmação no Supabase (snapshot ativo):');
  console.log(`  id=${r[0]} nome="${r[1]}" email=${r[2]} role=${r[3]} active=${r[4]}`);
}

const all = db.exec(`SELECT email, role FROM users ORDER BY role DESC, email`);
console.log('\nTodos os usuários:');
for (const row of all[0].values) {
  console.log(`  ${row[1].padEnd(8)} ${row[0]}`);
}

await pool.end();