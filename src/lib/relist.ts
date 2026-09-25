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
  /** Your price came from the live book rather than the last sync, so a relist shows up at once. */
  live: boolean;
  /** Your order is no longer in the book: it filled, expired or was cancelled. */
  gone: boolean;
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
  /** The biggest single order ahead, as a share of the queue. High means one wall, not a crowd. */
  topRivalShare: number;
  /** Hours for YOUR remaining stock to sell once you reach the front, at the item's usual pace. */
  yourHours: number;
  /** Hours for the queue ahead to clear at the item's usual pace. Infinity when we can't tell. */
  hoursToFront: number;
  /** How far the price has to move, as a share of your own. A 31% cut is not an adjustment. */
  cutPct: number;
  /**
   * What holding your price is worth, per day, expressed as a return.
   *
   * Moving costs you `cost` now and saves you `hoursToFront` of waiting. Not moving therefore earns
   * you that cost back over that time, so this is the daily rate of simply leaving the order alone.
   * When it beats the return you would accept on a trade, waiting is the better trade.
   */
  waitingPaysDaily: number;
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

/**
 * Default patience: below this, the queue ahead clears soon enough that moving is not worth a
 * broker fee. How patient to be is a matter of how you trade, so it is a setting rather than a rule.
 */
export const WAIT_HOURS = 4;

export function adviseRelist(
  mine: Mine,
  m: MarketContext,
  r: { k: number; f: number; t: number },
  waitHours = WAIT_HOURS,
  /** The daily return you'd accept on a trade, as a fraction. Holding must beat it to be worth it. */
  targetDaily = 0.05,
): Relist {
  // Character orders are cached by ESI for twenty minutes, so the stored copy of your own order can
  // be stale for that long after you relist. The live book knows better: your order is in it, under
  // the same id, at whatever price it is really sitting at now.
  const self = m.book.find((o) => o.id === mine.orderId);
  const price = self ? self.price : mine.price;
  const volumeRemain = self ? self.volume : mine.volumeRemain;
  const gone = m.book.length > 0 && !self;

  const rivals = m.book.filter((o) => o.id !== mine.orderId && o.isBuy === mine.isBuy);
  const prices = rivals.map((o) => o.price);
  const best = prices.length ? (mine.isBuy ? Math.max(...prices) : Math.min(...prices)) : null;
  const beaten = best !== null && (mine.isBuy ? best > price : best < price);

  // Everyone strictly in front of you in the queue.
  const ahead = rivals.filter((o) => (mine.isBuy ? o.price > price : o.price < price));
  const aheadUnits = ahead.reduce((n, o) => n + o.volume, 0);
  const daily = m.dailyVolume && m.dailyVolume > 0 ? m.dailyVolume : null;
  const hoursToFront = !beaten ? 0 : daily ? (aheadUnits / daily) * 24 : Infinity;
  // One big wall clears all at once and drops you straight to the front; a crowd of small orders
  // is a queue of people who will each undercut you again.
  const topRivalShare = aheadUnits > 0 ? Math.max(...ahead.map((o) => o.volume)) / aheadUnits : 0;
  const yourHours = daily ? (volumeRemain / daily) * 24 : Infinity;

  const newPrice = beaten && best !== null ? (mine.isBuy ? tickUp(best) : tickDown(best)) : NaN;
  const moves = beaten && Number.isFinite(newPrice);
  const give = moves ? Math.abs(newPrice - price) * volumeRemain : 0;
  const fee = moves ? Math.max(100, r.k * newPrice * volumeRemain) : 0;
  const cost = give + fee;
  const atRisk = price * volumeRemain;
  const cutPct = moves && price > 0 ? Math.abs(newPrice - price) / price : 0;
  // The share of the order's value burned to get in front, spread over the waiting it saves.
  const waitingPaysDaily =
    moves && atRisk > 0 && Number.isFinite(hoursToFront) && hoursToFront > 0
      ? (cost / atRisk) / (hoursToFront / 24)
      : 0;

  // Would the price it takes to get back in front actually be worth having?
  const netOfSale = (p: number) => p * (1 - r.f - r.t);
  const badSell = moves && !mine.isBuy && m.avgCost != null && netOfSale(newPrice) < m.avgCost;
  const badBuy = moves && mine.isBuy && m.bestSell != null && newPrice >= netOfSale(m.bestSell);

  const pctText = (x: number) => `${x >= 1 ? Math.round(x * 100) : (x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
  const hrs = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

  let verdict: Verdict;
  let why: string;
  if (gone) {
    verdict = 'front';
    why = 'This order is no longer in the book \u2014 it filled, expired or was cancelled';
  } else if (!beaten) {
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
  } else if (waitingPaysDaily > targetDaily) {
    // The move is expensive relative to the waiting it saves. Cutting a third off a price to get in
    // front of a thin skim of cheap stock destroys far more than it brings forward.
    verdict = 'wait';
    why =
      `Getting in front means moving ${pctText(cutPct)} to ${Math.round(newPrice).toLocaleString('en-US')}, ` +
      `which costs ${Math.round(cost).toLocaleString('en-US')} ISK to save ${hrs(hoursToFront)} of waiting — ` +
      `holding your price is worth about ${pctText(waitingPaysDaily)} a day`;
  } else if (hoursToFront <= waitHours) {
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
    price, volumeRemain, live: !!self, gone,
    best, beaten, newPrice,
    gap: best === null ? 0 : Math.abs(best - price),
    give, fee, cost,
    atRisk,
    aheadUnits, aheadOrders: ahead.length, hoursToFront, topRivalShare, yourHours,
    cutPct, waitingPaysDaily,
    verdict, why,
  };
}

const RANK: Record<Verdict, number> = { move: 0, loss: 1, wait: 2, front: 3 };

/** What needs doing first: real relists, then the ISK at stake within each group. */
export function byUrgency(a: Relist, b: Relist): number {
  return RANK[a.verdict] - RANK[b.verdict] || b.atRisk - a.atRisk;
}
