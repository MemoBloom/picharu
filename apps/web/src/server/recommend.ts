import { createHmac,createHash } from 'node:crypto';
import sharp from 'sharp';
import { JevRequest,JevResponse,type RecommendationCandidate } from '@picjp/contracts';
import { catalogRevision } from '@picjp/prompts';
import type { Dependencies } from './ports';
import { ApiError } from './errors';
export async function recommend(deps:Dependencies,imageKey:string,candidates:RecommendationCandidate[],topK:number,requestId:string){
 const fallback=()=>({source:'fallback' as const,recommendations:candidates.slice(0,topK).map(c=>({prompt_id:c.prompt_id,prompt_version:c.prompt_version,tool_id:c.tool_id,name_ja:c.name_ja,score:null,reason_code:'POPULAR_FALLBACK'}))});
 if(!candidates.length||!process.env.JEV_BASE_URL||!process.env.JEV_SERVICE_SECRET)return fallback();
 try{
 const url=new URL('/v1/recommend',process.env.JEV_BASE_URL);
 if(url.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(url.hostname)))return fallback();
 const {bytes}=await deps.storage.read(imageKey,1024*1024);const meta=await sharp(bytes,{limitInputPixels:768*768}).metadata();
 if(meta.format!=='jpeg'||!meta.width||!meta.height)return fallback();
 const body=JSON.stringify(JevRequest.parse({contract_version:'1.0.0',request_id:requestId,catalog_revision:catalogRevision,image:{encoding:'base64',media_type:'image/jpeg',data:bytes.toString('base64'),width:meta.width,height:meta.height},candidates,top_k:topK}));
 if(Buffer.byteLength(body)>2*1024*1024)return fallback();
 const timestamp=String(Math.floor(deps.now().getTime()/1000));
 const signature=createHmac('sha256',process.env.JEV_SERVICE_SECRET).update(`POST\n/v1/recommend\n${timestamp}\n${createHash('sha256').update(body).digest('hex')}`).digest('hex');
 const response=await deps.fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Service-Timestamp':timestamp,'X-Service-Signature':signature},body,signal:AbortSignal.timeout(2500)});
 if(!response.ok||!response.body)return fallback();
 const chunks:Uint8Array[]=[];let n=0;const reader=response.body.getReader();
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>65536){await reader.cancel();throw new ApiError('SERVICE_UNAVAILABLE',503);}chunks.push(value);}}finally{reader.releaseLock();}
 const data=JevResponse.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
 if(data.request_id!==requestId||data.catalog_revision!==catalogRevision||data.recommendations.length===0||data.recommendations.length>topK||new Set(data.recommendations.map(r=>r.prompt_id)).size!==data.recommendations.length)return fallback();
 const items=data.recommendations.map(r=>{const c=candidates.find(c=>c.prompt_id===r.prompt_id&&c.prompt_version===r.prompt_version);if(!c)throw new Error('Invalid recommendation');return {...r,tool_id:c.tool_id,name_ja:c.name_ja};});
 return {source:'model' as const,model_version:data.model_version,recommendations:items};
 }catch{return fallback();}
}
