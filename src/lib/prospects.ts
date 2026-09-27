import type { BookLevel, HistRow, ProspectFilters, ProspectStats, ProspectWarning } from './types';
import { buyerShare } from './split';
import { askReachDays, bidReachDays, FILL_RARE, reachedAsk, reachedBid, recentRange } from './fills';
import { tickDown, tickUp } from './tick';

const DAY = 86400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const startOf = (t: number) => Date.parse(dayKey(t) + 'T00:00:00Z');

/** Middle value, or the mean of the middle two. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Average units a day and volume-weighted price over the last `days` calendar days of history.
 *
 * ESI leaves out days with no trades, so dividing by the rows present would spread seven trading days
 * from the last two months over one week and overstate a thin item's pace many times over. The
 * divisor is the number of days in the window. The window ends on the latest day ESI has published
 * when the item traded then (history runs a day behind, sometimes two before the daily update), and on
 * yesterday otherwise. No history at all is null, not zero: we don't know.
 */
export function recentAverages(rows: HistRow[], days = 7, now = Date.now()): { avgVol: number | null; avgPrice: number | null } {
  if (!rows.length) return { avgVol: null, avgPrice: null };
  const today = startOf(now);
  const last = Date.parse(rows[rows.length - 1].date + 'T00:00:00Z');
  const end = last >= today - 2 * DAY && last < today ? last : today - DAY;
  const from = end - (days - 1) * DAY;
  const recent = rows.filter((r) => { const t = Date.parse(r.date + 'T00:00:00Z'); return t >= from && t <= end; });
  const vol = recent.reduce((s, r) => s + r.volume, 0);
  const val = recent.reduce((s, r) => s + r.volume * r.average, 0);
  return { avgVol: vol / days, avgPrice: vol > 0 ? val / vol : null };
}

/**
 * Units a typical day trades: the median over the last `days` calendar days, days with no trades
 * counting as zero. Unlike an average, one enormous day (often your own buying) can't inflate it.
 */
export function typicalDailyVolume(rows: HistRow[], days = 14, now = Date.now()): number | null {
  if (!rows.length) return null;
  const today = startOf(now);
  const last = Date.parse(rows[rows.length - 1].date + 'T00:00:00Z');
  const end = last >= today - 2 * DAY && last < today ? last : today - DAY;
  const byDay = new Map(rows.map((r) => [r.date, r.volume]));
  const vols: number[] = [];
  for (let i = 0; i < days; i++) vols.push(byDay.get(dayKey(end - i * DAY)) ?? 0);
  return median(vols);
}

/**
 * Units a day to expect when judging how fast something sells: the typical day (median of 14), which
 * against the Jita books was closer than the week's average (a median 0.82 of what traded, against 0.6).
 * But an item that trades on fewer than half its days has a median of zero, and it does sell: then the
 * 14-day average over calendar days stands in.
 */
export function paceDay(rows: HistRow[], now = Date.now()): number | null {
  const typical = typicalDailyVolume(rows, 14, now);
  if (typical == null) return null;
  return typical > 0 ? typical : recentAverages(rows, 14, now).avgVol;
}

/**
 * Reduce ESI's daily history to the handful of numbers a screener needs.
 *
 * The window is the 30 complete days ending yesterday: today's history is still filling and
 * ESI runs about a day behind. ESI leaves days with no trades out of the response entirely,
 * so a gap is not missing data — it is a day nothing sold, which is exactly what we came to
 * measure. Returns null when nothing traded in the window, the honest answer for a dead item.
 */
export function statsFrom(typeId: number, rows: HistRow[], now = Date.now()): ProspectStats | null {
  const end = startOf(now - DAY);
  const within = (r: HistRow, days: number) => {
    const t = Date.parse(r.date + 'T00:00:00Z');
    return t >= end - (days - 1) * DAY && t <= end;
  };

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

  const unitsPerDay = median(vols);
  // The last week of the window, oldest first, for the margin line and the spike check.
  const recent = [...w30].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const usualPrice = median(w30.map((r) => r.average));
  const spike = recent.some((r) =>
    unitsPerDay > 0 && r.volume > SPIKE_VOLUME * unitsPerDay &&
    usualPrice > 0 && Math.abs(r.average / usualPrice - 1) > SPIKE_PRICE);

  const lows = recentRange(rows, 14, now);
  // The latest day's average against the median of the days before it: a price level that has just shifted,
  // which makes a spread between the old level and the new one look like margin.
  const sorted = [...w30].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const before = sorted.slice(-14, -1).map((r) => r.average);
  const usualBefore = before.length >= 5 ? median(before) : 0;
  const lastMove = latest && within(latest, 3) && usualBefore > 0 ? latest.average / usualBefore - 1 : 0;
  return {
    typeId,
    at: new Date(now).toISOString(),
    daysTraded: Math.min(30, w30.length),
    tradesPerDay: median(w30.map((r) => r.order_count)),
    unitsPerDay,
    spikiness: total > 0 ? Math.max(...vols) / total : 1,
    dailyRange: median(w30.map((r) => (r.average > 0 ? (r.highest - r.lowest) / r.average : 0))),
    trend: avg90 > 0 ? avg30 / avg90 - 1 : 0,
    avgPrice: avg30,
    spark,
    buyerShare: buyerShare(w30),
    high30: Math.max(...w30.map((r) => r.highest)),
    spike,
    range7: recent.map((r) => (r.average > 0 ? (r.highest - r.lowest) / r.average : 0)),
    lows14: lows.lows,
    lowsEnd: lows.end,
    highs14: lows.highs,
    lastMove,
  };
}

/**
 * The latest day's average this far from the days before it, up or down, and the price has moved rather than
 * wobbled. True Sansha EM Armor Hardener went from about 3.6 M to 7.5 M; the scan showed a 59% flip buying at the
 * old level and selling at the new, with both prices "reached" on days that traded from 3 M to 9 M.
 */
export const MOVED = 0.5;

/** A day counts as a spike when it trades this many times the usual volume... */
export const SPIKE_VOLUME = 5;
/** ...at an average this far from the usual price. Volume alone is just a busy day. */
export const SPIKE_PRICE = 0.1;
/** A best bid this far above the highest trade of the month is bait, not a market. */
export const ESCROW_OVER = 0.1;
/** The best price holding more than this share of the stock visible on its side... */
export const WALL_SHARE = 0.5;
/** ...and more than this many days of the item's whole daily volume, is a wall. */
export const WALL_DAYS = 3;

/**
 * Page 1 plus distinct random others. Page 1 is always in, because it has to be fetched
 * anyway to learn how many pages there are.
 */
export function pickPages(total: number, want: number, rnd: () => number = Math.random): number[] {
  const pool = Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 2);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [1, ...pool.slice(0, Math.max(0, Math.min(want, total) - 1))];
}

/** When a quick and a deep scan last ran to the end. */
export type ScanRuns = { quick?: string; deep?: string; /** The cloud's daily full-market scan. */ cloud?: string };
/** Scan data older than this is a bit stale: prices and volumes have moved. */
export const SCAN_STALE_HOURS = 6;
/** Older than this, it's old: trading history refreshes daily. */
export const SCAN_OLD_HOURS = 24;
/** A deep scan older than this, or none at all, is worth running again: it checks every candidate. */
export const DEEP_STALE_DAYS = 7;
/**
 * The cloud's full-market scan runs once a day, after the day's history, and the five-minute watch keeps its best
 * candidates' prices live between runs, so it's fresh for a day and a bit (a scan finishing late, a missed day).
 */
export const CLOUD_FRESH_HOURS = 30;

export type ScanFreshness = {
  level: 'none' | 'fresh' | 'stale' | 'old';
  /** When the data was last refreshed by a finished scan, or by the last pricing for a scan from before this was kept. */
  last: string | null;
  lastDepth: 'quick' | 'deep' | 'cloud' | null;
  deepAt: string | null;
  deepStale: boolean;
};

/**
 * How current the Prospects data is, for the pages that work from it (the planner, hub arbitrage, the
 * slot-swap suggestions on Orders). `fallback` is the newest price in the cache, for a scan run before
 * finishing times were kept: better than calling it "never".
 */
export function scanFreshness(runs: ScanRuns | undefined, fallback: string | null, now = Date.now()): ScanFreshness {
  const finished = [runs?.quick, runs?.deep, runs?.cloud].filter((x): x is string => !!x).sort();
  const last = finished.pop() ?? fallback ?? null;
  const hours = last ? (now - Date.parse(last)) / 3600_000 : null;
  const cloud = !!last && last === runs?.cloud;
  const [fresh, old] = cloud ? [CLOUD_FRESH_HOURS, CLOUD_FRESH_HOURS + SCAN_OLD_HOURS] : [SCAN_STALE_HOURS, SCAN_OLD_HOURS];
  const level = hours == null ? 'none' : hours < fresh ? 'fresh' : hours < old ? 'stale' : 'old';
  const deepAt = runs?.deep ?? null;
  // A full-market scan covers more than a deep one: a recent one leaves nothing for a deep scan to add.
  const cloudRecent = !!runs?.cloud && (now - Date.parse(runs.cloud)) / 86400_000 <= DEEP_STALE_DAYS;
  return {
    level, last,
    lastDepth: cloud ? 'cloud' : last && last === runs?.deep ? 'deep' : last && last === runs?.quick ? 'quick' : null,
    deepAt,
    deepStale: !cloudRecent && (!deepAt || (now - Date.parse(deepAt)) / 86400_000 > DEEP_STALE_DAYS),
  };
}

/**
 * The horizons offered, in days: 4 and 12 hours and a day for fast flips, then longer. Null is "any":
 * nothing is left out for being slow, and slow is flagged. Speeds come from daily volume, so an hour
 * horizon means "busy enough to flip this fast on an average day", not a promise it fills in 4 hours.
 */
export const HORIZONS: (number | null)[] = [4 / 24, 12 / 24, 1, 3, 7, 14, 30, null];

/** A horizon as a person would say it: "4 hours", "a day", "3 days". */
export function horizonSaid(days: number): string {
  if (days < 1) { const h = Math.round(days * 24); return `${h} hour${h === 1 ? '' : 's'}`; }
  return days === 1 ? 'a day' : `${+days.toFixed(1)} days`;
}
/** Short, for a button: "4 h", "1 d". */
export const horizonShort = (days: number) => (days < 1 ? `${Math.round(days * 24)} h` : `${+days.toFixed(1)} d`);
/** A position that takes longer than this to buy in and sell out ties ISK up for weeks, and says so. */
export const SLOW_DAYS = 30;
/** A saved horizon that isn't one of the choices (typed in before they existed) snaps to the nearest one. */
export function snapHorizon(days: number | null | undefined): number | null {
  if (days === null) return null;
  if (days == null || !Number.isFinite(days) || days <= 0) return DEFAULT_FILTERS.horizonDays;
  // Nearest by ratio, not difference: 5 days is nearer 7 than 3 in the way a person means it, and a
  // tenth of a day must not snap to a day.
  const opts = HORIZONS.filter((h): h is number => h != null);
  const off = (h: number) => Math.abs(Math.log(h / days));
  return opts.reduce((best, h) => (off(h) < off(best) ? h : best), opts[0]);
}

export const DEFAULT_FILTERS: ProspectFilters = {
  budget: 250_000_000,
  horizonDays: 3,
  minTrades: 5,
  minDays: 20,
  minRoi: 0.03,
  maxSpikiness: 0.5,
  demoteFlagged: false,
};

/**
 * Does this item change hands often enough, and steadily enough, to trade every day?
 *
 * spikiness is the one that earns its keep. An item can move 30,000 units in a month and
 * still be no use to you if it all went on a single day; days traded alone waves that through.
 */
export function passesGate(
  s: Pick<ProspectStats, 'daysTraded' | 'tradesPerDay' | 'spikiness'>,
  f: ProspectFilters,
): boolean {
  return s.daysTraded >= f.minDays && s.tradesPerDay >= f.minTrades && s.spikiness <= f.maxSpikiness;
}

/**
 * The bid you'd actually place. One legal step above the best, unless the bulk of trading hasn't been
 * getting down there (reached on fewer than FILL_RARE of the last 14 days): then it's where trading did
 * reach on half of them. A best bid nobody sells into is not a price you can buy at. Without the lows
 * (stats cached before they were kept) it's the step above the best, and nothing is claimed.
 */
export function bidToPlace(bestBuy: number, lows?: (number | null)[] | null): { top: number; buy: number; bidReach: number | null; raised: boolean } {
  const top = tickUp(bestBuy);
  const bidReach = lows ? bidReachDays(lows, top) : null;
  const reached = lows && bidReach != null && bidReach < FILL_RARE ? reachedBid(lows) : null;
  const buy = reached != null && reached > top ? reached : top;
  return { top, buy, bidReach, raised: buy !== top };
}

/**
 * The ask you'd actually list at, the other half of the same test. One legal step under the best ask, unless the
 * bulk of trading hasn't been getting up there (reached on fewer than FILL_RARE of the last 14 days): then it's
 * where trading did reach on half of them. An ask nobody buys at is not a price you can sell at. True Sansha EM
 * Armor Hardener, a month around 3.4 M with one day at 7 M, showed a 59% flip buying where it had traded and
 * selling where it had just jumped to; neither side would fill. Without the highs it's the step under the best.
 */
export function askToPlace(bestSell: number, highs?: (number | null)[] | null): { top: number; sell: number; askReach: number | null; lowered: boolean } {
  const top = tickDown(bestSell);
  const askReach = highs ? askReachDays(highs, top) : null;
  const reached = highs && askReach != null && askReach < FILL_RARE ? reachedAsk(highs) : null;
  const sell = reached != null && reached < top ? reached : top;
  return { top, sell, askReach, lowered: sell !== top };
}

export type BookShape = {
  buyOrders: number; sellOrders: number;
  topBuys: BookLevel[]; topSells: BookLevel[];
};

/**
 * The ways a good-looking spread turns out not to be one. Surfaced next to the item rather
 * than folded into the score, because whether they matter depends on how you trade.
 */
export function warningsFor(
  stats: Pick<ProspectStats, 'dailyRange' | 'trend' | 'tradesPerDay'> & Partial<Pick<ProspectStats, 'high30' | 'spike' | 'unitsPerDay' | 'lastMove'>>,
  book: BookShape,
  spreadPct: number,
  estOrders: number,
): ProspectWarning[] {
  const out: ProspectWarning[] = [];
  // Few orders on a side means the gap is wide because nobody is standing there.
  if (book.buyOrders < 5 || book.sellOrders < 5) out.push('thin');
  // Today's gap is far wider than this item's habitual daily range, so expect it to close.
  if (stats.dailyRange > 0 && spreadPct > 2.5 * stats.dailyRange) out.push('fluke');
  if (stats.trend < -0.1) out.push('falling');
  // Hundreds of listings against a handful of trades: a queue, not a market.
  if (stats.tradesPerDay > 0 && estOrders / stats.tradesPerDay > 20) out.push('crowded');
  // The front of the book held by one price with days of the market's volume behind it: stock placed
  // to make the book look solid, and liable to be pulled the moment traders line up behind it.
  if (isWall(book.topSells, stats.unitsPerDay) || isWall(book.topBuys, stats.unitsPerDay)) out.push('wall');
  // A bid well above anything paid all month needs escrow nobody honest puts up. The classic margin
  // scam: the order is backed by a sliver of ISK and vanishes when you haul stock in to fill it.
  const bid = book.topBuys[0]?.price;
  if (bid != null && stats.high30 != null && stats.high30 > 0 && bid > stats.high30 * (1 + ESCROW_OVER)) out.push('escrow');
  // A recent day far busier than usual at an unusual price: someone may be moving it to lure traders in.
  if (stats.spike) out.push('spike');
  if (stats.lastMove != null && Math.abs(stats.lastMove) > MOVED) out.push('moved');
  return out;
}

/**
 * A wall: the best price on a side (the one you'd queue behind) holding more than half the visible
 * stock and more than WALL_DAYS of the item's whole daily volume. A big order deeper in the book is
 * just a big order, and a big one at the front of a market that moves that much in a day is just
 * supply — neither is what traders chase and get stranded behind. Needs another price to compare
 * against, and a known pace.
 */
export function isWall(levels: BookLevel[], unitsPerDay?: number): boolean {
  if (levels.length < 2 || !(unitsPerDay != null && unitsPerDay > 0)) return false;
  const total = levels.reduce((t, l) => t + l.volume, 0);
  const front = levels[0].volume;
  return total > 0 && front > WALL_SHARE * total && front > WALL_DAYS * unitsPerDay;
}

/**
 * Roughly what an item could pay in a day, before we spend a request on its live book.
 *
 * An item can only pay if it habitually moves further in a day than the fees cost to get in
 * and out — `breakEven` is that threshold, the spread at which a trade nets nothing. Below it
 * no spread survives the round trip however much volume there is, which is why the busiest
 * items on the market (minerals, extractors) are usually the worst things to trade.
 */
export function expectedEdge(
  s: Pick<ProspectStats, 'dailyRange' | 'avgPrice' | 'unitsPerDay'>,
  breakEven: number,
  share: number,
): number {
  const edge = s.dailyRange - breakEven;
  return edge <= 0 ? 0 : edge * s.avgPrice * s.unitsPerDay * share;
}

export type SortKey = 'name' | 'roi' | 'roiDay' | 'canTake' | 'flip' | 'net' | 'trades' | 'days' | 'volume' | 'traded' | 'iskPerDay' | 'capital' | 'flags';

/** ISK that changes hands in an item a day, both sides: the median day's units at the 30-day average price. */
export const tradedPerDay = (s: Pick<ProspectStats, 'unitsPerDay' | 'avgPrice'>) => s.unitsPerDay * s.avgPrice;
/** How many of the busiest markets the Busy markets view shows. */
export const BUSY_SHOWN = 100;
export type Sort = { key: SortKey; dir: 'asc' | 'desc' };

/** Numbers read best biggest-first; a name reads best A to Z. */
export const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = {
  name: 'asc', roi: 'desc', roiDay: 'desc', canTake: 'desc', net: 'desc', trades: 'desc', days: 'desc',
  volume: 'desc', traded: 'desc', iskPerDay: 'desc', flags: 'asc',
  // Less tied up for the same return is the better trade.
  capital: 'asc',
  // The only one where small is good: a fast flip beats a slow one.
  flip: 'asc',
};

type Sortable = {
  typeId: number;
  roi: number; net: number; iskPerDay: number; capital: number; canTake: number; daysToFlip: number;
  roiPerDay?: number;
  traded?: number;
  warnings: unknown[];
  stats: { tradesPerDay: number; daysTraded: number; unitsPerDay: number };
};

const valueOf = (p: Sortable, k: SortKey): number => {
  switch (k) {
    case 'roi': return p.roi;
    case 'roiDay': return p.roiPerDay ?? 0;
    case 'canTake': return p.canTake;
    case 'flip': return p.daysToFlip;
    case 'net': return p.net;
    case 'trades': return p.stats.tradesPerDay;
    case 'days': return p.stats.daysTraded;
    case 'volume': return p.stats.unitsPerDay;
    case 'traded': return p.traded ?? 0;
    case 'iskPerDay': return p.iskPerDay;
    case 'capital': return p.capital;
    case 'flags': return p.warnings.length;
    default: return 0;
  }
};

/**
 * Order the table.
 *
 * Demoting flagged items stays the outer key when it is on, so picking a column sorts within the
 * clean items and the flagged ones separately rather than mixing them back together.
 */
export function sortProspects<T extends Sortable>(
  rows: T[],
  sort: Sort,
  nameOf: (typeId: number) => string,
  demoteFlagged = false,
): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (demoteFlagged && a.warnings.length !== b.warnings.length) return a.warnings.length - b.warnings.length;
    if (sort.key === 'name') return sign * nameOf(a.typeId).localeCompare(nameOf(b.typeId));
    const d = valueOf(a, sort.key) - valueOf(b, sort.key);
    // Equal values fall back to name, so the order never jitters between renders.
    return d !== 0 ? sign * d : nameOf(a.typeId).localeCompare(nameOf(b.typeId));
  });
}

/**
 * ISK an item could take inside a horizon, at your share of its daily trade. Uses the item's own
 * average price rather than a live quote, so it can be worked out for everything scanned, not just
 * the handful that have been priced against the book.
 */
export function absorbable(
  s: Pick<ProspectStats, 'unitsPerDay' | 'avgPrice'>,
  sharePct: number,
  days: number,
): number {
  return s.unitsPerDay * (sharePct / 100) * s.avgPrice * days;
}
