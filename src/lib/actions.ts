import { getData, update } from './store';
import { rid } from './format';
import type { Position } from './types';

/** Opens a trading position for an item, or returns the one already open. */
export function startPosition(typeId: number, openedAt = new Date().toISOString(), jitaOnly = true): { id: string; existed: boolean } {
  const open = getData().positions.find((p) => p.typeId === typeId && p.status === 'open');
  if (open) return { id: open.id, existed: true };
  const pos: Position = { id: rid(), typeId, openedAt, status: 'open', jitaOnly, excluded: [], included: [] };
  update((d) => ({ positions: [pos, ...d.positions] }));
  return { id: pos.id, existed: false };
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
