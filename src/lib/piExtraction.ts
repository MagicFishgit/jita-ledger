/**
 * An extractor programme's output: CCP's formula (the developer guide's Kotlin and worked example) and the two readings
 * of ESI's qty_per_cycle. Pure: the Worker may import it.
 */
/** [longest programme in hours, cycle seconds]: reported, EVE University. */
export const CYCLE_BANDS: [maxProgramHours: number, cycleSeconds: number][] = [[25, 900], [50, 1800], [100, 3600], [200, 7200], [336, 14400]];

/** Each cycle's output. Math.floor on doubles matches CCP's example (eve-pi's "always take one off" is a unit short). */
export function cycleOutputs(qtyPerCycle: number, cycleSeconds: number, cycles: number, decay = 0.012, noise = 0.8): number[] {
  const barWidth = cycleSeconds / 900;
  const q = Math.pow(qtyPerCycle, 0.7);
  const out: number[] = [];
  for (let i = 0; i < cycles; i++) {
    const t = (i + 0.5) * barWidth;
    const wave = Math.max(0, (Math.cos(q + t / 12) + Math.cos(q / 2 + t / 5) + Math.cos(t / 2)) / 3);
    out.push(Math.floor(barWidth * (qtyPerCycle / (1 + t * decay)) * (1 + noise * wave)));
  }
  return out;
}

export type Program = { qtyPerCycle: number; cycleSeconds: number; install: number; expiry: number };
export type Readings = { formula: { total: number; perHour: number }; perCycle: { total: number; perHour: number }; hours: number };

/** Null when the programme isn't known (a missing or reversed time, no quantity or cycle): never 0 or NaN for not known. */
export function readings(p: Program): Readings | null {
  if (!Number.isFinite(p.install) || !Number.isFinite(p.expiry) || p.expiry <= p.install) return null;
  if (!Number.isFinite(p.qtyPerCycle) || !(p.qtyPerCycle > 0) || !(p.cycleSeconds > 0)) return null;
  const hours = (p.expiry - p.install) / 3600e3;
  const cycles = Math.floor((p.expiry - p.install) / 1000 / p.cycleSeconds);
  const formulaTotal = cycleOutputs(p.qtyPerCycle, p.cycleSeconds, cycles).reduce((a, b) => a + b, 0);
  const cycleTotal = p.qtyPerCycle * cycles;
  return { formula: { total: formulaTotal, perHour: formulaTotal / hours }, perCycle: { total: cycleTotal, perHour: cycleTotal / hours }, hours };
}

/** The lower of the two readings' rates, the one to plan on. */
export function lowerReading(r: Readings): { perHour: number; which: 'formula' | 'perCycle' } {
  return r.perCycle.perHour < r.formula.perHour ? { perHour: r.perCycle.perHour, which: 'perCycle' } : { perHour: r.formula.perHour, which: 'formula' };
}
