import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sessionRequest } from "../lib/browser-session.ts";

test("browser workspace requests explicitly use same-origin cookies, never bearer headers", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ result: { products: [] } }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await sessionRequest("/api/v1/products?limit=20", {
      headers: { Accept: "application/json" }
    });
    assert.equal(response.status, 200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].init.credentials, "same-origin");
    assert.equal(seen[0].init.cache, "no-store");
    assert.equal(seen[0].init.headers.get("Accept"), "application/json");
    assert.equal(seen[0].init.headers.has("Authorization"), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("browser session transport rejects remote URLs and accidental bearer headers", async () => {
  for (const invalid of ["https://example.org/api/v1/products", "//example.org/api/v1/products", "/api/health"]) {
    await assert.rejects(() => sessionRequest(invalid), /Only same-origin/);
  }
  await assert.rejects(
    () => sessionRequest("/api/v1/products", { headers: { Authorization: "Bearer not-a-real-token" } }),
    /must not send bearer/
  );
});

test("each Skilit human workspace renders session status without token inputs", () => {
  for (const view of ["gallery", "patterns", "flows", "boards", "lens", "account"]) {
    const source = readFileSync(new URL(`../app/${view}/page.tsx`, import.meta.url), "utf8");
    // The cookie-aware transport, directly or through the shared
    // envelope reader that owns it.
    assert.match(source, /sessionRequest\(|fetchJson\(/, `${view} uses cookie-aware transport`);
    assert.match(source, /<SessionAccessBanner \/>/, `${view} communicates session state`);
    assert.doesNotMatch(source, /htmlFor="[^"]*-token"|setToken|Authorization:|authHeaders/, `${view} must not request credentials from users`);
  }
  // The shared reader that pages use instead of the transport itself
  // still goes through it, and never asks for a bearer token.
  const envelope = readFileSync(new URL("../lib/browser-envelope.ts", import.meta.url), "utf8");
  assert.match(envelope, /sessionRequest\(path, init\)/);
  assert.doesNotMatch(envelope, /Authorization:/, "the shared reader must not send bearer tokens");
  const banner = readFileSync(new URL("../components/session-access-banner.tsx", import.meta.url), "utf8");
  assert.match(banner, /\/api\/v1\/auth\/session/);
  assert.match(banner, /skilit:session-expired/);
  // A signed-in visitor is offered the account page; an anonymous one is
  // offered the sign-in page.
  assert.match(banner, /"\/account"/);
  assert.match(banner, /"\/login"/);
  for (const prohibited of ["localStorage", "sessionStorage", "document.cookie"]) {
    assert.ok(!banner.includes(prohibited), `no ${prohibited} access`);
  }
});
