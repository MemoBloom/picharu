import { z } from 'zod';

export const SeoPath = z.string().max(180).regex(/^\/ja(?:\/tools(?:\/[a-z_]+)?|\/guides(?:\/[a-z0-9-]+)?|\/help)?$/);
export const SeoExampleEvidence = z.object({
  before: z.string().regex(/^\/seo-examples\/[a-zA-Z0-9_/-]+-[a-f0-9]{64}\.(png|jpg|webp)$/),
  after: z.string().regex(/^\/seo-examples\/[a-zA-Z0-9_/-]+-[a-f0-9]{64}\.(png|jpg|webp)$/),
  model_profile_version: z.string().min(1).max(100), rights_review: z.string().min(1).max(200),
  evaluated_at: z.string().datetime(), evaluation_reference: z.string().min(1).max(200),
}).strict();
export const SeoContent = z.object({
  path: SeoPath, kind: z.enum(['tool', 'guide']),
  title: z.string().trim().min(3).max(100), description: z.string().trim().min(20).max(240),
  h1: z.string().trim().min(3).max(100), lead: z.string().trim().min(20).max(2000),
  sections: z.array(z.object({ heading: z.string().min(2).max(100), text: z.string().min(10).max(3000) }).strict()).min(1).max(15),
  faq: z.array(z.object({ question: z.string().min(3).max(200), answer: z.string().min(10).max(1500) }).strict()).max(10),
  keywords: z.array(z.string().trim().min(1).max(100)).max(10),
  related_tools: z.array(z.string().regex(/^[a-z_]+$/)).max(6),
  indexable: z.boolean(), examples: z.array(SeoExampleEvidence).max(6),
  updated_at: z.string().datetime(),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'tool' && !/^\/ja\/tools\/[a-z_]+$/.test(value.path)) ctx.addIssue({ code: 'custom', path: ['path'], message: 'Tool content must match a tool route' });
  if (value.kind === 'guide' && !/^\/ja\/guides\/[a-z0-9-]+$/.test(value.path)) ctx.addIssue({ code: 'custom', path: ['path'], message: 'Guide content must match a guide route' });
  if (value.kind === 'tool' && value.indexable && !value.examples.length) ctx.addIssue({ code: 'custom', path: ['examples'], message: 'Indexable tools require evaluated example evidence' });
});
export type SeoContent = z.infer<typeof SeoContent>;
export const SeoRevisionView = z.object({ id: z.string().uuid(), path: SeoPath, base_revision: z.string().uuid().nullable(), content: SeoContent, state: z.enum(['draft', 'submitted', 'approved', 'published']), author_id: z.string(), reviewer_id: z.string().nullable(), created_at: z.string() });
export const SeoDraftRequest = z.object({ content: SeoContent, expected_revision: z.string().uuid().nullable() }).strict();
export const SeoTransitionRequest = z.object({ revision_id: z.string().uuid(), action: z.enum(['submit', 'approve', 'publish', 'rollback']), expected_revision: z.string().uuid().nullable(), operation_id: z.string().uuid() }).strict();
export const SeoEventRequest = z.object({ event_id: z.string().uuid(), event: z.enum(['page_view', 'tool_view', 'editor_open', 'upload_start', 'login_start', 'login_complete', 'result_download']), path: SeoPath, tool_id: z.string().regex(/^[a-z_]+$/).optional() }).strict();
export const SeoConsentRequest = z.object({ consent: z.literal(true), landing_path: SeoPath, source: z.enum(['organic_search','paid_search','x','tiktok','creator_referral','direct','other']) }).strict();
export const SeoRevalidationRequest = z.object({ nonce: z.string().uuid(), timestamp: z.number().int(), path: SeoPath, revision_id: z.string().uuid() }).strict();
export const SeoErrorEnvelope = z.object({ error: z.object({ code: z.string().regex(/^SEO_[A-Z_]+$/) }).strict() }).strict();
export const SeoGa4SessionRequest = z.object({ client_id: z.string().regex(/^\d{1,20}\.\d{1,20}$/), session_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
export const SeoPipelineHealth = z.object({
  checked_at: z.string().datetime(), is_fixture: z.boolean(), healthy: z.boolean(), can_suggest_search_changes: z.boolean(),
  sources: z.array(z.object({
    source: z.enum(['gsc','ga4']), property: z.string().nullable(), grain: z.enum(['property','page','query_page','landing_event']),
    from: z.string(), to: z.string(), timezone: z.string(),
    status: z.enum(['ready','empty','not_configured','missing','failed','stalled','waiting','stale','limited']),
    expected_days: z.number().int(), successful_days: z.number().int(), missing_days: z.array(z.string()),
    alerts: z.array(z.object({code:z.enum(['CONFIGURATION_REQUIRED','NO_SUCCESSFUL_IMPORT','MISSING_DAYS','LATEST_IMPORT_FAILED','IMPORT_STALLED','IMPORT_PENDING','STALE_IMPORT','PARTIAL_RESULTS','THRESHOLDED','OTHER_ROW_LOSS']),severity:z.enum(['error','warning','info'])}).strict()),
  }).strict()),
}).strict();
