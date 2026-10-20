import { publicAuthConfig } from '../apps/web/src/lib/auth-config';
import { loginCallbackUrl } from '../apps/web/src/lib/auth-flow';
function check() {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new Error('APP_ORIGIN_REQUIRED');
  const callback = loginCallbackUrl(origin);
  const config = publicAuthConfig(process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(), process.env.NODE_ENV !== 'production');
  if (!config) throw new Error('PUBLIC_SUPABASE_CONFIG_INVALID');
  if (!process.env.SUPABASE_URL || new URL(process.env.SUPABASE_URL).origin !== config.url) throw new Error('SUPABASE_PROJECT_MISMATCH');
  const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serverKey) throw new Error('SERVER_SUPABASE_KEY_REQUIRED');
  let serverRole: string | undefined;
  try { serverRole = JSON.parse(Buffer.from(serverKey.split('.')[1], 'base64url').toString()).role; } catch {}
  if ((!/^sb_secret_[A-Za-z0-9_-]+$/.test(serverKey) && serverRole !== 'service_role') || /\s/.test(serverKey)) throw new Error('SERVER_SUPABASE_KEY_INVALID');
  if (process.env.GENERATION_ENABLED === 'true') throw new Error('KEEP_GENERATION_DISABLED_FOR_AUTH_TEST');
  console.log(JSON.stringify({
    local_config: 'passed', site_url: new URL(origin).origin,
    supabase_redirect_url: callback, google_redirect_uri: config.url + '/auth/v1/callback',
    generation_enabled: process.env.GENERATION_ENABLED === 'true',
    provider_settings_verified: false, smtp_verified: false, live_login_verified: false,
  }, null, 2));
}
try { check(); } catch (error) {
  const known = ['APP_ORIGIN_REQUIRED', 'PUBLIC_SUPABASE_CONFIG_INVALID', 'SUPABASE_PROJECT_MISMATCH', 'SERVER_SUPABASE_KEY_REQUIRED', 'SERVER_SUPABASE_KEY_INVALID', 'KEEP_GENERATION_DISABLED_FOR_AUTH_TEST'];
  console.error(JSON.stringify({ local_config: 'failed', error_code: error instanceof Error && known.includes(error.message) ? error.message : 'AUTH_CONFIG_INVALID' }));
  process.exitCode = 1;
}
