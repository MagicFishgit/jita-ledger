import type { ContractItem, MyContract } from './contracts';
import type { QueuedLevel } from './skillStatus';
import type { CorpSpan, CorpTax, JoinedJob } from './freelance';
import type { SafetyWrap } from './esiRecords';
import type { BookSold, SellQueue, SplitFrom } from './split';
import type { SkillKey } from './constants';
import type { RateStamp } from './fees';
import type { ResearchRow, StandingRow } from './research';

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
  /**
   * The tax ESI says was taken from this entry, and the corporation that took it (esiRecords.ts): a reward or bounty
   * your corporation taxed. Absent where ESI gives none, and on entries stored before it was kept: "not recorded",
   * never a rate assumed.
   */
  tax?: number;
  taxReceiverId?: number;
  /**
   * Set only in the netted view (refunds.ts), never stored: a fee a GM refunded, or the refund, reads as zero and keeps
   * its original amount here; `refundId` / `refundOf` name the other half of the pair.
   */
  refunded?: number;
  refundId?: string;
  refundOf?: string;
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
  /**
   * Every version of this order the app has seen, oldest first. Changing an order's price moves its
   * `issued` time to the moment of the change, so each entry is a placement or a price change, and its
   * time is when the fee for it was charged. Only as good as how often the app synced: two changes
   * between syncs show as one.
   */
  seen?: { issued: string; price: number; remain: number }[];
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
  /**
   * Only on a plan's view of a position it shares with earlier trading (`planView` in plans.ts), never stored. The view
   * opens at the plan's start; trades added by hand count from there too, sell orders placed before it aren't its, and
   * the `held` units the position had then are the earlier trading's: they sell first, and none of it is the view's.
   */
  view?: { held: number };
};

export type BookLevel = { price: number; volume: number };
/**
 * Every Jita listing up to `price`, counted over the whole sell side by the cloud's full scan (`sellsToOf` in prospects.ts):
 * `units` is exact up to there. Kept where the summary's BOOK_LEVELS prices all sit at or under the queue's ceiling, the
 * one place they can't say how deep it goes.
 */
export type SellsTo = { price: number; units: number };
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
  /** Units a typical day (`paceDay`): what selling times are judged by. Absent on older snapshots. */
  typicalVol?: number | null;
  /** Share of volume that is buyers taking sells (`tradingSplit`). Absent on older snapshots. */
  buyerShare?: number;
  /** Where `buyerShare` came from. */
  splitFrom?: SplitFrom;
  /** Hours this app has watched the book, when the split includes it. */
  watchedH?: number;
  /** What the live orders have already sold on each side. Absent on older snapshots. */
  sold?: BookSold;
  /** NPCs sell this here, at a fixed price in unlimited supply. */
  npcSell?: boolean;
  /** The lowest price NPCs sell it at anywhere in The Forge, Jita or not. Absent when none does, and on older snapshots. */
  npcAnywhere?: number;
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
  /** Wraps in asset safety, or delivered and not yet unpacked (esiRecords.ts). Absent on stock read before they were kept. */
  safety?: SafetyWrap[];
  /** Units in `jita` that hold other things (a fitted ship, a container with things in it). Absent on older syncs. */
  holding?: Record<number, number>;
  /** Units in `jita` that are assembled: a container or ship in use, or a blueprint original. Absent on older syncs. */
  assembled?: Record<number, number>;
  /** Units fitted to one of your ships, charges in guns included (esiRecords.ts). Absent on older syncs. */
  fitted?: Record<number, number>;
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
  /**
   * Each of the last 14 days' low, oldest first, null where nothing traded: where the bulk of trading
   * got down to, for judging whether a bid will be reached (see fills.ts). Absent on older stats.
   */
  lows14?: (number | null)[];
  /** The day `lows14` ends on, so the fills watched since can be folded in over the same days. */
  lowsEnd?: string;
  /** Each of the same 14 days' highs, for whether trading gets up to an ask. */
  highs14?: (number | null)[];
  /** The latest day's average against the median of the days before it, as a fraction: a price that just moved. */
  lastMove?: number;
  /**
   * The last 3 days' average price against the median day of the 30 before them, less 1: a price that has run up
   * (prospects.ts, RUN_UP). 0 when it can't be said; absent on stats from before it was kept.
   */
  runUp?: number;
  /** That median day's average, the month the run-up is measured against. Absent on older stats. */
  runUpBase?: number;
  /** The highest price anyone paid in the window. Nothing honest bids far above it. */
  high30?: number;
  /** A recent day traded several times the usual volume at an unusual price. */
  spike?: boolean;
  /** 7 daily ranges, oldest first, as (high - low) / average. The margin a trader can work. */
  range7?: number[];
};

export type ProspectWarning = 'thin' | 'fluke' | 'falling' | 'crowded' | 'wall' | 'escrow' | 'spike' | 'moved' | 'runUp' | 'unreached' | 'unreachedSell' | 'slow' | 'longQueue' | 'marketMoved';

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
  /** Where that split came from. */
  splitFrom?: SplitFrom;
  /** ISK that changes hands here a day, both sides: the median day's units at the 30-day average price. */
  traded: number;
  /** Of the last 14 days, how many the bulk of trading reached a bid one step above the best. Null without history for it. */
  bidReach: number | null;
  /** True when `buy` was raised from one step above the best bid to where trading actually reached. */
  buyRaised: boolean;
  /** Of the last 14 days, how many the bulk of trading reached an ask one step under the best. Null without highs. */
  askReach?: number | null;
  /** True when `sell` was lowered from one step under the best ask to where trading actually reached. */
  sellLowered?: boolean;
  /** Of the last 5 days, how many reached a bid one step above the best; null when too few traded to say. Absent on a patient plan. */
  bidRecent?: number | null;
  /** Which window found the front bid not reached: the fortnight, or the last few days ("not reached lately"). */
  bidWindow?: 'fortnight' | 'recent';
  /** The same for the ask. */
  askRecent?: number | null;
  askWindow?: 'fortnight' | 'recent';
  /**
   * Price changes kept back per side, and what they cost a unit, when the watch of the item's Jita book shows you'd
   * typically be beaten before you fill (evaluate.ts, RAISES_RESERVED). Already taken off `net`, `roi` and what follows.
   */
  raiseReserve?: { buy: number; sell: number; isk: number };
  /** Priced to place and leave (`ProspectFilters.patient`): both prices are where trading reaches on half the days. */
  patient?: boolean;
  /**
   * The stock listed where this sell would compete (`listedQueue`, prospects.ts), in days of buyers taking listings, and the
   * price it was counted up to. Absent when nothing is listed there or nothing says who buys (`sellQueue`).
   */
  queue?: SellQueue & { upTo: number;
    /** Where the cloud's scan counted the whole side to, when its count was used (`listedQueue`). */
    countedTo?: number };
  warnings: ProspectWarning[];
};

export type ProspectFilters = {
  /** ISK you want to put into a single item. A target to be met, not a ceiling to stay under. */
  budget: number;
  /** How long you'll accept being in the position. Decides how much an item can absorb. Null: any length. */
  horizonDays: number | null;
  minTrades: number;
  minDays: number;
  minRoi: number;
  maxSpikiness: number;
  /** Sort items carrying flags below clean ones, the more flags the further down. */
  demoteFlagged: boolean;
  /** Keep items that can take only part of the budget, sized to what they can take. */
  partial?: boolean;
  /** Show the busiest markets by ISK traded a day instead, whatever they return. */
  busy?: boolean;
  /**
   * Place and leave: buy where the bulk of trading reaches on half the last 14 days and sell where it gets up to
   * on half of them, behind the front on purpose, paced by how often trading gets there. The Capital planner's.
   */
  patient?: boolean;
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
  /** Alert mails this browser sent, so they can be deleted on time even without the read-mail scope. */
  alertMails?: { id: number; at: string; char: number; from?: number }[];
  /** When old alert mails were last tidied away. */
  mailCleanAt?: string;
  /** Character attributes, for working out how long a skill takes to train. */
  attributes?: { intelligence: number; memory: number; perception: number; willpower: number; charisma: number };
  /** Every skill's trained skill points, by type ID, so training time counts what is already in. */
  skillSp?: Record<number, number>;
  /**
   * An alt's skills that Alpha caps below their trained level, at the level it can use (ESI's `active_skill_level`).
   * Only the cloud's sheet writes it, for an alt (worker/src/sheet.ts); the pilot reads it (lib/pilot.ts, usableSkills).
   */
  activeSkills?: Record<number, number>;
  /**
   * Your industry jobs not yet delivered, as last synced (esi-industry.read_character_jobs.v1), with when that read was
   * and the facilities' names, for To do's "ready to deliver".
   */
  industry?: { at: string; jobs: IndustryJob[]; places: Record<number, string> };
  /**
   * Your contracts as last synced (esi-contracts.read_character_contracts.v1): the list, the items of finished item
   * exchanges you were in (read once each, they don't change), and courier destinations' names.
   */
  contracts?: { at: string; list: MyContract[]; items: Record<number, ContractItem[]>; places: Record<number, string> };
  /**
   * Every freelance job you took part in (freelanceStore.ts `readJobHistory`): each one a reward in the journal names and
   * each on ESI's joined list, never replaced by the current list, for the Wallet, Results and the Freelance tab; and the
   * corporations you were in while they paid, for working out a reward's tax when the journal doesn't give it. Kept in
   * this browser only (cloudSync.ts LOCAL_META): every browser rebuilds it from the journal and ESI.
   */
  freelance?: { at: string; jobs: JoinedJob[]; corps?: CorpSpan[] };
  /**
   * Your corporation and its tax rate as last read (public, no permission; freelance.ts `readCorp`). Rewards and bounties
   * are paid after it, so the Freelance finder prices a job after it. Absent until a sync has read it.
   */
  corp?: CorpTax;
  /** The skill queue as last synced, in order: each skill, the level it trains to, when (null while paused). */
  skillQueue?: QueuedLevel[];
  /**
   * Every standing the character has, raw, as ESI gives it (research.ts `toStandings`: sorted by ID, signs kept), for
   * which R&D agents it can use. The main's is read by the browser's sync whenever the standings permission is held,
   * whatever "Fill skills, standings and clone state from my character" says (that switch governs only the fee fields,
   * `settings.faction` / `settings.corp`), with `at`, when it was read. An alt's is written by the cloud's sheet
   * (worker/src/sheet.ts) with no `at`: a time in its doc would push a revision every hour; its read time is its `sheet`
   * job's `lastOk`. An entry missing from the list is no standing; `standings` missing is not read yet.
   */
  standings?: { at?: string; list: StandingRow[] };
  /**
   * Every R&D agent researching for the character (research.ts `toResearch`: sorted by agent), from ESI's
   * `/characters/{id}/agents_research/` (permission `esi-characters.read_agents_research.v1`). The main's is read by the
   * browser's sync with `at`, when it was read; an alt's is written by the cloud's sheet with no `at` (as `standings`).
   * Missing is not read yet (or the permission missing, said as such); an empty list is read, with no agent running. A
   * failed read leaves it as it was.
   */
  research?: { at?: string; agents: ResearchRow[] };
  /**
   * The main's only: when EVE last offered a research mission, the newest `ResearchMissionAvailableMsg`'s timestamp in
   * any read of its notifications (read while an agent runs, research.ts `researchMissionAt`), never moved back by a read
   * that no longer has it. Missing: none seen.
   */
  researchMissionAt?: string;
  /** Last time killmails were read. */
  killmailsAt?: string;
  /** The best ISK per loyalty point last worked out on the Loyalty page, per corporation. */
  lpRate?: Record<number, { rate: number; at: string; /** Points the plan could place at that rate. */ lp?: number; /** The items the plan sells, for the cloud to watch. */ types?: number[] }>;
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
export type Activity = 'Trading' | 'Loyalty' | 'Planets' | 'Hauling' | 'Abyssal' | 'Combat' | 'Freelance' | 'Rewards';

/** How the app looks and a few choices that belong to you rather than to a page. */
export type Prefs = {
  theme: Theme;
  /** Unset means follow the system: Calm when reduced motion is asked for, Full otherwise. */
  motion?: Motion;
  alertSize: number;
  /** Seconds a toast stays on screen; null keeps it until you close it. */
  toastSeconds: number | null;
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

export type AlertEvent = 'move' | 'clearing' | 'squeeze' | 'pi' | 'scam' | 'backup' | 'opportunity' | 'snipe' | 'watchdog' | 'safety';
export type AlertConfig = {
  on: boolean;
  browser: boolean;
  /** Minutes between checks. */
  interval: number;
  /** Order alerts below this much ISK at stake are not raised. */
  minIsk: number;
  quiet: boolean;
  ev: Record<AlertEvent, boolean>;
  /** Also send alerts as an EVE mail to yourself, for when you're in the game. */
  mail: boolean;
  /** Which alerts go by mail. Only the ones worth acting on in game, unless you say otherwise. */
  mailEv: Record<AlertEvent, boolean>;
  /** Minutes before an alert mail is deleted, read or not; null keeps them. */
  mailKeepMin: number | null;
  /** Hours before the same alert comes again, notification or mail. */
  repeatH: number;
  /** The Sniper's bar: a mistake listing (or a bid for what you hold) is worth it from this much ISK… */
  snipeMinIsk: number;
  /** …and this return after fees, in percent. */
  snipeMinPct: number;
  /**
   * Blueprints (ESI category 9) on the Sniper page and in its mail. Off unless asked: the user, 2 October 2026, "exclude
   * blueprints, as they might be risky to try and sell".
   */
  snipeBlueprints: boolean;
};
export type AlertLogEntry = { at: string; kind: AlertEvent; key: string; title: string; text: string; test?: boolean };

/**
 * Which ISK a goal counts: the wallet alone; the wallet plus what's held in your orders (escrow and
 * stock listed for sale), which you could free up; or everything, net worth.
 */
export type GoalMeasure = 'wallet' | 'liquid' | 'nw';

type GoalBase = {
  id: string;
  label: string;
  createdAt: string;
  /** Optional: turns "when will I get there" into "am I on pace". */
  deadline?: string;
  /** Set the first time it is reached. A reached goal stays reached. */
  doneAt?: string;
};

/**
 * A goal is one of five kinds, each measured from something the app can read:
 * - isk: an ISK measure reaches a target.
 * - afford: have the ISK to buy `qty` of an item at the live price. Units of it bought on the market
 *   since the goal was set count towards it, so buying in small lots along the way shrinks what's left.
 * - hold: own `qty` of an item. Counted from your hangars and sell orders, except PLEX, whose vault
 *   ESI can't see: that counts `startCount` plus what you've bought on the market since.
 * - earn: trading profit or net cash flow since `from` reaches a target.
 * - skill: a skill trained to a level.
 */
export type Goal = GoalBase & (
  | { kind: 'isk'; measure: GoalMeasure; target: number }
  | { kind: 'afford'; typeId: number; qty: number; measure: GoalMeasure }
  | { kind: 'hold'; typeId: number; qty: number; startCount?: number }
  | { kind: 'earn'; source: 'trading' | 'cashflow'; target: number; from: string }
  | { kind: 'skill'; skillId: number; level: number }
);

/** One day's net worth, kept so the trend has something to draw. */
export type NetWorthPoint = { date: string; total: number; wallet: number; /** Wallet plus escrow and stock in sell orders. Absent on older points. */ liquid?: number };

export type UntrackedTag = 'loot' | 'personal' | 'trading' | 'other';

/** An industry job as ESI lists it, trimmed: what, where, how many runs, when it ends, and its state. */
export type IndustryJob = {
  jobId: number; activity: number; blueprintTypeId: number; productTypeId: number | null; runs: number;
  end: string; status: string; stationId: number;
};
