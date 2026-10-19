/**
 * A real colony's chain (docs/superpowers/specs/2026-10-17-planets-design.md, stage 2: Colonies): from its kept document, which
 * extractor feeds which factory, what it makes a day with every output valued, what's wrong (an input starving, an output
 * building up, storage full, a programme ending or ended, a factory idle), and how it compares with the best single-planet setup
 * the planner gives that planet. Pure: the Worker may import it (nothing from ./config, the store, React or the DOM).
 */
import type { PlanetType } from './pi';
import type { Facility, PiIndex, Schematic, Tier } from './piBundle';
import type { KeptColony, KeptPin } from './colonies';
import { ENDING_SOON_HOURS } from './colony';
import { lowerReading, readings } from './piExtraction';
import { PI_READING } from './piLearn';
import { anHour, listSaid, taxRows, type Output, type Sell, type Setup, type Sold } from './piPlan';
import type { Tax } from './planetsDoc';
import { iskBig, units as unitsSaid } from './format';
import { dayCount } from './split';

export type PinKind = 'command' | 'extractor' | 'basic' | 'advanced' | 'hightech' | 'storage' | 'launchpad';
/**
 * Each planet type's pins by the type ID ESI reports them as (CCP's static data, build 3569502: group 1027 command centres, the
 * published one ESI reports at every level; 1028 factories; 1029 storage; 1030 launchpads; 1063 extractor control units). The
 * planets bundle holds their costs and capacities but not their IDs, and only the ID tells a launchpad from storage, or a factory
 * with no schematic chosen from either. Its longer-term home is the bundle (scripts/planets-bundle.mjs).
 */
export const PIN_TYPES: Record<PlanetType, Partial<Record<PinKind, number>>> = {
  Barren: { command: 2524, extractor: 2848, basic: 2473, advanced: 2474, hightech: 2475, storage: 2541, launchpad: 2544 },
  Gas: { command: 2534, extractor: 3060, basic: 2492, advanced: 2494, storage: 2536, launchpad: 2543 },
  Ice: { command: 2533, extractor: 3061, basic: 2493, advanced: 2491, storage: 2257, launchpad: 2552 },
  Lava: { command: 2549, extractor: 3062, basic: 2469, advanced: 2470, storage: 2558, launchpad: 2555 },
  Oceanic: { command: 2525, extractor: 3063, basic: 2490, advanced: 2485, storage: 2535, launchpad: 2542 },
  Plasma: { command: 2551, extractor: 3064, basic: 2471, advanced: 2472, storage: 2560, launchpad: 2556 },
  Storm: { command: 2550, extractor: 3067, basic: 2483, advanced: 2484, storage: 2561, launchpad: 2557 },
  Temperate: { command: 2254, extractor: 3068, basic: 2481, advanced: 2480, hightech: 2482, storage: 2562, launchpad: 2256 },
};
const PIN_OF = new Map<number, { kind: PinKind; t: PlanetType }>();
for (const [t, kinds] of Object.entries(PIN_TYPES)) {
  for (const [kind, id] of Object.entries(kinds)) if (id != null) PIN_OF.set(id, { kind: kind as PinKind, t: t as PlanetType });
}
/** What a pin is by its type ID; null for a type the table doesn't hold. */
export const pinKindOf = (typeId: number): PinKind | null => PIN_OF.get(typeId)?.kind ?? null;

export type ChainFlag = 'starving' | 'buildingUp' | 'storageFull' | 'expired' | 'endingSoon' | 'idle';
/**
 * `id` is the good a flag is about (the input starving, the output building up, the P0 of a programme ending or ended), null for a
 * pin's own state (storage full, a factory or extractor idle). `pinId` is the pin it's about, null when it's the colony's: an input
 * short across every factory that takes it.
 */
export type ChainFlagRow = { flag: ChainFlag; id: number | null; pinId: number | null; said: string };
/**
 * An extractor running a programme: its P0, the P0 an hour it pulls over the whole programme (the lower of the two readings of
 * ESI's quantity a cycle until the in-game check settles which is right, else that one), the other reading (null once settled),
 * the programme's hours and its end. Null with `why` when the programme doesn't give a rate: never 0.
 */
export type ChainExtract = {
  pinId: number; p0: number; perHour: number | null; higher: number | null; programHours: number | null; heads: number;
  ends: number | null; why: string | null;
};
/** What a schematic's factories make a day between them, fed as the routes feed them; null when the extractors' rates aren't known. */
export type ChainMake = { id: number; perDay: number | null; facility: Facility; count: number };
export type Chain = {
  planetId: number; planetType: PlanetType | null;
  extracts: ChainExtract[];
  makes: ChainMake[];
  /**
   * Every good the colony makes that its factories don't use up, sold once (piPlan's `Output`): `sold` on what goes to storage or a
   * launchpad, so it can be exported; `buildingUp` what doesn't sell or can't leave (the market's cap, or no route out).
   */
  outputs: Output[];
  flags: ChainFlagRow[];
  /** As a `Setup`'s: after the customs tax that's known, outputs not priced counted out (`unvalued`); null with `why`. */
  iskDay: number | null;
  /** The same colony on each extractor's other reading; null when every reading is settled, or nothing is known. */
  iskDayHigh: number | null;
  taxDay: number | null;
  /** What each 1% of customs tax costs a day when the tax isn't known; 0 when it is. */
  perPct: number;
  taxes: { tier: Tier; perDay: number | null }[];
  before: ('tax' | 'price')[];
  unvalued: number;
  why: string | null;
};

const H = 3600e3;
/** Below this many units an hour, nothing is left over: sums of the same flows in another order differ by rounding. */
const MIN_FLOW = 1e-6;
/** A supply this close under its need is the need: sums of the same flows in another order differ by rounding. */
const SHORT = 1e-9;
/** Storage or a launchpad holding this share of its capacity is full. */
export const STORAGE_FULL = 0.95;
/** Within a hundredth of an ISK is the same (piPlan's SAME_ISK). */
const SAME_ISK = 0.01;
const TIERS: Tier[] = ['P0', 'P1', 'P2', 'P3', 'P4'];
const FACTORY: Record<Facility, string> = { basic: 'a Basic', advanced: 'an Advanced', hightech: 'a High-Tech' };
const HOLDS: Record<'storage' | 'launchpad', string> = { storage: 'Storage', launchpad: 'Launchpad' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const hoursSaid = (h: number) => (h < 1 ? 'under an hour' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
const add = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);

const bySchematic = new WeakMap<PiIndex, Map<number, Schematic>>();
function schematicOf(ix: PiIndex, id: number): Schematic | null {
  let m = bySchematic.get(ix);
  if (!m) bySchematic.set(ix, m = new Map(ix.schematics.map((s) => [s.id, s])));
  return m.get(id) ?? null;
}

type Ext = { pin: KeptPin; p0: number; perHour: number | null; higher: number | null; programHours: number | null; why: string | null };
type Fac = { pin: KeptPin; s: Schematic };
type Net = {
  exts: Ext[]; facs: Fac[];
  /** The goods routed out of each pin, and into it. */
  outOf: Map<number, Set<number>>; into: Map<number, Set<number>>;
  /** Goods routed to storage or a launchpad: what can be exported. */
  exits: Set<number>;
  /** A good an hour the factories it's routed into take at their full rate, counting only factories every input is routed into. */
  need: Map<number, number>;
};
/** An hour of the colony: each factory's share of its full rate, and each good routed on, used, and made with nowhere to go. */
type Flow = { ratio: Map<number, number>; supply: Map<number, number>; used: Map<number, number>; stuck: Map<number, number> };

/**
 * Each good, a tier at a time (P0 from the extractors, then the factories making P1, P2, P3 and P4): what's routed out of its makers
 * is shared among the factories routed to take it, in proportion to what they take, and a factory runs at the least share of its
 * inputs (a factory short of input runs fewer cycles, as the planner's do). One with an input routed to it from nowhere runs none.
 * What a pin makes and routes nowhere is `stuck`: it's made, and it stays where it's made.
 */
function flowOf(net: Net, rate: (x: Ext) => number): Flow {
  const ratio = new Map<number, number>(), supply = new Map<number, number>(), used = new Map<number, number>(), stuck = new Map<number, number>();
  for (const x of net.exts) add(net.outOf.get(x.pin.id)?.has(x.p0) ? supply : stuck, x.p0, rate(x));
  for (const t of TIERS.slice(1)) {
    for (const f of net.facs) {
      if (f.s.tier !== t) continue;
      const ins = net.into.get(f.pin.id);
      let r = 1;
      for (const i of f.s.inputs) {
        const need = net.need.get(i.id) ?? 0;
        r = Math.min(r, ins?.has(i.id) && need > 0 ? Math.min(1, (supply.get(i.id) ?? 0) / need) : 0);
      }
      ratio.set(f.pin.id, r);
      for (const i of f.s.inputs) if (ins?.has(i.id)) add(used, i.id, r * anHour(f.s, i.qty));
      add(net.outOf.get(f.pin.id)?.has(f.s.out.id) ? supply : stuck, f.s.out.id, r * anHour(f.s, f.s.out.qty));
    }
  }
  return { ratio, supply, used, stuck };
}

/** A good that can't leave its maker: never priced, so never credited or taxed (the planner's I1), and said why. */
const notExported = (): Sold => ({ isk: null, units: 0, where: [], why: 'not routed to storage or a launchpad, so none of it can be exported' });

type Valued = { outputs: Output[]; taxes: Chain['taxes']; taxDay: number | null; perPctBase: number; value: number; unvalued: number };
/**
 * What's left of each good after the factories take theirs, sold once: what goes to storage or a launchpad is exported, the rest
 * builds up where it's made. Customs on what sells of the goods that are priced (`taxRows`, as the planner taxes); a good nobody
 * prices, or that can't leave, adds no ISK and pays no tax.
 */
function valuedOf(ix: PiIndex, net: Net, flow: Flow, sell: Sell, tax: Tax): Valued {
  const tierAt = (id: number) => TIERS.indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const goods = [...new Set([...flow.supply.keys(), ...flow.stuck.keys()])].sort((a, b) => tierAt(b) - tierAt(a) || a - b);
  const outputs: Output[] = [];
  for (const id of goods) {
    const left = Math.max(0, (flow.supply.get(id) ?? 0) - (flow.used.get(id) ?? 0)), st = flow.stuck.get(id) ?? 0;
    if (left + st <= MIN_FLOW) continue;
    const exit = net.exits.has(id);
    const out = exit ? left : 0, held = st + (exit ? 0 : left);
    const sold = out > MIN_FLOW ? sell(id, out * 24) : notExported();
    outputs.push({ id, perDay: (left + st) * 24, sold, buildingUp: held * 24 + (sold.isk == null ? 0 : Math.max(0, out * 24 - sold.units)) });
  }
  const priced = outputs.filter((o) => o.sold.isk != null);
  const rows = taxRows(ix, priced.map((o) => ({ id: o.id, perDay: o.sold.units })), tax.rate, 1);
  const taxKnown = rows.every((r) => r.perDay != null);
  return {
    outputs, taxes: rows.map((r) => ({ tier: r.tier, perDay: r.perDay })),
    taxDay: taxKnown ? rows.reduce((t, r) => t + r.perDay!, 0) : null,
    perPctBase: rows.filter((r) => r.perDay == null).reduce((t, r) => t + r.base, 0),
    value: priced.reduce((t, o) => t + o.sold.isk!, 0) - rows.reduce((t, r) => t + (r.perDay ?? 0), 0),
    unvalued: outputs.length - priced.length,
  };
}

/**
 * The colony's chain. Pins are told apart by their shape (an extractor's details, a factory's schematic) and, where the shape can't
 * say, by their type ID (`PIN_TYPES`): a factory with no schematic chosen is idle, never read as making something. `tax` is the
 * planet's customs tax as the planner has it (`customsRate`); `checked`, which reading of ESI's quantity a cycle the in-game check
 * settled (`PI_READING` by default).
 *
 * The flags: an input whose supply an hour is under what the factories routed to take it need (`starving`, on the lower reading,
 * saying when the higher one gives enough), or routed into a factory from nowhere; an output not routed onward and not to storage
 * or a launchpad (`buildingUp`); storage or a launchpad at 95% of its capacity (`storageFull`); a programme ended (`expired`) or
 * ending within a day (`endingSoon`), the figures staying at the rate it ran at; a factory with no schematic or an extractor with
 * no programme (`idle`).
 */
export function colonyChain(k: KeptColony, ix: PiIndex, sell: Sell, now: number, tax: Tax, checked: 'formula' | 'perCycle' | null = PI_READING): Chain {
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  const flags: ChainFlagRow[] = [];
  const exts: Ext[] = [], facs: Fac[] = [];
  const timed: { pin: KeptPin; p0: number; ends: number }[] = [];

  for (const pin of k.pins) {
    const kind = PIN_OF.get(pin.typeId)?.kind ?? null;
    const e = pin.extractor;
    if (e || kind === 'extractor') {
      const install = pin.install ? Date.parse(pin.install) : NaN, expiry = pin.expiry ? Date.parse(pin.expiry) : NaN;
      if (!e || e.product == null || !Number.isFinite(install) || !Number.isFinite(expiry)) {
        flags.push({ flag: 'idle', id: null, pinId: pin.id, said: 'An extractor has no programme: it extracts nothing' });
        continue;
      }
      const r = readings({ qtyPerCycle: e.qty ?? NaN, cycleSeconds: e.cycle, install, expiry });
      let perHour: number | null = null, higher: number | null = null, why: string | null = null;
      if (!r) {
        why = e.qty == null
          ? `ESI sent no quantity a cycle for its ${name(e.product)} extractor (it often sends none until the programme is submitted)`
          : `its ${name(e.product)} extractor’s programme gives no rate (no cycle time, or none a cycle)`;
      } else if (checked) {
        perHour = r[checked].perHour;
      } else {
        const lo = lowerReading(r);
        perHour = lo.perHour;
        higher = lo.which === 'formula' ? r.perCycle.perHour : r.formula.perHour;
      }
      exts.push({ pin, p0: e.product, perHour, higher, programHours: r?.hours ?? null, why });
      timed.push({ pin, p0: e.product, ends: expiry });
      continue;
    }
    if (pin.schematic != null) {
      const s = schematicOf(ix, pin.schematic);
      if (s) facs.push({ pin, s });
      else flags.push({ flag: 'idle', id: null, pinId: pin.id, said: `A factory runs a schematic the planets data doesn’t hold (#${pin.schematic}): what it makes isn’t known` });
      continue;
    }
    if (kind === 'basic' || kind === 'advanced' || kind === 'hightech') {
      flags.push({ flag: 'idle', id: null, pinId: pin.id, said: `${cap(FACTORY[kind])} factory has no schematic chosen: it makes nothing` });
    }
  }

  // Programmes ending and ended, as the colony panel judges them (colony.ts' readExtractor): ended at its end, ending within a day.
  for (const x of timed) {
    const left = (x.ends - now) / H;
    if (left <= 0) flags.push({ flag: 'expired', id: x.p0, pinId: x.pin.id, said: `The ${name(x.p0)} programme ended ${hoursSaid(-left)} ago: it extracts nothing until its heads are reset. What the colony makes here is at the rate it ran at` });
    else if (left <= ENDING_SOON_HOURS) flags.push({ flag: 'endingSoon', id: x.p0, pinId: x.pin.id, said: `The ${name(x.p0)} programme ends in ${hoursSaid(left)}: reset its heads before then` });
  }

  const outOf = new Map<number, Set<number>>(), into = new Map<number, Set<number>>(), exits = new Set<number>();
  for (const [src, dst, type] of k.routes) {
    if (!outOf.has(src)) outOf.set(src, new Set());
    outOf.get(src)!.add(type);
    if (!into.has(dst)) into.set(dst, new Set());
    into.get(dst)!.add(type);
    const held = PIN_OF.get(k.pins.find((p) => p.id === dst)?.typeId ?? -1)?.kind;
    if (held === 'storage' || held === 'launchpad') exits.add(type);
  }
  const need = new Map<number, number>();
  for (const f of facs) {
    const ins = into.get(f.pin.id);
    const missing = f.s.inputs.filter((i) => !ins?.has(i.id));
    if (missing.length) {
      for (const i of missing) flags.push({ flag: 'starving', id: i.id, pinId: f.pin.id, said: `Nothing routes ${name(i.id)} into ${FACTORY[f.s.facility]} factory making ${name(f.s.out.id)}, so it makes none` });
      continue;
    }
    for (const i of f.s.inputs) add(need, i.id, anHour(f.s, i.qty));
  }
  const net: Net = { exts, facs, outOf, into, exits, need };

  // What a pin makes and routes nowhere: it stays where it's made.
  for (const x of exts) if (!outOf.get(x.pin.id)?.has(x.p0)) flags.push({ flag: 'buildingUp', id: x.p0, pinId: x.pin.id, said: `${name(x.p0)} from its extractor isn’t routed anywhere, so none of it is stored or used` });
  for (const f of facs) {
    if (!outOf.get(f.pin.id)?.has(f.s.out.id)) flags.push({ flag: 'buildingUp', id: f.s.out.id, pinId: f.pin.id, said: `${name(f.s.out.id)} isn’t routed out of ${FACTORY[f.s.facility]} factory: it piles up there, and the factory stops once it’s full` });
  }

  const known = exts.every((x) => x.perHour != null);
  const flow = known ? flowOf(net, (x) => x.perHour!) : null;
  const anyHigher = exts.some((x) => x.higher != null);
  const high = known && anyHigher ? flowOf(net, (x) => x.higher ?? x.perHour!) : null;

  if (flow) {
    // An input short of what the factories routed to take it need (judged on the lower reading).
    const goods = [...need.keys()].sort((a, b) => TIERS.indexOf(ix.byId.get(a)?.tier ?? 'P0') - TIERS.indexOf(ix.byId.get(b)?.tier ?? 'P0') || a - b);
    for (const id of goods) {
      const n = need.get(id)!, got = flow.supply.get(id) ?? 0;
      if (!(got < n * (1 - SHORT))) continue;
      const hi = high ? high.supply.get(id) ?? 0 : null;
      const reach = got > MIN_FLOW
        ? `${name(id)}: ${dayCount(got)} an hour reach the factories that take ${dayCount(n)}, so they run ${Math.round((got / n) * 100)}% of the time`
        : `${name(id)}: none reaches the factories that take ${dayCount(n)} an hour, so they make nothing`;
      const other = hi != null && !(hi < n * (1 - SHORT)) ? `, on the lower reading of extraction: on the higher reading they get ${dayCount(hi)}, enough` : '';
      flags.push({ flag: 'starving', id, pinId: null, said: reach + other });
    }
    // More than the factories routed to take it use, with no route to storage or a launchpad: it stays where it's made.
    for (const [id, got] of flow.supply) {
      const left = got - (flow.used.get(id) ?? 0);
      if (left > MIN_FLOW && !exits.has(id)) flags.push({ flag: 'buildingUp', id, pinId: null, said: `${dayCount(left * 24)} ${name(id)} a day is more than the factories it’s routed to take, and none goes to storage or a launchpad: it stays where it’s made` });
    }
  }

  // Storage or a launchpad near its capacity (the bundle's, by the pin's own planet type).
  for (const pin of k.pins) {
    const of = PIN_OF.get(pin.typeId);
    if (!of || (of.kind !== 'storage' && of.kind !== 'launchpad')) continue;
    const capacity = ix.planetTypes[of.t]?.pins[of.kind].capacity;
    if (!(capacity > 0)) continue;
    let m3 = 0, unknown = 0;
    for (const [id, amount] of pin.contents) {
      const v = ix.byId.get(id)?.volume;
      if (v == null) unknown++;
      else m3 += amount * v;
    }
    if (m3 >= STORAGE_FULL * capacity) {
      flags.push({ flag: 'storageFull', id: null, pinId: pin.id, said: `${HOLDS[of.kind]} ${Math.round((m3 / capacity) * 100)}% full: ${unknown ? 'at least ' : ''}${unitsSaid(m3)} of ${unitsSaid(capacity)} m³` });
    }
  }

  const makesBy = new Map<number, ChainMake>();
  for (const f of facs) {
    const m = makesBy.get(f.s.id) ?? { id: f.s.out.id, perDay: flow ? 0 : null, facility: f.s.facility, count: 0 };
    m.count++;
    if (flow) m.perDay! += (flow.ratio.get(f.pin.id) ?? 0) * anHour(f.s, f.s.out.qty) * 24;
    makesBy.set(f.s.id, m);
  }
  const makes = [...makesBy.values()].sort((a, b) => TIERS.indexOf(ix.byId.get(a.id)?.tier ?? 'P0') - TIERS.indexOf(ix.byId.get(b.id)?.tier ?? 'P0') || a.id - b.id);
  const extracts: ChainExtract[] = exts.map((x) => ({
    pinId: x.pin.id, p0: x.p0, perHour: x.perHour, higher: x.higher, programHours: x.programHours,
    heads: x.pin.extractor?.heads ?? 0, ends: x.pin.expiry ? Date.parse(x.pin.expiry) : null, why: x.why,
  }));
  const base = { planetId: k.planetId, planetType: k.planetType, extracts, makes, flags };

  if (!flow) {
    const unknown = exts.filter((x) => x.perHour == null);
    return {
      ...base, outputs: [], iskDay: null, iskDayHigh: null, taxDay: null, perPct: 0, taxes: [], before: [], unvalued: 0,
      why: `What it makes isn’t known: ${unknown[0].why}${unknown.length > 1 ? `, and ${unknown.length - 1} more extractor${unknown.length > 2 ? 's' : ''} the same` : ''}`,
    };
  }
  const v = valuedOf(ix, net, flow, sell, tax);
  const before: Chain['before'] = [];
  if (v.taxDay == null) before.push('tax');
  if (v.unvalued) before.push('price');
  // Nothing it makes is valued: no figure, never one made of customs alone; the outputs' own reasons say why.
  const none = v.outputs.length > 0 && v.unvalued === v.outputs.length;
  return {
    ...base, outputs: v.outputs,
    iskDay: none ? null : v.value,
    iskDayHigh: none || !high ? null : valuedOf(ix, net, high, sell, tax).value,
    taxDay: none ? null : v.taxDay, perPct: v.perPctBase / 100, taxes: v.taxes, before, unvalued: v.unvalued,
    why: none ? cap([...new Set(v.outputs.map((o) => o.sold.why ?? 'no price read'))].join('; ')) : null,
  };
}

/**
 * The real planet against the best single-planet setup the planner gives that planet alone: the better of `planSingle`'s P0 → P1
 * and P0 → P2 with `planets` holding only it, at the same rates (the caller makes that call). `gain` is what the best makes a day
 * more; within a cent of it, or above, the colony is already the best and nothing is said (gain 0). With no valued ISK on either
 * side, gain is null and the words say why: never 0. A best resting on a rate the planner assumes (a P0 no colony has shown) says
 * so, and so does one before the customs tax. The planet's name isn't in the chain: the page puts it in front.
 */
export function versusBest(chain: Chain, best: Setup | null, ix: PiIndex): { gain: number | null; said: string } {
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  if (!best) return { gain: null, said: 'The planner has no single-planet setup for this planet to set it against' };
  if (chain.iskDay == null) return { gain: null, said: `It isn’t set against the planner’s best: ${low(chain.why ?? 'what it makes isn’t valued')}` };
  if (best.iskDay == null) return { gain: null, said: `It isn’t set against the planner’s best, which has no figure here: ${low(best.why ?? 'what it would make isn’t valued')}` };
  const gain = best.iskDay - chain.iskDay;
  if (!(gain > SAME_ISK)) return { gain: 0, said: '' };

  const top = chain.makes.length ? Math.max(...chain.makes.map((m) => TIERS.indexOf(ix.byId.get(m.id)?.tier ?? 'P0'))) : -1;
  const tops = chain.makes.filter((m) => TIERS.indexOf(ix.byId.get(m.id)?.tier ?? 'P0') === top).map((m) => m.id);
  const what = tops.length ? `Makes ${listSaid(tops.map(name))}`
    : chain.extracts.length ? `Extracts ${listSaid([...new Set(chain.extracts.map((x) => x.p0))].map(name))}` : 'Makes nothing';
  const role = best.roles.find((r) => r.planetId === chain.planetId && r.does !== 'unused');
  const pays = `${iskBig(gain)} more a day`;
  let rest: string;
  if (best.kind === 'p1') {
    const p1s = (role?.makes ?? []).filter((m) => m.facility === 'basic').map((m) => name(m.id));
    rest = `the best P1s it can make alone here${p1s.length ? `, ${listSaid(p1s)},` : ''} pay ${pays}`;
  } else {
    const adv = role?.makes.find((m) => m.facility === 'advanced');
    rest = adv && tops.length === 1 && tops[0] === adv.id ? `the planner’s own layout for it here pays ${pays}`
      : `the best P2 it can make alone here${adv ? `, ${name(adv.id)},` : ''} pays ${pays}`;
  }
  // The best on a rate the planner assumes (a P0 the colonies haven't shown) is said as that, never claimed.
  const assumed = (role?.extracts ?? []).filter((x) => !x.rate);
  const names = [...new Set(assumed.map((x) => name(x.p0)))];
  const guess = names.length ? `, if it gets ${unitsSaid(assumed[0].perHour)} ${listSaid(names)} an hour${names.length > 1 ? ' each' : ''}, a rate no colony of yours has shown` : '';
  const beforeTax = chain.before.includes('tax') || best.before.includes('tax') ? ', before the customs tax' : '';
  return { gain, said: `${what}; ${rest}${guess}${beforeTax}` };
}
