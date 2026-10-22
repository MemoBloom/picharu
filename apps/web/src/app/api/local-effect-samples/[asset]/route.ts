import { localExampleAsset } from '../../../../server/effect-examples';

export async function GET(request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const hostname = new URL(request.url).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return new Response(null, { status: 404 });
  const bytes = await localExampleAsset((await params).asset);
  if (!bytes) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: {
    'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
  } });
}
