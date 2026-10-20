import { readFile,stat } from 'node:fs/promises';
import { createSeoRpc } from '../../apps/web/src/server/seo/repository';
import { googleReports,collectGscDay,collectGa4Day } from './google';
import { researchWindows } from './research';
import { importWindow } from './import';
import { deliverBusinessEvents } from './delivery';
import { backfill } from './backfill';
import { matureWindow } from './schedule';
import { readPipelineHealth } from '../../apps/web/src/server/seo/health';
import { collectRank,RankTarget } from './ranking';
async function main(){
 const [source,arg,end]=process.argv.slice(2);
 if(source==='--help'){console.log('SEO collector: gsc|ga4 FROM [TO]; daily; health [--fixture]; reconcile; deliver; import FILE; research CSV CONFIG_JSON; rank FILE DAY --allow-paid-requests. Environment and ADC are required; no secrets are printed.');return;}
 const rpc=createSeoRpc();
 if(source==='health'){const health=await readPipelineHealth(rpc,process.argv.includes('--fixture'));console.log(JSON.stringify(health));if(!health.healthy)process.exitCode=1;return;}
 if(source==='daily'){
  if(process.env.SEO_COLLECTION_ENABLED!=='true')throw new Error('COLLECTION_DISABLED');
  const client=googleReports();
  const gsc=matureWindow('America/Los_Angeles'),ga4=matureWindow(process.env.SEO_GA4_TIME_ZONE||'Asia/Tokyo');
  const property=process.env.SEO_GSC_PROPERTY||'sc-domain:picmoko.com',ga4Property=process.env.SEO_GA4_PROPERTY_ID||'';
  const a=await backfill(rpc,'gsc',property,gsc.from,gsc.to,day=>collectGscDay(client,property,day));
  const b=await backfill(rpc,'ga4',ga4Property,ga4.from,ga4.to,async day=>[await collectGa4Day(client,ga4Property,day)]);
  console.log(JSON.stringify({gsc:a,ga4:b}));if([...a,...b].some(row=>row.status==='failed'))process.exitCode=1;return;
 }
 if(source==='reconcile'){console.log(JSON.stringify(await rpc('seo_reconcile_business',{p_limit:100})));return;}
 if(source==='deliver'){console.log(JSON.stringify(await deliverBusinessEvents(rpc,process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID||'',process.env.SEO_GA4_MEASUREMENT_API_SECRET||'')));return;}
 if(source==='research'){
  if(!arg||!end||(await stat(arg)).size>5242880||(await stat(end)).size>65536)throw new Error('RESEARCH_INPUT_REQUIRED');
  const windows=researchWindows(await readFile(arg),JSON.parse(await readFile(end,'utf8')));
  for(const window of windows)console.log(JSON.stringify({source:window.source,day:window.day,result:await importWindow(rpc,window)}));return;
 }
 if(source==='import'){
  if(!arg)throw new Error('INPUT_FILE_REQUIRED');const input=JSON.parse(await readFile(arg,'utf8'));const rows=Array.isArray(input)?input:[input];
  for(const window of rows)console.log(JSON.stringify({source:window.source,result:await importWindow(rpc,window)}));return;
 }
 if(source==='rank'){
  if(process.env.SEO_RANK_API_ENABLED!=='true'||!process.argv.includes('--allow-paid-requests'))throw new Error('RANK_REQUIRES_EXPLICIT_OPT_IN');
  const targets=JSON.parse(await readFile(arg,'utf8'));if(!Array.isArray(targets)||targets.length>20)throw new Error('RANK_LIMIT_20_TARGETS');
  const inputs=targets.map(target=>RankTarget.parse(target));
  for(const target of inputs){const window=await collectRank(target,end,process.env.SEO_SERPAPI_KEY||'');console.log(JSON.stringify({source:'serp',result:await importWindow(rpc,window)}));}return;
 }
 if(!['gsc','ga4'].includes(source)||!/^\d{4}-\d{2}-\d{2}$/.test(arg||''))throw new Error('USAGE_COLLECT_SOURCE_YYYY_MM_DD');
 const client=googleReports();
 const property=source==='gsc'?process.env.SEO_GSC_PROPERTY||'sc-domain:picmoko.com':process.env.SEO_GA4_PROPERTY_ID||'';
 const collect=async(day:string)=>source==='gsc'?collectGscDay(client,property,day):[await collectGa4Day(client,property,day)];
 const results=await backfill(rpc,source as 'gsc'|'ga4',property,arg,end||arg,collect);
 console.log(JSON.stringify({source,results}));if(results.some(row=>row.status==='failed'))process.exitCode=1;
}
main().catch(()=>{console.error(JSON.stringify({status:'failed',code:'SEO_COLLECTION_FAILED',help:'Check ADC identity, property permission, date, database migration and environment; credentials are never logged.'}));process.exitCode=1;});
