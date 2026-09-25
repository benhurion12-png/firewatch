'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {Area} from '@/lib/types';
import type {Map as LibreMap,Marker as LibreMarker} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {levels} from './ui';
type MapState={map:LibreMap;Marker:typeof LibreMarker};
export default function ForestMap({areas}:{areas:Area[]}){
 const container=useRef<HTMLDivElement>(null),fitted=useRef(false),router=useRouter();
 const [failed,setFailed]=useState(false),[state,setState]=useState<MapState|null>(null);
 const points=JSON.stringify(areas.map(a=>({id:a.id,name:a.name,lat:a.lat,lng:a.lng,risk:{level:a.risk.level,score:a.risk.score}})));
 useEffect(()=>{
  let disposed=false;
  let map:LibreMap|undefined;
  void import('maplibre-gl').then(({default:lib})=>{
   if(disposed||!container.current)return;
   map=new lib.Map({container:container.current,center:[72.5,48.6],zoom:4,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors',maxzoom:19}},layers:[{id:'osm',type:'raster',source:'osm'}]}});
   map.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
   map.on('error',()=>setFailed(true));
   map.on('idle',()=>{if(map?.areTilesLoaded())setFailed(false);});
   setState({map,Marker:lib.Marker});
  }).catch(()=>{if(!disposed)setFailed(true);});
  return ()=>{disposed=true;map?.remove();};
 },[]);
 useEffect(()=>{
  if(!state)return;
  const areas=JSON.parse(points) as Area[];
  const markers=areas.map(area=>{
   const button=document.createElement('button');button.type='button';button.className='map-marker '+area.risk.level.toLowerCase();
   button.setAttribute('aria-label',area.name+': '+levels[area.risk.level]);button.title=area.name+' · '+levels[area.risk.level];
   button.textContent=area.risk.score===null?'—':String(area.risk.score);button.onclick=()=>router.push('/areas/'+area.id);
   return new state.Marker({element:button}).setLngLat([area.lng,area.lat]).addTo(state.map);
  });
  if(!fitted.current&&areas.length){
   if(areas.length===1)state.map.jumpTo({center:[areas[0].lng,areas[0].lat],zoom:10});
   else state.map.fitBounds([[Math.min(...areas.map(a=>a.lng)),Math.min(...areas.map(a=>a.lat))],[Math.max(...areas.map(a=>a.lng)),Math.max(...areas.map(a=>a.lat))]],{padding:80,maxZoom:10,duration:0});
   fitted.current=true;
  }
  return ()=>markers.forEach(marker=>marker.remove());
 },[state,points,router]);
 return <div className="map-wrap"><div ref={container} className="forest-map"/>{failed&&<div className="map-notice">Карта недоступна без интернета. Участки и показания доступны в списке.</div>}<div className="map-label"><span className="status-dot online"/>КАЗАХСТАН <span> / </span> ЛЕСНЫЕ УЧАСТКИ</div><div className="map-legend"><span><i className="normal"/>Норма</span><span><i className="warning"/>Внимание</span><span><i className="high"/>Высокий</span><span><i className="critical"/>Критический</span><span><i className="unknown"/>Нет данных</span></div></div>;
}
