'use client';
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode,type RefObject} from 'react';
import {usePathname} from 'next/navigation';
import type {ConsoleBrowserEvent,ConsoleTelemetryConfig,ConsoleEventReceipt} from '@picjp/contracts';
import {useAuth} from '../lib/auth';
import {api,ApiError} from '../lib/api';
import {coarseDevice} from '../lib/device';

type Receipt={event_id:string;recording:'recorded'|'duplicate'|'disabled'};
type Telemetry={enabled:boolean;expose:(tool:string)=>Promise<Receipt>|undefined;select:(tool:string)=>void;view:(job:string)=>void;feedback:(job:string,rating:'positive'|'negative')=>Promise<Receipt>};
const disabled:Telemetry={enabled:false,expose:()=>undefined,select:()=>{},view:()=>{},feedback:async()=>({event_id:'',recording:'disabled'})};
const Context=createContext<Telemetry>(disabled);
const accepted=(r:Receipt)=>r.recording==='recorded'||r.recording==='duplicate';
export function AnalyticsProvider({children}:{children:ReactNode}){
 const {user}=useAuth();return <OwnedTelemetry key={user?.id??'anonymous'} owner={user?.id??null}>{children}</OwnedTelemetry>;
}
function OwnedTelemetry({owner,children}:{owner:string|null;children:ReactNode}){
 const pathname=usePathname();const [config,setConfig]=useState<ConsoleTelemetryConfig|null>(null);
 const scope=useRef<AbortController|null>(null);
 const page=useMemo(()=>({id:crypto.randomUUID(),exposures:new Map<string,{id:string;promise:Promise<Receipt>;selected:boolean}>(),views:new Set<string>()}),[pathname]);
 useEffect(()=>{if(!owner)return;const controller=new AbortController();scope.current=controller;
  void api<ConsoleTelemetryConfig>('/api/analytics/config',{signal:controller.signal,expectedOwnerId:owner}).then(setConfig).catch(()=>{});
  return()=>controller.abort();
 },[owner]);
 const enabled=!!owner&&config?.collection_enabled===true&&!pathname.startsWith('/admin');
 const send=useCallback(async(event:ConsoleBrowserEvent):Promise<Receipt>=>{
  const signal=scope.current?.signal;
  if(!enabled||!owner||!signal||signal.aborted)return {event_id:event.event_id,recording:'disabled'};
  for(let attempt=0;attempt<3;attempt++){
   try{return await api<ConsoleEventReceipt>('/api/analytics/events',{method:'POST',body:event,signal,expectedOwnerId:owner,keepalive:true});}
   catch(error){if(signal.aborted||attempt===2||!(error instanceof ApiError)||!error.retryable)throw error;
    await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,Math.min(4000,(error.retryAfter??(attempt+1))*1000));signal.addEventListener('abort',done,{once:true});});
   }
  }
  return {event_id:event.event_id,recording:'disabled'};
 },[enabled,owner]);
 const expose=useCallback((tool:string)=>{
  if(!enabled)return;
  const previous=page.exposures.get(tool);if(previous)return previous.promise;
  const exposure_id=crypto.randomUUID();
  const promise=send({event_id:crypto.randomUUID(),name:'tool_exposed',occurred_at:new Date().toISOString(),device:coarseDevice(),page_view_id:page.id,tool_id:tool,exposure_id,visible_ms:1000,visible_ratio:0.5});
  // Keep the same event/exposure IDs across network retries and component duplicates.
  page.exposures.set(tool,{id:exposure_id,promise,selected:false});void promise.catch(()=>{});return promise;
 },[enabled,page,send]);
 const select=useCallback((tool:string)=>{
  const exposure=page.exposures.get(tool);if(!enabled||!exposure||exposure.selected)return;
  exposure.selected=true;const occurred_at=new Date().toISOString();
  void exposure.promise.then(r=>{if(accepted(r))return send({event_id:crypto.randomUUID(),name:'tool_selected',occurred_at,device:coarseDevice(),page_view_id:page.id,tool_id:tool,exposure_id:exposure.id});}).catch(()=>{});
 },[enabled,page,send]);
 const view=useCallback((job:string)=>{
  if(!enabled||page.views.has(job))return;page.views.add(job);
  void send({event_id:crypto.randomUUID(),name:'result_viewed',occurred_at:new Date().toISOString(),device:coarseDevice(),page_view_id:page.id,job_id:job}).catch(()=>{});
 },[enabled,page,send]);
 const feedback=useCallback((job:string,rating:'positive'|'negative')=>send({event_id:crypto.randomUUID(),name:'feedback_submitted',occurred_at:new Date().toISOString(),device:coarseDevice(),page_view_id:page.id,job_id:job,rating}),[page,send]);
 const value=useMemo(()=>({enabled,expose,select,view,feedback}),[enabled,expose,select,view,feedback]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** At least half visible continuously for one second in the foreground. */
function useVisible<T extends HTMLElement>(enabled:boolean,onVisible:()=>void):RefObject<T|null>{
 const ref=useRef<T>(null);
 useEffect(()=>{const element=ref.current;if(!enabled||!element||typeof IntersectionObserver==='undefined')return;
  let timer:ReturnType<typeof setTimeout>|undefined,visible=false,done=false;
  const clear=()=>{clearTimeout(timer);timer=undefined;};
  const update=()=>{clear();if(visible&&document.visibilityState==='visible'&&!done)timer=setTimeout(()=>{done=true;onVisible();},1000);};
  const observer=new IntersectionObserver(entries=>{visible=entries.some(e=>e.target===element&&e.isIntersecting&&e.intersectionRatio>=0.5);update();},{threshold:[0,0.5,1]});
  observer.observe(element);document.addEventListener('visibilitychange',update);
  return()=>{clear();observer.disconnect();document.removeEventListener('visibilitychange',update);};
 },[enabled,onVisible]);return ref;
}
export function useToolObservation<T extends HTMLElement=HTMLAnchorElement>(tool:string,available:boolean){
 const telemetry=useContext(Context);const onVisible=useCallback(()=>{void telemetry.expose(tool);},[telemetry.expose,tool]);
 const ref=useVisible<T>(available&&telemetry.enabled,onVisible);
 const onSelect=useCallback(()=>{if(available)telemetry.select(tool);},[available,telemetry.select,tool]);
 return {ref,onSelect};
}
export function useResultObservation(job:string,loaded:boolean){const telemetry=useContext(Context);const seen=useCallback(()=>telemetry.view(job),[telemetry.view,job]);return useVisible<HTMLImageElement>(loaded&&telemetry.enabled,seen);}
export function ObservedToolButton({tool,available,disabled,onClick,children}:{tool:string;available:boolean;disabled?:boolean;onClick:()=>void;children:ReactNode}){const observed=useToolObservation<HTMLButtonElement>(tool,available);return <button ref={observed.ref} className="button button-secondary" disabled={disabled} onClick={()=>{observed.onSelect();onClick();}}>{children}</button>;}
export function ResultFeedback({job,completedAt}:{job:string;completedAt:string|null}){
 const telemetry=useContext(Context);const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(!telemetry.enabled||!completedAt||Date.now()-Date.parse(completedAt)>7*86400000)return null;
 async function rate(rating:'positive'|'negative'){setBusy(true);setMessage('');try{const r=await telemetry.feedback(job,rating);setMessage(accepted(r)?'ご意見を受け付けました。ありがとうございます。':'現在、ご意見の受付を休止しています。');}catch{setMessage('送信できませんでした。もう一度お試しください。');}finally{setBusy(false);}}
 return <section aria-label="仕上がりへのご意見"><p>仕上がりはいかがでしたか？</p><div className="button-row"><button type="button" className="button-secondary" disabled={busy} onClick={()=>void rate('positive')}>満足した</button><button type="button" className="button-secondary" disabled={busy} onClick={()=>void rate('negative')}>改善してほしい</button></div><p role="status">{message}</p></section>;
}
