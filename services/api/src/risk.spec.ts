import { classify, fuse, Sample } from './risk';
import { parseTelemetry } from './telemetry-validation';
const now=Date.parse('2026-09-25T10:00:00Z');
const h=(age=0,t=24,rh=55):Sample=>({deviceId:'h',type:'HMP155',measuredAt:new Date(now-age),temperatureC:t,humidityPct:rh,fault:false});
const f=(flame=false,age=0):Sample=>({deviceId:'f',type:'FS24X',measuredAt:new Date(now-age),flameDetected:flame,fault:false});
describe('Sensor fusion safety and time semantics',()=>{
 test('calm synchronized pair is normal',()=>{const r=fuse([h(),f()],now);expect(r.level).toBe('NORMAL');expect(r.quality).toBe('COMPLETE');expect(r.score).toBe(0);});
 test('flame alone immediately critical even without environment sensor',()=>{const r=fuse([f(true)],now);expect(r.level).toBe('CRITICAL');expect(r.score).toBeGreaterThanOrEqual(90);expect(r.quality).toBe('PARTIAL');});
 test('extreme hot dry air without flame never implies confirmed critical fire',()=>{expect(fuse([h(0,60,0),f()],now).level).not.toBe('CRITICAL');});
 test('combined adverse trends reach HIGH',()=>{const r=fuse([h(60000,42,30),h(30000,47,20),h(0,52,10),f()],now);expect(r.level).toBe('HIGH');expect(r.temperatureRate).toBeCloseTo(10);expect(r.forecast).toBeGreaterThanOrEqual(r.score!);});
 test('all stale data yields UNKNOWN, not NORMAL',()=>{const r=fuse([h(121000),f(false,121000)],now);expect(r.level).toBe('UNKNOWN');expect(r.score).toBeNull();});
 test('no environment measurement does not produce a fabricated zero score',()=>expect(fuse([f()],now).score).toBeNull());
 test('partial calm data is UNKNOWN',()=>expect(fuse([h()],now).level).toBe('UNKNOWN'));
 test('timestamp skew lowers quality',()=>{expect(fuse([h(31000),f()],now).quality).toBe('PARTIAL');});
 test('latest fault supersedes previous good value',()=>{const r=fuse([h(),f(true,5000),{...f(),fault:true}],now);expect(r.flameDetected).toBeNull();expect(r.quality).toBe('PARTIAL');});
 test('out-of-order records cannot overwrite newer observations',()=>{expect(fuse([h(),f(false),f(true,300000)],now).level).toBe('NORMAL');});
 test('trend waits for minimum duration',()=>{expect(fuse([h(10000),h(5000),h(),f()],now).temperatureRate).toBeNull();});
 test('loss of signal latches an existing alarm',()=>{const old=fuse([h(),f(true)],now);const r=fuse([],now+180000,old);expect(r.level).toBe('CRITICAL');expect(r.quality).toBe('OFFLINE');});
 test('recovery requires 60 continuous seconds and full good data',()=>{
  const old=fuse([h(),f(true)],now);
  const pending=fuse([h(),f()],now+1000,old);
  expect(pending.level).toBe('CRITICAL');expect(pending.recoverySince).not.toBeNull();
  expect(fuse([h(),f()],now+62000,pending).level).toBe('NORMAL');
  expect(fuse([],now+180000,pending).level).toBe('CRITICAL');
 });
 test('classification boundaries are consistent',()=>expect([24,25,54,55,79,80,100].map(classify)).toEqual(['NORMAL','WARNING','WARNING','HIGH','HIGH','CRITICAL','CRITICAL']));
});
describe('Telemetry validation',()=>{
 const valid={messageId:'message-0001',deviceId:'node-h',type:'HMP155',measuredAt:new Date(now).toISOString(),fault:false,simulated:true,temperatureC:24,humidityPct:55};
 test('accepts valid input',()=>expect(parseTelemetry(valid,now).temperatureC).toBe(24));
 test.each([{temperatureC:61},{temperatureC:'24'},{temperatureC:NaN},{humidityPct:-1},{deviceId:'other/path'},{measuredAt:'2026-09-25T10:00:00'},{measuredAt:new Date(now+6000).toISOString()},{fault:'false'}])('rejects malformed or impossible reading %j',bad=>expect(()=>parseTelemetry({...valid,...bad},now)).toThrow());
 test('requires boolean flame, not a synthetic confidence score',()=>expect(()=>parseTelemetry({...valid,type:'FS24X',flameDetected:0.5},now)).toThrow());
});
