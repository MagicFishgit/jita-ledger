import type { PricePoint, SeriesPoint } from './positions';

/**
 * Trading over the long run: what every item you have bought and sold again made, and what kind of trade
 * that was. The ledger outlives ESI's 30 days once the cloud archives it, so these are the questions that
 * need months of it: which items keep paying, and whether cheap, fast flips beat slow, expensive ones.
 *
 * Profit comes from the same walk the Positions page does (`computePosition` over every trade in the item),
 * so fees and tax are matched exactly as there. This module adds only what that walk doesn't say: how many
 * of the units sold had a recorded buy before them, what they cost, and how long they were held.
 */

const DAY = 86400_000;

export type ItemCalc = {
  typeId: number; series: SeriesPoint[]; buys: PricePoint[]; sells: PricePoint[];
  /** A buy order was placed, filled or not: a fee on one that never filled is still a cost of trading. */
  ordered?: boolean;
};

export type ItemResult = {
  typeId: number;
  /** Realized between `from` and `to`, after every fee and tax, by the Positions rule. */
  profit: number;
  /** Units sold in the window, and the ISK they brought. */
  sold: number;
  revenue: number;
  /** Of those, units that had a recorded buy before them, and what those cost (average cost with buy fees, as Positions). */
  covered: number;
  cost: number;
  /** Average days from buying a unit to selling it, first in first out, over the covered units. */
  heldDays: number | null;
  /** Average price of the units sold in the window. */
  avgSell: number | null;
  /** Anything was ever bought or bid for: without that, what sold was loot, a store good or a gift, not a trade. */
  everBought: boolean;
};

/** The realized profit at time t, from a position's series. */
function realizedAt(series: SeriesPoint[], t: number): number {
  let v = 0;
  for (const p of series) { if (p.t <= t) v = p.realized; else break; }
  return v;
}

/** Average cost per unit just before a moment, from the series (it carries buy fees), or null. */
function avgCostBefore(series: SeriesPoint[], t: number): number | null {
  let lo = 0, hi = series.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t < t) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at >= 0 ? series[at].avgCost ?? null : null;
}

/** One item's trading between `from` (exclusive) and `to` (inclusive). */
export function itemResult(c: ItemCalc, from: number, to: number): ItemResult {
  type Ev = { t: number; buy: boolean; price: number; qty: number };
  const evs: Ev[] = [
    ...c.buys.map((b) => ({ t: b.t, buy: true, price: b.price, qty: b.qty })),
    ...c.sells.map((s) => ({ t: s.t, buy: false, price: s.price, qty: s.qty })),
  ].sort((a, b) => a.t - b.t || (a.buy === b.buy ? 0 : a.buy ? -1 : 1));
  const lots: { t: number; qty: number }[] = [];
  let stock = 0, basis = 0;
  let sold = 0, revenue = 0, covered = 0, cost = 0, heldSum = 0;
  for (const e of evs) {
    if (e.buy) {
      lots.push({ t: e.t, qty: e.qty });
      stock += e.qty; basis += e.qty * e.price;
      continue;
    }
    const inWindow = e.t > from && e.t <= to;
    const have = Math.min(e.qty, stock);
    const avg = stock > 0 ? basis / stock : 0;
    if (inWindow) {
      sold += e.qty; revenue += e.qty * e.price;
      // The Positions walk's own average, which includes what the buy orders' fees added to the stock.
      covered += have; cost += have * (avgCostBefore(c.series, e.t) ?? avg);
    }
    stock -= have; basis = stock * avg;
    let left = have;
    while (left > 0 && lots.length) {
      const lot = lots[0];
      const take = Math.min(left, lot.qty);
      if (inWindow) heldSum += take * (e.t - lot.t);
      lot.qty -= take; left -= take;
      if (lot.qty <= 0) lots.shift();
    }
  }
  return {
    typeId: c.typeId,
    profit: realizedAt(c.series, to) - realizedAt(c.series, from),
    sold, revenue, covered, cost,
    heldDays: covered > 0 ? heldSum / covered / DAY : null,
    avgSell: sold > 0 ? revenue / sold : null,
    everBought: c.buys.length > 0 || !!c.ordered,
  };
}

/**
 * A trade, as opposed to something sold that was never bought: the item was bought or bid for at some point,
 * and at least half of what sold in the window had a recorded buy before it. An item with nothing sold but a
 * result counts too: the fee on a buy order that never filled is what that trade cost.
 */
export const isTrade = (r: ItemResult) => r.everBought && (r.sold === 0 ? r.profit !== 0 : r.covered >= r.sold / 2);

/** Sold in the window with no recorded buy behind most of it: loot, loyalty-store and planetary goods, gifts. */
export const isUnbought = (r: ItemResult) => r.sold > 0 && !isTrade(r);

export type Band = { label: string; max: number };

/** Price per unit sold. */
export const PRICE_BANDS: Band[] = [
  { label: 'Under 10 k', max: 10_000 },
  { label: '10 k – 1 M', max: 1_000_000 },
  { label: '1 M – 100 M', max: 100_000_000 },
  { label: 'Over 100 M', max: Infinity },
];

/** Time from buying to selling. */
export const HELD_BANDS: Band[] = [
  { label: 'Under a day', max: 1 },
  { label: '1 – 7 days', max: 7 },
  { label: '1 – 4 weeks', max: 28 },
  { label: 'Longer', max: Infinity },
];

export const bandOf = (bands: Band[], v: number | null): string | null => (v == null ? null : bands.find((b) => v < b.max)?.label ?? null);

export type Group = { key: string; profit: number; cost: number; revenue: number; items: number };

/** Items summed by a key; an item whose key is unknown is left out. Biggest profit first. */
export function groupResults(rs: ItemResult[], keyOf: (r: ItemResult) => string | null): Group[] {
  const m = new Map<string, Group>();
  for (const r of rs) {
    const k = keyOf(r);
    if (k == null) continue;
    const g = m.get(k) ?? { key: k, profit: 0, cost: 0, revenue: 0, items: 0 };
    g.profit += r.profit; g.cost += r.cost; g.revenue += r.revenue; g.items++;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.profit - a.profit);
}

/** Bands in their own order, not by profit, with empty bands dropped. */
export function inBandOrder(groups: Group[], bands: Band[]): Group[] {
  return bands.map((b) => groups.find((g) => g.key === b.label)).filter((g): g is Group => !!g);
}

export type BucketUnit = 'day' | 'week' | 'month';

/**
 * How a period is charted: a bar a day up to 90 days, a week up to two years, a month beyond. A year of
 * daily bars is 365 slivers nobody can hover.
 */
export const unitFor = (days: number): BucketUnit => (days <= 90 ? 'day' : days <= 730 ? 'week' : 'month');

const dayStart = (t: number) => Date.parse(new Date(t).toISOString().slice(0, 10) + 'T00:00:00Z');
/** Weeks start on Monday, UTC (EVE time). */
const weekStart = (t: number) => { const d = dayStart(t); return d - ((new Date(d).getUTCDay() + 6) % 7) * DAY; };
const monthStart = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const nextMonth = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };

/** The start of every bucket from the one holding `from` to the one holding `to`, oldest first. */
export function bucketStarts(from: number, to: number, unit: BucketUnit): number[] {
  const first = unit === 'day' ? dayStart(from) : unit === 'week' ? weekStart(from) : monthStart(from);
  const out: number[] = [];
  for (let t = first; t <= to; t = unit === 'month' ? nextMonth(t) : t + (unit === 'week' ? 7 : 1) * DAY) out.push(t);
  return out;
}

/** Which bucket a moment falls in: the index of the last start at or before it, or -1 before the first. */
export function bucketIndex(starts: number[], t: number): number {
  let lo = 0, hi = starts.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}

/** Realized profit per bucket, summed over items, from each item's series. */
export function profitByBucket(calcs: ItemCalc[], starts: number[], to: number): number[] {
  const out = starts.map(() => 0);
  if (!starts.length) return out;
  for (const c of calcs) {
    let prev = realizedAt(c.series, starts[0] - 1);
    for (const p of c.series) {
      if (p.t < starts[0] || p.t > to) { if (p.t < starts[0]) prev = p.realized; continue; }
      const i = bucketIndex(starts, p.t);
      out[i] += p.realized - prev;
      prev = p.realized;
    }
  }
  return out;
}
