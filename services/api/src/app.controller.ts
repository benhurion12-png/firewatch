import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res, ForbiddenException, ConflictException } from '@nestjs/common';
import type { Response } from 'express';
import { Auth, Public, Roles, cookieName, cookieOptions, safeUser } from './auth';
import { Db } from './prisma.service';
import { Monitor } from './monitor.service';
import { AreaDto, AssignDto, DeviceDto, LoginDto, RegisterDto, RoleDto } from './dto';
@Controller()
export class AppController {
  constructor(private auth:Auth,private db:Db,private monitor:Monitor) {}
  @Public() @Get('health') async health() { await this.db.$queryRaw`SELECT 1`;return {status:'ok',brokerConnected:this.monitor.connected}; }
  @Public() @Post('auth/login') async login(@Body() dto:LoginDto,@Res({passthrough:true}) res:Response) {
    const result=await this.auth.login(dto.email,dto.password);res.cookie(cookieName,result.token,cookieOptions());return result.user;
  }
  @Public() @Post('auth/register') async register(@Body() dto:RegisterDto,@Res({passthrough:true}) res:Response) {
    const result=await this.auth.register(dto.name,dto.email,dto.password);res.cookie(cookieName,result.token,cookieOptions());return result.user;
  }
  @Get('auth/me') me(@Req() req) {return req.user;}
  @Public() @Post('auth/logout') async logout(@Req() req,@Res({passthrough:true}) res:Response) {
    await this.auth.logout(req.cookies?.[cookieName]);res.clearCookie(cookieName,{...cookieOptions(),maxAge:undefined});return {ok:true};
  }
  @Get('dashboard') dashboard() {return this.monitor.dashboard();}
  @Get('areas/:id') detail(@Param('id') id:string) {return this.monitor.detail(id);}
  @Roles('ADMIN','MANAGER') @Post('areas') createArea(@Body() dto:AreaDto,@Req() req) {return this.monitor.createArea(dto,req.user.email);}
  @Roles('ADMIN','MANAGER') @Put('areas/:id') updateArea(@Param('id') id:string,@Body() dto:AreaDto,@Req() req) {return this.monitor.updateArea(id,dto,req.user.email);}
  @Roles('ADMIN','MANAGER') @Delete('areas/:id') deleteArea(@Param('id') id:string,@Req() req) {return this.monitor.deleteArea(id,req.user.email);}
  @Get('devices') devices() {return this.monitor.devices();}
  @Roles('ADMIN','MANAGER') @Post('devices') device(@Body() dto:DeviceDto,@Req() req) {return this.monitor.createDevice(dto,req.user.email);}
  @Roles('ADMIN','MANAGER') @Patch('devices/:id') assign(@Param('id') id:string,@Body() dto:AssignDto,@Req() req) {return this.monitor.assign(id,dto,req.user.email);}
  @Get('events') events() {return this.monitor.events();}
  @Roles('ADMIN','MANAGER') @Post('events/:id/acknowledge') ack(@Param('id') id:string,@Req() req) {return this.monitor.acknowledge(id,req.user.email);}
  @Roles('ADMIN') @Get('users') async users() {return (await this.db.user.findMany({orderBy:{createdAt:'asc'}})).map(safeUser);}
  @Roles('ADMIN') @Patch('users/:id') async role(@Param('id') id:string,@Body() dto:RoleDto,@Req() req) {
    if(id===req.user.id && dto.role!=='ADMIN') throw new ForbiddenException('Нельзя понизить собственную роль');
    return this.db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(8192402)`;
      const user=await tx.user.findUniqueOrThrow({where:{id}});
      if(user.role==='ADMIN' && dto.role!=='ADMIN' && await tx.user.count({where:{role:'ADMIN'}})<=1) throw new ConflictException('Нужен хотя бы один администратор');
      const updated=await tx.user.update({where:{id},data:dto});
      await tx.event.create({data:{kind:'AUDIT',level:'NORMAL',message:`Роль ${user.email}: ${dto.role}. Оператор: ${req.user.email}`}});
      return safeUser(updated);
    });
  }
}
