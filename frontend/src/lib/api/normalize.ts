import type {
  Fact,
  RawFact,
  RawSource,
  RetrievalEvidence,
  RetrieveResponse,
  Source,
  SourceType,
} from "@/lib/types/course";

const OFFICIAL_HINTS = ["official", "catalog", "university", "department", "registrar", "schedule", "guide"];
const STUDENT_HINTS = ["student", "review", "forum", "reddit", "informal", "community", "peer"];

/**
 * Map a backend-provided type label onto our three tiers.
 * We deliberately do NOT infer "official" from the URL domain: many
 * berkeley.edu subdomains host student-run content.
 */
export function classifySourceType(label?: string): SourceType {
  if (!label) return "unknown";
  const l = label.toLowerCase();
  if (STUDENT_HINTS.some((h) => l.includes(h))) return "student";
  if (OFFICIAL_HINTS.some((h) => l.includes(h))) return "official";
  return "unknown";
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function factText(f: RawFact): string {
  if (typeof f === "string") return f.trim();
  return (f.text ?? f.fact ?? f.content ?? "").trim();
}

/**
 * Convert the loosely-typed retrieval response into strict evidence.
 *
 * - Sources are de-duplicated by URL and re-labelled S1, S2, … so the
 *   answer generator and UI share a single citation namespace.
 * - Sources without a valid http(s) URL are dropped (they can't be opened).
 * - A fact keeps a source link only when the backend gave one explicitly,
 *   or when its course has exactly one source. Otherwise the fact has no
 *   citation and is shown as unverified.
 */
export function normalizeRetrieveResponse(raw: RetrieveResponse): RetrievalEvidence {
  const sources: Source[] = [];
  const byUrl = new Map<string, Source>();

  const registerSource = (s: RawSource): Source | null => {
    const obj = typeof s === "string" ? { url: s } : s;
    if (!isHttpUrl(obj.url)) return null;
    const existing = byUrl.get(obj.url);
    if (existing) return existing;
    const src: Source = {
      id: `S${sources.length + 1}`,
      title: (obj.title ?? obj.name ?? obj.url).trim(),
      url: obj.url,
      type: classifySourceType(obj.type ?? obj.source_type),
      retrieved_at: obj.retrieved_at ?? obj.last_updated,
    };
    sources.push(src);
    byUrl.set(obj.url, src);
    return src;
  };

  const courses = (Array.isArray(raw.results) ? raw.results : [])
    .filter((r) => r && typeof r.course_id === "string")
    .map((r) => {
      const rawSources = Array.isArray(r.sources) ? r.sources : [];
      // Map backend ids / positions → our ids
      const localIdMap = new Map<string, string>();
      const localByIndex: (string | null)[] = [];
      for (const s of rawSources) {
        const reg = registerSource(s);
        localByIndex.push(reg?.id ?? null);
        if (reg && typeof s !== "string") {
          const backendId = s.id ?? s.source_id;
          if (backendId) localIdMap.set(backendId, reg.id);
        }
      }
      const courseSourceIds = [...new Set(localByIndex.filter((x): x is string => !!x))];

      const facts: Fact[] = (Array.isArray(r.facts) ? r.facts : [])
        .map((f): Fact | null => {
          const text = factText(f);
          if (!text) return null;
          let ids: string[] = [];
          if (typeof f !== "string") {
            const refs = [...(f.source_ids ?? []), ...(f.source_id ? [f.source_id] : [])];
            ids = refs.map((ref) => localIdMap.get(ref)).filter((x): x is string => !!x);
            if (typeof f.source_index === "number") {
              const byIdx = localByIndex[f.source_index];
              if (byIdx) ids.push(byIdx);
            }
          }
          if (ids.length === 0 && courseSourceIds.length === 1) ids = [courseSourceIds[0]];
          return { text, source_ids: [...new Set(ids)] };
        })
        .filter((x): x is Fact => !!x);

      return {
        course_id: r.course_id,
        course_title: r.course_title ?? r.course_id,
        matched_reason: r.matched_reason,
        facts,
        source_ids: courseSourceIds,
      };
    });

  const limitations = (Array.isArray(raw.limitations) ? raw.limitations : []).filter(
    (l): l is string => typeof l === "string" && l.trim().length > 0,
  );

  return { courses, sources, limitations };
}
