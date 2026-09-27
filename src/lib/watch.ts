import { useSyncExternalStore } from 'react';
import { jitaBook, marketHistory } from './market';
import { statsFrom, warningsFor } from './prospects';
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
        const [hist, book] = await Promise.all([marketHistory(id), jitaBook(id)]);
        const stats = statsFrom(id, hist);
        const spread = book.bestBuy && book.bestSell ? (book.bestSell - book.bestBuy) / book.bestBuy : 0;
        const flags = stats ? warningsFor(stats, book, spread, 0).filter((w) => SCAM_FLAGS.includes(w)) : [];
        got[id] = { stats, flags, at: Date.now() };
      } catch { /* tried again next time */ }
    }
  }));
  setState({ signals: { ...state.signals, ...got }, busy: false });
  return state.signals;
}
