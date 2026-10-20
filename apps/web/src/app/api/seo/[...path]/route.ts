import { revalidatePath,revalidateTag } from 'next/cache';
import { createSeoHandler,defaultSeoDependencies } from '../../../../server/seo/http';
import { createAnalyticsHandler } from '../../../../server/seo/analytics';
export const runtime='nodejs';export const dynamic='force-dynamic';
const handle=createSeoHandler({...defaultSeoDependencies,invalidate:async(path)=>{revalidateTag('seo:content',{expire:0});revalidatePath(path);revalidatePath('/ja/guides');revalidatePath('/sitemap.xml');}});
const analytics=createAnalyticsHandler({...defaultSeoDependencies,secret:()=>process.env.SEO_EVENT_SECRET,enabled:()=>process.env.SEO_ANALYTICS_ENABLED==='true'});
export const GET=handle;
export const POST=(request:Request)=>['/api/seo/consent','/api/seo/events','/api/seo/ga4-session'].includes(new URL(request.url).pathname)?analytics(request):handle(request);
export const DELETE=analytics;
