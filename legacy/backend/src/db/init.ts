// Usage: npm run db:init            (create tables if missing)
//        tsx src/db/init.ts --reset (drop and recreate)
import { createDb } from './client.js';
import { applySchema } from './migrate.js';

const reset = process.argv.includes('--reset');
const db = await createDb();
await applySchema(db, { reset });
console.log(`[db:init] schema applied (driver=${db.driver}, reset=${reset})`);
await db.close();
