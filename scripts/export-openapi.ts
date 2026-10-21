import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3, type RouteConfig, type ResponseConfig } from '@asteasolutions/zod-to-openapi';
import * as contracts from '../packages/contracts/src/index';

extendZodWithOpenApi(z);

/** Generated schemas come directly from the executable contract, including additions. */
export function createOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const schemas: Record<string, z.ZodTypeAny> = {};
  for (const [name, schema] of Object.entries(contracts)) {
    if (!(schema instanceof z.ZodType)) continue;
    const annotated = name === 'EditRequest'
      ? schema.openapi({ description: 'Exactly one primary image, first in order; unique image IDs. Tool-specific parameter allowlists and minimum input counts are validated server-side. All inputs must be owned, ready, and unexpired. A matching idempotency key reuses the original snapshot; different content conflicts. These cross-field rules require runtime validation beyond OpenAPI 3.0.' })
      : name === 'JevRequest'
        ? schema.openapi({ description: 'DESIGN ONLY. Internal authenticated JPEG thumbnail request. Decoded JPEG <=1 MiB and true dimensions <=768 each; verify byte limits and dimensions at runtime. Candidate metadata comes from the trusted current catalog, never arbitrary user URLs.' })
        : name === 'JevResponse'
          ? schema.openapi({ description: 'DESIGN ONLY. Finite ranking scores may be negative or greater than one; they are not probabilities. Caller checks request/catalog/version equality, candidate membership, uniqueness and actual top_k.' })
          : name === 'PublicRecommendation'
            ? schema.openapi({ description: 'Model failure degrades to source=fallback with score=null and POPULAR_FALLBACK, or an empty list if no eligible tools. Fallback never claims image understanding.' })
            : schema;
    schemas[name] = registry.register(name, annotated);
  }

  registry.registerComponent('securitySchemes', 'SupabaseBearer', {
    type: 'http', scheme: 'bearer', bearerFormat: 'Supabase access token',
    description: 'Server verifies the access token with Supabase Auth getUser. Cookies alone are not authentication; user_id is never accepted from the browser.',
  });
  registry.registerComponent('securitySchemes', 'StripeWebhookSignature', {
    type: 'apiKey', in: 'header', name: 'Stripe-Signature',
    description: 'Stripe SDK verifies this signature over the exact raw body before parsing. This is a webhook signature, not a reusable API key.',
  });
  registry.registerComponent('securitySchemes', 'JevHmacSignature', {
    type: 'apiKey', in: 'header', name: 'X-Service-Signature',
    description: 'Hex HMAC-SHA256(secret, POST + newline + /v1/recommend + newline + timestamp + newline + sha256(exact raw body)). X-Service-Timestamp is Unix seconds, clock skew <=60s. TLS required. Read-only scoring still requires rate limiting and request_id replay deduplication.',
  });
  registry.registerComponent('securitySchemes', 'GoogleOidc', {
    type: 'http', scheme: 'bearer', bearerFormat: 'Google-signed OIDC ID token',
    description: 'Cloud Run IAM authentication; not cloud-verified yet. Token audience is the Cloud Run service URL; grant invoker only to approved Scheduler/dispatcher identities. Separate from end-user Supabase authentication.',
  });

  const headerSchemas = {
    'X-Request-ID': { description: 'Trace UUID.', schema: { type: 'string' as const, format: 'uuid' } },
    'X-Contract-Version': { description: 'Protocol version.', schema: { type: 'string' as const, enum: [contracts.CONTRACT_VERSION] } },
  };
  type PlainHeaders = Exclude<ResponseConfig['headers'], z.AnyZodObject | undefined>;
  function json(schema: z.ZodTypeAny, description = 'Success', privateResponse = false): Omit<ResponseConfig, 'headers'> & { headers: PlainHeaders } {
    return {
      description,
      headers: privateResponse ? { ...headerSchemas, 'Cache-Control': { description: 'Private responses are not cached.', schema: { type: 'string', enum: ['no-store'] } } } : headerSchemas,
      content: { 'application/json': { schema } },
    };
  }
  const errors: Record<number, string> = {
    400: 'INVALID_REQUEST, QUERY_TOO_LARGE or INVALID_PROMPT; webhook signature failures also return 400.',
    401: 'UNAUTHORIZED or internal INVALID_SIGNATURE.',
    402: 'INSUFFICIENT_CREDITS.',
    403: 'ACCOUNT_RESTRICTED or FORBIDDEN (no current administrator permission).',
    404: 'NOT_FOUND, including resources owned by another user.',
    409: 'IMAGE_NOT_READY, IMAGE_IN_USE, IDEMPOTENCY_CONFLICT, JOB_NOT_CANCELLABLE or UNSUPPORTED_CAPABILITY.',
    413: 'INVALID_REQUEST: request stream, uploaded media, or normalized asset exceeds the configured byte limit.',
    415: 'INVALID_REQUEST: a JSON endpoint requires Content-Type application/json.',
    429: 'RATE_LIMITED. Retry-After indicates the retry delay in seconds.',
    500: 'INTERNAL_ERROR; details are not exposed.',
    503: 'GENERATION_DISABLED or SERVICE_UNAVAILABLE.',
  };
  function errorResponses(codes: number[]) {
    return Object.fromEntries(codes.map(code => {
      const response = json(schemas.ErrorEnvelope, errors[code], true);
      if (code === 429) response.headers = { ...response.headers, 'Retry-After': { schema: { type: 'integer', minimum: 1 }, description: 'Seconds before retry.' } };
      return [code, response];
    }));
  }
  const idParam = z.object({ id: contracts.Id });
  const body = (schema: z.ZodTypeAny, description?: string) => ({ required: true, description, content: { 'application/json': { schema } } });
  type PublicRoute = {
    method: 'get' | 'post' | 'delete'; path: string; operationId: string; summary: string;
    output: z.ZodTypeAny; input?: z.ZodTypeAny; query?: z.AnyZodObject; status?: number;
    public?: boolean; errors?: number[]; description?: string;
  };
  function publicRoute(route: PublicRoute) {
    registry.registerPath({
      method: route.method, path: route.path, operationId: route.operationId, summary: route.summary,
      description: route.description, tags: ['Vercel BFF'],
      security: route.public ? [] : [{ SupabaseBearer: [] }],
      request: {
        ...(route.input ? { body: body(route.input) } : {}),
        ...(route.path.includes('{id}') ? { params: idParam } : {}),
        ...(route.query ? { query: route.query } : {}),
      },
      responses: {
        [route.status ?? 200]: json(route.output, 'Success', !route.public),
        ...errorResponses([...new Set([
          ...(route.errors ?? (route.public ? [500] : [400, 401, 404, 429, 500])),
          503,
          ...(route.input ? [413, 415] : []),
        ])]),
      },
      'x-implementation-status': 'local-implementation-requires-configured-services',
    });
  }

  const Health = registry.register('HealthResponse', z.object({ status: z.literal('ok'), contract_version: z.literal(contracts.CONTRACT_VERSION) }).strict());
  const Me = registry.register('MeResponse', z.object({ user_id: contracts.Id, email: z.string().nullable(), locale: z.literal('ja') }).strict());
  const ToolList = registry.register('ToolListResponse', z.object({ tools: z.array(schemas.ToolView) }).strict());
  const Jobs = registry.register('JobListResponse', z.object({ items: z.array(schemas.JobView), next_cursor: z.string().nullable() }).strict());
  const Orders = registry.register('OrderListResponse', z.object({ items: z.array(schemas.OrderView), next_cursor: z.string().nullable() }).strict());
  const Packages = registry.register('CreditPackageListResponse', z.object({ packages: z.array(schemas.CreditPackage) }).strict());
  const Received = registry.register('WebhookReceivedResponse', z.object({ received: z.literal(true) }).strict());

  publicRoute({ method: 'get', path: '/api/health', operationId: 'health', summary: 'BFF health without configuration details', output: Health, public: true });
  publicRoute({ method: 'get', path: '/api/tools', operationId: 'listTools', summary: 'Active tool definitions and current availability (currently 18); historical IDs remain valid', output: ToolList, public: true });
  publicRoute({ method: 'get', path: '/api/me', operationId: 'getMe', summary: 'Verified current user', output: Me });
  publicRoute({ method: 'get', path: '/api/dashboard', operationId: 'getPersonalSummary', summary: 'Owned 30 JST calendar-day usage, current credits and recent jobs in one database snapshot', output: schemas.PersonalSummary });
  publicRoute({ method: 'get', path: '/api/credits/ledger', operationId: 'getPersonalLedger', summary: 'Owned ledger, with immutable deltas and stable keyset pagination', output: schemas.PersonalLedgerPage, query: contracts.PersonalLedgerQuery, description: 'before is the stable creation cutoff: pass snapshot_before from the first page with subsequent cursors. as_of is the actual page-read timestamp. Filters are UTC half-open start/end. No arbitrary user_id or internal business_key.' });
  publicRoute({ method: 'get', path: '/api/account/jobs', operationId: 'getPersonalJobs', summary: 'Owned jobs filtered by status, stable tool ID and creation interval', output: schemas.PersonalJobsPage, query: contracts.PersonalJobsQuery, description: 'before fixes creation cutoff; status is current at the returned as_of. No historical state reconstruction. Use the exact same filters with each cursor.' });
  publicRoute({ method: 'get', path: '/api/account/works', operationId: 'getPersonalWorks', summary: 'Owned successful results including explicit ready/expired/deleted availability', output: schemas.PersonalWorksPage, query: contracts.PersonalWorksQuery, description: 'Pagination does not extend retention: availability and expiry are checked at the actual page-read as_of. Open previews/downloads only through normal owner-checked short-lived image APIs.' });
  publicRoute({method:'post',path:'/api/admin/users/resolve',operationId:'consoleResolveUser',summary:'Resolve an exact user ID or email with current analytics permission; return a masked match only',input:schemas.ConsoleUserLookup,output:schemas.ConsoleUserLookupResult,errors:[400,401,403,429,500],description:'Exact case-insensitive email match or UUID. Ambiguous email returns no user ID. Audit stores lookup kind only; no raw lookup email is echoed or added to report filters. Drill into a fixed report separately; a lookup match does not add an out-of-scope account to a report.'});
  publicRoute({ method: 'get', path: '/api/admin/session', operationId: 'getConsoleSession', summary: 'Current server-controlled administrator permissions; audited and checked on every request', output: schemas.ConsoleSession, errors: [400,401,403,429,500] });
  publicRoute({ method:'get',path:'/api/analytics/config',operationId:'getTelemetryConfig',summary:'Authenticated observation collection configuration; disabled by default',output:schemas.ConsoleTelemetryConfig });
  publicRoute({ method:'post',path:'/api/admin/analytics/reports',operationId:'createAnalyticsReport',summary:'Create a 15-minute frozen analytics snapshot with current role enforcement',input:schemas.AnalyticsQuery,output:schemas.AnalyticsReportResponse,status:201,errors:[400,401,403,429,500],description:'UTC half-open interval, chosen IANA timezone; up to 366 days (hour bucket:31). Fact collections capped at 20,000; QUERY_TOO_LARGE asks caller to narrow the range. No raw private assets/prompts/Stripe IDs.' });
  publicRoute({ method:'get',path:'/api/admin/analytics/reports/{id}',operationId:'getAnalyticsReport',summary:'Read bounded paged tables and charts from the same original snapshot',query:contracts.AnalyticsViewQuery,output:schemas.AnalyticsReportResponse,errors:[400,401,403,404,429,500],description:'Snapshot creator only; expires after 15 minutes. Roles are checked afresh on every read and export. Finance section requires finance:read. All tables remain bounded even when inactive.' });
  registry.registerPath({method:'get',path:'/api/admin/analytics/reports/{id}/export',operationId:'exportAnalyticsReport',tags:['Vercel BFF'],summary:'Audited masked CSV from identical snapshot, filters and drill',security:[{SupabaseBearer:[]}],request:{params:idParam,query:contracts.AnalyticsExportQuery},responses:{200:{description:'UTF-8 BOM CSV; formula-leading strings are neutralized. Up to 5,000 rows; narrow filters when larger. Includes as_of, metric version and filters. Orders/ledger/costs require finance:read.',headers:{'Cache-Control':{schema:{type:'string',enum:['no-store']}},'Content-Disposition':{schema:{type:'string'}}},content:{'text/csv':{schema:{type:'string'}}}},...errorResponses([400,401,403,404,429,500,503])}});
  publicRoute({ method: 'post', path: '/api/analytics/events', operationId: 'recordConsoleEvent', summary: 'Bounded lower-trust browser observation; owner and versions resolved server-side', input: schemas.ConsoleBrowserEvent, output: schemas.ConsoleEventReceipt, errors: [400,401,404,409,429,500], description: 'Never submit secrets, photographs, prompts or arbitrary properties. Only enabled catalog tools may be exposed/selected. Client observations do not prove device filesystem saves. Duplicate event/action keys do not inflate reports. Collection defaults disabled; old periods are never backfilled with zero.' });
  publicRoute({ method: 'post', path: '/api/images/{id}/download', operationId: 'recordedResultDownload', summary: 'Explicit owned successful-result download, with durable save-behavior receipt', input: schemas.ConsoleDownloadRequest, output: schemas.ConsoleDownloadResponse, errors: [400,401,404,409,429,500], description: 'action_id is stable across retries. Records only after URL signing; does not prove local filesystem save. A post-sign telemetry failure returns recording=unavailable and leaves a durable pending intent. GET remains compatible and excluded from save metrics.' });
  publicRoute({ method: 'post', path: '/api/images/upload-url', operationId: 'createUpload', summary: 'Create private staging upload', input: schemas.UploadRequest, output: schemas.UploadResponse, status: 201, description: 'JPEG/PNG/WebP <=20MiB. Upload bytes directly to the signed private PUT URL with required_headers; PUT expires in five minutes.' });
  publicRoute({ method: 'post', path: '/api/images/complete', operationId: 'completeUpload', summary: 'Validate and freeze the uploaded asset', input: schemas.ImageCompleteRequest, output: schemas.ImageView, errors: [400, 401, 404, 409, 429, 500], description: 'Decode <=24M pixels, normalize EXIF/sRGB, freeze a private server-written PNG and <=768px/1MiB JPEG analysis image. Repeated completion reuses the first fixed version. HEIC/animation unsupported in v1.' });
  publicRoute({ method: 'get', path: '/api/images/{id}', operationId: 'getImage', summary: 'Owned fixed image and short-lived preview', output: schemas.ImageView });
  publicRoute({ method: 'get', path: '/api/images/{id}/download', operationId: 'downloadImage', summary: 'Signed attachment download for owned asset', output: schemas.DownloadResponse });
  publicRoute({ method: 'delete', path: '/api/images/{id}', operationId: 'deleteImage', summary: 'Tombstone an image and request object cleanup', output: schemas.DeleteImageResponse, errors: [400, 401, 404, 409, 429, 500], description: 'Idempotent. Running job inputs return IMAGE_IN_USE. Object deletion failures leave cleanup_pending=true while reads remain denied.' });
  publicRoute({ method: 'post', path: '/api/edit', operationId: 'createEdit', summary: 'Atomically create queued job and reserve credits', input: schemas.EditRequest, output: schemas.EditAccepted, status: 202, errors: [400, 401, 402, 403, 404, 409, 429, 500, 503], description: 'Optional X-Picjp-Device header is a coarse client viewport observation (mobile/tablet/desktop/unknown), frozen only on first creation; excluded from business idempotency hash. Retired tools reject new jobs with UNSUPPORTED_CAPABILITY; an existing matching idempotency key still replays its frozen task. GENERATION_ENABLED defaults false until Worker and verified model profiles are available. Durable PG task; no fire-and-forget Worker request. Same normalized request/key returns the original snapshot and price, with replayed=true.' });
  publicRoute({ method: 'get', path: '/api/jobs', operationId: 'listJobs', summary: 'Owned history in stable descending keyset order', output: Jobs, query: contracts.Pagination });
  publicRoute({ method: 'get', path: '/api/jobs/{id}', operationId: 'getJob', summary: 'Owned job public status without provider or prompt details', output: schemas.JobView });
  publicRoute({ method: 'post', path: '/api/jobs/{id}/cancel', operationId: 'cancelJob', summary: 'Cancel queued job and release reserved credits', output: schemas.JobView, errors: [400, 401, 404, 409, 429, 500], description: 'Empty request body. Only queued jobs can be guaranteed cancelled; terminal-state retries follow the idempotent runtime rules.' });
  publicRoute({ method: 'post', path: '/api/recommend', operationId: 'recommend', summary: 'Image recommendations or honest popular fallback', input: schemas.RecommendRequest, output: schemas.PublicRecommendation, errors: [400, 401, 404, 409, 429, 500], description: 'Requires owned ready image. Internal JEV is design-only until deployed; unavailable model falls back without credits or fabricated image scores. Single-image context excludes templates requiring multiple inputs.' });
  publicRoute({ method: 'get', path: '/api/credits', operationId: 'getCredits', summary: 'Available and reserved integer credits', output: schemas.CreditView });
  publicRoute({ method: 'get', path: '/api/credit-packages', operationId: 'listCreditPackages', summary: 'Active server-configured JPY credit packages', output: Packages, public: true, description: 'Can be empty. No unverified production packages or client-provided prices.' });
  publicRoute({ method: 'post', path: '/api/checkout', operationId: 'createCheckout', summary: 'Freeze package and create or reuse Stripe Checkout', input: schemas.CheckoutRequest, output: schemas.CheckoutResponse, errors: [400, 401, 403, 404, 409, 429, 500, 503], description: 'Server owns package, price and APP_ORIGIN return URLs. Existing order/session is reused for matching idempotency key.' });
  publicRoute({ method: 'get', path: '/api/orders', operationId: 'listOrders', summary: 'Owned orders without Stripe secret identifiers', output: Orders, query: contracts.Pagination });
  registry.registerPath({
    method: 'post', path: '/api/stripe/webhook', operationId: 'stripeWebhook', tags: ['Vercel BFF'],
    summary: 'Verify Stripe events and atomically apply credits or reversals',
    description: 'Read the original raw UTF-8 body with a byte cap and verify Stripe-Signature before JSON parsing. Retrieve Stripe payment facts and match immutable order amount/currency/metadata. Deduplicate events and order grants transactionally. Refund/dispute events cannot be undone by replayed paid events.',
    security: [{ StripeWebhookSignature: [] }],
    request: { body: { required: true, description: 'Opaque Stripe JSON event bytes. Preserve exact bytes for signature verification; this schema does not authorize arbitrary event contents.', content: { 'application/json': { schema: z.record(z.unknown()) } } } },
    responses: { 200: json(Received, 'Event received, including safely ignored duplicate or unrelated events'), ...errorResponses([400, 413, 500, 503]) },
    'x-implementation-status': 'local-implementation-requires-configured-services',
  });

  registry.registerComponent('securitySchemes', 'SeoConsentCookie', { type:'apiKey', in:'cookie', name:'picmoko_seo', description:'HttpOnly signed consent session, max 30 minutes. Same-origin Origin header is additionally required. This cookie is not user authentication.' });
  registry.registerComponent('securitySchemes', 'SeoHmac', { type:'apiKey', in:'header', name:'X-Seo-Signature', description:'Hex HMAC-SHA256(secret, exact raw JSON body). Signed Unix timestamp within 300s and one-time nonce. Server-side secret at least 32 characters.' });
  const seoJson=(schema:z.ZodTypeAny,description='SEO response')=>({description,headers:{'Cache-Control':{schema:{type:'string' as const,enum:['no-store']}},'X-Robots-Tag':{schema:{type:'string' as const,enum:['noindex']}}},content:{'application/json':{schema}}});
  const seoErrors=Object.fromEntries([400,401,403,404,409,413,415,429,503].map(code=>[code,seoJson(schemas.SeoErrorEnvelope,'Bounded SEO error; details and credentials are never exposed.')]));
  const seoRoute=(method:'get'|'post'|'delete',path:string,operationId:string,summary:string,input:z.ZodTypeAny|undefined,output:z.ZodTypeAny,security:RouteConfig['security'],status=200)=>registry.registerPath({method,path,operationId,summary,tags:['SEO'],security,...(input?{request:{body:body(input)}}:{}),responses:{[status]:seoJson(output),...seoErrors},'x-implementation-status':'local-implementation-requires-configured-services'});
  seoRoute('post','/api/seo/consent','seoConsent','Opt in to bounded first-party measurement; same-origin only',schemas.SeoConsentRequest,z.object({consent:z.literal(true),expires_in:z.number().int()}),[],201);
  seoRoute('delete','/api/seo/consent','seoRevokeConsent','Revoke consent and clear HttpOnly cookie; same-origin only',undefined,z.object({revoked:z.literal(true)}),[]);
  seoRoute('post','/api/seo/events','seoEvent','Record an allowlisted browser event; no private URLs, photos or business facts',schemas.SeoEventRequest,z.object({received:z.literal(true),inserted:z.boolean()}),[{SeoConsentCookie:[]}]);
  seoRoute('post','/api/seo/ga4-session','seoGa4Session','Bind the tag-generated client/session IDs to a consent session; never accept a user ID',schemas.SeoGa4SessionRequest,z.object({received:z.literal(true)}),[{SeoConsentCookie:[]}]);
  seoRoute('get','/api/seo/admin/overview','seoOverview','Member-only content, imports, distinct source metrics and consented business report; fixture=true excludes real business data',undefined,z.record(z.unknown()),[{SupabaseBearer:[]}]);
  registry.registerPath({method:'get',path:'/api/seo/admin/baseline',operationId:'seoBaseline',summary:'Member-only baseline for an existing tool or guide',tags:['SEO'],security:[{SupabaseBearer:[]}],request:{query:z.object({path:schemas.SeoPath})},responses:{200:seoJson(z.object({revision:z.string(),source:z.literal('git'),content:schemas.SeoContent})),...seoErrors}});
  registry.registerPath({method:'get',path:'/api/seo/admin/revision',operationId:'seoRevision',summary:'Member-only immutable revision for comparison and editing',tags:['SEO'],security:[{SupabaseBearer:[]}],request:{query:z.object({revision_id:z.string().uuid()})},responses:{200:seoJson(schemas.SeoRevisionView),...seoErrors}});
  seoRoute('post','/api/seo/admin/drafts','seoDraft','Create an immutable draft after comparing current published revision',schemas.SeoDraftRequest,z.object({id:z.string().uuid(),state:z.literal('draft'),path:schemas.SeoPath}),[{SupabaseBearer:[]}],201);
  seoRoute('post','/api/seo/admin/observations','seoObservation','Freeze a page-level before/after observation tied to a published revision; observational, not causal',schemas.SeoObservationRequest,schemas.SeoObservationView,[{SupabaseBearer:[]}],201);
  seoRoute('post','/api/seo/admin/transitions','seoTransition','Submit, independent approval, CAS publication or rollback. Publishing requires database content mode; operation UUID is idempotent.',schemas.SeoTransitionRequest,z.object({revision_id:z.string().uuid(),path:schemas.SeoPath,action:z.string(),previous_revision:z.string().uuid().nullable()}),[{SupabaseBearer:[]}]);
  seoRoute('post','/api/seo/revalidate','seoRevalidate','Invalidate only the exact current published revision; signed timestamp and single-use nonce',schemas.SeoRevalidationRequest,z.object({invalidated:z.literal(true),path:schemas.SeoPath,revision_id:z.string().uuid()}),[{SeoHmac:[]}]);

  const jevServer = [{ url: 'https://jev.example.invalid', description: 'DESIGN ONLY placeholder; no JEV service is deployed by this code.' }];
  const workerServer = [{ url: 'https://worker.example.invalid', description: 'Undeployed placeholder; Worker implementation is maintained in its separate repository.' }];
  const internal = (route: RouteConfig) => registry.registerPath({ ...route, 'x-implementation-status': 'design-only' });
  internal({
    method: 'post', path: '/v1/recommend', operationId: 'jevRecommendDesign', tags: ['JEV design only'], servers: jevServer,
    summary: 'DESIGN ONLY — score current recommendation candidates on Lambda GPU',
    security: [{ JevHmacSignature: [] }],
    request: {
      headers: z.object({ 'X-Service-Timestamp': z.string().regex(/^\d+$/) }),
      body: body(schemas.JevRequest, 'TLS/HMAC; <=1MiB JPEG. No URL fetches, final generation prompts, user credentials or storage credentials.'),
    },
    responses: { 200: json(schemas.JevResponse), ...errorResponses([400, 401, 413, 415, 429, 503]) },
  });
  const cloudIamErrors = {
    401: { description: 'Cloud Run platform rejected a missing/invalid Google OIDC ID token before application handling. Platform response body is not the application ErrorEnvelope.' },
    403: { description: 'Cloud Run IAM denied invocation for this identity or audience. Platform response body is not the application ErrorEnvelope.' },
  };
  internal({ method: 'post', path: '/internal/v1/drain', operationId: 'workerDrain', tags: ['Worker (local implementation)'], servers: workerServer, summary: 'LOCAL IMPLEMENTATION — claim and checkpoint a bounded batch of durable jobs', description: 'limit defaults to 5 (1..20). processed counts stages durably advanced in this request, not terminal jobs, and must be <= the requested limit. remaining is an advisory due-work signal, not a consistent queue length. Job and billing truth remains in PG checkpoints.', security: [{ GoogleOidc: [] }], request: { body: body(schemas.WorkerDrainRequest) }, responses: { 200: json(schemas.WorkerAck), ...errorResponses([400, 404, 503]), ...cloudIamErrors } });
  internal({ method: 'post', path: '/internal/v1/process-job', operationId: 'workerProcess', tags: ['Worker (local implementation)'], servers: workerServer, summary: 'LOCAL IMPLEMENTATION — optional authenticated bounded-stage trigger', description: 'Advance at most one durable stage for the specified job; processed must be 0 or 1. remaining signals possible due work, not a guaranteed queue count. Response loss never authorizes blind provider resubmission.', security: [{ GoogleOidc: [] }], request: { body: body(schemas.WorkerTrigger) }, responses: { 200: json(schemas.WorkerAck), ...errorResponses([400, 404, 503]), ...cloudIamErrors } });
  const InternalHealth = registry.register('InternalHealthResponse', z.object({ status: z.literal('ok'), contract_version: z.literal(contracts.CONTRACT_VERSION) }).strict().openapi({ description: 'DESIGN ONLY liveness/readiness response with the V1 protocol version. No model paths, credentials or host metadata.' }));
  internal({ method: 'get', path: '/health', operationId: 'internalHealthDesign', tags: ['Worker (local implementation)', 'JEV design only'], servers: [...workerServer, ...jevServer], summary: 'DESIGN ONLY — internal process liveness', description: 'Cloud Run service IAM protects every path, including /health, so the Worker server requires GoogleOidc. Lambda uses a local/private health probe with no application secret in its response. This shared-path multi-server document expresses the alternatives; callers must follow the selected server requirement.', security: [{ GoogleOidc: [] }, {}], 'x-security-by-server': { 'https://worker.example.invalid': 'GoogleOidc required', 'https://jev.example.invalid': 'local/private probe only' }, responses: { 200: json(InternalHealth), ...errorResponses([503]), ...cloudIamErrors } });
  internal({ method: 'get', path: '/ready', operationId: 'jevReadyDesign', tags: ['JEV design only'], servers: jevServer, summary: 'DESIGN ONLY — model and warm inference readiness', security: [], responses: { 200: json(InternalHealth), ...errorResponses([503]) } });

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3', info: {
      title: 'PicJP modular API', version: contracts.CONTRACT_VERSION,
      description: 'Generated from executable Zod contracts and the V1 interface design. Public /api routes are the local Vercel backend; operation-level .invalid servers mark undeployed JEV design/Worker local implementation. Cross-resource authorization, idempotency, ownership, payment facts, binary image validation and refined invariants require runtime enforcement; schemas alone do not prove those properties.',
    },
    servers: [{ url: '/', description: 'Current Vercel application origin; real external services require deployment configuration.' }],
    tags: [{ name: 'SEO' }, { name: 'Vercel BFF' }, { name: 'JEV design only' }, { name: 'Worker (local implementation)' }],
  });
}

if (process.argv[1] && basename(process.argv[1]) === 'export-openapi.ts') {
  const document = createOpenApiDocument();
  const target = resolve('docs/interfaces/openapi.json');
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== serialized) {
      throw new Error('OpenAPI is stale. Run npm run contracts:export and commit the updated document.');
    }
    process.stdout.write('OpenAPI matches the executable contract.\n');
  } else {
    writeFileSync(target, serialized);
    process.stdout.write(`Exported OpenAPI ${document.openapi}: ${Object.keys(document.paths ?? {}).length} paths.\n`);
  }
}
