import type {CSSProperties} from 'react';
const paths:Record<string,string[]>={
 flame:['M12 3c1 5 6 7 6 12a6 6 0 0 1-12 0c0-4 3-7 5-9-1 4 0 5 1 6 2-3 2-6 0-9Z'],
 grid:['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
 tree:['m12 3-6 8h3l-5 6h6v4h4v-4h6l-5-6h3Z'],
 sensor:['M8 8h8v8H8zM9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3'],
 bell:['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'],
 users:['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87','M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
 sun:['M12 3v1m0 16v1M3 12h1m16 0h1M5.6 5.6l.7.7m11.4 11.4.7.7M5.6 18.4l.7-.7M17.7 6.3l.7-.7','M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
 moon:['M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z'],
 arrow:['M5 12h14m-5-5 5 5-5 5'],
 plus:['M12 5v14M5 12h14'],
 pin:['M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z','M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
 chart:['M3 3v18h18M6 16l4-6 4 3 6-9'],
 logout:['M9 4H4v16h5M10 12h11m-4-4 4 4-4 4'],
 temp:['M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0M12 8v9'],
 drop:['M12 3C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-9-7-12Z'],
 check:['m5 12 4 4L19 6'],
 book:['M12 5C8 2 4 3 2 4v16c3-1 6-1 10 1 4-2 7-2 10-1V4c-3-1-6-2-10 1Zm0 0v16'],
 wifi:['M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0M12 20h.01'],
 search:['M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 6 6'],
 close:['m6 6 12 12M6 18 18 6'],
};
export function Icon({name,size=20,style}:{name:string;size?:number;style?:CSSProperties}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{(paths[name]||paths.grid).map((d,i)=><path d={d} key={i}/>)}</svg>;
}
