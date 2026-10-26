import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { openDatabase } from "../../db/src/db.ts";
import { migrateUp } from "../../db/src/migrate.ts";
import { createSource } from "../../db/src/repositories.ts";
import { signUp } from "../../db/src/auth.ts";
import { createWorkspace } from "../../db/src/workspaces.ts";
import { LocalContentAddressedStorage } from "../../storage/src/storage.ts";
import { loadResearchScreenPreview } from "../../../apps/web/lib/research-preview.ts";
import {
  planCuratedImageBatch,
  CuratedBatchError, CURATED_BATCH_VERSION,
} from "../src/research-batch.ts";

const hash = (b) => createHash("sha256").update(b).digest("hex");
const rev = "ab".repeat(20);
const rightsEvidence = {
  originUrl: "https://example.invalid/approved/screenshot",
  sourceRevision: rev,
  rightsHolder: "Synthetic Skilit Fixture",
  rightsBasis: "author-owned",
  licenseId: "CC0-1.0",
  licenseEvidenceUrl: "https://example.invalid/approved/license",
  reviewRef: "skilit-g34-fixture",
};
const U1 = "11111111-2222-4333-8444-555555555555";
const U2 = "22222222-3333-4444-8555-666666666666";
const U3 = "33333333-4444-4555-8666-777777777777";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI = join(ROOT, "scripts/import_curated_images.mjs");

function chunk(name, payload) {
  const type = Buffer.from(name);
  const data = Buffer.concat([type, payload]);
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const head = Buffer.alloc(4);
  head.writeUInt32BE(payload.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, type, payload, tail]);
}
function pixelPng(v) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from([0, v, 30, 80, 255]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const first = pixelPng(10);
const second = pixelPng(200);

function manifest(entries = [
  { relativePath: "screens/first.png", sha256: hash(first), title: "Synthetic checkout first",
    mediaType: "image/png", rightsEvidence, previewApproved: true },
  { relativePath: "screens/second.png", sha256: hash(second), title: "Synthetic checkout second",
    mediaType: "image/png", rightsEvidence, previewApproved: true, visibility: "workspace" },
]) {
  return { schemaVersion: CURATED_BATCH_VERSION,
    sourceId: U1, workspaceId: U2, curatorId: U3, entries };
}
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "skilit-batch-"));
  const imageRoot = join(dir, "input");
  await mkdir(join(imageRoot, "screens"), { recursive: true });
  await writeFile(join(imageRoot, "screens", "first.png"), first);
  await writeFile(join(imageRoot, "screens", "second.png"), second);
  const manifestPath = join(dir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest()));
  return { dir, imageRoot, manifestPath };
}
function execute(args, environment = {}) {
  const env = { ...process.env, ...environment };
  // Deliberately supply an unusable remote URL: no CLI path may use it.
  env.SKILIT_MCP_DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/blocked";
  return spawnSync(process.execPath, ["--experimental-strip-types", CLI, ...args],
    { cwd: ROOT, env, encoding: "utf8", timeout: 45_000 });
}

test("G34 preflight validates two different real PNGs with exact digests and bounded size", async () => {
  const fx = await fixture();
  try {
    const plan = await planCuratedImageBatch(fx.imageRoot, manifest());
    assert.equal(plan.entries.length, 2);
    assert.deepEqual(plan.entries.map((e) => e.sha256), [hash(first), hash(second)]);
    assert.deepEqual(Buffer.from(plan.entries[1].imageBytes), second);
    assert.equal(plan.totalBytes, first.length + second.length);
    assert.equal(plan.entries[0].visibility, "private");
    assert.equal(plan.entries[1].visibility, "workspace");
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("G34 invalid rights, casefold duplicates, traversal and changed hashes fail before any write", async () => {
  const fx = await fixture();
  try {
    const original = manifest();
    const examples = [
      { ...original, entries: [] },
      { ...original, schemaVersion: "newer-unknown" },
      { ...original, entries: [...original.entries, ...Array.from({ length: 16 }, (_, i) =>
        ({ ...original.entries[0], title: "other " + i, relativePath: "screens/other" + i + ".png" }))] },
      { ...original, entries: [{ ...original.entries[0], relativePath: "../escape.png" }] },
      { ...original, entries: [{ ...original.entries[0], relativePath: "screens\\first.png" }] },
      { ...original, entries: [{ ...original.entries[0], relativePath: "screens/CON.png" }] },
      { ...original, entries: [{ ...original.entries[0], sha256: "0".repeat(64) }] },
      { ...original, entries: [{ ...original.entries[0], previewApproved: false }] },
      { ...original, entries: [{ ...original.entries[0], mediaType: "image/svg+xml" }] },
      { ...original, entries: [{ ...original.entries[0],
        rightsEvidence: { ...rightsEvidence, licenseId: "Unreviewed" } }] },
      { ...original, entries: [original.entries[0],
        { ...original.entries[1], title: "SYNTHETIC CHECKOUT FIRST" }] },
      { ...original, entries: [original.entries[0],
        { ...original.entries[1], relativePath: "screens/FIRST.png" }] },
      { ...original, entries: [original.entries[0],
        { ...original.entries[1], sha256: original.entries[0].sha256 }] },
    ];
    for (const example of examples) {
      await assert.rejects(planCuratedImageBatch(fx.imageRoot, example), CuratedBatchError);
    }
    await assert.rejects(planCuratedImageBatch("relative", original), CuratedBatchError);
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("G34 rejects symlink image roots and symlink intermediate directories", async () => {
  const fx = await fixture();
  try {
    const alias = join(fx.dir, "alias");
    await symlink(fx.imageRoot, alias, "dir");
    await assert.rejects(planCuratedImageBatch(alias, manifest()), CuratedBatchError);
    const nested = join(fx.dir, "linked-images");
    await mkdir(nested);
    await symlink(join(fx.imageRoot, "screens"), join(nested, "screens"), "dir");
    await assert.rejects(planCuratedImageBatch(nested, manifest()), CuratedBatchError);
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("G35 symlinked image filenames are denied, even when a matching real PNG exists", async () => {
  const fx = await fixture();
  try {
    const target = join(fx.imageRoot, "screens", "first.png");
    const saved = join(fx.imageRoot, "screens", "real-first.png");
    await rename(target, saved);
    await symlink(saved, target, "file");
    await assert.rejects(planCuratedImageBatch(fx.imageRoot, manifest()), CuratedBatchError);
    const cli = execute([fx.manifestPath, fx.imageRoot]);
    assert.notEqual(cli.status, 0);
    assert.equal(cli.stdout, "");
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("G35 CLI rejects a symlinked manifest before any DB or media setup", async () => {
  const fx = await fixture();
  try {
    const alias = join(fx.dir, "manifest-link.json");
    await symlink(fx.manifestPath, alias, "file");
    for (const args of [[alias, fx.imageRoot], [alias, fx.imageRoot, "--commit"]]) {
      const command = execute(args, {
        SKILIT_MCP_PGLITE_DATA_DIR: join(fx.dir, "not-created-db"),
        SKILIT_RESEARCH_MEDIA_ROOT: join(fx.dir, "not-created-media"),
      });
      assert.notEqual(command.status, 0);
      assert.equal(command.stdout, "");
    }
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("G35 bounded descriptor image and manifest readers refuse oversized files", async () => {
  const fx = await fixture();
  try {
    const huge = Buffer.alloc(4 * 1024 * 1024 + 1);
    await writeFile(join(fx.imageRoot, "screens", "second.png"), huge);
    await assert.rejects(planCuratedImageBatch(fx.imageRoot, manifest()), CuratedBatchError);
    await writeFile(fx.manifestPath, " ".repeat(128 * 1024 + 1));
    const result = execute([fx.manifestPath, fx.imageRoot]);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("G35 bounded file-read implementation never reads unbounded EOF and verifies same descriptor", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/research-batch.ts", import.meta.url), "utf8");
  const cli = await readFile(new URL("../../../scripts/import_curated_images.mjs", import.meta.url), "utf8");
  assert.ok(source.includes("Buffer.alloc(expectedSize)"));
  assert.ok(source.includes("handle.read(bytes, offset, bytes.length - offset, offset)"));
  assert.ok(source.includes("lstat(absolute)"));
  assert.ok(source.includes("sameEntry(nameAfter, after)"));
  assert.ok(!source.includes("await handle.readFile()"));
  assert.ok(cli.includes("Buffer.alloc(st.size)"));
  assert.ok(cli.includes("nameAfter.isSymbolicLink()"));
  assert.ok(!cli.includes("await handle.readFile("));
});

test("G34 CLI dry run never accesses DB or emits unverified-rights claim", async () => {
  const fx = await fixture();
  try {
    const result = execute([fx.manifestPath, fx.imageRoot], {
      SKILIT_MCP_PGLITE_DATA_DIR: join(fx.dir, "absent-db"),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "preflight-passed-not-rights-verified");
    const refused = execute([fx.manifestPath, join(fx.dir, "nonexistent")]);
    assert.notEqual(refused.status, 0);
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("G34 CLI rejects bad second digest before creating any DB artifact", async () => {
  const fx = await fixture();
  try {
    const bad = manifest();
    bad.entries[1] = { ...bad.entries[1], sha256: "f".repeat(64) };
    await writeFile(fx.manifestPath, JSON.stringify(bad));
    const result = execute([fx.manifestPath, fx.imageRoot, "--commit"], {
      SKILIT_MCP_PGLITE_DATA_DIR: join(fx.dir, "should-not-exist-db"),
      SKILIT_RESEARCH_MEDIA_ROOT: join(fx.dir, "should-not-exist-media"),
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});

test("G34 CLI commits two real PNGs to disk PGlite, gate outsider, and refuses replay without duplicates", async () => {
  const fx = await fixture();
  try {
    const dbDir = join(fx.dir, "pglite");
    const media = join(fx.dir, "media");
    const db = await openDatabase({ dataDir: dbDir });
    await migrateUp(db);
    const source = await createSource(db, { key: "g34-curator-fixture", kind: "synthetic" });
    const owner = await signUp(db, { email: "g34-owner@skilit.invalid", password: "g34-test-owner-pass" });
    const outsider = await signUp(db, { email: "g34-outsider@skilit.invalid", password: "g34-test-outsider-pass" });
    const workspace = await createWorkspace(db, { name: "G34 batch", ownerId: owner.id });
    await db.close();
    const data = manifest();
    data.sourceId = source.id;
    data.workspaceId = workspace.workspace.id;
    data.curatorId = owner.id;
    await writeFile(fx.manifestPath, JSON.stringify(data));
    const env = {
      SKILIT_MCP_PGLITE_DATA_DIR: dbDir, SKILIT_RESEARCH_MEDIA_ROOT: media,
    };
    const result = execute([fx.manifestPath, fx.imageRoot, "--commit"], env);
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split("\n").map(JSON.parse);
    assert.deepEqual(lines.map((l) => l.status), ["published", "published", "batch-complete"]);
    assert.equal(lines[2].published, 2);

    const verify = await openDatabase({ dataDir: dbDir });
    try {
      const rows = await verify.query("select id,title from artifacts where kind='screen'");
      assert.equal(rows.rows.length, 2);
      const store = new LocalContentAddressedStorage({ rootDir: media,
        maxBytes: 4 * 1024 * 1024 });
      const allowed = await loadResearchScreenPreview(verify, store, owner.id, lines[0].artifactId);
      assert.deepEqual(Buffer.from(allowed?.bytes ?? []), first);
      assert.equal(await loadResearchScreenPreview(verify, store, outsider.id, lines[0].artifactId), null);
    } finally { await verify.close(); }

    // A replay is refused before first write, rather than duplicating screens.
    const replay = execute([fx.manifestPath, fx.imageRoot, "--commit"], env);
    assert.notEqual(replay.status, 0);
    const verifyAgain = await openDatabase({ dataDir: dbDir });
    try {
      const count = await verifyAgain.query("select count(*)::int as n from artifacts where kind='screen'");
      assert.equal(Number(count.rows[0].n), 2);
    } finally { await verifyAgain.close(); }
  } finally { await rm(fx.dir, { recursive: true, force: true }); }
});
