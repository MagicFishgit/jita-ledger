/**
 * Spreading a pile of ISK across the market, rather than into one item.
 *
 * Greedy by return per day: the fastest-paying market first, filled to what it can absorb in your
 * horizon (and never more than your cap per item), then the next; when order slots run out first, by ISK a
 * day instead if that earns more (`allocate`). Each item takes two order slots, a buy and a sell. Anything
 * carrying a warning that suggests the spread is bait is left out entirely.
 */

import { DEFAULT_FILTERS } from './prospects';
import type { Prospect, ProspectFilters, ProspectWarning } from './types';

/** Flags that say the spread may not be real. Everything else is information, not a veto. */
export const PLANNER_EXCLUDES: ProspectWarning[] = ['escrow', 'wall', 'spike', 'fluke', 'moved'];
export const SLOTS_PER_ITEM = 2;

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

export type PlanInput = { isk: number; slots: number; horizonDays: number; maxShare: number };
export type Allocation = { p: Prospect; isk: number; units: number; days: number; perDay: number };
/**
 * `ranked`: which order the mix was filled in. `return` is the usual, best return per day first; `isk` is the one kept
 * when order slots ran out first and filling by ISK a day earned more (see `allocate`).
 */
export type Plan = {
  rows: Allocation[]; deployed: number; perDay: number; idle: number; slotsUsed: number; limit: 'slots' | 'markets' | 'none'; ranked: 'return' | 'isk';
  /** When slots ran out and both orders were tried: what the other one would have made a day. */
  other?: number;
};

/** One item's allocation with `left` ISK still to place: as much as its market takes in the horizon, never over the cap. */
function allocationFor(p: Prospect, inp: PlanInput, cap: number, left: number): Allocation | null {
  // canTake is what the market absorbs in the scan's horizon; rescale it to the planner's.
  const perDayIsk = p.daysToFlip > 0 ? (p.qty * p.buy) / p.daysToFlip : 0;
  const absorbs = perDayIsk * inp.horizonDays;
  const amount = Math.min(absorbs, cap, left);
  // Below this an allocation is not worth two order slots.
  if (amount < Math.max(1, inp.isk * 0.01)) return null;
  const units = Math.floor(amount / p.buy);
  if (units < 1) return null;
  const isk = units * p.buy;
  const days = perDayIsk > 0 ? isk / perDayIsk : Infinity;
  return { p, isk, units, days, perDay: (units * p.net) / Math.max(days, 1 / 24) };
}

/** Fills the mix in the order given, until the ISK or the slots run out. */
function fill(order: Prospect[], inp: PlanInput, ranked: Plan['ranked']): Plan {
  const cap = Math.max(0, inp.isk) * Math.min(1, Math.max(0, inp.maxShare));
  let left = Math.max(0, inp.isk);
  let slots = Math.max(0, Math.floor(inp.slots));
  const rows: Allocation[] = [];
  for (const p of order) {
    if (slots < SLOTS_PER_ITEM || left <= 0) break;
    const a = allocationFor(p, inp, cap, left);
    if (!a) continue;
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
    ranked,
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
  const pool = prospects
    .filter((p) => !p.warnings.some((w) => PLANNER_EXCLUDES.includes(w)))
    .filter((p) => Number.isFinite(p.roiPerDay) && p.roiPerDay > 0);
  const byReturn = fill([...pool].sort((a, b) => b.roiPerDay - a.roiPerDay), inp, 'return');
  if (byReturn.limit !== 'slots') return byReturn;
  const cap = Math.max(0, inp.isk) * Math.min(1, Math.max(0, inp.maxShare));
  const alone = new Map(pool.map((p) => [p, allocationFor(p, inp, cap, Math.max(0, inp.isk))?.perDay ?? 0]));
  const byIsk = fill([...pool].sort((a, b) => alone.get(b)! - alone.get(a)!), inp, 'isk');
  return byIsk.perDay > byReturn.perDay ? { ...byIsk, other: byReturn.perDay } : { ...byReturn, other: byIsk.perDay };
}
