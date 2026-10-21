import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {recordStripeRefundFacts} from '../apps/web/src/server/analytics-refunds';
import {StripePayments} from '../apps/web/src/server/payments';
import {createRouter} from '../apps/web/src/server/router';
import {ApiError} from '../apps/web/src/server/errors';
import type {Database,Dependencies,Payments,Row} from '../apps/web/src/server/ports';

const sdk=vi.hoisted(()=>({list:vi.fn()}));
vi.mock('stripe',()=>({default:class{refunds={list:sdk.list};}}));
const order={id:'00000000-0000-4000-8000-000000000001',currency:'JPY',amount_minor:1000};
const now=()=>new Date('2026-10-21T00:00:00.000Z');
function refund(id='re_first',extra:Row={}){return {id,object:'refund',charge:'ch_fixture',amount:100,currency:'jpy',created:Math.floor(new Date('2026-10-01T00:00:00Z').getTime()/1000),status:'succeeded',metadata:{private:'NEVER_RETAIN'},...extra};}
function fake(pages:Row[]=[{data:[refund()],has_more:false}]){
 const calls:{name:string;args:Row}[]=[];
 const listRefunds=vi.fn(async(_charge:string,_cursor?:string)=>pages.shift() as {data:Row[];has_more:boolean});
 const deps={now,payments:{listRefunds} as unknown as Payments,db:{async rpc(name:string,args:Row){calls.push({name,args});return {recorded:args.p_refunds?.length||0};}} as unknown as Database};
 return {deps,calls,listRefunds};
}
const run=(deps:Pick<Dependencies,'db'|'payments'|'now'>,expected?:number)=>recordStripeRefundFacts(deps,order,'ch_fixture','evt_refund',expected);

describe('trusted Stripe refund fact collection',()=>{
 it('reads bounded pages and persists real refund identity, occurrence, amount and status only',async()=>{
  const second=refund('re_second',{amount:200,created:refund().created+86400,status:'pending'});
  const {deps,calls,listRefunds}=fake([{data:[refund()],has_more:true},{data:[second],has_more:false}]);
  expect(await run(deps,100)).toEqual({recorded:2,refunds:2});
  expect(listRefunds.mock.calls).toEqual([['ch_fixture',undefined],['ch_fixture','re_first']]);
  expect(calls).toEqual([{name:'app_console_record_refunds',args:{p_order_id:order.id,p_event_id:'evt_refund',p_refunds:[{id:'re_first',occurred_at:'2026-10-01T00:00:00.000Z',amount_minor:100,currency:'JPY',status:'succeeded'},{id:'re_second',occurred_at:'2026-10-02T00:00:00.000Z',amount_minor:200,currency:'JPY',status:'pending'}]}}]);
  expect(JSON.stringify(calls)).not.toContain('NEVER_RETAIN');
 });
 it('does not turn a cumulative refunded charge into one refund and deduplicates exact provider replays',async()=>{
  const {deps,calls}=fake([{data:[refund(),refund(),refund('re_other',{amount:200})],has_more:false}]);
  expect(await run(deps,300)).toEqual({recorded:2,refunds:2});
  expect(calls[0].args.p_refunds.map((r:Row)=>r.amount_minor)).toEqual([100,200]);
 });
 it('accepts expanded charge references and prevents a duplicate pending value from downgrading terminal facts',async()=>{
  const {deps,calls}=fake([{data:[refund('re_one',{charge:{id:'ch_fixture'}}),refund('re_one',{charge:{id:'ch_fixture'},status:'pending'})],has_more:false}]);
  await run(deps,100);expect(calls[0].args.p_refunds[0].status).toBe('succeeded');
 });
 it('records an empty complete list and lets its transaction resolve a former gap',async()=>{
  const {deps,calls}=fake([{data:[],has_more:false}]);expect(await run(deps,0)).toEqual({recorded:0,refunds:0});
  expect(calls[0].name).toBe('app_console_record_refunds');expect(calls).toHaveLength(1);
 });
 it('retains pending refund status without asserting it is a successful outflow',async()=>{
  const {deps,calls}=fake([{data:[refund('re_pending',{status:'pending'})],has_more:false}]);
  await run(deps,100);expect(calls[0].args.p_refunds).toEqual([{id:'re_pending',occurred_at:'2026-10-01T00:00:00.000Z',amount_minor:100,currency:'JPY',status:'pending'}]);
 });
 it('preserves requires_action as a legitimate nonterminal provider status',async()=>{
  const {deps,calls}=fake([{data:[refund('re_action',{status:'requires_action'})],has_more:false}]);
  await run(deps,100);expect(calls[0].args.p_refunds[0].status).toBe('requires_action');
 });
 it.each(['pending','requires_action','succeeded','failed','canceled'])('preserves the exact supported provider state %s',async status=>{
  const {deps,calls}=fake([{data:[refund('re_state',{status})],has_more:false}]);
  await run(deps,['failed','canceled'].includes(status)?0:100);expect(calls[0].args.p_refunds[0].status).toBe(status);
 });
 it('persists a list failure gap before returning a canonical retryable error',async()=>{
  const {deps,calls,listRefunds}=fake();listRefunds.mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_ERROR'));
  await expect(run(deps)).rejects.toMatchObject({code:'SERVICE_UNAVAILABLE',status:503,retryable:true,message:'SERVICE_UNAVAILABLE'});
  expect(calls).toEqual([{name:'app_console_note_refund_gap',args:{p_order_id:order.id,p_event_id:'evt_refund',p_reason:'list_failed'}}]);
 });
 it('does not require legacy fakes to implement the optional port at type level, but never silently claims collection',async()=>{
  const {deps,calls}=fake();delete deps.payments.listRefunds;
  await expect(run(deps)).rejects.toMatchObject({retryable:true});expect(calls[0].args.p_reason).toBe('list_failed');
 });
 it.each([
  ['wrong-charge',{charge:'ch_someone_else'}],['mismatched-currency',{currency:'usd'}],['bad-id',{id:'ch_not_a_refund'}],
  ['unsafe-amount',{amount:Number.MAX_SAFE_INTEGER+1}],['zero-amount',{amount:0}],['oversized-amount',{amount:1001}],
  ['fractional-time',{created:refund().created+.5}],['future-time',{created:Math.floor(now().getTime()/1000)+301}],
  ['unknown-status',{status:'future_provider_status'}],['null-status',{status:null}],
 ])('marks %s as an explicit payload gap rather than writing invented facts',async(_name,patch)=>{
  const {deps,calls}=fake([{data:[refund('re_invalid',patch)],has_more:false}]);
  await expect(run(deps)).rejects.toMatchObject({status:503,retryable:true});expect(calls).toHaveLength(1);expect(calls[0].args.p_reason).toBe('invalid_payload');
 });
 it('rejects conflicting duplicate amounts and currencies without a partial write',async()=>{
  const {deps,calls}=fake([{data:[refund(),refund('re_first',{amount:101})],has_more:false}]);
  await expect(run(deps)).rejects.toThrow('SERVICE_UNAVAILABLE');expect(calls[0].name).toBe('app_console_note_refund_gap');
 });
 it.each([{data:[],has_more:true},{data:[refund()],has_more:'yes'}])('marks incomplete or malformed page metadata without treating it as an empty list',async page=>{
  const {deps,calls}=fake([page]);await expect(run(deps)).rejects.toThrow('SERVICE_UNAVAILABLE');expect(calls[0].name).toBe('app_console_note_refund_gap');
 });
 it('detects repeated cursors and bounds otherwise advancing pagination',async()=>{
  const repeated=fake([{data:[refund()],has_more:true},{data:[refund()],has_more:true}]);
  await expect(run(repeated.deps)).rejects.toThrow('SERVICE_UNAVAILABLE');expect(repeated.calls[0].args.p_reason).toBe('incomplete_page');expect(repeated.listRefunds).toHaveBeenCalledTimes(2);
  const endless=fake(Array.from({length:20},(_,i)=>({data:[refund(`re_${i}`)],has_more:true})));
  await expect(run(endless.deps)).rejects.toThrow('SERVICE_UNAVAILABLE');expect(endless.listRefunds).toHaveBeenCalledTimes(8);expect(endless.calls[0].args.p_reason).toBe('incomplete_list');
 });
 it('rejects more than 100 atomic facts without writing a plausible truncated total',async()=>{
  const {deps,calls,listRefunds}=fake([{data:Array.from({length:100},(_,i)=>refund(`re_${i}`,{amount:1})),has_more:true}]);
  await expect(run(deps)).rejects.toThrow('SERVICE_UNAVAILABLE');expect(listRefunds).toHaveBeenCalledTimes(1);expect(calls[0].args.p_reason).toBe('incomplete_list');
 });
 it('treats a cumulative reconciliation mismatch as a collection gap, never a synthetic balancing refund',async()=>{
  const {deps,calls}=fake();await expect(run(deps,200)).rejects.toThrow('SERVICE_UNAVAILABLE');expect(calls[0].args.p_reason).toBe('incomplete_list');
 });
 it('persists write failures and remains retryable even if the gap database is also unavailable',async()=>{
  const {deps,calls}=fake();deps.db.rpc=async(name,args)=>{calls.push({name,args});throw new Error('PRIVATE_DB_ERROR');};
  await expect(run(deps)).rejects.toMatchObject({code:'SERVICE_UNAVAILABLE',retryable:true});expect(calls.map(c=>c.name)).toEqual(['app_console_record_refunds','app_console_note_refund_gap']);expect(calls[1].args.p_reason).toBe('persistence_failed');
 });
});

describe('Stripe SDK refund read adapter',()=>{
 beforeEach(()=>{sdk.list.mockReset();vi.stubEnv('STRIPE_SECRET_KEY','sk_test_synthetic');});
 afterAll(()=>vi.unstubAllEnvs());
 it('uses installed SDK GET refund list with charge, finite limit and explicit cursor',async()=>{
  sdk.list.mockResolvedValueOnce({data:[refund()],has_more:true}).mockResolvedValueOnce({data:[],has_more:false});
  const payments=new StripePayments();expect(await payments.listRefunds('ch_fixture')).toEqual({data:[refund()],has_more:true});
  await payments.listRefunds('ch_fixture','re_first');
  expect(sdk.list.mock.calls).toEqual([[{charge:'ch_fixture',limit:25},{timeout:3000,maxNetworkRetries:0}],[{charge:'ch_fixture',limit:25,starting_after:'re_first'},{timeout:3000,maxNetworkRetries:0}]]);
 });
});

describe('refund collection against actual isolated migrations',()=>{
 let pg:PGlite;const owner='00000000-0000-4000-8000-000000000002';
 async function sql(q:string,args:unknown[]=[]){return pg.query<Row>(q,args);}
 async function rpc<T>(name:string,args:Row):Promise<T>{const entries=Object.entries(args);return (await sql(`select ${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) value`,entries.map(([,value])=>value!==null&&typeof value==='object'?JSON.stringify(value):value))).rows[0]?.value as T;}
 beforeAll(async()=>{
  pg=new PGlite();await pg.exec('create schema auth;create table auth.users(id uuid primary key,email text);create role anon;create role authenticated;create role service_role bypassrls;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;');
  for(const file of ['202610190001_web_backend.sql','202610200400_worker.sql','202610210100_console_foundation.sql','202610210200_personal_console.sql','202610210300_admin_analytics.sql'])await pg.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
  await sql('insert into auth.users(id) values($1)',[owner]);await pg.exec("insert into credit_packages(package_id,credits,amount_minor,currency) values('synthetic',10,1000,'JPY')");
 });
 afterAll(async()=>{await pg.close();});
 it('collects independently of both browser and refund coverage toggles and retains real occurrence dates',async()=>{
  const id=randomUUID();await sql("insert into orders(id,owner_id,package_id,idempotency_key,credits,amount_minor,currency,status) values($1,$2,(select id from credit_packages limit 1),$3,10,1000,'JPY','paid')",[id,owner,randomUUID()]);
  const f=refund('re_isolated',{created:Math.floor(Date.now()/1000)-86400}),setup=fake([{data:[f],has_more:false}]);setup.deps.now=()=>new Date();setup.deps.db.rpc=rpc;
  expect((await sql('select collection_enabled from console_settings')).rows[0].collection_enabled).toBe(false);expect((await sql('select enabled from console_refund_settings')).rows[0].enabled).toBe(false);
  await recordStripeRefundFacts(setup.deps,{...order,id},'ch_fixture','evt_isolated',100);
  const rows=(await sql('select id,amount_minor,currency,status,extract(epoch from occurred_at)::bigint created from console_refunds where order_id=$1',[id])).rows;
  expect(rows).toEqual([{id:f.id,amount_minor:100,currency:'JPY',status:'succeeded',created:f.created}]);
  expect((await sql('select * from console_refund_periods')).rows).toEqual([]);
 });
 it('persists retry gaps, resolves them on successful replay, and keeps duplicate identities unique',async()=>{
  const id=randomUUID();await sql("insert into orders(id,owner_id,package_id,idempotency_key,credits,amount_minor,currency,status) values($1,$2,(select id from credit_packages limit 1),$3,10,1000,'JPY','paid')",[id,owner,randomUUID()]);
  const f=refund('re_retry',{created:Math.floor(Date.now()/1000)-86400}),setup=fake();setup.deps.now=()=>new Date();setup.deps.db.rpc=rpc;setup.listRefunds.mockRejectedValueOnce(new Error('offline'));
  await expect(recordStripeRefundFacts(setup.deps,{...order,id},'ch_fixture','evt_retry',100)).rejects.toThrow('SERVICE_UNAVAILABLE');
  expect((await sql('select reason,resolved_at from console_refund_gaps where order_id=$1',[id])).rows).toEqual([{reason:'list_failed',resolved_at:null}]);
  setup.listRefunds.mockResolvedValue({data:[f],has_more:false});await recordStripeRefundFacts(setup.deps,{...order,id},'ch_fixture','evt_retry',100);await recordStripeRefundFacts(setup.deps,{...order,id},'ch_fixture','evt_retry',100);
  expect((await sql('select resolved_at is not null resolved from console_refund_gaps where order_id=$1',[id])).rows[0].resolved).toBe(true);expect((await sql('select count(*)::int n from console_refunds where order_id=$1',[id])).rows[0].n).toBe(1);
 });
 it('allows requires_action/pending transitions but never downgrades a terminal actual refund',async()=>{
  const id=randomUUID();await sql("insert into orders(id,owner_id,package_id,idempotency_key,credits,amount_minor,currency,status,refunded_minor) values($1,$2,(select id from credit_packages limit 1),$3,10,1000,'JPY','partially_refunded',100)",[id,owner,randomUUID()]);
  const f=refund('re_status',{created:Math.floor(Date.now()/1000)-3600,status:'requires_action'}),setup=fake();setup.deps.now=()=>new Date();setup.deps.db.rpc=rpc;
  for(const status of ['requires_action','pending','requires_action','succeeded']){
   setup.listRefunds.mockResolvedValue({data:[{...f,status}],has_more:false});
   await recordStripeRefundFacts(setup.deps,{...order,id},'ch_fixture','evt_status',100);
   expect((await sql('select status from console_refunds where id=$1',[f.id])).rows[0].status).toBe(status);
  }
  setup.listRefunds.mockResolvedValue({data:[{...f,status:'pending'}],has_more:false});
  await expect(recordStripeRefundFacts(setup.deps,{...order,id},'ch_fixture','evt_status',100)).rejects.toThrow('SERVICE_UNAVAILABLE');
  expect((await sql('select status from console_refunds where id=$1',[f.id])).rows[0].status).toBe('succeeded');
  await expect(sql("update console_refunds set status='requires_action' where id=$1",[f.id])).rejects.toThrow('IMMUTABLE_REFUND');
 });
 it('marks unsettled cumulative refund differences in snapshot quality and clears them after success',async()=>{
  await pg.exec("update console_settings set environment='live'");const id=randomUUID();
  await sql("insert into orders(id,owner_id,package_id,idempotency_key,credits,amount_minor,currency,status,refunded_minor) values($1,$2,(select id from credit_packages limit 1),$3,10,1000,'JPY','partially_refunded',100)",[id,owner,randomUUID()]);
  const f=refund('re_quality',{created:Math.floor(Date.now()/1000)-60,status:'requires_action'}),setup=fake([{data:[f],has_more:false}]);setup.deps.now=()=>new Date();setup.deps.db.rpc=rpc;
  await recordStripeRefundFacts(setup.deps,{...order,id},'ch_fixture','evt_quality',100);
  const q={start:new Date(Date.now()-86400000).toISOString(),end:new Date(Date.now()+60_000).toISOString(),timezone:'UTC',bucket:'day',environment:'live',internal:'exclude',cohort:'all'};
  let dataset=await rpc<Row>('console_analytics_dataset',{q});expect(dataset.quality.finance_gaps).toBe(1);expect(dataset.refunds[0].status).toBe('requires_action');
  setup.listRefunds.mockResolvedValue({data:[{...f,status:'succeeded'}],has_more:false});await recordStripeRefundFacts(setup.deps,{...order,id},'ch_fixture','evt_quality',100);
  dataset=await rpc<Row>('console_analytics_dataset',{q});expect(dataset.quality.finance_gaps).toBe(0);
 });
 it('replays genuinely signed paid/refund webhooks after collection failures without duplicate credits',async()=>{
  const {default:RealStripe}=await vi.importActual<typeof import('stripe')>('stripe');
  const stripe=new RealStripe('sk_test_synthetic_no_network'),secret='whsec_synthetic_fixture';
  const id=randomUUID(),pi=`pi_${randomUUID()}`,chargeId=`ch_${randomUUID()}`,sessionId=`cs_${randomUUID()}`;
  await sql("insert into orders(id,owner_id,package_id,idempotency_key,credits,amount_minor,currency) values($1,$2,(select id from credit_packages limit 1),$3,10,1000,'JPY')",[id,owner,randomUUID()]);
  await rpc('app_attach_checkout',{p_order_id:id,p_session_id:sessionId,p_checkout_url:'https://checkout.stripe.com/test'});
  const before=Number((await sql('select available from credit_accounts where owner_id=$1',[owner])).rows[0].available);
  const session={id:sessionId,mode:'payment',payment_status:'paid',currency:'jpy',amount_total:1000,payment_intent:pi,metadata:{order_id:id,user_id:owner}},charge={id:chargeId,payment_intent:pi,amount:1000,currency:'jpy',amount_refunded:0,disputed:false};
  let rows:Row[]=[],listingFails=true;
  const payments:Payments={
   async createCheckout(){throw new Error('unused');},
   verifyEvent(raw,signature){try{return stripe.webhooks.constructEvent(raw,signature,secret) as unknown as Row;}catch{throw new ApiError('INVALID_SIGNATURE',400);}},
   async retrieveSession(){return session;},async retrievePaymentIntent(){return {id:pi,status:'succeeded',latest_charge:chargeId};},async retrieveCharge(){return charge;},
   async listRefunds(){if(listingFails)throw new Error('synthetic unavailable');return {data:rows,has_more:false};},
  };
  const db={rpc,async one(table:string,filters:Row){const entries=Object.entries(filters);return (await sql(`select * from ${table} where ${entries.map(([k],i)=>`${k}=$${i+1}`).join(' and ')}`,entries.map(([,v])=>v))).rows[0]||null;}} as unknown as Database;
  const route=createRouter({db,payments,now:()=>new Date(),fetch,storage:{} as Dependencies['storage']});
  async function signed(eventId:string,type:string,object:Row,tamper=false){const body=JSON.stringify({id:eventId,type,object:'event',data:{object}}),signature=stripe.webhooks.generateTestHeaderString({payload:body,secret});return route(new Request('http://localhost/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':signature},body:tamper?body+' ':body}));}
  const paidEvent=`evt_${randomUUID()}`;
  expect((await signed(paidEvent,'checkout.session.completed',{id:sessionId})).status).toBe(503);
  expect((await sql('select available from credit_accounts where owner_id=$1',[owner])).rows[0].available).toBe(before+10);
  expect((await sql('select resolved_at from console_refund_gaps where order_id=$1 and event_id=$2',[id,paidEvent])).rows[0].resolved_at).toBeNull();
  listingFails=false;expect((await signed(paidEvent,'checkout.session.completed',{id:sessionId})).status).toBe(200);
  expect((await sql('select available from credit_accounts where owner_id=$1',[owner])).rows[0].available).toBe(before+10);
  expect((await sql("select count(*)::int n from credit_ledger where reference_id=$1 and kind='purchase'",[id])).rows[0].n).toBe(1);
  expect((await sql('select resolved_at is not null resolved from console_refund_gaps where order_id=$1 and event_id=$2',[id,paidEvent])).rows[0].resolved).toBe(true);
  charge.amount_refunded=100;const providerRefund=refund(`re_${randomUUID()}`,{charge:chargeId,created:Math.floor(Date.now()/1000)-60,status:'requires_action'});
  for(const status of ['requires_action','pending','succeeded']){
   rows=[{...providerRefund,status}];expect((await signed(`evt_${randomUUID()}`,status==='requires_action'?'refund.created':'refund.updated',rows[0])).status).toBe(200);
   expect((await sql('select status from console_refunds where id=$1',[providerRefund.id])).rows[0].status).toBe(status);
  }
  expect((await sql("select count(*)::int n from credit_ledger where reference_id=$1 and kind='revoke'",[id])).rows[0].n).toBe(1);
  expect((await sql('select available from credit_accounts where owner_id=$1',[owner])).rows[0].available).toBe(before+9);
  const failedEvent=`evt_${randomUUID()}`;rows=[{...providerRefund,currency:'usd'}];
  expect((await signed(failedEvent,'refund.updated',providerRefund)).status).toBe(503);
  expect((await sql('select reason,resolved_at from console_refund_gaps where order_id=$1 and event_id=$2',[id,failedEvent])).rows).toEqual([{reason:'invalid_payload',resolved_at:null}]);
  rows=[{...providerRefund,status:'succeeded'}];expect((await signed(failedEvent,'refund.updated',providerRefund)).status).toBe(200);
  expect((await signed(paidEvent,'checkout.session.completed',{id:sessionId},true)).status).toBe(400);
  expect((await sql("select count(*)::int n from credit_ledger where reference_id=$1 and kind='purchase'",[id])).rows[0].n).toBe(1);
 });
});
