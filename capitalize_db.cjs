const fs = require('fs');
const initSqlJs = require('sql.js');

const formatName = (name) => {
  if (!name) return name;
  return name.toLowerCase().replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
};

initSqlJs().then(SQL => {
  const dbPath = 'data/conciliapix.sqlite';
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);

  try {
    // DRIVERS
    let res = db.exec("SELECT id, name FROM drivers");
    if (res.length > 0) {
      for (const row of res[0].values) {
        const id = row[0];
        const oldName = row[1];
        const newName = formatName(oldName);
        if (oldName !== newName) {
          db.run("UPDATE drivers SET name = ? WHERE id = ?", [newName, id]);
        }
      }
    }

    // USERS
    res = db.exec("SELECT id, name FROM users");
    if (res.length > 0) {
      for (const row of res[0].values) {
        const id = row[0];
        const oldName = row[1];
        const newName = formatName(oldName);
        if (oldName !== newName) {
          db.run("UPDATE users SET name = ? WHERE id = ?", [newName, id]);
        }
      }
    }

    // SESSIONS
    res = db.exec("SELECT id, driver_name, operator_user_name FROM reconciliation_sessions");
    if (res.length > 0) {
      for (const row of res[0].values) {
        const id = row[0];
        const dn = formatName(row[1]);
        const on = formatName(row[2]);
        db.run("UPDATE reconciliation_sessions SET driver_name = ?, operator_user_name = ? WHERE id = ?", [dn, on, id]);
      }
    }

    // TRANSACTIONS
    res = db.exec("SELECT id, driver_name, reconciled_by_user_name, locked_by_user_name, counterparty_name FROM transactions");
    if (res.length > 0) {
      for (const row of res[0].values) {
        const id = row[0];
        const dn = formatName(row[1]);
        const rbu = formatName(row[2]);
        const lbu = formatName(row[3]);
        const cp = formatName(row[4]);
        db.run("UPDATE transactions SET driver_name = ?, reconciled_by_user_name = ?, locked_by_user_name = ?, counterparty_name = ? WHERE id = ?", [dn, rbu, lbu, cp, id]);
      }
    }

    // AUDIT LOGS
    res = db.exec("SELECT id, user_name FROM audit_logs");
    if (res.length > 0) {
      for (const row of res[0].values) {
        const id = row[0];
        const an = formatName(row[1]);
        db.run("UPDATE audit_logs SET user_name = ? WHERE id = ?", [an, id]);
      }
    }

    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    console.log("Banco de dados atualizado com nomes formatados (Capitalize)!");
  } catch (err) {
    console.error("Erro", err);
  }
});
