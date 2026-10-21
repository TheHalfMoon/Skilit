/**
 * G00-G19: the workspace invitation REST surface.
 *
 * Five routes:
 * - POST   /api/v1/workspaces/{id}/invites      — an operator issues an invitation
 * - GET    /api/v1/workspaces/{id}/invites      — an operator reads the invitations
 * - DELETE /api/v1/workspaces/{id}/invites/{id} — an operator revokes an invitation
 * - GET    /api/v1/workspaces/{id}/members      — any member reads the roster
 * - GET    /api/v1/invites/{token}              — the holder reads the invitation
 * - POST   /api/v1/invites/{token}/accept       — the holder accepts it
 *
 * Security posture:
 * - the caller is always resolved from the presented credential, never
 *   from the body, so a caller can only act on their own authority;
 * - the unsafe methods that establish ambient authority are origin
 *   checked, exactly as sign-in and sign-up are;
 * - the invitation token is returned once, in the response that creates
 *   it, and never again;
 * - every access failure is one generic denial, so a caller cannot tell
 *   an unknown token from a revoked, expired or already-spent one.
 */

import { AuthError } from "../../../packages/db/src/auth.ts";
import {
  acceptInvite,
  createInvite,
  listInvites,
  listWorkspaceMembers,
  readInvite,
  redeemInvite,
  revokeInvite,
} from "../../../packages/db/src/invites.ts";
import type { InvitePreview, InviteRole, WorkspaceInvite } from "../../../packages/db/src/invites.ts";
import type { Membership } from "../../../packages/db/src/workspaces.ts";
import type { DbClient } from "../../../packages/db/src/db.ts";
import {
  AgentContractError,
  newRequestId,
  successEnvelope,
} from "./agent-contract.ts";
import type { AgentEnvelope } from "./agent-contract.ts";
import {
  isOriginAllowed,
  requestToken,
  resolveRequestUserFromRequest,
  sessionCookieHeader,
} from "./session.ts";

export interface InviteRouteResult {
  status: number;
  body: AgentEnvelope;
  setCookie?: string | undefined;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidInput(requestId: string, message: string): InviteRouteResult {
  const err = new AgentContractError("INVALID_INPUT", { message, requestId });
  return { status: err.httpStatus, body: err.toFailureEnvelope() };
}

function notFound(requestId: string): InviteRouteResult {
  const err = new AgentContractError("FORBIDDEN_OR_NOT_FOUND", { requestId });
  return { status: err.httpStatus, body: err.toFailureEnvelope() };
}

function opaque(requestId: string): InviteRouteResult {
  const err = new AgentContractError("INTERNAL_OPAQUE", { requestId });
  return { status: err.httpStatus, body: err.toFailureEnvelope() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Map a domain failure onto the agent contract. Every access failure is
 * the same generic denial, so a caller cannot probe which invitation ids
 * or tokens are real.
 */
function toFailure(error: unknown, requestId: string): InviteRouteResult {
  if (error instanceof AuthError) {
    if (error.code === "auth/member-exists") {
      return invalidInput(requestId, "That person is already a member.");
    }
    if (error.code === "auth/invite-exists") {
      return invalidInput(requestId, "An invite is already pending for that address.");
    }
    if (error.code === "auth/email-taken") {
      return invalidInput(
        requestId,
        "That address already has an account. Sign in to accept the invitation.",
      );
    }
    if (error.code === "auth/invalid-role" || error.code === "auth/invalid-invite") {
      return invalidInput(requestId, "Invitation request is invalid.");
    }
    return notFound(requestId);
  }
  if (error instanceof Error && error.name === "AuthError") return notFound(requestId);
  return opaque(requestId);
}

function toInviteView(invite: WorkspaceInvite) {
  return {
    id: invite.id,
    workspaceId: invite.workspaceId,
    workspaceName: invite.workspaceName,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt,
    revokedAt: invite.revokedAt,
    createdAt: invite.createdAt,
    state: invite.state,
  };
}

function toMembershipView(membership: Membership) {
  return {
    workspaceId: membership.workspaceId,
    userId: membership.userId,
    role: membership.role,
    joinedAt: membership.joinedAt,
  };
}

function toPreviewView(preview: InvitePreview) {
  return {
    email: preview.email,
    role: preview.role,
    workspaceName: preview.workspaceName,
    expiresAt: preview.expiresAt,
    state: preview.state,
  };
}

function checkUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * POST /api/v1/workspaces/{id}/invites — issue an invitation.
 *
 * The body carries the address and the role. The token is returned once:
 * it is the only copy, because the stored value is a hash.
 */
export async function createInviteRoute(
  db: DbClient,
  body: unknown,
  actorId: string,
  workspaceId: string,
  providedRequestId?: unknown,
): Promise<InviteRouteResult> {
  const requestId = newRequestId(providedRequestId);
  if (!checkUuid(actorId) || !checkUuid(workspaceId)) return notFound(requestId);
  const record = isRecord(body) ? body : null;
  const email = record?.email;
  const role = record?.role;
  if (typeof email !== "string" || typeof role !== "string") {
    return invalidInput(requestId, "An address and a role are required.");
  }
  if (role !== "owner" && role !== "admin" && role !== "member") {
    return invalidInput(requestId, "Invitation request is invalid.");
  }
  try {
    const created = await createInvite(db, {
      workspaceId,
      email,
      role: role as InviteRole,
      actorId,
    });
    return {
      status: 201,
      body: successEnvelope(requestId, {
        invite: toInviteView(created.invite),
        // The one and only time the raw token leaves the server.
        token: created.token,
      }),
    };
  } catch (error) {
    return toFailure(error, requestId);
  }
}

/**
 * GET /api/v1/workspaces/{id}/invites — the invitations of one workspace.
 */
export async function listInvitesRoute(
  db: DbClient,
  actorId: string,
  workspaceId: string,
  providedRequestId?: unknown,
): Promise<InviteRouteResult> {
  const requestId = newRequestId(providedRequestId);
  if (!checkUuid(actorId) || !checkUuid(workspaceId)) return notFound(requestId);
  try {
    const invites = await listInvites(db, { workspaceId, actorId });
    return {
      status: 200,
      body: successEnvelope(requestId, { invites: invites.map(toInviteView) }),
    };
  } catch (error) {
    return toFailure(error, requestId);
  }
}

/**
 * DELETE /api/v1/workspaces/{id}/invites/{inviteId} — revoke an
 * invitation.
 */
export async function revokeInviteRoute(
  db: DbClient,
  actorId: string,
  workspaceId: string,
  inviteId: string,
  providedRequestId?: unknown,
): Promise<InviteRouteResult> {
  const requestId = newRequestId(providedRequestId);
  if (!checkUuid(actorId) || !checkUuid(workspaceId) || !checkUuid(inviteId)) {
    return notFound(requestId);
  }
  try {
    const revoked = await revokeInvite(db, { workspaceId, inviteId, actorId });
    if (!revoked) return notFound(requestId);
    return {
      status: 200,
      body: successEnvelope(requestId, { revoked: true }),
    };
  } catch (error) {
    return toFailure(error, requestId);
  }
}

/**
 * GET /api/v1/workspaces/{id}/members — the roster of one workspace.
 */
export async function listMembersRoute(
  db: DbClient,
  actorId: string,
  workspaceId: string,
  providedRequestId?: unknown,
): Promise<InviteRouteResult> {
  const requestId = newRequestId(providedRequestId);
  if (!checkUuid(actorId) || !checkUuid(workspaceId)) return notFound(requestId);
  try {
    const members = await listWorkspaceMembers(db, { workspaceId, actorId });
    return {
      status: 200,
      body: successEnvelope(requestId, { members: members.map(toMembershipView) }),
    };
  } catch (error) {
    return toFailure(error, requestId);
  }
}

/**
 * GET /api/v1/invites/{token} — what the holder of an invitation may see
 * before they accept it.
 *
 * The token is the credential, so this route needs none of its own. An
 * unknown, revoked, expired or spent token all read as the same
 * absence.
 */
export async function readInviteRoute(
  db: DbClient,
  token: string,
  providedRequestId?: unknown,
): Promise<InviteRouteResult> {
  const requestId = newRequestId(providedRequestId);
  try {
    const preview = await readInvite(db, token);
    if (preview === null) return notFound(requestId);
    return {
      status: 200,
      body: successEnvelope(requestId, { invite: toPreviewView(preview) }),
    };
  } catch (error) {
    return toFailure(error, requestId);
  }
}

/**
 * POST /api/v1/invites/{token}/accept — accept an invitation.
 *
 * A holder who already has an account joins the workspace. A holder who
 * has none is created an account for exactly the invited address, and
 * the browser is signed in.
 *
 * The method establishes ambient authority, so it is origin checked.
 */
export async function acceptInviteRoute(
  db: DbClient,
  body: unknown,
  request: Request,
  token: string,
  providedRequestId?: unknown,
): Promise<InviteRouteResult> {
  const requestId = newRequestId(providedRequestId);
  if (!isOriginAllowed(request)) {
    return invalidInput(requestId, "Request origin is not allowed.");
  }
  const presented = requestToken(request).token;
  const record = isRecord(body) ? body : null;
  try {
    if (presented !== null) {
      // A signed-in holder joins the workspace as themselves.
      let userId: string;
      try {
        userId = await resolveRequestUserFromRequest(db, request);
      } catch {
        return {
          status: 401,
          body: new AgentContractError("UNAUTHENTICATED", { requestId }).toFailureEnvelope(),
        };
      }
      const accepted = await acceptInvite(db, { token, userId });
      return {
        status: 200,
        body: successEnvelope(requestId, {
          workspaceId: accepted.workspaceId,
          workspaceName: accepted.workspaceName,
          membership: toMembershipView(accepted.membership),
        }),
      };
    }
    // No credential: the invitation is the only authority that may
    // create an account, and only for the address it names.
    const email = record?.email;
    const password = record?.password;
    if (typeof email !== "string" || typeof password !== "string") {
      return invalidInput(requestId, "An address and a password are required.");
    }
    const redeemed = await redeemInvite(db, { token, email, password });
    return {
      status: 201,
      body: successEnvelope(requestId, {
        user: { id: redeemed.user.id, email: redeemed.user.email },
        workspaceId: redeemed.workspaceId,
        workspaceName: redeemed.workspaceName,
        membership: toMembershipView(redeemed.membership),
      }),
      setCookie: sessionCookieHeader(redeemed.session.token, request),
    };
  } catch (error) {
    return toFailure(error, requestId);
  }
}
