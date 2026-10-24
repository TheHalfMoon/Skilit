import { createHash } from "node:crypto";
import type { DbTransaction } from "../../db/src/db.ts";
import {
  ARTIFACT_KINDS,
  RIGHTS,
  createArtifact,
  type ArtifactKind,
  type Rights,
} from "../../db/src/graph.ts";
import {
  addFlowStep,
  createFlow,
  listFlowSteps,
  registerImport,
} from "../../db/src/workflows.ts";
import {
  createProduct,
  createProductVersion,
} from "../../db/src/repositories.ts";
import { getArtifactForActor } from "../../db/src/artifact-access.ts";

/**
 * AF-14a authorized fixture-corpus importer (Skilit-owned, no donor runtime).
 *
 * Imports a bounded, rights-explicit research corpus — products, versions,
 * screen/flow artifacts, and ordered flows — through the canonical
 * pattern the asset importers establish: whole-corpus validation first
 * (zero writes on failure), per-entity import-ledger lookup (skip when
 * the fingerprint matches, fail closed on altered replay), canonical
 * creation only for unseen identities, and ledger registration after.
 * Replaying identical content returns the same canonical IDs with
 * replayed=true and zero new rows.
 *
 * Authorization precondition: callers authenticate and own the source
 * before importing. Fixture artifacts are global curated-corpus rows;
 * workspace-bound corpus rows carry explicit workspace/owner bindings.
 * Reads below enforce the AF-SEC-00 actor gate: a flow is listed only
 * when every step artifact is readable by the actor, and a single
 * unreadable step denies the whole flow with no oracle about which.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTERNAL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_PRODUCTS = 20;
const MAX_VERSIONS_PER_PRODUCT = 20;
const MAX_ARTIFACTS_PER_VERSION = 200;
const MAX_FLOWS_PER_VERSION = 20;
const MAX_STEPS_PER_FLOW = 50;
const MAX_TITLE = 500;
const MAX_SUMMARY = 2000;
const MAX_TAGS = 20;
const MAX_TAG_CHARS = 64;
const MAX_FLOWS_EXAMINED = 200;
const FLOW_LIST_MAX_LIMIT = 50;
const FLOW_LIST_DEFAULT_LIMIT = 20;
const MAX_OFFSET = 1_000_000;

export class CorpusError extends Error {
  readonly code: "corpus/invalid-input" | "corpus/not-found" | "corpus/conflict";
  constructor(code: CorpusError["code"], message: string) {
    super(message);
    this.name = "CorpusError";
    this.code = code;
  }
}

function fail(code: CorpusError["code"], message: string): never {
  throw new CorpusError(code, message);
}

export interface CorpusStepInput {
  artifactExternalId: string;
  position: number;
  interaction?: Record<string, unknown> | undefined;
}

export interface CorpusFlowInput {
  externalId: string;
  title: string;
  steps: CorpusStepInput[];
}

/**
 * Source-owner attestation recorded on a research corpus artifact.
 *
 * This is evidence *submitted by the curator*, not legal verification.
 * The identity of the real licensor and the applicability of permission
 * must be reviewed outside this schema. Source-code licensing alone
 * does not confer screenshot, logo or product-screen rights.
 */
export interface CorpusRightsEvidence {
  originUrl: string;
  sourceRevision: string;
  rightsHolder: string;
  rightsBasis: "author-owned" | "open-license" | "explicit-permission";
  licenseId: string;
  licenseEvidenceUrl: string;
  reviewRef: string;
}

const REVISION = /^[0-9a-f]{40}([0-9a-f]{24})?$/i;
const LICENCE = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/;
const REVIEW_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function evidenceUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2048 ||
      /[\u0000-\u001f\u007f]/.test(raw)) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname !== "" &&
      url.username === "" && url.password === "" &&
      url.search === "" && url.hash === "" &&
      url.href === raw;
  } catch {
    return false;
  }
}

function validateRightsEvidence(value: unknown): CorpusRightsEvidence {
  if (!isRecord(value) ||
      !evidenceUrl(value.originUrl) ||
      !evidenceUrl(value.licenseEvidenceUrl) ||
      typeof value.sourceRevision !== "string" || !REVISION.test(value.sourceRevision) ||
      typeof value.rightsHolder !== "string" ||
      value.rightsHolder.trim().length < 2 || value.rightsHolder.length > 180 ||
      !["author-owned", "open-license", "explicit-permission"].includes(String(value.rightsBasis)) ||
      typeof value.licenseId !== "string" || !LICENCE.test(value.licenseId) ||
      typeof value.reviewRef !== "string" || !REVIEW_REF.test(value.reviewRef) ||
      Object.keys(value).some((key) => ![
        "originUrl", "sourceRevision", "rightsHolder", "rightsBasis",
        "licenseId", "licenseEvidenceUrl", "reviewRef",
      ].includes(key))) {
    fail("corpus/invalid-input", "Corpus rights evidence is invalid.");
  }
  const evidence = value as unknown as CorpusRightsEvidence;
  // Canonical order/casing avoids false ledger conflicts caused by
  // a JSON producer reordering keys (or spelling a SHA in uppercase).
  return {
    originUrl: evidence.originUrl,
    sourceRevision: evidence.sourceRevision.toLowerCase(),
    rightsHolder: evidence.rightsHolder.trim(),
    rightsBasis: evidence.rightsBasis,
    licenseId: evidence.licenseId,
    licenseEvidenceUrl: evidence.licenseEvidenceUrl,
    reviewRef: evidence.reviewRef,
  };
}

export interface CorpusArtifactInput {
  externalId: string;
  kind: string;
  title: string;
  summary?: string | undefined;
  tags?: string[] | undefined;
  rightsClassification: string;
  rightsEvidence?: CorpusRightsEvidence | undefined;
  workspaceId?: string | undefined;
  ownerSubject?: string | undefined;
}

export interface CorpusVersionInput {
  versionNo: number;
  artifacts: CorpusArtifactInput[];
  flows: CorpusFlowInput[];
}

export interface CorpusProductInput {
  externalId: string;
  title: string;
  versions: CorpusVersionInput[];
}

export interface CorpusInput {
  products: CorpusProductInput[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateExternalId(value: unknown, label: string): string {
  if (typeof value !== "string" || !EXTERNAL_ID_PATTERN.test(value)) {
    fail("corpus/invalid-input", `Corpus ${label} is invalid.`);
  }
  return value;
}

function validateTitle(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_TITLE) {
    fail("corpus/invalid-input", `Corpus ${label} is invalid.`);
  }
  return value.trim();
}

function validateTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TAGS) {
    fail("corpus/invalid-input", "Corpus tags are invalid.");
  }
  for (const tag of value) {
    if (typeof tag !== "string" || tag.length === 0 || tag.length > MAX_TAG_CHARS) {
      fail("corpus/invalid-input", "Corpus tags are invalid.");
    }
  }
  return [...(value as string[])].sort();
}

/** Pure validation: throws invalid-input without touching the database. */
export function validateCorpusInput(raw: unknown): CorpusInput {
  if (!isRecord(raw) || !Array.isArray(raw.products)) {
    fail("corpus/invalid-input", "Corpus products are invalid.");
  }
  const products = raw.products as unknown[];
  if (products.length === 0 || products.length > MAX_PRODUCTS) {
    fail("corpus/invalid-input", "Corpus products are invalid.");
  }
  const seenProducts = new Set<string>();
  for (const product of products) {
    if (!isRecord(product)) fail("corpus/invalid-input", "Corpus product is invalid.");
    const externalId = validateExternalId(product.externalId, "product identity");
    if (seenProducts.has(externalId)) fail("corpus/invalid-input", "Corpus product identities repeat.");
    seenProducts.add(externalId);
    validateTitle(product.title, "product title");
    if (!Array.isArray(product.versions) || product.versions.length === 0 ||
        product.versions.length > MAX_VERSIONS_PER_PRODUCT) {
      fail("corpus/invalid-input", "Corpus versions are invalid.");
    }
    const seenVersions = new Set<number>();
    for (const version of product.versions as unknown[]) {
      if (!isRecord(version)) fail("corpus/invalid-input", "Corpus version is invalid.");
      if (!Number.isInteger(version.versionNo) || (version.versionNo as number) < 1) {
        fail("corpus/invalid-input", "Corpus version number is invalid.");
      }
      if (seenVersions.has(version.versionNo as number)) {
        fail("corpus/invalid-input", "Corpus version numbers repeat.");
      }
      seenVersions.add(version.versionNo as number);
      if (!Array.isArray(version.artifacts) || (version.artifacts as unknown[]).length > MAX_ARTIFACTS_PER_VERSION) {
        fail("corpus/invalid-input", "Corpus artifacts are invalid.");
      }
      const seenArtifacts = new Set<string>();
      for (const artifact of version.artifacts as unknown[]) {
        if (!isRecord(artifact)) fail("corpus/invalid-input", "Corpus artifact is invalid.");
        const artifactId = validateExternalId(artifact.externalId, "artifact identity");
        if (seenArtifacts.has(artifactId)) fail("corpus/invalid-input", "Corpus artifact identities repeat.");
        seenArtifacts.add(artifactId);
        if (typeof artifact.kind !== "string" || !(ARTIFACT_KINDS as readonly string[]).includes(artifact.kind)) {
          fail("corpus/invalid-input", "Corpus artifact kind is invalid.");
        }
        validateTitle(artifact.title, "artifact title");
        if (artifact.summary !== undefined &&
            (typeof artifact.summary !== "string" || artifact.summary.length > MAX_SUMMARY)) {
          fail("corpus/invalid-input", "Corpus artifact summary is invalid.");
        }
        validateTags(artifact.tags);
        if (artifact.rightsEvidence !== undefined) {
          validateRightsEvidence(artifact.rightsEvidence);
        }
        if (typeof artifact.rightsClassification !== "string" ||
            !(RIGHTS as readonly string[]).includes(artifact.rightsClassification)) {
          fail("corpus/invalid-input", "Corpus rights classification is invalid.");
        }
        if (artifact.workspaceId !== undefined &&
            (typeof artifact.workspaceId !== "string" || !UUID_PATTERN.test(artifact.workspaceId))) {
          fail("corpus/invalid-input", "Corpus workspace is invalid.");
        }
        if (artifact.ownerSubject !== undefined && typeof artifact.ownerSubject !== "string") {
          fail("corpus/invalid-input", "Corpus owner is invalid.");
        }
      }
      if (!Array.isArray(version.flows) || (version.flows as unknown[]).length > MAX_FLOWS_PER_VERSION) {
        fail("corpus/invalid-input", "Corpus flows are invalid.");
      }
      const seenFlows = new Set<string>();
      for (const flow of version.flows as unknown[]) {
        if (!isRecord(flow)) fail("corpus/invalid-input", "Corpus flow is invalid.");
        const flowId = validateExternalId(flow.externalId, "flow identity");
        if (seenFlows.has(flowId)) fail("corpus/invalid-input", "Corpus flow identities repeat.");
        seenFlows.add(flowId);
        validateTitle(flow.title, "flow title");
        if (!Array.isArray(flow.steps) || (flow.steps as unknown[]).length === 0 ||
            (flow.steps as unknown[]).length > MAX_STEPS_PER_FLOW) {
          fail("corpus/invalid-input", "Corpus flow steps are invalid.");
        }
        const seenPositions = new Set<number>();
        for (const step of flow.steps as unknown[]) {
          if (!isRecord(step)) fail("corpus/invalid-input", "Corpus flow step is invalid.");
          validateExternalId(step.artifactExternalId, "step artifact identity");
          if (!seenArtifacts.has(step.artifactExternalId as string)) {
            fail("corpus/invalid-input", "Corpus flow step references an unknown artifact.");
          }
          if (!Number.isInteger(step.position) || (step.position as number) < 0) {
            fail("corpus/invalid-input", "Corpus step position is invalid.");
          }
          if (seenPositions.has(step.position as number)) {
            fail("corpus/invalid-input", "Corpus step positions repeat.");
          }
          seenPositions.add(step.position as number);
          if (step.interaction !== undefined) {
            if (!isRecord(step.interaction)) fail("corpus/invalid-input", "Corpus interaction is invalid.");
            if (JSON.stringify(step.interaction).length > 4096) {
              fail("corpus/invalid-input", "Corpus interaction is invalid.");
            }
          }
        }
      }
    }
  }
  return raw as unknown as CorpusInput;
}

/** Fail-closed before *any* database writes for externally sourced research.
 *
 * The fixture importer intentionally remains usable by deterministic tests.
 * Curators of real screen/product collections must use the qualified entry
 * point below. A syntactically valid provenance assertion is NOT a legal
 * opinion, rights transfer, screenshot authorization or source verification.
 */
export function validateQualifiedCorpusInput(raw: unknown): CorpusInput {
  const input = validateCorpusInput(raw);
  for (const product of input.products) {
    for (const version of product.versions) {
      for (const artifact of version.artifacts) {
        if (artifact.rightsClassification === "unknown" ||
            artifact.rightsEvidence === undefined) {
          fail("corpus/invalid-input", "Qualified research artifact needs reviewed rights evidence.");
        }
        validateRightsEvidence(artifact.rightsEvidence);
      }
    }
  }
  return input;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function findLedgerEntry(
  tx: DbTransaction,
  sourceId: string,
  externalId: string,
  sourceVersion: string,
): Promise<{ canonicalId: string; fingerprint: unknown } | null> {
  const existing = await tx.query(
    `select canonical_id, metadata from import_records
     where source_id = $1 and external_id = $2 and source_version = $3`,
    [sourceId, externalId, sourceVersion],
  );
  const row = existing.rows[0] as Record<string, unknown> | undefined;
  if (row === undefined) return null;
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  return { canonicalId: String(row.canonical_id), fingerprint: (metadata as Record<string, unknown>).fingerprint };
}

/** Reuse an identical replay; fail closed on altered content. */
function reuseOrConflict(entry: { canonicalId: string; fingerprint: unknown }, print: string, label: string): string {
  if (entry.fingerprint !== print) {
    fail("corpus/conflict", `Corpus ${label} conflicts with the import ledger.`);
  }
  return entry.canonicalId;
}

export interface CorpusImportSummary {
  products: number;
  versions: number;
  artifacts: number;
  flows: number;
  steps: number;
  /** True when every entity already existed with identical content. */
  replayed: boolean;
}

/**
 * Import a validated corpus idempotently. Whole-corpus validation runs
 * before the first write; replaying identical content returns the same
 * canonical IDs with replayed=true and zero new rows; replaying altered
 * content under the same external identity fails closed with
 * corpus/conflict via the ledger fingerprint check.
 */
export async function importCorpusFixture(
  tx: DbTransaction,
  input: { sourceId: string; sourceVersion: string; corpus: unknown },
): Promise<CorpusImportSummary> {
  if (typeof input.sourceId !== "string" || input.sourceId.length === 0) {
    fail("corpus/invalid-input", "Corpus source is invalid.");
  }
  if (typeof input.sourceVersion !== "string" || input.sourceVersion.length === 0 ||
      input.sourceVersion.length > 128) {
    fail("corpus/invalid-input", "Corpus source version is invalid.");
  }
  const corpus = validateCorpusInput(input.corpus);
  const summary: CorpusImportSummary = { products: 0, versions: 0, artifacts: 0, flows: 0, steps: 0, replayed: true };
  for (const product of corpus.products) {
    const productKey = `product:${product.externalId}`;
    const productPrint = fingerprint({ title: product.title });
    const knownProduct = await findLedgerEntry(tx, input.sourceId, productKey, input.sourceVersion);
    let productId: string;
    if (knownProduct === null) {
      summary.replayed = false;
      const created = await createProduct(tx, {
        sourceId: input.sourceId,
        externalId: product.externalId,
        title: product.title,
      });
      productId = created.id;
      await registerImport(tx, {
        sourceId: input.sourceId,
        externalId: productKey,
        sourceVersion: input.sourceVersion,
        canonicalType: "product",
        canonicalId: productId,
        metadata: { fingerprint: productPrint },
      });
    } else {
      productId = reuseOrConflict(knownProduct, productPrint, "product replay");
    }
    summary.products += 1;
    for (const version of product.versions) {
      const versionKey = `product-version:${product.externalId}:${version.versionNo}`;
      const versionPrint = fingerprint({ versionNo: version.versionNo });
      const knownVersion = await findLedgerEntry(tx, input.sourceId, versionKey, input.sourceVersion);
      let versionId: string;
      if (knownVersion === null) {
        summary.replayed = false;
        const created = await createProductVersion(tx, { productId, versionNo: version.versionNo });
        versionId = created.id;
        await registerImport(tx, {
          sourceId: input.sourceId,
          externalId: versionKey,
          sourceVersion: input.sourceVersion,
          canonicalType: "product_version",
          canonicalId: versionId,
          metadata: { fingerprint: versionPrint },
        });
      } else {
        versionId = reuseOrConflict(knownVersion, versionPrint, "version replay");
      }
      summary.versions += 1;
      const artifactIds = new Map<string, string>();
      for (const artifact of version.artifacts) {
        const tags = validateTags(artifact.tags);
        const rightsEvidence = artifact.rightsEvidence === undefined
          ? undefined : validateRightsEvidence(artifact.rightsEvidence);
        const artifactKey = `artifact:${product.externalId}:${version.versionNo}:${artifact.externalId}`;
        const artifactPrint = fingerprint({
          kind: artifact.kind,
          title: artifact.title,
          summary: artifact.summary ?? null,
          tags,
          rights: artifact.rightsClassification,
          // Preserve the exact historical fingerprint for fixture-only data.
          ...(rightsEvidence === undefined ? {} : { rightsEvidence }),
          versionId,
        });
        const knownArtifact = await findLedgerEntry(tx, input.sourceId, artifactKey, input.sourceVersion);
        if (knownArtifact === null) {
          summary.replayed = false;
          const created = await createArtifact(tx, {
            kind: artifact.kind as ArtifactKind,
            title: artifact.title,
            sourceId: input.sourceId,
            contentHash: createHash("sha256").update(artifactPrint).digest("hex"),
            rightsClassification: artifact.rightsClassification as Rights,
            productId,
            productVersionId: versionId,
            summary: artifact.summary,
            visibility: artifact.workspaceId === undefined ? "public" : "private",
            workspaceId: artifact.workspaceId,
            ownerSubject: artifact.ownerSubject,
            metadata: {
              tags, corpus: true,
              ...(rightsEvidence === undefined ? {} : { rightsEvidence }),
            },
          });
          artifactIds.set(artifact.externalId, created.id);
          await registerImport(tx, {
            sourceId: input.sourceId,
            externalId: artifactKey,
            sourceVersion: input.sourceVersion,
            canonicalType: "artifact",
            canonicalId: created.id,
            metadata: { fingerprint: artifactPrint },
          });
        } else {
          artifactIds.set(artifact.externalId, reuseOrConflict(knownArtifact, artifactPrint, "artifact replay"));
        }
        summary.artifacts += 1;
      }
      for (const flow of version.flows) {
        const flowKey = `flow:${product.externalId}:${version.versionNo}:${flow.externalId}`;
        const flowPrint = fingerprint({
          title: flow.title,
          steps: flow.steps.map((step) => ({
            artifact: step.artifactExternalId,
            position: step.position,
            interaction: step.interaction ?? null,
          })),
        });
        const knownFlow = await findLedgerEntry(tx, input.sourceId, flowKey, input.sourceVersion);
        if (knownFlow === null) {
          summary.replayed = false;
          const created = await createFlow(tx, {
            sourceId: input.sourceId,
            productVersionId: versionId,
            title: flow.title,
            metadata: { corpus: true },
          });
          const ordered = [...flow.steps].sort((a, b) => a.position - b.position);
          for (const step of ordered) {
            await addFlowStep(tx, {
              flowId: created.id,
              position: step.position,
              artifactId: artifactIds.get(step.artifactExternalId) as string,
              ...(step.interaction === undefined ? {} : { interaction: step.interaction }),
            });
          }
          await registerImport(tx, {
            sourceId: input.sourceId,
            externalId: flowKey,
            sourceVersion: input.sourceVersion,
            canonicalType: "flow",
            canonicalId: created.id,
            metadata: { fingerprint: flowPrint },
          });
        } else {
          reuseOrConflict(knownFlow, flowPrint, "flow replay");
        }
        summary.flows += 1;
        summary.steps += flow.steps.length;
      }
    }
  }
  return summary;
}

/** Curator-only admission path for externally sourced product/design data.
 * Require the rights/provenance record on every artifact before the existing
 * idempotent transactional importer can write any rows. This does not fetch,
 * crawl, or independently verify external web sites or legal permissions.
 */
export async function importQualifiedResearchCorpus(
  tx: DbTransaction,
  input: { sourceId: string; sourceVersion: string; corpus: unknown },
): Promise<CorpusImportSummary> {
  validateQualifiedCorpusInput(input.corpus);
  return importCorpusFixture(tx, input);
}

export interface CorpusFlowEntry {
  flowId: string;
  productVersionId: string;
  title: string;
  stepCount: number;
}

export interface CorpusFlowList {
  flows: CorpusFlowEntry[];
  total: number;
  truncated: boolean;
}

/**
 * Actor-scoped flow listing. A flow is visible only when every step
 * artifact is readable by the actor; flows checked against the budget
 * report truncated=true with a partial envelope instead of silently
 * dropping candidates.
 */
export async function listFlowsForActor(
  tx: DbTransaction,
  input: { actorId: string; productVersionId?: string | undefined; limit?: number | undefined; offset?: number | undefined },
): Promise<CorpusFlowList> {
  if (typeof input.actorId !== "string" || input.actorId.length === 0) {
    fail("corpus/invalid-input", "Actor is invalid.");
  }
  if (input.productVersionId !== undefined &&
      (typeof input.productVersionId !== "string" || !UUID_PATTERN.test(input.productVersionId))) {
    fail("corpus/invalid-input", "Corpus product version is invalid.");
  }
  const limit = input.limit ?? FLOW_LIST_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > FLOW_LIST_MAX_LIMIT) {
    fail("corpus/invalid-input", "Corpus limit is invalid.");
  }
  const offset = input.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    fail("corpus/invalid-input", "Corpus cursor is invalid.");
  }
  const params: unknown[] = [];
  let where = "";
  if (input.productVersionId !== undefined) {
    params.push(input.productVersionId);
    where = "where f.product_version_id = $1";
  }
  params.push(MAX_FLOWS_EXAMINED + 1);
  const rows = (
    await tx.query(
      `select f.id, f.product_version_id, f.title from flows f ${where} order by f.title, f.id limit $${params.length}`,
      params,
    )
  ).rows as Record<string, unknown>[];
  const truncated = rows.length > MAX_FLOWS_EXAMINED;
  const examined = truncated ? rows.slice(0, MAX_FLOWS_EXAMINED) : rows;
  const visible: CorpusFlowEntry[] = [];
  for (const row of examined) {
    const steps = await listFlowSteps(tx, String(row.id));
    let readable = true;
    for (const step of steps) {
      if ((await getArtifactForActor(tx, step.artifactId, input.actorId)) === null) {
        readable = false;
        break;
      }
    }
    if (readable) {
      visible.push({
        flowId: String(row.id),
        productVersionId: String(row.product_version_id),
        title: String(row.title),
        stepCount: steps.length,
      });
    }
  }
  return { flows: visible.slice(offset, offset + limit), total: visible.length, truncated };
}

export interface CorpusFlowStep {
  position: number;
  artifactId: string;
  kind: string;
  title: string;
  interaction: Record<string, unknown> | null;
}

export interface CorpusFlowDetail {
  flowId: string;
  productVersionId: string;
  title: string;
  steps: CorpusFlowStep[];
}

/**
 * Actor-scoped flow steps. A single unreadable step denies the whole
 * flow as not-found: step existence is never leaked piecemeal.
 */
export async function getFlowStepsForActor(
  tx: DbTransaction,
  input: { flowId: string; actorId: string },
): Promise<CorpusFlowDetail> {
  if (typeof input.flowId !== "string" || !UUID_PATTERN.test(input.flowId)) {
    fail("corpus/invalid-input", "Corpus flow is invalid.");
  }
  if (typeof input.actorId !== "string" || input.actorId.length === 0) {
    fail("corpus/invalid-input", "Actor is invalid.");
  }
  const flow = await tx.query(`select id, product_version_id, title from flows where id = $1`, [input.flowId]);
  const found = flow.rows[0] as Record<string, unknown> | undefined;
  if (found === undefined) fail("corpus/not-found", "Corpus flow was not found.");
  const row: Record<string, unknown> = found;
  const steps = await listFlowSteps(tx, input.flowId);
  const detail: CorpusFlowStep[] = [];
  for (const step of steps) {
    const artifact = await getArtifactForActor(tx, step.artifactId, input.actorId);
    if (artifact === null) fail("corpus/not-found", "Corpus flow was not found.");
    detail.push({
      position: step.position,
      artifactId: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      interaction: isRecord(step.interaction) ? (step.interaction as Record<string, unknown>) : null,
    });
  }
  return {
    flowId: String(row.id),
    productVersionId: String(row.product_version_id),
    title: String(row.title),
    steps: detail,
  };
}
