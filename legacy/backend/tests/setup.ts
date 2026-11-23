import { createDb, type Db } from '../src/db/client.js';
import { applySchema } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';

/** Fresh seeded database. Uses TEST_DATABASE_URL (real Postgres) if set, else in-memory PGlite. */
export async function freshDb(): Promise<Db> {
  const db = process.env.TEST_DATABASE_URL
    ? await createDb({ databaseUrl: process.env.TEST_DATABASE_URL })
    : await createDb({ databaseUrl: '', pgliteDataDir: 'memory' });
  await applySchema(db, { reset: true });
  await seedDatabase(db);
  return db;
}
