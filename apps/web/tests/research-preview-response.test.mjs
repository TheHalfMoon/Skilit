import assert from "node:assert/strict";
import test from "node:test";

import {
  readBoundedResearchPreview,
  ResearchPreviewResponseError,
  RESEARCH_PREVIEW_MAX_BYTES,
} from "../lib/research-preview-response.ts";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9K7b0AAAAASUVORK5CYII=",
  "base64",
);

function streamedResponse(parts, headers = { "content-type": "image/png" }) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  }), { headers });
}

test("G37 accepts bounded fragmented PNG bytes without Response.blob()", async () => {
  const response = streamedResponse(
    [png.subarray(0, 5), png.subarray(5, 18), png.subarray(18)],
    { "content-type": "image/png", "content-length": String(png.byteLength) },
  );
  const blob = await readBoundedResearchPreview(response);
  assert.equal(blob.type, "image/png");
  assert.equal(blob.size, png.length);
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), png);
});

test("G37 supports missing declared length but still enforces verified stream size", async () => {
  const blob = await readBoundedResearchPreview(streamedResponse([png]));
  assert.equal(blob.size, png.length);
});

test("G37 rejects an oversized Content-Length before reading the stream", async () => {
  let pulled = 0;
  const response = new Response(new ReadableStream({
    pull() { pulled += 1; },
  }), { headers: {
    "content-type": "image/png",
    "content-length": String(RESEARCH_PREVIEW_MAX_BYTES + 1),
  } });
  await assert.rejects(readBoundedResearchPreview(response), ResearchPreviewResponseError);
  // An underlying ReadableStream may eagerly pull once, but the function
  // never calls getReader or reads a body when the declared size is invalid.
  assert.ok(pulled <= 1);
  await response.body.cancel();
});

test("G37 refuses an oversized stream even if its Content-Length is missing", async () => {
  let canceled = false;
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(RESEARCH_PREVIEW_MAX_BYTES));
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() { canceled = true; },
  }), { headers: { "content-type": "image/png" } });
  await assert.rejects(readBoundedResearchPreview(response), ResearchPreviewResponseError);
  assert.equal(canceled, true);
});

test("G37 rejects content-length mismatch, truncated PNG and incorrect mime", async () => {
  const bad = [
    streamedResponse([png], {
      "content-type": "image/png", "content-length": String(png.length + 2),
    }),
    streamedResponse([png.subarray(0, 8)]),
    streamedResponse([png], { "content-type": "image/svg+xml" }),
    streamedResponse([png], {
      "content-type": "image/png", "content-length": "-1",
    }),
    streamedResponse([png], {
      "content-type": "image/png", "content-length": "999999999",
    }),
    new Response(null, { headers: { "content-type": "image/png" } }),
    new Response("error", { status: 403, headers: { "content-type": "image/png" } }),
  ];
  for (const response of bad) {
    await assert.rejects(readBoundedResearchPreview(response), ResearchPreviewResponseError);
  }
});

test("G37 caps pathological zero-byte chunk streams as well as total bytes", async () => {
  const zeros = Array.from({ length: 8193 }, () => new Uint8Array(0));
  await assert.rejects(
    readBoundedResearchPreview(streamedResponse(zeros)),
    ResearchPreviewResponseError,
  );
});
