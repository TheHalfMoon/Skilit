/**
 * The one request guard shared by the first-party REST routes.
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
 */

import { NextResponse } from "next/server";

import { AgentContractError, newRequestId } from "./agent-contract.ts";
import { clientKey } from "./http.ts";
import { getSharedDb } from "./mcp-db.ts";
import { checkRateLimit } from "./rate-limit.ts";
import { requestToken, resolveRequestUserFromRequest } from "./session.ts";

export interface GuardedRequest {
  db: Awaited<ReturnType<typeof getSharedDb>>;
  /** The session-resolved identity, or null when the route accepts an anonymous caller. */
  userId: string | null;
  requestId: string;
}

export type GuardOutcome =
  | { ok: true; guarded: GuardedRequest }
  | { ok: false; response: NextResponse };

export interface GuardOptions {
  /**
   * Which rate-limit bucket the request belongs to. "rest" is the
   * ordinary API surface; "auth" is the family that can establish a
   * session, which is limited separately.
   */
  scope?: "rest" | "auth";
  /**
   * "required" resolves the session and refuses the request without one.
   * "optional" leaves the identity to the route, for the routes that
   * serve an anonymous holder of a bearer secret of their own.
   */
  session?: "required" | "optional";
  /**
   * Which identity the rate-limit bucket is keyed on. "presented" keys
   * the bucket on the credential the request carries, "anonymous" keys
   * it on the caller. The default follows the scope: the auth family is
   * always bucketed by caller, everything else by credential.
   */
  credential?: "presented" | "anonymous";
}

export async function guardRequest(
  request: Request,
  options: GuardOptions = {},
): Promise<GuardOutcome> {
  const scope = options.scope ?? "rest";
  const needsSession = (options.session ?? "required") === "required";
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
  let db;
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
    return { ok: true, guarded: { db, userId: null, requestId } };
  }
  try {
    const userId = await resolveRequestUserFromRequest(db, request);
    return { ok: true, guarded: { db, userId, requestId } };
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
