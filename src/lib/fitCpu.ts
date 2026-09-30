/**
 * Whether a mining fit's modules fit its hull's CPU, from ESI's dogma (read 30 September 2026). The one place the app
 * checks fitting: whether a Mercoxit fit can give up its processor rig for the deep-core one (lib/miningFits.ts).
 *
 * - CPU output: the hull's (48), +5% a level of CPU Management (its 424), and each rig's 424 (a Tech II Medium Processor
 *   Overclocking Unit +9.6%, a Tech I +7.1%).
 * - CPU need: each module's own (50). A Mining Laser Upgrade raises the CPU of every module that needs Mining (3386, in its
 *   required skills 182–184: the lasers) by its 1082, 12.5% for a II (effect 2444), one upgrade after another; Mining
 *   Upgrades (22578) cuts that penalty 5% a level (its 927, effect 2456), not the upgrades' own CPU.
 * Nothing here is stacking-penalised (ESI marks 50 stackable). Pure.
 */

import type { TypeDogma } from './miningYield';

export const CPU_MANAGEMENT = 3426;
export const MINING_UPGRADES = 22578;
const MINING = 3386;

const needsSkill = (m: TypeDogma, skill: number) => [182, 183, 184].some((a) => m.attrs[a] === skill);

/** CPU used and CPU there is, for these modules (one entry a unit fitted) and rigs, at these skills. */
export function fitCpu(hull: TypeDogma, modules: TypeDogma[], rigs: TypeDogma[], skills: Record<number, number>, skillDogma: Record<number, TypeDogma | undefined>): { need: number; output: number } {
  const lvl = (s: number) => Math.max(0, Math.min(5, skills[s] ?? 0));
  const perLevel = (s: number, attr: number, fallback: number) => (skillDogma[s]?.attrs[attr] ?? fallback) / 100;
  const output = (hull.attrs[48] ?? 0) * (1 + lvl(CPU_MANAGEMENT) * perLevel(CPU_MANAGEMENT, 424, 5))
    * rigs.reduce((t, r) => t * (1 + (r.attrs[424] ?? 0) / 100), 1);
  const cut = 1 + lvl(MINING_UPGRADES) * perLevel(MINING_UPGRADES, 927, -5);
  // Every upgrade's penalty on the lasers, each after the skill's cut.
  const laserMult = modules.reduce((t, m) => t * (1 + ((m.attrs[1082] ?? 0) * (needsSkill(m, MINING_UPGRADES) ? cut : 1)) / 100), 1);
  const need = modules.reduce((t, m) => t + (m.attrs[50] ?? 0) * (needsSkill(m, MINING) ? laserMult : 1), 0);
  return { need, output };
}
