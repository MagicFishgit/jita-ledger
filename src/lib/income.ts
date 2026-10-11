import type { Data } from './store';
import { netLoss, type CombatActivity } from './combat';
import { rates } from './fees';
import { isFreelanceTrade } from './freelance';
import { claimsOf } from './everyItem';
import { builtAndSold, type MatsOf } from './industryTrack';
import { countedIn, type PositionCalc } from './positions';
import { nettedJournal } from './refunds';
import { attribute, otherSales, taxesByTx as taxesOf, type DayEvent, type TypeSets } from './results';
import { isTrade, isUnbought, itemResult, type ItemCalc } from './longRange';
import { ACTIVITIES } from './prefs';
import type { Activity } from './types';

/**
 * What a ledger earned: every ISK movement attributed to an activity by Results' rules (lib/results.ts), for Results and
 * for the Wallet's "All income against play", and that panel's sum. Pure, so it runs on any ledger, the main's or an
 * alt's copy; components/activityEvents.ts reads the item groups, names and ship losses it needs and hands them in.
 */

export const ACTIVITY_WHAT: Record<Activity, string> = {
  Trading: 'Realized profit from your positions',
  Loyalty: 'Loyalty-store goods sold, less the ISK the store took',
  Planets: 'Planetary goods sold, less customs tax',
  Hauling: 'Courier rewards, less haulers lost',
  Abyssal: 'Abyssal loot sold, less filaments bought and ships lost',
  Combat: 'Bounties and missions, less ships lost',
  Freelance: 'Freelance job rewards, less everything bought for the jobs (stock not yet delivered included; the Freelance tab shows profit on what’s delivered)',
  Industry: 'What you built and sold, after sales tax, less every job’s fees and the materials your manufacturing jobs used (at what you still held from your own purchases when each job started; materials you didn’t hold that way aren’t costed, and said)',
  Rewards: 'Daily goal payouts, AIR career program rewards and CCP’s other rewards for playing (challenges, milestones, opportunities), less any tax on them',
};
const LOSS_ACTIVITY: Record<CombatActivity, Activity> = { Abyssal: 'Abyssal', Hauling: 'Hauling', PvP: 'Combat', PvE: 'Combat' };
/** The activities counted without ESI's item groups. */
const WITHOUT_SETS = new Set<Activity>(['Trading', 'Hauling', 'Freelance', 'Combat', 'Industry', 'Rewards']);

/** What each ship lost was doing, by killmail ID (killmails.ts classify). */
export type LossActs = Record<number, CombatActivity>;
/**
 * `events`: every ISK movement an activity counts. `others`: the sales no activity counts, which only the Wallet adds.
 * `typeSets`: the item groups each activity counts, mutaplasmids with the abyssal loot; null until read (or when ESI failed).
 */
export type Acts = {
  events: DayEvent[]; others: { t: number; isk: number; typeId: number }[]; typeSets: TypeSets | null;
  /** Industry's state and what it couldn't cost, said under its row; null with no jobs. */
  industry: IndustryActs | null;
};

/**
 * Industry's inputs (useActivityEvents' useBuiltInputs): `none` when no job needs the bundle (no manufacturing job's ME was
 * recorded), `loading` while it and the sites' security load, `ready`, or `failed`.
 */
export type BuiltInputs = { state: 'none' | 'loading' | 'ready' | 'failed'; mats: MatsOf | null };
/** What Industry is: being worked out, not countable (the bundle refused), or counted, with what it couldn't cost. */
export type IndustryActs = { state: 'loading' | 'failed' | 'ready'; unknownJobs: number; unbought: { typeId: number; units: number }[]; offSite: number; feesUnknown: number; feesPartial?: number };

/**
 * Industry's figure and note as the pages say them (Results' row, the Wallet's All income, a Characters card): while its
 * inputs load, "Working out…" and what's being read; refused, "–" and that it isn't counted; counted, the figure itself
 * (`figure` null) and what it couldn't cost, if anything. Never a figure of claimed sales without materials under a false
 * reason (pre-flight I4).
 */
export function industrySaid(ind: IndustryActs | null, name: (typeId: number) => string): { figure: string | null; note: string | null } {
  if (!ind) return { figure: null, note: null };
  if (ind.state === 'loading') return { figure: 'Working out…', note: 'Reading the blueprints, to cost what you built…' };
  if (ind.state === 'failed') return { figure: '–', note: 'The blueprints couldn’t be loaded, so what you built isn’t counted here or in the total.' };
  const parts = [
    ind.feesPartial ? (ind.feesPartial === 1 ? 'the journal named only part of 1 job’s fees, so ESI’s cost is charged for it' : `the journal named only part of ${ind.feesPartial} jobs’ fees, so ESI’s cost is charged for them`) : null,
    ind.feesUnknown ? (ind.feesUnknown === 1 ? '1 job’s fee isn’t known (ESI gave no cost, and no journal entry names it), so none is charged for it' : `${ind.feesUnknown} jobs’ fees aren’t known (ESI gave no cost, and no journal entry names them), so none is charged for them`) : null,
    ind.unknownJobs ? `${ind.unknownJobs} manufacturing job${ind.unknownJobs === 1 ? '’s' : 's’'} materials aren’t known (no ME recorded when first seen, or a blueprint the bundle lacks)` : null,
    ind.unbought.length ? `materials you didn’t hold from purchases when the job started (mined, looted, or bought and sold again) aren’t costed: ${ind.unbought.slice(0, 3).map((u) => `${u.units.toLocaleString('en-US')} ${name(u.typeId)}`).join(', ')}${ind.unbought.length > 3 ? ` and ${ind.unbought.length - 3} more` : ''}` : null,
    // A home you typed in has no structure ID, so no job matches it (Task 11's jobPlace, the same rule): said, so a builder
    // there knows why its bonuses aren't applied and how to give it one.
    ind.offSite ? `${ind.offSite} manufacturing job${ind.offSite === 1 ? '' : 's'} ran at a structure that isn’t one of your build sites (a home you typed in has none to match: find it by name under Industry, Build), at a site of kind Other, or at one whose system’s security couldn’t be read: no bonuses applied where not known` : null,
  ].filter(Boolean);
  const note = parts.join('; ');
  return { figure: null, note: note ? `${note.charAt(0).toUpperCase()}${note.slice(1)}.` : null };
}

/**
 * A ledger's ISK movements by activity: the item groups that say which activity a trade is (`sets`, null until read;
 * `failed` when ESI couldn't say), positions' realized profit (`posCalc`), ships lost by what they were doing
 * (`lossActs`), freelance trades. `mine`: your characters (roster.ts `ownIds`), so ISK moved between two of them isn't
 * counted; absent, as before. `built`: Industry's materials (`BuiltInputs`); absent, its jobs are costed without them
 * (each manufacturing job's materials said as not known).
 */
export function activityEvents(d: Data, sets: TypeSets | null, failed: boolean, lossActs: LossActs, posCalc: { c: PositionCalc }[], mine?: Set<number>, built?: BuiltInputs | null): Acts {
  // Without the item groups (ESI failed), only what needs none is counted: positions, courier rewards, freelance, bounties,
  // rewards and what you built and sold.
  // Every sale would look like an "other sale" then, so there are none.
  const have = sets ?? (failed ? { filaments: new Set<number>(), abyssLoot: new Set<number>(), pi: new Set<number>(), lpGoods: new Set<number>() } : null);
  if (!have) return { events: [], others: [], typeSets: null, industry: null };
  const txs = Object.values(d.txs).filter((t) => t.source === 'esi');
  const tracked = new Set(txs.filter((t) => d.positions.some((p) => countedIn(p, t))).map((t) => t.id));
  const abyssLoot = new Set(have.abyssLoot);
  for (const [id, n] of Object.entries(d.names)) if (/Mutaplasmid$/.test(n)) abyssLoot.add(Number(id));
  const realized: { t: number; isk: number }[] = [];
  for (const { c } of posCalc) {
    let prev = 0;
    for (const s of c.series) { if (s.realized !== prev) realized.push({ t: s.t, isk: s.realized - prev }); prev = s.realized; }
  }
  const losses = Object.values(d.killmails)
    .filter((k) => k.kind === 'loss' && k.value && lossActs[k.id])
    .map((k) => ({ t: Date.parse(k.time), activity: LOSS_ACTIVITY[lossActs[k.id]], isk: netLoss(k) }));
  const jobs = d.meta.freelance?.jobs ?? [];
  const personal = new Set(d.ignored);
  // As on the Wallet: a trade you tagged (or marked Personal) is no job's, whatever its item.
  const tags = d.tags ?? {};
  const freelance = (tx: { id: string; typeId: number; date: string }) => !personal.has(tx.id) && !(tx.id in tags) && isFreelanceTrade(jobs, tx);
  // What you built and sold is Industry's, claimed first (everyItem.ts claimsOf): the claimed units come off every other rule.
  const claims = claimsOf(d);
  const inp = { txs, journal: Object.values(nettedJournal(d.journal)), tracked, realized, losses, sets: { ...have, abyssLoot }, freelance, salesTax: rates(d.settings).t, ...(mine ? { mine } : {}), claims };
  // Industry (built and sold): its own rules, needing no item groups. Its materials need the bundle (`built.mats`, loaded by
  // useActivityEvents only for a ledger with a manufacturing job whose ME was recorded). While it loads, or if it couldn't
  // be, there's no Industry figure at all, and it says which (industrySaid): never claimed sales with no materials.
  const industryJobs = Object.values(d.jobs ?? {});
  const bstate = built?.state ?? 'none';
  const ind = industryJobs.length && (bstate === 'ready' || bstate === 'none')
    ? builtAndSold({ jobs: industryJobs, txs, journal: inp.journal, claims, taxByTx: taxesOf(inp.journal), salesTax: inp.salesTax, personal, freelance, mats: built?.mats ?? null }) : null;
  const industryEvents = (ind?.events ?? []).map((e) => ({ t: e.t, activity: 'Industry' as const, isk: e.isk }));
  const industry: IndustryActs | null = !industryJobs.length ? null
    : !ind ? { state: bstate === 'failed' ? 'failed' : 'loading', unknownJobs: 0, unbought: [], offSite: 0, feesUnknown: 0 }
      : {
        state: 'ready', unknownJobs: ind.unknown.length, offSite: ind.offSite.length, feesUnknown: ind.feeUnknown.length, feesPartial: ind.feePartial.length,
        unbought: [...ind.unbought.reduce((m, u) => m.set(u.typeId, (m.get(u.typeId) ?? 0) + u.units), new Map<number, number>())].map(([typeId, units]) => ({ typeId, units })),
      };
  if (!sets) return { events: [...attribute(inp), ...industryEvents].filter((e) => WITHOUT_SETS.has(e.activity)), others: [], typeSets: null, industry };
  return { events: [...attribute(inp), ...industryEvents], others: otherSales(inp, personal), typeSets: inp.sets, industry };
}

/** One line of "All income against play": `key` is `'trading'`, `'loot'` or the activity's name. */
export type IncomeRow = { key: string; said: string; isk: number; tip: string };

/**
 * Everything earned between `since` and `now`, by source, rows under 1 ISK left out, biggest first: the Wallet's "All
 * income against play". Trading is every item bought and sold again, by its profit, as Results' "Every item traded"
 * counts it (positions, snipes and the rest); each other activity by Results' own rules; and what was sold but never
 * bought (loot, ore, datacores) by what it sold for after tax. An item an activity counts (filaments, abyssal loot,
 * planetary and loyalty-store goods) is that activity's alone, so nothing is counted twice.
 */
export function incomeRows(calcs: ItemCalc[], acts: Acts, since: number, now: number): { rows: IncomeRow[]; earned: number } {
  const items = calcs.map((c) => itemResult(c, since - 1, now));
  const inWindow = (t: number) => t >= since && t <= now;
  const sets = acts.typeSets;
  const activityItem = (id: number) => !!sets && (sets.filaments.has(id) || sets.abyssLoot.has(id) || sets.pi.has(id) || sets.lpGoods.has(id));
  const trading = items.filter((r) => isTrade(r) && !activityItem(r.typeId)).reduce((t, r) => t + r.profit, 0);
  const neverBought = new Set(items.filter((r) => isUnbought(r) && !activityItem(r.typeId)).map((r) => r.typeId));
  const loot = acts.others.filter((e) => inWindow(e.t) && neverBought.has(e.typeId)).reduce((t, e) => t + e.isk, 0);
  const rows: IncomeRow[] = [
    { key: 'trading', said: 'Trading, every item', isk: trading,
      tip: 'Every item you bought and sold again, by its profit: positions, snipes and anything traded without one, as Results’ “Every item traded” counts it. Personal trades are left out.' },
    ...ACTIVITIES.filter((a) => a !== 'Trading').map((a) => ({ key: a as string, said: a as string, tip: ACTIVITY_WHAT[a], isk: acts.events.filter((e) => e.activity === a && inWindow(e.t)).reduce((t, e) => t + e.isk, 0) })),
    { key: 'loot', said: 'Sold, never bought', isk: loot,
      tip: 'Things you sold that you never bought: loot, salvage, ore, datacores, gifts, by what they sold for after sales tax. Abyssal loot, planetary and loyalty-store goods count with their activities, and Personal sales are left out. Something bought before the app’s records begin would count here too.' },
  ].filter((r) => Math.abs(r.isk) >= 1).sort((a, b) => b.isk - a.isk);
  const earned = rows.reduce((t, r) => t + r.isk, 0);
  return { rows, earned };
}
