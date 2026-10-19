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
import { PI_READING, type Rate } from './piLearn';
import { anHour, fallbackGoods, keptSold, keptWhy, listSaid, planSingle, taxRows, valuedOutput, type Hold, type Output, type PlanInput, type Reserve, type Role, type Sell, type Setup, type Sold } from './piPlan';
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
/**
 * Another product is said only when it pays at least this share of the colony's ISK a day more (Ruling T15b-6): it rests on a rate the
 * colony hasn't shown (another P0's, typed or assumed), so a sliver on a guess is noise (the user: "not too tight"). The colony's own
 * fault, on its own rates, still speaks above a cent.
 */
export const OTHER_PRODUCT_MIN = 0.1;
const TIERS: Tier[] = ['P0', 'P1', 'P2', 'P3', 'P4'];
/** What holds goods a route can go into and out of: storage, a launchpad and the command centre (Ruling T15-6). */
type Holder = 'storage' | 'launchpad' | 'command';
const isHolder = (kd: PinKind | null | undefined): kd is Holder => kd === 'storage' || kd === 'launchpad' || kd === 'command';
const FACTORY: Record<Facility, string> = { basic: 'a Basic', advanced: 'an Advanced', hightech: 'a High-Tech' };
const HOLDS: Record<'storage' | 'launchpad', string> = { storage: 'Storage', launchpad: 'Launchpad' };
const A_HOLD: Record<Holder, string> = { storage: 'a storage facility', launchpad: 'a launchpad', command: 'the command centre' };
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
  /**
   * Storage, launchpads and the command centre: what's routed into one is drawn by the factories routed from it, and what's left
   * is exported.
   */
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
 * are stock, never a rate. The command centre is followed as storage is (Ruling T15-6), here and wherever storage is said below.
 * A factory runs at the least share of its inputs (fewer cycles when short, as the planner's), an imported input counting as kept
 * stocked; what it drew beyond what it uses goes back to storage when it came from there.
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
    if (!net.runs.has(f.pin.id)) continue;
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
 * has nowhere to go builds up. What reaches storage is shipped only while a unit nets above nothing after the planet's export tax,
 * else it stays, building up, untaxed (Ruling T15-5: the planner's own rule, `keptWhy`), and a P0 with no price stays the same way.
 * Customs on what sells of the goods that are priced (`taxRows`, as the planner taxes); a good nobody prices adds no ISK and pays no
 * tax (the planner's I1), and one that can't leave sells none.
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
    const kept = shipped ? keptWhy(ix, sell, id, tax.rate) : null;
    const sold = !shipped ? NOT_SHIPPED : kept ? keptSold(kept.why) : sell(id, out * 24);
    outputs.push({
      id, perDay: (out + held) * 24, sold, buildingUp: held * 24 + (shipped && sold.isk != null ? Math.max(0, out * 24 - sold.units) : 0),
      ...(kept ? { stays: { perDay: out * 24, why: kept.why, noPrice: kept.noPrice } } : {}),
    });
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
 * reach: `starving` at that factory, which makes nothing (drawn from storage, a launchpad or the command centre that nothing on the
 * planet routes it into, it runs only on what you bring in, which isn't counted here, and is said so). A P0 is never brought in (the
 * planner never buys one): drawn from a holder nothing fills, it's an extractor's with no programme on the planet when there is one
 * (its `idle` flag names the factories it leaves making nothing), else that factory's own flag, which makes none. The command centre
 * is storage here (Ruling T15-6).
 *
 * The flags, only at the root of what's wrong (Ruling T15-3): an input reaching its factories at under `STARVING_BELOW` of what they
 * take (`starving`, judged on the lower reading and saying when the higher one gives enough, its words naming the factories after it
 * that it holds back), never one explained by a flag before it (an extractor with no programme, for the P0 it's set on or, with
 * none set, those its routes carry; a maker routed nowhere; factories short of their own inputs); an extractor's or a running
 * factory's product routed nowhere, or more of it than the factories it's routed to take with no route to storage or a launchpad
 * (`buildingUp`: a factory that doesn't run makes nothing to build up); storage or a launchpad at `STORAGE_FULL` of its capacity as of the colony's last update in
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
  // The command centre holds goods too, and a route into or out of it is followed as storage's is (Ruling T15-6).
  const buffer = new Set(k.pins.filter((p) => isHolder(PIN_OF.get(p.typeId)?.kind)).map((p) => p.id));
  const facAt = new Map(facs.map((f) => [f.pin.id, f]));
  // A pin makes a good when it's a factory whose schematic does, or an extractor set on it or routing it out.
  const makes = (pinId: number, g: number) => facAt.get(pinId)?.s.out.id === g || (extPins.has(pinId) && (extPins.get(pinId) === g || !!to.get(pinId)?.has(g)));
  const madeHere = (g: number) => facs.some((f) => f.s.out.id === g) || [...extPins.keys()].some((id) => makes(id, g));
  const stored = new Set<number>();
  for (const b of buffer) for (const [g, srcs] of from.get(b) ?? []) if (srcs.some((s) => makes(s, g))) stored.add(g);

  // An extractor with no programme on a P0 (or none set) on the planet, which explains a factory drawing that P0 from a holder nothing
  // fills: a P0 is never brought in (the planner never buys one), so such a factory is the idle extractor's to say, not its own.
  const idleFor = (g: number) => idle.find((x) => x.fac == null && extPins.has(x.pin.id) && (x.p0 == null || x.p0 === g)) ?? null;
  // Each idle extractor's pin → the goods of the factories it leaves making nothing that way.
  const heldBack = new Map<number, number[]>();

  // Each factory input, from the routes: reaches it, imported, or doesn't reach (a root: that factory makes nothing).
  const runs = new Set<number>(), imported = new Map<number, Set<number>>();
  const routeFlags: ChainFlagRow[] = [];
  for (const f of facs) {
    // The inputs that don't reach it, by why: one flag a factory for each why, naming its inputs together. A P0 drawn from a holder
    // has words of its own (`${holder}:p0`): it can't be brought in.
    const misses = new Map<'none' | 'notMaker' | Holder | `${Holder}:p0`, number[]>();
    let idleHeld = false;
    for (const i of f.s.inputs) {
      const srcs = from.get(f.pin.id)?.get(i.id) ?? [];
      const stores = srcs.filter((s) => buffer.has(s));
      if (srcs.some((s) => makes(s, i.id) || (buffer.has(s) && (from.get(s)?.get(i.id) ?? []).some((q) => makes(q, i.id))))) continue;
      const p0 = tierAt(i.id) === 0;
      if (stores.length && !madeHere(i.id) && !p0) {
        if (!imported.has(f.pin.id)) imported.set(f.pin.id, new Set());
        imported.get(f.pin.id)!.add(i.id);
        continue;
      }
      const kd = stores.length ? kindOf(stores[0]) : null;
      if (p0 && isHolder(kd)) {
        const x = idleFor(i.id);
        if (x) { push(heldBack, x.pin.id, f.s.out.id); idleHeld = true; continue; }
        push(misses, `${kd}:p0`, i.id);
        continue;
      }
      push(misses, isHolder(kd) ? kd : srcs.length ? 'notMaker' : 'none', i.id);
    }
    if (!misses.size) { if (!idleHeld) runs.add(f.pin.id); continue; }
    const where = `${FACTORY[f.s.facility]} factory making ${name(f.s.out.id)}`;
    for (const [why, ids] of misses) {
      const goods = listSaid(ids.map(name)), them = ids.length > 1 ? 'them' : 'it';
      const p0 = why.endsWith(':p0'), hold = why === 'none' || why === 'notMaker' ? null : (p0 ? why.slice(0, -3) : why) as Holder;
      routeFlags.push({
        flag: 'starving', id: ids[0], pinId: f.pin.id,
        said: hold && p0
          ? `${cap(where)} draws ${goods} from ${A_HOLD[hold]}, which nothing on the planet routes ${them} into, so it makes none`
          : hold ? `${cap(where)} draws ${goods} from ${A_HOLD[hold]}, which nothing on the planet routes ${them} into: it runs only on what you bring in, and isn’t counted here`
            : why === 'notMaker' ? `Nothing that makes ${goods} routes ${them} into ${where}, so it makes none`
              : `Nothing routes ${goods} into ${where}, so it makes none`,
      });
    }
  }
  const net: Net = { exts, facs, to, buffer, runs, imported, stored };

  // What a pin makes and routes nowhere. A factory that doesn't run makes nothing to build up: its own flag is the one said (R4).
  const pinFlags: ChainFlagRow[] = [];
  const unroutedMaker = new Set<number>();
  for (const x of exts) if (!to.get(x.pin.id)?.has(x.p0)) { unroutedMaker.add(x.p0); pinFlags.push({ flag: 'buildingUp', id: x.p0, pinId: x.pin.id, said: `${name(x.p0)} from its extractor isn’t routed anywhere` }); }
  for (const f of facs) {
    if (!runs.has(f.pin.id) || to.get(f.pin.id)?.has(f.s.out.id)) continue;
    unroutedMaker.add(f.s.out.id);
    pinFlags.push({ flag: 'buildingUp', id: f.s.out.id, pinId: f.pin.id, said: `${name(f.s.out.id)} from ${FACTORY[f.s.facility]} factory isn’t routed anywhere` });
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

  // What an extractor with no programme stands for: the P0 it's set on, or with none set, only the goods its routes carry (R6), so it
  // never explains another extractor's real shortfall.
  const idleGoods = (x: (typeof idle)[number]): number[] =>
    x.fac != null || !extPins.has(x.pin.id) ? [] : x.p0 != null ? [x.p0] : [...(to.get(x.pin.id)?.keys() ?? [])].sort((a, b) => a - b);
  const goodFlags: ChainFlagRow[] = [], idleFlags: ChainFlagRow[] = [];
  if (flow) {
    // Short: under the band. A root is said; a shortfall a flag before it explains (an extractor with no programme, a maker routed
    // nowhere, makers that would supply it at full rate but run short of their own inputs) is carried in that root's words.
    const short = (g: number) => reached(flow, g) < STARVING_BELOW * need.get(g)!;
    const explained = new Set<number>(), roots: { g: number; kind: 'routes' | 'short' }[] = [];
    for (const g of [...need.keys()].sort((a, b) => tierAt(a) - tierAt(b) || a - b)) {
      if (!short(g)) continue;
      const n = need.get(g)!, made = flow.made.get(g) ?? 0, p0 = tierAt(g) === 0;
      if ((p0 && idle.some((x) => idleGoods(x).includes(g))) || unroutedMaker.has(g)) explained.add(g);
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
      // What it holds back: the factories taking its P0 (and those after them), and those drawing its P0 from a holder nothing fills.
      const held = [...new Set(heldBack.get(x.pin.id) ?? [])].sort((a, b) => a - b);
      const down = [...new Set([
        ...idleGoods(x).filter((g) => need.has(g)).flatMap((g) => downstream(g, true)),
        ...held.flatMap((g) => [`the ${name(g)} factories make nothing`, ...downstream(g, true)]),
      ])];
      idleFlags.push({ flag: 'idle', id: null, pinId: x.pin.id, said: x.said + (down.length ? `; with it, ${listSaid(down)}` : '') });
    }
  } else {
    for (const x of idle) {
      const held = [...new Set(heldBack.get(x.pin.id) ?? [])].sort((a, b) => a - b).map((g) => `the ${name(g)} factories make nothing`);
      idleFlags.push({ flag: 'idle', id: null, pinId: x.pin.id, said: x.said + (held.length ? `; with it, ${listSaid(held)}` : '') });
    }
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
  // Only a running factory's imports: one whose other input doesn't reach it draws nothing (its own flag says why).
  const brought = [...new Set([...imported].filter(([id]) => runs.has(id)).flatMap(([, s]) => [...s]))].sort((a, b) => tierAt(a) - tierAt(b) || a - b);
  if (brought.length) {
    const one = brought.length === 1;
    return {
      ...base, ...blank, outputs: v.outputs, unvalued: v.unvalued, unshipped: v.unshipped,
      why: `Its ${listSaid(brought.map(name))} come from off the planet, and ${one ? 'its' : 'their'} cost isn’t known here`,
    };
  }
  const before: Chain['before'] = [];
  if (v.taxDay == null) before.push('tax');
  if (v.unvalued) before.push('price');
  // Nothing it ships is valued (a P0 kept for want of a price is no figure either): no figure, never one made of customs alone; the
  // outputs' own reasons say why.
  const shipped = v.outputs.filter((o) => o.sold !== NOT_SHIPPED);
  const none = shipped.length > 0 && !shipped.some(valuedOutput);
  return {
    ...base, outputs: v.outputs,
    iskDay: none ? null : v.value,
    iskDayHigh: none || !high ? null : valuedOf(ix, high, sell, tax).value,
    taxDay: none ? null : v.taxDay, perPct: v.perPctBase / 100, taxes: v.taxes, before, unvalued: v.unvalued, unshipped: v.unshipped,
    why: none ? cap([...new Set(shipped.map((o) => o.sold.why ?? 'no price read'))].join('; ')) : null,
  };
}

/**
 * The storage facilities and launchpads standing on a kept colony, as `PlanInput.reserve` takes them (Ruling T15b-1): the best
 * `versusBest` sets the colony against is planned with them kept beside its own layout (`planSingle({ …, reserve: reserveFor(k) })`),
 * so it can't win by spending the colony's storage on a factory. The command centre isn't a structure the fit counts.
 */
export function reserveFor(k: KeptColony): Record<number, Reserve> {
  let storage = 0, launchpads = 0;
  for (const p of k.pins) {
    const kd = PIN_OF.get(p.typeId)?.kind;
    if (kd === 'storage') storage++;
    else if (kd === 'launchpad') launchpads++;
  }
  return { [k.planetId]: { storage, launchpads } };
}

/**
 * The factories a kept colony runs, by what they make, as `PlanInput.hold` takes them (Ruling T15b-4): the best `versusBest` sets
 * the colony against makes the colony's own products on these counts (`planSingle({ …, hold: holdFor(k, ix) })`), so for those
 * products it speaks only when the same factories could make more. A factory with no schematic, or one the planets data doesn't
 * hold, makes nothing to hold.
 */
export function holdFor(k: KeptColony, ix: PiIndex): Record<number, Hold> {
  const hold: Hold = {};
  for (const p of k.pins) {
    const kd = PIN_OF.get(p.typeId)?.kind;
    if (kd !== 'basic' && kd !== 'advanced' && kd !== 'hightech') continue;
    const s = p.schematic != null ? schematicOf(ix, p.schematic) : null;
    if (s) hold[s.out.id] = (hold[s.out.id] ?? 0) + 1;
  }
  return { [k.planetId]: hold };
}

const FAC_COUNT: Record<Facility, [string, string]> = { basic: ['Basic', 'Basics'], advanced: ['Advanced', 'Advanced'], hightech: ['High-Tech', 'High-Tech'] };
/**
 * What differs between a colony and the planner's layout for the same products on the same factories (`holdFor`; Ruling T15b-4),
 * said after "pays X more a day": factories making less than the same count can, which the colony's flags explain (": your 2
 * Advanced on Mechanical Parts make 120 a day where they can make 240 (a flag above says why)"), or, with every factory making what
 * it can, the same factories with all they make shipped (an output routed nowhere, say). Another count of factories on a good says
 * nothing (the user's 2 Basics, one for each P1, for each Advanced: "there is no point to it … i would just be overproducing one of the
 * p1's"), whichever way it trades: null, and `versusBest` is silent.
 */
function differsSaid(chain: Chain, role: Role, ix: PiIndex): { short: string | null; mixed: boolean; flagged: boolean } {
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  type Run = { count: number; perDay: number; facility: Facility };
  const sum = (xs: readonly { id: number; count: number; perDay: number | null; facility: Facility }[]) => {
    const m = new Map<number, Run>();
    for (const x of xs) {
      const r = m.get(x.id) ?? { count: 0, perDay: 0, facility: x.facility };
      r.count += x.count; r.perDay += x.perDay ?? 0;
      m.set(x.id, r);
    }
    return m;
  };
  const mine = sum(chain.makes), theirs = sum(role.makes);
  const ids = [...new Set([...mine.keys(), ...theirs.keys()])].sort((a, b) => TIERS.indexOf(ix.byId.get(a)?.tier ?? 'P0') - TIERS.indexOf(ix.byId.get(b)?.tier ?? 'P0') || a - b);
  const short: string[] = [];
  let mixed = false;
  for (const id of ids) {
    const c = mine.get(id), b = theirs.get(id);
    // Another count of factories on a good is another mix: nothing is said for it (Ruling T15b-4). Held to the colony's own
    // factories (`holdFor`), the planner runs fewer only where its rates feed no more, which makes no more than the colony's.
    if (!c || !b || c.count !== b.count) { mixed = true; continue; }
    const n = `${c.count} ${FAC_COUNT[c.facility][c.count === 1 ? 0 : 1]}`;
    if (b.perDay > 0 && c.perDay < STARVING_BELOW * b.perDay) short.push(`your ${n} on ${name(id)} make ${dayCount(c.perDay)} a day where they can make ${dayCount(b.perDay)}`);
  }
  const flagged = chain.flags.some((f) => f.flag === 'starving' || f.flag === 'idle' || f.flag === 'buildingUp');
  return { short: short.length ? `${listSaid(short)}${flagged ? ' (a flag above says why)' : ''}` : null, mixed, flagged };
}

/**
 * Whether a best's layout for the planet fits at the colony's own Command Center Upgrades level. The planner fits it at the level
 * it was given (`fit`, `lacks`); its CPU and powergrid don't move with the level, so they're set against the colony's own budget.
 * With no fit checked (the planet's size not known), it isn't known to fit: no better either (Ruling T15-6, the re-review's R5).
 */
function fitsHere(ix: PiIndex, chain: Chain, role: Role | undefined): boolean {
  const fit = role?.fit;
  if (!fit) return false;
  const cc = chain.planetType ? ix.planetTypes[chain.planetType]?.cc[chain.level] : undefined;
  return cc ? fit.cpu <= cc.cpu && fit.pg <= cc.pg : fit.fits && !role!.lacks;
}

/**
 * The planner's two setups `versusBest` sets a kept colony against, planned as Plan plans (the caller's `input`: the rates Plan uses,
 * `rateFor`'s with its fallbacks, its prices and program length; Plan's whole-system input will do), held to the colony's planet
 * alone, one planet allowed (Ruling T15b-9), at the colony's own level, beside its own storage and launchpads (`reserveFor`, Ruling
 * T15b-1), with its own products held to its own factories (`holdFor`, Ruling T15b-4):
 * - `best`, the better of P0 → P1 and P0 → P2 over every product, on Plan's rates;
 * - `own`, the colony's own products on its own factories alone, on the colony's own extraction for its own P0s (the chain's
 *   `extracts`, summed by P0; one it doesn't extract, nothing: Ruling T15b-10), so "the same factories could make more" is the
 *   factories' alone: a planet that yields less than its Basics take says so in its flags, never as its factories' fault. Null when
 *   the planner makes no single-planet layout of them (a P3, or Basics no Advanced takes from).
 * Both null when the input doesn't hold the colony's planet: versusBest then says there is no setup.
 */
export function bestsFor(k: KeptColony, chain: Chain, ix: PiIndex, input: PlanInput): { best: Setup | null; own: Setup | null } {
  const planets = input.planets.filter((p) => p.planetId === k.planetId);
  if (!planets.length) return { best: null, own: null };
  const like: PlanInput = { ...input, planets, char: { ...input.char, planets: 1, ccLevel: k.level }, reserve: reserveFor(k), hold: holdFor(k, ix) };
  const pick = (a: Setup, b: Setup) => ((b.iskDay ?? -Infinity) >= (a.iskDay ?? -Infinity) ? b : a);
  const best = pick(planSingle(like, 'p1'), planSingle(like, 'p2'));
  const extraction = (_t: PlanetType, p0: number): Rate => {
    const xs = chain.extracts.filter((x) => x.p0 === p0);
    const sum = (f: (x: ChainExtract) => number | null) => xs.reduce((n, x) => n + (f(x) ?? 0), 0);
    return {
      perHour: sum((x) => x.perHour), higher: xs.length && xs.every((x) => x.higher != null) ? sum((x) => x.higher) : null, from: 'learned',
      programHours: xs.find((x) => x.programHours != null)?.programHours ?? input.programHours, heads: sum((x) => x.heads), otherP0: false, checked: true,
    };
  };
  const ofOwn = (['p1', 'p2'] as const).map((kind) => planSingle({ ...like, rateOf: extraction, heldOnly: true }, kind))
    .filter((x) => x.roles.some((r) => r.planetId === k.planetId && r.does !== 'unused'));
  return { best, own: ofOwn.length ? ofOwn.reduce(pick) : null };
}

/**
 * The real planet against the best single-planet setups the planner gives that planet alone (`bestsFor`: at the rates Plan uses, at
 * the colony's own level, beside its own storage and launchpads, its own products held to its own factories on its own extraction).
 * Two things are said:
 * - **Its own products on its own factories** (`own`; Ruling T15b-4): only when the same factories could make more, saying what
 *   differs (`differsSaid`: factories making less than they can, with the flags' pointer), never another mix of factories. The user
 *   runs 2 Basics, one for each P1, for each Advanced, and on a third Basic selling P1: "there is no point to it … i would just be
 *   overproducing one of the p1's". So a gain from fixing the colony is said as the fault's, never as a product's. With its ISK
 *   known on both sides, above a cent, with the figure; with an output on the colony's side not priced, or the colony not valued, in
 *   counts alone, with why no figure (Ruling T15b-11): not known is never 0, and the fault is what this exists to catch.
 * - **Another product** (`best`; Ruling T15b-3), against the colony as it would be with that fixed ("more a day than that"), only
 *   when it pays at least `OTHER_PRODUCT_MIN` of the colony's day more (Ruling T15b-6), and only with both sides priced. A best
 *   making only goods the colony makes (its own P1s without the Advanced, say) is another mix of its factories, and says nothing. A
 *   best with no figure, or an output unpriced, withholds only this clause (Ruling T15b-7): the fault is still said, and with nothing
 *   else to say, why it isn't compared.
 * `gain` is what the planner's better layout makes a day more than the colony, null when the words carry no ISK figure; within a
 * cent of it, or above, nothing is said (gain 0). Without `own` (undefined), a best making the colony's own products stands in for
 * it. A layout that doesn't fit at the colony's own level, or whose fit isn't checked, is no better: nothing said, never a suggestion
 * to train (Ruling T15-1). A P0 left over with no price isn't an unpriced output: it stays on the planet, a known nothing on both
 * sides (Ruling T15-5), and the words say so when they speak. A layout resting on a rate the colony hasn't shown says so, each kind
 * in its own words (Ruling T15b-5: none, assumed; another P0's learned; typed), and so does one before the customs tax. The planet's
 * name isn't in the chain: the page puts it in front.
 */
export function versusBest(chain: Chain, best: Setup | null, ix: PiIndex, own?: Setup | null): { gain: number | null; said: string } {
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  if (!best) return { gain: null, said: 'The planner has no single-planet setup for this planet to set it against' };
  const roleOf = (s: Setup) => s.roles.find((r) => r.planetId === chain.planetId && r.does !== 'unused');
  const top = chain.makes.length ? Math.max(...chain.makes.map((m) => TIERS.indexOf(ix.byId.get(m.id)?.tier ?? 'P0'))) : -1;
  const tops = chain.makes.filter((m) => TIERS.indexOf(ix.byId.get(m.id)?.tier ?? 'P0') === top).map((m) => m.id);
  const what = tops.length ? `Makes ${listSaid(tops.map(name))}`
    : chain.extracts.length ? `Extracts ${listSaid([...new Set(chain.extracts.map((x) => x.p0))].map(name))}` : 'Makes nothing';
  // The products a layout tops out at: its Basics' on P0 → P1, its Advanced's on P0 → P2.
  const theirTop = (s: Setup) => (roleOf(s)?.makes ?? []).filter((m) => m.facility === (s.kind === 'p1' ? 'basic' : 'advanced')).map((m) => m.id);
  const sameAs = (s: Setup) => { const t = theirTop(s); return t.length > 0 && t.length === tops.length && t.every((id) => tops.includes(id)); };
  // A layout making nothing the colony doesn't (its own P1s without the Advanced, say) is another mix of its own factories, not
  // another product (Ruling T15b-4).
  const made = new Set(chain.makes.map((m) => m.id));
  const ownMix = (s: Setup) => { const r = roleOf(s); return !!r && r.makes.length > 0 && r.makes.every((m) => made.has(m.id)); };
  const mine = own === undefined ? (sameAs(best) ? best : null) : own && sameAs(own) ? own : null;
  const mineRole = mine ? roleOf(mine) : undefined;
  // What the colony's own factories could make more, in counts: needs no price.
  const d = mine && fitsHere(ix, chain, mineRole) ? differsSaid(chain, mineRole!, ix) : null;
  // A layout resting on a rate the colony hasn't shown is said as that, each kind in its own words, never claimed (Rulings T15b-3,
  // T15b-5): none (the planner assumes what two Basics take), another P0's learned rate, or one you typed.
  const guessOf = (role: Role | undefined) => {
    const unshown = (role?.extracts ?? []).filter((x) => !x.rate || x.rate.otherP0 || x.rate.from === 'typed');
    const namesOf = (xs: typeof unshown) => [...new Set(xs.map((x) => name(x.p0)))];
    const none = unshown.filter((x) => !x.rate), noneNames = namesOf(none);
    const other = namesOf(unshown.filter((x) => x.rate?.otherP0)), typed = namesOf(unshown.filter((x) => x.rate && !x.rate.otherP0));
    const withSaid = [...(other.length ? [`${listSaid(other)} at the rate learned for another P0`] : []), ...(typed.length ? [`${listSaid(typed)} at the rate you typed`] : [])];
    return (noneNames.length ? `, if it gets ${unitsSaid(none[0].perHour)} ${listSaid(noneNames)} an hour${noneNames.length > 1 ? ' each' : ''}, a rate no colony of yours has shown` : '')
      + (withSaid.length ? `, with ${listSaid(withSaid)}` : '');
  };
  // An output with no price: credited nothing (I1), it would count as worthless against the other side's. Said after "It isn't set
  // against the planner's best" or "no ISK figure".
  const noPrice = (os: readonly Output[]) => {
    const unpriced = os.filter((o) => o.sold.isk == null);
    if (!unpriced.length) return null;
    const names = [...new Set(unpriced.map((o) => name(o.id)))];
    return ` while ${listSaid(names)} ${names.length > 1 ? 'have' : 'has'} no price: ${[...new Set(unpriced.map((o) => low(o.sold.why ?? 'no price read')))].join('; ')}`;
  };

  // The colony's side not valued, or an output on it unpriced: no ISK is compared, but its own factories' fault is still said, in
  // counts alone (Ruling T15b-11).
  const side = chain.iskDay == null ? `: ${low(chain.why ?? 'what it makes isn’t valued')}`
    : noPrice([...chain.outputs, ...(mine ? mine.outputs : [])])
    ?? (mine && mine.iskDay == null ? `: ${low(mine.why ?? 'what it would make isn’t valued')}` : null);
  if (side) {
    if (d?.short) return { gain: null, said: `${what}; ${d.short}${guessOf(mineRole)}; no ISK figure${side}` };
    return { gain: null, said: `It isn’t set against the planner’s best${side}` };
  }
  const colony = chain.iskDay!;
  // Another product's layout with no figure, or an output unpriced, withholds only its own clause (Ruling T15b-7): the colony's own
  // fault, priced, is still said. Another mix of the colony's own factories is never said, so it withholds nothing.
  const bestHeld = best === mine || ownMix(best) ? null : best.iskDay == null
    ? `It isn’t set against the planner’s best, which has no figure here: ${low(best.why ?? 'what it would make isn’t valued')}`
    : noPrice(best.outputs) && `It isn’t set against the planner’s best${noPrice(best.outputs)}`;

  // Its own products on its own factories: said only when the same factories could make more (Ruling T15b-4).
  let base = colony, ownSaid = '';
  if (mine && d && mine.iskDay! - colony > SAME_ISK) {
    const tail = d.short ? `: ${d.short}` : !d.mixed ? `, with the same factories, all they make shipped${d.flagged ? ' (a flag above says what holds yours back)' : ''}` : null;
    if (tail) {
      ownSaid = `the planner’s own layout for it here pays ${iskBig(mine.iskDay! - colony)} more a day${tail}${guessOf(mineRole)}`;
      base = mine.iskDay!;
    }
  }
  // Another product, against the colony as it would be with that fixed, only from OTHER_PRODUCT_MIN of the colony's day (Ruling
  // T15b-6).
  let otherSaid = '';
  const bestRole = roleOf(best);
  const otherGain = best.iskDay == null ? null : best.iskDay - base;
  if (!bestHeld && otherGain != null && best !== mine && !ownMix(best) && fitsHere(ix, chain, bestRole) && otherGain > SAME_ISK && otherGain >= OTHER_PRODUCT_MIN * colony) {
    const t = theirTop(best), pays = `${iskBig(otherGain)} more a day${ownSaid ? ' than that' : ''}`;
    otherSaid = (best.kind === 'p1'
      ? `the best P1s it can make alone here${t.length ? `, ${listSaid(t.map(name))},` : ''} pay ${pays}`
      : `the best P2 it can make alone here${t.length ? `, ${name(t[0])},` : ''} pays ${pays}`) + guessOf(bestRole);
  }
  if (!ownSaid && !otherSaid) return bestHeld ? { gain: null, said: bestHeld } : { gain: 0, said: '' };
  const gain = (otherSaid ? best.iskDay! : base) - colony;

  // Only the layouts the words speak of say their tax and their P0 left over.
  const used = [...(otherSaid ? [best] : []), ...(ownSaid && mine ? [mine] : [])];
  const beforeTax = chain.before.includes('tax') || used.some((s) => s.before.includes('tax')) ? ', before the customs tax' : '';
  // A P0 left over with no price counts as nothing on both sides (Ruling T15-5), and is said.
  const left = [...new Set([...chain.outputs, ...used.flatMap((s) => s.outputs)].filter((o) => o.stays?.noPrice).map((o) => name(o.id)))];
  const unpricedP0 = left.length ? `; the ${listSaid(left)} left over ${left.length > 1 ? 'have' : 'has'} no price here, so neither counts ${left.length > 1 ? 'them' : 'it'}` : '';
  // Ruling F11: goods the hub doesn't price, valued at Jita's on either side, named (their own lines say each figure).
  const fellFrom = [chain.outputs, ...used.map((x) => x.outputs)];
  const fell = [...new Set(fellFrom.flatMap((os) => fallbackGoods(os)))];
  const hubOf = fellFrom.flat().find((o) => o.sold.fallback)?.sold.fallback?.hub;
  const atJita = fell.length ? `; valued at Jita’s for want of a ${hubOf} figure: ${listSaid(fell.map(name))}` : '';
  return { gain, said: `${what}; ${[ownSaid, otherSaid].filter(Boolean).join('; and ')}${beforeTax}${unpricedP0}${atJita}` };
}
