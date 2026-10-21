import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateUp } from "../src/migrate.ts";
import {
  AuthError,
  createSession,
  listAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
  signUp,
  validateSession,
} from "../src/auth.ts";

async function fixtureDb() {
  const db = await openDatabase();
  await migrateUp(db);
  return db;
}

/** A user with one extra session on top of the one sign-up created. */
async function account(db, email) {
  const user = await signUp(db, { email, password: "correct-horse-01" });
  const created = await db.transaction((tx) => createSession(tx, user.id));
  return { user, session: created.session, token: created.token };
}

function isInvalidSession(error) {
  return error instanceof AuthError && error.code === "auth/invalid-session";
}

test("a user sees only their own sessions", async () => {
  const db = await fixtureDb();
  try {
    const first = await account(db, "first@skilit.example");
    const second = await account(db, "second@skilit.example");

    const mine = await db.transaction((tx) => listAccountSessions(tx, first.user.id));
    const theirs = await db.transaction((tx) => listAccountSessions(tx, second.user.id));

    // One session per account: the one this helper created.
    assert.equal(mine.length, 1);
    assert.equal(theirs.length, 1);
    assert.ok(mine.every((session) => session.id !== second.session.id));
    assert.ok(theirs.every((session) => session.id !== first.session.id));
  } finally {
    await db.close();
  }
});

test("revoking one session locks that session out and leaves the others live", async () => {
  const db = await fixtureDb();
  try {
    const { user, session, token } = await account(db, "owner@skilit.example");
    const other = await db.transaction((tx) => createSession(tx, user.id));

    const revoked = await db.transaction((tx) => revokeAccountSession(tx, user.id, other.session.id));
    assert.equal(revoked, true);

    await assert.rejects(() => validateSession(db, other.token), isInvalidSession);
    // The session that was not revoked still works.
    const still = await validateSession(db, token);
    assert.equal(still.user.id, user.id);

    const listed = await db.transaction((tx) => listAccountSessions(tx, user.id));
    const revokedRow = listed.find((row) => row.id === other.session.id);
    assert.equal(revokedRow?.live, false);
    assert.notEqual(revokedRow?.revokedAt, null);
    assert.equal(listed.find((row) => row.id === session.id)?.live, true);
  } finally {
    await db.close();
  }
});

test("revoking a session that belongs to another account changes nothing", async () => {
  const db = await fixtureDb();
  try {
    const mine = await account(db, "mine@skilit.example");
    const theirs = await account(db, "theirs@skilit.example");

    const revoked = await db.transaction((tx) =>
      revokeAccountSession(tx, mine.user.id, theirs.session.id),
    );
    assert.equal(revoked, false, "a foreign session must not be revoked");

    // The foreign session still works: the attempt was a no-op.
    const foreign = await validateSession(db, theirs.token);
    assert.equal(foreign.user.id, theirs.user.id);
  } finally {
    await db.close();
  }
});

test("an unknown session id and a foreign session id are the same absence", async () => {
  const db = await fixtureDb();
  try {
    const mine = await account(db, "mine@skilit.example");
    const unknown = await db.transaction((tx) =>
      revokeAccountSession(tx, mine.user.id, "00000000-0000-4000-8000-000000000000"),
    );
    const malformed = await db.transaction((tx) => revokeAccountSession(tx, mine.user.id, "not-a-uuid"));
    assert.equal(unknown, false);
    assert.equal(malformed, false, "a malformed id must fail closed as absent");
  } finally {
    await db.close();
  }
});

test("revoking every other session keeps the caller's own session live", async () => {
  const db = await fixtureDb();
  try {
    const { user, session, token } = await account(db, "owner@skilit.example");
    const second = await db.transaction((tx) => createSession(tx, user.id));
    const third = await db.transaction((tx) => createSession(tx, user.id));

    const revoked = await db.transaction((tx) => revokeOtherAccountSessions(tx, user.id, session.id));
    assert.equal(revoked, 2, "every session but the caller's own is revoked");

    const mine = await validateSession(db, token);
    assert.equal(mine.user.id, user.id);
    await assert.rejects(() => validateSession(db, second.token), isInvalidSession);
    await assert.rejects(() => validateSession(db, third.token), isInvalidSession);
  } finally {
    await db.close();
  }
});

test("revoking the same session twice keeps the first revocation time", async () => {
  const db = await fixtureDb();
  try {
    const { user, session } = await account(db, "owner@skilit.example");
    const other = await db.transaction((tx) => createSession(tx, user.id));

    assert.equal(
      await db.transaction((tx) => revokeAccountSession(tx, user.id, other.session.id)),
      true,
    );
    const listed = await db.transaction((tx) => listAccountSessions(tx, user.id));
    const firstRevokedAt = listed.find((row) => row.id === other.session.id).revokedAt;
    assert.notEqual(firstRevokedAt, null);

    // A second revoke is a no-op that still reports the session as revoked,
    // so a retry after a timeout does not read as "not found".
    assert.equal(
      await db.transaction((tx) => revokeAccountSession(tx, user.id, other.session.id)),
      true,
    );
    const relisted = await db.transaction((tx) => listAccountSessions(tx, user.id));
    const entry = relisted.find((row) => row.id === other.session.id);
    assert.equal(entry.revokedAt, firstRevokedAt, "the first revocation time is kept");
    assert.equal(entry.live, false);
    assert.ok(session.id);
  } finally {
    await db.close();
  }
});

test("a malformed keeper id leaves the other sessions untouched", async () => {
  const db = await fixtureDb();
  try {
    const { user, session, token } = await account(db, "owner@skilit.example");
    const other = await db.transaction((tx) => createSession(tx, user.id));

    const revoked = await db.transaction((tx) =>
      revokeOtherAccountSessions(tx, user.id, "not-a-uuid"),
    );
    assert.equal(revoked, 0, "a malformed keeper id fails closed");

    // Nothing was revoked: both sessions still work.
    assert.equal((await validateSession(db, token)).user.id, user.id);
    assert.equal((await validateSession(db, other.token)).user.id, user.id);
    assert.ok(session.id);
  } finally {
    await db.close();
  }
});

test("a session that has expired is not live but is not revoked", async () => {
  const db = await fixtureDb();
  try {
    const { user } = await account(db, "owner@skilit.example");
    // A session created with a backdated clock, so it is genuinely past
    // its expiry while still present in the table.
    const expired = await db.transaction((tx) =>
      createSession(tx, user.id, {
        ttlSeconds: 60,
        now: new Date(Date.now() - 120_000),
      }),
    );

    const listed = await db.transaction((tx) => listAccountSessions(tx, user.id));
    const entry = listed.find((row) => row.id === expired.session.id);
    assert.ok(entry, "an expired session is still listed");
    assert.equal(entry.live, false, "an expired session is not live");
    assert.equal(entry.revokedAt, null, "an expired session is not revoked");

    // The boundary: exactly at the expiry the session is no longer live.
    const expiry = Date.parse(entry.expiresAt);
    const atExpiry = await db.transaction((tx) =>
      listAccountSessions(tx, user.id, new Date(expiry)),
    );
    assert.equal(
      atExpiry.find((row) => row.id === expired.session.id).live,
      false,
      "a session is not live at the instant it expires",
    );
    const justBefore = await db.transaction((tx) =>
      listAccountSessions(tx, user.id, new Date(expiry - 1)),
    );
    assert.equal(
      justBefore.find((row) => row.id === expired.session.id).live,
      true,
      "a session is live one millisecond before it expires",
    );
  } finally {
    await db.close();
  }
});

test("the bulk revoke counts only sessions that could still sign in", async () => {
  const db = await fixtureDb();
  try {
    const { user, session, token } = await account(db, "owner@skilit.example");
    const live = await db.transaction((tx) => createSession(tx, user.id));
    const expired = await db.transaction((tx) =>
      createSession(tx, user.id, {
        ttlSeconds: 60,
        now: new Date(Date.now() - 120_000),
      }),
    );

    const revoked = await db.transaction((tx) => revokeOtherAccountSessions(tx, user.id, session.id));
    assert.equal(revoked, 1, "an expired session is not counted as a locked-out browser");
    assert.equal((await validateSession(db, token)).user.id, user.id);
    await assert.rejects(() => validateSession(db, live.token), isInvalidSession);
    assert.ok(expired.session.id);
  } finally {
    await db.close();
  }
});

test("a listed session reports its state without the token", async () => {
  const db = await fixtureDb();
  try {
    const { user, session } = await account(db, "owner@skilit.example");
    const listed = await db.transaction((tx) => listAccountSessions(tx, user.id));
    const row = listed.find((entry) => entry.id === session.id);
    assert.ok(row, "the session must be listed");
    assert.equal(typeof row.createdAt, "string");
    assert.equal(typeof row.expiresAt, "string");
    assert.equal(row.revokedAt, null);
    assert.equal(row.live, true);
    assert.ok(!("token" in row), "the token must never be listed");
    assert.ok(!("tokenHash" in row), "the token hash must never be listed");
    assert.ok(!("token_hash" in row), "the token hash must never be listed");
  } finally {
    await db.close();
  }
});
