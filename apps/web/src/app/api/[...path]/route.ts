import { handle } from '../../../server/runtime';
import { after } from 'next/server';
import { linkBusinessResponse } from '../../../server/seo/analytics';
import { defaultSeoDependencies } from '../../../server/seo/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const GET=handle;
export const POST=async(request:Request)=>{
 const response=await handle(request);
 if(response.ok&&process.env.SEO_ANALYTICS_ENABLED==='true'&&request.headers.get('x-analytics-consent')==='granted'&&['/api/edit','/api/checkout'].includes(new URL(request.url).pathname)){
  const snapshot=response.clone();
  // Managed analytics work runs after success reaches the customer, within the route duration.
  try{after(async()=>{await linkBusinessResponse(request,snapshot,{...defaultSeoDependencies,secret:()=>process.env.SEO_EVENT_SECRET,enabled:()=>process.env.SEO_ANALYTICS_ENABLED==='true'});});}catch{}
 }
 return response;
};
export const DELETE=handle;
