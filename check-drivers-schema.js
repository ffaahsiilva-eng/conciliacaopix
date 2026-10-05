import initSqlJs from 'sql.js';
import fs from 'fs';

const SQL = await initSqlJs();
const buf = fs.readFileSync('d:\\PIX\\conciliacaopix\\data\\conciliapix.sqlite');
const db = new SQL.Database(buf);

// Check table schema and indexes for drivers
const r = db.exec("SELECT sql FROM sqlite_master WHERE tbl_name='drivers'");
console.log('=== DRIVERS SCHEMA & INDEXES ===');
if (r[0]) {
  r[0].values.forEach(row => console.log(row[0]));
}

// Check all drivers to see codes and company_ids
const drivers = db.exec("SELECT id, company_id, code, name, vehicle_plate, active FROM drivers ORDER BY company_id, code");
console.log('\n=== ALL DRIVERS ===');
if (drivers[0]) {
  console.log('Columns:', drivers[0].columns.join(' | '));
  drivers[0].values.forEach(row => console.log(row.join(' | ')));
} else {
  console.log('No drivers found');
}

db.close();
