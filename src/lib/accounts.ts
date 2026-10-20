import { jobOk, type AltSaved, type CloneState, type RosterEntry } from './roster';

/**
 * Which EVE account each of your characters is on (docs/notes/characters.md): the one thing about them set by hand, once per
 * character, since ESI has no notion of an account. The user (19 October 2026): "on the characters page I need to be able to
 * group them. This might be important for PI", and "imagine trying to make sense of 20 characters in the future and knowing
 * which account each belongs to when i switch to them". Omega and Alpha belong to an account, so each account's clone state is
 * worked out from what its characters' skills show, never set by hand.
 *
 * A synced document of its own (`accounts`), not a field of `prefs` or `chars`: their sanitizers keep only the fields they know,
 * so an app version behind would drop it on its next save. Pure: no config, store, React or DOM (check.mjs loads it).
 */

/** An account: an ID, and a name only when one was typed (else its default name, `accountName`). */
export type Account = { id: string; name?: string };
/** The accounts in the order they were made, and each character's account by character ID, the main's included. */
export type AccountsDoc = { accounts: Account[]; byChar: Record<string, string> };

export const emptyAccounts = (): AccountsDoc => ({ accounts: [], byChar: {} });
/** EVE's limit: an account holds up to three characters (eve-facts.md). */
export const ACCOUNT_HOLDS = 3;
/** Where a character with no account is listed in a picker. */
export const NOT_SET = 'Account not set';
const MAX_ACCOUNTS = 60;
const NAME_MAX = 40;

export function sanitizeAccounts(v: unknown): AccountsDoc {
  const out = emptyAccounts();
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const x = v as { accounts?: unknown; byChar?: unknown };
  const ids = new Set<string>();
  for (const a of Array.isArray(x.accounts) ? x.accounts : []) {
    const id = (a as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || !/^[a-z0-9]{1,16}$/i.test(id) || ids.has(id) || ids.size >= MAX_ACCOUNTS) continue;
    ids.add(id);
    const name = (a as { name?: unknown }).name;
    const typed = typeof name === 'string' ? name.trim().slice(0, NAME_MAX) : '';
    out.accounts.push(typed ? { id, name: typed } : { id });
  }
  if (x.byChar && typeof x.byChar === 'object' && !Array.isArray(x.byChar)) {
    for (const [c, id] of Object.entries(x.byChar as Record<string, unknown>)) {
      if (/^\d{1,15}$/.test(c) && typeof id === 'string' && ids.has(id)) out.byChar[c] = id;
    }
  }
  return out;
}

/** The account a character is on, or null when none is set. */
export function accountOf(doc: AccountsDoc, charId: number): Account | null {
  const id = doc.byChar[String(charId)];
  return id ? doc.accounts.find((a) => a.id === id) ?? null : null;
}

/**
 * An account's name: the one typed, else "Main account" for the main's, else "Account 2", "Account 3"… in the order the
 * accounts were made, the main's left out of the count (so the first other account is "Account 2" whichever was made first).
 */
export function accountName(doc: AccountsDoc, id: string, mainId: number): string {
  const a = doc.accounts.find((x) => x.id === id);
  if (a?.name) return a.name;
  const mainAcct = doc.byChar[String(mainId)];
  if (id === mainAcct) return 'Main account';
  const n = doc.accounts.filter((x) => x.id !== mainAcct).findIndex((x) => x.id === id);
  return `Account ${n < 0 ? doc.accounts.length + 1 : n + 2}`;
}

/** The accounts as listed everywhere: the main's first, then the rest in the order they were made. */
export function accountsInOrder(doc: AccountsDoc, mainId: number): Account[] {
  const mainAcct = doc.byChar[String(mainId)];
  return [...doc.accounts.filter((a) => a.id === mainAcct), ...doc.accounts.filter((a) => a.id !== mainAcct)];
}

/**
 * The characters on an account, of those `present` (the main and the roster): what "2 of 3" and the limit count. A character
 * taken off the roster keeps its account in the document, so adding it again puts it back, but it isn't counted meanwhile: it
 * has no card to move, and counting it would show a full account with two cards on it.
 */
export function membersOf(doc: AccountsDoc, id: string, present: number[]): number[] {
  return present.filter((c) => doc.byChar[String(c)] === id);
}

/** A new account's ID: one more than the highest number in use, so IDs are never reused within a document. */
export function nextAccountId(doc: AccountsDoc): string {
  const n = Math.max(0, ...doc.accounts.map((a) => Number(/^a(\d+)$/.exec(a.id)?.[1] ?? 0)));
  return `a${n + 1}`;
}

/**
 * Puts a character on an account (`'new'`: a new one, made for it). Refused, saying why, when the account already holds three of
 * the characters present (EVE's limit), or is no longer in the document. Moving a character leaves its old account in place,
 * empty or not, so no other account's default name moves under it; an empty one can be removed.
 */
export function assignAccount(doc: AccountsDoc, charId: number, target: string, mainId: number, present: number[]): { doc: AccountsDoc } | { refused: string } {
  const key = String(charId);
  if (target === 'new') {
    const id = nextAccountId(doc);
    return { doc: { accounts: [...doc.accounts, { id }], byChar: { ...doc.byChar, [key]: id } } };
  }
  if (!doc.accounts.some((a) => a.id === target)) return { refused: 'That account is no longer on your list.' };
  if (doc.byChar[key] === target) return { doc };
  const on = membersOf(doc, target, present).filter((c) => c !== charId);
  if (on.length >= ACCOUNT_HOLDS) {
    return { refused: `${accountName(doc, target, mainId)} already holds ${ACCOUNT_HOLDS} characters, the most an EVE account can. Move one of them to another account first.` };
  }
  return { doc: { accounts: doc.accounts, byChar: { ...doc.byChar, [key]: target } } };
}

/** An account's name typed (blank: back to its default name). */
export function renameAccount(doc: AccountsDoc, id: string, name: string): AccountsDoc {
  const typed = name.trim().slice(0, NAME_MAX);
  return { ...doc, accounts: doc.accounts.map((a) => (a.id !== id ? a : typed ? { id, name: typed } : { id })) };
}

/** An account removed, only while none of the characters present is on it; a character off the roster that was goes with it. */
export function removeAccount(doc: AccountsDoc, id: string, present: number[]): AccountsDoc | null {
  if (membersOf(doc, id, present).length) return null;
  return { accounts: doc.accounts.filter((a) => a.id !== id), byChar: Object.fromEntries(Object.entries(doc.byChar).filter(([, a]) => a !== id)) };
}

// --- Pickers: characters listed under their account ------------------------------------------------------------------

/** A character's account as a picker shows it: its ID, its name, and where it sits in the list (the main's first). */
export type AccountRef = { id: string; name: string; order: number };

export function accountRef(doc: AccountsDoc, charId: number, mainId: number): AccountRef | null {
  const id = doc.byChar[String(charId)];
  if (!id) return null;
  const order = accountsInOrder(doc, mainId).findIndex((a) => a.id === id);
  return order < 0 ? null : { id, name: accountName(doc, id, mainId), order };
}

/**
 * Characters in a picker's order: each account's together, the main's account first, then the others in the order they were made,
 * then those whose account isn't set; within each, the order they came in (the main first, then the roster's). With no account set
 * on any, the order is as it came. `group`: what the picker heads each run with (ui.tsx's Seg labels runs only when there are two
 * or more, so a ledger with no accounts looks as it always did).
 */
export function byAccount<T extends { account: AccountRef | null }>(chars: T[]): (T & { group: string })[] {
  const at = (c: T) => c.account?.order ?? Number.MAX_SAFE_INTEGER;
  return chars.map((c, i) => ({ c, i })).sort((a, b) => at(a.c) - at(b.c) || a.i - b.i)
    .map(({ c }) => ({ ...c, group: c.account?.name ?? NOT_SET }));
}

/**
 * How many accounts a set of characters is on, from each one's account ID (null: not set): the accounts set, and those not set,
 * each counted as one of its own (`k`, the months of Omega they pay for). Planets' repeat line sets a month of the setup against
 * `k` months of Omega.
 */
export function accountCount(ids: (string | null | undefined)[]): { accounts: number; unset: number; k: number } {
  const set = new Set(ids.filter((x): x is string => !!x));
  const unset = ids.filter((x) => !x).length;
  return { accounts: set.size, unset, k: set.size + unset };
}

/** "their account", "their 2 accounts", "their 2 accounts, 1 character’s account not set". */
export function accountCountSaid(n: { accounts: number; unset: number; k: number }): string {
  const base = n.k === 1 ? 'their account' : `their ${n.k} accounts`;
  return n.unset ? `${base}, ${n.unset} character${n.unset === 1 ? '’s account' : 's’ accounts'} not set` : base;
}

// --- Clone state: an account's, from its characters' skills ----------------------------------------------------------

/**
 * One character's own reading of its clone state: what its skills showed (`detected`, absent when they can't tell), when that
 * read was (null: not known, taken as the oldest), and a state set by hand earlier for it, if any.
 */
export type CloneMember = { charId: number; detected?: 'alpha' | 'omega' | null; at: number | null; byHand?: 'alpha' | 'omega' };

/**
 * An account's clone state: Omega when a character on it reads Omega, Alpha when one reads Alpha; when they disagree, the newest
 * reading's (`conflict`, said: one of the readings is out of date, or a character is on the wrong account); otherwise not known.
 * `by`: the character whose reading decided it.
 */
export type AccountClone = { state: CloneState; conflict: boolean; by: number | null; at: number | null; readings: { charId: number; state: 'alpha' | 'omega'; at: number | null }[] };

/**
 * A character's clone state and where it came from: its own skills (`skills`), else its account's (`account`), else a state set
 * by hand earlier (`hand`), else not known (null). A character's own reading always wins for itself.
 */
export type CharClone = { clone: CloneState; from: 'skills' | 'account' | 'hand' | null; account: AccountClone | null };

export function accountClone(doc: AccountsDoc, id: string, members: CloneMember[]): AccountClone {
  const readings = members.filter((m) => doc.byChar[String(m.charId)] === id && (m.detected === 'alpha' || m.detected === 'omega'))
    .map((m) => ({ charId: m.charId, state: m.detected as 'alpha' | 'omega', at: m.at }));
  if (!readings.length) return { state: 'unknown', conflict: false, by: null, at: null, readings };
  const newest = [...readings].sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.charId - b.charId)[0];
  return { state: newest.state, conflict: readings.some((r) => r.state !== newest.state), by: newest.charId, at: newest.at, readings };
}

/** Every character's clone state, and every account's, from the members' own readings. */
export function accountClones(doc: AccountsDoc, members: CloneMember[]): { chars: Map<number, CharClone>; accounts: Map<string, AccountClone> } {
  const accounts = new Map<string, AccountClone>();
  for (const a of doc.accounts) accounts.set(a.id, accountClone(doc, a.id, members));
  const chars = new Map<number, CharClone>();
  for (const m of members) {
    const id = doc.byChar[String(m.charId)];
    const acct = id ? accounts.get(id) ?? null : null;
    const own = m.detected === 'alpha' || m.detected === 'omega' ? m.detected : null;
    chars.set(m.charId, own ? { clone: own, from: 'skills', account: acct }
      : acct && acct.state !== 'unknown' ? { clone: acct.state, from: 'account', account: acct }
        : m.byHand ? { clone: m.byHand, from: 'hand', account: acct }
          : { clone: 'unknown', from: null, account: acct });
  }
  return { chars, accounts };
}

/**
 * The members for `accountClones`: the main from its own meta (`cloneDetected`, read on its last sync) and each alt on the roster
 * from its pulled copy (`cloneDetected`, read by the cloud's hourly sheet, at that job's last success). `mainByHand`: the main's
 * state set by hand, if any (the caller's: Settings' Omega, since Alpha is the setting's default and says nothing); an alt's from
 * `chars`, set on the Characters page before its buttons went.
 */
export function cloneMembers(
  main: { charId: number; meta: { cloneDetected?: 'alpha' | 'omega'; lastSync?: string }; byHand?: 'alpha' | 'omega' },
  roster: RosterEntry[], alts: Record<number, AltSaved>, chars: Record<string, { clone?: 'alpha' | 'omega' }>,
): CloneMember[] {
  const t = main.meta.lastSync ? Date.parse(main.meta.lastSync) : NaN;
  return [
    { charId: main.charId, detected: main.meta.cloneDetected ?? null, at: Number.isFinite(t) ? t : null, byHand: main.byHand },
    ...roster.map((e) => ({
      charId: e.charId,
      detected: (alts[e.charId]?.docs.meta as { cloneDetected?: 'alpha' | 'omega' } | undefined)?.cloneDetected ?? null,
      at: jobOk(e, 'sheet'), byHand: chars[String(e.charId)]?.clone,
    })),
  ];
}

/**
 * The clone state an alt's ledger is built at (altLedger's fallback, behind what its own skills show): its account's, or one set
 * by hand earlier. Undefined when neither is known, as before.
 */
export const fallbackClone = (c: CharClone | undefined): 'alpha' | 'omega' | undefined => (c && c.clone !== 'unknown' ? c.clone : undefined);
