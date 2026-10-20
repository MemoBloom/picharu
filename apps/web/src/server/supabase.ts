import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database,Row } from './ports';
import { ApiError,errorStatus } from './errors';
import { required } from './config';
export function dbError(error:{message:string}|null){if(!error)return;const code=Object.keys(errorStatus).find(c=>error.message.includes(c));throw code?new ApiError(code as any,errorStatus[code]):new ApiError('SERVICE_UNAVAILABLE',503,true);}
export class SupabaseDatabase implements Database{
 private cached?:SupabaseClient;
 private get client(){
  if(this.cached)return this.cached;
  const key=process.env.SUPABASE_SECRET_KEY||required('SUPABASE_SERVICE_ROLE_KEY');
  return this.cached=createClient(required('SUPABASE_URL'),key,{
   auth:{persistSession:false,autoRefreshToken:false},
   global:{fetch:async(input,init)=>{
    const headers=new Headers(init?.headers);
    // SDK services may use the API key as a Bearer fallback. New secret keys
    // belong only in apikey; preserve explicit getUser(userJwt) authorization.
    if(key.startsWith('sb_secret_')&&headers.get('authorization')===`Bearer ${key}`)headers.delete('authorization');
    return fetch(input,{...init,headers});
   }},
  });
 }
 async authenticate(token:string){const {data,error}=await this.client.auth.getUser(token);if(error||!data.user)throw new ApiError('UNAUTHORIZED',401);return {id:data.user.id,email:data.user.email};}
 async rpc<T=Row>(name:string,args:Row):Promise<T>{const {data,error}=await this.client.rpc(name,args);dbError(error);return data as T;}
 async one(table:string,filters:Row){let q=this.client.from(table).select('*');for(const [k,v]of Object.entries(filters))q=q.eq(k,v);const {data,error}=await q.maybeSingle();dbError(error);return data;}
 async findJob(ownerId:string,key:string){return this.one('edit_jobs',{owner_id:ownerId,idempotency_key:key});}
 async list(table:string,ownerId:string,limit:number,cursor?:string){let q=this.client.from(table).select('*').eq('owner_id',ownerId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit);
 if(cursor){const [date,id]=cursor.split('|');q=q.or(`created_at.lt.${date},and(created_at.eq.${date},id.lt.${id})`);}const {data,error}=await q;dbError(error);return data??[];}
 async packages(){const {data,error}=await this.client.from('credit_packages').select('*').eq('active',true).order('amount_minor');dbError(error);return data??[];}
 async markCleanup(id:string,pending:boolean){const {error}=await this.client.from('images').update({cleanup_pending:pending}).eq('id',id).eq('status','deleted');dbError(error);}
}
