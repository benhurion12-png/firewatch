'use client';
export function Chart({points,label,unit,color='#F97316'}:{points:{date:string;value:number|null}[];label:string;unit:string;color?:string}){
 const values=points.filter((p):p is {date:string;value:number}=>p.value!==null&&Number.isFinite(p.value));
 if(values.length<2)return <div className="chart-empty">Для графика «{label}» нужно хотя бы два измерения.</div>;
 const min=Math.min(...values.map(p=>p.value)),max=Math.max(...values.map(p=>p.value));
 const low=min===max?min-1:min-(max-min)*.1,high=min===max?max+1:max+(max-min)*.1;
 const start=new Date(values[0].date).getTime(),end=new Date(values[values.length-1].date).getTime();
 const x=(date:string)=>42+((new Date(date).getTime()-start)/(end-start||1))*590,y=(n:number)=>150-(n-low)/(high-low)*120;
 // Missing values split the path; gaps never appear as observed measurements.
 let path='',open=false;
 for(const p of points){if(p.value===null){open=false;continue;}path+=(open?'L':'M')+x(p.date).toFixed(1)+','+y(p.value).toFixed(1);open=true;}
 return <svg viewBox="0 0 660 188" className="chart" role="img" aria-label={label+': от '+min.toFixed(1)+' до '+max.toFixed(1)+' '+unit}>{[0,.5,1].map(v=><g key={v}><line x1="42" x2="632" y1={30+v*120} y2={30+v*120} stroke="var(--border)" strokeDasharray="3 4"/><text x="33" y={34+v*120} textAnchor="end" fill="var(--muted)" fontSize="10">{(high-v*(high-low)).toFixed(0)}</text></g>)}<path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round"/><text x="42" y="177" fill="var(--muted)" fontSize="10">{new Date(start).toLocaleTimeString('ru-RU')}</text><text x="632" y="177" textAnchor="end" fill="var(--muted)" fontSize="10">{new Date(end).toLocaleTimeString('ru-RU')}</text></svg>;
}
