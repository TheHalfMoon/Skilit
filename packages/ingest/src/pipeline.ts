import { createHash } from "node:crypto";
import type { DbClient, DbTransaction } from "../../db/src/db.ts";
import {
  ARTIFACT_KINDS,
  RIGHTS,
  createArtifact,
  createAsset,
  type ArtifactKind,
  type Rights,
} from "../../db/src/graph.ts";
import {
  LocalContentAddressedStorage,
  type StorageProvider,
} from "../../storage/src/storage.ts";
import {
  ProviderError,
  invokeProvider,
  type ProviderDefinition,
} from "../../providers/src/provider.ts";

/**
 * G05-03 publish transaction: raw input -> required validation -> asset
 * dedupe -> canonical publish, with optional enrichment reported but
 * never merged into canonical rows.
 *
 * Ordering and failure contract: required validation (shapes, rights,
 * source/product/version coherence) runs before any write; the asset
 * bytes are content-addressed through storage; artifact and asset rows
 * commit atomically. Any required failure throws PublishError with zero
 * new canonical rows. Optional enricher failures yield an explicit
 * partial status with per-provider outcomes; the canonical publish
 * stands unmodified. Storage objects are content-verified and inert:
 * a database rollback after a successful put leaves no false published
 * object, only an unreferenced, garbage-collectable blob.
 *
 * Authorization precondition: source/product/version identifiers are
 * checked for existence and coherence here, not for workspace scope.
 * Callers authenticate and authorize workspace scope before publishing.
 */

export type PublishStatus = "published" | "partial";

export interface EnrichmentOutcome {
  providerId: string;
  capability: string;
  ok: boolean;
  errorCode?: string;
}

export interface PublishResult {
  status: PublishStatus;
  artifactId: string;
  assetId: string | null;
  assetDeduplicated: boolean;
  enrichment: EnrichmentOutcome[];
}

export class PublishError extends Error {
  readonly code:
    | "publish/invalid-input"
    | "publish/unknown-reference"
    | "publish/storage-failed"
    | "publish/rights-conflict"
    | "publish/internal";
  constructor(
    code: PublishError["code"],
    message: string,
  ) {
    super(message);
    this.name = "PublishError";
    this.code = code;
  }
}

export interface PublishAssetInput {
  bytes: Uint8Array;
  mediaType: string;
  sourceUrl?: string;
}

export interface PublishInput {
  sourceId: string;
  kind: string;
  title: string;
  rightsClassification: string;
  visibility?: string;
  workspaceId?: string;
  ownerSubject?: string;
  productId?: string;
  productVersionId?: string;
  summary?: string;
  canonicalText?: string;
  metadata?: Record<string, unknown>;
  asset?: PublishAssetInput;
  enrichers?: Array<ProviderDefinition<unknown, unknown>>;
  enricherTimeoutMs?: number;
  storageMaxBytes?: number;
  /** Internal trusted caller hook, executed within the publication transaction before any write. */
  authorizeInTransaction?: (tx: DbTransaction) => Promise<void>;
}

export type { StorageProvider };
export { LocalContentAddressedStorage };

const METADATA_MAX_BYTES = 32 * 1024;
const METADATA_MAX_KEYS = 100;
const METADATA_MAX_DEPTH = 5;
const METADATA_MAX_KEY_CHARS = 128;
const SUMMARY_MAX_CHARS = 4096;
const CANONICAL_TEXT_MAX_CHARS = 1024 * 1024;
const ASSET_MAX_BYTES = 32 * 1024 * 1024;
const ENRICHERS_MAX_COUNT = 10;

function validateKind(kind: string): ArtifactKind {
  if (!(ARTIFACT_KINDS as readonly string[]).includes(kind)) {
    throw new PublishError("publish/invalid-input", "Artifact kind is invalid.");
  }
  return kind as ArtifactKind;
}

function validateRights(rights: string): Rights {
  if (!(RIGHTS as readonly string[]).includes(rights)) {
    throw new PublishError("publish/invalid-input", "Rights classification is invalid.");
  }
  return rights as Rights;
}

function validateTitle(title: string): string {
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 500) {
    throw new PublishError("publish/invalid-input", "Artifact title is invalid.");
  }
  return title.trim();
}

function validateMediaType(mediaType: string): string {
  if (typeof mediaType !== "string" || mediaType.length > 128) {
    throw new PublishError("publish/invalid-input", "Asset media type is invalid.");
  }
  const normalized = mediaType.toLowerCase();
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(normalized)) {
    throw new PublishError("publish/invalid-input", "Asset media type is invalid.");
  }
  // Declared-by-client only: downstream preview must sandbox active
  // content (SVG/HTML) before rendering.
  return normalized;
}

function validateSourceUrl(sourceUrl: string | undefined): string | undefined {
  if (sourceUrl === undefined) return undefined;
  if (
    typeof sourceUrl !== "string" ||
    sourceUrl.length > 2048 ||
    !(sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://"))
  ) {
    throw new PublishError("publish/invalid-input", "Asset source URL is invalid.");
  }
  return sourceUrl;
}

function scanMetadataKeys(value: unknown, depth: number): void {
  if (typeof value !== "object" || value === null) return;
  if (depth > METADATA_MAX_DEPTH) {
    throw new PublishError("publish/invalid-input", "Artifact metadata is too deep.");
  }
  const entries = Object.entries(value);
  if (entries.length > METADATA_MAX_KEYS) {
    throw new PublishError("publish/invalid-input", "Artifact metadata is too large.");
  }
  for (const [key, nested] of entries) {
    if (
      key.length === 0 ||
      key.length > METADATA_MAX_KEY_CHARS ||
      key === "__proto__" ||
      key === "prototype" ||
      key === "constructor"
    ) {
      throw new PublishError("publish/invalid-input", "Artifact metadata key is invalid.");
    }
    scanMetadataKeys(nested, depth + 1);
  }
}

function validateMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (metadata === undefined) return undefined;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw new PublishError("publish/invalid-input", "Artifact metadata is invalid.");
  }
  if (JSON.stringify(metadata).length > METADATA_MAX_BYTES) {
    throw new PublishError("publish/invalid-input", "Artifact metadata is too large.");
  }
  scanMetadataKeys(metadata, 0);
  return metadata as Record<string, unknown>;
}

function validateText(field: string, value: string | undefined, maxChars: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maxChars) {
    throw new PublishError("publish/invalid-input", `Artifact ${field} is invalid.`);
  }
  return value;
}

async function* singleChunk(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Publish one artifact with its optional asset through the normalized
 * pipeline. Required failures throw with nothing published; optional
 * enrichment failures downgrade the result to partial.
 */
export async function publishArtifact(
  db: DbClient,
  storage: StorageProvider,
  input: PublishInput,
): Promise<PublishResult> {
  const kind = validateKind(input.kind);
  const title = validateTitle(input.title);
  const rights = validateRights(input.rightsClassification);
  const metadata = validateMetadata(input.metadata);
  const summary = validateText("summary", input.summary, SUMMARY_MAX_CHARS);
  const canonicalText = validateText("canonical-text", input.canonicalText, CANONICAL_TEXT_MAX_CHARS);
  let mediaType: string | undefined;
  let sourceUrl: string | undefined;
  let maxBytes = ASSET_MAX_BYTES;
  if (input.asset !== undefined) {
    mediaType = validateMediaType(input.asset.mediaType);
    sourceUrl = validateSourceUrl(input.asset.sourceUrl);
    if (!(input.asset.bytes instanceof Uint8Array) || input.asset.bytes.length === 0) {
      throw new PublishError("publish/invalid-input", "Asset bytes are invalid.");
    }
    if (input.storageMaxBytes !== undefined) {
      if (!Number.isSafeInteger(input.storageMaxBytes) || input.storageMaxBytes <= 0) {
        throw new PublishError("publish/invalid-input", "Asset size bound is invalid.");
      }
      maxBytes = input.storageMaxBytes;
    }
    if (input.asset.bytes.length > maxBytes) {
      throw new PublishError("publish/storage-failed", "Asset storage failed.");
    }
  }
  const timeoutMs = input.enricherTimeoutMs ?? 30_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) {
    throw new PublishError("publish/invalid-input", "Enricher timeout is invalid.");
  }
  const enrichers = input.enrichers ?? [];
  if (enrichers.length > ENRICHERS_MAX_COUNT) {
    throw new PublishError("publish/invalid-input", "Too many enrichers.");
  }
  for (const enricher of enrichers) {
    if (
      typeof enricher.id !== "string" ||
      enricher.id.trim().length === 0 ||
      enricher.id.length > 128 ||
      typeof enricher.capability !== "string" ||
      enricher.capability.trim().length === 0 ||
      enricher.capability.length > 128
    ) {
      throw new PublishError("publish/invalid-input", "Enricher identity is invalid.");
    }
  }

  const published = await db.transaction(async (tx) => {
    if (input.authorizeInTransaction) await input.authorizeInTransaction(tx);
    const source = await tx.query("select id from sources where id = $1", [input.sourceId]);
    if (source.rows.length === 0) {
      throw new PublishError("publish/unknown-reference", "Source was not found.");
    }
    if (input.productId !== undefined) {
      const product = await tx.query(
        "select id, source_id from products where id = $1",
        [input.productId],
      );
      const productRow = product.rows[0];
      if (productRow === undefined || String(productRow.source_id) !== input.sourceId) {
        throw new PublishError("publish/unknown-reference", "Product was not found.");
      }
    }
    if (input.productVersionId !== undefined) {
      if (input.productId === undefined) {
        throw new PublishError(
          "publish/invalid-input",
          "Product version requires its product.",
        );
      }
      const version = await tx.query(
        "select id, product_id from product_versions where id = $1",
        [input.productVersionId],
      );
      const versionRow = version.rows[0];
      if (versionRow === undefined || String(versionRow.product_id) !== input.productId) {
        throw new PublishError("publish/unknown-reference", "Product version was not found.");
      }
    }

    let assetId: string | null = null;
    let assetDeduplicated = false;
    let contentHash = sha256Hex(Buffer.from(`skilit:${kind}:${title}`));
    if (input.asset !== undefined && mediaType !== undefined) {
      let stored;
      try {
        stored = await storage.put(singleChunk(input.asset.bytes), { maxBytes });
      } catch {
        // Storage messages can carry filesystem paths; callers get a
        // generic code while operators inspect server-side logs.
        throw new PublishError("publish/storage-failed", "Asset storage failed.");
      }
      contentHash = stored.sha256;
      // First writer owns the SHA-256 record: conflicting source or rights
      // fail closed here rather than inheriting or upgrading access.
      // The message stays generic so no foreign provenance leaks.
      let asset;
      try {
        asset = await createAsset(tx, {
          sha256: stored.sha256,
          mediaType,
          byteLength: stored.byteLength,
          storageKey: stored.storageKey,
          sourceId: input.sourceId,
          rightsClassification: rights,
          sourceUrl,
        });
      } catch (error) {
        if (error instanceof Error && /conflict for duplicate SHA-256/.test(error.message)) {
          throw new PublishError("publish/rights-conflict", "Asset rights conflict.");
        }
        throw new PublishError("publish/internal", "Asset publication failed.");
      }
      assetId = asset.id;
      assetDeduplicated = !stored.created;
    }

    const artifact = await createArtifact(tx, {
      kind,
      title,
      sourceId: input.sourceId,
      contentHash,
      rightsClassification: rights,
      visibility: (input.visibility ?? "private") as "private" | "workspace" | "public",
      workspaceId: input.workspaceId,
      ownerSubject: input.ownerSubject,
      productId: input.productId,
      productVersionId: input.productVersionId,
      summary,
      canonicalText,
      metadata,
    });
    return { artifactId: artifact.id, assetId, assetDeduplicated };
  });

  const enrichment: EnrichmentOutcome[] = [];
  for (const enricher of enrichers) {
    try {
      await invokeProvider(enricher, { artifactId: published.artifactId }, { timeoutMs });
      enrichment.push({
        providerId: enricher.id,
        capability: enricher.capability,
        ok: true,
      });
    } catch (error) {
      enrichment.push({
        providerId: enricher.id,
        capability: enricher.capability,
        ok: false,
        errorCode:
          error instanceof ProviderError ? error.code : "provider/failed",
      });
    }
  }

  return {
    status: enrichment.some((entry) => !entry.ok) ? "partial" : "published",
    ...published,
    enrichment,
  };
}
