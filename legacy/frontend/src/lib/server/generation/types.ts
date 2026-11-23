import type { RetrievalEvidence } from "@/lib/types/course";
import type { Answer, AnswerProvenance, ConversationTurn } from "@/lib/types/message";
import type { StudentProfile } from "@/lib/types/profile";

export interface GenerationInput {
  question: string;
  profile: StudentProfile;
  history: ConversationTurn[];
  evidence: RetrievalEvidence;
}

/**
 * Answer generation service.
 * Input: question + profile + conversation + retrieved evidence.
 * Output: a structured Answer whose citations only reference evidence sources.
 */
export interface AnswerGenerator {
  readonly provenance: AnswerProvenance;
  generate(input: GenerationInput): Promise<Answer>;
}
