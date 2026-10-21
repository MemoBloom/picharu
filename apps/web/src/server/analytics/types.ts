// Server-only analysis facts. Never return this dataset to the browser.
export type Environment = 'test' | 'live' | 'unclassified';
export type Device = 'mobile' | 'tablet' | 'desktop' | 'unknown';
export type AnalyticsQuery = {
 start: string; end: string; timezone: string; bucket: 'hour' | 'day' | 'week';
 environment: Environment; internal: 'exclude' | 'include' | 'only';
 tool_id?: string; category?: string; model_id?: string; adapter_version?: string;
 prompt_id?: string; prompt_version?: number; tool_version?: number; device?: Device;
 cohort: 'all' | 'new' | 'returning' | 'paid' | 'unpaid' | 'light' | 'heavy';
};
export type AnalyticsUser = {
 id: string; created_at: string; environment: Environment; internal: boolean;
 email_masked: string | null; account_status: string; available: number; reserved: number;
 first_completed_at: string | null; first_paid_at: string | null; lifetime_jobs: number;
 history_complete: boolean; payment_history_complete?: boolean; last_generated_at?: string | null; last_30d_jobs?: number;
};
export type AnalyticsJob = {
 id: string; owner_id: string; tool_id: string; status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
 stage: string; created_at: string; completed_at: string | null; parent_job_id: string | null;
 result_image_id: string | null; error_code: string | null; credits_reserved: number;
 environment: Environment; internal: boolean; device: Device;
 provider: string | null; model_id: string | null; adapter_version: string | null;
 prompt_id: string | null; prompt_version: number | null; tool_version: number | null;
};
export type AnalyticsImage = {
 id: string; owner_id: string; source_job_id: string | null; source_kind: string;
 status: string; created_at: string; upload_completed_at: string | null;
 expires_at: string; deleted_at: string | null;
 environment?: Environment; internal?: boolean;
};
export type AnalyticsLedger = {
 id: string; owner_id: string; kind: string; available_delta: number; reserved_delta: number;
 reference_id: string | null; created_at: string; environment: Environment; internal: boolean;
};
export type AnalyticsOrder = {
 id: string; owner_id: string; created_at: string; paid_at: string | null;
 amount_minor: number | null; currency: string | null; refunded_minor: number | null;
 status: string; reversal_shortfall: number | null; environment: Environment; internal: boolean;
};
export type AnalyticsRefund = {
 id: string; order_id: string; owner_id: string; occurred_at: string;
 amount_minor: number; currency: string; status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled';
 environment: Environment; internal: boolean;
};
export type AnalyticsAttempt = {
 id: string; job_id: string; created_at: string; submitted_at: string | null; state: string;
 provider: string; model_id: string; adapter_version: string;
 actual_cost: {amount_minor: number; currency: string; evidence: 'provider_report' | 'invoice' | 'estimate'} | null;
 estimated_cost: {amount_minor: number; currency: string} | null;
};
export type AnalyticsEvent = {
 event_id: string; name: string; owner_id: string; job_id: string | null;
 image_id: string | null; tool_id: string; page_view_id: string | null;
 exposure_id: string | null; action_id: string | null; source: string;
 device: Device; rating: 'positive' | 'negative' | null;
 occurred_at: string; received_at: string; environment: Environment; internal: boolean;
};
export type AnalyticsPeriod = {environment: Environment; started_at: string; ended_at: string | null};
export type AnalyticsAction = {
 owner_id: string; action_id: string; image_id: string; job_id: string; created_at: string;
 issued_at: string | null; state: string; environment: Environment;
};
export type AnalyticsCatalogTool = {tool_id: string; name: string; category: string; available: boolean};
export type AnalyticsDataset = {
 as_of: string; query: AnalyticsQuery; permissions: ('analytics:read' | 'finance:read')[];
 users: AnalyticsUser[]; jobs: AnalyticsJob[]; images: AnalyticsImage[]; ledger: AnalyticsLedger[];
 orders: AnalyticsOrder[]; refunds: AnalyticsRefund[]; attempts: AnalyticsAttempt[];
 events: AnalyticsEvent[]; periods: AnalyticsPeriod[]; actions: AnalyticsAction[];
 catalog: AnalyticsCatalogTool[];
 refund_periods?: AnalyticsPeriod[];
 version_releases?: {key:string;released_at:string;scope:'all_users'|'limited_rollout'|'internal_only'}[];
 budgets?: {provider:string;model_id:string;adapter_version:string;currency:string;reserved_minor:number;committed_minor:number;limit_minor:number;enabled:boolean}[];
 quality: {
  history_complete: boolean; payment_history_complete?: boolean; refund_coverage_start: string | null; finance_gaps: number;
  cleanup_pending: number; cleanup_retrying: number; collection_enabled: boolean;
  unresolved_downloads: number; source_limit: number;
 };
};
export type MetricStatus = 'ready' | 'no_sample' | 'immature' | 'not_collected' | 'incomplete' | 'by_dimension' | 'forbidden' | 'unsupported_filters';
export type AnalyticsMetric = {
 id: string; value: number | null; numerator: number | null; denominator: number | null;
 sample_size: number; unit: 'count' | 'ratio' | 'credits' | 'milliseconds' | 'minor' | 'per_user';
 status: MetricStatus; reason: string | null; coverage_start: string | null;
 auxiliary: Record<string, number>;
};
// Public report DTOs are defined in @picjp/contracts/analytics.ts by the parent.
