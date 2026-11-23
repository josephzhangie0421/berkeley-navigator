"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { FeedbackValue, MessageFeedback as Feedback } from "@/lib/types/message";

const OPTIONS: { value: FeedbackValue; label: string; icon: IconName }[] = [
  { value: "helpful", label: "Helpful", icon: "thumbUp" },
  { value: "not_helpful", label: "Not helpful", icon: "thumbDown" },
  { value: "incorrect", label: "Report incorrect info", icon: "flag" },
];

const CONFIRMATION: Record<FeedbackValue, string> = {
  helpful: "Marked as helpful.",
  not_helpful: "Marked as not helpful.",
  incorrect: "Report recorded.",
};

export function MessageFeedback({
  feedback,
  onSubmit,
  isMock,
}: {
  feedback?: Feedback;
  onSubmit: (f: Feedback) => void;
  isMock: boolean;
}) {
  const noteId = useId();
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");

  const choose = (value: FeedbackValue) => {
    if (value === "incorrect") {
      setReporting(true);
      return;
    }
    setReporting(false);
    onSubmit({ value, at: new Date().toISOString() });
  };

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rate this answer">
        {OPTIONS.map((o) => {
          const active = feedback?.value === o.value || (o.value === "incorrect" && reporting);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => choose(o.value)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? o.value === "incorrect"
                    ? "border-danger/50 bg-danger-soft text-danger"
                    : "border-ink bg-ink-soft text-ink"
                  : "border-line text-muted hover:border-line-strong hover:text-text"
              }`}
            >
              <Icon name={o.icon} className="size-3.5" />
              {o.label}
            </button>
          );
        })}
      </div>

      {reporting && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ value: "incorrect", note: note.trim() || undefined, at: new Date().toISOString() });
            setReporting(false);
          }}
        >
          <label htmlFor={noteId} className="block text-xs font-medium text-text">
            What&apos;s incorrect? <span className="font-normal text-muted">Optional</span>
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="e.g., the prerequisite listed for this course is out of date"
            className="w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
          />
          <div className="flex gap-2">
            <Button type="submit" variant="danger" className="!py-1 text-xs">
              Submit report
            </Button>
            <Button variant="ghost" className="!py-1 text-xs" onClick={() => setReporting(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {feedback && !reporting && (
        <p className="mt-2 text-xs text-muted" role="status">
          {CONFIRMATION[feedback.value]}
          {feedback.note && <> Your note: &ldquo;{feedback.note}&rdquo;.</>} Kept on this page only
          {isMock ? " (mock mode)" : ""}. Not sent to a server.
        </p>
      )}
    </div>
  );
}
