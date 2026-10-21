import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CONTRACT_VERSION,UploadRequest,ImageCompleteRequest,EditRequest,RecommendRequest,CheckoutRequest,Pagination,Id,ConsoleDevice,type ToolId } from '@picjp/contracts';
import { tools,getTool,profileForTool,validateToolParameters } from '@picjp/tool-config';
import { prompts,snapshot } from '@picjp/prompts';
import type { Dependencies,Row } from './ports';
import { ApiError,boundedBytes,failure,json,requestId,response } from './errors';
import { models,generationEnabled,appOrigin,retentionDays } from './config';
import { normalizeImage } from './media';
import { recommend } from './recommend';
import { consoleRoute } from './console';
import { personalConsoleRoute } from './personal-console';
import { adminAnalyticsRoute } from './admin-analytics';
import {recordStripeRefundFacts} from './analytics-refunds';
function canonical(value:unknown):string{if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Row)[k])}`).join(',')}}`;return JSON.stringify(value);}
export function requestHash(request:EditRequest){return createHash('sha256').update(canonical(request)).digest('hex');}
function jobView(j:Row){return {job_id:j.id,tool_id:j.tool_id,status:j.status,stage:j.stage,inputs:j.inputs,parent_job_id:j.parent_job_id??null,result_image_id:j.result_image_id??null,credits_reserved:j.credits_reserved,error_code:j.error_code??null,created_at:j.created_at,completed_at:j.completed_at??null};}
function orderView(o:Row){return {order_id:o.id,package_id:o.package_id,credits:o.credits,amount_minor:o.amount_minor,currency:o.currency,status:o.status,refunded_minor:o.refunded_minor,created_at:o.created_at};}
function pageRows(rows:Row[],limit:number,project:(r:Row)=>unknown){const selected=rows.slice(0,limit);const last=selected.at(-1);return {items:selected.map(project),next_cursor:rows.length>limit&&last?`${new Date(last.created_at).toISOString()}|${last.id}`:null};}
function parameterFields(schema:z.AnyZodObject){return Object.entries(schema.shape).map(([name,field])=>{const optional=(field as z.ZodTypeAny).isOptional();let inner=field as z.ZodTypeAny;while(inner instanceof z.ZodOptional||inner instanceof z.ZodDefault)inner=inner._def.innerType;return {name,type:inner instanceof z.ZodEnum?'enum':'string',required:!optional,...(inner instanceof z.ZodEnum?{values:inner.options}:{})};});}
export function publicTools(){const profiles=models();return tools.map(t=>{const profile=profileForTool(t.tool_id,profiles);const available=generationEnabled()&&!!profile&&profile.max_images>=t.minimum_input_count&&profile.roles.includes('primary')&&(t.minimum_input_count===1||profile.roles.some(r=>r!=='primary'));
 return {tool_id:t.tool_id,name_ja:t.name_ja,name_zh:t.name_zh,category:t.category,tool_version:t.tool_version,minimum_input_count:t.minimum_input_count,maximum_input_count:Math.min(t.maximum_input_count,profile?.max_images??4),allowed_roles:profile?.roles??t.allowed_roles,prompt_id:t.default_prompt_id,prompt_version:1,evaluation_state:t.evaluation_state,available,unavailable_reason:available?null:!generationEnabled()?'GENERATION_DISABLED':'UNSUPPORTED_CAPABILITY',parameter_fields:parameterFields(t.parameters_schema),output_options:{qualities:profile?.qualities??[],aspect_ratios:profile?.aspect_ratios??[]},credit_cost:{standard:profile?.credits_standard??null,high:profile?.credits_high??null}};
 });}
async function imageFor(deps:Dependencies,userId:string,id:string,allowDeleted=false){const row=await deps.db.one('images',{id,owner_id:userId});if(!row||(!allowDeleted&&row.status==='deleted')||new Date(row.expires_at).getTime()<=deps.now().getTime())throw new ApiError('NOT_FOUND',404);return row;}
async function imageView(deps:Dependencies,row:Row){return {image_id:row.id,status:row.status,mime_type:row.mime_type??row.declared_mime,bytes:row.bytes??row.declared_bytes,width:row.width??null,height:row.height??null,preview_url:row.status==='ready'?await deps.storage.signGet(row.preview_key):null,expires_at:row.expires_at};}
async function rate(deps:Dependencies,userId:string,scope:string,limit:number){if(!await deps.db.rpc<boolean>('app_consume_rate_limit',{p_key:`${scope}:${userId}`,p_limit:limit,p_window_seconds:60}))throw new ApiError('RATE_LIMITED',429,true,60);}
async function webhook(deps:Dependencies,request:Request,id:string){
 const raw=await boundedBytes(request,512*1024);const signature=request.headers.get('stripe-signature');if(!signature)throw new ApiError('INVALID_SIGNATURE',400);
 const event=deps.payments.verifyEvent(raw,signature);const object=event.data?.object;
 if(typeof event.id!=='string'||!object)throw new ApiError('INVALID_SIGNATURE',400);
 const applied=!!await deps.db.one('stripe_events',{event_id:event.id});
 const refundEvents=['charge.refunded','charge.dispute.created','charge.refund.updated','refund.created','refund.updated','refund.failed'];
 if(applied&&(!deps.payments.listRefunds||!['checkout.session.completed','checkout.session.async_payment_succeeded',...refundEvents].includes(event.type)))return response({received:true},id);
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
 const session=await deps.payments.retrieveSession(object.id);
 if(session.payment_status==='paid'){
  if(session.mode!=='payment'||session.currency?.toUpperCase()!=='JPY'||!session.metadata?.order_id||!Id.safeParse(session.metadata.order_id).success)throw new ApiError('PAYMENT_MISMATCH',400);
  const order=await deps.db.one('orders',{id:session.metadata.order_id});
  const pi=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
  if(!order||session.metadata.user_id!==order.owner_id||session.amount_total!==order.amount_minor||!pi)throw new ApiError('PAYMENT_MISMATCH',400);
  if(!order.stripe_session_id){await deps.db.rpc('app_attach_checkout',{p_order_id:order.id,p_session_id:session.id,p_checkout_url:session.url??`${appOrigin()}/ja/billing/success?session_id=${encodeURIComponent(session.id)}`});}
  else if(session.id!==order.stripe_session_id)throw new ApiError('PAYMENT_MISMATCH',400);
  const intent=await deps.payments.retrievePaymentIntent(pi);
  const charge=typeof intent.latest_charge==='string'?await deps.payments.retrieveCharge(intent.latest_charge):intent.latest_charge;
  const chargePi=typeof charge?.payment_intent==='string'?charge.payment_intent:charge?.payment_intent?.id;
  if(intent.id!==pi||intent.status!=='succeeded'||!charge||chargePi!==pi||charge.amount!==order.amount_minor||charge.currency?.toUpperCase()!=='JPY'||!Number.isSafeInteger(charge.amount_refunded)||charge.amount_refunded<0||charge.amount_refunded>charge.amount||typeof charge.disputed!=='boolean')throw new ApiError('PAYMENT_MISMATCH',400);
  // Apply current refund/dispute facts inside the credit-grant transaction: no spendable intermediate balance.
  if(!applied)await deps.db.rpc('app_apply_paid_checkout',{p_event_id:event.id,p_order_id:order.id,p_session_id:session.id,p_payment_intent_id:pi,p_amount_minor:session.amount_total,p_currency:'JPY',p_amount_refunded:charge.amount_refunded,p_disputed:charge.disputed});
  if(deps.payments.listRefunds)await recordStripeRefundFacts(deps,{id:order.id,amount_minor:Number(order.amount_minor),currency:order.currency},charge.id,event.id,charge.amount_refunded);
 }
 }else if(refundEvents.includes(event.type)){
 const charge=await deps.payments.retrieveCharge(event.type==='charge.refunded'?object.id:typeof object.charge==='string'?object.charge:object.charge.id);
 const pi=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
 if(!pi)throw new ApiError('PAYMENT_MISMATCH',400);
 // Out-of-order refund preceding the paid event is retried until the order/payment mapping exists.
 const order=await deps.db.one('orders',{payment_intent_id:pi});if(!order)throw new ApiError('SERVICE_UNAVAILABLE',503,true);
 if(!applied)await deps.db.rpc('app_apply_payment_reversal',{p_event_id:event.id,p_payment_intent_id:pi,p_refunded_minor:charge.amount_refunded??0,p_dispute:event.type==='charge.dispute.created'});
 if(deps.payments.listRefunds)await recordStripeRefundFacts(deps,{id:order.id,amount_minor:Number(order.amount_minor),currency:order.currency},charge.id,event.id,charge.amount_refunded??0);
 }
 return response({received:true},id);
}
export function createRouter(deps:Dependencies){return async(request:Request):Promise<Response>=>{
 const id=requestId(request);
 try{
 const url=new URL(request.url);const path=url.pathname.replace(/\/$/,'');const method=request.method;
 if(path==='/api/health'&&method==='GET')return response({status:'ok',contract_version:CONTRACT_VERSION},id);
 if(path==='/api/tools'&&method==='GET')return response({tools:publicTools()},id);
 if(path==='/api/credit-packages'&&method==='GET'){const rows=await deps.db.packages();return response({packages:rows.map(p=>({package_id:p.id,credits:p.credits,amount_minor:p.amount_minor,currency:p.currency}))},id);}
 if(path==='/api/stripe/webhook'&&method==='POST')return await webhook(deps,request,id);
 const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer ')||authorization.length>8192)throw new ApiError('UNAUTHORIZED',401);
 const user=await deps.db.authenticate(authorization.slice(7));await rate(deps,user.id,'api',120);
 const consoleResponse=await consoleRoute(deps,request,user.id,id,()=>new Set(publicTools().filter(t=>t.available).map(t=>t.tool_id)));
 if(consoleResponse)return consoleResponse;
 const adminResponse=await adminAnalyticsRoute(deps,request,user.id,id,()=>publicTools().map(t=>({tool_id:t.tool_id,name:t.name_zh,category:t.category,available:t.available})));
 if(adminResponse)return adminResponse;
 const personalResponse=await personalConsoleRoute(deps,request,user.id,id);
 if(personalResponse)return personalResponse;
 if(path==='/api/me'&&method==='GET'){
 const [profile,account]=await Promise.all([deps.db.one('profiles',{id:user.id}),deps.db.one('credit_accounts',{owner_id:user.id})]);
 if(!profile||!account)throw new ApiError('SERVICE_UNAVAILABLE',503,true);
 return response({user_id:user.id,email:user.email??null,locale:'ja'},id);
 }
 if(path==='/api/credits'&&method==='GET'){const row=await deps.db.one('credit_accounts',{owner_id:user.id});if(!row)throw new ApiError('SERVICE_UNAVAILABLE',503,true);return response({available:row.available,reserved:row.reserved,status:row.status},id);}
 if(path==='/api/images/upload-url'&&method==='POST'){
 await rate(deps,user.id,'uploads',10);const body=await json(request,UploadRequest);const imageId=randomUUID();const key=`staging/${user.id}/${imageId}`;const expires=new Date(deps.now().getTime()+retentionDays()*86400000).toISOString();
 await deps.db.rpc('app_create_upload',{p_user_id:user.id,p_image_id:imageId,p_mime_type:body.mime_type,p_bytes:body.bytes,p_temp_key:key,p_expires_at:expires});
 return response({image_id:imageId,upload_url:await deps.storage.signPut(key,body.mime_type,body.bytes),expires_at:new Date(deps.now().getTime()+300000).toISOString(),required_headers:{'Content-Type':body.mime_type,'Content-Length':String(body.bytes)}},id,201);
 }
 if(path==='/api/images/complete'&&method==='POST'){
 await rate(deps,user.id,'complete',10);const body=await json(request,ImageCompleteRequest);let image=await imageFor(deps,user.id,body.image_id);
 if(image.status==='ready')return response(await imageView(deps,image),id);
 const source=await deps.storage.read(image.temp_key,20*1024*1024);if(source.bytes.length!==Number(image.declared_bytes))throw new ApiError('INVALID_REQUEST');
 const normalized=await normalizeImage(source.bytes,image.declared_mime);const key=`images/${user.id}/${image.id}/${normalized.sha256}.png`;const preview=`images/${user.id}/${image.id}/${normalized.sha256}-analysis.jpg`;
 await deps.storage.write(key,normalized.data,'image/png');await deps.storage.write(preview,normalized.preview,'image/jpeg');
 image=await deps.db.rpc('app_complete_upload',{p_user_id:user.id,p_image_id:image.id,p_storage_key:key,p_preview_key:preview,p_sha256:normalized.sha256,p_mime_type:'image/png',p_bytes:normalized.data.length,p_width:normalized.width,p_height:normalized.height});
 // Staging has a short lifecycle; losing this best-effort delete does not invalidate the fixed asset.
 try{await deps.storage.remove([image.temp_key]);}catch{}
 return response(await imageView(deps,image),id);
 }
 const imageMatch=path.match(/^\/api\/images\/([^/]+)(\/download)?$/);
 if(imageMatch){const imageId=Id.parse(imageMatch[1]);
 if(method==='DELETE'&&!imageMatch[2]){const image=await deps.db.rpc('app_delete_image',{p_user_id:user.id,p_image_id:imageId});let pending=true;
 try{await deps.storage.remove([image.temp_key,image.storage_key,image.preview_key].filter(Boolean));await deps.db.markCleanup(image.id,false);pending=false;}catch{}
 return response({image_id:imageId,status:'deleted',cleanup_pending:pending},id);
 }
 if(method==='GET'){const image=await imageFor(deps,user.id,imageId);if(imageMatch[2]){if(image.status!=='ready')throw new ApiError('IMAGE_NOT_READY',409);return response({download_url:await deps.storage.signGet(image.storage_key,true),expires_at:new Date(deps.now().getTime()+300000).toISOString()},id);}return response(await imageView(deps,image),id);}
 }
 if(path==='/api/edit'&&method==='POST'){
 const deviceHeader=request.headers.get('X-Picjp-Device');if(deviceHeader!==null)ConsoleDevice.parse(deviceHeader);
 await rate(deps,user.id,'edit',10);const body=await json(request,EditRequest);body.parameters=validateToolParameters(body.tool_id,body.parameters);const hash=requestHash(body);
 const previous=await deps.db.findJob(user.id,body.idempotency_key);if(previous){if(previous.request_hash!==hash)throw new ApiError('IDEMPOTENCY_CONFLICT',409);return response({job_id:previous.id,status:previous.status,credits_reserved:previous.credits_reserved,replayed:true},id,202);}
 if(!generationEnabled())throw new ApiError('GENERATION_DISABLED',503);
 const tool=getTool(body.tool_id);const profile=profileForTool(body.tool_id,models());
 if(!profile||body.inputs.length<tool.minimum_input_count||body.inputs.length>profile.max_images||!body.inputs.every(i=>profile.roles.includes(i.role))||!profile.qualities.includes(body.output.quality)||!profile.aspect_ratios.includes(body.output.aspect_ratio))throw new ApiError('UNSUPPORTED_CAPABILITY',409);
 if(['remove_person','remove_object'].includes(body.tool_id)&&!body.parameters.target&&!body.user_instruction.trim())throw new ApiError('INVALID_REQUEST');
 for(const input of body.inputs){const image=await imageFor(deps,user.id,input.image_id);if(image.status!=='ready')throw new ApiError('IMAGE_NOT_READY',409);}
 let snap;try{snap=snapshot(body,profile);}catch{throw new ApiError('INVALID_PROMPT');}
 const result=await deps.db.rpc(deviceHeader===null?'app_create_job':'app_console_create_job',{...(deviceHeader===null?{}:{p_device:deviceHeader}),p_user_id:user.id,p_idempotency_key:body.idempotency_key,p_request_hash:hash,p_inputs:body.inputs,p_snapshot:snap,p_reserved_credits:body.output.quality==='high'?profile.credits_high:profile.credits_standard,p_parent_job_id:body.parent_job_id??null});
 return response(result,id,202);
 }
 if((path==='/api/jobs'||path==='/api/orders')&&method==='GET'){
 const {limit,cursor}=Pagination.parse(Object.fromEntries(url.searchParams));const jobs=path==='/api/jobs';const rows=await deps.db.list(jobs?'edit_jobs':'orders',user.id,limit+1,cursor);
 return response(pageRows(rows,limit,jobs?jobView:orderView),id);
 }
 const jobMatch=path.match(/^\/api\/jobs\/([^/]+)(\/cancel)?$/);
 if(jobMatch){const jobId=Id.parse(jobMatch[1]);if(method==='POST'&&jobMatch[2]){const job=await deps.db.rpc('app_cancel_job',{p_user_id:user.id,p_job_id:jobId});return response(jobView(job),id);}
 if(method==='GET'&&!jobMatch[2]){const job=await deps.db.one('edit_jobs',{id:jobId,owner_id:user.id});if(!job)throw new ApiError('NOT_FOUND',404);return response(jobView(job),id);}}
 if(path==='/api/recommend'&&method==='POST'){
 await rate(deps,user.id,'recommend',10);const body=await json(request,RecommendRequest);const image=await imageFor(deps,user.id,body.image_id);if(image.status!=='ready')throw new ApiError('IMAGE_NOT_READY',409);
 const available=new Set(publicTools().filter(t=>t.available&&t.minimum_input_count<=1).map(t=>t.tool_id));
 const candidates=prompts.filter(p=>available.has(p.tool_id)).map(p=>p.recommendation);
 return response(await recommend(deps,image.preview_key,candidates,body.top_k,id),id);
 }
 if(path==='/api/checkout'&&method==='POST'){
 await rate(deps,user.id,'checkout',5);const body=await json(request,CheckoutRequest);
 let order=await deps.db.rpc('app_create_order',{p_user_id:user.id,p_package_id:body.package_id,p_idempotency_key:body.idempotency_key});
 if(!order.checkout_url){const session=await deps.payments.createCheckout(order,appOrigin());order=await deps.db.rpc('app_attach_checkout',{p_order_id:order.id,p_session_id:session.id,p_checkout_url:session.url});}
 return response({order_id:order.id,checkout_url:order.checkout_url},id);
 }
 throw new ApiError('NOT_FOUND',404);
 }catch(error){return failure(error,id);}
};}
