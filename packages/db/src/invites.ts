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
 * - an invitation is bound to the address it names, on both redemption
 *   paths: a signed-in stranger who holds the link is refused, and an
 *   account may only be created for the invited address;
 * - redeeming an invite takes a row lock on the invitation, so a
 *   revocation that is in flight cannot race a redemption into a row that
 *   is both accepted and revoked;
 * - the acceptance itself is a guarded write: it lands only while the
 *   invitation is still pending, un-revoked and un-expired, and the
 *   membership is written in the same transaction, so a token cannot be
 *   redeemed twice;
 * - the database clock is the only clock: expiry and state are computed
 *   by the database, never by the application, so an application clock
 *   skew cannot make a dead invitation look live;
 * - every access failure is one generic denial, so a caller cannot tell
 *   an unknown token from a revoked, expired or already-redeemed one.
 *
 * Two disclosures are bounded and deliberate. A token that names a real
 * invitation is disclosed together with that invitation's state, so the
 * holder can be told that it is no longer spendable; an unknown token is
 * an absence. And a registration that is refused is refused without
 * naming the address, so the refusal does not say whether that address
 * holds an account — the answer is the way forward, not the reason.
 */

import { randomBytes } from "node:crypto";

import {
  AuthError,
  createSession,
  hashToken,
  isUniqueViolation,
  normalizeEmail,
  signUp,
} from "./auth.ts";
import type { CreatedSession, PublicUser } from "./auth.ts";
import type { DbClient, DbTransaction } from "./db.ts";
import {
  canGrantRole,
  createWorkspaceTx,
  getMembership,
  isUuid,
  workspaceForbidden,
  WORKSPACE_NAME_MAX_LENGTH,
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

/**
 * One roster line: a membership with the address behind it. The address
 * is what an operator manages a workspace by, so the roster has to carry
 * it; a bare user id is not a person.
 *
 * The roster query itself lives with the other roster query, in
 * `workspaces.ts`.
 */

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const INVITE_MAX_TTL_SECONDS = 30 * 24 * 60 * 60;
const INVITE_MIN_TTL_SECONDS = 300;
const INVITE_TOKEN_BYTES = 32;
/**
 * The personal workspace of an invited person. It carries the account's
 * address because an invited person sees two workspaces at once — their
 * own and the one they were invited to — and a fixed name would make the
 * two indistinguishable whenever the shared workspace happens to be
 * named "Personal", which is exactly what a fresh installation's only
 * workspace is called.
 */
const PERSONAL_WORKSPACE_PREFIX = "Personal (";

/**
 * The state of an invitation, computed by the database so the only clock
 * in the decision is the database clock. Expiry is checked before
 * revocation: an invitation that died of old age stays "expired" even
 * after a housekeeping sweep marks it revoked.
 *
 * The expiry is compared against `clock_timestamp()`, not `now()`:
 * `now()` is the transaction's start time, so a redemption that waited
 * on the invitation's row lock would be judged against the moment it
 * began rather than the moment it decided.
 */
const INVITE_STATE_EXPRESSION = `case
        when i.accepted_at is not null then 'accepted'
        when i.expires_at <= clock_timestamp() then 'expired'
        when i.revoked_at is not null then 'revoked'
        else 'pending'
      end`;

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

function toState(raw: unknown): InviteState {
  const state = String(raw);
  if (
    state !== "pending" &&
    state !== "accepted" &&
    state !== "revoked" &&
    state !== "expired"
  ) {
    throw new Error("Invalid workspace invite state in database");
  }
  return state;
}

function toInvite(row: Record<string, unknown>): WorkspaceInvite {
  const acceptedAt =
    row.accepted_at === null || row.accepted_at === undefined
      ? null
      : toIsoTimestamp(row.accepted_at);
  const revokedAt =
    row.revoked_at === null || row.revoked_at === undefined
      ? null
      : toIsoTimestamp(row.revoked_at);
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    workspaceName: String(row.workspace_name ?? ""),
    email: String(row.email),
    role: String(row.role) as InviteRole,
    invitedBy: String(row.invited_by),
    expiresAt: toIsoTimestamp(row.expires_at),
    acceptedAt,
    revokedAt,
    createdAt: toIsoTimestamp(row.created_at),
    state: toState(row.state),
  };
}

/**
 * The row an invitation names, looked up by its token hash. Only the
 * columns an invitee may see are selected.
 *
 * When `lock` is set the invitation row is locked for the rest of the
 * transaction, so a concurrent revocation cannot interleave with a
 * redemption and leave a row that is both accepted and revoked.
 */
async function selectByTokenHash(
  tx: DbTransaction,
  token: string,
  lock: boolean,
): Promise<Record<string, unknown> | undefined> {
  if (typeof token !== "string" || token.length === 0) return undefined;
  const result = await tx.query(
    `select i.id, i.workspace_id, i.email, i.role, i.invited_by,
            i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
            w.name as workspace_name, ${INVITE_STATE_EXPRESSION} as state
     from workspace_invites i join workspaces w on w.id = i.workspace_id
     where i.token_hash = $1${lock ? " for update of i" : ""}`,
    [hashToken(token)],
  );
  return result.rows[0];
}

/**
 * The guarded acceptance. It lands only while the invitation is still
 * pending, un-revoked and un-expired, and the database clock decides.
 * Zero rows returned means the invitation was no longer spendable.
 */
async function acceptGuarded(
  tx: DbTransaction,
  inviteId: string,
): Promise<boolean> {
  const accepted = await tx.query(
    `update workspace_invites set accepted_at = now()
     where id = $1 and accepted_at is null and revoked_at is null
       and expires_at > clock_timestamp()
     returning id`,
    [inviteId],
  );
  return accepted.rows.length > 0;
}

/**
 * The personal workspace name of an account, bounded to the workspace
 * name limit so an over-long address cannot fail the redemption.
 */
export function personalWorkspaceName(email: string): string {
  const room = WORKSPACE_NAME_MAX_LENGTH - PERSONAL_WORKSPACE_PREFIX.length - 1;
  return `${PERSONAL_WORKSPACE_PREFIX}${email.slice(0, room)})`;
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
  return client.transaction(async (tx) => {
    // A malformed identifier is a denial, not a database error: the
    // same rule the membership check follows.
    if (!isUuid(input.workspaceId) || !isUuid(input.actorId)) {
      throw workspaceForbidden();
    }
    // The workspace row is locked for the rest of the transaction, so the
    // "at most one live invitation per address" check below is decided
    // against a workspace that no concurrent invitation can change
    // underneath it. The lock carries the name, so the workspace is
    // read once.
    const locked = await tx.query(
      "select id, name from workspaces where id = $1 for update",
      [input.workspaceId],
    );
    const workspaceRow = locked.rows[0];
    if (workspaceRow === undefined) throw workspaceForbidden();
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
    // Housekeeping: an expired invitation is swept to revoked so the
    // same address can be invited again. The state stays "expired",
    // because expiry is checked before revocation.
    await tx.query(
      `update workspace_invites set revoked_at = now()
       where workspace_id = $1 and email = $2
         and accepted_at is null and revoked_at is null
         and expires_at <= clock_timestamp()`,
      [input.workspaceId, email],
    );
    // At most one live invitation per workspace and address.
    const pending = await tx.query(
      `select 1 from workspace_invites
       where workspace_id = $1 and email = $2
         and accepted_at is null and revoked_at is null
         and expires_at > clock_timestamp()`,
      [input.workspaceId, email],
    );
    if (pending.rows.length > 0) {
      throw new AuthError(
        "auth/invite-exists",
        "An invite is already pending for that address.",
      );
    }
    // The expiry is computed by the database clock, so the invitation is
    // never measured against a different clock than the one that decides
    // whether it is still live.
    let inserted;
    try {
      inserted = await tx.query(
        `insert into workspace_invites as i
           (workspace_id, email, role, token_hash, invited_by, expires_at)
         values ($1, $2, $3, $4, $5, clock_timestamp() + ($6::int * interval '1 second'))
         returning i.id, i.workspace_id, i.email, i.role, i.invited_by, i.expires_at,
                   i.accepted_at, i.revoked_at, i.created_at,
                   ${INVITE_STATE_EXPRESSION} as state`,
        [input.workspaceId, email, role, hashToken(token), input.actorId, ttl],
      );
    } catch (error) {
      // The database refuses a second live invitation for the same
      // workspace and address, so a pair of concurrent issuances cannot
      // both get one.
      if (isUniqueViolation(error)) {
        throw new AuthError(
          "auth/invite-exists",
          "An invite is already pending for that address.",
        );
      }
      throw error;
    }
    const row = inserted.rows[0];
    if (row === undefined) {
      throw new AuthError("auth/invalid-invite", "Invite could not be created.");
    }
    const invite = toInvite({
      ...row,
      workspace_name: workspaceRow.name ?? "",
    });
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
              w.name as workspace_name, ${INVITE_STATE_EXPRESSION} as state
       from workspace_invites i join workspaces w on w.id = i.workspace_id
       where i.workspace_id = $1
       order by i.created_at desc, i.id desc`,
      [input.workspaceId],
    );
    return result.rows.map(toInvite);
  });
}

/**
 * Revoke a live invitation. A revoked invitation stops working at once
 * and can never be revoked twice. An expired invitation is already
 * terminal: revoking it would only relabel it, so it is refused.
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
         and revoked_at is null and expires_at > clock_timestamp()
       returning id`,
      [input.inviteId, input.workspaceId],
    );
    return result.rows.length > 0;
  });
}

/**
 * What the holder of an invitation token may see before they accept. An
 * unknown token is an absence; a token that names a real invitation is
 * disclosed together with the invitation's state, so the holder is told
 * whether it is still spendable.
 */
export async function readInvite(
  client: DbClient,
  token: string,
): Promise<InvitePreview | null> {
  return client.transaction(async (tx) => {
    const row = await selectByTokenHash(tx, token, false);
    if (row === undefined) return null;
    return {
      email: String(row.email),
      role: String(row.role) as InviteRole,
      workspaceName: String(row.workspace_name ?? ""),
      expiresAt: toIsoTimestamp(row.expires_at),
      state: toState(row.state),
    };
  });
}

/**
 * Redeem an invitation for a user who already has an account. The
 * membership and the acceptance are written together, so a token cannot
 * be redeemed twice.
 *
 * The inviter's authority is re-checked here: an invitation grants a role
 * only while the inviter may still grant it. The invitation's address is
 * re-checked too: only the invited person may take the seat.
 */
export async function acceptInvite(
  client: DbClient,
  input: { token: string; userId: string },
): Promise<{ membership: Membership; workspaceId: string; workspaceName: string }> {
  return client.transaction(async (tx) => {
    const row = await selectByTokenHash(tx, input.token, true);
    if (row === undefined) throw workspaceForbidden();
    // A malformed identifier is a denial, not a database error.
    if (!isUuid(input.userId)) throw workspaceForbidden();
    const workspaceId = String(row.workspace_id);
    const role = String(row.role) as InviteRole;
    // The invitation is bound to one address: only that address may take
    // the seat. A signed-in stranger who has the link is refused.
    const holder = await tx.query("select email from users where id = $1", [
      input.userId,
    ]);
    const holderEmail = holder.rows[0]?.email;
    if (
      typeof holderEmail !== "string" ||
      holderEmail.trim().toLowerCase() !== String(row.email).trim().toLowerCase()
    ) {
      throw workspaceForbidden();
    }
    const inviterRole = await getMembership(tx, workspaceId, String(row.invited_by));
    if (inviterRole === null || !canGrantRole(inviterRole, role)) {
      throw workspaceForbidden();
    }
    // The guarded acceptance is the only liveness decision, and it comes
    // first: it lands while the invitation is still pending, un-revoked
    // and un-expired. When it does not land, nothing else is attempted,
    // so a spent or withdrawn invitation reads as one generic denial
    // whatever the caller's own state is.
    if (!(await acceptGuarded(tx, String(row.id)))) {
      throw workspaceForbidden();
    }
    const member = await tx.query(
      `select 1 from workspace_members where workspace_id = $1 and user_id = $2`,
      [workspaceId, input.userId],
    );
    if (member.rows.length > 0) {
      throw new AuthError("auth/member-exists", "That person is already a member.");
    }
    let added;
    try {
      added = await tx.query(
        `insert into workspace_members (workspace_id, user_id, role)
         values ($1, $2, $3)
         returning workspace_id, user_id, role, joined_at`,
        [workspaceId, input.userId, role],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthError("auth/member-exists", "That person is already a member.");
      }
      throw error;
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
    const row = await selectByTokenHash(tx, input.token, true);
    if (row === undefined) throw workspaceForbidden();
    // The account may only be created for the invited address.
    if (String(row.email).trim().toLowerCase() !== email) throw workspaceForbidden();
    const workspaceId = String(row.workspace_id);
    const role = String(row.role) as InviteRole;
    const inviterRole = await getMembership(tx, workspaceId, String(row.invited_by));
    if (inviterRole === null || !canGrantRole(inviterRole, role)) {
      throw workspaceForbidden();
    }
    // The guarded acceptance comes before the account is created, so a
    // spent or withdrawn invitation never reaches the registration step
    // and never says anything about the address.
    if (!(await acceptGuarded(tx, String(row.id)))) {
      throw workspaceForbidden();
    }
    const user = await signUp(tx, { email, password: input.password });
    // Every account owns a personal workspace, exactly as the first owner
    // does at bootstrap. Without one, an invited person would join a
    // shared workspace with nowhere of their own to keep anything.
    await createWorkspaceTx(tx, { name: personalWorkspaceName(email), ownerId: user.id });
    let added;
    try {
      added = await tx.query(
        `insert into workspace_members (workspace_id, user_id, role)
         values ($1, $2, $3)
         returning workspace_id, user_id, role, joined_at`,
        [workspaceId, user.id, role],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthError("auth/member-exists", "That person is already a member.");
      }
      throw error;
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
