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
 * two says roughly which kind of trade dominated (`buyerShare`). That turned out to be a weak guess, so
 * `tradingSplit` prefers two better sources when they exist: what the live orders in the book have
 * already sold on each side, and what this app has watched each side of the Jita book do.
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

/**
 * Units already sold from the live orders in a book, per side: `sell` is what buyers took from listings,
 * `buy` what sellers dumped into bids. Every order carries its original size and what's left, so one read
 * of the book shows which side has been trading, with no history needed.
 */
export type BookSold = {
  sell: number;
  buy: number;
  /**
   * How many of each side's orders were placed for a single unit. Such an order can't show a partial sale:
   * bought, it simply vanishes. Absent on books read before this was kept.
   */
  single?: { sell: number; buy: number };
  /** How many orders each side has. */
  orders?: { sell: number; buy: number };
};

/** What the live orders in a book have already sold, per side. Shared with the cloud's market watch. */
export function soldFrom(orders: { is_buy_order: boolean; volume_remain: number; volume_total?: number }[]): BookSold {
  const s: BookSold = { sell: 0, buy: 0, single: { sell: 0, buy: 0 }, orders: { sell: 0, buy: 0 } };
  for (const o of orders) {
    const total = o.volume_total ?? o.volume_remain;
    const n = Math.max(0, total - o.volume_remain);
    const side = o.is_buy_order ? 'buy' : 'sell';
    s[side] += n;
    s.orders![side]++;
    if (total === 1) s.single![side]++;
  }
  return s;
}

/**
 * A side with more than this share of its orders placed for one unit can't show its sales in the book (nor can a side
 * with no orders, `bookCanTell`),
 * since a single unit bought just vanishes. Item 16423 had 7 of 10 listings at one unit, so the book read
 * its buyers as none at all while history's guess said 69%; the book isn't trusted there.
 */
export const MAX_SINGLE_SHARE = 0.5;

/** Whether what a book's orders have sold can speak for both of its sides. */
export function bookCanTell(b: BookSold): boolean {
  if (!b.single || !b.orders) return true;
  // A side with no orders at all can't show what it sold either: a buy order that filled up leaves the book, and its
  // fills go with it. The Experimental ZW-4100 Torpedo Launcher (29 September 2026): the one Jita bid, which had taken
  // three quarters of the trading, filled up and went, so the book read 100% buyers while the cloud had watched 26%;
  // the Calculator blended that to 77% and put ~380 buyers a day on listings the watch saw taken ~49 a day. Of 358
  // books the book is trusted on with 30+ units watched, it was the only one with an empty side, and 0.74 off where
  // the rest were a median 0.14.
  if (b.orders.sell === 0 || b.orders.buy === 0) return false;
  const side = (n: number, of: number) => of === 0 || n / of <= MAX_SINGLE_SHARE;
  return side(b.single.sell, b.orders.sell) && side(b.single.buy, b.orders.buy);
}

/** Fewer units sold than this from the live orders, and the book says too little about who trades. */
export const MIN_BOOK_SOLD = 20;

export type SplitFrom = 'watched' | 'book' | 'history' | 'even';
export type TradingSplit = { share: number; from: SplitFrom; watchedH: number };

/**
 * The share of trading that is buyers taking listings, from the best evidence at hand.
 *
 * Checked against six hours of the user's Jita books (September 2026) the guess from history (`buyerShare`)
 * was a median 0.33 away from the split the books showed, while what the live orders had already sold was
 * 0.16 away. So the book comes first when it has sold enough to say anything, history when it hasn't, and
 * an even split with neither. What the app has watched the Jita book do (`lib/flow.ts`) is then blended in,
 * weighted as if that prior were one typical day of trading: a day of watching counts as much as the prior.
 */
export function tradingSplit(ev: {
  history?: number | null;
  book?: BookSold | null;
  watched?: { sell: number; buy: number; h: number } | null;
  /** Units a typical day, which sets how much the watching is worth against the prior. */
  typicalDay?: number | null;
}): TradingSplit {
  const b = ev.book;
  const sold = b ? b.sell + b.buy : 0;
  const prior: { s: number; from: SplitFrom } = b && sold >= MIN_BOOK_SOLD && bookCanTell(b) ? { s: b.sell / sold, from: 'book' }
    : ev.history != null && Number.isFinite(ev.history) ? { s: ev.history, from: 'history' }
      : { s: EVEN_SPLIT, from: 'even' };
  const w = ev.watched;
  const seen = w ? w.sell + w.buy : 0;
  if (!w || !(seen > 0)) return { share: prior.s, from: prior.from, watchedH: w?.h ?? 0 };
  const weight = ev.typicalDay != null && ev.typicalDay > 0 ? ev.typicalDay : MIN_BOOK_SOLD;
  return { share: (w.sell + prior.s * weight) / (seen + weight), from: seen >= weight ? 'watched' : prior.from, watchedH: w.h };
}

/** Where a split came from, in words, for tips. */
export const SPLIT_SAID: Record<SplitFrom, string> = {
  watched: 'measured from what this app has watched sell on each side of the Jita book',
  book: 'read from what the orders in the Jita book have already sold on each side',
  history: 'guessed from where each day’s average sat between its low and high',
  even: 'assumed even, with nothing to go on',
};

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
export function throughput(unitsPerDay: number, buyers: number, baseSharePct: number, buyOrders: number, sellOrders: number,
  /**
   * For orders behind the front on purpose: the share of days trading reaches each price. It only fills on
   * those days, so each side's pace is scaled by it. Rough: daily data can't say how deep each day's selling
   * went, and the share of the queue is counted as if you were at the front.
   */
  reach?: { buy: number; sell: number }): number {
  const unitsIn = sideVolume(unitsPerDay, buyers, true) * competitionShare(baseSharePct, buyOrders) * (reach?.buy ?? 1);
  const unitsOut = sideVolume(unitsPerDay, buyers, false) * competitionShare(baseSharePct, sellOrders) * (reach?.sell ?? 1);
  return Math.min(unitsIn, unitsOut);
}
