import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { ApiError } from './errors';
export async function normalizeImage(bytes:Buffer,declaredMime:string){
 try{
 const image=sharp(bytes,{limitInputPixels:24_000_000,animated:false,failOn:'warning'});const meta=await image.metadata();
 const expected:Record<string,string>={'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'};
 if(meta.format!==expected[declaredMime]||!meta.width||!meta.height||(meta.pages??1)>1)throw new ApiError('INVALID_REQUEST');
 const {data,info}=await image.rotate().toColourspace('srgb').png().toBuffer({resolveWithObject:true});
 if(data.length>32*1024*1024)throw new ApiError('INVALID_REQUEST',413);
 const preview=await sharp(data).resize({width:768,height:768,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:75}).toBuffer();
 if(preview.length>1024*1024)throw new ApiError('INVALID_REQUEST',413);
 return {data,preview,width:info.width,height:info.height,sha256:createHash('sha256').update(data).digest('hex')};
 }catch(e){if(e instanceof ApiError)throw e;throw new ApiError('INVALID_REQUEST');}
}
