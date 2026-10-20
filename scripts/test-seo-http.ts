import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { publicToolContent } from '../apps/web/src/lib/tool-content';
import { guides } from '../apps/web/src/content/seo/guides';
const base=process.env.SEO_TEST_BASE||'http://127.0.0.1:3160';
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(base),'Tests only target isolated localhost');
const enabled=process.env.SEO_TEST_INDEXING==='true';
const results:unknown[]=[];
function visibleHtml(html:string){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>tag.includes('application/ld+json')?tag:'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');}
async function page(path:string,eligible:boolean,revision=false){
 const r=await fetch(base+path,{redirect:'manual'});const html=await r.text();const visible=visibleHtml(html);
 assert.equal(r.status,200,path);assert.equal((visible.match(/<h1\b/g)||[]).length,1,`${path}: missing or duplicate h1`);
 assert(visible.includes('<main'),path+': missing initial HTML body');
 assert(visible.includes(`rel="canonical" href="https://picmoko.com${path}"`),path+': wrong canonical');
 assert.equal((html.match(/<title>/g)||[]).length,1,path+': duplicate title');
 assert(visible.includes('name="description"'),path+': description missing');
 if(!enabled||!eligible)assert(/name="robots" content="[^"]*noindex/.test(visible),path+': noindex missing');
 else assert(/name="robots" content="[^"]*index/.test(visible)&&!/name="robots" content="[^"]*noindex/.test(visible),path+': eligible public page still noindex');
 if(!enabled)assert(r.headers.get('x-robots-tag')?.includes('noindex'),path+': deployment noindex header missing');
 if(revision){const meta=/name="seo-revision" content="([^"]+)"/.exec(visible)?.[1];const body=/data-seo-revision="([^"]+)"/.exec(visible)?.[1];assert(meta&&meta===body,path+': metadata/body revision mismatch');assert(visible.includes('BreadcrumbList'));}
 results.push({path,status:r.status,canonical:true,body:true,revision_consistent:revision});return visible;
}
async function main(){
const home=await page('/ja',true);assert(home.includes('WebSite'));assert(home.includes('href="/ja/tools"'));
const directory=await page('/ja/tools',true);for(const t of publicToolContent)assert(directory.includes(`href="/ja/tools/${t.tool_id}"`),'missing crawlable tool link '+t.tool_id);
await page('/ja/help',true);
for(const t of publicToolContent)await page('/ja/tools/'+t.tool_id,false,true);
for(const g of guides)await page(g.path,false,true);
for(const path of ['/ja/login','/ja/account','/ja/history','/ja/billing/success','/auth/callback']){
 const r=await fetch(base+path);const html=visibleHtml(await r.text());assert(r.headers.get('x-robots-tag')?.includes('noindex'),path);assert(/name="robots" content="[^"]*noindex/.test(html),path);results.push({path,noindex:true});
}
for(const path of ['/ja/tools/missing-seo-test','/ja/tools/remove_person/deep','/ja/guides/missing-seo-test','/ja/guides/remove-unwanted-people/deep']){const bad=await fetch(base+path);assert.equal(bad.status,404,path);assert(bad.headers.get('x-robots-tag')?.includes('noindex'));results.push({path,true_404:true});}
const admin=await fetch(base+'/admin/seo');assert.equal(admin.status,200);assert(admin.headers.get('x-robots-tag')?.includes('noindex'));assert((await admin.text()).includes('SEO'));results.push({path:'/admin/seo',noindex:true});
const denied=await fetch(base+'/api/seo/admin/overview');assert.equal(denied.status,401);assert.equal(denied.headers.get('cache-control'),'no-store');
const disabled=await fetch(base+'/api/seo/consent',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({consent:true,landing_path:'/ja',source:'direct'})});assert.equal(disabled.status,503);assert(!(disabled.headers.get('set-cookie')));results.push({analytics_disabled:true,admin_api_unauthorized:true});
const robots=await(await fetch(base+'/robots.txt')).text();assert(robots.includes('Sitemap: https://picmoko.com/sitemap.xml'));
assert.equal(robots.includes('Disallow: /'),!enabled);
const sitemap=await(await fetch(base+'/sitemap.xml')).text();assert(!/\/ja\/(account|edit|jobs|login|history|billing)/.test(sitemap));
assert.equal((sitemap.match(/<loc>/g)||[]).length,enabled?3:0);assert(!/<loc>[^<]*\?/.test(sitemap));
const image=await fetch(base+'/email-assets/v1/picmoko-mascot.png');assert.equal(image.status,200);assert.equal(image.headers.get('access-control-allow-origin'),'*');
const output=process.env.SEO_TEST_OUTPUT||'/private/tmp/picmoko-seo-http.json';await mkdir(new URL('.',`file://${output}`).pathname,{recursive:true});await writeFile(output,JSON.stringify({base,indexing:enabled,results,missing_tool_404:true,sitemap_valid:true,email_asset_compatible:true},null,2));
console.log(JSON.stringify({checks:results.length+4,indexing:enabled,result:'PASS',output}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
