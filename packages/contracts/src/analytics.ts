import { z } from 'zod';
import { ConsoleEnvironment, ConsoleDevice } from './console';
const Id=z.string().uuid();
const Time=z.string().datetime({offset:true});
const Count=z.number().int().nonnegative().safe();
const Integer=z.number().int().safe();
const Nullable=z.number().finite().nullable();
const Key=z.string().min(1).max(128);
const ToolKey=z.string().regex(/^[a-z][a-z0-9_]{0,99}$/);
export const AnalyticsQuery=z.object({
 start:Time,end:Time,timezone:z.string().min(1).max(64).refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}},'Invalid timezone').default('Asia/Tokyo'),
 bucket:z.enum(['hour','day','week']).default('day'),environment:ConsoleEnvironment,
 internal:z.enum(['exclude','include','only']).default('exclude'),
 tool_id:ToolKey.optional(),category:Key.optional(),model_id:Key.optional(),adapter_version:Key.optional(),
 prompt_id:Key.optional(),prompt_version:z.coerce.number().int().positive().optional(),tool_version:z.coerce.number().int().positive().optional(),device:ConsoleDevice.optional(),
 cohort:z.enum(['all','new','returning','paid','unpaid','light','heavy']).default('all'),
}).strict();
export type AnalyticsQuery=z.infer<typeof AnalyticsQuery>;
export const AnalyticsSection=z.enum(['overview','users','tools','funnel','retention','versions','finance','data-quality']);
export const AnalyticsTable=z.enum(['users','tools','versions','retention','jobs','orders','ledger','costs','refunds']);
export const AnalyticsExportSection=z.enum(['users','tools','jobs','orders','ledger','costs']);
export const AnalyticsViewQuery=z.object({
 section:AnalyticsSection.default('overview'),table:AnalyticsTable.optional(),offset:z.coerce.number().int().min(0).max(20000).default(0),
 limit:z.coerce.number().int().min(1).max(100).default(25),sort:z.enum(['jobs','credits','saved','last_used','created_at','name']).default('jobs'),
 direction:z.enum(['asc','desc']).default('desc'),user_id:Id.optional(),tool_id:ToolKey.optional(),
}).strict();
export const AnalyticsExportQuery=z.object({section:AnalyticsExportSection.default('users'),user_id:Id.optional(),tool_id:ToolKey.optional()}).strict();
export const AnalyticsMetricId=z.enum(['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22','M23','M24']);
export const AnalyticsMetricStatus=z.enum(['ready','no_sample','immature','not_collected','incomplete','by_dimension','forbidden','unsupported_filters']);
export const AnalyticsMetric=z.object({id:AnalyticsMetricId,value:Nullable,numerator:Nullable,denominator:Nullable,sample_size:Count,
 unit:z.enum(['count','ratio','credits','milliseconds','minor','per_user']),status:AnalyticsMetricStatus,reason:z.string().nullable(),coverage_start:Time.nullable(),auxiliary:z.record(z.number().finite())}).strict();
export const AnalyticsMoney=z.object({currency:z.string().regex(/^[A-Z]{3}$/),paid_minor:Integer,refunded_minor:Integer.nullable(),net_minor:Integer.nullable(),refund_status:z.enum(['ready','not_collected','incomplete']),
 provider_report_minor:Integer,invoice_minor:Integer,known_cost_minor:Integer,estimated_minor:Integer,estimated_pending_minor:Integer}).strict();
export const AnalyticsUsageRow=z.object({user_id:Id,email_masked:z.string().nullable(),created_at:Time,account_status:z.string(),available:Count,reserved:Count,
 jobs:Count,completed:Count,failed:Count,cancelled:Count,in_flight:Count,tools:Count,credits:Count,saved_jobs:Count.nullable(),save_rate:AnalyticsMetric,
 lifetime_jobs:Count.nullable(),last_30d_jobs:Count.nullable(),history_complete:z.boolean(),last_generated_at:Time.nullable(),last_product_event_at:Time.nullable(),currencies:z.array(AnalyticsMoney)}).strict();
export const AnalyticsToolRow=z.object({tool_id:ToolKey,name:z.string(),category:z.string(),available:z.boolean(),jobs:Count,users:Count,
 task_share:AnalyticsMetric,user_reach:AnalyticsMetric,success:AnalyticsMetric,save_rate:AnalyticsMetric,view_rate:AnalyticsMetric,feedback:AnalyticsMetric,continued_edit:AnalyticsMetric,
 credits:Count,latency_p50_ms:Nullable,latency_p95_ms:Nullable}).strict();
export const AnalyticsVersionRow=z.object({key:z.string(),tool_id:ToolKey,model_id:z.string().nullable(),adapter_version:z.string().nullable(),prompt_id:z.string().nullable(),prompt_version:Count.nullable(),tool_version:Count.nullable(),
 first_seen_at:Time,last_seen_at:Time,jobs:Count,users:Count,success:AnalyticsMetric,save_rate:AnalyticsMetric,feedback:AnalyticsMetric,latency_p50_ms:Nullable,latency_p95_ms:Nullable}).strict();
export const AnalyticsTrendRow=z.object({bucket:z.string(),jobs:Count,users:Count,new_users:Count.nullable(),completed:Count,failed:Count,cancelled:Count,in_flight:Count,credits:Count,saved_users:Count.nullable(),saved_jobs:Count.nullable(),save_status:AnalyticsMetricStatus,
 tools:z.record(Count),success:AnalyticsMetric,save_rate:AnalyticsMetric,latency_p50_ms:Nullable,latency_p95_ms:Nullable,currencies:z.array(AnalyticsMoney)}).strict();
export const AnalyticsRetentionRow=z.object({cohort:z.string(),users:Count,d1:AnalyticsMetric,d7:AnalyticsMetric,w1:AnalyticsMetric}).strict();
export const AnalyticsFunnelStep=z.object({key:z.string(),users:Count.nullable(),status:AnalyticsMetricStatus,reason:z.string().nullable(),numerator:Nullable,denominator:Nullable,conversion:Nullable}).strict();
export const AnalyticsJobRow=z.object({id:Id,user_id:Id,tool_id:ToolKey,status:z.string(),stage:z.string(),created_at:Time,completed_at:Time.nullable(),error_code:z.string().nullable(),model_id:z.string().nullable(),adapter_version:z.string().nullable(),prompt_id:z.string().nullable(),prompt_version:Count.nullable(),tool_version:Count.nullable()}).strict();
export const AnalyticsReport=z.object({
 meta:z.object({metric_version:z.string(),as_of:Time,query:AnalyticsQuery,previous_window:z.object({start:Time,end:Time}).strict(),coverage_start:Time.nullable(),warnings:z.array(z.string()),cohort_definitions:z.record(z.string())}).strict(),
 metrics:z.array(AnalyticsMetric).length(24),previous_metrics:z.array(AnalyticsMetric).length(24),users:z.array(AnalyticsUsageRow),tools:z.array(AnalyticsToolRow),versions:z.array(AnalyticsVersionRow),trend:z.array(AnalyticsTrendRow),
 version_trends:z.array(z.object({key:z.string(),trend:z.array(AnalyticsTrendRow)}).strict()),
 version_releases:z.array(z.object({key:z.string(),released_at:Time,scope:z.enum(['all_users','limited_rollout','internal_only'])}).strict()),
 user_usage_ranking:z.object({top:z.array(z.object({user_id:Id,email_masked:z.string().nullable(),jobs:Count}).strict()).max(15),other_jobs:Count,other_users:Count}).strict(),
 heatmap:z.array(z.object({user_id:Id,date:z.string(),jobs:Count}).strict()),distribution:z.array(z.object({bucket:z.string(),users:Count}).strict()),retention:z.array(AnalyticsRetentionRow),
 funnel:z.object({user_steps:z.array(AnalyticsFunnelStep),job_steps:z.array(AnalyticsFunnelStep)}).strict(),segments:z.array(z.object({key:z.string(),users:Count,jobs:Count}).strict()),
 finance:z.object({budgets:z.array(z.object({provider:z.string(),model_id:z.string(),adapter_version:z.string(),currency:z.string(),reserved_minor:Integer,committed_minor:Integer,limit_minor:Integer,enabled:z.boolean(),scope:z.literal('global_current')}).strict()),status:AnalyticsMetricStatus,currencies:z.array(AnalyticsMoney),unknown_cost_attempts:Count,estimated_cost_attempts:Count,
 costs:z.array(z.object({attempt_id:Id,job_id:Id,user_id:Id,provider:z.string(),model_id:z.string(),adapter_version:z.string(),created_at:Time,state:z.string(),currency:z.string().nullable(),amount_minor:Integer.nullable(),evidence:z.string().nullable(),estimated_currency:z.string().nullable(),estimated_amount_minor:Integer.nullable()}).strict()),
 refunds:z.array(z.object({id:z.string(),order_id:Id,user_id:Id,occurred_at:Time,amount_minor:Integer,currency:z.string(),status:z.string()}).strict()),
 orders:z.array(z.object({id:Id,user_id:Id,created_at:Time,paid_at:Time.nullable(),status:z.string(),currency:z.string().nullable(),amount_minor:Integer.nullable()}).strict()),
 ledger:z.array(z.object({id:Id,user_id:Id,kind:z.string(),available_delta:Integer,reserved_delta:Integer,created_at:Time,job_id:Id.nullable()}).strict())}).strict(),
 operations:z.object({status_counts:z.record(Count),error_counts:z.array(z.object({code:z.string(),jobs:Count}).strict()),oldest_queued_ms:Nullable,event_delay_p95_ms:Nullable,uncertain_client_events:Count,cleanup_pending:Count,cleanup_retrying:Count,unresolved_downloads:Count,finance_gaps:Count,
 issues:z.array(z.object({code:z.string(),severity:z.enum(['info','warning','critical']),count:Count,message:z.string()}).strict())}).strict(),jobs:z.array(AnalyticsJobRow),
}).strict();
export type AnalyticsReport=z.infer<typeof AnalyticsReport>;
export const AnalyticsReportResponse=z.object({report_id:Id,expires_at:Time,report:AnalyticsReport,pagination:z.object({section:AnalyticsSection,table:AnalyticsTable,total:Count,offset:Count,limit:Count}).strict()}).strict();
export const ConsoleTelemetryConfig=z.object({collection_enabled:z.boolean(),environment:ConsoleEnvironment}).strict();

export type ConsoleTelemetryConfig=z.infer<typeof ConsoleTelemetryConfig>;
