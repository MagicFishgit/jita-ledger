/**
 * How long a skill takes to train, and what training it would earn you.
 *
 * Both halves come from your own data. Training time is the skill points still needed, from each
 * skill's rank (a dogma attribute of the skill itself) against the points you already have, divided by
 * your training speed from your attributes. What a level earns is your last thirty days of trading run
 * again at the cheaper rate --- a look back, not a promise.
 */

/** Skill points needed to reach a level, from a skill's rank. EVE's own formula. */
export function spForLevel(rank: number, level: number): number {
  if (level <= 0) return 0;
  // Rounded up, as the game does (level II of a rank 1 skill is 1,415), with float dust ignored.
  return Math.ceil(250 * rank * Math.pow(Math.sqrt(32), level - 1) - 1e-6);
}

/** Dogma attribute IDs for attributes, as skills name them. */
export const ATTR_IDS: Record<number, 'charisma' | 'intelligence' | 'memory' | 'perception' | 'willpower'> = {
  164: 'charisma', 165: 'intelligence', 166: 'memory', 167: 'perception', 168: 'willpower',
};

export type Attributes = { intelligence: number; memory: number; perception: number; willpower: number; charisma: number };
export type SkillDogma = { rank: number; primary: number; secondary: number };

/** Skill points a minute: primary attribute plus half the secondary. Alpha clones train at half speed. */
export function spPerMinute(skill: SkillDogma, attrs: Attributes, alpha: boolean): number {
  const p = attrs[ATTR_IDS[skill.primary]] ?? 0;
  const s = attrs[ATTR_IDS[skill.secondary]] ?? 0;
  return (p + s / 2) * (alpha ? 0.5 : 1);
}

/** Days to take a skill to a level from the points already in it. */
export function trainingDays(skill: SkillDogma, attrs: Attributes, spHave: number, toLevel: number, alpha: boolean): number {
  const need = Math.max(0, spForLevel(skill.rank, toLevel) - spHave);
  const rate = spPerMinute(skill, attrs, alpha);
  return rate > 0 ? need / rate / 1440 : Infinity;
}

export type Pace = {
  /** Value of sales in the last 30 days. */
  sales: number;
  /** Value of orders placed in the last 30 days, both sides. */
  ordersPlaced: number;
  /** Price-change fees paid in the last 30 days. */
  relistFees: number;
};

/**
 * ISK a month the next level of each fee skill would have saved on the same 30 days.
 *
 * Accounting cuts the sales tax rate by 11% of its base per level; Broker Relations cuts the broker fee
 * by 0.3 points per level; Advanced Broker Relations lowers the price-change fee from half the broker
 * fee towards a fifth. The rates are the same ones fees.ts uses.
 */
export function monthlyGain(skill: 'acc' | 'br' | 'abr', from: number, pace: Pace, taxBase: number, brokerFee: number): number {
  if (from >= 5) return 0;
  if (skill === 'acc') return pace.sales * (taxBase / 100) * 0.11;
  // The broker fee never goes below 1%, so a level only saves what is left above the floor.
  if (skill === 'br') return pace.ordersPlaced * Math.max(0, Math.min(0.003, brokerFee - 0.01));
  // Price-change fee is (1 - (0.5 + 0.06 x level)) x broker fee of the order value.
  const now = 1 - (0.5 + 0.06 * from), next = 1 - (0.5 + 0.06 * (from + 1));
  return now > 0 && brokerFee > 0 ? pace.relistFees * (1 - next / now) : 0;
}
