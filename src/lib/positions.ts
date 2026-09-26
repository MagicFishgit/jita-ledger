import { JITA_44 } from './constants';
import { rateAt, rates, type Settings } from './fees';
import type { Data } from './store';
import { matchFees, type FeeMatches } from './feeMatch';
import type { HistRow, Order, Position, Tx } from './types';

const ts = (iso: string) => Date.parse(iso);

export type Match = 'auto' | 'included' | 'excluded' | null;

export function matchTx(pos: Position, tx: Tx): Match {
  if (tx.source === 'manual') return tx.positionId === pos.id ? 'included' : null;
  const inRule =
    tx.typeId === pos.typeId &&
    (!pos.jitaOnly || tx.locationId === JITA_44) &&
    ts(tx.date) >= ts(pos.openedAt) &&
    (!pos.closedAt || ts(tx.date) <= ts(pos.closedAt));
  if (pos.excluded.includes(tx.id)) return inRule || pos.included.includes(tx.id) ? 'excluded' : null;
  if (pos.included.includes(tx.id)) return 'included';
  return inRule ? 'auto' : null;
}

export function countedIn(pos: Position, tx: Tx): boolean {
  const m = matchTx(pos, tx);
  return m === 'auto' || m === 'included';
}

/** ESI transactions that no position counts and that you haven't marked as personal. */
export function unassigned(d: Data): Tx[] {
  const ignored = new Set(d.ignored);
  return Object.values(d.txs)
    .filter((t) => t.source === 'esi' && !ignored.has(t.id) && !d.positions.some((p) => countedIn(p, t)))
    .sort((a, b) => ts(b.date) - ts(a.date));
}

type MatchCache = { journal: unknown; orders: unknown; txs: unknown; hist: unknown; k: number; result: FeeMatches };
let matchCache: MatchCache | null = null;

/**
 * Every order's placement and price-change fees and every sale's tax, matched from the journal by the
 * second they were charged (see feeMatch.ts). Worked out once per version of the journal, orders and
 * trades rather than once per position: it looks at all of them.
 */
export function feeMatchesFor(d: Data, s: Settings): FeeMatches {
  const now = rates(s);
  const c = matchCache;
  if (c && c.journal === d.journal && c.orders === d.orders && c.txs === d.txs && c.hist === d.meta.rateHistory && c.k === now.k) return c.result;
  const rateAtIso = (iso: string) => {
    const r = rateAt(d.meta.rateHistory, ts(iso), now);
    // The discount on price changes comes from Advanced Broker Relations, which isn't in the rate history.
    return { f: r.f, t: r.t, k: (1 - now.d) * r.f };
  };
  const result = matchFees(Object.values(d.journal), Object.values(d.orders), Object.values(d.txs), rateAtIso);
  matchCache = { journal: d.journal, orders: d.orders, txs: d.txs, hist: d.meta.rateHistory, k: now.k, result };
  return result;
}

export type TxRow = { tx: Tx; match: Exclude<Match, null>; fee: number; feeActual: boolean };
export type SeriesPoint = { t: number; stock: number; avgCost: number | null; realized: number };
export type PricePoint = { t: number; price: number; qty: number };

export type PositionCalc = {
  rows: TxRow[];
  bought: number; boughtValue: number; avgBuy: number | null;
  sold: number; soldValue: number; avgSell: number | null;
  stock: number; avgCost: number | null; costOfStock: number;
  costOfSold: number; oversold: number;
  brokerFees: number; brokerActualOrders: number; brokerEstimatedOrders: number;
  /** Price changes seen on this position's orders, what they cost, and how many of those fees were estimated. */
  priceChanges: number; relistFees: number; relistsEstimated: number;
  /**
   * Broker fees paid up front for the part of your open orders that hasn't filled yet: a sell order
   * for 2,000 units pays its whole fee when listed. Kept out of realized profit until those units trade,
   * because they aren't a cost of anything sold so far.
   */
  prepaidFees: number;
  /** Buy-side broker fees carried in the cost of the stock you still hold (they're part of what it cost). */
  buyFeesInStock: number;
  salesTax: number; taxActual: number; taxEstimated: number;
  manualFees: number;
  realized: number; roi: number | null;
  series: SeriesPoint[]; buys: PricePoint[]; sells: PricePoint[];
  firstT: number | null; lastT: number | null;
};

type Ev = { t: number; kind: 'buy' | 'sell' | 'fee'; qty: number; price: number; fee: number; /** Buy fee carried into cost, or sell fee charged, per unit. */ unitFee?: number };

export function computePosition(pos: Position, d: Data, s: Settings): PositionCalc {
  const now = rates(s);
  // Estimates use the broker fee and sales tax you had at the time, so turning Omega doesn't rewrite old Alpha trades.
  const rAt = (iso: string) => rateAt(d.meta.rateHistory, ts(iso), now);
  const all = Object.values(d.txs);
  const rows: TxRow[] = [];

  const matches = feeMatchesFor(d, s);

  const events: Ev[] = [];
  let manualFees = 0, salesTax = 0, taxActual = 0, taxEstimated = 0;

  for (const tx of all) {
    const m = matchTx(pos, tx);
    if (!m) continue;
    let fee = 0, feeActual = false;
    const value = tx.qty * tx.unitPrice;
    const r = rAt(tx.date);
    if (tx.source === 'manual') {
      if (tx.fees != null && Number.isFinite(tx.fees)) { fee = tx.fees; feeActual = true; }
      else fee = tx.isBuy ? Math.max(100, r.f * value) : Math.max(100, r.f * value) + r.t * value;
    } else if (!tx.isBuy) {
      const actual = matches.taxByTx.get(tx.id);
      if (actual != null) { fee = actual; feeActual = true; } else fee = r.t * value;
    }
    rows.push({ tx, match: m, fee, feeActual });
    if (m === 'excluded') continue;
    events.push({ t: ts(tx.date), kind: tx.isBuy ? 'buy' : 'sell', qty: tx.qty, price: tx.unitPrice, fee: 0 });
    if (fee > 0) {
      events.push({ t: ts(tx.date), kind: 'fee', qty: 0, price: 0, fee });
      if (tx.source === 'manual') manualFees += fee;
      else { salesTax += fee; if (feeActual) taxActual++; else taxEstimated++; }
    }
  }

  // Broker fees come from your orders for this item during the position.
  const openT = ts(pos.openedAt), closeT = pos.closedAt ? ts(pos.closedAt) : Infinity;
  const orders: Order[] = Object.values(d.orders).filter(
    (o) => o.typeId === pos.typeId && (!pos.jitaOnly || o.locationId === JITA_44) && ts(o.issued) >= openT && ts(o.issued) <= closeT,
  );
  // A broker fee is charged on a whole order when it's placed, so it belongs to the units of that order,
  // not to the moment it was paid. Each order's fee is split per unit of the order:
  // - units that filled on a buy order carry their share into the cost of the stock;
  // - units that filled on a sell order are charged their share as they sell;
  // - units still waiting on an open order are prepaid, and not a cost of anything yet;
  // - units a closed order never filled are simply spent, when the order was placed.
  // A price change is a fee of its own, charged when you make it.
  let brokerFees = 0, brokerActualOrders = 0, brokerEstimatedOrders = 0, prepaidFees = 0;
  let priceChanges = 0, relistFees = 0, relistsEstimated = 0;
  let buyFeePool = 0, sellFeePool = 0;
  for (const o of orders) {
    const m = matches.byOrder.get(o.orderId);
    const placed = m ? m.placement.amount : Math.max(100, rAt(o.issued).f * o.price * o.volumeTotal);
    if (m?.placement.actual) brokerActualOrders++; else brokerEstimatedOrders++;
    // A price change is a fee on the units left at the time, so it's split the same way as the
    // placing fee: units that fill afterwards carry their share, units still waiting have it prepaid,
    // and on an order that closed, the share of units that never filled is spent.
    for (const r of m?.relists ?? []) {
      priceChanges++;
      relistFees += r.amount;
      if (!r.actual) relistsEstimated++;
      brokerFees += r.amount;
      const at = Math.max(1, r.remain);
      const filled = Math.max(0, Math.min(at, at - o.volumeRemain));
      const filledShare = r.amount * (filled / at);
      const unfilledShare = r.amount - filledShare;
      if (o.state === 'open') prepaidFees += unfilledShare;
      else if (unfilledShare > 0) events.push({ t: ts(r.at), kind: 'fee', qty: 0, price: 0, fee: unfilledShare });
      if (o.isBuy) buyFeePool += filledShare; else sellFeePool += filledShare;
    }
    brokerFees += placed;
    const total = Math.max(1, o.volumeTotal);
    const remain = Math.max(0, Math.min(total, o.volumeRemain));
    const filledShare = placed * ((total - remain) / total);
    const unfilledShare = placed - filledShare;
    if (o.state === 'open') prepaidFees += unfilledShare;
    else if (unfilledShare > 0) events.push({ t: ts(o.issued), kind: 'fee', qty: 0, price: 0, fee: unfilledShare });
    if (o.isBuy) buyFeePool += filledShare; else sellFeePool += filledShare;
  }

  // Spread each side's filled share over the units the position counts on that side. If nothing on
  // a side is counted, its share is spent when paid rather than lost from the totals.
  const countedBuys = events.filter((e) => e.kind === 'buy').reduce((n, e) => n + e.qty, 0);
  const countedSells = events.filter((e) => e.kind === 'sell').reduce((n, e) => n + e.qty, 0);
  const buyFeeUnit = countedBuys > 0 ? buyFeePool / countedBuys : 0;
  const sellFeeUnit = countedSells > 0 ? sellFeePool / countedSells : 0;
  const firstOrder = orders.length ? Math.min(...orders.map((o) => ts(o.issued))) : null;
  if (!countedBuys && buyFeePool > 0) events.push({ t: firstOrder ?? Date.now(), kind: 'fee', qty: 0, price: 0, fee: buyFeePool });
  if (!countedSells && sellFeePool > 0) events.push({ t: firstOrder ?? Date.now(), kind: 'fee', qty: 0, price: 0, fee: sellFeePool });
  for (const e of events) {
    if (e.kind === 'buy') e.unitFee = buyFeeUnit;
    else if (e.kind === 'sell') e.unitFee = sellFeeUnit;
  }

  // Walk everything in time order using average cost.
  const order = { buy: 0, sell: 1, fee: 2 } as const;
  events.sort((a, b) => a.t - b.t || order[a.kind] - order[b.kind]);
  let stock = 0, basis = 0, realized = 0, costOfSold = 0, oversold = 0, feeBasis = 0;
  let bought = 0, boughtValue = 0, sold = 0, soldValue = 0, lastAvg: number | null = null;
  const series: SeriesPoint[] = [];
  const buys: PricePoint[] = [], sells: PricePoint[] = [];
  for (const e of events) {
    if (e.kind === 'buy') {
      const fee = e.qty * (e.unitFee ?? 0);
      stock += e.qty; basis += e.qty * e.price + fee; feeBasis += fee;
      bought += e.qty; boughtValue += e.qty * e.price;
      lastAvg = basis / stock;
      buys.push({ t: e.t, price: e.price, qty: e.qty });
    } else if (e.kind === 'sell') {
      const avg = stock > 0 ? basis / stock : lastAvg ?? e.price;
      const feeAvg = stock > 0 ? feeBasis / stock : 0;
      const covered = Math.min(e.qty, stock);
      const extra = e.qty - covered;
      const cost = covered * avg + extra * (lastAvg ?? e.price);
      oversold += extra;
      costOfSold += cost;
      realized += e.qty * e.price - cost - e.qty * (e.unitFee ?? 0);
      stock -= covered; basis = stock * avg; feeBasis = stock * feeAvg;
      sold += e.qty; soldValue += e.qty * e.price;
      sells.push({ t: e.t, price: e.price, qty: e.qty });
    } else {
      realized -= e.fee;
    }
    // A sale and its tax happen in the same moment: record the moment once, after both, so the
    // profit line doesn't spike up and straight back down between them.
    if (series.length && series[series.length - 1].t === e.t) series.pop();
    series.push({ t: e.t, stock, avgCost: stock > 0 ? basis / stock : null, realized });
  }

  rows.sort((a, b) => ts(b.tx.date) - ts(a.tx.date));
  return {
    rows,
    bought, boughtValue, avgBuy: bought ? boughtValue / bought : null,
    sold, soldValue, avgSell: sold ? soldValue / sold : null,
    stock, avgCost: stock > 0 ? basis / stock : null, costOfStock: basis,
    costOfSold, oversold,
    brokerFees, brokerActualOrders, brokerEstimatedOrders, priceChanges, relistFees, relistsEstimated, prepaidFees, buyFeesInStock: feeBasis,
    salesTax, taxActual, taxEstimated, manualFees,
    realized, roi: costOfSold > 0 ? realized / costOfSold : null,
    series, buys, sells,
    firstT: events.length ? events[0].t : null,
    lastT: events.length ? events[events.length - 1].t : null,
  };
}

/**
 * How your prices compared with that day's average price in The Forge, weighted by quantity, and how
 * much of those days' trading was yours. On a thin item your own trades can be most of a day's
 * volume, and then the "market average" is largely your own price: `ownShare` says when that is so.
 * `diff` is null when no day you traded has history yet (ESI adds a day only after it ends).
 */
export function vsMarketDetail(points: PricePoint[], hist: HistRow[]): { diff: number | null; ownShare: number | null } {
  if (!points.length || !hist.length) return { diff: null, ownShare: null };
  const byDay = new Map(hist.map((h) => [h.date, h]));
  let w = 0, sum = 0;
  const mine = new Map<string, number>();
  for (const p of points) {
    const day = new Date(p.t).toISOString().slice(0, 10);
    const h = byDay.get(day);
    if (!h?.average) continue;
    sum += p.qty * (p.price / h.average - 1);
    w += p.qty;
    mine.set(day, (mine.get(day) ?? 0) + p.qty);
  }
  if (!w) return { diff: null, ownShare: null };
  const volume = [...mine.keys()].reduce((t, day) => t + (byDay.get(day)?.volume ?? 0), 0);
  return { diff: sum / w, ownShare: volume > 0 ? Math.min(1, w / volume) : null };
}

export function vsMarket(points: PricePoint[], hist: HistRow[]): number | null {
  return vsMarketDetail(points, hist).diff;
}

/** Realized profit gained between two moments, from a position's series. */
export function realizedBetween(series: SeriesPoint[], from: number, to: number): number {
  const at = (t: number) => {
    let v = 0;
    for (const p of series) { if (p.t <= t) v = p.realized; else break; }
    return v;
  };
  return at(to) - at(from);
}
