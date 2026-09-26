/**
 * Abyssal Deadspace, costed from the market and from your own wallet.
 *
 * The one thing no API will tell you is what a filament drops. ESI has no loot tables --- not
 * approximate ones, not any --- so an "expected reward" per tier would have to be invented, and a
 * number you invent is worse than no number when real ISK is sized on it.
 *
 * What can be known honestly: what every filament costs right now, and what you have actually made.
 * The wallet already holds both halves --- filaments you bought and abyssal loot you sold --- so the
 * return per run is measured rather than estimated. See `runsFrom`.
 */

/** The difficulty ladder, in order. Names come from the filaments themselves, not from a guess. */
export const TIERS = [
  'Tranquil', 'Calm', 'Agitated', 'Fierce', 'Raging', 'Chaotic', 'Cataclysmic',
] as const;
export type Tier = (typeof TIERS)[number];

/** The five weather types. A filament is one tier and one weather. */
export const WEATHERS = ['Dark', 'Exotic', 'Firestorm', 'Gamma', 'Electrical'] as const;
export type Weather = (typeof WEATHERS)[number];

export type Filament = { typeId: number; name: string; tier: Tier; weather: Weather; tierIndex: number };

const TIER_SET = new Set<string>(TIERS);
const WEATHER_SET = new Set<string>(WEATHERS);

/**
 * `<Tier> <Weather> Filament`, and nothing else.
 *
 * The filament market groups also carry expired event filaments and warp matrix filaments, which
 * are not abyssal runs at all. Matching the shape of the name keeps those out without a hand-kept
 * list that goes stale the next time CCP adds an event.
 */
export function parseFilament(typeId: number, name: string): Filament | null {
  const parts = name.trim().split(/\s+/);
  if (parts.length !== 3 || parts[2] !== 'Filament') return null;
  const [tier, weather] = parts;
  if (!TIER_SET.has(tier) || !WEATHER_SET.has(weather)) return null;
  return {
    typeId, name, tier: tier as Tier, weather: weather as Weather,
    tierIndex: TIERS.indexOf(tier as Tier),
  };
}

/** Sorted the way the ladder reads: easiest first, then by weather. */
export function byTier(a: Filament, b: Filament): number {
  return a.tierIndex - b.tierIndex || WEATHERS.indexOf(a.weather) - WEATHERS.indexOf(b.weather);
}

export type FilamentQuote = {
  f: Filament;
  /** What one costs you to buy outright. */
  cost: number | null;
  /** What you would net selling one instead of running it, after broker fee and sales tax. */
  flipNet: number | null;
  unitsPerDay: number | null;
};

/**
 * Running a filament costs you the filament. Selling it instead is the alternative use of the same
 * item, so the real cost of a run is what you gave up by not selling it --- which is higher than
 * nothing even when the filament was looted rather than bought.
 */
export function runCost(q: FilamentQuote): number | null {
  return q.cost;
}

export type Tx = {
  typeId: number;
  date: string;
  isBuy: boolean;
  qty: number;
  unitPrice: number;
};

export type RunStats = {
  /** Filaments bought in the window, by type. */
  byFilament: { f: Filament; runs: number; spent: number }[];
  runs: number;
  spentOnFilaments: number;
  /** Net proceeds of abyssal loot sold in the window, after sales tax. */
  lootSold: number;
  lootItems: number;
  profit: number;
  perRun: number | null;
  /** The share of runs made up by the single most-run filament, 0 to 1. */
  concentration: number;
  topFilament: Filament | null;
};

/**
 * What abyssal running has actually paid, from transactions already synced.
 *
 * Deliberately pooled across tiers: a Zero-Point Condensate in your hangar carries no record of the
 * run it came from, so loot sales cannot honestly be split by tier. `concentration` says how much
 * that matters --- if nine runs in ten were Raging Dark, the pooled figure *is* the Raging Dark
 * figure, and the page says so.
 */
export function runsFrom(
  txs: Tx[],
  filaments: Map<number, Filament>,
  lootTypes: Set<number>,
  since: number,
  salesTax: number,
): RunStats {
  const spend = new Map<number, { runs: number; spent: number }>();
  let lootSold = 0, lootItems = 0;

  for (const t of txs) {
    if (Date.parse(t.date) < since) continue;
    if (t.isBuy && filaments.has(t.typeId)) {
      const cur = spend.get(t.typeId) ?? { runs: 0, spent: 0 };
      cur.runs += t.qty;
      cur.spent += t.qty * t.unitPrice;
      spend.set(t.typeId, cur);
    } else if (!t.isBuy && lootTypes.has(t.typeId)) {
      lootSold += t.qty * t.unitPrice * (1 - salesTax);
      lootItems += t.qty;
    }
  }

  const byFilament = [...spend.entries()]
    .map(([typeId, v]) => ({ f: filaments.get(typeId)!, ...v }))
    .sort((a, b) => b.runs - a.runs);
  const runs = byFilament.reduce((t, x) => t + x.runs, 0);
  const spentOnFilaments = byFilament.reduce((t, x) => t + x.spent, 0);
  const profit = lootSold - spentOnFilaments;

  return {
    byFilament, runs, spentOnFilaments, lootSold, lootItems, profit,
    perRun: runs > 0 ? profit / runs : null,
    concentration: runs > 0 ? byFilament[0].runs / runs : 0,
    topFilament: byFilament[0]?.f ?? null,
  };
}

/**
 * Roughly how long a pocket takes, by tier, in minutes.
 *
 * Every abyssal pocket has a hard twenty-minute timer per room and three rooms, so the ceiling is
 * fixed by the game rather than estimated; what varies is how fast you clear. These are starting
 * figures the page lets you change --- the point is to put every hustle on the same ISK-per-hour
 * footing, not to predict your clear speed.
 */
export const RUN_MINUTES: Record<Tier, number> = {
  Tranquil: 12, Calm: 12, Agitated: 14, Fierce: 16, Raging: 18, Chaotic: 20, Cataclysmic: 22,
};

/** What the measured return per run works out to per hour at a given pace. */
export function iskPerHour(perRun: number, minutesPerRun: number): number {
  if (minutesPerRun <= 0) return 0;
  return perRun * (60 / minutesPerRun);
}

/** Links worth having open beside the game. Kept short: these are the ones people actually use. */
export const ABYSSAL_LINKS: { href: string; title: string; what: string }[] = [
  {
    href: 'https://mutaplasmid.space/',
    title: 'Mutaplasmid.space',
    what: 'Prices rolled abyssal modules by their actual stats. The only sane way to value a mutated module, since they never appear on the market.',
  },
  {
    href: 'https://wiki.eveuniversity.org/Abyssal_Deadspace',
    title: 'EVE University: Abyssal Deadspace',
    what: 'What each weather does to your fit, what spawns in each room, and the rules of the pocket. Read before your first Raging.',
  },
  {
    href: 'https://www.eveworkbench.com/fittings',
    title: 'EVE Workbench fittings',
    what: 'Community abyssal fits by tier and weather, with comments on what actually survives.',
  },
  {
    href: 'https://abyss.eve-nt.uk/',
    title: 'Abyss Tracker',
    what: 'Crowd-sourced loot data by tier and weather. The closest thing to a public drop table, and the right place to sanity-check what a tier is worth before you commit to it.',
  },
];
