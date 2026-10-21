import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the account page lists sessions and offers revocation without touching browser storage", () => {
  const page = read("../app/account/page.tsx");
  // The page talks to the API through the cookie-aware transport.
  assert.match(page, /sessionRequest\(path, init\)/);
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
