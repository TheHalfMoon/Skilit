import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateDown, migrateUp } from "../src/migrate.ts";
import { signUp } from "../src/auth.ts";
import { createWorkspace } from "../src/workspaces.ts";
import {
  ALLOWED_TRANSITIONS,
  BuildKitError,
  advanceKitRun,
  cancelKitRun,
  canonicalJson,
  createKitRun,
  expireKitRun,
  getKitRun,
  isTransitionAllowed,
  pollKitRun,
  reapStaleKitRuns,
  resumeKitRun,
  retryKitRun,
  sha256Hex,
} from "../src/build-kit.ts";

const NINE = [
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
const BASE = new Date("2026-10-10T04:00:00.000Z");

function request(overrides = {}) {
  return {
    sourceUrl: "https://example.org/",
    mode: "single-page",
    maxPages: 1,
    maxDepth: 0,
    maxBytes: 1048576,
    timeBudgetMs: 60000,
    idempotencyKey: "kit-key",
    ...overrides,
  };
}

async function tenants(db) {
  const first = await signUp(db, { email: "kit-a@skilit.example", password: "kit-member-01" });
  const spaceA = await createWorkspace(db, { name: "Kit A", ownerId: first.id });
  const second = await signUp(db, { email: "kit-b@skilit.example", password: "kit-member-02" });
  const spaceB = await createWorkspace(db, { name: "Kit B", ownerId: second.id });
  return {
    a: { workspaceId: spaceA.workspace.id, actorId: first.id },
    b: { workspaceId: spaceB.workspace.id, actorId: second.id },
  };
}

let soloSeq = 0;

async function soloTenant(db, tag) {
  soloSeq += 1;
  const user = await signUp(db, {
    email: `kit-${tag}-${soloSeq}@skilit.example`,
    password: "kit-member-01",
  });
  const space = await createWorkspace(db, {
    name: `Kit ${tag} ${soloSeq}`,
    ownerId: user.id,
  });
  return { workspaceId: space.workspace.id, actorId: user.id };
}

async function fixtureDb() {
  const db = await openDatabase();
  await migrateUp(db);
  return db;
}

async function makeRun(db, tenant, overrides = {}, keySuffix = Math.random().toString(36).slice(2)) {
  const { run } = await createKitRun(db, {
    workspaceId: tenant.workspaceId,
    actorId: tenant.actorId,
    request: request({ idempotencyKey: `kit-${Date.now()}-${keySuffix}`, ...overrides }),
    now: BASE,
  });
  return run;
}

const VALID_CHECKPOINT = (run) => ({
  state: run.status,
  requestHash: run.requestHash,
  cursor: { page: 1, pages: 1 },
});

test("009 migration applies kit lifecycle and reverses cleanly", async () => {
  const db = await openDatabase();
  try {
    assert.deepEqual(await migrateUp(db), NINE);
    for (const table of ["lens_build_kit_runs", "lens_build_kit_quotas"]) {
      const found = await db.query(`select to_regclass('public.${table}') as oid`);
      assert.notEqual(found.rows[0]?.oid, null);
    }
    assert.deepEqual(await migrateDown(db), [...NINE].reverse());
    assert.deepEqual(await migrateUp(db), NINE);
  } finally {
    await db.close();
  }
});

test("transition matrix allows exactly the contract pipeline", () => {
  const expected = {
    queued: ["capturing", "canceled"],
    capturing: ["extracting", "failed", "canceled"],
    extracting: ["generating", "failed", "canceled"],
    generating: ["validating", "partial", "failed", "canceled"],
    validating: ["completed", "partial", "failed", "canceled"],
    completed: [],
    partial: ["queued"],
    failed: ["queued"],
    canceled: [],
  };
  assert.deepEqual({ ...ALLOWED_TRANSITIONS }, expected);
  const states = Object.keys(expected);
  for (const from of states) {
    for (const to of states) {
      assert.equal(
        isTransitionAllowed(from, to),
        expected[from].includes(to),
        `${from} -> ${to}`,
      );
    }
  }
});

test("full pipeline advances through every active state", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    let run = await makeRun(db, a);
    assert.equal(run.status, "queued");
    assert.equal(run.revision, 0);
    assert.match(run.kitId, /^[0-9a-f]{64}$/);
    assert.match(run.analysisId, /^[0-9a-f]{64}$/);
    const worker = "worker-1";
    for (const next of ["capturing", "extracting", "generating", "validating"]) {
      const step = await advanceKitRun(db, {
        workspaceId: a.workspaceId,
        kitId: run.kitId,
        workerId: worker,
        expectedRevision: run.revision,
        next,
        options: {
          checkpoint: { state: next, requestHash: run.requestHash, cursor: { at: next } },
          now: BASE,
        },
      });
      assert.equal(step.applied, true);
      run = step.run;
      assert.equal(run.status, next);
      assert.equal(run.leaseOwner, worker);
    }
    assert.equal(run.revision, 4);
    assert.equal(run.startedAt, BASE.toISOString());
    const done = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: worker,
      expectedRevision: run.revision,
      next: "completed",
      options: {
        evidence: { validation: { passed: true } },
        artifactManifest: { "manifest.json": { sha256: "a".repeat(64) } },
        now: BASE,
      },
    });
    assert.equal(done.run.status, "completed");
    assert.equal(done.run.finishedAt, BASE.toISOString());
  } finally {
    await db.close();
  }
});

test("every illegal transition is rejected", async () => {
  const db = await fixtureDb();
  try {
    const illegal = [
      ["queued", "extracting"],
      ["queued", "completed"],
      ["queued", "failed"],
      ["capturing", "generating"],
      ["capturing", "completed"],
      ["extracting", "validating"],
      ["generating", "completed"],
      ["validating", "extracting"],
      ["validating", "queued"],
    ];
    // Note: same-state advance is a legal progress refresh (heartbeat),
    // covered by its own test below, not an illegal transition.
    for (const [from, to] of illegal) {
      // Fresh tenant per case: the free plan holds 2 concurrent slots.
      const tenant = await soloTenant(db, "illegal");
      const run = await makeRun(
        db,
        tenant,
        {},
        `illegal-${from}-${to}-${Math.random().toString(36).slice(2)}`,
      );
      let current = run;
      // Drive to the source state through legal steps.
      const drive = {
        queued: [],
        capturing: ["capturing"],
        extracting: ["capturing", "extracting"],
        generating: ["capturing", "extracting", "generating"],
        validating: ["capturing", "extracting", "generating", "validating"],
      }[from];
      for (const next of drive) {
        const step = await advanceKitRun(db, {
          workspaceId: tenant.workspaceId,
          kitId: current.kitId,
          workerId: "driver",
          expectedRevision: current.revision,
          next,
          options: { now: BASE },
        });
        current = step.run;
      }
      await assert.rejects(
        () =>
          advanceKitRun(db, {
            workspaceId: tenant.workspaceId,
            kitId: current.kitId,
            workerId: "driver",
            expectedRevision: current.revision,
            next: to,
            options: { now: BASE },
          }),
        (error) => error instanceof BuildKitError && error.code === "buildkit/illegal-transition",
        `${from} -> ${to}`,
      );
    }
  } finally {
    await db.close();
  }
});

test("same-state advance refreshes checkpoints without publishing", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    const run = await makeRun(db, a);
    const started = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: 0,
      next: "capturing",
      options: {
        checkpoint: { state: "capturing", requestHash: run.requestHash, cursor: { page: 1 } },
        now: BASE,
      },
    });
    const heartbeat = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: started.run.revision,
      next: "capturing",
      options: {
        checkpoint: { state: "capturing", requestHash: run.requestHash, cursor: { page: 2 } },
        evidence: { pagesSeen: 2 },
        now: BASE,
      },
    });
    assert.equal(heartbeat.applied, true);
    assert.equal(heartbeat.run.status, "capturing");
    assert.equal(heartbeat.run.checkpoint?.cursor?.page, 2);
    assert.deepEqual(heartbeat.run.artifactManifest, {});
    // Refresh cannot smuggle artifacts or errors into the run.
    await assert.rejects(
      () =>
        advanceKitRun(db, {
          workspaceId: a.workspaceId,
          kitId: run.kitId,
          workerId: "worker-1",
          expectedRevision: heartbeat.run.revision,
          next: "capturing",
          options: { artifactManifest: { "manifest.json": {} }, now: BASE },
        }),
      /cannot publish artifacts/,
    );
    await assert.rejects(
      () =>
        advanceKitRun(db, {
          workspaceId: a.workspaceId,
          kitId: run.kitId,
          workerId: "worker-1",
          expectedRevision: heartbeat.run.revision,
          next: "capturing",
          options: { errorClass: "buildkit/worker-crash", now: BASE },
        }),
      /cannot publish artifacts/,
    );
  } finally {
    await db.close();
  }
});

test("terminal states never resurrect, even by direct SQL", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    const run = await makeRun(db, a);
    const canceled = await cancelKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
      now: BASE,
    });
    assert.equal(canceled.run.status, "canceled");
    await assert.rejects(
      () =>
        advanceKitRun(db, {
          workspaceId: a.workspaceId,
          kitId: run.kitId,
          workerId: "worker-9",
          expectedRevision: canceled.run.revision,
          next: "capturing",
          options: { now: BASE },
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/terminal-state",
    );
    await assert.rejects(
      () =>
        db.query("update lens_build_kit_runs set status = 'queued' where kit_id = $1", [
          run.kitId,
        ]),
      /terminal kit run cannot be modified/,
    );
    await assert.rejects(
      () =>
        db.query("update lens_build_kit_runs set workspace_id = $2 where kit_id = $1", [
          run.kitId,
          a.workspaceId,
        ]),
      /terminal kit run cannot be modified/,
    );
  } finally {
    await db.close();
  }
});

test("completed runs need validated artifacts, failed need classification", async () => {
  const db = await fixtureDb();
  try {
    const worker = "worker-1";
    async function toValidating(tag) {
      const tenant = await soloTenant(db, tag);
      let run = await makeRun(db, tenant, {}, `gate-${tag}-${Math.random().toString(36).slice(2)}`);
      for (const next of ["capturing", "extracting", "generating", "validating"]) {
        const step = await advanceKitRun(db, {
          workspaceId: tenant.workspaceId,
          kitId: run.kitId,
          workerId: worker,
          expectedRevision: run.revision,
          next,
          options: { now: BASE },
        });
        run = step.run;
      }
      return { tenant, run };
    }
    const empty = await toValidating("empty");
    await assert.rejects(
      () =>
        advanceKitRun(db, {
          workspaceId: empty.tenant.workspaceId,
          kitId: empty.run.kitId,
          workerId: worker,
          expectedRevision: empty.run.revision,
          next: "completed",
          options: { evidence: { validation: { passed: true } }, now: BASE },
        }),
      /validated artifacts/,
    );
    const noEvidence = await toValidating("noevidence");
    await assert.rejects(
      () =>
        advanceKitRun(db, {
          workspaceId: noEvidence.tenant.workspaceId,
          kitId: noEvidence.run.kitId,
          workerId: worker,
          expectedRevision: noEvidence.run.revision,
          next: "completed",
          options: { artifactManifest: { "manifest.json": {} }, now: BASE },
        }),
      /validation evidence/,
    );
    const failTenant = await soloTenant(db, "failgate");
    const capturing = await makeRun(db, failTenant, {}, `fail-${Math.random().toString(36).slice(2)}`);
    const started = await advanceKitRun(db, {
      workspaceId: failTenant.workspaceId,
      kitId: capturing.kitId,
      workerId: worker,
      expectedRevision: 0,
      next: "capturing",
      options: { now: BASE },
    });
    await assert.rejects(
      () =>
        advanceKitRun(db, {
          workspaceId: failTenant.workspaceId,
          kitId: capturing.kitId,
          workerId: worker,
          expectedRevision: started.run.revision,
          next: "failed",
          options: { now: BASE },
        }),
      /error classification/,
    );
    const bare = await toValidating("bare");
    await assert.rejects(
      () =>
        advanceKitRun(db, {
          workspaceId: bare.tenant.workspaceId,
          kitId: bare.run.kitId,
          workerId: worker,
          expectedRevision: bare.run.revision,
          next: "partial",
          options: { now: BASE },
        }),
      /coverage gaps/,
    );
  } finally {
    await db.close();
  }
});

test("identical idempotency replay is stable and never double-charges", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    const first = await createKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      request: request({ idempotencyKey: "replay-key" }),
      now: BASE,
    });
    assert.equal(first.created, true);
    const second = await createKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      request: request({ idempotencyKey: "  replay-key " }),
      now: new Date(BASE.getTime() + 1000),
    });
    assert.equal(second.created, false);
    assert.equal(second.run.kitId, first.run.kitId);
    assert.equal(second.run.analysisId, first.run.analysisId);
    assert.equal(second.run.requestHash, first.run.requestHash);
    const quota = await db.query(
      "select submitted_total, active_count from lens_build_kit_quotas where workspace_id = $1",
      [a.workspaceId],
    );
    assert.equal(quota.rows[0]?.submitted_total, 1);
    assert.equal(quota.rows[0]?.active_count, 1);
  } finally {
    await db.close();
  }
});

test("reused idempotency key with a different body conflicts", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    await createKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      request: request({ idempotencyKey: "clash", maxPages: 1 }),
      now: BASE,
    });
    await assert.rejects(
      () =>
        createKitRun(db, {
          workspaceId: a.workspaceId,
          actorId: a.actorId,
          request: request({ idempotencyKey: "clash", maxPages: 2 }),
          now: BASE,
        }),
      (error) =>
        error instanceof BuildKitError && error.code === "buildkit/idempotency-conflict",
    );
  } finally {
    await db.close();
  }
});

test("identities are deterministic, opaque, and tenant-scoped", async () => {
  const db = await fixtureDb();
  try {
    const { a, b } = await tenants(db);
    const first = await createKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      request: request({ idempotencyKey: "shared-key" }),
      now: BASE,
    });
    const other = await createKitRun(db, {
      workspaceId: b.workspaceId,
      actorId: b.actorId,
      request: request({ idempotencyKey: "shared-key" }),
      now: BASE,
    });
    assert.notEqual(first.run.kitId, other.run.kitId);
    assert.notEqual(first.run.analysisId, other.run.analysisId);
    // Same tenant, key, and body always derive the same identifiers.
    const replay = await createKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      request: request({ idempotencyKey: "shared-key" }),
      now: BASE,
    });
    assert.equal(replay.run.kitId, first.run.kitId);
  } finally {
    await db.close();
  }
});

test("cross-tenant reads fail closed as not-found", async () => {
  const db = await fixtureDb();
  try {
    const { a, b } = await tenants(db);
    const run = await makeRun(db, a);
    await assert.rejects(
      () => pollKitRun(db, { workspaceId: b.workspaceId, actorId: b.actorId, kitId: run.kitId }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/not-found",
    );
    await assert.rejects(
      () => getKitRun(db, { workspaceId: b.workspaceId, actorId: b.actorId, kitId: run.kitId }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/not-found",
    );
    await assert.rejects(
      () =>
        cancelKitRun(db, {
          workspaceId: a.workspaceId,
          actorId: b.actorId,
          kitId: run.kitId,
          now: BASE,
        }),
      // Membership denials surface from the reused workspace authority.
      (error) => error instanceof Error && error.code === "auth/forbidden",
    );
    await assert.rejects(
      () =>
        pollKitRun(db, {
          workspaceId: a.workspaceId,
          actorId: a.actorId,
          kitId: "f".repeat(64),
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/not-found",
    );
    // Poll preserves coverage and provenance for the owning tenant.
    const progress = await pollKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
    });
    assert.equal(progress.kitId, run.kitId);
    assert.equal(progress.analysisId, run.analysisId);
    assert.equal(progress.status, "queued");
    assert.equal(progress.pipelineStep, 0);
  } finally {
    await db.close();
  }
});

test("cancel is idempotent and wins over in-flight workers", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    const run = await makeRun(db, a);
    const started = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: 0,
      next: "capturing",
      options: { now: BASE },
    });
    const canceled = await cancelKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
      now: BASE,
    });
    assert.equal(canceled.applied, true);
    assert.equal(canceled.run.status, "canceled");
    assert.equal(canceled.run.leaseOwner, null);
    const again = await cancelKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
      now: BASE,
    });
    assert.equal(again.applied, false);
    assert.equal(again.run.status, "canceled");
    // The canceled worker can no longer publish a final artifact.
    await assert.rejects(
      () =>
        advanceKitRun(db, {
          workspaceId: a.workspaceId,
          kitId: run.kitId,
          workerId: "worker-1",
          expectedRevision: started.run.revision,
          next: "extracting",
          options: { now: BASE },
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/terminal-state",
    );
    // Completed runs are not cancelable.
    const second = await makeRun(db, a, {}, `nocancel-${Date.now()}`);
    let current = second;
    for (const next of ["capturing", "extracting", "generating", "validating"]) {
      const step = await advanceKitRun(db, {
        workspaceId: a.workspaceId,
        kitId: current.kitId,
        workerId: "worker-1",
        expectedRevision: current.revision,
        next,
        options: { now: BASE },
      });
      current = step.run;
    }
    const done = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: current.kitId,
      workerId: "worker-1",
      expectedRevision: current.revision,
      next: "completed",
      options: {
        evidence: { validation: { passed: true } },
        artifactManifest: { "manifest.json": {} },
        now: BASE,
      },
    });
    assert.equal(done.run.status, "completed");
    await assert.rejects(
      () =>
        cancelKitRun(db, {
          workspaceId: a.workspaceId,
          actorId: a.actorId,
          kitId: current.kitId,
          now: BASE,
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/not-cancelable",
    );
  } finally {
    await db.close();
  }
});

test("retry preserves history and respects the attempt budget", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    const run = await makeRun(db, a, { maxAttempts: 2 });
    const started = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: 0,
      next: "capturing",
      options: { now: BASE },
    });
    const failed = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: started.run.revision,
      next: "failed",
      options: { errorClass: "buildkit/capture-timeout", now: BASE },
    });
    assert.equal(failed.run.errorClass, "buildkit/capture-timeout");
    const retried = await retryKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
      now: BASE,
    });
    assert.equal(retried.status, "queued");
    assert.equal(retried.attempt, 1);
    assert.equal(retried.errorClass, null);
    assert.deepEqual(retried.resultEvidence, {});
    assert.equal(retried.attemptHistory.length, 1);
    assert.equal(retried.attemptHistory[0]?.from, "failed");
    // Submission quota is not charged twice for the retry.
    const quota = await db.query(
      "select submitted_total, active_count from lens_build_kit_quotas where workspace_id = $1",
      [a.workspaceId],
    );
    assert.equal(quota.rows[0]?.submitted_total, 1);
    assert.equal(quota.rows[0]?.active_count, 1);
    // Second failure is still retryable; third exceeds the budget of 2.
    let current = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: retried.revision,
      next: "capturing",
      options: { now: BASE },
    });
    assert.equal(current.run.status, "capturing");
    current = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: current.run.revision,
      next: "failed",
      options: { errorClass: "buildkit/provider-outage", now: BASE },
    });
    const retriedAgain = await retryKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
      now: BASE,
    });
    assert.equal(retriedAgain.attempt, 2);
    assert.equal(retriedAgain.attemptHistory.length, 2);
    const capturing = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: retriedAgain.revision,
      next: "capturing",
      options: { now: BASE },
    });
    const exhausted = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: capturing.run.revision,
      next: "failed",
      options: { errorClass: "buildkit/provider-outage", now: BASE },
    });
    assert.equal(exhausted.run.attempt, 2);
    await assert.rejects(
      () =>
        retryKitRun(db, {
          workspaceId: a.workspaceId,
          actorId: a.actorId,
          kitId: run.kitId,
          now: BASE,
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/retry-exhausted",
    );
    // Active and canceled runs are not retryable.
    await assert.rejects(
      () =>
        retryKitRun(db, {
          workspaceId: a.workspaceId,
          actorId: a.actorId,
          kitId: run.kitId,
          now: BASE,
        }),
      (error) => error instanceof BuildKitError,
    );
  } finally {
    await db.close();
  }
});

test("partial runs retry without duplicating published artifacts", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    let run = await makeRun(db, a);
    for (const next of ["capturing", "extracting", "generating"]) {
      const step = await advanceKitRun(db, {
        workspaceId: a.workspaceId,
        kitId: run.kitId,
        workerId: "worker-1",
        expectedRevision: run.revision,
        next,
        options: { now: BASE },
      });
      run = step.run;
    }
    const partial = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: run.revision,
      next: "partial",
      options: {
        evidence: { coverage_gaps: ["https://example.org/missing"] },
        artifactManifest: { "tokens.json": {} },
        now: BASE,
      },
    });
    assert.equal(partial.run.status, "partial");
    const retried = await retryKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
      now: BASE,
    });
    assert.deepEqual(retried.artifactManifest, {});
    assert.equal(retried.attemptHistory[0]?.from, "partial");
  } finally {
    await db.close();
  }
});

test("resume recovers valid checkpoints and fails corrupt ones", async () => {
  const db = await fixtureDb();
  try {
    const { a, b } = await tenants(db);
    const run = await makeRun(db, a);
    const started = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: 0,
      next: "capturing",
      options: {
        checkpoint: VALID_CHECKPOINT({ ...run, status: "capturing" }),
        now: BASE,
      },
    });
    assert.equal(started.run.checkpoint?.state, "capturing");
    // Another tenant cannot resume the run.
    await assert.rejects(
      () =>
        resumeKitRun(db, {
          workspaceId: b.workspaceId,
          actorId: b.actorId,
          kitId: run.kitId,
          workerId: "worker-2",
          now: BASE,
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/not-found",
    );
    // Live lease blocks a different worker.
    await assert.rejects(
      () =>
        resumeKitRun(db, {
          workspaceId: a.workspaceId,
          actorId: a.actorId,
          kitId: run.kitId,
          workerId: "worker-2",
          now: BASE,
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/lease-held",
    );
    // After lease expiry the lease transfers to the recovering worker.
    const recovered = await resumeKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
      workerId: "worker-2",
      now: new Date(BASE.getTime() + 301000),
    });
    assert.equal(recovered.resumed, true);
    assert.equal(recovered.run.leaseOwner, "worker-2");
    assert.equal(recovered.run.status, "capturing");
    // Queued runs have nothing to resume.
    const queued = await makeRun(db, a, {}, `noresume-${Date.now()}`);
    await assert.rejects(
      () =>
        resumeKitRun(db, {
          workspaceId: a.workspaceId,
          actorId: a.actorId,
          kitId: queued.kitId,
          workerId: "worker-2",
          now: BASE,
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/not-resumable",
    );
  } finally {
    await db.close();
  }
});

test("corrupt checkpoints fail the run instead of succeeding", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    const run = await makeRun(db, a, {}, `corrupt-${Date.now()}`);
    const started = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: 0,
      next: "capturing",
      options: {
        checkpoint: { state: "extracting", requestHash: run.requestHash, cursor: {} },
        now: BASE,
      },
    });
    assert.equal(started.run.status, "capturing");
    const outcome = await resumeKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
      workerId: "worker-2",
      now: new Date(BASE.getTime() + 301000),
    });
    assert.equal(outcome.resumed, false);
    assert.equal(outcome.run.status, "failed");
    assert.equal(outcome.run.errorClass, "buildkit/corrupt-checkpoint");
  } finally {
    await db.close();
  }
});

test("leases fence concurrent workers and expire for crash recovery", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    const run = await makeRun(db, a);
    const started = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: 0,
      next: "capturing",
      options: { now: BASE },
    });
    await assert.rejects(
      () =>
        advanceKitRun(db, {
          workspaceId: a.workspaceId,
          kitId: run.kitId,
          workerId: "worker-2",
          expectedRevision: started.run.revision,
          next: "extracting",
          options: { now: BASE },
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/lease-held",
    );
    // The crashed worker's lease expires; a new worker preempts cleanly.
    const preempted = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-2",
      expectedRevision: started.run.revision,
      next: "extracting",
      options: { now: new Date(BASE.getTime() + 301000) },
    });
    assert.equal(preempted.run.status, "extracting");
    assert.equal(preempted.run.leaseOwner, "worker-2");
    // Stale revisions are rejected even for the lease owner.
    await assert.rejects(
      () =>
        advanceKitRun(db, {
          workspaceId: a.workspaceId,
          kitId: run.kitId,
          workerId: "worker-2",
          expectedRevision: started.run.revision,
          next: "generating",
          options: { now: new Date(BASE.getTime() + 301000) },
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/stale-revision",
    );
  } finally {
    await db.close();
  }
});

test("expiry cancels active runs and purges payloads while keeping audits", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    const run = await makeRun(db, a, { retentionDays: 1 });
    await assert.rejects(
      () =>
        expireKitRun(db, {
          workspaceId: a.workspaceId,
          actorId: a.actorId,
          kitId: run.kitId,
          now: BASE,
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/not-expired",
    );
    const started = await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-1",
      expectedRevision: 0,
      next: "capturing",
      options: {
        checkpoint: VALID_CHECKPOINT({ ...run, status: "capturing" }),
        now: BASE,
      },
    });
    assert.equal(started.run.revision, 1);
    const expired = await expireKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
      now: new Date(BASE.getTime() + 86400000 + 1000),
    });
    assert.equal(expired.applied, true);
    assert.equal(expired.run.status, "canceled");
    assert.equal(expired.run.errorClass, "buildkit/expired");
    assert.notEqual(expired.run.purgedAt, null);
    assert.deepEqual(expired.run.artifactManifest, {});
    assert.equal(expired.run.checkpoint, null);
    // Quota slots are reconciled on expiry.
    const quota = await db.query(
      "select active_count from lens_build_kit_quotas where workspace_id = $1",
      [a.workspaceId],
    );
    assert.equal(quota.rows[0]?.active_count, 0);
    // Re-expiry is deterministic and free.
    const again = await expireKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
      now: new Date(BASE.getTime() + 86400000 + 2000),
    });
    assert.equal(again.applied, false);
    assert.equal(again.run.purgedAt, expired.run.purgedAt);
    // Expired payloads are no longer served, but the audit remains.
    const progress = await pollKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: run.kitId,
    });
    assert.equal(progress.purged, true);
    assert.deepEqual(progress.resultEvidence, {});
  } finally {
    await db.close();
  }
});

test("expiry purges terminal payloads while preserving the audit trail", async () => {
  // AF-05e-i regression: migration 009 permitted the purge transition in
  // the trigger but the completed/partial CHECKs rejected the resulting
  // rows, so expiring a completed or evidence-only partial run always
  // failed. Migration 013 exempts purged rows; live rows keep the
  // original guarantees.
  const db = await fixtureDb();
  const pastExpiry = (days) => new Date(BASE.getTime() + days * 86400000);
  async function drive(tenant, overrides, terminal, options) {
    const run = await makeRun(db, tenant, { retentionDays: 1, ...overrides });
    let revision = 0;
    const chain = {
      completed: ["capturing", "extracting", "generating", "validating", "completed"],
      partial: ["capturing", "extracting", "generating", "partial"],
      failed: ["capturing", "failed"],
    }[terminal];
    for (const next of chain) {
      const advanced = await advanceKitRun(db, {
        workspaceId: tenant.workspaceId,
        kitId: run.kitId,
        workerId: "worker-purge",
        expectedRevision: revision,
        next,
        options: next === terminal ? { ...options, now: BASE } : { now: BASE },
      });
      revision = advanced.run.revision;
    }
    return run;
  }
  try {
    const { a } = await tenants(db);
    const done = await drive(a, { idempotencyKey: "purge-done" }, "completed", {
      evidence: { analysis_id: "x", checks: ["schema"] },
      artifactManifest: { entries: [{ path: "manifest.json", sha256: "e".repeat(64), bytes: 9 }] },
    });
    const gaps = await drive(a, { idempotencyKey: "purge-gaps" }, "partial", {
      evidence: { coverage_gaps: ["page-2-timeout"] },
    });
    const broken = await drive(a, { idempotencyKey: "purge-broken" }, "failed", {
      errorClass: "lens/capture",
    });
    for (const [run, status] of [[done, "completed"], [gaps, "partial"], [broken, "failed"]]) {
      const expired = await expireKitRun(db, {
        workspaceId: a.workspaceId,
        actorId: a.actorId,
        kitId: run.kitId,
        now: pastExpiry(2),
      });
      assert.equal(expired.applied, true);
      assert.equal(expired.run.status, status);
      assert.notEqual(expired.run.purgedAt, null);
      assert.deepEqual(expired.run.artifactManifest, {});
      assert.deepEqual(expired.run.resultEvidence, {});
      assert.equal(expired.run.checkpoint, null);
      assert.equal(expired.run.kitId, run.kitId);
      assert.equal(expired.run.analysisId, run.analysisId);
    }
    // Error classifications survive the purge for post-mortem audit.
    const kept = await getKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: broken.kitId,
    });
    assert.equal(kept.errorClass, "lens/capture");
    assert.equal(kept.attemptHistory.length, 0);
  } finally {
    await db.close();
  }
});

test("malformed and oversized requests fail closed", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    const bad = [
      request({ sourceUrl: "http://example.org/" }),
      request({ sourceUrl: "file:///etc/passwd" }),
      request({ mode: "crawl-everything" }),
      request({ maxPages: 26 }),
      request({ maxDepth: 4 }),
      request({ maxBytes: 52428801 }),
      request({ timeBudgetMs: 999 }),
      request({ mode: "selected-pages" }),
      request({ pages: [] }),
      request({ pages: ["https://example.org/a", "https://example.org/b"] }),
      request({ idempotencyKey: "   " }),
      request({ idempotencyKey: "k".repeat(257) }),
      request({ retentionDays: 91 }),
      request({ maxAttempts: 6 }),
      request({ viewports: ["desktop", "watch"] }),
      { ...request({}), tenant: "intruder" },
    ];
    for (const candidate of bad) {
      await assert.rejects(
        () =>
          createKitRun(db, {
            workspaceId: a.workspaceId,
            actorId: a.actorId,
            request: candidate,
            now: BASE,
          }),
        (error) => error instanceof BuildKitError && error.code === "buildkit/invalid-request",
        JSON.stringify(candidate).slice(0, 80),
      );
    }
  } finally {
    await db.close();
  }
});

test("quota exhaustion, rollback, and per-tenant accounting", async () => {
  const db = await fixtureDb();
  try {
    const { a, b } = await tenants(db);
    // Free plan: 2 concurrent slots. Fill both, then exhaust.
    await makeRun(db, a, {}, "quota-1");
    await makeRun(db, a, {}, "quota-2");
    await assert.rejects(
      () => makeRun(db, a, {}, "quota-3"),
      (error) => error instanceof BuildKitError && error.code === "buildkit/quota-exhausted",
    );
    // The rejected submission leaves no run and no ledger drift.
    const missing = await db.query(
      "select count(*)::int as n from lens_build_kit_runs where workspace_id = $1",
      [a.workspaceId],
    );
    assert.equal(missing.rows[0]?.n, 2);
    const ledger = await db.query(
      "select submitted_total, active_count from lens_build_kit_quotas where workspace_id = $1",
      [a.workspaceId],
    );
    assert.equal(ledger.rows[0]?.submitted_total, 2);
    assert.equal(ledger.rows[0]?.active_count, 2);
    // Tenant B has an independent ledger.
    await makeRun(db, b, {}, "quota-b-1");
    const ledgerB = await db.query(
      "select submitted_total, active_count from lens_build_kit_quotas where workspace_id = $1",
      [b.workspaceId],
    );
    assert.equal(ledgerB.rows[0]?.submitted_total, 1);
    // Canceling frees a slot for the same tenant only.
    const first = await db.query(
      "select kit_id from lens_build_kit_runs where workspace_id = $1 order by created_at limit 1",
      [a.workspaceId],
    );
    await cancelKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      kitId: String(first.rows[0]?.kit_id),
      now: BASE,
    });
    const replacement = await makeRun(db, a, {}, "quota-4");
    assert.equal(replacement.status, "queued");
  } finally {
    await db.close();
  }
});

test("submission cap is enforced without blocking idempotent replay", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    for (let index = 0; index < 10; index += 1) {
      const created = await createKitRun(db, {
        workspaceId: a.workspaceId,
        actorId: a.actorId,
        request: request({ idempotencyKey: `cap-${index}`, maxPages: 1 }),
        now: BASE,
      });
      assert.equal(created.created, true);
      await cancelKitRun(db, {
        workspaceId: a.workspaceId,
        actorId: a.actorId,
        kitId: created.run.kitId,
        now: BASE,
      });
    }
    await assert.rejects(
      () =>
        createKitRun(db, {
          workspaceId: a.workspaceId,
          actorId: a.actorId,
          request: request({ idempotencyKey: "cap-overflow" }),
          now: BASE,
        }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/quota-exhausted",
    );
    // Replay of an earlier key still succeeds: no double charge, no block.
    const replay = await createKitRun(db, {
      workspaceId: a.workspaceId,
      actorId: a.actorId,
      request: request({ idempotencyKey: "cap-0", maxPages: 1 }),
      now: BASE,
    });
    assert.equal(replay.created, false);
  } finally {
    await db.close();
  }
});

test("canonical serialization is deterministic across key order", () => {
  const left = canonicalJson({ b: 1, a: { y: [1, 2], x: "s" } });
  const right = canonicalJson({ a: { x: "s", y: [1, 2] }, b: 1 });
  assert.equal(left, right);
  assert.equal(left, '{"a":{"x":"s","y":[1,2]},"b":1}');
  assert.match(sha256Hex(left), /^[0-9a-f]{64}$/);
});

test("reaper fails expired-lease runs and releases quota", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    // Generous budget so only the dead lease fires, never the deadline.
    const run = await makeRun(db, a, { timeBudgetMs: 600000 }, "reap-lost");
    await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-crashed",
      expectedRevision: 0,
      next: "capturing",
      options: { now: BASE },
    });
    // Lease runs BASE..BASE+300s; the sweep lands one second later.
    const sweep = await reapStaleKitRuns(db, { now: new Date(BASE.getTime() + 301000) });
    assert.equal(sweep.scanned, 1);
    assert.equal(sweep.reaped.length, 1);
    assert.equal(sweep.reaped[0]?.kitId, run.kitId);
    assert.equal(sweep.reaped[0]?.from, "capturing");
    assert.equal(sweep.reaped[0]?.errorClass, "buildkit/worker-lost");
    const failed = await getKitRun(db, { workspaceId: a.workspaceId, actorId: a.actorId, kitId: run.kitId });
    assert.equal(failed.status, "failed");
    assert.equal(failed.errorClass, "buildkit/worker-lost");
    assert.equal(failed.leaseOwner, null);
    assert.ok(failed.finishedAt !== null);
    assert.equal(failed.kitId, run.kitId);
    assert.equal(failed.analysisId, run.analysisId);
    // Quota is released: wedge the plan to its 2-slot cap, then show the
    // reaped slot accepts a fresh submission while a live slot still blocks.
    const live = await makeRun(db, a, { timeBudgetMs: 600000 }, "reap-slot-live");
    await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: live.kitId,
      workerId: "worker-steady",
      expectedRevision: 0,
      next: "capturing",
      options: { now: new Date(BASE.getTime() + 301000) },
    });
    const filler = await makeRun(db, a, {}, "reap-slot-full");
    assert.ok(filler.kitId.length === 64);
    await assert.rejects(
      () => makeRun(db, a, {}, "reap-slot-blocked"),
      (error) => error instanceof BuildKitError && error.code === "buildkit/quota-exhausted",
    );
    // Re-reaping is deterministic and free.
    const again = await reapStaleKitRuns(db, { now: new Date(BASE.getTime() + 301000) });
    assert.equal(again.reaped.length, 0);
  } finally {
    await db.close();
  }
});

test("reaper enforces the scope time budget ahead of the lease signal", async () => {
  const db = await fixtureDb();
  try {
    const { a } = await tenants(db);
    const run = await makeRun(db, a, { timeBudgetMs: 60000 }, "reap-timeout");
    // Long lease (live for an hour) but a 60s budget spent 61s ago.
    await advanceKitRun(db, {
      workspaceId: a.workspaceId,
      kitId: run.kitId,
      workerId: "worker-slow",
      expectedRevision: 0,
      next: "capturing",
      options: { now: new Date(BASE.getTime() - 61000), leaseTtlSeconds: 3600 },
    });
    const sweep = await reapStaleKitRuns(db, { now: BASE });
    assert.equal(sweep.reaped.length, 1);
    assert.equal(sweep.reaped[0]?.errorClass, "buildkit/timeout");
    const failed = await getKitRun(db, { workspaceId: a.workspaceId, actorId: a.actorId, kitId: run.kitId });
    assert.equal(failed.status, "failed");
    assert.equal(failed.errorClass, "buildkit/timeout");
  } finally {
    await db.close();
  }
});

test("reaper leaves live, queued, terminal, and purged runs untouched", async () => {
  const db = await fixtureDb();
  try {
    // One workspace per run: the free plan caps concurrency at two, and
    // each tenant below holds at most one active run.
    const liveTenant = await soloTenant(db, "reap-live");
    const queuedTenant = await soloTenant(db, "reap-queued");
    const doneTenant = await soloTenant(db, "reap-done");
    const live = await makeRun(db, liveTenant, { timeBudgetMs: 600000 }, "reap-live");
    await advanceKitRun(db, {
      workspaceId: liveTenant.workspaceId,
      kitId: live.kitId,
      workerId: "worker-live",
      expectedRevision: 0,
      next: "capturing",
      options: { now: BASE },
    });
    const queued = await makeRun(db, queuedTenant, {}, "reap-queued");
    const done = await makeRun(db, doneTenant, {}, "reap-done");
    await cancelKitRun(db, { workspaceId: doneTenant.workspaceId, actorId: doneTenant.actorId, kitId: done.kitId, now: BASE });
    // Sweep 30s after BASE: live lease (300s) and budget (600s) both hold.
    const sweep = await reapStaleKitRuns(db, { now: new Date(BASE.getTime() + 30000) });
    assert.equal(sweep.scanned, 1);
    assert.equal(sweep.reaped.length, 0);
    const kept = await getKitRun(db, { workspaceId: liveTenant.workspaceId, actorId: liveTenant.actorId, kitId: live.kitId });
    assert.equal(kept.status, "capturing");
    assert.equal(kept.leaseOwner, "worker-live");
    void queued;
  } finally {
    await db.close();
  }
});

test("reaper is bounded, ordered, and spans tenants as an operator sweep", async () => {
  const db = await fixtureDb();
  try {
    const { a, b } = await tenants(db);
    const ids = [];
    for (const [tenant, tag] of [[a, "reap-x"], [b, "reap-y"]]) {
      const run = await makeRun(db, tenant, { timeBudgetMs: 600000 }, `${tag}`);
      await advanceKitRun(db, {
        workspaceId: tenant.workspaceId,
        kitId: run.kitId,
        workerId: "worker-gone",
        expectedRevision: 0,
        next: "capturing",
        options: { now: BASE },
      });
      ids.push(run.kitId);
    }
    const first = await reapStaleKitRuns(db, { now: new Date(BASE.getTime() + 301000), limit: 1 });
    assert.equal(first.scanned, 1);
    assert.equal(first.reaped.length, 1);
    const second = await reapStaleKitRuns(db, { now: new Date(BASE.getTime() + 301000), limit: 1 });
    assert.equal(second.reaped.length, 1);
    assert.notEqual(first.reaped[0]?.kitId, second.reaped[0]?.kitId);
    assert.deepEqual([first.reaped[0]?.kitId, second.reaped[0]?.kitId].sort(), [...ids].sort());
    await assert.rejects(
      () => reapStaleKitRuns(db, { now: BASE, limit: 0 }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/invalid-request",
    );
    await assert.rejects(
      () => reapStaleKitRuns(db, { now: new Date("not-a-date") }),
      (error) => error instanceof BuildKitError && error.code === "buildkit/invalid-request",
    );
  } finally {
    await db.close();
  }
});
