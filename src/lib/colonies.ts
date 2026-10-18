/**
 * The main's colonies, kept as a synced document (not only read into memory), so what an extractor pulls can be learned
 * from reading after reading and the cloud can keep them too. Pure: the Worker imports it.
 *
 * A kept colony is ESI's layout in the app's names, sorted so that equal reads stringify equal.
 */
import { PLANET_TYPES, type PlanetType } from './pi';
import { readColony, type Colony, type PlanetHead, type RawColony, type RawPin } from './colony';

export type KeptPin = {
  id: number; typeId: number; install: string | null; expiry: string | null; lastCycle: string | null;
  schematic: number | null;
  /** `qty` is null when ESI sends none (often null until the programme is submitted), never 0. */
  extractor: { cycle: number; product: number | null; qty: number | null; heads: number } | null;
  contents: [number, number][];
};

export type KeptColony = {
  planetId: number; systemId: number; planetType: PlanetType | null; level: number; lastUpdate: string;
  pins: KeptPin[];
  /** [source, destination, level] */
  links: [number, number, number][];
  /** [source, destination, typeId, quantity] */
  routes: [number, number, number, number][];
};

export type ColoniesDoc = { colonies: KeptColony[] };

/** ESI's `planet_type` is lowercase ("barren", "gas"); unknown types are null. */
export function planetTypeOfEsi(s: string): PlanetType | null {
  const t = typeof s === 'string' ? s.trim().toLowerCase() : '';
  return PLANET_TYPES.find((p) => p.toLowerCase() === t) ?? null;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function keptPin(p: RawPin): KeptPin {
  const e = p.extractor_details;
  return {
    id: p.pin_id, typeId: p.type_id,
    install: p.install_time ?? null, expiry: p.expiry_time ?? null, lastCycle: p.last_cycle_start ?? null,
    schematic: p.schematic_id ?? p.factory_details?.schematic_id ?? null,
    extractor: e ? { cycle: e.cycle_time ?? 0, product: e.product_type_id ?? null, qty: e.qty_per_cycle ?? null, heads: e.heads?.length ?? 0 } : null,
    contents: (p.contents ?? []).map((c) => [c.type_id, c.amount] as [number, number]).sort((a, b) => a[0] - b[0]),
  };
}

export function keptFromEsi(head: PlanetHead, raw: RawColony): KeptColony {
  return {
    planetId: head.planetId, systemId: head.solarSystemId, planetType: planetTypeOfEsi(head.planetType),
    level: head.upgradeLevel, lastUpdate: head.lastUpdate,
    pins: raw.pins.map(keptPin).sort((a, b) => a.id - b.id),
    links: (raw.links ?? []).map((l) => [l.source_pin_id, l.destination_pin_id, l.link_level] as [number, number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    routes: (raw.routes ?? []).map((r) => [r.source_pin_id, r.destination_pin_id, r.content_type_id, r.quantity] as [number, number, number, number])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]),
  };
}

function cleanPin(v: unknown): KeptPin | null {
  const p = v as Record<string, unknown> | null;
  if (!p || typeof p !== 'object' || !num(p.id) || !num(p.typeId)) return null;
  let extractor: KeptPin['extractor'] = null;
  const e = p.extractor as Record<string, unknown> | null | undefined;
  if (e && typeof e === 'object') {
    extractor = { cycle: num(e.cycle) ? e.cycle : 0, product: num(e.product) ? e.product : null, qty: num(e.qty) ? e.qty : null, heads: num(e.heads) ? e.heads : 0 };
  }
  const contents = Array.isArray(p.contents)
    ? p.contents.filter((c): c is [number, number] => Array.isArray(c) && num(c[0]) && num(c[1])).map((c) => [c[0], c[1]] as [number, number]) : [];
  return {
    id: p.id, typeId: p.typeId, install: str(p.install), expiry: str(p.expiry), lastCycle: str(p.lastCycle),
    schematic: num(p.schematic) ? p.schematic : null, extractor, contents,
  };
}

const tuples = (v: unknown, n: number): number[][] =>
  Array.isArray(v) ? v.filter((t): t is number[] => Array.isArray(t) && t.length === n && t.every(num)).map((t) => [...t]) : [];

function cleanColony(v: unknown): KeptColony | null {
  const c = v as Record<string, unknown> | null;
  if (!c || typeof c !== 'object' || !num(c.planetId) || !num(c.systemId) || !num(c.level) || typeof c.lastUpdate !== 'string') return null;
  const pins = (Array.isArray(c.pins) ? c.pins : []).map(cleanPin).filter((p): p is KeptPin => p != null).sort((a, b) => a.id - b.id);
  return {
    planetId: c.planetId, systemId: c.systemId,
    planetType: typeof c.planetType === 'string' ? planetTypeOfEsi(c.planetType) : null,
    level: c.level, lastUpdate: c.lastUpdate, pins,
    links: tuples(c.links, 3) as KeptColony['links'],
    routes: tuples(c.routes, 4) as KeptColony['routes'],
  };
}

/** Junk is undefined (never read); bad colonies inside are dropped. */
export function sanitizeColonies(v: unknown): ColoniesDoc | undefined {
  const d = v as { colonies?: unknown } | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.colonies)) return undefined;
  const colonies = d.colonies.map(cleanColony).filter((c): c is KeptColony => c != null);
  return { colonies: colonies.sort((a, b) => a.planetId - b.planetId) };
}

/**
 * The read decides which colonies exist, so one given up is dropped. Where a planet is in both, the later `lastUpdate`
 * is kept, so an older read can't roll a colony back (ties go to the read).
 */
export function mergeColonies(held: ColoniesDoc | undefined, read: KeptColony[]): ColoniesDoc {
  const had = new Map((held?.colonies ?? []).map((c) => [c.planetId, c]));
  const colonies = read.map((r) => {
    const h = had.get(r.planetId);
    return h && Date.parse(h.lastUpdate) > Date.parse(r.lastUpdate) ? h : r;
  });
  return { colonies: colonies.sort((a, b) => a.planetId - b.planetId) };
}

/** `readColony` on a reconstructed layout, so the panel, To do and the alerts work from the document. */
export function colonyOfKept(k: KeptColony, now: number): Colony {
  const head: PlanetHead = {
    planetId: k.planetId, planetType: k.planetType ? k.planetType.toLowerCase() : 'unknown', solarSystemId: k.systemId,
    upgradeLevel: k.level, numPins: k.pins.length, lastUpdate: k.lastUpdate,
  };
  const raw: RawColony = {
    pins: k.pins.map((p) => ({
      pin_id: p.id, type_id: p.typeId,
      ...(p.expiry ? { expiry_time: p.expiry } : {}),
      ...(p.install ? { install_time: p.install } : {}),
      ...(p.lastCycle ? { last_cycle_start: p.lastCycle } : {}),
      ...(p.contents.length ? { contents: p.contents.map(([type_id, amount]) => ({ type_id, amount })) } : {}),
      ...(p.extractor ? {
        extractor_details: {
          cycle_time: p.extractor.cycle,
          ...(p.extractor.product != null ? { product_type_id: p.extractor.product } : {}),
          ...(p.extractor.qty != null ? { qty_per_cycle: p.extractor.qty } : {}),
          heads: Array.from({ length: p.extractor.heads }, (_, i) => ({ head_id: i })),
        },
      } : {}),
      ...(p.schematic != null ? { factory_details: { schematic_id: p.schematic } } : {}),
    })),
    links: k.links.map(([s, d, l]) => ({ source_pin_id: s, destination_pin_id: d, link_level: l })),
    routes: k.routes.map(([s, d, t, q]) => ({ source_pin_id: s, destination_pin_id: d, content_type_id: t, quantity: q })),
  };
  return readColony(head, raw, now);
}
