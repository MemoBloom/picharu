// @vitest-environment jsdom
import React, {act, useEffect, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AnalyticsProvider, ObservedToolButton, ResultFeedback} from '../apps/web/src/components/analytics-provider';
import {AuthCallbackPage} from '../apps/web/src/components/auth-pages';
import {rememberLoginTarget} from '../apps/web/src/lib/auth-flow';
import {api, ApiError} from '../apps/web/src/lib/api';

const state=vi.hoisted(()=>({owner:null as string|null,path:'/auth/callback',listeners:new Set<()=>void>(),replace:vi.fn(),exchange:vi.fn(),verify:vi.fn(),session:vi.fn()}));
vi.mock('next/navigation',()=>{const router={replace:state.replace};return {usePathname:()=>state.path,useRouter:()=>router,useSearchParams:()=>new URLSearchParams()};});
vi.mock('../apps/web/src/lib/auth',async()=>{
 const {useSyncExternalStore}=await import('react');
 return {
  useAuth:()=>{const owner=useSyncExternalStore(callback=>{state.listeners.add(callback);return()=>state.listeners.delete(callback);},()=>state.owner,()=>null);return {user:owner?{id:owner}:null,ready:true,configured:true};},
  getBrowserAuth:()=>({auth:{exchangeCodeForSession:state.exchange,verifyOtp:state.verify,getSession:state.session}}),
  finishReauthentication:async(owner:string)=>{if(owner!==state.owner)throw Error('Wrong owner');},
 };
});
vi.mock('../apps/web/src/lib/api',()=>({api:vi.fn(),ApiError:class ApiError extends Error{constructor(public status:number,public code:string,public retryable=false){super(code);}}}));
const ownerA='00000000-0000-4000-8000-000000000001',ownerB='00000000-0000-4000-8000-000000000002';
const apiMock=api as unknown as ReturnType<typeof vi.fn<(path:string,options?:{expectedOwnerId?:string;signal?:AbortSignal;body?:{name?:string}})=>Promise<unknown>>>;
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function result(){return {data:{session:{user:{id:state.owner}}},error:null};}
let root:Root,host:HTMLDivElement;
async function flush(fn:()=>void|Promise<void>=()=>{}){await act(async()=>{await fn();});}
async function owner(id:string|null){await flush(()=>{state.owner=id;for(const notify of state.listeners)notify();});}
async function render(children:React.ReactNode){await flush(()=>root.render(React.createElement(AnalyticsProvider,null,children)));}
const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(el=>el.textContent===text)!;

beforeEach(()=>{
 vi.clearAllMocks();state.owner=null;state.path='/auth/callback';state.listeners.clear();
 vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 window.history.replaceState(null,'','/auth/callback?code=fixture-code');sessionStorage.clear();
 state.session.mockImplementation(async()=>result());
 apiMock.mockImplementation(async(path:string)=>path==='/api/analytics/config'?{collection_enabled:true}:path==='/api/me'?{user_id:state.owner}:{recording:'recorded'});
});
afterEach(async()=>{await flush(()=>root.unmount());host.remove();vi.useRealTimers();vi.unstubAllGlobals();});

describe('authentication completion across analytics identity changes',()=>{
 it.each(['code','email'] as const)('keeps the real %s callback mounted after consuming the credential',async kind=>{
  const response=deferred<ReturnType<typeof result>>();state.exchange.mockReturnValue(response.promise);state.verify.mockReturnValue(response.promise);
  window.history.replaceState(null,'',kind==='code'?'/auth/callback?code=fixture-code':'/auth/callback?token_hash=fixture-hash&type=email');
  rememberLoginTarget(sessionStorage,'/ja/account?tab=credits');
  await render(React.createElement(AuthCallbackPage));expect(location.search).toBe('');
  // Supabase emits SIGNED_IN before its one-time exchange promise completes.
  await owner(ownerA);await flush(()=>response.resolve(result()));
  expect(state.replace).toHaveBeenLastCalledWith('/ja/account?tab=credits');
  expect(kind==='code'?state.exchange:state.verify).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain('ログインを確認できませんでした');
 });
 it('retries account preparation without exchanging the consumed code again',async()=>{
  const response=deferred<ReturnType<typeof result>>();state.exchange.mockReturnValue(response.promise);let reads=0;
  apiMock.mockImplementation(async path=>{if(path==='/api/me'){if(++reads===1)throw new ApiError(503,'SERVICE_UNAVAILABLE',true);return {user_id:state.owner};}return {collection_enabled:false};});
  rememberLoginTarget(sessionStorage,'/ja/account');await render(React.createElement(AuthCallbackPage));
  await owner(ownerA);await flush(()=>response.resolve(result()));
  expect(button('アカウントをもう一度確認')).toBeDefined();expect(state.replace).not.toHaveBeenCalled();
  await flush(()=>button('アカウントをもう一度確認').click());
  expect(reads).toBe(2);expect(state.exchange).toHaveBeenCalledTimes(1);expect(state.replace).toHaveBeenLastCalledWith('/ja/account');
 });
});

describe('account state and telemetry isolation',()=>{
 it.each(['/ja/account','/ja/history','/ja/edit','/admin/users'])('resets local product state on account switch and sign-out: %s',async path=>{
  state.path=path;state.owner=ownerA;let setDraft!:(value:string)=>void;let mounts=0;
  function PrivatePage(){const [draft,set]=useState('');setDraft=set;useEffect(()=>{mounts++;},[]);return React.createElement('output',null,draft);}
  await render(React.createElement(PrivatePage));await flush(()=>setDraft('private-A'));
  expect(host.textContent).toBe('private-A');await owner(ownerB);expect(host.textContent).toBe('');expect(mounts).toBe(2);
  await flush(()=>setDraft('private-B'));await owner(null);expect(host.textContent).toBe('');expect(mounts).toBe(3);
 });
 it('does not apply a late previous-owner configuration to the new account',async()=>{
  state.path='/ja/account';state.owner=ownerA;const first=deferred<unknown>(),second=deferred<unknown>();
  apiMock.mockImplementation((_path,options)=>options?.expectedOwnerId===ownerA?first.promise:second.promise);
  await render(React.createElement(ResultFeedback,{job:'fixture-job',completedAt:new Date().toISOString()}));
  const firstOptions=apiMock.mock.calls[0][1]!;await owner(ownerB);expect(firstOptions.signal?.aborted).toBe(true);
  await flush(()=>first.resolve({collection_enabled:true}));expect(host.querySelector('button')).toBeNull();
  await flush(()=>second.resolve({collection_enabled:false}));expect(host.querySelector('button')).toBeNull();
  await owner(null);expect(apiMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
 });
 it('drops a queued selection when the original exposure finishes after account switch',async()=>{
  vi.useFakeTimers();state.path='/ja/edit';state.owner=ownerA;
  const pending=deferred<{recording:string}>();const observers:Array<{callback:IntersectionObserverCallback;target:Element|null}>=[];
  class Observer{item:{callback:IntersectionObserverCallback;target:Element|null};constructor(callback:IntersectionObserverCallback){this.item={callback,target:null};observers.push(this.item);}observe(target:Element){this.item.target=target;}disconnect(){}}
  vi.stubGlobal('IntersectionObserver',Observer);
  apiMock.mockImplementation(async(path,options)=>path==='/api/analytics/config'?{collection_enabled:true}:options?.body?.name==='tool_exposed'?pending.promise:{recording:'recorded'});
  await render(React.createElement(ObservedToolButton,{tool:'ai_avatar',available:true,onClick:()=>{},children:'choose'}));
  expect(observers.length).toBeGreaterThan(0);const observer=observers.at(-1)!;
  await flush(async()=>{observer.callback([{target:observer.target!,isIntersecting:true,intersectionRatio:1} as IntersectionObserverEntry],{} as IntersectionObserver);await vi.advanceTimersByTimeAsync(1000);});
  await flush(()=>button('choose').click());
  const sent=apiMock.mock.calls.filter(([path])=>path==='/api/analytics/events');expect(sent).toHaveLength(1);expect(sent[0][1]?.expectedOwnerId).toBe(ownerA);
  await owner(ownerB);expect(sent[0][1]?.signal?.aborted).toBe(true);
  await flush(()=>pending.resolve({recording:'recorded'}));
  expect(apiMock.mock.calls.filter(([path])=>path==='/api/analytics/events')).toHaveLength(1);
 });
 it('cancels a retry waiting in backoff when the user signs out',async()=>{
  vi.useFakeTimers();state.path='/ja/account';state.owner=ownerA;
  apiMock.mockImplementation(async path=>{if(path==='/api/analytics/config')return {collection_enabled:true};throw new ApiError(503,'SERVICE_UNAVAILABLE',true);});
  await render(React.createElement(ResultFeedback,{job:'fixture-job',completedAt:new Date().toISOString()}));
  await flush(()=>button('満足した').click());expect(apiMock.mock.calls.filter(([p])=>p==='/api/analytics/events')).toHaveLength(1);
  await owner(null);await flush(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(apiMock.mock.calls.filter(([p])=>p==='/api/analytics/events')).toHaveLength(1);expect(host.querySelector('button')).toBeNull();
 });
});
