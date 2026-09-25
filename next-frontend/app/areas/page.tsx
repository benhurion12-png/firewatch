'use client';
import {useState,type FormEvent} from 'react';
import useSWR from 'swr';
import {api,send,errorText} from '@/lib/api';
import {useAuth} from '@/components/provider';
import {PageHeading,Loading,ErrorBox,Empty,FormModal} from '@/components/ui';
import {AreaCard} from '@/components/area-card';
import {Icon} from '@/components/icons';
import type {Area,Dashboard} from '@/lib/types';
export default function AreasPage(){
 const {user}=useAuth(),{data,error,mutate}=useSWR<Dashboard>('/dashboard',api,{refreshInterval:15000});
 const [query,setQuery]=useState(''),[edit,setEdit]=useState<Area|'new'|null>(null),[formError,setFormError]=useState(''),[busy,setBusy]=useState(false);
 const manage=user?.role==='ADMIN'||user?.role==='MANAGER';
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setFormError('');
 try{await send(edit==='new'?'/areas':'/areas/'+(edit as Area).id,{name:f.get('name'),location:f.get('location'),description:f.get('description'),lat:Number(f.get('lat')),lng:Number(f.get('lng')),hectares:Number(f.get('hectares'))},edit==='new'?'POST':'PUT');setEdit(null);await mutate();}catch(e){setFormError(errorText(e));}finally{setBusy(false);}}
 async function remove(area:Area){if(!confirm('Удалить пустой участок «'+area.name+'»? Участки с измерениями защищены от удаления.'))return;try{await api('/areas/'+area.id,{method:'DELETE'});await mutate();}catch(e){setFormError(errorText(e));}}
 const areas=data?.areas.filter(a=>(a.name+' '+a.location).toLowerCase().includes(query.toLowerCase()))||[];
 const existing=edit&&edit!=='new'?edit:null;
 return <><PageHeading eyebrow="ТЕРРИТОРИИ" title="Лесные участки" description="У каждого участка своя пара датчиков и независимая история." action={manage&&<button className="button primary" onClick={()=>{setFormError('');setEdit('new');}}><Icon name="plus" size={17}/>Добавить участок</button>}/>
 <div className="toolbar"><div className="search-field"><Icon name="search" size={18}/><input aria-label="Поиск участков" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти участок или регион…"/></div><span className="muted">{areas.length} участков</span></div>
 <ErrorBox message={error?.message||(!edit?formError:'')}/>{!data&&!error?<Loading/>:areas.length?<div className="area-grid">{areas.map(area=><div key={area.id}><AreaCard area={area}/>{manage&&<div className="management-actions"><button onClick={()=>{setFormError('');setEdit(area);}}>Редактировать</button><button onClick={()=>void remove(area)}>Удалить пустой участок</button></div>}</div>)}</div>:<Empty title="Участки не найдены" text={query?'Попробуйте изменить поисковый запрос.':'Создайте участок и назначьте ему датчики.'}/>}
 {edit&&<FormModal title={edit==='new'?'Новый лесной участок':'Редактирование участка'} onClose={()=>setEdit(null)}><form onSubmit={save}><label>Название<input name="name" required minLength={2} maxLength={100} defaultValue={existing?.name} placeholder="Например, Бурабай · Северный лес" autoFocus/></label><label>Регион<input name="location" required minLength={2} maxLength={160} defaultValue={existing?.location} placeholder="Область или лесничество"/></label><div className="form-row"><label>Широта<input name="lat" type="number" step="any" required min={-90} max={90} defaultValue={existing?.lat} placeholder="53.083"/></label><label>Долгота<input name="lng" type="number" step="any" required min={-180} max={180} defaultValue={existing?.lng} placeholder="70.305"/></label></div><label>Площадь, га<input name="hectares" type="number" min={0} max={100000000} step="any" required defaultValue={existing?.hectares??0}/></label><label>Описание<textarea name="description" maxLength={2000} defaultValue={existing?.description} rows={3}/></label><ErrorBox message={formError}/><button className="button primary full" disabled={busy}>{busy?'Сохранение…':'Сохранить участок'}</button></form></FormModal>}
 </>;
}
