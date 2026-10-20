import { GoogleAuth } from 'google-auth-library';
import { MetricWindow,type MetricRow } from '../../apps/web/src/server/seo/metrics';
import { isPrivatePath,normalizePublicPath } from '../../apps/web/src/lib/seo';
export interface GoogleReports { post(url:string,body:unknown):Promise<any> }
export function googleReports():GoogleReports {
 const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/webmasters.readonly','https://www.googleapis.com/auth/analytics.readonly']});
 return {post:async(url,data)=>{
  const endpoint=new URL(url);if(!['www.googleapis.com','analyticsdata.googleapis.com','bigquery.googleapis.com'].includes(endpoint.hostname)||endpoint.protocol!=='https:')throw new Error('UNTRUSTED_GOOGLE_ENDPOINT');
  const client=await auth.getClient();const response=await client.request({url,method:'POST',data,timeout:30000});return response.data;
 }};
}
export async function collectGscDay(client:GoogleReports,property:string,day:string,limit=25000,maxRows=100000){
 MetricWindow.shape.day.parse(day);
 if(!/^(sc-domain:[a-z0-9.-]+|https:\/\/[a-z0-9.-]+\/)$/i.test(property))throw new Error('INVALID_GSC_PROPERTY');
 if(limit<1||limit>25000||maxRows<limit)throw new Error('INVALID_PAGE_LIMIT');
 const grains=[{grain:'property',dimensions:[]},{grain:'page',dimensions:['page','country','device']},{grain:'query_page',dimensions:['page','query','country','device']}];
 const windows=[];
 for(const g of grains){
  const rows:MetricRow[]=[];let startRow=0,dropped=0,limited=false;const seen=new Set<string>();
  while(true){
   const result=await client.post(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,{startDate:day,endDate:day,type:'web',dataState:'final',dimensions:g.dimensions,rowLimit:limit,startRow});
   if(!Array.isArray(result.rows)&&result.rows!==undefined)throw new Error('INVALID_GSC_RESPONSE');
   const batch=result.rows||[];
   for(const row of batch){
    if(g.dimensions.length&&(!Array.isArray(row.keys)||row.keys.length!==g.dimensions.length))throw new Error('INVALID_GSC_DIMENSIONS');
    const dimensions=Object.fromEntries(g.dimensions.map((name,i)=>[name,String(row.keys[i])]));
    const rawKey=JSON.stringify(dimensions);if(seen.has(rawKey))throw new Error('REPEATED_GSC_PAGE');seen.add(rawKey);
    if(dimensions.page){const u=new URL(dimensions.page);const clean=normalizePublicPath(u.pathname);if(!['picmoko.com','www.picmoko.com'].includes(u.hostname)||u.username||u.password||!clean||isPrivatePath(clean)||!/^\/ja(?:\/|$)/.test(clean)){dropped++;continue;}dimensions.page=clean;}
    if(dimensions.country)dimensions.country=dimensions.country==='jpn'?'JP':dimensions.country.toUpperCase();
    if(dimensions.device)dimensions.device=dimensions.device.toLowerCase();
    if(dimensions.query&&(/@|token|https?:\/\//i.test(dimensions.query)||dimensions.query.length>500)){dropped++;continue;}

    const parsed=MetricWindow.shape.rows.element.parse({dimensions,measures:{clicks:row.clicks,impressions:row.impressions,position:row.position}});rows.push(parsed);
   }
   if(batch.length<limit)break;
   startRow+=batch.length;if(startRow>=maxRows){limited=true;break;}
  }
  const merged=new Map<string,MetricRow>();
  for(const row of rows){const key=JSON.stringify(row.dimensions),prior=merged.get(key);if(!prior){merged.set(key,row);continue;}
   const impressions=(prior.measures.impressions||0)+(row.measures.impressions||0);
   prior.measures.position=impressions?((prior.measures.position||0)*(prior.measures.impressions||0)+(row.measures.position||0)*(row.measures.impressions||0))/impressions:null;
   prior.measures.impressions=impressions;prior.measures.clicks=(prior.measures.clicks||0)+(row.measures.clicks||0);
  }
  windows.push(MetricWindow.parse({source:'gsc',property,day,grain:g.grain,is_fixture:false,quality:{source_timezone:'America/Los_Angeles',data_state:'final',all_rows_guaranteed:false,limited,dropped_rows:dropped},rows:[...merged.values()]}));
 }
 return windows;
}
export async function collectGa4Day(client:GoogleReports,property:string,day:string,limit=10000,maxRows=100000){
 MetricWindow.shape.day.parse(day);
 if(!/^\d+$/.test(property))throw new Error('INVALID_GA4_PROPERTY_ID');
 if(!Number.isInteger(limit)||limit<1||limit>10000||maxRows<limit||maxRows>100000)throw new Error('INVALID_PAGE_LIMIT');
 const rows:MetricRow[]=[];let offset=0,limited=false,dropped=0;let metadata:Record<string,unknown>={};
 const dimensions=['date','landingPagePlusQueryString','sessionDefaultChannelGroup','deviceCategory','countryId','eventName'];
 const metrics=['eventCount','totalUsers','sessions'];
 while(true){
  const response=await client.post(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,{dateRanges:[{startDate:day,endDate:day}],dimensions:dimensions.map(name=>({name})),metrics:metrics.map(name=>({name})),limit,offset});
  metadata=response.metadata||{};
  if(response.dimensionHeaders?.map((x:any)=>x.name).join(',')!==dimensions.join(',')||response.metricHeaders?.map((x:any)=>x.name).join(',')!==metrics.join(','))throw new Error('INVALID_GA4_HEADERS');
  const batch=response.rows||[];if(response.rowCount===undefined&&!batch.length)response.rowCount=0;if(!Number.isInteger(response.rowCount)||response.rowCount<0)throw new Error('INVALID_GA4_ROW_COUNT');if(!Array.isArray(batch))throw new Error('INVALID_GA4_RESPONSE');
  for(const row of batch){
   if(row.dimensionValues?.length!==6||row.metricValues?.length!==3)throw new Error('INVALID_GA4_DIMENSIONS');
   const d=row.dimensionValues.map((x:any)=>String(x.value));if(d[0]!==day.replaceAll('-',''))throw new Error('INVALID_GA4_DAY');const path=normalizePublicPath(d[1]);
   if(!path||!/^\/ja(?:\/|$)/.test(path)||isPrivatePath(path)){dropped++;continue;}
   rows.push(MetricWindow.shape.rows.element.parse({dimensions:{page:path,channel:d[2],device:d[3],country:d[4],event:d[5]},measures:{events:Number(row.metricValues[0].value),users:Number(row.metricValues[1].value),sessions:Number(row.metricValues[2].value)}}));
  }
  if(!batch.length&&offset<response.rowCount)throw new Error('INCOMPLETE_GA4_RESPONSE');
  offset+=batch.length;if(batch.length<limit||offset>=Number(response.rowCount))break;
  if(offset>=maxRows){limited=true;break;}
 }
 // Query-string variants collapse to the same sanitized landing page; combine event counts, never sum non-additive users/sessions.
 const merged=new Map<string,MetricRow>();for(const row of rows){const key=JSON.stringify(row.dimensions);const previous=merged.get(key);if(previous){previous.measures.events=(previous.measures.events||0)+(row.measures.events||0);previous.measures.users=null;previous.measures.sessions=null;}else merged.set(key,row);}
 return MetricWindow.parse({source:'ga4',property,day,grain:'landing_event',is_fixture:false,quality:{source_timezone:metadata.timeZone||'unknown',finality:'not_guaranteed',subject_to_thresholding:metadata.subjectToThresholding||false,data_loss_from_other_row:metadata.dataLossFromOtherRow||false,limited,dropped_rows:dropped,non_additive_users_sessions:true},rows:[...merged.values()]});
}
