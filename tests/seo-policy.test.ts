import { describe, it, expect, afterEach, vi } from 'vitest';
import { canonicalUrl, normalizePublicPath, pageMetadata, isPrivatePath, jsonLd, indexingEnabled } from '../apps/web/src/lib/seo';
import { proxy } from '../apps/web/src/proxy';
import { NextRequest } from 'next/server';
afterEach(() => vi.unstubAllEnvs());
describe('SEO URL, indexing, early responses and legacy compatibility', () => {
  it('normalizes public URLs without query or credentials and preserves per-tool canonicals', () => {
    expect(canonicalUrl('/ja/tools/remove_person/?utm_source=x')).toBe('https://picmoko.com/ja/tools/remove_person');
    for (const path of ['//evil.test/x', 'https://evil.test', '/\\evil', '/ja\nX']) expect(normalizePublicPath(path)).toBeNull();
    expect(jsonLd({ text: '</script><script>alert(1)</script>' })).not.toContain('<');
  });
  it('requires explicit indexing enablement and overrides preview environments', () => {
    expect(indexingEnabled()).toBe(false); vi.stubEnv('SEO_INDEXING_ENABLED', 'true'); expect(indexingEnabled()).toBe(true);
    vi.stubEnv('VERCEL_ENV', 'preview'); expect(indexingEnabled()).toBe(false);
  });
  it('excludes private workflows regardless of indexing configuration', async () => {
    vi.stubEnv('SEO_INDEXING_ENABLED', 'true');
    for (const path of ['/ja/login', '/ja/edit', '/ja/jobs/test', '/ja/billing/success', '/admin/seo', '/auth/callback']) {
      expect(isPrivatePath(path)).toBe(true);
      expect(pageMetadata(path, 'test', 'test').robots).toMatchObject({ index: false });
      expect((await proxy(new NextRequest('https://picmoko.com' + path))).headers.get('x-robots-tag')).toBe('noindex');
    }
  });
  it('returns a real early 404 instead of a streamed 200 for missing tools', async () => {
    const response = await proxy(new NextRequest('https://picmoko.com/ja/tools/missing'));
    expect(response.status).toBe(404); expect(await response.text()).toContain('noindex');
  });
  it('redirects legacy public pages while leaving credential workflows untouched', async () => {
    for (const host of ['www.picmoko.com', 'picharu.vercel.app']) {
      expect((await proxy(new NextRequest(`https://${host}/ja/tools/remove_person?utm_source=x`))).headers.get('location')).toBe('https://picmoko.com/ja/tools/remove_person?utm_source=x');
      for (const path of ['/auth/callback?token_hash=fixture', '/ja/login', '/ja/edit', '/api/me', '/email-assets/v1/picmoko-mascot.png']) expect((await proxy(new NextRequest(`https://${host}${path}`))).headers.get('location')).toBeNull();
    }
  });
});
