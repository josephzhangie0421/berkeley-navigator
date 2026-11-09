// Read-only data access for the API.
import type { Db } from './db/client.js';
import { compactKey, normalizeCode } from './lib/codes.js';

export interface SourceRef {
  source_id: number;
  title: string;
  url: string | null;
  source_type: string;
  retrieved_at: string | null;
  verification_status: string;
}
export interface CourseRow {
  id: number;
  course_code: string;
  aliases: string[];
  title: string;
  department: string;
  units: string | null;
  description: string | null;
  description_kind: string;
  official_url: string | null;
  last_verified_at: string | null;
}
export interface RequirementRow {
  id: number;
  course_id: number;
  requirement_kind: string;
  raw_text: string;
  structured_logic: unknown;
  parse_status: string;
  render_warning: boolean;
  notes: string | null;
  catalog_scope: string | null;
  source: SourceRef;
}
export interface RelationRow {
  id: number;
  source_course_id: number;
  source_course_code: string;
  target_course_id: number | null;
  target_course_code: string;
  target_in_knowledge_base: boolean;
  relation_type: string;
  is_mandatory: boolean;
  requirement_text: string;
  source: SourceRef;
}

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

function toCourse(r: Record<string, unknown>): CourseRow {
  return {
    id: Number(r.id),
    course_code: String(r.course_code),
    aliases: (r.aliases as string[]) ?? [],
    title: String(r.title),
    department: String(r.department),
    units: (r.units as string) ?? null,
    description: (r.description as string) ?? null,
    description_kind: String(r.description_kind),
    official_url: (r.official_url as string) ?? null,
    last_verified_at: iso(r.last_verified_at),
  };
}
function toSource(r: Record<string, unknown>, prefix = 's_'): SourceRef {
  return {
    source_id: Number(r[`${prefix}id`]),
    title: String(r[`${prefix}title`]),
    url: (r[`${prefix}url`] as string) ?? null,
    source_type: String(r[`${prefix}type`]),
    retrieved_at: iso(r[`${prefix}retrieved_at`]),
    verification_status: String(r[`${prefix}status`]),
  };
}
const SOURCE_COLS = `s.id AS s_id, s.title AS s_title, s.url AS s_url, s.source_type AS s_type,
  s.retrieved_at AS s_retrieved_at, s.verification_status AS s_status`;

export class CourseRepo {
  constructor(private db: Db) {}

  async listCourses(opts: { query?: string; department?: string; limit?: number }): Promise<CourseRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.query) {
      params.push(`%${opts.query}%`);
      const p = `$${params.length}`;
      params.push(compactKey(normalizeCode(opts.query)));
      const k = `$${params.length}`;
      params.push(compactKey(opts.query));
      const k2 = `$${params.length}`;
      where.push(`(course_code ILIKE ${p} OR title ILIKE ${p} OR description ILIKE ${p}
        OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a ILIKE ${p})
        OR upper(replace(course_code,' ','')) IN (${k}, ${k2})
        OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE upper(replace(a,' ','')) IN (${k}, ${k2})))`);
    }
    if (opts.department) {
      params.push(`%${opts.department}%`);
      where.push(`department ILIKE $${params.length}`);
    }
    params.push(Math.min(Math.max(opts.limit ?? 50, 1), 100));
    const sql = `SELECT * FROM courses ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY course_code LIMIT $${params.length}`;
    const { rows } = await this.db.query(sql, params);
    return rows.map(toCourse);
  }

  /** Accepts a numeric id, a course code ("COMPSCI 189", "cs 189") or an alias ("Data 100"). */
  async resolveCourse(idOrCode: string): Promise<CourseRow | null> {
    if (/^\d+$/.test(idOrCode)) {
      const { rows } = await this.db.query('SELECT * FROM courses WHERE id = $1', [Number(idOrCode)]);
      return rows[0] ? toCourse(rows[0]) : null;
    }
    const keys = [compactKey(normalizeCode(idOrCode)), compactKey(idOrCode)];
    const { rows } = await this.db.query(
      `SELECT * FROM courses WHERE upper(replace(course_code,' ','')) = ANY($1)
         OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE upper(replace(a,' ','')) = ANY($1))
       ORDER BY (upper(replace(course_code,' ','')) = ANY($1)) DESC LIMIT 1`,
      [keys],
    );
    return rows[0] ? toCourse(rows[0]) : null;
  }

  async allCourses(): Promise<CourseRow[]> {
    const { rows } = await this.db.query('SELECT * FROM courses ORDER BY course_code');
    return rows.map(toCourse);
  }

  async courseSources(courseId: number): Promise<(SourceRef & { role: string })[]> {
    const { rows } = await this.db.query(
      `SELECT ${SOURCE_COLS}, cs.role FROM course_sources cs JOIN sources s ON s.id = cs.source_id
       WHERE cs.course_id = $1 ORDER BY s.id`,
      [courseId],
    );
    return rows.map((r) => ({ ...toSource(r), role: String(r.role) }));
  }

  async requirements(courseIds?: number[]): Promise<RequirementRow[]> {
    const { rows } = await this.db.query(
      `SELECT rs.*, ${SOURCE_COLS} FROM requirement_sets rs JOIN sources s ON s.id = rs.source_id
       ${courseIds ? 'WHERE rs.course_id = ANY($1)' : ''} ORDER BY rs.course_id, rs.id`,
      courseIds ? [courseIds] : [],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      course_id: Number(r.course_id),
      requirement_kind: String(r.requirement_kind),
      raw_text: String(r.raw_text),
      structured_logic: typeof r.structured_logic === 'string' ? JSON.parse(r.structured_logic) : r.structured_logic ?? null,
      parse_status: String(r.parse_status),
      render_warning: Boolean(r.render_warning),
      notes: (r.notes as string) ?? null,
      catalog_scope: (r.catalog_scope as string) ?? null,
      source: toSource(r),
    }));
  }

  /** direction 'outgoing': requirements OF this course. 'incoming': courses whose requirements NAME this course. */
  async relations(opts: { courseId?: number; direction?: 'outgoing' | 'incoming' } = {}): Promise<RelationRow[]> {
    const where = opts.courseId == null ? '' : opts.direction === 'incoming'
      ? 'WHERE r.target_course_id = $1' : 'WHERE r.source_course_id = $1';
    const { rows } = await this.db.query(
      `SELECT r.*, sc.course_code AS source_course_code, ${SOURCE_COLS}
       FROM course_relations r
       JOIN courses sc ON sc.id = r.source_course_id
       JOIN sources s ON s.id = r.source_id
       ${where} ORDER BY sc.course_code, r.relation_type, r.id`,
      opts.courseId == null ? [] : [opts.courseId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      source_course_id: Number(r.source_course_id),
      source_course_code: String(r.source_course_code),
      target_course_id: r.target_course_id == null ? null : Number(r.target_course_id),
      target_course_code: String(r.target_course_code),
      target_in_knowledge_base: r.target_course_id != null,
      relation_type: String(r.relation_type),
      is_mandatory: Boolean(r.is_mandatory),
      requirement_text: String(r.requirement_text),
      source: toSource(r),
    }));
  }
}
