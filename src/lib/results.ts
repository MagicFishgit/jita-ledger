/**
 * What each thing you do actually earns, day by day.
 *
 * Every figure is attributed from your own records by a stated rule: trading from your positions'
 * realized profit, abyssal running from filaments bought against loot sold, hauling from courier
 * rewards, planets from sales of planetary goods less customs tax, loyalty from sales of loyalty-store
 * goods less the ISK the store took, and combat from bounties and missions. Ships lost are charged to
 * the activity they were lost in. None of it is estimated.
 */

import { categoryOf } from './wallet';
import type { Activity } from './types';
import { bucketIndex } from './longRange';

export type DayEvent = { t: number; activity: Activity; isk: number };

const DAY = 86400_000;
const dayStart = (t: number) => Date.parse(new Date(t).toISOString().slice(0, 10) + 'T00:00:00Z');

/** Daily totals per activity for the last `days` days, oldest first, today included. */
export function byDay(events: DayEvent[], days: number, now: number, activities: Activity[]): { day: number; values: number[] }[] {
  const end = dayStart(now);
  const first = end - (days - 1) * DAY;
  const out = Array.from({ length: days }, (_, i) => ({ day: first + i * DAY, values: activities.map(() => 0) }));
  for (const e of events) {
    const d = dayStart(e.t);
    if (d < first || d > end) continue;
    const k = activities.indexOf(e.activity);
    if (k < 0) continue;
    out[Math.round((d - first) / DAY)].values[k] += e.isk;
  }
  return out;
}

/**
 * Totals per activity in each bucket (a day, week or month starting at each of `starts`, from
 * `bucketStarts`), counting events from `since` to `now`. Long periods are charted by the week or month.
 */
export function byBucket(events: DayEvent[], starts: number[], since: number, now: number, activities: Activity[]): { day: number; values: number[] }[] {
  const out = starts.map((t) => ({ day: t, values: activities.map(() => 0) }));
  for (const e of events) {
    if (e.t < since || e.t > now) continue;
    const i = bucketIndex(starts, e.t);
    const k = activities.indexOf(e.activity);
    if (i < 0 || k < 0) continue;
    out[i].values[k] += e.isk;
  }
  return out;
}

export function totals(series: { values: number[] }[], n: number): number[] {
  const t = new Array(n).fill(0);
  for (const d of series) d.values.forEach((v, k) => (t[k] += v));
  return t;
}

/** ISK per hour of your time, when you have said how many hours a week an activity takes. */
export function perHour(total: number, hoursPerWeek: number | undefined, days: number): number | null {
  if (hoursPerWeek == null || !(hoursPerWeek > 0)) return null;
  return total / (hoursPerWeek * (days / 7));
}

/** The item groups that say which activity a trade belongs to, read from ESI's market groups. */
export type TypeSets = { filaments: Set<number>; abyssLoot: Set<number>; pi: Set<number>; lpGoods: Set<number> };

export type AttributionInput = {
  txs: { id: string; typeId: number; date: string; isBuy: boolean; qty: number; unitPrice: number }[];
  journal: { date: string; refType: string; amount: number; contextId?: number }[];
  /** Trades a position counts. Those are trading, whatever the item. */
  tracked: Set<string>;
  /** Each change in a position's realized profit, when it happened. */
  realized: { t: number; isk: number }[];
  /** What each ship lost cost after insurance, and what you were doing. */
  losses: { t: number; activity: Activity; isk: number }[];
  sets: TypeSets;
  /** A trade for one of your freelance jobs (freelance.ts isFreelanceTrade), not tagged Personal. */
  freelance?: (tx: { id: string; typeId: number; date: string }) => boolean;
  /** Used only for a sale whose tax the journal doesn't show. */
  salesTax: number;
};

/**
 * Every ISK movement that belongs to an activity, by the rules at the top of this file. A trade no
 * position counts goes to the activity its item belongs to; one that belongs to none is left out
 * rather than guessed at.
 */
export function attribute(inp: AttributionInput): DayEvent[] {
  const out: DayEvent[] = [];
  const taxByTx = new Map<string, number>();
  for (const e of inp.journal) {
    if (e.refType === 'transaction_tax' && e.contextId != null) taxByTx.set(String(e.contextId), (taxByTx.get(String(e.contextId)) ?? 0) + Math.abs(e.amount));
  }
  for (const r of inp.realized) if (r.isk) out.push({ t: r.t, activity: 'Trading', isk: r.isk });
  for (const tx of inp.txs) {
    if (inp.tracked.has(tx.id)) continue;
    const t = Date.parse(tx.date);
    const gross = tx.qty * tx.unitPrice;
    const net = tx.isBuy ? -gross : gross - (taxByTx.get(tx.id) ?? gross * inp.salesTax);
    const { filaments, abyssLoot, pi, lpGoods } = inp.sets;
    // Freelance: the items bought for a job, and any sold again, against its rewards below.
    if (inp.freelance?.(tx)) { out.push({ t, activity: 'Freelance', isk: net }); continue; }
    if (filaments.has(tx.typeId) ? tx.isBuy : abyssLoot.has(tx.typeId) && !tx.isBuy) out.push({ t, activity: 'Abyssal', isk: net });
    else if (pi.has(tx.typeId) && !tx.isBuy) out.push({ t, activity: 'Planets', isk: net });
    else if (lpGoods.has(tx.typeId) && !tx.isBuy) out.push({ t, activity: 'Loyalty', isk: net });
  }
  for (const e of inp.journal) {
    const t = Date.parse(e.date);
    if (e.refType.startsWith('planetary_') && e.refType.endsWith('_tax')) out.push({ t, activity: 'Planets', isk: e.amount });
    else if (e.refType === 'lp_store') out.push({ t, activity: 'Loyalty', isk: e.amount });
    else if (e.refType === 'contract_reward' && e.amount > 0) out.push({ t, activity: 'Hauling', isk: e.amount });
    else if (e.refType === 'freelance_jobs_reward') out.push({ t, activity: 'Freelance', isk: e.amount });
    else if (categoryOf(e)?.key === 'bounties') out.push({ t, activity: 'Combat', isk: e.amount });
  }
  for (const l of inp.losses) out.push({ t: l.t, activity: l.activity, isk: -l.isk });
  return out;
}
