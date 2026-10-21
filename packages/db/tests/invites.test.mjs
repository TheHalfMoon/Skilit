import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateUp } from "../src/migrate.ts";
import { createSession, signUp } from "../src/auth.ts";
import { createWorkspaceTx, listWorkspacesForUser } from "../src/workspaces.ts";
import {
  acceptInvite,
  createInvite,
  listInvites,
  listWorkspaceRoster,
  personalWorkspaceName,
  readInvite,
  redeemInvite,
  revokeInvite,
} from "../src/invites.ts";

async function fixtureDb() {
  const db = await openDatabase();
  await migrateUp(db);
  return db;
}

/** An owner with a workspace, ready to issue invitations. */
async function ownerWithWorkspace(db, email = "owner@skilit.example") {
  const owner = await signUp(db, { email, password: "correct-horse-01" });
  const space = await createWorkspaceTx(db, {
    name: "Operator workspace",
    ownerId: owner.id,
  });
  return { owner, workspace: space.workspace };
}

function isForbidden(error) {
  return error?.code === "auth/forbidden";
}

function isMemberExists(error) {
  return error?.code === "auth/member-exists";
}

function isInviteExists(error) {
  return error?.code === "auth/invite-exists";
}

test("an operator issues an invitation and the token is the only copy", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const { invite, token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "Guest@Skilit.Example",
      role: "member",
      actorId: owner.id,
    });
    assert.equal(invite.email, "guest@skilit.example", "the address is normalised");
    assert.equal(invite.role, "member");
    assert.equal(invite.state, "pending");
    assert.equal(invite.workspaceName, "Operator workspace");
    assert.ok(token.length >= 32, "the raw token is long");

    // The stored value is a hash: the raw token is not readable anywhere.
    const rows = await db.query(
      "select token_hash from workspace_invites where id = $1",
      [invite.id],
    );
    assert.notEqual(rows.rows[0].token_hash, token);
    assert.equal(rows.rows[0].token_hash.length, 64, "a sha-256 hex digest");

    // The token reads as the invitation it names.
    const preview = await readInvite(db, token);
    assert.equal(preview.email, "guest@skilit.example");
    assert.equal(preview.role, "member");
    assert.equal(preview.workspaceName, "Operator workspace");
    assert.equal(preview.state, "pending");
  } finally {
    await db.close();
  }
});

test("the expiry of an invitation is the database's clock", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const ttlSeconds = 3600;
    const { invite } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
      ttlSeconds,
    });
    const clock = await db.query("select now() as at");
    const databaseNow = new Date(clock.rows[0].at).getTime();
    const expiresAt = new Date(invite.expiresAt).getTime();
    const drift = Math.abs(expiresAt - databaseNow - ttlSeconds * 1000);
    assert.ok(
      drift < 5000,
      `the expiry must be the database clock plus the lifetime, drifted ${drift} ms`,
    );
  } finally {
    await db.close();
  }
});

test("an unknown token reads as no invitation at all", async () => {
  const db = await fixtureDb();
  try {
    assert.equal(await readInvite(db, "not-a-real-token"), null);
    assert.equal(await readInvite(db, ""), null);
  } finally {
    await db.close();
  }
});

test("a member may not invite, and an admin may invite only a member", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const guest = await signUp(db, {
      email: "guest@skilit.example",
      password: "correct-horse-01",
    });
    const session = await db.transaction((tx) => createSession(tx, guest.id));

    await assert.rejects(
      () =>
        createInvite(db, {
          workspaceId: workspace.id,
          email: "someone@skilit.example",
          role: "member",
          actorId: guest.id,
        }),
      isForbidden,
      "a non-member cannot invite",
    );

    // An admin may grant member only.
    const admin = await db.transaction((tx) =>
      createSession(tx, owner.id),
    );
    await db.query(
      "update workspace_members set role = 'admin' where workspace_id = $1 and user_id = $2",
      [workspace.id, owner.id],
    );
    await assert.rejects(
      () =>
        createInvite(db, {
          workspaceId: workspace.id,
          email: "someone@skilit.example",
          role: "admin",
          actorId: owner.id,
        }),
      isForbidden,
      "an admin cannot invite another admin",
    );
    assert.ok(admin.session.id);

    const ok = await createInvite(db, {
      workspaceId: workspace.id,
      email: "someone@skilit.example",
      role: "member",
      actorId: owner.id,
    });
    assert.equal(ok.invite.role, "member");
  } finally {
    await db.close();
  }
});

test("an address that is already a member cannot be invited", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    await assert.rejects(
      () =>
        createInvite(db, {
          workspaceId: workspace.id,
          email: "owner@skilit.example",
          role: "member",
          actorId: owner.id,
        }),
      isMemberExists,
    );
  } finally {
    await db.close();
  }
});

test("one live invitation per address per workspace", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
    });
    await assert.rejects(
      () =>
        createInvite(db, {
          workspaceId: workspace.id,
          email: "GUEST@skilit.example",
          role: "member",
          actorId: owner.id,
        }),
      isInviteExists,
      "the same address is refused in a different case",
    );
  } finally {
    await db.close();
  }
});

test("the database itself refuses a second live invitation for one address", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
    });
    // The invariant is not only application code: a row written behind
    // the application's back is refused by the database too.
    await assert.rejects(
      () =>
        db.query(
          `insert into workspace_invites
             (workspace_id, email, role, token_hash, invited_by, expires_at)
           values ($1, $2, 'member', $3, $4, now() + interval '1 hour')`,
          [
            workspace.id,
            "guest@skilit.example",
            "f".repeat(64),
            owner.id,
          ],
        ),
      /unique|duplicate/i,
      "the database refuses the second live invitation",
    );
  } finally {
    await db.close();
  }
});

test("an address may be invited again once the first invitation expired", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const first = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
      ttlSeconds: 300,
    });
    await db.query(
      "update workspace_invites set expires_at = now() - interval '1 second' where id = $1",
      [first.invite.id],
    );
    const second = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
    });
    assert.equal(second.invite.state, "pending");
    // The expired invitation is swept to revoked so the address can be
    // invited again, but it still reads as expired: expiry is checked
    // before revocation.
    assert.equal((await readInvite(db, first.token)).state, "expired");
  } finally {
    await db.close();
  }
});

test("an expired invitation is not revocable and keeps its label", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const { invite, token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
      ttlSeconds: 300,
    });
    await db.query(
      "update workspace_invites set expires_at = now() - interval '1 second' where id = $1",
      [invite.id],
    );
    const revoked = await revokeInvite(db, {
      workspaceId: workspace.id,
      inviteId: invite.id,
      actorId: owner.id,
    });
    assert.equal(revoked, false, "an expired invitation is already terminal");
    assert.equal((await readInvite(db, token)).state, "expired");
  } finally {
    await db.close();
  }
});

test("an invited person redeems the invitation and joins the workspace", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const { token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
    });

    const redeemed = await redeemInvite(db, {
      token,
      email: "guest@skilit.example",
      password: "correct-horse-01",
    });
    assert.equal(redeemed.user.email, "guest@skilit.example");
    assert.equal(redeemed.membership.workspaceId, workspace.id);
    assert.equal(redeemed.membership.role, "member");
    assert.ok(redeemed.session.token.length > 0, "the new account is signed in");

    // The token cannot be redeemed twice.
    await assert.rejects(
      () =>
        redeemInvite(db, {
          token,
          email: "guest@skilit.example",
          password: "correct-horse-01",
        }),
      isForbidden,
    );

    const members = await listWorkspaceRoster(db, {
      workspaceId: workspace.id,
      actorId: owner.id,
    });
    assert.equal(members.length, 2);
  } finally {
    await db.close();
  }
});

test("an invitation may only be redeemed for the address it names", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const { token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
    });
    await assert.rejects(
      () =>
        redeemInvite(db, {
          token,
          email: "someone-else@skilit.example",
          password: "correct-horse-01",
        }),
      isForbidden,
      "another address cannot claim the invitation",
    );
    // The failed attempt created no account.
    const users = await db.query("select count(*)::int as n from users");
    assert.equal(Number(users.rows[0].n), 1);
  } finally {
    await db.close();
  }
});

test("a signed-in person accepts an invitation for an existing account", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const guest = await signUp(db, {
      email: "guest@skilit.example",
      password: "correct-horse-01",
    });
    const { token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "admin",
      actorId: owner.id,
    });
    const accepted = await acceptInvite(db, { token, userId: guest.id });
    assert.equal(accepted.membership.role, "admin");
    assert.equal(accepted.workspaceId, workspace.id);

    await assert.rejects(
      () => acceptInvite(db, { token, userId: guest.id }),
      isForbidden,
      "the invitation is spent",
    );
  } finally {
    await db.close();
  }
});

test("a signed-in stranger may not take the seat of an invited address", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const stranger = await signUp(db, {
      email: "stranger@skilit.example",
      password: "correct-horse-01",
    });
    const { token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "owner",
      actorId: owner.id,
    });
    // The link alone is not the authority: only the invited address may
    // take the seat, so a signed-in stranger is refused.
    await assert.rejects(
      () => acceptInvite(db, { token, userId: stranger.id }),
      isForbidden,
      "a signed-in stranger cannot take the seat",
    );
    const members = await listWorkspaceRoster(db, {
      workspaceId: workspace.id,
      actorId: owner.id,
    });
    assert.equal(members.length, 1, "no membership was written");
    const listed = await listInvites(db, {
      workspaceId: workspace.id,
      actorId: owner.id,
    });
    assert.equal(listed[0].state, "pending", "the invitation is still spendable");
  } finally {
    await db.close();
  }
});

test("a revoked invitation cannot be accepted afterwards", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const guest = await signUp(db, {
      email: "guest@skilit.example",
      password: "correct-horse-01",
    });
    const { invite, token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
    });
    await revokeInvite(db, {
      workspaceId: workspace.id,
      inviteId: invite.id,
      actorId: owner.id,
    });
    // The acceptance is guarded on the revocation, so the row can never
    // end up accepted and revoked at the same time.
    await assert.rejects(
      () => acceptInvite(db, { token, userId: guest.id }),
      isForbidden,
      "a revoked invitation cannot be accepted",
    );
    const row = await db.query(
      "select accepted_at, revoked_at from workspace_invites where id = $1",
      [invite.id],
    );
    assert.equal(row.rows[0].accepted_at, null, "the invitation was not accepted");
    assert.notEqual(row.rows[0].revoked_at, null, "the revocation stands");
  } finally {
    await db.close();
  }
});

test("an expired invitation cannot be accepted afterwards", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const guest = await signUp(db, {
      email: "guest@skilit.example",
      password: "correct-horse-01",
    });
    const { invite, token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
      ttlSeconds: 300,
    });
    await db.query(
      "update workspace_invites set expires_at = now() - interval '1 second' where id = $1",
      [invite.id],
    );
    await assert.rejects(
      () => acceptInvite(db, { token, userId: guest.id }),
      isForbidden,
      "an expired invitation cannot be accepted",
    );
    const row = await db.query(
      "select accepted_at from workspace_invites where id = $1",
      [invite.id],
    );
    assert.equal(row.rows[0].accepted_at, null, "the invitation was not accepted");
  } finally {
    await db.close();
  }
});

test("a revoked invitation stops working at once", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const { invite, token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
    });
    const revoked = await revokeInvite(db, {
      workspaceId: workspace.id,
      inviteId: invite.id,
      actorId: owner.id,
    });
    assert.equal(revoked, true);
    assert.equal(
      await revokeInvite(db, {
        workspaceId: workspace.id,
        inviteId: invite.id,
        actorId: owner.id,
      }),
      false,
      "an invitation is revoked once",
    );
    assert.equal((await readInvite(db, token)).state, "revoked");
    await assert.rejects(
      () => redeemInvite(db, { token, email: "guest@skilit.example", password: "correct-horse-01" }),
      isForbidden,
    );
  } finally {
    await db.close();
  }
});

test("an expired invitation cannot be redeemed", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const { invite, token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
      ttlSeconds: 300,
    });
    await db.query("update workspace_invites set expires_at = now() - interval '1 second' where id = $1", [
      invite.id,
    ]);
    assert.equal((await readInvite(db, token)).state, "expired");
    await assert.rejects(
      () => redeemInvite(db, { token, email: "guest@skilit.example", password: "correct-horse-01" }),
      isForbidden,
    );
  } finally {
    await db.close();
  }
});

test("an invitation stops working when the inviter loses the authority to grant it", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const admin = await signUp(db, {
      email: "admin@skilit.example",
      password: "correct-horse-01",
    });
    await db.query(
      "insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'admin')",
      [workspace.id, admin.id],
    );
    const { token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: admin.id,
    });
    // The admin is demoted to member: the outstanding invitation dies.
    await db.query(
      "update workspace_members set role = 'member' where workspace_id = $1 and user_id = $2",
      [workspace.id, admin.id],
    );
    await assert.rejects(
      () => redeemInvite(db, { token, email: "guest@skilit.example", password: "correct-horse-01" }),
      isForbidden,
      "a demoted inviter's invitation no longer grants access",
    );
  } finally {
    await db.close();
  }
});

test("only an operator may read the invitations of a workspace", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const guest = await signUp(db, {
      email: "guest@skilit.example",
      password: "correct-horse-01",
    });
    await db.query(
      "insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')",
      [workspace.id, guest.id],
    );
    await createInvite(db, {
      workspaceId: workspace.id,
      email: "third@skilit.example",
      role: "member",
      actorId: owner.id,
    });
    const listed = await listInvites(db, {
      workspaceId: workspace.id,
      actorId: owner.id,
    });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].email, "third@skilit.example");

    await assert.rejects(
      () => listInvites(db, { workspaceId: workspace.id, actorId: guest.id }),
      isForbidden,
      "a plain member cannot read the invitation list",
    );
  } finally {
    await db.close();
  }
});

test("the roster carries the address behind every membership", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const guest = await signUp(db, {
      email: "guest@skilit.example",
      password: "correct-horse-01",
    });
    await db.query(
      "insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')",
      [workspace.id, guest.id],
    );
    const roster = await listWorkspaceRoster(db, {
      workspaceId: workspace.id,
      actorId: owner.id,
    });
    assert.equal(roster.length, 2);
    const addresses = roster.map((entry) => entry.email);
    assert.ok(addresses.includes("owner@skilit.example"));
    assert.ok(addresses.includes("guest@skilit.example"));
    // A plain member may read the roster of their own workspace.
    const asMember = await listWorkspaceRoster(db, {
      workspaceId: workspace.id,
      actorId: guest.id,
    });
    assert.equal(asMember.length, 2);
  } finally {
    await db.close();
  }
});

test("an invited person ends up with a workspace of their own that is not named Personal", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    const { token } = await createInvite(db, {
      workspaceId: workspace.id,
      email: "guest@skilit.example",
      role: "member",
      actorId: owner.id,
    });
    const redeemed = await redeemInvite(db, {
      token,
      email: "guest@skilit.example",
      password: "correct-horse-01",
    });
    const spaces = await listWorkspacesForUser(db, redeemed.user.id);
    assert.equal(spaces.length, 2, "the invited person has a workspace of their own");
    const names = spaces.map((space) => space.name);
    // Two workspaces of the same name would be indistinguishable in the
    // workspace picker, so the personal one names its owner.
    assert.equal(new Set(names).size, 2, `the two workspaces must differ: ${names.join(", ")}`);
    assert.ok(
      names.includes(personalWorkspaceName("guest@skilit.example")),
      `the personal workspace must carry its owner's address: ${names.join(", ")}`,
    );
  } finally {
    await db.close();
  }
});

test("an invitation lifetime outside the allowed range is refused", async () => {
  const db = await fixtureDb();
  try {
    const { owner, workspace } = await ownerWithWorkspace(db);
    for (const ttlSeconds of [0, 60, 60 * 60 * 24 * 365]) {
      await assert.rejects(
        () =>
          createInvite(db, {
            workspaceId: workspace.id,
            email: "guest@skilit.example",
            role: "member",
            actorId: owner.id,
            ttlSeconds,
          }),
        (error) => error?.code === "auth/invalid-invite",
        `a lifetime of ${ttlSeconds} seconds is refused`,
      );
    }
  } finally {
    await db.close();
  }
});
