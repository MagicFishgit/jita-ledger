import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import { getAccessToken, getAuth, onAuthChange } from './auth';
import { CLOUD_URL } from './config';
import {
  applyPulled, asMap, diffRecords, docValue, everything, isDocKey, isRecordKey, sharedDoc, type DocKey, type Pulled, type RecordKey,
} from './cloudSync';
import { dataStore, getData, isReady, onDataChange, update, type Data } from './store';
import { sanitizeSettings } from './fees';
import { sanitizeAlerts, sanitizePrefs } from './prefs';

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

type Saved = { charId: number; rev: number; started: boolean; dirty: { r: string[]; d: string[] } };

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
};

let status: CloudStatus = { phase: 'off', doing: null, lastPushAt: null, lastPullAt: null, pending: 0, error: null, rev: 0, started: false };
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

export function cloudEnabled(): boolean {
  try { return localStorage.getItem(OFF_KEY) !== '1'; } catch { return true; }
}

// Unsent changes: "kind|id" for records, the key for docs, each with the generation it was marked at, so a
// change made while a push is in flight isn't forgotten when that push lands.
const dirtyRecords = new Map<string, number>();
const dirtyDocs = new Map<DocKey, number>();
let gen = 0;
let state: { charId: number; rev: number; started: boolean } | null = null;
/** Revisions this browser pushed: pulling them back would only re-apply what's already here. */
const ownRevs = new Set<number>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let busy: Promise<void> | null = null;

const recKey = (k: RecordKey, id: string) => `${k}|${id}`;
const pendingCount = () => dirtyRecords.size + dirtyDocs.size;

function markRecord(k: RecordKey, id: string) { dirtyRecords.set(recKey(k, id), ++gen); }
function markDoc(k: DocKey) { dirtyDocs.set(k, ++gen); }

let saveTimer: ReturnType<typeof setTimeout> | null = null;
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
  if (!res.ok) throw new Error(body.error ?? `The cloud answered ${res.status}`);
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
    ownRevs.add(res.rev);
    // Only what hasn't changed again since it was read goes off the list.
    for (const [key, g] of part) if (dirtyRecords.get(key) === g) dirtyRecords.delete(key);
    for (const [k, g] of withDocs) if (dirtyDocs.get(k) === g) dirtyDocs.delete(k);
    save();
  }
  setStatus({ phase: 'idle', doing: null, error: null, lastPushAt: Date.now(), pending: pendingCount() });
}

type PullPage = { rev: number; next: string | null; records: (Pulled['records'][number] & { r: number })[]; docs: (Pulled['docs'][number] & { r: number })[] };

/** Everything changed since the last pull, applied here. Returns the IDs that came down, per kind. */
async function pullNow(): Promise<Map<string, Set<string>>> {
  const seen = new Map<string, Set<string>>();
  if (!state) return seen;
  let after: string | null = null;
  let pages = 0;
  for (;;) {
    const q = new URLSearchParams({ since: String(state.rev) });
    if (after) q.set('after', after);
    const page: PullPage = await call<PullPage>(`/v1/pull?${q}`);
    // Local changes not yet sent win: they'll be pushed, and that push is newer.
    const records = page.records.filter((r) => !ownRevs.has(r.r) && !dirtyRecords.has(`${r.k}|${r.i}`));
    const docs = page.docs.filter((x) => !ownRevs.has(x.r) && !dirtyDocs.has(x.key as DocKey));
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
        return p;
      }, { origin: 'cloud' });
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
  const seen = await pullNow();
  const all = everything(getData());
  for (const r of all.records) if (!seen.get(r.k)?.has(r.i)) markRecord(r.k, r.i);
  for (const k of all.docs) if (!seen.get('doc')?.has(k)) markDoc(k);
  state!.started = true;
  save();
  await pushNow();
  setStatus({ started: true, phase: 'idle', doing: null });
}

async function loadState(charId: number) {
  const saved = (await get(STATE_KEY, dataStore).catch(() => undefined)) as Saved | undefined;
  ownRevs.clear();
  if (saved && saved.charId === charId) {
    state = { charId, rev: saved.rev, started: saved.started };
    for (const key of saved.dirty.r) if (!dirtyRecords.has(key)) dirtyRecords.set(key, ++gen);
    for (const k of saved.dirty.d) if (isDocKey(k) && !dirtyDocs.has(k)) dirtyDocs.set(k, ++gen);
  } else {
    // Another character, or never synced: start from nothing and let the first sync sort it out.
    state = { charId, rev: 0, started: false };
    dirtyRecords.clear(); dirtyDocs.clear();
  }
  setStatus({ rev: state.rev, pending: pendingCount(), started: state.started });
}

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

/** What the cloud holds for this character. */
export const cloudSummary = () => call<{ rev: number; kinds: { kind: string; n: number; at: number }[]; docs: { key: string; at: number }[] }>('/v1/status');

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
    syncCloudNow();
  };
  begin();
  const offAuth = onAuthChange(() => { begin(); });
  const tick = setInterval(() => { if (document.visibilityState === 'visible' && state && cloudEnabled()) syncCloudNow(); }, PULL_EVERY);
  const onVisible = () => { if (document.visibilityState === 'visible' && state && cloudEnabled()) syncCloudNow(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    alive = false;
    offChange(); offAuth();
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisible);
    if (pushTimer) clearTimeout(pushTimer);
  };
}
