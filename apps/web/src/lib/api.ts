import { getBrowserAuth } from './auth';
import { analyticsChoice, trackSeoEvent } from './seo-analytics';
import { z } from 'zod';
import { ToolView,ImageView,JobView,CreditView,PublicRecommendation,OrderView,CreditPackage,CheckoutResponse,EditAccepted,UploadResponse,ErrorEnvelope,DeleteImageResponse,DownloadResponse } from '@picjp/contracts';
export class UserFacingError extends Error{}
export class ApiError extends Error{constructor(public status:number,public code:string,public retryable=false,public requestId?:string,public retryAfter?:number){super(code);}}
const messages:Record<string,string>={UNAUTHORIZED:'ログインの有効期限が切れました。もう一度ログインしてください。',NOT_FOUND:'見つからないか、有効期限が切れています。',INVALID_REQUEST:'入力内容と写真の形式を確認してください。',INVALID_PROMPT:'編集内容を選び直してください。',IMAGE_NOT_READY:'写真を確認しています。アップロード完了後にお試しください。',IMAGE_IN_USE:'処理中の写真です。編集が終わってから削除してください。',INSUFFICIENT_CREDITS:'クレジットが足りません。残高をご確認ください。',IDEMPOTENCY_CONFLICT:'編集内容が変わっています。内容を確認して、あらためて操作してください。',JOB_NOT_CANCELLABLE:'すでに処理が始まっているため、キャンセルできません。',UNSUPPORTED_CAPABILITY:'この写真の枚数や設定にはまだ対応していません。設定をご確認ください。',GENERATION_DISABLED:'ただいま編集機能を準備中です。公開までお待ちください。',RATE_LIMITED:'操作が続いています。少し時間をおいてお試しください。',SERVICE_UNAVAILABLE:'ただいま接続できません。時間をおいてお試しください。',ACCOUNT_RESTRICTED:'アカウントの利用が制限されています。お支払い状況をご確認ください。',INTERNAL_ERROR:'処理を完了できませんでした。時間をおいてお試しください。',PAYMENT_MISMATCH:'お支払い状況を確認できませんでした。注文履歴をご確認ください。',INVALID_RESPONSE:'情報を読み込めませんでした。再読み込みしてください。'};
export function errorMessage(error:unknown){if(error instanceof UserFacingError)return error.message;if(error instanceof ApiError)return messages[error.code]??'処理を完了できませんでした。もう一度お試しください。';if(error instanceof DOMException&&error.name==='AbortError')return '通信を中断しました。処理状況をご確認ください。';return '接続できませんでした。通信環境を確認して、もう一度お試しください。';}
type Options={method?:'GET'|'POST'|'DELETE';body?:unknown;authenticated?:boolean;signal?:AbortSignal};
function responseSchema(path:string,method:string):z.ZodTypeAny|undefined{
 const p=path.split('?')[0];
 if(p==='/api/tools')return z.object({tools:z.array(ToolView)});
 if(p==='/api/images/upload-url')return UploadResponse;
 if(p==='/api/images/complete')return ImageView;
 if(/^\/api\/images\/[^/]+\/download$/.test(p))return DownloadResponse;
 if(/^\/api\/images\/[^/]+$/.test(p))return method==='DELETE'?DeleteImageResponse:ImageView;
 if(p==='/api/edit')return EditAccepted;
 if(p==='/api/jobs')return z.object({items:z.array(JobView),next_cursor:z.string().nullable()});
 if(/^\/api\/jobs\/[^/]+(?:\/cancel)?$/.test(p))return JobView;
 if(p==='/api/recommend')return PublicRecommendation;
 if(p==='/api/credits')return CreditView;
 if(p==='/api/credit-packages')return z.object({packages:z.array(CreditPackage)});
 if(p==='/api/checkout')return CheckoutResponse;
 if(p==='/api/orders')return z.object({items:z.array(OrderView),next_cursor:z.string().nullable()});
 if(p==='/api/me')return z.object({user_id:z.string().uuid(),email:z.string().nullable(),locale:z.literal('ja')});
}
export async function api<T>(path:string,options:Options={}):Promise<T>{
 if(!path.startsWith('/api/')||path.startsWith('//')||path.includes('\\'))throw new ApiError(400,'INVALID_REQUEST');
 const method=options.method??'GET';
 if(path==='/api/images/upload-url'&&method==='POST')void trackSeoEvent('upload_start');const authenticated=options.authenticated!==false;const client=authenticated?getBrowserAuth():null;
 let token:string|undefined;let ownerId:string|undefined;
 if(authenticated){if(!client)throw new ApiError(401,'UNAUTHORIZED');const {data,error}=await client.auth.getSession();if(error||!data.session)throw new ApiError(401,'UNAUTHORIZED');token=data.session.access_token;ownerId=data.session.user.id;}
 async function assertOwner(){if(!authenticated||!client)return;const {data,error}=await client.auth.getSession();if(error||data.session?.user.id!==ownerId)throw new ApiError(401,'UNAUTHORIZED');}
 const body=options.body===undefined?undefined:JSON.stringify(options.body);
 async function send(accessToken?:string){return fetch(path,{method,body,cache:'no-store',credentials:'same-origin',headers:{'X-Analytics-Consent':analyticsChoice()==='allow'?'granted':'denied',...(body?{'Content-Type':'application/json'}:{}),...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})},signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});}
 let res:Response;try{res=await send(token);if(res.status===401&&authenticated&&client){await assertOwner();const {data,error}=await client.auth.refreshSession();if(!error&&data.session&&data.session.user.id===ownerId){await assertOwner();res=await send(data.session.access_token);}else if(data.session?.user.id&&data.session.user.id!==ownerId)throw new ApiError(401,'UNAUTHORIZED');}}catch(error){if(options.signal?.aborted||error instanceof ApiError)throw error;throw new ApiError(0,'SERVICE_UNAVAILABLE',true);}
 await assertOwner();
 if(res.status===401&&authenticated&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('picjp:auth-required',{detail:{ownerId}}));
 let payload:unknown;try{payload=await res.json();}catch{throw new ApiError(res.status,'INVALID_RESPONSE',res.status>=500);}
 if(!res.ok){const parsed=ErrorEnvelope.safeParse(payload);const retry=Number(res.headers.get('Retry-After'));throw new ApiError(res.status,parsed.success?parsed.data.error.code:'SERVICE_UNAVAILABLE',parsed.success?parsed.data.error.retryable:res.status>=500,parsed.success?parsed.data.error.request_id:res.headers.get('X-Request-ID')??undefined,Number.isFinite(retry)&&retry>0?retry:undefined);}
 await assertOwner();
 const schema=responseSchema(path,method);if(schema&&!schema.safeParse(payload).success)throw new ApiError(502,'INVALID_RESPONSE',false,res.headers.get('X-Request-ID')??undefined);
 if(/^\/api\/images\/[^/]+\/download$/.test(path))void trackSeoEvent('result_download');
 return payload as T;
}
