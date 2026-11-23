// Course-code normalization. Maps common subject shorthands to catalog subject codes.
// This is string normalization only — it never invents relationships between courses.

const SUBJECT_ALIASES: Record<string, string> = {
  CS: 'COMPSCI',
  COMPSCI: 'COMPSCI',
  'COMP SCI': 'COMPSCI',
  DATA: 'DATA',
  STAT: 'STAT',
  STATS: 'STAT',
  MATH: 'MATH',
  EECS: 'EECS',
  EE: 'ELENG',
  ELENG: 'ELENG',
  'EL ENG': 'ELENG',
  ENGIN: 'ENGIN',
  PHYSICS: 'PHYSICS',
  INDENG: 'INDENG',
  INFO: 'INFO',
};

// Longest alternatives first so "COMP SCI" wins over "COMP".
const SUBJECT_PATTERN = Object.keys(SUBJECT_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map((s) => s.replace(' ', '\\s+'))
  .join('|');

// Course number: optional letter prefix (C, W, H, N, L), digits, optional letter suffix.
const CODE_RE = new RegExp(`\\b(${SUBJECT_PATTERN})\\s*([CWHNL]?\\d{1,3}[A-Z]{0,2})\\b`, 'gi');

/** Normalize one code-like string ("cs 61b", "Data C100", "EE 126") to "SUBJECT NUMBER". */
export function normalizeCode(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  CODE_RE.lastIndex = 0;
  const m = CODE_RE.exec(trimmed);
  if (!m || m.index !== 0 || m[0].length !== trimmed.length) return trimmed.toUpperCase();
  const subject = SUBJECT_ALIASES[m[1].toUpperCase().replace(/\s+/g, ' ')] ?? m[1].toUpperCase();
  return `${subject} ${m[2].toUpperCase()}`;
}

/** Extract every course-code mention from free text, normalized, de-duplicated, in order. */
export function extractCodes(text: string): string[] {
  const out: string[] = [];
  CODE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CODE_RE.exec(text)) !== null) {
    const subject = SUBJECT_ALIASES[m[1].toUpperCase().replace(/\s+/g, ' ')] ?? m[1].toUpperCase();
    const code = `${subject} ${m[2].toUpperCase()}`;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/** Key used for alias comparison: uppercase, no whitespace. "Data 100" -> "DATA100". */
export function compactKey(s: string): string {
  return s.toUpperCase().replace(/\s+/g, '');
}
