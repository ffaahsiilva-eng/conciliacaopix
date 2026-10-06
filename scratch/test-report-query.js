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
  const companyId = 'matriz';
  const start_date = '';
  const end_date = '';
  const driver_id = 'ALL';

  const sessionConditions = ["s.company_id = ?", "s.status = 'COMPLETED'"];
  const sessionParams = [companyId];

  const sessionWhere = sessionConditions.join(' AND ');

  const sql = `
      SELECT 
        d.id as driver_id,
        d.code as driver_code,
        d.name as driver_name,
        d.vehicle_plate,
        d.route,
        sub.total_pix_reconciled,
        COALESCE(sub.total_amount_reconciled, 0) as total_amount_reconciled,
        COALESCE(sub.total_missing_amount, 0) as total_missing_amount,
        COALESCE(sub.total_sessions_count, 0) as total_sessions,
        sub.first_receipt_date,
        sub.last_receipt_date
      FROM drivers d
      INNER JOIN (
        SELECT 
          s.driver_id,
          SUM(s.missing_amount) as total_missing_amount,
          COUNT(s.id) as total_sessions_count,
          SUM(sess_tx.total_pix) as total_pix_reconciled,
          SUM(sess_tx.total_amount) as total_amount_reconciled,
          MIN(sess_tx.min_date) as first_receipt_date,
          MAX(sess_tx.max_date) as last_receipt_date
        FROM reconciliation_sessions s
        LEFT JOIN (
          SELECT session_id, COUNT(id) as total_pix, SUM(amount) as total_amount, MIN(date) as min_date, MAX(date) as max_date
          FROM transactions 
          WHERE status = 'RECONCILED'
          GROUP BY session_id
        ) sess_tx ON sess_tx.session_id = s.id
        WHERE ${sessionWhere}
        GROUP BY s.driver_id
      ) sub ON sub.driver_id = d.id
      WHERE d.company_id = ?
      ORDER BY (COALESCE(sub.total_amount_reconciled, 0) + COALESCE(sub.total_missing_amount, 0)) DESC
  `;

  console.log('Running query with params:', [...sessionParams, companyId]);
  const res = await queryAll(db, sql, [...sessionParams, companyId]);
  console.log('Driver summary results count:', res.length);
  console.log('Driver summary results:', JSON.stringify(res, null, 2));

  // Also check if any driver is in drivers table
  const drivers = await queryAll(db, 'SELECT * FROM drivers WHERE company_id = ?', [companyId]);
  console.log('Drivers in company:', drivers.length);
  console.log('Driver IDs in reconciliation_sessions:', await queryAll(db, 'SELECT DISTINCT driver_id, driver_name, company_id FROM reconciliation_sessions'));
}
main().catch(console.error);
