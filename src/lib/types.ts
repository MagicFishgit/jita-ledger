import type { SkillKey } from './config';
import type { RateStamp } from './fees';

/** A single buy or sell. ESI transactions use their transaction_id; manual ones start with "m-". */
export type Tx = {
  id: string;
  source: 'esi' | 'manual';
  typeId: number;
  date: string; // ISO, UTC
  isBuy: boolean;
  qty: number;
  unitPrice: number;
  locationId?: number;
  /** Manual entries belong to exactly one position. */
  positionId?: string;
  /** Manual entries only: total fees and tax you paid for this entry. Estimated when left out. */
  fees?: number;
};

/**
 * One line of the wallet journal. Every ISK movement has one, and `balance` is the wallet after it,
 * which is what lets the Wallet page draw the balance exactly rather than reconstruct it.
 *
 * Entries synced before the journal was kept in full carry only the fee and tax fields.
 */
export type JournalEntry = {
  id: string;
  date: string;
  refType: string;
  amount: number;
  contextId?: number;
  contextIdType?: string;
  balance?: number;
  firstPartyId?: number;
  secondPartyId?: number;
  description?: string;
  reason?: string;
};

export type Order = {
  orderId: number;
  typeId: number;
  isBuy: boolean;
  price: number;
  volumeTotal: number;
  volumeRemain: number;
  issued: string;
  state: string; // open, closed, expired, cancelled
  locationId: number;
  /** ISK held back for a buy order. Below price x remaining when Margin Trading is trained. */
  escrow?: number;
};

/**
 * A trading position: "I'm trading this item from this date".
 * Buys and sells of the item at Jita 4-4 from openedAt (until closedAt) count, unless excluded.
 * Anything else can be pulled in by hand (included).
 */
export type Position = {
  id: string;
  typeId: number;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  jitaOnly: boolean;
  excluded: string[];
  included: string[];
  note?: string;
};

export type BookLevel = { price: number; volume: number };
export type MarketSnap = {
  typeId: number;
  fetchedAt: string;
  bestBuy: number | null;
  bestSell: number | null;
  buyOrders: number;
  sellOrders: number;
  topBuys: BookLevel[];
  topSells: BookLevel[];
  avgVol7: number | null;
  avgPrice7: number | null;
  /** Share of volume that is buyers taking sells, from the last 30 days. Absent on older snapshots. */
  buyerShare?: number;
};

export type HistRow = { date: string; average: number; highest: number; lowest: number; volume: number; order_count: number };

export type WatchItem = { typeId: number; addedAt: string; snap?: MarketSnap };

/**
 * What you actually hold, counted per item, as opposed to what your trades imply you should.
 * Only loose hangar stock is counted --- anything packed into a container is reported by ESI
 * against the container rather than the station, so it cannot be attributed to a place.
 */
export type Stock = {
  at: string;
  /** Loose in the Jita 4-4 hangar: the stock a position is actually about. */
  jita: Record<number, number>;
  /** Everywhere, including ships and other stations. */
  total: Record<number, number>;
  /** Items held somewhere this can't attribute, so the two counts above understate the truth. */
  inContainers: number;
  /** Loose items per station or structure, for saying where wealth sits. Absent on older syncs. */
  byLocation?: Record<number, Record<number, number>>;
  /** Items inside ships and containers, counted apart for the same reason as `inContainers`. */
  nested?: Record<number, number>;
};

/** What a scan learned about one item's trading, reduced from ESI's daily history. */
export type ProspectStats = {
  typeId: number;
  at: string;
  /** Of the last 30 complete days, how many had any trade at all. */
  daysTraded: number;
  /** Median trades per day. */
  tradesPerDay: number;
  /** Median units per day. */
  unitsPerDay: number;
  /** The busiest day's share of the month's volume. High means one big day, not steady trade. */
  spikiness: number;
  /** Median (highest - lowest) / average: how wide this item's spread usually is. */
  dailyRange: number;
  /** 30-day average price against the 90-day, as a fraction. Negative means falling. */
  trend: number;
  avgPrice: number;
  /** 30 daily volumes, oldest first, zero on days nothing traded. */
  spark: number[];
  /**
   * Estimated share of volume that was buyers taking sell orders, 0 to 1. Read from where each
   * day's average sits between its low and high. Absent on stats cached before it was kept.
   */
  buyerShare?: number;
  /** The highest price anyone paid in the window. Nothing honest bids far above it. */
  high30?: number;
  /** A recent day traded several times the usual volume at an unusual price. */
  spike?: boolean;
  /** 7 daily ranges, oldest first, as (high - low) / average. The margin a trader can work. */
  range7?: number[];
};

export type ProspectWarning = 'thin' | 'fluke' | 'falling' | 'crowded' | 'wall' | 'escrow' | 'spike';

/** A candidate that cleared the gate, priced against the live book. */
export type Prospect = {
  typeId: number;
  stats: ProspectStats;
  bestBuy: number; bestSell: number;
  /** One legal step inside the spread: what you would actually place. */
  buy: number; sell: number;
  buyOrders: number; sellOrders: number;
  topBuyVol: number; topSellVol: number;
  qty: number;
  net: number; roi: number; spreadPct: number;
  /** ISK this item could absorb inside your horizon, at your share of its daily trade. */
  canTake: number;
  /** How long your money would be in it: buying in and selling out at your share. */
  daysToFlip: number;
  /** Return divided by the days the ISK is tied up. The default ranking. */
  roiPerDay: number;
  iskPerDay: number; capital: number;
  /** Your share of daily volume after scaling for how many sellers you compete with, 0 to 1. */
  share: number;
  /** Share of volume that is buyers taking sells, 0 to 1. */
  buyerShare: number;
  warnings: ProspectWarning[];
};

export type ProspectFilters = {
  /** ISK you want to put into a single item. A target to be met, not a ceiling to stay under. */
  budget: number;
  /** How long you'll accept being in the position. Decides how much an item can absorb. */
  horizonDays: number;
  minTrades: number;
  minDays: number;
  minRoi: number;
  maxSpikiness: number;
  /** Sort items carrying flags below clean ones, the more flags the further down. */
  demoteFlagged: boolean;
  /** Keep items that can take only part of the budget, sized to what they can take. */
  partial?: boolean;
};


export type Meta = {
  /** Total trained skill points, as ESI reports it. Levels alone can't give this: it depends on each skill's rank. */
  totalSp?: number;
  lastSync?: string;
  lastSyncError?: string;
  syncedCharacterId?: number;
  skillIds?: Partial<Record<SkillKey, number>>;
  npcIds?: { faction: number; corp: number };
  /** Clone state as read from your skills on the last sync, when it could be told. */
  cloneDetected?: 'alpha' | 'omega';
  walletBalance?: number;
  walletAt?: string;
  /** When ESI's cache next lets go on any route we sync, so the next sync is timed rather than guessed. */
  nextSyncAt?: string;
  /** When new buys and sells can next appear. ESI caches wallet transactions for an hour. */
  tradesFreshAt?: string;
  /** Broker fee and sales tax over time, so estimates for old trades use the rates you had then. */
  rateHistory?: RateStamp[];
  /** When the starting rates were assumed; changes within a day replace them instead of adding history. */
  rateSeededAt?: string;
  plex?: { price: number | null; buy: number | null; at: string };
  /** When the app was last open, kept up to date while it is. */
  lastSeenAt?: string;
  /** When the app was open before this visit: "since your last visit" is measured from here. */
  prevVisitAt?: string;
  /** When a backup was last exported. ESI keeps 30 days of wallet history, so this browser is the record. */
  lastBackupAt?: string;
  /** Character attributes, for working out how long a skill takes to train. */
  attributes?: { intelligence: number; memory: number; perception: number; willpower: number; charisma: number };
  /** Every skill's trained skill points, by type ID, so training time counts what is already in. */
  skillSp?: Record<number, number>;
  /** Last time killmails were read. */
  killmailsAt?: string;
  /** The best ISK per loyalty point last worked out on the Loyalty page, per corporation. */
  lpRate?: Record<number, { rate: number; at: string; /** Points the plan could place at that rate. */ lp?: number }>;
  /** Loyalty point balances as last read. */
  lpBalances?: { corporationId: number; points: number }[];
  /** When ESI's cache next lets go, per route, as read from each response. For the status bar's timers. */
  expiries?: Partial<Record<'orders' | 'transactions' | 'journal' | 'assets' | 'skills' | 'wallet' | 'killmails', string>>;
  /** Backups exported from this browser, newest first. */
  backups?: { at: string; name: string; bytes: number }[];
  /** Short log of recent syncs, newest first, for Settings. */
  syncLog?: { at: string; what: string; ok: boolean; added?: number; error?: string }[];
};

/** A killmail as stored: what ESI said, plus what it was worth on the day, kept and never re-priced. */
export type KillItem = { typeId: number; dropped: number; destroyed: number; flag: number };
export type KillParty = {
  characterId?: number; corporationId?: number; allianceId?: number; factionId?: number;
  shipTypeId?: number; weaponTypeId?: number; damage: number; finalBlow?: boolean; security?: number;
};
export type Killmail = {
  id: number;
  hash: string;
  time: string;
  systemId: number;
  kind: 'kill' | 'loss';
  victim: KillParty;
  attackers: KillParty[];
  items: KillItem[];
  /** Filled in once, from market history on the day. Absent until priced. */
  value?: {
    /** The date whose prices were used, which may be a day or two earlier when nothing traded. */
    priceDate: string;
    ship: number;
    items: Record<number, number>;
    dropped: number;
    destroyed: number;
    total: number;
    /** Types that had no history near the day and so count for nothing. */
    unpriced: number[];
  };
  /** Insurance paid out for this loss, matched from the wallet journal. */
  insurance?: number;
};

export type Theme = 'Caldari' | 'Amarr' | 'Gallente' | 'Minmatar';
export type Motion = 'Full' | 'Calm' | 'Off';
export type Activity = 'Trading' | 'Loyalty' | 'Planets' | 'Hauling' | 'Abyssal' | 'Combat';

/** How the app looks and a few choices that belong to you rather than to a page. */
export type Prefs = {
  theme: Theme;
  /** Unset means follow the system: Calm when reduced motion is asked for, Full otherwise. */
  motion?: Motion;
  alertSize: number;
  /** Hours a week you spend on each activity, for ISK per hour of your time. Blank until you say. */
  hours: Partial<Record<Activity, number>>;
  /** Collateral above which a contract through Uedama or Sivala is worth ganking, per hull. Yours to set. */
  gankLines: Record<string, number>;
  /** Let your own hauling losses lower the gank line. */
  learnFromLosses: boolean;
  /** What a jump of your time is worth, shared by Hauling, Hub arbitrage and the PI trip home. */
  perJump: number;
  /** Customs office tax rate you pay, as a fraction. Null means use the high-sec NPC rate. */
  piTax: number | null;
  /** PLEX each Omega pack costs in the store. Only the one-month price is known without looking. */
  omegaPacks: Record<'1' | '3' | '6' | '12', number | null>;
  omegaPack: '1' | '3' | '6' | '12';
};

export type AlertEvent = 'move' | 'clearing' | 'squeeze' | 'pi' | 'scam' | 'backup';
export type AlertConfig = {
  on: boolean;
  browser: boolean;
  /** Minutes between checks. */
  interval: number;
  /** Order alerts below this much ISK at stake are not raised. */
  minIsk: number;
  quiet: boolean;
  ev: Record<AlertEvent, boolean>;
};
export type AlertLogEntry = { at: string; kind: AlertEvent; key: string; title: string; text: string; test?: boolean };

export type Goal = { id: string; label: string; kind: 'wallet' | 'nw'; target: number };

/** One day's net worth, kept so the trend has something to draw. */
export type NetWorthPoint = { date: string; total: number; wallet: number };

export type UntrackedTag = 'loot' | 'personal' | 'trading' | 'other';
