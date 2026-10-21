import { NextResponse } from "next/server";

import { createBoardRoute, listBoardsRoute } from "../../../../lib/boards";
import { guardRequest } from "../../../../lib/rest-guard";

/**
 * POST /api/v1/boards — create a reference board in a workspace.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guarded = await guardRequest(request);
  if (!guarded.ok) return guarded.response;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await createBoardRoute(
    guarded.guarded.db,
    body,
    guarded.guarded.userId ?? "",
    request.headers.get("x-request-id"),
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "X-Request-Id": result.body.request_id },
  });
}

/**
 * GET /api/v1/boards?workspaceId= — list boards visible to the caller.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const guarded = await guardRequest(request);
  if (!guarded.ok) return guarded.response;
  const url = new URL(request.url);
  const result = await listBoardsRoute(
    guarded.guarded.db,
    { workspaceId: url.searchParams.get("workspaceId") ?? undefined },
    guarded.guarded.userId ?? "",
    request.headers.get("x-request-id"),
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "X-Request-Id": result.body.request_id },
  });
}
