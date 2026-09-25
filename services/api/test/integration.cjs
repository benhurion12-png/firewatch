// Run only against a disposable database; creates records with a unique test suffix.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
process.env.KAFKA_DISABLED='true';
process.env.PORT=process.env.TEST_API_PORT||'18002';
const {bootstrap}=require('../dist/main');
const {Monitor}=require('../dist/monitor.service');
const {Db}=require('../dist/prisma.service');
const bcrypt=require('bcrypt');
(async()=>{
 const app=await bootstrap(),db=app.get(Db),monitor=app.get(Monitor),suffix=Date.now();
 const base='http://127.0.0.1:'+process.env.PORT+'/api';
 let checks=0;
 const check=(condition,message)=>{assert.ok(condition,message);checks++;};
 async function request(path,method='GET',body,cookie) {
  const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}: {})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
 }
 try {
  const password='Integration-Only-2026!';
  const admin=await db.user.create({data:{email:'admin-'+suffix+'@test.local',name:'Test admin',password:await bcrypt.hash(password,10),role:'ADMIN'}});
  const manager=await db.user.create({data:{email:'manager-'+suffix+'@test.local',name:'Test manager',password:await bcrypt.hash(password,10),role:'MANAGER'}});
  const a=await request('/auth/login','POST',{email:admin.email,password}),m=await request('/auth/login','POST',{email:manager.email,password});
  check(a.status===201&&!!a.cookie,'Admin login');check(m.status===201&&!!m.cookie,'Manager login');
  check((await request('/dashboard')).status===401,'Anonymous dashboard rejected');
  check((await request('/auth/register','POST',{name:'Escalation',email:'bad-'+suffix+'@test.local',password,role:'ADMIN'})).status===400,'Self-registration cannot elevate role');
  const v=await request('/auth/register','POST',{name:'Viewer',email:'viewer-'+suffix+'@test.local',password});
  check(v.body.role==='VIEWER','Registration defaults to VIEWER');
  const payload={name:'Integration forest '+suffix,location:'Test region',lat:50,lng:70,hectares:20,description:'Disposable test'};
  check((await request('/areas','POST',payload,v.cookie)).status===403,'Viewer cannot create area');
  check((await request('/users','GET',undefined,m.cookie)).status===403,'Manager cannot manage users');
  const area=await request('/areas','POST',payload,m.cookie);
  check(area.status===201,'Manager can create area');
  const id=area.body.id,device='test-'+suffix;
  const create=await request('/devices','POST',{id:device+'-h',name:'Environment test',type:'HMP155',areaId:id},m.cookie);
  check(create.status===201,'Manager can assign HMP155');
  const createF=await request('/devices','POST',{id:device+'-f',name:'Flame test',type:'FS24X',areaId:id},a.cookie);
  check(createF.status===201,'Admin can assign FS24X');
  check((await request('/devices','POST',{id:device+'-duplicate',name:'Duplicate',type:'FS24X',areaId:id},m.cookie)).status===409,'Duplicate type in area rejected');
  const make=(type,flame=false)=>({messageId:randomUUID(),deviceId:device+(type==='HMP155'?'-h':'-f'),type,measuredAt:new Date().toISOString(),fault:false,simulated:true,...(type==='HMP155'?{temperatureC:24,humidityPct:55}:{flameDetected:flame})});
  const h=make('HMP155');await monitor.ingest(h);await monitor.ingest(h);await monitor.ingest(make('FS24X'));
  check(await db.reading.count({where:{areaId:id}})===2,'QoS retry is deduplicated');
  let detail=await request('/areas/'+id,'GET',undefined,v.cookie);
  check(detail.body.risk.level==='NORMAL','Paired normal data is NORMAL');
  await monitor.ingest(make('FS24X',true));
  detail=await request('/areas/'+id,'GET',undefined,a.cookie);
  check(detail.body.risk.level==='CRITICAL'&&detail.body.risk.score>=90,'Flame produces CRITICAL persisted risk');
  check(detail.body.history.length>=3,'History is persisted');
  const event=detail.body.events.find(e=>e.level==='CRITICAL');
  check(!!event,'Risk transition produces an event');
  check((await request('/events/'+event.id+'/acknowledge','POST',{},m.cookie)).status===201,'Manager can acknowledge event');
  check((await request('/areas/'+id,'GET',undefined,m.cookie)).body.risk.level==='CRITICAL','Acknowledgement never clears risk');
  const area2=await request('/areas','POST',{...payload,name:'Other forest '+suffix},m.cookie);
  const oldTime=new Date().toISOString();
  check((await request('/devices/'+device+'-h','PATCH',{areaId:area2.body.id},m.cookie)).status===200,'Manager can reassign device');
  await monitor.ingest({...make('HMP155'),measuredAt:oldTime});
  check(await db.reading.count({where:{areaId:area2.body.id}})===0,'Delayed pre-assignment reading cannot pollute new area');
  await monitor.ingest(make('HMP155'));
  check(await db.reading.count({where:{areaId:area2.body.id}})===1,'New reading belongs to new area');
  check(await db.reading.count({where:{areaId:id}})===3,'Original history remains attached to original area');
  check((await request('/areas/'+id,'DELETE',undefined,a.cookie)).status===409,'History protected from area deletion');
  await request('/users/'+v.body.id,'PATCH',{role:'MANAGER'},a.cookie);
  check((await request('/auth/me','GET',undefined,v.cookie)).body.role==='MANAGER','Role changes apply to existing sessions');
  check((await request('/users/'+admin.id,'PATCH',{role:'VIEWER'},a.cookie)).status===403,'Self-demotion rejected');
  await request('/auth/logout','POST',{},a.cookie);
  check((await request('/dashboard','GET',undefined,a.cookie)).status===401,'Logout revokes session server-side');
  console.log('PASS: '+checks+' integration assertions (REST, roles, PostgreSQL, fusion, reassignment).');
 } finally {await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
