import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  parseScreenSearchPage, researchSearchPath, searchFailure,
} from "../lib/research-search-ui.ts";

const ID = "12345678-1234-4234-9234-1234567890ab";
const item = () => ({
  uri: `skilit://artifact/${ID}`, kind: "screen",
  title: "Synthetic onboarding screen", rights: "metadata_only",
  license: "unknown", serving: "metadata-only",
  servingReason: "No redistributable license", source: "synthetic-fixture",
});
const envelope = (assets = [item()]) => ({
  schema_version: "skilit.agent.v1",
  status: "complete",
  result: { assets, search_mode: "postgres-fts" },
});

test("P10-G24 research UI creates only same-origin, explicit-screen, encoded queries", () => {
  const parsed = new URL(researchSearchPath("  onboarding  "), "http://localhost");
  assert.equal(parsed.pathname, "/api/v1/assets");
  assert.equal(parsed.searchParams.get("query"), "onboarding");
  assert.equal(parsed.searchParams.get("kinds"), "screen");
  assert.equal(parsed.searchParams.get("facets"), "true");
  assert.equal(parsed.searchParams.get("limit"), "20");
  assert.equal(new URL(researchSearchPath("arrow & checkout", "cursor-01"),
    "http://localhost").searchParams.get("cursor"), "cursor-01");
  assert.equal(researchSearchPath(" "), null);
  assert.equal(researchSearchPath("x".repeat(201)), null);
  assert.equal(researchSearchPath("research", "x".repeat(257)), null);
});

test("P10-G24 UI validates complete record shapes and never invents screen metadata", () => {
  assert.equal(parseScreenSearchPage(envelope())?.screens[0].title,
    "Synthetic onboarding screen");
  assert.equal(parseScreenSearchPage({ ...envelope(), cursor: "cur-1" })?.cursor, "cur-1");
  assert.equal(parseScreenSearchPage({ ...envelope(), cursor: "x".repeat(257) }), null);
  assert.equal(parseScreenSearchPage(envelope([{ ...item(), kind: "font" }])), null);
  assert.equal(parseScreenSearchPage(envelope([{ ...item(), uri: "javascript:alert(1)" }])), null);
  assert.equal(parseScreenSearchPage(envelope([{ ...item(), rights: 3 }])), null);
  assert.equal(parseScreenSearchPage(envelope([{ ...item(), title: null }])), null);
  assert.equal(parseScreenSearchPage({ result: { assets: [], search_mode: "semantic" } }), null);
  assert.equal(parseScreenSearchPage({ error: { code: "INTERNAL_OPAQUE" } }), null);
});

test("P10-G24 UI redacts malformed error payloads", () => {
  assert.equal(searchFailure({ error: { code: "NOT_FOUND", message: "Not found." } }, "fallback"),
    "NOT_FOUND: Not found.");
  assert.equal(searchFailure({ error: { code: 12, message: { secret: "abc" } } }, "fallback"), "fallback");
});

test("P10-G24 real page wires cookie-based transport without remote media and has accessible labels", async () => {
  const page = await readFile(new URL("../app/research/page.tsx", import.meta.url), "utf8");
  const shell = await readFile(new URL("../components/skilit-shell.tsx", import.meta.url), "utf8");
  assert.ok(page.includes('sessionRequest(path)'));
  assert.ok(page.includes('id="research-query"'));
  assert.ok(page.includes('aria-label="Research screen results"'));
  assert.ok(page.includes('role="alert"'));
  assert.ok(page.includes('researchSearchPath(term, nextCursor)'));
  assert.ok(page.includes('load') || page.includes('Load more screens'));
  assert.ok(shell.includes('href: "/research"'));
  assert.ok(!page.includes("dangerouslySetInnerHTML"));
  assert.ok(!page.includes("localStorage"));
  assert.ok(!page.includes("Authorization:"));
  assert.ok(!page.includes("<img"));
});
