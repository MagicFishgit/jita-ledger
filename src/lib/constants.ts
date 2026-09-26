// EVE facts that never depend on the build. Kept apart from ./config, which reads import.meta.env and so
// cannot be loaded by the Node test harness.

export const THE_FORGE = 10000002;
export const JITA_44 = 60003760;

export const SKILL_NAMES = {
  acc: 'Accounting', br: 'Broker Relations', abr: 'Advanced Broker Relations',
  trade: 'Trade', retail: 'Retail', wholesale: 'Wholesale', tycoon: 'Tycoon',
} as const;
export type SkillKey = keyof typeof SKILL_NAMES;

/**
 * Highest level an Alpha clone can use (EVE University wiki, Clone states, Feb 2026).
 * Accounting, Advanced Broker Relations, Retail, Wholesale and Tycoon are Omega only.
 * Skills trained above these stay trained but inactive while you're Alpha.
 */
export const ALPHA_CAPS: Record<SkillKey, number> = { acc: 0, br: 2, abr: 0, trade: 3, retail: 0, wholesale: 0, tycoon: 0 };

/** Caldari Navy: the loyalty store a Jita trader is most likely to have points with. */
export const CALDARI_NAVY = 1000035;

// PLEX trades on one market for the whole game, not in The Forge.
export const PLEX_TYPE = 44992;
export const GLOBAL_PLEX_MARKET = 19000001;
