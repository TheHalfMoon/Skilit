import { NextResponse } from "next/server";

import { listMembersRoute } from "../../../../../../lib/invites";
import { guardRequest } from "../../../../../../lib/rest-guard";

/**
 * GET /api/v1/workspaces/{id}/members — the roster of one workspace.
 * Any member may read it.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guarded = await guardRequest(request, { session: "session" });
  if (!guarded.ok) return guarded.response;
  const { id } = await context.params;
  const result = await listMembersRoute(
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
