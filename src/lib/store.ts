import { useSyncExternalStore } from 'react';
import { createStore, get, set, del, keys } from 'idb-keyval';
import { rates, sanitizeSettings, type Settings } from './fees';
import { mergeCharsDoc, sanitizeAlerts, sanitizeChars, sanitizeIndustry, sanitizeLeave, sanitizeLeaveFrom, sanitizeNotSnipes, sanitizePrefs, sanitizeSafetyTimes, type CharsDoc, type IndustryDoc, type LeaveFromDoc, type SafetyTimesDoc } from './prefs';
import { releaseOrphans, sanitizePlans, type TradePlan } from './plans';
import type { MiningRecord } from './mining';
import { emptyData } from './emptyData';
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
  /**
   * For items a Place-and-leave plan left, since when (the plan's start): only their orders placed since are left
   * (`isLeft` in plans.ts). An item in `leave` without a time here, left by hand, is left whole.
   */
  leaveFrom: LeaveFromDoc;
  /** Purchases you said weren't snipes, though bought from a listing well under where the item traded: trade IDs. */
  notSnipes: string[];
  /** Capital planner mixes you started: what to buy, and the positions following them (plans.ts). Newest first. */
  plans: TradePlan[];
  /** Your mining ledger, kept past ESI's 30 days: one record per character, day, system and ore (mining.ts). */
  mining: Record<string, MiningRecord>;
  /** The asset safety countdowns you typed in (from the game's Assets → Asset Safety), by wrap. */
  safetyTimes: SafetyTimesDoc;
  /**
   * Which characters are yours besides this one: alts the cloud reads (prefs.ts, CharsDoc). Who they are, never a
   * record of theirs: an alt's data lives in a database of its own (altStore.ts).
   */
  chars: CharsDoc;
  /** The Industry tab's decisions: build sites, freight routes, typed taxes and broker fees, the share, the ships switch (prefs.ts). */
  industry: IndustryDoc;
};
type Key = keyof Data;
const KEYS: Key[] = [
  'settings', 'txs', 'journal', 'orders', 'positions', 'watchlist', 'names', 'ignored', 'stock', 'skills', 'meta',
  'prefs', 'alerts', 'alertLog', 'goals', 'tags', 'nearDone', 'killmails', 'netWorth', 'unusualOk', 'leave', 'leaveFrom', 'safetyTimes', 'notSnipes', 'plans', 'mining', 'chars', 'industry',
];

const idb = createStore('jita-ledger', 'kv');
/** The ledger's own IndexedDB store, for state that lives beside the data (the cloud sync's place in it). */
export const dataStore = idb;
export const cacheStore = createStore('jita-ledger-cache', 'kv');

/** The empty ledger lives in emptyData.ts, which tests and an alt's copy can load without this store. */
const empty = emptyData;

let data: Data = empty();
let ready = false;
/**
 * Bumped whenever everything is wiped. A sync that started before the wipe checks this before it
 * writes, so it cannot quietly put back the data that was just deleted.
 */
let generation = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * The ledger on disk had no `leaveFrom` doc: written before a plan's Leave alone covered only its own orders and ended
 * with its position. `releaseOrphanLeave` lets go, once, of plan items left behind by that (see releaseOrphans).
 */
let leaveCleanupDue = false;

export async function initStore(): Promise<void> {
  const loaded = await Promise.all(KEYS.map((k) => get(k, idb)));
  leaveCleanupDue = loaded[KEYS.indexOf('leaveFrom')] === undefined;
  const next = { ...data } as Record<Key, unknown>;
  KEYS.forEach((k, i) => { if (loaded[i] !== undefined) next[k] = loaded[i]; });
  data = next as Data;
  data.settings = sanitizeSettings(data.settings);
  data.prefs = sanitizePrefs(data.prefs);
  data.alerts = sanitizeAlerts(data.alerts);
  data.safetyTimes = sanitizeSafetyTimes(data.safetyTimes);
  data.notSnipes = sanitizeNotSnipes(data.notSnipes);
  data.plans = sanitizePlans(data.plans);
  data.leaveFrom = sanitizeLeaveFrom(data.leaveFrom);
  data.chars = sanitizeChars(data.chars);
  data.industry = sanitizeIndustry(data.industry);
  if (!data.meta.rateHistory?.length) {
    // Assume today's rates applied to everything before the first recorded change.
    const r = rates(data.settings);
    data.meta = { ...data.meta, rateHistory: [{ at: '1970-01-01T00:00:00Z', f: r.f, t: r.t }], rateSeededAt: new Date().toISOString() };
    persist('meta');
  }
  ready = true;
  emit();
}

/**
 * Once per ledger from before `leaveFrom` (`leaveCleanupDue`): every item left with no time that a Place-and-leave plan
 * names, whose positions are all closed or none of whose open ones is a patient plan's, stops being left
 * (`releaseOrphans` in plans.ts). Run by the cloud sync after its first pull of the visit, so it acts on the cloud's
 * `leave` rather than a copy a device kept from before another one changed it, and pushes what it changed; or at once
 * with the cloud sync off. Done is the `leaveFrom` doc written (empty, or with what was there). It is a synced doc like
 * any other (`DOC_KEYS`); the cleanup's mark isn't pushed only because it leaves the doc's JSON unchanged, so each
 * browser runs this once, on its own first load of this version.
 */
export function releaseOrphanLeave(): void {
  if (!leaveCleanupDue || !ready) return;
  leaveCleanupDue = false;
  update((d) => releaseOrphans(d.leave, d.leaveFrom, d.plans, d.positions) ?? { leaveFrom: { ...d.leaveFrom } });
}

/**
 * The cloud's first pull of the visit brought a `leaveFrom` doc: a plan has been started since this version began writing
 * one, so that ledger is past the move and nothing is left behind to let go. The cleanup stands down. A new browser, "Delete
 * all data" and a save that never landed all start with no `leaveFrom` on disk, and without this each would run it again.
 */
export function standDownOrphanCleanup(): void { leaveCleanupDue = false; }

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

/** Write every save still waiting its 250 ms, now: a reload the app makes itself shouldn't lose the last change. */
export async function flushSaves(): Promise<void> {
  const due = (Object.keys(timers) as Key[]).filter((k) => timers[k] != null);
  for (const k of due) { clearTimeout(timers[k]); delete timers[k]; }
  await Promise.all(due.map((k) => set(k, data[k], idb)));
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

/**
 * Adds characters the cloud's roster lists to `chars`, and corrects their names. The only way the alt store
 * (altStore.ts) reaches this ledger: it hands over who is yours, and nothing else it holds. Never removes one: a
 * character taken off the roster is still yours, and what you sent it stays a transfer.
 *
 * Applied as a change from the cloud, which it is (its roster), so it is never pushed: `chars` goes up only when you
 * edit it (a clone state set by hand), carrying every character this device knows. Pushed on every roster read, a
 * device whose ledger hadn't caught up with the cloud's (a new one before its first sync, or one just wiped) would
 * have sent a list built from the roster alone over the cloud's, dropping characters taken off the roster and clone
 * states set by hand.
 */
export function mergeChars(found: { charId: number; name: string | null }[]): void {
  const next = mergeCharsDoc(data.chars, found);
  if (next) update({ chars: next }, { origin: 'cloud' });
}

/** Run when everything is wiped (clearAll): for state kept beside the ledger, like the alts' copy. */
const clearHooks = new Set<() => Promise<void> | void>();
export function onClearAll(fn: () => Promise<void> | void): () => void {
  clearHooks.add(fn);
  return () => { clearHooks.delete(fn); };
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
  // Which characters are yours is about the cloud's roster, not about this ledger's trades: a backup from before
  // there were any says nothing of them, and must not turn past transfers to them back into donations.
  if (incoming.chars === undefined) delete p.chars; else p.chars = sanitizeChars(p.chars);
  if (p.settings) p.settings = sanitizeSettings(p.settings);
  if (p.prefs) p.prefs = sanitizePrefs(p.prefs);
  if (p.alerts) p.alerts = sanitizeAlerts(p.alerts);
  if (p.leave) p.leave = sanitizeLeave(p.leave);
  if (p.leaveFrom) p.leaveFrom = sanitizeLeaveFrom(p.leaveFrom);
  if (p.safetyTimes) p.safetyTimes = sanitizeSafetyTimes(p.safetyTimes);
  if (p.notSnipes) p.notSnipes = sanitizeNotSnipes(p.notSnipes);
  if (p.plans) p.plans = sanitizePlans(p.plans);
  if (p.industry) p.industry = sanitizeIndustry(p.industry);
  update(p);
}

export async function clearAll(): Promise<void> {
  generation++;
  const ks = await keys(idb);
  await Promise.all(ks.map((k) => del(k, idb)));
  const cks = await keys(cacheStore);
  await Promise.all(cks.map((k) => del(k, cacheStore)));
  // Settled, not all: a hook that fails must not leave the stored ledger wiped and the one in memory full, where the
  // next update() would write it back.
  await Promise.allSettled([...clearHooks].map(async (h) => h()));
  data = empty();
  emit();
}
