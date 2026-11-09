import type { Source } from "./course";
import type { StudentProfile } from "./profile";

/** Where an answer came from. Always shown to the user. */
export type AnswerProvenance =
  | "mock" // predefined simulated responses, no backend
  | "evidence-only" // real retrieval, no LLM: retrieved facts shown as-is
  | "llm"; // real retrieval + LLM answer grounded in retrieved evidence

export interface Claim {
  text: string;
  /** Must reference ids present in `Answer.sources`. Validated server-side. */
  source_ids: string[];
}

export interface CourseOption {
  course_id: string;
  title: string;
  reason?: string;
}

export interface Answer {
  /** Short direct answer. Written by the AI (or a template); not itself a sourced fact. */
  direct_answer: string;
  course_options: CourseOption[];
  /** How the student's profile shaped the answer. AI-generated. */
  profile_explanation?: string;
  /** Facts backed by sources of type "official". */
  official: Claim[];
  /** Facts backed by sources of type "student". */
  student_insights: Claim[];
  /** Retrieved facts whose source type the backend did not label. */
  unverified: Claim[];
  /** Free-form AI interpretation. Never contains citations. */
  interpretation?: string;
  limitations: string[];
  suggested_questions: string[];
  sources: Source[];
  provenance: AnswerProvenance;
}

export type FeedbackValue = "helpful" | "not_helpful" | "incorrect";

export interface MessageFeedback {
  value: FeedbackValue;
  note?: string;
  at: string;
}

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
  createdAt: string;
}

export interface AssistantMessage {
  id: string;
  role: "assistant";
  createdAt: string;
  /** The user question this answers (used for retry). */
  inReplyTo: string;
  status: "ok" | "error";
  answer?: Answer;
  error?: string;
  feedback?: MessageFeedback;
}

export type ChatMessage = UserMessage | AssistantMessage;

/** Compact conversation context sent to the server for follow-ups. */
export interface ConversationTurn {
  role: "user" | "assistant";
  text: string;
  course_ids?: string[];
}

export interface ChatRequest {
  question: string;
  profile: StudentProfile;
  history: ConversationTurn[];
}

export interface ChatResponse {
  answer: Answer;
}

export interface ChatErrorResponse {
  error: string;
  code: "bad_request" | "retrieval_unavailable" | "retrieval_failed" | "generation_failed" | "misconfigured";
}
