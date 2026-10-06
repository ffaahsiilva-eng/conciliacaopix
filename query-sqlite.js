const Database = require('better-sqlite3');
const db = new Database('data/conciliapix.sqlite');

const sessionWhere = "s.company_id = 'default' AND s.status = 'COMPLETED'";

const rows = db.prepare(`
      SELECT 
        d.id as driver_id,
        d.code as driver_code,
        d.name as driver_name,
        d.vehicle_plate,
        d.route,
        sub.total_pix_reconciled,
        sub.total_amount_reconciled,
        sub.total_missing_amount,
        sub.total_sessions_count,
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
      WHERE d.company_id = 'default'
`).all();

console.log(rows);
