/**
 * What a mining fit pulls a minute, worked out from ESI's own dogma rather than copied from a guide: the laser's amount
 * and cycle (77, 73), the hull's bonuses and the skill each scales with, the crystal (yield ×782, cycle ×3161, residue
 * +3160 / +3159 by its effect's own operators, checked 29 September 2026), each Mining Laser Upgrade and implant (+434%,
 * not stacking-penalised: ESI marks 434 stackable), and your Mining and Astrogeology (+5% a level each, 434 on the
 * skills). Critical hits add their expected share (chance 5967 × bonus 5969: 1% × 200% is +2%; the Consortium Issues
 * raise the chance half again). Residue is ore the rock loses, not ore you lose: shown beside the yield, never taken off
 * it. Crits and residue moved in the Catalyst expansion (18 November 2025): Mining Precision +10% crit chance a level,
 * Mining Exploitation +5% crit size a level, a survey chipset its own % on both and the same % off the residue chance
 * (a relative cut: ESI's operator is post-percent, applied after a crystal's added points). Ice is its own case: a
 * harvester takes one 1,000 m³ block a cycle, so only the cycle moves (Ice Harvesting, the hull, Ice Harvester Upgrades,
 * the ice rig and the Yeti implant, all 780). Boosts, drones and heat aren't in it, and say so where it's shown. Pure.
 */

/** A type's dogma as ESI gives it. */
export type TypeDogma = { id: number; group: number; attrs: Record<number, number>; effects: number[] };

type Target = 'amount' | 'duration' | 'crit' | 'iceDuration' | 'iceCrit' | 'iceCritSize';
/** A hull effect that moves mining, the attribute carrying its size, and what it scales with: a skill's level, nothing (a role bonus), or a flat multiplier. */
type HullRule = { effect: number; attr: number; on: Target; per: number | 'role' | 'times' };

export const SKILL = {
  mining: 3386, astrogeology: 3410, iceHarvesting: 16281,
  miningFrigate: 32918, expeditionFrigates: 33856, miningDestroyer: 89241, miningBarge: 17940, exhumers: 22551,
  miningPrecision: 90727, miningExploitation: 90728,
} as const;

/** Every skill the yield reads at V: the ceiling a fit is shown against. */
export const ALL_FIVE: Record<number, number> = Object.fromEntries(Object.values(SKILL).map((s) => [s, 5]));

/** The skills whose dogma the yield reads (their per-level bonus). */
export const YIELD_SKILLS = [SKILL.mining, SKILL.astrogeology, SKILL.iceHarvesting, SKILL.miningPrecision, SKILL.miningExploitation];

/** Every hull effect on ore or ice mining the mining hulls carry (ESI, 29 September 2026). Unknown effects are ignored. */
export const HULL_RULES: HullRule[] = [
  { effect: 5058, attr: 207, on: 'amount', per: 'times' }, // Venture and its Consortium Issue: ×2 on miners
  { effect: 5139, attr: 1842, on: 'amount', per: SKILL.miningFrigate },
  { effect: 5852, attr: 3191, on: 'amount', per: SKILL.expeditionFrigates },
  { effect: 8223, attr: 3177, on: 'amount', per: 'role' },
  { effect: 12329, attr: 5820, on: 'amount', per: SKILL.miningDestroyer },
  { effect: 12596, attr: 5986, on: 'amount', per: 'role' },
  { effect: 8227, attr: 3181, on: 'amount', per: SKILL.miningBarge },
  { effect: 8249, attr: 3197, on: 'amount', per: SKILL.exhumers },
  { effect: 8305, attr: 3230, on: 'duration', per: 'role' },
  { effect: 8243, attr: 3193, on: 'duration', per: SKILL.exhumers },
  { effect: 12753, attr: 6048, on: 'crit', per: 'role' },
  { effect: 8317, attr: 3240, on: 'iceDuration', per: SKILL.miningFrigate },
  { effect: 8210, attr: 3167, on: 'iceDuration', per: SKILL.expeditionFrigates },
  { effect: 8224, attr: 3178, on: 'iceDuration', per: 'role' },
  { effect: 8228, attr: 3182, on: 'iceDuration', per: SKILL.miningBarge },
  { effect: 8244, attr: 3194, on: 'iceDuration', per: SKILL.exhumers },
  { effect: 12771, attr: 6062, on: 'iceCrit', per: 'role' }, // Perseverance
  { effect: 12772, attr: 5820, on: 'iceCrit', per: SKILL.miningDestroyer },
  { effect: 12773, attr: 5821, on: 'iceCritSize', per: SKILL.miningDestroyer },
];

const A = {
  amount: 77, duration: 73, reqSkill: 182, critChance: 5967, critBonus: 5969, wasteChance: 3154, wasteMult: 3153,
  yieldBonus: 434, iceCycle: 780, crystalYield: 782, crystalCycle: 3161, crystalWasteChance: 3160, crystalWasteMult: 3159,
  critChanceBonus: 6049, critSizeBonus: 6050, wasteChanceBonus: 6053,
} as const;

/** Modulated lasers take crystals (they name a charge group); others ignore one. */
export const takesCrystal = (laser: TypeDogma) => laser.attrs[604] != null;
export const isIceLaser = (laser: TypeDogma) => laser.attrs[A.reqSkill] === SKILL.iceHarvesting;

export type FitYield = {
  kind: 'ore' | 'ice';
  lasers: number;
  /** m³ a laser takes a cycle (ice: one block, 1,000 m³). */
  perCycle: number;
  /** Seconds a cycle. */
  cycle: number;
  /** m³ a minute, every laser, crits in. */
  m3PerMin: number;
  /** Chance a cycle crits, and what crits add on average. */
  critChance: number; critShare: number;
  /** Chance a cycle leaves residue, and the m³ a minute the rock loses to it. */
  residueChance: number; residuePerMin: number;
};

/**
 * One fit's yield: `lasers` of one mining laser on `hull`, with a crystal when the laser takes one, `extras` being every
 * other fitted module and implant (only their yield and ice-cycle bonuses count), at `skills` levels.
 */
export function fitYield(
  hull: TypeDogma, laser: TypeDogma, lasers: number, crystal: TypeDogma | null, extras: TypeDogma[],
  skills: Record<number, number>, skillDogma: Record<number, TypeDogma>,
): FitYield {
  const ice = isIceLaser(laser);
  const lvl = (s: number) => Math.max(0, Math.min(5, skills[s] ?? 0));
  const factor = (on: Target) => HULL_RULES.filter((r) => r.on === on && hull.effects.includes(r.effect) && hull.attrs[r.attr] != null)
    .reduce((m, r) => m * (r.per === 'times' ? hull.attrs[r.attr] : 1 + (hull.attrs[r.attr] * (r.per === 'role' ? 1 : lvl(r.per))) / 100), 1);
  const percent = (items: TypeDogma[], attr: number) => items.reduce((m, x) => m * (1 + (x.attrs[attr] ?? 0) / 100), 1);
  const skillPct = (s: number, attr: number) => 1 + ((skillDogma[s]?.attrs[attr] ?? 0) * lvl(s)) / 100;
  const cr = crystal && takesCrystal(laser) && !ice ? crystal : null;

  const perCycle = ice ? laser.attrs[A.amount] ?? 1000
    : (laser.attrs[A.amount] ?? 0) * (cr?.attrs[A.crystalYield] ?? 1) * factor('amount')
      * skillPct(SKILL.mining, A.yieldBonus) * skillPct(SKILL.astrogeology, A.yieldBonus) * percent(extras, A.yieldBonus);
  const cycle = ((laser.attrs[A.duration] ?? 0) / 1000) * (ice
    ? factor('iceDuration') * skillPct(SKILL.iceHarvesting, A.iceCycle) * percent(extras, A.iceCycle)
    : (cr?.attrs[A.crystalCycle] ?? 1) * factor('duration'));
  const critChance = Math.min(1, (laser.attrs[A.critChance] ?? 0) * factor(ice ? 'iceCrit' : 'crit')
    * skillPct(SKILL.miningPrecision, A.critChanceBonus) * percent(extras, A.critChanceBonus));
  const critSize = (laser.attrs[A.critBonus] ?? 0) * (ice ? factor('iceCritSize') : 1)
    * skillPct(SKILL.miningExploitation, A.critSizeBonus) * percent(extras, A.critSizeBonus);
  const critShare = critChance * critSize;
  const residueChance = Math.min(1, (((laser.attrs[A.wasteChance] ?? 0) + (cr?.attrs[A.crystalWasteChance] ?? 0)) / 100) * percent(extras, A.wasteChanceBonus));
  const residueMult = (laser.attrs[A.wasteMult] ?? 0) + (cr?.attrs[A.crystalWasteMult] ?? 0);
  const perMin = cycle > 0 ? (lasers * 60) / cycle : 0;
  return {
    kind: ice ? 'ice' : 'ore', lasers, perCycle, cycle,
    m3PerMin: perCycle * (1 + critShare) * perMin,
    critChance, critShare, residueChance,
    residuePerMin: perCycle * residueChance * residueMult * perMin,
  };
}
