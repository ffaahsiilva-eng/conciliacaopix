import pg from 'pg';
import dotenv from 'dotenv';
import zlib from 'zlib';

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
      const b64Data = res.rows[0].data;
      const buffer = Buffer.from(b64Data, 'base64');
      const unzipped = zlib.gunzipSync(buffer);
      const json = JSON.parse(unzipped.toString('utf-8'));
      console.log('Parsed successfully!');
      console.log('Transactions count:', json.transactions?.length || 0);
      if(json.transactions?.length > 0) {
         console.log('First TX:', json.transactions[0].date, json.transactions[0].amount, json.transactions[0].description);
      }
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
