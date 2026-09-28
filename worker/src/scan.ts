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
import { statsFrom } from '../../src/lib/prospects';
import type { BookSold } from '../../src/lib/split';
import { tickDown, tickUp } from '../../src/lib/tick';
import type { BookLevel } from '../../src/lib/types';
import { HEADERS } from './eve';
import { eachHistory } from './hist';
import { dayBoundary, nextScanAt } from './scanTimes';

const THE_FORGE = 10000002;
const JITA_44 = 60003760;
const PLEX = 44992;
const PLEX_MARKET = 19000001;
/** Price levels kept per side, as the app's book summary keeps them. */
const LEVELS = 7;
/** NPC orders run for a year; a player's for 90 days at most. */
const NPC_DURATION = 365;
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
type Agg = { buys: BookLevel[]; sells: BookLevel[]; buyOrders: number; sellOrders: number; sold: Required<BookSold>; npcSell: boolean };

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

function fold(aggs: Map<number, Agg>, o: RawOrder) {
  let a = aggs.get(o.type_id);
  if (!a) {
    a = { buys: [], sells: [], buyOrders: 0, sellOrders: 0, sold: { sell: 0, buy: 0, single: { sell: 0, buy: 0 }, orders: { sell: 0, buy: 0 } }, npcSell: false };
    aggs.set(o.type_id, a);
  }
  const side = o.is_buy_order ? 'buy' : 'sell';
  if (o.is_buy_order) a.buyOrders++; else a.sellOrders++;
  addLevel(o.is_buy_order ? a.buys : a.sells, o.price, o.volume_remain, o.is_buy_order);
  // What the live orders have already sold, as `soldFrom` counts it, one order at a time.
  const total = o.volume_total ?? o.volume_remain;
  a.sold[side] += Math.max(0, total - o.volume_remain);
  a.sold.orders[side]++;
  if (total === 1) a.sold.single[side]++;
  if (!o.is_buy_order && (o.duration ?? 0) >= NPC_DURATION) a.npcSell = true;
}

export async function page(url: string): Promise<{ orders: RawOrder[]; pages: number; expires?: string | null }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
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

/** One full scan. Returns what it covered; the caller records it. */
export async function fullScan(db: D1Database, now = Date.now()): Promise<ScanMeta> {
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
  const base = `https://esi.evetech.net/markets/${THE_FORGE}/orders/?order_type=all`;
  const first = await page(`${base}&page=1`);
  for (const o of first.orders) if (o.location_id === JITA_44) fold(aggs, o);
  let pagesFailed = 0, next = 2, pagesDone = 1;
  await progress('pages', 1, first.pages);
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next <= first.pages) {
      const p = next++;
      try {
        const { orders } = await page(`${base}&page=${p}`);
        for (const o of orders) if (o.location_id === JITA_44) fold(aggs, o);
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

  // Which items a trade could pay on, plus the busiest for the Busy markets view. NPC-sold items can't be traded.
  const twoSided = [...aggs.entries()].filter(([, a]) => a.buyOrders > 0 && a.sellOrders > 0 && !a.npcSell);
  const gated = twoSided.filter(([, a]) => tickDown(a.sells[0].price) / tickUp(a.buys[0].price) - 1 > MIN_GROSS_SPREAD).map(([t]) => t);
  const busiest = [...twoSided].sort((x, y) => (y[1].buyOrders + y[1].sellOrders) - (x[1].buyOrders + x[1].sellOrders)).slice(0, BUSIEST).map(([t]) => t);
  const candidates = [...new Set([...busiest, ...gated])]
    .sort((x, y) => (aggs.get(y)!.buyOrders + aggs.get(y)!.sellOrders) - (aggs.get(x)!.buyOrders + aggs.get(x)!.sellOrders))
    .slice(0, HISTORY_CAP);

  const run = started;
  const at = new Date(now).toISOString();
  const put = db.prepare(`INSERT INTO scan_items (type_id, stats, book, orders, run) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(type_id) DO UPDATE SET stats = excluded.stats, book = excluded.book, orders = excluded.orders, run = excluded.run`);
  let stmts: D1PreparedStatement[] = [];
  let kept = 0;
  const flush = async () => { if (stmts.length) { const s = stmts; stmts = []; await db.batch(s); } };
  const pending: Promise<void>[] = [];
  let seen = 0;
  await progress('history', 0, candidates.length);
  const history = await eachHistory(db, candidates, now, (t, rows) => {
    seen++;
    pending.push(progress('history', seen, candidates.length));
    const stats = statsFrom(t, rows, now);
    const a = aggs.get(t);
    if (!stats || !a) return;
    const book: Book = {
      at, bestBuy: a.buys[0]?.price ?? null, bestSell: a.sells[0]?.price ?? null,
      buyOrders: a.buyOrders, sellOrders: a.sellOrders, topBuys: a.buys, topSells: a.sells, npcSell: a.npcSell, sold: a.sold,
    };
    stmts.push(put.bind(t, JSON.stringify(stats), JSON.stringify(book), a.buyOrders + a.sellOrders, run));
    kept++;
    if (stmts.length >= 100) pending.push(flush());
  }, { concurrency: 24, deadline: started + TIME_BUDGET });
  await Promise.all(pending);
  await progress('saving', seen, candidates.length);
  await flush();
  // Items today's scan no longer lists go, but only after a complete scan that read the market: a failed read or a
  // run stopped at its time budget keeps what was there.
  const partial = history.remaining > 0;
  if (!partial && pagesFailed < first.pages / 10) await db.prepare('DELETE FROM scan_items WHERE run != ?1').bind(run).run();

  const meta: ScanMeta = {
    at: new Date().toISOString(), startedAt: new Date(started).toISOString(), seconds: Math.round((Date.now() - started) / 1000),
    pages: first.pages, pagesFailed, jitaTypes: aggs.size, twoSided: twoSided.length, gated: gated.length,
    checked: candidates.length, kept, history, partial,
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
