/**
 * An item's daily rhythm, from the cloud's five-minute reads: the hours its buyers and sellers are about, and
 * whether its spread is wider or narrower than usual for this hour. ESI's history is daily, so neither can be
 * seen any other way.
 *
 * Both need about a week of watching before they mean anything, and say nothing before then. Pure.
 */

/** Days of watching before anything is said. */
export const RHYTHM_MIN_DAYS = 7;
/** Units on a side before a pattern is claimed: a handful of sales make no rhythm. */
export const RHYTHM_MIN_UNITS = 30;
/** The busy window, in hours. */
export const RHYTHM_WINDOW = 4;
/** The window must carry this many times its even share of the day (4 of 24 hours) to be called busy. */
export const RHYTHM_LIFT = 1.5;

/** One UTC hour of the day, summed over the days watched. */
export type HourBucket = { hod: number; h: number; sell: number; buy: number; days: number };

export type BusyWindow = { from: number; to: number; share: number };

/**
 * The four hours of the day (UTC) when one side trades most: `sell` is buyers taking listings, `buy` sellers
 * selling into bids. Each hour is judged per hour watched, so hours the cloud watched more don't win for it.
 * Null until there is a week of it, enough units, and a window clearly busier than the rest.
 */
export function busyHours(buckets: HourBucket[], side: 'sell' | 'buy'): BusyWindow | null {
  const days = Math.max(0, ...buckets.map((b) => b.days));
  if (days < RHYTHM_MIN_DAYS) return null;
  if (buckets.filter((b) => b.h > 0).length < 20) return null;
  if (buckets.reduce((t, b) => t + b[side], 0) < RHYTHM_MIN_UNITS) return null;
  const rate = Array.from({ length: 24 }, (_, hod) => {
    const b = buckets.find((x) => x.hod === hod);
    return b && b.h > 0 ? b[side] / b.h : 0;
  });
  const total = rate.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  let from = 0, best = -1;
  for (let s = 0; s < 24; s++) {
    let sum = 0;
    for (let k = 0; k < RHYTHM_WINDOW; k++) sum += rate[(s + k) % 24];
    if (sum > best) { best = sum; from = s; }
  }
  const share = best / total;
  return share >= (RHYTHM_LIFT * RHYTHM_WINDOW) / 24 ? { from, to: (from + RHYTHM_WINDOW) % 24, share } : null;
}

const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;

/** "Buyers take listings most between 18:00 and 22:00 EVE time (20:00–00:00 yours): 41% of it." */
export function busySaid(w: BusyWindow, side: 'sell' | 'buy', offsetHours: number): string {
  const who = side === 'sell' ? 'Buyers take listings' : 'Sellers sell into bids';
  const local = offsetHours ? ` (${hh(w.from + offsetHours)}–${hh(w.to + offsetHours)} yours)` : '';
  return `${who} most between ${hh(w.from)} and ${hh(w.to)} EVE time${local}: ${Math.round(w.share * 100)}% of it in those ${RHYTHM_WINDOW} hours.`;
}

export type HourPrice = { hour: number; bestBuy: number | null; bestSell: number | null };

/**
 * The spread now against its usual at this hour of the day: the median of the same hour on earlier days. Null
 * with fewer than a week of those, or no spread now.
 */
export function spreadAtHour(points: HourPrice[], now: number): { now: number; usual: number; days: number } | null {
  const hourNow = Math.floor(now / 3600_000);
  const spread = (p: HourPrice) => (p.bestBuy && p.bestSell && p.bestBuy > 0 ? p.bestSell / p.bestBuy - 1 : null);
  const cur = points.filter((p) => p.hour >= hourNow - 1 && spread(p) != null).pop();
  if (!cur) return null;
  const same = points
    .filter((p) => p.hour < hourNow - 1 && (hourNow - p.hour) % 24 === 0)
    .map(spread).filter((s): s is number => s != null).sort((a, b) => a - b);
  if (same.length < RHYTHM_MIN_DAYS) return null;
  const mid = same.length >> 1;
  const usual = same.length % 2 ? same[mid] : (same[mid - 1] + same[mid]) / 2;
  return { now: spread(cur)!, usual, days: same.length };
}
