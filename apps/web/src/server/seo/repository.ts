import { SupabaseDatabase } from '../supabase';

const errorStatuses:Record<string,number>={SEO_FORBIDDEN:403,SEO_NOT_FOUND:404,SEO_SELF_REVIEW:403,SEO_REVISION_CONFLICT:409,SEO_IDEMPOTENCY_CONFLICT:409,SEO_UNAPPROVED_CONTENT:409,SEO_INVALID_TRANSITION:409,SEO_EVIDENCE_REQUIRED:400,SEO_INVALID_CONTENT:400,SEO_INVALID_DATA:400,SEO_INCOMPLETE_IMPORT:409,SEO_STALE_IMPORT:409,SEO_RATE_LIMITED:429,SEO_CONSENT_REQUIRED:401,SEO_INVALID_EVENT:400,SEO_INVALID_REQUEST:400};
export class SeoError extends Error { constructor(public code:string,public status=503){super(code);} }
export type SeoRpc = <T=unknown>(name:string,args:Record<string,unknown>)=>Promise<T>;
export function createSeoRpc(transport:typeof fetch=fetch):SeoRpc {
 return async<T>(name:string,args:Record<string,unknown>)=>{
  if(!/^seo_[a-z_]+$/.test(name))throw new SeoError('SEO_INVALID_RPC',400);
  const origin=process.env.SUPABASE_URL;const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!origin||!key)throw new SeoError('SEO_NOT_CONFIGURED');
  const endpoint=new URL(origin);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/')throw new SeoError('SEO_INVALID_CONFIGURATION');
  let response:Response;
  try{response=await transport(new URL(`/rest/v1/rpc/${name}`,endpoint),{method:'POST',headers:{apikey:key,...(!key.startsWith('sb_secret_')?{Authorization:`Bearer ${key}`} :{}),'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw new SeoError('SEO_UPSTREAM_UNAVAILABLE');}
  if(!response.ok){
   let message='';try{message=String((await response.json()).message??'');}catch{}
   const code=Object.keys(errorStatuses).find(code=>message.includes(code));throw new SeoError(code||'SEO_UPSTREAM_UNAVAILABLE',code?errorStatuses[code]:503);
  }
  if(response.status===204)return null as T;
  try{return await response.json() as T;}catch{throw new SeoError('SEO_INVALID_RESPONSE');}
 };
}
export async function authenticateSeoActor(request:Request,authenticate=(token:string)=>new SupabaseDatabase().authenticate(token)){
 const auth=request.headers.get('authorization');if(!auth?.startsWith('Bearer ')||auth.length<9)throw new SeoError('SEO_UNAUTHORIZED',401);
 try{return (await authenticate(auth.slice(7))).id;}catch{throw new SeoError('SEO_UNAUTHORIZED',401);}
}
export const seoRpc=createSeoRpc();
