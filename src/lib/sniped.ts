/**
 * Snipes you've taken, found in your own wallet rather than logged by hand: a buy of yours in Jita from a listing
 * (not one of your buy orders filling) at a price that, relisted where the item had been trading, pays at least 5%
 * after your fees. That counts the ones found by hand, from before the Sniper existed, as well as the Sniper's; the
 * cloud's sightings (`snipe_seen`) mark which were. What each then made is worked out like a position, from the buy
 * on, with the real fees matched to your orders (positions.ts). Pure.
 */
import { JITA_44 } from './constants';
import { reachedAsk, recentRange } from './fills';
import { SNIPE_FLOOR } from './snipe';
import type { HistRow, JournalEntry, Tx } from './types';
import { multibuys } from './wallet';

/** Buys of one item within this many minutes of each other are one snipe: several cheap orders bought out. */
export const GROUP_MIN = 30;
/** A sighting counts from this long before the cloud first saw a listing to this long after it last did. */
export const SEEN_SLACK_MIN = 10;

/**
 * Your buys that came from a listing: in Jita, from the wallet, not tagged Personal, and paid for there and then.
 *
 * The journal says which. Buying from a listing takes the ISK as a `market_escrow` entry in the same second, for
 * exactly what the trade cost; a buy order of yours filling is paid from the escrow taken when you placed it, and
 * has no entry of its own. Checked on the user's journal (28 September 2026): 61 of 399 buys had a same-second
 * escrow for exactly their value, and none of the Datacore - Rocket Science fills of their 83,530 bid did. (There
 * are no `market_transaction` entries for purchases at all: all 3,663 were sales.) Telling fills apart by your
 * orders' prices was tried first and failed: orders placed or repriced before the app kept their history aren't
 * known, so their fills read as purchases, and the Rocket Science bid came out as nine snipes.
 *
 * `notSnipes`: trades you said weren't snipes. Left out after the matching, since a second's buys are paid together.
 */
export function instantBuys(txs: Tx[], journal: JournalEntry[], personal: Set<string>, notSnipes: ReadonlySet<string> = new Set()): Tx[] {
  const second = (iso: string) => iso.slice(0, 19);
  const escrow = new Map<string, number[]>();
  for (const e of journal) if (e.refType === 'market_escrow' && e.amount < 0) escrow.set(second(e.date), [...(escrow.get(second(e.date)) ?? []), -e.amount]);
  const buys = txs.filter((t) => t.isBuy && t.source === 'esi' && (t.locationId == null || t.locationId === JITA_44) && !personal.has(t.id));
  // Several listings bought in one go may be paid as one entry: the second's buys together count too.
  const bySecond = new Map<string, number>();
  for (const t of buys) bySecond.set(second(t.date), (bySecond.get(second(t.date)) ?? 0) + t.qty * t.unitPrice);
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b * 1e-6);
  // Ones you said weren't snipes are still bought from a listing, but go no further (the Sniper's "Not a snipe").
  return buys.filter((t) => !notSnipes.has(t.id) && (escrow.get(second(t.date)) ?? []).some((a) => near(a, t.qty * t.unitPrice) || near(a, bySecond.get(second(t.date))!)));
}

/**
 * The purchases the snipe finder leaves out: those you said weren't snipes, and anything bought in one go with other
 * items (the Wallet's multibuy rule: 3+ purchases of 2+ items, each within 2 s of the last). The fitting window's Buy
 * All and the Multibuy window buy a shopping list, cheap or not. The user marked five "Not a snipe" on 29 September
 * 2026 and asked whether they were fitting buys: two were (a 1MN Y-S8 Compact Afterburner and a Salvager I, bought with
 * 8 other items across 23:08:04–05 and now inside a ship), and none of their 18 real snipes had another item within
 * minutes of it.
 */
export function notSnipeIds(txs: Tx[], notSnipes: Iterable<string>): Set<string> {
  return new Set([...notSnipes, ...multibuys(txs).flatMap((g) => g.txIds)]);
}

export type BuyGroup = { id: string; typeId: number; at: string; txIds: string[]; units: number; cost: number; avg: number; prices: number[] };

/** Buys of the same item close together, as one snipe each. */
export function groupBuys(buys: Tx[]): BuyGroup[] {
  const sorted = [...buys].sort((a, b) => a.typeId - b.typeId || Date.parse(a.date) - Date.parse(b.date));
  const out: BuyGroup[] = [];
  let cur: BuyGroup | null = null, lastT = 0;
  for (const t of sorted) {
    const at = Date.parse(t.date);
    if (!cur || cur.typeId !== t.typeId || at - lastT > GROUP_MIN * 60_000) {
      cur = { id: t.id, typeId: t.typeId, at: t.date, txIds: [], units: 0, cost: 0, avg: 0, prices: [] };
      out.push(cur);
    }
    cur.txIds.push(t.id);
    cur.units += t.qty;
    cur.cost += t.qty * t.unitPrice;
    cur.avg = cur.cost / cur.units;
    if (!cur.prices.includes(t.unitPrice)) cur.prices.push(t.unitPrice);
    lastT = at;
  }
  return out;
}

export type Sighting = { typeId: number; lo: number; hi: number; firstSeen: number; lastSeen: number };

export type Taken = BuyGroup & {
  /** Where the bulk of trading had got up to on half the 14 days before the buy. */
  fair: number;
  /** How far under that you bought: 0.5 is half price. */
  under: number;
  /** What relisting at `fair` would have made after your fees at the time: the snipe as it looked. */
  expected: number;
  /** The cloud's Sniper had shown this listing. */
  byTool: boolean;
};

/** The groups that were snipes: bought far enough under where the item traded to pay after fees. */
export function judgeTaken(groups: BuyGroup[], historyOf: (typeId: number) => HistRow[] | undefined,
  rateAt: (iso: string) => { f: number; t: number }, sightings: Sighting[] = []): Taken[] {
  const out: Taken[] = [];
  for (const g of groups) {
    const rows = historyOf(g.typeId);
    if (!rows?.length) continue;
    const fair = reachedAsk(recentRange(rows, undefined, Date.parse(g.at)).highs);
    if (fair == null) continue;
    const r = rateAt(g.at);
    const keep = fair * (1 - r.f - r.t);
    if (keep < g.avg * (1 + SNIPE_FLOOR.margin)) continue;
    const at = Date.parse(g.at);
    const byTool = sightings.some((s) => s.typeId === g.typeId && at >= s.firstSeen - SEEN_SLACK_MIN * 60_000 && at <= s.lastSeen + SEEN_SLACK_MIN * 60_000
      && g.prices.some((p) => p >= s.lo - 0.005 && p <= s.hi + 0.005));
    out.push({ ...g, fair, under: 1 - g.avg / fair, expected: g.units * keep - g.cost, byTool });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export type SnipeOutcome = {
  /** Of the sniped units, how many have sold: the first sold after the snipe count as its own. */
  soldUnits: number;
  /** Their average sale price. */
  avgSale: number | null;
  /** Sold after the snipe beyond its own units: stock you already had, kept out of its profit. */
  extraSold: number;
  /** On the sniped units that sold: sales less their tax, their cost and their share of the listing fees. */
  madeSoFar: number;
  /** Listing fees already paid for sniped units still unsold. */
  feesOnUnsold: number;
  left: number;
  /** Made so far, plus what's left sold where the item trades now, after fees; null when that price isn't known. */
  inTheEnd: number | null;
};

/**
 * What a snipe made, following only its own units. Positions follow every trade of an item, which for a snipe of
 * something you also had (loot, usually) counted your own stock's sales as the snipe's and costed them at its price:
 * "10 of 3 sold". Listing fees are those of your sell orders placed after the snipe, shared by units, so a listing
 * of 3 sniped and 7 of your own carries 3/10 of its fee; sales tax is what was matched to each sale, or estimated.
 */
export function followSnipe(
  s: { units: number; cost: number; at: string },
  sales: { id: string; date: string; qty: number; unitPrice: number }[],
  listings: { units: number; fees: number }[],
  taxOf: (txId: string) => number | undefined,
  r: { f: number; t: number },
  fairNow: number | null,
): SnipeOutcome {
  const t0 = Date.parse(s.at);
  let need = s.units, revenue = 0, tax = 0, soldUnits = 0, extraSold = 0;
  for (const x of [...sales].filter((x) => Date.parse(x.date) >= t0).sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
    const take = Math.min(need, x.qty);
    if (take > 0) {
      revenue += take * x.unitPrice;
      const paid = taxOf(x.id);
      tax += paid != null ? (paid * take) / x.qty : take * x.unitPrice * r.t;
      soldUnits += take;
      need -= take;
    }
    extraSold += x.qty - take;
  }
  const listed = listings.reduce((n, o) => n + o.units, 0);
  const fee = listed > 0 ? listings.reduce((n, o) => n + o.fees, 0) * Math.min(1, s.units / listed) : 0;
  const share = s.units > 0 ? soldUnits / s.units : 0;
  const madeSoFar = revenue - tax - s.cost * share - fee * share;
  const left = s.units - soldUnits;
  const feesOnUnsold = fee * (1 - share);
  // What's left, sold where the item trades now: tax on the sale, and a listing fee unless one's already paid.
  const inTheEnd = left <= 0 ? madeSoFar
    : fairNow == null ? null
      : madeSoFar + left * fairNow * (1 - r.t) - (s.cost * left) / s.units - Math.max(feesOnUnsold, left * fairNow * r.f);
  return { soldUnits, avgSale: soldUnits ? revenue / soldUnits : null, extraSold, madeSoFar, feesOnUnsold, left, inTheEnd };
}

/**
 * The items you sniped and haven't sold all of yet: each snipe's units less what sold of the item since the first
 * one, the snipe's own units selling first (as `followSnipe` counts them). For List loot, which leaves them out
 * unless included: the user's Caldari Navy Uranium Charge S, sniped, came up there as loot to list.
 */
export function snipesHeld(taken: Pick<Taken, 'typeId' | 'at' | 'units'>[], sales: Pick<Tx, 'typeId' | 'date' | 'qty' | 'isBuy'>[]): Map<number, { units: number; at: string }> {
  const out = new Map<number, { units: number; at: string }>();
  const byType = new Map<number, { units: number; at: string }>();
  for (const s of taken) {
    const was = byType.get(s.typeId);
    byType.set(s.typeId, was ? { units: was.units + s.units, at: was.at < s.at ? was.at : s.at } : { units: s.units, at: s.at });
  }
  for (const [typeId, s] of byType) {
    const t0 = Date.parse(s.at);
    const sold = sales.filter((x) => !x.isBuy && x.typeId === typeId && Date.parse(x.date) >= t0).reduce((n, x) => n + x.qty, 0);
    if (s.units - sold > 0) out.set(typeId, { units: s.units - sold, at: s.at });
  }
  return out;
}
