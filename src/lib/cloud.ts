import type { LeaveSummary, ShareSummary, SnipeSummary } from './track';
import type { AltPage, RosterEntry } from './roster';
import type { TrackerCell, TrackerFitDetail } from './abyssTracker';
import { useSyncExternalStore } from 'react';
import { del, get, set } from 'idb-keyval';
import { getAccessToken, getAuth, onAuthChange } from './auth';
import { CLOUD_URL } from './config';
import {
  applyPulled, asMap, diffRecords, docValue, everything, isDocKey, isRecordKey, sharedDoc, type DocKey, type Pulled, type RecordKey,
} from './cloudSync';
import { dataGeneration, dataStore, getData, isReady, onClearAll, onDataChange, update, type Data } from './store';
import { sanitizeSettings } from './fees';
import { setCloudFlow, setCloudHours } from './flowStore';
import type { HourBucket } from './rhythm';
import type { FlowLog } from './flow';
import { sanitizeAlerts, sanitizeChars, sanitizeLeave, sanitizeNotSnipes, sanitizePrefs, sanitizeSafetyTimes } from './prefs';
import { sanitizePlans } from './plans';
import { costBasis } from './orderCheck';
import { adoptCloudScan, loadCache, mergeLiveBooks, rankProspects, scanBusy, type CloudScan } from './scan';
import type { Book } from './evaluate';
import type { SnipeRead } from './snipe';
import type { BpContract } from './bpContracts';
import type { Sighting } from './sniped';
import { DEFAULT_FILTERS } from './prospects';
import type { AlertEvent, ProspectFilters } from './types';

/**
 * Keeps the ledger in the cloud (the Worker in `worker/`), so no browser holds the only copy.
 *
 * Every change made here is noted as it happens (`onDataChange`) and sent a few seconds later, record by
 * record. Every minute, and whenever the tab comes back into view, whatever other devices sent is pulled
 * and applied. The first time a character's ledger meets the cloud: if the cloud is empty, everything here
 * goes up; if this browser is the empty one (a new device, or after clearing it), everything comes down,
 * which is the restore nobody has to remember to do. Unsent changes survive a reload: they are saved
 * beside the ledger.
 */

const STATE_KEY = 'cloud';
const OFF_KEY = 'jita-ledger:cloud-off';
const PUSH_DELAY = 3000;
const PULL_EVERY = 60_000;
/** Records per push request. Well under the Worker's limits even for large killmails. */
const PUSH_CHUNK = 1500;

type Saved = { charId: number; rev: number; started: boolean; dirty: { r: string[]; d: string[] }; bg?: CloudBackground | null; wiped?: boolean };

export type CloudStatus = {
  phase: 'off' | 'waiting' | 'idle' | 'working' | 'error';
  /** What it is doing, when working: "Uploading your ledger (3,000 of 8,412)". */
  doing: string | null;
  lastPushAt: number | null;
  lastPullAt: number | null;
  /** Changes not yet sent. */
  pending: number;
  error: string | null;
  rev: number;
  /** This browser's ledger has met the cloud's at least once: everything here is up there. */
  started: boolean;
  /**
   * What the cloud has checked against what happened, null until fetched: "Clears in" on your orders over 30 days,
   * and (once its Worker has them) left orders' pace, the Sniper's listings, and your measured share.
   */
  track: {
    checked: number; within2x: number; medianRatio: number | null;
    leave?: LeaveSummary; snipes?: SnipeSummary; share?: ShareSummary | null;
  } | null;
  /**
   * What the cloud's background side holds for this ledger (its logins, never the tokens, and what each
   * job last did), as of the last look. Kept across reloads so a tab knows at once whether the cloud mails.
   */
  background: CloudBackground | null;
  /** When `background` was last read from the cloud in this tab (null while it's only what was saved on disk). */
  backgroundAt: number | null;
};

let status: CloudStatus = { phase: 'off', doing: null, lastPushAt: null, lastPullAt: null, pending: 0, error: null, rev: 0, started: false, background: null, backgroundAt: null, track: null };
const listeners = new Set<() => void>();
const setStatus = (p: Partial<CloudStatus>) => { status = { ...status, ...p }; listeners.forEach((l) => l()); };
export function useCloud(): CloudStatus {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => status);
}

export const getCloudStatus = () => status;

/**
 * The ledger is safe in the cloud: syncing is on, this browser has met the cloud, and the last attempt
 * didn't fail. Backup reminders stand down while it is.
 */
export const cloudCovers = (s: CloudStatus = status) => s.started && s.phase !== 'off' && s.phase !== 'error' && s.phase !== 'waiting';

/**
 * The cloud sends alert mail for this ledger: it holds both logins, the trading character's and one to
 * send from. The browser then mails nothing itself, or every alert would arrive twice. The Worker also
 * needs alerts and alert mail switched on, which is the same synced setting the browser reads.
 */
export const cloudSendsMail = (s: CloudStatus = status) =>
  !!s.background?.keys.some((k) => k.purpose === 'mailer') && !!s.background?.keys.some((k) => k.purpose === 'main');

export function cloudEnabled(): boolean {
  try { return localStorage.getItem(OFF_KEY) !== '1'; } catch { return true; }
}

// Unsent changes: "kind|id" for records, the key for docs, each with the generation it was marked at, so a
// change made while a push is in flight isn't forgotten when that push lands.
const dirtyRecords = new Map<string, number>();
const dirtyDocs = new Map<DocKey, number>();
let gen = 0;
/**
 * `wiped`: "Delete all data" emptied this browser and it hasn't met the cloud since. Its first sync then lets the cloud's
 * copy win over anything written here meanwhile (see the onClearAll hook below).
 */
let state: { charId: number; rev: number; started: boolean; bg?: CloudBackground | null; wiped?: boolean } | null = null;
/** Revisions this browser pushed: pulling them back would only re-apply what's already here. */
const ownRevs = new Set<number>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let busy: Promise<void> | null = null;

const recKey = (k: RecordKey, id: string) => `${k}|${id}`;
const pendingCount = () => dirtyRecords.size + dirtyDocs.size;

function markRecord(k: RecordKey, id: string) { dirtyRecords.set(recKey(k, id), ++gen); }
function markDoc(k: DocKey) { dirtyDocs.set(k, ++gen); }

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Write the list of changes not yet sent, now rather than in half a second: before a reload the app makes itself. */
export async function flushCloudState(): Promise<void> {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!state) return;
  const s: Saved = { ...state, dirty: { r: [...dirtyRecords.keys()], d: [...dirtyDocs.keys()] } };
  await set(STATE_KEY, s, dataStore);
}

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!state) return;
    const s: Saved = { ...state, dirty: { r: [...dirtyRecords.keys()], d: [...dirtyDocs.keys()] } };
    set(STATE_KEY, s, dataStore).catch(() => undefined);
  }, 500);
  setStatus({ pending: pendingCount() });
}

/** Notes what a local change touched. Changes that came down from the cloud aren't sent back. */
function noteChange(keys: string[], before: Data, after: Data, origin: 'local' | 'cloud') {
  if (origin === 'cloud') return;
  let any = false;
  const b = before as unknown as Record<string, unknown>, a = after as unknown as Record<string, unknown>;
  for (const k of keys) {
    if (isRecordKey(k)) {
      const d = diffRecords(k, b[k], a[k]);
      for (const id of d.changed) markRecord(k, id);
      for (const id of d.removed) markRecord(k, id);
      any ||= d.changed.length + d.removed.length > 0;
    } else if (isDocKey(k)) {
      // Meta changes every few minutes with this browser's own visit times; only the shared part counts.
      if (JSON.stringify(sharedDoc(k, b[k])) === JSON.stringify(sharedDoc(k, a[k]))) continue;
      markDoc(k); any = true;
    }
  }
  if (!any) return;
  save();
  schedulePush();
}

function schedulePush(delay = PUSH_DELAY) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; run(pushNow); }, delay);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = import.meta.env.VITE_CLOUD_DEV_TOKEN || await getAccessToken();
  const res = await fetch(CLOUD_URL + path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const body = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) {
    // The status rides on the error: a 404 from a route the Worker doesn't have yet means it's a version behind.
    const err = new Error(body.error ?? `The cloud answered ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body;
}

/** One thing at a time: a pull never interleaves with a push. */
function run(job: () => Promise<void>): Promise<void> {
  const next = (busy ?? Promise.resolve()).then(job).catch((e) => {
    setStatus({ phase: 'error', doing: null, error: e instanceof Error ? e.message : String(e) });
  });
  busy = next.finally(() => { if (busy === next) busy = null; });
  return next;
}

async function pushNow(): Promise<void> {
  if (!state || !pendingCount()) return;
  const wipe = dataGeneration();
  const d = getData();
  const recs = [...dirtyRecords.entries()];
  const docs = [...dirtyDocs.entries()];
  const maps = new Map<RecordKey, Map<string, unknown>>();
  const valueOf = (k: RecordKey, id: string) => {
    if (!maps.has(k)) maps.set(k, asMap(k, (d as unknown as Record<string, unknown>)[k]));
    return maps.get(k)!.get(id) ?? null;
  };
  const total = recs.length;
  for (let i = 0; i < Math.max(1, recs.length); i += PUSH_CHUNK) {
    const part = recs.slice(i, i + PUSH_CHUNK);
    const withDocs = i === 0 ? docs : [];
    if (!part.length && !withDocs.length) break;
    if (total > PUSH_CHUNK) setStatus({ phase: 'working', doing: `Uploading your ledger (${Math.min(i + PUSH_CHUNK, total).toLocaleString('en-US')} of ${total.toLocaleString('en-US')})` });
    else setStatus({ phase: 'working', doing: 'Saving changes' });
    const res = await call<{ rev: number }>('/v1/push', {
      method: 'POST',
      body: JSON.stringify({
        records: part.map(([key]) => { const [k, ...id] = key.split('|'); return { k, i: id.join('|'), d: valueOf(k as RecordKey, id.join('|')) }; }),
        docs: withDocs.map(([k]) => ({ key: k, d: docValue(d, k) })),
      }),
    });
    // "Delete all data" meanwhile: what's left to send was read from a ledger that is gone, and the list it came off is
    // this browser's old one. Stop here.
    if (dataGeneration() !== wipe) return;
    ownRevs.add(res.rev);
    // Only what hasn't changed again since it was read goes off the list.
    for (const [key, g] of part) if (dirtyRecords.get(key) === g) dirtyRecords.delete(key);
    for (const [k, g] of withDocs) if (dirtyDocs.get(k) === g) dirtyDocs.delete(k);
    save();
  }
  setStatus({ phase: 'idle', doing: null, error: null, lastPushAt: Date.now(), pending: pendingCount() });
}

type PullPage = { rev: number; next: string | null; records: (Pulled['records'][number] & { r: number })[]; docs: (Pulled['docs'][number] & { r: number })[] };

/**
 * Everything changed since the last pull, applied here. Returns the IDs that came down, per kind. `cloudWins`: what
 * came down replaces what's waiting to go up (the first sync after a wipe), instead of the other way round.
 */
async function pullNow(cloudWins = false): Promise<Map<string, Set<string>>> {
  const seen = new Map<string, Set<string>>();
  if (!state) return seen;
  const wipe = dataGeneration();
  let after: string | null = null;
  let pages = 0;
  for (;;) {
    const q = new URLSearchParams({ since: String(state.rev) });
    if (after) q.set('after', after);
    const page: PullPage = await call<PullPage>(`/v1/pull?${q}`);
    // "Delete all data" meanwhile: this pull was for the ledger that's gone, and moving the revision on would make the
    // first sync that brings the cloud's copy back start past most of it.
    if (dataGeneration() !== wipe) return seen;
    // Local changes not yet sent win: they'll be pushed, and that push is newer.
    const records = page.records.filter((r) => !ownRevs.has(r.r) && (cloudWins || !dirtyRecords.has(`${r.k}|${r.i}`)));
    const docs = page.docs.filter((x) => !ownRevs.has(x.r) && (cloudWins || !dirtyDocs.has(x.key as DocKey)));
    for (const r of page.records) { if (!seen.has(r.k)) seen.set(r.k, new Set()); seen.get(r.k)!.add(r.i); }
    for (const x of page.docs) { if (!seen.has('doc')) seen.set('doc', new Set()); seen.get('doc')!.add(x.key); }
    if (records.length || docs.length) {
      update((cur) => {
        // What comes down is cleaned like what's loaded from disk: an older device may have sent a setting
        // this version no longer takes, and a bad value must not reach the pages.
        const p = applyPulled(cur, { records, docs });
        if (p.settings) p.settings = sanitizeSettings(p.settings);
        if (p.prefs) p.prefs = sanitizePrefs(p.prefs);
        if (p.alerts) p.alerts = sanitizeAlerts(p.alerts);
        if (p.leave) p.leave = sanitizeLeave(p.leave);
        if (p.safetyTimes) p.safetyTimes = sanitizeSafetyTimes(p.safetyTimes);
        if (p.notSnipes) p.notSnipes = sanitizeNotSnipes(p.notSnipes);
        if (p.plans) p.plans = sanitizePlans(p.plans);
        if (p.chars) p.chars = sanitizeChars(p.chars);
        return p;
      }, { origin: 'cloud' });
      // Applied over what was waiting here, so that no longer goes up.
      if (cloudWins) {
        for (const r of records) dirtyRecords.delete(`${r.k}|${r.i}`);
        for (const x of docs) dirtyDocs.delete(x.key as DocKey);
      }
    }
    if (++pages > 1) setStatus({ phase: 'working', doing: `Bringing your ledger down (${(pages * 2000).toLocaleString('en-US')} records so far)` });
    if (!page.next) { state.rev = page.rev; break; }
    after = page.next;
  }
  save();
  setStatus({ lastPullAt: Date.now(), rev: state.rev });
  return seen;
}

/**
 * The first meeting of this browser's ledger with the cloud's. Whatever the cloud has comes down first;
 * then everything here the cloud didn't have goes up. On an empty cloud that is all of it: the first upload.
 */
async function firstSync(): Promise<void> {
  setStatus({ phase: 'working', doing: 'Comparing with the cloud' });
  const wipe = dataGeneration();
  const seen = await pullNow(!!state!.wiped);
  // Wiped meanwhile: the pull stopped short, so this browser hasn't met the cloud yet. The sync after the wipe starts over.
  if (dataGeneration() !== wipe) return;
  const all = everything(getData());
  for (const r of all.records) if (!seen.get(r.k)?.has(r.i)) markRecord(r.k, r.i);
  for (const k of all.docs) if (!seen.get('doc')?.has(k)) markDoc(k);
  state!.started = true;
  state!.wiped = false;
  save();
  await pushNow();
  setStatus({ started: true, phase: 'idle', doing: null });
}

async function loadState(charId: number) {
  const saved = (await get(STATE_KEY, dataStore).catch(() => undefined)) as Saved | undefined;
  ownRevs.clear();
  if (saved && saved.charId === charId) {
    state = { charId, rev: saved.rev, started: saved.started, bg: saved.bg ?? null, wiped: saved.wiped };
    for (const key of saved.dirty.r) if (!dirtyRecords.has(key)) dirtyRecords.set(key, ++gen);
    for (const k of saved.dirty.d) if (isDocKey(k) && !dirtyDocs.has(k)) dirtyDocs.set(k, ++gen);
  } else {
    // Another character, or never synced: start from nothing and let the first sync sort it out.
    state = { charId, rev: 0, started: false, bg: null };
    dirtyRecords.clear(); dirtyDocs.clear();
  }
  setStatus({ rev: state.rev, pending: pendingCount(), started: state.started, background: state.bg ?? null });
}

/**
 * "Delete all data" empties this browser; the cloud's copy stays and comes straight back down. What the sync knew about
 * this browser goes with the ledger. Its unsent changes, sent afterwards, would be read from the emptied ledger, i.e. as
 * removals of the cloud's rows; and "already met the cloud at revision N", saved again by the next pull, meant the next
 * start pulled only what was newer, so the ledger never came back (both reproduced on a local Worker, 30 September 2026:
 * a name edited just before the wipe was deleted in the cloud, and after a minute and a reload the ledger stayed empty
 * with default settings, which the next settings change would have pushed over the cloud's). So the sync forgets them
 * and meets the cloud again as a new browser: everything comes down, and nothing here overwrites it.
 */
onClearAll(async () => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  dirtyRecords.clear(); dirtyDocs.clear(); ownRevs.clear();
  setStatus({ rev: 0, pending: 0, started: false });
  if (state) {
    // Saved at once, over the key the wipe deleted, so a reload before the first sync still knows. Until then, anything
    // written here (the ESI sync refilling trades, orders without their price history, settings rebuilt from defaults)
    // loses to the cloud's copy: the browser was just emptied, so nothing in it is worth more than the cloud's.
    state = { charId: state.charId, rev: 0, started: false, bg: state.bg ?? null, wiped: true };
    await set(STATE_KEY, { ...state, dirty: { r: [], d: [] } } satisfies Saved, dataStore).catch(() => undefined);
  } else await del(STATE_KEY, dataStore).catch(() => undefined);
  // Once the wipe has finished (this runs inside it, before the ledger in memory is emptied).
  setTimeout(() => { syncCloudNow().catch(() => undefined); }, 0);
});

/** Push anything waiting and pull what's new, now. */
export function syncCloudNow(): Promise<void> {
  if (!state || !cloudEnabled()) return Promise.resolve();
  return run(async () => {
    if (!state!.started) { await firstSync(); return; }
    await pushNow();
    setStatus({ phase: 'working', doing: 'Checking for changes' });
    await pullNow();
    setStatus({ phase: 'idle', doing: null, error: null });
  });
}

export function setCloudEnabled(on: boolean) {
  try { if (on) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, '1'); } catch { /* private window */ }
  if (on) { setStatus({ phase: state ? 'idle' : 'waiting' }); syncCloudNow(); } else setStatus({ phase: 'off', doing: null });
}

/** What the cloud kept a handed-over login as. `as` is missing from a Worker a version behind: then it is `purpose`. */
export type KeptLogin = { purpose: string; as?: 'main' | 'mailer' | 'alt'; charId: number; name: string };

/**
 * Hands a login to the cloud for its background jobs. The Worker refreshes it once to prove it works and keeps it
 * encrypted; this browser keeps nothing. For an alt, EVE's page picks the character, so the answer says what it was
 * kept as: the main's login or the sender's when one of those came back, and nothing is added (Worker: keepHandedOver).
 */
export async function keepCloudLogin(k: { purpose: 'main' | 'mailer' | 'alt'; refreshToken: string }): Promise<KeptLogin> {
  const res = await call<{ kept: KeptLogin }>('/v1/keys', { method: 'POST', body: JSON.stringify({ purpose: k.purpose, refreshToken: k.refreshToken }) });
  return res.kept;
}

/** Stops a background login, at the Worker and at EVE. */
export const dropCloudLogin = (purpose: 'main' | 'mailer') => call(`/v1/keys?purpose=${purpose}`, { method: 'DELETE' });

// Alts: the owner's other characters, read by the cloud and filed under their own IDs (docs/notes/characters.md).
// These routes are new paths: a Worker a version behind answers 404 (the error's `status`).

/** The roster: each alt's login (never the token), its jobs, its revision, its ship when last read. */
export const cloudAlts = () => call<RosterEntry[]>('/v1/alts');
/** One page of an alt's cloud copy changed since a revision. */
export const cloudAltPull = (altId: number, since: number, after: string | null) =>
  call<AltPage>(`/v1/alts/${altId}/pull?since=${since}${after ? `&after=${encodeURIComponent(after)}` : ''}`);
/** Runs an alt's full read now instead of at :37: right after adding one, it proves the login end to end. */
export const cloudAltRead = (altId: number) =>
  call<{ trades: number; journal: number; orders: number; clone: string | null }>(`/v1/alts/${altId}/read`, { method: 'POST' });
/** Takes an alt off the roster; its login is revoked at EVE. `keep` leaves what was read, `delete` removes it. */
export const cloudRemoveAlt = (altId: number, data: 'keep' | 'delete') =>
  call<{ removed: number; data: string }>(`/v1/alts/${altId}?data=${data}`, { method: 'DELETE' });

/** Runs the archive now instead of waiting for the hour. */
export const runCloudArchive = () => call<{ trades: number; journal: number; orders: number; names: number; stock: boolean; netWorth: number | null }>('/v1/jobs/archive', { method: 'POST' });

export type CloudBackground = {
  /**
   * `at`: when the login last worked (handed over, or refreshed). `refusedAt`: since when EVE has refused it, and
   * `refused` what it said. `scopeNames`: its permissions. The last three are missing from a Worker a version behind.
   */
  keys: { purpose: 'main' | 'mailer'; charId: number; name: string; scopes: number; at: number; refusedAt?: number | null; refused?: string | null; scopeNames?: string[] }[];
  jobs: { job: string; lastRun: number; lastOk: number | null; lastError: string | null; detail: Record<string, unknown> | null }[];
};

/** Items the cloud watches for this ledger: open orders, open positions, the watchlist. */
function watchedTypes(d: Data): number[] {
  const s = new Set<number>();
  for (const o of Object.values(d.orders)) if (o.state === 'open') s.add(o.typeId);
  for (const p of d.positions) if (p.status === 'open') s.add(p.typeId);
  for (const w of d.watchlist) s.add(w.typeId);
  return [...s];
}

/** How many of the last scan's best candidates the cloud is asked to watch. */
const CANDIDATES = 150;
let watchAsked: number[] = [];
let watchSent: string | null = null;

/**
 * Asks the cloud to watch more than what you hold: the best candidates from your last Prospects scan, ranked
 * by your own saved filters, and the items your loyalty spend plans sell. Their buyer/seller split and pace
 * are then measured before any ISK goes in. Sent only when the list changes; the filters go with it, for the
 * cloud's opportunity mail.
 */
async function pushWatch(): Promise<void> {
  if (!state || !cloudEnabled()) return;
  const d = getData();
  let saved: Partial<ProspectFilters> = {};
  try { saved = JSON.parse(localStorage.getItem('jita-ledger:prospects') || 'null')?.f ?? {}; } catch { /* private window */ }
  const filters: ProspectFilters = { ...DEFAULT_FILTERS, ...saved, busy: false, partial: false };
  let candidates: number[] = [];
  try {
    const cache = await loadCache();
    // Your filters first; strict ones can pass only a few, so the busiest markets (Prospects' Busy view)
    // fill the rest: where the measured split matters most.
    const picked = rankProspects(cache, d.settings, filters).map((p) => p.typeId);
    const busy = picked.length < CANDIDATES ? rankProspects(cache, d.settings, { ...filters, busy: true }).map((p) => p.typeId) : [];
    candidates = [...new Set([...picked, ...busy])].slice(0, CANDIDATES);
  } catch { /* no scan yet */ }
  const lp = Object.values(d.meta.lpRate ?? {}).flatMap((r) => r.types ?? []);
  const types = [...new Set([...candidates, ...lp])];
  watchAsked = types;
  const body = JSON.stringify({ types, filters });
  if (body === watchSent) return;
  const res = await call<{ rev: number }>('/v1/push', { method: 'POST', body: JSON.stringify({ records: [], docs: [{ key: 'watch', d: { ...JSON.parse(body), at: new Date().toISOString() } }] }) });
  ownRevs.add(res.rev);
  watchSent = body;
}

/** Fetches what the cloud has watched on your items and candidates, for the buyer/seller split and "Clears in". */
async function refreshCloudFlow(): Promise<void> {
  if (!state || !cloudEnabled()) return;
  const types = [...new Set([...watchedTypes(getData()), ...watchAsked])].slice(0, 500);
  if (!types.length) return;
  setCloudFlow(await call<FlowLog>(`/v1/flow?types=${types.join(',')}`));
  // When each held item's buyers and sellers are about: only what you hold, for the Orders tips.
  const held = watchedTypes(getData()).slice(0, 500);
  if (held.length) setCloudHours(await call<Record<number, HourBucket[]>>(`/v1/hours?types=${held.join(',')}`));
}

let scanSeen: string | null = null;

/**
 * Takes the cloud's daily full-market scan as this browser's scan when there's a newer one: its time is checked
 * first (a few bytes), and the scan itself (several MB) only fetched when it's new.
 */
let scanSyncing: Promise<void> | null = null;
/** One at a time: the scan is megabytes, and the start, the hourly look and Settings may all ask at once. */
function syncCloudScan(): Promise<void> {
  scanSyncing ??= takeCloudScan().finally(() => { scanSyncing = null; });
  return scanSyncing;
}
async function takeCloudScan(): Promise<void> {
  if (!state || !cloudEnabled()) return;
  const meta = await call<{ at: string } | null>('/v1/scan/meta');
  if (!meta?.at || meta.at === scanSeen) return;
  const local = await loadCache();
  const newest = [local.runs?.quick, local.runs?.deep, local.runs?.cloud].filter((x): x is string => !!x).sort().pop();
  if (newest && newest >= meta.at) { scanSeen = meta.at; return; }
  // Megabytes: not while a scan here is running, which would only turn it down. The next look takes it.
  if (scanBusy()) return;
  const scan = await call<CloudScan | null>('/v1/scan');
  if (scan && await adoptCloudScan(scan)) scanSeen = meta.at;
}

/** The cloud's full-market scan as Settings shows it: the last run, a running one's progress, when the next is due. */
export type CloudScanStatus = {
  last: {
    at: string; startedAt: string; seconds: number; pages: number; pagesFailed: number;
    jitaTypes: number; twoSided: number; gated: number; checked: number; kept: number;
    history: { cached: number; fetched: number; failed: number; remaining: number }; partial: boolean;
  } | null;
  progress: { phase: 'pages' | 'history' | 'saving'; done: number; total: number; startedAt: string; updatedAt: string } | null;
  next: string;
  lastError: string | null;
};

/**
 * Read while something shows it: every 5 seconds while a scan runs, every minute otherwise. A scan that finished
 * since this browser last looked is taken at once rather than at the hourly look.
 */
type ScanStatusSnap = { status: CloudScanStatus | null; error: string | null };
let scanSnap: ScanStatusSnap = { status: null, error: null };
const scanListeners = new Set<() => void>();
let scanTimer: ReturnType<typeof setTimeout> | undefined;
async function lookAtScan(): Promise<void> {
  clearTimeout(scanTimer);
  if (!state || !cloudEnabled()) { if (scanSnap.status || scanSnap.error) scanSnap = { status: null, error: null }; }
  else {
    try {
      const s = await call<CloudScanStatus>('/v1/scan/status');
      scanSnap = { status: s, error: null };
      if (s.last?.at && s.last.at !== scanSeen && !s.progress) syncCloudScan().catch(() => undefined);
    } catch (e) { scanSnap = { ...scanSnap, error: e instanceof Error ? e.message : String(e) }; }
  }
  scanListeners.forEach((l) => l());
  // Before the cloud has started (the page opened straight onto Settings) there is nothing to ask yet: look again soon.
  if (scanListeners.size) scanTimer = setTimeout(() => { lookAtScan(); }, !state ? 3_000 : scanSnap.status?.progress ? 5_000 : 60_000);
}
// One subscribe function for good: an inline one is new each render, so React unsubscribes and subscribes again
// every time, and each first subscriber would start another read.
const watchScan = (cb: () => void) => {
  scanListeners.add(cb);
  if (scanListeners.size === 1) lookAtScan();
  return () => { scanListeners.delete(cb); if (!scanListeners.size) clearTimeout(scanTimer); };
};
export const useCloudScanStatus = (): ScanStatusSnap => useSyncExternalStore(watchScan, () => scanSnap);

/** Live prices for the watched candidates, from the cloud's five-minute watch, over the scan's morning ones. */
async function refreshLiveBooks(): Promise<void> {
  if (!state || !cloudEnabled() || !watchAsked.length) return;
  await mergeLiveBooks(await call<Record<number, Book>>(`/v1/books?types=${watchAsked.slice(0, 500).join(',')}`));
}

/** The sniper's latest read of the whole book: mistake listings, and high bids for what you hold (src/lib/snipe.ts). */
export const cloudSnipes = () => call<SnipeRead | null>('/v1/snipes');
/** The Forge's contracts holding these blueprints, now and vanished over three days, from EVE Ref's snapshot (on demand). */
export const cloudBlueprintMarket = (types: number[]) =>
  call<{ at: string | null; since: string | null; current: BpContract[]; vanished: BpContract[] }>('/v1/blueprints/market', { method: 'POST', body: JSON.stringify({ types }) });

/** What the Sniper saw of these items in the last month: marks your buys of them as found by it. */
export const cloudSightings = (types: number[]) => call<Sighting[]>(`/v1/snipes/seen?types=${types.slice(0, 500).join(',')}`);

/** An item's trade by hour of day (UTC), as the cloud counted it. */
export const cloudHours = (typeId: number) => call<Record<number, HourBucket[]>>(`/v1/hours?types=${typeId}`).then((r) => r[typeId] ?? []);

/** An item's best prices hour by hour, as the cloud recorded them. */
export const cloudPrices = (typeId: number, hours = 24 * 14) =>
  call<{ hour: number; bestBuy: number | null; bestSell: number | null; buyUnits: number | null; sellUnits: number | null }[]>(`/v1/prices?type=${typeId}&hours=${hours}`);

export type CloudSummary = { rev: number; kinds: { kind: string; n: number; at: number }[]; docs: { key: string; at: number }[]; background: CloudBackground };

/** What the cloud holds for this character. Its background side is kept in the status too. */
export async function cloudSummary(): Promise<CloudSummary> {
  const s = await call<CloudSummary>('/v1/status');
  if (state) { state.bg = s.background; save(); }
  setStatus({ background: s.background, backgroundAt: Date.now() });
  return s;
}

/** How "Clears in" has done on your orders, kept in the status for the Orders tip. */
async function refreshTrack(): Promise<void> {
  if (!state || !cloudEnabled()) return;
  setStatus({ track: await call<CloudStatus['track']>('/v1/track') });
}

/** The alerts the cloud has mailed in the last week, newest first: one per alert, at its latest mailing. */
export const cloudAlertLog = () => call<{ key: string; kind: AlertEvent; at: number; title: string; text: string }[]>('/v1/alerts/log');

/** What the cloud saw your mining ledger grow by between its reads (about ten minutes each), for sessions (mining.ts). */
export const cloudMiningTicks = (days = 30) => call<{ at: number; systemId: number; typeId: number; qty: number; shipTypeId?: number | null }[]>(`/v1/mining/ticks?days=${days}`);

/** Abyss Tracker's summaries of every tier and weather, as the cloud last read them (daily). Empty until its first read. */
export const cloudAbyss = () => call<TrackerCell[]>('/v1/abyss');
/** One Abyss Tracker fit: its EFT and measured performance, read by the cloud when first asked for and kept a week. */
export const cloudAbyssFit = (id: string) => call<TrackerFitDetail>(`/v1/abyss/fit?id=${encodeURIComponent(id)}`);

/** A test alert mail sent by the cloud, from one of your real orders. */
export const cloudTestMail = () => call<{ mailId: number; about: string }>('/v1/alerts/test', { method: 'POST' });

let costsSent: string | null = null;

/**
 * Your average cost per item on open positions, for the cloud's alert checks: a sell order is never told
 * to move below what you paid. The cloud doesn't work positions out itself (that needs every trade and
 * fee matched to its order), so the browser sends the answer when it changes. Only the cloud reads it.
 */
async function pushCosts(): Promise<void> {
  if (!state || !cloudEnabled()) return;
  const costs = JSON.stringify(costBasis(getData()));
  if (costs === costsSent) return;
  const res = await call<{ rev: number }>('/v1/push', { method: 'POST', body: JSON.stringify({ records: [], docs: [{ key: 'costs', d: JSON.parse(costs) }] }) });
  ownRevs.add(res.rev);
  costsSent = costs;
}

/** A few ESI calls made from Cloudflare, with ESI's limit headers. */
export const cloudEsiCheck = () => call<{ url: string; status: number; ms: number; headers: Record<string, string> }[]>('/v1/esi-check');

/**
 * Starts syncing for whoever is logged in, and follows logins and logouts. Changes are noted from the
 * moment this runs, so nothing made during start-up is missed.
 */
export function startCloud(): () => void {
  const offChange = onDataChange(noteChange);
  let alive = true;
  const begin = async () => {
    // Local testing stands in a character for the login; a real build never sets these.
    const dev = import.meta.env.VITE_CLOUD_DEV_TOKEN ? Number(import.meta.env.VITE_CLOUD_DEV_CHAR || 90000001) : null;
    const charId = dev ?? getAuth()?.characterId;
    if (!charId) { state = null; setStatus({ phase: cloudEnabled() ? 'waiting' : 'off', started: false }); return; }
    if (!isReady()) return;
    await loadState(charId);
    if (!alive) return;
    if (!cloudEnabled()) { setStatus({ phase: 'off' }); return; }
    setStatus({ phase: 'idle' });
    syncCloudNow()
      .then(() => syncCloudScan().catch(() => undefined))
      .then(() => pushWatch().catch(() => undefined))
      .then(() => Promise.all([refreshCloudFlow(), cloudSummary(), pushCosts(), refreshTrack(), refreshLiveBooks()]))
      .catch(() => undefined);
  };
  begin();
  const offAuth = onAuthChange(() => { begin(); });
  const tick = setInterval(() => { if (document.visibilityState === 'visible' && state && cloudEnabled()) syncCloudNow(); }, PULL_EVERY);
  // The cloud reads the books every five minutes; fetching its counts every ten keeps the pages close to it.
  // The same cadence for whether the cloud mails (another device may have handed it a sender) and the costs.
  // The day's scan lands once, after 11:25 EVE; an hourly look for it costs a few bytes.
  const scanTick = setInterval(() => { if (document.visibilityState === 'visible') syncCloudScan().then(() => pushWatch()).catch(() => undefined); }, 60 * 60_000);
  const flowTick = setInterval(() => {
    if (document.visibilityState !== 'visible' || !state || !cloudEnabled()) return;
    pushWatch().catch(() => undefined).then(() => refreshCloudFlow()).catch(() => undefined);
    refreshLiveBooks().catch(() => undefined);
    cloudSummary().catch(() => undefined);
    pushCosts().catch(() => undefined);
    refreshTrack().catch(() => undefined);
  }, 10 * 60_000);
  const onVisible = () => { if (document.visibilityState === 'visible' && state && cloudEnabled()) syncCloudNow(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    alive = false;
    offChange(); offAuth();
    clearInterval(tick);
    clearInterval(flowTick);
    clearInterval(scanTick);
    document.removeEventListener('visibilitychange', onVisible);
    if (pushTimer) clearTimeout(pushTimer);
  };
}
