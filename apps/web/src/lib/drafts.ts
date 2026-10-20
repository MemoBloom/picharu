import { EditRequest,InputRole,ToolId,Id } from '@picjp/contracts';
import { z } from 'zod';
const draftSchema=z.object({toolId:ToolId,inputs:z.array(z.object({image_id:Id,role:InputRole})).max(4),parameters:z.record(z.string().max(500)),instruction:z.string().max(1000),quality:z.enum(['standard','high']),aspectRatio:z.string(),parentJobId:Id.optional(),pendingRequest:EditRequest.optional()});
export type EditorDraft={toolId:string;inputs:{image_id:string;role:z.infer<typeof InputRole>}[];parameters:Record<string,string>;instruction:string;quality:'standard'|'high';aspectRatio:string;parentJobId?:string;pendingRequest?:z.infer<typeof EditRequest>};
const key=(userId:string)=>`picjp:draft:${userId}`;
export function loadDraft(userId:string):EditorDraft|null{try{const value=sessionStorage.getItem(key(userId));if(!value)return null;const parsed=draftSchema.safeParse(JSON.parse(value));return parsed.success?parsed.data:null;}catch{return null;}}
export function saveDraft(userId:string,draft:EditorDraft){try{const parsed=draftSchema.safeParse(draft);if(!parsed.success)return false;sessionStorage.setItem(key(userId),JSON.stringify(parsed.data));return true;}catch{return false;}}
export function clearDraft(userId:string){try{sessionStorage.removeItem(key(userId));}catch{}}
export function clearUserState(userId:string){try{for(let i=sessionStorage.length-1;i>=0;i--){const k=sessionStorage.key(i);if(k?.startsWith('picjp:')&&k.split(':').includes(userId))sessionStorage.removeItem(k);}}catch{}}
