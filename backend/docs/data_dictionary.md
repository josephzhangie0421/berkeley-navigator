# Data Dictionary

Schema: `database/schema.sql` (PostgreSQL 16 compatible; also runs on PGlite).

```
sources ──< course_sources >── courses ──< requirement_sets ──< course_relations >── courses (target, nullable)
   └──────────────────────────────────────────────┴──────────────────────┘ (source_id on each)
```

## `courses`

| Column | Type | Notes |
|---|---|---|
| id | serial PK | Internal id. Not stable across re-seeds — use `course_code` as the external key. |
| course_code | text, unique | Canonical catalog code, e.g. `COMPSCI 189`, `DATA C100`. |
| aliases | text[] | Cross-listings and former names stated by the source (`COMPSCI C100`, `COMPSCI 182`) plus common shorthands (`CS 189`, `Data 100`). Used only for lookup. |
| title | text | Exact catalog title. |
| department | text | Subject area derived from the course code, e.g. `Computer Science (COMPSCI)`. Not the administering unit. |
| units | text | Text so ranges like `1-4` fit. All current rows are fixed values. |
| description | text | **Paraphrased** 1–2 sentence topic summary written for this KB. Not catalog wording. |
| description_kind | text | `paraphrased_summary` \| `verbatim` \| `missing`. |
| official_url | text | Page the record was verified against. |
| last_verified_at | timestamptz | Retrieval time of that page. |

## `sources`

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| source_key | text, unique | **Added.** Stable key used by seed files to reference a source. |
| source_type | text | `official` \| `instructor` \| `community`. Only `official` rows exist today. |
| title | text | Human-readable label. |
| url | text | Exact page fetched. |
| content | text | Verbatim excerpts captured at retrieval (prerequisite, credit restriction, units) plus collection notes. |
| retrieved_at | timestamptz | When the page was fetched. |
| verification_status | text | `verified` · `verified_possibly_stale` (official but older page) · `partial` (page fetched, some requirement text not fully visible) · `unverified` · `inaccessible`. |

## `course_sources`

Many-to-many between `courses` and `sources`. `role`: `catalog_record` \| `department_page` \| `syllabus` \| `review`.

## `requirement_sets` (added table)

**Why added:** a single edge table cannot preserve full official wording, nested AND/OR,
grade conditions (`C- or better, or Pass`), or non-course conditions (`consent of instructor`).
This table stores each requirement field once, verbatim, and is the authoritative record.

| Column | Type | Notes |
|---|---|---|
| course_id | FK courses | Course that has the requirement. |
| requirement_kind | text | `prerequisite` · `corequisite` · `recommendation` · `advisory` · `credit_restriction`. |
| raw_text | text | **Exact official wording.** Where the page rendered the field as separate blocks, segments are joined with ` \| `. |
| structured_logic | jsonb | Optional encoding of `raw_text` (see below). `NULL` when not safely encodable. **Never authoritative.** |
| parse_status | text | `parsed` (complete wording, unambiguous logic) · `partial` (wording visible, joining logic uncertain) · `raw_only` (wording truncated; no structure) · `none` (no such field on the page). |
| render_warning | bool | The catalog showed a "Complete ALL/ANY of the following Courses:" heading whose list did not render to the fetcher. There may be items not captured. |
| notes | text | Collector notes on ambiguity. |
| catalog_scope | text | Which catalog/year the wording comes from. Requirements can change by catalog year. |
| source_id | FK sources | |

### `structured_logic` format

```json
{ "op": "ALL", "grade": "C- or better, or Pass", "items": [
  { "course": "MATH 53" },
  { "op": "ANY", "items": [ { "course": "COMPSCI 70" }, { "condition": "consent of instructor" } ] }
]}
```

- `op`: `ALL` (every item) or `ANY` (at least one item). Groups nest.
- Item kinds: `{ "course": CODE }`, `{ "condition": TEXT }`, or a nested group.
- Optional: `grade`, `preferred` (array of codes the wording calls preferred), `note`, `logic_confidence: "uncertain"` (set when `parse_status = partial`).

## `course_relations`

One row per course **literally named** in a requirement's official wording. Direction: the
`source_course` has the requirement; the `target` is the course named.
`(COMPSCI 189) —prerequisite→ (MATH 54)`.

| Column | Type | Notes |
|---|---|---|
| source_course_id | FK courses | Course with the requirement. |
| target_course_id | FK courses, nullable | Set when the named course (or a former name/cross-listing recorded as an alias) is in the KB. `NULL` = outside current coverage. |
| target_course_code | text | Code as named in the wording, normalized (`Math 54` → `MATH 54`). Always present. |
| relation_type | text | `prerequisite` · `recommended_background` · `related_course` (supported, no rows yet) · **added:** `corequisite`, `credit_restriction`. |
| is_mandatory | bool | `false` for recommendations, "preferred", and "strongly recommended" corequisites. |
| requirement_text | text | Same exact wording as the parent `requirement_sets.raw_text`. |
| requirement_set_id | FK | Parent requirement. |
| source_id | FK sources | |

**Important:** an edge means "this course is named in the requirement", not "this course is required".
Most edges are alternatives inside an `ANY` group. To decide what is actually required, read
`requirement_text` (or `structured_logic`). Unique on `(source_course_id, target_course_code, relation_type)`.

**Why `corequisite` and `credit_restriction` were added:** both appear in official course records
(e.g. DATA C100's linear-algebra corequisite; "no credit for MATH 54 after completing MATH H54"),
and merging them into `prerequisite` would misstate requirements.

## Rules enforced by the seed loader (`src/db/seed.ts`)

- Every course must reference a source with a URL and a valid `retrieved_at`.
- Every relation target's course number must appear in the official wording it cites.
- Relations are never created from course numbers or subject similarity.
