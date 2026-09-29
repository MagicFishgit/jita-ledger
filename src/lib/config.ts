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

/** The cloud copy of the ledger: the Worker in `worker/`. Point it at `wrangler dev` to test locally. */
export const CLOUD_URL = (import.meta.env.VITE_CLOUD_URL as string | undefined) || 'https://jita-ledger-cloud.jitaledger.workers.dev';

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
  mailSend: 'esi-mail.send_mail.v1', // alerts as an EVE mail to yourself, for when you're in the game
  mailRead: 'esi-mail.read_mail.v1', // find old alert mails, to tidy them away
  mailOrganize: 'esi-mail.organize_mail.v1', // delete old alert mails
  notifications: 'esi-characters.read_notifications.v1', // EVE's notifications: when your things went into asset safety, and when they're delivered
  blueprints: 'esi-characters.read_blueprints.v1', // your blueprints, with ME, TE and runs, for pricing them
  freelance: 'esi-characters.read_freelance_jobs.v1', // the freelance jobs you've joined, and how much you've delivered
  skillqueue: 'esi-skills.read_skillqueue.v1', // what's training, so a trade skill about to finish shows what it does to fees
  industry: 'esi-industry.read_character_jobs.v1', // your industry jobs, so finished ones show on To do to deliver
  contracts: 'esi-contracts.read_character_contracts.v1', // your contracts: couriers to deliver, and what contracts you sold or bought held
} as const;
export const SCOPES: string[] = Object.values(SCOPE);

/**
 * Permissions asked for only once switched on in Settings. EVE's login refuses a scope that isn't ticked on the
 * application at developers.eveonline.com, and checks only after you sign in (a made-up scope gets the sign-in page too,
 * checked 29 September 2026), so adding one to SCOPES would refuse every new login until it was ticked there. Empty
 * while every scope the app uses is registered (the user ticked them all on 29 September 2026); notifications started
 * here.
 */
export const OPTIONAL_SCOPE = {} as const;
export const OPTIONAL_SCOPES: string[] = Object.values(OPTIONAL_SCOPE);


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
    unlocks: 'The "In game" buttons that open an item’s market window next to you, and the item names in alert mails, which open the item’s market.',
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
  'esi-mail.send_mail.v1': {
    label: 'Send EVE mail',
    unlocks: 'Alerts as an EVE mail to yourself, so they reach you inside the game. Only ever sent to you, and only if you turn it on under Settings → Alerts.',
    without: 'Alerts only appear in the app and as browser notifications, which Windows may hold back while a game is in front.',
  },
  'esi-mail.read_mail.v1': {
    label: 'Read EVE mail headers',
    unlocks: 'Finds the alert mails the app sent you, by sender and subject, so old ones can be tidied away. Nothing else in your mail is read or kept.',
    without: 'Old alert mails can only be tidied away if this browser sent them.',
  },
  'esi-mail.organize_mail.v1': {
    label: 'Delete EVE mail',
    unlocks: 'Deletes alert mails once they’re older than you choose. Only the app’s own alert mails, never anything else.',
    without: 'Alert mails stay in your inbox until you delete them yourself.',
  },
  'esi-killmails.read_killmails.v1': {
    label: 'Killmails',
    unlocks: 'The Combat page: your kills and losses, each priced at Jita on the day it happened, with the fit and a refit at today’s prices. Also the ships lost on the Wallet page, and the hauling gank line learning from your own losses.',
    without: 'Combat has nothing to show, and ship losses are missing from the Wallet and Results.',
  },
  'esi-characters.read_notifications.v1': {
    label: 'Notifications',
    unlocks: 'The asset safety countdown straight from EVE: the notification sent when your things went into asset safety names the structure, where they’ll be delivered, and when (by hand, and automatically).',
    without: 'The countdown comes from what you type in, or from when the cloud saw the wrap go in.',
  },
  'esi-characters.read_blueprints.v1': {
    label: 'Blueprints',
    unlocks: 'The Blueprints page: every blueprint you hold, with ME, TE and runs, priced against The Forge’s blueprint contracts.',
    without: 'The Blueprints page can’t read what you hold.',
  },
  'esi-characters.read_freelance_jobs.v1': {
    label: 'Your freelance jobs',
    unlocks: 'Side hustles → Freelance shows the jobs you’ve joined, how much you’ve delivered, and what’s left of your share.',
    without: 'The Freelance tab still finds jobs, but can’t say which you’re in.',
  },
  'esi-contracts.read_character_contracts.v1': {
    label: 'Your contracts',
    unlocks: 'To do lists courier contracts you’ve accepted with their deadline and the collateral at stake, and the Wallet names what the item exchanges you sold or bought held.',
    without: 'Couriers you’ve accepted aren’t tracked, and contract ISK shows without what it was for.',
  },
  'esi-industry.read_character_jobs.v1': {
    label: 'Industry jobs',
    unlocks: 'To do lists industry jobs that have finished and are waiting to be delivered, by facility, and ticks them off once you have.',
    without: 'Finished jobs wait in the Industry window with nothing to remind you.',
  },
  'esi-skills.read_skillqueue.v1': {
    label: 'Skill queue',
    unlocks: 'Rates & fees says what a trade skill in your queue will do when it finishes: your sales tax, broker fee, price-change discount or order slots, and when.',
    without: 'Fees still follow your skills once they finish; nothing says what’s coming.',
  },
  'esi-characters.read_loyalty.v1': {
    label: 'Loyalty points',
    unlocks: 'Your LP balance per corporation on the Loyalty page, so it knows what you have to spend.',
    without: 'The Loyalty page still works — you type a points figure in by hand.',
  },
};
