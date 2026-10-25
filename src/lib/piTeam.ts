import { maximise, type LpRow } from './lp';
import { fitOf, maxFactories } from './piFit';
import type { KeptPlan } from './planetsDoc';
import {
  amountSaid, atCcu, blocked, cap as lead, charWhy, levelFor, fitFor, fitNote, fitted, goodName, heldInput, keptNotes, keptPlanOf, keptSold, keptWhy, KEPT_NOT_HERE,
  low, mergeRows, NO_PI, NO_PI_HERE, onlyWhy, plansFor, RAN_OUT, rateNotes, seller, staysNotes, taxRows, tierRank, TIERS_DOWN, treeOf, unitNet, unusedRole,
  unvaluedWhy, upkeepOf, valuedOutput, withKept,
  type Output, type Plan, type PlanChar, type PlanInput, type PlanPlanet, type Role, type Seller, type Setup, type Steps, type TaxRow, type Tree,
} from './piPlan';

/**
 * A factory character (docs/notes/planets-team.md): one character's factory planets fed by every character doing planetary industry.
 * This first part is the search alone, on numbers: which colonies each group of characters runs and which planets the factory character
 * turns into factory planets, so the most of the good is made a day, then the fewest factory planets, then the fewest colonies, then the
 * most ISK. Pure: no config, store, React or DOM; no enums or parameter properties (the Worker's type stripping).
 */

/**
 * The recipe as the search sees it: `goods` are the P1s the good takes (straight in, or through its P2s), then the P2s it takes, by type
 * ID; `p1` how many of them are P1. `xDay`: the good a day one factory makes. `alpha`: by P1, what one unit of the good takes of it straight
 * (a P2 good's own inputs). `p2`: each P2 it takes, at `g` in `goods`, `beta` of it a unit of the good, `day` a day one factory makes, and
 * `per` by P1 what one unit of it takes.
 */
export type TeamRecipe = {
  goods: number[]; p1: number; xDay: number; alpha: number[];
  p2: { g: number; beta: number; day: number; per: number[] }[];
};
/** One way a planet can feed (a single-planet plan): its planet's place, what it ships a day of each of the recipe's goods, and its ISK proxy. */
export type TeamOpt = { planet: number; v: Float64Array; worth: number };
/**
 * Characters alike in level and planets, searched as one: `chars` of them, each holding one colony a planet and `cap` colonies in all,
 * so at most `chars` colonies a planet and `chars × cap` in all. The first group is the factory character's alone: its factory planets
 * (`TeamProblem.sites`) take a planet and a colony each.
 */
export type TeamGroup = { chars: number; cap: number; opts: TeamOpt[] };
/** A planet the factory character can make a factory planet: its place, and the Advanced factories it holds at that character's level. */
export type TeamSite = { planet: number; cap: number };
/** `rHi`: at most this much of the good a day (the fill count's question: how few feeders fill one factory planet). */
export type TeamProblem = { rec: TeamRecipe; groups: TeamGroup[]; sites: TeamSite[]; planets: number; rHi?: number };
/** An arrangement: how many colonies of each group run each of its plans, and which sites are factory planets. */
export type TeamSol = { cnt: Int32Array[]; on: Uint8Array };
/** What an arrangement is worth, in the order it's judged: the good a day, the factory planets, the colonies, the ISK proxy. */
export type TeamKey = { R: number; F: number; colonies: number; worth: number };

const EPS = 1e-9;
const MIN_RATE = 1e-9;
/** A count of factories, rounded up past a hair's rounding (as piPlan's `factoriesFor`). */
const ceilE = (x: number) => Math.max(0, Math.ceil(x - EPS));
/**
 * The weights that put the judging order into one figure, for the linear programme's objective and every comparison of arrangements:
 * each factory planet costs `W_SITE` of the good a day, so a hundredth of a unit (the ranking's resolution) outweighs every factory planet
 * the factory character could take (six at most, 0.006). The colonies' and the ISK's weights are each problem's own (`weightsOf`), so the
 * order holds for a team of any size: every colony the team could run together weighs under half a factory planet, and the team's whole
 * ISK under half a colony. A fixed ISK weight didn't (the review of 25 October 2026): at a trillionth an ISK, 30 colonies of about a
 * million ISK a day each came to 3e-5, three colonies' weight, so an arrangement with a colony more and more ISK could come first.
 */
export const W_SITE = 1e-3, W_COLONY = 1e-5;
export type TeamWeights = { site: number; colony: number; isk: number };
const weightsMemo = new WeakMap<TeamProblem, TeamWeights>();
/**
 * A problem's weights: `W_COLONY` a colony while the team's colonies at most (each group's cap, every group full) weigh under half a
 * factory planet, less past that; and an ISK weight that puts the most ISK the team could make (each group's cap at its richest plan)
 * under half a colony.
 */
export function weightsOf(p: TeamProblem): TeamWeights {
  const had = weightsMemo.get(p);
  if (had) return had;
  const room = p.groups.map((g, w) => (w === 0 ? g.cap : g.chars * g.cap));
  const most = room.reduce((a, b) => a + b, 0);
  const richest = p.groups.reduce((t, g, w) => t + room[w] * g.opts.reduce((m, o) => Math.max(m, o.worth), 0), 0);
  const colony = Math.min(W_COLONY, W_SITE / (2 * Math.max(1, most)));
  const out = { site: W_SITE, colony, isk: colony / (2 * Math.max(1, richest)) };
  weightsMemo.set(p, out);
  return out;
}
export const weighted = (k: TeamKey, w: TeamWeights) => k.R - w.site * k.F - w.colony * k.colonies + w.isk * k.worth;
/** How much two weighted figures may differ and still be one: under any ISK difference the weights can tell, over a double's noise on the good a day. */
const SAME_W = 1e-11;

/** The most of the good a day this P1 allows, from what's shipped (`S`): where its demand, piecewise linear and rising, meets its supply. */
function limitK(rec: TeamRecipe, k: number, S: Float64Array): number {
  const have = S[k];
  let lo = 0;
  for (;;) {
    let slope = rec.alpha[k], at = rec.alpha[k] * lo, hi = Infinity;
    for (const t of rec.p2) {
      const per = t.per[k];
      if (!(per > 0)) continue;
      const out = S[t.g] / t.beta;
      if (out <= lo) { slope += per * t.beta; at += per * (t.beta * lo - S[t.g]); } else if (out < hi) hi = out;
    }
    if (slope > 0) {
      const R = lo + (have - at) / slope;
      if (R <= hi) return Math.max(lo, R);
    } else if (hi === Infinity) return Infinity;
    lo = hi;
  }
}
/** What the shipments allow a day, before any factory holds it. */
export function supplyRate(rec: TeamRecipe, S: Float64Array): number {
  let R = Infinity;
  for (let k = 0; k < rec.p1; k++) R = Math.min(R, limitK(rec, k, S));
  return R;
}
/** The factories `R` a day takes: the good's own, and each P2's for what isn't shipped in. */
export function factoriesAt(rec: TeamRecipe, S: Float64Array, R: number): { x: number; p2: number[] } {
  return { x: ceilE(R / rec.xDay), p2: rec.p2.map((t) => ceilE(Math.max(0, t.beta * R - S[t.g]) / t.day)) };
}
const needAt = (rec: TeamRecipe, S: Float64Array, R: number) => {
  let n = ceilE(R / rec.xDay);
  for (const t of rec.p2) n += ceilE(Math.max(0, t.beta * R - S[t.g]) / t.day);
  return n;
};
/**
 * The most of the good a day `A` factories make from these shipments, every factory whole: what the shipments allow, and no more than
 * the factories would make running in part (`smoothRate`), lowered to the last point at which the factories it takes fit (each count only
 * rises with the amount, so the steps down are exact, never searched, and from the smooth rate there are at most as many as kinds).
 */
export function teamRate(rec: TeamRecipe, A: number, S: Float64Array, rHi = Infinity): number {
  let R = Math.min(rHi, supplyRate(rec, S), smoothRate(rec, A, S));
  if (!(R > MIN_RATE) || !Number.isFinite(R)) return 0;
  for (let guard = 0; guard < 10_000; guard++) {
    if (needAt(rec, S, R) <= A) return R;
    // The next point down where a count falls by one: the good's own factories, or a P2's.
    let next = 0;
    const mx = ceilE(R / rec.xDay);
    if (mx >= 1) next = Math.max(next, (mx - 1) * rec.xDay);
    for (const t of rec.p2) {
      const m = ceilE(Math.max(0, t.beta * R - S[t.g]) / t.day);
      if (m >= 1) next = Math.max(next, (S[t.g] + (m - 1) * t.day) / t.beta);
    }
    if (!(next > MIN_RATE)) return 0;
    R = Math.min(next, R * (1 - 1e-12));
  }
  return 0;
}

// ---- An arrangement being searched, kept in step with every change ----

/** A search's allowance: work done is counted in move evaluations, a linear programme counting `LP_COST`; `cut` once it ran out too soon. */
export type TeamBudget = { left: number; cut: boolean };
/** What one linear programme costs the budget, in move evaluations (measured: one solve takes about as long as this many). */
export const LP_COST = 400;
/** Move evaluations between yields: about half a millisecond (25 October 2026, this machine). */
const EVAL_CHUNK = 300;

type State = {
  p: TeamProblem;
  cnt: Int32Array[]; on: Uint8Array;
  /** Per group, its colonies on each planet; per group, in all; per planet, the factory planets there. */
  pp: Int32Array[]; tot: Int32Array; site: Uint8Array;
  S: Float64Array; A: number; F: number; colonies: number; worth: number;
};
function stateOf(p: TeamProblem, sol?: TeamSol): State {
  const st: State = {
    p, cnt: p.groups.map((g) => new Int32Array(g.opts.length)), on: new Uint8Array(p.sites.length),
    pp: p.groups.map(() => new Int32Array(p.planets)), tot: new Int32Array(p.groups.length), site: new Uint8Array(p.planets),
    S: new Float64Array(p.rec.goods.length), A: 0, F: 0, colonies: 0, worth: 0,
  };
  if (sol) {
    sol.cnt.forEach((c, w) => c.forEach((n, q) => { for (let i = 0; i < n; i++) colony(st, w, q, 1); }));
    sol.on.forEach((v, s) => { if (v) site(st, s, 1); });
  }
  return st;
}
function colony(st: State, w: number, q: number, d: 1 | -1) {
  const o = st.p.groups[w].opts[q];
  st.cnt[w][q] += d; st.pp[w][o.planet] += d; st.tot[w] += d; st.colonies += d; st.worth += d * o.worth;
  for (let g = 0; g < st.S.length; g++) st.S[g] += d * o.v[g];
  if (d < 0) for (let g = 0; g < st.S.length; g++) if (Math.abs(st.S[g]) < 1e-9) st.S[g] = 0;
}
function site(st: State, s: number, d: 1 | -1) {
  const x = st.p.sites[s];
  st.on[s] += d; st.site[x.planet] += d; st.F += d; st.A += d * x.cap;
}
/** Whether one more colony of this plan fits its group: a colony a planet a character (the factory character's beside its factory planets), and its cap. */
function canColony(st: State, w: number, q: number): boolean {
  const g = st.p.groups[w], at = g.opts[q].planet;
  if (w === 0) return st.pp[0][at] + st.site[at] < 1 && st.tot[0] + st.F < g.cap;
  return st.pp[w][at] < g.chars && st.tot[w] < g.chars * g.cap;
}
function canSite(st: State, s: number): boolean {
  const at = st.p.sites[s].planet;
  return !st.on[s] && st.pp[0][at] + st.site[at] < 1 && st.tot[0] + st.F < st.p.groups[0].cap;
}
export const solOf = (st: { cnt: Int32Array[]; on: Uint8Array }): TeamSol => ({ cnt: st.cnt.map((c) => c.slice()), on: st.on.slice() });
const keyNow = (st: State): TeamKey => ({ R: teamRate(st.p.rec, st.A, st.S, st.p.rHi), F: st.F, colonies: st.colonies, worth: st.worth });
/** An arrangement's key, worked out on its own (`teamRate` on its shipments and factory planets). */
export function keyOfSol(p: TeamProblem, sol: TeamSol): TeamKey { return keyNow(stateOf(p, sol)); }

/** The most of the good a day `A` factories would make if a factory could run part of one: smooth where `teamRate` steps. */
function smoothRate(rec: TeamRecipe, A: number, S: Float64Array): number {
  let lo = 0;
  for (;;) {
    let slope = 1 / rec.xDay, at = lo / rec.xDay, hi = Infinity;
    for (const t of rec.p2) {
      const out = S[t.g] / t.beta;
      if (out <= lo) { slope += t.beta / t.day; at += (t.beta * lo - S[t.g]) / t.day; } else if (out < hi) hi = out;
    }
    const R = lo + (A - at) / slope;
    if (R <= hi) return Math.max(lo, R);
    lo = hi;
  }
}

/**
 * The local search's order, as figures to compare left to right: the good a day; while `channels`, what the shipments and the factory
 * planets would allow with factories run in part (smooth where the good a day steps a factory at a time, so a move that frees part of a
 * factory counts), then what each P1 alone would allow, lowest first (so a move lifting one of two equally short P1s counts, as the next
 * can lift the other: the research's `polish`); then the fewest factory planets, the fewest colonies, the most ISK.
 */
function scoreOf(st: State, channels: boolean): number[] {
  const { rec, rHi } = st.p;
  const R = teamRate(rec, st.A, st.S, rHi);
  const out = [R];
  if (channels) {
    out.push(Math.min(rHi ?? Infinity, supplyRate(rec, st.S), smoothRate(rec, st.A, st.S)));
    const ls: number[] = [];
    for (let k = 0; k < rec.p1; k++) ls.push(Math.min(rHi ?? Infinity, limitK(rec, k, st.S)));
    ls.sort((a, b) => a - b);
    for (const l of ls) out.push(Number.isFinite(l) ? l : 1e12);
  }
  out.push(-st.F, -st.colonies, st.worth);
  return out;
}
const ahead = (a: number[], b: number[] | null): boolean => {
  if (!b) return true;
  for (let i = 0; i < a.length; i++) {
    const tol = i === a.length - 1 ? 1e-3 : 1e-7;
    if (a[i] > b[i] + tol) return true;
    if (a[i] < b[i] - tol) return false;
  }
  return false;
};

type Item = { w: number; q: number } | { s: number };
const isSite = (x: Item): x is { s: number } => 's' in x;
const itemsOf = (p: TeamProblem): Item[] => [...p.groups.flatMap((g, w) => g.opts.map((_, q) => ({ w, q }))), ...p.sites.map((_, s) => ({ s }))];
const can = (st: State, x: Item) => (isSite(x) ? canSite(st, x.s) : canColony(st, x.w, x.q));
const apply = (st: State, x: Item, d: 1 | -1) => (isSite(x) ? site(st, x.s, d) : colony(st, x.w, x.q, d));
const used = (st: State, x: Item) => (isSite(x) ? st.on[x.s] > 0 : st.cnt[x.w][x.q] > 0);

/**
 * Steepest ascent from an arrangement: each round tries adding one colony or factory planet, dropping one, and every swap of one for
 * another (in any group, a factory planet for a colony of the factory character's), and takes the one that gains most, until none gains.
 * Without `channels` (the trim, once the good a day is as high as it goes) it also tries two dropped for one added (or none), which is
 * what saves a colony when two half-used ones can be one. It can only improve the arrangement; it proves nothing. Yields every
 * `EVAL_CHUNK` evaluations and spends one of the budget each.
 */
function* polish(st: State, channels: boolean, budget: TeamBudget, items: Item[]): Generator<void, number, void> {
  let cur = scoreOf(st, channels), moves = 0, since = 0;
  type Move = { k: number[]; add: Item | null; drops: Item[] };
  for (;;) {
    let best: Move | null = null;
    const consider = (add: Item | null, drops: Item[]) => {
      const k = scoreOf(st, channels);
      if (ahead(k, cur) && (!best || ahead(k, best.k))) best = { k, add, drops };
    };
    // Every add after the drops given, then the drops alone; false when the budget ran out.
    function* adds(drops: Item[]): Generator<void, boolean, void> {
      consider(null, drops);
      for (const a of items) {
        if (budget.left <= 0) { budget.cut = true; return false; }
        if (drops.includes(a) || !can(st, a)) continue;
        apply(st, a, 1); consider(a, drops); apply(st, a, -1);
        budget.left--;
        if (++since >= EVAL_CHUNK) { since = 0; yield; }
      }
      return true;
    }
    const usedNow = items.filter((x) => used(st, x));
    let ok = yield* adds([]);
    for (let i = 0; ok && i < usedNow.length; i++) {
      const d = usedNow[i];
      apply(st, d, -1);
      ok = yield* adds([d]);
      for (let j = i; ok && !channels && j < usedNow.length; j++) {
        const e = usedNow[j];
        if (!used(st, e)) continue;
        apply(st, e, -1);
        ok = yield* adds([d, e]);
        apply(st, e, 1);
      }
      apply(st, d, 1);
    }
    if (!ok) return moves;
    if (!best) return moves;
    const b: Move = best;
    for (const d of b.drops) apply(st, d, -1);
    if (b.add) apply(st, b.add, 1);
    cur = b.k; moves++;
  }
}

// ---- The linear programme and its branch and bound ----

export type Lp = { c: number[]; hi: number[]; rows: LpRow[]; iR: number; iY: number[]; iX: number[][]; xs: number[]; ns: number[]; fixed: Uint8Array | null };
/**
 * The search as an integer programme: maximise the good a day less a factory planet's weight and a colony's, plus the colonies' ISK at its
 * weight (`weightsOf`). Integer: the colonies on each plan in each group, the factories, and (unless `fixed` names them) the factory planets;
 * continuous: the good a day and each P2 made. Rows: the good no more than its factories make; each P2 made no more than its factories; each
 * P2 the good takes no more than made and shipped in; each P1 no more than shipped; the factories no more than the factory planets hold; a
 * colony a planet a character (the factory character's beside its factory planets) and each group's cap; `maxSites`, at most that many
 * factory planets. Every row holds at zero (lp.ts' rule).
 *
 * With the factory planets `fixed`, every integer variable sits in its rows with a negative coefficient or in a row of positive ones only,
 * so a branch x ≥ k is a substitution or plainly infeasible: the branch and bound runs on that programme alone. With them free (the bound
 * and the starts) a factory count sits beside the factory planets' negative capacity, so it is never branched on there.
 */
export function lpOf(p: TeamProblem, o: { maxSites?: number; fixed?: Uint8Array } = {}): Lp {
  const { rec } = p;
  const fixed = o.fixed ?? null;
  const hi: number[] = [], c: number[] = [];
  const v = (h: number, cost: number) => { hi.push(h); c.push(cost); return hi.length - 1; };
  const onAt = new Uint8Array(p.planets);
  let A = 0, F = 0;
  if (fixed) p.sites.forEach((x, s) => { if (fixed[s]) { onAt[x.planet] = 1; A += x.cap; F++; } });
  const iR = v(p.rHi ?? Infinity, 1);
  const iMade = rec.p2.map(() => v(Infinity, 0));
  const iN = rec.p2.map(() => v(Infinity, 0));
  const iNX = v(Infinity, 0);
  const wt = weightsOf(p);
  const iY = fixed ? [] : p.sites.map(() => v(1, -wt.site));
  const iX = p.groups.map((g, w) => g.opts.map((x) => v(w === 0 ? (onAt[x.planet] ? 0 : 1) : g.chars, -wt.colony + wt.isk * x.worth)));
  const n = hi.length;
  const rows: LpRow[] = [];
  const row = (pairs: [number, number][], b: number) => { const a = new Array<number>(n).fill(0); for (const [i, x] of pairs) a[i] += x; rows.push({ a, b }); };
  const allX = p.groups.flatMap((g, w) => g.opts.map((x, q) => ({ x, i: iX[w][q] })));
  row([[iR, 1], [iNX, -rec.xDay]], 0);
  rec.p2.forEach((t, j) => {
    row([[iMade[j], 1], [iN[j], -t.day]], 0);
    row([[iR, t.beta], [iMade[j], -1], ...allX.filter(({ x }) => x.v[t.g] > 0).map(({ x, i }): [number, number] => [i, -x.v[t.g]])], 0);
  });
  for (let k = 0; k < rec.p1; k++) {
    row([[iR, rec.alpha[k]], ...rec.p2.map((t, j): [number, number] => [iMade[j], t.per[k]]), ...allX.filter(({ x }) => x.v[k] > 0).map(({ x, i }): [number, number] => [i, -x.v[k]])], 0);
  }
  row([[iNX, 1], ...iN.map((i): [number, number] => [i, 1]), ...(fixed ? [] : p.sites.map((x, s): [number, number] => [iY[s], -x.cap]))], fixed ? A : 0);
  for (let at = 0; at < p.planets; at++) {
    const m: [number, number][] = [...p.groups[0].opts.map((x, q): [number, number] => [iX[0][q], x.planet === at ? 1 : 0]), ...(fixed ? [] : p.sites.map((x, s): [number, number] => [iY[s], x.planet === at ? 1 : 0]))].filter(([, x]) => x);
    if (m.length > 1) row(m, 1);
  }
  row([...iX[0].map((i): [number, number] => [i, 1]), ...iY.map((i): [number, number] => [i, 1])], Math.max(0, p.groups[0].cap - F));
  if (o.maxSites != null && !fixed) row(iY.map((i): [number, number] => [i, 1]), o.maxSites);
  p.groups.forEach((g, w) => {
    if (w === 0) return;
    for (let at = 0; at < p.planets; at++) {
      const m = g.opts.map((x, q): [number, number] => [iX[w][q], x.planet === at ? 1 : 0]).filter(([, x]) => x);
      if (m.length) row(m, g.chars);
    }
    row(iX[w].map((i): [number, number] => [i, 1]), g.chars * g.cap);
  });
  return { c, hi, rows, iR, iY, iX, xs: iX.flat(), ns: [...iN, iNX], fixed };
}
/** A branch: its variables' bounds, and the bounds its parent's programme put on it (the weighted figure, and the good a day). */
export type Node = { lo: number[]; hi: number[]; bound: number; boundR: number };
const rootOf = (lp: Lp): Node => ({ lo: new Array<number>(lp.hi.length).fill(0), hi: lp.hi.slice(), bound: Infinity, boundR: Infinity });
export function solveAt(lp: Lp, nd: Node): { x: number[]; value: number } | null {
  const rows: LpRow[] = [];
  for (const r of lp.rows) {
    let b = r.b;
    for (let i = 0; i < nd.lo.length; i++) if (nd.lo[i]) b -= r.a[i] * nd.lo[i];
    // With the factory planets fixed, only a row of positive coefficients can go under zero here: infeasible.
    if (b < -1e-9) return null;
    rows.push({ a: r.a, b: Math.max(0, b) });
  }
  const res = maximise({ c: lp.c, hi: nd.hi.map((h, i) => h - nd.lo[i]), rows });
  if (res.status !== 'optimal') return null;
  const x = res.x.map((v, i) => v + nd.lo[i]);
  return { x, value: lp.c.reduce((s, ci, i) => s + ci * x[i], 0) };
}
/**
 * The linear programme's bound on the good a day, its factory planets free: `searchTeam`'s first step alone (its `boundR`), or null when
 * nothing can be made (the search then finds nothing either).
 */
export function rootBound(p: TeamProblem): number | null {
  const lp = lpOf(p);
  const first = solveAt(lp, rootOf(lp));
  return first && first.x[lp.iR] > MIN_RATE ? first.x[lp.iR] : null;
}
const solFrom = (p: TeamProblem, lp: Lp, x: number[], round: (v: number) => number): TeamSol => ({
  cnt: p.groups.map((g, w) => Int32Array.from(g.opts, (_, q) => round(x[lp.iX[w][q]]))),
  on: lp.fixed ? lp.fixed.slice() : Uint8Array.from(p.sites, (_, s) => round(x[lp.iY[s]])),
});
const integral = (v: number) => Math.abs(v - Math.round(v)) <= 1e-6;

/**
 * What the search found: the arrangement and its key; the linear programme's bound on the good a day (`boundR`, with the factory planets
 * free); `cut` when the search stopped with an arrangement it hadn't ruled out that could make more of the good (by more than half a
 * hundredth), `done` when it ruled out every one (the best is then the best there is, factory planets, colonies and ISK by `weighted`).
 */
export type TeamFound = { sol: TeamSol; key: TeamKey; boundR: number; cut: boolean; done: boolean; nodes: number; sets: number };
/**
 * Each annealing run's moves (about 45 ms a run on 7M4C-F's team of five, 25 October 2026).
 */
export const ANNEAL_STEPS = 100_000;
const seedOf = (p: TeamProblem, r: number) => p.planets * 7919 + p.groups.reduce((n, g) => n * 31 + g.chars * 7 + g.cap, 1) + r * 104_729;
/** A small seeded generator (xorshift), so the search is the same every run. */
function rng(seed: number): () => number {
  let x = (seed >>> 0) || 0x9e3779b9;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
/** The branch and bound's nodes, at most (each a linear programme), across every set of factory planets it searches. */
export const TEAM_NODES = 1500;
/** Every set of factory planets is searched when there are at most this many (a small system); else the likeliest, by their bounds. */
export const ALL_SETS = 120;
/** How many sets of factory planets are annealed within, the highest bounds first (each count's highest besides). */
export const REFINE_SETS = 6;
/** Then the `AGAIN_SETS` that came out best are annealed `AGAIN_RUNS` times more, while the budget leaves the branch and bound its nodes. */
export const AGAIN_SETS = 3, AGAIN_RUNS = 5;
/** Units a day under which a bound beating the best doesn't make the search cut: half the ranking's hundredth. */
const UNITS_SLACK = 0.005;

/**
 * An arrangement within its groups' limits from rounded figures (`x`, the programme's, says which to keep): the factory character's
 * colonies dropped where a factory planet stands and to one a planet, then in every group the least-used colonies dropped while a planet or
 * the group is over its limit (the factory character's factory planets last).
 */
function repaired(p: TeamProblem, sol: TeamSol, x?: number[], lp?: Lp): TeamSol {
  const out = solOf(sol);
  const val = (w: number, q: number) => (x && lp ? x[lp.iX[w][q]] : 0);
  p.groups[0].opts.forEach((o, q) => { if (out.cnt[0][q] && p.sites.some((s, i) => out.on[i] && s.planet === o.planet)) out.cnt[0][q] = 0; });
  // The least-used of these colonies, dropped once.
  const dropLeast = (w: number, qs: number[]) => {
    const q = qs.filter((i) => out.cnt[w][i] > 0).reduce((a, b) => (val(w, a) <= val(w, b) ? a : b));
    out.cnt[w][q]--;
  };
  p.groups.forEach((g, w) => {
    const per = w === 0 ? 1 : g.chars, cap = w === 0 ? g.cap : g.chars * g.cap;
    for (let at = 0; at < p.planets; at++) {
      const qs = g.opts.map((o, q) => (o.planet === at ? q : -1)).filter((q) => q >= 0);
      while (qs.reduce((n, q) => n + out.cnt[w][q], 0) > per) dropLeast(w, qs);
    }
    const all = g.opts.map((_, q) => q);
    const sites = () => (w === 0 ? out.on.reduce((a, b) => a + b, 0) : 0);
    while (out.cnt[w].reduce((a, b) => a + b, 0) + sites() > cap) {
      if (out.cnt[w].some((n) => n > 0)) dropLeast(w, all);
      else { const s = [...out.on.keys()].find((i) => out.on[i])!; out.on[s] = 0; }
    }
  });
  return out;
}

/** Every set of `k` of `n` sites, as bit masks, in order. */
function* subsets(n: number, k: number, from = 0, acc = 0): Generator<number, void, void> {
  if (k === 0) { yield acc; return; }
  for (let i = from; i <= n - k; i++) yield* subsets(n, k - 1, i + 1, acc | (1 << i));
}
const maskOf = (on: Uint8Array) => on.reduce((m, v, i) => (v ? m | (1 << i) : m), 0);
const onOf = (n: number, mask: number) => Uint8Array.from({ length: n }, (_, i) => ((mask >> i) & 1 ? 1 : 0));

/**
 * The search, a step at a time.
 * 1. What the linear programme says can't be beaten (`boundR`, its factory planets free), and for each count of factory planets the sets
 *    it uses most.
 * 2. The sets of factory planets to search: every set in a small system (`ALL_SETS`), else each count's likeliest, their neighbours (one
 *    swapped, one more, one fewer) and the best's; each with its own programme's bound.
 * 3. The `REFINE_SETS` sets with the highest bounds on the good a day (the fewest factory planets among equal ones), and each count's
 *    highest, annealed within (`anneal`), then the `AGAIN_SETS` that came out best again (`AGAIN_RUNS` each), each answer polished (`polish`: on the smooth rate and each P1's own limit first, then trimmed of what adds nothing); the best then
 *    polished with its factory planets free to move.
 * 4. A branch and bound on each set, the highest bound first, sharing `TEAM_NODES`: depth first, the nearer child first, the factories
 *    branched on before the colonies, every arrangement it reaches whose colonies are whole taken as a candidate (its factories worked out
 *    exactly, `teamRate`) and each new best polished.
 * Null when nothing can be fed.
 */
export function* searchTeam(p: TeamProblem, budget: TeamBudget, maxNodes = TEAM_NODES, o: { anneal?: boolean } = {}): Generator<void, TeamFound | null, void> {
  // `anneal: false` (the tests): the branch and bound alone, so what it proves is its own.
  const annealing = o.anneal ?? true;
  const items = itemsOf(p), colonyItems = items.filter((x) => !isSite(x));
  const nSites = p.sites.length, cap0 = Math.min(p.groups[0].cap, nSites);
  const wt = weightsOf(p);
  const lp = lpOf(p);
  const first = solveAt(lp, rootOf(lp));
  budget.left -= LP_COST;
  yield;
  if (!first || !(first.x[lp.iR] > MIN_RATE)) return null;
  const boundR = first.x[lp.iR];
  let best: { sol: TeamSol; key: TeamKey; w: number } | null = null;
  const bestOf = () => best as { sol: TeamSol; key: TeamKey; w: number } | null;
  const bestW = () => bestOf()?.w ?? -Infinity;
  const offer = (sol: TeamSol) => {
    const key = keyOfSol(p, sol);
    if (!(key.R > MIN_RATE)) return false;
    const w = weighted(key, wt);
    if (w <= bestW() + SAME_W) return false;
    best = { sol: solOf(sol), key, w };
    return true;
  };
  function* improve(sol: TeamSol, its: Item[] = items): Generator<void, void, void> {
    const st = stateOf(p, sol);
    yield* polish(st, true, budget, its);
    yield* polish(st, false, budget, its);
    offer(solOf(st));
  }
  // 1. Each count's likeliest set: the programme held to that many factory planets, the ones it uses most.
  const likeliest: number[] = [];
  for (let F = 1; F <= cap0 && budget.left > 0; F++) {
    const lpF = lpOf(p, { maxSites: F });
    const at = solveAt(lpF, rootOf(lpF));
    budget.left -= LP_COST;
    yield;
    if (!at) continue;
    const top = lpF.iY.map((i, s) => ({ s, y: at.x[i] })).filter((z) => z.y > 1e-6).sort((a, b) => b.y - a.y || a.s - b.s).slice(0, F).map((z) => z.s);
    if (top.length) likeliest.push(top.reduce((m, s) => m | (1 << s), 0));
  }
  // 2. The sets to search.
  let total = 0;
  for (let F = 1; F <= cap0; F++) { let c = 1; for (let i = 0; i < F; i++) c = (c * (nSites - i)) / (i + 1); total += c; }
  const all = total <= ALL_SETS;
  const masks = new Set<number>();
  const around = (m0: number) => {
    masks.add(m0);
    for (let i = 0; i < nSites; i++) {
      if (m0 & (1 << i)) { masks.add(m0 & ~(1 << i)); for (let j = 0; j < nSites; j++) if (!(m0 & (1 << j))) masks.add((m0 & ~(1 << i)) | (1 << j)); } else masks.add(m0 | (1 << i));
    }
  };
  const countOf = (m: number) => { let c = 0; for (let i = 0; i < nSites; i++) if (m & (1 << i)) c++; return c; };
  if (all) { for (let F = 1; F <= cap0; F++) for (const m of subsets(nSites, F)) masks.add(m); } else for (const m of likeliest) around(m);
  type SetAt = { lp: Lp; s: { x: number[]; value: number }; F: number; mask: number };
  const sets: SetAt[] = [];
  const known = new Set<number>();
  function* bound(m: number): Generator<void, void, void> {
    if (known.has(m) || !countOf(m) || countOf(m) > cap0) return;
    known.add(m);
    const lpS = lpOf(p, { fixed: onOf(nSites, m) });
    const s = solveAt(lpS, rootOf(lpS));
    budget.left -= LP_COST;
    yield;
    if (s) sets.push({ lp: lpS, s, F: countOf(m), mask: m });
  }
  for (const m of masks) { if (budget.left <= 0) break; yield* bound(m); }
  sets.sort((a, b) => b.s.value - a.s.value || a.mask - b.mask);
  // 3. Annealing within the likeliest sets: the highest bounds on the good a day first (to a hundredth), the fewest factory planets among
  // equal ones; then the best polished with its factory planets free.
  const hundredth = (x: SetAt) => Math.round(x.s.x[x.lp.iR] * 100);
  const likely = [...sets].sort((a, b) => hundredth(b) - hundredth(a) || a.F - b.F || b.s.value - a.s.value || a.mask - b.mask);
  // Each count's own best too: a set with fewer factory planets and a lower bound can still make more (7M4C-F, four alts: two factory
  // planets, bound 810.3, make 789.2 a day where every set of three, bound 817.8, read 769.4).
  const picked = likely.filter((x, i) => i < REFINE_SETS || likely.findIndex((y) => y.F === x.F) === i);
  // A run within a set: from its programme's rounded arrangement on even runs, from nothing on odd ones (annealing's answers spread by
  // seed and start: within VI and III above, ten runs of 100,000 moves read 771.7 to 789.2); the set's best kept.
  const setBest = new Map<number, number>();
  let runs = 0;
  function* run(set: SetAt, r: number): Generator<void, void, void> {
    const start = r % 2 === 0 ? repaired(p, solFrom(p, set.lp, set.s.x, (v) => Math.floor(v + 1e-6)), set.s.x, set.lp)
      : { cnt: p.groups.map((g) => new Int32Array(g.opts.length)), on: set.lp.fixed!.slice() };
    const a = yield* anneal(stateOf(p, start), budget, ANNEAL_STEPS, seedOf(p, runs++), false);
    const st = stateOf(p, a);
    yield* polish(st, true, budget, colonyItems);
    yield* polish(st, false, budget, colonyItems);
    const sol = solOf(st);
    offer(sol);
    setBest.set(set.mask, Math.max(setBest.get(set.mask) ?? -Infinity, keyNow(st).R));
  }
  if (annealing) for (const set of picked) { if (budget.left <= 0) break; if (set.s.value > bestW() + 1e-7) yield* run(set, 0); }
  // Then more runs on the sets that came out best, while the budget for them lasts.
  const again = picked.filter((x) => setBest.has(x.mask)).sort((a, b) => setBest.get(b.mask)! - setBest.get(a.mask)! || a.F - b.F).slice(0, AGAIN_SETS);
  for (let r = 1; annealing && r <= AGAIN_RUNS && budget.left > maxNodes * LP_COST; r++) for (const set of again) { if (budget.left <= maxNodes * LP_COST) break; yield* run(set, r); }
  if (bestOf()) yield* improve(bestOf()!.sol);
  // Outside a small system, the best's neighbours too, once it's known.
  if (!all && bestOf()) {
    const before = masks.size;
    around(maskOf(bestOf()!.sol.on));
    if (masks.size > before) { for (const m of masks) { if (budget.left <= 0) break; yield* bound(m); } sets.sort((a, b) => b.s.value - a.s.value || a.mask - b.mask); }
  }
  // 4. The branch and bound on each set.
  const pickIn = (x: number[], ids: number[]) => {
    let pick = -1, frac = 1e-6;
    for (const i of ids) { const f = Math.abs(x[i] - Math.round(x[i])); if (f > frac) { frac = f; pick = i; } }
    return pick;
  };
  let nodes = 0;
  // From `start` (its programme's answer `s0`), until `limit` nodes in all: the bound on the good a day of the nodes it leaves open that
  // could still beat the best (−Infinity when none).
  function* branch(lpS: Lp, start: Node, s0: { x: number[]; value: number }, limit: number): Generator<void, number, void> {
    const stack: Node[] = [start];
    let at: { x: number[]; value: number } | null = s0;
    while (stack.length) {
      if (budget.left <= 0 || nodes >= limit) break;
      const nd = stack.pop()!;
      if (nd.bound <= bestW() + 1e-7) continue;
      const s = at ?? solveAt(lpS, nd);
      if (!at) { nodes++; budget.left -= LP_COST; yield; }
      at = null;
      if (!s || s.value <= bestW() + 1e-7) continue;
      if (lpS.xs.every((i) => integral(s.x[i])) && offer(solFrom(p, lpS, s.x, Math.round))) yield* improve(bestOf()!.sol, colonyItems);
      // The factories first (few, and the bound falls most when they're whole), then the colonies.
      let pick = pickIn(s.x, lpS.ns);
      if (pick < 0) pick = pickIn(s.x, lpS.xs);
      if (pick < 0) continue;
      const fl = Math.floor(s.x[pick] + 1e-9);
      const down: Node = { lo: nd.lo.slice(), hi: nd.hi.slice(), bound: s.value, boundR: s.x[lpS.iR] }; down.hi[pick] = fl;
      const up: Node = { lo: nd.lo.slice(), hi: nd.hi.slice(), bound: s.value, boundR: s.x[lpS.iR] }; up.lo[pick] = fl + 1;
      if (s.x[pick] - fl >= 0.5) stack.push(down, up); else stack.push(up, down);
    }
    let openR = -Infinity;
    for (const nd of stack) if (nd.bound > bestW() + 1e-7) openR = Math.max(openR, nd.boundR);
    return openR;
  }
  let open = false, openR = -Infinity;
  for (const [k, set] of sets.entries()) {
    if (set.s.value <= bestW() + 1e-7) continue;
    if (budget.left <= 0 || nodes >= maxNodes) { open = true; openR = Math.max(openR, set.s.x[set.lp.iR]); continue; }
    // This set's share of the nodes left: an even split over the sets still to search.
    const share = nodes + Math.max(50, Math.floor((maxNodes - nodes) / (sets.length - k)));
    const r = yield* branch(set.lp, rootOf(set.lp), set.s, share);
    if (r > -Infinity) { open = true; openR = Math.max(openR, r); }
  }
  const b = bestOf();
  if (!b) return null;
  // Done: every set of factory planets searched to the end. Cut: the good a day may be short, past half a hundredth, of an arrangement left
  // open (or of the bound with its factory planets free, when not every set was searched).
  const searchedAll = all && known.size === masks.size && sets.length === known.size;
  const done = searchedAll && !open;
  const cut = boundR > b.key.R + UNITS_SLACK && (!searchedAll || (open && openR > b.key.R + UNITS_SLACK));
  if (cut) budget.cut = true;
  return { sol: b.sol, key: b.key, boundR, cut, done, nodes, sets: sets.length };
}

/** The local search alone from an arrangement (both passes), drained: for the probes and the tests. */
export function polished(p: TeamProblem, sol: TeamSol, moveSites = true, budget: TeamBudget = { left: 1e9, cut: false }): TeamSol {
  const st = stateOf(p, sol);
  const items = itemsOf(p).filter((x) => moveSites || !isSite(x));
  for (const it of [polish(st, true, budget, items), polish(st, false, budget, items)]) for (let r = it.next(); !r.done; r = it.next());
  return solOf(st);
}

/**
 * Annealing from an arrangement: `steps` random moves (a colony swapped for another plan of its group, or for its planet's other plan,
 * added or dropped; with `moveSites`, a factory planet moved), each taken when it doesn't lower the figure (the good a day, plus a share of
 * the smooth rate so a step toward the next whole factory counts, less a hair a colony), or now and then when it does, less often as it
 * cools. Keeps the best arrangement it passed, by the judging order. Seeded, so the same every run. Annealing is what finds the answers a
 * steepest ascent can't reach (7M4C-F, four alts, factory planets VI and III: the local search alone stops at 770.6 a day, the research's
 * branch and bound found 777.0, annealing 776.9 to 789.2 by seed).
 */
function* anneal(st: State, budget: TeamBudget, steps: number, seed: number, moveSites: boolean): Generator<void, TeamSol, void> {
  const { p } = st;
  const rand = rng(seed);
  const wColony = weightsOf(p).colony;
  const fig = () => teamRate(p.rec, st.A, st.S, p.rHi) + SMOOTH_SHARE * Math.min(p.rHi ?? Infinity, supplyRate(p.rec, st.S), smoothRate(p.rec, st.A, st.S)) - wColony * st.colonies;
  let cur = fig();
  let best = { sol: solOf(st), k: scoreOf(st, false) };
  // Every plan as [group, plan], each planet's plans by group, and the plans in use (kept as they change).
  const all: [number, number][] = [];
  const byPlanet: [number, number][][][] = p.groups.map(() => Array.from({ length: p.planets }, () => []));
  p.groups.forEach((g, w) => g.opts.forEach((o, q) => { all.push([w, q]); byPlanet[w][o.planet].push([w, q]); }));
  const id = (w: number, q: number) => all.findIndex(([a, b]) => a === w && b === q);
  const idOf = p.groups.map((g, w) => g.opts.map((_, q) => id(w, q)));
  const usedIds: number[] = [], at = new Int32Array(all.length).fill(-1);
  const mark = (w: number, q: number) => {
    const i = idOf[w][q];
    if (st.cnt[w][q] > 0 && at[i] < 0) { at[i] = usedIds.length; usedIds.push(i); }
    if (st.cnt[w][q] === 0 && at[i] >= 0) { const last = usedIds.pop()!; if (last !== i) { usedIds[at[i]] = last; at[last] = at[i]; } at[i] = -1; }
  };
  all.forEach(([w, q]) => mark(w, q));
  const move = (w: number, q: number, d: 1 | -1) => { colony(st, w, q, d); mark(w, q); };
  const sitesOn: number[] = [];
  for (let i = 0; i < steps; i++) {
    if (budget.left-- <= 0) { budget.cut = true; break; }
    if (i % EVAL_CHUNK === 0) yield;
    const T = ANNEAL_T0 * Math.pow(ANNEAL_T1 / ANNEAL_T0, i / steps);
    const r = rand();
    let undo: (() => void) | null = null;
    if (moveSites && r < 0.04 && p.sites.length) {
      sitesOn.length = 0;
      st.on.forEach((v, s) => { if (v) sitesOn.push(s); });
      if (!sitesOn.length) continue;
      const a = sitesOn[Math.floor(rand() * sitesOn.length)], b = Math.floor(rand() * p.sites.length);
      site(st, a, -1);
      if (!canSite(st, b)) { site(st, a, 1); continue; }
      site(st, b, 1);
      undo = () => { site(st, b, -1); site(st, a, 1); };
    } else {
      const di = r < 0.9 && usedIds.length ? usedIds[Math.floor(rand() * usedIds.length)] : -1;
      const drop = di >= 0 ? all[di] : null;
      if (drop) move(drop[0], drop[1], -1);
      const pool = drop && rand() < 0.35 ? byPlanet[drop[0]][p.groups[drop[0]].opts[drop[1]].planet] : all;
      const add = r < 0.97 ? pool[Math.floor(rand() * pool.length)] : null;
      if (add && ((drop && add[0] === drop[0] && add[1] === drop[1]) || !canColony(st, add[0], add[1]))) { if (drop) move(drop[0], drop[1], 1); continue; }
      if (add) move(add[0], add[1], 1);
      if (!add && !drop) continue;
      undo = () => { if (add) move(add[0], add[1], -1); if (drop) move(drop[0], drop[1], 1); };
    }
    const next = fig();
    if (next >= cur - 1e-12 || rand() < Math.exp((next - cur) / T)) {
      cur = next;
      const k = scoreOf(st, false);
      if (ahead(k, best.k)) best = { sol: solOf(st), k };
    } else undo!();
  }
  return best.sol;
}
/** The annealing's temperatures, in units of the good a day: from where a step of a few units down is often taken, to where none is. */
export const ANNEAL_T0 = 6, ANNEAL_T1 = 0.05;
/** How much of the smooth rate the annealing's figure carries beside the good a day. */
const SMOOTH_SHARE = 0.3;
/** Annealing alone from an arrangement, drained: for the probes and the tests. */
export function annealed(p: TeamProblem, sol: TeamSol, steps: number, seed = 1, moveSites = false): TeamSol {
  const it = anneal(stateOf(p, sol), { left: 1e12, cut: false }, steps, seed, moveSites);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}

// ---- The setup: a factory character's planets, worked out from a PlanInput ----

/**
 * A factory character's own figures, for the page. `factoryChar`: the character shown, whose factory planets they are. `parts`: each
 * character in it (the factory character first), its colonies (factory planets among them), what its colonies hand the factory planets a
 * day by good, that as the good a day it stands for (by the P1 in it: a P2 counted by what it's made of), and its m³ a day. `factories`:
 * each factory planet, the Advanced it holds at the factory character's level and runs, what comes in a day in m³ and how many days its
 * launchpad holds of that (null with nothing coming in). `fill`: how many P0 → P1 feeder planets fill one factory planet here (at the
 * feeders' level), what it then makes a day, the factories it runs of those it holds, and the days its launchpad holds of its intake;
 * null when not worked out. `handedM3`: what the other characters hand the factory character a day, m³. `convertAt`: about how many more
 * P0 → P1 feeder planets these factory planets take before they run full and another planet is worth converting (null when they run
 * full now, or the fill isn't known). `boundR`: what the programme says no arrangement beats; `done`: every arrangement ruled out.
 */
export type TeamFigures = {
  factoryChar: number;
  parts: { charId: number; colonies: number; perDay: number; sends: { id: number; perDay: number }[]; m3: number }[];
  factories: { planetId: number; holds: number; runs: number; intakeM3: number; days: number | null }[];
  fill: { feeders: number; perDay: number; runs: number; holds: number; days: number | null } | null;
  handedM3: number; convertAt: number | null; boundR: number; done: boolean;
};

/** What the team search may spend (`TeamBudget`), and the fill count's. About 1.5 seconds and 0.1 on 7M4C-F's team of six (25 October 2026). */
export const TEAM_BUDGET = 3_000_000, FILL_BUDGET = 300_000;
export const NO_ONLY = 'A factory character plans one good: hold Plan to a P2 or a P3 (Plan it, on the Chart)';
/** Why a team can't be planned with fewer than two characters doing planetary industry. */
export const teamTooFew = (n: number) => `A factory character needs two characters doing planetary industry: ${n === 1 ? 'one here does' : 'none here does'}`;

/** A character of the team: its level and its planets. */
type Member = { c: PlanChar; cc: number; cap: number };
/** One plan a group can run on a planet: its place, what it ships of the recipe's goods, its ISK proxy, and the plan itself. */
type Opt = TeamOpt & { plan: Plan };
/** A colony of the team: whose, at what level, on which planet, running which plan. */
type Colonied = { m: Member; at: number; planet: PlanPlanet; plan: Plan };
/** A factory planet: its place, the Advanced it holds, and (a kept plan) its factories by what they make. */
type FactoryAt = { at: number; planet: PlanPlanet; holds: number; fixed?: Map<number, number> };

/** The team: the factory character (the one shown) and every other character doing planetary industry, each once, in roster order. */
function teamOf(input: PlanInput): Member[] {
  const seen = new Set<number>();
  return [input.char, ...input.others].filter((c) => !seen.has(c.charId) && !!seen.add(c.charId) && charWhy(c) == null)
    .map((c) => ({ c, cc: c.ccLevel!, cap: c.planets! }));
}

/** The recipe as the search sees it, from the planner's tree: the P1s, then the P2s it takes. */
export function recipeOf(tree: Tree): TeamRecipe {
  const p2s = [...tree.p2.keys()];
  const goods = [...tree.kinds, ...p2s];
  return {
    goods, p1: tree.kinds.length, xDay: tree.perFactory * 24, alpha: tree.kinds.map((k) => tree.alpha.get(k) ?? 0),
    p2: p2s.map((g) => { const e = tree.p2.get(g)!; return { g: goods.indexOf(g), beta: e.beta, day: e.perFactory * 24, per: tree.kinds.map((k) => e.inputs.get(k) ?? 0) }; }),
  };
}

/** What a plan's ships come to at each good's first unit's net after its planet's export tax, a good that doesn't pay to ship at nothing. */
function worthOf(input: PlanInput, sold: Seller, p: Plan): number {
  const rate = p.planet.tax.rate ?? 0;
  let w = 0;
  for (const s of p.ships) w += s.perDay * Math.max(0, unitNet(sold, s.id) - (input.ix.byId.get(s.id)?.taxBase ?? 0) * rate);
  return w;
}

/**
 * Every single-planet plan a character at `cc` could run on each planet as a feeder: the planner's own (`plansFor`, F9's ways of running at
 * that level on the planet's own radius), P0 → P1 and, for a P3, P0 → P2 making a P2 it takes. Plans shipping none of the recipe's goods are
 * dropped, and so is a plan another on the same planet matches or beats on every one of them and on ISK.
 */
function* optionsAt(input: PlanInput, tree: Tree, rec: TeamRecipe, cc: number, sold: Seller): Generator<void, Opt[], void> {
  const out: Opt[] = [];
  for (const [at, planet] of input.planets.entries()) {
    if (!planet.type) continue;
    const fits = fitFor(planet, cc);
    const plans = [...plansFor(input, planet, at, 'p1', false, fits), ...(tree.p2.size ? plansFor(input, planet, at, 'p2', false, fits).filter((p) => tree.p2.has(p.product)) : [])];
    const here: Opt[] = [];
    for (const plan of plans) {
      const v = new Float64Array(rec.goods.length);
      for (const sh of plan.ships) { const g = rec.goods.indexOf(sh.id); if (g >= 0) v[g] += sh.perDay; }
      if (v.some((x) => x > 1e-9)) here.push({ planet: at, v, worth: worthOf(input, sold, plan), plan });
    }
    const dom = (a: Opt, b: Opt) => a.v.every((x, g) => x <= b.v[g] + 1e-9) && a.worth <= b.worth + 1e-6;
    out.push(...here.filter((a, i) => !here.some((b, j) => j !== i && dom(a, b) && (!dom(b, a) || j < i))));
    // A step a planet: fitting its plans at a level is the heavy part (a few milliseconds a planet).
    yield;
  }
  return out;
}

/** The sites: every planet the factory character could make a factory planet, with the Advanced it holds at its level beside one launchpad. */
function sitesOf(input: PlanInput, tree: Tree, main: Member): TeamSite[] {
  const { ix } = input;
  const ids = [tree.x, ...tree.p2.keys()];
  return input.planets.flatMap((pl, at) => {
    const t = pl.type;
    if (!t || pl.radiusKm == null || !(pl.radiusKm > 0) || !ids.every((id) => ix.makes.get(id)?.planetTypes.includes(t))) return [];
    const holds = maxFactories(ix, t, main.cc, 'advanced', 1, pl.radiusKm);
    return holds > 0 ? [{ planet: at, cap: holds }] : [];
  });
}

/**
 * The search's groups: the factory character alone first, then the others by level and planets, each group's members in roster order.
 * `opts` by level, worked out once.
 */
type Grp = Omit<TeamGroup, 'opts'> & { opts: Opt[] };
function groupsOf(team: Member[], optsAt: (cc: number) => Opt[]): { groups: Grp[]; members: Member[][] } {
  const groups: Grp[] = [{ chars: 1, cap: team[0].cap, opts: optsAt(team[0].cc) }];
  const members: Member[][] = [[team[0]]];
  const byKey = new Map<string, number>();
  for (const m of team.slice(1)) {
    const k = `${m.cc}:${m.cap}`;
    let w = byKey.get(k);
    if (w == null) { byKey.set(k, w = groups.length); groups.push({ chars: 0, cap: m.cap, opts: optsAt(m.cc) }); members.push([]); }
    groups[w].chars++;
    members[w].push(m);
  }
  return { groups, members };
}

/**
 * The search's arrangement as colonies: each group's colonies dealt to its members in turn, planet by planet (a planet holds at most as
 * many of a group's colonies as it has members, and the group no more than their planets, so each member gets at most one a planet and no
 * more than its own), the factory character's own; and its factory planets.
 */
function realised(input: PlanInput, groups: Grp[], members: Member[][], sites: TeamSite[], sol: TeamSol): { colonies: Colonied[]; factories: FactoryAt[] } {
  const colonies: Colonied[] = [];
  groups.forEach((g, w) => {
    const list: Opt[] = [];
    for (let at = 0; at < input.planets.length; at++) g.opts.forEach((o, q) => { if (o.planet === at) for (let i = 0; i < sol.cnt[w][q]; i++) list.push(o); });
    list.forEach((o, i) => colonies.push({ m: members[w][i % members[w].length], at: o.planet, planet: input.planets[o.planet], plan: o.plan }));
  });
  const factories = sites.filter((_, s) => sol.on[s]).map((x) => ({ at: x.planet, planet: input.planets[x.planet], holds: x.cap }));
  return { colonies, factories };
}

/**
 * Each kind of factory dealt over the factory planets in proportion to what each holds (the largest remainders first), then moved off a
 * planet past what it holds onto the one with the most room: so each factory planet makes its share of the good from its own P2 as far as
 * whole factories let, and the rest is carried between them.
 */
function dealt(counts: number[], holds: number[]): number[][] {
  const H = holds.reduce((a, b) => a + b, 0);
  const out = holds.map(() => counts.map(() => 0));
  counts.forEach((n, k) => {
    const exact = holds.map((h) => (H > 0 ? (n * h) / H : 0));
    const fl = exact.map(Math.floor);
    let left = n - fl.reduce((a, b) => a + b, 0);
    const order = exact.map((x, j) => ({ j, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.j - b.j);
    for (const { j } of order) { if (left <= 0) break; fl[j]++; left--; }
    fl.forEach((v, j) => (out[j][k] = v));
  });
  for (let guard = 0; guard < 1000; guard++) {
    const over = out.findIndex((row, j) => row.reduce((a, b) => a + b, 0) > holds[j]);
    if (over < 0) break;
    const room = out.map((row, j) => holds[j] - row.reduce((a, b) => a + b, 0));
    const to = room.indexOf(Math.max(...room));
    if (!(room[to] > 0)) break;
    const k = out[over].indexOf(Math.max(...out[over]));
    out[over][k]--; out[to][k]++;
  }
  return out;
}

/**
 * The setup an arrangement makes. The good's factories run at `R` a day across the factory planets (each its dealt share); each P2 the
 * good takes is shipped in first, the rest made; every P1 they take is drawn from the feeders the lowest customs rate first (then the
 * planet listed first, then roster order), each feeder sending what it draws to the factory planets in order of their need; P2 a factory
 * planet makes past its own need goes to one short of it. What's left of each good is offered to market where a unit pays to ship
 * (Ruling T15-5) and sold once. Customs: export at each feeder on all it ships, import at half on each factory planet, export there on
 * the good and on P2 sent between them. `fixedN`: a kept plan's factories, by planet.
 */
function teamSetup(input: PlanInput, tree: Tree, rec: TeamRecipe, team: Member[], colonies: Colonied[], factories: FactoryAt[], R: number,
  extra: { found?: TeamFound; fill?: TeamFigures['fill']; cut?: boolean; notes?: string[] }): Setup {
  const { ix } = input;
  const sold = seller(input.sell);
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  const vol = (id: number) => ix.byId.get(id)?.volume ?? 0;
  const G = rec.goods.length, P2 = rec.p2.length;
  const main = team[0];
  const S = new Float64Array(G);
  const ships = colonies.map((c) => { const v = new Float64Array(G); for (const sh of c.plan.ships) { const g = rec.goods.indexOf(sh.id); if (g >= 0) v[g] += sh.perDay; } for (let g = 0; g < G; g++) S[g] += v[g]; return v; });
  // What the factory planets take: P2 shipped in first, the rest made; the P1 for what's made and what the good takes straight.
  const used2 = rec.p2.map((t) => Math.min(S[t.g], t.beta * R));
  const made = rec.p2.map((t, j) => Math.max(0, t.beta * R - used2[j]));
  const used1 = Array.from({ length: rec.p1 }, (_, k) => rec.alpha[k] * R + rec.p2.reduce((n, t, j) => n + t.per[k] * made[j], 0));
  // The factories, and each planet's share of them: a kept plan's as kept, else the fewest that make R, dealt over the factory planets.
  const nAll = factoriesAt(rec, S, R);
  const kinds = [...rec.p2.map((t) => rec.goods[t.g]), tree.x];
  const per: number[][] = factories.some((f) => f.fixed)
    ? factories.map((f) => kinds.map((id) => f.fixed?.get(id) ?? 0))
    : dealt([...nAll.p2, nAll.x], factories.map((f) => f.holds));
  const sumK = (k: number) => per.reduce((n, row) => n + row[k], 0);
  const Rj = per.map((row) => (sumK(P2) > 0 ? (R * row[P2]) / sumK(P2) : 0));
  const madeJ = per.map((row) => rec.p2.map((_, j) => (sumK(j) > 0 ? (made[j] * row[j]) / sumK(j) : 0)));
  const need1 = per.map((_, f) => Array.from({ length: rec.p1 }, (__, k) => rec.alpha[k] * Rj[f] + rec.p2.reduce((n, t, j) => n + t.per[k] * madeJ[f][j], 0)));
  // P2 each factory planet is short of (its share of the good's need less what it makes); what it makes past its need, sent to another.
  const short2 = per.map((_, f) => rec.p2.map((t, j) => t.beta * Rj[f] - madeJ[f][j]));
  // The feeders in the order they're drawn from.
  const order = colonies.map((_, i) => i).sort((a, b) => {
    const ra = colonies[a].planet.tax.rate, rb = colonies[b].planet.tax.rate;
    return (ra ?? Infinity) - (rb ?? Infinity) || colonies[a].at - colonies[b].at || team.indexOf(colonies[a].m) - team.indexOf(colonies[b].m);
  });
  // toF[i][f][g]: what colony i sends factory planet f of good g a day.
  const toF = colonies.map(() => factories.map(() => new Float64Array(G)));
  const drawn = colonies.map(() => new Float64Array(G));
  for (let g = 0; g < G; g++) {
    const isP2 = g >= rec.p1, j = g - rec.p1;
    // What each factory planet takes of it from feeders: its P1 need, or what it's short of a P2 (up to what feeders ship in all).
    const want = factories.map((_, f) => (isP2 ? Math.max(0, short2[f][j]) : need1[f][g]));
    let feed = isP2 ? used2[j] : used1[g];
    for (let f = 0; f < factories.length; f++) { want[f] = Math.min(want[f], feed); feed -= want[f]; }
    let fi = 0;
    for (const i of order) {
      let have = ships[i][g];
      while (have > 1e-9 && fi < factories.length) {
        if (!(want[fi] > 1e-9)) { fi++; continue; }
        const a = Math.min(have, want[fi]);
        toF[i][fi][g] += a; drawn[i][g] += a; want[fi] -= a; have -= a;
      }
    }
  }
  // P2 sent between factory planets: from those making past their need to those still short after the feeders'.
  const between: { from: number; to: number; g: number; perDay: number }[] = [];
  rec.p2.forEach((t, j) => {
    const g = t.g;
    const got = factories.map((_, f) => colonies.reduce((n, _c, i) => n + toF[i][f][g], 0));
    const gap = factories.map((_, f) => short2[f][j] - got[f]);
    for (let a = 0; a < factories.length; a++) for (let b = 0; b < factories.length; b++) {
      if (!(gap[a] < -1e-9) || !(gap[b] > 1e-9)) continue;
      const x = Math.min(-gap[a], gap[b]);
      between.push({ from: a, to: b, g, perDay: x });
      gap[a] += x; gap[b] -= x;
    }
  });
  // What's left at each feeder, of every good it ships: offered where a unit pays to ship, kept on the planet otherwise; sold once a good.
  const allIds = [...new Set(colonies.flatMap((c) => c.plan.ships.map((x) => x.id)))].sort((a, b) => tierRank(ix, a) - tierRank(ix, b) || a - b);
  const leftOf = (i: number, id: number) => {
    const g = rec.goods.indexOf(id);
    return (colonies[i].plan.ships.find((x) => x.id === id)?.perDay ?? 0) - (g >= 0 ? drawn[i][g] : 0);
  };
  const toM = colonies.map(() => new Map<number, number>());
  const keptAt = colonies.map(() => [] as { id: number; perDay: number; why: string }[]);
  const overAt = colonies.map(() => [] as { id: number; perDay: number }[]);
  const outputs: Output[] = [];
  const valued = new Set<number>();
  for (const id of allIds) {
    let offered = 0, held = 0, heldWhy: { why: string; noPrice: boolean } | null = null;
    const offers = new Map<number, number>();
    for (const i of order) {
      const left = leftOf(i, id);
      if (!(left > 1e-6)) continue;
      const w = keptWhy(ix, sold, id, colonies[i].planet.tax.rate);
      if (w) { held += left; heldWhy ??= w; keptAt[i].push({ id, perDay: left, why: w.why }); } else { offered += left; offers.set(i, left); }
    }
    if (!(offered + held > 1e-6)) continue;
    const sd = offered > 1e-6 ? sold(id, offered) : keptSold(heldWhy?.why ?? 'none of it is offered');
    if (sd.isk != null) valued.add(id);
    outputs.push({ id, perDay: offered + held, sold: sd, buildingUp: sd.isk == null ? 0 : held + Math.max(0, offered - sd.units), ...(heldWhy && held > 1e-6 ? { stays: { perDay: held, why: heldWhy.why, noPrice: heldWhy.noPrice } } : {}) });
    // What sells leaves the lowest-tax feeders first; with no price, all of it is taken as shipped, untaxed (I1).
    let sell = sd.isk == null ? offered : sd.units;
    for (const i of order) {
      const o = offers.get(i) ?? 0;
      if (!(o > 0)) continue;
      const out = Math.min(o, Math.max(0, sell));
      sell -= out;
      if (out > 1e-9) toM[i].set(id, out);
      if (o - out > 1e-6) overAt[i].push({ id, perDay: o - out });
    }
  }
  const soldX = sold(tree.x, R);
  const xSold = soldX.isk == null ? R : Math.min(R, soldX.units);
  outputs.unshift({ id: tree.x, perDay: R, sold: soldX, buildingUp: soldX.isk == null ? 0 : Math.max(0, R - soldX.units) });
  outputs.sort((a, b) => tierRank(ix, a.id) - tierRank(ix, b.id) || a.id - b.id);
  if (!outputs.some(valuedOutput)) return blocked(input, 'team', unvaluedWhy(outputs), []);

  // Customs: each feeder on what it ships (to the factory planets, and what sells); each factory planet half on what comes in, and the
  // good (as it sells, each planet its share) and P2 sent on.
  const taxes: Setup['taxes'] = [];
  let perPctBase = 0;
  const addRows = (planetId: number, rows: TaxRow[]) => { for (const t of rows) {
    if (t.perDay == null) perPctBase += t.base;
    const held = taxes.find((x) => x.planetId === planetId && x.tier === t.tier);
    if (!held) taxes.push({ planetId, tier: t.tier, perDay: t.perDay });
    else held.perDay = held.perDay == null || t.perDay == null ? null : held.perDay + t.perDay;
  } };
  colonies.forEach((c, i) => {
    const out: { id: number; perDay: number }[] = [];
    for (let g = 0; g < G; g++) if (drawn[i][g] > 1e-9) out.push({ id: rec.goods[g], perDay: drawn[i][g] });
    for (const [id, x] of toM[i]) if (valued.has(id)) out.push({ id, perDay: x });
    addRows(c.planet.planetId, taxRows(ix, out, c.planet.tax.rate, 1));
  });
  const intake = factories.map(() => new Map<number, number>());
  factories.forEach((f, fi) => {
    colonies.forEach((_, i) => toF[i][fi].forEach((x, g) => { if (x > 1e-9) intake[fi].set(rec.goods[g], (intake[fi].get(rec.goods[g]) ?? 0) + x); }));
    for (const b of between) if (b.to === fi) intake[fi].set(rec.goods[b.g], (intake[fi].get(rec.goods[b.g]) ?? 0) + b.perDay);
    const outs = [...between.filter((b) => b.from === fi).map((b) => ({ id: rec.goods[b.g], perDay: b.perDay })), ...(soldX.isk != null && R > 0 ? [{ id: tree.x, perDay: (xSold * Rj[fi]) / R }] : [])];
    addRows(f.planet.planetId, mergeRows([...taxRows(ix, [...intake[fi]].map(([id, perDay]) => ({ id, perDay })), f.planet.tax.rate, 0.5), ...taxRows(ix, outs, f.planet.tax.rate, 1)]));
  });
  const index = new Map(input.planets.map((pl, i) => [pl.planetId, i]));
  taxes.sort((a, b) => index.get(a.planetId)! - index.get(b.planetId)! || TIERS_DOWN.indexOf(a.tier) - TIERS_DOWN.indexOf(b.tier));
  const taxKnown = taxes.every((t) => t.perDay != null);
  const isk = outputs.reduce((n, o) => n + (o.sold.isk ?? 0), 0) - taxes.reduce((n, t) => n + (t.perDay ?? 0), 0);

  // Roles: each feeder colony as the feed's are, each factory planet, the planets nobody uses.
  const lacks = new Map<number, Set<string>>(team.map((m) => [m.c.charId, new Set<string>()]));
  const feederRoles = colonies.map((c, i): Role => {
    const fit = fitted(input, c.plan, c.m.cc);
    if (fit.lacks) lacks.get(c.m.c.charId)!.add(fit.lacks);
    const shipsTo: Role['ships'] = [];
    factories.forEach((f, fi) => toF[i][fi].forEach((x, g) => { if (x > 1e-6) shipsTo.push({ id: rec.goods[g], perDay: x, to: f.planet.planetId }); }));
    for (const [id, x] of toM[i]) if (x > 1e-6) shipsTo.push({ id, perDay: x, to: 'market' });
    const fitSaid = fitNote(c.plan, shipsTo.filter((x) => x.to === 'market'), c.m.cc);
    const adv = c.plan.advanced;
    const asWell = adv && drawn[i][rec.goods.indexOf(adv.id)] > 1e-6 && c.plan.lines.some((l) => drawn[i][rec.goods.indexOf(l.p1)] > 1e-6)
      ? [`ships ${amountSaid(drawn[i][rec.goods.indexOf(adv.id)])} ${name(adv.id)} a day, made here on ${adv.count} Advanced, as well as its P1`] : [];
    const notes = [...asWell, ...rateNotes(input, c.plan), ...fit.notes, ...(fitSaid ? [fitSaid] : []), ...staysNotes(name, keptAt[i], overAt[i])];
    return {
      planetId: c.planet.planetId, charId: c.m.c.charId, does: 'extract',
      extracts: c.plan.lines.map((l, k) => {
        const g = rec.goods.indexOf(l.p1), ag = adv ? rec.goods.indexOf(adv.id) : -1;
        const used = (g >= 0 && drawn[i][g] > 1e-6) || (ag >= 0 && drawn[i][ag] > 1e-6);
        const extraSaid = used || (adv && k > 0) ? null : g < 0 && !(adv && ag >= 0) ? `Extra: ${name(tree.x)} doesn’t use ${name(l.p1)}; ${toM[i].has(l.p1) ? 'it’s sold' : 'it stays on the planet'}`
          : `Extra: the factory planets take all the ${name(adv?.id ?? l.p1)} they need from other planets`;
        return { p0: l.p0, perHour: l.perHour, heads: fit.heads[k], rate: l.rate, ...(l.setAside ? { setAside: l.setAside } : {}), ...(extraSaid ? { extra: extraSaid } : {}) };
      }),
      makes: [
        ...c.plan.lines.map((l) => ({ id: l.p1, perDay: l.p1PerHour * 24, facility: 'basic' as const, count: l.basics })),
        ...(adv ? [{ id: adv.id, perDay: adv.perHour * 24, facility: 'advanced' as const, count: adv.count }] : []),
      ],
      ships: shipsTo, fit: fit.fit, why: notes.length ? notes.map(lead).join('. ') : null,
      lacks: fit.fit && !fit.fit.fits ? fit.lacks : null,
    };
  });
  const factoryRoles = factories.map((f, fi): Role => {
    const t = f.planet.type!, r = f.planet.radiusKm!;
    const runs = per[fi].reduce((a, b) => a + b, 0);
    const fit = fitOf(ix, t, main.cc, { ecus: 0, heads: 0, basic: 0, advanced: runs, hightech: 0, storage: 0, launchpads: 1 }, r);
    const imports: NonNullable<Role['imports']> = [];
    colonies.forEach((c, i) => toF[i][fi].forEach((x, g) => {
      if (!(x > 1e-6)) return;
      const held = imports.find((y) => y.id === rec.goods[g] && y.from === c.planet.planetId);
      if (held) held.perDay += x; else imports.push({ id: rec.goods[g], perDay: x, from: c.planet.planetId });
    }));
    for (const b of between) if (b.to === fi) imports.push({ id: rec.goods[b.g], perDay: b.perDay, from: factories[b.from].planet.planetId });
    const out: Role['ships'] = [...(xSold * Rj[fi] / Math.max(R, 1e-12) > 1e-6 ? [{ id: tree.x, perDay: (xSold * Rj[fi]) / R, to: 'market' as const }] : []),
      ...between.filter((b) => b.from === fi).map((b) => ({ id: rec.goods[b.g], perDay: b.perDay, to: factories[b.to].planet.planetId }))];
    const pct = f.holds > 0 ? Math.round((runs / f.holds) * 100) : 0;
    const notes = [`it runs ${runs} of the ${f.holds} Advanced it holds at ${atCcu(main.cc).replace(/^at /, '')} beside one launchpad (${pct}%)`, ...(f.fixed ? ['its factories as kept'] : [])];
    return {
      planetId: f.planet.planetId, charId: main.c.charId, does: 'factory', extracts: [],
      makes: [...rec.p2.map((tt, j) => ({ id: rec.goods[tt.g], perDay: madeJ[fi][j], facility: 'advanced' as const, count: per[fi][j] })).filter((m) => m.count > 0 || m.perDay > 1e-6),
        { id: tree.x, perDay: Rj[fi], facility: tree.facility, count: per[fi][P2] }],
      ships: out, imports, fit, why: notes.map(lead).join('. '), lacks: fit.fits ? null : levelFor(ix, t, main.cc, { ecus: 0, heads: 0, basic: 0, advanced: runs, hightech: 0, storage: 0, launchpads: 1 }, r),
    };
  });
  const roles: Role[] = [];
  input.planets.forEach((planet, at) => {
    const here = [...factoryRoles.filter((_, fi) => factories[fi].at === at), ...colonies.map((c, i) => ({ c, r: feederRoles[i] })).filter((x) => x.c.at === at)
      .sort((a, b) => team.indexOf(a.c.m) - team.indexOf(b.c.m)).map((x) => x.r)];
    roles.push(...(here.length ? here : [unusedRole(planet, main.c.charId, planet.type ? 'No colony of the team’s here' : NO_PI)]));
  });

  // Each character's part: its colonies (the factory character's factory planets among them) and what it hands the factory planets.
  const content = rec.goods.map((_, g) => (g < rec.p1 ? 1 : rec.p2[g - rec.p1].per.reduce((a, b) => a + b, 0)));
  const perX = rec.alpha.reduce((a, b) => a + b, 0) + rec.p2.reduce((n, t) => n + t.beta * t.per.reduce((a, b) => a + b, 0), 0);
  const inIt = team.filter((m) => m === main || colonies.some((c) => c.m === m));
  const parts = inIt.map((m) => {
    const sends = new Float64Array(G);
    colonies.forEach((c, i) => { if (c.m === m) for (let g = 0; g < G; g++) sends[g] += drawn[i][g]; });
    const n = colonies.filter((c) => c.m === m).length + (m === main ? factories.length : 0);
    return {
      charId: m.c.charId, colonies: n, perDay: perX > 0 ? sends.reduce((t, x, g) => t + x * content[g], 0) / perX : 0,
      sends: rec.goods.map((id, g) => ({ id, perDay: sends[g] })).filter((x) => x.perDay > 1e-6), m3: sends.reduce((t, x, g) => t + x * vol(rec.goods[g]), 0),
    };
  });
  const all = parts.reduce((n, x) => n + x.colonies, 0);
  // Each character's ISK a day is the team's shared out by colonies: an allocation, not what it earns alone (its feeders sell nothing of the
  // good); the page shows the team's in all, never this per character.
  const perChar = parts.map((x) => ({ charId: x.charId, iskDay: all > 0 ? (isk * x.colonies) / all : null, lacks: [...(lacks.get(x.charId) ?? [])].sort() }));
  const restocks = factories.reduce((n, f, fi) => n + ([...intake[fi]].reduce((t, [id, x]) => t + x * vol(id), 0) + Rj[fi] * vol(tree.x)) * 7 / ix.planetTypes[f.planet.type!].pins.launchpad.capacity, 0);
  const figures: TeamFigures = {
    factoryChar: main.c.charId, parts,
    factories: factories.map((f, fi) => {
      const m3 = [...intake[fi]].reduce((t, [id, x]) => t + x * vol(id), 0);
      return { planetId: f.planet.planetId, holds: f.holds, runs: per[fi].reduce((a, b) => a + b, 0), intakeM3: m3, days: m3 > 1e-9 ? ix.planetTypes[f.planet.type!].pins.launchpad.capacity / m3 : null };
    }),
    fill: extra.fill ?? null, handedM3: parts.filter((x) => x.charId !== main.c.charId).reduce((t, x) => t + x.m3, 0),
    convertAt: null, boundR: extra.found?.boundR ?? R, done: extra.found?.done ?? false,
  };
  // When to convert the next planet: the factories these planets have spare, over what a P0 → P1 feeder takes of them when one is full.
  if (figures.fill && figures.fill.feeders > 0) {
    const spare = figures.factories.reduce((n, f) => n + f.holds - f.runs, 0);
    const each = figures.fill.runs / figures.fill.feeders;
    const n = each > 0 ? Math.round(spare / each) : 0;
    figures.convertAt = n >= 1 ? n : null;
  }
  const unvalued = outputs.filter((o) => o.sold.isk == null).length;
  const before: Setup['before'] = [];
  if (!taxKnown) before.push('tax');
  if (colonies.some((c) => c.plan.lines.some((l) => !l.rate))) before.push('extraction');
  if (unvalued) before.push('price');
  return {
    kind: 'team', iskDay: perChar.length ? isk / perChar.length : isk, iskDayHigh: null, before,
    taxDay: taxKnown ? taxes.reduce((n, t) => n + t.perDay!, 0) : null, perPct: perPctBase / 100,
    taxes, outputs, inputs: [], roles,
    upkeep: upkeepOf(input, outputs, colonies.length, restocks),
    perChar, unvalued, why: null, made: { id: tree.x, perDay: R }, team: figures,
    ...(extra.cut ? { cut: true as const } : {}),
  };
}

/**
 * How few P0 → P1 feeder planets fill one factory planet here (`TeamFigures.fill`): the factory planet holding the most Advanced at the
 * factory character's level, fed by colonies at `cc` (any number of characters), held to what that planet makes from P1 alone, with the
 * fewest colonies. Null when nothing fills it.
 */
/**
 * The fill count's question as a search (`fillOf`): one site, its factory character holding nothing else, fed by `FILL_CHARS` characters'
 * colonies on these P0 → P1 plans (each planet's as many times as there are characters, so any number a planet needs), held to `top`,
 * what the site's factories make from P1 alone, so the search's order (the good a day, then the fewest colonies) is the fewest feeders.
 * Null when the site makes nothing from P1.
 */
export function fillProblem(rec: TeamRecipe, site: TeamSite, p1: TeamOpt[], planets: number): { p: TeamProblem; top: number } | null {
  const full = new Float64Array(rec.goods.length);
  for (let k = 0; k < rec.p1; k++) full[k] = 1e12;
  const top = teamRate(rec, site.cap, full);
  if (!(top > MIN_RATE)) return null;
  return { p: { rec, groups: [{ chars: 1, cap: 1, opts: [] }, { chars: FILL_CHARS, cap: planets, opts: p1 }], sites: [site], planets, rHi: top }, top };
}
function* fillOf(input: PlanInput, rec: TeamRecipe, sites: TeamSite[], opts: Opt[]): Generator<void, TeamFigures['fill'], void> {
  if (!sites.length) return null;
  const at = sites.reduce((a, b) => (b.cap > a.cap ? b : a));
  const p1 = opts.filter((o) => !o.plan.advanced);
  const q = fillProblem(rec, at, p1, input.planets.length);
  if (!q) return null;
  const { p, top } = q;
  const f = yield* searchTeam(p, { left: FILL_BUDGET, cut: false }, 400);
  if (!f || f.key.R < top - 1e-6) return null;
  const S = new Float64Array(rec.goods.length);
  f.sol.cnt[1].forEach((n, q) => { for (let g = 0; g < S.length; g++) S[g] += n * p1[q].v[g]; });
  const n = factoriesAt(rec, S, f.key.R);
  const made = rec.p2.map((t) => Math.max(0, t.beta * f.key.R - Math.min(S[t.g], t.beta * f.key.R)));
  let m3 = 0;
  for (let k = 0; k < rec.p1; k++) m3 += (rec.alpha[k] * f.key.R + rec.p2.reduce((x, t, j) => x + t.per[k] * made[j], 0)) * (input.ix.byId.get(rec.goods[k])?.volume ?? 0);
  const t = input.planets[at.planet].type!;
  return { feeders: f.key.colonies, perDay: f.key.R, runs: n.x + n.p2.reduce((a, b) => a + b, 0), holds: at.cap, days: m3 > 0 ? input.ix.planetTypes[t].pins.launchpad.capacity / m3 : null };
}
/** How many characters the fill count may spread its feeders over: more than any planet's share of one factory planet's needs. */
const FILL_CHARS = 12;

/**
 * A factory character (the user, 25 October 2026: "What if I used my main as a factory only character … and then have all my alts now and in
 * the future produce materials which I then contract to my main and dump them into factory planets"): the character shown makes the good
 * on factory planets of its own, as many as the run needs, and every character doing planetary industry feeds them from its colonies, the
 * factory character's other planets too, each at its own Command Center Upgrades level and planets. Plan it only (held to a P2 or P3 good),
 * with two such characters or more. Searched as `searchTeam` searches; a step at a time.
 */
export function* planTeamSteps(given: PlanInput, meter?: TeamMeter): Steps<Setup> {
  const prep = yield* teamPrepSteps(given);
  if ('kind' in prep) return prep;
  const { input, tree, rec, team, groups, members, sites, memo, shown } = prep;
  const { ix } = input;
  const optsAt = (cc: number) => memo.get(cc)!;
  const budget: TeamBudget = { left: input.budget ?? TEAM_BUDGET, cut: false };
  if (meter) { meter.budget = budget; meter.of = budget.left; }
  const found = yield* searchTeam({ rec, groups, sites, planets: input.planets.length }, budget);
  if (!found) return blocked(input, 'team', budget.cut ? RAN_OUT : `No arrangement of your characters’ colonies here can feed a factory planet making ${goodName(ix, tree.x)}`, []);
  // The fill count, at the level most of the feeding characters are at (the factory character's with none).
  const levels = team.slice(1).map((m) => m.cc);
  const cc = levels.length ? [...new Set(levels)].sort((a, b) => levels.filter((x) => x === b).length - levels.filter((x) => x === a).length || b - a)[0] : team[0].cc;
  if (!memo.has(cc)) memo.set(cc, yield* optionsAt(input, tree, rec, cc, shown));
  const fill = yield* fillOf(input, rec, sites, optsAt(cc));
  const { colonies, factories } = realised(input, groups, members, sites, found.sol);
  return teamSetup(input, tree, rec, team, colonies, factories, found.key.R, { found, fill, cut: found.cut });
}

/**
 * How far a factory character's search has got, for the page's progress (planets-flow.md): the budget it spends from, and what it began
 * with. Read only: the search runs as it would without it. The search can end before its budget does (every arrangement ruled out).
 */
export type TeamMeter = { budget?: TeamBudget; of?: number };

/** A factory character's problem, built as `planTeamSteps` builds it, or the setup saying why there's none (`blocked`). */
type TeamPrep = { input: PlanInput; tree: Tree; rec: TeamRecipe; team: Member[]; groups: Grp[]; members: Member[][]; sites: TeamSite[]; memo: Map<number, Opt[]>; shown: Seller };
function* teamPrepSteps(given: PlanInput): Generator<void, TeamPrep | Setup, void> {
  const input = heldInput(given);
  const { char, ix } = input;
  const cw = charWhy(char);
  if (input.only == null) return blocked(input, 'team', NO_ONLY, []);
  if (cw) return blocked(input, 'team', cw, char.alpha === true ? ['Omega'] : []);
  if (!input.planets.some((p) => p.type)) return blocked(input, 'team', NO_PI_HERE, []);
  const shown = seller(input.sell);
  const ow = onlyWhy(input, 'team', shown);
  if (ow) return blocked(input, 'team', ow, []);
  const team = teamOf(input);
  if (team.length < 2) {
    const s = blocked(input, 'team', teamTooFew(team.length), []);
    const alphas = input.others.filter((c, i, a) => c.alpha === true && c.charId !== char.charId && a.findIndex((o) => o.charId === c.charId) === i).slice(0, 1);
    s.perChar = [...team.map((m) => ({ charId: m.c.charId, iskDay: null, lacks: [] as string[] })), ...alphas.map((c) => ({ charId: c.charId, iskDay: null, lacks: ['Omega'] }))];
    return s;
  }
  const tree = treeOf(ix, input.only);
  if (!tree || tree.facility !== 'advanced' || tree.p3.size) return blocked(input, 'team', `Can’t make ${goodName(ix, input.only)} on factory planets of Advanced factories`, []);
  const rec = recipeOf(tree);
  // Each level's plans, a planet a step.
  const memo = new Map<number, Opt[]>();
  for (const cc of [...new Set(team.map((m) => m.cc))]) memo.set(cc, yield* optionsAt(input, tree, rec, cc, shown));
  const { groups, members } = groupsOf(team, (cc: number) => memo.get(cc)!);
  const sites = sitesOf(input, tree, team[0]);
  if (!sites.length) return blocked(input, 'team', `No planet here holds a factory of ${goodName(ix, tree.x)}’s at ${char.name}’s level`, []);
  return { input, tree, rec, team, groups, members, sites, memo, shown };
}

/**
 * What no factory character arrangement here can beat (planets-flow.md, Find's screen): the linear programme `searchTeam` solves first, its
 * factory planets free (`TeamFound.boundR`), on the same problem `planTeamSteps` builds; null with why when the team can't be planned here
 * at all (`blocked`'s reason) or nothing can feed a factory planet. One programme, after the plans each level runs on each planet.
 */
export function* teamBoundSteps(given: PlanInput): Generator<void, { bound: number } | { why: string }, void> {
  const prep = yield* teamPrepSteps(given);
  if ('kind' in prep) return { why: prep.why ?? 'No factory character can be planned here' };
  const { input, tree, rec, groups, sites } = prep;
  const bound = rootBound({ rec, groups, sites, planets: input.planets.length });
  yield;
  return bound == null ? { why: `No arrangement of your characters’ colonies here can feed a factory planet making ${goodName(input.ix, tree.x)}` } : { bound };
}

/**
 * A kept factory character plan on today's inputs (planner fix 2): each colony with the character it was kept for, on the plan kept, the
 * factory planets with their factories as kept, the good a day what those make of today's shipments (`keptRate`).
 */
export function keptTeam(input: PlanInput, kept: KeptPlan): Setup {
  const { ix, char } = input;
  const x = input.only;
  const tree = x == null ? null : treeOf(ix, x);
  if (!tree || tree.facility !== 'advanced' || tree.p3.size) return withKept(blocked(input, 'team', KEPT_NOT_HERE, []), kept, []);
  const rec = recipeOf(tree);
  const pool = [char, ...input.others];
  const ids = [...new Set(kept.planets.map((p) => p.charId))].sort((a, b) => (a === char.charId ? -1 : b === char.charId ? 1 : 0));
  const team: Member[] = [];
  for (const id of ids) {
    const c = pool.find((q) => q.charId === id);
    const why = c ? charWhy(c) : 'not among your characters now';
    if (!c || why) return withKept(blocked(input, 'team', `${c?.name ?? 'A character of this plan'} can’t run its part: ${low(why!)}`, []), kept, []);
    team.push({ c, cc: c.ccLevel!, cap: c.planets! });
  }
  const factoryOwner = kept.planets.find((p) => p.does === 'factory')?.charId;
  if (factoryOwner == null || team[0].c.charId !== factoryOwner) return withKept(blocked(input, 'team', `This plan’s factory planets are another character’s: show it for ${pool.find((q) => q.charId === factoryOwner)?.name ?? 'that character'}`, []), kept, []);
  const colonies: Colonied[] = [];
  const factories: FactoryAt[] = [];
  for (const kp of kept.planets) {
    const at = input.planets.findIndex((p) => p.planetId === kp.planetId);
    const planet = at < 0 ? null : input.planets[at];
    const m = team.find((w) => w.c.charId === kp.charId)!;
    if (!planet?.type) return withKept(blocked(input, 'team', KEPT_NOT_HERE, []), kept, []);
    if (kp.does === 'factory') {
      const holds = planet.radiusKm != null && planet.radiusKm > 0 ? maxFactories(ix, planet.type, m.cc, 'advanced', 1, planet.radiusKm) : 0;
      factories.push({ at, planet, holds: Math.max(holds, kp.makes.reduce((n, y) => n + y.count, 0)), fixed: new Map(kp.makes.map((y) => [y.id, y.count])) });
      continue;
    }
    const plan = keptPlanOf(input, planet, at, kp, fitFor(planet, m.cc)[0] ?? null);
    if (!plan) return withKept(blocked(input, 'team', KEPT_NOT_HERE, []), kept, []);
    colonies.push({ m, at, planet, plan });
  }
  if (!factories.length) return withKept(blocked(input, 'team', KEPT_NOT_HERE, []), kept, []);
  const S = new Float64Array(rec.goods.length);
  for (const c of colonies) for (const sh of c.plan.ships) { const g = rec.goods.indexOf(sh.id); if (g >= 0) S[g] += sh.perDay; }
  const n = (id: number) => factories.reduce((t, f) => t + (f.fixed?.get(id) ?? 0), 0);
  let R = Math.min(supplyRate(rec, S), n(tree.x) * rec.xDay);
  rec.p2.forEach((t) => { R = Math.min(R, (S[t.g] + n(rec.goods[t.g]) * t.day) / t.beta); });
  if (!(R > MIN_RATE) || !Number.isFinite(R)) return withKept(blocked(input, 'team', `Your kept planets don’t ship every P1 ${goodName(ix, tree.x)} takes`, []), kept, []);
  return withKept(teamSetup(input, tree, rec, team, colonies, factories, R, {}), kept, keptNotes(kept, team.map((w) => w.c)));
}
