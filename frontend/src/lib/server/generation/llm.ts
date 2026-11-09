import type { Answer } from "@/lib/types/message";
import { buildEvidenceOnlyAnswer } from "./evidenceOnly";
import type { AnswerGenerator, GenerationInput } from "./types";
import { extractJson, validateModelAnswer } from "./validate";

const SYSTEM_PROMPT = `You are Berkeley Navigator, an independent student-built assistant that helps UC Berkeley undergraduates explore courses. You are not affiliated with or endorsed by UC Berkeley.

You answer ONLY from the EVIDENCE provided in the user message. Rules:
1. Every factual statement about a course (prerequisites, units, content, offering terms, policies) must appear in "official", "student_insights" or "unverified" with source_ids copied exactly from EVIDENCE.sources ids (e.g. "S1"). Never invent ids, URLs, course numbers or facts.
2. "official" may only cite sources whose type is "official". "student_insights" may only cite sources whose type is "student". Retrieved facts whose sources have type "unknown" go in "unverified".
3. "direct_answer", "profile_explanation" and "interpretation" are your own reasoning. They must not introduce facts that are absent from EVIDENCE. Keep direct_answer to 1-3 sentences.
4. If EVIDENCE does not answer the question, say so plainly in direct_answer and explain what is missing in "limitations". Do not fill gaps from general knowledge.
5. "course_options" may only use course_id values present in EVIDENCE.courses.
6. Suggest up to 3 short follow-up questions the student could ask next.
7. Do not give enrollment-probability estimates, and recommend confirming important decisions with an academic advisor when relevant.

Reply with a single JSON object and nothing else:
{
  "direct_answer": string,
  "course_options": [{"course_id": string, "reason": string}],
  "profile_explanation": string | null,
  "official": [{"text": string, "source_ids": [string]}],
  "student_insights": [{"text": string, "source_ids": [string]}],
  "unverified": [{"text": string, "source_ids": [string]}],
  "interpretation": string | null,
  "limitations": [string],
  "suggested_questions": [string]
}`;

function buildUserContent({ question, profile, history, evidence }: GenerationInput): string {
  return JSON.stringify(
    {
      QUESTION: question,
      STUDENT_PROFILE: profile,
      RECENT_CONVERSATION: history.slice(-6),
      EVIDENCE: {
        courses: evidence.courses,
        sources: evidence.sources.map(({ id, title, type, url }) => ({ id, title, type, url })),
        retrieval_limitations: evidence.limitations,
      },
    },
    null,
    2,
  );
}

interface AnthropicMessageResponse {
  content?: { type: string; text?: string }[];
}

export function createAnthropicGenerator(opts: { apiKey: string; model: string; timeoutMs?: number }): AnswerGenerator {
  return {
    provenance: "llm",
    async generate(input): Promise<Answer> {
      // Nothing to ground on: skip the model call entirely.
      if (input.evidence.courses.length === 0) return buildEvidenceOnlyAnswer(input);

      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": opts.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: opts.model,
            max_tokens: 4000,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: buildUserContent(input) }],
          }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`LLM API returned HTTP ${res.status}`);
        const data = (await res.json()) as AnthropicMessageResponse;
        const text = (data.content ?? [])
          .filter((b) => b.type === "text" && typeof b.text === "string")
          .map((b) => b.text)
          .join("\n");
        return validateModelAnswer(extractJson(text), input.evidence);
      } catch (err) {
        console.error("[generation] LLM generation failed, falling back to evidence-only:", err);
        return buildEvidenceOnlyAnswer(input, [
          "The AI answer could not be generated for this question, so retrieved evidence is shown instead.",
        ]);
      }
    },
  };
}
