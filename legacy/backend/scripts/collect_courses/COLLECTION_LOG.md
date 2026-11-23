# Collection Log — 2026-11-09

How the seed data in `database/seed/` was collected, so it can be reproduced or audited.

## Method

1. **Starting point.** The task named the UC Berkeley Academic Guide (`guide.berkeley.edu`). Requesting
   `https://guide.berkeley.edu/courses/compsci` returned **HTTP 302 → `https://registrar.berkeley.edu/catalog/`**,
   which links to the current **Undergraduate Catalog** at `https://undergraduate.catalog.berkeley.edu/`.
   The current catalog was therefore used as the primary official source.
2. **Locating course pages.** Catalog course URLs use opaque numeric IDs (`/courses/1042881`), so each
   course was located with a web search for `undergraduate.catalog.berkeley.edu <CODE> <title>`.
   Where only a `graduate.catalog.berkeley.edu` URL was returned (DATA C102, DATA C140, MATH 54), that
   page was used; it is the same catalog system and course-ID space.
3. **Extraction.** Each page was fetched with an HTTP fetch tool and the following were captured:
   code, title, units, the Prerequisite field (verbatim), the Credit Restriction text (verbatim),
   former names, and a short topic summary (paraphrased — catalog descriptions are not copied).
   The fetch tool limited single quotes to ~125 characters, so long prerequisite fields arrive as
   consecutive segments; they are joined with `' | '` in `raw_text`.
4. **Normalization.** Course codes named in requirement text were normalized to catalog subject codes
   (`Math 54` → `MATH 54`, `Data/Stat C140` → `DATA C140`, `EL ENG 16A` → `ELENG 16A`). Raw wording was
   not edited.
5. **Validation.** `src/db/seed.ts` refuses to load a relation whose target course number does not
   appear in the official wording it cites (no inferred prerequisites).

## Retrieval timestamps

All pages were fetched on 2026-11-09 between roughly 17:35Z and 17:58Z. Each source row records
17:50Z, 17:55Z, or 17:58Z depending on the batch.

## Pages and outcome

| Course | URL | Outcome |
|---|---|---|
| COMPSCI 61A | undergraduate.catalog…/courses/1044241 | Prerequisite block rendered truncated → `raw_only` |
| COMPSCI 61B | …/courses/1044261 | OK |
| COMPSCI 61C | …/courses/1044281 | Two segments, connector not visible → `partial` |
| COMPSCI 70 | …/courses/1044331 | Prerequisite text truncated mid-sentence → `raw_only` |
| COMPSCI 162 | www2.eecs.berkeley.edu/Courses/COMPSCI162/ | No catalog page found; department page (© 2022) → `verified_possibly_stale` |
| COMPSCI 170 | …/courses/1042811 | OK |
| COMPSCI 186 | …/courses/1042861 | OK |
| COMPSCI 188 | …/courses/1042871 | OK |
| COMPSCI 189 | …/courses/1042881 | OK |
| DATA C8 | …/courses/1245674 | OK (no prerequisite; advisory only) |
| DATA C88C | …/courses/1253643 | OK (no Prerequisite field shown) |
| DATA C100 | …/courses/1480472 | OK (page displays COMPSCI C100) |
| DATA C102 | graduate.catalog…/courses/1583262 | OK |
| DATA C140 | graduate.catalog…/courses/1480152 | OK |
| DATA C182 | …/courses/1571263 | Block headings rendered oddly → prerequisite `partial` |
| EECS 126 | …/courses/1543161 | "COMPSCI 70 preferred but not required" + linear algebra note → `partial` |
| EECS 127 | …/courses/1063022 | OK |
| MATH 53 | …/courses/1147021 | OK |
| MATH 54 | graduate.catalog…/courses/1147051 | OK |
| STAT 134 | …/courses/1220231 | OK |
| STAT 135 | …/courses/1220241 | OK |

## Not collected

| Candidate / source | Reason |
|---|---|
| COMPSCI 161 and other "related courses" | Kept to 21 courses; not needed for the listed priority areas. |
| `berkeley-public.courseleaf.com` | Fetch refused: site robots.txt disallows automated access. Not retried. |
| Berkeley Class Schedule (`classes.berkeley.edu`) | Not used for facts: term offerings, seats and instructors are time-sensitive and out of scope. |
| BerkeleyTime, student reviews, Reddit | Not collected in this MVP. No community data is stored; the `community` source type is supported by the schema for later. |
| Instructor syllabi | Not collected. `instructor` source type is supported for later. |

## Re-verification

`npm run collect:check` re-fetches every source URL, saves a snapshot, and reports whether each
stored verbatim segment still appears in the page. In the build environment, outbound HTTP from the
shell was blocked by a network allowlist, so the script was exercised only to the point of
`FETCH_FAILED` reports. Run it from a normal network. Because the catalog renders requirement blocks
with JavaScript, a `NOT_FOUND` from a static fetch must be checked manually in a browser.
