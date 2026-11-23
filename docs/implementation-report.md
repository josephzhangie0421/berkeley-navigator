# Implementation report — 2026-11-22

## Scope and preservation

The source of truth is the verified private monorepo at commit `45c7783`, not the older split Desktop projects. Work started on `redesign/fastapi-gemini-mvp`. All original tracked frontend/backend assets were moved to `legacy/`, including evidence fixtures, raw seed data, normalization logic and tests. Existing local dependency/build artifacts were moved there as well to keep the static serving directory clean.

The correct baseline contained **31 backend tests and 22 frontend integration tests**, all passing when the backend was allowed to bind temporary local ports. The earlier Desktop audit counted only 27 backend tests and found no frontend tests; those findings do not describe the newer monorepo. A legacy browser test script exists but was not run in this implementation session.

The seed files contain **21 courses, 22 sources, 35 requirements and 95 relation records**. These counts describe repository data, not a live cloud database. The new importer preserves the originals and produces 21 structurally valid unreviewed candidates. It does not infer approval from historical source labels.

## Implemented

- FastAPI/Pydantic API and PostgreSQL parameterized retrieval, including real full-text search.
- Catalog-year/revision schema, source evidence, immutable publication history, pending candidates, restricted published-data views and runtime reader-role setup.
- Strict nested prerequisite grammar and independently tested three-valued evaluator.
- Official Gemini SDK/native function calling, allowlisted tools, server-owned profile/year, call/round/time limits and deterministic evidence rendering.
- Vanilla responsive frontend with session-only profile/history, search, course cards, source links, check explanations, loading/error states and clear-session controls.
- Candidate validation/staging, change collection, human review and atomic publication CLI.
- GitHub CI with real PostgreSQL, opt-in live integration workflow, manually gated Azure deployment workflow, compiled Bicep infrastructure and secure local/cloud secret helpers.

## Verification

- Legacy baseline: 31 backend + 22 frontend tests passed.
- New suite: **67 passed, 1 skipped** on local PostgreSQL 17; the skip is the explicit live Gemini test.
- Real database tests cover migration idempotency, exact/title/FTS retrieval, source links, pending exclusion, evidence visibility, publication constraints, historical revisions and immutability.
- HTTPX tests cover API responses, validation, body limits, missing records/configuration and real SQL-backed checks.
- Deterministic mocked Gemini tests cover multiple calls, malformed/unknown tools, profile/year tampering, call/round limits, upstream failures and suppression of fabricated prose/URLs.
- Live Gemini test skipped because a real key and explicit opt-in were not yet available.
- All 21 imported candidates passed structural validation; none were automatically published.
- JavaScript syntax checks and Python dependency consistency checks passed.
- Bicep compiled with the official v0.49.2 compiler. The Azure CLI's initial compiler download had a certificate-chain error; the official GitHub release was downloaded over verified TLS instead. Certificate verification was not disabled.
- Local API `/api/ready` returned ready; real search returned an empty list while all candidates remained pending.
- Manual browser inspection was attempted but the browser-access host was unavailable. **No redesigned browser end-to-end coverage or visual verification is claimed.**

## Cloud state and remaining work

GitHub CLI/SSH authentication and Azure subscription access are verified. GitHub Actions is enabled; the first redesign CI run passed: https://github.com/josephzhangie0421/berkeley-navigator/actions/runs/45106307691 . The development environment exists with `DEPLOY_ENABLED=false`. Supabase initially listed no projects. Azure initially listed no resources. The local application and tests use actual local PostgreSQL, not a SQLite/PGlite or in-memory substitute.

Supabase project/credentials, real Gemini access, Azure resource creation approval and deployment approval are pending. No successful cloud migration, Gemini live result, Azure resource creation or deployment is claimed here. Publication also requires human academic review; students see no imported records until that occurs.

MVP limitations: conservative server-rendered answers instead of unrestricted generated prose; no grade/consent verification or automatic historical-course equivalence; no degree-audit implementation; no live seats/schedules; no distributed public abuse limiter; human review is a trusted operator CLI rather than an admin web app. These boundaries preserve accuracy and keep the implementation small.

## Local demo follow-up — real services verified

- Supabase PostgreSQL 17.12 connection verified with TLS; `001_catalog.sql` applied, checksum verified, and re-run confirmed idempotent.
- All 21 imported candidates staged in the real Supabase development database. No academic candidates automatically approved or published.
- Local student frontend: http://localhost:8080 ; FastAPI: http://localhost:8000 ; read-only academic review desk: http://localhost:8081 .
- Added `scripts/review_report.py` and a read-only review page with source excerpts, nested logic, editable JSON downloads and an explicit human approval-command workflow. No HTTP publication endpoint was added.
- Real `gemini-3.5-flash-lite` native function calling verified; defaults updated after `gemini-2.5-flash-lite` generation returned HTTP 404.
- **69 tests passed, no skips**, with real Supabase integration, live Gemini smoke and the new HTTP end-to-end test enabled. The latter starts a real loopback FastAPI server and validates code/title/topic search, evidence attribution, all three prerequisite outcomes, and real multi-turn Gemini tool execution after a profile change. A fallback response fails the live test.
- Positive end-to-end tests use explicitly synthetic records in disposable test schemas; they do not approve the 21 academic candidates or verify their academic truth. Citation checks verify attribution, not the reachability of synthetic fixture URLs.
- The main demo correctly hides pending records and returns an explicit no-approved-information response. Populated student results require a human to review and approve records using the review desk/CLI.
- Both static pages and `/api/health` and `/api/ready` returned HTTP 200. Computer Use could inventory Chrome but native control reported missing permission; the browser-access host also remained unavailable. **No browser interaction/visual verification is claimed.**
- No Azure resources created and no deployment performed. See [local demo workflow](local-demo.md).
