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

let loaded: Promise<void> | null = null;
let running: Promise<void> | null = null;
/** Read the roster, and pull each alt whose revision has moved. One at a time: a second call joins the first. */
export function refreshAlts(): Promise<void> {
  running ??= read().finally(() => { running = null; });
  return running;
}

async function read(): Promise<void> {
  if (!cloudEnabled()) return;
  // Without the stored copy every alt would look new and be pulled from revision 0.
  await (loaded ??= load());
  const gen = dataGeneration();
  setState({ busy: true });
  try {
    let roster: RosterEntry[];
    try {
      roster = await cloudAlts();
    } catch (e) {
      // Only the roster's own 404 says the Worker is a version behind; an alt's pull can 404 when it was just removed.
      if ((e as { status?: number }).status === 404) setState({ behind: true });
      throw e;
    }
    // Everything was wiped while this was in flight: putting the roster back would undo it.
    if (dataGeneration() !== gen) return;
    const alts = { ...state.alts };
    for (const id of Object.keys(alts).map(Number)) {
      if (roster.some((r) => r.charId === id)) continue;
      delete alts[id];
      await del(altKey(id), db).catch(() => undefined);
    }
    if (dataGeneration() !== gen) return;
    const at = Date.now();
    await set(ROSTER, { at, list: roster }, db).catch(() => undefined);
    if (dataGeneration() !== gen) return;
    // The roster and what is held show at once: one alt whose pull keeps failing leaves the others current.
    setState({ roster, rosterAt: at, alts: { ...alts }, behind: false });
    // One alt's failing pull doesn't stop the others; the round's error is the last failure's.
    let failed: string | null = null;
    for (const r of roster) {
      try {
        let saved = alts[r.charId] ?? emptyAlt();
        if (saved.rev === r.rev) continue;
        // A revision below the one held can't be pulled from: start that alt's copy again.
        if (r.rev < saved.rev) saved = emptyAlt();
        let after: string | null = null;
        let first: number | null = null;
        for (;;) {
          const page = await cloudAltPull(r.charId, saved.rev, after);
          first ??= page.rev;
          saved = applyAltPull(saved, page);
          if (!page.next) break;
          after = page.next;
        }
        // The documents come with the first page only, and each page re-reads the newest revision: keep the first page's,
        // so a document written while the later pages were read is sent next time (records applied twice change nothing).
        saved = { ...saved, rev: first ?? saved.rev };
        if (dataGeneration() !== gen) return;
        alts[r.charId] = saved;
        await set(altKey(r.charId), saved, db).catch(() => undefined);
        if (dataGeneration() !== gen) return;
        setState({ alts: { ...alts } });
      } catch (e) {
        failed = e instanceof Error ? e.message : String(e);
      }
    }
    // Who is yours, and nothing else, reaches the ledger. It is applied as from the cloud and never pushed (mergeChars).
    mergeChars(roster.map((r) => ({ charId: r.charId, name: r.name })));
    setState({ error: failed });
  } catch (e) {
    setState({ error: e instanceof Error ? e.message : String(e) });
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
  (loaded ??= load()).then(() => refreshAlts()).catch(() => undefined);
  const tick = setInterval(() => { if (document.visibilityState === 'visible') refreshAlts().catch(() => undefined); }, EVERY_MS);
  const onVisible = () => { if (document.visibilityState === 'visible') refreshAlts().catch(() => undefined); };
  document.addEventListener('visibilitychange', onVisible);
  return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
}
