import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase } from "../../../packages/db/src/db.ts";
import { migrateUp } from "../../../packages/db/src/migrate.ts";
import { createSource } from "../../../packages/db/src/repositories.ts";
import { signUp } from "../../../packages/db/src/auth.ts";
import { createWorkspace } from "../../../packages/db/src/workspaces.ts";
import { importQualifiedResearchCorpus } from "../../../packages/ingest/src/corpus.ts";
import { compareArtifactsRoute, getObjectRoute, searchAssetsRoute } from "../lib/rest.ts";
import { asComparison } from "../lib/compare-ui.ts";
import { parseScreenSearchPage } from "../lib/research-search-ui.ts";

const REV = "e".repeat(40);
const rightsEvidence = (screen) => ({
  originUrl: `https://example.invalid/${REV}/${screen}.html`,
  sourceRevision: REV,
  rightsHolder: "Synthetic Integration Owner",
  rightsBasis: "author-owned",
  licenseId: "MIT",
  licenseEvidenceUrl: `https://example.invalid/${REV}/LICENSE`,
  reviewRef: `integration-${screen}`,
});
test("six-PR rehearsal: qualified research screen -> actor search -> compare -> rendered UI contract",async () => {
  const db=await openDatabase();
  try {
    await migrateUp(db);
    const actor=await signUp(db,{email:"integration-actor@skilit.invalid",password:"synthetic-test-only-123"});
    const source=await createSource(db,{key:"integration-qualified-screen-source",kind:"synthetic"});
    const data={products:[{
      externalId:"integration-foo-product",title:"Research Test Product",
      versions:[{versionNo:1,
        artifacts:[
          {externalId:"checkout-start",kind:"screen",title:"Checkout onboarding start",
           summary:"Start with payment method",tags:["checkout","onboarding","start"],
           rightsClassification:"permitted",rightsEvidence:rightsEvidence("start")},
          {externalId:"checkout-end",kind:"screen",title:"Checkout onboarding finish",
           summary:"Finish and confirm payment",tags:["checkout","onboarding","finish"],
           rightsClassification:"permitted",rightsEvidence:rightsEvidence("end")},
        ],flows:[],
      }],
    }]};
    const imported=await importQualifiedResearchCorpus(db,{sourceId:source.id,sourceVersion:"synthetic-integration-v1",corpus:data});
    assert.equal(imported.artifacts,2);
    const search=await searchAssetsRoute(db,{query:"checkout",kinds:"screen"},actor.id);
    assert.equal(search.status,200);
    assert.equal(search.body.result.assets.length,2);
    const view=parseScreenSearchPage(search.body);
    assert.ok(view,"research UI parser must accept actual authorized REST response");
    assert.equal(view.screens.length,2);
    const left=view.screens[0].uri.split("/").at(-1);
    const right=view.screens[1].uri.split("/").at(-1);
    const diff=await compareArtifactsRoute(db,{left,right},actor.id);
    assert.equal(diff.status,200);
    const ui=asComparison(diff.body.result);
    assert.ok(ui,"compare UI parser must accept comparison of qualified screens");
    assert.equal(ui.left.kind,"screen");
    assert.equal(ui.right.kind,"screen");
    assert.equal(ui.fieldDiffs.length>0,true);
    const first=await getObjectRoute(db,`skilit://artifact/${left}`,actor.id);
    assert.equal(first.status,200);
    const metadata=await db.query("select metadata from artifacts where id=$1",[left]);
    assert.equal(metadata.rows[0].metadata.rightsEvidence.sourceRevision,REV);
  } finally {
    await db.close();
  }
});

test("combined corpus + search + compare preserve workspace membership rules", async () => {
  const db = await openDatabase();
  try {
    await migrateUp(db);
    const member = await signUp(db, {
      email: "joined@skilit.invalid", password: "synthetic-password-123",
    });
    const other = await signUp(db, {
      email: "separate@skilit.invalid", password: "synthetic-password-123",
    });
    const workspace = await createWorkspace(db, { name: "Research team", ownerId: member.id });
    const source = await createSource(db, { key: "research-boundary-synthetic", kind: "synthetic" });
    await importQualifiedResearchCorpus(db, {
      sourceId: source.id, sourceVersion: "synthetic-v1",
      corpus: { products: [{
        externalId: "research-boundary-product", title: "Synthetic design app",
        versions: [{ versionNo: 1, artifacts: [
          { externalId: "global", kind: "screen", title: "Checkout global",
            tags: ["checkout"], rightsClassification: "permitted", rightsEvidence: rightsEvidence("global") },
          { externalId: "team", kind: "screen", title: "Checkout team",
            tags: ["checkout"], rightsClassification: "permitted", rightsEvidence: rightsEvidence("team"),
            workspaceId: workspace.workspace.id, ownerSubject: member.id },
        ], flows: [] }],
      }] },
    });
    const found = await db.query("select id,title from artifacts where source_id=$1", [source.id]);
    const ids = Object.fromEntries(found.rows.map((row) => [row.title, row.id]));
    assert.ok(ids["Checkout global"] && ids["Checkout team"]);
    // Emulate a legacy workspace record whose visibility label is public.
    await db.query("update artifacts set visibility='public' where id=$1", [ids["Checkout team"]]);
    const otherSearch = await searchAssetsRoute(db, { query: "checkout", kinds: "screen", facets: "true" }, other.id);
    const memberSearch = await searchAssetsRoute(db, { query: "checkout", kinds: "screen", facets: "true" }, member.id);
    assert.deepEqual(otherSearch.body.result.assets.map((row) => row.title), ["Checkout global"]);
    assert.equal(otherSearch.body.result.facets.kinds[0].count, 1);
    assert.equal(memberSearch.body.result.assets.length, 2);
    const inaccessible = await compareArtifactsRoute(db, {
      left: ids["Checkout global"], right: ids["Checkout team"],
    }, other.id);
    assert.equal(inaccessible.status, 404);
    assert.equal((await compareArtifactsRoute(db, {
      left: ids["Checkout global"], right: ids["Checkout team"],
    }, member.id)).status, 200);
  } finally {
    await db.close();
  }
});
