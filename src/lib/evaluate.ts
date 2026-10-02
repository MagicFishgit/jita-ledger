/**
 * One scanned item judged as a trade: where to buy (where trading reaches), where to sell, how much it can
 * take in your horizon, and what that returns. Moved out of scan.ts so the cloud's opportunity mail judges an
 * item exactly as Prospects does; the watched data is passed in rather than read from the browser's store.
 * Pure.
 */
import { calc, rates, type Settings } from './fees';
import { askReachDays, bidReachDays, FILL_WINDOW, reachedAsk, reachedBid, withWatchedHighs, withWatchedLows, type WatchedExtremes } from './fills';
import type { FlowDay } from './flow';
import { askToPlace, bidToPlace, listedQueue, runUpBar, SLOW_DAYS, tradedPerDay, warningsFor } from './prospects';
import { competitionShare, MIN_DAYS, returnPerDay, sellQueue, throughput, tradingSplit, type BookSold } from './split';
import type { BookLevel, Prospect, ProspectFilters, ProspectStats } from './types';

export type Book = { at: string; bestBuy: number | null; bestSell: number | null; buyOrders: number; sellOrders: number; topBuys: BookLevel[]; topSells: BookLevel[]; npcSell?: boolean;
  /** What the live orders had sold per side when read: who trades here. Absent on books cached before it was kept. */
  sold?: BookSold };

/**
 * Price changes kept back on a side whose orders you'd typically be beaten on before they fill. Praxis, in the user's
 * first plan (30 September 2026): Orders told them to raise its bid three times (206.3 → 206.7 → 207.1 → 208.4 M),
 * 1.58 M of change fees on top of the 2.58 M placing fee, and a trade planned at +3.2% lost 1.02 M. The cloud had
 * watched 25-36 units newly bid at the front a day against 7-19 sold into bids, and 51-112 new listings against 25-45
 * bought from them.
 */
export const RAISES_RESERVED = 2;
/** Hours of watching the item's Jita book before its pace of undercuts is trusted for this. */
export const RESERVE_WATCH_H = 24;
/**
 * Units newly placed at or beyond the front, per unit filled on that side, before raises are kept back: the front beaten
 * at least twice per unit filled. At one for one it applied to 93 of the 94 candidates watched for a day on the cloud's
 * scan of 1 October 2026, which says nothing about which markets are busy; Praxis was 2.5 times on bids, 2 on asks.
 */
export const RESERVE_RATIO = 2;

/**
 * The raises a busy side will cost, from what was watched (`watched.flow`): RAISES_RESERVED on a side where at least
 * RESERVE_RATIO times as many units were newly placed at or beyond the front as filled there (`newBuy ≥ 2 × buy` for
 * bids, `newSell ≥ 2 × sell` for asks) over RESERVE_WATCH_H hours or more; something has to have been placed, or
 * there's nothing to go on. Each
 * change costs the change fee (`k`, the broker fee less the Advanced Broker Relations discount) on the whole order's
 * value, since you're beaten before you fill, at least the broker's 100 ISK. Per unit, over `qty`. Undefined when
 * neither side keeps any.
 */
export function raisesKeptBack(flow: Pick<FlowDay, 'h' | 'buy' | 'sell' | 'newBuy' | 'newSell'> | undefined, k: number, buy: number, sell: number, qty: number): { buy: number; sell: number; isk: number } | undefined {
  if (!flow || !(flow.h >= RESERVE_WATCH_H) || !(qty > 0)) return undefined;
  const nb = flow.newBuy > 0 && flow.newBuy >= RESERVE_RATIO * flow.buy ? RAISES_RESERVED : 0;
  const ns = flow.newSell > 0 && flow.newSell >= RESERVE_RATIO * flow.sell ? RAISES_RESERVED : 0;
  if (!nb && !ns) return undefined;
  const fee = (price: number) => Math.max(100, k * price * qty);
  return { buy: nb, sell: ns, isk: (nb * fee(buy) + ns * fee(sell)) / qty };
}

/**
 * Price a candidate against the live book, through the trader's own fees and skills.
 *
 * The position is the amount you actually want to put in, not a day's worth of the market. An item
 * only qualifies if it can absorb that inside your horizon at your usual share of its trade ---
 * which is the difference between "is this a good trade" and "can I put a billion into it". Ask for
 * a small amount and almost everything qualifies, which is the spread-thin case; ask for a large
 * one and only the items with the turnover to take it survive.
 */
export function judgeProspect(
  stats: ProspectStats,
  book: Book,
  settings: Settings,
  filters: ProspectFilters,
  estOrders: number,
  /** Keep it whatever it returns, a loss included: the Busy markets view shows the real figure. */
  anyReturn = false,
  /** What was watched of this item's Jita book: per-day extremes and the totals (flow.ts). */
  watched?: { days?: WatchedExtremes; flow?: FlowDay },
): Prospect | null {
  const { bestBuy, bestSell } = book;
  if (bestBuy == null || bestSell == null) return null;
  // NPCs sell it at a fixed price in unlimited supply: players rarely sell below that, so a bid doesn't
  // fill, and there's nothing cheaper to buy and resell. Neither side can be traded, so it isn't shown.
  if (book.npcSell) return null;
  // Where the bulk of trading reaches, not merely one step above the best bid (see bidToPlace). Except in
  // the Busy markets view: on a market trading hundreds of thousands a day, even the small share of
  // trading ESI trims from its daily low is thousands of units, some of them sellers dumping into bids,
  // so a patient top bid does fill. It's priced at the top of the book there, and still flagged.
  // The exact fills the app has watched since the scan count too (`withWatchedLows`): an item the cloud watches
  // is judged on Jita's own dumps, not only ESI's trimmed lows.
  const lows = stats.lows14 && stats.lowsEnd ? withWatchedLows(stats.lows14, stats.lowsEnd, watched?.days) : stats.lows14;
  const placed = bidToPlace(bestBuy, lows);
  // The sell side the same way: where the bulk of trading gets up to, not merely one step under the best ask.
  const highs = stats.highs14 && stats.lowsEnd ? withWatchedHighs(stats.highs14, stats.lowsEnd, watched?.days) : stats.highs14;
  const asked = askToPlace(bestSell, highs);
  // Place and leave: both prices where trading reaches on half the days, wherever the front is. Not capped at the
  // front: on the scoop and Hammerhead II the front bid sat below where trading reached, and it was the dead one.
  // The fortnight alone, not the last few days as at the front (the coordinator's ruling, 1 October 2026): these orders
  // sit behind the front for weeks, and taking the recent window here too removed 30% of the cloud scan's candidates.
  // An item without the days to say where that is can't be priced this way and is left out, not priced at the front.
  const patient = !!filters.patient && !anyReturn;
  const patientBuy = patient && lows ? reachedBid(lows) : null;
  const patientSell = patient && highs ? reachedAsk(highs) : null;
  if (patient && (patientBuy == null || patientSell == null)) return null;
  const buy = patient ? patientBuy! : anyReturn ? placed.top : placed.buy;
  const sell = patient ? patientSell! : anyReturn ? asked.top : asked.sell;
  const bidReach = patient ? bidReachDays(lows!, buy) : placed.bidReach;
  const askReach = patient ? askReachDays(highs!, sell) : asked.askReach;
  const raised = !patient && buy !== placed.top;
  // A buy at or above the sell is a loss, which the Busy markets view shows rather than hides.
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || (!anyReturn && sell <= buy)) return null;

  // Only one side of the daily volume fills each of your orders: sellers dumping into bids fill your
  // buy, buyers taking listings fill your sell. And your share of each side shrinks the more orders
  // you are queued among. The slower side is what limits how much you can push through. Which side
  // trades is read from what the live orders have sold, and what this app has watched, before history.
  const split = tradingSplit({ history: stats.buyerShare, book: book.sold, watched: watched?.flow, typicalDay: stats.unitsPerDay });
  const buyers = split.share;
  // The stock this sell would compete with, in days of the buyers who take listings (LONG_QUEUE_DAYS). A wide spread over
  // a deep queue looks like margin and isn't: the 'Arbalest' launcher's 144% spread at the front sat over two months of stock.
  const listed = listedQueue(book.topSells, sell, asked.top, highs);
  const queue = sellQueue(listed.units, stats.unitsPerDay * buyers, split.from, listed.atLeast);
  const sellShare = competitionShare(settings.share, book.sellOrders);
  const unitsPerDay = throughput(stats.unitsPerDay, buyers, settings.share, book.buyOrders, book.sellOrders,
    patient ? { buy: bidReach! / FILL_WINDOW, sell: askReach! / FILL_WINDOW } : undefined);
  // What you could realistically push through this item in a day, in ISK.
  const perDay = unitsPerDay * buy;
  if (!(perDay > 0)) return null;
  // With no horizon, anything that trades at all can take the budget, and slow is flagged instead.
  const canTake = filters.horizonDays == null ? Infinity : perDay * filters.horizonDays;
  // Too slow to swallow what you want to invest inside the time you'll give it. The planner asks for
  // partial fills instead: it wants to know what each market can take, not only the ones that take all.
  if (canTake < filters.budget && !filters.partial) return null;

  const size = Math.min(filters.budget, canTake);
  const qty = Math.floor(size / buy);
  if (qty < 1) return null;
  const daysToFlip = (qty * buy) / perDay;

  const c = calc({ buy, sell, qty }, settings);
  if (!c.ok) return null;
  // The raises a busy market will cost, off the margin before "Return ≥ %" and the ranking. Not on a plan placed to be
  // left alone: Orders doesn't move those.
  const reserve = patient ? undefined : raisesKeptBack(watched?.flow, rates(settings).k, buy, sell, qty);
  const net = c.net - (reserve ? reserve.isk * qty : 0);
  const roi = net / c.spent;
  if (!anyReturn && (net <= 0 || roi < filters.minRoi)) return null;

  return {
    typeId: stats.typeId, stats, bestBuy, bestSell, buy, sell,
    buyOrders: book.buyOrders, sellOrders: book.sellOrders,
    topBuyVol: book.topBuys[0]?.volume ?? 0, topSellVol: book.topSells[0]?.volume ?? 0,
    qty, net: net / qty, roi, spreadPct: c.spreadPct, traded: tradedPerDay(stats),
    canTake, daysToFlip,
    roiPerDay: returnPerDay(roi, daysToFlip),
    // Profit spread over the days your money is actually tied up, so a fast small flip and a slow
    // big one can be compared at all.
    iskPerDay: net / Math.max(daysToFlip, MIN_DAYS), capital: c.spent,
    share: sellShare, buyerShare: buyers, splitFrom: split.from,
    bidReach, buyRaised: raised, askReach, sellLowered: !patient && sell !== asked.top, patient,
    ...(!patient ? {
      bidRecent: placed.recentReach, askRecent: asked.recentReach,
      ...(placed.window ? { bidWindow: placed.window } : {}),
      ...(asked.window ? { askWindow: asked.window } : {}),
    } : {}),
    ...(reserve ? { raiseReserve: reserve } : {}),
    ...(queue ? { queue: { ...queue, upTo: listed.upTo } } : {}),
    warnings: [
      // A run-up is held to a stricter bar for a plan placed to be left: its ask comes from the climb's own days.
      ...warningsFor(stats, book, c.spreadPct, estOrders, runUpBar(patient)),
      // Priced where trading reaches, a patient plan can't be "not reached". A front reached on the fortnight but not
      // lately (the last few days) is flagged too, and says so (`bidWindow`).
      ...(!patient && placed.window ? ['unreached' as const] : []),
      ...(!patient && asked.window ? ['unreachedSell' as const] : []),
      ...(daysToFlip > SLOW_DAYS ? ['slow' as const] : []),
      ...(queue?.long ? ['longQueue' as const] : []),
    ],
  };
}
