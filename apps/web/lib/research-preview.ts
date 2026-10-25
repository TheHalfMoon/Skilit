import type { DbTransaction } from "../../../packages/db/src/db.ts";
import { getArtifactForActor } from "../../../packages/db/src/artifact-access.ts";
import { validateRightsEvidence } from "../../../packages/ingest/src/corpus.ts";
import type { StorageProvider } from "../../../packages/storage/src/storage.ts";

/** Local rights-qualified image previews, NEVER public raw-storage URLs.
 * The curator must explicitly approve preview use of the underlying screen
 * artwork. Artifact existence, workspace, SHA and source are server-checked.
 */
export type PreviewMediaType = "image/png" | "image/jpeg" | "image/webp";
export interface ResearchPreview {
  bytes: Uint8Array;
  mediaType: PreviewMediaType;
}

const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;
const ALLOWED_MEDIA: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp"]);
const PREVIEW_LICENSES: ReadonlySet<string> = new Set(["CC0-1.0", "MIT", "Apache-2.0", "ISC"]);

function matchesDeclaredImageType(bytes: Uint8Array, mediaType: string): boolean {
  if (mediaType === "image/png") {
    return bytes.length >= 24 &&
      Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      Buffer.from(bytes.subarray(12, 16)).toString("ascii") === "IHDR";
  }
  if (mediaType === "image/jpeg") {
    return bytes.length >= 16 &&
      bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (mediaType === "image/webp") {
    return bytes.length >= 16 &&
      Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  }
  return false;
}

/** Return null for both denied and nonexistent screens, or missing/unsigned
 * media. Any actual blob I/O/integrity failure throws and must be answered
 * with a generic server error, never with bytes or filesystem details.
 */
export async function loadResearchScreenPreview(
  db: DbTransaction,
  storage: StorageProvider,
  actorId: string,
  artifactId: string,
): Promise<ResearchPreview | null> {
  const artifact = await getArtifactForActor(db, artifactId, actorId);
  if (artifact === null || artifact.kind !== "screen" ||
      artifact.rightsClassification !== "permitted" || !HASH.test(artifact.contentHash)) return null;
  const metadata = artifact.metadata;
  if (metadata.previewApproved !== true || metadata.trademark === true) return null;

  // A license label or permitted rights bit alone is never enough:
  // qualified metadata + explicit curator preview admission are required.
  let licenseId: string;
  try {
    licenseId = validateRightsEvidence(metadata.rightsEvidence).licenseId;
  } catch {
    return null;
  }
  if (!PREVIEW_LICENSES.has(licenseId)) return null;

  const result = await db.query(
    `select sha256, media_type, byte_length from assets
     where sha256=$1 and source_id=$2 and rights_classification='permitted'
     limit 1`,
    [artifact.contentHash, artifact.sourceId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  const mediaType = String(row.media_type);
  const length = Number(row.byte_length);
  if (!ALLOWED_MEDIA.has(mediaType) || !Number.isSafeInteger(length) ||
      length < 16 || length > MAX_PREVIEW_BYTES) return null;

  // The underlying storage provider hashes every byte before yielding.
  // Never use a key/path or remote URL from artifact/user metadata.
  const parts: Buffer[] = [];
  let received = 0;
  for await (const chunk of storage.readVerified(artifact.contentHash)) {
    received += chunk.byteLength;
    if (received > MAX_PREVIEW_BYTES || received > length) {
      throw new Error("Research image exceeds its verified byte budget");
    }
    parts.push(Buffer.from(chunk));
  }
  if (received !== length) throw new Error("Research image has an invalid byte length");
  const bytes = Buffer.concat(parts, received);
  if (!matchesDeclaredImageType(bytes, mediaType)) {
    throw new Error("Research image media signature is invalid");
  }
  return { bytes, mediaType: mediaType as PreviewMediaType };
}
