import { NextResponse } from "next/server";

import { getSharedDb } from "../../../../../../../lib/mcp-db";
import { checkRateLimit } from "../../../../../../../lib/rate-limit";
import { clientKey } from "../../../../../../../lib/http";
import { requestToken, resolveRequestUserFromRequest } from "../../../../../../../lib/session";
import { revokeInviteRoute } from "../../../../../../../lib/invites";
import { AgentContractError, newRequestId } from "../../../../../../../lib/agent-contract";

function requestIdOf(request: Request): string {
  return newRequestId(request.headers.get("x-request-id"));
}

/**
 * DELETE /api/v1/workspaces/{id}/invites/{inviteId} — revoke an
 * invitation. The invitation stops working at once.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; inviteId: string }> },
): Promise<NextResponse> {
  const requestId = requestIdOf(request);
  const token = requestToken(request).token;
  const limit = checkRateLimit(`rest:${clientKey(request, token)}`);
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
  let userId: string;
  try {
    userId = await resolveRequestUserFromRequest(db, request);
  } catch {
    const err = new AgentContractError("UNAUTHENTICATED", { requestId });
    return NextResponse.json(err.toFailureEnvelope(), {
      status: err.httpStatus,
      headers: { "X-Request-Id": requestId },
    });
  }
  const { id, inviteId } = await context.params;
  const result = await revokeInviteRoute(
    db,
    userId,
    id,
    inviteId,
    request.headers.get("x-request-id"),
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "X-Request-Id": result.body.request_id },
  });
}
