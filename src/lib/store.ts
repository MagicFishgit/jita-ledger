import { useSyncExternalStore } from 'react';
import { createStore, get, set, del, keys } from 'idb-keyval';
import { DEFAULT_SETTINGS, rates, sanitizeSettings, type Settings } from './fees';
import { DEFAULT_ALERTS, DEFAULT_PREFS, sanitizeAlerts, sanitizeLeave, sanitizePrefs } from './prefs';
import type {
  AlertConfig, AlertLogEntry, Goal, JournalEntry, Killmail, Meta, NetWorthPoint, Order, Position, Prefs,
  Stock, Tx, UntrackedTag, WatchItem,
} from './types';

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
  /** Transactions you marked as personal: the Personal tag on the Wallet's untracked trades. */
  ignored: string[];
  stock?: Stock;
  /** Every skill the character has trained, by skill type ID. Used well beyond the trade skills. */
  skills?: Record<number, number>;
  meta: Meta;
  prefs: Prefs;
  alerts: AlertConfig;
  alertLog: AlertLogEntry[];
  goals: Goal[];
  /** What an untracked trade counts as, when you have said. Personal lives in `ignored`. */
  tags: Record<string, Exclude<UntrackedTag, 'personal'>>;
  /** Near-miss trades you have counted or dismissed, so they are not suggested again. */
  nearDone: string[];
  killmails: Record<string, Killmail>;
  netWorth: NetWorthPoint[];
  /** Unusual journal entries you have said were yours. */
  unusualOk: string[];
  /**
   * Items whose orders you're leaving where they are (the Capital planner's "Place and leave"): they're told to
   * move only when trading stops reaching their price, never to get back in front. Type IDs.
   */
  leave: number[];
};
type Key = keyof Data;
const KEYS: Key[] = [
  'settings', 'txs', 'journal', 'orders', 'positions', 'watchlist', 'names', 'ignored', 'stock', 'skills', 'meta',
  'prefs', 'alerts', 'alertLog', 'goals', 'tags', 'nearDone', 'killmails', 'netWorth', 'unusualOk', 'leave',
];

const idb = createStore('jita-ledger', 'kv');
/** The ledger's own IndexedDB store, for state that lives beside the data (the cloud sync's place in it). */
export const dataStore = idb;
export const cacheStore = createStore('jita-ledger-cache', 'kv');

const empty = (): Data => ({
  settings: { ...DEFAULT_SETTINGS },
  txs: {}, journal: {}, orders: {}, positions: [], watchlist: [], names: {}, ignored: [], meta: {},
  prefs: { ...DEFAULT_PREFS }, alerts: { ...DEFAULT_ALERTS }, alertLog: [], goals: [], tags: {}, nearDone: [],
  killmails: {}, netWorth: [], unusualOk: [], leave: [],
});

let data: Data = empty();
let ready = false;
/**
 * Bumped whenever everything is wiped. A sync that started before the wipe checks this before it
 * writes, so it cannot quietly put back the data that was just deleted.
 */
let generation = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function initStore(): Promise<void> {
  const loaded = await Promise.all(KEYS.map((k) => get(k, idb)));
  const next = { ...data } as Record<Key, unknown>;
  KEYS.forEach((k, i) => { if (loaded[i] !== undefined) next[k] = loaded[i]; });
  data = next as Data;
  data.settings = sanitizeSettings(data.settings);
  data.prefs = sanitizePrefs(data.prefs);
  data.alerts = sanitizeAlerts(data.alerts);
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
export function dataGeneration(): number { return generation; }

/**
 * Told of every change, with the data before and after it. The cloud sync listens here to know what to
 * send; `origin` is 'cloud' when the change came down from the cloud, so it isn't sent straight back.
 */
type ChangeListener = (keys: Key[], before: Data, after: Data, origin: 'local' | 'cloud') => void;
const changeListeners = new Set<ChangeListener>();
export function onDataChange(fn: ChangeListener): () => void {
  changeListeners.add(fn);
  return () => { changeListeners.delete(fn); };
}

export function update(patch: Partial<Data> | ((d: Data) => Partial<Data>), opts: { origin?: 'local' | 'cloud' } = {}): void {
  const p = typeof patch === 'function' ? patch(data) : patch;
  const prev = data;
  data = { ...data, ...p };
  if (p.settings) data = stampRates(data);
  const keys = Object.keys(p) as Key[];
  if (data.meta !== prev.meta && !keys.includes('meta')) keys.push('meta');
  keys.forEach(persist);
  emit();
  changeListeners.forEach((l) => l(keys, prev, data, opts.origin ?? 'local'));
}

export function useData(): Data {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => data);
}

export async function exportAll(): Promise<string> {
  return JSON.stringify({ app: 'jita-ledger', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

/** Reads a backup without applying it, so the page can say what it holds before anything is replaced. */
export function parseBackup(json: string): { data: Partial<Data>; exportedAt: string | null } {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.app !== 'jita-ledger' || !parsed.data) throw new Error('This file isn’t a Jita Ledger export.');
  return { data: parsed.data as Partial<Data>, exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null };
}

export async function importAll(json: string): Promise<void> {
  const incoming = parseBackup(json).data;
  // A backup replaces what is here, as the confirmation says. Anything the file doesn't hold (an older
  // backup has no killmails, no net-worth history, no tags) goes back to empty rather than surviving
  // from this browser and mixing two ledgers. A sync already running must not write over it either.
  generation++;
  const base = empty();
  const p: Partial<Data> = {};
  for (const k of KEYS) (p as Record<string, unknown>)[k] = incoming[k] !== undefined ? incoming[k] : base[k];
  if (p.settings) p.settings = sanitizeSettings(p.settings);
  if (p.prefs) p.prefs = sanitizePrefs(p.prefs);
  if (p.alerts) p.alerts = sanitizeAlerts(p.alerts);
  if (p.leave) p.leave = sanitizeLeave(p.leave);
  update(p);
}

export async function clearAll(): Promise<void> {
  generation++;
  const ks = await keys(idb);
  await Promise.all(ks.map((k) => del(k, idb)));
  const cks = await keys(cacheStore);
  await Promise.all(cks.map((k) => del(k, cacheStore)));
  data = empty();
  emit();
}
