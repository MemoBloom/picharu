import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { EditRequest, ToolId, ToolView } from '@picjp/contracts';
import { activeTools, getTool, isRetiredTool, retiredToolIds, tools } from '@picjp/tool-config';
import { analyticsToolCatalog, createRouter, publicTools, requestHash } from '../apps/web/src/server/router';
import type { Dependencies, Row } from '../apps/web/src/server/ports';

const user='00000000-0000-4000-8000-000000000001';
const image='00000000-0000-4000-8000-000000000010';
function setup(previous:Row|null=null){
 const rpc=vi.fn(async(name:string)=>{if(name==='app_consume_rate_limit')return true;throw Error(`Unexpected mutation: ${name}`);});
 const deps={db:{authenticate:async()=>({id:user}),rpc,findJob:async()=>previous,one:async()=>null,list:async()=>[],packages:async()=>[],markCleanup:async()=>{}},storage:{},payments:{},fetch,now:()=>new Date()} as unknown as Dependencies;
 return {route:createRouter(deps),rpc};
}
function request(tool:string,key='retired_request_0001'){
 return {tool_id:tool,inputs:[{image_id:image,role:'primary'}],parameters:{},idempotency_key:key};
}
async function edit(route:ReturnType<typeof createRouter>,body:Row){return route(new Request('http://localhost/api/edit',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)}));}
afterEach(()=>{vi.unstubAllEnvs();});
describe('18-direction product catalog with immutable retired history',()=>{
 it('publishes exactly 18 active directions while retaining historical typed names/parameters',()=>{
  expect(activeTools).toHaveLength(18);expect(tools).toHaveLength(20);
  for(const id of retiredToolIds){expect(ToolId.parse(id)).toBe(id);expect(isRetiredTool(id)).toBe(true);expect(activeTools.some(t=>t.tool_id===id)).toBe(false);expect(getTool(id).parameters_schema.parse({target:'historical target'})).toEqual({target:'historical target'});}
  expect(getTool('remove_person')).toMatchObject({name_zh:'去除路人',category:'日常修图'});expect(getTool('remove_object')).toMatchObject({name_zh:'去除杂物',category:'日常修图'});
  expect(isRetiredTool('ai_avatar')).toBe(false);
 });
 it('keeps public discovery/recommendation capability sets free of retired entries even if a model advertises support',async()=>{
  vi.stubEnv('GENERATION_TEST_USER_ID','00000000-0000-4000-8000-000000000001');vi.stubEnv('GENERATION_ENABLED','true');vi.stubEnv('MODEL_PROFILES_JSON',JSON.stringify([{profile_id:'fixture',provider:'fixture',model_id:'fixture',adapter_version:'1',verified_tool_ids:['remove_person','remove_object','illustration_photo'],max_images:1,roles:['primary'],qualities:['standard'],aspect_ratios:['preserve'],credits_standard:3,credits_high:5,pricing_version:'fixture'}]));
  const list=publicTools();expect(list).toHaveLength(18);for(const tool of list)expect(ToolView.safeParse(tool).success).toBe(true);expect(list.some(t=>isRetiredTool(t.tool_id))).toBe(false);expect(list.find(t=>t.tool_id==='illustration_photo')?.available).toBe(true);
  const {route}=setup();const res=await route(new Request('http://localhost/api/tools'));expect((await res.json()).tools.map((t:Row)=>t.tool_id)).toEqual(list.map(t=>t.tool_id));
  const catalog=analyticsToolCatalog();expect(catalog).toHaveLength(20);expect(catalog.find(t=>t.tool_id==='remove_person')).toEqual({tool_id:'remove_person',name:'去除路人',category:'日常修图',available:false});expect(catalog.find(t=>t.tool_id==='remove_object')).toEqual({tool_id:'remove_object',name:'去除杂物',category:'日常修图',available:false});
 });
 it('rejects new retired-tool edits before any asset read or credit reservation, including when generation is off',async()=>{
  for(const enabled of ['true','false']){
   vi.stubEnv('GENERATION_ENABLED',enabled);
   for(const id of retiredToolIds){const {route,rpc}=setup();const res=await edit(route,request(id));expect(res.status).toBe(409);expect((await res.json()).error.code).toBe('UNSUPPORTED_CAPABILITY');expect(rpc.mock.calls.every(([name])=>name==='app_consume_rate_limit')).toBe(true);}
  }
 });
 it('replays a matching historical retired request without mutation and rejects conflicting reuse',async()=>{
  vi.stubEnv('GENERATION_ENABLED','false');
  for(const id of retiredToolIds){
   const body=request(id);const previous={id:randomUUID(),request_hash:requestHash(EditRequest.parse(body)),status:'completed',credits_reserved:3};
   const {route,rpc}=setup(previous);const replay=await edit(route,body);expect(replay.status).toBe(202);expect(await replay.json()).toEqual({job_id:previous.id,status:'completed',credits_reserved:3,replayed:true});expect(rpc.mock.calls.every(([name])=>name==='app_consume_rate_limit')).toBe(true);
   const conflict=await edit(route,{...body,user_instruction:'changed input'});expect(conflict.status).toBe(409);expect((await conflict.json()).error.code).toBe('IDEMPOTENCY_CONFLICT');
  }
 });
});
