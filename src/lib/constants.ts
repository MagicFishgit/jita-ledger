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

/**
 * The characters this Jita Ledger belongs to. The site is public (GitHub Pages), so the app shows anyone else a
 * landing page and runs nothing, and the cloud refuses every other character's login: without this, any EVE player
 * who found the address could log in, read the Sniper's finds and the full-market scan, and run their own ledger on
 * the owner's Cloudflare account. Character IDs are public in EVE, so this needn't be secret.
 *
 * **Never add an alt here.** A character let in logs in to the app as a ledger of its own: the browser's one store
 * would take its trades in with the main's, and the first cloud sync would push the main's whole ledger under the
 * alt's ID. An alt is read by the cloud instead, with a login handed to it (worker/src/alts.ts), and the Worker
 * refuses a caller that is an alt.
 */
export const OWNER_CHARS: readonly number[] = [95210486];
export const isOwner = (characterId: number | null | undefined): boolean => characterId != null && OWNER_CHARS.includes(characterId);
