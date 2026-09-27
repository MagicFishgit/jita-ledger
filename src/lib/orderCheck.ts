import { useSyncExternalStore } from 'react';
import { jitaOrders, marketHistory, recentAverages, tradedAtJita, type OrderLite } from './market';
import { computePosition } from './positions';
import { rates } from './fees';
import { adviseRelist, byUrgency, type Relist } from './relist';
import { buyerShare, sideVolume } from './split';
import { fillingNow, recentRange } from './fills';
import { getData, type Data } from './store';
import type { Order } from './types';

/**
 * Your open orders checked against the live Jita book, shared.
 *
 * The Orders page, Tonight's run and the background alerts all ask the same question of the same
 * books. Fetching them three times would triple the traffic for one answer, so the result lives here
 * and every page reads it.
 */

export type CheckState = {
  books: Record<number, OrderLite[]> | null;
  /** Units the whole market trades a day, 7-day average. */
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
};

let state: CheckState = { books: null, daily: {}, buyers: {}, lows: {}, checkedAt: null, bookFreshAt: null, changed: null, busy: null, failed: 0 };
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
        if (r.expires != null) soonest = Math.min(soonest, r.expires);
      } catch { failed++; }
      // How fast the item moves, and which side of it fills you, decides whether a queue is worth waiting out.
      try {
        const h = await marketHistory(id);
        vol[id] = recentAverages(h, 7).avgVol;
        buyers[id] = buyerShare(h.slice(-30));
        lows[id] = recentRange(h).lows;
      } catch { vol[id] = null; }
      setState({ busy: { done: ++done, total: typeIds.length } });
    }
  }));
  setState({
    books: out, daily: vol, buyers, lows,
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
      const daily = check.daily[o.typeId];
      const buyers = check.buyers[o.typeId] ?? 0.5;
      return adviseRelist(o, {
        book,
        dailyVolume: daily != null ? sideVolume(daily, buyers, o.isBuy) : null,
        avgCost: cost[o.typeId],
        bestSell: sells.length ? Math.min(...sells) : null,
        lows: check.lows?.[o.typeId] ?? null,
        targetReturn: d.settings.target / 100,
        filling: fillingNow(o, book.find((x) => x.id === o.orderId)?.volume, txs),
      }, r, d.settings.waitHours, d.settings.target / 100);
    })
    .sort(byUrgency);
}
