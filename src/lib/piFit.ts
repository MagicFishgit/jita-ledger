import type { PlanetType } from './pi';
import type { PiIndex } from './piBundle';

/**
 * What fits on a planet: a command centre gives CPU and powergrid by its level, every structure and link takes some
 * (CCP's static data via the bundle). Pure: the Worker may import it. The research's table is scripts/fit.py.
 */
export type Layout = { ecus: number; heads: number; basic: number; advanced: number; hightech: number; storage: number; launchpads: number };
export type Fit = { fits: boolean; cpu: number; pg: number; cpuLeft: number; pgLeft: number; binds: 'cpu' | 'pg' };

/** The shortest link CCP lets the planet's size allow. */
export const linkKm = (ix: PiIndex, radiusKm: number): number => ix.link.minKmPerRadiusKm * radiusKm;

export function fitOf(ix: PiIndex, t: PlanetType, ccLevel: number, l: Layout, radiusKm: number): Fit {
  const d = ix.planetTypes[t];
  const cc = d.cc[ccLevel];
  const p = d.pins;
  const hightech = p.hightech ?? { cpu: 0, pg: 0 };
  const structures = l.ecus + l.basic + l.advanced + l.hightech + l.storage + l.launchpads;
  // The command centre isn't a structure here, so a chain of n structures has n - 1 links.
  const links = Math.max(0, structures - 1);
  const km = linkKm(ix, radiusKm);
  const cpu = l.ecus * p.ecu.cpu + l.heads * p.ecu.headCpu + l.basic * p.basic.cpu + l.advanced * p.advanced.cpu
    + l.hightech * hightech.cpu + l.storage * p.storage.cpu + l.launchpads * p.launchpad.cpu
    + links * (ix.link.cpu + ix.link.cpuPerKm * km);
  const pg = l.ecus * p.ecu.pg + l.heads * p.ecu.headPg + l.basic * p.basic.pg + l.advanced * p.advanced.pg
    + l.hightech * hightech.pg + l.storage * p.storage.pg + l.launchpads * p.launchpad.pg
    + links * (ix.link.pg + ix.link.pgPerKm * km);
  const cpuLeft = cc.cpu - cpu;
  const pgLeft = cc.pg - pg;
  return { fits: cpuLeft >= 0 && pgLeft >= 0, cpu, pg, cpuLeft, pgLeft, binds: pgLeft / Math.max(1, d.pins.ecu.headPg) < cpuLeft / Math.max(1, d.pins.ecu.headCpu) ? 'pg' : 'cpu' };
}

/** The most extractor heads the layout leaves room for, at most `maxHeads` an ECU; -1 when it doesn't fit without any. */
export function maxHeads(ix: PiIndex, t: PlanetType, ccLevel: number, l: Omit<Layout, 'heads'>, radiusKm: number): number {
  const base = fitOf(ix, t, ccLevel, { ...l, heads: 0 }, radiusKm);
  if (!base.fits) return -1;
  const e = ix.planetTypes[t].pins.ecu;
  const byCpu = e.headCpu > 0 ? Math.floor(base.cpuLeft / e.headCpu) : Infinity;
  const byPg = e.headPg > 0 ? Math.floor(base.pgLeft / e.headPg) : Infinity;
  return Math.min(byCpu, byPg, ix.maxHeads * l.ecus);
}

/** How many factories of a kind one planet holds with the given launchpads (no ECUs); 0 when the kind isn't allowed there. */
export function maxFactories(ix: PiIndex, t: PlanetType, ccLevel: number, kind: 'advanced' | 'hightech', launchpads: number, radiusKm: number): number {
  if (kind === 'hightech' && !ix.planetTypes[t].pins.hightech) return 0;
  let best = 0;
  for (let n = 1; n < 200; n++) {
    const l: Layout = { ecus: 0, heads: 0, basic: 0, advanced: 0, hightech: 0, storage: 0, launchpads };
    l[kind] = n;
    if (fitOf(ix, t, ccLevel, l, radiusKm).fits) best = n; else break;
  }
  return best;
}
