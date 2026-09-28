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
 */
export function instantBuys(txs: Tx[], journal: JournalEntry[], personal: Set<string>): Tx[] {
  const second = (iso: string) => iso.slice(0, 19);
  const escrow = new Map<string, number[]>();
  for (const e of journal) if (e.refType === 'market_escrow' && e.amount < 0) escrow.set(second(e.date), [...(escrow.get(second(e.date)) ?? []), -e.amount]);
  const buys = txs.filter((t) => t.isBuy && t.source === 'esi' && (t.locationId == null || t.locationId === JITA_44) && !personal.has(t.id));
  // Several listings bought in one go may be paid as one entry: the second's buys together count too.
  const bySecond = new Map<string, number>();
  for (const t of buys) bySecond.set(second(t.date), (bySecond.get(second(t.date)) ?? 0) + t.qty * t.unitPrice);
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, b * 1e-6);
  return buys.filter((t) => (escrow.get(second(t.date)) ?? []).some((a) => near(a, t.qty * t.unitPrice) || near(a, bySecond.get(second(t.date))!)));
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
