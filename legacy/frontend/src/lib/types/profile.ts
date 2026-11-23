export const ACADEMIC_YEARS = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Transfer student",
  "Graduate student",
  "Other",
] as const;

export type AcademicYear = (typeof ACADEMIC_YEARS)[number];

/** Matches the `student_profile` shape in the retrieval contract (plus optional constraints). */
export interface StudentProfile {
  academic_year: AcademicYear | "";
  majors: string[];
  completed_courses: string[];
  interests: string[];
  constraints: string[];
}

export const EMPTY_PROFILE: StudentProfile = {
  academic_year: "",
  majors: [],
  completed_courses: [],
  interests: [],
  constraints: [],
};

export function isProfileEmpty(p: StudentProfile): boolean {
  return (
    !p.academic_year &&
    p.majors.length === 0 &&
    p.completed_courses.length === 0 &&
    p.interests.length === 0 &&
    p.constraints.length === 0
  );
}
