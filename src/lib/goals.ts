/**
 * Goals, and how far along each one is.
 *
 * Every kind is measured from something the app reads rather than something you have to keep
 * telling it: ISK from the wallet, orders and net worth; items from your hangars, sell orders and
 * market transactions; profit from positions or the journal; skills from the character. The one
 * exception is PLEX held in the vault, which no ESI endpoint exposes: a PLEX "hold" goal starts from a
 * count you give it and then follows your market trades.
 *
 * Pure: the page gathers the live figures and passes them in.
 */

import { PLEX_TYPE } from './constants';
import type { Goal, GoalMeasure } from './types';

const DAY = 86400_000;

export type GoalTx = { typeId: number; date: string; isBuy: boolean; qty: number; source?: string };

/** What the page knows right now, for measuring any goal. */
export type GoalContext = {
  now: number;
  /** Current ISK for each measure; null when it can't be known yet (not synced, still pricing). */
  funds: Record<GoalMeasure, number | null>;
  /** ISK a day each measure has been growing by, from real history; null when there isn't enough. */
  growth: Record<GoalMeasure, number | null>;
  /** What one unit costs to buy now, from the live book. */
  price: (typeId: number) => number | null;
  /** Units owned in hangars plus those listed in sell orders; null without the assets permission. */
  held: (typeId: number) => number | null;
  txs: GoalTx[];
  /** Trading profit or net cash flow between two moments. */
  earned: (source: 'trading' | 'cashflow', from: number, to: number) => number;
  /** A skill's trained level, how far through the target it is, and days of training left. */
  skill: (skillId: number, level: number) => { level: number; frac: number | null; days: number | null } | null;
};

export type GoalProgress = {
  /** 0 to 1. */
  frac: number;
  done: boolean;
  unit: 'isk' | 'units' | 'level';
  have: number | null;
  target: number;
  /** Days to get there at the pace so far; 0 when there already, null when not moving or unknown. */
  etaDays: number | null;
  /** With a deadline: what has to happen per day from now to make it, in `unit`. */
  needPerDay: number | null;
  /** The pace so far, in `unit` per day. */
  nowPerDay: number | null;
  daysLeft: number | null;
  /** Afford goals: bought so far, still to buy, what that costs now, and whether the ISK covers it. */
  acquired?: number;
  remaining?: number;
  price?: number | null;
  costLeft?: number | null;
  funds?: number | null;
  affordable?: boolean;
  /** What stopped it being measured, when something did. */
  missing?: 'price' | 'funds' | 'assets' | 'skills' | null;
};

/** Units of an item bought on the market since a moment, less those sold. Never below zero. */
export function netBought(txs: GoalTx[], typeId: number, since: number): number {
  let n = 0;
  for (const t of txs) {
    if (t.typeId !== typeId || (t.source && t.source !== 'esi') || Date.parse(t.date) < since) continue;
    n += t.isBuy ? t.qty : -t.qty;
  }
  return Math.max(0, n);
}

/** Old goals were `{ kind: 'wallet' | 'nw', target }`. Read them as ISK goals; drop anything unreadable. */
export function normalizeGoal(raw: unknown): Goal | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const base = {
    id: String(g.id ?? Math.random().toString(36).slice(2)),
    label: String(g.label ?? 'Goal'),
    createdAt: typeof g.createdAt === 'string' ? g.createdAt : new Date(0).toISOString(),
    deadline: typeof g.deadline === 'string' ? g.deadline : undefined,
    doneAt: typeof g.doneAt === 'string' ? g.doneAt : undefined,
  };
  const pos = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (g.kind === 'wallet' || g.kind === 'nw') return pos(g.target) ? { ...base, kind: 'isk', measure: g.kind, target: g.target as number } : null;
  if (g.kind === 'isk' && pos(g.target)) return { ...base, kind: 'isk', measure: (['wallet', 'liquid', 'nw'].includes(g.measure as string) ? g.measure : 'wallet') as GoalMeasure, target: g.target as number };
  if (g.kind === 'afford' && pos(g.typeId) && pos(g.qty)) return { ...base, kind: 'afford', typeId: g.typeId as number, qty: g.qty as number, measure: (['wallet', 'liquid', 'nw'].includes(g.measure as string) ? g.measure : 'wallet') as GoalMeasure };
  if (g.kind === 'hold' && pos(g.typeId) && pos(g.qty)) return { ...base, kind: 'hold', typeId: g.typeId as number, qty: g.qty as number, startCount: pos(g.startCount) ? (g.startCount as number) : undefined };
  if (g.kind === 'earn' && pos(g.target)) return { ...base, kind: 'earn', source: g.source === 'cashflow' ? 'cashflow' : 'trading', target: g.target as number, from: typeof g.from === 'string' ? g.from : base.createdAt };
  if (g.kind === 'skill' && pos(g.skillId) && pos(g.level)) return { ...base, kind: 'skill', skillId: g.skillId as number, level: Math.min(5, Math.round(g.level as number)) };
  return null;
}

/** Days from now to a deadline; negative once it has passed. */
function daysTo(deadline: string | undefined, now: number): number | null {
  if (!deadline) return null;
  const t = Date.parse(deadline);
  return Number.isFinite(t) ? (t - now) / DAY : null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));

/** How far along a goal is, in its own unit, with its pace and, given a deadline, the pace it needs. */
export function goalProgress(g: Goal, ctx: GoalContext): GoalProgress {
  const daysLeft = daysTo(g.deadline, ctx.now);
  const since = Date.parse(g.createdAt);
  const elapsed = Math.max(1, (ctx.now - since) / DAY);
  // What has to happen per day to finish by the deadline, given how much is left.
  const need = (left: number) => (daysLeft == null ? null : left <= 0 ? 0 : daysLeft > 0 ? left / daysLeft : Infinity);
  const eta = (left: number, perDay: number | null) => (left <= 0 ? 0 : perDay != null && perDay > 0 ? left / perDay : null);

  switch (g.kind) {
    case 'isk': {
      const have = ctx.funds[g.measure];
      const growth = ctx.growth[g.measure];
      if (have == null) return { frac: 0, done: false, unit: 'isk', have: null, target: g.target, etaDays: null, needPerDay: null, nowPerDay: growth, daysLeft, missing: 'funds' };
      const left = g.target - have;
      return { frac: clamp01(have / g.target), done: left <= 0, unit: 'isk', have, target: g.target, etaDays: eta(left, growth), needPerDay: need(left), nowPerDay: growth, daysLeft };
    }
    case 'afford': {
      const acquired = Math.min(g.qty, netBought(ctx.txs, g.typeId, since));
      const remaining = g.qty - acquired;
      const price = ctx.price(g.typeId);
      const funds = ctx.funds[g.measure];
      const growth = ctx.growth[g.measure];
      const costLeft = price != null ? remaining * price : null;
      const affordable = remaining <= 0 || (costLeft != null && funds != null && funds >= costLeft);
      // Progress in units: what you've bought, plus what the ISK you hold would buy of the rest.
      const buyable = price != null && price > 0 && funds != null ? Math.min(remaining, Math.max(0, funds) / price) : 0;
      const shortfall = costLeft != null && funds != null ? costLeft - funds : null;
      return {
        frac: clamp01((acquired + buyable) / g.qty), done: remaining <= 0, unit: 'units', have: acquired + buyable, target: g.qty,
        etaDays: shortfall == null ? null : eta(shortfall, growth), needPerDay: shortfall == null ? null : need(shortfall), nowPerDay: growth, daysLeft,
        acquired, remaining, price, costLeft, funds, affordable,
        missing: price == null ? 'price' : funds == null ? 'funds' : null,
      };
    }
    case 'hold': {
      // PLEX sits in a vault no ESI endpoint shows, so it starts from your count and follows your trades.
      const bought = netBought(ctx.txs, g.typeId, since);
      const have = g.typeId === PLEX_TYPE ? (g.startCount ?? 0) + bought : ctx.held(g.typeId);
      const rate = bought / elapsed;
      if (have == null) return { frac: 0, done: false, unit: 'units', have: null, target: g.qty, etaDays: null, needPerDay: null, nowPerDay: rate, daysLeft, missing: 'assets' };
      const left = g.qty - have;
      return { frac: clamp01(have / g.qty), done: left <= 0, unit: 'units', have, target: g.qty, etaDays: eta(left, rate || null), needPerDay: need(left), nowPerDay: rate, daysLeft };
    }
    case 'earn': {
      const from = Date.parse(g.from);
      const until = g.deadline ? Math.min(ctx.now, Date.parse(g.deadline)) : ctx.now;
      const have = ctx.earned(g.source, from, until);
      const rate = have / Math.max(1, (until - from) / DAY);
      const left = g.target - have;
      return { frac: clamp01(have / g.target), done: left <= 0, unit: 'isk', have, target: g.target, etaDays: eta(left, rate > 0 ? rate : null), needPerDay: need(left), nowPerDay: rate, daysLeft };
    }
    case 'skill': {
      const s = ctx.skill(g.skillId, g.level);
      if (!s) return { frac: 0, done: false, unit: 'level', have: null, target: g.level, etaDays: null, needPerDay: null, nowPerDay: null, daysLeft, missing: 'skills' };
      const done = s.level >= g.level;
      return {
        frac: done ? 1 : clamp01(s.frac ?? s.level / g.level), done, unit: 'level', have: s.level, target: g.level,
        // Training runs whether or not you're online, so the ETA is the training time itself.
        etaDays: done ? 0 : s.days, needPerDay: null, nowPerDay: null, daysLeft,
      };
    }
  }
}

/** Whether a deadline is still makeable at the pace so far. Null when there's no deadline or no pace. */
export function onPace(p: GoalProgress): boolean | null {
  if (p.done) return true;
  if (p.daysLeft == null) return null;
  if (p.daysLeft <= 0) return false;
  if (p.etaDays != null) return p.etaDays <= p.daysLeft;
  return null;
}
