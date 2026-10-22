import assert from "node:assert/strict";
import test from "node:test";
import {openDatabase} from "../src/db.ts";
import {migrateUp,migrateDown} from "../src/migrate.ts";
import {signUp} from "../src/auth.ts";
import {createWorkspace} from "../src/workspaces.ts";
import {BuildKitError,advanceKitRun,cancelKitRun,createKitRun,
 pollKitRun,resumeKitRun} from "../src/build-kit.ts";

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
const BASE=new Date("2026-10-10T06:00:00.000Z");
function request(overrides={}) {
 return {sourceUrl:"https://example.org/",mode:"single-page",maxPages:1,
  maxDepth:0,maxBytes:1048576,timeBudgetMs:60000,...overrides};
}
async function tenant(db,email,name) {
 const user=await signUp(db,{email,password:"pg-kit-member-01"});
 const space=await createWorkspace(db,{name,ownerId:user.id});
 return {workspaceId:space.workspace.id,actorId:user.id};
}

test("real PostgreSQL migration ledger includes the kit lifecycle",{
 skip:!enabled,timeout:60000},async()=>{
 fixtureGuard();
 const db=await openDatabase({connectionString});
 try {
  assert.deepEqual(await migrateUp(db),
   ["001_sources_products","002_design_graph","003_workflows","004_auth",
    "005_workspaces","006_collections_auth","007_billing","008_jobs",
    "009_lens_build_kit_runs", "010_artifact_actor_scope", "011_pack_idempotency", "012_asset_search_fts", "013_lens_build_kit_purge", "014_collection_item_order", "015_collection_handoffs", "016_corpus_flow_import", "017_replay_sessions", "018_skilit_rename", "019_workspace_invites"]);
 } finally {await migrateDown(db);await db.close();}
});

test("real PostgreSQL concurrent create converges to one run",{
 skip:!enabled,timeout:60000},async()=>{
 fixtureGuard();
 const db=await openDatabase({connectionString});
 const second=await openDatabase({connectionString});
 try {
  await migrateUp(db);
  const owner=await tenant(db,"pg-kit-race@skilit.example","PG kit race");
  const attempt=(client)=>createKitRun(client,{workspaceId:owner.workspaceId,
   actorId:owner.actorId,request:request({idempotencyKey:"race-key"}),now:BASE});
  const outcomes=await Promise.all([
   attempt(db),attempt(second),attempt(db),attempt(second),
   attempt(db),attempt(second),attempt(db),attempt(second)]);
  const ids=new Set(outcomes.map((o)=>o.run.kitId));
  assert.equal(ids.size,1);
  assert.equal(outcomes.filter((o)=>o.created).length,1);
  const count=await db.query(
   "select count(*)::int as n from lens_build_kit_runs where workspace_id=$1",
   [owner.workspaceId]);
  assert.equal(count.rows[0]?.n,1);
  const ledger=await db.query(
   "select submitted_total, active_count from lens_build_kit_quotas where workspace_id=$1",
   [owner.workspaceId]);
  assert.equal(ledger.rows[0]?.submitted_total,1);
  assert.equal(ledger.rows[0]?.active_count,1);
 } finally {await migrateDown(db);await db.close();await second.close();}
});

test("real PostgreSQL concurrent submissions respect the quota race",{
 skip:!enabled,timeout:60000},async()=>{
 fixtureGuard();
 const db=await openDatabase({connectionString});
 const second=await openDatabase({connectionString});
 try {
  await migrateUp(db);
  const owner=await tenant(db,"pg-kit-quota@skilit.example","PG kit quota");
  const attempt=(client,index)=>createKitRun(client,{workspaceId:owner.workspaceId,
   actorId:owner.actorId,request:request({idempotencyKey:`quota-race-${index}`}),
   now:BASE}).then((o)=>({ok:true,run:o.run}),
   (error)=>({ok:false,code:error instanceof BuildKitError?error.code:"unknown"}));
  const outcomes=await Promise.all([0,1,2,3,4,5].map((index)=>
   attempt(index%2===0?db:second,index)));
  const won=outcomes.filter((o)=>o.ok);
  const lost=outcomes.filter((o)=>!o.ok);
  assert.equal(won.length,2);
  assert.equal(lost.length,4);
  assert.ok(lost.every((o)=>o.code==="buildkit/quota-exhausted"));
  const ledger=await db.query(
   "select submitted_total, active_count from lens_build_kit_quotas where workspace_id=$1",
   [owner.workspaceId]);
  assert.equal(ledger.rows[0]?.submitted_total,2);
  assert.equal(ledger.rows[0]?.active_count,2);
 } finally {await migrateDown(db);await db.close();await second.close();}
});

test("real PostgreSQL cancel versus complete race stays deterministic",{
 skip:!enabled,timeout:60000},async()=>{
 fixtureGuard();
 const db=await openDatabase({connectionString});
 const second=await openDatabase({connectionString});
 try {
  await migrateUp(db);
  for(let round=0;round<5;round+=1) {
   const owner=await tenant(db,`pg-kit-duel-${round}@skilit.example`,`PG duel ${round}`);
   const made=await createKitRun(db,{workspaceId:owner.workspaceId,
    actorId:owner.actorId,request:request({idempotencyKey:`duel-${round}`}),now:BASE});
   let run=made.run;
   for(const next of ["capturing","extracting","generating","validating"]) {
    const step=await advanceKitRun(db,{workspaceId:owner.workspaceId,
     kitId:run.kitId,workerId:"duel-worker",expectedRevision:run.revision,
     next,options:{now:BASE}});
    run=step.run;
   }
   const finish=advanceKitRun(second,{workspaceId:owner.workspaceId,
    kitId:run.kitId,workerId:"duel-worker",expectedRevision:run.revision,
    next:"completed",options:{evidence:{validation:{passed:true}},
    artifactManifest:{"manifest.json":{}},now:BASE}}).then(()=> "completed",
    (error)=>error instanceof BuildKitError?error.code:"unknown");
   const abort=cancelKitRun(db,{workspaceId:owner.workspaceId,
    actorId:owner.actorId,kitId:run.kitId,now:BASE}).then(()=> "canceled",
    (error)=>error instanceof BuildKitError?error.code:"unknown");
   const [left,right]=await Promise.all([finish,abort]);
   const final=await pollKitRun(db,{workspaceId:owner.workspaceId,
    actorId:owner.actorId,kitId:run.kitId});
   if(final.status==="completed") {
    assert.ok([left,right].includes("completed"));
    assert.ok([left,right].includes("buildkit/not-cancelable"));
   } else {
    assert.equal(final.status,"canceled");
    assert.ok([left,right].includes("canceled"));
    assert.ok([left,right].includes("buildkit/terminal-state"));
   }
  }
 } finally {await migrateDown(db);await db.close();await second.close();}
});

test("real PostgreSQL worker crash recovers through lease expiry",{
 skip:!enabled,timeout:60000},async()=>{
 fixtureGuard();
 const db=await openDatabase({connectionString});
 try {
  await migrateUp(db);
  const owner=await tenant(db,"pg-kit-crash@skilit.example","PG kit crash");
  const made=await createKitRun(db,{workspaceId:owner.workspaceId,
   actorId:owner.actorId,request:request({idempotencyKey:"crash-key"}),now:BASE});
  const started=await advanceKitRun(db,{workspaceId:owner.workspaceId,
   kitId:made.run.kitId,workerId:"crashed-worker",expectedRevision:0,
   next:"capturing",options:{checkpoint:{state:"capturing",
   requestHash:made.run.requestHash,cursor:{page:1}},now:BASE}});
  // Same revision replayed by the crashed worker is stale.
  await assert.rejects(()=>advanceKitRun(db,{workspaceId:owner.workspaceId,
   kitId:made.run.kitId,workerId:"crashed-worker",expectedRevision:0,
   next:"extracting",options:{now:BASE}}),
   (error)=>error instanceof BuildKitError&&error.code==="buildkit/stale-revision");
  // A fresh worker resumes after the lease lapses and continues the pipeline.
  const recovered=await resumeKitRun(db,{workspaceId:owner.workspaceId,
   actorId:owner.actorId,kitId:made.run.kitId,workerId:"recovery-worker",
   now:new Date(BASE.getTime()+301000)});
  assert.equal(recovered.resumed,true);
  const moved=await advanceKitRun(db,{workspaceId:owner.workspaceId,
   kitId:made.run.kitId,workerId:"recovery-worker",
   expectedRevision:recovered.run.revision,next:"extracting",
   options:{now:new Date(BASE.getTime()+301000)}});
  assert.equal(moved.run.status,"extracting");
  assert.equal(moved.run.startedAt,started.run.startedAt);
  // State survives a full reconnect: durable, not process-local.
  await db.close();
  const reopened=await openDatabase({connectionString});
  try {
   const polled=await pollKitRun(reopened,{workspaceId:owner.workspaceId,
    actorId:owner.actorId,kitId:made.run.kitId});
   assert.equal(polled.status,"extracting");
   assert.equal(polled.revision,moved.run.revision);
  } finally {await reopened.close();}
  const janitor=await openDatabase({connectionString});
  try {await migrateDown(janitor);} finally {await janitor.close();}
 }
 catch (cleanupError) {
  const fallback=await openDatabase({connectionString});
  try {await migrateDown(fallback);} finally {await fallback.close();}
  throw cleanupError;
 }
});
