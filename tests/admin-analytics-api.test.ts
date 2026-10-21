import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AnalyticsReportResponse, ConsoleTelemetryConfig } from '@picjp/contracts';
import { createRouter } from '../apps/web/src/server/router';
import { ApiError } from '../apps/web/src/server/errors';
import { dbError } from '../apps/web/src/server/supabase';
import { buildAnalyticsReport } from '../apps/web/src/server/analytics/engine';
import type { Database, Dependencies, Row } from '../apps/web/src/server/ports';
const admin='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const DAY=86400000;
let pg:PGlite,route:ReturnType<typeof createRouter>,lastSnapshot:Row|undefined;
const profile={profile_id:'fixture',provider:'fixture',model_id:'fixture',adapter_version:'1',verified_tool_ids:['remove_person'],max_images:1,roles:['primary'],qualities:['standard'],aspect_ratios:['1:1'],credits_standard:3,credits_high:5,pricing_version:'fixture'};
async function sql(q:string,args:unknown[]=[]){return pg.query<Row>(q,args);}
async function rawRpc(name:string,args:Row):Promise<any>{const e=Object.entries(args);return(await sql(`select public.${name}(${e.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) value`,e.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0]?.value;}
const db:Database={
 async authenticate(token){if(![admin,other].includes(token))throw new ApiError('UNAUTHORIZED',401);return{id:token};},
 async rpc<T>(name:string,args:Row):Promise<T>{try{const result=await rawRpc(name,args);if(name==='app_console_create_report'||name==='app_console_read_report')lastSnapshot=result;return result;}catch(error){dbError({message:(error as Error).message});throw error;}},
 async one(table,filters){const e=Object.entries(filters);return(await sql(`select * from ${table} where ${e.map(([k],i)=>`${k}=$${i+1}`).join(' and ')}`,e.map(([,v])=>v))).rows[0]??null;},
 async list(){return[];},async packages(){return[];},async findJob(){return null;},async markCleanup(){},
};
async function call(path:string,method='GET',body?:unknown,user=admin){return route(new Request(`http://localhost${path}`,{method,headers:{...(user?{Authorization:`Bearer ${user}`} :{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})}));}
function query(patch:Row={}){return{start:new Date(Date.now()-7*DAY).toISOString(),end:new Date(Date.now()-1000).toISOString(),timezone:'Asia/Tokyo',bucket:'day',environment:'test',internal:'exclude',cohort:'all',...patch};}
async function create(q=query(),user=admin){const res=await call('/api/admin/analytics/reports','POST',q,user);if(res.status===503&&lastSnapshot){const check=AnalyticsReportResponse.safeParse({report_id:lastSnapshot.report_id,expires_at:lastSnapshot.expires_at,report:buildAnalyticsReport(lastSnapshot.dataset),pagination:{section:'overview',total:0,offset:0,limit:25}});if(!check.success)console.error('analytics DTO paths',check.error.issues.map(i=>({path:i.path,code:i.code})));}expect(res.status).toBe(201);return AnalyticsReportResponse.parse(await res.json());}
async function grant(user=admin,role='analyst'){await sql('insert into console_roles(user_id,role,reason) values($1,$2,\'synthetic API verification\')',[user,role]);}
async function job(tool='remove_person',owner=admin,days=2,status='queued'){
 const id=randomUUID();await sql(`insert into edit_jobs(id,owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved,created_at) values($1,$2,$3,$4,$5,'[]',$6,3,now()-make_interval(days=>$7))`,[id,owner,tool,randomUUID(),'a'.repeat(64),JSON.stringify({tool_version:1,prompt_id:'fixture',prompt_version:1,model_profile:profile,final_prompt:'PRIVATE_FULL_PROMPT'}),days]);
 if(status==='completed'){const im=randomUUID();await sql(`insert into images(id,owner_id,status,source_kind,source_job_id,storage_key,preview_key,sha256,mime_type,bytes,width,height,expires_at) values($1,$2,'ready','generated',$3,$4,$5,$6,'image/png',10,2,2,now()+interval '7 days')`,[im,owner,id,`PRIVATE_R2/${im}`,`PRIVATE_PREVIEW/${im}`,'a'.repeat(64)]);await sql("update edit_jobs set status='completed',stage='done',result_image_id=$2,completed_at=created_at+interval '1 minute' where id=$1",[id,im]);}
 if(status==='failed')await sql("update edit_jobs set status='failed',stage='done',error_code='PROVIDER_FAILED',completed_at=created_at+interval '1 minute' where id=$1",[id]);
 return id;
}
async function order(){const id=randomUUID();await sql(`insert into orders(id,owner_id,package_id,idempotency_key,credits,amount_minor,currency,status,paid_at,created_at,stripe_session_id) values($1,$2,(select id from credit_packages limit 1),$3,10,1000,'JPY','paid',now()-interval '1 day',now()-interval '2 days','PRIVATE_STRIPE_ID')`,[id,admin,randomUUID()]);return id;}
beforeAll(async()=>{pg=new PGlite();await pg.exec(`create schema auth;create table auth.users(id uuid primary key,email text);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);for(const f of ['202610190001_web_backend.sql','202610200400_worker.sql','202610210100_console_foundation.sql','202610210200_personal_console.sql','202610210300_admin_analytics.sql','202610210400_console_telemetry.sql'])await pg.exec(await readFile(`supabase/migrations/${f}`,'utf8'));});
afterAll(async()=>{vi.unstubAllEnvs();await pg.close();});
beforeEach(async()=>{
 vi.stubEnv('GENERATION_ENABLED','true');vi.stubEnv('MODEL_PROFILES_JSON',JSON.stringify([profile]));lastSnapshot=undefined;
 await pg.exec('truncate auth.users,console_audit,console_collection_periods,console_refund_periods,console_analytics_reports,credit_packages,rate_buckets cascade');await pg.exec("update console_refund_settings set enabled=false,coverage_start=null;update console_settings set environment='test',collection_enabled=false");await sql("insert into auth.users(id,email) values($1,'alice@example.invalid'),($2,'other@example.invalid')",[admin,other]);await pg.exec("update profiles set created_at=now()-interval '40 days'");await pg.exec("insert into credit_packages(package_id,credits,amount_minor,currency) values('fixture',10,1000,'JPY')");
 const deps:Dependencies={db,now:()=>new Date(),fetch,storage:{async signPut(){throw Error('not used');},async read(){throw Error('not used');},async write(){throw Error('not used');},async remove(){throw Error('not used');},async signGet(){throw Error('not used');}},payments:{async createCheckout(){throw Error('not used');},verifyEvent(){throw Error('not used');},async retrieveSession(){throw Error('not used');},async retrievePaymentIntent(){throw Error('not used');},async retrieveCharge(){throw Error('not used');}}};route=createRouter(deps);
});
describe('stage 3 actual HTTP → RPC → SQL → engine → strict DTO',()=>{
 it('requires authentication/current role and exposes safe collection config to signed-in users',async()=>{
  expect((await call('/api/admin/analytics/reports','POST',query(),'')).status).toBe(401);expect((await call('/api/admin/analytics/reports','POST',query())).status).toBe(403);
  const config=await call('/api/analytics/config');expect(config.status).toBe(200);expect(ConsoleTelemetryConfig.parse(await config.json())).toEqual({environment:'test',collection_enabled:false});expect(config.headers.get('cache-control')).toBe('no-store');
 });
 it('returns all current and comparison metrics with safe empty/zero-user semantics',async()=>{
  await grant();const r=await create(query({environment:'live'}));expect(r.report.metrics.map(m=>m.id)).toEqual(Array.from({length:24},(_,i)=>`M${String(i+1).padStart(2,'0')}`));expect(r.report.previous_metrics).toHaveLength(24);expect(r.report.metrics.find(m=>m.id==='M02')).toMatchObject({value:0});expect(r.report.metrics.find(m=>m.id==='M04')).toMatchObject({value:null,status:'no_sample'});expect(r.report.users).toEqual([]);expect(r.report.finance.status).toBe('forbidden');
 });
 it('freezes data, catalog, comparison/as_of across all eight sections and paginated reads',async()=>{
  await grant(admin,'finance');await job();await job('remove_person',other);const first=await create();await job();vi.stubEnv('GENERATION_ENABLED','false');
  for(const section of ['overview','users','tools','funnel','retention','versions','finance','data-quality']){const res=await call(`/api/admin/analytics/reports/${first.report_id}?section=${section}&limit=1`);expect(res.status).toBe(200);const r=AnalyticsReportResponse.parse(await res.json());expect(r.report.meta).toEqual(first.report.meta);expect(r.report.metrics).toEqual(first.report.metrics);expect(r.report.previous_metrics).toEqual(first.report.previous_metrics);expect(r.report.users.length).toBeLessThanOrEqual(1);expect(r.report.jobs.length).toBeLessThanOrEqual(1);}
  const page=await call(`/api/admin/analytics/reports/${first.report_id}?section=users&offset=1&limit=1`);expect(AnalyticsReportResponse.parse(await page.json()).pagination).toMatchObject({section:'users',offset:1,limit:1,total:2});
  const tools=AnalyticsReportResponse.parse(await(await call(`/api/admin/analytics/reports/${first.report_id}?section=tools&limit=100`)).json());expect(tools.report.tools.find(t=>t.tool_id==='remove_person')?.available).toBe(true);expect((await create()).report.metrics.find(m=>m.id==='M03')?.value).toBe(3);
 });
 it('preserves nonzero trusted facts through SQL, comparison windows and all 24 metric DTOs',async()=>{
  await grant(admin,'finance');await pg.exec("update console_settings set collection_enabled=true;insert into console_collection_periods(environment,started_at,ended_at) values('test',now()-interval '60 days',now()-interval '1 minute')");
  const completed=await job('remove_person',admin,2,'completed');await job('remove_person',other,3);await job('remove_person',admin,10,'failed');
  const image=(await sql('select result_image_id from edit_jobs where id=$1',[completed])).rows[0].result_image_id;
  await sql(`insert into analytics_events(event_id,name,owner_id,environment,internal_account,source,business_key,job_id,image_id,tool_id,page_view_id,device,occurred_at,received_at) select $1,'result_viewed',$2,'test',false,'browser_observation','view-fixture',id,result_image_id,tool_id,$3,'desktop',completed_at+interval '1 hour',completed_at+interval '1 hour' from edit_jobs where id=$4`,[randomUUID(),admin,randomUUID(),completed]);
  await sql(`insert into analytics_events(event_id,name,owner_id,environment,internal_account,source,business_key,job_id,image_id,tool_id,action_id,device,occurred_at,received_at) select $1,'download_url_issued',$2,'test',false,'server_download','save-fixture',id,result_image_id,tool_id,$3,'desktop',completed_at+interval '2 hours',completed_at+interval '2 hours' from edit_jobs where id=$4`,[randomUUID(),admin,randomUUID(),completed]);
  await sql("insert into credit_ledger(owner_id,business_key,kind,available_delta,reserved_delta,reference_id,created_at) values($1,'consumed-fixture','consume',0,-3,$2,now()-interval '2 days')",[admin,completed]);
  await sql(`insert into job_attempts(job_id,provider,model_id,adapter_version,provider_request_key,estimated_cost,actual_cost,created_at,state) values($1,'fixture','fixture','1','PRIVATE_REQUEST_KEY','{"amount_minor":20,"currency":"USD"}','{"amount_minor":12,"currency":"USD","evidence":"invoice","provider_reference":"PRIVATE_COST_REF"}',now()-interval '2 days','succeeded')`,[completed]);
  await order();const r=await create();const metric=(id:string)=>r.report.metrics.find(m=>m.id===id)!;
  expect(metric('M02').value).toBe(2);expect(metric('M03').value).toBe(2);expect(metric('M04').value).toBe(1);expect(metric('M06').value).toBe(3);expect(metric('M07')).toMatchObject({value:1,numerator:1,denominator:1});expect(metric('M12')).toMatchObject({value:1,numerator:1,denominator:1,status:'ready'});
  expect(r.report.previous_metrics.find(m=>m.id==='M03')?.value).toBe(1);expect(r.report.previous_metrics.find(m=>m.id==='M07')).toMatchObject({value:0,numerator:0,denominator:1});expect(r.report.finance.currencies).toEqual(expect.arrayContaining([expect.objectContaining({currency:'USD',known_cost_minor:12}),expect.objectContaining({currency:'JPY',paid_minor:1000})]));expect(r.report.finance.costs[0].evidence).toBe('invoice');expect(JSON.stringify(r)).not.toMatch(/PRIVATE_REQUEST_KEY|PRIVATE_COST_REF/);expect(image).toMatch(/^[a-f0-9-]+$/);
 });
 it('masks identities and excludes private snapshots/storage/provider/payment identifiers from JSON',async()=>{
  await grant(admin,'finance');await job('remove_person',admin,2,'completed');await order();const r=await create();const body=JSON.stringify(r);expect(body).toContain('a***@example.invalid');expect(body).not.toMatch(/alice@example|PRIVATE_FULL_PROMPT|PRIVATE_R2|PRIVATE_PREVIEW|PRIVATE_STRIPE_ID|final_prompt|storage_key|provider_request_key/);expect(r.report.metrics.find(m=>m.id==='M07')).toMatchObject({value:1,numerator:1,denominator:1});
 });
 it('rechecks role removal, report ownership, expiry and finance scopes on every read/export',async()=>{
  await grant();await grant(other);const r=await create();const path=`/api/admin/analytics/reports/${r.report_id}`;expect((await call(path,'GET',undefined,other)).status).toBe(404);expect((await call(`${path}?section=finance`)).status).toBe(403);expect((await call(`${path}/export?section=orders`)).status).toBe(403);
  await sql('update console_roles set revoked_at=now() where user_id=$1',[admin]);expect((await call(path)).status).toBe(403);expect((await call(`${path}/export`)).status).toBe(403);await sql('update console_roles set revoked_at=null where user_id=$1',[admin]);await sql("update console_analytics_reports set expires_at=now()-interval '1 second' where id=$1",[r.report_id]);expect((await call(path)).status).toBe(404);
 });
 it('applies finance permission to every sensitive table regardless of section and masks provider refund IDs',async()=>{
  await grant();const a=await create();for(const table of ['orders','ledger','costs','refunds'])expect((await call(`/api/admin/analytics/reports/${a.report_id}?section=users&table=${table}`)).status).toBe(403);expect((await call(`/api/admin/analytics/reports/${a.report_id}/export?section=ledger`)).status).toBe(403);
  await grant(admin,'finance');const oid=await order();await rawRpc('app_console_record_refunds',{p_order_id:oid,p_refunds:[{id:'re_PRIVATE_PROVIDER_ID',occurred_at:new Date(Date.now()-3600000).toISOString(),amount_minor:100,currency:'JPY',status:'succeeded'}],p_event_id:'evt_masked'});const r=await create();expect(r.report.finance.refunds).toHaveLength(1);expect(r.report.finance.refunds[0].id).toMatch(/^refund_[a-f0-9]{24}$/);expect(JSON.stringify(r)).not.toContain('re_PRIVATE_PROVIDER_ID');expect(r.report.operations.finance_gaps).toBe(1);
  const base=`/api/admin/analytics/reports/${r.report_id}`;for(const table of ['orders','ledger','costs','refunds']){const res=await call(`${base}?section=users&table=${table}&limit=1`);expect(res.status).toBe(200);expect(AnalyticsReportResponse.parse(await res.json()).pagination.table).toBe(table);}
 });
 it('redacts cached financial amounts immediately when finance permission is revoked',async()=>{
  await grant();await grant(admin,'finance');await order();const r=await create();expect(r.report.finance.orders[0].amount_minor).toBe(1000);await sql("update console_roles set revoked_at=now() where user_id=$1 and role='finance'",[admin]);const res=await call(`/api/admin/analytics/reports/${r.report_id}`);expect(res.status).toBe(200);const read=AnalyticsReportResponse.parse(await res.json());expect(read.report.finance.status).toBe('forbidden');expect(read.report.finance.currencies).toEqual([]);expect(read.report.finance.orders.every(o=>o.amount_minor===null)).toBe(true);
 });
 it('rejects unknown DTO keys, invalid windows/zones, repeated GET parameters and invalid drilling',async()=>{
  await grant();for(const patch of [{start:new Date(Date.now()+DAY).toISOString()},{start:new Date(Date.now()-367*DAY).toISOString()},{timezone:'not/a-zone'},{environment:'other'},{bucket:'hour',start:new Date(Date.now()-32*DAY).toISOString()},{owner_id:other}])expect((await call('/api/admin/analytics/reports','POST',query(patch))).status).toBe(400);
  const r=await create();for(const params of ['limit=1&limit=2','offset=-1','limit=101','section=unknown','unexpected=field'])expect((await call(`/api/admin/analytics/reports/${r.report_id}?${params}`)).status).toBe(400);expect((await call(`/api/admin/analytics/reports/${r.report_id}?user_id=${randomUUID()}`)).status).toBe(404);expect((await call(`/api/admin/analytics/reports/${r.report_id}?tool_id=does_not_exist`)).status).toBe(404);
 });
 it('keeps exact filtered/drilled facts and as_of in audited CSV and neutralizes formula-like identities',async()=>{
  await grant();await sql("update auth.users set email='=formula@example.invalid' where id=$1",[admin]);const included=await job(),excluded=await job('replace_background');const r=await create(query({tool_id:'remove_person'}));const base=`/api/admin/analytics/reports/${r.report_id}`;
  const res=await call(`${base}/export?section=jobs`);expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');expect(res.headers.get('x-report-as-of')).toBe(r.report.meta.as_of);const text=await res.text();expect(text).toContain(r.report_id);expect(text).toContain(r.report.meta.as_of);expect(text).toContain(included);expect(text).not.toContain(excluded);expect(text).toContain('remove_person');
  const users=await(await call(`${base}/export?section=users&user_id=${admin}`)).text();expect(users).toContain('"\'=***@example.invalid"');expect(users).not.toContain('=formula');expect((await sql("select count(*)::int n from console_audit where action='export'")).rows[0].n).toBeGreaterThanOrEqual(2);
  const drill=AnalyticsReportResponse.parse(await(await call(`${base}?section=users&user_id=${other}`)).json());expect(drill.report.metrics.find(m=>m.id==='M03')?.value).toBe(0);
 });
});
