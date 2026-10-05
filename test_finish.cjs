const fs = require('fs');
const initSqlJs = require('sql.js');

initSqlJs().then(SQL => {
  const dbPath = 'data/conciliapix.sqlite';
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Get 2 valid transactions
  const txs = db.exec("SELECT id, amount FROM transactions WHERE status = 'PENDING' LIMIT 2");
  if (!txs || !txs[0] || txs[0].values.length < 2) {
    console.log("Not enough pending txs");
    return;
  }
  const id1 = txs[0].values[0][0];
  const id2 = txs[0].values[1][0];
  console.log("Tx to reconcile:", id1, id2);

  // Get a driver
  const drvRes = db.exec("SELECT id, name, vehicle_plate FROM drivers LIMIT 1");
  const driver = drvRes[0].values[0];
  
  const transaction_ids = [id1, id2];
  const companyId = 'matriz';
  const actorUser = { id: 'usr-admin', name: 'franco duran', role: 'ADMIN' };
  const finalSessionId = 'sess-test-' + Date.now();
  const nowIso = new Date().toISOString();

  let totalSum = 0;
  
  const placeholders = transaction_ids.map(() => '?').join(',');
  const checkStmt = db.prepare(
    `SELECT id, status, reconciled_by_user_name, driver_name, amount, description, date 
     FROM transactions WHERE id IN (${placeholders}) AND company_id = ?`
  );
  checkStmt.bind([...transaction_ids, companyId]);
  const existingSelected = [];
  while (checkStmt.step()) {
    existingSelected.push(checkStmt.getAsObject());
  }
  checkStmt.free();

  db.run('BEGIN TRANSACTION');
  try {
    for (const tx of existingSelected) {
      totalSum += Number(tx.amount);
      const voucher = null;

      db.run(
        `UPDATE transactions SET
          status = 'RECONCILED',
          reconciled_at = ?,
          reconciled_by_user_id = ?,
          reconciled_by_user_name = ?,
          driver_id = ?,
          driver_name = ?,
          driver_plate = ?,
          session_id = ?,
          voucher_number = ?,
          notes = ?,
          locked_at = ?
         WHERE id = ? AND status = 'PENDING' AND company_id = ?`,
        [
          nowIso,
          actorUser.id,
          actorUser.name,
          driver[0],
          driver[1],
          driver[2],
          finalSessionId,
          voucher,
          null,
          nowIso,
          tx.id,
          companyId
        ]
      );
    }

    db.run(
      `INSERT INTO reconciliation_sessions (
        id, company_id, driver_id, driver_name, driver_plate, operator_user_id, operator_user_name,
        status, started_at, completed_at, total_items, total_amount, missing_amount, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?)`,
      [
        finalSessionId, companyId, driver[0], driver[1], driver[2], actorUser.id, actorUser.name,
        nowIso, nowIso, existingSelected.length, totalSum, 0, null
      ]
    );

    db.run('COMMIT TRANSACTION');
    console.log("Success! Session created.");
    
    // Check if both were updated
    const checkTxs = db.exec(`SELECT id, status, session_id FROM transactions WHERE session_id = '${finalSessionId}'`);
    console.log("Updated txs:", JSON.stringify(checkTxs, null, 2));

  } catch (err) {
    db.run('ROLLBACK TRANSACTION');
    console.error("Error during transaction:", err);
  }
});
