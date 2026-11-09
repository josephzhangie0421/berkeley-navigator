// Illustrative starter prompts, not preverified academic recommendations.
export const STARTER_QUESTIONS = [
  "What courses should I explore after CS 61B?",
  "What are the prerequisites for CS 189?",
  "How do CS 170 and CS 189 differ?",
  "I'm interested in AI. Where should I start?",
];

export function SuggestedQuestions({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Example questions">
      {STARTER_QUESTIONS.map((q) => (
        <li key={q}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className="h-full w-full rounded-md border border-line-strong bg-surface px-3.5 py-2.5 text-left text-sm text-text transition-colors hover:border-ink hover:bg-ink-soft disabled:opacity-50"
          >
            {q}
          </button>
        </li>
      ))}
    </ul>
  );
}
