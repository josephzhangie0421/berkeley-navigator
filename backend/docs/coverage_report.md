# Coverage Report

Snapshot of the seed loaded on **2026-11-09** (sources retrieved 17:35–17:58 UTC).
Numbers were computed by SQL against the seeded PostgreSQL 16 database.

## Summary

| Metric | Count |
|---|---|
| Courses in knowledge base | **21** |
| …verified against the current UC Berkeley catalog | 20 |
| …verified only against an older EECS department page (COMPSCI 162) | 1 |
| Sources | 22 (all `official`): 16 `verified`, 5 `partial`, 1 `verified_possibly_stale` |
| Course relations (all types) | 95 |
| Prerequisite edges (course named in official prerequisite text) | 65 |
| **Verified prerequisite relationships** — fully parsed wording, current-catalog source | **51** |
| Prerequisite edges with caveats (truncated / uncertain logic / possibly stale) | 14 |
| Prerequisite edges whose target is also in the KB | 34 |
| Corequisite edges | 10 (9 mandatory, 1 "strongly recommended") |
| Recommended-background edges | 4 |
| Credit-restriction edges | 16 |
| `related_course` edges | 0 (no source states such a relationship; none inferred) |

## Courses

| Course | Title | Prereq status | Notes |
|---|---|---|---|
| COMPSCI 61A | The Structure and Interpretation of Computer Programs | raw_only | Prerequisite text truncated on page |
| COMPSCI 61B | Data Structures | parsed | |
| COMPSCI 61C | Great Ideas of Computer Architecture (Machine Structures) | partial | AND/OR between two segments not visible |
| COMPSCI 70 | Discrete Mathematics and Probability Theory | raw_only | Prerequisite text truncated mid-sentence |
| COMPSCI 162 | Operating Systems and System Programming | parsed | Source is department page (© 2022) |
| COMPSCI 170 | Efficient Algorithms and Intractable Problems | parsed | |
| COMPSCI 186 | Introduction to Database Systems | parsed | |
| COMPSCI 188 | Introduction to Artificial Intelligence | parsed | |
| COMPSCI 189 | Introduction to Machine Learning | parsed | |
| DATA C8 | Foundations of Data Science | — | No prerequisite; advisory note only |
| DATA C88C | Computational Structures in Data Science | none | No Prerequisite field shown |
| DATA C100 | Principles & Techniques of Data Science | parsed | Includes corequisite |
| DATA C102 | Data, Inference, and Decisions | parsed | Includes "preferred" courses |
| DATA C140 | Probability for Data Science | parsed | Nested AND/OR; includes corequisite |
| DATA C182 | Designing, Visualizing and Understanding Deep Neural Networks | partial | Formerly COMPSCI 182; block headings rendered oddly |
| EECS 126 | Probability and Random Processes | partial | COMPSCI 70 "preferred but not required" |
| EECS 127 | Optimization Models in Engineering | parsed | |
| MATH 53 | Multivariable Calculus | parsed | |
| MATH 54 | Linear Algebra and Differential Equations | parsed | |
| STAT 134 | Concepts of Probability | parsed | "One year of calculus" (no course named) |
| STAT 135 | Concepts of Statistics | parsed | "Strongly recommended" STAT 133 corequisite |

All candidate courses from the task were included. DATA C182 is the current code for the former COMPSCI 182.
Added beyond the candidate list: COMPSCI 162, COMPSCI 186, DATA C88C, EECS 126, EECS 127, MATH 53.

## Records with missing or uncertain information: 7 courses

| Course | Issue |
|---|---|
| COMPSCI 61A | Prerequisite wording incomplete (`raw_only`) |
| COMPSCI 70 | Prerequisite wording incomplete (`raw_only`); no edges stored |
| DATA C88C | No Prerequisite field shown — recorded as `none`, not as "no prerequisite" |
| COMPSCI 61C | Joining logic uncertain (`partial`) |
| DATA C182 | Joining logic uncertain (`partial`) |
| EECS 126 | Structure uncertain (`partial`) |
| COMPSCI 162 | Source possibly stale |

Additionally, 11 requirement records carry `render_warning = true` (an empty "Complete ALL/ANY of the
following Courses:" heading appeared), meaning the catalog may list items the fetcher did not see.

Fields **not** stored for any course (by design): term offerings, instructors, seat availability,
grading basis, major/breadth requirement mapping, catalog descriptions verbatim, community reviews.

## Data sources used

- UC Berkeley Catalog — `undergraduate.catalog.berkeley.edu` (17 courses), `graduate.catalog.berkeley.edu` (3 courses)
- UC Berkeley Registrar catalog landing page (to confirm the Academic Guide redirect)
- EECS department course page (COMPSCI 162 only)

Full list: `docs/sources.md`.

## Known limitations

1. **Catalog rendering.** The catalog renders requirement blocks client-side. A text fetcher saw some
   blocks truncated or empty; affected records are flagged (`parse_status`, `render_warning`).
   A human should check the 7 flagged courses in a browser before user testing.
2. **Verbatim text via a fetch tool.** Requirement wording was captured through an HTTP fetch tool that
   returned quoted text; long fields came back in ≤125-character segments. Wording was not retyped,
   but it was not compared byte-for-byte against the raw HTML. `npm run collect:check` does that from a
   normal network.
3. **Catalog year.** The catalog describes "the current academic year" without naming it. Requirements
   for students under earlier catalogs may differ.
4. **No eligibility logic.** Grade minimums, consent, class standing, major restrictions, and
   department enforcement are not modeled. The API reports overlap only.
5. **No time-sensitive data.** No schedules, seats, waitlists, or instructors.
6. **Descriptions are paraphrased** summaries, not official text.
7. **No informal sources.** No student reviews or discussion data were collected.
8. **Aliases** include informal shorthands (`CS 189`, `Data 100`) added for lookup; cross-listings and
   former names come from the source pages.
9. **Coverage.** 21 courses. Many named prerequisite courses (MATH 1A, MATH 52, STAT 20, ELENG 64…)
   are not in the KB; their edges have `target_course_id = NULL`.
