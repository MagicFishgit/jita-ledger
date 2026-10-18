/**
 * Planetary Interaction: the planet types, the build guide for each kind of setup, and where to read more.
 *
 * The recipes, pins, command centre levels, customs bases and volumes are CCP's static data (src/data/planets.json, read
 * through piBundle.ts), and the planner that ranks a system's setups is piPlan.ts. What stays here is what has no bundle: the
 * eight planet types by name, ESI's way of naming them, and the steps of building a colony in the client. Pure.
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

export type Step = { title: string; body: string; tip?: string };
/** The planner's setup kinds (piPlan.ts `SetupKind`), named here so this file needs nothing of the planner's. */
export type BuildKind = 'p1' | 'p2' | 'feed' | 'bought' | 'chain';
/**
 * What a setup's steps name, as the page reads them off its planets' roles: the P0s its extractors pull, the goods its factories
 * make, and what a factory planet takes in. Names, not IDs: this file has no bundle.
 */
export type BuildNames = { p0s: string[]; makes: string[]; takesIn: string[] };

const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * Building a setup's colonies, in the order you do it in the client: each planet's command centre, then (where it extracts)
 * the survey before anything is placed, the factories the setup gives it, the launchpad and the routes, and last the program
 * and the haul. A factory planet on bought inputs has no extractor and no survey; it imports what it makes things from.
 *
 * Written for someone who has never placed a command centre. The order matters: people place structures before
 * surveying, then find the resource is on the other side of the planet; and a colony with links but no routes moves nothing.
 */
export function setupSteps(kind: BuildKind, n: BuildNames): Step[] {
  const extracts = kind !== 'bought';
  const fed = kind === 'feed' || kind === 'chain' || kind === 'bought';
  const p0 = n.p0s.length ? listSaid(n.p0s) : 'what each planet’s line names';
  const made = n.makes.length ? listSaid(n.makes) : 'what each planet’s line says it makes';
  const steps: Step[] = [
    {
      title: 'Buy a command centre for each planet and take it there',
      body: 'A command centre for the planet’s type, bought in Jita or at home and carried in your hold: it is 1,000 m³, so anything from a shuttle up will do. In space above the planet, open the planet and launch it. Nothing else can be built until it is down.',
      tip: 'Buy the one matching the planet type: a Lava command centre won’t deploy on a Barren planet.',
    },
    {
      title: 'Upgrade the command centre before anything else',
      body: 'Each level adds the CPU and powergrid the rest of the colony runs on, to Command Center Upgrades’ level. The planner fits every layout at the level your skill allows, so upgrade to it first rather than tearing the layout up later.',
    },
  ];
  if (extracts) {
    steps.push(
      {
        title: `Survey for ${p0} before placing anything`,
        body: 'Open the planet view and switch the overlay to the P0 its line names. The hotter the colour, the richer the ground. Look round the whole planet: this is the step people skip, and a poor spot costs you output for as long as the colony stands.',
        tip: 'Planetology and Advanced Planetology sharpen the reading. Without them the map is vague enough to mislead.',
      },
      {
        title: 'Place the extractor control units on the hottest ground',
        body: 'One extractor a P0, in the middle of the best colour, then drag out its heads: as many as the planet’s line says. Where it says they don’t fit beside its factories, train the level it names; where it says no level fits, fit fewer heads, which makes less than the figure above. More heads pull more in all, but each takes CPU and powergrid, and spreading them thins the yield a head.',
      },
    );
  }
  if (kind === 'p1') {
    steps.push({
      title: 'Place a Basic Industry Facility for each the line names',
      body: `Each one takes 3,000 of its P0 every 30 minutes and gives 20 of the P1: 6,000 an hour in, 40 out, so 150 P0 make one P1. The line says how many keep up with your extraction; one that runs dry is wasted powergrid.`,
    });
  }
  if (kind === 'p2') {
    steps.push(
      {
        title: 'Place the Basic Industry Facilities, then the Advanced ones',
        body: `The Basics turn each P0 into its P1 (3,000 in every 30 minutes, 20 out: 150 P0 a P1). An Advanced Industry Facility takes 40 each of two P1 an hour and makes 5 of the P2: here, ${made}. The line says how many of each.`,
        tip: 'The layout with fewer factories leaves room for more heads; the planner picked the one that pays at your rate.',
      },
    );
  }
  if (kind === 'feed' || kind === 'chain') {
    steps.push(
      {
        title: 'On each extraction planet, refine what it ships',
        body: 'Basic Industry Facilities turn each P0 into its P1 (3,000 every 30 minutes for 20: 150 P0 a P1), and an Advanced one where the line makes a P2 there. Whatever the line ships goes to the launchpad.',
      },
      {
        title: 'On the factory planet, place the factories and a launchpad',
        body: `Its line says what it makes (${made}) and how many factories: Advanced for a P2 or P3, a High-Tech Production Plant for a P4, which fits only on Barren and Temperate planets. The launchpad holds what comes in and what goes out (10,000 m³).`,
      },
    );
  }
  if (kind === 'bought') {
    steps.push({
      title: 'Place the factories and a launchpad',
      body: `No extractor here: the planet only makes ${made}. Advanced factories for a P2 or P3, a High-Tech Production Plant for a P4 (Barren and Temperate only). The launchpad holds what you bring and what it makes (10,000 m³).`,
    });
  }
  steps.push(kind === 'bought' || kind === 'feed' || kind === 'chain'
    ? {
      title: 'Link everything, then route it, which is the step that catches people',
      body: 'Links are roads; routes are the instructions. On a factory planet, route each input from the launchpad to the factories and the product back to the launchpad; on an extraction planet, from each extractor to its factory and on to the launchpad. Without routes the colony sits there built and moves nothing.',
      tip: 'If a structure shows a warning triangle, it has an input or output with nowhere to go.',
    }
    : {
      title: 'Place a launchpad, link everything, then route it',
      body: 'The launchpad holds the output and is what you export through. Link each extractor to its factories and the factories to the launchpad; links cost powergrid by their length, so keep the structures close. Then route: open each extractor, choose its product and route it to its factory, then each factory’s output on. Without routes the colony moves nothing.',
      tip: 'If a structure shows a warning triangle, it has an input or output with nowhere to go.',
    });
  if (fed) {
    steps.push({
      title: kind === 'bought' ? `Bring in ${n.takesIn.length ? listSaid(n.takesIn) : 'the inputs'}` : 'Carry what each extraction planet ships to the factory planet',
      body: kind === 'bought'
        ? 'Buy them at the market the line names, carry them to the planet and import them through its customs office into the launchpad. An import pays half the export tax on the same goods. Restock before the launchpad runs dry: the restocks a week are in the setup’s upkeep.'
        : 'Export it from each extraction planet’s launchpad through its customs office, carry it to the factory planet and import it there. Each export pays the planet’s tax; each import half of it.',
    });
  }
  if (extracts) {
    steps.push({
      title: 'Start the extraction programs and note when they end',
      body: 'Set the program length you chose here and install. Longer programs yield less an hour but need visiting less often. When a program ends the colony stops dead and quietly earns nothing, which is why the Colonies section counts the hours down.',
      tip: 'Submit the colony after every change. Nothing you have laid out takes effect until you do.',
    });
  }
  steps.push({
    title: 'Come back, export, and haul it to market',
    body: 'Move the output from the launchpad into the customs office (in sovereign null-sec the Orbital Skyhook is the customs office), then into your ship. The office takes its tax on CCP’s fixed base value a unit, not on what the goods sell for.',
    tip: 'Export in big batches: the tax is a unit, but your time and the trip are not.',
  });
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
