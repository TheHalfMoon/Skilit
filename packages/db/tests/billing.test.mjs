import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateDown, migrateUp } from "../src/migrate.ts";
import { AuthError, signUp } from "../src/auth.ts";
import { createWorkspace } from "../src/workspaces.ts";
import {
  WebhookError,
  capabilitiesFor,
  getSubscription,
  handleBillingEvent,
  setSubscription,
  verifyWebhookSignature,
} from "../src/billing.ts";

const SEVEN = [
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
const SECRET = "whsec_test_fixture_only_not_a_secret";
const NOW = new Date("2026-10-09T03:00:00.000Z");

function signBody(body, timestamp, secret = SECRET) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function timestampOf(date) {
  return Math.floor(date.getTime() / 1000);
}

async function fixtureDb() {
  const db = await openDatabase();
  await migrateUp(db);
  return db;
}

async function workspaceFixture(db) {
  const user = await signUp(db, {
    email: "billing-fixture@skilit.example",
    password: "billing-password-01",
  });
  const created = await createWorkspace(db, {
    name: "Billing fixture",
    ownerId: user.id,
  });
  return created.workspace.id;
}

test("007 migration applies billing tables and reverses cleanly", async () => {
  const db = await openDatabase();
  try {
    assert.deepEqual(await migrateUp(db), SEVEN);
    for (const table of ["subscriptions", "billing_events"]) {
      const check = await db.query("select to_regclass($1) as oid", [`public.${table}`]);
      assert.notEqual(check.rows[0]?.oid, null, `missing table ${table}`);
    }
    assert.deepEqual(await migrateDown(db), [...SEVEN].reverse());
    assert.deepEqual(await migrateUp(db), SEVEN);
    await assert.rejects(
      () =>
        db.query(
          `insert into billing_events (provider, event_id, event_type)
           values ('stripe', '   ', 'customer.created')`,
        ),
      /check|violates/i,
    );
  } finally {
    await db.close();
  }
});

test("capability plan model carries no prices and rejects unknown plans", async () => {
  const free = capabilitiesFor("free");
  assert.equal(free.includedSeats, 1);
  assert.equal(free.agentWrites, false);
  const pro = capabilitiesFor("pro");
  assert.ok(pro.lensJobsPerMonth > free.lensJobsPerMonth);
  assert.equal(pro.agentWrites, true);
  const team = capabilitiesFor("team");
  assert.ok(team.maxWorkspaces > pro.maxWorkspaces);
  assert.ok(team.storageBytes > pro.storageBytes);
  for (const plan of [free, pro, team]) {
    assert.ok(!("price" in plan) && !("amount" in plan), "prices stay configuration");
  }
  assert.throws(
    () => capabilitiesFor("enterprise"),
    (error) => error instanceof AuthError && error.code === "auth/invalid-plan",
  );
});

test("webhook signatures verify exactly and fail closed", async () => {
  const body = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
  const stamp = timestampOf(NOW);
  const good = verifyWebhookSignature({
    rawBody: body,
    signatureHeader: signBody(body, stamp),
    secret: SECRET,
    now: NOW,
  });
  assert.equal(good.eventTimestamp, NOW.toISOString());
  const tampered = `${body} `;
  assert.throws(
    () =>
      verifyWebhookSignature({
        rawBody: tampered,
        signatureHeader: signBody(body, stamp),
        secret: SECRET,
        now: NOW,
      }),
    (error) => error instanceof WebhookError && error.code === "billing/invalid-signature",
  );
  assert.throws(
    () =>
      verifyWebhookSignature({
        rawBody: body,
        signatureHeader: signBody(body, stamp, "whsec_wrong"),
        secret: SECRET,
        now: NOW,
      }),
    (error) => error instanceof WebhookError && error.code === "billing/invalid-signature",
  );
  assert.throws(
    () =>
      verifyWebhookSignature({
        rawBody: body,
        signatureHeader: signBody(body, stamp - 301),
        secret: SECRET,
        now: NOW,
      }),
    (error) => error instanceof WebhookError && error.code === "billing/invalid-signature",
  );
  for (const delta of [0, 299, 300]) {
    const accepted = verifyWebhookSignature({
      rawBody: body,
      signatureHeader: signBody(body, stamp - delta),
      secret: SECRET,
      now: NOW,
    });
    assert.equal(accepted.eventTimestamp, new Date((stamp - delta) * 1000).toISOString());
  }
  assert.throws(
    () =>
      verifyWebhookSignature({
        rawBody: body,
        signatureHeader: signBody(body, stamp + 10),
        secret: SECRET,
        now: NOW,
      }),
    (error) => error instanceof WebhookError && error.code === "billing/invalid-signature",
  );
  for (const header of ["", "t=abc,v1=deadbeef", "v1=deadbeef", "t=123"]) {
    assert.throws(
      () => verifyWebhookSignature({ rawBody: body, signatureHeader: header, secret: SECRET, now: NOW }),
      (error) => error instanceof WebhookError && error.code === "billing/invalid-signature",
      `header must be rejected: ${header}`,
    );
  }
  assert.throws(
    () => verifyWebhookSignature({ rawBody: body, signatureHeader: signBody(body, stamp), secret: "", now: NOW }),
    (error) => error instanceof WebhookError && error.code === "billing/not-configured",
  );
  const rotationHeader = `t=${stamp},v1=${"deadbeef".repeat(8)},v1=${signBody(body, stamp).split("v1=")[1]}`;
  const rotated = verifyWebhookSignature({
    rawBody: body,
    signatureHeader: rotationHeader,
    secret: SECRET,
    now: NOW,
  });
  assert.equal(rotated.eventTimestamp, NOW.toISOString());
  assert.throws(
    () =>
      verifyWebhookSignature({
        rawBody: body,
        signatureHeader: `t=${stamp},v1=${"deadbeef".repeat(8)}`,
        secret: SECRET,
        now: NOW,
      }),
    (error) => error instanceof WebhookError && error.code === "billing/invalid-signature",
  );
});

test("billing events apply once under replay", async () => {
  const db = await fixtureDb();
  try {
    const workspaceId = await workspaceFixture(db);
    let applications = 0;
    const apply = async (tx) => {
      applications += 1;
      await setSubscriptionVia(tx, workspaceId);
    };
    const first = await handleBillingEvent(db, {
      eventId: "evt_replay_1",
      eventType: "customer.subscription.updated",
      payload: { plan: "pro", seats: 5 },
      apply,
    });
    assert.equal(first.applied, true);
    const second = await handleBillingEvent(db, {
      eventId: "evt_replay_1",
      eventType: "customer.subscription.updated",
      payload: { plan: "pro", seats: 5 },
      apply,
    });
    assert.equal(second.applied, false);
    assert.equal(applications, 1);
    const subscription = await getSubscription(db, workspaceId);
    assert.equal(subscription?.planKey, "pro");
    assert.equal(subscription?.seats, 5);
    const ledger = await db.query(
      "select applied_at from billing_events where event_id = $1",
      ["evt_replay_1"],
    );
    assert.notEqual(ledger.rows[0]?.applied_at, null);
  } finally {
    await db.close();
  }
});

test("concurrent duplicate deliveries converge to one application", async () => {
  const db = await fixtureDb();
  try {
    const workspaceId = await workspaceFixture(db);
    let applications = 0;
    const deliver = () =>
      handleBillingEvent(db, {
        eventId: "evt_race_1",
        eventType: "customer.subscription.updated",
        payload: { plan: "pro", seats: 3 },
        apply: async (tx) => {
          applications += 1;
          await setSubscriptionVia(tx, workspaceId);
        },
      });
    const outcomes = await Promise.allSettled([deliver(), deliver()]);
    const applied = outcomes.filter(
      (outcome) => outcome.status === "fulfilled" && outcome.value.applied,
    );
    const skipped = outcomes.filter(
      (outcome) => outcome.status === "fulfilled" && !outcome.value.applied,
    );
    assert.equal(applied.length, 1);
    assert.equal(skipped.length, 1);
    assert.equal(applications, 1);
  } finally {
    await db.close();
  }
});

async function setSubscriptionVia(tx, workspaceId) {
  await tx.query(
    `insert into subscriptions (workspace_id, plan_key, status, seats)
     values ($1, 'pro', 'active', 5)
     on conflict (workspace_id) do update set plan_key = 'pro', seats = 5`,
    [workspaceId],
  );
}

test("failed event application rolls back intake for redelivery", async () => {
  const db = await fixtureDb();
  try {
    await assert.rejects(
      () =>
        handleBillingEvent(db, {
          eventId: "evt_poison_1",
          eventType: "customer.subscription.updated",
          apply: async () => {
            throw new Error("downstream outage");
          },
        }),
      /downstream outage/,
    );
    const ledger = await db.query("select count(*)::int as n from billing_events where event_id = $1", [
      "evt_poison_1",
    ]);
    assert.equal(ledger.rows[0]?.n, 0);
    const retry = await handleBillingEvent(db, {
      eventId: "evt_poison_1",
      eventType: "customer.subscription.updated",
      apply: async () => {},
    });
    assert.equal(retry.applied, true);
  } finally {
    await db.close();
  }
});

test("subscription provisioning validates plans, seats, and workspaces", async () => {
  const db = await fixtureDb();
  try {
    const workspaceId = await workspaceFixture(db);
    const created = await setSubscription(db, {
      workspaceId,
      planKey: "team",
      seats: 5,
      stripeCustomerId: "cus_fixture",
      currentPeriodEnd: "2026-11-09T03:00:00.000Z",
    });
    assert.equal(created.planKey, "team");
    assert.equal(created.status, "active");
    assert.equal(created.stripeCustomerId, "cus_fixture");
    const replaced = await setSubscription(db, {
      workspaceId,
      planKey: "pro",
      status: "past_due",
      seats: 2,
    });
    assert.equal(replaced.planKey, "pro");
    assert.equal(replaced.status, "past_due");
    assert.equal(replaced.stripeCustomerId, null);
    await assert.rejects(
      () => setSubscription(db, { workspaceId, planKey: "enterprise" }),
      (error) => error instanceof AuthError && error.code === "auth/invalid-plan",
    );
    await assert.rejects(
      () => setSubscription(db, { workspaceId, planKey: "pro", seats: 0 }),
      (error) => error instanceof AuthError && error.code === "auth/invalid-subscription",
    );
    await assert.rejects(
      () => setSubscription(db, { workspaceId, planKey: "pro", status: "trialing" }),
      (error) => error instanceof AuthError && error.code === "auth/invalid-subscription",
    );
    assert.equal(
      await getSubscription(db, "00000000-0000-0000-0000-000000000000"),
      null,
    );
    await assert.rejects(
      () => setSubscription(db, { workspaceId, planKey: "pro", currentPeriodEnd: "not-a-date" }),
      (error) => error instanceof AuthError && error.code === "auth/invalid-subscription",
    );
    assert.throws(
      () =>
        verifyWebhookSignature({
          rawBody: "{}",
          signatureHeader: signBody("{}", timestampOf(NOW)),
          secret: SECRET,
          toleranceSeconds: NaN,
          now: NOW,
        }),
      (error) => error instanceof WebhookError && error.code === "billing/invalid-event",
    );
    await assert.rejects(
      () =>
        setSubscription(db, {
          workspaceId: "00000000-0000-0000-0000-000000000000",
          planKey: "pro",
        }),
      (error) => error instanceof AuthError && error.code === "auth/workspace-not-found",
    );
    await assert.rejects(
      () =>
        handleBillingEvent(db, { eventId: "", eventType: "x", apply: async () => {} }),
      (error) => error instanceof WebhookError && error.code === "billing/invalid-event",
    );
    await assert.rejects(
      () =>
        handleBillingEvent(db, {
          provider: "other",
          eventId: "evt_other_1",
          eventType: "x",
          apply: async () => {},
        }),
      (error) => error instanceof WebhookError && error.code === "billing/invalid-event",
    );
  } finally {
    await db.close();
  }
});
