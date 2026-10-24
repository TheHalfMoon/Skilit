import type { DbTransaction } from "../../db/src/db.ts";
import { getArtifactForActor } from "../../db/src/artifact-access.ts";
import { ARTIFACT_KINDS } from "../../db/src/graph.ts";
import type { Artifact } from "../../db/src/graph.ts";
import { RegistryError, servingPolicy } from "./registry.ts";

/**
 * AF-13a-i deterministic artifact similarity (Skilit-owned, no embeddings).
 *
 * `find_similar` answers "artifact -> similar artifacts" over the
 * actor-readable corpus using only deterministic lexical signals:
 * token-set Jaccard over title, summary, canonical text, and metadata
 * tags. This is a lexical baseline, never a semantic embedding: scores
 * are reproducible byte-for-byte, require no model, GPU, or paid
 * service, and are labeled `deterministic-computation` in agent
 * envelopes. A future optional embedding plugin needs its own
 * pin/rights/performance acceptance and MUST NOT silently replace
 * this baseline.
 *
 * Authorization mirrors the AF-SEC-00 gate: the reference must be
 * readable by the actor (denied and missing both read as not-found, no
 * existence oracle), and every candidate is filtered by the same
 * workspace-membership predicate the search path applies before
 * ranking. Rights classifications travel as labels; bytes are never
 * served here, only metadata plus scores.
 *
 * Bounds: candidates are examined in stable id order up to
 * `maxCandidates` (default 500); truncation is reported explicitly
 * with a partial envelope rather than silently dropping results.
 *
 * AF-13a-ii adds `compare_design` in this module: an observed,
 * evidence-linked diff between two readable artifacts. It states what
 * differs across kind/title/summary/rights/license/trademark/serving/
 * tags plus shared and unique terms; it never invents why.
 *
 * AF-14b-i extends the kinds gate from the registry triple
 * (icon/logo/font) to every canonical artifact kind, so research
 * corpus artifacts (screens, pages, flows backing artifacts, components,
 * and the remaining kinds) participate in the same lexical baseline
 * with identical authorization, ordering, and truncation semantics.
 * The baseline stays lexical: no embeddings, no visual claims.
 */

export const SIMILARITY_KINDS = [...ARTIFACT_KINDS] as const;
export type SimilarityKind = (typeof SIMILARITY_KINDS)[number];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_OFFSET = 1_000_000;
const DEFAULT_MAX_CANDIDATES = 500;
const MIN_MAX_CANDIDATES = 1;
const MAX_MAX_CANDIDATES = 10_000;

export interface SimilarEntry {
  artifactId: string;
  kind: string;
  title: string;
  /** Jaccard score in [0, 1], rounded to 4 decimals. */
  score: number;
  license: string;
  trademark: boolean;
  rightsClassification: string;
  serving: string;
  servingReason: string;
  sourceKey: string;
  contentHash: string;
}

export interface SimilarResult {
  reference: { artifactId: string; kind: string; title: string; rightsClassification: string };
  similar: SimilarEntry[];
  /** Positive-similarity candidates examined (before pagination). */
  total: number;
  /** True when the candidate cap was reached; results are a prefix. */
  truncated: boolean;
}

/**
 * Lowercase alphanumeric token set, sorted and deduplicated so
 * scoring is order-independent and byte-deterministic.
 */
export function tokenizeSimilarityText(text: string): string[] {
  if (typeof text !== "string") return [];
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
  return [...new Set(tokens)].sort();
}

/** Jaccard index over sorted unique token lists, rounded to 4 decimals. */
export function jaccardSimilarity(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return Math.round((intersection / union) * 10_000) / 10_000;
}

function artifactTags(artifact: Artifact): string[] {
  const metadata: unknown = artifact.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return [];
  const tags: unknown = (metadata as Record<string, unknown>).tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === "string");
}

function textOf(input: {
  title: string;
  summary: string | null;
  canonicalText: string | null;
  tags: string[];
}): string {
  return [input.title, input.summary ?? "", input.canonicalText ?? "", input.tags.join(" ")].join(" ");
}

function referenceText(reference: Artifact): string {
  return textOf({
    title: reference.title,
    summary: reference.summary ?? null,
    canonicalText: reference.canonicalText ?? null,
    tags: artifactTags(reference),
  });
}

interface CandidateRow {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  canonicalText: string | null;
  tags: string[];
  license: string;
  trademark: boolean;
  bytesRegistered: boolean;
  rightsClassification: string;
  contentHash: string;
  sourceKey: string;
}

function toCandidate(row: Record<string, unknown>): CandidateRow {
  let metadata: unknown = row.metadata;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      throw new RegistryError("assets/invalid-record", "Asset metadata is corrupt.");
    }
  }
  const record = (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    ? metadata
    : {}) as Record<string, unknown>;
  const tags = Array.isArray(record.tags)
    ? (record.tags as unknown[]).filter((tag): tag is string => typeof tag === "string")
    : [];
  return {
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title),
    summary: row.summary === null ? null : String(row.summary),
    canonicalText: row.canonical_text === null ? null : String(row.canonical_text),
    tags,
    license: typeof record.license === "string" ? record.license : "unknown",
    trademark: record.trademark === true,
    bytesRegistered: record.bytesRegistered === true,
    rightsClassification: String(row.rights_classification),
    contentHash: String(row.content_hash),
    sourceKey: String(row.source_key),
  };
}

function toEntry(row: CandidateRow, score: number): SimilarEntry {
  let policy = servingPolicy({
    rightsClassification: row.rightsClassification,
    license: row.license,
    trademark: row.trademark,
  });
  if (policy.serving === "download" && row.bytesRegistered !== true) {
    policy = { serving: "metadata-only", reason: "No distributable bytes registered." };
  }
  return {
    artifactId: row.id,
    kind: row.kind,
    title: row.title,
    score,
    license: row.license,
    trademark: row.trademark,
    rightsClassification: row.rightsClassification,
    serving: policy.serving,
    servingReason: policy.reason,
    sourceKey: row.sourceKey,
    contentHash: row.contentHash,
  };
}

/**
 * Deterministic similar-artifact retrieval for one authenticated actor.
 * Throws RegistryError invalid-record for malformed input and
 * RegistryError not-found when the reference is missing or unreadable
 * (callers map not-found to FORBIDDEN_OR_NOT_FOUND, never to an
 * existence oracle).
 */
export async function findSimilarForActor(
  tx: DbTransaction,
  input: {
    artifactId: string;
    actorId: string;
    kinds?: string[] | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    maxCandidates?: number | undefined;
  },
): Promise<SimilarResult> {
  if (typeof input.artifactId !== "string" || !UUID_PATTERN.test(input.artifactId)) {
    throw new RegistryError("assets/invalid-record", "Similar reference is invalid.");
  }
  if (typeof input.actorId !== "string" || input.actorId.length === 0) {
    throw new RegistryError("assets/invalid-record", "Actor is invalid.");
  }
  const kinds = input.kinds ?? [...SIMILARITY_KINDS];
  if (
    !Array.isArray(kinds) ||
    kinds.length === 0 ||
    kinds.length > SIMILARITY_KINDS.length ||
    kinds.some((kind) => typeof kind !== "string" || !(SIMILARITY_KINDS as readonly string[]).includes(kind)) ||
    new Set(kinds).size !== kinds.length
  ) {
    throw new RegistryError("assets/invalid-record", "Similar kinds are invalid.");
  }
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RegistryError("assets/invalid-record", "Similar limit is invalid.");
  }
  const offset = input.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    throw new RegistryError("assets/invalid-record", "Similar cursor is invalid.");
  }
  const maxCandidates = input.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  if (!Number.isInteger(maxCandidates) || maxCandidates < MIN_MAX_CANDIDATES || maxCandidates > MAX_MAX_CANDIDATES) {
    throw new RegistryError("assets/invalid-record", "Similar candidate budget is invalid.");
  }

  const reference = await getArtifactForActor(tx, input.artifactId, input.actorId);
  if (reference === null) {
    throw new RegistryError("assets/not-found", "Similar reference was not found.");
  }
  const referenceTokens = tokenizeSimilarityText(referenceText(reference));

  const params: unknown[] = [input.artifactId];
  const kindPlaceholders = kinds.map((kind) => {
    params.push(kind);
    return "$" + params.length;
  });
  params.push(input.actorId);
  const memberParam = "$" + params.length;
  params.push(input.actorId);
  const ownerParam = "$" + params.length;
  params.push(maxCandidates + 1);
  const capParam = "$" + params.length;
  // Actor-scope predicate mirroring the AF-SEC-00 central gate
  // (getArtifactForActor): only GLOBAL public rows are readable by
  // any actor; global curated-registry rows (icon/logo/font) stay
  // readable; workspace-bound rows always require membership, including
  // those marked public, with owner match
  // for private rows. Scope filters before scoring, facets, and
  // pagination. Candidates are examined in stable id order so
  // truncation prefixes are reproducible.
  const result = await tx.query(
    "select a.id, a.kind, a.title, a.summary, a.canonical_text, a.metadata, " +
      "a.rights_classification, a.content_hash, s.key as source_key " +
      "from artifacts a join sources s on s.id = a.source_id " +
      "where a.id <> $1 and a.kind in (" + kindPlaceholders.join(", ") + ") and " +
      "((a.workspace_id is null and " +
      "(a.visibility = 'public' or a.kind in ('icon', 'logo', 'font'))) or " +
      "(a.workspace_id is not null and exists (" +
      "select 1 from workspace_members m where m.workspace_id = a.workspace_id " +
      "and m.user_id = " + memberParam + " and (" +
      "a.visibility = 'workspace' or a.visibility = 'public' or " +
      "(a.visibility = 'private' and a.owner_subject = " + ownerParam + ")" +
      ")))) order by a.id asc limit " + capParam,
    params,
  );
  const truncated = result.rows.length > maxCandidates;
  const examined = truncated ? result.rows.slice(0, maxCandidates) : result.rows;

  const scored: { row: CandidateRow; score: number }[] = [];
  for (const raw of examined) {
    const row = toCandidate(raw as Record<string, unknown>);
    const score = jaccardSimilarity(
      referenceTokens,
      tokenizeSimilarityText(textOf(row)),
    );
    if (score > 0) scored.push({ row, score });
  }
  // Deterministic rank: score desc, title asc, id asc. Titles compare by
  // UTF-16 code units, stable across runtimes for the same input.
  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.row.title !== right.row.title) return left.row.title < right.row.title ? -1 : 1;
    if (left.row.id === right.row.id) return 0;
    return left.row.id < right.row.id ? -1 : 1;
  });
  const page = scored.slice(offset, offset + limit);
  return {
    reference: {
      artifactId: reference.id,
      kind: reference.kind,
      title: reference.title,
      rightsClassification: reference.rightsClassification,
    },
    similar: page.map((entry) => toEntry(entry.row, entry.score)),
    total: scored.length,
    truncated,
  };
}

export interface ComparedSide {
  artifactId: string;
  kind: string;
  title: string;
  summary: string | null;
  rightsClassification: string;
  license: string;
  trademark: boolean;
  serving: string;
  servingReason: string;
  tags: string[];
}

export interface FieldDiff {
  field: string;
  left: unknown;
  right: unknown;
}

export interface CompareResult {
  left: ComparedSide;
  right: ComparedSide;
  identical: boolean;
  /** Shared-token Jaccard between both artifacts, 4-decimal rounded. */
  score: number;
  sharedTerms: string[];
  uniqueLeft: string[];
  uniqueRight: string[];
  /** One entry per compared field whose values differ. */
  fieldDiffs: FieldDiff[];
}

function comparedSide(artifact: Artifact): ComparedSide {
  const tags = artifactTags(artifact);
  const meta: Record<string, unknown> =
    typeof artifact.metadata === "object" && artifact.metadata !== null ? artifact.metadata : {};
  const license = typeof meta.license === "string" ? meta.license : "unknown";
  const trademark = meta.trademark === true;
  let policy = servingPolicy({ rightsClassification: artifact.rightsClassification, license, trademark });
  if (policy.serving === "download" && meta.bytesRegistered !== true) {
    policy = { serving: "metadata-only", reason: "No distributable bytes registered." };
  }
  return {
    artifactId: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary ?? null,
    rightsClassification: artifact.rightsClassification,
    license,
    trademark,
    serving: policy.serving,
    servingReason: policy.reason,
    tags: [...tags].sort(),
  };
}

/**
 * Deterministic two-artifact comparison for one authenticated actor.
 * Both references must be readable; a missing, malformed, or denied
 * identifier on either side reads as not-found with no oracle about
 * which side failed. Transports deny readable-but-restricted pairs
 * with RIGHTS_RESTRICTED (mirroring get_object) while this function
 * returns rights labels for enforcement.
 */
export async function compareArtifactsForActor(
  tx: DbTransaction,
  input: { leftArtifactId: string; rightArtifactId: string; actorId: string },
): Promise<CompareResult> {
  for (const key of ["leftArtifactId", "rightArtifactId"] as const) {
    const value: unknown = input[key];
    if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
      throw new RegistryError("assets/invalid-record", "Compared reference is invalid.");
    }
  }
  if (typeof input.actorId !== "string" || input.actorId.length === 0) {
    throw new RegistryError("assets/invalid-record", "Actor is invalid.");
  }
  const left = await getArtifactForActor(tx, input.leftArtifactId, input.actorId);
  const right = await getArtifactForActor(tx, input.rightArtifactId, input.actorId);
  if (left === null || right === null) {
    throw new RegistryError("assets/not-found", "Compared reference was not found.");
  }
  const leftTokens = tokenizeSimilarityText(referenceText(left));
  const rightTokens = tokenizeSimilarityText(referenceText(right));
  const score = jaccardSimilarity(leftTokens, rightTokens);
  const rightSet = new Set(rightTokens);
  const leftSet = new Set(leftTokens);
  const sharedTerms = leftTokens.filter((token) => rightSet.has(token));
  const uniqueLeft = leftTokens.filter((token) => !rightSet.has(token));
  const uniqueRight = rightTokens.filter((token) => !leftSet.has(token));
  const comparedLeft = comparedSide(left);
  const comparedRight = comparedSide(right);
  const fieldDiffs: FieldDiff[] = [];
  const fields: (keyof ComparedSide)[] = [
    "kind",
    "title",
    "summary",
    "rightsClassification",
    "license",
    "trademark",
    "serving",
    "tags",
  ];
  for (const field of fields) {
    const leftValue = comparedLeft[field];
    const rightValue = comparedRight[field];
    const same = Array.isArray(leftValue) && Array.isArray(rightValue)
      ? leftValue.length === rightValue.length && leftValue.every((item, index) => item === (rightValue as unknown[])[index])
      : leftValue === rightValue;
    if (!same) fieldDiffs.push({ field, left: leftValue, right: rightValue });
  }
  return {
    left: comparedLeft,
    right: comparedRight,
    identical: fieldDiffs.length === 0,
    score,
    sharedTerms,
    uniqueLeft,
    uniqueRight,
    fieldDiffs,
  };
}
