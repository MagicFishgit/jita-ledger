/**
 * A Capital planner mix, started: what to buy, at what price and how many, frozen at the moment you said go, with the
 * positions that follow each item. The game can't place several buy orders at once (Multibuy only buys from listings,
 * ESI places nothing), so the plan becomes a checklist: each item opens in game with its price copied, and ticks off once
 * a buy order for it shows in your orders. The user asked for "place the buy orders in one go and also open the
 * positions for the items in one go, maybe even group them" (29 September 2026). Pure.
 */
import { JITA_44 } from './constants';
import type { Order, Position } from './types';

export type PlanItem = {
  typeId: number;
  /** The bid to place and how many, as the planner priced them. */
  buyAt: number; units: number;
  /** Where the planner expects it to sell. */
  sellAt: number;
  /** The position following it: made by the plan, or one already open on the item. */
  positionId: string | null;
};

export type TradePlan = {
  id: string; name: string;
  /** When it was started: a buy order for an item placed since counts as placing it. */
  at: string;
  isk: number; horizonDays: number; patient: boolean;
  items: PlanItem[];
};

/** Plans kept: the newest, since an old one's grouping is of little use. */
export const PLANS_KEPT = 20;

/** Plans from disk or the cloud: anything malformed is dropped rather than shown. */
export function sanitizePlans(v: unknown): TradePlan[] {
  if (!Array.isArray(v)) return [];
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const out: TradePlan[] = [];
  for (const p of v as Partial<TradePlan>[]) {
    if (!p || typeof p.id !== 'string' || typeof p.at !== 'string' || !Array.isArray(p.items)) continue;
    const items = p.items.filter((i): i is PlanItem => !!i && Number.isInteger(i.typeId) && num(i.buyAt) != null && num(i.units) != null && num(i.sellAt) != null)
      .map((i) => ({ typeId: i.typeId, buyAt: i.buyAt, units: i.units, sellAt: i.sellAt, positionId: typeof i.positionId === 'string' ? i.positionId : null }));
    if (!items.length) continue;
    out.push({ id: p.id, name: typeof p.name === 'string' ? p.name : 'A plan', at: p.at, isk: num(p.isk) ?? 0, horizonDays: num(p.horizonDays) ?? 0, patient: !!p.patient, items });
  }
  return out.slice(0, PLANS_KEPT);
}

/** One step: two slack minutes before the plan started, since the app's clock and ESI's may differ a little. */
const SLACK_MS = 2 * 60_000;

/**
 * The buy order you placed for a plan item: a buy for the item in Jita 4-4, first seen placed after the plan started.
 * Its first version is when it was placed (a price change moves `issued`). The newest if there are several.
 */
export function placedOrder(item: PlanItem, plan: Pick<TradePlan, 'at'>, orders: Order[]): Order | null {
  const from = Date.parse(plan.at) - SLACK_MS;
  const placed = (o: Order) => Date.parse((o.seen?.[0] ?? o).issued);
  return orders.filter((o) => o.isBuy && o.typeId === item.typeId && o.locationId === JITA_44 && placed(o) >= from)
    .sort((a, b) => placed(b) - placed(a))[0] ?? null;
}

export type PlanProgress = { placed: number; of: number; waiting: PlanItem[] };

/** How far placing the plan has got: which items still have no buy order since it started. */
export function planProgress(plan: TradePlan, orders: Order[]): PlanProgress {
  const waiting = plan.items.filter((i) => !placedOrder(i, plan, orders));
  return { placed: plan.items.length - waiting.length, of: plan.items.length, waiting };
}

/**
 * A plan from a planner mix, started at `at`: each item's bid, quantity and sell target as the planner priced them, and the
 * position following it (`positionFor`, which opens one or returns the one already open).
 */
export function newPlan(
  rows: { p: { typeId: number; buy: number; sell: number }; units: number }[],
  o: { id: string; at: string; deployed: number; horizonDays: number; patient: boolean; name: string },
  positionFor: (typeId: number) => string | null,
): TradePlan {
  return {
    id: o.id, name: o.name, at: o.at, isk: o.deployed, horizonDays: o.horizonDays, patient: o.patient,
    items: rows.map((a) => ({ typeId: a.p.typeId, buyAt: a.p.buy, units: a.units, sellAt: a.p.sell, positionId: positionFor(a.p.typeId) })),
  };
}

/** What a plan priced an item at, for judging the orders on it: its bid, its sale, and the return it expected at them. */
export type PlanTarget = {
  planId: string;
  buyAt: number; sellAt: number;
  /** The plan's return at its own prices after the broker fee on both sides and sales tax, as a fraction. */
  expected: number;
};

/**
 * The plan each item's orders belong to, for Orders, To do and the cloud's mail: the newest plan holding the item whose
 * position is still open (not closed, not deleted). An item whose plan position has closed belongs to no plan, whatever
 * plan once held it; one in two plans that share its open position belongs to the newer. Orders told the user to raise
 * Praxis's bid three times with no idea a plan had priced it to make 3.2% (30 September 2026): it filled at 208.4 M and
 * the trade lost 1.02 M.
 */
export function planTargets(
  plans: Pick<TradePlan, 'id' | 'at' | 'items'>[],
  positions: Pick<Position, 'id' | 'typeId' | 'status'>[],
  r: { f: number; t: number },
): Record<number, PlanTarget> {
  const open = new Map(positions.filter((p) => p.status === 'open').map((p) => [p.id, p.typeId]));
  const out: Record<number, PlanTarget> = {};
  const newest = [...plans].sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  for (const p of newest) {
    for (const i of p.items) {
      if (out[i.typeId] || i.positionId == null || open.get(i.positionId) !== i.typeId) continue;
      if (!(i.buyAt > 0) || !(i.sellAt > 0)) continue;
      out[i.typeId] = { planId: p.id, buyAt: i.buyAt, sellAt: i.sellAt, expected: (i.sellAt * (1 - r.f - r.t)) / (i.buyAt * (1 + r.f)) - 1 };
    }
  }
  return out;
}
