// Source re-verification script.
//
// For every source in database/seed/sources.json:
//   1. fetch the URL (one request per source, 2s apart, identifying User-Agent),
//   2. save a raw snapshot to scripts/collect_courses/snapshots/<source_key>.html,
//   3. check whether each verbatim requirement segment stored in courses.json
//      still appears in the page text, and report FOUND / NOT_FOUND / FETCH_FAILED.
//
// It never writes to the database or seed files: a human reviews the report and
// edits database/seed/*.json, then re-runs `npm run db:seed`.
//
// Note: the current UC Berkeley catalog (undergraduate.catalog.berkeley.edu) renders
// requirement blocks client-side, so NOT_FOUND on a static fetch may mean "rendered by
// JavaScript", not "changed". Open the page in a browser before editing seed data.
//
// Usage: npm run collect:check            (all sources)
//        npm run collect:check -- cat-compsci-189 cat-math-54
import fs from 'node:fs';
import path from 'node:path';
import { loadSeed, SEED_DIR } from '../../src/db/seed.js';

const SNAPSHOT_DIR = path.join(path.dirname(SEED_DIR), '..', 'scripts', 'collect_courses', 'snapshots');
const UA = process.env.COLLECT_USER_AGENT ?? 'BerkeleyNavigator-KB-checker/0.1 (course data verification; contact via project README)';
const DELAY_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pageText = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

async function main() {
  const { sources, courses } = loadSeed();
  const only = process.argv.slice(2);
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const report: Record<string, unknown>[] = [];

  for (const s of sources) {
    if (only.length && !only.includes(s.source_key)) continue;
    if (!s.url) continue;
    const segments = courses
      .filter((c) => c.source_key === s.source_key)
      .flatMap((c) => c.requirements.filter((r) => r.parse_status !== 'none').flatMap((r) => r.raw_text.split(' | ')))
      .map((t) => t.trim())
      .filter(Boolean);

    let status = 'FETCH_FAILED';
    let detail = '';
    const checks: { segment: string; found: boolean }[] = [];
    try {
      const res = await fetch(s.url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      detail = `HTTP ${res.status}`;
      if (res.ok) {
        const html = await res.text();
        fs.writeFileSync(path.join(SNAPSHOT_DIR, `${s.source_key}.html`), html);
        const text = pageText(html);
        for (const seg of segments) checks.push({ segment: seg, found: text.includes(seg) });
        status = checks.every((c) => c.found) ? 'FOUND' : 'NOT_FOUND';
      }
    } catch (e) {
      detail = (e as Error).message;
    }
    report.push({ source_key: s.source_key, url: s.url, status, detail, checked_at: new Date().toISOString(), checks });
    console.log(`${status.padEnd(12)} ${s.source_key} ${detail}`);
    await sleep(DELAY_MS);
  }

  const out = path.join(SNAPSHOT_DIR, 'report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${path.relative(process.cwd(), out)}`);
}

await main();
