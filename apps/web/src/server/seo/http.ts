import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { SeoDraftRequest,SeoTransitionRequest,SeoPath,ToolId,SeoRevalidationRequest,SeoContent,SeoObservationRequest } from '@picjp/contracts';
import { boundedBytes } from '../errors';
import { authenticateSeoActor,createSeoRpc,SeoError,type SeoRpc } from './repository';
import { baselineContent } from './content';
import { opportunities } from './metrics';
import { verifyEvidenceAssets } from './evidence';
import { readPipelineHealth } from './health';
import { isRetiredSeoPath } from '../../lib/seo';
import { isRetiredTool } from '@picjp/tool-config/lifecycle';

function requireActiveContent(content:SeoContent){
 if(isRetiredSeoPath(content.path))throw new SeoError('SEO_NOT_FOUND',404);
 if(content.related_tools.some(isRetiredTool))throw new SeoError('SEO_INVALID_REQUEST',400);
}

type Deps={rpc:SeoRpc;authenticate:(request:Request)=>Promise<string>;invalidate:(path:string)=>Promise<void>;now:()=>number;secret:()=>string|undefined;databaseContentEnabled?:()=>boolean;verifyEvidence?:(content:SeoContent)=>Promise<void>};
async function body(request:Request,max=65536){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new SeoError('SEO_INVALID_CONTENT_TYPE',415);return await boundedBytes(request,max);}
export function verifyRevalidation(bytes:Buffer,signature:string|null,secret:string|undefined){
 if(!secret||secret.length<32)throw new SeoError('SEO_NOT_CONFIGURED');
 if(!signature||!/^[a-f0-9]{64}$/.test(signature))throw new SeoError('SEO_INVALID_SIGNATURE',401);
 const expected=createHmac('sha256',secret).update(bytes).digest();
 if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw new SeoError('SEO_INVALID_SIGNATURE',401);
}
export function createSeoHandler(deps:Deps){return async(request:Request)=>{
 const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex','Content-Type':'application/json'};
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 try{
  const url=new URL(request.url);const path=url.pathname;
  if(path==='/api/seo/revalidate'&&request.method==='POST'){
   const bytes=await body(request);verifyRevalidation(bytes,request.headers.get('x-seo-signature'),deps.secret());
   const parsed=SeoRevalidationRequest.parse(JSON.parse(bytes.toString()));
   if(Math.abs(deps.now()/1000-parsed.timestamp)>300)throw new SeoError('SEO_EXPIRED_SIGNATURE',401);
   const published=await deps.rpc<any[]>('seo_get_published',{p_path:parsed.path});
   if(published[0]?.revision!==parsed.revision_id)throw new SeoError('SEO_REVISION_CONFLICT',409);
   const accepted=await deps.rpc<boolean>('seo_consume_nonce',{p_nonce:parsed.nonce});if(!accepted)throw new SeoError('SEO_REPLAY',409);
   await deps.invalidate(parsed.path);return respond({invalidated:true,path:parsed.path,revision_id:parsed.revision_id});
  }
  if(!path.startsWith('/api/seo/admin/'))throw new SeoError('SEO_NOT_FOUND',404);
  const actor=await deps.authenticate(request);
  if(path==='/api/seo/admin/overview'&&request.method==='GET'){
   const dashboard=await deps.rpc<any>('seo_dashboard',{p_actor:actor,p_fixture:url.searchParams.get('fixture')==='true',p_gsc_property:process.env.SEO_GSC_PROPERTY||'sc-domain:picmoko.com'});
   const pageRows=dashboard.gsc_page_summary||[];
   const [funnel,health,observation]=await Promise.all([
    dashboard.is_fixture?Promise.resolve(null):deps.rpc('seo_funnel_report',{p_actor:actor}),
    readPipelineHealth(deps.rpc,dashboard.is_fixture,deps.now()),
    deps.rpc<any>('seo_observation_overview',{p_actor:actor,p_fixture:dashboard.is_fixture}),
   ]);
   return respond({...dashboard,...observation,actor_id:actor,funnel,health,opportunities:health.can_suggest_search_changes?opportunities(pageRows):[],limits:{revisions:100,changes:100,ingestions:100,metrics:5000,plans:100,observations:100},ga4_property_configured:/^\d+$/.test(process.env.SEO_GA4_PROPERTY_ID||''),database_content_enabled:deps.databaseContentEnabled?.()===true});
  }
  await deps.rpc('seo_require_role',{p_actor:actor,p_roles:['editor','reviewer','admin']});
  if(path==='/api/seo/admin/baseline'&&request.method==='GET'){
   const p=SeoPath.parse(url.searchParams.get('path'));const content=baselineContent(p);if(!content)throw new SeoError('SEO_NOT_FOUND',404);return respond(content);
  }
  if(path==='/api/seo/admin/revision'&&request.method==='GET'){
   const id=z.string().uuid().parse(url.searchParams.get('revision_id'));return respond(await deps.rpc('seo_get_revision',{p_actor:actor,p_revision:id}));
  }
  if(path==='/api/seo/admin/drafts'&&request.method==='POST'){
   const data=SeoDraftRequest.parse(JSON.parse((await body(request)).toString()));
   requireActiveContent(data.content);
   if(data.content.kind==='tool'&&!ToolId.safeParse(data.content.path.split('/').at(-1)).success)throw new SeoError('SEO_NOT_FOUND',404);
   if(data.content.related_tools.some(id=>!ToolId.safeParse(id).success))throw new SeoError('SEO_INVALID_REQUEST',400);
   await deps.verifyEvidence?.(data.content);
   return respond(await deps.rpc(data.plan?'seo_save_planned_draft':'seo_save_draft',{p_actor:actor,p_content:data.content,p_expected_revision:data.expected_revision,...(data.plan?{p_plan:data.plan}:{})}),201);
  }
  if(path==='/api/seo/admin/observations'&&request.method==='POST'){
   const data=SeoObservationRequest.parse(JSON.parse((await body(request)).toString()));
   return respond(await deps.rpc('seo_capture_observation',{p_actor:actor,p_revision:data.revision_id,p_publish_operation:data.publish_operation_id,p_id:data.operation_id,p_to:data.observation_to,p_decision:data.decision,p_notes:data.notes}),201);
  }
  if(path==='/api/seo/admin/transitions'&&request.method==='POST'){
   const data=SeoTransitionRequest.parse(JSON.parse((await body(request)).toString()));
   if(['publish','rollback'].includes(data.action)&&!deps.databaseContentEnabled?.())throw new SeoError('SEO_DATABASE_CONTENT_DISABLED',409);
   if(['publish','rollback'].includes(data.action)){const revision=await deps.rpc<{content:any}>('seo_get_revision',{p_actor:actor,p_revision:data.revision_id});const content=SeoContent.parse(revision.content);requireActiveContent(content);await deps.verifyEvidence?.(content);}
   const result=await deps.rpc<{path:string}>('seo_transition',{p_actor:actor,p_revision:data.revision_id,p_action:data.action,p_expected_revision:data.expected_revision,p_operation:data.operation_id});
   if(data.action==='publish'||data.action==='rollback')await deps.invalidate(result.path);
   return respond(result);
  }
  throw new SeoError('SEO_NOT_FOUND',404);
 }catch(error){
  if(error instanceof SeoError)return respond({error:{code:error.code}},error.status);
  if(error instanceof z.ZodError||error instanceof SyntaxError)return respond({error:{code:'SEO_INVALID_REQUEST'}},400);
  if(error instanceof Error&&'status' in error&&typeof error.status==='number'&&error.status>=400&&error.status<500)return respond({error:{code:'SEO_INVALID_REQUEST'}},error.status);
  return respond({error:{code:'SEO_UNAVAILABLE'}},503);
 }
};}
export const defaultSeoDependencies={rpc:createSeoRpc(),authenticate:authenticateSeoActor,now:()=>Date.now(),secret:()=>process.env.SEO_REVALIDATE_SECRET,databaseContentEnabled:()=>process.env.SEO_CONTENT_BACKEND==='database',verifyEvidence:verifyEvidenceAssets};
