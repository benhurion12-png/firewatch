import { OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';
import { Auth, cookieName } from './auth';
@WebSocketGateway({ path:'/realtime', addTrailingSlash:false, transports:['polling','websocket'] })
export class LiveGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private timer?: NodeJS.Timeout;
  constructor(private auth: Auth) {}
  afterInit(server: Server) {
    server.use(async (socket,next) => {
      const allowed = (process.env.APP_ORIGINS || 'http://localhost:3002,http://127.0.0.1:3002').split(',');
      if(socket.handshake.headers.origin && !allowed.includes(socket.handshake.headers.origin)) return next(new Error('Origin denied'));
      const token = socket.handshake.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      try {
        const user = await this.auth.session(token);
        if(!user) return next(new Error('Unauthorized'));
        socket.data.token = token; next();
      } catch { next(new Error('Session unavailable')); }
    });
    this.timer = setInterval(async () => {
      for (const socket of server.sockets.sockets.values()) {
        try { if (!(await this.auth.session(socket.data.token))) socket.disconnect(true); }
        catch { socket.disconnect(true); }
      }
    },30000);
  }
  // Leading + trailing throttle: the first signal goes out at once, bursts collapse into one more after the window.
  private cooldown?: NodeJS.Timeout;
  private pending = false;
  changed() {
    if (this.cooldown) { this.pending = true; return; }
    this.server?.emit('changed');
    this.cooldown = setTimeout(() => {
      this.cooldown = undefined;
      if (this.pending) { this.pending = false; this.changed(); }
    },2000);
  }
  onModuleDestroy() { if(this.timer) clearInterval(this.timer); if(this.cooldown) clearTimeout(this.cooldown); }
}
