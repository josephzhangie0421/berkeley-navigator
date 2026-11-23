# API Contract (v0.1)

Base URL (local): `http://localhost:3001`. All responses are JSON. No authentication.

**Stability promise for the frontend:** fields listed here will not be removed or renamed within v0.x.
New fields may be added; ignore unknown fields.

## Errors

```json
{ "error": { "code": "course_not_found", "message": "No course matches \"COMPSCI 999\"." } }
```

| HTTP | code | When |
|---|---|---|
| 400 | `invalid_request` | `/api/retrieve` body fails validation |
| 400 | `invalid_json` | Body is not valid JSON |
| 400 | `invalid_limit` | `limit` out of range on `/api/courses` |
| 404 | `course_not_found` | `:id` matches no course |
| 404 | `not_found` | Unknown endpoint |
| 500 | `internal_error` | Unexpected failure |

## Course identifiers

`:id` accepts any of: numeric DB id (`9`), canonical code (`COMPSCI 189`), shorthand (`cs 189`, `CS189`),
or a recorded alias/former name (`Data 100`, `CS 182`). URL-encode spaces (`COMPSCI%20189`).
Prefer the canonical `course_code` as the stable key; numeric ids can change after a re-seed.

---

## `GET /api/health`

`{ "status": "ok", "driver": "pg" | "pglite" }`

## `GET /api/courses`

| Query param | Type | Notes |
|---|---|---|
| `query` | string | Matches code, alias, title, or summary (case-insensitive substring). |
| `department` | string | Substring of `department`, e.g. `COMPSCI`, `Statistics`. |
| `limit` | int 1–100 | Default 50. |

Response:

```json
{
  "count": 1,
  "courses": [{
    "id": 4,
    "course_code": "COMPSCI 70",
    "aliases": ["CS 70", "CS70"],
    "title": "Discrete Mathematics and Probability Theory",
    "department": "Computer Science (COMPSCI)",
    "units": "4",
    "description": "Logic, induction and infinity (...) then discrete probability through the law of large numbers.",
    "description_kind": "paraphrased_summary",
    "official_url": "https://undergraduate.catalog.berkeley.edu/courses/1044331",
    "last_verified_at": "2026-11-09T17:50:00.000Z"
  }]
}
```

## `GET /api/courses/:id`

```json
{
  "course": { "...": "same shape as in /api/courses" },
  "requirements": [{
    "id": 12,
    "course_id": 9,
    "requirement_kind": "prerequisite",
    "raw_text": "MATH 53 and MATH 54; and COMPSCI 70 or consent of instructor.",
    "structured_logic": { "op": "ALL", "items": [
      { "course": "MATH 53" }, { "course": "MATH 54" },
      { "op": "ANY", "items": [ { "course": "COMPSCI 70" }, { "condition": "consent of instructor" } ] } ] },
    "parse_status": "parsed",
    "render_warning": false,
    "notes": null,
    "catalog_scope": "Current academic year per UC Berkeley catalog (retrieved 2026-11-09)",
    "source": {
      "source_id": 10, "title": "UC Berkeley Catalog — COMPSCI 189",
      "url": "https://undergraduate.catalog.berkeley.edu/courses/1042881",
      "source_type": "official", "retrieved_at": "2026-11-09T17:50:00.000Z", "verification_status": "verified"
    }
  }],
  "sources": [{ "source_id": 10, "title": "...", "url": "...", "source_type": "official",
                "retrieved_at": "...", "verification_status": "verified", "role": "catalog_record" }]
}
```

`requirement_kind`: `prerequisite` · `corequisite` · `recommendation` · `advisory` · `credit_restriction`.
`parse_status`: `parsed` · `partial` · `raw_only` · `none`. **Display `raw_text` to users**; treat
`structured_logic` as a helper only, and show a caution when `parse_status` is not `parsed` or
`render_warning` is true.

## `GET /api/courses/:id/relations`

```json
{
  "course": { "id": 19, "course_code": "MATH 54", "title": "Linear Algebra and Differential Equations" },
  "outgoing": [{
    "id": 85,
    "source_course_id": 19, "source_course_code": "MATH 54",
    "target_course_id": null, "target_course_code": "MATH H54", "target_in_knowledge_base": false,
    "relation_type": "credit_restriction", "is_mandatory": false,
    "requirement_text": "Students will receive no credit for MATH 54 after completing MATH H54, MATH N54, MATH W54, or MATH 56.",
    "source": { "...": "same shape as above" }
  }],
  "incoming": [ "... same shape; courses whose requirements name MATH 54 (e.g. COMPSCI 189 prerequisite, DATA C100 corequisite)" ]
}
```

- `outgoing`: this course's own requirements → the courses they name.
- `incoming`: courses in the KB whose requirements name this course ("what does this unlock?" evidence).
- `relation_type`: `prerequisite` · `recommended_background` · `related_course` · `corequisite` · `credit_restriction`.
- An edge means the course is **named** in the wording. Many edges are OR-alternatives; use `requirement_text`.

## `POST /api/retrieve`

Evidence retrieval for the chat copilot. **Not a recommendation engine.** It selects courses using
transparent signals and returns source-backed facts; the LLM/frontend decides how to phrase advice.

### Request

```json
{
  "query": "What should I explore after CS 61B?",
  "student_profile": {
    "academic_year": "Sophomore",
    "majors": ["Data Science"],
    "completed_courses": ["CS 61A", "CS 61B"],
    "interests": ["Machine Learning"]
  },
  "limit": 5
}
```

| Field | Required | Notes |
|---|---|---|
| `query` | yes | 1–2000 chars. Course codes in it are detected (`CS 170`, `Data 100`, `Math 54`). |
| `student_profile` | no | All sub-fields optional. `completed_courses` / `interests` / `majors` must be string arrays. |
| `student_profile.completed_courses` | no | Used for prerequisite-overlap signals; these courses are excluded from results. |
| `student_profile.interests` | no | Matched as phrases against title + summary. |
| `student_profile.majors`, `academic_year` | no | Accepted, **not used** (no major/standing data stored). A limitation is returned. |
| `limit` | no | 1–20, default 5. |

### Response

```json
{
  "results": [{
    "course_id": "COMPSCI 189",
    "course_db_id": 9,
    "course_title": "Introduction to Machine Learning",
    "matched_reason": "Title/summary contains the stated interest: \"Machine Learning\".",
    "match_signals": [{ "type": "interest_text_match", "detail": "..." }],
    "facts": [
      { "label": "Title", "value": "Introduction to Machine Learning", "verbatim": true,
        "source_url": "https://undergraduate.catalog.berkeley.edu/courses/1042881" },
      { "label": "Units", "value": "4", "verbatim": true, "source_url": "..." },
      { "label": "Summary (paraphrased)", "value": "...", "verbatim": false, "source_url": "..." },
      { "label": "Prerequisite (official wording)",
        "value": "MATH 53 and MATH 54; and COMPSCI 70 or consent of instructor.", "verbatim": true, "source_url": "..." },
      { "label": "Profile overlap with courses named in prerequisite text (not an eligibility check)",
        "value": "Listed as completed: none. Not listed: MATH 53, MATH 54, COMPSCI 70. ...",
        "verbatim": false, "derived": true, "source_url": "..." }
    ],
    "sources": [{ "title": "UC Berkeley Catalog — COMPSCI 189",
                  "url": "https://undergraduate.catalog.berkeley.edu/courses/1042881",
                  "source_type": "official", "retrieved_at": "2026-11-09T17:50:00.000Z",
                  "verification_status": "verified" }]
  }],
  "limitations": [
    "Results are retrieved evidence, not academic advice. ...",
    "Prerequisite overlap with the student profile is not an eligibility determination (...)."
  ]
}
```

A full real response to the sample request is in `docs/examples/retrieve_sample_response.json`.

| Field | Notes |
|---|---|
| `course_id` | Canonical course code (string). Matches the spec's illustration field. |
| `course_db_id` | Numeric id for `GET /api/courses/:id`. |
| `matched_reason` | Human-readable concatenation of `match_signals[].detail`. |
| `match_signals[].type` | `named_in_query` · `prerequisite_names_profile_course` · `prerequisite_names_query_course` · `recommended_background_names_profile_course` · `interest_text_match` · `query_term_match`. |
| `facts[].verbatim` | `true` = exact official wording. `false` = paraphrase or derived. |
| `facts[].derived` | `true` = computed by this API (profile overlap). Never an eligibility verdict. |
| `facts[].source_url` | Every fact has one. |
| `match_strength` | `strong` · `weak`. *(Added in integration sprint 1.)* `weak` = matched only by one shared query keyword; do not present as relevant. |
| `limitations` | Always present. Includes global caveats and per-course warnings (truncated/uncertain requirement text, possibly stale source, courses not in KB). **Show or pass these to the LLM.** |

### Ranking (deterministic, documented so it can be tuned)

| Signal | Score |
|---|---|
| Course named in query | +100 |
| Each course in its prerequisite text that the profile lists as completed | +10 |
| Each course in its prerequisite text that the query names | +10 |
| Each recommended/preferred background course the profile lists as completed | +3 |
| Each profile interest found in title/summary | +15 (+10 once if in title) |
| Each query term (≥4 letters, not a stopword) in title/summary | +2; each 2-word query phrase +6 in title / +3 in summary |

Courses scoring 0 and courses listed as completed are excluded. Ties sort by course code.

**Integration sprint 1 additions (2026-11-09):**

- Conversational filler words (`tell`, `look`, `know`, `field`, `compare`, `hard`, …) are stopwords, so
  "Tell me about CS 999" no longer matches unrelated courses on "tell".
- **Focus rule:** when the query names a KB course that is not listed as completed, only courses with a
  query-derived signal (`named_in_query`, `prerequisite_names_query_course`, or a non-weak `query_term_match`)
  are returned. Profile-only matches no longer pad "What are the prerequisites for CS 189?".
- New limitations: `Only weak keyword matches were found …` (all results weak) and
  `No course in the knowledge base mentions these stated interests …: <interests>`.

## Integration notes for the chat frontend

1. Send the user's message as `query` and the stored profile as `student_profile` to `/api/retrieve`.
2. Pass `results[].facts`, `results[].sources`, and `limitations` to the LLM as context. Instruct it to
   quote `verbatim: true` facts exactly, cite `source_url`, and never claim eligibility or seat availability.
3. Render source links from `sources[]`; label `source_type` (`official` vs future `community`).
4. For course detail panels use `GET /api/courses/:id`; for "what does this lead to" use
   `GET /api/courses/:id/relations` → `incoming`.
5. When `parse_status` ≠ `parsed` or `render_warning` is true, show "Check the official catalog" with the link.
