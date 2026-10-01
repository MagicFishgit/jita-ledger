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
import { altCopyFor, applyAltPull, type AltSaved, type RosterEntry } from './roster';
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
  /**
   * The roster was read from the cloud in this session. False while it's only what was on disk, and after a wipe:
   * anything that acts on it (logging a login out) waits for this.
   */
  rosterLive: boolean;
  alts: Record<number, AltSaved>;
  /** The roster's own read failed (the cloud out of reach, or it refused). */
  error: string | null;
  /** The last alt whose pull failed in the last round, with what went wrong; the others were read. */
  failedAlt: { charId: number; name: string | null; message: string } | null;
  /** The Worker answered "not found": it is a version behind and doesn't know alts yet. */
  behind: boolean;
  busy: boolean;
};

let state: AltsState = { ready: false, roster: [], rosterAt: null, rosterLive: false, alts: {}, error: null, failedAlt: null, behind: false, busy: false };
const listeners = new Set<() => void>();
const setState = (p: Partial<AltsState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
// One subscribe function for good: an inline one is new each render, and React would resubscribe every time.
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useAlts = (): AltsState => useSyncExternalStore(subscribe, () => state);
/**
 * The roster alone, for the app shell: it changes only when a read brings a different one (a new read equal to the
 * last keeps the same array), so the shell and every page under it aren't drawn again at each step of a read.
 */
export const useAltRoster = (): RosterEntry[] => useSyncExternalStore(subscribe, () => state.roster);
/** Whether the roster was read from the cloud in this session (`rosterLive`). */
export const useRosterLive = (): boolean => useSyncExternalStore(subscribe, () => state.rosterLive);
/** When the roster was last read (`rosterAt`): it moves with every read, about once a minute. */
export const useRosterAt = (): number | null => useSyncExternalStore(subscribe, () => state.rosterAt);
/**
 * Each alt's copy, by character: the same object until a pull brings something or an alt leaves the roster, so a page
 * that draws from the copies (the Wallet's All characters line) isn't drawn again at each step of a read that changed
 * nothing. The Characters page and the Mining tab show the read's progress too, and take `useAlts()`.
 */
export const useAltCopies = (): Record<number, AltSaved> => useSyncExternalStore(subscribe, () => state.alts);

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
/** A call that came while a read was running: what it wants to see may have changed after that read started. */
let again = false;
/**
 * Read the roster, and pull each alt whose revision has moved. One at a time: a call that arrives during a read
 * joins it, and asks for one more read after it, so a change made since that read began (an alt just added) shows
 * now rather than on the next tick. The promise settles after that last read.
 */
export function refreshAlts(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    do { again = false; await read(); } while (again);
  })().finally(() => { running = null; again = false; });
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
    let dropped = false;
    for (const id of Object.keys(alts).map(Number)) {
      if (roster.some((r) => r.charId === id)) continue;
      delete alts[id];
      dropped = true;
      await del(altKey(id), db).catch(() => undefined);
    }
    if (dataGeneration() !== gen) return;
    const at = Date.now();
    await set(ROSTER, { at, list: roster }, db).catch(() => undefined);
    if (dataGeneration() !== gen) return;
    // The roster and what is held show at once: one alt whose pull keeps failing leaves the others current. A roster
    // equal to the one shown keeps its array, so what draws from the roster alone isn't drawn again for nothing; the
    // copies likewise keep their object unless an alt left (a pull below replaces it only when it brought something).
    const same = JSON.stringify(roster) === JSON.stringify(state.roster);
    setState({ roster: same ? state.roster : roster, rosterAt: at, rosterLive: true, alts: dropped ? { ...alts } : state.alts, error: null, behind: false });
    // One alt's failing pull doesn't stop the others; the round keeps the last failure, and which alt it was.
    let failed: AltsState['failedAlt'] = null;
    for (const r of roster) {
      try {
        const held = alts[r.charId];
        // Decided before anything is skipped: a copy from before a delete and re-add is started again even when the
        // revision happens to match.
        let saved = altCopyFor(held, r);
        if (saved.rev !== r.rev) {
          let after: string | null = null;
          let first: number | null = null;
          for (;;) {
            const page = await cloudAltPull(r.charId, saved.rev, after);
            first ??= page.rev;
            saved = applyAltPull(saved, page);
            if (!page.next) break;
            after = page.next;
          }
          // The documents come with the first page only, and each page re-reads the newest revision: keep the first
          // page's, so a document written while the later pages were read is sent next time (records applied twice
          // change nothing).
          saved = { ...saved, rev: first ?? saved.rev };
        }
        // Nothing pulled, reset or learned (the copy is the one held): nothing to save.
        if (saved === held) continue;
        if (dataGeneration() !== gen) return;
        alts[r.charId] = saved;
        await set(altKey(r.charId), saved, db).catch(() => undefined);
        if (dataGeneration() !== gen) return;
        setState({ alts: { ...alts } });
      } catch (e) {
        failed = { charId: r.charId, name: r.name, message: e instanceof Error ? e.message : String(e) };
      }
    }
    // Everything was wiped while the last pull was in flight (its failure caught above): nothing goes back.
    if (dataGeneration() !== gen) return;
    // Who is yours, and nothing else, reaches the ledger. It is applied as from the cloud and never pushed (mergeChars).
    mergeChars(roster.map((r) => ({ charId: r.charId, name: r.name })));
    setState({ failedAlt: failed });
  } catch (e) {
    setState({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    setState({ busy: false });
  }
}

onClearAll(async () => {
  await clear(db).catch(() => undefined);
  setState({ roster: [], rosterAt: null, rosterLive: false, alts: {}, error: null, failedAlt: null, behind: false });
});

/** Loads what's stored, reads the cloud, and keeps reading while the tab is in view. Returns the stop function. */
export function startAlts(): () => void {
  (loaded ??= load()).then(() => refreshAlts()).catch(() => undefined);
  const tick = setInterval(() => { if (document.visibilityState === 'visible') refreshAlts().catch(() => undefined); }, EVERY_MS);
  const onVisible = () => { if (document.visibilityState === 'visible') refreshAlts().catch(() => undefined); };
  document.addEventListener('visibilitychange', onVisible);
  return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
}
