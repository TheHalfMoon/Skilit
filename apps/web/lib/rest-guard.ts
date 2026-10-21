/**
 * The request guard this grain's first-party REST routes share.
 *
 * Every REST route needs the same three things before it can do any
 * work: a rate-limit decision, an open database, and — for everything
 * that acts on somebody's authority — a session-resolved identity. That
 * sequence used to be copied into each route file, and every copy was a
 * chance to answer a refused request differently from its neighbours.
 *
 * The guard answers one way for everybody:
 * - a rate-limited request is 429 with a Retry-After;
 * - a request whose database cannot be opened is 500 and opaque;
 * - a request without a valid session is 401, and the reason is never
 *   disclosed.
 *
 * Older routes in the repository still carry their own copy of this
 * sequence; this module is the shape the newer ones use.
 */

import { NextResponse } from "next/server";

import { AgentContractError, newRequestId } from "./agent-contract.ts";
import { clientKey } from "./http.ts";
import { getSharedDb } from "./mcp-db.ts";
import { checkRateLimit } from "./rate-limit.ts";
import { requestToken, resolveRequestUserFromRequest } from "./session.ts";

type SharedDb = Awaited<ReturnType<typeof getSharedDb>>;

export interface GuardedRequest {
  ok: true;
  db: SharedDb;
  requestId: string;
}

/** A request whose caller was resolved from a session. */
export type GuardedSession = GuardedRequest & { userId: string };

/** A request whose caller is anonymous: the route resolves the identity itself. */
export type GuardedAnonymous = GuardedRequest;

export type GuardOutcome<T extends "session" | "anonymous"> =
  | (T extends "session" ? GuardedSession : GuardedAnonymous)
  | { ok: false; response: NextResponse };

export interface GuardOptions<T extends "session" | "anonymous"> {
  /**
   * Which rate-limit bucket the request belongs to. "rest" is the
   * ordinary API surface; "auth" is the family that can establish a
   * session, which is limited separately and always by caller.
   */
  scope?: "rest" | "auth";
  /**
   * "session" resolves the session and refuses the request without one.
   * "anonymous" leaves the identity to the route, for the routes that
   * serve an anonymous holder of a bearer secret of their own.
   */
  session: T;
  /**
   * Which identity the rate-limit bucket of a "rest" request is keyed
   * on. "presented" keys it on the credential the request carries,
   * "anonymous" keys it on the caller. The "auth" scope is always keyed
   * by caller, so this option does not apply to it.
   */
  credential?: "presented" | "anonymous";
}

export async function guardRequest<T extends "session" | "anonymous">(
  request: Request,
  options: GuardOptions<T>,
): Promise<GuardOutcome<T>> {
  const scope = options.scope ?? "rest";
  const needsSession = options.session === "session";
  const credential =
    options.credential ?? (scope === "auth" ? "anonymous" : "presented");
  const requestId = newRequestId(request.headers.get("x-request-id"));
  const token = requestToken(request).token;
  const limit = checkRateLimit(
    scope === "auth"
      ? `auth:${clientKey(request, null)}`
      : `rest:${clientKey(request, credential === "presented" ? token : null)}`,
  );
  if (!limit.allowed) {
    const err = new AgentContractError("RATE_LIMITED", { requestId });
    return {
      ok: false,
      response: NextResponse.json(err.toFailureEnvelope(), {
        status: err.httpStatus,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }),
    };
  }
  let db: SharedDb;
  try {
    db = await getSharedDb();
  } catch {
    const err = new AgentContractError("INTERNAL_OPAQUE", { requestId });
    return {
      ok: false,
      response: NextResponse.json(err.toFailureEnvelope(), { status: err.httpStatus }),
    };
  }
  if (!needsSession) {
    return { ok: true, db, requestId } as GuardOutcome<T>;
  }
  try {
    const userId = await resolveRequestUserFromRequest(db, request);
    return { ok: true, db, requestId, userId } as GuardOutcome<T>;
  } catch {
    const err = new AgentContractError("UNAUTHENTICATED", { requestId });
    return {
      ok: false,
      response: NextResponse.json(err.toFailureEnvelope(), {
        status: err.httpStatus,
        headers: { "X-Request-Id": requestId },
      }),
    };
  }
}
