/**
 * Tonight's run: everything worth doing right now, in one list, the most ISK at stake first.
 *
 * Built only from findings the rest of the app has already made from live data --- orders checked
 * against the book, positions, colonies, trades the positions skipped, suspicious markets, and the
 * age of your last backup. Nothing is added here that the other pages would not also say.
 */

export type TonightKind = 'move' | 'close' | 'squeeze' | 'piExpired' | 'piEnding' | 'nearMiss' | 'scam' | 'backup';

export type TonightItem = {
  id: string;
  kind: TonightKind;
  title: string;
  detail: string;
  /** ISK this decides, for ordering. Zero when it is about safety rather than money. */
  stake: number;
  /** Where the action button goes. */
  action: { label: string; route?: string; typeId?: number; exportBackup?: boolean };
};

/**
 * Roughly how long each kind of task takes at the keyboard, for the total at the top. These are not
 * measured --- they are there so a list of twelve relists reads as a quarter of an hour, not an evening.
 */
export const MINUTES: Record<TonightKind, number> = {
  move: 1, close: 1, squeeze: 2, piExpired: 5, piEnding: 4, nearMiss: 1, scam: 0, backup: 1,
};

export const KIND_LABEL: Record<TonightKind, string> = {
  move: 'Move order', close: 'Close position', squeeze: 'Margin squeeze', piExpired: 'PI expired',
  piEnding: 'PI ending', nearMiss: 'Trades your positions skipped', scam: 'Suspicious market', backup: 'Backup',
};

/** Most ISK first; ties keep the order they were found in. */
export function orderTonight(items: TonightItem[]): TonightItem[] {
  return items.map((x, i) => ({ x, i })).sort((a, b) => b.x.stake - a.x.stake || a.i - b.i).map((p) => p.x);
}

export function summarise(items: TonightItem[], done: Set<string>): { left: number; minutes: number; stake: number; frac: number } {
  const open = items.filter((x) => !done.has(x.id));
  return {
    left: open.length,
    minutes: open.reduce((t, x) => t + MINUTES[x.kind], 0),
    stake: open.reduce((t, x) => t + x.stake, 0),
    frac: items.length ? (items.length - open.length) / items.length : 1,
  };
}
