/**
 * Listing loot in bulk through the game's Sell window, whose "Import prices from clipboard" (patch 23.01, June 2025)
 * takes one line per item, its name then its price. The user has loot to sell, doesn't want to dump it all into buy
 * orders ("that sells to buy orders and you lose out money"), and has few free order slots, each line of a listing
 * taking one. So each item is priced where a listing actually sells (`listingPrice`, the rule Orders uses), set
 * against what the bids would pay for it now, and only the ones that gain most per slot are listed; the rest are sold
 * into bids or skipped. Items with an open position, or already on a sell order of yours, are left out unless you
 * include them: the user wants to "confidently sell loot and when I want to, positions". So are ships: "the risk of it
 * is too high for how expensive they can get", and snipes you still hold; each kind has a switch, each item its own.
 * Containers, deployables and structures that are assembled are in use, and a hangar read sets them aside. Pure.
 */
import { listingPrice, reachedAsk } from './fills';
import type { OrderLite } from './flow';
import { walkBids } from './relist';
import { competitionShare, sideVolume } from './split';
import { priceUp, tickUp } from './tick';
import { breakEvenSell } from './fees';

/** One item pasted in, or read from the hangar. `typeId` is null until a name is looked up. */
export type LootRow = { typeId: number | null; name: string; qty: number };

/**
 * What the game gives, in either of two forms. The Sell window's export (checked on the user's own, 29 September
 * 2026): "typeID name qty unitPrice total" per line, decimal points, no thousands separators. A hangar copied in list
 * view (Ctrl+A, Ctrl+C): "name qty group …" per line, the quantity possibly with thousands separators or empty for
 * one. Columns are tabs; a paste through chat can turn them into runs of spaces, so two or more spaces count too.
 * The same item on several lines (split stacks) is added up. Lines that make no sense are returned in `bad`.
 */
export function parseLoot(text: string): { rows: LootRow[]; bad: string[] } {
  const out = new Map<string, LootRow>();
  const bad: string[] = [];
  const num = (s: string | undefined) => {
    if (s == null) return NaN;
    const t = s.trim().replace(/[\s,']/g, '');
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/\t| {2,}/).map((c) => c.trim()).filter((c, i) => c !== '' || i === 1);
    let row: LootRow | null = null;
    if (cols.length >= 3 && /^\d+$/.test(cols[0]) && Number.isFinite(num(cols[2])) && !/^\d+$/.test(cols[1])) {
      row = { typeId: Number(cols[0]), name: cols[1], qty: num(cols[2]) };           // the Sell window's export
    } else if (cols.length >= 1 && !/^(type ?id|name|item)$/i.test(cols[0])) {
      const q = cols.length >= 2 ? num(cols[1]) : NaN;
      row = { typeId: null, name: cols[0], qty: Number.isFinite(q) && q > 0 ? q : 1 };  // a hangar copy
    }
    if (!row || !row.name || !(row.qty > 0)) { if (!/^(type ?id|name|item)\b/i.test(line)) bad.push(line); continue; }
    const key = row.typeId != null ? `#${row.typeId}` : row.name.toLowerCase();
    const was = out.get(key);
    out.set(key, was ? { ...was, qty: was.qty + row.qty } : row);
  }
  return { rows: [...out.values()], bad };
}

/** One item's Jita market, with your own orders already taken out of the book. */
export type LootMarket = {
  others: OrderLite[];
  /** The last 14 days' highs (with what the app watched), for where a listing sells. */
  highs: (number | null)[] | null;
  /** Units a typical day, and the share of trading that is buyers taking listings. */
  perDay: number | null;
  buyers: number;
};

export type LootVerdict = 'list' | 'bids' | 'skip' | 'noSlot' | 'held';
export type LootHeld = 'position' | 'listed' | 'ship' | 'sniped' | 'unchecked';

/**
 * Categories whose assembled items are in use, not loot: containers (Celestial), deployables, starbase parts and
 * structures. Ships are left out on their own rule. A blueprint original is assembled too, and stays: it sells.
 */
export const IN_USE_CATEGORIES: ReadonlySet<number> = new Set([2, 22, 23, 65]);

/** Why an item is left out, and how to put it back. */
export const HELD_WHY: Record<LootHeld, string> = {
  position: 'You have an open position on it: include it to sell it here',
  listed: 'You already have a sell order on it: include it to list more',
  ship: 'A ship: left out, since one wrong price on a hull costs too much. Include it to sell it here',
  sniped: 'You sniped it and still hold some: left out so a snipe isn’t sold off as loot. Include it to sell it here',
  unchecked: 'Whether it’s a ship couldn’t be checked, so it’s left out: include it if it isn’t one',
};

export type LootCall = {
  typeId: number;
  name: string;
  qty: number;
  /** Where a listing sells, what listing all of it gets after the broker fee and sales tax, and in how many days. */
  listAt: number | null;
  listNet: number | null;
  days: number | null;
  /** What the standing bids pay now after sales tax, and how many units they take. */
  bidsNet: number;
  bidsUnits: number;
  /** What listing gains over selling into the bids, and that a day of the slot it takes. */
  gain: number | null;
  perSlotDay: number | null;
  verdict: LootVerdict;
  why: string;
  /** Left out unless you include it: you hold a position on it, already have a sell order on it, it's a ship, or
   * whether it's a ship couldn't be checked. */
  held?: LootHeld;
};

/**
 * A listing slower than this is said to be slow; one slower than LOOT_TOO_SLOW_DAYS goes to the bids when they'll take
 * it. Between the two, the ranking by gain per day of the slot decides: the user's 18 Small 'Hope' Hull Reconstructor I
 * would take ~86 days listed but make 1.29 M against 26 k in the bids, ~14,600 ISK a day of the slot, more than
 * anything else in their loot, and a flat 30-day cut sent them to the bids.
 */
export const LOOT_SLOW_DAYS = 30;
export const LOOT_TOO_SLOW_DAYS = 365;
/** And one that gains less than this over the bids isn't worth a slot at all. */
export const LOOT_MIN_GAIN = 1_000;

const isk = (n: number) => `${Math.round(n).toLocaleString('en-US')} ISK`;
const daysSaid = (d: number) => (d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'}`);

/**
 * One item judged: list it (where a listing sells, if that beats the bids by your target and the listing sells within
 * LOOT_SLOW_DAYS), sell it into the bids, or skip it (no market worth a slot). `target` is the settings' per-trade
 * return as a fraction; `held` says why it's left out by default; `include` puts it back.
 */
export function judgeLoot(
  row: { typeId: number; name: string; qty: number },
  m: LootMarket | null,
  r: { f: number; t: number },
  sharePct: number,
  target: number,
  held?: LootHeld,
): LootCall {
  const base = { typeId: row.typeId, name: row.name, qty: row.qty, listAt: null, listNet: null, days: null, bidsNet: 0, bidsUnits: 0, gain: null, perSlotDay: null };
  if (!m) return { ...base, verdict: 'skip', why: 'Its Jita market couldn’t be read' };
  const sells = m.others.filter((o) => !o.isBuy);
  const bids = m.others.filter((o) => o.isBuy);
  const bestSell = sells.length ? Math.min(...sells.map((o) => o.price)) : null;
  const bestBid = bids.length ? Math.max(...bids.map((o) => o.price)) : null;
  const walk = walkBids(row.qty, bids.map((o) => ({ price: o.price, volume: o.volume })), r.t);
  // Where a listing sells; with no listing to undercut, where trading got up to, never under one step over the bid.
  const noFront = bestSell == null && m.highs ? reachedAsk(m.highs) : null;
  const listAt = bestSell != null ? listingPrice(bestSell, bestBid, m.highs) : noFront != null ? Math.max(noFront, bestBid != null ? tickUp(bestBid) : 0) : null;
  const call: LootCall = { ...base, bidsNet: walk.value, bidsUnits: walk.sold, verdict: 'skip', why: '' };
  if (held) call.held = held;
  if (listAt == null) {
    if (walk.sold > 0) return { ...call, verdict: 'bids', why: 'Nobody lists it and it has no history to price a listing: the bids are the market' };
    return { ...call, verdict: 'skip', why: 'Nothing listed, no bids and no history in Jita' };
  }
  const fee = Math.max(100, r.f * listAt * row.qty);
  const listNet = listAt * row.qty * (1 - r.t) - fee;
  const buyersDay = m.perDay != null && m.perDay > 0 ? sideVolume(m.perDay, m.buyers, false) * competitionShare(sharePct, sells.length) : 0;
  const days = buyersDay > 0 ? row.qty / buyersDay : null;
  const gain = listNet - walk.value;
  const out: LootCall = { ...call, listAt, listNet, days, gain, perSlotDay: gain / Math.max(1, days ?? LOOT_SLOW_DAYS) };
  const tooSlow = days == null || days > LOOT_TOO_SLOW_DAYS;
  const slow = days != null && days > LOOT_SLOW_DAYS;
  if (walk.sold > 0 && (gain < Math.max(LOOT_MIN_GAIN, target * walk.value) || tooSlow)) {
    return { ...out, verdict: 'bids', why: tooSlow
      ? `Listed at ${isk(listAt)} it would take ${days == null ? 'too long to say' : `about ${daysSaid(days)}`} to sell; the bids pay ${isk(walk.value)} now`
      : `Listing at ${isk(listAt)} gets only ${isk(gain)} more than the bids pay now, under your target` };
  }
  if (listNet < LOOT_MIN_GAIN) return { ...out, verdict: 'skip', why: `Worth ${isk(Math.max(0, listNet))} listed and nothing in bids: not worth a slot` };
  return { ...out, verdict: 'list', why: walk.sold > 0
    ? `Listing at ${isk(listAt)} gets ${isk(gain)} more than the bids pay now${days != null ? `, selling in about ${daysSaid(days)}` : ''}${slow ? ': slow, but worth the slot' : ''}`
    : `No bids to sell into; listed at ${isk(listAt)} it gets ${isk(listNet)}${days != null ? ` in about ${daysSaid(days)}` : ''}` };
}

/**
 * The listings, best use of a slot first, as many as there are free slots; the rest wait for one. Items left out
 * (`held`) stay out unless included, whatever they'd make.
 */
export function planLoot(calls: LootCall[], freeSlots: number, included: Set<number>): LootCall[] {
  const out = calls.map((c) => (c.held && !included.has(c.typeId) ? { ...c, verdict: 'held' as const, why: HELD_WHY[c.held] } : c));
  const listing = out.filter((c) => c.verdict === 'list').sort((a, b) => (b.perSlotDay ?? 0) - (a.perSlotDay ?? 0));
  const room = new Set(listing.slice(0, Math.max(0, freeSlots)).map((c) => c.typeId));
  return out.map((c) => (c.verdict === 'list' && !room.has(c.typeId) ? { ...c, verdict: 'noSlot' as const, why: `${c.why}. No free order slot for it` } : c));
}

export type LootTotals = {
  /** Everything not left out, listed where it sells: after the broker fee and sales tax, how many items (a slot each),
   * the longest any takes to sell, and how many have no listing price (nobody lists them and there's no history). */
  listed: { isk: number; items: number; slowest: number | null; unpriced: number };
  /** Everything not left out, sold into the bids now after sales tax, and how many the bids can't take in full. */
  bids: { isk: number; items: number; short: number };
  /** The plan as drawn: its listings when they sell, and what goes into the bids now. Items waiting for a slot aren't in it. */
  plan: { isk: number; listed: number; bids: number; waiting: number };
};

/**
 * What the loot comes to all listed, all sold into the bids, and as the plan splits it. The user asked to see the
 * totals "if all valid items were sold at listing sell price or sold to buy orders" beside the plan.
 */
export function lootTotals(calls: LootCall[]): LootTotals {
  const live = calls.filter((c) => c.verdict !== 'held');
  const priced = live.filter((c) => c.listNet != null && c.listNet > 0);
  const slow = priced.map((c) => c.days).filter((d): d is number => d != null);
  const bid = live.filter((c) => c.bidsUnits > 0);
  const list = live.filter((c) => c.verdict === 'list'), toBids = live.filter((c) => c.verdict === 'bids');
  const listIsk = list.reduce((t, c) => t + (c.listNet ?? 0), 0), bidsIsk = toBids.reduce((t, c) => t + c.bidsNet, 0);
  return {
    listed: { isk: priced.reduce((t, c) => t + c.listNet!, 0), items: priced.length, slowest: slow.length ? Math.max(...slow) : null, unpriced: live.filter((c) => c.listAt == null).length },
    bids: { isk: bid.reduce((t, c) => t + c.bidsNet, 0), items: bid.length, short: bid.filter((c) => c.bidsUnits < c.qty).length },
    plan: { isk: listIsk + bidsIsk, listed: listIsk, bids: bidsIsk, waiting: live.filter((c) => c.verdict === 'noSlot').length },
  };
}

/**
 * Stock you bought (a position's, a planner buy's, a snipe's), priced for the same Sell-window paste. The user agreed
 * to the research's first idea: the paste that lists loot, for "stock from filled positions, planner plans and snipes".
 * Priced as Orders prices a new listing (`listingPrice`), never under break-even: a listing price under what the stock
 * cost after the broker fee and sales tax is flagged `under`, left unticked, and listed at break-even if ticked.
 */
export type StockCall = {
  typeId: number; name: string; qty: number;
  /** What a unit cost you, and the least listing price that gets it back after fees. */
  cost: number; breakEven: number;
  /** Where a listing sells now; null when nobody lists it and there's no history to say. */
  listAt: number | null;
  /** The price the paste uses: `listAt`, or break-even when that's under it. */
  price: number | null;
  /** What all of it makes over its cost at `price`, after fees, and roughly how long it takes to sell. */
  profit: number | null;
  days: number | null;
  under: boolean;
  why: string;
};

export function judgeStock(row: { typeId: number; name: string; qty: number }, m: LootMarket | null, cost: number, r: { f: number; t: number; k: number }, sharePct: number): StockCall {
  const loot = judgeLoot(row, m, r, sharePct, 0);
  // The broker fee is at least 100 ISK an order, which a small one's break-even has to cover too.
  let be = breakEvenSell(cost, r, 0);
  if (Number.isFinite(be) && r.f * be * row.qty < 100) be = (cost * row.qty + 100) / (row.qty * (1 - r.t));
  const breakEven = priceUp(be);
  const base = { typeId: row.typeId, name: row.name, qty: row.qty, cost, breakEven, listAt: loot.listAt, days: loot.days };
  if (loot.listAt == null || !Number.isFinite(breakEven)) return { ...base, price: null, profit: null, under: false, why: m ? 'Nobody lists it in Jita and there’s no history to price a listing' : 'Its Jita market couldn’t be read' };
  const under = loot.listAt < breakEven;
  const price = under ? breakEven : loot.listAt;
  const profit = price * row.qty * (1 - r.t) - Math.max(100, r.f * price * row.qty) - cost * row.qty;
  return { ...base, price, profit, under, why: under
    ? `Where it sells now, ${isk(loot.listAt)}, is under what it cost: it breaks even at ${isk(breakEven)}. Tick it to list there anyway`
    : `Lists at ${isk(loot.listAt)}, over its break-even of ${isk(breakEven)}` };
}

/** A price as the Sell window's import takes it: no thousands separators, cents only when there are cents. */
export function importPrice(p: number, mark: 'point' | 'comma'): string {
  const s = Number.isInteger(p) ? String(p) : p.toFixed(2);
  return mark === 'comma' ? s.replace('.', ',') : s;
}

/** The clipboard block for "Import prices from clipboard": one line per listing, its name, a tab, its price. */
export function importBlock(calls: LootCall[], mark: 'point' | 'comma'): string {
  return priceBlock(calls.filter((c) => c.verdict === 'list' && c.listAt != null).map((c) => ({ name: c.name, price: c.listAt! })), mark);
}

/** The same block from any names and prices. */
export function priceBlock(rows: { name: string; price: number }[], mark: 'point' | 'comma'): string {
  return rows.map((c) => `${c.name}\t${importPrice(c.price, mark)}`).join('\n');
}
