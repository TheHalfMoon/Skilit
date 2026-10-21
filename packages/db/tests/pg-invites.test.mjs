import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateUp, migrateDown } from "../src/migrate.ts";
import { signUp, hashToken } from "../src/auth.ts";
import { createWorkspaceTx } from "../src/workspaces.ts";
import {
  acceptInvite,
  createInvite,
  listWorkspaceRoster,
  redeemInvite,
  revokeInvite,
} from "../src/invites.ts";

const connectionString = process.env.SKILIT_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);

/** Never run destructive migrations against a non-fixture database. */
function fixtureGuard() {
  if (!connectionString || process.env.SKILIT_DB_TEST_CONFIRM !== "yes") {
    throw new Error("Explicit local fixture guard required");
  }
  const url = new URL(connectionString);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username !== "skilit_test" ||
    url.pathname !== "/skilit_test"
  ) {
    throw new Error("Refusing to mutate a non-fixture PostgreSQL database");
  }
}

function isForbidden(error) {
  return error?.code === "auth/forbidden";
}

test("real PostgreSQL lets exactly one of two racing redemptions take the seat", {
  skip: !enabled,
  timeout: 30000,
}, async () => {
  fixtureGuard();
  const db = await openDatabase({ connectionString });
  const other = await openDatabase({ connectionString });
  try {
    await migrateUp(db);
    const owner = await signUp(db, {
      email: "pg-invites-owner@skilit.example",
      password: "pg-invites-01",
    });
    const space = await createWorkspaceTx(db, {
      name: "PG invitations",
      ownerId: owner.id,
    });
    const { token } = await createInvite(db, {
      workspaceId: space.workspace.id,
      email: "pg-invites-guest@skilit.example",
      role: "member",
      actorId: owner.id,
    });

    // Two separate connections redeem the same token at the same time.
    const outcomes = await Promise.all([
      redeemInvite(db, {
        token,
        email: "pg-invites-guest@skilit.example",
        password: "pg-invites-guest-01",
      }).then(
        () => "redeemed",
        (error) => (isForbidden(error) ? "refused" : "failed"),
      ),
      redeemInvite(other, {
        token,
        email: "pg-invites-guest@skilit.example",
        password: "pg-invites-guest-01",
      }).then(
        () => "redeemed",
        (error) => (isForbidden(error) ? "refused" : "failed"),
      ),
    ]);
    assert.deepEqual(
      outcomes.sort(),
      ["redeemed", "refused"],
      `exactly one redemption must take the seat, saw ${outcomes.join(", ")}`,
    );

    const row = await db.query(
      "select accepted_at from workspace_invites where token_hash = $1",
      [hashToken(token)],
    );
    assert.notEqual(row.rows[0].accepted_at, null, "the invitation is accepted once");

    const roster = await listWorkspaceRoster(db, {
      workspaceId: space.workspace.id,
      actorId: owner.id,
    });
    assert.equal(roster.length, 2, "the invited person joined exactly once");
  } finally {
    await other.close();
    await migrateDown(db);
    await db.close();
  }
});

test("real PostgreSQL never leaves an invitation both accepted and revoked", {
  skip: !enabled,
  timeout: 30000,
}, async () => {
  fixtureGuard();
  const db = await openDatabase({ connectionString });
  const other = await openDatabase({ connectionString });
  try {
    await migrateUp(db);
    const owner = await signUp(db, {
      email: "pg-race-owner@skilit.example",
      password: "pg-race-01",
    });
    const space = await createWorkspaceTx(db, {
      name: "PG invitation race",
      ownerId: owner.id,
    });
    const { invite, token } = await createInvite(db, {
      workspaceId: space.workspace.id,
      email: "pg-race-guest@skilit.example",
      role: "member",
      actorId: owner.id,
    });

    // A revocation and a redemption run at the same time. The row lock
    // on the invitation serialises them, so the invitation can never end
    // up accepted and revoked at the same time.
    const outcomes = await Promise.all([
      revokeInvite(db, {
        workspaceId: space.workspace.id,
        inviteId: invite.id,
        actorId: owner.id,
      }).then(
        () => "revoked",
        () => "refused",
      ),
      redeemInvite(other, {
        token,
        email: "pg-race-guest@skilit.example",
        password: "pg-race-guest-01",
      }).then(
        () => "redeemed",
        (error) => (isForbidden(error) ? "refused" : "failed"),
      ),
    ]);
    assert.ok(
      outcomes.includes("revoked") || outcomes.includes("redeemed"),
      `one of the two must win, saw ${outcomes.join(", ")}`,
    );

    const row = await db.query(
      "select accepted_at, revoked_at from workspace_invites where id = $1",
      [invite.id],
    );
    const accepted = row.rows[0].accepted_at !== null;
    const revoked = row.rows[0].revoked_at !== null;
    assert.ok(
      !(accepted && revoked),
      "an invitation must never be accepted and revoked at the same time",
    );
  } finally {
    await other.close();
    await migrateDown(db);
    await db.close();
  }
});

test("real PostgreSQL lets exactly one of two racing issuances stand", {
  skip: !enabled,
  timeout: 30000,
}, async () => {
  fixtureGuard();
  const db = await openDatabase({ connectionString });
  const other = await openDatabase({ connectionString });
  try {
    await migrateUp(db);
    const owner = await signUp(db, {
      email: "pg-issue-owner@skilit.example",
      password: "pg-issue-01",
    });
    const space = await createWorkspaceTx(db, {
      name: "PG invitation issuance",
      ownerId: owner.id,
    });

    const outcomes = await Promise.all([
      createInvite(db, {
        workspaceId: space.workspace.id,
        email: "pg-issue-guest@skilit.example",
        role: "member",
        actorId: owner.id,
      }).then(
        () => "issued",
        (error) => (error?.code === "auth/invite-exists" ? "refused" : "failed"),
      ),
      createInvite(other, {
        workspaceId: space.workspace.id,
        email: "pg-issue-guest@skilit.example",
        role: "member",
        actorId: owner.id,
      }).then(
        () => "issued",
        (error) => (error?.code === "auth/invite-exists" ? "refused" : "failed"),
      ),
    ]);
    assert.deepEqual(
      outcomes.sort(),
      ["issued", "refused"],
      `exactly one live invitation may stand, saw ${outcomes.join(", ")}`,
    );

    const live = await db.query(
      `select count(*)::int as n from workspace_invites
       where workspace_id = $1 and email = $2
         and accepted_at is null and revoked_at is null`,
      [space.workspace.id, "pg-issue-guest@skilit.example"],
    );
    assert.equal(Number(live.rows[0].n), 1, "one live invitation stands");
  } finally {
    await other.close();
    await migrateDown(db);
    await db.close();
  }
});

test("real PostgreSQL refuses a signed-in stranger who holds the link", {
  skip: !enabled,
  timeout: 30000,
}, async () => {
  fixtureGuard();
  const db = await openDatabase({ connectionString });
  try {
    await migrateUp(db);
    const owner = await signUp(db, {
      email: "pg-stranger-owner@skilit.example",
      password: "pg-stranger-01",
    });
    const space = await createWorkspaceTx(db, {
      name: "PG invitation stranger",
      ownerId: owner.id,
    });
    const stranger = await signUp(db, {
      email: "pg-stranger@skilit.example",
      password: "pg-stranger-02",
    });
    const { token } = await createInvite(db, {
      workspaceId: space.workspace.id,
      email: "pg-invited@skilit.example",
      role: "owner",
      actorId: owner.id,
    });
    await assert.rejects(
      () => acceptInvite(db, { token, userId: stranger.id }),
      isForbidden,
      "a signed-in stranger cannot take the seat",
    );
    const roster = await listWorkspaceRoster(db, {
      workspaceId: space.workspace.id,
      actorId: owner.id,
    });
    assert.equal(roster.length, 1, "no membership was written");
  } finally {
    await migrateDown(db);
    await db.close();
  }
});
