import { z } from 'zod';
import { ToolId,InputRole,type ModelProfile } from '@picjp/contracts';
import catalog from './catalog.json';
import { isRetiredTool } from './lifecycle';
export { isRetiredTool, retiredToolIds } from './lifecycle';
const text=z.string().trim().min(1).max(500);
const strength=z.enum(['subtle','balanced','strong']);
const styles=z.enum(['natural','anime','watercolor','line_art','chibi','studio','cinematic']);
const specs:Record<ToolId,z.AnyZodObject>={
  remove_person:z.object({target:text.optional()}),remove_object:z.object({target:text.optional()}),
  change_background:z.object({background:text.optional(),strength:strength.optional()}),
  photo_color_grade:z.object({style:styles.optional(),strength:strength.optional()}),
  weather_season:z.object({weather:z.enum(['sunny','rain','snow','cloudy']).optional(),season:z.enum(['spring','summer','autumn','winter']).optional(),strength:strength.optional()}),
  light_time:z.object({time:z.enum(['morning','day','sunset','night']).optional(),strength:strength.optional()}),
  ai_avatar:z.object({style:styles.optional(),composition:text.optional()}),natural_beauty:z.object({target:text.optional(),strength:strength.optional()}),
  hair_color:z.object({target:text.optional(),color:text.optional(),strength:strength.optional()}),
  hairstyle:z.object({target:text.optional(),hairstyle:text.optional()}),professional_headshot:z.object({background:text.optional(),outfit:text.optional()}),
  anime_photo:z.object({style:styles.optional(),strength:strength.optional()}),illustration_photo:z.object({style:styles.optional(),strength:strength.optional()}),
  chibi_person:z.object({style:styles.optional(),target:text.optional()}),pet_illustration:z.object({style:styles.optional(),target:text.optional()}),
  pet_humanization:z.object({style:styles.optional(),outfit:text.optional(),mode:z.enum(['costume','human_character']).optional()}),
  multi_photo_composite:z.object({composition:text.optional()}),product_background:z.object({background:text.optional()}),
  room_redesign:z.object({style:text.optional(),preserve:text.optional()}),clothing_recolor:z.object({target:text.optional(),color:text.optional(),strength:strength.optional()})
};
const portraits=new Set<ToolId>(['ai_avatar','natural_beauty','hair_color','hairstyle','professional_headshot','chibi_person']);
const pets=new Set<ToolId>(['pet_illustration','pet_humanization']);
export const tools=catalog.map((entry)=>{
  const id=ToolId.parse(entry.tool_id);
  return {tool_id:id,name_ja:entry.name_ja,name_zh:entry.name_zh,category:entry.category,tool_version:1,
    minimum_input_count:id==='multi_photo_composite'?2:1,maximum_input_count:4,required_input_roles:['primary'] as const,
    allowed_roles:InputRole.options,default_prompt_id:`${id}_default`,evaluation_state:'unverified' as const,
    subjects:pets.has(id)?['dog','cat','pet']:portraits.has(id)?['person']:['person','pet','landscape','object'],
    risk:entry.main_risk,parameters_schema:specs[id].strict()};
});
// Complete historical catalog is retained above; public product scope uses this view.
export const activeTools=tools.filter(tool=>!isRetiredTool(tool.tool_id));
export function getTool(id:ToolId){return tools.find(t=>t.tool_id===id)!;}
export function validateToolParameters(id:ToolId,parameters:Record<string,unknown>){return getTool(id).parameters_schema.parse(parameters);}
export function profileForTool(id:ToolId,profiles:ModelProfile[]){return profiles.find(p=>p.verified_tool_ids.includes(id));}
