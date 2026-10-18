import type { PlanetType } from './pi';
import { madeAlone, type Facility, type PiIndex, type Schematic, type Tier } from './piBundle';
import { fitOf, maxFactories, maxHeads, type Fit, type Layout } from './piFit';
import type { Rate } from './piLearn';
import type { Tax } from './planetsDoc';
import { slotDay, type Freight, type Sale } from './industryRank';
import { units as unitsSaid, plainNum } from './format';
import { dayCount, perDaySaid } from './split';

/**
 * Units a day, said as split.ts says a pace (N2): whole from 10, one decimal under it, "under 0.1" for less, so a known 0.3 never
 * reads 0 nor 0.7 reads 1. `qtyAday` puts the good's name in: "about 577 High-Tech Transmitters a day", "under 0.1 Neocoms a day".
 */
const amountSaid = (n: number) => dayCount(n);
const qtyAday = (n: number, what: string) => (n > 0 && n < 0.1 ? `under 0.1 ${what} a day` : `about ${dayCount(n)} ${what} a day`);

/**
 * The Planets planner (docs/superpowers/specs/2026-10-17-planets-design.md, "The setup types"): for a chosen system and
 * character, which planet does what, what fits, every output valued, the customs tax and the upkeep. The first part plans one
 * planet at a time (P0 → P1 and P0 → P2 on each planet); the second plans factory planets (fed by the system's extraction
 * planets, on bought inputs, or in a chain across characters) and ranks all five. Pure: no config, store, React or DOM.
 */

/** A planet of the system: its PI type (null for Shattered and Scorched Barren), its radius from the static data (null when not known), its customs tax. */
export type PlanPlanet = { planetId: number; name: string; type: PlanetType | null; radiusKm: number | null; tax: Tax };
/** Whose setup: planets allowed (1 + Interplanetary Consolidation), Command Center Upgrades, the clone state. Null is not read. */
export type PlanChar = { charId: number; name: string; planets: number | null; ccLevel: number | null; alpha: boolean | null };
/**
 * A good's whole output a day, sold: ISK net after sales tax, broker and freight from home to Jita (null when no price is
 * read, with `why`), the units that sell (the rest builds up), and every place that sells some. `jitaUnits`, when given,
 * is how many of `units` sell at Jita; absent, all of them when Jita is the only place, else none.
 */
export type Sold = { isk: number | null; units: number; where: ('jita' | 'home')[]; why: string | null; jitaUnits?: number };
/**
 * The planner's searches bound what an arrangement can be worth by each good's first unit, so a `Sell` must keep to this:
 * a unit's net never rises as the amount grows (`isk ÷ units` at more is no more than at less), the units that sell never
 * fall as the amount grows, and there's no fixed charge a call (a freight minimum is spread over a batch, as `batchLeg`
 * does, never charged on each call). Broken, the best arrangement can be pruned without a word.
 */
export type Sell = (typeId: number, perDay: number) => Sold;
/**
 * A good's whole output a day sold: `sell` picks the place (Jita, the home hub, or the better of the two). Each place's sale
 * is worked out by `slotDay` at your share of its pace. Under 'best' the sides of both places are filled in order of net, each to its
 * cap, a side after the first only where its unit pays, so every output is valued where it can sell; `where` lists
 * both when both sell and `jitaUnits` is how many go to Jita (for the week's freight volume). Works on nets already worked
 * out: a freight minimum belongs in the `Sale`s (spread over a week's sales), never charged per call here. `why` is the
 * sales' own reasons when neither prices. Pure.
 */
export function soldOf(perDay: number, sales: { jita: Sale | null; home: Sale | null }, sell: 'jita' | 'home' | 'best', share: number): Sold {
  const places = (['home', 'jita'] as const).filter((p) => sell === 'best' || sell === p).map((p) => ({ p, sale: sales[p] }));
  // The sides of both places in order of net, not a place at a time: a place filled whole would sell its bids ahead of the other
  // place's better listings, and a unit's net would rise with the amount (the contract on `Sell`).
  const sides = places.flatMap((x) => (x.sale ? [
    { p: x.p, net: x.sale.listNet, sale: { ...x.sale, bidNet: null } },
    { p: x.p, net: x.sale.bidNet, sale: { ...x.sale, listNet: null } },
  ] : [])).filter((s) => s.net != null).sort((a, b) => b.net! - a.net! || (a.p === b.p ? 0 : a.p === 'home' ? -1 : 1));
  if (!sides.length) {
    const why = [...new Set(places.map((x) => x.sale?.why).filter((w): w is string => !!w))].join('; ');
    return { isk: null, units: 0, where: [], why: why || 'no price read', jitaUnits: 0 };
  }
  let left = perDay, isk = 0, units = 0, jita = 0;
  const where = new Set<'jita' | 'home'>();
  sides.forEach((sd, i) => {
    // The first side is sold even at a loss (the loss is shown); the rest only where a unit pays.
    if (!(left > 0) || (i > 0 && !(sd.net! > 0))) return;
    const d = slotDay(left, sd.sale, 0, share);
    if (!d || !(d.units > 0)) return;
    isk += d.profit; units += d.units; left -= d.units;
    if (sd.p === 'jita') jita += d.units;
    where.add(sd.p);
  });
  return { isk, units, where: [...where], why: null, jitaUnits: jita };
}
/**
 * What `perDay` units cost a day to buy, and where: every place some are bought at, the home hub first, as `Sold.where` says where
 * it sells (Ruling T11-7: under Either an amount is bought across both places), with `jitaUnits` the ones bought at Jita (absent:
 * all of them when Jita is the only place, else none); null with `why` when not known. `note`: why it's bought at Jita when the
 * hub supplies none (no price there, its depth not known), for the page to say.
 * `max`: the most a day the places allowed supply together (Jita's at your share of its pace, up the listings for a week; a hub's
 * up its depth), the same whatever the amount asked; past it `isk` is null and `why` says what they supply. Absent or null: no cap
 * known, and an amount refused is refused outright. `maxAt` and `maxSaid`: where that is and what holds it there, for the page
 * ("Jita", "your 10% share of the 5,773 traded a day in The Forge"; two places named together under Either).
 */
export type Bought = { isk: number | null; where: ('jita' | 'home')[] | null; why: string | null; note?: string | null; jitaUnits?: number; max?: number | null; maxAt?: string | null; maxSaid?: string | null };
/**
 * The same contract as `Sell`, the other way (Ruling T11-7): a unit's marginal cost never falls as the amount grows, so the total
 * cost is convex, and there's no fixed charge a call. So what a planet's factories buy alone is never more than their share of
 * buying with others, and a planet's value in its own amount is concave, which `lastPaying` rests on. A cheaper place that runs
 * out must hand over only the units past it, never the whole amount (`boughtOf`): handing over the whole amount makes the total
 * jump, and the planner misses the amount that pays most.
 */
export type Buy = (typeId: number, perDay: number) => Bought;
/** Units a day at a cost a unit: a place's offer, cheapest first. */
export type BuyStep = { units: number; unit: number };
/** One place's offer for a good: its steps up to its `max` (none, with `why`, when it can't be bought there), and what holds it. */
export type BuyPlace = { place: 'jita' | 'home'; at: string; steps: BuyStep[]; maxSaid: string | null; why: string | null };
const suppliesSaid = (at: string) => (at.includes(' and ') ? `${at} supply` : `${at} supplies`);
/**
 * What `perDay` units cost bought across the places given (Ruling T11-7): every place's steps taken cheapest first, each to its own
 * max, as `soldOf` sells (a tie goes to the hub), so a cheaper place that runs out hands over only the units past it and the total
 * stays convex. Past every place's max together it isn't priced, and says what they supply. Pure.
 */
export function boughtOf(perDay: number, places: BuyPlace[]): Bought {
  const offered = places.filter((p) => p.steps.some((s) => s.units > 0)).sort((a, b) => (a.place === b.place ? 0 : a.place === 'home' ? -1 : 1));
  const steps = offered.flatMap((p) => p.steps.filter((s) => s.units > 0).map((s) => ({ ...s, place: p.place })))
    .sort((a, b) => a.unit - b.unit || (a.place === b.place ? 0 : a.place === 'home' ? -1 : 1));
  const total = steps.reduce((n, s) => n + s.units, 0);
  const max = offered.length ? total : null;
  const maxAt = offered.length ? offered.map((p) => p.at).join(' and ') : null;
  const maxSaid = !offered.length ? null : offered.length === 1 ? offered[0].maxSaid : offered.map((p) => `${p.maxSaid ?? 'what it lists'} at ${p.at}`).join('; ');
  const cap = { max, maxAt, maxSaid };
  if (!offered.length || perDay > total * (1 + 1e-9)) {
    const why = [
      ...(offered.length ? [`${suppliesSaid(maxAt!)} ${perDaySaid(total)}${maxSaid ? `: ${maxSaid}` : ''}`] : []),
      ...places.filter((p) => !offered.includes(p)).map((p) => p.why).filter((w): w is string => !!w),
    ];
    return { isk: null, where: null, why: [...new Set(why)].join('; ') || 'no price read', ...cap };
  }
  if (!(perDay > 0)) return { isk: null, where: null, why: 'none wanted', ...cap };
  let left = perDay, isk = 0, jita = 0;
  const used = new Set<'jita' | 'home'>();
  for (const s of steps) {
    if (!(left > 1e-12)) break;
    const take = Math.min(left, s.units);
    isk += take * s.unit; left -= take; used.add(s.place);
    if (s.place === 'jita') jita += take;
  }
  return { isk, where: (['home', 'jita'] as const).filter((p) => used.has(p)), jitaUnits: jita, why: null, ...cap };
}
/** Units of a purchase bought at Jita: as `boughtOf` splits them, else all when Jita is the only place. */
export const boughtAtJita = (b: Bought, perDay: number) => b.jitaUnits ?? (b.where?.length === 1 && b.where[0] === 'jita' ? perDay : 0);
/** What Jita supplies of a good a day, and what a unit of `perDay` costs there before freight (null past `max`, with `why`). */
export type Supply = { avg: number | null; max: number; maxSaid: string; why: string | null };
/**
 * Buying at Jita (Ruling T11-3): a week's need bought up others' listings from the best (`asks`, your own taken off), held to your
 * share of the good's day in The Forge (`pace`, units a typical day), the share that holds what you sell. `max` is the lesser of
 * what the listings hold for a week and that share, and never depends on the amount; past it nothing is priced and `why` says
 * what Jita supplies. A unit's cost only rises with the amount (the walk goes further up the book), as `Buy`'s contract asks.
 * `pace` must be over 0 (the caller says why when it isn't). Pure.
 */
/**
 * Jita's offer as steps (Ruling T11-7): each of others' listings from the best, a day's share of it (a week's need bought up them), cut
 * where the listings' week or your share of the day ends, whichever is first; the cost a unit is the listing's price (freight is the
 * caller's, a level at a time). Pure.
 */
export function jitaSteps(asks: readonly { price: number; volume: number }[], pace: number, share: number): { steps: BuyStep[]; max: number; maxSaid: string } {
  const listed = asks.reduce((n, l) => n + Math.max(0, l.volume), 0);
  const depth = listed / 7, atShare = (pace * share) / 100;
  const max = Math.min(depth, atShare);
  const maxSaid = depth < atShare
    ? `what its best listings hold for a week (${unitsSaid(listed)} listed)`
    : `your ${plainNum(share)}% share of the ${amountSaid(pace)} traded a day in The Forge`;
  const steps: BuyStep[] = [];
  let left = max;
  for (const l of asks) {
    if (!(left > 0)) break;
    const units = Math.min(left, Math.max(0, l.volume) / 7);
    if (units > 0) steps.push({ units, unit: l.price });
    left -= units;
  }
  return { steps, max, maxSaid };
}
export function jitaSupply(asks: readonly { price: number; volume: number }[], pace: number, share: number, perDay: number): Supply {
  const listed = asks.reduce((n, l) => n + Math.max(0, l.volume), 0);
  const { max, maxSaid } = jitaSteps(asks, pace, share);
  if (!(perDay > 0)) return { avg: null, max, maxSaid, why: 'none wanted' };
  if (perDay > max * (1 + 1e-9)) return { avg: null, max, maxSaid, why: max > 0 ? `Jita supplies ${perDaySaid(max)}: ${maxSaid}` : `Jita supplies none: ${maxSaid}` };
  // Within the cap; the walk is held to what's listed, so a need at the cap to the last float still finds its price.
  let left = Math.min(7 * perDay, listed), cost = 0;
  const want = left;
  for (const l of asks) {
    const take = Math.min(left, Math.max(0, l.volume));
    cost += take * l.price; left -= take;
    if (left <= 1e-9) break;
  }
  return { avg: want > 0 ? cost / want : null, max, maxSaid, why: null };
}
export type PlanInput = {
  ix: PiIndex; planets: PlanPlanet[]; char: PlanChar; others: PlanChar[];
  rateOf: (t: PlanetType, p0: number) => Rate | null;
  sell: Sell; buy: Buy;
  /** How often you reset, as a program length in hours. */
  programHours: number;
  /** The freight route from the home hub to Jita, for the contracts a week; absent or null, none is counted. */
  freight?: Freight | null;
  /**
   * How many arrangements a setup's search may try (`SEARCH_BUDGET` when absent, `CHAIN_BUDGET` for the chain): feed and
   * chain count arrangements of planets visited, across every product and number of characters, and each one valued counts
   * `VALUED` more; bought counts assignments valued. A setup whose search ran out of it before ruling out what's left says so
   * (`Setup.cut`).
   */
  budget?: number;
};
export type SetupKind = 'p1' | 'p2' | 'feed' | 'bought' | 'chain';
/**
 * One planet's part. `extracts` is one line an extractor: its P0, the P0 an hour it's worked out at (its rate's lower
 * reading, or the factories' capacity with no rate), its heads (null when neither the rate nor the fit can say).
 */
export type Role = {
  planetId: number; charId: number; does: 'extract' | 'factory' | 'unused';
  extracts: { p0: number; perHour: number; heads: number | null; rate: Rate | null }[];
  makes: { id: number; perDay: number; facility: Facility; count: number }[];
  ships: { id: number; perDay: number; to: 'market' | number }[];
  /** A factory planet's intake: from the market (bought) or from a planet of the setup (by its ID). */
  imports?: { id: number; perDay: number; from: 'market' | number }[];
  fit: Fit | null; why: string | null;
  /**
   * When this planet's layout doesn't fit at its character's level: the lowest Command Center Upgrades level it fits at, said as
   * the skill, or null when no level does (Ruling T11-2: judged a planet at a time, so a level that fixes one is never offered for
   * another). Absent or null when it fits, or when what fits isn't checked (`fit` null).
   */
  lacks?: string | null;
};
/** A good the setup makes, summed over its planets and sold in one go, so two planets share one market's cap; what doesn't sell builds up. */
export type Output = { id: number; perDay: number; sold: Sold; buildingUp: number };
/**
 * A setup's work a week. `restocksPerWeek`: a factory planet's launchpad emptied and refilled, on what's brought in and what's
 * made together (the launchpad holds both), summed over the factory planets. `haulM3PerWeek` goes from the planets to market,
 * `jitaM3PerWeek` of it on to Jita; `inM3PerWeek` comes from market to the factory planets (bought only), `jitaInM3PerWeek` of
 * it bought at Jita. `contractsPerWeek` and `contractsInPerWeek` are freight contracts a week each way, a week's batch in one, or
 * under one a week when a week's m³ is short of the route's minimum: at 1, one contract a week at the least, more if one can't
 * carry it (no contract's size is known). Null with no freight route given.
 */
export type Upkeep = {
  resetsPerWeek: number; restocksPerWeek: number; haulM3PerWeek: number; jitaM3PerWeek: number; contractsPerWeek: number | null;
  inM3PerWeek: number; jitaInM3PerWeek: number; contractsInPerWeek: number | null;
};
export type Setup = {
  kind: SetupKind;
  /** On each rate's lower reading; before what `before` lists. A chain's is per character in it: `perChar`'s mean. */
  iskDay: number | null;
  /** The same arrangement on each rate's higher reading; null when every rate used is checked. A chain's per character. */
  iskDayHigh: number | null;
  before: ('tax' | 'extraction' | 'price')[];
  /** Null when any planet's tax isn't known. */
  taxDay: number | null;
  /** What each 1% of customs tax costs a day on the planets whose tax isn't known (ranked before it); 0 when every tax is known. */
  perPct: number;
  taxes: { planetId: number; tier: Tier; perDay: number | null }[];
  outputs: Output[];
  /** What the factory planets buy (bought only): summed per good, bought once. */
  inputs: { id: number; perDay: number; bought: Bought }[];
  roles: Role[];
  upkeep: Upkeep;
  /**
   * Each character's ISK a day and what it still needs for its roles. A chain's share is the whole's by colonies; when it's
   * short of characters, the ones it has and any Alpha that could make it up (lacking Omega), with no figure.
   */
  perChar: { charId: number; iskDay: number | null; lacks: string[] }[];
  /** Outputs whose price isn't read: counted out of the ISK, never as 0. */
  unvalued: number;
  why: string | null;
  /** The search ran out of its budget before it could rule out a better arrangement: this is the best of those tried. */
  cut?: true;
};

const EPS = 1e-9;
const HOURS_A_WEEK = 168;
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const TIERS_DOWN: Tier[] = ['P4', 'P3', 'P2', 'P1', 'P0'];
export const NO_PI = 'No planetary industry on this kind of planet';
export const NO_SKILLS = 'Skills not read';
export const ALPHA_NO_PI = 'Alphas can’t do planetary industry';
export const NO_PI_HERE = 'No planet here has planetary industry';

/** Units an hour a schematic takes or makes per factory, from its cycle. */
const anHour = (s: Schematic, qty: number) => (qty * 3600) / s.cycleSeconds;
const atCcu = (level: number) => (level > 0 ? `at Command Center Upgrades ${ROMAN[level]}` : 'without Command Center Upgrades');
const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** "1-day", or "47.5-hour" for a program that isn't whole days. */
const programSaid = (h: number) => (h % 24 === 0 ? `${h / 24}-day` : `${plainNum(h)}-hour`);
const chosenSaid = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${plainNum(h)} hours`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The Basic schematic refining each P0, by the P0. */
const basicsOf = new WeakMap<PiIndex, Map<number, Schematic>>();
function basicFor(ix: PiIndex, p0: number): Schematic | null {
  let m = basicsOf.get(ix);
  if (!m) {
    m = new Map();
    for (const s of ix.schematics) if (s.facility === 'basic' && s.inputs.length === 1) m.set(s.inputs[0].id, s);
    basicsOf.set(ix, m);
  }
  return m.get(p0) ?? null;
}
const aloneOf = new WeakMap<PiIndex, Map<PlanetType, number[]>>();
function p2Alone(ix: PiIndex, t: PlanetType): number[] {
  let m = aloneOf.get(ix);
  if (!m) aloneOf.set(ix, m = new Map());
  let xs = m.get(t);
  if (!xs) m.set(t, xs = madeAlone(ix, t).P2);
  return xs;
}

/** One extractor feeding its Basic factories. */
type Line = { p0: number; p1: number; rate: Rate | null; perHour: number; basics: number; p1PerHour: number; heads: number | null };
function lineOf(b: Schematic, rate: Rate | null, high: boolean): Line {
  const inH = anHour(b, b.inputs[0].qty), outH = anHour(b, b.out.qty);
  // With no rate, the two Basics the 2 + 4 layout gives each P0 (12,000 P0 an hour), said as such, never claimed.
  const perHour = rate ? (high && rate.higher != null ? rate.higher : rate.perHour) : 2 * inH;
  return {
    p0: b.inputs[0].id, p1: b.out.id, rate, perHour,
    basics: Math.max(0, Math.ceil(perHour / inH - EPS)), p1PerHour: (perHour * outH) / inH,
    // A rate's heads are what it was measured with; 0 means the colony didn't say (Ruling T8-1).
    heads: rate && rate.heads > 0 ? Math.ceil(rate.heads) : null,
  };
}

/** One planet's arrangement before it's fitted: its extractors, its factories and what it ships. */
type Plan = {
  planet: PlanPlanet; at: number; t: PlanetType; product: number;
  lines: Line[];
  advanced: { id: number; count: number; perHour: number } | null;
  ships: { id: number; perDay: number }[];
};

/** P0 → P2: two extractors at their rates, the Basics per P0 ceil(P0 an hour ÷ 6,000), the Advanced ceil(the lesser P1 an hour ÷ 40); a surplus P1 is shipped. */
function planP2(input: PlanInput, planet: PlanPlanet, at: number, t: PlanetType, p2: number, high: boolean): Plan | null {
  const s = input.ix.makes.get(p2);
  if (!s) return null;
  const lines: Line[] = [];
  for (const i of s.inputs) {
    const b = input.ix.makes.get(i.id);
    if (!b || b.facility !== 'basic') return null;
    lines.push(lineOf(b, input.rateOf(t, b.inputs[0].id), high));
  }
  // The Advanced factories' worth the lines feed: the lesser input, as a fraction of factories (one runs fewer cycles when short).
  const runs = Math.min(...s.inputs.map((inp, k) => lines[k].p1PerHour / anHour(s, inp.qty)));
  const perHour = runs * anHour(s, s.out.qty);
  const ships = [{ id: p2, perDay: perHour * 24 }];
  s.inputs.forEach((inp, k) => {
    const left = lines[k].p1PerHour - runs * anHour(s, inp.qty);
    if (left > 1e-6) ships.push({ id: lines[k].p1, perDay: left * 24 });
  });
  return { planet, at, t, product: p2, lines, advanced: { id: p2, count: Math.max(0, Math.ceil(runs - EPS)), perHour }, ships };
}

/** P0 → P1: two extractors on two of the planet's P0s, each feeding its Basics; both P1s shipped. */
function planP1(input: PlanInput, planet: PlanPlanet, at: number, t: PlanetType, pair: [number, number], high: boolean): Plan | null {
  const lines: Line[] = [];
  for (const p0 of pair) {
    const b = basicFor(input.ix, p0);
    if (!b) return null;
    lines.push(lineOf(b, input.rateOf(t, p0), high));
  }
  // `product` names the first P1 only: a P0 → P1 plan is replanned from its lines' P0s.
  return { planet, at, t, product: lines[0].p1, lines, advanced: null, ships: lines.map((l) => ({ id: l.p1, perDay: l.p1PerHour * 24 })) };
}

function plansFor(input: PlanInput, planet: PlanPlanet, at: number, kind: 'p1' | 'p2', high: boolean): Plan[] {
  const t = planet.type;
  if (!t) return [];
  const out: Plan[] = [];
  if (kind === 'p2') {
    for (const p2 of p2Alone(input.ix, t)) { const p = planP2(input, planet, at, t, p2, high); if (p) out.push(p); }
  } else {
    // Two extractors on two different P0s, every pair the planet has.
    const p0s = input.ix.planetTypes[t].p0;
    for (let i = 0; i < p0s.length; i++) for (let j = i + 1; j < p0s.length; j++) {
      const p = planP1(input, planet, at, t, [p0s[i], p0s[j]], high);
      if (p) out.push(p);
    }
  }
  return out;
}

/** The same planet and product, on the other reading of its rates. */
function replan(input: PlanInput, p: Plan, kind: 'p1' | 'p2', high: boolean): Plan {
  const again = kind === 'p2'
    ? planP2(input, p.planet, p.at, p.t, p.product, high)
    : planP1(input, p.planet, p.at, p.t, [p.lines[0].p0, p.lines[1].p0], high);
  return again ?? p;
}

type Ship = { id: number; perDay: number };

/** Export tax per tier on what a planet exports: units × the tier's base × the planet's rate (null when its rate isn't known). */
function exportTax(input: PlanInput, p: Plan, exported: Ship[]): TaxRow[] {
  return taxRows(input.ix, exported, p.planet.tax.rate, 1);
}

/** Customs per tier: units × the tier's base × `factor` (1 to export, ½ to import), times the rate; null when it isn't known. */
type TaxRow = { tier: Tier; base: number; perDay: number | null };
function taxRows(ix: PiIndex, ships: Ship[], rate: number | null, factor: number): TaxRow[] {
  const byTier = new Map<Tier, number>();
  for (const s of ships) {
    const c = ix.byId.get(s.id);
    if (!c || !(s.perDay > 0)) continue;
    byTier.set(c.tier, (byTier.get(c.tier) ?? 0) + s.perDay * c.taxBase * factor);
  }
  return TIERS_DOWN.filter((t) => byTier.has(t)).map((tier) => {
    const base = byTier.get(tier)!;
    return { tier, base, perDay: rate == null ? null : base * rate };
  });
}

/** One `sell` per good and amount: the search asks again for amounts it has already asked about. */
function seller(sell: Sell) {
  const cache = new Map<string, Sold>();
  return (id: number, perDay: number): Sold => {
    const k = `${id}:${perDay}`;
    let s = cache.get(k);
    if (!s) cache.set(k, s = sell(id, perDay));
    return s;
  };
}
type Seller = (id: number, q: number) => Sold;

/** A set of planets' plans, worked out: each good summed and sold once, what each planet exports, and the ISK after the known tax. */
type Assessed = { plans: Plan[]; outputs: Output[]; exports: Ship[][]; value: number; unpriced: number };

const bySlot = (plans: Plan[]) => [...plans].sort((a, b) => a.at - b.at);

/**
 * Each good is summed over the planets and sold once, so two planets share one market's cap. What the market takes is
 * exported from the planets with the lowest known tax first (then the one listed first; a tax not known last); the rest
 * stays on its planet, building up, and pays no export tax. A good with no price is taken as all exported: nothing says
 * how much of it would build up.
 */
function assess(input: PlanInput, plansIn: Plan[], sold: Seller): Assessed {
  const plans = bySlot(plansIn);
  const totals = new Map<number, number>();
  for (const p of plans) for (const s of p.ships) totals.set(s.id, (totals.get(s.id) ?? 0) + s.perDay);
  const tierAt = (id: number) => TIERS_DOWN.indexOf(input.ix.byId.get(id)?.tier ?? 'P0');
  const outputs: Output[] = [...totals.entries()]
    .sort((a, b) => tierAt(a[0]) - tierAt(b[0]) || a[0] - b[0])
    .map(([id, perDay]) => {
      const s = sold(id, perDay);
      // A good with no price says why; nothing is claimed to build up for it.
      return { id, perDay, sold: s, buildingUp: s.isk == null ? 0 : Math.max(0, perDay - s.units) };
    });
  const exports: Ship[][] = plans.map(() => []);
  const taxOrder = plans.map((p, k) => k).sort((a, b) => {
    const ra = plans[a].planet.tax.rate, rb = plans[b].planet.tax.rate;
    return (ra ?? Infinity) - (rb ?? Infinity) || plans[a].at - plans[b].at;
  });
  for (const o of outputs) {
    let left = o.perDay - o.buildingUp;
    for (const k of taxOrder) {
      const made = plans[k].ships.find((s) => s.id === o.id)?.perDay ?? 0;
      if (!(made > 0)) continue;
      const out = Math.min(made, Math.max(0, left));
      left -= out;
      exports[k].push({ id: o.id, perDay: out });
    }
  }
  let value = outputs.reduce((t, o) => t + (o.sold.isk ?? 0), 0);
  plans.forEach((p, k) => { for (const t of exportTax(input, p, exports[k])) value -= t.perDay ?? 0; });
  return { plans, outputs, exports, value, unpriced: outputs.filter((o) => o.sold.isk == null).length };
}

/** Within a hundredth of an ISK is the same: sums of the same figures in another order differ by rounding. */
const SAME_ISK = 0.01;
const better = (a: Assessed, b: Assessed | null) =>
  !b || a.value > b.value + SAME_ISK || (Math.abs(a.value - b.value) <= SAME_ISK && a.unpriced < b.unpriced);

/**
 * The planets that pay most, up to the character's allowance. First, step by step, the planet and product adding most to
 * the setup so far (a good two planets make shares one market's cap), after the known tax; an output with no price adds
 * nothing to the ranking, never a figure; ties go to the planet listed first, then the first product. Then `improve`.
 */
function choose(input: PlanInput, kind: 'p1' | 'p2', allowed: number, sold: Seller): Plan[] {
  const options = input.planets.map((p, at) => plansFor(input, p, at, kind, false));
  let chosen: Plan[] = [];
  const used = new Set<number>();
  while (chosen.length < allowed) {
    let best: Assessed | null = null, pick: Plan | null = null;
    for (let at = 0; at < options.length; at++) {
      if (used.has(at)) continue;
      for (const p of options[at]) {
        const a = assess(input, [...chosen, p], sold);
        if (better(a, best)) { best = a; pick = p; }
      }
    }
    if (!pick) break;
    chosen = bySlot([...chosen, pick]);
    used.add(pick.at);
  }
  return improve(input, options, chosen, sold);
}

/** At most this many improving moves: each strictly gains, so the search ends anyway; the bound keeps a re-rank quick. */
const MAX_MOVES = 50;

/**
 * Taking planets one at a time can lock in a pick a later planet would have done better: Ice takes Test Cultures, the only
 * dear P2 both it and Temperate make, and Temperate is left with a cheap one, where Ice on another dear P2 and Temperate on
 * Test Cultures pays more. So each chosen planet's product is picked again, and each planet not used is tried in place of
 * each chosen one; when the new pick makes a good another chosen planet makes, that planet's product is picked again with
 * it. The first move that gains is taken, until none does.
 */
function improve(input: PlanInput, options: Plan[][], start: Plan[], sold: Seller): Plan[] {
  let now = assess(input, start, sold);
  const tryMove = (): Assessed | null => {
    const cur = now.plans;
    const usedAt = new Set(cur.map((p) => p.at));
    for (let i = 0; i < cur.length; i++) {
      for (let at = 0; at < options.length; at++) {
        if (at !== cur[i].at && usedAt.has(at)) continue;
        for (const q of options[at]) {
          if (q === cur[i]) continue;
          const next = cur.slice();
          next[i] = q;
          const a = assess(input, next, sold);
          if (better(a, now)) return a;
          const goods = new Set(q.ships.map((s) => s.id));
          for (let j = 0; j < cur.length; j++) {
            if (j === i || !cur[j].ships.some((s) => goods.has(s.id))) continue;
            for (const r of options[cur[j].at]) {
              if (r === cur[j]) continue;
              const both = next.slice();
              both[j] = r;
              const b = assess(input, both, sold);
              if (better(b, now)) return b;
            }
          }
        }
      }
    }
    return null;
  };
  for (let n = 0; n < MAX_MOVES; n++) {
    const a = tryMove();
    if (!a) break;
    now = a;
  }
  return now.plans;
}

/** Fit the plan at the character's CCU level and the planet's own radius; the heads a rate didn't give are the most that fit. */
function fitted(input: PlanInput, p: Plan, cc: number): { heads: (number | null)[]; fit: Fit | null; notes: string[]; lacks: string | null } {
  const { ix } = input;
  const notes: string[] = [];
  const base: Omit<Layout, 'heads'> = { ecus: p.lines.length, basic: p.lines.reduce((n, l) => n + l.basics, 0), advanced: p.advanced?.count ?? 0, hightech: 0, storage: 0, launchpads: 1 };
  const heads = p.lines.map((l) => l.heads);
  const r = p.planet.radiusKm;
  if (r == null || !(r > 0)) {
    notes.push('this planet’s size isn’t known, so what fits isn’t checked');
    return { heads, fit: null, notes, lacks: null };
  }
  if (p.lines.some((l) => l.rate && !(l.rate.heads > 0))) notes.push('the colony didn’t say how many heads its extractors had: the most that fit');
  const unknown = heads.map((h, i) => (h == null ? i : -1)).filter((i) => i >= 0);
  if (unknown.length) {
    const most = maxHeads(ix, p.t, cc, base, r);
    if (most < 0) {
      const fit = fitOf(ix, p.t, cc, { ...base, heads: heads.reduce<number>((n, h) => n + (h ?? 0), 0) }, r);
      notes.push(`this layout doesn’t fit ${atCcu(cc)}`);
      return { heads, fit, notes, lacks: lacksFor(input, p, cc, base, r, heads) };
    }
    let free = Math.max(0, most - heads.reduce<number>((n, h) => n + (h ?? 0), 0));
    unknown.forEach((i, k) => {
      const share = Math.min(ix.maxHeads, Math.ceil(free / (unknown.length - k)));
      heads[i] = share;
      free -= share;
    });
  }
  const total = heads.reduce<number>((n, h) => n + (h ?? 0), 0);
  const fit = fitOf(ix, p.t, cc, { ...base, heads: total }, r);
  if (!fit.fits) notes.push(`these heads don’t fit ${atCcu(cc)}`);
  return { heads, fit, notes, lacks: fit.fits ? null : lacksFor(input, p, cc, base, r, heads) };
}

/**
 * The lowest Command Center Upgrades level the layout fits at, when one above the character's would. An extractor whose
 * heads aren't known counts one: an extractor with none extracts nothing, so a level that fits it bare says too little.
 */
function lacksFor(input: PlanInput, p: Plan, cc: number, base: Omit<Layout, 'heads'>, r: number, heads: (number | null)[]): string | null {
  const total = heads.reduce<number>((n, h) => n + Math.max(1, h ?? 1), 0);
  return levelFor(input.ix, p.t, cc, { ...base, heads: total }, r);
}

/** The lowest Command Center Upgrades level above `cc` at which the layout fits, said as the skill; null when none does. */
function levelFor(ix: PiIndex, t: PlanetType, cc: number, l: Layout, r: number): string | null {
  for (let lv = cc + 1; lv < ix.planetTypes[t].cc.length; lv++) {
    if (fitOf(ix, t, lv, l, r).fits) return `Command Center Upgrades ${ROMAN[lv]}`;
  }
  return null;
}

/** What a role says about its rates: from another program length, another P0, or none (ranked at the factories' capacity). */
function rateNotes(input: PlanInput, p: Plan): string[] {
  const notes: string[] = [];
  const name = (id: number) => input.ix.byId.get(id)?.name ?? `#${id}`;
  const none = p.lines.filter((l) => !l.rate);
  if (none.length) notes.push(`no rate for ${listSaid(none.map((l) => name(l.p0)))}: ranked at what the factories make if your extractors deliver ${unitsSaid(none[0].perHour)} P0 an hour each`);
  const other = [...new Set(p.lines.filter((l) => l.rate && Math.abs(l.rate.programHours - input.programHours) > EPS).map((l) => l.rate!.programHours))].sort((a, b) => a - b);
  if (other.length) notes.push(`rates from ${listSaid(other.map(programSaid))} programs: you chose ${chosenSaid(input.programHours)}, and nothing says what another length gives`);
  const others = p.lines.filter((l) => l.rate?.otherP0);
  if (others.length) notes.push(`${listSaid(others.map((l) => name(l.p0)))} at the rate learned for another P0 of ${p.t} planets`);
  return notes;
}

const unusedRole = (p: PlanPlanet, charId: number, why: string): Role =>
  ({ planetId: p.planetId, charId, does: 'unused', extracts: [], makes: [], ships: [], fit: null, why });

function blocked(input: PlanInput, kind: SetupKind, why: string, lacks: string[]): Setup {
  return {
    kind, iskDay: null, iskDayHigh: null, before: [], taxDay: null, perPct: 0, taxes: [], outputs: [], inputs: [],
    roles: input.planets.map((p) => unusedRole(p, input.char.charId, p.type ? why : NO_PI)),
    upkeep: { resetsPerWeek: 0, restocksPerWeek: 0, haulM3PerWeek: 0, jitaM3PerWeek: 0, contractsPerWeek: null, inM3PerWeek: 0, jitaInM3PerWeek: 0, contractsInPerWeek: null },
    perChar: [{ charId: input.char.charId, iskDay: null, lacks }], unvalued: 0, why,
  };
}

/** Units of a sale that go to Jita: as `soldOf` splits them, else all when Jita is the only place. */
const jitaUnits = (s: Sold) => s.jitaUnits ?? (s.where.length === 1 && s.where[0] === 'jita' ? s.units : 0);

/**
 * Upkeep: a reset a planet each program; m³ a week hauled to market and the share sold at Jita; m³ a week brought in to the
 * factory planets (bought) and the share bought at Jita; freight contracts a week each way, batched up to the route's minimum
 * (5 M at 900 ISK a m³ is worth paying on about 5,556 m³), else a week's batch in one: 1 is the least, not a count.
 */
export function upkeepOf(input: PlanInput, outputs: Output[], planets: number, restocksPerWeek = 0, bought: Setup['inputs'] = []): Upkeep {
  const vol = (id: number) => input.ix.byId.get(id)?.volume ?? 0;
  // Shipped to market: what sells (all of a good with no price); what builds up stays on its planet.
  const haul = outputs.reduce((t, o) => t + (o.perDay - o.buildingUp) * vol(o.id) * 7, 0);
  const jita = outputs.reduce((t, o) => t + jitaUnits(o.sold) * vol(o.id) * 7, 0);
  const inM3 = bought.reduce((t, i) => t + i.perDay * vol(i.id) * 7, 0);
  const jitaIn = bought.reduce((t, i) => t + boughtAtJita(i.bought, i.perDay) * vol(i.id) * 7, 0);
  const f = input.freight;
  const batch = f && f.min != null && f.min > 0 && f.perM3 > 0 ? f.min / f.perM3 : null;
  const contracts = (m3: number) => (!f ? null : !(m3 > 0) ? 0 : batch != null ? m3 / Math.max(batch, m3) : 1);
  return {
    resetsPerWeek: input.programHours > 0 ? (planets * HOURS_A_WEEK) / input.programHours : 0,
    restocksPerWeek, haulM3PerWeek: haul, jitaM3PerWeek: jita, contractsPerWeek: contracts(jita),
    inM3PerWeek: inM3, jitaInM3PerWeek: jitaIn, contractsInPerWeek: contracts(jitaIn),
  };
}

/** The skills a character's planets rest on, by CCP's static data (build 3569502): Interplanetary Consolidation, Command Center Upgrades, Customs Code Expertise. */
export const PI_SKILL = { consolidation: 2495, ccu: 2505, customs: 33467 } as const;
/** Skills read: absent before the main's first sync, an empty map in an alt's copy before the cloud's first read. */
const skillsRead = (s: Record<number, number> | undefined): s is Record<number, number> => !!s && Object.keys(s).length > 0;
/**
 * Whose setup, from a character's skills and clone state: 1 + Interplanetary Consolidation planets, Command Center Upgrades for
 * the fits. Skills not read are null, never level 0; once read, a skill missing from them was never injected, and is 0. Alpha
 * only when known: a clone state not read is null, worked out as Omega and said by the page.
 */
export function planCharOf(c: { charId: number; name: string; skills: Record<number, number> | undefined; clone: 'alpha' | 'omega' | 'unknown' }): PlanChar {
  const read = skillsRead(c.skills);
  return {
    charId: c.charId, name: c.name,
    planets: read ? 1 + (c.skills![PI_SKILL.consolidation] ?? 0) : null,
    ccLevel: read ? c.skills![PI_SKILL.ccu] ?? 0 : null,
    alpha: c.clone === 'alpha' ? true : c.clone === 'omega' ? false : null,
  };
}
/** Customs Code Expertise's level (a high-sec player office's NPC part), or null while the skills aren't read. */
export const customsLevel = (skills: Record<number, number> | undefined): number | null => (skillsRead(skills) ? skills[PI_SKILL.customs] ?? 0 : null);

/** Why a character can't plan at all, or null. */
export function charWhy(c: PlanChar): string | null {
  if (c.alpha === true) return ALPHA_NO_PI;
  if (c.planets == null || c.ccLevel == null || !(c.planets > 0)) return NO_SKILLS;
  return null;
}

/**
 * The user's own setups, one planet at a time: P0 → P2 (each planet makes the best P2 it can alone) or P0 → P1 (each
 * planet refines the pair of P0s that pays most). Every planet of the system has a role; the ones not used say why.
 */
export function planSingle(input: PlanInput, kind: 'p1' | 'p2'): Setup {
  const { char } = input;
  const cw = charWhy(char);
  if (cw) return blocked(input, kind, cw, char.alpha === true ? ['Omega'] : []);
  if (!input.planets.some((p) => p.type)) return blocked(input, kind, NO_PI_HERE, []);
  const cc = char.ccLevel!, allowed = char.planets!;
  const sold = seller(input.sell);
  const now = assess(input, choose(input, kind, allowed, sold), sold);
  const { plans, outputs } = now;
  const name = (id: number) => input.ix.byId.get(id)?.name ?? `#${id}`;

  const byPlanet = new Map(plans.map((p, k) => [p.planet.planetId, k]));
  const lacks = new Set<string>();
  const roles = input.planets.map((planet): Role => {
    if (!planet.type) return unusedRole(planet, char.charId, NO_PI);
    const k = byPlanet.get(planet.planetId);
    if (k == null) return unusedRole(planet, char.charId, allowed === 1 ? 'Your 1 planet goes to one that pays more' : `Your ${allowed} planets go to ones that pay more`);
    const p = plans[k], exported = now.exports[k];
    const f = fitted(input, p, cc);
    if (f.lacks) lacks.add(f.lacks);
    // What the market doesn't take stays on the planet, building up, and pays no export tax.
    const stays = p.ships
      .map((s) => ({ id: s.id, perDay: s.perDay - (exported.find((e) => e.id === s.id)?.perDay ?? 0) }))
      .filter((s) => s.perDay > 1e-6)
      .map((s) => `${unitsSaid(s.perDay)} ${name(s.id)}`);
    const notes = [...rateNotes(input, p), ...f.notes,
      ...(stays.length ? [`${listSaid(stays)} a day stay on the planet, building up: the market takes no more, so they aren’t exported or taxed`] : [])];
    return {
      planetId: planet.planetId, charId: char.charId, does: 'extract',
      extracts: p.lines.map((l, i) => ({ p0: l.p0, perHour: l.perHour, heads: f.heads[i], rate: l.rate })),
      makes: [
        ...p.lines.map((l) => ({ id: l.p1, perDay: l.p1PerHour * 24, facility: 'basic' as const, count: l.basics })),
        ...(p.advanced ? [{ id: p.advanced.id, perDay: p.advanced.perHour * 24, facility: 'advanced' as const, count: p.advanced.count }] : []),
      ],
      ships: exported.filter((s) => s.perDay > 1e-6).map((s) => ({ id: s.id, perDay: s.perDay, to: 'market' as const })),
      fit: f.fit,
      why: notes.length ? notes.map(cap).join('. ') : null,
      lacks: f.fit && !f.fit.fits ? f.lacks : null,
    };
  });

  const taxes: Setup['taxes'] = [];
  let perPctBase = 0;
  plans.forEach((p, k) => { for (const t of exportTax(input, p, now.exports[k])) {
    taxes.push({ planetId: p.planet.planetId, tier: t.tier, perDay: t.perDay });
    if (t.perDay == null) perPctBase += t.base;
  } });
  const taxKnown = taxes.every((t) => t.perDay != null);
  const unvalued = outputs.filter((o) => o.sold.isk == null).length;
  const iskDay = now.value;

  // The higher reading: the same planets and products, sized to it.
  const anyHigher = plans.some((p) => p.lines.some((l) => l.rate?.higher != null));
  let iskDayHigh: number | null = null;
  if (anyHigher) {
    const high = plans.map((p) => replan(input, p, kind, true));
    iskDayHigh = assess(input, high, sold).value;
  }

  const before: Setup['before'] = [];
  if (!taxKnown) before.push('tax');
  if (plans.some((p) => p.lines.some((l) => !l.rate))) before.push('extraction');
  if (unvalued) before.push('price');

  return {
    kind, iskDay, iskDayHigh, before,
    taxDay: taxKnown ? taxes.reduce((t, x) => t + x.perDay!, 0) : null,
    perPct: perPctBase / 100,
    taxes, outputs, inputs: [], roles,
    upkeep: upkeepOf(input, outputs, plans.length),
    perChar: [{ charId: char.charId, iskDay, lacks: [...lacks].sort() }],
    unvalued, why: null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The second half: factory planets. Extraction planets feeding one factory planet (feed), factory planets on bought
// inputs (bought), and the chains that need more planets than one character has (chain); then the ranking of all five.

/** Below this, a factory makes nothing (units a day): sums of the same shipments in another order differ by rounding. */
const MIN_RATE = 1e-9;
const byRate = (a: number | null, b: number | null) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a - b);

/** What a good's first unit fetches, net: the most a unit can add, for the search's bounds (0 when it has no price). */
function unitNet(sold: Seller, id: number): number {
  const s = sold(id, 1);
  return s.isk != null && s.units > 0 ? Math.max(0, s.isk / s.units) : 0;
}

/** Planets alike in what a setup on them is worth: one PI type and one customs rate. A planet's size changes only what fits. */
type Member = { planet: PlanPlanet; at: number };
type Cls = { t: PlanetType; rate: number | null; members: Member[] };
function classesOf(input: PlanInput, keyOf: (p: PlanPlanet, t: PlanetType) => string | null = (p, t) => `${t}|${p.tax.rate ?? '?'}`): Cls[] {
  const out: Cls[] = [];
  const byKey = new Map<string, Cls>();
  input.planets.forEach((planet, at) => {
    const t = planet.type;
    if (!t) return;
    const key = keyOf(planet, t);
    if (key == null) return;
    let c = byKey.get(key);
    if (!c) { byKey.set(key, c = { t, rate: planet.tax.rate, members: [] }); out.push(c); }
    c.members.push({ planet, at });
  });
  return out;
}

/** Where a class's factory goes: the planet whose size is known and smallest (shorter links, more fits), else the first. */
function factoryMember(c: Cls): Member {
  const sized = c.members.filter((m) => m.planet.radiusKm != null && m.planet.radiusKm > 0);
  return sized.length ? sized.reduce((a, b) => (b.planet.radiusKm! < a.planet.radiusKm! ? b : a)) : c.members[0];
}

/**
 * What a factory planet makes X from, per unit of X: the P1s it takes directly (a P2's inputs, a P4's P1), the P2s under it
 * (made there from P1, or shipped in already made), and a P4's P3s (always made there). Units per unit of X are the
 * schematics' quantities over their outputs, so the cycle times drop out; `perFactory` is what one factory makes an hour.
 */
type Tree = {
  x: number; facility: Facility; perFactory: number;
  alpha: Map<number, number>;
  p2: Map<number, { beta: number; inputs: Map<number, number>; perFactory: number }>;
  p3: Map<number, { per: number; perFactory: number }>;
  kinds: number[];
};
function treeOf(ix: PiIndex, x: number): Tree | null {
  const s = ix.makes.get(x), c = ix.byId.get(x);
  if (!s || !c || !(c.tier === 'P2' || c.tier === 'P3' || c.tier === 'P4')) return null;
  const tierOf = (id: number) => ix.byId.get(id)?.tier;
  const tree: Tree = { x, facility: s.facility, perFactory: anHour(s, s.out.qty), alpha: new Map(), p2: new Map(), p3: new Map(), kinds: [] };
  const addP2 = (g: number, beta: number): boolean => {
    const gs = ix.makes.get(g);
    if (!gs) return false;
    let e = tree.p2.get(g);
    if (!e) {
      const inputs = new Map<number, number>();
      for (const i of gs.inputs) { if (tierOf(i.id) !== 'P1') return false; inputs.set(i.id, i.qty / gs.out.qty); }
      tree.p2.set(g, e = { beta: 0, inputs, perFactory: anHour(gs, gs.out.qty) });
    }
    e.beta += beta;
    return true;
  };
  for (const i of s.inputs) {
    const per = i.qty / s.out.qty, ti = tierOf(i.id);
    if (ti === 'P1') tree.alpha.set(i.id, (tree.alpha.get(i.id) ?? 0) + per);
    else if (ti === 'P2') { if (!addP2(i.id, per)) return null; }
    else if (ti === 'P3') {
      const s3 = ix.makes.get(i.id);
      if (!s3) return null;
      tree.p3.set(i.id, { per: (tree.p3.get(i.id)?.per ?? 0) + per, perFactory: anHour(s3, s3.out.qty) });
      for (const j of s3.inputs) if (tierOf(j.id) !== 'P2' || !addP2(j.id, (per * j.qty) / s3.out.qty)) return null;
    } else return null;
  }
  const kinds = new Set(tree.alpha.keys());
  for (const e of tree.p2.values()) for (const k of e.inputs.keys()) kinds.add(k);
  tree.kinds = [...kinds].sort((a, b) => a - b);
  return tree;
}

/** One P1 the factory takes: α R directly, and per × max(0, β R − the P2 shipped in) through each P2 it goes into (indices into the goods). */
type KindEq = { k: number; alpha: number; terms: { per: number; beta: number; g: number }[] };
const demandOf = (eq: KindEq, S: Float64Array, R: number) => {
  let d = eq.alpha * R;
  for (const t of eq.terms) d += t.per * Math.max(0, t.beta * R - S[t.g]);
  return d;
};
/** The most X a day this P1 allows: where its demand, piecewise linear and rising in R, meets what's shipped of it. */
function limitOf(eq: KindEq, S: Float64Array): number {
  const have = S[eq.k];
  let lo = 0;
  for (;;) {
    // On (lo, hi), a P2 draws on this P1 once its shipments are used up (at or below lo); hi is the next to run out.
    let slope = eq.alpha, at = eq.alpha * lo, hi = Infinity;
    for (const t of eq.terms) {
      const out = S[t.g] / t.beta;
      if (out <= lo) { slope += t.per * t.beta; at += t.per * (t.beta * lo - S[t.g]); } else if (out < hi) hi = out;
    }
    if (slope > 0) {
      const R = lo + (have - at) / slope;
      if (R <= hi) return Math.max(lo, R);
    } else if (hi === Infinity) return Infinity;
    lo = hi;
  }
}

/** One way a planet of a class can feed the factory: its plan, what it ships a day by good, and that at each good's first unit's net. */
type Feeder = { cls: number; plan: Plan; ships: Float64Array; market: number; worth: number; eqs: number[] };
type FedCtx = {
  input: PlanInput; sold: Seller; tree: Tree; classes: Cls[];
  goods: number[]; eqs: KindEq[]; p2: { g: number; id: number; beta: number; perFactory: number }[];
  feeders: Feeder[];
  /** For each P1 the factory takes, the feeders that ship it or a P2 made of it, the most first. */
  byEq: number[][];
  /** What each feeder relieves of each P1 (P1 units a day, a P2 shipped counted by its P1), and the P1 one X takes of each. */
  relieves: Float64Array[]; perX: Float64Array;
  /**
   * For the bounds: X's first unit's net, the least the goods making one X fetch, per class the most a feeder ships of each
   * good and is worth after its export tax, and the classes in order of each.
   */
  pX: number; cmin: number; topShip: Float64Array[]; topMarket: number[]; byMarket: number[]; byShip: number[][];
  /** Per class the most a feeder is worth by its units' potential (see `boundFed`), and the classes in that order. */
  topWorth: number[]; byWorth: number[];
  /** The feeders in order of their class's tax, the lowest first: who exports first. */
  byTax: number[];
  /** Each good's customs base a unit; two scratch arrays for the search. */
  base: Float64Array; buf: Float64Array; spare: Float64Array;
};

const rateOfS = (ctx: FedCtx, S: Float64Array) => {
  let R = Infinity;
  for (const eq of ctx.eqs) R = Math.min(R, limitOf(eq, S));
  return R === Infinity || !(R > MIN_RATE) ? 0 : R;
};
const sumShips = (ctx: FedCtx, counts: Int32Array) => {
  const S = new Float64Array(ctx.goods.length);
  counts.forEach((n, i) => { if (n) for (let g = 0; g < S.length; g++) S[g] += n * ctx.feeders[i].ships[g]; });
  return S;
};

/** What the line's P1 would fetch alone, after its export tax: how the second extractor of a feeder is chosen. */
function lineNet(ix: PiIndex, sold: Seller, l: Line, rate: number | null): number {
  const s = sold(l.p1, l.p1PerHour * 24);
  return s.isk == null ? -Infinity : s.isk - s.units * (ix.byId.get(l.p1)?.taxBase ?? 0) * (rate ?? 0);
}

/**
 * The feeders that can make X here. Each is one of a class's P0 → P1 plans with an extractor on a P1 X takes, or a P2 X takes
 * made alone. A planet's second extractor is on a P0 the factory doesn't take only when that's all it has left, and then
 * on the one that pays most alone (plans alike for the factory differ only in that). Null when some P1 X takes no planet ships.
 */
function fedCtx(input: PlanInput, sold: Seller, classes: Cls[], x: number): FedCtx | null {
  const { ix } = input;
  const tree = treeOf(ix, x);
  if (!tree) return null;
  const goods: number[] = [...tree.kinds, ...tree.p2.keys()];
  const gi = new Map(goods.map((g, i) => [g, i]));
  const kinds = new Set(tree.kinds);
  const raw: { cls: number; plan: Plan }[] = [];
  classes.forEach((c, ci) => {
    const m = c.members[0];
    const keep = new Map<string, { plan: Plan; other: number }>();
    for (const p of plansFor(input, m.planet, m.at, 'p1', false)) {
      const useful = p.lines.filter((l) => kinds.has(l.p1));
      if (!useful.length) continue;
      const key = useful.map((l) => l.p0).join(',');
      const other = p.lines.filter((l) => !kinds.has(l.p1)).reduce((n, l) => n + lineNet(ix, sold, l, c.rate), 0);
      const held = keep.get(key);
      if (!held || other > held.other) keep.set(key, { plan: p, other });
    }
    for (const k of keep.values()) raw.push({ cls: ci, plan: k.plan });
    if (tree.p2.size) for (const p of plansFor(input, m.planet, m.at, 'p2', false)) if (tree.p2.has(p.product)) raw.push({ cls: ci, plan: p });
  });
  for (const r of raw) for (const s of r.plan.ships) if (!gi.has(s.id)) { gi.set(s.id, goods.length); goods.push(s.id); }
  const unit = Float64Array.from(goods, (g) => unitNet(sold, g));
  const eqs: KindEq[] = tree.kinds.map((k) => ({
    k: gi.get(k)!, alpha: tree.alpha.get(k) ?? 0,
    terms: [...tree.p2.entries()].filter(([, e]) => e.inputs.has(k)).map(([g, e]) => ({ per: e.inputs.get(k)!, beta: e.beta, g: gi.get(g)! })),
  }));
  const relief = (ships: Float64Array, eq: KindEq) => ships[eq.k] + eq.terms.reduce((n, t) => n + ships[t.g] * t.per, 0);
  // A unit's share of X: its P1 content (1 for a P1 X takes, a P2's inputs for a P2 X takes) over all the P1 one X takes.
  const content = new Float64Array(goods.length);
  for (const k of tree.kinds) content[gi.get(k)!] = 1;
  for (const [g, e] of tree.p2) content[gi.get(g)!] = [...e.inputs.values()].reduce((n, x) => n + x, 0);
  const allP1 = eqs.reduce((n, eq) => n + eq.alpha + eq.terms.reduce((m, t) => m + t.per * t.beta, 0), 0);
  const pX = unitNet(sold, x);
  const all: Feeder[] = raw.map(({ cls, plan }) => {
    const ships = new Float64Array(goods.length);
    for (const s of plan.ships) ships[gi.get(s.id)!] += s.perDay;
    // What it ships at each good's first unit's net, after its export tax: what's shipped is exported, to market or the factory.
    const rate = classes[cls].rate ?? 0;
    let market = 0, worth = 0;
    for (let g = 0; g < goods.length; g++) {
      const net = Math.max(0, unit[g] - (ix.byId.get(goods[g])?.taxBase ?? 0) * rate);
      market += ships[g] * net;
      worth += ships[g] * Math.max(net, allP1 > 0 ? (pX * content[g]) / allP1 : 0);
    }
    return { cls, plan, ships, market, worth, eqs: eqs.map((eq, e) => (relief(ships, eq) > 0 ? e : -1)).filter((e) => e >= 0) };
  });
  // A feeder that ships exactly what another of its class ships adds no arrangement of its own (counts of the two are counts of
  // one), so it's dropped. Nothing looser: one that ships more of every good can make another feeder unneeded, or ship a good
  // nobody prices (exported and taxed all the same), so it doesn't always do better under the needed rule.
  const shipped = new Set<string>();
  const feeders = all.filter((f) => { const k = `${f.cls}|${f.ships.join(',')}`; return !shipped.has(k) && !!shipped.add(k); });
  const byEq = eqs.map((eq, e) => feeders.map((f, i) => (f.eqs.includes(e) ? i : -1)).filter((i) => i >= 0)
    .sort((a, b) => relief(feeders[b].ships, eq) - relief(feeders[a].ships, eq) || a - b));
  if (byEq.some((xs) => !xs.length)) return null;
  let cmin = 0;
  for (const [k, a] of tree.alpha) cmin += a * unit[gi.get(k)!];
  for (const [g, e] of tree.p2) {
    let make = 0;
    for (const [k, per] of e.inputs) make += per * unit[gi.get(k)!];
    cmin += e.beta * Math.min(unit[gi.get(g)!], make);
  }
  const topShip = classes.map(() => new Float64Array(goods.length)), topMarket = classes.map(() => 0), topWorth = classes.map(() => 0);
  for (const f of feeders) {
    topMarket[f.cls] = Math.max(topMarket[f.cls], f.market);
    topWorth[f.cls] = Math.max(topWorth[f.cls], f.worth);
    for (let g = 0; g < goods.length; g++) topShip[f.cls][g] = Math.max(topShip[f.cls][g], f.ships[g]);
  }
  const order = (v: (ci: number) => number) => classes.map((_, ci) => ci).filter((ci) => v(ci) > 0).sort((a, b) => v(b) - v(a) || a - b);
  return {
    input, sold, tree, classes, goods, eqs, feeders, byEq,
    relieves: feeders.map((f) => Float64Array.from(eqs, (eq) => relief(f.ships, eq))),
    perX: Float64Array.from(eqs, (eq) => eq.alpha + eq.terms.reduce((m, t) => m + t.per * t.beta, 0)),
    p2: [...tree.p2.entries()].map(([id, e]) => ({ g: gi.get(id)!, id, beta: e.beta, perFactory: e.perFactory })),
    pX, cmin, topShip, topMarket, topWorth,
    byMarket: order((ci) => topMarket[ci]), byShip: goods.map((_, g) => order((ci) => topShip[ci][g])), byWorth: order((ci) => topWorth[ci]),
    byTax: feeders.map((_, i) => i).sort((a, b) => byRate(classes[feeders[a].cls].rate, classes[feeders[b].cls].rate) || a - b),
    base: Float64Array.from(goods, (g) => ix.byId.get(g)?.taxBase ?? 0), buf: new Float64Array(goods.length), spare: new Float64Array(goods.length),
  };
}

/** The same feeders on the higher reading of their rates. */
const highCtx = (ctx: FedCtx): FedCtx => {
  const gi = new Map(ctx.goods.map((g, i) => [g, i]));
  return {
    ...ctx, feeders: ctx.feeders.map((f) => {
      const ships = new Float64Array(ctx.goods.length);
      for (const s of replan(ctx.input, f.plan, f.plan.advanced ? 'p2' : 'p1', true).ships) {
        const g = gi.get(s.id);
        if (g != null) ships[g] += s.perDay;
      }
      return { ...f, ships };
    }),
  };
};

/** How good an arrangement is, in order: more ISK a day, fewer outputs without a price, less upkeep (resets and restocks a week). */
type Score = { value: number; unpriced: number; upkeep: number };
const beats = (a: Score, b: Score | null) => !b || a.value > b.value + SAME_ISK
  || (Math.abs(a.value - b.value) <= SAME_ISK && (a.unpriced < b.unpriced || (a.unpriced === b.unpriced && a.upkeep < b.upkeep - 1e-9)));

/**
 * Whether arrangements an upper bound of `bound` ISK covers may still beat the best: by more ISK, or at the same ISK with less
 * upkeep (what they reset already is the least they can; each feeder added resets too). So a tie isn't cut off unseen.
 */
const mayBeat = (bound: number, upkeepAtLeast: number, best: Score) =>
  bound > best.value + SAME_ISK || (bound >= best.value - SAME_ISK && upkeepAtLeast < best.upkeep - 1e-9);
const resets = (input: PlanInput, colonies: number) => (input.programHours > 0 ? (colonies * HOURS_A_WEEK) / input.programHours : 0);

/** Whose planets a setup may use, in order: the shown character first. */
type Who = { c: PlanChar; cap: number; cc: number };
type Placed = { factory: { member: Member; char: number }; feeders: { item: number; member: Member; char: number }[] };

/** An arrangement worked out: what the factory makes, what each feeder ships where, the taxes, the score. */
type FedValue = {
  /** R is what the feeders allow a day; `run` what the factory makes, no more than its market takes when X is priced. */
  score: Score; R: number; run: number; used: Float64Array; soldX: Sold;
  surplus: { g: number; perDay: number; sold: Sold }[];
  toFactory: Float64Array[]; toMarket: Float64Array[];
  feederTax: TaxRow[][]; factoryTax: TaxRow[];
  made: { id: number; perDay: number; facility: Facility; count: number }[];
  layout: Layout; fitsAtV: boolean | null; restocks: number;
};

const factoriesFor = (perDay: number, perFactoryHour: number) => Math.max(0, Math.ceil(perDay / 24 / perFactoryHour - EPS));
const mergeRows = (rows: TaxRow[]): TaxRow[] => TIERS_DOWN.filter((t) => rows.some((r) => r.tier === t)).map((tier) => {
  const of = rows.filter((r) => r.tier === tier);
  return { tier, base: of.reduce((n, r) => n + r.base, 0), perDay: of.some((r) => r.perDay == null) ? null : of.reduce((n, r) => n + r.perDay!, 0) };
});

/** What the factory makes a day: what its feeders allow, no more than the market takes when X is priced (as bought runs). */
function runOf(ctx: FedCtx, R: number): { run: number; soldX: Sold } {
  const atR = ctx.sold(ctx.tree.x, R);
  if (atR.isk == null || !(atR.units < R)) return { run: R, soldX: atR };
  const run = Math.max(0, atR.units);
  return { run, soldX: ctx.sold(ctx.tree.x, run) };
}

/**
 * An arrangement's worth. The factory makes what its market takes, no more than its feeders allow (`runOf`), and takes what
 * that needs; every other unit a feeder ships goes to market from its planet, summed per good and sold once. What's
 * exported (to the factory, or to market and sold) leaves the lowest-tax feeders first and pays their export tax; the
 * factory pays import tax at half its rate on what it takes, and export tax on what it makes. What doesn't sell stays where
 * it was made, untaxed. The search asks only for the score; `detail` adds what each feeder ships where and the tax rows,
 * which a setup shows.
 */
function valueFed(ctx: FedCtx, counts: Int32Array, f: number, S: Float64Array, R: number, detail = false): FedValue {
  const { input, sold, tree, goods, classes, feeders } = ctx;
  const { ix } = input;
  const G = goods.length;
  const { run, soldX } = runOf(ctx, R);
  const used = new Float64Array(G);
  for (const eq of ctx.eqs) used[eq.k] = Math.min(S[eq.k], demandOf(eq, S, run));
  for (const p of ctx.p2) used[p.g] = Math.min(S[p.g], p.beta * run);
  const surplus: FedValue['surplus'] = [];
  for (let g = 0; g < G; g++) {
    const left = S[g] - used[g];
    if (left > 1e-6) surplus.push({ g, perDay: left, sold: sold(goods[g], left) });
  }
  // A good with no price is taken as all exported: nothing says how much of it would build up.
  const toSell = new Float64Array(G);
  for (const s of surplus) toSell[s.g] = s.sold.isk == null ? s.perDay : Math.min(s.perDay, s.sold.units);
  const fRate = classes[f].rate;
  const xSold = soldX.isk == null ? 0 : soldX.units;
  let value = soldX.isk ?? 0;
  for (const s of surplus) value += s.sold.isk ?? 0;
  // The feeders in the arrangement, the lowest tax first (walking every feeder for every good was most of the time on twenty
  // planets at their own rates).
  const present: number[] = [];
  for (const i of ctx.byTax) if (counts[i] > 0) present.push(i);
  for (let g = 0; g < G; g++) {
    let left = used[g] + toSell[g];
    for (const i of present) {
      if (!(left > 0)) break;
      const have = counts[i] * feeders[i].ships[g];
      if (!(have > 0)) continue;
      const a = Math.min(have, left);
      left -= a;
      const r = classes[feeders[i].cls].rate;
      if (r != null) value -= a * ctx.base[g] * r;
    }
    if (fRate != null) value -= used[g] * ctx.base[g] * 0.5 * fRate;
  }
  if (fRate != null) value -= xSold * (ix.byId.get(tree.x)?.taxBase ?? 0) * fRate;

  const made: FedValue['made'] = [];
  for (const p of ctx.p2) {
    const m = p.beta * run - S[p.g];
    if (m > 1e-6) made.push({ id: p.id, perDay: m, facility: 'advanced', count: factoriesFor(m, p.perFactory) });
  }
  for (const [id, e] of tree.p3) made.push({ id, perDay: e.per * run, facility: 'advanced', count: factoriesFor(e.per * run, e.perFactory) });
  made.push({ id: tree.x, perDay: run, facility: tree.facility, count: factoriesFor(run, tree.perFactory) });
  const layout: Layout = {
    ecus: 0, heads: 0, basic: 0, storage: 0, launchpads: 1,
    advanced: made.filter((m) => m.facility === 'advanced').reduce((n, m) => n + m.count, 0),
    hightech: made.filter((m) => m.facility === 'hightech').reduce((n, m) => n + m.count, 0),
  };
  const t = classes[f].t, r = factoryMember(classes[f]).planet.radiusKm;
  const fitsAtV = r == null || !(r > 0) ? null : fitOf(ix, t, ix.planetTypes[t].cc.length - 1, layout, r).fits;
  // The factory planet's launchpad holds what its planets bring and what it makes (Ruling T11-4): a visit on both.
  let m3 = run * (ix.byId.get(tree.x)?.volume ?? 0) * 7, colonies = 0;
  for (let g = 0; g < G; g++) m3 += used[g] * (ix.byId.get(goods[g])?.volume ?? 0) * 7;
  for (let i = 0; i < counts.length; i++) colonies += counts[i];
  const restocks = m3 / ix.planetTypes[t].pins.launchpad.capacity;
  const unpriced = surplus.filter((s) => s.sold.isk == null).length + (soldX.isk == null ? 1 : 0);
  const v: FedValue = { score: { value, unpriced, upkeep: resets(input, colonies) + restocks }, R, run, used, soldX, surplus, toFactory: [], toMarket: [], feederTax: [], factoryTax: [], made, layout, fitsAtV, restocks };
  if (!detail) return v;

  // Each feeder's part, in the same order: what's exported leaves the lowest tax first, a class's feeders one after another;
  // what each exports goes to the factory and to market in the same proportion (which doesn't change the tax), so every
  // feeder shows its part of what the factory takes.
  const inst: number[] = [];
  counts.forEach((n, i) => { for (let k = 0; k < n; k++) inst.push(i); });
  const order = inst.map((_, k) => k).sort((a, b) => byRate(classes[feeders[inst[a]].cls].rate, classes[feeders[inst[b]].cls].rate) || a - b);
  v.toFactory = inst.map(() => new Float64Array(G));
  v.toMarket = inst.map(() => new Float64Array(G));
  for (let g = 0; g < G; g++) {
    const out = used[g] + toSell[g];
    if (!(out > 0)) continue;
    let left = out;
    for (const k of order) {
      const have = feeders[inst[k]].ships[g];
      if (!(have > 0) || !(left > 0)) continue;
      const a = Math.min(have, left);
      left -= a;
      v.toFactory[k][g] = (a * used[g]) / out;
      v.toMarket[k][g] = a - v.toFactory[k][g];
    }
  }
  const shipsOf = (a: Float64Array, b?: Float64Array): Ship[] => goods.map((id, g) => ({ id, perDay: a[g] + (b ? b[g] : 0) })).filter((x) => x.perDay > 0);
  v.feederTax = inst.map((i, k) => taxRows(ix, shipsOf(v.toFactory[k], v.toMarket[k]), classes[feeders[i].cls].rate, 1));
  v.factoryTax = mergeRows([...taxRows(ix, shipsOf(used), fRate, 0.5), ...taxRows(ix, [{ id: tree.x, perDay: xSold }], fRate, 1)]);
  return v;
}

/** Every feeder is needed: without any one of them the factory makes less. A planet that only sells its own P1 isn't feeding. */
function allNeeded(ctx: FedCtx, counts: Int32Array, S: Float64Array, R: number): boolean {
  const tmp = ctx.spare;
  for (let i = 0; i < counts.length; i++) {
    if (!counts[i]) continue;
    for (let g = 0; g < S.length; g++) tmp[g] = Math.max(0, S[g] - ctx.feeders[i].ships[g]);
    if (rateOfS(ctx, tmp) >= R * (1 - 1e-9)) return false;
  }
  return true;
}

/**
 * Colonies on planets and characters. Each class's feeders go to the planets of the class with fewest colonies, at most one
 * a character on a planet. The factory goes to the first character, from the shown one, at whose own Command Center Upgrades
 * level it fits (else the shown one); each feeder, the planets with most colonies first, to a character with room that has
 * none there, one it fits at its own level before one with merely more room. When putting fit first leaves a colony
 * nowhere, room alone decides (the most first), which places whatever can be. Null when they don't fit the characters' planets.
 */
function placeFed(ctx: FedCtx, counts: Int32Array, f: number, who: Who[], layout?: Layout): Placed | null {
  const { input } = ctx;
  const K = who.length;
  const fm = factoryMember(ctx.classes[f]);
  const load = new Map<number, number>([[fm.at, 1]]);
  const feeders: { item: number; member: Member }[] = [];
  for (let i = 0; i < counts.length; i++) {
    const c = ctx.classes[ctx.feeders[i].cls];
    for (let k = 0; k < counts[i]; k++) {
      let pick: Member | null = null;
      for (const m of c.members) if ((load.get(m.at) ?? 0) < K && (!pick || (load.get(m.at) ?? 0) < (load.get(pick.at) ?? 0))) pick = m;
      if (!pick) return null;
      load.set(pick.at, (load.get(pick.at) ?? 0) + 1);
      feeders.push({ item: i, member: pick });
    }
  }
  const order = feeders.map((_, k) => k).sort((a, b) => (load.get(feeders[b].member.at)! - load.get(feeders[a].member.at)!) || feeders[a].member.at - feeders[b].member.at || a - b);
  // Whether a colony fits at a character's own level (a planet whose size isn't known isn't checked, so it counts as fitting).
  const fitMemo = new Map<string, boolean>();
  const feederFits = (k: number, c: number) => {
    const key = `${k}:${c}`;
    let ok = fitMemo.get(key);
    if (ok == null) {
      const plan = remake(input, ctx.feeders[feeders[k].item].plan, feeders[k].member);
      fitMemo.set(key, ok = fitted(input, plan, who[c].cc).fit?.fits !== false);
    }
    return ok;
  };
  const r = fm.planet.radiusKm;
  const factoryFits = (c: number) => !layout || r == null || !(r > 0) || fitOf(input.ix, fm.planet.type!, who[c].cc, layout, r).fits;
  const assign = (fitFirst: boolean): Placed | null => {
    const room = who.map((w) => w.cap);
    let fc = 0;
    if (fitFirst) { const c = who.findIndex((w, i) => w.cap > 0 && factoryFits(i)); if (c >= 0) fc = c; }
    room[fc] -= 1;
    if (room[fc] < 0) return null;
    const on = new Map<number, Set<number>>([[fm.at, new Set([fc])]]);
    const charOf: number[] = [];
    for (const k of order) {
      const at = feeders[k].member.at;
      const there = on.get(at) ?? new Set<number>();
      let best = -1, bestFits = false;
      for (let c = 0; c < K; c++) {
        if (there.has(c) || room[c] <= 0) continue;
        const fits = fitFirst && feederFits(k, c);
        if (best < 0 || (fits && !bestFits) || (fits === bestFits && room[c] > room[best])) { best = c; bestFits = fits; }
      }
      if (best < 0) return null;
      room[best]--; there.add(best); on.set(at, there); charOf[k] = best;
    }
    return { factory: { member: fm, char: fc }, feeders: feeders.map((x, k) => ({ ...x, char: charOf[k] })) };
  };
  return assign(true) ?? assign(false);
}

type FedBest = { ctx: FedCtx; f: number; counts: Int32Array; score: Score; who: Who[]; placed: Placed };

/**
 * An upper bound on what any arrangement adding at most `m` more feeders can be worth, the lower of two (taxes beyond each
 * feeder's export and caps only take away; a first unit's net is the most any unit adds):
 * - every unit shipped at its net after its feeder's export tax, plus X's margin over the cheapest goods making it times the
 *   most X the best feeders left could allow (or, when X is worth less than its goods, times what it makes already: it only grows);
 * - every unit at the better of its net and its share of X: X's net times its P1 content over all the P1 one X takes. A unit
 *   either sells or goes into X, and X a day is at most the P1 content shipped over what one X takes.
 */
function boundFed(ctx: FedCtx, counts: Int32Array, S: Float64Array, R: number, caps: number[], m: number): number {
  let worth = 0;
  for (let i = 0; i < counts.length; i++) if (counts[i]) worth += counts[i] * ctx.feeders[i].worth;
  let w = m;
  for (const ci of ctx.byWorth) {
    if (!w) break;
    const k = Math.min(w, caps[ci]);
    worth += k * ctx.topWorth[ci]; w -= k;
  }
  return Math.min(worth, boundByMargin(ctx, counts, S, R, caps, m));
}
function boundByMargin(ctx: FedCtx, counts: Int32Array, S: Float64Array, R: number, caps: number[], m: number): number {
  let total = 0;
  for (let i = 0; i < counts.length; i++) if (counts[i]) total += counts[i] * ctx.feeders[i].market;
  let left = m;
  for (const ci of ctx.byMarket) {
    if (!left) break;
    const k = Math.min(left, caps[ci]);
    total += k * ctx.topMarket[ci]; left -= k;
  }
  const d = ctx.pX - ctx.cmin;
  // X worth less than its goods: what the factory makes only grows as feeders are added (R does, and what sells of more never
  // falls: the `Sell` contract), so what it makes now is the least it can.
  if (!(d > 0)) return total + d * runOf(ctx, R).run;
  const S2 = ctx.buf;
  for (let g = 0; g < S2.length; g++) {
    S2[g] = S[g];
    let l = m;
    for (const ci of ctx.byShip[g]) {
      if (!l) break;
      const k = Math.min(l, caps[ci]);
      S2[g] += k * ctx.topShip[ci][g]; l -= k;
    }
  }
  return total + d * rateOfS(ctx, S2);
}

/**
 * The arrangements the feed's and bought's searches may try when `PlanInput.budget` doesn't say. Measured on 18 October 2026:
 * the heaviest realistic systems tried (every P2 to P4 priced, up to 20 planets each at its own customs rate, three
 * characters) took at most about 250 ms a setup and 25 MB; without it, one took a minute or ran out of memory.
 */
export const SEARCH_BUDGET = 40_000;
/**
 * The chain's, twice the others': it searches every P4 and every P3 that needs more than one character, for one character
 * and for each number of them, so its products share more. On 65 random Brave systems of 5-9 planets (two characters of 5),
 * at 40,000 arrangements 18 read more than 2% under the best found and 3 more than 25%; at 80,000, 13 and 1. The heaviest
 * cases measured on 18 October 2026 (twenty planets at their own rates, three characters of 6) take about 450 ms at it.
 */
export const CHAIN_BUDGET = 80_000;
/**
 * What working out an arrangement's ISK (at each place its factory could go) costs the budget besides the visit, so the
 * budget follows a search's time rather than only the arrangements it visits. Where nearly every arrangement is worth
 * valuing (twenty planets at their own rates, three characters of 6) the chain took 918 ms at 80,000 visits; charged two,
 * 437 ms, with the same figure. On the 65 random systems one more read over 2% short (13, not 12).
 */
const VALUED = 2;
/** What a covering search (does a product need more planets than one character has?) may try, for each product. */
const COVER_BUDGET = 4000;

/** A search's allowance, shared by every product and number of characters a setup tries; `cut` once it ran out too soon. */
type Budget = { left: number; cut: boolean };

/**
 * The weight each feeder adds to an arrangement's key: deterministic, whole numbers under 2^38, so a key (the weights of the
 * feeders in it, summed) stays an exact integer, kept as a number rather than a string. Two different arrangements share a
 * key only if their weights happen to sum alike: about one chance in 2^38 a pair.
 */
const keyWeights = (n: number) => {
  let x = 0x9e3779b9;
  const next = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return x >>> 0; };
  return Float64Array.from({ length: n }, () => ((next() % 262144) * 1048576) + (next() % 1048576) + 1);
};

/**
 * What a pool of searches found. `tried` once any arrangement had every feeder needed; `tooBig` while every such arrangement
 * failed only because its factory doesn't fit even at the top level (so that, and nothing else, is why none was found).
 */
type Searched = { b: FedBest | null; tried: boolean; tooBig: boolean };
const searched = (): Searched => ({ b: null, tried: false, tooBig: true });

/**
 * A product's search, picked up where it left off; `remaining` bounds what any arrangement it hasn't ruled out could be worth,
 * and `round` is the round it is in (`ROUNDS`).
 */
type Run = { it: Generator<void, void, void>; remaining: () => number; round: number; done: boolean };

/**
 * Each round of a product's search: how many departures from the dive it allows, and how many of an arrangement's children
 * it follows where departures are left (the dive's own and the next in order; the rest wait for a later round). The dive
 * alone; two and then four departures among the first three children; four among them all; then any (a whole depth-first
 * search, so a search let finish rules out nothing the bounds don't). Measured on 18 October 2026:
 * - **the narrow rounds first**: on twenty planets at their own rates, a round of two departures over every child took more
 *   than 30,000 arrangements for one product without finishing, and the chain read 11,655,648 a character, where the narrow
 *   rounds find 19,508,928;
 * - **the wide round after them**: on 65 random Brave systems of 5-9 planets (two characters of 5), the narrow rounds alone
 *   left 15 short of the best found by more than 2% and 3 by more than 25%, against 13 and 1 with it;
 * - **rounds of two and four departures, not one, two, three…**: each round walks again what the last walked (before the
 *   widths, on the review's six-planet system at varied prices, 0, 1, 2, 4 read 12,162,240 at 40,000 arrangements where 0, 2,
 *   4 read 16,748,160).
 */
const ROUNDS: { departures: number; width: number }[] = [
  { departures: 0, width: 1 },
  { departures: 2, width: 3 },
  { departures: 4, width: 3 },
  { departures: 4, width: Infinity },
  { departures: Infinity, width: Infinity },
];
/** How a visit is stored: its round's width (Infinity as 999) and the departures it had left (at most 999). */
const coverOf = (width: number, d: number) => Math.min(width, 999) * 1000 + Math.min(d, 999);

/**
 * The best arrangement of feeders for X: every arrangement the rules allow in which each feeder is needed, found by adding at
 * each step a feeder of the P1 the factory runs short of first (any arrangement whose feeders are all needed can be built
 * that way), each arrangement once. An arrangement an upper bound says can't beat the best so far isn't followed. The
 * factory goes where its own taxes are least: the first class with room whose rate is known, the lowest first, or one whose
 * rate isn't known, ranked before its tax (as on every planet whose tax isn't known); its class changes nothing else. It
 * yields once an arrangement visited, so a caller can share a budget between products and pick each up where it left off,
 * and takes `VALUED` off that budget for each arrangement it values.
 * `remaining` is the highest bound among the children not finished on its path (each child's, the lower of its parent's
 * bound and its own worth bound) and those a round left for the next; `root` until the search starts.
 */
function searchFed(ctx: FedCtx, who: Who[], best: Searched, root: number, budget: Budget): Run {
  const { feeders, classes, eqs } = ctx;
  const K = who.length;
  const slots = who.reduce((n, w) => n + w.cap, 0) - 1;
  const caps = classes.map((c) => c.members.length * K);
  const sites = factoryClasses(ctx);
  const G = ctx.goods.length;
  const counts = new Int32Array(feeders.length), S = new Float64Array(G);
  const weight = keyWeights(feeders.length);
  // An arrangement's key → how it was last visited (`coverOf`): one visited as wide or wider, with as many departures left or
  // more, covers it.
  const seen = new Map<number, number>();
  let key = 0, worth = 0, started = false;
  // Per depth on the path: the children's bounds in the order they're visited, as maxima from each on, and the one being visited.
  const frames: Float64Array[] = [], at: number[] = [];
  // The highest bound among the subtrees this round left for a later one (`limited` once any was), and the last round's.
  let deferred = -Infinity, carried = root, limited = false, round = 0, width = 1;
  const consider = (R: number, n: number) => {
    // The bound with nothing added is this arrangement's own: what can't beat the best isn't worked out.
    if (best.b && !mayBeat(boundFed(ctx, counts, S, R, caps, 0), resets(ctx.input, n), best.b.score)) return;
    if (!allNeeded(ctx, counts, S, R)) return;
    // A later site of the same kind (rate known, or not) is worth no more, so the first that places decides for its kind; one
    // that can't beat the best already found decides too, without placing.
    let known = false, unknown = false, tooBig = false, other = false;
    for (const f of sites) {
      const blind = classes[f].rate == null;
      if (caps[f] <= 0 || (blind ? unknown : known)) continue;
      budget.left -= VALUED;
      const v = valueFed(ctx, counts, f, S, R);
      if (v.fitsAtV === false) { tooBig = true; continue; }
      if (beats(v.score, best.b?.score ?? null)) {
        const placed = placeFed(ctx, counts, f, who, v.layout);
        if (!placed) { other = true; continue; }
        best.b = { ctx, f, counts: counts.slice(), score: v.score, who, placed };
      }
      if (blind) unknown = true; else known = true;
      if (known && unknown) break;
    }
    if (!known && !unknown) {
      best.tried = true;
      if (!tooBig || other) best.tooBig = false;
    }
  };
  // What this arrangement's subtree could be worth by the units' potential alone, with feeder i added and m more to come.
  const worthWith = (i: number, m: number) => {
    const c = feeders[i].cls;
    caps[c]--;
    let t = worth + feeders[i].worth, left = m;
    for (const ci of ctx.byWorth) {
      if (!left) break;
      const k = Math.min(left, caps[ci]);
      t += k * ctx.topWorth[ci]; left -= k;
    }
    caps[c]++;
    return t;
  };
  const lim = new Float64Array(eqs.length);
  function* visit(n: number, d: number): Generator<void, void, void> {
    const had = seen.get(key), now = coverOf(width, d);
    if (had != null && Math.floor(had / 1000) >= Math.floor(now / 1000) && had % 1000 >= now % 1000) return;
    seen.set(key, now);
    yield;
    let low = Infinity;
    for (let k = 0; k < eqs.length; k++) { lim[k] = limitOf(eqs[k], S); if (lim[k] < low) low = lim[k]; }
    const R = low === Infinity || !(low > MIN_RATE) ? 0 : low;
    if (R > 0 && had == null) consider(R, n);
    if (n >= slots) return;
    const ub = boundFed(ctx, counts, S, R, caps, slots - n);
    if (best.b && !mayBeat(ub, resets(ctx.input, n), best.b.score)) return;
    // The P1 the factory runs short of first; of those, the one fewest feeders can ship.
    let e = -1, fewest = Infinity;
    for (let k = 0; k < eqs.length; k++) {
      if (lim[k] > low * (1 + 1e-12) + 1e-12) continue;
      let sup = 0;
      for (const i of ctx.byEq[k]) if (caps[feeders[i].cls] > 0) sup++;
      if (sup < fewest) { fewest = sup; e = k; }
    }
    if (e < 0 || !fewest) return;
    // The feeders of that P1, the one that would raise what the factory makes most first (each P1's limit, plus what the
    // feeder ships of it over what one X takes, the least of them), so a first dive pairs what's short with what's short.
    const raises = (i: number) => {
      let r = Infinity;
      for (let k = 0; k < eqs.length; k++) r = Math.min(r, lim[k] + ctx.relieves[i][k] / ctx.perX[k]);
      return r;
    };
    if (d === 0) {
      // No departures left: only the first of them is followed (the first listed of those that raise it most, as the sort
      // below would put first), and the rest are left for a later round at this arrangement's own bound, without working
      // out each one's (on twenty planets at their own rates, under an earlier round schedule, working them out took the chain
      // 843 ms, not 514).
      let first = -1, top = -Infinity, rest = false;
      for (const i of ctx.byEq[e]) {
        if (caps[feeders[i].cls] <= 0) continue;
        const r = raises(i);
        if (r > top) { rest ||= first >= 0; top = r; first = i; } else rest = true;
      }
      if (rest) { limited = true; deferred = Math.max(deferred, ub); }
      const own = Math.min(ub, worthWith(first, slots - n - 1));
      if (best.b && !mayBeat(own, resets(ctx.input, n + 1), best.b.score)) return;
      const fd = feeders[first];
      frames.push(Float64Array.of(own)); at.push(0);
      counts[first]++; caps[fd.cls]--; key += weight[first]; worth += fd.worth;
      for (let g = 0; g < G; g++) S[g] += fd.ships[g];
      yield* visit(n + 1, 0);
      counts[first]--; caps[fd.cls]++; key -= weight[first]; worth -= fd.worth;
      for (let g = 0; g < G; g++) { S[g] -= fd.ships[g]; if (Math.abs(S[g]) < 1e-9) S[g] = 0; }
      frames.pop(); at.pop();
      return;
    }
    const next = ctx.byEq[e].filter((i) => caps[feeders[i].cls] > 0);
    const after = new Map<number, number>();
    for (const i of next) after.set(i, raises(i));
    next.sort((a, b) => after.get(b)! - after.get(a)!);
    const own = Float64Array.from(next, (i) => Math.min(ub, worthWith(i, slots - n - 1)));
    const from = Float64Array.from(own);
    for (let j = from.length - 2; j >= 0; j--) from[j] = Math.max(from[j], from[j + 1]);
    frames.push(from); at.push(0);
    for (let j = 0; j < next.length; j++) {
      at[at.length - 1] = j;
      // The first child is the dive's own choice; any other is a departure from it, and a round allows d of them (d is at
      // least 1 here: with none left, only the first is followed, above), among its first `width` children. What a round
      // leaves, a later one takes, so its bound is carried until then.
      if (j >= width) { limited = true; deferred = Math.max(deferred, from[j]); break; }
      // A child whose bound can't beat the best isn't visited (the visit would rule it out on a tighter bound anyway).
      if (best.b && !mayBeat(own[j], resets(ctx.input, n + 1), best.b.score)) continue;
      const i = next[j], fd = feeders[i];
      counts[i]++; caps[fd.cls]--; key += weight[i]; worth += fd.worth;
      for (let g = 0; g < G; g++) S[g] += fd.ships[g];
      yield* visit(n + 1, j > 0 ? d - 1 : d);
      counts[i]--; caps[fd.cls]++; key -= weight[i]; worth -= fd.worth;
      for (let g = 0; g < G; g++) { S[g] -= fd.ships[g]; if (Math.abs(S[g]) < 1e-9) S[g] = 0; }
    }
    frames.pop(); at.pop();
  }
  // The dive first, then every arrangement a few departures from it (limited discrepancy search, `ROUNDS`): a better
  // arrangement that needs an early choice changed comes long before a depth-first search would back up to it, when every
  // child's bound ties. A round that left nothing out searched everything, and the search ends; the last round allows any
  // number of departures (d − 1 of Infinity is Infinity), so it never leaves anything out.
  const run: Run = {
    it: (function* () {
      started = true;
      for (let r = 0; r < ROUNDS.length; r++) {
        round = r; width = ROUNDS[r].width;
        limited = false; deferred = -Infinity;
        yield* visit(0, ROUNDS[r].departures);
        if (!limited) return;
        carried = deferred;
      }
    })(),
    remaining: () => {
      if (run.done) return -Infinity;
      if (!started) return root;
      let m = Math.max(deferred, frames.length ? -Infinity : carried);
      for (let k = 0; k < frames.length; k++) m = Math.max(m, frames[k][at[k]]);
      return m;
    },
    get round() { return round; },
    done: false,
  };
  return run;
}

/** Arrangements the open product with the best remaining bound is given before the bounds are compared again. */
const CHUNK = 128;

/** The classes X's factory can go on: any for Advanced factories, Barren and Temperate for High-Tech; the lowest tax first. */
const factoryClasses = (ctx: FedCtx) => ctx.classes.map((c, ci) => ci)
  .filter((ci) => ctx.tree.facility !== 'hightech' || ctx.input.ix.planetTypes[ctx.classes[ci].t].pins.hightech != null)
  .sort((a, b) => byRate(ctx.classes[a].rate, ctx.classes[b].rate) || a - b);

/** One set of characters' search over its products: its best is its own, compared on the whole arrangement's ISK. */
type Pool = { ctxs: FedCtx[]; who: Who[]; best: Searched };

/**
 * Every pool's products searched within one budget, best first within a round: again and again, of the open products in
 * the earliest round of departures (`ROUNDS`), the one whose remaining bound (per character in its pool, so pools of different
 * sizes compare) is highest gets the next chunk of arrangements; a product whose remaining bound can't beat its pool's best
 * found is closed. A product that could still beat it when the budget runs out marks the budget cut.
 *
 * Not by the bound alone: a product's bound fills its planets with their best feeders whether or not its factory can use or
 * place them, and it stays at the root's for most of a search (it did through all 40,000 arrangements on each of the
 * re-review's random systems that went wrong). Given the budget by bound alone, the loosest product took all of it. Searched
 * a round per departure, as before 18 October 2026, on eight planets (scripts/fixtures/planets-sample.json, OLGTLLGI)
 * Nano-Factory took all 40,000 arrangements and the chain read 11,809,359 a character, where 2 million arrangements find
 * 16,245,784; on five (OIILI) Sterile Conduits, whose arrangements never place, took them all and the chain found nothing.
 * With today's rounds and budget the eight planets still read 11,815,445 by bound alone. So every open product has its dive
 * before any has a second round, and so on. On 65 random systems at the chain's budget it left 13 short of the best found by
 * more than 2%, the bound alone 15, and 1 by more than 25% (the bound alone 2).
 */
function searchPools(pools: Pool[], budget: Budget): void {
  type Live = { run: Run; pool: Pool; per: number; closed: boolean };
  const live: Live[] = [];
  for (const pool of pools) {
    const slots = pool.who.reduce((n, w) => n + w.cap, 0) - 1;
    for (const ctx of pool.ctxs) {
      const caps = ctx.classes.map((c) => c.members.length * pool.who.length);
      const root = boundFed(ctx, new Int32Array(ctx.feeders.length), new Float64Array(ctx.goods.length), 0, caps, slots);
      live.push({ run: searchFed(ctx, pool.who, pool.best, root, budget), pool, per: pool.who.length, closed: false });
    }
  }
  const open = (l: Live) => {
    if (l.run.done || l.closed) return false;
    if (l.pool.best.b && !mayBeat(l.run.remaining(), 0, l.pool.best.b.score)) l.closed = true;
    return !l.closed;
  };
  while (budget.left > 0) {
    let pick: Live | null = null, round = Infinity, top = -Infinity;
    for (const l of live) {
      if (!open(l)) continue;
      const p = l.run.remaining() / l.per;
      // Bounds within a cent are a tie, and a tie goes to the product listed first, so which of several products tied on their
      // bound gets the turn doesn't come down to a float's last digit (under an earlier round schedule that alone took the
      // six-planet system at varied prices from 19,148,160 to 16,748,160 at 80,000 arrangements).
      if (l.run.round < round || (l.run.round === round && p > top + SAME_ISK)) { round = l.run.round; top = p; pick = l; }
    }
    if (!pick) break;
    for (let i = 0; i < CHUNK && budget.left > 0; i++) {
      if (pick.run.it.next().done) { pick.run.done = true; break; }
      budget.left--;
    }
  }
  if (live.some(open)) budget.cut = true;
}

/** The best arrangement over the targets given, for one set of characters, within the budget. */
function bestFed(ctxs: FedCtx[], who: Who[], budget: Budget): Searched {
  const pool: Pool = { ctxs, who, best: searched() };
  searchPools([pool], budget);
  return pool.best;
}

/**
 * Whether some arrangement makes X at all within these characters' planets (each P1 shipped, the colonies placeable): a
 * search that covers, at each step, a P1 nothing ships yet, never deeper than a feeder for every two P1s left could reach.
 * It tries at most `COVER_BUDGET` arrangements; one that runs out answers no.
 */
function coverable(ctx: FedCtx, who: Who[]): boolean {
  const K = who.length;
  const slots = who.reduce((n, w) => n + w.cap, 0) - 1;
  const weight = keyWeights(ctx.feeders.length);
  let tries = 0;
  for (const f of factoryClasses(ctx)) {
    const caps = ctx.classes.map((c, ci) => c.members.length * K - (ci === f ? 1 : 0));
    const counts = new Int32Array(ctx.feeders.length), S = new Float64Array(ctx.goods.length);
    const seen = new Set<number>();
    let key = 0;
    const go = (n: number): boolean => {
      if (seen.has(key) || tries >= COVER_BUDGET) return false;
      seen.add(key);
      tries++;
      const lim = ctx.eqs.map((eq) => limitOf(eq, S));
      const open = lim.map((l, k) => (l > MIN_RATE ? -1 : k)).filter((k) => k >= 0);
      if (!open.length) return placeFed(ctx, counts, f, who) != null;
      if (n + Math.ceil(open.length / 2) > slots) return false;
      let e = -1, fewest = Infinity;
      for (const k of open) {
        let sup = 0;
        for (const i of ctx.byEq[k]) if (caps[ctx.feeders[i].cls] > 0) sup++;
        if (sup < fewest) { fewest = sup; e = k; }
      }
      if (!fewest) return false;
      for (const i of ctx.byEq[e]) {
        const fd = ctx.feeders[i];
        if (caps[fd.cls] <= 0) continue;
        counts[i]++; caps[fd.cls]--; key += weight[i];
        for (let g = 0; g < S.length; g++) S[g] += fd.ships[g];
        const ok = go(n + 1);
        counts[i]--; caps[fd.cls]++; key -= weight[i];
        for (let g = 0; g < S.length; g++) { S[g] -= fd.ships[g]; if (Math.abs(S[g]) < 1e-9) S[g] = 0; }
        if (ok) return true;
      }
      return false;
    };
    if (go(0)) return true;
  }
  return false;
}

/** A feeder's plan on the planet it was placed on: the same lines, that planet's name and place. */
function remake(input: PlanInput, p: Plan, m: Member): Plan {
  const again = p.advanced
    ? planP2(input, m.planet, m.at, p.t, p.product, false)
    : planP1(input, m.planet, m.at, p.t, [p.lines[0].p0, p.lines[1].p0], false);
  return again ?? p;
}

const tierRank = (ix: PiIndex, id: number) => TIERS_DOWN.indexOf(ix.byId.get(id)?.tier ?? 'P0');
const stayNote = (stays: string[]) => `${listSaid(stays)} a day stay on the planet, building up: the market takes no more, so they aren’t exported or taxed`;

/** The setup an arrangement makes: every planet's role (a chain's colonies by character), the outputs, the taxes, the upkeep. */
function setupFed(kind: 'feed' | 'chain', input: PlanInput, best: FedBest, unusedWhy: string): Setup {
  const { ctx, f, counts, who, placed } = best;
  const { ix } = input;
  const S = sumShips(ctx, counts);
  const v = valueFed(ctx, counts, f, S, rateOfS(ctx, S), true);
  const { goods, tree } = ctx;
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  const fm = placed.factory.member, fw = who[placed.factory.char];
  const factoryId = fm.planet.planetId;
  const lacks = who.map(() => new Set<string>());
  const colonies = who.map(() => 0);
  colonies[placed.factory.char]++;

  const feederRoles: Role[] = placed.feeders.map((pl, k) => {
    const fd = ctx.feeders[pl.item];
    const plan = remake(input, fd.plan, pl.member);
    const fit = fitted(input, plan, who[pl.char].cc);
    if (fit.lacks) lacks[pl.char].add(fit.lacks);
    colonies[pl.char]++;
    const ships: Role['ships'] = [];
    const stays: string[] = [];
    goods.forEach((id, g) => {
      if (v.toFactory[k][g] > 1e-6) ships.push({ id, perDay: v.toFactory[k][g], to: factoryId });
      if (v.toMarket[k][g] > 1e-6) ships.push({ id, perDay: v.toMarket[k][g], to: 'market' });
      const left = fd.ships[g] - v.toFactory[k][g] - v.toMarket[k][g];
      if (left > 1e-6) stays.push(`${unitsSaid(left)} ${name(id)}`);
    });
    const notes = [...rateNotes(input, plan), ...fit.notes, ...(stays.length ? [stayNote(stays)] : [])];
    return {
      planetId: pl.member.planet.planetId, charId: who[pl.char].c.charId, does: 'extract',
      extracts: plan.lines.map((l, i) => ({ p0: l.p0, perHour: l.perHour, heads: fit.heads[i], rate: l.rate })),
      makes: [
        ...plan.lines.map((l) => ({ id: l.p1, perDay: l.p1PerHour * 24, facility: 'basic' as const, count: l.basics })),
        ...(plan.advanced ? [{ id: plan.advanced.id, perDay: plan.advanced.perHour * 24, facility: 'advanced' as const, count: plan.advanced.count }] : []),
      ],
      ships, fit: fit.fit, why: notes.length ? notes.map(cap).join('. ') : null,
      lacks: fit.fit && !fit.fit.fits ? fit.lacks : null,
    };
  });

  const r = fm.planet.radiusKm;
  const fNotes: string[] = [];
  let fFit: Fit | null = null, fLacks: string | null = null;
  if (r == null || !(r > 0)) fNotes.push('this planet’s size isn’t known, so what fits isn’t checked');
  else {
    fFit = fitOf(ix, fm.planet.type!, fw.cc, v.layout, r);
    if (!fFit.fits) {
      fNotes.push(`these factories don’t fit ${atCcu(fw.cc)}`);
      fLacks = levelFor(ix, fm.planet.type!, fw.cc, v.layout, r);
      if (fLacks) lacks[placed.factory.char].add(fLacks);
    }
  }
  const xSold = v.soldX.isk == null ? v.run : Math.min(v.run, v.soldX.units);
  if (v.R - v.run > 1e-6) fNotes.push(`the market takes ${unitsSaid(v.run)} ${name(tree.x)} a day, so the factory runs for that: what its planets ship beyond it goes to market as it is, or stays on them`);
  if (v.run - xSold > 1e-6) fNotes.push(stayNote([`${unitsSaid(v.run - xSold)} ${name(tree.x)}`]));
  const imports: NonNullable<Role['imports']> = [];
  placed.feeders.forEach((pl, k) => goods.forEach((id, g) => {
    if (v.toFactory[k][g] > 1e-6) imports.push({ id, perDay: v.toFactory[k][g], from: pl.member.planet.planetId });
  }));
  const factoryRole: Role = {
    planetId: factoryId, charId: fw.c.charId, does: 'factory', extracts: [],
    makes: v.made, ships: xSold > 1e-6 ? [{ id: tree.x, perDay: xSold, to: 'market' }] : [], imports,
    fit: fFit, why: fNotes.length ? fNotes.map(cap).join('. ') : null, lacks: fLacks,
  };

  // Every planet of the system, in order; on one, the factory first, then the feeders by character.
  const roles: Role[] = [];
  input.planets.forEach((planet) => {
    const here = [
      ...(planet.planetId === factoryId ? [{ c: placed.factory.char, r: factoryRole }] : []),
      ...placed.feeders.map((pl, k) => ({ c: pl.char, r: feederRoles[k], at: pl.member.planet.planetId })).filter((x) => x.at === planet.planetId),
    ].sort((a, b) => (a.r.does === 'factory' ? -1 : b.r.does === 'factory' ? 1 : a.c - b.c));
    if (here.length) roles.push(...here.map((x) => x.r));
    else roles.push(unusedRole(planet, input.char.charId, planet.type ? unusedWhy : NO_PI));
  });

  const taxes: Setup['taxes'] = [];
  const addRows = (planetId: number, rows: TaxRow[]) => { for (const t of rows) {
    const held = taxes.find((x) => x.planetId === planetId && x.tier === t.tier);
    if (!held) taxes.push({ planetId, tier: t.tier, perDay: t.perDay });
    else held.perDay = held.perDay == null || t.perDay == null ? null : held.perDay + t.perDay;
  } };
  let perPctBase = 0;
  placed.feeders.forEach((pl, k) => { addRows(pl.member.planet.planetId, v.feederTax[k]); for (const t of v.feederTax[k]) if (t.perDay == null) perPctBase += t.base; });
  addRows(factoryId, v.factoryTax);
  for (const t of v.factoryTax) if (t.perDay == null) perPctBase += t.base;
  const order = new Map(input.planets.map((p, i) => [p.planetId, i]));
  taxes.sort((a, b) => order.get(a.planetId)! - order.get(b.planetId)! || TIERS_DOWN.indexOf(a.tier) - TIERS_DOWN.indexOf(b.tier));
  const taxKnown = taxes.every((t) => t.perDay != null);

  const outputs: Output[] = [
    { id: tree.x, perDay: v.run, sold: v.soldX, buildingUp: v.soldX.isk == null ? 0 : Math.max(0, v.run - v.soldX.units) },
    ...v.surplus.map((s) => ({ id: goods[s.g], perDay: s.perDay, sold: s.sold, buildingUp: s.sold.isk == null ? 0 : Math.max(0, s.perDay - s.sold.units) })),
  ].sort((a, b) => tierRank(ix, a.id) - tierRank(ix, b.id) || a.id - b.id);
  const unvalued = outputs.filter((o) => o.sold.isk == null).length;

  const usedFeeders = ctx.feeders.filter((_, i) => counts[i] > 0);
  let high: number | null = null;
  if (usedFeeders.some((fd) => fd.plan.lines.some((l) => l.rate?.higher != null))) {
    const h = highCtx(ctx);
    const S2 = sumShips(h, counts);
    high = valueFed(h, counts, f, S2, rateOfS(h, S2)).score.value;
  }
  const before: Setup['before'] = [];
  if (!taxKnown) before.push('tax');
  if (usedFeeders.some((fd) => fd.plan.lines.some((l) => !l.rate))) before.push('extraction');
  if (unvalued) before.push('price');

  // A chain is ranked per character in it: each character's share is the whole's, by its colonies.
  const total = v.score.value;
  const inIt = who.map((w, c) => ({ w, c })).filter((x) => colonies[x.c] > 0);
  const all = colonies.reduce((n, x) => n + x, 0);
  const perChar = kind === 'feed'
    ? [{ charId: who[0].c.charId, iskDay: total, lacks: [...lacks[0]].sort() }]
    : inIt.map(({ w, c }) => ({ charId: w.c.charId, iskDay: (total * colonies[c]) / all, lacks: [...lacks[c]].sort() }));
  const iskDay = kind === 'feed' ? total : perChar.reduce((t, c) => t + c.iskDay, 0) / perChar.length;

  return {
    kind, iskDay, iskDayHigh: high == null ? null : kind === 'feed' ? high : high / perChar.length, before,
    taxDay: taxKnown ? taxes.reduce((t, x) => t + x.perDay!, 0) : null,
    perPct: perPctBase / 100,
    taxes, outputs, inputs: [], roles,
    upkeep: upkeepOf(input, outputs, placed.feeders.length, v.restocks),
    perChar, unvalued, why: null,
  };
}

const fedTargets = (input: PlanInput, sold: Seller, classes: Cls[], tiers: Tier[]) => input.ix.commodities
  .filter((c) => tiers.includes(c.tier) && sold(c.id, 1).isk != null)
  .map((c) => fedCtx(input, sold, classes, c.id))
  .filter((x): x is FedCtx => x != null);

/**
 * Extraction planets feeding one factory planet: some planets make P1 (or a P2 alone) and ship it to one planet of the
 * system that makes a P2 or P3 from it, sized to what it's fed, every feeder needed. This includes the three P2s no planet
 * makes alone. Each feeder pays export tax; the factory pays import tax at half its rate, and export tax on what it sells.
 */
export function planFeed(input: PlanInput): Setup {
  const { char } = input;
  const cw = charWhy(char);
  if (cw) return blocked(input, 'feed', cw, char.alpha === true ? ['Omega'] : []);
  if (!input.planets.some((p) => p.type)) return blocked(input, 'feed', NO_PI_HERE, []);
  const allowed = char.planets!;
  if (allowed < 2) return blocked(input, 'feed', `A factory planet and one to feed it take 2 planets: you have ${allowed}`, []);
  const sold = seller(input.sell);
  const ctxs = fedTargets(input, sold, classesOf(input), ['P2', 'P3']);
  if (!ctxs.length) return blocked(input, 'feed', 'Nothing a factory here could make from this system’s planets is priced', []);
  const who: Who[] = [{ c: char, cap: allowed, cc: char.ccLevel! }];
  const budget: Budget = { left: input.budget ?? SEARCH_BUDGET, cut: false };
  const { b: best, tried, tooBig } = bestFed(ctxs, who, budget);
  if (!best) {
    if (budget.cut) return withCut(blocked(input, 'feed', RAN_OUT, []), budget);
    return blocked(input, 'feed', tried && tooBig ? NO_FIT : `No factory planet here can be fed within your ${allowed} planets`, []);
  }
  const used = best.placed.feeders.length + 1;
  return withCut(setupFed('feed', input, best, used >= allowed ? `Your ${allowed} planets go to ones that pay more` : 'Not needed by this setup'), budget);
}

/**
 * When every arrangement tried had its factory too big for its planet even at the top level, and the search wasn't cut short,
 * that's why nothing is planned. One cut short before it found anything says so, never blaming the planets or characters.
 */
export const NO_FIT = 'Every factory these planets could feed is too big for its planet, even at Command Center Upgrades V';
export const RAN_OUT = 'The search’s budget ran out before it found an arrangement';
const withCut = (s: Setup, budget: Budget): Setup => (budget.cut ? { ...s, cut: true } : s);

/**
 * A chain, for a P4 (from one character's planets or more) or a P3 that needs more planets than the shown character has: the
 * characters whose skills are read and who aren't Alpha, in order from the shown one, each with its own planets and CCU
 * level, as many as pay most per character. A P4 the shown character can make alone is also a one-character chain, so more
 * planets a character never take a P4 out of every setup (P2s and P3s one character can make are the feed's). Ranked by ISK
 * a day per character in it; each one's share is the whole's, by its colonies. Every number of characters is searched in one
 * budget, spent in rounds: every product gets its first dive before any gets a second, and within a round the highest bound goes first.
 */
export function planChain(input: PlanInput): Setup {
  const { char } = input;
  const cw = charWhy(char);
  if (cw) return blocked(input, 'chain', cw, char.alpha === true ? ['Omega'] : []);
  if (!input.planets.some((p) => p.type)) return blocked(input, 'chain', NO_PI_HERE, []);
  const seen = new Set<number>();
  const usable: Who[] = [char, ...input.others].filter((c) => !seen.has(c.charId) && seen.add(c.charId) && charWhy(c) == null)
    .map((c) => ({ c, cap: c.planets!, cc: c.ccLevel! }));
  const sold = seller(input.sell);
  const classes = classesOf(input);
  const p4 = fedTargets(input, sold, classes, ['P4']);
  const p3 = fedTargets(input, sold, classes, ['P3']);
  if (!p4.length && !p3.length) return blocked(input, 'chain', 'Nothing a chain here could make from this system’s planets is priced', []);
  const p3Many = p3.filter((ctx) => !coverable(ctx, usable.slice(0, 1)));
  const many = [...p4, ...p3Many];
  if (!many.length) return blocked(input, 'chain', `No P4 is priced here, and every P3 made here fits in your ${char.planets} planets (the feed plans those)`, []);

  const pools: Pool[] = [{ ctxs: p4.filter((ctx) => coverable(ctx, usable.slice(0, 1))), who: usable.slice(0, 1), best: searched() }];
  for (let k = 2; k <= usable.length; k++) pools.push({ ctxs: many, who: usable.slice(0, k), best: searched() });
  const budget: Budget = { left: input.budget ?? CHAIN_BUDGET, cut: false };
  searchPools(pools, budget);
  let pick: { best: FedBest; per: number } | null = null;
  for (const { best: { b } } of pools) {
    if (!b) continue;
    const used = new Set([b.placed.factory.char, ...b.placed.feeders.map((x) => x.char)]).size;
    const per = b.score.value / used;
    if (!pick || per > pick.per + SAME_ISK) pick = { best: b, per };
  }
  if (pick) return withCut(setupFed('chain', input, pick.best, 'The chain needs no colony here'), budget);
  if (budget.cut) return withCut(blocked(input, 'chain', RAN_OUT, []), budget);
  if (pools.some((p) => p.best.tried) && pools.every((p) => !p.best.tried || p.best.tooBig)) return blocked(input, 'chain', NO_FIT, []);

  // Too few characters: how many more like the shown one the least demanding chain needs.
  const like: Who = { c: char, cap: char.planets!, cc: char.ccLevel! };
  let short = 0;
  for (let more = 1; more <= 6 && !short; more++) {
    const who = [...usable, ...Array.from({ length: more }, () => like)];
    if (many.some((ctx) => coverable(ctx, who))) short = more;
  }
  const s = blocked(input, 'chain', short ? `Needs ${short} more character${short === 1 ? '' : 's'} with planetary industry` : 'No chain here can be made with the characters there are', []);
  const alphas = input.others.filter((c, i, a) => c.alpha === true && c.charId !== char.charId && a.findIndex((o) => o.charId === c.charId) === i).slice(0, short);
  s.perChar = [...usable.map((w) => ({ charId: w.c.charId, iskDay: null, lacks: [] as string[] })), ...alphas.map((c) => ({ charId: c.charId, iskDay: null, lacks: ['Omega'] }))];
  return s;
}

// ---- Bought inputs ----

/** One `buy` per good and amount. */
function buyer(buy: Buy) {
  const cache = new Map<string, Bought>();
  return (id: number, perDay: number): Bought => {
    const k = `${id}:${perDay}`;
    let b = cache.get(k);
    if (!b) cache.set(k, b = buy(id, perDay));
    return b;
  };
}
type Buyer = (id: number, q: number) => Bought;

/** A product a class of planets can make on bought inputs: as many factories as fit at the character's level, one launchpad. */
/** `top`: the most a day it runs alone and still pays for its last unit, and what holds it there (`topOf`), worked out once and kept here. */
type BuyOpt = { cls: number; x: number; facility: Facility; n: number; perFactory: number; inputs: { id: number; per: number }[]; alone: number; top?: { q: number; why: 'market' | 'pays' | number | null } };
/** `buyWhy`: the first reason an input couldn't be bought at the amount a factory planet needs (its hub too thin for a week's need), so a setup blocked by it says that rather than that nothing pays. */
type BuyCtx = { input: PlanInput; sold: Seller; buy: Buyer; classes: Cls[]; opts: BuyOpt[]; buyWhy: string | null };
/** `limit`: what holds each planet's factories below what fits: what sells of its product ('market'), or an input whose supply ran out (its ID); null when every factory that fits runs. */
/** `limit`: what holds each planet's factories below what fits: what sells of its product ('market'), the last unit that pays ('pays'), or an input whose supply ran out (its ID); null when every factory that fits runs. */
type BoughtValue = { score: Score; q: number[]; limit: ('market' | 'pays' | number | null)[]; sold: Map<number, Sold>; need: Map<number, number>; bought: Map<number, Bought>; tax: TaxRow[][]; restocks: number[] };

/**
 * The largest amount in [0, `Q`] at which a concave, piecewise-linear `V` is at its most: where its last unit stops paying. `V`'s
 * kinks (a sale's sides stepping down, a book's levels, a cap) aren't given, since `Sell` and `Buy` are closures, so they're found
 * from the curve: the tangents at the two ends meet at `c`; concavity keeps `V` on or under both, so `V(c)` on them means `c` is
 * the kink where the slope turns negative, and otherwise `c` splits the range by its own slopes. One step a kink, never unit by
 * unit. `V(0)` is 0 (nothing made, bought or taxed). Pure.
 */
export function lastPaying(V: (q: number) => number, Q: number): number {
  if (!(Q > 0)) return 0;
  const h = Q * 1e-7;
  const tolOf = (...v: number[]) => 1e-12 * Math.max(1, ...v.map(Math.abs)) + 1e-9;
  const val = (q: number) => (q <= 0 ? 0 : V(q));
  const vQ = val(Q);
  const s0 = val(h) / h;
  if (s0 < 0) return 0;
  const sQ = (vQ - val(Q - h)) / h;
  if (sQ >= 0) return Q;
  let lo = 0, vlo = 0, slo = s0, hi = Q, vhi = vQ, shi = sQ;
  // A kink found to within the finite differences: its two lines again from chords well clear of it on either side, met; kept
  // only when that lands within a step of it (another kink inside the chords would move it further).
  const refine = (c: number) => {
    const d = Math.min(c - lo, hi - c) / 4;
    if (!(d > 8 * h)) return c;
    const va = val(c - d), vb = val(c + d);
    const sa = (va - val(c - 2 * d)) / d, sb = (val(c + 2 * d) - vb) / d;
    const k = sa - sb > 0 ? (vb - va + sa * (c - d) - sb * (c + d)) / (sa - sb) : c;
    return Math.abs(k - c) <= 2 * h ? k : c;
  };
  for (let i = 0; i < 64; i++) {
    let c = slo - shi > 0 ? (vhi - vlo + slo * lo - shi * hi) / (slo - shi) : (lo + hi) / 2;
    if (!(c > lo + h && c < hi - h)) c = (lo + hi) / 2;
    const vc = val(c);
    if (Math.abs(vc - (vlo + slo * (c - lo))) <= tolOf(vlo, vc) && Math.abs(vc - (vhi + shi * (c - hi))) <= tolOf(vhi, vc)) return refine(c);
    const sl = (vc - val(c - h)) / h, sr = (val(c + h) - vc) / h;
    if (sr >= 0) { lo = c; vlo = vc; slo = sr; } else if (sl < 0) { hi = c; vhi = vc; shi = sl; } else return refine(c);
    if (hi - lo <= 2 * h) break;
  }
  // Ranges too short to split: the better end.
  return vhi > vlo ? hi : lo;
}

/**
 * How much option `o` runs alone and still pays (Ruling T11-6): no more than its factories make, what sells and what each input's
 * market supplies alone, and only while a unit's sale net covers its inputs' cost and its taxes. `Sell` and `Buy`'s contracts make
 * that a concave curve, so its last paying unit is its most (`lastPaying`); a planet sized to it alone is worth the most it can be,
 * and any amount a shared cap shrinks it to is a prefix of paying units, worth no more, which keeps the search's bound (`alone`)
 * sound. An input refused within that for another reason than its supply (a hub too thin with no `max`) leaves the amount as it
 * was, for `valueBought` to refuse as before.
 */
function topOf(ctx: BuyCtx, o: number): NonNullable<BuyOpt['top']> {
  const opt = ctx.opts[o];
  if (opt.top != null) return opt.top;
  const { ix } = ctx.input;
  const rate = ctx.classes[opt.cls].rate;
  const full = opt.n * opt.perFactory;
  const s = ctx.sold(opt.x, full);
  let Q = full, why: 'market' | 'pays' | number | null = null;
  const sells = s.isk == null ? 0 : s.units;
  if (sells < Q - EPS) { Q = sells; why = 'market'; }
  for (const i of opt.inputs) {
    const max = ctx.buy(i.id, full * i.per).max;
    if (max != null && max / i.per < Q - EPS) { Q = max / i.per; why = i.id; }
  }
  // Per unit: the import tax on its inputs at half the rate and the export tax on it (none while the rate isn't known: ranked before it).
  const taxUnit = [...taxRows(ix, opt.inputs.map((i) => ({ id: i.id, perDay: i.per })), rate, 0.5), ...taxRows(ix, [{ id: opt.x, perDay: 1 }], rate, 1)]
    .reduce((t, r) => t + (r.perDay ?? 0), 0);
  let refused = false;
  const V = (q: number) => {
    const sale = ctx.sold(opt.x, q).isk ?? 0;
    let cost = 0;
    for (const i of opt.inputs) {
      const b = ctx.buy(i.id, q * i.per);
      if (b.isk == null) { refused = true; return -Infinity; }
      cost += b.isk;
    }
    return sale - cost - taxUnit * q;
  };
  let top = Q > 0 ? lastPaying(V, Q) : 0;
  if (refused) top = Q;
  opt.top = top < Q - EPS ? { q: top, why: 'pays' } : { q: Q, why };
  return opt.top;
}

/**
 * Factory planets on bought inputs, worked out together: each good summed and sold once, so two planets share one market's
 * cap; a planet's factories run for what sells, the lowest-tax planet first, and buy only what they use (inputs summed and
 * bought once). What the market supplies of an input a day (`Bought.max`) is shared the same way, the lowest-tax planet first,
 * and holds a planet's factories to what it allows (Ruling T11-3): a cap sizes the setup down, never blocks it. Each pays import
 * tax at half its rate on what it buys and export tax on what it sells. Null when an input can't be priced at the amount, or a
 * planet would make nothing.
 */
function valueBought(ctx: BuyCtx, inst: number[]): BoughtValue | null {
  const { input, sold, buy, classes, opts } = ctx;
  const { ix } = input;
  const q = inst.map(() => 0);
  const limit: BoughtValue['limit'] = inst.map(() => null);
  const byX = new Map<number, number[]>();
  inst.forEach((o, k) => { const xs = byX.get(opts[o].x) ?? []; xs.push(k); byX.set(opts[o].x, xs); });
  for (const [x, ks] of byX) {
    const full = ks.reduce((n, k) => n + opts[inst[k]].n * opts[inst[k]].perFactory, 0);
    const s = sold(x, full);
    let left = s.isk == null ? 0 : s.units;
    for (const k of [...ks].sort((a, b) => byRate(classes[opts[inst[a]].cls].rate, classes[opts[inst[b]].cls].rate) || a - b)) {
      const most = opts[inst[k]].n * opts[inst[k]].perFactory;
      // The last unit that pays (Ruling T11-6), worked out alone: a planet never runs on into units that lose.
      const top = topOf(ctx, inst[k]);
      q[k] = Math.min(most, top.q, Math.max(0, left));
      // What held it: what's left of the shared market, else what held it alone (the last paying unit, what sells, an input's supply).
      if (q[k] < most - EPS) limit[k] = left < top.q - EPS ? 'market' : top.why ?? 'market';
      left -= q[k];
    }
  }
  if (q.some((x) => !(x > MIN_RATE))) return null;
  const needOf = () => {
    const m = new Map<number, number>();
    inst.forEach((o, k) => { for (const i of opts[o].inputs) m.set(i.id, (m.get(i.id) ?? 0) + q[k] * i.per); });
    return m;
  };
  // What each input's market supplies a day, shared by the planets that use it in one order (the lowest tax first, then the order
  // given): each planet runs for no more than what's left of every input it takes.
  const left = new Map<number, number>();
  for (const [id, amount] of needOf()) {
    const max = buy(id, amount).max;
    if (max != null && amount > max * (1 + 1e-9)) left.set(id, max);
  }
  if (left.size) {
    for (const k of inst.map((_, k) => k).sort((a, b) => byRate(classes[opts[inst[a]].cls].rate, classes[opts[inst[b]].cls].rate) || a - b)) {
      for (const i of opts[inst[k]].inputs) {
        const m = left.get(i.id);
        if (m == null) continue;
        const allows = Math.max(0, m) / i.per;
        if (allows < q[k] - EPS) { q[k] = allows; limit[k] = i.id; }
      }
      for (const i of opts[inst[k]].inputs) if (left.has(i.id)) left.set(i.id, left.get(i.id)! - q[k] * i.per);
    }
    if (q.some((x) => !(x > MIN_RATE))) return null;
  }
  const soldBy = new Map<number, Sold>();
  for (const [x, ks] of byX) soldBy.set(x, sold(x, ks.reduce((n, k) => n + q[k], 0)));
  const need = needOf();
  let value = 0;
  for (const s of soldBy.values()) value += s.isk ?? 0;
  const bought = new Map<number, Bought>();
  for (const [id, amount] of need) {
    const b = buy(id, amount);
    if (b.isk == null) { ctx.buyWhy ??= b.why; return null; }
    bought.set(id, b);
    value -= b.isk;
  }
  const tax = inst.map((o, k) => {
    const rate = classes[opts[o].cls].rate;
    return mergeRows([...taxRows(ix, opts[o].inputs.map((i) => ({ id: i.id, perDay: q[k] * i.per })), rate, 0.5), ...taxRows(ix, [{ id: opts[o].x, perDay: q[k] }], rate, 1)]);
  });
  for (const rows of tax) for (const t of rows) value -= t.perDay ?? 0;
  // The launchpad holds what's brought in and what's made (Ruling T11-4): a visit empties and refills it, on both.
  const restocks = inst.map((o, k) => {
    const t = classes[opts[o].cls].t;
    const m3 = opts[o].inputs.reduce((n, i) => n + q[k] * i.per * (ix.byId.get(i.id)?.volume ?? 0), 0) + q[k] * (ix.byId.get(opts[o].x)?.volume ?? 0);
    return (m3 * 7) / ix.planetTypes[t].pins.launchpad.capacity;
  });
  return { score: { value, unpriced: 0, upkeep: restocks.reduce((n, x) => n + x, 0) }, q, limit, sold: soldBy, need, bought, tax, restocks };
}

/**
 * A factory planet on bought inputs: each planet allowed buys its inputs through `buy` and makes a P2 or P3, or a P4 on
 * Barren or Temperate (where High-Tech plants fit), from one recipe step. Every product and planet assignment is searched,
 * the products by what each would make alone, a product whose ISK at full capacity can't beat the best so far skipped.
 */
export function planBought(input: PlanInput): Setup {
  const { char, ix } = input;
  const cw = charWhy(char);
  if (cw) return blocked(input, 'bought', cw, char.alpha === true ? ['Omega'] : []);
  if (!input.planets.some((p) => p.type)) return blocked(input, 'bought', NO_PI_HERE, []);
  const cc = char.ccLevel!, allowed = char.planets!;
  const sold = seller(input.sell), buy = buyer(input.buy);
  const counts = new Map<number, [number, number]>();
  const nOf = (p: PlanPlanet, t: PlanetType): [number, number] | null => {
    if (p.radiusKm == null || !(p.radiusKm > 0)) return null;
    let n = counts.get(p.planetId);
    if (!n) counts.set(p.planetId, n = [maxFactories(ix, t, cc, 'advanced', 1, p.radiusKm), maxFactories(ix, t, cc, 'hightech', 1, p.radiusKm)]);
    return n;
  };
  const classes = classesOf(input, (p, t) => { const n = nOf(p, t); return n ? `${t}|${p.tax.rate ?? '?'}|${n[0]}|${n[1]}` : null; });
  const sizeWhy = 'This planet’s size isn’t known, so how many factories fit isn’t known';
  if (!classes.length) return blocked(input, 'bought', sizeWhy, []);
  const ctx: BuyCtx = { input, sold, buy, classes, opts: [], buyWhy: null };
  let inputWhy: string | null = null, anyPriced = false;
  classes.forEach((c, ci) => {
    const [adv, ht] = nOf(c.members[0].planet, c.t)!;
    for (const s of ix.schematics) {
      if (!(s.tier === 'P2' || s.tier === 'P3' || s.tier === 'P4')) continue;
      const n = s.facility === 'hightech' ? ht : adv;
      if (!(n > 0) || sold(s.out.id, 1).isk == null) continue;
      const unbought = s.inputs.map((i) => buy(i.id, 1)).find((b) => b.isk == null);
      if (unbought) { inputWhy ??= unbought.why; continue; }
      anyPriced = true;
      ctx.opts.push({ cls: ci, x: s.out.id, facility: s.facility, n, perFactory: anHour(s, s.out.qty) * 24, inputs: s.inputs.map((i) => ({ id: i.id, per: i.qty / s.out.qty })), alone: 0 });
    }
  });
  ctx.opts.forEach((o, i) => { o.alone = valueBought(ctx, [i])?.score.value ?? -Infinity; });
  const byAlone = ctx.opts.map((_, i) => i).filter((i) => ctx.opts[i].alone > SAME_ISK)
    .sort((a, b) => ctx.opts[b].alone - ctx.opts[a].alone || byRate(classes[ctx.opts[a].cls].rate, classes[ctx.opts[b].cls].rate) || a - b);
  // Priced at one unit, an input can still be refused at the amount a planet's factories take (a hub too thin for a week's need):
  // when that is what stopped every product, it is the reason, never "nothing pays" (Task 10's re-review).
  const noneValued = ctx.opts.every((o) => o.alone === -Infinity);
  const paysWhy = () => (noneValued && ctx.buyWhy ? `No input can be bought in the amount its factories need: ${ctx.buyWhy}`
    : `No product here pays more than its inputs cost${ctx.buyWhy ? `, and some inputs can’t be bought in the amount needed: ${ctx.buyWhy}` : ''}`);
  if (!byAlone.length) {
    const why = anyPriced ? paysWhy() : inputWhy ? `No input is priced to buy: ${inputWhy}` : 'Nothing a factory here could make is priced';
    return blocked(input, 'bought', why, []);
  }
  // Every assignment of products to planets, at most a class's planets each; the products in order of what they make alone.
  const room = classes.map((c) => c.members.length);
  let best: { score: Score; inst: number[] } | null = null;
  const inst: number[] = [];
  const topFrom = (j: number, left: number) => {
    const r = room.slice();
    let t = 0;
    for (let k = j; k < byAlone.length && left > 0; k++) {
      const o = ctx.opts[byAlone[k]];
      const n = Math.min(left, r[o.cls]);
      if (n > 0) { t += n * o.alone; r[o.cls] -= n; left -= n; }
    }
    return t;
  };
  // At most the budget of assignments valued; one cut off while its bound could still beat the best marks the setup.
  let tries = input.budget ?? SEARCH_BUDGET, cut = false;
  const dfs = (start: number, cur: number, curUpkeep: number, left: number) => {
    for (let j = start; j < byAlone.length; j++) {
      const o = ctx.opts[byAlone[j]];
      if (room[o.cls] <= 0) continue;
      if (best && !mayBeat(cur + topFrom(j, left), curUpkeep, best.score)) break;
      if (tries-- <= 0) { cut = true; return; }
      room[o.cls]--; inst.push(byAlone[j]);
      const v = valueBought(ctx, inst);
      if (v) {
        if (beats(v.score, best?.score ?? null)) best = { score: v.score, inst: inst.slice() };
        if (left > 1) dfs(j, v.score.value, v.score.upkeep, left - 1);
      }
      inst.pop(); room[o.cls]++;
    }
  };
  dfs(0, 0, 0, allowed);
  const chosen = best as { score: Score; inst: number[] } | null;
  if (!chosen) return cut ? { ...blocked(input, 'bought', RAN_OUT, []), cut: true } : blocked(input, 'bought', paysWhy(), []);
  const v = valueBought(ctx, chosen.inst)!;

  // Each class's factories on its planets in order.
  const next = classes.map(() => 0);
  const at = chosen.inst.map((o) => classes[ctx.opts[o].cls].members[next[ctx.opts[o].cls]++]);
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  const roleOf = new Map<number, Role>();
  const taxes: Setup['taxes'] = [];
  let perPctBase = 0;
  chosen.inst.forEach((o, k) => {
    const opt = ctx.opts[o], m = at[k];
    const count = factoriesFor(v.q[k], opt.perFactory / 24);
    const layout: Layout = { ecus: 0, heads: 0, basic: 0, storage: 0, launchpads: 1, advanced: opt.facility === 'advanced' ? count : 0, hightech: opt.facility === 'hightech' ? count : 0 };
    const lim = v.limit[k];
    const held = typeof lim === 'number' ? v.bought.get(lim) : null;
    const shared = typeof lim === 'number' && chosen.inst.some((o2, k2) => k2 !== k && ctx.opts[o2].inputs.some((i) => i.id === lim));
    const notes = count >= opt.n ? []
      : typeof lim === 'number'
        ? [`${suppliesSaid(held?.maxAt ?? 'the market')} ${held?.max != null && held.max > 0 ? qtyAday(held.max, name(lim)) : `no ${name(lim)}`}${held?.maxSaid ? `: ${held.maxSaid}` : ''}`,
          `${shared ? 'Shared by the planets that take it, this one gets' : 'That is'} enough for ${amountSaid(v.q[k])} ${name(opt.x)} a day here, so ${count} of the ${opt.n} factories that fit run`]
        : lim === 'pays'
          // The last unit that pays holds it (Ruling T11-6): said, never left unexplained.
          ? [`${count} of the ${opt.n} factories that fit run, for ${amountSaid(v.q[k])} ${name(opt.x)} a day: past that, a unit costs more to make than it sells for`]
          : [`the market takes ${amountSaid(v.q[k])} ${name(opt.x)} a day here: ${count} of the ${opt.n} factories that fit run`];
    roleOf.set(m.planet.planetId, {
      planetId: m.planet.planetId, charId: char.charId, does: 'factory', extracts: [],
      makes: [{ id: opt.x, perDay: v.q[k], facility: opt.facility, count }],
      ships: [{ id: opt.x, perDay: v.q[k], to: 'market' }],
      imports: opt.inputs.map((i) => ({ id: i.id, perDay: v.q[k] * i.per, from: 'market' as const })),
      fit: fitOf(ix, m.planet.type!, cc, layout, m.planet.radiusKm!), why: notes.length ? notes.map(cap).join('. ') : null,
    });
    for (const t of v.tax[k]) { taxes.push({ planetId: m.planet.planetId, tier: t.tier, perDay: t.perDay }); if (t.perDay == null) perPctBase += t.base; }
  });
  const notUsed = chosen.inst.length < allowed ? 'Nothing else pays here' : allowed === 1 ? 'Your 1 planet goes to one that pays more' : `Your ${allowed} planets go to ones that pay more`;
  const roles = input.planets.map((planet) => roleOf.get(planet.planetId)
    ?? unusedRole(planet, char.charId, !planet.type ? NO_PI : planet.radiusKm == null || !(planet.radiusKm > 0) ? sizeWhy : notUsed));
  const place = new Map(input.planets.map((p, i) => [p.planetId, i]));
  taxes.sort((a, b) => place.get(a.planetId)! - place.get(b.planetId)! || TIERS_DOWN.indexOf(a.tier) - TIERS_DOWN.indexOf(b.tier));
  const taxKnown = taxes.every((t) => t.perDay != null);
  const outputs: Output[] = [...v.sold.entries()].map(([id, s]) => ({ id, perDay: s.units, sold: s, buildingUp: 0 }))
    .sort((a, b) => tierRank(ix, a.id) - tierRank(ix, b.id) || a.id - b.id);
  const inputs = [...v.need.entries()].map(([id, perDay]) => ({ id, perDay, bought: v.bought.get(id)! }))
    .sort((a, b) => tierRank(ix, a.id) - tierRank(ix, b.id) || a.id - b.id);
  return {
    kind: 'bought', iskDay: v.score.value, iskDayHigh: null, before: taxKnown ? [] : ['tax'],
    taxDay: taxKnown ? taxes.reduce((t, x) => t + x.perDay!, 0) : null, perPct: perPctBase / 100,
    taxes, outputs, inputs, roles,
    upkeep: upkeepOf(input, outputs, 0, v.restocks.reduce((n, x) => n + x, 0), inputs),
    perChar: [{ charId: char.charId, iskDay: v.score.value, lacks: [] }], unvalued: 0, why: null,
    ...(cut ? { cut: true as const } : {}),
  };
}

// ---- The ranking ----

type Rankable = { kind?: SetupKind; iskDay: number | null; upkeep: { resetsPerWeek: number; restocksPerWeek: number }; perChar?: unknown[] };
/**
 * Best first by ISK a day to the cent (a chain's per character in it), the ones without a figure last; at the same cent,
 * less upkeep first (a chain's per character in it too, as its ISK is). By the cent rather than "within a cent of each
 * other", which isn't transitive (5.000 is within a cent of 5.008, and 5.008 of 5.016, but 5.000 isn't of 5.016).
 */
export function rankSetups<T extends Rankable>(setups: T[]): T[] {
  const upkeep = (s: T) => (s.upkeep.resetsPerWeek + s.upkeep.restocksPerWeek) / (s.kind === 'chain' && s.perChar?.length ? s.perChar.length : 1);
  return setups.map((s, i) => ({ s, i })).sort((a, b) => {
    const x = a.s.iskDay, y = b.s.iskDay;
    if (x == null || y == null) return x == null && y == null ? a.i - b.i : x == null ? 1 : -1;
    return Math.round(y * 100) - Math.round(x * 100) || upkeep(a.s) - upkeep(b.s) || a.i - b.i;
  }).map((e) => e.s);
}

/** All five setups for the system and character, ranked. The user's own P0 → P2 is always among them. */
export function planSystem(input: PlanInput): Setup[] {
  return rankSetups([planSingle(input, 'p1'), planSingle(input, 'p2'), planFeed(input), planBought(input), planChain(input)]);
}
