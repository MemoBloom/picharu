import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { baselineContent } from '../apps/web/src/server/seo/content';

/** Real Next production HTTP + real SQL through a local TLS PostgREST/Auth fixture. No cloud/Google/model calls. */
async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'picjp-seo-publishing-'));
  const db = new PGlite(), author = randomUUID(), reviewer = randomUUID();
  const rpc = async (name: string, args: Record<string, unknown>): Promise<any> => {
    assert(/^seo_[a-z_]+$/.test(name));
    const entries = Object.entries(args); assert(entries.every(([key]) => /^p_[a-z_]+$/.test(key)));
    return (await db.query<{ v: any }>(`select ${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) v`, entries.map(([key, value]) => key === 'p_roles' ? '{' + (value as string[]).join(',') + '}' : value && typeof value === 'object' ? JSON.stringify(value) : value))).rows[0].v;
  };
  let app: ChildProcess | undefined, fixture: ReturnType<typeof createServer> | undefined;
  let assertions = 0;
  const check = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); assertions++; };
  try {
    await db.exec('create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;');
    for (const file of ['202610190001_web_backend.sql','20261020153000_seo.sql','20261020160000_seo_analytics.sql']) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
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
    const env={...process.env,SUPABASE_URL:'https://127.0.0.1:34437',SUPABASE_SECRET_KEY:'sb_secret_isolated_fixture_only',SUPABASE_SERVICE_ROLE_KEY:'',NODE_EXTRA_CA_CERTS:join(directory,'cert.pem'),SEO_CONTENT_BACKEND:'database',SEO_INDEXING_ENABLED:'false',SEO_ANALYTICS_ENABLED:'false',NEXT_PUBLIC_ANALYTICS_ENABLED:'false',NEXT_PUBLIC_GA4_ENABLED:'false',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',GENERATION_ENABLED:'false',MODEL_PROFILES_JSON:'[]'};
    const build=spawn(process.execPath,['node_modules/next/dist/bin/next','build','apps/web'],{env,stdio:'inherit'});
    const buildCode=await new Promise<number|null>((resolve,reject)=>{build.once('error',reject);build.once('exit',resolve);});check(buildCode,0,'database-backed production build');
    app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/web','--hostname','127.0.0.1','--port','3169'],{env,stdio:'inherit'});
    const base='http://127.0.0.1:3169';let ready=false;
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok){ready=true;break;}}catch{}await delay(100);}assert(ready,'test server not ready');
    async function call(route:string,body:unknown,actor='author'){
      const response=await fetch(base+'/api/seo/admin/'+route,{method:'POST',headers:{Authorization:`Bearer fixture-${actor}-token`,'Content-Type':'application/json'},body:JSON.stringify(body)});
      const result=await response.json();assert(response.ok,JSON.stringify({status:response.status,result}));return result;
    }
    async function publish(content:any,expected:string|null){
      const saved=await call('drafts',{content,expected_revision:expected});
      for(const [action,actor] of [['submit','author'],['approve','reviewer'],['publish','reviewer']])await call('transitions',{revision_id:saved.id,action,expected_revision:expected,operation_id:randomUUID()},actor);
      return saved.id as string;
    }
    async function rendered(path:string,revision:string,title:string){
      const response=await fetch(base+path);const html=await response.text();check(response.status,200,'published page HTTP200');
      check(/name="seo-revision" content="([^"]+)"/.exec(html)?.[1],revision,'metadata uses published revision');
      check(/data-seo-revision="([^"]+)"/.exec(html)?.[1],revision,'server body uses same published revision');
      check(html.includes(title),true,'actual published copy visible');
    }
    const initial=baselineContent('/ja/tools/remove_person')!.content;
    const first={...initial,title:'Isolated publication A｜評価用ページ'};const a=await publish(first,null);await rendered(initial.path,a,first.title);
    const second={...initial,title:'Isolated publication B｜更新評価ページ'};const b=await publish(second,a);await rendered(initial.path,b,second.title);
    await call('transitions',{revision_id:a,action:'rollback',expected_revision:b,operation_id:randomUUID()},'reviewer');await rendered(initial.path,a,first.title);
    const guide={...baselineContent('/ja/guides/remove-unwanted-people')!.content,path:'/ja/guides/isolated-published-guide',title:'Isolated new guide｜公開評価ページ'};
    const g=await publish(guide,null);await rendered(guide.path,g,guide.title);
    const index=await(await fetch(base+'/ja/guides')).text();check(index.includes('href="'+guide.path+'"'),true,'guide directory cache updated after publication');
    check((await fetch(base+'/ja/guides/unknown-isolated-guide')).status,404,'unpublished guide true 404 in DB mode');
    const overview=await fetch(base+'/api/seo/admin/overview',{headers:{Authorization:'Bearer fixture-reviewer-token'}});check(overview.status,200,'real HTTP member report including SQL funnel');
    const report=await overview.json();check(report.pages.length,2,'report uses the same published page pointers');check(report.funnel.events,[],'no fabricated business conversions');
    console.log(JSON.stringify({result:'PASS',checks:assertions,transport:'local TLS Auth/PostgREST fixture + real SQL + production Next',cloud:false}));
  } finally {
    if(app&&app.exitCode===null){const ended=new Promise(resolve=>app!.once('exit',resolve));app.kill('SIGTERM');await Promise.race([ended,delay(3000)]);if(app.exitCode===null)app.kill('SIGKILL');}
    if(fixture)await new Promise<void>(resolve=>fixture!.close(()=>resolve()));await db.close();await rm(directory,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
