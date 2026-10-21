import {
 AnalyticsQuery, AnalyticsViewQuery, AnalyticsExportQuery, AnalyticsReportResponse,
 ConsoleTelemetryConfig, Id,
} from '@picjp/contracts';
import { buildAnalyticsReport } from './analytics/engine';
import type { AnalyticsDataset } from './analytics/types';
import type { AnalyticsReport } from './analytics/report-types';
import type { Dependencies, Row } from './ports';
import { ApiError, json, response } from './errors';

type Snapshot={report_id:string;expires_at:string;dataset:AnalyticsDataset};
type Catalog=AnalyticsDataset['catalog'];
const financeExports=new Set(['orders','costs','ledger']);
const DAY=86400000;
function queryParams(url:URL){const keys=[...url.searchParams.keys()];if(new Set(keys).size!==keys.length)throw new ApiError('INVALID_REQUEST');return Object.fromEntries(url.searchParams);}
function requireFinance(snapshot:Snapshot){if(!snapshot.dataset.permissions.includes('finance:read'))throw new ApiError('FORBIDDEN',403);}
function validateWindow(q:AnalyticsQuery,now:Date){const start=Date.parse(q.start),end=Date.parse(q.end);if(start>=end||end>now.getTime()+1000||end-start>366*DAY||(q.bucket==='hour'&&end-start>31*DAY))throw new ApiError('INVALID_REQUEST');}
function build(snapshot:Snapshot,drill:{user_id?:string;tool_id?:string}){
 if(drill.user_id&&!snapshot.dataset.users.some(u=>u.id===drill.user_id))throw new ApiError('NOT_FOUND',404);
 if(drill.tool_id&&!snapshot.dataset.catalog.some(t=>t.tool_id===drill.tool_id)&&!snapshot.dataset.jobs.some(j=>j.tool_id===drill.tool_id))throw new ApiError('NOT_FOUND',404);
 return buildAnalyticsReport(snapshot.dataset,drill);
}
function sorted<T extends Record<string,any>>(rows:T[],sort:string,direction:string):T[]{
 const field=sort==='saved'?'saved_jobs':sort==='last_used'?'last_generated_at':sort;
 return [...rows].sort((a,b)=>{const av=a[field]??(field==='created_at'?a.occurred_at:field==='name'?a.name??a.cohort:undefined),bv=b[field]??(field==='created_at'?b.occurred_at:field==='name'?b.name??b.cohort:undefined);let value=0;
  if(av==null&&bv!=null)return 1;if(bv==null&&av!=null)return -1;
  if(typeof av==='number'&&typeof bv==='number')value=av-bv;else value=String(av??'').localeCompare(String(bv??''));
  return (direction==='asc'?value:-value)||String(a.user_id??a.tool_id??a.key??a.id??a.cohort??'').localeCompare(String(b.user_id??b.tool_id??b.key??b.id??b.cohort??''));
 });
}
function paginated(report:AnalyticsReport,view:ReturnType<typeof AnalyticsViewQuery.parse>){
 const {offset,limit,section,sort,direction}=view;
 const defaults:Record<string,'users'|'tools'|'versions'|'retention'|'orders'>={users:'users',tools:'tools',versions:'versions',retention:'retention',finance:'orders'};
 const table=view.table??defaults[section]??'jobs';
 const collections={users:report.users,tools:report.tools,versions:report.versions,retention:report.retention,jobs:report.jobs,orders:report.finance.orders,ledger:report.finance.ledger,costs:report.finance.costs,refunds:report.finance.refunds};
 function page<T extends Record<string,any>>(name:string,rows:T[]){const from=table===name?offset:0;return sorted(rows,sort,direction).slice(from,from+limit);}
 const result={...report,users:page('users',report.users),tools:page('tools',report.tools),versions:page('versions',report.versions),retention:page('retention',report.retention),jobs:page('jobs',report.jobs),
 finance:{...report.finance,orders:page('orders',report.finance.orders),ledger:page('ledger',report.finance.ledger),costs:page('costs',report.finance.costs),refunds:page('refunds',report.finance.refunds)}};
 return {report:result,pagination:{section,table,total:collections[table].length,offset,limit}};
}
/** All potentially spreadsheet-executable strings are quoted and neutralized. */
export function csvCell(value:unknown){let text=value===null||value===undefined?'':String(value);if(typeof value!=='number'&&/^[\s\uFEFF]*[=+\-@]/u.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function csv(snapshot:Snapshot,report:AnalyticsReport,section:string,drill:{user_id?:string;tool_id?:string}){
 const rows:Row[]=section==='users'?report.users.map(u=>({user_id:u.user_id,email:u.email_masked,registered_at:u.created_at,jobs:u.jobs,completed:u.completed,failed:u.failed,in_flight:u.in_flight,credits:u.credits,saved_jobs:u.saved_jobs,save_rate:u.save_rate.value,save_status:u.save_rate.status,last_generated_at:u.last_generated_at,lifetime_jobs:u.lifetime_jobs,last_30d_jobs:u.last_30d_jobs})):
 section==='tools'?report.tools.map(t=>({tool_id:t.tool_id,name:t.name,available:t.available,jobs:t.jobs,users:t.users,task_share:t.task_share.value,user_reach:t.user_reach.value,success:t.success.value,save_rate:t.save_rate.value,save_status:t.save_rate.status,credits:t.credits,latency_p95_ms:t.latency_p95_ms})):
 section==='orders'?report.finance.orders:section==='ledger'?report.finance.ledger:section==='costs'?report.finance.costs:report.jobs;
 if(rows.length>5000)throw new ApiError('QUERY_TOO_LARGE');
 const columns=rows.length?Object.keys(rows[0]):['record'];
 const metadata=[['report_id',snapshot.report_id],['as_of',report.meta.as_of],['metric_version',report.meta.metric_version],['filters',JSON.stringify(report.meta.query)],['drill',JSON.stringify(drill)],['section',section]].map(row=>row.map(csvCell).join(','));
 return '\uFEFF'+[...metadata,'',columns.map(csvCell).join(','),...rows.map(row=>columns.map(key=>csvCell(row[key])).join(','))].join('\r\n')+'\r\n';
}
export async function adminAnalyticsRoute(deps:Dependencies,request:Request,userId:string,requestId:string,catalog:()=>Catalog):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
 if(path==='/api/analytics/config'&&request.method==='GET'){
  const cfg=await deps.db.one('console_settings',{id:true});
  if(!cfg)throw new ApiError('SERVICE_UNAVAILABLE',503,true);
  return response(ConsoleTelemetryConfig.parse({environment:cfg.environment,collection_enabled:cfg.collection_enabled}),requestId);
 }
 if(path==='/api/admin/analytics/reports'&&request.method==='POST'){
  // Do not perform a large snapshot for an unauthorized request. SQL rechecks
  // permission transactionally and owns the authoritative audit record too.
  const q=await json(request,AnalyticsQuery);validateWindow(q,deps.now());
  const snapshot=await deps.db.rpc<Snapshot>('app_console_create_report',{p_user_id:userId,p_query:q,p_request_id:requestId,p_catalog:catalog()});
  const report=build(snapshot,{}),page=paginated(report,AnalyticsViewQuery.parse({}));
  const data=AnalyticsReportResponse.safeParse({report_id:snapshot.report_id,expires_at:snapshot.expires_at,...page});
  if(!data.success)throw new ApiError('SERVICE_UNAVAILABLE',503,true);
  return response(data.data,requestId,201);
 }
 const match=path.match(/^\/api\/admin\/analytics\/reports\/([^/]+)(\/export)?$/);
 if(!match||request.method!=='GET')return null;
 const reportId=Id.parse(match[1]);
 if(match[2]){
  const q=AnalyticsExportQuery.parse(queryParams(url));
  const snapshot=await deps.db.rpc<Snapshot>('app_console_read_report',{p_user_id:userId,p_report_id:reportId,p_request_id:requestId,p_action:'export'});
  if(financeExports.has(q.section))requireFinance(snapshot);
  await deps.db.rpc('app_console_authorize',{p_user_id:userId,p_permission:financeExports.has(q.section)?'finance:read':'analytics:read',p_request_id:requestId,p_action:'export',p_target_id:reportId,p_filter:q});
  const report=build(snapshot,q);
  return new Response(csv(snapshot,report,q.section,{...(q.user_id?{user_id:q.user_id}:{}),...(q.tool_id?{tool_id:q.tool_id}:{})}),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="picmoko-${q.section}-${reportId}.csv"`,'Cache-Control':'no-store','X-Request-ID':requestId,'X-Report-As-Of':report.meta.as_of,'X-Content-Type-Options':'nosniff'}});
 }
 const q=AnalyticsViewQuery.parse(queryParams(url));
 const snapshot=await deps.db.rpc<Snapshot>('app_console_read_report',{p_user_id:userId,p_report_id:reportId,p_request_id:requestId,p_action:q.section==='finance'||['orders','costs','refunds','ledger'].includes(q.table??'')?'finance_read':'analytics_read'});
 const report=build(snapshot,q),page=paginated(report,q);
 const data=AnalyticsReportResponse.safeParse({report_id:snapshot.report_id,expires_at:snapshot.expires_at,...page});
 if(!data.success)throw new ApiError('SERVICE_UNAVAILABLE',503,true);
 return response(data.data,requestId);
}
