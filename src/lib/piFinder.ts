import type { Graph } from './jumps';
import type { PlanetType } from './pi';
import { decodeRadii, p0Of, planetTypeOf, type PiIndex, type Region } from './piBundle';
import { missingFor, planSteps, rankSetups, SELLS, type PlanInput, type PlanPlanet, type Setup, type SetupKind } from './piPlan';
import { rateFor, type LearnedMap, type OwnLearned } from './piLearn';
import { customsRate, type PlanetsDoc, type Tax } from './planetsDoc';

/**
 * The system finder (planets-finder.md): every system of a region planned for one good, so the best place to build it can be found.
 * The user (24 October 2026): "something like a feature to find which system to build in for the chosen good would be the best in a
 * given region". A planet's richness is in no API or static data (eve-planets.md), so each system is planned on what is certain (its
 * planets' types and sizes, from CCP's static data) and the user's own rates: learned by planet type, and a planet's own where they
 * have a colony on it. Pure: the page drives `finderSteps` in slices, as Plan drives `planSteps`.
 */

/**
 * The setups the finder runs: the ones Plan it ranks for one character's planets. The chain spans characters, and a factory on bought
 * inputs uses none of the system's planets, so neither tells one system from another for you.
 */
export const FINDER_KINDS: readonly SetupKind[] = ['p1', 'p2', 'feed'];

/** The finder's kinds that can make a good of its tier: P0 → P1 for a P1, P0 → P2 and the feed for a P2, the feed for a P3; none for a P4 or a P0. */
export function finderKinds(ix: PiIndex, good: number): SetupKind[] {
  const tier = ix.byId.get(good)?.tier;
  return tier ? FINDER_KINDS.filter((k) => SELLS[k].tiers.includes(tier)) : [];
}

/** Why the finder plans nothing for a good, or null when it can. */
export function finderWhy(ix: PiIndex, good: number): string | null {
  const g = ix.byId.get(good);
  if (!g) return 'The planets’ data doesn’t know this good';
  if (g.tier === 'P0') return `${g.name} comes straight out of the ground: pick a good made from it`;
  if (g.tier === 'P4') return `${g.name} is a P4: the planner makes a P4 as a chain (across characters, or one character’s planets), which the finder doesn’t run. Plan it on Plan, system by system`;
  return null;
}

export type FinderPlanet = { planetId: number; radiusKm: number; typeId: number; type: PlanetType | null };
/**
 * A system of the region, from the bundle alone (no ESI read): its PI planets with their sizes and types. Its name and security are the
 * stargate map's (to 3 decimals; checked on 24 October 2026 to move no system across a band), or the region's own for a system no
 * stargate reaches; null when neither has it. `onMap`: on the stargate map, so it has a route.
 */
export type FinderSystem = { id: number; name: string | null; security: number | null; onMap: boolean; planets: FinderPlanet[] };

export function regionSystems(ix: PiIndex, region: Region, radii: Record<string, number[]>, graph: Graph): FinderSystem[] {
  return region.systems.map((id, i) => {
    const g = graph[String(id)];
    const planets = decodeRadii(radii[String(id)] ?? []).map(([planetId, radiusKm, typeId]) => ({ planetId, radiusKm, typeId, type: planetTypeOf(ix, typeId) }));
    return { id, name: region.names?.[i] || g?.[1] || null, security: region.securities?.[i] ?? g?.[0] ?? null, onMap: !!g, planets };
  });
}

/** The region a system is in: piBundle.ts' (see there), kept here for the finder's callers. */
export { regionOf } from './piBundle';

/** The PI planet types a system has, each once, in the bundle's order of types. */
export const typesOf = (s: FinderSystem): PlanetType[] => [...new Set(s.planets.map((p) => p.type).filter((t): t is PlanetType => !!t))];

export type LeftOut = { systemId: number; missing: number[] };
/**
 * The systems whose planets supply every P0 the good needs, and those left out with what they lack; `commonest`, the P0 lacked by most
 * of those left out (ties to the lower type ID), for "38 lack Suspended Plasma".
 */
export function splitByP0(ix: PiIndex, good: number, systems: readonly FinderSystem[]): { plan: FinderSystem[]; out: LeftOut[]; commonest: { p0: number; count: number } | null } {
  const plan: FinderSystem[] = [], out: LeftOut[] = [];
  for (const s of systems) {
    const missing = missingFor(ix, good, typesOf(s));
    if (missing.length) out.push({ systemId: s.id, missing }); else plan.push(s);
  }
  const count = new Map<number, number>();
  for (const o of out) for (const p of o.missing) count.set(p, (count.get(p) ?? 0) + 1);
  let commonest: { p0: number; count: number } | null = null;
  for (const [p0, n] of [...count].sort((a, b) => a[0] - b[0])) if (!commonest || n > commonest.count) commonest = { p0, count: n };
  return { plan, out, commonest };
}

/**
 * Each system's rates: what's typed for that system (the `planets` doc's prefs) over the rates learned by planet type, and a planet's own
 * rate first where a colony of yours taught it one (`rateFor`'s planet argument): so a system where you have colonies is planned on what
 * those planets gave, the others on your type averages.
 */
export const finderRateOf = (learned: LearnedMap, own: OwnLearned, doc: Pick<PlanetsDoc, 'systems'>) => (s: FinderSystem): PlanInput['rateOf'] => {
  const typed = doc.systems[String(s.id)]?.rates ?? {};
  return (t, p0, planetId) => rateFor(learned, typed[t]?.[String(p0)], t, p0, planetId, own);
};
/**
 * Each planet's customs tax, as Plan judges it (`customsRate`): at the system's own security (Brave's rates in null-sec, none assumed in
 * wormholes, a high-sec office's NPC part with Customs Code Expertise) and the `planets` doc's prefs for that system.
 */
export const finderTaxOf = (doc: PlanetsDoc, cce: number | null) => (s: FinderSystem, p: FinderPlanet, t: PlanetType): Tax => customsRate(doc, s.id, s.security, t, p.planetId, cce);

/** What every system's input shares: the planner's input less the planets and the rates, which are each system's own. */
export type FinderBase = Omit<PlanInput, 'planets' | 'rateOf'>;
/**
 * A system's input: its planets from the bundle, each with its customs tax (`taxOf`: the `planets` doc's prefs for that system, at its
 * security), and its rates (`rateOf`: the rates typed for that system over the learned ones, a planet's own first).
 */
export function systemInput(base: FinderBase, s: FinderSystem, taxOf: (s: FinderSystem, p: FinderPlanet, t: PlanetType) => Tax, rateOf: (s: FinderSystem) => PlanInput['rateOf']): PlanInput {
  const NONE: Tax = { rate: null, from: 'none', npc: 0, interbus: false };
  // No planet's name is in the static data, and the sort's order isn't the game's numbering (420 planets differ): named by the system
  // and type, which nothing the finder shows uses (Plan it here reads the system's planets from ESI with their names).
  const planets: PlanPlanet[] = s.planets.map((p) => ({ planetId: p.planetId, name: `${s.name ?? `System ${s.id}`}, a ${p.type ?? 'non-PI'} planet`, type: p.type, radiusKm: p.radiusKm,
    tax: p.type ? taxOf(s, p, p.type) : NONE }));
  return { ...base, planets, rateOf: rateOf(s) };
}

/**
 * A system planned: its best setup for the good (`rankSetups`: the most of it a day first, then ISK), `made` its units a day and `iskDay`
 * its ISK, both null when it couldn't be worked out (`why` says why, never a 0). `used` the planets it uses, of `piPlanets`.
 */
/**
 * A line the good's figure rests on that no rate of its own planet type speaks for (fix round 1, the review's Important 1): the same P0's
 * rate learned on another type (`from` that type), another P0's of this type (`otherP0`), or none learned or typed, so an assumed 12,000
 * an hour (`assumed`, a line set aside among them). The finder's order rests on these: DT-PXH ranked first in Tenerifis on a Storm planet
 * at Lava's and Gas's rates.
 */
export type Borrowed = { type: PlanetType | null; p0: number; from: PlanetType | 'otherP0' | 'assumed' };
export type FinderRow = {
  system: FinderSystem; best: Setup | null;
  /** The good a day; null when the system couldn't be worked out (`why` says why, never a 0). */
  made: number | null;
  /** Its ISK a day; null with `iskWhy` when it makes the good but isn't valued, so the row still ranks by units. */
  iskDay: number | null; iskWhy: string | null;
  why: string | null;
  used: number; piPlanets: number; types: PlanetType[];
  /** The search ran out of its budget: the best of the arrangements tried. */
  cut: boolean;
  /** Ranked before the customs tax: some planet's tax isn't known here (`perPct`, what each 1% costs a day). */
  beforeTax: boolean; perPct: number;
  /** The lines making the good planned on a rate not learned on their own planet type, each once. */
  borrowed: Borrowed[];
};

/**
 * A system's row from its kinds' setups: the best that makes the good (Plan's own ranking among those valued, else the most units), else
 * the planner's reason. `need`: the good's P0s, so only lines that can feed it count as borrowed (a P0 → P1 planet's other line, making
 * another P1, or a feeder's line the factory takes nothing from, `extra`, doesn't move the good's figure).
 */
export function rowOf(s: FinderSystem, setups: Setup[], need?: ReadonlySet<number>): FinderRow {
  const making = setups.filter((x) => x.made != null && x.made.perDay > 0);
  const best = rankSetups(making.filter((x) => x.iskDay != null))[0]
    ?? [...making].sort((a, b) => b.made!.perDay - a.made!.perDay)[0]
    ?? rankSetups(setups)[0] ?? null;
  const ok = !!best && best.made != null && best.made.perDay > 0;
  const used = best ? new Set(best.roles.filter((r) => r.does !== 'unused').map((r) => r.planetId)).size : 0;
  const typeOf = new Map(s.planets.map((p) => [p.planetId, p.type]));
  const borrowed: Borrowed[] = [];
  if (ok) {
    const seen = new Set<string>();
    for (const r of best!.roles) {
      if (r.does === 'unused') continue;
      for (const e of r.extracts ?? []) {
        if (e.extra || (need && !need.has(e.p0))) continue;
        const from = e.rate == null ? 'assumed' : e.rate.otherType ?? (e.rate.otherP0 ? 'otherP0' : null);
        if (!from) continue;
        const b: Borrowed = { type: typeOf.get(r.planetId) ?? null, p0: e.p0, from };
        const k = `${b.type}:${b.p0}:${b.from}`;
        if (!seen.has(k)) { seen.add(k); borrowed.push(b); }
      }
    }
  }
  const valued = ok && best!.iskDay != null;
  return {
    system: s, best, made: ok ? best!.made!.perDay : null, iskDay: valued ? best!.iskDay : null,
    iskWhy: ok && !valued ? best!.why ?? (best!.unvalued ? `${best!.unvalued} of what it makes ${best!.unvalued === 1 ? 'isn’t' : 'aren’t'} valued` : 'Not valued') : null,
    why: ok ? null : best?.why ?? (best ? 'Makes none of it' : 'Nothing to plan'),
    used: ok ? used : 0, piPlanets: s.planets.filter((p) => p.type).length, types: typesOf(s),
    cut: !!best?.cut, beforeTax: valued && best!.before.includes('tax'), perPct: valued ? best!.perPct : 0, borrowed,
  };
}

/**
 * Every system planned, a step at a time (the planner's own steps, so the page can hand itself back between slices as Plan does):
 * yields nothing between steps and a system's row when it's done. Drained, it is each system's `rowOf` its kinds' setups.
 */
export function* finderSteps(systems: readonly FinderSystem[], inputOf: (s: FinderSystem) => PlanInput, kinds: readonly SetupKind[]): Generator<FinderRow | void, void, void> {
  let need: ReadonlySet<number> | undefined;
  for (const s of systems) {
    const input = inputOf(s);
    if (input.only != null) need ??= new Set(p0Of(input.ix, input.only));
    const setups: Setup[] = [];
    for (const k of kinds) setups.push(yield* planSteps(input, k));
    yield rowOf(s, setups, need);
  }
}

/**
 * The rows in order: the most of the good a day first (to a hundredth of a unit, as Plan ranks), then the fewest jumps from the home
 * hub (no route last), then by name; rows that couldn't be worked out after every ranked one, by name.
 */
export function rankRows(rows: readonly FinderRow[], jumps: ReadonlyMap<number, number> | null): FinderRow[] {
  const j = (r: FinderRow) => jumps?.get(r.system.id) ?? Infinity;
  const name = (r: FinderRow) => r.system.name ?? '';
  return [...rows].sort((a, b) => {
    if ((a.made == null) !== (b.made == null)) return a.made == null ? 1 : -1;
    if (a.made != null && b.made != null) {
      const d = Math.round(b.made * 100) - Math.round(a.made * 100);
      if (d) return d;
      const dj = j(a) - j(b);
      if (dj) return dj;
    }
    return name(a).localeCompare(name(b)) || a.system.id - b.system.id;
  });
}
