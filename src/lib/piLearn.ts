/**
 * What the planet gives, learned from the user's own kept colonies, and the order rates are taken in. Pure.
 */
import type { PlanetType } from './pi';
import type { KeptColony } from './colonies';
import type { PiIndex } from './piBundle';
import { readings } from './piExtraction';
import { MAX_RECORDED_PLANETS, type PlanetsDoc, type RecordedRate, type TypedRate } from './planetsDoc';

/**
 * `before`: from the learned rates' record, not any colony kept now (planner fix 2), with when it was last learned: the colony that
 * taught it was torn down or rebuilt, and nothing has shown that rate since.
 */
export type Learned = {
  perHour: number; higher: number | null; which: 'formula' | 'perCycle'; programHours: number; heads: number;
  extractors: number; systems: number[]; checked: boolean; before?: string;
  /**
   * A planet's own reading only (ruling F18): its per-head yield over the other planets' of its type and P0 (equal weight a planet). Null
   * when it is the only one learned or its readings say no heads: then the type's rate stands.
   */
  factor?: number | null;
};
export type LearnedMap = Partial<Record<PlanetType, Record<string, Learned>>>;
/** What each planet itself gave (planet rates): by the planet's ID as a string, then the P0's type ID. The type's rate stays the average of them. */
export type OwnLearned = Record<string, Record<string, Learned>>;
/**
 * A rate as the planner takes it. `otherP0`: learned for another P0 of the planet type; `otherType`: this P0 learned on another planet
 * type (planner fix 1), named, since its richness is another planet's.
 */
export type Rate = { perHour: number; higher: number | null; from: 'learned' | 'typed'; programHours: number; heads: number; otherP0: boolean; checked: boolean; otherType?: PlanetType; before?: string;
  /** Learned on this planet (ruling F18): the type's rate times `factor`, this planet's per-head yield over the other planets'. */
  own?: true; factor?: number;
  /** A planet's own readings say no heads, so it has no factor and the type's rate stands (said). */
  headsUnknown?: true };

/**
 * Which reading of ESI's qty_per_cycle is right, settled by the in-game check (Task 13, 19 October 2026): CCP's formula. The main's
 * 5-NZNW IV Noble Metals extractor (5 heads, qty_per_cycle 10,196, 1-hour cycles, 73 h from 17 October 14:03 UTC) read "Total:
 * 1,473,445" and "Avg. Per hour: 20,184" in game; the formula gives 1,473,446 (20,184.2 an hour), the figure a cycle 744,308.
 */
export const PI_READING: 'formula' | 'perCycle' | null = 'formula';
/** How a rate or a programme's total is said until that check: the Plan section's learned rates and the Colonies panel's programmes alike. */
export const PI_UNCHECKED = 'not yet checked against the game’s total';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Acc = { formula: number[]; perCycle: number[]; hours: number[]; heads: number[]; systems: Set<number> };

/** Each extractor's per hour over its whole programme (ended ones too), by planet type and product P0. */
export function learnedRates(cols: { colonies: KeptColony[] }[], ix: PiIndex, checked: 'formula' | 'perCycle' | null): LearnedMap {
  const out: LearnedMap = {};
  for (const { group, p0, l } of foldRates(cols, ix, checked, (c) => c.planetType)) (out[group as PlanetType] ??= {})[String(p0)] = l;
  return out;
}

/** The same reading, rules and medians for each planet on its own (planet rates), by planet ID and product P0. */
export function learnedPlanetRates(cols: { colonies: KeptColony[] }[], ix: PiIndex, checked: 'formula' | 'perCycle' | null): OwnLearned {
  const out: OwnLearned = {};
  const folded = foldRates(cols, ix, checked, (c) => String(c.planetId));
  // Per head, against the other planets of the type and P0 (ruling F18).
  const perHead = (l: Learned) => (l.heads > 0 ? l.perHour / l.heads : null);
  for (const { group, p0, l, pt } of folded) {
    const others = folded.filter((x) => x.p0 === p0 && x.pt === pt && x.group !== group).map((x) => perHead(x.l)).filter((h): h is number => h != null);
    const mine = perHead(l);
    (out[group] ??= {})[String(p0)] = { ...l, factor: mine != null && others.length ? mine / mean(others) : null };
  }
  return out;
}

function foldRates(cols: { colonies: KeptColony[] }[], ix: PiIndex, checked: 'formula' | 'perCycle' | null, groupOf: (c: KeptColony) => string | null): { group: string; p0: number; l: Learned; pt: PlanetType }[] {
  const acc = new Map<string, { t: string; pt: PlanetType; p0: number; a: Acc }>();
  for (const col of cols) for (const c of col.colonies) {
    if (!c.planetType) continue;
    const g = groupOf(c);
    if (g == null) continue;
    for (const pin of c.pins) {
      const e = pin.extractor;
      if (!e || e.product == null || e.qty == null || !(e.qty > 0)) continue;
      const prod = ix.byId.get(e.product);
      if (prod && prod.tier !== 'P0') continue;
      const r = readings({ qtyPerCycle: e.qty, cycleSeconds: e.cycle, install: pin.install ? Date.parse(pin.install) : NaN, expiry: pin.expiry ? Date.parse(pin.expiry) : NaN });
      if (!r) continue;
      const key = `${g}:${e.product}`;
      let x = acc.get(key);
      if (!x) acc.set(key, x = { t: g, pt: c.planetType, p0: e.product, a: { formula: [], perCycle: [], hours: [], heads: [], systems: new Set() } });
      x.a.formula.push(r.formula.perHour); x.a.perCycle.push(r.perCycle.perHour);
      x.a.hours.push(r.hours); x.a.heads.push(e.heads); x.a.systems.add(c.systemId);
    }
  }
  const out: { group: string; p0: number; l: Learned; pt: PlanetType }[] = [];
  for (const { t, pt, p0, a } of acc.values()) {
    const f = mean(a.formula), p = mean(a.perCycle);
    let perHour: number, higher: number | null, which: 'formula' | 'perCycle';
    if (checked) { which = checked; perHour = checked === 'formula' ? f : p; higher = null; }
    else if (p < f) { which = 'perCycle'; perHour = p; higher = f; }
    else { which = 'formula'; perHour = f; higher = p; }
    // Heads over the extractors that said how many: 0 is a colony that didn't say (Ruling T8-1), and a median taking it in made up
    // a count no extractor had ([0, 10] read 5, the final review). None said: 0, not known, as one extractor's would be.
    const said = a.heads.filter((h) => h > 0);
    out.push({ group: t, p0, pt, l: {
      perHour, higher, which, programHours: median(a.hours), heads: said.length ? median(said) : 0, extractors: a.hours.length,
      systems: [...a.systems].sort((x, y) => x - y), checked: checked != null,
    } });
  }
  return out;
}

/**
 * The heads a line whose heads aren't known (no rate, or a rate whose extractors didn't say) is fitted at (Ruling T15b-5): the
 * median of the learned rates' heads, over every rate that said how many, rounded up to a whole head, so an assumed rate sits on a
 * head count your own extractors run, never one or two squeezed in beside the factories. Null with none: then the most that fit
 * (Ruling T8-1).
 */
export function assumedHeads(learned: LearnedMap): number | null {
  const hs = Object.values(learned).flatMap((byP0) => Object.values(byP0 ?? {}).map((l) => l.heads)).filter((h) => h > 0);
  return hs.length ? Math.ceil(median(hs)) : null;
}

/**
 * Learned for that P0, then typed, then that P0 learned on another planet type, then learned for another P0 of the planet type (the
 * best-seen one each: most extractors, then the type or P0 first in order), marked. The P0 on another type before another P0 on this one
 * (planner fix 1): the user's Aqueous Liquids, learned on Gas at 16,919 an hour, was taken on Barren at Noble Metals' 19,062, a figure
 * no Aqueous Liquids extractor of theirs had shown, and it decided which planet made Water.
 *
 * Planner fix 2: `learned` carries the record too (`withRecorded`), each recorded rate marked `before`. Within each step a rate a colony
 * shows now comes first and the record after it ("learned before"): a rate learned now, then typed, then recorded, then on another type
 * (now, then recorded), then another P0 (now, then recorded). Typed comes before the record, so a rate whose colony was torn down can be
 * typed over (a rate a colony shows now can't: the Inputs panel offers no box for it).
 */
export function rateFor(learned: LearnedMap, typed: TypedRate | undefined, t: PlanetType, p0: number, planetId?: number, own?: OwnLearned): Rate | null {
  const of = (l: Learned, otherP0: boolean, otherType?: PlanetType): Rate => ({ perHour: l.perHour, higher: l.higher, from: 'learned', programHours: l.programHours, heads: l.heads, otherP0, checked: l.checked, ...(otherType ? { otherType } : {}), ...(l.before ? { before: l.before } : {}) });
  const mine = learned[t]?.[String(p0)];
  // Planet rates (ruling F18): this planet's own reading, a colony's now or the record's, speaks as its richness per head: the type's rate
  // times its factor, at the type's heads, so nothing is scaled by heads and the heads rules stand. It comes before a typed rate. Alone
  // of its type it has no factor and the type's rate (its own) stands; readings with no heads give none either, and are said.
  const self = planetId != null ? own?.[String(planetId)]?.[String(p0)] : undefined;
  if (self && mine && self.factor != null && self.factor > 0) {
    // The planet's own per-head yield at the type's heads, never the type's rate times the factor: the type's rate already averages this
    // planet in, and the factor is against the OTHER planets only, so that would count it twice. The factor is for the words.
    const f = self.factor, at = mine.heads > 0 ? mine.heads : self.heads, k = at / self.heads;
    const r: Rate = { ...of(mine, false), perHour: self.perHour * k, higher: self.higher == null ? null : self.higher * k, own: true, factor: f };
    if (self.before) r.before = self.before; else delete r.before;
    return r;
  }
  if (self && !(self.heads > 0) && own && (Object.entries(own).some(([id, by]) => id !== String(planetId) && by[String(p0)]))) {
    const base = rateFor(learned, typed, t, p0);
    return base ? { ...base, headsUnknown: true } : null;
  }
  if (mine && !mine.before) return of(mine, false);
  if (typed) return { perHour: typed.perHour, higher: null, from: 'typed', programHours: typed.programHours, heads: typed.heads, otherP0: false, checked: false };
  if (mine) return of(mine, false);
  // Now before the record, then the most extractors, then in order.
  const nowFirst = (a: Learned, b: Learned) => (a.before ? 1 : 0) - (b.before ? 1 : 0) || b.extractors - a.extractors;
  const types = (Object.entries(learned) as [PlanetType, Record<string, Learned> | undefined][])
    .filter(([u, by]) => u !== t && by?.[String(p0)]).sort((a, b) => nowFirst(a[1]![String(p0)], b[1]![String(p0)]) || a[0].localeCompare(b[0]));
  if (types.length) return of(types[0][1]![String(p0)], false, types[0][0]);
  const others = Object.entries(learned[t] ?? {}).sort((a, b) => nowFirst(a[1], b[1]) || Number(a[0]) - Number(b[0]));
  return others.length ? of(others[0][1], true) : null;
}

/** Two figures the same within rounding: a mean of the same programmes in another order differs in its last bits. */
const near = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));
const sameRate = (l: Learned, r: RecordedRate) => near(l.factor ?? null, r.factor ?? null) && near(l.perHour, r.perHour) && near(l.higher, r.higher) && near(l.programHours, r.programHours)
  && near(l.heads, r.heads) && l.extractors === r.extractors && l.systems.length === r.systems.length && l.systems.every((x, i) => x === r.systems[i]);

/**
 * The learned rates' record after a read (planner fix 2): every rate a colony shows now, as it shows it, stamped `at` when it changed (or
 * first came), and every rate recorded before that no colony shows now, as it was. A colony torn down never drops its rate: the user
 * rebuilt their colonies to the plan, each rebuild moved the rates, and the plan moved with them (planner-bugs-report.md, Bug 2, cause
 * 1). A rate unchanged keeps its entry and its `at`, so a read that changes nothing gives a record equal to the one held.
 */
export function recordOf(live: LearnedMap, record: PlanetsDoc['learned'], at: string): PlanetsDoc['learned'] {
  const out: PlanetsDoc['learned'] = {};
  for (const [t, byP0] of Object.entries(record) as [PlanetType, Record<string, RecordedRate> | undefined][]) if (byP0) out[t] = { ...byP0 };
  for (const [t, byP0] of Object.entries(live) as [PlanetType, Record<string, Learned> | undefined][]) {
    for (const [id, l] of Object.entries(byP0 ?? {})) {
      if (l.before) continue;
      const held = record[t]?.[id];
      if (held && sameRate(l, held)) continue;
      (out[t] ??= {})[id] = { perHour: l.perHour, higher: l.higher, programHours: l.programHours, heads: l.heads, extractors: l.extractors, systems: [...l.systems], at };
    }
  }
  return out;
}

/**
 * The rates the planner reads (planner fix 2): what the colonies show now, and for a planet type and P0 none shows, the record's, marked
 * `before` with when it was last learned. A rate shown now is the colonies' own, never the record's: the two agree after the record is
 * written, and stamping one with the record's time would change the rates the planner reads when nothing else did.
 */
export function withRecorded(live: LearnedMap, record: PlanetsDoc['learned'], checked: 'formula' | 'perCycle' | null): LearnedMap {
  const out: LearnedMap = {};
  for (const [t, byP0] of Object.entries(live) as [PlanetType, Record<string, Learned> | undefined][]) if (byP0) out[t] = { ...byP0 };
  for (const [t, byP0] of Object.entries(record) as [PlanetType, Record<string, RecordedRate> | undefined][]) {
    for (const [id, r] of Object.entries(byP0 ?? {})) {
      if (out[t]?.[id]) continue;
      (out[t] ??= {})[id] = {
        perHour: r.perHour, higher: r.higher, which: checked ?? (r.higher != null && r.higher < r.perHour ? 'perCycle' : 'formula'),
        programHours: r.programHours, heads: r.heads, extractors: r.extractors, systems: [...r.systems], checked: checked != null, before: r.at,
      };
    }
  }
  return out;
}

/**
 * A planet's own rate is worth saying when it is this far under the type's average for the same P0 (planet rates; "not too tight"):
 * only past 15% under.
 */
export const OWN_POOR_UNDER = 0.15;
/** The share a head of this planet gives of the other planets' of its type, when past `OWN_POOR_UNDER` under; else null. */
export function poorShare(r: Rate | null | undefined): number | null {
  if (!r?.own || r.factor == null) return null;
  return r.factor < 1 - OWN_POOR_UNDER ? r.factor : null;
}

/** The planets' own rates after a read, as `recordOf` is the types': every one a colony shows now, and every one recorded before that none shows. */
export function recordOwnOf(live: OwnLearned, record: PlanetsDoc['planetLearned'], at: string): PlanetsDoc['planetLearned'] {
  const out: PlanetsDoc['planetLearned'] = {};
  for (const [id, byP0] of Object.entries(record)) out[id] = { ...byP0 };
  for (const [id, byP0] of Object.entries(live)) {
    for (const [p0, l] of Object.entries(byP0)) {
      const held = record[id]?.[p0];
      if (held && sameRate(l, held)) continue;
      if (!out[id] && Object.keys(out).length >= MAX_RECORDED_PLANETS) continue;
      (out[id] ??= {})[p0] = { perHour: l.perHour, higher: l.higher, programHours: l.programHours, heads: l.heads, extractors: l.extractors, systems: [...l.systems], at, ...(l.factor != null ? { factor: l.factor } : {}) };
    }
  }
  return out;
}

/** The planets' own rates the planner reads: what the colonies show now, and the record's for a planet and P0 none shows, marked `before`. */
export function withRecordedOwn(live: OwnLearned, record: PlanetsDoc['planetLearned'], checked: 'formula' | 'perCycle' | null): OwnLearned {
  const out: OwnLearned = {};
  for (const [id, byP0] of Object.entries(live)) out[id] = { ...byP0 };
  for (const [id, byP0] of Object.entries(record)) {
    for (const [p0, r] of Object.entries(byP0)) {
      if (out[id]?.[p0]) continue;
      (out[id] ??= {})[p0] = {
        perHour: r.perHour, higher: r.higher, which: checked ?? (r.higher != null && r.higher < r.perHour ? 'perCycle' : 'formula'),
        programHours: r.programHours, heads: r.heads, extractors: r.extractors, systems: [...r.systems], checked: checked != null, before: r.at, factor: r.factor ?? null,
      };
    }
  }
  return out;
}

/**
 * What tells a planet's own learned rates from another's, for `PlanInput.planetKey`: the P0s, rates and heads it has, or '' for a planet
 * with none (planets alike in type and customs rate stay one class to the feed and the chain).
 */
export function planetKeyOf(own: OwnLearned): (planetId: number) => string {
  return (planetId) => {
    const by = own[String(planetId)];
    // By factor (ruling F18): planets alike in it, or with none, stay one class.
    return by ? Object.entries(by).filter(([, l]) => l.factor != null).sort((a, b) => Number(a[0]) - Number(b[0])).map(([p0, l]) => `${p0}@${Math.round(l.factor! * 1000)}`).join(',') : '';
  };
}
