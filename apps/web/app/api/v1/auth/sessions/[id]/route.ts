import { NextResponse } from "next/server";

import { getSharedDb } from "../../../../../../lib/mcp-db";
import { checkRateLimit } from "../../../../../../lib/rate-limit";
import { clientKey } from "../../../../../../lib/http";
import { revokeSessionRoute } from "../../../../../../lib/session";
import { AgentContractError, newRequestId } from "../../../../../../lib/agent-contract";

function requestIdOf(request: Request): string {
  return newRequestId(request.headers.get("x-request-id"));
}

/**
 * DELETE /api/v1/auth/sessions/{id} — revoke one of the caller's own
 * sessions. A session that belongs to another account and a session that
 * does not exist are answered identically.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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
  const { id } = await context.params;
  const result = await revokeSessionRoute(db, request, id, requestId);
  const headers: Record<string, string> = { "X-Request-Id": result.body.request_id };
  if (result.setCookie !== undefined) headers["Set-Cookie"] = result.setCookie;
  return NextResponse.json(result.body, { status: result.status, headers });
}
