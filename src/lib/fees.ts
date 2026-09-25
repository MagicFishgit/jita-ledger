import { ALPHA_CAPS, type SkillKey } from './config';

export type Clone = 'alpha' | 'omega';
export type Skills = Record<SkillKey, number>;

export type Settings = Skills & {
  /** Skill levels above are what you've trained. Alpha caps are applied on top. */
  clone: Clone;
  faction: number; corp: number;
  taxBase: number;
  override: boolean; brokerPct: number; taxPct: number;
  target: number;
  /** Share of daily volume you expect to capture, used for rough ISK/day estimates. */
  share: number;
  /** How long you'll let stock sit ahead of one of your orders before it's worth relisting. */
  waitHours: number;
  /** Fill skills, standings and clone state from the logged-in character on sync. */
  fromCharacter: boolean;
  /** Omega skill plan used for the Alpha vs Omega comparison. */
  planAcc: number; planBr: number; planAbr: number;
  plexPerMonth: number;
  /** 0 means use the current PLEX market price. */
  plexPrice: number;
};

export const DEFAULT_SETTINGS: Settings = {
  acc: 0, br: 0, abr: 0, trade: 0, retail: 0, wholesale: 0, tycoon: 0,
  clone: 'alpha',
  faction: 0, corp: 0,
  taxBase: 7.5, override: false, brokerPct: 1.5, taxPct: 3.38,
  target: 5, share: 10, waitHours: 4, fromCharacter: true,
  planAcc: 5, planBr: 5, planAbr: 5,
  plexPerMonth: 500, plexPrice: 0,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, d: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
};
const lvl = (v: unknown) => clamp(Math.round(num(v, 0)), 0, 5);

export function sanitizeSettings(s: Partial<Settings> | null | undefined): Settings {
  const x = s ?? {};
  return {
    acc: lvl(x.acc), br: lvl(x.br), abr: lvl(x.abr),
    trade: lvl(x.trade), retail: lvl(x.retail), wholesale: lvl(x.wholesale), tycoon: lvl(x.tycoon),
    clone: x.clone === 'omega' ? 'omega' : 'alpha',
    faction: clamp(num(x.faction, 0), 0, 10),
    corp: clamp(num(x.corp, 0), 0, 10),
    taxBase: clamp(num(x.taxBase, DEFAULT_SETTINGS.taxBase), 0, 100),
    override: !!x.override,
    brokerPct: clamp(num(x.brokerPct, DEFAULT_SETTINGS.brokerPct), 0, 100),
    taxPct: clamp(num(x.taxPct, DEFAULT_SETTINGS.taxPct), 0, 100),
    target: clamp(num(x.target, DEFAULT_SETTINGS.target), 0, 1000),
    share: clamp(num(x.share, DEFAULT_SETTINGS.share), 0, 100),
    waitHours: clamp(num(x.waitHours, DEFAULT_SETTINGS.waitHours), 0, 168),
    fromCharacter: x.fromCharacter === undefined ? true : !!x.fromCharacter,
    planAcc: x.planAcc === undefined ? 5 : lvl(x.planAcc),
    planBr: x.planBr === undefined ? 5 : lvl(x.planBr),
    planAbr: x.planAbr === undefined ? 5 : lvl(x.planAbr),
    plexPerMonth: clamp(num(x.plexPerMonth, DEFAULT_SETTINGS.plexPerMonth), 1, 100000),
    plexPrice: clamp(num(x.plexPrice, 0), 0, 1e12),
  };
}

/** The levels that actually apply right now: trained levels, capped when you're Alpha. */
export function effectiveSkills(s: Settings): Skills {
  const keys = Object.keys(ALPHA_CAPS) as SkillKey[];
  const out = {} as Skills;
  for (const k of keys) out[k] = s.clone === 'alpha' ? Math.min(s[k], ALPHA_CAPS[k]) : s[k];
  return out;
}

export function orderSlots(sk: Skills): number {
  return 5 + 4 * sk.trade + 8 * sk.retail + 16 * sk.wholesale + 32 * sk.tycoon;
}

export type Rates = { f: number; t: number; d: number; k: number; be: number };

function ratesFrom(sk: Pick<Skills, 'acc' | 'br' | 'abr'>, s: Settings, useOverride: boolean): Rates {
  let f: number, t: number;
  if (useOverride && s.override) {
    f = s.brokerPct / 100;
    t = s.taxPct / 100;
  } else {
    f = Math.max(0.01, 0.03 - 0.003 * sk.br - 0.0003 * s.faction - 0.0002 * s.corp);
    t = (s.taxBase / 100) * (1 - 0.11 * sk.acc);
  }
  const d = 0.5 + 0.06 * sk.abr;
  const k = (1 - d) * f;
  const be = (1 + f) / (1 - f - t) - 1;
  return { f, t, d, k, be };
}

/** f = broker fee, t = sales tax, d = price-change discount, k = price-change fee (share of order value). */
export function rates(s: Settings): Rates {
  return ratesFrom(effectiveSkills(s), s, true);
}

/** Rates as Omega with the given levels (standings and base tax from your settings). */
export function omegaRates(s: Settings, sk: { acc: number; br: number; abr: number }): Rates {
  return ratesFrom(sk, s, false);
}

export type TradeInput = { buy: number; sell: number; qty: number; vol?: number; nBuy?: number; nSell?: number };

export type TradeResult =
  | { ok: false; r: Rates }
  | {
      ok: true; r: Rates; B: number; S: number; q: number; nB: number; nS: number;
      cost: number; rev: number; brokerBuy: number; brokerSell: number; tax: number; relist: number;
      fees: number; spread: number; net: number; spent: number; roi: number; spreadPct: number;
      beSell: number; targetSell: number; maxBuy: number; volShare: number;
    };

export function calcWith(tr: TradeInput, r: Rates, target: number): TradeResult {
  const B = tr.buy, S = tr.sell, q = tr.qty;
  if (!(B > 0) || !(S > 0) || !(q > 0)) return { ok: false, r };
  const nB = Math.max(0, Math.floor(tr.nBuy || 0)), nS = Math.max(0, Math.floor(tr.nSell || 0));
  const cost = B * q, rev = S * q;
  const brokerBuy = Math.max(100, r.f * cost);
  const brokerSell = Math.max(100, r.f * rev);
  const tax = r.t * rev;
  const relistBuy = nB * Math.max(100, r.k * cost);
  const relistSell = nS * Math.max(100, r.k * rev);
  const relist = relistBuy + relistSell;
  const fees = brokerBuy + brokerSell + tax + relist;
  const spread = rev - cost;
  const net = spread - fees;
  const spent = cost + brokerBuy + relistBuy;
  const m = target / 100;
  const sellDen = 1 - r.f - r.t - nS * r.k;
  const buyFactor = 1 + r.f + nB * r.k;
  return {
    ok: true, r, B, S, q, nB, nS, cost, rev, brokerBuy, brokerSell, tax, relist, fees, spread, net, spent,
    roi: net / spent,
    spreadPct: (S - B) / B,
    beSell: sellDen > 0 ? (B * buyFactor) / sellDen : NaN,
    targetSell: sellDen > 0 ? (B * buyFactor * (1 + m)) / sellDen : NaN,
    maxBuy: sellDen > 0 ? (S * sellDen) / (buyFactor * (1 + m)) : NaN,
    volShare: tr.vol && tr.vol > 0 ? q / tr.vol : NaN,
  };
}

export function calc(tr: TradeInput, s: Settings): TradeResult {
  return calcWith(tr, rates(s), s.target);
}

export type RateStamp = { at: string; f: number; t: number };

/** Broker fee and sales tax in force at a moment, from the history kept as your skills and clone state change. */
export function rateAt(history: RateStamp[] | undefined, t: number, fallback: Rates): { f: number; t: number } {
  if (!history?.length) return fallback;
  let pick = history[0];
  for (const h of history) { if (Date.parse(h.at) <= t) pick = h; else break; }
  return { f: pick.f, t: pick.t };
}
