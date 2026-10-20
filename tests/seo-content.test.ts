import { seoIntents } from '../apps/web/src/content/seo/intent-map';
import { describe, it, expect } from 'vitest';
import { SeoContent } from '../packages/contracts/src/seo';
import { baselineContent, contentPaths } from '../apps/web/src/server/seo/content';
import { publicToolContent } from '../apps/web/src/lib/tool-content';
describe('versioned public SEO content and quality gates',()=>{
 it('covers every tool and guide without inventing evaluated results',()=>{
  expect(publicToolContent).toHaveLength(20);
  for(const path of contentPaths()){
   const snapshot=baselineContent(path)!;expect(snapshot).not.toBeNull();
   expect(snapshot.content.path).toBe(path);expect(snapshot.content.indexable).toBe(false);
   expect(snapshot.content.examples).toEqual([]);expect(snapshot.content.sections.length).toBeGreaterThan(0);
  }
  expect(baselineContent('/ja/tools/not-a-tool')).toBeNull();
 });
 it('rejects indexable tool content without sample and model evaluation evidence',()=>{
  const content=baselineContent('/ja/tools/remove_person')!.content;
  expect(SeoContent.safeParse({...content,indexable:true}).success).toBe(false);
  expect(SeoContent.safeParse({...content,path:'https://evil.test/ja'}).success).toBe(false);
  expect(SeoContent.safeParse({...content,examples:[{before:'https://private.test/photo',after:'/seo-examples/result.png'}]}).success).toBe(false);
 });
});

it('maps every current tool to one initial intent and keeps priorities separate from measured demand',()=>{
 expect(new Set(seoIntents.map(r=>r.tool_id)).size).toBe(20);
 for(const row of seoIntents){expect(row.path).toBe('/ja/tools/'+row.tool_id);expect(baselineContent(row.path)?.content.keywords).toContain(row.primary_keyword_ja);expect(row.metrics_status).toBe('unverified');}
});

it('adds current published guide relationships without duplicating links or changing model protocols',async()=>{
 const {relatedGuideLinks}=await import('../apps/web/src/lib/seo-content-links');
 const guide=baselineContent('/ja/guides/remove-unwanted-people')!.content;
 const added={...guide,path:'/ja/guides/new-preparation',h1:'新しい準備ガイド'};
 expect(relatedGuideLinks('remove_person',[guide,added])).toContainEqual({path:added.path,title:added.h1});
 expect(relatedGuideLinks('hair_color',[guide,added])).toEqual([]);
 expect(relatedGuideLinks('remove_person',[guide,guide])).toHaveLength(1);
 expect(relatedGuideLinks('remove_person',[{...guide,path:'/ja/account'}])).toEqual([]);
});
