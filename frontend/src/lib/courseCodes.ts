/** Lightweight detection of Berkeley-style course codes such as "CS 61B", "Data C100", "math 54". */
const CODE_RE = /\b([A-Za-z]{2,8})\s?(C?\d{1,3}[A-Za-z]{0,2})\b/g;
const NOT_DEPARTMENTS = new Set([
  "top", "in", "on", "the", "about", "after", "before", "under", "over", "take", "taking", "year",
  "fall", "spring", "summer", "unit", "units", "week", "weeks", "only", "than", "least", "most", "class",
]);

export function findCourseCodes(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CODE_RE)) {
    if (NOT_DEPARTMENTS.has(m[1].toLowerCase())) continue;
    const code = `${m[1].toUpperCase()} ${m[2].toUpperCase()}`;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/** "cs61a" / "CS61A" / "cs 61a" → "CS 61A". Leaves anything else untouched. */
export function normalizeCourseCode(input: string): string {
  const t = input.trim().replace(/\s+/g, " ");
  const m = t.match(/^([A-Za-z][A-Za-z ,&]*?)\s?(C?\d{1,3}[A-Za-z]{0,3})$/);
  if (!m) return t;
  return `${m[1].trim().toUpperCase()} ${m[2].toUpperCase()}`;
}
