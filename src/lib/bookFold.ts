/**
 * A market's orders folded into per-item book summaries as pages are read, never the orders whole (docs/notes/industry.md,
 * stage 4). The cloud's daily scan folds all of The Forge's book this way (worker/src/scan.ts, which keeps its own NPC and
 * blueprint-seller folds beside it), and its hourly read of a structure's market folds that structure's
 * (worker/src/homeMarkets.ts). Pure, and the Worker imports it: nothing here may import ./config, the store, React or the DOM.
 */
import type { Book } from './evaluate';
import { NPC_DURATION } from './constants';
import { SELLS_COUNTED_TO } from './prospects';
import type { BookSold } from './split';
import type { BookLevel } from './types';

export type RawOrder = { order_id: number; type_id: number; location_id: number; is_buy_order: boolean; price: number; volume_remain: number; volume_total: number; duration: number;
  issued?: string; min_volume?: number; range?: string };
/** Price levels kept per side, as the app's book summary keeps them. */
export const LEVELS = 7;
/**
 * One item's book as the pages are read. `deep` is every sell price within SELLS_COUNTED_TO times the best ask (price → units),
 * for the scan's count of the whole queue (`sellsTo`): the seven levels alone held 2,781 of the Arbalest's 5,170 units up to where
 * trading reached on 2 October 2026. A structure's read keeps none.
 */
export type Agg = { buys: BookLevel[]; sells: BookLevel[]; buyOrders: number; sellOrders: number; sold: Required<BookSold>; npcSell: boolean; deep: Map<number, number> };

/** Adds an order to the best LEVELS levels on its side. A level dropped is worse than every level kept, and so is anything at its price later. */
function addLevel(levels: BookLevel[], price: number, volume: number, isBuy: boolean) {
  const at = levels.find((l) => l.price === price);
  if (at) { at.volume += volume; return; }
  const better = (a: number, b: number) => (isBuy ? a > b : a < b);
  if (levels.length >= LEVELS && !better(price, levels[levels.length - 1].price)) return;
  levels.push({ price, volume });
  levels.sort((a, b) => (isBuy ? b.price - a.price : a.price - b.price));
  if (levels.length > LEVELS) levels.pop();
}

/**
 * Keeps a sell price for the whole-queue count, if it's within SELLS_COUNTED_TO times the best ask. The best only falls as pages
 * come in, so a price dropped was over that bound then and is over it at the end: what's kept at the end is every listing up to
 * SELLS_COUNTED_TO times the final best ask, whatever order the pages came in.
 */
function addDeep(a: Agg, price: number, volume: number, wasBest: number | undefined) {
  const best = a.sells[0].price;
  if (price > SELLS_COUNTED_TO * best) return;
  a.deep.set(price, (a.deep.get(price) ?? 0) + volume);
  // A new best ask: let go of what's now past the bound.
  if (wasBest != null && best < wasBest) for (const p of a.deep.keys()) if (p > SELLS_COUNTED_TO * best) a.deep.delete(p);
}

/** One order into its item's summary. `deep`: keep the sell prices for the scan's queue count (a structure's read doesn't). */
export function fold(aggs: Map<number, Agg>, o: RawOrder, deep = true) {
  let a = aggs.get(o.type_id);
  if (!a) {
    a = { buys: [], sells: [], buyOrders: 0, sellOrders: 0, sold: { sell: 0, buy: 0, single: { sell: 0, buy: 0 }, orders: { sell: 0, buy: 0 } }, npcSell: false, deep: new Map() };
    aggs.set(o.type_id, a);
  }
  const side = o.is_buy_order ? 'buy' : 'sell';
  if (o.is_buy_order) a.buyOrders++; else a.sellOrders++;
  const wasBest = a.sells[0]?.price;
  addLevel(o.is_buy_order ? a.buys : a.sells, o.price, o.volume_remain, o.is_buy_order);
  if (deep && !o.is_buy_order) addDeep(a, o.price, o.volume_remain, wasBest);
  // What the live orders have already sold, as `soldFrom` counts it, one order at a time.
  const total = o.volume_total ?? o.volume_remain;
  a.sold[side] += Math.max(0, total - o.volume_remain);
  a.sold.orders[side]++;
  if (total === 1) a.sold.single[side]++;
  if (!o.is_buy_order && (o.duration ?? 0) >= NPC_DURATION) a.npcSell = true;
}

/** The summary without the scan's notes: the seven levels a side, order counts, what the live orders sold, NPCs in the book. */
export function plainBook(a: Agg, at: string): Book {
  return {
    at, bestBuy: a.buys[0]?.price ?? null, bestSell: a.sells[0]?.price ?? null,
    buyOrders: a.buyOrders, sellOrders: a.sellOrders, topBuys: a.buys, topSells: a.sells, npcSell: a.npcSell, sold: a.sold,
  };
}

/** Levels a side a structure's read keeps for each type: enough to buy a week's need up them (industryRank's sourceMaterial). */
export const HOME_LEVELS = 5;
/** One type in a structure's market as the hourly read keeps it: the best levels a side, order counts, what the live orders sold. */
export type StructureRow = [buys: [number, number][], sells: [number, number][], buyOrders: number, sellOrders: number, sold: [sell: number, buy: number, singleSell: number, singleBuy: number]];

/** A page of a structure's market: every order of a watched type (a structure's market holds only its own orders). */
export function foldStructurePage(aggs: Map<number, Agg>, orders: readonly RawOrder[], want: ReadonlySet<number>) {
  for (const o of orders) if (want.has(o.type_id)) fold(aggs, o, false);
}

/** What a structure's read keeps: each type's best HOME_LEVELS levels a side as [price, units], order counts and sold counts. */
export function structureSummary(aggs: ReadonlyMap<number, Agg>): Record<number, StructureRow> {
  const out: Record<number, StructureRow> = {};
  const lv = (x: BookLevel[]) => x.slice(0, HOME_LEVELS).map((l): [number, number] => [l.price, l.volume]);
  for (const [t, a] of aggs) out[t] = [lv(a.buys), lv(a.sells), a.buyOrders, a.sellOrders, [a.sold.sell, a.sold.buy, a.sold.single.sell, a.sold.single.buy]];
  return out;
}
