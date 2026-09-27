import { useEffect, useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import { addFlow, bookFills, observedFlow, pruneFlow, type Fills, type FlowDay, type FlowLog } from './flow';
import { cacheStore } from './store';
import type { OrderLite } from './market';
import type { HourBucket } from './rhythm';

/**
 * What the Jita books were seen doing, shared by every page (`lib/flow.ts` has the rules).
 *
 * Every read of a Jita book goes through `readBook` in market.ts, and whenever it reads a book it already
 * read this session, it hands both reads here. So the order checks, the Calculator's refreshes, the
 * watchlist's signals and Loyalty's pricing all add to one record of who traded, and every page that
 * needs a buyer/seller split reads it back (`tradingSplit`).
 *
 * The record is saved with the last ESI snapshot counted for each item. Tabs and pages read the same
 * books against the same snapshots, so an interval already counted is skipped rather than counted twice.
 */

type Saved = { log: FlowLog; ends: Record<number, number> };
const KEY = 'flow';

let log: FlowLog = {};
/**
 * What the cloud watched, for the items it watches (every five minutes, all day: `worker/src/market.ts`).
 * For any day it has, it replaces this browser's own count: the browser only saw some of those intervals,
 * and adding the two would count the same trades twice.
 */
let cloudLog: FlowLog = {};
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((l) => l()); };

/** The cloud's watched counts, as fetched by the cloud sync. */
export function setCloudFlow(next: FlowLog): void { cloudLog = next; emit(); }

/** The cloud's hour-of-day counts per item (`rhythm.ts`), for when its buyers and sellers are about. */
let cloudHod: Record<number, HourBucket[]> = {};
export function setCloudHours(next: Record<number, HourBucket[]>): void { cloudHod = { ...cloudHod, ...next }; emit(); }
export const watchedHours = (typeId: number): HourBucket[] => cloudHod[typeId] ?? [];

type Pending = { typeId: number; s0: number; s1: number; f: Fills; at: number };
let pending: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();

/** Two reads of one book, each with ESI's own Expires. Same snapshot, or an older one: nothing to add. */
export function recordRead(typeId: number, prev: { raw: OrderLite[]; stamp: number | null }, cur: { raw: OrderLite[]; stamp: number | null }): void {
  if (prev.stamp == null || cur.stamp == null || !(cur.stamp > prev.stamp)) return;
  pending.push({ typeId, s0: prev.stamp, s1: cur.stamp, f: bookFills(prev.raw, cur.raw), at: Date.now() });
  if (!timer) timer = setTimeout(flush, 1500);
}

/** Anything pending folded in now, for a caller that wants its own reads counted before it goes on. */
export function settleFlow(): Promise<void> {
  if (timer) { clearTimeout(timer); flush(); }
  return chain;
}

/** Folds what's pending into the saved record, read afresh since another tab may have added to it. */
function flush(): void {
  timer = null;
  const batch = pending;
  pending = [];
  chain = chain.then(async () => {
    const saved = (await get(KEY, cacheStore).catch(() => undefined)) as Saved | undefined;
    let next = saved?.log && typeof saved.log === 'object' ? saved.log : log;
    const ends = { ...(saved?.ends ?? {}) };
    for (const p of batch) {
      if (ends[p.typeId] != null && p.s0 < ends[p.typeId]) continue;
      next = addFlow(next, p.typeId, p.at, (p.s1 - p.s0) / 3600_000, p.f);
      ends[p.typeId] = p.s1;
    }
    const now = Date.now();
    next = pruneFlow(next, now);
    for (const id of Object.keys(ends).map(Number)) if (!next[id] && now - ends[id] > 3600_000) delete ends[id];
    await set(KEY, { log: next, ends } satisfies Saved, cacheStore).catch(() => undefined);
    log = next;
    loaded = true;
    emit();
  }).catch(() => undefined);
}

/** Reads the saved record once. Pages that show a split call it on mount. */
export async function loadFlow(): Promise<void> {
  if (loaded) return;
  const saved = (await get(KEY, cacheStore).catch(() => undefined)) as Saved | undefined;
  if (!loaded && saved?.log && typeof saved.log === 'object') log = saved.log;
  loaded = true;
  emit();
}

export const getFlow = (): FlowLog => log;

/** Everything watched for one item over the last FLOW_DAYS: the cloud's days where it has them, this browser's otherwise. */
export const watchedFlow = (typeId: number, now = Date.now()): FlowDay =>
  observedFlow({ [typeId]: { ...(log[typeId] ?? {}), ...(cloudLog[typeId] ?? {}) } }, typeId, now);

/** Each watched day for one item, the cloud's where it has them: for the exact fill prices (`recentRange`). */
export const watchedDays = (typeId: number): Record<string, FlowDay> => ({ ...(log[typeId] ?? {}), ...(cloudLog[typeId] ?? {}) });

/** Re-renders when anything watched changes. The value is only a version number, for effect and memo deps. */
export function useFlow(): number {
  useEffect(() => { loadFlow().catch(() => undefined); }, []);
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => version);
}
