const initSqlJs = require('sql.js');

initSqlJs().then(SQL => {
  const db = new SQL.Database();
  db.run("CREATE TABLE test (id TEXT)");
  db.run("INSERT INTO test VALUES ('A')");
  db.run("INSERT INTO test VALUES ('B')");
  db.run("INSERT INTO test VALUES ('C')");

  const ids = ['A', 'C'];
  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM test WHERE id IN (${placeholders})`);
  
  // Method 1: passing array
  stmt.bind(ids);
  
  const results = [];
  while(stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  console.log("Results with array bind:", results);
});
