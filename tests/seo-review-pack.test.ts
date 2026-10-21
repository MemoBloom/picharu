import { describe,it,expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { renderReviewPacket } from '../scripts/seo/review-pack';
import { baselineContent } from '../apps/web/src/server/seo/content';

describe('Chinese review material stays tied to the exact public content version',()=>{
 it('rejects old translations after the corresponding Japanese content changes',async()=>{
  const input=JSON.parse(await readFile('docs/seo/launch-review-zh.json','utf8'));
  expect(()=>renderReviewPacket(input,path=>{const value=baselineContent(path);return value?{...value,revision:'git-sha256-'+ 'a'.repeat(24)}:null;})).toThrow('SEO_REVIEW_TRANSLATION_STALE');
 });
 it('rejects missing or duplicate candidates and a mismatched paragraph pairing',async()=>{
  const input=JSON.parse(await readFile('docs/seo/launch-review-zh.json','utf8'));
  expect(()=>renderReviewPacket({...input,candidates:input.candidates.slice(1)})).toThrow('SEO_REVIEW_SHORTLIST_MISMATCH');
  expect(()=>renderReviewPacket({...input,candidates:[...input.candidates.slice(1),input.candidates[1]]})).toThrow('SEO_REVIEW_SHORTLIST_MISMATCH');
  input.candidates[0].sections.pop();expect(()=>renderReviewPacket(input)).toThrow('SEO_REVIEW_TRANSLATION_SHAPE');
 });
});
