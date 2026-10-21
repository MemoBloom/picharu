'use client';
import Link from 'next/link';
import { usePathname,useRouter,useSearchParams } from 'next/navigation';
import { useEffect,useState,type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { ApiError,errorMessage } from '../lib/api';
import { loginHref } from '../lib/navigation';
export function Icon({name='image',size=24}:{name?:string;size?:number}){
 const shapes:Record<string,ReactNode>={
 image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
 edit:<><path d="m14 4 6 6M4 16 16 4a2.8 2.8 0 0 1 4 4L8 20l-5 1z"/></>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
 home:<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/></>,
 tools:<><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12h18M10 12v3h4v-3"/></>,
 person:<><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
 logout:<><path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4"/></>,
 sparkle:<><path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7zM20 2v4M18 4h4"/></>,
 palette:<><path d="M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 1.6-3.2 1.7 1.7 0 0 1 1.4-2.7h2a4 4 0 0 0 4-4A10 10 0 0 0 12 3z"/><circle cx="7" cy="10" r=".7"/><circle cx="10" cy="6.5" r=".7"/><circle cx="15" cy="7" r=".7"/></>,
 paw:<><ellipse cx="12" cy="16" rx="5" ry="4"/><ellipse cx="5" cy="9" rx="2" ry="3"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5" rx="2" ry="3"/><ellipse cx="21" cy="10" rx="2" ry="3"/></>,
 download:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
 upload:<><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
 arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,
 check:<path d="m5 12 4 4L19 6"/>,
 close:<path d="m6 6 12 12M6 18 18 6"/>,
 down:<path d="M12 4v16m-6-6 6 6 6-6"/>,
 chevron:<path d="m6 9 6 6 6-6"/>,
 search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
 sliders:<><path d="M3 6h7m4 0h7M3 12h3m4 0h11M3 18h11m4 0h3"/><circle cx="12" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></>,
 sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
 room:<><path d="M3 11 12 3l9 8v10H3zM8 21v-7h8v7"/></>,
 shirt:<><path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c-1 4-7 4-8 0z"/></>,
 };
 const aliases:Record<string,string>={'arrow-right':'arrow','arrow-down':'down','chevron-down':'chevron',eraser:'edit',landscape:'image',sunset:'sun',sparkles:'sparkle',scissors:'edit',briefcase:'tools',wand:'sparkle',brush:'edit',smile:'person',layers:'image',package:'tools'};
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[aliases[name]??name]??shapes.image}</svg>;
}
export function PageHeading({title,description,backHref,backLabel='戻る'}:{title:string;description?:string;backHref?:string;backLabel?:string}){return <header className="page-heading">{backHref&&<Link className="back-link" href={backHref}>← {backLabel}</Link>}<h1>{title}</h1>{description&&<p>{description}</p>}</header>;}
export function Notice({children,tone='info'}:{children:ReactNode;tone?:'info'|'error'|'success'}){return <div className={`notice notice-${tone}`} role={tone==='error'?'alert':'status'}>{children}</div>;}
export function Loading({label='読み込み中です…'}:{label?:string}){return <div className="loading" role="status"><span className="spinner" aria-hidden="true"/>{label}</div>;}
export function ErrorNotice({error,onRetry}:{error:unknown;onRetry?:()=>void}){return <Notice tone="error"><p>{errorMessage(error)}</p>{error instanceof ApiError&&error.requestId&&<small className="error-reference">お問い合わせ番号: {error.requestId}</small>}{onRetry&&<button className="text-button" onClick={onRetry}>もう一度読み込む</button>}</Notice>;}
export function AuthGate({children}:{children:ReactNode}){
 const {user,ready,configured}=useAuth();const router=useRouter();const pathname=usePathname();const query=useSearchParams();
 const next=pathname+(query.size?`?${query}`:'');
 // A streamed route can hydrate after the outer auth provider has resolved.
 // Its first client render must still match the server's loading placeholder.
 const [hydrated,setHydrated]=useState(false);useEffect(()=>setHydrated(true),[]);
 useEffect(()=>{if(hydrated&&ready&&configured&&!user)router.replace(loginHref(next));},[hydrated,ready,configured,user,router,next]);
 if(!hydrated||!ready)return <Loading/>;
 if(!user)return <div className="auth-required"><PageHeading title="ログインして、続きを。" description="写真や編集の履歴を、あなたのアカウントで管理します。"/><Notice>{configured?'ログイン画面に移動します。':'ログイン機能を準備中です。ツールや使い方をご覧いただけます。'}</Notice><div className="button-row"><Link href={loginHref(next)} className="button">ログインへ</Link><Link href="/ja/tools" className="button button-secondary">ツールを見る</Link></div></div>;
 return <>{children}</>;
}
