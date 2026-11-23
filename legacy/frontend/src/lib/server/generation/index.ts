import { evidenceOnlyGenerator } from "./evidenceOnly";
import { createAnthropicGenerator } from "./llm";
import type { AnswerGenerator } from "./types";

export const DEFAULT_LLM_MODEL = "claude-sonnet-5-5";

/**
 * Picks the answer generator from server-side env vars.
 * ANTHROPIC_API_KEY is read only here, on the server; it is never sent to the browser.
 */
export function getAnswerGenerator(): AnswerGenerator {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return evidenceOnlyGenerator;
  return createAnthropicGenerator({
    apiKey,
    model: process.env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || undefined,
  });
}

export type { AnswerGenerator, GenerationInput } from "./types";
