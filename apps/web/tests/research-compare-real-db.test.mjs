import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase } from "../../../packages/db/src/db.ts";
import { migrateUp } from "../../../packages/db/src/migrate.ts";
import { createSource } from "../../../packages/db/src/repositories.ts";
import { signUp } from "../../../packages/db/src/auth.ts";
import { createWorkspace } from "../../../packages/db/src/workspaces.ts";
import { createArtifact } from "../../../packages/db/src/graph.ts";
import { searchAssetsRoute, compareArtifactsRoute } from "../lib/rest.ts";
import { parseScreenSearchPage } from "../lib/research-search-ui.ts";
import { toggleResearchSelection, researchComparisonPath, parseResearchComparison } from "../lib/research-compare-ui.ts";

test("G33 real PGlite: selected search screens compare for member, never outsider", async () => {
  const db = await openDatabase();
  await migrateUp(db);
  try {
    const owner = await signUp(db, { email: "g33-owner@skilit.invalid", password: "g33-qa-password-2026" });
    const outsider = await signUp(db, { email: "g33-outsider@skilit.invalid", password: "g33-qa-password-2026" });
    const workspace = await createWorkspace(db, { name: "G33 research selection", ownerId: owner.id });
    const source = await createSource(db, { key: "g33-author-owned-synthetic", kind: "synthetic" });
    const first = await createArtifact(db, {
      sourceId: source.id, kind: "screen", title: "G33 checkout alpha",
      summary: "Synthetic checkout contact details", contentHash: "a".repeat(64),
      rightsClassification: "permitted", visibility: "private",
      workspaceId: workspace.workspace.id, ownerSubject: owner.id,
      metadata: { tags: ["checkout", "form"], license: "unknown" },
    });
    const second = await createArtifact(db, {
      sourceId: source.id, kind: "screen", title: "G33 checkout beta",
      summary: "Synthetic checkout delivery details", contentHash: "b".repeat(64),
      rightsClassification: "permitted", visibility: "private",
      workspaceId: workspace.workspace.id, ownerSubject: owner.id,
      metadata: { tags: ["checkout", "delivery"], license: "unknown" },
    });
    const ownerSearch = await searchAssetsRoute(db, { query: "checkout", kinds: "screen" }, owner.id);
    assert.equal(ownerSearch.status, 200);
    const ownerPage = parseScreenSearchPage(ownerSearch.body);
    assert.ok(ownerPage);
    assert.equal(ownerPage.screens.length, 2);
    assert.deepEqual(new Set(ownerPage.screens.map((item) => item.uri)),
      new Set([`skilit://artifact/${first.id}`, `skilit://artifact/${second.id}`]));
    let selected = [];
    for (const item of ownerPage.screens) selected = toggleResearchSelection(selected, item.uri);
    const comparisonUrl = new URL(researchComparisonPath(selected), "http://localhost");
    assert.equal(comparisonUrl.pathname, "/api/v1/assets/compare");
    const query = Object.fromEntries(comparisonUrl.searchParams.entries());
    const ownerCompare = await compareArtifactsRoute(db, query, owner.id);
    assert.equal(ownerCompare.status, 200);
    assert.ok(parseResearchComparison(ownerCompare.body, selected));

    // Outsider learns no private screen titles via either search or comparison.
    const outsiderSearch = await searchAssetsRoute(db, { query: "checkout", kinds: "screen" }, outsider.id);
    assert.equal(outsiderSearch.status, 200);
    assert.deepEqual(parseScreenSearchPage(outsiderSearch.body)?.screens, []);
    const outsiderCompare = await compareArtifactsRoute(db, query, outsider.id);
    assert.notEqual(outsiderCompare.status, 200);
    assert.equal(parseResearchComparison(outsiderCompare.body, selected), null);
    assert.ok(!JSON.stringify(outsiderCompare.body).includes("G33 checkout"));
  } finally { await db.close(); }
});
