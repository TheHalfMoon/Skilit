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
import { publishCuratedResearchImage, CuratedResearchImageError } from "../src/research-image.ts";
import { loadResearchScreenPreview } from "../../../apps/web/lib/research-preview.ts";
import { searchAssetsRoute } from "../../../apps/web/lib/rest.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9K7b0AAAAASUVORK5CYII=", "base64");
const rev = "ab".repeat(20);
const evidence = {
  originUrl: "https://example.invalid/approved/screen.png",
  sourceRevision: rev,
  rightsHolder: "Synthetic Skilit Fixture",
  rightsBasis: "author-owned",
  licenseId: "CC0-1.0",
  licenseEvidenceUrl: "https://example.invalid/approved/LICENSE",
  reviewRef: "skilit-g32-synthetic",
};

async function fixture() {
  const db = await openDatabase();
  await migrateUp(db);
  const root = await mkdtemp(join(tmpdir(), "skilit-curator-intake-"));
  const storage = new LocalContentAddressedStorage({ rootDir: root, maxBytes: 4 * 1024 * 1024 });
  const source = await createSource(db, { key: "synthetic-curator-g32", kind: "synthetic" });
  const owner = await signUp(db, { email: "curator-owner@skilit.invalid", password: "test-pass-g32-2026" });
  const outsider = await signUp(db, { email: "curator-outsider@skilit.invalid", password: "test-pass-g32-2026" });
  const workspace = await createWorkspace(db, { name: "Curated screenshot QA", ownerId: owner.id });
  return { db, root, storage, source, owner, outsider, workspace };
}
async function close(fx) {
  await fx.db.close();
  await rm(fx.root, { force: true, recursive: true });
}
function input(fx, changes = {}) {
  return {
    sourceId: fx.source.id,
    workspaceId: fx.workspace.workspace.id,
    curatorId: fx.owner.id,
    title: "Approved checkout screen G32",
    mediaType: "image/png",
    imageBytes: png,
    rightsEvidence: evidence,
    previewApproved: true,
    ...changes,
  };
}
async function count(fx) {
  const rows = await fx.db.query("select count(*)::int as n from artifacts where kind='screen'");
  return Number(rows.rows[0].n);
}

test("G32 operator curator imports an approved screen and authenticated owner can view its real bytes", async () => {
  const fx = await fixture();
  try {
    const publication = await publishCuratedResearchImage(fx.db, fx.storage, input(fx));
    assert.equal(publication.status, "published");
    assert.ok(publication.assetId);
    assert.equal(await count(fx), 1);
    const view = await loadResearchScreenPreview(fx.db, fx.storage, fx.owner.id, publication.artifactId);
    assert.equal(view?.mediaType, "image/png");
    assert.deepEqual(Buffer.from(view.bytes), png);
    const hidden = await loadResearchScreenPreview(fx.db, fx.storage, fx.outsider.id, publication.artifactId);
    assert.equal(hidden, null);
    const listing = await searchAssetsRoute(fx.db, {
      query: "Approved checkout screen", kinds: "screen",
    }, fx.owner.id);
    assert.equal(listing.status, 200);
    assert.ok(listing.body.result.assets.some((art) => art.title === "Approved checkout screen G32"));
  } finally { await close(fx); }
});

test("G32 rejects a non-admin before storage IO and writes no artifact", async () => {
  const fx = await fixture();
  try {
    const storage = { put: async () => { throw new Error("unauthorized storage write"); } };
    await assert.rejects(
      publishCuratedResearchImage(fx.db, storage, input(fx, { curatorId: fx.outsider.id })),
    );
    assert.equal(await count(fx), 0);
  } finally { await close(fx); }
});

test("G32 declines invalid rights, spoofed media, missing approval and out-of-budget bytes before storage", async () => {
  const fx = await fixture();
  try {
    const bad = [
      { previewApproved: false },
      { rightsEvidence: undefined },
      { rightsEvidence: { ...evidence, licenseId: "Unreviewed" } },
      { rightsEvidence: { ...evidence, originUrl: "http://insecure.invalid/img" } },
      { mediaType: "image/svg+xml", imageBytes: Buffer.from("<svg/>") },
      { mediaType: "image/png", imageBytes: Buffer.from("not an image".repeat(3)) },
      { imageBytes: Buffer.alloc(4 * 1024 * 1024 + 1) },
      { visibility: "public" },
    ];
    const storage = { put: async () => { throw new Error("invalid storage write"); } };
    for (const item of bad) {
      await assert.rejects(
        publishCuratedResearchImage(fx.db, storage, input(fx, item)),
        CuratedResearchImageError,
      );
    }
    assert.equal(await count(fx), 0);
  } finally { await close(fx); }
});

test("G32 membership and source checks precede bytes publication transactionally", async () => {
  const fx = await fixture();
  try {
    const storage = { put: async () => { throw new Error("should not read bytes"); } };
    await assert.rejects(
      publishCuratedResearchImage(fx.db, storage, input(fx, {
        sourceId: "11111111-2222-4333-8444-555555555555",
      })),
      /Source was not found/,
    );
    assert.equal(await count(fx), 0);
  } finally { await close(fx); }
});

test("G32 documented operator CLI writes to persistent local PGlite + media root", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname, resolve } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "skilit-curator-cli-"));
  try {
    const dbDir = join(root, "pglite");
    const mediaDir = join(root, "media");
    await mkdir(dbDir, { mode: 0o700 });
    const db = await openDatabase({ dataDir: dbDir });
    await migrateUp(db);
    const source = await createSource(db, { key: "synthetic-cli-source", kind: "synthetic" });
    const owner = await signUp(db, { email: "cli-owner@skilit.invalid", password: "test-cli-password-2026" });
    const workspace = await createWorkspace(db, { name: "CLI research imagery", ownerId: owner.id });
    await db.close();
    const manifestPath = join(root, "manifest.json");
    const imagePath = join(root, "image.png");
    await writeFile(imagePath, png);
    await writeFile(manifestPath, JSON.stringify({
      sourceId: source.id,
      workspaceId: workspace.workspace.id,
      curatorId: owner.id,
      title: "Real local CLI fixture",
      mediaType: "image/png",
      rightsEvidence: evidence,
      previewApproved: true,
      visibility: "workspace",
    }));
    const testPath = fileURLToPath(import.meta.url);
    const repoRoot = resolve(dirname(testPath), "../../..");
    const env = { ...process.env,
      SKILIT_MCP_PGLITE_DATA_DIR: dbDir,
      SKILIT_RESEARCH_MEDIA_ROOT: mediaDir,
    };
    delete env.SKILIT_MCP_DATABASE_URL;
    delete env.SKELET_MCP_DATABASE_URL;
    const child = spawnSync(process.execPath, [
      "--experimental-strip-types",
      join(repoRoot, "scripts/import_curated_image.mjs"), manifestPath, imagePath,
    ], { cwd: repoRoot, env, encoding: "utf8", timeout: 30_000 });
    assert.equal(child.status, 0, "CLI refused a locally valid image: " + child.stderr);
    const output = JSON.parse(child.stdout);
    assert.ok(output.artifactId);
    const verifyDb = await openDatabase({ dataDir: dbDir });
    try {
      const storage = new LocalContentAddressedStorage({
        rootDir: mediaDir, maxBytes: 4 * 1024 * 1024,
      });
      const preview = await loadResearchScreenPreview(verifyDb, storage, owner.id, output.artifactId);
      assert.deepEqual(Buffer.from(preview?.bytes ?? []), png);
    } finally { await verifyDb.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
