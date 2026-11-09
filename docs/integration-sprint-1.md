# Integration Sprint 1 — Report

Date: 2026-11-09. Scope: connect `backend` (course KB + retrieval API) to `frontend` (chat UI + generation)
without rebuilding either or expanding MVP scope.

## 1. Compatibility report (as received)

| # | Area | Backend (actual) | Frontend (expected) | Impact | Resolution |
|---|---|---|---|---|---|
| 1 | Fact shape | `{label, value, verbatim, derived?, source_url}` | string or `{text \| fact \| content, source_id(s) \| source_index}` | **Critical:** every fact was dropped (verified: 0 of 6 facts survived for CS 189) | Normalizer reads `label`/`value`; old shapes still accepted |
| 2 | Fact → source link | by `source_url` | by `source_id` / `source_index`; fallback only if course has one source | Worked only by accident (each course has exactly one source) | Link by `source_url` explicitly |
| 3 | `verbatim` / `derived` flags | present | ignored | Computed profile overlap would be shown as "Official information" | Flags preserved; derived facts never shown or accepted as official |
| 4 | Source fields | `source_type`, `verification_status`, `url` nullable | `type`/`source_type`, no status, `url` string | Stale/partial sources not visible | Status carried through; UI tags "May be outdated" / "Partly verified" |
| 5 | `retrieved_at` | ISO timestamp | displayed raw | Cosmetic | Shown as date |
| 6 | Base URL | `:3001` | `.env.example` default `:8000` (stub) | Live mode pointed at nothing | Default set to `:3001` |
| 7 | Course ids | canonical `COMPSCI 189` | expected `CS 189` style | None (backend resolves aliases; follow-up context uses canonical ids) | No change |
| 8 | Request | `academic_year: ""`, `[]` lists accepted; `constraints` not sent | same | Compatible | No change |
| 9 | Errors | `{error:{code,message}}`, 400/404/500 | any non-2xx → generic message | Compatible | No change |
| 10 | Citation grounding | — | LLM claims validated only by source id + type | A claim citing the right catalog page with wrong content passed | Claims must cite **fact ids**; grounding checks (below) |
| 11 | Weak matches | single generic word ("tell", "look") matched courses | shown as "Found N related courses" | Unknown-course and HCI questions returned unrelated courses | Backend stopwords + `match_strength`; frontend states weak/no matches honestly |
| 12 | Focus | profile signals added 4 unrelated courses to "prerequisites for CS 189" | — | Noisy answers | Backend focus rule when the query names a KB course |

## 2. Files changed

Backend (`backend/`):
- `src/retrieve.ts` — filler stopwords; `match_strength` field; focus rule; limitations for weak-only matches and unmatched interests.
- `tests/api.test.ts` — 4 new tests (filler words, weak marking, unmatched interest, focus).
- `docs/api_contract.md` — documents the additions (additive; no fields removed or renamed).
- Course data (`database/seed/*`) — **not modified**.

Frontend (`frontend/`):
- `src/lib/types/course.ts`, `src/lib/types/message.ts` — real KB shapes; fact ids; `fact_ids` on claims.
- `src/lib/api/normalize.ts` — reads KB facts, links by URL, keeps verbatim/derived/status, assigns F1…Fn.
- `src/lib/server/generation/grounding.ts` (new) — deterministic grounding checks.
- `src/lib/server/generation/validate.ts` — fact-id citations, grounding, free-text filtering.
- `src/lib/server/generation/llm.ts` — prompt uses fact ids, verbatim quoting, weak-match and no-evidence rules; injectable fetch for tests.
- `src/lib/server/generation/evidenceOnly.ts` — honest empty/weak framing; derived overlap under "How this fits your profile"; hides informal aliases; answerable follow-up suggestions.
- `src/lib/server/retrievalQuery.ts` — follow-up context also added when a question names a course but refers back ("either of them").
- `src/components/chat/ChatMessage.tsx` (1 class), `SourceCitation.tsx` (date format + verification tag) — no layout change.
- `.env.example` — retrieval URL default `:3001`.
- `package.json` / lock — `vitest` and `@types/node@22` (dev only), `test` script, `check` includes tests.
- `tests/integration.test.ts`, `tests/fixtures/kb_*.json` (real backend responses), `vitest.config.mts`, `scripts/e2e-chat.mjs` (new).

## 3. Grounding rules (LLM path)

A generated claim is kept only if all hold; otherwise it is removed and the removal is reported in "Notes and limits":
1. It cites ≥1 existing fact id; its source citations are derived from those facts (model-supplied source ids are ignored).
2. Every course code it names appears in the cited facts (course, its aliases, or the fact wording).
3. Every number it states appears in the cited facts.
4. Any quoted text appears verbatim in the cited facts.
5. "Official" claims cite a non-derived fact from an official source.
6. It does not assert eligibility or seat availability.

Uncited AI text (direct answer, interpretation, profile explanation, model limitations, option reasons) loses any
sentence naming a course absent from the evidence/question/conversation or asserting eligibility/seats.
If nothing was retrieved, the model is not called.

## 4. End-to-end results (evidence-only mode, no API key)

`node frontend/scripts/e2e-chat.mjs` against both running servers — all 6 pass (50/50 checks).
Full transcript: `docs/e2e-evidence-only-transcript.md`.

| Scenario | Result |
|---|---|
| 1. Prerequisites for CS 189 | Only COMPSCI 189 returned; official wording "MATH 53 and MATH 54; and COMPSCI 70 or consent of instructor." shown verbatim with catalog citation; overlap shown separately as "not an eligibility check" |
| 2. Compare CS 170 and CS 189 | Both courses, no others; both official prerequisite texts and summaries, each cited |
| 3. Explore after CS 61B (DS sophomore, ML interest) | 188, 61C, 189, C100, 162; completed courses excluded; matched reasons shown; CS 162 stale-source warning shown |
| 4. HCI interest | No courses forced; "No matching course information was found"; limitation names HCI |
| 5. CS 160 (not in KB) | No courses, no invented facts; "Courses named in the query but not in the knowledge base: COMPSCI 160" |
| 6. Follow-up "Which of them requires COMPSCI 70 or a probability course?" | Previous courses (170, 189) carried into retrieval; both prerequisite texts available |

Browser check (Playwright, live mode): "Live data" header, "Retrieved evidence, no AI summary" label, verbatim
prerequisite, source link with retrieval date, unknown-course limitation; no mock labels; no console errors.

LLM path: **not run against the real API** (no key in this environment). Verified with recorded/fake HTTP
responses: valid answer kept, wrong-fact citation rejected, source-only citation rejected, wrong number
rejected, altered quote rejected, eligibility/seat claims rejected, unknown course in free text removed,
derived fact rejected as official, HTTP error falls back to evidence-only, empty evidence skips the model.

## 5. Known data-quality issues (not modified)

- Catalog text contains fetcher segment joins (" | ") inside verbatim wording: COMPSCI 61C, DATA C182, DATA C100, COMPSCI 70.
- COMPSCI 70 and COMPSCI 61A prerequisite text is truncated (`raw_only`); COMPSCI 70 reads "…equivalent to that gained in 3 | or the Advanced Placement…".
- COMPSCI 61C, DATA C182, EECS 126: AND/OR structure uncertain (`partial`).
- COMPSCI 162 source is a 2022 EECS department page (`verified_possibly_stale`).
- DATA C100 credit restriction reads "no credit for DATA C100\STAT C100\COMPSCI C100 after completing DATA 100" — looks like a catalog quirk; needs a human check.
- 11 requirement records have `render_warning` (empty "Complete ALL/ANY" headings).
- No HCI, CS 160, or other courses outside 21 CS/DS/Math/Stat courses; no student/community sources; no terms, instructors, workload.
- "Also known as" mixes catalog cross-listings with informal shorthands added by the KB; hidden from the evidence-only answer.

## 6. Remaining blockers before real student testing

1. **LLM answers untested with a real key.** Need an Anthropic key in `frontend/.env.local` and a review of real outputs (quality, latency, how often grounding removes claims).
2. **Human verification of the 7 flagged courses** in a browser against the live catalog (backend `npm run collect:check` from a normal network).
3. **Consent/logging not implemented.** Feedback stays in page memory; the spec's consent-based research logging needs a founder decision on storage and retention.
4. **Retrieval is keyword-based.** Topic questions only match words in short paraphrased summaries (e.g. "probability" works; "HCI" correctly finds nothing; synonyms are missed).
5. Not deployed; runs locally only.
