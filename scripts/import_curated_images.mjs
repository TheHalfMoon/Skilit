#!/usr/bin/env node
/**
 * Operator-only, offline, reviewed-image batch intake.
 * Dry-run by default. No HTTP endpoint, crawler, or automatic rights approval.
 */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { openDatabase } from "../packages/db/src/db.ts";
import { requireRole } from "../packages/db/src/workspaces.ts";
import { LocalContentAddressedStorage } from "../packages/storage/src/storage.ts";
import { publishCuratedResearchImage } from "../packages/ingest/src/research-image.ts";
import { planCuratedImageBatch } from "../packages/ingest/src/research-batch.ts";
import { RESEARCH_IMAGE_MAX_BYTES } from "../packages/ingest/src/research-media.ts";
import { prepareDataDir } from "../apps/web/lib/mcp-db.ts";

function refuse() {
  process.stderr.write("Curated batch refused. Validate local manifest, assets, rights and operator access.\n");
  process.exitCode = 1;
}
async function readManifest(path) {
  const nameBefore = await lstat(path);
  if (!nameBefore.isFile() || nameBefore.isSymbolicLink() ||
      nameBefore.size < 2 || nameBefore.size > 128 * 1024) throw Error("manifest invalid");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const st = await handle.stat();
    if (!st.isFile() || st.size !== nameBefore.size ||
        st.dev !== nameBefore.dev || st.ino !== nameBefore.ino) throw Error("manifest changed");
    // Fixed-size, positional reads avoid unbounded growth on concurrent append.
    const data = Buffer.alloc(st.size);
    let offset = 0;
    while (offset < data.length) {
      const read = await handle.read(data, offset, data.length - offset, offset);
      if (read.bytesRead <= 0) throw Error("manifest truncated");
      offset += read.bytesRead;
    }
    if ((await handle.read(Buffer.alloc(1), 0, 1, st.size)).bytesRead !== 0) {
      throw Error("manifest grew");
    }
    const next = await handle.stat();
    const nameAfter = await lstat(path);
    if (st.ino !== next.ino || st.dev !== next.dev || st.size !== next.size ||
        !nameAfter.isFile() || nameAfter.isSymbolicLink() ||
        nameAfter.ino !== next.ino || nameAfter.dev !== next.dev) throw Error("manifest changed");
    return JSON.parse(data.toString("utf8"));
  } finally {
    await handle.close();
  }
}
async function main() {
  const args = process.argv.slice(2);
  const [manifestFile, imageRoot, mode] = args;
  if ((args.length !== 2 && args.length !== 3) ||
      typeof manifestFile !== "string" || !isAbsolute(manifestFile) ||
      typeof imageRoot !== "string" || !isAbsolute(imageRoot) ||
      (mode !== undefined && mode !== "--commit")) {
    throw Error("usage");
  }
  const manifest = await readManifest(manifestFile);
  const plan = await planCuratedImageBatch(imageRoot, manifest);
  // Preflight is side-effect free; it doesn't even open the database.
  if (mode !== "--commit") {
    process.stdout.write(JSON.stringify({
      status: "preflight-passed-not-rights-verified",
      count: plan.entries.length, totalBytes: plan.totalBytes,
      imageHashes: plan.entries.map((entry) => entry.sha256),
    }) + "\n");
    return;
  }
  if (!process.env.SKILIT_MCP_PGLITE_DATA_DIR ||
      !process.env.SKILIT_RESEARCH_MEDIA_ROOT ||
      !isAbsolute(process.env.SKILIT_RESEARCH_MEDIA_ROOT)) throw Error("local config missing");

  const db = await openDatabase({
    // Explicit local database. Ignore any inherited remote PG connection URL.
    dataDir: prepareDataDir(process.env.SKILIT_MCP_PGLITE_DATA_DIR),
  });
  let published = 0;
  try {
    // Preflight all existing titles and current actor authority before the
    // first write. Per-record publication rechecks authority transactionally.
    await db.transaction(async (tx) => {
      await requireRole(tx, plan.workspaceId, plan.curatorId, "admin");
      const source = await tx.query("select id from sources where id=$1", [plan.sourceId]);
      if (source.rows.length !== 1) throw Error("unknown source");
      for (const entry of plan.entries) {
        const prior = await tx.query(
          "select id from artifacts where source_id=$1 and workspace_id=$2 and kind='screen' and lower(title)=lower($3) limit 1",
          [plan.sourceId, plan.workspaceId, entry.title],
        );
        if (prior.rows.length) throw Error("screen title already exists");
      }
    });
    const store = new LocalContentAddressedStorage({
      rootDir: process.env.SKILIT_RESEARCH_MEDIA_ROOT,
      maxBytes: RESEARCH_IMAGE_MAX_BYTES,
    });
    for (const [index, entry] of plan.entries.entries()) {
      const result = await publishCuratedResearchImage(db, store, {
        sourceId: plan.sourceId, workspaceId: plan.workspaceId,
        curatorId: plan.curatorId, title: entry.title,
        imageBytes: entry.imageBytes, mediaType: entry.mediaType,
        rightsEvidence: entry.rightsEvidence, previewApproved: true,
        visibility: entry.visibility,
      });
      published += 1;
      // A later runtime/storage failure can leave this prefix committed.
      // Emitting each canonical ID makes partial outcomes auditable.
      process.stdout.write(JSON.stringify({
        status: "published", index, artifactId: result.artifactId,
        assetId: result.assetId,
      }) + "\n");
    }
    process.stdout.write(JSON.stringify({ status: "batch-complete", published }) + "\n");
  } catch {
    process.stderr.write(JSON.stringify({
      status: "batch-failed", published,
      remaining: plan.entries.length - published,
      note: "Earlier published rows are retained. Do not blindly rerun or assume rollback.",
    }) + "\n");
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
main().catch(refuse);
