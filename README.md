# Berkeley Navigator

A course exploration copilot prototype for UC Berkeley undergraduates. A student enters a short academic
profile, asks a course question in a chat, and gets an answer built only from retrieved Berkeley course
information, with source links and clear statements of what is not known.

**Independent student project. Not affiliated with or endorsed by UC Berkeley.**

Status: v0.1 MVP for moderated user testing. Not a production deployment.

## What it does

- Editable student profile (year, majors, completed courses, interests, constraints), stored only in the browser.
- Multi-turn chat with starter questions, follow-ups, loading and error states.
- Answers grounded in a verified knowledge base of 21 CS / Data Science / Math / Stat courses:
  official prerequisite wording kept verbatim, every fact linked to its catalog source with a retrieval date.
- Separates official information, computed profile overlap, and AI interpretation; never claims eligibility,
  seat availability, or enrollment probability.
- Says so when the knowledge base has no evidence (unknown course, uncovered topic such as HCI).
- Per-message feedback (kept in the page only).

Out of scope for v0.1: CalNet login, Degree Progress parsing, four-year planner, enrollment prediction,
live seat data, Gmail/advisor connectors, university-wide coverage.

## Repository layout

```
berkeley-navigator/
├── backend/    Course knowledge base + retrieval API (TypeScript, Express, PostgreSQL/PGlite)
│   ├── database/        schema.sql, seed/courses.json, seed/sources.json
│   ├── src/             db/, repo.ts, retrieve.ts, api/
│   ├── tests/           Vitest: seed quality + API
│   └── docs/            api_contract.md, data_dictionary.md, sources.md, coverage_report.md
├── frontend/   Chat UI + answer generation (Next.js 16, React 19, Tailwind 4)
│   ├── src/app/api/chat/route.ts         server: retrieval → generation
│   ├── src/lib/api/                      typed retrieval client + response normalizer
│   ├── src/lib/server/generation/        llm.ts, evidenceOnly.ts, validate.ts, grounding.ts
│   ├── tests/                            Vitest: contract, grounding, generation (real KB fixtures)
│   └── scripts/e2e-chat.mjs              end-to-end scenario check against running servers
└── docs/       Integration report and end-to-end transcript
```

## Architecture

```
Browser (Chat UI)
   │  POST /api/chat  { question, profile, history }
   ▼
frontend — Next.js server route (keys stay server-side)
   │ 1. build retrieval query (adds previous-turn courses for follow-ups)
   │ 2. POST {RETRIEVAL_API_BASE_URL}/api/retrieve  ───────────►  backend — Express
   │                                                               ranks courses with documented signals,
   │ 3. normalize evidence: facts F1…Fn, sources S1…Sn  ◄────────  returns facts + sources + limitations
   │ 4. generate answer
   │      • ANTHROPIC_API_KEY set → LLM answer; every claim must cite fact ids and pass grounding checks
   │      • no key / LLM error    → evidence-only: retrieved facts shown as-is, no AI text
   ▼
Structured Answer → UI (Official / profile overlap / AI interpretation tiers, numbered citations, notes)
```

Retrieval, answer generation, and UI are separate modules. `/api/retrieve` returns evidence, not advice.

## Local development

Requirements: Node.js ≥ 20.12 (tested on 22.x). No database install needed; the backend uses embedded
PGlite by default.

### 1. Backend (terminal 1)

```bash
cd backend
npm ci
cp .env.example .env        # defaults: PGlite in ./.pglite, PORT=3001
npm run db:seed             # create schema + load 21 courses
npm run dev                 # http://localhost:3001  (check: curl localhost:3001/api/health)
```

### 2. Frontend (terminal 2)

```bash
cd frontend
npm ci
cp .env.example .env.local
# edit .env.local:
#   NEXT_PUBLIC_DATA_MODE=live
#   RETRIEVAL_API_BASE_URL=http://localhost:3001
#   ANTHROPIC_API_KEY=            # optional; leave empty for evidence-only mode
npm run dev                 # http://localhost:3000
```

`NEXT_PUBLIC_DATA_MODE` is read at build time: restart `npm run dev` (or rebuild) after changing it.
With `NEXT_PUBLIC_DATA_MODE=mock` (the default) the UI uses simulated answers, shows a "Mock mode"
banner, and needs no backend.

### 3. Check that they work together

With both servers running:

```bash
cd frontend
node scripts/e2e-chat.mjs                      # 6 scenarios, PASS/FAIL per scenario
node scripts/e2e-chat.mjs --transcript out.md  # also write a readable transcript
```

### Tests and checks

| Where | Command | What |
|---|---|---|
| backend | `npm test` | Seed-quality and API tests (in-memory PGlite) |
| backend | `npm run typecheck` | `tsc --noEmit` |
| frontend | `npm test` | Contract normalization, grounding validation, generation fallbacks |
| frontend | `npm run lint` / `npm run typecheck` / `npm run build` | — |
| frontend | `npm run check` | lint + typecheck + test + build |

## Environment variables

| Project | Variable | Required | Notes |
|---|---|---|---|
| backend | `DATABASE_URL` | no | Postgres URL; empty = embedded PGlite |
| backend | `PGLITE_DATA_DIR` | no | default `./.pglite` |
| backend | `PORT` | no | default 3001 |
| backend | `ALLOWED_ORIGIN` | no | CORS origin (the frontend calls the backend server-to-server, so CORS is not needed locally) |
| frontend | `NEXT_PUBLIC_DATA_MODE` | no | `mock` (default) or `live` |
| frontend | `RETRIEVAL_API_BASE_URL` | live mode | e.g. `http://localhost:3001` |
| frontend | `RETRIEVAL_API_KEY` | no | bearer token if the backend requires one |
| frontend | `ANTHROPIC_API_KEY` | no | enables LLM answers; server-side only |
| frontend | `LLM_MODEL` | no | default `claude-sonnet-5-5` |

Never commit `.env`, `.env.local`, or any real key. Only `.env.example` files are tracked.

## Data and safety rules

- Requirement text is verbatim from the official catalog; course summaries are paraphrased and labeled.
- Prerequisites are never inferred. Truncated or uncertain catalog text is flagged, not guessed.
- Profile overlap is a computed comparison, never an eligibility decision.
- No seat, schedule, instructor, or enrollment data is stored or implied.
- No research data (interviews, user testing records) belongs in this repository.

See `backend/docs/coverage_report.md` for known data gaps and `docs/integration-sprint-1.md` for the
integration report.

## Project docs

- `backend/README.md` — knowledge base details, data update workflow
- `backend/docs/api_contract.md` — retrieval API contract
- `frontend/README.md` — UI details (written in Chinese)
