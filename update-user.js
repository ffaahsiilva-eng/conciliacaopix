import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const SQL = await initSqlJs();
  const DB_PATH = path.resolve('data/conciliapix.sqlite');
  
  if (!fs.existsSync(DB_PATH)) {
    console.log('No database found');
    return;
  }
  
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);
  
  db.exec(`UPDATE users SET role = 'ADMIN' WHERE email = 'ffaahsiilva@gmail.com'`);
  
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  console.log('User role updated successfully');
}

main();
