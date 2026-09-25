'use client';
import type {ReactNode} from 'react';
import {Icon} from './icons';
import type {Level,Risk} from '@/lib/types';
export const levels:Record<Level,string>={UNKNOWN:'Нет оценки',NORMAL:'Норма',WARNING:'Внимание',HIGH:'Высокий',CRITICAL:'Критический'};
export function Badge({level}:{level:Level}){return <span className={'badge '+level.toLowerCase()}><i/>{levels[level]}</span>;}
export function PageHeading({eyebrow,title,description,action}:{eyebrow:string;title:string;description?:string;action?:ReactNode}){return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>;}
export function ErrorBox({message}:{message?:string}){return message?<div className="error-box" role="alert">{message}</div>:null;}
export function Empty({title,text,children}:{title:string;text:string;children?:ReactNode}){return <div className="empty"><Icon name="tree" size={35}/><h3>{title}</h3><p>{text}</p>{children}</div>;}
export function Loading(){return <div className="loading"><span className="spinner"/>Загрузка данных…</div>;}
export function RiskGauge({risk}:{risk:Risk}){const score=risk.score;return <div className={'gauge '+risk.level.toLowerCase()}><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="66" className="gauge-bg"/><circle cx="80" cy="80" r="66" className="gauge-fill" strokeDasharray={((score??0)/100*415)+' 415'}/></svg><div><strong>{score??'—'}</strong><small>ИНДЕКС РИСКА / 100</small></div></div>;}
export function FormModal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-label={title} className="modal" onKeyDown={e=>{if(e.key==='Escape')onClose();}}><div className="section-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><Icon name="close"/></button></div>{children}</section></div>;
}
