import { Icon } from "@/components/ui/Icon";
import type { Source, SourceType } from "@/lib/types/course";

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  official: "Official",
  student: "Student",
  unknown: "Type not specified",
};

const TYPE_STYLE: Record<SourceType, string> = {
  official: "bg-ink-soft text-ink",
  student: "bg-gold-soft text-gold-deep",
  unknown: "bg-paper text-muted",
};

/** Inline numbered citations, e.g. [1][3]. Each opens the original source in a new tab. */
export function CitationMarks({ ids, sources }: { ids: string[]; sources: Source[] }) {
  return (
    <span className="ml-1 inline-flex gap-0.5 align-baseline">
      {ids.map((id) => {
        const idx = sources.findIndex((s) => s.id === id);
        if (idx === -1) return null;
        const s = sources[idx];
        return (
          <a
            key={id}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${s.title} (opens in a new tab)`}
            aria-label={`Source ${idx + 1}: ${s.title}, opens in a new tab`}
            className="rounded px-1 text-[0.7rem] font-semibold leading-5 text-ink ring-1 ring-line-strong hover:bg-ink hover:text-white hover:ring-ink"
          >
            {idx + 1}
          </a>
        );
      })}
    </span>
  );
}

export function SourceList({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <section aria-label="Sources" className="mt-5 border-t border-line pt-3">
      <h3 className="text-sm font-semibold text-text">Sources</h3>
      <ol className="mt-2 space-y-1.5">
        {sources.map((s, i) => (
          <li key={s.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1 text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
              >
                <span className="break-words">{s.title}</span>
                <Icon name="external" className="mt-0.5 size-3.5 shrink-0" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className={`rounded px-1.5 py-px ${TYPE_STYLE[s.type]}`}>{SOURCE_TYPE_LABEL[s.type]}</span>
                <span className="truncate">{hostname(s.url)}</span>
                {s.retrieved_at && <span>Retrieved {s.retrieved_at}</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
