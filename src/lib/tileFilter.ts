import { units } from './format';

/**
 * A count tile that stands for rows of the table below it filters that table when pressed, and pressing it again clears
 * the filter. The user (2 October 2026), on Orders' tiles: "it would be even better if you could click on them and then
 * the table is filtered to only show them and of course when you click it again you clear the filter".
 *
 * One tile at a time per table, the page's own filters (a side, a search, a sort) still applying on top; nothing is kept
 * across reloads. A tile that sums money, or counts something its table doesn't list row by row, isn't one of these.
 */

/** What pressing tile `k` leaves on: pressing the one on lets go of it, and a tile counting nothing can't be pressed. */
export function pressTile<K>(on: K | null, k: K, count: number): K | null {
  if (on === k) return null;
  return count > 0 ? k : on;
}

/** Whether a tile can be pressed: it counts something, or it's the one on, so it can still be let go of once its rows went. */
export function canPress<K>(on: K | null, k: K, count: number): boolean {
  return count > 0 || on === k;
}

/** The rows the tile that's on keeps, in their order; all of them when none is. */
export function tileRows<T, K>(rows: T[], on: K | null, match: (row: T, k: K) => boolean): T[] {
  return on == null ? rows : rows.filter((r) => match(r, on));
}

/** What the table says while a tile filters it: "Showing 3 of 69: Move it". */
export function showingSaid(shown: number, of: number, what: string): string {
  return `Showing ${units(shown)} of ${units(of)}: ${what}`;
}
