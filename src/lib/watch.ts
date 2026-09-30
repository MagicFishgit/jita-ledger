import { useSyncExternalStore } from 'react';
import { jitaBook, marketHistory } from './market';
import { statsFrom, warningsFor, withoutOwn } from './prospects';
import { JITA_44 } from './constants';
import { getData } from './store';
import type { ProspectStats, ProspectWarning } from './types';

/**
 * What the market is doing to the things you hold a position in, bid on or watch.
 *
 * The suspicious-market flags (a wall, escrow bait, a spike) and the margin line behind the squeeze
 * warning, for every item you have a stake in. Read from the same history and book as Prospects, and
 * shared by Positions, the To do list and the alerts.
 */
export const SCAM_FLAGS: ProspectWarning[] = ['wall', 'escrow', 'spike'];

export type Signal = { stats: ProspectStats | null; flags: ProspectWarning[]; at: number };
type State = { signals: Record<number, Signal>; busy: boolean };
let state: State = { signals: {}, busy: false };
const listeners = new Set<() => void>();
const setState = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export function useSignals(): State {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}
export const getSignals = () => state;

export { trackedTypes } from './signals';

/** Read history and book for each item, keeping answers younger than `maxAgeMs`. */
export async function readSignals(typeIds: number[], maxAgeMs = 30 * 60_000): Promise<Record<number, Signal>> {
  const todo = typeIds.filter((id) => !state.signals[id] || Date.now() - state.signals[id].at > maxAgeMs);
  if (!todo.length || state.busy) return state.signals;
  setState({ busy: true });
  const got: Record<number, Signal> = {};
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(4, todo.length) }, async () => {
    while (i < todo.length) {
      const id = todo[i++];
      try {
        const [hist, full] = await Promise.all([marketHistory(id), jitaBook(id)]);
        const stats = statsFrom(id, hist);
        // Judged on everyone else's orders: yours in Jita 4-4 come off the book first (withoutOwn), or your own big order
        // reads as a wall, and your own high bid as escrow bait.
        const own = Object.values(getData().orders).filter((o) => o.state === 'open' && o.typeId === id && o.locationId === JITA_44);
        const mine = (buy: boolean) => own.filter((o) => o.isBuy === buy).map((o) => ({ price: o.price, volume: o.volumeRemain }));
        const book = { ...full, topBuys: withoutOwn(full.topBuys, mine(true)), topSells: withoutOwn(full.topSells, mine(false)) };
        const bestBuy = book.topBuys[0]?.price ?? null, bestSell = book.topSells[0]?.price ?? null;
        const spread = bestBuy && bestSell ? (bestSell - bestBuy) / bestBuy : 0;
        const flags = stats ? warningsFor(stats, book, spread, 0).filter((w) => SCAM_FLAGS.includes(w)) : [];
        got[id] = { stats, flags, at: Date.now() };
      } catch { /* tried again next time */ }
    }
  }));
  setState({ signals: { ...state.signals, ...got }, busy: false });
  return state.signals;
}
