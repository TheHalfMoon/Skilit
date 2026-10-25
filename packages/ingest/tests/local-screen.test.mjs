import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openDatabase } from "../../db/src/db.ts";
import { migrateUp } from "../../db/src/migrate.ts";
import { createSource } from "../../db/src/repositories.ts";
import { signUp } from "../../db/src/auth.ts";
import { createWorkspace } from "../../db/src/workspaces.ts";
import { LocalContentAddressedStorage } from "../../storage/src/storage.ts";
import { loadResearchScreenPreview } from "../../../apps/web/lib/research-preview.ts";
import { LocalScreenError, publishLocalResearchScreen, validateLocalScreenManifest } from "../src/local-screen.ts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9K7b0AAAAASUVORK5CYII=",
  "base64",
);
const revision = "fe".repeat(20);
const rightsEvidence = {
  originUrl: "https://example.invalid/owned/screens/" + revision + "/view.png",
  sourceRevision: revision,
  rightsHolder: "Synthetic Curator",
  rightsBasis: "author-owned",
  licenseId: "CC0-1.0",
  licenseEvidenceUrl: "https://example.invalid/owned/screens/" + revision + "/LICENSE",
  reviewRef: "operator-local-fixture",
};
async function fixture() {
  const db = await openDatabase();
  await migrateUp(db);
  const source = await createSource(db, { key: "local-curator-test", kind: "synthetic" });
  const owner = await signUp(db, { email: "local-owner@skilit.invalid", password: "test-operator-only-2026" });
  const outsider = await signUp(db, { email: "local-outsider@skilit.invalid", password: "test-operator-only-2026" });
  const space = await createWorkspace(db, { name: "Local research", ownerId: owner.id });
  const root = await mkdtemp(join(tmpdir(), "skilit-curator-test-"));
  const storage = new LocalContentAddressedStorage({ rootDir: root, maxBytes: 4 * 1024 * 1024 });
  const manifest = {
    sourceId: source.id, workspaceId: space.workspace.id,
    ownerSubject: owner.id, title: "Original checkout",
    previewApproved: true, mediaType: "image/png",
    rightsEvidence,
  };
  return { db, source, owner, outsider, space, root, storage, manifest };
}
async function teardown(fx) {
  await fx.db.close();
  await rm(fx.root, { recursive: true, force: true });
}

test("G32 operator publishes actual locally stored screen bytes readable only to workspace owner", async () => {
  const fx = await fixture();
  try {
    const published = await publishLocalResearchScreen(fx.db, fx.storage, fx.manifest, png);
    assert.ok(published.assetId);
    const ownerPreview = await loadResearchScreenPreview(
      fx.db, fx.storage, fx.owner.id, published.artifactId,
    );
    assert.equal(ownerPreview?.mediaType, "image/png");
    assert.deepEqual(Buffer.from(ownerPreview.bytes), png);
    assert.equal(await loadResearchScreenPreview(
      fx.db, fx.storage, fx.outsider.id, published.artifactId,
    ), null);
    const row = await fx.db.query("select metadata,visibility from artifacts where id=$1", [published.artifactId]);
    assert.equal(row.rows[0].visibility, "private");
    assert.equal(row.rows[0].metadata.previewApproved, true);
    assert.equal(row.rows[0].metadata.curatorOrigin, "local-operator");
  } finally { await teardown(fx); }
});

test("G32 curator rejects malformed manifest, unapproved rights and executable media before writing", async () => {
  const fx = await fixture();
  try {
    const bad = [
      { ...fx.manifest, previewApproved: false },
      { ...fx.manifest, mediaType: "image/svg+xml" },
      { ...fx.manifest, rightsEvidence: { ...rightsEvidence, licenseId: "unknown" } },
      { ...fx.manifest, extraField: "inject" },
      { ...fx.manifest, sourceId: "not-a-uuid" },
    ];
    for (const value of bad) {
      assert.throws(() => validateLocalScreenManifest(value, png));
      await assert.rejects(() => publishLocalResearchScreen(fx.db, fx.storage, value, png));
    }
    for (const bytes of [
      Buffer.from('<svg onload="alert(1)" />'),
      Buffer.from("not an image but called png"),
      Buffer.alloc(4 * 1024 * 1024 + 1),
    ]) {
      await assert.rejects(() => publishLocalResearchScreen(fx.db, fx.storage, fx.manifest, bytes));
    }
    const rows = await fx.db.query("select count(*)::int as n from artifacts");
    assert.equal(rows.rows[0].n, 0);
  } finally { await teardown(fx); }
});

test("G32 actor from another workspace cannot self-approve operator screen import", async () => {
  const fx = await fixture();
  try {
    await assert.rejects(
      () => publishLocalResearchScreen(fx.db, fx.storage,
        { ...fx.manifest, ownerSubject: fx.outsider.id }, png),
      (error) => error instanceof LocalScreenError,
    );
    const count = await fx.db.query("select count(*)::int as n from artifacts");
    assert.equal(count.rows[0].n, 0);
  } finally { await teardown(fx); }
});
