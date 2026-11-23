"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";

export const MAX_QUESTION_LENGTH = 1000;

export interface ChatInputHandle {
  focus: () => void;
}

export const ChatInput = forwardRef<ChatInputHandle, { onSend: (text: string) => void; busy: boolean }>(
  function ChatInput({ onSend, busy }, ref) {
    const [text, setText] = useState("");
    const area = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));

    const trimmed = text.trim();
    const canSend = !busy && trimmed.length > 0 && trimmed.length <= MAX_QUESTION_LENGTH;

    const send = () => {
      if (!canSend) return;
      onSend(trimmed);
      setText("");
      if (area.current) area.current.style.height = "";
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Don't send while an IME (e.g. Chinese/Japanese input) is composing.
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        send();
      }
    };

    const autoGrow = (el: HTMLTextAreaElement) => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
    };

    const remaining = MAX_QUESTION_LENGTH - text.length;

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="px-3 pb-3 pt-2.5 sm:px-5"
      >
        <div className="flex items-end gap-2 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
          <label htmlFor="question" className="sr-only">
            Ask a question about courses
          </label>
          <textarea
            id="question"
            ref={area}
            value={text}
            rows={1}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={onKeyDown}
            placeholder="Ask about a course, prerequisites, or what to take next"
            aria-describedby="question-hint"
            className="max-h-42 min-h-[2.25rem] flex-1 resize-none bg-transparent py-1.5 focus-visible:outline-none text-[0.9375rem] leading-6 outline-none placeholder:text-muted/80"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send question"
            className="mb-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-ink text-white transition-colors hover:bg-ink-strong disabled:bg-line-strong"
          >
            <Icon name="send" className="size-4" />
          </button>
        </div>
        <div id="question-hint" className="mt-1.5 flex justify-between gap-3 px-0.5 text-xs text-muted">
          <span>Enter to send, Shift+Enter for a new line. Confirm important details with an advisor.</span>
          {remaining < 150 && (
            <span className={remaining < 0 ? "text-danger" : ""} aria-live="polite">
              {remaining}
            </span>
          )}
        </div>
      </form>
    );
  },
);
