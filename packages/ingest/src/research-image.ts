import type { DbClient } from "../../db/src/db.ts";
import { requireRole } from "../../db/src/workspaces.ts";
import type { StorageProvider } from "../../storage/src/storage.ts";
import { validateRightsEvidence, type CorpusRightsEvidence } from "./corpus.ts";
import { publishArtifact, type PublishResult } from "./pipeline.ts";
import {
  RESEARCH_IMAGE_MAX_BYTES, isApprovedPreviewLicense, isResearchImageType,
  matchesDeclaredImageType,
} from "./research-media.ts";

/**
 * Operator-only local curator intake. NOT an HTTP endpoint.
 * The operator has reviewed underlying screenshot and redistribution rights;
 * submitted evidence records that decision, it does not prove legality.
 * Database membership is rechecked inside the same publication transaction.
 */
export interface CuratedResearchImageInput {
  sourceId: string;
  workspaceId: string;
  curatorId: string;
  title: string;
  imageBytes: Uint8Array;
  mediaType: string;
  rightsEvidence: CorpusRightsEvidence;
  previewApproved: boolean;
  visibility?: "private" | "workspace";
}

export class CuratedResearchImageError extends Error {
  constructor() {
    super("Curated research image admission denied.");
    this.name = "CuratedResearchImageError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function publishCuratedResearchImage(
  db: DbClient, storage: StorageProvider, input: CuratedResearchImageInput,
): Promise<PublishResult> {
  if (!input || !UUID.test(input.sourceId) || !UUID.test(input.workspaceId) ||
      !UUID.test(input.curatorId) || input.previewApproved !== true ||
      typeof input.title !== "string" || !input.title.trim() || input.title.length > 500 ||
      !isResearchImageType(input.mediaType) ||
      !(input.imageBytes instanceof Uint8Array) ||
      input.imageBytes.byteLength < 16 || input.imageBytes.byteLength > RESEARCH_IMAGE_MAX_BYTES ||
      !matchesDeclaredImageType(input.imageBytes, input.mediaType) ||
      (input.visibility !== undefined && input.visibility !== "private" &&
        input.visibility !== "workspace")) {
    throw new CuratedResearchImageError();
  }

  let rightsEvidence: CorpusRightsEvidence;
  try {
    rightsEvidence = validateRightsEvidence(input.rightsEvidence);
  } catch {
    throw new CuratedResearchImageError();
  }
  if (!isApprovedPreviewLicense(rightsEvidence.licenseId)) {
    throw new CuratedResearchImageError();
  }

  return publishArtifact(db, storage, {
    sourceId: input.sourceId,
    kind: "screen",
    title: input.title,
    rightsClassification: "permitted",
    visibility: input.visibility ?? "private",
    workspaceId: input.workspaceId,
    ownerSubject: input.curatorId,
    asset: { bytes: input.imageBytes, mediaType: input.mediaType },
    storageMaxBytes: RESEARCH_IMAGE_MAX_BYTES,
    metadata: { rightsEvidence, previewApproved: true, trademark: false },
    // Authorization must be validated as part of publication, not a
    // preflight check vulnerable to membership removal between transactions.
    authorizeInTransaction: async (tx) => {
      await requireRole(tx, input.workspaceId, input.curatorId, "admin");
    },
  });
}
