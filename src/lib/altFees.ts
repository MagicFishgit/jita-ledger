import { CALDARI_NAVY, CALDARI_STATE } from './constants';
import { rates, type Rates, type Settings } from './fees';

/**
 * A character's Jita 4-4 rates at its own read standings (docs/notes/industry.md). Jita 4-4's owners are Caldari State
 * and Caldari Navy, and the broker fee turns on the raw standing with each, floored at 0, exactly as the main's sync fills
 * `settings.faction` and `settings.corp` (sync.ts). An alt's copy (altLedger) carries standing 0 for both, so without this
 * an alt with standings was charged, on paper, a fee it doesn't pay. altLedger's zeros stay: the income an alt earned is
 * worked out on them (characters.md), and that's another change. Pure: no config or store.
 */
export type StandingLike = { id: number; type: string; standing: number };

/** Caldari State's and Caldari Navy's raw standings, each floored at 0; null when the standings weren't read. One missing is no standing: 0. */
export function jitaStandings(list: readonly StandingLike[] | null | undefined): { faction: number; corp: number } | null {
  if (!list) return null;
  const raw = (type: string, id: number) => list.find((r) => r.type === type && r.id === id)?.standing ?? 0;
  return { faction: Math.max(0, raw('faction', CALDARI_STATE)), corp: Math.max(0, raw('npc_corp', CALDARI_NAVY)) };
}

/** Rates at a character's read standings, or as its settings have them when none were read. */
export function ratesAtStandings(settings: Settings, list: readonly StandingLike[] | null | undefined): Rates {
  const s = jitaStandings(list);
  return rates(s ? { ...settings, ...s } : settings);
}
