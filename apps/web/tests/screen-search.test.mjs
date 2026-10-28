import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../../packages/db/src/db.ts";
import { migrateUp } from "../../../packages/db/src/migrate.ts";
import { createSource } from "../../../packages/db/src/repositories.ts";
import { signUp } from "../../../packages/db/src/auth.ts";
import { createWorkspace } from "../../../packages/db/src/workspaces.ts";
import { importCorpusFixture } from "../../../packages/ingest/src/corpus.ts";
import { registerAsset, RegistryError, searchAssetsDetailed, searchAssetsForActorDetailed } from "../../../packages/assets/src/registry.ts";
import { getAssetRoute, searchAssetsRoute } from "../lib/rest.ts";
import { dispatchMcp } from "../lib/mcp.ts";

const TITLE = "Synthetic research onboarding screen";

function corpus(owner, workspaceId) {
  return {
    products: [{
      externalId: "synthetic-screens-cb24",
      title: "Research synthetic product",
      versions: [{
        versionNo: 1,
        artifacts: [
          {
            externalId: "public-screen",
            kind: "screen", title: TITLE, summary: "Open signup example",
            tags: ["signup", "research"], rightsClassification: "permitted",
          },
          {
            externalId: "private-screen",
            kind: "screen", title: "Private research onboarding screen",
            summary: "Unpublished workspace design",
            tags: ["secret", "research"], rightsClassification: "metadata_only",
            workspaceId, ownerSubject: owner,
          },
          {
            externalId: "legacy-screen",
            kind: "screen", title: "Legacy research screen",
            tags: ["legacy", "research"], rightsClassification: "permitted",
          },
        ],
        flows: [],
      }],
    }],
  };
}

async function setup() {
  const db = await openDatabase();
  await migrateUp(db);
  const owner = await signUp(db, { email: "cb24-owner@skilit.invalid", password: "cb24-password-001" });
  const outsider = await signUp(db, { email: "cb24-outsider@skilit.invalid", password: "cb24-password-001" });
  const space = await createWorkspace(db, { name: "Private corpus", ownerId: owner.id });
  const source = await createSource(db, { key: "cb24-synthetic-research", kind: "synthetic" });
  await importCorpusFixture(db, {
    sourceId: source.id,
    sourceVersion: "cb24-synthetic-only",
    corpus: corpus(owner.id, space.workspace.id),
  });
  const rows = await db.query("select id, title from artifacts where product_id is not null");
  const ids = Object.fromEntries(rows.rows.map((row) => [String(row.title), String(row.id)]));
  // Simulate an older database entry that predates the non-public-global
  // creation guard: readable by neither owner nor outsider.
  await db.query("update artifacts set visibility = 'private' where id = $1",
    [ids["Legacy research screen"]]);
  return { db, owner, outsider, source, ids };
}

async function mcpCall(db, actorId, tool, args) {
  const output = await dispatchMcp(db, { userId: actorId, capabilities: { packs: true, registry: true } }, {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: tool, arguments: args },
  });
  if (output.error) return { error: output.error };
  return JSON.parse(output.result.content[0].text);
}

test("P10-G24 explicit screen search; existing default and writes stay registry-only", async () => {
  const fx = await setup();
  try {
    const defaults = await searchAssetsRoute(fx.db, { query: "research" }, fx.outsider.id);
    assert.equal(defaults.status, 200);
    assert.deepEqual(defaults.body.result.assets, [], "default stays icons, logos, fonts");

    const results = await searchAssetsRoute(fx.db, {
      query: "research", kinds: "screen", facets: "true",
    }, fx.outsider.id);
    assert.equal(results.status, 200);
    assert.deepEqual(results.body.result.assets.map((x) => x.title), [TITLE]);
    assert.equal(results.body.result.assets[0].serving, "metadata-only");
    assert.equal(results.body.result.facets.kinds[0].value, "screen");
    assert.equal(results.body.result.facets.kinds[0].count, 1);

    const owner = await searchAssetsForActorDetailed(fx.db, {
      query: "research", kinds: ["screen"], includeFacets: true,
    }, fx.owner.id);
    assert.equal(owner.assets.length, 2);
    assert.ok(owner.assets.some((r) => r.title === "Private research onboarding screen"));
    assert.ok(!owner.assets.some((r) => r.title === "Legacy research screen"));
    assert.equal(owner.facets.kinds[0].count, 2);

    await assert.rejects(
      registerAsset(fx.db, {
        kind: "screen", title: "Accidentally registered research item",
        sourceId: fx.source.id, contentHash: "a".repeat(64),
        rightsClassification: "permitted",
      }),
      (e) => e instanceof RegistryError && e.code === "assets/invalid-record",
      "screen registration must remain behind the corpus importer",
    );
    assert.equal((await searchAssetsRoute(fx.db, { query: "research", kinds: "screen,bad" }, fx.owner.id)).status, 400);
  } finally {
    await fx.db.close();
  }
});

test("P10-G24 REST/MCP parity, screen resolution, and denied/legacy screens stay opaque", async () => {
  const fx = await setup();
  try {
    const query = { query: "research", kinds: "screen" };
    const rest = await searchAssetsRoute(fx.db, query, fx.outsider.id);
    const mcp = await mcpCall(fx.db, fx.outsider.id, "search_assets", {
      query: "research", kinds: ["screen"],
    });
    assert.deepEqual(mcp.result.assets, rest.body.result.assets);
    const defaultMcp = await mcpCall(fx.db, fx.outsider.id, "search_assets", { query: "research" });
    assert.deepEqual(defaultMcp.result.assets, []);

    const publicId = fx.ids[TITLE];
    const privateId = fx.ids["Private research onboarding screen"];
    const legacyId = fx.ids["Legacy research screen"];
    const ok = await getAssetRoute(fx.db, publicId, fx.outsider.id);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.result.asset.kind, "screen");
    assert.equal(ok.body.result.asset.serving, "metadata-only");

    assert.equal((await getAssetRoute(fx.db, privateId, fx.outsider.id)).status, 404);
    assert.equal((await getAssetRoute(fx.db, legacyId, fx.outsider.id)).status, 404);
    assert.equal((await getAssetRoute(fx.db, legacyId, fx.owner.id)).status, 404);
    assert.equal((await getAssetRoute(fx.db, privateId, fx.owner.id)).status, 200);
    const denied = await mcpCall(fx.db, fx.outsider.id, "get_asset", { artifactId: privateId });
    assert.ok(denied.error || denied.error?.data || denied.result?.error,
      "MCP denied artifact must produce a failure envelope");
    // MCP errors are opaque and must not expose the denied screen title.
    assert.ok(!JSON.stringify(denied).includes("Private research onboarding screen"));
  } finally {
    await fx.db.close();
  }
});

test("P10-G24 unscoped screen search cannot read old global/private rows", async () => {
  const fx = await setup();
  try {
    const unscoped = await searchAssetsDetailed(fx.db, {
      query: "research", kinds: ["screen"], includeFacets: true,
    });
    assert.deepEqual(unscoped.assets.map((x) => x.title), [TITLE]);
    assert.equal(unscoped.facets.kinds[0].count, 1);
    assert.equal((await searchAssetsDetailed(fx.db, {
      query: "research", kinds: ["screen"], rights: ["restricted"],
    })).assets.length, 0);
  } finally {
    await fx.db.close();
  }
});
