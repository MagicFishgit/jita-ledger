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
  /**
   * Alternatives, any one of which satisfies this.
   *
   * The racial lines are a choice, not a checklist: a hauler flown by a Gallente pilot is as much a
   * hauler as a Caldari one, and asking which race you fly would be asking for something already
   * visible in your skills. When this is set, `name` is the group ("Racial hauler") and these are
   * the skills that can fill it.
   */
  anyOf?: string[];
};

export type Status = 'unknown' | 'missing' | 'partial' | 'met';

export type Option = { name: string; typeId: number | null; have: number };

export type Checked = Need & {
  /** Every skill that could satisfy this, with your level in each. A plain need has exactly one. */
  options: Option[];
  /** The one you are furthest along in, which is the one the verdict is based on. */
  best: Option | null;
  have: number;
  status: Status;
};

/** The skills a requirement can be filled by. */
export const skillsOf = (need: Need): string[] => need.anyOf ?? [need.name];

export function check(
  need: Need,
  idOf: (name: string) => number | null,
  skills: Record<number, number> | undefined,
): Checked {
  const options: Option[] = skillsOf(need).map((name) => ({
    name, typeId: idOf(name), have: skills?.[idOf(name) ?? -1] ?? 0,
  }));
  // Nothing read yet, or not one name resolved: say so rather than reporting them all as missing.
  if (!skills || options.every((o) => o.typeId == null)) {
    return { ...need, options, best: null, have: 0, status: 'unknown' };
  }
  const best = [...options].sort((a, b) => b.have - a.have)[0] ?? null;
  const have = best?.have ?? 0;
  return {
    ...need, options, best, have,
    status: have >= need.level ? 'met' : have > 0 ? 'partial' : 'missing',
  };
}

/** The alternatives you have any level in, best first. Empty when the group is untouched. */
export const trainedOptions = (c: Checked): Option[] =>
  c.options.filter((o) => o.have > 0).sort((a, b) => b.have - a.have);

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

const HAULERS_BY_RACE = ['Amarr Hauler', 'Caldari Hauler', 'Gallente Hauler', 'Minmatar Hauler'];
const FREIGHTERS_BY_RACE = ['Amarr Freighter', 'Caldari Freighter', 'Gallente Freighter', 'Minmatar Freighter'];

export const HAULING_SKILLS: Need[] = [
  {
    name: 'Racial hauler', level: 4, anyOf: HAULERS_BY_RACE,
    why: 'Flies that race\u2019s industrials and is the prerequisite for everything bigger. Any one race is enough — cargo does not care whose hull it is in, so train the line you have already started rather than a second one.',
  },
  { name: 'Evasive Maneuvering', level: 4, why: 'Align time. A hauler that aligns quickly is a hauler that is hard to catch, and this is the single most useful skill on this list.' },
  { name: 'Hull Upgrades', level: 4, why: 'Hit points, so a gank has to commit more than it wants to.' },
  { name: 'Mechanics', level: 4, why: 'More structure. Same reasoning.' },
  { name: 'Warp Drive Operation', level: 4, why: 'Cheaper warps, so a long high-sec route does not leave you sitting recharging.' },
  { name: 'Navigation', level: 3, why: 'Sub-warp speed, which decides how long you sit on a gate looking edible.' },
  { name: 'Transport Ships', level: 1, why: 'Deep Space Transports and Blockade Runners — far more hit points or far more agility. Needs a racial hauler at V first.', optional: true },
  { name: 'Advanced Spaceship Command', level: 5, why: 'The gate to freighters. A long train, and only worth it if you mean to do this properly.', optional: true },
  { name: 'Industrial Command Ships', level: 1, why: 'Flies the Orca, which is ORE\u2019s contribution to hauling: 30,000 m\u00b3 of hold and a 40,000 m\u00b3 fleet hangar, both of which a courier package can travel in. It is not a racial line, so it stands on its own.', optional: true },
  {
    name: 'Racial freighter', level: 1, anyOf: FREIGHTERS_BY_RACE, optional: true,
    why: 'Most of the big courier contracts are freighter-sized and simply invisible to you without one. Again any race will do, so follow whichever hauler line you already have.',
  },
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
