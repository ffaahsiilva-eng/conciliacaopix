import { getDatabase, saveSnapshotToCloudSql } from './server/db.js';
import fs from 'fs';

(async () => {
  try {
    const db = await getDatabase();
    
    // Check if it's migrated
    const r = db.exec("SELECT sql FROM sqlite_master WHERE tbl_name='drivers'");
    console.log("MIGRATED SCHEMA:");
    console.log(r[0].values[0][0]);
    
    console.log("Exporting DB and uploading to Cloud SQL...");
    const data = db.export();
    const buffer = Buffer.from(data);
    await saveSnapshotToCloudSql(buffer);
    
    console.log("Migration and upload complete.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
