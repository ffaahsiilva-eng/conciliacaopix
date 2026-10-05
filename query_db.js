const fs = require('fs');
const initSqlJs = require('sql.js');

initSqlJs().then(SQL => {
  const dbPath = 'data/conciliapix.sqlite';
  const db = new SQL.Database(fs.readFileSync(dbPath));
  
  const res = db.exec("SELECT * FROM reconciliation_sessions ORDER BY created_at DESC LIMIT 5");
  console.log("Sessions:", JSON.stringify(res, null, 2));

  const res2 = db.exec("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10");
  console.log("Audit logs:", JSON.stringify(res2, null, 2));
});
