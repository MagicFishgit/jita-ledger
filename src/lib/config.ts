// Everything that ties the app to EVE lives here.

export const APP_NAME = 'Jita Ledger';

export const ESI_BASE = 'https://esi.evetech.net';
// ESI pins response formats to a compatibility date. See
// https://developers.eveonline.com/docs/services/esi/overview/ and bump this when you review the routes used.
export const ESI_COMPAT_DATE = '2026-08-18';

export const SSO_AUTHORIZE = 'https://login.eveonline.com/v2/oauth/authorize';
export const SSO_TOKEN = import.meta.env.VITE_TOKEN_PROXY || 'https://login.eveonline.com/v2/oauth/token';
export const SSO_REVOKE = 'https://login.eveonline.com/v2/oauth/revoke';

export const CLIENT_ID = import.meta.env.VITE_EVE_CLIENT_ID ?? '';
// The callback URL registered on developers.eveonline.com must match this exactly,
// e.g. https://magicfishgit.github.io/jita-ledger/
export const REDIRECT_URI = window.location.origin + import.meta.env.BASE_URL;

// Read-only scopes. The app never needs to change anything in the game.
export const SCOPES = [
  'esi-wallet.read_character_wallet.v1', // wallet transactions and journal (fees and tax)
  'esi-markets.read_character_orders.v1', // open orders and order history
  'esi-skills.read_skills.v1', // Accounting, Broker Relations, Advanced Broker Relations
  'esi-characters.read_standings.v1', // Caldari State and Caldari Navy standings
];

export const THE_FORGE = 10000002;
export const JITA_44 = 60003760;

// Resolved by name at sync time; these are fallbacks.
export const NPC_NAMES = { faction: 'Caldari State', corp: 'Caldari Navy' };
export const NPC_FALLBACK_IDS = { faction: 500001, corp: 1000035 };
export const SKILL_NAMES = {
  acc: 'Accounting', br: 'Broker Relations', abr: 'Advanced Broker Relations',
  trade: 'Trade', retail: 'Retail', wholesale: 'Wholesale', tycoon: 'Tycoon',
} as const;
export type SkillKey = keyof typeof SKILL_NAMES;
export const SKILL_FALLBACK_IDS: Record<SkillKey, number> = {
  acc: 16622, br: 3446, abr: 16597, trade: 3443, retail: 3444, wholesale: 16596, tycoon: 18580,
};

/**
 * Highest level an Alpha clone can use (EVE University wiki, Clone states, Feb 2026).
 * Accounting, Advanced Broker Relations, Retail, Wholesale and Tycoon are Omega only.
 * Skills trained above these stay trained but inactive while you're Alpha.
 */
export const ALPHA_CAPS: Record<SkillKey, number> = { acc: 0, br: 2, abr: 0, trade: 3, retail: 0, wholesale: 0, tycoon: 0 };

// PLEX trades on one market for the whole game, not in The Forge.
export const PLEX_TYPE = 44992;
export const GLOBAL_PLEX_MARKET = 19000001;
