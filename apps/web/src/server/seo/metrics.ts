import { z } from 'zod';
import { SeoPath } from '@picjp/contracts';

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);
export const MetricRow=z.object({dimensions:z.record(z.string().max(500)).refine(d=>Object.keys(d).every(k=>['page','query','country','device','channel','event','locale','location','provider','term_type','topic_id'].includes(k)),'Unexpected dimension'),measures:z.record(z.number().finite().nonnegative().nullable()).refine(m=>Object.keys(m).every(k=>['clicks','impressions','position','events','users','sessions','rank','volume','volume_lower','volume_upper','trend','trend_upper_bound'].includes(k)),'Unexpected measure')}).strict().superRefine((r,c)=>{
 if(r.measures.volume_lower!=null&&r.measures.volume_upper!=null&&r.measures.volume_lower>r.measures.volume_upper)c.addIssue({code:'custom',message:'Inverted volume range'});
 if(r.measures.clicks!=null&&r.measures.impressions!=null&&r.measures.clicks>r.measures.impressions)c.addIssue({code:'custom',message:'Clicks exceed impressions'});
 if(r.dimensions.query&&(/@|token|https?:\/\//i.test(r.dimensions.query)))c.addIssue({code:'custom',message:'Sensitive query excluded'});
 if(r.dimensions.page&&!SeoPath.safeParse(r.dimensions.page).success)c.addIssue({code:'custom',message:'Only sanitized landing paths'});
});
export const MetricWindow=z.object({source:z.enum(['gsc','ga4','serp','keyword_planner','trends']),property:z.string().min(1).max(500),day:date,grain:z.string().min(1).max(100),is_fixture:z.boolean(),quality:z.record(z.unknown()),rows:z.array(MetricRow).max(100000)}).strict();
export type MetricWindow=z.infer<typeof MetricWindow>;
export type MetricRow=z.infer<typeof MetricRow>;
export function aggregateSearch(rows:MetricRow[]){
 const impressions=rows.reduce((n,r)=>n+(r.measures.impressions??0),0);const clicks=rows.reduce((n,r)=>n+(r.measures.clicks??0),0);
 const knownPosition=rows.every(r=>(r.measures.impressions??0)===0||r.measures.position!=null);
 const weighted=rows.reduce((n,r)=>n+(r.measures.position??0)*(r.measures.impressions??0),0);
 return {impressions,clicks,ctr:impressions?clicks/impressions:null,position:impressions&&knownPosition?weighted/impressions:null};
}
export function opportunities(rows:MetricRow[],minimumImpressions=300){
 const groups=new Map<string,MetricRow[]>();for(const row of rows){const path=row.dimensions.page;if(!path)continue;groups.set(path,[...(groups.get(path)||[]),row]);}
 return [...groups].map(([path,rows])=>({path,...aggregateSearch(rows)})).filter(row=>row.impressions>=minimumImpressions&&row.position!==null&&row.position>=4&&row.position<=20).map(row=>({...row,reason:'PAGE_WITH_SEARCH_EXPOSURE',confidence:'heuristic_not_significance',suggestion:'Review intent, title, examples and internal links; check product availability before editing.'}));
}
