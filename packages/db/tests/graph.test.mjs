import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateDown, migrateUp } from "../src/migrate.ts";
import { createSource, createProduct, createProductVersion } from "../src/repositories.ts";
import {
  createArtifact, createAsset, createPattern, createRelation,
  getArtifact, getAssetByHash, listRelations, uuidV7,
} from "../src/graph.ts";

const HASH = createHash("sha256").update("fixture").digest("hex");
const HASH2 = createHash("sha256").update("second").digest("hex");
const missing = "00000000-0000-4000-8000-000000000000";

async function context() {
  const db = await openDatabase();
  await migrateUp(db);
  const source = await createSource(db, { key: "fixture", kind: "test" });
  return { db, source };
}

test("migration 002 creates canonical graph entities and is reversible", async () => {
  const db = await openDatabase();
  try {
    assert.deepEqual(await migrateUp(db), ["001_sources_products", "002_design_graph", "003_workflows", "004_auth", "005_workspaces", "006_collections_auth", "007_billing", "008_jobs", "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
    assert.deepEqual(await migrateUp(db), []);
    for (const table of ["artifacts", "assets", "relations", "patterns"]) {
      const result = await db.query("select to_regclass($1) as id", ["public." + table]);
      assert.ok(result.rows[0].id !== null, "missing " + table);
    }
    assert.deepEqual(await migrateDown(db), ["019_workspace_invites", "018_skilit_rename", "017_replay_sessions", "016_corpus_flow_import", "015_collection_handoffs", "014_collection_item_order", "013_lens_build_kit_purge", "012_asset_search_fts", "011_pack_idempotency", "010_artifact_actor_scope", "009_lens_build_kit_runs", "008_jobs", "007_billing", "006_collections_auth", "005_workspaces", "004_auth", "003_workflows", "002_design_graph", "001_sources_products"]);
    assert.deepEqual(await migrateUp(db), ["001_sources_products", "002_design_graph", "003_workflows", "004_auth", "005_workspaces", "006_collections_auth", "007_billing", "008_jobs", "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
  } finally {
    await db.close();
  }
});

test("RFC 9562 UUIDv7 round-trips its timestamp and variant", () => {
  const millis = Date.parse("2026-10-09T00:00:00.000Z");
  const id = uuidV7(millis);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16), millis);
  assert.throws(() => uuidV7(-1), /range/);
});

test("all common artifact kinds are stored with verified source identity", async () => {
  const { db, source } = await context();
  try {
    const kinds = ["screen","page","section","component","icon","logo",
      "font","illustration","resource","brief","design"];
    for (const kind of kinds) {
      // AF-SEC-00: global rows without a workspace binding must be public
      // (public requires permitted rights), so the kinds matrix uses the
      // public corpus shape. Workspace-bound private rows are covered by
      // the dedicated actor-scope suite.
      const created = await createArtifact(db,{
        kind,title:"Example " + kind,sourceId:source.id,
        contentHash:HASH,rightsClassification:"permitted",
        visibility:"public",
        metadata:{category:kind},
      });
      assert.match(created.id, /-7[0-9a-f]{3}-/);
      assert.equal(created.kind,kind);
      assert.equal(created.visibility,"public");
      assert.deepEqual((await getArtifact(db,created.id)).metadata,{category:kind});
    }
    assert.equal(await getArtifact(db,missing),null);
  } finally {
    await db.close();
  }
});

test("rejects rights, metadata, hashes, and mismatched ProductVersion provenance", async () => {
  const { db, source } = await context();
  try {
    const first = await createProduct(db,{sourceId:source.id,title:"one"});
    const second = await createProduct(db,{sourceId:source.id,title:"two"});
    const version = await createProductVersion(db,{productId:first.id,versionNo:1});
    const base = {kind:"screen",title:"Evidence",sourceId:source.id,
      contentHash:HASH,rightsClassification:"permitted",visibility:"public"};
    await assert.rejects(
      () => createArtifact(db,{...base,productId:second.id,productVersionId:version.id}),
      /foreign key|violates/i,
    );
    await assert.rejects(
      () => createArtifact(db,{...base,rightsClassification:"unknown",visibility:"public"}),
      /check|violates/i,
    );
    await assert.rejects(
      () => createArtifact(db,{...base,contentHash:"abc"}),
      /check|violates/i,
    );
    await assert.rejects(
      () => createArtifact(db,{...base,metadata:["not an object"]}),
      /check|violates/i,
    );
    // AF-SEC-00 creation rules: an owner claim requires a workspace
    // binding, and workspace-bound private rows require an owner.
    // Global rows keep the legacy curated-corpus shape; readability is
    // enforced by the actor gate, not by rejecting the write.
    await assert.rejects(
      () => createArtifact(db,{...base,ownerSubject:"some-owner"}),
      /workspace/i,
    );
    const ok=await createArtifact(db,{...base,productId:first.id,productVersionId:version.id});
    assert.equal(ok.productVersionId,version.id);
  } finally {
    await db.close();
  }
});

test("asset SHA-256 deduplicates without upgrading rights or source", async () => {
  const { db,source }=await context();
  try {
    const restricted=await createAsset(db,{
      sha256:HASH,mediaType:"image/png",byteLength:100,
      storageKey:"restricted/fixture.png",sourceId:source.id,
      rightsClassification:"restricted",metadata:{ok:true},
    });
    const duplicate=await createAsset(db,{
      sha256:HASH,mediaType:"image/png",byteLength:100,
      storageKey:"restricted/fixture.png",sourceId:source.id,
      rightsClassification:"restricted",
    });
    assert.equal(restricted.id,duplicate.id);
    const secondary=await createSource(db,{key:"secondary",kind:"test"});
    await assert.rejects(
      () => createAsset(db,{sha256:HASH,mediaType:"image/png",byteLength:100,
        storageKey:"restricted/fixture.png",sourceId:secondary.id,
        rightsClassification:"restricted"}),
      /Asset provenance or rights conflict/,
    );
    await assert.rejects(
      () => createAsset(db,{sha256:HASH,mediaType:"image/png",byteLength:100,
        storageKey:"public/unsafe.png",sourceId:source.id,
        rightsClassification:"permitted"}),
      /Asset provenance or rights conflict/,
    );
    await assert.rejects(
      () => createAsset(db,{sha256:HASH,mediaType:"image/png",byteLength:101,
        storageKey:"restricted/fixture.png",sourceId:source.id,
        rightsClassification:"restricted"}),
      /Asset metadata conflict/,
    );
    const permitted=await createAsset(db,{sha256:HASH2,mediaType:"image/png",
      byteLength:50,storageKey:"permitted/fixture.png",sourceId:source.id,
      rightsClassification:"permitted"});
    await assert.rejects(
      () => createAsset(db,{sha256:HASH2,mediaType:"image/png",byteLength:50,
        storageKey:"permitted/fixture.png",sourceId:source.id,
        rightsClassification:"restricted"}),
      /Asset provenance or rights conflict/,
    );
    assert.equal(permitted.rightsClassification,"permitted");
    assert.equal((await getAssetByHash(db,HASH)).sha256,HASH);
    assert.equal((await getAssetByHash(db,HASH2)).sha256,HASH2);
    await assert.rejects(
      () => createAsset(db,{sha256:"invalid",mediaType:"image/png",byteLength:1,
        storageKey:"x",sourceId:source.id,rightsClassification:"permitted"}),
      /check|violates/i,
    );
    await assert.rejects(
      () => createAsset(db,{sha256:"b".repeat(64),mediaType:"image/png",byteLength:-1,
        storageKey:"x",sourceId:source.id,rightsClassification:"permitted"}),
      /check|violates/i,
    );
  } finally {
    await db.close();
  }
});

test("patterns and typed graph relations round-trip with endpoint integrity", async () => {
  const {db,source}=await context();
  try {
    const a=await createArtifact(db,{kind:"component",title:"Nav",sourceId:source.id,
      contentHash:HASH,rightsClassification:"permitted",visibility:"public"});
    const pattern=await createPattern(db,{slug:"global-navigation",title:"Global navigation",
      sourceId:source.id,metadata:{tags:["navigation"]}});
    const relation=await createRelation(db,{fromType:"artifact",fromId:a.id,
      relationType:"uses",toType:"pattern",toId:pattern.id,
      confidence:0.9,evidence:{capture:"fixture"}});
    assert.equal(relation.fromId,a.id);
    assert.equal(relation.toId,pattern.id);
    assert.deepEqual((await listRelations(db,"artifact",a.id)).map(r=>r.id),[relation.id]);
    await assert.rejects(
      () => createRelation(db,{fromType:"artifact",fromId:missing,
        relationType:"uses",toType:"pattern",toId:pattern.id}),
      /endpoint not found/,
    );
    await assert.rejects(
      () => createRelation(db,{fromType:"artifact",fromId:a.id,
        relationType:"uses",toType:"pattern",toId:missing}),
      /endpoint not found/,
    );
    await assert.rejects(
      () => createRelation(db,{fromType:"artifact",fromId:a.id,
        relationType:"uses",toType:"pattern",toId:pattern.id,confidence:2}),
      /check|violates/i,
    );
    await assert.rejects(
      () => createRelation(db,{fromType:"artifact",fromId:a.id,
        relationType:"unsupported",toType:"pattern",toId:pattern.id}),
      /check|violates/i,
    );
  } finally {
    await db.close();
  }
});

test("graph endpoints cannot be deleted before the referencing edges are removed", async () => {
  const {db,source}=await context();
  try {
    const artifact=await createArtifact(db,{kind:"component",title:"Linked",
      sourceId:source.id,contentHash:HASH,rightsClassification:"permitted",
      visibility:"public"});
    const pattern=await createPattern(db,{slug:"linked",title:"Linked",sourceId:source.id});
    const edge=await createRelation(db,{fromType:"artifact",fromId:artifact.id,
      relationType:"uses",toType:"pattern",toId:pattern.id});
    await assert.rejects(
      () => db.query("delete from artifacts where id=$1", [artifact.id]),
      /graph endpoint still referenced/,
    );
    await assert.rejects(
      () => db.query("delete from patterns where id=$1", [pattern.id]),
      /graph endpoint still referenced/,
    );
    await db.query("delete from relations where id=$1", [edge.id]);
    await db.query("delete from artifacts where id=$1", [artifact.id]);
    await db.query("delete from patterns where id=$1", [pattern.id]);
    assert.equal(await getArtifact(db,artifact.id),null);
  } finally {
    await db.close();
  }
});
