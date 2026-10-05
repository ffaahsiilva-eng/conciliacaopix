const fs = require('fs');
const initSqlJs = require('sql.js');

initSqlJs().then(SQL => {
  const dbPath = 'data/conciliapix.sqlite';
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Let's get two valid PENDING transaction IDs
  const txs = db.exec("SELECT id FROM transactions WHERE status = 'PENDING' LIMIT 2");
  if (!txs || !txs[0] || txs[0].values.length < 2) {
    console.log("Not enough pending txs");
    return;
  }
  const id1 = txs[0].values[0][0];
  const id2 = txs[0].values[1][0];

  const transaction_ids = [id1, id2];
  const companyId = 'matriz';

  const placeholders = transaction_ids.map(() => '?').join(',');
  const checkStmt = db.prepare(
    `SELECT id, status, reconciled_by_user_name, driver_name, amount, description, date 
     FROM transactions WHERE id IN (${placeholders}) AND company_id = ?`
  );
  
  try {
    checkStmt.bind([...transaction_ids, companyId]);
    const existingSelected = [];
    while (checkStmt.step()) {
      existingSelected.push(checkStmt.getAsObject());
    }
    checkStmt.free();
    console.log("Found:", existingSelected);
  } catch (e) {
    console.error("Error:", e.message);
  }
});
