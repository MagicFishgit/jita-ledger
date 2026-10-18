/**
 * A small linear programme solved exactly (the Planets upgrade, Ruling T11-11: a bought setup's planets sized together). Maximise
 * `c·x` over `0 ≤ x ≤ hi` (`hi` may be Infinity), subject to rows `a·x ≤ b` or `a·x = b`.
 *
 * **All amounts at zero must be feasible**: every `≤` row's `b` at least 0, every `=` row's `b` 0 (the planner's always are: nothing
 * made, sold or bought is a setup that does nothing). So there is no first phase: the start is `x = 0`, each `≤` row's slack (from 0
 * up) or each `=` row's artificial (held at [0, 0], so the row holds exactly) in the basis. A row that breaks this throws.
 *
 * A bounded-variable primal simplex on a dense tableau: a variable outside the basis sits at 0 or at its upper bound, and the ratio
 * test also weighs the entering variable reaching its own bound (a bound flip, with no pivot). The entering variable is the one whose
 * reduced cost improves most (Dantzig), ties to the lowest index; the leaving one the first to reach a bound, ties to the lowest index.
 * **Anti-cycling**: after `DEGENERATE_RUN` pivots in a row that move nothing, both choices go by Bland's rule (the lowest index among
 * those that improve; the lowest index among the tied leaving) until a pivot moves something. Bland's rule can't cycle, and a pivot
 * that moves raises the objective, so no basis comes back and the method ends.
 *
 * **Tolerances** (`TOL`), relative to the problem's own sizes, since a price can be 1e6 and an amount 1e5: a reduced cost improves past
 * `TOL.cost` × the largest |c|; a pivot element counts past `TOL.pivot` × its column's largest; a step under `TOL.step` × the largest
 * bound or right-hand side moves nothing. At the end the basic values and reduced costs are worked out again from the tableau, and the
 * search goes on if that shows a reduced cost still improving (drift), at most `REFRESHES` times.
 *
 * Pure: no config, store, React or DOM; no enums or parameter properties (the Worker's type stripping).
 */

export type LpRow = { a: readonly number[]; b: number; eq?: boolean };
export type Lp = { c: readonly number[]; hi: readonly number[]; rows: readonly LpRow[] };
/** 'auto' (the default): Dantzig, then Bland's rule through a degenerate run. 'dantzig' and 'bland' alone are for the tests. */
export type LpRule = 'auto' | 'dantzig' | 'bland';
/** 'stalled': the pivot cap was reached (a cycle, under 'dantzig' alone); `x` is where it stood, feasible. */
export type LpResult = { status: 'optimal' | 'unbounded' | 'stalled'; x: number[]; value: number; pivots: number };

export const TOL = { cost: 1e-11, pivot: 1e-9, step: 1e-12 } as const;
/** Pivots in a row that move nothing before Bland's rule takes over. */
export const DEGENERATE_RUN = 8;
const REFRESHES = 3;

export function maximise(lp: Lp, o: { rule?: LpRule; maxPivots?: number } = {}): LpResult {
  const rule = o.rule ?? 'auto';
  const n = lp.c.length, m = lp.rows.length, N = n + m;
  const maxPivots = o.maxPivots ?? 50 * (N + 10);
  const hi = new Float64Array(N);
  const cost = new Float64Array(N);
  for (let j = 0; j < n; j++) {
    hi[j] = lp.hi[j];
    cost[j] = lp.c[j];
    if (!(hi[j] >= 0)) throw new Error(`lp: variable ${j}'s upper bound ${lp.hi[j]} is under 0`);
  }
  let bScale = 1;
  for (let i = 0; i < m; i++) {
    const r = lp.rows[i];
    if (r.a.length !== n) throw new Error(`lp: row ${i} has ${r.a.length} coefficients for ${n} variables`);
    if (r.eq ? r.b !== 0 : !(r.b >= 0)) throw new Error(`lp: row ${i} isn't met at zero (b ${r.b}${r.eq ? ', an equality' : ''})`);
    hi[n + i] = r.eq ? 0 : Infinity;
    bScale = Math.max(bScale, Math.abs(r.b));
  }
  for (let j = 0; j < n; j++) if (Number.isFinite(hi[j])) bScale = Math.max(bScale, hi[j]);
  let cScale = 1;
  for (let j = 0; j < n; j++) cScale = Math.max(cScale, Math.abs(cost[j]));
  const dTol = TOL.cost * cScale, stepTol = TOL.step * bScale;

  // T = B⁻¹[A | I], row-major; the basis starts as the slacks and artificials.
  const T = new Float64Array(m * N);
  const basis = new Int32Array(m);
  const xB = new Float64Array(m);
  const rowOf = new Int32Array(N).fill(-1);
  const upper = new Uint8Array(N);
  for (let i = 0; i < m; i++) {
    const a = lp.rows[i].a;
    for (let j = 0; j < n; j++) T[i * N + j] = a[j];
    T[i * N + n + i] = 1;
    basis[i] = n + i; rowOf[n + i] = i;
    xB[i] = lp.rows[i].b;
  }
  const d = new Float64Array(N);
  for (let j = 0; j < n; j++) d[j] = cost[j];
  const valueOf = (j: number) => (rowOf[j] >= 0 ? xB[rowOf[j]] : upper[j] ? hi[j] : 0);

  let pivots = 0, run = 0, refreshes = 0;
  const result = (status: LpResult['status']): LpResult => {
    const x: number[] = [];
    let value = 0;
    for (let j = 0; j < n; j++) { const v = Math.min(hi[j], Math.max(0, valueOf(j))); x.push(v); value += cost[j] * v; }
    return { status, x, value, pivots };
  };
  // The basic values and reduced costs from the tableau again (B⁻¹ is its last m columns), washing out drift.
  const refresh = () => {
    for (let i = 0; i < m; i++) {
      let v = 0;
      for (let k = 0; k < m; k++) v += T[i * N + n + k] * lp.rows[k].b;
      for (let j = 0; j < N; j++) if (rowOf[j] < 0 && upper[j]) v -= T[i * N + j] * hi[j];
      xB[i] = v;
    }
    for (let j = 0; j < N; j++) {
      if (rowOf[j] >= 0) { d[j] = 0; continue; }
      let v = cost[j];
      for (let i = 0; i < m; i++) v -= cost[basis[i]] * T[i * N + j];
      d[j] = v;
    }
  };

  for (;;) {
    if (pivots >= maxPivots) return result('stalled');
    const bland = rule === 'bland' || (rule === 'auto' && run >= DEGENERATE_RUN);
    // Entering: a variable outside the basis whose move improves (up from 0, or down from its bound); a fixed one never.
    let e = -1, best = 0;
    for (let j = 0; j < N; j++) {
      if (rowOf[j] >= 0 || !(hi[j] > 0)) continue;
      const gain = upper[j] ? -d[j] : d[j];
      if (!(gain > dTol)) continue;
      if (bland) { e = j; break; }
      if (gain > best) { best = gain; e = j; }
    }
    if (e < 0) {
      if (refreshes++ >= REFRESHES) return result('optimal');
      refresh();
      let more = false;
      for (let j = 0; j < N && !more; j++) if (rowOf[j] < 0 && hi[j] > 0 && (upper[j] ? -d[j] : d[j]) > dTol) more = true;
      if (!more) return result('optimal');
      continue;
    }
    const dir = upper[e] ? -1 : 1;
    // Ratio test: each basic variable moves by −dir·α·θ; the first to reach a bound leaves. The entering one's own bound is a flip,
    // taken on a tie (it moves by its whole range, so it always raises the objective).
    let cm = 0;
    for (let i = 0; i < m; i++) cm = Math.max(cm, Math.abs(T[i * N + e]));
    const pivTol = TOL.pivot * Math.max(1, cm);
    let r = -1, theta = hi[e], toUpper = false;
    for (let i = 0; i < m; i++) {
      const alpha = T[i * N + e];
      if (!(Math.abs(alpha) > pivTol)) continue;
      const move = -dir * alpha;
      const bi = basis[i];
      let t: number, up = false;
      if (move < 0) t = Math.max(0, xB[i]) / -move;
      else if (Number.isFinite(hi[bi])) { t = Math.max(0, hi[bi] - xB[i]) / move; up = true; } else continue;
      // Ties within the step tolerance: the first row found (the lowest), or under Bland's rule the lowest variable index.
      const tie = r >= 0 && Math.abs(t - theta) <= stepTol;
      if (t < theta - stepTol || (tie && bland && bi < basis[r])) { theta = t; r = i; toUpper = up; }
    }
    if (r < 0 && !Number.isFinite(theta)) return result('unbounded');
    // Move: the basic values, the entering variable, the objective's reduced costs stay (no pivot on a flip).
    for (let i = 0; i < m; i++) { const alpha = T[i * N + e]; if (alpha !== 0) xB[i] -= dir * alpha * theta; }
    run = theta > stepTol ? 0 : run + 1;
    if (r < 0) { upper[e] = upper[e] ? 0 : 1; pivots++; continue; }
    const entering = (upper[e] ? hi[e] : 0) + dir * theta;
    const leaving = basis[r];
    // The leaving variable sits at the bound it reached.
    rowOf[leaving] = -1; upper[leaving] = toUpper ? 1 : 0;
    basis[r] = e; rowOf[e] = r; upper[e] = 0; xB[r] = entering;
    const piv = T[r * N + e];
    for (let j = 0; j < N; j++) T[r * N + j] /= piv;
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = T[i * N + e];
      if (f === 0) continue;
      for (let j = 0; j < N; j++) T[i * N + j] -= f * T[r * N + j];
      T[i * N + e] = 0;
    }
    const de = d[e];
    for (let j = 0; j < N; j++) d[j] -= de * T[r * N + j];
    d[e] = 0;
    pivots++;
  }
}
