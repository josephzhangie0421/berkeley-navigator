import type { DataMode } from "@/lib/config";

export function AppHeader({ mode, onNewSession }: { mode: DataMode; onNewSession?: () => void }) {
  return (
    <header className="shrink-0 border-b border-line bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="font-serif text-lg font-semibold tracking-tight text-ink sm:text-xl">Berkeley Navigator</span>
            <span className="hidden text-sm text-muted sm:inline">Course exploration prototype</span>
          </p>
          <p className="text-xs text-muted">Independent student project. Not affiliated with or endorsed by UC Berkeley.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`hidden rounded px-2 py-1 text-xs font-medium sm:inline-block ${
              mode === "mock" ? "bg-gold-soft text-gold-deep" : "bg-ink-soft text-ink"
            }`}
          >
            {mode === "mock" ? "Mock mode" : "Live data"}
          </span>
          {onNewSession && (
            <button
              type="button"
              onClick={onNewSession}
              className="rounded-md border border-line-strong px-2.5 py-1.5 text-sm text-ink hover:bg-ink-soft"
            >
              New session
            </button>
          )}
        </div>
      </div>
      {mode === "mock" && (
        <p className="border-t border-gold/40 bg-gold-soft px-4 py-1.5 text-xs text-gold-deep sm:px-5" role="note">
          <strong className="font-semibold">Mock mode:</strong> answers are simulated for interface testing and contain no
          real course information.
        </p>
      )}
    </header>
  );
}
