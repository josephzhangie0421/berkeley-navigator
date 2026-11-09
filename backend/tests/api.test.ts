import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';
import type { Db } from '../src/db/client.js';
import { freshDb } from './setup.js';

let db: Db;
let app: ReturnType<typeof createApp>;
beforeAll(async () => { db = await freshDb(); app = createApp(db); });
afterAll(async () => { await db.close(); });

const SAMPLE_REQUEST = {
  query: 'What should I explore after CS 61B?',
  student_profile: {
    academic_year: 'Sophomore',
    majors: ['Data Science'],
    completed_courses: ['CS 61A', 'CS 61B'],
    interests: ['Machine Learning'],
  },
  limit: 5,
};

describe('GET /api/courses', () => {
  it('lists courses', async () => {
    const res = await request(app).get('/api/courses');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(21);
  });
  it('filters by query (alias aware)', async () => {
    const res = await request(app).get('/api/courses').query({ query: 'Data 100' });
    expect(res.body.courses.map((c: { course_code: string }) => c.course_code)).toEqual(['DATA C100']);
  });
  it('filters by keyword and department', async () => {
    const res = await request(app).get('/api/courses').query({ query: 'learning', department: 'COMPSCI' });
    const codes = res.body.courses.map((c: { course_code: string }) => c.course_code);
    expect(codes).toContain('COMPSCI 189');
    expect(codes.every((c: string) => c.startsWith('COMPSCI'))).toBe(true);
  });
  it('rejects a bad limit', async () => {
    const res = await request(app).get('/api/courses').query({ limit: '0' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/courses/:id', () => {
  it('accepts a course code and returns verbatim prerequisite with source', async () => {
    const res = await request(app).get('/api/courses/' + encodeURIComponent('cs 189'));
    expect(res.status).toBe(200);
    expect(res.body.course.course_code).toBe('COMPSCI 189');
    const prereq = res.body.requirements.find((r: { requirement_kind: string }) => r.requirement_kind === 'prerequisite');
    expect(prereq.raw_text).toBe('MATH 53 and MATH 54; and COMPSCI 70 or consent of instructor.');
    expect(prereq.source.url).toMatch(/catalog\.berkeley\.edu/);
    expect(res.body.sources[0].retrieved_at).toBeTruthy();
  });
  it('accepts a numeric id and former name', async () => {
    const byAlias = await request(app).get('/api/courses/' + encodeURIComponent('CS 182'));
    expect(byAlias.body.course.course_code).toBe('DATA C182');
    const byId = await request(app).get(`/api/courses/${byAlias.body.course.id}`);
    expect(byId.body.course.course_code).toBe('DATA C182');
  });
  it('404s on unknown course', async () => {
    const res = await request(app).get('/api/courses/' + encodeURIComponent('COMPSCI 999'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('course_not_found');
  });
});

describe('GET /api/courses/:id/relations', () => {
  it('returns outgoing prerequisites and incoming dependents', async () => {
    const res = await request(app).get('/api/courses/' + encodeURIComponent('COMPSCI 70') + '/relations');
    expect(res.status).toBe(200);
    const dependents = res.body.incoming.map((r: { source_course_code: string; relation_type: string }) => `${r.source_course_code}:${r.relation_type}`);
    expect(dependents).toContain('COMPSCI 170:prerequisite');
    expect(dependents).toContain('EECS 126:recommended_background');
    for (const r of res.body.incoming) expect(r.source.url).toBeTruthy();
  });
  it('marks targets outside the knowledge base', async () => {
    const res = await request(app).get('/api/courses/' + encodeURIComponent('MATH 54') + '/relations');
    const m52 = res.body.outgoing.find((r: { target_course_code: string }) => r.target_course_code === 'MATH 52');
    expect(m52.target_in_knowledge_base).toBe(false);
    expect(m52.requirement_text).toBe('Mathematics 52 (previously 1B or N1B), 10B, or N10B.');
  });
});

describe('POST /api/retrieve', () => {
  it('answers the sample request from the spec with traceable facts', async () => {
    const res = await request(app).post('/api/retrieve').send(SAMPLE_REQUEST);
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results.length).toBeLessThanOrEqual(5);
    const codes = res.body.results.map((r: { course_id: string }) => r.course_id);
    expect(codes).not.toContain('COMPSCI 61A'); // completed, not asked about
    expect(codes).toContain('COMPSCI 189');     // interest match
    expect(codes).toContain('COMPSCI 61C');     // prerequisite text names 61A and 61B
    const all = await request(app).post('/api/retrieve').send({ ...SAMPLE_REQUEST, limit: 20 });
    const c170 = all.body.results.find((r: { course_id: string }) => r.course_id === 'COMPSCI 170');
    expect(c170.match_signals.map((s: { type: string }) => s.type)).toContain('prerequisite_names_query_course');
    for (const r of res.body.results) {
      expect(r.sources.length).toBeGreaterThan(0);
      expect(r.matched_reason.length).toBeGreaterThan(0);
      for (const f of r.facts) expect(f.source_url).toMatch(/^https:\/\//);
    }
    expect(res.body.limitations.join(' ')).toMatch(/not an eligibility determination/);
    expect(res.body.limitations.join(' ')).toMatch(/excluded from results .*COMPSCI 61B/);
  });

  it('never claims eligibility or seat availability', async () => {
    const res = await request(app).post('/api/retrieve').send(SAMPLE_REQUEST);
    const text = JSON.stringify(res.body).toLowerCase();
    expect(text).not.toMatch(/you are eligible|you can enroll|seats available|open seats/);
  });

  it('returns the asked-about course first for a prerequisite question', async () => {
    const res = await request(app).post('/api/retrieve').send({ query: 'What are the prerequisites for CS 189?' });
    expect(res.body.results[0].course_id).toBe('COMPSCI 189');
    const prereq = res.body.results[0].facts.find((f: { label: string }) => f.label.startsWith('Prerequisite'));
    expect(prereq.verbatim).toBe(true);
    expect(prereq.value).toBe('MATH 53 and MATH 54; and COMPSCI 70 or consent of instructor.');
  });

  it('returns both courses for a comparison question', async () => {
    const res = await request(app).post('/api/retrieve').send({ query: 'How do CS 170 and CS 189 differ?', limit: 2 });
    expect(res.body.results.map((r: { course_id: string }) => r.course_id).sort()).toEqual(['COMPSCI 170', 'COMPSCI 189']);
  });

  it('ranks a title phrase match first for a topic question', async () => {
    const res = await request(app).post('/api/retrieve').send({ query: "I'm interested in machine learning. What relevant courses should I investigate?" });
    expect(res.body.results[0].course_id).toBe('COMPSCI 189');
    expect(res.body.results[0].match_signals[0].type).toBe('query_term_match');
  });

  it('surfaces parse warnings for uncertain requirements', async () => {
    const res = await request(app).post('/api/retrieve').send({ query: 'Tell me about CS 70' });
    expect(res.body.limitations.join(' ')).toMatch(/COMPSCI 70: prerequisite text appeared truncated/);
  });

  it('reports unknown courses instead of inventing them', async () => {
    const res = await request(app).post('/api/retrieve').send({ query: 'Is CS 999 hard?', student_profile: { completed_courses: ['MATH 1A'] } });
    const lim = res.body.limitations.join(' ');
    expect(lim).toMatch(/not in the knowledge base: COMPSCI 999/);
    expect(lim).toMatch(/matched only by literal code\): MATH 1A/);
  });

  it('does not return courses matched only by conversational filler words', async () => {
    const res = await request(app).post('/api/retrieve').send({ query: 'Tell me about CS 999' });
    expect(res.body.results).toEqual([]);
    expect(res.body.limitations.join(' ')).toMatch(/not in the knowledge base: COMPSCI 999/);
    expect(res.body.limitations.join(' ')).toMatch(/No course in the knowledge base matched/);
  });

  it('marks single-keyword matches as weak and says so', async () => {
    const res = await request(app).post('/api/retrieve').send({ query: 'user interface design' });
    expect(res.body.results.length).toBeGreaterThan(0);
    for (const r of res.body.results) expect(r.match_strength).toBe('weak');
    expect(res.body.limitations.join(' ')).toMatch(/Only weak keyword matches/);
    const strong = await request(app).post('/api/retrieve').send({ query: 'What are the prerequisites for CS 189?' });
    expect(strong.body.results[0].match_strength).toBe('strong');
  });

  it('reports stated interests that no course mentions', async () => {
    const res = await request(app).post('/api/retrieve').send({ query: 'What should I look at for HCI?', student_profile: { interests: ['HCI'] } });
    expect(res.body.limitations.join(' ')).toMatch(/mentions these stated interests .*: HCI/);
    expect(res.body.results).toEqual([]);
  });

  it('keeps a named-course question focused on that course', async () => {
    const res = await request(app).post('/api/retrieve').send({
      query: 'What are the prerequisites for CS 189?',
      student_profile: { completed_courses: ['CS 61A', 'CS 61B', 'MATH 53'], interests: ['Machine Learning'] },
    });
    expect(res.body.results.map((r: { course_id: string }) => r.course_id)).toEqual(['COMPSCI 189']);
  });

  it('validates input', async () => {
    expect((await request(app).post('/api/retrieve').send({})).status).toBe(400);
    expect((await request(app).post('/api/retrieve').send({ query: 'x', limit: 50 })).status).toBe(400);
    expect((await request(app).post('/api/retrieve').send({ query: 'x', student_profile: { completed_courses: 'CS 61A' } })).status).toBe(400);
    const bad = await request(app).post('/api/retrieve').set('Content-Type', 'application/json').send('{bad');
    expect(bad.status).toBe(400);
  });
});
