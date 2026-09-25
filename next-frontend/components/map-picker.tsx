'use client';
import {useEffect,useRef,useState} from 'react';
import type {Map as LibreMap,Marker as LibreMarker} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
export type Point={lat:number;lng:number};
type MapState={map:LibreMap;Marker:typeof LibreMarker};
const round=(value:number)=>Math.round(value*1e5)/1e5;
const pointOf=(lat:number,lng:number):Point=>({lat:round(lat),lng:round(((lng+540)%360)-180)});
export default function MapPicker({point,onPick}:{point:Point|null;onPick:(point:Point)=>void}){
 const container=useRef<HTMLDivElement>(null),marker=useRef<LibreMarker|null>(null),pick=useRef(onPick),start=useRef(point);
 const [failed,setFailed]=useState(false),[state,setState]=useState<MapState|null>(null);
 useEffect(()=>{pick.current=onPick;});
 useEffect(()=>{
  let disposed=false;
  let map:LibreMap|undefined;
  void import('maplibre-gl').then(({default:lib})=>{
   if(disposed||!container.current)return;
   const first=start.current;
   map=new lib.Map({container:container.current,center:first?[first.lng,first.lat]:[72.5,48.6],zoom:first?9:4,style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors',maxzoom:19}},layers:[{id:'osm',type:'raster',source:'osm'}]}});
   map.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
   map.getCanvas().style.cursor='crosshair';
   map.on('click',event=>pick.current(pointOf(event.lngLat.lat,event.lngLat.lng)));
   map.on('error',()=>setFailed(true));
   map.on('idle',()=>{if(map?.areTilesLoaded())setFailed(false);});
   setState({map,Marker:lib.Marker});
  }).catch(()=>{if(!disposed)setFailed(true);});
  return ()=>{disposed=true;marker.current=null;map?.remove();};
 },[]);
 const lat=point?.lat,lng=point?.lng;
 useEffect(()=>{
  if(!state)return;
  if(lat===undefined||lng===undefined){marker.current?.remove();marker.current=null;return;}
  if(!marker.current){
   const created=new state.Marker({draggable:true,color:'#dc2626'}).setLngLat([lng,lat]).addTo(state.map);
   created.on('dragend',()=>{const at=created.getLngLat();pick.current(pointOf(at.lat,at.lng));});
   marker.current=created;
  } else marker.current.setLngLat([lng,lat]);
  if(!state.map.getBounds().contains([lng,lat]))state.map.easeTo({center:[lng,lat],zoom:Math.max(state.map.getZoom(),8),duration:400});
 },[state,lat,lng]);
 return <div className="map-picker"><div ref={container} className="map-picker-canvas"/>{failed&&<div className="map-notice">Карта недоступна без интернета. Введите координаты вручную.</div>}</div>;
}
