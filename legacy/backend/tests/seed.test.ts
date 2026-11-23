import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/client.js';
import { loadSeed, validateSeed } from '../src/db/seed.js';
import { extractCodes, normalizeCode } from '../src/lib/codes.js';
import { freshDb } from './setup.js';

describe('seed data quality', () => {
  const seed = loadSeed();

  it('passes validation (every relation target is named in the official wording)', () => {
    expect(validateSeed(seed)).toEqual([]);
  });

  it('covers 15–25 courses', () => {
    expect(seed.courses.length).toBeGreaterThanOrEqual(15);
    expect(seed.courses.length).toBeLessThanOrEqual(25);
  });

  it('every course has an official source with URL and retrieval timestamp', () => {
    const byKey = new Map(seed.sources.map((s) => [s.source_key, s]));
    for (const c of seed.courses) {
      const s = byKey.get(c.source_key)!;
      expect(s.source_type, c.course_code).toBe('official');
      expect(s.url, c.course_code).toMatch(/^https:\/\//);
      expect(Date.parse(s.retrieved_at)).not.toBeNaN();
    }
  });

  it('recommendations are never stored as mandatory prerequisites', () => {
    for (const c of seed.courses) {
      for (const r of c.requirements) {
        for (const rel of r.relations) {
          if (rel.relation_type === 'recommended_background') expect(rel.is_mandatory).toBe(false);
          if (rel.relation_type === 'prerequisite') expect(r.kind).toBe('prerequisite');
        }
      }
    }
  });

  it('EECS 126 stores COMPSCI 70 as preferred, not required', () => {
    const c = seed.courses.find((x) => x.course_code === 'EECS 126')!;
    const rels = c.requirements.flatMap((r) => r.relations);
    expect(rels).toContainEqual({ target: 'COMPSCI 70', relation_type: 'recommended_background', is_mandatory: false });
    expect(rels.some((r) => r.relation_type === 'prerequisite')).toBe(false);
  });
});

describe('code normalization', () => {
  it('normalizes common shorthands', () => {
    expect(normalizeCode('cs 61b')).toBe('COMPSCI 61B');
    expect(normalizeCode('CS61A')).toBe('COMPSCI 61A');
    expect(normalizeCode('Data C100')).toBe('DATA C100');
    expect(normalizeCode('EE 126')).toBe('ELENG 126');
    expect(normalizeCode('Math 54')).toBe('MATH 54');
  });
  it('extracts codes from free text', () => {
    expect(extractCodes('How do CS 170 and CS 189 differ?')).toEqual(['COMPSCI 170', 'COMPSCI 189']);
    expect(extractCodes('I took Math 54 and Data 8')).toEqual(['MATH 54', 'DATA 8']);
  });
});

describe('database initialization', () => {
  let db: Db;
  beforeAll(async () => { db = await freshDb(); });
  afterAll(async () => { await db.close(); });

  it('loads all seed courses and relations', async () => {
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM courses');
    expect(rows[0].n).toBe(loadSeed().courses.length);
    const rel = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM course_relations');
    expect(rel.rows[0].n).toBeGreaterThan(50);
  });

  it('every relation keeps the exact requirement wording and a source', async () => {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM course_relations r JOIN requirement_sets rs ON rs.id = r.requirement_set_id
       WHERE r.requirement_text <> rs.raw_text OR r.source_id IS NULL`);
    expect(rows[0].n).toBe(0);
  });

  it('resolves former names to the current course (COMPSCI 88 -> DATA C88C)', async () => {
    const { rows } = await db.query<{ code: string }>(
      `SELECT t.course_code AS code FROM course_relations r JOIN courses t ON t.id = r.target_course_id
       WHERE r.target_course_code = 'COMPSCI 88'`);
    expect(rows[0]?.code).toBe('DATA C88C');
  });
});
