import type { MetadataRoute } from 'next';
import { indexingEnabled, seoOrigin } from '../lib/seo';
export default function robots(): MetadataRoute.Robots {
  return { rules: indexingEnabled() ? { userAgent: '*', allow: '/' } : { userAgent: '*', disallow: '/' }, sitemap: seoOrigin() + '/sitemap.xml' };
}
