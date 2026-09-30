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

/**
 * What a filament's own description says (ESI's `description`, the game's text): which ships it pulls in, the weather's
 * penalty and bonus ("reduce explosive resistance", "enhance ship shield strength"), how long before the pocket collapses,
 * where it can't be opened, and where opening it flags you suspect. Checked 30 September 2026 across the tiers: the
 * suspect flag starts at Raging (0.8), then Chaotic (0.8, 0.7), then Cataclysmic (0.8 to 0.6). Null where the text says
 * nothing, never a guess.
 */
export type FilamentFacts = {
  ships: string | null; penalty: string | null; bonus: string | null; minutes: number | null;
  cannotOpenIn: string[]; suspectIn: string[];
};

export function filamentFacts(description: string): FilamentFacts {
  const d = description.replace(/\s+/g, ' ');
  const secs = (re: RegExp) => { const m = re.exec(d); return m ? m[1].split(/,\s*|\s+or\s+/).map((x) => x.trim()).filter(Boolean) : []; };
  const effect = /will <b>([^<]+)<\/b> but <b>([^<]+)<\/b>/.exec(d);
  const minutes = /After <b>(?:<color=[^>]+>)?(\d+) minutes/.exec(d);
  return {
    ships: /pull an? <b>([^<]+)<\/b>/.exec(d)?.[1] ?? null,
    penalty: effect?.[1] ?? null, bonus: effect?.[2] ?? null,
    minutes: minutes ? Number(minutes[1]) : null,
    cannotOpenIn: secs(/Cannot be activated in ([\d.,\sor]+?) systems/),
    suspectIn: secs(/flagged as suspect if activated in ([\d.,\sor]+?) systems/),
  };
}

/**
 * What the game's text gets wrong, and what's true instead (research of 30 September 2026). Every filament's description
 * still says it takes "a Tech I or Tech II Cruiser", and Tranquil's that it can't be opened in 1.0 or 0.9: stale.
 */
/** Who can go into a pocket, as the page draws it: how many ships of which size, and how the loot scales with them. */
export const ENTRY_OPTIONS = [
  { n: 1, hull: 'cruiser', loot: 1, note: 'Tech I, Tech II, Navy or pirate; not a Strategic Cruiser' },
  { n: 2, hull: 'destroyers', loot: 2, note: 'Two filaments; Tactical Destroyers allowed' },
  { n: 3, hull: 'frigates', loot: 3, note: 'Three filaments' },
] as const;

export const ENTRY = {
  said: 'One cruiser (Tech I, Tech II, Navy or pirate; not a Strategic Cruiser), or up to two destroyers (two filaments, Tactical Destroyers allowed), or up to three frigates (three filaments). The loot scales with the filaments used: a three-frigate pocket’s cache holds about three times a cruiser’s.',
  source: 'EVE University, “Abyssal Deadspace” (17 September 2026); two destroyers since Depths of the Abyss (15 September 2020). The filament’s own text still says only “Tech I or Tech II Cruiser”.',
};

/**
 * Where a tier opens: Tranquil anywhere since patch 23.02 (2026; 24.01, 28 September 2026, fixed higher tiers opening in
 * 0.9); the rest not in 1.0 or 0.9; the suspect flag from the filament's own text, which matches CCP's table of 4
 * November 2022 (0.8: T4 and up; 0.7: T5 and up; 0.6: T6).
 */
export function whereItOpens(tierIndex: number, suspectIn: string[]): string {
  const where = tierIndex === 0 ? 'Anywhere, 1.0 and 0.9 included (since patch 23.02; the filament’s own text still says otherwise)' : 'Not in 1.0 or 0.9 systems';
  return suspectIn.length ? `${where}; opening it in ${suspectIn.join(', ')} flags you suspect` : where;
}

/** How strong the weather is: rolled per pocket, not in ESI (the weather types carry no dogma). EVE University, September 2026. */
export const WEATHER_STRENGTH = 'The penalty is 30% or 50% at T0–T3 and 50% or 70% at T4–T6, rolled per pocket; the bonus is +50% (for capacitor, half the recharge time). It applies to the enemies too.';

/** How each weather plays, from EVE University's guide (September 2026), in brief. */
export const WEATHER_PLAY: Record<Weather, string> = {
  Dark: 'No resist hole: turrets and drones lose range (missiles don’t), and so do the enemies’ turrets, so it takes less tank but more damage. Fly missiles.',
  Electrical: 'The easiest weather: twice the capacitor recharge carries active tanks. The EM hole hurts shield tanks against Angels and Sanshas.',
  Exotic: 'The kinetic hole is usually a help: most shield tanks’ holes are EM and thermal. The scan resolution bonus barely matters.',
  Firestorm: 'Usually the hardest: +50% armour goes mostly to the armour-heavy enemies, so every kill takes longer; the thermal hole hurts too.',
  Gamma: '+50% shield suits passive shield regeneration fits (Gila, Vagabond, Ishtar); the enemies’ shields barely regenerate. The explosive hole is armour tanks’ usual one.',
};

/**
 * EVE University's rule of thumb per tier for a cruiser (FAQ, edited 11 February 2026): the damage and the tank (EHP a
 * second) a clear takes. Frigates less; Dark about 30% less tank. T2 "not very popular... we do not recommend running T2s".
 */
export const TIER_CHECK: { dps: number; ehps: number }[] = [
  { dps: 100, ehps: 50 }, { dps: 150, ehps: 150 }, { dps: 300, ehps: 300 }, { dps: 450, ehps: 450 },
  { dps: 600, ehps: 600 }, { dps: 750, ehps: 750 }, { dps: 850, ehps: 950 },
];

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
