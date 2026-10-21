import { describe,it,expect } from 'vitest';
import { partitionFields,missingRequiredFields,fieldLabel,fieldPlaceholder } from '../apps/web/src/lib/editor-ui';
import type { Tool } from '../apps/web/src/lib/types';
const field=(name:string,required=false)=>({name,type:'string' as const,required});
describe('Task-specific editor presentation',()=>{
 it('keeps desired color visible while moving subject and strength to details',()=>{
  const result=partitionFields({tool_id:'hair_color',parameter_fields:[field('target'),field('color'),field('strength')]});
  expect(result.primary.map(f=>f.name)).toEqual(['color']);expect(result.advanced.map(f=>f.name)).toEqual(['target','strength']);
 });
 it('keeps removal target visible even though the contract permits an instruction instead',()=>{
  expect(partitionFields({tool_id:'remove_object',parameter_fields:[field('target')]}).primary).toEqual([field('target')]);
 });
 it('never hides a newly required server field in detailed settings',()=>{
  const next=field('new_required_option',true);expect(partitionFields({tool_id:'natural_beauty',parameter_fields:[next,field('strength')]}).primary).toEqual([next]);
 });
 it('retains composition for multi-photo edits',()=>{
  expect(partitionFields({tool_id:'multi_photo_composite',parameter_fields:[field('composition')]}).primary).toHaveLength(1);
 });
 it('recognizes missing required fields but leaves optional parameters unspecified',()=>{
  const tool={parameter_fields:[field('new_required_option',true),field('strength')]};
  expect(missingRequiredFields(tool,{new_required_option:'  '})).toEqual([field('new_required_option',true)]);
  expect(missingRequiredFields(tool,{new_required_option:'value'})).toEqual([]);
 });
 it('uses task-specific subject labels and examples',()=>{
  expect(fieldLabel('remove_person','target')).toBe('消したい人物');expect(fieldLabel('hair_color','target')).toBe('色を変える人物');
  expect(fieldPlaceholder('remove_object','target')).toContain('空き缶');expect(fieldPlaceholder('hair_color','target')).not.toContain('赤い服');
 });
 it('keeps unknown field semantics readable and required fields visible for future tools',()=>{
  const result=partitionFields({tool_id:'future_tool' as Tool['tool_id'],parameter_fields:[field('future_input',true),field('optional_input')]});
  expect(result.primary.map(f=>f.name)).toEqual(['future_input']);expect(fieldLabel('future_tool','future_input')).toBe('future_input');
 });
});
