import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import { openDatabase, SCHEMA_MIGRATION_ADVISORY_LOCK } from "../src/db.ts";
import { migrateDown } from "../src/migrate.ts";

const connectionString = process.env.SKILIT_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);

/** Never run destructive migrations against a non-fixture database. */
function requireFixtureDatabase() {
  if (!connectionString || process.env.SKILIT_DB_TEST_CONFIRM !== "yes") {
    throw new Error("Explicit fixture database confirmation is required");
  }
  const url = new URL(connectionString);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/skilit_test" ||
    url.username !== "skilit_test"
  ) {
    throw new Error("Refusing integration tests against a non-local/non-fixture database");
  }
}

function spawnMigrator() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        fileURLToPath(new URL("./pg-migrate-worker.mjs", import.meta.url)),
      ],
      { env: { ...process.env }, windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Migrator timed out"));
    }, 30000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error("Migrator process failed: " + stderr));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error("Migrator did not produce valid JSON: " + String(error)));
      }
    });
  });
}

async function waitForTwoContenders(locker) {
  const deadline = Date.now() + 15000;
  for (;;) {
    const result = await locker.query(
      "select count(*)::int as waiting from pg_locks " +
        "where locktype = 'advisory' and not granted and classid = 0::oid and objid = $1::oid",
      [SCHEMA_MIGRATION_ADVISORY_LOCK],
    );
    if (Number(result.rows[0]?.waiting) >= 2) return;
    if (Date.now() > deadline) {
      throw new Error("Two migrators did not reach the migration advisory lock");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test("real PostgreSQL serializes two demonstrably contending migration processes", { skip: !enabled }, async () => {
  requireFixtureDatabase();
  const lockPool = new Pool({ connectionString, max: 1 });
  const locker = await lockPool.connect();
  let workers = [];
  try {
    // Hold a session lock so both spawned processes must contend at the same key.
    await locker.query("select pg_advisory_lock($1)", [SCHEMA_MIGRATION_ADVISORY_LOCK]);
    workers = [spawnMigrator(), spawnMigrator()];
    await waitForTwoContenders(locker);
  } finally {
    await locker.query("select pg_advisory_unlock($1)", [SCHEMA_MIGRATION_ADVISORY_LOCK]);
    locker.release();
    await lockPool.end();
  }

  const results = await Promise.all(workers);
  assert.deepEqual(
    results.flat().sort(),
    ["001_sources_products", "002_design_graph", "003_workflows", "004_auth", "005_workspaces", "006_collections_auth", "007_billing", "008_jobs", "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"],
    "Only one blocked process may apply each migration",
  );

  const db = await openDatabase({ connectionString });
  try {
    const ledger = await db.query(
      "select filename from schema_migrations order by filename",
    );
    assert.deepEqual(ledger.rows.map((row) => row.filename), ["001_sources_products", "002_design_graph", "003_workflows", "004_auth", "005_workspaces", "006_collections_auth", "007_billing", "008_jobs", "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
    for (const table of ["sources", "products", "product_versions"]) {
      const result = await db.query("select to_regclass($1) as oid", ["public." + table]);
      assert.notEqual(result.rows[0]?.oid, null);
    }
  } finally {
    await migrateDown(db);
    await db.close();
  }
});

test("real PostgreSQL transaction rolls back DDL and releases its connection", { skip: !enabled }, async () => {
  requireFixtureDatabase();
  const db = await openDatabase({ connectionString });
  try {
    await assert.rejects(
      () => db.transaction(async (tx) => {
        await tx.exec("create table rollback_probe (id integer primary key)");
        await tx.exec("insert into rollback_probe (id) values (1)");
        throw new Error("forced PostgreSQL rollback");
      }),
      /forced PostgreSQL rollback/,
    );
    const check = await db.query("select to_regclass('public.rollback_probe') as oid");
    assert.equal(check.rows[0]?.oid, null);
  } finally {
    await db.close();
  }
});
