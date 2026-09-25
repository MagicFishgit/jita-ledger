/**
 * Turning loyalty points into ISK.
 *
 * An LP store offer is a trade, not a gift: you hand over loyalty points, ISK, and sometimes a pile
 * of items you had to buy first, and get something back you then have to sell. What matters is what
 * is left per loyalty point once all of that is counted --- and whether the thing you get back can
 * actually be sold, which is the same question the Prospects page asks about any item.
 */

import { tickDown } from './tick';

export type LpOffer = {
  offerId: number;
  typeId: number;
  /** How many you get for one run of the offer. */
  quantity: number;
  lpCost: number;
  iskCost: number;
  requiredItems: { typeId: number; quantity: number }[];
};

/** What one unit of an item is worth to you, and what it costs to get hold of one. */
export type UnitPrice = {
  /** Proceeds per unit after broker fee and sales tax. */
  net: number;
  /** What you pay per unit to buy one now. */
  buy: number;
};

export type LpValue = {
  offerId: number;
  typeId: number;
  quantity: number;
  lpCost: number;
  /** Net proceeds from selling everything this offer hands you. */
  revenue: number;
  /** The store's own ISK price. */
  iskCost: number;
  /** Buying the items the offer demands before it will trade with you. */
  itemsCost: number;
  outlay: number;
  profit: number;
  /** The number that ranks offers: ISK left per loyalty point spent. */
  iskPerLp: number;
  /** How many times your loyalty points afford this. */
  runs: number;
  totalProfit: number;
  /** Items in this offer we could not price, so the figures above are incomplete. */
  unpriced: number[];
};

/**
 * `priceOf` returns null for anything that cannot be priced. An offer whose OUTPUT cannot be priced
 * is dropped entirely --- there is no honest number to show. One whose required items cannot be
 * priced is kept but flagged, since its outlay is understated and that is worth seeing rather than
 * hiding.
 */
export function valueOffer(
  offer: LpOffer,
  priceOf: (typeId: number) => UnitPrice | null,
  lpAvailable: number,
): LpValue | null {
  if (offer.lpCost <= 0 || offer.quantity <= 0) return null;
  const out = priceOf(offer.typeId);
  if (!out) return null;

  const unpriced: number[] = [];
  let itemsCost = 0;
  for (const req of offer.requiredItems) {
    const p = priceOf(req.typeId);
    if (!p) { unpriced.push(req.typeId); continue; }
    itemsCost += p.buy * req.quantity;
  }

  const revenue = out.net * offer.quantity;
  const outlay = offer.iskCost + itemsCost;
  const profit = revenue - outlay;
  const runs = Math.floor(Math.max(0, lpAvailable) / offer.lpCost);

  return {
    offerId: offer.offerId, typeId: offer.typeId, quantity: offer.quantity, lpCost: offer.lpCost,
    revenue, iskCost: offer.iskCost, itemsCost, outlay, profit,
    iskPerLp: profit / offer.lpCost,
    runs, totalProfit: profit * runs,
    unpriced,
  };
}

/** Best return per loyalty point first: points are the scarce thing, not ISK. */
export function byIskPerLp(a: LpValue, b: LpValue): number {
  return b.iskPerLp - a.iskPerLp;
}

/** The two sides of an item's Jita book, or a rough global average standing in for both. */
export type Quote = { bestSell: number | null; bestBuy: number | null };

/**
 * What a unit is worth if you list it and wait --- one legal step under the cheapest genuine
 * listing, less your broker fee and sales tax. This is the number a station trader cares about,
 * because listing is what they do anyway.
 *
 * With no sell orders at all there is no ask to undercut, so the best bid stands in: an
 * understatement rather than a guess in the flattering direction.
 */
export function patientPrice(q: Quote, fee: number, tax: number): UnitPrice | null {
  if (q.bestSell != null && q.bestSell > 0) {
    const ask = tickDown(q.bestSell);
    return { net: (Number.isFinite(ask) ? ask : q.bestSell) * (1 - fee - tax), buy: q.bestSell };
  }
  if (q.bestBuy != null && q.bestBuy > 0) return { net: q.bestBuy * (1 - fee - tax), buy: q.bestBuy };
  return null;
}

/**
 * What a unit is worth if you sell into the standing buy orders this second: the best bid less
 * sales tax only, since filling someone else's order costs no broker fee.
 *
 * Nothing bidding means there is no instant sale, so there is no figure to report.
 */
export function instantPrice(q: Quote, tax: number): UnitPrice | null {
  if (q.bestBuy == null || q.bestBuy <= 0) return null;
  return { net: q.bestBuy * (1 - tax), buy: q.bestSell ?? q.bestBuy };
}

/** How long the market takes to absorb a number of units, at your share of its daily flow. */
export function daysToClear(units: number, unitsPerDay: number | null, sharePct = 100): number {
  if (!unitsPerDay || unitsPerDay <= 0 || sharePct <= 0) return Infinity;
  return units / (unitsPerDay * (sharePct / 100));
}

/**
 * What you would actually do with your points, as opposed to what you could afford.
 *
 * Affording 666 runs of an implant that trades five a day is not a plan --- the market will not take
 * them inside any sensible time, and listing them all at once only means competing with yourself.
 * So the number of runs is capped by what the market can absorb in the horizon you are willing to
 * wait, and the page says which of the two limits is biting.
 */
export type LpPlan = {
  /** Runs your points afford. */
  affordable: number;
  /** Runs the market will absorb inside the horizon; null when there is no history to judge by. */
  absorbable: number | null;
  runs: number;
  units: number;
  /** How long selling that many takes. One run's worth when the plan is for no runs at all. */
  days: number;
  limitedBy: 'points' | 'market' | 'unknown';
  profit: number;
};

export function planFor(v: LpValue, unitsPerDay: number | null, horizonDays: number, sharePct: number): LpPlan {
  const flowing = unitsPerDay != null && unitsPerDay > 0;
  const absorbable = flowing ? Math.floor((unitsPerDay * (sharePct / 100) * horizonDays) / v.quantity) : null;
  const runs = absorbable == null ? v.runs : Math.min(v.runs, absorbable);
  const units = runs * v.quantity;
  return {
    affordable: v.runs, absorbable, runs, units,
    days: daysToClear(Math.max(units, v.quantity), unitsPerDay, sharePct),
    limitedBy: absorbable == null ? 'unknown' : absorbable < v.runs ? 'market' : 'points',
    profit: v.profit * runs,
  };
}

export type LpNote =
  | 'loss' | 'topRate' | 'poorRate'
  | 'fast' | 'slow' | 'illiquid' | 'capped'
  | 'needsItems' | 'capitalHeavy' | 'unpriced' | 'rough' | 'patienceMatters';

/**
 * Why an offer sits where it does, as keys the page turns into sentences.
 *
 * The rate alone is not the whole answer: a superb rate on something the market absorbs twice a
 * month is not a way to turn points into ISK, and an offer whose required items cost most of what
 * you get back is a way to tie up capital rather than to make money.
 */
export function notesFor(
  v: LpValue,
  ctx: { medianRate: number; plan: LpPlan; runDays: number; live: boolean; instantPerLp?: number | null },
): LpNote[] {
  const n: LpNote[] = [];
  if (v.profit <= 0) n.push('loss');
  else if (ctx.medianRate > 0 && v.iskPerLp >= ctx.medianRate * 2) n.push('topRate');
  else if (ctx.medianRate > 0 && v.iskPerLp <= ctx.medianRate * 0.5) n.push('poorRate');

  // Judged on one run, which is what you would list at a time. The whole plan always fills the
  // horizon by construction, so its length says nothing about the item.
  if (!Number.isFinite(ctx.runDays)) n.push('illiquid');
  else if (ctx.runDays <= 1) n.push('fast');
  else if (ctx.runDays > 7) n.push('slow');
  if (ctx.plan.limitedBy === 'market' && v.profit > 0) n.push('capped');

  if (v.itemsCost > 0 && v.itemsCost > v.revenue * 0.25) n.push('needsItems');
  if (v.profit > 0 && v.outlay > v.revenue * 0.6) n.push('capitalHeavy');
  if (v.unpriced.length) n.push('unpriced');
  if (!ctx.live) n.push('rough');
  if (v.profit > 0 && ctx.instantPerLp != null && ctx.instantPerLp < v.iskPerLp * 0.5) n.push('patienceMatters');
  return n;
}

/** One line of the suggested spend: take this offer this many times. */
export type LpPick = { offerId: number; typeId: number; runs: number; lpSpent: number; profit: number };

/**
 * How to spend a pile of points across the whole store, rather than on one offer.
 *
 * Taking the best rate until the market will take no more, then the next best, and so on. This is
 * the question a trader actually has --- "what do I do with 250,000 points" --- and the answer is
 * rarely one offer, because the best rate is usually on something thin.
 *
 * `unitsAllowed` is per item, not per offer: two offers handing over the same item compete for the
 * same buyers, so the allowance is shared between them.
 */
export function spendPlan(
  candidates: { v: LpValue; unitsAllowed: number | null }[],
  lpAvailable: number,
): LpPick[] {
  const left = new Map<number, number | null>();
  for (const c of candidates) if (!left.has(c.v.typeId)) left.set(c.v.typeId, c.unitsAllowed);

  let lp = Math.max(0, lpAvailable);
  const picks: LpPick[] = [];
  for (const { v } of [...candidates].sort((a, b) => byIskPerLp(a.v, b.v))) {
    if (v.profit <= 0 || v.lpCost <= 0) continue;
    const units = left.get(v.typeId);
    const byMarket = units == null ? Infinity : Math.floor(units / v.quantity);
    const runs = Math.min(Math.floor(lp / v.lpCost), byMarket);
    if (runs <= 0) continue;
    picks.push({ offerId: v.offerId, typeId: v.typeId, runs, lpSpent: runs * v.lpCost, profit: runs * v.profit });
    lp -= runs * v.lpCost;
    if (units != null) left.set(v.typeId, units - runs * v.quantity);
    if (lp <= 0) break;
  }
  return picks;
}
