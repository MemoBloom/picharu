import type { SeoContent } from '@picjp/contracts';

/** Tool IDs keep guide relationships stable when the rendering model changes. */
export function relatedGuideLinks(toolId:string,contents:SeoContent[]){
 const unique=new Map<string,{path:string;title:string}>();
 for(const content of contents){
  if(content.kind!=='guide'||!/^\/ja\/guides\/[a-z0-9-]+$/.test(content.path)||!content.related_tools.includes(toolId))continue;
  unique.set(content.path,{path:content.path,title:content.h1});
 }
 return [...unique.values()].sort((a,b)=>a.path.localeCompare(b.path)).slice(0,3);
}
