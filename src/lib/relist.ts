import { tickDown, tickUp } from './tick';
import type { OrderLite } from './market';

/**
 * Whether one of your market orders has been beaten, and what getting back in front would cost.
 *
 * Both sides work the same way, mirrored: a sell order is beaten when someone lists BELOW you and
 * you must come down, a buy order when someone bids ABOVE you and you must go up. Either way the
 * move costs a broker fee and gives up some of the margin, which is the trade-off worth seeing
 * before you decide whether an order is worth chasing at all.
 */
export type Relist = {
  orderId: number;
  typeId: number;
  isBuy: boolean;
  /** What you are asking, or bidding, now. */
  price: number;
  volumeRemain: number;
  /** The best price among everyone else on your side. Null when you are the only one there. */
  best: number | null;
  beaten: boolean;
  /** The legal price that puts you back in front. NaN when there is nothing to chase. */
  newPrice: number;
  /** How far ahead of you the competition is, per unit. */
  gap: number;
  /** Margin given up over what is left: less revenue on a sell, more outlay on a buy. */
  give: number;
  /** Broker fee to change the price. */
  fee: number;
  /** give + fee: what staying in front costs you. */
  cost: number;
  /** ISK sitting in this order at its current price. */
  atRisk: number;
};

/** Your own order, as the app stores it. */
type Mine = { orderId: number; typeId: number; isBuy: boolean; price: number; volumeRemain: number };

/**
 * `k` is the price-change fee as a share of order value (rates().k), which already has the
 * Advanced Broker Relations discount folded in. The 100 ISK floor matches the broker fee.
 */
export function adviseRelist(mine: Mine, book: OrderLite[], k: number): Relist {
  const rivals = book.filter((o) => o.id !== mine.orderId && o.isBuy === mine.isBuy);
  const prices = rivals.map((o) => o.price);
  const best = prices.length ? (mine.isBuy ? Math.max(...prices) : Math.min(...prices)) : null;

  // Level with the best price still counts as being in front: you are at the head of the queue.
  const beaten = best !== null && (mine.isBuy ? best > mine.price : best < mine.price);
  const newPrice = beaten && best !== null ? (mine.isBuy ? tickUp(best) : tickDown(best)) : NaN;

  const moves = beaten && Number.isFinite(newPrice);
  const give = moves ? Math.abs(newPrice - mine.price) * mine.volumeRemain : 0;
  const fee = moves ? Math.max(100, k * newPrice * mine.volumeRemain) : 0;

  return {
    orderId: mine.orderId, typeId: mine.typeId, isBuy: mine.isBuy,
    price: mine.price, volumeRemain: mine.volumeRemain,
    best, beaten, newPrice,
    gap: best === null ? 0 : Math.abs(best - mine.price),
    give, fee, cost: give + fee,
    atRisk: mine.price * mine.volumeRemain,
  };
}

/** Beaten orders first, the most ISK at stake at the top --- that is what costs most left stale. */
export function byUrgency(a: Relist, b: Relist): number {
  if (a.beaten !== b.beaten) return a.beaten ? -1 : 1;
  return b.atRisk - a.atRisk;
}
