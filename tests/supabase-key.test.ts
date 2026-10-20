import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseDatabase } from '../apps/web/src/server/supabase';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('server Supabase credentials (offline SDK transport)', () => {
  it.each(['sb_secret_fixture', 'eyJfixture.legacy.signature'])('supports %s without confusing an API key with a user JWT', async (key) => {
    vi.stubEnv('SUPABASE_URL', 'https://fixture.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', key.startsWith('sb_') ? key : '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', key.startsWith('sb_') ? '' : key);
    const transport = vi.fn(async (url: unknown, options?: RequestInit) => {
      const headers = new Headers(options?.headers);
      expect(headers.get('apikey')).toBe(key);
      if(String(url).endsWith('/auth/v1/user')){
        expect(headers.get('Authorization')).toBe('Bearer owner-user-jwt');
        return Response.json({id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid'});
      }
      expect(headers.get('Authorization')).toBe(key.startsWith('sb_') ? null : `Bearer ${key}`);
      return Response.json(true);
    });
    vi.stubGlobal('fetch', transport);
    const db=new SupabaseDatabase();
    expect(await db.rpc('app_consume_rate_limit', { p_key: 'fixture', p_limit: 1, p_window_seconds: 60 })).toBe(true);
    expect(await db.authenticate('owner-user-jwt')).toMatchObject({id:'00000000-0000-4000-8000-000000000001'});
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
