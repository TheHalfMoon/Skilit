import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the session list is derived only from the authenticated caller", () => {
  const session = read("../lib/session.ts");
  const list = session.slice(
    session.indexOf("export async function listSessionsRoute"),
    session.indexOf("export async function revokeSessionRoute"),
  );
  assert.match(list, /validateSession\(db, presented\.token\)/);
  assert.match(list, /listAccountSessions\(tx, session\.user\.id\)/);
  // The caller never supplies a user id, and no body is read from the
  // request: the list is the server's answer about the caller.
  assert.doesNotMatch(list, /request\.json\(/);
  assert.doesNotMatch(list, /body\.userId/);
});

test("revoking a session answers a foreign and an unknown id identically", () => {
  const session = read("../lib/session.ts");
  const revoke = session.slice(
    session.indexOf("export async function revokeSessionRoute"),
    session.indexOf("export async function revokeOtherSessionsRoute"),
  );
  assert.match(revoke, /revokeAccountSession\(tx, current\.userId, sessionId\)/);
  assert.match(revoke, /if \(!revoked\) return notFound\(requestId\);/);
  assert.match(session, /FORBIDDEN_OR_NOT_FOUND/);
});

test("cookie-authenticated session changes require a matching origin", () => {
  const session = read("../lib/session.ts");
  for (const route of ["revokeSessionRoute", "revokeOtherSessionsRoute"]) {
    const body = session.slice(session.indexOf(`export async function ${route}`));
    assert.match(
      body.slice(0, 900),
      /presented\.viaCookie && isUnsafeMethod\(request\.method\) && !isOriginAllowed\(request\)/,
      `${route} must enforce the origin rule for cookie credentials`,
    );
  }
});

test("the account page lists sessions and offers revocation without touching browser storage", () => {
  const page = read("../app/account/page.tsx");
  assert.match(page, /sessionRequest\("\/api\/v1\/auth\/sessions"\)/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /role="alert"/);
  assert.match(page, /currentSessionId/);
  assert.match(page, /Sign out of all other sessions/);
  for (const forbidden of ["localStorage", "sessionStorage", "document.cookie"]) {
    assert.ok(!page.includes(forbidden), `the account page must not use ${forbidden}`);
  }
  // A bearer token must never be sent from the browser.
  assert.ok(!/authorization/i.test(page), "the account page must not send an authorization header");
});

test("the account page is reachable from the primary navigation", () => {
  const shell = read("../components/skilit-shell.tsx");
  assert.match(shell, /\{ label: "Account", href: "\/account"/);
});
