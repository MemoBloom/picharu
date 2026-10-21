import { NextRequest, NextResponse } from 'next/server';
import { indexingEnabled, isPrivatePath, isRetiredSeoPath, seoOrigin, toolPathExists } from './lib/seo';

import { guides } from './content/seo/guides';
import { seoRpc } from './server/seo/repository';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Redirect public HTML only: old email assets, Auth callbacks and API requests stay on their original origin.
  if (['picharu.vercel.app', 'www.picmoko.com'].includes(request.nextUrl.hostname) &&
      (pathname === '/' || pathname === '/ja' || pathname.startsWith('/ja/')) && !isPrivatePath(pathname)) {
    const destination = new URL(pathname + request.nextUrl.search, seoOrigin());
    return NextResponse.redirect(destination, 308);
  }
  let guideExists = true;
  if (pathname.startsWith('/ja/guides/') && !isRetiredSeoPath(pathname)) {
    guideExists = guides.some(guide => guide.path === pathname);
    if (!guideExists && /^\/ja\/guides\/[a-z0-9-]+$/.test(pathname) && process.env.SEO_CONTENT_BACKEND === 'database') {
      try { guideExists = (await seoRpc<any[]>('seo_get_published', { p_path: pathname })).some(row => row.content?.path === pathname && row.content?.kind === 'guide'); }
      catch { return new NextResponse('Service temporarily unavailable', { status: 503, headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store', 'Retry-After': '60' } }); }
    }
  }
  if (isRetiredSeoPath(pathname) || !toolPathExists(pathname) || !guideExists) {
    return new NextResponse('<!doctype html><html lang="ja"><head><meta name="robots" content="noindex"><title>ページが見つかりません | picmoko</title></head><body><main><h1>ページが見つかりません</h1><p>指定されたページはありません。</p><a href="/ja/tools">ツール一覧に戻る</a></main></body></html>', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } });
  }
  const response = NextResponse.next();
  if (!indexingEnabled() || isPrivatePath(pathname) || pathname.startsWith('/api/')) response.headers.set('X-Robots-Tag', 'noindex');
  return response;
}
export const config = { matcher: ['/', '/ja/:path*', '/auth/:path*', '/admin/:path*', '/api/:path*'] };
