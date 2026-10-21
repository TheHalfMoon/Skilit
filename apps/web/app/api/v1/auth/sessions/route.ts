import { NextResponse } from "next/server";

import { getSharedDb } from "../../../../../lib/mcp-db";
import { checkRateLimit } from "../../../../../lib/rate-limit";
import { clientKey } from "../../../../../lib/http";
import { listSessionsRoute, revokeOtherSessionsRoute } from "../../../../../lib/session";
import { AgentContractError, newRequestId } from "../../../../../lib/agent-contract";

function requestIdOf(request: Request): string {
  return newRequestId(request.headers.get("x-request-id"));
}

/**
 * GET /api/v1/auth/sessions — list the caller's own sessions.
 * DELETE /api/v1/auth/sessions — revoke every other session of the caller.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = requestIdOf(request);
  const limit = checkRateLimit(`auth:${clientKey(request, null)}`);
  if (!limit.allowed) {
    const err = new AgentContractError("RATE_LIMITED", { requestId });
    return NextResponse.json(err.toFailureEnvelope(), {
      status: err.httpStatus,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }
  let db;
  try {
    db = await getSharedDb();
  } catch {
    const err = new AgentContractError("INTERNAL_OPAQUE", { requestId });
    return NextResponse.json(err.toFailureEnvelope(), { status: err.httpStatus });
  }
  const result = await listSessionsRoute(db, request, requestId);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "X-Request-Id": result.body.request_id },
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const requestId = requestIdOf(request);
  const limit = checkRateLimit(`auth:${clientKey(request, null)}`);
  if (!limit.allowed) {
    const err = new AgentContractError("RATE_LIMITED", { requestId });
    return NextResponse.json(err.toFailureEnvelope(), {
      status: err.httpStatus,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }
  let db;
  try {
    db = await getSharedDb();
  } catch {
    const err = new AgentContractError("INTERNAL_OPAQUE", { requestId });
    return NextResponse.json(err.toFailureEnvelope(), { status: err.httpStatus });
  }
  const result = await revokeOtherSessionsRoute(db, request, requestId);
  const headers: Record<string, string> = { "X-Request-Id": result.body.request_id };
  if (result.setCookie !== undefined) headers["Set-Cookie"] = result.setCookie;
  return NextResponse.json(result.body, { status: result.status, headers });
}
