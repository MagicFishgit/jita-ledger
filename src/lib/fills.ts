/**
 * Whether trading actually reaches a price: the test behind "will this buy order ever fill".
 *
 * A wide gap between the best bid and the best ask looks like margin, but a bid only fills when
 * someone sells into it, and on many items sellers list and wait instead. ESI's daily history says
 * where each day's trading happened: its `lowest` is roughly the cheapest a meaningful share of the
 * day sold for. So counting the days whose low reached a bid says how often the bulk of trading got
 * down to it.
 *
 * "Roughly" and "the bulk" are deliberate. Checked against the user's own wallet in September 2026,
 * ESI's daily high and low leave out a small share of each day's trades --- 86 of 182 days they sold
 * something had a sale above the reported high, the trades left out typically about 2% of that day's
 * volume and once 25%. So a day whose low stayed above your bid is a day when most trading stayed
 * above it, not proof that nothing sold lower. A position can't be built on that trimmed tail, which
 * is why it's still the right measure.
 *
 * Pure: takes history rows, returns counts and prices.
 */

import type { HistRow } from './types';

const DAY = 86400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Days looked back over. Two weeks: long enough to be more than one quiet spell, short enough to be now. */
export const FILL_WINDOW = 14;
/** Reached on fewer days than this, a bid is below where the item trades. */
export const FILL_RARE = 4;
/** A bid reached on this many days (half the window) is where the app prices buying in. */
export const FILL_TYPICAL = 7;

/** Each day's low and high over the last `days` calendar days, oldest first, null where nothing traded. */
export function recentRange(rows: Pick<HistRow, 'date' | 'lowest' | 'highest'>[], days = FILL_WINDOW, now = Date.now()): { lows: (number | null)[]; highs: (number | null)[] } {
  // History runs a day or two behind: end on the latest day published if it's recent, else yesterday.
  const today = Date.parse(dayKey(now) + 'T00:00:00Z');
  const lastRow = rows.length ? Date.parse(rows[rows.length - 1].date + 'T00:00:00Z') : NaN;
  const end = lastRow >= today - 2 * DAY && lastRow < today ? lastRow : today - DAY;
  const byDay = new Map(rows.map((r) => [r.date, r]));
  const lows: (number | null)[] = [], highs: (number | null)[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const r = byDay.get(dayKey(end - i * DAY));
    lows.push(r ? r.lowest : null);
    highs.push(r ? r.highest : null);
  }
  return { lows, highs };
}

/** On how many of the days the bulk of trading got down to a bid at `price`. */
export function bidReachDays(lows: (number | null)[], price: number): number {
  return lows.filter((l) => l != null && l <= price).length;
}

/** On how many of the days the bulk of trading got up to an ask at `price`. The sell side of the same test. */
export function askReachDays(highs: (number | null)[], price: number): number {
  return highs.filter((h) => h != null && h >= price).length;
}

/**
 * The lowest bid the bulk of trading reached on at least `k` of the days: the k-th lowest daily low.
 * Null when fewer than `k` days traded at all. A day with no trades reaches nothing.
 */
export function reachedBid(lows: (number | null)[], k = FILL_TYPICAL): number | null {
  const sorted = lows.filter((l): l is number => l != null).sort((a, b) => a - b);
  return sorted.length >= k ? sorted[k - 1] : null;
}
