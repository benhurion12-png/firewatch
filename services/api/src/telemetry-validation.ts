import { Sample } from './risk';
export type Telemetry = Sample & { messageId: string };
export function parseTelemetry(raw: unknown, now = Date.now()): Telemetry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected object');
  const p = raw as Record<string, unknown>;
  if (typeof p.deviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.deviceId)) throw new Error('Invalid deviceId');
  if (typeof p.messageId !== 'string' || p.messageId.length < 8 || p.messageId.length > 100) throw new Error('Invalid messageId');
  if (p.type !== 'HMP155' && p.type !== 'FS24X') throw new Error('Invalid sensor type');
  if (typeof p.measuredAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(p.measuredAt)) throw new Error('Timestamp must include timezone');
  const date = Date.parse(p.measuredAt);
  if (!Number.isFinite(date) || date > now+5000 || date < now-86400000) throw new Error('Timestamp outside allowed window');
  if (typeof p.fault !== 'boolean' || typeof p.simulated !== 'boolean') throw new Error('fault and simulated must be boolean');
  const number = (key: string, min: number, max: number) => {
    const value = p[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid '+key);
    return value;
  };
  const base = { messageId:p.messageId, deviceId:p.deviceId, type:p.type, measuredAt:new Date(date), fault:p.fault, simulated:p.simulated };
  if (p.type === 'HMP155') return { ...base, type:'HMP155', temperatureC:number('temperatureC',-80,60), humidityPct:number('humidityPct',0,100) };
  if (typeof p.flameDetected !== 'boolean') throw new Error('Invalid flameDetected');
  return { ...base, type:'FS24X', flameDetected:p.flameDetected };
}
