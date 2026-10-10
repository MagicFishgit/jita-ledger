/**
 * The daily full-market scan: every order in The Forge read once, not a sample of it.
 *
 * A browser's Prospects scan samples the order book (a quick scan 20 of its ~400 pages, a deep one 60) because
 * reading all of it in a tab is slow; the items it finds are then checked properly, but ones it never sampled are
 * missed. The cloud has no tab to keep open, so once a day, after ESI publishes the day's history (11:05 EVE), it
 * reads every page. That one pass gives every Jita order book at once (the best levels, order counts, what the
 * orders have sold, whether NPCs sell it), so there are no book requests per item; history is fetched for every
 * item a trade could pay on, and every item is stored in the shapes the app's own scan uses. Browsers take it as
 * their scan; the five-minute watch keeps the best candidates' prices live between runs.
 *
 * Memory is the constraint (128 MB): a page is folded into small per-item summaries and dropped, and each item's
 * history is turned into stats and dropped.
 */
import type { Book } from '../../src/lib/evaluate';
import { withWatchedHighs, type WatchedExtremes } from '../../src/lib/fills';
import { queueCeiling, SELLS_COUNTED_TO, sellsToOf, statsFrom } from '../../src/lib/prospects';
import type { BookSold } from '../../src/lib/split';
import { tickDown, tickUp } from '../../src/lib/tick';
import type { BookLevel, ProspectStats } from '../../src/lib/types';
import { HEADERS } from './eve';
import { eachHistory } from './hist';
import { dayBoundary, nextScanAt } from './scanTimes';
import { NPC_DURATION } from '../../src/lib/constants';
import { noteRate } from './rate';
import INDUSTRY from '../../src/data/industryTypes.json' with { type: 'json' };
import { foldBpo, npcRowOf, saveNpcRow, type BpoSellers } from './industryNpc';

const THE_FORGE = 10000002;
const JITA_44 = 60003760;
const PLEX = 44992;
const PLEX_MARKET = 19000001;
/** Price levels kept per side, as the app's book summary keeps them. */
const LEVELS = 7;
/**
 * The spread one step inside the best prices must be over this for history to be worth fetching: below it, the
 * broker fees on both sides and the sales tax take it all at anyone's rates (best skills and standings still pay
 * about 4.4%). Checked one step in, not at the raw best, or items at exactly 4% would pass here and drop out a tick later.
 */
export const MIN_GROSS_SPREAD = 0.04;
/** The busiest markets by Jita order count are checked whatever their spread, for Prospects' Busy markets view. */
const BUSIEST = 300;
/**
 * Items whose history is checked at most. On 27 September 2026 about 15,000 items passed the spread gate, so this
 * is every one of them with room to grow; `limits.subrequests` in wrangler.toml allows the requests.
 */
const HISTORY_CAP = 22000;

export type RawOrder = { order_id: number; type_id: number; location_id: number; is_buy_order: boolean; price: number; volume_remain: number; volume_total: number; duration: number;
  issued?: string; min_volume?: number; range?: string };
/**
 * One item's Jita book as the pages are read. `deep` is every sell price within SELLS_COUNTED_TO times the best ask (price
 * → units), for counting the whole queue (`sellsTo`): the seven levels alone held 2,781 of the Arbalest's 5,170 units up
 * to where trading reached on 2 October 2026.
 */
export type Agg = { buys: BookLevel[]; sells: BookLevel[]; buyOrders: number; sellOrders: number; sold: Required<BookSold>; npcSell: boolean; deep: Map<number, number> };

/** Adds an order to the best LEVELS levels on its side. A level dropped is worse than every level kept, and so is anything at its price later. */
function addLevel(levels: BookLevel[], price: number, volume: number, isBuy: boolean) {
  const at = levels.find((l) => l.price === price);
  if (at) { at.volume += volume; return; }
  const better = (a: number, b: number) => (isBuy ? a > b : a < b);
  if (levels.length >= LEVELS && !better(price, levels[levels.length - 1].price)) return;
  levels.push({ price, volume });
  levels.sort((a, b) => (isBuy ? b.price - a.price : a.price - b.price));
  if (levels.length > LEVELS) levels.pop();
}

/**
 * Keeps a sell price for the whole-queue count, if it's within SELLS_COUNTED_TO times the best ask. The best only falls as
 * pages come in, so a price dropped was over that bound then and is over it at the end: what's kept at the end is every
 * listing up to SELLS_COUNTED_TO times the final best ask, whatever order the pages came in.
 */
function addDeep(a: Agg, price: number, volume: number, wasBest: number | undefined) {
  const best = a.sells[0].price;
  if (price > SELLS_COUNTED_TO * best) return;
  a.deep.set(price, (a.deep.get(price) ?? 0) + volume);
  // A new best ask: let go of what's now past the bound.
  if (wasBest != null && best < wasBest) for (const p of a.deep.keys()) if (p > SELLS_COUNTED_TO * best) a.deep.delete(p);
}

function fold(aggs: Map<number, Agg>, o: RawOrder) {
  let a = aggs.get(o.type_id);
  if (!a) {
    a = { buys: [], sells: [], buyOrders: 0, sellOrders: 0, sold: { sell: 0, buy: 0, single: { sell: 0, buy: 0 }, orders: { sell: 0, buy: 0 } }, npcSell: false, deep: new Map() };
    aggs.set(o.type_id, a);
  }
  const side = o.is_buy_order ? 'buy' : 'sell';
  if (o.is_buy_order) a.buyOrders++; else a.sellOrders++;
  const wasBest = a.sells[0]?.price;
  addLevel(o.is_buy_order ? a.buys : a.sells, o.price, o.volume_remain, o.is_buy_order);
  if (!o.is_buy_order) addDeep(a, o.price, o.volume_remain, wasBest);
  // What the live orders have already sold, as `soldFrom` counts it, one order at a time.
  const total = o.volume_total ?? o.volume_remain;
  a.sold[side] += Math.max(0, total - o.volume_remain);
  a.sold.orders[side]++;
  if (total === 1) a.sold.single[side]++;
  if (!o.is_buy_order && (o.duration ?? 0) >= NPC_DURATION) a.npcSell = true;
}

/**
 * NPC sell orders anywhere in The Forge, by item: the lowest price. NPCs sell most skill books, and many other things, at
 * fixed prices in stations other than Jita 4-4, so Jita's own book (`npcSell`) never shows them, and a Jita listing over
 * that price waits on buyers who won't travel.
 */
function foldNpc(npc: Map<number, number>, o: RawOrder) {
  if (o.is_buy_order || (o.duration ?? 0) < NPC_DURATION) return;
  const was = npc.get(o.type_id);
  if (was == null || o.price < was) npc.set(o.type_id, o.price);
}

/**
 * Every order on a page: Jita's into the item's book, NPC sellers anywhere into `npc`, and NPCs' sell orders of the Industry
 * tab's blueprints, by station, into `bpos`. Exported to measure the fold.
 */
export function foldPage(aggs: Map<number, Agg>, npc: Map<number, number>, orders: RawOrder[], bpos?: { want: ReadonlySet<number>; out: BpoSellers }) {
  for (const o of orders) {
    foldNpc(npc, o);
    if (bpos) foldBpo(bpos.out, bpos.want, o);
    if (o.location_id === JITA_44) fold(aggs, o);
  }
}

/** The Industry tab's watch set and the blueprints whose NPC sellers it shows (src/data/industryTypes.json). */
export type IndustryTypes = { watch: number[]; bpos: number[] };

/**
 * The book summary kept for an item, as Prospects reads it: the seven levels a side, order counts, what the live orders
 * sold, whether NPCs sell it in Jita, NPCs' lowest price anywhere in The Forge (`npcAt`), and the whole sell queue up to
 * where trading reaches (`sellsTo`) where the seven levels all sit under it and so can't say how deep it goes
 * (`listedQueue`). Elsewhere the levels already reach past the ceiling and are exact. The ceiling is worked out as the
 * browser and the alert round do, with the watched highs folded in.
 */
export function summaryOf(a: Agg, stats: ProspectStats, at: string, npcAt: number | undefined, watched: WatchedExtremes | undefined): Book {
  const book = plainBook(a, at);
  if (npcAt != null) book.npcAnywhere = npcAt;
  const highs = stats.highs14 && stats.lowsEnd ? withWatchedHighs(stats.highs14, stats.lowsEnd, watched) : stats.highs14;
  const ceiling = highs ? queueCeiling(highs) : null;
  if (ceiling != null && a.sells.length >= LEVELS && a.sells[LEVELS - 1].price <= ceiling) book.sellsTo = sellsToOf(a.deep, a.sells[0].price, ceiling);
  return book;
}

/** The summary without the scan's notes: the seven levels a side, order counts, what the live orders sold, NPCs in Jita. */
export function plainBook(a: Agg, at: string): Book {
  return {
    at, bestBuy: a.buys[0]?.price ?? null, bestSell: a.sells[0]?.price ?? null,
    buyOrders: a.buyOrders, sellOrders: a.sellOrders, topBuys: a.buys, topSells: a.sells, npcSell: a.npcSell, sold: a.sold,
  };
}

/**
 * Each watched item's highest sale per day (D1's `flow`, from the five-minute watch), for working out the queue's ceiling
 * as the browser and the alert round do: with the watched highs folded in, the Arbalest's ceiling was 62,910 on 2 October
 * 2026, without them 60,950.
 */
async function watchedHighs(db: D1Database, now: number): Promise<Map<number, WatchedExtremes>> {
  const since = new Date(now - 15 * 86400_000).toISOString().slice(0, 10);
  const rows = (await db.prepare('SELECT type_id, day, sell_high FROM flow WHERE day >= ?1 AND sell_high IS NOT NULL').bind(since)
    .all<{ type_id: number; day: string; sell_high: number }>()).results;
  const out = new Map<number, WatchedExtremes>();
  for (const r of rows) {
    let m = out.get(r.type_id);
    if (!m) { m = {}; out.set(r.type_id, m); }
    m[r.day] = { sellHigh: r.sell_high };
  }
  return out;
}

export async function page(url: string): Promise<{ orders: RawOrder[]; pages: number; expires?: string | null }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    noteRate(res.headers);
    if (res.ok) return { orders: (await res.json()) as RawOrder[], pages: Number(res.headers.get('X-Pages') ?? 1) || 1, expires: res.headers.get('Expires') };
    await res.body?.cancel();
    if (attempt >= 2) throw new Error(`ESI ${res.status} on ${url}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export type ScanMeta = {
  at: string; startedAt: string; seconds: number; pages: number; pagesFailed: number;
  jitaTypes: number; twoSided: number; gated: number; checked: number; kept: number;
  history: { cached: number; fetched: number; failed: number; remaining: number };
  /** Stopped at the time budget with history still to fetch: the next hourly run carries on. */
  partial: boolean;
  /** Of `checked`, the Industry tab's watch set read only for it (`watchOnly` on their stats). Absent on runs before it. */
  watchOnly?: number;
};

/** Where a running scan has got to, for Settings. */
export type ScanProgress = { phase: 'pages' | 'history' | 'saving'; done: number; total: number; startedAt: string; updatedAt: string };

/**
 * A run stops starting history fetches after this long and saves what it has: a scheduled run is stopped at 15
 * minutes. Histories already fetched are kept until ESI's next day, so the next hourly run only fetches the rest.
 */
const TIME_BUDGET = 11 * 60_000;

async function writeProgress(db: D1Database, p: ScanProgress | null) {
  if (!p) { await db.prepare(`DELETE FROM scan_meta WHERE key = 'progress'`).run(); return; }
  await db.prepare('INSERT INTO scan_meta (key, data) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET data = excluded.data').bind('progress', JSON.stringify(p)).run();
}

/**
 * One full scan. Returns what it covered; the caller records it. `summarise` is `summaryOf`, given only to test that a
 * throw in it stores the item's plain book rather than stopping the run.
 */
export async function fullScan(db: D1Database, now = Date.now(), summarise = summaryOf, industry: IndustryTypes = INDUSTRY as IndustryTypes): Promise<ScanMeta> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  // Progress for Settings, written at most every ten seconds and on each change of phase.
  let lastWrite = 0, lastPhase = '';
  const progress = async (phase: ScanProgress['phase'], done: number, total: number) => {
    if (phase === lastPhase && Date.now() - lastWrite < 10_000) return;
    lastWrite = Date.now(); lastPhase = phase;
    await writeProgress(db, { phase, done, total, startedAt, updatedAt: new Date().toISOString() }).catch(() => undefined);
  };
  const aggs = new Map<number, Agg>();
  const npc = new Map<number, number>();
  const bpos = { want: new Set(industry.bpos), out: new Map() as BpoSellers };
  const base = `https://esi.evetech.net/markets/${THE_FORGE}/orders/?order_type=all`;
  const first = await page(`${base}&page=1`);
  foldPage(aggs, npc, first.orders, bpos);
  let pagesFailed = 0, next = 2, pagesDone = 1;
  await progress('pages', 1, first.pages);
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next <= first.pages) {
      const p = next++;
      try {
        const { orders } = await page(`${base}&page=${p}`);
        foldPage(aggs, npc, orders, bpos);
      } catch { pagesFailed++; }
      await progress('pages', ++pagesDone, first.pages);
    }
  }));
  // PLEX trades on its own global market, not in The Forge.
  try {
    const plexBase = `https://esi.evetech.net/markets/${PLEX_MARKET}/orders/?order_type=all&type_id=${PLEX}`;
    const p1 = await page(`${plexBase}&page=1`);
    const plexOrders = [...p1.orders];
    for (let p = 2; p <= Math.min(p1.pages, 10); p++) plexOrders.push(...(await page(`${plexBase}&page=${p}`)).orders);
    aggs.delete(PLEX);
    for (const o of plexOrders) fold(aggs, { ...o, type_id: PLEX, location_id: JITA_44 });
  } catch { /* PLEX left out today */ }
  const run = started;
  // The Industry tab's NPC sellers of every blueprint it ranks, whatever the gate below: saved even when the history stops at
  // the time budget, since the pages are all read by now (or the row says how many weren't).
  await saveNpcRow(db, run, npcRowOf(bpos.out, now, pagesFailed)).catch((e) => console.error('industry npc row failed', e));

  // Which items a trade could pay on, plus the busiest for the Busy markets view. NPC-sold items can't be traded.
  const twoSided = [...aggs.entries()].filter(([, a]) => a.buyOrders > 0 && a.sellOrders > 0 && !a.npcSell);
  const gated = twoSided.filter(([, a]) => tickDown(a.sells[0].price) / tickUp(a.buys[0].price) - 1 > MIN_GROSS_SPREAD).map(([t]) => t);
  const busiest = [...twoSided].sort((x, y) => (y[1].buyOrders + y[1].sellOrders) - (x[1].buyOrders + x[1].sellOrders)).slice(0, BUSIEST).map(([t]) => t);
  const candidates = [...new Set([...busiest, ...gated])]
    .sort((x, y) => (aggs.get(y)!.buyOrders + aggs.get(y)!.sellOrders) - (aggs.get(x)!.buyOrders + aggs.get(x)!.sellOrders))
    .slice(0, HISTORY_CAP);
  // The Industry tab's watch set (every Tech I product and its materials) with a Jita book, whatever the gate above (traded
  // one way only, or NPC-sold in Jita): read for the tab and marked `watchOnly` on their stats, so Prospects, Busy markets,
  // the planner, the opportunity mail, the Sniper and Hub arbitrage leave them out. One with no Jita order gets no row.
  // Appended after the candidates, so a run that hits the time budget drops these first and never a trading candidate.
  const natural = new Set(candidates);
  const watchOnly = new Set(industry.watch.filter((t) => aggs.has(t) && !natural.has(t)));
  const all = [...candidates, ...watchOnly];

  const at = new Date(now).toISOString();
  const put = db.prepare(`INSERT INTO scan_items (type_id, stats, book, orders, run) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(type_id) DO UPDATE SET stats = excluded.stats, book = excluded.book, orders = excluded.orders, run = excluded.run`);
  let stmts: D1PreparedStatement[] = [];
  let kept = 0;
  const flush = async () => { if (stmts.length) { const s = stmts; stmts = []; await db.batch(s); } };
  const pending: Promise<void>[] = [];
  let seen = 0;
  const watched = await watchedHighs(db, now).catch(() => new Map<number, WatchedExtremes>());
  await progress('history', 0, all.length);
  const history = await eachHistory(db, all, now, (t, rows) => {
    seen++;
    pending.push(progress('history', seen, all.length));
    const stats = statsFrom(t, rows, now);
    const a = aggs.get(t);
    if (!stats || !a) { a?.deep.clear(); return; }
    if (watchOnly.has(t)) stats.watchOnly = true;
    // A throw in the summary (none seen) stores the plain book, without the scan's notes, rather than stopping the run:
    // the hourly carry-on would stop at the same item every hour.
    let book: Book;
    try { book = summarise(a, stats, at, npc.get(t), watched.get(t)); } catch { book = plainBook(a, at); }
    // Every sell price within twice the best ask was kept only for that count: ~9 MB over the scan, let go item by item.
    a.deep.clear();
    stmts.push(put.bind(t, JSON.stringify(stats), JSON.stringify(book), a.buyOrders + a.sellOrders, run));
    if (!watchOnly.has(t)) kept++;
    if (stmts.length >= 100) pending.push(flush());
  }, { concurrency: 24, deadline: started + TIME_BUDGET });
  await Promise.all(pending);
  await progress('saving', seen, all.length);
  await flush();
  // Items today's scan no longer lists go, but only after a complete scan that read the market: a failed read or a
  // run stopped at its time budget keeps what was there.
  const partial = history.remaining > 0;
  if (!partial && pagesFailed < first.pages / 10) await db.prepare('DELETE FROM scan_items WHERE run != ?1').bind(run).run();

  const meta: ScanMeta = {
    at: new Date().toISOString(), startedAt: new Date(started).toISOString(), seconds: Math.round((Date.now() - started) / 1000),
    pages: first.pages, pagesFailed, jitaTypes: aggs.size, twoSided: twoSided.length, gated: gated.length,
    checked: all.length, kept, history, partial, watchOnly: watchOnly.size,
  };
  await db.prepare('INSERT INTO scan_meta (key, data) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET data = excluded.data').bind('scan', JSON.stringify(meta)).run();
  await writeProgress(db, null);
  return meta;
}

/** When a day's scan is due: after the history published at 11:05 EVE, once per day, never two at once. */
export async function scanDue(db: D1Database, now = Date.now()): Promise<boolean> {
  const row = await db.prepare(`SELECT last_run, last_ok FROM jobs WHERE char_id = 0 AND job = 'scan'`).first<{ last_run: number; last_ok: number | null }>();
  if (!row) return true;
  // One still running (started within 20 minutes and not finished) is left alone.
  if ((row.last_ok ?? 0) < row.last_run && now - row.last_run < 20 * 60_000) return false;
  // One stopped at its time budget carries on at the next run.
  const meta = await db.prepare(`SELECT data FROM scan_meta WHERE key = 'scan'`).first<{ data: string }>();
  if (meta && (JSON.parse(meta.data) as ScanMeta).partial) return true;
  return (row.last_ok ?? 0) < dayBoundary(now);
}

/**
 * For Settings: the last scan, where a running one has got to, and when the next is due. The daily run is at
 * 11:25 EVE; one missed, or stopped at its time budget, is caught up at the next hourly check (:07).
 */
export async function scanStatus(db: D1Database, now = Date.now()) {
  const rows = (await db.prepare(`SELECT key, data FROM scan_meta WHERE key IN ('scan', 'progress')`).all<{ key: string; data: string }>()).results;
  const last = rows.find((r) => r.key === 'scan');
  const prog = rows.find((r) => r.key === 'progress');
  const job = await db.prepare(`SELECT last_run, last_ok, last_error FROM jobs WHERE char_id = 0 AND job = 'scan'`).first<{ last_run: number; last_ok: number | null; last_error: string | null }>();
  const progress = prog ? JSON.parse(prog.data) as ScanProgress : null;
  // A run that stopped writing progress minutes ago was cut short.
  const running = !!progress && now - Date.parse(progress.updatedAt) < 3 * 60_000;
  const due = await scanDue(db, now);
  return {
    last: last ? JSON.parse(last.data) as ScanMeta : null,
    progress: running ? progress : null,
    next: new Date(nextScanAt(now, due, running)).toISOString(),
    lastError: job && job.last_error && (job.last_ok ?? 0) < job.last_run ? job.last_error : null,
  };
}

/** Marks a scan as started, so an overlapping invocation skips it. */
export async function markScanStarted(db: D1Database, now = Date.now()) {
  await db.prepare(`INSERT INTO jobs (char_id, job, last_run) VALUES (0, 'scan', ?1) ON CONFLICT(char_id, job) DO UPDATE SET last_run = excluded.last_run`).bind(now).run();
}

/**
 * The scan for a browser to take, `{ meta, items: [[typeId, stats, book, orders], …] }`, streamed: about 1.3 KB an
 * item, 20 MB for 15,000, written from the stored JSON as it is rather than parsed and rebuilt, so the Worker
 * never holds the whole thing. Null when no scan has run.
 */
export async function scanStream(db: D1Database): Promise<ReadableStream<Uint8Array> | null> {
  const meta = await db.prepare(`SELECT data FROM scan_meta WHERE key = 'scan'`).first<{ data: string }>();
  if (!meta) return null;
  const enc = new TextEncoder();
  let after = -1, started = false, first = true, done = false;
  return new ReadableStream<Uint8Array>({
    async pull(ctl) {
      if (done) { ctl.close(); return; }
      let out = started ? '' : `{"meta":${meta.data},"items":[`;
      started = true;
      const rows = (await db.prepare('SELECT type_id, stats, book, orders FROM scan_items WHERE type_id > ?1 ORDER BY type_id LIMIT 1000').bind(after)
        .all<{ type_id: number; stats: string; book: string; orders: number }>()).results;
      for (const r of rows) { out += `${first ? '' : ','}[${r.type_id},${r.stats},${r.book},${r.orders}]`; first = false; }
      if (rows.length) after = rows[rows.length - 1].type_id;
      if (rows.length < 1000) { out += ']}'; done = true; }
      ctl.enqueue(enc.encode(out));
    },
  });
}
