import { DATA_MODE } from "@/lib/config";
import type { ChatErrorResponse, ChatResponse } from "@/lib/types/message";
import { mockChatService } from "./mockChatService";
import { ChatServiceError, type ChatService } from "./types";

export { ChatServiceError, type ChatService };

/** Live mode: calls our own server route, which talks to retrieval + generation. */
export const liveChatService: ChatService = {
  mode: "live",
  async ask(request) {
    let res: Response;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new ChatServiceError("Couldn't reach the server. Check your connection and try again.");
    }
    const body = (await res.json().catch(() => null)) as ChatResponse | ChatErrorResponse | null;
    if (!res.ok || !body || !("answer" in body)) {
      const msg = body && "error" in body ? body.error : `The server returned an error (HTTP ${res.status}).`;
      throw new ChatServiceError(msg);
    }
    return body.answer;
  },
};

export function getChatService(): ChatService {
  return DATA_MODE === "live" ? liveChatService : mockChatService;
}
