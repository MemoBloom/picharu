import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ConsoleUserLookup, ConsoleUserLookupResult } from '@picjp/contracts';
import { createRouter } from '../apps/web/src/server/router';
import { ApiError } from '../apps/web/src/server/errors';
import { dbError } from '../apps/web/src/server/supabase';
import type { Database, Dependencies, Row } from '../apps/web/src/server/ports';
const admin='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000002';
let pg:PGlite,route:ReturnType<typeof createRouter>;
async function sql(q:string,args:unknown[]=[]){return pg.query<Row>(q,args);}
async function rpc(name:string,args:Row){const e=Object.entries(args);return(await sql(`select ${name}(${e.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) value`,e.map(([,value])=>value!==null&&typeof value==='object'?JSON.stringify(value):value))).rows[0]?.value;}
const db:Database={
 async authenticate(token){if(![admin,target].includes(token))throw new ApiError('UNAUTHORIZED',401);return{id:token};},
 async rpc<T>(name:string,args:Row):Promise<T>{try{return await rpc(name,args);}catch(error){dbError({message:(error as Error).message});throw error;}},
 async one(){return null;},async list(){return[];},async packages(){return[];},async findJob(){return null;},async markCleanup(){},
};
async function call(body:unknown,user=admin){return route(new Request('http://localhost/api/admin/users/resolve',{method:'POST',headers:{...(user?{Authorization:`Bearer ${user}`} :{}),'Content-Type':'application/json'},body:JSON.stringify(body)}));}
async function lookup(body:unknown){const res=await call(body);expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');return ConsoleUserLookupResult.parse(await res.json());}
async function grant(){await sql("insert into console_roles(user_id,role,reason) values($1,'analyst','synthetic exact lookup')",[admin]);}
beforeAll(async()=>{pg=new PGlite();await pg.exec(`create schema auth;create table auth.users(id uuid primary key,email text);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);for(const f of ['202610190001_web_backend.sql','202610200400_worker.sql','202610210100_console_foundation.sql','202610210200_personal_console.sql','202610210300_admin_analytics.sql','202610210400_console_telemetry.sql'])await pg.exec(await readFile(`supabase/migrations/${f}`,'utf8'));});
afterAll(async()=>{await pg.close();});
beforeEach(async()=>{await pg.exec('truncate auth.users,console_audit,rate_buckets cascade');await sql("insert into auth.users(id,email) values($1,'administrator@example.invalid'),($2,'Alice.Secret@example.invalid')",[admin,target]);const deps={db,now:()=>new Date(),fetch,storage:{},payments:{}} as unknown as Dependencies;route=createRouter(deps);});
describe('exact administrator user ID/email lookup with real SQL and HTTP',()=>{
 it('denies anonymous, ordinary users and currently revoked administrators',async()=>{
  const body={kind:'id',value:target};expect((await call(body,'')).status).toBe(401);expect((await call(body,target)).status).toBe(403);await grant();expect((await call(body)).status).toBe(200);await sql('update console_roles set revoked_at=now() where user_id=$1',[admin]);expect((await call(body)).status).toBe(403);
 });
 it('resolves exact UUID and case-insensitive trimmed email with only masked identity',async()=>{
  await grant();const expected={match:'matched',user_id:target,email_masked:'A***@example.invalid'};
  expect(await lookup({kind:'id',value:target})).toEqual(expected);expect(await lookup({kind:'email',value:'  ALICE.SECRET@EXAMPLE.INVALID  '})).toEqual(expected);expect(ConsoleUserLookup.parse({kind:'email',value:' \tAlice.Secret@example.invalid\n'})).toEqual({kind:'email',value:'Alice.Secret@example.invalid'});
  const direct=await rpc('app_console_resolve_user',{p_user_id:admin,p_lookup:{kind:'email',value:' \tALICE.SECRET@example.invalid\n'},p_request_id:randomUUID()});expect(direct).toEqual(expected);
 });
 it('reports missing and duplicate email matches without returning an arbitrary user',async()=>{
  await grant();expect(await lookup({kind:'id',value:randomUUID()})).toEqual({match:'not_found',user_id:null,email_masked:null});expect(await lookup({kind:'email',value:'missing@example.invalid'})).toEqual({match:'not_found',user_id:null,email_masked:null});await sql("insert into auth.users(id,email) values($1,'alice.secret@EXAMPLE.INVALID')",[randomUUID()]);expect(await lookup({kind:'email',value:'alice.secret@example.invalid'})).toEqual({match:'ambiguous',user_id:null,email_masked:null});
 });
 it('audits only lookup kind and never places full queried identities in JSON or audit summaries',async()=>{
  await grant();const result=await lookup({kind:'email',value:'alice.secret@example.invalid'});expect(JSON.stringify(result)).not.toMatch(/alice\.secret/i);expect(result.email_masked).toBe('A***@example.invalid');
  const audits=(await sql("select filter_summary,target_id from console_audit where action='analytics_read'")).rows;expect(audits).toEqual([{filter_summary:{lookup_kind:'email'},target_id:null}]);expect(JSON.stringify(audits)).not.toMatch(/alice|secret|example\.invalid/i);
 });
 it('rejects schema smuggling, partial email searches, invalid UUIDs and oversized emails before lookup',async()=>{
  await grant();for(const body of [{kind:'name',value:'Alice'},{kind:'id',value:'not-uuid'},{kind:'email',value:'Alice'},{kind:'email',value:'%@example.invalid'},{kind:'email',value:'a'.repeat(255)+'@example.invalid'},{kind:'email',value:'alice.secret@example.invalid',owner_id:target}])expect((await call(body)).status).toBe(400);
  expect((await sql("select count(*)::int n from console_audit where action='analytics_read'")).rows[0].n).toBe(0);
 });
 it('blocks anonymous/authenticated direct RPC execution while service_role can execute the controlled lookup',async()=>{
  await grant();for(const role of ['anon','authenticated']){await pg.exec(`set role ${role}`);try{await expect(rpc('app_console_resolve_user',{p_user_id:admin,p_lookup:{kind:'id',value:target},p_request_id:randomUUID()})).rejects.toThrow('permission denied');}finally{await pg.exec('reset role');}}
  await pg.exec('set role service_role');try{expect(await rpc('app_console_resolve_user',{p_user_id:admin,p_lookup:{kind:'id',value:target},p_request_id:randomUUID()})).toMatchObject({match:'matched',user_id:target});}finally{await pg.exec('reset role');}
 });
});
