import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateDown, migrateUp } from "../src/migrate.ts";
import { AuthError, signUp } from "../src/auth.ts";
import {
  addMember,
  createWorkspace,
  getMembership,
  listMembers,
  listWorkspacesForUser,
  removeMember,
  requireRole,
  setMemberRole,
} from "../src/workspaces.ts";

const SIX = [
  "001_sources_products",
  "002_design_graph",
  "003_workflows",
  "004_auth",
  "005_workspaces",
  "006_collections_auth",
  "007_billing",
  "008_jobs",
  "009_lens_build_kit_runs",
  "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites",
];

async function fixtureDb() {
  const db = await openDatabase();
  await migrateUp(db);
  return db;
}

async function users(db, count) {
  const created = [];
  for (let index = 0; index < count; index += 1) {
    created.push(
      await signUp(db, {
        email: `workspace-user-${index}@skilit.example`,
        password: "workspace-password-01",
      }),
    );
  }
  return created;
}

test("005 migration applies workspace tables and reverses cleanly", async () => {
  const db = await openDatabase();
  try {
    assert.deepEqual(await migrateUp(db), SIX);
    for (const table of ["workspaces", "workspace_members"]) {
      const check = await db.query("select to_regclass($1) as oid", [`public.${table}`]);
      assert.notEqual(check.rows[0]?.oid, null, `missing table ${table}`);
    }
    assert.deepEqual(await migrateDown(db), [...SIX].reverse());
    assert.deepEqual(await migrateUp(db), SIX);
  } finally {
    await db.close();
  }
});

test("workspace creation is atomic and names are validated", async () => {
  const db = await fixtureDb();
  try {
    const [owner] = await users(db, 1);
    const created = await createWorkspace(db, { name: "  Design Research  ", ownerId: owner.id });
    assert.equal(created.workspace.name, "Design Research");
    assert.equal(created.workspace.createdBy, owner.id);
    assert.equal(created.membership.role, "owner");
    assert.equal(await getMembership(db, created.workspace.id, owner.id), "owner");
    for (const name of ["", "   ", "x".repeat(201)]) {
      await assert.rejects(
        () => createWorkspace(db, { name, ownerId: owner.id }),
        (error) => error instanceof AuthError && error.code === "auth/invalid-workspace",
      );
    }
    await assert.rejects(
      () => createWorkspace(db, { name: "Ghost", ownerId: "00000000-0000-0000-0000-000000000000" }),
      (error) => error instanceof AuthError && error.code === "auth/user-not-found",
    );
    const count = await db.query("select count(*)::int as n from workspaces where name = 'Ghost'");
    assert.equal(count.rows[0]?.n, 0);
  } finally {
    await db.close();
  }
});

test("denial matrix is uniform: outsiders and forged workspaces see one error", async () => {
  const db = await fixtureDb();
  try {
    const [owner, outsider] = await users(db, 2);
    const created = await createWorkspace(db, { name: "Private", ownerId: owner.id });
    const forged = "00000000-0000-0000-0000-000000000000";
    const denials = [];
    for (const attempt of [
      () => requireRole(db, created.workspace.id, outsider.id, "member"),
      () => requireRole(db, forged, outsider.id, "member"),
      () => listMembers(db, created.workspace.id, outsider.id),
      () => addMember(db, { workspaceId: created.workspace.id, userId: outsider.id, role: "member", actorId: outsider.id }),
      () => removeMember(db, { workspaceId: created.workspace.id, userId: owner.id, actorId: outsider.id }),
      () => setMemberRole(db, { workspaceId: created.workspace.id, userId: owner.id, role: "member", actorId: outsider.id }),
    ]) {
      denials.push(await attempt().then(
        () => { throw new Error("outsider attempt must fail"); },
        (error) => error,
      ));
    }
    assert.equal(denials.length, 6);
    for (const denial of denials) {
      assert.ok(denial instanceof AuthError && denial.code === "auth/forbidden");
      assert.equal(String(denial.message), "Access denied.");
    }
    assert.equal(await getMembership(db, forged, outsider.id), null);
    for (const attempt of [
      () => requireRole(db, "not-a-uuid", outsider.id, "member"),
      () => requireRole(db, created.workspace.id, "not-a-uuid", "member"),
      () => listMembers(db, "not-a-uuid", outsider.id),
      () => addMember(db, { workspaceId: "not-a-uuid", userId: outsider.id, role: "member", actorId: owner.id }),
    ]) {
      await assert.rejects(
        attempt(),
        (error) => error instanceof AuthError && error.code === "auth/forbidden",
        "malformed identifiers must fail closed as forbidden",
      );
    }
    await assert.rejects(
      () => createWorkspace(db, { name: "Ghost", ownerId: "not-a-uuid" }),
      (error) => error instanceof AuthError && error.code === "auth/user-not-found",
    );
    await assert.rejects(
      () => addMember(db, { workspaceId: created.workspace.id, userId: "not-a-uuid", role: "member", actorId: owner.id }),
      (error) => error instanceof AuthError && error.code === "auth/user-not-found",
    );
    assert.deepEqual(await listWorkspacesForUser(db, "not-a-uuid"), []);
  } finally {
    await db.close();
  }
});

test("role hierarchy grants exactly its authority", async () => {
  const db = await fixtureDb();
  try {
    const [owner, admin, member, stranger] = await users(db, 4);
    const created = await createWorkspace(db, { name: "Hierarchy", ownerId: owner.id });
    const id = created.workspace.id;
    await addMember(db, { workspaceId: id, userId: admin.id, role: "admin", actorId: owner.id });
    await addMember(db, { workspaceId: id, userId: member.id, role: "member", actorId: admin.id });
    assert.equal(await requireRole(db, id, member.id, "member"), "member");
    await assert.rejects(
      () => requireRole(db, id, member.id, "admin"),
      (error) => error instanceof AuthError && error.code === "auth/forbidden",
    );
    await assert.rejects(
      () => addMember(db, { workspaceId: id, userId: stranger.id, role: "member", actorId: member.id }),
      (error) => error instanceof AuthError && error.code === "auth/forbidden",
    );
    await assert.rejects(
      () => addMember(db, { workspaceId: id, userId: stranger.id, role: "admin", actorId: admin.id }),
      (error) => error instanceof AuthError && error.code === "auth/forbidden",
    );
    await assert.rejects(
      () => removeMember(db, { workspaceId: id, userId: owner.id, actorId: admin.id }),
      (error) => error instanceof AuthError && error.code === "auth/forbidden",
    );
    await assert.rejects(
      () => setMemberRole(db, { workspaceId: id, userId: member.id, role: "admin", actorId: admin.id }),
      (error) => error instanceof AuthError && error.code === "auth/forbidden",
    );
    const promoted = await setMemberRole(db, { workspaceId: id, userId: member.id, role: "admin", actorId: owner.id });
    assert.equal(promoted.role, "admin");
    await addMember(db, { workspaceId: id, userId: stranger.id, role: "member", actorId: admin.id });
    await assert.rejects(
      () => addMember(db, { workspaceId: id, userId: stranger.id, role: "member", actorId: admin.id }),
      (error) => error instanceof AuthError && error.code === "auth/member-exists",
    );
    const roster = await listMembers(db, id, member.id);
    assert.deepEqual(roster.map((entry) => entry.role).sort(), ["admin", "admin", "member", "owner"]);
    const orderKeys = roster.map((entry) => `${entry.joinedAt} ${entry.userId}`);
    assert.deepEqual([...orderKeys].sort(), orderKeys, "roster must honor joined_at, user_id order");
    await assert.rejects(
      () => addMember(db, { workspaceId: id, userId: stranger.id, role: "superadmin", actorId: owner.id }),
      (error) => error instanceof AuthError && error.code === "auth/invalid-role",
    );
    await assert.rejects(
      () => addMember(db, { workspaceId: id, userId: "11111111-2222-4333-8444-555555555555", role: "member", actorId: owner.id }),
      (error) => error instanceof AuthError && error.code === "auth/user-not-found",
    );
    await assert.rejects(
      () => setMemberRole(db, { workspaceId: id, userId: "11111111-2222-4333-8444-555555555555", role: "admin", actorId: owner.id }),
      (error) => error instanceof AuthError && error.code === "auth/member-not-found",
    );
    await assert.rejects(
      () => removeMember(db, { workspaceId: id, userId: admin.id, actorId: member.id }),
      (error) => error instanceof AuthError && error.code === "auth/forbidden",
    );
  } finally {
    await db.close();
  }
});

test("final owner cannot be removed or demoted; succession works", async () => {
  const db = await fixtureDb();
  try {
    const [first, second] = await users(db, 2);
    const created = await createWorkspace(db, { name: "Succession", ownerId: first.id });
    const id = created.workspace.id;
    await assert.rejects(
      () => removeMember(db, { workspaceId: id, userId: first.id, actorId: first.id }),
      (error) => error instanceof AuthError && error.code === "auth/last-owner",
    );
    await assert.rejects(
      () => setMemberRole(db, { workspaceId: id, userId: first.id, role: "admin", actorId: first.id }),
      (error) => error instanceof AuthError && error.code === "auth/last-owner",
    );
    await addMember(db, { workspaceId: id, userId: second.id, role: "owner", actorId: first.id });
    await removeMember(db, { workspaceId: id, userId: first.id, actorId: first.id });
    assert.equal(await getMembership(db, id, first.id), null);
    assert.equal(await getMembership(db, id, second.id), "owner");
    await assert.rejects(
      () => removeMember(db, { workspaceId: id, userId: second.id, actorId: second.id }),
      (error) => error instanceof AuthError && error.code === "auth/last-owner",
    );
  } finally {
    await db.close();
  }
});

test("membership removal is idempotent and workspaces list per user", async () => {
  const db = await fixtureDb();
  try {
    const [owner, member, stranger] = await users(db, 3);
    const first = await createWorkspace(db, { name: "First", ownerId: owner.id });
    const second = await createWorkspace(db, { name: "Second", ownerId: owner.id });
    await addMember(db, { workspaceId: first.workspace.id, userId: member.id, role: "member", actorId: owner.id });
    await removeMember(db, { workspaceId: first.workspace.id, userId: member.id, actorId: owner.id });
    await removeMember(db, { workspaceId: first.workspace.id, userId: member.id, actorId: owner.id });
    assert.equal(await getMembership(db, first.workspace.id, member.id), null);
    await addMember(db, { workspaceId: first.workspace.id, userId: member.id, role: "member", actorId: owner.id });
    await removeMember(db, { workspaceId: first.workspace.id, userId: member.id, actorId: member.id });
    assert.equal(await getMembership(db, first.workspace.id, member.id), null);
    await assert.rejects(
      () => removeMember(db, { workspaceId: first.workspace.id, userId: member.id, actorId: member.id }),
      (error) => error instanceof AuthError && error.code === "auth/forbidden",
    );
    const mine = await listWorkspacesForUser(db, owner.id);
    assert.deepEqual(mine.map((workspace) => workspace.name).sort(), ["First", "Second"]);
    assert.deepEqual(await listWorkspacesForUser(db, member.id), []);
    assert.deepEqual(await listWorkspacesForUser(db, stranger.id), []);
    assert.equal(second.workspace.createdBy, owner.id);
  } finally {
    await db.close();
  }
});

test("cross-workspace isolation holds both directions", async () => {
  const db = await fixtureDb();
  try {
    const [alice, bob] = await users(db, 2);
    const teamA = await createWorkspace(db, { name: "Team A", ownerId: alice.id });
    const teamB = await createWorkspace(db, { name: "Team B", ownerId: bob.id });
    await assert.rejects(
      () => requireRole(db, teamB.workspace.id, alice.id, "member"),
      (error) => error instanceof AuthError && error.code === "auth/forbidden",
    );
    await assert.rejects(
      () => requireRole(db, teamA.workspace.id, bob.id, "member"),
      (error) => error instanceof AuthError && error.code === "auth/forbidden",
    );
    await assert.rejects(
      () => listMembers(db, teamB.workspace.id, alice.id),
      (error) => error instanceof AuthError && error.code === "auth/forbidden",
    );
    assert.equal((await listWorkspacesForUser(db, alice.id)).length, 1);
    assert.equal((await listWorkspacesForUser(db, bob.id)).length, 1);
  } finally {
    await db.close();
  }
});
