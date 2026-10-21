import { randomUUID,createHash } from 'node:crypto';
import { MetricWindow } from '../../apps/web/src/server/seo/metrics';
import type { SeoRpc } from '../../apps/web/src/server/seo/repository';

export async function importWindow(rpc:SeoRpc,input:unknown,id=randomUUID()){
 const window=MetricWindow.parse(input);
 const fingerprint=createHash('sha256').update(JSON.stringify(window)).digest('hex');
 await rpc('seo_ingest_begin',{p_id:id,p_source:window.source,p_property:window.property,p_day:window.day,p_grain:window.grain,p_fixture:window.is_fixture,p_quality:{...window.quality,input_sha256:fingerprint}});
 let batches=0;
 try{
  for(let at=0;at<window.rows.length;at+=500){await rpc('seo_ingest_stage',{p_id:id,p_batch:batches,p_rows:window.rows.slice(at,at+500)});batches++;}
  return await rpc('seo_ingest_finish',{p_id:id,p_batches:batches,p_error:null});
 }catch(error){
  // Never pass upstream exception text: it can contain URLs, tokens or sensitive payloads.
  const recovered=await rpc<{status:string}>('seo_ingest_finish',{p_id:id,p_batches:batches,p_error:'IMPORT_FAILED'}).catch(()=>null);
  if(recovered?.status==='complete'||recovered?.status==='empty')return recovered;
  throw new Error('SEO_IMPORT_FAILED');
 }
}
