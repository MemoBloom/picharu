import type { MetadataRoute } from 'next';
import { canonicalUrl, indexingEnabled, PUBLIC_PATHS } from '../lib/seo';
import { allPublishedContent } from '../server/seo/content';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if(!indexingEnabled())return [];
  const content=await allPublishedContent();
  return [...PUBLIC_PATHS.map(path => ({ url: canonicalUrl(path), lastModified: '2026-10-20' })),...content.filter(row=>row.content.indexable).map(row=>({url:canonicalUrl(row.content.path),lastModified:row.content.updated_at}))];
}
