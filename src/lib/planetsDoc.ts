/**
 * The Planets settings document: customs tax per system and planet type, typed extraction rates, the programme length.
 * Synced like `industry`. Pure: the Worker may import it (nothing from ./config, the store, React or the DOM).
 */
import { PLANET_TYPES, type PlanetType } from './pi';
import { secBand } from './industry';

export type TypedRate = { perHour: number; programHours: number; heads: number };
export type SystemPrefs = {
  /** Customs tax the planet's owner charges, by planet type (fractions). */
  tax: Partial<Record<PlanetType, number>>;
  /** One planet's own rate, keyed by planet ID as a string: wins over the type's. */
  planetTax: Record<string, number>;
  /** High-sec planets whose office is InterBus's (planet ID as a string). */
  interbus: Record<string, true>;
  notBrave: boolean;
  /** Typed extraction rates, by planet type then the P0's type ID as a string. */
  rates: Partial<Record<PlanetType, Record<string, TypedRate>>>;
  /**
   * Plans kept (planner fix 2, "Keep this plan"), by the good Plan it was held to (its type ID as a string): the planets and what each
   * runs, so Plan shows that layout worked out again on today's inputs, its planets never moving, until you forget it or take a newer one.
   */
  kept: Record<string, KeptPlan>;
};
/**
 * A learned rate as last seen (planner fix 2): what one extractor of this planet type gave of this P0 an hour, over its programme, on
 * the extractors that showed it, kept after their colony is torn down. `at`: when it was last learned (the app saw it change).
 */
export type RecordedRate = { perHour: number; higher: number | null; programHours: number; heads: number; extractors: number; systems: number[]; at: string;
  /** A planet's own rate only (ruling F18): its per-head yield over the other planets' of its type, or null (see `Learned.factor`). */
  factor?: number | null };
export type PlanetsDoc = {
  systems: Record<string, SystemPrefs>; programHours: number | null;
  /** The learned rates' record, by planet type then the P0's type ID as a string: each read updates it, a colony torn down never drops it. */
  learned: Partial<Record<PlanetType, Record<string, RecordedRate>>>;
  /** Each planet's own learned rates (planet rates), by the planet's ID as a string then the P0's type ID: a planet torn down keeps what it gave. */
  planetLearned: Record<string, Record<string, RecordedRate>>;
};

/** One extractor of a kept plan: its P0, its heads (null when the plan didn't say), and the Basic factories it feeds. */
export type KeptLine = { p0: number; heads: number | null; basics: number };
/**
 * One planet of a kept plan: who runs it, what it extracts (`lines`) and the factories beyond the Basics (`makes`: a P0 → P2's
 * Advanced, a factory planet's Advanced and High-Tech, by what they make).
 */
export type KeptPlanet = {
  planetId: number; charId: number; does: 'extract' | 'factory'; lines: KeptLine[];
  makes: { id: number; facility: 'advanced' | 'hightech'; count: number }[];
};
/** Where a rate came from when the plan was kept, for what changed since (`KeptBasis.rates`, by `<planet type>:<P0>`). */
export type KeptRateFrom = 'learned' | 'before' | 'typed' | 'otherType' | 'otherP0' | 'none';
/**
 * What a plan rested on when it was kept: whose it was shown for, their planets and Command Center Upgrades, the programme length,
 * and each P0's rate on the system's planet types, so a newer layout can say what changed ("your Gas rates are learned now").
 */
export type KeptBasis = {
  char: number; planets: number | null; cc: number | null; programHours: number;
  rates: Record<string, { from: KeptRateFrom; perHour: number | null }>;
  /** The planets' own learned rates the plan's planets had when kept (planet rates), by `<planet ID>:<P0>`; absent on a plan kept before. */
  planetRates?: Record<string, { from: KeptRateFrom; perHour: number | null }>;
};
export type KeptPlan = {
  kind: 'p1' | 'p2' | 'feed' | 'chain' | 'team';
  /** When it was kept, and the good's units a day then. */
  at: string; made: number;
  planets: KeptPlanet[];
  basis: KeptBasis;
};

export const DEFAULT_PLANETS: PlanetsDoc = { systems: {}, programHours: null, learned: {}, planetLearned: {} };
export const MAX_PLANET_SYSTEMS = 40;
/**
 * At most this many plans kept a system: one a good, and nobody plans forty goods in one system. Past it the oldest kept (by `at`)
 * goes, never the one just kept (fix round 1: the first version dropped whatever came last, the newest among them).
 */
export const MAX_KEPT_PLANS = 20;
/** At most this many P0s a planet type in the learned rates' record: no type has more than five, so anything past it is junk (fix round 1). */
export const MAX_RECORDED_P0S = 40;
/** At most this many planets in the record of planets' own rates, and this many P0s each (a planet extracts few): past them is junk. */
export const MAX_RECORDED_PLANETS = 300;
export const MAX_RECORDED_PLANET_P0S = 10;
/** At most this many planets in a kept plan (a factory character's holds every character's colonies). */
export const MAX_KEPT_PLANETS = 120;
/** At most this many planet-and-P0 rates in a kept plan's basis (a plan has a few planets of a few P0s each). */
export const MAX_KEPT_PLANET_RATES = 200;

export const BRAVE_TAX = { Barren: 0.02, Temperate: 0.02, other: 0.05 };
export const BRAVE_TAX_SOURCE = 'Brave’s wiki, “Brave Industry Taxes”, last modified 17 July 2023';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const frac = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const pos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isType = (k: string): k is PlanetType => (PLANET_TYPES as readonly string[]).includes(k);
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const count = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const isDate = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
const KEPT_KINDS = new Set(['p1', 'p2', 'feed', 'chain', 'team']);
const RATE_FROM = new Set(['learned', 'before', 'typed', 'otherType', 'otherP0', 'none']);

/** A kept plan as stored, or null when any part of it doesn't read: a plan is kept whole or not at all, never half a layout. */
function cleanKept(v: unknown): KeptPlan | null {
  if (!isObj(v) || typeof v.kind !== 'string' || !KEPT_KINDS.has(v.kind) || !isDate(v.at)) return null;
  const made = typeof v.made === 'number' && Number.isFinite(v.made) && v.made >= 0 ? v.made : null;
  // A factory character's plan holds every character's colonies: up to ten characters of six planets and their factory planets.
  if (made == null || !Array.isArray(v.planets) || !v.planets.length || v.planets.length > MAX_KEPT_PLANETS) return null;
  const planets: KeptPlanet[] = [];
  for (const p of v.planets) {
    if (!isObj(p) || !isId(p.planetId) || !isId(p.charId) || (p.does !== 'extract' && p.does !== 'factory') || !Array.isArray(p.lines) || !Array.isArray(p.makes)) return null;
    if (p.lines.length > 4 || p.makes.length > 8) return null;
    const lines: KeptLine[] = [];
    for (const l of p.lines) {
      if (!isObj(l) || !isId(l.p0) || !count(l.basics, 100) || !(l.heads === null || (count(l.heads, 100) && l.heads > 0))) return null;
      lines.push({ p0: l.p0, heads: l.heads, basics: l.basics });
    }
    const makes: KeptPlanet['makes'] = [];
    for (const m of p.makes) {
      if (!isObj(m) || !isId(m.id) || (m.facility !== 'advanced' && m.facility !== 'hightech') || !count(m.count, 100)) return null;
      makes.push({ id: m.id, facility: m.facility, count: m.count });
    }
    planets.push({ planetId: p.planetId, charId: p.charId, does: p.does, lines, makes });
  }
  const b = isObj(v.basis) ? v.basis : null;
  if (!b || !isId(b.char) || !(b.planets === null || count(b.planets, 100)) || !(b.cc === null || count(b.cc, 5)) || !pos(b.programHours) || !isObj(b.rates)) return null;
  const rates: KeptBasis['rates'] = {};
  for (const [k, r] of Object.entries(b.rates)) {
    if (!/^[A-Za-z]+:\d+$/.test(k) || !isType(k.split(':')[0]) || !isObj(r) || typeof r.from !== 'string' || !RATE_FROM.has(r.from)) continue;
    if (!(r.perHour === null || (typeof r.perHour === 'number' && Number.isFinite(r.perHour) && r.perHour >= 0))) continue;
    rates[k] = { from: r.from as KeptRateFrom, perHour: r.perHour };
  }
  const planetRates: NonNullable<KeptBasis['planetRates']> = {};
  if (isObj(b.planetRates)) for (const [k, r] of Object.entries(b.planetRates)) {
    if (Object.keys(planetRates).length >= MAX_KEPT_PLANET_RATES) break;
    if (!/^\d+:\d+$/.test(k) || !isObj(r) || typeof r.from !== 'string' || !RATE_FROM.has(r.from)) continue;
    if (!(r.perHour === null || (typeof r.perHour === 'number' && Number.isFinite(r.perHour) && r.perHour >= 0))) continue;
    planetRates[k] = { from: r.from as KeptRateFrom, perHour: r.perHour };
  }
  return { kind: v.kind as KeptPlan['kind'], at: v.at, made, planets, basis: { char: b.char, planets: b.planets, cc: b.cc, programHours: b.programHours, rates, ...(isObj(b.planetRates) ? { planetRates } : {}) } };
}

/** Recorded rates by P0 as stored, at most `max` of them, each entry whole or dropped. */
function cleanRecorded(byP0: Record<string, unknown>, max: number): Record<string, RecordedRate> {
  const kept: Record<string, RecordedRate> = {};
  for (const [id, r] of Object.entries(byP0)) {
    if (Object.keys(kept).length >= max) break;
    if (!/^\d+$/.test(id) || !isObj(r) || !pos(r.perHour) || !pos(r.programHours) || !(typeof r.heads === 'number' && Number.isFinite(r.heads) && r.heads >= 0)
      || !count(r.extractors, 10_000) || !(r.extractors > 0) || !isDate(r.at) || !Array.isArray(r.systems)) continue;
    const higher = r.higher === null || r.higher === undefined ? null : pos(r.higher) ? r.higher : undefined;
    if (higher === undefined) continue;
    kept[id] = { perHour: r.perHour, higher, programHours: r.programHours, heads: r.heads, extractors: r.extractors, systems: r.systems.filter(isId).slice(0, 50), at: r.at, ...(pos(r.factor) ? { factor: r.factor } : {}) };
  }
  return kept;
}

/** The learned rates' record as stored: each entry whole (a rate, its programme and heads, how many extractors, when) or dropped. */
function cleanLearned(v: unknown): PlanetsDoc['learned'] {
  const out: PlanetsDoc['learned'] = {};
  if (!isObj(v)) return out;
  for (const [t, byP0] of Object.entries(v)) {
    if (!isType(t) || !isObj(byP0)) continue;
    const kept = cleanRecorded(byP0, MAX_RECORDED_P0S);
    if (Object.keys(kept).length) out[t] = kept;
  }
  return out;
}

/** The planets' own rates as stored: the same whole-or-dropped entries, by planet ID. */
function cleanPlanetLearned(v: unknown): PlanetsDoc['planetLearned'] {
  const out: PlanetsDoc['planetLearned'] = {};
  if (!isObj(v)) return out;
  for (const [pid, byP0] of Object.entries(v)) {
    if (Object.keys(out).length >= MAX_RECORDED_PLANETS) break;
    if (!/^\d+$/.test(pid) || !isObj(byP0)) continue;
    const kept = cleanRecorded(byP0, MAX_RECORDED_PLANET_P0S);
    if (Object.keys(kept).length) out[pid] = kept;
  }
  return out;
}

function cleanSystem(v: unknown): SystemPrefs {
  const s = isObj(v) ? v : {};
  const tax: SystemPrefs['tax'] = {};
  if (isObj(s.tax)) for (const [k, r] of Object.entries(s.tax)) if (isType(k) && frac(r)) tax[k] = r;
  const planetTax: Record<string, number> = {};
  if (isObj(s.planetTax)) for (const [k, r] of Object.entries(s.planetTax)) if (/^\d+$/.test(k) && frac(r)) planetTax[k] = r;
  const interbus: Record<string, true> = {};
  if (isObj(s.interbus)) for (const [k, r] of Object.entries(s.interbus)) if (/^\d+$/.test(k) && r === true) interbus[k] = true;
  const rates: SystemPrefs['rates'] = {};
  if (isObj(s.rates)) for (const [t, byP0] of Object.entries(s.rates)) {
    if (!isType(t) || !isObj(byP0)) continue;
    const out: Record<string, TypedRate> = {};
    for (const [id, r] of Object.entries(byP0)) {
      if (/^\d+$/.test(id) && isObj(r) && pos(r.perHour) && pos(r.programHours) && pos(r.heads)) out[id] = { perHour: r.perHour, programHours: r.programHours, heads: r.heads };
    }
    if (Object.keys(out).length) rates[t] = out;
  }
  const kept: Record<string, KeptPlan> = {};
  if (isObj(s.kept)) {
    const all: [string, KeptPlan][] = [];
    for (const [good, k] of Object.entries(s.kept)) {
      const c = /^\d+$/.test(good) ? cleanKept(k) : null;
      if (c) all.push([good, c]);
    }
    // The newest kept first, so the oldest go past the cap; written back in the order they came.
    const keep = new Set(all.map(([good, c]) => [good, Date.parse(c.at)] as const).sort((a, b) => b[1] - a[1]).slice(0, MAX_KEPT_PLANS).map(([good]) => good));
    for (const [good, c] of all) if (keep.has(good)) kept[good] = c;
  }
  return { tax, planetTax, interbus, notBrave: s.notBrave === true, rates, kept };
}

export function sanitizePlanets(v: unknown): PlanetsDoc {
  const d = isObj(v) ? v : {};
  const systems: Record<string, SystemPrefs> = {};
  if (isObj(d.systems)) {
    for (const [k, s] of Object.entries(d.systems)) {
      if (!/^\d+$/.test(k)) continue;
      if (Object.keys(systems).length >= MAX_PLANET_SYSTEMS) break;
      systems[k] = cleanSystem(s);
    }
  }
  return { systems, programHours: pos(d.programHours) ? d.programHours : null, learned: cleanLearned(d.learned), planetLearned: cleanPlanetLearned(d.planetLearned) };
}

export type Tax = { rate: number | null; from: 'planet' | 'typed' | 'brave' | 'none'; npc: number; interbus: boolean };

const WORMHOLE_FROM = 31_000_000;
const round = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * The customs tax on exporting from a planet. The owner's rate is the planet's override, else the type's typed rate. Null-sec
 * takes Brave's when nothing is typed (not in wormholes, not when the system is marked not Brave's). High-sec adds the NPC
 * part (10% less 1% a level of Customs Code Expertise) to a player office's typed rate; it stays null until both are known.
 */
export function customsRate(doc: PlanetsDoc, systemId: number, security: number | null, t: PlanetType, planetId: number, cce: number | null): Tax {
  const sys = doc.systems[String(systemId)];
  const own: { rate: number; from: 'planet' | 'typed' } | null =
    sys?.planetTax[String(planetId)] != null ? { rate: sys.planetTax[String(planetId)], from: 'planet' }
    : sys?.tax[t] != null ? { rate: sys.tax[t]!, from: 'typed' } : null;
  const band = secBand(security);
  if (band === 'high') {
    if (sys?.interbus[String(planetId)]) return own ? { rate: own.rate, from: own.from, npc: 0, interbus: true } : { rate: null, from: 'none', npc: 0, interbus: true };
    if (!own || cce == null || !Number.isFinite(cce)) return { rate: null, from: 'none', npc: 0, interbus: false };
    const npc = round(0.10 - 0.01 * cce);
    return { rate: round(own.rate + npc), from: own.from, npc, interbus: false };
  }
  if (own) return { rate: own.rate, from: own.from, npc: 0, interbus: false };
  if (band === 'null' && systemId < WORMHOLE_FROM && !sys?.notBrave) {
    return { rate: t === 'Barren' || t === 'Temperate' ? BRAVE_TAX.Barren : BRAVE_TAX.other, from: 'brave', npc: 0, interbus: false };
  }
  return { rate: null, from: 'none', npc: 0, interbus: false };
}
