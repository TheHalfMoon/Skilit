import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateDown, migrateUp } from "../src/migrate.ts";
import { createSource, createProduct, createProductVersion } from "../src/repositories.ts";
import { createArtifact, createAsset, createPattern, createRelation, getAssetByHash } from "../src/graph.ts";

const url = process.env.SKILIT_TEST_DATABASE_URL;
const enabled = Boolean(url);

function verifyFixture() {
  if (!url || process.env.SKILIT_DB_TEST_CONFIRM !== "yes") throw new Error("Fixture confirmation required");
  const u = new URL(url);
  if (!["127.0.0.1","localhost"].includes(u.hostname) ||
    u.pathname !== "/skilit_test" || u.username !== "skilit_test") {
    throw new Error("Refusing to run on non-fixture PostgreSQL");
  }
}

test("real PostgreSQL round-trips design graph and blocks invalid raw SQL", { skip: !enabled }, async () => {
  verifyFixture();
  const db = await openDatabase({ connectionString: url });
  try {
    assert.deepEqual(await migrateUp(db), ["001_sources_products", "002_design_graph", "003_workflows", "004_auth", "005_workspaces", "006_collections_auth", "007_billing", "008_jobs", "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
    const source = await createSource(db,{key:"pg-fixture",kind:"test"});
    const product = await createProduct(db,{sourceId:source.id,title:"Real PostgreSQL"});
    const version = await createProductVersion(db,{productId:product.id,versionNo:1});
    const hash="a".repeat(64);
    const artifact=await createArtifact(db,{sourceId:source.id,productId:product.id,
      productVersionId:version.id,kind:"screen",title:"Real screen",
      contentHash:hash,rightsClassification:"permitted",visibility:"public"});
    const asset=await createAsset(db,{sha256:hash,mediaType:"image/png",byteLength:17,
      storageKey:"fixtures/hash",sourceId:source.id,rightsClassification:"restricted"});
    const pattern=await createPattern(db,{slug:"screen-layout",title:"Screen layout",sourceId:source.id});
    const edge=await createRelation(db,{fromType:"artifact",fromId:artifact.id,
      relationType:"uses",toType:"pattern",toId:pattern.id,confidence:0.5});
    assert.equal(edge.toId,pattern.id);
    assert.equal((await getAssetByHash(db,hash)).id,asset.id);
    const secondary=await createSource(db,{key:"pg-secondary",kind:"test"});
    await assert.rejects(
      () => createAsset(db,{sha256:hash,mediaType:"image/png",byteLength:17,
        storageKey:"fixtures/hash",sourceId:secondary.id,
        rightsClassification:"restricted"}),
      /Asset provenance or rights conflict/,
    );
    await assert.rejects(
      () => db.query("delete from artifacts where id=$1",[artifact.id]),
      /graph endpoint still referenced/,
    );
    await assert.rejects(
      () => db.query("insert into relations(from_type,from_id,relation_type,to_type,to_id) values('artifact',$1,'uses','pattern',$2)",[
        artifact.id,"00000000-0000-4000-8000-000000000000",
      ]),
      /graph relation target endpoint not found/,
    );
    await assert.rejects(
      () => db.query("insert into artifacts(id,kind,title,source_id,content_hash,rights_classification,visibility) values($1,'screen','Invalid',$2,$3,'restricted','public')",[
        "0199d8d7-8000-7000-8000-000000000001", source.id, hash,
      ]),
      /check|violates/i,
    );
  } finally {
    await migrateDown(db);
    await db.close();
  }
});

test("real PostgreSQL locks both sides of relation insert/delete races", {
  skip: !enabled,
  timeout: 20000,
}, async () => {
  verifyFixture();
  const db = await openDatabase({ connectionString: url });
  const other = await openDatabase({ connectionString: url });
  try {
    await migrateUp(db);
    const source = await createSource(db,{key:"pg-race",kind:"test"});
    const pattern=await createPattern(db,{slug:"race-pattern",title:"Race",sourceId:source.id});
    const hash="c".repeat(64);

    // Edge first, DELETE second: deletion must wait and then be rejected.
    const a=await createArtifact(db,{kind:"screen",title:"A",
      sourceId:source.id,contentHash:hash,rightsClassification:"unknown"});
    let ready=Promise.withResolvers();
    let release=Promise.withResolvers();
    const inserting=db.transaction(async (tx) => {
      await createRelation(tx,{fromType:"artifact",fromId:a.id,
        relationType:"uses",toType:"pattern",toId:pattern.id});
      ready.resolve();
      await release.promise;
    });
    await ready.promise;
    let deleteFinished=false;
    const deleting=other.query("delete from artifacts where id=$1",[a.id])
      .then(()=>({ok:true}),error=>({ok:false,error}))
      .finally(()=>{deleteFinished=true;});
    try {
      await new Promise(resolve=>setTimeout(resolve,150));
      assert.equal(deleteFinished,false,"delete must wait for relation insertion");
    } finally {
      release.resolve();
    }
    await inserting;
    const deleted=await deleting;
    assert.equal(deleted.ok,false);
    assert.match(deleted.error.message,/graph endpoint still referenced/);

    // DELETE first, edge second: reference lock waits, then sees absent row.
    const b=await createArtifact(db,{kind:"screen",title:"B",
      sourceId:source.id,contentHash:hash,rightsClassification:"unknown"});
    ready=Promise.withResolvers();
    release=Promise.withResolvers();
    const removing=db.transaction(async (tx)=>{
      await tx.query("delete from artifacts where id=$1",[b.id]);
      ready.resolve();
      await release.promise;
    });
    await ready.promise;
    let edgeFinished=false;
    const writing=createRelation(other,{fromType:"artifact",fromId:b.id,
      relationType:"uses",toType:"pattern",toId:pattern.id})
      .then(()=>({ok:true}),error=>({ok:false,error}))
      .finally(()=>{edgeFinished=true;});
    try {
      await new Promise(resolve=>setTimeout(resolve,150));
      assert.equal(edgeFinished,false,"edge insert must wait on deleted endpoint");
    } finally {
      release.resolve();
    }
    await removing;
    const inserted=await writing;
    assert.equal(inserted.ok,false);
    assert.match(inserted.error.message,/graph relation source endpoint not found/);
  } finally {
    await other.close();
    await migrateDown(db);
    await db.close();
  }
});
