-- Berkeley Navigator — Course Knowledge Base
-- PostgreSQL-compatible schema (tested on PostgreSQL 16 and PGlite).
-- Migration 001. Apply with `npm run db:init`.

BEGIN;

-- ---------------------------------------------------------------------------
-- sources: every document a fact was taken from.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
  id                  SERIAL PRIMARY KEY,
  source_key          TEXT NOT NULL UNIQUE,          -- stable key used by seed files
  source_type         TEXT NOT NULL CHECK (source_type IN ('official', 'instructor', 'community')),
  title               TEXT NOT NULL,
  url                 TEXT,                          -- NULL only if the source has no URL
  content             TEXT,                          -- verbatim excerpts captured at retrieval time
  retrieved_at        TIMESTAMPTZ NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN (
                        'verified',                  -- fetched from current official catalog
                        'verified_possibly_stale',   -- official, but page shows an older update year
                        'partial',                   -- page fetched, some fields not fully visible
                        'unverified',
                        'inaccessible'))
);

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id                SERIAL PRIMARY KEY,
  course_code       TEXT NOT NULL UNIQUE,            -- canonical catalog code, e.g. 'COMPSCI 189'
  aliases           TEXT[] NOT NULL DEFAULT '{}',    -- cross-listings, former names, common short forms
  title             TEXT NOT NULL,
  department        TEXT NOT NULL,
  units             TEXT,                            -- text: catalog may give ranges ("1-4")
  description       TEXT,                            -- short paraphrased summary (NOT verbatim)
  description_kind  TEXT NOT NULL DEFAULT 'paraphrased_summary'
                      CHECK (description_kind IN ('paraphrased_summary', 'verbatim', 'missing')),
  official_url      TEXT,
  last_verified_at  TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- course_sources: many-to-many courses <-> sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS course_sources (
  course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source_id  INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'catalog_record',   -- catalog_record | department_page | syllabus | review
  PRIMARY KEY (course_id, source_id)
);

-- ---------------------------------------------------------------------------
-- requirement_sets (added table): one row per requirement field of a course,
-- holding the exact official wording plus an optional structured encoding.
-- Why: course_relations alone cannot preserve full wording, AND/OR nesting,
-- grade conditions, or non-course conditions ("consent of instructor").
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requirement_sets (
  id               SERIAL PRIMARY KEY,
  course_id        INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  requirement_kind TEXT NOT NULL CHECK (requirement_kind IN
                     ('prerequisite', 'corequisite', 'recommendation', 'advisory', 'credit_restriction')),
  raw_text         TEXT NOT NULL,      -- exact official wording; segments joined with ' | ' where the page split them
  structured_logic JSONB,              -- researcher encoding of raw_text; NULL when not safely encodable
  parse_status     TEXT NOT NULL CHECK (parse_status IN
                     ('parsed',        -- wording is complete and logic is unambiguous
                      'partial',       -- wording visible but joining logic or structure uncertain
                      'raw_only',      -- wording incomplete/truncated; no structure encoded
                      'none')),        -- course has no such requirement
  render_warning   BOOLEAN NOT NULL DEFAULT FALSE,  -- catalog showed a requirement block whose items did not render
  notes            TEXT,
  catalog_scope    TEXT,               -- e.g. 'Current academic year (undergraduate catalog)'
  source_id        INTEGER NOT NULL REFERENCES sources(id)
);

-- ---------------------------------------------------------------------------
-- course_relations: edges between courses, each tied to its source wording.
-- Direction: source_course_id HAS the requirement; target is the course named.
--   e.g. (COMPSCI 189) --prerequisite--> (MATH 54)
-- target_course_id is NULL when the named course is outside current coverage;
-- target_course_code always holds the code exactly as normalized from the text.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS course_relations (
  id                 SERIAL PRIMARY KEY,
  source_course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  target_course_id   INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  target_course_code TEXT NOT NULL,
  relation_type      TEXT NOT NULL CHECK (relation_type IN (
                       'prerequisite', 'recommended_background', 'related_course',
                       'corequisite', 'credit_restriction')),
  is_mandatory       BOOLEAN NOT NULL,
  requirement_text   TEXT NOT NULL,   -- exact official wording of the requirement this edge comes from
  requirement_set_id INTEGER REFERENCES requirement_sets(id) ON DELETE CASCADE,
  source_id          INTEGER NOT NULL REFERENCES sources(id),
  UNIQUE (source_course_id, target_course_code, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_relations_source ON course_relations(source_course_id);
CREATE INDEX IF NOT EXISTS idx_relations_target_code ON course_relations(target_course_code);
CREATE INDEX IF NOT EXISTS idx_courses_department ON courses(department);

COMMIT;
