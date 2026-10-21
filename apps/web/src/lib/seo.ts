import type { Metadata } from 'next';
import { publicToolContent } from './tool-content';
import { isRetiredTool } from '@picjp/tool-config/lifecycle';

export function isRetiredSeoPath(path: string) {
  return path === '/ja/guides/remove-unwanted-people' ||
    path.startsWith('/ja/tools/') && isRetiredTool(path.slice('/ja/tools/'.length));
}

export const PRIMARY_ORIGIN = 'https://picmoko.com';
export const PUBLIC_PATHS = ['/ja', '/ja/tools', '/ja/help'] as const;
export const PRIVATE_PREFIXES = ['/ja/login', '/ja/edit', '/ja/account', '/ja/history', '/ja/jobs', '/ja/billing', '/auth', '/admin'];
export function seoOrigin() {
  const url = new URL(process.env.SEO_ORIGIN || PRIMARY_ORIGIN);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid SEO_ORIGIN');
  return url.origin;
}
export function normalizePublicPath(path: string): string | null {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\x00-\x20]/.test(path)) return null;
  const value = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return value === '/' ? '/ja' : value;
}
export function isPrivatePath(path: string) { return PRIVATE_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + '/')); }
export function indexingEnabled() { return process.env.SEO_INDEXING_ENABLED === 'true' && process.env.VERCEL_ENV !== 'preview'; }
export function canonicalUrl(path: string) {
  const clean = normalizePublicPath(path);
  if (!clean) throw new Error('Invalid canonical path');
  return seoOrigin() + clean;
}
export function pageMetadata(path: string, title: string, description: string, eligible = true): Metadata {
  return {
    title: { absolute: `${title} | picmoko` }, description,
    alternates: { canonical: canonicalUrl(path) },
    robots: { index: indexingEnabled() && eligible && !isPrivatePath(path), follow: true },
    openGraph: { type: 'website', locale: 'ja_JP', siteName: 'picmoko', title, description, url: canonicalUrl(path), images: [{ url: canonicalUrl('/email-assets/v1/picmoko-wordmark-a1.png'), width: 600, height: 129, alt: 'picmoko' }] },
    twitter: { card: 'summary', title, description },
  };
}
export function toolPathExists(path: string) {
  const match = /^\/ja\/tools\/([^/]+)$/.exec(path);
  return !path.startsWith('/ja/tools/') || !!match && publicToolContent.some(tool => tool.tool_id === match[1]);
}
export function jsonLd(value: unknown) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
