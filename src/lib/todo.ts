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

export type TodoKind = 'move' | 'cancel' | 'close' | 'squeeze' | 'piExpired' | 'piEnding' | 'nearMiss' | 'scam' | 'backup';

/** Which read a finding came from, and so which read can say it has gone. */
export type Source = 'orders' | 'colonies' | 'signals' | 'ledger';

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
  action: { label: string; route?: string; typeId?: number; exportBackup?: boolean };
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
 * Roughly how long each kind of task takes at the keyboard, for the total at the top. These are not
 * measured --- they are there so a list of twelve relists reads as a quarter of an hour, not an evening.
 */
export const MINUTES: Record<TodoKind, number> = {
  move: 1, cancel: 1, close: 1, squeeze: 2, piExpired: 5, piEnding: 4, nearMiss: 1, scam: 0, backup: 1,
};

export const KIND_LABEL: Record<TodoKind, string> = {
  move: 'Move order', cancel: 'Cancel order', close: 'Close position', squeeze: 'Margin squeeze', piExpired: 'PI expired',
  piEnding: 'PI ending', nearMiss: 'Trades your positions skipped', scam: 'Suspicious market', backup: 'Backup',
};

/**
 * What the current data says about a remembered item the latest build no longer produced: a sentence
 * saying what changed, or null when it can't tell yet (the read it came from hasn't been redone).
 */
export type Judge = (e: Entry) => string | null;

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
  c: { open: boolean; checkedAt: number | null; bookRead: boolean; v?: { gone: boolean; verdict: Verdict; price: number; why: string } },
): string | null {
  if (!c.open) return 'The order has closed: it filled, expired or was cancelled.';
  // Only a check newer than the one that showed it. A second tab holding an older check must not judge
  // an item the first tab saw since.
  if (c.checkedAt == null || c.checkedAt <= e.seenAt || !c.bookRead || !c.v) return null;
  const v = c.v;
  if (v.gone) return 'It’s no longer in the market: it filled, expired or was cancelled.';
  if (v.verdict === 'move' || v.verdict === 'dry') return null;
  const moved = e.item.price != null && v.price !== e.item.price;
  if (v.verdict === 'front') return moved ? `You moved it to ${isk(v.price)}, and it’s at the front.` : 'It’s at the front now: the orders ahead of it have gone.';
  if (moved) return `You moved it to ${isk(v.price)}. ${v.why}.`;
  return v.verdict === 'wait' ? `Not worth moving now: ${lower(v.why)}.` : `Moving it no longer pays: ${lower(v.why)}.`;
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

/** A squeeze that has gone. Selling out or closing shows at once; the spread needs a newer read. */
export function judgeSqueeze(e: Entry, c: { open: boolean; stock: number; signalAt: number | null }): string | null {
  if (!c.open) return 'The position is closed.';
  if (c.stock <= 0) return 'The stock has sold.';
  if (c.signalAt == null || c.signalAt <= e.seenAt) return null;
  return 'The spread has widened again.';
}

/** A suspicious-market flag that has gone. */
export function judgeScam(e: Entry, c: { tracked: boolean; signalAt: number | null }): string | null {
  if (!c.tracked) return 'You no longer hold, trade or watch it.';
  if (c.signalAt == null || c.signalAt <= e.seenAt) return null;
  const flag = e.item.key.split(':').pop();
  return flag === 'wall' ? 'The wall has gone.' : flag === 'escrow' ? 'The bait bid has gone.' : 'The odd day has dropped out of the recent history.';
}

/** Items built from your own ledger, which is always current: gone means dealt with. */
export function judgeLedger(e: Entry, c: { position?: { status: string } | null }): string {
  switch (e.item.kind) {
    case 'close': return !c.position ? 'The position was removed.' : c.position.status !== 'open' ? 'You closed it.' : 'It isn’t finished after all: stock or an open order came back.';
    case 'nearMiss': return 'Dealt with: counted in or set aside.';
    case 'backup': return 'You exported a backup.';
    default: return 'It no longer needs doing.';
  }
}
