import type { DbClient, DbTransaction } from "./db.ts";
import { AuthError, isUniqueViolation } from "./auth.ts";

/**
 * G04-02 workspace authority: workspace creation with atomic owner
 * membership, member role management, and server-side authorization checks.
 *
 * Roles form a strict hierarchy: owner > admin > member. Every denial —
 * non-member, insufficient role, forged or nonexistent workspace — fails
 * closed with one generic code so membership and existence are not oracles.
 * Multi-statement mutations run inside explicit transactions so a crash
 * never leaves a workspace without its owner or a half-applied roster.
 *
 * Layering notes: callers pass server-resolved identities (the authenticated
 * subject as actorId/ownerId); this module never accepts a client workspace
 * claim as authority. User deletion cascades memberships and nulls
 * created_by by schema design; a dedicated user-management grain owns
 * succession for that path.
 */

export type WorkspaceRole = "owner" | "admin" | "member";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

const ACCESS_DENIED = "Access denied.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export interface Workspace {
  id: string;
  name: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
}

/**
 * One roster line: a membership with the address behind it. The address
 * is what an operator manages a workspace by, so the roster carries it:
 * a roster of identifiers is not a roster of people.
 */
export interface RosterEntry {
  workspaceId: string;
  userId: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
}

/** The longest a workspace name may be. */
export const WORKSPACE_NAME_MAX_LENGTH = 200;

function toIsoTimestamp(raw: unknown): string {
  const value = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid workspace timestamp");
  }
  return value.toISOString();
}

function toWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: String(row.id),
    name: String(row.name),
    createdBy: row.created_by === null ? null : String(row.created_by),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

function toMembership(row: Record<string, unknown>): Membership {
  const role = String(row.role);
  if (role !== "owner" && role !== "admin" && role !== "member") {
    throw new Error("Invalid workspace role in database");
  }
  return {
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    role,
    joinedAt: toIsoTimestamp(row.joined_at),
  };
}

function requireRow(rows: Record<string, unknown>[]): Record<string, unknown> {
  const row = rows[0];
  if (!row) throw new Error("Database operation returned no row");
  return row;
}

function validateWorkspaceName(name: string): string {
  if (typeof name !== "string" || name.length > WORKSPACE_NAME_MAX_LENGTH) {
    throw new AuthError("auth/invalid-workspace", "Workspace name is invalid.");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > WORKSPACE_NAME_MAX_LENGTH) {
    throw new AuthError("auth/invalid-workspace", "Workspace name is invalid.");
  }
  return trimmed;
}

function validateRole(role: string): WorkspaceRole {
  if (role !== "owner" && role !== "admin" && role !== "member") {
    throw new AuthError("auth/invalid-role", "Workspace role is invalid.");
  }
  return role;
}

/**
 * One generic denial for every access failure, so a caller cannot tell a
 * missing resource from a forbidden one. Shared with the invitation flow.
 */
export function workspaceForbidden(): AuthError {
  return new AuthError("auth/forbidden", ACCESS_DENIED);
}

/**
 * Create a workspace with its owner membership atomically. Unknown owners
 * and invalid names fail closed with no partial rows.
 */
export async function createWorkspace(
  client: DbClient,
  input: { name: string; ownerId: string },
): Promise<{ workspace: Workspace; membership: Membership }> {
  return client.transaction(async (tx) => createWorkspaceTx(tx, input));
}

/**
 * Transaction-scoped workspace creation for callers that already hold a
 * transaction (e.g. bootstrap flows that must commit the user, workspace,
 * and session atomically). Identical semantics to `createWorkspace`.
 */
export async function createWorkspaceTx(
  tx: DbTransaction,
  input: { name: string; ownerId: string },
): Promise<{ workspace: Workspace; membership: Membership }> {
  const name = validateWorkspaceName(input.name);
  if (!isUuid(input.ownerId)) {
    throw new AuthError("auth/user-not-found", "User was not found.");
  }
  const owner = await tx.query("select id from users where id = $1", [
    input.ownerId,
  ]);
  if (owner.rows.length === 0) {
    throw new AuthError("auth/user-not-found", "User was not found.");
  }
  const created = await tx.query(
    `insert into workspaces (name, created_by)
     values ($1, $2) returning id, name, created_by, created_at, updated_at`,
    [name, input.ownerId],
  );
  const workspace = toWorkspace(requireRow(created.rows));
  const member = await tx.query(
    `insert into workspace_members (workspace_id, user_id, role)
     values ($1, $2, 'owner')
     returning workspace_id, user_id, role, joined_at`,
    [workspace.id, input.ownerId],
  );
  return { workspace, membership: toMembership(requireRow(member.rows)) };
}

/** Membership role, or null when the user is not a member. Unknown or malformed identifiers read as null: no oracle. */
export async function getMembership(
  tx: DbTransaction,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  if (!isUuid(workspaceId) || !isUuid(userId)) return null;
  const result = await tx.query(
    `select role from workspace_members where workspace_id = $1 and user_id = $2`,
    [workspaceId, userId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  const role = String(row.role);
  if (role !== "owner" && role !== "admin" && role !== "member") {
    throw new Error("Invalid workspace role in database");
  }
  return role;
}

/** Require at least the given role; every denial is one generic error. */
export async function requireRole(
  tx: DbTransaction,
  workspaceId: string,
  userId: string,
  minimum: WorkspaceRole,
): Promise<WorkspaceRole> {
  const role = await getMembership(tx, workspaceId, userId);
  if (role === null || ROLE_RANK[role] < ROLE_RANK[minimum]) {
    throw workspaceForbidden();
  }
  return role;
}

async function countOwners(tx: DbTransaction, workspaceId: string): Promise<number> {
  const result = await tx.query(
    `select count(*)::int as n from workspace_members
     where workspace_id = $1 and role = 'owner'`,
    [workspaceId],
  );
  return Number(requireRow(result.rows).n);
}

/**
 * Serialize roster mutations for one workspace so concurrent
 * remove/demote pairs cannot both observe two owners and orphan authority.
 */
async function lockRoster(tx: DbTransaction, workspaceId: string): Promise<void> {
  await tx.query(
    "select 1 from workspace_members where workspace_id = $1 for update",
    [workspaceId],
  );
}

/**
 * Whether an actor holding `actorRole` may grant `role`. Owners may grant
 * any role; admins may grant member only. Shared with the invitation
 * flow, which grants exactly the roles an operator could add directly.
 */
export function canGrantRole(actorRole: WorkspaceRole, role: WorkspaceRole): boolean {
  if (actorRole === "owner") return true;
  return actorRole === "admin" && role === "member";
}

/**
 * Add a member. Owners may grant any role; admins may grant member only.
 * Runs atomically; re-adding an existing member fails closed.
 */
export async function addMember(
  client: DbClient,
  input: { workspaceId: string; userId: string; role: WorkspaceRole; actorId: string },
): Promise<Membership> {
  const role = validateRole(input.role);
  return client.transaction(async (tx) => {
    const actorRole = await getMembership(tx, input.workspaceId, input.actorId);
    if (actorRole === null || !canGrantRole(actorRole, role)) {
      throw workspaceForbidden();
    }
    if (!isUuid(input.userId)) {
      throw new AuthError("auth/user-not-found", "User was not found.");
    }
    const target = await tx.query("select id from users where id = $1", [
      input.userId,
    ]);
    if (target.rows.length === 0) {
      throw new AuthError("auth/user-not-found", "User was not found.");
    }
    try {
      const added = await tx.query(
        `insert into workspace_members (workspace_id, user_id, role)
         values ($1, $2, $3)
         returning workspace_id, user_id, role, joined_at`,
        [input.workspaceId, input.userId, role],
      );
      return toMembership(requireRow(added.rows));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthError("auth/member-exists", "User is already a member.");
      }
      throw error;
    }
  });
}

/**
 * Change a member's role. Owner-only; demoting the final owner fails closed.
 */
export async function setMemberRole(
  client: DbClient,
  input: { workspaceId: string; userId: string; role: WorkspaceRole; actorId: string },
): Promise<Membership> {
  const role = validateRole(input.role);
  return client.transaction(async (tx) => {
    const actorRole = await getMembership(tx, input.workspaceId, input.actorId);
    if (actorRole !== "owner") {
      throw workspaceForbidden();
    }
    if (role !== "owner") {
      const current = await getMembership(tx, input.workspaceId, input.userId);
      if (current === "owner") {
        await lockRoster(tx, input.workspaceId);
        if ((await countOwners(tx, input.workspaceId)) <= 1) {
          throw new AuthError("auth/last-owner", "A workspace must keep one owner.");
        }
      }
    }
    const updated = await tx.query(
      `update workspace_members set role = $3
       where workspace_id = $1 and user_id = $2
       returning workspace_id, user_id, role, joined_at`,
      [input.workspaceId, input.userId, role],
    );
    const row = updated.rows[0];
    if (row === undefined) {
      throw new AuthError("auth/member-not-found", "Membership was not found.");
    }
    return toMembership(row);
  });
}

/**
 * Remove a member. Leaving (self-removal) is always allowed except for the
 * final owner; otherwise owners may remove anyone and admins may remove
 * members only. Removing a non-member succeeds (idempotent).
 */
export async function removeMember(
  client: DbClient,
  input: { workspaceId: string; userId: string; actorId: string },
): Promise<void> {
  await client.transaction(async (tx) => {
    const actorRole = await getMembership(tx, input.workspaceId, input.actorId);
    if (actorRole === null) {
      throw workspaceForbidden();
    }
    const targetRole = await getMembership(tx, input.workspaceId, input.userId);
    if (targetRole === null) return;
    const selfRemoval = input.userId === input.actorId;
    if (!selfRemoval && actorRole === "member") {
      throw workspaceForbidden();
    }
    if (!selfRemoval && actorRole === "admin" && targetRole !== "member") {
      throw workspaceForbidden();
    }
    if (targetRole === "owner") {
      await lockRoster(tx, input.workspaceId);
      if ((await countOwners(tx, input.workspaceId)) <= 1) {
        throw new AuthError("auth/last-owner", "A workspace must keep one owner.");
      }
    }
    await tx.query(
      `delete from workspace_members where workspace_id = $1 and user_id = $2`,
      [input.workspaceId, input.userId],
    );
  });
}

/**
 * The roster of one workspace. Any membership grants read, non-members are
 * denied. Every line carries the address behind the membership.
 */
export async function listMembers(
  tx: DbTransaction,
  workspaceId: string,
  callerId: string,
): Promise<RosterEntry[]> {
  const role = await getMembership(tx, workspaceId, callerId);
  if (role === null) {
    throw workspaceForbidden();
  }
  const result = await tx.query(
    `select m.workspace_id, m.user_id, u.email, m.role, m.joined_at
     from workspace_members m join users u on u.id = m.user_id
     where m.workspace_id = $1 order by m.joined_at, m.user_id`,
    [workspaceId],
  );
  return result.rows.map((row) => ({
    workspaceId: String(row.workspace_id),
    userId: String(row.user_id),
    email: String(row.email),
    role: String(row.role) as WorkspaceRole,
    joinedAt: toIsoTimestamp(row.joined_at),
  }));
}

/**
 * List workspaces the user belongs to. Callers must pass the authenticated
 * subject; this function never trusts a workspace claim, only the roster.
 * Malformed identifiers read as an empty list: no oracle.
 */
export async function listWorkspacesForUser(
  tx: DbTransaction,
  userId: string,
): Promise<Workspace[]> {
  if (!isUuid(userId)) return [];
  const result = await tx.query(
    `select w.id, w.name, w.created_by, w.created_at, w.updated_at
     from workspaces w join workspace_members m on m.workspace_id = w.id
     where m.user_id = $1 order by w.created_at, w.id`,
    [userId],
  );
  return result.rows.map(toWorkspace);
}
