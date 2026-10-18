/**
 * What the planet gives, learned from the user's own kept colonies, and the order rates are taken in. Pure.
 */
import type { PlanetType } from './pi';
import type { KeptColony } from './colonies';
import type { PiIndex } from './piBundle';
import { readings } from './piExtraction';
import type { TypedRate } from './planetsDoc';

export type Learned = {
  perHour: number; higher: number | null; which: 'formula' | 'perCycle'; programHours: number; heads: number;
  extractors: number; systems: number[]; checked: boolean;
};
export type Rate = { perHour: number; higher: number | null; from: 'learned' | 'typed'; programHours: number; heads: number; otherP0: boolean; checked: boolean };

/** Set by the in-game check (Task 13): which reading of ESI's qty_per_cycle is right. Null until then. */
export const PI_READING: 'formula' | 'perCycle' | null = null;
/** How a rate or a programme's total is said until that check: the Plan section's learned rates and the Colonies panel's programmes alike. */
export const PI_UNCHECKED = 'not yet checked against the game’s total';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Acc = { formula: number[]; perCycle: number[]; hours: number[]; heads: number[]; systems: Set<number> };

/** Each extractor's per hour over its whole programme (ended ones too), by planet type and product P0. */
export function learnedRates(cols: { colonies: KeptColony[] }[], ix: PiIndex, checked: 'formula' | 'perCycle' | null): Partial<Record<PlanetType, Record<string, Learned>>> {
  const acc = new Map<string, { t: PlanetType; p0: number; a: Acc }>();
  for (const col of cols) for (const c of col.colonies) {
    if (!c.planetType) continue;
    for (const pin of c.pins) {
      const e = pin.extractor;
      if (!e || e.product == null || e.qty == null || !(e.qty > 0)) continue;
      const prod = ix.byId.get(e.product);
      if (prod && prod.tier !== 'P0') continue;
      const r = readings({ qtyPerCycle: e.qty, cycleSeconds: e.cycle, install: pin.install ? Date.parse(pin.install) : NaN, expiry: pin.expiry ? Date.parse(pin.expiry) : NaN });
      if (!r) continue;
      const key = `${c.planetType}:${e.product}`;
      let x = acc.get(key);
      if (!x) acc.set(key, x = { t: c.planetType, p0: e.product, a: { formula: [], perCycle: [], hours: [], heads: [], systems: new Set() } });
      x.a.formula.push(r.formula.perHour); x.a.perCycle.push(r.perCycle.perHour);
      x.a.hours.push(r.hours); x.a.heads.push(e.heads); x.a.systems.add(c.systemId);
    }
  }
  const out: Partial<Record<PlanetType, Record<string, Learned>>> = {};
  for (const { t, p0, a } of acc.values()) {
    const f = mean(a.formula), p = mean(a.perCycle);
    let perHour: number, higher: number | null, which: 'formula' | 'perCycle';
    if (checked) { which = checked; perHour = checked === 'formula' ? f : p; higher = null; }
    else if (p < f) { which = 'perCycle'; perHour = p; higher = f; }
    else { which = 'formula'; perHour = f; higher = p; }
    (out[t] ??= {})[String(p0)] = {
      perHour, higher, which, programHours: median(a.hours), heads: median(a.heads), extractors: a.hours.length,
      systems: [...a.systems].sort((x, y) => x - y), checked: checked != null,
    };
  }
  return out;
}

/** Learned for that P0, then typed, then learned for another P0 of the planet type (the best-seen one, marked). */
export function rateFor(learned: Partial<Record<PlanetType, Record<string, Learned>>>, typed: TypedRate | undefined, t: PlanetType, p0: number): Rate | null {
  const of = (l: Learned, otherP0: boolean): Rate => ({ perHour: l.perHour, higher: l.higher, from: 'learned', programHours: l.programHours, heads: l.heads, otherP0, checked: l.checked });
  const mine = learned[t]?.[String(p0)];
  if (mine) return of(mine, false);
  if (typed) return { perHour: typed.perHour, higher: null, from: 'typed', programHours: typed.programHours, heads: typed.heads, otherP0: false, checked: false };
  const others = Object.entries(learned[t] ?? {}).sort((a, b) => b[1].extractors - a[1].extractors || Number(a[0]) - Number(b[0]));
  return others.length ? of(others[0][1], true) : null;
}
