import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const owner='00000000-0000-4000-8000-000000000001';
const migrations=['202610190001_web_backend.sql','202610200400_worker.sql','202610210100_console_foundation.sql','202610210200_personal_console.sql','202610210300_admin_analytics.sql','202610210400_console_telemetry.sql'];
let pg:PGlite;
async function init(db:PGlite,files=migrations){await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);for(const file of files)await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));}
async function sql(query:string,args:unknown[]=[]){return pg.query<any>(query,args);}
async function rpc(name:string,args:unknown[]){return(await sql(`select ${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args.map(value=>value!==null&&typeof value==='object'?JSON.stringify(value):value))).rows[0]?.value;}
async function createUpload(){const id=randomUUID();await rpc('app_create_upload',[owner,id,'image/png',10,`temp/${id}`,new Date(Date.now()+7*86400000).toISOString()]);return id;}
async function complete(id:string){await rpc('app_complete_upload',[owner,id,`image/${id}`,`preview/${id}`,'a'.repeat(64),'image/png',10,2,2]);}
function q(env='test',internal='exclude'){return {start:new Date(Date.now()-86400000).toISOString(),end:new Date(Date.now()+1000).toISOString(),timezone:'UTC',bucket:'day',environment:env,internal,cohort:'all'};}
async function report(env='test',internal='exclude'){return(await rpc('app_console_create_report',[owner,q(env,internal),randomUUID()])).dataset;}
beforeAll(async()=>{pg=new PGlite();await init(pg);});
afterAll(async()=>{await pg.close();});
beforeEach(async()=>{await pg.exec('truncate auth.users,console_audit,console_analytics_reports,console_collection_periods,console_refund_periods cascade');await pg.exec("update console_settings set environment='test',collection_enabled=false");await sql('insert into auth.users(id) values($1)',[owner]);await sql("insert into console_roles(user_id,role,reason) values($1,'analyst','synthetic upload provenance')",[owner]);});
describe('frozen image provenance with real SQL completion transactions',()=>{
 it('freezes completion environment/internal label and never rewrites it on later settings/account changes or completion replay',async()=>{
  const im=await createUpload();expect((await sql('select analytics_environment,analytics_internal from images where id=$1',[im])).rows[0]).toEqual({analytics_environment:'unclassified',analytics_internal:false});
  await pg.exec("update console_settings set environment='live'");await sql('insert into console_user_tags(user_id,internal_account) values($1,true)',[owner]);await complete(im);
  const first=(await sql('select analytics_environment,analytics_internal,upload_completed_at from images where id=$1',[im])).rows[0];expect(first).toMatchObject({analytics_environment:'live',analytics_internal:true});expect(first.upload_completed_at).not.toBeNull();
  await pg.exec("update console_settings set environment='test';update console_user_tags set internal_account=false");await complete(im);
  expect((await sql('select analytics_environment,analytics_internal,upload_completed_at from images where id=$1',[im])).rows[0]).toEqual(first);
  await expect(sql("update images set analytics_environment='test' where id=$1",[im])).rejects.toThrow('IMMUTABLE_ANALYTICS_CONTEXT');await expect(sql('update images set analytics_internal=false where id=$1',[im])).rejects.toThrow('IMMUTABLE_ANALYTICS_CONTEXT');
 });
 it('reports same-owner uploads only in their frozen environment/tag, while unclassified evidence stays explicit',async()=>{
  const test=await createUpload();await complete(test);await pg.exec("update console_settings set environment='live'");const live=await createUpload();await complete(live);
  await sql("insert into edit_jobs(owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved) values($1,'illustration_photo',$2,$3,'[]','{}',3)",[owner,randomUUID(),'a'.repeat(64)]);
  await pg.exec("update console_settings set environment='test'");await sql('insert into console_user_tags(user_id,internal_account) values($1,true)',[owner]);const internal=await createUpload();await complete(internal);
  await pg.exec("update console_settings set environment='unclassified';update console_user_tags set internal_account=false");const unknown=await createUpload();await complete(unknown);await pg.exec("update console_settings set environment='test'");
  const d=await report();expect(d.images.map((im:any)=>im.id).sort()).toEqual([test,unknown].sort());expect(d.images.find((im:any)=>im.id===test)).toMatchObject({environment:'test',internal:false});expect(d.images.find((im:any)=>im.id===unknown)).toMatchObject({environment:'unclassified',internal:false});expect(d.images.some((im:any)=>im.id===live||im.id===internal)).toBe(false);
  const liveData=await report('live','include');expect(liveData.images.map((im:any)=>im.id).sort()).toEqual([live,unknown].sort());
  const all=await report('test','include');expect(all.images.map((im:any)=>im.id).sort()).toEqual([test,internal,unknown].sort());
 });
 it('inherits generated asset provenance from its frozen source job despite environment/tag changes',async()=>{
  const job=randomUUID();await sql("insert into edit_jobs(id,owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved) values($1,$2,'illustration_photo',$3,$4,'[]','{}',3)",[job,owner,randomUUID(),'a'.repeat(64)]);
  await pg.exec("update console_settings set environment='live'");await sql('insert into console_user_tags(user_id,internal_account) values($1,true)',[owner]);const generated=randomUUID();await sql(`insert into images(id,owner_id,status,source_kind,source_job_id,storage_key,preview_key,sha256,mime_type,bytes,width,height,expires_at) values($1,$2,'ready','generated',$3,$4,$5,$6,'image/png',10,2,2,now()+interval '7 days')`,[generated,owner,job,`result/${generated}`,`preview/${generated}`,'a'.repeat(64)]);
  expect((await sql('select analytics_environment,analytics_internal from images where id=$1',[generated])).rows[0]).toEqual({analytics_environment:'test',analytics_internal:false});
 });
 it('retains current queued owners and matching facts beyond a historical report follow-up window',async()=>{
  const job=randomUUID();await sql("insert into edit_jobs(id,owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved) values($1,$2,'illustration_photo',$3,$4,'[]','{}',3)",[job,owner,randomUUID(),'a'.repeat(64)]);
  const historical={...q(),start:new Date(Date.now()-100*86400000).toISOString(),end:new Date(Date.now()-90*86400000).toISOString()};
  const d=(await rpc('app_console_create_report',[owner,historical,randomUUID()])).dataset;expect(d.jobs.map((j:any)=>j.id)).toContain(job);expect(d.users.map((u:any)=>u.id)).toContain(owner);
 });
 it('includes already-visible queued facts at exactly the report as_of instant',async()=>{
  // One volatile wrapper forces statement_timestamp() to be identical for the
  // insert and report. No sleep or millisecond clock luck can hide the boundary.
  await pg.exec(`create or replace function pg_temp.console_equal_asof(p_query jsonb) returns jsonb language plpgsql as $$
   declare jid uuid:=gen_random_uuid(); uid uuid:=gen_random_uuid(); dataset jsonb;
   begin
    insert into auth.users(id) values(uid);
    update profiles set created_at=statement_timestamp() where id=uid;
    insert into edit_jobs(id,owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved,created_at)
    values(jid,uid,'illustration_photo',gen_random_uuid()::text,repeat('a',64),'[]','{}',3,statement_timestamp());
    dataset:=console_analytics_dataset(p_query);
    return jsonb_build_object('id',jid,'owner_id',uid,'dataset',dataset);
   end $$;`);
  const historical={...q(),start:new Date(Date.now()-100*86400000).toISOString(),end:new Date(Date.now()-90*86400000).toISOString()};
  const value=(await sql('select pg_temp.console_equal_asof($1) value',[JSON.stringify(historical)])).rows[0].value;
  const fact=value.dataset.jobs.find((j:any)=>j.id===value.id);expect(fact).toBeDefined();expect(new Date(fact.created_at).getTime()).toBe(new Date(value.dataset.as_of).getTime());expect(value.dataset.users.map((u:any)=>u.id)).toContain(value.owner_id);
 });
 it('leaves pre-migration completed assets explicitly unclassified instead of backfilling their owner environment',async()=>{
  const legacy=new PGlite();try{await init(legacy,migrations.slice(0,2));await legacy.query('insert into auth.users(id) values($1)',[owner]);const im=randomUUID();await legacy.query(`insert into images(id,owner_id,status,declared_mime,declared_bytes,temp_key,storage_key,preview_key,sha256,mime_type,bytes,width,height,expires_at) values($1,$2,'ready','image/png',10,'legacy/temp','legacy/image','legacy/preview',$3,'image/png',10,2,2,now()+interval '7 days')`,[im,owner,'a'.repeat(64)]);await legacy.exec(await readFile(`supabase/migrations/${migrations[2]}`,'utf8'));await legacy.exec("update console_settings set environment='test'");expect((await legacy.query('select analytics_environment,analytics_internal,upload_completed_at from images where id=$1',[im])).rows[0]).toEqual({analytics_environment:'unclassified',analytics_internal:false,upload_completed_at:null});}finally{await legacy.close();}
 });
});
