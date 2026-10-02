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
  /**
   * `finished` is there once it's done (a finished job answers only when sent the app's X-Compatibility-Date: `state`
   * "Completed", read on 1 October 2026).
   */
  details?: { expires?: string; created?: string; finished?: string; creator?: { character?: { id: number; name: string }; corporation?: { id: number; name: string } } };
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

/** `/corporations/{id}/` as ESI answers it: the shape changed with the compatibility date (see `corpRate`). */
export type RawCorp = { name?: string; ticker?: string; tax_rate?: number; tax_rates?: { isk?: number; loyalty_point?: number } };

/**
 * A corporation's ISK tax as a fraction, from `/corporations/{id}/`, or null when it doesn't say. The answer depends on
 * the compatibility date sent: with the app's (2026-08-18) ESI gives `tax_rates: { isk: 11.0, loyalty_point: 0.0 }`, in
 * percent, and no `tax_rate`; without one, or with 2025-08-26, it gives `tax_rate: 0.11`, a fraction (both read on
 * 1 October 2026, School of Applied Knowledge and TEMP TAX HAVEN). Reading only `tax_rate` read nothing in the app.
 */
export function corpRate(corp: RawCorp | null | undefined): number | null {
  const pct = corp?.tax_rates?.isk;
  const rate = pct != null ? pct / 100 : corp?.tax_rate;
  return rate == null || !Number.isFinite(rate) || rate < 0 || rate > 1 ? null : rate;
}

/**
 * `meta.corp` from ESI's two public answers: the character's corporation (`corporation_id`, from POST
 * /characters/affiliation/) and that corporation (`/corporations/{id}/`: `name`, `ticker`, and its tax: `corpRate`).
 * Null when either lacks what it needs: an unread rate must never become 0%.
 */
export function readCorp(char: { corporation_id?: number } | null | undefined, corp: RawCorp | null | undefined, at: string): CorpTax | null {
  const id = char?.corporation_id, rate = corpRate(corp);
  if (!id || !(id > 0) || !corp?.name || rate == null) return null;
  return { id, name: corp.name, ticker: corp.ticker ?? '', taxRate: rate, at };
}

/** A tax rate as the game shows it: "11%", "0%", "7.5%". */
export const taxPct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

/** A name's possessive: "TEMP TAX HAVEN’s", but "Caldari Provisions’", not "Provisions’s". */
export const possessive = (name: string) => (/s$/i.test(name.trim()) ? `${name.trim()}’` : `${name.trim()}’s`);

/** What the finder's profit is after, in words: "after TEMP TAX HAVEN’s 0% tax", or that the rate isn't known yet. */
export const afterTax = (corp: Pick<CorpTax, 'name' | 'taxRate'> | null | undefined) =>
  corp ? `after ${possessive(corp.name)} ${taxPct(corp.taxRate)} tax` : 'before tax: your corporation’s tax not read yet';

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


/**
 * A job you took part in, as kept for your records: every job a reward in your journal names, and every one ESI lists
 * as joined (freelanceStore.ts `readJobHistory`). The sync once replaced the list with ESI's joined jobs, which hold
 * only the one running: three finished jobs' purchases became "Other purchases" and left the tab. Kept in
 * `meta.freelance`, which stays in each browser (cloudSync.ts LOCAL_META): each rebuilds it from the journal, which
 * syncs record by record, and from ESI's public job details, so no newest-wins document can drop another device's job.
 * The fields after `delivered` came later; a job kept before them has none.
 */
export type JoinedJob = {
  id: string; name: string;
  /** ESI's state: Active, Completed, Expired…; "Unknown" for a job ESI wouldn't describe. */
  state: string;
  /** Your part in it, from ESI's participation: Committed, Kicked, Resigned; "Unspecified" when not read. */
  standing: string;
  /** What it pays a unit before your corporation's tax; 0 when not known. */
  perUnit: number; perPlayer: number | null;
  /** The items it takes (a group's looked up); none when not known. */
  types: number[]; created: string | null; expires: string | null;
  /** What ESI's participation says you've delivered; 0 when not read. */
  delivered: number;
  /** When it was done (`details.finished`); null while it runs. */
  finished?: string | null;
  /** Who posted it: the character and their corporation. */
  by?: { character?: string; corp?: string };
  /** Everyone's deliveries to it, and what it wanted, as last read. */
  progress?: { current: number; desired: number };
  /** False for a job ESI wouldn't describe (gone, or failing when asked): it's known by its rewards alone. */
  described?: boolean;
  /** On ESI's list of the jobs you've joined, at the last read of it. */
  joined?: boolean;
  /** What it asks for, as it puts it: one item, or any item of a group. */
  item?: { kind: 'type' | 'group'; ids: number[] };
};

/**
 * A job as kept, from its public details (`types`: what it takes, a group's items looked up) and, for a job on your
 * joined list, what ESI's participation says. A job counting other than one unit per contribution (none seen) gets no
 * rate a unit: its units would be guessed.
 */
export function jobFromDetail(raw: RawFreelanceJob, types: number[], part: { standing?: string; delivered?: number; joined?: boolean } = {}): JoinedJob {
  const it = raw.configuration?.parameters?.corporation_item_delivery?.corporation_item_delivery?.item_type?.values?.[0];
  const ids = (it?.values ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const kind = it?.value_type === 'item_group' ? 'group' : it?.value_type === 'item_type' ? 'type' : null;
  const cap = raw.contribution?.contribution_per_participant_limit;
  const one = (raw.contribution?.submission_multiplier ?? 1) === 1;
  return {
    id: raw.id, name: raw.name, state: raw.state, standing: part.standing ?? 'Unspecified',
    perUnit: one ? raw.contribution?.reward_per_contribution ?? 0 : 0, perPlayer: cap != null && cap > 0 ? cap : null,
    types, created: raw.details?.created ?? null, expires: raw.details?.expires ?? null, delivered: part.delivered ?? 0,
    finished: raw.details?.finished ?? null,
    by: { character: raw.details?.creator?.character?.name, corp: raw.details?.creator?.corporation?.name },
    ...(raw.progress ? { progress: { current: raw.progress.current, desired: raw.progress.desired } } : {}),
    described: true, joined: !!part.joined,
    ...(kind ? { item: { kind, ids } } : {}),
  };
}

/** A job known only by a reward naming it: ESI wouldn't describe it, or hasn't been asked yet. */
export const stubJob = (id: string, name: string): JoinedJob => ({
  id, name, state: 'Unknown', standing: 'Unspecified', perUnit: 0, perPlayer: null, types: [], created: null, expires: null, delivered: 0, finished: null, described: false,
});

/** The job a reward is for: its journal entry's reason reads "project_id=<job id>:project_name=<name>". */
export const rewardJob = (reason: string | undefined): string | null => /project_id=([0-9a-f-]{36})/i.exec(reason ?? '')?.[1] ?? null;

/**
 * The job's name as a reward's reason gives it. ESI escapes it there: the user's "/!\ Mining Kernite" reads
 * "/!\\ Mining Kernite", and "…all type ✓" reads "…all type ✓", as six characters (D1, 1 October 2026).
 */
export function rewardJobName(reason: string | undefined): string | null {
  const m = /project_name=(.*)$/s.exec(reason ?? '');
  if (!m) return null;
  return m[1].replace(/\\(\\|u([0-9a-fA-F]{4}))/g, (_: string, x: string, hex?: string) => (hex ? String.fromCharCode(parseInt(hex, 16)) : x));
}

const jobTime = (j: JoinedJob) => Date.parse(j.finished ?? j.created ?? '') || 0;
/** Running first, then the rest; newest first in each. */
export const sortJobs = (jobs: JoinedJob[]) =>
  [...jobs].sort((a, b) => (a.state === 'Active' ? 0 : 1) - (b.state === 'Active' ? 0 : 1) || jobTime(b) - jobTime(a) || a.name.localeCompare(b.name));

/**
 * What's kept after a read: every job either list knew, each as the newer read has it, except that a job ESI wouldn't
 * describe this time keeps what was read of it before. Nothing is dropped: the list is your history.
 */
export function mergeJobs(had: JoinedJob[], read: JoinedJob[]): JoinedJob[] {
  const out = new Map(had.map((j) => [j.id, j]));
  for (const j of read) {
    const old = out.get(j.id);
    out.set(j.id, j.described === false && old && old.described !== false ? { ...old, joined: j.joined ?? old.joined } : j);
  }
  return sortJobs([...out.values()]);
}

/** `meta.freelance` after a read: the jobs merged into what's kept (nothing dropped), the corporations as read, else as they were. */
export function withRead(cur: { at: string; jobs: JoinedJob[]; corps?: CorpSpan[] } | undefined, read: { at: string; jobs: JoinedJob[]; corps?: CorpSpan[] }) {
  const corps = read.corps ?? cur?.corps;
  return { at: read.at, jobs: mergeJobs(cur?.jobs ?? [], read.jobs), ...(corps ? { corps } : {}) };
}

/**
 * When a job stopped taking deliveries: when it finished, else when it expires, whatever its state: a job kept as Active
 * that ESI then stopped describing would otherwise stay open for good, and every later purchase of its items be its. A
 * running job's expiry is ahead, so nothing changes for it.
 */
export function jobEnd(j: { finished?: string | null; expires?: string | null }): number {
  if (j.finished) return Date.parse(j.finished);
  return j.expires ? Date.parse(j.expires) : Infinity;
}

/** Still taking deliveries at `now`: Active, not finished, and not past its expiry. */
export const isRunning = (j: Pick<JoinedJob, 'state' | 'finished' | 'expires'>, now: number) => j.state === 'Active' && !j.finished && !(j.expires && Date.parse(j.expires) <= now);

/**
 * A trade for one of your freelance jobs: an item a job you took part in takes, traded while it ran (from its start to
 * its finish). A purchase after a job finished (ore to refine, a mistake) isn't the job's. The jobs are your history,
 * so a finished job's purchases still count: they were "Other purchases" once it left ESI's joined list.
 */
export function isFreelanceTrade(jobs: { types: number[]; created: string | null; finished?: string | null; expires?: string | null; state?: string }[], tx: { typeId: number; date: string }): boolean {
  const at = Date.parse(tx.date);
  return jobs.some((j) => j.types.includes(tx.typeId) && (!j.created || Date.parse(j.created) <= at) && at <= jobEnd(j));
}

/**
 * A corporation the character was in from `start` (ESI's public corporation history), with its ISK tax as ESI gives it
 * now. `start` null: the corporation you're in now (the affiliation lookup) when ESI's history doesn't list it yet (it's
 * held a day: on 1 October 2026 it still ended with School of Applied Knowledge hours after the user founded TEMP TAX
 * HAVEN), so joined at a time not known, after the last dated one.
 */
export type CorpSpan = { id: number; name?: string; start: string | null; taxRate: number | null };

/** `/corporations/{id}/` with what says when you joined one you founded. */
export type RawCorpFounded = RawCorp & { creator_id?: number; date_founded?: string };

/**
 * The corporations you were in from `since` on, from ESI's public corporation history (`history`, as ESI gives it) and
 * each corporation's answer (`bodies`), for working out a reward's tax when the journal doesn't give it. ESI holds the
 * history a day, so a corporation just joined isn't in it: `current` (the affiliation read and its answer) is added then,
 * starting the moment you founded it when you did (its `creator_id` is you, `date_founded` when), else at a time not
 * known. Pure.
 */
export function corpSpans(characterId: number, history: { corporation_id: number; start_date: string }[], since: number,
  bodies: ReadonlyMap<number, RawCorpFounded | null>, current: { id: number; body: RawCorpFounded } | null): CorpSpan[] {
  const dated = [...history].sort((a, b) => Date.parse(a.start_date) - Date.parse(b.start_date));
  const span = (id: number, start: string | null): CorpSpan => {
    const body = id === current?.id ? current.body : bodies.get(id);
    return { id, ...(body?.name ? { name: body.name } : {}), start, taxRate: corpRate(body) };
  };
  const out = historyFrom(dated, since).map((h) => span(h.corporation_id, h.start_date));
  const last = dated[dated.length - 1];
  if (current && last?.corporation_id !== current.id) {
    const b = current.body;
    const founded = b.creator_id === characterId && b.date_founded && (!last || Date.parse(b.date_founded) > Date.parse(last.start_date)) ? b.date_founded : null;
    out.push(span(current.id, founded));
  }
  return out;
}

/** The history entries a span list needs: the last to start by `since`, and every one after it. */
export function historyFrom(history: { corporation_id: number; start_date: string }[], since: number) {
  const dated = [...history].sort((a, b) => Date.parse(a.start_date) - Date.parse(b.start_date));
  let from = 0;
  for (let k = 0; k < dated.length; k++) if (Date.parse(dated[k].start_date) <= since) from = k;
  return dated.slice(from);
}

/** The corporations you may have been in at `t`: one, or two when `t` falls after the history's last entry and it's behind. */
export function corpsAt(spans: CorpSpan[], t: number): CorpSpan[] {
  const dated = spans.filter((s) => s.start != null).sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!));
  let i = -1;
  for (let k = 0; k < dated.length; k++) if (Date.parse(dated[k].start!) <= t) i = k;
  if (i < 0) return [];
  const at = dated[i];
  return [at, ...(i === dated.length - 1 ? spans.filter((s) => s.start == null && s.id !== at.id) : [])];
}

/** A freelance reward as the history reads it. */
export type RewardRead = {
  id?: string; at: string; amount: number;
  /** The units it paid for: null when its tax isn't recorded and can't be worked out, or the job's rate isn't known. */
  units: number | null;
  /** The tax taken before it reached the wallet, and its rate: null when not recorded. */
  tax: number | null; rate: number | null;
  /**
   * How the tax is known: ESI's journal gives it (`esi`), or it's worked out (`derived`): the corporation you were in
   * then, by ESI's corporation history, charges a rate at which this reward is a whole number of units to the cent.
   */
  how: 'esi' | 'derived' | null;
  /** The corporation a worked-out rate is that of. */
  corp?: string;
  /**
   * The tax your journal gave, when (amount + it) isn't a whole number of units at the job's rate to the cent: what ESI's
   * `tax` means on a freelance reward hasn't been seen, so a figure that doesn't fit is set aside, not trusted.
   */
  journalTax?: number;
  /**
   * Why its units aren't known: the job's rate a unit isn't (`rate`), no corporation history covers it (`history`), or
   * it's a whole number of units at none, or at more than one, of the rates you may have paid (`fits`).
   */
  why?: 'rate' | 'history' | 'fits';
};

const cents = (x: number) => Math.round(x * 100) / 100;
/** `amount` as a whole number of units at `net` a unit, to the cent, and no more than `most`: the units, or null. */
function wholeUnits(amount: number, net: number, most: number): number | null {
  if (!(net > 0)) return null;
  const u = Math.round(amount / net);
  return u > 0 && u <= most && Math.abs(u * net - amount) <= 0.005 + 1e-6 ? u : null;
}

/**
 * What one reward paid for. With ESI's `tax` on the entry: the units are (amount + tax) ÷ the job's rate, when that comes
 * out whole to the cent (and within everyone's deliveries to a finished job); what `tax` means on a freelance reward hasn't
 * been seen, so a figure that doesn't fit is set aside (`journalTax`) and the reward read as if it weren't there. Without
 * it (an entry stored before the tax was kept and older than ESI's 30 days, or ESI not giving one), the rate is never
 * assumed: arithmetic alone can't tell, since 593,096,000 is a whole number of units at 0%, 2%, 11%, 20% and more (at 17
 * a unit), and even 255,106,158.37 is at 11%, 39% and 51%. So it's worked out only from the corporation ESI's history
 * says you were in then, at its rate, when the reward is whole to the cent there and no more than everyone delivered to
 * the job; while the history is behind your current corporation, both corporations' rates are tried, and two that fit
 * leave it not recorded.
 */
export function readReward(e: { id?: string; date: string; amount: number; tax?: number }, job: JoinedJob, spans: CorpSpan[]): RewardRead {
  const per = job.perUnit;
  // A finished job's deliveries from everyone bound yours.
  const most = job.state !== 'Active' && job.progress ? job.progress.current : Infinity;
  const hasTax = e.tax != null && Number.isFinite(e.tax);
  const base = { ...(e.id ? { id: e.id } : {}), at: e.date, amount: e.amount };
  if (hasTax && !(per > 0)) return { ...base, tax: Math.abs(e.tax!), rate: e.amount + Math.abs(e.tax!) > 0 ? Math.abs(e.tax!) / (e.amount + Math.abs(e.tax!)) : null, how: 'esi', units: null, why: 'rate' };
  if (hasTax) {
    const tax = Math.abs(e.tax!), gross = e.amount + tax;
    const units = wholeUnits(gross, per, most);
    if (units != null) return { ...base, tax, rate: gross > 0 ? tax / gross : null, how: 'esi', units };
    // It doesn't come out whole: set aside, and worked out as if the journal hadn't given it.
    return { ...readReward({ ...e, tax: undefined }, job, spans), journalTax: tax };
  }
  const none = { units: null, tax: null, rate: null, how: null };
  if (!(per > 0)) return { ...base, ...none, why: 'rate' };
  const may = corpsAt(spans, Date.parse(e.date));
  if (!may.length || may.some((c) => c.taxRate == null)) return { ...base, ...none, why: 'history' };
  const fits = new Map<number, { units: number; corp: CorpSpan }>();
  for (const c of may) {
    const u = wholeUnits(e.amount, per * (1 - c.taxRate!), most);
    if (u != null && !fits.has(c.taxRate!)) fits.set(c.taxRate!, { units: u, corp: c });
  }
  if (fits.size !== 1) return { ...base, ...none, why: 'fits' };
  const [[rate, f]] = [...fits];
  return { ...base, units: f.units, tax: cents(f.units * per - e.amount), rate, how: 'derived', ...(f.corp.name ? { corp: f.corp.name } : {}) };
}

/** One job in your history, in ISK. */
export type JobRow = {
  job: JoinedJob;
  /** Its rewards, oldest first. */
  rewards: RewardRead[];
  received: number;
  /** Tax over the rewards whose tax is known, and how many rewards' tax isn't. */
  tax: number; taxUnknown: number;
  /** Units delivered, as the rewards say: null while any reward's units aren't known. */
  delivered: number | null;
  /**
   * Of the delivered units, those that came from what you bought while it ran, what they cost (and the cheapest and
   * dearest), and those that didn't: mined, contracted from another character, looted, or bought before it began. Those
   * have no cost here, and the tab says so.
   */
  fromBought: number; cost: number; low: number | null; high: number | null; fromStock: number;
  /** Bought while it ran and not delivered or sold: units and what they cost. */
  held: number; heldCost: number;
  /** Sold again: units of what was bought for it, what they fetched after sales tax, and what they cost. */
  sold: number; revenue: number; soldCost: number;
  /**
   * Sold while it ran with nothing bought for a job behind them (mined, contracted, looted): units and what they fetched,
   * left out of the profit and said apart, as on Positions, never costed at 0.
   */
  soldOther: number; soldOtherRevenue: number;
  /** The rewards, less what the delivered units you bought cost, plus what selling them again made. Null while delivered isn't known. */
  profit: number | null;
  /** A job taking the same items has a reward whose units aren't known, so which purchases were whose may be off. */
  unsure: boolean;
  /** When it was last active: finished, else its last reward, else begun. */
  at: number;
};
export type HistoryTotal = {
  jobs: number; received: number; payments: number; tax: number; taxUnknown: number; delivered: number; fromStock: number;
  cost: number; held: number; heldCost: number; profit: number;
  /**
   * Jobs whose units, and so cost, leftovers and profit, aren't known: left out of those totals (what a job bought can't be
   * said to be left over while what it delivered isn't known).
   */
  unknown: number;
};

type Tx = { id: string; typeId: number; date: string; isBuy: boolean; qty: number; unitPrice: number };
/** Two trade IDs in the order ESI issued them (numbers as strings). */
const idOrder = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every job you did, in ISK: what each paid (your journal's rewards, each naming its job), the tax taken, the units
 * delivered, what the ones you bought cost, what's left over, and the profit; with a total.
 *
 * Which purchase was for which job (the user's Scordite jobs overlapped: four ran between 29 September and 1 October,
 * each taking every kind of Scordite): each delivery takes what you bought most recently before it, of the items its job
 * takes, while it ran, and a purchase is taken once. That is how freelance hauling goes (buy, haul, deliver), and the
 * user's own ledger shows it: 813,258 Compressed Scordite bought at 21.96 on 29 September at 12:03:02, after that day's
 * deliveries, went straight onto a sell order at 21.96 (order 7432972978, 12:03:46, still open in full) and was never
 * delivered. First in, first out would have delivered it into the 1 October rewards and left cheaper units over. Units a
 * delivery needs beyond what's left to take came from stock you didn't buy for it, and are said apart, never costed at
 * 0. What's bought and not delivered stays with the job paid next after it (else the latest begun that could take it).
 * A sale takes what was left behind, oldest first, of its own item bought before it, each unit counted for the job that
 * purchase was left with: so a leftover sold during a later job (the 21.96 lot's sell order filling during a Buy Back) is
 * the earlier job's, and doesn't eat the later job's fresh purchases. It first took the newest purchases since the
 * latest-begun job began, which charged that leftover to the Buy Back and called its own 20,000,000 "stock you didn't
 * buy". A sale after every job of its item finished still takes leftovers (the sell order filling next week leaves
 * nothing over). Units sold while a job ran with nothing bought behind them are said apart and left out of its profit:
 * costed at 0, 5,000,000 mined Veldspar sold during the Veldspar job added 35.75 M to it. Trades in `skip` (a position
 * counts them, or you tagged them) are no job's, as on the Wallet. Pure.
 */
/** ESI caches wallet transactions for an hour (eve-facts.md): the copy a sync read was taken this long before it said new ones can appear. */
export const TRADES_CACHE_MS = 3600_000;

/**
 * How far your trades are read: when EVE's copy behind the last read was taken (an hour before it said new trades can
 * appear), or the newest trade held, whichever is later (the cloud may have brought newer ones). Null when neither is known.
 */
export function tradesReadTo(freshAt: string | undefined, newestTrade: number | null): number | null {
  const copy = freshAt ? Date.parse(freshAt) - TRADES_CACHE_MS : NaN;
  const best = Math.max(Number.isFinite(copy) ? copy : -Infinity, newestTrade ?? -Infinity);
  return Number.isFinite(best) ? best : null;
}

/**
 * A job paid after your trades are read may have bought what it delivered after them, so units it delivered "from stock
 * you didn't buy for it" may be purchases EVE hasn't shown yet. The journal comes sooner than the trades: the user's
 * Добыча Veldspar* job (2 October 2026) was paid 208 M at 17:33:16 for 8,000,000 units bought from three listings at
 * 17:26:54 (60,988,458 ISK of escrow in the journal), while their trades were read only to 17:00:11, and the tab said
 * the units came from stock they didn't buy, at no cost.
 */
export function purchasesPending(r: Pick<JobRow, 'rewards' | 'fromStock'>, readTo: number | null): boolean {
  if (!(r.fromStock > 0) || !r.rewards.length) return false;
  const last = Math.max(...r.rewards.map((x) => Date.parse(x.at)));
  return readTo == null || last > readTo;
}

export function jobHistory(inp: {
  jobs: JoinedJob[];
  journal: { id?: string; date: string; refType: string; amount: number; reason?: string; tax?: number; contextId?: number }[];
  txs: Tx[]; skip: ReadonlySet<string>; corps?: CorpSpan[];
  /** Your sales tax rate, for a sale whose tax the journal doesn't show. */
  salesTax?: number;
  /** For which jobs still run (sorted first); now, unless given. */
  now?: number;
}): { rows: JobRow[]; total: HistoryTotal } {
  const byId = new Map(inp.jobs.map((j) => [j.id, j]));
  const rewards = new Map<string, RewardRead[]>();
  const taxOf = new Map<string, number>();
  for (const e of inp.journal) {
    if (e.refType === 'transaction_tax' && e.contextId != null) taxOf.set(String(e.contextId), (taxOf.get(String(e.contextId)) ?? 0) + Math.abs(e.amount));
    if (e.refType !== 'freelance_jobs_reward') continue;
    const id = rewardJob(e.reason);
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, stubJob(id, rewardJobName(e.reason) ?? ''));
    const list = rewards.get(id) ?? [];
    list.push(readReward(e, byId.get(id)!, inp.corps ?? []));
    rewards.set(id, list);
  }
  for (const list of rewards.values()) list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const jobs = [...byId.values()];
  const takes = jobs.filter((j) => j.types.length > 0);
  const began = (j: JoinedJob) => (j.created ? Date.parse(j.created) : -Infinity);
  const inWindow = (j: JoinedJob, t: number) => began(j) <= t && t <= jobEnd(j);

  type Lot = { id: string; t: number; typeId: number; price: number; left: number };
  const lots: Lot[] = [];
  const sales: Tx[] = [];
  const anyTakes = new Set(takes.flatMap((j) => j.types));
  for (const tx of inp.txs) {
    if (inp.skip.has(tx.id)) continue;
    if (tx.isBuy) { if (isFreelanceTrade(takes, tx)) lots.push({ id: tx.id, t: Date.parse(tx.date), typeId: tx.typeId, price: tx.unitPrice, left: tx.qty }); }
    // A sale of a job's item, in a job's window or after: it may sell what was left over.
    else if (anyTakes.has(tx.typeId)) sales.push(tx);
  }
  lots.sort((a, b) => a.t - b.t || idOrder(a.id, b.id));
  /** The newest purchases first, up to `want`, of those `ok` lets a use at `t` take. */
  const draw = (t: number, ok: (l: Lot) => boolean, want: number) => {
    let got = 0, cost = 0, low = Infinity, high = -Infinity;
    for (let k = lots.length - 1; k >= 0 && got < want; k--) {
      const l = lots[k];
      if (l.left <= 0 || l.t > t || !ok(l)) continue;
      const take = Math.min(l.left, want - got);
      l.left -= take; got += take; cost += take * l.price;
      low = Math.min(low, l.price); high = Math.max(high, l.price);
    }
    return { got, cost, low, high };
  };

  const rowOf = new Map<string, JobRow>();
  for (const j of jobs) {
    const rs = rewards.get(j.id) ?? [];
    const unknownUnits = rs.some((r) => r.units == null);
    rowOf.set(j.id, {
      job: j, rewards: rs, received: rs.reduce((s, r) => s + r.amount, 0),
      tax: cents(rs.reduce((s, r) => s + (r.tax ?? 0), 0)), taxUnknown: rs.filter((r) => r.tax == null).length,
      delivered: unknownUnits ? null : rs.reduce((s, r) => s + (r.units ?? 0), 0),
      fromBought: 0, cost: 0, low: null, high: null, fromStock: 0, held: 0, heldCost: 0, sold: 0, revenue: 0, soldCost: 0, soldOther: 0, soldOtherRevenue: 0, profit: null, unsure: false,
      at: j.finished ? Date.parse(j.finished) : rs.length ? Date.parse(rs[rs.length - 1].at) : j.created ? Date.parse(j.created) : 0,
    });
  }

  // Which job a purchase is left with when nothing takes it: the job paid next after it, else the latest begun that could.
  const nextPaid = (j: JoinedJob, t: number) => (rewards.get(j.id) ?? []).map((r) => Date.parse(r.at)).filter((x) => x >= t).sort((a, b) => a - b)[0] ?? Infinity;
  const ownerOf = (l: Lot) => takes.filter((j) => j.types.includes(l.typeId) && inWindow(j, l.t))
    .sort((a, b) => nextPaid(a, l.t) - nextPaid(b, l.t) || began(b) - began(a))[0] ?? null;

  // Deliveries and sales in the order they happened (a sale first within a second).
  type Use = { t: number; job: JoinedJob; units: number } | { t: number; sale: Tx };
  const uses: Use[] = [];
  for (const j of takes) for (const r of rewards.get(j.id) ?? []) if (r.units != null && r.units > 0) uses.push({ t: Date.parse(r.at), job: j, units: r.units });
  for (const s of sales) uses.push({ t: Date.parse(s.date), sale: s });
  uses.sort((a, b) => a.t - b.t || ('sale' in a ? 0 : 1) - ('sale' in b ? 0 : 1));
  for (const u of uses) {
    if ('sale' in u) {
      const s = u.sale;
      const gross = s.qty * s.unitPrice;
      const each = (gross - (taxOf.get(s.id) ?? gross * (inp.salesTax ?? 0))) / s.qty;
      let left = s.qty;
      // What was left behind, oldest first, each unit for the job its purchase was left with.
      for (const l of lots) {
        if (left <= 0 || l.t > u.t) break;
        if (l.left <= 0 || l.typeId !== s.typeId) continue;
        const owner = ownerOf(l);
        if (!owner) continue;
        const take = Math.min(l.left, left);
        l.left -= take; left -= take;
        const row = rowOf.get(owner.id)!;
        row.sold += take; row.revenue += take * each; row.soldCost += take * l.price;
      }
      // The rest wasn't bought for a job: said apart on the job running then, out of its profit; after every job, no job's.
      const j = left > 0 ? takes.filter((x) => x.types.includes(s.typeId) && inWindow(x, u.t)).sort((a, b) => began(b) - began(a))[0] : null;
      if (j) { const row = rowOf.get(j.id)!; row.soldOther += left; row.soldOtherRevenue += left * each; }
      continue;
    }
    const row = rowOf.get(u.job.id)!;
    const d = draw(u.t, (l) => u.job.types.includes(l.typeId) && inWindow(u.job, l.t), u.units);
    row.fromBought += d.got; row.cost += d.cost; row.fromStock += u.units - d.got;
    if (d.got > 0) { row.low = Math.min(row.low ?? Infinity, d.low); row.high = Math.max(row.high ?? -Infinity, d.high); }
  }

  // What's left over stays with the job paid next after it was bought, else the latest begun that could take it.
  for (const l of lots) {
    if (l.left <= 0) continue;
    const j = ownerOf(l);
    if (!j) continue;
    const row = rowOf.get(j.id)!;
    row.held += l.left; row.heldCost += l.left * l.price;
  }

  const unknownTypes = new Set(takes.filter((j) => rowOf.get(j.id)!.delivered == null).flatMap((j) => j.types));
  for (const row of rowOf.values()) {
    row.cost = cents(row.cost); row.heldCost = cents(row.heldCost); row.revenue = cents(row.revenue); row.soldCost = cents(row.soldCost); row.soldOtherRevenue = cents(row.soldOtherRevenue);
    row.unsure = row.delivered != null && row.job.types.some((t) => unknownTypes.has(t));
    row.profit = row.delivered == null ? null : cents(row.received - row.cost + row.revenue - row.soldCost);
  }
  // A job kept before `joined` was (always from the joined list) counts as joined.
  const now = inp.now ?? Date.now();
  const running = (r: JobRow) => (isRunning(r.job, now) ? 0 : 1);
  const rows = [...rowOf.values()].filter((r) => r.rewards.length > 0 || r.job.joined !== false || r.held > 0 || r.sold > 0 || r.soldOther > 0)
    .sort((a, b) => running(a) - running(b) || b.at - a.at || a.job.name.localeCompare(b.job.name));
  const sum = (f: (r: JobRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const known = (f: (r: JobRow) => number) => (r: JobRow) => (r.delivered == null ? 0 : f(r));
  const total: HistoryTotal = {
    jobs: rows.length, received: cents(sum((r) => r.received)), payments: sum((r) => r.rewards.length), tax: cents(sum((r) => r.tax)), taxUnknown: sum((r) => r.taxUnknown),
    delivered: sum(known((r) => r.delivered!)), fromStock: sum(known((r) => r.fromStock)), cost: cents(sum(known((r) => r.cost))),
    held: sum(known((r) => r.held)), heldCost: cents(sum(known((r) => r.heldCost))), profit: cents(sum((r) => r.profit ?? 0)),
    unknown: rows.filter((r) => r.delivered == null).length,
  };
  return { rows, total };
}
