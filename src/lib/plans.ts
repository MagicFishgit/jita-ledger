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
  /** The newest of them; null while the only sign is a bid that bought at once (`atOnce`). */
  order: Order | null;
  /**
   * Units placed for the item: summed over `orders`, plus `atOnce`; how many of them were on the order placed before the
   * plan.
   */
  units: number;
  before: number;
  /** Units bought in the window that no order you have yet explains: a bid that filled from listings when placed. */
  atOnce: number;
  /** When the newest of those trades was, ms; null with none. */
  atOnceAt: number | null;
  /** The price the checklist shows: the newest order's, else what the newest of those trades paid. */
  price: number;
};

/** Your trades, for the bids that filled when placed, and the ones you tagged Personal, which don't count. */
export type PlanTrades = { txs: Pick<Tx, 'id' | 'source' | 'typeId' | 'date' | 'isBuy' | 'qty' | 'unitPrice' | 'locationId'>[]; ignored?: readonly string[] };

const placedAt = (o: Order) => Date.parse((o.seen?.[0] ?? o).issued);
/**
 * An order counts as placed unless it was cancelled with nothing filled. A filled one leaves your open orders (the sync
 * keeps it as expired or closed), and counting only open ones ticked a plan's item off and then asked for it again once
 * its bid filled, inside the week the plan is for (final review, 1 October 2026). A cancelled one that bought something
 * counts: units were bought.
 */
const counts = (o: Order) => o.state === 'open' || o.volumeRemain < o.volumeTotal;
const filledOf = (o: Order) => Math.max(0, o.volumeTotal - o.volumeRemain);

/** How late ESI shows your orders: character orders are cached 20 minutes (eve-facts.md). */
export const ORDERS_LAG_MS = 20 * 60_000;

/**
 * Units bought in the window that no order explains yet: a bid at or over the cheapest listing buys from the listings there
 * and then, never stands, and ESI lists it only in your order history, cached an hour (the plan's Imperial Navy Infiltrator,
 * 11 at 1,658,000, bought at 1,608,000 on 2 October 2026; the user's earlier Multibuy orders are stored that way, expired
 * with nothing left). Your Jita 4-4 buys of the item since `start`, Personal ones left out, less the fills of every other
 * bid, then those of the orders counted for the plan:
 * - a bid you placed before the window filling inside it fills at its own price (one of its versions), so trades at those
 *   prices since it was placed are its, up to what it filled (Clone Soldier Transporter Tag's 4-unit bid from the 30
 *   September plan, still open under the 2 October one); some of what it filled may be from before the window;
 * - a bid placed inside the window that isn't counted (an older one before the plan: only the newest counts) filled only
 *   inside it, at any price, its own or the listings' it bought from at once: trades since it was placed, up to what it
 *   filled (the review, 2 October 2026: two bids before the plan, the older bought 5 at once, read 15 placed for 10);
 * - what the orders counted for the plan have filled, all of it, since a bid that bought from listings paid their prices,
 *   not its own. So once the order arrives from history its fills explain the trade, and nothing is counted twice.
 */
function boughtAtOnce(typeId: number, start: number, counted: Order[], others: Order[], trades: PlanTrades): { units: number; price: number | null; at: number | null } {
  const ignored = new Set(trades.ignored ?? []);
  const left = trades.txs
    .filter((t) => t.source === 'esi' && t.isBuy && t.typeId === typeId && t.locationId === JITA_44 && Date.parse(t.date) >= start && !ignored.has(t.id))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .map((t) => ({ t, qty: t.qty }));
  for (const o of others) {
    let filled = filledOf(o);
    const prices = new Set([o.price, ...(o.seen ?? []).map((v) => v.price)]);
    const inside = placedAt(o) >= start;
    for (const x of left) {
      if (filled <= 0) break;
      if (x.qty <= 0 || (!inside && !prices.has(x.t.unitPrice)) || Date.parse(x.t.date) < placedAt(o)) continue;
      const k = Math.min(x.qty, filled);
      x.qty -= k; filled -= k;
    }
  }
  const units = Math.max(0, left.reduce((n, x) => n + x.qty, 0) - counted.reduce((n, o) => n + filledOf(o), 0));
  const rest = left.filter((x) => x.qty > 0);
  const newest = rest[rest.length - 1];
  return { units, price: units > 0 && newest ? newest.t.unitPrice : null, at: units > 0 && newest ? Date.parse(newest.t.date) : null };
}

/**
 * The buy orders you placed for a plan item: buys for the item in Jita 4-4 that count (`counts`). Every one placed since
 * the plan started (its first version is when it was placed; a price change moves `issued`), newest first; and the newest
 * one placed before the plan: since the item's position opened when that was within the day before the plan (the order
 * was placed for it), else within `BEFORE_PLAN_MS` of the plan. Their units are summed: one order's alone told the user, with 15
 * placed before a plan for 16 and the 1 more placed since as the note advised, that "1 of 16" was placed and "the 15
 * more" was a new order with its own fee, the duplicate this exists to stop. With `trades`, a bid that bought at once
 * counts too, before its order shows (`boughtAtOnce`).
 */
export function planPlacement(
  item: PlanItem, plan: Pick<TradePlan, 'at'>, orders: Order[],
  positions: Pick<Position, 'id' | 'typeId' | 'openedAt'>[] = [],
  trades?: PlanTrades,
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
  const others = orders.filter((o) => o.isBuy && o.typeId === item.typeId && o.locationId === JITA_44 && !all.includes(o));
  const once = trades ? boughtAtOnce(item.typeId, start, all, others, trades) : { units: 0, price: null, at: null };
  if (!all.length && !once.units) return null;
  return {
    orders: all, order: all[0] ?? null, units: all.reduce((n, o) => n + o.volumeTotal, 0) + once.units, before: earlier?.volumeTotal ?? 0,
    atOnce: once.units, atOnceAt: once.at, price: all[0]?.price ?? once.price ?? item.buyAt,
  };
}

/**
 * What the checklist says of what's placed: the lead ("Already placed: 15 of 16 (before the plan)", "16 of 16 placed (15
 * before the plan)") and, when it all covers fewer units than the plan, why it isn't replaced: EVE can't change an
 * order's quantity, so the rest is a new order with its own fee, or the orders stay as they are. Never a nudge to cancel
 * and place again. While a bid that bought some at once may still have the rest standing unseen (its trade under
 * ORDERS_LAG_MS old, `now`), it says so instead of calling the rest a new order.
 */
export function placementNote(item: Pick<PlanItem, 'units'>, pl: Placement, now = Date.now()): { lead: string; short: string | null; atOnce: string | null } {
  const n = (x: number) => x.toLocaleString('en-US');
  const have = pl.units;
  const asides = [...(pl.before > 0 ? [`${n(pl.before)} before the plan`] : []), ...(pl.atOnce > 0 ? [`${n(pl.atOnce)} bought at once`] : [])];
  const lead = pl.atOnce >= have ? `${n(have)} of ${n(item.units)} bought at once`
    : pl.before >= have ? `Already placed: ${n(have)} of ${n(item.units)} (before the plan)`
      : asides.length ? `${n(have)} of ${n(item.units)} placed (${asides.join('; ')})`
        : `${n(have)} of ${n(item.units)} placed`;
  const more = item.units - have;
  // A bid that bought some at once leaves the rest standing as an order, which ESI shows up to ORDERS_LAG_MS late: until
  // then the rest may already be placed, and calling it a new order invites the duplicate this note exists to stop.
  const lagging = pl.atOnce > 0 && pl.atOnceAt != null && now - pl.atOnceAt < ORDERS_LAG_MS;
  const short = more <= 0 ? null : lagging
    ? `The other ${n(more)} may still be standing as your bid: ESI shows your orders up to ${Math.round(ORDERS_LAG_MS / 60_000)} minutes late, so check in game before placing more.`
    : `EVE can’t change an order’s quantity: the ${n(more)} more is a new order with its own fee, or leave it at ${n(have)}.`;
  const atOnce = pl.atOnce > 0
    ? 'Your bid was at or over the cheapest listing, so it bought from the listings there and then: the order shows only in your order history, within the hour.'
    : null;
  return { lead, short, atOnce };
}

export type PlanProgress = { placed: number; of: number; waiting: PlanItem[] };

/** How far placing the plan has got: which items still have nothing placed for them (a buy order, or a bid that bought at once). */
export function planProgress(plan: TradePlan, orders: Order[], positions?: Pick<Position, 'id' | 'typeId' | 'openedAt'>[], trades?: PlanTrades): PlanProgress {
  const waiting = plan.items.filter((i) => !planPlacement(i, plan, orders, positions, trades));
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
 * Whether a plan counts a position it follows whole, rather than through a view from its start (`planView`): one the plan
 * opened, or one opened for it, within the day before it (`POSITION_BEFORE_MS`, the window in which `planPlacement` counts
 * a bid on it as placed for the plan) with nothing traded before the plan. The 30 September plan's Vigilance Resonance
 * Key: position opened 00:35:02, its bid of 15 placed 00:36:15 and counted by the checklist, the plan at 00:41:37; the bid
 * was cancelled unfilled after the plan started, and as a view the plan lost its 4,679,391 ISK fee. A position opened
 * earlier, or with trades before the plan, holds earlier trading: Clone Soldier Transporter Tag's, opened by the 30
 * September plan 2.6 days before the 2 October one, nothing filled, but its bid's fees paid.
 */
export function planCountsWhole(pos: Pick<Position, 'openedAt'>, plan: Pick<TradePlan, 'at'>, tradedBefore: boolean): boolean {
  if (!sharesPosition(pos, plan)) return true;
  return Date.parse(pos.openedAt) >= Date.parse(plan.at) - POSITION_BEFORE_MS && !tradedBefore;
}

/**
 * A position as a plan sees it: from the plan's start, when the position was open before it (`sharesPosition`; whether
 * the plan takes a view at all is `planCountsWhole`), else the position itself. Starting a plan takes the open position an item already has, and the user's second plan (2 October
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
