import { normalizeCourseCode } from "@/lib/courseCodes";
import { ACADEMIC_YEARS, EMPTY_PROFILE, type StudentProfile } from "@/lib/types/profile";

const MAX_ITEMS = 25;
const MAX_LEN = 80;

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const t = v.trim().replace(/\s+/g, " ").slice(0, MAX_LEN);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** Accepts untrusted input (localStorage or request body) and returns a valid profile. */
export function sanitizeProfile(value: unknown): StudentProfile {
  if (!value || typeof value !== "object") return { ...EMPTY_PROFILE };
  const v = value as Record<string, unknown>;
  const year = typeof v.academic_year === "string" ? v.academic_year : "";
  return {
    academic_year: (ACADEMIC_YEARS as readonly string[]).includes(year)
      ? (year as StudentProfile["academic_year"])
      : "",
    majors: cleanList(v.majors),
    completed_courses: cleanList(v.completed_courses).map(normalizeCourseCode),
    interests: cleanList(v.interests),
    constraints: cleanList(v.constraints),
  };
}
