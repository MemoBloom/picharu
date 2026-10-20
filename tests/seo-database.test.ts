import { beforeAll,afterAll,beforeEach,describe,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { baselineContent } from '../apps/web/src/server/seo/content';
import { researchWindows } from '../scripts/seo/research';
import { importWindow } from '../scripts/seo/import';
import type { SeoRpc } from '../apps/web/src/server/seo/repository';
const author='00000000-0000-4000-8000-000000000001',reviewer='00000000-0000-4000-8000-000000000002',outsider='00000000-0000-4000-8000-000000000003';
let db:PGlite;
const content=()=>baselineContent('/ja/tools/remove_person')!.content;
async function rpc(name:string,args:unknown[]){return (await db.query<{v:any}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) v`,args)).rows[0].v;}
async function draft(actor=author,base:string|null=null){return (await rpc('seo_save_draft',[actor,JSON.stringify(content()),base])).id as string;}
const transition=(id:string,action:string,actor=reviewer,expected:string|null=null,op=randomUUID())=>rpc('seo_transition',[actor,id,action,expected,op]);
async function approve(id:string){await transition(id,'submit',author);await transition(id,'approve');}
async function begin(id:string,fixture=true){await rpc('seo_ingest_begin',[id,'gsc','sc-domain:picmoko.com','2026-10-19','page',fixture,JSON.stringify({timezone:'America/Los_Angeles'})]);}
const rows=(clicks=2)=>JSON.stringify([{dimensions:{page:'/ja/tools/remove_person'},measures:{clicks,impressions:100,position:9}}]);
beforeAll(async()=>{
 db=new PGlite();await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;');
 await db.exec(await readFile('supabase/migrations/20261020153000_seo.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261020163245_seo_health.sql','utf8'));
 await db.query('insert into auth.users(id) values($1),($2),($3)',[author,reviewer,outsider]);
 await db.query("insert into seo_members values($1,'editor'),($2,'reviewer')",[author,reviewer]);
});
afterAll(()=>db.close());
beforeEach(async()=>{await db.exec('truncate seo_changes,seo_revisions,seo_pages,seo_metrics,seo_ingestion_batches,seo_ingestions cascade;');});
describe('SEO persisted approval, publish, rollback and import transactions',()=>{
 it('requires reviewed immutable content, preserves versions and supports CAS rollback',async()=>{
  const a=await draft();await expect(transition(a,'publish')).rejects.toThrow('SEO_UNAPPROVED_CONTENT');
  await transition(a,'submit',author);await expect(transition(a,'approve',author)).rejects.toThrow('SEO_FORBIDDEN');
  await transition(a,'approve');const op=randomUUID();const first=await transition(a,'publish',reviewer,null,op);
  expect(await transition(a,'publish',reviewer,null,op)).toEqual(first);
  await expect(transition(a,'rollback',reviewer,null,op)).rejects.toThrow('SEO_IDEMPOTENCY_CONFLICT');
  const b=await draft(author,a);await approve(b);await expect(transition(b,'publish',reviewer,null)).rejects.toThrow('SEO_REVISION_CONFLICT');
  await transition(b,'publish',reviewer,a);await transition(a,'rollback',reviewer,b);
  expect((await rpc('seo_get_published',['/ja/tools/remove_person']))[0].revision).toBe(a);
  await expect(db.query('update seo_revisions set content=$2 where id=$1',[a,JSON.stringify({...content(),title:'changed title'})])).rejects.toThrow('SEO_IMMUTABLE_REVISION');
 });
 it('rejects a stale draft even when the publisher refreshes the current pointer',async()=>{
  const a=await draft();await approve(a);await transition(a,'publish',reviewer,null);
  const b=await draft(author,a),c=await draft(author,a);await approve(b);await approve(c);
  await transition(b,'publish',reviewer,a);
  await expect(transition(c,'publish',reviewer,b)).rejects.toThrow('SEO_REVISION_CONFLICT');
  await expect(db.query('update seo_revisions set base_revision=$2 where id=$1',[c,b])).rejects.toThrow('SEO_IMMUTABLE_REVISION');
 });
 it('forbids self-review even for reviewers and denies non-members',async()=>{
  const id=await draft(reviewer);await transition(id,'submit',reviewer);
  await expect(transition(id,'approve',reviewer)).rejects.toThrow('SEO_SELF_REVIEW');
  await expect(draft(outsider)).rejects.toThrow('SEO_FORBIDDEN');
  await expect(rpc('seo_dashboard',[outsider,false])).rejects.toThrow('SEO_FORBIDDEN');
 });
 it('prevents anonymous and ordinary authenticated direct table/RPC access',async()=>{
  await db.exec('set role anon');await expect(db.query('select * from seo_revisions')).rejects.toThrow('permission denied');
  await expect(rpc('seo_get_published',[null])).rejects.toThrow('permission denied');await db.exec('reset role;set role authenticated');
  await expect(rpc('seo_dashboard',[reviewer,false])).rejects.toThrow('permission denied');await db.exec('reset role');
 });
 it('stages safely, rejects incomplete imports and replaces a complete window atomically',async()=>{
  const a=randomUUID();await begin(a);await rpc('seo_ingest_stage',[a,0,rows()]);
  await expect(rpc('seo_ingest_finish',[a,2,null])).rejects.toThrow('SEO_INCOMPLETE_IMPORT');
  expect((await db.query('select * from seo_metrics')).rows).toHaveLength(0);
  await rpc('seo_ingest_stage',[a,0,rows()]);await expect(rpc('seo_ingest_stage',[a,0,rows(4)])).rejects.toThrow('SEO_IDEMPOTENCY_CONFLICT');
  expect(await rpc('seo_ingest_finish',[a,1,null])).toMatchObject({status:'complete',rows:1});
  const b=randomUUID();await begin(b);await rpc('seo_ingest_stage',[b,0,rows(5)]);await rpc('seo_ingest_finish',[b,1,null]);
  expect((await db.query<{measures:{clicks:number}}>('select measures from seo_metrics')).rows).toEqual([{measures:{clicks:5,impressions:100,position:9}}]);
  const fail=randomUUID();await begin(fail);await rpc('seo_ingest_stage',[fail,0,rows(9)]);await rpc('seo_ingest_finish',[fail,1,'UPSTREAM_UNAVAILABLE']);
  expect((await db.query('select * from seo_metrics')).rows).toHaveLength(1);
 });
 it('keeps fixture and live facts separate and handles successful empty windows',async()=>{
  const a=randomUUID(),b=randomUUID();await begin(a,true);await rpc('seo_ingest_stage',[a,0,rows()]);await rpc('seo_ingest_finish',[a,1,null]);
  await begin(b,false);expect(await rpc('seo_ingest_finish',[b,0,null])).toMatchObject({status:'empty'});
  expect((await rpc('seo_dashboard',[reviewer,false])).metrics).toEqual([]);
  expect((await rpc('seo_dashboard',[reviewer,true])).metrics).toHaveLength(1);
 });
 it('reports every expected day and separates latest failure from last successful import',async()=>{
  const args=[false,'sc-domain:picmoko.com','559730643','2026-10-13','2026-10-19','2026-10-14','2026-10-20'];
  let health=await rpc('seo_ingestion_health',args);expect(health).toHaveLength(28);expect(health.every((r:any)=>r.status===null)).toBe(true);
  const first=randomUUID();await begin(first,false);await rpc('seo_ingest_finish',[first,0,null]);
  const failure=randomUUID();await begin(failure,false);await rpc('seo_ingest_finish',[failure,0,'UPSTREAM_UNAVAILABLE']);
  await db.query("update seo_ingestions set created_at=created_at-interval '1 minute' where id=$1",[first]);
  const fixture=randomUUID();await begin(fixture,true);await rpc('seo_ingest_finish',[fixture,0,null]);
  health=await rpc('seo_ingestion_health',args);expect(health.find((r:any)=>r.source==='gsc'&&r.grain==='page'&&r.day==='2026-10-19')).toMatchObject({status:'failed',successful_status:'empty'});
  const isolated=await rpc('seo_ingestion_health',[true,...args.slice(1)]);expect(isolated.filter((r:any)=>r.status!==null)).toHaveLength(1);
  await expect(rpc('seo_ingestion_health',[...args.slice(0,3),'2026-01-01','2026-10-19',...args.slice(5)])).rejects.toThrow('SEO_INVALID_REQUEST');
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await expect(rpc('seo_ingestion_health',args)).rejects.toThrow('permission denied');}finally{await db.exec('reset role');}}
 });
 it('imports CSV windows through real SQL idempotently and keeps research apart from GSC and live data',async()=>{
  const [window]=researchWindows(Buffer.from('Keyword,Volume\n写真 AI,100-1K\n背景 消す,—'),{source:'keyword_planner',export_id:'offline-test',exported_at:'2026-10-20T10:00:00Z',as_of:'2026-10-20',period_start:'2026-09-01',period_end:'2026-09-30',country:'JP',locale:'ja',search_type:'web',delimiter:'comma',keyword_column:'Keyword',value_column:'Volume',is_fixture:true});
  const adapter:SeoRpc=async<T>(name:string,args:Record<string,unknown>)=>{const entries=Object.entries(args);return (await db.query<{v:T}>(`select ${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) v`,entries.map(([,value])=>value&&typeof value==='object'?JSON.stringify(value):value))).rows[0].v;};
  const id=randomUUID();await importWindow(adapter,window,id);await importWindow(adapter,window,id);await importWindow(adapter,window);
  expect((await db.query('select * from seo_metrics')).rows).toHaveLength(2);
  const dashboard=await rpc('seo_dashboard',[reviewer,true]);expect(dashboard.metrics).toHaveLength(2);expect(dashboard.gsc_page_summary).toEqual([]);
  expect(dashboard.metrics.find((r:any)=>r.dimensions.query==='写真 AI').measures).toEqual({volume:null,volume_lower:100,volume_upper:1000});
  expect((await rpc('seo_dashboard',[reviewer,false])).metrics).toEqual([]);
 });
 it('keeps database page position unknown when any positive-impression row has no position',async()=>{
  const id=randomUUID(),today=new Date().toISOString().slice(0,10);
  await rpc('seo_ingest_begin',[id,'gsc','sc-domain:picmoko.com',today,'page',true,'{}']);
  await rpc('seo_ingest_stage',[id,0,JSON.stringify([{dimensions:{page:'/ja',country:'JP',device:'mobile'},measures:{clicks:1,impressions:100,position:10}},{dimensions:{page:'/ja',country:'JP',device:'desktop'},measures:{clicks:1,impressions:100,position:null}}])]);await rpc('seo_ingest_finish',[id,1,null]);
  expect((await rpc('seo_dashboard',[reviewer,true])).gsc_page_summary[0].measures).toMatchObject({impressions:200,position:null});
 });
});
