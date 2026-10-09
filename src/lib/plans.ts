/**
 * A Capital planner mix, started: what to buy, at what price and how many, frozen at the moment you said go, with the
 * positions that follow each item. The game can't place several buy orders at once (Multibuy only buys from listings,
 * ESI places nothing), so the plan becomes a checklist: each item opens in game with its price copied, and ticks off once
 * a buy order for it shows in your orders. The user asked for "place the buy orders in one go and also open the
 * positions for the items in one go, maybe even group them" (29 September 2026). Pure.
 */
import { JITA_44 } from './constants';
import { breakEvenSell } from './fees';
import { FILL_TYPICAL, listingPrice, reachedAsk } from './fills';
import { fmtShort, isk, iskBigSigned, pct } from './format';
import { MARKET_MOVED, marketMoved, type MarketMove } from './prospects';
import { priceUp, tickUp } from './tick';
import type { Order, Position, Tx } from './types';

export type PlanItem = {
  typeId: number;
  /** The bid to place and how many, as the planner priced them. */
  buyAt: number; units: number;
  /** Where the planner expects it to sell. */
  sellAt: number;
  /** The position following it: made by the plan, or one already open on the item. */
  positionId: string | null;
  /**
   * "Skip it" on the checklist or To do, offered when today's book had moved from the plan's prices (`placeMoved`): when,
   * and the others' best bid and cheapest listing it read then, so the row can say why after the book moves on. The plan
   * no longer places it (`planItemState`: `skipped`), as after a cancelled bid; a bid placed for it anyway still counts.
   */
  skipped?: PlanSkip;
};

export type PlanSkip = { at: string; bestBuy: number | null; bestSell: number | null };

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
      .map((i) => {
        const skip = sanitizeSkip(i.skipped);
        return { typeId: i.typeId, buyAt: i.buyAt, units: i.units, sellAt: i.sellAt, positionId: typeof i.positionId === 'string' ? i.positionId : null, ...(skip ? { skipped: skip } : {}) };
      });
    if (!items.length) continue;
    out.push({ id: p.id, name: typeof p.name === 'string' ? p.name : 'A plan', at: p.at, isk: num(p.isk) ?? 0, horizonDays: num(p.horizonDays) ?? 0, patient: !!p.patient, items });
  }
  return out.slice(0, PLANS_KEPT);
}

/** A skip as kept: a time that reads, and each figure a number or none; anything else is no skip (the item is kept). */
function sanitizeSkip(v: unknown): PlanSkip | null {
  if (!v || typeof v !== 'object') return null;
  const x = v as Partial<PlanSkip>;
  if (typeof x.at !== 'string' || !Number.isFinite(Date.parse(x.at))) return null;
  const n = (y: unknown) => (typeof y === 'number' && Number.isFinite(y) ? y : null);
  return { at: x.at, bestBuy: n(x.bestBuy), bestSell: n(x.bestSell) };
}

/**
 * "Skip it" (`skip`) or undone (null) for one plan's item: a new plans list, the rest as they were. Unchanged (the same
 * list) when the plan or the item isn't there.
 */
export function skipPlanItem<P extends TradePlan>(plans: P[], planId: string, typeId: number, skip: PlanSkip | null): P[] {
  const p = plans.find((x) => x.id === planId);
  if (!p || !p.items.some((i) => i.typeId === typeId)) return plans;
  return plans.map((x) => x !== p ? x : {
    ...x,
    items: x.items.map((i) => {
      if (i.typeId !== typeId) return i;
      const { skipped: _, ...rest } = i;
      return skip ? { ...rest, skipped: { ...skip } } : rest;
    }),
  });
}

/** One step: two slack minutes before the plan started, since the app's clock and ESI's may differ a little. */
const SLACK_MS = 2 * 60_000;

/**
 * Whether an order is one you're leaving where it is ("Leave alone", Place and leave): told to move only when trading
 * stops reaching its price, never to get back in front. Orders, the order check and the cloud's alert round all ask here.
 *
 * `leave` lists items; `leaveFrom` says, for an item a Place-and-leave plan left, since when. Such an item's orders are
 * left only when first placed (`seen[0]`, never `issued`, which a price change moves) at or after the plan's start, less
 * SLACK_MS: the plan's own, not every order of the item. The plans review (9 October 2026) found the 2 October plan's
 * Leave alone covering the 30 September at-the-front plan's Clone Soldier Transporter Tag bid (placed 30 September, raised
 * three times), which was then never told to move and held 116.9 M in escrow after its position closed. An item without a
 * time (left by hand on Orders, or by a device or a Worker that doesn't know `leaveFrom`) is left whole, as before.
 * A placement that can't be read is taken as left, as before.
 */
export function isLeft(o: { typeId: number; issued: string; seen?: { issued: string }[] }, leave: readonly number[], leaveFrom?: Readonly<Record<string, string>> | null): boolean {
  if (!leave.includes(o.typeId)) return false;
  const from = leaveFrom ? Date.parse(leaveFrom[o.typeId] ?? '') : NaN;
  if (!Number.isFinite(from)) return true;
  const placed = Date.parse(o.seen?.[0]?.issued ?? o.issued);
  return !Number.isFinite(placed) || placed >= from - SLACK_MS;
}

/** What you're leaving: the synced `leave` list and, for items a plan left, since when. */
export type Leaving = { leave: number[]; leaveFrom: Record<string, string> };

/**
 * Starting a Place-and-leave plan leaves its items from its start (`at`), or an item's own time in `since` (`planLeaveSince`:
 * its position's opening, when the plan counts that position whole). An item already left by hand (in `leave` with no
 * time) stays left whole; one an earlier plan left (still in `leave`) keeps the earlier time, so that plan's orders stay
 * left too. A time for an item no longer in `leave` is stale (an older tab's "Leaving it" dropped `leave` alone, or two
 * devices' writes crossed), and gives way to this plan's.
 */
export function leaveForPlan(leave: readonly number[], leaveFrom: Readonly<Record<string, string>>, typeIds: readonly number[], at: string,
  since: Readonly<Record<string, string>> = {}): Leaving {
  const next = { ...leaveFrom };
  for (const t of typeIds) {
    const held = next[t], own = since[t] ?? at;
    if (leave.includes(t) && held === undefined) continue;
    if (!leave.includes(t) || held === undefined || !(Date.parse(held) <= Date.parse(own))) next[t] = own;
  }
  return { leave: [...new Set([...leave, ...typeIds])], leaveFrom: next };
}

/**
 * Since when a Place-and-leave plan leaves an item's orders: its start, or the item's position's opening when the plan
 * counts that position whole (`planCountsWhole`: opened within the day before the plan with nothing traded before it),
 * the same window in which the checklist counts a bid on it as placed for the plan. The 30 September plan's Vigilance
 * Resonance Key: position opened 00:35:02, its bid placed 00:36:15, the plan started 00:41:37; from the plan's start
 * alone, the bid the checklist counted as the plan's wasn't left.
 */
export function planLeaveSince(pos: Pick<Position, 'openedAt'> | undefined, plan: Pick<TradePlan, 'at'>, tradedBefore: boolean): string {
  return pos && sharesPosition(pos, plan) && planCountsWhole(pos, plan, tradedBefore) ? pos.openedAt : plan.at;
}

/** "Leave alone" by hand (Orders, the planner's mix): every order of these items, whenever placed. */
export function leaveByHand(leave: readonly number[], leaveFrom: Readonly<Record<string, string>>, typeIds: readonly number[]): Leaving {
  const next = { ...leaveFrom };
  for (const t of typeIds) delete next[t];
  return { leave: [...new Set([...leave, ...typeIds])], leaveFrom: next };
}

/** "Leaving it" undone (Orders, the planner's mix): these items get the usual advice again. */
export function stopLeaving(leave: readonly number[], leaveFrom: Readonly<Record<string, string>>, typeIds: readonly number[]): Leaving {
  const next = { ...leaveFrom };
  for (const t of typeIds) delete next[t];
  return { leave: leave.filter((t) => !typeIds.includes(t)), leaveFrom: next };
}

/**
 * After a position of `typeId` closed or was deleted (`positions` as they are afterwards): its item stops being left, so
 * its orders get the usual advice again, unless another open position of the item belongs to a Place-and-leave plan (a
 * patient plan with an item following it). Null when nothing changes. The plans review's Clone Soldier bid was left alone
 * after its position closed on 3 October, with nothing judging it as a plan's and 116.9 M in escrow.
 */
export function leaveAfterClose(leave: readonly number[], leaveFrom: Readonly<Record<string, string>>,
  plans: readonly Pick<TradePlan, 'patient' | 'items'>[], positions: readonly Pick<Position, 'id' | 'typeId' | 'status'>[], typeId: number): Leaving | null {
  if (!leave.includes(typeId) && leaveFrom[typeId] === undefined) return null;
  const open = new Set(positions.filter((p) => p.typeId === typeId && p.status === 'open').map((p) => p.id));
  const kept = plans.some((p) => p.patient && p.items.some((i) => i.typeId === typeId && i.positionId != null && open.has(i.positionId)));
  return kept ? null : stopLeaving(leave, leaveFrom, [typeId]);
}

/**
 * Deleting a position: the close rule, when it was still open. A closed one already had it at its close, and running it
 * again would drop an item left by hand since.
 */
export function leaveAfterDelete(leave: readonly number[], leaveFrom: Readonly<Record<string, string>>,
  plans: readonly Pick<TradePlan, 'patient' | 'items'>[], positions: readonly Pick<Position, 'id' | 'typeId' | 'status'>[], deleted: Pick<Position, 'typeId' | 'status'>): Leaving | null {
  return deleted.status === 'open' ? leaveAfterClose(leave, leaveFrom, plans, positions, deleted.typeId) : null;
}

/**
 * Once, for a ledger from before `leaveFrom` existed (the store runs it when none was stored): the close rule for every item
 * left with no time that a Place-and-leave plan names, so a plan item whose position closed before positions released
 * their items is let go. The plans review's Clone Soldier Transporter Tag bid (116.9 M in escrow, its position closed on 3
 * October) was the case. An item no patient plan names (left by hand: loot, the CNMGC) is never touched, and no time is
 * made up for one that stays. Null when nothing changes.
 */
export function releaseOrphans(leave: readonly number[], leaveFrom: Readonly<Record<string, string>>,
  plans: readonly Pick<TradePlan, 'patient' | 'items'>[], positions: readonly Pick<Position, 'id' | 'typeId' | 'status'>[]): Leaving | null {
  let cur: Leaving = { leave: [...leave], leaveFrom: { ...leaveFrom } }, changed = false;
  for (const t of leave) {
    if (leaveFrom[t] !== undefined || !plans.some((p) => p.patient && p.items.some((i) => i.typeId === t))) continue;
    const next = leaveAfterClose(cur.leave, cur.leaveFrom, plans, positions, t);
    if (next) { cur = next; changed = true; }
  }
  return changed ? cur : null;
}

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
 * Where `planPlacement` looks for a plan item's orders: everything placed since `from` (the plan's start, less SLACK_MS),
 * and the newest placed from `start` before that: since the item's position opened when that was within the day before
 * the plan (`opened`), else within BEFORE_PLAN_MS of it.
 */
function placementWindow(item: PlanItem, plan: Pick<TradePlan, 'at'>, positions: Pick<Position, 'id' | 'typeId' | 'openedAt'>[]): { from: number; start: number; opened: boolean } {
  const planAt = Date.parse(plan.at);
  const pos = positions.find((x) => x.id === item.positionId && x.typeId === item.typeId);
  const at = pos ? Date.parse(pos.openedAt) : NaN;
  const opened = Number.isFinite(at) && at < planAt && at >= planAt - POSITION_BEFORE_MS;
  return { from: planAt - SLACK_MS, start: opened ? at : planAt - BEFORE_PLAN_MS, opened };
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
  const { from, start } = placementWindow(item, plan, positions);
  const mine = orders.filter((o) => o.isBuy && o.typeId === item.typeId && o.locationId === JITA_44 && counts(o));
  const since = mine.filter((o) => placedAt(o) >= from).sort((a, b) => placedAt(b) - placedAt(a));
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

/** A position as `planItemState` reads it: whether it's still open, and since when it isn't. */
export type PlanItemPosition = Pick<Position, 'id' | 'typeId' | 'openedAt'> & Partial<Pick<Position, 'status' | 'closedAt'>>;

/**
 * Where a plan item stands on the checklist:
 * - `placed`: a buy order counts for it, or a bid that bought at once (`planPlacement`), whatever its position has done
 *   since: a bid that filled and sold, its position then closed, was placed.
 * - `closed`: nothing placed, and its position is closed (`at`, when) or deleted (`gone`): the plan no longer places it.
 * - `cancelled`: nothing placed, its position open, and a Jita 4-4 buy of the item placed since the plan started (less
 *   SLACK_MS), or since its position opened when that was within the day before the plan, was cancelled with nothing
 *   bought (`order`; `at` is when it was placed: ESI doesn't say when an order was cancelled, so a bid placed after the
 *   position opened and cancelled before the plan started reads the same). Not the hour before the plan that
 *   `planPlacement` falls back to: a bid placed and cancelled then, before the plan, would drop the item at once. A new
 *   order placed after it is a placement as usual: re-placing at another price counts.
 * - `skipped`: nothing placed, and you skipped it on the checklist or To do, offered when today's book had moved from the
 *   plan's prices (`placeMoved`; `at`, and the book it read then). Read like `cancelled`: a bid placed for it anyway counts.
 * - `open`: still to place.
 * The user's 2 October plan (8 October 2026): four bids judged "Cancel it" were cancelled with nothing bought and their
 * positions closed, and To do asked for "9 × Fierce Exotic Filament at 2,813,000" again within the plan's week, at the
 * price just judged unreachable; "if we have closed them then opening them again could have just been a price adjustment".
 * An expired bid with nothing bought isn't a choice, so it reads as nothing placed. Without `positions` (or with no
 * `positionId`) a position's state can't be told and nothing reads as closed.
 */
export type PlanItemState =
  | { state: 'placed'; placement: Placement }
  | { state: 'closed'; at: number | null; gone: boolean }
  | { state: 'cancelled'; order: Order; at: number }
  | { state: 'skipped'; at: number; bestBuy: number | null; bestSell: number | null }
  | { state: 'open' };

export function planItemState(item: PlanItem, plan: Pick<TradePlan, 'at'>, orders: Order[], positions?: PlanItemPosition[], trades?: PlanTrades): PlanItemState {
  const placement = planPlacement(item, plan, orders, positions, trades);
  if (placement) return { state: 'placed', placement };
  if (positions && item.positionId != null) {
    const pos = positions.find((x) => x.id === item.positionId && x.typeId === item.typeId);
    if (!pos) return { state: 'closed', at: null, gone: true };
    if (pos.status === 'closed') {
      const at = pos.closedAt ? Date.parse(pos.closedAt) : NaN;
      return { state: 'closed', at: Number.isFinite(at) ? at : null, gone: false };
    }
  }
  // A bid cancelled before the plan counts only from the position opened for the plan: ESI doesn't say when a bid was
  // cancelled, so one placed in the hour before a plan and cancelled before it started would otherwise drop the item for
  // good (the review, 8 October 2026: place a bid, cancel it, then start a plan with the item, and it's never asked for).
  const { from, start, opened } = placementWindow(item, plan, positions ?? []);
  const since = opened ? Math.min(start, from) : from;
  const cancelled = orders
    .filter((o) => o.isBuy && o.typeId === item.typeId && o.locationId === JITA_44 && o.state === 'cancelled' && filledOf(o) === 0 && placedAt(o) >= since)
    .sort((a, b) => placedAt(b) - placedAt(a))[0];
  if (cancelled) return { state: 'cancelled', order: cancelled, at: placedAt(cancelled) };
  // Skipped on the checklist or To do, today's book having moved from the plan's prices (the plans review, 9 October 2026).
  if (item.skipped) return { state: 'skipped', at: Date.parse(item.skipped.at), bestBuy: item.skipped.bestBuy, bestSell: item.skipped.bestSell };
  return { state: 'open' };
}

/** A plan item the plan no longer places: its bid cancelled with nothing bought, its position closed or deleted, or skipped. */
export type DroppedState = Extract<PlanItemState, { state: 'closed' | 'cancelled' | 'skipped' }>;
export const droppedState = (s: PlanItemState): s is DroppedState => s.state === 'closed' || s.state === 'cancelled' || s.state === 'skipped';

/**
 * What the checklist says of an item the plan no longer places: "Bid cancelled with nothing bought: not placed again",
 * with the bid; "Position closed 8 Oct: not placed again". ESI doesn't say when a bid was cancelled, so the bid is named
 * by what it was and when it was placed.
 */
export function droppedNote(s: DroppedState, item?: Pick<PlanItem, 'buyAt' | 'sellAt'>): { lead: string; sub: string | null } {
  if (s.state === 'skipped') {
    const plan = item ? `, against the plan’s bid of ${isk(item.buyAt)} and sale of ${isk(item.sellAt)}` : '';
    return {
      lead: `Skipped ${fmtShort(s.at)}: the market had moved`,
      sub: `When you skipped it, the best bid was ${s.bestBuy != null ? isk(s.bestBuy) : 'none'} and the cheapest listing ${s.bestSell != null ? isk(s.bestSell) : 'none'}${plan}. Not placed again; a new bid would count as placing it.`,
    };
  }
  if (s.state === 'cancelled') {
    const n = s.order.volumeTotal.toLocaleString('en-US');
    return { lead: 'Bid cancelled with nothing bought: not placed again', sub: `Your bid of ${n} at ${isk(s.order.price)}, placed ${fmtShort(s.at)}. Cancelling it took the item off the plan; a new bid would count as placing it.` };
  }
  return s.gone
    ? { lead: 'Position deleted: not placed again', sub: null }
    : { lead: `Position closed${s.at != null ? ` ${fmtShort(s.at)}` : ''}: not placed again`, sub: null };
}

/**
 * A plan's bid still to place, against its live Jita book (others' orders: `listMarket`), by Market moved's own rule
 * (`marketMoved`): the bid more than MARKET_MOVED under or over today's best bid, at or over today's cheapest listing (it
 * would buy at once), or the plan's sale more than MARKET_MOVED over today's cheapest listing. Null when not moved, or with
 * no book to say (`market` null, or nobody bidding or listing). The plans review (9 October 2026): the checklist asked for
 * every bid at the plan's price however far the book had moved since, Raging Dark Filament's 1,711,000 19% over a best bid
 * of 1,440,000 among them, bought within the hour and then 13% under water.
 */
export function placeMoved(item: Pick<PlanItem, 'buyAt' | 'sellAt'>, market: Pick<ListMarket, 'bestBuy' | 'bestSell'> | null): MarketMove | null {
  if (!market) return null;
  return marketMoved(item.buyAt, item.sellAt, market.bestBuy, market.bestSell);
}

/** What the checklist and To do say of a bid the market has moved from: a lead, and a line a side with today's figures. */
export function placeMovedSaid(item: Pick<PlanItem, 'buyAt' | 'sellAt'>, m: MarketMove, bestBuy: number | null, bestSell: number | null): { lead: string; lines: string[] } {
  const by = (x: number) => pct(x, x < 0.1 ? 1 : 0);
  const lines: string[] = [];
  if (m.bid?.side === 'atOnce') lines.push(`Its bid of ${isk(item.buyAt)} is at or over today’s cheapest listing of ${isk(bestSell)}: it would buy at once, from the listings.`);
  else if (m.bid?.side === 'over') lines.push(`Its bid of ${isk(item.buyAt)} is ${by(m.bid.by)} over today’s best bid of ${isk(bestBuy)}: the market has fallen, so it would pay more than buyers bid now.`);
  else if (m.bid) lines.push(`Its bid of ${isk(item.buyAt)} is ${by(m.bid.by)} under today’s best bid of ${isk(bestBuy)}: the market has risen, so it may not fill.`);
  if (m.sell) lines.push(`It sells at ${isk(item.sellAt)}, ${by(m.sell.by)} over today’s cheapest listing of ${isk(bestSell)}: it would wait behind cheaper listings.`);
  return { lead: 'The market has moved since the plan priced it', lines };
}

/**
 * How far placing the plan has got: what's placed (a buy order, or a bid that bought at once), what the plan no longer
 * places (`dropped`: its bid cancelled with nothing bought, its position closed or deleted, or skipped), and what still has nothing
 * placed for it (`waiting`). A plan with nothing waiting is done placing, dropped items and all.
 */
export type PlanProgress = { placed: number; of: number; waiting: PlanItem[]; dropped: PlanItem[] };

export function planProgress(plan: TradePlan, orders: Order[], positions?: PlanItemPosition[], trades?: PlanTrades): PlanProgress {
  const waiting: PlanItem[] = [], dropped: PlanItem[] = [];
  let placed = 0;
  for (const i of plan.items) {
    const s = planItemState(i, plan, orders, positions, trades);
    if (s.state === 'placed') placed++;
    else if (droppedState(s)) dropped.push(i);
    else waiting.push(i);
  }
  return { placed, of: plan.items.length, waiting, dropped };
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

// --- The list step: what a plan bought, priced to list ------------------------------------------------------------------

/**
 * What's on your Jita 4-4 sell orders of an item since its position opened (`since`), for the list step: `open` units still
 * listed, and `units` with those a listing has filled that no sale in the position records yet (ESI holds your trades an
 * hour, your orders 20 minutes: without them a listing that sold would read as stock to list again until its trade came).
 * An order counts by when it was placed, its first version: a price change moves `issued`, and EVE can't add units to an
 * order, so one placed before the position lists stock the position never counted. The user's Raging Dark Filament (2
 * October 2026): 1 listed on 1 October, repriced after the plan; by `issued` it hid one of the plan's 10. `sells` are the
 * whole position's sales. `price` is the newest open listing's, else the newest's.
 */
export type Listed = { units: number; open: number; price: number | null };

export function listedSince(orders: Order[], typeId: number, since: string, sells: { t: number; qty: number }[]): Listed {
  const from = Date.parse(since);
  const mine = orders.filter((o) => !o.isBuy && o.typeId === typeId && o.locationId === JITA_44 && placedAt(o) >= from)
    .sort((a, b) => placedAt(b) - placedAt(a));
  if (!mine.length) return { units: 0, open: 0, price: null };
  const open = mine.filter((o) => o.state === 'open').reduce((n, o) => n + o.volumeRemain, 0);
  const fills = mine.reduce((n, o) => n + filledOf(o), 0);
  const first = Math.min(...mine.map(placedAt));
  const recorded = sells.filter((s) => s.t >= first).reduce((n, s) => n + s.qty, 0);
  const newest = mine.find((o) => o.state === 'open' && o.volumeRemain > 0) ?? mine[0];
  return { units: open + Math.max(0, fills - recorded), open, price: newest.price };
}

/**
 * Units of a plan item to list: what the plan bought and hasn't sold (`stock`: a position it took over counts from its start,
 * the earlier stock selling first, `planPosition`), no more than the whole position holds that isn't on a sell order
 * (`whole` less `listed`: units are alike, so the earlier stock is listed first, as it sells first), and, once the hangar has
 * been read, no more than it holds.
 */
export function unitsToList(x: { stock: number; whole: number; listed: number; hangar: number | null }): number {
  return Math.max(0, Math.min(x.stock, x.whole - x.listed, x.hangar ?? Infinity));
}

/** Today's Jita book as the list step reads it: others' cheapest listing and best bid (yours set apart), and the fortnight's highs. */
export type ListMarket = { bestSell: number | null; bestBuy: number | null; highs: (number | null)[] | null };

export function listMarket(book: { id: number; isBuy: boolean; price: number }[], yours: readonly number[], highs: (number | null)[] | null): ListMarket {
  const mine = new Set(yours);
  const others = book.filter((o) => !mine.has(o.id));
  const sells = others.filter((o) => !o.isBuy).map((o) => o.price), bids = others.filter((o) => o.isBuy).map((o) => o.price);
  return { bestSell: sells.length ? Math.min(...sells) : null, bestBuy: bids.length ? Math.max(...bids) : null, highs };
}

/** The price a plan's bought stock lists at, the figure beside it, and what it makes. */
export type PlanListPrice = {
  /** Where to list: null only at the front with no listing to price against (`missing`). */
  price: number | null;
  /** The plan's own price (Place and leave), today's listing price (at the front), or break-even when that lifted it. */
  from: 'plan' | 'front' | 'breakEven' | null;
  /** The plan's sale price, as the planner set it. */
  planPrice: number;
  /** Today's figure: List patiently for Place and leave, the listing price at the front. Null when it can't be said. */
  today: number | null;
  /** The figure shown beside the price: today's for Place and leave, the plan's own at the front. */
  other: number | null;
  /** Today's figure against the plan's, when more than MARKET_MOVED apart: which way, and by how much (a fraction). */
  moved: { dir: 'up' | 'down'; by: number } | null;
  /** Others' cheapest Jita listing today; null when the book wasn't read or nobody lists it. */
  cheapest: number | null;
  /**
   * Today's cheapest listing when it's more than MARKET_MOVED under the plan's sale price: by how much (a fraction), and what
   * the units make sold there, after the broker fee and sales tax (a unit, all of them, as a return). Null otherwise.
   */
  atCheapest: { by: number; perUnit: number | null; profit: number | null; ret: number | null } | null;
  /** The price to list at is over today's cheapest listing: what it makes there is said as that, never as plain profit. */
  overCheapest: boolean;
  /** The least a unit lists at without selling under what it cost, after the broker fee and sales tax (`underCost`'s). */
  breakEven: number;
  /** After the broker fee and sales tax at the price, against what the units cost: a unit, all of them, and as a return. */
  perUnit: number | null; profit: number | null; ret: number | null;
  /** What wasn't known: no book read, a book with no listing in it, or no history for today's patient figure. */
  missing: 'book' | 'listing' | 'highs' | null;
};

/**
 * Where a plan's bought stock lists. A Place-and-leave plan lists at its own sale price (`sellAt`): its intent is to list and
 * wait where the bulk of trading reached on half the fortnight, and today's List patiently (`reachedAsk` at FILL_TYPICAL, one
 * step over others' best bid at least, as the position page shows it) is the figure beside it. An at-the-front plan lists at
 * today's `listingPrice` on the live book, since following the front is what it does, with the plan's price beside it. Never
 * under break-even. The user's Imperial Navy Infiltrator (2 October 2026): 11 bought at 1,608,000, the plan selling at
 * 1,836,000; today's listing price, 1,608,000, and List safely, 1,666,000, were both under its 1,708,000 break-even.
 */
export function planListPrice(
  item: Pick<PlanItem, 'sellAt'>, patient: boolean, units: number, unitCost: number,
  r: { f: number; t: number; k: number }, m: ListMarket | null,
): PlanListPrice {
  const breakEven = priceUp(breakEvenSell(unitCost, r, 0));
  const patientToday = (() => {
    const at = m?.highs ? reachedAsk(m.highs, FILL_TYPICAL) : null;
    if (at == null) return null;
    return m?.bestBuy != null && m.bestBuy > 0 ? Math.max(at, tickUp(m.bestBuy)) : at;
  })();
  const today = patient ? patientToday : m ? listingPrice(m.bestSell, m.bestBuy, m.highs) : null;
  const base = patient ? item.sellAt : today;
  const price = base == null ? null : Math.max(base, Number.isFinite(breakEven) ? breakEven : 0);
  const from: PlanListPrice['from'] = base == null ? null : Number.isFinite(breakEven) && base < breakEven ? 'breakEven' : patient ? 'plan' : 'front';
  const by = today != null && item.sellAt > 0 ? today / item.sellAt - 1 : null;
  const moved = by != null && Math.abs(by) > MARKET_MOVED + 1e-12 ? { dir: by > 0 ? 'up' as const : 'down' as const, by } : null;
  const keep = 1 - r.f - r.t;
  const perUnit = price != null && unitCost > 0 ? price * keep - unitCost : null;
  const missing: PlanListPrice['missing'] = patient ? (patientToday == null ? 'highs' : null) : !m ? 'book' : m.bestSell == null ? 'listing' : null;
  // Today's book as well as the fortnight's: the fortnight's List patiently can sit at the plan's price while today's listings
  // are far under it. The plans review (9 October 2026): Federation Navy Fleet Captain Insignia I read "+6.1% at 920,100",
  // nothing moved, with List patiently at 915,200 and today's cheapest listing 801,200, under its 826,978 cost.
  // Others' cheapest listing as it is, not `marketBest`'s token-guarded front: on Fed Navy's book that read 919,000, skipping
  // 379 real units from 801,200 (its level dragged up by 22,600 listed at a million and more: known-bugs.md). limits.md.
  const cheapest = m?.bestSell != null && m.bestSell > 0 ? m.bestSell : null;
  const under = cheapest != null && item.sellAt > 0 ? 1 - cheapest / item.sellAt : null;
  const there = cheapest != null && unitCost > 0 ? cheapest * keep - unitCost : null;
  const atCheapest = under != null && under > MARKET_MOVED + 1e-12
    ? { by: under, perUnit: there, profit: there != null ? there * units : null, ret: there != null ? there / unitCost : null } : null;
  return {
    price, from, planPrice: item.sellAt, today, other: patient ? today : item.sellAt, moved, cheapest, atCheapest,
    overCheapest: price != null && cheapest != null && price > cheapest, breakEven,
    perUnit, profit: perUnit != null ? perUnit * units : null, ret: perUnit != null ? perUnit / unitCost : null, missing,
  };
}

/** The list step in words, the same on the checklist, To do and the tests: where the price comes from, the figure beside it, the move, the floor. */
export function planListSaid(x: PlanListPrice, patient: boolean): { from: string; other: string; moved: string | null; floor: string | null; profit: string | null } {
  const from = x.from === 'breakEven' ? 'Break-even: the least it lists at without a loss'
    : x.from === 'plan' ? 'The plan’s price: list it and leave it'
      : x.from === 'front' ? 'Today’s listing price: the plan follows the front'
        : x.missing === 'listing' ? 'Nobody lists it in Jita, so there’s no front to price at'
          : 'Its Jita book couldn’t be read, so there’s no price at the front yet';
  const other = patient
    ? (x.today != null ? `List patiently today: ${isk(x.today)}` : 'No history to say where trading gets up to today')
    : `The plan priced it at ${isk(x.planPrice)}`;
  const by = x.moved ? pct(Math.abs(x.moved.by), 1) : '';
  const side = x.moved?.dir === 'up' ? 'over' : 'under';
  const signed = (v: number, ret: number) => `${iskBigSigned(v)} after fees (${ret >= 0 ? '+' : ''}${pct(ret, 1)})`;
  // Place and leave: today's cheapest listing far under the plan's price is the market moving down, whatever the fortnight
  // says, with what the plan's units make there. At the front the price is already today's listing price.
  const c = patient ? x.atCheapest : null;
  const moved = c && x.cheapest != null
    ? `The market has moved down since the plan: today’s cheapest listing is ${isk(x.cheapest)}, ${pct(c.by, 1)} under the plan’s ${isk(x.planPrice)}${c.profit != null && c.ret != null ? `; sold there, they make ${signed(c.profit, c.ret)}` : ''}.`
    : !x.moved || x.today == null ? null : patient
      ? `The market has moved ${x.moved.dir} since the plan: List patiently is ${isk(x.today)} today, ${by} ${side} the plan’s ${isk(x.planPrice)}.`
      : `The market has moved ${x.moved.dir} since the plan: today’s listing price, ${isk(x.today)}, is ${by} ${side} the plan’s ${isk(x.planPrice)}.`;
  const floor = x.from !== 'breakEven' ? null
    : `${patient ? `The plan’s ${isk(x.planPrice)}` : `Today’s listing price, ${isk(x.today)},`} sells under what they cost after fees, so it lists at break-even, ${isk(x.breakEven)}.`;
  // Never a profit at a price over today's cheapest listing without saying so: it's made only once those under it have sold.
  const profit = x.profit != null && x.ret != null
    ? `${signed(x.profit, x.ret)}${x.overCheapest && x.price != null && x.cheapest != null ? ` if they sell at ${isk(x.price)}, over today’s cheapest listing of ${isk(x.cheapest)}` : ''}` : null;
  return { from, other, moved, floor, profit };
}
