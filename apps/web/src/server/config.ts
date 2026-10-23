import { ModelProfile } from '@picjp/contracts';
import { z } from 'zod';
import { ApiError } from './errors';
export function required(name:string){const v=process.env[name];if(!v)throw new ApiError('SERVICE_UNAVAILABLE',503,true);return v;}
export function models(){try{return z.array(ModelProfile).parse(JSON.parse(process.env.MODEL_PROFILES_JSON??'[]'));}catch{throw new ApiError('SERVICE_UNAVAILABLE',503,true);}}
export function generationEnabled(){return process.env.GENERATION_ENABLED==='true';}
export function retentionDays(){const n=Number(process.env.IMAGE_RETENTION_DAYS??7);return Number.isInteger(n)&&n>=1&&n<=30?n:7;}
export function appOrigin(){const u=new URL(required('APP_ORIGIN'));if(u.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(u.hostname)))throw new ApiError('SERVICE_UNAVAILABLE',503);return u.origin;}

// Restricted first-test rollout: missing or malformed configuration denies all new jobs.
export function generationTestUserId(){
 const parsed=z.string().uuid().safeParse(process.env.GENERATION_TEST_USER_ID);
 return parsed.success?parsed.data.toLowerCase():null;
}
export function generationTestAllowed(userId:string,toolId:string){
 return generationEnabled()&&toolId==='illustration_photo'&&generationTestUserId()===userId.toLowerCase();
}
