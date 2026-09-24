import { JITA_44 } from './config';
import { rateAt, rates, type Settings } from './fees';
import type { Data } from './store';
import type { HistRow, JournalEntry, Order, Position, Tx } from './types';

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

export type TxRow = { tx: Tx; match: Exclude<Match, null>; fee: number; feeActual: boolean };
export type SeriesPoint = { t: number; stock: number; avgCost: number | null; realized: number };
export type PricePoint = { t: number; price: number; qty: number };

export type PositionCalc = {
  rows: TxRow[];
  bought: number; boughtValue: number; avgBuy: number | null;
  sold: number; soldValue: number; avgSell: number | null;
  stock: number; avgCost: number | null; costOfStock: number;
  costOfSold: number; oversold: number;
  brokerFees: number; brokerActualOrders: number; brokerEstimatedOrders: number; priceChanges: number | null;
  salesTax: number; taxActual: number; taxEstimated: number;
  manualFees: number;
  realized: number; roi: number | null;
  series: SeriesPoint[]; buys: PricePoint[]; sells: PricePoint[];
  firstT: number | null; lastT: number | null;
};

type Ev = { t: number; kind: 'buy' | 'sell' | 'fee'; qty: number; price: number; fee: number };

export function computePosition(pos: Position, d: Data, s: Settings): PositionCalc {
  const now = rates(s);
  // Estimates use the broker fee and sales tax you had at the time, so turning Omega doesn't rewrite old Alpha trades.
  const rAt = (iso: string) => rateAt(d.meta.rateHistory, ts(iso), now);
  const all = Object.values(d.txs);
  const rows: TxRow[] = [];

  // Sales tax actually paid, keyed by transaction ID.
  const taxByTx = new Map<number, number>();
  const brokerByOrder = new Map<number, JournalEntry[]>();
  for (const j of Object.values(d.journal)) {
    if (j.contextId == null) continue;
    if (j.refType === 'transaction_tax') taxByTx.set(j.contextId, (taxByTx.get(j.contextId) ?? 0) + Math.abs(j.amount));
    if (j.refType === 'brokers_fee') {
      const list = brokerByOrder.get(j.contextId) ?? [];
      list.push(j);
      brokerByOrder.set(j.contextId, list);
    }
  }

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
      const actual = taxByTx.get(Number(tx.id));
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
  let brokerFees = 0, brokerActualOrders = 0, brokerEstimatedOrders = 0, journalBrokerEntries = 0;
  for (const o of orders) {
    const js = brokerByOrder.get(o.orderId);
    if (js && js.length) {
      brokerActualOrders++;
      journalBrokerEntries += js.length;
      for (const j of js) {
        const fee = Math.abs(j.amount);
        brokerFees += fee;
        events.push({ t: ts(j.date), kind: 'fee', qty: 0, price: 0, fee });
      }
    } else {
      brokerEstimatedOrders++;
      const fee = Math.max(100, rAt(o.issued).f * o.price * o.volumeTotal);
      brokerFees += fee;
      events.push({ t: ts(o.issued), kind: 'fee', qty: 0, price: 0, fee });
    }
  }
  const priceChanges = brokerActualOrders > 0 && brokerEstimatedOrders === 0 ? journalBrokerEntries - brokerActualOrders : null;

  // Walk everything in time order using average cost.
  const order = { buy: 0, sell: 1, fee: 2 } as const;
  events.sort((a, b) => a.t - b.t || order[a.kind] - order[b.kind]);
  let stock = 0, basis = 0, realized = 0, costOfSold = 0, oversold = 0;
  let bought = 0, boughtValue = 0, sold = 0, soldValue = 0, lastAvg: number | null = null;
  const series: SeriesPoint[] = [];
  const buys: PricePoint[] = [], sells: PricePoint[] = [];
  for (const e of events) {
    if (e.kind === 'buy') {
      stock += e.qty; basis += e.qty * e.price;
      bought += e.qty; boughtValue += e.qty * e.price;
      lastAvg = basis / stock;
      buys.push({ t: e.t, price: e.price, qty: e.qty });
    } else if (e.kind === 'sell') {
      const avg = stock > 0 ? basis / stock : lastAvg ?? e.price;
      const covered = Math.min(e.qty, stock);
      const extra = e.qty - covered;
      const cost = covered * avg + extra * (lastAvg ?? e.price);
      oversold += extra;
      costOfSold += cost;
      realized += e.qty * e.price - cost;
      stock -= covered; basis = stock * avg;
      sold += e.qty; soldValue += e.qty * e.price;
      sells.push({ t: e.t, price: e.price, qty: e.qty });
    } else {
      realized -= e.fee;
    }
    series.push({ t: e.t, stock, avgCost: stock > 0 ? basis / stock : null, realized });
  }

  rows.sort((a, b) => ts(b.tx.date) - ts(a.tx.date));
  return {
    rows,
    bought, boughtValue, avgBuy: bought ? boughtValue / bought : null,
    sold, soldValue, avgSell: sold ? soldValue / sold : null,
    stock, avgCost: stock > 0 ? basis / stock : null, costOfStock: basis,
    costOfSold, oversold,
    brokerFees, brokerActualOrders, brokerEstimatedOrders, priceChanges,
    salesTax, taxActual, taxEstimated, manualFees,
    realized, roi: costOfSold > 0 ? realized / costOfSold : null,
    series, buys, sells,
    firstT: events.length ? events[0].t : null,
    lastT: events.length ? events[events.length - 1].t : null,
  };
}

/** How your prices compared with that day's average price in The Forge, weighted by quantity. */
export function vsMarket(points: PricePoint[], hist: HistRow[]): number | null {
  if (!points.length || !hist.length) return null;
  const byDay = new Map(hist.map((h) => [h.date, h.average]));
  let w = 0, sum = 0;
  for (const p of points) {
    const day = new Date(p.t).toISOString().slice(0, 10);
    const avg = byDay.get(day);
    if (!avg) continue;
    sum += p.qty * (p.price / avg - 1);
    w += p.qty;
  }
  return w ? sum / w : null;
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
