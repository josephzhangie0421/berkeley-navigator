# Redesign architecture

## Boundaries

```text
Browser ES Modules (in-memory profile/history)
    -> FastAPI/Pydantic
       -> SQL Catalog repository -> PostgreSQL published views / FTS
       -> ToolRunner -> deterministic prerequisite evaluator
       -> Gemini SDK -> function-call proposals -> ToolRunner

Official pages -> collector -> validated candidate JSON -> human review
    -> publication transaction -> immutable course/requirement/evidence versions
```

There is no LLM database connection, arbitrary SQL tool, write tool, permanent profile table, vector index, or external agent framework. The backend API never exposes ingestion or publication. Gemini receives the user's bounded conversation and retrieved evidence; the completed-course profile is held by the server's per-request tool runner and is not supplied as a mutable model argument.

## Data model

`departments` and `courses` are stable identities; arbitrary Berkeley subject codes are supported. `course_versions` contains catalog year, revision, text metadata, status and review/publication timestamps. `course_aliases` are version-scoped; historical aliases are not silently treated as universal academic equivalence. `requirement_versions` stores exact source text and a validated nested expression. Recommendations and credit restrictions are not prerequisites.

`evidence` is a source snapshot with official HTTPS URL, title, original text, collection time, content hash and verification status. Course metadata and requirement rules each explicitly reference evidence. Publication can share a source snapshot; published snapshots and linked requirements/aliases cannot be changed or deleted. Changes become new revisions. An identity trigger also protects published course codes/departments.

`ingestion_candidates` holds validated proposals, content hashes, review state and the published-version reference. It is not available to the runtime reader. Future program/degree requirements can use a separate program/version relation with the same expression grammar; no degree facts are implied by the MVP schema.

`published_courses` chooses the newest published revision *within each catalog year*. A newer pending candidate never hides the published version. Additional published views restrict evidence, aliases and requirements. The backend role is granted only these views. Supabase's Data API should not expose the `navigator` schema; browser clients never receive database credentials or a service-role key.

## Retrieval and evaluation

Exact normalized code and version-scoped alias lookup uses parameterized SQL. Search combines exact code/title matches with `websearch_to_tsquery`, a weighted generated `tsvector`, a GIN index and `ts_rank_cd`. Nothing loads the entire catalog into the application to score it. The repository is independent of Gemini.

Expression nodes are `all`, `any`, `course`, `unknown`, or explicitly evidenced `none`. Empty Boolean groups, unknown properties and excessive nesting are rejected. Unknown is three-valued logic: false dominates AND, true dominates OR; otherwise insufficient information propagates. Explanations retain child results. Legacy grade predicates become explicit unknown nodes, never silently ignored. Partial, raw-only and absent-field legacy records are converted to unknown for review.

Completion codes are normalized syntactically. Former names/cross-listings are searchable aliases, but the evaluator does not automatically grant course equivalence. A reviewer can encode supported alternatives as OR rules. This conservative behavior avoids false satisfaction.

## Gemini contract

The official `google-genai` SDK receives four function declarations from Pydantic JSON schemas. Automatic function execution is disabled. FastAPI's orchestrator validates every call, locks catalog year and profile to the request, enforces total call and model-round caps, and returns function results with call IDs. It preserves the original model content/parts, including thought signatures, for subsequent rounds.

The final student answer is assembled by the backend from returned course/evidence objects and deterministic checks. Arbitrary generated prose and URLs are not displayed. This limits conversational fluency but provides a verifiable boundary against invented academic facts and overridden outcomes. Missing evidence, malformed calls, rate limits, timeouts and model failure return explicit limitations plus real SQL fallback results when available.

Default model: `gemini-2.5-flash-lite`, listed with free-tier text input/output pricing in Google's pricing documentation checked on 2026-11-22. Availability and quota are account-specific; `GEMINI_MODEL` is configurable and a live function-call test verifies the account's access. Pricing source: https://ai.google.dev/gemini-api/docs/pricing . SDK function-call source: https://googleapis.github.io/python-genai/ .

## Privacy and operations

Profile/chat history lives in JS memory and bounded request bodies. Reload/clear removes it. API responses are `no-store`; there are no cookies or student database writes. The application does not log prompt bodies or upstream exception strings. Student-entered conversation can still contain personal information sent to Gemini; Gemini provider retention/training policy is separate from this application's storage behavior.

Settings are backend environment variables. Local secrets use an ignored mode-0600 `.env`; production uses Azure application settings. CORS lists exact frontend origins. The frontend uses `textContent`/DOM construction for untrusted content and validates source hosts before rendering links. Request body, history, tool count, output and database query execution have bounds. Public-service abuse throttling across multiple instances is not implemented; evaluate that before a broad public launch.

## Deployment

Azure Static Web Apps serves the frontend without a build framework. Linux App Service runs Python/Uvicorn; Supabase hosts PostgreSQL. GitHub Actions tests with PostgreSQL 17, and manually invoked deployment depends on a passing test job. App Service uses GitHub OIDC; Static Web Apps uses an environment-scoped deployment token. Migrations are a separately reviewed operator action, not an automatic production deployment side effect.
