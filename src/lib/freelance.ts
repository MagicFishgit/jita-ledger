/**
 * Freelance jobs that pay more for an item than Jita sells it for. Freelance jobs (Legion, 2025) are posted by
 * corporations and players with a pre-funded ISK pool; a "Deliver" job pays a fixed reward for each unit of an item (or
 * of any item in a group) delivered to one of its offices. The research found a Game Masters job paying 1,000,000 ISK
 * a Dairy Products against ~11,000 in Jita, and the user put this under Side hustles: buy in Jita, haul, deliver.
 *
 * ESI (checked 29 September 2026): GET /freelance-jobs, newest first, `limit` up to 100, paged back with the `before`
 * cursor (491 active jobs, 381 of them DeliverItem); GET /freelance-jobs/{id} for the details: what's wanted
 * (`item_type` or `item_group`), where (`station` or `structure`), `reward_per_contribution`, the pool left, how much is
 * still wanted, and a per-player cap on 38 of the 381 (343 have none). You accept a job in game before delivering.
 * Pure.
 */
import type { Endpoint } from './courier';

export type RawFreelanceJob = {
  id: string; name: string; state: string;
  progress?: { current: number; desired: number };
  reward?: { initial: number; remaining: number };
  details?: { expires?: string; creator?: { character?: { id: number; name: string }; corporation?: { id: number; name: string } } };
  configuration?: { method?: string; parameters?: Record<string, Record<string, Record<string, { values?: { value_type: string; values: string[] }[] }>>> };
  contribution?: { reward_per_contribution?: number; contribution_per_participant_limit?: number; submission_multiplier?: number };
  access_and_visibility?: { acl_protected?: boolean };
};

export type DeliverJob = {
  id: string; name: string;
  corp: string; corpId: number | null;
  expires: string | null;
  /** ISK for each unit delivered. */
  perUnit: number;
  /** Units still wanted, as far as the pool left pays for them. */
  unitsLeft: number;
  /** The most one player may deliver; null when the job sets no cap. */
  perPlayer: number | null;
  /** What it takes: one item, or any item in a group. */
  item: { kind: 'type' | 'group'; ids: number[] };
  /** Where it's delivered: the job's offices, a station or a player structure. */
  to: { kind: 'station' | 'structure'; id: number }[];
};

/** A job read, or null when it isn't an open "Deliver" job this can judge. */
export function readDeliverJob(j: RawFreelanceJob): DeliverJob | null {
  if (j.state !== 'Active' || j.configuration?.method !== 'DeliverItem') return null;
  // What each unit counts as is unknown for anything but 1 (every job seen had 1), so others are left out.
  if ((j.contribution?.submission_multiplier ?? 1) !== 1) return null;
  const c = j.configuration.parameters?.corporation_item_delivery?.corporation_item_delivery;
  const it = c?.item_type?.values?.[0];
  const kind = it?.value_type === 'item_group' ? 'group' : it?.value_type === 'item_type' ? 'type' : null;
  const ids = (it?.values ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const to = (c?.corporation_office_location?.values ?? []).flatMap((v) =>
    v.value_type === 'station' || v.value_type === 'structure' ? v.values.map((x) => ({ kind: v.value_type as 'station' | 'structure', id: Number(x) })).filter((x) => x.id > 0) : []);
  const perUnit = j.contribution?.reward_per_contribution ?? 0;
  const wanted = Math.max(0, (j.progress?.desired ?? 0) - (j.progress?.current ?? 0));
  const paid = perUnit > 0 ? Math.floor((j.reward?.remaining ?? 0) / perUnit) : 0;
  const unitsLeft = Math.min(wanted, paid);
  if (!kind || !ids.length || !to.length || !(perUnit > 0) || unitsLeft <= 0) return null;
  const cap = j.contribution?.contribution_per_participant_limit;
  return {
    id: j.id, name: j.name,
    corp: j.details?.creator?.corporation?.name ?? '', corpId: j.details?.creator?.corporation?.id ?? null,
    expires: j.details?.expires ?? null, perUnit, unitsLeft, perPlayer: cap != null && cap > 0 ? cap : null,
    item: { kind, ids }, to,
  };
}

export type DeliverCall = {
  job: DeliverJob;
  /** The item to buy: the job's, or the one in its group that makes the most. */
  typeId: number;
  /** Units bought from the cheapest Jita listings while each costs less than the reward, up to what you may deliver. */
  units: number;
  cost: number;
  pay: number;
  profit: number;
  /** What stopped it at `units`: your cap on the job, what the job still wants, or the listings under the reward. */
  limit: 'player' | 'left' | 'listed';
};

/**
 * What delivering an item to a job makes: buy the cheapest Jita listings (no broker fee or tax on a purchase) while a
 * unit costs less than the job pays, up to your cap and what it still wants. Null when nothing listed is under the reward.
 */
export function priceDeliver(job: DeliverJob, typeId: number, sells: { price: number; volume: number }[]): DeliverCall | null {
  const cap = Math.min(job.perPlayer ?? Infinity, job.unitsLeft);
  let units = 0, cost = 0;
  for (const s of [...sells].sort((a, b) => a.price - b.price)) {
    if (s.price >= job.perUnit || units >= cap) break;
    const take = Math.min(s.volume, cap - units);
    units += take;
    cost += take * s.price;
  }
  if (units <= 0) return null;
  const limit = units < cap ? 'listed' : job.perPlayer != null && job.perPlayer <= job.unitsLeft ? 'player' : 'left';
  return { job, typeId, units, cost, pay: units * job.perUnit, profit: units * job.perUnit - cost, limit };
}

/** The best way to fill a job: its item, or of a group's items the one that makes the most. */
export function bestDeliver(job: DeliverJob, typeIds: number[], sellsOf: (typeId: number) => { price: number; volume: number }[] | undefined): DeliverCall | null {
  let best: DeliverCall | null = null;
  for (const t of typeIds) {
    const c = priceDeliver(job, t, sellsOf(t) ?? []);
    if (c && (!best || c.profit > best.profit)) best = c;
  }
  return best;
}

export type DeliverFlag = 'cantSee' | 'unchecked' | 'lowsec' | 'noRoute' | 'gank' | 'expiring';

/**
 * What to know before taking it: a delivery point you may not be able to dock at (a structure ESI won't describe to
 * you, or one it wasn't asked about), one below high-sec or with no high-sec route from Jita, a route through the gank
 * systems, and a job that ends within a day.
 */
export function deliverFlags(dest: Endpoint, jumps: number | null, throughGank: boolean, expires: string | null, now: number): DeliverFlag[] {
  const out: DeliverFlag[] = [];
  if (dest.kind === 'structure' && dest.systemId == null) out.push(dest.unchecked ? 'unchecked' : 'cantSee');
  if (dest.security != null && dest.security < 0.45) out.push('lowsec');
  if (dest.systemId != null && jumps == null) out.push('noRoute');
  if (throughGank) out.push('gank');
  if (expires && Date.parse(expires) - now < 86400_000) out.push('expiring');
  return out;
}
