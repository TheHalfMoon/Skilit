import { NextResponse } from "next/server";

import { createInviteRoute, listInvitesRoute } from "../../../../../../lib/invites";
import { guardRequest } from "../../../../../../lib/rest-guard";

/**
 * POST /api/v1/workspaces/{id}/invites — issue an invitation to a
 * workspace. The raw token is in the answer and nowhere else.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guarded = await guardRequest(request, { session: "session" });
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
  const guarded = await guardRequest(request, { session: "session" });
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
