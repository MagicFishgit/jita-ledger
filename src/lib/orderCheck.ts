import { useSyncExternalStore } from 'react';
import { jitaOrders, marketHistory, tradedAtJita, type OrderLite } from './market';
import { sidePaceOf } from './flow';
import { loadFlow, settleFlow, watchedDays, watchedFlow } from './flowStore';
import { paceDay } from './prospects';
import { computePosition } from './positions';
import { heldCost } from './heldCost';
import { instantBuys } from './sniped';
import { rates } from './fees';
import { byUrgency, judgeOrder, type Relist } from './relist';
import { buyerShare, type BookSold } from './split';
import { recentRange } from './fills';
import { isLeft, planTargets } from './plans';
import { getData, type Data } from './store';
import type { Order } from './types';

/**
 * Your open orders checked against the live Jita book, shared.
 *
 * The Orders page, the To do list and the background alerts all ask the same question of the same
 * books. Fetching them three times would triple the traffic for one answer, so the result lives here
 * and every page reads it.
 */

export type CheckState = {
  books: Record<number, OrderLite[]> | null;
  /** Units the whole market trades on a typical day: the 14-day median. */
  daily: Record<number, number | null>;
  /** Share of each item's volume that is buyers taking sells. */
  buyers: Record<number, number>;
  /** Each item's last 14 days' lows, for whether trading reaches a buy at all. */
  lows: Record<number, (number | null)[]>;
  /** And highs, for whether trading still gets up to a sell you're leaving. */
  highs?: Record<number, (number | null)[]>;
  /** The day each item's lows and highs end on (`recentRange`'s `end`): a left order is judged on the days since it was placed. */
  ends?: Record<number, string>;
  checkedAt: string | null;
  /** When ESI will next have a different book. Re-checking before then cannot show a relist. */
  bookFreshAt: number | null;
  /** Books that differed from the previous check, or null on the first. */
  changed: number | null;
  busy: { done: number; total: number } | null;
  failed: number;
  /** What the live orders in each book have already sold, per side: the first guess at who trades. */
  sold: Record<number, BookSold | undefined>;
};

let state: CheckState = { books: null, daily: {}, buyers: {}, lows: {}, checkedAt: null, bookFreshAt: null, changed: null, busy: null, failed: 0, sold: {} };
const listeners = new Set<() => void>();
const setState = (p: Partial<CheckState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export function useOrderCheck(): CheckState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}
export const getOrderCheck = () => state;

/** Open orders at Jita 4-4 --- the only book this can judge against. */
export function jitaOpen(d: Pick<Data, 'orders'>): Order[] {
  return Object.values(d.orders).filter((o) => o.state === 'open' && o.volumeRemain > 0 && tradedAtJita(o.typeId, o.locationId));
}

let running: Promise<void> | null = null;

/**
 * Check every open Jita order against the live book. A second caller while one check is running
 * waits for that check rather than returning at once: the alerts would otherwise read the books from
 * the check before, or none at all.
 */
export function checkOrders(fresh = true): Promise<void> {
  if (running) return running;
  running = runCheck(fresh)
    .catch((e) => { setState({ busy: null }); throw e; })
    .finally(() => { running = null; });
  return running;
}

async function runCheck(fresh: boolean): Promise<void> {
  const mine = jitaOpen(getData());
  const typeIds = [...new Set(mine.map((o) => o.typeId))];
  if (!typeIds.length) { setState({ books: {}, checkedAt: new Date().toISOString() }); return; }
  setState({ busy: { done: 0, total: typeIds.length }, failed: 0 });
  const before = state.books;
  const out: Record<number, OrderLite[]> = {};
  const sold: Record<number, BookSold | undefined> = {};
  const vol: Record<number, number | null> = {};
  const buyers: Record<number, number> = {};
  const lows: Record<number, (number | null)[]> = {};
  const highs: Record<number, (number | null)[]> = {};
  const ends: Record<number, string> = {};
  let failed = 0, done = 0, soonest = Infinity, moved = 0, i = 0;
  await Promise.all(Array.from({ length: Math.min(4, typeIds.length) }, async () => {
    while (i < typeIds.length) {
      const id = typeIds[i++];
      try {
        const r = await jitaOrders(id, fresh);
        if (before?.[id] && JSON.stringify(before[id]) !== JSON.stringify(r.orders)) moved++;
        out[id] = r.orders;
        sold[id] = r.sold;
        if (r.expires != null) soonest = Math.min(soonest, r.expires);
      } catch { failed++; }
      // How fast the item moves, and which side of it fills you, decides whether a queue is worth waiting out.
      try {
        const h = await marketHistory(id);
        // The typical day, not the week's average: one busy day (often your own buying) can make the
        // average several times the norm. Against what the books showed, the median was the closer.
        vol[id] = paceDay(h);
        buyers[id] = buyerShare(h.slice(-30));
        const range = recentRange(h, undefined, undefined, watchedDays(id));
        lows[id] = range.lows;
        highs[id] = range.highs;
        ends[id] = range.end;
      } catch { vol[id] = null; }
      setState({ busy: { done: ++done, total: typeIds.length } });
    }
  }));
  // Every book read above that had been read before this session added to the record of who traded
  // (flowStore). Counted before the verdicts are drawn, so they use it.
  await loadFlow();
  await settleFlow();
  setState({
    books: out, daily: vol, buyers, lows, highs, ends, sold,
    bookFreshAt: Number.isFinite(soonest) ? soonest : null,
    changed: before ? moved : null,
    checkedAt: new Date().toISOString(),
    busy: null, failed,
  });
}

/** Average cost per item from open positions, so a sell is not told to chase into a loss. */
export function costBasis(d: Data): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of d.positions) {
    if (p.status !== 'open') continue;
    const avg = computePosition(p, d, d.settings).avgCost;
    if (avg != null) out[p.typeId] = avg;
  }
  // Stock no open position covers (a snipe, a buy made without a position): what your latest buys of it cost, so the
  // guards against selling at a loss apply to it too (heldCost).
  const listed = new Map<number, number>();
  for (const o of jitaOpen(d)) if (!o.isBuy && out[o.typeId] == null) listed.set(o.typeId, (listed.get(o.typeId) ?? 0) + o.volumeRemain);
  if (!listed.size) return out;
  const personal = new Set(d.ignored);
  const txs = Object.values(d.txs).filter((t) => t.isBuy && listed.has(t.typeId) && !personal.has(t.id));
  const fromListing = new Set(instantBuys(txs, Object.values(d.journal), personal).map((t) => t.id));
  const byType = new Map<number, typeof txs>();
  for (const t of txs) byType.set(t.typeId, [...(byType.get(t.typeId) ?? []), t]);
  const f = rates(d.settings).f;
  for (const [typeId, onSale] of listed) {
    const c = heldCost(byType.get(typeId) ?? [], onSale + (d.stock?.jita[typeId] ?? 0), fromListing, f);
    if (c != null) out[typeId] = c;
  }
  return out;
}

/**
 * What each item loose in your Jita hangar cost you, for "List your stock": an open position's average cost, else your
 * latest buys (`heldCost`) over what you hold (hangar plus listed), Personal trades left out. Loot, never bought, isn't
 * in it. `bought` is how many of the units held your buys cover (all of them for a position), so a mix of bought and
 * looted units of one item can say so: it's costed at what the bought ones cost.
 */
export function hangarCosts(d: Data): Map<number, { cost: number; bought: number; held: number }> {
  const out = new Map<number, { cost: number; bought: number; held: number }>();
  const jita = d.stock?.jita ?? {};
  const types = Object.keys(jita).map(Number).filter((t) => jita[t] > 0);
  if (!types.length) return out;
  const listed = new Map<number, number>();
  for (const o of jitaOpen(d)) if (!o.isBuy) listed.set(o.typeId, (listed.get(o.typeId) ?? 0) + o.volumeRemain);
  const pos = new Map<number, number>();
  for (const p of d.positions) {
    if (p.status !== 'open' || !jita[p.typeId]) continue;
    const avg = computePosition(p, d, d.settings).avgCost;
    if (avg != null && avg > 0) pos.set(p.typeId, avg);
  }
  const want = new Set(types.filter((t) => !pos.has(t)));
  const personal = new Set(d.ignored);
  const txs = Object.values(d.txs).filter((t) => t.isBuy && want.has(t.typeId) && !personal.has(t.id));
  const fromListing = new Set(instantBuys(txs, Object.values(d.journal), personal).map((t) => t.id));
  const byType = new Map<number, typeof txs>();
  for (const t of txs) byType.set(t.typeId, [...(byType.get(t.typeId) ?? []), t]);
  const f = rates(d.settings).f;
  for (const t of types) {
    const held = jita[t] + (listed.get(t) ?? 0);
    if (pos.has(t)) { out.set(t, { cost: pos.get(t)!, bought: held, held }); continue; }
    const buys = byType.get(t) ?? [];
    const c = heldCost(buys, held, fromListing, f);
    if (c != null) out.set(t, { cost: c, bought: Math.min(held, buys.reduce((n, b) => n + b.qty, 0)), held });
  }
  return out;
}

/**
 * Verdicts for every checked order. The queue ahead is timed against your side of the volume only:
 * a sell order is reached by buyers taking listings, a buy order by sellers dumping into bids.
 */
export function verdicts(d: Data, check: CheckState, cost: Record<number, number>): Relist[] {
  if (!check.books) return [];
  const txs = Object.values(d.txs);
  const open = jitaOpen(d);
  const yours = open.map((o) => o.orderId);
  // The plan each item belongs to, while its position is open: a raise must still leave half of what it expected.
  const plans = planTargets(d.plans ?? [], d.positions, rates(d.settings));
  return open
    .filter((o) => check.books![o.typeId])
    .map((o) => judgeOrder(o, {
      book: check.books![o.typeId],
      perDay: sidePace(check, o.typeId, o.isBuy).perDay,
      avgCost: cost[o.typeId],
      lows: check.lows?.[o.typeId] ?? null,
      highs: check.highs?.[o.typeId] ?? null,
      end: check.ends?.[o.typeId] ?? null,
      // Left alone (Place and leave, or by hand): a plan's Leave alone covers that plan's own orders only.
      leave: isLeft(o, d.leave ?? [], d.leaveFrom),
      txs,
      watched: watchedFlow(o.typeId),
      yours,
      plan: plans[o.typeId] ?? null,
      // Whether a buy keeps adding stock to a long sell queue: what you hold, and how fast buyers take listings.
      ...(o.isBuy ? { hangar: d.stock ? d.stock.jita[o.typeId] ?? 0 : null, sellPace: sidePace(check, o.typeId, false) } : {}),
    }, d.settings))
    .sort(byUrgency);
}

/**
 * Units a day that reach your side of an item: buyers taking listings for a sell, sellers dumping into
 * bids for a buy. The guess from history (the typical day, split by where each day's average sat) is
 * blended with what the checks have watched the Jita book do, trusted more the longer it has watched
 * (`pace` in `lib/flow.ts`). `watchedH` says how much watching there is behind it.
 */
export function sidePace(check: CheckState, typeId: number, isBuy: boolean, now = Date.now()): ReturnType<typeof sidePaceOf> {
  return sidePaceOf({ daily: check.daily[typeId], buyers: check.buyers[typeId], sold: check.sold[typeId], watched: watchedFlow(typeId, now) }, isBuy);
}
