/**
 * Spreading a pile of ISK across the market, rather than into one item.
 *
 * Greedy by return per day: the fastest-paying market first, filled to what it can absorb in your
 * horizon (and never more than your cap per item), then the next; when order slots run out first, by ISK a
 * day instead if that earns more (`allocate`). Each item takes two order slots, a buy and a sell. Anything
 * carrying a warning that suggests the spread is bait is left out entirely.
 */

import { JITA_44 } from './constants';
import { pct, units } from './format';
import { DEFAULT_FILTERS, roundTripWithin } from './prospects';
import type { Order, Prospect, ProspectFilters, ProspectWarning } from './types';

/** Flags that say the spread may not be real. Everything else is information, not a veto. */
export const PLANNER_EXCLUDES: ProspectWarning[] = ['escrow', 'wall', 'spike', 'fluke', 'moved', 'runUp'];
/**
 * What "Leave out flagged items" leaves out as well, when it's on (off by default, per browser): every flag that's
 * information rather than a veto. The user asked for "a toggle to not include items with warning like these" (2 October
 * 2026). Raises kept back isn't one: it's a cost already taken off the margin and the ranking (`raiseReserve`, on 91 of the
 * 94 markets watched for a day on 1 October), not a flag. Nor is Market moved since 9 October 2026: it has a rule of its
 * own (`MOVED_FLAG`).
 */
export const SWITCH_EXCLUDES: ProspectWarning[] = ['falling', 'unreached', 'unreachedSell', 'crowded', 'thin', 'slow', 'longQueue'];
/**
 * Market moved (Place and leave's prices are more than MARKET_MOVED from today's book; only Place and leave carries it, so
 * a plan at the front never meets it) is left out by default, whatever "Leave out flagged items" says, and "Keep items
 * whose market moved" (off by default, per browser) brings such items back. The plans review (9 October 2026): on the 2
 * October plan the 11 items it flagged, already on the 11:25 scan before the plan started, settled −6.0% per ISK at
 * today's bids against −2.5% for the rest, and leaving them out would have saved about 6.9 M; the flag only acted when the
 * switch, off by default, was on. Its own rule, not one of SWITCH_EXCLUDES, so each switch decides its own flags and none
 * is counted twice.
 */
export const MOVED_FLAG: ProspectWarning = 'marketMoved';
export const SLOTS_PER_ITEM = 2;

/** How many items carry one of SWITCH_EXCLUDES, in all and by flag (an item with two counts under each, once in all). */
export type FlaggedOut = { total: number; byFlag: Partial<Record<ProspectWarning, number>> };
export type PlannerPool = {
  /** What the mix is filled from. */
  pool: Prospect[];
  /** Left out for one of PLANNER_EXCLUDES, whatever the switches. */
  excluded: number;
  /** Of the rest, those carrying Market moved (MOVED_FLAG), counted either way, so its switch can say what it does. */
  moved: number;
  /** How many of them were left out: all of `moved` by default, none with "Keep items whose market moved". */
  movedOut: number;
  /** How many of them are in the pool: kept, less those Leave out flagged items takes for another flag. */
  movedIn: number;
  /**
   * Of the rest not left out for Market moved, the ones "Leave out flagged items" leaves out when on: counted either way,
   * so the switch can say what it would do.
   */
  flagged: FlaggedOut;
  /**
   * Place and leave only, each left out and counted (`roundTrip` on the prospect, `roundTripRate`): stats from before the
   * round trips were kept ("Scan again"), too few days priced to say (`ROUND_TRIP_MIN`), and none within the horizon on any
   * past day. Not scaled to 0% or taken as 100%: a mix built from them would expect what it can't say.
   */
  unmeasured: number; tripFew: number; noTrip: number;
  /**
   * Nothing is left, though items passed: Market moved's rule, the round-trip rules or the switch took every one. Said,
   * never an empty mix with no reason.
   */
  allFlagged: boolean;
};

/**
 * The items the planner may use: no flag from PLANNER_EXCLUDES, a return to rank by, no Market moved unless `keepMoved`,
 * and, with the switch on, no other flag.
 */
export function plannerPool(prospects: Prospect[], leaveOutFlagged = false, keepMoved = false): PlannerPool {
  // A measured rate of 0 scales the return to 0: such an item passed, and is counted, not dropped unsaid.
  const noTripMeasured = (p: Prospect) => p.roundTrip?.rate === 0;
  const usable = prospects.filter((p) => Number.isFinite(p.roiPerDay) && (p.roiPerDay > 0 || noTripMeasured(p)));
  const vetoed = (p: Prospect) => p.warnings.some((w) => PLANNER_EXCLUDES.includes(w));
  const flagged: FlaggedOut = { total: 0, byFlag: {} };
  const pool: Prospect[] = [];
  let moved = 0, movedOut = 0, movedIn = 0, left = 0, unmeasured = 0, tripFew = 0, noTrip = 0;
  for (const p of usable) {
    if (vetoed(p)) continue;
    left++;
    // Place and leave's pace (`roundTrip`, only on its prospects): not known, or known to be never, is left out and said.
    const t = p.roundTrip;
    if (t) {
      if (t.of == null) { unmeasured++; continue; }
      if (t.rate == null) { tripFew++; continue; }
      if (t.rate === 0) { noTrip++; continue; }
    }
    if (p.warnings.includes(MOVED_FLAG)) {
      moved++;
      if (!keepMoved) { movedOut++; continue; }
    }
    const hits = SWITCH_EXCLUDES.filter((w) => p.warnings.includes(w));
    if (hits.length) {
      flagged.total++;
      for (const w of hits) flagged.byFlag[w] = (flagged.byFlag[w] ?? 0) + 1;
      if (leaveOutFlagged) continue;
    }
    pool.push(p);
    if (p.warnings.includes(MOVED_FLAG)) movedIn++;
  }
  return { pool, excluded: prospects.filter(vetoed).length, moved, movedOut, movedIn, unmeasured, tripFew, noTrip, flagged, allFlagged: !pool.length && left > 0 };
}

/**
 * The filters the planner ranks with: your Prospects filters (so it draws from the list you see there),
 * but never the Busy markets view --- that one prices at the top of the book and ignores "Return ≥ %",
 * and left switched on in Prospects it was quietly feeding the planner a different list --- and always
 * sized to the planner's own ISK and horizon, with partial fills so every market's own limit counts.
 */
export function plannerFilters(saved: Partial<ProspectFilters> | null | undefined, isk: number, horizonDays: number, patient = false): ProspectFilters {
  return { ...DEFAULT_FILTERS, ...(saved ?? {}), busy: false, budget: isk, horizonDays, partial: true, patient };
}

/** The planner's horizon choices: the Prospects ones, without "any", which a plan can't be sized to. */
export const PLANNER_HORIZONS = [4 / 24, 12 / 24, 1, 3, 7, 14, 30];

export type PlanInput = { isk: number; slots: number; horizonDays: number; maxShare: number;
  /** "Leave out flagged items": SWITCH_EXCLUDES are left out too. */
  leaveOutFlagged?: boolean;
  /** "Keep items whose market moved": Market moved (MOVED_FLAG) stays in, as any other flag does. */
  keepMoved?: boolean;
  /** Units you already have working per item (`workingUnits`): the plan takes only what its market has left. */
  working?: Record<number, number> };
export type Allocation = { p: Prospect; isk: number; units: number; days: number; perDay: number;
  /** Units the item's market takes in the horizon at your share, and how many of them you already have working. */
  takes: number; working: number };

/**
 * What you already have working per item, in units: your open Jita 4-4 orders' units left, buys and sells, and what you
 * hold in the Jita hangar to sell. All of it uses the item's flip capacity, so a plan sized as if the market were empty
 * stacks a second plan's bid on the first's (the user approved sizing after it, 2 October 2026). A hangar not read yet
 * counts as nothing held.
 */
export function workingUnits(orders: Pick<Order, 'typeId' | 'state' | 'locationId' | 'volumeRemain'>[], hangar?: Record<number, number> | null): Record<number, number> {
  const out: Record<number, number> = {};
  for (const o of orders) if (o.state === 'open' && o.locationId === JITA_44 && o.volumeRemain > 0) out[o.typeId] = (out[o.typeId] ?? 0) + o.volumeRemain;
  for (const [t, n] of Object.entries(hangar ?? {})) if (n > 0) out[Number(t)] = (out[Number(t)] ?? 0) + n;
  return out;
}
/**
 * `ranked`: which order the mix was filled in. `return` is the usual, best return per day first; `isk` is the one kept
 * when order slots ran out first and filling by ISK a day earned more (see `allocate`).
 */
export type Plan = {
  rows: Allocation[]; deployed: number; perDay: number; idle: number; slotsUsed: number; limit: 'slots' | 'markets' | 'none'; ranked: 'return' | 'isk';
  /** Items the fill reached that would have had a row but for what you already have working in them. */
  filled: number;
  /** When slots ran out and both orders were tried: what the other one would have made a day. */
  other?: number;
};

/**
 * One item's allocation with `left` ISK still to place: as much as its market takes in the horizon, less what you already
 * have working in it, never over the cap.
 */
function allocationFor(p: Prospect, inp: PlanInput, cap: number, left: number): Allocation | null {
  // canTake is what the market absorbs in the scan's horizon; rescale it to the planner's.
  const perDayIsk = p.daysToFlip > 0 ? (p.qty * p.buy) / p.daysToFlip : 0;
  const absorbs = perDayIsk * inp.horizonDays;
  const working = Math.max(0, inp.working?.[p.typeId] ?? 0);
  const amount = Math.min(Math.max(0, absorbs - working * p.buy), cap, left);
  // Below this an allocation is not worth two order slots.
  if (amount < Math.max(1, inp.isk * 0.01)) return null;
  const units = Math.floor(amount / p.buy);
  if (units < 1) return null;
  const isk = units * p.buy;
  const days = perDayIsk > 0 ? isk / perDayIsk : Infinity;
  // Place and leave expects what a round trip makes times how often one came round within the horizon (`roundTrip`); the
  // size is still what its market takes. At the front, the whole of it, as before.
  const perDay = ((units * p.net) / Math.max(days, 1 / 24)) * (p.roundTrip?.rate ?? 1);
  return { p, isk, units, days, perDay, takes: p.buy > 0 ? Math.floor(absorbs / p.buy) : 0, working };
}

/**
 * What a Place-and-leave mix expects of its round trips, for the mix line and the start dialog: how many of its items history
 * says come round within the horizon (the rates summed: 0.2 and 0.3 is about half an item), the rate weighted by the ISK in
 * each and its range, and the profit expected (each row's, times its rate) against what it makes if every one did. Null for
 * a mix with no measured rate (at the front).
 */
export function mixRoundTrips(rows: Pick<Allocation, 'p' | 'isk' | 'units'>[]): { items: number; expected: number; rate: number; low: number; high: number; profit: number; ifAll: number; days: number; sameDay: boolean } | null {
  const rated = rows.filter((a) => a.p.patient && a.p.roundTrip?.rate != null);
  if (!rated.length) return null;
  const rate = (a: Pick<Allocation, 'p'>) => a.p.roundTrip!.rate!;
  const isk = rated.reduce((t, a) => t + a.isk, 0);
  const rates = rated.map(rate);
  return {
    items: rated.length,
    expected: rates.reduce((t, r) => t + r, 0),
    rate: isk > 0 ? rated.reduce((t, a) => t + a.isk * rate(a), 0) / isk : 0,
    low: Math.min(...rates), high: Math.max(...rates),
    profit: rated.reduce((t, a) => t + a.units * a.p.net * rate(a), 0),
    ifAll: rated.reduce((t, a) => t + a.units * a.p.net, 0),
    days: rated[0].p.roundTrip!.days, sameDay: rated[0].p.roundTrip!.sameDay,
  };
}

export type MixRoundTrips = NonNullable<ReturnType<typeof mixRoundTrips>>;

/**
 * The mix line's words: "About 2 of these 30 round-trip within 12 h, history says: 7% of past days, weighted by the
 * ISK in each (0% to 20% an item)". `of` is how many items the mix holds.
 */
export function mixRoundTripsSaid(m: MixRoundTrips, of: number, horizonDays: number | null | undefined): string {
  const within = roundTripWithin(m.days, horizonDays);
  if (of === 1) return `History says it round-trips ${within} on ${pct(m.rate, 0)} of past days`;
  const range = m.low === m.high ? `${pct(m.low, 0)} each` : `${pct(m.low, 0)} to ${pct(m.high, 0)} an item`;
  const lead = m.expected < 0.5 ? `Less than one of these ${units(of)} round-trips` : m.expected < 1.5 ? `About 1 of these ${units(of)} round-trips`
    : `About ${units(Math.round(m.expected))} of these ${units(of)} round-trip`;
  return `${lead} ${within}, history says: ${pct(m.rate, 0)} of past days, weighted by the ISK in each (${range})`;
}

/** Fills the mix in the order given, until the ISK or the slots run out. */
function fill(order: Prospect[], inp: PlanInput, ranked: Plan['ranked']): Plan {
  const cap = Math.max(0, inp.isk) * Math.min(1, Math.max(0, inp.maxShare));
  let left = Math.max(0, inp.isk);
  let slots = Math.max(0, Math.floor(inp.slots));
  const rows: Allocation[] = [];
  let filled = 0;
  for (const p of order) {
    if (slots < SLOTS_PER_ITEM || left <= 0) break;
    const a = allocationFor(p, inp, cap, left);
    if (!a) {
      // Left out only because your orders and stock already take what its market can.
      if ((inp.working?.[p.typeId] ?? 0) > 0 && allocationFor(p, { ...inp, working: undefined }, cap, left)) filled++;
      continue;
    }
    rows.push(a);
    left -= a.isk;
    slots -= SLOTS_PER_ITEM;
  }
  return {
    rows, deployed: rows.reduce((t, r) => t + r.isk, 0),
    perDay: rows.reduce((t, r) => t + r.perDay, 0),
    idle: left,
    slotsUsed: rows.length * SLOTS_PER_ITEM,
    limit: left <= inp.isk * 0.05 ? 'none' : slots < SLOTS_PER_ITEM ? 'slots' : 'markets',
    ranked, filled,
  };
}

/**
 * The mix. Best return per day first, each market filled to what it takes. That's right while there are slots to spare:
 * the ISK goes where it pays fastest. But when the slots run out with ISK still idle, a slot pair is the scarce thing,
 * and a small market paying 4% a day on the 20 M it can take earns less than a big one paying 2% on 150 M. So then the
 * mix is also filled by what each item makes a day, and whichever earns more a day is kept. The user asked for the
 * planner to "fill the given slots" intelligently (29 September 2026).
 */
export function allocate(prospects: Prospect[], inp: PlanInput): Plan {
  const { pool } = plannerPool(prospects, inp.leaveOutFlagged, inp.keepMoved);
  const byReturn = fill([...pool].sort((a, b) => b.roiPerDay - a.roiPerDay), inp, 'return');
  if (byReturn.limit !== 'slots') return byReturn;
  const cap = Math.max(0, inp.isk) * Math.min(1, Math.max(0, inp.maxShare));
  const alone = new Map(pool.map((p) => [p, allocationFor(p, inp, cap, Math.max(0, inp.isk))?.perDay ?? 0]));
  const byIsk = fill([...pool].sort((a, b) => alone.get(b)! - alone.get(a)!), inp, 'isk');
  return byIsk.perDay > byReturn.perDay ? { ...byIsk, other: byReturn.perDay } : { ...byReturn, other: byIsk.perDay };
}
