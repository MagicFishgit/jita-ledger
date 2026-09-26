// Everything that ties the app to EVE lives here.

export const APP_NAME = 'Jita Ledger';

// The pure constants live in ./constants so logic that needs them can be tested without Vite.
export * from './constants';
import type { SkillKey } from './constants';

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
/**
 * Every scope, by name. Code asks for `SCOPE.wallet`, never for a position in the list, so adding or
 * reordering scopes can't quietly make a page check the wrong one.
 */
export const SCOPE = {
  wallet: 'esi-wallet.read_character_wallet.v1', // wallet transactions and journal (fees and tax)
  orders: 'esi-markets.read_character_orders.v1', // open orders and order history
  skills: 'esi-skills.read_skills.v1', // Accounting, Broker Relations, Advanced Broker Relations
  standings: 'esi-characters.read_standings.v1', // Caldari State and Caldari Navy standings
  ui: 'esi-ui.open_window.v1', // open an item's market window in the client, so relisting is one click away
  assets: 'esi-assets.read_assets.v1', // what you actually hold, to check against what your trades imply
  loyalty: 'esi-characters.read_loyalty.v1', // loyalty point balances, for working out what to spend them on
  planets: 'esi-planets.manage_planets.v1', // your planetary colonies: extractor programmes, output and stored goods
  killmails: 'esi-killmails.read_killmails.v1', // your kills and losses, priced on the day, for Combat and the Wallet
  structures: 'esi-universe.read_structures.v1', // names of player structures you can dock at
  waypoint: 'esi-ui.write_waypoint.v1', // set a station or structure as your destination in the client
} as const;
export const SCOPES: string[] = Object.values(SCOPE);


// Resolved by name at sync time; these are fallbacks.
export const NPC_NAMES = { faction: 'Caldari State', corp: 'Caldari Navy' };
export const NPC_FALLBACK_IDS = { faction: 500001, corp: 1000035 };
export const SKILL_FALLBACK_IDS: Record<SkillKey, number> = {
  acc: 16622, br: 3446, abr: 16597, trade: 3443, retail: 3444, wholesale: 16596, tycoon: 18580,
};


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
    unlocks: 'The Wallet page (balance, money in and out, net worth, fee leak), Positions, Results, and the abyssal ISK-per-run worked out from filaments bought against loot sold.',
    without: 'Nothing tracks what you actually bought and sold; the Wallet, positions and abyssal returns stay empty.',
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
  'esi-planets.manage_planets.v1': {
    label: 'Planetary colonies',
    unlocks: 'Your real colonies on the Planets page: when each extraction programme runs out, what every extractor is pulling an hour, and what is sitting in the launchpads waiting to be collected.',
    without: 'Planets falls back to the estimator, where you type in an extraction rate yourself. Nothing warns you when a programme has expired.',
  },
  'esi-universe.read_structures.v1': {
    label: 'Player structure names',
    unlocks: 'Names the player structures your stock sits in on the Wallet, and lets Hauling check whether you can dock at a contract’s pickup and destination. ESI only describes a structure you are on the access list of.',
    without: 'Structures show as “a player structure”, and Hauling can’t tell a structure you can dock at from one you can’t, so every structure contract is left unchecked.',
  },
  'esi-ui.write_waypoint.v1': {
    label: 'Set destination in your client',
    unlocks: 'Click a station or structure on the Wallet to set it as your autopilot destination in game. It sets a route; it can’t fly the ship.',
    without: 'Places are shown by name only; you set the destination in game yourself.',
  },
  'esi-killmails.read_killmails.v1': {
    label: 'Killmails',
    unlocks: 'The Combat page: your kills and losses, each priced at Jita on the day it happened, with the fit and a refit at today’s prices. Also the ships lost on the Wallet page, and the hauling gank line learning from your own losses.',
    without: 'Combat has nothing to show, and ship losses are missing from the Wallet and Results.',
  },
  'esi-characters.read_loyalty.v1': {
    label: 'Loyalty points',
    unlocks: 'Your LP balance per corporation on the Loyalty page, so it knows what you have to spend.',
    without: 'The Loyalty page still works — you type a points figure in by hand.',
  },
};
