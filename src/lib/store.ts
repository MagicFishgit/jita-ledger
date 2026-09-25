import { useSyncExternalStore } from 'react';
import { createStore, get, set, del, keys } from 'idb-keyval';
import { DEFAULT_SETTINGS, rates, sanitizeSettings, type Settings } from './fees';
import type { JournalEntry, Meta, Order, Position, Stock, Tx, WatchItem } from './types';

/**
 * All app data lives in this browser's IndexedDB. Use Settings → Export to back it up,
 * because ESI only keeps about 30 days of wallet history and 90 days of order history.
 */
export type Data = {
  settings: Settings;
  txs: Record<string, Tx>;
  journal: Record<string, JournalEntry>;
  orders: Record<string, Order>;
  positions: Position[];
  watchlist: WatchItem[];
  names: Record<number, string>;
  ignored: string[];
  stock?: Stock;
  meta: Meta;
};
type Key = keyof Data;
const KEYS: Key[] = ['settings', 'txs', 'journal', 'orders', 'positions', 'watchlist', 'names', 'ignored', 'stock', 'meta'];

const idb = createStore('jita-ledger', 'kv');
export const cacheStore = createStore('jita-ledger-cache', 'kv');

let data: Data = {
  settings: { ...DEFAULT_SETTINGS },
  txs: {}, journal: {}, orders: {}, positions: [], watchlist: [], names: {}, ignored: [], meta: {},
};
let ready = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function initStore(): Promise<void> {
  const loaded = await Promise.all(KEYS.map((k) => get(k, idb)));
  const next = { ...data } as Record<Key, unknown>;
  KEYS.forEach((k, i) => { if (loaded[i] !== undefined) next[k] = loaded[i]; });
  data = next as Data;
  data.settings = sanitizeSettings(data.settings);
  if (!data.meta.rateHistory?.length) {
    // Assume today's rates applied to everything before the first recorded change.
    const r = rates(data.settings);
    data.meta = { ...data.meta, rateHistory: [{ at: '1970-01-01T00:00:00Z', f: r.f, t: r.t }], rateSeededAt: new Date().toISOString() };
    persist('meta');
  }
  ready = true;
  emit();
}

/** Records a new broker fee and sales tax whenever settings change them. Rapid edits within 2 minutes are merged. */
function stampRates(next: Data): Data {
  const r = rates(next.settings);
  const hist = next.meta.rateHistory ?? [];
  const last = hist[hist.length - 1];
  if (last && Math.abs(last.f - r.f) < 1e-9 && Math.abs(last.t - r.t) < 1e-9) return next;
  const seeded = next.meta.rateSeededAt ? Date.parse(next.meta.rateSeededAt) : 0;
  if (hist.length === 1 && Date.now() - seeded < 86400_000) {
    // Still setting up (first sync or first edits): these are the rates you've had all along.
    return { ...next, meta: { ...next.meta, rateHistory: [{ ...hist[0], f: r.f, t: r.t }] } };
  }
  const now = new Date().toISOString();
  const recent = last && hist.length > 1 && Date.now() - Date.parse(last.at) < 120_000;
  const rateHistory = [...(recent ? hist.slice(0, -1) : hist), { at: now, f: r.f, t: r.t }].slice(-300);
  return { ...next, meta: { ...next.meta, rateHistory } };
}

const timers: Partial<Record<Key, ReturnType<typeof setTimeout>>> = {};
function persist(k: Key) {
  clearTimeout(timers[k]);
  timers[k] = setTimeout(() => { set(k, data[k], idb).catch((e) => console.error('Save failed', k, e)); }, 250);
}

export function getData(): Data { return data; }
export function isReady(): boolean { return ready; }

export function update(patch: Partial<Data> | ((d: Data) => Partial<Data>)): void {
  const p = typeof patch === 'function' ? patch(data) : patch;
  const before = data.meta;
  data = { ...data, ...p };
  if (p.settings) data = stampRates(data);
  (Object.keys(p) as Key[]).forEach(persist);
  if (data.meta !== before) persist('meta');
  emit();
}

export function useData(): Data {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => data);
}

export async function exportAll(): Promise<string> {
  return JSON.stringify({ app: 'jita-ledger', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.app !== 'jita-ledger' || !parsed.data) throw new Error('This file isn’t a Jita Ledger export.');
  const incoming = parsed.data as Partial<Data>;
  const p: Partial<Data> = {};
  for (const k of KEYS) if (incoming[k] !== undefined) (p as Record<string, unknown>)[k] = incoming[k];
  if (p.settings) p.settings = sanitizeSettings(p.settings);
  update(p);
}

export async function clearAll(): Promise<void> {
  const ks = await keys(idb);
  await Promise.all(ks.map((k) => del(k, idb)));
  const cks = await keys(cacheStore);
  await Promise.all(cks.map((k) => del(k, cacheStore)));
  data = {
    settings: { ...DEFAULT_SETTINGS },
    txs: {}, journal: {}, orders: {}, positions: [], watchlist: [], names: {}, ignored: [], meta: {},
  };
  emit();
}
