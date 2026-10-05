const initSqlJs = require('sql.js');
const fs = require('fs');
initSqlJs().then(S => {
  const db = new S.Database(fs.readFileSync('data/conciliapix.sqlite'));
  const res = [];
  const stmt = db.prepare("SELECT description FROM transactions WHERE description LIKE '0%' LIMIT 10");
  while(stmt.step()) res.push(stmt.getAsObject());
  console.log("Found:", res);
});
