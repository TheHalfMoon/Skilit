import { NextResponse } from "next/server";

import { LocalContentAddressedStorage } from "../../../../../../../packages/storage/src/storage.ts";
import { getSharedDb } from "../../../../../lib/mcp-db";
import { resolveRequestUserFromRequest, requestToken } from "../../../../../lib/session";
import { loadResearchScreenPreview } from "../../../../../lib/research-preview";
import { checkRateLimit } from "../../../../../lib/rate-limit";
import { clientKey } from "../../../../../lib/http";
import { AgentContractError, newRequestId } from "../../../../../lib/agent-contract";

function failure(code: "UNAUTHENTICATED" | "FORBIDDEN_OR_NOT_FOUND" | "INTERNAL_OPAQUE" | "RATE_LIMITED",
  id: string, retryAfter?: number): NextResponse {
  const error = new AgentContractError(code, { requestId: id });
  return NextResponse.json(error.toFailureEnvelope(), {
    status: error.httpStatus,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(retryAfter === undefined ? {} : { "Retry-After": String(retryAfter) }),
    },
  });
}

/** GET /api/v1/research/screens/[id]/preview
 * Only previews images explicitly admitted by the curator and readable by
 * the authenticated actor. This endpoint never accepts a filesystem path.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = newRequestId(request.headers.get("x-request-id"));
  const presented = requestToken(request).token;
  const rate = checkRateLimit(`rest:${clientKey(request, presented)}`);
  if (!rate.allowed) return failure("RATE_LIMITED", requestId, rate.retryAfterSeconds);

  try {
    const db = await getSharedDb();
    const actorId = await resolveRequestUserFromRequest(db, request, requestId);
    const { id } = await context.params;
    const rootDir = process.env.SKILIT_RESEARCH_MEDIA_ROOT;
    if (!rootDir) return failure("FORBIDDEN_OR_NOT_FOUND", requestId);
    const storage = new LocalContentAddressedStorage({ rootDir, maxBytes: 4 * 1024 * 1024 });
    const preview = await loadResearchScreenPreview(db, storage, actorId, id);
    if (preview === null) return failure("FORBIDDEN_OR_NOT_FOUND", requestId);
    return new Response(Uint8Array.from(preview.bytes), {
      status: 200,
      headers: {
        "Content-Type": preview.mediaType,
        "Content-Length": String(preview.bytes.byteLength),
        "Cache-Control": "private, no-store",
        "Vary": "Cookie, Authorization",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof AgentContractError && error.code === "UNAUTHENTICATED") {
      return failure("UNAUTHENTICATED", requestId);
    }
    return failure("INTERNAL_OPAQUE", requestId);
  }
}
