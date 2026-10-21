'use client';
import { createClient,type SupabaseClient,type User } from '@supabase/supabase-js';
import { createContext,useContext,useEffect,useRef,useState,useSyncExternalStore,type ReactNode } from 'react';
import { clearUserState } from './drafts';
import { publicAuthConfig } from './auth-config';
let browserClient:SupabaseClient|null|undefined;
export function getBrowserAuth(){
 if(typeof window==='undefined')return null;
 if(browserClient!==undefined)return browserClient;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
 const config=publicAuthConfig(url,key,process.env.NODE_ENV!=='production');
 if(!config)return browserClient=null;
 try{return browserClient=createClient(config.url,config.key,{auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});}catch{return browserClient=null;}
}
type AuthState={user:User|null;ready:boolean;configured:boolean;signOut:()=>Promise<void>};
const AuthContext=createContext<AuthState>({user:null,ready:false,configured:false,signOut:async()=>{}});
export function AuthProvider({children}:{children:ReactNode}){
 const [user,setUser]=useState<User|null>(null);const [ready,setReady]=useState(false);const previous=useRef<string|null>(null);const [configured,setConfigured]=useState(false);
 useEffect(()=>{let alive=true;const client=getBrowserAuth();setConfigured(!!client);let revision=0;let reauthRequired:string|null=null;
 const apply=(next:User|null)=>{if(!alive)return;if(previous.current&&previous.current!==next?.id)clearUserState(previous.current);previous.current=next?.id??null;setUser(next);setReady(true);};
 if(!client){setReady(true);return;}
 const reauthenticate=(event:Event)=>{const requested=(event as CustomEvent<{ownerId:string}>).detail?.ownerId;if(requested&&previous.current===requested){revision++;reauthRequired=requested;setUser(null);setReady(true);}};
 const completed=(event:Event)=>{const next=(event as CustomEvent<{user:User}>).detail?.user;if(next?.id){revision++;reauthRequired=null;apply(next);}};
 window.addEventListener('picjp:auth-required',reauthenticate);
 window.addEventListener('picjp:auth-complete',completed);
 const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{revision++;if(reauthRequired&&(!session||session.user.id===reauthRequired))return;reauthRequired=null;apply(session?.user??null);});
 const initialRevision=revision;
 client.auth.getSession().then(({data,error})=>{if(alive&&revision===initialRevision)apply(error?null:data.session?.user??null);}).catch(()=>{if(revision===initialRevision)apply(null);});
 return()=>{alive=false;subscription.unsubscribe();window.removeEventListener('picjp:auth-required',reauthenticate);window.removeEventListener('picjp:auth-complete',completed);};
 },[]);
 async function signOut(){const client=getBrowserAuth();if(user)clearUserState(user.id);if(client){const {error}=await client.auth.signOut();if(error)throw new Error('ログアウトできませんでした。もう一度お試しください。');}previous.current=null;setUser(null);}
 return <AuthContext.Provider value={{user,ready,configured,signOut}}>{children}</AuthContext.Provider>;
}
const subscribeToHydration=()=>()=>{};
const clientSnapshot=()=>true;
const serverSnapshot=()=>false;
export function useAuth(){
 const state=useContext(AuthContext);
 // Streamed children can hydrate after the provider has loaded its session.
 // Keep their first hydration snapshot identical to the server render.
 const hydrated=useSyncExternalStore(subscribeToHydration,clientSnapshot,serverSnapshot);
 return hydrated?state:{...state,user:null,ready:false,configured:false};
}

export async function finishReauthentication(expectedOwnerId?:string){const client=getBrowserAuth();if(!client)throw new Error("Unable to complete authentication");const {data,error}=await client.auth.getSession();if(error||!data.session||(expectedOwnerId&&data.session.user.id!==expectedOwnerId))throw new Error("Unable to complete authentication");window.dispatchEvent(new CustomEvent("picjp:auth-complete",{detail:{user:data.session.user}}));}
