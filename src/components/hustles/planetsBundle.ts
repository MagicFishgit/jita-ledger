import { decodeRegions, indexPlanets, type PiIndex, type PlanetsBundle, type Region, type RegionRow } from '../../lib/piBundle';

/**
 * Planetary Interaction's static data (src/data/planets.json, scripts/planets-bundle.mjs) and the planets' radii, each a chunk of
 * its own, loaded once and indexed once. A failed load resets its promise; Chromium keeps a failed dynamic import for the life of
 * the page (gotchas.md), so the caller offers `reloadApp()` rather than asking again in place.
 */
let planetsP: Promise<PiIndex> | null = null;
export const loadPlanets = (): Promise<PiIndex> =>
  (planetsP ??= import('../../data/planets.json').then((m) => indexPlanets(m.default as unknown as PlanetsBundle)).catch((e) => { planetsP = null; throw e; }));

let radiiP: Promise<Record<string, number[]>> | null = null;
export const loadRadii = (): Promise<Record<string, number[]>> =>
  (radiiP ??= import('../../data/planetRadii.json').then((m) => m.default as unknown as Record<string, number[]>).catch((e) => { radiiP = null; throw e; }));

/** Every region with PI planets and its systems (src/data/planetRegions.json), a chunk of its own that only the system finder loads. */
let regionsP: Promise<Region[]> | null = null;
export const loadRegions = (): Promise<Region[]> =>
  (regionsP ??= import('../../data/planetRegions.json').then((m) => decodeRegions(m.default as unknown as RegionRow[])).catch((e) => { regionsP = null; throw e; }));
