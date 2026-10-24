import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  comparisonArtifactId, comparisonPath, asComparison, comparisonFieldText,
} from "../lib/compare-ui.ts";

const FIRST = "12345678-1234-4234-9234-1234567890ab";
const SECOND = "22345678-1234-4234-9234-1234567890ab";
const side = (id) => ({
  uri: `skilit://artifact/${id}`, kind: "screen", title: "Example",
  summary: null, rights: "permitted", license: "MIT", trademark: false,
  serving: "allowed", tags: ["research"],
});
const result = () => ({
  left: side(FIRST), right: side(SECOND), identical: false, score: 0.625,
  sharedTerms: ["research"], uniqueLeft: ["first"], uniqueRight: ["second"],
  fieldDiffs: [{ field: "title", left: "First", right: "Second" }],
});

test("compare UI normalizes only stable Skilit artifact IDs into same-origin query", () => {
  assert.equal(comparisonArtifactId(`skilit://artifact/${FIRST}`), FIRST);
  assert.equal(comparisonArtifactId(` ${FIRST.toUpperCase()} `), FIRST);
  assert.equal(comparisonPath(FIRST, `skilit://artifact/${SECOND}`), `/api/v1/assets/compare?left=${FIRST}&right=${SECOND}`);
});

test("compare URL rejects traversal, embedded query, external URIs, malformed identifiers", () => {
  for (const input of [
    "", "skilit://artifact/../../login", "skilit://flow/" + FIRST,
    "javascript:alert(1)", "https://example.invalid/" + FIRST, FIRST + "?token=secret",
    FIRST + "%2Fetc", FIRST + "/../foo",
  ]) {
    assert.equal(comparisonArtifactId(input), null);
    assert.equal(comparisonPath(input, SECOND), null);
    assert.equal(comparisonPath(FIRST, input), null);
  }
});

test("trusted comparison payload requires both matching sides, finite score, valid fields", () => {
  assert.deepEqual(asComparison(result())?.sharedTerms, ["research"]);
  assert.equal(asComparison({ ...result(), score: Number.NaN }), null);
  assert.equal(asComparison({ ...result(), score: 20 }), null);
  assert.equal(asComparison({ ...result(), sharedTerms: [100] }), null);
  assert.equal(asComparison({ ...result(), right: { uri: "https://evil.invalid" } }), null);
  assert.equal(asComparison({ ...result(), fieldDiffs: [{ field: "title", left: "changed" }] }), null);
});

test("metadata renderer never turns a structured value into executable markup", () => {
  assert.equal(comparisonFieldText(["<script>", "safe"]), '["<script>","safe"]');
  assert.equal(comparisonFieldText(null), "Not specified");
  assert.equal(comparisonFieldText(false), "false");
});

test("UI uses existing actor-scoped API and cookie-only transport", async () => {
  const source = await readFile(new URL("../app/compare/page.tsx", import.meta.url), "utf8");
  const shell = await readFile(new URL("../components/skilit-shell.tsx", import.meta.url), "utf8");
  for (const feature of [
    "SessionAccessBanner", "comparisonPath(left, right)", "sessionRequest(path)",
    "role=\"alert\"", "aria-live=\"polite\"", "Compare evidence",
    "comparisonArtifactId(parsed.left.uri)", "comparisonArtifactId(parsed.right.uri)",
    "Lexical Jaccard overlap", "Field differences",
  ]) assert.ok(source.toLowerCase().includes(feature.toLowerCase()), feature);
  assert.ok(shell.includes('href: "/compare"'), "Compare must be reachable from navigation");
  assert.ok(!source.includes("localStorage"), "no browser storage auth token");
  assert.ok(!source.includes("Authorization:"), "no bearer headers in the UI");
  assert.ok(!source.includes("dangerouslySetInnerHTML"), "never render source metadata as HTML");
});
