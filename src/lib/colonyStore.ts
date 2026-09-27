import { useSyncExternalStore } from 'react';
import { getAuth, hasScope } from './auth';
import { byAttention, readColony, typesIn, type Colony } from './colony';
import { rates } from './fees';
import { colonyLayout, jitaBook, myPlanets, resolveNames } from './market';
import { marketBest } from './relist';
import { getData, update } from './store';
import { system } from './universe';
import { SCOPE } from './config';

/**
 * Your colonies, read once and shared.
 *
 * The Planets page reads them when asked; the To do list and the background alerts need the same
 * answer, mainly to know when an extraction programme stops. Reading them three times would be three
 * times the requests for one answer.
 */
export const PLANETS_SCOPE = SCOPE.planets;

export type ColonyRead = {
  at: string;
  colonies: Colony[];
  systems: Record<number, { name: string; security: number }>;
  /** What each product nets you sold at Jita. */
  prices: Record<number, number>;
};

type State = { read: ColonyRead | null; busy: string | null; error: string | null };
let state: State = { read: null, busy: null, error: null };
const listeners = new Set<() => void>();
const setState = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export function useColonies(): State {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}
export const getColonies = () => state;

/** Read every colony. With `maxAgeMs`, an answer younger than that is kept instead. */
export async function readColonies(maxAgeMs = 0): Promise<ColonyRead | null> {
  const auth = getAuth();
  if (!auth || !hasScope(PLANETS_SCOPE) || state.busy) return state.read;
  if (state.read && Date.now() - Date.parse(state.read.at) < maxAgeMs) return state.read;
  setState({ busy: 'Reading your colonies…', error: null });
  try {
    const d = getData();
    const r = rates(d.settings);
    const heads = await myPlanets(auth.characterId);
    const built: Colony[] = [];
    for (const h of heads) {
      setState({ busy: `Reading colony ${built.length + 1} of ${heads.length}…` });
      const raw = await colonyLayout(auth.characterId, h.planetId);
      built.push(readColony(h, raw, Date.now()));
    }
    built.sort(byAttention);

    const systems: ColonyRead['systems'] = {};
    await Promise.all([...new Set(heads.map((h) => h.solarSystemId))].map(async (id) => {
      try { const s = await system(id); systems[id] = { name: s.name, security: s.security }; } catch { /* named later */ }
    }));

    // One pass over every type the colonies touch: what it nets you sold at Jita.
    const ids = typesIn(built);
    const prices: Record<number, number> = {};
    await Promise.all(ids.map(async (id) => {
      try {
        const book = await jitaBook(id);
        const sell = marketBest(book.topSells, false);
        const buy = marketBest(book.topBuys, true);
        if (sell != null) prices[id] = sell * (1 - r.f - r.t);
        else if (buy != null) prices[id] = buy * (1 - r.t);
      } catch { /* left unpriced */ }
    }));

    const missing = ids.filter((id) => !d.names[id]);
    if (missing.length) {
      const n = await resolveNames(missing).catch(() => ({}));
      if (Object.keys(n).length) update((x) => ({ names: { ...x.names, ...n } }));
    }
    const read = { at: new Date().toISOString(), colonies: built, systems, prices };
    setState({ read, busy: null });
    return read;
  } catch (e) {
    setState({ busy: null, error: e instanceof Error ? e.message : String(e) });
    return state.read;
  }
}
