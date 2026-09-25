import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Consumer, Kafka } from 'kafkajs';
import { Db } from './prisma.service';
import { LiveGateway } from './gateway';
import { fuse, Risk } from './risk';
import { parseTelemetry } from './telemetry-validation';
import { AreaDto, AssignDto, DeviceDto } from './dto';
import { Prisma } from './generated/prisma/client';
type Tx = Prisma.TransactionClient;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
@Injectable()
export class Monitor implements OnModuleInit, OnModuleDestroy {
  private consumer?: Consumer;
  private timer?: NodeJS.Timeout;
  private stopping = false;
  private sweeping = false;
  connected = false;
  private logger = new Logger('Telemetry');
  constructor(private db: Db, private live: LiveGateway) {}
  onModuleInit() {
    if (process.env.KAFKA_DISABLED !== 'true') void this.connect();
    this.timer = setInterval(() => { if (!this.sweeping) void this.sweep(); },15000);
  }
  private async connect() {
    this.consumer = new Kafka({clientId:'firewatch-api',brokers:[process.env.KAFKA_BROKER || 'localhost:9094'],retry:{retries:8}}).consumer({groupId:'firewatch-fusion-v1'});
    this.consumer.on(this.consumer.events.DISCONNECT,()=>{this.connected=false;});
    this.consumer.on(this.consumer.events.CRASH,()=>{this.connected=false;});
    while(!this.stopping) {
      try {
        await this.consumer.connect();
        await this.consumer.subscribe({topic:'firewatch.telemetry.raw',fromBeginning:true});
        await this.consumer.run({eachMessage: async ({message}) => {
          let payload: unknown;
          try { payload = parseTelemetry(JSON.parse(message.value?.toString() || '{}')); }
          catch(error) { this.logger.warn('Rejected invalid message: '+(error as Error).message); return; }
          // DB failures propagate so Kafka retries instead of losing the reading.
          await this.ingest(payload);
        }});
        this.connected = true; return;
      } catch(error) {
        this.logger.warn('Broker unavailable; retry in 5s: '+(error as Error).message);
        await new Promise(resolve=>setTimeout(resolve,5000));
      }
    }
  }
  private async lock(tx: Tx) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(8192401)`; }
  async ingest(raw: unknown) {
    // Parser also accepts the normalized Date produced above.
    const normalized = raw as Record<string,unknown>;
    const input = parseTelemetry({...normalized,measuredAt:normalized.measuredAt instanceof Date ? normalized.measuredAt.toISOString() : normalized.measuredAt});
    let accepted = false;
    await this.db.$transaction(async tx => {
      await this.lock(tx);
      const device = await tx.device.findUnique({where:{id:input.deviceId}});
      if (!device?.areaId || device.type !== input.type || new Date(input.measuredAt) < device.assignedAt) return;
      if (await tx.reading.findUnique({where:{messageId:input.messageId}})) return;
      await tx.reading.create({data:{...input,measuredAt:new Date(input.measuredAt),areaId:device.areaId}});
      await this.assess(tx,device.areaId,true);
      accepted = true;
    },{timeout:15000});
    if (accepted) this.live.changed();
  }
  private async assess(tx: Tx, areaId: string, persist = false) {
    const devices = await tx.device.findMany({where:{areaId}});
    // History remains attached to its original area after reassignment.
    const samples = devices.length ? await tx.reading.findMany({
      where:{areaId,measuredAt:{gte:new Date(Date.now()-300000)},OR:devices.map(d=>({deviceId:d.id,measuredAt:{gte:d.assignedAt}}))},
      orderBy:{measuredAt:'desc'},take:500,
    }) : [];
    const last = await tx.assessment.findFirst({where:{areaId},orderBy:{createdAt:'desc'}});
    const previous = last?.result as Risk | undefined;
    const result = fuse(samples,Date.now(),previous);
    const changed = !last || last.level !== result.level || last.quality !== result.quality;
    if (persist || changed || previous?.recoverySince !== result.recoverySince) {
      await tx.assessment.create({data:{areaId,score:result.score,level:result.level,quality:result.quality,result:json(result)}});
    }
    if(changed) {
      await tx.event.create({data:{areaId,kind:'RISK',level:result.level,
        message:`Состояние: ${result.level}; данные: ${result.quality}. ${result.reasons.join('. ')}`}});
    }
    return {result,changed};
  }
  private async sweep() {
    this.sweeping = true;
    try {
      const areas = await this.db.forestArea.findMany({select:{id:true}});
      let changed = false;
      for (const area of areas) {
        const value = await this.db.$transaction(async tx => {
          await this.lock(tx);
          if(!await tx.forestArea.findUnique({where:{id:area.id}})) return null;
          return this.assess(tx,area.id);
        },{timeout:15000});
        changed ||= !!value?.changed;
      }
      if(changed) this.live.changed();
    } catch(error) { this.logger.error('Freshness check failed: '+(error as Error).message); }
    finally { this.sweeping=false; }
  }
  async dashboard() {
    const areas = await this.db.forestArea.findMany({orderBy:{name:'asc'},include:{
      devices:{include:{readings:{orderBy:{measuredAt:'desc'},take:1}}},
      assessments:{orderBy:{createdAt:'desc'},take:1},
    }});
    return {brokerConnected:this.connected,serverTime:new Date().toISOString(),areas:areas.map(area=>{
      const {assessments,devices,...rest}=area;
      return {...rest,devices:devices.map(({readings,...device})=>({...device,lastReading:readings[0] && readings[0].areaId===device.areaId && readings[0].measuredAt>=device.assignedAt ? readings[0] : null})),
        risk:assessments[0]?.result ?? fuse([])};
    })};
  }
  async detail(id: string) {
    const area = (await this.dashboard()).areas.find(a=>a.id===id);
    if(!area) throw new NotFoundException('Участок не найден');
    const [history,readings,events] = await Promise.all([
      this.db.assessment.findMany({where:{areaId:id},orderBy:{createdAt:'desc'},take:240}),
      this.db.reading.findMany({where:{areaId:id},orderBy:{measuredAt:'desc'},take:120}),
      this.db.event.findMany({where:{areaId:id},orderBy:{createdAt:'desc'},take:100}),
    ]);
    return {...area,history:history.reverse(),readings,events};
  }
  async createArea(dto: AreaDto, actor: string) {
    const area = await this.db.forestArea.create({data:dto});
    await this.audit(area.id,'Создан лесной участок',actor);
    this.live.changed(); return area;
  }
  async updateArea(id: string,dto: AreaDto,actor:string) {
    const area = await this.db.forestArea.update({where:{id},data:dto});
    await this.audit(id,'Изменены параметры участка',actor);
    this.live.changed(); return area;
  }
  async deleteArea(id: string,actor:string) {
    await this.db.$transaction(async tx=>{
      await this.lock(tx);
      const area = await tx.forestArea.findUnique({where:{id},include:{_count:{select:{devices:true,readings:true}}}});
      if(!area) throw new NotFoundException('Участок не найден');
      if(area._count.devices || area._count.readings) throw new ConflictException('Можно удалить только пустой участок без истории измерений');
      await tx.forestArea.delete({where:{id}});
      await tx.event.create({data:{kind:'AUDIT',level:'NORMAL',message:`Удалён участок ${area.name}. Оператор: ${actor}`}});
    });
    this.live.changed(); return {ok:true};
  }
  devices() { return this.db.device.findMany({include:{area:true},orderBy:{createdAt:'desc'}}); }
  async createDevice(dto: DeviceDto,actor:string) {
    const device = await this.db.$transaction(async tx=>{
      await this.lock(tx);
      if(dto.areaId && !await tx.forestArea.findUnique({where:{id:dto.areaId}})) throw new NotFoundException('Участок не найден');
      const result=await tx.device.create({data:dto});
      await tx.event.create({data:{areaId:dto.areaId,kind:'AUDIT',level:'NORMAL',message:`Зарегистрирован ${dto.id} (${dto.type}). Оператор: ${actor}`}});
      if(dto.areaId) await this.assess(tx,dto.areaId,true);
      return result;
    });
    this.live.changed(); return device;
  }
  async assign(id: string,dto: AssignDto,actor:string) {
    const device=await this.db.$transaction(async tx=>{
      await this.lock(tx);
      const previous=await tx.device.findUnique({where:{id}});
      if(!previous) throw new NotFoundException('Датчик не найден');
      if(dto.areaId && !await tx.forestArea.findUnique({where:{id:dto.areaId}})) throw new NotFoundException('Участок не найден');
      const reassigned=dto.areaId!==undefined && dto.areaId!==previous.areaId;
      const updated=await tx.device.update({where:{id},data:{...dto,...(reassigned?{assignedAt:new Date()}: {})}});
      await tx.event.create({data:{areaId:updated.areaId,kind:'AUDIT',level:'NORMAL',message:`Обновлён датчик ${id}. Участок: ${previous.areaId ?? '—'} → ${updated.areaId ?? '—'}. Оператор: ${actor}`}});
      if(reassigned) for(const areaId of new Set([previous.areaId,updated.areaId].filter(Boolean))) await this.assess(tx,areaId!,true);
      return updated;
    },{timeout:15000});
    this.live.changed(); return device;
  }
  events() {return this.db.event.findMany({include:{area:{select:{name:true}}},orderBy:{createdAt:'desc'},take:300});}
  async acknowledge(id:string,actor:string) {
    const event=await this.db.event.findUnique({where:{id}});
    if(!event) throw new NotFoundException('Событие не найдено');
    if(!event.acknowledgedAt) {
      await this.db.event.updateMany({where:{id,acknowledgedAt:null},data:{acknowledgedAt:new Date(),acknowledgedBy:actor}});
      await this.audit(event.areaId,'Принято в работу событие '+id,actor);
    }
    this.live.changed(); return {ok:true};
  }
  private audit(areaId:string|null,message:string,actor:string) {
    return this.db.event.create({data:{areaId,kind:'AUDIT',level:'NORMAL',message:message+'. Оператор: '+actor}});
  }
  async onModuleDestroy() {this.stopping=true;if(this.timer) clearInterval(this.timer);await this.consumer?.disconnect();}
}
