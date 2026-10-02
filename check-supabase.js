import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.SQL_HOST,
  port: parseInt(process.env.SQL_PORT || '6543'),
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  database: process.env.SQL_DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function diagnose() {
  console.log('Conectando ao Supabase...');
  console.log('Host:', process.env.SQL_HOST);
  
  try {
    // Check if system_snapshots table exists
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    console.log('\n=== Tabelas no banco ===');
    tables.rows.forEach(r => console.log(' -', r.table_name));

    // Check system_snapshots content
    const snapshots = await pool.query(`
      SELECT key, length(data) as data_len, updated_at 
      FROM system_snapshots ORDER BY updated_at DESC
    `);
    
    console.log('\n=== Snapshots salvos ===');
    if (snapshots.rows.length === 0) {
      console.log('NENHUM snapshot encontrado! O banco está vazio.');
    } else {
      snapshots.rows.forEach(r => {
        console.log(`Key: ${r.key}, Tamanho: ${r.data_len} chars, Atualizado: ${r.updated_at}`);
      });
    }

  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    await pool.end();
  }
}

diagnose();
