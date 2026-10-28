import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, type FileHandle } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { validateRightsEvidence, type CorpusRightsEvidence } from "./corpus.ts";
import {
  RESEARCH_IMAGE_MAX_BYTES,
  isApprovedPreviewLicense,
  isResearchImageType,
  matchesDeclaredImageType,
} from "./research-media.ts";

/** Operator-controlled local batch only. Not a web upload or license validator. */
export const CURATED_BATCH_VERSION = "skilit.curated-images.v1";
export const CURATED_BATCH_MAX_ENTRIES = 16;
export const CURATED_BATCH_MAX_BYTES = 32 * 1024 * 1024;

export class CuratedBatchError extends Error {
  constructor() {
    super("Curated image batch preflight refused.");
    this.name = "CuratedBatchError";
  }
}

export interface CuratedBatchEntry {
  relativePath: string;
  sha256: string;
  title: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  rightsEvidence: CorpusRightsEvidence;
  previewApproved: true;
  visibility: "private" | "workspace";
  imageBytes: Uint8Array;
}
export interface CuratedBatchPlan {
  sourceId: string;
  workspaceId: string;
  curatorId: string;
  entries: CuratedBatchEntry[];
  totalBytes: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DEVICE = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
const MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(input: Record<string, unknown>, accepted: readonly string[]): boolean {
  return Object.keys(input).every((key) => accepted.includes(key));
}
function pathParts(value: unknown, mediaType: string): string[] {
  if (typeof value !== "string" || value.length > 512 || value.length === 0 ||
      value.includes("\\") || value.startsWith("/") || value.includes(":") ||
      value.includes("\0")) throw new CuratedBatchError();
  const parts = value.split("/");
  if (parts.length > 4 || parts.some((part) => !SEGMENT.test(part) ||
      part === "." || part === ".." || part.endsWith(".") ||
      DEVICE.test(part))) throw new CuratedBatchError();
  const last = parts[parts.length - 1] ?? "";
  if (!(MIME_EXTENSIONS[mediaType] ?? []).some((extension) =>
    last.toLowerCase().endsWith(extension))) throw new CuratedBatchError();
  return parts;
}

interface ValidatedEntry {
  relativePath: string;
  parts: string[];
  sha256: string;
  title: string;
  mediaType: CuratedBatchEntry["mediaType"];
  rightsEvidence: CorpusRightsEvidence;
  previewApproved: true;
  visibility: CuratedBatchEntry["visibility"];
}

/** Validate the complete manifest before reading any assets or touching the DB. */
export function validateCuratedBatchManifest(raw: unknown): {
  sourceId: string; workspaceId: string; curatorId: string; entries: ValidatedEntry[];
} {
  if (!object(raw) || !exactKeys(raw, ["schemaVersion","sourceId","workspaceId","curatorId","entries"]) ||
      raw.schemaVersion !== CURATED_BATCH_VERSION ||
      typeof raw.sourceId !== "string" || !UUID.test(raw.sourceId) ||
      typeof raw.workspaceId !== "string" || !UUID.test(raw.workspaceId) ||
      typeof raw.curatorId !== "string" || !UUID.test(raw.curatorId) ||
      !Array.isArray(raw.entries) || raw.entries.length === 0 ||
      raw.entries.length > CURATED_BATCH_MAX_ENTRIES) throw new CuratedBatchError();

  const seenPaths = new Set<string>();
  const seenSha = new Set<string>();
  const seenTitles = new Set<string>();
  const entries: ValidatedEntry[] = [];
  for (const entry of raw.entries) {
    if (!object(entry) || !exactKeys(entry, [
      "relativePath","sha256","title","mediaType","rightsEvidence",
      "previewApproved","visibility",
    ]) || !isResearchImageType(entry.mediaType) ||
        typeof entry.sha256 !== "string" || !SHA256.test(entry.sha256) ||
        typeof entry.title !== "string" || entry.title.trim().length === 0 ||
        entry.title.length > 500 || /[\u0000-\u001f\u007f]/.test(entry.title) ||
        entry.previewApproved !== true ||
        (entry.visibility !== undefined && entry.visibility !== "private" &&
        entry.visibility !== "workspace")) throw new CuratedBatchError();

    const parts = pathParts(entry.relativePath, entry.mediaType);
    const canonicalPath = parts.join("/").toLowerCase();
    const canonicalTitle = entry.title.trim().toLowerCase();
    if (seenPaths.has(canonicalPath) || seenSha.has(entry.sha256) ||
        seenTitles.has(canonicalTitle)) throw new CuratedBatchError();
    seenPaths.add(canonicalPath);
    seenSha.add(entry.sha256);
    seenTitles.add(canonicalTitle);
    let rightsEvidence: CorpusRightsEvidence;
    try {
      rightsEvidence = validateRightsEvidence(entry.rightsEvidence);
    } catch {
      throw new CuratedBatchError();
    }
    if (!isApprovedPreviewLicense(rightsEvidence.licenseId)) throw new CuratedBatchError();
    entries.push({
      relativePath: parts.join("/"), parts, sha256: entry.sha256,
      title: entry.title.trim(), mediaType: entry.mediaType,
      rightsEvidence, previewApproved: true,
      visibility: entry.visibility ?? "private",
    });
  }
  return { sourceId: raw.sourceId, workspaceId: raw.workspaceId,
    curatorId: raw.curatorId, entries };
}

/** Never read until EOF: a concurrent append could otherwise consume unbounded memory. */
async function readBoundedImage(handle: FileHandle, expectedSize: number): Promise<Buffer> {
  // expectedSize has already been checked against RESEARCH_IMAGE_MAX_BYTES.
  const bytes = Buffer.alloc(expectedSize);
  let offset = 0;
  while (offset < bytes.length) {
    const read = await handle.read(bytes, offset, bytes.length - offset, offset);
    if (read.bytesRead <= 0) throw new CuratedBatchError();
    offset += read.bytesRead;
  }
  // Detect a file which gained bytes after the initial descriptor stat.
  const extra = await handle.read(Buffer.alloc(1), 0, 1, expectedSize);
  if (extra.bytesRead !== 0) throw new CuratedBatchError();
  return bytes;
}

function sameEntry(a: { dev: number | bigint; ino: number | bigint }, b: { dev: number | bigint; ino: number | bigint }): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

/** Validate every file and digest before returning a publishable plan. */
export async function planCuratedImageBatch(
  imageRoot: string, raw: unknown,
): Promise<CuratedBatchPlan> {
  const manifest = validateCuratedBatchManifest(raw);
  if (typeof imageRoot !== "string" || !isAbsolute(imageRoot)) throw new CuratedBatchError();
  try {
    const rootStat = await lstat(imageRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new CuratedBatchError();
    let totalBytes = 0;
    const entries: CuratedBatchEntry[] = [];
    for (const entry of manifest.entries) {
      let folder = imageRoot;
      const ancestors: { path: string; stat: Awaited<ReturnType<typeof lstat>> }[] = [
        { path: imageRoot, stat: rootStat },
      ];
      for (const segment of entry.parts.slice(0, -1)) {
        folder = join(folder, segment);
        const parent = await lstat(folder);
        if (!parent.isDirectory() || parent.isSymbolicLink()) throw new CuratedBatchError();
        ancestors.push({ path: folder, stat: parent });
      }
      const absolute = join(folder, entry.parts[entry.parts.length - 1] ?? "");
      // lstat is required even on Windows, where O_NOFOLLOW may be absent.
      const nameBefore = await lstat(absolute);
      if (!nameBefore.isFile() || nameBefore.isSymbolicLink()) throw new CuratedBatchError();
      const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      let bytes: Buffer;
      try {
        const before = await handle.stat();
        if (!before.isFile() || !sameEntry(nameBefore, before) || before.size < 16 ||
            before.size > RESEARCH_IMAGE_MAX_BYTES ||
            totalBytes + before.size > CURATED_BATCH_MAX_BYTES) throw new CuratedBatchError();
        bytes = await readBoundedImage(handle, before.size);
        const after = await handle.stat();
        if (before.size !== after.size || !sameEntry(before, after)) {
          throw new CuratedBatchError();
        }
        const nameAfter = await lstat(absolute);
        if (!nameAfter.isFile() || nameAfter.isSymbolicLink() ||
            !sameEntry(nameAfter, after)) throw new CuratedBatchError();
        // Check the directory name chain again. This detects ordinary
        // substitutions, but not an attacker racing every individual check.
        for (const parent of ancestors) {
          const now = await lstat(parent.path);
          if (!now.isDirectory() || now.isSymbolicLink() ||
              !sameEntry(parent.stat, now)) throw new CuratedBatchError();
        }
      } finally {
        await handle.close();
      }
      if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256 ||
          !matchesDeclaredImageType(bytes, entry.mediaType)) throw new CuratedBatchError();
      totalBytes += bytes.byteLength;
      entries.push({
        relativePath: entry.relativePath, sha256: entry.sha256, title: entry.title,
        mediaType: entry.mediaType, rightsEvidence: entry.rightsEvidence,
        previewApproved: true, visibility: entry.visibility, imageBytes: bytes,
      });
    }
    // Parent directory must still be a directory at the end of preflight.
    const rootAfter = await lstat(imageRoot);
    if (!rootAfter.isDirectory() || rootAfter.isSymbolicLink() ||
        rootStat.ino !== rootAfter.ino || rootStat.dev !== rootAfter.dev) {
      throw new CuratedBatchError();
    }
    return { sourceId: manifest.sourceId, workspaceId: manifest.workspaceId,
      curatorId: manifest.curatorId, entries, totalBytes };
  } catch {
    throw new CuratedBatchError();
  }
}
