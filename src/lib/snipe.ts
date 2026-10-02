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
import { isk, units as count } from './format';
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
/**
 * ESI's Blueprint category, which holds every blueprint and reaction formula: what "Include blueprints" means. Read by
 * category (type → group → category), never by name: a Synth Blue Pill Booster Reaction Formula is one without the word.
 */
export const BLUEPRINT_CATEGORY = 9;

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
  /**
   * The item's ESI category, as the cloud looked it up (`BLUEPRINT_CATEGORY` is a blueprint). Absent on a read from a
   * Worker before it kept them; null when its lookup failed this round.
   */
  category?: number | null;
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

/**
 * The read without your own orders: a cheap listing of yours isn't a snipe for you, and selling into your own buy
 * order is trading with yourself. The book doesn't say whose an order is, so this takes the IDs of your open orders.
 * Asked by the user (28 September 2026) after relisting a Compact Layered Energized Membrane at 100,100, one step over
 * the best bid, with the next listing at 724,900: to anyone else that looks like a snipe.
 */
export function notYours(read: Pick<SnipeRead, 'listings' | 'bids'>, yours: Set<number>): { listings: SnipeListing[]; bids: SnipeBid[] } {
  if (!yours.size) return { listings: read.listings, bids: read.bids };
  return {
    listings: read.listings.filter((l) => !l.orderIds.some((id) => yours.has(id))),
    bids: read.bids.filter((b) => !yours.has(b.orderId)),
  };
}

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

/**
 * Blueprints set apart from the other listings. The user, 2 October 2026: "exclude blueprints, as they might be risky to
 * try and sell". Of the Sniper's 1,222 sightings since 28 September, 59 were blueprints, 41% of them floods (9% of the
 * rest), and 11 clean. Off unless switched on (`AlertConfig.snipeBlueprints`), on the page and in the mail alike.
 *
 * A listing's category is the cloud's; where it has none (a Worker a version behind, or its lookup failed), `categoryOf`
 * answers: the browser's own lookup, undefined while it runs, null when it failed. A listing whose category isn't
 * known either way is `unknown` and stays out with the blueprints until it is, on the safe side; switched on, every
 * listing shows. High bids for blueprints you hold aren't listings and aren't touched: selling into one is paid at once.
 */
export function splitBlueprints<T extends Pick<SnipeListing, 'typeId' | 'category'>>(list: T[], include: boolean,
  categoryOf: (typeId: number) => number | null | undefined = () => undefined): { shown: T[]; blueprints: T[]; unknown: T[] } {
  const shown: T[] = [], blueprints: T[] = [], unknown: T[] = [];
  for (const x of list) {
    const c = x.category ?? categoryOf(x.typeId);
    if (c == null) unknown.push(x);
    else if (c === BLUEPRINT_CATEGORY) blueprints.push(x);
    if (include || (c != null && c !== BLUEPRINT_CATEGORY)) shown.push(x);
  }
  return { shown, blueprints, unknown };
}

export type SnipeCopy = { ok: true; block: string; lines: number; total: number; said: string } | { ok: false; why: string };

/**
 * Finds for the Multibuy window's import: "Name N" a line (the import's own format), N the cheap units only. The user
 * authorized it on 2 October 2026; the Sniper had been kept out of Multibuy on purpose, to be careful there. Multibuy buys
 * at once from the cheapest listings with no price limit, so a cheap listing someone bought between the read and the
 * paste means the next ones at their full price. What it should come to is said exactly, with the dearest cheap price and
 * the next listing up, so a dearer total in the window shows a listing has gone. A name not read yet ("Item #…") refuses
 * the whole copy: the game can't match it.
 */
export function snipeMultibuy(rows: Pick<SnipeListing, 'typeId' | 'units' | 'cost' | 'top' | 'nextAsk'>[], nameOf: (typeId: number) => string): SnipeCopy {
  const list = rows.filter((x) => x.units > 0);
  if (!list.length) return { ok: false, why: 'Nothing to copy.' };
  const names = list.map((x) => (nameOf(x.typeId) ?? '').trim());
  if (names.some((n) => !n || /^Item #\d+$/.test(n))) return { ok: false, why: 'Some item names haven’t loaded yet: try again in a moment.' };
  const total = list.reduce((s, x) => s + x.cost, 0);
  const one = list.length === 1 ? list[0] : null;
  const said = one
    ? `At the listings just read it should come to ${isk(total)}: ${count(one.units)} at up to ${isk(one.top)} each. Multibuy has no price limit: if one of these listings has gone, it buys the next ones at their full price${one.nextAsk != null ? `, from ${isk(one.nextAsk)} each` : ''}, so a total over ${isk(total)} in the window means it has. Check it before you press Buy.`
    : `At the listings just read the ${list.length} should come to ${isk(total)}. Multibuy has no price limit: if any of these listings has gone, it buys the next ones at their full price, so a total over ${isk(total)} in the window means one has. Check it before you press Buy.`;
  return { ok: true, block: list.map((x, i) => `${names[i]} ${x.units}`).join('\n'), lines: list.length, total, said };
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
