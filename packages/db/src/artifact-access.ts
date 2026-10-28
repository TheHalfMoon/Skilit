import type { DbTransaction } from "./db.ts";
import { getArtifact, type Artifact } from "./graph.ts";
import { getMembership } from "./workspaces.ts";

/**
 * AF-SEC-00 central actor-scoped artifact gate.
 *
 * Policy (fail-closed, no existence oracle — denied and missing both read
 * as null to callers):
 * - Global `public` artifacts are readable by any authenticated actor.
 *   Workspace-bound `public` artifacts still require workspace membership.
 * - Global registry rows (workspace_id IS NULL with kind icon/logo/font)
 *   are readable by any authenticated actor. This preserves the curated
 *   Iconify/Fontsource-like corpus, whose bytes remain gated separately by
 *   the registry serving policy (rights/license/trademark).
 * - Any other non-public global row is never readable by ID. Such rows are
 *   legacy; new non-public writes require a workspace binding at creation.
 * - Workspace-bound rows require membership in the bound workspace;
 *   `workspace` visibility admits members, `private` additionally requires
 *   owner match, and workspace-bound `public` rows admit members (global
 *   anonymous reads of workspace public rows are not granted — membership
 *   is still required so workspace context cannot be laundered).
 *
 * Treat exposure of a title or rights label as a privacy breach, even when
 * bytes are not served: callers must use this gate (or a query embedding
 * the same predicate) for every artifact metadata path, including search,
 * caches, previews, collections, packs, and MCP/REST tools.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GLOBAL_REGISTRY_KINDS: ReadonlySet<string> = new Set(["icon", "logo", "font"]);

export async function getArtifactForActor(
  tx: DbTransaction,
  artifactId: string,
  actorId: string,
): Promise<Artifact | null> {
  if (typeof artifactId !== "string" || !UUID_PATTERN.test(artifactId)) return null;
  if (typeof actorId !== "string" || !UUID_PATTERN.test(actorId)) return null;
  const artifact = await getArtifact(tx, artifactId);
  if (artifact === null) return null;
  if (artifact.workspaceId === undefined) {
    // Only truly global public records or curated global registry kinds
    // bypass workspace membership. A workspace-bound public label must
    // never short-circuit this gate.
    if (artifact.visibility === "public" || GLOBAL_REGISTRY_KINDS.has(artifact.kind)) {
      return artifact;
    }
    return null;
  }
  const role = await getMembership(tx, artifact.workspaceId, actorId);
  if (role === null) return null;
  if (artifact.visibility === "workspace" || artifact.visibility === "public") return artifact;
  if (artifact.visibility === "private" && artifact.ownerSubject === actorId) {
    return artifact;
  }
  return null;
}
