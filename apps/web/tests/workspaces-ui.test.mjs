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

test("the roster shows the address behind every membership, not an identifier", () => {
  const page = read("../app/workspaces/page.tsx");
  // A roster of identifiers is not a roster of people: the address is
  // what a workspace is managed by.
  assert.match(page, /<td>\{member\.email\}<\/td>/);
  assert.ok(
    !/<code>\{member\.userId\}<\/code>/.test(page),
    "the roster must not show the raw user id",
  );
  // The address arrives with the roster, and the server sends it.
  assert.match(page, /typeof email !== "string"/);
});

test("the workspaces page is role aware and does not offer a plain member the invitation form", () => {
  const page = read("../app/workspaces/page.tsx");
  // The caller's own role comes back with the roster, so the page knows
  // what this person may do without a second question.
  assert.match(page, /viewerRole/);
  assert.match(page, /viewerRole === "owner" \|\| viewerRole === "admin"/);
  // The invitation form and the invitation list are for operators only.
  assert.match(page, /\{operator \? \(\s*<section aria-label="Invite someone">/);
  assert.match(page, /Only owners and admins can invite/);
  // A plain member is not answered with an error either: the page says
  // what the situation is.
  assert.match(page, /You are not a member of this workspace\./);
});

test("the workspaces page never shows one workspace's roster next to another", () => {
  const page = read("../app/workspaces/page.tsx");
  // The lists are dropped before the new ones arrive, so a stale table
  // can never sit on screen next to a different workspace.
  assert.match(page, /setView\(\{ \.\.\.IDLE_VIEW, status: "loading" \}\)/);
  // A refused load says the roster is unavailable instead of leaving the
  // previous one on screen.
  assert.match(page, /status: membersOutcome\.status === 404 \? "denied" : "unavailable"/);
  // "No workspace is selected" and "the roster could not be loaded" are
  // different states, and both are rendered.
  assert.match(page, /Select a workspace to see its roster\./);
  assert.match(page, /The roster for this workspace could not be loaded\./);
  // The request that goes away with the page does not update it.
  assert.match(page, /if \(signal\.aborted\) return;/);
  assert.match(page, /new AbortController\(\)/);
  // A refresh reads the workspace that is showing right now, not the one
  // the handler was created with: an action that lands after the
  // operator has switched workspace must not put the previous
  // workspace's roster back on screen.
  assert.match(page, /const current = useRef\(""\);/);
  assert.match(page, /current\.current = workspaceId;/);
  assert.match(page, /const id = current\.current;/);
  assert.match(page, /await load\(id, controller\.signal\);/);
  // The one-time link belongs to the workspace it was issued for, so a
  // create that lands after a switch does not show it under the new
  // workspace.
  assert.match(page, /if \(current\.current !== workspaceId\) return;/);
  // The link that belonged to the previous workspace is dropped with it.
  assert.match(page, /setInviteLink\(null\);/);
});

test("a control that is announced unavailable never acts", () => {
  const page = read("../app/workspaces/page.tsx");
  // A disabled button that becomes disabled while focused drops the
  // keyboard user's place, so the state is announced instead.
  assert.ok(
    !/<button[^>]*\sdisabled=/.test(page),
    "the workspaces page must not disable a button it may be focused on",
  );
  for (const control of ["Create invitation", "Revoke", "Refresh"]) {
    assert.ok(page.includes(control), `the page must offer ${control}`);
  }
  // The announcement and the guard name the same condition. The button's
  // text is the last occurrence of its label, and the element is taken
  // from the opening tag before it.
  const createAt = page.lastIndexOf("Create invitation");
  const create = page.slice(page.lastIndexOf("<button", createAt), createAt);
  assert.match(create, /aria-disabled=\{!canAct\}/);
  assert.match(create, /if \(!canAct\) return;/);
  const revokeAt = page.lastIndexOf("Revoke");
  const revoke = page.slice(page.lastIndexOf("<button", revokeAt), revokeAt);
  assert.match(revoke, /aria-disabled=\{busy !== null \|\| invite\.state !== "pending"\}/);
  assert.match(
    revoke,
    /if \(busy !== null \|\| invite\.state !== "pending"\) return;/,
  );
});

test("the role an operator picks is one they may actually grant", () => {
  const page = read("../app/workspaces/page.tsx");
  // An admin may grant a member only, so the option is not offered to
  // one: a control that cannot work is worse than no control.
  assert.match(
    page,
    /view\.viewerRole === "owner" \? <option value="admin">Admin<\/option> : null/,
  );
});

test("the workspaces page offers a copy control and a refresh control", () => {
  const page = read("../app/workspaces/page.tsx");
  assert.match(page, /Copy link/);
  assert.match(page, /navigator\.clipboard\.writeText\(inviteLink\)/);
  assert.match(page, /Refresh/);
  // The lifetime of an invitation is the operator's choice.
  assert.match(page, /workspaces-lifetime/);
  assert.match(page, /ttlSeconds/);
});

test("the workspaces page links to the account surface", () => {
  const page = read("../app/workspaces/page.tsx");
  assert.match(page, /href="\/account"/);
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

test("the invitation page offers the invited person a way in when they already have an account", () => {
  const page = read("../app/invite/[token]/page.tsx");
  // The page says who the invitation is for, and compares it with the
  // account that is signed in.
  assert.match(page, /signedInAsInvited/);
  assert.match(page, /Sign in as/);
  // The sign-in destination is the invitation itself, and the page says
  // which address has to sign in.
  assert.match(page, /\/login\?next=/);
  assert.match(page, /viewerEmail/);
  // A signed-in visitor who is somebody else is told why, not left with
  // a form that cannot work.
  assert.match(page, /invitation is for/);
});

test("the invitation page says the invitation was used instead of reading it again", () => {
  const page = read("../app/invite/[token]/page.tsx");
  assert.match(page, /status: "joined"/);
  assert.match(page, /You joined/);
  // A terminal invitation says which terminal it is.
  assert.match(page, /This invitation was revoked\./);
  assert.match(page, /This invitation has expired\./);
  assert.match(page, /This invitation has already been used\./);
});

test("the invitation surface never leaks the token to another origin", () => {
  const layout = read("../app/invite/layout.tsx");
  assert.match(layout, /referrer: "no-referrer"/);
  const page = read("../app/invite/[token]/page.tsx");
  // The token is never rendered on the page itself.
  assert.ok(!/>\{token\}</.test(page), "the invitation page must not render the token");
  assert.ok(!/value=\{token\}/.test(page), "the invitation page must not show the token");
});

test("the sign-in page can return to where the visitor came from", () => {
  const page = read("../app/login/page.tsx");
  assert.match(page, /new URLSearchParams\(window\.location\.search\)\.get\("next"\)/);
  // The destination is checked by the shared helper, which refuses any
  // value that would leave the application.
  assert.match(page, /safeDestination\(raw, window\.location\.origin\)/);
  const helper = read("../lib/safe-destination.ts");
  assert.match(helper, /resolved\.origin !== base\.origin/);
  assert.match(page, /window\.location\.assign\(destination\)/);
});

test("the navigation offers the workspace surface", () => {
  const shell = read("../components/skilit-shell.tsx");
  assert.match(shell, /\{ label: "Workspaces", href: "\/workspaces"/);
});

test("the workspace surfaces style themselves with the design system, not inline styles", () => {
  const css = read("../app/globals.css");
  for (const page of ["../app/workspaces/page.tsx", "../app/invite/[token]/page.tsx"]) {
    const source = read(page);
    // Inline styles bypass the shared stylesheet, so a later token change
    // would not reach them.
    assert.ok(!/style=\{\{/.test(source), `${page} must not use inline styles`);
    // A custom property that the stylesheet never declares silently
    // falls back to the fallback value, so the two must not drift
    // apart.
    for (const match of `${source}\n${css}`.matchAll(/var\((--[a-z0-9-]+)/g)) {
      assert.ok(
        css.includes(`${match[1]}:`),
        `${page} uses ${match[1]}, which the stylesheet does not declare`,
      );
    }
  }
  assert.ok(
    css.includes(".sk-field-wide"),
    "the stylesheet must declare the full-width field class",
  );
});
