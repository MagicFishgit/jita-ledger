import { sideVolume, tradingSplit, type BookSold, type SplitFrom } from './split';

/**
 * One order in a book: the same shape as `OrderLite` in market.ts, written out so the cloud Worker can use
 * this module without reaching the browser-only market code.
 */
export type OrderLite = { id: number; isBuy: boolean; price: number; volume: number };

/**
 * How fast each side of a Jita book actually moves, measured from the order checks the app already makes.
 *
 * "Clears in" divides the queue ahead of you by how fast your side of the market trades. The daily
 * volume is known (ESI history), but not which side it trades on: `buyerShare` guesses that from where
 * each day's average sat between its low and high. A six-hour study of the user's 71 beaten orders
 * (September 2026, 79 reads of each book five minutes apart) found the queue mechanics right --- every
 * unit sold at Jita came off the orders ahead of theirs --- and Jita's whole trade near the 14-day typical
 * pace, but the guessed split off by a median 0.33 against what the books showed, often calling an item
 * nearly all buyers while the sellers dumping into bids did nearly all the trading. Only 4 of the 22
 * orders predicted to reach the front in that time did.
 *
 * Two reads of the same book show the split directly: a sell order that shrank was bought from, a buy
 * order that shrank was sold into. So every check adds what it saw, per item and day, and the pace used
 * blends that with the history-based guess, trusting the watching more the longer it has watched.
 */

export type Fills = {
  /** Units bought from listings: what fills a sell order. */
  sell: number;
  /** Units sold into bids: what fills a buy order. */
  buy: number;
  /** Units newly listed at or below the best ask: undercuts on the sell side. */
  newSell: number;
  /** Units newly bid at or above the best bid. */
  newBuy: number;
  /**
   * The lowest price a buy order visibly filled at: one that shrank between the reads. Exact and Jita's own,
   * where ESI's daily low is trimmed and region-wide. A vanished order doesn't count here: it may have been
   * cancelled, and a false "trading reached this price" is the mistake the reach rule exists to prevent.
   */
  buyLow?: number;
  /** The highest price a sell order visibly sold at, the same way. */
  sellHigh?: number;
  /** Times the best price improved on each side: someone undercut (or outbid) the front. */
  frontSell?: number;
  frontBuy?: number;
  /** Orders that changed price under the same order ID: relisting. */
  repriceSell?: number;
  repriceBuy?: number;
};

/**
 * What happened between two reads of one book. A shrunken order is a sale. A whole order that vanished is
 * counted only if it was the best on its side (the one a buyer or seller would have hit), since deeper
 * ones leave mostly by being cancelled or expiring. New orders, or repriced ones, at or past the old best
 * are the undercuts.
 */
export function bookFills(prev: OrderLite[], cur: OrderLite[]): Fills {
  const now = new Map(cur.map((o) => [o.id, o]));
  const was = new Map(prev.map((o) => [o.id, o]));
  let bestAsk = Infinity, bestBid = -Infinity;
  for (const o of prev) {
    if (o.isBuy) bestBid = Math.max(bestBid, o.price);
    else bestAsk = Math.min(bestAsk, o.price);
  }
  const f: Fills = { sell: 0, buy: 0, newSell: 0, newBuy: 0, frontSell: 0, frontBuy: 0, repriceSell: 0, repriceBuy: 0 };
  for (const o of prev) {
    const c = now.get(o.id);
    const gone = c ? Math.max(0, o.volume - c.volume) : o.price === (o.isBuy ? bestBid : bestAsk) ? o.volume : 0;
    if (o.isBuy) f.buy += gone; else f.sell += gone;
    // A partial fill is certain; it is at the price the order stood at before the read.
    if (c && c.volume < o.volume) {
      if (o.isBuy) f.buyLow = Math.min(f.buyLow ?? Infinity, o.price);
      else f.sellHigh = Math.max(f.sellHigh ?? -Infinity, o.price);
    }
  }
  let newAsk = Infinity, newBid = -Infinity;
  for (const c of cur) {
    if (c.isBuy) newBid = Math.max(newBid, c.price); else newAsk = Math.min(newAsk, c.price);
    const p = was.get(c.id);
    if (p && p.price !== c.price) { if (c.isBuy) f.repriceBuy!++; else f.repriceSell!++; }
    if (p && p.price === c.price) continue;
    if (c.isBuy ? c.price >= bestBid : c.price <= bestAsk) {
      if (c.isBuy) f.newBuy += c.volume; else f.newSell += c.volume;
    }
  }
  // The front improves only when an order is placed or repriced past it; buying out the best listing makes
  // the next one the best, a worse price, which isn't counted.
  if (Number.isFinite(bestAsk) && newAsk < bestAsk) f.frontSell = 1;
  if (Number.isFinite(bestBid) && newBid > bestBid) f.frontBuy = 1;
  return f;
}

/** Per item, per UTC day: hours watched and what was seen. */
export type FlowDay = Fills & { h: number };
export type FlowLog = Record<number, Record<string, FlowDay>>;

/** Days kept. Older watching says little about today's market. */
export const FLOW_DAYS = 14;
/**
 * The longest gap between two reads that still counts. Over a longer one (the app was closed) an order
 * listed and bought out in between is invisible, so the gap would read as quieter than it was.
 */
export const MAX_GAP_H = 0.5;
/**
 * How many hours of watching the history-based guess is worth. Until the app has watched an item about
 * this long, the guess carries at least half the weight; a thin item watched for a day with no sale
 * halves its pace rather than dropping to zero.
 */
export const PRIOR_HOURS = 24;

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Adds one interval's reading. Intervals of nothing or of more than MAX_GAP_H are not counted. */
export function addFlow(log: FlowLog, typeId: number, at: number, hours: number, f: Fills): FlowLog {
  if (!(hours > 0) || hours > MAX_GAP_H) return log;
  const days = { ...(log[typeId] ?? {}) };
  const k = dayOf(at);
  days[k] = mergeDay(days[k], { ...f, h: hours });
  return { ...log, [typeId]: days };
}

const lower = (a: number | undefined, b: number | undefined) => (a == null ? b : b == null ? a : Math.min(a, b));
const higher = (a: number | undefined, b: number | undefined) => (a == null ? b : b == null ? a : Math.max(a, b));

/** Two readings of the same day added together: counts summed, the extremes kept. */
export function mergeDay(a: FlowDay | undefined, b: FlowDay): FlowDay {
  if (!a) return { ...b };
  return {
    h: a.h + b.h, sell: a.sell + b.sell, buy: a.buy + b.buy, newSell: a.newSell + b.newSell, newBuy: a.newBuy + b.newBuy,
    buyLow: lower(a.buyLow, b.buyLow), sellHigh: higher(a.sellHigh, b.sellHigh),
    frontSell: (a.frontSell ?? 0) + (b.frontSell ?? 0), frontBuy: (a.frontBuy ?? 0) + (b.frontBuy ?? 0),
    repriceSell: (a.repriceSell ?? 0) + (b.repriceSell ?? 0), repriceBuy: (a.repriceBuy ?? 0) + (b.repriceBuy ?? 0),
  };
}

export function pruneFlow(log: FlowLog, now: number): FlowLog {
  const oldest = dayOf(now - (FLOW_DAYS - 1) * 86400_000);
  const out: FlowLog = {};
  for (const [id, days] of Object.entries(log)) {
    const kept = Object.fromEntries(Object.entries(days).filter(([k]) => k >= oldest));
    if (Object.keys(kept).length) out[Number(id)] = kept;
  }
  return out;
}

/** Everything watched for an item over the last FLOW_DAYS. */
export function observedFlow(log: FlowLog, typeId: number, now: number): FlowDay {
  const oldest = dayOf(now - (FLOW_DAYS - 1) * 86400_000);
  let t: FlowDay = { h: 0, sell: 0, buy: 0, newSell: 0, newBuy: 0 };
  for (const [k, d] of Object.entries(log[typeId] ?? {})) {
    if (k < oldest) continue;
    t = mergeDay(t, d);
  }
  return t;
}

/**
 * Units a day on one side: the history-based guess (`prior`, units a day) blended with what was watched
 * (`units` over `hours`), as if the guess were PRIOR_HOURS of watching. With no guess, watching alone
 * once there's a quarter of that; otherwise null.
 */
export function pace(prior: number | null, units: number, hours: number, w = PRIOR_HOURS): number | null {
  if (prior == null || !Number.isFinite(prior)) return hours >= w / 4 ? (units / hours) * 24 : null;
  return ((units + (prior / 24) * w) / (hours + w)) * 24;
}

/** Hours an item must be watched before anything is said about how often it's undercut. */
export const RELIST_MIN_H = 6;
/** Undercut at least this often, in minutes, and a side is "busy relisting". */
export const BUSY_RELIST_MIN = 30;

export type RelistPace = { everyMin: number | null; watchedH: number; busy: boolean; said: string };

const every = (min: number) => (min < 60 ? `${Math.max(5, Math.round(min))} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} days`);

/**
 * How often the front of one side was undercut (or outbid) while watched. Information only: it says nothing
 * about whether a trade pays, so nothing is hidden or ranked lower for it. A busy side means expect to be
 * undercut soon after you relist; pricing patiently, at a level that fills over time, beats chasing the front.
 * Reads are five minutes apart, so the most it can say is "every 5 min".
 */
export function relistPace(f: FlowDay, isBuy: boolean): RelistPace | null {
  if (!(f.h >= RELIST_MIN_H)) return null;
  const n = (isBuy ? f.frontBuy : f.frontSell) ?? 0;
  const everyMin = n > 0 ? (f.h * 60) / n : null;
  const side = isBuy ? 'best bid' : 'best sell price';
  return {
    everyMin, watchedH: f.h,
    busy: everyMin != null && everyMin <= BUSY_RELIST_MIN,
    said: everyMin == null
      ? `The ${side} wasn’t undercut in the ${Math.round(f.h)} h watched.`
      : `The ${side} was ${isBuy ? 'outbid' : 'undercut'} about every ${every(everyMin)} over the ${Math.round(f.h)} h watched.`,
  };
}

/**
 * Units a day that reach your side of an item: buyers taking listings for a sell, sellers dumping into
 * bids for a buy. The guess from history (the typical day, split by what the live orders have sold or by
 * where each day's average sat) is blended with what was watched of the Jita book, trusted more the
 * longer it has watched. `watchedH` says how much watching there is behind it. Used by the app's order
 * check and by the cloud's, so both judge an order the same way.
 */
export function sidePaceOf(
  ev: { daily: number | null | undefined; buyers: number | undefined; sold: BookSold | undefined; watched: FlowDay },
  isBuy: boolean,
): { perDay: number | null; watchedH: number; undercutsPerH: number | null; splitFrom: SplitFrom } {
  const split = tradingSplit({ history: ev.buyers, book: ev.sold });
  const prior = ev.daily != null ? sideVolume(ev.daily, split.share, isBuy) : null;
  const o = ev.watched;
  return {
    perDay: pace(prior, isBuy ? o.buy : o.sell, o.h),
    watchedH: o.h,
    splitFrom: split.from,
    undercutsPerH: o.h > 0 ? (isBuy ? o.newBuy : o.newSell) / o.h : null,
  };
}
