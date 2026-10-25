import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openDatabase } from "../../../packages/db/src/db.ts";
import { migrateUp } from "../../../packages/db/src/migrate.ts";
import { createSource } from "../../../packages/db/src/repositories.ts";
import { createArtifact } from "../../../packages/db/src/graph.ts";
import { signUp } from "../../../packages/db/src/auth.ts";
import { createWorkspace } from "../../../packages/db/src/workspaces.ts";
import { LocalContentAddressedStorage } from "../../../packages/storage/src/storage.ts";
import { publishArtifact } from "../../../packages/ingest/src/pipeline.ts";
import { loadResearchScreenPreview } from "../lib/research-preview.ts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9K7b0AAAAASUVORK5CYII=",
  "base64",
);
const revision = "ab".repeat(20);
const rightsEvidence = {
  originUrl: `https://example.invalid/screens/${revision}/screenshot.png`,
  sourceRevision: revision,
  rightsHolder: "Synthetic Test Author",
  rightsBasis: "author-owned",
  licenseId: "CC0-1.0",
  licenseEvidenceUrl: `https://example.invalid/screens/${revision}/LICENSE`,
  reviewRef: "skilit-image-synthetic-only",
};

async function fixture() {
  const db = await openDatabase();
  await migrateUp(db);
  const root = await mkdtemp(join(tmpdir(), "skilit-screen-preview-"));
  const storage = new LocalContentAddressedStorage({ rootDir: root, maxBytes: 4 * 1024 * 1024 });
  const source = await createSource(db, { key: "screen-preview-source", kind: "synthetic" });
  const owner = await signUp(db, { email: "screen-owner@skilit.invalid", password: "test-only-pass-2026" });
  const outsider = await signUp(db, { email: "screen-outsider@skilit.invalid", password: "test-only-pass-2026" });
  const workspace = await createWorkspace(db, { name: "Private screenshots", ownerId: owner.id });
  return { db, root, storage, source, owner, outsider, workspace };
}
async function close(fx) {
  await fx.db.close();
  await rm(fx.root, { force: true, recursive: true });
}

async function publish(fx, options = {}) {
  return publishArtifact(fx.db, fx.storage, {
    sourceId: fx.source.id,
    kind: "screen",
    title: "Checkout image",
    rightsClassification: "permitted",
    visibility: "private",
    workspaceId: fx.workspace.workspace.id,
    ownerSubject: fx.owner.id,
    asset: { bytes: png, mediaType: "image/png" },
    metadata: { rightsEvidence, previewApproved: true },
    ...options,
  });
}

test("G31 stores approved PNG and only serves verified image to its workspace owner", async () => {
  const fx = await fixture();
  try {
    const item = await publish(fx);
    assert.ok(item.assetId);
    const view = await loadResearchScreenPreview(fx.db, fx.storage, fx.owner.id, item.artifactId);
    assert.ok(view);
    assert.equal(view.mediaType, "image/png");
    assert.deepEqual(Buffer.from(view.bytes), png);
    const outsider = await loadResearchScreenPreview(fx.db, fx.storage, fx.outsider.id, item.artifactId);
    const missing = await loadResearchScreenPreview(
      fx.db, fx.storage, fx.outsider.id, "11111111-2222-4333-8444-555555555555",
    );
    assert.equal(outsider, null);
    assert.equal(missing, null);
  } finally { await close(fx); }
});

test("G31 refuses unsigned, unapproved or unlicensed screen bytes before opening storage", async () => {
  const fx = await fixture();
  try {
    const approved = await publish(fx);
    const noEvidence = await publish(fx, { metadata: { previewApproved: true } });
    const noApproval = await publish(fx, { metadata: { rightsEvidence, previewApproved: false } });
    const badLicense = await publish(fx, { metadata: { rightsEvidence: { ...rightsEvidence, licenseId: "unknown" }, previewApproved: true } });
    const noBytes = await createArtifact(fx.db, {
      sourceId: fx.source.id,
      kind: "screen", title: "Metadata-only screenshot",
      contentHash: "e".repeat(64), rightsClassification: "permitted",
      visibility: "private", workspaceId: fx.workspace.workspace.id,
      ownerSubject: fx.owner.id,
      metadata: { rightsEvidence, previewApproved: true },
    });
    const blocked = [noEvidence.artifactId, noApproval.artifactId, badLicense.artifactId, noBytes.id];
    const mustNotOpen = { readVerified: async function* () { throw new Error("Must not read unauthorized image"); } };
    for (const id of blocked) {
      assert.equal(await loadResearchScreenPreview(fx.db, mustNotOpen, fx.owner.id, id), null);
    }
    assert.ok(await loadResearchScreenPreview(fx.db, fx.storage, fx.owner.id, approved.artifactId));
  } finally { await close(fx); }
});

test("G31 blocks executable SVG and media signatures inconsistent with the recorded mime type", async () => {
  const fx = await fixture();
  try {
    const svg = await publish(fx, {
      asset: { bytes: Buffer.from('<svg onload="alert(1)" />'), mediaType: "image/svg+xml" },
    });
    assert.equal(await loadResearchScreenPreview(fx.db, fx.storage, fx.owner.id, svg.artifactId), null);
    const spoofed = await publish(fx, {
      asset: { bytes: Buffer.from("this is not an actual PNG file"), mediaType: "image/png" },
    });
    await assert.rejects(
      () => loadResearchScreenPreview(fx.db, fx.storage, fx.owner.id, spoofed.artifactId),
      /media signature/,
    );
  } finally { await close(fx); }
});
