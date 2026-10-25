import type { DbClient } from "../../../packages/db/src/db.ts";
import { resolveAssetForActor, searchAssetsForActorDetailed } from "../../../packages/assets/src/registry.ts";
import type { AssetSearchKind } from "../../../packages/assets/src/registry.ts";
import { SIMILARITY_KINDS, compareArtifactsForActor, findSimilarForActor } from "../../../packages/assets/src/similarity.ts";
import type { ComparedSide } from "../../../packages/assets/src/similarity.ts";
import { getFlowStepsForActor, listFlowsForActor } from "../../../packages/ingest/src/corpus.ts";
import { ChangesError, getChangesForActor } from "../../../packages/db/src/changes.ts";
import { GalleryError, listProductsForActor, listProductVersionsForActor } from "../../../packages/db/src/gallery.ts";
import { PatternError, getPatternForActor, listPatternsForActor } from "../../../packages/db/src/patterns.ts";
import {
  ReplayError,
  closeReplaySession,
  getReplayEvents,
  openReplaySession,
  recordReplayEvents,
} from "../../../packages/db/src/replay.ts";
import { getArtifactForActor } from "../../../packages/db/src/artifact-access.ts";
import { searchRegistryIndex } from "./registry.ts";
import { listReferences } from "../../../packages/db/src/collections.ts";
import { exportReferencePack, parseSkilitUri } from "./reference-packs.ts";
import {
  AGENT_SCHEMA_VERSION,
  AgentContractError,
  computedProvenance,
  decodeCursor,
  encodeCursor,
  failureEnvelope,
  newRequestId,
  observedProvenance,
  parseSearchLimit,
  requireCapability,
  successEnvelope,
} from "./agent-contract.ts";
import type { AgentEnvelope } from "./agent-contract.ts";

/**
 * AF-03b REST API v1 read parity: the human/UI-readable surface over the
 * same canonical envelope the MCP tools serve. Versioned by URL (/api/v1)
 * for transport and by skilit.agent.v1 for the envelope; breaking envelope
 * changes require a governed contract revision. Every endpoint requires a
 * session-bound identity; unknown and denied objects both answer
 * FORBIDDEN_OR_NOT_FOUND so existence is not an oracle.
 *
 * All domain bodies are AgentEnvelope. HTTP statuses derive from the one
 * canonical error catalog in agent-contract.ts.
 */

export interface RestResult {
  status: number;
  body: AgentEnvelope;
}

function agentAssetView(record: {
  artifactId: string;
  kind: string;
  title: string;
  license: string;
  rightsClassification: string;
  serving: string;
  servingReason: string;
  sourceKey: string;
  contentHash: string;
}): Record<string, unknown> {
  return {
    uri: `skilit://artifact/${record.artifactId}`,
    kind: record.kind,
    title: record.title,
    license: record.license,
    rights: record.rightsClassification,
    serving: record.serving,
    servingReason: record.servingReason,
    source: record.sourceKey,
    contentHash: record.contentHash,
  };
}

const REGISTRY_KINDS = ["icon", "logo", "font", "screen"] as const;

/** The three failure answers every REST route returns, in one place. */
export function invalidInput(requestId: string, message: string): RestResult {
  const err = new AgentContractError("INVALID_INPUT", { message, requestId });
  return { status: err.httpStatus, body: err.toFailureEnvelope() };
}

export function notFound(requestId: string): RestResult {
  const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
  return { status: err.httpStatus, body: err.toFailureEnvelope() };
}

export function opaque(requestId: string): RestResult {
  const err = new AgentContractError("INTERNAL_OPAQUE", { requestId });
  return { status: err.httpStatus, body: err.toFailureEnvelope() };
}

/** GET /api/v1/assets — unified search with facet filters and cursor pagination.
 *
 * AF-SEC-00: actor-scoped. The caller identity is server-resolved by the
 * route; public rows plus workspace rows readable by that actor are
 * returned. Scope filters before rank/facets/caching.
 *
 * AF-03b: versioned envelope with request_id, typed result, cursor for
 * pagination, and canonical INVALID_INPUT for malformed pagination.
 */
export async function searchAssetsRoute(
  db: DbClient,
  query: Record<string, string | string[] | undefined>,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  const rawQuery = query.query;
  if (typeof rawQuery !== "string" || rawQuery.trim().length === 0 || rawQuery.trim().length > 200) {
    return invalidInput(requestId, "Search query is invalid.");
  }
  const csvFilter = (value: string | string[] | undefined): string[] | undefined => {
    if (value === undefined) return undefined;
    const values = (Array.isArray(value) ? value.join(",") : value).split(",").map((item) => item.trim());
    if (values.length === 0 || values.some((item) => item.length === 0 || item.length > 64)) {
      throw new Error("filter-invalid");
    }
    return values;
  };
  let kinds: string[] | undefined;
  let rights: string[] | undefined;
  let licenses: string[] | undefined;
  try {
    kinds = csvFilter(query.kinds);
    rights = csvFilter(query.rights);
    licenses = csvFilter(query.licenses);
  } catch {
    return invalidInput(requestId, "Search filters are invalid.");
  }
  if (kinds !== undefined) {
    const allowedKinds = REGISTRY_KINDS as readonly string[];
    if (
      kinds.length === 0 ||
      kinds.length > allowedKinds.length ||
      kinds.some((kind) => !allowedKinds.includes(kind)) ||
      new Set(kinds).size !== kinds.length
    ) {
      return invalidInput(requestId, "Search kinds are invalid.");
    }
  }
  const allowedRights = ["unknown", "metadata_only", "permitted", "restricted"] as const;
  if (rights !== undefined) {
    if (
      rights.length === 0 ||
      rights.length > allowedRights.length ||
      rights.some((right) => !(allowedRights as readonly string[]).includes(right)) ||
      new Set(rights).size !== rights.length
    ) {
      return invalidInput(requestId, "Search filters are invalid.");
    }
  }
  if (licenses !== undefined) {
    if (
      licenses.length === 0 ||
      licenses.length > 32 ||
      new Set(licenses).size !== licenses.length
    ) {
      return invalidInput(requestId, "Search filters are invalid.");
    }
  }
  let trademarkFree: boolean | undefined;
  if (query.trademarkFree !== undefined) {
    if (query.trademarkFree !== "true" && query.trademarkFree !== "false") {
      return invalidInput(requestId, "Trademark filter is invalid.");
    }
    trademarkFree = query.trademarkFree === "true";
  }
  let includeFacets: boolean | undefined;
  if (query.facets !== undefined) {
    if (query.facets !== "true" && query.facets !== "false") {
      return invalidInput(requestId, "Facet option is invalid.");
    }
    includeFacets = query.facets === "true";
  }
  let collection: string | undefined;
  if (query.collection !== undefined) {
    if (typeof query.collection !== "string" || query.collection.trim().length === 0 ||
        query.collection.length > 200) {
      return invalidInput(requestId, "Collection filter is invalid.");
    }
    collection = query.collection.trim();
  }
  let limit: number;
  try {
    limit = parseSearchLimit(query.limit);
  } catch (thrown) {
    if (thrown instanceof AgentContractError) {
      return { status: thrown.httpStatus, body: thrown.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
  let offset = 0;
  if (query.cursor !== undefined) {
    try {
      offset = decodeCursor(query.cursor);
    } catch (thrown) {
      if (thrown instanceof AgentContractError) {
        const withId = new AgentContractError("INVALID_INPUT", {
          message: "Pagination cursor is invalid.",
          requestId,
        });
        return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
      }
      return opaque(requestId);
    }
  }
  try {
    const search: {
      query: string;
      kinds?: AssetSearchKind[];
      rights?: string[];
      licenses?: string[];
      trademarkFree?: boolean;
      collection?: string;
      includeFacets?: boolean;
      limit: number;
      offset: number;
    } = { query: rawQuery.trim(), limit: limit + 1, offset };
    if (kinds !== undefined) search.kinds = kinds as AssetSearchKind[];
    if (rights !== undefined) search.rights = rights;
    if (licenses !== undefined) search.licenses = licenses;
    if (trademarkFree !== undefined) search.trademarkFree = trademarkFree;
    if (collection !== undefined) search.collection = collection;
    if (includeFacets !== undefined) search.includeFacets = includeFacets;
    const detailed = await searchAssetsForActorDetailed(db, search, actorId);
    const records = detailed.assets;
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const result: Record<string, unknown> = {
      assets: page.map(agentAssetView),
      search_mode: detailed.searchMode,
    };
    if (detailed.facets !== undefined) result.facets = detailed.facets;
    const body = successEnvelope(
      requestId,
      result,
      {
        cursor: hasMore ? encodeCursor(offset + limit) : undefined,
        provenance: computedProvenance(),
      },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, {
        message: error.code === "INVALID_INPUT" ? error.safeMessage : undefined,
        requestId,
      });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    // Registry validation failures are client input; persistence failures
    // stay opaque with no internals.
    if (error instanceof Error && error.name === "RegistryError") {
      return invalidInput(requestId, "Search query is invalid.");
    }
    return opaque(requestId);
  }
}

/** GET /api/v1/assets/[id] — resolve one record with policy.
 *
 * AF-SEC-00: actor-scoped. Unknown and denied identifiers answer alike.
 * AF-03b: restricted rights answer RIGHTS_RESTRICTED (403) after the actor
 * gate passes; unknown/denied/malformed answer FORBIDDEN_OR_NOT_FOUND.
 */
export async function getAssetRoute(
  db: DbClient,
  artifactId: string,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  try {
    const record = await resolveAssetForActor(db, artifactId, actorId);
    if (record.rightsClassification === "restricted") {
      const err = new AgentContractError("RIGHTS_RESTRICTED", {
        requestId,
        provenance: observedProvenance(`skilit://artifact/${artifactId}`),
      });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    const warnings =
      record.serving === "metadata-only" ? [`Rights note: ${record.servingReason}`.slice(0, 512)] : [];
    const body = successEnvelope(
      requestId,
      { asset: agentAssetView(record) },
      {
        warnings: warnings.length > 0 ? warnings : undefined,
        provenance: observedProvenance(`skilit://artifact/${record.artifactId}`),
      },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    // Unknown and malformed identifiers answer alike; unexpected
    // persistence failures stay opaque for operators.
    if (error instanceof Error && error.name === "RegistryError") {
      const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
}

/** GET /api/v1/assets/similar?artifactId= — deterministic similar artifacts.
 *
 * AF-13a-i: lexical Jaccard baseline, no embeddings. AF-SEC-00:
 * actor-scoped with the same no-oracle policy as the other read routes:
 * unknown, denied, and malformed references answer
 * FORBIDDEN_OR_NOT_FOUND, while a readable but restricted reference
 * answers RIGHTS_RESTRICTED (mirroring get_object single-read semantics).
 * Candidates keep search-style list semantics with rights labels.
 */
export async function findSimilarRoute(
  db: DbClient,
  query: Record<string, string | string[] | undefined>,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  const rawId = query.artifactId;
  if (typeof rawId !== "string" || rawId.length === 0) {
    return invalidInput(requestId, "Similar reference is invalid.");
  }
  let kinds: string[] | undefined;
  if (query.kinds !== undefined) {
    const raw = Array.isArray(query.kinds) ? query.kinds.join(",") : query.kinds;
    kinds = raw.split(",").map((item) => item.trim());
    if (
      kinds.length === 0 ||
      kinds.length > SIMILARITY_KINDS.length ||
      kinds.some((kind) => !(SIMILARITY_KINDS as readonly string[]).includes(kind)) ||
      new Set(kinds).size !== kinds.length ||
      kinds.some((kind) => kind.length === 0)
    ) {
      return invalidInput(requestId, "Similar kinds are invalid.");
    }
  }
  let limit: number;
  try {
    limit = parseSearchLimit(query.limit);
  } catch (thrown) {
    if (thrown instanceof AgentContractError) {
      return { status: thrown.httpStatus, body: thrown.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
  let offset = 0;
  if (query.cursor !== undefined) {
    try {
      offset = decodeCursor(query.cursor);
    } catch (thrown) {
      if (thrown instanceof AgentContractError) {
        const withId = new AgentContractError("INVALID_INPUT", {
          message: "Pagination cursor is invalid.",
          requestId,
        });
        return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
      }
      return opaque(requestId);
    }
  }
  try {
    const outcome = await findSimilarForActor(db, {
      artifactId: rawId,
      actorId,
      kinds,
      limit,
      offset,
    });
    if (outcome.reference.rightsClassification === "restricted") {
      const err = new AgentContractError("RIGHTS_RESTRICTED", {
        requestId,
        provenance: observedProvenance(`skilit://artifact/${outcome.reference.artifactId}`),
      });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    const warnings = outcome.truncated
      ? ["Candidate budget reached; results are a reproducible prefix."]
      : [];
    const body = successEnvelope(
      requestId,
      {
        reference: {
          uri: `skilit://artifact/${outcome.reference.artifactId}`,
          kind: outcome.reference.kind,
          title: outcome.reference.title,
        },
        similar: outcome.similar.map((entry) => ({ ...agentAssetView(entry), score: entry.score })),
        total: outcome.total,
        truncated: outcome.truncated,
      },
      {
        cursor: outcome.total > offset + limit ? encodeCursor(offset + limit) : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        partial: outcome.truncated,
        provenance: computedProvenance(`skilit://artifact/${outcome.reference.artifactId}`),
      },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    // Unknown, denied, and malformed references answer alike; unexpected
    // persistence failures stay opaque for operators.
    if (error instanceof Error && error.name === "RegistryError") {
      const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
}

/** GET /api/registry?q=&limit= — deterministic component search.
 *
 * AF-13b-i: query-filtered listing over the same static index the
 * `search_registry` MCP tool serves, in the same canonical envelope so
 * the two surfaces stay deep-equal. The index is public static metadata;
 * no actor scoping applies, but the registry capability gate is enforced
 * exactly like `get_registry_item`.
 */
export async function searchRegistryRoute(
  query: Record<string, string | string[] | undefined>,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  const rawQuery = query.q;
  if (rawQuery !== undefined && (typeof rawQuery !== "string" || rawQuery.length > 200)) {
    return invalidInput(requestId, "Registry query is invalid.");
  }
  let limit: number;
  try {
    limit = parseSearchLimit(query.limit);
  } catch (thrown) {
    if (thrown instanceof AgentContractError) {
      return { status: thrown.httpStatus, body: thrown.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
  try {
    requireCapability("registry", requestId);
    const outcome = searchRegistryIndex(
      typeof rawQuery === "string" ? rawQuery : "",
      limit,
    );
    return {
      status: 200,
      body: successEnvelope(
        requestId,
        { items: outcome.items, total: outcome.total },
        { provenance: observedProvenance() },
      ),
    };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof Error && error.name === "RegistryError") {
      const err = new AgentContractError("NOT_AVAILABLE", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
}

/** GET /api/v1/assets/compare?left=&right= — observed two-artifact diff.
 *
 * AF-13a-ii: deterministic field comparison plus shared/unique lexical
 * terms; states what differs, never why. AF-SEC-00: either identifier is
 * never an oracle (malformed/unknown/denied answer
 * FORBIDDEN_OR_NOT_FOUND alike); a readable-but-restricted artifact on
 * either side answers RIGHTS_RESTRICTED, mirroring get_object.
 */
export async function compareArtifactsRoute(
  db: DbClient,
  query: Record<string, string | string[] | undefined>,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  const rawLeft = query.left;
  const rawRight = query.right;
  if (typeof rawLeft !== "string" || rawLeft.length === 0 || typeof rawRight !== "string" || rawRight.length === 0) {
    return invalidInput(requestId, "Compared references are invalid.");
  }
  try {
    const outcome = await compareArtifactsForActor(db, {
      leftArtifactId: rawLeft,
      rightArtifactId: rawRight,
      actorId,
    });
    if (outcome.left.rightsClassification === "restricted" || outcome.right.rightsClassification === "restricted") {
      const err = new AgentContractError("RIGHTS_RESTRICTED", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    const withUris = (side: ComparedSide) => ({
      uri: `skilit://artifact/${side.artifactId}`,
      kind: side.kind,
      title: side.title,
      summary: side.summary,
      rights: side.rightsClassification,
      license: side.license,
      trademark: side.trademark,
      serving: side.serving,
      servingReason: side.servingReason,
      tags: side.tags,
    });
    const body = successEnvelope(
      requestId,
      {
        left: withUris(outcome.left),
        right: withUris(outcome.right),
        identical: outcome.identical,
        score: outcome.score,
        sharedTerms: outcome.sharedTerms,
        uniqueLeft: outcome.uniqueLeft,
        uniqueRight: outcome.uniqueRight,
        fieldDiffs: outcome.fieldDiffs,
      },
      { provenance: computedProvenance() },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    // Either side is never an oracle; unexpected persistence failures
    // stay opaque for operators.
    if (error instanceof Error && error.name === "RegistryError") {
      const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
}

/** GET /api/v1/flows — actor-scoped flow listing.
 *
 * AF-14a: a flow is listed only when every step artifact is readable
 * by the actor. Unknown and denied flows never appear; budgets report
 * truncated=true with a partial envelope instead of silent prefixes.
 */
export async function listFlowsRoute(
  db: DbClient,
  query: Record<string, string | string[] | undefined>,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  const rawVersion = query.productVersionId;
  if (rawVersion !== undefined && (typeof rawVersion !== "string" || rawVersion.length === 0)) {
    return invalidInput(requestId, "Corpus product version is invalid.");
  }
  let limit: number;
  try {
    limit = parseSearchLimit(query.limit);
  } catch (thrown) {
    if (thrown instanceof AgentContractError) {
      return { status: thrown.httpStatus, body: thrown.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
  let offset = 0;
  if (query.cursor !== undefined) {
    try {
      offset = decodeCursor(query.cursor);
    } catch (thrown) {
      if (thrown instanceof AgentContractError) {
        const withId = new AgentContractError("INVALID_INPUT", {
          message: "Pagination cursor is invalid.",
          requestId,
        });
        return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
      }
      return opaque(requestId);
    }
  }
  try {
    const outcome = await listFlowsForActor(db, {
      actorId,
      productVersionId: typeof rawVersion === "string" ? rawVersion : undefined,
      limit,
      offset,
    });
    const warnings = outcome.truncated ? ["Flow budget reached; results are a reproducible prefix."] : [];
    const body = successEnvelope(
      requestId,
      {
        flows: outcome.flows.map((flow) => ({
          uri: `skilit://flow/${flow.flowId}`,
          productVersionId: flow.productVersionId,
          title: flow.title,
          stepCount: flow.stepCount,
        })),
        total: outcome.total,
        truncated: outcome.truncated,
      },
      {
        cursor: outcome.total > offset + limit ? encodeCursor(offset + limit) : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        partial: outcome.truncated,
        provenance: observedProvenance(),
      },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof Error && error.name === "CorpusError") {
      const code = (error as { code?: unknown }).code;
      if (code === "corpus/not-found") {
        const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        return { status: err.httpStatus, body: err.toFailureEnvelope() };
      }
      return invalidInput(requestId, "Corpus flow query is invalid.");
    }
    return opaque(requestId);
  }
}

/** GET /api/v1/flows/{id}/steps — actor-scoped ordered flow steps.
 *
 * AF-14a: a single unreadable step denies the whole flow as
 * not-found; step existence is never leaked piecemeal.
 */
export async function getFlowStepsRoute(
  db: DbClient,
  flowId: string,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  try {
    const outcome = await getFlowStepsForActor(db, { flowId, actorId });
    const body = successEnvelope(
      requestId,
      {
        flow: {
          uri: `skilit://flow/${outcome.flowId}`,
          productVersionId: outcome.productVersionId,
          title: outcome.title,
        },
        steps: outcome.steps.map((step) => ({
          position: step.position,
          uri: `skilit://artifact/${step.artifactId}`,
          kind: step.kind,
          title: step.title,
          interaction: step.interaction,
        })),
      },
      { provenance: observedProvenance(`skilit://flow/${outcome.flowId}`) },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof Error && error.name === "CorpusError") {
      const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
}

/** GET /api/v1/changes?fromVersionId=&toVersionId= — deterministic version diff.
 *
 * AF-15a: compares two product versions of the same product using only
 * persisted, actor-readable evidence. Unknown, malformed, and denied
 * versions answer FORBIDDEN_OR_NOT_FOUND alike; cross-product pairs
 * answer INVALID_INPUT as unsupported. Result shape is deep-equal to
 * the get_changes MCP tool by construction.
 */
export async function getChangesRoute(
  db: DbClient,
  query: Record<string, string | string[] | undefined>,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  const rawFrom = query.fromVersionId;
  const rawTo = query.toVersionId;
  if (typeof rawFrom !== "string" || rawFrom.length === 0 || typeof rawTo !== "string" || rawTo.length === 0) {
    return invalidInput(requestId, "Version comparison is invalid.");
  }
  let limit: number;
  try {
    limit = parseSearchLimit(query.limit);
  } catch (thrown) {
    if (thrown instanceof AgentContractError) {
      return { status: thrown.httpStatus, body: thrown.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
  let offset = 0;
  if (query.cursor !== undefined) {
    try {
      offset = decodeCursor(query.cursor);
    } catch (thrown) {
      if (thrown instanceof AgentContractError) {
        const withId = new AgentContractError("INVALID_INPUT", {
          message: "Pagination cursor is invalid.",
          requestId,
        });
        return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
      }
      return opaque(requestId);
    }
  }
  try {
    const outcome = await getChangesForActor(db, {
      actorId,
      fromVersionId: rawFrom,
      toVersionId: rawTo,
      limit,
      offset,
    });
    const body = successEnvelope(
      requestId,
      {
        productId: outcome.productId,
        fromVersionId: outcome.fromVersionId,
        toVersionId: outcome.toVersionId,
        fromVersionNo: outcome.fromVersionNo,
        toVersionNo: outcome.toVersionNo,
        identical: outcome.identical,
        changes: outcome.changes,
        total: outcome.total,
      },
      {
        cursor: outcome.total > offset + limit ? encodeCursor(offset + limit) : undefined,
        provenance: computedProvenance(),
      },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof Error && error.name === "ChangesError") {
      const code = (error as { code?: unknown }).code;
      if (code === "changes/not-found") {
        const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        return { status: err.httpStatus, body: err.toFailureEnvelope() };
      }
      return invalidInput(requestId, "Version comparison is invalid.");
    }
    return opaque(requestId);
  }
}

/** GET /api/v1/products — actor-scoped product gallery.
 *
 * AF-14d: a product is listed only when at least one of its artifacts
 * is readable by the actor. Unknown products and fully-withheld
 * products both read as an empty list, never as an oracle.
 */
export async function listProductsRoute(
  db: DbClient,
  query: Record<string, string | string[] | undefined>,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  let limit: number;
  try {
    limit = parseSearchLimit(query.limit);
  } catch (thrown) {
    if (thrown instanceof AgentContractError) {
      return { status: thrown.httpStatus, body: thrown.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
  let offset = 0;
  if (query.cursor !== undefined) {
    try {
      offset = decodeCursor(query.cursor);
    } catch (thrown) {
      if (thrown instanceof AgentContractError) {
        const withId = new AgentContractError("INVALID_INPUT", {
          message: "Pagination cursor is invalid.",
          requestId,
        });
        return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
      }
      return opaque(requestId);
    }
  }
  try {
    const outcome = await listProductsForActor(db, { actorId, limit, offset });
    const warnings = outcome.truncated ? ["Product budget reached; results are a reproducible prefix."] : [];
    const body = successEnvelope(
      requestId,
      {
        products: outcome.products.map((product) => ({
          uri: `skilit://product/${product.productId}`,
          title: product.title,
          versionCount: product.versionCount,
          artifactCount: product.artifactCount,
        })),
        total: outcome.total,
        truncated: outcome.truncated,
      },
      {
        cursor: outcome.total > offset + limit ? encodeCursor(offset + limit) : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        partial: outcome.truncated,
        provenance: observedProvenance(),
      },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof GalleryError) {
      return invalidInput(requestId, "Gallery query is invalid.");
    }
    return opaque(requestId);
  }
}

/** GET /api/v1/products/{id}/versions — actor-scoped version gallery.
 *
 * AF-14d: a version is listed only when at least one of its artifacts
 * is readable by the actor. Unknown products read as an empty list;
 * malformed identifiers answer INVALID_INPUT.
 */
export async function listProductVersionsRoute(
  db: DbClient,
  productId: string,
  query: Record<string, string | string[] | undefined>,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  let limit: number;
  try {
    limit = parseSearchLimit(query.limit);
  } catch (thrown) {
    if (thrown instanceof AgentContractError) {
      return { status: thrown.httpStatus, body: thrown.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
  let offset = 0;
  if (query.cursor !== undefined) {
    try {
      offset = decodeCursor(query.cursor);
    } catch (thrown) {
      if (thrown instanceof AgentContractError) {
        const withId = new AgentContractError("INVALID_INPUT", {
          message: "Pagination cursor is invalid.",
          requestId,
        });
        return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
      }
      return opaque(requestId);
    }
  }
  try {
    const outcome = await listProductVersionsForActor(db, { actorId, productId, limit, offset });
    const warnings = outcome.truncated ? ["Version budget reached; results are a reproducible prefix."] : [];
    const body = successEnvelope(
      requestId,
      {
        versions: outcome.versions.map((version) => ({
          uri: `skilit://version/${version.versionId}`,
          productId: version.productId,
          versionNo: version.versionNo,
          artifactCount: version.artifactCount,
        })),
        total: outcome.total,
        truncated: outcome.truncated,
      },
      {
        cursor: outcome.total > offset + limit ? encodeCursor(offset + limit) : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        partial: outcome.truncated,
        provenance: observedProvenance(),
      },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof GalleryError) {
      return invalidInput(requestId, "Gallery query is invalid.");
    }
    return opaque(requestId);
  }
}

/** GET /api/v1/patterns — actor-scoped pattern taxonomy listing.
 *
 * P10-C: a pattern is listed only when at least one linked artifact is
 * readable by the actor. Unknown slugs and fully-withheld patterns both
 * read as empty, never as an oracle.
 */
export async function listPatternsRoute(
  db: DbClient,
  query: Record<string, string | string[] | undefined>,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  let limit: number;
  try {
    limit = parseSearchLimit(query.limit);
  } catch (thrown) {
    if (thrown instanceof AgentContractError) {
      return { status: thrown.httpStatus, body: thrown.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
  let offset = 0;
  if (query.cursor !== undefined) {
    try {
      offset = decodeCursor(query.cursor);
    } catch (thrown) {
      if (thrown instanceof AgentContractError) {
        const withId = new AgentContractError("INVALID_INPUT", {
          message: "Pagination cursor is invalid.",
          requestId,
        });
        return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
      }
      return opaque(requestId);
    }
  }
  const rawQuery = query.query;
  if (rawQuery !== undefined && (typeof rawQuery !== "string" || rawQuery.length === 0)) {
    return invalidInput(requestId, "Pattern query is invalid.");
  }
  try {
    const outcome = await listPatternsForActor(db, {
      actorId,
      limit,
      offset,
      query: typeof rawQuery === "string" ? rawQuery : undefined,
    });
    const warnings = outcome.truncated ? ["Pattern budget reached; results are a reproducible prefix."] : [];
    const body = successEnvelope(
      requestId,
      {
        patterns: outcome.patterns.map((pattern) => ({
          uri: `skilit://pattern/${pattern.slug}`,
          title: pattern.title,
          artifactCount: pattern.artifactCount,
        })),
        total: outcome.total,
        truncated: outcome.truncated,
      },
      {
        cursor: outcome.total > offset + limit ? encodeCursor(offset + limit) : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        partial: outcome.truncated,
        provenance: observedProvenance(),
      },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof PatternError) {
      return invalidInput(requestId, "Pattern query is invalid.");
    }
    return opaque(requestId);
  }
}

/** GET /api/v1/patterns/{slug} — actor-scoped pattern detail.
 *
 * P10-C: patterns without a readable linked artifact answer
 * FORBIDDEN_OR_NOT_FOUND without an oracle; malformed slugs fail closed.
 */
export async function getPatternRoute(
  db: DbClient,
  slug: string,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  try {
    const detail = await getPatternForActor(db, { actorId, slug });
    if (detail === null) {
      const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    const body = successEnvelope(
      requestId,
      {
        pattern: {
          uri: `skilit://pattern/${detail.slug}`,
          title: detail.title,
          description: detail.description ?? null,
        },
        links: detail.links,
        total: detail.links.length,
      },
      { provenance: observedProvenance(`skilit://pattern/${detail.slug}`) },
    );
    return { status: 200, body };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof PatternError) {
      if (error.code === "pattern/not-found") {
        const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        return { status: err.httpStatus, body: err.toFailureEnvelope() };
      }
      return invalidInput(requestId, "Pattern query is invalid.");
    }
    return opaque(requestId);
  }
}

/** Replay session URI helper shared by the replay REST routes. */
function replayUri(sessionId: string): string {
  return `skilit://replay/${sessionId}`;
}

function replayFailure(requestId: string, error: ReplayError): RestResult {
  if (error.code === "replay/not-found") {
    const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
    return { status: err.httpStatus, body: err.toFailureEnvelope() };
  }
  return invalidInput(requestId, `Replay ledger is invalid: ${error.code}.`);
}

/** POST /api/v1/replays — open a consented replay session for one readable flow. */
export async function openReplaySessionRoute(
  db: DbClient,
  body: Record<string, unknown> | null,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  if (body === null || typeof body.flowId !== "string") {
    return invalidInput(requestId, "Replay flow is invalid.");
  }
  if (body.workspaceId !== undefined && typeof body.workspaceId !== "string") {
    return invalidInput(requestId, "Replay workspace is invalid.");
  }
  try {
    const session = await openReplaySession(db, {
      flowId: body.flowId,
      actorId,
      workspaceId: body.workspaceId as string | undefined,
      consent: body.consent,
    });
    if (session === null) {
      const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    return {
      status: 200,
      body: successEnvelope(
        requestId,
        {
          session: { uri: replayUri(session.id), status: session.status, eventCount: session.eventCount },
          total: 1,
        },
        { provenance: observedProvenance(replayUri(session.id)) },
      ),
    };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof ReplayError) return replayFailure(requestId, error);
    return opaque(requestId);
  }
}

/** POST /api/v1/replays/{id}/events — record redacted events into an open session. */
export async function recordReplayEventsRoute(
  db: DbClient,
  sessionId: string,
  body: Record<string, unknown> | null,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  if (body === null || !Array.isArray(body.events)) {
    return invalidInput(requestId, "Replay events are invalid.");
  }
  try {
    const stored = await recordReplayEvents(db, { sessionId, actorId, events: body.events });
    if (stored === null) {
      const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    return {
      status: 200,
      body: successEnvelope(
        requestId,
        {
          recorded: stored.recorded,
          eventCount: stored.eventCount,
          session: { uri: replayUri(sessionId), eventCount: stored.eventCount },
          total: stored.recorded,
        },
        { provenance: observedProvenance(replayUri(sessionId)) },
      ),
    };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof ReplayError) return replayFailure(requestId, error);
    return opaque(requestId);
  }
}

/** POST /api/v1/replays/{id}/close — close a replay session. */
export async function closeReplaySessionRoute(
  db: DbClient,
  sessionId: string,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  try {
    const session = await closeReplaySession(db, { sessionId, actorId });
    if (session === null) {
      const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    return {
      status: 200,
      body: successEnvelope(
        requestId,
        {
          session: { uri: replayUri(session.id), status: session.status, eventCount: session.eventCount },
          total: 1,
        },
        { provenance: observedProvenance(replayUri(session.id)) },
      ),
    };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof ReplayError) return replayFailure(requestId, error);
    return opaque(requestId);
  }
}

/** GET /api/v1/replays/{id}/events — replay one session in deterministic order. */
export async function getReplayEventsRoute(
  db: DbClient,
  sessionId: string,
  actorId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  try {
    const replay = await getReplayEvents(db, { sessionId, actorId });
    if (replay === null) {
      const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      return { status: err.httpStatus, body: err.toFailureEnvelope() };
    }
    return {
      status: 200,
      body: successEnvelope(
        requestId,
        {
          session: {
            uri: replayUri(replay.session.id),
            status: replay.session.status,
            eventCount: replay.session.eventCount,
          },
          events: replay.events,
          total: replay.events.length,
        },
        { provenance: observedProvenance(replayUri(replay.session.id)) },
      ),
    };
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    if (error instanceof ReplayError) return replayFailure(requestId, error);
    return opaque(requestId);
  }
}

/** GET /api/v1/objects?uri= — retrieve by stable Skilit URI. */
export async function getObjectRoute(
  db: DbClient,
  uri: string | undefined,
  userId: string,
  providedRequestId?: unknown,
): Promise<RestResult> {
  const requestId = newRequestId(providedRequestId);
  if (typeof uri !== "string") {
    return invalidInput(requestId, "Object URI is invalid.");
  }
  let parsed;
  try {
    parsed = parseSkilitUri(uri);
  } catch {
    return invalidInput(requestId, "Object URI is invalid.");
  }
  try {
    if (parsed.type === "artifact") {
      const artifact = await getArtifactForActor(db, parsed.id, userId);
      if (artifact === null) {
        const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        return { status: err.httpStatus, body: err.toFailureEnvelope() };
      }
      if (artifact.rightsClassification === "restricted") {
        const err = new AgentContractError("RIGHTS_RESTRICTED", {
          requestId,
          provenance: observedProvenance(uri),
        });
        return { status: err.httpStatus, body: err.toFailureEnvelope() };
      }
      const body = successEnvelope(
        requestId,
        {
          object: {
            uri,
            kind: artifact.kind,
            title: artifact.title,
            rights: artifact.rightsClassification,
          },
        },
        { provenance: observedProvenance(uri) },
      );
      return { status: 200, body };
    }
    try {
      requireCapability("packs", requestId);
      const pack = await exportReferencePack(db, parsed.id, userId);
      // Partial when denied/missing items were withheld: compare the
      // collection reference count against the exported count without
      // leaking which items were withheld.
      let partial = false;
      let warnings: string[] | undefined;
      try {
        const refs = await listReferences(db, parsed.id, userId);
        if (refs.length > pack.itemCount) {
          partial = true;
          warnings = ["Some references were withheld by rights or visibility."];
        }
      } catch {
        // Reference count is best-effort; export already succeeded.
      }
      const body = successEnvelope(
        requestId,
        { pack },
        {
          provenance: observedProvenance(pack.uri),
          warnings,
          partial,
        },
      );
      return { status: 200, body };
    } catch (error) {
      if (error instanceof AgentContractError) {
        const withId = new AgentContractError(error.code, { requestId });
        return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
      }
      // Unknown and denied packs answer alike; anything else is opaque.
      if (error instanceof Error && (error.name === "PackError" || error.name === "AuthError")) {
        const code = (error as { code?: unknown }).code;
        if (code === "packs/invalid") {
          return invalidInput(requestId, "Object URI is invalid.");
        }
        const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        return { status: err.httpStatus, body: err.toFailureEnvelope() };
      }
      return opaque(requestId);
    }
  } catch (error) {
    if (error instanceof AgentContractError) {
      const withId = new AgentContractError(error.code, { requestId });
      return { status: withId.httpStatus, body: withId.toFailureEnvelope() };
    }
    return opaque(requestId);
  }
}

export { AGENT_SCHEMA_VERSION };
export type { AgentEnvelope };
export { failureEnvelope, successEnvelope };
