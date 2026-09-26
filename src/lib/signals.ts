/**
 * Things worth noticing about a position that its own figures do not show.
 *
 * Pure: takes data, returns findings. The pages decide how loudly to say them.
 */

import { matchTx } from './positions';
import type { Position, Tx } from './types';

const DAY = 86400_000;

/** How far before a position's start a purchase can still plausibly be stock for it. */
export const NEAR_MISS_DAYS = 30;

export type NearMiss = { tx: Tx; why: 'before' | 'elsewhere' };

/**
 * Trades of a position's item that it skipped, and probably should not have.
 *
 * A buy a few days before you started the position is usually the first of its stock; a trade in
 * another station is skipped on a Jita-only position by design, but you may want it counted. Trades
 * another position already counts, or that you have dealt with, are not raised again.
 */
export function nearMisses(pos: Position, txs: Tx[], all: Position[], done: Set<string>, jitaId: number): NearMiss[] {
  if (pos.status !== 'open') return [];
  const start = Date.parse(pos.openedAt);
  const out: NearMiss[] = [];
  for (const tx of txs) {
    if (tx.source !== 'esi' || tx.typeId !== pos.typeId || done.has(tx.id)) continue;
    if (matchTx(pos, tx)) continue;
    if (all.some((p) => p.id !== pos.id && (matchTx(p, tx) === 'auto' || matchTx(p, tx) === 'included'))) continue;
    const t = Date.parse(tx.date);
    if (t < start && start - t <= NEAR_MISS_DAYS * DAY) out.push({ tx, why: 'before' });
    else if (t >= start && pos.jitaOnly && tx.locationId !== jitaId && (!pos.closedAt || t <= Date.parse(pos.closedAt))) out.push({ tx, why: 'elsewhere' });
  }
  return out.sort((a, b) => Date.parse(b.tx.date) - Date.parse(a.tx.date));
}

/** The squeeze is raised when the week's margin sits within this much of break-even... */
export const SQUEEZE_NEAR = 1.35;
/** ...and has fallen by at least this share across the week. Both, or it is just a thin item. */
export const SQUEEZE_FALL = 0.25;

/**
 * Whether a position's margin is closing on its break-even.
 *
 * The margin is each day's high-to-low range as a share of its average, from market history --- what a
 * trader working both sides of the book can capture. Break-even is the spread that pays the fees with
 * two price changes, since that is the usual case on a busy item.
 */
export function squeezed(range7: number[] | undefined, breakEvenSpread: number): boolean {
  if (!range7 || range7.length < 3 || !(breakEvenSpread > 0)) return false;
  const first = range7[0], last = range7[range7.length - 1];
  return last < breakEvenSpread * SQUEEZE_NEAR && last < first * (1 - SQUEEZE_FALL);
}
