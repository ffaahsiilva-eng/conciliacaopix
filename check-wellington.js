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

  const sessions = db.exec(`SELECT id, driver_name, total_amount, completed_at FROM reconciliation_sessions WHERE driver_name LIKE '%Wellington%'`);
  if (sessions.length > 0) {
    console.log('--- SESSIONS ---');
    console.table(sessions[0].values);
  } else {
    console.log('No sessions found for Wellington.');
  }
}

main();
