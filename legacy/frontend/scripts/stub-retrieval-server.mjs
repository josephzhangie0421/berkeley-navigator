#!/usr/bin/env node
/**
 * Contract stub for POST /api/retrieve. For local integration testing only.
 *
 * It returns obviously fake courses ("STUB 101") and example.com sources so
 * the live-mode pipeline (retrieval → normalization → generation → UI) can be
 * exercised before the real backend is ready. It contains no Berkeley data.
 *
 *   node scripts/stub-retrieval-server.mjs            # port 8000
 *   PORT=8100 node scripts/stub-retrieval-server.mjs
 *   STUB_MODE=error node scripts/stub-retrieval-server.mjs   # always HTTP 500
 *   STUB_MODE=empty node scripts/stub-retrieval-server.mjs   # no results
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT) || 8000;
const MODE = process.env.STUB_MODE || "ok";

function response(query) {
  if (MODE === "empty") return { results: [], limitations: ["Stub: no results for this query."] };
  return {
    results: [
      {
        course_id: "STUB 101",
        course_title: "Stub Course One",
        matched_reason: `Stub match for: "${query.slice(0, 60)}"`,
        facts: [
          { text: "Stub official fact linked by source_id.", source_id: "cat-1" },
          { text: "Stub student comment linked by source_index.", source_index: 1 },
          { text: "Stub fact with no source reference." },
        ],
        sources: [
          { id: "cat-1", title: "Stub catalog page", url: "https://example.com/stub/catalog/101", type: "official_catalog" },
          { id: "rev-1", title: "Stub student review", url: "https://example.com/stub/reviews/101", type: "student_review" },
        ],
      },
      {
        course_id: "STUB 202",
        course_title: "Stub Course Two",
        matched_reason: "Stub match based on profile interests",
        facts: ["Stub plain-string fact; course has a single source."],
        sources: [{ title: "Stub page without a type label", url: "https://example.com/stub/other/202" }],
      },
    ],
    limitations: ["Stub backend: all data is fake."],
  };
}

createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/api/retrieve") {
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not found" }));
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let parsed = {};
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      res.writeHead(400).end();
      return;
    }
    console.log("[stub] /api/retrieve", JSON.stringify(parsed));
    if (MODE === "error") {
      res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "stub failure" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(response(String(parsed.query ?? ""))));
  });
}).listen(PORT, () => console.log(`[stub] retrieval stub listening on http://localhost:${PORT} (mode: ${MODE})`));
