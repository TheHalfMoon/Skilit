import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateDown, migrateUp } from "../src/migrate.ts";
import {
  AUTH_SESSION_MAX_TTL_SECONDS,
  AUTH_SESSION_TTL_SECONDS,
  AuthError,
  createSession,
  getUserById,
  normalizeEmail,
  signIn,
  signOut,
  signUp,
  validateSession,
} from "../src/auth.ts";

const SIX = ["001_sources_products", "002_design_graph", "003_workflows", "004_auth", "005_workspaces", "006_collections_auth", "007_billing", "008_jobs", "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"];

async function fixtureDb() {
  const db = await openDatabase();
  await migrateUp(db);
  return db;
}

test("004 migration applies auth tables and reverses cleanly", async () => {
  const db = await openDatabase();
  try {
    assert.deepEqual(await migrateUp(db), SIX);
    for (const table of ["users", "sessions"]) {
      const check = await db.query("select to_regclass($1) as oid", [`public.${table}`]);
      assert.notEqual(check.rows[0]?.oid, null, `missing table ${table}`);
    }
    assert.deepEqual(await migrateDown(db), [...SIX].reverse());
    assert.deepEqual(await migrateUp(db), SIX);
  } finally {
    await db.close();
  }
});

test("sign-up creates a verified-free user and rejects duplicates case-insensitively", async () => {
  const db = await fixtureDb();
  try {
    const user = await signUp(db, { email: "  Researcher@Skilit.Example ", password: "correct-horse-01" });
    assert.equal(user.email, "researcher@skilit.example");
    assert.equal(user.emailVerifiedAt, null);
    assert.ok(!("password_hash" in user), "password verifier must not leak");
    await assert.rejects(
      () => signUp(db, { email: "RESEARCHER@skilit.example", password: "another-valid-01" }),
      (error) => error instanceof AuthError && error.code === "auth/email-taken",
    );
    const stored = await db.query("select email from users");
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0]?.email, "researcher@skilit.example");
  } finally {
    await db.close();
  }
});

test("sign-up rejects invalid email and weak password fail-closed", async () => {
  const db = await fixtureDb();
  try {
    for (const email of ["", "no-at-sign", "a@b", "x @y.zz", "a@@b.cc", "toolong".repeat(60) + "@x.zz"]) {
      await assert.rejects(
        () => signUp(db, { email, password: "valid-password-01" }),
        (error) => error instanceof AuthError && error.code === "auth/invalid-email",
        `email should be rejected: ${email}`,
      );
    }
    await assert.rejects(
      () => signUp(db, { email: "ok@skilit.example", password: "short" }),
      (error) => error instanceof AuthError && error.code === "auth/invalid-password",
    );
    assert.equal(normalizeEmail("  ADMIN@Skilit.Example "), "admin@skilit.example");
    const count = await db.query("select count(*)::int as n from users");
    assert.equal(count.rows[0]?.n, 0);
  } finally {
    await db.close();
  }
});

test("sign-in returns a single-visible token bound to its sha256", async () => {
  const db = await fixtureDb();
  try {
    await signUp(db, { email: "agent@skilit.example", password: "shared-secret-01" });
    const signed = await signIn(db, { email: "agent@skilit.example", password: "shared-secret-01" });
    assert.equal(typeof signed.token, "string");
    assert.ok(signed.token.length >= 40, "opaque token must carry 256-bit entropy");
    assert.equal(signed.user.email, "agent@skilit.example");
    const expected = createHash("sha256").update(signed.token, "utf8").digest("hex");
    const rows = await db.query("select token_hash from sessions");
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0]?.token_hash, expected);
    const probe = await validateSession(db, signed.token);
    assert.equal(probe.user.id, signed.user.id);
    assert.equal(probe.session.userId, signed.user.id);
  } finally {
    await db.close();
  }
});

test("sign-in failures do not enumerate users", async () => {
  const db = await fixtureDb();
  try {
    await signUp(db, { email: "known@skilit.example", password: "known-password-01" });
    const wrong = await signIn(db, { email: "known@skilit.example", password: "wrong-password-01" }).then(
      () => { throw new Error("wrong password must fail"); },
      (error) => error,
    );
    const unknown = await signIn(db, { email: "nobody@skilit.example", password: "wrong-password-01" }).then(
      () => { throw new Error("unknown email must fail"); },
      (error) => error,
    );
    assert.ok(wrong instanceof AuthError && wrong.code === "auth/invalid-credentials");
    assert.ok(unknown instanceof AuthError && unknown.code === "auth/invalid-credentials");
    assert.equal(String(wrong.message), String(unknown.message));
  } finally {
    await db.close();
  }
});

test("sessions expire, revoke through sign-out, and reject tampering", async () => {
  const db = await fixtureDb();
  try {
    const user = await signUp(db, { email: "expire@skilit.example", password: "expire-password-01" });
    const now = new Date("2026-10-09T00:00:00.000Z");
    const created = await createSession(db, user.id, { ttlSeconds: 60, now });
    await validateSession(db, created.token, new Date("2026-10-09T00:00:59.000Z"));
    await assert.rejects(
      () => validateSession(db, created.token, new Date("2026-10-09T00:01:00.000Z")),
      (error) => error instanceof AuthError && error.code === "auth/invalid-session",
    );
    const live = await signIn(db, { email: "expire@skilit.example", password: "expire-password-01" });
    await signOut(db, live.token);
    await assert.rejects(
      () => validateSession(db, live.token),
      (error) => error instanceof AuthError && error.code === "auth/invalid-session",
    );
    await signOut(db, live.token);
    await assert.rejects(
      () => validateSession(db, live.token.slice(0, -2) + "xx"),
      (error) => error instanceof AuthError && error.code === "auth/invalid-session",
    );
    await assert.rejects(
      () => signOut(db, "never-issued-token"),
      (error) => error instanceof AuthError && error.code === "auth/invalid-session",
    );
    await assert.rejects(
      () => createSession(db, user.id, { ttlSeconds: 30 }),
      (error) => error instanceof AuthError && error.code === "auth/invalid-session",
    );
    await assert.rejects(
      () => createSession(db, user.id, { ttlSeconds: AUTH_SESSION_MAX_TTL_SECONDS + 1 }),
      (error) => error instanceof AuthError && error.code === "auth/invalid-session",
    );
    const standard = await createSession(db, user.id);
    const lifetime =
      Date.parse(standard.session.expiresAt) - Date.parse(standard.session.createdAt);
    assert.ok(
      Math.abs(lifetime - AUTH_SESSION_TTL_SECONDS * 1000) < 60_000,
      `default session lifetime must be ~30 days, got ${lifetime}ms`,
    );
  } finally {
    await db.close();
  }
});

test("sessions are isolated between users and cascade on user delete", async () => {
  const db = await fixtureDb();
  try {
    const alice = await signUp(db, { email: "alice@skilit.example", password: "alice-password-01" });
    const bob = await signUp(db, { email: "bob@skilit.example", password: "bob-password-01!!" });
    const aliceSession = await signIn(db, { email: "alice@skilit.example", password: "alice-password-01" });
    const probe = await validateSession(db, aliceSession.token);
    assert.equal(probe.user.id, alice.id);
    assert.notEqual(probe.user.id, bob.id);
    assert.equal((await getUserById(db, bob.id)).email, "bob@skilit.example");
    await assert.rejects(
      () => getUserById(db, "00000000-0000-0000-0000-000000000000"),
      (error) => error instanceof AuthError && error.code === "auth/user-not-found",
    );
    await db.query("delete from users where id = $1", [alice.id]);
    await assert.rejects(
      () => validateSession(db, aliceSession.token),
      (error) => error instanceof AuthError && error.code === "auth/invalid-session",
    );
  } finally {
    await db.close();
  }
});

test("unknown and malformed user references fail closed as not-found", async () => {
  const db = await fixtureDb();
  try {
    await assert.rejects(
      () => createSession(db, "11111111-2222-4333-8444-555555555555"),
      (error) => error instanceof AuthError && error.code === "auth/user-not-found",
    );
    await assert.rejects(
      () => getUserById(db, "not-a-uuid"),
      (error) => error instanceof AuthError && error.code === "auth/user-not-found",
    );
  } finally {
    await db.close();
  }
});

test("password verifiers are salted and never stored plaintext", async () => {
  const db = await fixtureDb();
  try {
    await signUp(db, { email: "one@skilit.example", password: "same-password-01" });
    await signUp(db, { email: "two@skilit.example", password: "same-password-01" });
    const rows = await db.query("select password_hash from users order by email");
    const first = String(rows.rows[0]?.password_hash);
    const second = String(rows.rows[1]?.password_hash);
    assert.ok(first.startsWith("scrypt$16384$8$1$"));
    assert.ok(second.startsWith("scrypt$16384$8$1$"));
    assert.notEqual(first, second);
    assert.ok(!first.includes("same-password-01") && !second.includes("same-password-01"));
  } finally {
    await db.close();
  }
});

test("concurrent duplicate sign-ups converge to one user", async () => {
  const db = await fixtureDb();
  try {
    const attempts = await Promise.allSettled([
      signUp(db, { email: "race@skilit.example", password: "race-password-01" }),
      signUp(db, { email: "RACE@skilit.example", password: "race-password-02" }),
    ]);
    const fulfilled = attempts.filter((outcome) => outcome.status === "fulfilled");
    const rejected = attempts.filter((outcome) => outcome.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const reason = rejected[0];
    assert.ok(
      reason !== undefined && reason.status === "rejected" &&
      reason.reason instanceof AuthError && reason.reason.code === "auth/email-taken",
    );
    const count = await db.query("select count(*)::int as n from users where lower(email) = 'race@skilit.example'");
    assert.equal(count.rows[0]?.n, 1);
  } finally {
    await db.close();
  }
});
