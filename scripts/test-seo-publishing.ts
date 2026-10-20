import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:https';
import { createServer as createHttpServer,request as proxyRequest } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { createSeoTestProject } from './testing/seo-project';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { baselineContent } from '../apps/web/src/server/seo/content';

/** Real Next production HTTP + real SQL through a local TLS PostgREST/Auth fixture. No cloud/Google/model calls. */
async function main() {
  const browserFixture=process.argv.includes('--browser-fixture'),browserExamples=process.argv.includes('--browser-examples');
  const directory = await mkdtemp(join(tmpdir(), 'picjp-seo-publishing-'));
  const db = new PGlite(), author = randomUUID(), reviewer = randomUUID();
  const rpc = async (name: string, args: Record<string, unknown>): Promise<any> => {
    assert(/^seo_[a-z_]+$/.test(name));
    const entries = Object.entries(args); assert(entries.every(([key]) => /^p_[a-z][a-z0-9_]*$/.test(key)));
    return (await db.query<{ v: any }>(`select ${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) v`, entries.map(([key, value]) => key === 'p_roles' ? '{' + (value as string[]).join(',') + '}' : value && typeof value === 'object' ? JSON.stringify(value) : value))).rows[0].v;
  };
  let app: ChildProcess | undefined, fixture: ReturnType<typeof createServer> | undefined,previewProxy:ReturnType<typeof createHttpServer>|undefined;
  let assertions = 0;
  const check = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); assertions++; };
  try {
    await db.exec('create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;');
    for (const file of ['202610190001_web_backend.sql','20261020153000_seo.sql','20261020160000_seo_analytics.sql','20261020163245_seo_health.sql','20261020164700_seo_observation.sql']) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
    await db.query('insert into auth.users values($1),($2)', [author, reviewer]); await db.query("insert into seo_members values($1,'editor'),($2,'reviewer')", [author, reviewer]);
    execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
    fixture = createServer({ key: await readFile(join(directory,'key.pem')), cert: await readFile(join(directory,'cert.pem')) }, async (req, res) => {
      res.setHeader('Content-Type','application/json');
      try {
        if (req.url === '/auth/v1/user') {
          const user = req.headers.authorization === 'Bearer fixture-author-token' ? author : req.headers.authorization === 'Bearer fixture-reviewer-token' ? reviewer : null;
          if (!user) { res.statusCode=401;res.end(JSON.stringify({message:'Invalid test identity'}));return; }
          res.end(JSON.stringify({ id:user,aud:'authenticated',role:'authenticated',email:'operator@example.invalid',created_at:new Date().toISOString() }));return;
        }
        const name = /^\/rest\/v1\/rpc\/(seo_[a-z_]+)$/.exec(req.url || '')?.[1];
        if (!name || req.method !== 'POST' || req.headers.apikey !== 'sb_secret_isolated_fixture_only') { res.statusCode=403;res.end('{}');return; }
        let body='';for await (const chunk of req) {body+=chunk;if(body.length>65536)throw new Error('BODY_LIMIT');}
        const result=await rpc(name,JSON.parse(body));res.end(JSON.stringify(result ?? null));
      } catch (error) { res.statusCode=400;res.end(JSON.stringify({message:(error as Error).message.match(/SEO_[A-Z_]+/)?.[0]||'FIXTURE_RPC_FAILED'})); }
    });
    await new Promise<void>((resolve,reject)=>{fixture!.once('error',reject);fixture!.listen(34437,'127.0.0.1',resolve);});
    const isolated=await createSeoTestProject(directory);
    console.log(JSON.stringify({isolated_project:true,synthetic_assets:isolated.samples.length,source_build_untouched:true}));
    const env={...process.env,SUPABASE_URL:'https://127.0.0.1:34437',SUPABASE_SECRET_KEY:'sb_secret_isolated_fixture_only',SUPABASE_SERVICE_ROLE_KEY:'',NODE_EXTRA_CA_CERTS:join(directory,'cert.pem'),SEO_CONTENT_BACKEND:'database',SEO_INDEXING_ENABLED:'true',VERCEL_ENV:'production',SEO_ORIGIN:'https://picmoko.com',NEXT_TELEMETRY_DISABLED:'1',SEO_ANALYTICS_ENABLED:'false',NEXT_PUBLIC_ANALYTICS_ENABLED:'false',NEXT_PUBLIC_GA4_ENABLED:'false',NEXT_PUBLIC_SUPABASE_URL:browserFixture?'https://seo-fixture.invalid':'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:browserFixture?'sb_publishable_fixture':'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',GENERATION_ENABLED:'false',MODEL_PROFILES_JSON:'[]'};
    const build=spawn('npm',['run','build'],{cwd:isolated.project,env,stdio:'inherit'});
    const buildCode=await new Promise<number|null>((resolve,reject)=>{build.once('error',reject);build.once('exit',resolve);});check(buildCode,0,'database-backed production build');
    app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port','3169'],{cwd:isolated.project,env,stdio:'inherit'});
    const base='http://127.0.0.1:3169';let ready=false;
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok){ready=true;break;}}catch{}await delay(100);}assert(ready,'test server not ready');
    async function call(route:string,body:unknown,actor='author'){
      const response=await fetch(base+'/api/seo/admin/'+route,{method:'POST',headers:{Authorization:`Bearer fixture-${actor}-token`,'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();assert(response.ok,JSON.stringify({status:response.status,result}));return result;
    }
    async function publish(content:any,expected:string|null,plan?:unknown){
      const saved=await call('drafts',{content,expected_revision:expected,...(plan?{plan}:{})});
      for(const [action,actor] of [['submit','author'],['approve','reviewer'],['publish','reviewer']])await call('transitions',{revision_id:saved.id,action,expected_revision:expected,operation_id:randomUUID()},actor);
      return saved.id as string;
    }
    async function rendered(path:string,revision:string,expected:{title:string;h1:string;lead:string}){
      const response=await fetch(base+path);const html=await response.text();check(response.status,200,'published page HTTP200');
      check(/name="seo-revision" content="([^"]+)"/.exec(html)?.[1],revision,'metadata uses published revision');
      check(/data-seo-revision="([^"]+)"/.exec(html)?.[1],revision,'server body uses same published revision');
      check(html.includes(expected.title),true,'actual published metadata title visible');
      const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
      check(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(visible)?.[1],expected.h1,'actual server body heading matches the revision');
      check(visible.includes(expected.lead),true,'actual server body lead matches the revision');
    }
    const initial=baselineContent('/ja/tools/remove_person')!.content;
    const first={...initial,title:'Isolated publication A｜評価用ページ',h1:'Visible body A｜公開本文の確認',lead:'Visible lead A: isolated fixture content for checking actual server-rendered copy.'};const a=await publish(first,null);await rendered(initial.path,a,first);
    const today=(await db.query<{v:string}>("select ((now() at time zone 'America/Los_Angeles')::date)::text v")).rows[0].v;
    const day=(n:number)=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
    for(let n=-38;n<=-10;n++){if(n===-24)continue;const id=randomUUID();await rpc('seo_ingest_begin',{p_id:id,p_source:'gsc',p_property:'sc-domain:picmoko.com',p_day:day(n),p_grain:'page',p_fixture:true,p_quality:{}});await rpc('seo_ingest_stage',{p_id:id,p_batch:0,p_rows:[{dimensions:{page:initial.path,country:'JP'},measures:{clicks:n<-24?2:5,impressions:100,position:10}}]});await rpc('seo_ingest_finish',{p_id:id,p_batches:1,p_error:null});}
    const plan={hypothesis:'手順と見出しを合わせて検索意図との一致を検証する。',change_summary:'タイトルと本文を同じ利用目的に合わせて変更する。',target_queries:['写真から人を消す'],risk_notes:'季節性と検索結果の変化を分離できない。',rollback_conditions:'機能の説明に誤りや技術的な問題があれば戻す。',source_property:'sc-domain:picmoko.com',baseline_from:day(-38),baseline_to:day(-25),observation_days:14,minimum_impressions:300,is_fixture:true};
    const second={...initial,title:'Isolated publication B｜更新評価ページ',h1:'Visible body B｜更新本文の確認',lead:'Visible lead B: changed fixture content that must replace the prior visible server copy.'};const b=await publish(second,a,plan);await rendered(initial.path,b,second);
    const operation=(await db.query<{operation_id:string}>("select operation_id from seo_changes where revision_id=$1 and action='publish'",[b])).rows[0].operation_id;
    await db.query("update seo_changes set created_at=($2::date::timestamp+interval '12 hours') at time zone 'America/Los_Angeles' where operation_id=$1",[operation,day(-24)]);
    const observation=await call('observations',{revision_id:b,publish_operation_id:operation,operation_id:randomUUID(),observation_to:day(-10),decision:'keep',notes:'Explicit historical fixture. Observational comparison only, never a causal claim.'},'reviewer');
    check(observation.report.comparison_ready,true,'complete fixture evidence window');check(observation.report.delta.clicks,42,'correct before/after comparison');check(observation.report.limitations.includes('observational_not_causal'),true,'observation limits persisted');
    await call('transitions',{revision_id:a,action:'rollback',expected_revision:b,operation_id:randomUUID()},'reviewer');await rendered(initial.path,a,first);
    const guide={...baselineContent('/ja/guides/remove-unwanted-people')!.content,path:'/ja/guides/isolated-published-guide',title:'Isolated new guide｜公開評価ページ'};
    const g=await publish(guide,null);await rendered(guide.path,g,guide);
    const index=await(await fetch(base+'/ja/guides')).text();check(index.includes('href="'+guide.path+'"'),true,'guide directory cache updated after publication');
    const linkedTool=await(await fetch(base+initial.path)).text();check(linkedTool.includes('href="'+guide.path+'"'),true,'published guide becomes a crawlable related tool link after tag invalidation');
    check((await fetch(base+'/ja/guides/unknown-isolated-guide')).status,404,'unpublished guide true 404 in DB mode');
    const [before,afterV1,afterV2]=isolated.samples;
    const sample={before:before.path,after:afterV1.path,model_profile_version:'synthetic-fixture-v1-not-a-model',rights_review:'Local synthetic test only; never a real model sample',evaluated_at:new Date().toISOString(),evaluation_reference:'isolated-test-no-real-evaluation'};
    const eligible={...initial,title:'Isolated indexable fixture｜実モデルの評価例ではありません',h1:'Synthetic index fixture｜合成テスト画像',lead:'Synthetic fixture only. This page tests publication and indexing mechanics without any real model execution.',indexable:true,examples:[sample]};
    const c=await publish(eligible,a);await rendered(initial.path,c,eligible);
    async function indexState(expected:boolean){
      const response=await fetch(base+initial.path),html=await response.text();
      check(/name="robots" content="[^"]*noindex/.test(html),!expected,'page index directive follows the current content revision');
      check(response.headers.get('x-robots-tag')?.includes('noindex')===true,false,'local production indexing mode is enabled without a deployment noindex header');
      const xml=await(await fetch(base+'/sitemap.xml')).text();check(xml.includes('<loc>https://picmoko.com'+initial.path+'</loc>'),expected,'sitemap membership follows publication and rollback');
      return html;
    }
    async function imageState(html:string,snapshot:typeof afterV1){
      const tag=html.match(/<img\b[^>]*>/g)?.find(tag=>tag.includes('src="'+snapshot.path+'"'));
      check(!!tag,true,'evaluated image is present in actual server HTML');
      check(tag?.includes('width="'+snapshot.width+'"')&&tag.includes('height="'+snapshot.height+'"'),true,'intrinsic image dimensions come from the verified manifest');
      const response=await fetch(base+snapshot.path);check(response.status,200,'hashed synthetic image served by Next');
      check(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),snapshot.sha256,'served asset bytes match the evidence hash');
    }
    const htmlV1=await indexState(true);await imageState(htmlV1,before);await imageState(htmlV1,afterV1);
    const bad=await fetch(base+'/api/seo/admin/drafts',{method:'POST',headers:{Authorization:'Bearer fixture-author-token','Content-Type':'application/json'},body:JSON.stringify({content:{...eligible,examples:[{...sample,before:'/seo-examples/missing-'+ 'a'.repeat(64)+'.png'}]},expected_revision:c})});
    check(bad.status,400,'missing sample evidence cannot enter the publication pipeline');
    const revised={...eligible,title:'Isolated model evidence v2｜合成テスト更新',h1:'Synthetic model evidence v2｜合成テスト',lead:'A second synthetic evidence version on the same tool URL, without changing any collection or publication protocol.',examples:[{...sample,after:afterV2.path,model_profile_version:'synthetic-fixture-v2-not-a-model'}]};
    const d=await publish(revised,c);await rendered(initial.path,d,revised);
    const htmlV2=await indexState(true);await imageState(htmlV2,afterV2);check(htmlV2.includes('synthetic-fixture-v2-not-a-model'),true,'new model evidence version is visible');check(htmlV2.includes('src="'+afterV1.path+'"'),false,'old result image is not mixed into the new revision');
    await call('transitions',{revision_id:c,action:'rollback',expected_revision:d,operation_id:randomUUID()},'reviewer');await rendered(initial.path,c,eligible);
    const restored=await indexState(true);await imageState(restored,afterV1);check(restored.includes('src="'+afterV2.path+'"'),false,'model evidence rollback restores the prior image');
    await call('transitions',{revision_id:a,action:'rollback',expected_revision:c,operation_id:randomUUID()},'reviewer');await rendered(initial.path,a,first);
    const excluded=await indexState(false);check(excluded.includes('src="'+before.path+'"'),false,'rollback to the unindexed revision removes sample markup');
    check(await readFile(join(isolated.source,'apps/web/src/content/seo/evidence-manifest.json'),'utf8'),isolated.originalManifest,'normal source manifest is unchanged');
    check(await readFile(join(isolated.source,'apps/web/.next/BUILD_ID'),'utf8').catch(()=>null),isolated.originalBuild,'normal preview build is unchanged');
    const overview=await fetch(base+'/api/seo/admin/overview',{headers:{Authorization:'Bearer fixture-reviewer-token'}});check(overview.status,200,'real HTTP member report including SQL funnel');
    const report=await overview.json();check(report.pages.length,2,'report uses the same published page pointers');check(report.funnel.events,[],'no fabricated business conversions');
    check(report.health.healthy,false,'missing Google collection remains unhealthy');check(report.health.sources.length,4,'source and grain calendars checked separately');check(report.opportunities,[],'missing collection cannot generate optimization suggestions');
    console.log(JSON.stringify({result:'PASS',checks:assertions,isolated_project:true,indexing_fixture:true,synthetic_samples_only:true,transport:'local TLS Auth/PostgREST fixture + real SQL + production Next',cloud:false}));
    if(browserExamples){await call('transitions',{revision_id:d,action:'rollback',expected_revision:a,operation_id:randomUUID()},'reviewer');console.log(JSON.stringify({browser_examples:true,url:base+initial.path,note:'Local synthetic patterns, not real model samples. Press Enter to stop.'}));}
    if(browserFixture){
      // This disposable test-only proxy installs a synthetic browser session. It is never a Next route or production auth bypass.
      const session={access_token:'fixture-reviewer-token',token_type:'bearer',refresh_token:'fixture-refresh-token',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,user:{id:reviewer,aud:'authenticated',role:'authenticated',email:'reviewer@example.invalid',created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[]}};
      previewProxy=createHttpServer((req,res)=>{
        if(req.url==='/fixture-start'||req.url==='/fixture-end'){
          const start=req.url==='/fixture-start';res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
          res.end(`<!doctype html><html lang="zh"><meta charset="utf-8"><title>隔离 SEO 后台验收</title><body><h1>隔离 SEO 后台验收</h1><p>仅本机生成的虚构身份和历史测试数据，不连接真实账户。</p><button onclick='${start?`localStorage.setItem("sb-seo-fixture-auth-token",${JSON.stringify(JSON.stringify(session))})`:'localStorage.removeItem("sb-seo-fixture-auth-token")'};location.href="/admin/seo"'>${start?'进入隔离SEO测试后台':'清除隔离测试身份'}</button></body></html>`);return;
        }
        const upstream=proxyRequest(new URL(req.url||'/',base),{method:req.method,headers:req.headers},incoming=>{res.writeHead(incoming.statusCode||502,incoming.headers);incoming.pipe(res);});upstream.on('error',()=>{res.statusCode=502;res.end('FIXTURE_UNAVAILABLE');});req.pipe(upstream);
      });await new Promise<void>(resolve=>previewProxy!.listen(3170,'127.0.0.1',resolve));
      console.log(JSON.stringify({browser_fixture:true,url:'http://127.0.0.1:3170/fixture-start',note:'Synthetic local identities only. Press Enter to stop.'}));
    }
    if(browserFixture||browserExamples)await new Promise<void>(resolve=>{const done=()=>{process.removeListener('SIGINT',done);process.removeListener('SIGTERM',done);process.stdin.removeListener('data',done);process.stdin.pause();resolve();};process.stdin.once('data',done);process.once('SIGINT',done);process.once('SIGTERM',done);process.stdin.resume();});
  } finally {
    if(previewProxy)await new Promise<void>(resolve=>previewProxy!.close(()=>resolve()));
    if(app&&app.exitCode===null){const ended=new Promise(resolve=>app!.once('exit',resolve));app.kill('SIGTERM');await Promise.race([ended,delay(3000)]);if(app.exitCode===null)app.kill('SIGKILL');}
    if(fixture)await new Promise<void>(resolve=>fixture!.close(()=>resolve()));await db.close();await rm(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
