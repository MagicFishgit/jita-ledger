import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import { JITA_44, THE_FORGE } from './config';
import { esi } from './esi';
import { calc, rates, type Settings } from './fees';
import { jitaBook, marketHistory } from './market';
import { DEFAULT_FILTERS, expectedEdge, passesGate, pickPages, statsFrom, warningsFor } from './prospects';
import { cacheStore } from './store';
import { tickDown, tickUp } from './tick';
import type { BookLevel, Prospect, ProspectFilters, ProspectStats } from './types';

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
const DEPTH: Record<ScanDepth, { pages: number; history: number; books: number; minSampled: number }> = {
  quick: { pages: 20, history: 250, books: 40, minSampled: 3 },
  deep: { pages: 60, history: 1200, books: 150, minSampled: 2 },
};
const SAMPLE_TTL = 6 * 3600_000;
const STATS_TTL = 24 * 3600_000;
const BOOK_TTL = 60 * 60_000;

type RawOrder = { type_id: number; location_id: number };
export type Book = { at: string; bestBuy: number | null; bestSell: number | null; buyOrders: number; sellOrders: number; topBuys: BookLevel[]; topSells: BookLevel[] };

export type ScanCache = {
  sample?: { at: string; totalPages: number; sampledPages: number; minSampled: number; counts: Record<number, number> };
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
};
const IDLE: ScanState = { phase: 'idle', done: 0, total: 0, message: '', failed: 0, candidates: 0, error: null, depth: 'quick' };
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

/**
 * Price a candidate against the live book, through the trader's own fees and skills.
 *
 * The position is a day's worth of the market at their usual share, capped by what their
 * budget can carry: a small budget shrinks the ISK per day rather than hiding the item.
 */
export function evaluate(
  stats: ProspectStats,
  book: Book,
  settings: Settings,
  filters: ProspectFilters,
  estOrders: number,
): Prospect | null {
  const { bestBuy, bestSell } = book;
  if (bestBuy == null || bestSell == null) return null;
  const buy = tickUp(bestBuy), sell = tickDown(bestSell);
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || sell <= buy) return null;

  const wanted = Math.max(1, Math.round(stats.unitsPerDay * (settings.share / 100)));
  const affordable = Math.floor(filters.budget / buy);
  if (affordable < 1) return null;
  const qty = Math.min(wanted, affordable);

  const c = calc({ buy, sell, qty }, settings);
  if (!c.ok || c.net <= 0 || c.roi < filters.minRoi) return null;

  return {
    typeId: stats.typeId, stats, bestBuy, bestSell, buy, sell,
    buyOrders: book.buyOrders, sellOrders: book.sellOrders,
    topBuyVol: book.topBuys[0]?.volume ?? 0, topSellVol: book.topSells[0]?.volume ?? 0,
    qty, net: c.net / qty, roi: c.roi, spreadPct: c.spreadPct,
    iskPerDay: c.net, capital: c.spent,
    warnings: warningsFor(stats, book, c.spreadPct, estOrders),
  };
}

/** Everything scanned so far that still clears the filters, best return on capital first. */
export function rankProspects(cache: ScanCache, settings: Settings, filters: ProspectFilters): Prospect[] {
  const scale = cache.sample ? cache.sample.totalPages / Math.max(1, cache.sample.sampledPages) : 1;
  const out: Prospect[] = [];
  for (const s of Object.values(cache.stats)) {
    if (!passesGate(s, filters)) continue;
    const book = cache.books[s.typeId];
    if (!book) continue;
    const p = evaluate(s, book, settings, filters, (cache.sample?.counts[s.typeId] ?? 0) * scale);
    if (p) out.push(p);
  }
  // Ordering is the caller's business now --- the table header decides it. Return best return
  // first so a caller that does not sort still gets something sensible.
  return out.sort((a, b) => b.roi - a.roi);
}

/** How much of the candidate pool has been checked, for an honest coverage line. */
export function coverage(cache: ScanCache) {
  const counts = cache.sample?.counts ?? {};
  const min = cache.sample?.minSampled ?? DEPTH.quick.minSampled;
  const candidates = Object.keys(counts).filter((id) => counts[Number(id)] >= min).length;
  return { candidates, checked: Object.keys(cache.stats).length, priced: Object.keys(cache.books).length };
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
  setState({ ...IDLE, phase: 'sampling', depth, message: 'Sampling the Jita 4-4 order book…' });
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
      .filter((id) => { const s = cache.stats[id]; return !s || now - Date.parse(s.at) > STATS_TTL; })
      .slice(0, want.history);

    setState({
      phase: 'liquidity', done: 0, total: todo.length, candidates: candidates.length,
      message: `Checking how often ${todo.length.toLocaleString('en-US')} items actually trade…`,
    });
    await pool(todo, async (id) => {
      try {
        cache.stats[id] = statsFrom(id, await marketHistory(id)) ?? dead(id);
      } catch {
        setState({ failed: state.failed + 1 });
      }
      setState({ done: state.done + 1 });
    });
    await saveCache(cache);
    if (abort) return setState({ phase: 'idle', message: '' });

    // Spend the book requests where they can pay. Turnover alone would send them all to
    // minerals and extractors, whose spreads are far too thin to survive the fees — an item
    // has to move further in a day than the round trip costs before volume means anything.
    const { be } = rates(settings);
    const share = settings.share / 100;
    const survivors = Object.values(cache.stats)
      .filter((s) => passesGate(s, filters))
      .filter((s) => { const b = cache.books[s.typeId]; return !b || now - Date.parse(b.at) > BOOK_TTL; })
      .map((s) => ({ s, edge: expectedEdge(s, be, share) }))
      .filter((x) => x.edge > 0)
      .sort((a, b) => b.edge - a.edge)
      .slice(0, want.books)
      .map((x) => x.s);

    setState({
      phase: 'pricing', done: 0, total: survivors.length,
      message: `Pricing ${survivors.length} of them against the live book…`,
    });
    await pool(survivors, async (s) => {
      try {
        cache.books[s.typeId] = { at: new Date().toISOString(), ...(await jitaBook(s.typeId)) };
      } catch {
        setState({ failed: state.failed + 1 });
      }
      setState({ done: state.done + 1 });
    });
    await saveCache(cache);

    setState({ phase: 'done', message: '', candidates: candidates.length });
  } catch (e) {
    setState({ phase: 'done', error: e instanceof Error ? e.message : String(e) });
  }
}
