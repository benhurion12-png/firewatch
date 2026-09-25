// Transparent engineering heuristic v1. Not a trained model or probability.
export type Level = 'UNKNOWN' | 'NORMAL' | 'WARNING' | 'HIGH' | 'CRITICAL';
export type Sample = {
  deviceId: string; type: 'HMP155' | 'FS24X'; measuredAt: Date | string;
  temperatureC?: number | null; humidityPct?: number | null;
  flameDetected?: boolean | null; fault: boolean; simulated?: boolean;
};
export type Risk = {
  version: string; score: number | null; level: Level; quality: 'COMPLETE' | 'PARTIAL' | 'OFFLINE';
  temperatureC: number | null; humidityPct: number | null; flameDetected: boolean | null;
  temperatureRate: number | null; humidityRate: number | null;
  contributions: { label: string; value: number; max: number }[];
  reasons: string[]; forecast: number | null; recoverySince: string | null;
  measuredAt: string | null; simulated: boolean;
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const rank: Record<Level, number> = { UNKNOWN: -1, NORMAL: 0, WARNING: 1, HIGH: 2, CRITICAL: 3 };
const threshold: Record<Level, number> = { UNKNOWN: 0, NORMAL: 0, WARNING: 25, HIGH: 55, CRITICAL: 80 };
export const classify = (score: number): Level => score >= 80 ? 'CRITICAL' : score >= 55 ? 'HIGH' : score >= 25 ? 'WARNING' : 'NORMAL';
const ts = (s: Sample) => new Date(s.measuredAt).getTime();
function slope(rows: Sample[], field: 'temperatureC' | 'humidityPct', now: number) {
  const values = rows.filter(s => !s.fault && now - ts(s) <= 300000 && ts(s) <= now && typeof s[field] === 'number');
  if (values.length < 3 || Math.max(...values.map(ts)) - Math.min(...values.map(ts)) < 30000) return null;
  const xs = values.map(s => (ts(s) - now) / 60000), ys = values.map(s => s[field] as number);
  const mx = xs.reduce((a,b) => a+b, 0) / xs.length, my = ys.reduce((a,b) => a+b, 0) / ys.length;
  const den = xs.reduce((a,x) => a + (x-mx)**2, 0);
  return den ? xs.reduce((a,x,i) => a+(x-mx)*(ys[i]-my), 0)/den : null;
}
export function fuse(samples: Sample[], now = Date.now(), previous?: Risk | null): Risk {
  const ordered = samples.filter(s => ts(s) <= now + 5000).sort((a,b) => ts(b)-ts(a));
  const latest = (type: Sample['type']) => ordered.find(s => s.type === type);
  const rawH = latest('HMP155'), rawF = latest('FS24X');
  const fresh = (s?: Sample) => !!s && now-ts(s) <= 120000;
  const h = fresh(rawH) && !rawH!.fault ? rawH : undefined;
  const f = fresh(rawF) && !rawF!.fault ? rawF : undefined;
  const temperature = h?.temperatureC ?? null, humidity = h?.humidityPct ?? null;
  const synchronized = !!h && !!f && Math.abs(ts(h)-ts(f)) <= 30000;
  const quality: Risk['quality'] = synchronized ? 'COMPLETE' : (h || f) ? 'PARTIAL' : 'OFFLINE';
  const history = h ? ordered.filter(s => s.type === 'HMP155' && s.deviceId === h.deviceId) : [];
  const tr = slope(history, 'temperatureC', now), hr = slope(history, 'humidityPct', now);
  const t = temperature === null ? 0 : clamp((temperature-25)/25);
  const d = humidity === null ? 0 : clamp((50-humidity)/40);
  const rt = tr === null ? 0 : clamp(tr/3), rh = hr === null ? 0 : clamp(-hr/5);
  const contributions = [
    {label: 'Температура', value: 20*t, max: 20},
    {label: 'Сухость воздуха', value: 15*d, max: 15},
    {label: 'Рост температуры', value: 15*rt, max: 15},
    {label: 'Падение влажности', value: 10*rh, max: 10},
    {label: 'Сочетание жары и сухости', value: 10*t*d, max: 10},
    {label: 'Пламя FS24X', value: f?.flameDetected ? 30 : 0, max: 30},
  ].map(c => ({...c, value: Math.round(c.value*10)/10}));
  let score: number | null = h || f?.flameDetected ? Math.round(contributions.reduce((sum,c) => sum+c.value, 0)) : null;
  if (f?.flameDetected) score = Math.max(score ?? 0, 90);
  let level: Level = score === null ? 'UNKNOWN' : classify(score);
  const reasons: string[] = [];
  if (!fresh(rawH)) reasons.push('Нет свежих данных HMP155');
  if (!fresh(rawF)) reasons.push('Нет свежих данных FS24X');
  if (rawH?.fault) reasons.push('HMP155 сообщает о неисправности');
  if (rawF?.fault) reasons.push('FS24X сообщает о неисправности');
  if (h && f && !synchronized) reasons.push('Измерения датчиков расходятся более чем на 30 секунд');
  if (temperature !== null && temperature >= 35) reasons.push('Повышенная температура');
  if (humidity !== null && humidity <= 30) reasons.push('Низкая относительная влажность');
  if (tr !== null && tr >= 1) reasons.push('Температура быстро растёт');
  if (hr !== null && hr <= -2) reasons.push('Влажность быстро снижается');
  if (f?.flameDetected) reasons.push('FS24X обнаружил пламя');
  if (h && tr === null) reasons.push('Накопление истории для оценки динамики');
  // Incomplete coverage must never appear as a reassuring NORMAL state.
  if (quality !== 'COMPLETE' && level === 'NORMAL') level = 'UNKNOWN';
  let recoverySince: string | null = null;
  if (previous && rank[previous.level] >= 1 && rank[level] < rank[previous.level]) {
    if (quality === 'COMPLETE' && score !== null && score < threshold[previous.level]-5) {
      recoverySince = previous.recoverySince || new Date(now).toISOString();
      if (now-new Date(recoverySince).getTime() < 60000) {
        level = previous.level;
        reasons.push('Ожидание 60 секунд устойчивого снижения риска');
      } else recoverySince = null;
    } else {
      level = previous.level;
      reasons.push('Предыдущая тревога сохранена до восстановления достоверных данных');
    }
  }
  const projectedT = temperature === null ? null : Math.min(60, temperature + Math.max(0, tr ?? 0)*5);
  const projectedH = humidity === null ? null : Math.max(0, humidity + Math.min(0, hr ?? 0)*5);
  const forecast = quality === 'COMPLETE' && tr !== null && hr !== null && projectedT !== null && projectedH !== null
    ? Math.max(score ?? 0, Math.round(20*clamp((projectedT-25)/25)+15*clamp((50-projectedH)/40)+15*rt+10*rh+10*clamp((projectedT-25)/25)*clamp((50-projectedH)/40)+(f?.flameDetected ? 30 : 0))) : null;
  return { version:'fusion-v1', score, level, quality, temperatureC:temperature, humidityPct:humidity,
    flameDetected:f?.flameDetected ?? null, temperatureRate:tr, humidityRate:hr, contributions, reasons,
    forecast:forecast === null ? null : Math.min(100, forecast), recoverySince,
    measuredAt: ordered[0] ? new Date(ts(ordered[0])).toISOString() : null,
    simulated: ordered.some(s => fresh(s) && s.simulated) };
}
