import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './client.js';
import { PROJECT_ROOT } from './client.js';

export const SCHEMA_PATH = path.join(PROJECT_ROOT, 'database', 'schema.sql');

const DROP_SQL = `
DROP TABLE IF EXISTS course_relations CASCADE;
DROP TABLE IF EXISTS requirement_sets CASCADE;
DROP TABLE IF EXISTS course_sources CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS sources CASCADE;
`;

export async function applySchema(db: Db, { reset = false } = {}): Promise<void> {
  if (reset) await db.exec(DROP_SQL);
  await db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}
