import type { DbTransaction } from "../../../packages/db/src/db.ts";
import { getArtifactForActor } from "../../../packages/db/src/artifact-access.ts";
import { validateRightsEvidence } from "../../../packages/ingest/src/corpus.ts";
import type { StorageProvider } from "../../../packages/storage/src/storage.ts";
import { RESEARCH_IMAGE_MAX_BYTES, isResearchImageType, isApprovedPreviewLicense, matchesDeclaredImageType } from "../../../packages/ingest/src/research-media.ts";

/** Local rights-qualified image previews, NEVER public raw-storage URLs.
 * The curator must explicitly approve preview use of the underlying screen
 * artwork. Artifact existence, workspace, SHA and source are server-checked.
 */
export type PreviewMediaType = "image/png" | "image/jpeg" | "image/webp";
export interface ResearchPreview {
  bytes: Uint8Array;
  mediaType: PreviewMediaType;
}

const MAX_PREVIEW_BYTES = RESEARCH_IMAGE_MAX_BYTES;
const HASH = /^[0-9a-f]{64}$/;

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
  const metadata = artifact.metadata ?? {};
  if (metadata.previewApproved !== true || metadata.trademark === true) return null;

  // A license label or permitted rights bit alone is never enough:
  // qualified metadata + explicit curator preview admission are required.
  let licenseId: string;
  try {
    licenseId = validateRightsEvidence(metadata.rightsEvidence).licenseId;
  } catch {
    return null;
  }
  if (!isApprovedPreviewLicense(licenseId)) return null;

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
  if (!isResearchImageType(mediaType) || !Number.isSafeInteger(length) ||
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
