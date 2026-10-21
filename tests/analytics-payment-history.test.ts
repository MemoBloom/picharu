import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {buildAnalyticsReport} from '../apps/web/src/server/analytics/engine';
import type {AnalyticsDataset} from '../apps/web/src/server/analytics/types';
const owner='00000000-0000-4000-8000-000000000001';let pg:PGlite;
async function sql(q:string,args:unknown[]=[]){return pg.query<any>(q,args);}
async function order(env:string,days:number,paid=true){await sql('update console_settings set environment=$1',[env]);await sql(`insert into orders(owner_id,package_id,idempotency_key,credits,amount_minor,currency,status,paid_at,created_at) select $1,id,$2,10,1000,'JPY',$3,case when $4 then now()-($5*interval '1 day') else null end,now()-(($5+1)*interval '1 day') from credit_packages`,[owner,randomUUID(),paid?'paid':'pending',paid,days]);}
async function dataset(extra:Record<string,unknown>={}){const q={start:new Date(Date.now()-45*86400000).toISOString(),end:new Date(Date.now()-38*86400000).toISOString(),timezone:'UTC',bucket:'day',environment:'test',internal:'exclude',cohort:'all',...extra};const d=(await sql('select console_analytics_dataset($1::jsonb) d',[JSON.stringify(q)])).rows[0].d as AnalyticsDataset;d.permissions=['analytics:read','finance:read'];return d;}
beforeAll(async()=>{pg=new PGlite();await pg.exec('create schema auth;create table auth.users(id uuid primary key,email text);create role anon;create role authenticated;create role service_role bypassrls;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;');for(const f of ['202610190001_web_backend.sql','202610200400_worker.sql','202610210100_console_foundation.sql','202610210200_personal_console.sql','202610210300_admin_analytics.sql'])await pg.exec(await readFile(`supabase/migrations/${f}`,'utf8'));});
afterAll(async()=>{await pg.close();});
beforeEach(async()=>{await pg.exec('truncate auth.users,credit_packages cascade');await pg.exec("update console_settings set environment='test',collection_enabled=false");await sql('insert into auth.users(id) values($1)',[owner]);await pg.exec("update profiles set created_at=now()-interval '100 days';insert into credit_packages(package_id,credits,amount_minor,currency) values('synthetic',10,1000,'JPY')");});
describe('independent payment history completeness',()=>{
 it('does not treat the first classified payment as true first pay when older paid provenance is unknown',async()=>{
  await order('unclassified',89);await order('test',40);await order('test',35);
  const d=await dataset(),r=buildAnalyticsReport(d);expect(d.quality).toMatchObject({history_complete:true,payment_history_complete:false});expect(d.users[0]).toMatchObject({history_complete:true,payment_history_complete:false,lifetime_jobs:0});
  expect(r.metrics.find(m=>m.id==='M22')).toMatchObject({status:'incomplete',value:null});expect(r.operations.issues.some(i=>i.code==='PAYMENT_HISTORY_INCOMPLETE')).toBe(true);
 });
 it('calculates a genuine mature first-pay cohort and repeat purchase when payment history is complete',async()=>{
  await order('test',40);await order('test',35);const d=await dataset(),r=buildAnalyticsReport(d);expect(d.users[0].payment_history_complete).toBe(true);expect(r.metrics.find(m=>m.id==='M22')).toMatchObject({status:'ready',value:1,numerator:1,denominator:1});
 });
 it('keeps unknown payment members separate from definite unpaid users and marks incomplete cohort counts',async()=>{
  await order('unclassified',89);const d=await dataset({cohort:'unpaid'}),r=buildAnalyticsReport(d);
  expect(d.users[0].payment_history_complete).toBe(false);expect(r.users).toEqual([]);expect(r.metrics.find(m=>m.id==='M03')).toMatchObject({status:'incomplete',value:null});expect(r.meta.warnings.some(w=>w.includes('未知用户不默认为未付费'))).toBe(true);
  const all=buildAnalyticsReport(await dataset());expect(all.meta.cohort_definitions.payment_unknown).toBeDefined();
 });
 it('does not corrupt job lifetime completeness or independently known payment cohorts',async()=>{
  await sql("update console_settings set environment='unclassified'");await sql("insert into edit_jobs(owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved,created_at) values($1,'remove_person',$2,$3,'[]','{}',3,now()-interval '90 days')",[owner,randomUUID(),'a'.repeat(64)]);
  await order('test',40);await order('test',35);const d=await dataset(),r=buildAnalyticsReport(d);expect(d.quality).toMatchObject({history_complete:false,payment_history_complete:true});expect(d.users[0]).toMatchObject({history_complete:false,payment_history_complete:true});expect(r.metrics.find(m=>m.id==='M22')).toMatchObject({status:'ready',value:1});
 });
 it('does not treat an unknown pending unpaid order as a historical completed payment',async()=>{
  await order('unclassified',89,false);await order('test',40);await order('test',35);const d=await dataset();expect(d.quality.payment_history_complete).toBe(true);expect(buildAnalyticsReport(d).metrics.find(m=>m.id==='M22')!.status).toBe('ready');
 });
});
