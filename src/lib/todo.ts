import { fmtDateTime, isk, iskBig, units } from './format';
import { planListSaid, type Listed, type PlanItem, type PlanItemState, type PlanListPrice, type TradePlan } from './plans';
import { FEEDS_QUEUE_DO, feedsQueueLead, notReachedSince, type FeedsQueue, type Relist, type Verdict } from './relist';
import { DATACORE_FEE, RP_PER_DATACORE } from './research';

/**
 * To do: everything worth doing right now, in one list, the most ISK at stake first.
 *
 * Built only from findings the rest of the app has already made from live data --- orders checked
 * against the book, positions, colonies, trades the positions skipped, suspicious markets, and the
 * age of your last backup. Nothing is added here that the other pages would not also say.
 *
 * It also keeps itself current. Every finding is remembered for the session, and when a newer read of
 * the data it came from no longer shows it, it is ticked off with what changed: you moved the order, it
 * sold, the heads were reset. Done in game or in the app, it doesn't matter, and nobody has to tick
 * anything. Only a *newer read* may say so, though: before your orders have been checked every order
 * is simply absent, and reading absent as done would tick the whole list off on every load.
 */

export type TodoKind = 'move' | 'cancel' | 'bid' | 'notReached' | 'underCost' | 'feedsQueue' | 'close' | 'squeeze' | 'piExpired' | 'piEnding' | 'nearMiss' | 'scam' | 'backup' | 'industry' | 'courier' | 'cloudLogin' | 'placeBuy' | 'planList' | 'cashIn';

/** Which read a finding came from, and so which read can say it has gone. */
export type Source = 'orders' | 'colonies' | 'signals' | 'ledger' | 'industry' | 'contracts' | 'cloud' | 'roster' | 'research';

export type TodoItem = {
  /** What it's about, stable for as long as the finding lasts: `order:123`, `pi:456`, `backup`. */
  key: string;
  /** The state of the finding. A new one reopens an item ticked by hand: a fresh undercut is a new chore. */
  ver: string;
  kind: TodoKind;
  source: Source;
  title: string;
  detail: string;
  /** ISK this decides, for ordering. Zero when it is about safety rather than money. */
  stake: number;
  /** An order's own price when it was found, so a later check can tell a relist from a queue that cleared. */
  price?: number;
  /** `cashIn`: the amount it was listed against, so a setting raised past it can be told from a price that fell. */
  amount?: number;
  /** The item whose signal it came from. */
  typeId?: number;
  /** Where the action button goes. */
  /** `copy`: a price opening it in game puts on the clipboard, ready for the price box. */
  /** `cloudLogin`: which of the cloud's logins to hand over again. */
  /** `dest`: a station to set as the destination in game first (the main's own R&D agent's). */
  action: { label: string; route?: string; typeId?: number; exportBackup?: boolean; copy?: number; cloudLogin?: 'main' | 'mailer'; dest?: number };
};

export type Entry = {
  item: TodoItem;
  /** When the read that last showed it was taken. */
  seenAt: number;
  /** When it was last in the list. */
  lastAt: number;
  /** Ticked by hand: which version, and when. */
  ticked?: { ver: string; at: number };
  /** When its market window was opened in game. */
  openedAt?: number;
  /** Ticked off because a newer read no longer shows it, and what changed. */
  done?: { at: number; how: string };
};

export type Memory = Record<string, Entry>;

/** How long a finished item stays listed as done, and how long a chore ticked by hand stays ticked. */
export const SESSION_MS = 12 * 3600_000;

/**
 * Warnings aren't chores: ticking one means "I've seen it", and that holds until the finding changes.
 * A chore ticked by hand ("not now") comes back after SESSION_MS if it still needs doing.
 */
export const WARNINGS: ReadonlySet<TodoKind> = new Set<TodoKind>(['scam', 'squeeze']);

/**
 * Chores whose tick by hand holds until the finding changes (its version), like a warning's, rather than coming back after
 * SESSION_MS: a cash-in item's version is the whole datacores waiting, so "not now" holds until another one comes in. Kept
 * apart from WARNINGS, which also decides what an item wants from you (`needs`): these are still something to do.
 */
export const HOLDS_UNTIL_CHANGED: ReadonlySet<TodoKind> = new Set<TodoKind>(['cashIn']);

/**
 * What an item wants from you: something to do, in game or here, or a warning to know about. The user asked to sift
 * the list for what needs acting on and look at the rest when they want (29 September 2026).
 */
export type TodoFilter = 'all' | 'act' | 'info';
export const needs = (k: TodoKind): 'act' | 'info' => (WARNINGS.has(k) ? 'info' : 'act');
export const inFilter = (k: TodoKind, f: TodoFilter): boolean => f === 'all' || needs(k) === f;

/**
 * Ticks every one of `keys` still open by hand, as its box would: a chore for 12 hours, a warning (or a cash-in) until it
 * changes.
 * Items already done or ticked, or no longer remembered, are left as they are.
 */
export function tickAll(m: Memory, keys: string[], now: number): Memory {
  const next = { ...m };
  for (const k of keys) {
    const cur = next[k];
    if (!cur || cur.done || cur.ticked) continue;
    next[k] = { ...cur, ticked: { ver: cur.item.ver, at: now } };
  }
  return next;
}

/**
 * Roughly how long each kind of task takes at the keyboard, for the total at the top. These are not
 * measured --- they are there so a list of twelve relists reads as a quarter of an hour, not an evening.
 */
export const MINUTES: Record<TodoKind, number> = {
  move: 1, cancel: 1, bid: 2, notReached: 1, underCost: 1, feedsQueue: 1, close: 1, squeeze: 2, piExpired: 5, piEnding: 4, nearMiss: 1, scam: 0, backup: 1, industry: 1, courier: 10, cloudLogin: 1, placeBuy: 1, planList: 1, cashIn: 5,
};

export const KIND_LABEL: Record<TodoKind, string> = {
  move: 'Move order', cancel: 'Cancel order', bid: 'Sell into bids', notReached: 'Not reached since you placed it', underCost: 'Priced under cost', feedsQueue: 'Feeds a long queue', close: 'Close position', squeeze: 'Margin squeeze', piExpired: 'PI expired',
  piEnding: 'PI ending', nearMiss: 'Trades your positions skipped', scam: 'Suspicious market', backup: 'Backup', industry: 'Industry jobs to deliver', courier: 'Courier to deliver',
  cloudLogin: 'Cloud login', placeBuy: 'Place buy order', planList: 'List what the plan bought', cashIn: 'Cash in datacores',
};

/**
 * What the current data says about a remembered item the latest build no longer produced: a sentence
 * saying what changed, null when it can't tell yet (the read it came from hasn't been redone), or false
 * when it no longer concerns you at all and should go without a tick.
 */
export type Judge = (e: Entry) => string | null | false;

/**
 * Fold the latest findings into the session's memory.
 *
 * Present items are refreshed. A tick by hand survives only on the same version, and on a chore only
 * for SESSION_MS. An item that has gone is judged: ticked off with the reason when the data can say,
 * kept as it was (and shown as being checked) when it can't, and forgotten after SESSION_MS either way.
 */
export function remember(mem: Memory, items: TodoItem[], seenAt: (x: TodoItem) => number, judge: Judge, now: number): Memory {
  const next: Memory = {};
  for (const x of items) {
    const e = mem[x.key];
    const same = !!e && !e.done && e.item.ver === x.ver;
    const ticked = same && e.ticked && (WARNINGS.has(x.kind) || HOLDS_UNTIL_CHANGED.has(x.kind) || now - e.ticked.at < SESSION_MS) ? e.ticked : undefined;
    next[x.key] = { item: x, seenAt: seenAt(x), lastAt: now, ticked, openedAt: same ? e.openedAt : undefined };
  }
  for (const [k, e] of Object.entries(mem)) {
    if (next[k]) continue;
    if (e.done) {
      if (now - e.done.at < SESSION_MS) next[k] = e;
      continue;
    }
    const how = judge(e);
    if (how === false) continue;
    if (how != null) next[k] = { ...e, done: { at: now, how } };
    else if (now - e.lastAt < SESSION_MS) next[k] = e;
  }
  return next;
}

export type Split = {
  /** Still to do, most ISK first. `checking` ones have gone from the list and are waiting on a newer read. */
  open: { e: Entry; checking: boolean }[];
  /** Done, most recent first: ticked off by the data, or by hand. */
  done: Entry[];
};

/** Most ISK first; ties keep the order they were found in. */
export function orderTodo<T extends { stake: number }>(items: T[]): T[] {
  return items.map((x, i) => ({ x, i })).sort((a, b) => b.x.stake - a.x.stake || a.i - b.i).map((p) => p.x);
}

export function split(mem: Memory, present: ReadonlySet<string>): Split {
  const open: Split['open'] = [];
  const done: Entry[] = [];
  for (const e of Object.values(mem)) {
    if (e.done) done.push(e);
    else if (!present.has(e.item.key)) open.push({ e, checking: true });
    else if (e.ticked) done.push(e);
    else open.push({ e, checking: false });
  }
  const when = (e: Entry) => e.done?.at ?? e.ticked?.at ?? 0;
  return {
    open: orderTodo(open.map((o) => ({ ...o, stake: o.e.item.stake }))).map(({ e, checking }) => ({ e, checking })),
    done: done.sort((a, b) => when(b) - when(a)),
  };
}

export function summarise(s: Split): { left: number; minutes: number; stake: number; frac: number } {
  const total = s.open.length + s.done.length;
  return {
    left: s.open.length,
    minutes: s.open.reduce((t, o) => t + MINUTES[o.e.item.kind], 0),
    stake: s.open.reduce((t, o) => t + o.e.item.stake, 0),
    frac: total ? s.done.length / total : 1,
  };
}

// --- What changed, per kind -------------------------------------------------------------------------

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * An order item that has gone. `open` is from your synced orders, the rest from the latest check of the
 * book: whether that check read this item's book at all (a failed fetch looks exactly like a missing
 * order), and the verdict it reached. The price comes from the live book, so a relist made in game
 * shows as soon as ESI's five-minute copy of the book does.
 */
export function judgeOrder(
  e: Entry,
  c: { open: boolean; checkedAt: number | null; bookRead: boolean; v?: { gone: boolean; verdict: Verdict; price: number; why: string; keep?: unknown } },
): string | null {
  if (!c.open) return 'The order has closed: it filled, expired or was cancelled.';
  // Only a check newer than the one that showed it. A second tab holding an older check must not judge
  // an item the first tab saw since.
  if (c.checkedAt == null || c.checkedAt <= e.seenAt || !c.bookRead || !c.v) return null;
  const v = c.v;
  if (v.gone) return 'It’s no longer in the market: it filled, expired or was cancelled.';
  if (v.verdict === 'move' || v.verdict === 'dry' || v.verdict === 'bid') return null;
  if (e.item.kind === 'bid') return 'Buyers are taking listings again, so it can stay listed.';
  const moved = e.item.price != null && v.price !== e.item.price;
  if (v.verdict === 'front') return moved ? `You moved it to ${isk(v.price)}, and it’s at the front.` : 'It’s at the front now: the orders ahead of it have gone.';
  if (moved) return `You moved it to ${isk(v.price)}. ${v.why}.`;
  // Raising it would now leave too little (the buy guard): its own words, which end "Keep it at …".
  if (v.verdict === 'loss' && v.keep) return `${v.why}.`;
  return v.verdict === 'wait' ? `Not worth moving now: ${lower(v.why)}.` : `Moving it no longer pays: ${lower(v.why)}.`;
}

/** A sell order priced under cost that no longer is: judged, like an order item, only on a newer check of its book. */
export function judgeUnderCost(
  e: Entry,
  c: { open: boolean; checkedAt: number | null; bookRead: boolean; v?: { gone: boolean; price: number; underCost?: unknown } },
): string | null {
  if (!c.open) return 'The order has closed: it filled, expired or was cancelled.';
  if (c.checkedAt == null || c.checkedAt <= e.seenAt || !c.bookRead || !c.v) return null;
  if (c.v.gone) return 'It’s no longer in the market: it filled, expired or was cancelled.';
  if (c.v.underCost) return null;
  return e.item.price != null && c.v.price !== e.item.price ? `You moved it to ${isk(c.v.price)}, over what it cost.` : 'It no longer sells under what it cost.';
}

/**
 * A buy order Orders tags "Feeds a long queue" (`feedingQueue` in relist.ts): what it still buys joins a sell queue weeks
 * long. On To do as something to act on (cancel it, or cancel it and place a smaller one), in the tag's own words, never
 * mailed; the user approved it on 2 October 2026, after their 'Arbalest' buy. Keyed by the order. Its version is the
 * order's price alone: not the queue's days, which move with every read of the pace, nor what it still buys, since a buy
 * filling all day would reopen a tick each time. A tick by hand holds as a chore's does, or until you reprice the order.
 * Null for an order not tagged.
 */
export function feedsQueueItem(
  x: { orderId: number; typeId: number; price: number; volumeRemain: number; atRisk: number; feeds?: FeedsQueue },
  name: string,
  action: TodoItem['action'],
): TodoItem | null {
  if (!x.feeds?.long) return null;
  return {
    key: `feeds:${x.orderId}`, ver: `feeds:${x.price}`, kind: 'feedsQueue', source: 'orders', price: x.price, stake: x.atRisk, typeId: x.typeId,
    title: `${name} buy order`,
    detail: `${feedsQueueLead(x.feeds)} ${FEEDS_QUEUE_DO}`,
    action,
  };
}

/**
 * A left order (Place and leave, or left by hand) the bulk of trading hasn't reached on any day since it was placed
 * (`notReachedSince`, the plans review of 9 October 2026: 633 M sat in 13 such bids, each read "reached on 5 of the last
 * 14 days" from days before it existed). One item per order, whatever it's told, since the point is to see what sits where
 * the market isn't: keyed by the order as its move or cancel would be, so it stands in their place, and versioned by the
 * order's price, as a long queue's is: where trading reaches now moves with each day's history and doesn't reopen a hand
 * tick; a reprice does. A move copies its price when opened in game and says what it costs; a cancel says what it frees;
 * Keep it, or a listing whose move would sell under cost, is said in the verdict's own words and copies nothing (no cancel
 * is added to a Keep it: the rule of 8 October 2026). Judged as any order item (`judgeOrder`): ticked off by a newer check
 * that read its book and no longer says so, or the order closing.
 */
export function notReachedItem(
  x: Pick<Relist, 'orderId' | 'typeId' | 'isBuy' | 'price' | 'newPrice' | 'atRisk' | 'cost' | 'verdict' | 'why' | 'unreached' | 'since'>,
  name: string,
  action: TodoItem['action'],
): TodoItem | null {
  if (!notReachedSince(x)) return null;
  const move = x.verdict === 'move';
  return {
    key: `order:${x.orderId}`, ver: `notReached:${x.price}`, kind: 'notReached', source: 'orders', price: x.price, stake: x.atRisk, typeId: x.typeId,
    title: `${name} ${x.isBuy ? 'buy' : 'sell'} order`,
    detail: move ? `${x.why}. Move it to ${isk(x.newPrice)}: costs ${iskBig(x.cost)}.`
      : x.verdict === 'dry' ? `${x.why}. Cancel it to free ${iskBig(x.atRisk)}.` : `${x.why}.`,
    action: move ? { ...action, copy: x.newPrice } : action,
  };
}

/**
 * A buy that fed a long queue and no longer does, judged like an order item: only on a newer check that read its book
 * (absent is not done), or once the order has closed. That check can't tell a shorter queue from a pace it can no longer
 * read, so it says only what Orders now shows.
 */
export function judgeFeedsQueue(
  e: Entry,
  c: { open: boolean; checkedAt: number | null; bookRead: boolean; v?: { gone: boolean; feeds?: unknown } },
): string | null {
  if (!c.open) return 'The order has closed: it filled, expired or was cancelled.';
  if (c.checkedAt == null || c.checkedAt <= e.seenAt || !c.bookRead || !c.v) return null;
  if (c.v.gone) return 'It’s no longer in the market: it filled, expired or was cancelled.';
  if (c.v.feeds) return null;
  return 'The latest check of its book no longer has what it buys feeding a long queue.';
}

/** A PI item that has gone, judged only on a colony read newer than the one that showed it. */
export function judgePi(e: Entry, c: { readAt: number | null; extractor: { expiry: number | null } | null }, now: number): string | null {
  if (c.readAt == null || c.readAt <= e.seenAt) return null;
  if (!c.extractor) return 'The extractor is no longer on that colony.';
  const { expiry } = c.extractor;
  if (expiry == null) return 'The extractor has no programme running now.';
  if (expiry - now > 24 * 3600_000) return `The heads were reset: it runs until ${fmtDateTime(expiry)}.`;
  return null;
}

/**
 * Finished industry jobs, ticked off once a newer read of your jobs no longer has any of them waiting: delivered in the
 * Industry window. The item's `ver` holds the job IDs it was about.
 */
export function judgeIndustry(e: Entry, c: { readAt: number | null; waiting: ReadonlySet<number> }): string | null {
  if (c.readAt == null || c.readAt <= e.seenAt) return null;
  const ids = e.item.ver.split('.').map(Number).filter((n) => n > 0);
  return ids.some((id) => c.waiting.has(id)) ? null : ids.length === 1 ? 'Delivered.' : 'All delivered.';
}

/**
 * A courier you accepted, ticked off once a newer read of your contracts shows it no longer in progress: delivered, or
 * failed (the collateral is lost). The item's key holds the contract ID.
 */
export function judgeCourierJob(e: Entry, c: { readAt: number | null; status: string | null }): string | null {
  if (c.readAt == null || c.readAt <= e.seenAt) return null;
  if (c.status === 'in_progress') return null;
  return c.status === 'failed' ? 'It failed: the collateral went to the issuer.' : c.status === 'finished' || c.status === 'finished_contractor' ? 'Delivered.' : 'It’s no longer in progress.';
}

/** An industry job that has finished and waits to be delivered: marked ready, or active past its end. */
export const jobWaiting = (j: { status: string; end: string }, now: number) => j.status === 'ready' || (j.status === 'active' && Date.parse(j.end) <= now);

/** A squeeze that has gone. Selling out or closing shows at once; the spread needs a newer read. */
export function judgeSqueeze(e: Entry, c: { open: boolean; stock: number; signalAt: number | null }): string | null {
  if (!c.open) return 'The position is closed.';
  if (c.stock <= 0) return 'The stock has sold.';
  if (c.signalAt == null || c.signalAt <= e.seenAt) return null;
  return 'The spread has widened again.';
}

/**
 * A suspicious-market flag that has gone. On an item that is no longer a position, a bid or on the watchlist
 * it just goes, unticked: there was nothing to do about it, and the item may be one you still sell.
 */
export function judgeScam(e: Entry, c: { tracked: boolean; signalAt: number | null }): string | null | false {
  if (!c.tracked) return false;
  if (c.signalAt == null || c.signalAt <= e.seenAt) return null;
  const flag = e.item.key.split(':').pop();
  return flag === 'wall' ? 'The wall has gone.' : flag === 'escrow' ? 'The bait bid has gone.' : 'The odd day has dropped out of the recent history.';
}

/**
 * A started plan's item still to place ("Place a buy order", for the plan's week): one item each, keyed by plan and item,
 * opening it in game with the bid copied. Null for an item placed or that the plan no longer places (`planItemState`): a
 * bid you cancelled with nothing bought, or its position closed or deleted. Asking again for those is what the user found
 * wrong (8 October 2026): four bids told "Cancel it" were cancelled and their positions closed, and To do asked for each
 * again at the price just judged unreachable.
 */
export function placeBuyItem(p: Pick<TradePlan, 'id' | 'name'>, i: PlanItem, state: PlanItemState, name: string): TodoItem | null {
  if (state.state !== 'open') return null;
  return {
    key: `plan:${p.id}:${i.typeId}`, ver: '1', kind: 'placeBuy', source: 'ledger', stake: i.units * i.buyAt, typeId: i.typeId,
    title: `Place a buy order: ${units(i.units)} × ${name} at ${isk(i.buyAt)}`,
    detail: `Part of ${p.name}. Open it in game (the price is copied), press Place Buy Order, paste the price, quantity ${units(i.units)}.`,
    action: { label: 'Open', typeId: i.typeId, copy: i.buyAt, route: 'planner' },
  };
}

/**
 * A plan's buy order, gone from the list: placed, when your orders (always current as of the last sync) hold a buy for
 * the item since the plan started, or your trades show the bid bought at once (`planPlacement`); done, saying why, when
 * the plan no longer places it (`dropped`: you cancelled the bid with nothing bought, or closed or deleted its position);
 * just gone when the plan was removed or is past its week. The ledger is always current, so each of these is said at once.
 */
export function judgePlaceBuy(e: Entry, c: {
  plan: boolean; placed: { units: number; price: number; atOnce?: number } | null;
  dropped?: Extract<PlanItemState, { state: 'closed' | 'cancelled' }> | null;
}): string | null | false {
  if (c.placed) {
    const n = c.placed.units.toLocaleString('en-US'), at = c.placed.price.toLocaleString('en-US', { maximumFractionDigits: 2 });
    // A bid that filled from listings when placed shows no order until your order history does, within the hour.
    const once = c.placed.atOnce ?? 0;
    return once >= c.placed.units ? `Bought at once: ${n} at ${at}.`
      : `Placed: ${n} at ${at}${once > 0 ? `, ${once.toLocaleString('en-US')} of them bought at once` : ''}.`;
  }
  const d = c.dropped;
  if (d) {
    return d.state === 'cancelled' ? 'You cancelled the bid, so the plan doesn’t place it again.'
      : d.gone ? 'You deleted its position, so the plan doesn’t place it.' : 'You closed its position, so the plan doesn’t place it.';
  }
  return c.plan ? null : false;
}

/**
 * A plan item whose buy filled and isn't listed yet ("List what the plan bought", the list step; `planListRows` in
 * positions.ts, `planListPrice` in plans.ts): one item per plan item, keyed by plan and item. A Place-and-leave plan's is
 * versioned by its price to list at, the plan's own, so a repriced suggestion reopens a hand tick and a fill doesn't. An
 * at-the-front plan's price is today's listing price, which moves with the front up to every five minutes, so its version
 * is the units to list instead: priced, a hand tick reopened at every undercut (the review, 2 October 2026). Opening it
 * copies the price of the build it's in, so the copy is always the latest either way. With no book there's no price and
 * nothing copied; while the book is first read, it says so. Never mailed.
 */
export function planListItem(
  x: { planId: string; planName: string; patient: boolean; typeId: number; units: number; unitCost: number; reading?: boolean },
  p: PlanListPrice, name: string,
): TodoItem {
  const said = planListSaid(p, x.patient);
  const n = units(x.units);
  const parts = [
    `Bought for ${x.planName}.`,
    // Lifted to break-even, the floor's own sentence says where the price comes from.
    p.from === 'breakEven' ? said.floor : x.reading && p.price == null ? 'Reading its Jita book for today’s listing price.' : `${said.from}.`,
    said.profit ? `Makes ${said.profit}.` : null,
    x.reading ? 'Reading today’s Jita market.' : `${said.other}.`,
    x.reading ? null : said.moved,
    p.price != null ? `Open it in game (the price is copied), Sell, paste the price, quantity ${n}.` : null,
  ];
  return {
    key: `planList:${x.planId}:${x.typeId}`, ver: x.patient ? String(p.price) : `units:${x.units}`, kind: 'planList', source: 'ledger',
    stake: x.units * x.unitCost, typeId: x.typeId,
    title: p.price != null ? `List ${n} × ${name} at ${isk(p.price)}` : `List ${n} × ${name}`,
    detail: parts.filter(Boolean).join(' '),
    action: { label: 'Open', typeId: x.typeId, ...(p.price != null ? { copy: p.price } : {}), route: 'planner' },
  };
}

/**
 * A plan item to list, gone from the list. Absent is not done: it ticks off only when the ledger that dropped it, newer by
 * construction than the one that listed it, shows the stock listed (a sell order since the position opened covering it, or a
 * listing that has filled and whose trade hasn't come) or sold; or when a hangar read newer than the one that showed it
 * (`hangarAt` against the entry's `seenAt`, which To do sets to the hangar read the item was built on) holds none of it:
 * moved, used or fitted, it would never show as listed or sold, and stayed "being checked" (the review, 2 October 2026).
 * Gone when the plan no longer holds the item (removed, its position closed, a newer plan holding it): `holds` false.
 * Otherwise, the read that showed it reading none with nothing listed or sold yet, it's still being checked.
 */
export function judgePlanList(
  e: Entry,
  c: { holds: boolean; row: { stock: number; units: number; listed: Listed; hangar: number | null; view: { whole: { stock: number } } } | null; hangarAt?: number | null },
): string | null | false {
  if (!c.holds || !c.row) return false;
  const { stock, units: left, listed, view, hangar } = c.row;
  if (left > 0) return null;
  if (stock <= 0) return 'Sold: the plan holds none of what it bought.';
  if (view.whole.stock - listed.units <= 0) {
    return listed.open > 0 ? `Listed: ${units(stock)} at ${isk(listed.price)}.` : `Listed at ${isk(listed.price)} and sold: the sale shows in your trades within the hour.`;
  }
  if (hangar != null && hangar <= 0 && c.hangarAt != null && c.hangarAt > e.seenAt) return `No longer in your Jita hangar (read ${fmtDateTime(c.hangarAt)}): moved, used or listed since.`;
  return null;
}

/**
 * A cloud login EVE refused, gone from the list: done once a read of the cloud newer than the one that showed it finds
 * the login working (absent is not done). If the login was dropped instead, there's nothing left to hand over.
 */
export function judgeCloudLogin(e: Entry, c: { readAt: number | null; kept: boolean; refused: boolean }): string | null | false {
  if (c.readAt == null || c.readAt <= e.seenAt) return null;
  if (!c.kept) return false;
  return c.refused ? null : 'The cloud has your login again.';
}

/**
 * An alt's cloud login that was refused or missing, gone from the list: done only on a roster read of this session,
 * newer than the one that showed it (absent is not done: a roster from disk, or the same read, says nothing). Then the
 * alt no longer on the roster ("No longer one of your characters") or its login working again.
 */
export function judgeAltLogin(e: Entry, c: { live: boolean; readAt: number | null; state: 'working' | 'refused' | 'none' | null }): string | null {
  if (!c.live || c.readAt == null || c.readAt <= e.seenAt) return null;
  if (c.state == null) return 'No longer one of your characters.';
  return c.state === 'working' ? 'The cloud has this login again.' : null;
}

/**
 * An R&D agent whose datacores waiting are worth more than your amount (the Research tab's cash-in reminder, the user's
 * choice of 3 October 2026; `prefs.researchCashIn`): one item per character and agent, keyed by both. Versioned by the
 * whole datacores waiting, and a hand tick holds until another datacore comes in (HOLDS_UNTIL_CHANGED, not the session's
 * 12 hours). Built only once the field's bid is read and the worth is known (the card's own, `agentCard`: Jita's bids
 * after tax and the fee, what they don't take listed); null otherwise, or with the setting off. Not mailed.
 */
export function cashInItem(
  x: { char: { id: number; name: string; isMain: boolean }; agentId: number; agent: string; system: string | null; field: string; datacores: number | null; worth: number | null; bidRead: boolean },
  setting: { on: boolean; isk: number | null } | undefined,
  action: TodoItem['action'],
): TodoItem | null {
  const amount = setting?.on ? setting.isk : null;
  if (amount == null || !(amount > 0) || !x.bidRead || x.worth == null || x.datacores == null || !(x.worth > amount)) return null;
  const n = x.datacores;
  const whose = x.char.isMain ? 'Your' : `${x.char.name}’s`;
  return {
    key: `cashIn:${x.char.id}:${x.agentId}`, ver: String(n), kind: 'cashIn', source: 'research', stake: x.worth, amount,
    // An alt's is named first, so two characters' items at one agent read apart.
    title: `${x.char.isMain ? '' : `${x.char.name} · `}Cash in at ${x.agent}${x.system ? `, ${x.system}` : ''}: ${units(n)} datacore${n === 1 ? '' : 's'}, worth ${iskBig(Math.round(x.worth))}`,
    detail: `${whose} ${x.field} research, worth more than your ${iskBig(amount)} at Jita’s prices now. ${x.char.isMain ? 'Buy them' : `${x.char.name} buys them`} from the agent in person, docked in its station (Buy Datacores, ${RP_PER_DATACORE} RP and ${isk(DATACORE_FEE)} each); the points don’t expire.`,
    action,
  };
}

/**
 * A cash-in item gone from the list. Never done on absence (an agent missing only because the agents, a book or a roster
 * aren't read yet is still being checked): bought or stopped only on a research read newer than the one that listed it
 * (`readAt`: the main's sync, an alt's sheet job's last success), and an alt's only on a roster read of this session
 * (`live`, as judgeAltLogin). Fewer whole datacores than when listed: bought, most likely (said so: cancelling and
 * starting again with the same agent between reads looks the same). The agent gone from the read: stopped. The
 * setting switched off, or raised past the amount it was listed against: unticked at once (your own act, no read to wait
 * for). As many datacores or more, worth no more than the amount: the price fell, unticked, never bought. An alt no longer
 * on a live roster: gone.
 * `agent` is the agent as the character's research reads now: undefined while it isn't read, null when the read doesn't
 * list it; its worth null while unpriced.
 */
export function judgeCashIn(e: Entry, c: {
  setting: { on: boolean; isk: number | null } | undefined; isMain: boolean; live: boolean; readAt: number | null; gone: boolean;
  agent: { datacores: number | null; worth: number | null } | null | undefined;
}): string | null | false {
  const amount = c.setting?.on ? c.setting.isk : null;
  if (amount == null || !(amount > 0) || (e.item.amount != null && amount > e.item.amount)) return false;
  if (!c.isMain && !c.live) return null;
  if (!c.isMain && c.gone) return false;
  const listed = Number(e.item.ver);
  const fresh = c.readAt != null && c.readAt > e.seenAt;
  if (fresh && c.agent === null) return 'Research stopped: the latest read no longer lists this agent.';
  const n = c.agent?.datacores ?? null;
  // An inference: cancelling and starting again with the same agent within ESI's hour reads the same (research.md).
  if (fresh && n != null && n < listed) return `Fewer datacores waiting (${units(listed - n)} fewer): bought, most likely.`;
  if (n != null && n >= listed && c.agent?.worth != null && c.agent.worth <= amount) return false;
  return null;
}

/** Items built from your own ledger, which is always current: gone means dealt with. */
export function judgeLedger(e: Entry, c: { position?: { status: string } | null; inCloud?: boolean }): string {
  switch (e.item.kind) {
    case 'close': return !c.position ? 'The position was removed.' : c.position.status !== 'open' ? 'You closed it.' : 'It isn’t finished after all: stock or an open order came back.';
    case 'nearMiss': return 'Dealt with: counted in or set aside.';
    case 'backup': return c.inCloud ? 'Your ledger is kept in the cloud now.' : 'You exported a backup.';
    default: return 'It no longer needs doing.';
  }
}
