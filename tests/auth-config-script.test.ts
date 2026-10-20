import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const env: NodeJS.ProcessEnv = {
  PATH: process.env.PATH, NODE_ENV: 'test', APP_ORIGIN: 'https://picharu.vercel.app',
  SUPABASE_URL: 'https://fixture.supabase.co', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', SUPABASE_SECRET_KEY: 'sb_secret_offline_fixture', GENERATION_ENABLED: 'false',
};
describe('offline Auth configuration check', () => {
  it('prints exact callback configuration without keys or claiming live verification', async () => {
    const { stdout } = await run(process.execPath, ['--import', 'tsx', 'scripts/check-auth-config.ts'], { env, encoding: 'utf8' });
    expect(JSON.parse(stdout)).toMatchObject({ local_config: 'passed', supabase_redirect_url: 'https://picharu.vercel.app/auth/callback', google_redirect_uri: 'https://fixture.supabase.co/auth/v1/callback', provider_settings_verified: false, live_login_verified: false });
    expect(stdout).not.toContain(env.SUPABASE_SECRET_KEY); expect(stdout).not.toContain(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  });
  it.each([
    [{ SUPABASE_URL: 'https://other.supabase.co' }, 'SUPABASE_PROJECT_MISMATCH'],
    [{ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_MUST_NOT_LEAK' }, 'PUBLIC_SUPABASE_CONFIG_INVALID'],
    [{ SUPABASE_SECRET_KEY: 'sb_publishable_WRONG_SERVER_KEY' }, 'SERVER_SUPABASE_KEY_INVALID'],
    [{ GENERATION_ENABLED: 'true' }, 'KEEP_GENERATION_DISABLED_FOR_AUTH_TEST'],
  ] as const)('fails safely for configuration %j', async (override, code) => {
    try { await run(process.execPath, ['--import', 'tsx', 'scripts/check-auth-config.ts'], { env: { ...env, ...override } }); throw new Error('Expected failure'); }
    catch (error) {
      const failure = error as Error & { stderr: string; code: number };
      expect(failure.code).toBe(1); expect(JSON.parse(failure.stderr).error_code).toBe(code);
      expect(failure.stderr).not.toMatch(/MUST_NOT_LEAK|WRONG_SERVER_KEY|sb_secret_offline_fixture/);
    }
  });
});
