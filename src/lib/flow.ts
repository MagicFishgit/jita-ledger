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
  const f: Fills = { sell: 0, buy: 0, newSell: 0, newBuy: 0 };
  for (const o of prev) {
    const c = now.get(o.id);
    const gone = c ? Math.max(0, o.volume - c.volume) : o.price === (o.isBuy ? bestBid : bestAsk) ? o.volume : 0;
    if (o.isBuy) f.buy += gone; else f.sell += gone;
  }
  for (const c of cur) {
    const p = was.get(c.id);
    if (p && p.price === c.price) continue;
    if (c.isBuy ? c.price >= bestBid : c.price <= bestAsk) {
      if (c.isBuy) f.newBuy += c.volume; else f.newSell += c.volume;
    }
  }
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
  const d = days[k] ?? { h: 0, sell: 0, buy: 0, newSell: 0, newBuy: 0 };
  days[k] = { h: d.h + hours, sell: d.sell + f.sell, buy: d.buy + f.buy, newSell: d.newSell + f.newSell, newBuy: d.newBuy + f.newBuy };
  return { ...log, [typeId]: days };
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
  const t: FlowDay = { h: 0, sell: 0, buy: 0, newSell: 0, newBuy: 0 };
  for (const [k, d] of Object.entries(log[typeId] ?? {})) {
    if (k < oldest) continue;
    t.h += d.h; t.sell += d.sell; t.buy += d.buy; t.newSell += d.newSell; t.newBuy += d.newBuy;
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
