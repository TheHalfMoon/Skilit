import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the account page lists sessions and offers revocation without touching browser storage", () => {
  const page = read("../app/account/page.tsx");
  const envelope = read("../lib/browser-envelope.ts");
  // The page talks to the API through the cookie-aware transport, which
  // the shared envelope reader owns.
  assert.match(page, /fetchJson\(path, init, label\)/);
  assert.match(envelope, /sessionRequest\(path, init\)/);
  assert.match(page, /"Load sessions",\s*"\/api\/v1\/auth\/sessions"/);
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

test("the account page calls both revocation endpoints", () => {
  const page = read("../app/account/page.tsx");
  // Both call sites, not one of them: deleting either must fail here.
  assert.match(
    page,
    /`\/api\/v1\/auth\/sessions\/\$\{encodeURIComponent\(sessionId\)\}`,\s*\{ method: "DELETE" \}/,
    "the account page must revoke one session by id",
  );
  assert.match(
    page,
    /"Sign out everywhere else",\s*"\/api\/v1\/auth\/sessions",\s*\{ method: "DELETE" \}/,
    "the account page must revoke every other session",
  );
});

test("the account page is reachable from the primary navigation", () => {
  const shell = read("../components/skilit-shell.tsx");
  assert.match(shell, /\{ label: "Account", href: "\/account"/);
});

test("the signed-in banner points at the account page", () => {
  const banner = read("../components/session-access-banner.tsx");
  assert.match(
    banner,
    /href=\{session\.status === "authenticated" \? "\/account" : "\/login"\}/,
    "a signed-in visitor must be offered the account page, not the sign-in page",
  );
});

test("the account page styles itself with the design system, not inline styles", () => {
  const page = read("../app/account/page.tsx");
  const css = read("../app/globals.css");
  // Inline styles bypass the shared stylesheet, so a later token change
  // would not reach them.
  assert.ok(!/style=\{\{/.test(page), "the account page must not use inline styles");
  // A custom property that the stylesheet never declares silently falls
  // back to the fallback value, so the two must not drift apart. The
  // stylesheet is scanned too, because that is where the tokens live.
  for (const match of `${page}\n${css}`.matchAll(/var\((--[a-z0-9-]+)/g)) {
    assert.ok(
      css.includes(`${match[1]}:`),
      `the account page uses ${match[1]}, which the stylesheet does not declare`,
    );
  }
  for (const className of ["sk-account-actions", "sk-account-table"]) {
    assert.ok(page.includes(className), `the account page must use ${className}`);
    assert.ok(css.includes(`.${className}`), `the stylesheet must declare ${className}`);
  }
});

test("the account page marks an unavailable button instead of disabling it", () => {
  const page = read("../app/account/page.tsx");
  // A disabled button that becomes disabled while focused drops the
  // keyboard user's place, so the state is announced instead.
  assert.ok(
    !/<button[^>]*\sdisabled=/.test(page),
    "the account page must not disable a button it may be focused on",
  );
  assert.match(page, /aria-disabled=/, "the account page marks unavailable buttons");
  assert.match(
    page,
    /aria-label=\{`Revoke session \$\{session\.id\}`\}/,
    "every row button must name the session it acts on",
  );
});

test("a control that is announced as unavailable never acts", () => {
  const page = read("../app/account/page.tsx");
  // The announcement and the guard must name the same condition. When
  // they differ, the button is announced unavailable while it still
  // fires, which is worse than either behaviour alone.
  const label = page.indexOf("Sign out of all other sessions");
  assert.ok(label > 0, "the account page must offer the bulk revoke");
  // The button's attributes and handler precede its text, so the
  // element is taken from its opening tag.
  const bulk = page.slice(page.lastIndexOf("<button", label), label);
  assert.match(bulk, /aria-disabled=\{busy !== null \|\| state\.status !== "ready"\}/);
  assert.match(bulk, /if \(busy !== null \|\| state\.status !== "ready"\) return;/);

  // A list that could not be loaded must not leave a stale table on
  // screen next to the error, whether the server refused it or the
  // request never completed.
  assert.match(
    page,
    /\(\) => \{\s*setState\(\{ status: "unavailable" \}\);\s*\}/,
    "a refused list must put the page in the unavailable state",
  );
  // A request that never completed must reach the same transition as
  // one the server refused, so the shared reader reports it as a
  // failure the page acts on.
  assert.match(
    page,
    /if \(onFailed !== undefined\) await onFailed\(outcome\.status\);/,
    "a failed list must reach the same transition as a refused one",
  );
  // It must be reported without an HTTP status. A status of 404 would
  // be taken by the revoke action as "that session is no longer listed",
  // which a request that never completed cannot mean.
  const envelope = read("../lib/browser-envelope.ts");
  assert.match(
    envelope,
    /status: 0, code: "UNKNOWN", message: `\$\{label\} could not reach the server\./,
    "a request that never completed must be reported without an HTTP status",
  );
});
