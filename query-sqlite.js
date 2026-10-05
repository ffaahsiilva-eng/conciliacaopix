import initSqlJs from 'sql.js';
import fs from 'fs';

async function run() {
  const filebuffer = fs.readFileSync('local_downloaded.sqlite');
  const SQL = await initSqlJs();
  const db = new SQL.Database(filebuffer);
  
  const res = db.exec("SELECT count(*) as count FROM transactions");
  console.log("Total:", res[0].values[0][0]);
  
  const cols = db.exec("PRAGMA table_info(transactions)");
  console.log("Columns:", cols[0].values.map(v => v[1]).join(', '));
  
  const first = db.exec("SELECT * FROM transactions LIMIT 1");
  if (first.length > 0) {
    console.log("First TX:", first[0].columns);
    console.log("Values:", first[0].values[0]);
  }
}
run();
