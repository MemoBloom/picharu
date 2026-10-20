import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Test-only Supabase Auth compatibility fixture. Never apply this fixture to production.
const db = new PGlite();
let checks = 0;
const sql = (query: string, values: unknown[] = []) => db.query<Record<string, any>>(query, values);
async function scalar(query: string, values: unknown[] = []) { return (await sql(query, values)).rows[0]?.value; }
async function rpc(name: string, values: unknown[]) { return scalar(`select public.${name}(${values.map((_,i)=>`$${i+1}`).join(',')}) as value`, values); }
function check(value: unknown, expected: unknown, message: string) { assert.deepEqual(value, expected, message); checks++; }
async function fails(action: () => Promise<unknown>, message: string) {
  await assert.rejects(action, new RegExp(message)); checks++;
}
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const image = '00000000-0000-4000-8000-000000000010';
const foreignImage = '00000000-0000-4000-8000-000000000011';
const uploadedImage = '00000000-0000-4000-8000-000000000012';
const pack = '00000000-0000-4000-8000-000000000020';
const hash = 'a'.repeat(64);
const inputs = [{image_id:image,role:'primary'}];
const snapshot = {contract_version:'1.0.0',tool_id:'remove_person',tool_version:1,prompt_id:'remove_person_default',prompt_version:1,final_prompt:'Remove the background pedestrian.',parameters:{},output:{quality:'standard',aspect_ratio:'preserve'},execution_type:'commercial_edit',execution_version:1,model_profile:{profile_id:'verified-fixture'},pricing_version:'test-v1',inputs};
async function job(key: string, credits=5, overrides: {hash?:string;inputs?:unknown;snapshot?:unknown;parent?:string}={}) {
 return rpc('app_create_job',[owner,key,overrides.hash??hash,JSON.stringify(overrides.inputs??inputs),JSON.stringify(overrides.snapshot??snapshot),credits,overrides.parent??null]);
}
async function account() { return (await sql('select available::int,reserved::int,status from credit_accounts where owner_id=$1',[owner])).rows[0]; }
async function upload(id:string,user:string=owner) {
 await rpc('app_create_upload',[user,id,'image/jpeg',100,`temp/${id}`,new Date(Date.now()+86400000).toISOString()]);
 return rpc('app_complete_upload',[user,id,`fixed/${id}.png`,`preview/${id}.jpg`,hash,'image/png',200,100,100]);
}
async function main() {
try {
 await db.exec(`create schema auth; create table auth.users(id uuid primary key);
 create role anon; create role authenticated; create role service_role bypassrls;
 grant usage on schema public,auth to anon,authenticated,service_role;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant execute on function auth.uid() to anon,authenticated,service_role;`);
 await db.exec(await readFile('supabase/migrations/202610190001_web_backend.sql','utf8'));
 await sql('insert into auth.users(id) values($1),($2)',[owner,other]);
 check(await account(),{available:0,reserved:0,status:'active'},'new accounts have zero credits');
 await upload(image); await upload(foreignImage,other);
 await fails(()=>rpc('app_consume_rate_limit',['null-limit',null,60]),'INVALID_REQUEST');
 await fails(()=>rpc('app_create_upload',[owner,'00000000-0000-4000-8000-000000000099',null,100,'temp/null',null]),'INVALID_REQUEST');
 await fails(()=>rpc('app_create_job',[owner,'null_snapshot_01',hash,JSON.stringify(inputs),JSON.stringify({}),5,null]),'INVALID_REQUEST');
 await fails(()=>rpc('app_create_job',[owner,'null_inputs_0001',hash,null,JSON.stringify(snapshot),5,null]),'INVALID_REQUEST');
 await fails(()=>rpc('app_create_job',[owner,'object_input_001',hash,'{}',JSON.stringify(snapshot),5,null]),'INVALID_REQUEST');
 await fails(()=>job('missing_role_001',5,{inputs:[{image_id:image}],snapshot:{...snapshot,inputs:[{image_id:image}]}}),'INVALID_REQUEST');
 await fails(()=>job('null_contract_01',5,{snapshot:{...snapshot,contract_version:null}}),'INVALID_REQUEST');
 const stable = await rpc('app_complete_upload',[owner,image,'overwrite.png','overwrite.jpg','b'.repeat(64),'image/png',50,5,5]);
 check(stable.storage_key,`fixed/${image}.png`,'completion pins the first image version');
 await fails(()=>rpc('app_complete_upload',[other,image,'x','y',hash,'image/png',1,1,1]),'NOT_FOUND');
 await fails(()=>job('insufficient_key1'),'INSUFFICIENT_CREDITS');
 check(await scalar('select count(*)::int as value from edit_jobs'),0,'failed reservations roll back tasks');
 await sql('update credit_accounts set available=20 where owner_id=$1',[owner]);
 await fails(()=>job('bad_owner_input1',5,{inputs:[{image_id:foreignImage,role:'primary'}],snapshot:{...snapshot,inputs:[{image_id:foreignImage,role:'primary'}]}}),'NOT_FOUND');
 await rpc('app_create_upload',[owner,uploadedImage,'image/png',100,`temp/${uploadedImage}`,new Date(Date.now()+86400000).toISOString()]);
 await fails(()=>job('not_ready_input1',5,{inputs:[{image_id:uploadedImage,role:'primary'}],snapshot:{...snapshot,inputs:[{image_id:uploadedImage,role:'primary'}]}}),'IMAGE_NOT_READY');
 await fails(()=>rpc('app_complete_upload',[owner,uploadedImage,'fixed-new','preview-new',null,'image/png',1,1,1]),'INVALID_REQUEST');
 await fails(()=>rpc('app_complete_upload',[owner,uploadedImage,`temp/${uploadedImage}`,'preview-new',hash,'image/png',1,1,1]),'INVALID_REQUEST');
 await fails(()=>sql("update images set status='ready',storage_key='bad-fixed',preview_key='bad-preview',mime_type='image/png',bytes=1,width=1,height=1 where id=$1",[uploadedImage]),'check constraint');
 await sql("update images set expires_at=now()-interval '1 second' where id=$1",[image]);
 await fails(()=>job('expired_input_01'),'NOT_FOUND');
 await sql("update images set expires_at=now()+interval '1 day' where id=$1",[image]);
 const j=await job('same_request_key1');
 check(j.replayed,false,'first request creates task');
 check(await account(),{available:15,reserved:5,status:'active'},'reservation moves balance atomically');
 check((await job('same_request_key1')).job_id,j.job_id,'same idempotency key reuses task');
 await fails(()=>rpc('app_create_job',[owner,'same_request_key1',null,JSON.stringify(inputs),JSON.stringify(snapshot),5,null]),'IDEMPOTENCY_CONFLICT');
 check((await job('same_request_key1',9,{snapshot:{...snapshot,pricing_version:'changed'}})).credits_reserved,5,'replay keeps frozen price and snapshot');
 await fails(()=>job('same_request_key1',5,{hash:'b'.repeat(64)}),'IDEMPOTENCY_CONFLICT');
 await fails(()=>rpc('app_delete_image',[owner,image]),'IMAGE_IN_USE');
 await fails(()=>rpc('app_cancel_job',[other,j.job_id]),'NOT_FOUND');
 await rpc('app_cancel_job',[owner,j.job_id]); await rpc('app_cancel_job',[owner,j.job_id]);
 check(await account(),{available:20,reserved:0,status:'active'},'repeat cancellation releases exactly once');
 check(await scalar("select count(*)::int as value from credit_ledger where kind='release'"),1,'single release ledger');
 await fails(()=>sql('update edit_jobs set snapshot=$1 where id=$2',[JSON.stringify({...snapshot,final_prompt:'changed'}),j.job_id]),'IMMUTABLE_JOB');
 await fails(()=>sql("update edit_jobs set status='queued' where id=$1",[j.job_id]),'TERMINAL_JOB');
 await fails(()=>job('invalid_parent01',5,{parent:j.job_id}),'INVALID_REQUEST');
 await fails(()=>job('foreign_parent01',5,{parent:'00000000-0000-4000-8000-000000000098'}),'NOT_FOUND');
 const processing=await job('processing_key01');
 await sql("update edit_jobs set status='processing' where id=$1",[processing.job_id]);
 await fails(()=>rpc('app_cancel_job',[owner,processing.job_id]),'JOB_NOT_CANCELLABLE');
 await fails(()=>rpc('app_delete_image',[owner,image]),'IMAGE_IN_USE');
 check(await rpc('app_consume_rate_limit',['test-key',2,60]),true,'rate first');
 check(await rpc('app_consume_rate_limit',['test-key',2,60]),true,'rate second');
 check(await rpc('app_consume_rate_limit',['test-key',2,60]),false,'rate limited');
 await sql("update rate_buckets set window_start=now()-interval '61 seconds' where key='test-key'");
 check(await rpc('app_consume_rate_limit',['test-key',2,60]),true,'rate window resets');
 await sql('insert into credit_packages(id,credits,amount_minor,active) values($1,100,1000,true)',[pack]);
 const order=await rpc('app_create_order',[owner,pack,'checkout_key0001']);
 check(order.metadata,{order_id:order.id,user_id:owner},'order stores expected provider metadata');
 check((await rpc('app_create_order',[owner,pack,'checkout_key0001'])).id,order.id,'order idempotency');
 await fails(()=>rpc('app_create_order',[owner,null,'checkout_key0001']),'IDEMPOTENCY_CONFLICT');
 await fails(()=>rpc('app_create_order',[owner,'00000000-0000-4000-8000-000000000098','checkout_key0001']),'IDEMPOTENCY_CONFLICT');
 await sql('update credit_packages set credits=999,amount_minor=9999 where id=$1',[pack]);
 check((await rpc('app_create_order',[owner,pack,'checkout_key0001'])).credits,100,'order preserves package snapshot');
 await rpc('app_attach_checkout',[order.id,'cs_verified','https://checkout.stripe.com/test']);
 await fails(()=>rpc('app_attach_checkout',[order.id,'cs_different','https://checkout.stripe.com/test']),'PAYMENT_MISMATCH');
 await fails(()=>rpc('app_apply_paid_checkout',['evt_wrong',order.id,'cs_verified','pi_verified',999,'JPY']),'PAYMENT_MISMATCH');
 check(await scalar("select count(*)::int as value from stripe_events where event_id='evt_wrong'"),0,'invalid event not persisted');
 check((await rpc('app_apply_paid_checkout',['evt_paid',order.id,'cs_verified','pi_verified',1000,'jpy'])).applied,true,'paid credits granted');
 check((await rpc('app_apply_paid_checkout',['evt_paid',order.id,'cs_verified','pi_verified',1000,'JPY'])).applied,false,'event replay idempotency');
 check((await rpc('app_apply_paid_checkout',['evt_paid_2',order.id,'cs_verified','pi_verified',1000,'JPY'])).applied,false,'different paid event does not double grant');
 check(await account(),{available:115,reserved:5,status:'active'},'single purchased credit grant');
 const refund=await rpc('app_apply_payment_reversal',['evt_refund_1','pi_verified',1,false]);
 check(refund.revoked_credits,1,'refund rounds fractional entitlement up');
 await rpc('app_apply_payment_reversal',['evt_refund_1','pi_verified',1,false]);
 await rpc('app_apply_payment_reversal',['evt_refund_2','pi_verified',500,false]);
 check((await account()).available,65,'cumulative refund withdraws incremental entitlement');
 await rpc('app_apply_payment_reversal',['evt_refund_older','pi_verified',100,false]);
 check((await account()).available,65,'out-of-order lower refund never regrants');
 await sql('update credit_accounts set available=3 where owner_id=$1',[owner]);
 const shortage=await rpc('app_apply_payment_reversal',['evt_refund_full','pi_verified',1000,false]);
 check(shortage.shortfall,47,'spent entitlement records reconciliation shortfall');
 check(await account(),{available:0,reserved:5,status:'restricted'},'refund never makes balance negative; restricted on shortfall');
 await rpc('app_apply_paid_checkout',['evt_paid_late',order.id,'cs_verified','pi_verified',1000,'JPY']);
 check((await account()).available,0,'late paid event cannot restore refunded entitlement');
 check(await scalar('select status as value from orders where id=$1',[order.id]),'refunded','late paid preserves refund status');
 await rpc('app_apply_payment_reversal',['evt_dispute','pi_verified',1000,true]);
 check(await scalar('select status as value from orders where id=$1',[order.id]),'disputed','dispute freezes order');
 await fails(()=>job('restricted_key01'),'ACCOUNT_RESTRICTED');
 await fails(()=>rpc('app_apply_payment_reversal',['evt_unknown','pi_unknown',1,false]),'PAYMENT_MISMATCH');
 const tombstone=await rpc('app_delete_image',[owner,uploadedImage]);
 check(tombstone.cleanup_pending,true,'tombstone persists pending object cleanup');
 check((await rpc('app_delete_image',[owner,uploadedImage])).status,'deleted','repeat delete idempotency');
 // Refund/dispute facts may precede the first paid webhook. Grant and revoke must be one RPC transaction.
 await sql('update credit_packages set credits=100,amount_minor=1000 where id=$1',[pack]);
 async function earlyOrder(user:string,label:string){
  await sql('insert into auth.users(id) values($1)',[user]);
  const value=await rpc('app_create_order',[user,pack,`early_fact_${label}_key`]);
  await rpc('app_attach_checkout',[value.id,`cs_${label}`,'https://checkout.stripe.com/test']);
  return value;
 }
 async function userAccount(user:string){return (await sql('select available::int,reserved::int,status from credit_accounts where owner_id=$1',[user])).rows[0];}
 const fullUser='00000000-0000-4000-8000-000000000030';
 const earlyFull=await earlyOrder(fullUser,'full');
 await fails(()=>rpc('app_apply_payment_reversal',['evt_full_before_paid','pi_early_full',1000,false]),'PAYMENT_MISMATCH');
 await rpc('app_apply_paid_checkout',['evt_full_paid',earlyFull.id,'cs_full','pi_early_full',1000,'JPY',1000,false]);
 check(await userAccount(fullUser),{available:0,reserved:0,status:'active'},'full refund before paid never creates spendable credits');
 check(await scalar('select revoked_credits as value from orders where id=$1',[earlyFull.id]),100,'paid records known full entitlement reversal');
 check(await scalar('select status as value from orders where id=$1',[earlyFull.id]),'refunded','paid preserves known full refund');
 await rpc('app_apply_paid_checkout',['evt_full_paid',earlyFull.id,'cs_full','pi_early_full',1000,'JPY',1000,false]);
 await rpc('app_apply_payment_reversal',['evt_full_before_paid','pi_early_full',1000,false]);
 await rpc('app_apply_payment_reversal',['evt_full_older','pi_early_full',500,false]);
 check(await userAccount(fullUser),{available:0,reserved:0,status:'active'},'later reversal and duplicate paid do not re-revoke');
 check(await scalar("select count(*)::int as value from credit_ledger where owner_id=$1 and kind='revoke'",[fullUser]),1,'known full refund has one revoke ledger');
 const partialUser='00000000-0000-4000-8000-000000000031';
 const earlyPartial=await earlyOrder(partialUser,'partial');
 await rpc('app_apply_paid_checkout',['evt_partial_paid',earlyPartial.id,'cs_partial','pi_early_partial',1000,'JPY',333,false]);
 check(await userAccount(partialUser),{available:66,reserved:0,status:'active'},'partial refund pays only net rounded entitlement');
 check(await scalar('select revoked_credits as value from orders where id=$1',[earlyPartial.id]),34,'partial known refund rounds reversal up');
 await rpc('app_apply_payment_reversal',['evt_partial_500','pi_early_partial',500,false]);
 check((await userAccount(partialUser)).available,50,'subsequent cumulative reversal only withdraws difference');
 await rpc('app_apply_paid_checkout',['evt_partial_paid_new',earlyPartial.id,'cs_partial','pi_early_partial',1000,'JPY',700,false]);
 check((await userAccount(partialUser)).available,30,'different paid event with advanced Charge reconciles without duplicate grant');
 await rpc('app_apply_paid_checkout',['evt_partial_paid',earlyPartial.id,'cs_partial','pi_early_partial',1000,'JPY',700,false]);
 check((await userAccount(partialUser)).available,30,'same event replay accepts advanced retrieved Charge without mutation');
 check(await scalar("select count(*)::int as value from credit_ledger where owner_id=$1 and kind='purchase'",[partialUser]),1,'advanced paid facts still grant once');
 const disputeUser='00000000-0000-4000-8000-000000000032';
 const earlyDispute=await earlyOrder(disputeUser,'dispute');
 await rpc('app_apply_paid_checkout',['evt_dispute_paid',earlyDispute.id,'cs_dispute','pi_early_dispute',1000,'JPY',0,true]);
 check(await userAccount(disputeUser),{available:0,reserved:0,status:'restricted'},'dispute before paid creates zero available and restricted account');
 check(await scalar('select revoked_credits as value from orders where id=$1',[earlyDispute.id]),100,'dispute withdraws full order entitlement');
 await rpc('app_apply_payment_reversal',['evt_dispute_later_refund','pi_early_dispute',500,false]);
 await rpc('app_apply_paid_checkout',['evt_dispute_paid_new',earlyDispute.id,'cs_dispute','pi_early_dispute',1000,'JPY',0,false]);
 check(await userAccount(disputeUser),{available:0,reserved:0,status:'restricted'},'later lower refund/undisputed snapshot cannot restore disputed credits');
 check(await scalar('select status as value from orders where id=$1',[earlyDispute.id]),'disputed','dispute is monotonic across late paid facts');
 await fails(()=>rpc('app_apply_paid_checkout',['evt_bad_refund',earlyFull.id,'cs_full','pi_early_full',1000,'JPY',1001,false]),'PAYMENT_MISMATCH');
 await fails(()=>rpc('app_apply_paid_checkout',['evt_null_refund',earlyFull.id,'cs_full','pi_early_full',1000,'JPY',null,false]),'PAYMENT_MISMATCH');
 await fails(()=>rpc('app_apply_paid_checkout',['evt_null_dispute',earlyFull.id,'cs_full','pi_early_full',1000,'JPY',0,null]),'PAYMENT_MISMATCH');
 // Authorization tests use actual PostgreSQL RLS/privilege enforcement.
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
 check(await scalar('select count(*)::int as value from credit_accounts'),1,'RLS exposes only own account');
 check(await scalar('select count(*)::int as value from images'),2,'RLS exposes only own images');
 await fails(()=>sql('select storage_key from images'),'permission denied');
 await fails(()=>sql('select snapshot from edit_jobs'),'permission denied');
 await fails(()=>rpc('app_consume_rate_limit',['browser',1,1]),'permission denied');
 await fails(()=>sql('update credit_accounts set available=999'),'permission denied');
 await db.exec('reset role; set role anon;');
 await fails(()=>sql('select * from credit_accounts'),'permission denied');
 await fails(()=>rpc('app_cancel_job',[owner,j.job_id]),'permission denied');
 await db.exec('reset role; set role service_role;');
 check(await rpc('app_consume_rate_limit',['service-role',1,1]),true,'service role can call RPC');
 console.log(`Postgres migration and ${checks} database assertions passed (PGlite). Real Supabase/network and independent-session concurrency are not covered by this local harness.`);
} finally { await db.close(); }

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
