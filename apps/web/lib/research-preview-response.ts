/** Read authenticated, same-origin image previews without unbounded Response.blob().
 * Technical byte limits do not attest to image licensing or redistribution rights.
 */
export const RESEARCH_PREVIEW_MAX_BYTES = 4 * 1024 * 1024;
const MAX_STREAM_CHUNKS = 8192;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class ResearchPreviewResponseError extends Error {
  constructor() {
    super("The research preview response is invalid or exceeds its byte budget.");
    this.name = "ResearchPreviewResponseError";
  }
}

/** Reject oversized headers before reading and oversized bodies while streaming. */
export async function readBoundedResearchPreview(response: Response): Promise<Blob> {
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!response.ok || !TYPES.has(mime)) throw new ResearchPreviewResponseError();
  const rawLength = response.headers.get("content-length");
  let expectedSize: number | null = null;
  if (rawLength !== null) {
    if (!/^[1-9][0-9]{0,7}$/.test(rawLength)) throw new ResearchPreviewResponseError();
    expectedSize = Number(rawLength);
    if (expectedSize < 16 || expectedSize > RESEARCH_PREVIEW_MAX_BYTES) {
      throw new ResearchPreviewResponseError();
    }
  }
  if (response.body === null) throw new ResearchPreviewResponseError();
  const reader = response.body.getReader();
  let complete = false;
  const parts: Uint8Array[] = [];
  let received = 0;
  let chunks = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array) ||
          ++chunks > MAX_STREAM_CHUNKS ||
          item.value.byteLength > RESEARCH_PREVIEW_MAX_BYTES - received) {
        throw new ResearchPreviewResponseError();
      }
      if (item.value.byteLength > 0) {
        // Copy because a custom streaming source may reuse its buffers.
        parts.push(item.value.slice());
        received += item.value.byteLength;
      }
    }
    if (received < 16 || (expectedSize !== null && expectedSize !== received)) {
      throw new ResearchPreviewResponseError();
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    complete = true;
    return new Blob([bytes], { type: mime });
  } finally {
    if (!complete) {
      try {
        await reader.cancel();
      } catch {
        // The original validation error must remain the failure signal.
      }
    }
    reader.releaseLock();
  }
}
