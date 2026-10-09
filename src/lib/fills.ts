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

import { tickDown, tickUp } from './tick';
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
 * A price reached on this many of the 14 days is where trading gets to on most days: the safer patient ask on a
 * position (the 11th-highest daily high), beside the one reached on half of them.
 */
export const FILL_MOST = 11;

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

/**
 * A left order (Place and leave, or left by hand) is judged on the days since it was first placed once trading happened on
 * this many of them; before then it's judged as any other left order, on the last 14 days. The plans review (9 October
 * 2026): the 2 October plan's bids, priced where trading reached on half the fortnight before, kept reading "reached on 5
 * of the last 14 days" for a week while the market had risen away from them, the reaching days all from before they
 * existed: 633 M sat in 13 such bids. Three days of trading is the least that says the market has left one.
 */
export const LEFT_MIN_DAYS = 3;

/**
 * The days of a window of daily lows or highs (`recentRange`'s, oldest first, ending on the day `end`) from the UTC day an
 * order was first placed (`placed`, its first version's time) to the window's end, that day included: `days` of them,
 * `traded` with trading, and their figures `xs`. Null when the order was placed before the window's first day (the window is
 * then all since it was placed, and the usual count says so), after its last, when the time can't be read, or when fewer
 * than LEFT_MIN_DAYS of those days traded: too few to say the market has left it, and nobody trading isn't the market leaving.
 * The day it was placed counts whole, so trading that morning, before the order existed, counts as reaching it: that errs
 * towards saying nothing.
 */
export function sincePlaced(xs: (number | null)[] | null | undefined, end: string | null | undefined, placed: string | null | undefined): { days: number; traded: number; xs: (number | null)[] } | null {
  if (!xs?.length || !end || !placed) return null;
  const e = Date.parse(end + 'T00:00:00Z');
  const p = Date.parse(placed);
  if (!Number.isFinite(e) || !Number.isFinite(p)) return null;
  const days = Math.round((e - Date.parse(dayKey(p) + 'T00:00:00Z')) / DAY) + 1;
  if (days < 1 || days > xs.length) return null;
  const tail = xs.slice(-days);
  const traded = tail.filter((x) => x != null).length;
  return traded >= LEFT_MIN_DAYS ? { days, traded, xs: tail } : null;
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
  const version = o.seen ? [...o.seen].reverse().find((v) => v.price === o.price) : undefined;
  if (version && (liveRemain ?? o.volumeRemain) < version.remain) return true;
  const since = now - OWN_FILL_DAYS * DAY;
  // Yours on the same side at this price or better: a buy at or below it, a sale at or above it.
  return txs.some((t) => t.source === 'esi' && t.isBuy === o.isBuy && t.typeId === o.typeId
    && (t.locationId == null || t.locationId === o.locationId)
    && (o.isBuy ? t.unitPrice <= o.price * (1 + 1e-9) : t.unitPrice >= o.price * (1 - 1e-9)) && Date.parse(t.date) >= since);
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

/**
 * The last few days of the fourteen, which a price has to be reached on too. A fortnight can hold two price levels:
 * the user's first plan (30 September 2026) bid 270.7 M for a Caldari Navy Missile Guidance Computer whose lows had
 * reached that on 5 of the 14 days, all in mid-September when it traded at 260-310 M; since the 25th it had traded at
 * 359-375 M, and its bid sat unfilled. Praxis's 206.3 M bid was reached on 4 of the 14 and none of the last 5: it
 * filled only after three raises to 208.4 M, and the trade lost 1.02 M.
 */
export const RECENT_DAYS = 5;
/** Reached on fewer of the last RECENT_DAYS than this, a price isn't where the item trades lately. */
export const RECENT_MIN = 2;
/** The price reached on this many of the last RECENT_DAYS (the 3rd-lowest low, the 3rd-highest high) is where recent trading reaches. */
export const RECENT_TYPICAL = 3;

/** The last RECENT_DAYS of a fortnight's lows or highs (newest last), or null when fewer than RECENT_TYPICAL of them traded: too few to say. */
function recentOf(xs: (number | null)[]): (number | null)[] | null {
  const recent = xs.slice(-RECENT_DAYS);
  return recent.filter((x) => x != null).length >= RECENT_TYPICAL ? recent : null;
}

/** On how many of the last RECENT_DAYS the bulk of trading got down to a bid; null when too few of them traded to say. */
export function recentBidReach(lows: (number | null)[], price: number): number | null {
  const r = recentOf(lows);
  return r ? bidReachDays(r, price) : null;
}

/** On how many of the last RECENT_DAYS the bulk of trading got up to an ask; null when too few of them traded to say. */
export function recentAskReach(highs: (number | null)[], price: number): number | null {
  const r = recentOf(highs);
  return r ? askReachDays(r, price) : null;
}

/** The lowest bid recent trading reached on RECENT_TYPICAL of the last RECENT_DAYS. */
export function recentBid(lows: (number | null)[]): number | null {
  const r = recentOf(lows);
  return r ? reachedBid(r, RECENT_TYPICAL) : null;
}

/** The highest ask recent trading got up to on RECENT_TYPICAL of the last RECENT_DAYS. */
export function recentAsk(highs: (number | null)[]): number | null {
  const r = recentOf(highs);
  return r ? reachedAsk(r, RECENT_TYPICAL) : null;
}

const higherOf = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.max(a, b));
const lowerOf = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b));

/**
 * A bid trading reaches on both windows: the higher of where it reached on half the fortnight (`reachedBid`) and on
 * RECENT_TYPICAL of the last RECENT_DAYS (`recentBid`), whichever can be said.
 */
export const bidBothWindows = (lows: (number | null)[]): number | null => higherOf(reachedBid(lows), recentBid(lows));
/** An ask trading reaches on both windows: the lower of the two. */
export const askBothWindows = (highs: (number | null)[]): number | null => lowerOf(reachedAsk(highs), recentAsk(highs));

/**
 * Where a new listing sells, the way Orders judges every sell since 28 September 2026: one step under the cheapest
 * listing when the bulk of trading got up there on at least FILL_RARE of the last 14 days; otherwise where it got up
 * to on half of them (`reachedAsk`), never under one step over the best bid, since a listing there would only sell into
 * it. With no history, or too few days of it to say, one step under the cheapest listing, as before. The Compact
 * Layered Energized Membrane is the case: listings from 720,000 to 5,000,000 on a sell side emptied two days before,
 * while the units bought from listings went at 100,100, one step over a 100,000 bid; valuing it at 719,900 overstated
 * it seven times.
 */
export function listingPrice(bestSell: number | null, bestBuy: number | null, highs: (number | null)[] | null | undefined): number | null {
  if (bestSell == null || !(bestSell > 0)) return null;
  const front = tickDown(bestSell);
  if (!highs || !Number.isFinite(front)) return front;
  if (askReachDays(highs, front) >= FILL_RARE) return front;
  const at = reachedAsk(highs);
  if (at == null) return front;
  const floor = bestBuy != null && bestBuy > 0 ? tickUp(bestBuy) : 0;
  return Math.min(front, Math.max(at, floor));
}
