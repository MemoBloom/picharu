'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { loginHref } from '../lib/navigation';
import { Icon } from './ui';
function AccountLink({mobile=false,signedIn=false,href='/ja/login',current=false}:{mobile?:boolean;signedIn?:boolean;href?:string;current?:boolean}){
 return <Link className={mobile?'mobile-account':`header-account${signedIn?'':' header-login'}`} href={href} aria-label={signedIn?'マイページ':'ログイン・新規登録'} aria-current={current?'page':undefined}><Icon name="person" size={mobile?22:18}/><span>{signedIn?'マイページ':mobile?'ログイン':<>ログイン<span className="header-signup">・新規登録</span></>}</span></Link>;
}
export function LoginNavigationFallback({mobile=false}:{mobile?:boolean}){return <AccountLink mobile={mobile}/>;}
export function LoginNavigation({mobile=false}:{mobile?:boolean}){
 const path=usePathname(),query=useSearchParams(),{user}=useAuth();
 const [hydrated,setHydrated]=useState(false);useEffect(()=>setHydrated(true),[]);const signedIn=hydrated&&!!user;
 const target=path==='/ja/login'?query.get('next')||'/ja/edit':path+(query.size?`?${query}`:'');
 return <AccountLink mobile={mobile} signedIn={signedIn} href={signedIn?'/ja/account':loginHref(target)} current={signedIn?path==='/ja/account':path==='/ja/login'}/>;
}
