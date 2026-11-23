"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { Source } from "@/lib/types/course";
import type { Answer, AnswerProvenance, AssistantMessage, ChatMessage as Msg, Claim, MessageFeedback as Feedback } from "@/lib/types/message";
import { MessageFeedback } from "./MessageFeedback";
import { CitationMarks, SourceList } from "./SourceCitation";

const PROVENANCE: Record<AnswerProvenance, { label: string; className: string }> = {
  mock: { label: "Simulated answer", className: "bg-gold-soft text-gold-deep" },
  "evidence-only": { label: "Retrieved evidence, no AI summary", className: "bg-ink-soft text-ink" },
  llm: { label: "AI answer from retrieved sources", className: "bg-ink-soft text-ink" },
};

type Tier = "official" | "student" | "ai" | "unknown";

const TIER: Record<Tier, { title: string; note: string; rail: string }> = {
  official: { title: "Official information", note: "From university sources", rail: "rail-official" },
  student: { title: "Student insights", note: "Informal, not verified", rail: "rail-student" },
  unknown: { title: "Other retrieved information", note: "Source type not specified", rail: "rail-unknown" },
  ai: { title: "AI interpretation", note: "Generated, not a sourced fact", rail: "rail-ai" },
};

function Tiered({ tier, title, children }: { tier: Tier; title?: string; children: ReactNode }) {
  const t = TIER[tier];
  return (
    <section className={`mt-4 pl-3.5 ${t.rail}`}>
      <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-text">
        {title ?? t.title}
        <span className="text-xs font-normal text-muted">{t.note}</span>
      </h3>
      <div className="mt-1 text-sm leading-relaxed text-text">{children}</div>
    </section>
  );
}

function ClaimList({ claims, sources }: { claims: Claim[]; sources: Source[] }) {
  return (
    <ul className="space-y-1">
      {claims.map((c, i) => (
        <li key={i}>
          {c.text}
          <CitationMarks ids={c.source_ids} sources={sources} />
        </li>
      ))}
    </ul>
  );
}

function AnswerView({ answer, onAsk, disabled }: { answer: Answer; onAsk: (q: string) => void; disabled: boolean }) {
  const p = PROVENANCE[answer.provenance];
  return (
    <>
      <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${p.className}`}>{p.label}</span>

      <p className="mt-2.5 font-serif text-[1.0625rem] leading-relaxed text-text">{answer.direct_answer}</p>

      {answer.course_options.length > 0 && (
        <section className="mt-4" aria-label="Course options">
          <h3 className="text-sm font-semibold text-text">Courses to look at</h3>
          <ul className="mt-1.5 divide-y divide-line rounded-md border border-line">
            {answer.course_options.map((c) => (
              <li key={c.course_id} className="px-3 py-2">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold text-ink">{c.course_id}</span>
                  <span className="text-text">{c.title}</span>
                </p>
                {c.reason && <p className="mt-0.5 text-xs text-muted">{c.reason}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {answer.official.length > 0 && (
        <Tiered tier="official">
          <ClaimList claims={answer.official} sources={answer.sources} />
        </Tiered>
      )}
      {answer.student_insights.length > 0 && (
        <Tiered tier="student">
          <ClaimList claims={answer.student_insights} sources={answer.sources} />
        </Tiered>
      )}
      {answer.unverified.length > 0 && (
        <Tiered tier="unknown">
          <ClaimList claims={answer.unverified} sources={answer.sources} />
        </Tiered>
      )}
      {answer.profile_explanation && (
        <Tiered tier="ai" title="How this fits your profile">
          <p className="whitespace-pre-line">{answer.profile_explanation}</p>
        </Tiered>
      )}
      {answer.interpretation && (
        <Tiered tier="ai">
          <p>{answer.interpretation}</p>
        </Tiered>
      )}

      {answer.limitations.length > 0 && (
        <section className="mt-4 flex gap-2 rounded-md bg-gold-soft px-3 py-2.5 text-sm text-gold-deep" aria-label="Notes and limits">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          <div>
            <h3 className="font-semibold">Notes and limits</h3>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
              {answer.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <SourceList sources={answer.sources} />

      {answer.suggested_questions.length > 0 && (
        <section className="mt-4" aria-label="Suggested follow-up questions">
          <h3 className="text-xs text-muted">Ask next</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {answer.suggested_questions.map((q) => (
              <button
                key={q}
                type="button"
                disabled={disabled}
                onClick={() => onAsk(q)}
                className="rounded-full border border-line-strong bg-surface px-3 py-1 text-left text-sm text-ink hover:border-ink hover:bg-ink-soft disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function ChatMessage({
  message,
  onAsk,
  onRetry,
  onFeedback,
  busy,
  isMock,
}: {
  message: Msg;
  onAsk: (q: string) => void;
  onRetry: (m: AssistantMessage) => void;
  onFeedback: (id: string, f: Feedback) => void;
  busy: boolean;
  isMock: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-ink px-3.5 py-2.5 text-[0.9375rem] leading-relaxed text-white">
          <span className="sr-only">You asked: </span>
          {message.text}
        </p>
      </div>
    );
  }

  if (message.status === "error") {
    return (
      <div role="alert" className="max-w-full rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
        <p className="font-semibold">No answer for this question.</p>
        <p className="mt-0.5">{message.error}</p>
        <Button variant="danger" className="mt-2.5 !py-1 text-xs" onClick={() => onRetry(message)} disabled={busy}>
          <Icon name="refresh" className="size-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <article className="rounded-lg border border-line bg-surface px-4 py-4 sm:px-5" aria-label="Navigator answer">
      {message.answer && <AnswerView answer={message.answer} onAsk={onAsk} disabled={busy} />}
      <MessageFeedback feedback={message.feedback} onSubmit={(f) => onFeedback(message.id, f)} isMock={isMock} />
    </article>
  );
}
