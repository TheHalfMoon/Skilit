import { NextResponse } from "next/server";

import { getSharedDb } from "../../../../../../lib/mcp-db";
import { checkRateLimit } from "../../../../../../lib/rate-limit";
import { clientKey } from "../../../../../../lib/http";
import { requestToken, resolveRequestUserFromRequest } from "../../../../../../lib/session";
import { createInviteRoute, listInvitesRoute } from "../../../../../../lib/invites";
import { AgentContractError, newRequestId } from "../../../../../../lib/agent-contract";

function requestIdOf(request: Request): string {
  return newRequestId(request.headers.get("x-request-id"));
}

async function guard(request: Request): Promise<
  | { ok: true; db: Awaited<ReturnType<typeof getSharedDb>>; userId: string }
  | { ok: false; response: NextResponse }
> {
  const requestId = requestIdOf(request);
  const token = requestToken(request).token;
  const limit = checkRateLimit(`rest:${clientKey(request, token)}`);
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
    return { ok: false, response: NextResponse.json(err.toFailureEnvelope(), { status: err.httpStatus }) };
  }
  try {
    const userId = await resolveRequestUserFromRequest(db, request);
    return { ok: true, db, userId };
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

/**
 * POST /api/v1/workspaces/{id}/invites — issue an invitation to a
 * workspace. The raw token is in the answer and nowhere else.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guarded = await guard(request);
  if (!guarded.ok) return guarded.response;
  const { id } = await context.params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await createInviteRoute(
    guarded.db,
    body,
    guarded.userId,
    id,
    request.headers.get("x-request-id"),
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "X-Request-Id": result.body.request_id },
  });
}

/**
 * GET /api/v1/workspaces/{id}/invites — the invitations of one workspace.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guarded = await guard(request);
  if (!guarded.ok) return guarded.response;
  const { id } = await context.params;
  const result = await listInvitesRoute(
    guarded.db,
    guarded.userId,
    id,
    request.headers.get("x-request-id"),
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "X-Request-Id": result.body.request_id },
  });
}
