import {describe,it,expect,vi} from 'vitest';
import {ToolId} from '@picjp/contracts';
import {activeTools} from '@picjp/tool-config';
import {findToolContent,findHistoricalToolContent,findPublicToolContent,publicToolContent} from '../apps/web/src/lib/tool-content';
vi.mock('../apps/web/src/components/public-pages',()=>({ToolDetail:()=>null}));
import Page,{dynamicParams,generateStaticParams,generateMetadata} from '../apps/web/src/app/ja/tools/[toolId]/page';

describe('current public scope and immutable historical tool names',()=>{
 it('publishes exactly 18 unique directions without the two retired erasure tools',()=>{
  const ids=publicToolContent.map(tool=>tool.tool_id);
  expect(ids).toHaveLength(18);expect(new Set(ids).size).toBe(18);
  expect([...ids].sort()).toEqual(activeTools.map(tool=>tool.tool_id).sort());
  expect(ids).not.toContain('remove_person');expect(ids).not.toContain('remove_object');
  expect(ids).toContain('ai_avatar');expect(ids).toContain('anime_photo');expect(ids).toContain('illustration_photo');expect(ids).toContain('chibi_person');
 });
 it('continues resolving all 20 contract IDs for historical jobs and analytics',()=>{
  expect(ToolId.options).toHaveLength(20);
  for(const id of ToolId.options){const content=findToolContent(id);expect(content?.tool_id).toBe(id);expect(content?.name_ja).toBeTruthy();expect(content?.name_zh).toBeTruthy();}
  expect(findToolContent('remove_person')?.name_zh).toBe('去除路人');
  expect(findToolContent('remove_object')?.name_zh).toBe('去除杂物');
  expect(findHistoricalToolContent).toBe(findToolContent);
  expect(findPublicToolContent('remove_person')).toBeUndefined();expect(findPublicToolContent('remove_object')).toBeUndefined();
 });
 it('generates only current detail routes and disallows dynamic fallback for retired URLs',()=>{
  expect(dynamicParams).toBe(false);
  expect(generateStaticParams()).toEqual(publicToolContent.map(t=>({toolId:t.tool_id})));
 });
 it.each(['remove_person','remove_object','not_a_tool'])('rejects retired or unknown public page and metadata: %s',async toolId=>{
  const args={params:Promise.resolve({toolId})};
  await expect(Page(args)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  await expect(generateMetadata(args)).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
 });
 it('retains valid metadata for every current direction',async()=>{
  for(const t of publicToolContent)await expect(generateMetadata({params:Promise.resolve({toolId:t.tool_id})})).resolves.toEqual({title:t.name_ja,description:t.description});
 });
});
