import { getDatabase, persistDatabaseSync } from './server/db.js';

(async () => {
  try {
    const db = await getDatabase();
    const r = db.exec("SELECT sql FROM sqlite_master WHERE tbl_name='drivers'");
    console.log("MIGRATED SCHEMA:");
    console.log(r[0].values[0][0]);
    // Save to disk to ensure it's saved locally
    persistDatabaseSync();
    console.log("Migration complete.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
