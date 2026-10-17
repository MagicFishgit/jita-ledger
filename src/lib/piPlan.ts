import type { PlanetType } from './pi';
import { madeAlone, type Facility, type PiIndex, type Schematic, type Tier } from './piBundle';
import { fitOf, maxHeads, type Fit, type Layout } from './piFit';
import type { Rate } from './piLearn';
import type { Tax } from './planetsDoc';
import type { Freight } from './industryRank';
import { units as unitsSaid, plainNum } from './format';

/**
 * The Planets planner (docs/superpowers/specs/2026-10-17-planets-design.md, "The setup types"): for a chosen system and
 * character, which planet does what, what fits, every output valued, the customs tax and the upkeep. This part plans one
 * planet at a time: P0 → P1 and P0 → P2 on each planet. Pure: no config, store, React or DOM.
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
export type Sell = (typeId: number, perDay: number) => Sold;
/** What `perDay` units cost a day to buy, and where; null with `why` when not known. */
export type Bought = { isk: number | null; where: 'jita' | 'home' | null; why: string | null };
export type Buy = (typeId: number, perDay: number) => Bought;
export type PlanInput = {
  ix: PiIndex; planets: PlanPlanet[]; char: PlanChar; others: PlanChar[];
  rateOf: (t: PlanetType, p0: number) => Rate | null;
  sell: Sell; buy: Buy;
  /** How often you reset, as a program length in hours. */
  programHours: number;
  /** The freight route from the home hub to Jita, for the contracts a week; absent or null, none is counted. */
  freight?: Freight | null;
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
  fit: Fit | null; why: string | null;
};
/** A good the setup makes, summed over its planets and sold in one go, so two planets share one market's cap; what doesn't sell builds up. */
export type Output = { id: number; perDay: number; sold: Sold; buildingUp: number };
export type Upkeep = { resetsPerWeek: number; restocksPerWeek: number; haulM3PerWeek: number; jitaM3PerWeek: number; contractsPerWeek: number | null };
export type Setup = {
  kind: SetupKind;
  /** On each rate's lower reading; before what `before` lists. */
  iskDay: number | null;
  /** The same arrangement on each rate's higher reading; null when every rate used is checked. */
  iskDayHigh: number | null;
  before: ('tax' | 'extraction' | 'price')[];
  /** Null when any planet's tax isn't known. */
  taxDay: number | null;
  /** What each 1% of customs tax costs a day on the planets whose tax isn't known (ranked before it); 0 when every tax is known. */
  perPct: number;
  taxes: { planetId: number; tier: Tier; perDay: number | null }[];
  outputs: Output[];
  inputs: { id: number; perDay: number; bought: Bought }[];
  roles: Role[];
  upkeep: Upkeep;
  perChar: { charId: number; iskDay: number | null; lacks: string[] }[];
  /** Outputs whose price isn't read: counted out of the ISK, never as 0. */
  unvalued: number;
  why: string | null;
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
function exportTax(input: PlanInput, p: Plan, exported: Ship[]): { tier: Tier; base: number; perDay: number | null }[] {
  const byTier = new Map<Tier, number>();
  for (const s of exported) {
    const c = input.ix.byId.get(s.id);
    if (!c || !(s.perDay > 0)) continue;
    byTier.set(c.tier, (byTier.get(c.tier) ?? 0) + s.perDay * c.taxBase);
  }
  const rate = p.planet.tax.rate;
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

/** The lowest Command Center Upgrades level the layout fits at, when one above the character's would. */
function lacksFor(input: PlanInput, p: Plan, cc: number, base: Omit<Layout, 'heads'>, r: number, heads: (number | null)[]): string | null {
  const total = heads.reduce<number>((n, h) => n + (h ?? 0), 0);
  for (let l = cc + 1; l < input.ix.planetTypes[p.t].cc.length; l++) {
    if (fitOf(input.ix, p.t, l, { ...base, heads: total }, r).fits) return `Command Center Upgrades ${ROMAN[l]}`;
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
    upkeep: { resetsPerWeek: 0, restocksPerWeek: 0, haulM3PerWeek: 0, jitaM3PerWeek: 0, contractsPerWeek: null },
    perChar: [{ charId: input.char.charId, iskDay: null, lacks }], unvalued: 0, why,
  };
}

/** Units of a sale that go to Jita: as `soldOf` splits them, else all when Jita is the only place. */
const jitaUnits = (s: Sold) => s.jitaUnits ?? (s.where.length === 1 && s.where[0] === 'jita' ? s.units : 0);

/**
 * Upkeep: a reset a planet each program; m³ a week hauled to market and the share sold at Jita; freight contracts a week,
 * batched up to the route's minimum (5 M at 900 ISK a m³ is worth paying on about 5,556 m³), else a week's batch in one.
 */
export function upkeepOf(input: PlanInput, outputs: Output[], planets: number, restocksPerWeek = 0): Upkeep {
  const vol = (id: number) => input.ix.byId.get(id)?.volume ?? 0;
  // Shipped to market: what sells (all of a good with no price); what builds up stays on its planet.
  const haul = outputs.reduce((t, o) => t + (o.perDay - o.buildingUp) * vol(o.id) * 7, 0);
  const jita = outputs.reduce((t, o) => t + jitaUnits(o.sold) * vol(o.id) * 7, 0);
  const f = input.freight;
  const batch = f && f.min != null && f.min > 0 && f.perM3 > 0 ? f.min / f.perM3 : null;
  return {
    resetsPerWeek: input.programHours > 0 ? (planets * HOURS_A_WEEK) / input.programHours : 0,
    restocksPerWeek, haulM3PerWeek: haul, jitaM3PerWeek: jita,
    contractsPerWeek: !f ? null : !(jita > 0) ? 0 : batch != null ? jita / Math.max(batch, jita) : 1,
  };
}

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
