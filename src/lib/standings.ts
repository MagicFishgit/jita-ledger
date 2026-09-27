/**
 * What standings are worth in broker fees, worked out from every broker fee you have paid.
 *
 * At an NPC station the broker fee is 3% − 0.3% per Broker Relations level − 0.03% × the owner faction's standing
 * − 0.02% × the owner corporation's, never under 1% (at Jita 4-4: Caldari State and Caldari Navy). Every broker
 * charge is that rate times an order's value, a price change included (it is the rate less the Advanced Broker
 * Relations discount). So each fee divided by the rate you had when you paid it (the kept rate history) is the
 * trading behind it, and that trading at any other standings costs its total × that rate. Sales tax doesn't
 * depend on standings at all.
 */
import type { JournalEntry } from './types';

export const brokerRateAt = (br: number, faction: number, corp: number) =>
  Math.max(0.01, 0.03 - 0.003 * br - 0.0003 * faction - 0.0002 * corp);

export type FeesPaid = {
  paid: number; count: number;
  /** How many of them fell on days whose rate was measured from your own placements. */
  exact: number;
  /** The trading behind them: each fee over the broker rate you had when it was charged. */
  base: number;
  /** The first broker fee the ledger holds. */
  from: string | null;
  /** Days from that first fee to now, at least one. */
  days: number;
};

/**
 * Every broker fee in the ledger, which keeps the journal long after ESI's 30 days, each over the broker rate you
 * paid that day: measured from your own placements where there are any (`measured`, by UTC day), otherwise the
 * rate the app had on record (`recorded`), which is only as good as that record: its first entries can predate
 * the first sync and read 2.23% for someone paying 1.33%.
 */
export function brokerFeesPaid(journal: Record<string, JournalEntry>, now: number, recorded: (iso: string) => number,
  measured: Map<string, number> = new Map()): FeesPaid {
  let paid = 0, base = 0, count = 0, exact = 0, from: string | null = null;
  for (const e of Object.values(journal)) {
    if (e.refType !== 'brokers_fee') continue;
    paid += -e.amount;
    const day = measured.get(e.date.slice(0, 10));
    if (day != null) exact++;
    base += -e.amount / (day ?? recorded(e.date));
    count++;
    if (!from || e.date < from) from = e.date;
  }
  return { paid, base, count, exact, from, days: from ? Math.max(1, (now - Date.parse(from)) / 86400_000) : 0 };
}

/** Placements a day needs before its median is trusted as that day's rate. */
export const MEASURE_MIN = 3;

/**
 * The broker rate you actually paid, by UTC day: the median of fee ÷ order value over the day's placements matched
 * to their orders. The median, because a few matches are wrong (a fee claimed by the wrong order in the same second
 * reads as 7% or infinite) and would drag an average; placements at the 100 ISK minimum say nothing about the rate.
 */
export function measuredRates(byOrder: Map<number, { placement: { journalId?: string; value: number } }>,
  journal: Record<string, JournalEntry>): Map<string, number> {
  const byDay = new Map<string, number[]>();
  for (const { placement } of byOrder.values()) {
    const e = placement.journalId ? journal[placement.journalId] : undefined;
    if (!e || placement.value <= 0 || -e.amount <= 100.5) continue;
    const list = byDay.get(e.date.slice(0, 10)) ?? [];
    list.push(-e.amount / placement.value);
    byDay.set(e.date.slice(0, 10), list);
  }
  const out = new Map<string, number>();
  for (const [day, list] of byDay) {
    if (list.length < MEASURE_MIN) continue;
    const s = list.sort((a, b) => a - b);
    out.set(day, s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2);
  }
  return out;
}

export type StandingCase = { key: string; label: string; faction: number; corp: number; rate: number; fees: number; diff: number };

/**
 * The same trading (`base`, from `brokerFeesPaid`) at other standings: a few named cases, each against your
 * standings now, and a curve along the faction's standing for a given corporation standing.
 */
export function standingsWorth(base: number, br: number, faction: number, corp: number) {
  const rateNow = brokerRateAt(br, faction, corp);
  const at = (f: number, c: number) => base * brokerRateAt(br, f, c);
  const youFees = at(faction, corp);
  const raw: Omit<StandingCase, 'rate' | 'fees' | 'diff'>[] = [
    { key: 'none', label: 'No standings', faction: 0, corp: 0 },
    { key: 'you', label: 'Your standings now', faction, corp },
    ...(faction < 5 ? [{ key: 'f5', label: 'Caldari State at 5', faction: 5, corp }] : []),
    ...(faction < 10 ? [{ key: 'f10', label: 'Caldari State at 10', faction: 10, corp }] : []),
    ...(corp < 10 ? [{ key: 'both', label: 'Both at 10', faction: 10, corp: 10 }] : []),
  ];
  const cases: StandingCase[] = raw.map((c) => {
    const fees = at(c.faction, c.corp);
    return { ...c, rate: brokerRateAt(br, c.faction, c.corp), fees, diff: fees - youFees };
  });
  const curve = (c: number) => Array.from({ length: 21 }, (_, i) => ({ x: i / 2, fees: at(i / 2, c) }));
  return { rateNow, cases, curve };
}
