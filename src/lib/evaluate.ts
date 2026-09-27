/**
 * One scanned item judged as a trade: where to buy (where trading reaches), where to sell, how much it can
 * take in your horizon, and what that returns. Moved out of scan.ts so the cloud's opportunity mail judges an
 * item exactly as Prospects does; the watched data is passed in rather than read from the browser's store.
 * Pure.
 */
import { calc, type Settings } from './fees';
import { FILL_RARE, withWatchedHighs, withWatchedLows, type WatchedExtremes } from './fills';
import type { FlowDay } from './flow';
import { askToPlace, bidToPlace, SLOW_DAYS, tradedPerDay, warningsFor } from './prospects';
import { competitionShare, MIN_DAYS, returnPerDay, throughput, tradingSplit, type BookSold } from './split';
import type { BookLevel, Prospect, ProspectFilters, ProspectStats } from './types';

export type Book = { at: string; bestBuy: number | null; bestSell: number | null; buyOrders: number; sellOrders: number; topBuys: BookLevel[]; topSells: BookLevel[]; npcSell?: boolean;
  /** What the live orders had sold per side when read: who trades here. Absent on books cached before it was kept. */
  sold?: BookSold };

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
  const { bidReach } = placed;
  const buy = anyReturn ? placed.top : placed.buy;
  const raised = buy !== placed.top;
  // The sell side the same way: where the bulk of trading gets up to, not merely one step under the best ask.
  const highs = stats.highs14 && stats.lowsEnd ? withWatchedHighs(stats.highs14, stats.lowsEnd, watched?.days) : stats.highs14;
  const asked = askToPlace(bestSell, highs);
  const sell = anyReturn ? asked.top : asked.sell;
  // A buy at or above the sell is a loss, which the Busy markets view shows rather than hides.
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || (!anyReturn && sell <= buy)) return null;

  // Only one side of the daily volume fills each of your orders: sellers dumping into bids fill your
  // buy, buyers taking listings fill your sell. And your share of each side shrinks the more orders
  // you are queued among. The slower side is what limits how much you can push through. Which side
  // trades is read from what the live orders have sold, and what this app has watched, before history.
  const split = tradingSplit({ history: stats.buyerShare, book: book.sold, watched: watched?.flow, typicalDay: stats.unitsPerDay });
  const buyers = split.share;
  const sellShare = competitionShare(settings.share, book.sellOrders);
  const unitsPerDay = throughput(stats.unitsPerDay, buyers, settings.share, book.buyOrders, book.sellOrders);
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
  if (!c.ok || (!anyReturn && (c.net <= 0 || c.roi < filters.minRoi))) return null;

  return {
    typeId: stats.typeId, stats, bestBuy, bestSell, buy, sell,
    buyOrders: book.buyOrders, sellOrders: book.sellOrders,
    topBuyVol: book.topBuys[0]?.volume ?? 0, topSellVol: book.topSells[0]?.volume ?? 0,
    qty, net: c.net / qty, roi: c.roi, spreadPct: c.spreadPct, traded: tradedPerDay(stats),
    canTake, daysToFlip,
    roiPerDay: returnPerDay(c.roi, daysToFlip),
    // Profit spread over the days your money is actually tied up, so a fast small flip and a slow
    // big one can be compared at all.
    iskPerDay: c.net / Math.max(daysToFlip, MIN_DAYS), capital: c.spent,
    share: sellShare, buyerShare: buyers, splitFrom: split.from,
    bidReach, buyRaised: raised, askReach: asked.askReach, sellLowered: sell !== asked.top,
    warnings: [
      ...warningsFor(stats, book, c.spreadPct, estOrders),
      ...(bidReach != null && bidReach < FILL_RARE ? ['unreached' as const] : []),
      ...(asked.askReach != null && asked.askReach < FILL_RARE ? ['unreachedSell' as const] : []),
      ...(daysToFlip > SLOW_DAYS ? ['slow' as const] : []),
    ],
  };
}
