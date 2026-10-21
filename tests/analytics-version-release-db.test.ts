import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const owner='00000000-0000-4000-8000-000000000001';
let pg:PGlite;
async function sql(q:string,args:unknown[]=[]){return pg.query<any>(q,args);}
async function report(){const q={start:new Date(Date.now()-86400000).toISOString(),end:new Date().toISOString(),timezone:'UTC',bucket:'day',environment:'test',internal:'exclude',cohort:'all'};return(await sql('select app_console_create_report($1,$2,$3) value',[owner,JSON.stringify(q),randomUUID()])).rows[0].value;}
function key(model='model'){return JSON.stringify(['illustration_photo',model,'adapter','prompt',2,1]);}
async function release(k=key(),env='test',when="now()-interval '4 hours'",scope='all_users'){return sql(`insert into console_version_releases(environment,key,released_at,scope) values($1,$2,${when},$3)`,[env,k,scope]);}
beforeAll(async()=>{pg=new PGlite();await pg.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);for(const f of ['202610190001_web_backend.sql','202610200400_worker.sql','202610210100_console_foundation.sql','202610210200_personal_console.sql','202610210300_admin_analytics.sql','202610210400_console_telemetry.sql'])await pg.exec(await readFile(`supabase/migrations/${f}`,'utf8'));});
afterAll(async()=>{await pg.close();});
beforeEach(async()=>{await pg.exec('truncate auth.users,console_audit,console_version_releases,console_analytics_reports cascade');await pg.exec("update console_settings set collection_enabled=false,environment='test'");await sql('insert into auth.users(id) values($1)',[owner]);await sql("insert into console_roles(user_id,role,reason) values($1,'analyst','local release-fact verification')",[owner]);await sql(`insert into edit_jobs(owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved,created_at) values($1,'illustration_photo',$2,$3,$4,$5,3,now()-interval '2 hours')`,[owner,randomUUID(),'a'.repeat(64),'[]',JSON.stringify({model_profile:{model_id:'model',adapter_version:'adapter'},prompt_id:'prompt',prompt_version:2,tool_version:1})]);});
describe('authoritative operator-maintained version release facts',()=>{
 it('does not manufacture release times from first observed usage',async()=>{const r=await report();expect(r.dataset.jobs).toHaveLength(1);expect(r.dataset.version_releases).toEqual([]);});
 it('returns only matching loaded version/environment and past release facts in a frozen report',async()=>{
  await release();await release(key(),'test',"now()-interval '3 hours'",'limited_rollout');await release(key('unrelated'));await release(key(),'live');await release(key(),'test',"now()+interval '1 day'");
  const r=await report();expect(r.dataset.version_releases).toHaveLength(2);expect(r.dataset.version_releases.map((v:any)=>v.key)).toEqual([key(),key()]);expect(r.dataset.version_releases.map((v:any)=>v.scope)).toEqual(['all_users','limited_rollout']);
  expect(new Date(r.dataset.version_releases[0].released_at).getTime()).toBeLessThan(new Date(r.dataset.jobs[0].created_at).getTime());await release(key(),'test',"now()-interval '1 hour'",'internal_only');
  const read=(await sql('select app_console_read_report($1,$2,$3) value',[owner,r.report_id,randomUUID()])).rows[0].value;expect(read.dataset.version_releases).toEqual(r.dataset.version_releases);expect((await report()).dataset.version_releases).toHaveLength(2);const allQuery={start:new Date(Date.now()-86400000).toISOString(),end:new Date().toISOString(),timezone:'UTC',bucket:'day',environment:'test',internal:'include',cohort:'all'};const included=(await sql('select app_console_create_report($1,$2,$3) value',[owner,JSON.stringify(allQuery),randomUUID()])).rows[0].value;expect(included.dataset.version_releases).toHaveLength(3);
 });
 it('requires bounded canonical six-part keys and explicit release scope',async()=>{
  for(const k of ['not-json','[]',JSON.stringify(['illustration_photo','model','adapter','prompt',2,1,'extra']),JSON.stringify(['BAD ID','model','adapter','prompt',2,1]),JSON.stringify(['illustration_photo','model','adapter','prompt',0,1]),'["illustration_photo", "model", "adapter", "prompt", 2, 1]'])await expect(release(k)).rejects.toThrow('check constraint');
  await expect(release(key(),'test',"now()",'first_seen')).rejects.toThrow('check constraint');await expect(release(key(),'production')).rejects.toThrow('check constraint');
  const spaced='model, with "quote"';expect((await sql('select console_release_key_valid($1) valid',[key(spaced)])).rows[0].valid).toBe(true);
 });
 it('audits controlled release maintenance and rejects oversized release sources rather than silently truncating markers',async()=>{
  await release();await sql("update console_version_releases set scope='limited_rollout'");await sql('delete from console_version_releases');expect((await sql("select count(*)::int n from console_audit where action='version_release_change'")).rows[0].n).toBe(3);
  await sql("insert into console_version_releases(environment,key,released_at,scope) select 'test',$1,now()-make_interval(secs=>g),'all_users' from generate_series(1,20001) g",[key()]);await expect(report()).rejects.toThrow('QUERY_TOO_LARGE');
 });
 it('restricts direct release fact maintenance and helper execution to service_role',async()=>{
  for(const role of ['anon','authenticated']){await pg.exec(`set role ${role}`);try{await expect(sql('select * from console_version_releases')).rejects.toThrow('permission denied');await expect(release()).rejects.toThrow('permission denied');await expect(sql('select console_release_key_valid($1)',[key()])).rejects.toThrow('permission denied');}finally{await pg.exec('reset role');}}
  await pg.exec('set role service_role');try{await release();expect((await sql('select count(*)::int n from console_version_releases')).rows[0].n).toBe(1);}finally{await pg.exec('reset role');}
 });
});
