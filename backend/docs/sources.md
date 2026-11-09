# Sources

All facts in the knowledge base come from the official sources below. Full verbatim excerpts are in
`database/seed/sources.json` (`content` field) and in the `sources` table. Collection method:
`scripts/collect_courses/COLLECTION_LOG.md`.

## Source hierarchy used

1. **UC Berkeley Catalog** (`undergraduate.catalog.berkeley.edu`, `graduate.catalog.berkeley.edu`) — primary.
   The Academic Guide (`guide.berkeley.edu/courses/...`) now redirects (HTTP 302) to the Registrar's
   catalog page, which points to this catalog for the current academic year.
2. **EECS department course pages** (`www2.eecs.berkeley.edu/Courses/...`) — used only for COMPSCI 162,
   for which no current catalog page was found.
3. Berkeley Class Schedule — **not used** for facts (time-sensitive; out of scope).
4. Instructor sites/syllabi, BerkeleyTime, student discussions — **not collected** in this MVP.

## Source list (retrieved 2026-11-09)

| Key | Course | URL | Status |
|---|---|---|---|
| registrar-catalog-landing | — | https://registrar.berkeley.edu/catalog/ | verified |
| cat-compsci-61a | COMPSCI 61A | https://undergraduate.catalog.berkeley.edu/courses/1044241 | partial |
| cat-compsci-61b | COMPSCI 61B | https://undergraduate.catalog.berkeley.edu/courses/1044261 | verified |
| cat-compsci-61c | COMPSCI 61C | https://undergraduate.catalog.berkeley.edu/courses/1044281 | partial |
| cat-compsci-70 | COMPSCI 70 | https://undergraduate.catalog.berkeley.edu/courses/1044331 | partial |
| cat-compsci-162-dept | COMPSCI 162 | https://www2.eecs.berkeley.edu/Courses/COMPSCI162/index.html | verified_possibly_stale |
| cat-compsci-170 | COMPSCI 170 | https://undergraduate.catalog.berkeley.edu/courses/1042811 | verified |
| cat-compsci-186 | COMPSCI 186 | https://undergraduate.catalog.berkeley.edu/courses/1042861 | verified |
| cat-compsci-188 | COMPSCI 188 | https://undergraduate.catalog.berkeley.edu/courses/1042871 | verified |
| cat-compsci-189 | COMPSCI 189 | https://undergraduate.catalog.berkeley.edu/courses/1042881 | verified |
| cat-data-c8 | DATA C8 | https://undergraduate.catalog.berkeley.edu/courses/1245674 | verified |
| cat-data-c88c | DATA C88C | https://undergraduate.catalog.berkeley.edu/courses/1253643 | verified |
| cat-data-c100 | DATA C100 | https://undergraduate.catalog.berkeley.edu/courses/1480472 | verified |
| cat-data-c102 | DATA C102 | https://graduate.catalog.berkeley.edu/courses/1583262 | verified |
| cat-data-c140 | DATA C140 | https://graduate.catalog.berkeley.edu/courses/1480152 | verified |
| cat-data-c182 | DATA C182 | https://undergraduate.catalog.berkeley.edu/courses/1571263 | partial |
| cat-eecs-126 | EECS 126 | https://undergraduate.catalog.berkeley.edu/courses/1543161 | partial |
| cat-eecs-127 | EECS 127 | https://undergraduate.catalog.berkeley.edu/courses/1063022 | verified |
| cat-math-53 | MATH 53 | https://undergraduate.catalog.berkeley.edu/courses/1147021 | verified |
| cat-math-54 | MATH 54 | https://graduate.catalog.berkeley.edu/courses/1147051 | verified |
| cat-stat-134 | STAT 134 | https://undergraduate.catalog.berkeley.edu/courses/1220231 | verified |
| cat-stat-135 | STAT 135 | https://undergraduate.catalog.berkeley.edu/courses/1220241 | verified |

`partial` = the page was fetched and title/units/credit restriction captured, but part of the
prerequisite block did not render (truncated text or empty "Complete ALL/ANY" headings).

## Access notes

- `berkeley-public.courseleaf.com` refused automated access via robots.txt; it was not used or retried.
- No site was scraped in bulk. Each page was requested once, individually.
- Catalog descriptions were **not** copied. The `description` column holds short paraphrased summaries;
  only short requirement statements (prerequisites, credit restrictions) are stored verbatim.

## Adding community or instructor sources later

Insert a `sources` row with `source_type = 'community'` or `'instructor'` and link it through
`course_sources` (role `review` or `syllabus`). Keep these out of `requirement_sets`: requirements
must come from `official` sources only. The API returns `source_type` on every source so the
frontend can label informal content.
