import { getData, update } from './store';
import { rid } from './format';
import { startAfter } from './positions';
import type { Position } from './types';

/**
 * Opens a trading position for an item, or returns the one already open. It never starts before the last one of
 * the item closed, or both would count those trades; `movedTo` says when it starts when that moved it.
 */
export function startPosition(typeId: number, openedAt = new Date().toISOString(), jitaOnly = true): { id: string; existed: boolean; movedTo?: string } {
  const all = getData().positions;
  const open = all.find((p) => p.typeId === typeId && p.status === 'open');
  if (open) return { id: open.id, existed: true };
  const at = startAfter(all, typeId, openedAt);
  const pos: Position = { id: rid(), typeId, openedAt: at, status: 'open', jitaOnly, excluded: [], included: [] };
  update((d) => ({ positions: [pos, ...d.positions] }));
  return { id: pos.id, existed: false, movedTo: at !== openedAt ? at : undefined };
}

export function patchPosition(id: string, patch: Partial<Position> | ((p: Position) => Partial<Position>)) {
  update((d) => ({
    positions: d.positions.map((p) => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p)),
  }));
}

export function addToWatchlist(typeId: number): boolean {
  if (getData().watchlist.some((w) => w.typeId === typeId)) return false;
  update((d) => ({ watchlist: [...d.watchlist, { typeId, addedAt: new Date().toISOString() }] }));
  return true;
}
