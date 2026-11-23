// Loads database/seed/*.json into the database after validating it.
// Usage: npm run db:seed   (idempotent: clears and reloads all seed rows)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, PROJECT_ROOT, type Db } from './client.js';
import { applySchema } from './migrate.js';

export const SEED_DIR = path.join(PROJECT_ROOT, 'database', 'seed');

export interface SeedSource {
  source_key: string;
  source_type: 'official' | 'instructor' | 'community';
  title: string;
  url: string | null;
  content: string | null;
  retrieved_at: string;
  verification_status: string;
}
export interface SeedRelation {
  target: string;
  relation_type: string;
  is_mandatory: boolean;
}
export interface SeedRequirement {
  kind: string;
  raw_text: string;
  parse_status: string;
  render_warning?: boolean;
  notes?: string | null;
  structured_logic?: unknown;
  relations: SeedRelation[];
}
export interface SeedCourse {
  course_code: string;
  aliases: string[];
  title: string;
  department: string;
  units: string | null;
  description: string | null;
  source_key: string;
  requirements: SeedRequirement[];
}

export function loadSeed(): { sources: SeedSource[]; courses: SeedCourse[] } {
  const sources = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'sources.json'), 'utf8')).sources;
  const courses = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'courses.json'), 'utf8')).courses;
  return { sources, courses };
}

/** Returns a list of problems; empty means the seed is valid. */
export function validateSeed({ sources, courses }: { sources: SeedSource[]; courses: SeedCourse[] }): string[] {
  const problems: string[] = [];
  const keys = new Set(sources.map((s) => s.source_key));
  const codes = new Set<string>();
  for (const s of sources) {
    if (!s.url && s.verification_status !== 'inaccessible') problems.push(`source ${s.source_key}: missing url`);
    if (Number.isNaN(Date.parse(s.retrieved_at))) problems.push(`source ${s.source_key}: bad retrieved_at`);
  }
  for (const c of courses) {
    if (codes.has(c.course_code)) problems.push(`duplicate course ${c.course_code}`);
    codes.add(c.course_code);
    if (!keys.has(c.source_key)) problems.push(`${c.course_code}: unknown source_key ${c.source_key}`);
    for (const r of c.requirements) {
      if (!r.raw_text?.trim()) problems.push(`${c.course_code}: empty raw_text (${r.kind})`);
      for (const rel of r.relations) {
        // Rule: an edge may only point at a course whose number literally appears in the official wording.
        const number = rel.target.split(' ').pop()!;
        const re = new RegExp(`(^|[^A-Za-z0-9])${number.replace(/^C/, 'C?')}([^A-Za-z0-9]|$)`, 'i');
        if (!re.test(r.raw_text)) {
          problems.push(`${c.course_code}: relation target ${rel.target} not found in raw_text "${r.raw_text}"`);
        }
      }
    }
  }
  return problems;
}

export async function seedDatabase(db: Db): Promise<{ courses: number; relations: number; sources: number }> {
  const seed = loadSeed();
  const problems = validateSeed(seed);
  if (problems.length) throw new Error(`Seed validation failed:\n- ${problems.join('\n- ')}`);

  await db.exec('BEGIN');
  try {
    await db.exec('DELETE FROM course_relations; DELETE FROM requirement_sets; DELETE FROM course_sources; DELETE FROM courses; DELETE FROM sources;');

    const sourceIds = new Map<string, number>();
    const sourceRetrieved = new Map<string, string>();
    for (const s of seed.sources) {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO sources (source_key, source_type, title, url, content, retrieved_at, verification_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [s.source_key, s.source_type, s.title, s.url, s.content, s.retrieved_at, s.verification_status],
      );
      sourceIds.set(s.source_key, rows[0].id);
      sourceRetrieved.set(s.source_key, s.retrieved_at);
    }

    const courseIds = new Map<string, number>();
    const sourceUrl = new Map(seed.sources.map((s) => [s.source_key, s.url]));
    for (const c of seed.courses) {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO courses (course_code, aliases, title, department, units, description, description_kind, official_url, last_verified_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          c.course_code, c.aliases, c.title, c.department, c.units, c.description,
          c.description ? 'paraphrased_summary' : 'missing',
          sourceUrl.get(c.source_key), sourceRetrieved.get(c.source_key),
        ],
      );
      courseIds.set(c.course_code, rows[0].id);
      const role = c.source_key.endsWith('-dept') ? 'department_page' : 'catalog_record';
      await db.query('INSERT INTO course_sources (course_id, source_id, role) VALUES ($1,$2,$3)', [rows[0].id, sourceIds.get(c.source_key), role]);
    }

    // Resolve relation targets by canonical code first, then by alias recorded from the source
    // (e.g. "COMPSCI 88" is listed by the catalog as the former name of DATA C88C).
    const aliasIds = new Map<string, number>();
    for (const c of seed.courses) {
      for (const a of c.aliases) aliasIds.set(a.toUpperCase(), courseIds.get(c.course_code)!);
    }
    const resolveTarget = (code: string) => courseIds.get(code) ?? aliasIds.get(code.toUpperCase()) ?? null;

    let relations = 0;
    for (const c of seed.courses) {
      const courseId = courseIds.get(c.course_code)!;
      const sourceId = sourceIds.get(c.source_key)!;
      for (const r of c.requirements) {
        const { rows } = await db.query<{ id: number }>(
          `INSERT INTO requirement_sets (course_id, requirement_kind, raw_text, structured_logic, parse_status, render_warning, notes, catalog_scope, source_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [
            courseId, r.kind, r.raw_text,
            r.structured_logic == null ? null : JSON.stringify(r.structured_logic),
            r.parse_status, r.render_warning ?? false, r.notes ?? null,
            c.source_key.endsWith('-dept')
              ? 'Department course page (may predate current catalog)'
              : 'Current academic year per UC Berkeley catalog (retrieved 2026-11-09)',
            sourceId,
          ],
        );
        for (const rel of r.relations) {
          await db.query(
            `INSERT INTO course_relations (source_course_id, target_course_id, target_course_code, relation_type, is_mandatory, requirement_text, requirement_set_id, source_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [courseId, resolveTarget(rel.target), rel.target, rel.relation_type, rel.is_mandatory, r.raw_text, rows[0].id, sourceId],
          );
          relations++;
        }
      }
    }
    await db.exec('COMMIT');
    return { courses: seed.courses.length, relations, sources: seed.sources.length };
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

// CLI entry
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = await createDb();
  await applySchema(db);
  const counts = await seedDatabase(db);
  console.log(`[db:seed] loaded ${counts.courses} courses, ${counts.relations} relations, ${counts.sources} sources (driver=${db.driver})`);
  await db.close();
}
