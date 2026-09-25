'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useEffect,useSyncExternalStore,type ReactNode} from 'react';
import {mutate} from 'swr';
import {useAuth} from './provider';
import {Icon} from './icons';
import {api} from '@/lib/api';
const nav=[['/','grid','Обзор'],['/areas','tree','Лесные участки'],['/devices','sensor','Датчики'],['/events','bell','События'],['/methodology','chart','Алгоритм риска'],['/authors','users','Авторы']];
const roles={ADMIN:'Администратор',MANAGER:'Менеджер',VIEWER:'Наблюдатель'};
const subscribeTheme=(notify:()=>void)=>{const observer=new MutationObserver(notify);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});return ()=>observer.disconnect();};
export function Shell({children}:{children:ReactNode}){
 const path=usePathname(),router=useRouter(),{user,loading,live,reload}=useAuth();
 const dark=useSyncExternalStore(subscribeTheme,()=>document.documentElement.dataset.theme==='dark',()=>false);
 const isAuth=path==='/login'||path==='/register';
 const isPublic=isAuth||path==='/authors'||path==='/methodology';
 useEffect(()=>{if(!loading&&!user&&!isPublic)router.replace('/login');},[loading,user,isPublic,router]);
 function theme(){const next=!dark;document.documentElement.dataset.theme=next?'dark':'light';try{localStorage.setItem('firewatch-theme',next?'dark':'light');}catch{}}
 async function logout(){await api('/auth/logout',{method:'POST'});await mutate(()=>true,undefined,{revalidate:false});await reload();router.push('/login');}
 if(isAuth) return <div className="auth-layout"><button className="theme-toggle auth-theme" onClick={theme} aria-label="Переключить тему"><Icon name={dark?'sun':'moon'}/></button>{children}</div>;
 return <div className="app-shell">
 <aside className="sidebar">
  <Link className="brand" href="/"><span className="brand-mark"><Icon name="flame" size={25}/></span><span>Fire<span className="brand-light">Watch</span><small>FOREST MONITORING</small></span></Link>
  <div className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
  <nav>{nav.map(([href,icon,label])=><Link key={href} href={href} className={'nav-item '+(path===href||(href==='/areas'&&path.startsWith('/areas/'))?'active':'')}><Icon name={icon}/>{label}{href==='/events'&&<span className="nav-dot"/>}</Link>)}
   {user?.role==='ADMIN'&&<Link href="/users" className={'nav-item '+(path==='/users'?'active':'')}><Icon name="users"/>Пользователи</Link>}
  </nav>
  <div className="sidebar-bottom"><div className="connection-note"><span className={'status-dot '+(live?'online':'')}/><span>{live?'Поток подключён':'Поток не подключён'}<small>Обновление каждые 15 секунд</small></span></div>
  <div className="profile"><div className="avatar">{user?.name.slice(0,1)||'F'}</div><div><b>{user?.name||'Гость'}</b><small>{user?roles[user.role]:'FireWatch'}</small></div>{user&&<button className="icon-button" onClick={()=>void logout()} aria-label="Выйти"><Icon name="logout" size={18}/></button>}</div></div>
 </aside>
 <div className="workspace"><header className="topbar"><div className="breadcrumb">Мониторинг лесов <span>/</span><strong>{nav.find(([h])=>h===path)?.[2]||(path==='/users'?'Пользователи':'Участок')}</strong></div><div className="top-actions"><span className="version-tag">FUSION v1.0</span><button className="theme-toggle" onClick={theme} aria-label="Переключить тему"><Icon name={dark?'sun':'moon'} size={19}/></button>{user&&<button className="icon-button mobile-logout" onClick={()=>void logout()} aria-label="Выйти"><Icon name="logout" size={18}/></button>}{!user&&<Link className="button primary small" href="/login">Войти</Link>}</div></header>
 <main className="main-content">{!isPublic&&(loading||!user)?<div className="loading"><span className="spinner"/>Подключаем рабочее пространство…</div>:children}</main>
 <footer className="footer"><span>FireWatch <span>•</span> Интеллектуальный мониторинг лесных участков</span><Link href="/authors">Команда проекта <span>↗</span></Link></footer></div>
 </div>;
}
