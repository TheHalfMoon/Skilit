import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateDown, migrateUp } from "../src/migrate.ts";
import {
  JobError,
  cancel,
  claim,
  complete,
  computeBackoffSeconds,
  enqueue,
  fail,
  getJob,
} from "../src/jobs.ts";

const EIGHT = [
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
const BASE = new Date("2026-10-09T04:00:00.000Z");

async function fixtureDb() {
  const db = await openDatabase();
  await migrateUp(db);
  return db;
}

test("008 migration applies job queue and reverses cleanly", async () => {
  const db = await openDatabase();
  try {
    assert.deepEqual(await migrateUp(db), EIGHT);
    const table = await db.query("select to_regclass('public.jobs') as oid");
    assert.notEqual(table.rows[0]?.oid, null);
    const index = await db.query("select to_regclass('public.jobs_claim_idx') as oid");
    assert.notEqual(index.rows[0]?.oid, null);
    assert.deepEqual(await migrateDown(db), [...EIGHT].reverse());
    assert.deepEqual(await migrateUp(db), EIGHT);
  } finally {
    await db.close();
  }
});

test("backoff schedule is deterministic and bounded", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((attempt) => computeBackoffSeconds(attempt)),
    [60, 120, 240, 480, 960, 1920, 3600],
  );
  assert.equal(computeBackoffSeconds(100), 3600);
  assert.throws(
    () => computeBackoffSeconds(0),
    (error) => error instanceof JobError && error.code === "jobs/invalid-job",
  );
});

test("enqueue, ordered claim, and completion form a lifecycle", async () => {
  const db = await fixtureDb();
  try {
    assert.equal(await claim(db, { queue: "lens", workerId: "worker-1" }), null);
    const first = await enqueue(db, {
      queue: "lens",
      kind: "capture",
      payload: { url: "https://example.org/a" },
      runAt: new Date(BASE.getTime() + 2000),
    });
    assert.equal(first.enqueued, true);
    assert.equal(first.job.status, "queued");
    assert.equal(first.job.attempts, 0);
    const second = await enqueue(db, { queue: "lens", kind: "capture", runAt: BASE });
    const claimed = await claim(db, { queue: "lens", workerId: "worker-1", now: BASE });
    assert.equal(claimed?.id, second.job.id);
    assert.equal(claimed?.attempts, 1);
    assert.equal(claimed?.lockedBy, "worker-1");
    const done = await complete(db, { jobId: claimed.id, workerId: "worker-1" });
    assert.equal(done.status, "completed");
    assert.equal(done.lockedBy, null);
    const next = await claim(db, { queue: "lens", workerId: "worker-1", now: BASE });
    assert.equal(next, null);
    const later = await claim(db, {
      queue: "lens",
      workerId: "worker-1",
      now: new Date(BASE.getTime() + 2000),
    });
    assert.equal(later?.id, first.job.id);
    assert.deepEqual((await getJob(db, first.job.id)).status, "running");
  } finally {
    await db.close();
  }
});

test("duplicate enqueue converges to the original job", async () => {
  const db = await fixtureDb();
  try {
    const first = await enqueue(db, {
      queue: "imports",
      kind: "dataset",
      idempotencyKey: "import-batch-7",
    });
    const second = await enqueue(db, {
      queue: "imports",
      kind: "dataset",
      payload: { different: true },
      idempotencyKey: "import-batch-7",
    });
    assert.equal(second.enqueued, false);
    assert.equal(second.job.id, first.job.id);
    assert.deepEqual(second.job.payload, {});
    const otherQueue = await enqueue(db, {
      queue: "exports",
      kind: "dataset",
      idempotencyKey: "import-batch-7",
    });
    assert.equal(otherQueue.enqueued, true);
    assert.notEqual(otherQueue.job.id, first.job.id);
    const padded = await enqueue(db, {
      queue: "imports",
      kind: "dataset",
      idempotencyKey: "  import-batch-7  ",
    });
    assert.equal(padded.enqueued, false);
    assert.equal(padded.job.id, first.job.id);
    const third = await enqueue(db, { queue: "imports", kind: "dataset" });
    assert.equal(third.enqueued, true);
    assert.notEqual(third.job.id, first.job.id);
  } finally {
    await db.close();
  }
});

test("failures reschedule with backoff and exhaust to dead-letter", async () => {
  const db = await fixtureDb();
  try {
    const placed = await enqueue(db, {
      queue: "analysis",
      kind: "embed",
      maxAttempts: 2,
      runAt: BASE,
    });
    const attempt1 = await claim(db, { queue: "analysis", workerId: "w", now: BASE });
    assert.equal(attempt1?.attempts, 1);
    const failed = await fail(db, {
      jobId: placed.job.id,
      workerId: "w",
      error: "provider timeout",
      now: BASE,
    });
    assert.equal(failed.status, "failed");
    assert.equal(failed.lastError, "provider timeout");
    assert.equal(
      Date.parse(failed.runAt) - BASE.getTime(),
      computeBackoffSeconds(1) * 1000,
    );
    const attempt2 = await claim(db, {
      queue: "analysis",
      workerId: "w",
      now: new Date(Date.parse(failed.runAt)),
    });
    assert.equal(attempt2?.attempts, 2);
    const dead = await fail(db, {
      jobId: placed.job.id,
      workerId: "w",
      error: "provider timeout again",
      now: new Date(Date.parse(failed.runAt)),
    });
    assert.equal(dead.status, "dead");
    assert.equal(dead.lockedBy, null);
    assert.equal(await claim(db, { queue: "analysis", workerId: "w" }), null);
  } finally {
    await db.close();
  }
});

test("cancellation wins over a racing failure", async () => {
  const db = await fixtureDb();
  try {
    const placed = await enqueue(db, { queue: "race-cancel", kind: "capture" });
    await claim(db, { queue: "race-cancel", workerId: "w" });
    await cancel(db, placed.job.id);
    await assert.rejects(
      () => fail(db, { jobId: placed.job.id, workerId: "w", error: "too late" }),
      (error) => error instanceof JobError && error.code === "jobs/not-claimed",
    );
    assert.equal((await getJob(db, placed.job.id)).status, "canceled");
  } finally {
    await db.close();
  }
});

test("cancellation honors state and unknown jobs fail closed", async () => {
  const db = await fixtureDb();
  try {
    const queued = await enqueue(db, { queue: "lens", kind: "capture" });
    const canceled = await cancel(db, queued.job.id);
    assert.equal(canceled.status, "canceled");
    await enqueue(db, { queue: "lens", kind: "capture" });
    const running = await claim(db, { queue: "lens", workerId: "w" });
    await cancel(db, running.id);
    assert.equal((await getJob(db, running.id)).status, "canceled");
    await assert.rejects(
      () => complete(db, { jobId: running.id, workerId: "w" }),
      (error) => error instanceof JobError && error.code === "jobs/not-claimed",
    );
    await assert.rejects(
      () => cancel(db, queued.job.id),
      (error) => error instanceof JobError && error.code === "jobs/not-cancelable",
    );
    await assert.rejects(
      () => cancel(db, "not-a-uuid"),
      (error) => error instanceof JobError && error.code === "jobs/not-found",
    );
    await assert.rejects(
      () => getJob(db, "00000000-0000-0000-0000-000000000000"),
      (error) => error instanceof JobError && error.code === "jobs/not-found",
    );
  } finally {
    await db.close();
  }
});

test("concurrent claims converge to one winner", async () => {
  const db = await fixtureDb();
  try {
    await enqueue(db, { queue: "race", kind: "capture" });
    const outcomes = await Promise.allSettled([
      claim(db, { queue: "race", workerId: "a" }),
      claim(db, { queue: "race", workerId: "b" }),
    ]);
    const wins = outcomes.filter(
      (outcome) => outcome.status === "fulfilled" && outcome.value !== null,
    );
    const misses = outcomes.filter(
      (outcome) => outcome.status === "fulfilled" && outcome.value === null,
    );
    assert.equal(wins.length, 1);
    assert.equal(misses.length, 1);
  } finally {
    await db.close();
  }
});

test("worker isolation and input validation fail closed", async () => {
  const db = await fixtureDb();
  try {
    const placed = await enqueue(db, { queue: "solo", kind: "capture" });
    const claimed = await claim(db, { queue: "solo", workerId: "owner" });
    await assert.rejects(
      () => complete(db, { jobId: placed.job.id, workerId: "intruder" }),
      (error) => error instanceof JobError && error.code === "jobs/not-claimed",
    );
    await assert.rejects(
      () => fail(db, { jobId: placed.job.id, workerId: "intruder", error: "x" }),
      (error) => error instanceof JobError && error.code === "jobs/not-claimed",
    );
    assert.equal((await getJob(db, placed.job.id)).lockedBy, "owner");
    await complete(db, { jobId: claimed.id, workerId: "owner" });
    for (const input of [
      { queue: "", kind: "capture" },
      { queue: "q", kind: "   " },
      { queue: "q", kind: "k", maxAttempts: 0 },
      { queue: "q", kind: "k", payload: ["array"] },
      { queue: "q", kind: "k", payload: { blob: "x".repeat(300000) } },
      { queue: "q", kind: "k", idempotencyKey: "  " },
    ]) {
      await assert.rejects(
        () => enqueue(db, input),
        (error) => error instanceof JobError && error.code === "jobs/invalid-job",
      );
    }
    await assert.rejects(
      () => claim(db, { queue: "solo", workerId: "  " }),
      (error) => error instanceof JobError && error.code === "jobs/invalid-job",
    );
    await assert.rejects(
      () => claim(db, { queue: "solo", workerId: "w".repeat(129) }),
      (error) => error instanceof JobError && error.code === "jobs/invalid-job",
    );
    await enqueue(db, { queue: "solo", kind: "capture" });
    const paddedWorker = await claim(db, { queue: "solo", workerId: "  owner  " });
    assert.equal(paddedWorker?.lockedBy, "owner");
    await complete(db, { jobId: paddedWorker.id, workerId: "owner" });
  } finally {
    await db.close();
  }
});
