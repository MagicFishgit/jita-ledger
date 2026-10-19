/**
 * A real colony's chain (docs/superpowers/specs/2026-10-17-planets-design.md, stage 2: Colonies): from its kept document, which
 * pin feeds which, followed route by route, what it makes a day with every output valued, what's wrong at its root (an input
 * starving, an output building up, storage full, a programme ending or ended, a factory idle), and how it compares with the best
 * single-planet setup the planner gives that planet. Pure: the Worker may import it (nothing from ./config, the store, React or the
 * DOM).
 */
import type { PlanetType } from './pi';
import type { Facility, PiIndex, Schematic, Tier } from './piBundle';
import type { KeptColony, KeptPin } from './colonies';
import { ENDING_SOON_HOURS } from './colony';
import { lowerReading, readings } from './piExtraction';
import { PI_READING } from './piLearn';
import { anHour, listSaid, taxRows, type Output, type Role, type Sell, type Setup, type Sold } from './piPlan';
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
 * the programme's hours and its end. Null with `why` when the programme doesn't give a rate: never 0. `heads` is 0 when the colony
 * didn't say how many (ESI sent none, Ruling T8-1): not known, never "no heads".
 */
export type ChainExtract = {
  pinId: number; p0: number; perHour: number | null; higher: number | null; programHours: number | null; heads: number;
  ends: number | null; why: string | null;
};
/** What a schematic's factories make a day between them, fed as the routes feed them; null when the extractors' rates aren't known. */
export type ChainMake = { id: number; perDay: number | null; facility: Facility; count: number };
export type Chain = {
  planetId: number; planetType: PlanetType | null;
  /** The colony's Command Center Upgrades level as ESI gives it: what a best must fit at (`versusBest`). */
  level: number;
  /** When EVE last updated the colony (the game's time, not a read): what its contents, and so `storageFull`, are as of. */
  lastUpdate: string;
  extracts: ChainExtract[];
  makes: ChainMake[];
  /**
   * Inputs nothing on the planet makes, routed into its factories from storage or a launchpad: brought in from off the planet (a
   * factory planet fed from its launchpad). What the factories take a day of each while kept stocked; `makes` counts them so.
   */
  imports: { id: number; perDay: number }[];
  /**
   * Every good the colony makes that its factories don't use up, sold once (piPlan's `Output`): `sold` on what reaches storage or a
   * launchpad, taken as exported; `buildingUp` what doesn't sell (the market's cap) or can't leave. A good none of which can leave
   * (no route to storage or a launchpad) sells none, said why ("isn’t shipped"), and is counted in `unshipped`, never as unpriced.
   */
  outputs: Output[];
  flags: ChainFlagRow[];
  /**
   * As a `Setup`'s: after the customs tax that's known, outputs not priced counted out (`unvalued`); null with `why` when what it
   * makes isn't known, nothing it ships is priced, or its inputs are imported (their cost isn't known here). 0 when nothing it makes
   * leaves the planet (no output, or none shipped): known, and `why` is null.
   */
  iskDay: number | null;
  /** The same colony on each extractor's other reading; null when every reading is settled, or nothing is known. */
  iskDayHigh: number | null;
  taxDay: number | null;
  /** What each 1% of customs tax costs a day when the tax isn't known; 0 when it is, or when there's no figure. */
  perPct: number;
  taxes: { tier: Tier; perDay: number | null }[];
  before: ('tax' | 'price')[];
  unvalued: number;
  unshipped: number;
  why: string | null;
};

const H = 3600e3;
/** Below this many units an hour, nothing is left over: sums of the same flows in another order differ by rounding. */
const MIN_FLOW = 1e-6;
/**
 * An input reaching the factories that take it at under this share of what they take at full rate is starving (Ruling T15-3).
 * 95% is a Basic losing about 2 of its 48 cycles a day and an Advanced about 1 of its 24, and an extractor's rate is its whole
 * programme's average, which falls across the programme (CCP's decay), so a few percent short is the programme's own course, not a
 * fault; the user asked for nothing too tight.
 */
export const STARVING_BELOW = 0.95;
/** Storage or a launchpad holding this share of its capacity is full. */
export const STORAGE_FULL = 0.95;
/** Within a hundredth of an ISK is the same (piPlan's SAME_ISK). */
const SAME_ISK = 0.01;
const TIERS: Tier[] = ['P0', 'P1', 'P2', 'P3', 'P4'];
const FACTORY: Record<Facility, string> = { basic: 'a Basic', advanced: 'an Advanced', hightech: 'a High-Tech' };
const HOLDS: Record<'storage' | 'launchpad', string> = { storage: 'Storage', launchpad: 'Launchpad' };
const A_HOLD: Record<'storage' | 'launchpad', string> = { storage: 'a storage facility', launchpad: 'a launchpad' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const hoursSaid = (h: number) => (h < 1 ? 'under an hour' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
const add = (m: Map<number, number>, k: number, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const push = <K, T>(m: Map<K, T[]>, k: K, v: T) => { const xs = m.get(k); if (xs) xs.push(v); else m.set(k, [v]); };

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
  /** Each pin's routes out, by good: the pins it sends that good to. */
  to: Map<number, Map<number, number[]>>;
  /** Storage and launchpads: what's routed into one is drawn by the factories routed from it, and what's left is exported. */
  buffer: Set<number>;
  /** Factories every input of which reaches them, or is imported: the others make nothing and draw nothing. */
  runs: Set<number>;
  /** Each factory's imported inputs (nothing on the planet makes them; routed in from storage or a launchpad). */
  imported: Map<number, Set<number>>;
  /** Goods some pin that makes them routes into storage or a launchpad. */
  stored: Set<number>;
};
/** An hour of the colony, followed route by route. */
type Flow = {
  /** Each factory's share of its full rate. */
  ratio: Map<number, number>;
  /** What reaches each factory of each input it draws from the planet. */
  recv: Map<number, Map<number, number>>;
  /** Each good made, by every pin that makes it. */
  made: Map<number, number>;
  /** Each good left in storage or a launchpad: taken as exported. */
  exported: Map<number, number>;
  /** Each good made with nowhere to go: routed nowhere, or more than the factories it's routed to take with no storage route. */
  stuck: Map<number, number>;
  /** The second of those alone, by good. */
  unrouted: Map<number, number>;
  /** Each imported good the factories take while kept stocked. */
  imports: Map<number, number>;
};

/**
 * The routes followed pin by pin (Ruling T15-3), a tier at a time (P0 from the extractors, then the factories making P1, P2, P3
 * and P4: every input is a lower tier). What a pin makes goes first to the factories it's routed straight to, up to what they take
 * at full rate (shared by it when short), and the rest into the storage or launchpads it's routed to (split evenly), or nowhere. What
 * reaches a storage or launchpad goes to the factories routed from it the same way, and what's left there is exported; its contents
 * are stock, never a rate. A factory runs at the least share of its inputs (fewer cycles when short, as the planner's), an imported
 * input counting as kept stocked; what it drew beyond what it uses goes back to storage when it came from there.
 */
function flowOf(net: Net, rate: (x: Ext) => number): Flow {
  const ratio = new Map<number, number>(), recv = new Map<number, Map<number, number>>(), made = new Map<number, number>();
  const exported = new Map<number, number>(), stuck = new Map<number, number>(), unrouted = new Map<number, number>(), imports = new Map<number, number>();
  const fromStore = new Map<number, Map<number, number>>();
  const facAt = new Map(net.facs.map((f) => [f.pin.id, f]));
  const of = (m: Map<number, Map<number, number>>, id: number) => { let x = m.get(id); if (!x) m.set(id, x = new Map()); return x; };
  // What each running factory still takes of each input it draws from the planet, at full rate.
  const rem = new Map<number, Map<number, number>>();
  for (const f of net.facs) {
    if (!net.runs.has(f.pin.id)) continue;
    rem.set(f.pin.id, new Map(f.s.inputs.filter((i) => !net.imported.get(f.pin.id)?.has(i.id)).map((i) => [i.id, anHour(f.s, i.qty)])));
  }
  const give = (offer: number, to: number[], g: number, store: boolean): number => {
    const want = to.map((id) => rem.get(id)?.get(g) ?? 0);
    const total = want.reduce((a, b) => a + b, 0);
    if (!(total > 0) || !(offer > 0)) return 0;
    const share = Math.min(1, offer / total);
    to.forEach((id, k) => {
      const got = want[k] * share;
      if (!(got > 0)) return;
      rem.get(id)!.set(g, want[k] - got);
      add(of(recv, id), g, got);
      if (store) add(of(fromStore, id), g, got);
    });
    return total * share;
  };
  const tierOf = (f: Fac) => f.s.tier;
  const makers = new Map<number, { pin: number; amount: number }[]>();
  for (const x of net.exts) push(makers, x.p0, { pin: x.pin.id, amount: rate(x) });
  const outTier = new Map<number, Tier>(net.exts.map((x) => [x.p0, 'P0' as Tier]));
  for (const f of net.facs) outTier.set(f.s.out.id, f.s.tier);
  for (const t of TIERS) {
    for (const f of net.facs) {
      if (tierOf(f) !== t) continue;
      let r = net.runs.has(f.pin.id) ? 1 : 0;
      for (const i of f.s.inputs) {
        if (!r || net.imported.get(f.pin.id)?.has(i.id)) continue;
        const n = anHour(f.s, i.qty);
        r = Math.min(r, n > 0 ? Math.min(1, (recv.get(f.pin.id)?.get(i.id) ?? 0) / n) : 0);
      }
      ratio.set(f.pin.id, r);
      push(makers, f.s.out.id, { pin: f.pin.id, amount: r * anHour(f.s, f.s.out.qty) });
    }
    for (const [g, ps] of [...makers].sort((a, b) => a[0] - b[0])) {
      if (outTier.get(g) !== t) continue;
      const into = new Map<number, number>();
      for (const p of ps.sort((a, b) => a.pin - b.pin)) {
        add(made, g, p.amount);
        const dsts = net.to.get(p.pin)?.get(g) ?? [];
        const left = p.amount - give(p.amount, dsts.filter((d) => facAt.has(d)), g, false);
        const stores = dsts.filter((d) => net.buffer.has(d));
        if (stores.length) for (const b of stores) add(into, b, left / stores.length);
        else if (left > MIN_FLOW) {
          add(stuck, g, left);
          if (dsts.length) add(unrouted, g, left);
        }
      }
      for (const [b, amount] of [...into].sort((x, y) => x[0] - y[0])) {
        add(exported, g, amount - give(amount, (net.to.get(b)?.get(g) ?? []).filter((d) => facAt.has(d)), g, true));
      }
    }
  }
  // What a factory drew beyond what it uses (held back by another input) goes back where it came from.
  for (const f of net.facs) {
    const r = ratio.get(f.pin.id) ?? 0;
    for (const [g, amount] of recv.get(f.pin.id) ?? []) {
      const i = f.s.inputs.find((x) => x.id === g)!;
      const excess = amount - r * anHour(f.s, i.qty);
      if (!(excess > MIN_FLOW)) continue;
      const back = net.stored.has(g) ? excess : Math.min(excess, fromStore.get(f.pin.id)?.get(g) ?? 0);
      add(exported, g, back);
      if (excess - back > MIN_FLOW) add(stuck, g, excess - back);
    }
    for (const g of net.imported.get(f.pin.id) ?? []) {
      const i = f.s.inputs.find((x) => x.id === g)!;
      add(imports, g, r * anHour(f.s, i.qty));
    }
  }
  return { ratio, recv, made, exported, stuck, unrouted, imports };
}

/** A good none of which can leave its maker: nothing of it is sold (known, not a price unread), never credited or taxed. */
const NOT_SHIPPED: Sold = { isk: 0, units: 0, where: [], why: 'not routed to storage or a launchpad, so it isn’t shipped' };

type Valued = { outputs: Output[]; taxes: Chain['taxes']; taxDay: number | null; perPctBase: number; value: number; unvalued: number; unshipped: number };
/**
 * What's left of each good after the factories take theirs, sold once: what's in storage or a launchpad is taken as exported, what
 * has nowhere to go builds up. Customs on what sells of the goods that are priced (`taxRows`, as the planner taxes); a good nobody
 * prices adds no ISK and pays no tax (the planner's I1), and one that can't leave sells none.
 */
function valuedOf(ix: PiIndex, flow: Flow, sell: Sell, tax: Tax): Valued {
  const tierAt = (id: number) => TIERS.indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const goods = [...new Set([...flow.exported.keys(), ...flow.stuck.keys()])].sort((a, b) => tierAt(b) - tierAt(a) || a - b);
  const outputs: Output[] = [];
  let unshipped = 0;
  for (const id of goods) {
    const out = Math.max(0, flow.exported.get(id) ?? 0), held = flow.stuck.get(id) ?? 0;
    if (out + held <= MIN_FLOW) continue;
    const shipped = out > MIN_FLOW;
    if (!shipped) unshipped++;
    const sold = shipped ? sell(id, out * 24) : NOT_SHIPPED;
    outputs.push({ id, perDay: (out + held) * 24, sold, buildingUp: held * 24 + (shipped && sold.isk != null ? Math.max(0, out * 24 - sold.units) : 0) });
  }
  const priced = outputs.filter((o) => o.sold.isk != null);
  const rows = taxRows(ix, priced.map((o) => ({ id: o.id, perDay: o.sold.units })), tax.rate, 1);
  const taxKnown = rows.every((r) => r.perDay != null);
  return {
    outputs, taxes: rows.map((r) => ({ tier: r.tier, perDay: r.perDay })),
    taxDay: taxKnown ? rows.reduce((t, r) => t + r.perDay!, 0) : null,
    perPctBase: rows.filter((r) => r.perDay == null).reduce((t, r) => t + r.base, 0),
    value: priced.reduce((t, o) => t + o.sold.isk!, 0) - rows.reduce((t, r) => t + (r.perDay ?? 0), 0),
    unvalued: outputs.length - priced.length, unshipped,
  };
}

/**
 * The colony's chain. Pins are told apart by their shape (an extractor's details, a factory's schematic) and, where the shape can't
 * say, by their type ID (`PIN_TYPES`): a factory with no schematic chosen is idle, never read as making something. `tax` is the
 * planet's customs tax as the planner has it (`customsRate`); `checked`, which reading of ESI's quantity a cycle the in-game check
 * settled (`PI_READING` by default).
 *
 * Each factory input is decided from the routes before anything flows: it reaches the factory (routed from a pin that makes it, or
 * from storage or a launchpad such a pin routes it into), it's imported (nothing on the planet makes it, and it's routed in from
 * storage or a launchpad: kept stocked, never starving, and the planet's ISK a day isn't known, Ruling T15-2), or it doesn't
 * reach: `starving` at that factory, which makes nothing.
 *
 * The flags, only at the root of what's wrong (Ruling T15-3): an input reaching its factories at under `STARVING_BELOW` of what they
 * take (`starving`, judged on the lower reading and saying when the higher one gives enough, its words naming the factories after it
 * that it holds back), never one explained by a flag before it (an extractor with no programme, a maker routed nowhere, factories
 * short of their own inputs); a pin's product routed nowhere, or more of it than the factories it's routed to take with no route to
 * storage or a launchpad (`buildingUp`); storage or a launchpad at `STORAGE_FULL` of its capacity as of the colony's last update in
 * game (`storageFull`); a programme ended (`expired`) or ending within a day (`endingSoon`), the figures staying at the rate it ran
 * at; a factory with no schematic or an extractor with no programme (`idle`).
 */
export function colonyChain(k: KeptColony, ix: PiIndex, sell: Sell, now: number, tax: Tax, checked: 'formula' | 'perCycle' | null = PI_READING): Chain {
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  const tierAt = (id: number) => TIERS.indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const kindOf = (id: number) => PIN_OF.get(k.pins.find((p) => p.id === id)?.typeId ?? -1)?.kind ?? null;
  const exts: Ext[] = [], facs: Fac[] = [];
  const idle: { pin: KeptPin; p0: number | null; fac: Facility | null; said: string }[] = [];
  const timed: { pin: KeptPin; p0: number; ends: number }[] = [];
  const extPins = new Map<number, number | null>();

  for (const pin of k.pins) {
    const kind = PIN_OF.get(pin.typeId)?.kind ?? null;
    const e = pin.extractor;
    if (e || kind === 'extractor') {
      extPins.set(pin.id, e?.product ?? null);
      const install = pin.install ? Date.parse(pin.install) : NaN, expiry = pin.expiry ? Date.parse(pin.expiry) : NaN;
      if (!e || e.product == null || !Number.isFinite(install) || !Number.isFinite(expiry)) {
        idle.push({ pin, p0: e?.product ?? null, fac: null, said: 'An extractor has no programme: it extracts nothing' });
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
      else idle.push({ pin, p0: null, fac: null, said: `A factory runs a schematic the planets data doesn’t hold (#${pin.schematic}): what it makes isn’t known` });
      continue;
    }
    if (kind === 'basic' || kind === 'advanced' || kind === 'hightech') {
      idle.push({ pin, p0: null, fac: kind, said: `${cap(FACTORY[kind])} factory has no schematic chosen: it makes nothing` });
    }
  }

  // Programmes ending and ended, as the colony panel judges them (colony.ts' readExtractor): ended at its end, ending within a day.
  const timeFlags: ChainFlagRow[] = [];
  for (const x of timed) {
    const left = (x.ends - now) / H;
    if (left <= 0) timeFlags.push({ flag: 'expired', id: x.p0, pinId: x.pin.id, said: `The ${name(x.p0)} programme ended ${hoursSaid(-left)} ago: it extracts nothing until its heads are reset. What the colony makes here is at the rate it ran at` });
    else if (left <= ENDING_SOON_HOURS) timeFlags.push({ flag: 'endingSoon', id: x.p0, pinId: x.pin.id, said: `The ${name(x.p0)} programme ends in ${hoursSaid(left)}: reset its heads before then` });
  }

  const to = new Map<number, Map<number, number[]>>(), from = new Map<number, Map<number, number[]>>();
  const link = (m: Map<number, Map<number, number[]>>, a: number, g: number, b: number) => {
    let x = m.get(a);
    if (!x) m.set(a, x = new Map());
    const xs = x.get(g) ?? [];
    if (!xs.includes(b)) x.set(g, [...xs, b].sort((p, q) => p - q));
  };
  for (const [src, dst, g] of k.routes) { link(to, src, g, dst); link(from, dst, g, src); }
  const buffer = new Set(k.pins.filter((p) => { const kd = PIN_OF.get(p.typeId)?.kind; return kd === 'storage' || kd === 'launchpad'; }).map((p) => p.id));
  const facAt = new Map(facs.map((f) => [f.pin.id, f]));
  // A pin makes a good when it's a factory whose schematic does, or an extractor set on it or routing it out.
  const makes = (pinId: number, g: number) => facAt.get(pinId)?.s.out.id === g || (extPins.has(pinId) && (extPins.get(pinId) === g || !!to.get(pinId)?.has(g)));
  const madeHere = (g: number) => facs.some((f) => f.s.out.id === g) || [...extPins.keys()].some((id) => makes(id, g));
  const stored = new Set<number>();
  for (const b of buffer) for (const [g, srcs] of from.get(b) ?? []) if (srcs.some((s) => makes(s, g))) stored.add(g);

  // Each factory input, from the routes: reaches it, imported, or doesn't reach (a root: that factory makes nothing).
  const runs = new Set<number>(), imported = new Map<number, Set<number>>();
  const routeFlags: ChainFlagRow[] = [];
  for (const f of facs) {
    // The inputs that don't reach it, by why: one flag a factory for each why, naming its inputs together.
    const misses = new Map<'none' | 'notMaker' | 'storage' | 'launchpad', number[]>();
    for (const i of f.s.inputs) {
      const srcs = from.get(f.pin.id)?.get(i.id) ?? [];
      const stores = srcs.filter((s) => buffer.has(s));
      if (srcs.some((s) => makes(s, i.id) || (buffer.has(s) && (from.get(s)?.get(i.id) ?? []).some((q) => makes(q, i.id))))) continue;
      if (stores.length && !madeHere(i.id)) {
        if (!imported.has(f.pin.id)) imported.set(f.pin.id, new Set());
        imported.get(f.pin.id)!.add(i.id);
        continue;
      }
      const kd = stores.length ? kindOf(stores[0]) : null;
      push(misses, kd === 'storage' || kd === 'launchpad' ? kd : srcs.length ? 'notMaker' : 'none', i.id);
    }
    if (!misses.size) { runs.add(f.pin.id); continue; }
    const where = `${FACTORY[f.s.facility]} factory making ${name(f.s.out.id)}`;
    for (const [why, ids] of misses) {
      const goods = listSaid(ids.map(name)), them = ids.length > 1 ? 'them' : 'it';
      routeFlags.push({
        flag: 'starving', id: ids[0], pinId: f.pin.id,
        said: why === 'storage' || why === 'launchpad' ? `${cap(where)} draws ${goods} from ${A_HOLD[why]} nothing routes ${them} into, so it makes none`
          : why === 'notMaker' ? `Nothing that makes ${goods} routes ${them} into ${where}, so it makes none`
            : `Nothing routes ${goods} into ${where}, so it makes none`,
      });
    }
  }
  const net: Net = { exts, facs, to, buffer, runs, imported, stored };

  // What a pin makes and routes nowhere.
  const pinFlags: ChainFlagRow[] = [];
  const unroutedMaker = new Set<number>();
  for (const x of exts) if (!to.get(x.pin.id)?.has(x.p0)) { unroutedMaker.add(x.p0); pinFlags.push({ flag: 'buildingUp', id: x.p0, pinId: x.pin.id, said: `${name(x.p0)} from its extractor isn’t routed anywhere` }); }
  for (const f of facs) {
    if (!to.get(f.pin.id)?.has(f.s.out.id)) { unroutedMaker.add(f.s.out.id); pinFlags.push({ flag: 'buildingUp', id: f.s.out.id, pinId: f.pin.id, said: `${name(f.s.out.id)} from ${FACTORY[f.s.facility]} factory isn’t routed anywhere` }); }
  }

  const known = exts.every((x) => x.perHour != null);
  const flow = known ? flowOf(net, (x) => x.perHour!) : null;
  const anyHigher = exts.some((x) => x.higher != null);
  const high = known && anyHigher ? flowOf(net, (x) => x.higher ?? x.perHour!) : null;

  // What the running factories take of each good from the planet, and which they are.
  const need = new Map<number, number>(), takers = new Map<number, Fac[]>();
  for (const f of facs) {
    if (!runs.has(f.pin.id)) continue;
    for (const i of f.s.inputs) if (!imported.get(f.pin.id)?.has(i.id)) { add(need, i.id, anHour(f.s, i.qty)); push(takers, i.id, f); }
  }
  const reached = (fl: Flow, g: number) => (takers.get(g) ?? []).reduce((t, f) => t + (fl.recv.get(f.pin.id)?.get(g) ?? 0), 0);
  const fullOf = (g: number) => facs.filter((f) => f.s.out.id === g).reduce((t, f) => t + anHour(f.s, f.s.out.qty), 0);
  const takersSaid = (g: number) => `the ${listSaid([...new Set((takers.get(g) ?? []).map((f) => name(f.s.out.id)))])} factories`;
  const runSaid = (share: number) => (share * 100 < 1 ? 'make nothing' : `run ${Math.floor(share * 100)}% of the time`);

  const goodFlags: ChainFlagRow[] = [], idleFlags: ChainFlagRow[] = [];
  if (flow) {
    // Short: under the band. A root is said; a shortfall a flag before it explains (an extractor with no programme, a maker routed
    // nowhere, makers that would supply it at full rate but run short of their own inputs) is carried in that root's words.
    const short = (g: number) => reached(flow, g) < STARVING_BELOW * need.get(g)!;
    const explained = new Set<number>(), roots: { g: number; kind: 'routes' | 'short' }[] = [];
    for (const g of [...need.keys()].sort((a, b) => tierAt(a) - tierAt(b) || a - b)) {
      if (!short(g)) continue;
      const n = need.get(g)!, made = flow.made.get(g) ?? 0, p0 = tierAt(g) === 0;
      if ((p0 && idle.some((x) => x.fac == null && extPins.has(x.pin.id) && (x.p0 == null || x.p0 === g))) || unroutedMaker.has(g)) explained.add(g);
      else if (made >= STARVING_BELOW * n) roots.push({ g, kind: 'routes' });
      else if (!p0 && fullOf(g) >= STARVING_BELOW * n) explained.add(g);
      else roots.push({ g, kind: 'short' });
    }
    // The factories after a good that its shortfall holds back, each said once: "the Nanites factories run 75% of the time".
    const downstream = (g: number, self: boolean): string[] => {
      const parts: string[] = [], seen = new Set<number>([g]), queue = [g];
      if (self && short(g)) parts.push(`${takersSaid(g)} ${runSaid(reached(flow, g) / need.get(g)!)}`);
      while (queue.length) {
        const q = queue.shift()!;
        for (const f of takers.get(q) ?? []) {
          const p = f.s.out.id;
          if (seen.has(p)) continue;
          seen.add(p);
          if (need.has(p) && explained.has(p) && short(p)) { parts.push(`${takersSaid(p)} ${runSaid(reached(flow, p) / need.get(p)!)}`); queue.push(p); }
        }
      }
      return parts;
    };
    for (const { g, kind } of roots) {
      const n = need.get(g)!, got = reached(flow, g), made = flow.made.get(g) ?? 0;
      const reach = got > MIN_FLOW ? `${dayCount(got)} an hour reach` : 'none reaches';
      const down = downstream(g, false);
      const after = down.length ? `; with them, ${listSaid(down)}` : '';
      let said: string;
      if (kind === 'routes') {
        said = `${name(g)}: ${dayCount(made)} an hour are made, but ${reach} ${takersSaid(g)}, which take ${dayCount(n)}: the rest is routed elsewhere, so they ${runSaid(got / n)}${after}`;
      } else if (tierAt(g) === 0) {
        const enough = high != null && reached(high, g) >= STARVING_BELOW * n;
        const other = enough ? ` on the lower reading of extraction (on the higher reading the extractors give ${dayCount(high.made.get(g) ?? 0)} an hour, enough)` : '';
        said = `${name(g)}: ${reach} ${takersSaid(g)}, which take ${dayCount(n)}, so they ${runSaid(got / n)}${other}${after}`;
      } else {
        said = `${name(g)}: its factories make ${dayCount(fullOf(g))} an hour at most, and ${takersSaid(g)} take ${dayCount(n)}, so they ${runSaid(got / n)}${after}`;
      }
      goodFlags.push({ flag: 'starving', id: g, pinId: null, said });
    }
    // More than the factories a pin is routed to take, and nothing routes it to storage or a launchpad.
    for (const [g, left] of [...flow.unrouted].sort((a, b) => tierAt(a[0]) - tierAt(b[0]) || a[0] - b[0])) {
      if (left > MIN_FLOW) goodFlags.push({ flag: 'buildingUp', id: g, pinId: null, said: `${dayCount(left * 24)} ${name(g)} a day is more than the factories it’s routed to take, and none of it is routed to storage or a launchpad` });
    }
    for (const x of idle) {
      const down = x.fac == null && x.p0 != null && need.has(x.p0) ? downstream(x.p0, true) : [];
      idleFlags.push({ flag: 'idle', id: null, pinId: x.pin.id, said: x.said + (down.length ? `; with it, ${listSaid(down)}` : '') });
    }
  } else {
    for (const x of idle) idleFlags.push({ flag: 'idle', id: null, pinId: x.pin.id, said: x.said });
  }
  idleFlags.sort((a, b) => a.pinId! - b.pinId!);

  // Storage or a launchpad near its capacity (the bundle's, by the pin's own planet type), as of the colony's last update in game.
  const fullFlags: ChainFlagRow[] = [];
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
      fullFlags.push({ flag: 'storageFull', id: null, pinId: pin.id, said: `${HOLDS[of.kind]} ${Math.round((m3 / capacity) * 100)}% full as of the colony’s last update in game: ${unknown ? 'at least ' : ''}${unitsSaid(m3)} of ${unitsSaid(capacity)} m³` });
    }
  }
  const flags = [...idleFlags, ...timeFlags, ...routeFlags, ...pinFlags, ...goodFlags, ...fullFlags];

  const makesBy = new Map<number, ChainMake>();
  for (const f of facs) {
    const m = makesBy.get(f.s.id) ?? { id: f.s.out.id, perDay: flow ? 0 : null, facility: f.s.facility, count: 0 };
    m.count++;
    if (flow) m.perDay! += (flow.ratio.get(f.pin.id) ?? 0) * anHour(f.s, f.s.out.qty) * 24;
    makesBy.set(f.s.id, m);
  }
  const makesList = [...makesBy.values()].sort((a, b) => tierAt(a.id) - tierAt(b.id) || a.id - b.id);
  const extracts: ChainExtract[] = exts.map((x) => ({
    pinId: x.pin.id, p0: x.p0, perHour: x.perHour, higher: x.higher, programHours: x.programHours,
    heads: x.pin.extractor?.heads ?? 0, ends: x.pin.expiry ? Date.parse(x.pin.expiry) : null, why: x.why,
  }));
  const imports = flow ? [...flow.imports].sort((a, b) => tierAt(a[0]) - tierAt(b[0]) || a[0] - b[0]).map(([id, perHour]) => ({ id, perDay: perHour * 24 })) : [];
  const base = { planetId: k.planetId, planetType: k.planetType, level: k.level, lastUpdate: k.lastUpdate, extracts, makes: makesList, imports, flags };
  const blank = { iskDay: null, iskDayHigh: null, taxDay: null, perPct: 0, taxes: [], before: [] };

  if (!flow) {
    const unknown = exts.filter((x) => x.perHour == null);
    return {
      ...base, ...blank, outputs: [], unvalued: 0, unshipped: 0,
      why: `What it makes isn’t known: ${unknown[0].why}${unknown.length > 1 ? `, and ${unknown.length - 1} more extractor${unknown.length > 2 ? 's' : ''} the same` : ''}`,
    };
  }
  const v = valuedOf(ix, flow, sell, tax);
  // Its inputs come from off the planet: what they cost isn't known here, so no figure, never one without them (Ruling T15-2).
  const brought = [...new Set([...imported.values()].flatMap((s) => [...s]))].sort((a, b) => tierAt(a) - tierAt(b) || a - b);
  if (brought.length) {
    const one = brought.length === 1;
    return {
      ...base, ...blank, outputs: v.outputs, unvalued: v.unvalued, unshipped: v.unshipped,
      why: `Its ${listSaid(brought.map(name))} come${one ? 's' : ''} from off the planet, and ${one ? 'its' : 'their'} cost isn’t known here`,
    };
  }
  const before: Chain['before'] = [];
  if (v.taxDay == null) before.push('tax');
  if (v.unvalued) before.push('price');
  // Nothing it ships is valued: no figure, never one made of customs alone; the outputs' own reasons say why.
  const shipped = v.outputs.filter((o) => o.sold !== NOT_SHIPPED);
  const none = shipped.length > 0 && shipped.every((o) => o.sold.isk == null);
  return {
    ...base, outputs: v.outputs,
    iskDay: none ? null : v.value,
    iskDayHigh: none || !high ? null : valuedOf(ix, high, sell, tax).value,
    taxDay: none ? null : v.taxDay, perPct: v.perPctBase / 100, taxes: v.taxes, before, unvalued: v.unvalued, unshipped: v.unshipped,
    why: none ? cap([...new Set(shipped.map((o) => o.sold.why ?? 'no price read'))].join('; ')) : null,
  };
}

/**
 * Whether a best's layout for the planet fits at the colony's own Command Center Upgrades level. The planner fits it at the level
 * it was given (`fit`, `lacks`); its CPU and powergrid don't move with the level, so they're set against the colony's own budget.
 * With no fit checked (the planet's size not known), nothing says it doesn't.
 */
function fitsHere(ix: PiIndex, chain: Chain, role: Role | undefined): boolean {
  const fit = role?.fit;
  if (!fit) return true;
  const cc = chain.planetType ? ix.planetTypes[chain.planetType]?.cc[chain.level] : undefined;
  return cc ? fit.cpu <= cc.cpu && fit.pg <= cc.pg : fit.fits && !role!.lacks;
}

/**
 * The real planet against the best single-planet setup the planner gives that planet alone: the better of `planSingle`'s P0 → P1
 * and P0 → P2 with `planets` holding only it, at the same rates and at the colony's own level (the caller makes that call: its
 * `char.ccLevel` the chain's `level`). `gain` is what the best makes a day more; within a cent of it, or above, the colony is
 * already the best and nothing is said (gain 0). A best that doesn't fit at the colony's own level is no better: nothing said,
 * never a suggestion to train (Ruling T15-1). With no valued ISK on either side, or an output unpriced on either side, gain is
 * null and the words say why: never a gain against 0. A best resting on a rate the planner assumes (a P0 no colony has shown)
 * says so, and so does one before the customs tax. The planet's name isn't in the chain: the page puts it in front.
 */
export function versusBest(chain: Chain, best: Setup | null, ix: PiIndex): { gain: number | null; said: string } {
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  if (!best) return { gain: null, said: 'The planner has no single-planet setup for this planet to set it against' };
  if (chain.iskDay == null) return { gain: null, said: `It isn’t set against the planner’s best: ${low(chain.why ?? 'what it makes isn’t valued')}` };
  if (best.iskDay == null) return { gain: null, said: `It isn’t set against the planner’s best, which has no figure here: ${low(best.why ?? 'what it would make isn’t valued')}` };
  // An output with no price on either side: credited nothing (I1), it would count as worthless against the other side's.
  const unpriced = [...chain.outputs, ...best.outputs].filter((o) => o.sold.isk == null);
  if (unpriced.length) {
    const names = [...new Set(unpriced.map((o) => name(o.id)))];
    return { gain: null, said: `It isn’t set against the planner’s best while ${listSaid(names)} ${names.length > 1 ? 'have' : 'has'} no price: ${[...new Set(unpriced.map((o) => low(o.sold.why ?? 'no price read')))].join('; ')}` };
  }
  const role = best.roles.find((r) => r.planetId === chain.planetId && r.does !== 'unused');
  if (!fitsHere(ix, chain, role)) return { gain: 0, said: '' };
  const gain = best.iskDay - chain.iskDay;
  if (!(gain > SAME_ISK)) return { gain: 0, said: '' };

  const top = chain.makes.length ? Math.max(...chain.makes.map((m) => TIERS.indexOf(ix.byId.get(m.id)?.tier ?? 'P0'))) : -1;
  const tops = chain.makes.filter((m) => TIERS.indexOf(ix.byId.get(m.id)?.tier ?? 'P0') === top).map((m) => m.id);
  const what = tops.length ? `Makes ${listSaid(tops.map(name))}`
    : chain.extracts.length ? `Extracts ${listSaid([...new Set(chain.extracts.map((x) => x.p0))].map(name))}` : 'Makes nothing';
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
