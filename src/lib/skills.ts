/**
 * What each side hustle asks of your character.
 *
 * Skills are named rather than given as type IDs, and resolved against ESI at runtime. That is not
 * pedantry: the industrial ship skills are called *Caldari Hauler*, not *Caldari Industrial* --- CCP
 * renamed them --- and a hardcoded ID for a skill under its old name would quietly check the wrong
 * thing forever. A name that no longer resolves shows up as unknown, which is a bug you can see.
 */

export type Need = {
  name: string;
  /** The level worth having. Not always the level that unlocks something. */
  level: number;
  why: string;
  /** Nice to have rather than needed to start. */
  optional?: boolean;
};

export type Status = 'unknown' | 'missing' | 'partial' | 'met';

export type Checked = Need & { typeId: number | null; have: number; status: Status };

export function check(need: Need, typeId: number | null, skills: Record<number, number> | undefined): Checked {
  if (typeId == null || !skills) return { ...need, typeId, have: 0, status: 'unknown' };
  const have = skills[typeId] ?? 0;
  return { ...need, typeId, have, status: have >= need.level ? 'met' : have > 0 ? 'partial' : 'missing' };
}

/** Needed first, then the biggest shortfall, so the next thing to train is at the top of the gap. */
export function byUrgency(a: Checked, b: Checked): number {
  const rank = (c: Checked) => (c.status === 'met' ? 2 : 0) + (c.optional ? 1 : 0);
  return rank(a) - rank(b) || (b.level - b.have) - (a.level - a.have) || a.name.localeCompare(b.name);
}

export function readiness(checked: Checked[]): { met: number; of: number; core: boolean } {
  const core = checked.filter((c) => !c.optional);
  return {
    met: checked.filter((c) => c.status === 'met').length,
    of: checked.length,
    core: core.length > 0 && core.every((c) => c.status === 'met'),
  };
}

export const ABYSSAL_SKILLS: Need[] = [
  { name: 'Hull Upgrades', level: 5, why: 'Armour hit points on every fit, and a prerequisite for most tanking modules. The cheapest survivability you can buy.' },
  { name: 'Mechanics', level: 4, why: 'Raw structure hit points. The last thing between a bad room and losing the ship.' },
  { name: 'Shield Operation', level: 4, why: 'Shield booster cycle time, which is what keeps a shield-tanked cruiser alive through a spawn.' },
  { name: 'Shield Management', level: 4, why: 'More shield to work with, so a bad room has to chew through more before it matters.' },
  { name: 'Tactical Shield Manipulation', level: 4, why: 'Stops damage bleeding through the shield into armour, which is where a run quietly goes wrong.' },
  { name: 'Capacitor Management', level: 4, why: 'A bigger capacitor. Abyssal rooms punish you for running dry far more than a mission does.' },
  { name: 'Capacitor Systems Operation', level: 4, why: 'Faster capacitor recharge — the other half of not running dry.' },
  { name: 'Weapon Upgrades', level: 4, why: 'Cuts the CPU your guns or launchers use, which is what lets a tight abyssal fit actually fit.' },
  { name: 'Navigation', level: 4, why: 'Speed. Getting to the next trigger before the timer does is half of a clean run.' },
  { name: 'Drones', level: 5, why: 'Most abyssal fits lean on drones for the small fast things that guns cannot track.', optional: true },
  { name: 'Advanced Weapon Upgrades', level: 4, why: 'Powergrid for weapons. The difference between a fit that works on paper and one that works.', optional: true },
  { name: 'Repair Systems', level: 4, why: 'Armour repairer cycle time, if you tank armour rather than shields.', optional: true },
];

export const HAULING_SKILLS: Need[] = [
  { name: 'Caldari Hauler', level: 4, why: 'Flies the Badger and Tayra, and is the prerequisite for everything bigger. Start here.' },
  { name: 'Evasive Maneuvering', level: 4, why: 'Align time. A hauler that aligns quickly is a hauler that is hard to catch, and this is the single most useful skill on this list.' },
  { name: 'Hull Upgrades', level: 4, why: 'Hit points, so a gank has to commit more than it wants to.' },
  { name: 'Mechanics', level: 4, why: 'More structure. Same reasoning.' },
  { name: 'Warp Drive Operation', level: 4, why: 'Cheaper warps, so a long high-sec route does not leave you sitting recharging.' },
  { name: 'Navigation', level: 3, why: 'Sub-warp speed, which decides how long you sit on a gate looking edible.' },
  { name: 'Transport Ships', level: 1, why: 'Deep Space Transports and Blockade Runners — far more hit points or far more agility. Needs the racial hauler at V first.', optional: true },
  { name: 'Advanced Spaceship Command', level: 5, why: 'The gate to freighters. A long train, and only worth it if you mean to do this properly.', optional: true },
  { name: 'Caldari Freighter', level: 1, why: 'Flies the Charon. Most of the big courier contracts are freighter-sized and invisible to you without it.', optional: true },
];

export const PI_SKILLS: Need[] = [
  { name: 'Interplanetary Consolidation', level: 4, why: 'How many planets you can run at once: one, plus one per level. This is the skill that multiplies everything else on this page.' },
  { name: 'Command Center Upgrades', level: 4, why: 'CPU and powergrid on each command centre. Below level 4 you cannot fit enough extractor heads for the numbers here to hold.' },
  { name: 'Planetology', level: 3, why: 'Sharper resource readings when you survey a planet, so you can tell a rich spot from a poor one before committing.' },
  { name: 'Advanced Planetology', level: 3, why: 'Sharper still. Worth it once you are choosing between planets rather than taking the first one.', optional: true },
  { name: 'Remote Sensing', level: 3, why: 'Survey planets from further away, so you can plan without flying to each one.', optional: true },
];

export const TRADE_SKILLS: Need[] = [
  { name: 'Accounting', level: 5, why: 'Cuts sales tax, which comes off every injector you sell. The best ISK-per-hour skill in the game for a trader.' },
  { name: 'Broker Relations', level: 5, why: 'Cuts the broker fee on both the buy order and the sell order.' },
  { name: 'Advanced Broker Relations', level: 4, why: 'Cuts the fee for changing an order, which is what relisting costs you.', optional: true },
  { name: 'Trade', level: 4, why: 'Order slots. You cannot work a spread you have no room to place.' },
  { name: 'Retail', level: 4, why: 'More order slots.', optional: true },
  { name: 'Wholesale', level: 3, why: 'More order slots again, once retail runs out.', optional: true },
];

/**
 * Injector yield falls as the buyer's own skill points rise, which is why the price does not track
 * the raw point count. You cannot extract below five million either, so the first five million are
 * not yours to sell.
 */
export const SP_FLOOR = 5_000_000;
export const INJECTOR_YIELD: { upTo: number; points: number }[] = [
  { upTo: 5_000_000, points: 500_000 },
  { upTo: 50_000_000, points: 400_000 },
  { upTo: 80_000_000, points: 300_000 },
  { upTo: Infinity, points: 150_000 },
];

export function injectorYield(totalSp: number): number {
  return INJECTOR_YIELD.find((t) => totalSp < t.upTo)?.points ?? 150_000;
}
