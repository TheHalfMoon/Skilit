import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../../apps/web/next.config.ts";

test("browser security headers apply to every web route", async () => {
  assert.equal(typeof nextConfig.headers, "function");
  const rules = await nextConfig.headers();
  const general = rules.find((rule) => rule.source === "/:path*");
  assert.ok(general !== undefined, "every route must carry the security headers");
  const entries = Object.fromEntries(general.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(entries["x-frame-options"], "DENY");
  assert.equal(entries["x-content-type-options"], "nosniff");
  assert.equal(entries["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(entries["permissions-policy"], "camera=(), microphone=(), geolocation=()");
  assert.match(entries["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(entries["content-security-policy"], /base-uri 'self'/);
  assert.match(entries["content-security-policy"], /object-src 'none'/);
  assert.doesNotMatch(entries["content-security-policy"], /script-src/);
});

test("the invitation surface never hands its token to another origin", async () => {
  assert.equal(typeof nextConfig.headers, "function");
  const rules = await nextConfig.headers();
  const invite = rules.find((rule) => rule.source === "/invite/:path*");
  assert.ok(invite !== undefined, "the invitation route must carry its own referrer policy");
  const entries = Object.fromEntries(invite.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  // The token travels in the URL, so the invitation page must not leak
  // it through the Referer header. A response header takes precedence
  // over the page's own metadata, so this is the rule in force.
  assert.equal(entries["referrer-policy"], "no-referrer");
});
