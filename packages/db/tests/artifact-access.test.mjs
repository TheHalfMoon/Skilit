import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateUp } from "../src/migrate.ts";
import { AuthError, signUp } from "../src/auth.ts";
import { addMember, createWorkspace } from "../src/workspaces.ts";
import { createSource } from "../src/repositories.ts";
import { createArtifact } from "../src/graph.ts";
import { getArtifactForActor } from "../src/artifact-access.ts";
import {
  createCollection,
  listReferences,
  saveReference,
} from "../src/collections.ts";

/**
 * AF-SEC-00 actor-scoped artifact authorization: negative regression suite.
 *
 * Every denied read returns null from the gate (callers map to 404 or an
 * opaque failure) — never a distinct "exists but forbidden" oracle.
 * Titles and rights labels are treated as private metadata, not as safe
 * to leak when bytes are withheld.
 */

async function setup() {
  const db = await openDatabase();
  await migrateUp(db);
  const ownerA = await signUp(db, { email: "af-a@skilit.example", password: "af-password-01" });
  const ownerB = await signUp(db, { email: "af-b@skilit.example", password: "af-password-01" });
  const spaceA = await createWorkspace(db, { name: "AF space A", ownerId: ownerA.id });
  const spaceB = await createWorkspace(db, { name: "AF space B", ownerId: ownerB.id });
  const source = await createSource(db, { key: "af-source", kind: "synthetic" });
  return { db, ownerA, ownerB, spaceA, spaceB, source };
}

let hashCounter = 0;
function freshHash() {
  hashCounter += 1;
  const base = hashCounter.toString(16).padStart(4, "0");
  return (base.repeat(16)).slice(0, 64);
}

test("private workspace artifact is owner-only; outsiders and members denied", async () => {
  const { db, ownerA, ownerB, spaceA } = await setup();
  try {
    const source = (await db.query("select id from sources where key='af-source'")).rows[0];
    const priv = await createArtifact(db, {
      kind: "screen",
      title: "AF private evidence",
      sourceId: String(source.id),
      contentHash: freshHash(),
      rightsClassification: "metadata_only",
      visibility: "private",
      workspaceId: spaceA.workspace.id,
      ownerSubject: ownerA.id,
    });
    // Owner reads.
    assert.equal((await getArtifactForActor(db, priv.id, ownerA.id))?.id, priv.id);
    // Outsider (other workspace owner) denied with no oracle.
    assert.equal(await getArtifactForActor(db, priv.id, ownerB.id), null);
    // Malformed actor and artifact IDs denied alike.
    assert.equal(await getArtifactForActor(db, priv.id, "not-a-uuid"), null);
    assert.equal(await getArtifactForActor(db, "not-a-uuid", ownerA.id), null);
    assert.equal(
      await getArtifactForActor(db, "11111111-2222-4333-8444-555555555555", ownerA.id),
      null,
    );
  } finally {
    await db.close();
  }
});

test("workspace-visible artifact admits members but denies outsiders", async () => {
  const { db, ownerA, ownerB, spaceA } = await setup();
  try {
    const source = (await db.query("select id from sources where key='af-source'")).rows[0];
    const member = await signUp(db, { email: "af-member@skilit.example", password: "af-password-01" });
    await addMember(db, {
      workspaceId: spaceA.workspace.id,
      userId: member.id,
      role: "member",
      actorId: ownerA.id,
    });
    const team = await createArtifact(db, {
      kind: "screen",
      title: "AF team evidence",
      sourceId: String(source.id),
      contentHash: freshHash(),
      rightsClassification: "metadata_only",
      visibility: "workspace",
      workspaceId: spaceA.workspace.id,
      ownerSubject: ownerA.id,
    });
    assert.equal((await getArtifactForActor(db, team.id, ownerA.id))?.id, team.id);
    assert.equal((await getArtifactForActor(db, team.id, member.id))?.id, team.id);
    assert.equal(await getArtifactForActor(db, team.id, ownerB.id), null);
  } finally {
    await db.close();
  }
});

test("P10-G25 workspace-bound public metadata requires membership before all reads", async () => {
  const { db, ownerA, ownerB, spaceA, spaceB, source } = await setup();
  try {
    const member = await signUp(db, {
      email: "af-public-member@skilit.example", password: "af-password-01",
    });
    await addMember(db, {
      workspaceId: spaceA.workspace.id, userId: member.id,
      role: "member", actorId: ownerA.id,
    });
    const record = await createArtifact(db, {
      kind: "screen",
      title: "AF Public Workspace Membership Boundary",
      sourceId: source.id,
      contentHash: freshHash(),
      rightsClassification: "permitted",
      visibility: "public",
      workspaceId: spaceA.workspace.id,
      ownerSubject: ownerA.id,
    });
    // Every authorized workspace role reads the record, despite visibility
    // being public *inside* that workspace.
    assert.equal((await getArtifactForActor(db, record.id, ownerA.id))?.id, record.id);
    assert.equal((await getArtifactForActor(db, record.id, member.id))?.id, record.id);
    // An authenticated user who owns a DIFFERENT workspace must not read
    // even title/rights metadata. Null also matches missing object semantics.
    assert.equal(await getArtifactForActor(db, record.id, ownerB.id), null);
    assert.equal(await getArtifactForActor(db,
      "11111111-2222-4333-8444-555555555555", ownerB.id), null);
    const externalBoard = await createCollection(db, {
      workspaceId: spaceB.workspace.id,
      title: "Outside Public Board",
      visibility: "workspace",
      actorId: ownerB.id,
    });
    await assert.rejects(
      () => saveReference(db, {
        collectionId: externalBoard.id, artifactId: record.id, actorId: ownerB.id,
      }),
      (error) => error instanceof AuthError && error.code === "auth/artifact-not-found",
      "unrelated workspace cannot import a public-labeled workspace artifact",
    );
    assert.deepEqual(await listReferences(db, externalBoard.id, ownerB.id), []);

    // The find_similar SQL candidate gate used to have a second public
    // shortcut. Even if get_object denies the workspace artifact, leaking
    // its title/score/count in similarity is a metadata disclosure.
    const { findSimilarForActor } = await import("../../assets/src/similarity.ts");
    const globalReference = await createArtifact(db, {
      kind: "screen", title: "AF Public Workspace Membership Boundary",
      sourceId: source.id, contentHash: freshHash(),
      rightsClassification: "permitted", visibility: "public",
    });
    const outsiderSimilarity = await findSimilarForActor(db, {
      artifactId: globalReference.id, actorId: ownerB.id,
      kinds: ["screen"],
    });
    assert.equal(outsiderSimilarity.total, 0, "similarity count must not expose a foreign workspace");
    assert.deepEqual(outsiderSimilarity.similar, []);
    const memberSimilarity = await findSimilarForActor(db, {
      artifactId: globalReference.id, actorId: member.id,
      kinds: ["screen"],
    });
    assert.equal(memberSimilarity.total, 1);
    assert.equal(memberSimilarity.similar[0].artifactId, record.id);
  } finally {
    await db.close();
  }
});

test("non-public global screen is denied by ID to every actor", async () => {
  const { db, ownerA, ownerB } = await setup();
  try {
    const source = (await db.query("select id from sources where key='af-source'")).rows[0];
    const legacy = await createArtifact(db, {
      kind: "screen",
      title: "AF legacy private screen",
      sourceId: String(source.id),
      contentHash: freshHash(),
      rightsClassification: "metadata_only",
    });
    assert.equal(legacy.workspaceId, undefined);
    assert.equal(await getArtifactForActor(db, legacy.id, ownerA.id), null);
    assert.equal(await getArtifactForActor(db, legacy.id, ownerB.id), null);
  } finally {
    await db.close();
  }
});

test("global registry icon stays readable (curated corpus, bytes gated separately)", async () => {
  const { db, ownerA, ownerB } = await setup();
  try {
    const source = (await db.query("select id from sources where key='af-source'")).rows[0];
    const icon = await createArtifact(db, {
      kind: "icon",
      title: "AF global icon",
      sourceId: String(source.id),
      contentHash: freshHash(),
      rightsClassification: "permitted",
    });
    assert.equal((await getArtifactForActor(db, icon.id, ownerA.id))?.id, icon.id);
    assert.equal((await getArtifactForActor(db, icon.id, ownerB.id))?.id, icon.id);
  } finally {
    await db.close();
  }
});

test("saveReference cannot launder another workspace's private artifact", async () => {
  const { db, ownerA, ownerB, spaceA, spaceB } = await setup();
  try {
    const source = (await db.query("select id from sources where key='af-source'")).rows[0];
    const priv = await createArtifact(db, {
      kind: "screen",
      title: "AF launder target",
      sourceId: String(source.id),
      contentHash: freshHash(),
      rightsClassification: "metadata_only",
      visibility: "private",
      workspaceId: spaceA.workspace.id,
      ownerSubject: ownerA.id,
    });
    const attackerCollection = await createCollection(db, {
      workspaceId: spaceB.workspace.id,
      title: "Attacker board",
      visibility: "workspace",
      actorId: ownerB.id,
    });
    // Same generic error as a missing artifact: no collection-state oracle.
    await assert.rejects(
      () => saveReference(db, { collectionId: attackerCollection.id, artifactId: priv.id, actorId: ownerB.id }),
      (error) => error instanceof AuthError && error.code === "auth/artifact-not-found",
    );
    assert.deepEqual(await listReferences(db, attackerCollection.id, ownerB.id), []);
    // The owner can still save their own private artifact in their workspace.
    const ownerCollection = await createCollection(db, {
      workspaceId: spaceA.workspace.id,
      title: "Owner board",
      visibility: "workspace",
      actorId: ownerA.id,
    });
    const saved = await saveReference(db, {
      collectionId: ownerCollection.id,
      artifactId: priv.id,
      actorId: ownerA.id,
    });
    assert.equal(saved.artifactId, priv.id);
  } finally {
    await db.close();
  }
});

test("registry search scopes workspace rows to members; unscoped sees global only", async () => {
  const { db, ownerA, ownerB, spaceA } = await setup();
  try {
    const { registerAsset, searchAssets, searchAssetsForActor } = await import(
      "../../assets/src/registry.ts"
    );
    const source = (await db.query("select id from sources where key='af-source'")).rows[0];
    const sourceId = String(source.id);
    await registerAsset(db, {
      kind: "icon",
      title: "AF scoped globe icon",
      sourceId,
      contentHash: freshHash(),
      rightsClassification: "permitted",
      visibility: "public",
      metadata: { collection: "af-scope", ref: "globe", tags: ["af-scope"], license: "MIT" },
      asset: { sha256: freshHash(), mediaType: "image/svg+xml", byteLength: 64, storageKey: "sha256/af/globe" },
    });
    await registerAsset(db, {
      kind: "icon",
      title: "AF scoped team icon",
      sourceId,
      contentHash: freshHash(),
      rightsClassification: "permitted",
      visibility: "workspace",
      workspaceId: spaceA.workspace.id,
      ownerSubject: ownerA.id,
      metadata: { collection: "af-scope", ref: "team", tags: ["af-scope"], license: "MIT" },
      asset: { sha256: freshHash(), mediaType: "image/svg+xml", byteLength: 64, storageKey: "sha256/af/team" },
    });
    const unscoped = await searchAssets(db, { query: "af-scope" });
    assert.equal(unscoped.length, 1);
    assert.equal(unscoped[0].title, "AF scoped globe icon");
    const memberView = await searchAssetsForActor(db, { query: "af-scope" }, ownerA.id);
    assert.equal(memberView.length, 2);
    const outsiderView = await searchAssetsForActor(db, { query: "af-scope" }, ownerB.id);
    assert.equal(outsiderView.length, 1);
    assert.equal(outsiderView[0].title, "AF scoped globe icon");
  } finally {
    await db.close();
  }
});

test("resolveAssetForActor gates workspace-bound bytes; unscoped serves global only", async () => {
  const { db, ownerA, ownerB, spaceA } = await setup();
  try {
    const { registerAsset, resolveAsset, resolveAssetForActor, RegistryError } = await import(
      "../../assets/src/registry.ts"
    );
    const source = (await db.query("select id from sources where key='af-source'")).rows[0];
    const sourceId = String(source.id);
    const team = await registerAsset(db, {
      kind: "icon",
      title: "AF gated team icon",
      sourceId,
      contentHash: freshHash(),
      rightsClassification: "permitted",
      visibility: "workspace",
      workspaceId: spaceA.workspace.id,
      ownerSubject: ownerA.id,
      metadata: { collection: "af-gate", ref: "team", tags: ["af-gate"], license: "MIT" },
      asset: { sha256: freshHash(), mediaType: "image/svg+xml", byteLength: 64, storageKey: "sha256/af/gated" },
    });
    assert.equal((await resolveAssetForActor(db, team.artifactId, ownerA.id)).artifactId, team.artifactId);
    await assert.rejects(
      () => resolveAssetForActor(db, team.artifactId, ownerB.id),
      (error) => error instanceof RegistryError && error.code === "assets/not-found",
    );
    await assert.rejects(
      () => resolveAsset(db, team.artifactId),
      (error) => error instanceof RegistryError && error.code === "assets/not-found",
    );
  } finally {
    await db.close();
  }
});
