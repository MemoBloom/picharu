import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname } from 'node:path';
import assert from 'node:assert/strict';

/** Destructive only to its own freshly created, random test database. Never reads .env. */
const host = process.env.PGHOST ?? '';
// Resolve symlinks before checking: accept dedicated test clusters under the OS
// temporary directory on macOS/Linux, never arbitrary sockets or TCP databases.
const allowedRoots = new Set([realpathSync(tmpdir()), realpathSync('/tmp')]);
let socket = '';
try { socket = realpathSync(host); } catch { /* Fail closed below. */ }
const cluster = dirname(socket);
if (!socket || basename(socket) !== 'socket' || !/^picjp-[a-zA-Z0-9_-]+$/.test(basename(cluster)) || !allowedRoots.has(dirname(cluster))) {
  throw new Error('Refusing to connect: PGHOST must be a dedicated <OS-temp>/picjp-.../socket test socket.');
}
const port = Number(process.env.PGPORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || !process.env.PGUSER) {
  throw new Error('Explicit PGPORT and PGUSER are required for the disposable native PostgreSQL test.');
}
const base = { host, port, user:process.env.PGUSER, connectionTimeoutMillis:5000, statement_timeout:15000 };
const database = `picjp_concurrency_${process.pid}_${randomUUID().slice(0,8)}`;
const admin = new Client({...base,database:'postgres'});
let db:Client|undefined;
let created=false;
let assertions=0;
const sessions = new Set<Client>();
const owner = '00000000-0000-4000-8000-000000000001';
const hash = 'a'.repeat(64);
const image = '00000000-0000-4000-8000-000000000010';
const pack = '00000000-0000-4000-8000-000000000020';
function check(actual:unknown,expected:unknown,label:string){assert.deepEqual(actual,expected,label);assertions++;}
async function rpc(client:Client,name:string,args:unknown[]) {
  return (await client.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`,args)).rows[0].value;
}
function jobArgs(key:string,input=image) {
 const inputs=[{image_id:input,role:'primary'}];
 const snapshot={contract_version:'1.0.0',tool_id:'remove_person',tool_version:1,prompt_id:'remove_person_default',prompt_version:1,final_prompt:'Remove a pedestrian.',parameters:{},output:{quality:'standard',aspect_ratio:'preserve'},execution_type:'commercial_edit',execution_version:1,model_profile:{profile_id:'concurrency-fixture'},pricing_version:'test-v1',inputs};
 return [owner,key,hash,JSON.stringify(inputs),JSON.stringify(snapshot),5,null];
}
async function clients(count:number) {
 const result = await Promise.all(Array.from({length:count},async()=>{
  const c=new Client({...base,database,application_name:'picjp-concurrency-test'});sessions.add(c);await c.connect();return c;
 }));
 const pids=await Promise.all(result.map(async c=>(await c.query('select pg_backend_pid() as id')).rows[0].id));
 check(new Set(pids).size,count,`${count} independent native PostgreSQL backend sessions`);
 return result;
}
async function closeClients(cs:Client[]){await Promise.all(cs.map(async c=>{await c.end();sessions.delete(c);}));}
async function account(){return (await db!.query('select available::int,reserved::int,status from credit_accounts where owner_id=$1',[owner])).rows[0];}
async function seedImage(id:string) {
 await rpc(db!,'app_create_upload',[owner,id,'image/jpeg',100,`temp/${id}`,new Date(Date.now()+86400000).toISOString()]);
 await rpc(db!,'app_complete_upload',[owner,id,`fixed/${id}.png`,`preview/${id}.jpg`,hash,'image/png',200,100,100]);
}
// Hold the same user lock used by the RPC so all sessions really overlap before release.
async function burst<T>(cs:Client[],action:(c:Client,index:number)=>Promise<T>):Promise<PromiseSettledResult<T>[]> {
 await db!.query('select pg_advisory_lock(hashtextextended($1::text,0))',[owner]);
 const pending=Promise.allSettled(cs.map(action));
 try {
  const deadline=Date.now()+5000;
  let waiting=0;
  while(Date.now()<deadline){
   waiting=Number((await db!.query("select count(*) as n from pg_stat_activity where datname=$1 and application_name='picjp-concurrency-test' and wait_event='advisory'",[database])).rows[0].n);
   if(waiting===cs.length)break;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  check(waiting,cs.length,'all RPCs overlap waiting for the same transaction advisory lock');
 } finally {await db!.query('select pg_advisory_unlock(hashtextextended($1::text,0))',[owner]);}
 return pending;
}
async function main(){
 try {
  await admin.connect();
  await admin.query(`create database ${database}`);created=true;
  db=new Client({...base,database});await db.connect();
  // Supabase Auth and role fixture, only in the disposable database/test cluster.
  await db.query(`create schema auth; create table auth.users(id uuid primary key);
   do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
   end $$;
   grant usage on schema public,auth to anon,authenticated,service_role;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant execute on function auth.uid() to anon,authenticated,service_role;`);
  await db.query(await readFile('supabase/migrations/202610190001_web_backend.sql','utf8'));
  await db.query(await readFile('supabase/migrations/202610200400_worker.sql','utf8'));
  await db.query(await readFile('supabase/migrations/202610210100_console_foundation.sql','utf8'));
  await db.query(await readFile('supabase/migrations/202610210200_personal_console.sql','utf8'));
  await db.query('insert into auth.users(id) values($1)',[owner]);await seedImage(image);
  const cs=await clients(20);
  await db.query('update credit_accounts set available=100 where owner_id=$1',[owner]);
  const same=await burst(cs,c=>rpc(c,'app_create_job',jobArgs('same_parallel_key1')));
  check(same.every(r=>r.status==='fulfilled'),true,'all same-key requests succeed');
  const values=same.map(r=>(r as PromiseFulfilledResult<any>).value);
  check(new Set(values.map(v=>v.job_id)).size,1,'20 same-key requests create only one task');
  check(values.filter(v=>!v.replayed).length,1,'only one same-key request is original');
  check(await account(),{available:95,reserved:5,status:'active'},'only one reservation');
  check(Number((await db.query("select count(*) as n from credit_ledger where kind='reserve'")).rows[0].n),1,'only one reservation ledger');
  const firstJob=values[0].job_id;
  const cancel=await burst(cs,c=>rpc(c,'app_cancel_job',[owner,firstJob]));
  check(cancel.every(r=>r.status==='fulfilled'),true,'20 overlapping cancellations succeed idempotently');
  check(await account(),{available:100,reserved:0,status:'active'},'concurrent cancellation releases once');
  check(Number((await db.query("select count(*) as n from credit_ledger where kind='release'")).rows[0].n),1,'only one release ledger');
  await db.query('update credit_accounts set available=10 where owner_id=$1',[owner]);
  const distinct=await burst(cs,(c,i)=>rpc(c,'app_create_job',jobArgs(`distinct_parallel_${String(i).padStart(2,'0')}`)));
  check(distinct.filter(r=>r.status==='fulfilled').length,2,'only two distinct tasks can reserve ten credits');
  check(distinct.filter(r=>r.status==='rejected' && /INSUFFICIENT_CREDITS/.test(String(r.reason))).length,18,'remaining 18 competing reservations reject');
  check(await account(),{available:0,reserved:10,status:'active'},'concurrent balances never overspend');
  await db.query('insert into credit_packages(id,credits,amount_minor,active) values($1,100,1000,true)',[pack]);
  const order=await rpc(db,'app_create_order',[owner,pack,'paid_parallel_order1']);
  await rpc(db,'app_attach_checkout',[order.id,'cs_parallel','https://checkout.stripe.com/test']);
  // Block the order row to establish overlap for payment RPCs, which lock orders instead of the user advisory key.
  await db.query('begin');await db.query('select id from orders where id=$1 for update',[order.id]);
  const paidPending=Promise.allSettled(cs.map((c,i)=>rpc(c,'app_apply_paid_checkout',[`evt_paid_parallel_${i}`,order.id,'cs_parallel','pi_parallel',1000,'JPY'])));
  const deadline=Date.now()+5000;let paidWaiting=0;
  while(Date.now()<deadline){
   paidWaiting=Number((await db.query("select count(*) as n from pg_stat_activity where datname=$1 and application_name='picjp-concurrency-test' and wait_event_type='Lock'",[database])).rows[0].n);
   if(paidWaiting===20)break;await new Promise(resolve=>setTimeout(resolve,20));
  }
  check(paidWaiting,20,'20 paid events overlap waiting for locked order row');await db.query('commit');
  const paidResults=await paidPending;
  check(paidResults.every(r=>r.status==='fulfilled'),true,'all overlapping paid events succeed');
  const paid=paidResults.map(r=>(r as PromiseFulfilledResult<any>).value);
  check(paid.filter(v=>v.applied).length,1,'distinct paid events grant once');
  check(await account(),{available:100,reserved:10,status:'active'},'one purchase credit balance');
  check(Number((await db.query("select count(*) as n from credit_ledger where kind='purchase'")).rows[0].n),1,'one purchase ledger');
  check(Number((await db.query("select count(*) as n from stripe_events where kind='paid'")).rows[0].n),20,'all distinct paid event IDs recorded');
  await closeClients(cs);
  // Race deletion with input validation. Run 30 independent images/races, including both deterministic lock orders.
  const raceClients=await clients(2);let createdFirst=0;let deletedFirst=0;
  for(let round=0;round<30;round++){
   const raceImage=randomUUID();await seedImage(raceImage);
   await db.query('begin');await db.query('select id from images where id=$1 for update',[raceImage]);
   const actions=[()=>rpc(raceClients[0],'app_create_job',jobArgs(`delete_race_key_${round}`,raceImage)),()=>rpc(raceClients[1],'app_delete_image',[owner,raceImage])];
   // Queue alternating first contender while the owner row is blocked; second overlaps behind it.
   const first=round%2;const one=Promise.allSettled([actions[first]()]);await new Promise(resolve=>setTimeout(resolve,10));const two=Promise.allSettled([actions[1-first]()]);
   await new Promise(resolve=>setTimeout(resolve,10));await db.query('commit');
   const outcomes=(await Promise.all([one,two])).flat();
   const invalid=Number((await db.query("select count(*) as n from images i join job_inputs ji on ji.image_id=i.id join edit_jobs j on j.id=ji.job_id where i.id=$1 and i.status='deleted' and j.status in ('queued','processing')",[raceImage])).rows[0].n);
   check(invalid,0,'delete/create race never creates a running task with deleted input');
   const status=(await db.query('select status from images where id=$1',[raceImage])).rows[0].status;
   if(status==='deleted'){
    deletedFirst++;check(outcomes.some(r=>r.status==='rejected' && /NOT_FOUND/.test(String(r.reason))),true,'deletion winner prevents task');
   }else{
    createdFirst++;check(outcomes.some(r=>r.status==='rejected' && /IMAGE_IN_USE/.test(String(r.reason))),true,'creation winner prevents deletion');
    const pending=(await db.query("select j.id from edit_jobs j join job_inputs ji on ji.job_id=j.id where ji.image_id=$1 and j.status='queued'",[raceImage])).rows[0];
    await rpc(db,'app_cancel_job',[owner,pending.id]);
   }
  }
  check(createdFirst>0,true,'race exercised task-creation-first ordering');check(deletedFirst>0,true,'race exercised image-deletion-first ordering');
  await closeClients(raceClients);
  // Current Charge facts are part of the first paid transaction, including out-of-order reversals.
  const earlyCases:Record<string,any>={};
  for(const label of ['full','partial','disputed']){
   const value=await rpc(db,'app_create_order',[owner,pack,`early_parallel_${label}`]);
   await rpc(db,'app_attach_checkout',[value.id,`cs_early_${label}`,'https://checkout.stripe.com/test']);earlyCases[label]=value;
  }
  const earlyClients=await clients(20);
  async function paidFactsBurst(label:string,refunded:number,disputed:boolean){
   const order=earlyCases[label];
   await db!.query('begin');await db!.query('select id from orders where id=$1 for update',[order.id]);
   const pending=Promise.allSettled(earlyClients.map((c,i)=>rpc(c,'app_apply_paid_checkout',[`evt_early_${label}_${i}`,order.id,`cs_early_${label}`,`pi_early_${label}`,1000,'JPY',refunded,disputed])));
   const deadline=Date.now()+5000;let waiting=0;
   while(Date.now()<deadline){
    waiting=Number((await db!.query("select count(*) as n from pg_stat_activity where datname=$1 and application_name='picjp-concurrency-test' and wait_event_type='Lock'",[database])).rows[0].n);
    if(waiting===20)break;await new Promise(resolve=>setTimeout(resolve,20));
   }
   check(waiting,20,`20 ${label} known-fact paid RPCs overlap`);await db!.query('commit');
   const outcomes=await pending;check(outcomes.every(r=>r.status==='fulfilled'),true,`${label} known-fact paid events succeed`);
   check(outcomes.filter(r=>r.status==='fulfilled' && r.value.applied).length,1,`${label} known-fact purchase granted once`);
  }
  await db.query('update credit_accounts set available=0 where owner_id=$1',[owner]);
  await paidFactsBurst('full',1000,false);
  check(await account(),{available:0,reserved:10,status:'active'},'concurrent fully refunded first-paid events expose zero spendable credits');
  const fullReversals=await Promise.all(earlyClients.map((c,i)=>rpc(c,'app_apply_payment_reversal',[`evt_full_later_${i}`,'pi_early_full',1000,false])));
  check(fullReversals.every(v=>v.revoked_credits===100),true,'later concurrent full reversals preserve entitlement target');
  check(Number((await db.query("select count(*) as n from credit_ledger where reference_id=$1 and kind='revoke'",[earlyCases.full.id])).rows[0].n),1,'full known refund and later reversal have one revoke ledger');
  const spends=await Promise.allSettled(earlyClients.map((c,i)=>rpc(c,'app_create_job',jobArgs(`after_refund_spend_${i}`))));
  check(spends.every(r=>r.status==='rejected' && /INSUFFICIENT_CREDITS/.test(String(r.reason))),true,'full refund paid events cannot fund competing generation');
  await paidFactsBurst('partial',333,false);
  check(await account(),{available:66,reserved:10,status:'active'},'concurrent partially refunded first-paid exposes only net entitlement');
  await Promise.all(earlyClients.map((c,i)=>rpc(c,'app_apply_payment_reversal',[`evt_partial_later_${i}`,'pi_early_partial',500,false])));
  check((await account()).available,50,'later concurrent cumulative refunds withdraw difference once');
  // Isolate the disputed order from earlier legitimate funds in this synthetic scenario.
  await db.query('update credit_accounts set available=0 where owner_id=$1',[owner]);
  await paidFactsBurst('disputed',0,true);
  check(await account(),{available:0,reserved:10,status:'restricted'},'concurrent already-disputed first-paid exposes zero spendable credits and freezes account');
  await Promise.all(earlyClients.map((c,i)=>rpc(c,'app_apply_payment_reversal',[`evt_disputed_later_${i}`,'pi_early_disputed',500,false])));
  check((await account()).available,0,'later concurrent partial refund does not reverse dispute entitlement withdrawal');
  check(Number((await db.query("select count(*) as n from credit_ledger where reference_id=$1 and kind='revoke'",[earlyCases.disputed.id])).rows[0].n),1,'dispute and later partial refunds revoke once');
  await closeClients(earlyClients);
  // Console v1: independent sessions genuinely overlap behind the exact locks
  // taken by ingestion/finalization. Attempts/polls/retries must not inflate use.
  await db.query("update console_settings set environment='test',collection_enabled=true");
  const cc=await clients(20);
  const exposure={event_id:randomUUID(),name:'tool_exposed',page_view_id:randomUUID(),exposure_id:randomUUID(),tool_id:'remove_person',device:'desktop',occurred_at:new Date().toISOString(),visible_ms:1000,visible_ratio:0.5};
  await db.query('select pg_advisory_lock(hashtextextended($1::text,37))',[exposure.event_id]);
  const eventPending=Promise.allSettled(cc.map(c=>rpc(c,'app_console_record_event',[owner,JSON.stringify(exposure)])));
  const eventDeadline=Date.now()+5000;let eventWaiting=0;
  try {
   while(Date.now()<eventDeadline){
    eventWaiting=Number((await db.query("select count(*) n from pg_stat_activity where datname=$1 and application_name='picjp-concurrency-test' and wait_event='advisory'",[database])).rows[0].n);
    if(eventWaiting===cc.length)break;await new Promise(resolve=>setTimeout(resolve,20));
   }
   check(eventWaiting,20,'20 exact event replays overlap on their ingestion lock');
  }finally{await db.query('select pg_advisory_unlock(hashtextextended($1::text,37))',[exposure.event_id]);}
  const eventOutcomes=await eventPending;
  check(eventOutcomes.every(r=>r.status==='fulfilled'),true,'all exact event replays succeed');
  check(eventOutcomes.filter(r=>r.status==='fulfilled'&&r.value.recording==='recorded').length,1,'only one event replay is recorded');
  const semantic=await Promise.all(cc.map(c=>rpc(c,'app_console_record_event',[owner,JSON.stringify({...exposure,event_id:randomUUID()})])));
  check(semantic.every(r=>r.recording==='duplicate'),true,'new event IDs cannot duplicate the same page/tool exposure');
  const consoleJob=randomUUID(),consoleImage=randomUUID(),actionId=randomUUID();
  await db.query(`insert into edit_jobs(id,owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved) values($1,$2,'remove_person',$3,$4,'[]','{}',3)`,[consoleJob,owner,randomUUID(),hash]);
  await db.query(`insert into images(id,owner_id,status,source_kind,source_job_id,storage_key,preview_key,sha256,mime_type,bytes,width,height,expires_at) values($1,$2,'ready','generated',$3,$4,$5,$6,'image/png',10,2,2,now()+interval '7 days')`,[consoleImage,owner,consoleJob,`results/${consoleImage}.png`,`results/${consoleImage}.jpg`,hash]);
  await db.query("update edit_jobs set status='completed',result_image_id=$2,completed_at=now() where id=$1",[consoleJob,consoleImage]);
  const beginActions=await Promise.all(cc.map(c=>rpc(c,'app_console_begin_download',[owner,consoleImage,actionId,'desktop'])));
  check(beginActions.every(r=>r.capture),true,'20 concurrent download intents succeed');
  check(Number((await db.query('select count(*) n from console_download_actions where action_id=$1',[actionId])).rows[0].n),1,'concurrent intents share one durable action');
  await db.query('begin');await db.query('select * from console_download_actions where action_id=$1 for update',[actionId]);
  const downloadPending=Promise.allSettled(cc.map(c=>rpc(c,'app_console_finish_download',[owner,actionId,true])));
  const downloadDeadline=Date.now()+5000;let downloadWaiting=0;
  try{
   while(Date.now()<downloadDeadline){
    downloadWaiting=Number((await db.query("select count(*) n from pg_stat_activity where datname=$1 and application_name='picjp-concurrency-test' and wait_event_type='Lock'",[database])).rows[0].n);
    if(downloadWaiting===cc.length)break;await new Promise(resolve=>setTimeout(resolve,20));
   }
   check(downloadWaiting,20,'20 signed-link confirmations overlap on the action row');
  }finally{await db.query('commit');}
  const downloadOutcomes=await downloadPending;
  check(downloadOutcomes.every(r=>r.status==='fulfilled'),true,'all signed-link replays succeed');
  check(downloadOutcomes.filter(r=>r.status==='fulfilled'&&r.value.recording==='recorded').length,1,'one save-behavior event for 20 signed-link replays');
  check(Number((await db.query("select count(*) n from analytics_events where name='download_url_issued' and job_id=$1",[consoleJob])).rows[0].n),1,'only one durable save event after concurrency');
  await closeClients(cc);
  const summary=await rpc(db,'app_personal_summary',[owner]);
  const directCount=Number((await db.query('select count(*) n from edit_jobs where owner_id=$1 and created_at>=$2 and created_at<$3',[owner,summary.window.start,summary.as_of])).rows[0].n);
  check(summary.jobs.total,directCount,'native personal summary agrees with owner-bound facts');
  const personalJobs=await rpc(db,'app_personal_jobs',[owner,JSON.stringify({limit:50,status:'completed'}),false]);
  check(personalJobs.items.every((j:any)=>j.status==='completed'),true,'native personal jobs filter uses public DTOs');
  check(JSON.stringify(personalJobs.items).includes('final_prompt'),false,'native personal job projection excludes execution prompts');
  const personalWorks=await rpc(db,'app_personal_jobs',[owner,JSON.stringify({limit:50,availability:'ready'}),true]);
  check(personalWorks.items.some((w:any)=>w.job.job_id===consoleJob),true,'native works query includes the ready generated result');
  const personalLedger=await rpc(db,'app_personal_ledger',[owner,JSON.stringify({limit:2})]);
  check(personalLedger.items.length,2,'native ledger respects page limit');
  check(typeof personalLedger.next_cursor,'string','native ledger emits a stable continuation cursor');
  check(personalLedger.items.some((e:any)=>'business_key' in e),false,'native ledger excludes internal business keys');
  console.log(`Native PostgreSQL independent-session concurrency passed: ${assertions} assertions; 20 same-key creates, 20 competing balances, 20 cancellations, 20 paid events, 30 delete/create races (${createdFirst} creation wins / ${deletedFirst} deletion wins); full/partial/disputed known-Charge facts and later reversal races.`);
 }finally{
  if(db)await db.query('rollback').catch(()=>{});
  await Promise.allSettled([...sessions].map(c=>c.end()));
  if(db)await db.end();
  if(created)await admin.query(`drop database ${database} with (force)`);
  await admin.end();
 }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
