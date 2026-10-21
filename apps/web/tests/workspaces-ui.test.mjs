import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the workspaces page invites through the invitation endpoints", () => {
  const page = read("../app/workspaces/page.tsx");
  assert.match(page, /\/api\/v1\/workspaces\/\$\{encodeURIComponent\(workspaceId\)\}\/invites/);
  assert.match(page, /method: "POST"/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /\/members/);
  // The invitation link is shown once, with the warning that says so.
  assert.match(page, /shown once/);
  // The page never claims an email was sent: Skilit has no mail service.
  assert.ok(
    !/sent (an |the )?email/i.test(page),
    "the page must not claim an email was sent",
  );
});

test("the workspaces page reaches the invitation list and the roster", () => {
  const page = read("../app/workspaces/page.tsx");
  assert.match(page, /readInvites/);
  assert.match(page, /readMembers/);
  assert.match(page, /Revoke/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /role="alert"/);
});

test("the invitation page shows what the invitation is and accepts it", () => {
  const page = read("../app/invite/[token]/page.tsx");
  assert.match(page, /\/api\/v1\/invites\/\$\{encodeURIComponent\(token\)\}/);
  assert.match(page, /\/accept/);
  assert.match(page, /workspaceName/);
  assert.match(page, /role="alert"/);
  assert.match(page, /aria-live="polite"/);
  // The browser must never be asked for a bearer token.
  assert.ok(!/authorization/i.test(page), "the invitation page must not send an authorization header");
  for (const forbidden of ["localStorage", "sessionStorage", "document.cookie"]) {
    assert.ok(!page.includes(forbidden), `the invitation page must not use ${forbidden}`);
  }
});

test("the navigation offers the workspace surface", () => {
  const shell = read("../components/skilit-shell.tsx");
  assert.match(shell, /\{ label: "Workspaces", href: "\/workspaces"/);
});
