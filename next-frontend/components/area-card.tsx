import Link from 'next/link';
import type {Area} from '@/lib/types';
import {Badge} from './ui';
import {Icon} from './icons';
import {formatTime} from '@/lib/api';
export function AreaCard({area}:{area:Area}){
 const r=area.risk;
 return <Link href={'/areas/'+area.id} className={'area-card '+r.level.toLowerCase()}><div className="card-top"><span className="area-icon"><Icon name="tree" size={22}/></span><Badge level={r.level}/></div><h3>{area.name}</h3><p className="location"><Icon name="pin" size={13}/>{area.location}</p><div className="area-metrics"><span><small>Температура</small><b>{r.temperatureC?.toFixed(1)??'—'}<em> °C</em></b></span><span><small>Влажность</small><b>{r.humidityPct?.toFixed(0)??'—'}<em> %</em></b></span><span><small>Риск</small><b className="risk-value">{r.score??'—'}<em> /100</em></b></span></div><div className="risk-line"><i style={{width:(r.score??0)+'%'}}/></div><div className="card-bottom"><span>{area.devices.length}/2 датчика <span>·</span> {r.quality==='COMPLETE'?'Данные полные':r.quality==='PARTIAL'?'Неполные данные':'Нет связи'}</span><Icon name="arrow" size={17}/></div><small className="last-seen">{formatTime(r.measuredAt)}</small></Link>;
}
