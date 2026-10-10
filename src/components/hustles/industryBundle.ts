import { indexBundle, type Indexed, type IndustryBundle } from '../../lib/industry';
import type { Graph } from '../../lib/jumps';

/**
 * The Industry bundle (src/data/industry.json, scripts/industry-bundle.mjs) and the stargate map, each a chunk of its own,
 * loaded once by the Industry tab and indexed once. A failed load is asked again next time.
 */
let bundleP: Promise<Indexed> | null = null;
export const loadIndustry = (): Promise<Indexed> =>
  (bundleP ??= import('../../data/industry.json').then((m) => indexBundle(m.default as unknown as IndustryBundle)).catch((e) => { bundleP = null; throw e; }));

let graphP: Promise<Graph> | null = null;
export const loadGraph = (): Promise<Graph> =>
  (graphP ??= import('../../data/universeGraph.json').then((m) => (m.default as unknown as { systems: Graph }).systems).catch((e) => { graphP = null; throw e; }));
