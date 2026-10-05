const initSqlJs = require('sql.js');

initSqlJs().then(SQL => {
  const db = new SQL.Database();
  db.run("CREATE TABLE test (id TEXT)");
  db.run("INSERT INTO test VALUES ('A')");

  try {
    const stmt = db.prepare(`SELECT * FROM test WHERE id IN ()`);
    stmt.free();
    console.log("No syntax error.");
  } catch(e) {
    console.error("Syntax error:", e.message);
  }
});
