import { findCourseCodes } from "@/lib/courseCodes";
import type { ConversationTurn } from "@/lib/types/message";

/** Words that point back to courses from the previous answer ("Which of those…", "Is it…"). */
const BACK_REFERENCE = /\b(it|its|it's|they|them|their|those|these|both|either|neither|that one|this one|the first|the second|the other)\b/i;

/**
 * The retrieval contract has no conversation field, so follow-ups like
 * "what are its prerequisites?" would lose their subject. Append the courses
 * from the previous answer as context when the question names no course, or
 * when it names a course but also refers back ("How does CS 170 compare to it?").
 */
export function buildRetrievalQuery(question: string, history: ConversationTurn[]): string {
  const named = findCourseCodes(question);
  if (named.length > 0 && !BACK_REFERENCE.test(question)) return question;
  const lastAssistant = [...history].reverse().find((t) => t.role === "assistant" && t.course_ids?.length);
  if (!lastAssistant?.course_ids?.length) return question;
  const prior = lastAssistant.course_ids.slice(0, 3);
  return `${question} (follow-up about ${prior.join(", ")})`;
}
