import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { openDatabase } from "../../db/src/db.ts";
import { migrateUp } from "../../db/src/migrate.ts";
import { createSource } from "../../db/src/repositories.ts";
import {
  CorpusError,
  importCorpusFixture,
  importQualifiedResearchCorpus,
  validateQualifiedCorpusInput,
} from "../src/corpus.ts";

const REVISION = "0123456789abcdef".repeat(2) + "01234567";
const evidence = () => ({
  originUrl: `https://example.invalid/design/blob/${REVISION}/screen.tsx`,
  sourceRevision: REVISION,
  rightsHolder: "Synthetic Example Owner",
  rightsBasis: "open-license",
  licenseId: "MIT",
  licenseEvidenceUrl: `https://example.invalid/design/blob/${REVISION}/LICENSE`,
  reviewRef: "CB-05-synthetic-test-only",
});
const corpus = () => ({
  products: [{
    externalId: "synthetic-product",
    title: "Synthetic product, NOT REAL CORPUS",
    versions: [{
      versionNo: 1,
      artifacts: [{
        externalId: "synthetic-screen",
        kind: "screen", title: "Synthetic sample screen",
        tags: ["synthetic"],
        rightsClassification: "permitted",
        rightsEvidence: evidence(),
      }],
      flows: [{
        externalId: "synthetic-flow", title: "Synthetic login flow",
        steps: [{ artifactExternalId: "synthetic-screen", position: 0 }],
      }],
    }],
  }],
});

async function fixture() {
  const db = await openDatabase();
  await migrateUp(db);
  const source = await createSource(db, {
    key: "cb05-synthetic-source",
    kind: "synthetic",
  });
  return { db, source };
}
const opts = (fx, data = corpus()) => ({
  sourceId: fx.source.id,
  sourceVersion: "cb05-test-fixture-v1",
  corpus: data,
});

test("CB-05 research admission records exact provenance with a replay-safe fingerprint", async () => {
  const fx = await fixture();
  try {
    const first = await importQualifiedResearchCorpus(fx.db, opts(fx));
    assert.deepEqual({
      products: first.products, versions: first.versions,
      artifacts: first.artifacts, flows: first.flows,
      steps: first.steps, replayed: first.replayed,
    }, { products: 1, versions: 1, artifacts: 1, flows: 1, steps: 1, replayed: false });

    const result = await fx.db.query("select metadata from artifacts where title = $1",
      ["Synthetic sample screen"]);
    assert.equal(result.rows.length, 1);
    const metadata = result.rows[0].metadata;
    assert.equal(metadata.corpus, true);
    assert.deepEqual(metadata.tags, ["synthetic"]);
    assert.deepEqual(metadata.rightsEvidence, evidence());

    const oldRows = await fx.db.query("select count(*)::int as n from import_records");
    const shuffled = corpus();
    shuffled.products[0].versions[0].artifacts[0].rightsEvidence = Object.fromEntries(
      Object.entries(evidence()).reverse(),
    );
    const replay = await importQualifiedResearchCorpus(fx.db, opts(fx, shuffled));
    assert.equal(replay.replayed, true, "JSON key order must not alter rights evidence identity");
    const newRows = await fx.db.query("select count(*)::int as n from import_records");
    assert.deepEqual(newRows.rows, oldRows.rows);

    const changedEvidence = corpus();
    changedEvidence.products[0].versions[0].artifacts[0].rightsEvidence.reviewRef = "CB-05-review-replaced";
    await assert.rejects(importQualifiedResearchCorpus(fx.db, opts(fx, changedEvidence)),
      (error) => error instanceof CorpusError && error.code === "corpus/conflict");
    // No second artifact was admitted under altered evidence.
    const artifacts = await fx.db.query("select count(*)::int as n from artifacts");
    assert.equal(artifacts.rows[0].n, 1);
  } finally {
    await fx.db.close();
  }
});

test("CB-05 missing/unreviewed rights evidence is rejected before any writes", async () => {
  const fx = await fixture();
  try {
    const before = await fx.db.query("select count(*)::int as n from products");
    const cases = [
      (c) => { delete c.products[0].versions[0].artifacts[0].rightsEvidence; },
      (c) => { c.products[0].versions[0].artifacts[0].rightsClassification = "unknown"; },
      (c) => { c.products[0].versions[0].artifacts[0].rightsEvidence.originUrl = "http://localhost:1234/private"; },
      (c) => { c.products[0].versions[0].artifacts[0].rightsEvidence.licenseEvidenceUrl = "https://user:secret@example.invalid/license"; },
      (c) => { c.products[0].versions[0].artifacts[0].rightsEvidence.originUrl = "https://example.invalid/path?token=private"; },
      (c) => { c.products[0].versions[0].artifacts[0].rightsEvidence.licenseEvidenceUrl = "javascript:alert(1)"; },
      (c) => { c.products[0].versions[0].artifacts[0].rightsEvidence.sourceRevision = "main"; },
      (c) => { c.products[0].versions[0].artifacts[0].rightsEvidence.rightsBasis = "unchecked"; },
      (c) => { c.products[0].versions[0].artifacts[0].rightsEvidence.rightsHolder = ""; },
      (c) => { c.products[0].versions[0].artifacts[0].rightsEvidence.reviewRef = ""; },
      (c) => { c.products[0].versions[0].artifacts[0].rightsEvidence.apiToken = "SHOULD-NOT-BE-ACCEPTED"; },
    ];
    for (const mutate of cases) {
      const data = corpus();
      mutate(data);
      assert.throws(() => validateQualifiedCorpusInput(data),
        (error) => error instanceof CorpusError && error.code === "corpus/invalid-input");
      await assert.rejects(importQualifiedResearchCorpus(fx.db, opts(fx, data)),
        (error) => error instanceof CorpusError && error.code === "corpus/invalid-input");
    }
    const after = await fx.db.query("select count(*)::int as n from products");
    assert.deepEqual(after.rows, before.rows);
  } finally {
    await fx.db.close();
  }
});

test("CB-05 old fixture importer remains explicitly usable and identity-compatible", async () => {
  const fx = await fixture();
  try {
    const legacy = corpus();
    delete legacy.products[0].versions[0].artifacts[0].rightsEvidence;
    const result = await importCorpusFixture(fx.db, opts(fx, legacy));
    assert.equal(result.artifacts, 1);
    const row = await fx.db.query("select metadata, product_version_id from artifacts where title=$1", ["Synthetic sample screen"]);
    assert.equal(Object.hasOwn(row.rows[0].metadata, "rightsEvidence"), false);
    const oldShape = {
      kind: "screen", title: "Synthetic sample screen",
      summary: null, tags: ["synthetic"],
      rights: "permitted", versionId: row.rows[0].product_version_id,
    };
    const historicalPrint = createHash("sha256").update(JSON.stringify(oldShape)).digest("hex");
    const ledger = await fx.db.query("select metadata from import_records where external_id=$1",
      ["artifact:synthetic-product:1:synthetic-screen"]);
    assert.equal(ledger.rows[0].metadata.fingerprint, historicalPrint,
      "old fixtures must retain the original schema-free fingerprint");
    const replay = await importCorpusFixture(fx.db, opts(fx, legacy));
    assert.equal(replay.replayed, true);
  } finally {
    await fx.db.close();
  }
});
