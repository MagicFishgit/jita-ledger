import { fmtDateTime, isk } from './format';
import type { Verdict } from './relist';

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

export type TodoKind = 'move' | 'cancel' | 'bid' | 'underCost' | 'close' | 'squeeze' | 'piExpired' | 'piEnding' | 'nearMiss' | 'scam' | 'backup' | 'industry' | 'courier' | 'cloudLogin' | 'placeBuy';

/** Which read a finding came from, and so which read can say it has gone. */
export type Source = 'orders' | 'colonies' | 'signals' | 'ledger' | 'industry' | 'contracts' | 'cloud' | 'roster';

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
  /** The item whose signal it came from. */
  typeId?: number;
  /** Where the action button goes. */
  /** `copy`: a price opening it in game puts on the clipboard, ready for the price box. */
  /** `cloudLogin`: which of the cloud's logins to hand over again. */
  action: { label: string; route?: string; typeId?: number; exportBackup?: boolean; copy?: number; cloudLogin?: 'main' | 'mailer' };
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
 * What an item wants from you: something to do, in game or here, or a warning to know about. The user asked to sift
 * the list for what needs acting on and look at the rest when they want (29 September 2026).
 */
export type TodoFilter = 'all' | 'act' | 'info';
export const needs = (k: TodoKind): 'act' | 'info' => (WARNINGS.has(k) ? 'info' : 'act');
export const inFilter = (k: TodoKind, f: TodoFilter): boolean => f === 'all' || needs(k) === f;

/**
 * Ticks every one of `keys` still open by hand, as its box would: a chore for 12 hours, a warning until it changes.
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
  move: 1, cancel: 1, bid: 2, underCost: 1, close: 1, squeeze: 2, piExpired: 5, piEnding: 4, nearMiss: 1, scam: 0, backup: 1, industry: 1, courier: 10, cloudLogin: 1, placeBuy: 1,
};

export const KIND_LABEL: Record<TodoKind, string> = {
  move: 'Move order', cancel: 'Cancel order', bid: 'Sell into bids', underCost: 'Priced under cost', close: 'Close position', squeeze: 'Margin squeeze', piExpired: 'PI expired',
  piEnding: 'PI ending', nearMiss: 'Trades your positions skipped', scam: 'Suspicious market', backup: 'Backup', industry: 'Industry jobs to deliver', courier: 'Courier to deliver',
  cloudLogin: 'Cloud login', placeBuy: 'Place buy order',
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
    const ticked = same && e.ticked && (WARNINGS.has(x.kind) || now - e.ticked.at < SESSION_MS) ? e.ticked : undefined;
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
 * A plan's buy order, gone from the list: placed, when your orders (always current as of the last sync) hold a buy for
 * the item since the plan started; just gone when the plan was removed or is past its week.
 */
export function judgePlaceBuy(e: Entry, c: { plan: boolean; placed: { units: number; price: number } | null }): string | null | false {
  if (c.placed) return `Placed: ${c.placed.units.toLocaleString('en-US')} at ${c.placed.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}.`;
  return c.plan ? null : false;
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

/** Items built from your own ledger, which is always current: gone means dealt with. */
export function judgeLedger(e: Entry, c: { position?: { status: string } | null; inCloud?: boolean }): string {
  switch (e.item.kind) {
    case 'close': return !c.position ? 'The position was removed.' : c.position.status !== 'open' ? 'You closed it.' : 'It isn’t finished after all: stock or an open order came back.';
    case 'nearMiss': return 'Dealt with: counted in or set aside.';
    case 'backup': return c.inCloud ? 'Your ledger is kept in the cloud now.' : 'You exported a backup.';
    default: return 'It no longer needs doing.';
  }
}
