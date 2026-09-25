'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import {api,formatTime} from '@/lib/api';
import type {Dashboard,Event} from '@/lib/types';
import {PageHeading,Loading,ErrorBox,Empty,Badge} from '@/components/ui';
import {AreaCard} from '@/components/area-card';
import {Icon} from '@/components/icons';
const ForestMap=dynamic(()=>import('@/components/map'),{ssr:false,loading:()=> <div className="forest-map"><Loading/></div>});
export default function DashboardPage(){
 const {data,error}=useSWR<Dashboard>('/dashboard',api,{refreshInterval:15000});
 const {data:events}=useSWR<Event[]>('/events',api,{refreshInterval:15000});
 if(error)return <ErrorBox message={error.message}/>;
 if(!data)return <Loading/>;
 const {areas}=data,alerts=areas.filter(a=>['HIGH','CRITICAL'].includes(a.risk.level));
 const connected=areas.flatMap(a=>a.devices).filter(d=>d.lastReading&&new Date(data.serverTime).getTime()-new Date(d.lastReading.measuredAt).getTime()<180000&&!d.lastReading.fault).length;
 const total=areas.reduce((n,a)=>n+a.hectares,0),simulated=areas.some(a=>a.risk.simulated);
 return <>
  <PageHeading eyebrow="ОБЗОР СИСТЕМЫ" title="Лес под наблюдением" description="Всё, что нужно знать о состоянии ваших лесных участков." action={<Link href="/areas" className="button primary"><Icon name="plus" size={17}/>Управление участками</Link>}/>
  {simulated&&<div className="demo-strip"><span className="status-dot"/><b>Демонстрационный поток</b><span>Показания поступают из симулятора сенсоров.</span><Link href="/methodology">Как устроен анализ <span>↗</span></Link></div>}
  {!data.brokerConnected&&<ErrorBox message="Нет соединения с брокером. Показаны последние сохранённые данные; свежесть датчиков проверяется отдельно."/>}
  <div className="stats-grid">
   {[{icon:'tree',label:'Лесных участков',value:areas.length,note:'На интерактивной карте',tone:'green'},{icon:'sensor',label:'Датчиков на связи',value:connected,note:'HMP155 + FS24X',tone:'neutral'},{icon:'bell',label:'Участков с тревогой',value:alerts.length,note:'Высокий и критический риск',tone:'red'},{icon:'pin',label:'Площадь участков',value:total.toLocaleString('ru-RU'),note:'га · заявленная площадь',tone:'orange'}].map(s=><div className="stat-card" key={s.label}><div className="stat-title">{s.label}<span className={'stat-icon '+s.tone}><Icon name={s.icon} size={18}/></span></div><strong>{s.value}</strong><small>{s.note}</small></div>)}
  </div>
  <div className="overview-grid"><section className="panel map-panel"><div className="section-heading"><div><h2>Карта мониторинга</h2><p>Состояние участков в реальном времени</p></div><span className="subtle-tag">{areas.length} участка</span></div><ForestMap areas={areas}/></section>
  <section className="panel activity-panel"><div className="section-heading"><h2>Последние события</h2><Link href="/events" className="text-link">Все <Icon name="arrow" size={15}/></Link></div><div className="activity-list">{events?.slice(0,5).map(event=><Link href={event.areaId?'/areas/'+event.areaId:'/events'} className="activity-item" key={event.id}><span className={'activity-icon '+event.level.toLowerCase()}><Icon name={event.kind==='RISK'?'bell':'sensor'} size={16}/></span><div><div className="activity-meta"><Badge level={event.level}/><time>{formatTime(event.createdAt).slice(-8)}</time></div><b>{event.area?.name||'Система FireWatch'}</b><p>{event.message}</p></div></Link>)}{!events?.length&&<Empty title="Пока нет событий" text="Здесь появятся изменения риска и действия операторов."/>}</div><div className="activity-footer"><Icon name="wifi" size={15}/>Обновлено {formatTime(data.serverTime).slice(-8)}</div></section></div>
  <div className="section-heading section-space"><div><h2>Ваши лесные участки</h2><p>Два источника данных. Единая оценка риска.</p></div><Link href="/areas" className="text-link">Все участки <Icon name="arrow" size={16}/></Link></div>
  {areas.length?<div className="area-grid">{areas.map(area=><AreaCard area={area} key={area.id}/>)}</div>:<Empty title="Добавьте первый лесной участок" text="Затем зарегистрируйте HMP155 и FS24X и назначьте их участку."><Link href="/areas" className="button primary">Добавить участок</Link></Empty>}
 </>;
}
