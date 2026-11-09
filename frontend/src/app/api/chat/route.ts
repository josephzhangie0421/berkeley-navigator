/**
 * POST /api/chat  (live mode only)
 *
 * question + profile + conversation
 *   → retrieval service   (backend POST /api/retrieve)
 *   → answer generation   (LLM if ANTHROPIC_API_KEY is set, else evidence-only)
 *   → structured Answer with validated citations
 */
import { normalizeRetrieveResponse } from "@/lib/api/normalize";
import { RetrievalError, retrieveCourses } from "@/lib/api/retrievalClient";
import { sanitizeProfile } from "@/lib/profileSanitize";
import { getAnswerGenerator } from "@/lib/server/generation";
import { buildRetrievalQuery } from "@/lib/server/retrievalQuery";
import type { ChatErrorResponse, ChatResponse, ConversationTurn } from "@/lib/types/message";

const MAX_QUESTION_LENGTH = 1000;
const RETRIEVAL_LIMIT = 5;

function fail(status: number, code: ChatErrorResponse["code"], error: string) {
  return Response.json({ code, error } satisfies ChatErrorResponse, { status });
}

function sanitizeHistory(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-10)
    .map((t): ConversationTurn | null => {
      if (!t || typeof t !== "object") return null;
      const o = t as Record<string, unknown>;
      if ((o.role !== "user" && o.role !== "assistant") || typeof o.text !== "string") return null;
      const course_ids = Array.isArray(o.course_ids)
        ? o.course_ids.filter((x): x is string => typeof x === "string").slice(0, 8)
        : undefined;
      return { role: o.role, text: o.text.slice(0, 1500), course_ids };
    })
    .filter((t): t is ConversationTurn => !!t);
}

export async function POST(request: Request) {
  const baseUrl = process.env.RETRIEVAL_API_BASE_URL?.trim();
  if (!baseUrl) {
    return fail(503, "misconfigured", "Live mode is on, but RETRIEVAL_API_BASE_URL is not set on the server.");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "bad_request", "Request body must be JSON.");
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return fail(400, "bad_request", "Question is empty.");
  if (question.length > MAX_QUESTION_LENGTH) {
    return fail(400, "bad_request", `Question is longer than ${MAX_QUESTION_LENGTH} characters.`);
  }

  const profile = sanitizeProfile(body.profile);
  const history = sanitizeHistory(body.history);

  let evidence;
  try {
    const raw = await retrieveCourses(
      {
        query: buildRetrievalQuery(question, history),
        student_profile: {
          academic_year: profile.academic_year,
          majors: profile.majors,
          completed_courses: profile.completed_courses,
          interests: profile.interests,
        },
        limit: RETRIEVAL_LIMIT,
      },
      {
        baseUrl,
        apiKey: process.env.RETRIEVAL_API_KEY?.trim() || undefined,
        timeoutMs: Number(process.env.RETRIEVAL_API_TIMEOUT_MS) || undefined,
      },
    );
    evidence = normalizeRetrieveResponse(raw);
  } catch (err) {
    console.error("[chat] retrieval failed:", err);
    if (err instanceof RetrievalError && (err.code === "unavailable" || err.code === "timeout")) {
      return fail(502, "retrieval_unavailable", "The course information service is not responding. Try again in a moment.");
    }
    return fail(502, "retrieval_failed", "The course information service returned an unexpected response.");
  }

  try {
    const answer = await getAnswerGenerator().generate({ question, profile, history, evidence });
    return Response.json({ answer } satisfies ChatResponse);
  } catch (err) {
    console.error("[chat] generation failed:", err);
    return fail(500, "generation_failed", "The answer could not be generated. Try again.");
  }
}
