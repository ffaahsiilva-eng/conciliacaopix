const fs = require('fs');
const initSqlJs = require('sql.js');

initSqlJs().then(SQL => {
  const dbPath = 'data/conciliapix.sqlite';
  const db = new SQL.Database(fs.readFileSync(dbPath));

  try {
    const res = db.exec("SELECT id, status, total_items, total_amount, missing_amount, started_at, completed_at FROM reconciliation_sessions WHERE total_items = 0");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("Erro ao consultar", err);
  }
});
