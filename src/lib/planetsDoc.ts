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
};
export type PlanetsDoc = { systems: Record<string, SystemPrefs>; programHours: number | null };

export const DEFAULT_PLANETS: PlanetsDoc = { systems: {}, programHours: null };
export const MAX_PLANET_SYSTEMS = 40;

export const BRAVE_TAX = { Barren: 0.02, Temperate: 0.02, other: 0.05 };
export const BRAVE_TAX_SOURCE = 'Brave’s wiki, “Brave Industry Taxes”, last modified 17 July 2023';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const frac = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const pos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isType = (k: string): k is PlanetType => (PLANET_TYPES as readonly string[]).includes(k);

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
  return { tax, planetTax, interbus, notBrave: s.notBrave === true, rates };
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
  return { systems, programHours: pos(d.programHours) ? d.programHours : null };
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
