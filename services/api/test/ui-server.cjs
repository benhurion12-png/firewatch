// Browser smoke harness: synthetic fixtures through the real ingestion service.
// No HTTP ingestion endpoint is exposed. Never used by Docker / production start.
process.env.KAFKA_DISABLED='true';
const {bootstrap}=require('../dist/main');
const {Monitor}=require('../dist/monitor.service');
const {Db}=require('../dist/prisma.service');
const {randomUUID}=require('node:crypto');
(async()=>{
 const app=await bootstrap(),db=app.get(Db),monitor=app.get(Monitor);
 const ids=['burabay','ile-alatau','karkaraly'];
 await db.device.updateMany({where:{areaId:{in:ids}},data:{assignedAt:new Date(Date.now()-600000)}});
 async function publish(offset=0) {
  for(const [i,id] of ids.entries()) {
   const progress=(120000-offset)/120000;
   for(const type of ['HMP155','FS24X']) await monitor.ingest({
    messageId:randomUUID(),deviceId:id+'-'+type.toLowerCase(),type,
    measuredAt:new Date(Date.now()-offset).toISOString(),fault:false,simulated:true,
    ...(type==='HMP155'?{temperatureC:i===0?24.2:28+progress*20,humidityPct:i===0?56:50-progress*36}:{flameDetected:i===2&&offset<30000})
   });
  }
 }
 for(let offset=100000;offset>=0;offset-=10000) await publish(offset);
 console.log('UI fixtures ready');
 const timer=setInterval(()=>publish().catch(console.error),5000);
 process.on('SIGTERM',async()=>{clearInterval(timer);await app.close();});
})().catch(error=>{console.error(error);process.exitCode=1;});
