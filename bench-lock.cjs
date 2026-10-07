const initSqlJs = require('sql.js');
(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE transactions (id TEXT PRIMARY KEY, status TEXT, locked_at TEXT, locked_by_user_id TEXT, locked_by_user_name TEXT, locked_by_session_id TEXT, company_id TEXT, description TEXT, amount REAL, driver_name TEXT)');
  console.log('Building 200k fake rows...');
  const insert = db.prepare('INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 200000; i++) {
    insert.run(['id'+i, 'PENDING', null, null, null, null, 'matriz', 'desc', 10.0, 'drv']);
  }
  insert.free();
  const N = 200;
  for (let i = 0; i < 20; i++) {
    const s = db.prepare('SELECT id, status, locked_by_user_id, locked_by_user_name, locked_at, locked_by_session_id, description, amount, driver_name FROM transactions WHERE id IN (?) AND company_id = ?');
    s.bind(['id'+i, 'matriz']);
    while (s.step()) s.getAsObject();
    s.free();
  }
  let t = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    db.run('BEGIN');
    const s = db.prepare('SELECT id, status, locked_by_user_id, locked_by_user_name, locked_at, locked_by_session_id, description, amount, driver_name FROM transactions WHERE id IN (?) AND company_id = ?');
    s.bind(['id'+i, 'matriz']);
    while (s.step()) s.getAsObject();
    s.free();
    db.run('UPDATE transactions SET locked_at=?, locked_by_user_id=?, locked_by_user_name=?, locked_by_session_id=? WHERE id=? AND company_id=? AND status=\'PENDING\'', ['now', 'u', 'n', null, 'id'+i, 'matriz']);
    db.run('COMMIT');
  }
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  console.log('Avg lock (BEGIN+SELECT+UPDATE+COMMIT) 1 row:', (ms/N).toFixed(3), 'ms (over '+N+' runs)');

  t = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) {
    db.run('BEGIN');
    const ph = Array(50).fill('?').join(',');
    const s = db.prepare('SELECT id, status, locked_by_user_id, locked_by_user_name, locked_at, locked_by_session_id, description, amount, driver_name FROM transactions WHERE id IN ('+ph+') AND company_id = ?');
    s.bind([...Array.from({length:50}, (_,k) => 'id'+(k+i*50)), 'matriz']);
    while (s.step()) s.getAsObject();
    s.free();
    for (let k = 0; k < 50; k++) {
      db.run('UPDATE transactions SET locked_at=?, locked_by_user_id=?, locked_by_user_name=?, locked_by_session_id=? WHERE id=? AND company_id=? AND status=\'PENDING\'', ['now', 'u', 'n', null, 'id'+(k+i*50), 'matriz']);
    }
    db.run('COMMIT');
  }
  const ms2 = Number(process.hrtime.bigint() - t) / 1e6;
  console.log('Avg lock 50 rows (50 separate UPDATEs):', (ms2/20).toFixed(3), 'ms');

  t = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) {
    db.run('BEGIN');
    const ph = Array(50).fill('?').join(',');
    const s = db.prepare('SELECT id, status, locked_by_user_id, locked_by_user_name, locked_at, locked_by_session_id, description, amount, driver_name FROM transactions WHERE id IN ('+ph+') AND company_id = ?');
    s.bind([...Array.from({length:50}, (_,k) => 'id'+(k+i*50)), 'matriz']);
    while (s.step()) s.getAsObject();
    s.free();
    const ph2 = Array(50).fill('?').join(',');
    db.run('UPDATE transactions SET locked_at=?, locked_by_user_id=?, locked_by_session_id=? WHERE id IN ('+ph2+') AND company_id=? AND status=\'PENDING\'', ['now', 'u', null, ...Array.from({length:50}, (_,k) => 'id'+(k+i*50)), 'matriz']);
    db.run('COMMIT');
  }
  const ms3 = Number(process.hrtime.bigint() - t) / 1e6;
  console.log('Avg lock 50 rows (1 bulk UPDATE):', (ms3/20).toFixed(3), 'ms');

  t = process.hrtime.bigint();
  const tmpPath = 'C:\\Users\\SnyX\\AppData\\Local\\Temp\\kilo\\bench-db.sqlite';
  for (let i = 0; i < 20; i++) {
    const data = db.export();
    require('fs').writeFileSync(tmpPath, Buffer.from(data));
  }
  const ms4 = Number(process.hrtime.bigint() - t) / 1e6;
  console.log('persistDatabase (200k rows) write:', (ms4/20).toFixed(3), 'ms');
})();
