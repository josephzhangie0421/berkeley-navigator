# Berkeley Navigator

An evidence-first course explorer for UC Berkeley. The active MVP uses vanilla HTML/CSS/ES Modules, Python FastAPI/Pydantic, PostgreSQL SQL + full-text search, and native Gemini Function Calling through Google's Python SDK. No Node backend, agent framework, or vector database is used.

The previous Next.js/Express implementation, its original data and tests are preserved in `legacy/`. It is not part of the active application or deployment.

## What works

- Exact code/alias, title, and topic search over reviewed, published catalog versions.
- Course cards, original requirement text, official source links and evidence timestamps.
- Independent AND/OR/nested prerequisite evaluation with `satisfied`, `not_satisfied`, and `unknown` outcomes and explanations.
- Session-only profile and multi-turn conversation; nothing is saved in localStorage, cookies, or a student database.
- Gemini's four read-only tools: `get_course`, `search_courses`, `check_prerequisites`, `get_evidence`.
- Bounded native tool calling, validated arguments, timeouts, and real SQL fallback when Gemini is unavailable.
- Staging, review and explicit transactional publication; immutable published versions and source evidence.

**Data status:** the 21 preserved course records are validated *candidates*, not automatically approved facts. The catalog is intentionally empty until a human reviews and publishes records. The `2026-2027` candidate year is an import assumption requiring review. Synthetic records are used only in isolated tests. No live seats, enrollment guarantees, grade inference, or degree audit is implemented.

## Interactive local demo

Open http://localhost:8080 for the student app and http://localhost:8081 for the read-only academic review desk once the servers are running. See [the local demo and approval workflow](docs/local-demo.md). All 21 candidates remain pending until explicit human approval.

## Local setup

Python 3.14 and PostgreSQL 17 were used for validation. Use a dedicated local/development database. Cloud credentials are optional for starting the server, but PostgreSQL is required for course retrieval.

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.lock
.venv/bin/python scripts/configure_local.py
```

The configuration helper prompts privately for a PostgreSQL URI and Gemini API key, writes root `.env` with mode `0600`, and refuses to overwrite an existing file. Do not paste secrets into chat or put them in shell command arguments. `.env.example` documents every setting. The backend reads root `.env`; run commands from the repository root.

For a local PostgreSQL instance, use an existing database or initialize an isolated project cluster (Homebrew paths on macOS):

```sh
/opt/homebrew/opt/postgresql@17/bin/initdb -D .local/pgdata --auth=trust --encoding=UTF8 --no-locale
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D .local/pgdata -l .local/postgres.log -o '-h 127.0.0.1 -p 55432 -k /tmp' start
```

Trust authentication here is for a loopback-only disposable local cluster. Never use it for cloud/production. The local URI is `postgresql://YOUR_LOCAL_USER@127.0.0.1:55432/postgres`. To stop it: `pg_ctl -D .local/pgdata stop` using the same binary directory.

```sh
.venv/bin/python scripts/manage.py migrate
.venv/bin/python scripts/manage.py validate database/seeds/candidates.json
.venv/bin/python scripts/manage.py stage database/seeds/candidates.json
.venv/bin/python scripts/manage.py status
```

Migrations are checksum-checked and transactional in the dedicated `navigator` schema; they do not reset the old schema. Stage is idempotent by content hash. Migrations use `MIGRATION_DATABASE_URL` when configured, otherwise `DATABASE_URL`.

Run in two terminals:

```sh
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --no-access-log
```

```sh
.venv/bin/python -m http.server 8080 --bind 127.0.0.1 --directory frontend
```

Open http://localhost:8080. FastAPI's API documentation is at http://localhost:8000/docs. `frontend/js/config.js` contains the public backend origin only. Never put a key or database URL there.

## Review and publish

```sh
.venv/bin/python scripts/manage.py review 1
```

A human must check the official source, source timestamp, catalog year, course metadata, aliases, original wording, AND/OR grouping, and unsupported grade/consent/concurrency conditions. Do not approve all imported records just because the old source said “verified.” Partial/truncated evidence cannot establish a complete prerequisite rule.

Export a candidate with `scripts/manage.py export 1 .local/candidate.json`. If corrections are needed, edit that JSON file and stage it as a new candidate. Reject an obsolete pending candidate with `scripts/manage.py reject 1 --reviewer 'YOUR NAME'`. The old candidate is retained. To collect changed official source text from one candidate:

```sh
.venv/bin/python scripts/collect.py candidate.json updated-candidate.json
.venv/bin/python scripts/manage.py validate updated-candidate.json
.venv/bin/python scripts/manage.py stage updated-candidate.json
```

Collection checks official HTTPS destinations and follows at most five redirects. It invalidates existing logic on any text change, preserves metadata as review candidates, and never publishes. Client-rendered catalog pages may need manual browser collection; do not infer “no prerequisites” from an empty scrape.

After review only:

```sh
.venv/bin/python scripts/manage.py publish 1 --reviewer 'YOUR NAME' --confirm-course 'COMPSCI 61A'
```

Use the actual candidate ID/code. Publication records the reviewer and time, verifies its evidence status, creates a new revision, and preserves old published versions. Unknown nodes are valid published information when the reviewer confirms that the source does not support a determination. `none` is reserved for explicitly evidenced absence of prerequisites.

## Tests

```sh
.venv/bin/python -m pytest -q
```

Set `TEST_DATABASE_URL` privately in `.env` to a dedicated test/development PostgreSQL database to run integration tests. Tests create randomly named `test_...` schemas and drop those schemas afterwards. Never point tests at production. CI always starts PostgreSQL 17 and runs integration tests; missing PostgreSQL is reported as a skip locally, never as mocked SQL coverage.

Live Gemini testing requires a real key and explicit opt-in:

```sh
RUN_LIVE_GEMINI=1 .venv/bin/python -m pytest backend/tests/test_gemini.py::test_live_gemini -q
```

Routine Gemini orchestration tests use deterministic SDK response objects. Live integration supplements those tests, not replaces them. No browser end-to-end test is claimed for the redesigned frontend.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Process/configuration status, no secrets |
| `GET /api/ready` | Actual database query |
| `GET /api/courses?query=...&catalog_year=2026-2027` | Code/title/FTS search |
| `GET /api/courses/{code}?catalog_year=...` | Published course detail |
| `GET /api/evidence/{id}?catalog_year=...` | Evidence linked to a published fact |
| `POST /api/prerequisites/check` | Code, catalog year, temporary profile |
| `POST /api/chat` | Message, catalog year, temporary profile, bounded history |

The student can mark their course list complete. Otherwise unlisted courses yield `unknown`, not `not_satisfied`. Any explicit false branch makes AND false; any true branch makes OR true. Consent, grades and other unsupported facts are unknown. An absent rule is always unknown.

## Cloud setup and delivery

See [cloud setup](docs/cloud-setup.md), [architecture](docs/architecture.md), and [implementation report](docs/implementation-report.md).

GitHub Actions runs tests on pushes/PRs. Azure deployment is manual, runs CI first, and requires an environment variable `DEPLOY_ENABLED=true` plus configured credentials. Keep that variable unset until resource and deployment approval. There is no auto-deployment to production and no auto-publication of academic records.
