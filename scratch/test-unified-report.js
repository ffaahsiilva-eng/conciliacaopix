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

  const sqlUnified = `
    WITH driver_tx AS (
      SELECT 
        driver_id,
        COUNT(id) as total_pix_reconciled,
        SUM(amount) as total_amount_reconciled,
        MIN(date) as first_receipt_date,
        MAX(date) as last_receipt_date
      FROM transactions
      WHERE company_id = ? AND status = 'RECONCILED' AND driver_id IS NOT NULL AND driver_id != ''
      GROUP BY driver_id
    ),
    driver_sess AS (
      SELECT 
        driver_id,
        COUNT(id) as total_sessions_count,
        SUM(missing_amount) as total_missing_amount
      FROM reconciliation_sessions
      WHERE company_id = ? AND status = 'COMPLETED'
      GROUP BY driver_id
    ),
    all_driver_ids AS (
      SELECT id as driver_id FROM drivers WHERE company_id = ?
      UNION
      SELECT driver_id FROM driver_tx
      UNION
      SELECT driver_id FROM driver_sess
    )
    SELECT 
      adi.driver_id,
      COALESCE(d.code, 'MOT') as driver_code,
      COALESCE(d.name, (SELECT driver_name FROM transactions WHERE driver_id = adi.driver_id LIMIT 1), 'Motorista') as driver_name,
      COALESCE(d.vehicle_plate, (SELECT driver_plate FROM transactions WHERE driver_id = adi.driver_id LIMIT 1), '') as vehicle_plate,
      d.route,
      COALESCE(tx.total_pix_reconciled, 0) as total_pix_reconciled,
      COALESCE(tx.total_amount_reconciled, 0) as total_amount_reconciled,
      COALESCE(sess.total_missing_amount, 0) as total_missing_amount,
      COALESCE(sess.total_sessions_count, 0) as total_sessions,
      tx.first_receipt_date,
      tx.last_receipt_date
    FROM all_driver_ids adi
    LEFT JOIN drivers d ON d.id = adi.driver_id
    LEFT JOIN driver_tx tx ON tx.driver_id = adi.driver_id
    LEFT JOIN driver_sess sess ON sess.driver_id = adi.driver_id
    WHERE (COALESCE(tx.total_pix_reconciled, 0) > 0 OR COALESCE(sess.total_sessions_count, 0) > 0)
    ORDER BY (COALESCE(tx.total_amount_reconciled, 0) + COALESCE(sess.total_missing_amount, 0)) DESC
  `;

  const results = await queryAll(db, sqlUnified, [companyId, companyId, companyId]);
  console.log('Results count:', results.length);
  console.log('Results:', JSON.stringify(results, null, 2));
}
main().catch(console.error);
