'use client';
import {useState} from 'react';
import useSWR from 'swr';
import {api,send,errorText} from '@/lib/api';
import {useAuth} from '@/components/provider';
import {PageHeading,Loading,ErrorBox} from '@/components/ui';
import type {User,Role,Dashboard} from '@/lib/types';
export default function UsersPage(){
 const {user}=useAuth(),{data,error,mutate}=useSWR<User[]>(user?.role==='ADMIN'?'/users':null,api),[notice,setNotice]=useState(''),[busy,setBusy]=useState('');
 const {data:dashboard,mutate:reloadDashboard}=useSWR<Dashboard>(user?.role==='ADMIN'?'/dashboard':null,api);
 const [recordingBusy,setRecordingBusy]=useState(false);
 async function change(id:string,role:Role){setNotice('');setBusy(id);try{await send('/users/'+id,{role},'PATCH');await mutate();}catch(e){setNotice(errorText(e));}finally{setBusy('');}}
 async function toggleRecording(){setNotice('');setRecordingBusy(true);try{await send('/recording',{enabled:!dashboard?.recording},'PATCH');await reloadDashboard();}catch(e){setNotice(errorText(e));}finally{setRecordingBusy(false);}}
 if(user?.role!=='ADMIN')return <ErrorBox message="Управление пользователями доступно администратору."/>;
 const recording=dashboard?.recording??true;
 return <><PageHeading eyebrow="КОНТРОЛЬ ДОСТУПА" title="Команда и роли" description="Новые пользователи становятся наблюдателями. Назначайте права по задачам команды."/><ErrorBox message={error?.message||notice}/>
 <div className="panel recording-panel"><div><h3>Запись телеметрии в базу данных</h3><p className="muted">{recording?'Новые показания датчиков сохраняются в PostgreSQL и обновляют оценку риска.':'Новые показания отбрасываются: датчики продолжают публиковать данные, но ничего не записывается в PostgreSQL.'}</p></div><div className="recording-status"><span className={'status-dot '+(recording?'online':'')}/><span>{recording?'Запись активна':'Запись приостановлена'}</span><button className={'button small '+(recording?'secondary':'primary')} disabled={!dashboard||recordingBusy} onClick={()=>void toggleRecording()}>{recordingBusy?'Сохраняем…':recording?'Приостановить запись':'Возобновить запись'}</button></div></div>
 {!data&&!error?<Loading/>:<div className="panel table-scroll"><table><thead><tr><th>Пользователь</th><th>Email</th><th>Роль</th></tr></thead><tbody>{data?.map(person=><tr key={person.id}><td><b>{person.name}</b>{person.id===user.id&&<small className="table-sub">Это вы</small>}</td><td>{person.email}</td><td><select aria-label={'Роль '+person.name} value={person.role} disabled={person.id===user.id||busy===person.id} onChange={e=>void change(person.id,e.target.value as Role)}><option value="VIEWER">Наблюдатель</option><option value="MANAGER">Менеджер</option><option value="ADMIN">Администратор</option></select></td></tr>)}</tbody></table></div>}<div className="role-grid">{[['Наблюдатель','Просматривает участки, поток показаний, историю и события.'],['Менеджер','Управляет участками, регистрирует и назначает датчики, принимает предупреждения.'],['Администратор','Все возможности менеджера и управление ролями пользователей.']].map(([title,text])=><div className="panel" key={title}><h3>{title}</h3><p className="muted">{text}</p></div>)}</div></>;
}
