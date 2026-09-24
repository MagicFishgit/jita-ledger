import type { HistRow, ProspectStats } from './types';

const DAY = 86400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const startOf = (t: number) => Date.parse(dayKey(t) + 'T00:00:00Z');

/** Middle value, or the mean of the middle two. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Reduce ESI's daily history to the handful of numbers a screener needs.
 *
 * The window is the 30 complete days ending yesterday: today's history is still filling and
 * ESI runs about a day behind. ESI leaves days with no trades out of the response entirely,
 * so a gap is not missing data — it is a day nothing sold, which is exactly what we came to
 * measure. Returns null when nothing traded in the window, the honest answer for a dead item.
 */
export function statsFrom(typeId: number, rows: HistRow[], now = Date.now()): ProspectStats | null {
  const end = startOf(now - DAY);
  const within = (r: HistRow, days: number) => {
    const t = Date.parse(r.date + 'T00:00:00Z');
    return t >= end - (days - 1) * DAY && t <= end;
  };

  const w30 = rows.filter((r) => within(r, 30));
  if (!w30.length) return null;
  const w90 = rows.filter((r) => within(r, 90));

  const vols = w30.map((r) => r.volume);
  const total = vols.reduce((a, b) => a + b, 0);
  const avg30 = w30.reduce((s, r) => s + r.average, 0) / w30.length;
  const avg90 = w90.length ? w90.reduce((s, r) => s + r.average, 0) / w90.length : avg30;

  const byDay = new Map(w30.map((r) => [r.date, r.volume]));
  const spark: number[] = [];
  for (let i = 29; i >= 0; i--) spark.push(byDay.get(dayKey(end - i * DAY)) ?? 0);

  return {
    typeId,
    at: new Date(now).toISOString(),
    daysTraded: Math.min(30, w30.length),
    tradesPerDay: median(w30.map((r) => r.order_count)),
    unitsPerDay: median(vols),
    spikiness: total > 0 ? Math.max(...vols) / total : 1,
    dailyRange: median(w30.map((r) => (r.average > 0 ? (r.highest - r.lowest) / r.average : 0))),
    trend: avg90 > 0 ? avg30 / avg90 - 1 : 0,
    avgPrice: avg30,
    spark,
  };
}
