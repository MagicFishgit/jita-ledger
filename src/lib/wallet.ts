/**
 * The wallet, read from the journal.
 *
 * Every ISK movement has a journal entry and every entry carries the balance after it, so the balance
 * line is exact rather than reconstructed. Where the money came from and went is the journal's
 * ref_type, grouped into things a player recognises.
 *
 * Buying and selling on the market is the exception. The journal records a market purchase as escrow
 * when the order is placed and a transaction when it fills, and counting both would double every
 * trade. So trades are read from wallet transactions, which name the item, and those two journal
 * types are left out of the categories entirely.
 *
 * Pure: everything here takes data and returns numbers.
 */

import type { JournalEntry, Tx, UntrackedTag } from './types';

export type FlowKind = 'Business' | 'Personal';
export type Category = { key: string; label: string; kind?: FlowKind };

/** Journal entries that move ISK between your own pockets, or that trades already account for. */
export const NEUTRAL = new Set([
  'market_transaction', 'market_escrow',
  'contract_collateral', 'contract_collateral_refund', 'contract_deposit', 'contract_deposit_refund',
  'contract_collateral_deposited_corp', 'contract_deposit_corp',
  'corporation_account_withdrawal', 'duel_wager_escrow', 'duel_wager_refund', 'courier_mission_escrow',
]);

const IN: Record<string, Category> = {
  bounty: { key: 'bounties', label: 'Bounties & missions' },
  contracts: { key: 'contracts', label: 'Contracts' },
  courier: { key: 'courier', label: 'Courier rewards' },
  donation: { key: 'donation', label: 'Donations received' },
  insurance: { key: 'insurance', label: 'Insurance' },
  other: { key: 'otherIn', label: 'Other income' },
};

const OUT: Record<string, Category> = {
  fees: { key: 'fees', label: 'Fees & tax', kind: 'Business' },
  couriers: { key: 'couriers', label: 'Couriers & contract fees', kind: 'Business' },
  rent: { key: 'rent', label: 'Office rent', kind: 'Business' },
  planets: { key: 'planets', label: 'Planets', kind: 'Business' },
  lp: { key: 'lp', label: 'Loyalty store', kind: 'Business' },
  industry: { key: 'industry', label: 'Industry', kind: 'Business' },
  clones: { key: 'clones', label: 'Jump clones', kind: 'Personal' },
  skills: { key: 'skills', label: 'Skills', kind: 'Personal' },
  donation: { key: 'donationOut', label: 'Donations given', kind: 'Personal' },
  travel: { key: 'travel', label: 'Repairs & travel', kind: 'Personal' },
  contracts: { key: 'contractsOut', label: 'Contracts bought' },
  other: { key: 'otherOut', label: 'Other spending' },
};

const has = (list: string[], r: string) => list.includes(r);

/** Which group a journal entry belongs in, or null when trades or your own transfers cover it. */
export function categoryOf(e: Pick<JournalEntry, 'refType' | 'amount'>): Category | null {
  const r = e.refType;
  if (NEUTRAL.has(r) || e.amount === 0) return null;
  if (e.amount > 0) {
    if (has(['bounty_prizes', 'bounty_prize', 'agent_mission_reward', 'agent_mission_time_bonus_reward', 'ess_escrow_transfer',
      'mission_reward', 'mission_completion', 'corporate_reward_payout', 'daily_challenge_reward', 'milestone_reward_payment',
      'project_discovery_reward', 'season_challenge_reward', 'resource_wars_reward', 'opportunity_reward', 'agents_preward'], r)) return IN.bounty;
    if (r === 'contract_reward') return IN.courier;
    if (r.startsWith('contract_')) return IN.contracts;
    if (r === 'player_donation') return IN.donation;
    if (r === 'insurance') return IN.insurance;
    return IN.other;
  }
  if (r === 'brokers_fee' || r === 'transaction_tax') return OUT.fees;
  if (has(['contract_reward_deposited', 'contract_brokers_fee', 'contract_sales_tax', 'contract_deposit_sales_tax'], r)) return OUT.couriers;
  if (r === 'office_rental_fee') return OUT.rent;
  if (r.startsWith('planetary_')) return OUT.planets;
  if (r === 'lp_store') return OUT.lp;
  if (has(['industry_job_tax', 'manufacturing', 'researching_material_productivity', 'researching_technology',
    'researching_time_productivity', 'copying', 'reaction', 'reprocessing_tax', 'reverse_engineering'], r)) return OUT.industry;
  if (has(['jump_clone_activation_fee', 'jump_clone_installation_fee', 'clone_activation', 'clone_transfer'], r)) return OUT.clones;
  if (r === 'skill_purchase') return OUT.skills;
  if (r === 'player_donation') return OUT.donation;
  if (has(['repair_bill', 'docking_fee', 'acceleration_gate_fee', 'structure_gate_jump', 'security_processing_fee'], r)) return OUT.travel;
  if (r.startsWith('contract_')) return OUT.contracts;
  return OUT.other;
}

/** Running costs: the ones that recur whatever you are doing. */
export const RUNNING = new Set(['rent', 'couriers', 'planets', 'clones']);

export type Line = { key: string; label: string; amount: number; kind?: FlowKind; count: number };

/** How a trade counts in the flows: tracked trading, or something else. */
export type TradeClass = { tracked: boolean; tag: UntrackedTag };

/**
 * Money in and money out over a window, grouped.
 *
 * Trades are split by whether a position counts them. A sale nothing tracks is loot or a one-off, not
 * trading; a purchase you marked personal is play, not stock.
 */
export function flows(
  journal: JournalEntry[],
  txs: Tx[],
  classOf: (tx: Tx) => TradeClass,
  since: number,
  until = Infinity,
): { ins: Line[]; outs: Line[]; inTotal: number; outTotal: number } {
  const lines = new Map<string, Line>();
  const add = (c: Category, amount: number) => {
    const cur = lines.get(c.key) ?? { key: c.key, label: c.label, kind: c.kind, amount: 0, count: 0 };
    cur.amount += amount;
    cur.count++;
    lines.set(c.key, cur);
  };
  for (const e of journal) {
    const t = Date.parse(e.date);
    if (t < since || t >= until) continue;
    const c = categoryOf(e);
    if (c) add(c, e.amount);
  }
  for (const tx of txs) {
    const t = Date.parse(tx.date);
    if (t < since || t >= until) continue;
    const v = tx.qty * tx.unitPrice;
    const k = classOf(tx);
    const trading = k.tracked || k.tag === 'trading';
    if (!tx.isBuy) add(trading ? { key: 'trading', label: 'Trading' } : { key: 'loot', label: 'Loot & other sales' }, v);
    else if (k.tag === 'personal') add({ key: 'personal', label: 'Personal purchases', kind: 'Personal' }, -v);
    else add(trading ? { key: 'stock', label: 'Stock bought to resell', kind: 'Business' } : { key: 'otherBuys', label: 'Other purchases' }, -v);
  }
  const all = [...lines.values()];
  const ins = all.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount);
  const outs = all.filter((l) => l.amount < 0).map((l) => ({ ...l, amount: -l.amount })).sort((a, b) => b.amount - a.amount);
  return {
    ins, outs,
    inTotal: ins.reduce((t, l) => t + l.amount, 0),
    outTotal: outs.reduce((t, l) => t + l.amount, 0),
  };
}

export type BalancePoint = { t: number; balance: number; id: string };

/** The wallet balance after every journal entry in a window, oldest first. */
export function balanceSeries(journal: JournalEntry[], since: number): BalancePoint[] {
  return journal
    .filter((e) => e.balance != null && Date.parse(e.date) >= since)
    .map((e) => ({ t: Date.parse(e.date), balance: e.balance as number, id: e.id }))
    // Entries in the same second keep ESI's order, which the ascending id preserves.
    .sort((a, b) => a.t - b.t || Number(a.id) - Number(b.id));
}

/** The balance just before a moment, from the last entry at or before it. */
export function balanceAt(journal: JournalEntry[], t: number): number | null {
  let best: JournalEntry | null = null;
  for (const e of journal) {
    if (e.balance == null) continue;
    const et = Date.parse(e.date);
    if (et > t) continue;
    if (!best || et > Date.parse(best.date) || (et === Date.parse(best.date) && Number(e.id) > Number(best.id))) best = e;
  }
  return best?.balance ?? null;
}

export type FeeLeak = { sales: number; broker: number; relists: number; pi: number; clones: number; total: number };

/**
 * What fees and taxes took. A broker fee on an order that already had one is a price change, which is
 * the part of trading most people underestimate, so it is pulled out on its own.
 */
export function feeLeak(journal: JournalEntry[], since: number): FeeLeak {
  let sales = 0, broker = 0, relists = 0, pi = 0, clones = 0;
  const byOrder = new Map<number, JournalEntry[]>();
  for (const e of journal) {
    if (e.refType !== 'brokers_fee' || e.contextId == null) continue;
    const list = byOrder.get(e.contextId) ?? [];
    list.push(e);
    byOrder.set(e.contextId, list);
  }
  const firsts = new Set<string>();
  for (const list of byOrder.values()) {
    list.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || Number(a.id) - Number(b.id));
    firsts.add(list[0].id);
  }
  for (const e of journal) {
    if (Date.parse(e.date) < since || e.amount >= 0) continue;
    const a = -e.amount;
    if (e.refType === 'transaction_tax') sales += a;
    else if (e.refType === 'brokers_fee') {
      if (e.contextId != null && !firsts.has(e.id)) relists += a; else broker += a;
    } else if (e.refType.startsWith('planetary_') && e.refType.endsWith('_tax')) pi += a;
    else if (e.refType.startsWith('jump_clone')) clones += a;
  }
  return { sales, broker, relists, pi, clones, total: sales + broker + relists + pi + clones };
}

/** A trade no position counts gets a guess at what it was, which you can correct. */
export function autoTag(tx: Tx, everBought: Set<number>): UntrackedTag {
  // Something you sold without ever having bought it came from somewhere else: loot, drops, salvage.
  if (!tx.isBuy && !everBought.has(tx.typeId)) return 'loot';
  return 'other';
}

export const TAG_ORDER: UntrackedTag[] = ['loot', 'personal', 'trading', 'other'];
export const nextTag = (t: UntrackedTag): UntrackedTag => TAG_ORDER[(TAG_ORDER.indexOf(t) + 1) % TAG_ORDER.length];

/** How many days the wallet lasts at a daily burn. Infinite when nothing is being spent. */
export function runwayDays(wallet: number, dailyBurn: number): number {
  return dailyBurn > 0 ? wallet / dailyBurn : Infinity;
}

export type Unusual = { id: string; kind: 'donationIn' | 'donationOut' | 'oddHour'; entry: JournalEntry };

/**
 * A light safety net: entries worth a second look.
 *
 * - ISK given to you by someone you have never dealt with. Often a scam opener, sometimes a gift.
 * - Large ISK sent to another player. If that was not you, your account is not yours.
 * - A large contract payment at an hour you are never otherwise active.
 *
 * These are prompts, not verdicts, and each can be dismissed.
 */
export function unusual(journal: JournalEntry[], since: number, opts = { donationIn: 1e6, donationOut: 10e6, oddHour: 100e6 }): Unusual[] {
  const sorted = [...journal].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const seen = new Set<number>();
  const hours = new Array(24).fill(0);
  for (const e of sorted) hours[new Date(e.date).getUTCHours()]++;
  const total = sorted.length || 1;
  const out: Unusual[] = [];
  for (const e of sorted) {
    const t = Date.parse(e.date);
    const other = e.amount > 0 ? e.firstPartyId : e.secondPartyId;
    if (t >= since) {
      if (e.refType === 'player_donation' && e.amount >= opts.donationIn && other != null && !seen.has(other)) {
        out.push({ id: e.id, kind: 'donationIn', entry: e });
      } else if (e.refType === 'player_donation' && -e.amount >= opts.donationOut) {
        out.push({ id: e.id, kind: 'donationOut', entry: e });
      } else if (e.refType.startsWith('contract_') && Math.abs(e.amount) >= opts.oddHour && hours[new Date(e.date).getUTCHours()] / total < 0.02) {
        out.push({ id: e.id, kind: 'oddHour', entry: e });
      }
    }
    if (e.firstPartyId != null) seen.add(e.firstPartyId);
    if (e.secondPartyId != null) seen.add(e.secondPartyId);
  }
  return out.reverse();
}

/** Plain words for a journal type, for the balance chart's dots and anything else that names one. */
export function describeRef(refType: string): string {
  const c = categoryOf({ refType, amount: 1 }) ?? categoryOf({ refType, amount: -1 });
  const words = refType.replace(/_/g, ' ');
  if (refType === 'market_transaction') return 'Market trade';
  if (refType === 'market_escrow') return 'Buy order escrow';
  return c && c.key !== 'otherIn' && c.key !== 'otherOut' ? c.label : words.charAt(0).toUpperCase() + words.slice(1);
}

/** A CSV cell, quoted when it needs to be. */
export function csvCell(v: string | number | undefined | null): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
