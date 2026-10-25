import type { DbTransaction } from "../../db/src/db.ts";
import {
  createArtifact,
  createAsset,
  type ArtifactKind,
} from "../../db/src/graph.ts";

/**
 * G06-01 asset registry: unified metadata, search, and rights-gated
 * resolution for icons, logos, and fonts over the canonical
 * artifact/asset graph. No new tables: registry fields live in artifact
 * metadata, provenance in source bindings, and byte identity in the
 * content-addressed asset store.
 *
 * Serving posture is fail-closed: only records with permitted rights, a
 * redistributable license, and no trademark claim resolve to downloadable
 * bytes. Everything else resolves to metadata-only with an explicit
 * reason. A result without provenance and a serving policy is incomplete
 * by product contract, so both are always attached.
 *
 * Corpus scope: the asset corpus is workspace-global by canonical domain
 * design (artifacts bind to sources, never to workspaces, exactly like
 * the Iconify/Fontsource donor corpora). Artifact visibility labels guide
 * downstream sharing surfaces; access enforcement lives at the
 * collection/reference layer, whose tables carry workspace bindings.
 * Callers authenticate and authorize workspace scope before registering
 * or presenting records. Content hashes are identifiers, not bytes:
 * any future byte-serve layer MUST re-check the serving policy before
 * releasing a single byte.
 */

export type RegistryKind = "icon" | "logo" | "font";
export type AssetSearchKind = RegistryKind | "screen";
export type ServingDecision = "download" | "metadata-only";

const REGISTRY_KINDS: readonly string[] = ["icon", "logo", "font"];
// Search is additive: explicitly requested research screens are readable
// as metadata only. Registration remains icon/logo/font, and default
// asset search retains its prior three kinds for backward compatibility.
const SEARCH_KINDS: readonly string[] = [...REGISTRY_KINDS, "screen"];

/**
 * Licenses whose terms permit redistribution of the bytes. Anything
 * else — including unknown and attribution-conditional licenses, which
 * need per-use handling this grain does not model — resolves to
 * metadata-only.
 */
const REDISTRIBUTABLE_LICENSES: readonly string[] = [
  "MIT",
  "Apache-2.0",
  "ISC",
  "CC0-1.0",
  "OFL-1.1",
];

export interface RegistryMetadata {
  /** Collection identity, e.g. "iconify:mdi" or "fontsource". */
  collection?: string;
  /** Collection-scoped name, e.g. "arrow-right" or "Inter". */
  ref?: string;
  /** Searchable aliases; bounded at registration. */
  tags?: string[];
  /** SPDX identifier or "unknown". */
  license?: string;
  /** Brand/trademark claim; when true, bytes never serve. */
  trademark?: boolean;
  /** Brand-guideline URL, recorded separately from code license. */
  trademarkGuidelinesUrl?: string;
  /** Known variants, e.g. light/dark/monochrome/mark/wordmark. */
  variants?: string[];
  /** Set by registration: whether distributable bytes exist. */
  bytesRegistered?: boolean;
}

export interface AssetRecord {
  artifactId: string;
  kind: AssetSearchKind;
  title: string;
  summary: string | null;
  collection: string | null;
  ref: string | null;
  tags: string[];
  license: string;
  trademark: boolean;
  trademarkGuidelinesUrl: string | null;
  variants: string[];
  rightsClassification: string;
  visibility: string;
  sourceKey: string;
  contentHash: string;
  serving: ServingDecision;
  servingReason: string;
}

export class RegistryError extends Error {
  readonly code: "assets/invalid-record" | "assets/not-found";
  constructor(code: RegistryError["code"], message: string) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
  }
}

const MAX_TAGS = 20;
const MAX_TAG_CHARS = 64;
const MAX_TEXT_CHARS = 500;
const MAX_VARIANTS = 12;

function validateRegistryMetadata(metadata: unknown): RegistryMetadata {
  if (metadata === undefined || metadata === null) return {};
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new RegistryError("assets/invalid-record", "Asset metadata is invalid.");
  }
  const record = metadata as Record<string, unknown>;
  const validated: RegistryMetadata = {};
  if (record.collection !== undefined) {
    if (
      typeof record.collection !== "string" ||
      record.collection.length === 0 ||
      record.collection.length > MAX_TEXT_CHARS
    ) {
      throw new RegistryError("assets/invalid-record", "Asset collection is invalid.");
    }
    validated.collection = record.collection;
  }
  if (record.ref !== undefined) {
    if (typeof record.ref !== "string" || record.ref.length === 0 || record.ref.length > MAX_TEXT_CHARS) {
      throw new RegistryError("assets/invalid-record", "Asset reference is invalid.");
    }
    validated.ref = record.ref;
  }
  if (record.tags !== undefined) {
    if (
      !Array.isArray(record.tags) ||
      record.tags.length > MAX_TAGS ||
      record.tags.some((tag) => typeof tag !== "string" || tag.length === 0 || tag.length > MAX_TAG_CHARS)
    ) {
      throw new RegistryError("assets/invalid-record", "Asset tags are invalid.");
    }
    validated.tags = [...(record.tags as string[])];
  }
  if (record.license !== undefined) {
    if (typeof record.license !== "string" || record.license.length === 0 || record.license.length > 64) {
      throw new RegistryError("assets/invalid-record", "Asset license is invalid.");
    }
    // Trim-only canonicalization: exact SPDX match stays the policy
    // boundary, so "mit" remains metadata-only rather than downloading
    // on a reinterpreted claim.
    validated.license = record.license.trim();
  }
  if (record.trademark !== undefined) {
    if (typeof record.trademark !== "boolean") {
      throw new RegistryError("assets/invalid-record", "Asset trademark flag is invalid.");
    }
    validated.trademark = record.trademark;
  }
  if (record.trademarkGuidelinesUrl !== undefined) {
    const url = record.trademarkGuidelinesUrl;
    if (typeof url !== "string" || url.length > 2048) {
      throw new RegistryError("assets/invalid-record", "Trademark guidelines URL is invalid.");
    }
    let host = "";
    try {
      host = new URL(url).host;
    } catch {
      host = "";
    }
    if (host.length === 0 || !(url.startsWith("http://") || url.startsWith("https://"))) {
      throw new RegistryError("assets/invalid-record", "Trademark guidelines URL is invalid.");
    }
    // Metadata only: any future fetcher must apply capture guards
    // (no loopback/private/metadata targets, redirect revalidation).
    validated.trademarkGuidelinesUrl = url;
  }
  if (record.variants !== undefined) {
    if (
      !Array.isArray(record.variants) ||
      record.variants.length > MAX_VARIANTS ||
      record.variants.some(
        (variant) => typeof variant !== "string" || variant.length === 0 || variant.length > MAX_TEXT_CHARS,
      )
    ) {
      throw new RegistryError("assets/invalid-record", "Asset variants are invalid.");
    }
    validated.variants = [...(record.variants as string[])];
  }
  if (record.bytesRegistered !== undefined) {
    if (typeof record.bytesRegistered !== "boolean") {
      throw new RegistryError("assets/invalid-record", "Asset bytes flag is invalid.");
    }
    validated.bytesRegistered = record.bytesRegistered;
  }
  return validated;
}

function validateKind(kind: string): RegistryKind {
  if (!REGISTRY_KINDS.includes(kind)) {
    throw new RegistryError("assets/invalid-record", "Asset kind is invalid.");
  }
  return kind as RegistryKind;
}

/**
 * Derive the serving policy from rights, license, and trademark state.
 * Fail-closed: unknown licenses, non-permitted rights, and any
 * trademark claim all resolve to metadata-only.
 */
export function servingPolicy(input: {
  rightsClassification: string;
  license: string;
  trademark: boolean;
}): { serving: ServingDecision; reason: string } {
  if (input.trademark) {
    return { serving: "metadata-only", reason: "Trademark claim requires brand-owner permission." };
  }
  if (input.rightsClassification !== "permitted") {
    return {
      serving: "metadata-only",
      reason: `Rights classification ${input.rightsClassification} forbids redistribution.`,
    };
  }
  if (!REDISTRIBUTABLE_LICENSES.includes(input.license)) {
    return {
      serving: "metadata-only",
      reason: `License ${input.license} is not cleared for redistribution.`,
    };
  }
  return { serving: "download", reason: "Permitted rights with a redistributable license." };
}

function toRecord(row: Record<string, unknown>): AssetRecord {
  let metadata: unknown = row.metadata;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      throw new RegistryError("assets/invalid-record", "Asset metadata is corrupt.");
    }
  }
  const validated = validateRegistryMetadata(metadata);
  const license = validated.license ?? "unknown";
  const trademark = validated.trademark ?? false;
  const rights = String(row.rights_classification);
  let policy = servingPolicy({ rightsClassification: rights, license, trademark });
  if (policy.serving === "download" && validated.bytesRegistered !== true) {
    policy = { serving: "metadata-only", reason: "No distributable bytes registered." };
  }
  return {
    artifactId: String(row.id),
    kind: String(row.kind) as AssetSearchKind,
    title: String(row.title),
    summary: row.summary === null ? null : String(row.summary),
    collection: validated.collection ?? null,
    ref: validated.ref ?? null,
    tags: validated.tags ?? [],
    license,
    trademark,
    trademarkGuidelinesUrl: validated.trademarkGuidelinesUrl ?? null,
    variants: validated.variants ?? [],
    rightsClassification: rights,
    visibility: String(row.visibility),
    sourceKey: String(row.source_key),
    contentHash: String(row.content_hash),
    serving: policy.serving,
    servingReason: policy.reason,
  };
}

const RECORD_COLUMNS =
  `a.id, a.kind, a.title, a.summary, a.metadata, a.rights_classification,
   a.visibility, a.content_hash, s.key as source_key`;

/**
 * Register an asset record. Callers authenticate and authorize before
 * registering: source bindings and rights/license claims are
 * caller-attested corpus input, enforced downstream at collection and
 * serving layers. Byte-backed records reference a stored asset hash.
 */
export async function registerAsset(
  tx: DbTransaction,
  input: {
    kind: string;
    title: string;
    summary?: string;
    sourceId: string;
    productId?: string;
    contentHash: string;
    rightsClassification: string;
    visibility?: string;
    workspaceId?: string;
    ownerSubject?: string;
    metadata?: unknown;
    asset?: {
      sha256: string;
      mediaType: string;
      byteLength: number;
      storageKey: string;
    };
  },
): Promise<AssetRecord> {
  const kind: ArtifactKind = validateKind(input.kind);
  if (typeof input.title !== "string" || input.title.trim().length === 0 || input.title.length > 500) {
    throw new RegistryError("assets/invalid-record", "Asset title is invalid.");
  }
  if (input.summary !== undefined && (typeof input.summary !== "string" || input.summary.length > 2000)) {
    throw new RegistryError("assets/invalid-record", "Asset summary is invalid.");
  }
  if (!/^[0-9a-f]{64}$/.test(input.contentHash)) {
    throw new RegistryError("assets/invalid-record", "Content hash is invalid.");
  }
  const metadata = validateRegistryMetadata(input.metadata);
  // Authoritative: callers cannot self-assert distributable bytes.
  metadata.bytesRegistered = input.asset !== undefined;
  const rights = String(input.rightsClassification);
  if (!["unknown", "metadata_only", "permitted", "restricted"].includes(rights)) {
    throw new RegistryError("assets/invalid-record", "Rights classification is invalid.");
  }
  const visibility = input.visibility ?? "private";
  if (!["private", "workspace", "public"].includes(visibility)) {
    throw new RegistryError("assets/invalid-record", "Visibility is invalid.");
  }
  if (input.asset !== undefined) {
    if (
      !/^[0-9a-f]{64}$/.test(input.asset.sha256) ||
      typeof input.asset.mediaType !== "string" ||
      !Number.isInteger(input.asset.byteLength) ||
      input.asset.byteLength <= 0 ||
      typeof input.asset.storageKey !== "string" ||
      input.asset.storageKey.length === 0
    ) {
      throw new RegistryError("assets/invalid-record", "Asset bytes reference is invalid.");
    }
    await createAsset(tx, {
      sha256: input.asset.sha256,
      mediaType: input.asset.mediaType,
      byteLength: input.asset.byteLength,
      storageKey: input.asset.storageKey,
      sourceId: input.sourceId,
      rightsClassification: rights as "unknown" | "metadata_only" | "permitted" | "restricted",
    });
  }
  const artifact = await createArtifact(tx, {
    kind,
    title: input.title.trim(),
    sourceId: input.sourceId,
    contentHash: input.contentHash,
    rightsClassification: rights as "unknown" | "metadata_only" | "permitted" | "restricted",
    productId: input.productId,
    summary: input.summary,
    visibility: visibility as "private" | "workspace" | "public",
    workspaceId: input.workspaceId,
    ownerSubject: input.ownerSubject,
    metadata: metadata as Record<string, unknown>,
  });
  const record = await tx.query(
    `select ${RECORD_COLUMNS} from artifacts a join sources s on s.id = a.source_id
     where a.id = $1`,
    [artifact.id],
  );
  const row = record.rows[0];
  if (row === undefined) {
    throw new RegistryError("assets/not-found", "Asset record was not found.");
  }
  return toRecord(row);
}

export interface AssetSearch {
  query: string;
  kinds?: AssetSearchKind[] | undefined;
  rights?: string[] | undefined;
  licenses?: string[] | undefined;
  trademarkFree?: boolean | undefined;
  collection?: string | undefined;
  limit?: number | undefined;
  /**
   * AF-03b zero-based row offset for opaque cursor pagination. Defaults
   * to 0. Callers must use the canonical cursor helpers in
   * apps/web/lib/agent-contract.ts; raw offsets are an internal detail.
   */
  offset?: number | undefined;
  /** Add access-scoped facet counts to the response. */
  includeFacets?: boolean | undefined;
}

export interface AssetFacetCount {
  value: string;
  count: number;
}

export interface AssetSearchFacets {
  kinds: AssetFacetCount[];
  rights: AssetFacetCount[];
  licenses: AssetFacetCount[];
  collections: AssetFacetCount[];
}

export type AssetSearchMode = "postgres-fts" | "literal-like";

export interface AssetSearchDetailedResult {
  assets: AssetRecord[];
  searchMode: AssetSearchMode;
  facets?: AssetSearchFacets | undefined;
}

const SEARCH_MAX_LIMIT = 50;
const SEARCH_MAX_OFFSET = 1_000_000;
const SEARCH_VECTOR =
  "to_tsvector('simple', coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || " +
  "coalesce(a.canonical_text, '') || ' ' || coalesce(a.metadata->>'collection', '') || ' ' || " +
  "coalesce(a.metadata->>'ref', ''))";
const SEARCH_LIKE_ESCAPE = "escape E'\\\\'";

interface AssetSearchPlan {
  params: unknown[];
  ftsWhere: string;
  literalWhere: string;
  searchText: string;
}

function buildAssetSearchPlan(search: AssetSearch, actorId: string | null): AssetSearchPlan {
  if (typeof search.query !== "string" || search.query.trim().length === 0 || search.query.trim().length > 200) {
    throw new RegistryError("assets/invalid-record", "Search query is invalid.");
  }
  const limit = search.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
    throw new RegistryError("assets/invalid-record", "Search limit is invalid.");
  }
  const offset = search.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > SEARCH_MAX_OFFSET) {
    throw new RegistryError("assets/invalid-record", "Search cursor is invalid.");
  }
  if (search.includeFacets !== undefined && typeof search.includeFacets !== "boolean") {
    throw new RegistryError("assets/invalid-record", "Facet option is invalid.");
  }
  if (search.trademarkFree !== undefined && typeof search.trademarkFree !== "boolean") {
    throw new RegistryError("assets/invalid-record", "Trademark filter is invalid.");
  }
  if (search.collection !== undefined &&
      (typeof search.collection !== "string" || search.collection.trim().length === 0 ||
       search.collection.length > 200)) {
    throw new RegistryError("assets/invalid-record", "Collection filter is invalid.");
  }

  const kinds = search.kinds ?? (["icon", "logo", "font"] as AssetSearchKind[]);
  if (!Array.isArray(kinds) || kinds.length === 0 ||
      kinds.length > SEARCH_KINDS.length ||
      kinds.some((kind) => typeof kind !== "string" || !SEARCH_KINDS.includes(kind)) ||
      new Set(kinds).size !== kinds.length) {
    throw new RegistryError("assets/invalid-record", "Asset kinds are invalid.");
  }

  const searchText = search.query.trim();
  const escaped = searchText.toLowerCase().replace(/[\\%_]/g, (char) => "\\" + char);
  const params: unknown[] = [searchText, "%" + escaped + "%"];
  const kindPlaceholders = kinds.map((kind) => {
    params.push(kind);
    return "$" + params.length;
  });
  const filters: string[] = ["a.kind in (" + kindPlaceholders.join(", ") + ")"];

  if (search.rights !== undefined) {
    const allowedRights = ["unknown", "metadata_only", "permitted", "restricted"];
    if (search.rights.length === 0 || search.rights.length > allowedRights.length ||
        search.rights.some((right) => typeof right !== "string" || !allowedRights.includes(right)) ||
        new Set(search.rights).size !== search.rights.length) {
      throw new RegistryError("assets/invalid-record", "Rights filter is invalid.");
    }
    const placeholders = search.rights.map((right) => {
      params.push(right);
      return "$" + params.length;
    });
    filters.push("a.rights_classification in (" + placeholders.join(", ") + ")");
  }

  if (search.licenses !== undefined) {
    if (search.licenses.length === 0 || search.licenses.length > 32 ||
        search.licenses.some((license) => typeof license !== "string" ||
          license.length === 0 || license.length > 64) ||
        new Set(search.licenses).size !== search.licenses.length) {
      throw new RegistryError("assets/invalid-record", "License filter is invalid.");
    }
    const placeholders = search.licenses.map((license) => {
      params.push(license);
      return "$" + params.length;
    });
    filters.push("coalesce(a.metadata->>'license', 'unknown') in (" + placeholders.join(", ") + ")");
  }

  if (search.trademarkFree !== undefined) {
    params.push(!search.trademarkFree);
    filters.push("coalesce((a.metadata->>'trademark')::boolean, false) = $" + params.length);
  }

  if (search.collection !== undefined) {
    params.push(search.collection.trim());
    filters.push("coalesce(a.metadata->>'collection', '') = $" + params.length);
  }

  // Access control is part of the SQL predicate before row ranking, facets,
  // counts, or pagination. Never compute facets from an unscoped corpus.
  // Research screens can be globally visible only when explicitly public.
  // Legacy global/private non-registry rows must stay hidden, matching
  // AF-SEC-00 getArtifactForActor instead of using the old registry shortcut.
  const globalReadable =
    "(a.workspace_id is null and (a.kind in ('icon', 'logo', 'font') or a.visibility = 'public'))";
  let scopeFilter = globalReadable;
  if (actorId !== null) {
    params.push(actorId);
    const memberParam = "$" + params.length;
    params.push(actorId);
    const ownerParam = "$" + params.length;
    scopeFilter =
      "(" + globalReadable + " or (a.workspace_id is not null and exists (" +
      "select 1 from workspace_members m where m.workspace_id = a.workspace_id " +
      "and m.user_id = " + memberParam + " and (" +
      "a.visibility = 'workspace' or a.visibility = 'public' or " +
      "(a.visibility = 'private' and a.owner_subject = " + ownerParam + ")" +
      "))))";
  }
  filters.push(scopeFilter);

  // FTS gives token relevance; literal matching preserves historic substring
  // behavior and searches JSON tags. Literal matching is also the fallback.
  const literalWhere =
    "(lower(a.title) like $2 " + SEARCH_LIKE_ESCAPE + " or " +
    "lower(coalesce(a.summary, '')) like $2 " + SEARCH_LIKE_ESCAPE + " or " +
    "lower(coalesce(a.canonical_text, '')) like $2 " + SEARCH_LIKE_ESCAPE + " or " +
    "lower(coalesce(a.metadata->>'collection', '')) like $2 " + SEARCH_LIKE_ESCAPE + " or " +
    "lower(coalesce(a.metadata->>'ref', '')) like $2 " + SEARCH_LIKE_ESCAPE + " or " +
    "exists (select 1 from jsonb_array_elements_text(" +
    "case when jsonb_typeof(a.metadata->'tags') = 'array' " +
    "then a.metadata->'tags' else '[]'::jsonb end) as tag " +
    "where lower(tag) like $2 " + SEARCH_LIKE_ESCAPE + "))";
  const ftsWhere = "((" + SEARCH_VECTOR + " @@ plainto_tsquery('simple', $1)) or " +
    literalWhere + ")";
  const suffix = filters.join(" and ");
  return {
    params,
    searchText,
    ftsWhere: ftsWhere + " and " + suffix,
    literalWhere: literalWhere + " and " + suffix,
  };
}

function ftsCapabilityUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:to_tsvector|plainto_tsquery|ts_rank|tsvector|GIN).{0,160}(?:does not exist|not supported|unsupported|unavailable)|(?:does not exist|not supported|unsupported|unavailable).{0,160}(?:to_tsvector|plainto_tsquery|ts_rank|tsvector|GIN)/i.test(message);
}

/**
 * Unified deterministic lexical search across icons, logos, and fonts.
 * PostgreSQL full-text search ranks token matches; literal matching
 * preserves substring queries and JSON-tag search. This is lexical search,
 * not semantic search, and never silently enables embeddings.
 *
 * AF-SEC-00: authorization is applied in the database predicate before
 * ranking and facet aggregation. The unscoped search only sees global rows.
 */
export async function searchAssetsDetailed(
  tx: DbTransaction,
  search: AssetSearch,
): Promise<AssetSearchDetailedResult> {
  return searchAssetsScopedDetailed(tx, search, null);
}

export async function searchAssetsForActorDetailed(
  tx: DbTransaction,
  search: AssetSearch,
  actorId: string,
): Promise<AssetSearchDetailedResult> {
  if (typeof actorId !== "string" || actorId.length === 0) {
    throw new RegistryError("assets/invalid-record", "Actor is invalid.");
  }
  return searchAssetsScopedDetailed(tx, search, actorId);
}

export async function searchAssets(
  tx: DbTransaction,
  search: AssetSearch,
): Promise<AssetRecord[]> {
  return (await searchAssetsDetailed(tx, search)).assets;
}

export async function searchAssetsForActor(
  tx: DbTransaction,
  search: AssetSearch,
  actorId: string,
): Promise<AssetRecord[]> {
  return (await searchAssetsForActorDetailed(tx, search, actorId)).assets;
}

async function searchAssetsScopedDetailed(
  tx: DbTransaction,
  search: AssetSearch,
  actorId: string | null,
): Promise<AssetSearchDetailedResult> {
  const plan = buildAssetSearchPlan(search, actorId);
  const limit = search.limit ?? 20;
  const offset = search.offset ?? 0;
  let rows: Record<string, unknown>[];
  let searchMode: AssetSearchMode = "postgres-fts";
  try {
    if (/[%_\\]/.test(plan.searchText)) {
      // Preserve legacy literal semantics when punctuation is meaningful
      // (for example, an underscore must not normalize to a space).
      searchMode = "literal-like";
      const params = [...plan.params, limit, offset];
      const limitParam = "$" + (params.length - 1);
      const offsetParam = "$" + params.length;
      const result = await tx.query(
        "select " + RECORD_COLUMNS + " from artifacts a join sources s on s.id = a.source_id " +
        "where $1::text is not null and " + plan.literalWhere + " order by a.title, a.id limit " +
        limitParam + " offset " + offsetParam,
        params,
      );
      rows = result.rows;
    } else {
      const params = [...plan.params, limit, offset];
      const limitParam = "$" + (params.length - 1);
      const offsetParam = "$" + params.length;
      const result = await tx.query(
        "select " + RECORD_COLUMNS + " from artifacts a join sources s on s.id = a.source_id " +
        "where " + plan.ftsWhere + " " +
        "order by case when " + SEARCH_VECTOR + " @@ plainto_tsquery('simple', $1) " +
        "then ts_rank(" + SEARCH_VECTOR + ", plainto_tsquery('simple', $1)) " +
        "else 0::real end desc, a.title, a.id " +
        "limit " + limitParam + " offset " + offsetParam,
        params,
      );
      rows = result.rows;
    }
  } catch (error) {
    if (!ftsCapabilityUnavailable(error)) throw error;
    searchMode = "literal-like";
    const params = [...plan.params, limit, offset];
    const limitParam = "$" + (params.length - 1);
    const offsetParam = "$" + params.length;
    const result = await tx.query(
      "select " + RECORD_COLUMNS + " from artifacts a join sources s on s.id = a.source_id " +
      "where $1::text is not null and " + plan.literalWhere + " order by a.title, a.id limit " +
      limitParam + " offset " + offsetParam,
      params,
    );
    rows = result.rows;
  }

  const response: AssetSearchDetailedResult = {
    assets: rows.map(toRecord),
    searchMode,
  };
  if (search.includeFacets === true) {
    response.facets = await queryAssetSearchFacets(tx, plan, searchMode);
  }
  return response;
}

async function queryAssetSearchFacets(
  tx: DbTransaction,
  plan: AssetSearchPlan,
  searchMode: AssetSearchMode,
): Promise<AssetSearchFacets> {
  const where = searchMode === "postgres-fts" ? plan.ftsWhere : "$1::text is not null and " + plan.literalWhere;
  const result = await tx.query(
    "with matched as (" +
    " select a.kind, a.rights_classification, a.metadata " +
    " from artifacts a join sources s on s.id = a.source_id where " + where +
    ") " +
    "select f.facet, f.value, count(*)::int as count from matched a " +
    "cross join lateral (values " +
    "('kinds'::text, a.kind::text), " +
    "('rights'::text, a.rights_classification::text), " +
    "('licenses'::text, coalesce(a.metadata->>'license', 'unknown')), " +
    "('collections'::text, nullif(a.metadata->>'collection', '')) " +
    ") as f(facet, value) where f.value is not null " +
    "group by f.facet, f.value order by f.facet, f.value",
    plan.params,
  );
  const facets: AssetSearchFacets = { kinds: [], rights: [], licenses: [], collections: [] };
  for (const row of result.rows) {
    const facet = String(row.facet) as keyof AssetSearchFacets;
    if (facet in facets) {
      facets[facet].push({ value: String(row.value), count: Number(row.count) });
    }
  }
  return facets;
}

/**
 * Resolve one record by artifact ID with its serving policy. Downloadable
 * records include the content hash for byte retrieval; metadata-only
 * records never do.
 *
 * AF-SEC-00: the unscoped resolver serves global corpus rows only
 * (workspace_id IS NULL). Workspace-bound rows require
 * resolveAssetForActor. Use resolveAssetForActor for every authenticated
 * metadata path.
 */
export async function resolveAsset(
  tx: DbTransaction,
  artifactId: string,
): Promise<AssetRecord> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artifactId)) {
    throw new RegistryError("assets/not-found", "Asset record was not found.");
  }
  const result = await tx.query(
    `select ${RECORD_COLUMNS} from artifacts a join sources s on s.id = a.source_id
     where a.id = $1 and a.kind in ('icon', 'logo', 'font') and a.workspace_id is null`,
    [artifactId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new RegistryError("assets/not-found", "Asset record was not found.");
  }
  return toRecord(row);
}

export async function resolveAssetForActor(
  tx: DbTransaction,
  artifactId: string,
  actorId: string,
): Promise<AssetRecord> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(artifactId)) {
    throw new RegistryError("assets/not-found", "Asset record was not found.");
  }
  if (typeof actorId !== "string" || actorId.length === 0) {
    throw new RegistryError("assets/invalid-record", "Actor is invalid.");
  }
  const result = await tx.query(
    `select ${RECORD_COLUMNS} from artifacts a join sources s on s.id = a.source_id
     where a.id = $1 and a.kind in ('icon', 'logo', 'font', 'screen')
       and ((a.workspace_id is null and
          (a.kind in ('icon', 'logo', 'font') or a.visibility = 'public'))
        or (a.workspace_id is not null and exists (
         select 1 from workspace_members m where m.workspace_id = a.workspace_id
           and m.user_id = $2 and (a.visibility = 'workspace' or a.visibility = 'public' or
             (a.visibility = 'private' and a.owner_subject = $3)))))`,
    [artifactId, actorId, actorId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new RegistryError("assets/not-found", "Asset record was not found.");
  }
  return toRecord(row);
}
