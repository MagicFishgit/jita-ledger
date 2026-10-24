import type { PlanetType } from './pi';

/**
 * Planetary Interaction's static data (src/data/planets.json, scripts/planets-bundle.mjs, from CCP's static data): every good,
 * schematic, command centre level and pin cost, and the planets' radii (src/data/planetRadii.json). Pure: the Worker may import it.
 */
export type Tier = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type Commodity = { id: number; name: string; tier: Tier; volume: number; taxBase: number };
export type Facility = 'basic' | 'advanced' | 'hightech';
export type Schematic = {
  id: number; name: string; tier: Tier; facility: Facility; cycleSeconds: number;
  inputs: { id: number; qty: number }[]; out: { id: number; qty: number }; planetTypes: PlanetType[];
};
export type PinCost = { cpu: number; pg: number };
export type PlanetTypeData = {
  typeId: number;
  p0: number[];
  cc: { level: number; cpu: number; pg: number }[];
  pins: {
    basic: PinCost; advanced: PinCost; hightech: PinCost | null;
    storage: PinCost & { capacity: number }; launchpad: PinCost & { capacity: number };
    ecu: PinCost & { headCpu: number; headPg: number };
  };
};
export type PlanetsBundle = {
  build: number; released: string;
  commodities: Commodity[]; schematics: Schematic[];
  planetTypes: Record<PlanetType, PlanetTypeData>;
  link: { cpu: number; pg: number; cpuPerKm: number; pgPerKm: number; minKmPerRadiusKm: number };
  maxHeads: number;
  extraction: { decay: number; noise: number };
};
export type PiIndex = PlanetsBundle & {
  byId: Map<number, Commodity>;
  /** The schematic that makes a good. */
  makes: Map<number, Schematic>;
  typeOfPlanet: Map<number, PlanetType>;
};

export function indexPlanets(b: PlanetsBundle): PiIndex {
  const typeOfPlanet = new Map<number, PlanetType>();
  for (const [t, d] of Object.entries(b.planetTypes)) typeOfPlanet.set(d.typeId, t as PlanetType);
  return {
    ...b,
    byId: new Map(b.commodities.map((c) => [c.id, c])),
    makes: new Map(b.schematics.map((s) => [s.out.id, s])),
    typeOfPlanet,
  };
}

/** The P0s needed to make a good from scratch, sorted. */
export function p0Of(ix: PiIndex, id: number): number[] {
  const out = new Set<number>();
  const walk = (g: number) => {
    const s = ix.makes.get(g);
    if (!s) { out.add(g); return; }
    for (const i of s.inputs) walk(i.id);
  };
  walk(id);
  return [...out].sort((a, b) => a - b);
}

/** What one planet type can make from its own P0 alone, by tier. */
export function madeAlone(ix: PiIndex, t: PlanetType): Record<Tier, number[]> {
  const have = new Set(ix.planetTypes[t].p0);
  const out: Record<Tier, number[]> = { P0: [], P1: [], P2: [], P3: [], P4: [] };
  for (const c of ix.commodities) {
    if (c.tier === 'P0') { if (have.has(c.id)) out.P0.push(c.id); continue; }
    if (p0Of(ix, c.id).every((p) => have.has(p))) out[c.tier].push(c.id);
  }
  return out;
}

/** The PI type of a planet's type ID; null for Shattered and Scorched Barren planets, which have no PI. */
export const planetTypeOf = (ix: PiIndex, planetTypeId: number): PlanetType | null => ix.typeOfPlanet.get(planetTypeId) ?? null;

/**
 * The planet types planetRadii.json's last digit names, in this order (scripts/planets-bundle.mjs holds the same list): CCP's type IDs of
 * Temperate, Ice, Gas, Oceanic, Lava, Barren, Storm and Plasma planets.
 */
export const PI_TYPE_IDS = [11, 12, 13, 2014, 2015, 2016, 2017, 2063] as const;
/**
 * A system's row of planetRadii.json is delta-encoded: [firstId, v0, Δid1, v1, …], each v the radius in whole km times ten plus the
 * planet's type (an index into `PI_TYPE_IDS`). Each planet as [ID, radius in km, its type ID]: the first two as before the type was
 * added, so `new Map(decodeRadii(row))` is still ID to radius.
 */
export function decodeRadii(row: number[]): [planetId: number, radiusKm: number, typeId: number][] {
  const out: [number, number, number][] = [];
  let id = 0;
  for (let i = 0; i + 1 < row.length; i += 2) { id += row[i]; out.push([id, Math.floor(row[i + 1] / 10), PI_TYPE_IDS[row[i + 1] % 10]]); }
  return out;
}

/** A system's planets' radii by planet ID (km), from its row of planetRadii.json. */
export const radiusMap = (row: number[] | undefined): Map<number, number> => new Map(row ? decodeRadii(row).map(([id, km]) => [id, km]) : []);

/** planetRegions.json's row: a region, its name, its systems (delta-encoded), and every system's name and security where a system has no gate. */
export type RegionRow = [regionId: number, name: string, systems: number[], names?: string[], securities?: number[]];
/**
 * A region with PI planets (src/data/planetRegions.json): its systems that hold any, sorted by ID. `names` and `securities`, in the same
 * order, only for a region with a system no stargate reaches (wormhole space, the closed Jove regions), which the stargate map lacks.
 */
export type Region = { id: number; name: string; systems: number[]; names: string[] | null; securities: number[] | null };
export function decodeRegions(rows: RegionRow[]): Region[] {
  return rows.map(([id, name, ds, names, secs]) => {
    let s = 0;
    return { id, name, systems: ds.map((d) => (s += d)), names: names ?? null, securities: secs ?? null };
  });
}
