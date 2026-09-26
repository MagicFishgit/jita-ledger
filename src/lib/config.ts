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
  'esi-ui.open_window.v1', // open an item's market window in the client, so relisting is one click away
  'esi-assets.read_assets.v1', // what you actually hold, to check against what your trades imply
  'esi-characters.read_loyalty.v1', // loyalty point balances, for working out what to spend them on
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

/** Caldari Navy: the loyalty store a Jita trader is most likely to have points with. */
export const CALDARI_NAVY = 1000035;

// PLEX trades on one market for the whole game, not in The Forge.
export const PLEX_TYPE = 44992;
export const GLOBAL_PLEX_MARKET = 19000001;

/**
 * What each permission is for, in the order the login asks for them.
 *
 * Every one is read-only: ESI has no write operation that touches a market order, and the only
 * write this app makes at all is opening a market window in your client. Kept beside SCOPES so the
 * Settings page can say which are missing and what stops working without each, rather than the
 * "some permissions weren't granted" shrug it used to give.
 */
export const SCOPE_INFO: Record<string, { label: string; unlocks: string; without: string }> = {
  'esi-wallet.read_character_wallet.v1': {
    label: 'Wallet transactions and journal',
    unlocks: 'Positions, Inbox, the fee figures, and the abyssal ISK-per-run worked out from filaments bought against loot sold.',
    without: 'Nothing tracks what you actually bought and sold; positions and abyssal returns stay empty.',
  },
  'esi-markets.read_character_orders.v1': {
    label: 'Your market orders',
    unlocks: 'The Orders page: which of your orders have been undercut and whether moving is worth it.',
    without: 'The Orders page has nothing to judge.',
  },
  'esi-skills.read_skills.v1': {
    label: 'Skills',
    unlocks: 'Broker fee and sales tax worked out from your real levels, clone detection, and the skill readiness panel on every side hustle.',
    without: 'Fees fall back to what you type in Settings, and the hustle pages cannot tell you what you have trained.',
  },
  'esi-characters.read_standings.v1': {
    label: 'Standings',
    unlocks: 'The standings part of your broker fee, which is worth real ISK at Jita.',
    without: 'Broker fee is estimated slightly high.',
  },
  'esi-ui.open_window.v1': {
    label: 'Open a window in your client',
    unlocks: 'The "In game" buttons that open an item’s market window next to you.',
    without: 'Those buttons are hidden, since a button that cannot work is worse than none.',
  },
  'esi-assets.read_assets.v1': {
    label: 'Assets',
    unlocks: 'Stock reconciliation on positions, and the filaments already in your hangar on the Abyssal page.',
    without: 'Positions cannot check what you hold against what your trades imply.',
  },
  'esi-characters.read_loyalty.v1': {
    label: 'Loyalty points',
    unlocks: 'Your LP balance per corporation on the Loyalty page, so it knows what you have to spend.',
    without: 'The Loyalty page still works — you type a points figure in by hand.',
  },
};
