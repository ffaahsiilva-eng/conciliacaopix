const fs = require('fs');
const initSqlJs = require('sql.js');

initSqlJs().then(SQL => {
  const dbPath = 'data/conciliapix.sqlite';
  const db = new SQL.Database(fs.readFileSync(dbPath));
  
  const res = db.exec("SELECT * FROM reconciliation_sessions WHERE status = 'IN_PROGRESS' OR status = 'CANCELLED'");
  console.log("In progress or cancelled sessions:", JSON.stringify(res, null, 2));
});
