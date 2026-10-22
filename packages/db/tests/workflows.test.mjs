import assert from "node:assert/strict";
import test from "node:test";

import { openDatabase } from "../src/db.ts";
import { migrateUp,migrateDown } from "../src/migrate.ts";
import { createSource,createProduct,createProductVersion } from "../src/repositories.ts";
import { createArtifact } from "../src/graph.ts";
import { createFlow,addFlowStep,listFlowSteps,createCollection,saveCollectionArtifact,
 listCollectionArtifacts,createCaptureRun,createAnalysisRun,getCaptureRun,getAnalysisRun,
 transitionRun,registerImport } from "../src/workflows.ts";
import { signUp } from "../src/auth.ts";
import { createWorkspace } from "../src/workspaces.ts";

const HASH="a".repeat(64);
async function workspaceFixture(db) {
 const user=await signUp(db,{email:"workflows-fixture@skilit.example",
  password:"workflows-password-01"});
 const created=await createWorkspace(db,{name:"Workflows fixture",ownerId:user.id});
 return created.workspace.id;
}
async function fixture() {
 const db=await openDatabase();
 await migrateUp(db);
 const source=await createSource(db,{key:"workspace-fixture",kind:"synthetic"});
 const product=await createProduct(db,{sourceId:source.id,title:"App"});
 const version=await createProductVersion(db,{productId:product.id,versionNo:1});
 const artifact=await createArtifact(db,{sourceId:source.id,productId:product.id,
  productVersionId:version.id,kind:"screen",title:"First screen",
  contentHash:HASH,rightsClassification:"metadata_only"});
 return {db,source,product,version,artifact};
}

test("003 migration is ordered, idempotent and reversed without corrupting earlier schema",async()=>{
 const db=await openDatabase();
 try {
  assert.deepEqual(await migrateUp(db),
   ["001_sources_products","002_design_graph","003_workflows","004_auth","005_workspaces","006_collections_auth","007_billing","008_jobs","009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
   assert.deepEqual(await migrateUp(db),[]);
  for(const table of ["flows","flow_steps","collections","collection_items",
    "capture_runs","analysis_runs","import_records"]) {
    const r=await db.query("select to_regclass($1) as id",["public."+table]);
    assert.notEqual(r.rows[0]?.id,null);
  }
  assert.deepEqual(await migrateDown(db),
   ["019_workspace_invites", "018_skilit_rename", "017_replay_sessions", "016_corpus_flow_import", "015_collection_handoffs", "014_collection_item_order", "013_lens_build_kit_purge", "012_asset_search_fts", "011_pack_idempotency", "010_artifact_actor_scope", "009_lens_build_kit_runs","008_jobs","007_billing","006_collections_auth","005_workspaces","004_auth","003_workflows","002_design_graph","001_sources_products"]);
   assert.deepEqual(await migrateUp(db),
   ["001_sources_products","002_design_graph","003_workflows","004_auth","005_workspaces","006_collections_auth","007_billing","008_jobs","009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
 } finally {await db.close();}
});

test("ordered FlowSteps round-trip and mismatched version/source rejected",async()=>{
 const {db,source,version,artifact,product}=await fixture();
 try {
  const flow=await createFlow(db,{sourceId:source.id,productVersionId:version.id,title:"Signup"});
  const a=await addFlowStep(db,{flowId:flow.id,position:3,artifactId:artifact.id,
   interaction:{action:"click"}});
  const b=await addFlowStep(db,{flowId:flow.id,position:1,artifactId:artifact.id,
   hotspot:{x:0.4,y:0.9}});
  assert.deepEqual((await listFlowSteps(db,flow.id)).map(x=>x.id),[b.id,a.id]);
  await assert.rejects(()=>addFlowStep(db,{flowId:flow.id,position:1,artifactId:artifact.id}),
   /unique|duplicate/i);
  const wrong=await createProductVersion(db,{productId:product.id,versionNo:2});
  const wrongArtifact=await createArtifact(db,{sourceId:source.id,productId:product.id,
   productVersionId:wrong.id,kind:"screen",title:"Second",contentHash:HASH,
   rightsClassification:"unknown"});
  await assert.rejects(()=>addFlowStep(db,{flowId:flow.id,position:2,
    artifactId:wrongArtifact.id}),/does not belong/);
  const alien=await createSource(db,{key:"alien",kind:"test"});
  await assert.rejects(()=>createFlow(db,{sourceId:alien.id,
    productVersionId:version.id,title:"Wrong source"}),/source must match/);
  await assert.rejects(()=>db.query("delete from artifacts where id=$1",[artifact.id]),
   /foreign key|violates/i);
 } finally{await db.close();}
});

test("collection references are idempotent and private by default",async()=>{
 const {db,artifact}=await fixture();
 try{
  const workspace=await workspaceFixture(db);
  const c=await createCollection(db,{workspaceId:workspace,ownerSubject:"fixture-user",
   title:"UX research"});
  assert.equal(c.visibility,"private");
  assert.equal(await saveCollectionArtifact(db,c.id,artifact.id),true);
  assert.equal(await saveCollectionArtifact(db,c.id,artifact.id),false);
  assert.deepEqual(await listCollectionArtifacts(db,c.id),[artifact.id]);
  await assert.rejects(()=>createCollection(db,{workspaceId:workspace,
   ownerSubject:"fixture-user",title:"Public",visibility:"public"}),
   /check|violates/i);
  await assert.rejects(()=>saveCollectionArtifact(db,c.id,
   "00000000-0000-4000-8000-000000000000"),/foreign key|violates/i);
 } finally{await db.close();}
});

test("capture run optimistic status and required completion evidence",async()=>{
 const {db,source}=await fixture();
 try{
  const run=await createCaptureRun(db,{sourceId:source.id,
   captureConfig:{url:"https://example.org"},resourceBudget:{maxPages:3}});
  assert.equal(run.status,"queued");
  assert.equal(run.startedAt,null);
  await assert.rejects(()=>transitionRun(db,"capture",run.id,"queued","completed"),
   /Invalid requested/);
  await assert.rejects(()=>transitionRun(db,"capture",run.id,"running","failed",
   {errorClass:"timeout"}),/optimistic status/);
  const started=await transitionRun(db,"capture",run.id,"queued","running");
  assert.equal(started.status,"running");
  assert.match(started.startedAt,/Z$/);
  await assert.rejects(()=>transitionRun(db,"capture",run.id,"running","completed"),
   /needs observed evidence/);
  const completed=await transitionRun(db,"capture",run.id,"running","completed",
   {evidence:{pages:3}});
  assert.equal(completed.resultEvidence.pages,3);
  assert.match(completed.finishedAt,/Z$/);
  await assert.rejects(()=>transitionRun(db,"capture",run.id,"completed","running"),
   /Invalid requested/);
  await assert.rejects(()=>db.query("update capture_runs set status='failed' where id=$1",[run.id]),
   /terminal run cannot be modified/);
  assert.equal((await getCaptureRun(db,run.id)).status,"completed");
 } finally{await db.close();}
});

test("failed, canceled, and partial run paths are represented without fabricated success",async()=>{
 const {db,source}=await fixture();
 try{
  const canceled=await createCaptureRun(db,{sourceId:source.id});
  const result=await transitionRun(db,"capture",canceled.id,"queued","canceled");
  assert.equal(result.status,"canceled");
  assert.equal(result.startedAt,null);
  const failed=await createCaptureRun(db,{sourceId:source.id});
  await transitionRun(db,"capture",failed.id,"queued","running");
  await assert.rejects(()=>transitionRun(db,"capture",failed.id,"running","failed"),
   /error classification/);
  const out=await transitionRun(db,"capture",failed.id,"running","failed",
   {errorClass:"http_timeout"});
  assert.equal(out.errorClass,"http_timeout");
  const partial=await createCaptureRun(db,{sourceId:source.id});
  await transitionRun(db,"capture",partial.id,"queued","running");
  const evidence=await transitionRun(db,"capture",partial.id,"running","partial",
   {evidence:{coverage:"1/3"}});
  assert.equal(evidence.resultEvidence.coverage,"1/3");
 } finally{await db.close();}
});

test("analysis preserves provider/egress identity and source-linked captures",async()=>{
 const {db,source}=await fixture();
 try{
  const capture=await createCaptureRun(db,{sourceId:source.id});
  const local=await createAnalysisRun(db,{sourceId:source.id,captureRunId:capture.id,
   providerKind:"deterministic",egressClass:"none",inputEvidence:{reference:"fixture"}});
  assert.equal(local.egressClass,"none");
  await transitionRun(db,"analysis",local.id,"queued","running");
  assert.equal((await transitionRun(db,"analysis",local.id,"running","partial",
   {evidence:{reason:"unavailable"}})).status,"partial");
  assert.equal((await getAnalysisRun(db,local.id)).captureRunId,capture.id);
  await assert.rejects(()=>createAnalysisRun(db,{sourceId:source.id,
   providerKind:"model",egressClass:"external",providerId:"remote"}),
   /check|violates/i);
  const other=await createSource(db,{key:"external-fixture",kind:"test"});
  await assert.rejects(()=>createAnalysisRun(db,{sourceId:other.id,
   captureRunId:capture.id,providerKind:"deterministic",egressClass:"none"}),
   /foreign key|violates/i);
  const model=await createAnalysisRun(db,{sourceId:source.id,
   providerKind:"model",providerId:"test-provider",modelId:"test-model",
   egressClass:"external"});
  assert.equal(model.modelId,"test-model");
 } finally{await db.close();}
});

test("imports replay idempotently, reject identity conflicts and block target deletion",async()=>{
 const {db,source,artifact}=await fixture();
 try{
  const input={sourceId:source.id,externalId:"component/7",
   sourceVersion:"v1",canonicalType:"artifact",canonicalId:artifact.id,
   metadata:{origin:"fixture"}};
  const first=await registerImport(db,input);
  const replay=await registerImport(db,input);
  assert.equal(first.created,true);
  assert.equal(replay.created,false);
  assert.equal(first.record.id,replay.record.id);
  await assert.rejects(()=>registerImport(db,{...input,metadata:{origin:"tampered"}}),
   /Conflicting source evidence/);
  const second=await createArtifact(db,{sourceId:source.id,kind:"screen",
   title:"Second imported record",contentHash:HASH,rightsClassification:"unknown"});
  await assert.rejects(()=>registerImport(db,{...input,canonicalId:second.id}),
   /Conflicting canonical identity/);
  await assert.rejects(()=>registerImport(db,{...input,externalId:"missing",
    canonicalId:"00000000-0000-4000-8000-000000000000"}),/canonical target not found/);
  await assert.rejects(()=>db.query("delete from artifacts where id=$1",[artifact.id]),
   /canonical target has import records/);
  await assert.rejects(()=>db.query("update import_records set canonical_id=$1 where id=$2",
   ["00000000-0000-4000-8000-000000000000",first.record.id]),/import records are immutable/);
 } finally{await db.close();}
});

test("G03-03 transaction rollback leaves no collection and run state",async()=>{
 const {db,source}=await fixture();
 try{
  const workspace=await workspaceFixture(db);
  await assert.rejects(()=>db.transaction(async(tx)=>{
   await createCollection(tx,{workspaceId:workspace,ownerSubject:"rollback",title:"rollback"});
   await createCaptureRun(tx,{sourceId:source.id});
   throw new Error("injected rollback");
  }),/injected rollback/);
  const c=await db.query("select count(*)::int as n from collections");
  const r=await db.query("select count(*)::int as n from capture_runs");
  assert.equal(c.rows[0].n,0);
  assert.equal(r.rows[0].n,0);
 } finally{await db.close();}
});

test("raw inserts cannot fabricate completed or prestarted capture/analysis runs", async()=>{
 const {db,source}=await fixture();
 try{
  await assert.rejects(()=>db.query(`insert into capture_runs
   (source_id,status,started_at,finished_at,result_evidence)
   values($1,'completed',now(),now(),'{"fake":true}'::jsonb)`,[source.id]),
   /new runs must begin queued/);
  await assert.rejects(()=>db.query(`insert into analysis_runs
   (source_id,provider_kind,status,started_at,finished_at,result_evidence)
   values($1,'deterministic','completed',now(),now(),'{"fake":true}'::jsonb)`,[source.id]),
   /new runs must begin queued/);
  await assert.rejects(()=>db.query(`insert into capture_runs(source_id,started_at)
   values($1,now())`,[source.id]),/new runs must begin queued/);
 }finally{await db.close();}
});

test("raw SQL cannot rewrite run identity, provider egress or outcome while running",async()=>{
 const {db,source}=await fixture();
 try{
  const capture=await createCaptureRun(db,{sourceId:source.id});
  await transitionRun(db,"capture",capture.id,"queued","running");
  await assert.rejects(()=>db.query(
    "update capture_runs set resource_budget=$1::jsonb where id=$2",
    [JSON.stringify({cost:999}),capture.id]),/run identity is immutable/);
  await assert.rejects(()=>db.query(
    "update capture_runs set result_evidence=$1::jsonb where id=$2",
    [JSON.stringify({fake:true}),capture.id]),/without transition/);
  const run=await createAnalysisRun(db,{sourceId:source.id,providerKind:"model",
   providerId:"provider",modelId:"model",egressClass:"external"});
  await transitionRun(db,"analysis",run.id,"queued","running");
  await assert.rejects(()=>db.query(
   "update analysis_runs set egress_class='none' where id=$1",[run.id]),
   /run identity is immutable/);
  await assert.rejects(()=>db.query(
   "update analysis_runs set model_id='another' where id=$1",[run.id]),
   /run identity is immutable/);
  await assert.rejects(()=>db.query(`update analysis_runs
   set status='completed',finished_at=started_at-interval '1 day',
       result_evidence='{"fake":true}'::jsonb where id=$1`,[run.id]),
   /timestamp|check|violates/i);
  await assert.rejects(()=>transitionRun(db,"analysis",run.id,"running","partial"),
   /partial needs evidence|check|violates/i);
 }finally{await db.close();}
});

test("raw SQL cannot rebind existing flows or change their referenced parents",async()=>{
 const {db,source,product,version,artifact}=await fixture();
 try {
  const flow=await createFlow(db,{sourceId:source.id,productVersionId:version.id,title:"Locked"});
  await addFlowStep(db,{flowId:flow.id,position:0,artifactId:artifact.id});
  const next=await createProductVersion(db,{productId:product.id,versionNo:2});
  await assert.rejects(()=>db.query(
   "update flows set product_version_id=$1 where id=$2",[next.id,flow.id]),
   /flow identity is immutable/);
  await assert.rejects(()=>db.query(
   "update artifacts set product_version_id=$1 where id=$2",[next.id,artifact.id]),
   /flow step artifact identity is immutable/);
  const alien=await createSource(db,{key:"alien-flow-parent",kind:"fixture"});
  await assert.rejects(()=>db.query(
   "update products set source_id=$1 where id=$2",[alien.id,product.id]),
   /flow product source identity is immutable/);
  await assert.rejects(()=>db.query(
   "update artifacts set source_id=$1 where id=$2",[alien.id,artifact.id]),
   /flow step artifact identity is immutable/);
  const other=await createProduct(db,{sourceId:source.id,title:"Other"});
  await assert.rejects(()=>db.query(
   "update product_versions set product_id=$1 where id=$2",[other.id,version.id]),
   /flow product version identity is immutable/);
 }finally{await db.close();}
});

test("import records reject raw updates to a different valid canonical target",async()=>{
 const {db,source,artifact}=await fixture();
 try {
  const first=await registerImport(db,{sourceId:source.id,externalId:"immutable",
   sourceVersion:"v1",canonicalType:"artifact",canonicalId:artifact.id});
  const second=await createArtifact(db,{sourceId:source.id,kind:"screen",
   title:"Second valid target",contentHash:HASH,rightsClassification:"unknown"});
  await assert.rejects(()=>db.query(
   "update import_records set canonical_id=$1 where id=$2",
   [second.id,first.record.id]),/import records are immutable/);
  await assert.rejects(()=>db.query(
   "update import_records set external_id='replaced' where id=$1",
   [first.record.id]),/import records are immutable/);
  await assert.rejects(()=>db.query("delete from import_records where id=$1",
   [first.record.id]),/import records are immutable/);
  await assert.rejects(()=>db.query(
   "delete from artifacts where id=$1",[artifact.id]),/canonical target has import records/);
 } finally{await db.close();}
});
