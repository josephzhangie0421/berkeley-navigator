import { createDb } from '../db/client.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const db = await createDb();
const { rows } = await db.query<{ n: string }>('SELECT count(*)::text AS n FROM courses').catch(() => ({ rows: [] as { n: string }[] }));
if (!rows.length || rows[0].n === '0') {
  console.warn('[api] courses table is empty or missing — run `npm run db:seed` first.');
}
createApp(db).listen(port, () => {
  console.log(`[api] Berkeley Navigator course KB listening on http://localhost:${port} (driver=${db.driver})`);
});
