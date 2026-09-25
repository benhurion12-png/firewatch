import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Db } from './prisma.service';
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export const cookieName = 'firewatch_session';
export const cookieOptions = () => ({ httpOnly:true, sameSite:'strict' as const, secure:process.env.COOKIE_SECURE === 'true', path:'/', maxAge:7*86400000 });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const safeUser = (user: {id:string;name:string;email:string;role:string}) => ({id:user.id,name:user.name,email:user.email,role:user.role});
@Injectable()
export class Auth {
  constructor(private db: Db) {}
  async session(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = await this.db.session.findUnique({where:{id:hash(token)}, include:{user:true}});
    return session && session.expiresAt.getTime() > Date.now() ? safeUser(session.user) : null;
  }
  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({where:{email:email.toLowerCase()}});
    if (!user || !(await bcrypt.compare(password, user.password))) throw new UnauthorizedException('Неверный email или пароль');
    const token = randomBytes(32).toString('hex');
    await this.db.session.deleteMany({where:{expiresAt:{lt:new Date()}}});
    await this.db.session.create({data:{id:hash(token),userId:user.id,expiresAt:new Date(Date.now()+7*86400000)}});
    return {user:safeUser(user),token};
  }
  async register(name: string, email: string, password: string) {
    if (Buffer.byteLength(password, 'utf8') > 72) throw new BadRequestException('Пароль должен занимать не более 72 байт UTF-8');
    await this.db.user.create({data:{name,email:email.toLowerCase(),password:await bcrypt.hash(password,12),role:'VIEWER'}});
    return this.login(email,password);
  }
  async logout(token?: string) { if(token) await this.db.session.deleteMany({where:{id:hash(token)}}); }
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private reflector: Reflector, private auth: Auth) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride('public',[context.getHandler(),context.getClass()])) return true;
    const req = context.switchToHttp().getRequest();
    const user = await this.auth.session(req.cookies?.[cookieName]);
    if (!user) throw new UnauthorizedException('Войдите в систему');
    req.user = user;
    const roles = this.reflector.getAllAndOverride<string[]>('roles',[context.getHandler(),context.getClass()]);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException('Недостаточно прав');
    return true;
  }
}
