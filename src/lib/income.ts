import type { Data } from './store';
import { netLoss, type CombatActivity } from './combat';
import { rates } from './fees';
import { isFreelanceTrade } from './freelance';
import { countedIn, type PositionCalc } from './positions';
import { nettedJournal } from './refunds';
import { attribute, otherSales, type DayEvent, type TypeSets } from './results';
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
};
const LOSS_ACTIVITY: Record<CombatActivity, Activity> = { Abyssal: 'Abyssal', Hauling: 'Hauling', PvP: 'Combat', PvE: 'Combat' };
/** The activities counted without ESI's item groups. */
const WITHOUT_SETS = new Set<Activity>(['Trading', 'Hauling', 'Freelance', 'Combat']);

/** What each ship lost was doing, by killmail ID (killmails.ts classify). */
export type LossActs = Record<number, CombatActivity>;
/**
 * `events`: every ISK movement an activity counts. `others`: the sales no activity counts, which only the Wallet adds.
 * `typeSets`: the item groups each activity counts, mutaplasmids with the abyssal loot; null until read (or when ESI failed).
 */
export type Acts = { events: DayEvent[]; others: { t: number; isk: number; typeId: number }[]; typeSets: TypeSets | null };

/**
 * A ledger's ISK movements by activity: the item groups that say which activity a trade is (`sets`, null until read;
 * `failed` when ESI couldn't say), positions' realized profit (`posCalc`), ships lost by what they were doing
 * (`lossActs`), freelance trades. `mine`: your characters (roster.ts `ownIds`), so ISK moved between two of them isn't
 * counted; absent, as before.
 */
export function activityEvents(d: Data, sets: TypeSets | null, failed: boolean, lossActs: LossActs, posCalc: { c: PositionCalc }[], mine?: Set<number>): Acts {
  // Without the item groups (ESI failed), only what needs none is counted: positions, courier rewards, freelance, bounties.
  // Every sale would look like an "other sale" then, so there are none.
  const have = sets ?? (failed ? { filaments: new Set<number>(), abyssLoot: new Set<number>(), pi: new Set<number>(), lpGoods: new Set<number>() } : null);
  if (!have) return { events: [], others: [], typeSets: null };
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
  const freelance = (tx: { id: string; typeId: number; date: string }) => !personal.has(tx.id) && isFreelanceTrade(jobs, tx);
  const inp = { txs, journal: Object.values(nettedJournal(d.journal)), tracked, realized, losses, sets: { ...have, abyssLoot }, freelance, salesTax: rates(d.settings).t, ...(mine ? { mine } : {}) };
  if (!sets) return { events: attribute(inp).filter((e) => WITHOUT_SETS.has(e.activity)), others: [], typeSets: null };
  return { events: attribute(inp), others: otherSales(inp, personal), typeSets: inp.sets };
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
