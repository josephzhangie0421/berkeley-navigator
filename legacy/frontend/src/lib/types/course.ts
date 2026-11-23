/**
 * Types for the backend retrieval contract: POST /api/retrieve
 *
 * Actual backend shapes (berkeley-navigator-kb, docs/api_contract.md v0.1):
 *   fact   = { label, value, verbatim, derived?, source_url }
 *   source = { title, url, source_type, retrieved_at, verification_status }
 * The older loose variants (text/fact/content, source_id/source_index) are
 * still accepted so the stub server keeps working. `normalize.ts` converts
 * everything into the strict types below.
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
      url?: string | null;
      type?: string;
      source_type?: string;
      retrieved_at?: string | null;
      last_updated?: string;
      verification_status?: string;
    };

export type RawFact =
  | string
  | {
      /** KB backend: field name, e.g. "Prerequisite (official wording)". */
      label?: string;
      /** KB backend: field value. */
      value?: string;
      /** KB backend: true = exact official wording. */
      verbatim?: boolean;
      /** KB backend: true = computed by the API (e.g. profile overlap), not a sourced statement. */
      derived?: boolean;
      /** KB backend: URL of the source this fact came from. */
      source_url?: string | null;
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
  /** KB backend: "weak" = matched by a single shared keyword only. */
  match_strength?: string;
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
  /** e.g. "verified", "partial", "verified_possibly_stale" (backend label, shown to users when not "verified"). */
  verification_status?: string;
}

export interface Fact {
  /** Evidence-wide id ("F1", "F2", …). LLM claims cite these, not just sources. */
  id: string;
  course_id: string;
  /** Display text: "<label>: <value>" (verbatim values are quoted). */
  text: string;
  label?: string;
  /** Raw value; used to check quotes and numbers in generated claims. */
  value: string;
  /** Exact official wording. */
  verbatim: boolean;
  /** Computed by the backend (e.g. profile overlap); never shown as an official statement. */
  derived: boolean;
  source_ids: string[];
}

export interface RetrievedCourse {
  course_id: string;
  course_title: string;
  matched_reason?: string;
  match_strength: "strong" | "weak";
  facts: Fact[];
  source_ids: string[];
}

export interface RetrievalEvidence {
  courses: RetrievedCourse[];
  sources: Source[];
  limitations: string[];
}
