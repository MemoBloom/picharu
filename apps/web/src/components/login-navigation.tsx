'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { loginHref } from '../lib/navigation';
import { Icon } from './ui';
import { LogoutButton } from './logout-button';
function AccountMenu({path}:{path:string}){
 const [open,setOpen]=useState(false),id=useId(),container=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>setOpen(false),[path]);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false);};
  const focusOutside=(event:FocusEvent)=>{if(!container.current?.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('focusin',focusOutside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',focusOutside);document.removeEventListener('keydown',escape);};
 },[open]);
 return <div className="header-account-menu" ref={container}>
  <button ref={trigger} className="header-account" type="button" aria-expanded={open} aria-controls={id} aria-label="マイページ・ログアウト" onClick={()=>setOpen(value=>!value)}><Icon name="person" size={18}/><span>マイページ</span><Icon name="chevron" size={14}/></button>
  {open&&<div className="account-menu-panel" id={id}><Link href="/ja/account" onClick={()=>setOpen(false)}>マイページを見る</Link><Link href="/ja/history" onClick={()=>setOpen(false)}>編集履歴を見る</Link><Link href="/ja/help" onClick={()=>setOpen(false)}>サポート</Link><LogoutButton className="account-menu-logout"/></div>}
 </div>;
}
function AccountLink({mobile=false,signedIn=false,href='/ja/login',current=false}:{mobile?:boolean;signedIn?:boolean;href?:string;current?:boolean}){
 return <Link className={mobile?'mobile-account':`header-account${signedIn?'':' header-login'}`} href={href} aria-label={signedIn?'マイページ':'ログイン・新規登録'} aria-current={current?'page':undefined}><Icon name="person" size={mobile?22:18}/><span>{signedIn?'マイページ':mobile?'ログイン':<>ログイン<span className="header-signup">・新規登録</span></>}</span></Link>;
}
export function LoginNavigationFallback({mobile=false}:{mobile?:boolean}){return <AccountLink mobile={mobile}/>;}
export function LoginNavigation({mobile=false}:{mobile?:boolean}){
 const path=usePathname(),query=useSearchParams(),{user}=useAuth();
 const [hydrated,setHydrated]=useState(false);useEffect(()=>setHydrated(true),[]);const signedIn=hydrated&&!!user;
 const target=path==='/ja/login'?query.get('next')||'/ja/edit':path+(query.size?`?${query}`:'');
 if(signedIn&&!mobile)return <AccountMenu key={user!.id} path={path}/>;
 return <AccountLink mobile={mobile} signedIn={signedIn} href={signedIn?'/ja/account':loginHref(target)} current={signedIn?(path==='/ja/account'||path==='/ja/history'||path.startsWith('/ja/jobs/')):path==='/ja/login'}/>;
}
