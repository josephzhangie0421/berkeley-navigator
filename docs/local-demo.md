# Local Berkeley Navigator demo

The active demo uses the configured **real Supabase development database** and **real Gemini API**. Azure is not involved.

## Open the demo

- Student interface: http://localhost:8080
- FastAPI/OpenAPI: http://localhost:8000/docs
- Academic review desk: http://localhost:8081

The student interface supports search, course details, prerequisite checks, source citations and multi-turn chat. All 21 imported academic candidates start pending. A zero-result search before review is intentional; staging never makes academic facts student-visible.

## Review one record

1. Open the review desk and filter by a code/title. For example, candidate #6 is COMPSCI 170 in the initial import (always confirm the displayed ID/code).
2. Open its official source in another tab. Check the academic year, metadata, original requirement wording, aliases and nested logic. The legacy collection timestamp is not a fresh source verification. The imported year is an assumption requiring confirmation.
3. Keep unverified grades, consent, unclear grouping and unsupported conditions `unknown`. Do not replace an absent prerequisite field with `none` unless explicit official evidence supports that claim.
4. If corrections are required, download the candidate JSON, edit it locally, then run:

   ```sh
   .venv/bin/python scripts/manage.py validate PATH_TO_CORRECTED_JSON
   .venv/bin/python scripts/manage.py stage PATH_TO_CORRECTED_JSON
   .venv/bin/python scripts/review_report.py
   ```

   Review the newly staged ID. Reject the superseded pending record if appropriate:

   ```sh
   .venv/bin/python scripts/manage.py reject CANDIDATE_ID --reviewer 'YOUR NAME'
   ```

5. For a verified candidate, enter your reviewer name and tick all three verification checks. **Prepare approval command** displays the exact command; it does not execute it. Run that command yourself in the repository terminal only after review. The command publishes that one record transactionally and records reviewer/time.
6. Refresh the review snapshot with `.venv/bin/python scripts/review_report.py`. The student API immediately sees the published record; no backend restart is required. Search again in the student interface.

The review desk is a **read-only local snapshot**, not an admin write API. Neither the student backend nor the HTML page exposes publication credentials or an HTTP publication endpoint. Pending records stay out of student retrieval. The snapshot can become stale after decisions, so regenerate it before further review.

## Try the student flow after approval

- Search the approved course code, exact title, and a description topic.
- Enter completed courses separated by commas. Leave “complete course list” unchecked to see unknown outcomes for unreported courses.
- Click **Check my prerequisites**. Check the explanation tree against the reviewed source.
- Open the source links and expand the collected evidence.
- Ask about the approved course in chat. Then ask a follow-up without repeating its code. Update the profile and ask the same question again.
- Click **Clear this session** or reload. No profile/history is stored permanently.

Do not assume that ticking the complete-list box or satisfying course conditions guarantees enrollment. The evaluator does not verify grades, institutional equivalences, department consent, seats or schedules.

## Start/restart locally

Run these in three terminals from the repository root. Root `.env` contains private credentials; never serve the repository root over HTTP.

```sh
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --no-access-log
```

```sh
.venv/bin/python -m http.server 8080 --bind 127.0.0.1 --directory frontend
```

```sh
.venv/bin/python scripts/review_report.py
.venv/bin/python -m http.server 8081 --bind 127.0.0.1 --directory .local/review
```

Stop each with Ctrl+C. If an earlier process owns a port, inspect it before stopping it; do not kill unrelated services. Restart FastAPI after changing `.env`.

## Real-service end-to-end verification

`backend/tests/test_live_demo.py` runs an actual loopback HTTP FastAPI server, real Supabase SQL and real Gemini calls. It verifies code/title/topic search, source-to-fact attribution, satisfied/not-satisfied/unknown outcomes, and multi-turn profile updates. It requires `mode=gemini`; fallback is a test failure.

The test uses explicitly synthetic fixture data in a random `test_<uuid>` schema, then removes that schema and stops its temporary server. **It never publishes any of the 21 academic candidates.** Passing this test validates the application path, not the academic accuracy of pending records or the reachability of synthetic citation URLs.

Configure `TEST_DATABASE_URL` privately for the development database and run:

```sh
RUN_LIVE_DEMO=1 .venv/bin/python -m pytest backend/tests/test_live_demo.py -q --tb=no --show-capture=no
```

The initially configured model `gemini-2.5-flash-lite` returned 404 during live verification. `gemini-3.5-flash-lite` passed native function calling and is now the default. Keys remain backend-only.

Browser automation is separate from this HTTP end-to-end test. The current computer-use environment reported an unavailable browser-access host and missing native Computer Use permission, so automated browser interaction/visual coverage is not claimed.
