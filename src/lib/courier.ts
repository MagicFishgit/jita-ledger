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

/** Ships people actually haul in, so the volume limit isn't a number pulled from the air. */
export const HAULERS: { name: string; m3: number }[] = [
  { name: 'Industrial (e.g. Badger, Wreathe)', m3: 5000 },
  { name: 'Tech 2 hauler (e.g. Crane, Prowler)', m3: 6000 },
  { name: 'Deep Space Transport (e.g. Occator)', m3: 62000 },
  { name: 'Freighter (e.g. Charon, Obelisk)', m3: 1100000 },
  { name: 'Jump Freighter (e.g. Rhea)', m3: 360000 },
];
