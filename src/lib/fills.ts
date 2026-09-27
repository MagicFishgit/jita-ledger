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

import type { HistRow, Order, Tx } from './types';

const DAY = 86400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Days looked back over. Two weeks: long enough to be more than one quiet spell, short enough to be now. */
export const FILL_WINDOW = 14;
/** Reached on fewer days than this, a bid is below where the item trades. */
export const FILL_RARE = 4;
/** A bid reached on this many days (half the window) is where the app prices buying in. */
export const FILL_TYPICAL = 7;

/**
 * Per UTC day, what the app watched in the Jita book itself (`bookFills` in flow.ts): the lowest price a buy
 * order visibly filled at, and the highest a sell order sold at. Exact, where ESI's day is trimmed.
 */
export type WatchedExtremes = Record<string, { buyLow?: number; sellHigh?: number }>;

const lowest = (a: number | null, b: number | undefined) => (b == null ? a : a == null ? b : Math.min(a, b));
const highest = (a: number | null, b: number | undefined) => (b == null ? a : a == null ? b : Math.max(a, b));

/**
 * Each day's low and high over the last `days` calendar days, oldest first, null where nothing traded, and the
 * day the window ends on.
 *
 * With `watched`, a day's low is the lower of ESI's and the exact fill the app saw, and its high the higher:
 * evidence is only ever added, so a watched fill can make a bid reached, never take a reach away. A seller
 * selling into bids hits the best one, so a fill at a price means the top of the book was there and someone
 * sold into it. The window also runs up to today when the app watched today or yesterday, since ESI's history
 * is a day or two behind.
 */
export function recentRange(rows: Pick<HistRow, 'date' | 'lowest' | 'highest'>[], days = FILL_WINDOW, now = Date.now(), watched?: WatchedExtremes): { lows: (number | null)[]; highs: (number | null)[]; end: string } {
  // History runs a day or two behind: end on the latest day published if it's recent, else yesterday.
  const today = Date.parse(dayKey(now) + 'T00:00:00Z');
  const lastRow = rows.length ? Date.parse(rows[rows.length - 1].date + 'T00:00:00Z') : NaN;
  let end = lastRow >= today - 2 * DAY && lastRow < today ? lastRow : today - DAY;
  for (const t of [today, today - DAY]) {
    const w = watched?.[dayKey(t)];
    if (w && (w.buyLow != null || w.sellHigh != null) && t > end) { end = t; break; }
  }
  const byDay = new Map(rows.map((r) => [r.date, r]));
  const lows: (number | null)[] = [], highs: (number | null)[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(end - i * DAY);
    const r = byDay.get(k);
    lows.push(lowest(r ? r.lowest : null, watched?.[k]?.buyLow));
    highs.push(highest(r ? r.highest : null, watched?.[k]?.sellHigh));
  }
  return { lows, highs, end: dayKey(end) };
}

/**
 * Lows worked out earlier (a scan's `lows14`, ending on `end`) with the fills watched since folded in, over the
 * same days. Used where the lows were kept rather than read afresh.
 */
export function withWatchedLows(lows: (number | null)[], end: string, watched: WatchedExtremes | undefined): (number | null)[] {
  if (!watched) return lows;
  const e = Date.parse(end + 'T00:00:00Z');
  return lows.map((l, i) => lowest(l, watched[dayKey(e - (lows.length - 1 - i) * DAY)]?.buyLow));
}

/** The same for a scan's kept highs: the highest sale watched since, over the same days. */
export function withWatchedHighs(highs: (number | null)[], end: string, watched: WatchedExtremes | undefined): (number | null)[] {
  if (!watched) return highs;
  const e = Date.parse(end + 'T00:00:00Z');
  return highs.map((h, i) => highest(h, watched[dayKey(e - (highs.length - 1 - i) * DAY)]?.sellHigh));
}

/** On how many of the days the bulk of trading got down to a bid at `price`. */
export function bidReachDays(lows: (number | null)[], price: number): number {
  return lows.filter((l) => l != null && l <= price).length;
}

/** Days of your own buying that count as proof a bid is being reached. */
export const OWN_FILL_DAYS = 3;

/**
 * Whether your own buy order is plainly being reached, whatever the history says.
 *
 * Your own fills beat anything inferred from history. ESI's runs a day or two behind and trims each
 * day's range, and an order placed or repriced since the last day it covers isn't in it at all. The
 * user's Datacore - Rocket Science buy at 83,230 was called "reached on 2 of 14 days" and told to
 * cancel while 4,133 of its 10,000 had already filled: history ended on 25 Sep, the order was
 * repriced on 26 Sep, and the market had moved down in between.
 *
 * Reached if the order has shrunk since its price was set (the remaining volume first seen at this
 * price against what's left now, live when known), or if you've bought the item at or below this
 * price, in the same station, in the last OWN_FILL_DAYS days.
 */
export function fillingNow(
  o: Pick<Order, 'isBuy' | 'typeId' | 'price' | 'volumeRemain' | 'locationId' | 'seen'>,
  liveRemain: number | null | undefined,
  txs: Pick<Tx, 'source' | 'typeId' | 'isBuy' | 'unitPrice' | 'date' | 'locationId'>[],
  now = Date.now(),
): boolean {
  if (!o.isBuy) return false;
  const version = o.seen ? [...o.seen].reverse().find((v) => v.price === o.price) : undefined;
  if (version && (liveRemain ?? o.volumeRemain) < version.remain) return true;
  const since = now - OWN_FILL_DAYS * DAY;
  return txs.some((t) => t.source === 'esi' && t.isBuy && t.typeId === o.typeId
    && (t.locationId == null || t.locationId === o.locationId)
    && t.unitPrice <= o.price * (1 + 1e-9) && Date.parse(t.date) >= since);
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

/** The highest ask the bulk of trading got up to on at least `k` of the days: the k-th highest daily high. */
export function reachedAsk(highs: (number | null)[], k = FILL_TYPICAL): number | null {
  const sorted = highs.filter((h): h is number => h != null).sort((a, b) => b - a);
  return sorted.length >= k ? sorted[k - 1] : null;
}
