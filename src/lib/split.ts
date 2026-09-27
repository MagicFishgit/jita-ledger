/**
 * Which side of an item's daily volume can actually fill your order.
 *
 * ESI's daily volume counts every trade, and every trade has two sides: a buyer taking someone's sell
 * order, or a seller dumping into someone's buy order. Your sell order only fills from the first kind
 * and your buy order only from the second, so treating the whole of the volume as yours to capture
 * overstates how fast either of your orders fills --- often by half.
 *
 * History doesn't say how the volume divided, but it does give each day's low, high and average. Sells
 * fill near the top of the day's range and bids near the bottom, so where the average sits between the
 * two says roughly which kind of trade dominated. That is a heuristic, stated as one wherever it is used.
 */

import type { HistRow } from './types';

// Kept here rather than imported from ./prospects, which imports this module.
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** When history cannot tell, assume an even split rather than either extreme. */
export const EVEN_SPLIT = 0.5;

/** Days either side of a day that make up its neighbourhood, for telling a one-sided day. */
const NEAR_DAYS = 3;
/** Two-sided days needed before they alone are trusted; fewer, and every day is read as before. */
export const MIN_TWO_SIDED = 7;

/**
 * The share of volume that was buyers taking sell orders, 0 to 1, as the median over the days given.
 *
 * A day only says something when both kinds of trade happened in it. A flat day (low equals high)
 * says nothing, and neither does a one-sided day: one that traded only in the upper half of the week
 * around it (buyers taking listings, nobody dumping) or only in the lower half. Where the average sat
 * inside such a day's narrow range is noise, and it was being read as a split. Syndicate Gas Cloud
 * Scoop traded between 107.8 M and 109.1 M on 24 Sep 2026, nowhere near its ~101 M bids, and counted
 * as a day of mostly sellers dumping. Rows without dates can't be placed in a week, and are read as
 * before; so is a month with too few two-sided days to be worth a median.
 */
export function buyerShare(rows: (Pick<HistRow, 'average' | 'highest' | 'lowest'> & { date?: string })[]): number {
  const own = (r: Pick<HistRow, 'average' | 'highest' | 'lowest'>) => Math.min(1, Math.max(0, (r.average - r.lowest) / (r.highest - r.lowest)));
  const all = rows.filter((r) => r.highest > r.lowest && r.average > 0);
  if (all.length && all.every((r) => r.date)) {
    const t = (r: { date?: string }) => Date.parse(r.date + 'T00:00:00Z');
    const twoSided = all.filter((r) => {
      const near = rows.filter((x) => x.date && Math.abs(t(x) - t(r)) <= NEAR_DAYS * 86400_000);
      const lo = Math.min(...near.map((x) => x.lowest)), hi = Math.max(...near.map((x) => x.highest));
      if (!(hi > lo)) return false;
      const mid = lo + (hi - lo) / 2;
      return r.lowest < mid && r.highest > mid;
    });
    if (twoSided.length >= MIN_TWO_SIDED) return median(twoSided.map(own));
  }
  return all.length ? median(all.map(own)) : EVEN_SPLIT;
}

/** Units a day that reach your side: buyers for a sell order, sellers for a buy order. */
export function sideVolume(unitsPerDay: number, buyers: number, isBuy: boolean): number {
  return unitsPerDay * (isBuy ? 1 - buyers : buyers);
}

/**
 * Your share of a side, scaled by how many people you are competing with for it.
 *
 * The base share is your own guess at what you capture (Settings). Standing in a queue of sixty
 * sellers is a different proposition from standing among ten, so the share is scaled by 60 over the
 * number of competing orders, never below 0.3 of your base or above 1.5 of it. The constants are a
 * stated proposal, not a measurement: nothing in ESI says how fill order is shared out.
 */
export const COMPETITION_PIVOT = 60;
export const COMPETITION_MIN = 0.3;
export const COMPETITION_MAX = 1.5;
export function competitionShare(baseSharePct: number, competingOrders: number): number {
  const scale = Math.min(COMPETITION_MAX, Math.max(COMPETITION_MIN, COMPETITION_PIVOT / Math.max(1, competingOrders)));
  return (baseSharePct / 100) * scale;
}

/**
 * How long a full round trip takes: the buy fills from sellers, then the sell fills from buyers, each at
 * your share of that side alone. Infinite when either side never trades.
 */
export function roundTripDays(qty: number, unitsPerDay: number, buyers: number, share: number): number {
  const fromSellers = sideVolume(unitsPerDay, buyers, true) * share;
  const fromBuyers = sideVolume(unitsPerDay, buyers, false) * share;
  if (!(fromSellers > 0) || !(fromBuyers > 0) || !(qty > 0)) return Infinity;
  return qty / fromSellers + qty / fromBuyers;
}

/** The floor on time tied up, so a trade that turns in minutes is not credited with an infinite rate. */
export const MIN_DAYS = 1 / 24;

/** Return divided by the days the ISK sits in the trade. What a 6% trade in hours beats a 12% week on. */
export function returnPerDay(roi: number, days: number): number {
  if (!Number.isFinite(days) || !Number.isFinite(roi)) return NaN;
  return roi / Math.max(days, MIN_DAYS);
}

/**
 * What one order slot earns a day: the net per unit at your rates, times the units your side of the
 * market fills for you each day at your share.
 */
export function slotIskPerDay(netPerUnit: number, unitsPerDay: number, buyers: number, isBuy: boolean, share: number): number {
  const fills = sideVolume(unitsPerDay, buyers, isBuy) * share;
  return netPerUnit * fills;
}

/**
 * Units a day you can push through an item with both orders working: the slower of the two sides,
 * each at your share scaled for the orders queued on that side.
 */
export function throughput(unitsPerDay: number, buyers: number, baseSharePct: number, buyOrders: number, sellOrders: number): number {
  const unitsIn = sideVolume(unitsPerDay, buyers, true) * competitionShare(baseSharePct, buyOrders);
  const unitsOut = sideVolume(unitsPerDay, buyers, false) * competitionShare(baseSharePct, sellOrders);
  return Math.min(unitsIn, unitsOut);
}
