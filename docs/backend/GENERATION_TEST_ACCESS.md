# Restricted first generation test

New generation jobs require all three conditions: `GENERATION_ENABLED=true`, a valid server-only `GENERATION_TEST_USER_ID` matching the authenticated Supabase Auth UUID, and `tool_id=illustration_photo`. Missing, empty, malformed, wildcard, or email values deny new jobs. There is no public/unrestricted fallback mode. Future general release requires a separate reviewed change.

Keep `GENERATION_ENABLED=false` during configuration and deployment preparation. Obtain the test account UUID from Supabase Authentication > Users; never use its email, a browser-supplied ID, or a NEXT_PUBLIC variable. Set `GENERATION_TEST_USER_ID` in the intended Vercel environment only after checking the account. No actual account identifier is stored in this repository. Configuration changes require a later deployment; this implementation does not modify cloud settings.

The `/api/edit` server route checks the authenticated UUID and fixed tool before loading input images, compiling prompts, or creating/reserving a new job. Both ordinary and console-device creation use this route. Rejected new submissions return the existing GENERATION_DISABLED/503 response without exposing the allowlist. Existing owner-scoped idempotent replays remain readable even after disabling access; they create no new job or reservation. History, downloads, cancellation, authentication, and uploads remain available under their existing permissions.

The public `/api/tools` catalog advertises at most illustration_photo when the global switch and valid test UUID are configured. It is public capability metadata, not per-user authorization: non-test accounts may see that capability but their POST is rejected by the server. Missing test configuration advertises no available tools. No UUID is returned publicly.

This is an account/tool restriction, not a one-request budget or an automatic shutdown. A permitted account may submit multiple distinct jobs. Worker enablement and provider budget are independent gates and remain disabled until separately authorized. A first test still requires explicit paid-call authorization and controlled job progression.

Validation uses synthetic identities, isolated PGlite, in-memory storage and provider substitutes. No production secrets, user photos, cloud writes or paid calls are required.

The fix/generation-test-allowlist branch disables Vercel Git auto-deployment in apps/web/vercel.json. This branch-only rule does not disable main deployments and is not permission to merge or deploy.
