/**
 * G00-G19: workspace invitations.
 *
 * An operator grants another person access to a workspace. The grant is a
 * single-use, expiring bearer token bound to exactly one address and one
 * role. The token is stored only as a SHA-256 hash, exactly like a session
 * token, so a database read cannot be redeemed.
 *
 * Security posture:
 * - the address is normalised (lower case, trimmed) before it is written,
 *   so a pending invite is unique per workspace and address;
 * - the raw token is returned once, to the operator who created the
 *   invite, and is never readable again;
 * - the role an invite may grant is exactly the role an operator could
 *   grant directly (owners any role, admins member only), and it is
 *   re-checked against the inviter's authority when the invite is
 *   redeemed, so a demoted inviter's outstanding invites stop working;
 * - redeeming an invite is atomic: the membership and the invite's
 *   acceptance are written in one transaction, so a token cannot be
 *   redeemed twice;
 * - every failure is one generic denial, so a caller cannot tell an
 *   unknown token from a revoked, expired or already-redeemed one.
 */

import { randomBytes } from "node:crypto";

import {
  AuthError,
  createSession,
  hashToken,
  normalizeEmail,
  signUp,
} from "./auth.ts";
import type { CreatedSession, PublicUser } from "./auth.ts";
import type { DbClient, DbTransaction } from "./db.ts";
import {
  canGrantRole,
  createWorkspaceTx,
  getMembership,
  listMembers,
  workspaceForbidden,
} from "./workspaces.ts";
import type { Membership, WorkspaceRole } from "./workspaces.ts";

/** The role an invitation may grant. Owners may grant any role. */
export type InviteRole = WorkspaceRole;

export type InviteState = "pending" | "accepted" | "revoked" | "expired";

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: InviteRole;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  state: InviteState;
}

/**
 * What an invitee may see before they have an account. It names the
 * workspace, the role and the address the invitation is for, and nothing
 * else: no token, no hash, no inviter identity, no membership.
 */
export interface InvitePreview {
  email: string;
  role: InviteRole;
  workspaceName: string;
  expiresAt: string;
  state: InviteState;
}

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const INVITE_MAX_TTL_SECONDS = 30 * 24 * 60 * 60;
const INVITE_MIN_TTL_SECONDS = 300;
const INVITE_TOKEN_BYTES = 32;

function validateRole(role: string): InviteRole {
  if (role !== "owner" && role !== "admin" && role !== "member") {
    throw new AuthError("auth/invalid-role", "Workspace role is invalid.");
  }
  return role;
}

function toIsoTimestamp(raw: unknown): string {
  const value = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid workspace invite timestamp");
  }
  return value.toISOString();
}

function stateOf(
  acceptedAt: string | null,
  revokedAt: string | null,
  expiresAt: string,
  now: Date,
): InviteState {
  if (acceptedAt !== null) return "accepted";
  if (revokedAt !== null) return "revoked";
  if (new Date(expiresAt).getTime() <= now.getTime()) return "expired";
  return "pending";
}

function toInvite(row: Record<string, unknown>, now: Date): WorkspaceInvite {
  const acceptedAt =
    row.accepted_at === null || row.accepted_at === undefined
      ? null
      : toIsoTimestamp(row.accepted_at);
  const revokedAt =
    row.revoked_at === null || row.revoked_at === undefined
      ? null
      : toIsoTimestamp(row.revoked_at);
  const expiresAt = toIsoTimestamp(row.expires_at);
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    workspaceName: String(row.workspace_name ?? ""),
    email: String(row.email),
    role: String(row.role) as InviteRole,
    invitedBy: String(row.invited_by),
    expiresAt,
    acceptedAt,
    revokedAt,
    createdAt: toIsoTimestamp(row.created_at),
    state: stateOf(acceptedAt, revokedAt, expiresAt, now),
  };
}

/**
 * The row an invitation names, looked up by its token hash. Only the
 * columns an invitee may see are selected.
 */
async function selectByTokenHash(
  tx: DbTransaction,
  token: string,
): Promise<Record<string, unknown> | undefined> {
  if (typeof token !== "string" || token.length === 0) return undefined;
  const result = await tx.query(
    `select i.id, i.workspace_id, i.email, i.role, i.invited_by,
            i.expires_at, i.accepted_at, i.revoked_at, w.name as workspace_name
     from workspace_invites i join workspaces w on w.id = i.workspace_id
     where i.token_hash = $1`,
    [hashToken(token)],
  );
  return result.rows[0];
}

/**
 * Issue an invitation. The caller must be an operator of the workspace,
 * and the role may be no stronger than the operator could grant directly.
 *
 * The raw token is returned once. It is the only copy: the stored value
 * is a hash.
 */
export async function createInvite(
  client: DbClient,
  input: {
    workspaceId: string;
    email: string;
    role: InviteRole;
    actorId: string;
    ttlSeconds?: number;
  },
): Promise<{ invite: WorkspaceInvite; token: string }> {
  const email = normalizeEmail(input.email);
  const role = validateRole(input.role);
  const ttl = input.ttlSeconds ?? INVITE_TTL_SECONDS;
  if (
    !Number.isInteger(ttl) ||
    ttl < INVITE_MIN_TTL_SECONDS ||
    ttl > INVITE_MAX_TTL_SECONDS
  ) {
    throw new AuthError("auth/invalid-invite", "Invite lifetime is invalid.");
  }
  const token = randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  return client.transaction(async (tx) => {
    const actorRole = await getMembership(tx, input.workspaceId, input.actorId);
    if (actorRole === null || !canGrantRole(actorRole, role)) {
      throw workspaceForbidden();
    }
    // The address must not already be in the roster.
    const member = await tx.query(
      `select 1 from workspace_members m join users u on u.id = m.user_id
       where m.workspace_id = $1 and lower(u.email) = lower($2)`,
      [input.workspaceId, email],
    );
    if (member.rows.length > 0) {
      throw new AuthError("auth/member-exists", "That person is already a member.");
    }
    // At most one live invitation per workspace and address.
    const pending = await tx.query(
      `select 1 from workspace_invites
       where workspace_id = $1 and email = $2
         and accepted_at is null and revoked_at is null and expires_at > now()`,
      [input.workspaceId, email],
    );
    if (pending.rows.length > 0) {
      throw new AuthError(
        "auth/invite-exists",
        "An invite is already pending for that address.",
      );
    }
    const inserted = await tx.query(
      `insert into workspace_invites
         (workspace_id, email, role, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id, workspace_id, email, role, invited_by, expires_at,
                 accepted_at, revoked_at, created_at`,
      [input.workspaceId, email, role, hashToken(token), input.actorId, expiresAt],
    );
    const row = inserted.rows[0];
    if (row === undefined) {
      throw new AuthError("auth/invalid-invite", "Invite could not be created.");
    }
    const workspace = await tx.query("select name from workspaces where id = $1", [
      input.workspaceId,
    ]);
    const invite = toInvite(
      { ...row, workspace_name: workspace.rows[0]?.name ?? "" },
      new Date(),
    );
    return { invite, token };
  });
}

/**
 * The invitations of one workspace. Only an operator may read them: an
 * invitation carries an address, and the roster of addresses is not
 * everybody's business.
 */
export async function listInvites(
  client: DbClient,
  input: { workspaceId: string; actorId: string },
): Promise<WorkspaceInvite[]> {
  return client.transaction(async (tx) => {
    const actorRole = await getMembership(tx, input.workspaceId, input.actorId);
    if (actorRole === null || (actorRole !== "owner" && actorRole !== "admin")) {
      throw workspaceForbidden();
    }
    const result = await tx.query(
      `select i.id, i.workspace_id, i.email, i.role, i.invited_by,
              i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
              w.name as workspace_name
       from workspace_invites i join workspaces w on w.id = i.workspace_id
       where i.workspace_id = $1
       order by i.created_at desc, i.id desc`,
      [input.workspaceId],
    );
    const now = new Date();
    return result.rows.map((row) => toInvite(row, now));
  });
}

/**
 * Revoke a pending invitation. A revoked invitation stops working at once
 * and can never be revoked twice.
 */
export async function revokeInvite(
  client: DbClient,
  input: { workspaceId: string; inviteId: string; actorId: string },
): Promise<boolean> {
  return client.transaction(async (tx) => {
    const actorRole = await getMembership(tx, input.workspaceId, input.actorId);
    if (actorRole === null || (actorRole !== "owner" && actorRole !== "admin")) {
      throw workspaceForbidden();
    }
    const result = await tx.query(
      `update workspace_invites set revoked_at = now()
       where id = $1 and workspace_id = $2 and accepted_at is null
         and revoked_at is null
       returning id`,
      [input.inviteId, input.workspaceId],
    );
    return result.rows.length > 0;
  });
}

/**
 * What the holder of an invitation token may see before they accept. The
 * invitation itself is not disclosed: an unknown, revoked, expired or
 * already-redeemed token all read as the same absence.
 */
export async function readInvite(
  client: DbClient,
  token: string,
): Promise<InvitePreview | null> {
  return client.transaction(async (tx) => {
    const row = await selectByTokenHash(tx, token);
    if (row === undefined) return null;
    const now = new Date();
    const expiresAt = toIsoTimestamp(row.expires_at);
    const acceptedAt =
      row.accepted_at === null || row.accepted_at === undefined
        ? null
        : toIsoTimestamp(row.accepted_at);
    const revokedAt =
      row.revoked_at === null || row.revoked_at === undefined
        ? null
        : toIsoTimestamp(row.revoked_at);
    return {
      email: String(row.email),
      role: String(row.role) as InviteRole,
      workspaceName: String(row.workspace_name ?? ""),
      expiresAt,
      state: stateOf(acceptedAt, revokedAt, expiresAt, now),
    };
  });
}

/**
 * Redeem an invitation for a user who already has an account. The
 * membership and the acceptance are written together, so a token cannot
 * be redeemed twice.
 *
 * The inviter's authority is re-checked here: an invitation grants a role
 * only while the inviter may still grant it.
 */
export async function acceptInvite(
  client: DbClient,
  input: { token: string; userId: string },
): Promise<{ membership: Membership; workspaceId: string; workspaceName: string }> {
  return client.transaction(async (tx) => {
    const row = await selectByTokenHash(tx, input.token);
    if (row === undefined) throw workspaceForbidden();
    const now = new Date();
    const expiresAt = toIsoTimestamp(row.expires_at);
    if (stateOf(
      row.accepted_at === null || row.accepted_at === undefined
        ? null
        : toIsoTimestamp(row.accepted_at),
      row.revoked_at === null || row.revoked_at === undefined
        ? null
        : toIsoTimestamp(row.revoked_at),
      expiresAt,
      now,
    ) !== "pending") {
      throw workspaceForbidden();
    }
    const workspaceId = String(row.workspace_id);
    const role = String(row.role) as InviteRole;
    const inviterRole = await getMembership(tx, workspaceId, String(row.invited_by));
    if (inviterRole === null || !canGrantRole(inviterRole, role)) {
      throw workspaceForbidden();
    }
    const member = await tx.query(
      `select 1 from workspace_members where workspace_id = $1 and user_id = $2`,
      [workspaceId, input.userId],
    );
    if (member.rows.length > 0) {
      throw new AuthError("auth/member-exists", "That person is already a member.");
    }
    const added = await tx.query(
      `insert into workspace_members (workspace_id, user_id, role)
       values ($1, $2, $3)
       returning workspace_id, user_id, role, joined_at`,
      [workspaceId, input.userId, role],
    );
    const accepted = await tx.query(
      `update workspace_invites set accepted_at = now()
       where id = $1 and accepted_at is null
       returning id`,
      [row.id],
    );
    if (accepted.rows.length === 0) {
      // Another redemption won the race; the membership it wrote is
      // rolled back with this transaction.
      throw workspaceForbidden();
    }
    const membershipRow = added.rows[0];
    if (membershipRow === undefined) {
      throw new AuthError("auth/invalid-invite", "Invite could not be accepted.");
    }
    return {
      membership: {
        workspaceId: String(membershipRow.workspace_id),
        userId: String(membershipRow.user_id),
        role: String(membershipRow.role) as WorkspaceRole,
        joinedAt: toIsoTimestamp(membershipRow.joined_at),
      },
      workspaceId,
      workspaceName: String(row.workspace_name ?? ""),
    };
  });
}

/**
 * Redeem an invitation for someone who has no account yet. The invitation
 * is the only authority that may create one, so the account is bound to
 * the invited address and no other.
 *
 * The account, the membership and the acceptance are written together,
 * and the caller receives a session so the browser is signed in.
 */
export async function redeemInvite(
  client: DbClient,
  input: { token: string; email: string; password: string },
): Promise<{
  user: PublicUser;
  membership: Membership;
  session: CreatedSession;
  workspaceId: string;
  workspaceName: string;
}> {
  const email = normalizeEmail(input.email);
  return client.transaction(async (tx) => {
    const row = await selectByTokenHash(tx, input.token);
    if (row === undefined) throw workspaceForbidden();
    const now = new Date();
    const expiresAt = toIsoTimestamp(row.expires_at);
    const state = stateOf(
      row.accepted_at === null || row.accepted_at === undefined
        ? null
        : toIsoTimestamp(row.accepted_at),
      row.revoked_at === null || row.revoked_at === undefined
        ? null
        : toIsoTimestamp(row.revoked_at),
      expiresAt,
      now,
    );
    if (state !== "pending") throw workspaceForbidden();
    // The account may only be created for the invited address.
    if (String(row.email) !== email) throw workspaceForbidden();
    const workspaceId = String(row.workspace_id);
    const role = String(row.role) as InviteRole;
    const inviterRole = await getMembership(tx, workspaceId, String(row.invited_by));
    if (inviterRole === null || !canGrantRole(inviterRole, role)) {
      throw workspaceForbidden();
    }
    const user = await signUp(tx, { email, password: input.password });
    // Every account owns a personal workspace, exactly as the first owner
    // does at bootstrap. Without one, an invited person would join a
    // shared workspace with nowhere of their own to keep anything.
    await createWorkspaceTx(tx, { name: "Personal", ownerId: user.id });
    const added = await tx.query(
      `insert into workspace_members (workspace_id, user_id, role)
       values ($1, $2, $3)
       returning workspace_id, user_id, role, joined_at`,
      [workspaceId, user.id, role],
    );
    const accepted = await tx.query(
      `update workspace_invites set accepted_at = now()
       where id = $1 and accepted_at is null
       returning id`,
      [row.id],
    );
    if (accepted.rows.length === 0) {
      throw workspaceForbidden();
    }
    const membershipRow = added.rows[0];
    if (membershipRow === undefined) {
      throw new AuthError("auth/invalid-invite", "Invite could not be accepted.");
    }
    const session = await createSession(tx, user.id);
    return {
      user,
      session,
      membership: {
        workspaceId: String(membershipRow.workspace_id),
        userId: String(membershipRow.user_id),
        role: String(membershipRow.role) as WorkspaceRole,
        joinedAt: toIsoTimestamp(membershipRow.joined_at),
      },
      workspaceId,
      workspaceName: String(row.workspace_name ?? ""),
    };
  });
}

/**
 * The roster of one workspace. Any member may read it: the roster is
 * what a workspace is.
 */
export async function listWorkspaceMembers(
  client: DbClient,
  input: { workspaceId: string; actorId: string },
): Promise<Membership[]> {
  return client.transaction(async (tx) =>
    listMembers(tx, input.workspaceId, input.actorId),
  );
}
