"use client";

import { useEffect, useRef } from "react";
import type { AssistantMessage, ChatMessage as Msg, MessageFeedback } from "@/lib/types/message";
import { ChatInput, type ChatInputHandle } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";
import { SuggestedQuestions } from "./SuggestedQuestions";

export function ChatWindow({
  messages,
  busy,
  isMock,
  onSend,
  onRetry,
  onFeedback,
}: {
  messages: Msg[];
  busy: boolean;
  isMock: boolean;
  onSend: (q: string) => void;
  onRetry: (m: AssistantMessage) => void;
  onFeedback: (id: string, f: MessageFeedback) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastItemRef = useRef<HTMLLIElement>(null);
  const inputRef = useRef<ChatInputHandle>(null);
  const lastCount = useRef(0);

  // New question: follow to the bottom. New answer: show it from its top, so long
  // answers are read from the beginning. Only the conversation pane scrolls.
  const last = messages[messages.length - 1];
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || (messages.length === lastCount.current && !busy)) return;
    lastCount.current = messages.length;
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const item = lastItemRef.current;
    let top = scroller.scrollHeight;
    if (last?.role === "assistant" && !busy && item) {
      top = item.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16;
    }
    scroller.scrollTo({ top, behavior });
  }, [messages.length, busy, last?.role]);

  const ask = (q: string) => {
    onSend(q);
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto" id="conversation">
        <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5">
          {messages.length === 0 ? (
            <div className="pt-4 sm:pt-10">
              <h1 className="font-serif text-2xl leading-snug text-ink sm:text-[1.75rem]">
                What do you want to know about your courses?
              </h1>
              <p className="mt-2 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
                Ask in your own words. Each answer shows which parts come from official university sources, which come
                from students, and which are AI interpretation, with links to check for yourself.
              </p>
              <h2 className="mt-7 text-sm font-medium text-text">Try one of these, or ask your own question</h2>
              <div className="mt-2.5">
                <SuggestedQuestions onPick={ask} disabled={busy} />
              </div>
            </div>
          ) : (
            <ol className="space-y-4" aria-label="Conversation">
              {messages.map((m, i) => (
                <li key={m.id} ref={i === messages.length - 1 ? lastItemRef : undefined}>
                  <ChatMessage
                    message={m}
                    onAsk={ask}
                    onRetry={onRetry}
                    onFeedback={onFeedback}
                    busy={busy}
                    isMock={isMock}
                  />
                </li>
              ))}
            </ol>
          )}

          {busy && (
            <div className="mt-4 flex items-center gap-2.5 text-sm text-muted" role="status" aria-live="polite">
              <span className="inline-flex gap-1" aria-hidden="true">
                <span className="typing-dot size-1.5 rounded-full bg-ink" />
                <span className="typing-dot size-1.5 rounded-full bg-ink" />
                <span className="typing-dot size-1.5 rounded-full bg-ink" />
              </span>
              {isMock ? "Preparing a simulated answer" : "Looking up course information"}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-3xl">
          <ChatInput ref={inputRef} onSend={onSend} busy={busy} />
        </div>
      </div>
    </div>
  );
}
