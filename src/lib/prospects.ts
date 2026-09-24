import type { BookLevel, HistRow, ProspectFilters, ProspectStats, ProspectWarning } from './types';

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
  minTrades: 5,
  minDays: 20,
  minRoi: 0.03,
  maxSpikiness: 0.5,
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
  stats: Pick<ProspectStats, 'dailyRange' | 'trend' | 'tradesPerDay'>,
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
  return out;
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
