import 'dotenv/config';
import 'reflect-metadata';
import { Module, ValidationPipe, Catch, ExceptionFilter, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import { Db } from './prisma.service';
import { Auth, AccessGuard } from './auth';
import { AppController } from './app.controller';
import { LiveGateway } from './gateway';
import { Monitor } from './monitor.service';
@Module({controllers:[AppController],providers:[Db,Auth,LiveGateway,Monitor,{provide:APP_GUARD,useClass:AccessGuard}]})
export class AppModule {}
@Catch()
class Errors implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const e=error as {code?:string;message?:string};
    const response=host.switchToHttp().getResponse();
    if(error instanceof HttpException) return response.status(error.getStatus()).json(error.getResponse());
    if(e.code==='P2002') return response.status(409).json({message:'Этот email, ID или тип датчика на участке уже занят'});
    if(e.code==='P2025') return response.status(404).json({message:'Запись не найдена'});
    if(e.code==='P2003') return response.status(400).json({message:'Проверьте связанные записи'});
    Logger.error(e.message,'API');response.status(500).json({message:'Не удалось выполнить запрос'});
  }
}
export async function bootstrap() {
  const app=await NestFactory.create(AppModule);
  app.use(cookieParser());
  const origins=(process.env.APP_ORIGINS || 'http://localhost:3002,http://127.0.0.1:3002').split(',');
  app.enableCors({origin:origins,credentials:true});
  const attempts=new Map<string,{count:number;until:number}>();
  app.use((req,res,next)=>{
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && !origins.includes(req.headers.origin)) return res.status(403).json({message:'Origin denied'});
    if(req.path==='/api/auth/login' || req.path==='/api/auth/register') {
      const key=req.ip || 'unknown',now=Date.now();
      if(attempts.size>10000) for(const [k,v] of attempts) if(v.until<now) attempts.delete(k);
      const slot=attempts.get(key);
      if(slot && slot.until>now && slot.count>=30) return res.status(429).json({message:'Слишком много попыток. Повторите через 15 минут'});
      attempts.set(key,slot && slot.until>now ? {...slot,count:slot.count+1} : {count:1,until:now+900000});
    }
    next();
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 8002),'0.0.0.0');
  return app;
}
if(require.main===module) void bootstrap();
