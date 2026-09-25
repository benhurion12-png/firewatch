'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {send,errorText} from '@/lib/api';
import {useAuth} from './provider';
import {Icon} from './icons';
import {ErrorBox} from './ui';
export function AuthForm({register=false}:{register?:boolean}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),router=useRouter(),{reload}=useAuth();
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);setBusy(true);setError('');
  try {await send(register?'/auth/register':'/auth/login',{email:form.get('email'),password:form.get('password'),...(register?{name:form.get('name')}: {})});await reload();router.push('/');}catch(e){setError(errorText(e));}finally{setBusy(false);}
 }
 return <div className="auth-card"><div className="auth-story"><Link className="brand" href="/"><span className="brand-mark"><Icon name="flame" size={25}/></span><span>FireWatch<small>FOREST MONITORING</small></span></Link><div className="auth-story-copy"><span className="eyebrow">ТЕХНОЛОГИИ НА СТРАЖЕ ПРИРОДЫ</span><h1>Увидеть риск.<br/>Сохранить лес.</h1><p>Температура, влажность и признаки пламени — в одной системе раннего обнаружения.</p></div><div className="forest-art" aria-hidden="true">{Array.from({length:11},(_,i)=><span key={i} style={{left:i*10+'%',height:(110+(i*43)%150)+'px'}}/>)}<div className="orbit"/><div className="orbit second"/></div><div className="auth-story-foot"><span className="status-dot online"/>HMP155 + FS24X <span>•</span> MQTT</div></div>
 <div className="auth-form"><span className="eyebrow">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</span><h2>{register?'Создать аккаунт':'С возвращением'}</h2><p>{register?'Новый аккаунт получает роль наблюдателя.':'Войдите, чтобы наблюдать за состоянием леса.'}</p><form onSubmit={submit}>
 {register&&<label>Имя<input name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="Как к вам обращаться"/></label>}
 <label>Email<input type="email" name="email" autoComplete="email" required placeholder="name@example.com"/></label>
 <label>Пароль<input type="password" name="password" autoComplete={register?'new-password':'current-password'} required minLength={10} maxLength={72} placeholder="Не менее 10 символов"/></label>
 <ErrorBox message={error}/><button className="button primary full" disabled={busy}>{busy?'Подключение…':register?'Зарегистрироваться':'Войти в FireWatch'}<Icon name="arrow" size={18}/></button></form>
 <p className="auth-switch">{register?'Уже есть аккаунт?':'Нет аккаунта?'} <Link href={register?'/login':'/register'}>{register?'Войти':'Зарегистрироваться'}</Link></p><div className="auth-links"><Link href="/authors">Авторы проекта</Link><Link href="/methodology">Как работает FireWatch</Link></div></div></div>;
}
