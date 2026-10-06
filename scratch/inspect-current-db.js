import dotenv from 'dotenv';
dotenv.config();
import { getDatabase } from '../server/db.js';

async function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

async function main() {
  const db = await getDatabase();
  console.log('--- COMPANIES ---');
  console.log(await queryAll(db, 'SELECT id, name, code FROM companies'));
  console.log('--- RECONCILIATION SESSIONS ---');
  console.log(await queryAll(db, 'SELECT id, company_id, driver_id, driver_name, status, total_items, total_amount, missing_amount, started_at, completed_at FROM reconciliation_sessions'));
  console.log('--- RECONCILED TRANSACTIONS ---');
  console.log(await queryAll(db, 'SELECT id, company_id, status, driver_id, driver_name, session_id, amount, date, reconciled_at FROM transactions WHERE status = "RECONCILED"'));
  console.log('--- TOTAL TRANSACTIONS BY STATUS ---');
  console.log(await queryAll(db, 'SELECT status, count(*) as count FROM transactions GROUP BY status'));
  console.log('--- ALL DRIVERS ---');
  console.log(await queryAll(db, 'SELECT id, name, code, company_id FROM drivers'));
}
main().catch(console.error);
