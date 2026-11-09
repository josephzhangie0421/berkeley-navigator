import type { RetrievalEvidence, SourceType } from "@/lib/types/course";
import type { Answer, Claim, CourseOption } from "@/lib/types/message";

const str = (v: unknown, max = 1200): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const strList = (v: unknown, maxItems: number, maxLen = 300): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter((x): x is string => !!x).slice(0, maxItems) : [];

/**
 * Turn untrusted model output into a safe Answer.
 *
 * Citation rules (never fabricate citations):
 *  - A claim keeps only source ids that exist in the retrieved evidence.
 *  - An "official" claim must cite at least one official source.
 *  - A "student" claim must cite at least one student source.
 *  - Any claim left without a valid citation is removed, and the removal is
 *    reported to the user as a limitation.
 *  - Course options must be courses that retrieval actually returned.
 */
export function validateModelAnswer(raw: unknown, evidence: RetrievalEvidence): Answer {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const typeById = new Map(evidence.sources.map((s) => [s.id, s.type] as const));
  let removed = 0;

  const claims = (v: unknown, required: SourceType | null): Claim[] => {
    if (!Array.isArray(v)) return [];
    const out: Claim[] = [];
    for (const item of v.slice(0, 12)) {
      const c = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const text = str(c.text, 500);
      const ids = Array.isArray(c.source_ids)
        ? [...new Set(c.source_ids.filter((id): id is string => typeof id === "string" && typeById.has(id)))]
        : [];
      const ok = !!text && ids.length > 0 && (required === null || ids.some((id) => typeById.get(id) === required));
      if (ok) out.push({ text: text!, source_ids: ids });
      else if (text) removed++;
    }
    return out;
  };

  const official = claims(obj.official, "official");
  const student_insights = claims(obj.student_insights, "student");
  const unverified = claims(obj.unverified, null);

  const courseById = new Map(evidence.courses.map((c) => [c.course_id.toLowerCase(), c] as const));
  const course_options: CourseOption[] = [];
  if (Array.isArray(obj.course_options)) {
    for (const item of obj.course_options.slice(0, 8)) {
      const c = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const id = str(c.course_id, 40);
      const match = id ? courseById.get(id.toLowerCase()) : undefined;
      if (match && !course_options.some((o) => o.course_id === match.course_id)) {
        course_options.push({ course_id: match.course_id, title: match.course_title, reason: str(c.reason, 300) });
      }
    }
  }

  const used = new Set<string>();
  [...official, ...student_insights, ...unverified].forEach((c) => c.source_ids.forEach((id) => used.add(id)));
  course_options.forEach((o) => courseById.get(o.course_id.toLowerCase())?.source_ids.forEach((id) => used.add(id)));

  const limitations = [...evidence.limitations, ...strList(obj.limitations, 6)];
  if (removed > 0) {
    limitations.push(
      `${removed} statement${removed === 1 ? " was" : "s were"} removed because ${removed === 1 ? "it" : "they"} could not be matched to a retrieved source.`,
    );
  }

  const direct = str(obj.direct_answer, 800);
  if (!direct) throw new Error("Model output is missing direct_answer");

  return {
    direct_answer: direct,
    course_options,
    profile_explanation: str(obj.profile_explanation, 800),
    official,
    student_insights,
    unverified,
    interpretation: str(obj.interpretation, 1200),
    limitations: [...new Set(limitations)],
    suggested_questions: strList(obj.suggested_questions, 3, 160),
    sources: evidence.sources.filter((s) => used.has(s.id)),
    provenance: "llm",
  };
}

/** Pull the first JSON object out of a model reply (tolerates code fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}
