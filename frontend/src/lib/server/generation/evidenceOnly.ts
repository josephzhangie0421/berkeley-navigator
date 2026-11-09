import type { Source } from "@/lib/types/course";
import type { Answer, Claim } from "@/lib/types/message";
import type { AnswerGenerator, GenerationInput } from "./types";

/**
 * Not listed as answer content: "Title" repeats the course list, and "Also known as"
 * mixes catalog cross-listings with informal lookup shorthands added by the KB
 * ("CS189"), so it must not appear under "Official information". Both stay in the
 * evidence for alias resolution.
 */
const REDUNDANT_LABELS = new Set(["Title", "Also known as"]);

/**
 * Deterministic generator used when no LLM is configured (or the LLM fails).
 * It adds no interpretation: it groups retrieved facts by source type and
 * shows them with their original citations.
 *
 * - Facts computed by the backend (`derived`, e.g. profile overlap) are never
 *   listed as official information; they appear under "How this fits your
 *   profile" with the backend's own "not an eligibility check" wording.
 * - When retrieval found nothing, or only single-keyword matches, the direct
 *   answer says so instead of presenting the courses as relevant.
 */
export function buildEvidenceOnlyAnswer({ evidence }: GenerationInput, extraLimitations: string[] = []): Answer {
  const typeById = new Map(evidence.sources.map((s) => [s.id, s.type] as const));
  const official: Claim[] = [];
  const student: Claim[] = [];
  const unverified: Claim[] = [];
  const derived: string[] = [];

  for (const course of evidence.courses) {
    for (const fact of course.facts) {
      if (fact.label && REDUNDANT_LABELS.has(fact.label)) continue;
      if (fact.derived) {
        derived.push(`${course.course_id} — ${fact.text}`);
        continue;
      }
      const claim: Claim = { text: `${course.course_id} — ${fact.text}`, source_ids: fact.source_ids, fact_ids: [fact.id] };
      const types = fact.source_ids.map((id) => typeById.get(id));
      if (types.includes("official")) official.push(claim);
      else if (types.includes("student")) student.push(claim);
      else unverified.push(claim);
    }
  }

  const used = new Set<string>();
  [...official, ...student, ...unverified].forEach((c) => c.source_ids.forEach((id) => used.add(id)));
  evidence.courses.forEach((c) => c.source_ids.forEach((id) => used.add(id)));
  const sources: Source[] = evidence.sources.filter((s) => used.has(s.id));

  const n = evidence.courses.length;
  const allWeak = n > 0 && evidence.courses.every((c) => c.match_strength === "weak");
  const ids = evidence.courses.filter((c) => c.match_strength !== "weak").map((c) => c.course_id);

  // Only suggest questions this knowledge base can answer (requirements, comparisons, what a course leads to).
  const suggested: string[] = [];
  if (ids[0]) suggested.push(`What are the prerequisites for ${ids[0]}?`);
  if (ids[0] && ids[1]) suggested.push(`How do ${ids[0]} and ${ids[1]} differ?`);
  if (ids[0]) suggested.push(`Which courses list ${ids[0]} in their prerequisites?`);

  let direct: string;
  if (n === 0) {
    direct =
      "No matching course information was found in Berkeley Navigator's course knowledge base for this question, so there is nothing verified to show. See the notes below for what was checked.";
  } else if (allWeak) {
    direct = `No course clearly matched this question. The ${n === 1 ? "course below shares" : `${n} courses below share`} only a single keyword with it and may not be relevant.`;
  } else {
    direct = `Found ${n} course${n === 1 ? "" : "s"} related to your question. The information below is shown as retrieved, without an AI-written summary.`;
  }

  return {
    direct_answer: direct,
    course_options: evidence.courses.map((c) => ({
      course_id: c.course_id,
      title: c.course_title,
      reason: c.match_strength === "weak" ? `Weak match — ${c.matched_reason ?? "single keyword"}` : c.matched_reason,
    })),
    profile_explanation: derived.length ? derived.join("\n") : undefined,
    official,
    student_insights: student,
    unverified,
    limitations: [
      ...evidence.limitations,
      ...extraLimitations,
      "AI answer generation is not active, so this answer is not tailored to your profile beyond how courses were matched.",
    ],
    suggested_questions: suggested,
    sources,
    provenance: "evidence-only",
  };
}

export const evidenceOnlyGenerator: AnswerGenerator = {
  provenance: "evidence-only",
  async generate(input) {
    return buildEvidenceOnlyAnswer(input);
  },
};
