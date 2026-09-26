/**
 * Your actual planetary colonies, rather than a model of one.
 *
 * With the planets permission this stops being arithmetic on a number you typed and becomes a
 * reading: what each extractor is pulling, when its programme runs out, and what is sitting in the
 * launchpads waiting to be collected.
 *
 * The thing worth building this for is the expiry. An extraction programme runs for a set time and
 * then simply stops --- the colony sits there looking fine, the factories drain what is left, and
 * the whole thing quietly earns nothing until you notice. That is the most common way PI money is
 * lost, and it is a date in a field that nothing was reading.
 */

export type RawPin = {
  pin_id: number;
  type_id: number;
  expiry_time?: string;
  install_time?: string;
  last_cycle_start?: string;
  contents?: { type_id: number; amount: number }[];
  extractor_details?: {
    cycle_time?: number;
    product_type_id?: number;
    qty_per_cycle?: number;
    heads: { head_id: number }[];
  };
  factory_details?: { schematic_id: number };
};

export type RawColony = { pins: RawPin[]; links: unknown[]; routes?: unknown[] };

export type PlanetHead = {
  planetId: number;
  planetType: string;
  solarSystemId: number;
  upgradeLevel: number;
  numPins: number;
  lastUpdate: string;
};

export type PinKind = 'extractor' | 'factory' | 'storage';

/**
 * What a pin is, from its shape rather than a table of type IDs.
 *
 * An extractor carries extraction details, a factory carries a schematic, and everything else that
 * holds things is storage of one kind or another. No hardcoded list to go stale.
 */
export function classify(pin: RawPin): PinKind {
  if (pin.extractor_details) return 'extractor';
  if (pin.factory_details) return 'factory';
  return 'storage';
}

export type ExtractorState = 'running' | 'endingSoon' | 'expired' | 'idle';

export type Extractor = {
  pinId: number;
  productTypeId: number | null;
  qtyPerCycle: number;
  cycleSeconds: number;
  heads: number;
  expiry: number | null;
  state: ExtractorState;
  /** Hours until the programme ends, or since it ended. Infinite when there is no programme at all. */
  hours: number;
  unitsPerHour: number;
};

/** An extractor with no programme installed is idle, not merely expired: it never started. */
export function readExtractor(pin: RawPin, now: number, soonHours = 24): Extractor {
  const d = pin.extractor_details ?? { heads: [] };
  const expiry = pin.expiry_time ? Date.parse(pin.expiry_time) : null;
  const qty = d.qty_per_cycle ?? 0;
  const cycle = d.cycle_time ?? 0;
  const msLeft = expiry == null ? NaN : expiry - now;
  const hours = Number.isNaN(msLeft) ? Infinity : msLeft / 3600_000;

  const state: ExtractorState =
    expiry == null || qty <= 0 || cycle <= 0 ? 'idle'
      : msLeft <= 0 ? 'expired'
        : hours <= soonHours ? 'endingSoon'
          : 'running';

  return {
    pinId: pin.pin_id,
    productTypeId: d.product_type_id ?? null,
    qtyPerCycle: qty,
    cycleSeconds: cycle,
    heads: d.heads?.length ?? 0,
    expiry,
    state,
    hours: Number.isFinite(hours) ? hours : Infinity,
    // Output tails off across a programme; this is the per-cycle figure ESI reports, so treat it as
    // the top of the range rather than a steady rate.
    unitsPerHour: cycle > 0 && state !== 'expired' && state !== 'idle' ? qty * (3600 / cycle) : 0,
  };
}

export type Stored = { typeId: number; amount: number };

/** Everything sitting in storage across a colony, merged by type. */
export function contentsOf(pins: RawPin[]): Stored[] {
  const m = new Map<number, number>();
  for (const p of pins) {
    for (const c of p.contents ?? []) m.set(c.type_id, (m.get(c.type_id) ?? 0) + c.amount);
  }
  return [...m.entries()].map(([typeId, amount]) => ({ typeId, amount })).sort((a, b) => b.amount - a.amount);
}

export type ColonyWarning = 'expired' | 'endingSoon' | 'noExtractor' | 'idleExtractor' | 'nothingRouted';

export type Colony = {
  head: PlanetHead;
  extractors: Extractor[];
  factories: number;
  stored: Stored[];
  warnings: ColonyWarning[];
  /** Units an hour across every running extractor. */
  unitsPerHour: number;
  /** The soonest programme to run out, in hours. Infinite when nothing is running. */
  soonest: number;
};

export function readColony(head: PlanetHead, raw: RawColony, now: number, soonHours = 24): Colony {
  const extractors = raw.pins.filter((p) => classify(p) === 'extractor').map((p) => readExtractor(p, now, soonHours));
  const factories = raw.pins.filter((p) => classify(p) === 'factory').length;
  const stored = contentsOf(raw.pins);

  const warnings: ColonyWarning[] = [];
  if (!extractors.length) warnings.push('noExtractor');
  if (extractors.some((e) => e.state === 'expired')) warnings.push('expired');
  if (extractors.some((e) => e.state === 'endingSoon')) warnings.push('endingSoon');
  if (extractors.some((e) => e.state === 'idle')) warnings.push('idleExtractor');
  // Raw material coming out with nowhere to go: extractors running but nothing to process or hold it.
  if (extractors.some((e) => e.state === 'running') && factories === 0 && !raw.links.length) warnings.push('nothingRouted');

  const live = extractors.filter((e) => e.state === 'running' || e.state === 'endingSoon');
  return {
    head, extractors, factories, stored, warnings,
    unitsPerHour: live.reduce((t, e) => t + e.unitsPerHour, 0),
    soonest: live.length ? Math.min(...live.map((e) => e.hours)) : Infinity,
  };
}

/** Trouble first, and the closest deadline at the top of it. */
export function byAttention(a: Colony, b: Colony): number {
  const rank = (c: Colony) =>
    c.warnings.includes('expired') ? 0
      : c.warnings.includes('noExtractor') || c.warnings.includes('idleExtractor') ? 1
        : c.warnings.includes('endingSoon') ? 2 : 3;
  return rank(a) - rank(b) || a.soonest - b.soonest;
}

/** Every type a set of colonies touches, so they can all be priced in one pass. */
export function typesIn(colonies: Colony[]): number[] {
  const s = new Set<number>();
  for (const c of colonies) {
    for (const e of c.extractors) if (e.productTypeId) s.add(e.productTypeId);
    for (const x of c.stored) s.add(x.typeId);
  }
  return [...s];
}

/** What the colonies are producing an hour, and what is already sitting there, at your net prices. */
export function valueOf(
  colonies: Colony[],
  net: (typeId: number) => number | null,
): { perHour: number; perDay: number; stored: number; unpriced: number } {
  let perHour = 0, stored = 0, unpriced = 0;
  for (const c of colonies) {
    for (const e of c.extractors) {
      if (!e.productTypeId || e.unitsPerHour <= 0) continue;
      const p = net(e.productTypeId);
      if (p == null) { unpriced++; continue; }
      perHour += e.unitsPerHour * p;
    }
    for (const x of c.stored) {
      const p = net(x.typeId);
      if (p == null) { unpriced++; continue; }
      stored += x.amount * p;
    }
  }
  return { perHour, perDay: perHour * 24, stored, unpriced };
}
