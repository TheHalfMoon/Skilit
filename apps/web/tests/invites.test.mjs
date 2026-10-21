import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../../packages/db/src/db.ts";
import { migrateUp } from "../../../packages/db/src/migrate.ts";
import { createSession, signUp } from "../../../packages/db/src/auth.ts";
import { createWorkspaceTx } from "../../../packages/db/src/workspaces.ts";
import {
  acceptInviteRoute,
  createInviteRoute,
  listInvitesRoute,
  listMembersRoute,
  readInviteRoute,
  revokeInviteRoute,
} from "../lib/invites.ts";
import { SESSION_COOKIE_NAME } from "../lib/session.ts";

const ORIGIN = "http://localhost:3103";

function httpRequest(path, options = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: options.method ?? "GET",
    headers: options.headers ?? {},
    body: options.body,
  });
}

function jsonRequest(path, body, options = {}) {
  return httpRequest(path, {
    ...options,
    method: options.method ?? "POST",
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    body: JSON.stringify(body),
  });
}

function cookieRequest(path, token, options = {}) {
  return httpRequest(path, {
    ...options,
    headers: { ...(options.headers ?? {}), cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

async function fixture() {
  const db = await openDatabase();
  await migrateUp(db);
  return { db };
}

/** An owner with a workspace, plus a plain member of it. */
async function operator(db) {
  const owner = await signUp(db, { email: "owner@skilit.example", password: "owner-password-01" });
  const space = await createWorkspaceTx(db, { name: "Operator workspace", ownerId: owner.id });
  const member = await signUp(db, { email: "member@skilit.example", password: "member-password-01" });
  await db.query(
    "insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')",
    [space.workspace.id, member.id],
  );
  return { owner, member, workspace: space.workspace };
}

test("an operator creates an invitation and the token is in the answer once", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member" },
      owner.id,
      workspace.id,
      "rid-invite-1",
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.result.invite.email, "guest@skilit.example");
    assert.equal(created.body.result.invite.state, "pending");
    assert.equal(created.body.result.invite.workspaceName, "Operator workspace");
    assert.ok(typeof created.body.result.token === "string");
    // The token is never part of the invitation view itself.
    assert.equal(created.body.result.invite.token, undefined);

    // Reading the invitations back never carries a token.
    const listed = await listInvitesRoute(fx.db, owner.id, workspace.id, "rid-invite-2");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.result.invites.length, 1);
    assert.equal(listed.body.result.invites[0].token, undefined);
    assert.equal(listed.body.result.invites[0].email, "guest@skilit.example");
  } finally {
    await fx.db.close();
  }
});

test("an invitation request that names no address or role is refused", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const missing = await createInviteRoute(fx.db, {}, owner.id, workspace.id, "rid-invite-3");
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, "INVALID_INPUT");

    const badRole = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "superuser" },
      owner.id,
      workspace.id,
      "rid-invite-4",
    );
    assert.equal(badRole.status, 400);
    assert.equal(badRole.body.error.code, "INVALID_INPUT");
  } finally {
    await fx.db.close();
  }
});

test("a plain member may not create an invitation or read the invitation list", async () => {
  const fx = await fixture();
  try {
    const { member, workspace } = await operator(fx.db);
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member" },
      member.id,
      workspace.id,
      "rid-invite-5",
    );
    assert.equal(created.status, 404);
    assert.equal(created.body.error.code, "FORBIDDEN_OR_NOT_FOUND");

    const listed = await listInvitesRoute(fx.db, member.id, workspace.id, "rid-invite-6");
    assert.equal(listed.status, 404);
    assert.equal(listed.body.error.code, "FORBIDDEN_OR_NOT_FOUND");

    // The roster is readable by any member.
    const members = await listMembersRoute(fx.db, member.id, workspace.id, "rid-invite-7");
    assert.equal(members.status, 200);
    assert.equal(members.body.result.members.length, 2);
  } finally {
    await fx.db.close();
  }
});

test("an unknown identifier is answered as an absence", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member" },
      owner.id,
      workspace.id,
      "rid-invite-8",
    );
    const revoked = await revokeInviteRoute(
      fx.db,
      owner.id,
      workspace.id,
      created.body.result.invite.id,
      "rid-invite-9",
    );
    assert.equal(revoked.status, 200);
    const again = await revokeInviteRoute(
      fx.db,
      owner.id,
      workspace.id,
      created.body.result.invite.id,
      "rid-invite-10",
    );
    assert.equal(again.status, 404);

    const bogus = await listInvitesRoute(
      fx.db,
      owner.id,
      "00000000-0000-4000-8000-000000000000",
      "rid-invite-11",
    );
    assert.equal(bogus.status, 404);
  } finally {
    await fx.db.close();
  }
});

test("the holder reads the invitation and the token is the credential", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "admin" },
      owner.id,
      workspace.id,
      "rid-invite-12",
    );
    const token = created.body.result.token;

    const preview = await readInviteRoute(fx.db, token, "rid-invite-13");
    assert.equal(preview.status, 200);
    assert.equal(preview.body.result.invite.email, "guest@skilit.example");
    assert.equal(preview.body.result.invite.role, "admin");
    assert.equal(preview.body.result.invite.state, "pending");
    // The preview discloses nothing about the invitation beyond what the
    // holder needs.
    assert.equal(preview.body.result.invite.token, undefined);
    assert.equal(preview.body.result.invite.id, undefined);
    assert.equal(preview.body.result.invite.invitedBy, undefined);

    const unknown = await readInviteRoute(fx.db, "not-a-real-token", "rid-invite-14");
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, "FORBIDDEN_OR_NOT_FOUND");
  } finally {
    await fx.db.close();
  }
});

test("an anonymous holder accepts the invitation and is signed in", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member" },
      owner.id,
      workspace.id,
      "rid-invite-15",
    );
    const token = created.body.result.token;

    const accepted = await acceptInviteRoute(
      fx.db,
      { email: "guest@skilit.example", password: "guest-password-01" },
      jsonRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {}),
      token,
      "rid-invite-16",
    );
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.result.user.email, "guest@skilit.example");
    assert.equal(accepted.body.result.membership.role, "member");
    assert.ok(typeof accepted.setCookie === "string", "the browser is signed in");
    assert.ok(accepted.setCookie.includes(SESSION_COOKIE_NAME));

    // The invitation is spent.
    const spent = await acceptInviteRoute(
      fx.db,
      { email: "guest@skilit.example", password: "guest-password-01" },
      jsonRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {}),
      token,
      "rid-invite-17",
    );
    assert.equal(spent.status, 404);
  } finally {
    await fx.db.close();
  }
});

test("an anonymous holder may not accept for an address the invitation does not name", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member" },
      owner.id,
      workspace.id,
      "rid-invite-18",
    );
    const token = created.body.result.token;
    const refused = await acceptInviteRoute(
      fx.db,
      { email: "someone-else@skilit.example", password: "guest-password-01" },
      jsonRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {}),
      token,
      "rid-invite-19",
    );
    assert.equal(refused.status, 404);
    const users = await fx.db.query("select count(*)::int as n from users");
    assert.equal(Number(users.rows[0].n), 2, "no account was created");
  } finally {
    await fx.db.close();
  }
});

test("a signed-in holder joins the workspace as themselves", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const guest = await signUp(fx.db, {
      email: "guest@skilit.example",
      password: "guest-password-01",
    });
    const session = await fx.db.transaction((tx) => createSession(tx, guest.id));
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member" },
      owner.id,
      workspace.id,
      "rid-invite-20",
    );
    const token = created.body.result.token;
    const accepted = await acceptInviteRoute(
      fx.db,
      {},
      cookieRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, session.token, {
        method: "POST",
      }),
      token,
      "rid-invite-21",
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.result.membership.userId, guest.id);
    assert.equal(accepted.body.result.membership.role, "member");
  } finally {
    await fx.db.close();
  }
});

test("accepting an invitation from another origin is refused", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member" },
      owner.id,
      workspace.id,
      "rid-invite-22",
    );
    const token = created.body.result.token;
    const refused = await acceptInviteRoute(
      fx.db,
      { email: "guest@skilit.example", password: "guest-password-01" },
      jsonRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {}, {
        headers: { origin: "http://evil.example" },
      }),
      token,
      "rid-invite-23",
    );
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error.code, "INVALID_INPUT");
  } finally {
    await fx.db.close();
  }
});
