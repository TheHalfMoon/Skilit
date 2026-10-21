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

    // The roster is readable by any member, and it says which role the
    // caller holds, so the interface knows what the caller may do.
    const members = await listMembersRoute(fx.db, member.id, workspace.id, "rid-invite-7");
    assert.equal(members.status, 200);
    assert.equal(members.body.result.members.length, 2);
    assert.equal(members.body.result.viewerRole, "member");
    const addresses = members.body.result.members.map((entry) => entry.email);
    assert.ok(addresses.includes("owner@skilit.example"));
    assert.ok(addresses.includes("member@skilit.example"));
  } finally {
    await fx.db.close();
  }
});

test("an operator is told its own role on the roster", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const members = await listMembersRoute(fx.db, owner.id, workspace.id, "rid-invite-7b");
    assert.equal(members.status, 200);
    assert.equal(members.body.result.viewerRole, "owner");
  } finally {
    await fx.db.close();
  }
});

test("an operator may choose how long an invitation lives", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member", ttlSeconds: 3600 },
      owner.id,
      workspace.id,
      "rid-invite-7c",
    );
    assert.equal(created.status, 201);
    const expiresAt = new Date(created.body.result.invite.expiresAt).getTime();
    const now = Date.now();
    const lifetime = (expiresAt - now) / 1000;
    assert.ok(
      lifetime > 3000 && lifetime <= 3600,
      `the invitation must live for the requested hour, saw ${lifetime} seconds`,
    );
  } finally {
    await fx.db.close();
  }
});

test("an invitation request that names an impossible lifetime is refused", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const refused = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member", ttlSeconds: 10 },
      owner.id,
      workspace.id,
      "rid-invite-7d",
    );
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error.code, "INVALID_INPUT");
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

test("a malformed address or a short password is a bad request, not an absence", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member" },
      owner.id,
      workspace.id,
      "rid-invite-24",
    );
    const token = created.body.result.token;
    const badEmail = await acceptInviteRoute(
      fx.db,
      { email: "not-an-address", password: "guest-password-01" },
      jsonRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {}),
      token,
      "rid-invite-25",
    );
    assert.equal(badEmail.status, 400, "a malformed address is the caller's fault");
    assert.equal(badEmail.body.error.code, "INVALID_INPUT");

    const badPassword = await acceptInviteRoute(
      fx.db,
      { email: "guest@skilit.example", password: "short" },
      jsonRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {}),
      token,
      "rid-invite-26",
    );
    assert.equal(badPassword.status, 400, "a short password is the caller's fault");
    assert.equal(badPassword.body.error.code, "INVALID_INPUT");
  } finally {
    await fx.db.close();
  }
});

test("an address that already has an account is refused without saying so", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    await signUp(fx.db, {
      email: "guest@skilit.example",
      password: "guest-password-01",
    });
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member" },
      owner.id,
      workspace.id,
      "rid-invite-27",
    );
    const token = created.body.result.token;
    const refused = await acceptInviteRoute(
      fx.db,
      { email: "guest@skilit.example", password: "another-password-01" },
      jsonRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {}),
      token,
      "rid-invite-28",
    );
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error.code, "INVALID_INPUT");
    // The answer never confirms that the address has an account.
    const message = String(refused.body.error.message ?? "").toLowerCase();
    assert.ok(
      !message.includes("already registered") && !message.includes("already exists"),
      `the answer must not confirm that the address has an account: ${message}`,
    );
  } finally {
    await fx.db.close();
  }
});

test("a signed-in stranger may not take the seat of an invited address", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const stranger = await signUp(fx.db, {
      email: "stranger@skilit.example",
      password: "stranger-password-01",
    });
    const session = await fx.db.transaction((tx) => createSession(tx, stranger.id));
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "owner" },
      owner.id,
      workspace.id,
      "rid-invite-29",
    );
    const token = created.body.result.token;
    const refused = await acceptInviteRoute(
      fx.db,
      {},
      cookieRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, session.token, {
        method: "POST",
      }),
      token,
      "rid-invite-30",
    );
    assert.equal(refused.status, 404, "a stranger is refused as an absence");
    assert.equal(refused.body.error.code, "FORBIDDEN_OR_NOT_FOUND");
    const roster = await listMembersRoute(fx.db, owner.id, workspace.id, "rid-invite-31");
    assert.equal(roster.body.result.members.length, 2, "no membership was written");
  } finally {
    await fx.db.close();
  }
});

test("a spent invitation reads as an absence, whatever the caller is", async () => {
  const fx = await fixture();
  try {
    const { owner, workspace } = await operator(fx.db);
    const created = await createInviteRoute(
      fx.db,
      { email: "guest@skilit.example", role: "member" },
      owner.id,
      workspace.id,
      "rid-invite-32",
    );
    const token = created.body.result.token;
    const first = await acceptInviteRoute(
      fx.db,
      { email: "guest@skilit.example", password: "guest-password-01" },
      jsonRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {}),
      token,
      "rid-invite-33",
    );
    assert.equal(first.status, 201);
    const again = await acceptInviteRoute(
      fx.db,
      { email: "guest@skilit.example", password: "guest-password-01" },
      jsonRequest(`/api/v1/invites/${encodeURIComponent(token)}/accept`, {}),
      token,
      "rid-invite-34",
    );
    assert.equal(again.status, 404, "a spent invitation is an absence");
    assert.equal(again.body.error.code, "FORBIDDEN_OR_NOT_FOUND");
  } finally {
    await fx.db.close();
  }
});
