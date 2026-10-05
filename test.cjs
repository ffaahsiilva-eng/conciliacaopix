const initSqlJs = require('sql.js');
initSqlJs().then(S => {
  const db = new S.Database();
  db.run('CREATE TABLE t (id INT, v TEXT)');
  db.run("INSERT INTO t VALUES (1, 'A'), (2, 'B'), (3, 'C')");
  const stmt = db.prepare('SELECT * FROM t WHERE id IN (?, ?)');
  stmt.bind([1, 3]);
  const res = [];
  while(stmt.step()) res.push(stmt.getAsObject());
  console.log(res);
});
