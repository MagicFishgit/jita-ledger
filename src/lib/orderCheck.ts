import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import { jitaOrders, marketHistory, tradedAtJita, type OrderLite } from './market';
import { addFlow, bookFills, observedFlow, pace, pruneFlow, type FlowLog } from './flow';
import { typicalDailyVolume } from './prospects';
import { computePosition } from './positions';
import { rates } from './fees';
import { adviseRelist, byUrgency, type Relist } from './relist';
import { buyerShare, EVEN_SPLIT, sideVolume } from './split';
import { fillingNow, recentRange } from './fills';
import { cacheStore, getData, type Data } from './store';
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
  checkedAt: string | null;
  /** When ESI will next have a different book. Re-checking before then cannot show a relist. */
  bookFreshAt: number | null;
  /** Books that differed from the previous check, or null on the first. */
  changed: number | null;
  busy: { done: number; total: number } | null;
  failed: number;
  /** What each book was seen doing between checks (`lib/flow.ts`), kept FLOW_DAYS. */
  flow: FlowLog;
  /** ESI's own Expires of each book read: two reads with the same one are the same snapshot. */
  stamps: Record<number, number | null>;
};

let state: CheckState = { books: null, daily: {}, buyers: {}, lows: {}, checkedAt: null, bookFreshAt: null, changed: null, busy: null, failed: 0, flow: {}, stamps: {} };
const FLOW_KEY = 'flow';
/**
 * Saved with the log: the last ESI snapshot counted for each item. Every tab and the alerts check the same
 * books against the same snapshots, so an interval already counted is skipped rather than counted twice.
 */
type FlowSaved = { log: FlowLog; ends: Record<number, number> };
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
  const stampsBefore = state.stamps;
  const out: Record<number, OrderLite[]> = {};
  const stamps: Record<number, number | null> = {};
  const vol: Record<number, number | null> = {};
  const buyers: Record<number, number> = {};
  const lows: Record<number, (number | null)[]> = {};
  let failed = 0, done = 0, soonest = Infinity, moved = 0, i = 0;
  await Promise.all(Array.from({ length: Math.min(4, typeIds.length) }, async () => {
    while (i < typeIds.length) {
      const id = typeIds[i++];
      try {
        const r = await jitaOrders(id, fresh);
        if (before?.[id] && JSON.stringify(before[id]) !== JSON.stringify(r.orders)) moved++;
        out[id] = r.orders;
        stamps[id] = r.partial ? null : r.stamp;
        if (r.expires != null) soonest = Math.min(soonest, r.expires);
      } catch { failed++; }
      // How fast the item moves, and which side of it fills you, decides whether a queue is worth waiting out.
      try {
        const h = await marketHistory(id);
        // The typical day, not the week's average: one busy day (often your own buying) can make the
        // average several times the norm. Against what the books showed, the median was the closer.
        vol[id] = typicalDailyVolume(h, 14);
        buyers[id] = buyerShare(h.slice(-30));
        lows[id] = recentRange(h).lows;
      } catch { vol[id] = null; }
      setState({ busy: { done: ++done, total: typeIds.length } });
    }
  }));
  // What each book did since the last check: the sales on each side, and the undercuts. Read afresh each
  // time, since another tab may have added to it.
  const saved = (await get(FLOW_KEY, cacheStore).catch(() => undefined)) as FlowSaved | undefined;
  let flow = saved?.log && typeof saved.log === 'object' ? saved.log : state.flow;
  const ends = { ...(saved?.ends ?? {}) };
  const t = Date.now();
  for (const id of typeIds) {
    const a = before?.[id], b = out[id], s0 = stampsBefore[id], s1 = stamps[id];
    if (!a || !b || s0 == null || s1 == null || s1 <= s0) continue;
    if (ends[id] != null && s0 < ends[id]) continue;
    flow = addFlow(flow, id, t, (s1 - s0) / 3600_000, bookFills(a, b));
    ends[id] = s1;
  }
  flow = pruneFlow(flow, t);
  for (const id of Object.keys(ends)) if (!flow[Number(id)] && !typeIds.includes(Number(id))) delete ends[Number(id)];
  set(FLOW_KEY, { log: flow, ends } satisfies FlowSaved, cacheStore).catch(() => undefined);
  setState({
    books: out, daily: vol, buyers, lows, flow, stamps,
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
  return out;
}

/**
 * Verdicts for every checked order. The queue ahead is timed against your side of the volume only:
 * a sell order is reached by buyers taking listings, a buy order by sellers dumping into bids.
 */
export function verdicts(d: Data, check: CheckState, cost: Record<number, number>): Relist[] {
  if (!check.books) return [];
  const r = rates(d.settings);
  const txs = Object.values(d.txs);
  return jitaOpen(d)
    .filter((o) => check.books![o.typeId])
    .map((o) => {
      const book = check.books![o.typeId];
      const sells = book.filter((x) => !x.isBuy).map((x) => x.price);
      return adviseRelist(o, {
        book,
        dailyVolume: sidePace(check, o.typeId, o.isBuy).perDay,
        avgCost: cost[o.typeId],
        bestSell: sells.length ? Math.min(...sells) : null,
        lows: check.lows?.[o.typeId] ?? null,
        targetReturn: d.settings.target / 100,
        filling: fillingNow(o, book.find((x) => x.id === o.orderId)?.volume, txs),
      }, r, d.settings.waitHours, d.settings.target / 100);
    })
    .sort(byUrgency);
}

/**
 * Units a day that reach your side of an item: buyers taking listings for a sell, sellers dumping into
 * bids for a buy. The guess from history (the typical day, split by where each day's average sat) is
 * blended with what the checks have watched the Jita book do, trusted more the longer it has watched
 * (`pace` in `lib/flow.ts`). `watchedH` says how much watching there is behind it.
 */
export function sidePace(check: CheckState, typeId: number, isBuy: boolean, now = Date.now()): { perDay: number | null; watchedH: number; undercutsPerH: number | null } {
  const daily = check.daily[typeId];
  const prior = daily != null ? sideVolume(daily, check.buyers[typeId] ?? EVEN_SPLIT, isBuy) : null;
  const o = observedFlow(check.flow, typeId, now);
  return {
    perDay: pace(prior, isBuy ? o.buy : o.sell, o.h),
    watchedH: o.h,
    undercutsPerH: o.h > 0 ? (isBuy ? o.newBuy : o.newSell) / o.h : null,
  };
}
