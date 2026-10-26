import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  toggleResearchSelection, researchComparisonPath, parseResearchComparison,
} from "../lib/research-compare-ui.ts";

const A = "12345678-1234-4234-9234-1234567890ab";
const B = "12345678-1234-4234-9234-1234567890ac";
const C = "12345678-1234-4234-9234-1234567890ad";
const uri = (id) => `skilit://artifact/${id}`;
const side = (id) => ({
  uri: uri(id), kind: "screen", title: "Synthetic screen", summary: null,
  rights: "metadata_only", license: "unknown", trademark: false,
  serving: "metadata-only", tags: ["synthetic"],
});
const envelope = (left = A, right = B) => ({ result: {
  left: side(left), right: side(right), identical: false, score: 0.5,
  sharedTerms: ["synthetic"], uniqueLeft: [], uniqueRight: [],
  fieldDiffs: [{ field: "title", left: "Synthetic A", right: "Synthetic B" }],
}});

test("G33 search selection keeps at most two distinct, valid Skilit screen references", () => {
  let selected = [];
  selected = toggleResearchSelection(selected, uri(A));
  selected = toggleResearchSelection(selected, uri(B));
  assert.deepEqual(selected, [A, B]);
  assert.deepEqual(toggleResearchSelection(selected, uri(C)), [A, B]);
  assert.deepEqual(toggleResearchSelection(selected, "https://external.invalid/secret"), [A, B]);
  assert.deepEqual(toggleResearchSelection(selected, "skilit://artifact/../escape"), [A, B]);
  selected = toggleResearchSelection(selected, uri(A));
  assert.deepEqual(selected, [B]);
  assert.deepEqual(toggleResearchSelection(selected, uri(C)), [B, C]);
  assert.deepEqual(toggleResearchSelection([A], uri(A)), []);
});

test("G33 comparison path accepts exactly two different local IDs, no token or URL injection", () => {
  assert.equal(researchComparisonPath([A, B]), `/api/v1/assets/compare?left=${A}&right=${B}`);
  for (const bad of [[], [A], [A, A], [A, B, C], [A, "../../etc"], [A, "https://evil.invalid"]]) {
    assert.equal(researchComparisonPath(bad), null);
  }
});

test("G33 response verifies selected left/right identity and rejects malformed/foreign data", () => {
  assert.equal(parseResearchComparison(envelope(), [A, B])?.score, 0.5);
  assert.equal(parseResearchComparison(envelope(B, A), [A, B]), null);
  assert.equal(parseResearchComparison(envelope(A, C), [A, B]), null);
  assert.equal(parseResearchComparison({ result: { ...envelope().result, left: { ...side(A), kind: "icon" } } }, [A, B]), null);
  assert.equal(parseResearchComparison({ result: { ...envelope().result, score: 2 } }, [A, B]), null);
  assert.equal(parseResearchComparison({ error: { code: "FORBIDDEN_OR_NOT_FOUND" } }, [A, B]), null);
});

test("G33 research page binds two-screen choices to actor-scoped cookie REST and clears stale state", async () => {
  const page = await readFile(new URL("../app/research/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("toggleResearchSelection(current, screen.uri)"));
  assert.ok(page.includes("researchComparisonPath(selected)"));
  assert.ok(page.includes("parseResearchComparison(payload, selected)"));
  assert.ok(page.includes("sessionRequest(path)"));
  assert.ok(page.includes("setSelected([])"));
  assert.ok(page.includes('aria-label="Research comparison"'));
  assert.ok(!page.includes("localStorage"));
  assert.ok(!page.includes("sessionStorage"));
  assert.ok(!page.includes("dangerouslySetInnerHTML"));
  assert.ok(!page.includes("Authorization:"));
});
