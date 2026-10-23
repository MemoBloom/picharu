# Automatic Worker processing (prepared, not deployed)

## Request path

1. Existing `/api/edit` verifies Supabase identity, the single test UUID, illustration_photo, assets, profile, price and idempotency; PostgreSQL atomically creates the job/reservation.
2. The server creates a Cloud Tasks HTTP task with a SHA-256 name derived from the durable job UUID. Only contract_version/job_id are sent. A duplicate create (409) is success. Existing queued/processing owner replays can repair a missing wake without a new job or reservation; disabled or disallowed replays do not enqueue.
3. Cloud Tasks uses a dedicated invoker SA OIDC token to POST `/internal/v1/run-job`. It never passes model keys, prompts, photos or signed URLs.
4. Worker advances up to five stages for that one job inside its request deadline. After model submission, storage/settlement require only a smaller remaining budget rather than reserving a second full model timeout. Every operation remains abort-bounded with persistence time reserved. A slow call hands off continuation to a later delivery.
5. Only terminal/missing jobs receive HTTP 200. Nonterminal work, budget backpressure, leases or future next_attempt_at receive 503/Retry-After; transport failures likewise retry. PostgreSQL fencing and fresh_submission remain authoritative: recovered submission uses lookup, never a second POST.
6. A once-per-minute authenticated Scheduler call to `/internal/v1/drain` is the durable-database fallback for lost Web enqueue. With autorun enabled it pins the first claimed job and continuously advances its ready stages. Immediate/scheduled automatic execution skips global asset cleanup, which is a separate reviewed retention operation.
7. Browser polling and existing owner-scoped result preview/download APIs remain the delivery path. No browser tab needs to keep the Worker running. No long model request runs inside a Vercel function or Next.js after callback.

Web enqueue failure leaves the already-committed job and reservation intact, returns the original 202 and emits only a redacted dispatch event. Deploying the fallback Scheduler is mandatory before enabling automatic generation: otherwise a failed enqueue can leave the job queued. This is an at-least-once delivery design, not a claim of exactly-once transport. No generic automatic model retry was added.

## Deployment prerequisites (do not execute without authorization)

- Apply Web migration `202610230100_worker_progress.sql` before enabling Worker autorun. It adds only a private, read-only service_role RPC, no job state rewrite. Worker consumes an exact hash-pinned copy in tests/fixtures, not a sibling deployment dependency.
- Deploy Worker with the reviewed new image, keep existing auth mode cloud-run-iam. New `WORKER_AUTORUN_ENABLED=true` exposes the run-job endpoint and makes Scheduler drain continuous. Its default is false; WORKER_ENABLED remains independent.
- Create a dedicated Tasks queue in asia-northeast1: max concurrent dispatches 1, dispatch rate 1/s, minimum retry backoff 15s, maximum 60s, max attempts 100, retry duration 3600s. Task deadline is 300s; Cloud Run request timeout remains 240s; Worker request budget 200s. No queue retry may bypass the database recovery deadline.
- Use a dedicated invoker SA (e.g. picjp-worker-task-invoker@picjp-staging.iam.gserviceaccount.com) with roles/run.invoker on this Worker only. Do not grant public invocation.
- Use a separate Web enqueuer SA. Grant roles/cloudtasks.enqueuer on this queue and roles/iam.serviceAccountUser on the dedicated invoker SA. Cloud Tasks service agent needs its standard service-agent permissions to mint OIDC tokens; inspect existing bindings, do not grant Editor/Owner.
- Configure Vercel→GCP Workload Identity Federation, not service-account private keys. Restrict issuer to the actual Vercel team, subject to `owner:kanye-s-projects:project:picharu:environment:production`, and grant only that principal workloadIdentityUser on the enqueuer SA. Check actual token claims/team/project before applying IAM. Default Vercel audience is https://vercel.com/kanye-s-projects; STS audience is the full GCP pool/provider resource.
- Web server-only variables: WORKER_DISPATCH_ENABLED, WORKER_SERVICE_URL (the exact Cloud Run HTTPS origin), WORKER_TASKS_REGION, WORKER_TASKS_QUEUE, WORKER_TASKS_INVOKER_EMAIL, GCP_PROJECT_ID, GCP_PROJECT_NUMBER, GCP_SERVICE_ACCOUNT_EMAIL, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID. Keep dispatch false until WIF/queue/migration/Worker/fallback have been validated. Code rejects preview/local dispatch and cross-project SA configuration. No client-supplied target is accepted.
- Scheduler POST body is `{ "contract_version":"1.0.0", "limit":5 }`; target is exact Worker origin + `/internal/v1/drain`, OIDC audience is origin without path, deadline 300s, dedicated authorized invoker. Do not start a scheduler against old code with global cleanup behavior.
- Preserve GENERATION_TEST_USER_ID and illustration_photo-only rollout. No deployment or extra paid generation is authorized by this document. The automatic-worker-processing branch and main are disabled for Vercel Git auto-deployment.

## Timings and verification

Structured private logs:

- `worker_dispatch`: enqueue outcome (`passed`, `disabled`, `failed`) and duration_ms, job/request IDs. Includes WIF/token exchange plus enqueue latency, not provider execution.
- `worker_phase_timing`: input_read, provider_http, provider_submit, provider_lookup, submission_checkpoint, result_fetch, normalize, result_store, settlement. Each has duration_ms, phase outcome, attempt/job ID, lease version and started_at. Failed phases are recorded too. provider_http measures the HTTP request through bounded response-body receipt, excluding parsing/selection/R2 caching. provider_submit is the enclosing adapter span and includes those extra operations; do not sum them. Neither is a supplier-side compute-time or billing measurement. A successful HTTP phase is not proof of usable image or known bill.
- `worker_stage_timing`: successful persisted stage advancement with request/job ID and duration_ms. Phase spans can be nested inside the stage; do not sum stage and phase durations.
- `worker_job_timing`: SQL-derived queue_ms, execution_wall_ms, total_ms on terminal run-job delivery. Replay may emit the same summary; deduplicate by job_id. execution_wall_ms includes retry/backoff time and must not be labelled model latency. Scheduler fallback can be summarized with SQL timestamps.

Do not log raw errors, prompts, input/result bytes, auth tokens, object keys or signed URLs. Use private Cloud Logging retention/access policy. These timings are backend measurements; browser polling/render/download network latency is not measured by them. Existing consent-controlled first-seen/download analytics are independent.

Example query after deployment (read-only):

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="picjp-worker-staging" AND jsonPayload.job_id="REPLACE_JOB_UUID" AND (jsonPayload.event="worker_phase_timing" OR jsonPayload.event="worker_stage_timing" OR jsonPayload.event="worker_job_timing")' --project=picjp-staging --freshness=1h --format=json
```

Offline tests cover deterministic/deduplicated enqueue, redacted failure with preserved reservation, UUID gate/other tool rejection, one request across model/store/settle, 35-second model simulation without manual gaps, slow-call continuation, lease/future/budget retry, terminal replay/cancellation/expiry, unknown response lookup-only, lost settlement acknowledgement, private RPC permission and preview/download through the real cross-repo Worker adapter. Cloud WIF/IAM/queue/Scheduler/latency still need later cloud verification. One successful synthetic run does not prove live supplier performance or image quality.

Official references: [Vercel WIF](https://vercel.com/docs/oidc/gcp), [Cloud Tasks HTTP/OIDC tasks](https://docs.cloud.google.com/tasks/docs/create-tasks), [Task dispatch deadlines](https://docs.cloud.google.com/tasks/docs/reference/rest/v2/projects.locations.queues.tasks).

## Review against merged frontend (2026-10-23)

Reviewed on main `da1bcdb` including PR #14. Its progress display polls the existing owner-scoped `/api/jobs/:id` fields (`status`, `stage`, `created_at`, `completed_at`, `result_image_id`); no new public progress endpoint or schema is required. The new private `worker_job_progress` RPC serves Worker delivery decisions only. Existing completed-result preview and fresh signed download routes remain compatible. Both feature branches and main retain disabled Vercel Git deployments. Local verification after integration passed 472 tests, 90 SQL assertions, production build and 13 offline cross-repository flows. No cloud migration, deployment or paid request was executed.
