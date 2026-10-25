import type { DbClient } from "../../db/src/db.ts";
import { getMembership, isUuid } from "../../db/src/workspaces.ts";
import { validateRightsEvidence } from "./corpus.ts";
import { publishArtifact, type PublishResult, type StorageProvider } from "./pipeline.ts";

/** Local operator-only admission. This is not a network-facing API. */
export class LocalScreenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalScreenError";
  }
}

export interface LocalScreenManifest {
  sourceId: string;
  workspaceId: string;
  ownerSubject: string;
  title: string;
  summary?: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  previewApproved: true;
  rightsEvidence: unknown;
}

const MAX_BYTES = 4 * 1024 * 1024;
const APPROVED_LICENSES = new Set(["CC0-1.0", "MIT", "Apache-2.0", "ISC"]);
const REQUIRED = new Set([
  "sourceId", "workspaceId", "ownerSubject", "title",
  "summary", "mediaType", "previewApproved", "rightsEvidence",
]);

function record(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new LocalScreenError("Invalid local screen manifest");
  }
  return input as Record<string, unknown>;
}

function isRecognizedMedia(bytes: Uint8Array, mediaType: string): boolean {
  if (mediaType === "image/png") {
    return bytes.length >= 24 &&
      Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      Buffer.from(bytes.subarray(12, 16)).toString("ascii") === "IHDR";
  }
  if (mediaType === "image/jpeg") {
    return bytes.length >= 16 && bytes[0] === 255 && bytes[1] === 216 &&
      bytes[2] === 255 && bytes[bytes.length - 2] === 255 &&
      bytes[bytes.length - 1] === 217;
  }
  if (mediaType === "image/webp") {
    return bytes.length >= 16 &&
      Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  }
  return false;
}

/** Validate everything that can be checked without I/O.
 * A curator's rights claim is recorded, never silently promoted to proof of ownership.
 */
export function validateLocalScreenManifest(input: unknown, bytes: Uint8Array): LocalScreenManifest {
  const fields = record(input);
  if (Object.keys(fields).some((key) => !REQUIRED.has(key))) {
    throw new LocalScreenError("Unknown local screen manifest field");
  }
  for (const key of ["sourceId", "workspaceId", "ownerSubject"]) {
    if (typeof fields[key] !== "string" || !isUuid(fields[key])) {
      throw new LocalScreenError("Invalid local screen identity");
    }
  }
  if (typeof fields.title !== "string" || fields.title.trim().length < 1 ||
      fields.title.length > 500) throw new LocalScreenError("Invalid local screen title");
  if (fields.summary !== undefined &&
      (typeof fields.summary !== "string" || fields.summary.length > 2000)) {
    throw new LocalScreenError("Invalid local screen summary");
  }
  if (fields.previewApproved !== true) throw new LocalScreenError("Explicit preview approval is required");
  if (!["image/png", "image/jpeg", "image/webp"].includes(String(fields.mediaType))) {
    throw new LocalScreenError("Only raster screen image formats are supported");
  }
  if (!(bytes instanceof Uint8Array) || bytes.length < 16 || bytes.length > MAX_BYTES ||
      !isRecognizedMedia(bytes, String(fields.mediaType))) {
    throw new LocalScreenError("Image contents, type or byte budget are invalid");
  }
  const rights = validateRightsEvidence(fields.rightsEvidence);
  if (!APPROVED_LICENSES.has(rights.licenseId)) {
    throw new LocalScreenError("Image license is not eligible for local preview");
  }
  return {
    sourceId: fields.sourceId as string,
    workspaceId: fields.workspaceId as string,
    ownerSubject: fields.ownerSubject as string,
    title: (fields.title as string).trim(),
    ...(fields.summary === undefined ? {} : { summary: fields.summary as string }),
    mediaType: fields.mediaType as LocalScreenManifest["mediaType"],
    previewApproved: true,
    rightsEvidence: rights,
  };
}

/** Owner-only, private-workspace ingestion, reusing Skilit's existing
 * content-verified object store + transactional artifact publishing.
 */
export async function publishLocalResearchScreen(
  db: DbClient,
  storage: StorageProvider,
  rawManifest: unknown,
  bytes: Uint8Array,
): Promise<PublishResult> {
  const manifest = validateLocalScreenManifest(rawManifest, bytes);
  const role = await getMembership(db, manifest.workspaceId, manifest.ownerSubject);
  if (role !== "owner") throw new LocalScreenError("Local screen publishing requires workspace ownership");
  return publishArtifact(db, storage, {
    sourceId: manifest.sourceId,
    kind: "screen",
    title: manifest.title,
    summary: manifest.summary,
    rightsClassification: "permitted",
    visibility: "private",
    workspaceId: manifest.workspaceId,
    ownerSubject: manifest.ownerSubject,
    metadata: {
      rightsEvidence: manifest.rightsEvidence,
      previewApproved: true,
      curatorOrigin: "local-operator",
    },
    asset: { bytes, mediaType: manifest.mediaType },
    storageMaxBytes: MAX_BYTES,
  });
}
