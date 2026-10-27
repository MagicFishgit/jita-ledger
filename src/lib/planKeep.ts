/**
 * Keep this plan (planner fix 2): a Plan it setup kept in the synced `planets` doc as its layout (`KeptPlan`), what it rested on
 * (`KeptBasis`), and when a newer layout is worth offering beside it, said with what changed. Pure: the Worker may import it (nothing
 * from ./config, the store, React or the DOM). The kept layout is worked out again on today's inputs by piPlan's `planKept`.
 *
 * The user, 24 October 2026: "it would say one planet setup and configuratiion and then if you wait a bit later it completely changes
 * planets and recipies even putting in a temperate planet and then later changing again. this caused me a lot of setup and redo work".
 * They build over hours while the rates move under them (each rebuild changed what their colonies taught the planner), so a plan they set
 * holds its planets, and a better one is offered beside it, never put in its place.
 */
import type { PlanetType } from './pi';
import type { PiIndex } from './piBundle';
import type { Rate } from './piLearn';
import type { PlanChar, PlanPlanet, Setup } from './piPlan';
import type { KeptBasis, KeptPlan, KeptPlanet, KeptRateFrom } from './planetsDoc';

/**
 * How many more units a newer layout must make than the kept plan does today before it's offered: 5%. Under it, a newer layout is a
 * near-tie the rates' noise could reverse next hour (the investigation's ±3% price draws moved a no-rates layout 4 times in 40), and
 * offering it would bring back the moving plan the kept one exists to stop.
 */
export const KEEP_MARGIN = 0.05;
const KINDS = new Set(['p1', 'p2', 'feed', 'chain', 'team']);
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

/** A setup's planets and what each runs, as a kept plan stores them: each extractor's P0, heads and Basics, and the factories beyond. */
export function keptPlanetsOf(s: Pick<Setup, 'roles'>): KeptPlanet[] {
  return s.roles.filter((r) => r.does !== 'unused').map((r) => {
    const basics = r.makes.filter((m) => m.facility === 'basic');
    return {
      planetId: r.planetId, charId: r.charId, does: r.does === 'factory' ? 'factory' : 'extract',
      lines: r.extracts.map((e, i) => ({ p0: e.p0, heads: e.heads, basics: basics[i]?.count ?? 0 })),
      makes: r.makes.filter((m) => m.facility !== 'basic').map((m) => ({ id: m.id, facility: m.facility as 'advanced' | 'hightech', count: m.count })),
    };
  });
}

/** Whether a setup can be kept: a Plan it setup the system's planets run (bought buys its inputs and isn't kept), worked out with a figure. */
export const keepable = (s: Setup): boolean => KINDS.has(s.kind) && s.why == null && !!s.made && s.iskDay != null && s.roles.some((r) => r.does !== 'unused');

/** Where a rate comes from, in a kept plan's words. */
export function rateFrom(r: Rate | null): KeptRateFrom {
  if (!r) return 'none';
  if (r.from === 'typed') return 'typed';
  if (r.otherType) return 'otherType';
  if (r.otherP0) return 'otherP0';
  return r.before ? 'before' : 'learned';
}

/** What a plan rests on now, or rested on when kept: the character shown, their planets and level, the programme length, every P0's rate here. */
export function basisOf(ix: PiIndex, planets: readonly PlanPlanet[], char: PlanChar, rateOf: (t: PlanetType, p0: number, planetId?: number) => Rate | null, programHours: number): KeptBasis {
  const rates: KeptBasis['rates'] = {};
  const planetRates: NonNullable<KeptBasis['planetRates']> = {};
  for (const t of [...new Set(planets.map((p) => p.type).filter((x): x is PlanetType => !!x))].sort()) {
    for (const p0 of ix.planetTypes[t].p0) {
      const r = rateOf(t, p0);
      rates[`${t}:${p0}`] = { from: rateFrom(r), perHour: r ? r.perHour : null };
    }
  }
  // Each planet's own learned rate, where it has one (planet rates): a newer layout can be offered when a planet's own rate shows it poor.
  for (const p of planets) {
    if (!p.type) continue;
    for (const p0 of ix.planetTypes[p.type].p0) {
      const r = rateOf(p.type, p0, p.planetId);
      if (r?.own) planetRates[`${p.planetId}:${p0}`] = { from: rateFrom(r), perHour: r.perHour };
    }
  }
  return { char: char.charId, planets: char.planets, cc: char.ccLevel, programHours, rates, planetRates };
}

/** A setup kept, with what it rests on, at `at`; null for one that can't be kept (`keepable`). */
export function keptOf(s: Setup, basis: KeptBasis, at: string): KeptPlan | null {
  if (!keepable(s)) return null;
  return { kind: s.kind as KeptPlan['kind'], at, made: s.made!.perDay, planets: keptPlanetsOf(s), basis };
}

/**
 * A layout as a key: its kind, each planet's extractors (P0, heads, Basics) and factories, and for a chain whose planet each is. Two
 * setups with one key are the same plan to build.
 */
export function layoutKey(kind: string, planets: readonly KeptPlanet[]): string {
  const of = (p: KeptPlanet) => `${p.planetId}${kind === 'chain' || kind === 'team' ? `/${p.charId}` : ''}:${p.does}:${p.lines.map((l) => `${l.p0}h${l.heads ?? '?'}b${l.basics}`).sort().join('+')}:${p.makes.map((m) => `${m.id}x${m.count}`).sort().join(',')}`;
  return `${kind}|${planets.map(of).sort().join(' ')}`;
}

/** Units a day per character in it, as `rankSetups` compares them (a chain's and a factory character's in all over its characters). */
const perChar = (s: Setup) => (s.made ? s.made.perDay / ((s.kind === 'chain' || s.kind === 'team') && s.perChar.length ? s.perChar.length : 1) : 0);

/**
 * The layout to offer beside a kept plan, or null: the best of today's ranking held to the good (bought aside), when it isn't the kept
 * layout and makes at least `KEEP_MARGIN` more of the good a day (per character, as the ranking compares) than the kept plan does on
 * today's inputs, or anything when the kept plan makes none today. `more`: how much more, a fraction (null when the kept plan makes none).
 */
export function newerThan(kept: KeptPlan, keptNow: Setup | null, fresh: readonly Setup[] | null): { s: Setup; more: number | null } | null {
  const top = fresh?.find((s) => s.kind !== 'bought' && keepable(s)) ?? null;
  if (!top || layoutKey(top.kind, keptPlanetsOf(top)) === layoutKey(kept.kind, kept.planets)) return null;
  const was = keptNow && keptNow.why == null && keptNow.made ? perChar(keptNow) : 0;
  const now = perChar(top);
  if (!(now > 0)) return null;
  // A team plan kept before feeders made P1 only and factories ran whole sets (Ruling F27-1) is offered today's whatever the margin.
  if (was > 0 && now < was * (1 + KEEP_MARGIN) && !keptNow?.kept?.legacy) return null;
  return { s: top, more: was > 0 ? now / was - 1 : null };
}

const hoursSaid = (h: number) => (h % 24 === 0 ? `${h / 24}-day` : `${+h.toFixed(1)}-hour`);
const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const learnedish = (f: KeptRateFrom | undefined) => f === 'learned' || f === 'before';

/**
 * What changed between what a kept plan rested on and what a newer layout rests on now, in a few words each: whose plan it is, their
 * planets and Command Center Upgrades, the programme length, and by planet type the rates ("your Gas rates are learned now", "your
 * Barren rates have changed": by more than 5%, or from another source, a rate learned before and the same now counting as unchanged).
 * Empty when nothing it rests on moved.
 */
export function changedSince(then: KeptBasis, now: KeptBasis, nameOf: (charId: number) => string, goodName: (id: number) => string = (id) => `type ${id}`, planetName: (id: number) => string = (id) => `planet ${id}`): string[] {
  const out: string[] = [];
  if (then.char !== now.char) out.push(`it’s planned for ${nameOf(now.char)} now, and you kept it for ${nameOf(then.char)}`);
  else {
    if (now.planets != null && then.planets != null && now.planets !== then.planets) out.push(`you have ${now.planets} planets now (${then.planets} when kept)`);
    if (now.cc != null && then.cc != null && now.cc !== then.cc) out.push(`Command Center Upgrades ${ROMAN[now.cc] ?? now.cc} now (${ROMAN[then.cc] ?? then.cc} when kept)`);
  }
  if (Math.abs(now.programHours - then.programHours) > 1e-6) out.push(`a ${hoursSaid(now.programHours)} program now (${hoursSaid(then.programHours)} when kept)`);
  // Each planet type and P0 the system has, sorted: what became learned, what you typed, what moved otherwise.
  const keys = [...new Set([...Object.keys(then.rates), ...Object.keys(now.rates)])].sort();
  const learnedNow: string[] = [], typed: string[] = [], moved: string[] = [];
  for (const k of keys) {
    const a = then.rates[k], b = now.rates[k];
    if (!b) continue;
    if (learnedish(b.from) && !learnedish(a?.from)) learnedNow.push(k);
    else if (b.from === 'typed' && (a?.from !== 'typed' || a.perHour !== b.perHour)) typed.push(k);
    else if (!a || (a.from !== b.from && !(learnedish(a.from) && learnedish(b.from)))) moved.push(k);
    else if (a.perHour != null && b.perHour != null && Math.abs(b.perHour - a.perHour) > 0.05 * Math.max(a.perHour, 1)) moved.push(k);
  }
  // By planet type while that's short ("your Gas rates are learned now"); a P0 that moved on many types (one P0 on five) by the P0.
  const whose = (ks: string[], typed = false) => {
    const types = [...new Set(ks.map((k) => k.split(':')[0]))];
    const p0s = [...new Set(ks.map((k) => Number(k.split(':')[1])))];
    const by = types.length <= 4 ? listSaid(types) : p0s.length <= 3 ? listSaid(p0s.map(goodName)) : null;
    return by ? `your ${typed ? 'typed ' : ''}${by} rates` : `your ${typed ? 'typed ' : ''}rates on ${types.length} planet types`;
  };
  if (learnedNow.length) out.push(`${whose(learnedNow)} are learned now`);
  if (typed.length) out.push(`${whose(typed, true)} have changed`);
  if (moved.length) out.push(`${whose(moved)} have changed`);
  // A planet's own rate (planet rates), by planet: learned now, or moved by more than 5%.
  const own = (basis: KeptBasis, k: string) => basis.planetRates?.[k];
  const ownKeys = [...new Set([...Object.keys(then.planetRates ?? {}), ...Object.keys(now.planetRates ?? {})])].sort();
  const ownNew: string[] = [], ownMoved: string[] = [];
  // A plan kept before planet rates has none in its basis: nothing is known to have changed (kept after, an empty one means none then).
  for (const k of then.planetRates ? ownKeys : []) {
    const a = own(then, k), b = own(now, k);
    if (!b) continue;
    if (!a) ownNew.push(k);
    else if (a.perHour != null && b.perHour != null && Math.abs(b.perHour - a.perHour) > 0.05 * Math.max(a.perHour, 1)) ownMoved.push(k);
  }
  const planetsOf = (ks: string[]) => {
    const ids = [...new Set(ks.map((k) => Number(k.split(':')[0])))];
    return ids.length <= 2 ? listSaid(ids.map(planetName)) : `${ids.length} planets`;
  };
  const ownSaid = (ks: string[], what: string) => out.push(`${planetsOf(ks)}’s own rate${new Set(ks.map((k) => k.split(':')[0])).size === 1 ? ' is' : 's are'} ${what}`);
  if (ownNew.length) ownSaid(ownNew, 'learned now');
  if (ownMoved.length) ownSaid(ownMoved, 'changed');
  return out;
}
