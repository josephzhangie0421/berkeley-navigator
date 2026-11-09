import type { DataMode } from "@/lib/config";
import type { Answer, ChatRequest } from "@/lib/types/message";

/** The only interface the chat UI depends on. */
export interface ChatService {
  readonly mode: DataMode;
  ask(request: ChatRequest): Promise<Answer>;
}

export class ChatServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatServiceError";
  }
}
