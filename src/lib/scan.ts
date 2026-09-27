import { useSyncExternalStore } from 'react';
import { del, get, set } from 'idb-keyval';
import { JITA_44, THE_FORGE } from './config';
import { esi } from './esi';
import { rates, type Settings } from './fees';
import { jitaBook, marketHistory } from './market';
import { BUSY_SHOWN, DEFAULT_FILTERS, expectedEdge, passesGate, pickPages, statsFrom, tradedPerDay } from './prospects';
import { cacheStore, getData } from './store';
import { toast } from './toast';
import { watchedDays, watchedFlow } from './flowStore';
import { judgeProspect, type Book } from './evaluate';
import type { ScanRuns } from './prospects';
import type { Prospect, ProspectFilters, ProspectStats } from './types';

/**
 * Finding items worth trading costs one ESI request per item, and there are 19,000 of them.
 * So the scan is a funnel: sample the order book to nominate candidates, spend history
 * requests only on the best of those, and fetch live books only for the ones that survive.
 * Each run is bounded and everything is cached, so running again widens the net rather than
 * doing the same work twice.
 */

/**
 * How hard to look. A quick scan is sized to stay usable --- about a minute and a half --- and
 * skims the busiest books. A deep scan samples three times as much of the order book, drops the
 * threshold so quieter items make the shortlist, and checks several times as many of them; it
 * takes minutes rather than seconds and is meant to be left running.
 */
export type ScanDepth = 'quick' | 'deep';
const DEPTH: Record<ScanDepth, { pages: number; history: number; books: number; busy: number; minSampled: number }> = {
  // Sized to stay usable: about a minute and a half, skimming the busiest books. `busy` is how many of
  // the busiest markets by ISK traded are priced as well, whatever their margin, for the Busy markets view.
  quick: { pages: 20, history: 250, books: 40, busy: 60, minSampled: 3 },
  // Runs to the end however long that takes. Three times the sample, a lower bar so quieter items
  // make the shortlist, and no cap on how many get checked --- a deep scan that stopped early and
  // asked to be run again is just a quick scan with extra steps.
  deep: { pages: 60, history: Infinity, books: Infinity, busy: 100, minSampled: 2 },
};

/** How often to write progress away mid-run, so a long scan survives the tab closing. */
const SAVE_EVERY = 150;
const SAMPLE_TTL = 6 * 3600_000;
const STATS_TTL = 24 * 3600_000;
const BOOK_TTL = 60 * 60_000;

type RawOrder = { type_id: number; location_id: number };
export type { Book } from './evaluate';

export type ScanCache = {
  sample?: { at: string; totalPages: number; sampledPages: number; minSampled: number; counts: Record<number, number> };
  /** When a quick and a deep scan last ran to the end. A stopped scan doesn't count. */
  runs?: ScanRuns;
  stats: Record<number, ProspectStats>;
  books: Record<number, Book>;
};
const CACHE_KEY = 'prospects';
const EMPTY: ScanCache = { stats: {}, books: {} };

export async function loadCache(): Promise<ScanCache> {
  const c = (await get(CACHE_KEY, cacheStore)) as ScanCache | undefined;
  return c ? { ...EMPTY, ...c } : { ...EMPTY };
}
const saveCache = (c: ScanCache) => set(CACHE_KEY, c, cacheStore).catch(() => undefined);

export type ScanPhase = 'idle' | 'sampling' | 'liquidity' | 'pricing' | 'done';
export type ScanState = {
  phase: ScanPhase; done: number; total: number; message: string;
  failed: number; candidates: number; error: string | null; depth: ScanDepth;
  /** When this run began, for working out how much longer it has. */
  startedAt: number;
  /** Bumped on every mid-run save, so the page knows there is more to show. */
  saved: number;
};
const IDLE: ScanState = { phase: 'idle', done: 0, total: 0, message: '', failed: 0, candidates: 0, error: null, depth: 'quick', startedAt: 0, saved: 0 };
let state = IDLE;
const listeners = new Set<() => void>();
const setState = (p: Partial<ScanState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export function useScanState(): ScanState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

let abort = false;
export function stopScan() { abort = true; }

/**
 * An unbiased count of what is listed at Jita 4-4, per item.
 *
 * ESI shuffles order pages with respect to type — pages 1, 100 and 408 each span the whole
 * type range — so a handful of random pages is a fair sample of the region. Twenty of The
 * Forge's ~408 pages costs 5% of the traffic a full sweep would (97 MB) and still surfaces
 * every item with a busy book.
 *
 * This counts listings, not trades. Plenty of items carry hundreds of listings and barely
 * trade, so the result is a shortlist to check, never a ranking.
 */
export async function sampleJita(pages = DEPTH.quick.pages) {
  const path = `/markets/${THE_FORGE}/orders/`;
  const first = await esi<RawOrder[]>(path, { query: { order_type: 'all', page: 1 } });
  const totalPages = first.pages ?? 1;
  const rest = pickPages(totalPages, pages).slice(1);
  const more = await Promise.all(
    rest.map((p) => esi<RawOrder[]>(path, { query: { order_type: 'all', page: p } }).then((r) => r.data).catch(() => [] as RawOrder[])),
  );
  const counts: Record<number, number> = {};
  let orders = 0;
  for (const list of [first.data, ...more]) {
    for (const o of list) {
      orders++;
      if (o.location_id === JITA_44) counts[o.type_id] = (counts[o.type_id] ?? 0) + 1;
    }
  }
  return { totalPages, sampledPages: 1 + more.length, orders, counts };
}

/** A scanned item judged as a trade, with what this browser (and the cloud) watched of its book. */
export function evaluate(stats: ProspectStats, book: Book, settings: Settings, filters: ProspectFilters, estOrders: number, anyReturn = false): Prospect | null {
  return judgeProspect(stats, book, settings, filters, estOrders, anyReturn, { days: watchedDays(stats.typeId), flow: watchedFlow(stats.typeId) });
}

/** Everything scanned so far that still clears the filters, best return on capital first. */
export function rankProspects(cache: ScanCache, settings: Settings, filters: ProspectFilters): Prospect[] {
  const scale = cache.sample ? cache.sample.totalPages / Math.max(1, cache.sample.sampledPages) : 1;
  const out: Prospect[] = [];
  if (filters.busy) {
    // The busiest markets priced so far, by ISK traded a day, each at its real return, sized to what it
    // can take in the horizon. For dipping into a big, thin-margin market on purpose.
    // Walks down until BUSY_SHOWN can be shown: some near the top can't be (one unit costs more than
    // your ISK per item, or NPCs sell it), and stopping at the first 40 showed 26.
    const busiest = Object.values(cache.stats)
      .filter((s) => passesGate(s, filters) && cache.books[s.typeId])
      .sort((a, b) => tradedPerDay(b) - tradedPerDay(a));
    for (const s of busiest) {
      if (out.length >= BUSY_SHOWN) break;
      const p = evaluate(s, cache.books[s.typeId], settings, { ...filters, partial: true }, (cache.sample?.counts[s.typeId] ?? 0) * scale, true);
      if (p) out.push(p);
    }
    return out.sort((a, b) => b.traded - a.traded);
  }
  for (const s of Object.values(cache.stats)) {
    if (!passesGate(s, filters)) continue;
    const book = cache.books[s.typeId];
    if (!book) continue;
    const p = evaluate(s, book, settings, filters, (cache.sample?.counts[s.typeId] ?? 0) * scale);
    if (p) out.push(p);
  }
  // Ordering is the caller's business now --- the table header decides it. Return best return per
  // day first so a caller that does not sort still gets something sensible.
  return out.sort((a, b) => b.roiPerDay - a.roiPerDay);
}

/** Throw away everything a scan learned, without touching trades, positions or settings. */
export async function clearScan(): Promise<void> {
  await del(CACHE_KEY, cacheStore).catch(() => undefined);
  setState({ ...IDLE });
}

/** How much of the candidate pool has been checked, and how old the prices on screen are. */
export function coverage(cache: ScanCache) {
  const counts = cache.sample?.counts ?? {};
  const min = cache.sample?.minSampled ?? DEPTH.quick.minSampled;
  const candidates = Object.keys(counts).filter((id) => counts[Number(id)] >= min).length;
  const books = Object.values(cache.books);
  // The oldest price is the honest one to quote: it is the worst thing on screen.
  const oldest = books.reduce<number | null>((acc, b) => {
    const t = Date.parse(b.at);
    return Number.isFinite(t) && (acc === null || t < acc) ? t : acc;
  }, null);
  return {
    candidates,
    checked: Object.keys(cache.stats).length,
    priced: books.length,
    pricedAt: oldest === null ? null : new Date(oldest).toISOString(),
  };
}

/** Run a list through a small worker pool. The esi() gate caps real concurrency at 4 anyway. */
async function pool<T>(items: T[], fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (i < items.length && !abort) await fn(items[i++]);
  }));
}

/** A stats record for an item ESI has no recent history for, so we don't ask again tomorrow. */
const dead = (typeId: number): ProspectStats => ({
  typeId, at: new Date().toISOString(), daysTraded: 0, tradesPerDay: 0, unitsPerDay: 0,
  spikiness: 1, dailyRange: 0, trend: 0, avgPrice: 0, spark: new Array(30).fill(0),
});

export async function runScan(settings: Settings, filters: ProspectFilters = DEFAULT_FILTERS, depth: ScanDepth = 'quick'): Promise<void> {
  if (state.phase === 'sampling' || state.phase === 'liquidity' || state.phase === 'pricing') return;
  abort = false;
  const want = DEPTH[depth];
  setState({ ...IDLE, phase: 'sampling', depth, startedAt: Date.now(), message: 'Sampling the Jita 4-4 order book…' });
  try {
    const cache = await loadCache();
    const now = Date.now();

    let sample = cache.sample;
    const stale = !sample || now - Date.parse(sample.at) > SAMPLE_TTL;
    // A deep run wants a deeper sample, even if the shallow one is still fresh.
    const tooShallow = !!sample && (sample.sampledPages < want.pages || sample.minSampled > want.minSampled);
    if (stale || tooShallow) {
      const s = await sampleJita(want.pages);
      sample = {
        at: new Date().toISOString(), totalPages: s.totalPages, sampledPages: s.sampledPages,
        minSampled: want.minSampled, counts: s.counts,
      };
      cache.sample = sample;
      await saveCache(cache);
    }
    if (abort) return setState({ phase: 'idle', message: '' });
    if (!sample) return setState({ phase: 'done', error: 'The order book sample came back empty. Try again in a minute.' });

    const counts = sample.counts;
    const candidates = Object.keys(counts).map(Number)
      .filter((id) => counts[id] >= want.minSampled)
      .sort((a, b) => counts[b] - counts[a]);
    const todo = candidates
      // Stats from before the 14-day lows were kept are stale too, or a scan today would price those items
      // the old way for up to a day. A dead item has none to keep, so it isn't asked for again.
      .filter((id) => { const s = cache.stats[id]; return !s || now - Date.parse(s.at) > STATS_TTL || (s.daysTraded > 0 && !s.lows14); })
      .slice(0, want.history);

    setState({
      phase: 'liquidity', done: 0, total: todo.length, candidates: candidates.length,
      message: `Checking how often ${todo.length.toLocaleString('en-US')} items actually trade…`,
    });
    let sinceSave = 0;
    await pool(todo, async (id) => {
      try {
        cache.stats[id] = statsFrom(id, await marketHistory(id)) ?? dead(id);
      } catch {
        setState({ failed: state.failed + 1 });
      }
      setState({ done: state.done + 1 });
      // A deep run can take the better part of an hour; don't make the whole thing all-or-nothing.
      if (++sinceSave >= SAVE_EVERY) {
        sinceSave = 0;
        await saveCache(cache);
        setState({ saved: state.saved + 1 });
      }
    });
    await saveCache(cache);
    setState({ saved: state.saved + 1 });
    if (abort) { await saveCache(cache); return setState({ phase: 'done', message: '', saved: state.saved + 1 }); }

    // Spend the book requests where they can pay. Turnover alone would send them all to
    // minerals and extractors, whose spreads are far too thin to survive the fees — an item
    // has to move further in a day than the round trip costs before volume means anything.
    const { be } = rates(settings);
    const share = settings.share / 100;
    const survivors = Object.values(cache.stats)
      .filter((s) => passesGate(s, filters))
      // Likewise a book read before NPC sellers were looked for.
      .filter((s) => { const b = cache.books[s.typeId]; return !b || now - Date.parse(b.at) > BOOK_TTL || b.npcSell === undefined; })
      .map((s) => ({ s, edge: expectedEdge(s, be, share) }))
      .filter((x) => x.edge > 0)
      .sort((a, b) => b.edge - a.edge)
      .slice(0, want.books)
      .map((x) => x.s);
    // And the busiest markets by ISK traded, whatever their margin, so the Busy markets view has them.
    const busiest = Object.values(cache.stats)
      // One unit costing more than your ISK per item can't be shown, so it isn't worth a request.
      .filter((s) => passesGate(s, filters) && s.unitsPerDay > 0 && s.avgPrice <= filters.budget && !survivors.includes(s))
      .filter((s) => { const b = cache.books[s.typeId]; return !b || now - Date.parse(b.at) > BOOK_TTL || b.npcSell === undefined; })
      .sort((a, b) => tradedPerDay(b) - tradedPerDay(a))
      .slice(0, want.busy);
    survivors.push(...busiest);

    setState({
      phase: 'pricing', done: 0, total: survivors.length,
      message: `Pricing ${survivors.length} of them against the live book…`,
    });
    sinceSave = 0;
    await pool(survivors, async (s) => {
      try {
        // Whatever gets priced gets judged on where trading reaches, so its stats need the 14-day lows.
        // The liquidity pass refreshes the most-listed items and these are the best-margin ones --- mostly
        // different --- so without this only a handful of the priced items (5 of 42 in a test) had them.
        const [book, hist] = await Promise.all([jitaBook(s.typeId), s.lows14 ? null : marketHistory(s.typeId)]);
        cache.books[s.typeId] = { at: new Date().toISOString(), ...book };
        if (hist) cache.stats[s.typeId] = statsFrom(s.typeId, hist) ?? dead(s.typeId);
      } catch {
        setState({ failed: state.failed + 1 });
      }
      setState({ done: state.done + 1 });
      if (++sinceSave >= SAVE_EVERY) {
        sinceSave = 0;
        await saveCache(cache);
        setState({ saved: state.saved + 1 });
      }
    });
    // Only a scan that ran to the end is recorded as done: other pages judge their data by it.
    if (!abort) cache.runs = { ...cache.runs, [depth]: new Date().toISOString() };
    await saveCache(cache);
    setState({ saved: state.saved + 1 });

    setState({ phase: 'done', message: '', candidates: candidates.length });
    // A deep scan is left running, often for a long time, so it says when it has finished.
    if (!abort && depth === 'deep') {
      const text = `Deep scan finished: ${Object.keys(cache.stats).length.toLocaleString('en-US')} items checked, ${Object.keys(cache.books).length.toLocaleString('en-US')} priced against the live book.`;
      toast(text, 'ok', { system: getData().alerts.browser ? { title: 'Jita Ledger · Deep scan finished', tag: 'deep-scan', heading: 'Deep scan finished' } : undefined });
    }
  } catch (e) {
    setState({ phase: 'done', error: e instanceof Error ? e.message : String(e) });
  }
}
