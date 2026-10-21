import { NextResponse } from "next/server";

import { readInviteRoute } from "../../../../../lib/invites";
import { guardRequest } from "../../../../../lib/rest-guard";

/**
 * GET /api/v1/invites/{token} — what the holder of an invitation may see
 * before they accept it.
 *
 * The token is the credential, so this route requires none of its own.
 * An unknown token is an absence; a token that names a real invitation
 * is disclosed together with its state, so the holder is told whether it
 * is still spendable.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const guarded = await guardRequest(request, {
    session: "optional",
    credential: "anonymous",
  });
  if (!guarded.ok) return guarded.response;
  const { token } = await context.params;
  const result = await readInviteRoute(
    guarded.guarded.db,
    token,
    request.headers.get("x-request-id"),
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "X-Request-Id": result.body.request_id },
  });
}
