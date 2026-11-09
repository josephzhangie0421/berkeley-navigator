/**
 * Typed client for the backend course knowledge base.
 *
 *   POST {RETRIEVAL_API_BASE_URL}/api/retrieve
 *
 * Server-side only: it is imported by the /api/chat route handler, never by
 * client components, so the backend URL is not exposed to the browser and no
 * CORS setup is needed on the backend.
 */
import type { RetrieveRequest, RetrieveResponse } from "@/lib/types/course";

export class RetrievalError extends Error {
  constructor(
    message: string,
    public readonly code: "unavailable" | "bad_response" | "timeout" | "http_error",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "RetrievalError";
  }
}

export interface RetrievalClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  /** Optional bearer token if the backend requires one (server-side env only). */
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

function isRetrieveResponse(value: unknown): value is RetrieveResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.results) && (v.limitations === undefined || Array.isArray(v.limitations));
}

export async function retrieveCourses(
  request: RetrieveRequest,
  { baseUrl, timeoutMs = 15000, apiKey, fetchImpl = fetch }: RetrievalClientOptions,
): Promise<RetrieveResponse> {
  const url = `${baseUrl.replace(/\/+$/, "")}/api/retrieve`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new RetrievalError(`Retrieval service timed out after ${timeoutMs} ms`, "timeout");
    }
    throw new RetrievalError("Could not reach the retrieval service", "unavailable");
  }

  if (!res.ok) {
    throw new RetrievalError(`Retrieval service returned HTTP ${res.status}`, "http_error", res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new RetrievalError("Retrieval service returned invalid JSON", "bad_response");
  }
  if (!isRetrieveResponse(body)) {
    throw new RetrievalError("Retrieval response does not match the expected contract", "bad_response");
  }
  return body;
}
