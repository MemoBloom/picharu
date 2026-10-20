import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CONTRACT_VERSION,type ErrorCode } from '@picjp/contracts';
export class ApiError extends Error{
 constructor(public code:z.infer<typeof ErrorCode>,public status=400,public retryable=false,public retryAfter?:number){super(code);}
}
export const errorStatus:Record<string,number>={INVALID_REQUEST:400,NOT_FOUND:404,IMAGE_NOT_READY:409,IMAGE_IN_USE:409,INSUFFICIENT_CREDITS:402,IDEMPOTENCY_CONFLICT:409,JOB_NOT_CANCELLABLE:409,UNSUPPORTED_CAPABILITY:409,ACCOUNT_RESTRICTED:403,PAYMENT_MISMATCH:409};
export function requestId(request:Request){const v=request.headers.get('X-Request-ID');return v&&z.string().uuid().safeParse(v).success?v:randomUUID();}
export function response(data:unknown,id:string,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Request-ID':id,'X-Contract-Version':CONTRACT_VERSION}});}
export function failure(err:unknown,id:string){
 const api=err instanceof ApiError?err:err instanceof z.ZodError?new ApiError('INVALID_REQUEST'):new ApiError('INTERNAL_ERROR',500,true);
 const res=response({error:{code:api.code,message:api.status===500?'Internal service error':api.code,request_id:id,retryable:api.retryable}},id,api.status);
 if(api.retryAfter)res.headers.set('Retry-After',String(api.retryAfter));
 // Only code + request_id; never log images, auth headers, signed URLs or prompt text.
 if(api.status>=500)console.error(JSON.stringify({request_id:id,error_code:api.code}));
 return res;
}
export async function boundedBytes(request:Request,limit=16384){
 const length=Number(request.headers.get('content-length'));if(length>limit)throw new ApiError('INVALID_REQUEST',413);
 if(!request.body)return Buffer.alloc(0);
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let n=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>limit){await reader.cancel();throw new ApiError('INVALID_REQUEST',413);}chunks.push(value);}}finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}
export async function json<T>(request:Request,schema:z.ZodType<T,any,any>):Promise<T>{
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new ApiError('INVALID_REQUEST',415);
 const bytes=await boundedBytes(request);let data:unknown;
 try{data=JSON.parse(bytes.toString('utf8'));}catch{throw new ApiError('INVALID_REQUEST');}
 return schema.parse(data);
}
