import { beforeAll,afterAll,beforeEach,describe,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { baselineContent } from '../apps/web/src/server/seo/content';
import { SeoOptimizationPlan,SeoObservationRequest } from '@picjp/contracts';
let db:PGlite,today:string;
const author=randomUUID(),reviewer=randomUUID(),outsider=randomUUID(),property='sc-domain:picmoko.com',path='/ja/tools/remove_person';
const rpc=async(name:string,args:unknown[])=>(await db.query<{v:any}>(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v;
const day=(offset:number)=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
function plan(){return {hypothesis:'より明確な手順で検索意図との一致を改善する。',change_summary:'タイトルと本文の説明を合わせて見直します。',target_queries:['写真から人を消す'],risk_notes:'検索結果の更新には時間がかかるため即断しない。',rollback_conditions:'機能にない約束や公開ページの不具合があれば戻す。',source_property:property,baseline_from:day(-38),baseline_to:day(-25),observation_days:14,minimum_impressions:300,is_fixture:true};}
async function ingest(date:string,clicks=2,impressions=100,fixture=true,position:number|null=10){
 const id=randomUUID();await rpc('seo_ingest_begin',[id,'gsc',property,date,'page',fixture,'{}']);
 await rpc('seo_ingest_stage',[id,0,JSON.stringify([{dimensions:{page:path,country:'JP'},measures:{clicks,impressions,position}}])]);await rpc('seo_ingest_finish',[id,1,null]);return id;
}
async function prepare(withData=true){
 if(withData)for(let i=-38;i<=-25;i++)await ingest(day(i));
 const saved=await rpc('seo_save_planned_draft',[author,JSON.stringify(baselineContent(path)!.content),null,JSON.stringify(plan())]);
 for(const [action,actor] of [['submit',author],['approve',reviewer]])await rpc('seo_transition',[actor,saved.id,action,null,randomUUID()]);
 const op=randomUUID();await rpc('seo_transition',[reviewer,saved.id,'publish',null,op]);
 // Historical timestamps exist only in this isolated fixture; production API has no clock override.
 await db.query("update seo_changes set created_at=($2::date::timestamp+interval '12 hours') at time zone 'America/Los_Angeles' where operation_id=$1",[op,day(-24)]);
 return {id:saved.id as string,op};
}
const capture=(r:{id:string;op:string},decision='keep',to=day(-10),id=randomUUID())=>rpc('seo_capture_observation',[reviewer,r.id,r.op,id,to,decision,'Observed page metrics only; do not infer causal growth.']);
beforeAll(async()=>{
 db=new PGlite();await db.exec('create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;');
 for(const file of ['20261020153000_seo.sql','20261020164700_seo_observation.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await db.query('insert into auth.users values($1),($2),($3)',[author,reviewer,outsider]);await db.query("insert into seo_members values($1,'editor'),($2,'reviewer')",[author,reviewer]);
 today=(await db.query<{v:string}>("select ((now() at time zone 'America/Los_Angeles')::date)::text v")).rows[0].v;
});
afterAll(()=>db.close());beforeEach(()=>db.exec('truncate seo_observations,seo_plans,seo_changes,seo_revisions,seo_pages,seo_metrics,seo_ingestion_batches,seo_ingestions cascade;'));
describe('immutable SEO hypotheses, retained evidence and observational reports',()=>{
 it('runs the full fixture change and freezes comparable before/after data without claiming causality',async()=>{
  const r=await prepare();for(let i=-23;i<=-10;i++)await ingest(day(i),5,100,true,8);
  const id=randomUUID(),report=await capture(r,'keep',day(-10),id);
  expect(report).toMatchObject({id,revision_id:r.id,publish_operation_id:r.op,actor_id:reviewer,report:{comparison_ready:true,intervening_publish:false,decision:'keep',delta:{clicks:42,impressions:0,ctr_points:3}}});
  expect(report.report.before.totals).toMatchObject({clicks:28,impressions:1400,position:10});expect(report.report.after.totals).toMatchObject({clicks:70,position:8});
  expect(report.report.limitations).toContain('observational_not_causal');expect(report).not.toHaveProperty('fingerprint');
  await ingest(day(-23),9,100);expect(await capture(r,'keep',day(-10),id)).toEqual(report);
  await expect(capture(r,'extend',day(-10),id)).rejects.toThrow('SEO_IDEMPOTENCY_CONFLICT');
  expect((await rpc('seo_observation_overview',[author,true])).observations).toHaveLength(1);
  expect((await rpc('seo_observation_overview',[author,false])).observations).toEqual([]);
 });
 it('keeps missing days unknown, permits an insufficient-data note and blocks a keep decision',async()=>{
  const r=await prepare(false);const report=await capture(r,'insufficient');
  expect(report.report.before).toMatchObject({ready:false,successful_days:0,totals:{clicks:null,impressions:null}});
  expect(report.report.after.missing_days).toHaveLength(14);expect(report.report.delta).toBeNull();expect(report.report.comparison_ready).toBe(false);
  await expect(capture(r)).rejects.toThrow('SEO_OBSERVATION_NOT_READY');
 });
 it('separates successful zero traffic, unknown positions and invalid metric values',async()=>{
  const empty=randomUUID();await rpc('seo_ingest_begin',[empty,'gsc',property,day(-38),'page',true,'{}']);await rpc('seo_ingest_finish',[empty,0,null]);
  expect(await rpc('seo_window_snapshot',[path,property,day(-38),day(-38),true])).toMatchObject({ready:true,totals:{impressions:0,clicks:0,position:null}});
  await ingest(day(-37),2,100,true,null);expect((await rpc('seo_window_snapshot',[path,property,day(-37),day(-37),true])).totals).toMatchObject({impressions:100,position:null,ctr:0.02});
  const invalid=randomUUID();await rpc('seo_ingest_begin',[invalid,'gsc',property,day(-36),'page',true,'{}']);await rpc('seo_ingest_stage',[invalid,0,JSON.stringify([{dimensions:{page:path,country:'JP'},measures:{clicks:1}}])]);await rpc('seo_ingest_finish',[invalid,1,null]);
  expect(await rpc('seo_window_snapshot',[path,property,day(-36),day(-36),true])).toMatchObject({ready:false,totals:{clicks:null,impressions:null}});
 });
 it('requires the full mature window and enough exposure, with explicit review delays',async()=>{
  const r=await prepare();for(let i=-23;i<=-10;i++)await ingest(day(i),0,1);
  await expect(capture(r)).rejects.toThrow('SEO_OBSERVATION_NOT_READY');
  await expect(capture(r,'keep',day(-11))).rejects.toThrow('SEO_OBSERVATION_NOT_READY');
  expect((await capture(r,'extend',day(-11))).report.after.expected_days).toBe(13);
  await expect(capture(r,'extend',day(-9))).rejects.toThrow('SEO_INVALID_OBSERVATION_WINDOW');
  await expect(capture(r,'extend',day(0))).rejects.toThrow('SEO_INVALID_OBSERVATION_WINDOW');
 });
 it('does not compare across rollback or another publication in the observation period',async()=>{
  const r=await prepare();for(let i=-23;i<=-10;i++)await ingest(day(i));
  const c=baselineContent(path)!.content;const second=await rpc('seo_save_draft',[author,JSON.stringify(c),r.id]);
  const op=randomUUID();for(const [action,actor]of [['submit',author],['approve',reviewer],['publish',reviewer]])await rpc('seo_transition',[actor,second.id,action,r.id,action==='publish'?op:randomUUID()]);
  await db.query("update seo_changes set created_at=($2::date::timestamp+interval '12 hours') at time zone 'America/Los_Angeles' where operation_id=$1",[op,day(-18)]);
  expect((await capture(r,'rollback')).report).toMatchObject({intervening_publish:true,comparison_ready:false,delta:null});
  await expect(capture(r)).rejects.toThrow('SEO_OBSERVATION_NOT_READY');
 });
 it('uses retained successful batches and marks a later failed or limited retry',async()=>{
  await ingest(day(-38));await ingest(day(-38),9,100,false);
  let snapshot=await rpc('seo_window_snapshot',[path,property,day(-38),day(-38),true]);expect(snapshot.totals.clicks).toBe(2);
  // Current facts can be replaced/removed; retained batches still reproduce the source run.
  await db.exec('delete from seo_metrics');snapshot=await rpc('seo_window_snapshot',[path,property,day(-38),day(-38),true]);expect(snapshot.totals.clicks).toBe(2);
  const failed=randomUUID();await rpc('seo_ingest_begin',[failed,'gsc',property,day(-38),'page',true,'{}']);await rpc('seo_ingest_finish',[failed,0,'UPSTREAM_UNAVAILABLE']);
  snapshot=await rpc('seo_window_snapshot',[path,property,day(-38),day(-38),true]);expect(snapshot).toMatchObject({ready:false,successful_days:1,totals:{clicks:2}});
  const latest=await ingest(day(-38));await db.query("update seo_ingestions set quality='{"+'"limited":true'+"}' where id=$1",[latest]);
  expect((await rpc('seo_window_snapshot',[path,property,day(-38),day(-38),true])).ready).toBe(false);
 });
 it('keeps baseline and report immutable and rejects anonymous or non-member access',async()=>{
  const r=await prepare(false),report=await capture(r,'insufficient');
  await expect(db.query("update seo_plans set plan='{}' where revision_id=$1",[r.id])).rejects.toThrow('SEO_IMMUTABLE_EVIDENCE');
  await expect(db.query('delete from seo_observations where id=$1',[report.id])).rejects.toThrow('SEO_IMMUTABLE_EVIDENCE');
  await expect(rpc('seo_observation_overview',[outsider,true])).rejects.toThrow('SEO_FORBIDDEN');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await expect(rpc('seo_observation_overview',[reviewer,true])).rejects.toThrow('permission denied');await expect(db.query('select * from seo_plans')).rejects.toThrow('permission denied');}finally{await db.exec('reset role');}}
  await expect(capture({...r,op:randomUUID()},'insufficient')).rejects.toThrow('SEO_NOT_FOUND');
  await expect(rpc('seo_capture_observation',[author,r.id,r.op,randomUUID(),day(-10),'keep','Editors may prepare evidence but cannot approve a keep decision.'])).rejects.toThrow('SEO_FORBIDDEN');
 });
 it('validates matching calendars, explicit fixture identity, sensitive queries and baseline maturity',async()=>{
  const valid=plan();expect(SeoOptimizationPlan.safeParse(valid).success).toBe(true);
  for(const change of [{baseline_from:day(-37)},{baseline_to:'2026-02-30'},{is_fixture:undefined},{target_queries:['name@example.invalid']},{minimum_impressions:0}])expect(SeoOptimizationPlan.safeParse({...valid,...change}).success).toBe(false);
  const content=baselineContent(path)!.content;
  await expect(rpc('seo_save_planned_draft',[author,JSON.stringify(content),null,JSON.stringify({...valid,baseline_from:day(-13),baseline_to:day(0)})])).rejects.toThrow('SEO_INVALID_REQUEST');
  expect(SeoObservationRequest.safeParse({revision_id:randomUUID(),publish_operation_id:randomUUID(),operation_id:randomUUID(),observation_to:day(-10),decision:'significant_growth',notes:'Unsupported automatic conclusion'}).success).toBe(false);
 });
});
