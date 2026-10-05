const initSqlJs = require('sql.js');

initSqlJs().then(SQL => {
  const db = new SQL.Database();
  db.run("CREATE TABLE test (id TEXT, company_id TEXT)");
  
  const ids = [];
  for(let i=0; i<15; i++) {
    const id = `tx${i}`;
    ids.push(id);
    db.run(`INSERT INTO test VALUES ('${id}', 'matriz')`);
  }

  const placeholders = ids.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM test WHERE id IN (${placeholders}) AND company_id = ?`);
  
  try {
    stmt.bind([...ids, 'matriz']);
    const results = [];
    while(stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    console.log(`Bound ${ids.length} items. Result count: ${results.length}`);
  } catch(e) {
    console.error("Bind error:", e.message);
  }
});
