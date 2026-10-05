const http = require('http');
const fs = require('fs');
const initSqlJs = require('sql.js');

async function run() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('data/conciliapix.sqlite'));
  const txs = db.exec("SELECT id FROM transactions WHERE status = 'PENDING' LIMIT 3");
  const driver = db.exec("SELECT id FROM drivers LIMIT 1");
  
  const ids = [txs[0].values[0][0], txs[0].values[1][0]];
  const dId = driver[0].values[0][0];
  
  const payload = JSON.stringify({
    driver_id: dId,
    transaction_ids: ids,
    actorUser: { id: 'usr-admin', name: 'franco duran', role: 'ADMIN' },
    company_id: 'matriz'
  });

  const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/reconciliation/finish-session',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Response:', res.statusCode, data);
    });
  });
  
  req.write(payload);
  req.end();
}

run();
