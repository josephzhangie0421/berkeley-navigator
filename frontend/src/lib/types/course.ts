/**
 * Types for the backend retrieval contract: POST /api/retrieve
 *
 * The contract example leaves `facts` and `sources` as empty arrays, so their
 * item shapes are not yet fixed. `RawFact` / `RawSource` accept the likely
 * variants; `normalize.ts` converts them into the strict types below.
 * Confirm the final shapes with the backend team.
 */
import type { StudentProfile } from "./profile";

export interface RetrieveRequest {
  query: string;
  student_profile: Omit<StudentProfile, "constraints"> & { constraints?: string[] };
  limit: number;
}

export type RawSource =
  | string
  | {
      id?: string;
      source_id?: string;
      title?: string;
      name?: string;
      url?: string;
      type?: string;
      source_type?: string;
      retrieved_at?: string;
      last_updated?: string;
    };

export type RawFact =
  | string
  | {
      text?: string;
      fact?: string;
      content?: string;
      source_id?: string;
      source_ids?: string[];
      source_index?: number;
      type?: string;
      category?: string;
    };

export interface RawRetrievedCourse {
  course_id: string;
  course_title: string;
  matched_reason?: string;
  facts?: RawFact[];
  sources?: RawSource[];
}

export interface RetrieveResponse {
  results: RawRetrievedCourse[];
  limitations?: string[];
}

/* ---------- Normalized (strict) shapes used inside the app ---------- */

/**
 * official  – published by the university (catalog, department, Schedule of Classes)
 * student   – informal student-generated content (reviews, forums, student orgs)
 * unknown   – backend did not label the source; never shown as official
 */
export type SourceType = "official" | "student" | "unknown";

export interface Source {
  id: string;
  title: string;
  url: string;
  type: SourceType;
  retrieved_at?: string;
}

export interface Fact {
  text: string;
  source_ids: string[];
}

export interface RetrievedCourse {
  course_id: string;
  course_title: string;
  matched_reason?: string;
  facts: Fact[];
  source_ids: string[];
}

export interface RetrievalEvidence {
  courses: RetrievedCourse[];
  sources: Source[];
  limitations: string[];
}
