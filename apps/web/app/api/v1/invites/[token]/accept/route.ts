import { NextResponse } from "next/server";

import { acceptInviteRoute } from "../../../../../../lib/invites";
import { guardRequest } from "../../../../../../lib/rest-guard";

/**
 * POST /api/v1/invites/{token}/accept — accept an invitation.
 *
 * A holder who already has an account joins the workspace. A holder who
 * has none is created an account for exactly the invited address, and the
 * browser is signed in.
 *
 * The method establishes ambient authority, so it is origin checked and
 * it lives in the auth family, which is rate limited by caller.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const guarded = await guardRequest(request, { scope: "auth", session: "anonymous" });
  if (!guarded.ok) return guarded.response;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { token } = await context.params;
  const result = await acceptInviteRoute(
    guarded.db,
    body,
    request,
    token,
    request.headers.get("x-request-id"),
  );
  const headers: Record<string, string> = { "X-Request-Id": result.body.request_id };
  if (result.setCookie !== undefined) headers["Set-Cookie"] = result.setCookie;
  return NextResponse.json(result.body, { status: result.status, headers });
}
