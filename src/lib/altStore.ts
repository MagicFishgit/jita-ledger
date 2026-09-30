/**
 * The alts' copy in this browser, read-only. An alt (a character on another of your accounts) is read by the cloud
 * and never logs in here; this keeps what the cloud holds for each, in an IndexedDB database of its own, so the
 * Characters page draws at once and with the cloud out of reach.
 *
 * Nothing here writes an alt's record to the ledger. From the ledger's store it takes three things and no more:
 * `mergeChars` (who is yours: an ID and a name), `dataGeneration` (so a wipe isn't undone by a pull in flight) and
 * `onClearAll`. It does not import `update`, and a test keeps it that way (scripts/check.mjs).
 */
import { useSyncExternalStore } from 'react';
import { clear, createStore, del, get, keys, set } from 'idb-keyval';
import { cloudAltPull, cloudAlts, cloudEnabled } from './cloud';
import { applyAltPull, emptyAlt, type AltSaved, type RosterEntry } from './roster';
import { dataGeneration, mergeChars, onClearAll } from './store';

const db = createStore('jita-ledger-alts', 'kv');
const ROSTER = 'roster';
const altKey = (id: number) => `alt:${id}`;
/** The roster is read this often while the app is open; an alt is pulled only when its revision has moved. */
const EVERY_MS = 60_000;

export type AltsState = {
  /** What was stored has been loaded. */
  ready: boolean;
  roster: RosterEntry[];
  /** When the roster was last read from the cloud (from disk after a reload: what's shown may be that old). */
  rosterAt: number | null;
  alts: Record<number, AltSaved>;
  error: string | null;
  /** The Worker answered "not found": it is a version behind and doesn't know alts yet. */
  behind: boolean;
  busy: boolean;
};

let state: AltsState = { ready: false, roster: [], rosterAt: null, alts: {}, error: null, behind: false, busy: false };
const listeners = new Set<() => void>();
const setState = (p: Partial<AltsState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
// One subscribe function for good: an inline one is new each render, and React would resubscribe every time.
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useAlts = (): AltsState => useSyncExternalStore(subscribe, () => state);

async function load(): Promise<void> {
  const saved = (await get(ROSTER, db).catch(() => undefined)) as { at: number; list: RosterEntry[] } | undefined;
  const alts: Record<number, AltSaved> = {};
  for (const k of (await keys(db).catch(() => [])) as string[]) {
    const m = /^alt:(\d+)$/.exec(String(k));
    const v = m ? ((await get(k, db).catch(() => undefined)) as AltSaved | undefined) : undefined;
    if (m && v) alts[Number(m[1])] = v;
  }
  setState({ ready: true, roster: saved?.list ?? [], rosterAt: saved?.at ?? null, alts });
}

let running: Promise<void> | null = null;
/** Read the roster, and pull each alt whose revision has moved. One at a time: a second call joins the first. */
export function refreshAlts(): Promise<void> {
  running ??= read().finally(() => { running = null; });
  return running;
}

async function read(): Promise<void> {
  if (!cloudEnabled()) return;
  const gen = dataGeneration();
  setState({ busy: true });
  try {
    const roster = await cloudAlts();
    // Everything was wiped while this was in flight: putting the roster back would undo it.
    if (dataGeneration() !== gen) return;
    const alts = { ...state.alts };
    for (const id of Object.keys(alts).map(Number)) {
      if (roster.some((r) => r.charId === id)) continue;
      delete alts[id];
      await del(altKey(id), db).catch(() => undefined);
    }
    for (const r of roster) {
      let saved = alts[r.charId] ?? emptyAlt();
      if (saved.rev === r.rev) continue;
      // A revision below the one held can't be pulled from: start that alt's copy again.
      if (r.rev < saved.rev) saved = emptyAlt();
      let after: string | null = null;
      for (;;) {
        const page = await cloudAltPull(r.charId, saved.rev, after);
        saved = applyAltPull(saved, page);
        if (!page.next) break;
        after = page.next;
      }
      if (dataGeneration() !== gen) return;
      alts[r.charId] = saved;
      await set(altKey(r.charId), saved, db).catch(() => undefined);
    }
    const at = Date.now();
    await set(ROSTER, { at, list: roster }, db).catch(() => undefined);
    setState({ roster, rosterAt: at, alts, error: null, behind: false });
    // Who is yours, and nothing else, reaches the ledger.
    mergeChars(roster.map((r) => ({ charId: r.charId, name: r.name })));
  } catch (e) {
    const status = (e as { status?: number }).status;
    setState({ error: e instanceof Error ? e.message : String(e), behind: status === 404 });
  } finally {
    setState({ busy: false });
  }
}

onClearAll(async () => {
  await clear(db).catch(() => undefined);
  setState({ roster: [], rosterAt: null, alts: {}, error: null, behind: false });
});

/** Loads what's stored, reads the cloud, and keeps reading while the tab is in view. Returns the stop function. */
export function startAlts(): () => void {
  load().then(() => refreshAlts()).catch(() => undefined);
  const tick = setInterval(() => { if (document.visibilityState === 'visible') refreshAlts().catch(() => undefined); }, EVERY_MS);
  const onVisible = () => { if (document.visibilityState === 'visible') refreshAlts().catch(() => undefined); };
  document.addEventListener('visibilitychange', onVisible);
  return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
}
