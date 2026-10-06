import dotenv from 'dotenv';
dotenv.config();
import { getDatabase } from '../server/db.js';

async function main() {
  const db = await getDatabase();
  const res1 = db.exec("SELECT COUNT(id) FROM transactions WHERE status='RECONCILED' AND (session_id IS NULL OR session_id='')");
  console.log('Reconciled without session:', res1[0]?.values[0][0]);
  const res2 = db.exec("SELECT COUNT(id) FROM transactions WHERE status='RECONCILED'");
  console.log('Total reconciled:', res2[0]?.values[0][0]);
  const res3 = db.exec("SELECT COUNT(id) FROM reconciliation_sessions");
  console.log('Total sessions:', res3[0]?.values[0][0]);
}
main().catch(console.error);
