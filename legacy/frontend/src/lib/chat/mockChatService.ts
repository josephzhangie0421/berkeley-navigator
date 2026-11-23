/**
 * MOCK MODE: for interface testing only.
 *
 * Returns predefined, clearly simulated answers. These responses intentionally
 * contain NO Berkeley facts (no prerequisites, units, terms or policies).
 * Every "fact" slot is a placeholder describing what live mode would show.
 *
 * Testing helpers:
 *   - include "#error" in a question to simulate a failed request
 *   - include "#empty" to simulate a question with no matching courses
 */
import type { Source } from "@/lib/types/course";
import type { Answer, ChatRequest, ConversationTurn } from "@/lib/types/message";
import type { StudentProfile } from "@/lib/types/profile";
import { findCourseCodes } from "@/lib/courseCodes";
import { ChatServiceError, type ChatService } from "./types";

const SAMPLE_SOURCES: Source[] = [
  {
    id: "S1",
    title: "Sample source: Berkeley Academic Guide course listings",
    url: "https://guide.berkeley.edu/courses/",
    type: "official",
  },
  {
    id: "S2",
    title: "Sample source: Berkeley Class Schedule",
    url: "https://classes.berkeley.edu/",
    type: "official",
  },
  {
    id: "S3",
    title: "Sample source: student discussion forum",
    url: "https://www.reddit.com/r/berkeley/",
    type: "student",
  },
];

function profileSummary(p: StudentProfile): string | undefined {
  const parts: string[] = [];
  if (p.academic_year) parts.push(p.academic_year.toLowerCase());
  if (p.majors.length) parts.push(`${p.majors.join(" / ")} student`);
  const who = parts.length ? `a ${parts.join(" ")}` : undefined;
  const bits: string[] = [];
  if (who) bits.push(`you're ${who}`);
  if (p.completed_courses.length) bits.push(`you've completed ${p.completed_courses.join(", ")}`);
  if (p.interests.length) bits.push(`you're interested in ${p.interests.join(", ")}`);
  if (p.constraints.length) bits.push(`you noted: ${p.constraints.join("; ")}`);
  if (!bits.length) return undefined;
  return `Simulated: your profile says ${bits.join(", ")}. In live mode, the answer would weigh these when ranking courses and explaining fit.`;
}

const SIMULATED_NOTE = "This is a simulated response for interface testing. No Berkeley course data was used.";

function lastCourses(history: ConversationTurn[]): string[] {
  const t = [...history].reverse().find((h) => h.role === "assistant" && h.course_ids?.length);
  return t?.course_ids ?? [];
}

export function buildMockAnswer({ question, profile, history }: ChatRequest): Answer {
  const q = question.toLowerCase();
  const asked = findCourseCodes(question);
  const codes = asked.length ? asked : lastCourses(history);
  const isFollowUp = history.length > 0 && asked.length === 0 && codes.length > 0;

  const base: Answer = {
    direct_answer: "",
    course_options: [],
    profile_explanation: profileSummary(profile),
    official: [],
    student_insights: [],
    unverified: [],
    interpretation: undefined,
    limitations: [SIMULATED_NOTE],
    suggested_questions: [],
    sources: [],
    provenance: "mock",
  };

  if (q.includes("#empty")) {
    return {
      ...base,
      direct_answer: "Simulated: no matching courses were found. In live mode, this is what an empty search result looks like.",
      suggested_questions: ["What courses should I explore after CS 61B?"],
    };
  }

  if (/prereq|require|need before|eligible/.test(q)) {
    const c = codes[0] ?? "this course";
    return {
      ...base,
      direct_answer: `Simulated answer: in live mode, I'd look up ${c} in the official catalog, list its prerequisites, and check them against the courses in your profile.`,
      course_options: codes.slice(0, 1).map((id) => ({ course_id: id, title: "Course title from the catalog appears here", reason: "The course you asked about" })),
      official: [
        { text: `Placeholder: the catalog's prerequisite statement for ${c} would appear here, quoted with its source.`, source_ids: ["S1"] },
      ],
      student_insights: [
        { text: "Placeholder: what students say about preparing for this course would appear here, labelled as informal.", source_ids: ["S3"] },
      ],
      interpretation: "Placeholder: an AI-written note comparing the prerequisites with your completed courses would appear here.",
      limitations: [...base.limitations, "Prerequisites can change between terms. Confirm with the official catalog or an advisor."],
      suggested_questions: [`What do students say about the workload in ${c}?`, `Which term is ${c} usually offered?`],
      sources: [SAMPLE_SOURCES[0], SAMPLE_SOURCES[2]],
    };
  }

  if (/differ|compare|vs\.?|versus/.test(q) && codes.length >= 2) {
    const [a, b] = codes;
    return {
      ...base,
      direct_answer: `Simulated answer: in live mode, I'd compare ${a} and ${b} on topics, prerequisites and workload, using catalog descriptions and labelled student reviews.`,
      course_options: [a, b].map((id) => ({ course_id: id, title: "Course title from the catalog appears here", reason: "One of the courses you asked to compare" })),
      official: [
        { text: `Placeholder: official course description for ${a}.`, source_ids: ["S1"] },
        { text: `Placeholder: official course description for ${b}.`, source_ids: ["S1"] },
      ],
      student_insights: [{ text: "Placeholder: informal student comparison of the two courses.", source_ids: ["S3"] }],
      interpretation: "Placeholder: an AI-written summary of which course may fit your goals better, and why.",
      suggested_questions: [`What are the prerequisites for ${b}?`, `Can I take ${a} and ${b} in the same semester?`],
      sources: [SAMPLE_SOURCES[0], SAMPLE_SOURCES[2]],
    };
  }

  if (isFollowUp) {
    return {
      ...base,
      direct_answer: `Simulated follow-up about ${codes.slice(0, 2).join(" and ")}. In live mode, the conversation context carries over, so you don't need to repeat the course name.`,
      course_options: codes.slice(0, 2).map((id) => ({ course_id: id, title: "Course title from the catalog appears here", reason: "From earlier in this conversation" })),
      official: [{ text: "Placeholder: official information relevant to your follow-up.", source_ids: ["S2"] }],
      interpretation: "Placeholder: an AI-written answer to the follow-up.",
      suggested_questions: ["What should I take next semester?"],
      sources: [SAMPLE_SOURCES[1]],
    };
  }

  // Exploration / default
  const interest = profile.interests[0];
  // Don't suggest a course the student says they've finished ("after CS 61B").
  const done = new Set(profile.completed_courses.map((c) => c.toUpperCase()));
  const afterRe = /\b(after|finished|completed|took|taken)\s+([A-Za-z]{2,8}\s?C?\d{1,3}[A-Za-z]{0,2})/gi;
  for (const m of question.matchAll(afterRe)) findCourseCodes(m[2]).forEach((c) => done.add(c));
  const toExplore = asked.filter((c) => !done.has(c));
  const options = toExplore.length
    ? toExplore.slice(0, 3).map((id) => ({ course_id: id, title: "Course title from the catalog appears here", reason: "Mentioned in your question" }))
    : [1, 2, 3].map((n) => ({
        course_id: `Sample course ${n}`,
        title: "A real course from the knowledge base appears here",
        reason: interest ? `Would be matched to your interest in ${interest}` : "Would be matched to your question and profile",
      }));

  return {
    ...base,
    direct_answer:
      "Simulated answer: in live mode, I'd suggest a few courses that build on what you've completed, explain why each fits, and link to the official listings.",
    course_options: options,
    official: [{ text: "Placeholder: official catalog details for each suggested course.", source_ids: ["S1", "S2"] }],
    student_insights: [{ text: "Placeholder: informal student perspectives on these courses.", source_ids: ["S3"] }],
    interpretation: "Placeholder: an AI-written explanation connecting the suggestions to your profile.",
    limitations: [...base.limitations, "Course offerings vary by term. Check the class schedule before planning."],
    suggested_questions: ["What are the prerequisites for CS 189?", "How do CS 170 and CS 189 differ?"],
    sources: SAMPLE_SOURCES,
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockChatService: ChatService = {
  mode: "mock",
  async ask(request) {
    await delay(700 + Math.random() * 600);
    if (request.question.toLowerCase().includes("#error")) {
      throw new ChatServiceError("Simulated error: the course information service did not respond.");
    }
    return buildMockAnswer(request);
  },
};
