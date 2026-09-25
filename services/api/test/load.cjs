// Run only against a disposable database. Simulates AREAS areas with two sensors each reporting every 5 s.
const {randomUUID}=require('node:crypto');
process.env.KAFKA_DISABLED='true';
process.env.PORT=process.env.TEST_API_PORT||'18003';
const AREAS=Number(process.env.LOAD_AREAS||500),SECONDS=Number(process.env.LOAD_SECONDS||30),BATCH=17,PARALLEL=4;
const {bootstrap}=require('../dist/main');
const {Monitor}=require('../dist/monitor.service');
const {Db}=require('../dist/prisma.service');
const ms=(start)=>Math.round(performance.now()-start);
const pct=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
(async()=>{
 const app=await bootstrap(),db=app.get(Db),monitor=app.get(Monitor);
 try {
  await db.event.deleteMany();await db.assessment.deleteMany();await db.reading.deleteMany();await db.device.deleteMany();await db.forestArea.deleteMany();
  const areas=Array.from({length:AREAS},(_,i)=>({id:'load-'+i,name:'Load '+i,location:'Test',lat:50,lng:70,hectares:10}));
  await db.forestArea.createMany({data:areas});
  const devices=areas.flatMap(a=>['HMP155','FS24X'].map(type=>({id:a.id+'-'+type.toLowerCase(),name:type+' '+a.id,type,areaId:a.id})));
  await db.device.createMany({data:devices});
  monitor.forgetDevices();
  const make=(d)=>({messageId:randomUUID(),deviceId:d.id,type:d.type,measuredAt:new Date().toISOString(),fault:false,simulated:true,...(d.type==='HMP155'?{temperatureC:20+Math.random()*10,humidityPct:40+Math.random()*20}:{flameDetected:false})});
  const parse=require('../dist/telemetry-validation').parseTelemetry;
  const rate=Math.round(devices.length/5);
  console.log(`${devices.length} sensors, ${rate} messages/s target, ${SECONDS}s`);
  const latencies=[];let sent=0,inserted=0,late=0;const started=performance.now();
  for(let second=0;second<SECONDS;second++){
   const tick=performance.now();
   const messages=Array.from({length:rate},(_,i)=>parse(make(devices[(second*rate+i)%devices.length])));
   const batches=[];for(let i=0;i<messages.length;i+=BATCH)batches.push(messages.slice(i,i+BATCH));
   let next=0;
   await Promise.all(Array.from({length:PARALLEL},async()=>{while(next<batches.length){const batch=batches[next++],t=performance.now();const n=await monitor.ingestBatch(batch);inserted+=n;latencies.push(ms(t));}}));
   sent+=messages.length;
   const spent=ms(tick);if(spent>1000)late++;
   await new Promise(r=>setTimeout(r,Math.max(0,1000-spent)));
  }
  const elapsed=(performance.now()-started)/1000;
  console.log(`ingest: ${sent} sent, ${inserted} inserted, ${(inserted/elapsed).toFixed(0)}/s, batch latency p50=${pct(latencies,.5)}ms p95=${pct(latencies,.95)}ms max=${Math.max(...latencies)}ms, seconds over budget: ${late}`);
  console.log('areas waiting for evaluation:',monitor.dirty.size);
  let t=performance.now();await monitor.flush(true);console.log('full risk evaluation of dirty areas took',ms(t),'ms');
  t=performance.now();await monitor.buildDashboard();console.log('dashboard build:',ms(t),'ms');
  t=performance.now();await monitor.detail('load-7');console.log('area detail:',ms(t),'ms');
  console.log('rows: readings',await db.reading.count(),'assessments',await db.assessment.count(),'events',await db.event.count());
 } finally {await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
