/**
 * Buying in Jita and selling in another trade hub.
 *
 * Every figure here is read from the two live books, the hub's own trading history and the item's
 * volume. The one thing that cannot be read is what the haul will cost you, because that is a quote
 * from a hauling service, your own time, or a courier reward you choose --- so the page asks for it.
 */

import { listingPrice } from './fills';
import { tickDown, tickUp } from './tick';
import { sideVolume } from './split';

/**
 * The four hubs besides Jita. Held by station ID: `/universe/ids/` will not resolve Amarr's trade
 * station by name (the parentheses in it, as far as can be told), while NPC station IDs never change.
 * Each ID was checked against `/universe/stations/{id}/`, which returns exactly the name beside it.
 */
export const HUBS: { name: string; station: string; stationId: number }[] = [
  { name: 'Amarr', station: 'Amarr VIII (Oris) - Emperor Family Academy', stationId: 60008494 },
  { name: 'Dodixie', station: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant', stationId: 60011866 },
  { name: 'Rens', station: 'Rens VI - Moon 8 - Brutor Tribe Treasury', stationId: 60004588 },
  { name: 'Hek', station: 'Hek VIII - Moon 12 - Boundless Creation Factory', stationId: 60005686 },
];

/**
 * The two high-sec systems gank fleets are known to camp, on the secure Jita–Amarr route. Resolved by
 * name at runtime. Niarja used to be the other one, but it has been Pochven since 2020 (ESI gives it
 * −1.0), so a high-sec route can never pass through it; the route now runs Uedama → Sivala.
 */
export const GANK_SYSTEMS = ['Uedama', 'Sivala'];

export type BuyMode = 'sells' | 'order';

export type HubQuote = {
  typeId: number;
  m3: number;
  jitaBestBuy: number | null;
  jitaBestSell: number | null;
  hubBestSell: number | null;
  /** The hub's best bid and the last 14 days' highs in its region, so a listing is priced where trading reaches. */
  hubBestBuy?: number | null;
  hubHighs?: (number | null)[] | null;
  hubUnitsPerDay: number | null;
  /** Share of the hub's volume that is buyers taking sells: who your listing there sells to. */
  hubBuyers: number;
};

export type HubRow = HubQuote & {
  /** What one unit costs you in Jita, fee included when you place an order for it. */
  cost: number;
  /** What you would list at: one step under the hub's cheapest listing when trading there gets up to it, else where it does (`listingPrice`). */
  listAt: number;
  /** Per unit, after the hub's broker fee and sales tax, before hauling. */
  gross: number;
  /** Units the hub will take within the selling window at your share. */
  lot: number;
  sellDays: number;
};

/**
 * One item priced both ends. Returns null when either book is empty or it loses before hauling.
 *
 * Buying from Jita's sell orders costs the listed price and nothing more; placing a buy order costs a
 * step above the best bid plus the broker fee, and is slower. Selling at the hub is always a listing,
 * so it carries a broker fee and sales tax.
 */
export function priceHub(q: HubQuote, mode: BuyMode, r: { f: number; t: number }, sharePct: number, sellWithinDays: number): HubRow | null {
  const cost = mode === 'sells'
    ? q.jitaBestSell
    : q.jitaBestBuy != null ? tickUp(q.jitaBestBuy) * (1 + r.f) : null;
  if (cost == null || !Number.isFinite(cost) || cost <= 0 || q.hubBestSell == null) return null;
  // A sell side nothing trades near would invent a haul worth making: price where trading reaches instead.
  const listAt = listingPrice(q.hubBestSell, q.hubBestBuy ?? null, q.hubHighs) ?? tickDown(q.hubBestSell);
  if (!Number.isFinite(listAt)) return null;
  const gross = listAt * (1 - r.f - r.t) - cost;
  if (gross <= 0) return null;
  const fills = q.hubUnitsPerDay != null ? sideVolume(q.hubUnitsPerDay, q.hubBuyers, false) * (sharePct / 100) : 0;
  const lot = Math.floor(fills * sellWithinDays);
  return { ...q, cost, listAt, gross, lot, sellDays: fills > 0 ? lot / fills : Infinity };
}

export type Shipment = {
  m3: number;
  collateral: number;
  gross: number;
  haul: number;
  net: number;
  roi: number;
  /** Delivery plus the slowest item's selling time. */
  days: number;
  roiPerDay: number;
  /** Hauling spread over the cargo by volume, per unit of each item. */
  haulPerUnit: Record<number, number>;
};

/**
 * A shipment of chosen rows. Hauling is charged by volume, so it is spread across the items by the
 * space each takes: dense, valuable things carry it best.
 */
export function shipment(rows: HubRow[], haul: number, deliveryDays: number): Shipment {
  const m3 = rows.reduce((t, x) => t + x.lot * x.m3, 0);
  const collateral = rows.reduce((t, x) => t + x.lot * x.cost, 0);
  const gross = rows.reduce((t, x) => t + x.lot * x.gross, 0);
  const net = gross - haul;
  const sellDays = rows.length ? Math.max(...rows.map((x) => (Number.isFinite(x.sellDays) ? x.sellDays : 0))) : 0;
  const days = Math.max(1 / 24, deliveryDays + sellDays);
  const haulPerUnit: Record<number, number> = {};
  for (const x of rows) haulPerUnit[x.typeId] = m3 > 0 ? (haul * x.m3) / m3 : 0;
  const roi = collateral > 0 ? net / collateral : 0;
  return { m3, collateral, gross, haul, net, roi, days, roiPerDay: roi / days, haulPerUnit };
}

/** The going courier rate per cubic metre on a route, from real public contracts. Median, so one odd contract cannot set it. */
export function goingRate(contracts: { reward: number; volume: number }[]): number | null {
  const rates = contracts.filter((c) => c.volume > 0 && c.reward > 0).map((c) => c.reward / c.volume).sort((a, b) => a - b);
  if (!rates.length) return null;
  const m = rates.length >> 1;
  return rates.length % 2 ? rates[m] : (rates[m - 1] + rates[m]) / 2;
}
