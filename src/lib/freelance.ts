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

export type RawFreelanceJob = {
  id: string; name: string; state: string;
  progress?: { current: number; desired: number };
  reward?: { initial: number; remaining: number };
  details?: { expires?: string; created?: string; creator?: { character?: { id: number; name: string }; corporation?: { id: number; name: string } } };
  configuration?: { method?: string; parameters?: Record<string, Record<string, Record<string, { values?: { value_type: string; values: string[] }[] }>>> };
  contribution?: { reward_per_contribution?: number; contribution_per_participant_limit?: number; submission_multiplier?: number };
  access_and_visibility?: { acl_protected?: boolean; broadcast_locations?: { id: number; name?: string }[] };
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
  /**
   * The solar systems it's broadcast in. The game lists a job only within 5 jumps of one of them (the Opportunities
   * window: "Lists all Freelance Jobs broadcasted within 5 jumps"), so that's where you can accept it.
   */
  broadcast: number[];
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
    broadcast: (j.access_and_visibility?.broadcast_locations ?? []).map((b) => b.id).filter((id) => id > 0),
  };
}

export type DeliverCall = {
  job: DeliverJob;
  /** The item bought most of; `types` has each item in a group job's buy. */
  typeId: number;
  types: { typeId: number; units: number; cost: number }[];
  /** Units bought from the cheapest Jita listings while each costs less than the reward, up to what you may deliver. */
  units: number;
  cost: number;
  /** The cheapest and dearest price paid: "costs 11.79" read as one price when it was the average of 11.76 to 11.79. */
  low: number;
  high: number;
  /** The tax rate it was priced after (a fraction; 0 when your corporation's isn't known, which the tab says). */
  taxRate: number;
  /** What one unit pays you after that tax, and so the dearest listing worth buying. */
  net: number;
  /** The rewards after tax, and the tax taken from them. */
  pay: number;
  taxed: number;
  profit: number;
  /** What stopped it at `units`: your cap on the job, what the job still wants, or the listings under the reward. */
  limit: 'player' | 'left' | 'listed';
};

/**
 * What delivering an item to a job makes: buy the cheapest Jita listings (no broker fee or tax on a purchase) while a
 * unit costs less than the job pays after your corporation's tax, up to your cap and what it still wants. Null when
 * nothing listed is under that.
 */
export function priceDeliver(job: DeliverJob, typeId: number, sells: { price: number; volume: number }[], tax = 0): DeliverCall | null {
  return bestDeliver(job, [typeId], () => sells, tax);
}

/**
 * The best way to fill a job: the cheapest listings of every item it takes, cheapest first. A group job takes any item
 * in its group one unit apiece, so its cheapest listings may be of several items; this first took only the one item
 * that made most, and would have missed raw Scordite under the reward beside the compressed kind.
 */
export function bestDeliver(job: DeliverJob, typeIds: number[], sellsOf: (typeId: number) => { price: number; volume: number }[] | undefined, tax = 0): DeliverCall | null {
  const cap = Math.min(job.perPlayer ?? Infinity, job.unitsLeft);
  // Your corporation takes its tax before the reward reaches the wallet (the user's rewards were 89% of the job's rate
  // under an NPC corporation's 11%), so a listing is worth buying only under what a unit pays after it.
  const net = job.perUnit * (1 - tax);
  const lots = typeIds.flatMap((t) => (sellsOf(t) ?? []).map((s) => ({ typeId: t, price: s.price, volume: s.volume }))).sort((a, b) => a.price - b.price);
  const by = new Map<number, { typeId: number; units: number; cost: number }>();
  let units = 0, cost = 0, low = Infinity, high = 0;
  for (const s of lots) {
    if (s.price >= net || units >= cap) break;
    const take = Math.min(s.volume, cap - units);
    if (take <= 0) continue;
    units += take;
    cost += take * s.price;
    low = Math.min(low, s.price);
    high = Math.max(high, s.price);
    const t = by.get(s.typeId) ?? { typeId: s.typeId, units: 0, cost: 0 };
    t.units += take; t.cost += take * s.price;
    by.set(s.typeId, t);
  }
  if (units <= 0) return null;
  const types = [...by.values()].sort((a, b) => b.units - a.units);
  const limit = units < cap ? 'listed' : job.perPlayer != null && job.perPlayer <= job.unitsLeft ? 'player' : 'left';
  const pay = units * net;
  return { job, typeId: types[0].typeId, types, units, cost, low, high, taxRate: tax, net, pay, taxed: units * job.perUnit - pay, profit: pay - cost, limit };
}

/** Your corporation and its tax rate, as ESI gives them: what the finder prices a job after. */
export type CorpTax = { id: number; name: string; ticker: string; taxRate: number; at: string };

/**
 * `meta.corp` from ESI's two public answers: the character's corporation (`corporation_id`, from POST
 * /characters/affiliation/) and that corporation (`/corporations/{id}/`: `name`, `ticker`, `tax_rate`, a fraction).
 * Null when either lacks what it needs: an unread rate must never become 0%.
 */
export function readCorp(char: { corporation_id?: number } | null | undefined, corp: { name?: string; ticker?: string; tax_rate?: number } | null | undefined, at: string): CorpTax | null {
  const id = char?.corporation_id, rate = corp?.tax_rate;
  if (!id || !(id > 0) || !corp?.name || rate == null || !Number.isFinite(rate) || rate < 0 || rate > 1) return null;
  return { id, name: corp.name, ticker: corp.ticker ?? '', taxRate: rate, at };
}

/** A tax rate as the game shows it: "11%", "0%", "7.5%". */
export const taxPct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

/** What the finder's profit is after, in words: "after TEMP TAX HAVEN’s 0% tax", or that the rate isn't known yet. */
export const afterTax = (corp: Pick<CorpTax, 'name' | 'taxRate'> | null | undefined) =>
  corp ? `after ${corp.name}’s ${taxPct(corp.taxRate)} tax` : 'before tax: your corporation’s tax not read yet';

/** A job's office as the tab judges it: where it is, whether ESI would describe it, and how it's reached from Jita. */
export type Office = {
  id: number; name: string | null; systemId: number | null; security: number | null;
  /** A structure ESI wouldn't describe (you may not be able to dock), or one it wasn't asked about. */
  unseen: 'cantSee' | 'unchecked' | null;
  jumps: number | null; anyJumps: number | null; throughGank: boolean; aroundExtra: number | null;
};

/**
 * Which of a job's offices to deliver to: one you can see before one you can't, high-sec reachable on a high-sec route
 * before anything else, then the fewest jumps, then round the gank systems. The tab first took the first office listed:
 * the user's Scordite job named Sankkasen, 5 jumps out, when it also took deliveries 3 or 4 jumps from Jita.
 */
export function bestOffice(offices: Office[]): Office | null {
  const rank = (o: Office) => [o.unseen ? 1 : 0, o.jumps == null ? 1 : 0, o.jumps ?? o.anyJumps ?? 999, o.throughGank ? 1 : 0];
  return [...offices].sort((a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; })[0] ?? null;
}

/** Where you can accept a job: within 5 jumps (any route) of one of its broadcast systems, the nearest named. */
export const BROADCAST_JUMPS = 5;
export function whereToAccept(broadcast: number[], anyJumps: (system: number) => number | null): { fromJita: boolean; nearest: number | null; jumps: number | null } {
  let nearest: number | null = null, jumps: number | null = null;
  for (const b of broadcast) {
    const d = anyJumps(b);
    if (d != null && (jumps == null || d < jumps)) { jumps = d; nearest = b; }
  }
  return { fromJita: jumps != null && jumps <= BROADCAST_JUMPS, nearest, jumps };
}

export type DeliverFlag = 'cantSee' | 'unchecked' | 'lowsec' | 'noRoute' | 'gank' | 'expiring';

/**
 * What to know before taking it: a delivery point you may not be able to dock at (a structure ESI won't describe to
 * you, or one it wasn't asked about), one below high-sec or with no high-sec route from Jita, a high-sec route that can
 * only run through Uedama or Sivala (one that can go round them just costs the extra jumps, said beside it), and a job
 * that ends within a day. The filters the user asked to have on by default hide the first three kinds.
 */
export function deliverFlags(o: Office, expires: string | null, now: number): DeliverFlag[] {
  const out: DeliverFlag[] = [];
  if (o.unseen) out.push(o.unseen);
  if (o.security != null && o.security < 0.45) out.push('lowsec');
  if (o.systemId != null && o.jumps == null) out.push('noRoute');
  if (o.throughGank && o.aroundExtra == null) out.push('gank');
  if (expires && Date.parse(expires) - now < 86400_000) out.push('expiring');
  return out;
}

/** The kinds of flag each default-on filter hides. */
export const FILTER_HIDES = { highsec: ['lowsec', 'noRoute'], gank: ['gank'], dock: ['cantSee', 'unchecked'] } as const;

/** A job you've joined, as kept for your records: what it takes, what it pays, when it began, how much you've delivered. */
export type JoinedJob = {
  id: string; name: string; state: string; standing: string; perUnit: number; perPlayer: number | null;
  types: number[]; created: string | null; expires: string | null; delivered: number;
};

/** The job a reward is for: its journal entry's reason reads "project_id=<job id>:project_name=<name>". */
export const rewardJob = (reason: string | undefined): string | null => /project_id=([0-9a-f-]{36})/i.exec(reason ?? '')?.[1] ?? null;

export type JobLedger = {
  rewards: number; payments: number;
  /** What you bought of the items it takes since it began, and what you sold of them (leftovers, a mistake). */
  bought: number; cost: number; sold: number; revenue: number;
  /** Delivered, as the rewards say (each paid at the job's rate). */
  delivered: number;
  /** Profit on what's delivered so far: rewards, less the delivered units at your average cost, plus any leftovers sold. */
  profit: number;
  /** Bought and not yet delivered or sold, at your average cost. */
  heldUnits: number; heldCost: number;
};

/**
 * Each job you've done, in ISK: the rewards your journal says it paid, and what the items it takes cost you. The user
 * bought 38,132,412 Compressed Scordite 0-Grade for a job paying 17 each and asked what it cost and what it made; the
 * rewards landed as "Other income" and the buys as untracked purchases, nothing tying them together. A trade counts for
 * a job when its item is one the job takes and it's after the job began (to the latest-begun such job you're in),
 * unless a position counts it or you tagged it Personal. Pure.
 */
export function jobLedgers(jobs: JoinedJob[], journal: { date: string; refType: string; amount: number; reason?: string }[],
  txs: { id: string; typeId: number; date: string; isBuy: boolean; qty: number; unitPrice: number }[], skip: ReadonlySet<string>): Map<string, JobLedger> {
  const out = new Map<string, JobLedger>(jobs.map((j) => [j.id, { rewards: 0, payments: 0, bought: 0, cost: 0, sold: 0, revenue: 0, delivered: 0, profit: 0, heldUnits: 0, heldCost: 0 }]));
  for (const e of journal) {
    if (e.refType !== 'freelance_jobs_reward') continue;
    const l = out.get(rewardJob(e.reason) ?? '');
    if (l) { l.rewards += e.amount; l.payments++; }
  }
  const began = (j: JoinedJob) => (j.created ? Date.parse(j.created) : 0);
  for (const t of txs) {
    if (skip.has(t.id)) continue;
    const at = Date.parse(t.date);
    const j = jobs.filter((x) => x.types.includes(t.typeId) && began(x) <= at).sort((a, b) => began(b) - began(a))[0];
    if (!j) continue;
    const l = out.get(j.id)!;
    if (t.isBuy) { l.bought += t.qty; l.cost += t.qty * t.unitPrice; } else { l.sold += t.qty; l.revenue += t.qty * t.unitPrice; }
  }
  for (const j of jobs) {
    const l = out.get(j.id)!;
    l.delivered = j.perUnit > 0 ? Math.round(l.rewards / j.perUnit) : j.delivered;
    const avg = l.bought > 0 ? l.cost / l.bought : 0;
    l.profit = l.rewards - avg * Math.min(l.delivered, l.bought) + (l.revenue - avg * l.sold);
    l.heldUnits = Math.max(0, l.bought - l.delivered - l.sold);
    l.heldCost = l.heldUnits * avg;
  }
  return out;
}

/** A trade for one of your freelance jobs: an item a job you've joined takes, traded after the job began. */
export function isFreelanceTrade(jobs: Pick<JoinedJob, 'types' | 'created'>[], tx: { typeId: number; date: string }): boolean {
  const at = Date.parse(tx.date);
  return jobs.some((j) => j.types.includes(tx.typeId) && (!j.created || Date.parse(j.created) <= at));
}
