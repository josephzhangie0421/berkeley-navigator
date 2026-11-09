// POST /api/retrieve — evidence retrieval, NOT recommendation.
// Selects courses relevant to a query/profile using transparent signals and returns
// source-backed facts for each. It never states that a student is eligible for a course.
import type { CourseRepo, CourseRow, RelationRow, RequirementRow, SourceRef } from './repo.js';
import { compactKey, extractCodes, normalizeCode } from './lib/codes.js';

export interface StudentProfile {
  academic_year?: string;
  majors?: string[];
  completed_courses?: string[];
  interests?: string[];
}
export interface RetrieveRequest {
  query: string;
  student_profile?: StudentProfile;
  limit?: number;
}
export interface Fact {
  label: string;
  value: string;
  verbatim: boolean;     // true = exact official wording; false = paraphrase or derived
  derived?: boolean;     // true = computed by this API from stored data (e.g. profile overlap)
  source_url: string | null;
}
export interface MatchSignal {
  type: 'named_in_query' | 'prerequisite_names_profile_course' | 'prerequisite_names_query_course'
      | 'recommended_background_names_profile_course' | 'interest_text_match' | 'query_term_match';
  detail: string;
}
export interface RetrieveResult {
  course_id: string;            // canonical course code, e.g. "COMPSCI 189"
  course_db_id: number;
  course_title: string;
  matched_reason: string;
  match_signals: MatchSignal[];
  /** "weak" = matched only by a single query keyword (no course code, profile, interest, or phrase signal). */
  match_strength: 'strong' | 'weak';
  facts: Fact[];
  sources: { title: string; url: string | null; source_type: string; retrieved_at: string | null; verification_status: string }[];
}
export interface RetrieveResponse {
  results: RetrieveResult[];
  limitations: string[];
}

export class RetrieveValidationError extends Error {}

const STOPWORDS = new Set(['what', 'which', 'should', 'could', 'would', 'explore', 'after', 'before', 'courses', 'course',
  'class', 'classes', 'take', 'next', 'interested', 'based', 'with', 'about', 'there', 'their', 'from', 'that', 'this',
  'have', 'completed', 'consider', 'relevant', 'investigate', 'differ', 'does', 'into', 'some', 'good', 'prerequisites',
  'prerequisite', 'requirements', 'between', 'they', 'them', 'need', 'want', 'like', 'more', 'than', 'also', 'other',
  // Conversational filler (added in integration: these produced spurious single-word matches, e.g. "tell", "look").
  'tell', 'look', 'know', 'field', 'area', 'help', 'please', 'recommend', 'suggest', 'interest', 'interests', 'taking',
  'compare', 'comparison', 'difference', 'different', 'follow', 'follow-up', 'thanks', 'semester', 'year', 'hard', 'easy']);

const BASE_LIMITATIONS = [
  'Results are retrieved evidence, not academic advice. Confirm requirements with the official catalog or an advisor.',
  'Prerequisite overlap with the student profile is not an eligibility determination (grade minimums, department rules, consent, and catalog year may apply).',
  'No live seat availability, enrollment status, or schedule data is stored.',
  'Course descriptions are short paraphrased summaries; prerequisite and credit-restriction text is verbatim.',
];

export function validateRequest(body: unknown): RetrieveRequest {
  if (!body || typeof body !== 'object') throw new RetrieveValidationError('Body must be a JSON object.');
  const b = body as Record<string, unknown>;
  if (typeof b.query !== 'string' || !b.query.trim()) throw new RetrieveValidationError('"query" must be a non-empty string.');
  if (b.query.length > 2000) throw new RetrieveValidationError('"query" must be at most 2000 characters.');
  if (b.limit != null && (!Number.isInteger(b.limit) || (b.limit as number) < 1 || (b.limit as number) > 20)) {
    throw new RetrieveValidationError('"limit" must be an integer between 1 and 20.');
  }
  const p = b.student_profile;
  if (p != null) {
    if (typeof p !== 'object' || Array.isArray(p)) throw new RetrieveValidationError('"student_profile" must be an object.');
    for (const k of ['majors', 'completed_courses', 'interests']) {
      const v = (p as Record<string, unknown>)[k];
      if (v != null && (!Array.isArray(v) || v.some((x) => typeof x !== 'string'))) {
        throw new RetrieveValidationError(`"student_profile.${k}" must be an array of strings.`);
      }
    }
  }
  return { query: b.query, student_profile: (p as StudentProfile) ?? {}, limit: (b.limit as number) ?? 5 };
}

export async function retrieve(repo: CourseRepo, req: RetrieveRequest): Promise<RetrieveResponse> {
  const limitations = [...BASE_LIMITATIONS];
  const courses = await repo.allCourses();
  const reqs = await repo.requirements();
  const rels = await repo.relations();

  // Lookup by code and alias (compact keys).
  const byKey = new Map<string, CourseRow>();
  for (const c of courses) {
    byKey.set(compactKey(c.course_code), c);
    for (const a of c.aliases) {
      byKey.set(compactKey(a), c);
      byKey.set(compactKey(normalizeCode(a)), c);
    }
  }
  const resolve = (raw: string) => byKey.get(compactKey(normalizeCode(raw))) ?? byKey.get(compactKey(raw)) ?? null;

  // Student profile: completed courses
  const profile = req.student_profile ?? {};
  const completedIds = new Set<number>();
  const completedKeys = new Set<string>();
  const unmatchedCompleted: string[] = [];
  for (const raw of profile.completed_courses ?? []) {
    const c = resolve(raw);
    completedKeys.add(compactKey(normalizeCode(raw)));
    if (c) {
      completedIds.add(c.id);
      completedKeys.add(compactKey(c.course_code));
    } else unmatchedCompleted.push(raw);
  }
  if (unmatchedCompleted.length) {
    limitations.push(`Completed courses not in the knowledge base (matched only by literal code): ${unmatchedCompleted.join(', ')}.`);
  }
  const hasTaken = (r: RelationRow) =>
    (r.target_course_id != null && completedIds.has(r.target_course_id)) || completedKeys.has(compactKey(r.target_course_code));

  // Course codes named in the query
  const queryCodes = extractCodes(req.query);
  const queryCourses = new Map<number, CourseRow>();
  const unknownQueryCodes: string[] = [];
  for (const code of queryCodes) {
    const c = resolve(code);
    if (c) queryCourses.set(c.id, c);
    else unknownQueryCodes.push(code);
  }
  const completedNamed = Array.from(queryCourses.values()).filter((c) => completedIds.has(c.id)).map((c) => c.course_code);
  if (completedNamed.length) {
    limitations.push(`Courses listed as completed are excluded from results (look them up via GET /api/courses/:id): ${completedNamed.join(', ')}.`);
  }
  if (unknownQueryCodes.length) {
    limitations.push(`Courses named in the query but not in the knowledge base: ${unknownQueryCodes.join(', ')}.`);
  }

  const interests = (profile.interests ?? []).map((s) => s.trim()).filter(Boolean);
  const words = req.query.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const isTerm = (t: string) => t.length >= 4 && !STOPWORDS.has(t) && !/\d/.test(t);
  const queryTerms = Array.from(new Set(words.filter(isTerm)));
  const queryPhrases = Array.from(new Set(
    words.slice(1).map((w, i) => [words[i], w]).filter(([a, b]) => isTerm(a) && isTerm(b)).map(([a, b]) => `${a} ${b}`),
  ));

  // Score each course with transparent signals.
  const scored: { course: CourseRow; score: number; signals: MatchSignal[]; weak: boolean }[] = [];
  for (const c of courses) {
    const signals: MatchSignal[] = [];
    let score = 0;
    // Courses the profile lists as completed are never returned (use GET /api/courses/:id to look them up).
    if (completedIds.has(c.id)) continue;
    const isQueryCourse = queryCourses.has(c.id);
    if (isQueryCourse) {
      score += 100;
      signals.push({ type: 'named_in_query', detail: `${c.course_code} is named in the query.` });
    }

    const outgoing = rels.filter((r) => r.source_course_id === c.id);
    const prereqTakenCodes = outgoing.filter((r) => r.relation_type === 'prerequisite' && hasTaken(r)).map((r) => r.target_course_code);
    if (prereqTakenCodes.length) {
      score += 10 * prereqTakenCodes.length;
      signals.push({ type: 'prerequisite_names_profile_course',
        detail: `Official prerequisite text names ${prereqTakenCodes.join(', ')}, listed as completed in the student profile.` });
    }
    const prereqQueryCodes = outgoing
      .filter((r) => r.relation_type === 'prerequisite' && r.target_course_id != null && queryCourses.has(r.target_course_id))
      .map((r) => r.target_course_code);
    if (prereqQueryCodes.length && !isQueryCourse) {
      score += 10 * prereqQueryCodes.length;
      signals.push({ type: 'prerequisite_names_query_course',
        detail: `Official prerequisite text names ${prereqQueryCodes.join(', ')}, which the query mentions.` });
    }
    const recTaken = outgoing.filter((r) => r.relation_type === 'recommended_background' && hasTaken(r)).map((r) => r.target_course_code);
    if (recTaken.length) {
      score += 3 * recTaken.length;
      signals.push({ type: 'recommended_background_names_profile_course',
        detail: `Official text lists ${recTaken.join(', ')} as recommended/preferred background, listed as completed in the student profile.` });
    }
    const haystack = `${c.title} ${c.description ?? ''}`.toLowerCase();
    const hitInterests = interests.filter((i) => haystack.includes(i.toLowerCase()));
    if (hitInterests.length) {
      score += 15 * hitInterests.length + (hitInterests.some((i) => c.title.toLowerCase().includes(i.toLowerCase())) ? 10 : 0);
      signals.push({ type: 'interest_text_match',
        detail: `Title/summary contains the stated interest: ${hitInterests.map((i) => `"${i}"`).join(', ')}.` });
    }
    const hitTerms = queryTerms.filter((t) => haystack.includes(t));
    const titleLower = c.title.toLowerCase();
    const hitPhrases = queryPhrases.filter((p) => haystack.includes(p));
    if (hitTerms.length) {
      score += 2 * hitTerms.length;
      // Two-word query phrases ("machine learning") weigh more, most of all in the title.
      score += hitPhrases.reduce((s, p) => s + (titleLower.includes(p) ? 6 : 3), 0);
      const shown = hitPhrases.length ? hitPhrases.map((p) => `"${p}"`).join(', ') : hitTerms.join(', ');
      signals.push({ type: 'query_term_match', detail: `Title/summary contains query term(s): ${shown}.` });
    }
    // A course matched only by one generic keyword is returned but marked weak, so callers do not present it as relevant.
    const weak = signals.every((s) => s.type === 'query_term_match') && hitTerms.length < 2 && hitPhrases.length === 0;
    if (score > 0) scored.push({ course: c, score, signals, weak });
  }

  scored.sort((a, b) => b.score - a.score || a.course.course_code.localeCompare(b.course.course_code));
  // Focus: when the query names a course in the KB that is not listed as completed, return only evidence tied to
  // the query (named courses, courses whose prerequisite text names them, strong keyword matches). Profile-only
  // matches would otherwise pad a question like "prerequisites for CS 189" with unrelated courses.
  const focused = Array.from(queryCourses.keys()).some((id) => !completedIds.has(id));
  const QUERY_SIGNALS = new Set<MatchSignal['type']>(['named_in_query', 'prerequisite_names_query_course', 'query_term_match']);
  const candidates = focused
    ? scored.filter((s) => !s.weak && s.signals.some((sig) => QUERY_SIGNALS.has(sig.type)))
    : scored;
  const top = candidates.slice(0, req.limit ?? 5);

  if (!top.length) limitations.push('No course in the knowledge base matched the query or profile.');
  else if (top.every((t) => t.weak)) {
    limitations.push('Only weak keyword matches were found (a single shared word); these courses may not be relevant to the question.');
  }
  // Interests that appear in no course title/summary at all (including completed courses).
  const missingInterests = interests.filter(
    (i) => !courses.some((c) => `${c.title} ${c.description ?? ''}`.toLowerCase().includes(i.toLowerCase())),
  );
  if (missingInterests.length) {
    limitations.push(`No course in the knowledge base mentions these stated interests in its title or summary: ${missingInterests.join(', ')}.`);
  }
  if (profile.majors?.length) {
    limitations.push('Major requirements are not stored; "majors" is accepted but not used for matching.');
  }
  if (profile.academic_year) {
    limitations.push('Class-standing restrictions are not stored; "academic_year" is accepted but not used for matching.');
  }

  const results: RetrieveResult[] = [];
  for (const { course, signals, weak } of top) {
    const courseReqs = reqs.filter((r) => r.course_id === course.id);
    const outgoing = rels.filter((r) => r.source_course_id === course.id);
    const { facts, sources, warnings } = buildFacts(course, courseReqs, outgoing, hasTaken, (profile.completed_courses ?? []).length > 0);
    limitations.push(...warnings);
    results.push({
      course_id: course.course_code,
      course_db_id: course.id,
      course_title: course.title,
      matched_reason: signals.map((s) => s.detail).join(' '),
      match_signals: signals,
      match_strength: weak ? 'weak' : 'strong',
      facts,
      sources,
    });
  }
  return { results, limitations: Array.from(new Set(limitations)) };
}

function buildFacts(
  course: CourseRow,
  reqs: RequirementRow[],
  outgoing: RelationRow[],
  hasTaken: (r: RelationRow) => boolean,
  profileHasCourses: boolean,
) {
  const facts: Fact[] = [];
  const warnings: string[] = [];
  const srcMap = new Map<number, SourceRef>();
  const url = course.official_url;

  facts.push({ label: 'Title', value: course.title, verbatim: true, source_url: url });
  if (course.units) facts.push({ label: 'Units', value: course.units, verbatim: true, source_url: url });
  else warnings.push(`${course.course_code}: units missing.`);
  if (course.aliases.length) facts.push({ label: 'Also known as', value: course.aliases.join(', '), verbatim: false, source_url: url });
  if (course.description) facts.push({ label: 'Summary (paraphrased)', value: course.description, verbatim: false, source_url: url });

  const kindLabel: Record<string, string> = {
    prerequisite: 'Prerequisite (official wording)',
    corequisite: 'Corequisite (official wording)',
    recommendation: 'Recommendation (official wording)',
    advisory: 'Advisory note (official wording)',
    credit_restriction: 'Credit restriction (official wording)',
  };
  for (const r of reqs) {
    srcMap.set(r.source.source_id, r.source);
    if (r.parse_status === 'none') {
      facts.push({ label: kindLabel[r.requirement_kind], value: r.raw_text, verbatim: false, source_url: r.source.url });
      warnings.push(`${course.course_code}: no ${r.requirement_kind} field was shown on the source page; this is not confirmation that none exists.`);
      continue;
    }
    facts.push({ label: kindLabel[r.requirement_kind], value: r.raw_text, verbatim: true, source_url: r.source.url });
    if (r.parse_status === 'raw_only') {
      warnings.push(`${course.course_code}: ${r.requirement_kind} text appeared truncated on the source page; verify on the official catalog.`);
    } else if (r.parse_status === 'partial') {
      warnings.push(`${course.course_code}: ${r.requirement_kind} AND/OR structure is uncertain; rely on the official wording.`);
    }
  }

  const prereqs = outgoing.filter((r) => r.relation_type === 'prerequisite');
  if (prereqs.length && profileHasCourses) {
    const named = Array.from(new Set(prereqs.map((r) => r.target_course_code)));
    const inProfile = Array.from(new Set(prereqs.filter(hasTaken).map((r) => r.target_course_code)));
    const notInProfile = named.filter((c) => !inProfile.includes(c));
    facts.push({
      label: 'Profile overlap with courses named in prerequisite text (not an eligibility check)',
      value: `Listed as completed: ${inProfile.join(', ') || 'none'}. Not listed: ${notInProfile.join(', ') || 'none'}. ` +
        'Many named courses are alternatives (OR); see official wording.',
      verbatim: false,
      derived: true,
      source_url: url,
    });
  }

  for (const s of srcMap.values()) {
    if (s.verification_status === 'verified_possibly_stale') {
      warnings.push(`${course.course_code}: source "${s.title}" may be outdated (not from the current catalog).`);
    }
  }
  const sources = Array.from(srcMap.values()).map((s) => ({
    title: s.title, url: s.url, source_type: s.source_type, retrieved_at: s.retrieved_at, verification_status: s.verification_status,
  }));
  return { facts, sources, warnings };
}
