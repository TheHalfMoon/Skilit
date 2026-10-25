import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../../packages/db/src/db.ts";
import { migrateUp } from "../../../packages/db/src/migrate.ts";
import { createSource } from "../../../packages/db/src/repositories.ts";
import { createArtifact } from "../../../packages/db/src/graph.ts";
import { addMember, createWorkspace } from "../../../packages/db/src/workspaces.ts";
import { signUp } from "../../../packages/db/src/auth.ts";
import { dispatchMcp } from "../lib/mcp.ts";
import { getObjectRoute } from "../lib/rest.ts";

async function setup() {
  const db = await openDatabase();
  await migrateUp(db);
  const owner = await signUp(db, { email: "scope-owner@skilit.invalid", password: "scope-pass-001" });
  const outsider = await signUp(db, { email: "scope-outsider@skilit.invalid", password: "scope-pass-001" });
  const member = await signUp(db, { email: "scope-member@skilit.invalid", password: "scope-pass-001" });
  const workspace = await createWorkspace(db, { name: "Public Workspace Boundary", ownerId: owner.id });
  await addMember(db, {
    workspaceId: workspace.workspace.id, userId: member.id,
    actorId: owner.id, role: "member",
  });
  const source = await createSource(db, { key: "scope-public-fixture", kind: "synthetic" });
  const workspacePublic = await createArtifact(db, {
    kind: "screen", title: "Private Organization Public Label",
    sourceId: source.id, contentHash: "a".repeat(64),
    rightsClassification: "permitted", visibility: "public",
    workspaceId: workspace.workspace.id, ownerSubject: owner.id,
  });
  const globalPublic = await createArtifact(db, {
    kind: "screen", title: "Global Public Artifact Label",
    sourceId: source.id, contentHash: "b".repeat(64),
    rightsClassification: "permitted", visibility: "public",
  });
  return { db, owner, outsider, member, workspacePublic, globalPublic };
}

async function mcpCall(db, actorId, uri) {
  const reply = await dispatchMcp(
    db,
    { userId: actorId, capabilities: { packs: true, registry: true } },
    { jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "get_object", arguments: { uri } } },
  );
  const success = reply.result?.content?.[0]?.text;
  return success ? JSON.parse(success) : reply.error?.data?.envelope;
}

test("P10-G25 REST and MCP refuse workspace-public metadata to nonmembers without an existence oracle", async () => {
  const fx = await setup();
  try {
    const uri = `skilit://artifact/${fx.workspacePublic.id}`;
    const missingUri = "skilit://artifact/11111111-2222-4333-8444-555555555555";
    const outsider = await getObjectRoute(fx.db, uri, fx.outsider.id);
    const absent = await getObjectRoute(fx.db, missingUri, fx.outsider.id);
    assert.equal(outsider.status, 404);
    assert.equal(absent.status, 404);
    assert.equal(outsider.body.error.code, "FORBIDDEN_OR_NOT_FOUND");
    assert.deepEqual(outsider.body.error, absent.body.error);
    assert.ok(!JSON.stringify(outsider).includes("Private Organization Public Label"));

    const mcpDenied = await mcpCall(fx.db, fx.outsider.id, uri);
    const mcpMissing = await mcpCall(fx.db, fx.outsider.id, missingUri);
    assert.equal(mcpDenied.error.code, "FORBIDDEN_OR_NOT_FOUND");
    assert.deepEqual(mcpDenied.error, mcpMissing.error);
    assert.ok(!JSON.stringify(mcpDenied).includes("Private Organization Public Label"));

    for (const actorId of [fx.owner.id, fx.member.id]) {
      const rest = await getObjectRoute(fx.db, uri, actorId);
      const mcp = await mcpCall(fx.db, actorId, uri);
      assert.equal(rest.status, 200);
      assert.equal(rest.body.result.object.title, "Private Organization Public Label");
      assert.deepEqual(mcp.result.object, rest.body.result.object);
    }
  } finally {
    await fx.db.close();
  }
});

test("P10-G25 truly global-public records remain available to any authenticated actor", async () => {
  const fx = await setup();
  try {
    const uri = `skilit://artifact/${fx.globalPublic.id}`;
    for (const actor of [fx.owner, fx.outsider, fx.member]) {
      const rest = await getObjectRoute(fx.db, uri, actor.id);
      const mcp = await mcpCall(fx.db, actor.id, uri);
      assert.equal(rest.status, 200);
      assert.equal(mcp.result.object.title, "Global Public Artifact Label");
    }
  } finally {
    await fx.db.close();
  }
});
