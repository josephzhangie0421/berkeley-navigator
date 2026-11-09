"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { normalizeCourseCode } from "@/lib/courseCodes";
import { ACADEMIC_YEARS, type StudentProfile } from "@/lib/types/profile";
import { ChipInput } from "./ChipInput";

// Input helpers only; not claims about what Berkeley offers.
const MAJOR_SUGGESTIONS = ["Computer Science", "Data Science", "EECS", "Statistics", "Economics", "Cognitive Science", "Undeclared"];
const INTEREST_SUGGESTIONS = ["Machine Learning", "AI", "Software engineering", "Systems", "Theory", "Data visualization", "Human-computer interaction"];

export function StudentProfileForm({
  initial,
  onSave,
  onCancel,
  submitLabel,
  cancelLabel,
}: {
  initial: StudentProfile;
  onSave: (p: StudentProfile) => void;
  onCancel: () => void;
  submitLabel: string;
  cancelLabel: string;
}) {
  const [p, setP] = useState<StudentProfile>(initial);
  const set = <K extends keyof StudentProfile>(k: K, v: StudentProfile[K]) => setP((prev) => ({ ...prev, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(p);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium text-text">Academic year</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ACADEMIC_YEARS.map((y) => {
            const checked = p.academic_year === y;
            return (
              <label
                key={y}
                className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                  checked ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-text hover:border-ink"
                }`}
              >
                <input
                  type="radio"
                  name="academic_year"
                  value={y}
                  checked={checked}
                  onChange={() => set("academic_year", y)}
                  onClick={() => checked && set("academic_year", "")}
                  className="sr-only"
                />
                {y}
              </label>
            );
          })}
        </div>
      </fieldset>

      <ChipInput
        label="Major(s), current or intended"
        values={p.majors}
        onChange={(v) => set("majors", v)}
        placeholder="e.g., Data Science"
        suggestions={MAJOR_SUGGESTIONS}
      />

      <ChipInput
        label="Courses you've completed"
        hint="Use course codes. Press Enter after each one."
        values={p.completed_courses}
        onChange={(v) => set("completed_courses", v)}
        placeholder="e.g., CS 61A"
        normalize={normalizeCourseCode}
      />

      <ChipInput
        label="Academic interests"
        values={p.interests}
        onChange={(v) => set("interests", v)}
        placeholder="e.g., Machine Learning"
        suggestions={INTEREST_SUGGESTIONS}
      />

      <ChipInput
        label="Planning constraints"
        hint="Anything that limits your choices, like workload or scheduling."
        values={p.constraints}
        onChange={(v) => set("constraints", v)}
        placeholder="e.g., at most 16 units"
        optional
      />

      <p className="rounded-md bg-ink-soft px-3 py-2 text-xs leading-relaxed text-ink">
        Your profile is stored only in this browser. Don&apos;t add your name, student ID, or other personal details.
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
