import type { Fact, RetrievalEvidence, SourceType } from "@/lib/types/course";
import type { Answer, Claim, CourseOption } from "@/lib/types/message";
import { allowedFreeTextKeys, checkClaim, filterFreeText } from "./grounding";

const str = (v: unknown, max = 1200): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const strList = (v: unknown, maxItems: number, maxLen = 300): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter((x): x is string => !!x).slice(0, maxItems) : [];

/**
 * Turn untrusted model output into a safe Answer.
 *
 * Citation rules (never fabricate citations):
 *  - A claim must cite retrieved FACT ids (F1, F2, …). Its source citations are
 *    derived from those facts; source ids supplied by the model are ignored.
 *  - The claim must pass the grounding checks in grounding.ts (course codes,
 *    numbers and quoted wording must appear in the cited facts).
 *  - An "official" claim must cite at least one non-derived fact from an
 *    official source; a "student" claim at least one fact from a student source.
 *  - Claims that fail are removed and the removal is reported to the user.
 *  - Free text (direct answer, profile explanation, interpretation, model
 *    limitations) loses any sentence naming a course absent from the evidence or
 *    conversation, or asserting eligibility/seat availability.
 *  - Course options must be courses that retrieval actually returned.
 */
export function validateModelAnswer(
  raw: unknown,
  evidence: RetrievalEvidence,
  context: { question?: string; historyTexts?: string[] } = {},
): Answer {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const typeById = new Map(evidence.sources.map((s) => [s.id, s.type] as const));
  const factById = new Map<string, Fact>();
  evidence.courses.forEach((c) => c.facts.forEach((f) => factById.set(f.id, f)));
  let removed = 0;

  const claims = (v: unknown, required: SourceType | null): Claim[] => {
    if (!Array.isArray(v)) return [];
    const out: Claim[] = [];
    for (const item of v.slice(0, 12)) {
      const c = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const text = str(c.text, 500);
      if (!text) continue;
      const cited = Array.isArray(c.fact_ids)
        ? [...new Set(c.fact_ids.filter((id): id is string => typeof id === "string"))]
            .map((id) => factById.get(id))
            .filter((f): f is Fact => !!f)
        : [];
      const sourceIds = [...new Set(cited.flatMap((f) => f.source_ids))].filter((id) => typeById.has(id));
      const tierOk =
        required === null ||
        cited.some((f) => !(required === "official" && f.derived) && f.source_ids.some((id) => typeById.get(id) === required));
      const problem = sourceIds.length === 0 ? "no valid citation" : !tierOk ? "wrong tier" : checkClaim(text, cited, evidence);
      if (problem) {
        removed++;
        console.warn(`[generation] removed claim (${problem}): ${text.slice(0, 120)}`);
        continue;
      }
      out.push({ text, source_ids: sourceIds, fact_ids: cited.map((f) => f.id) });
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

  const allowed = allowedFreeTextKeys(evidence, [context.question ?? "", ...(context.historyTexts ?? [])]);
  let freeRemoved = 0;
  const free = (v: unknown, max: number) => {
    const r = filterFreeText(str(v, max), allowed);
    freeRemoved += r.removed;
    return r.text;
  };
  const direct = free(obj.direct_answer, 800);
  if (!direct) throw new Error("Model output is missing a usable direct_answer");
  const profile_explanation = free(obj.profile_explanation, 800);
  const interpretation = free(obj.interpretation, 1200);
  const modelLimitations = strList(obj.limitations, 6)
    .map((l) => free(l, 300))
    .filter((l): l is string => !!l);
  // Course option reasons are uncited model text too.
  for (const o of course_options) o.reason = free(o.reason, 300);

  const used = new Set<string>();
  [...official, ...student_insights, ...unverified].forEach((c) => c.source_ids.forEach((id) => used.add(id)));
  course_options.forEach((o) => courseById.get(o.course_id.toLowerCase())?.source_ids.forEach((id) => used.add(id)));

  const limitations = [...evidence.limitations, ...modelLimitations];
  if (removed > 0) {
    limitations.push(
      `${removed} statement${removed === 1 ? " was" : "s were"} removed because ${removed === 1 ? "it" : "they"} could not be matched to the retrieved facts.`,
    );
  }
  if (freeRemoved > 0) {
    limitations.push(
      `${freeRemoved} sentence${freeRemoved === 1 ? " was" : "s were"} removed from the AI text because ${freeRemoved === 1 ? "it" : "they"} named a course or status not supported by the retrieved evidence.`,
    );
  }

  return {
    direct_answer: direct,
    course_options,
    profile_explanation,
    official,
    student_insights,
    unverified,
    interpretation,
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
