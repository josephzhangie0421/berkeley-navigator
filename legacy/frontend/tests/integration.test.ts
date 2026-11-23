/**
 * Integration tests for the KB → frontend contract and grounded generation.
 * Fixtures in tests/fixtures/kb_*.json are real responses captured from
 * berkeley-navigator-kb POST /api/retrieve (2026-11-09 seed).
 */
import { describe, expect, it } from "vitest";
import { normalizeRetrieveResponse } from "@/lib/api/normalize";
import { buildEvidenceOnlyAnswer } from "@/lib/server/generation/evidenceOnly";
import { createAnthropicGenerator } from "@/lib/server/generation/llm";
import { validateModelAnswer } from "@/lib/server/generation/validate";
import { buildRetrievalQuery } from "@/lib/server/retrievalQuery";
import type { RetrieveResponse } from "@/lib/types/course";
import { EMPTY_PROFILE } from "@/lib/types/profile";
import cs189 from "./fixtures/kb_cs189_prereq.json";
import compare from "./fixtures/kb_compare_170_189.json";
import hci from "./fixtures/kb_hci_empty.json";
import weak from "./fixtures/kb_weak_design.json";

const ev = (raw: unknown) => normalizeRetrieveResponse(raw as RetrieveResponse);
const input = (raw: unknown, question = "q") => ({ question, profile: EMPTY_PROFILE, history: [], evidence: ev(raw) });
const CS189_PREREQ = "MATH 53 and MATH 54; and COMPSCI 70 or consent of instructor.";

describe("normalizeRetrieveResponse with the real KB shape", () => {
  it("keeps every backend fact and links it to its source by URL", () => {
    const e = ev(cs189);
    const rawFactCount = (cs189 as RetrieveResponse).results.reduce((n, r) => n + (r.facts?.length ?? 0), 0);
    expect(e.courses.flatMap((c) => c.facts)).toHaveLength(rawFactCount);
    const c189 = e.courses[0];
    expect(c189.course_id).toBe("COMPSCI 189");
    const prereq = c189.facts.find((f) => f.label?.startsWith("Prerequisite"))!;
    expect(prereq.value).toBe(CS189_PREREQ);
    expect(prereq.verbatim).toBe(true);
    expect(prereq.text).toContain(`“${CS189_PREREQ}”`);
    const src = e.sources.find((s) => s.id === prereq.source_ids[0])!;
    expect(src.url).toBe("https://undergraduate.catalog.berkeley.edu/courses/1042881");
    expect(src.type).toBe("official");
    expect(src.verification_status).toBe("verified");
  });

  it("preserves derived flags and stale-source status", () => {
    const e = ev(cs189);
    const overlap = e.courses[0].facts.find((f) => f.derived)!;
    expect(overlap.label).toMatch(/not an eligibility check/);
    expect(e.sources.some((s) => s.verification_status === "verified_possibly_stale")).toBe(true);
  });

  it("gives facts unique evidence-wide ids", () => {
    const ids = ev(cs189).courses.flatMap((c) => c.facts.map((f) => f.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("evidence-only answers", () => {
  it("shows official wording verbatim and keeps derived overlap out of Official", () => {
    const a = buildEvidenceOnlyAnswer(input(cs189));
    expect(a.provenance).toBe("evidence-only");
    expect(a.official.some((c) => c.text.includes(CS189_PREREQ))).toBe(true);
    expect(a.official.some((c) => /eligibility check/.test(c.text))).toBe(false);
    expect(a.profile_explanation).toMatch(/not an eligibility check/);
    for (const c of a.official) expect(c.source_ids.length).toBeGreaterThan(0);
    expect(a.sources.length).toBeGreaterThan(0);
  });

  it("says nothing was found instead of inventing results", () => {
    const a = buildEvidenceOnlyAnswer(input(hci));
    expect(a.course_options).toEqual([]);
    expect(a.official).toEqual([]);
    expect(a.direct_answer).toMatch(/No matching course information/);
    expect(a.limitations.join(" ")).toMatch(/stated interests .*HCI/);
  });

  it("does not present weak keyword matches as relevant", () => {
    const a = buildEvidenceOnlyAnswer(input(weak));
    expect(a.direct_answer).toMatch(/No course clearly matched/);
    for (const o of a.course_options) expect(o.reason).toMatch(/^Weak match/);
    expect(a.suggested_questions).toEqual([]);
  });
});

describe("validateModelAnswer grounding", () => {
  const e = ev(compare);
  const f = (course: string, label: string) =>
    e.courses.find((c) => c.course_id === course)!.facts.find((x) => x.label?.startsWith(label))!;
  const p189 = f("COMPSCI 189", "Prerequisite");
  const p170 = f("COMPSCI 170", "Prerequisite");
  const u189 = f("COMPSCI 189", "Units");
  const base = { direct_answer: "Here is what the catalog says.", course_options: [] };

  it("keeps a claim supported by the cited fact and derives its source", () => {
    const a = validateModelAnswer(
      { ...base, official: [{ text: `COMPSCI 189 requires "${CS189_PREREQ}"`, fact_ids: [p189.id] }] },
      e,
    );
    expect(a.official).toHaveLength(1);
    expect(a.official[0].source_ids).toEqual(p189.source_ids);
    expect(a.official[0].fact_ids).toEqual([p189.id]);
  });

  it("rejects a claim that cites a real source but the wrong fact", () => {
    // Cites the CS 170 prerequisite fact for a statement about CS 189's requirements.
    const a = validateModelAnswer(
      { ...base, official: [{ text: "CS 189 requires MATH 53 and MATH 54.", fact_ids: [p170.id] }] },
      e,
    );
    expect(a.official).toHaveLength(0);
    expect(a.limitations.join(" ")).toMatch(/1 statement was removed/);
  });

  it("rejects claims that only give source ids (no fact ids)", () => {
    const a = validateModelAnswer({ ...base, official: [{ text: "CS 189 is 4 units.", source_ids: [u189.source_ids[0]] }] }, e);
    expect(a.official).toHaveLength(0);
  });

  it("rejects a number that the cited fact does not contain", () => {
    const ok = validateModelAnswer({ ...base, official: [{ text: "CS 189 is 4 units.", fact_ids: [u189.id] }] }, e);
    expect(ok.official).toHaveLength(1);
    const bad = validateModelAnswer({ ...base, official: [{ text: "CS 189 is 3 units.", fact_ids: [u189.id] }] }, e);
    expect(bad.official).toHaveLength(0);
  });

  it("rejects altered 'quotes' of official wording", () => {
    const a = validateModelAnswer(
      { ...base, official: [{ text: 'CS 189 requires "MATH 53 or MATH 54; and COMPSCI 70"', fact_ids: [p189.id] }] },
      e,
    );
    expect(a.official).toHaveLength(0);
  });

  it("rejects eligibility and seat claims", () => {
    const a = validateModelAnswer(
      {
        ...base,
        direct_answer: "You are eligible for CS 189. It covers machine learning.",
        official: [{ text: "COMPSCI 189 has open seats.", fact_ids: [p189.id] }],
      },
      e,
    );
    expect(a.official).toHaveLength(0);
    expect(a.direct_answer).toBe("It covers machine learning.");
  });

  it("removes free-text sentences that name courses absent from evidence and conversation", () => {
    const a = validateModelAnswer(
      { ...base, direct_answer: "Both are upper-division. You might also like CS 160.", interpretation: "CS 170 is theory-heavy." },
      e,
      { question: "Compare CS 170 and CS 189" },
    );
    expect(a.direct_answer).toBe("Both are upper-division.");
    expect(a.interpretation).toBe("CS 170 is theory-heavy.");
    expect(a.limitations.join(" ")).toMatch(/removed from the AI text/);
  });

  it("allows mentioning an unknown course that the student asked about", () => {
    const a = validateModelAnswer(
      { ...base, direct_answer: "CS 160 is not in the knowledge base, so I can't describe it." },
      e,
      { question: "What about CS 160?" },
    );
    expect(a.direct_answer).toMatch(/CS 160 is not in the knowledge base/);
  });

  it("does not let derived overlap facts appear as official information", () => {
    const e2 = ev(cs189);
    const overlap = e2.courses[0].facts.find((x) => x.derived)!;
    const a = validateModelAnswer({ ...base, official: [{ text: overlap.value, fact_ids: [overlap.id] }] }, e2);
    expect(a.official).toHaveLength(0);
  });

  it("restricts course options to retrieved courses", () => {
    const a = validateModelAnswer(
      { ...base, course_options: [{ course_id: "COMPSCI 170" }, { course_id: "COMPSCI 160" }] },
      e,
    );
    expect(a.course_options.map((o) => o.course_id)).toEqual(["COMPSCI 170"]);
  });
});

describe("LLM generator (fake HTTP)", () => {
  const reply = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("returns a validated llm answer", async () => {
    const e = ev(compare);
    const p189 = e.courses[1].facts.find((x) => x.label?.startsWith("Prerequisite"))!;
    const model = {
      direct_answer: "CS 189 lists math prerequisites.",
      course_options: [{ course_id: "COMPSCI 189", reason: "Asked about." }],
      official: [{ text: `COMPSCI 189: "${CS189_PREREQ}"`, fact_ids: [p189.id] }],
      student_insights: [],
      unverified: [],
      limitations: [],
      suggested_questions: [],
    };
    const gen = createAnthropicGenerator({
      apiKey: "test",
      model: "test",
      fetchImpl: reply({ content: [{ type: "text", text: JSON.stringify(model) }] }),
    });
    const a = await gen.generate({ question: "Compare CS 170 and CS 189", profile: EMPTY_PROFILE, history: [], evidence: e });
    expect(a.provenance).toBe("llm");
    expect(a.official).toHaveLength(1);
  });

  it("falls back to evidence-only when the API fails", async () => {
    const gen = createAnthropicGenerator({ apiKey: "test", model: "test", fetchImpl: reply({ error: "x" }, 500) });
    const a = await gen.generate(input(compare));
    expect(a.provenance).toBe("evidence-only");
    expect(a.limitations.join(" ")).toMatch(/AI answer could not be generated/);
  });

  it("does not call the model when nothing was retrieved", async () => {
    let called = false;
    const gen = createAnthropicGenerator({
      apiKey: "test",
      model: "test",
      fetchImpl: (async () => {
        called = true;
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    const a = await gen.generate(input(hci));
    expect(called).toBe(false);
    expect(a.provenance).toBe("evidence-only");
  });
});

describe("follow-up retrieval query", () => {
  const history = [
    { role: "user" as const, text: "Compare CS 170 and CS 189" },
    { role: "assistant" as const, text: "…", course_ids: ["COMPSCI 170", "COMPSCI 189"] },
  ];
  it("adds previous courses when the question names none", () => {
    expect(buildRetrievalQuery("Which one needs more math?", history)).toBe(
      "Which one needs more math? (follow-up about COMPSCI 170, COMPSCI 189)",
    );
  });
  it("adds previous courses when a named-course question refers back", () => {
    expect(buildRetrievalQuery("Do either of them require CS 70?", history)).toMatch(/follow-up about COMPSCI 170, COMPSCI 189/);
  });
  it("leaves self-contained questions alone", () => {
    expect(buildRetrievalQuery("What are the prerequisites for CS 162?", history)).toBe("What are the prerequisites for CS 162?");
  });
});
