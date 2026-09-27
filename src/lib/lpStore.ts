import { jitaBook, loyaltyOffers, marketHistory, recentAverages, roughPricesShared } from './market';
import { byIskPerLp, patientPrice, planFor, spendPlan, valueOffer, type LpOffer, type LpValue, type Quote } from './loyalty';
import { marketBest } from './relist';
import { buyerShare } from './split';

/**
 * Pricing a loyalty store, shared by the Loyalty page and the Wallet's net worth.
 *
 * Everything is first ranked on CCP's rough global prices (one request for the lot), then the best
 * PRICE_TOP offers are priced properly against the live Jita book and their trading history. That's the
 * affordable way to find what's worth pricing, and it's what both pages need.
 */
export const PRICE_TOP = 40;

export type StorePricing = {
  offers: LpOffer[];
  quotes: Record<number, Quote>;
  /** Types priced against the live book rather than the rough average. */
  live: Set<number>;
  /** Units a day each live-priced type trades. */
  vol: Record<number, number | null>;
  /** Share of each live-priced type's volume that is buyers taking listings: what fills a sell order. */
  buyers: Record<number, number>;
};

/** Price types against the live Jita book and read their pace, into `p`. */
async function priceTypes(ids: number[], p: StorePricing, onProgress?: (done: number, total: number) => void): Promise<void> {
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        const book = await jitaBook(id);
        // marketBest, not the raw best: one mispriced listing must not set the valuation.
        p.quotes[id] = { bestSell: marketBest(book.topSells, false), bestBuy: marketBest(book.topBuys, true) };
        p.live.add(id);
      } catch { /* the rough price stands */ }
      try {
        const h = await marketHistory(id);
        p.vol[id] = recentAverages(h, 7).avgVol;
        p.buyers[id] = buyerShare(h.slice(-30));
      } catch { p.vol[id] = null; }
      onProgress?.(++done, ids.length);
    }
  }));
}

/** The types behind some offers: what they hand over, and what they demand first. */
const typesOf = (offers: LpOffer[], picks: { offerId: number }[]) => {
  const byOffer = new Map(offers.map((x) => [x.offerId, x]));
  return [...new Set(picks.flatMap((s) => [byOffer.get(s.offerId)!.typeId, ...(byOffer.get(s.offerId)?.requiredItems.map((x) => x.typeId) ?? [])]))];
};

export async function priceStore(corp: number, lp: number, r: { f: number; t: number }, onProgress?: (done: number, total: number) => void): Promise<StorePricing> {
  const [offers, rough] = await Promise.all([loyaltyOffers(corp), roughPricesShared()]);
  const quotes: Record<number, Quote> = {};
  for (const [id, p] of Object.entries(rough)) quotes[Number(id)] = { bestSell: p, bestBuy: p };
  const shortlist = offers
    .map((x) => valueOffer(x, (id) => (quotes[id] ? patientPrice(quotes[id], r.f, r.t) : null), lp))
    .filter((x): x is LpValue => !!x).sort(byIskPerLp).slice(0, PRICE_TOP);
  const p: StorePricing = { offers, quotes, live: new Set(), vol: {}, buyers: {} };
  await priceTypes(typesOf(offers, shortlist), p, onProgress);
  return p;
}

/**
 * Price every other offer that looks profitable on the rough prices. The first pass only prices the
 * best PRICE_TOP, which left good offers further down (attribute implants, 420–500 ISK a point, ranked
 * 101st–181st in the Caldari Navy store) on a global average, and out of reach of anything that needs
 * a pace. Returns a new pricing; the one passed in isn't changed.
 */
export async function priceRest(p0: StorePricing, lp: number, r: { f: number; t: number }, onProgress?: (done: number, total: number) => void): Promise<StorePricing> {
  const p: StorePricing = { offers: p0.offers, quotes: { ...p0.quotes }, live: new Set(p0.live), vol: { ...p0.vol }, buyers: { ...p0.buyers } };
  const rest = p.offers
    .map((x) => valueOffer(x, (id) => (p.quotes[id] ? patientPrice(p.quotes[id], r.f, r.t) : null), lp))
    .filter((x): x is LpValue => !!x && x.profit > 0 && !p.live.has(x.typeId));
  await priceTypes(typesOf(p.offers, rest).filter((id) => !p.live.has(id)), p, onProgress);
  return p;
}

/**
 * What a balance of points turns into: the spend plan's profit per point, and how many points it could
 * place. Only offers priced against the live book, with a trading history to cap them, are used, as on
 * the Loyalty page. Null when nothing in the store would take any points at a profit.
 */
export function storeRate(p: StorePricing, lp: number, r: { f: number; t: number }, horizonDays: number, sharePct: number): { rate: number; lp: number } | null {
  const patient = (id: number) => (p.quotes[id] ? patientPrice(p.quotes[id], r.f, r.t) : null);
  const candidates = p.offers
    .map((o) => valueOffer(o, patient, lp))
    .filter((v): v is LpValue => !!v && p.live.has(v.typeId))
    .map((v) => ({ v, plan: planFor(v, p.vol[v.typeId] ?? null, horizonDays, sharePct) }))
    .filter((x) => x.plan.absorbable != null)
    .map((x) => ({ v: x.v, unitsAllowed: (x.plan.absorbable ?? 0) * x.v.quantity }));
  const picks = spendPlan(candidates, lp);
  const spent = picks.reduce((t, x) => t + x.lpSpent, 0);
  if (!spent) return null;
  return { rate: picks.reduce((t, x) => t + x.profit, 0) / spent, lp: spent };
}
