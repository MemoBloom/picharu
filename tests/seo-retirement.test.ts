import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { ToolId } from '@picjp/contracts';
import { activeTools,getTool } from '@picjp/tool-config';
import { findHistoricalToolContent,findToolContent,publicToolContent } from '../apps/web/src/lib/tool-content';
vi.mock('next/cache',()=>({unstable_cache:(fn:unknown)=>fn}));
vi.mock('../apps/web/src/server/seo/repository',()=>({seoRpc:vi.fn()}));
import { seoRpc } from '../apps/web/src/server/seo/repository';
import { allPublishedContent,baselineContent,getPublishedContent } from '../apps/web/src/server/seo/content';
import { proxy } from '../apps/web/src/proxy';
import { NextRequest } from 'next/server';
import { opportunities } from '../apps/web/src/server/seo/metrics';
const retired=['/ja/tools/remove_person','/ja/tools/remove_object','/ja/guides/remove-unwanted-people'];
beforeEach(()=>{vi.stubEnv('SEO_CONTENT_BACKEND','database');vi.mocked(seoRpc).mockReset();});
afterEach(()=>vi.unstubAllEnvs());
describe('retirement overrides historical public content without invalidating history',()=>{
 it('keeps historic measurements readable without suggesting retired destinations for new optimization',()=>{
  const rows=[...retired,'/ja/tools/change_background'].map(page=>({dimensions:{page},measures:{clicks:3,impressions:600,position:8}}));
  expect(opportunities(rows).map(row=>row.path)).toEqual(['/ja/tools/change_background']);
  expect(rows).toHaveLength(4);
 });
 it('keeps 18 discovery entries and all historical IDs and labels',()=>{
  expect(publicToolContent.map(t=>t.tool_id).sort()).toEqual(activeTools.map(t=>t.tool_id).sort());
  expect(publicToolContent).toHaveLength(18);
  for(const id of ['remove_person','remove_object'] as const){
   expect(ToolId.parse(id)).toBe(id);expect(getTool(id).tool_id).toBe(id);
   expect(findHistoricalToolContent(id)?.tool_id).toBe(id);expect(findToolContent(id)).toBeUndefined();
  }
 });
 it('returns early 404 and noindex without asking the database to revive retired URLs',async()=>{
  for(const path of retired){
   const response=await proxy(new NextRequest('https://picmoko.com'+path));
   expect(response.status).toBe(404);expect(response.headers.get('x-robots-tag')).toBe('noindex');
   expect(await getPublishedContent(path)).toBeNull();expect(baselineContent(path)).toBeNull();
  }
  expect(seoRpc).not.toHaveBeenCalled();
 });
 it('excludes previously published removed pages from database directories and sitemap inputs',async()=>{
  const active=baselineContent('/ja/tools/change_background')!;
  const rows=retired.map(path=>({...active,revision:'old-'+path,content:{...active.content,path,kind:path.includes('/guides/')?'guide':'tool'}}));
  vi.mocked(seoRpc).mockResolvedValue(rows);
  const contents=await allPublishedContent();
  expect(contents).toHaveLength(21);
  for(const path of retired)expect(contents.some(row=>row.content.path===path)).toBe(false);
  expect(contents.some(row=>row.content.path==='/ja/guides/change-background-photo')).toBe(true);
 });
});
