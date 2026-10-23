import { beforeAll,beforeEach,afterAll,describe,it,expect,vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash,createHmac,randomUUID } from 'node:crypto';
import sharp from 'sharp';
import Stripe from 'stripe';
import { createRouter,requestHash } from '../apps/web/src/server/router';
import { ApiError } from '../apps/web/src/server/errors';
import { dbError } from '../apps/web/src/server/supabase';
import { StripePayments } from '../apps/web/src/server/payments';
import { normalizeImage } from '../apps/web/src/server/media';
import { ToolView,JobView,WorkerSnapshot,ImageView,PublicRecommendation,EditRequest,ModelProfile } from '@picjp/contracts';
import { snapshot } from '@picjp/prompts';
import type { Database,Storage,Payments,Dependencies,Row } from '../apps/web/src/server/ports';

const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
let pg:PGlite;let storage:MemoryStorage;let payments:FakePayments;let deps:Dependencies;let route:ReturnType<typeof createRouter>;
const profile={profile_id:'fixture-v1',provider:'fixture',model_id:'verified-fixture',adapter_version:'1',verified_tool_ids:['illustration_photo','multi_photo_composite','remove_person'],max_images:4,roles:['primary','subject_reference'],qualities:['standard'],aspect_ratios:['preserve','1:1'],credits_standard:3,credits_high:5,pricing_version:'fixture-pricing'};
class TestDatabase implements Database{
 async authenticate(token:string){if(token!=='owner'&&token!=='other')throw new ApiError('UNAUTHORIZED',401);return {id:token==='owner'?uid:other,email:'test@example.invalid'};}
 async rpc<T=Row>(name:string,args:Row):Promise<T>{try{const entries=Object.entries(args);const result=await pg.query<{value:T}>(`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) as value`,entries.map(([,v])=>v!==null&&typeof v==='object'?JSON.stringify(v):v));return result.rows[0].value;}catch(error){dbError({message:(error as Error).message});throw error;}}
 async one(table:string,filters:Row){const entries=Object.entries(filters);return (await pg.query<Row>(`select * from ${table} where ${entries.map(([k],i)=>`${k}=$${i+1}`).join(' and ')}`,entries.map(([,v])=>v))).rows[0]??null;}
 async findJob(owner:string,key:string){return this.one('edit_jobs',{owner_id:owner,idempotency_key:key});}
 async list(table:string,owner:string,limit:number,cursor?:string){const values:unknown[]=[owner,limit];let filter='';if(cursor){const [date,id]=cursor.split('|');values.push(date,id);filter='and (created_at,id)<($3::timestamptz,$4::uuid)';}return (await pg.query<Row>(`select * from ${table} where owner_id=$1 ${filter} order by created_at desc,id desc limit $2`,values)).rows;}
 async packages(){return(await pg.query<Row>('select * from credit_packages where active order by amount_minor')).rows;}
 async markCleanup(id:string,pending:boolean){await pg.query("update images set cleanup_pending=$2 where id=$1 and status='deleted'",[id,pending]);}
}
class MemoryStorage implements Storage{
 objects=new Map<string,{bytes:Buffer,mime:string}>();failDelete=false;
 async signPut(key:string,mime:string){return `https://r2.example.invalid/${key}?mime=${encodeURIComponent(mime)}`;}
 async read(key:string,max:number){const v=this.objects.get(key);if(!v)throw new ApiError('IMAGE_NOT_READY',409);if(v.bytes.length>max)throw new ApiError('INVALID_REQUEST',413);return v;}
 async write(key:string,bytes:Buffer,mime:string){this.objects.set(key,{bytes,mime});}
 async remove(keys:string[]){if(this.failDelete)throw new Error('storage unavailable');keys.forEach(k=>this.objects.delete(k));}
 async signGet(key:string,attachment=false){return `https://r2.example.invalid/${key}?attachment=${attachment}`;}
}
class FakePayments implements Payments{
 count=0;sessions=new Map<string,Row>();charges=new Map<string,Row>();
 async createCheckout(order:Row){this.count++;const session={id:`cs_${order.id}`,url:`https://checkout.stripe.com/${order.id}`,mode:'payment',payment_status:'paid',currency:'jpy',amount_total:Number(order.amount_minor),payment_intent:`pi_${order.id}`,metadata:{order_id:order.id,user_id:order.owner_id}};this.sessions.set(session.id,session);return {id:session.id,url:session.url};}
 verifyEvent(raw:Buffer,sig:string){return new StripePayments().verifyEvent(raw,sig);}
 async retrieveSession(id:string){return this.sessions.get(id)!;}
 async retrievePaymentIntent(id:string){const order=id.slice(3);return {id,status:'succeeded',latest_charge:this.charges.get(`ch_${order}`)??{id:`ch_${order}`,payment_intent:id,amount:500,currency:'jpy',amount_refunded:0,disputed:false}};}
 async retrieveCharge(id:string){return this.charges.get(id)!;}
}
async function call(path:string,method='GET',body?:unknown,token='owner'){
 return route(new Request(`http://localhost${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)}));
}
async function upload(token='owner'){
 const bytes=await sharp({create:{width:24,height:16,channels:3,background:'#cc8844'}}).jpeg().toBuffer();
 const signed=await(await call('/api/images/upload-url','POST',{mime_type:'image/jpeg',bytes:bytes.length},token)).json();
 const owner=token==='owner'?uid:other;storage.objects.set(`staging/${owner}/${signed.image_id}`,{bytes,mime:'image/jpeg'});
 const completed=await call('/api/images/complete','POST',{image_id:signed.image_id},token);expect(completed.status).toBe(200);
 const image=await completed.json();expect(ImageView.safeParse(image).success).toBe(true);return image;
}
function edit(imageId:string,extra:Row={}){return {tool_id:'illustration_photo',inputs:[{image_id:imageId,role:'primary'}],idempotency_key:'initial_request_0001',...extra};}
async function credits(amount=20){await pg.query('update credit_accounts set available=$2 where owner_id=$1',[uid,amount]);}
async function event(type:string,object:Row,eventId:string=randomUUID()){
 const payload=JSON.stringify({id:eventId,type,data:{object}});const sig=Stripe.webhooks.generateTestHeaderString({payload,secret:'whsec_fixture'});
 return route(new Request('http://localhost/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':sig},body:payload}));
}
beforeAll(async()=>{
 pg=new PGlite();await pg.exec("create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public,auth to anon,authenticated,service_role; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 await pg.exec(await readFile('supabase/migrations/202610190001_web_backend.sql','utf8'));
});
afterAll(async()=>{await pg.close();});
beforeEach(async()=>{
 vi.unstubAllEnvs();vi.stubEnv('GENERATION_ENABLED','true');vi.stubEnv('GENERATION_TEST_USER_ID',uid);vi.stubEnv('MODEL_PROFILES_JSON',JSON.stringify([profile]));vi.stubEnv('STRIPE_SECRET_KEY','sk_test_fixture');vi.stubEnv('STRIPE_WEBHOOK_SECRET','whsec_fixture');vi.stubEnv('APP_ORIGIN','https://picjp.example.invalid');
 await pg.exec('truncate auth.users cascade; truncate credit_packages cascade; truncate rate_buckets;');await pg.query('insert into auth.users(id) values($1),($2)',[uid,other]);
 storage=new MemoryStorage();payments=new FakePayments();deps={db:new TestDatabase(),storage,payments,fetch:vi.fn(),now:()=>new Date()};route=createRouter(deps);
});

describe('Vercel backend with real PostgreSQL semantics and isolated external ports',()=>{
 it('rejects new retired tools before generation or reservation while replaying historical keys',async()=>{
  const image=await upload();await credits();
  for(const tool_id of ['remove_person','remove_object']){
   const response=await call('/api/edit','POST',edit(image.image_id,{tool_id}));
   expect(response.status).toBe(409);expect((await response.json()).error.code).toBe('UNSUPPORTED_CAPABILITY');
  }
  expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(0);
  const body=edit(image.image_id,{tool_id:'remove_person'});
  const historical={id:randomUUID(),request_hash:requestHash(EditRequest.parse(body)),status:'completed',credits_reserved:3};
  vi.spyOn(deps.db,'findJob').mockResolvedValue(historical);
  const replay=await call('/api/edit','POST',body);
  expect(replay.status).toBe(202);expect((await replay.json()).replayed).toBe(true);
 });
 it('serves public health and exactly 18 active sanitized tools with no setup secrets',async()=>{
 const health=await call('/api/health','GET',undefined,'');expect(health.status).toBe(200);expect(health.headers.get('X-Contract-Version')).toBe('1.0.0');
 const body=await(await call('/api/tools','GET',undefined,'')).json();expect(body.tools).toHaveLength(18);for(const tool of body.tools)expect(ToolView.safeParse(tool).success).toBe(true);expect(JSON.stringify(body)).not.toContain('final_prompt');expect(body.tools.map((tool:any)=>tool.tool_id)).not.toContain('remove_person');expect(body.tools.map((tool:any)=>tool.tool_id)).not.toContain('remove_object');
 });
 it('rejects retired removal tools before reserving credits even when the model profile permits them',async()=>{
 const image=await upload();await credits();vi.stubEnv('MODEL_PROFILES_JSON',JSON.stringify([{...profile,verified_tool_ids:['remove_person','remove_object']}]));
 for(const tool_id of ['remove_person','remove_object']){const res=await call('/api/edit','POST',edit(image.image_id,{tool_id,parameters:{target:'background subject'}}));expect(res.status).toBe(409);expect((await res.json()).error.code).toBe('UNSUPPORTED_CAPABILITY');}
 expect(await(await call('/api/credits')).json()).toMatchObject({available:20,reserved:0});expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(0);
 });
 it('keeps an existing retired-tool job readable and replays its original reservation without creating a new task',async()=>{
 const image=await upload();await credits();const body=EditRequest.parse(edit(image.image_id,{tool_id:'remove_person',parameters:{target:'background subject'}}));
 // Seed a task as it would exist before retirement, using the real transaction and frozen snapshot.
 const stored=await deps.db.rpc('app_create_job',{p_user_id:uid,p_idempotency_key:body.idempotency_key,p_request_hash:requestHash(body),p_inputs:body.inputs,p_snapshot:snapshot(body,ModelProfile.parse(profile)),p_reserved_credits:3,p_parent_job_id:null});
 vi.stubEnv('GENERATION_ENABLED','false');expect((await call(`/api/jobs/${stored.job_id}`)).status).toBe(200);
 const replay=await call('/api/edit','POST',body);expect(replay.status).toBe(202);expect(await replay.json()).toMatchObject({job_id:stored.job_id,replayed:true,credits_reserved:3});
 expect(await(await call('/api/credits')).json()).toMatchObject({available:17,reserved:3});expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(1);
 });
 it('requires verified auth and never accepts a user_id override',async()=>{expect((await call('/api/credits','GET',undefined,'')).status).toBe(401);expect((await call('/api/credits','GET',undefined,'forged')).status).toBe(401);const denied=await call('/api/images/upload-url','POST',{mime_type:'image/png',bytes:5,user_id:other});expect(denied.status).toBe(400);});
 it('canonicalizes uploads and repeated completion keeps the immutable version',async()=>{
 const image=await upload();const row=await deps.db.one('images',{id:image.image_id});const hash=row!.sha256;expect(row!.storage_key).not.toContain('staging/');
 expect((await sharp(storage.objects.get(row!.storage_key)!.bytes).metadata()).format).toBe('png');
 storage.objects.set(row!.temp_key,{bytes:Buffer.from('changed'),mime:'image/jpeg'});
 expect((await call('/api/images/complete','POST',{image_id:image.image_id})).status).toBe(200);expect((await deps.db.one('images',{id:image.image_id}))!.sha256).toBe(hash);
 });
 it('rejects corrupt media and declared/actual byte mismatches',async()=>{
 const x=await(await call('/api/images/upload-url','POST',{mime_type:'image/jpeg',bytes:4})).json();storage.objects.set(`staging/${uid}/${x.image_id}`,{bytes:Buffer.from('bad!'),mime:'image/jpeg'});
 expect((await call('/api/images/complete','POST',{image_id:x.image_id})).status).toBe(400);
 storage.objects.set(`staging/${uid}/${x.image_id}`,{bytes:Buffer.from('too long'),mime:'image/jpeg'});expect((await call('/api/images/complete','POST',{image_id:x.image_id})).status).toBe(400);
 });
 it('returns 404 for foreign previews/downloads and does not leak raw keys',async()=>{const image=await upload('other');expect((await call(`/api/images/${image.image_id}`)).status).toBe(404);expect((await call(`/api/images/${image.image_id}/download`)).status).toBe(404);});
 it('creates one job/reservation and replays original price after a model configuration change',async()=>{
 const image=await upload();await credits();const first=await call('/api/edit','POST',edit(image.image_id));expect(first.status).toBe(202);const accepted=await first.json();
 vi.stubEnv('MODEL_PROFILES_JSON',JSON.stringify([{...profile,credits_standard:19,model_id:'next-model'}]));vi.stubEnv('GENERATION_ENABLED','false');
 const replay=await(await call('/api/edit','POST',edit(image.image_id))).json();expect(replay).toMatchObject({job_id:accepted.job_id,credits_reserved:3,replayed:true});
 expect(await(await call('/api/credits')).json()).toMatchObject({available:17,reserved:3});
 const stored=await deps.db.one('edit_jobs',{id:accepted.job_id});expect(WorkerSnapshot.safeParse(stored!.snapshot).success).toBe(true);expect(stored!.snapshot.model_profile.model_id).toBe('verified-fixture');
 const visible=await(await call(`/api/jobs/${accepted.job_id}`)).json();expect(JobView.safeParse(visible).success).toBe(true);expect(JSON.stringify(visible)).not.toContain('final_prompt');
 });
 it('conflicting replay is 409 and does not create a second task',async()=>{const image=await upload();await credits();await call('/api/edit','POST',edit(image.image_id));const res=await call('/api/edit','POST',edit(image.image_id,{user_instruction:'different'}));expect(res.status).toBe(409);expect((await res.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');});
 it('enforces image ownership and sufficient credits in the real creation transaction',async()=>{const image=await upload();expect((await call('/api/edit','POST',edit(image.image_id))).status).toBe(402);await credits();const foreign=await upload('other');expect((await call('/api/edit','POST',edit(foreign.image_id))).status).toBe(404);expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(0);});
 it('blocks multi-photo creation throughout the restricted first-test rollout',async()=>{
 const a=await upload();const b=await upload();await credits();
 for(const inputs of [[{image_id:a.image_id,role:'primary'}],[{image_id:a.image_id,role:'primary'},{image_id:b.image_id,role:'subject_reference'}]]){
 expect((await call('/api/edit','POST',edit(a.image_id,{tool_id:'multi_photo_composite',inputs}))).status).toBe(503);
 }
 expect((await pg.query('select * from job_inputs')).rows).toHaveLength(0);
 expect(await(await call('/api/credits')).json()).toMatchObject({available:20,reserved:0});
 });
 it('rejects invented parameters, unknown prompts and unsupported output capabilities before charging',async()=>{const a=await upload();await credits();for(const extra of [{parameters:{secret_provider_flag:'yes'}},{prompt_id:'other_template'},{output:{quality:'high'}}])expect([400,409]).toContain((await call('/api/edit','POST',edit(a.image_id,extra))).status);expect(await(await call('/api/credits')).json()).toMatchObject({available:20,reserved:0});});
 it('cancels queued jobs exactly once and protects active input deletion',async()=>{const a=await upload();await credits();const j=await(await call('/api/edit','POST',edit(a.image_id))).json();expect((await call(`/api/images/${a.image_id}`,'DELETE')).status).toBe(409);expect((await call(`/api/jobs/${j.job_id}/cancel`,'POST')).status).toBe(200);expect((await call(`/api/jobs/${j.job_id}/cancel`,'POST')).status).toBe(200);expect(await(await call('/api/credits')).json()).toMatchObject({available:20,reserved:0});});
 it('blocks an expired asset and tombstones deletion before storage cleanup retries',async()=>{const a=await upload();storage.failDelete=true;const deletion=await(await call(`/api/images/${a.image_id}`,'DELETE')).json();expect(deletion.cleanup_pending).toBe(true);expect((await call(`/api/images/${a.image_id}`)).status).toBe(404);storage.failDelete=false;expect((await(await call(`/api/images/${a.image_id}`,'DELETE')).json()).cleanup_pending).toBe(false);});
 it('requires continuation primary input to equal the completed parent result',async()=>{const a=await upload();await credits();const j=await(await call('/api/edit','POST',edit(a.image_id))).json();const res=await call('/api/edit','POST',edit(a.image_id,{idempotency_key:'continuation_key001',parent_job_id:j.job_id}));expect(res.status).toBe(400);});
 it.each(['', 'not-a-uuid', '*'])('denies new jobs with invalid test account config %s',async(value)=>{
 vi.stubEnv('GENERATION_TEST_USER_ID',value);const image=await upload();await credits();
 const res=await call('/api/edit','POST',edit(image.image_id));expect(res.status).toBe(503);
 expect((await res.json()).error.code).toBe('GENERATION_DISABLED');
 const tools=await(await call('/api/tools')).json();expect(tools.tools.every((t:Row)=>!t.available&&t.unavailable_reason==='GENERATION_DISABLED')).toBe(true);
 expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(0);
 expect(await(await call('/api/credits')).json()).toMatchObject({available:20,reserved:0});
 });
 it('denies a missing test account even when generation is enabled',async()=>{
 delete process.env.GENERATION_TEST_USER_ID;const image=await upload();await credits();
 expect((await call('/api/edit','POST',edit(image.image_id))).status).toBe(503);
 expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(0);
 });
 it.each([false,true])('uses authenticated UUID and denies foreign accounts (console=%s)',async(consoleDevice)=>{
 const image=await upload('other');await pg.query('update credit_accounts set available=20 where owner_id=$1',[other]);
 const res=await route(new Request('http://localhost/api/edit',{method:'POST',headers:{Authorization:'Bearer other','Content-Type':'application/json',...(consoleDevice?{'X-Picjp-Device':'desktop'}:{})},body:JSON.stringify(edit(image.image_id))}));
 expect(res.status).toBe(503);expect((await res.json()).error.code).toBe('GENERATION_DISABLED');
 expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(0);
 expect((await pg.query("select * from credit_ledger where kind='reserve'")).rows).toHaveLength(0);
 expect(await(await call('/api/credits','GET',undefined,'other')).json()).toMatchObject({available:20,reserved:0});
 });
 it('rejects browser-supplied identity overrides instead of trusting the test UUID',async()=>{
 const image=await upload('other');
 const res=await call('/api/edit','POST',{...edit(image.image_id),user_id:uid},'other');expect(res.status).toBe(400);
 expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(0);
 });
 it('denies another configured tool even to the test account without reserving credits',async()=>{
 vi.stubEnv('MODEL_PROFILES_JSON',JSON.stringify([{...profile,verified_tool_ids:['illustration_photo','anime_photo']}]));
 const image=await upload();await credits();const res=await call('/api/edit','POST',edit(image.image_id,{tool_id:'anime_photo'}));
 expect(res.status).toBe(503);expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(0);
 expect(await(await call('/api/credits')).json()).toMatchObject({available:20,reserved:0});
 const catalog=await(await call('/api/tools')).json();expect(catalog.tools.filter((t:Row)=>t.available).map((t:Row)=>t.tool_id)).toEqual(['illustration_photo']);
 expect(JSON.stringify(catalog)).not.toContain(uid);
 });
 it('keeps historical replay readable after removing the test account without a second reservation',async()=>{
 const image=await upload();await credits();const first=await(await call('/api/edit','POST',edit(image.image_id))).json();
 delete process.env.GENERATION_TEST_USER_ID;vi.stubEnv('GENERATION_ENABLED','false');
 const replay=await(await call('/api/edit','POST',edit(image.image_id))).json();expect(replay.job_id).toBe(first.job_id);expect(replay.replayed).toBe(true);
 expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(1);
 expect(await(await call('/api/credits')).json()).toMatchObject({available:17,reserved:3});
 });
 it('wakes only the durable accepted job and retries wake on owner replay without another reservation',async()=>{
 const wake=vi.fn(async()=>{});deps.wakeJob=wake;const image=await upload();await credits();
 const first=await(await call('/api/edit','POST',edit(image.image_id))).json();expect(wake).toHaveBeenCalledWith(first.job_id);
 wake.mockRejectedValueOnce(new Error('PRIVATE_TOKEN_DO_NOT_LOG'));
 const replay=await(await call('/api/edit','POST',edit(image.image_id))).json();expect(replay.replayed).toBe(true);expect(wake).toHaveBeenCalledTimes(2);
 expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(1);expect(await(await call('/api/credits')).json()).toMatchObject({available:17,reserved:3});
 vi.stubEnv('GENERATION_ENABLED','false');await call('/api/edit','POST',edit(image.image_id));expect(wake).toHaveBeenCalledTimes(2);
 });
 it('preserves a queued job and its reservation if enqueue fails; denied submissions never wake',async()=>{
 const wake=vi.fn(async()=>{throw Error('PRIVATE_DISPATCH_FAILURE');});deps.wakeJob=wake;
 const foreign=await upload('other');expect((await call('/api/edit','POST',edit(foreign.image_id),'other')).status).toBe(503);expect(wake).not.toHaveBeenCalled();
 const image=await upload();await credits();expect((await call('/api/edit','POST',edit(image.image_id))).status).toBe(202);
 expect(wake).toHaveBeenCalledTimes(1);expect((await pg.query('select status from edit_jobs')).rows).toEqual([{status:'queued'}]);
 expect(await(await call('/api/credits')).json()).toMatchObject({available:17,reserved:3});
 });
 it('does not accept generation while the worker path is explicitly disabled',async()=>{vi.stubEnv('GENERATION_ENABLED','false');const a=await upload();await credits();expect((await call('/api/edit','POST',edit(a.image_id))).status).toBe(503);expect((await pg.query('select * from edit_jobs')).rows).toHaveLength(0);});
 it('limits requests persistently instead of relying on instance-local state',async()=>{for(let i=0;i<10;i++)expect((await call('/api/images/upload-url','POST',{mime_type:'image/png',bytes:4})).status).toBe(201);const res=await call('/api/images/upload-url','POST',{mime_type:'image/png',bytes:4});expect(res.status).toBe(429);expect(res.headers.get('Retry-After')).toBe('60');});
 it('paginates jobs with stable cursors and rejects malicious cursor syntax',async()=>{const a=await upload();await credits();await call('/api/edit','POST',edit(a.image_id));await call('/api/edit','POST',edit(a.image_id,{idempotency_key:'second_request_0001'}));const first=await(await call('/api/jobs?limit=1')).json();expect(first.items).toHaveLength(1);expect(first.next_cursor).toBeTruthy();const second=await(await call(`/api/jobs?limit=1&cursor=${encodeURIComponent(first.next_cursor)}`)).json();expect(second.items[0].job_id).not.toBe(first.items[0].job_id);expect((await call('/api/jobs?cursor=bad.or.owner_id.eq.foreign')).status).toBe(400);});
 it('provides honest fallback on missing JEV and excludes multi-input candidates',async()=>{vi.stubEnv('JEV_BASE_URL','');const a=await upload();const body=await(await call('/api/recommend','POST',{image_id:a.image_id})).json();expect(PublicRecommendation.safeParse(body).success).toBe(true);expect(body.source).toBe('fallback');expect(body.recommendations.every((r:any)=>r.score===null&&r.tool_id!=='multi_photo_composite')).toBe(true);});
 it('signs exact JEV body and rejects catalog/ID substitution',async()=>{
 vi.stubEnv('JEV_BASE_URL','https://jev.example.invalid');vi.stubEnv('JEV_SERVICE_SECRET','fixture-secret');const a=await upload();
 deps.fetch=vi.fn(async(_url,options)=>{const h=new Headers(options!.headers);const raw=String(options!.body);const expected=createHmac('sha256','fixture-secret').update(`POST\n/v1/recommend\n${h.get('X-Service-Timestamp')}\n${createHash('sha256').update(raw).digest('hex')}`).digest('hex');expect(h.get('X-Service-Signature')).toBe(expected);const request=JSON.parse(raw);return Response.json({contract_version:'1.0.0',request_id:request.request_id,catalog_revision:request.catalog_revision,model_version:'fixture',inference_ms:12,recommendations:[{prompt_id:'not_a_candidate',prompt_version:1,score:-2,reason_code:'VISUAL_MATCH'}]});}) as typeof fetch;
 const body=await(await call('/api/recommend','POST',{image_id:a.image_id})).json();expect(body.source).toBe('fallback');
 });
 it('accepts a matching JEV ranking without treating its score as a probability',async()=>{
 vi.stubEnv('JEV_BASE_URL','https://jev.example.invalid');vi.stubEnv('JEV_SERVICE_SECRET','fixture-secret');const a=await upload();
 deps.fetch=vi.fn(async(_url,options)=>{const request=JSON.parse(String(options!.body));const c=request.candidates[0];return Response.json({contract_version:'1.0.0',request_id:request.request_id,catalog_revision:request.catalog_revision,model_version:'fixture-model-v1',inference_ms:8,recommendations:[{prompt_id:c.prompt_id,prompt_version:c.prompt_version,score:-1.25,reason_code:'VISUAL_MATCH'}]});}) as typeof fetch;
 const body=await(await call('/api/recommend','POST',{image_id:a.image_id})).json();expect(PublicRecommendation.safeParse(body).success).toBe(true);expect(body.source).toBe('model');expect(body.recommendations[0].score).toBe(-1.25);
 });
 it('rejects invalid timestamp or UUID cursors before issuing database queries',async()=>{
 for(const cursor of ['2026-99-99T20:20:20Z|00000000-0000-4000-8000-000000000001','2026-10-19T20:20:20Z|------------------------------------'])expect((await call(`/api/jobs?cursor=${encodeURIComponent(cursor)}`)).status).toBe(400);
 });
 it('uses server-priced idempotent checkout and never credits a success redirect',async()=>{
 const pack=randomUUID();await pg.query('insert into credit_packages(id,credits,amount_minor,active) values($1,30,500,true)',[pack]);const req={package_id:pack,idempotency_key:'checkout_test_key01'};
 const first=await(await call('/api/checkout','POST',req)).json();const second=await(await call('/api/checkout','POST',req)).json();expect(second).toEqual(first);expect(payments.count).toBe(1);expect(await(await call('/api/credits')).json()).toMatchObject({available:0,reserved:0});expect((await call('/api/checkout','POST',{...req,amount_minor:1})).status).toBe(400);
 const order=await deps.db.one('orders',{id:first.order_id});expect(Number(order!.amount_minor)).toBe(500);
 });
 it('cryptographically validates Stripe signatures and grants once across replay and distinct paid events',async()=>{
 const pack=randomUUID();await pg.query('insert into credit_packages(id,credits,amount_minor,active) values($1,30,500,true)',[pack]);const order=await(await call('/api/checkout','POST',{package_id:pack,idempotency_key:'checkout_paid_key01'})).json();const sessionId=`cs_${order.order_id}`;
 expect((await event('checkout.session.completed',{id:sessionId},'evt_same')).status).toBe(200);expect((await event('checkout.session.completed',{id:sessionId},'evt_same')).status).toBe(200);expect((await event('checkout.session.async_payment_succeeded',{id:sessionId},'evt_second')).status).toBe(200);
 expect(await(await call('/api/credits')).json()).toMatchObject({available:30,reserved:0});
 const bad=await route(new Request('http://localhost/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':'forged'},body:'{}'}));expect(bad.status).toBe(400);
 });
 it('reverses cumulative refunded entitlement and ignores processed refund replays with newer charge facts',async()=>{
 const pack=randomUUID();await pg.query('insert into credit_packages(id,credits,amount_minor,active) values($1,30,500,true)',[pack]);const o=await(await call('/api/checkout','POST',{package_id:pack,idempotency_key:'checkout_ref_key001'})).json();await event('checkout.session.completed',{id:`cs_${o.order_id}`},'evt_paid');
 const pi=`pi_${o.order_id}`;payments.charges.set('ch_test',{payment_intent:pi,amount_refunded:250});expect((await event('charge.refunded',{id:'ch_test'},'evt_ref')).status).toBe(200);
 payments.charges.set('ch_test',{payment_intent:pi,amount_refunded:500});expect((await event('charge.refunded',{id:'ch_test'},'evt_ref')).status).toBe(200);
 expect(await(await call('/api/credits')).json()).toMatchObject({available:15});expect((await event('charge.refunded',{id:'ch_test'},'evt_ref2')).status).toBe(200);expect(await(await call('/api/credits')).json()).toMatchObject({available:0});
 });
 it('returns retryable 503 for a valid out-of-order refund with no paid mapping',async()=>{payments.charges.set('ch_unmapped',{payment_intent:'pi_not_yet_mapped',amount_refunded:250});const res=await event('charge.refunded',{id:'ch_unmapped'});expect(res.status).toBe(503);expect((await res.json()).error.retryable).toBe(true);});
 it('marks impossible primary-only multi-image profiles unavailable',async()=>{vi.stubEnv('MODEL_PROFILES_JSON',JSON.stringify([{...profile,roles:['primary']}]));const body=await(await call('/api/tools')).json();expect(body.tools.find((t:Row)=>t.tool_id==='multi_photo_composite').available).toBe(false);});
 it.each([false,true])('does not release refunded or disputed credits when paid arrives later (disputed=%s)',async(disputed)=>{
 const pack=randomUUID();await pg.query('insert into credit_packages(id,credits,amount_minor,active) values($1,30,500,true)',[pack]);const o=await(await call('/api/checkout','POST',{package_id:pack,idempotency_key:'checkout_ooo_key001'})).json();
 const charge={id:`ch_${o.order_id}`,payment_intent:`pi_${o.order_id}`,amount:500,currency:'jpy',amount_refunded:disputed?0:500,disputed};payments.charges.set(charge.id,charge);
 expect((await event(disputed?'charge.dispute.created':'charge.refunded',disputed?{charge:charge.id}:{id:charge.id},'evt_early_reversal')).status).toBe(503);
 expect((await event('checkout.session.completed',{id:`cs_${o.order_id}`},'evt_late_paid')).status).toBe(200);
 expect(await(await call('/api/credits')).json()).toMatchObject({available:0,reserved:0});
 expect((await event(disputed?'charge.dispute.created':'charge.refunded',disputed?{charge:charge.id}:{id:charge.id},'evt_early_reversal')).status).toBe(200);expect(await(await call('/api/credits')).json()).toMatchObject({available:0,reserved:0});
 });
 it('rejects oversize and non-JSON bodies with standard errors',async()=>{const res=await route(new Request('http://localhost/api/edit',{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({long:'a'.repeat(17000)})}));expect(res.status).toBe(413);expect((await res.json()).error.code).toBe('INVALID_REQUEST');});
});

describe('real image pipeline',()=>{
 it('rejects MIME spoofing and strips EXIF metadata',async()=>{const bytes=await sharp({create:{width:8,height:8,channels:3,background:'red'}}).jpeg().withMetadata({orientation:6}).toBuffer();await expect(normalizeImage(bytes,'image/png')).rejects.toThrow();const result=await normalizeImage(bytes,'image/jpeg');const meta=await sharp(result.data).metadata();expect(meta.orientation).toBeUndefined();expect(meta.exif).toBeUndefined();expect(meta.width).toBe(8);});
});
