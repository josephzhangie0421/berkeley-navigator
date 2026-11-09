#!/usr/bin/env node
/**
 * End-to-end check of the integrated system: browser-equivalent POST /api/chat
 * → Next.js server → KB POST /api/retrieve → answer generation.
 *
 * Requires both servers running (KB on :3001, web on :3000 in live mode).
 *   node scripts/e2e-chat.mjs                 # checks + summary
 *   node scripts/e2e-chat.mjs --transcript t.md
 *
 * Assertions only check facts that the KB itself states (fetched from the KB
 * API during the run), so they never hard-code course facts.
 */
import { writeFileSync } from "node:fs";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const KB = process.env.KB_URL ?? "http://localhost:3001";
const transcriptPath = process.argv.includes("--transcript") ? process.argv[process.argv.indexOf("--transcript") + 1] : null;

const results = [];
const transcript = [];

async function chat(question, profile, history = []) {
  const res = await fetch(`${WEB}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, profile, history }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body.answer;
}

async function kbCourse(id) {
  const res = await fetch(`${KB}/api/courses/${encodeURIComponent(id)}`);
  return res.ok ? res.json() : null;
}

const profile = (p = {}) => ({ academic_year: "", majors: [], completed_courses: [], interests: [], constraints: [], ...p });
const toTurns = (q, a) => [
  { role: "user", text: q },
  { role: "assistant", text: a.direct_answer, course_ids: a.course_options.map((c) => c.course_id) },
];

function record(name, question, prof, answer, checks) {
  const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
  results.push({ name, passed: failed.length === 0, failed, checks: checks.length });
  transcript.push({ name, question, prof, answer, checks });
}

function allClaims(a) {
  return [...a.official, ...a.student_insights, ...a.unverified];
}

function commonChecks(a) {
  const ids = new Set(a.sources.map((s) => s.id));
  return [
    ["provenance is real (not mock)", a.provenance === "evidence-only" || a.provenance === "llm"],
    ["every claim cites an existing source", allClaims(a).every((c) => c.source_ids.length && c.source_ids.every((id) => ids.has(id)))],
    ["all sources are http(s) and typed", a.sources.every((s) => /^https?:\/\//.test(s.url) && s.type !== undefined)],
    ["no eligibility / seat claims", !/you are eligible|you can enroll|seats? (are )?available|open seats/i.test(JSON.stringify(a))],
    ["no derived overlap shown as Official", !a.official.some((c) => /eligibility check/.test(c.text))],
  ];
}

// 1. Prerequisites for CS 189
{
  const q = "What are the prerequisites for CS 189?";
  const p = profile({ academic_year: "Sophomore", majors: ["Data Science"], completed_courses: ["CS 61A", "CS 61B", "Math 53"] });
  const a = await chat(q, p);
  const kb = await kbCourse("COMPSCI 189");
  const prereq = kb.requirements.find((r) => r.requirement_kind === "prerequisite");
  record("1. Prerequisites for CS 189", q, p, a, [
    ...commonChecks(a),
    ["COMPSCI 189 is the first course option", a.course_options[0]?.course_id === "COMPSCI 189"],
    ["official prerequisite wording shown verbatim", a.official.some((c) => c.text.includes(prereq.raw_text))],
    ["CS 189 catalog page is cited", a.sources.some((s) => s.url === prereq.source.url)],
    ["profile overlap shown as non-official", a.provenance === "llm" || /not an eligibility check/.test(a.profile_explanation ?? "")],
  ]);
}

// 2. Compare CS 170 and CS 189
let compareAnswer;
const compareQ = "Compare CS 170 and CS 189.";
{
  const p = profile();
  const a = (compareAnswer = await chat(compareQ, p));
  const ids = a.course_options.map((c) => c.course_id);
  const [k170, k189] = await Promise.all([kbCourse("COMPSCI 170"), kbCourse("COMPSCI 189")]);
  const pre = (k) => k.requirements.find((r) => r.requirement_kind === "prerequisite").raw_text;
  record("2. Compare CS 170 and CS 189", compareQ, p, a, [
    ...commonChecks(a),
    ["both courses returned", ids.includes("COMPSCI 170") && ids.includes("COMPSCI 189")],
    ["no unrelated courses returned", ids.every((id) => id === "COMPSCI 170" || id === "COMPSCI 189")],
    ["both official prerequisite texts present", a.provenance === "llm" || (a.official.some((c) => c.text.includes(pre(k170))) && a.official.some((c) => c.text.includes(pre(k189))))],
  ]);
}

// 3. What to explore after CS 61B
{
  const q = "What should I explore after CS 61B?";
  const p = profile({ academic_year: "Sophomore", majors: ["Data Science"], completed_courses: ["CS 61A", "CS 61B"], interests: ["Machine Learning"] });
  const a = await chat(q, p);
  const ids = a.course_options.map((c) => c.course_id);
  record("3. What to explore after CS 61B", q, p, a, [
    ...commonChecks(a),
    ["completed courses are not suggested", !ids.includes("COMPSCI 61B") && !ids.includes("COMPSCI 61A")],
    ["each option has a matched reason", a.course_options.every((o) => (o.reason ?? "").length > 0)],
    ["eligibility caveat present", a.limitations.some((l) => /not an eligibility determination/.test(l))],
    ["stale-source warning surfaced when COMPSCI 162 returned", !ids.includes("COMPSCI 162") || a.limitations.some((l) => /COMPSCI 162: source .* may be outdated/.test(l))],
  ]);
}

// 4. HCI as a field of interest
{
  const q = "I'm interested in HCI as a field. What courses should I look at?";
  const p = profile({ academic_year: "Freshman", interests: ["HCI"] });
  const a = await chat(q, p);
  record("4. HCI as a field of interest", q, p, a, [
    ...commonChecks(a),
    ["no courses forced", a.course_options.length === 0],
    ["says nothing was found", /no matching|not (in|cover)|doesn't|does not|no course/i.test(a.direct_answer)],
    ["limitation names the missing interest", a.limitations.some((l) => /HCI/.test(l))],
  ]);
}

// 5. Course not in the database
{
  const q = "What are the prerequisites for CS 160?";
  const p = profile();
  const a = await chat(q, p);
  record("5. Course not in the database (CS 160)", q, p, a, [
    ...commonChecks(a),
    ["KB confirms CS 160 is absent", (await kbCourse("CS 160")) === null],
    ["no courses returned", a.course_options.length === 0],
    ["no official facts invented", a.official.length === 0],
    ["limitation says COMPSCI 160 is not in the KB", a.limitations.some((l) => /not in the knowledge base: COMPSCI 160/.test(l))],
  ]);
}

// 6. Follow-up that depends on the previous turn
{
  const q = "Which of them requires COMPSCI 70 or a probability course?";
  const p = profile();
  const history = toTurns(compareQ, compareAnswer);
  const a = await chat(q, p, history);
  const ids = a.course_options.map((c) => c.course_id);
  const k189 = await kbCourse("COMPSCI 189");
  record("6. Follow-up using previous context", q, p, a, [
    ...commonChecks(a),
    ["previous courses carried into retrieval", ids.includes("COMPSCI 170") && ids.includes("COMPSCI 189")],
    ["CS 189 prerequisite wording available", a.provenance === "llm" || a.official.some((c) => c.text.includes(k189.requirements[0].raw_text))],
  ]);
  transcript[transcript.length - 1].history = history;
}

for (const r of results) {
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.name} (${r.checks - r.failed.length}/${r.checks})${r.failed.length ? "  ✗ " + r.failed.join("; ") : ""}`);
}

if (transcriptPath) {
  const md = transcript
    .map(({ name, question, prof, answer: a, checks, history }) => {
      const lines = [`## ${name}`, "", `**Question:** ${question}`, ""];
      if (history) lines.push(`**Prior turn:** ${history[0].text} → courses ${history[1].course_ids.join(", ")}`, "");
      const p = Object.entries(prof).filter(([, v]) => (Array.isArray(v) ? v.length : v)).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(", ") : v}`);
      lines.push(`**Profile:** ${p.join("; ") || "(empty)"}`, "", `**Provenance:** ${a.provenance}`, "", `**Direct answer:** ${a.direct_answer}`, "");
      if (a.course_options.length) lines.push("**Courses:**", ...a.course_options.map((o) => `- ${o.course_id} — ${o.title} _(${o.reason ?? ""})_`), "");
      const n = (ids) => ids.map((id) => `[${a.sources.findIndex((s) => s.id === id) + 1}]`).join("");
      if (a.official.length) lines.push("**Official information:**", ...a.official.map((c) => `- ${c.text} ${n(c.source_ids)}`), "");
      if (a.unverified.length) lines.push("**Other retrieved information:**", ...a.unverified.map((c) => `- ${c.text} ${n(c.source_ids)}`), "");
      if (a.profile_explanation) lines.push("**How this fits your profile:**", ...a.profile_explanation.split("\n").map((l) => `- ${l}`), "");
      if (a.interpretation) lines.push(`**AI interpretation:** ${a.interpretation}`, "");
      lines.push("**Notes and limits:**", ...a.limitations.map((l) => `- ${l}`), "");
      if (a.sources.length) lines.push("**Sources:**", ...a.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url}) — ${s.type}, retrieved ${s.retrieved_at ?? "?"}${s.verification_status && s.verification_status !== "verified" ? `, ${s.verification_status}` : ""}`), "");
      if (a.suggested_questions.length) lines.push(`**Ask next:** ${a.suggested_questions.join(" · ")}`, "");
      lines.push("**Checks:**", ...checks.map(([l, ok]) => `- ${ok ? "✅" : "❌"} ${l}`), "");
      return lines.join("\n");
    })
    .join("\n---\n\n");
  writeFileSync(transcriptPath, `# End-to-end transcript (${new Date().toISOString()})\n\n${md}`);
  console.log(`Transcript written to ${transcriptPath}`);
}

process.exit(results.every((r) => r.passed) ? 0 : 1);
