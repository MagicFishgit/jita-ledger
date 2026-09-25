import { tickDown, tickUp } from './tick';
import type { OrderLite } from './market';

/**
 * Whether one of your market orders is worth chasing.
 *
 * Being undercut is not by itself a reason to move. What matters is how long the people ahead of
 * you will stay ahead: a handful of units in front of you on something that trades thousands a day
 * is eaten in minutes and you are back at the front for free, while the same undercut on a slow
 * item can park you behind a wall of stock for days. So this measures the DEPTH ahead of you
 * against how fast the item actually moves, and only calls for a relist when waiting would cost
 * you more than moving.
 *
 * Both sides mirror each other: a sell is beaten from below and moves down, a buy from above and
 * moves up.
 */
export type Verdict =
  | 'front' // nobody is ahead of you
  | 'wait'  // someone is, but they will be cleared out shortly
  | 'move'  // a real queue is ahead of you
  | 'loss'; // you could move, but the price it takes is not worth having

export type Relist = {
  orderId: number;
  typeId: number;
  isBuy: boolean;
  price: number;
  volumeRemain: number;
  best: number | null;
  beaten: boolean;
  newPrice: number;
  gap: number;
  give: number;
  fee: number;
  cost: number;
  atRisk: number;
  /** Units queued ahead of you on your own side. */
  aheadUnits: number;
  /** How many separate orders that is. One big rival is not the same as thirty small ones. */
  aheadOrders: number;
  /** Hours for the queue ahead to clear at the item's usual pace. Infinity when we can't tell. */
  hoursToFront: number;
  verdict: Verdict;
  why: string;
};

type Mine = { orderId: number; typeId: number; isBuy: boolean; price: number; volumeRemain: number };

export type MarketContext = {
  book: OrderLite[];
  /** Units the whole market trades in a day. Without it, nothing can be said about waiting. */
  dailyVolume?: number | null;
  /** Your average cost, when a position knows it. Guards a sell against chasing into a loss. */
  avgCost?: number | null;
  /** The current lowest sell, for judging whether a higher bid could still be sold on. */
  bestSell?: number | null;
};

/** Below this, the queue ahead clears soon enough that moving is not worth a broker fee. */
export const WAIT_HOURS = 4;

export function adviseRelist(
  mine: Mine,
  m: MarketContext,
  r: { k: number; f: number; t: number },
): Relist {
  const rivals = m.book.filter((o) => o.id !== mine.orderId && o.isBuy === mine.isBuy);
  const prices = rivals.map((o) => o.price);
  const best = prices.length ? (mine.isBuy ? Math.max(...prices) : Math.min(...prices)) : null;
  const beaten = best !== null && (mine.isBuy ? best > mine.price : best < mine.price);

  // Everyone strictly in front of you in the queue.
  const ahead = rivals.filter((o) => (mine.isBuy ? o.price > mine.price : o.price < mine.price));
  const aheadUnits = ahead.reduce((n, o) => n + o.volume, 0);
  const daily = m.dailyVolume && m.dailyVolume > 0 ? m.dailyVolume : null;
  const hoursToFront = !beaten ? 0 : daily ? (aheadUnits / daily) * 24 : Infinity;

  const newPrice = beaten && best !== null ? (mine.isBuy ? tickUp(best) : tickDown(best)) : NaN;
  const moves = beaten && Number.isFinite(newPrice);
  const give = moves ? Math.abs(newPrice - mine.price) * mine.volumeRemain : 0;
  const fee = moves ? Math.max(100, r.k * newPrice * mine.volumeRemain) : 0;

  // Would the price it takes to get back in front actually be worth having?
  const netOfSale = (p: number) => p * (1 - r.f - r.t);
  const badSell = moves && !mine.isBuy && m.avgCost != null && netOfSale(newPrice) < m.avgCost;
  const badBuy = moves && mine.isBuy && m.bestSell != null && newPrice >= netOfSale(m.bestSell);

  const hrs = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

  let verdict: Verdict;
  let why: string;
  if (!beaten) {
    verdict = 'front';
    why = best === null ? 'Nobody else is selling or buying here' : 'You are at the front of the queue';
  } else if (badSell) {
    verdict = 'loss';
    why = 'Matching them would sell under what the stock cost you';
  } else if (badBuy) {
    verdict = 'loss';
    why = 'Matching them would pay more than you could sell it on for';
  } else if (!moves) {
    verdict = 'loss';
    why = 'There is no legal price below theirs left to take';
  } else if (hoursToFront <= WAIT_HOURS) {
    verdict = 'wait';
    why = `Only ${aheadUnits.toLocaleString('en-US')} ahead of you, about ${hrs(hoursToFront)} at this item's pace`;
  } else {
    verdict = 'move';
    why = Number.isFinite(hoursToFront)
      ? `${aheadUnits.toLocaleString('en-US')} ahead of you, about ${hrs(hoursToFront)} of waiting`
      : `${aheadUnits.toLocaleString('en-US')} ahead of you, and this item barely trades`;
  }

  return {
    orderId: mine.orderId, typeId: mine.typeId, isBuy: mine.isBuy,
    price: mine.price, volumeRemain: mine.volumeRemain,
    best, beaten, newPrice,
    gap: best === null ? 0 : Math.abs(best - mine.price),
    give, fee, cost: give + fee,
    atRisk: mine.price * mine.volumeRemain,
    aheadUnits, aheadOrders: ahead.length, hoursToFront,
    verdict, why,
  };
}

const RANK: Record<Verdict, number> = { move: 0, loss: 1, wait: 2, front: 3 };

/** What needs doing first: real relists, then the ISK at stake within each group. */
export function byUrgency(a: Relist, b: Relist): number {
  return RANK[a.verdict] - RANK[b.verdict] || b.atRisk - a.atRisk;
}
