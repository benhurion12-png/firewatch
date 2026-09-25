import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { Db } from './prisma.service';
async function main() {
  const db=new Db();
  try {
    for(const role of ['ADMIN','MANAGER'] as const) {
      const email=process.env[role+'_EMAIL'],password=process.env[role+'_PASSWORD'];
      if(!email || !password || password.length<10 || Buffer.byteLength(password)>72) throw new Error('Set '+role+'_EMAIL and '+role+'_PASSWORD (10+ characters, <=72 UTF-8 bytes)');
      await db.user.upsert({where:{email:email.toLowerCase()},update:{},create:{email:email.toLowerCase(),password:await bcrypt.hash(password,12),role,name:role==='ADMIN'?'Администратор':'Менеджер'}});
    }
    const areas=[
      {id:'burabay',name:'Бурабай · Северный лес',location:'Акмолинская область',lat:53.083,lng:70.305,hectares:420,description:'Сосновый массив у озера Боровое. Учебный участок мониторинга.'},
      {id:'ile-alatau',name:'Иле-Алатау · Горный склон',location:'Алматинская область',lat:43.072,lng:77.063,hectares:680,description:'Горный лесной участок. Учебный сценарий роста температуры и снижения влажности.'},
      {id:'karkaraly',name:'Каркаралы · Восточный лес',location:'Карагандинская область',lat:49.402,lng:75.478,hectares:310,description:'Сосновый лес. Учебный сценарий срабатывания детектора пламени.'},
    ];
    for(const area of areas) {
      await db.forestArea.upsert({where:{id:area.id},update:{},create:area});
      for(const type of ['HMP155','FS24X'] as const) {
        const id=area.id+'-'+type.toLowerCase();
        await db.device.upsert({where:{id},update:{},create:{id,type,areaId:area.id,name:(type==='HMP155'?'Vaisala HMP155':'Honeywell FS24X')+' · '+area.name.split(' · ')[0]}});
      }
    }
    console.log('Seed complete. Existing accounts, assignments and history preserved.');
  } finally {await db.$disconnect();}
}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
