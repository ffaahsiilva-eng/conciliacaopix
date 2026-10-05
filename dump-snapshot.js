import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const pool = new pg.Pool({
  host: process.env.SQL_HOST,
  port: parseInt(process.env.SQL_PORT || '6543'),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query('SELECT data FROM system_snapshots WHERE key = $1', ['main_db']);
    if (res.rows.length > 0) {
      fs.writeFileSync('snapshot-data.json', res.rows[0].data);
      console.log('Saved to snapshot-data.json');
    } else {
      console.log('No data found');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    pool.end();
  }
}
run();
