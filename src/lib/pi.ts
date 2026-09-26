/**
 * Planetary Interaction: the one thing that earns while you are sitting in Jita doing nothing.
 *
 * Two halves, and they have very different standing:
 *
 *   - **Where the planets are** is real data. ESI names every planet's type, and every system's
 *     security, so "which Barren planets are in high-sec Lonetrek" has an exact answer.
 *   - **What a planet yields** is not. Extraction rate depends on the resource's richness at that
 *     spot, which exists only in the client. So the income here is *your* numbers run through live
 *     Jita prices, not a prediction. Read the rate off the extractor when you place it, type it in,
 *     and the sums are then honest. Give the scope and it reads your real extractors instead.
 *
 * The planet-type to resource mapping below is static game data rather than anything ESI serves.
 * It is descriptive, not predictive --- if any of it were wrong you would see it the moment you
 * opened a planet in the client.
 */

export const PLANET_TYPES = [
  'Barren', 'Gas', 'Ice', 'Lava', 'Oceanic', 'Plasma', 'Storm', 'Temperate',
] as const;
export type PlanetType = (typeof PLANET_TYPES)[number];

/** ESI names planet types `Planet (Barren)`. */
export function parsePlanetType(typeName: string): PlanetType | null {
  const m = /^Planet \(([A-Za-z]+)\)$/.exec(typeName.trim());
  const t = m?.[1] as PlanetType | undefined;
  return t && (PLANET_TYPES as readonly string[]).includes(t) ? t : null;
}

/** Raw resource to the P1 it refines into. */
export const P0_TO_P1: Record<string, string> = {
  'Aqueous Liquids': 'Water',
  Autotrophs: 'Industrial Fibers',
  'Base Metals': 'Reactive Metals',
  'Carbon Compounds': 'Biofuels',
  'Complex Organisms': 'Proteins',
  'Felsic Magma': 'Silicon',
  'Heavy Metals': 'Toxic Metals',
  'Ionic Solutions': 'Electrolytes',
  'Micro Organisms': 'Bacteria',
  'Noble Gas': 'Oxygen',
  'Noble Metals': 'Precious Metals',
  'Non-CS Crystals': 'Chiral Structures',
  'Planktic Colonies': 'Biomass',
  'Reactive Gas': 'Oxidizing Compound',
  'Suspended Plasma': 'Plasmoids',
};

/** What each planet type can be made to extract. */
export const PLANET_RESOURCES: Record<PlanetType, string[]> = {
  Barren: ['Aqueous Liquids', 'Base Metals', 'Carbon Compounds', 'Micro Organisms', 'Noble Metals'],
  Gas: ['Aqueous Liquids', 'Base Metals', 'Ionic Solutions', 'Noble Gas', 'Reactive Gas'],
  Ice: ['Aqueous Liquids', 'Heavy Metals', 'Micro Organisms', 'Noble Gas', 'Planktic Colonies'],
  Lava: ['Base Metals', 'Felsic Magma', 'Heavy Metals', 'Non-CS Crystals', 'Suspended Plasma'],
  Oceanic: ['Aqueous Liquids', 'Carbon Compounds', 'Complex Organisms', 'Micro Organisms', 'Planktic Colonies'],
  Plasma: ['Base Metals', 'Heavy Metals', 'Noble Metals', 'Non-CS Crystals', 'Suspended Plasma'],
  Storm: ['Aqueous Liquids', 'Base Metals', 'Ionic Solutions', 'Noble Gas', 'Suspended Plasma'],
  Temperate: ['Aqueous Liquids', 'Autotrophs', 'Carbon Compounds', 'Complex Organisms', 'Micro Organisms'],
};

/** Which planet types can produce a given P1, for "where do I go to make Plasmoids". */
export function planetsFor(p1: string): PlanetType[] {
  const p0 = Object.entries(P0_TO_P1).find(([, v]) => v === p1)?.[0];
  if (!p0) return [];
  return PLANET_TYPES.filter((t) => PLANET_RESOURCES[t].includes(p0));
}

export const HIGHSEC = 0.45;
export type Band = 'high' | 'low';
export const inBand = (security: number, band: Band) => (band === 'high' ? security >= HIGHSEC : security < HIGHSEC && security > 0);

export type PiPlanet = {
  planetId: number;
  name: string;
  type: PlanetType;
  systemId: number;
  systemName: string;
  security: number;
};

/**
 * Sixteen extractor heads at a typical rate, run through live prices.
 *
 * `unitsPerHour` is the figure the client shows you when you place the extractor, so this is
 * arithmetic on your own number rather than a forecast. Refining P0 into P1 divides the units by
 * the schematic ratio but multiplies the value; both are shown so the choice is visible.
 */
export type PiEstimate = {
  p0PerDay: number;
  p0Value: number;
  p1PerDay: number;
  p1Value: number;
  /** P1 is worth this many times the raw material it came from. */
  uplift: number;
};

/** Fourteen units of P0 make one unit of P1. */
export const P0_PER_P1 = 14;

export function estimate(
  unitsPerHour: number,
  planets: number,
  p0Price: number | null,
  p1Price: number | null,
  salesTax: number,
  brokerFee: number,
): PiEstimate {
  const net = 1 - salesTax - brokerFee;
  const p0PerDay = Math.max(0, unitsPerHour) * 24 * Math.max(0, planets);
  const p1PerDay = p0PerDay / P0_PER_P1;
  const p0Value = p0PerDay * (p0Price ?? 0) * net;
  const p1Value = p1PerDay * (p1Price ?? 0) * net;
  return { p0PerDay, p0Value, p1PerDay, p1Value, uplift: p0Value > 0 ? p1Value / p0Value : 0 };
}

export const PI_LINKS: { href: string; title: string; what: string }[] = [
  {
    href: 'https://wiki.eveuniversity.org/Planetary_Interaction',
    title: 'EVE University: Planetary Interaction',
    what: 'The whole system explained properly: command centres, extractor heads, routing, and the customs office tax that quietly eats the margin.',
  },
  {
    href: 'https://evemaps.dotlan.net/',
    title: 'Dotlan maps',
    what: 'Look up a system before you commit a command centre: security, jumps from Jita, and how quiet the neighbourhood is.',
  },
  {
    href: 'https://wiki.eveuniversity.org/Planetary_Interaction_planning',
    title: 'PI planning guide',
    what: 'Layouts that do not waste power grid, and which P2 chains are worth setting up rather than selling P1 raw.',
  },
];

/**
 * Worth saying out loud on the page, because the tax is invisible until it isn't.
 *
 * High-sec customs offices are NPC-owned and charge far more than a player-owned one in null. That
 * difference, not the extraction rate, is the main reason high-sec PI pays less.
 */
export const HIGHSEC_TAX_NOTE =
  'High-sec customs offices are NPC-run and take a much bigger cut than the player-owned ones in low and null. That tax, more than the extraction rate, is why the same planets pay less here.';

/**
 * Within a security band, lower security means richer planets.
 *
 * This is a real mechanic and it runs the *opposite* way to how a system list normally wants to be
 * sorted: for extraction a 0.5 is better than a 1.0, and low-sec is better than both. What ESI will
 * not tell us is by how much --- resource richness per planet exists only in the client, so there is
 * no multiplier here to multiply by. The page can point you at the right systems and must leave the
 * size of the difference to what you see when you survey.
 */
export const SECURITY_NOTE =
  'Lower security means richer planets, and that holds inside high-sec too — a 0.5 system extracts '
  + 'more than a 1.0. ESI does not publish how much richer, because richness lives only in the game '
  + 'client, so this orders systems by where to look rather than putting a number on it. Against that, '
  + '0.5 systems are where gankers wait for haulers, so the output still has to get home.';

export type PlanetSort = 'yield' | 'near' | 'safe';

export const PLANET_SORTS: { key: PlanetSort; label: string; hint: string }[] = [
  { key: 'yield', label: 'Best yield', hint: 'Lowest security first, because those planets are the richest' },
  { key: 'near', label: 'Closest to Jita', hint: 'Fewest jumps to carry the output home and sell it' },
  { key: 'safe', label: 'Safest', hint: 'Highest security first, if you would rather not be shot at' },
];

export function sortSystems<T extends { security: number; jumps?: number | null; name: string }>(
  rows: T[],
  sort: PlanetSort,
): T[] {
  const far = (j: number | null | undefined) => (j == null ? Number.MAX_SAFE_INTEGER : j);
  return [...rows].sort((a, b) => {
    if (sort === 'yield') return a.security - b.security || far(a.jumps) - far(b.jumps) || a.name.localeCompare(b.name);
    if (sort === 'near') return far(a.jumps) - far(b.jumps) || a.security - b.security || a.name.localeCompare(b.name);
    return b.security - a.security || far(a.jumps) - far(b.jumps) || a.name.localeCompare(b.name);
  });
}
