/**
 * The sniper: listings someone priced well under where the item trades, worth buying and relisting, and bids
 * unusually high for things you hold. Pure; the cloud reads the book (worker/src/snipe.ts) and both it and the
 * Sniper page judge with these.
 *
 * Checked on the live Forge book on 28 September 2026 (00:26 EVE): 196 Jita listings sat 5%+ under where their
 * item trades after fees, 61 of them worth 1 M+. The biggest on paper weren't mistakes: seven R.A.M. blueprints at
 * exactly 296,000 or 382,000 against 600k–1M history, days old and 11–20 days of the item's trading, one seller
 * flooding at a price the market is moving to. So a listing is only called a mistake when nothing doubts it
 * (`doubts`): not a flood, not an item whose price just moved, not a thin history, not days old, not several
 * sellers at the same cheap price. Of the fresh ones (priced within the hour), 10 of 31 were gone 20 minutes
 * later and 3 of the 4 worth 1 M+ were still there: a read every five minutes is fast enough to be useful.
 *
 * Buying from a listing costs nothing beyond its price (no broker fee, no tax); relisting costs the broker fee
 * and the sales tax; selling straight into a bid costs the tax only.
 */
import { reachedAsk } from './fills';
import { MOVED } from './prospects';
import { tickDown } from './tick';
import type { ProspectStats } from './types';

/** The widest net, for the cloud to keep: best-case rates (Broker Relations V, both standings at 10, Accounting V). */
export const BASE_RATES = { f: 0.01, t: 0.03375 };
/** What the cloud keeps at those rates: 5% after fees and 1 M ISK. Each viewer's own thresholds narrow it. */
export const SNIPE_FLOOR = { margin: 0.05, profit: 1_000_000 };
/** The Sniper's default thresholds, which the user agreed to: 10% after fees and 5 M ISK. */
export const SNIPE_DEFAULTS = { minPct: 10, minIsk: 5_000_000 };
/** Cheap stock worth more than this many days of the item's trading is a flood at a price, not a slip. */
export const FLOOD_DAYS = 3;
/** Priced longer ago than this and still there: the market has had its chance and passed. */
export const STALE_H = 24;
/** An item that traded on fewer of the last 30 days has too little history to say where it trades. */
export const THIN_DAYS = 7;
/** This many separate orders at the cheap end is several sellers agreeing on a price. */
export const SEVERAL = 3;
/** Sell orders kept per item: enough to walk the cheap end of any book. */
export const KEEP_SELLS = 30;

export type SnipeOrder = { id: number; price: number; units: number; total: number; issued: string };
export type SnipeStats = Pick<ProspectStats, 'highs14' | 'unitsPerDay' | 'daysTraded' | 'lastMove'>;
export type Doubt = 'flood' | 'moved' | 'thin' | 'stale' | 'several';

export const DOUBT_SAID: Record<Doubt, { short: string; why: string }> = {
  flood: { short: 'Flood', why: `The cheap stock is more than ${FLOOD_DAYS} days of what the item trades: someone selling out at a price, which the market may be moving to, not a slip of the finger.` },
  moved: { short: 'Price just moved', why: 'The item’s latest day traded more than 50% away from the days before it. History is behind the market, so “where it trades” may be out of date.' },
  thin: { short: 'Thin history', why: `It traded on fewer than ${THIN_DAYS} of the last 30 days: too little to say where it trades, and easy to fake by trading with yourself.` },
  stale: { short: 'Days old', why: `Priced more than ${STALE_H} hours ago and still there. Real mistakes get bought quickly; one the market has left alone probably isn’t one.` },
  several: { short: 'Several sellers', why: `${SEVERAL} or more separate orders at the cheap end: several sellers agreeing on a price, not one mistake.` },
};

export type SnipeListing = {
  typeId: number;
  /** The orders to buy, cheapest first. */
  orderIds: number[];
  units: number;
  /** What buying them all costs: no fee or tax on top. */
  cost: number;
  cheapest: number;
  /** The dearest of the orders worth buying. */
  top: number;
  /** Where to relist: one step under the next listing, never above where trading reaches on half the days. */
  resale: number;
  /** Where the bulk of trading got up to on half the last 14 days. */
  fair: number;
  /** The next listing after the cheap ones, if any. */
  nextAsk: number | null;
  /** When the cheapest one was priced (ESI's `issued`: a price change moves it). */
  pricedAt: string;
  /** Someone has already bought part of one of them. */
  partly: boolean;
  perDay: number;
  daysTraded: number;
  lastMove: number | null;
  doubts: Doubt[];
};

/**
 * The cheap end of one item's Jita sells, if it's worth buying out and relisting. `sells` is sorted cheapest first
 * and may be cut short (`more`): a run of cheap orders that fills everything kept is a flood, not a mistake.
 */
export function findListing(typeId: number, sells: SnipeOrder[], more: boolean, s: SnipeStats | undefined, now: number): SnipeListing | null {
  if (!sells.length || !s?.highs14) return null;
  const fair = reachedAsk(s.highs14);
  if (fair == null) return null;
  const keep = 1 - BASE_RATES.f - BASE_RATES.t;
  let j = 0;
  while (j < sells.length) {
    const p = sells[j].price;
    const next = sells.slice(j + 1).find((o) => o.price > p);
    const resale = Math.min(fair, next ? tickDown(next.price) : fair);
    if (resale * keep < p * (1 + SNIPE_FLOOR.margin)) break;
    j++;
  }
  if (!j || (j === sells.length && more)) return null;
  const bought = sells.slice(0, j);
  const nextAsk = j < sells.length ? sells[j].price : null;
  const resale = Math.min(fair, nextAsk != null ? tickDown(nextAsk) : fair);
  const units = bought.reduce((n, o) => n + o.units, 0);
  const cost = bought.reduce((n, o) => n + o.price * o.units, 0);
  if (units * resale * keep - cost < SNIPE_FLOOR.profit) return null;
  const perDay = s.unitsPerDay ?? 0;
  const pricedAt = bought[0].issued;
  const doubts: Doubt[] = [];
  if (!(perDay > 0) || units / perDay > FLOOD_DAYS) doubts.push('flood');
  if ((s.lastMove ?? 0) > MOVED) doubts.push('moved');
  if ((s.daysTraded ?? 0) < THIN_DAYS) doubts.push('thin');
  if (now - Date.parse(pricedAt) > STALE_H * 3600_000) doubts.push('stale');
  if (bought.length >= SEVERAL) doubts.push('several');
  return {
    typeId, orderIds: bought.map((o) => o.id), units, cost, cheapest: bought[0].price, top: bought[bought.length - 1].price,
    resale, fair, nextAsk, pricedAt, partly: bought.some((o) => o.units < o.total),
    perDay, daysTraded: s.daysTraded ?? 0, lastMove: s.lastMove ?? null, doubts,
  };
}

/** A Jita bid, kept when it pays more than listing where the item trades would: for someone who holds the item. */
export type SnipeBid = { typeId: number; orderId: number; price: number; units: number; minVolume: number; fair: number; issued: string; doubts: Doubt[] };

export function findBid(typeId: number, bid: { id: number; price: number; units: number; minVolume: number; issued: string }, s: SnipeStats | undefined): SnipeBid | null {
  if (!s?.highs14) return null;
  const fair = reachedAsk(s.highs14);
  if (fair == null) return null;
  if (bid.price * (1 - BASE_RATES.t) < fair * (1 - BASE_RATES.f - BASE_RATES.t) * (1 + SNIPE_FLOOR.margin)) return null;
  const doubts: Doubt[] = [];
  if ((s.lastMove ?? 0) > MOVED) doubts.push('moved');
  if ((s.daysTraded ?? 0) < THIN_DAYS) doubts.push('thin');
  return { typeId, orderId: bid.id, price: bid.price, units: bid.units, minVolume: bid.minVolume, fair, issued: bid.issued, doubts };
}

/** One read of the book, as the cloud keeps it. */
export type SnipeRead = { at: string; expires: string | null; pages: number; listings: SnipeListing[]; bids: SnipeBid[] };

export type SnipeRow = SnipeListing & { profit: number; pct: number; sellDays: number; worth: boolean };

/** At your rates and share: what each listing makes, how long it takes to resell, and whether it clears your bar. */
export function judgeListings(list: SnipeListing[], r: { f: number; t: number }, sharePct: number, bar: { minIsk: number; minPct: number }): SnipeRow[] {
  return list.map((x) => {
    const profit = x.units * x.resale * (1 - r.f - r.t) - x.cost;
    const pct = x.cost > 0 ? profit / x.cost : 0;
    const pace = x.perDay * Math.max(0.001, sharePct / 100);
    const sellDays = pace > 0 ? x.units / pace : Infinity;
    return { ...x, profit, pct, sellDays, worth: !x.doubts.length && profit >= bar.minIsk && pct * 100 >= bar.minPct };
  }).sort((a, b) => b.profit - a.profit);
}

export type HeldBidRow = SnipeBid & { held: number; qty: number; proceeds: number; gain: number; pct: number; worth: boolean };

/** Bids for what you hold in Jita: what selling into them gets, and how much more that is than listing where the item trades. */
export function judgeBids(bids: SnipeBid[], r: { f: number; t: number }, heldInJita: Record<number, number>, bar: { minIsk: number; minPct: number }): HeldBidRow[] {
  const out: HeldBidRow[] = [];
  for (const b of bids) {
    const held = heldInJita[b.typeId] ?? 0;
    const qty = Math.min(held, b.units);
    if (qty < 1 || qty < b.minVolume) continue;
    const each = b.price * (1 - r.t), listing = b.fair * (1 - r.f - r.t);
    const gain = qty * (each - listing);
    const pct = listing > 0 ? each / listing - 1 : 0;
    out.push({ ...b, held, qty, proceeds: qty * each, gain, pct, worth: !b.doubts.length && gain >= bar.minIsk && pct * 100 >= bar.minPct });
  }
  return out.sort((a, b) => b.gain - a.gain);
}
