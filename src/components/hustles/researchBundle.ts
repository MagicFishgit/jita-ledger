import type { HelperAgent, RdAgent } from '../../lib/research';

/**
 * The R&D agents bundle (src/data/researchAgents.json, built from CCP's static data by scripts/research-agents.mjs): a
 * chunk of its own, loaded once, by the Research tab and, only while an agent runs, by To do and the Wallet. A failed load
 * is asked again next time.
 */
export type Bundle = { built: string; source: string; agents: RdAgent[]; helpers: HelperAgent[]; names?: Record<string, string> };

let bundleP: Promise<Bundle> | null = null;
export const loadBundle = (): Promise<Bundle> =>
  (bundleP ??= import('../../data/researchAgents.json').then((m) => m.default as unknown as Bundle).catch((e) => { bundleP = null; throw e; }));
