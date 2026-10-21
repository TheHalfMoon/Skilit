import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../../../packages/db/src/db.ts";
import { migrateUp } from "../../../packages/db/src/migrate.ts";
import { createSession, signUp } from "../../../packages/db/src/auth.ts";
import {
  listSessionsRoute,
  revokeOtherSessionsRoute,
  revokeSessionRoute,
  SESSION_COOKIE_NAME,
} from "../lib/session.ts";

const ORIGIN = "http://localhost:3103";

function httpRequest(path, options = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: options.method ?? "GET",
    headers: options.headers ?? {},
    body: options.body,
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

async function account(db, email) {
  const user = await signUp(db, { email, password: "owner-password-01" });
  const created = await db.transaction((tx) => createSession(tx, user.id));
  return { user, session: created.session, token: created.token };
}

test("listing sessions answers only the caller's own sessions", async () => {
  const fx = await fixture();
  try {
    const mine = await account(fx.db, "mine@skilit.example");
    const theirs = await account(fx.db, "theirs@skilit.example");

    const listed = await listSessionsRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", mine.token),
      "rid-list-1",
    );
    assert.equal(listed.status, 200);
    const sessions = listed.body.result.sessions;
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, mine.session.id);
    assert.equal(listed.body.result.currentSessionId, mine.session.id);
    assert.ok(
      sessions.every((entry) => entry.id !== theirs.session.id),
      "another account's session must not be listed",
    );
    // The token is never part of the answer.
    assert.equal(JSON.stringify(listed.body).includes(mine.token), false);
  } finally {
    await fx.db.close();
  }
});

test("listing sessions without a credential is unauthenticated", async () => {
  const fx = await fixture();
  try {
    const listed = await listSessionsRoute(fx.db, httpRequest("/api/v1/auth/sessions"), "rid-list-2");
    assert.equal(listed.status, 401);
    assert.equal(listed.body.error.code, "UNAUTHENTICATED");
  } finally {
    await fx.db.close();
  }
});

test("revoking one session ends it and leaves the caller signed in", async () => {
  const fx = await fixture();
  try {
    const { user, session, token } = await account(fx.db, "owner@skilit.example");
    const other = await fx.db.transaction((tx) => createSession(tx, user.id));

    const revoked = await revokeSessionRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", token, { method: "DELETE" }),
      other.session.id,
      "rid-revoke-1",
    );
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.result.revoked, true);
    assert.equal(revoked.body.result.signedOut, false);

    const listed = await listSessionsRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", token),
      "rid-revoke-2",
    );
    const row = listed.body.result.sessions.find((entry) => entry.id === other.session.id);
    assert.equal(row.live, false);
    assert.equal(row.revokedAt !== null, true);
    assert.equal(listed.body.result.sessions.find((entry) => entry.id === session.id).live, true);
  } finally {
    await fx.db.close();
  }
});

test("revoking a session that belongs to another account is not found", async () => {
  const fx = await fixture();
  try {
    const mine = await account(fx.db, "mine@skilit.example");
    const theirs = await account(fx.db, "theirs@skilit.example");

    const revoked = await revokeSessionRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", mine.token, { method: "DELETE" }),
      theirs.session.id,
      "rid-revoke-3",
    );
    assert.equal(revoked.status, 404);
    assert.equal(revoked.body.error.code, "FORBIDDEN_OR_NOT_FOUND");

    // The foreign session still works: the attempt was a no-op.
    const listed = await listSessionsRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", theirs.token),
      "rid-revoke-4",
    );
    assert.equal(listed.body.result.sessions[0].id, theirs.session.id);
  } finally {
    await fx.db.close();
  }
});

test("an unknown session id is answered like a foreign one", async () => {
  const fx = await fixture();
  try {
    const mine = await account(fx.db, "mine@skilit.example");
    const theirs = await account(fx.db, "theirs@skilit.example");

    const foreign = await revokeSessionRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", mine.token, { method: "DELETE" }),
      theirs.session.id,
      "rid-revoke-5",
    );
    const unknown = await revokeSessionRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", mine.token, { method: "DELETE" }),
      "00000000-0000-4000-8000-000000000000",
      "rid-revoke-6",
    );
    // The two absences must be indistinguishable in every field, so the
    // answer cannot be used to probe which session ids are real.
    assert.equal(foreign.status, unknown.status);
    assert.equal(foreign.body.error.code, unknown.body.error.code);
    assert.equal(foreign.body.error.message, unknown.body.error.message);
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error.code, "FORBIDDEN_OR_NOT_FOUND");
  } finally {
    await fx.db.close();
  }
});

test("revoking the caller's own session signs that browser out", async () => {
  const fx = await fixture();
  try {
    const { session, token } = await account(fx.db, "owner@skilit.example");
    const revoked = await revokeSessionRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", token, { method: "DELETE" }),
      session.id,
      "rid-revoke-6",
    );
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.result.signedOut, true);
    assert.ok(typeof revoked.setCookie === "string", "the cookie is cleared");
    assert.ok(revoked.setCookie.includes("Max-Age=0"));
  } finally {
    await fx.db.close();
  }
});

test("signing out everywhere else keeps the caller's session", async () => {
  const fx = await fixture();
  try {
    const { user, session, token } = await account(fx.db, "owner@skilit.example");
    const other = await fx.db.transaction((tx) => createSession(tx, user.id));

    const revoked = await revokeOtherSessionsRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", token, { method: "DELETE" }),
      "rid-revoke-7",
    );
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.result.revoked, 1);
    assert.equal(revoked.body.result.signedOut, false);

    const listed = await listSessionsRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", token),
      "rid-revoke-8",
    );
    assert.equal(listed.body.result.sessions.find((entry) => entry.id === session.id).live, true);
    assert.equal(listed.body.result.sessions.find((entry) => entry.id === other.session.id).live, false);
  } finally {
    await fx.db.close();
  }
});

test("a cookie-authenticated session change without a matching origin is refused", async () => {
  const fx = await fixture();
  try {
    const { user, token } = await account(fx.db, "owner@skilit.example");
    const other = await fx.db.transaction((tx) => createSession(tx, user.id));

    const refused = await revokeSessionRoute(
      fx.db,
      httpRequest("/api/v1/auth/sessions", {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, origin: "http://evil.example" },
      }),
      other.session.id,
      "rid-revoke-9",
    );
    assert.equal(refused.status, 400);
    assert.equal(refused.body.error.code, "INVALID_INPUT");

    // The bulk route carries the same ambient authority, so it must
    // refuse a mismatched origin in exactly the same way.
    const refusedBulk = await revokeOtherSessionsRoute(
      fx.db,
      httpRequest("/api/v1/auth/sessions", {
        method: "DELETE",
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, origin: "http://evil.example" },
      }),
      "rid-revoke-10",
    );
    assert.equal(refusedBulk.status, 400);
    assert.equal(refusedBulk.body.error.code, "INVALID_INPUT");

    // Neither refusal revoked anything.
    const listed = await listSessionsRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", token),
      "rid-revoke-11",
    );
    assert.equal(listed.body.result.sessions.find((entry) => entry.id === other.session.id).live, true);
  } finally {
    await fx.db.close();
  }
});

test("a database failure answers an opaque failure envelope, not a signed-out caller", async () => {
  const fx = await fixture();
  try {
    const { token } = await account(fx.db, "owner@skilit.example");
    const broken = {
      query: async () => {
        throw new Error("database is unavailable");
      },
      transaction: async () => {
        throw new Error("database is unavailable");
      },
    };

    const listed = await listSessionsRoute(
      broken,
      cookieRequest("/api/v1/auth/sessions", token),
      "rid-fail-1",
    );
    assert.equal(listed.status, 500);
    assert.equal(listed.body.error.code, "INTERNAL_OPAQUE");
    assert.equal(typeof listed.body.request_id, "string");

    const revoked = await revokeSessionRoute(
      broken,
      cookieRequest("/api/v1/auth/sessions", token, { method: "DELETE" }),
      "00000000-0000-4000-8000-000000000000",
      "rid-fail-2",
    );
    assert.equal(revoked.status, 500);
    assert.equal(revoked.body.error.code, "INTERNAL_OPAQUE");
    assert.equal(typeof revoked.body.request_id, "string");

    const revokedOthers = await revokeOtherSessionsRoute(
      broken,
      cookieRequest("/api/v1/auth/sessions", token, { method: "DELETE" }),
      "rid-fail-3",
    );
    assert.equal(revokedOthers.status, 500);
    assert.equal(revokedOthers.body.error.code, "INTERNAL_OPAQUE");
    assert.equal(typeof revokedOthers.body.request_id, "string");
  } finally {
    await fx.db.close();
  }
});

test("revoking a session twice keeps the first revocation and still answers 200", async () => {
  const fx = await fixture();
  try {
    const { user, token } = await account(fx.db, "owner@skilit.example");
    const other = await fx.db.transaction((tx) => createSession(tx, user.id));

    const first = await revokeSessionRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", token, { method: "DELETE" }),
      other.session.id,
      "rid-retry-1",
    );
    assert.equal(first.status, 200);
    const listed = await listSessionsRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", token),
      "rid-retry-2",
    );
    const revokedAt = listed.body.result.sessions.find((entry) => entry.id === other.session.id)
      .revokedAt;

    // A retry after a timeout must not read as "not found".
    const second = await revokeSessionRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", token, { method: "DELETE" }),
      other.session.id,
      "rid-retry-3",
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.result.revoked, true);
    const relisted = await listSessionsRoute(
      fx.db,
      cookieRequest("/api/v1/auth/sessions", token),
      "rid-retry-4",
    );
    const entry = relisted.body.result.sessions.find((item) => item.id === other.session.id);
    assert.equal(entry.revokedAt, revokedAt, "the first revocation time is kept");
    assert.equal(entry.live, false);
  } finally {
    await fx.db.close();
  }
});
