/**
 * Deterministic grounding checks for generated text.
 *
 * A citation must point to the specific retrieved fact that supports a
 * statement, not just to a valid source URL. These checks catch the common
 * ways a model drifts from its evidence:
 *   - naming a course that the cited facts do not mention
 *   - stating a number (units, course numbers, grades) absent from the cited facts
 *   - "quoting" official wording that is not in the cited facts
 *   - asserting eligibility or live seat availability (never supported by this KB)
 * They do not prove a paraphrase is faithful; they reject the detectable errors.
 */
import type { Fact, RetrievalEvidence } from "@/lib/types/course";

/** Subject shorthands → catalog subject (mirrors berkeley-navigator-kb src/lib/codes.ts). */
const SUBJECT_ALIASES: Record<string, string> = {
  CS: "COMPSCI",
  COMPSCI: "COMPSCI",
  "COMP SCI": "COMPSCI",
  DATA: "DATA",
  STAT: "STAT",
  STATS: "STAT",
  MATH: "MATH",
  EECS: "EECS",
  EE: "ELENG",
  ELENG: "ELENG",
  "EL ENG": "ELENG",
  ENGIN: "ENGIN",
  PHYSICS: "PHYSICS",
  INDENG: "INDENG",
  INFO: "INFO",
};

const KNOWN_SUBJECTS = Object.keys(SUBJECT_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map((s) => s.replace(" ", "\\s+"))
  .join("|");
const NUMBER = "[CWHNL]?\\d{1,3}[A-Z]{0,2}";
/** Known subjects in any case ("cs 189", "Data C100"). */
const KNOWN_CODE_RE = new RegExp(`\\b(${KNOWN_SUBJECTS})\\s*(${NUMBER})\\b`, "gi");
/** Any other ALL-CAPS subject ("PSYCH 101", "COGSCI 131"); case-sensitive to avoid "and 54". */
const OTHER_CODE_RE = new RegExp(`\\b([A-Z]{2,8})\\s(${NUMBER})\\b`, "g");

function canonical(subject: string, number: string): string {
  const subj = subject.toUpperCase().replace(/\s+/g, " ");
  return `${SUBJECT_ALIASES[subj] ?? subj.replace(/\s+/g, "")}${number.toUpperCase()}`;
}

/** Course codes mentioned in text, as compact canonical keys ("COMPSCI189"). */
export function courseKeys(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(KNOWN_CODE_RE)) out.add(canonical(m[1], m[2]));
  for (const m of text.matchAll(OTHER_CODE_RE)) out.add(canonical(m[1], m[2]));
  return [...out];
}

function stripCodes(text: string): string {
  return text.replace(KNOWN_CODE_RE, " ").replace(OTHER_CODE_RE, " ");
}

/** Compact key for a code string as stored by the backend ("COMPSCI 189", "CS189", "Data 100"). */
function keyOf(code: string): string {
  return courseKeys(code)[0] ?? code.toUpperCase().replace(/\s+/g, "");
}

const norm = (s: string) => s.toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();

/** Keys for a course plus its recorded aliases (from its "Also known as" fact). */
function courseAliasKeys(evidence: RetrievalEvidence, courseId: string): string[] {
  const course = evidence.courses.find((c) => c.course_id === courseId);
  const keys = [keyOf(courseId)];
  const alias = course?.facts.find((f) => f.label === "Also known as");
  if (alias) for (const a of alias.value.split(",")) keys.push(keyOf(a.trim()));
  return keys;
}

const ELIGIBILITY_RE =
  /\b(you(?:'re| are)? (?:now )?eligible|you (?:can|may) (?:now )?enroll|you(?:'ve| have) (?:met|satisfied|fulfilled) (?:all |the )?(?:prerequisites|requirements)|seats? (?:are |is )?(?:still )?available|open seats|has (?:open )?seats)\b/i;

export function assertsEligibilityOrSeats(text: string): boolean {
  return ELIGIBILITY_RE.test(text);
}

/**
 * Check one claim against the facts it cites.
 * Returns null if grounded, otherwise a short reason (for logs/tests).
 */
export function checkClaim(text: string, cited: Fact[], evidence: RetrievalEvidence): string | null {
  if (!cited.length) return "no cited facts";
  if (assertsEligibilityOrSeats(text)) return "asserts eligibility or seat availability";

  const allowed = new Set<string>();
  for (const f of cited) {
    courseAliasKeys(evidence, f.course_id).forEach((k) => allowed.add(k));
    courseKeys(f.value).forEach((k) => allowed.add(k));
  }
  const unknownCodes = courseKeys(text).filter((k) => !allowed.has(k));
  if (unknownCodes.length) return `course code(s) not in cited facts: ${unknownCodes.join(", ")}`;

  const citedText = cited.map((f) => f.value).join(" \n ");
  const citedNumbers = new Set(stripCodes(citedText).match(/\d+(?:\.\d+)?/g) ?? []);
  // Bare course numbers inside cited wording ("MATH 54, 56, 110") count as present too.
  (citedText.match(/\d+(?:\.\d+)?/g) ?? []).forEach((n) => citedNumbers.add(n));
  const numbers = stripCodes(text).match(/\d+(?:\.\d+)?/g) ?? [];
  const missing = numbers.filter((n) => !citedNumbers.has(n));
  if (missing.length) return `number(s) not in cited facts: ${missing.join(", ")}`;

  const quotes = [...text.matchAll(/[“"]([^“”"]{6,})[”"]/g)].map((m) => m[1]);
  const normCited = norm(citedText);
  const badQuote = quotes.find((q) => !normCited.includes(norm(q)));
  if (badQuote) return `quoted text not found verbatim in cited facts: "${badQuote.slice(0, 60)}"`;

  return null;
}

/** Course keys that free text (direct answer, interpretation, …) may mention. */
export function allowedFreeTextKeys(evidence: RetrievalEvidence, extraTexts: string[]): Set<string> {
  const allowed = new Set<string>();
  for (const c of evidence.courses) {
    courseAliasKeys(evidence, c.course_id).forEach((k) => allowed.add(k));
    for (const f of c.facts) courseKeys(f.value).forEach((k) => allowed.add(k));
  }
  for (const t of [...extraTexts, ...evidence.limitations]) courseKeys(t).forEach((k) => allowed.add(k));
  return allowed;
}

/**
 * Remove sentences from uncited free text that name a course absent from the
 * evidence/conversation or that assert eligibility/seat availability.
 */
export function filterFreeText(text: string | undefined, allowed: Set<string>): { text?: string; removed: number } {
  if (!text) return { text, removed: 0 };
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter(
    (s) => !assertsEligibilityOrSeats(s) && courseKeys(s).every((k) => allowed.has(k)),
  );
  const out = kept.join(" ").trim();
  return { text: out || undefined, removed: sentences.length - kept.length };
}
