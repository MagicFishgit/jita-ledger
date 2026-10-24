/**
 * What every character's colonies make a day together, for the Planets tab's Colonies section (docs/notes/planets-colonies.md,
 * Task 16): a character's colonies summed from their chains (colonyChain.ts), and All summed from the characters whose colonies
 * were read, said how many. Pure: no config, store, React or DOM (check.mjs loads it).
 *
 * Not known is never 0. A character whose colonies weren't read adds nothing and is counted out ("3 of 5 characters read"); one
 * whose kept document outlived its login (refused, or none held) is read: what the cloud last read stays, and counts. A colony
 * whose ISK a day isn't known (its inputs imported, nothing it ships priced, its prices still coming) leaves its character's sum,
 * and All's, "–" with how many and why, never a sum short by it (the Research tab's six-agents lesson, research.md). A colony that
 * makes nothing that leaves the planet is a known nothing (its `iskDay` 0): summed.
 */
import { accountCount } from './accounts';
import type { ColoniesDoc } from './colonies';
import type { Read } from './industryOwned';
import { periods, type Periods } from './iskPeriods';

/** Where a character's colonies stand: read (its kept document, and when the cloud last read it for an alt), or why they aren't. */
export type ColoniesRead = Read<ColoniesDoc>;

/**
 * Why a character's colonies aren't shown, as a sentence; null when read. The words of industryOwned's `readWhy`, but the main's
 * colonies aren't read by the sync: by Read my colonies here, To do, the alerts, or the cloud's hourly read.
 */
export function coloniesWhy(c: { isMain: boolean; name: string }, r: ColoniesRead): string | null {
  if (r.state === 'read') return null;
  if (r.state === 'unread') return c.isMain ? 'Not read yet: press Read my colonies, or the cloud keeps them with its hourly read.' : `Not read yet: ${c.name}’s colonies come with the cloud’s next hourly read.`;
  if (r.state === 'login') return 'Log in again: this login wasn’t given EVE’s permission to read your colonies.';
  if (r.state === 'handOver') return `Hand the cloud ${c.name}’s login again on the Characters page: it was handed over without the permission to read colonies.`;
  return r.why === 'refused' ? `Not read: EVE refused ${c.name}’s login; hand it over again on the Characters page.` : `Not read: the cloud holds no login for ${c.name}; hand one over on the Characters page.`;
}

/**
 * One colony's ISK a day as its chain gives it: null with `why` when it isn't known; `pending` while it's still being worked out
 * (its prices, its system's security for the customs tax); `beforeTax` when its customs tax isn't known (the figure is before it);
 * `unvalued` its outputs with no price, counted out of the figure.
 */
export type ColonyDay = { iskDay: number | null; why: string | null; pending?: boolean; beforeTax?: boolean; unvalued?: number };

/**
 * A character's colonies together. `day` is the sum as a day, a week and a month, null unless every colony's figure is known;
 * `unknown` the colonies whose figure isn't, with their reasons (`whys`, each once), `pending` those still being worked out.
 */
export type CharColoniesTotal = {
  read: boolean; colonies: number; day: Periods | null; unknown: number; whys: string[]; pending: number; beforeTax: number; unvalued: number;
};

export function charColoniesTotal(read: boolean, days: readonly ColonyDay[]): CharColoniesTotal {
  if (!read) return { read: false, colonies: 0, day: null, unknown: 0, whys: [], pending: 0, beforeTax: 0, unvalued: 0 };
  const pending = days.filter((d) => d.pending).length;
  const unknownDays = days.filter((d) => !d.pending && d.iskDay == null);
  const known = !pending && !unknownDays.length;
  return {
    read: true, colonies: days.length,
    day: known ? periods(days.reduce((t, d) => t + d.iskDay!, 0)) : null,
    unknown: unknownDays.length, whys: [...new Set(unknownDays.map((d) => d.why ?? 'its figure isn’t known'))], pending,
    beforeTax: days.filter((d) => d.beforeTax && d.iskDay != null).length,
    unvalued: days.reduce((t, d) => t + (d.iskDay != null ? d.unvalued ?? 0 : 0), 0),
  };
}

/**
 * All: the characters whose colonies were read, summed (`read` of `of`). `day` null unless at least one was read and every one read
 * has a figure. `accounts`:
 * the accounts of the characters it adds up that have a colony (Omega is an account's: `accountCount`, a character whose account
 * isn't set counting as one of its own), whose months of Omega the month is set against; a character read with no colony runs no
 * planetary industry for its account to be paid by.
 */
export type AllColoniesTotal = {
  read: number; of: number; colonies: number; day: Periods | null; unknown: number; whys: string[]; pending: number; beforeTax: number; unvalued: number;
  accounts: { accounts: number; unset: number; k: number };
};

export function allColoniesTotal(chars: readonly { account: string | null; total: CharColoniesTotal }[]): AllColoniesTotal {
  const read = chars.filter((c) => c.total.read);
  const sum = (f: (t: CharColoniesTotal) => number) => read.reduce((n, c) => n + f(c.total), 0);
  // Nothing read is nothing known, never a sum of 0.
  const known = read.length > 0 && read.every((c) => c.total.day != null);
  return {
    read: read.length, of: chars.length, colonies: sum((t) => t.colonies),
    day: known ? periods(read.reduce((n, c) => n + c.total.day!.day, 0)) : null,
    unknown: sum((t) => t.unknown), whys: [...new Set(read.flatMap((c) => c.total.whys))], pending: sum((t) => t.pending),
    beforeTax: sum((t) => t.beforeTax), unvalued: sum((t) => t.unvalued),
    accounts: accountCount(read.filter((c) => c.total.colonies > 0).map((c) => c.account)),
  };
}
