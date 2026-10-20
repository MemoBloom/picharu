import { S3Client,GetObjectCommand,PutObjectCommand,DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Storage } from './ports';
import { required } from './config';
import { ApiError } from './errors';
export class R2Storage implements Storage{
 private cached?:S3Client;
 // A presigned upload has no body yet; never sign the SDK's checksum of an empty body.
 private get client(){return this.cached??=new S3Client({region:'auto',endpoint:`https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,requestChecksumCalculation:'WHEN_REQUIRED',credentials:{accessKeyId:required('R2_ACCESS_KEY_ID'),secretAccessKey:required('R2_SECRET_ACCESS_KEY')}});}
 private get bucket(){return required('R2_BUCKET');}
 signPut(key:string,mime:string,bytes:number){return getSignedUrl(this.client,new PutObjectCommand({Bucket:this.bucket,Key:key,ContentType:mime,ContentLength:bytes}),{expiresIn:300,signableHeaders:new Set(['content-type','content-length'])});}
 async read(key:string,maxBytes:number){
 let obj;try{obj=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key}));}catch(error){if((error as {name?:string}).name==='NoSuchKey')throw new ApiError('IMAGE_NOT_READY',409);throw error;}
 if(!obj.Body)throw new ApiError('IMAGE_NOT_READY',409);
 const reader=obj.Body.transformToWebStream().getReader();
 if((obj.ContentLength??0)>maxBytes){await reader.cancel();throw new ApiError('INVALID_REQUEST',413);}
 const chunks:Buffer[]=[];let n=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>maxBytes){await reader.cancel();throw new ApiError('INVALID_REQUEST',413);}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 return {bytes:Buffer.concat(chunks),mime:obj.ContentType??''};
 }
 async write(key:string,bytes:Buffer,mime:string){await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:bytes,ContentType:mime}));}
 async remove(keys:string[]){if(!keys.length)return;const res=await this.client.send(new DeleteObjectsCommand({Bucket:this.bucket,Delete:{Objects:keys.map(Key=>({Key}))}}));if(res.Errors?.length)throw new ApiError('SERVICE_UNAVAILABLE',503,true);}
 signGet(key:string,attachment=false){return getSignedUrl(this.client,new GetObjectCommand({Bucket:this.bucket,Key:key,...(attachment?{ResponseContentDisposition:'attachment; filename="picjp-image.png"'}:{})}),{expiresIn:300});}
}
