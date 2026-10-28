/**
 * Hosting an offer on the HyperNet Relay (docs/superpowers/specs/2026-10-28-hypernet-trader-design.md): what an offer
 * pays the host in each of its three ends, how many of its own nodes the host can keep without losing when someone else
 * wins, and the record of the offers the main has hosted, read from EVE's notifications and the wallet journal.
 *
 * Pure, and imported by the Worker (archive.ts reads the notifications), so it holds no ./config, store, React or DOM.
 * The rules are the research's (.playwright-mcp/research/hypernet-host/report.md): the relay's 5% is taken from the
 * payout only when every node sells; the HyperCores are paid at creation and never refunded; an offer runs three days
 * and can't be cancelled; on expiry every buyer, the host included, is refunded and the item goes back. Nothing here is
 * read from an offer route: ESI has none.
 */
import type { JournalEntry, Tx } from './types';
import { JITA_44 } from './constants';

/** The node counts an offer can be split into, as players report them (2019 to October 2025). */
export const NODE_COUNTS = [8, 16, 48, 512] as const;
/** The relay's fee, a share of the pot, taken from the payout only when the offer sells out (CCP). */
export const RELAY_FEE = 0.05;
/** How long an offer runs (CCP). */
export const OFFER_DAYS = 3;
/** HyperCore, the item a host pays to create an offer. */
export const HYPERCORE = 52568;
/** Large Skill Injector: the user's first item, a quick pick on the calculator. */
export const LSI = 40520;
/** About one offer in two sells out, one high-volume host reported (October 2025): the sell-out chance until your own say. */
export const SELL_OUT_REPORTED = 0.5;
/** Finished offers of your own before their sell-out rate is the default chance. */
export const OWN_RATE_MIN = 5;

const DAY_MS = 86400_000;
const HOUR_MS = 3600_000;
const MIN_MS = 60_000;
/** A loss smaller than half a cent is no loss: the outcomes are sums of doubles. */
const EPS = 0.005;
const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const pos = (x: unknown): x is number => ok(x) && x > 0;

/**
 * HyperCores an offer asks for: about one per two PLEX of its pot, at least one. The formula is fitted, not CCP's: three
 * players' measurements from 2019 to 2025 each came to a core per ~2× PLEX's price then, and the game's window says the
 * real count. Null when the pot or PLEX's price isn't a positive figure.
 */
export function coresFor(pot: number, plexPrice: number): number | null {
  if (!pos(pot) || !pos(plexPrice)) return null;
  return Math.max(1, Math.floor(pot / (2 * plexPrice)));
}

/**
 * One node's price: the pot over the nodes, rounded up to a whole ISK. The game's own rounding isn't known, so the price
 * copied for its window is a whole figure, and everything is then worked out on that price × the nodes (`potAt`), the pot
 * the offer really has.
 */
export function nodePrice(pot: number, nodes: number): number {
  return Math.ceil(pot / nodes);
}

/** The pot an offer really has once its node price is a whole ISK: node price × nodes. */
export function potAt(pot: number, nodes: number): number {
  return nodePrice(pot, nodes) * nodes;
}

export type Outcome = {
  /** Someone else wins: the payout less the cores, your own nodes and the item. */
  other: number;
  /** You win one of your own nodes: the same, and the item comes back to list again. */
  win: number;
  /** Not every node sold: everyone is refunded and the item comes back, the cores are lost. */
  expires: number;
  /** Your share of the nodes, which is your chance of winning once it sells out. */
  chance: number;
};

/**
 * The three ends of an offer of `pot` (the total of all its nodes, as the caller rounded it) in `nodes` nodes, the host
 * keeping `keep` of them, the item having cost `cost` and the cores `cores` ISK. Every node sold, the host's own
 * included, pays out less the relay's 5%, so each node kept costs the host its price, and 5% of it.
 * Null when an input isn't a figure or `keep` isn't a whole number of nodes from 0 to all but one.
 */
export function outcomes(o: { pot: number; nodes: number; keep: number; cost: number; cores: number }): Outcome | null {
  const { pot, nodes, keep, cost, cores } = o;
  if (!pos(pot) || !Number.isInteger(nodes) || nodes < 1 || !Number.isInteger(keep) || keep < 0 || keep >= nodes || !ok(cost) || cost < 0 || !ok(cores) || cores < 0) return null;
  const win = (1 - RELAY_FEE) * pot - cores - (keep * pot) / nodes;
  return { other: win - cost, win, expires: -cores, chance: keep / nodes };
}

/**
 * The most nodes the host can keep and still not lose when someone else wins: the largest whole k up to all but one
 * with `(1 − 5% − k/N) × pot ≥ cost + cores`. Null when even keeping none loses (raise the pot: `safePot`).
 */
export function safeKeep(o: { pot: number; nodes: number; cost: number; cores: number }): number | null {
  const at = (k: number) => outcomes({ ...o, keep: k });
  if (!at(0)) return null;
  // The closed form, then walked to the exact edge: the floor of a quotient of doubles can land one either side.
  let k = Math.floor((o.nodes * ((1 - RELAY_FEE) * o.pot - o.cores - o.cost)) / o.pot);
  k = Math.max(-1, Math.min(o.nodes - 1, k));
  while (k >= 0 && at(k)!.other < -EPS) k--;
  while (k + 1 <= o.nodes - 1 && at(k + 1)!.other >= -EPS) k++;
  return k >= 0 ? k : null;
}

/**
 * The least pot at which keeping `keep` nodes (none by default) doesn't lose when someone else wins, as a whole node
 * price × the nodes: the "raise it to X" for a row no share makes safe. Solved with the cores as given; with `scale`
 * (PLEX's price and a core's) the cores are counted again at each pot tried (`coresFor`), since a bigger pot asks for
 * more of them. Null when nothing can make it safe (keeping 95% of the nodes or more) or an input isn't a figure.
 */
export function safePot(o: { nodes: number; cost: number; cores: number; keep?: number; scale?: { plexPrice: number; corePrice: number } }): number | null {
  const keep = o.keep ?? 0;
  const share = 1 - RELAY_FEE - keep / o.nodes;
  if (!Number.isInteger(o.nodes) || o.nodes < 1 || !ok(o.cost) || o.cost < 0 || !ok(o.cores) || o.cores < 0 || share <= 0) return null;
  const coresAt = (pot: number) => {
    if (!o.scale) return o.cores;
    const n = coresFor(pot, o.scale.plexPrice);
    return n == null || !ok(o.scale.corePrice) ? o.cores : n * o.scale.corePrice;
  };
  let pot = (o.cost + o.cores) / share;
  // More pot asks more cores, which asks more pot; it settles within a few rounds (the cores are ~2% of the pot).
  for (let i = 0; i < 30; i++) {
    const next = (o.cost + coresAt(pot)) / share;
    if (Math.abs(next - pot) < 0.5) { pot = Math.max(pot, next); break; }
    pot = next;
  }
  let price = nodePrice(pot, o.nodes);
  for (let i = 0; i < 1000; i++) {
    const t = price * o.nodes;
    const x = outcomes({ pot: t, nodes: o.nodes, keep, cost: o.cost, cores: coresAt(t) });
    if (x && x.other >= -EPS) return t;
    price++;
  }
  return null;
}

/**
 * What an offer makes on average, given the chance `sellOut` that every node sells: sold out, you win your share of the
 * time and someone else the rest; else it expires. Linear in the nodes kept, falling by `sellOut × (pot − cost) / N` a
 * node while the pot is over the item's cost: keeping nodes never raises the average, it only buys a better chance of
 * selling out. Null when the chance isn't from 0 to 1.
 */
export function average(o: { outcome: Outcome; sellOut: number }): number | null {
  const s = o.sellOut;
  if (!ok(s) || s < 0 || s > 1) return null;
  const { win, other, expires, chance } = o.outcome;
  return s * (chance * win + (1 - chance) * other) + (1 - s) * expires;
}

/** One row of the calculator's table: a node count, its whole node price, the most to keep and its three ends. */
export type TableRow = {
  nodes: number; nodePrice: number; pot: number;
  /** The most nodes to keep and never lose; null when none is safe at this pot. */
  keep: number | null;
  /** The three ends at `keep`; null with it. */
  outcome: Outcome | null;
  /** When no share is safe: the pot where keeping none breaks even. */
  raiseTo: number | null;
};

/** The calculator's table: each node count at the pot as its node price rounds it. */
export function tableRows(o: { pot: number; cost: number; cores: number; scale?: { plexPrice: number; corePrice: number } }, counts: readonly number[] = NODE_COUNTS): TableRow[] {
  return counts.map((nodes) => {
    const pot = potAt(o.pot, nodes);
    const keep = safeKeep({ pot, nodes, cost: o.cost, cores: o.cores });
    return {
      nodes, nodePrice: nodePrice(o.pot, nodes), pot, keep,
      outcome: keep == null ? null : outcomes({ pot, nodes, keep, cost: o.cost, cores: o.cores }),
      raiseTo: keep == null ? safePot({ nodes, cost: o.cost, cores: o.cores, scale: o.scale }) : null,
    };
  });
}

// ─── The record: notifications and the journal ──────────────────────────────────────────────────────────────────────

export const RAFFLE_TYPES = ['RaffleCreated', 'RaffleFinished', 'RaffleExpired'] as const;
export type RaffleType = (typeof RAFFLE_TYPES)[number];

/**
 * One HyperNet notification, kept as a record of kind `raffles` by its notification ID, never changed once written. The
 * fields are what SeAT's code reads from the text (`typeID`, `ticket_count`, `ticket_price`, `location_id`); none of
 * these notices has been seen on a real answer here, so the raw text is kept whole to learn from (whether one names its
 * offer, or its winner), and anything that couldn't be read is null, never 0.
 */
export type RaffleRecord = {
  id: string;
  type: RaffleType;
  timestamp: string;
  typeId: number | null;
  ticketCount: number | null;
  ticketPrice: number | null;
  locationId: number | null;
  /** An ID naming the offer, if the text carries one (a key like `raffle_id` or `hypernet_id`). */
  raffleId: string | null;
  /** Whoever won, if the text names them (any key containing "winner"). */
  winnerId: number | null;
  text: string | null;
};

/** The notification as ESI sends it (`/characters/{id}/notifications/`), the fields read here. */
export type RawNotification = { notification_id: number; type: string; timestamp: string; text?: string | null };

/** `key: value` lines of the notice's YAML, keys flattened (lower case, no `_`), anchors dropped, numbers as numbers. */
function yamlish(text: string): Map<string, number | string | null> {
  const out = new Map<string, number | string | null>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:-\s+)?([A-Za-z_][\w]*)\s*:\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/_/g, '');
    if (out.has(key)) continue;
    let v = m[2].replace(/^&\w+\s*/, '');
    if (/^\*\w+$/.test(v) || v === '' || v === '~' || v === 'null') { out.set(key, null); continue; }
    v = v.replace(/^(['"])(.*)\1$/, '$2');
    out.set(key, /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v) ? Number(v) : v);
  }
  return out;
}

/**
 * A HyperNet notification as a record, or null for any other kind or one with no ID or time. Reads the text tolerantly
 * and never throws: a field it can't read is null.
 */
export function parseRaffle(n: RawNotification): RaffleRecord | null {
  try {
    if (!n || !(RAFFLE_TYPES as readonly string[]).includes(n.type)) return null;
    if (!ok(n.notification_id) || typeof n.timestamp !== 'string' || !Number.isFinite(Date.parse(n.timestamp))) return null;
    const text = typeof n.text === 'string' ? n.text : null;
    const f = yamlish(text ?? '');
    const num = (k: string) => { const v = f.get(k); return ok(v) ? v : null; };
    const id = (k: string) => { const v = f.get(k); return ok(v) && Number.isInteger(v) && v > 0 ? v : null; };
    let raffleId: string | null = null;
    for (const k of ['raffleid', 'hypernetid', 'offerid']) { const v = f.get(k); if (v != null && v !== '') { raffleId = String(v); break; } }
    let winnerId: number | null = null;
    for (const [k, v] of f) if (k.includes('winner') && ok(v) && Number.isInteger(v) && v > 0) { winnerId = v; break; }
    return {
      id: String(n.notification_id), type: n.type as RaffleType, timestamp: n.timestamp,
      typeId: id('typeid'), ticketCount: id('ticketcount'), ticketPrice: num('ticketprice'), locationId: id('locationid'),
      raffleId, winnerId, text,
    };
  } catch {
    return null;
  }
}

export type OfferState = 'open' | 'soldOut' | 'expired' | 'unknown';

/** Journal entries an offer claims: how many (one entry a node), their ISK (as a positive figure) and their IDs. */
export type Entries = { nodes: number; isk: number; entries: string[] };

/**
 * One offer the main hosted, from its `RaffleCreated` notice and what the journal says of it since. Every figure that
 * can't be worked out is null, with why in `why`; `estimates` names the figures that are estimates, never readings.
 */
export type Offer = {
  /** The creation notice's ID. */
  id: string;
  typeId: number; nodes: number; nodePrice: number; pot: number; locationId: number | null; raffleId: string | null;
  created: string;
  /** When it ends if not every node sells: three days on. */
  endsAt: string;
  state: OfferState;
  /** When it ended, and how that's known: its own notice, or a payout of its pot. */
  endedAt: string | null; endFrom: 'notice' | 'payout' | null;
  /** Your own nodes: `flux_ticket_sale` entries of exactly its node price while it ran. */
  own: Entries;
  /** Refunds of a node's price after it expired; `assumed` own nodes whose refund wasn't found, taken as refunded. */
  refunds: Entries & { assumed: number };
  /** The payout, gross (the pot) or net (95% of it, the fee taken). */
  payout: { isk: number; entry: string; net: boolean } | null;
  /** The relay's fee as its own entry, or assumed at 5% (`entry` null) when the payout was gross and no fee entry was found. */
  fee: { isk: number; entry: string | null } | null;
  /** What the item cost: your newest Jita 4-4 purchase of it in the 30 days before the offer. */
  cost: { unit: number; txId: string; at: string } | null;
  /** The cores, an estimate: their count from the pot, priced at your own purchases of them, else the price given. */
  cores: { count: number | null; price: number | null; isk: number | null; priceFrom: 'bought' | 'given' | null };
  /** Who won, from the notice when it names the winner, else as you marked it. */
  won: boolean | null; wonFrom: 'notice' | 'marked' | null;
  /** The result if you won it, and if someone else did; `result` is the one that happened, once it's known. */
  ifWon: number | null; ifOther: number | null; result: number | null;
  estimates: ('cores' | 'fee' | 'refunds')[];
  why: Partial<Record<'cost' | 'cores' | 'payout' | 'won' | 'result', string>>;
};

/** Cents, for matching an entry to a node's price. */
const cents = (x: number) => Math.round(x * 100);
const t = (s: string) => Date.parse(s);

/** The creation notices that couldn't be read well enough to be an offer (no item, nodes or node price in the text). */
export function unreadRaffles(raffles: Record<string, RaffleRecord> | readonly RaffleRecord[]): RaffleRecord[] {
  return Object.values(raffles).filter((r) => r.type === 'RaffleCreated' && (r.typeId == null || r.ticketCount == null || r.ticketPrice == null));
}

/**
 * Every offer the main hosted, newest first, as the design's "An offer" says:
 * - each readable `RaffleCreated` is one offer; its end the first `RaffleFinished` / `RaffleExpired` after it with the same
 *   item, nodes, node price and station (and offer ID, when both carry one), each end claimed once; with none, a
 *   `flux_payout` of the pot or 95% of it (within 1 ISK) within three days and an hour marks it sold out;
 * - its own nodes are `flux_ticket_sale` entries of exactly its node price, from 5 minutes before it to its end (three
 *   days and an hour on while it hasn't ended), each claimed by the newest offer it could be;
 * - refunds are `flux_ticket_repayment` entries of its node price in the hour after it expired;
 * - the payout and the fee are `flux_payout` / `flux_tax` matched by amount (pot, 95% of it, 5% of it) within a day of its end;
 * - the item's cost is the main's newest Jita 4-4 purchase of it in the 30 days before;
 * - the cores are an estimate: `coreCount` (a count, or one from the pot) priced at the main's own HyperCore purchases
 *   before the offer, newest first, else `corePrice`.
 * Result: payout − fee (when separate) − own nodes + refunds − cores − (someone else won ? the item's cost : 0).
 */
export function offersOf(
  raffles: Record<string, RaffleRecord> | readonly RaffleRecord[],
  journal: Record<string, JournalEntry> | readonly JournalEntry[],
  txs: Record<string, Tx> | readonly Tx[],
  opts: {
    now: number;
    /** The main's character ID, to read a winner named in a notice as you. */
    me?: number | null;
    /** Who won, as marked on the row (prefs.hypernet.won), by offer ID. */
    won?: Record<string, boolean>;
    /** The cores each offer asked for: a count, or worked out from its pot (`coresFor` at PLEX's price). */
    coreCount?: number | ((pot: number, created: string) => number | null) | null;
    /** A core's price when none of yours was bought before the offer (Jita's cheapest now, say). */
    corePrice?: number | null;
  },
): Offer[] {
  const all = Object.values(raffles).filter((r): r is RaffleRecord => !!r && typeof r === 'object');
  const created = all
    .filter((r) => r.type === 'RaffleCreated' && r.typeId != null && r.ticketCount != null && r.ticketPrice != null && Number.isFinite(t(r.timestamp)))
    .sort((a, b) => t(a.timestamp) - t(b.timestamp) || a.id.localeCompare(b.id));
  const ends = all.filter((r) => r.type !== 'RaffleCreated' && Number.isFinite(t(r.timestamp))).sort((a, b) => t(a.timestamp) - t(b.timestamp) || a.id.localeCompare(b.id));
  const flux = Object.values(journal).filter((j) => j && j.refType.startsWith('flux_') && Number.isFinite(t(j.date)))
    .sort((a, b) => t(a.date) - t(b.date) || a.id.localeCompare(b.id));
  const buys = Object.values(txs).filter((x) => x && x.isBuy && Number.isFinite(t(x.date)));
  const used = new Set<string>();
  const usedEnds = new Set<string>();

  // Ends first, oldest offer first: each end is the first after its offer that matches it.
  const endOf = new Map<string, RaffleRecord>();
  for (const c of created) {
    const e = ends.find((x) => !usedEnds.has(x.id) && t(x.timestamp) >= t(c.timestamp) && x.typeId === c.typeId && x.ticketCount === c.ticketCount
      && x.ticketPrice != null && cents(x.ticketPrice) === cents(c.ticketPrice!) && x.locationId === c.locationId
      && (x.raffleId == null || c.raffleId == null || x.raffleId === c.raffleId));
    if (e) { usedEnds.add(e.id); endOf.set(c.id, e); }
  }

  // A payout of the pot (gross) or 95% of it (net), within 1 ISK.
  const payoutFor = (pot: number, from: number, to: number) => flux.find((j) => j.refType === 'flux_payout' && !used.has(j.id) && t(j.date) >= from && t(j.date) <= to
    && (Math.abs(j.amount - pot) <= 1 || Math.abs(j.amount - (1 - RELAY_FEE) * pot) <= 1));

  type Draft = { c: RaffleRecord; pot: number; endedAt: number | null; endFrom: Offer['endFrom']; state: OfferState; payout: JournalEntry | null; end: RaffleRecord | null };
  const drafts: Draft[] = created.map((c) => {
    const pot = c.ticketCount! * c.ticketPrice!;
    const at = t(c.timestamp);
    const end = endOf.get(c.id) ?? null;
    if (end) return { c, pot, endedAt: t(end.timestamp), endFrom: 'notice', state: end.type === 'RaffleFinished' ? 'soldOut' : 'expired', payout: null, end };
    const p = payoutFor(pot, at, at + OFFER_DAYS * DAY_MS + HOUR_MS);
    if (p) { used.add(p.id); return { c, pot, endedAt: t(p.date), endFrom: 'payout', state: 'soldOut', payout: p, end: null }; }
    return { c, pot, endedAt: null, endFrom: null, state: opts.now < at + OFFER_DAYS * DAY_MS ? 'open' : 'unknown', payout: null, end: null };
  });

  // Own nodes: each ticket entry at a node price goes to the newest offer at that price whose window holds it.
  const own = new Map<string, JournalEntry[]>(drafts.map((d) => [d.c.id, []]));
  for (const j of flux) {
    if (j.refType !== 'flux_ticket_sale' || j.amount >= 0) continue;
    const at = t(j.date);
    const home = [...drafts].reverse().find((d) => cents(-j.amount) === cents(d.c.ticketPrice!) && at >= t(d.c.timestamp) - 5 * MIN_MS
      && at <= (d.endedAt ?? t(d.c.timestamp) + OFFER_DAYS * DAY_MS + HOUR_MS));
    if (home) { own.get(home.c.id)!.push(j); used.add(j.id); }
  }

  // Refunds, the payout and the fee for each ended offer.
  const coreTx = buys.filter((x) => x.typeId === HYPERCORE).sort((a, b) => t(b.date) - t(a.date));
  const offers = drafts.map((d): Offer => {
    const c = d.c;
    const at = t(c.timestamp);
    const mine = own.get(c.id)!;
    const ownE: Entries = { nodes: mine.length, isk: -mine.reduce((s, j) => s + j.amount, 0), entries: mine.map((j) => j.id) };
    const refundE: Entries & { assumed: number } = { nodes: 0, isk: 0, entries: [], assumed: 0 };
    let payout: Offer['payout'] = null;
    let fee: Offer['fee'] = null;
    const estimates: Offer['estimates'] = [];
    const why: Offer['why'] = {};

    if (d.state === 'expired' && d.endedAt != null) {
      // Only as many as you held: a refund at the same price beyond that is another offer's node.
      const back = flux.filter((j) => j.refType === 'flux_ticket_repayment' && !used.has(j.id) && cents(j.amount) === cents(c.ticketPrice!)
        && t(j.date) >= d.endedAt! - 5 * MIN_MS && t(j.date) <= d.endedAt! + HOUR_MS).slice(0, ownE.nodes);
      for (const j of back) { used.add(j.id); refundE.nodes++; refundE.isk += j.amount; refundE.entries.push(j.id); }
      // Every buyer is refunded on expiry, the host too (inferred): one not in the journal yet is taken as refunded.
      if (refundE.nodes < ownE.nodes) { refundE.assumed = ownE.nodes - refundE.nodes; estimates.push('refunds'); }
    }
    if (d.state === 'soldOut' && d.endedAt != null) {
      const p = d.payout ?? payoutFor(d.pot, d.endedAt - DAY_MS, d.endedAt + DAY_MS);
      if (p) {
        used.add(p.id);
        const net = Math.abs(p.amount - d.pot) > 1;
        payout = { isk: p.amount, entry: p.id, net };
        if (!net) {
          const f = flux.find((j) => j.refType === 'flux_tax' && !used.has(j.id) && Math.abs(-j.amount - RELAY_FEE * d.pot) <= 1
            && Math.abs(t(j.date) - d.endedAt!) <= DAY_MS);
          if (f) { used.add(f.id); fee = { isk: -f.amount, entry: f.id }; }
          else { fee = { isk: RELAY_FEE * d.pot, entry: null }; estimates.push('fee'); }
        }
      } else why.payout = 'Its payout isn’t in your journal yet';
    }

    // The item's cost: the newest Jita 4-4 purchase of it in the 30 days before.
    const bought = buys.filter((x) => x.typeId === c.typeId && x.locationId === JITA_44 && t(x.date) <= at && t(x.date) >= at - 30 * DAY_MS)
      .sort((a, b) => t(b.date) - t(a.date) || b.id.localeCompare(a.id))[0];
    const cost = bought ? { unit: bought.unitPrice, txId: bought.id, at: bought.date } : null;
    if (!cost) why.cost = 'No purchase of it found in Jita 4-4 in the 30 days before';

    // The cores: a count from the pot, priced at your own purchases before the offer, newest first, else the price given.
    const cc = typeof opts.coreCount === 'function' ? opts.coreCount(d.pot, c.timestamp) : opts.coreCount ?? null;
    const count = pos(cc) ? Math.round(cc) : null;
    let price: number | null = null, priceFrom: Offer['cores']['priceFrom'] = null;
    if (count != null) {
      let units = 0, isk = 0;
      for (const x of coreTx) {
        if (t(x.date) > at + 5 * MIN_MS) continue;
        const take = Math.min(x.qty, count - units);
        units += take; isk += take * x.unitPrice;
        if (units >= count) break;
      }
      if (units > 0) { price = isk / units; priceFrom = 'bought'; }
      else if (pos(opts.corePrice)) { price = opts.corePrice; priceFrom = 'given'; }
    }
    const coresIsk = count != null && price != null ? count * price : null;
    if (count != null) estimates.push('cores');
    if (count == null) why.cores = 'How many cores it asked for isn’t known';
    else if (price == null) why.cores = 'No price for a HyperCore: none bought, and none given';

    // Who won: the notice when it names a winner, else as marked.
    let won: boolean | null = null, wonFrom: Offer['wonFrom'] = null;
    if (d.end?.winnerId != null && opts.me != null) { won = d.end.winnerId === opts.me; wonFrom = 'notice'; }
    else if (typeof opts.won?.[c.id] === 'boolean') { won = opts.won[c.id]; wonFrom = 'marked'; }
    if (d.state === 'soldOut' && won == null) why.won = 'Who won isn’t known: mark it';

    let ifWon: number | null = null, ifOther: number | null = null, result: number | null = null;
    if (coresIsk == null) why.result = why.cores;
    else if (d.state === 'expired') {
      result = ifWon = ifOther = refundE.isk + refundE.assumed * c.ticketPrice! - ownE.isk - coresIsk;
    } else if (d.state === 'soldOut') {
      if (payout) {
        ifWon = payout.isk - (fee?.isk ?? 0) - ownE.isk - coresIsk;
        ifOther = cost ? ifWon - cost.unit : null;
        result = won === true ? ifWon : won === false ? ifOther : null;
        if (result == null) why.result = won === false ? why.cost : why.won;
      } else why.result = why.payout;
    } else why.result = d.state === 'open' ? 'Still running' : 'How it ended isn’t known yet';

    return {
      id: c.id, typeId: c.typeId!, nodes: c.ticketCount!, nodePrice: c.ticketPrice!, pot: d.pot, locationId: c.locationId, raffleId: c.raffleId,
      created: c.timestamp, endsAt: new Date(at + OFFER_DAYS * DAY_MS).toISOString(),
      state: d.state, endedAt: d.endedAt == null ? null : new Date(d.endedAt).toISOString(), endFrom: d.endFrom,
      own: ownE, refunds: refundE, payout, fee, cost, cores: { count, price, isk: coresIsk, priceFrom },
      won, wonFrom, ifWon, ifOther, result, estimates, why,
    };
  });
  return offers.sort((a, b) => t(b.created) - t(a.created) || b.id.localeCompare(a.id));
}

/**
 * The journal entries the main's own offers account for: its own nodes, their refunds, and each payout and fee. The
 * Wallet files these as hosting (a business), not as tickets bought for play.
 */
export function hostedEntries(offers: readonly Offer[]): Set<string> {
  const out = new Set<string>();
  for (const o of offers) {
    for (const id of o.own.entries) out.add(id);
    for (const id of o.refunds.entries) out.add(id);
    if (o.payout) out.add(o.payout.entry);
    if (o.fee?.entry) out.add(o.fee.entry);
  }
  return out;
}

/** How many of the offers that ended sold out: the main's own sell-out rate, once there are enough (`OWN_RATE_MIN`). */
export function sellOutRate(offers: readonly Offer[]): { sold: number; finished: number } {
  const done = offers.filter((o) => o.state === 'soldOut' || o.state === 'expired');
  return { sold: done.filter((o) => o.state === 'soldOut').length, finished: done.length };
}
