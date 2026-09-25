import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Consumer, Kafka } from 'kafkajs';
import { Db } from './prisma.service';
import { LiveGateway } from './gateway';
import { fuse, Risk } from './risk';
import { parseTelemetry, Telemetry } from './telemetry-validation';
import { AreaDto, AssignDto, DeviceDto } from './dto';
import { Prisma } from './generated/prisma/client';
type Tx = Prisma.TransactionClient;
type KnownDevice = { id: string; type: string; areaId: string | null; assignedAt: Date };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const FLUSH_MS = 3000, SWEEP_MS = 15000, CONCURRENCY = 8, DEVICE_CACHE_MS = 5000, DASHBOARD_CACHE_MS = 2000;
async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({length:Math.min(size,items.length)},async () => { while (next < items.length) await work(items[next++]); }));
}
@Injectable()
export class Monitor implements OnModuleInit, OnModuleDestroy {
  private consumer?: Consumer;
  private timers: NodeJS.Timeout[] = [];
  private stopping = false;
  connected = false;
  private recordingEnabled = true;
  private logger = new Logger('Telemetry');
  // Devices change rarely; batches of readings are matched against this cache instead of querying per message.
  private devicesCache = new Map<string, KnownDevice>();
  private devicesAt = 0;
  private devicesVersion = 0;
  private devicesLoading?: Promise<Map<string, KnownDevice>>;
  // Areas that received readings and still need a risk re-evaluation.
  private dirty = new Set<string>();
  private lastAssessed = new Map<string, number>();
  private chain: Promise<unknown> = Promise.resolve();
  private flushQueued = false;
  private sweepQueued = false;
  private dashboardCache?: { at: number; value: Promise<unknown> };
  constructor(private db: Db, private live: LiveGateway) {}
  onModuleInit() {
    if (process.env.KAFKA_DISABLED !== 'true') void this.connect();
    this.timers.push(setInterval(() => void this.queued('flushQueued',false),FLUSH_MS));
    this.timers.push(setInterval(() => void this.queued('sweepQueued',true),SWEEP_MS));
    this.timers.push(setInterval(() => void this.purge(),3600000), setTimeout(() => void this.purge(),60000));
  }
  private async connect() {
    const kafka = new Kafka({clientId:'firewatch-api',brokers:[process.env.KAFKA_BROKER || 'localhost:9094'],retry:{retries:8}});
    while(!this.stopping) {
      const consumer = this.consumer = kafka.consumer({groupId:'firewatch-fusion-v1',maxWaitTimeInMs:1000});
      // kafkajs restarts by itself after retriable errors; a crash without restart must be recovered here.
      const dead = new Promise<void>(resolve => consumer.on(consumer.events.CRASH,({payload}) => { this.connected=false; if(!payload.restart) resolve(); }));
      consumer.on(consumer.events.DISCONNECT,()=>{this.connected=false;});
      consumer.on(consumer.events.GROUP_JOIN,()=>{this.connected=true;});
      try {
        await consumer.connect();
        await consumer.subscribe({topic:'firewatch.telemetry.raw',fromBeginning:true});
        await consumer.run({partitionsConsumedConcurrently:4,eachBatch: async ({batch}) => {
          const items: Telemetry[] = [];
          for (const message of batch.messages) {
            try { items.push(parseTelemetry(JSON.parse(message.value?.toString() || '{}'))); }
            catch(error) { this.logger.warn('Rejected invalid message: '+(error as Error).message); }
          }
          // DB failures propagate so Kafka redelivers the batch; duplicates are skipped by messageId.
          await this.ingestBatch(items);
        }});
        this.connected = true;
        await dead;
        this.logger.error('Kafka consumer crashed; restarting in 5s');
      } catch(error) {
        this.logger.warn('Broker unavailable; retry in 5s: '+(error as Error).message);
      }
      await consumer.disconnect().catch(() => undefined);
      if (!this.stopping) await new Promise(resolve=>setTimeout(resolve,5000));
    }
  }
  private async lock(tx: Tx, ...areaIds: (string | null | undefined)[]) {
    for (const id of [...new Set(areaIds.filter((x): x is string => !!x))].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(8192401, hashtext(${id}))`;
  }
  private changed() { this.dashboardCache = undefined; this.live.changed(); }
  private async knownDevices() {
    if (Date.now()-this.devicesAt < DEVICE_CACHE_MS) return this.devicesCache;
    if (!this.devicesLoading) {
      const version = this.devicesVersion;
      this.devicesLoading = this.db.device.findMany({select:{id:true,type:true,areaId:true,assignedAt:true}}).then(rows => {
        const map = new Map(rows.map(row => [row.id,row as KnownDevice]));
        if (version === this.devicesVersion) { this.devicesCache = map; this.devicesAt = Date.now(); }
        return map;
      }).finally(() => { this.devicesLoading = undefined; });
    }
    return this.devicesLoading;
  }
  private forgetDevices() { this.devicesVersion++; this.devicesAt = 0; this.devicesLoading = undefined; }
  async ingestBatch(items: Telemetry[]) {
    if (!this.recordingEnabled || !items.length) return 0;
    const devices = await this.knownDevices();
    const rows: Prisma.ReadingCreateManyInput[] = [];
    for (const item of items) {
      const device = devices.get(item.deviceId);
      if (!device?.areaId || device.type !== item.type || new Date(item.measuredAt) < device.assignedAt) continue;
      rows.push({...item,areaId:device.areaId});
    }
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 1000) inserted += (await this.db.reading.createMany({data:rows.slice(i,i+1000),skipDuplicates:true})).count;
    if (inserted) {
      for (const row of rows) this.dirty.add(row.areaId);
      // Alarm-relevant readings must not wait for the periodic evaluation.
      if (rows.some(row => row.flameDetected || row.fault)) void this.flush(true).catch(error => this.logger.error('Assessment failed: '+(error as Error).message));
    }
    return inserted;
  }
  async ingest(raw: unknown) {
    const normalized = raw as Record<string,unknown>;
    const item = parseTelemetry({...normalized,measuredAt:normalized.measuredAt instanceof Date ? normalized.measuredAt.toISOString() : normalized.measuredAt});
    if (await this.ingestBatch([item])) await this.flush(true);
  }
  private enqueue<T>(work: () => Promise<T>) {
    const run = this.chain.then(work);
    this.chain = run.then(() => undefined,() => undefined);
    return run;
  }
  flush(fresh = false) {
    return this.enqueue(async () => {
      const ids = [...this.dirty];
      this.dirty.clear();
      await this.assessMany(ids,fresh);
    });
  }
  private async queued(flag: 'flushQueued' | 'sweepQueued', sweep: boolean) {
    if (this[flag] || !this.recordingEnabled) return;
    this[flag] = true;
    try {
      if (sweep) await this.enqueue(async () => {
        const now = Date.now();
        const ids = (await this.db.forestArea.findMany({select:{id:true}})).map(area => area.id).filter(id => now-(this.lastAssessed.get(id) ?? 0) >= SWEEP_MS-1000);
        await this.assessMany(ids,false);
      });
      else if (this.dirty.size) await this.flush(true);
    } catch(error) { this.logger.error('Risk evaluation failed: '+(error as Error).message); }
    finally { this[flag] = false; }
  }
  private async assessMany(ids: string[], fresh: boolean) {
    let changed = false;
    await pool(ids,CONCURRENCY,async id => {
      try {
        const value = await this.db.$transaction(async tx => {
          await this.lock(tx,id);
          if (!await tx.forestArea.findUnique({where:{id},select:{id:true}})) return null;
          return this.assess(tx,id);
        },{timeout:15000});
        this.lastAssessed.set(id,Date.now());
        changed ||= !!value?.changed;
      } catch(error) {
        this.logger.error('Assessment of '+id+' failed: '+(error as Error).message);
        this.dirty.add(id);
      }
    });
    if (changed || (fresh && ids.length)) this.changed();
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
  // Retention keeps the newest assessment of every area: it carries the alarm state used for hysteresis.
  private async purge() {
    const days = Number(process.env.RETENTION_DAYS || 0);
    if (!(days > 0)) return;
    const cutoff = new Date(Date.now()-days*86400000);
    try {
      let removed = 0;
      for (const {id} of await this.db.forestArea.findMany({select:{id:true}})) {
        for (;;) {
          const count = await this.db.$executeRaw`DELETE FROM "Reading" WHERE id IN (SELECT id FROM "Reading" WHERE "areaId"=${id} AND "measuredAt"<${cutoff} LIMIT 5000)`;
          removed += count;
          if (count < 5000) break;
        }
        await this.db.$executeRaw`DELETE FROM "Assessment" WHERE "areaId"=${id} AND "createdAt"<${cutoff} AND id<>(SELECT id FROM "Assessment" WHERE "areaId"=${id} ORDER BY "createdAt" DESC LIMIT 1)`;
      }
      if (removed) this.logger.log('Retention removed '+removed+' readings older than '+days+' days');
    } catch(error) { this.logger.error('Retention failed: '+(error as Error).message); }
  }
  async setRecording(enabled: boolean, actor: string) {
    if (this.recordingEnabled !== enabled) {
      this.recordingEnabled = enabled;
      await this.audit(null,enabled ? 'Возобновлена запись телеметрии в базу данных' : 'Приостановлена запись телеметрии в базу данных',actor);
      this.changed();
    }
    return {recording:this.recordingEnabled};
  }
  private async view(where?: Prisma.ForestAreaWhereInput) {
    const areas = await this.db.forestArea.findMany({where,orderBy:{name:'asc'},include:{
      devices:{include:{readings:{orderBy:{measuredAt:'desc'},take:1}}},
      assessments:{orderBy:{createdAt:'desc'},take:1},
    }});
    return areas.map(area=>{
      const {assessments,devices,...rest}=area;
      return {...rest,devices:devices.map(({readings,...device})=>({...device,lastReading:readings[0] && readings[0].areaId===device.areaId && readings[0].measuredAt>=device.assignedAt ? readings[0] : null})),
        risk:assessments[0]?.result ?? fuse([])};
    });
  }
  // Many clients refresh the overview on every change signal; share one computation between them.
  dashboard() {
    const cached = this.dashboardCache;
    if (cached && Date.now()-cached.at < DASHBOARD_CACHE_MS) return cached.value as ReturnType<Monitor['buildDashboard']>;
    const value = this.buildDashboard();
    this.dashboardCache = {at:Date.now(),value};
    value.catch(() => { if (this.dashboardCache?.value === value) this.dashboardCache = undefined; });
    return value;
  }
  async buildDashboard() {
    return {brokerConnected:this.connected,recording:this.recordingEnabled,serverTime:new Date().toISOString(),areas:await this.view()};
  }
  async detail(id: string) {
    const area = (await this.view({id}))[0];
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
    this.changed(); return area;
  }
  async updateArea(id: string,dto: AreaDto,actor:string) {
    const area = await this.db.forestArea.update({where:{id},data:dto});
    await this.audit(id,'Изменены параметры участка',actor);
    this.changed(); return area;
  }
  async deleteArea(id: string,actor:string) {
    await this.db.$transaction(async tx=>{
      await this.lock(tx,id);
      const area = await tx.forestArea.findUnique({where:{id},include:{_count:{select:{devices:true,readings:true}}}});
      if(!area) throw new NotFoundException('Участок не найден');
      if(area._count.devices || area._count.readings) throw new ConflictException('Можно удалить только пустой участок без истории измерений');
      await tx.forestArea.delete({where:{id}});
      await tx.event.create({data:{kind:'AUDIT',level:'NORMAL',message:`Удалён участок ${area.name}. Оператор: ${actor}`}});
    });
    this.changed(); return {ok:true};
  }
  devices() { return this.db.device.findMany({include:{area:true},orderBy:{createdAt:'desc'}}); }
  async createDevice(dto: DeviceDto,actor:string) {
    const device = await this.db.$transaction(async tx=>{
      await this.lock(tx,dto.areaId);
      if(dto.areaId && !await tx.forestArea.findUnique({where:{id:dto.areaId}})) throw new NotFoundException('Участок не найден');
      const result=await tx.device.create({data:dto});
      await tx.event.create({data:{areaId:dto.areaId,kind:'AUDIT',level:'NORMAL',message:`Зарегистрирован ${dto.id} (${dto.type}). Оператор: ${actor}`}});
      if(dto.areaId) await this.assess(tx,dto.areaId,true);
      return result;
    });
    this.forgetDevices();
    this.changed(); return device;
  }
  async assign(id: string,dto: AssignDto,actor:string) {
    const device=await this.db.$transaction(async tx=>{
      const current=await tx.device.findUnique({where:{id}});
      if(!current) throw new NotFoundException('Датчик не найден');
      await this.lock(tx,current.areaId,dto.areaId);
      const previous=await tx.device.findUnique({where:{id}});
      if(!previous) throw new NotFoundException('Датчик не найден');
      if(dto.areaId && !await tx.forestArea.findUnique({where:{id:dto.areaId}})) throw new NotFoundException('Участок не найден');
      const reassigned=dto.areaId!==undefined && dto.areaId!==previous.areaId;
      const updated=await tx.device.update({where:{id},data:{...dto,...(reassigned?{assignedAt:new Date()}: {})}});
      await tx.event.create({data:{areaId:updated.areaId,kind:'AUDIT',level:'NORMAL',message:`Обновлён датчик ${id}. Участок: ${previous.areaId ?? '—'} → ${updated.areaId ?? '—'}. Оператор: ${actor}`}});
      if(reassigned) for(const areaId of new Set([previous.areaId,updated.areaId].filter(Boolean))) await this.assess(tx,areaId!,true);
      return updated;
    },{timeout:15000});
    this.forgetDevices();
    this.changed(); return device;
  }
  events() {return this.db.event.findMany({include:{area:{select:{name:true}}},orderBy:{createdAt:'desc'},take:300});}
  async acknowledge(id:string,actor:string) {
    const event=await this.db.event.findUnique({where:{id}});
    if(!event) throw new NotFoundException('Событие не найдено');
    if(!event.acknowledgedAt) {
      await this.db.event.updateMany({where:{id,acknowledgedAt:null},data:{acknowledgedAt:new Date(),acknowledgedBy:actor}});
      await this.audit(event.areaId,'Принято в работу событие '+id,actor);
    }
    this.changed(); return {ok:true};
  }
  private audit(areaId:string|null,message:string,actor:string) {
    return this.db.event.create({data:{areaId,kind:'AUDIT',level:'NORMAL',message:message+'. Оператор: '+actor}});
  }
  async onModuleDestroy() {this.stopping=true;this.timers.forEach(clearInterval);await this.consumer?.disconnect();}
}
