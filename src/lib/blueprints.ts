/**
 * Your blueprints, priced against The Forge's blueprint contracts (bpContracts.ts). The user collects blueprints, mostly
 * in containers, and ends up deleting or forgetting them, because in game "it is really hard to figure out how to price
 * them" and there's "too much data to sift through". This reads what you hold (ESI's /characters/{id}/blueprints) and
 * sets each kind (item, copy or original, ME, TE, runs) against what others ask for the same and what vanished before
 * expiry in the last three days, the nearest thing to what sold. Research on the live data (29 September 2026): asks for
 * the exact same kind cluster tightly (the 75th percentile a median 1.09× the 25th), and a copy's price isn't linear in
 * its runs: 10 runs asked ~6.1× one run, 5 runs ~3.65×, so price ∝ runs^0.79. Pure.
 */
import { JITA_44 } from './constants';
import { tickDown } from './tick';
import type { BpContract } from './bpContracts';

/** ESI's blueprint row. `quantity` is −1 for an original, −2 for a copy, or how many unused originals are stacked. */
export type RawBlueprint = {
  item_id: number; type_id: number; location_id: number; location_flag: string;
  quantity: number; runs: number; material_efficiency: number; time_efficiency: number;
};

export type OwnedBlueprint = {
  itemId: number; typeId: number; locationId: number; flag: string;
  copy: boolean;
  /** How many: a stack of unused originals counts each. */
  count: number;
  /** A stack of originals never used or researched: the only kind that can go on the market. */
  unused: boolean;
  me: number; te: number;
  /** Runs left on a copy; null for an original. */
  runs: number | null;
};

export function readBlueprints(raw: RawBlueprint[]): OwnedBlueprint[] {
  return raw.map((b) => {
    const copy = b.quantity === -2 || b.runs > 0;
    return {
      itemId: b.item_id, typeId: b.type_id, locationId: b.location_id, flag: b.location_flag, copy,
      count: b.quantity > 0 ? b.quantity : 1, unused: !copy && b.quantity > 0,
      me: b.material_efficiency, te: b.time_efficiency, runs: copy ? b.runs : null,
    };
  });
}

/** What makes two blueprints the same thing to a buyer. */
export type BpKind = { typeId: number; copy: boolean; me: number; te: number; runs: number | null };
export const kindKey = (k: BpKind) => `${k.typeId}|${k.copy ? 1 : 0}|${k.me}|${k.te}|${k.runs ?? ''}`;

/** One contract of a single kind of blueprint, priced per blueprint. Bundles of different kinds aren't comparable. */
export type Comparable = BpKind & { contractId: number; each: number; count: number; stationId: number | null; title: string; issued: string };

export function comparables(contracts: BpContract[]): Comparable[] {
  const out: Comparable[] = [];
  for (const c of contracts) {
    const keys = new Set(c.items.map(kindKey));
    if (keys.size !== 1) continue;
    const i = c.items[0];
    const count = c.items.reduce((n, x) => n + x.qty, 0);
    out.push({ typeId: i.typeId, copy: i.copy, me: i.me, te: i.te, runs: i.runs, contractId: c.id, each: c.price / count, count, stationId: c.stationId, title: c.title, issued: c.issued });
  }
  return out;
}

/** A copy's price against its runs: 10 runs ask ~6.1× one run on the live data, 5 runs ~3.65×. */
export const RUNS_EXP = 0.79;
/** Comparables wanted before a looser match is used. */
export const COMPS_MIN = 3;

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
/** Tidy to three significant figures, rounding down: a price to type into a contract. */
export const tidy = (x: number) => { if (!(x > 0)) return 0; const p = 10 ** (Math.floor(Math.log10(x)) - 2); return Math.floor(x / p) * p; };

export type ScamFlag = 'saysOriginal' | 'saysResearch' | 'notJita';
export const SCAM_SAID: Record<ScamFlag, string> = {
  saysOriginal: 'The title says original (BPO) but it’s a copy',
  saysResearch: 'The title claims an ME/TE the blueprint doesn’t have',
  notJita: 'It isn’t in Jita 4-4',
};

/**
 * What a contract's title claims that its items don't bear out: never trust the title (EVE University's scams page;
 * live examples found on 29 September 2026 were copies titled "BPO" and "ME 10 / TE 20" on an ME 9).
 */
export function scamFlags(c: Pick<Comparable, 'copy' | 'me' | 'te' | 'title' | 'stationId'>): ScamFlag[] {
  const out: ScamFlag[] = [];
  const t = c.title ?? '';
  if (c.copy && /\bBPO\b|\boriginal\b/i.test(t)) out.push('saysOriginal');
  const me = /\bME\s*:?\s*(\d{1,2})\b/i.exec(t)?.[1], te = /\bTE\s*:?\s*(\d{1,2})\b/i.exec(t)?.[1];
  const pair = /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/.exec(t);
  if ((me != null && Number(me) !== c.me) || (te != null && Number(te) !== c.te)
    || (pair && Number(pair[1]) <= 10 && Number(pair[2]) <= 20 && (Number(pair[1]) !== c.me || Number(pair[2]) !== c.te) && /research|me|te|bp/i.test(t))) out.push('saysResearch');
  if (c.stationId != null && c.stationId !== JITA_44) out.push('notJita');
  return out;
}

export type BpQuote = {
  /** How close the comparables are: the same kind, the same but other runs (scaled), or other research too. */
  basis: 'exact' | 'runs' | 'research' | 'none';
  /** What others ask per blueprint, scaled to your runs, and how many. */
  asks: number;
  low: number | null;
  median: number | null;
  /** What vanished before expiry in the last three days, per blueprint, scaled to your runs. */
  sold: number;
  soldMedian: number | null;
  /** The price to list at: what sold when enough did (never over the median ask), else the cheapest quarter of asks. */
  suggest: number | null;
  /** The cheapest comparable, to open in game, and anything its title claims that isn't so. */
  cheapest: (Comparable & { scaled: number; flags: ScamFlag[] }) | null;
};

/**
 * An unused original can go on the market, and nobody pays more for one on a contract than the market's cheapest
 * listing: the first check priced the user's three unused Raven Blueprints at 3.2 B each against researched originals,
 * when NPCs sell them at ~1.13 B. So it's priced one step under the cheapest Jita listing, never over what exact
 * contract matches go for; with no listing, the contracts decide.
 */
export function unusedPrice(quote: BpQuote | null, ask: number | null): { price: number | null; where: 'market' | 'contract' | null } {
  if (ask != null && ask > 0) {
    const market = tickDown(ask);
    const exact = quote?.basis === 'exact' && quote.suggest != null ? quote.suggest : null;
    return exact != null && exact < market ? { price: exact, where: 'contract' } : { price: market, where: 'market' };
  }
  return quote?.suggest != null ? { price: quote.suggest, where: 'contract' } : { price: null, where: null };
}

function tiered(k: BpKind, comps: Comparable[]): { basis: BpQuote['basis']; picks: (Comparable & { scaled: number })[] } {
  const same = comps.filter((c) => c.typeId === k.typeId && c.copy === k.copy);
  const scale = (c: Comparable) => (k.copy && k.runs != null && c.runs != null && c.runs > 0 ? c.each * (k.runs / c.runs) ** RUNS_EXP : c.each);
  const exact = same.filter((c) => c.me === k.me && c.te === k.te && c.runs === k.runs);
  if (exact.length >= COMPS_MIN) return { basis: 'exact', picks: exact.map((c) => ({ ...c, scaled: c.each })) };
  const runs = same.filter((c) => c.me === k.me && c.te === k.te);
  if (k.copy && runs.length >= COMPS_MIN) return { basis: runs.length === exact.length ? 'exact' : 'runs', picks: runs.map((c) => ({ ...c, scaled: scale(c) })) };
  if (same.length) return { basis: same.length === exact.length ? 'exact' : runs.length === same.length ? 'runs' : 'research', picks: same.map((c) => ({ ...c, scaled: scale(c) })) };
  return { basis: 'none', picks: [] };
}

export function quoteBlueprint(k: BpKind, current: Comparable[], vanished: Comparable[]): BpQuote {
  const ask = tiered(k, current), gone = tiered(k, vanished);
  const asks = ask.picks.map((c) => c.scaled), sold = gone.picks.map((c) => c.scaled);
  const low = quantile(asks, 0.25), median = quantile(asks, 0.5), soldMedian = quantile(sold, 0.5);
  const raw = sold.length >= 2 && soldMedian != null ? (median != null ? Math.min(soldMedian, median) : soldMedian) : low;
  const c = ask.picks.length ? ask.picks.reduce((a, b) => (b.scaled < a.scaled ? b : a)) : null;
  return {
    basis: ask.picks.length ? ask.basis : gone.picks.length ? gone.basis : 'none',
    asks: asks.length, low, median, sold: sold.length, soldMedian,
    suggest: raw != null ? tidy(raw) : null,
    cheapest: c ? { ...c, flags: scamFlags(c) } : null,
  };
}
