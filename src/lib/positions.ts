import { JITA_44 } from './constants';
import { rateAt, rates, type Settings } from './fees';
import type { Data } from './store';
import { matchFees, type FeeMatches } from './feeMatch';
import type { HistRow, Order, Position, Tx } from './types';
import { nettedJournal } from './refunds';
import { planCountsWhole, planView, type TradePlan } from './plans';

const ts = (iso: string) => Date.parse(iso);

export type Match = 'auto' | 'included' | 'excluded' | null;

export function matchTx(pos: Position, tx: Tx): Match {
  // A plan's view of a shared position counts the ones typed in from its start, as ESI's (plans.ts `planView`).
  if (tx.source === 'manual') return tx.positionId === pos.id && (!pos.view || ts(tx.date) >= ts(pos.openedAt)) ? 'included' : null;
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

/**
 * An open position with nothing left to do: no order open on the item, nothing in stock, and something did
 * happen. Sold out and liquidated into bids read the same here (`soldOut`); a buy cancelled before anything
 * filled is `backedOut`, and its placing fee is its whole result. Either way, closing it is what keeps that
 * result: a deleted position's fees and trades drop out of Results. Only sold-out positions used to be
 * flagged, so a backed-out one sat open until the user deleted it, taking the fee off the books with it.
 */
export type Finished = 'soldOut' | 'backedOut';
export function finishedPosition(pos: Position, c: Pick<PositionCalc, 'bought' | 'sold' | 'stock' | 'brokerFees'>, orders: Order[]): Finished | null {
  if (pos.status !== 'open') return null;
  const mine = orders.filter((o) => o.typeId === pos.typeId && (!pos.jitaOnly || o.locationId === JITA_44));
  if (mine.some((o) => o.state === 'open' && o.volumeRemain > 0)) return null;
  if (c.stock > 0) return null;
  if (c.bought > 0 || c.sold > 0) return 'soldOut';
  const placed = mine.some((o) => ts(o.issued) >= ts(pos.openedAt));
  return placed || c.brokerFees > 0 ? 'backedOut' : null;
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
  // Fees a GM refunded count as nothing (refunds.ts).
  const result = matchFees(Object.values(nettedJournal(d.journal)), Object.values(d.orders), Object.values(d.txs), rateAtIso);
  matchCache = { journal: d.journal, orders: d.orders, txs: d.txs, hist: d.meta.rateHistory, k: now.k, result };
  return result;
}

/** `elsewhere`: in this position's days, but another position of the item counts it (see `ownerAt`). */
export type TxRow = { tx: Tx; match: Exclude<Match, null> | 'elsewhere'; fee: number; feeActual: boolean };
export type SeriesPoint = { t: number; stock: number; avgCost: number | null; realized: number };
export type PricePoint = { t: number; price: number; qty: number };

export type PositionCalc = {
  rows: TxRow[];
  bought: number; boughtValue: number; avgBuy: number | null;
  sold: number; soldValue: number; avgSell: number | null;
  stock: number; avgCost: number | null; costOfStock: number;
  costOfSold: number;
  /**
   * Units sold beyond what the position had bought by then: stock from before its start, loot, gifts. They have
   * no recorded cost, so they're left out of the profit rather than given one: `oversoldValue` is what they sold
   * for, `oversoldNet` that less their tax and their share of the listing fees.
   */
  oversold: number; oversoldValue: number; oversoldNet: number;
  brokerFees: number; brokerActualOrders: number; brokerEstimatedOrders: number;
  /** Price changes seen on this position's orders, what they cost, and how many of those fees were estimated. */
  priceChanges: number; relistFees: number; relistsEstimated: number;
  /** Each price change and its fee, when it was charged: for relists over a period. */
  relistEvents: { t: number; amount: number }[];
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
  /**
   * On a plan's view of a shared position (`view`): units sold since the plan out of what the position held at its start.
   * They're the earlier trading's, so the view counts none of them, nor their revenue or tax. 0 on anything else.
   */
  heldSold: number;
  realized: number; roi: number | null;
  series: SeriesPoint[]; buys: PricePoint[]; sells: PricePoint[];
  firstT: number | null; lastT: number | null;
};

type Ev = {
  t: number; kind: 'buy' | 'sell' | 'fee'; qty: number; price: number; fee: number;
  /** Buy fee carried into cost, or sell fee charged, per unit. */ unitFee?: number;
  /** A sale's own tax (and, entered by hand, its fees): charged on the units it covers. */ tax?: number;
  /** A sale's tax: typed in with a trade added by hand, or ESI's own (`actual`), for the totals a view takes it out of. */
  taxOf?: { manual: boolean; actual: boolean };
};

/** The earlier-opened of two positions, which keeps what both would count. */
const before = (a: Position, b: Position) => ts(a.openedAt) - ts(b.openedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const covers = (p: Position, t: number) => t >= ts(p.openedAt) && (!p.closedAt || t <= ts(p.closedAt));

/**
 * Which of an item's positions a moment belongs to: the one trading the item then, the earliest opened if
 * several were (a position started "from today" after one closed at 14:53 covers the same morning). Between
 * positions, or before the first, nobody's; `nextAfter` then gives the first opened after it.
 */
function ownerAt(list: Position[], t: number): Position | null {
  let best: Position | null = null;
  for (const p of list) if (covers(p, t) && (!best || before(p, best) < 0)) best = p;
  return best;
}
function nextAfter(list: Position[], t: number): Position | null {
  let best: Position | null = null;
  for (const p of list) if (ts(p.openedAt) > t && (!best || before(p, best) < 0)) best = p;
  return best;
}

/**
 * The earliest a position of this item can start without covering days another one already counts: after the
 * last one closed. The default start is today at 00:00, so closing a position and starting another the same day
 * would otherwise count that morning's trades in both.
 */
export function startAfter(positions: Position[], typeId: number, wanted: string, self?: Position): string {
  let at = wanted;
  for (const p of positions) {
    if (p.typeId !== typeId || !p.closedAt) continue;
    // Moving an existing position's start: only the ones before it can be in the way.
    if (self && (p.id === self.id || before(p, self) > 0)) continue;
    if (ts(p.closedAt) > ts(at)) at = p.closedAt;
  }
  return at;
}

/** A position of the same item opened after this one: reopening this one would cover its days too. */
export function laterPosition(pos: Position, positions: Position[]): Position | undefined {
  return positions.find((p) => p.id !== pos.id && p.typeId === pos.typeId && before(pos, p) < 0);
}

/**
 * The trades grouped by item, kept for one version of the ledger's trades. Results works a position out for
 * every item ever traded; walking all the trades for each of them grows with items × trades, which a year of
 * history makes seconds long.
 */
let txIndex: { txs: Data['txs']; byType: Map<number, Tx[]>; manual: Tx[] } | null = null;
function tradesFor(pos: Position, d: Data): Tx[] {
  if (txIndex?.txs !== d.txs) {
    const byType = new Map<number, Tx[]>();
    const manual: Tx[] = [];
    for (const tx of Object.values(d.txs)) {
      if (tx.source === 'manual') { manual.push(tx); continue; }
      const list = byType.get(tx.typeId);
      if (list) list.push(tx); else byType.set(tx.typeId, [tx]);
    }
    txIndex = { txs: d.txs, byType, manual };
  }
  // Every trade matchTx could count: this item's, manual ones (matched by position), and any included by hand.
  const out = new Set<Tx>([...(txIndex.byType.get(pos.typeId) ?? []), ...txIndex.manual]);
  for (const id of pos.included) { const tx = d.txs[id]; if (tx) out.add(tx); }
  return [...out];
}

export function computePosition(pos: Position, d: Data, s: Settings): PositionCalc {
  const now = rates(s);
  // Estimates use the broker fee and sales tax you had at the time, so turning Omega doesn't rewrite old Alpha trades.
  const rAt = (iso: string) => rateAt(d.meta.rateHistory, ts(iso), now);
  const all = tradesFor(pos, d);
  const rows: TxRow[] = [];

  const matches = feeMatchesFor(d, s);
  // The ledger's positions of this item, which share its trades and fees out between them. Only when this is one
  // of them: Results works out every item with a position of its own over all time, which must see everything.
  const mine = (d.positions ?? []).some((p) => p.id === pos.id);
  const rivals = mine ? d.positions.filter((p) => p.id !== pos.id && p.typeId === pos.typeId) : [];
  const family = [pos, ...rivals];
  // A trade two positions would count is the one's that added it by hand, else the earlier-opened one's.
  const takenElsewhere = (tx: Tx, m: Match) => rivals.some((r) => {
    const rm = matchTx(r, tx);
    if (rm === 'included') return m !== 'included' || before(r, pos) < 0;
    return rm === 'auto' && m === 'auto' && before(r, pos) < 0;
  });

  const events: Ev[] = [];
  const counted: Tx[] = [];
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
    if (m !== 'excluded' && takenElsewhere(tx, m)) { rows.push({ tx, match: 'elsewhere', fee, feeActual }); continue; }
    rows.push({ tx, match: m, fee, feeActual });
    if (m === 'excluded') continue;
    counted.push(tx);
    // A sale carries its own tax, so units sold with no recorded cost can leave it out with them.
    const onSale = !tx.isBuy && fee > 0;
    events.push({ t: ts(tx.date), kind: tx.isBuy ? 'buy' : 'sell', qty: tx.qty, price: tx.unitPrice, fee: 0, tax: onSale ? fee : 0,
      ...(onSale ? { taxOf: { manual: tx.source === 'manual', actual: feeActual } } : {}) });
    if (fee > 0 && !onSale) events.push({ t: ts(tx.date), kind: 'fee', qty: 0, price: 0, fee });
    if (fee > 0) {
      if (tx.source === 'manual') manualFees += fee;
      else { salesTax += fee; if (feeActual) taxActual++; else taxEstimated++; }
    }
  }

  // A plan's view of a position it shares (plans.ts `planView`): what the position held when the plan started is the
  // earlier trading's. Sales take it first, and that part of each one, its revenue and its tax, is none of the view's;
  // only what sells beyond it is the plan's. A sale across the line counts its part beyond it.
  let heldSold = 0;
  if (pos.view && pos.view.held > 0) {
    let held = pos.view.held;
    for (const e of events.filter((x) => x.kind === 'sell').sort((a, b) => a.t - b.t)) {
      if (held <= 0) break;
      const take = Math.min(held, e.qty);
      held -= take; heldSold += take;
      const tax = (e.tax ?? 0) * (take / e.qty);
      if (e.taxOf?.manual) manualFees -= tax; else salesTax -= tax;
      if (take === e.qty && e.taxOf && !e.taxOf.manual) { if (e.taxOf.actual) taxActual--; else taxEstimated--; }
      e.tax = (e.tax ?? 0) - tax;
      e.qty -= take;
    }
    for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === 'sell' && events[i].qty <= 0) events.splice(i, 1);
  }

  // Broker fees come from your orders for this item. A fee belongs to the position that was trading the item
  // when it was charged (a placement when the order was placed, a price change when it was made: `issued` moves
  // to the latest change, so it can't say when an order was placed). One charged before any position, on an order
  // still working when this one started, is this one's too, less the share for units that filled before the start.
  const openT = ts(pos.openedAt);
  const orders: Order[] = Object.values(d.orders).filter((o) => o.typeId === pos.typeId && (!pos.jitaOnly || o.locationId === JITA_44));
  const side = (list: Tx[], o: Order) => list.filter((t) => t.source === 'esi' && t.typeId === o.typeId && t.isBuy === o.isBuy && t.locationId === o.locationId);
  /** Of the units a fee was charged on, what share is this position's; null when none. */
  const shareOf = (o: Order, at: string, units: number): { counted: number; filled: number } | null => {
    const t = ts(at);
    const owner = ownerAt(family, t);
    const covered = Math.max(1, units);
    const filled = Math.max(0, Math.min(covered, covered - o.volumeRemain));
    if (owner) return owner.id === pos.id ? { counted: 1, filled: filled / covered } : null;
    const next = nextAfter(family, t);
    if (next?.id !== pos.id) return null;
    // Its fills are trades on its side at one of its prices: the ones before the start aren't this position's.
    const prices = new Set([o.price, ...(o.seen ?? []).map((v) => v.price)]);
    const fills = (list: Tx[]) => side(list, o).filter((x) => prices.has(x.unitPrice) && ts(x.date) >= t);
    const pre = Math.min(filled, fills(all).filter((x) => ts(x.date) < openT).reduce((n, x) => n + x.qty, 0));
    // Only while it's still working, or when this position counts some of what it filled since: a sell order
    // placed 90 s before the user's position started had its fills excluded by hand, and isn't the position's.
    if (o.state !== 'open' && (filled - pre <= 0 || !fills(counted).some((x) => ts(x.date) >= openT))) return null;
    return { counted: (covered - pre) / covered, filled: (filled - pre) / covered };
  };
  // A broker fee is charged on a whole order when it's placed, so it belongs to the units of that order,
  // not to the moment it was paid. Each order's fee is split per unit of the order:
  // - units that filled on a buy order carry their share into the cost of the stock;
  // - units that filled on a sell order are charged their share as they sell;
  // - units still waiting on an open order are prepaid, and not a cost of anything yet;
  // - units a closed order never filled are simply spent, when the order was placed.
  // A price change is a fee of its own, charged when you make it.
  let brokerFees = 0, brokerActualOrders = 0, brokerEstimatedOrders = 0, prepaidFees = 0;
  let priceChanges = 0, relistFees = 0, relistsEstimated = 0;
  const relistEvents: { t: number; amount: number }[] = [];
  let buyFeePool = 0, sellFeePool = 0, firstFee: number | null = null;
  // One fee's share: filled units carry theirs, waiting ones have it prepaid, never-filled ones on a closed order spent.
  const charge = (o: Order, amount: number, sh: { counted: number; filled: number }, at: string) => {
    const t = Math.max(ts(at), openT);
    firstFee = firstFee == null ? t : Math.min(firstFee, t);
    const counted = amount * sh.counted, filledShare = amount * sh.filled, unfilledShare = counted - filledShare;
    brokerFees += counted;
    if (o.state === 'open') prepaidFees += unfilledShare;
    else if (unfilledShare > 0) events.push({ t, kind: 'fee', qty: 0, price: 0, fee: unfilledShare });
    if (o.isBuy) buyFeePool += filledShare; else sellFeePool += filledShare;
    return { t, counted };
  };
  for (const o of orders) {
    const m = matches.byOrder.get(o.orderId);
    const placedAt = m?.placement.at ?? o.seen?.[0]?.issued ?? o.issued;
    // In a plan's view, a sell order placed before the plan lists stock held before it: the earlier trading's, fees and all.
    if (pos.view && !o.isBuy && ts(placedAt) < openT) continue;
    const placedSh = shareOf(o, placedAt, o.volumeTotal);
    if (placedSh) {
      const placed = m ? m.placement.amount : Math.max(100, rAt(placedAt).f * o.price * o.volumeTotal);
      if (m?.placement.actual) brokerActualOrders++; else brokerEstimatedOrders++;
      charge(o, placed, placedSh, placedAt);
    }
    // A price change is a fee on the units left at the time, so it's split the same way as the
    // placing fee: units that fill afterwards carry their share, units still waiting have it prepaid,
    // and on an order that closed, the share of units that never filled is spent.
    for (const r of m?.relists ?? []) {
      const sh = shareOf(o, r.at, r.remain);
      if (!sh) continue;
      const { t, counted } = charge(o, r.amount, sh, r.at);
      priceChanges++;
      relistFees += counted;
      relistEvents.push({ t, amount: counted });
      if (!r.actual) relistsEstimated++;
    }
  }

  // Spread each side's filled share over the units the position counts on that side. If nothing on
  // a side is counted, its share is spent when paid rather than lost from the totals.
  const countedBuys = events.filter((e) => e.kind === 'buy').reduce((n, e) => n + e.qty, 0);
  const countedSells = events.filter((e) => e.kind === 'sell').reduce((n, e) => n + e.qty, 0);
  const buyFeeUnit = countedBuys > 0 ? buyFeePool / countedBuys : 0;
  const sellFeeUnit = countedSells > 0 ? sellFeePool / countedSells : 0;
  if (!countedBuys && buyFeePool > 0) events.push({ t: firstFee ?? Date.now(), kind: 'fee', qty: 0, price: 0, fee: buyFeePool });
  if (!countedSells && sellFeePool > 0) events.push({ t: firstFee ?? Date.now(), kind: 'fee', qty: 0, price: 0, fee: sellFeePool });
  for (const e of events) {
    if (e.kind === 'buy') e.unitFee = buyFeeUnit;
    else if (e.kind === 'sell') e.unitFee = sellFeeUnit;
  }

  // Walk everything in time order using average cost.
  const order = { buy: 0, sell: 1, fee: 2 } as const;
  events.sort((a, b) => a.t - b.t || order[a.kind] - order[b.kind]);
  let stock = 0, basis = 0, realized = 0, costOfSold = 0, feeBasis = 0;
  let oversold = 0, oversoldValue = 0, oversoldNet = 0;
  let bought = 0, boughtValue = 0, sold = 0, soldValue = 0;
  const series: SeriesPoint[] = [];
  const buys: PricePoint[] = [], sells: PricePoint[] = [];
  for (const e of events) {
    if (e.kind === 'buy') {
      const fee = e.qty * (e.unitFee ?? 0);
      stock += e.qty; basis += e.qty * e.price + fee; feeBasis += fee;
      bought += e.qty; boughtValue += e.qty * e.price;
      buys.push({ t: e.t, price: e.price, qty: e.qty });
    } else if (e.kind === 'sell') {
      const avg = stock > 0 ? basis / stock : 0;
      const feeAvg = stock > 0 ? feeBasis / stock : 0;
      const covered = Math.min(e.qty, stock);
      const extra = e.qty - covered;
      // Units beyond the stock bought have no recorded cost: left out, with their tax and fee share, not
      // costed at a guess (their own price made every such sale read as exactly nothing).
      const unitCosts = (e.unitFee ?? 0) + (e.tax ?? 0) / e.qty;
      const cost = covered * avg;
      oversold += extra; oversoldValue += extra * e.price; oversoldNet += extra * (e.price - unitCosts);
      costOfSold += cost;
      realized += covered * (e.price - unitCosts) - cost;
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
    costOfSold, oversold, oversoldValue, oversoldNet,
    brokerFees, brokerActualOrders, brokerEstimatedOrders, priceChanges, relistFees, relistsEstimated, relistEvents, prepaidFees, buyFeesInStock: feeBasis,
    salesTax, taxActual, taxEstimated, manualFees, heldSold,
    realized, roi: costOfSold > 0 ? realized / costOfSold : null,
    series, buys, sells,
    firstT: events.length ? events[0].t : null,
    lastT: events.length ? events[events.length - 1].t : null,
  };
}

/** A position as a plan counts it (`planView` in plans.ts), beside the whole. */
export type PlanPosition = {
  /** What the plan counts: from its start for a position open before it, else the position itself. */
  c: PositionCalc;
  /** The whole position, as Positions shows it unfiltered. */
  whole: PositionCalc;
  /** Counted through a view from the plan's start, holding earlier trading (`planCountsWhole`): the row says so. */
  shared: boolean;
  /** Units the position held at the plan's start, the earlier trading's, and how many of them have sold since. */
  held: number; heldSold: number;
};

/**
 * The plan's figures for one of its positions. A position the plan opened, or one opened for it just before it with
 * nothing traded before the plan, is counted whole (`planCountsWhole`). One it took over from earlier trading is
 * counted from the plan's start: `held` is the whole position's stock just before then, which the view leaves to the
 * earlier trading (sold first, none of it the plan's). `whole` can be passed when it's already worked out.
 */
export function planPosition(pos: Position, plan: Pick<TradePlan, 'at'>, d: Data, s: Settings, whole: PositionCalc = computePosition(pos, d, s)): PlanPosition {
  const from = ts(plan.at);
  const traded = whole.buys.some((x) => x.t < from) || whole.sells.some((x) => x.t < from);
  if (planCountsWhole(pos, plan, traded)) return { c: whole, whole, shared: false, held: 0, heldSold: 0 };
  let held = 0;
  for (const p of whole.series) { if (p.t < from) held = p.stock; else break; }
  const c = computePosition(planView(pos, plan, d.txs, held), d, s);
  return { c, whole, shared: true, held, heldSold: c.heldSold };
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
