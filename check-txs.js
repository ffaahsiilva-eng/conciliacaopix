import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const SQL = await initSqlJs();
  const DB_PATH = path.resolve('data/conciliapix.sqlite');
  
  if (!fs.existsSync(DB_PATH)) {
    console.log('No data/conciliapix.sqlite found');
    return;
  }
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  const txs = db.exec(`SELECT id, amount, status, session_id FROM transactions WHERE driver_name LIKE '%Wellington%' AND status = 'PENDING'`);
  if (txs.length > 0) {
    console.log('--- PENDING TRANSACTIONS ---');
    console.table(txs[0].values);
  } else {
    console.log('No pending transactions found for Wellington.');
  }
}

main();
