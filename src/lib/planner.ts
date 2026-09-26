/**
 * Spreading a pile of ISK across the market, rather than into one item.
 *
 * Greedy by return per day: the fastest-paying market first, filled to what it can absorb in your
 * horizon (and never more than your cap per item), then the next. Each item takes two order slots, a
 * buy and a sell. Anything carrying a warning that suggests the spread is bait is left out entirely.
 */

import type { Prospect, ProspectWarning } from './types';

/** Flags that say the spread may not be real. Everything else is information, not a veto. */
export const PLANNER_EXCLUDES: ProspectWarning[] = ['escrow', 'wall', 'spike', 'fluke'];
export const SLOTS_PER_ITEM = 2;

export type PlanInput = { isk: number; slots: number; horizonDays: number; maxShare: number };
export type Allocation = { p: Prospect; isk: number; units: number; days: number; perDay: number };
export type Plan = { rows: Allocation[]; deployed: number; perDay: number; idle: number; slotsUsed: number; limit: 'slots' | 'markets' | 'none' };

export function allocate(prospects: Prospect[], inp: PlanInput): Plan {
  const pool = prospects
    .filter((p) => !p.warnings.some((w) => PLANNER_EXCLUDES.includes(w)))
    .filter((p) => Number.isFinite(p.roiPerDay) && p.roiPerDay > 0)
    .sort((a, b) => b.roiPerDay - a.roiPerDay);
  const cap = Math.max(0, inp.isk) * Math.min(1, Math.max(0, inp.maxShare));
  // Below this an allocation is not worth two order slots.
  const floor = Math.max(1, inp.isk * 0.01);
  let left = Math.max(0, inp.isk);
  let slots = Math.max(0, Math.floor(inp.slots));
  const rows: Allocation[] = [];
  for (const p of pool) {
    if (slots < SLOTS_PER_ITEM || left <= 0) break;
    // canTake is what the market absorbs in the scan's horizon; rescale it to the planner's.
    const perDayIsk = p.daysToFlip > 0 ? (p.qty * p.buy) / p.daysToFlip : 0;
    const absorbs = perDayIsk * inp.horizonDays;
    const amount = Math.min(absorbs, cap, left);
    if (amount < floor) continue;
    const units = Math.floor(amount / p.buy);
    if (units < 1) continue;
    const isk = units * p.buy;
    const days = perDayIsk > 0 ? isk / perDayIsk : Infinity;
    rows.push({ p, isk, units, days, perDay: (units * p.net) / Math.max(days, 1 / 24) });
    left -= isk;
    slots -= SLOTS_PER_ITEM;
  }
  const deployed = rows.reduce((t, r) => t + r.isk, 0);
  return {
    rows, deployed,
    perDay: rows.reduce((t, r) => t + r.perDay, 0),
    idle: left,
    slotsUsed: rows.length * SLOTS_PER_ITEM,
    limit: left <= inp.isk * 0.05 ? 'none' : slots < SLOTS_PER_ITEM ? 'slots' : 'markets',
  };
}
