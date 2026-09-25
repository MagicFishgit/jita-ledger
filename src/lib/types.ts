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

export type JournalEntry = {
  id: string;
  date: string;
  refType: string;
  amount: number;
  contextId?: number;
  contextIdType?: string;
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
};

export type ProspectWarning = 'thin' | 'fluke' | 'falling' | 'crowded';

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
  iskPerDay: number; capital: number;
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
};


export type Meta = {
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
};
