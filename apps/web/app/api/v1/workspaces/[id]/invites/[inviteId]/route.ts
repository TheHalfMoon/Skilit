import { NextResponse } from "next/server";

import { revokeInviteRoute } from "../../../../../../../lib/invites";
import { guardRequest } from "../../../../../../../lib/rest-guard";

/**
 * DELETE /api/v1/workspaces/{id}/invites/{inviteId} — revoke an
 * invitation. The invitation stops working at once.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; inviteId: string }> },
): Promise<NextResponse> {
  const guarded = await guardRequest(request);
  if (!guarded.ok) return guarded.response;
  const { id, inviteId } = await context.params;
  const result = await revokeInviteRoute(
    guarded.guarded.db,
    guarded.guarded.userId ?? "",
    id,
    inviteId,
    request.headers.get("x-request-id"),
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "X-Request-Id": result.body.request_id },
  });
}
