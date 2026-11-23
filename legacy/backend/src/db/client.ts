// Database adapter: one small interface over two drivers.
//  - DATABASE_URL set   -> node-postgres (any PostgreSQL / Supabase)
//  - DATABASE_URL unset -> PGlite (embedded PostgreSQL in WASM; data dir from PGLITE_DATA_DIR,
//                          or in-memory when PGLITE_DATA_DIR=memory)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Db {
  driver: 'pg' | 'pglite';
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(here, '..', '..');

// Load .env if present (Node >= 20.12). Existing environment variables take precedence.
const envFile = path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(envFile) && !process.env.VITEST) process.loadEnvFile(envFile);

export async function createDb(opts: { databaseUrl?: string; pgliteDataDir?: string } = {}): Promise<Db> {
  const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl) {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: databaseUrl });
    return {
      driver: 'pg',
      query: async (sql, params) => {
        const r = await pool.query(sql, params as unknown[] | undefined);
        return { rows: r.rows };
      },
      exec: async (sql) => {
        await pool.query(sql);
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const dir = opts.pgliteDataDir ?? process.env.PGLITE_DATA_DIR ?? path.join(PROJECT_ROOT, '.pglite');
  const inMemory = dir === 'memory';
  if (!inMemory) fs.mkdirSync(dir, { recursive: true });
  const db = inMemory ? new PGlite() : new PGlite(dir);
  await db.waitReady;
  return {
    driver: 'pglite',
    query: async (sql, params) => {
      const r = await db.query(sql, params as unknown[] | undefined);
      return { rows: r.rows as never[] };
    },
    exec: async (sql) => {
      await db.exec(sql);
    },
    close: () => db.close(),
  };
}
