/**
 * Public courier contracts, judged for whether they are a job or a trap.
 *
 * Hauling scams work because the contract shows you a reward and hides the risk. The three that
 * cost people ships and collateral:
 *
 *   1. The destination is a player structure. You cannot look it up without docking access, and you
 *      may not have any --- so you fly the cargo out, cannot deliver, and the collateral is gone.
 *      ESI returns 401 for a structure you can't dock at, which is exactly the signal we need.
 *   2. The route leaves high-sec. A gate camp on a 0.4 pipe takes the freighter and the collateral.
 *      ESI will route high-sec-only on request; if it can't, there is no safe way to do the job.
 *   3. The collateral dwarfs the reward. Even an honest contract of that shape is a bad trade: you
 *      are fronting a fortune to earn a little, and any mishap is yours.
 *
 * Everything here is a rule over data already fetched, so it can be tested without the network.
 */

export type EndpointKind = 'station' | 'structure';

export type Endpoint = {
  kind: EndpointKind;
  /** Null when ESI would not tell us --- a structure without public docking. */
  systemId: number | null;
  security: number | null;
  name: string | null;
  /** A structure nobody asked ESI about, because the login lacks the structures permission. */
  unchecked?: boolean;
};

export type CourierContract = {
  contractId: number;
  reward: number;
  collateral: number;
  /** Cubic metres. A freighter holds far more than an industrial. */
  volume: number;
  daysToComplete: number;
  dateExpired: string;
  startId: number;
  endId: number;
  title: string;
};

export type CourierLimits = {
  /** What your hauler actually holds, m3. */
  maxVolume: number;
  /** The most collateral you are willing to have at risk on one job. */
  maxCollateral: number;
  /** Below this the trip isn't worth the clicking. */
  minRewardPerJump: number;
};

export type CourierFlag =
  | 'endUnknown' | 'startUnknown' | 'endUnchecked' | 'startUnchecked' | 'lowsec' | 'noSafeRoute'
  | 'tooBig' | 'collateralOverLimit' | 'collateralHeavy' | 'thinReward' | 'rushed' | 'expiringSoon' | 'gankBait';

/** Flags that make a contract unsafe rather than merely unattractive. */
export const UNSAFE: CourierFlag[] = ['endUnknown', 'startUnknown', 'endUnchecked', 'startUnchecked', 'lowsec', 'noSafeRoute'];

export type CourierVerdict = {
  c: CourierContract;
  start: Endpoint;
  end: Endpoint;
  /** Jumps on a high-sec-only route; null when no such route exists. */
  jumps: number | null;
  rewardPerJump: number;
  rewardPerM3: number;
  /** Collateral you must front for each ISK of reward. */
  collateralRatio: number;
  flags: CourierFlag[];
  safe: boolean;
  /** Passes the safety rules *and* your own limits. */
  takeable: boolean;
};

export const HIGHSEC = 0.45;

export function judgeCourier(
  c: CourierContract,
  start: Endpoint,
  end: Endpoint,
  jumps: number | null,
  limits: CourierLimits,
  now = Date.now(),
  /**
   * Whether the route runs through a system gank fleets camp, and the collateral above which your
   * hull is worth their while there. Both come from outside: the route from ESI, the line from you
   * or from your own losses. No line means no claim either way.
   */
  gank?: { through: boolean; line: number | null },
): CourierVerdict {
  const flags: CourierFlag[] = [];

  // A destination ESI refused to describe is the scam, not a risk to weigh. One nobody asked about,
  // because the permission is missing, is only unchecked: still not safe, but not accused of anything.
  const unknown = (e: Endpoint) => e.kind === 'structure' && e.systemId == null;
  if (unknown(end)) flags.push(end.unchecked ? 'endUnchecked' : 'endUnknown');
  if (unknown(start)) flags.push(start.unchecked ? 'startUnchecked' : 'startUnknown');

  const secs = [start.security, end.security].filter((s): s is number => s != null);
  if (secs.some((s) => s < HIGHSEC)) flags.push('lowsec');
  // No high-sec-only route: the job cannot be done without leaving high-sec, whatever the endpoints.
  // Claiming that about a place we couldn't identify would be a second, wrong story.
  if (jumps == null && !unknown(start) && !unknown(end)) flags.push('noSafeRoute');

  if (c.volume > limits.maxVolume) flags.push('tooBig');
  if (c.collateral > limits.maxCollateral) flags.push('collateralOverLimit');
  // Fronting more than 50x the reward is a poor bargain even when the contract is honest.
  if (c.reward > 0 && c.collateral / c.reward > 50) flags.push('collateralHeavy');

  const perJump = jumps && jumps > 0 ? c.reward / jumps : c.reward;
  if (perJump < limits.minRewardPerJump) flags.push('thinReward');
  // One day for a twenty-jump freighter haul is a way to make you forfeit.
  if (jumps != null && c.daysToComplete > 0 && jumps / c.daysToComplete > 15) flags.push('rushed');

  const msLeft = Date.parse(c.dateExpired) - now;
  if (Number.isFinite(msLeft) && msLeft < 6 * 3600_000) flags.push('expiringSoon');
  if (gank?.through && gank.line != null && c.collateral > gank.line) flags.push('gankBait');

  const safe = !flags.some((f) => UNSAFE.includes(f));
  return {
    c, start, end, jumps,
    rewardPerJump: perJump,
    rewardPerM3: c.volume > 0 ? c.reward / c.volume : 0,
    collateralRatio: c.reward > 0 ? c.collateral / c.reward : Infinity,
    flags, safe,
    takeable: safe && !flags.some((f) => ['tooBig', 'collateralOverLimit', 'thinReward', 'gankBait'].includes(f)),
  };
}

/** Best paid per jump first: the trip is the cost, so that is what the reward has to beat. */
export function byRewardPerJump(a: CourierVerdict, b: CourierVerdict): number {
  return b.rewardPerJump - a.rewardPerJump;
}

/**
 * Jobs you could actually take, best paid first, then the rest.
 *
 * Sorting on reward alone puts a 500M freighter run at the top of a list for someone flying a
 * Deep Space Transport, which is a worse answer than the 8M job they can leave with now.
 */
export function byUsefulness(a: CourierVerdict, b: CourierVerdict): number {
  if (a.takeable !== b.takeable) return a.takeable ? -1 : 1;
  return byRewardPerJump(a, b);
}

/**
 * Ships people actually haul in, with the cargo a bare hull holds and the skills that grow it.
 *
 * Every base figure is read off ESI, and for the hulls with a fleet hangar it is the cargo hold plus
 * that hangar, since a courier package can travel in either --- which is why a Deep Space Transport
 * with a 3,900 m3 hold is the standard ship for 50,000 m3 contracts.
 *
 * The bonuses are applied only where the hull's own dogma attributes name the stat they modify:
 * `freighterBonusC1` and `freighterBonusC2` on a freighter, both 5, tied to exactly the two skills a
 * freighter requires; and `industrialCommandBonusShipCargoCapacity` on the Orca, which says what it
 * does in its own name. The other classes carry bonus attributes too, but nothing in the data says
 * which stat they move, so none is assumed --- a half-remembered bonus is how this file once claimed
 * a freighter holds 1,100,000 m3.
 *
 * Everything remains a starting point: expanders and rigs move the real number further, and only
 * your fitting window knows it.
 */
export type HaulerBonus = {
  /** Any one of these skills; the best trained level counts. */
  anyOf: string[];
  /** Percent added per level. */
  perLevel: number;
  /** The part of the capacity it grows, when not all of it: a DST's fleet hangar, an Orca's cargo hold. */
  onM3?: number;
};

/** Hull classes as ESI's inventory groups name them, so a lost ship can be matched to one. */
export type HullClass = 'Industrial' | 'Blockade Runner' | 'Deep Space Transport' | 'Orca' | 'Jump Freighter' | 'Freighter';

/** The hull class a ship group belongs to, for learning gank lines from your own losses. */
export function hullClassOf(group: string | null): HullClass | null {
  if (!group) return null;
  if (group === 'Industrial Command Ship') return 'Orca';
  // ESI renamed group 28 from "Industrial" to "Hauler" (checked 30 September 2026); both are the T1 haulers.
  if (group === 'Hauler') return 'Industrial';
  return (['Industrial', 'Blockade Runner', 'Deep Space Transport', 'Jump Freighter', 'Freighter'] as const).find((c) => c === group) ?? null;
}

/**
 * One real hull per class, with ESI's own rules (30 September 2026; the Hauling tree below the finder has every hull and
 * its fits). Until then these over-counted: a freighter got Advanced Spaceship Command's 5% a level too (it moves agility,
 * not cargo: a Charon at V is 581,250, not 726,563), the Orca's bonus was put on its fleet hangar (it grows the cargo hold
 * only: 77,500 at V, not 87,500), and a DST's fleet-hangar bonus and a jump freighter's cargo bonus were missing.
 */
export const HAULERS: { name: string; cls: HullClass; m3: number; bonuses?: HaulerBonus[] }[] = [
  { name: 'Industrial — Tayra, the biggest Tech I hauler', cls: 'Industrial', m3: 7300, bonuses: [{ anyOf: ['Caldari Hauler'], perLevel: 5 }] },
  { name: 'Blockade Runner — Crane', cls: 'Blockade Runner', m3: 4300, bonuses: [{ anyOf: ['Caldari Hauler'], perLevel: 5 }] },
  { name: 'Deep Space Transport — Bustard, cargo and fleet hangar', cls: 'Deep Space Transport', m3: 55000, bonuses: [{ anyOf: ['Transport Ships'], perLevel: 5, onM3: 50000 }] },
  { name: 'Orca — cargo and fleet hangar', cls: 'Orca', m3: 70000, bonuses: [{ anyOf: ['Industrial Command Ships'], perLevel: 5, onM3: 30000 }] },
  { name: 'Jump Freighter — Rhea', cls: 'Jump Freighter', m3: 144000, bonuses: [{ anyOf: ['Caldari Freighter'], perLevel: 5 }] },
  { name: 'Freighter — Charon', cls: 'Freighter', m3: 465000, bonuses: [{ anyOf: ['Caldari Freighter'], perLevel: 5 }] },
];

/**
 * What that hull holds for *you*, rather than for a pilot who has trained nothing.
 *
 * A Charon at Caldari Freighter V carries 1.25 times its base, 581,250 m3. Bonuses compound rather than add, which is
 * how EVE applies them; one that grows only part of the space (`onM3`) grows only that part.
 */
export function effectiveCapacity(
  hauler: { m3: number; bonuses?: HaulerBonus[] },
  levelOf: (skill: string) => number,
): { m3: number; from: { skill: string; level: number; perLevel: number }[] } {
  const from: { skill: string; level: number; perLevel: number }[] = [];
  let m3 = hauler.m3;
  for (const b of hauler.bonuses ?? []) {
    const best = b.anyOf
      .map((skill) => ({ skill, level: levelOf(skill) }))
      .sort((x, y) => y.level - x.level)[0];
    if (!best || best.level <= 0) continue;
    if (b.onM3 != null) m3 += b.onM3 * (b.perLevel / 100) * best.level;
    else m3 *= 1 + (b.perLevel / 100) * best.level;
    from.push({ ...best, perLevel: b.perLevel });
  }
  return { m3: Math.round(m3), from };
}

/**
 * A job to take out and one to bring back.
 *
 * Half of hauling badly is flying home empty. If something is being shipped from where you are
 * going to where you started, the return leg pays too and the jumps are ones you were making anyway.
 * Matching is on the system rather than the station: a different station in the same system is a
 * short undock, not another trip.
 */
export type RoundTrip = { out: CourierVerdict; back: CourierVerdict; reward: number; jumps: number };

export function roundTrips(rows: CourierVerdict[]): RoundTrip[] {
  const takeable = rows.filter((v) => v.takeable && v.start.systemId != null && v.end.systemId != null);
  const out: RoundTrip[] = [];
  const used = new Set<number>();
  for (const a of takeable) {
    if (used.has(a.c.contractId)) continue;
    const back = takeable.find((b) =>
      b.c.contractId !== a.c.contractId &&
      !used.has(b.c.contractId) &&
      b.start.systemId === a.end.systemId &&
      b.end.systemId === a.start.systemId);
    if (!back) continue;
    used.add(a.c.contractId); used.add(back.c.contractId);
    out.push({
      out: a, back,
      reward: a.c.reward + back.c.reward,
      jumps: (a.jumps ?? 0) + (back.jumps ?? 0),
    });
  }
  return out.sort((x, y) => y.reward - x.reward);
}

/** What a run of the best jobs would pay, and what it would tie up while you fly it. */
export function tally(rows: CourierVerdict[], n: number): { reward: number; jumps: number; collateral: number; count: number } {
  const take = rows.filter((v) => v.takeable).slice(0, n);
  return {
    reward: take.reduce((t, v) => t + v.c.reward, 0),
    jumps: take.reduce((t, v) => t + (v.jumps ?? 0), 0),
    collateral: take.reduce((t, v) => t + v.c.collateral, 0),
    count: take.length,
  };
}
