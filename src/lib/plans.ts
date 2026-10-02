/**
 * A Capital planner mix, started: what to buy, at what price and how many, frozen at the moment you said go, with the
 * positions that follow each item. The game can't place several buy orders at once (Multibuy only buys from listings,
 * ESI places nothing), so the plan becomes a checklist: each item opens in game with its price copied, and ticks off once
 * a buy order for it shows in your orders. The user asked for "place the buy orders in one go and also open the
 * positions for the items in one go, maybe even group them" (29 September 2026). Pure.
 */
import { JITA_44 } from './constants';
import type { Order, Position, Tx } from './types';

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
 * How long before a plan an order still counts as placed for it, when the item's position didn't open within the day before
 * the plan (`POSITION_BEFORE_MS`): a plan reusing a position opened weeks ago mustn't count a bid from then, filled long
 * since. The user placed 15 of
 * a 16-unit plan's item five minutes before starting it (30 September 2026), and a checklist that showed it unticked got
 * a duplicate placed and the first cancelled, losing its 4,679,391 ISK placing fee.
 */
export const BEFORE_PLAN_MS = 60 * 60_000;
/** A position opened within this before the plan was opened for it: a bid placed on it since counts as placed for the plan. */
export const POSITION_BEFORE_MS = 24 * 60 * 60_000;

export type Placement = {
  /** Every order counted for the item, newest first: those placed since the plan, then the one placed before it. */
  orders: Order[];
  /** The newest of them, whose price the checklist shows. */
  order: Order;
  /** Units placed for the item, summed over `orders`, and how many of them were on the order placed before the plan. */
  units: number;
  before: number;
};

const placedAt = (o: Order) => Date.parse((o.seen?.[0] ?? o).issued);
/**
 * An order counts as placed unless it was cancelled with nothing filled. A filled one leaves your open orders (the sync
 * keeps it as expired or closed), and counting only open ones ticked a plan's item off and then asked for it again once
 * its bid filled, inside the week the plan is for (final review, 1 October 2026). A cancelled one that bought something
 * counts: units were bought.
 */
const counts = (o: Order) => o.state === 'open' || o.volumeRemain < o.volumeTotal;

/**
 * The buy orders you placed for a plan item: buys for the item in Jita 4-4 that count (`counts`). Every one placed since
 * the plan started (its first version is when it was placed; a price change moves `issued`), newest first; and the newest
 * one placed before the plan: since the item's position opened when that was within the day before the plan (the order
 * was placed for it), else within `BEFORE_PLAN_MS` of the plan. Their units are summed: one order's alone told the user, with 15
 * placed before a plan for 16 and the 1 more placed since as the note advised, that "1 of 16" was placed and "the 15
 * more" was a new order with its own fee, the duplicate this exists to stop.
 */
export function planPlacement(
  item: PlanItem, plan: Pick<TradePlan, 'at'>, orders: Order[],
  positions: Pick<Position, 'id' | 'typeId' | 'openedAt'>[] = [],
): Placement | null {
  const planAt = Date.parse(plan.at);
  const from = planAt - SLACK_MS;
  const mine = orders.filter((o) => o.isBuy && o.typeId === item.typeId && o.locationId === JITA_44 && counts(o));
  const since = mine.filter((o) => placedAt(o) >= from).sort((a, b) => placedAt(b) - placedAt(a));
  const pos = positions.find((x) => x.id === item.positionId && x.typeId === item.typeId);
  const opened = pos ? Date.parse(pos.openedAt) : NaN;
  const start = Number.isFinite(opened) && opened < planAt && opened >= planAt - POSITION_BEFORE_MS ? opened : planAt - BEFORE_PLAN_MS;
  const earlier = mine.filter((o) => placedAt(o) >= start && placedAt(o) < from).sort((a, b) => placedAt(b) - placedAt(a))[0];
  const all = earlier ? [...since, earlier] : since;
  if (!all.length) return null;
  return { orders: all, order: all[0], units: all.reduce((n, o) => n + o.volumeTotal, 0), before: earlier?.volumeTotal ?? 0 };
}

export function placedOrder(item: PlanItem, plan: Pick<TradePlan, 'at'>, orders: Order[], positions?: Pick<Position, 'id' | 'typeId' | 'openedAt'>[]): Order | null {
  return planPlacement(item, plan, orders, positions)?.order ?? null;
}

/**
 * What the checklist says of what's placed: the lead ("Already placed: 15 of 16 (before the plan)", "16 of 16 placed (15
 * before the plan)") and, when it all covers fewer units than the plan, why it isn't replaced: EVE can't change an
 * order's quantity, so the rest is a new order with its own fee, or the orders stay as they are. Never a nudge to cancel
 * and place again.
 */
export function placementNote(item: Pick<PlanItem, 'units'>, pl: Placement): { lead: string; short: string | null } {
  const n = (x: number) => x.toLocaleString('en-US');
  const have = pl.units;
  const lead = pl.before >= have ? `Already placed: ${n(have)} of ${n(item.units)} (before the plan)`
    : pl.before > 0 ? `${n(have)} of ${n(item.units)} placed (${n(pl.before)} before the plan)`
      : `${n(have)} of ${n(item.units)} placed`;
  const more = item.units - have;
  const short = more > 0
    ? `EVE can’t change an order’s quantity: the ${n(more)} more is a new order with its own fee, or leave it at ${n(have)}.`
    : null;
  return { lead, short };
}

export type PlanProgress = { placed: number; of: number; waiting: PlanItem[] };

/** How far placing the plan has got: which items still have no buy order for them. */
export function planProgress(plan: TradePlan, orders: Order[], positions?: Pick<Position, 'id' | 'typeId' | 'openedAt'>[]): PlanProgress {
  const waiting = plan.items.filter((i) => !placedOrder(i, plan, orders, positions));
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

/** A position open before the plan started: a plan takes the one already open on an item (`newPlan`), trading and all. */
export const sharesPosition = (pos: Pick<Position, 'openedAt'>, plan: Pick<TradePlan, 'at'>): boolean => Date.parse(pos.openedAt) < Date.parse(plan.at);

/**
 * A position as a plan sees it: from the plan's start, when the position was open before it (`sharesPosition`), else the
 * position itself. Starting a plan takes the open position an item already has, and the user's second plan (2 October
 * 2026) showed Datacore - Rocket Science's 9,372 sales since 24 September as its own, its bid of 188 placed and nothing
 * of it filled. One position per item stays the rule, so the plan gets a view rather than a position of its own: opened
 * at the plan's start, with only the trades counted by hand from then (`included`, and the ones typed in, through
 * `view`), and the `held` units the position had at that moment marked as the earlier trading's, which sell first and
 * are none of the plan's (the user: each plan "its own contained thing"). `held` is the whole position's stock just
 * before the plan (`planPosition` in positions.ts works it out). Never stored.
 */
export function planView(pos: Position, plan: Pick<TradePlan, 'at'>, txs: Record<string, Pick<Tx, 'date'>>, held = 0): Position {
  if (!sharesPosition(pos, plan)) return pos;
  const from = Date.parse(plan.at);
  return {
    ...pos, openedAt: plan.at,
    included: pos.included.filter((id) => { const t = txs[id]; return !!t && Date.parse(t.date) >= from; }),
    view: { held: Math.max(0, held) },
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
