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
  | 'endUnknown' | 'startUnknown' | 'lowsec' | 'noSafeRoute'
  | 'tooBig' | 'collateralOverLimit' | 'collateralHeavy' | 'thinReward' | 'rushed' | 'expiringSoon';

/** Flags that make a contract unsafe rather than merely unattractive. */
export const UNSAFE: CourierFlag[] = ['endUnknown', 'startUnknown', 'lowsec', 'noSafeRoute'];

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
): CourierVerdict {
  const flags: CourierFlag[] = [];

  // A destination we cannot even resolve is the scam, not a risk to weigh.
  if (end.kind === 'structure' && end.systemId == null) flags.push('endUnknown');
  if (start.kind === 'structure' && start.systemId == null) flags.push('startUnknown');

  const secs = [start.security, end.security].filter((s): s is number => s != null);
  if (secs.some((s) => s < HIGHSEC)) flags.push('lowsec');
  // No high-sec-only route: the job cannot be done without leaving high-sec, whatever the endpoints.
  if (jumps == null && !flags.includes('endUnknown') && !flags.includes('startUnknown')) flags.push('noSafeRoute');

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

  const safe = !flags.some((f) => UNSAFE.includes(f));
  return {
    c, start, end, jumps,
    rewardPerJump: perJump,
    rewardPerM3: c.volume > 0 ? c.reward / c.volume : 0,
    collateralRatio: c.reward > 0 ? c.collateral / c.reward : Infinity,
    flags, safe,
    takeable: safe && !flags.some((f) => ['tooBig', 'collateralOverLimit', 'thinReward'].includes(f)),
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
  /** Percent of base cargo added per level. */
  perLevel: number;
};

export const HAULERS: { name: string; m3: number; bonuses?: HaulerBonus[] }[] = [
  { name: 'Industrial — Iteron Mark V, Badger, Wreathe, Sigil', m3: 5800 },
  { name: 'Blockade Runner — Crane, Viator, Prowler, Prorator', m3: 4300 },
  { name: 'Deep Space Transport — Bustard, Mastodon, Occator, Impel', m3: 55000 },
  {
    name: 'Orca (ORE, Industrial Command Ships)', m3: 70000,
    bonuses: [{ anyOf: ['Industrial Command Ships'], perLevel: 5 }],
  },
  { name: 'Jump Freighter — Rhea, Anshar, Ark, Nomad', m3: 144000 },
  {
    name: 'Freighter — Charon, Obelisk, Providence, Fenrir', m3: 465000,
    bonuses: [
      { anyOf: ['Amarr Freighter', 'Caldari Freighter', 'Gallente Freighter', 'Minmatar Freighter'], perLevel: 5 },
      { anyOf: ['Advanced Spaceship Command'], perLevel: 5 },
    ],
  },
];

/**
 * What that hull holds for *you*, rather than for a pilot who has trained nothing.
 *
 * A Charon at Advanced Spaceship Command V and its racial Freighter V carries 1.5625 times its base
 * --- the difference between seeing a 600,000 m3 contract as impossible and as an evening's work.
 * Bonuses compound rather than add, which is how EVE applies them.
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
    m3 *= 1 + (b.perLevel / 100) * best.level;
    from.push({ ...best, perLevel: b.perLevel });
  }
  return { m3: Math.round(m3), from };
}

export const ORE_NOTE =
  'ORE builds industrials too, but only one of them helps here. The Orca carries 70,000 m3 of general '
  + 'cargo and is in the list above. The Bowhead is not: its enormous bay takes assembled ships only, '
  + 'and its actual cargo hold is 4,000 m3 — smaller than a Badger.';

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
