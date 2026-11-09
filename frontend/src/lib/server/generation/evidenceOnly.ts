import type { Source } from "@/lib/types/course";
import type { Answer, Claim } from "@/lib/types/message";
import type { AnswerGenerator, GenerationInput } from "./types";

/**
 * Deterministic generator used when no LLM is configured (or the LLM fails).
 * It adds no interpretation: it groups retrieved facts by source type and
 * shows them with their original citations.
 */
export function buildEvidenceOnlyAnswer({ evidence }: GenerationInput, extraLimitations: string[] = []): Answer {
  const typeById = new Map(evidence.sources.map((s) => [s.id, s.type] as const));
  const official: Claim[] = [];
  const student: Claim[] = [];
  const unverified: Claim[] = [];

  for (const course of evidence.courses) {
    for (const fact of course.facts) {
      const claim: Claim = { text: `${course.course_id}: ${fact.text}`, source_ids: fact.source_ids };
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
  const ids = evidence.courses.map((c) => c.course_id);

  const suggested: string[] = [];
  if (ids[0]) suggested.push(`What are the prerequisites for ${ids[0]}?`);
  if (ids[0] && ids[1]) suggested.push(`How do ${ids[0]} and ${ids[1]} differ?`);
  if (ids[0]) suggested.push(`What do students say about the workload in ${ids[0]}?`);

  return {
    direct_answer:
      n === 0
        ? "No matching course information was found for this question. Try naming a specific course or topic."
        : `Found ${n} course${n === 1 ? "" : "s"} related to your question. The information below is shown as retrieved, without an AI-written summary.`,
    course_options: evidence.courses.map((c) => ({
      course_id: c.course_id,
      title: c.course_title,
      reason: c.matched_reason,
    })),
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
