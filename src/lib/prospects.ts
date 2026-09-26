import type { BookLevel, HistRow, ProspectFilters, ProspectStats, ProspectWarning } from './types';
import { buyerShare } from './split';

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
  };
}

/** A day counts as a spike when it trades this many times the usual volume... */
export const SPIKE_VOLUME = 5;
/** ...at an average this far from the usual price. Volume alone is just a busy day. */
export const SPIKE_PRICE = 0.1;
/** A best bid this far above the highest trade of the month is bait, not a market. */
export const ESCROW_OVER = 0.1;
/** One price holding more than this share of the stock visible on its side is a wall. */
export const WALL_SHARE = 0.5;

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

export type BookShape = {
  buyOrders: number; sellOrders: number;
  topBuys: BookLevel[]; topSells: BookLevel[];
};

/**
 * The ways a good-looking spread turns out not to be one. Surfaced next to the item rather
 * than folded into the score, because whether they matter depends on how you trade.
 */
export function warningsFor(
  stats: Pick<ProspectStats, 'dailyRange' | 'trend' | 'tradesPerDay'> & Partial<Pick<ProspectStats, 'high30' | 'spike'>>,
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
  // One price holding most of what is on show: stock placed to make the book look solid, and liable
  // to be pulled the moment traders line up behind it.
  if (isWall(book.topSells) || isWall(book.topBuys)) out.push('wall');
  // A bid well above anything paid all month needs escrow nobody honest puts up. The classic margin
  // scam: the order is backed by a sliver of ISK and vanishes when you haul stock in to fill it.
  const bid = book.topBuys[0]?.price;
  if (bid != null && stats.high30 != null && stats.high30 > 0 && bid > stats.high30 * (1 + ESCROW_OVER)) out.push('escrow');
  // A recent day far busier than usual at an unusual price: someone may be moving it to lure traders in.
  if (stats.spike) out.push('spike');
  return out;
}

/** More than half the visible stock on a side at one price, with at least one other price to compare. */
export function isWall(levels: BookLevel[]): boolean {
  if (levels.length < 2) return false;
  const total = levels.reduce((t, l) => t + l.volume, 0);
  return total > 0 && Math.max(...levels.map((l) => l.volume)) > WALL_SHARE * total;
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

export type SortKey = 'name' | 'roi' | 'roiDay' | 'canTake' | 'flip' | 'net' | 'trades' | 'days' | 'volume' | 'iskPerDay' | 'capital' | 'flags';
export type Sort = { key: SortKey; dir: 'asc' | 'desc' };

/** Numbers read best biggest-first; a name reads best A to Z. */
export const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = {
  name: 'asc', roi: 'desc', roiDay: 'desc', canTake: 'desc', net: 'desc', trades: 'desc', days: 'desc',
  volume: 'desc', iskPerDay: 'desc', flags: 'asc',
  // Less tied up for the same return is the better trade.
  capital: 'asc',
  // The only one where small is good: a fast flip beats a slow one.
  flip: 'asc',
};

type Sortable = {
  typeId: number;
  roi: number; net: number; iskPerDay: number; capital: number; canTake: number; daysToFlip: number;
  roiPerDay?: number;
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
