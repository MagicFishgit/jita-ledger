import { tickDown, tickUp } from './tick';
import { bidReachDays, fillingNow, FILL_RARE, FILL_TYPICAL, FILL_WINDOW, reachedBid } from './fills';
import { rates, type Settings } from './fees';
import type { OrderLite } from './flow';

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
  | 'loss'  // you could move, but the price it takes is not worth having
  | 'dry';  // a buy that trading doesn't reach, and bidding where it does leaves too little: cancel it

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
  /** For a buy: of the last 14 days, how many the bulk of trading reached your price. Null for a sell or without history. */
  reach: number | null;
  /** For a buy trading doesn't reach: the bid it did reach on 7 of those days. */
  reachAt: number | null;
  /** A buy the bulk of trading hasn't been getting down to, and that isn't visibly filling either. */
  unreached: boolean;
};

type Mine = { orderId: number; typeId: number; isBuy: boolean; price: number; volumeRemain: number };

export type MarketContext = {
  book: OrderLite[];
  /**
   * Units a day that can reach this order: buyers taking listings for a sell, sellers dumping into bids
   * for a buy. Without it, nothing can be said about waiting.
   */
  dailyVolume?: number | null;
  /** Your average cost, when a position knows it. Guards a sell against chasing into a loss. */
  avgCost?: number | null;
  /** The current lowest sell, for judging whether a higher bid could still be sold on. */
  bestSell?: number | null;
  /** The last 14 days' lows (fills.ts), for judging whether trading reaches a buy at all. */
  lows?: (number | null)[] | null;
  /** The return you want on a trade, as a fraction: what a bid moved to where trading reaches must still make. */
  targetReturn?: number;
  /** Your own buy is visibly filling (fills.ts `fillingNow`), so trading reaches it whatever history says. */
  filling?: boolean;
};

/**
 * Default patience: below this, the queue ahead clears soon enough that moving is not worth a
 * broker fee. How patient to be is a matter of how you trade, so it is a setting rather than a rule.
 */
export const WAIT_HOURS = 4;

/**
 * How far past the book's own centre of gravity a price has to be before chasing it is treated as
 * chasing a mistake rather than the market.
 */
export const OUTLIER_DIVE = 0.1;

/**
 * And how small the stock at that price has to be to read as a mistake rather than a cheap seller.
 *
 * Distance alone is not enough. A couple of hundred units priced well under the rest of the book is
 * real supply that someone means to sell, and worth weighing on its merits; a single unit at two
 * thirds the going rate is a fat finger. Quantity is what separates them.
 */
export const OUTLIER_SHARE = 0.02;

/**
 * Against a day's trading, skipped stock has to stay under this share too, when the day's volume is
 * known. The share of the book alone can be fooled: one enormous order far up the book (9,909 units
 * at 45,000 on a PL-0 Scoped Cargo Scanner) makes 161 real units at 30,040 look like 1% of the side,
 * when they're over half of what the item trades in a day and will sell first. A quarter of a day is
 * the line: a single unit 29% under the market on an item trading five a day is still a fat finger.
 */
export const OUTLIER_OF_DAY = 0.25;

/** Anything with a price and a quantity: a live order, or an aggregated level of the book. */
export type PriceVolume = { price: number; volume: number };

/**
 * The best price on a side that is actually the market, skipping token quantities priced far away
 * from where the rest of the book sits.
 *
 * Used wherever a best price becomes a price you would act on --- what to ask for stock you hold,
 * what to prefill into an order --- because one unit fat-fingered at two thirds the going rate
 * should not be allowed to talk you into dumping a thousand.
 */
export function marketBest(levels: PriceVolume[], isBuy: boolean, dailyVolume?: number | null): number | null {
  if (!levels.length) return null;
  const level = weightedLevel(levels);
  const total = levels.reduce((n, l) => n + l.volume, 0);
  const ordered = [...levels].sort((a, b) => (isBuy ? b.price - a.price : a.price - b.price));
  let skipped = 0;
  for (const l of ordered) {
    const far = isBuy ? l.price > level * (1 + OUTLIER_DIVE) : l.price < level * (1 - OUTLIER_DIVE);
    // Skip only while the skipped stock stays a rounding error on the side's volume, and, when we
    // know how much it trades, on a day's trading too.
    const small = (skipped + l.volume) / total < OUTLIER_SHARE && !(dailyVolume != null && dailyVolume > 0 && (skipped + l.volume) >= dailyVolume * OUTLIER_OF_DAY);
    if (far && total > 0 && small) {
      skipped += l.volume;
      continue;
    }
    return l.price;
  }
  return ordered[ordered.length - 1].price;
}

/**
 * One open order judged against its live book, the way the Orders page, To do, the alerts and the cloud's
 * alert mail all do: your side's pace, your cost, how far trading reaches, and your own fills.
 */
export function judgeOrder(
  o: Mine & { locationId: number; seen?: { issued: string; price: number; remain: number }[] },
  m: { book: OrderLite[]; perDay: number | null; avgCost?: number | null; lows: (number | null)[] | null; txs: Parameters<typeof fillingNow>[2] },
  s: Settings,
  now = Date.now(),
): Relist {
  const sells = m.book.filter((x) => !x.isBuy).map((x) => x.price);
  return adviseRelist(o, {
    book: m.book,
    dailyVolume: m.perDay,
    avgCost: m.avgCost,
    bestSell: sells.length ? Math.min(...sells) : null,
    lows: m.lows,
    targetReturn: s.target / 100,
    filling: fillingNow(o, m.book.find((x) => x.id === o.orderId)?.volume, m.txs, now),
  }, rates(s), s.waitHours, s.target / 100);
}

/**
 * Where the book says this item actually trades: the price at which half the stock on your side
 * sits cheaper and half dearer, weighted by volume.
 *
 * Weighting by volume is the point. Someone who fat-fingers a single unit at two thirds of the
 * going rate moves this by nothing, so a price far away from it is a mistake or a token dump rather
 * than a market that has moved. It needs only the live book, so it still holds for an item with no
 * trading history to reason about.
 */
export function weightedLevel(orders: PriceVolume[]): number {
  if (!orders.length) return 0;
  const sorted = [...orders].sort((a, b) => a.price - b.price);
  const total = sorted.reduce((n, o) => n + o.volume, 0);
  if (total <= 0) return sorted[Math.floor(sorted.length / 2)].price;
  let seen = 0;
  for (const o of sorted) {
    seen += o.volume;
    if (seen >= total / 2) return o.price;
  }
  return sorted[sorted.length - 1].price;
}

export function adviseRelist(
  mine: Mine,
  m: MarketContext,
  r: { k: number; f: number; t: number },
  waitHours = WAIT_HOURS,
  /**
   * The return you want each trade to make, as a fraction: Settings' "Target return", which is per trade.
   * Holding is worth it when what the move costs, per day of waiting it saves, beats that return spread
   * over the days this order's stock takes to sell. It was once compared with the target as if it were a
   * daily rate, which made every hour look five times dearer on a week-long sale: an order with one unit
   * ahead of it and six days of stock was told to move.
   */
  targetPerTrade = 0.05,
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

  // A buy only fills when sellers sell into it. When the bulk of trading hasn't been getting down to
  // your price, one step above the best bid may not be reached either (it wasn't, for the Syndicate Gas
  // Cloud Scoop the user bid on): the move worth making is to where trading does reach.
  const reach = mine.isBuy && m.lows && !gone ? bidReachDays(m.lows, price) : null;
  // Your own fills overrule the count: history lags and is trimmed, your order isn't.
  const unreached = reach != null && reach < FILL_RARE && !m.filling;
  const reachAt = unreached ? reachedBid(m.lows!) : null;
  const oneStep = beaten && best !== null ? (mine.isBuy ? tickUp(best) : tickDown(best)) : NaN;
  const newPrice = unreached && reachAt != null && !(oneStep >= reachAt) ? reachAt : oneStep;
  const moves = (beaten || unreached) && Number.isFinite(newPrice);
  const give = moves ? Math.abs(newPrice - price) * volumeRemain : 0;
  const fee = moves ? Math.max(100, r.k * newPrice * volumeRemain) : 0;
  const cost = give + fee;
  const atRisk = price * volumeRemain;
  const cutPct = moves && price > 0 ? Math.abs(newPrice - price) / price : 0;

  // Would getting in front put you well outside where the bulk of the book sits? The live book
  // answers that on its own, so it holds even for an item we know nothing else about.
  const level = weightedLevel([...rivals, { id: mine.orderId, isBuy: mine.isBuy, price, volume: volumeRemain }]);
  const sideVolume = rivals.reduce((n, o) => n + o.volume, 0) + volumeRemain;
  const chasingOutlier =
    moves && level > 0 &&
    (mine.isBuy ? newPrice > level * (1 + OUTLIER_DIVE) : newPrice < level * (1 - OUTLIER_DIVE)) &&
    sideVolume > 0 && aheadUnits / sideVolume < OUTLIER_SHARE &&
    // Stock that's a real share of a day's trading will sell before yours, however big the book.
    !(daily != null && aheadUnits >= daily * OUTLIER_OF_DAY);
  // What freeing this order's capital sooner earns a day: the target for a trade, spread over how long this
  // one takes to sell. At least a day, so a fast order is judged exactly as before and never more eagerly.
  const tradeDays = Number.isFinite(yourHours) ? Math.max(1, yourHours / 24) : 1;
  const targetDaily = targetPerTrade / tradeDays;
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
  } else if (unreached) {
    // Worth moving to where trading reaches only if selling on from there still makes your target.
    const sellNet = m.bestSell != null ? tickDown(m.bestSell) * (1 - r.f - r.t) : null;
    const ret = moves && sellNet != null ? sellNet / (newPrice * (1 + r.f)) - 1 : null;
    const target = m.targetReturn ?? 0;
    const said = `The bulk of trading reached your bid on ${reach} of the last ${FILL_WINDOW} days`;
    const at = (p: number) => Math.round(p).toLocaleString('en-US');
    if (reachAt == null) {
      verdict = 'dry';
      why = `${said}, and the item traded on too few days for any bid to be reached reliably`;
    } else if (ret == null || ret < target) {
      verdict = 'dry';
      why = `${said}. Bidding where it did on ${FILL_TYPICAL} of them, ${at(newPrice)}, ${ret == null ? 'would leave nothing to sell into' : ret < 0 ? `would lose ${pctText(-ret)} after fees` : `would leave ${pctText(ret)} after fees, under your ${pctText(target)} target`}`;
    } else {
      verdict = 'move';
      why = `${said}. At ${at(newPrice)} it did on ${FILL_TYPICAL} of them, and still makes ${pctText(ret)} after fees`;
    }
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
  } else if (chasingOutlier) {
    verdict = 'wait';
    why =
      `The ${aheadUnits.toLocaleString('en-US')} unit${aheadUnits === 1 ? '' : 's'} ahead of you ${aheadUnits === 1 ? 'is' : 'are'} priced ` +
      `${pctText(Math.abs(level - newPrice) / level)} ${mine.isBuy ? 'above' : 'below'} where the rest of the book sits ` +
      `(${Math.round(level).toLocaleString('en-US')}) \u2014 someone's mistake or a token dump, not the market`;
  } else if (waitingPaysDaily > targetDaily) {
    // The move is expensive relative to the waiting it saves. Cutting a third off a price to get in
    // front of a thin skim of cheap stock destroys far more than it brings forward.
    verdict = 'wait';
    why =
      `Getting in front means moving ${pctText(cutPct)} to ${Math.round(newPrice).toLocaleString('en-US')}, ` +
      `which costs ${Math.round(cost).toLocaleString('en-US')} ISK to save ${hrs(hoursToFront)} of waiting — ` +
      `holding your price is worth about ${pctText(waitingPaysDaily)} a day` +
      (tradeDays > 1
        ? `, more than the ${pctText(targetDaily)} a day your ${pctText(targetPerTrade)} target comes to over the ${Math.round(tradeDays)} days this stock takes to sell`
        : `, more than your ${pctText(targetPerTrade)} target`);
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
    verdict, why, reach, reachAt, unreached,
  };
}

const RANK: Record<Verdict, number> = { move: 0, dry: 1, loss: 2, wait: 3, front: 4 };

/** What needs doing first: real relists, then the ISK at stake within each group. */
export function byUrgency(a: Relist, b: Relist): number {
  return RANK[a.verdict] - RANK[b.verdict] || b.atRisk - a.atRisk;
}

/**
 * What stock fetches if you sell it into the standing buy orders right now, walking down the bids
 * until it is gone. Only sales tax applies: filling someone else's order costs no broker fee.
 *
 * Anything the visible bids cannot take is reported rather than priced --- the next bid down is not
 * in the book you have, and guessing at it would flatter the dump.
 */
export function walkBids(stock: number, bids: PriceVolume[], salesTax: number): { value: number; sold: number; left: number } {
  const sorted = [...bids].sort((a, b) => b.price - a.price);
  let left = Math.max(0, stock), value = 0;
  for (const b of sorted) {
    if (left <= 0) break;
    const take = Math.min(left, b.volume);
    value += take * b.price * (1 - salesTax);
    left -= take;
  }
  return { value, sold: Math.max(0, stock) - left, left };
}
