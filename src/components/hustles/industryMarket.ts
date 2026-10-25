import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { cloudCopies, cloudEnabled, cloudHomeBook, cloudHomeMarkets, cloudHomePrices, cloudIndustryNpc, useCloud } from '../../lib/cloud';
import { EsiError, esi } from '../../lib/esi';
import { shareInFlight } from '../../lib/inFlight';
import type { IndustryIndex } from '../../lib/industry';
import { npcHoldMs, type NpcRow } from '../../lib/industryRank';
import type { CopySummary } from '../../lib/copyMarket';
import type { StructureRow } from '../../lib/bookFold';
import { bookHoldMs, bookWanted, listPending, HOME_HOLD_MAX_MS, homeHoldMs, homeQuote, homeSpeaks, hubsFrom, ordersInRead, ownRead, rereadDue, rereadKeeps, structureQuote, type HomeHub, type HomeRow, type HomeSpeaks, type HubOrder, type HubState } from '../../lib/homeMarket';
import { useNow } from '../../lib/hooks';
import type { HomeQuote } from '../../lib/industryRank';
import { adjustedPricesShared, industrySystemsShared, jitaBook, regionHistory, resolveNames } from '../../lib/market';
import { nameReader } from '../../lib/nameReader';
import { sanitizeIndustry, type IndustryDoc } from '../../lib/prefs';
import { loadCache, useScanState, type ScanCache } from '../../lib/scan';
import type { BookSold } from '../../lib/split';
import { getAuth, onAuthChange } from '../../lib/auth';
import { onClearAll, update, useData } from '../../lib/store';
import type { BookLevel, HistRow } from '../../lib/types';

/**
 * What the Industry tab reads besides its bundle (docs/notes/industry.md): ESI's indices (an hour, shared), NPC stations'
 * names, and the synced doc. Task 5B adds adjusted prices, the scan, the NPC row and live books; Task 6 home prices and
 * histories. Nothing read is never a zero: a read still going is `loading`, one refused `failed`, with its retry.
 */
export type Loaded<T> = { state: 'loading' } | { state: 'failed'; error: string; retry: () => void } | { state: 'ok'; value: T };

/** A shared read as a hook's state, read again on retry or when `key` changes. */
export function useShared<T>(read: () => Promise<T>, key = ''): Loaded<T> {
  const [st, setSt] = useState<Loaded<T>>({ state: 'loading' });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    setSt({ state: 'loading' });
    read().then((value) => { if (alive) setSt({ state: 'ok', value }); },
      (e) => { if (alive) setSt({ state: 'failed', error: e instanceof Error ? e.message : String(e), retry: () => setTries((n) => n + 1) }); });
    return () => { alive = false; };
  }, [tries, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

export const useIndices = (): Loaded<Record<number, IndustryIndex>> => useShared(industrySystemsShared);

/**
 * NPC stations' names (ESI's /universe/names, one request for all asked), kept for the visit. A name read is a string, one ESI
 * didn't give (it answered without the ID, or refused it) is null, and one still being read, or whose lookup failed in a way
 * that says nothing about it (offline), is absent: the caller never saves a placeholder, and a later visit asks again
 * (nameReader.ts, tested).
 */
const stations = nameReader(resolveNames, (e) => e instanceof EsiError && (e.status === 400 || e.status === 404));
export function useStationNames(ids: readonly number[]): Record<number, string | null> {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  const [ver, bump] = useState(0);
  useEffect(() => {
    const want = key ? key.split(',').map(Number) : [];
    if (!want.some((id) => !stations.known.has(id))) return;
    let alive = true;
    void stations.read(want).then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  }, [key]);
  return useMemo(() => Object.fromEntries((key ? key.split(',').map(Number) : []).filter((id) => stations.known.has(id)).map((id) => [id, stations.known.get(id) ?? null])), [key, ver]);
}

/** The synced `industry` doc, and a writer that cleans each change as disk and the cloud do. */
export function useIndustryDoc(): [IndustryDoc, (patch: Partial<IndustryDoc>) => void] {
  const doc = useData().industry;
  return [doc, (patch) => update((x) => ({ industry: sanitizeIndustry({ ...x.industry, ...patch }) }))];
}

/** CCP's adjusted prices (an hour, shared): what a job's estimated item value is worked out on. */
export const useAdjusted = (): Loaded<Record<number, number>> => useShared(adjustedPricesShared);

/** The scan this browser holds (the cloud's morning scan once adopted, or its own), read again whenever a scan lands. */
export function useScanCache(): Loaded<ScanCache> {
  const saved = useScanState().saved;
  return useShared(loadCache, String(saved));
}

/**
 * The morning scan's NPC sellers of every blueprint (`GET /v1/industry/npc`): `off` with the cloud copy off in this
 * browser, `behind` when the Worker doesn't have the route yet (404), `failed` otherwise, else the rows (both null before
 * the first scan after the Worker began keeping them).
 */
export type NpcState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string }
  | { status: 'ok'; rows: { complete: NpcRow | null; partial: NpcRow | null } };
/**
 * The cloud writes the NPC row once a morning: one read shared while in flight and kept until the next scan could have
 * replaced it or 15 minutes (npcHoldMs). Dropped when the cloud is switched off, on a different login and on "Delete all
 * data", so a fresh scan is never hidden behind an old copy.
 */
let npcHeld: { until: number; read: ReturnType<typeof cloudIndustryNpc> } | null = null;
const resetNpc = () => { npcHeld = null; };
let npcChar: number | null | undefined;
onAuthChange(() => { const id = getAuth()?.characterId ?? null; if (npcChar !== undefined && npcChar !== id) resetNpc(); npcChar = id; });
onClearAll(resetNpc);
const npcRead = () => {
  if (npcHeld && Date.now() < npcHeld.until) return npcHeld.read;
  const read = cloudIndustryNpc();
  const held = { until: Infinity, read };
  npcHeld = held;
  read.then((rows) => { held.until = Date.now() + npcHoldMs(rows?.partial?.at ?? rows?.complete?.at ?? null, Date.now()); }, () => { if (npcHeld === held) npcHeld = null; });
  return read;
};
export function useNpcRow(): NpcState {
  const cloud = useCloud();
  const [st, setSt] = useState<NpcState>(() => (cloudEnabled() ? { status: 'loading' } : { status: 'off' }));
  useEffect(() => {
    if (!cloudEnabled()) { resetNpc(); setSt({ status: 'off' }); return; }
    if (!cloud.started) return;
    let alive = true;
    npcRead().then((rows) => { if (alive) setSt({ status: 'ok', rows: { complete: rows?.complete ?? null, partial: rows?.partial ?? null } }); },
      (e) => { if (alive) setSt((e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [cloud.started]);
  return st;
}

type LiveBook = { bestBuy: number | null; bestSell: number | null; topBuys: BookLevel[]; topSells: BookLevel[]; sold?: BookSold; at: string };
/**
 * Jita books now for the types asked (jitaBook: kept until ESI has a newer one, shared in flight), four at a time in the
 * order asked: the top rows' products and materials, after a first ranking on the morning's books. One that can't be read
 * is left on the morning's book, which the row's tip says.
 */
export function useLiveBooks(types: readonly number[]): Record<number, LiveBook> {
  return useLiveRead(types).books;
}
/**
 * How long a batch of live reads may take before what has come in is taken as the answer (fix round 1 of planner fix 2): `esi()` and
 * the cloud's reads set no timeout of their own, so one read that hangs without failing would leave Plan it on "Working it out…" for
 * good. Past it the reads still out count as `late`, and still land when they come.
 */
export const LIVE_READ_BOUND_MS = 45_000;
type Settled = { key: string; late: number } | null;
/**
 * How many of the reads asked for have come back or failed, for a page's progress (planets-flow.md: "Reading Jita's books: 9 of 14…"). Kept
 * only when asked for (`counted`): every read landing draws the page again, which Industry's finder of 1,652 rows doesn't want.
 */
export type ReadCount = { done: number; of: number };
type Counted = { key: string; done: number; of: number } | null;
const countOf = (c: Counted, key: string, n: number): ReadCount => (c?.key === key ? { done: c.done, of: c.of } : { done: 0, of: n });
/**
 * `useLiveBooks`, and whether every book asked for has come back or failed (`settled`, for the types asked now), or `LIVE_READ_BOUND_MS`
 * has passed with `late` still out: Plan it works its setups out on the live books once, after they're all in, rather than batch by batch
 * (planner fix 2).
 */
export function useLiveRead(types: readonly number[], counted = false): { books: Record<number, LiveBook>; settled: boolean; late: number; count: ReadCount } {
  const key = types.join(',');
  const [got, setGot] = useState<Record<number, LiveBook>>({});
  const [doneKey, setDoneKey] = useState<Settled>(null);
  const [count, setCount] = useState<Counted>(null);
  useEffect(() => {
    let alive = true;
    const queue = key ? key.split(',').map(Number) : [];
    if (counted) setCount({ key, done: 0, of: queue.length });
    if (!queue.length) { setDoneKey({ key, late: 0 }); return () => { alive = false; }; }
    let next = 0, done = 0;
    // Each book landing re-ranked all 1,652 rows (about 25 ms) and reordered them 70 to 150 times: the books are held back and
    // set in batches (the first sixteen, so the rows move early, then every thirty-two, and the rest when the queue drains).
    let buf: Record<number, LiveBook> = {};
    const flush = () => { const b = buf; buf = {}; if (Object.keys(b).length) setGot((x) => ({ ...x, ...b })); };
    const work = async () => {
      while (alive && next < queue.length) {
        const t = queue[next++];
        const b = await jitaBook(t).catch(() => null);
        if (!alive) return;
        if (b) buf[t] = { bestBuy: b.bestBuy, bestSell: b.bestSell, topBuys: b.topBuys, topSells: b.topSells, ...(b.sold ? { sold: b.sold } : {}), at: b.fetchedAt };
        done++;
        if (counted) setCount({ key, done, of: queue.length });
        if (done === 16 || (done > 16 && (done - 16) % 32 === 0) || done === queue.length) flush();
        if (done === queue.length) setDoneKey({ key, late: 0 });
      }
    };
    for (let i = 0; i < 4; i++) void work();
    const bound = setTimeout(() => { if (alive && done < queue.length) { flush(); setDoneKey({ key, late: queue.length - done }); } }, LIVE_READ_BOUND_MS);
    return () => { alive = false; clearTimeout(bound); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { books: got, settled: doneKey?.key === key, late: doneKey?.key === key ? doneKey.late : 0, count: countOf(count, key, types.length) };
}

/** The regions the research found NPCs seeding Tech I originals in, besides The Forge (the scan's): looked in when a row opens. */
export const NPC_REGIONS: Record<number, string> = {
  10000016: 'Lonetrek', 10000043: 'Domain', 10000067: 'Genesis', 10000041: 'Syndicate', 10000057: 'Outer Ring', 10000023: 'Pure Blind', 10000011: 'Great Wildlands',
};
export type RegionSeller = { region: number; station: number; system: number; price: number };
/** NPCs' sell orders (365 days) of one original in each of NPC_REGIONS: seven public reads, shared while in flight. A region that can't be read is left out and counted; `read` names the ones that were. */
export const regionSellers = shareInFlight((bp: number) => String(bp), async (bp: number): Promise<{ sellers: RegionSeller[]; failed: number; read: number[] }> => {
  const sellers: RegionSeller[] = [];
  const read: number[] = [];
  let failed = 0;
  await Promise.all(Object.keys(NPC_REGIONS).map(Number).map(async (region) => {
    try {
      const { data } = await esi<{ location_id: number; system_id: number; price: number; duration: number; is_buy_order: boolean }[]>(`/markets/${region}/orders/`, { query: { order_type: 'sell', type_id: bp } });
      read.push(region);
      for (const o of data) if (!o.is_buy_order && o.duration >= 365) sellers.push({ region, station: o.location_id, system: o.system_id, price: o.price });
    } catch { failed++; }
  }));
  return { sellers: sellers.sort((a, b) => a.price - b.price || a.station - b.station), failed, read: read.sort((a, b) => a - b) };
});

/**
 * A home hub's prices from the cloud (Goonmetrics, six-hourly): `off` with the cloud copy off in this browser, `switched`
 * when the cloud has Goonmetrics off, `none` before its first read, `behind` for a Worker without the route (404), `failed`
 * otherwise; `ok` with when it was read and each type's row.
 */
export type HomeState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string } | { status: 'switched' } | { status: 'none' }
  | { status: 'ok'; at: string; prices: Record<string, HomeRow>; unread: ReadonlySet<number> };
/**
 * The cloud writes a hub's row every six hours: a read is shared while in flight and kept until the next refresh could have
 * replaced it or 15 minutes (homeHoldMs). Dropped when the cloud is switched off, on a different login and on "Delete all
 * data", as the NPC row is, so a fresh read is never hidden behind an old copy.
 */
const homeHeld = new Map<number, { until: number; read: ReturnType<typeof cloudHomePrices> }>();
const resetHome = () => { homeHeld.clear(); };
let homeChar: number | null | undefined;
onAuthChange(() => { const id = getAuth()?.characterId ?? null; if (homeChar !== undefined && homeChar !== id) resetHome(); homeChar = id; });
onClearAll(resetHome);
const homeRead = (hub: number) => {
  const h = homeHeld.get(hub);
  if (h && Date.now() < h.until) return h.read;
  const read = cloudHomePrices(hub);
  const held = { until: Infinity, read };
  homeHeld.set(hub, held);
  read.then((r) => { held.until = Date.now() + homeHoldMs(r && !('off' in r) ? r.at : null, Date.now()); }, () => { if (homeHeld.get(hub) === held) homeHeld.delete(hub); });
  return read;
};
/**
 * One object for "loading", so a render that finds the read held is another hub's returns the same state each time: a new one each
 * render gave Planets' prices, and the planner keyed on them, a new identity on every render once the hub was set to none, and the
 * planner worked itself out again without end (the Planets final fix round).
 */
const LOADING_HOME: HomeState = { status: 'loading' };
export function useHomePrices(hub: number | null): HomeState {
  const cloud = useCloud();
  // Kept with the hub it was read for, so a hub just picked never shows the last one's prices for a render.
  const [got, setGot] = useState<{ hub: number | null; st: HomeState }>({ hub: null, st: LOADING_HOME });
  useEffect(() => {
    if (hub == null) return;
    if (!cloudEnabled()) { resetHome(); setGot({ hub, st: { status: 'off' } }); return; }
    if (!cloud.started) { setGot({ hub, st: { status: 'loading' } }); return; }
    let alive = true;
    setGot({ hub, st: { status: 'loading' } });
    homeRead(hub).then((r) => { if (alive) setGot({ hub, st: !r ? { status: 'none' } : 'off' in r ? { status: 'switched' } : { status: 'ok', at: r.at, prices: r.prices, unread: new Set(r.unread ?? []) } }); },
      (e) => { if (alive) setGot({ hub, st: (e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e) } }); });
    return () => { alive = false; };
  }, [hub, cloud.started]);
  return got.hub === hub ? got.st : LOADING_HOME;
}

/**
 * Bumped after a change to the home markets (a reader set, a hub added or removed, a read now: Task 18C), so every hook reading them
 * asks again. Subscribed at module level (gotchas.md: an inline subscribe is a new function every render).
 */
let homeVer = 0;
const homeListeners = new Set<() => void>();
const subscribeHome = (cb: () => void) => { homeListeners.add(cb); return () => { homeListeners.delete(cb); }; };
const homeVerNow = () => homeVer;
const useHomeVer = () => useSyncExternalStore(subscribeHome, homeVerNow);

/**
 * The home markets the cloud reads (`GET /v1/home/markets`): `off` with the cloud copy off in this browser (or not asked for), `behind`
 * for a Worker without the route (404), `failed` otherwise, else the list. Held 15 minutes, shared while in flight, and read again
 * after any change made here (`refreshHomeMarkets`), on another login and on "Delete all data".
 */
export type MarketsState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string } | { status: 'ok'; list: HubState[] };
const OFF_MARKETS: MarketsState = { status: 'off' };
let marketsHeld: { until: number; read: ReturnType<typeof cloudHomeMarkets> } | null = null;
const marketsRead = () => {
  if (marketsHeld && Date.now() < marketsHeld.until) return marketsHeld.read;
  const read = cloudHomeMarkets();
  const held = { until: Infinity, read };
  marketsHeld = held;
  read.then(() => { held.until = Date.now() + HOME_HOLD_MAX_MS; }, () => { if (marketsHeld === held) marketsHeld = null; });
  return read;
};
/** A hub's own read, held until the next hourly read could land (bookHoldMs), per hub; `asked` when it was asked for. */
const bookHeld = new Map<number, { until: number; read: ReturnType<typeof cloudHomeBook>; asked: number }>();
const bookRead = (hub: number) => {
  const h = bookHeld.get(hub);
  if (h && Date.now() < h.until) return h.read;
  const read = cloudHomeBook(hub);
  const held = { until: Infinity, read, asked: Date.now() };
  bookHeld.set(hub, held);
  read.then((r) => { held.until = Date.now() + bookHoldMs(r?.at ?? null, Date.now()); }, () => { if (bookHeld.get(hub) === held) bookHeld.delete(hub); });
  return read;
};
const resetHomeMarkets = () => { marketsHeld = null; bookHeld.clear(); };
let marketsChar: number | null | undefined;
onAuthChange(() => { const id = getAuth()?.characterId ?? null; if (marketsChar !== undefined && marketsChar !== id) resetHomeMarkets(); marketsChar = id; });
onClearAll(resetHomeMarkets);
/** After a change to the home markets: everything held is let go and every hook reads again. */
export function refreshHomeMarkets(): void {
  resetHomeMarkets();
  homeVer++;
  for (const l of homeListeners) l();
}

export function useHomeMarkets(on = true): MarketsState {
  const cloud = useCloud();
  const ver = useHomeVer();
  const [st, setSt] = useState<MarketsState>({ status: 'loading' });
  useEffect(() => {
    if (!on) return;
    if (!cloudEnabled()) { resetHomeMarkets(); setSt(OFF_MARKETS); return; }
    if (!cloud.started) { setSt({ status: 'loading' }); return; }
    let alive = true;
    marketsRead().then((r) => { if (alive) setSt({ status: 'ok', list: r.hubs }); },
      (e) => { if (alive) setSt((e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [on, cloud.started, ver]);
  return on ? st : OFF_MARKETS;
}

/** Every hub the tab knows: Goonmetrics' two always, and those the cloud lists once read. `on`: ask the cloud (only when a hub not Goonmetrics' may be wanted). */
export function useHomeHubs(on = true): { hubs: HomeHub[]; markets: MarketsState } {
  const markets = useHomeMarkets(on);
  const list = markets.status === 'ok' ? markets.list : null;
  return { hubs: useMemo(() => hubsFrom(list), [list]), markets };
}

/** A hub's last good read of its own market: `none` before one, `behind` for a Worker without the route, as useHomePrices. */
export type BookState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string } | { status: 'none' } | { status: 'ok'; at: string; rows: Record<string, StructureRow> };
const LOADING_BOOK: BookState = { status: 'loading' };
const NO_BOOK: BookState = { status: 'none' };
export function useHomeBook(hub: number | null, again: string | null = null): BookState {
  const cloud = useCloud();
  const ver = useHomeVer();
  // Kept with the hub it was read for, so a hub just picked never shows the last one's read for a render.
  const [got, setGot] = useState<{ hub: number | null; st: BookState }>({ hub: null, st: LOADING_BOOK });
  // `again`: the read about to turn two hours old (`rereadDue`), asked for afresh once, past whatever is held for the hub, unless another
  // reader of the hub asked for it in the last minute (each hook would otherwise ask for the same read).
  const fresh = useRef<string | null>(null);
  useEffect(() => {
    if (hub == null) return;
    if (again && fresh.current !== again) {
      fresh.current = again;
      const h = bookHeld.get(hub);
      if (h && Date.now() - h.asked > 60_000) bookHeld.delete(hub);
    }
    if (!cloudEnabled()) { bookHeld.clear(); setGot({ hub, st: { status: 'off' } }); return; }
    if (!cloud.started) { setGot({ hub, st: LOADING_BOOK }); return; }
    let alive = true;
    setGot((g) => (g.hub === hub ? g : { hub, st: LOADING_BOOK }));
    // A re-read that fails, or finds none, leaves the read it was asked for over while that's under two hours old (`rereadKeeps`).
    const kept = (g: { hub: number | null; st: BookState }) => g.hub === hub && g.st.status === 'ok' && rereadKeeps(g.st, again, Date.now());
    bookRead(hub).then((r) => { if (alive) setGot((g) => (!r && kept(g) ? g : { hub, st: r ? { status: 'ok', at: r.at, rows: r.rows } : { status: 'none' } })); },
      (e) => { if (alive) setGot((g) => (kept(g) ? g : { hub, st: (e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e) } })); });
    return () => { alive = false; };
  }, [hub, cloud.started, ver, again]);
  return got.hub === hub ? got.st : LOADING_BOOK;
}

/**
 * What prices a hub (spec: "Which price speaks"): its own market's read while under two hours old, else Goonmetrics' (a hub it
 * tracks), else none; `quote` gives each type's price from whichever speaks, `read` whether anything does (a type missing from it then
 * has no price there, rather than being unread, unless `unread` names it: a type no Goonmetrics round has reached). `hub` is the hub's state on the cloud's list, for what its own market's read says.
 * The quotes are worked out again only when the source or its time changes, not each minute.
 */
export type HomeSource = {
  gm: HomeState | { status: 'untracked' }; book: BookState; hub: HubState | null; speaks: HomeSpeaks; quote: (type: number) => HomeQuote | null; read: boolean;
  /** The hub's own read (or the watch set that says which types it holds) is still coming: nothing speaks yet, so nothing is priced on Goonmetrics' meanwhile. */
  pending: boolean;
  /** The list of types the hub's own read holds couldn't be loaded (a failed chunk), so the read doesn't speak until the app is reloaded. */
  itemsFailed: boolean;
  /** A type outside the watch set: the structure's read holds only watched types, so it says nothing of this one (never "none listed there"). */
  unwatched: (type: number) => boolean;
  /** Types no Goonmetrics round has reached yet (only while Goonmetrics speaks): "not read yet", never "no price". */
  unread: ReadonlySet<number>;
  /** While Goonmetrics speaks: the watch set it's read for ('loading' until its chunk is in, null if that failed or Goonmetrics isn't speaking). Never holds Build's rows back. */
  gmWatch: ReadonlySet<number> | 'loading' | null;
};
const NO_TYPES: ReadonlySet<number> = new Set();
const UNTRACKED = { status: 'untracked' } as const;
/** The cloud's watch set (src/data/industryTypes.json, its own chunk), loaded once when a hub's own read first speaks. */
let watchSet: Set<number> | null = null;
let watchLoad: Promise<void> | null = null;
// Chromium keeps a failed dynamic import for the life of the page (gotchas.md), so a failure is final here: the tab offers a reload.
let watchBad = false;
const loadWatch = () => (watchLoad ??= import('../../data/industryTypes.json').then((m) => { watchSet = new Set<number>(m.default.watch); }, () => { watchBad = true; }));
export function useHomeQuotes(hub: HomeHub | null, mine: readonly HubOrder[] = NO_ORDERS): HomeSource {
  const gmRead = useHomePrices(hub?.goonmetrics ? hub.id : null);
  const markets = useHomeMarkets(!!hub);
  const listKind = markets.status === 'ok' ? 'ok' : markets.status === 'loading' ? 'loading' : 'other';
  const state = hub && markets.status === 'ok' ? markets.list.find((x) => x.id === hub.id) ?? null : null;
  // The hub's own read waits for the cloud's list (as the Home markets row does): a default switched to Nobody must not speak from its
  // last read meanwhile, or for good when the list fails. Goonmetrics' prices don't wait on the list's failing, only on its loading.
  const asked = !!hub && bookWanted(listKind, state);
  // The hub's own read is asked for again as it nears two hours old (planner fix 2, `rereadDue`): left alone, it stopped speaking with
  // the page open and Goonmetrics' prices took over mid-visit (each visit read it afresh and switched back). If the cloud has nothing
  // newer, Goonmetrics' speaks at two hours, as ever.
  const now = useNow(60_000);
  const [again, setAgain] = useState<string | null>(null);
  const bookRead = useHomeBook(asked ? hub!.id : null, again);
  const book: BookState = asked ? bookRead : NO_BOOK;
  const heldAt = book.status === 'ok' ? book.at : null;
  useEffect(() => { if (heldAt && heldAt !== again && rereadDue(heldAt, now)) setAgain(heldAt); }, [heldAt, again, now]);
  const gm: HomeSource['gm'] = hub && !hub.goonmetrics ? UNTRACKED : gmRead;
  // A default switched to Nobody keeps its last read in the cloud: it doesn't speak for the hub once you stopped reading it.
  const own = ownRead(book.status === 'ok' ? book : null, state);
  const bookPending = !!hub && (listPending(listKind) || (asked && book.status === 'loading'));
  const structureSpeaks = homeSpeaks(own, null, now)?.source === 'structure';
  const [watch, setWatch] = useState<Set<number> | null>(watchSet);
  const [watchFailed, setWatchFailed] = useState(watchBad);
  useEffect(() => {
    if (!(structureSpeaks || gm.status === 'ok') || watch || watchFailed) return;
    let alive = true;
    loadWatch().then(() => { if (!alive) return; if (watchSet) setWatch(watchSet); else setWatchFailed(true); });
    return () => { alive = false; };
  }, [structureSpeaks, gm.status, watch, watchFailed]);
  // The item list failed to load: the structure's read can't say which types it holds, so it doesn't speak (Goonmetrics' may), and the
  // hub isn't pending for good.
  const itemsFailed = structureSpeaks && !watch && watchFailed;
  const pending = bookPending || (structureSpeaks && !watch && !watchFailed);
  const speaks = pending ? null : homeSpeaks(itemsFailed ? null : own, gm.status === 'ok' ? gm : null, now);
  const key = speaks ? `${speaks.source}:${speaks.at}` : '';
  const here = useMemo(() => mine.filter((o) => o.locationId === hub?.id), [mine, hub]);
  return useMemo((): HomeSource => {
    const quote = (t: number): HomeQuote | null => (speaks?.source === 'structure' && own
      ? (watch?.has(t) ? structureQuote(own.rows[t], own.at, gm.status === 'ok' ? gm.prices[t]?.[1] ?? null : null, ordersInRead(here, t, own.at)) : null)
      : speaks?.source === 'goonmetrics' && gm.status === 'ok' ? homeQuote(gm.prices[t]) : null);
    // A read that exists but doesn't speak (past two hours, refused since) is a hub with no price, not one never read.
    return { gm, book, hub: state, speaks, quote, read: !pending && (speaks != null || own != null) && !(hub?.goonmetrics && gm.status === 'loading'), pending, itemsFailed, unwatched: (t) => speaks?.source === 'structure' && !!watch && !watch.has(t), unread: speaks?.source === 'goonmetrics' && gm.status === 'ok' ? gm.unread : NO_TYPES, gmWatch: speaks?.source !== 'goonmetrics' ? null : watch ?? (watchFailed ? null : 'loading') };
  }, [gm, book, state, own, key, here, watch, pending, itemsFailed]); // eslint-disable-line react-hooks/exhaustive-deps
}
const NO_ORDERS: readonly HubOrder[] = [];

/**
 * The cloud's copy market (Task 14A's answer, told apart by `at`): `off` with the cloud copy off in this browser, `switched` when
 * the cloud has its EVE Ref reads off, `none` before any round has tried, `tried` when a round tried and none has read yet (with
 * when, and why it failed), `behind` for a Worker without the route (404), `failed` otherwise; `ok` with the summary, when the
 * cloud last tried, that try's error beside the last good read, and a note when a read kept a set without counting.
 */
export type CopyMarketState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string; retry: () => void }
  | { status: 'switched' } | { status: 'none' } | { status: 'tried'; tried: string; error: string | null }
  | { status: 'ok'; summary: CopySummary; tried: string | null; error: string | null; stale: string | null; note: string | null };
/** Held like a hub's prices: the cloud reads every six hours, so a read is kept until the next could have landed (homeHoldMs), and dropped on another login and on "Delete all data". */
let copiesHeld: { until: number; read: ReturnType<typeof cloudCopies> } | null = null;
const resetCopies = () => { copiesHeld = null; };
let copiesChar: number | null | undefined;
onAuthChange(() => { const id = getAuth()?.characterId ?? null; if (copiesChar !== undefined && copiesChar !== id) resetCopies(); copiesChar = id; });
onClearAll(resetCopies);
const copiesRead = () => {
  if (copiesHeld && Date.now() < copiesHeld.until) return copiesHeld.read;
  const read = cloudCopies();
  const held = { until: Infinity, read };
  copiesHeld = held;
  read.then((r) => { held.until = Date.now() + homeHoldMs(r && 'at' in r ? r.at : null, Date.now()); }, () => { if (copiesHeld === held) copiesHeld = null; });
  return read;
};
export function useCopyMarket(): CopyMarketState {
  const cloud = useCloud();
  const [st, setSt] = useState<CopyMarketState>(() => (cloudEnabled() ? { status: 'loading' } : { status: 'off' }));
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!cloudEnabled()) { resetCopies(); setSt({ status: 'off' }); return; }
    if (!cloud.started) return;
    let alive = true;
    copiesRead().then((r) => {
      if (!alive) return;
      // Told apart by `at`: only a summary has one.
      setSt(!r ? { status: 'none' } : 'off' in r ? { status: 'switched' } : !('at' in r) ? { status: 'tried', tried: r.tried, error: r.error }
        : { status: 'ok', summary: r, tried: r.tried, error: r.error, stale: r.stale ?? null, note: r.note ?? null });
    }, (e) => { if (alive) setSt((e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e), retry: () => { resetCopies(); setSt({ status: 'loading' }); setTries((n) => n + 1); } }); });
    return () => { alive = false; };
  }, [cloud.started, tries]);
  return st;
}

/** The home region's daily history for the types asked (regionHistory: kept three hours, shared in flight), four at a time. One that can't be read is left out. */
export function useHomeHistory(types: readonly number[], region: number | null): Record<number, HistRow[]> {
  return useHomeHistoryRead(types, region).rows;
}
/**
 * `useHomeHistory`, and whether every type asked for has come back or failed (`settled`). The rows are kept by type while the region
 * stays (planner fix 2): emptied whenever the goods named changed, a re-rank naming other goods ran once with no history at all, the
 * investigation's 72-a-day shape for one render before the cached histories landed (planner-bugs-report.md, Bug 2, cause 3). A type
 * already held isn't asked for again; another region starts afresh.
 */
export function useHomeHistoryRead(types: readonly number[], region: number | null, counted = false): { rows: Record<number, HistRow[]>; settled: boolean; late: number; count: ReadCount } {
  const key = region ? `${region}:${types.join(',')}` : '';
  const [got, setGot] = useState<{ region: number | null; rows: Record<number, HistRow[]> }>({ region: null, rows: {} });
  const [doneKey, setDoneKey] = useState<Settled>(null);
  const [count, setCount] = useState<Counted>(null);
  const held = useRef(got);
  held.current = got;
  useEffect(() => {
    if (!key) { setDoneKey({ key, late: 0 }); return; }
    let alive = true;
    const keep = held.current.region === region ? held.current.rows : {};
    if (held.current.region !== region) setGot({ region, rows: {} });
    const queue = key.split(':')[1].split(',').filter(Boolean).map(Number).filter((t) => !keep[t]);
    if (counted) setCount({ key, done: 0, of: queue.length });
    if (!queue.length) { setDoneKey({ key, late: 0 }); return () => { alive = false; }; }
    let next = 0, done = 0;
    // As useLiveBooks: each history landing re-ranked all 1,652 rows, so they are held back and set in batches.
    let buf: Record<number, HistRow[]> = {};
    const flush = () => { const b = buf; buf = {}; if (Object.keys(b).length) setGot((x) => ({ region, rows: x.region === region ? { ...x.rows, ...b } : b })); };
    const work = async () => {
      while (alive && next < queue.length) {
        const t = queue[next++];
        const rows = await regionHistory(t, region!).catch(() => null);
        if (!alive) return;
        if (rows) buf[t] = rows;
        done++;
        if (counted) setCount({ key, done, of: queue.length });
        if (done === 8 || (done > 8 && (done - 8) % 16 === 0) || done === queue.length) flush();
        if (done === queue.length) setDoneKey({ key, late: 0 });
      }
    };
    for (let i = 0; i < 4; i++) void work();
    // As useLiveRead: nothing a read could hang on times out by itself.
    const bound = setTimeout(() => { if (alive && done < queue.length) { flush(); setDoneKey({ key, late: queue.length - done }); } }, LIVE_READ_BOUND_MS);
    return () => { alive = false; clearTimeout(bound); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rows: got.region === region ? got.rows : NO_ROWS, settled: doneKey?.key === key, late: doneKey?.key === key ? doneKey.late : 0, count: countOf(count, key, 0) };
}
const NO_ROWS: Record<number, HistRow[]> = {};
