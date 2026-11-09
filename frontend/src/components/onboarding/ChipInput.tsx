"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/Icon";

/** Type a value and press Enter (or comma) to add it. Backspace on an empty field removes the last one. */
export function ChipInput({
  label,
  hint,
  values,
  onChange,
  placeholder,
  suggestions = [],
  normalize = (v) => v,
  optional = false,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  normalize?: (v: string) => string;
  optional?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((p) => normalize(p.trim().replace(/\s+/g, " ")))
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 80));
    }
    onChange(next);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  const unused = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted">Optional</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-muted">
          {hint}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1.5 focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-ink-soft py-0.5 pl-2 pr-1 text-sm text-ink">
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded p-0.5 text-ink/70 hover:bg-white hover:text-ink"
              aria-label={`Remove ${v}`}
            >
              <Icon name="close" className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={values.length ? "Add another" : placeholder}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted/70"
          autoComplete="off"
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Suggestions for ${label}`}>
          {unused.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-ink hover:text-ink"
            >
              <Icon name="plus" className="size-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
