/**
 * Planetary Interaction: where to put a colony, what to make on it, and whether processing pays.
 *
 * Three kinds of fact live here and they are not equally solid, so they are kept apart:
 *
 *   - **From ESI.** Planet types, system security, every schematic's name and cycle time. The 15
 *     products with a 30-minute cycle are exactly the P1 list below --- checked, not assumed.
 *   - **Game data, fixed and stated.** Which planet types yield which raw material, and the factory
 *     ratios. ESI serves neither; both are descriptive rather than predictive, and you would see
 *     within a minute in the client if any of it were wrong.
 *   - **Not knowable at all.** How rich a given planet is. That lives only in the client, so nothing
 *     here pretends to a number for it.
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

/** Raw resource to the P1 it refines into. All 15 confirmed against ESI's schematic list. */
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

export const P1_TO_P0: Record<string, string> = Object.fromEntries(
  Object.entries(P0_TO_P1).map(([p0, p1]) => [p1, p0]),
);

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
  const p0 = P1_TO_P0[p1];
  if (!p0) return [];
  return PLANET_TYPES.filter((t) => PLANET_RESOURCES[t].includes(p0));
}

/**
 * A Basic Industry Facility: 3,000 raw in, 20 refined out, every 30 minutes.
 *
 * So 150 raw units make one P1, and one facility eats 6,000 raw an hour to make 40. Getting this
 * ratio wrong flatters refining by an order of magnitude, which is the whole reason it is written
 * here as three named numbers rather than a bare constant.
 *
 * The 30-minute cycle is confirmed from ESI: exactly 15 schematics carry a 1,800-second cycle, and
 * they are exactly the 15 P1 products.
 */
export const BASIC_FACTORY = { rawPerCycle: 3000, madePerCycle: 20, cycleMinutes: 30 };
export const P0_PER_P1 = BASIC_FACTORY.rawPerCycle / BASIC_FACTORY.madePerCycle; // 150
export const RAW_PER_HOUR = BASIC_FACTORY.rawPerCycle * (60 / BASIC_FACTORY.cycleMinutes); // 6,000
export const MADE_PER_HOUR = BASIC_FACTORY.madePerCycle * (60 / BASIC_FACTORY.cycleMinutes); // 40

/**
 * An Advanced Industry Facility: 40 units each of **two different** P1, hourly, for 5 P2.
 *
 * The two inputs are the catch. One planet extracts one raw material, so a P2 chain means either a
 * second planet or hauling one input in. Which P1 pair makes which P2 is not in ESI and is not
 * guessed at here --- the factory in the client lists them.
 */
export const ADVANCED_FACTORY = { inputsNeeded: 2, eachPerCycle: 40, madePerCycle: 5, cycleMinutes: 60 };
/** One P2 costs this many P1 in total, across its two inputs. */
export const P1_PER_P2 = (ADVANCED_FACTORY.inputsNeeded * ADVANCED_FACTORY.eachPerCycle) / ADVANCED_FACTORY.madePerCycle; // 16

export const HIGHSEC = 0.45;
export type Band = 'high' | 'low';
export const inBand = (security: number, band: Band) =>
  (band === 'high' ? security >= HIGHSEC : security < HIGHSEC && security > 0);

export type PiPlanet = {
  planetId: number;
  name: string;
  type: PlanetType;
  systemId: number;
  systemName: string;
  security: number;
};

export type PiEstimate = {
  rawPerHour: number;
  rawPerDay: number;
  rawValue: number;
  madePerDay: number;
  madeValue: number;
  /** Basic factories one planet needs to keep up with its own extraction. */
  factories: number;
  /** How busy they will be, 0 to 1. A lone factory on a slow extractor idles most of the hour. */
  utilisation: number;
  /** What refining multiplies the raw's value by. Below 1 and you should sell it raw. */
  uplift: number;
};

/**
 * What a set of planets brings in, from an extraction rate you read off your own extractor.
 *
 * Both halves are shown because the answer genuinely goes both ways: refining multiplies the value
 * per unit but costs 150 units to make one, and on a cheap raw material with a thin P1 price that
 * trade is a loss of time and powergrid.
 */
export function estimate(
  unitsPerHour: number,
  planets: number,
  p0Price: number | null,
  p1Price: number | null,
  salesTax: number,
  brokerFee: number,
): PiEstimate {
  const net = 1 - salesTax - brokerFee;
  const rawPerHour = Math.max(0, unitsPerHour) * Math.max(0, planets);
  const rawPerDay = rawPerHour * 24;
  const madePerDay = rawPerDay / P0_PER_P1;
  const rawValue = rawPerDay * (p0Price ?? 0) * net;
  const madeValue = madePerDay * (p1Price ?? 0) * net;
  // Factories are per colony, not pooled: each planet is its own island and cannot feed another.
  // A factory short of material does not stop existing, it simply runs fewer cycles --- so this is
  // how many are needed to keep up, rounded up, with how busy they will be.
  const perPlanet = Math.max(0, unitsPerHour);
  const factories = perPlanet > 0 ? Math.ceil(perPlanet / RAW_PER_HOUR) : 0;
  return {
    rawPerHour, rawPerDay, rawValue, madePerDay, madeValue,
    factories,
    utilisation: factories > 0 ? perPlanet / (factories * RAW_PER_HOUR) : 0,
    uplift: rawValue > 0 ? madeValue / rawValue : 0,
  };
}

export type ProductPick = {
  p1: string;
  p0: string;
  p1Price: number | null;
  p0Price: number | null;
  /** What a thousand units of raw is worth refined, net, versus sold as it comes out. */
  refinedPer1000Raw: number;
  rawPer1000Raw: number;
  uplift: number;
  planets: PlanetType[];
  /** How many of the eight planet types can extract the input. Scarce inputs are harder to site. */
  availability: number;
};

/**
 * Which product to make, ranked on what a fixed amount of extraction turns into.
 *
 * Every P1 costs the same 150 raw units, so this comes down to the P1 price --- but stating it per
 * thousand units extracted keeps it directly comparable with selling the raw, which is the decision
 * actually being made. Availability is a tie-breaker, not a ranking: a product only two planet types
 * can make is one you may have to travel for.
 */
export function rankProducts(
  priceOf: (name: string) => number | null,
  salesTax: number,
  brokerFee: number,
): ProductPick[] {
  const net = 1 - salesTax - brokerFee;
  return Object.entries(P1_TO_P0).map(([p1, p0]) => {
    const p1Price = priceOf(p1);
    const p0Price = priceOf(p0);
    const refinedPer1000Raw = ((1000 / P0_PER_P1) * (p1Price ?? 0)) * net;
    const rawPer1000Raw = 1000 * (p0Price ?? 0) * net;
    const planets = planetsFor(p1);
    return {
      p1, p0, p1Price, p0Price, refinedPer1000Raw, rawPer1000Raw,
      uplift: rawPer1000Raw > 0 ? refinedPer1000Raw / rawPer1000Raw : 0,
      planets, availability: planets.length,
    };
  }).sort((a, b) => b.refinedPer1000Raw - a.refinedPer1000Raw || b.availability - a.availability);
}

/** Whether processing is worth the factories, stated as the page should state it. */
export function refineVerdict(uplift: number): { worth: boolean; short: string } {
  if (uplift <= 0) return { worth: false, short: 'Not priced' };
  if (uplift >= 2) return { worth: true, short: 'Refine it' };
  if (uplift >= 1.15) return { worth: true, short: 'Worth refining' };
  if (uplift >= 0.95) return { worth: false, short: 'Barely matters' };
  return { worth: false, short: 'Sell it raw' };
}

export const SECURITY_NOTE =
  'Lower security means richer planets, and that holds inside high-sec too — a 0.5 system extracts '
  + 'more than a 1.0. ESI does not publish how much richer, because richness lives only in the game '
  + 'client, so this orders systems by where to look rather than putting a number on it. Against that, '
  + '0.5 systems are where gankers wait for haulers, so the output still has to get home.';

export const HIGHSEC_TAX_NOTE =
  'High-sec customs offices are NPC-run and take a much bigger cut than the player-owned ones in low '
  + 'and null. That tax, more than the extraction rate, is why the same planets pay less here.';

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

export type Step = { title: string; body: string; tip?: string };

/**
 * Building the colony, in the order you actually do it in the client.
 *
 * Written for someone who has never placed a command centre. The order matters: people habitually
 * place structures before surveying, then find the resource is on the other side of the planet.
 */
export function setupSteps(product: string, refine: boolean): Step[] {
  const p0 = P1_TO_P0[product] ?? 'the raw material';
  const steps: Step[] = [
    {
      title: 'Buy a command centre and take it to the planet',
      body: `A command centre for the right planet type, bought in Jita and carried in your hold — it is 1,000 m³, so anything from a shuttle upwards will do. In space above the planet, open the planet, and launch it. Nothing else can be built until it is down.`,
      tip: 'Buy the command centre matching the planet type. A Lava command centre will not deploy on a Barren planet.',
    },
    {
      title: 'Upgrade the command centre before anything else',
      body: 'Every upgrade level costs ISK but adds the CPU and powergrid the rest of the colony runs on. At level 0 you can barely fit an extractor; most single-planet setups want level 4 or 5. Doing it first saves tearing the layout up later.',
    },
    {
      title: `Survey for ${p0} before placing anything`,
      body: `Open the planet view and switch the overlay to ${p0}. The hotter the colour, the richer the ground. Move the view around the whole planet — this is the step people skip, and a poor spot costs you output for as long as the colony stands.`,
      tip: 'Planetology and Advanced Planetology sharpen this reading. Without them the map is vague enough to mislead.',
    },
    {
      title: 'Place the extractor control unit on the hottest ground',
      body: 'Drop the extractor in the middle of the best colour you found, then drag out its heads. More heads pull more in total but each one takes CPU and powergrid, and spreading them thins the yield per head. Watch the per-hour figure as you drag and stop when it stops improving.',
    },
  ];

  if (refine) {
    steps.push(
      {
        title: 'Place a Basic Industry Facility next to it',
        body: `Each facility swallows ${BASIC_FACTORY.rawPerCycle.toLocaleString()} units of ${p0} every ${BASIC_FACTORY.cycleMinutes} minutes and returns ${BASIC_FACTORY.madePerCycle} ${product} — ${RAW_PER_HOUR.toLocaleString()} an hour in, ${MADE_PER_HOUR} out. Place as many as your extraction can keep fed; one that runs dry is wasted powergrid.`,
        tip: `${P0_PER_P1} units of ${p0} make one ${product}. That is the number that decides whether refining is worth it at all.`,
      },
      {
        title: 'Place a launchpad, then link everything together',
        body: 'A launchpad holds the output and is what you export through. Link the extractor to the factory, and the factory to the launchpad. Links cost powergrid in proportion to their length, so keep the structures close together.',
      },
      {
        title: 'Route the material, which is the step that catches people',
        body: `Links are roads; routes are the instructions. Open the extractor, choose its product, and route it to the factory. Then open the factory and route ${product} on to the launchpad. Without routes the colony sits there fully built and moves nothing.`,
        tip: 'If a structure shows a warning triangle, it has an input or output with nowhere to go.',
      },
    );
  } else {
    steps.push({
      title: 'Place a launchpad and link the extractor to it',
      body: `Selling ${p0} as it comes out means no factories at all: extractor to launchpad, one link, one route. Simpler to build, cheaper in powergrid, and on current prices it is the better trade for this product.`,
      tip: 'Open the extractor, choose its product, and route it to the launchpad. A colony with links but no routes moves nothing.',
    });
  }

  steps.push(
    {
      title: 'Start the extraction programme and note when it ends',
      body: 'Set the programme length and hit install. Longer programmes yield less per hour but need visiting less often. When it expires the colony stops dead and quietly earns nothing, which is why this page counts the hours down for you.',
      tip: 'Submit the colony after every change. Nothing you have laid out takes effect until you do.',
    },
    {
      title: 'Come back, export, and haul it home',
      body: 'Collect from the launchpad into the customs office, then into your ship. The customs office takes its cut here — in high-sec that is an NPC office and the cut is steep, which is the main reason high-sec PI pays less than low.',
      tip: 'Export in big batches. The tax is per unit, but your time and the trip are not.',
    },
  );
  return steps;
}

export const PI_LINKS: { href: string; title: string; what: string }[] = [
  {
    href: 'https://wiki.eveuniversity.org/Planetary_Interaction',
    title: 'EVE University: Planetary Interaction',
    what: 'The whole system explained properly: command centres, extractor heads, routing, and the customs office tax that quietly eats the margin.',
  },
  {
    href: 'https://wiki.eveuniversity.org/Planetary_Interaction_planning',
    title: 'PI planning guide',
    what: 'Layouts that do not waste powergrid, and which processed chains are worth setting up rather than selling P1 raw.',
  },
  {
    href: 'https://evemaps.dotlan.net/',
    title: 'Dotlan maps',
    what: 'Look up a system before you commit a command centre: security, jumps from Jita, and how quiet the neighbourhood is.',
  },
];
