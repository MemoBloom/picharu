import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { AnalyticsDataset } from '../apps/web/src/server/analytics/types';
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
let pg:PGlite;
async function sql(q:string,args:unknown[]=[]){return pg.query<any>(q,args);}
async function rpc(name:string,args:Record<string,unknown>){const e=Object.entries(args);return(await sql(`select ${name}(${e.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) value`,e.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0]?.value;}
function query(extra:Record<string,unknown>={}){return {start:new Date(Date.now()-7*86400000).toISOString(),end:new Date().toISOString(),timezone:'Asia/Tokyo',bucket:'day',environment:'test',internal:'exclude',cohort:'all',...extra};}
async function report(q=query(),u=owner){return rpc('app_console_create_report',{p_user_id:u,p_query:q,p_request_id:randomUUID()});}
async function read(id:string,u=owner,action='analytics_read'){return rpc('app_console_read_report',{p_user_id:u,p_report_id:id,p_request_id:randomUUID(),p_action:action});}
async function grant(u=owner,role='analyst'){await sql('insert into console_roles(user_id,role,reason) values($1,$2,\'synthetic test\')',[u,role]);}
async function job(user=owner,env='test',created='now()-interval \'2 days\''){
 await sql('update console_settings set environment=$1',[env]);const id=randomUUID();
 await sql(`insert into edit_jobs(id,owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved,created_at) values($1,$2,'remove_person',$3,$4,'[]',$5,3,${created})`,[id,user,randomUUID(),'a'.repeat(64),JSON.stringify({model_profile:{provider:'fixture',model_id:'model1',adapter_version:'v1'},prompt_id:'remove',prompt_version:1,tool_version:2,final_prompt:'NEVER_EXPOSE_PROMPT'})]);return id;
}
async function order(user=owner){const id=randomUUID();await sql(`insert into orders(id,owner_id,package_id,idempotency_key,credits,amount_minor,currency,status,paid_at,created_at) values($1,$2,(select id from credit_packages limit 1),$3,10,1000,'JPY','paid',now()-interval '1 day',now()-interval '2 days')`,[id,user,randomUUID()]);return id;}
async function refunds(id:string,rows:unknown[],event='evt_test'){return rpc('app_console_record_refunds',{p_order_id:id,p_refunds:rows,p_event_id:event});}
function refund(id='re_test',extra:Record<string,unknown>={}){return {id,occurred_at:new Date(Date.now()-3600000).toISOString(),amount_minor:100,currency:'JPY',status:'succeeded',...extra};}
beforeAll(async()=>{pg=new PGlite();await pg.exec(`create schema auth;create table auth.users(id uuid primary key,email text);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);for(const f of ['202610190001_web_backend.sql','202610200400_worker.sql','202610210100_console_foundation.sql','202610210200_personal_console.sql','202610210300_admin_analytics.sql'])await pg.exec(await readFile(`supabase/migrations/${f}`,'utf8'));});
afterAll(async()=>{await pg.close();});
beforeEach(async()=>{await pg.exec('truncate auth.users,console_audit,console_roles,console_user_tags,console_collection_periods,console_refund_periods,console_refunds,console_refund_gaps,console_analytics_reports,credit_packages cascade');await pg.exec("update console_refund_settings set enabled=false,coverage_start=null;update console_settings set collection_enabled=false,environment='test'");await sql('insert into auth.users(id,email) values($1,\'alice@example.invalid\'),($2,\'other@example.invalid\')',[owner,other]);await pg.exec("insert into credit_packages(package_id,credits,amount_minor,currency) values('test',10,1000,'JPY')");});
describe('stage 3 administrator snapshot database',()=>{
 it('denies ordinary users, rejects malformed and oversized windows, and audits authorized reads',async()=>{
  await expect(report()).rejects.toThrow('FORBIDDEN');await grant();
  for(const patch of [{end:'invalid'},{start:'2020-01-01T00:00:00Z'},{timezone:'not/a-zone'},{internal:'ALL'},{bad:'injected'},{tool_version:0}])await expect(report(query(patch))).rejects.toThrow('INVALID_REQUEST');
  const r=await report();expect(r.dataset.users).toHaveLength(2);expect(r.dataset.users[0].email_masked).toBe('a***@example.invalid');expect(new Date(r.expires_at).getTime()-new Date(r.dataset.as_of).getTime()).toBe(900000);
  await read(r.report_id);expect((await sql("select count(*)::int n from console_audit where action='analytics_read'")).rows[0].n).toBe(2);
 });
 it('freezes data/as_of across pages and rejects cross-admin, expiry and current role revocation',async()=>{
  await grant();await grant(other);const j=await job();const r=await report();await job();expect((await read(r.report_id)).dataset).toEqual(r.dataset);expect(r.dataset.jobs.map((x:any)=>x.id)).toEqual([j]);
  await expect(read(r.report_id,other)).rejects.toThrow('NOT_FOUND');await sql('update console_roles set revoked_at=now() where user_id=$1',[owner]);await expect(read(r.report_id)).rejects.toThrow('FORBIDDEN');await sql('update console_roles set revoked_at=null where user_id=$1',[owner]);await sql("update console_analytics_reports set expires_at=now()-interval '1 second' where id=$1",[r.report_id]);await expect(read(r.report_id)).rejects.toThrow('NOT_FOUND');
 });
 it('redacts finance on create and on permission loss while retaining product payment facts',async()=>{
  await grant();await grant(owner,'finance');const j=await job();const o=await order();await refunds(o,[refund()]);
  await sql(`insert into job_attempts(job_id,provider,model_id,adapter_version,provider_request_key,estimated_cost,actual_cost,evidence) values($1,'fixture','model1','v1','SECRET_PROVIDER_ID','{"amount_minor":15,"currency":"USD"}','{"amount_minor":12,"currency":"USD","evidence":"invoice","secret":"private"}','{"private":"never"}')`,[j]);
  const r=await report();expect(r.dataset.orders[0].amount_minor).toBe(1000);expect(r.dataset.refunds).toHaveLength(1);expect(r.dataset.attempts[0].actual_cost).toEqual({amount_minor:12,currency:'USD',evidence:'invoice'});
  expect(JSON.stringify(r.dataset)).not.toMatch(/NEVER_EXPOSE_PROMPT|SECRET_PROVIDER_ID|storage_key|private/);
  await sql("update console_roles set revoked_at=now() where user_id=$1 and role='finance'",[owner]);const d=(await read(r.report_id)).dataset;expect(d.permissions).toEqual(['analytics:read']);expect(d.orders[0]).toMatchObject({amount_minor:null,currency:null,refunded_minor:null,reversal_shortfall:null});expect(d.orders[0].paid_at).not.toBeNull();expect(d.refunds).toEqual([]);expect(d.attempts[0].actual_cost).toBeNull();await expect(read(r.report_id,owner,'finance_read')).rejects.toThrow('FORBIDDEN');
 });
 it('separates environment and frozen internal provenance with zero-use users and history summaries',async()=>{
  await grant();const t=await job();const l=await job(owner,'live');await sql('insert into console_user_tags(user_id,internal_account) values($1,true)',[owner]);const i=await job();
  const d:AnalyticsDataset=(await report()).dataset;expect(d.jobs.map(x=>x.id)).toEqual([t]);expect(d.users.find(x=>x.id===owner)?.lifetime_jobs).toBe(1);expect(d.users.find(x=>x.id===other)?.lifetime_jobs).toBe(0);
  expect((await report(query({internal:'only'}))).dataset.jobs.map((x:any)=>x.id)).toEqual([i]);expect((await report(query({environment:'live',internal:'include'}))).dataset.jobs.map((x:any)=>x.id)).toEqual([l]);
 });
 it('captures full historical first-success/payment and follow-up events without leaking snapshot content',async()=>{
  await grant();const old=await job(owner,'test',"now()-interval '80 days'");const im=randomUUID();await sql(`insert into images(id,owner_id,status,source_kind,source_job_id,storage_key,preview_key,sha256,mime_type,bytes,width,height,expires_at) values($1,$2,'ready','generated',$3,'SECRET_R2_KEY','SECRET_PREVIEW',$4,'image/png',10,2,2,now()+interval '7 days')`,[im,owner,old,'a'.repeat(64)]);await sql("update edit_jobs set status='completed',result_image_id=$2,completed_at=now()-interval '79 days' where id=$1",[old,im]);await order();const d=(await report()).dataset;expect(new Date(d.users.find((u:any)=>u.id===owner).first_completed_at).getTime()).toBeLessThan(Date.now()-78*86400000);expect(d.jobs).toHaveLength(0);expect(JSON.stringify(d)).not.toMatch(/SECRET_R2_KEY|SECRET_PREVIEW|NEVER_EXPOSE_PROMPT/);
 });
 it('flags unknown historical provenance instead of asserting complete first-use cohorts',async()=>{
  await grant();await job(owner,'unclassified',"now()-interval '80 days'");await job();const d=(await report()).dataset;expect(d.quality.history_complete).toBe(false);expect(d.users.find((u:any)=>u.id===owner).history_complete).toBe(false);expect(d.users.find((u:any)=>u.id===other).history_complete).toBe(true);
 });
 it('loads prior-period, delayed completion, old ledger references and cohort follow-up facts',async()=>{
  await grant();const reference=await job(owner,'test',"now()-interval '100 days'");const previous=await job(owner,'test',"now()-interval '12 days'");const followup=await job(owner,'test',"now()-interval '2 days'");
  await sql("insert into credit_ledger(owner_id,business_key,kind,available_delta,reserved_delta,reference_id,created_at) values($1,'delayed-consume','consume',0,-3,$2,now()-interval '1 day')",[owner,reference]);
  const d=(await report(query({start:new Date(Date.now()-10*86400000).toISOString(),end:new Date(Date.now()-5*86400000).toISOString()}))).dataset;expect(d.jobs.map((j:any)=>j.id)).toEqual(expect.arrayContaining([reference,previous,followup]));expect(d.ledger).toHaveLength(1);expect(d.users.find((u:any)=>u.id===owner).lifetime_jobs).toBe(3);
 });
 it('retains latest/lifetime use outside a historical window and late received browser observations',async()=>{
  await grant();await job(owner,'test',"now()-interval '60 days'");const latest=await job(owner,'test',"now()-interval '1 day'");
  const page=randomUUID(),eid=randomUUID();await sql(`insert into analytics_events(event_id,name,owner_id,environment,internal_account,source,business_key,tool_id,page_view_id,exposure_id,device,occurred_at,received_at) values($1,'tool_exposed',$2,'test',false,'browser_observation','late','remove_person',$3,$4,'desktop',now()-interval '22 days',now()-interval '15 days')`,[eid,owner,page,randomUUID()]);
  const d=(await report(query({start:new Date(Date.now()-20*86400000).toISOString(),end:new Date(Date.now()-19*86400000).toISOString()}))).dataset;
  expect(d.users.find((u:any)=>u.id===owner)).toMatchObject({lifetime_jobs:2,last_30d_jobs:1});expect(new Date(d.users.find((u:any)=>u.id===owner).last_generated_at).getTime()).toBeGreaterThan(Date.now()-2*86400000);expect(d.events.map((e:any)=>e.event_id)).toContain(eid);expect(d.jobs.map((j:any)=>j.id)).toContain(latest);
 });
 it('freezes a bounded, unique catalog with display/open state in the report',async()=>{
  await grant();const catalog=[{tool_id:'remove_person',name:'Frozen tool',category:'edit',available:true}];
  const r=await rpc('app_console_create_report',{p_user_id:owner,p_query:query(),p_request_id:randomUUID(),p_catalog:catalog});catalog[0].name='Later renamed';catalog[0].available=false;
  expect((await read(r.report_id)).dataset.catalog).toEqual([{tool_id:'remove_person',name:'Frozen tool',category:'edit',available:true}]);
  for(const c of [null,{},Array.from({length:501},()=>catalog[0]),[catalog[0],catalog[0]],[{...catalog[0],secret:'injected'}],[{...catalog[0],available:'true'}],[{...catalog[0],name:''}],[{...catalog[0],tool_id:'INVALID TOOL'}]]){
   await expect(rpc('app_console_create_report',{p_user_id:owner,p_query:query(),p_request_id:randomUUID(),p_catalog:c})).rejects.toThrow('INVALID_REQUEST');
  }
 });
 it('makes report tables and all new functions unavailable to browser SQL roles',async()=>{
  for(const role of ['anon','authenticated']){await pg.exec(`set role ${role}`);try{for(const t of ['console_refunds','console_refund_periods','console_refund_gaps','console_analytics_reports','console_refund_settings'])await expect(sql(`select * from ${t}`)).rejects.toThrow('permission denied');await expect(report()).rejects.toThrow('permission denied');await expect(rpc('app_console_note_refund_gap',{p_order_id:randomUUID(),p_event_id:'evt',p_reason:'list_failed'})).rejects.toThrow('permission denied');}finally{await pg.exec('reset role');}}
 });
 it('fails explicitly above 20000 source rows instead of returning plausible truncated totals',async()=>{
  await grant();await pg.exec(`insert into edit_jobs(owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved) select '${owner}','remove_person',md5(g::text),repeat('a',64),'[]','{}',3 from generate_series(1,20001) g`);await expect(report()).rejects.toThrow('QUERY_TOO_LARGE');expect((await sql('select count(*)::int n from console_analytics_reports')).rows[0].n).toBe(0);
 });
});
describe('refund event facts and explicit collection coverage',()=>{
 it('keeps refunded amounts at occurrence time, idempotent IDs, immutable amounts and cross-order isolation',async()=>{
  await grant(owner,'finance');const o=await order(),o2=await order();const r=refund('re_cross',{occurred_at:new Date(Date.now()-10*86400000).toISOString()});expect(await refunds(o,[r])).toEqual({recorded:1});expect(await refunds(o,[r])).toEqual({recorded:0});await expect(refunds(o,[{...r,amount_minor:101}])).rejects.toThrow('IDEMPOTENCY_CONFLICT');await expect(refunds(o2,[r])).rejects.toThrow('IDEMPOTENCY_CONFLICT');await expect(refunds(o,[{...r,id:'re_bad',currency:'USD'}])).rejects.toThrow('INVALID_REQUEST');expect(new Date((await report()).dataset.refunds[0].occurred_at).getTime()).toBe(new Date(r.occurred_at).getTime());
 });
 it('only transitions pending refunds to terminal states and rolls invalid batches back',async()=>{
  const o=await order();const r=refund('re_pending',{status:'pending'});await refunds(o,[r]);await refunds(o,[{...r,status:'succeeded'}]);await expect(refunds(o,[{...r,status:'failed'}])).rejects.toThrow('IDEMPOTENCY_CONFLICT');await expect(refunds(o,[refund('re_big',{amount_minor:1001})])).rejects.toThrow('INVALID_REQUEST');expect((await sql('select id from console_refunds')).rows).toEqual([{id:'re_pending'}]);
 });
 it('records and resolves durable collection gaps and exposes cumulative mismatches without inventing daily refunds',async()=>{
  await grant(owner,'finance');const o=await order();await rpc('app_console_note_refund_gap',{p_order_id:o,p_event_id:'evt_missed',p_reason:'list_failed'});await rpc('app_console_note_refund_gap',{p_order_id:o,p_event_id:'evt_missed',p_reason:'persistence_failed'});expect((await report()).dataset.quality.finance_gaps).toBe(1);await refunds(o,[refund()],'evt_missed');expect((await report()).dataset.quality.finance_gaps).toBe(1);await sql('update orders set refunded_minor=200 where id=$1',[o]);const d=(await report()).dataset;expect(d.quality.finance_gaps).toBe(1);expect(d.refunds).toHaveLength(1);await sql('update orders set refunded_minor=100 where id=$1',[o]);expect((await report()).dataset.quality.finance_gaps).toBe(0);await expect(rpc('app_console_note_refund_gap',{p_order_id:o,p_event_id:'evt',p_reason:'secret full payload'})).rejects.toThrow('INVALID_REQUEST');
 });
 it('prevents direct mutation/deletion of refund chronology and audits service facts',async()=>{
  const o=await order();await refunds(o,[refund()]);await expect(sql("update console_refunds set amount_minor=101")).rejects.toThrow('IMMUTABLE_REFUND');await expect(sql('delete from console_refunds')).rejects.toThrow('APPEND_ONLY');expect((await sql("select count(*)::int n from console_audit where action='refund_fact'")).rows[0].n).toBe(1);
 });
 it('starts off, preserves disable/re-enable gaps and disables refund coverage on environment change',async()=>{
  await grant();expect((await report()).dataset.quality.refund_coverage_start).toBeNull();await pg.exec('update console_refund_settings set enabled=true');const first=(await report()).dataset;expect(first.refund_periods).toHaveLength(1);expect(first.quality.refund_coverage_start).not.toBeNull();await pg.exec('update console_refund_settings set enabled=false;update console_refund_settings set enabled=true');const d=(await report()).dataset;expect(d.refund_periods).toHaveLength(2);expect(d.refund_periods[0].ended_at).not.toBeNull();await pg.exec("update console_settings set environment='live'");expect((await sql('select enabled from console_refund_settings')).rows[0].enabled).toBe(false);
 });
});
