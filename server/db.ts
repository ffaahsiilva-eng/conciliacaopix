import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { gzipSync, gunzipSync } from 'zlib';

const { Pool } = pg;

// No Vercel, o sistema de arquivos é apenas leitura, exceto pela pasta /tmp.
const isVercel = !!process.env.VERCEL;
const DB_DIR = isVercel ? '/tmp/data' : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'conciliapix.sqlite');

let dbInstance: Database | null = null;
let dbInitPromise: Promise<Database> | null = null;

// Instância de sql.js pronta, reaproveitada pelas validações de snapshot para
// não recarregar o wasm a cada checagem.
let bootSqlFactory: any = null;
let saveDebounceTimer: NodeJS.Timeout | null = null;
let pgPool: pg.Pool | null = null;
let isSavingToCloudSql = false;
let pendingSaveBuffer: Buffer | null = null;

export function getCloudSqlPool(): pg.Pool | null {
  if (process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_PASSWORD) {
    if (!pgPool) {
      pgPool = new Pool({
        host: process.env.SQL_HOST,
        port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 5432,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME || 'postgres',
        ssl: { rejectUnauthorized: false }, // Required for Supabase
        max: 5,
        connectionTimeoutMillis: 20000, // 20s to allow Cloud SQL scale-to-zero to wake up
        idleTimeoutMillis: 30000,
        allowExitOnIdle: true,
        keepAlive: true,
        keepAliveInitialDelayMillis: 5000,
        statement_timeout: 45000,
        query_timeout: 45000,
      });

      pgPool.on('error', (err: any) => {
        const msg = err?.message || '';
        if (
          msg.includes('Connection terminated') ||
          msg.includes('timeout') ||
          err?.code === 'ECONNRESET' ||
          err?.code === '57P01' ||
          err?.code === 'ETIMEDOUT'
        ) {
          // Expected idle socket teardown by Cloud SQL scale-to-zero; pg purges the client
          return;
        }
        console.warn('[CloudSQL Pool Notice]', msg);
      });
    }
    return pgPool;
  }

  // Sem as variáveis do Supabase, o app não tem onde persistir. Em deploy
  // (Render, Vercel) isso significa banco vazio a cada restart, sem nenhum
  // aviso visível — o app só mostrava telas sem dados. O log abaixo deixa o
  // diagnóstico explícito.
  if (!isVercel && !databaseMisconfigWarningShown) {
    databaseMisconfigWarningShown = true;
    console.warn(
      '\n' +
      '='.repeat(70) + '\n' +
      '⚠️  SUPABASE NÃO CONFIGURADO — o banco ficará VAZIO neste deploy.\n' +
      '\n' +
      'Defina estas variáveis no painel do serviço (Render/Vercel) e reinicie:\n' +
      '  SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD, SQL_DB_NAME\n' +
      '\n' +
      'O arquivo .env é ignorado pelo git e NÃO é lido em deploy.\n' +
      'Sem essas variáveis, loadSnapshotFromCloudSql() é um no-op e o app\n' +
      'sobe com um banco SQLite vazio a cada restart.\n' +
      '='.repeat(70) + '\n'
    );
  }

  return null;
}

let databaseMisconfigWarningShown = false;

export async function resetCloudSqlPool(): Promise<void> {
  if (pgPool) {
    const oldPool = pgPool;
    pgPool = null;
    try {
      await oldPool.end();
    } catch (_) {}
  }
}

export async function safeCloudSqlQuery<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[],
  timeoutMs = 30000
): Promise<pg.QueryResult<T> | null> {
  const pool = getCloudSqlPool();
  if (!pool) return null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const queryPromise = pool.query<T>(text, params);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Cloud SQL query timed out')), timeoutMs)
      );
      return await Promise.race([queryPromise, timeoutPromise]);
    } catch (err: any) {
      const msg = err?.message || '';
      const isConnectionIssue =
        msg.includes('Connection terminated') ||
        msg.includes('timed out') ||
        msg.includes('timeout') ||
        err?.code === 'ECONNRESET' ||
        err?.code === '57P01' ||
        err?.code === 'ETIMEDOUT';

      if (isConnectionIssue) {
        await resetCloudSqlPool();
      }

      if (attempt < 3 && isConnectionIssue) {
        const backoffMs = attempt * 1500;
        console.log(`[CloudSQL] Waiting ${backoffMs}ms for database to respond (attempt ${attempt}/3)...`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      console.warn(`[CloudSQL Query] Transient issue (${attempt}/3):`, msg);
      return null;
    }
  }
  return null;
}


// Última vez que o arquivo local foi gravado. Usado para decidir, no boot,
// qual das duas cópias (local x Cloud SQL) é a mais recente: sem isso, um
// snapshot antigo no Cloud SQL sobrescrevia o trabalho mais recente que
// hadn't chegado ao upload ainda.
let localFileLastWriteMs = 0;

// Timestamp (ms) do snapshot no Cloud SQL, preenchido por loadSnapshotFromCloudSql.
let cloudSnapshotUpdatedMs = 0;

/** Marca o arquivo local como a fonte mais recente (chamado após cada gravação). */
export function markLocalFileFresh(): void {
  try {
    if (fs.existsSync(DB_FILE)) {
      localFileLastWriteMs = fs.statSync(DB_FILE).mtimeMs;
    }
  } catch (_) {}
}

/** Timestamp (ms) do último save local bem-sucedido. */
export function getLocalFileMtime(): number {
  return localFileLastWriteMs;
}

export async function loadSnapshotFromCloudSql(): Promise<Buffer | null> {
  // Try up to 4 times with backoff to handle cold start when Cloud SQL is spinning up from scale-to-zero
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      // A idade do snapshot é calculada pelo PRÓPRIO Postgres (em UTC), não
      // comparando `updated_at` com o relógio do processo.
      //
      // Por quê: a coluna updated_at é TIMESTAMP WITHOUT TIME ZONE e o
      // Postgres a grava com NOW(), que usa o fuso do SERVIDOR do banco
      // (UTC-3). O driver pg converte esse valor usando o fuso LOCAL do
      // processo — que no Render é UTC. A diferença de 3h fazia o Render
      // concluir que o snapshot era "3h mais velho" e descartar o banco
      // bom, subiendo com um SQLite vazio.
      //
      // Pedir a idade direto ao banco elimina a conversão de fuso: o que
      // importa não é o instante absoluto, mas se o snapshot é mais novo
      // que o arquivo local.
      const res = await safeCloudSqlQuery<{ data: string; age_seconds: string | null }>(
        `SELECT data, EXTRACT(EPOCH FROM (NOW() - updated_at)) AS age_seconds
           FROM system_snapshots WHERE key = 'main_db'`,
        undefined,
        35000
      );
      if (res && res.rows.length > 0 && res.rows[0]?.data) {
        const raw = Buffer.from(res.rows[0].data, 'base64');
        // Detect gzip magic bytes (1f 8b) and decompress if needed
        let buf: Buffer;
        if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
          buf = gunzipSync(raw);
          console.log(`[CloudSQL] Decompressed gzip snapshot: ${raw.length} → ${buf.length} bytes`);
        } else {
          buf = raw;
        }
        if (buf.length > 0) {
          // Track the raw SQLite bytes for consistent Safety Shield comparisons
          knownHealthyRawBytes = buf.length;

          // Converte a idade (em segundos) em um instante absoluto usando o
          // relógio do próprio processo. Assim os dois lados da comparação
          // usam a mesma base, sem depender do fuso do Postgres.
          const ageSec = Number(res.rows[0]?.age_seconds);
          if (Number.isFinite(ageSec)) {
            cloudSnapshotUpdatedMs = Date.now() - ageSec * 1000;
            console.log(
              `[CloudSQL] Snapshot com ${(ageSec / 60).toFixed(1)} min de idade ` +
              `(${buf.length} bytes).`
            );
          } else {
            cloudSnapshotUpdatedMs = 0;
          }
          console.log(`[CloudSQL] Loaded database snapshot (${buf.length} bytes) from Google Cloud SQL.`);
          return buf;
        }
      }
      if (res && res.rows.length === 0) {
        // Table exists and query succeeded, but no snapshot row yet
        console.log('[CloudSQL] Connected to Cloud SQL; no existing snapshot row found.');
        return null;
      }
    } catch (err: any) {
      console.warn(`[CloudSQL] Attempt ${attempt}/4 could not load snapshot:`, err?.message || err);
    }

    if (attempt < 4) {
      console.log(`[CloudSQL] Cold start detected; retrying Cloud SQL connection in 2s (attempt ${attempt}/4)...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

// Track the raw byte size of the last known healthy DB saved to Cloud SQL
// ALWAYS store raw bytes (not base64/compressed) for consistent comparison
let knownHealthyRawBytes = 0;

export async function saveSnapshotToCloudSql(buffer: Buffer): Promise<void> {
  const pool = getCloudSqlPool();
  if (!pool) {
    // No Cloud SQL configured — local-only mode, nothing to persist
    return;
  }

  // SAFETY SHIELD: Only block truly empty/corrupted databases (< 10KB)
  const EMPTY_DB_THRESHOLD = 10000;
  if (buffer.length < EMPTY_DB_THRESHOLD) {
    console.error(
      `[CloudSQL SAFETY SHIELD] BLOCKED: Buffer is only ${buffer.length} bytes (likely empty/corrupted). Refusing to overwrite.`
    );
    return;
  }

  // If we know the Cloud SQL DB was significantly larger, block drastic shrinkage (< 20%)
  if (knownHealthyRawBytes > 0 && buffer.length < knownHealthyRawBytes * 0.20) {
    console.error(
      `[CloudSQL SAFETY SHIELD] BLOCKED: Buffer (${buffer.length} bytes) is < 20% of last known healthy (${knownHealthyRawBytes} bytes). Saving to emergency backup.`
    );
    try {
      await safeCloudSqlQuery(
        `INSERT INTO system_snapshots (key, data, updated_at)
         VALUES ('main_db_emergency_backup', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [buffer.toString('base64')],
        15000
      );
    } catch (_) {}
    return;
  }

  // Compress
  const compressed = gzipSync(buffer, { level: 3 });
  const b64 = compressed.toString('base64');

  // Save with dedicated retry loop (up to 3 attempts, 45s timeout each)
  let lastError: string = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await safeCloudSqlQuery(
        `INSERT INTO system_snapshots (key, data, updated_at)
         VALUES ('main_db', $1, NOW()), ('main_db_backup', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [b64],
        45000  // 45s timeout — large snapshots need more time
      );

      if (result) {
        knownHealthyRawBytes = buffer.length;
        console.log(`[CloudSQL] ✅ Saved: ${buffer.length} raw → ${compressed.length} gzip → ${b64.length} b64 (attempt ${attempt})`);
        // Só grava histórico depois que o slot principal foi salvo com
        // sucesso: um histórico de um snapshot que não substituiu o atual
        // não serve como ponto de retorno.
        saveSnapshotToHistory(buffer, b64);
        return; // SUCCESS
      }

      lastError = 'safeCloudSqlQuery returned null';
      console.warn(`[CloudSQL] Save attempt ${attempt}/3 returned null, retrying...`);
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`[CloudSQL] Save attempt ${attempt}/3 failed:`, lastError);
    }

    // Wait before retry
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  // All 3 attempts failed — this is critical
  console.error(`[CloudSQL] ❌ CRITICAL: All 3 save attempts failed! Last error: ${lastError}`);
}

// ============================================================================
// HISTÓRICO DE SNAPSHOTS NO SUPABASE
//
// O slot `main_db` é único e sobrescrito a cada gravação. Se o blob for
// corrompido, ou se um bug de migração escrever sobre o banco, não há para
// onde voltar. O histórico guarda os N snapshots anteriores, permitindo
// restaurar um ponto anterior.
//
// Cada snapshot ocupa ~3MB (base64 de gzip). Com 10 cópias, ~30MB —
// tranquilo no free tier de 500MB do Supabase.
// ============================================================================

const HISTORY_RETENTION = 10;
const HISTORY_MIN_INTERVAL_MS = 60 * 60 * 1000; // no máximo 1 registro por hora
let lastHistorySaveMs = 0;

export async function saveSnapshotToHistory(
  rawBuffer: Buffer,
  b64: string,
  reason = 'auto'
): Promise<void> {
  // Throttle: não faz sentido guardar 200 cópias do mesmo estado numa hora
  // de atividade normal.
  const now = Date.now();
  if (now - lastHistorySaveMs < HISTORY_MIN_INTERVAL_MS) return;

  try {
    // Garante que a tabela existe (idempotente, barato)
    await safeCloudSqlQuery(
      `CREATE TABLE IF NOT EXISTS system_snapshots_history (
         id           BIGSERIAL PRIMARY KEY,
         snapshot_key TEXT        NOT NULL,
         reason       TEXT        NOT NULL DEFAULT 'auto',
         byte_size    INTEGER     NOT NULL,
         raw_size     INTEGER     NOT NULL,
         data         TEXT        NOT NULL,
         created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
      undefined,
      15000
    );

    const result = await safeCloudSqlQuery(
      `INSERT INTO system_snapshots_history (snapshot_key, reason, byte_size, raw_size, data)
       VALUES ('main_db', $1, $2, $3, $4)`,
      [reason, b64.length, rawBuffer.length, b64],
      45000
    );

    if (!result) {
      console.warn('[Historico] Nao foi possivel gravar o snapshot no historico.');
      return;
    }

    lastHistorySaveMs = now;
    console.log(`[Historico] ✅ Snapshot arquivado (${(b64.length / 1048576).toFixed(2)} MB)`);

    // Rotação: mantém os N mais recentes
    await pruneSnapshotHistory();
  } catch (err: any) {
    // Falha no histórico nunca pode derrubar a gravação do slot principal
    console.warn('[Historico] Falha ao arquivar snapshot:', err?.message || err);
  }
}

async function pruneSnapshotHistory(): Promise<void> {
  try {
    const res = await safeCloudSqlQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM system_snapshots_history`,
      undefined,
      15000
    );
    const total = res?.rows?.[0]?.n ?? 0;
    if (total <= HISTORY_RETENTION) return;

    const toRemove = total - HISTORY_RETENTION;
    await safeCloudSqlQuery(
      `DELETE FROM system_snapshots_history
        WHERE id IN (
          SELECT id FROM system_snapshots_history
           ORDER BY created_at ASC
           LIMIT $1
        )`,
      [toRemove],
      20000
    );
    console.log(`[Historico] Rotação: ${toRemove} snapshot(s) antigo(s) removido(s).`);
  } catch (err: any) {
    console.warn('[Historico] Falha na rotação:', err?.message || err);
  }
}

/** Lista os snapshots do histórico (sem o campo `data`, que é pesado). */
export async function listSnapshotHistory(): Promise<
  { id: string; reason: string; byteSize: number; rawSize: number; createdAt: string }[]
> {
  const res = await safeCloudSqlQuery<{
    id: string;
    reason: string;
    byte_size: number;
    raw_size: number;
    created_at: Date;
  }>(
    `SELECT id, reason, byte_size, raw_size, created_at
       FROM system_snapshots_history
      ORDER BY created_at DESC
      LIMIT $1`,
    [HISTORY_RETENTION],
    20000
  );
  if (!res) return [];
  return res.rows.map((r) => ({
    id: String(r.id),
    reason: r.reason,
    byteSize: r.byte_size,
    rawSize: r.raw_size,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** Baixa e descomprime um snapshot do histórico. Retorna null se não existir. */
export async function loadSnapshotFromHistory(
  id: string
): Promise<Buffer | null> {
  const res = await safeCloudSqlQuery<{ data: string }>(
    `SELECT data FROM system_snapshots_history WHERE id = $1`,
    [id],
    45000
  );
  if (!res || res.rows.length === 0 || !res.rows[0].data) return null;

  const raw = Buffer.from(res.rows[0].data, 'base64');
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    return gunzipSync(raw);
  }
  return raw;
}

/**
 * Substitui o banco em memória pelo conteúdo de um snapshot.
 *
 * Só grava no disco local — enviar ao Supabase é responsabilidade do
 * chamador (persistDatabase), para que uma restauração não seja
 * imediatamente sobrescrita pelo próximo snapshot automático.
 */
export function applySnapshotToDatabase(buffer: Buffer): void {
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, buffer);
  fs.renameSync(tempFile, DB_FILE);
  markLocalFileFresh();

  // Substitui o arquivo, não o dbInstance: o servidor em memória continua
  // com o estado antigo até o próximo restart. Isso é intencional — troca
  // "a quente" exigiria reinjetar todas as conexões ativas.
  console.log(
    `[DB] Snapshot aplicado no disco (${buffer.length} bytes). ` +
    `Reinicie o servidor para que o app passe a operar sobre ele.`
  );
}

/**
 * Confere se um buffer de snapshot tem conteúdo aproveitável.
 *
 * Versão síncrona usada no boot, onde já existe uma instância de sql.js
 * pronta e não vale abrir uma segunda. Um snapshot sem tabela
 * `transactions` populadas não deve substituir um banco com dados.
 */
export function validateSnapshotBufferSync(
  buffer: Buffer,
  SQLFactory?: any
): { usable: boolean; motivo?: string; transacoes: number } {
  let probe: Database | undefined;
  try {
    const factory = SQLFactory || bootSqlFactory;
    if (!factory) {
      return { usable: false, motivo: 'sql.js não inicializado', transacoes: 0 };
    }
    const db: Database = new factory.Database(buffer);
    probe = db;

    const tables = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );
    const names = tables[0] ? tables[0].values.map((r: any) => r[0]) : [];

    if (!names.includes('transactions')) {
      return { usable: false, motivo: 'sem a tabela transactions', transacoes: 0 };
    }

    const count = db.exec(`SELECT COUNT(*) FROM transactions`);
    const transacoes = count[0] ? Number(count[0].values[0][0]) : 0;

    if (transacoes === 0) {
      return { usable: false, motivo: 'tabela transactions vazia', transacoes: 0 };
    }

    return { usable: true, transacoes };
  } catch (err: any) {
    return { usable: false, motivo: `ilegível: ${err?.message || err}`, transacoes: 0 };
  } finally {
    try { probe?.close(); } catch (_) {}
  }
}

/**
 * Confere se um buffer é um banco SQLite utilizável: abre, verifica as
 * tabelas esperadas e devolve a contagem de transações.
 *
 * Usado antes de sobrescrever o banco por um snapshot — um blob corrompido
 * destruiria o estado atual sem nenhum aviso.
 */
export async function validateSnapshotBuffer(
  buffer: Buffer
): Promise<{ valid: boolean; error?: string; transactionCount?: number }> {
  let probe: Database | undefined;
  try {
    const init = typeof initSqlJs === 'function' ? initSqlJs : (initSqlJs as any)?.default || initSqlJs;
    const SQL = await init();
    const db: Database = new SQL.Database(buffer);
    probe = db;

    const tables = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );
    const names = tables[0] ? tables[0].values.map((r: any) => r[0]) : [];

    // O snapshot precisa ter o schema do app; sem transactions não é
    // um banco utilizável.
    if (!names.includes('transactions')) {
      return { valid: false, error: 'Snapshot inválido: sem a tabela transactions.' };
    }

    const count = db.exec(`SELECT COUNT(*) FROM transactions`);
    const transactionCount = count[0] ? Number(count[0].values[0][0]) : 0;

    return { valid: true, transactionCount };
  } catch (err: any) {
    return { valid: false, error: `Snapshot corrompido: ${err?.message || err}` };
  } finally {
    try { probe?.close(); } catch (_) {}
  }
}



export async function getDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }
  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = (async () => {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const init = typeof initSqlJs === 'function' ? initSqlJs : (initSqlJs as any)?.default || initSqlJs;
    const SQL = await init();
    bootSqlFactory = SQL;

    let instance: Database | undefined;

    // 1. Restaurar do Cloud SQL, mas só se ele for mais recente que o arquivo local.
    //
    // Causa raiz da perda de dados: o boot fazia o Cloud SQL sobrescrever o
    // arquivo local sem comparar os dois. Se o upload falhasse (ou o processo
    // morresse antes), o trabalho mais recente ficava só em memória e a próxima
    // subida sobrescrevia tudo pelo snapshot antigo.
    try {
      // Registra o mtime do arquivo local ANTES de qualquer escrita.
      markLocalFileFresh();

      const cloudBuffer = await loadSnapshotFromCloudSql();

      if (cloudBuffer && cloudBuffer.length > 0) {
        // Decide se o snapshot do Supabase tem conteúdo real antes de
        // descartar o arquivo local.
        //
        // Um snapshot "vazio" (banco novo, sem tabelas populadas) não pode
        // substituir um banco com dados. No Render isso acontecia a cada
        // deploy: o filesystem é efêmero, o app subia sem Drivers e a
        // primeira gravação sobrescrevia o snapshot bom do Supabase com um
        // banco vazio. Era a segunda causa de deploy zerado.
        const snapshotUsable = validateSnapshotBufferSync(cloudBuffer);

        if (!snapshotUsable.usable) {
          console.error(
            `[DB] ❌ Snapshot do Supabase parece VAZIO (${snapshotUsable.motivo}). ` +
            `Mantendo o arquivo local para não perder dados.`
          );
          // Cai no passo 2 (restaurar do local).
        } else {
          // O arquivo local só "vence" o snapshot se tiver DADOS e for
          // realmente mais recente.
          //
          // Sem a checagem de conteúdo, o deploy no Render entrava em loop
          // de banco vazio: o container tem filesystem efêmero, o arquivo
          // local acabou de ser criado (mtime = agora), então era sempre
          // "mais novo" que o snapshot de 10 minutos atrás — e o app
          // descartava o snapshot bom, subia vazio e na primeira gravação
          // sobrescrevia o snapshot do Supabase com o vazio.
          let localHasData = false;
          if (fs.existsSync(DB_FILE)) {
            try {
              const localBuf = fs.readFileSync(DB_FILE);
              if (localBuf.length > 1000) {
                localHasData = validateSnapshotBufferSync(localBuf).usable;
              }
            } catch (_) {}
          }

          const localIsNewer =
            localHasData &&
            localFileLastWriteMs > 0 &&
            cloudSnapshotUpdatedMs > 0 &&
            localFileLastWriteMs > cloudSnapshotUpdatedMs + 120_000;

          if (localIsNewer) {
            console.warn(
              `[DB] ⚠️  Arquivo local tem dados e é mais recente que o snapshot ` +
              `do Supabase (local: ${new Date(localFileLastWriteMs).toISOString()}, ` +
              `snapshot: ${new Date(cloudSnapshotUpdatedMs).toISOString()}). ` +
              `Mantendo o local.`
            );
            // Não usa o snapshot; cai no passo 2 (restaurar do local).
          } else {
            if (!localHasData) {
              console.log(
                `[DB] Arquivo local sem dados (${localFileLastWriteMs > 0 ? 'recém-criado' : 'inexistente'}). ` +
                `Usando o snapshot do Supabase.`
              );
            }
            instance = new SQL.Database(cloudBuffer);
            // Backup local antes de sobrescrever: o arquivo atual pode ser
            // mais recente que o snapshot ou estar corrompido.
            try {
              if (fs.existsSync(DB_FILE) && localFileLastWriteMs > cloudSnapshotUpdatedMs) {
                fs.copyFileSync(DB_FILE, `${DB_FILE}.prev`);
              }
            } catch (_) {}
            try {
              fs.writeFileSync(DB_FILE, cloudBuffer);
            } catch (_) {}
            console.log(`[DB] Database restored from Supabase snapshot (${cloudBuffer.length} bytes, ${snapshotUsable.transacoes} transações).`);
          }
        }
      }
    } catch (err) {
      console.error('[DB] Failed restoring from Cloud SQL:', err);
    }

    // 2. Try restoring from local cached file if Cloud SQL was unreachable
    if (!instance && fs.existsSync(DB_FILE)) {
      try {
        const fileBuffer = fs.readFileSync(DB_FILE);
        if (fileBuffer.length > 0) {
          instance = new SQL.Database(fileBuffer);
          console.log(`[DB] Database restored from local cached file (${fileBuffer.length} bytes).`);
        }
      } catch (err) {
        console.error('[DB] Failed to load local database file:', err);
      }
    }

    // 3. If neither exists, create fresh and seed schema
    const isBrandNew = !instance;
    const dbToUse: Database = instance || new SQL.Database();
    dbInstance = dbToUse;

    // Backup do estado carregado, ANTES de qualquer migração. Se uma migração
    // futura corromper o schema, existe aqui um ponto de retorno do estado
    // exato que foi carregado no boot.
    createLocalBackup('boot');

    // Initialize schemas, indexes, migrations, and bank catalogs
    initSchema(dbToUse);

    // Only sync to Cloud SQL on fresh creation if it is truly brand new
    // NEVER overwrite Cloud SQL on boot if we restored existing data
    if (isBrandNew) {
      persistDatabaseSync();
    }

    return dbToUse;
  })();

  return dbInitPromise;
}

// ============================================================================
// BACKUP AUTOMÁTICO LOCAL
//
// Cada gravação que altera dados de negócio cria uma cópia datada em
// data/backups/, com retenção rotativa. Isso dá um ponto de retorno mesmo que
// o Cloud SQL nunca receba o upload (instância dormindo, rede caída, processo
// encerrado) — exatamente o cenário que causou a perda relatada.
// ============================================================================

const BACKUP_DIR = path.join(DB_DIR, 'backups');
const BACKUP_RETENTION = 30; // mantém os últimos 30 backups
let lastBackupMs = 0;
const BACKUP_MIN_INTERVAL_MS = 5 * 60 * 1000; // no máximo 1 backup a cada 5 min

/**
 * Cria uma cópia datada do banco em data/backups/.
 * Sem argumentos: exporta o dbInstance. Com buffer: usa o buffer fornecido
 * (permite fazer backup de um snapshot vindo do Cloud SQL).
 */
export function createLocalBackup(reason: string, buffer?: Buffer): void {
  try {
    if (!isVercel) {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
    }

    const data = buffer || dbInstance?.export();
    if (!data || data.length < 1000) return; // nunca salvar lixo

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeReason = reason.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const file = path.join(BACKUP_DIR, `backup-${stamp}-${safeReason}.sqlite`);

    fs.writeFileSync(file, Buffer.from(data));
    console.log(`[Backup] ✅ Criado: ${path.basename(file)} (${data.length} bytes)`);

    pruneOldBackups();
    lastBackupMs = Date.now();
  } catch (err: any) {
    // Backup falhou não pode derrubar a operação de negócio que o originou
    console.error('[Backup] Falha ao criar backup local:', err?.message || err);
  }
}

/** Remove backups além da retenção, mantendo sempre os mais recentes. */
function pruneOldBackups(): void {
  try {
    if (isVercel || !fs.existsSync(BACKUP_DIR)) return;

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.sqlite'))
      .map((f) => ({
        name: f,
        full: path.join(BACKUP_DIR, f),
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length <= BACKUP_RETENTION) return;

    for (const old of files.slice(BACKUP_RETENTION)) {
      try {
        fs.unlinkSync(old.full);
        console.log(`[Backup] Removido backup antigo: ${old.name}`);
      } catch (_) {}
    }
  } catch (_) {}
}

/**
 * Backup local com throttling: chamado após cada persistência, mas cria no
 * máximo um arquivo a cada BACKUP_MIN_INTERVAL_MS para não encher o disco.
 */
function maybeCreateLocalBackup(reason: string): void {
  if (Date.now() - lastBackupMs < BACKUP_MIN_INTERVAL_MS) return;
  createLocalBackup(reason);
}

export async function persistDatabase(): Promise<void> {
  if (!dbInstance) return;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);

  // Save to local disk (best-effort, ephemeral on Vercel)
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, buffer);
    fs.renameSync(tempFile, DB_FILE);
    markLocalFileFresh();
  } catch (err) {
    console.error('[DB] Error saving to local disk (non-fatal):', err);
  }

  // Backup local antes do upload: se o Cloud SQL falhar, o backup ainda existe.
  maybeCreateLocalBackup('auto');

  // Save to Cloud SQL (required for persistence across Vercel instances)
  await saveSnapshotToCloudSql(buffer);
}

export function persistDatabaseSync(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, buffer);
    fs.renameSync(tempFile, DB_FILE);
    markLocalFileFresh();

    maybeCreateLocalBackup('auto');

    // Asynchronously synchronize snapshot to Google Cloud SQL permanent storage with safety shield
    saveSnapshotToCloudSql(buffer);
  } catch (err) {
    console.error('[DB] Error persisting database to disk:', err);
  }
}

export function scheduleSaveDatabase(delayMs = 100): void {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }
  saveDebounceTimer = setTimeout(() => {
    persistDatabaseSync();
  }, delayMs);
}

// Graceful process exit handler to flush to Cloud SQL before container shuts down
process.on('SIGTERM', () => {
  if (dbInstance) {
    try {
      const data = dbInstance.export();
      const buffer = Buffer.from(data);
      const compressed = gzipSync(buffer, { level: 3 });
      const b64 = compressed.toString('base64');
      const pool = getCloudSqlPool();
      if (pool) {
        pool.query(
          `INSERT INTO system_snapshots (key, data, updated_at) 
           VALUES ('main_db', $1, NOW()), ('main_db_backup', $1, NOW()) 
           ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
          [b64]
        );
      }
    } catch (_) {}
  }
});

function initSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      cnpj TEXT,
      color TEXT DEFAULT '#2563eb',
      is_main INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'OPERATOR', 'AUDITOR')),
      pin TEXT NOT NULL DEFAULT '1234',
      avatar TEXT,
      allowed_companies TEXT NOT NULL DEFAULT '["matriz","filial"]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      cpf TEXT,
      phone TEXT,
      vehicle_plate TEXT NOT NULL,
      vehicle_model TEXT,
      route TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(company_id, code),
      UNIQUE(company_id, vehicle_plate)
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      bank_code TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      agency TEXT,
      account_number TEXT,
      color TEXT DEFAULT '#0284c7',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      filename TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      bank_code TEXT,
      format TEXT NOT NULL,
      total_transactions INTEGER NOT NULL DEFAULT 0,
      total_credit REAL NOT NULL DEFAULT 0,
      total_debit REAL NOT NULL DEFAULT 0,
      period_start TEXT,
      period_end TEXT,
      imported_by_user_id TEXT NOT NULL,
      imported_by_user_name TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      import_batch_id TEXT,
      bank_name TEXT NOT NULL,
      bank_code TEXT,
      fitid TEXT,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('CREDIT', 'DEBIT')),
      amount REAL NOT NULL,
      original_amount REAL,
      returned_amount REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      memo TEXT,
      document_number TEXT,
      is_pix INTEGER NOT NULL DEFAULT 0,
      is_pix_return INTEGER NOT NULL DEFAULT 0,
      return_reason TEXT,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'RECONCILED', 'IGNORED', 'RETURNED')) DEFAULT 'PENDING',
      reconciled_at TEXT,
      reconciled_by_user_id TEXT,
      reconciled_by_user_name TEXT,
      driver_id TEXT,
      driver_name TEXT,
      driver_plate TEXT,
      session_id TEXT,
      voucher_number TEXT,
      notes TEXT,
      counterparty_name TEXT,
      counterparty_doc TEXT,
      linked_tx_id TEXT,
      raw_data TEXT,
      created_at TEXT NOT NULL,
      locked_at TEXT,
      locked_by_user_id TEXT,
      locked_by_user_name TEXT,
      locked_by_session_id TEXT
    );

    CREATE TABLE IF NOT EXISTS reconciliation_sessions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      driver_id TEXT NOT NULL,
      driver_name TEXT NOT NULL,
      driver_plate TEXT,
      operator_user_id TEXT NOT NULL,
      operator_user_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      total_items INTEGER NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      missing_amount REAL NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'matriz',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Auto-migrate transactions table if it has the older CHECK constraint without 'RETURNED'
  try {
    const tableMaster = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'");
    const sqlSchema = (tableMaster[0]?.values[0]?.[0] as string) || '';
    if (sqlSchema && !sqlSchema.includes("'RETURNED'")) {
      console.log('[DB Migration] Updating transactions table to support RETURNED status...');
      db.run(`
        CREATE TABLE transactions_new (
          id TEXT PRIMARY KEY,
          import_batch_id TEXT,
          bank_name TEXT NOT NULL,
          bank_code TEXT,
          fitid TEXT,
          date TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('CREDIT', 'DEBIT')),
          amount REAL NOT NULL,
          description TEXT NOT NULL,
          memo TEXT,
          document_number TEXT,
          is_pix INTEGER NOT NULL DEFAULT 0,
          is_pix_return INTEGER NOT NULL DEFAULT 0,
          return_reason TEXT,
          status TEXT NOT NULL CHECK(status IN ('PENDING', 'RECONCILED', 'IGNORED', 'RETURNED')) DEFAULT 'PENDING',
          reconciled_at TEXT,
          reconciled_by_user_id TEXT,
          reconciled_by_user_name TEXT,
          driver_id TEXT,
          driver_name TEXT,
          driver_plate TEXT,
          session_id TEXT,
          voucher_number TEXT,
          notes TEXT,
          counterparty_name TEXT,
          counterparty_doc TEXT,
          linked_tx_id TEXT,
          raw_data TEXT,
          created_at TEXT NOT NULL,
          locked_at TEXT,
          locked_by_user_id TEXT,
          locked_by_user_name TEXT,
          locked_by_session_id TEXT
        );
      `);

      // Copy all existing columns dynamically
      db.run(`
        INSERT INTO transactions_new (
          id, import_batch_id, bank_name, bank_code, fitid, date, type, amount,
          description, memo, document_number, is_pix, status,
          reconciled_at, reconciled_by_user_id, reconciled_by_user_name,
          driver_id, driver_name, driver_plate, session_id, voucher_number, notes,
          created_at, locked_at, locked_by_user_id, locked_by_user_name, locked_by_session_id
        )
        SELECT 
          id, import_batch_id, bank_name, bank_code, fitid, date, type, amount,
          description, memo, document_number, COALESCE(is_pix, 0), status,
          reconciled_at, reconciled_by_user_id, reconciled_by_user_name,
          driver_id, driver_name, driver_plate, session_id, voucher_number, notes,
          created_at, locked_at, locked_by_user_id, locked_by_user_name, locked_by_session_id
        FROM transactions;
      `);

      db.run(`DROP TABLE transactions;`);
      db.run(`ALTER TABLE transactions_new RENAME TO transactions;`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_trans_status ON transactions(status);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(date);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_trans_driver ON transactions(driver_id);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_trans_session ON transactions(session_id);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_trans_fitid ON transactions(fitid);`);
      console.log('[DB Migration] Transactions table successfully migrated.');
    }
  } catch (migErr) {
    console.error('[DB Migration Warning]', migErr);
  }

  // Column migrations in case table was created previously without new fields
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN is_pix_return INTEGER NOT NULL DEFAULT 0`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN return_reason TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN counterparty_name TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN counterparty_doc TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN linked_tx_id TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN raw_data TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN original_amount REAL`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN returned_amount REAL NOT NULL DEFAULT 0`);
  } catch (_) {}
  try {
    db.run(`UPDATE transactions SET original_amount = amount WHERE original_amount IS NULL`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN locked_by_user_id TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN locked_by_user_name TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN locked_by_session_id TEXT`);
  } catch (_) {}

  // Limpeza de locks de sessão órfãos.
  //
  // Bug corrigido em 8eeb5df: os endpoints que reabrem transações limpavam
  // locked_at, locked_by_user_id e locked_by_user_name, mas deixavam
  // locked_by_session_id apontando para a sessão que já não existia. Na UI,
  // essa transação era classificada como "travada por outra sessão" e ficava
  // impossível de selecionar.
  //
  // Esta migração zera o campo nas transações pendentes cuja sessão não está
  // mais IN_PROGRESS. É segura por construção:
  //   - só toca em status = 'PENDING' (transações conciliadas mantêm o vínculo);
  //   - só toca quando o locked_by_session_id não corresponde a nenhuma sessão
  //     ativa, então sessões em andamento continuam intactas;
  //   - o padrão try/catch do arquivo garante que uma falha aqui não derrube o
  //     startup — no pior caso o problema persiste, como estava antes.
  try {
    db.run(`
      UPDATE transactions
         SET locked_by_session_id = NULL
       WHERE locked_by_session_id IS NOT NULL
         AND status = 'PENDING'
         AND locked_by_session_id NOT IN (
               SELECT id FROM reconciliation_sessions WHERE status = 'IN_PROGRESS'
         )
    `);
  } catch (_) {}

  // Clean counterparty_name on existing transactions if it contains raw PIX memo
  try {
    const rawTxs = db.exec("SELECT id, counterparty_name FROM transactions WHERE counterparty_name LIKE '%PIX%'");
    if (rawTxs[0]?.values) {
      for (const row of rawTxs[0].values) {
        const id = row[0] as string;
        const currentName = (row[1] as string) || '';
        const m = currentName.match(/(?:PIX\s*[-–]?\s*RECEBIDO(?:\s*QR\s*CODE)?|PIX\s*[-–]?\s*ENVIADO|DEV(?:\.?|OLUÇÃO|OLUCAO)?\s*PIX)\s*[-–]?\s*(?:\d{2}\/\d{2}\s*\d{2}:\d{2}\s*)?(?:\d{11,14}\s*)?(.*)/i);
        let cleaned = m && m[1] && m[1].trim().length >= 2 ? m[1].trim() : currentName;
        cleaned = cleaned.replace(/\b\d{2}\/\d{2}\s+\d{2}:\d{2}\b/g, '');
        cleaned = cleaned.replace(/\b\d{11,14}\b/g, '');
        cleaned = cleaned.replace(/^(?:PIX|TRANSF|TRANSFERENCIA|PAGAMENTO|RECEBIMENTO|CREDITO|DEBITO|TED|DOC|ESTORNO|DEV PIX)\s*[-–:]?\s*/i, '');
        cleaned = cleaned.replace(/\s*[-–:]\s*$/, '').trim();
        if (cleaned && cleaned !== currentName) {
          db.run(`UPDATE transactions SET counterparty_name = ? WHERE id = ?`, [cleaned, id]);
        }
      }
    }
  } catch (_) {}

  // Purge any accidental balance rows (e.g. Saldo do dia, Saldo anterior, etc.) from transactions
  try {
    db.run(`
      DELETE FROM transactions 
      WHERE (UPPER(description) LIKE '%SALDO DO DIA%' 
         OR UPPER(description) LIKE '%SALDO ANTERIOR%'
         OR UPPER(description) LIKE '%SALDO FINAL%'
         OR UPPER(description) LIKE '%SALDO ATUAL%'
         OR UPPER(description) LIKE '%SALDO INICIAL%'
         OR UPPER(description) LIKE '%SDO DO DIA%'
         OR UPPER(description) LIKE '%SDO ANTERIOR%'
         OR UPPER(description) LIKE '%SALDO TOTAL%'
         OR UPPER(description) LIKE '%SALDO DISPONIVEL%'
         OR UPPER(description) LIKE '%SALDO BLOQUEADO%'
         OR UPPER(description) LIKE '%SALDO APLIC%'
         OR UPPER(description) LIKE '%SALDO CONTA%'
         OR UPPER(description) LIKE 'SALDO %'
         OR UPPER(description) = 'SALDO'
         OR UPPER(description) = 'SDO'
         OR UPPER(memo) LIKE '%SALDO DO DIA%'
         OR UPPER(memo) LIKE '%SALDO ANTERIOR%'
         OR UPPER(memo) LIKE '%SALDO FINAL%')
        AND status = 'PENDING'
    `);
  } catch (_) {}

  // Migration for multi-company (Matriz vs Filial)
  try {
    db.run(`ALTER TABLE users ADD COLUMN allowed_companies TEXT NOT NULL DEFAULT '["matriz","filial"]'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE drivers ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE bank_accounts ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE import_batches ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE transactions ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE reconciliation_sessions ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE reconciliation_sessions ADD COLUMN general_voucher TEXT`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE reconciliation_sessions ADD COLUMN missing_amount REAL DEFAULT 0`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE drivers ADD COLUMN total_sessions INTEGER DEFAULT 0`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE drivers ADD COLUMN total_amount_reconciled REAL DEFAULT 0`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE audit_logs ADD COLUMN company_id TEXT NOT NULL DEFAULT 'matriz'`);
  } catch (_) {}

  // Auto-migrate drivers table if it has the global UNIQUE constraint on code
  try {
    const tableMaster = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='drivers'");
    const sqlSchema = (tableMaster[0]?.values[0]?.[0] as string) || '';
    if (sqlSchema && sqlSchema.includes("code TEXT UNIQUE NOT NULL")) {
      console.log('[DB Migration] Updating drivers table to remove global UNIQUE constraint on code...');
      db.run(`
        CREATE TABLE drivers_new (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL DEFAULT 'matriz',
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          cpf TEXT,
          phone TEXT,
          vehicle_plate TEXT NOT NULL,
          vehicle_model TEXT,
          route TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          total_sessions INTEGER DEFAULT 0,
          total_amount_reconciled REAL DEFAULT 0,
          UNIQUE(company_id, code),
          UNIQUE(company_id, vehicle_plate)
        );
      `);

      db.run(`
        INSERT INTO drivers_new (
          id, company_id, code, name, cpf, phone, vehicle_plate, vehicle_model,
          route, active, notes, created_at, updated_at, total_sessions, total_amount_reconciled
        )
        SELECT 
          id, COALESCE(company_id, 'matriz'), code, name, cpf, phone, vehicle_plate, vehicle_model,
          route, active, notes, created_at, updated_at, COALESCE(total_sessions, 0), COALESCE(total_amount_reconciled, 0)
        FROM drivers;
      `);

      db.run(`DROP TABLE drivers;`);
      db.run(`ALTER TABLE drivers_new RENAME TO drivers;`);
      console.log('[DB Migration] Drivers table successfully migrated.');
    }
  } catch (migErr) {
    console.error('[DB Migration Warning]', migErr);
  }

  // Safe index creations after all columns and tables are guaranteed to exist
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_company ON transactions(company_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_status ON transactions(status)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(date)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_driver ON transactions(driver_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_session ON transactions(session_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_fitid ON transactions(fitid)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_comp_status_date ON transactions(company_id, status, date)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_trans_comp_driver ON transactions(company_id, driver_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_drv_company ON drivers(company_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_batch_company ON import_batches(company_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_sess_company ON reconciliation_sessions(company_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_sess_comp_status ON reconciliation_sessions(company_id, status)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_sess_driver ON reconciliation_sessions(driver_id)`); } catch (_) {}
  try { db.run(`CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_logs(company_id)`); } catch (_) {}

  // Seed default companies if none exist
  const companyCount = db.exec("SELECT COUNT(*) as count FROM companies")[0]?.values[0]?.[0] as number;
  if (!companyCount || companyCount === 0) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO companies (id, name, code, cnpj, color, is_main, active, created_at) VALUES
       ('matriz', 'Matriz (Sede Principal)', 'MATRIZ', '00.000.000/0001-00', '#2563eb', 1, 1, ?),
       ('filial', 'Filial 01 (Unidade Filial)', 'FILIAL', '00.000.000/0002-00', '#059669', 0, 1, ?)`,
      [now, now]
    );
  }

  // Default system users for access and role testing
  const userCount = db.exec("SELECT COUNT(*) as count FROM users")[0]?.values[0]?.[0] as number;
  if (!userCount || userCount === 0) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO users (id, name, email, role, pin, allowed_companies, created_at) VALUES 
       ('usr-op-aliny', 'Aliny', 'aliny@aguacristalsul.com.br', 'OPERATOR', '1234', '["matriz","filial"]', ?),
       ('usr-op-miguel', 'Miguel Duran', 'miguel@aguacristalsul.com.br', 'OPERATOR', 'Imperatriz00', '["matriz","filial"]', ?),
       ('usr-admin-fab', 'fabricio', 'fabricio@cristal.com.br', 'ADMIN', '1234', '["matriz","filial"]', ?),
       ('usr-admin', 'franco duran', 'franco_junior120@hotmail.com', 'ADMIN', 'FrJr4866', '["matriz","filial"]', ?)`,
      [now, now, now, now]
    );
  }

  // Standard Brazilian bank accounts catalog for the upload dropdown (Matriz)
  const bankCount = db.exec("SELECT COUNT(*) as count FROM bank_accounts WHERE company_id = 'matriz'")[0]?.values[0]?.[0] as number;
  if (!bankCount || bankCount === 0) {
    db.run(`
      INSERT INTO bank_accounts (id, company_id, bank_code, bank_name, agency, account_number, color) VALUES
      ('bnk-itau', 'matriz', '341', 'Banco Itaú Unibanco', '0001', '', '#ea580c'),
      ('bnk-bb', 'matriz', '001', 'Banco do Brasil', '0001', '', '#facc15'),
      ('bnk-bradesco', 'matriz', '237', 'Banco Bradesco', '0001', '', '#dc2626'),
      ('bnk-santander', 'matriz', '033', 'Banco Santander', '0001', '', '#ef4444'),
      ('bnk-inter', 'matriz', '077', 'Banco Inter', '0001', '', '#f97316'),
      ('bnk-nubank', 'matriz', '260', 'Nubank / Nu Pagamentos', '0001', '', '#8b5cf6'),
      ('bnk-sicoob', 'matriz', '756', 'Sicoob Cooperativa', '0001', '', '#059669'),
      ('bnk-caixa', 'matriz', '104', 'Caixa Econômica Federal', '0001', '', '#2563eb'),
      ('bnk-c6', 'matriz', '336', 'Banco C6 S.A. / C6 Bank', '0001', '', '#1e293b')
    `);
  }

  // Standard Brazilian bank accounts catalog for Filial
  const filialBankCount = db.exec("SELECT COUNT(*) as count FROM bank_accounts WHERE company_id = 'filial'")[0]?.values[0]?.[0] as number;
  if (!filialBankCount || filialBankCount === 0) {
    db.run(`
      INSERT INTO bank_accounts (id, company_id, bank_code, bank_name, agency, account_number, color) VALUES
      ('bnk-fil-itau', 'filial', '341', 'Banco Itaú Unibanco (Filial)', '0001', '', '#ea580c'),
      ('bnk-fil-bb', 'filial', '001', 'Banco do Brasil (Filial)', '0001', '', '#facc15'),
      ('bnk-fil-bradesco', 'filial', '237', 'Banco Bradesco (Filial)', '0001', '', '#dc2626'),
      ('bnk-fil-santander', 'filial', '033', 'Banco Santander (Filial)', '0001', '', '#ef4444'),
      ('bnk-fil-inter', 'filial', '077', 'Banco Inter (Filial)', '0001', '', '#f97316'),
      ('bnk-fil-nubank', 'filial', '260', 'Nubank (Filial)', '0001', '', '#8b5cf6'),
      ('bnk-fil-sicoob', 'filial', '756', 'Sicoob Cooperativa (Filial)', '0001', '', '#059669'),
      ('bnk-fil-caixa', 'filial', '104', 'Caixa Econômica Federal (Filial)', '0001', '', '#2563eb'),
      ('bnk-fil-c6', 'filial', '336', 'Banco C6 S.A. (Filial)', '0001', '', '#1e293b')
    `);
  }

  // Ensure C6 Bank is present on any existing database for both Matriz and Filial
  try {
    const existingC6Matriz = db.exec("SELECT id FROM bank_accounts WHERE bank_code = '336' AND company_id = 'matriz'");
    if (!existingC6Matriz[0]?.values?.length) {
      db.run(`INSERT INTO bank_accounts (id, company_id, bank_code, bank_name, agency, account_number, color, active) VALUES ('bnk-c6', 'matriz', '336', 'Banco C6 S.A. / C6 Bank', '0001', '', '#1e293b', 1)`);
    }
    const existingC6Filial = db.exec("SELECT id FROM bank_accounts WHERE bank_code = '336' AND company_id = 'filial'");
    if (!existingC6Filial[0]?.values?.length) {
      db.run(`INSERT INTO bank_accounts (id, company_id, bank_code, bank_name, agency, account_number, color, active) VALUES ('bnk-fil-c6', 'filial', '336', 'Banco C6 S.A. (Filial)', '0001', '', '#1e293b', 1)`);
    }
  } catch (_) {}

  // -------------------------------------------------------------
  // Otimização de Performance (Índices / Indexes)
  // -------------------------------------------------------------
  try {
    // Índices nas Transações (Comprovantes)
    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_driver ON transactions(driver_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_company ON transactions(company_id)`);

    // Índices em Motoristas
    db.run(`CREATE INDEX IF NOT EXISTS idx_drivers_active ON drivers(active)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_drivers_company ON drivers(company_id)`);

    // Índices em Sessões de Conciliação
    db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_company ON reconciliation_sessions(company_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_driver ON reconciliation_sessions(driver_id)`);
  } catch(e) {
    console.error("[DB Optimization] Falha ao criar índices:", e);
  }

  // NOTE: NO FICTIONAL TRANSACTIONS, NO FICTIONAL DRIVERS, NO FICTIONAL BATCHES OR SESSIONS.
  // The database starts 100% clean and pristine, ready for real user bank statements and real driver entries.
}

// ============================================================================
// AGENDADOR DE BACKUP
//
// Rede de segurança final: mesmo que nenhuma operação de negócio dispare
// persistência (usuário ocioso), o banco é copiado a cada 30 min. Assim o
// intervalo máximo de perda em caso de falha catastrófica é de 30 min.
// ============================================================================
export function startBackupScheduler(): void {
  if (isVercel) return; // filesystem efêmero no Vercel; o Cloud SQL é quem persiste

  const timer = setInterval(() => {
    try {
      if (!dbInstance) return;
      createLocalBackup('periodic');
      // Garante que o Cloud SQL receba o estado atual mesmo sem operação de negócio
      const data = dbInstance.export();
      saveSnapshotToCloudSql(Buffer.from(data));
    } catch (err: any) {
      console.error('[Backup] Falha no backup periódico:', err?.message || err);
    }
  }, 30 * 60 * 1000);

  // Não segura o processo aberto por causa do timer
  timer.unref?.();
  console.log('[Backup] Agendador ativo: backup local + Cloud SQL a cada 30 minutos.');
}

/** Lista os backups locais disponíveis, mais recentes primeiro. */
export function listLocalBackups(): { file: string; size: number; modifiedAt: string }[] {
  try {
    if (isVercel || !fs.existsSync(BACKUP_DIR)) return [];
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.sqlite'))
      .map((f) => {
        const st = fs.statSync(path.join(BACKUP_DIR, f));
        return { file: f, size: st.size, modifiedAt: st.mtime.toISOString() };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  } catch (_) {
    return [];
  }
}
