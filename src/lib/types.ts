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
  /** Broker fee and sales tax over time, so estimates for old trades use the rates you had then. */
  rateHistory?: RateStamp[];
  /** When the starting rates were assumed; changes within a day replace them instead of adding history. */
  rateSeededAt?: string;
  plex?: { price: number | null; buy: number | null; at: string };
};
