'use client';
import { useId } from 'react';
import type { Tool } from '../lib/types';
import { fieldLabel,fieldPlaceholder,optionLabels } from '../lib/editor-ui';
import { Icon } from './ui';
export function EditorField({field,toolId,value,onChange,disabled}:{field:Tool['parameter_fields'][number];toolId:string;value:string;onChange:(value:string)=>void;disabled:boolean}){
 const id=useId();const label=fieldLabel(toolId,field.name);
 if(field.type==='enum')return <fieldset className="editor-fieldset" disabled={disabled}><legend>{label}<span className="field-optional">{field.required?'（必須）':'（任意）'}</span></legend><div className="choice-options">{['',...(field.values||[])].map(option=><label key={option} className={`choice-option${value===option?' selected':''}`}><input type="radio" name={id} value={option} checked={value===option} onChange={()=>onChange(option)}/>{value===option&&<Icon name="check" size={15}/>}<span>{option?optionLabels[option]||option:field.required?'選択してください':'指定しない'}</span></label>)}</div></fieldset>;
 return <label className="field" htmlFor={id}><span>{label}<span className="field-optional">{field.required?'（必須）':'（任意）'}</span></span><input id={id} value={value} maxLength={500} disabled={disabled} required={field.required} placeholder={fieldPlaceholder(toolId,field.name)} onChange={event=>onChange(event.target.value)}/></label>;
}
