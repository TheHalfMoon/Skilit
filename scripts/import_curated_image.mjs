#!/usr/bin/env node
/** Trusted local-operator CLI. No network fetch, public upload, or crawling. */
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { getSharedDb } from "../apps/web/lib/mcp-db.ts";
import { LocalContentAddressedStorage } from "../packages/storage/src/storage.ts";
import { publishCuratedResearchImage } from "../packages/ingest/src/research-image.ts";
import { RESEARCH_IMAGE_MAX_BYTES } from "../packages/ingest/src/research-media.ts";

async function readPrivateImage(path) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 16 || info.size > RESEARCH_IMAGE_MAX_BYTES) {
      throw new Error("Image must be a regular file between 16 bytes and 4 MiB.");
    }
    // Read through the same verified descriptor; do not follow a filename
    // replacement to a different file between size inspection and read.
    const buffer = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead <= 0) throw new Error("Image changed during reading.");
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== info.size || after.ino !== info.ino || after.dev !== info.dev) {
      throw new Error("Image changed during reading.");
    }
    return buffer;
  } finally {
    await handle.close();
  }
}

async function main() {
  const [manifestPath, imagePath] = process.argv.slice(2);
  if (!manifestPath || !imagePath || !isAbsolute(manifestPath) || !isAbsolute(imagePath) ||
      !process.env.SKILIT_RESEARCH_MEDIA_ROOT ||
      !isAbsolute(process.env.SKILIT_RESEARCH_MEDIA_ROOT) ||
      !(process.env.SKILIT_MCP_PGLITE_DATA_DIR || process.env.SKILIT_MCP_DATABASE_URL)) {
    throw new Error("Usage: SKILIT_MCP_PGLITE_DATA_DIR=/absolute/db SKILIT_RESEARCH_MEDIA_ROOT=/absolute/media node --experimental-strip-types scripts/import_curated_image.mjs /absolute/manifest.json /absolute/screen.png");
  }
  const manifestHandle = await open(manifestPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let manifest;
  try {
    const info = await manifestHandle.stat();
    if (!info.isFile() || info.size < 2 || info.size > 16 * 1024) {
      throw new Error("Manifest size is invalid.");
    }
    manifest = JSON.parse(await manifestHandle.readFile("utf8"));
  } finally {
    await manifestHandle.close();
  }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Expected an object manifest.");
  }
  const bytes = await readPrivateImage(imagePath);
  const storage = new LocalContentAddressedStorage({
    rootDir: process.env.SKILIT_RESEARCH_MEDIA_ROOT,
    maxBytes: RESEARCH_IMAGE_MAX_BYTES,
  });
  const db = await getSharedDb();
  try {
    const published = await publishCuratedResearchImage(db, storage, {
      ...manifest, imageBytes: bytes,
    });
    process.stdout.write(JSON.stringify({
      status: published.status, artifactId: published.artifactId,
      assetId: published.assetId,
    }) + "\n");
  } finally {
    await db.close();
  }
}

main().catch(() => {
  // Do not leak local paths, database connection strings, or source metadata.
  process.stderr.write("Curated image import refused; verify manifest, rights, memberships and local storage.\n");
  process.exitCode = 1;
});
