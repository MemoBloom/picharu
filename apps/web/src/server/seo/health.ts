import { z } from 'zod';
import { SeoPipelineHealth } from '@picjp/contracts';
import { matureWindow } from './calendar';
import type { SeoRpc } from './repository';

const State = z.enum(['pending','complete','empty','failed']);
const DayState = z.object({ source:z.enum(['gsc','ga4']),property:z.string().nullable(),grain:z.enum(['property','page','query_page','landing_event']),day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status:State.nullable(),created_at:z.string().nullable(),completed_at:z.string().nullable(),quality:z.record(z.unknown()).nullable(),
  successful_status:z.enum(['complete','empty']).nullable(),successful_at:z.string().nullable(),successful_quality:z.record(z.unknown()).nullable(),
}).strict();
export type HealthDay = z.infer<typeof DayState>;
type Options={now:number;fixture:boolean;gscProperty:string|null;ga4Property:string|null;ga4Timezone:string;staleHours?:number;pendingMinutes?:number};
export function pipelineHealth(input:unknown,options:Options):z.infer<typeof SeoPipelineHealth>{
  const rows=z.array(DayState).parse(input), sources:z.infer<typeof SeoPipelineHealth>['sources']=[];
  for(const source of ['gsc','ga4'] as const){
    const property=source==='gsc'?options.gscProperty:options.ga4Property;
    const timezone=source==='gsc'?'America/Los_Angeles':options.ga4Timezone,window=matureWindow(timezone,options.now);
    for(const grain of source==='gsc'?['property','page','query_page'] as const:['landing_event'] as const){
      const days=rows.filter(r=>r.source===source&&r.property===property&&r.grain===grain&&window.days.includes(r.day));
      // A duplicate or omitted SQL row is a quality failure, never implicit zero traffic.
      const validShape=days.length===7&&new Set(days.map(r=>r.day)).size===7;
      const success=days.filter(r=>r.successful_status!==null), missing=window.days.filter(day=>!success.some(r=>r.day===day));
      const alerts:z.infer<typeof SeoPipelineHealth>['sources'][number]['alerts']=[];
      const add=(code:typeof alerts[number]['code'],severity:typeof alerts[number]['severity'])=>{if(!alerts.some(a=>a.code===code))alerts.push({code,severity});};
      let status:typeof sources[number]['status']='ready';
      if(!property){status='not_configured';add('CONFIGURATION_REQUIRED','error');}
      else{
        if(!success.length){status='missing';add('NO_SUCCESSFUL_IMPORT','error');}
        if(missing.length||!validShape){status='missing';add('MISSING_DAYS','error');}
        if(days.some(r=>r.status==='failed')){status='failed';add('LATEST_IMPORT_FAILED','error');}
        const pending=days.filter(r=>r.status==='pending');
        if(pending.length){status='waiting';add('IMPORT_PENDING','info');}
        if(pending.some(r=>!r.created_at||!Number.isFinite(Date.parse(r.created_at))||options.now-Date.parse(r.created_at)>(options.pendingMinutes??30)*60000)){status='stalled';add('IMPORT_STALLED','error');}
        if(success.some(r=>!r.successful_at||!Number.isFinite(Date.parse(r.successful_at))||options.now-Date.parse(r.successful_at)>(options.staleHours??48)*3600000)){status=status==='ready'?'stale':status;add('STALE_IMPORT','warning');}
        if(success.some(r=>r.successful_quality?.limited===true)){status=status==='ready'?'limited':status;add('PARTIAL_RESULTS','warning');}
        if(success.some(r=>r.successful_quality?.subject_to_thresholding===true)){status=status==='ready'?'limited':status;add('THRESHOLDED','warning');}
        if(success.some(r=>r.successful_quality?.data_loss_from_other_row===true)){status=status==='ready'?'limited':status;add('OTHER_ROW_LOSS','warning');}
        if(status==='ready'&&success.length===7&&success.every(r=>r.successful_status==='empty'))status='empty';
      }
      sources.push({source,property,grain,from:window.from,to:window.to,timezone,status,expected_days:7,successful_days:success.length,missing_days:missing,alerts});
    }
  }
  const usable=(s:typeof sources[number])=>['ready','empty'].includes(s.status)&&!s.alerts.some(a=>a.severity==='error'||a.severity==='warning');
  return SeoPipelineHealth.parse({checked_at:new Date(options.now).toISOString(),is_fixture:options.fixture,healthy:sources.every(usable),can_suggest_search_changes:sources.filter(s=>s.source==='gsc'&&s.grain!=='query_page').every(usable),sources});
}
export async function readPipelineHealth(rpc:SeoRpc,fixture=false,now=Date.now()){
  const gscProperty=process.env.SEO_GSC_PROPERTY||'sc-domain:picmoko.com',ga4Property=/^\d+$/.test(process.env.SEO_GA4_PROPERTY_ID||'')?process.env.SEO_GA4_PROPERTY_ID!:null,ga4Timezone=process.env.SEO_GA4_TIME_ZONE||'Asia/Tokyo';
  const gsc=matureWindow('America/Los_Angeles',now),ga4=matureWindow(ga4Timezone,now);
  const rows=await rpc('seo_ingestion_health',{p_fixture:fixture,p_gsc_property:gscProperty,p_ga4_property:ga4Property,p_gsc_from:gsc.from,p_gsc_to:gsc.to,p_ga4_from:ga4.from,p_ga4_to:ga4.to});
  return pipelineHealth(rows,{now,fixture,gscProperty,ga4Property,ga4Timezone});
}
