'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import useSWR,{mutate} from 'swr';
import {io} from 'socket.io-client';
import {api,ApiError} from '@/lib/api';
import type {User} from '@/lib/types';
const Context=createContext<{user:User|null;loading:boolean;live:boolean;reload:()=>Promise<unknown>}>({user:null,loading:true,live:false,reload:async()=>{}});
export function Provider({children}:{children:ReactNode}){
 const {data,error,isLoading,mutate:reload}=useSWR<User>('/auth/me',api,{shouldRetryOnError:false,revalidateOnFocus:true});
 const [live,setLive]=useState(false);
 const userId=data?.id;
 useEffect(()=>{
   if(!userId) return;
   const socket=io({path:'/realtime',addTrailingSlash:false,transports:['polling'],withCredentials:true});
   let timer:ReturnType<typeof setTimeout>|undefined;
   socket.on('connect',()=>setLive(true));
   socket.on('disconnect',()=>setLive(false));
   socket.on('connect_error',()=>setLive(false));
   socket.on('changed',()=>{if(!timer) timer=setTimeout(()=>{timer=undefined;void mutate(key=>typeof key==='string'&&key!=='/auth/me');},350);});
   return ()=>{socket.disconnect();if(timer)clearTimeout(timer);setLive(false);};
 },[userId]); // Session is revalidated by the server as well.
 return <Context.Provider value={{user:error?null:data??null,loading:isLoading,live,reload}}>{error&&!(error instanceof ApiError&&error.status===401)?<div className="global-error" role="alert">API недоступен. Проверьте запуск сервисов FireWatch.</div>:null}{children}</Context.Provider>;
}
export const useAuth=()=>useContext(Context);
