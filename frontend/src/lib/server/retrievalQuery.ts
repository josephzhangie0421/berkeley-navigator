import { findCourseCodes } from "@/lib/courseCodes";
import type { ConversationTurn } from "@/lib/types/message";


/**
 * The retrieval contract has no conversation field, so follow-ups like
 * "what are its prerequisites?" would lose their subject. If the question
 * names no course, append the courses from the previous answer as context.
 */
export function buildRetrievalQuery(question: string, history: ConversationTurn[]): string {
  if (findCourseCodes(question).length > 0) return question;
  const lastAssistant = [...history].reverse().find((t) => t.role === "assistant" && t.course_ids?.length);
  if (!lastAssistant?.course_ids?.length) return question;
  return `${question} (follow-up about ${lastAssistant.course_ids.slice(0, 3).join(", ")})`;
}
