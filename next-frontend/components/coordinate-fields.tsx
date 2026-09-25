'use client';
import {useState} from 'react';
import dynamic from 'next/dynamic';
const MapPicker=dynamic(()=>import('./map-picker'),{ssr:false,loading:()=><div className="map-picker"><div className="loading"><span className="spinner"/>Загрузка карты…</div></div>});
// The inputs stay outside the lazily loaded map, so the form always submits latitude and longitude.
export function CoordinateFields({lat:initialLat,lng:initialLng}:{lat?:number;lng?:number}){
 const [lat,setLat]=useState(initialLat===undefined?'':String(initialLat)),[lng,setLng]=useState(initialLng===undefined?'':String(initialLng));
 const la=Number(lat),ln=Number(lng);
 const valid=lat!==''&&lng!==''&&Number.isFinite(la)&&Number.isFinite(ln)&&Math.abs(la)<=90&&Math.abs(ln)<=180;
 return <>
  <MapPicker point={valid?{lat:la,lng:ln}:null} onPick={point=>{setLat(String(point.lat));setLng(String(point.lng));}}/>
  <small className="map-picker-hint">Кликните по карте, чтобы поставить участок, или перетащите красную метку. Координаты можно ввести и вручную.</small>
  <div className="form-row"><label>Широта<input name="lat" type="number" step="any" required min={-90} max={90} value={lat} onChange={e=>setLat(e.target.value)} placeholder="53.083"/></label><label>Долгота<input name="lng" type="number" step="any" required min={-180} max={180} value={lng} onChange={e=>setLng(e.target.value)} placeholder="70.305"/></label></div>
 </>;
}
