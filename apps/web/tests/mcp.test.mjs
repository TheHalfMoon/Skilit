import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../../packages/db/src/db.ts";
import { migrateUp } from "../../../packages/db/src/migrate.ts";
import { createProduct, createProductVersion, createSource } from "../../../packages/db/src/repositories.ts";
import { createArtifact } from "../../../packages/db/src/graph.ts";
import { signIn, signOut, signUp } from "../../../packages/db/src/auth.ts";
import { createWorkspace } from "../../../packages/db/src/workspaces.ts";
import { registerAsset } from "../../../packages/assets/src/registry.ts";
import { bearerToken, dispatchMcp, resolveRequestUser } from "../lib/mcp.ts";
import { resetRateLimits, checkRateLimit } from "../lib/rate-limit.ts";
import { exportReferencePack, parseSkilitUri } from "../lib/reference-packs.ts";

const ANON = { userId: null };

async function fixture() {
  const db = await openDatabase();
  await migrateUp(db);
  const user = await signUp(db, { email: "agent@skilit.example", password: "agent-password-01" });
  const source = await createSource(db, { key: "mcp-source", kind: "synthetic" });
  const icon = await registerAsset(db, {
    kind: "icon",
    title: "MCP arrow",
    sourceId: source.id,
    contentHash: "9".repeat(64),
    rightsClassification: "permitted",
    metadata: { collection: "iconify:mdi", ref: "arrow", tags: ["arrow"], license: "MIT" },
    asset: { sha256: "9".repeat(64), mediaType: "image/svg+xml", byteLength: 64, storageKey: "sha256/mc/arrow" },
  });
  return { db, icon, user, ctx: { userId: user.id } };
}

async function call(db, ctx, method, params, id = 1) {
  return dispatchMcp(db, ctx, { jsonrpc: "2.0", id, method, params });
}

test("initialize negotiates protocol versions", async () => {
  const fx = await fixture();
  try {
    const latest = await call(fx.db, ANON, "initialize", { protocolVersion: "2026-07-28" });
    assert.equal(latest.result.protocolVersion, "2026-07-28");
    assert.equal(latest.result.serverInfo.name, "skilit");
    assert.deepEqual(Object.keys(latest.result.capabilities), ["tools"]);
    const legacy = await call(fx.db, ANON, "initialize", { protocolVersion: "2024-11-05" });
    assert.equal(legacy.result.protocolVersion, "2024-11-05");
    const unknown = await call(fx.db, ANON, "initialize", { protocolVersion: "1999-01-01" });
    assert.equal(unknown.result.protocolVersion, "2026-07-28");
    const ping = await call(fx.db, ANON, "ping", {});
    assert.deepEqual(ping.result, {});
  } finally {
    await fx.db.close();
  }
});

test("session tokens bind to server-resolved identities", async () => {
  const fx = await fixture();
  try {
    const signed = await signIn(fx.db, { email: "agent@skilit.example", password: "agent-password-01" });
    assert.equal(await resolveRequestUser(fx.db, signed.token), fx.user.id);
    await assert.rejects(() => resolveRequestUser(fx.db, "bogus-token"));
    await assert.rejects(() => resolveRequestUser(fx.db, null));
    await signOut(fx.db, signed.token);
    await assert.rejects(() => resolveRequestUser(fx.db, signed.token));
  } finally {
    await fx.db.close();
  }
});

test("tools require a resolved identity", async () => {
  const fx = await fixture();
  try {
    const denied = await call(fx.db, ANON, "tools/list", {});
    assert.equal(denied.error.code, -32001);
    assert.equal(denied.id, 1);
    const callDenied = await call(fx.db, ANON, "tools/call", {
      name: "search_assets",
      arguments: { query: "arrow" },
    });
    assert.equal(callDenied.error.code, -32001);
    const allowed = await call(fx.db, fx.ctx, "tools/list", {});
    assert.equal(allowed.result.tools.length, 30);
    assert.deepEqual(
      allowed.result.tools.map((tool) => tool.name).sort(),
      [
        "board_handoff",
        "board_list_handoffs",
        "board_validate_items",
        "compare_design",
        "create_reference_pack",
        "find_similar",
        "get_asset",
        "get_changes",
        "get_flow_steps",
        "get_object",
        "get_pattern",
        "get_registry_item",
        "lens_cancel_job",
        "lens_create_job",
        "lens_get_job",
        "lens_poll_job",
        "lens_read_artifact",
        "lens_resume_job",
        "lens_retry_job",
        "list_flows",
        "list_patterns",
        "list_product_versions",
        "list_products",
        "replay_close_session",
        "replay_get_events",
        "replay_open_session",
        "replay_record_events",
        "save_reference",
        "search_assets",
        "search_registry",
      ],
    );
  } finally {
    await fx.db.close();
  }
});

test("asset tools return stable Skilit URIs", async () => {
  const fx = await fixture();
  try {
    const searched = await call(fx.db, fx.ctx, "tools/call", {
      name: "search_assets",
      arguments: { query: "arrow" },
    });
    const payload = JSON.parse(searched.result.content[0].text);
    assert.equal(payload.schema_version, "skilit.agent.v1");
    assert.equal(payload.status, "complete");
    assert.ok(typeof payload.request_id === "string" && payload.request_id.length > 0);
    assert.equal(payload.result.assets.length, 1);
    assert.equal(payload.result.assets[0].uri, `skilit://artifact/${fx.icon.artifactId}`);
    assert.equal(payload.result.assets[0].serving, "download");
    const single = await call(fx.db, fx.ctx, "tools/call", {
      name: "get_asset",
      arguments: { artifactId: fx.icon.artifactId },
    });
    const one = JSON.parse(single.result.content[0].text);
    assert.equal(one.schema_version, "skilit.agent.v1");
    assert.equal(one.result.asset.uri, `skilit://artifact/${fx.icon.artifactId}`);
    const item = await call(fx.db, fx.ctx, "tools/call", {
      name: "get_registry_item",
      arguments: { name: "skilit-button" },
    });
    assert.equal(JSON.parse(item.result.content[0].text).result.item.name, "skilit-button");
  } finally {
    await fx.db.close();
  }
});

test("registry search lists, filters, and validates", async () => {
  const fx = await fixture();
  try {
    const all = await call(fx.db, fx.ctx, "tools/call", {
      name: "search_registry",
      arguments: {},
    });
    const listed = JSON.parse(all.result.content[0].text);
    assert.equal(listed.schema_version, "skilit.agent.v1");
    assert.equal(listed.status, "complete");
    assert.equal(listed.result.total, 2);
    assert.deepEqual(
      listed.result.items.map((entry) => entry.name),
      ["skilit-button", "skilit-card"],
    );
    const button = await call(fx.db, fx.ctx, "tools/call", {
      name: "search_registry",
      arguments: { query: "BUTTON" },
    });
    const filtered = JSON.parse(button.result.content[0].text);
    assert.equal(filtered.result.total, 1);
    assert.equal(filtered.result.items[0].name, "skilit-button");
    const none = await call(fx.db, fx.ctx, "tools/call", {
      name: "search_registry",
      arguments: { query: "no-such-widget" },
    });
    const empty = JSON.parse(none.result.content[0].text);
    assert.equal(empty.result.total, 0);
    assert.deepEqual(empty.result.items, []);
    for (const bad of [{ query: 42 }, { query: "x".repeat(201) }, { limit: 0 }, { limit: 99999 }, { limit: "many" }]) {
      const rejected = await call(fx.db, fx.ctx, "tools/call", {
        name: "search_registry",
        arguments: bad,
      });
      assert.equal(rejected.error.code, -32602, `rejects ${JSON.stringify(bad)}`);
    }
    const previous = process.env.SKILIT_DISABLED_CAPABILITIES;
    process.env.SKILIT_DISABLED_CAPABILITIES = "registry";
    try {
      const disabled = await call(fx.db, fx.ctx, "tools/call", {
        name: "search_registry",
        arguments: {},
      });
      assert.equal(disabled.error.code, -32000);
      const envelope = disabled.error.data.envelope;
      assert.equal(envelope.error.code, "PROVIDER_DISABLED");
    } finally {
      if (previous === undefined) delete process.env.SKILIT_DISABLED_CAPABILITIES;
      else process.env.SKILIT_DISABLED_CAPABILITIES = previous;
    }
  } finally {
    await fx.db.close();
  }
});

test("unknown methods, tools, and malformed bodies fail closed", async () => {
  const fx = await fixture();
  try {
    const method = await call(fx.db, fx.ctx, "frobnicate", {});
    assert.equal(method.error.code, -32601);
    const tool = await call(fx.db, fx.ctx, "tools/call", { name: "delete_everything", arguments: {} });
    assert.equal(tool.error.code, -32601);
    const params = await call(fx.db, fx.ctx, "tools/call", { name: "search_assets", arguments: {} });
    assert.equal(params.error.code, -32602);
    const missing = await call(fx.db, fx.ctx, "tools/call", {
      name: "get_asset",
      arguments: { artifactId: "00000000-0000-0000-0000-000000000000" },
    });
    assert.equal(missing.error.code, -32000);
    const garbage = await dispatchMcp(fx.db, fx.ctx, { nope: true });
    assert.equal(garbage.error.code, -32600);
    const batch = await dispatchMcp(fx.db, fx.ctx, [
      { jsonrpc: "2.0", id: 1, method: "ping", params: {} },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { nope: true },
    ]);
    assert.equal(batch.length, 2);
    assert.deepEqual(batch[0].result, {});
    assert.equal(batch[1].error.code, -32600);
    const empty = await dispatchMcp(fx.db, fx.ctx, []);
    assert.equal(empty.error.code, -32600);
  } finally {
    await fx.db.close();
  }
});

test("agent write round-trip preserves references across sessions", async () => {
  const db = await openDatabase();
  try {
    await migrateUp(db);
    const owner = await signUp(db, { email: "writer@skilit.example", password: "writer-password-01" });
    const outsider = await signUp(db, { email: "outsider@skilit.example", password: "outsider-password-01" });
    const space = await createWorkspace(db, { name: "Writer space", ownerId: owner.id });
    const source = await createSource(db, { key: "writer-source", kind: "synthetic" });
    const product = await createProduct(db, { sourceId: source.id, title: "Writer app" });
    const version = await createProductVersion(db, { productId: product.id, versionNo: 1 });
    const screen = await createArtifact(db, {
      sourceId: source.id,
      productId: product.id,
      productVersionId: version.id,
      kind: "screen",
      title: "Writer screen",
      contentHash: "b".repeat(64),
      rightsClassification: "metadata_only",
      visibility: "workspace",
      workspaceId: space.workspace.id,
      ownerSubject: owner.id,
    });
    const ownerCtx = { userId: owner.id };
    const outsiderCtx = { userId: outsider.id };
    const created = await call(db, ownerCtx, "tools/call", {
      name: "create_reference_pack",
      arguments: {
        workspaceId: space.workspace.id,
        title: "Writer pack",
        artifactIds: [screen.id],
      },
    });
    const createdPayload = JSON.parse(created.result.content[0].text);
    assert.equal(createdPayload.schema_version, "skilit.agent.v1");
    const pack = createdPayload.result.pack;
    assert.equal(pack.schema, "skilit/reference-pack/1");
    assert.equal(pack.itemCount, 1);
    assert.equal(pack.items[0].uri, `skilit://artifact/${screen.id}`);
    const saved = await call(db, ownerCtx, "tools/call", {
      name: "save_reference",
      arguments: { collectionId: pack.uri.split("/").pop(), artifactId: screen.id },
    });
    assert.equal(JSON.parse(saved.result.content[0].text).result.saved, true);
    const fetched = await call(db, ownerCtx, "tools/call", {
      name: "get_object",
      arguments: { uri: `skilit://artifact/${screen.id}` },
    });
    assert.equal(JSON.parse(fetched.result.content[0].text).result.object.title, "Writer screen");
    const recovered = await exportReferencePack(db, pack.uri.split("/").pop(), owner.id);
    assert.deepEqual(recovered.items.map((entry) => entry.uri), [`skilit://artifact/${screen.id}`]);
    const denied = await call(db, outsiderCtx, "tools/call", {
      name: "get_object",
      arguments: { uri: pack.uri },
    });
    assert.equal(denied.error.code, -32000);
    const outsiderWrite = await call(db, outsiderCtx, "tools/call", {
      name: "save_reference",
      arguments: { collectionId: pack.uri.split("/").pop(), artifactId: screen.id },
    });
    assert.equal(outsiderWrite.error.code, -32000);
    const forged = await call(db, outsiderCtx, "tools/call", {
      name: "save_reference",
      arguments: {
        collectionId: pack.uri.split("/").pop(),
        artifactId: screen.id,
        actorId: owner.id,
      },
    });
    assert.equal(forged.error.code, -32000);
    const badUri = await call(db, ownerCtx, "tools/call", {
      name: "get_object",
      arguments: { uri: "skilit://nope/123" },
    });
    assert.equal(badUri.error.code, -32602);
    assert.throws(() => parseSkilitUri("not-a-uri"), /Skilit URI is invalid/);
  } finally {
    await db.close();
  }
});

test("bearer token parsing is strict", () => {
  assert.equal(bearerToken(null), null);
  assert.equal(bearerToken("Token abc"), null);
  assert.equal(bearerToken("Bearer "), null);
  assert.equal(bearerToken("Bearer test-token"), "test-token");
  assert.equal(bearerToken("  Bearer test-token  "), "test-token");
  assert.equal(bearerToken("bearer spaced-token"), "spaced-token");
  assert.equal(bearerToken("BeArEr\tvalid-token"), "valid-token");
  assert.equal(bearerToken("Bearerx-token"), null);
  assert.equal(bearerToken("Bearer\nmultiline-token"), null);
  assert.equal(bearerToken("Bearer   token\nnext-line"), null);
  assert.equal(bearerToken("Bearer" + " ".repeat(100_000) + "\ninvalid"), null);
  assert.equal(bearerToken("Bearer " + "a".repeat(8192)), null);
});

test("envelope edge cases stay protocol-clean", async () => {
  const fx = await fixture();
  try {
    const notificationOnly = await dispatchMcp(fx.db, fx.ctx, [
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ]);
    assert.equal(notificationOnly, null);
    const idLess = await dispatchMcp(fx.db, fx.ctx, { jsonrpc: "2.0", method: "ping" });
    assert.equal(idLess, null);
    const badKinds = await call(fx.db, fx.ctx, "tools/call", {
      name: "search_assets",
      arguments: { query: "arrow", kinds: ["spaceship"] },
    });
    assert.equal(badKinds.error.code, -32602);
    const badLimit = await call(fx.db, fx.ctx, "tools/call", {
      name: "search_assets",
      arguments: { query: "arrow", limit: 5000 },
    });
    assert.equal(badLimit.error.code, -32602);
    const oversized = await dispatchMcp(fx.db, fx.ctx, new Array(33).fill({ jsonrpc: "2.0", id: 1, method: "ping" }));
    assert.equal(oversized.error.code, -32600);
  } finally {
    await fx.db.close();
  }
});

test("rate limiter fails closed at the window edge", () => {
  resetRateLimits();
  const at = 1_700_000_000_000;
  for (let index = 0; index < 120; index += 1) {
    assert.equal(checkRateLimit("client", at + index).allowed, true);
  }
  const denied = checkRateLimit("client", at + 120);
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfterSeconds >= 1);
  assert.equal(checkRateLimit("other", at + 120).allowed, true);
  resetRateLimits();
});

test("AF-SEC-00: forged cross-workspace artifact reads and saves fail closed", async () => {
  const db = await openDatabase();
  try {
    await migrateUp(db);
    const { createWorkspace } = await import("../../../packages/db/src/workspaces.ts");
    const ownerA = await signUp(db, { email: "af-mcp-a@skilit.example", password: "af-password-01" });
    const ownerB = await signUp(db, { email: "af-mcp-b@skilit.example", password: "af-password-01" });
    const spaceA = await createWorkspace(db, { name: "AF MCP A", ownerId: ownerA.id });
    const source = await createSource(db, { key: "af-mcp-source", kind: "synthetic" });
    const priv = await createArtifact(db, {
      sourceId: source.id,
      kind: "screen",
      title: "AF MCP private",
      contentHash: "d".repeat(64),
      rightsClassification: "metadata_only",
      visibility: "private",
      workspaceId: spaceA.workspace.id,
      ownerSubject: ownerA.id,
    });
    const ctxA = { userId: ownerA.id };
    const ctxB = { userId: ownerB.id };
    const allowed = await call(db, ctxA, "tools/call", {
      name: "get_object",
      arguments: { uri: `skilit://artifact/${priv.id}` },
    });
    assert.equal(JSON.parse(allowed.result.content[0].text).result.object.title, "AF MCP private");
    const denied = await call(db, ctxB, "tools/call", {
      name: "get_object",
      arguments: { uri: `skilit://artifact/${priv.id}` },
    });
    // Opaque failure: identical to a missing object, no existence oracle.
    assert.equal(denied.error.code, -32000);
    const packB = await createReferencePackForTest(db, ownerB);
    const launder = await call(db, ctxB, "tools/call", {
      name: "save_reference",
      arguments: { collectionId: packB, artifactId: priv.id },
    });
    assert.equal(launder.error.code, -32000);
  } finally {
    await db.close();
  }
});

async function createReferencePackForTest(db, owner) {
  const { createWorkspace } = await import("../../../packages/db/src/workspaces.ts");
  const { createReferencePack } = await import("../lib/reference-packs.ts");
  const space = await createWorkspace(db, { name: `AF pack ${owner.id.slice(0, 8)}`, ownerId: owner.id });
  const pack = await createReferencePack(db, {
    workspaceId: space.workspace.id,
    title: "AF attacker pack",
    actorId: owner.id,
  });
  return pack.collectionId;
}
