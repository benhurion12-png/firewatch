'use client';
import {useState} from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {api,send,errorText,formatTime} from '@/lib/api';
import {useAuth} from '@/components/provider';
import {PageHeading,Loading,ErrorBox,Empty,Badge} from '@/components/ui';
import type {Event} from '@/lib/types';
export default function EventsPage(){
 const {data,error,mutate}=useSWR<Event[]>('/events',api,{refreshInterval:15000}),{user}=useAuth();
 const [filter,setFilter]=useState('all'),[actionError,setActionError]=useState(''),[busy,setBusy]=useState('');
 const manage=user?.role==='ADMIN'||user?.role==='MANAGER';
 const events=data?.filter(e=>filter==='all'||(filter==='alerts'&&e.kind==='RISK'&&['WARNING','HIGH','CRITICAL'].includes(e.level)&&!e.acknowledgedAt)||(filter==='audit'&&e.kind==='AUDIT'))||[];
 async function ack(id:string){setBusy(id);setActionError('');try{await send('/events/'+id+'/acknowledge',{});await mutate();}catch(e){setActionError(errorText(e));}finally{setBusy('');}}
 return <><PageHeading eyebrow="ОПЕРАТОРСКИЙ ЖУРНАЛ" title="События и предупреждения" description="Изменения риска, состояние сенсоров и действия команды в одном журнале."/><div className="toolbar"><div className="tabs">{[['all','Все события'],['alerts','Не принятые предупреждения'],['audit','Действия команды']].map(([value,label])=><button key={value} className={filter===value?'selected':''} onClick={()=>setFilter(value)}>{label}</button>)}</div><span className="muted">{events.length} записей</span></div><ErrorBox message={error?.message||actionError}/>{!data&&!error?<Loading/>:events.length?<div className="panel event-list">{events.map(event=><article key={event.id} className="event-row"><div className="event-time"><b>{formatTime(event.createdAt).slice(-8)}</b><span>{formatTime(event.createdAt).slice(0,5)}</span></div><div className="event-main"><div><Badge level={event.level}/><span className="tiny muted">{event.kind==='AUDIT'?'ДЕЙСТВИЕ ОПЕРАТОРА':'ИЗМЕНЕНИЕ СОСТОЯНИЯ'}</span></div>{event.areaId?<Link href={'/areas/'+event.areaId}><h3>{event.area?.name||'Лесной участок'}</h3></Link>:<h3>Система FireWatch</h3>}<p>{event.message}</p>{event.acknowledgedAt&&<small className="muted">Принято {event.acknowledgedBy} · {formatTime(event.acknowledgedAt)}</small>}</div>{manage&&event.kind==='RISK'&&!event.acknowledgedAt&&<button className="button secondary small" disabled={busy===event.id} onClick={()=>void ack(event.id)}>{busy===event.id?'Сохраняем…':'Принять в работу'}</button>}</article>)}</div>:<Empty title="Событий пока нет" text="Новые предупреждения появятся автоматически при изменении риска."/>}<p className="muted tiny">Показаны последние 300 событий. «Принять в работу» фиксирует реакцию оператора и не сбрасывает уровень риска.</p></>;
}
