import type {AnalyticsMetric, AnalyticsQuery, MetricStatus} from './types';

export type Money = {currency: string; paid_minor: number; refunded_minor: number | null; net_minor: number | null; refund_status: 'ready' | 'not_collected' | 'incomplete';
  provider_report_minor: number; invoice_minor: number; known_cost_minor: number;
  estimated_minor: number; estimated_pending_minor: number};
export type UsageRow = {
  user_id: string; email_masked: string | null; created_at: string; account_status: string;
  available: number; reserved: number; jobs: number; completed: number; failed: number;
  cancelled: number; in_flight: number; tools: number; credits: number; saved_jobs: number | null;
  save_rate: AnalyticsMetric; lifetime_jobs: number | null; last_30d_jobs: number | null; history_complete: boolean;
  last_generated_at: string | null; last_product_event_at: string | null; currencies: Money[];
};
export type ToolRow = {
  tool_id: string; name: string; category: string; available: boolean; jobs: number; users: number;
  task_share: AnalyticsMetric; user_reach: AnalyticsMetric; success: AnalyticsMetric;
  save_rate: AnalyticsMetric; view_rate: AnalyticsMetric; feedback: AnalyticsMetric;
  continued_edit: AnalyticsMetric; credits: number; latency_p50_ms: number | null; latency_p95_ms: number | null;
};
export type VersionRow = {
  key: string; tool_id: string; model_id: string | null; adapter_version: string | null;
  prompt_id: string | null; prompt_version: number | null; tool_version: number | null;
  first_seen_at: string; last_seen_at: string; jobs: number; users: number;
  success: AnalyticsMetric; save_rate: AnalyticsMetric; feedback: AnalyticsMetric;
  latency_p50_ms: number | null; latency_p95_ms: number | null;
};
export type TrendRow = {bucket: string; jobs: number; users: number; new_users: number | null;
  completed: number; failed: number; cancelled: number; in_flight: number; credits: number;
  saved_users: number | null; saved_jobs: number | null; save_status: MetricStatus; tools: Record<string, number>;
  success: AnalyticsMetric; save_rate: AnalyticsMetric; latency_p50_ms: number | null; latency_p95_ms: number | null;
  currencies: Money[]};
export type RetentionRow = {cohort: string; users: number; d1: AnalyticsMetric; d7: AnalyticsMetric; w1: AnalyticsMetric};
export type FunnelStep = {key: string; users: number | null; status: MetricStatus; reason: string | null;
  numerator: number | null; denominator: number | null; conversion: number | null};
export type AnalyticsReport = {
  meta: {metric_version: string; as_of: string; query: AnalyticsQuery; previous_window: {start: string; end: string};
    coverage_start: string | null; warnings: string[]; cohort_definitions: Record<string, string>};
  metrics: AnalyticsMetric[]; previous_metrics: AnalyticsMetric[];
  users: UsageRow[]; tools: ToolRow[]; versions: VersionRow[]; trend: TrendRow[];
  version_trends:{key:string;trend:TrendRow[]}[];
  version_releases:{key:string;released_at:string;scope:string}[];
  user_usage_ranking: {top:{user_id:string;email_masked:string|null;jobs:number}[];other_jobs:number;other_users:number};
  heatmap: {user_id: string; date: string; jobs: number}[];
  distribution: {bucket: string; users: number}[];
  retention: RetentionRow[]; funnel: {user_steps: FunnelStep[]; job_steps: FunnelStep[]};
  segments: {key: string; users: number; jobs: number}[];
  finance: {status: MetricStatus; currencies: Money[]; unknown_cost_attempts: number; estimated_cost_attempts: number;
    budgets: {provider:string;model_id:string;adapter_version:string;currency:string;reserved_minor:number;committed_minor:number;limit_minor:number;enabled:boolean;scope:'global_current'}[];
    costs: {attempt_id:string;job_id:string;user_id:string;provider:string;model_id:string;adapter_version:string;created_at:string;state:string;currency:string|null;amount_minor:number|null;evidence:string|null;estimated_currency:string|null;estimated_amount_minor:number|null}[];
    refunds: {id:string;order_id:string;user_id:string;occurred_at:string;amount_minor:number;currency:string;status:string}[];
    orders: {id: string; user_id: string; created_at: string; paid_at: string | null; status: string; currency: string | null; amount_minor: number | null}[];
    ledger: {id: string; user_id: string; kind: string; available_delta: number; reserved_delta: number; created_at: string; job_id: string | null}[]};
  operations: {status_counts: Record<string, number>; error_counts: {code: string; jobs: number}[];
    oldest_queued_ms: number | null; event_delay_p95_ms: number | null; uncertain_client_events: number;
    cleanup_pending: number; cleanup_retrying: number; unresolved_downloads: number; finance_gaps: number;
    issues: {code: string; severity: 'info' | 'warning' | 'critical'; count: number; message: string}[]};
  jobs: {id: string; user_id: string; tool_id: string; status: string; stage: string; created_at: string;
    completed_at: string | null; error_code: string | null; model_id: string | null; adapter_version: string | null;
    prompt_id: string | null; prompt_version: number | null; tool_version: number | null}[];
};
