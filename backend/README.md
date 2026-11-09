# Berkeley Navigator — Course Knowledge Base (MVP)

Data layer and retrieval API for the Berkeley Course Enrollment Copilot.
21 verified UC Berkeley CS / Data Science / Math / Stat courses, official prerequisite wording,
course relationships, and a REST API that returns **source-backed evidence** (not recommendations).

- No frontend, no AI agent, no enrollment predictions, no CalNet, no Degree Progress parsing.
- Every fact carries a source URL and retrieval timestamp.

## Quick start (no database install needed)

Requires Node.js ≥ 20.12.

```bash
npm install
npm run db:seed      # creates schema + loads seed into embedded PostgreSQL (PGlite, ./.pglite)
npm test             # 27 tests
npm run dev          # API on http://localhost:3001
```

Try it:

```bash
curl "http://localhost:3001/api/courses?query=probability"
curl "http://localhost:3001/api/courses/CS%20189"
curl "http://localhost:3001/api/courses/COMPSCI%2070/relations"
curl -X POST http://localhost:3001/api/retrieve -H 'Content-Type: application/json' -d '{
  "query": "What should I explore after CS 61B?",
  "student_profile": { "academic_year": "Sophomore", "majors": ["Data Science"],
                       "completed_courses": ["CS 61A", "CS 61B"], "interests": ["Machine Learning"] },
  "limit": 5 }'
```

## Using real PostgreSQL or Supabase

```bash
cp .env.example .env
# set DATABASE_URL=postgresql://user:pass@host:5432/dbname   (Supabase: Settings → Database → URI)
npm run db:reset     # drop + create tables, load seed
npm run dev
```

Or apply the schema manually: `psql "$DATABASE_URL" -f database/schema.sql`, then `npm run db:seed`.

Run tests against real Postgres: `TEST_DATABASE_URL=postgresql://... npx vitest run --no-file-parallelism`
(the tests drop and recreate tables in that database — use a throwaway one).

## Scripts

| Command | What it does |
|---|---|
| `npm run db:init` | Create tables if missing |
| `npm run db:seed` | Validate and (re)load `database/seed/*.json` |
| `npm run db:reset` | Drop tables, recreate, seed |
| `npm run dev` | Start API (`PORT`, default 3001) |
| `npm test` | Vitest suite (in-memory PGlite by default) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run collect:check` | Re-fetch every source URL and report whether stored wording still appears |

## Layout

```
database/
  schema.sql              PostgreSQL schema (migration 001)
  seed/sources.json       Official sources + verbatim excerpts + retrieval timestamps
  seed/courses.json       Courses, verbatim requirements, structured logic, relations
scripts/collect_courses/
  check_sources.ts        Re-verification script
  COLLECTION_LOG.md       How the data was collected, what failed, what was skipped
src/
  db/                     client (pg | PGlite), migrate, init, seed (with validation)
  lib/codes.ts            Course-code normalization ("cs 61b" → "COMPSCI 61B")
  repo.ts                 SQL queries
  retrieve.ts             /api/retrieve logic
  api/app.ts, server.ts   Express app
tests/                    Seed-quality and API tests
docs/
  data_dictionary.md  sources.md  api_contract.md  coverage_report.md
  examples/retrieve_sample_response.json
```

## Updating data

1. Check the course page on the official catalog.
2. Edit `database/seed/courses.json` (and `sources.json` with a new `retrieved_at`).
   Copy requirement wording exactly into `raw_text`; list only courses literally named in it.
3. `npm run db:seed` — the loader rejects relations not supported by the wording.
4. `npm test`, then update `docs/coverage_report.md`.

## Data rules

- Requirement text is verbatim; course summaries are paraphrased.
- Prerequisites are never inferred from course numbers or topic similarity.
- Recommended / preferred courses are stored as non-mandatory.
- Truncated or ambiguous catalog text is flagged (`parse_status`, `render_warning`) instead of guessed.
- No seat, schedule, or enrollment data is stored or claimed.

See `docs/coverage_report.md` for known limitations and `docs/api_contract.md` for frontend integration.
