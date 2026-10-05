const fs = require('fs');
const initSqlJs = require('sql.js');

initSqlJs().then(SQL => {
  const dbPath = 'data/conciliapix.sqlite';
  const db = new SQL.Database(fs.readFileSync(dbPath));

  try {
    const res = db.run("DELETE FROM reconciliation_sessions WHERE status = 'IN_PROGRESS'");
    console.log("Limpos registros fantasmas 'IN_PROGRESS'!");
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
  } catch (err) {
    console.error("Erro ao limpar registros fantasma", err);
  }
});
