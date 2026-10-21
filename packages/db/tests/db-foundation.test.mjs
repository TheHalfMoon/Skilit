import assert from "node:assert/strict";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { openDatabase, PgPoolClient } from "../src/db.ts";

import { migrateDown, migrateUp } from "../src/migrate.ts";
import {
  createProduct,
  createProductVersion,
  createSource,
  getSource,
  listProductVersions,
  listProducts,
} from "../src/repositories.ts";

async function freshDb() {
  const db = new PGlite();
  await migrateUp(db);
  return db;
}

test("migrateUp from empty creates ledger and domain tables", async () => {
  const db = new PGlite();
  const applied = await migrateUp(db);
  assert.deepEqual(applied, ["001_sources_products", "002_design_graph", "003_workflows", "004_auth", "005_workspaces", "006_collections_auth", "007_billing", "008_jobs", "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
  const ledger = await db.query("select filename from schema_migrations");
  assert.deepEqual(
    ledger.rows.map((row) => row.filename),
    ["001_sources_products", "002_design_graph", "003_workflows", "004_auth", "005_workspaces", "006_collections_auth", "007_billing", "008_jobs", "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"],
  );
  for (const table of ["sources", "products", "product_versions"]) {
    const check = await db.query(
      "select to_regclass($1) as oid",
      [`public.${table}`],
    );
    assert.ok(check.rows[0].oid !== null, `missing table ${table}`);
  }
  await db.close();
});

test("migrateUp is idempotent", async () => {
  const db = await freshDb();
  const applied = await migrateUp(db);
  assert.deepEqual(applied, []);
  const count = await db.query("select count(*)::int as n from schema_migrations");
  assert.equal(count.rows[0].n, 19);
  await db.close();
});

test("sources round-trip with unique keys", async () => {
  const db = await freshDb();
  const created = await createSource(db, {
    key: "monet-registry",
    kind: "donor",
    displayName: "Monet Registry",
  });
  assert.equal(created.key, "monet-registry");
  assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(created.id.length === 36);
  const fetched = await getSource(db, created.id);
  assert.equal(fetched.displayName, "Monet Registry");
  await assert.rejects(
    () => createSource(db, { key: "monet-registry", kind: "donor" }),
    /duplicate|unique/i,
  );
  await db.close();
});

test("products belong to sources with referential integrity", async () => {
  const db = await freshDb();
  const source = await createSource(db, { key: "s1", kind: "capture" });
  const product = await createProduct(db, {
    sourceId: source.id,
    externalId: "ext-1",
    title: "Example",
  });
  assert.equal(product.title, "Example");
  const listed = await listProducts(db, source.id);
  assert.equal(listed.length, 1);
  await assert.rejects(
    () =>
      createProduct(db, {
        sourceId: "00000000-0000-0000-0000-000000000000",
        title: "Orphan",
      }),
    /foreign key|violates/i,
  );
  await db.close();
});

test("product versions order by version number", async () => {
  const db = await freshDb();
  const source = await createSource(db, { key: "s2", kind: "capture" });
  const product = await createProduct(db, { sourceId: source.id, title: "P" });
  await createProductVersion(db, { productId: product.id, versionNo: 2 });
  await createProductVersion(db, { productId: product.id, versionNo: 1 });
  const versions = await listProductVersions(db, product.id);
  assert.deepEqual(
    versions.map((version) => version.versionNo),
    [1, 2],
  );
  await assert.rejects(
    () => createProductVersion(db, { productId: product.id, versionNo: 1 }),
    /duplicate|unique/i,
  );
  await db.close();
});

test("migrateDown rolls back and migrateUp recreates deterministically", async () => {
  const db = await freshDb();
  await createSource(db, { key: "gone", kind: "capture" });
  await migrateDown(db);
  const ledger = await db.query("select count(*)::int as n from schema_migrations");
  assert.equal(ledger.rows[0].n, 0);
  const tables = await db.query(
    "select count(*)::int as n from pg_tables where schemaname = 'public' and tablename in ('sources','products','product_versions')",
  );
  assert.equal(tables.rows[0].n, 0);
  const recreated = await migrateUp(db);
  assert.deepEqual(recreated, ["001_sources_products", "002_design_graph", "003_workflows", "004_auth", "005_workspaces", "006_collections_auth", "007_billing", "008_jobs", "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
  await db.close();
});


test("openDatabase runs migrations through the transactional wrapper", async () => {
  const db = await openDatabase();
  try {
    assert.deepEqual(await migrateUp(db), ["001_sources_products", "002_design_graph", "003_workflows", "004_auth", "005_workspaces", "006_collections_auth", "007_billing", "008_jobs", "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
    assert.deepEqual(await migrateUp(db), []);
    const source = await createSource(db, { key: "wrapper", kind: "fixture" });
    assert.equal((await getSource(db, source.id)).key, "wrapper");
  } finally {
    await db.close();
  }
});

test("transaction failure rolls back all table and ledger changes", async () => {
  const db = await openDatabase();
  try {
    await assert.rejects(
      () => db.transaction(async (tx) => {
        await tx.exec("create table rollback_probe (id integer primary key)");
        await tx.exec("insert into rollback_probe (id) values (1)");
        throw new Error("injected failure");
      }),
      /injected failure/,
    );
    const result = await db.query(
      "select to_regclass('public.rollback_probe') as oid",
    );
    assert.equal(result.rows[0].oid, null);
  } finally {
    await db.close();
  }
});

test("repository rejects missing rows rather than constructing corrupt records", async () => {
  const db = await openDatabase();
  try {
    await migrateUp(db);
    await assert.rejects(
      () => getSource(db, "00000000-0000-0000-0000-000000000000"),
      /source not found/,
    );
  } finally {
    await db.close();
  }
});

test("PgPool migrations pin every statement to one connection", async () => {
  const trace = [];
  const pool = {
    query: async () => { throw new Error("pool.query must not run inside a transaction"); },
    connect: async () => ({
      query: async (sql) => {
        trace.push(sql);
        return { rows: [{ verified: true }] };
      },
      release: () => { trace.push("RELEASE"); },
    }),
    end: async () => {},
  };
  const db = new PgPoolClient(pool);
  await db.transaction(async (tx) => {
    const result = await tx.query("select 42 as verified");
    assert.equal(result.rows[0].verified, true);
    await tx.exec("create table fake_fixture (id integer)");
  }, { migrationLock: true });
  assert.deepEqual(trace, [
    "BEGIN ISOLATION LEVEL READ COMMITTED",
    "SELECT pg_advisory_xact_lock($1)",
    "select 42 as verified",
    "create table fake_fixture (id integer)",
    "COMMIT",
    "RELEASE",
  ]);
});

test("PgPool transaction failure rolls back and releases the pinned connection", async () => {
  const trace = [];
  const pool = {
    query: async () => { throw new Error("pool.query must not run inside a transaction"); },
    connect: async () => ({
      query: async (sql) => {
        trace.push(sql);
        return { rows: [] };
      },
      release: () => { trace.push("RELEASE"); },
    }),
    end: async () => {},
  };
  const db = new PgPoolClient(pool);
  await assert.rejects(
    () => db.transaction(async (tx) => {
      await tx.exec("update fake_fixture set id = 1");
      throw new Error("forced failure");
    }),
    /forced failure/,
  );
  assert.deepEqual(trace, [
    "BEGIN ISOLATION LEVEL READ COMMITTED",
    "update fake_fixture set id = 1",
    "ROLLBACK",
    "RELEASE",
  ]);
});

test("repository writes can be composed atomically in a DbTransaction", async () => {
  const db = await openDatabase();
  try {
    await migrateUp(db);
    const source = await createSource(db, { key: "atomic", kind: "fixture" });
    await assert.rejects(
      () => db.transaction(async (tx) => {
        const product = await createProduct(tx, { sourceId: source.id, title: "Rollback" });
        await createProductVersion(tx, { productId: product.id, versionNo: 1 });
        throw new Error("transaction aborted");
      }),
      /transaction aborted/,
    );
    assert.deepEqual(await listProducts(db, source.id), []);
  } finally {
    await db.close();
  }
});

test("PgPool rollback failure destroys the connection and preserves both errors", async () => {
  const releases = [];
  const statements = [];
  const pool = {
    query: async () => { throw new Error("pool.query forbidden inside transactions"); },
    connect: async () => ({
      query: async (sql) => {
        statements.push(sql);
        if (sql === "ROLLBACK") throw new Error("broken connection on rollback");
        return { rows: [] };
      },
      release: (error) => { releases.push(error); },
    }),
    end: async () => {},
  };
  const db = new PgPoolClient(pool);
  await assert.rejects(
    () => db.transaction(async (tx) => {
      await tx.exec("insert into fake_fixture values (1)");
      throw new Error("original failure");
    }),
    (error) => error instanceof AggregateError && error.errors.length === 2,
  );
  assert.equal(releases.length, 1);
  assert.match(releases[0]?.message, /broken connection on rollback/);
  assert.deepEqual(statements, ["BEGIN ISOLATION LEVEL READ COMMITTED", "insert into fake_fixture values (1)", "ROLLBACK"]);
});

test("PgPool releases failed BEGIN and COMMIT connections as damaged", async () => {
  for (const brokenAt of ["BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT"]) {
    const releases = [];
    const statements = [];
    const pool = {
      query: async () => { throw new Error("pool.query forbidden"); },
      connect: async () => ({
        query: async (sql) => {
          statements.push(sql);
          if (sql === brokenAt) throw new Error("broken " + brokenAt);
          return { rows: [] };
        },
        release: (error) => { releases.push(error); },
      }),
      end: async () => {},
    };
    const db = new PgPoolClient(pool);
    await assert.rejects(
      () => db.transaction(async () => "ok"),
      new RegExp("broken " + brokenAt),
    );
    assert.equal(releases.length, 1);
    assert.match(releases[0]?.message, new RegExp("broken " + brokenAt));
    assert.equal(statements.includes("ROLLBACK"), brokenAt === "COMMIT");
  }
});
