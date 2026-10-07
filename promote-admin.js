import pg from 'pg';
import dotenv from 'dotenv';
import initSqlJs from 'sql.js';
import { gunzipSync, gzipSync } from 'zlib';

dotenv.config();

const TARGET_EMAIL = 'fabricio@cristalsul.com.br';

const pool = new pg.Pool({
  host: process.env.SQL_HOST,
  port: parseInt(process.env.SQL_PORT || '6543'),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('[1/5] Carregando snapshot do Supabase...');
  const snap = await pool.query(
    `SELECT data FROM system_snapshots WHERE key = 'main_db' ORDER BY updated_at DESC LIMIT 1`
  );
  if (snap.rows.length === 0) {
    throw new Error('Nenhum snapshot encontrado.');
  }

  // data pode vir como bytea (Buffer) ou como texto base64 dependendo do save
  const data = snap.rows[0].data;
  let raw;
  if (Buffer.isBuffer(data)) {
    raw = data;
  } else if (typeof data === 'string') {
    // Detectar se já é base64 de gzip (começa com H4sI...) ou base64 cru
    raw = Buffer.from(data, 'base64');
  } else {
    raw = Buffer.from(data);
  }
  const isGzip = raw[0] === 0x1f && raw[1] === 0x8b;
  let sqliteBuffer;
  if (isGzip) {
    console.log('  → gzip detectado, descompactando...');
    sqliteBuffer = gunzipSync(raw);
  } else {
    sqliteBuffer = raw;
  }
  console.log(`  → Buffer SQLite: ${sqliteBuffer.length} bytes`);

  console.log('[2/5] Abrindo SQLite com sql.js...');
  const SQL = await initSqlJs();
  const db = new SQL.Database(sqliteBuffer);

  console.log('[3/5] Procurando usuário pelo email...');
  const result = db.exec(
    `SELECT id, name, email, role, active FROM users WHERE LOWER(email) = LOWER('${TARGET_EMAIL.replace(/'/g, "''")}')`
  );
  if (result.length === 0 || result[0].values.length === 0) {
    throw new Error(`Usuário ${TARGET_EMAIL} não encontrado.`);
  }
  const [id, name, email, role, active] = result[0].values[0];
  console.log(`  → Encontrado: id=${id} nome="${name}" email=${email} role=${role} active=${active}`);

  if (role === 'ADMIN') {
    console.log('  → Já é ADMIN. Nada a fazer.');
    await pool.end();
    return;
  }

  console.log('[4/5] Atualizando role para ADMIN...');
  db.run(`UPDATE users SET role = 'ADMIN' WHERE id = ?`, [id]);
  // Persistir em ambos os snapshots
  const changed = db.exec(`SELECT id, role FROM users WHERE id = '${id.replace(/'/g, "''")}'`);
  console.log(`  → Após update: role=${changed[0].values[0][1]}`);

  // Exportar SQLite serializado
  const newBuffer = Buffer.from(db.export());
  console.log(`  → Novo buffer: ${newBuffer.length} bytes`);

  // Compactar em gzip e enviar como base64 (mesmo formato que o servidor usa)
  const gz = gzipSync(newBuffer, { level: 3 });
  const b64 = gz.toString('base64');
  console.log(`  → Base64 gzip: ${b64.length} chars`);

  console.log('[5/5] Salvando snapshots no Supabase...');
  await pool.query(
    `UPDATE system_snapshots
       SET data = $1, updated_at = NOW()
     WHERE key IN ('main_db', 'main_db_backup')`,
    [b64]
  );

  console.log('OK: usuário promovido a ADMIN em main_db e main_db_backup.');
  console.log('Reinicie o servidor ConciliaPix para recarregar o snapshot.');
  await pool.end();
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});