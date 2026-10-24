import type { DbClient } from "../../../packages/db/src/db.ts";
import { validateSession } from "../../../packages/db/src/auth.ts";
import { getArtifactForActor } from "../../../packages/db/src/artifact-access.ts";
import { deleteCollection, saveReference } from "../../../packages/db/src/collections.ts";
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
import { buildRegistryItem } from "./registry.ts";
import { searchRegistryIndex } from "./registry.ts";
import {
  createReferencePack,
  exportReferencePack,
  parseSkilitUri,
} from "./reference-packs.ts";
import { listReferences } from "../../../packages/db/src/collections.ts";
import {
  AGENT_SCHEMA_VERSION,
  AgentContractError,
  computedProvenance,
  decodeCursor,
  encodeCursor,
  newRequestId,
  observedProvenance,
  parseSearchLimit,
  requireCapability,
  sanitizeIdempotencyKey,
  sanitizeRequestId,
  successEnvelope,
} from "./agent-contract.ts";
import type { AgentEnvelope } from "./agent-contract.ts";
import { claimPackIdempotency, findPackForIdempotencyKey } from "../../../packages/db/src/idempotency.ts";
import {
  cancelLensJobRoute,
  createLensJobRoute,
  downloadLensArtifactRoute,
  getLensJobRoute,
  lensUriFor,
  parseLensUri,
  pollLensJobRoute,
  resumeLensJobRoute,
  retryLensJobRoute,
} from "./lens-jobs.ts";
import {
  handOffBoardRoute,
  listBoardHandoffsRoute,
  validateBoardItemsRoute,
} from "./boards.ts";

/**
 * G08-01 remote agent transport: MCP Streamable HTTP (JSON-RPC 2.0) with
 * a first read-only tool set over the canonical asset corpus.
 *
 * Protocol posture: version negotiation across known revisions, JSON
 * responses to POST (single and batch), explicit 405 on GET/SSE streams
 * until streaming lands in a follow-up grain. Every tool call requires
 * a bearer token; token issuance (OAuth metadata, audience binding,
 * PKCE) arrives in a later P08 grain — this layer only verifies
 * caller-supplied tokens against server configuration.
 *
 * AF-03b: every domain tool payload is a skilit.agent.v1 envelope. The
 * JSON-RPC transport stays backward compatible (same methods, same
 * transport codes); domain semantics (typed errors, request IDs,
 * pagination, warnings, rights, capabilities) live in the envelope so MCP
 * and REST share one canonical contract implementation.
 */

export const MCP_PROTOCOL_VERSIONS = ["2026-07-28", "2025-06-18", "2025-03-26", "2024-11-05"];
export const MCP_SERVER_NAME = "skilit";
export const MCP_SERVER_VERSION = "0.1.0";
export const MCP_MAX_BATCH = 32;
export const MCP_MAX_BODY_CHARS = 256 * 1024;

export interface McpContext {
  /**
   * Server-resolved caller identity (Skilit user ID), bound by the route
   * from a validated session token. Null only in tests exercising denial;
   * the route never dispatches tools without an identity.
   */
  userId: string | null;
}

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(id: unknown, code: number, message: string, data?: unknown): JsonRpcResponse {
  const response: JsonRpcResponse = { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
  if (data !== undefined) {
    response.error = { code, message, data };
  }
  return response;
}

export function negotiateVersion(requested: unknown): string | null {
  if (typeof requested !== "string") return MCP_PROTOCOL_VERSIONS[0] ?? null;
  if (MCP_PROTOCOL_VERSIONS.includes(requested)) return requested;
  return MCP_PROTOCOL_VERSIONS[0] ?? null;
}

/**
 * AF-03c capability advertisement. Mirrors describeCapabilities() so HTTP
 * and stdio clients negotiate without calling a disabled tool first.
 * Unknown capability names are ignored by design.
 */
export function getSkilitCapabilities(): { packs: boolean; registry: boolean } {
  const raw =
    process.env.SKILIT_DISABLED_CAPABILITIES ??
    process.env.SKELET_DISABLED_CAPABILITIES;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { packs: true, registry: true };
  }
  const disabled = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return { packs: !disabled.includes("packs"), registry: !disabled.includes("registry") };
}

function requireUser(ctx: McpContext): string {
  if (ctx.userId === null) {
    throw new AgentContractError("UNAUTHENTICATED");
  }
  return ctx.userId;
}

function toolSchemas(): unknown[] {
  // AF-03c: every tool accepts an optional requestId for retry correlation
  // and the two write tools accept an optional idempotencyKey for safe
  // retries. Both are additive: older clients that omit them keep working.
  const requestIdProp = { type: "string", description: "Optional client request ID (1..128 chars) for retry correlation." };
  const idempotencyProp = {
    type: "string",
    description: "Optional idempotency key (1..128 chars, no whitespace) for safe write retries.",
  };
  return [
    {
      name: "search_assets",
      description: "Search icons, logos, fonts, and optionally actor-readable research screens with rights metadata.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", maxLength: 200 },
          kinds: { type: "array", items: { type: "string", enum: ["icon", "logo", "font", "screen"] } },
          rights: { type: "array", items: { type: "string", enum: ["unknown", "metadata_only", "permitted", "restricted"] } },
          licenses: { type: "array", items: { type: "string", maxLength: 64 } },
          trademarkFree: { type: "boolean" },
          collection: { type: "string", maxLength: 200 },
          facets: { type: "boolean", description: "Include access-scoped deterministic facet counts." },
          limit: { type: "number" },
          cursor: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["query"],
      },
    },
    {
      name: "get_asset",
      description: "Resolve one asset record with provenance and serving policy.",
      inputSchema: {
        type: "object",
        properties: { artifactId: { type: "string" }, requestId: requestIdProp },
        required: ["artifactId"],
      },
    },
    {
      name: "get_registry_item",
      description: "Fetch a shadcn-compatible registry item document.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" }, requestId: requestIdProp },
        required: ["name"],
      },
    },
    {
      name: "search_registry",
      description: "Search shadcn-compatible registry items by name, title, or description.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", maxLength: 200 },
          limit: { type: "number" },
          requestId: requestIdProp,
        },
        required: [],
      },
    },
    {
      name: "find_similar",
      description: "Find deterministically similar artifacts to a reference artifact (lexical baseline, no embeddings).",
      inputSchema: {
        type: "object",
        properties: {
          artifactId: { type: "string" },
          kinds: { type: "array", items: { type: "string", enum: ["screen", "page", "section", "component", "icon", "logo", "font", "illustration", "resource", "brief", "design"] } },
          limit: { type: "number" },
          cursor: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["artifactId"],
      },
    },
    {
      name: "compare_design",
      description: "Compare two artifacts with observed evidence-linked diffs (no generated causality).",
      inputSchema: {
        type: "object",
        properties: {
          leftArtifactId: { type: "string" },
          rightArtifactId: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["leftArtifactId", "rightArtifactId"],
      },
    },
    {
      name: "list_flows",
      description: "List research flows with actor-scoped visibility (every step readable).",
      inputSchema: {
        type: "object",
        properties: {
          productVersionId: { type: "string" },
          limit: { type: "number" },
          cursor: { type: "string" },
          requestId: requestIdProp,
        },
        required: [],
      },
    },
    {
      name: "get_flow_steps",
      description: "Retrieve ordered steps of one research flow with artifact references.",
      inputSchema: {
        type: "object",
        properties: {
          flowId: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["flowId"],
      },
    },
    {
      name: "get_changes",
      description: "Compare two product versions with deterministic evidence-linked change records (no intent inference).",
      inputSchema: {
        type: "object",
        properties: {
          fromVersionId: { type: "string" },
          toVersionId: { type: "string" },
          limit: { type: "number" },
          cursor: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["fromVersionId", "toVersionId"],
      },
    },
    {
      name: "list_products",
      description: "List research products that have at least one artifact readable by the caller.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          cursor: { type: "string" },
          requestId: requestIdProp,
        },
        required: [],
      },
    },
    {
      name: "list_product_versions",
      description: "List versions of one product that have at least one artifact readable by the caller.",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string" },
          limit: { type: "number" },
          cursor: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["productId"],
      },
    },
    {
      name: "list_patterns",
      description: "List pattern taxonomy entries that have at least one artifact readable by the caller.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
          cursor: { type: "string" },
          requestId: requestIdProp,
        },
        required: [],
      },
    },
    {
      name: "get_pattern",
      description: "Inspect one pattern with its readable linked artifacts.",
      inputSchema: {
        type: "object",
        properties: {
          slug: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["slug"],
      },
    },
    {
      name: "replay_open_session",
      description: "Open a consented replay session for one readable flow.",
      inputSchema: {
        type: "object",
        properties: {
          flowId: { type: "string" },
          workspaceId: { type: "string" },
          consent: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["flowId", "consent"],
      },
    },
    {
      name: "replay_record_events",
      description: "Record redacted replay events into an open session.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          events: { type: "array" },
          requestId: requestIdProp,
        },
        required: ["sessionId", "events"],
      },
    },
    {
      name: "replay_close_session",
      description: "Close a replay session; recorded events stay readable.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["sessionId"],
      },
    },
    {
      name: "replay_get_events",
      description: "Replay one session back in deterministic order.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["sessionId"],
      },
    },
    {
      name: "save_reference",
      description: "Save a canonical artifact into a workspace collection as the calling user.",
      inputSchema: {
        type: "object",
        properties: {
          collectionId: { type: "string" },
          artifactId: { type: "string" },
          requestId: requestIdProp,
          idempotencyKey: idempotencyProp,
        },
        required: ["collectionId", "artifactId"],
      },
    },
    {
      name: "create_reference_pack",
      description: "Create a reference pack (collection plus versioned export) from evidence as the calling user.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          title: { type: "string" },
          artifactIds: { type: "array", items: { type: "string" } },
          visibility: { type: "string" },
          requestId: requestIdProp,
          idempotencyKey: idempotencyProp,
        },
        required: ["workspaceId", "title"],
      },
    },
    {
      name: "get_object",
      description: "Retrieve a canonical object by Skilit URI (skilit://artifact/{id}, skilit://collection/{id}).",
      inputSchema: {
        type: "object",
        properties: { uri: { type: "string" }, requestId: requestIdProp },
        required: ["uri"],
      },
    },
    {
      name: "lens_create_job",
      description: "Create a durable Lens Build Kit job (URL to implementation kit). Idempotent on (workspace, idempotencyKey).",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          sourceUrl: { type: "string" },
          mode: { type: "string", enum: ["single-page", "selected-pages", "bounded-sitemap"] },
          maxPages: { type: "number" },
          maxDepth: { type: "number" },
          maxBytes: { type: "number" },
          timeBudgetMs: { type: "number" },
          pages: { type: "array", items: { type: "string" } },
          viewports: { type: "array", items: { type: "string", enum: ["desktop", "mobile"] } },
          retentionDays: { type: "number" },
          maxAttempts: { type: "number" },
          requestId: requestIdProp,
          idempotencyKey: idempotencyProp,
        },
        required: ["workspaceId", "sourceUrl", "mode", "maxPages", "maxDepth", "maxBytes", "timeBudgetMs", "idempotencyKey"],
      },
    },
    {
      name: "lens_poll_job",
      description: "Read the current persisted progress of a Lens job by stable ID or skilit://lens/{id} URI.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          kitId: { type: "string" },
          uri: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["workspaceId"],
      },
    },
    {
      name: "lens_get_job",
      description: "Inspect a Lens job with persisted evidence, artifact summary, and attempt history.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          kitId: { type: "string" },
          uri: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["workspaceId"],
      },
    },
    {
      name: "lens_cancel_job",
      description: "Cancel an active Lens job. Repeat cancellation is deterministic; terminal runs are not cancelable.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          kitId: { type: "string" },
          uri: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["workspaceId"],
      },
    },
    {
      name: "lens_retry_job",
      description: "Requeue a failed or partial Lens job within its retry budget. Prior attempt evidence is preserved.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          kitId: { type: "string" },
          uri: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["workspaceId"],
      },
    },
    {
      name: "lens_resume_job",
      description: "Transfer a Lens job worker lease after interruption so work continues from the persisted checkpoint.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          kitId: { type: "string" },
          uri: { type: "string" },
          workerId: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["workspaceId"],
      },
    },
    {
      name: "lens_read_artifact",
      description: "Read a terminal Lens job output document (manifest.json or evidence.json) with integrity digest.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: { type: "string" },
          kitId: { type: "string" },
          uri: { type: "string" },
          name: { type: "string", enum: ["manifest.json", "evidence.json"] },
          requestId: requestIdProp,
        },
        required: ["workspaceId"],
      },
    },
    {
      name: "board_handoff",
      description: "Hand off board ownership to a workspace member with ledger proof. Address the board by ID or skilit://collection/{id} URI.",
      inputSchema: {
        type: "object",
        properties: {
          boardId: { type: "string" },
          uri: { type: "string" },
          workspaceId: { type: "string" },
          toSubjectId: { type: "string" },
          requestId: requestIdProp,
        },
        required: ["workspaceId", "toSubjectId"],
      },
    },
    {
      name: "board_list_handoffs",
      description: "Read the provenance chain of a board. Address the board by ID or skilit://collection/{id} URI.",
      inputSchema: {
        type: "object",
        properties: {
          boardId: { type: "string" },
          uri: { type: "string" },
          requestId: requestIdProp,
        },
        required: [],
      },
    },
    {
      name: "board_validate_items",
      description: "Validate every board item for handoff inspection (ok/denied/missing with pack-grade metadata).",
      inputSchema: {
        type: "object",
        properties: {
          boardId: { type: "string" },
          uri: { type: "string" },
          requestId: requestIdProp,
        },
        required: [],
      },
    },
  ];
}

function toAgentAsset(record: {
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
  // Canonical stable URI scheme per the agent platform contract.
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

function invalidInput(message: string, requestId?: string): AgentContractError {
  return new AgentContractError("INVALID_INPUT", { message, requestId });
}

const LENS_KIT_HEX64 = /^[0-9a-f]{64}$/;

/**
 * AF-05e Lens identity resolution: callers address a job by raw kitId or
 * by stable `skilit://lens/{id}` URI. Both must agree when both are given;
 * neither is an existence oracle (unknown answers FORBIDDEN_OR_NOT_FOUND
 * from the store layer, never INVALID_INPUT).
 */
function resolveLensKitId(params: Record<string, unknown>, requestId: string): string {
  const opaque = (): AgentContractError => new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
  let fromKit: string | undefined;
  if (params.kitId !== undefined) {
    if (typeof params.kitId !== "string" || !LENS_KIT_HEX64.test(params.kitId.toLowerCase())) {
      throw opaque();
    }
    fromKit = params.kitId.toLowerCase();
  }
  let fromUri: string | undefined;
  if (params.uri !== undefined) {
    try {
      fromUri = parseLensUri(params.uri);
    } catch {
      throw opaque();
    }
  }
  if (fromKit !== undefined && fromUri !== undefined && fromKit !== fromUri) {
    throw invalidInput("Lens job identifier is invalid.", requestId);
  }
  const resolved = fromUri ?? fromKit;
  if (resolved === undefined) {
    throw invalidInput("Lens job identifier is invalid.", requestId);
  }
  return resolved;
}

/**
 * AF-05e REST/MCP parity: the MCP Lens tools delegate to the same
 * lens-jobs route layer the REST endpoints serve, so envelopes, error
 * codes, and safe messages are identical by construction. Success bodies
 * are returned verbatim; failures rethrow the same canonical code (with
 * the INVALID_INPUT safe message preserved) so dispatchMcp maps them to
 * the same JSON-RPC error the REST transport maps to HTTP.
 */
async function lensResultToEnvelope(result: { status: number; body: AgentEnvelope }): Promise<AgentEnvelope> {
  if (result.status < 400) return result.body;
  const code = result.body.error?.code ?? "INTERNAL_OPAQUE";
  const message = code === "INVALID_INPUT" ? result.body.error?.message : undefined;
  throw new AgentContractError(code, { message, requestId: result.body.request_id });
}

const BOARD_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * AF-09-ii board identity resolution: callers address a board by raw UUID
 * or by stable `skilit://collection/{id}` URI. Both must agree when both
 * are given; malformed identifiers answer FORBIDDEN_OR_NOT_FOUND (no
 * existence oracle), while a missing identifier is INVALID_INPUT.
 */
function resolveBoardId(params: Record<string, unknown>, requestId: string): string {
  const opaque = (): AgentContractError => new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
  let fromId: string | undefined;
  if (params.boardId !== undefined) {
    if (typeof params.boardId !== "string" || !BOARD_UUID.test(params.boardId)) {
      throw opaque();
    }
    fromId = params.boardId.toLowerCase();
  }
  let fromUri: string | undefined;
  if (params.uri !== undefined) {
    if (typeof params.uri !== "string") {
      throw opaque();
    }
    try {
      const parsed = parseSkilitUri(params.uri);
      if (parsed.type !== "collection") {
        throw opaque();
      }
      fromUri = parsed.id.toLowerCase();
    } catch (thrown) {
      if (thrown instanceof AgentContractError) {
        throw thrown.code === "INVALID_INPUT" ? opaque() : thrown;
      }
      throw opaque();
    }
  }
  if (fromId !== undefined && fromUri !== undefined && fromId !== fromUri) {
    throw invalidInput("Board identifier is invalid.", requestId);
  }
  const resolved = fromUri ?? fromId;
  if (resolved === undefined) {
    throw invalidInput("Board identifier is invalid.", requestId);
  }
  return resolved;
}

/**
 * AF-09-ii REST/MCP parity: the MCP board-handoff tools delegate to the
 * same boards route layer the REST endpoints serve, so envelopes, error
 * codes, and safe messages are identical by construction.
 */
async function boardResultToEnvelope(result: { status: number; body: AgentEnvelope }): Promise<AgentEnvelope> {
  if (result.status < 400) return result.body;
  const code = result.body.error?.code ?? "INTERNAL_OPAQUE";
  const message = code === "INVALID_INPUT" ? result.body.error?.message : undefined;
  throw new AgentContractError(code, { message, requestId: result.body.request_id });
}

async function callTool(
  db: DbClient,
  ctx: McpContext,
  name: unknown,
  args: unknown,
): Promise<AgentEnvelope> {
  const params = isRecord(args) ? args : {};
  // AF-03c stable request identifiers: callers may supply requestId for
  // retry correlation; malformed supplied IDs fail INVALID_INPUT so client
  // bugs surface instead of silently forking traces.
  let requestId: string;
  if (params.requestId !== undefined) {
    const sanitized = sanitizeRequestId(params.requestId);
    if (sanitized === undefined) {
      throw invalidInput("requestId is invalid.", newRequestId());
    }
    requestId = sanitized;
  } else {
    requestId = newRequestId();
  }
  // AF-03c idempotency keys: opaque client tokens for safe write retries.
  // save_reference is naturally idempotent; create_reference_pack dedupes
  // via the pack_idempotency ledger. Malformed keys fail INVALID_INPUT.
  let idempotencyKey: string | undefined;
  if (params.idempotencyKey !== undefined) {
    const sanitized = sanitizeIdempotencyKey(params.idempotencyKey);
    if (sanitized === undefined) {
      throw invalidInput("idempotencyKey is invalid.", requestId);
    }
    idempotencyKey = sanitized;
  }
  if (typeof name !== "string") {
    throw invalidInput("Tool name is invalid.", requestId);
  }
  if (name === "search_assets") {
    if (typeof params.query !== "string") {
      throw invalidInput("search_assets.query is invalid.", requestId);
    }
    if (typeof params.query !== "string" || params.query.trim().length === 0 || params.query.trim().length > 200) {
      throw invalidInput("search_assets.query is invalid.", requestId);
    }
    const actorId = requireUser(ctx);
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
    } = { query: params.query.trim(), limit: 20, offset: 0 };
    if (params.kinds !== undefined) {
      if (
        !Array.isArray(params.kinds) ||
        params.kinds.length === 0 ||
        params.kinds.length > REGISTRY_KINDS.length ||
        params.kinds.some((kind) => !(REGISTRY_KINDS as readonly string[]).includes(kind)) ||
        new Set(params.kinds).size !== params.kinds.length
      ) {
        throw invalidInput("search_assets.kinds is invalid.", requestId);
      }
      search.kinds = params.kinds as AssetSearchKind[];
    }
    {
      const value = params.rights;
      if (value !== undefined) {
        const allowedRights = ["unknown", "metadata_only", "permitted", "restricted"] as const;
        if (
          !Array.isArray(value) ||
          value.length === 0 ||
          value.length > allowedRights.length ||
          value.some((item) => typeof item !== "string" || !(allowedRights as readonly string[]).includes(item)) ||
          new Set(value).size !== value.length
        ) {
          throw invalidInput("search_assets.rights is invalid.", requestId);
        }
        search.rights = value as string[];
      }
    }
    {
      const value = params.licenses;
      if (value !== undefined) {
        if (
          !Array.isArray(value) ||
          value.length === 0 ||
          value.length > 32 ||
          value.some((item) => typeof item !== "string" || item.length === 0 || item.length > 64) ||
          new Set(value).size !== value.length
        ) {
          throw invalidInput("search_assets.licenses is invalid.", requestId);
        }
        search.licenses = value as string[];
      }
    }
    if (params.trademarkFree !== undefined) {
      if (typeof params.trademarkFree !== "boolean") {
        throw invalidInput("search_assets.trademarkFree is invalid.", requestId);
      }
      search.trademarkFree = params.trademarkFree;
    }
    if (params.collection !== undefined) {
      if (typeof params.collection !== "string" || params.collection.trim().length === 0 ||
          params.collection.length > 200) {
        throw invalidInput("search_assets.collection is invalid.", requestId);
      }
      search.collection = params.collection.trim();
    }
    if (params.facets !== undefined) {
      if (typeof params.facets !== "boolean") {
        throw invalidInput("search_assets.facets is invalid.", requestId);
      }
      search.includeFacets = params.facets;
    }
    try {
      search.limit = parseSearchLimit(params.limit);
    } catch {
      throw invalidInput("search_assets.limit is invalid.", requestId);
    }
    if (params.cursor !== undefined) {
      try {
        search.offset = decodeCursor(params.cursor);
      } catch {
        throw invalidInput("Pagination cursor is invalid.", requestId);
      }
    }
    try {
      const fetchLimit = search.limit + 1;
      const detailed = await searchAssetsForActorDetailed(
        db,
        { ...search, limit: fetchLimit, offset: search.offset },
        actorId,
      );
      const records = detailed.assets;
      const hasMore = records.length > search.limit;
      const page = hasMore ? records.slice(0, search.limit) : records;
      const result: Record<string, unknown> = {
        assets: page.map(toAgentAsset),
        search_mode: detailed.searchMode,
      };
      if (detailed.facets !== undefined) result.facets = detailed.facets;
      return successEnvelope(
        requestId,
        result,
        {
          cursor: hasMore ? encodeCursor(search.offset + search.limit) : undefined,
          provenance: computedProvenance(),
        },
      );
    } catch (thrown) {
      if (thrown instanceof AgentContractError) {
        throw new AgentContractError(thrown.code, {
          message: thrown.code === "INVALID_INPUT" ? thrown.safeMessage : undefined,
          requestId,
        });
      }
      if (thrown instanceof Error && thrown.name === "RegistryError") {
        throw invalidInput("search_assets.query is invalid.", requestId);
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (name === "get_asset") {
    if (typeof params.artifactId !== "string") {
      throw invalidInput("get_asset.artifactId is invalid.", requestId);
    }
    const actorId = requireUser(ctx);
    try {
      const record = await resolveAssetForActor(db, params.artifactId, actorId);
      if (record.rightsClassification === "restricted") {
        throw new AgentContractError("RIGHTS_RESTRICTED", {
          requestId,
          provenance: observedProvenance(`skilit://artifact/${params.artifactId}`),
        });
      }
      const warnings =
        record.serving === "metadata-only" ? [`Rights note: ${record.servingReason}`.slice(0, 512)] : [];
      return successEnvelope(
        requestId,
        { asset: toAgentAsset(record) },
        {
          warnings: warnings.length > 0 ? warnings : undefined,
          provenance: observedProvenance(`skilit://artifact/${record.artifactId}`),
        },
      );
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
    }
  }
  if (name === "find_similar") {
    if (typeof params.artifactId !== "string") {
      throw invalidInput("find_similar.artifactId is invalid.", requestId);
    }
    const actorId = requireUser(ctx);
    let kinds: string[] | undefined;
    if (params.kinds !== undefined) {
      if (
        !Array.isArray(params.kinds) ||
        params.kinds.length === 0 ||
        params.kinds.length > SIMILARITY_KINDS.length ||
        params.kinds.some((kind) => !(SIMILARITY_KINDS as readonly string[]).includes(kind)) ||
        new Set(params.kinds).size !== params.kinds.length
      ) {
        throw invalidInput("find_similar.kinds is invalid.", requestId);
      }
      kinds = params.kinds as string[];
    }
    let limit: number;
    try {
      limit = parseSearchLimit(params.limit);
    } catch {
      throw invalidInput("find_similar.limit is invalid.", requestId);
    }
    let offset = 0;
    if (params.cursor !== undefined) {
      try {
        offset = decodeCursor(params.cursor);
      } catch {
        throw invalidInput("Pagination cursor is invalid.", requestId);
      }
    }
    try {
      const outcome = await findSimilarForActor(db, {
        artifactId: params.artifactId,
        actorId,
        kinds,
        limit,
        offset,
      });
      // Single-object read semantics mirror get_object: a restricted
      // reference answers RIGHTS_RESTRICTED; candidates keep list
      // semantics with rights labels (mirroring search_assets).
      if (outcome.reference.rightsClassification === "restricted") {
        throw new AgentContractError("RIGHTS_RESTRICTED", {
          requestId,
          provenance: observedProvenance(`skilit://artifact/${outcome.reference.artifactId}`),
        });
      }
      const warnings = outcome.truncated
        ? ["Candidate budget reached; results are a reproducible prefix."]
        : [];
      return successEnvelope(
        requestId,
        {
          reference: {
            uri: `skilit://artifact/${outcome.reference.artifactId}`,
            kind: outcome.reference.kind,
            title: outcome.reference.title,
          },
          similar: outcome.similar.map((entry) => ({ ...toAgentAsset(entry), score: entry.score })),
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
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      // Reference identifiers are never an existence oracle: malformed,
      // unknown, and denied references answer alike (mirroring get_asset).
      if (thrown instanceof Error && thrown.name === "RegistryError") {
        throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (name === "compare_design") {
    if (typeof params.leftArtifactId !== "string" || typeof params.rightArtifactId !== "string") {
      throw invalidInput("compare_design references are invalid.", requestId);
    }
    const actorId = requireUser(ctx);
    try {
      const outcome = await compareArtifactsForActor(db, {
        leftArtifactId: params.leftArtifactId,
        rightArtifactId: params.rightArtifactId,
        actorId,
      });
      // Pair-read semantics mirror get_object: a readable-but-restricted
      // artifact on either side answers RIGHTS_RESTRICTED.
      if (outcome.left.rightsClassification === "restricted" || outcome.right.rightsClassification === "restricted") {
        throw new AgentContractError("RIGHTS_RESTRICTED", {
          requestId,
          provenance: observedProvenance(),
        });
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
      return successEnvelope(
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
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      // Either identifier is never an existence oracle: malformed,
      // unknown, and denied references answer alike (mirroring get_asset).
      if (thrown instanceof Error && thrown.name === "RegistryError") {
        throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (name === "list_flows") {
    const actorId = requireUser(ctx);
    if (params.productVersionId !== undefined && typeof params.productVersionId !== "string") {
      throw invalidInput("list_flows.productVersionId is invalid.", requestId);
    }
    let limit: number;
    try {
      limit = parseSearchLimit(params.limit);
    } catch {
      throw invalidInput("list_flows.limit is invalid.", requestId);
    }
    let offset = 0;
    if (params.cursor !== undefined) {
      try {
        offset = decodeCursor(params.cursor);
      } catch {
        throw invalidInput("Pagination cursor is invalid.", requestId);
      }
    }
    try {
      const outcome = await listFlowsForActor(db, {
        actorId,
        productVersionId: typeof params.productVersionId === "string" ? params.productVersionId : undefined,
        limit,
        offset,
      });
      const warnings = outcome.truncated ? ["Flow budget reached; results are a reproducible prefix."] : [];
      return successEnvelope(
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
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      // Flow identifiers are never an existence oracle: malformed and
      // unknown versions answer alike (mirroring get_asset).
      if (thrown instanceof Error && thrown.name === "CorpusError") {
        const code = (thrown as { code?: unknown }).code;
        if (code === "corpus/not-found") {
          throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        }
        throw invalidInput("list_flows query is invalid.", requestId);
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (name === "get_flow_steps") {
    if (typeof params.flowId !== "string") {
      throw invalidInput("get_flow_steps.flowId is invalid.", requestId);
    }
    const actorId = requireUser(ctx);
    try {
      const outcome = await getFlowStepsForActor(db, { flowId: params.flowId, actorId });
      return successEnvelope(
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
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      // Either missing, malformed, or denied flows answer alike.
      if (thrown instanceof Error && thrown.name === "CorpusError") {
        throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (name === "get_changes") {
    if (typeof params.fromVersionId !== "string" || typeof params.toVersionId !== "string") {
      throw invalidInput("get_changes versions are invalid.", requestId);
    }
    const actorId = requireUser(ctx);
    let limit: number;
    try {
      limit = parseSearchLimit(params.limit);
    } catch {
      throw invalidInput("get_changes.limit is invalid.", requestId);
    }
    let offset = 0;
    if (params.cursor !== undefined) {
      try {
        offset = decodeCursor(params.cursor);
      } catch {
        throw invalidInput("Pagination cursor is invalid.", requestId);
      }
    }
    try {
      const outcome = await getChangesForActor(db, {
        actorId,
        fromVersionId: params.fromVersionId,
        toVersionId: params.toVersionId,
        limit,
        offset,
      });
      return successEnvelope(
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
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      if (thrown instanceof Error && thrown.name === "ChangesError") {
        const code = (thrown as { code?: unknown }).code;
        if (code === "changes/not-found") {
          throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        }
        throw invalidInput("Version comparison is invalid.", requestId);
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (name === "list_products" || name === "list_product_versions") {
    const actorId = requireUser(ctx);
    let limit: number;
    try {
      limit = parseSearchLimit(params.limit);
    } catch {
      throw invalidInput(`${name}.limit is invalid.`, requestId);
    }
    let offset = 0;
    if (params.cursor !== undefined) {
      try {
        offset = decodeCursor(params.cursor);
      } catch {
        throw invalidInput("Pagination cursor is invalid.", requestId);
      }
    }
    try {
      if (name === "list_products") {
        const outcome = await listProductsForActor(db, { actorId, limit, offset });
        return successEnvelope(
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
            partial: outcome.truncated,
            warnings: outcome.truncated ? ["Product budget reached; results are a reproducible prefix."] : undefined,
            provenance: observedProvenance(),
          },
        );
      }
      if (typeof params.productId !== "string") {
        throw invalidInput("list_product_versions.productId is invalid.", requestId);
      }
      const outcome = await listProductVersionsForActor(db, {
        actorId,
        productId: params.productId,
        limit,
        offset,
      });
      return successEnvelope(
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
          partial: outcome.truncated,
          warnings: outcome.truncated ? ["Version budget reached; results are a reproducible prefix."] : undefined,
          provenance: observedProvenance(),
        },
      );
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      // Unknown products read as empty, never as an oracle; only
      // malformed input fails validation on both transports.
      if (thrown instanceof GalleryError) {
        throw invalidInput("Gallery query is invalid.", requestId);
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (name === "list_patterns" || name === "get_pattern") {
    const actorId = requireUser(ctx);
    let limit: number;
    try {
      limit = parseSearchLimit(params.limit);
    } catch {
      throw invalidInput(`${name}.limit is invalid.`, requestId);
    }
    let offset = 0;
    if (params.cursor !== undefined) {
      try {
        offset = decodeCursor(params.cursor);
      } catch {
        throw invalidInput("Pagination cursor is invalid.", requestId);
      }
    }
    try {
      if (name === "list_patterns") {
        if (params.query !== undefined && typeof params.query !== "string") {
          throw invalidInput("list_patterns.query is invalid.", requestId);
        }
        const outcome = await listPatternsForActor(db, {
          actorId,
          limit,
          offset,
          query: params.query as string | undefined,
        });
        return successEnvelope(
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
            partial: outcome.truncated,
            warnings: outcome.truncated ? ["Pattern budget reached; results are a reproducible prefix."] : undefined,
            provenance: observedProvenance(),
          },
        );
      }
      if (typeof params.slug !== "string") {
        throw invalidInput("get_pattern.slug is invalid.", requestId);
      }
      const detail = await getPatternForActor(db, { actorId, slug: params.slug });
      if (detail === null) {
        throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      }
      return successEnvelope(
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
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      // Unknown slugs read as not-found without an oracle; only
      // malformed input fails validation on both transports.
      if (thrown instanceof PatternError) {
        if (thrown.code === "pattern/not-found") {
          throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        }
        throw invalidInput("Pattern query is invalid.", requestId);
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (
    name === "replay_open_session" ||
    name === "replay_record_events" ||
    name === "replay_close_session" ||
    name === "replay_get_events"
  ) {
    const actorId = requireUser(ctx);
    const sessionUri = (id: string): string => `skilit://replay/${id}`;
    try {
      if (name === "replay_open_session") {
        if (typeof params.flowId !== "string") {
          throw invalidInput("replay_open_session.flowId is invalid.", requestId);
        }
        if (params.workspaceId !== undefined && typeof params.workspaceId !== "string") {
          throw invalidInput("replay_open_session.workspaceId is invalid.", requestId);
        }
        const session = await openReplaySession(db, {
          flowId: params.flowId,
          actorId,
          workspaceId: params.workspaceId as string | undefined,
          consent: params.consent,
        });
        if (session === null) {
          throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        }
        return successEnvelope(
          requestId,
          {
            session: {
              uri: sessionUri(session.id),
              status: session.status,
              eventCount: session.eventCount,
            },
            total: 1,
          },
          { provenance: observedProvenance(sessionUri(session.id)) },
        );
      }
      if (typeof params.sessionId !== "string") {
        throw invalidInput(`${name}.sessionId is invalid.`, requestId);
      }
      if (name === "replay_record_events") {
        if (!Array.isArray(params.events)) {
          throw invalidInput("replay_record_events.events is invalid.", requestId);
        }
        const stored = await recordReplayEvents(db, {
          sessionId: params.sessionId,
          actorId,
          events: params.events,
        });
        if (stored === null) {
          throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        }
        return successEnvelope(
          requestId,
          {
            recorded: stored.recorded,
            eventCount: stored.eventCount,
            session: { uri: sessionUri(params.sessionId), eventCount: stored.eventCount },
            total: stored.recorded,
          },
          { provenance: observedProvenance(sessionUri(params.sessionId)) },
        );
      }
      if (name === "replay_close_session") {
        const session = await closeReplaySession(db, { sessionId: params.sessionId, actorId });
        if (session === null) {
          throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        }
        return successEnvelope(
          requestId,
          {
            session: { uri: sessionUri(session.id), status: session.status, eventCount: session.eventCount },
            total: 1,
          },
          { provenance: observedProvenance(sessionUri(session.id)) },
        );
      }
      const replay = await getReplayEvents(db, { sessionId: params.sessionId, actorId });
      if (replay === null) {
        throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      }
      return successEnvelope(
        requestId,
        {
          session: { uri: sessionUri(replay.session.id), status: replay.session.status, eventCount: replay.session.eventCount },
          events: replay.events,
          total: replay.events.length,
        },
        { provenance: observedProvenance(sessionUri(replay.session.id)) },
      );
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      // Unknown sessions read as not-found without an oracle; malformed
      // envelopes, missing consent, closed writes, and budget breaches fail
      // validation on both transports.
      if (thrown instanceof ReplayError) {
        if (thrown.code === "replay/not-found") {
          throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        }
        throw invalidInput(`Replay ledger is invalid: ${thrown.code}.`, requestId);
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (name === "get_registry_item") {
    if (typeof params.name !== "string") {
      throw invalidInput("get_registry_item.name is invalid.", requestId);
    }
    try {
      requireCapability("registry", requestId);
      const item = buildRegistryItem(params.name);
      return successEnvelope(
        requestId,
        { item },
        { provenance: observedProvenance() },
      );
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      if (thrown instanceof Error && thrown.name === "RegistryError") {
        const code = (thrown as { code?: unknown }).code;
        if (code === "registry/not-found") {
          throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        }
        throw new AgentContractError("NOT_AVAILABLE", { requestId });
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (name === "search_registry") {
    if (
      params.query !== undefined &&
      (typeof params.query !== "string" || params.query.length > 200)
    ) {
      throw invalidInput("search_registry.query is invalid.", requestId);
    }
    let limit: number;
    try {
      limit = parseSearchLimit(params.limit);
    } catch {
      throw invalidInput("search_registry.limit is invalid.", requestId);
    }
    try {
      requireCapability("registry", requestId);
      const outcome = searchRegistryIndex(params.query ?? "", limit);
      return successEnvelope(
        requestId,
        { items: outcome.items, total: outcome.total },
        { provenance: observedProvenance() },
      );
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      if (thrown instanceof Error && thrown.name === "RegistryError") {
        throw new AgentContractError("NOT_AVAILABLE", { requestId });
      }
      throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
    }
  }
  if (name === "save_reference") {
    if (typeof params.collectionId !== "string" || typeof params.artifactId !== "string") {
      throw invalidInput("save_reference arguments are invalid.", requestId);
    }
    const actorId = requireUser(ctx);
    try {
      requireCapability("packs", requestId);
      // IdempotencyKey is accepted and validated but needs no ledger:
      // re-saving the same pair is a no-op via ON CONFLICT, so safe
      // retries with the same key return the same saved URI.
      await saveReference(db, {
        collectionId: params.collectionId,
        artifactId: params.artifactId,
        actorId,
      });
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
    }
    return successEnvelope(
      requestId,
      { saved: true, uri: `skilit://artifact/${params.artifactId}` },
      { provenance: observedProvenance(`skilit://artifact/${params.artifactId}`) },
    );
  }
  if (name === "create_reference_pack") {
    if (typeof params.workspaceId !== "string" || typeof params.title !== "string") {
      throw invalidInput("create_reference_pack arguments are invalid.", requestId);
    }
    if (params.visibility !== undefined && params.visibility !== "private" && params.visibility !== "workspace") {
      throw invalidInput("create_reference_pack.visibility is invalid.", requestId);
    }
    if (
      params.artifactIds !== undefined &&
      (!Array.isArray(params.artifactIds) ||
        params.artifactIds.some((entry) => typeof entry !== "string"))
    ) {
      throw invalidInput("create_reference_pack.artifactIds is invalid.", requestId);
    }
    const actorId = requireUser(ctx);
    const packInput = {
      workspaceId: params.workspaceId as string,
      title: params.title as string,
      actorId,
    } as {
      workspaceId: string;
      title: string;
      actorId: string;
      visibility?: "private" | "workspace";
      artifactIds?: string[];
    };
    if (params.visibility !== undefined) {
      packInput.visibility = params.visibility as "private" | "workspace";
    }
    if (params.artifactIds !== undefined) {
      packInput.artifactIds = params.artifactIds as string[];
    }
    try {
      requireCapability("packs", requestId);
      // AF-03c idempotent pack creation: sequential retries with the same
      // (user, idempotencyKey) return the same canonical collection URI
      // instead of duplicating packs. Keys are per-user so one actor can
      // never recover another actor's pack through a guessed key.
      if (idempotencyKey !== undefined) {
        const existing = await findPackForIdempotencyKey(db, actorId, idempotencyKey);
        if (existing !== null) {
          const exported = await exportReferencePack(db, existing, actorId);
          const requested = packInput.artifactIds?.length ?? 0;
          const partial = requested > 0 && exported.itemCount < requested;
          return successEnvelope(
            requestId,
            { pack: exported },
            {
              provenance: observedProvenance(exported.uri),
              warnings: partial ? ["Some references were withheld by rights or visibility."] : undefined,
              partial,
            },
          );
        }
      }
      const pack = await createReferencePack(db, packInput);
      if (idempotencyKey !== undefined) {
        await claimPackIdempotency(db, actorId, idempotencyKey, pack.collectionId);
        // Close the concurrent same-key race: if a sibling call claimed the
        // key first, our insert did nothing and the ledger points at the
        // winner. Delete our orphaned duplicate (best effort; we own it) and
        // return the winner so concurrent retries still converge on one URI.
        const winner = await findPackForIdempotencyKey(db, actorId, idempotencyKey);
        if (winner !== null && winner !== pack.collectionId) {
          try {
            await deleteCollection(db, { collectionId: pack.collectionId, actorId });
          } catch {
            // Orphan cleanup is best effort; the canonical answer is still
            // the winner's pack below.
          }
          const exportedWinner = await exportReferencePack(db, winner, actorId);
          const requested = packInput.artifactIds?.length ?? 0;
          const partial = requested > 0 && exportedWinner.itemCount < requested;
          return successEnvelope(
            requestId,
            { pack: exportedWinner },
            {
              provenance: observedProvenance(exportedWinner.uri),
              warnings: partial ? ["Some references were withheld by rights or visibility."] : undefined,
              partial,
            },
          );
        }
      }
      const exported = await exportReferencePack(db, pack.collectionId, actorId);
      const requested = packInput.artifactIds?.length ?? 0;
      const partial = requested > 0 && exported.itemCount < requested;
      return successEnvelope(
        requestId,
        { pack: exported },
        {
          provenance: observedProvenance(exported.uri),
          warnings: partial ? ["Some references were withheld by rights or visibility."] : undefined,
          partial,
        },
      );
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
    }
  }
  if (name === "get_object") {
    if (typeof params.uri !== "string") {
      throw invalidInput("get_object.uri is invalid.", requestId);
    }
    try {
      const parsed = parseSkilitUri(params.uri);
      if (parsed.type === "artifact") {
        const actorId = requireUser(ctx);
        const artifact = await getArtifactForActor(db, parsed.id, actorId);
        if (artifact === null) {
          throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
        }
        if (artifact.rightsClassification === "restricted") {
          throw new AgentContractError("RIGHTS_RESTRICTED", {
            requestId,
            provenance: observedProvenance(params.uri),
          });
        }
        return successEnvelope(
          requestId,
          {
            object: {
              uri: params.uri,
              kind: artifact.kind,
              title: artifact.title,
              rights: artifact.rightsClassification,
            },
          },
          { provenance: observedProvenance(params.uri) },
        );
      }
      const actorId = requireUser(ctx);
      try {
        requireCapability("packs", requestId);
        const exported = await exportReferencePack(db, parsed.id, actorId);
        let partial = false;
        let warnings: string[] | undefined;
        try {
          const refs = await listReferences(db, parsed.id, actorId);
          if (refs.length > exported.itemCount) {
            partial = true;
            warnings = ["Some references were withheld by rights or visibility."];
          }
        } catch {
          // Best-effort withholding signal; export already succeeded.
        }
        return successEnvelope(
          requestId,
          { pack: exported },
          { provenance: observedProvenance(exported.uri), warnings, partial },
        );
      } catch (thrown) {
        if (thrown instanceof AgentContractError) throw thrown;
        throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      }
    } catch (thrown) {
      if (thrown instanceof AgentContractError) throw thrown;
      if (thrown instanceof Error && thrown.name === "PackError") {
        if ((thrown as { code?: unknown }).code === "packs/invalid") {
          throw invalidInput("get_object.uri is invalid.", requestId);
        }
        throw new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
      }
      throw thrown;
    }
  }
  if (name === "lens_create_job") {
    const actorId = requireUser(ctx);
    const createBody: Record<string, unknown> = {
      workspaceId: params.workspaceId,
      sourceUrl: params.sourceUrl,
      mode: params.mode,
      maxPages: params.maxPages,
      maxDepth: params.maxDepth,
      maxBytes: params.maxBytes,
      timeBudgetMs: params.timeBudgetMs,
      idempotencyKey: params.idempotencyKey,
    };
    for (const optional of ["pages", "viewports", "retentionDays", "maxAttempts"] as const) {
      if (params[optional] !== undefined) createBody[optional] = params[optional];
    }
    return lensResultToEnvelope(await createLensJobRoute(db, createBody, actorId, requestId));
  }
  if (name === "lens_poll_job") {
    const actorId = requireUser(ctx);
    const kitId = resolveLensKitId(params, requestId);
    return lensResultToEnvelope(
      await pollLensJobRoute(db, { workspaceId: params.workspaceId, kitId }, actorId, requestId),
    );
  }
  if (name === "lens_get_job") {
    const actorId = requireUser(ctx);
    const kitId = resolveLensKitId(params, requestId);
    return lensResultToEnvelope(
      await getLensJobRoute(db, { workspaceId: params.workspaceId, kitId }, actorId, requestId),
    );
  }
  if (name === "lens_cancel_job") {
    const actorId = requireUser(ctx);
    const kitId = resolveLensKitId(params, requestId);
    return lensResultToEnvelope(
      await cancelLensJobRoute(db, { workspaceId: params.workspaceId, kitId }, actorId, requestId),
    );
  }
  if (name === "lens_retry_job") {
    const actorId = requireUser(ctx);
    const kitId = resolveLensKitId(params, requestId);
    return lensResultToEnvelope(
      await retryLensJobRoute(db, { workspaceId: params.workspaceId, kitId }, actorId, requestId),
    );
  }
  if (name === "lens_resume_job") {
    const actorId = requireUser(ctx);
    const kitId = resolveLensKitId(params, requestId);
    return lensResultToEnvelope(
      await resumeLensJobRoute(
        db, { workspaceId: params.workspaceId, kitId, workerId: params.workerId }, actorId, requestId,
      ),
    );
  }
  if (name === "lens_read_artifact") {
    const actorId = requireUser(ctx);
    const kitId = resolveLensKitId(params, requestId);
    const downloaded = await downloadLensArtifactRoute(
      db, { workspaceId: params.workspaceId, kitId, name: params.name }, actorId, requestId,
    );
    if (downloaded.file !== undefined) {
      const text = new TextDecoder().decode(downloaded.file.bytes);
      let artifact: unknown;
      try {
        artifact = JSON.parse(text) as unknown;
      } catch {
        throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
      }
      return successEnvelope(
        requestId,
        {
          artifact,
          sha256: downloaded.file.sha256,
          mediaType: downloaded.file.mediaType,
          filename: downloaded.file.filename,
        },
        { provenance: observedProvenance(lensUriFor(kitId)) },
      );
    }
    if (downloaded.body !== undefined) {
      return lensResultToEnvelope({ status: downloaded.status, body: downloaded.body });
    }
    throw new AgentContractError("INTERNAL_OPAQUE", { requestId });
  }
  if (name === "board_handoff") {
    const actorId = requireUser(ctx);
    const boardId = resolveBoardId(params, requestId);
    return boardResultToEnvelope(
      await handOffBoardRoute(
        db,
        boardId,
        { workspaceId: params.workspaceId, toSubjectId: params.toSubjectId },
        actorId,
        requestId,
      ),
    );
  }
  if (name === "board_list_handoffs") {
    const actorId = requireUser(ctx);
    const boardId = resolveBoardId(params, requestId);
    return boardResultToEnvelope(await listBoardHandoffsRoute(db, { boardId }, actorId, requestId));
  }
  if (name === "board_validate_items") {
    const actorId = requireUser(ctx);
    const boardId = resolveBoardId(params, requestId);
    return boardResultToEnvelope(await validateBoardItemsRoute(db, { boardId }, actorId, requestId));
  }
  throw { code: -32601, message: "Tool not found." };
}

async function handleOne(
  db: DbClient,
  ctx: McpContext,
  request: unknown,
): Promise<JsonRpcResponse | null> {
  if (!isRecord(request) || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return error(
      isRecord(request) ? (request as { id?: unknown }).id : null,
      -32600,
      "Invalid request.",
    );
  }
  const { id, method } = request as { id: unknown; method: string };
  // Notifications (valid requests without IDs) receive no response.
  if (id === undefined) return null;
  const params = (request as { params?: unknown }).params;
  if (method === "initialize") {
    const version = negotiateVersion(
      isRecord(params) ? (params as { protocolVersion?: unknown }).protocolVersion : undefined,
    );
    // AF-03c: advertise operator-gated Skilit capabilities alongside the
    // standard MCP capabilities so independent clients negotiate without
    // calling a disabled tool first. Unknown future fields are ignored by
    // older clients; the core protocolVersion/tools contract is unchanged.
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: version,
        serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
        capabilities: { tools: {} },
        skilit: { agentContract: AGENT_SCHEMA_VERSION, capabilities: getSkilitCapabilities() },
      },
    };
  }
  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }
  if (method === "tools/list" || method === "tools/call") {
    try {
      requireUser(ctx);
    } catch (denied) {
      if (denied instanceof AgentContractError) {
        const envelope = denied.toFailureEnvelope();
        return error(id, denied.mcpCode, denied.safeMessage, { envelope });
      }
      return error(id, -32001, "Unauthorized.");
    }
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: toolSchemas() } };
  }
  if (method === "tools/call") {
    if (!isRecord(params)) {
      const err = new AgentContractError("INVALID_INPUT", { message: "Invalid params." });
      return error(id, err.mcpCode, err.safeMessage, { envelope: err.toFailureEnvelope() });
    }
    try {
      const envelope = await callTool(
        db,
        ctx,
        (params as { name?: unknown }).name,
        (params as { arguments?: unknown }).arguments,
      );
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(envelope) }] } };
    } catch (thrown) {
      // Domain failures carry the canonical envelope in error.data so MCP
      // and REST share one error policy; transport codes stay compatible.
      if (thrown instanceof AgentContractError) {
        const envelope = thrown.toFailureEnvelope();
        return error(id, thrown.mcpCode, thrown.safeMessage, { envelope });
      }
      if (isRecord(thrown) && typeof thrown.code === "number" && typeof thrown.message === "string") {
        return error(id, thrown.code, thrown.message);
      }
      const fallback = new AgentContractError("INTERNAL_OPAQUE");
      return error(id, fallback.mcpCode, fallback.safeMessage, {
        envelope: fallback.toFailureEnvelope(),
      });
    }
  }
  return error(id, -32601, "Method not found.");
}

/**
 * Dispatch one JSON-RPC request or batch. Notifications without IDs
 * produce no responses, per JSON-RPC 2.0.
 */
export async function dispatchMcp(
  db: DbClient,
  ctx: McpContext,
  body: unknown,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > MCP_MAX_BATCH) {
      return error(null, -32600, "Invalid request.");
    }
    const responses: JsonRpcResponse[] = [];
    for (const entry of body) {
      const response = await handleOne(db, ctx, entry);
      if (response !== null) responses.push(response);
    }
    // Notification-only batches produce no responses.
    if (responses.length === 0) return null;
    return responses;
  }
  return handleOne(db, ctx, body);
}

export function bearerToken(header: string | null): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match === null) return null;
  const token = (match[1] ?? "").trim();
  return token.length > 0 ? token : null;
}

/**
 * Bind a presented bearer token to a server-resolved user identity via
 * the session store. Invalid, expired, or revoked sessions throw; the
 * route maps every failure to an opaque 401.
 */
export async function resolveRequestUser(
  db: DbClient,
  token: string | null,
): Promise<string> {
  if (token === null) {
    throw new Error("Missing bearer token.");
  }
  const session = await validateSession(db, token);
  return session.user.id;
}

export { AGENT_SCHEMA_VERSION };
export type { AgentEnvelope };
