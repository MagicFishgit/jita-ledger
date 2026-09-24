# Prospects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page that finds Jita 4-4 items worth station trading, gated on trading consistently enough to actually buy and sell day after day.

**Architecture:** A three-stage funnel, each stage narrower and more expensive per item than the last. Sample 20 random pages of the Forge order book to nominate candidates (ESI shuffles order pages by type, so this is unbiased). Spend one history request each on the best ~250 to measure real trade frequency. Fetch live books for the ~40 that survive the gate, and price them one tick inside the spread through the user's own fees. Results persist to IndexedDB so later runs widen coverage instead of repeating work.

**Tech Stack:** TypeScript, React 18, Vite, idb-keyval. No new dependencies. Verification via Node 24 native type stripping (`node scripts/check.mjs`) — this repo has no test runner and this plan does not add one.

**Spec:** `docs/superpowers/specs/2026-09-24-prospects-design.md`

## Global Constraints

- **No new npm dependencies.** Everything ships with what `package.json` already has.
- **Reuse, don't reimplement:** `calc()`/`rates()` from `fees.ts` for money, `tickUp`/`tickDown` from `tick.ts` for prices, `jitaBook()` from `market.ts` for books, `esi()` from `esi.ts` for traffic (it already gates to 4 concurrent and handles 420/429).
- **Region/station constants come from `config.ts`** (`THE_FORGE`, `JITA_44`). Never inline the numbers.
- **Cached scan data lives in `cacheStore`,** never in the main `Data` store — it is derived, and `clearAll()` already wipes it.
- **Window for all history stats:** the 30 complete days ending yesterday. Today's history is still filling, and ESI runs about a day behind.
- **A missing day in ESI history is a day with no trades.** ESI omits zero-volume days entirely; never treat a gap as missing data.
- **Copy is plain English, sentence case, no jargon** — match the tone of the existing pages ("Items you're considering, priced one step inside the current Jita 4-4 spread").
- **Deviation from the spec, deliberate:** the spec gates on `capital <= budget`. Instead the budget *caps the position size* (`qty = min(day's share, what the budget affords)`) and only rejects when the budget cannot afford a single unit. Strictly more useful — a cheap budget shrinks the ISK/day figure rather than hiding the item. Update the spec to match in Task 8.

---

### Task 1: History stats reducer

The heart of the gate. Turns 419 days of ESI history into the six numbers that decide whether an item trades consistently.

**Files:**
- Create: `src/lib/prospects.ts`
- Modify: `src/lib/types.ts` (append `ProspectStats`)
- Test: `scripts/check.mjs` (create), `package.json` (add `check` script)

**Interfaces:**
- Consumes: `HistRow` from `types.ts` (`{ date, average, highest, lowest, volume, order_count }`)
- Produces: `statsFrom(typeId: number, rows: HistRow[], now?: number): ProspectStats | null`

- [ ] **Step 1: Add the type**

In `src/lib/types.ts`:

```ts
/** What a scan learned about one item's trading, reduced from ESI's daily history. */
export type ProspectStats = {
  typeId: number;
  at: string;
  /** Of the last 30 complete days, how many had any trade at all. */
  daysTraded: number;
  /** Median trades per day. */
  tradesPerDay: number;
  /** Median units per day. */
  unitsPerDay: number;
  /** The busiest day's share of the month's volume. High means one big day, not steady trade. */
  spikiness: number;
  /** Median (highest - lowest) / average: how wide this item's spread usually is. */
  dailyRange: number;
  /** 30-day average price against the 90-day, as a fraction. Negative means falling. */
  trend: number;
  avgPrice: number;
  /** 30 daily volumes, oldest first, zero on days nothing traded. */
  spark: number[];
};
```

- [ ] **Step 2: Write the failing check**

Create `scripts/check.mjs`:

```js
// Verification harness. Run with: npm run check
// Node runs the TypeScript directly via native type stripping.
import { statsFrom } from '../src/lib/prospects.ts';

let failed = 0;
const eq = (label, got, want) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) < 1e-9 : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.log(`  FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
const DAY = 86400_000;
const NOW = Date.parse('2026-09-24T12:00:00Z');
const dayAgo = (n) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
/** n most recent complete days, newest = 1 day ago. */
const rows = (n, f = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({
    date: dayAgo(i + 1), average: 100, highest: 110, lowest: 90, volume: 1000, order_count: 20, ...f(i),
  }));

console.log('--- statsFrom ---');
const steady = statsFrom(1, rows(30), NOW);
eq('daysTraded steady', steady.daysTraded, 30);
eq('tradesPerDay', steady.tradesPerDay, 20);
eq('unitsPerDay', steady.unitsPerDay, 1000);
eq('spikiness steady', steady.spikiness, 1 / 30);
eq('dailyRange', steady.dailyRange, 0.2);
eq('spark length', steady.spark.length, 30);

// The case the whole page exists to reject: a healthy monthly total, all on one day.
const spike = statsFrom(2, [{ date: dayAgo(1), average: 100, highest: 110, lowest: 90, volume: 30000, order_count: 40 }], NOW);
eq('daysTraded spike', spike.daysTraded, 1);
eq('spikiness spike', spike.spikiness, 1);

// Gaps are real: ESI omits days with no trades.
const gappy = statsFrom(3, rows(30).filter((_, i) => i % 3 === 0), NOW);
eq('daysTraded gappy', gappy.daysTraded, 10);
eq('spark zeroes on gaps', gappy.spark.filter((v) => v === 0).length, 20);

// A falling price shows as a negative trend.
const falling = statsFrom(4, rows(90, (i) => ({ average: 100 + i })), NOW);
if (!(falling.trend < -0.05)) { failed++; console.log(`  FAIL trend falling: ${falling.trend}`); }

// Dead items return null rather than flattering stats.
eq('dead item', statsFrom(5, [{ date: '2025-01-01', average: 1, highest: 1, lowest: 1, volume: 5, order_count: 1 }], NOW), null);
eq('no rows', statsFrom(6, [], NOW), null);
// Today's partial day is excluded from the window.
eq('excludes today', statsFrom(7, [{ date: dayAgo(0), average: 1, highest: 1, lowest: 1, volume: 5, order_count: 1 }], NOW), null);

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
```

Add to `package.json` scripts: `"check": "node scripts/check.mjs"`

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm run check`
Expected: FAIL — `prospects.ts` does not exist.

- [ ] **Step 4: Implement**

Create `src/lib/prospects.ts`:

```ts
import type { HistRow, ProspectStats } from './types';

const DAY = 86400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Middle value, or the mean of the middle two. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Reduce ESI's daily history to what a screener needs.
 *
 * The window is the 30 complete days ending yesterday: today's history is still filling
 * and ESI runs about a day behind. ESI leaves days with no trades out of the response
 * entirely, so a gap is not missing data --- it is a day nothing sold, and that is exactly
 * what we are trying to measure.
 *
 * Returns null when nothing traded in the window, which is the answer for a dead item.
 */
export function statsFrom(typeId: number, rows: HistRow[], now = Date.now()): ProspectStats | null {
  const end = now - DAY;
  const from = (days: number) => end - (days - 1) * DAY;
  const at = (r: HistRow) => Date.parse(r.date + 'T00:00:00Z');
  const endDay = Date.parse(dayKey(end) + 'T00:00:00Z');
  const within = (r: HistRow, days: number) => at(r) >= Date.parse(dayKey(from(days)) + 'T00:00:00Z') && at(r) <= endDay;

  const w30 = rows.filter((r) => within(r, 30));
  if (!w30.length) return null;
  const w90 = rows.filter((r) => within(r, 90));

  const vols = w30.map((r) => r.volume);
  const total = vols.reduce((a, b) => a + b, 0);
  const avg30 = w30.reduce((s, r) => s + r.average, 0) / w30.length;
  const avg90 = w90.length ? w90.reduce((s, r) => s + r.average, 0) / w90.length : avg30;

  const byDay = new Map(w30.map((r) => [r.date, r.volume]));
  const spark: number[] = [];
  for (let i = 29; i >= 0; i--) spark.push(byDay.get(dayKey(end - i * DAY)) ?? 0);

  return {
    typeId,
    at: new Date(now).toISOString(),
    daysTraded: Math.min(30, w30.length),
    tradesPerDay: median(w30.map((r) => r.order_count)),
    unitsPerDay: median(vols),
    spikiness: total > 0 ? Math.max(...vols) / total : 1,
    dailyRange: median(w30.map((r) => (r.average > 0 ? (r.highest - r.lowest) / r.average : 0))),
    trend: avg90 > 0 ? avg30 / avg90 - 1 : 0,
    avgPrice: avg30,
    spark,
  };
}
```

- [ ] **Step 5: Run the check**

Run: `npm run check`
Expected: `all passed`

- [ ] **Step 6: Commit**

```bash
git add src/lib/prospects.ts src/lib/types.ts scripts/check.mjs package.json
git commit -m "Add the history stats reducer behind the Prospects gate"
```

---

### Task 2: Order-book sampling

Nominates candidates for ~5% of the traffic a full book sweep would cost.

**Files:**
- Modify: `src/lib/market.ts`
- Test: `scripts/check.mjs`

**Interfaces:**
- Consumes: `esi()` from `esi.ts`, `THE_FORGE`/`JITA_44` from `config.ts`
- Produces: `sampleJita(pages?: number): Promise<OrderSample>` where
  `OrderSample = { totalPages: number; sampledPages: number; orders: number; counts: Record<number, number> }`;
  and `pickPages(total: number, want: number, rnd?: () => number): number[]`

- [ ] **Step 1: Write the failing check**

Append to `scripts/check.mjs`, above the final summary:

```js
import { pickPages } from '../src/lib/market.ts';

console.log('--- pickPages ---');
const seq = (() => { let i = 0; return () => ((i = (i * 9301 + 49297) % 233280), i / 233280); })();
for (const [total, want] of [[408, 20], [5, 20], [1, 20], [20, 20]]) {
  const p = pickPages(total, want, seq);
  const uniq = new Set(p);
  eq(`pickPages(${total},${want}) length`, p.length, Math.min(total, want));
  eq(`pickPages(${total},${want}) distinct`, uniq.size, p.length);
  if (p.some((n) => n < 1 || n > total)) { failed++; console.log(`  FAIL pickPages out of range: ${p}`); }
  if (p[0] !== 1) { failed++; console.log(`  FAIL pickPages must include page 1: ${p}`); }
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run check`
Expected: FAIL — `pickPages` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/market.ts`:

```ts
export type OrderSample = { totalPages: number; sampledPages: number; orders: number; counts: Record<number, number> };

/** Page 1 plus distinct random others, because page 1 is fetched anyway to learn the page count. */
export function pickPages(total: number, want: number, rnd: () => number = Math.random): number[] {
  const out = [1];
  const pool = Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 2);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  out.push(...pool.slice(0, Math.max(0, Math.min(want, total) - 1)));
  return out;
}

/**
 * An unbiased sample of what is listed at Jita 4-4, counted per item.
 *
 * ESI shuffles order pages with respect to type --- pages 1, 100 and 408 each span the whole
 * type range --- so a handful of random pages is a fair sample of the region's orders. Twenty
 * of The Forge's ~408 pages costs 5% of the traffic of a full sweep (97 MB) and still surfaces
 * every item with a busy book.
 *
 * This measures listings, not trades. Items with hundreds of listings and almost no trades are
 * common, so treat the result as a shortlist to check, never as a ranking.
 */
export async function sampleJita(pages = 20): Promise<OrderSample> {
  const first = await esi<RawMarketOrder[]>(`/markets/${THE_FORGE}/orders/`, { query: { order_type: 'all', page: 1 } });
  const totalPages = first.pages ?? 1;
  const rest = pickPages(totalPages, pages).slice(1);
  const more = await Promise.all(
    rest.map((p) =>
      esi<RawMarketOrder[]>(`/markets/${THE_FORGE}/orders/`, { query: { order_type: 'all', page: p } })
        .then((r) => r.data)
        .catch(() => [] as RawMarketOrder[]),
    ),
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
```

- [ ] **Step 4: Run the check**

Run: `npm run check`
Expected: `all passed`

- [ ] **Step 5: Verify against live ESI**

```bash
node --input-type=module -e "
import { sampleJita } from './src/lib/market.ts';
const s = await sampleJita(8);
console.log('pages', s.sampledPages, 'of', s.totalPages, '| orders', s.orders, '| jita types', Object.keys(s.counts).length);
"
```
Expected: ~408 total pages, ~8,000 orders, several thousand Jita types.

- [ ] **Step 6: Commit**

```bash
git add src/lib/market.ts scripts/check.mjs
git commit -m "Sample the Forge order book to nominate trading candidates"
```

---

### Task 3: The gate and the scoring

**Files:**
- Modify: `src/lib/prospects.ts`, `src/lib/types.ts`
- Test: `scripts/check.mjs`

**Interfaces:**
- Consumes: `statsFrom` (Task 1), `calc`/`Settings` from `fees.ts`, `tickUp`/`tickDown` from `tick.ts`
- Produces: `DEFAULT_FILTERS`, `passesGate(s, f)`, `evaluate(stats, book, settings, filters, estOrders): Prospect | null`

- [ ] **Step 1: Add the types**

In `src/lib/types.ts`:

```ts
export type ProspectWarning = 'thin' | 'fluke' | 'falling' | 'crowded';

/** A candidate that cleared the gate, priced against the live book. */
export type Prospect = {
  typeId: number;
  stats: ProspectStats;
  bestBuy: number; bestSell: number;
  /** One legal step inside the spread: what you would actually place. */
  buy: number; sell: number;
  buyOrders: number; sellOrders: number;
  topBuyVol: number; topSellVol: number;
  qty: number;
  net: number; roi: number; spreadPct: number;
  iskPerDay: number; capital: number;
  warnings: ProspectWarning[];
};

export type ProspectFilters = {
  budget: number;
  minTrades: number;
  minDays: number;
  minRoi: number;
  maxSpikiness: number;
};
```

- [ ] **Step 2: Write the failing check**

Append to `scripts/check.mjs`:

```js
import { DEFAULT_FILTERS, passesGate } from '../src/lib/prospects.ts';

console.log('--- passesGate ---');
const base = { daysTraded: 25, tradesPerDay: 10, unitsPerDay: 500, spikiness: 0.2 };
const gate = (over) => passesGate({ ...base, ...over }, DEFAULT_FILTERS);
eq('healthy passes', gate({}), true);
eq('trades once a month fails', gate({ daysTraded: 1, tradesPerDay: 1 }), false);
eq('too few trading days fails', gate({ daysTraded: 19 }), false);
eq('boundary trading days passes', gate({ daysTraded: 20 }), true);
eq('too few trades fails', gate({ tradesPerDay: 4 }), false);
eq('boundary trades passes', gate({ tradesPerDay: 5 }), true);
eq('one big day fails', gate({ spikiness: 0.51 }), false);
eq('boundary spikiness passes', gate({ spikiness: 0.5 }), true);
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm run check`
Expected: FAIL — `passesGate` is not exported.

- [ ] **Step 4: Implement**

Append to `src/lib/prospects.ts`:

```ts
import { calc, type Settings } from './fees';
import { tickDown, tickUp } from './tick';
import type { BookLevel, Prospect, ProspectFilters, ProspectWarning } from './types';

export const DEFAULT_FILTERS: ProspectFilters = {
  budget: 250_000_000,
  minTrades: 5,
  minDays: 20,
  minRoi: 0.03,
  maxSpikiness: 0.5,
};

/**
 * Does this item change hands often enough, and steadily enough, to trade every day?
 *
 * spikiness is the one that earns its keep: an item can move 30,000 units in a month and
 * still be useless if it all went on one day. Days traded alone would wave that through.
 */
export function passesGate(s: Pick<ProspectStats, 'daysTraded' | 'tradesPerDay' | 'spikiness'>, f: ProspectFilters): boolean {
  return s.daysTraded >= f.minDays && s.tradesPerDay >= f.minTrades && s.spikiness <= f.maxSpikiness;
}

type Book = { bestBuy: number | null; bestSell: number | null; buyOrders: number; sellOrders: number; topBuys: BookLevel[]; topSells: BookLevel[] };

/**
 * Price a candidate against the live book, through the user's own fees.
 *
 * The position is a day's worth of the market at their usual share, capped by what their
 * budget can carry --- a small budget shrinks the ISK per day rather than hiding the item.
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

  const warnings: ProspectWarning[] = [];
  if (book.buyOrders < 5 || book.sellOrders < 5) warnings.push('thin');
  if (stats.dailyRange > 0 && c.spreadPct > 2.5 * stats.dailyRange) warnings.push('fluke');
  if (stats.trend < -0.1) warnings.push('falling');
  if (stats.tradesPerDay > 0 && estOrders / stats.tradesPerDay > 20) warnings.push('crowded');

  return {
    typeId: stats.typeId, stats, bestBuy, bestSell, buy, sell,
    buyOrders: book.buyOrders, sellOrders: book.sellOrders,
    topBuyVol: book.topBuys[0]?.volume ?? 0, topSellVol: book.topSells[0]?.volume ?? 0,
    qty, net: c.net / qty, roi: c.roi, spreadPct: c.spreadPct,
    iskPerDay: c.net, capital: c.spent, warnings,
  };
}
```

Note: `ProspectStats` must be added to the existing `types` import at the top of `prospects.ts`.

- [ ] **Step 5: Run the check**

Run: `npm run check`
Expected: `all passed`

- [ ] **Step 6: Commit**

```bash
git add src/lib/prospects.ts src/lib/types.ts scripts/check.mjs
git commit -m "Gate candidates on steady trade and score them on return"
```

---

### Task 4: Scan orchestration

**Files:**
- Modify: `src/lib/prospects.ts`

**Interfaces:**
- Consumes: `sampleJita` (Task 2), `statsFrom`/`passesGate`/`evaluate` (Tasks 1, 3), `jitaBook`/`marketHistory` from `market.ts`, `cacheStore` from `store.ts`
- Produces: `useScanState()`, `runScan(settings, filters)`, `stopScan()`, `loadCache()`, `rankProspects(cache, settings, filters)`

- [ ] **Step 1: Implement the progress store and the scan**

Append to `src/lib/prospects.ts`. Follow the `useSyncState` pattern from `sync.ts` exactly.

```ts
import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import { cacheStore } from './store';
import { jitaBook, marketHistory, sampleJita, type OrderSample } from './market';

export type ScanPhase = 'idle' | 'sampling' | 'liquidity' | 'pricing' | 'done';
export type ScanState = {
  phase: ScanPhase; done: number; total: number; message: string;
  failed: number; checked: number; candidates: number; error: string | null;
};
const IDLE: ScanState = { phase: 'idle', done: 0, total: 0, message: '', failed: 0, checked: 0, candidates: 0, error: null };
let state = IDLE;
const listeners = new Set<() => void>();
const setState = (p: Partial<ScanState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export function useScanState(): ScanState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

export type ScanCache = {
  sample?: { at: string; totalPages: number; sampledPages: number; counts: Record<number, number> };
  stats: Record<number, ProspectStats>;
  books: Record<number, { at: string; bestBuy: number | null; bestSell: number | null; buyOrders: number; sellOrders: number; topBuys: BookLevel[]; topSells: BookLevel[] }>;
};
const CACHE_KEY = 'prospects';
const EMPTY_CACHE: ScanCache = { stats: {}, books: {} };
const SAMPLE_TTL = 6 * 3600_000;
const STATS_TTL = 24 * 3600_000;
const BOOK_TTL = 10 * 60_000;
const HISTORY_PER_RUN = 250;
const BOOKS_PER_RUN = 40;

export async function loadCache(): Promise<ScanCache> {
  const c = (await get(CACHE_KEY, cacheStore)) as ScanCache | undefined;
  return c ? { ...EMPTY_CACHE, ...c } : { ...EMPTY_CACHE };
}
const saveCache = (c: ScanCache) => set(CACHE_KEY, c, cacheStore).catch(() => undefined);

let abort = false;
export function stopScan() { abort = true; }

/** Run items through a worker pool, reporting progress. The esi() gate caps real concurrency at 4. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>, onEach: (r: R | null) => void) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && !abort) {
      const item = items[i++];
      onEach(await fn(item).catch(() => null));
    }
  }));
}

/**
 * Sample, then verify, then price --- each stage an order of magnitude narrower than the last.
 *
 * A run is bounded so the page stays usable: one sample, up to 250 history checks and up to 40
 * live books. Everything is cached, so running again widens coverage rather than repeating work.
 */
export async function runScan(settings: Settings, filters: ProspectFilters): Promise<void> {
  if (state.phase !== 'idle' && state.phase !== 'done') return;
  abort = false;
  setState({ ...IDLE, phase: 'sampling', message: 'Sampling the Jita order book…' });
  const cache = await loadCache();
  const now = Date.now();
  try {
    if (!cache.sample || now - Date.parse(cache.sample.at) > SAMPLE_TTL) {
      const s: OrderSample = await sampleJita(20);
      cache.sample = { at: new Date().toISOString(), totalPages: s.totalPages, sampledPages: s.sampledPages, counts: s.counts };
      await saveCache(cache);
    }
    if (abort) return void setState({ phase: 'idle', message: '' });

    const counts = cache.sample.counts;
    const candidates = Object.keys(counts).map(Number).filter((id) => counts[id] >= 3);
    candidates.sort((a, b) => counts[b] - counts[a]);
    const todo = candidates.filter((id) => {
      const s = cache.stats[id];
      return !s || now - Date.parse(s.at) > STATS_TTL;
    }).slice(0, HISTORY_PER_RUN);

    setState({ phase: 'liquidity', done: 0, total: todo.length, candidates: candidates.length,
      message: `Checking how often ${todo.length} items actually trade…` });
    let failed = 0;
    await pool(todo, 4, async (id) => {
      const stats = statsFrom(id, await marketHistory(id));
      return { id, stats };
    }, (r) => {
      if (!r) failed++;
      else if (r.stats) cache.stats[r.id] = r.stats;
      else cache.stats[r.id] = { typeId: r.id, at: new Date().toISOString(), daysTraded: 0, tradesPerDay: 0, unitsPerDay: 0, spikiness: 1, dailyRange: 0, trend: 0, avgPrice: 0, spark: new Array(30).fill(0) };
      setState({ done: state.done + 1, failed });
    });
    await saveCache(cache);
    if (abort) return void setState({ phase: 'idle', message: '' });

    const survivors = Object.values(cache.stats)
      .filter((s) => passesGate(s, filters))
      .sort((a, b) => b.unitsPerDay * b.avgPrice - a.unitsPerDay * a.avgPrice)
      .slice(0, BOOKS_PER_RUN);

    setState({ phase: 'pricing', done: 0, total: survivors.length, message: `Pricing ${survivors.length} items against the live book…` });
    await pool(survivors, 4, async (s) => ({ id: s.typeId, book: await jitaBook(s.typeId) }), (r) => {
      if (!r) failed++;
      else cache.books[r.id] = { at: new Date().toISOString(), ...r.book };
      setState({ done: state.done + 1, failed });
    });
    await saveCache(cache);

    setState({ phase: 'done', message: '', checked: Object.keys(cache.stats).length, candidates: candidates.length });
  } catch (e) {
    setState({ phase: 'done', error: e instanceof Error ? e.message : String(e) });
  }
}

/** Everything scanned so far that still clears the filters, best return first. */
export function rankProspects(cache: ScanCache, settings: Settings, filters: ProspectFilters): Prospect[] {
  const total = cache.sample ? cache.sample.totalPages / Math.max(1, cache.sample.sampledPages) : 1;
  const out: Prospect[] = [];
  for (const s of Object.values(cache.stats)) {
    if (!passesGate(s, filters)) continue;
    const book = cache.books[s.typeId];
    if (!book || Date.now() - Date.parse(book.at) > BOOK_TTL * 60) continue;
    const p = evaluate(s, book, settings, filters, (cache.sample?.counts[s.typeId] ?? 0) * total);
    if (p) out.push(p);
  }
  return out.sort((a, b) => b.roi - a.roi);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/prospects.ts
git commit -m "Add the resumable three-stage market scan"
```

---

### Task 5: Volume sparkline

**Files:**
- Create: `src/components/Sparkline.tsx`

**Interfaces:**
- Produces: `<Sparkline values={number[]} label={string} />`

- [ ] **Step 1: Implement**

```tsx
/**
 * 30 days of daily volume as a bar strip. The shape is the point: an even row means the item
 * trades every day, a single tall bar means one big day and nothing else --- which a median
 * or a monthly total would hide.
 */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  const w = 3, gap = 1, h = 18;
  return (
    <svg className="spark" width={values.length * (w + gap)} height={h} role="img" aria-label={label} focusable="false">
      {values.map((v, i) => {
        const bar = v > 0 ? Math.max(1.5, (v / max) * h) : 0;
        return v > 0
          ? <rect key={i} x={i * (w + gap)} y={h - bar} width={w} height={bar} rx={0.5} />
          : <rect key={i} className="gap" x={i * (w + gap)} y={h - 1} width={w} height={1} />;
      })}
    </svg>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit && git add src/components/Sparkline.tsx && git commit -m "Add the daily-volume sparkline"
```

---

### Task 6: The Prospects page

**Files:**
- Create: `src/components/Prospects.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-5, plus `useData` from `store.ts`, `useTypeName` from `common.tsx`, `addToWatchlist`/`startPosition` from `actions.ts`, `navigate` from `hooks.ts`, formatters from `format.ts`, `resolveNames` from `market.ts`

- [ ] **Step 1: Implement the page**

Structure, following `Watchlist.tsx` and `Positions.tsx`:

- `page-head` with `h1` "Prospects" and a paragraph explaining the funnel and the gate in plain English.
- A `card` of filter fields (budget, min trades/day, min days traded, min return) using the existing `.fields`/`.field` classes, with a primary Scan button and a Stop button while running.
- Progress: when `phase !== 'idle'`, a `.notice` with the stage message, `done/total`, and the `.spinner`. When done, a coverage line: "Checked N of ~M candidates — scan again to widen the net."
- An `.empty` state before the first scan explaining what the scan will do and roughly how long it takes.
- Results in a `.table-wrap > table.data.wide`: Item, Return, Net per unit, Trades/day, Days traded, 30-day volume (Sparkline), ISK/day, Capital, Flags, Actions.
- Warnings as small pills with `title` text spelling out what each means.
- Row click expands a detail row spanning the table with the numbers behind the score.
- Actions: Calculator (deep link `calculator?type=N`), Watchlist, Start trading — reusing the existing helpers.
- On mount: `loadCache()` into state; re-rank with `useMemo` on cache/settings/filters. After a scan finishes, reload the cache.
- Item names: collect the type ids shown, and for any missing from `d.names`, call `resolveNames` once and `update({ names })`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/Prospects.tsx && git commit -m "Add the Prospects page"
```

---

### Task 7: Route, nav and styles

**Files:**
- Modify: `src/App.tsx`, `src/styles.css`

- [ ] **Step 1: Wire the route**

In `src/App.tsx`: import `Prospects`, add `['prospects', 'Prospects']` to `nav` after `calculator`, and add `: page === 'prospects' ? <Prospects />` to the render chain.

- [ ] **Step 2: Add styles**

Append to `src/styles.css`: `.spark` (fill `var(--accent)`), `.spark .gap` (fill `var(--rule)`), `.flag` pills (small, `var(--surface-2)` background, `var(--warn)` text, rounded), `.detail-row` (background `var(--surface-2)`), and a `.scan` progress line.

- [ ] **Step 3: Build and look at it**

Run: `npm run build && npm run dev`, open the page, run a scan, confirm results appear and the sparklines read correctly.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/styles.css && git commit -m "Route, nav and styles for Prospects"
```

---

### Task 8: End-to-end verification and docs

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-09-24-prospects-design.md`
- Test: a live ESI end-to-end run

- [ ] **Step 1: Run the funnel end to end against live ESI**

```bash
node --input-type=module -e "
import { sampleJita } from './src/lib/market.ts';
import { statsFrom, passesGate, DEFAULT_FILTERS } from './src/lib/prospects.ts';
const s = await sampleJita(12);
const ids = Object.keys(s.counts).map(Number).filter((i) => s.counts[i] >= 4).sort((a,b)=>s.counts[b]-s.counts[a]).slice(0, 60);
let pass = 0, fail = 0;
for (const id of ids) {
  const r = await fetch(\`https://esi.evetech.net/markets/10000002/history/?type_id=\${id}\`, { headers: { 'X-Compatibility-Date': '2026-08-18' } });
  const st = statsFrom(id, await r.json());
  if (st && passesGate(st, DEFAULT_FILTERS)) pass++; else fail++;
}
console.log('of 60 most-listed items,', pass, 'trade consistently and', fail, 'do not');
"
```
Expected: a substantial share rejected — that is the gate working, not a bug. Spot-check a rejection and confirm it really is thin.

- [ ] **Step 2: Update the README**

Add Prospects to the feature list at the top, and a "Limits to know about" bullet covering: the scan samples the order book rather than reading all of it, coverage builds up over repeated scans, and history is one request per item so a run is bounded.

- [ ] **Step 3: Update the spec**

Change the capital gate line to match what was built (budget caps position size, rejects only when it cannot afford one unit).

- [ ] **Step 4: Full verification**

```bash
npm run check && npm run build
```
Expected: `all passed`, then a clean build.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/ && git commit -m "Document Prospects and reconcile the spec"
```
