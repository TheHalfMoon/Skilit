import assert from "node:assert/strict";
import test from "node:test";
import {openDatabase} from "../src/db.ts";
import {migrateUp,migrateDown} from "../src/migrate.ts";
import {createSource,createProduct,createProductVersion} from "../src/repositories.ts";
import {createArtifact} from "../src/graph.ts";
import {createFlow,addFlowStep,listFlowSteps,createCollection,saveCollectionArtifact,
 createCaptureRun,createAnalysisRun,transitionRun,registerImport} from "../src/workflows.ts";
import {signUp} from "../src/auth.ts";
import {createWorkspace} from "../src/workspaces.ts";

const connectionString=process.env.SKILIT_TEST_DATABASE_URL;
const enabled=Boolean(connectionString);
function fixtureGuard() {
 if(!connectionString||process.env.SKILIT_DB_TEST_CONFIRM!=="yes")
  throw new Error("Explicit local fixture guard required");
 const url=new URL(connectionString);
 if(!["127.0.0.1","localhost"].includes(url.hostname) ||
  url.username!=="skilit_test" || url.pathname!=="/skilit_test")
  throw new Error("Refusing to mutate a non-fixture PostgreSQL database");
}

test("real PostgreSQL ordered flow, tenant-tagged collection, and state identity",{
 skip:!enabled,timeout:30000}, async()=>{
 fixtureGuard();
 const db=await openDatabase({connectionString});
 try {
  assert.deepEqual(await migrateUp(db),
   ["001_sources_products","002_design_graph","003_workflows","004_auth","005_workspaces","006_collections_auth","007_billing","008_jobs","009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
  const source=await createSource(db,{key:"pg-workflows",kind:"fixture"});
  const product=await createProduct(db,{sourceId:source.id,title:"Journey"});
  const version=await createProductVersion(db,{productId:product.id,versionNo:1});
  const screen=await createArtifact(db,{sourceId:source.id,productId:product.id,
   productVersionId:version.id,kind:"screen",title:"Arrival",
   contentHash:"3".repeat(64),rightsClassification:"metadata_only"});
  const flow=await createFlow(db,{sourceId:source.id,productVersionId:version.id,
   title:"Onboarding"});
  await addFlowStep(db,{flowId:flow.id,position:1,artifactId:screen.id});
  await addFlowStep(db,{flowId:flow.id,position:0,artifactId:screen.id});
  assert.deepEqual((await listFlowSteps(db,flow.id)).map(x=>x.position),[0,1]);
  const fixtureUser=await signUp(db,{email:"pg-workflows@skilit.example",
   password:"pg-workflows-01"});
  const fixtureSpace=await createWorkspace(db,{name:"PG workflows",
   ownerId:fixtureUser.id});
  const c=await createCollection(db,{workspaceId:fixtureSpace.workspace.id,
   ownerSubject:"fixture-user",title:"Synthetic UX"});
  assert.equal(c.visibility,"private");
  assert.equal(await saveCollectionArtifact(db,c.id,screen.id),true);
  assert.equal(await saveCollectionArtifact(db,c.id,screen.id),false);
  const capture=await createCaptureRun(db,{sourceId:source.id,
   captureConfig:{origin:"fixture"}});
  await transitionRun(db,"capture",capture.id,"queued","running");
  const done=await transitionRun(db,"capture",capture.id,"running","completed",
   {evidence:{pages:2}});
  assert.equal(done.status,"completed");
  await assert.rejects(()=>db.query(
   "update capture_runs set status='failed' where id=$1",[capture.id]),
   /terminal run cannot be modified/);
  const analysis=await createAnalysisRun(db,{sourceId:source.id,
   captureRunId:capture.id,providerKind:"deterministic",egressClass:"none"});
  await transitionRun(db,"analysis",analysis.id,"queued","running");
  await transitionRun(db,"analysis",analysis.id,"running","partial",
   {evidence:{reason:"unavailable"}});
  const other=await createSource(db,{key:"wrong-origin",kind:"fixture"});
  await assert.rejects(()=>createAnalysisRun(db,{sourceId:other.id,
   captureRunId:capture.id,providerKind:"deterministic",egressClass:"none"}),
   /foreign key|violates/i);
 } finally {await migrateDown(db);await db.close();}
});

test("real PostgreSQL concurrent import replay is unique, immutable, and rollback-safe",{
 skip:!enabled,timeout:30000},async()=>{
 fixtureGuard();
 const db=await openDatabase({connectionString});
 const second=await openDatabase({connectionString});
 try {
  await migrateUp(db);
  const source=await createSource(db,{key:"pg-imports",kind:"fixture"});
  const product=await createProduct(db,{sourceId:source.id,title:"Mapping"});
  const payload={sourceId:source.id,externalId:"ext:7",sourceVersion:"v1",
   canonicalType:"product",canonicalId:product.id};
  const results=await Promise.all([registerImport(db,payload),registerImport(second,payload)]);
  assert.deepEqual(results.map(x=>x.created).sort(),[false,true]);
  assert.equal(results[0].record.id,results[1].record.id);
  await assert.rejects(()=>registerImport(db,{...payload,metadata:{tampered:true}}),
   /Conflicting source evidence/);
  await assert.rejects(()=>registerImport(db,{...payload,externalId:"missing",
   canonicalId:"00000000-0000-4000-8000-000000000000"}),
   /canonical target not found/);
  await assert.rejects(()=>db.query("delete from products where id=$1",[product.id]),
   /canonical target has import records/);
  const replacement=await createProduct(db,{sourceId:source.id,title:"Other"});
  await assert.rejects(()=>registerImport(db,{...payload,canonicalId:replacement.id}),
   /Conflicting canonical identity/);
  await assert.rejects(()=>db.transaction(async(tx)=>{
   await createCaptureRun(tx,{sourceId:source.id});
   throw new Error("injected rollback");
  }),/injected rollback/);
  const count=await db.query("select count(*)::int as n from capture_runs");
  assert.equal(count.rows[0]?.n,0);
 } finally {await second.close();await migrateDown(db);await db.close();}
});

test("real PostgreSQL refuses forged run completions and immutable identity changes",{
 skip:!enabled,timeout:30000},async()=>{
 fixtureGuard();
 const db=await openDatabase({connectionString});
 try{
  await migrateUp(db);
  const source=await createSource(db,{key:"pg-immutable",kind:"fixture"});
  await assert.rejects(()=>db.query(`insert into capture_runs
   (source_id,status,started_at,finished_at,result_evidence)
   values($1,'completed',now(),now(),'{"fake":true}'::jsonb)`,[source.id]),
   /new runs must begin queued/);
  await assert.rejects(()=>db.query(`insert into analysis_runs
   (source_id,provider_kind,status,started_at,finished_at,result_evidence)
   values($1,'deterministic','completed',now(),now(),'{"fake":true}'::jsonb)`,
   [source.id]),/new runs must begin queued/);
  const capture=await createCaptureRun(db,{sourceId:source.id});
  await transitionRun(db,"capture",capture.id,"queued","running");
  await assert.rejects(()=>db.query(
   "update capture_runs set resource_budget=$1::jsonb where id=$2",
   [JSON.stringify({fake:999}),capture.id]),/run identity is immutable/);
  await assert.rejects(()=>db.query(
   "update capture_runs set result_evidence=$1::jsonb where id=$2",
   [JSON.stringify({fake:true}),capture.id]),/without transition/);
  const result=await transitionRun(db,"capture",capture.id,"running","completed",
   {evidence:{observed:true}});
  assert.equal(result.status,"completed");
 }finally{await migrateDown(db);await db.close();}
});

test("real PostgreSQL prevents import-target deletion across two independent transactions",{
 skip:!enabled,timeout:30000},async()=>{
 fixtureGuard();
 const db=await openDatabase({connectionString});
 const other=await openDatabase({connectionString});
 try{
  await migrateUp(db);
  const source=await createSource(db,{key:"pg-import-lock",kind:"fixture"});
  const product=await createProduct(db,{sourceId:source.id,title:"Pinned target"});
  let signal;let resume;
  const ready=new Promise(resolve=>{signal=resolve;});
  const held=new Promise(resolve=>{resume=resolve;});
  const payload={sourceId:source.id,externalId:"pinned-1",
   sourceVersion:"v1",canonicalType:"product",canonicalId:product.id};
  const writer=db.transaction(async(tx)=>{
   await registerImport(tx,payload);
   signal();
   await held;
  });
  await ready;
  let deleteSettled=false;
  const deleting=other.query("delete from products where id=$1",[product.id])
   .then(()=>({success:true}),error=>({success:false,error}))
   .finally(()=>{deleteSettled=true;});
  try{
   await new Promise(resolve=>setTimeout(resolve,125));
   assert.equal(deleteSettled,false,"target DELETE must wait for import target key-share lock");
  }finally{resume();}
  await writer;
  const result=await deleting;
  assert.equal(result.success,false);
  assert.match(result.error.message,/canonical target has import records/);
  const mapping=await db.query(
   "select canonical_id from import_records where external_id='pinned-1'");
  assert.equal(mapping.rows[0].canonical_id,product.id);
 }finally{await other.close();await migrateDown(db);await db.close();}
});

test("real PostgreSQL parent reparent waits for concurrently created flow",{
 skip:!enabled,timeout:30000},async()=>{
 fixtureGuard();
 const db=await openDatabase({connectionString});
 const other=await openDatabase({connectionString});
 try{
  await migrateUp(db);
  const source=await createSource(db,{key:"pg-flow-lock",kind:"fixture"});
  const alien=await createSource(db,{key:"pg-flow-alien",kind:"fixture"});
  const product=await createProduct(db,{sourceId:source.id,title:"Locked flow product"});
  const version=await createProductVersion(db,{productId:product.id,versionNo:1});
  let signal;let resume;
  const ready=new Promise(resolve=>{signal=resolve;});
  const hold=new Promise(resolve=>{resume=resolve;});
  const writing=db.transaction(async(tx)=>{
   await createFlow(tx,{sourceId:source.id,productVersionId:version.id,title:"Pinned flow"});
   signal();
   await hold;
  });
  await ready;
  let settled=false;
  const changing=other.query("update products set source_id=$1 where id=$2",
   [alien.id,product.id])
   .then(()=>({ok:true}),error=>({ok:false,error}))
   .finally(()=>{settled=true;});
  try{
   await new Promise(resolve=>setTimeout(resolve,150));
   assert.equal(settled,false,"product reparent must wait for flow creation lock");
  }finally{resume();}
  await writing;
  const result=await changing;
  assert.equal(result.ok,false);
  assert.match(result.error.message,/flow product source identity is immutable/);
  const parent=await db.query("select source_id from products where id=$1",[product.id]);
  assert.equal(parent.rows[0]?.source_id,source.id);
 } finally{await other.close();await migrateDown(db);await db.close();}
});
