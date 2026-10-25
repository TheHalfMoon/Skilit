#!/usr/bin/env node
/** Operator-only local screen admission. Does not create network clients,
 * crawl websites, train models, or execute third-party content.
 */
import { readFile, lstat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import { openDatabase } from "../packages/db/src/db.ts";
import { LocalContentAddressedStorage } from "../packages/storage/src/storage.ts";
import { publishLocalResearchScreen } from "../packages/ingest/src/local-screen.ts";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;

async function mustBeLocalRegularFile(path, maxBytes) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new Error("Use an absolute local file path");
  }
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes || info.size < 1) {
    throw new Error("Local file is missing, unsafe or over budget");
  }
  const data = await readFile(path);
  if (data.length > maxBytes) throw new Error("Local file exceeded its byte budget");
  return data;
}

async function privateDirectory(path) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new Error("Local data directory must be explicitly configured with an absolute path");
  }
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() ||
      (process.platform !== "win32" && (info.mode & 0o077) !== 0)) {
    throw new Error("Local data directory must already exist and be operator-private");
  }
  return path;
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 2) {
    throw new Error("Usage: import_research_screen.mjs /absolute/manifest.json /absolute/image.png");
  }
  const dbDir = await privateDirectory(process.env.SKILIT_MCP_PGLITE_DATA_DIR);
  const mediaDir = await privateDirectory(process.env.SKILIT_RESEARCH_MEDIA_ROOT);
  const manifestBytes = await mustBeLocalRegularFile(args[0], MAX_MANIFEST_BYTES);
  const imageBytes = await mustBeLocalRegularFile(args[1], MAX_IMAGE_BYTES);

  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); }
  catch { throw new Error("Local screen manifest is not valid JSON"); }

  // Intentional local PGlite only. This script refuses implicit in-memory
  // databases and any remote DATABASE_URL, so it cannot cause cloud charges.
  const db = await openDatabase({ dataDir: dbDir });
  try {
    const storage = new LocalContentAddressedStorage({
      rootDir: mediaDir, maxBytes: MAX_IMAGE_BYTES,
    });
    const result = await publishLocalResearchScreen(db, storage, manifest, imageBytes);
    process.stdout.write(JSON.stringify({
      status: result.status, artifactId: result.artifactId,
      assetId: result.assetId, deduplicated: result.assetDeduplicated,
    }) + "\n");
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Do not print local paths, secrets, raw file contents or database errors.
    process.stderr.write("Skilit local screen import failed; review manifest, rights, paths and permissions.\n");
    process.exitCode = 1;
  });
}
