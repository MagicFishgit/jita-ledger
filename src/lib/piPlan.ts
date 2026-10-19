import type { PlanetType } from './pi';
import { madeAlone, type Facility, type PiIndex, type Schematic, type Tier } from './piBundle';
import { fitOf, maxFactories, maxHeads, type Fit, type Layout } from './piFit';
import type { Rate } from './piLearn';
import type { Tax } from './planetsDoc';
import { slotDay, type Freight, type Sale } from './industryRank';
import { isk, units as unitsSaid, plainNum } from './format';
import { dayCount, perDaySaid } from './split';
import { maximise } from './lp';

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
export type Sold = { isk: number | null; units: number; where: ('jita' | 'home')[]; why: string | null; jitaUnits?: number; fallback?: Fallback | null };
/**
 * A good the home hub doesn't price, valued at Jita's instead (Ruling F11, the user's own: "just pull the jita figure instead and
 * warn, that way i can put it up for that price locally or store it for shipping to jita"): `hub` the hub's short name, `list` the
 * price Jita lists it at (so it can be listed at home at that), `route` whether a freight route nets it after freight; without one,
 * Jita's price before freight. Every figure built on it says so (`fallbackSaid`).
 */
export type Fallback = {
  hub: string; list: number | null; route: boolean;
  /** Carried yourself to Jita (a high-sec hub near it: no freight paid), so not "after freight". */
  carried?: boolean;
  /**
   * The hub's own reason, read and kept (the review of Task 15c): "No price at UALX-3", "Not read at UALX-3 yet", "Nothing says how
   * fast it sells at UALX-3" (a good it lists whose pace isn't known: every listed good at a hub Goonmetrics doesn't track), "UALX-3's
   * weekly movement isn't known, so its depth can't be judged". The words lead with it, never a blanket "no price".
   */
  hubWhy?: string | null;
};
/** A hub's reason as a sentence's lead, capitalised. */
const lead = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
/**
 * The planner's searches bound what an arrangement can be worth by each good's first unit, and size a bought setup exactly on
 * its curve (Ruling T11-11), so a `Sell` must keep to this: the next unit never nets more than the last as the amount grows (the
 * ISK is concave in the amount, so its average never rises either), the units that sell never fall as the amount grows, and
 * there's no fixed charge a call (a freight minimum is spread over a batch, as `batchLeg` does, never charged on each call).
 * Broken, the best arrangement can be pruned without a word.
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
 * A good's sale with Sell set to the home hub (Ruling F11): at the hub when it prices it on either side, as ever; else wholly at
 * Jita's (`jita`: the route's sale, after freight to Jita, or with no route Jita's before freight, `route` saying which), marked
 * `fallback`, so a good is all on one place and `Sell`'s contract holds. Neither priced: unvalued, both reasons said (I1). Pure.
 */
export function soldAtHome(perDay: number, sales: { home: Sale | null; jita: Sale | null }, share: number, hub: string, route: boolean, carried = false): Sold {
  const priced = (x: Sale | null): x is Sale => !!x && (x.listNet != null || x.bidNet != null);
  const hubWhy = sales.home?.why ?? null;
  if (priced(sales.home) || !priced(sales.jita)) {
    const s = soldOf(perDay, { jita: null, home: sales.home }, 'home', share);
    if (s.isk != null || !sales.jita?.why) return s;
    return { ...s, why: [...new Set([s.why, `Jita: ${sales.jita.why}`].filter((w): w is string => !!w))].join('; ') };
  }
  return { ...soldOf(perDay, { jita: sales.jita, home: null }, 'jita', share), fallback: { hub, list: sales.jita.list, route, carried, hubWhy } };
}
/**
 * A fallback's words, at what a unit came to, led by the hub's own reason: "No price at UALX-3: valued at Jita's: 1,100 ISK after
 * freight (Jita lists it at 1,234)", "Nothing says how fast it sells at UALX-3: valued at Jita's: …".
 */
export function fallbackSaid(sold: Pick<Sold, 'isk' | 'units' | 'fallback'>): string | null {
  const f = sold.fallback;
  if (!f) return null;
  const why = lead(f.hubWhy ?? `No price at ${f.hub}`);
  const unit = sold.isk != null && sold.units > 0 ? sold.isk / sold.units : null;
  const listed = f.list != null ? ` (Jita lists it at ${isk(f.list)})` : '';
  if (!f.route) return `${why}: valued at Jita’s${unit != null ? ` ${isk(unit)}` : ''}, before freight: no freight route picked${listed}`;
  const how = f.carried ? 'carried yourself' : 'after freight';
  return `${why}: valued at Jita’s${unit != null ? `: ${isk(unit)} ${how}` : `, ${how}`}${listed}`;
}
/** An input bought at Jita for want of the hub, said with the hub's own reason (F11b): "with the freight in (UALX-3's weekly movement isn't known, …)". */
export function boughtFallbackSaid(b: Pick<Bought, 'fallback'>): string | null {
  const f = b.fallback;
  if (!f) return null;
  const why = f.hubWhy ?? `${f.hub} doesn’t sell it`;
  // Lower-cased as a clause unless it starts with a name ("UALX-3's weekly movement…").
  return `with the freight in (${/^[A-Z][a-z]/.test(why) ? why.charAt(0).toLowerCase() + why.slice(1) : why})`;
}
/** The goods among outputs valued at Jita's because the hub has no price (Ruling F11), for a setup's or a colony's one line. */
export const fallbackGoods = (outputs: readonly Output[]): number[] => [...new Set(outputs.filter((o) => o.sold.fallback && o.sold.isk != null).map((o) => o.id))];

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
export type Bought = { isk: number | null; where: ('jita' | 'home')[] | null; why: string | null; note?: string | null; jitaUnits?: number; max?: number | null; maxAt?: string | null; maxSaid?: string | null; fallback?: Fallback | null };
/**
 * The same contract as `Sell`, the other way (Ruling T11-7): a unit's marginal cost never falls as the amount grows, so the total
 * cost is convex, and there's no fixed charge a call. So what a planet's factories buy alone is never more than their share of
 * buying with others, and a bought setup's worth is concave in its planets' amounts, which its exact sizing rests on (`sizeGroup`:
 * the cost's kinks, `kinksOf`, are the steps of a linear programme). A cheaper place that runs out must hand over only the units
 * past it, never the whole amount (`boughtOf`): handing over the whole amount makes the total jump, and the planner misses the
 * amount that pays most.
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
/**
 * A good's purchase with Sell set to the home hub (Ruling F11b, buying following F11): at the hub when it sells any; else wholly at
 * Jita's asks with the freight in on the route (`jita`, as Either buys at Jita), marked `fallback`, so a good is bought at one place
 * and `Buy`'s contract holds. With no route Jita's offer carries no steps (`NO_ROUTE_WHY`): buying needs the freight in, so it stays
 * unpriced with both reasons, as when Jita lists none. Pure.
 */
export function boughtAtHome(perDay: number, places: { home: BuyPlace; jita: BuyPlace }, hub: string): Bought {
  const sells = (p: BuyPlace) => p.steps.some((x) => x.units > 0);
  if (sells(places.home) || !sells(places.jita)) {
    const b = boughtOf(perDay, [places.home]);
    if (b.isk != null || sells(places.home) || !places.jita.why) return b;
    return { ...b, why: [...new Set([b.why, `Jita: ${places.jita.why}`].filter((w): w is string => !!w && w !== 'no price read'))].join('; ') || 'no price read' };
  }
  return { ...boughtOf(perDay, [places.jita]), fallback: { hub, list: null, route: true, hubWhy: places.home.why } };
}
/** Units of a purchase bought at Jita: as `boughtOf` splits them, else all when Jita is the only place. */
export const boughtAtJita = (b: Bought, perDay: number) => b.jitaUnits ?? (b.where?.length === 1 && b.where[0] === 'jita' ? perDay : 0);
/**
 * Buying at Jita (Rulings T11-3 and T11-7), as steps: each of others' listings from the best (`asks`, your own taken off), a day's share
 * of it (a week's need bought up them), cut where the listings' week or your share of the good's day in The Forge (`pace`, units a
 * typical day) ends, whichever is first: the share that holds what you sell. `max` is the lesser of the two and never depends on the
 * amount. The cost a unit is the listing's price (freight is the caller's, a level at a time), so it only rises up the book, as `Buy`'s
 * contract asks. `pace` must be over 0 (the caller says why when it isn't). Pure.
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
  /** For the tests: the most pivots a bought setup's sizing may take (`lp.ts`'s cap when absent), to make it stall. */
  maxPivots?: number;
  /**
   * Structures a planet already has standing that its single-character layout must fit beside (by planet ID; Ruling T15b-1):
   * `versusBest`'s planet only, from the colony's pins (colonyChain.ts' `reserveFor`), so its best is set against the colony like
   * for like. Absent everywhere else, Plan included: one launchpad, no storage.
   */
  reserve?: Record<number, Reserve>;
  /**
   * The factories a planet already runs, by what they make (by planet ID; Ruling T15b-4): `versusBest`'s planet only, from the
   * colony's pins (colonyChain.ts' `holdFor`). A single-planet layout making exactly those products is held to those counts, so the
   * colony's own products are compared on its own factories, never on another mix of them; any other product is planned as ever.
   * Absent everywhere else, Plan included.
   */
  hold?: Record<number, Hold>;
  /**
   * The heads a line whose heads aren't known (no rate, or a rate whose extractors didn't say) is fitted at: the median of the shown
   * character's learned rates' heads (piLearn's `assumedHeads`; Ruling T15b-5), said on the line. Absent or null (nothing learned):
   * the most that fit (Ruling T8-1).
   */
  heads?: number | null;
  /** With `hold`: plan only the held layouts (`versusBest`'s own comparison, colonyChain.ts' `bestsFor`): no other product, no other planet. */
  heldOnly?: boolean;
};
/** Storage facilities and launchpads already standing on a planet (`PlanInput.reserve`). */
export type Reserve = { storage: number; launchpads: number };
/** The factories a planet already runs (`PlanInput.hold`): by product ID (a P1 on Basics, a P2 on Advanced), how many make it. */
export type Hold = Record<number, number>;
export type SetupKind = 'p1' | 'p2' | 'feed' | 'bought' | 'chain';
/**
 * One planet's part. `extracts` is one line an extractor: its P0, the P0 an hour it's worked out at (its rate's lower
 * reading, or the factories' capacity with no rate), its heads (null when neither the rate nor the fit can say).
 */
export type Role = {
  planetId: number; charId: number; does: 'extract' | 'factory' | 'unused';
  /** `setAside`: another P0's learned or a typed rate set aside, its heads more than fit here (Ruling T15b-12): `rate` is then null. */
  extracts: { p0: number; perHour: number; heads: number | null; rate: Rate | null; setAside?: Rate }[];
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
/**
 * A good the setup makes, summed over its planets and sold in one go, so two planets share one market's cap; what doesn't sell builds up.
 * `stays`: what of it isn't offered for sale at all, and why (Ruling T15-5, `keptWhy`): a unit nets nothing after its freight, fees and
 * export tax, or a P0 has no price. `buildingUp` counts it, and what's offered and doesn't sell besides; `sold` is on what's offered,
 * a known nothing when none is. Absent or null when all of it is offered.
 */
export type Output = { id: number; perDay: number; sold: Sold; buildingUp: number; stays?: Kept | null };
/** What of a good stays on its planet, unoffered, and why; `noPrice` when it's a P0 with no price (Ruling F9), else it doesn't pay to ship. */
export type Kept = { perDay: number; why: string; noPrice: boolean };
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

/** Units an hour a schematic takes or makes per factory, from its cycle (colonyChain.ts reads a real colony's factories by it). */
export const anHour = (s: Schematic, qty: number) => (qty * 3600) / s.cycleSeconds;
const atCcu = (level: number) => (level > 0 ? `at Command Center Upgrades ${ROMAN[level]}` : 'without Command Center Upgrades');
export const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** "1-day", or "47.5-hour" for a program that isn't whole days. */
const programSaid = (h: number) => (h % 24 === 0 ? `${h / 24}-day` : `${plainNum(h)}-hour`);
const chosenSaid = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${plainNum(h)} hours`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Ruling T15-5, one rule for every setup and a real colony's chain (colonyChain.ts): a planet ships a good only while a unit nets above
 * nothing after its freight and fees and the planet's export tax on it; the rest stays on the planet, untaxed, building up. It's judged
 * on the first unit, on the side `soldOf` sells first (asked at a sliver, as `unitNet` asks, but never floored at 0: `soldOf` sells that
 * side even at a loss), and `soldOf` takes a later side only where a unit nets above nothing. A tax not known is left out of it, as the
 * setup is ranked before that tax. A P0 with no price stays too (Ruling F9: it sells as P0 where priced, or builds up), a known nothing;
 * any other good with no price is shipped, neither credited nor taxed (the final review's I1). Production is never resized by it: only
 * what's exported. Null when it ships; else why it stays.
 */
export function keptWhy(ix: PiIndex, sold: (id: number, perDay: number) => Sold, id: number, rate: number | null): { why: string; noPrice: boolean } | null {
  // Asked for every planet and good of every arrangement a search values: worked out once a seller, good and rate (a `Sell` is pure).
  let memo = keptMemo.get(sold);
  if (!memo) keptMemo.set(sold, memo = new Map());
  let byRate = memo.get(id);
  if (!byRate) memo.set(id, byRate = new Map());
  if (byRate.has(rate)) return byRate.get(rate)!;
  const kept = keptOf(ix, sold, id, rate);
  byRate.set(rate, kept);
  return kept;
}
const keptMemo = new WeakMap<(id: number, perDay: number) => Sold, Map<number, Map<number | null, { why: string; noPrice: boolean } | null>>>();
function keptOf(ix: PiIndex, sold: (id: number, perDay: number) => Sold, id: number, rate: number | null): { why: string; noPrice: boolean } | null {
  const s = sold(id, SLIVER);
  if (s.isk == null) return ix.byId.get(id)?.tier === 'P0' ? { why: low(s.why ?? 'no price read'), noPrice: true } : null;
  if (!(s.units > 0)) return null;
  const net = s.isk / s.units, tax = (ix.byId.get(id)?.taxBase ?? 0) * (rate ?? 0);
  if (net - tax > 0) return null;
  return {
    why: net > 0 ? `a unit nets ${isk(net)} after freight and fees and pays ${isk(tax)} export tax, so it doesn’t pay to ship`
      : `a unit nets ${isk(net)} after freight and fees, so it doesn’t pay to ship`,
    noPrice: false,
  };
}
/** A good none of which is offered (`keptWhy`): sold nowhere, a known nothing (never a price unread), with why. */
export const keptSold = (why: string): Sold => ({ isk: 0, units: 0, where: [], why, jitaUnits: 0 });
/**
 * Whether an output is a figure at all: none of it valued, or a P0 kept whole for want of a price (`keptWhy`), is no figure. A setup or
 * a colony none of whose outputs is gives no ISK a day, never one made of nothing.
 */
export const valuedOutput = (o: Output) => o.sold.isk != null && !(o.stays?.noPrice && o.stays.perDay >= o.perDay - 1e-6);
/** Whether any of an output leaves its planet for market: none does when all of it is kept (`keptWhy`), as a P0 left over usually is. */
export const shippedOutput = (o: Output) => o.perDay > 0 && !(o.stays && o.stays.perDay >= o.perDay - 1e-6);

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

/**
 * One extractor feeding its Basic factories. `basics` is how many there are: the rate's worth (ceil(P0 an hour ÷ 6,000)), or fewer
 * when that many don't fit (Ruling F9), when `p0Left` is the P0 an hour they can't take, shipped as P0 where it pays, else building up.
 */
type Line = {
  p0: number; p1: number; rate: Rate | null; perHour: number; basics: number; p1PerHour: number; p0Left: number;
  /** Null when not known and nothing learned (the most that fit, T8-1). `headsAssumed`: the median of your learned rates' heads (`headsMedian`), capped where its planet's layout must fit (`capHeads`). */
  heads: number | null; headsAssumed: boolean; headsMedian: number | null;
  /** Another P0's learned rate or a typed one set aside because its heads leave no room here (Ruling T15b-12): the line is then unknown. */
  setAside: Rate | null;
};
function lineOf(b: Schematic, rate: Rate | null, high: boolean, basics?: number, assumed?: number | null, setAside: Rate | null = null): Line {
  const inH = anHour(b, b.inputs[0].qty), outH = anHour(b, b.out.qty);
  // With no rate, the two Basics the 2 + 4 layout gives each P0 (12,000 P0 an hour), said as such, never claimed.
  const perHour = rate ? (high && rate.higher != null ? rate.higher : rate.perHour) : 2 * inH;
  const need = Math.max(0, Math.ceil(perHour / inH - EPS));
  const n = basics == null ? need : Math.min(basics, need);
  // A Basic short of P0 runs fewer cycles; more P0 than the Basics take is left over.
  const taken = Math.min(perHour, n * inH);
  return {
    p0: b.inputs[0].id, p1: b.out.id, rate, perHour,
    basics: n, p1PerHour: (taken * outH) / inH, p0Left: perHour - taken > 1e-6 ? perHour - taken : 0,
    // A rate's heads are what it was measured with; 0 means the colony didn't say (Ruling T8-1). Not known, the median of your
    // learned rates' heads where there is one (Ruling T15b-5), else filled in by `fitted` with the most that fit.
    heads: rate && rate.heads > 0 ? Math.ceil(rate.heads) : assumed ?? null,
    headsAssumed: !(rate && rate.heads > 0) && assumed != null,
    headsMedian: !(rate && rate.heads > 0) && assumed != null ? assumed : null,
    setAside,
  };
}

/**
 * Ruling T15b-12: a line on another P0's learned rate, or a typed one, whose known heads leave no room for the plan's least layout
 * (a Basic a line, and an Advanced for P0 → P2) where it must fit, is treated as unknown: the assumed 12,000 an hour on the capped
 * median heads (T15b-8), said why. On the page case's Barren planets two lines borrowing a 10-head rate left no layout anywhere.
 * The rate is never scaled to fewer heads. A line on its own learned rate keeps its heads: its colony had them.
 */
function setAsideBorrowed(input: PlanInput, p: Plan, at: FitAt, high: boolean): Plan {
  const borrowed = p.lines.filter((l) => l.rate && l.rate.heads > 0 && (l.rate.otherP0 || l.rate.from === 'typed'));
  if (!borrowed.length) return p;
  const least: Counts = { basics: p.lines.map(() => 1), advanced: p.advanced ? 1 : 0 };
  // The least layout with these lines at one head (an unknown line counts one, as `fitsAt` reserves).
  const fitsWith = (down: ReadonlySet<number>) => fitsAt(input.ix, { ...p, lines: p.lines.map((l) => (l.headsAssumed || down.has(l.p0) ? { ...l, heads: 1 } : l)) }, at, least);
  if (fitsWith(new Set())) return p;
  // Only where their heads are the cause (the review of Task 15c): set aside one at a time, the most heads first, until the least
  // layout fits; none when even all of them at one head leave no room (a line of the planet's own makes it fail: said as that).
  const down = new Set<number>();
  for (const l of [...borrowed].sort((a, b) => b.rate!.heads - a.rate!.heads || a.p0 - b.p0)) {
    down.add(l.p0);
    if (fitsWith(down)) break;
  }
  if (!fitsWith(down)) return p;
  const aside = [...down];
  const q = p.advanced ? planP2(input, p.planet, p.at, p.t, p.product, high, undefined, aside)
    : planP1(input, p.planet, p.at, p.t, [p.lines[0].p0, p.lines[1].p0], high, undefined, aside);
  return q ?? p;
}

/**
 * Ruling T15b-8 (revising T15b-5.2): a line whose heads aren't known reserves the median of your learned rates' heads, capped at the
 * most heads that still leave room for its rates' layout where the plan must fit (on the assumed rate, 2 Basics a line, and the
 * Advanced for P0 → P2): at a median of 10, 20 heads beside a launchpad left room for no layout at all on 5-NZNW at CCU IV. Said on
 * the line when the cap binds. When even one head a line leaves no room, as with nothing learned (T8-1): one reserved while F9 fits
 * fewer factories, the most that fit filled in after.
 */
function capHeads(ix: PiIndex, p: Plan, at: FitAt): Plan {
  if (!p.lines.some((l) => l.headsAssumed)) return p;
  const withHeads = (h: number | null, assumed: boolean): Plan => ({ ...p, lines: p.lines.map((l) => (l.headsMedian != null ? { ...l, heads: h, headsAssumed: assumed } : l)) });
  for (let h = Math.max(...p.lines.map((l) => l.headsMedian ?? 0)); h >= 1; h--) {
    const q = withHeads(h, true);
    if (fitsAt(ix, q, at)) return q;
  }
  return withHeads(null, false);
}
/** The same plan's lines carrying another plan's heads (a plan rebuilt with other counts, or on the other reading, keeps its cap). */
const keepHeads = (q: Plan, p: Plan): Plan => ({ ...q, lines: q.lines.map((l, i) => (p.lines[i] && p.lines[i].p0 === l.p0 ? { ...l, heads: p.lines[i].heads, headsAssumed: p.lines[i].headsAssumed, headsMedian: p.lines[i].headsMedian } : l)) });

/** Where a planet's layout must fit (Ruling F9): a Command Center Upgrades level and the planet's radius, beside the storage and launchpads already standing (`PlanInput.reserve`; one launchpad when not said). */
type FitAt = { cc: number; radiusKm: number; storage?: number; launchpads?: number };
/**
 * One planet's arrangement before it's fitted: its extractors, its factories and what it ships. `sized`: 'rate', every extractor's
 * P0 refined (it fits where `fitAt` says, or nothing says where it must); 'fit', fewer factories than the rates feed, the most that fit
 * (Ruling F9); 'over', the rates' layout though the least layout of its kind doesn't fit either (today's: said, with what it lacks);
 * 'held', the factories a colony already runs (`PlanInput.hold`; Ruling T15b-4), as many as its rates feed, fitting or not.
 */
type Plan = {
  planet: PlanPlanet; at: number; t: PlanetType; product: number;
  lines: Line[];
  advanced: { id: number; count: number; perHour: number } | null;
  ships: { id: number; perDay: number }[];
  fitAt: FitAt | null; sized: 'rate' | 'fit' | 'over' | 'held';
  /** The P0s whose borrowed rate is set aside here (Ruling T15b-12), kept through every rebuild of the plan. */
  aside?: readonly number[];
};
/** How many factories a plan takes: the Basics on each line and the Advanced; absent, each rate's worth. */
type Counts = { basics: number[]; advanced: number };

/**
 * P0 → P2: two extractors at their rates, the Basics per P0 ceil(P0 an hour ÷ 6,000), the Advanced ceil(the lesser P1 an hour ÷ 40), or
 * `counts` of them (never an Advanced its Basics don't feed); a surplus P1 is shipped, and the P0 the Basics can't take.
 */
function planP2(input: PlanInput, planet: PlanPlanet, at: number, t: PlanetType, p2: number, high: boolean, counts?: Counts, aside?: readonly number[]): Plan | null {
  const s = input.ix.makes.get(p2);
  if (!s) return null;
  const lines: Line[] = [];
  for (const [k, i] of s.inputs.entries()) {
    const b = input.ix.makes.get(i.id);
    if (!b || b.facility !== 'basic') return null;
    lines.push(lineFor(input, b, t, high, counts?.basics[k], aside));
  }
  // The Advanced factories' worth the lines feed: the lesser input, as a fraction of factories (one runs fewer cycles when short).
  const fed = Math.min(...s.inputs.map((inp, k) => lines[k].p1PerHour / anHour(s, inp.qty)));
  const count = Math.max(0, Math.ceil(fed - EPS));
  const n = counts ? Math.min(counts.advanced, count) : count;
  const runs = Math.min(fed, n);
  const perHour = runs * anHour(s, s.out.qty);
  const ships = [{ id: p2, perDay: perHour * 24 }];
  s.inputs.forEach((inp, k) => {
    const left = lines[k].p1PerHour - runs * anHour(s, inp.qty);
    if (left > 1e-6) ships.push({ id: lines[k].p1, perDay: left * 24 });
  });
  for (const l of lines) if (l.p0Left > 0) ships.push({ id: l.p0, perDay: l.p0Left * 24 });
  return { planet, at, t, product: p2, lines, advanced: { id: p2, count: n, perHour }, ships, fitAt: null, sized: 'rate', ...(aside?.length ? { aside } : {}) };
}

/** A line at its P0's rate, or unknown with its borrowed rate set aside (Ruling T15b-12). */
function lineFor(input: PlanInput, b: Schematic, t: PlanetType, high: boolean, basics: number | undefined, aside?: readonly number[]): Line {
  const r = input.rateOf(t, b.inputs[0].id);
  return aside?.includes(b.inputs[0].id) ? lineOf(b, null, high, basics, input.heads, r) : lineOf(b, r, high, basics, input.heads);
}

/** P0 → P1: two extractors on two of the planet's P0s, each feeding its Basics (each rate's worth, or `counts` of them); both P1s shipped, and the P0 left. */
function planP1(input: PlanInput, planet: PlanPlanet, at: number, t: PlanetType, pair: [number, number], high: boolean, counts?: Counts, aside?: readonly number[]): Plan | null {
  const lines: Line[] = [];
  for (const [k, p0] of pair.entries()) {
    const b = basicFor(input.ix, p0);
    if (!b) return null;
    lines.push(lineFor(input, b, t, high, counts?.basics[k], aside));
  }
  const ships = [...lines.map((l) => ({ id: l.p1, perDay: l.p1PerHour * 24 })), ...lines.filter((l) => l.p0Left > 0).map((l) => ({ id: l.p0, perDay: l.p0Left * 24 }))];
  // `product` names the first P1 only: a P0 → P1 plan is replanned from its lines' P0s.
  return { planet, at, t, product: lines[0].p1, lines, advanced: null, ships, fitAt: null, sized: 'rate', ...(aside?.length ? { aside } : {}) };
}

/** A plan's factories as counts. */
const countsOf = (p: Plan): Counts => ({ basics: p.lines.map((l) => l.basics), advanced: p.advanced?.count ?? 0 });
/** The same planet, product and rates with these counts of factories (on either reading). */
function withCounts(input: PlanInput, p: Plan, high: boolean, c: Counts): Plan | null {
  const q = p.advanced
    ? planP2(input, p.planet, p.at, p.t, p.product, high, c, p.aside)
    : planP1(input, p.planet, p.at, p.t, [p.lines[0].p0, p.lines[1].p0], high, c, p.aside);
  return q && keepHeads(q, p);
}
/** Whether a plan's factories fit at `at`, its extractors at their rates' heads, at least one a head where a rate didn't say how many. */
function fitsAt(ix: PiIndex, p: Plan, at: FitAt, c: Counts = countsOf(p)): boolean {
  const heads = p.lines.reduce((n, l) => n + (l.heads ?? 1), 0);
  return fitOf(ix, p.t, at.cc, { ecus: p.lines.length, heads, basic: c.basics.reduce((n, b) => n + b, 0), advanced: c.advanced, hightech: 0, storage: at.storage ?? 0, launchpads: at.launchpads ?? 1 }, at.radiusKm).fits;
}

/**
 * Ruling F9: a planet's layout is ranked only at what fits at the character's own level (`at`). The rates' layout when it fits;
 * otherwise each way of running fewer factories that fits and has no room for one more (each line at least one Basic and no more
 * than its rate feeds; a P0 → P2 at least one Advanced, and never one its Basics don't feed), every one a plan for the search to
 * value; the P0 the Basics can't take is shipped as P0 where it pays, else it builds up. The heads are always the rate's: a rate is
 * never scaled to fewer heads (a line whose heads aren't known on your learned rates' median, capped first: `capHeads`; with nothing
 * learned, one a head, the rest filled in by `fitted`). When the least layout of its
 * kind doesn't fit either (a Basic a line, and an Advanced for a P0 → P2), the rates' layout, said with what it lacks, as before.
 * A layout that fits only at a higher level is never ranked in its place. Structures already standing (`FitAt.storage`, a
 * colony's own: `PlanInput.reserve`) are fitted beside it.
 */
function fittedPlans(input: PlanInput, base: Plan, at: FitAt | null, high: boolean): Plan[] {
  if (!at) return [base];
  const { ix } = input;
  const p = capHeads(ix, setAsideBorrowed(input, base, at, high), at);
  if (fitsAt(ix, p, at)) return [{ ...p, fitAt: at }];
  const most = p.lines.map((l) => l.basics);
  const two = !!p.advanced;
  // The Advanced a set of Basics feeds: what `planP2` would run with them all.
  const feeds = (basics: number[]) => (two ? withCounts(input, p, high, { basics, advanced: Infinity })?.advanced?.count ?? 0 : 0);
  const out: Plan[] = [];
  const basics = most.map(() => 1);
  const walk = (k: number): void => {
    if (k < most.length) { for (let b = 1; b <= most[k]; b++) { basics[k] = b; walk(k + 1); } return; }
    const bs = basics.slice(), cap = feeds(bs);
    for (let a = two ? 1 : 0; a <= (two ? cap : 0); a++) {
      const c: Counts = { basics: bs, advanced: a };
      if (!fitsAt(ix, p, at, c)) continue;
      // No room for one more factory that would run.
      const more = bs.some((b, i) => b < most[i] && fitsAt(ix, p, at, { basics: bs.map((x, j) => (j === i ? x + 1 : x)), advanced: a }))
        || (two && a < cap && fitsAt(ix, p, at, { basics: bs, advanced: a + 1 }));
      if (more) continue;
      const q = withCounts(input, p, high, c);
      if (q) out.push({ ...q, fitAt: at, sized: 'fit' });
    }
  };
  walk(0);
  return out.length ? out : [{ ...p, fitAt: at, sized: 'over' }];
}

/**
 * Plans per planet, kind, reading and where they must fit, worked out once for an input: the feed and the chain ask again for every
 * product. `fits`: the levels a plan may be sized at, lowest first (one for a single character; the chain's characters' levels): each
 * plan at the lowest that holds it as fewer factories, or its rates' layout, said with what it lacks, when none does. None: what fits
 * isn't checked.
 */
const plansMemo = new WeakMap<PlanInput, Map<string, Plan[]>>();
function plansFor(input: PlanInput, planet: PlanPlanet, at: number, kind: 'p1' | 'p2', high: boolean, fits: readonly FitAt[]): Plan[] {
  const t = planet.type;
  if (!t) return [];
  let memo = plansMemo.get(input);
  if (!memo) plansMemo.set(input, memo = new Map());
  const key = `${at}|${kind}|${high ? 1 : 0}|${fits.map((f) => `${f.cc}:${f.radiusKm}:${f.storage ?? 0}:${f.launchpads ?? 1}`).join(',')}`;
  const held = memo.get(key);
  if (held) return held;
  const base: Plan[] = [];
  if (kind === 'p2') {
    for (const p2 of p2Alone(input.ix, t)) { const p = planP2(input, planet, at, t, p2, high); if (p) base.push(p); }
  } else {
    // Two extractors on two different P0s, every pair the planet has.
    const p0s = input.ix.planetTypes[t].p0;
    for (let i = 0; i < p0s.length; i++) for (let j = i + 1; j < p0s.length; j++) {
      const p = planP1(input, planet, at, t, [p0s[i], p0s[j]], high);
      if (p) base.push(p);
    }
  }
  const out = base.flatMap((p) => {
    for (const f of fits) {
      const r = fittedPlans(input, p, f, high);
      if (r[0].sized !== 'over') return r;
    }
    return fittedPlans(input, p, fits[0] ?? null, high);
  });
  memo.set(key, out);
  return out;
}
/** A plan's factories as a colony runs them (`PlanInput.hold`): each line's Basics and the Advanced, by what they make. */
const holdCounts = (p: Plan, hold: Hold): Counts => ({ basics: p.lines.map((l) => hold[l.p1] ?? 0), advanced: p.advanced ? hold[p.advanced.id] ?? 0 : 0 });
/**
 * A planet's plans with the layout making exactly the products it already runs held to its own factories (`PlanInput.hold`; Ruling
 * T15b-4): the user runs 2 Basics, one for each P1, for each Advanced ("there is no point to it … i would just be overproducing one of
 * the p1's", on a third Basic selling P1), so every F9 way of making those products gives way to one, the colony's own counts (as
 * many as the rates feed), fitted where the others must fit; whether it fits there is `fitted`'s to say. Plans of any other product
 * stand, unless `heldOnly` asks for the held layout alone.
 */
function held(input: PlanInput, plans: Plan[], hold: Hold | undefined): Plan[] {
  if (!hold) return input.heldOnly ? [] : plans;
  const want = Object.keys(hold).map(Number).sort((a, b) => a - b).join(',');
  const productsOf = (p: Plan) => [...new Set([...p.lines.map((l) => l.p1), ...(p.advanced ? [p.advanced.id] : [])])].sort((a, b) => a - b).join(',');
  let done = false;
  const out: Plan[] = [];
  for (const p of plans) {
    if (productsOf(p) !== want) { if (!input.heldOnly) out.push(p); continue; }
    if (done) continue;
    done = true;
    const q = withCounts(input, p, false, holdCounts(p, hold));
    if (q) out.push({ ...q, fitAt: p.fitAt, sized: 'held' });
  }
  return out;
}
/**
 * Where a planet's single-character layout must fit: the character's level on the planet's own radius, beside what `reserve` says
 * already stands there (a launchpad at least); none when its size isn't known (what fits isn't checked).
 */
const fitFor = (planet: PlanPlanet, cc: number, reserve?: Reserve): FitAt[] => (planet.radiusKm != null && planet.radiusKm > 0
  ? [{ cc, radiusKm: planet.radiusKm, ...(reserve ? { storage: reserve.storage, launchpads: Math.max(1, reserve.launchpads) } : {}) }] : []);

/**
 * The same planet and product on the other reading of its rates: sized to it when that fits where the plan must, else the plan's own
 * factories (they fit), with the P0 they can't take left over.
 */
function replan(input: PlanInput, p: Plan, kind: 'p1' | 'p2', high: boolean): Plan {
  // A colony's own factories stay its own on the other reading too (Ruling T15b-4).
  const hold = p.sized === 'held' ? input.hold?.[p.planet.planetId] : undefined;
  if (hold) {
    const q = withCounts(input, p, high, holdCounts(p, hold));
    return q ? { ...q, fitAt: p.fitAt, sized: 'held' } : p;
  }
  const again = kind === 'p2'
    ? planP2(input, p.planet, p.at, p.t, p.product, high, undefined, p.aside)
    : planP1(input, p.planet, p.at, p.t, [p.lines[0].p0, p.lines[1].p0], high, undefined, p.aside);
  if (!again) return p;
  const kept = keepHeads(again, p);
  if (p.sized === 'over' || !p.fitAt || (p.sized === 'rate' && fitsAt(input.ix, kept, p.fitAt))) return { ...kept, fitAt: p.fitAt, sized: p.sized };
  return { ...(withCounts(input, p, high, countsOf(p)) ?? kept), fitAt: p.fitAt, sized: 'fit' };
}
type Ship = { id: number; perDay: number };

/** Export tax per tier on what a planet exports: units × the tier's base × the planet's rate (null when its rate isn't known). */
function exportTax(input: PlanInput, p: Plan, exported: Ship[]): TaxRow[] {
  return taxRows(input.ix, exported, p.planet.tax.rate, 1);
}

/** Customs per tier: units × the tier's base × `factor` (1 to export, ½ to import), times the rate; null when it isn't known. A real colony's chain is taxed by it too (colonyChain.ts). */
export type TaxRow = { tier: Tier; base: number; perDay: number | null };
export function taxRows(ix: PiIndex, ships: Ship[], rate: number | null, factor: number): TaxRow[] {
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
  const cache = new Map<number, Map<number, Sold>>();
  return (id: number, perDay: number): Sold => {
    let byAmount = cache.get(id);
    if (!byAmount) cache.set(id, byAmount = new Map());
    let s = byAmount.get(perDay);
    if (!s) byAmount.set(perDay, s = sell(id, perDay));
    return s;
  };
}
type Seller = (id: number, q: number) => Sold;

/**
 * A set of planets' plans, worked out: each good summed and sold once, what each planet exports, what of that is taxed (the goods
 * that are valued), what each keeps unoffered and why (`keptWhy`), and the ISK after the known tax.
 */
type Assessed = { plans: Plan[]; outputs: Output[]; exports: Ship[][]; taxed: Ship[][]; kept: (Ship & { why: string })[][]; value: number; unpriced: number };

const bySlot = (plans: Plan[]) => [...plans].sort((a, b) => a.at - b.at);

/**
 * Each good is summed over the planets and sold once, so two planets share one market's cap. A planet offers a good only while a
 * unit of it nets above nothing after the planet's export tax (Ruling T15-5, `keptWhy`); what it doesn't offer stays on it, untaxed.
 * What the market takes of what's offered is exported from the planets with the lowest known tax first (then the one listed first; a
 * tax not known last); the rest stays on its planet, building up, and pays no export tax. A good with no price (a P1 or higher) is
 * taken as all exported (nothing says how much of it would build up), and is neither credited nor taxed (the final review's I1): its
 * customs are left out with its sale, so a figure is never made of the tax on what nobody prices.
 */
function assess(input: PlanInput, plansIn: Plan[], sold: Seller): Assessed {
  const { ix } = input;
  const plans = bySlot(plansIn);
  const totals = new Map<number, number>();
  for (const p of plans) for (const s of p.ships) totals.set(s.id, (totals.get(s.id) ?? 0) + s.perDay);
  const tierAt = (id: number) => TIERS_DOWN.indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const taxOrder = plans.map((p, k) => k).sort((a, b) => {
    const ra = plans[a].planet.tax.rate, rb = plans[b].planet.tax.rate;
    return (ra ?? Infinity) - (rb ?? Infinity) || plans[a].at - plans[b].at;
  });
  const exports: Ship[][] = plans.map(() => []), kept: Assessed['kept'] = plans.map(() => []);
  const outputs: Output[] = [];
  for (const [id, perDay] of [...totals.entries()].sort((a, b) => tierAt(a[0]) - tierAt(b[0]) || a[0] - b[0])) {
    // Each planet that makes it offers it, or keeps it with why; what's offered is sold once.
    let offered = 0, held = 0, heldWhy: { why: string; noPrice: boolean } | null = null;
    const offers = new Map<number, number>();
    for (const k of taxOrder) {
      const made = plans[k].ships.find((x) => x.id === id)?.perDay ?? 0;
      if (!(made > 0)) continue;
      const w = keptWhy(ix, sold, id, plans[k].planet.tax.rate);
      if (w) { held += made; heldWhy ??= w; kept[k].push({ id, perDay: made, why: w.why }); } else { offered += made; offers.set(k, made); }
    }
    const s = offered > 0 ? sold(id, offered) : keptSold(heldWhy?.why ?? 'none of it is offered');
    // A good with no price says why; nothing is claimed to build up for it.
    outputs.push({
      id, perDay, sold: s, buildingUp: s.isk == null ? 0 : held + Math.max(0, offered - s.units),
      ...(heldWhy && held > 1e-6 ? { stays: { perDay: held, why: heldWhy.why, noPrice: heldWhy.noPrice } } : {}),
    });
    let left = s.isk == null ? offered : s.units;
    for (const k of taxOrder) {
      const made = offers.get(k) ?? 0;
      if (!(made > 0)) continue;
      const out = Math.min(made, Math.max(0, left));
      left -= out;
      exports[k].push({ id, perDay: out });
    }
  }
  const valued = new Set(outputs.filter((o) => o.sold.isk != null).map((o) => o.id));
  const taxed = exports.map((xs) => xs.filter((x) => valued.has(x.id)));
  let value = outputs.reduce((t, o) => t + (o.sold.isk ?? 0), 0);
  plans.forEach((p, k) => { for (const t of exportTax(input, p, taxed[k])) value -= t.perDay ?? 0; });
  return { plans, outputs, exports, taxed, kept, value, unpriced: outputs.length - valued.size };
}

/**
 * `assess`'s figure alone, for the searches' many comparisons (`choose`, `improve`): the same rule, nothing built for the page. Its
 * sums run in another order than `assess`'s, so it can differ from it by rounding, which `better` reads as the same (`SAME_ISK`).
 */
type Scored = { plans: Plan[]; value: number; unpriced: number };
function scoreOf(input: PlanInput, plansIn: Plan[], sold: Seller): Scored {
  const { ix } = input;
  const plans = bySlot(plansIn);
  const order = plans.map((p, k) => k).sort((a, b) => {
    const ra = plans[a].planet.tax.rate, rb = plans[b].planet.tax.rate;
    return (ra ?? Infinity) - (rb ?? Infinity) || plans[a].at - plans[b].at;
  });
  const ids: number[] = [];
  for (const p of plans) for (const x of p.ships) if (!ids.includes(x.id)) ids.push(x.id);
  let value = 0, unpriced = 0;
  for (const id of ids) {
    let offered = 0;
    for (const k of order) {
      const made = plans[k].ships.find((x) => x.id === id)?.perDay ?? 0;
      if (made > 0 && !keptWhy(ix, sold, id, plans[k].planet.tax.rate)) offered += made;
    }
    // Kept whole: a known nothing, untaxed.
    if (!(offered > 0)) continue;
    const s = sold(id, offered);
    if (s.isk == null) { unpriced++; continue; }
    value += s.isk;
    const base = ix.byId.get(id)?.taxBase ?? 0;
    let left = s.units;
    for (const k of order) {
      if (!(left > 0)) break;
      const rate = plans[k].planet.tax.rate;
      const made = plans[k].ships.find((x) => x.id === id)?.perDay ?? 0;
      if (!(made > 0) || keptWhy(ix, sold, id, rate)) continue;
      const out = Math.min(made, left);
      left -= out;
      if (rate != null) value -= out * base * rate;
    }
  }
  return { plans, value, unpriced };
}

/** Within a hundredth of an ISK is the same: sums of the same figures in another order differ by rounding. */
const SAME_ISK = 0.01;
const better = (a: { value: number; unpriced: number }, b: { value: number; unpriced: number } | null) =>
  !b || a.value > b.value + SAME_ISK || (Math.abs(a.value - b.value) <= SAME_ISK && a.unpriced < b.unpriced);

/**
 * The planets that pay most, up to the character's allowance. First, step by step, the planet and product adding most to
 * the setup so far (a good two planets make shares one market's cap), after the known tax; an output with no price adds
 * nothing to the ranking, never a figure; ties go to the planet listed first, then the first product. Then `improve`.
 */
function choose(input: PlanInput, kind: 'p1' | 'p2', allowed: number, sold: Seller): Plan[] {
  const options = input.planets.map((p, at) => held(input, plansFor(input, p, at, kind, false, fitFor(p, input.char.ccLevel!, input.reserve?.[p.planetId])), input.hold?.[p.planetId]));
  let chosen: Plan[] = [];
  const used = new Set<number>();
  while (chosen.length < allowed) {
    let best: Scored | null = null, pick: Plan | null = null;
    for (let at = 0; at < options.length; at++) {
      if (used.has(at)) continue;
      for (const p of options[at]) {
        const a = scoreOf(input, [...chosen, p], sold);
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
  let now = scoreOf(input, start, sold);
  const tryMove = (): Scored | null => {
    const cur = now.plans;
    const usedAt = new Set(cur.map((p) => p.at));
    for (let i = 0; i < cur.length; i++) {
      for (let at = 0; at < options.length; at++) {
        if (at !== cur[i].at && usedAt.has(at)) continue;
        for (const q of options[at]) {
          if (q === cur[i]) continue;
          const next = cur.slice();
          next[i] = q;
          const a = scoreOf(input, next, sold);
          if (better(a, now)) return a;
          // The goods it shares a market with: what it offers, never what it keeps (Ruling T15-5), which sells nowhere.
          const goods = new Set(q.ships.filter((s) => !keptWhy(input.ix, sold, s.id, q.planet.tax.rate)).map((s) => s.id));
          for (let j = 0; j < cur.length; j++) {
            if (j === i || !cur[j].ships.some((s) => goods.has(s.id))) continue;
            for (const r of options[cur[j].at]) {
              if (r === cur[j]) continue;
              const both = next.slice();
              both[j] = r;
              const b = scoreOf(input, both, sold);
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
  // Beside what already stands there (`PlanInput.reserve`, carried by the plan's `fitAt`), else one launchpad.
  const base: Omit<Layout, 'heads'> = { ecus: p.lines.length, basic: p.lines.reduce((n, l) => n + l.basics, 0), advanced: p.advanced?.count ?? 0, hightech: 0, storage: p.fitAt?.storage ?? 0, launchpads: p.fitAt?.launchpads ?? 1 };
  const heads = p.lines.map((l) => l.heads);
  const r = p.planet.radiusKm;
  if (r == null || !(r > 0)) {
    notes.push('this planet’s size isn’t known, so what fits isn’t checked');
    return { heads, fit: null, notes, lacks: null };
  }
  const unsaid = p.lines.filter((l) => l.rate && !(l.rate.heads > 0));
  if (unsaid.length) notes.push(`the colony didn’t say how many heads its extractors had${unsaid[0].headsAssumed ? `, so ${headsSaid(unsaid[0])}` : ': the most that fit'}`);
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

/** A line whose heads aren't known with nothing learned, or no room even for one under the median: filled in by `fitted` (T8-1). */
const MOST_HEADS = 'at the most heads that fit beside its factories';
/** A line's heads not known and not assumed, said as `fitted` fills them: the most that fit; none when the layout doesn't fit (its 'over'); not checked with no size. */
const unknownHeads = (p: Plan) => (!p.fitAt ? 'its heads not known' : p.sized === 'over' ? 'with no head fitting beside its factories' : MOST_HEADS);
/** An assumed head count, said (Rulings T15b-5, T15b-8): the median, or the most that fit under it. */
const headsSaid = (l: Line) => {
  const n = l.heads!, m = l.headsMedian!, hs = (k: number) => `${k} head${k === 1 ? '' : 's'}`;
  return n >= m ? `at ${hs(n)}, the median of your extractors’ learned rates` : `at ${hs(n)}: your extractors’ median is ${m}, and no more fit beside its factories`;
};
/** What a role says about its rates: from another program length, another P0, or none (ranked at the factories' capacity). */
function rateNotes(input: PlanInput, p: Plan): string[] {
  const notes: string[] = [];
  const name = (id: number) => input.ix.byId.get(id)?.name ?? `#${id}`;
  const none = p.lines.filter((l) => !l.rate && !l.setAside);
  for (const typed of [false, true]) {
    const aside = p.lines.filter((l) => l.setAside && (l.setAside.from === 'typed') === typed);
    if (!aside.length) continue;
    const hs = Math.max(...aside.map((l) => l.setAside!.heads));
    notes.push(`${listSaid(aside.map((l) => name(l.p0)))}: ${typed ? 'your typed rate' : 'another P0’s rate'} is at ${hs} head${hs === 1 ? '' : 's'}, more than fit here, so ranked at what the factories make if your extractors deliver ${unitsSaid(aside[0].perHour)} P0 an hour each, ${aside[0].headsAssumed ? headsSaid(aside[0]) : unknownHeads(p)}`);
  }
  if (none.length) notes.push(`no rate for ${listSaid(none.map((l) => name(l.p0)))}: ranked at what the factories make if your extractors deliver ${unitsSaid(none[0].perHour)} P0 an hour each, ${none[0].headsAssumed ? headsSaid(none[0]) : unknownHeads(p)}`);
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

/** Why a setup none of whose outputs is valued has no figure: the outputs' own reasons, each once ("No home hub picked: …"). */
const unvaluedWhy = (outputs: Output[]) => cap([...new Set(outputs.map((o) => o.sold.why ?? 'no price read'))].join('; '));

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
  // Nothing it makes is valued (no home hub picked, say): no figure, never one made of customs alone; the outputs' own reasons say why.
  if (outputs.length && !outputs.some(valuedOutput)) return blocked(input, kind, unvaluedWhy(outputs), []);
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
    // What it keeps unoffered (Ruling T15-5) and what the market doesn't take stay on the planet, building up, and pay no export tax.
    const kept = now.kept[k];
    const over = p.ships
      .map((s) => ({ id: s.id, perDay: s.perDay - (exported.find((e) => e.id === s.id)?.perDay ?? 0) - (kept.find((e) => e.id === s.id)?.perDay ?? 0) }))
      .filter((s) => s.perDay > 1e-6);
    const fitSaid = fitNote(p, exported);
    const notes = [...rateNotes(input, p), ...f.notes, ...(fitSaid ? [fitSaid] : []), ...staysNotes(name, kept, over)];
    return {
      planetId: planet.planetId, charId: char.charId, does: 'extract',
      extracts: p.lines.map((l, i) => ({ p0: l.p0, perHour: l.perHour, heads: f.heads[i], rate: l.rate, ...(l.setAside ? { setAside: l.setAside } : {}) })),
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
  plans.forEach((p, k) => { for (const t of exportTax(input, p, now.taxed[k])) {
    taxes.push({ planetId: p.planet.planetId, tier: t.tier, perDay: t.perDay });
    if (t.perDay == null) perPctBase += t.base;
  } });
  const taxKnown = taxes.every((t) => t.perDay != null);
  const unvalued = outputs.filter((o) => o.sold.isk == null).length;
  const iskDay = now.value;

  // The higher reading: the same planets and products, sized to it within what fits (Ruling F9), each planet's way the one that pays
  // most beside the others'.
  const anyHigher = plans.some((p) => p.lines.some((l) => l.rate?.higher != null));
  let iskDayHigh: number | null = null;
  if (anyHigher) {
    let high = plans.map((p) => replan(input, p, kind, true));
    let worth = assess(input, high, sold);
    plans.forEach((p, i) => {
      const again = kind === 'p2' ? planP2(input, p.planet, p.at, p.t, p.product, true) : planP1(input, p.planet, p.at, p.t, [p.lines[0].p0, p.lines[1].p0], true);
      if (!again || p.sized === 'over' || p.sized === 'held' || !p.fitAt) return;
      for (const q of fittedPlans(input, again, p.fitAt, true)) {
        const next = high.slice();
        next[i] = q;
        const a = assess(input, next, sold);
        if (better(a, worth)) { high = next; worth = a; }
      }
    });
    iskDayHigh = worth.value;
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

/**
 * What a good's first unit fetches, net: the most a unit can add, for the search's bounds (0 when it has no price). Asked at a sliver
 * of a unit: `slotDay` fills the best side first, so that is exactly the best side's net, where `sold(id, 1)`'s average blended in
 * the next side whenever the best one's cap at your share is under one a day (a P4's, usually), and the bounds then understated an
 * arrangement making less than that (Task 10's minor, the final review). `Sell`'s contract (concave) makes it a bound at every amount.
 */
export function unitNet(sold: (id: number, perDay: number) => Sold, id: number): number {
  const s = sold(id, SLIVER);
  return s.isk != null && s.units > 0 ? Math.max(0, s.isk / s.units) : 0;
}
/** The amount `unitNet` asks about: far under any one a day a market takes at your share. */
const SLIVER = 1e-6;

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
  /** Per class, per good: why a feeder of it keeps the good rather than shipping it to market (Ruling T15-5, `keptWhy`), or null; and per good, whether any class does. */
  kept: ({ why: string; noPrice: boolean } | null)[][]; keeps: boolean[];
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

/**
 * What the line's P1 would fetch alone, after its export tax, and the P0 its Basics can't take where that pays to ship (Ruling T15-5):
 * how the second extractor of a feeder is chosen.
 */
function lineNet(ix: PiIndex, sold: Seller, l: Line, rate: number | null): number {
  const s = sold(l.p1, l.p1PerHour * 24);
  if (s.isk == null) return -Infinity;
  let v = s.isk - s.units * (ix.byId.get(l.p1)?.taxBase ?? 0) * (rate ?? 0);
  if (l.p0Left > 0 && !keptWhy(ix, sold, l.p0, rate)) {
    const z = sold(l.p0, l.p0Left * 24);
    if (z.isk != null) v += z.isk - z.units * (ix.byId.get(l.p0)?.taxBase ?? 0) * (rate ?? 0);
  }
  return v;
}

/**
 * Where a class's feeders must fit (Ruling F9): on the class's largest planet, at the levels of the characters the setup may use,
 * lowest first, so a feeder sized at the lowest that holds it fits wherever it's placed with that character or one above (a placement
 * can't move what the search valued, and placement puts a colony with a character it fits at first). None when no planet of it has a
 * known size (what fits isn't checked).
 */
function feederFits(c: Cls, levels: readonly number[]): FitAt[] {
  const radii = c.members.map((m) => m.planet.radiusKm).filter((r): r is number => r != null && r > 0);
  return radii.length ? [...new Set(levels)].sort((a, b) => a - b).map((cc) => ({ cc, radiusKm: Math.max(...radii) })) : [];
}

/**
 * The feeders that can make X here. Each is one of a class's P0 → P1 plans with an extractor on a P1 X takes, or a P2 X takes
 * made alone, at what fits at the levels given (`feederFits`; the shown character's when not given). A planet's second extractor is on a
 * P0 the factory doesn't take only when that's all it has left, and then on the one that pays most alone (plans alike for the
 * factory differ only in that). Null when some P1 X takes no planet ships.
 */
function fedCtx(input: PlanInput, sold: Seller, classes: Cls[], x: number, levels: readonly number[] = input.char.ccLevel == null ? [] : [input.char.ccLevel]): FedCtx | null {
  const { ix } = input;
  const tree = treeOf(ix, x);
  if (!tree) return null;
  const goods: number[] = [...tree.kinds, ...tree.p2.keys()];
  const gi = new Map(goods.map((g, i) => [g, i]));
  const kinds = new Set(tree.kinds);
  const raw: { cls: number; plan: Plan }[] = [];
  classes.forEach((c, ci) => {
    const m = c.members[0], fit = feederFits(c, levels);
    // One feeder for each set of P0s it feeds the factory from, as before Ruling F9: of the ways it runs at the level that holds it, one
    // that fits before one that doesn't, then the most Basics on those P0s, the most even between them, and its other line paying most.
    // Every way a feeder of its own made the chain's search run out of its budget where it used to finish (Task 9's brute force: 3 of
    // 240 systems cut, one 30% short).
    const rank = (p: Plan, useful: Line[], other: number) => [p.sized === 'over' ? 0 : 1, useful.reduce((n, l) => n + l.basics, 0), Math.min(...useful.map((l) => l.basics)), other];
    const ahead = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
    const keep = new Map<string, { plan: Plan; rank: number[] }>();
    for (const p of plansFor(input, m.planet, m.at, 'p1', false, fit)) {
      const useful = p.lines.filter((l) => kinds.has(l.p1));
      if (!useful.length) continue;
      const key = useful.map((l) => l.p0).join(',');
      const r = rank(p, useful, p.lines.filter((l) => !kinds.has(l.p1)).reduce((n, l) => n + lineNet(ix, sold, l, c.rate), 0));
      const held = keep.get(key);
      if (!held || ahead(r, held.rank)) keep.set(key, { plan: p, rank: r });
    }
    for (const k of keep.values()) raw.push({ cls: ci, plan: k.plan });
    // A P2 made alone: the way that makes most of it, then the most Basics, the most even.
    const p2s = new Map<number, { plan: Plan; rank: number[] }>();
    if (tree.p2.size) for (const p of plansFor(input, m.planet, m.at, 'p2', false, fit)) {
      if (!tree.p2.has(p.product)) continue;
      const r = [p.sized === 'over' ? 0 : 1, p.advanced?.count ?? 0, ...rank(p, p.lines, 0).slice(1, 3)];
      const held = p2s.get(p.product);
      if (!held || ahead(r, held.rank)) p2s.set(p.product, { plan: p, rank: r });
    }
    for (const k of p2s.values()) raw.push({ cls: ci, plan: k.plan });
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
  const kept = classes.map((c) => goods.map((g) => keptWhy(ix, sold, g, c.rate)));
  return {
    input, sold, tree, classes, goods, eqs, feeders, byEq,
    relieves: feeders.map((f) => Float64Array.from(eqs, (eq) => relief(f.ships, eq))),
    perX: Float64Array.from(eqs, (eq) => eq.alpha + eq.terms.reduce((m, t) => m + t.per * t.beta, 0)),
    p2: [...tree.p2.entries()].map(([id, e]) => ({ g: gi.get(id)!, id, beta: e.beta, perFactory: e.perFactory })),
    pX, cmin, topShip, topMarket, topWorth,
    byMarket: order((ci) => topMarket[ci]), byShip: goods.map((_, g) => order((ci) => topShip[ci][g])), byWorth: order((ci) => topWorth[ci]),
    byTax: feeders.map((_, i) => i).sort((a, b) => byRate(classes[feeders[a].cls].rate, classes[feeders[b].cls].rate) || a - b),
    base: Float64Array.from(goods, (g) => ix.byId.get(g)?.taxBase ?? 0), buf: new Float64Array(goods.length), spare: new Float64Array(goods.length),
    kept, keeps: goods.map((_, g) => kept.some((row) => row[g] != null)),
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
  /** What's left of each good past the factory's draw: what of it is offered to market (`sold` on that), and what's kept unoffered and why (Ruling T15-5). */
  surplus: { g: number; perDay: number; offered: number; sold: Sold; kept: Kept | null }[];
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
  // The feeders in the arrangement, the lowest tax first (walking every feeder for every good was most of the time on twenty
  // planets at their own rates).
  const present: number[] = [];
  for (const i of ctx.byTax) if (counts[i] > 0) present.push(i);
  // What's left past the factory's draw is offered to market by the feeders a unit pays to ship from (Ruling T15-5): the factory draws
  // from the lowest tax first, and a feeder that keeps the good keeps what it has left of it, untaxed.
  const surplus: FedValue['surplus'] = [];
  for (let g = 0; g < G; g++) {
    const left = S[g] - used[g];
    if (!(left > 1e-6)) continue;
    if (!ctx.keeps[g]) { surplus.push({ g, perDay: left, offered: left, sold: sold(goods[g], left), kept: null }); continue; }
    let draw = used[g], offered = 0, held: { why: string; noPrice: boolean } | null = null;
    for (const i of present) {
      const have = counts[i] * feeders[i].ships[g];
      if (!(have > 0)) continue;
      const a = Math.min(have, draw);
      draw -= a;
      const w = ctx.kept[feeders[i].cls][g];
      if (w) held ??= w; else offered += have - a;
    }
    offered = Math.min(left, offered);
    const kept = held && left - offered > 1e-6 ? { perDay: left - offered, why: held.why, noPrice: held.noPrice } : null;
    surplus.push({ g, perDay: left, offered, sold: offered > 1e-6 ? sold(goods[g], offered) : keptSold(held?.why ?? 'none of it is offered'), kept });
  }
  // What sells is exported and taxed. A good with no price is taken as all shipped out (nothing says how much of it would build
  // up), and neither credited nor taxed (the final review's I1): its export tax is left out with its sale. What the factory takes
  // of it is taxed as ever.
  const toSell = new Float64Array(G), unpricedOut = new Float64Array(G);
  for (const s of surplus) { if (s.sold.isk == null) unpricedOut[s.g] = s.offered; else toSell[s.g] = Math.min(s.offered, s.sold.units); }
  const fRate = classes[f].rate;
  const xSold = soldX.isk == null ? 0 : soldX.units;
  let value = soldX.isk ?? 0;
  for (const s of surplus) value += s.sold.isk ?? 0;
  for (let g = 0; g < G; g++) {
    if (!ctx.keeps[g]) {
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
    } else {
      // The factory's draw first, then what sells, from the feeders that offer it only.
      let draw = used[g], sell = toSell[g];
      for (const i of present) {
        if (!(draw > 0) && !(sell > 0)) break;
        const have = counts[i] * feeders[i].ships[g];
        if (!(have > 0)) continue;
        const a = Math.min(have, draw);
        draw -= a;
        const b = ctx.kept[feeders[i].cls][g] ? 0 : Math.min(have - a, sell);
        sell -= b;
        const r = classes[feeders[i].cls].rate;
        if (r != null) value -= (a + b) * ctx.base[g] * r;
      }
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
  // feeder shows its part of what the factory takes. A good nobody prices is added to market after, untaxed (below).
  const inst: number[] = [];
  counts.forEach((n, i) => { for (let k = 0; k < n; k++) inst.push(i); });
  const order = inst.map((_, k) => k).sort((a, b) => byRate(classes[feeders[inst[a]].cls].rate, classes[feeders[inst[b]].cls].rate) || a - b);
  v.toFactory = inst.map(() => new Float64Array(G));
  v.toMarket = inst.map(() => new Float64Array(G));
  for (let g = 0; g < G; g++) {
    const out = used[g] + toSell[g];
    if (!(out > 0)) continue;
    if (ctx.keeps[g]) {
      // A feeder that keeps the good (Ruling T15-5) sends the factory its part and nothing to market: the factory's draw first.
      let draw = used[g], sell = toSell[g];
      for (const k of order) {
        const have = feeders[inst[k]].ships[g];
        if (!(have > 0)) continue;
        const a = Math.min(have, draw);
        draw -= a;
        const b = ctx.kept[feeders[inst[k]].cls][g] ? 0 : Math.min(have - a, sell);
        sell -= b;
        v.toFactory[k][g] = a;
        v.toMarket[k][g] = b;
      }
      continue;
    }
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
  // What nobody prices goes to market too, untaxed, from what each feeder has left of it (after the taxes above, so they leave it out).
  for (let g = 0; g < G; g++) {
    let left = unpricedOut[g];
    for (const k of order) {
      if (!(left > 0)) break;
      const room = feeders[inst[k]].ships[g] - v.toFactory[k][g] - v.toMarket[k][g];
      if (!(room > 0)) continue;
      const a = Math.min(room, left);
      left -= a;
      v.toMarket[k][g] += a;
    }
  }
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
      const plan = remake(ctx.feeders[feeders[k].item].plan, feeders[k].member);
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
/**
 * Chunks of arrangements between the search's steps (Ruling T11-13): the page drives a setup's steps in slices of a few
 * milliseconds, so a long search never holds the page as one task. A count, never a clock, so the planner stays pure and the same
 * steps give the same answer however they're driven. Two chunks are about a millisecond on 5-NZNW (18 October 2026).
 */
const STEP_CHUNKS = 2;
/**
 * A setup worked out a step at a time: each `next()` does a bounded piece of the work and the last returns the setup. Everything the
 * search holds (each product's place, the budget, what's still open) lives in the generator, so where it stopped is where it goes on.
 */
export type Steps<T> = Generator<void, T, void>;
/** A setup's steps run to the end, in one go: the plain calls (`planFeed`, `planChain`, `planSystem`) and the tests. */
export function drain<T>(steps: Steps<T>): T {
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}

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
function* searchPools(pools: Pool[], budget: Budget): Steps<void> {
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
  let chunks = 0;
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
    if (++chunks % STEP_CHUNKS === 0) yield;
  }
  if (live.some(open)) budget.cut = true;
}

/** The best arrangement over the targets given, for one set of characters, within the budget, in steps. */
function* bestFed(ctxs: FedCtx[], who: Who[], budget: Budget): Steps<Searched> {
  const pool: Pool = { ctxs, who, best: searched() };
  yield* searchPools([pool], budget);
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

/**
 * A feeder's plan on the planet it was placed on: the same lines and factories (what the search valued; `feederFits` sized it to fit
 * on any planet of its class), that planet's name and place.
 */
const remake = (p: Plan, m: Member): Plan => ({ ...p, planet: m.planet, at: m.at });

const tierRank = (ix: PiIndex, id: number) => TIERS_DOWN.indexOf(ix.byId.get(id)?.tier ?? 'P0');
const stayNote = (stays: string[]) => `${listSaid(stays)} a day stay on the planet, building up: the market takes no more, so they aren’t exported or taxed`;
/**
 * What stays on a planet, said: each good it keeps unoffered, with why (Ruling T15-5: it doesn't pay to ship, or a P0 has no price),
 * then what's offered and the market doesn't take.
 */
function staysNotes(name: (id: number) => string, kept: readonly { id: number; perDay: number; why: string }[], over: readonly Ship[]): string[] {
  const notes = kept.filter((x) => x.perDay > 1e-6).map((x) => `${amountSaid(x.perDay)} ${name(x.id)} a day stay on the planet: ${x.why}`);
  if (over.length) notes.push(stayNote(over.map((x) => `${amountSaid(x.perDay)} ${name(x.id)}`)));
  return notes;
}
/**
 * Ruling F9: a planet run with fewer factories than its rates feed says how many fit at what level, what they take of the P0 its
 * extractors give, and what becomes of the rest (`exported`: what the planet ships to market).
 */
function fitNote(p: Plan, exported: readonly Ship[], owner?: number): string | null {
  if (p.sized !== 'fit' || !p.fitAt) return null;
  const b = p.lines.reduce((n, l) => n + l.basics, 0), a = p.advanced?.count ?? 0;
  const all = p.lines.reduce((n, l) => n + l.perHour, 0), left = p.lines.reduce((n, l) => n + l.p0Left, 0);
  const p0s = new Set(p.lines.map((l) => l.p0));
  const out = exported.filter((x) => p0s.has(x.id)).reduce((n, x) => n + x.perDay, 0) / 24;
  const fate = out >= left - 1e-6 ? 'sells as P0' : out <= 1e-6 ? 'builds up' : 'partly sells as P0 and partly builds up';
  const take = a ? 'the Basics take' : b === 1 ? 'it takes' : 'they take';
  // A chain's feeder is sized at the lowest of its characters' levels that holds it (Ruling T15b-2): with its owner higher, it's said
  // as what it is, never as if the planet's level held no more.
  if (owner != null && owner > p.fitAt.cc) {
    const what = a ? `${b} Basic${b === 1 ? '' : 's'} and ${a} Advanced` : `${b} Basic${b === 1 ? '' : 's'}`;
    return `${what}, sized for ${p.fitAt.cc > 0 ? `Command Center Upgrades ${ROMAN[p.fitAt.cc]}` : 'no Command Center Upgrades'}, the lowest among this chain’s characters, so it fits whoever runs it: ${take} ${unitsSaid(all - left)} of the ${unitsSaid(all)} P0 an hour; the rest ${fate}`;
  }
  const what = a ? `${b} Basic${b === 1 ? '' : 's'} and ${a} Advanced fit` : `${b} Basic${b === 1 ? ' fits' : 's fit'}`;
  return `${what} ${atCcu(p.fitAt.cc)}: ${take} ${unitsSaid(all - left)} of the ${unitsSaid(all)} P0 an hour; the rest ${fate}`;
}

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
    const plan = remake(fd.plan, pl.member);
    const fit = fitted(input, plan, who[pl.char].cc);
    if (fit.lacks) lacks[pl.char].add(fit.lacks);
    colonies[pl.char]++;
    const ships: Role['ships'] = [];
    // What it keeps unoffered (Ruling T15-5), with why, and what's offered and the market doesn't take.
    const kept: { id: number; perDay: number; why: string }[] = [], over: Ship[] = [];
    goods.forEach((id, g) => {
      if (v.toFactory[k][g] > 1e-6) ships.push({ id, perDay: v.toFactory[k][g], to: factoryId });
      if (v.toMarket[k][g] > 1e-6) ships.push({ id, perDay: v.toMarket[k][g], to: 'market' });
      const left = fd.ships[g] - v.toFactory[k][g] - v.toMarket[k][g];
      if (!(left > 1e-6)) return;
      const w = ctx.kept[fd.cls][g];
      if (w) kept.push({ id, perDay: left, why: w.why }); else over.push({ id, perDay: left });
    });
    const fitSaid = fitNote(plan, ships.filter((x) => x.to === 'market'), who[pl.char].cc);
    const notes = [...rateNotes(input, plan), ...fit.notes, ...(fitSaid ? [fitSaid] : []), ...staysNotes(name, kept, over)];
    return {
      planetId: pl.member.planet.planetId, charId: who[pl.char].c.charId, does: 'extract',
      extracts: plan.lines.map((l, i) => ({ p0: l.p0, perHour: l.perHour, heads: fit.heads[i], rate: l.rate, ...(l.setAside ? { setAside: l.setAside } : {}) })),
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
  if (v.R - v.run > 1e-6) fNotes.push(`the market takes ${amountSaid(v.run)} ${name(tree.x)} a day, so the factory runs for that: what its planets ship beyond it goes to market as it is, or stays on them`);
  if (v.run - xSold > 1e-6) fNotes.push(stayNote([`${amountSaid(v.run - xSold)} ${name(tree.x)}`]));
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
    ...v.surplus.map((s) => ({ id: goods[s.g], perDay: s.perDay, sold: s.sold, buildingUp: s.sold.isk == null ? 0 : Math.max(0, s.perDay - Math.min(s.offered, s.sold.units)), ...(s.kept ? { stays: s.kept } : {}) })),
  ].sort((a, b) => tierRank(ix, a.id) - tierRank(ix, b.id) || a.id - b.id);
  const unvalued = outputs.filter((o) => o.sold.isk == null).length;
  // Nothing it makes valued: no figure, as P0 → P2 (the final review's I1). Its product is priced to be searched at all
  // (`fedTargets`), so this is a guard, not a path seen.
  if (!outputs.some(valuedOutput)) return blocked(input, kind, unvaluedWhy(outputs), []);

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

/** Each product of these tiers that's priced, as a search's context: a step each, since a context walks every class's plans. */
function* fedTargets(input: PlanInput, sold: Seller, classes: Cls[], tiers: Tier[], levels: readonly number[]): Steps<FedCtx[]> {
  const out: FedCtx[] = [];
  for (const c of input.ix.commodities) {
    if (!tiers.includes(c.tier) || sold(c.id, 1).isk == null) continue;
    const ctx = fedCtx(input, sold, classes, c.id, levels);
    if (ctx) out.push(ctx);
    yield;
  }
  return out;
}

/**
 * Extraction planets feeding one factory planet: some planets make P1 (or a P2 alone) and ship it to one planet of the
 * system that makes a P2 or P3 from it, sized to what it's fed, every feeder needed. This includes the three P2s no planet
 * makes alone. Each feeder pays export tax; the factory pays import tax at half its rate, and export tax on what it sells.
 */
export const planFeed = (input: PlanInput): Setup => drain(planFeedSteps(input));
/** `planFeed` a step at a time (`Steps`), for the page to drive in slices. */
export function* planFeedSteps(input: PlanInput): Steps<Setup> {
  const { char } = input;
  const cw = charWhy(char);
  if (cw) return blocked(input, 'feed', cw, char.alpha === true ? ['Omega'] : []);
  if (!input.planets.some((p) => p.type)) return blocked(input, 'feed', NO_PI_HERE, []);
  const allowed = char.planets!;
  if (allowed < 2) return blocked(input, 'feed', `A factory planet and one to feed it take 2 planets: you have ${allowed}`, []);
  const sold = seller(input.sell);
  const ctxs = yield* fedTargets(input, sold, classesOf(input), ['P2', 'P3'], [char.ccLevel!]);
  if (!ctxs.length) return blocked(input, 'feed', 'Nothing a factory here could make from this system’s planets is priced', []);
  const who: Who[] = [{ c: char, cap: allowed, cc: char.ccLevel! }];
  const budget: Budget = { left: input.budget ?? SEARCH_BUDGET, cut: false };
  const { b: best, tried, tooBig } = yield* bestFed(ctxs, who, budget);
  yield;
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
export const planChain = (input: PlanInput): Setup => drain(planChainSteps(input));
/** `planChain` a step at a time (`Steps`), for the page to drive in slices: the search's chunks, and each product's context and cover. */
export function* planChainSteps(input: PlanInput): Steps<Setup> {
  const { char } = input;
  const cw = charWhy(char);
  if (cw) return blocked(input, 'chain', cw, char.alpha === true ? ['Omega'] : []);
  if (!input.planets.some((p) => p.type)) return blocked(input, 'chain', NO_PI_HERE, []);
  const seen = new Set<number>();
  const usable: Who[] = [char, ...input.others].filter((c) => !seen.has(c.charId) && seen.add(c.charId) && charWhy(c) == null)
    .map((c) => ({ c, cap: c.planets!, cc: c.ccLevel! }));
  const sold = seller(input.sell);
  const classes = classesOf(input);
  // Its extraction planets are sized at the lowest level of the characters it may use that holds them (Ruling F9, `feederFits`).
  const levels = usable.map((w) => w.cc);
  const p4 = yield* fedTargets(input, sold, classes, ['P4'], levels);
  const p3 = yield* fedTargets(input, sold, classes, ['P3'], levels);
  if (!p4.length && !p3.length) return blocked(input, 'chain', 'Nothing a chain here could make from this system’s planets is priced', []);
  // Which products one character can make alone: a covering search each, a step each.
  const alone = (ctxs: FedCtx[]) => ctxs.map((ctx) => () => coverable(ctx, usable.slice(0, 1)));
  const p3Many: FedCtx[] = [];
  for (const [k, covers] of alone(p3).entries()) { if (!covers()) p3Many.push(p3[k]); yield; }
  const many = [...p4, ...p3Many];
  if (!many.length) return blocked(input, 'chain', `No P4 is priced here, and every P3 made here fits in your ${char.planets} planets (the feed plans those)`, []);

  const p4Alone: FedCtx[] = [];
  for (const [k, covers] of alone(p4).entries()) { if (covers()) p4Alone.push(p4[k]); yield; }
  const pools: Pool[] = [{ ctxs: p4Alone, who: usable.slice(0, 1), best: searched() }];
  for (let k = 2; k <= usable.length; k++) pools.push({ ctxs: many, who: usable.slice(0, k), best: searched() });
  const budget: Budget = { left: input.budget ?? CHAIN_BUDGET, cut: false };
  yield* searchPools(pools, budget);
  yield;
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
    for (const ctx of many) { yield; if (coverable(ctx, who)) { short = more; break; } }
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
/** `taxUnit`: its import and export tax a unit (`taxUnitOf`), worked out once and kept here. */
type BuyOpt = { cls: number; x: number; facility: Facility; n: number; perFactory: number; inputs: { id: number; per: number }[]; alone: number; taxUnit?: number };
/**
 * A good's worth to a bought setup, as a curve with its kinks (`kinksOf`): what a product's output fetches, or minus what an input's
 * intake costs, at each amount a day from 0 to `to`, a straight line between. `to`: what the market takes of a product (past it, what's
 * made builds up and fetches nothing more), or what the places supply of an input (`Bought.max`), else as far as any setup could need;
 * `capped` when it's what the market takes or supplies, which then holds what the planets make.
 */
type Curve = { x: number[]; y: number[]; to: number; capped: boolean };
/**
 * A set's sizing (`sizeSet`): each planet's amount a day, the set's worth there (`worthOf`, the figure shown), the linear programme's
 * own optimum (`lp`, which equals it: the tests' consistency check), the restocks a week, whether a planet is sized to nothing, and
 * why it can't be bought when an input is refused outright. `unsettled` when the programme stopped short of its optimum (Ruling
 * T11-12): refused too, but nothing to do with what's bought, so never a reason an input can't be bought.
 */
type Sizing = { q: number[]; value: number; lp: number; upkeep: number; zeroed: boolean; refused: string | null; unsettled?: true };
/** Why a set the linear programme didn't settle isn't sized (Ruling T11-12): never seen in 5,500 programmes and every gate. */
const UNSETTLED = 'the sizing didn’t settle';
/** What `sizeSet` keeps on the context: each good's curves, and each group of linked planets' sizing by its options. */
type BuyMemo = { sells: Map<number, Curve>; buys: Map<string, Curve | string | null>; reach: Map<string, number>; sized: Map<string, Sizing> };
/**
 * `buyWhy`: the first reason an input couldn't be bought at the amount a factory planet needs (its hub too thin for a week's need), so
 * a setup blocked by it says that rather than that nothing pays. `memo`: `sizeSet`'s, made on first use (a context made by hand, as the
 * tests' brute force makes them, gets one too).
 */
type BuyCtx = { input: PlanInput; sold: Seller; buy: Buyer; classes: Cls[]; opts: BuyOpt[]; buyWhy: string | null; memo?: BuyMemo };
/**
 * `limit`: what holds each planet's factories below what fits: what the market takes of its product ('market'), an input whose supply
 * ran out (its ID), the last unit that pays even alone ('pays'), or the last that pays beside the other planets of the setup ('joint');
 * null when every factory that fits runs.
 */
type BoughtValue = { score: Score; q: number[]; limit: ('market' | 'pays' | 'joint' | number | null)[]; sold: Map<number, Sold>; need: Map<number, number>; bought: Map<number, Bought>; tax: TaxRow[][]; restocks: number[] };

/** The most evaluations `kinksOf` makes of one curve; past it, the curve is what was found (the chord between). */
const KINK_EVALS = 400;
/**
 * The kinks of a concave, piecewise-linear `f` on [0, `to`], with f(0) = 0 (Ruling T11-11): amounts `x` from 0 to `to` and `f` there,
 * a straight line between each two. `Sell` and `Buy` are closures, so the kinks (a sale's sides stepping down, a book's levels, the
 * places) are found from the curve, not read: on an interval, `f` on the chord through its ends at a ten-thousandth in from each end
 * is a line there (concave, so four points on one line are a line); otherwise the tangents at the ends meet at `c`, and `f(c)` on both
 * is one kink there (three points on each line), put exactly where two chords well clear of it meet; else `c` splits the interval. A
 * step a kink, never unit by unit. A curve that isn't piecewise linear is taken at up to `KINK_EVALS` points. Pure.
 */
export function kinksOf(f: (q: number) => number, to: number): { x: number[]; y: number[] } {
  if (!(to > 0)) return { x: [0], y: [0] };
  let evals = 0;
  const at = (q: number) => { evals++; return f(q); };
  const fto = at(to);
  const pts = new Map<number, number>([[0, 0], [to, fto]]);
  const stack: [number, number, number, number][] = [[0, 0, to, fto]];
  while (stack.length && evals < KINK_EVALS) {
    const [a, fa, b, fb] = stack.pop()!;
    const w = b - a;
    if (!(w > to * 1e-12)) continue;
    const h = w * 1e-4;
    const fa1 = at(a + h), fb1 = at(b - h);
    const chord = (fb - fa) / w;
    const scale = Math.max(Math.abs(fa), Math.abs(fb), Math.abs(fa1), Math.abs(fb1));
    if (Math.abs(fa1 - (fa + chord * h)) <= 1e-11 * scale + 1e-12 && Math.abs(fb1 - (fb - chord * h)) <= 1e-11 * scale + 1e-12) continue;
    const sa = (fa1 - fa) / h, sb = (fb - fb1) / h;
    let c = sa > sb ? (fb - fa + sa * a - sb * b) / (sa - sb) : NaN;
    if (!(c > a + h && c < b - h)) c = a + w / 2;
    const fc = at(c);
    const tol = 1e-10 * Math.max(scale, Math.abs(fc)) + 1e-12;
    if (Math.abs(fc - (fa + sa * (c - a))) <= tol && Math.abs(fc - (fb + sb * (c - b))) <= tol) {
      // One kink: where the chords from each end to halfway to it meet.
      const m1 = a + (c - a) / 2, m2 = c + (b - c) / 2;
      const s1 = (at(m1) - fa) / (m1 - a), s2 = (fb - at(m2)) / (b - m2);
      const k = s1 > s2 ? (fb - fa + s1 * a - s2 * b) / (s1 - s2) : c;
      if (k > m1 && k < m2) pts.set(k, at(k)); else pts.set(c, fc);
      continue;
    }
    pts.set(c, fc);
    stack.push([c, fc, b, fb], [a, fa, c, fc]);
  }
  const x = [...pts.keys()].sort((p, q) => p - q);
  return { x, y: x.map((q) => pts.get(q)!) };
}

/** An option's tax a unit: the import tax on its inputs at half the rate and the export tax on it (none while the rate isn't known: ranked before it). */
function taxUnitOf(ctx: BuyCtx, o: number): number {
  const opt = ctx.opts[o];
  if (opt.taxUnit != null) return opt.taxUnit;
  const { ix } = ctx.input;
  const rate = ctx.classes[opt.cls].rate;
  opt.taxUnit = [...taxRows(ix, opt.inputs.map((i) => ({ id: i.id, perDay: i.per })), rate, 0.5), ...taxRows(ix, [{ id: opt.x, perDay: 1 }], rate, 1)]
    .reduce((t, r) => t + (r.perDay ?? 0), 0);
  return opt.taxUnit;
}

/**
 * What a set of factory planets is worth a day at amounts `q`: each product summed and sold once, each input summed and bought once,
 * each planet's taxes; nothing bought or sold of a good at an amount of 0. −Infinity when an input is refused at its amount (past
 * what its market supplies). The sizing's figure is this at the amounts it sizes. Pure.
 */
function worthOf(ctx: BuyCtx, inst: number[], q: number[]): number {
  const sales = new Map<number, number>(), need = new Map<number, number>();
  let v = 0;
  inst.forEach((o, k) => {
    const opt = ctx.opts[o];
    sales.set(opt.x, (sales.get(opt.x) ?? 0) + q[k]);
    for (const i of opt.inputs) need.set(i.id, (need.get(i.id) ?? 0) + q[k] * i.per);
    v -= taxUnitOf(ctx, o) * q[k];
  });
  for (const [x, n] of sales) if (n > 0) v += ctx.sold(x, n).isk ?? 0;
  for (const [id, n] of need) {
    if (!(n > 0)) continue;
    const b = ctx.buy(id, n);
    if (b.isk == null) return -Infinity;
    v -= b.isk;
  }
  return v;
}

/** A planet's restocks a week (Ruling T11-4): a visit empties and refills its launchpad, on what's brought in and what's made. */
function restocksOf(ctx: BuyCtx, o: number, q: number): number {
  const { ix } = ctx.input, opt = ctx.opts[o];
  const m3 = opt.inputs.reduce((n, i) => n + q * i.per * (ix.byId.get(i.id)?.volume ?? 0), 0) + q * (ix.byId.get(opt.x)?.volume ?? 0);
  return (m3 * 7) / ix.planetTypes[ctx.classes[opt.cls].t].pins.launchpad.capacity;
}

const memoOf = (ctx: BuyCtx): BuyMemo => (ctx.memo ??= { sells: new Map(), buys: new Map(), reach: new Map(), sized: new Map() });
/** The most a day any setup of these options could make of a product (`side` 'x') or take of an input ('in'): every planet of every class at full. */
function reachOf(ctx: BuyCtx, side: 'x' | 'in', id: number): number {
  const memo = memoOf(ctx), key = `${side}${id}`;
  let r = memo.reach.get(key);
  if (r == null) {
    r = 0;
    for (const o of ctx.opts) {
      const per = side === 'x' ? (o.x === id ? 1 : 0) : o.inputs.find((i) => i.id === id)?.per ?? 0;
      r += o.n * o.perFactory * per * ctx.classes[o.cls].members.length;
    }
    memo.reach.set(key, r);
  }
  return r;
}
/** A product's sale curve: what sells is concave in the amount (`Sell`'s contract); past what the market takes (`Sold.units`), flat. */
function sellCurve(ctx: BuyCtx, x: number): Curve {
  const memo = memoOf(ctx);
  let c = memo.sells.get(x);
  if (!c) {
    const D = reachOf(ctx, 'x', x);
    const s = ctx.sold(x, D);
    // Where the market stops taking more, exactly as the sale says it: no kink to find there.
    const M = s.isk == null ? 0 : s.units < D * (1 - 1e-12) ? Math.max(0, s.units) : D;
    c = { ...kinksOf((q) => ctx.sold(x, q).isk ?? 0, M), to: M, capped: M < D };
    memo.sells.set(x, c);
  }
  return c;
}
/**
 * An input's cost curve, negated (so concave, by `Buy`'s contract), up to what the places supply (`Bought.max`) or as far as any setup
 * could need. An input with no `max` refused at that (only a buy made by hand does that) is refused outright at what the set's factories
 * take at full, as before the sizing was exact (carry 5), and known up to it otherwise: its reason when refused.
 */
function buyCurve(ctx: BuyCtx, id: number, full: number): Curve | string {
  const memo = memoOf(ctx);
  const curve = (to: number, capped: boolean): Curve | string => {
    const k = kinksOf((q) => { const b = ctx.buy(id, q); return b.isk == null ? NaN : -b.isk; }, to);
    return k.y.every(Number.isFinite) ? { ...k, to, capped } : ctx.buy(id, to).why ?? 'no price read';
  };
  let c = memo.buys.get(`${id}`);
  if (c === undefined) {
    const D = reachOf(ctx, 'in', id);
    const b = ctx.buy(id, D);
    c = b.isk != null ? curve(D, false) : b.max != null ? curve(Math.max(0, Math.min(D, b.max)), true) : null;
    memo.buys.set(`${id}`, c);
  }
  if (c !== null) return c;
  const key = `${id}@${full}`;
  let d = memo.buys.get(key);
  if (d === undefined) {
    const b = ctx.buy(id, full);
    d = b.isk == null ? b.why ?? 'no price read' : curve(full, false);
    memo.buys.set(key, d);
  }
  return d!;
}

/**
 * Ruling T11-11: a group of linked planets (sharing a product or an input) sized exactly, by a linear programme over their amounts
 * (`lp.ts`). The setup's worth is concave and piecewise linear in them (revenue concave, purchases convex, taxes and upkeep a unit), so
 * it is: each planet's amount (up to its factories), the units sold at each step of each product's sale curve (each up to the step's
 * depth; what's made past what sells builds up), the units bought at each step of each input's cost curve (each up to its depth, so
 * what the places supply holds it); what's bought of an input equals what the planets use; the objective is sales less purchases less
 * each planet's taxes a unit. The figure is `worthOf` at the programme's amounts, and equals its optimum (the tests check). `comp`: the
 * options, in order.
 */
function sizeGroup(ctx: BuyCtx, comp: number[]): Sizing {
  const { opts } = ctx;
  const K = comp.length;
  const U = comp.map((o) => opts[o].n * opts[o].perFactory);
  const xs = [...new Set(comp.map((o) => opts[o].x))].sort((a, b) => a - b);
  const ins = [...new Set(comp.flatMap((o) => opts[o].inputs.map((i) => i.id)))].sort((a, b) => a - b);
  const perOf = (k: number, id: number) => opts[comp[k]].inputs.find((i) => i.id === id)?.per ?? 0;
  const none: Sizing = { q: comp.map(() => 0), value: 0, lp: 0, upkeep: 0, zeroed: true, refused: null };
  // Columns: the planets' amounts, then each product's sale steps that pay, then each input's buy steps.
  const c: number[] = comp.map((o) => -taxUnitOf(ctx, o));
  const hi: number[] = U.slice();
  const owner: number[] = comp.map(() => -1);
  const steps = (cv: Curve, upTo: number, keep: (slope: number) => boolean, row: number) => {
    for (let j = 0; j + 1 < cv.x.length && cv.x[j] < upTo; j++) {
      const w = Math.min(cv.x[j + 1], upTo) - cv.x[j], slope = (cv.y[j + 1] - cv.y[j]) / (cv.x[j + 1] - cv.x[j]);
      if (!(w > 0) || !keep(slope)) continue;
      c.push(slope); hi.push(w); owner.push(row);
    }
  };
  const caps: { id: number; to: number }[] = [];
  xs.forEach((x, r) => steps(sellCurve(ctx, x), comp.reduce((n, o, k) => n + (opts[o].x === x ? U[k] : 0), 0), (s) => s > 0, r));
  for (const [r, id] of ins.entries()) {
    const full = comp.reduce((n, _o, k) => n + U[k] * perOf(k, id), 0);
    const cv = buyCurve(ctx, id, full);
    if (typeof cv === 'string') return { ...none, refused: cv };
    if (cv.capped) caps.push({ id, to: cv.to });
    steps(cv, full, () => true, xs.length + r);
  }
  const rows = [...xs.map((x) => ({ x, eq: false })), ...ins.map((id) => ({ x: id, eq: true }))].map((row, r) => {
    const a = c.map((_v, j) => (j < K ? (r < xs.length ? (opts[comp[j]].x === row.x ? -1 : 0) : -perOf(j, row.x)) : owner[j] === r ? 1 : 0));
    return { a, b: 0, eq: row.eq };
  });
  const sol = maximise({ c, hi, rows }, ctx.input.maxPivots != null ? { maxPivots: ctx.input.maxPivots } : {});
  // Only an optimum is the set's exact best, which the search's prune (`cur + topFrom`) rests on: anything else is refused, and the
  // setup says its figure is the best of what was tried (Ruling T11-12). Every column is bounded and Bland's rule can't cycle, so
  // this is the pivot cap reached.
  if (sol.status !== 'optimal') return { ...none, refused: UNSETTLED, unsettled: true };
  const q = sol.x.slice(0, K).map((v, k) => Math.min(U[k], Math.max(0, v)));
  // An input at what the places supply: the programme's amounts can land a rounding over it; held to it, so a strict closure prices it.
  for (const { id, to } of caps) {
    const need = q.reduce((n, v, k) => n + v * perOf(k, id), 0);
    if (need > to) { const f = (to / need) * (1 - 1e-14); for (let k = 0; k < K; k++) if (perOf(k, id) > 0) q[k] *= f; }
  }
  for (let k = 0; k < K; k++) if (!(q[k] > 1e-9 * Math.max(1, U[k]))) q[k] = 0;
  const value = worthOf(ctx, comp, q);
  if (!Number.isFinite(value)) {
    const id = ins.find((i) => ctx.buy(i, q.reduce((n, v, k) => n + v * perOf(k, i), 0)).isk == null);
    return { ...none, refused: (id != null ? ctx.buy(id, q.reduce((n, v, k) => n + v * perOf(k, id), 0)).why : null) ?? 'no price read' };
  }
  return { q, value, lp: sol.value, upkeep: comp.reduce((n, o, k) => n + restocksOf(ctx, o, q[k]), 0), zeroed: q.some((v) => !(v > 0)), refused: null };
}

/**
 * A set of factory planets sized together (Ruling T11-11): planets linked by a product or an input are sized as one group (`sizeGroup`),
 * kept by the group's options so a group met again in the search isn't sized again; groups sharing nothing are independent, and their
 * figures add. `zeroed` when a planet is sized to nothing: the set is then worth what the others are.
 */
function sizeSet(ctx: BuyCtx, inst: number[]): Sizing {
  const memo = memoOf(ctx), { opts } = ctx;
  const root = inst.map((_, k) => k);
  const find = (k: number): number => (root[k] === k ? k : (root[k] = find(root[k])));
  const first = new Map<string, number>();
  inst.forEach((o, k) => {
    for (const g of [`x${opts[o].x}`, ...opts[o].inputs.map((i) => `i${i.id}`)]) {
      const j = first.get(g);
      if (j == null) first.set(g, k); else root[find(k)] = find(j);
    }
  });
  const groups = new Map<number, number[]>();
  inst.forEach((_, k) => { const r = find(k); const g = groups.get(r) ?? []; g.push(k); groups.set(r, g); });
  const out: Sizing = { q: inst.map(() => 0), value: 0, lp: 0, upkeep: 0, zeroed: false, refused: null };
  for (const ks of groups.values()) {
    ks.sort((a, b) => inst[a] - inst[b] || a - b);
    const comp = ks.map((k) => inst[k]), key = comp.join(',');
    let s = memo.sized.get(key);
    if (!s) memo.sized.set(key, s = sizeGroup(ctx, comp));
    if (s.refused) return { ...out, refused: s.refused, zeroed: true, ...(s.unsettled ? { unsettled: true as const } : {}) };
    ks.forEach((k, t) => { out.q[k] = s!.q[t]; });
    out.value += s.value; out.lp += s.lp; out.upkeep += s.upkeep;
    out.zeroed ||= s.zeroed;
  }
  return out;
}

/** A set with every planet the sizing zeroes taken out, again until none is: the same worth (a planet at nothing adds nothing). Null when nothing is left or it's refused. */
function liveOf(ctx: BuyCtx, inst: number[], s: Sizing): { inst: number[]; s: Sizing } | null {
  for (let left = inst.length; s.zeroed && !s.refused && left-- > 0;) {
    const q = s.q;
    inst = inst.filter((_, k) => q[k] > 0);
    if (!inst.length) return null;
    s = sizeSet(ctx, inst);
  }
  return s.refused || s.zeroed ? null : { inst, s };
}

/**
 * Factory planets on bought inputs, worked out together (Ruling T11-11): each good summed and sold once, so two planets share one
 * market; each input summed and bought once, so they share what its places supply; each planet paying import tax at half its rate on
 * what it buys and export tax on what it sells; every planet's amount sized at once to the setup's most (`sizeSet`), so no unit in the
 * figure loses money. Null when an input can't be bought at the amount, or a planet is sized to nothing.
 */
function valueBought(ctx: BuyCtx, inst: number[]): BoughtValue | null {
  const { input, sold, buy, classes, opts } = ctx;
  const { ix } = input;
  const s = sizeSet(ctx, inst);
  if (s.refused) { if (!s.unsettled) ctx.buyWhy ??= s.refused; return null; }
  if (s.zeroed) return null;
  const q = s.q;
  const byX = new Map<number, number[]>();
  inst.forEach((o, k) => { const xs = byX.get(opts[o].x) ?? []; xs.push(k); byX.set(opts[o].x, xs); });
  const soldBy = new Map<number, Sold>();
  for (const [x, ks] of byX) soldBy.set(x, sold(x, ks.reduce((n, k) => n + q[k], 0)));
  const need = new Map<number, number>();
  inst.forEach((o, k) => { for (const i of opts[o].inputs) need.set(i.id, (need.get(i.id) ?? 0) + q[k] * i.per); });
  let value = 0;
  for (const v of soldBy.values()) value += v.isk ?? 0;
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
  const restocks = inst.map((o, k) => restocksOf(ctx, o, q[k]));
  // What holds each planet below what fits, in order: an input whose places' supply it reached, what the market takes of its product,
  // its last paying unit (where it would stop alone too), else the other planets' share of a market or a supply.
  const at = (v: number, to: number) => v >= to * (1 - 1e-9) - 1e-9;
  const limit: BoughtValue['limit'] = inst.map((o, k) => {
    const opt = opts[o];
    if (at(q[k], opt.n * opt.perFactory)) return null;
    for (const i of opt.inputs) {
      const cv = memoOf(ctx).buys.get(`${i.id}`);
      if (cv && typeof cv !== 'string' && cv.capped && at(need.get(i.id) ?? 0, cv.to)) return i.id;
    }
    const sc = sellCurve(ctx, opt.x);
    if (sc.capped && at(byX.get(opt.x)!.reduce((n, j) => n + q[j], 0), sc.to)) return 'market';
    const alone = sizeSet(ctx, [o]);
    return !alone.refused && at(q[k], alone.q[0]) ? 'pays' : 'joint';
  });
  return { score: { value, unpriced: 0, upkeep: restocks.reduce((n, x) => n + x, 0) }, q, limit, sold: soldBy, need, bought, tax, restocks };
}

/** The bought setup's context: the planets in classes alike for it, and each product a class could make whose sale and inputs price at one unit. */
function boughtCtx(input: PlanInput): { ctx: BuyCtx; inputWhy: string | null; anyPriced: boolean } {
  const { char, ix } = input;
  const cc = char.ccLevel!;
  const sold = seller(input.sell), buy = buyer(input.buy);
  const counts = new Map<number, [number, number]>();
  const nOf = (p: PlanPlanet, t: PlanetType): [number, number] | null => {
    if (p.radiusKm == null || !(p.radiusKm > 0)) return null;
    let n = counts.get(p.planetId);
    if (!n) counts.set(p.planetId, n = [maxFactories(ix, t, cc, 'advanced', 1, p.radiusKm), maxFactories(ix, t, cc, 'hightech', 1, p.radiusKm)]);
    return n;
  };
  const classes = classesOf(input, (p, t) => { const n = nOf(p, t); return n ? `${t}|${p.tax.rate ?? '?'}|${n[0]}|${n[1]}` : null; });
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
  return { ctx, inputWhy, anyPriced };
}

/**
 * What factory planets on bought inputs make, sized exactly (Ruling T11-11): each pick a planet and the product it makes. `value` is the
 * figure the planner shows (`worthOf` at the amounts), `lp` the linear programme's own optimum, which equals it, `q` each pick's amount a
 * day. Null when a pick can't be made there or isn't priced, an input is refused, or a planet is sized to nothing. For the tests.
 */
export function sizeBought(input: PlanInput, picks: { planetId: number; x: number }[]): { value: number; lp: number; q: number[] } | null {
  if (charWhy(input.char)) return null;
  const { ctx } = boughtCtx(input);
  const inst: number[] = [];
  for (const p of picks) {
    const ci = ctx.classes.findIndex((c) => c.members.some((m) => m.planet.planetId === p.planetId));
    const o = ctx.opts.findIndex((op) => op.cls === ci && op.x === p.x);
    if (ci < 0 || o < 0) return null;
    inst.push(o);
  }
  const v = valueBought(ctx, inst);
  return v && { value: v.score.value, lp: sizeSet(ctx, inst).lp, q: v.q };
}

/**
 * A factory planet on bought inputs: each planet allowed buys its inputs through `buy` and makes a P2 or P3, or a P4 on
 * Barren or Temperate (where High-Tech plants fit), from one recipe step. Every product and planet assignment is searched,
 * the products by what each would make alone, each set sized exactly (`sizeSet`), and a branch skipped when the set's worth and
 * what the products still to add make alone can't beat the best so far.
 */
export function planBought(input: PlanInput): Setup {
  const { char, ix } = input;
  const cw = charWhy(char);
  if (cw) return blocked(input, 'bought', cw, char.alpha === true ? ['Omega'] : []);
  if (!input.planets.some((p) => p.type)) return blocked(input, 'bought', NO_PI_HERE, []);
  const cc = char.ccLevel!, allowed = char.planets!;
  const { ctx, inputWhy, anyPriced } = boughtCtx(input);
  const { classes } = ctx;
  const sizeWhy = 'This planet’s size isn’t known, so how many factories fit isn’t known';
  if (!classes.length) return blocked(input, 'bought', sizeWhy, []);
  // Each option alone, sized exactly: the most it can add to any set (revenue concave and costs convex, a planet beside others adds
  // no more than alone), which the search's bound rests on. A sizing that didn't settle marks the setup cut, never a reason an input
  // can't be bought (Ruling T11-12).
  let unsettled = false;
  const refusal = (s: Sizing) => { if (s.unsettled) unsettled = true; else if (s.refused) ctx.buyWhy ??= s.refused; };
  ctx.opts.forEach((o, i) => {
    const s = sizeSet(ctx, [i]);
    refusal(s);
    o.alone = s.refused || s.zeroed ? -Infinity : s.value;
  });
  const byAlone = ctx.opts.map((_, i) => i).filter((i) => ctx.opts[i].alone > SAME_ISK)
    .sort((a, b) => ctx.opts[b].alone - ctx.opts[a].alone || byRate(classes[ctx.opts[a].cls].rate, classes[ctx.opts[b].cls].rate) || a - b);
  // Priced at one unit, an input can still be refused at the amount a planet's factories take (a hub too thin for a week's need):
  // when that is what stopped every product, it is the reason, never "nothing pays" (Task 10's re-review).
  const noneValued = ctx.opts.every((o) => o.alone === -Infinity);
  const paysWhy = () => (noneValued && ctx.buyWhy ? `No input can be bought in the amount its factories need: ${ctx.buyWhy}`
    : `No product here pays more than its inputs cost${ctx.buyWhy ? `, and some inputs can’t be bought in the amount needed: ${ctx.buyWhy}` : ''}`);
  const unsettledWhy = `No product here could be sized exactly: ${UNSETTLED}`;
  // Not one sized because the sizing never settled (and no input was refused): said as that, never "nothing pays". Asked again at
  // the end, after the search has met more sets.
  const onlyUnsettled = () => unsettled && !ctx.buyWhy;
  if (!byAlone.length) {
    const why = noneValued && onlyUnsettled() ? unsettledWhy
      : anyPriced ? paysWhy() : inputWhy ? `No product here has every input priced to buy: ${inputWhy}` : 'Nothing a factory here could make is priced';
    return unsettled ? { ...blocked(input, 'bought', why, []), cut: true } : blocked(input, 'bought', why, []);
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
  const budgetCut = () => tries < 0;
  const dfs = (start: number, cur: number, curUpkeep: number, left: number) => {
    for (let j = start; j < byAlone.length; j++) {
      const o = ctx.opts[byAlone[j]];
      if (room[o.cls] <= 0) continue;
      if (best && !mayBeat(cur + topFrom(j, left), curUpkeep, best.score)) break;
      if (tries-- <= 0) { cut = true; return; }
      room[o.cls]--; inst.push(byAlone[j]);
      const s = sizeSet(ctx, inst);
      // Sized exactly, `s.value` is the set's most, so `cur + topFrom` bounds every set grown from it. A set the sizing zeroes a planet
      // in is worth what the rest are (they stand for it), and is no dead end: a planet added can bring the zeroed one back. A refused
      // set stops (refusal only grows with what's bought); one that didn't settle has no exact best to bound from, so stops too, cut.
      if (s.refused) refusal(s);
      else {
        const live = s.zeroed ? liveOf(ctx, inst.slice(), s) : { inst, s };
        if (live) {
          const score = { value: live.s.value, unpriced: 0, upkeep: live.s.upkeep };
          if (beats(score, best?.score ?? null)) best = { score, inst: live.inst.slice() };
        }
        if (left > 1) dfs(j, s.value, s.upkeep, left - 1);
      }
      inst.pop(); room[o.cls]++;
    }
  };
  dfs(0, 0, 0, allowed);
  const chosen = best as { score: Score; inst: number[] } | null;
  cut ||= unsettled;
  if (!chosen) return { ...blocked(input, 'bought', budgetCut() ? RAN_OUT : onlyUnsettled() ? unsettledWhy : paysWhy(), []), ...(cut ? { cut: true as const } : {}) };
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
          : lim === 'joint'
            // Held beside the setup's other planets (Ruling T11-8): what the market here pays after their share, or what their inputs cost.
            ? [`${count} of the ${opt.n} factories that fit run, for ${amountSaid(v.q[k])} ${name(opt.x)} a day: past that, a unit costs more to make than the market here pays, after the other planets’ share`]
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

/** The five setups, in the order they're worked out (and ranked from, ties going to the earlier). */
export const SETUP_KINDS: readonly SetupKind[] = ['p1', 'p2', 'feed', 'bought', 'chain'];
/**
 * One setup a step at a time (Ruling T11-13): feed and chain yield through their searches, the others are one step. The page drives
 * these in slices of a few milliseconds; drained, each is the plain call's answer.
 */
export function* planSteps(input: PlanInput, kind: SetupKind): Steps<Setup> {
  if (kind === 'feed') return yield* planFeedSteps(input);
  if (kind === 'chain') return yield* planChainSteps(input);
  return kind === 'bought' ? planBought(input) : planSingle(input, kind);
}

/** All five setups for the system and character, ranked. The user's own P0 → P2 is always among them. */
export function planSystem(input: PlanInput): Setup[] {
  return rankSetups(SETUP_KINDS.map((k) => drain(planSteps(input, k))));
}
