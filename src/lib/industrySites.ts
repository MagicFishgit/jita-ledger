import { HIGH_SEC, jumpsFrom, type Graph } from './jumps';
import { NPC_FACILITY_TAX, RIG_SIZE, secBand, kindOfType, type BundleRig, type Indexed, type IndustryIndex, type SecBand, type SiteKind } from './industry';
import { NEAR_JITA_JUMPS, type Leg } from './industryRank';
import type { FreightRoute, IndustrySite } from './prefs';

/**
 * Where you build (docs/notes/industry.md): quiet NPC stations near Jita, a site's facts (its band, its jumps from Jita,
 * its index, whether it can research), the rigs a structure takes, freight presets, and how goods get between a site and a
 * market. Pure: no config, store, React or DOM.
 */

export const JITA_SYSTEM = 30000142;
/** The home systems offered first: UALX-3, Brave's (the user's planned home), and C-J6MT, the Imperium's staging. */
export const HOME_SYSTEMS = [{ systemId: 30004807, name: 'UALX-3' }, { systemId: 30000772, name: 'C-J6MT' }] as const;

/** Brave Freight's published routes (Brave wiki "BRAVE Freight", revised 3 June 2026; its calculator, 9 October 2026), offered as presets, applied only once picked. */
export const BRAVE_SOURCE = 'Brave wiki, 3 June 2026';
export const FREIGHT_PRESETS: FreightRoute[] = [
  // 900 ISK a m³, 0.75% of a collateral of 105% of Jita's value on routes to or from high-sec, 5 M minimum.
  { id: 'brave-jita-ualx', name: 'Brave Freight, Jita ↔ UALX-3', a: JITA_SYSTEM, b: 30004807, perM3: 900, collateral: 0.0075 * 1.05, min: 5_000_000, source: BRAVE_SOURCE },
  // 1,150 a m³ (the calculator); to or from high-sec, so the same collateral; no minimum stated for this route.
  { id: 'brave-jita-cj6', name: 'Brave Freight, Jita ↔ C-J6MT', a: JITA_SYSTEM, b: 30000772, perM3: 1150, collateral: 0.0075 * 1.05, min: null, source: 'Brave Freight’s calculator, 9 October 2026' },
  // 415 a m³, 50 M minimum, no high-sec end so no collateral charge.
  { id: 'brave-ualx-cj6', name: 'Brave Freight, UALX-3 ↔ C-J6MT', a: 30004807, b: 30000772, perM3: 415, collateral: 0, min: 50_000_000, source: BRAVE_SOURCE },
];

export type StationPick = { stationId: number; systemId: number; system: string; security: number; jumps: number; index: number; lab: boolean };

/**
 * High-sec NPC stations with a Factory (or a Laboratory) within `maxJumps` high-sec jumps of Jita, quietest first: by the
 * index of the activity you'd run there (manufacturing for a Factory, ME research for a Laboratory), then the jumps. A
 * system ESI lists no index for is left out (it can't be costed). At most `limit`.
 */
export function quietStations(stations: readonly [number, number, number][], graph: Graph, indices: Record<number, IndustryIndex>, o: { maxJumps: number; need: 'factory' | 'lab'; limit: number }): StationPick[] {
  const high = jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC);
  const out: StationPick[] = [];
  for (const [stationId, systemId, services] of stations) {
    if (!(services & (o.need === 'factory' ? 1 : 2))) continue;
    const jumps = high.get(systemId), sys = graph[systemId], ix = indices[systemId];
    if (jumps == null || jumps > o.maxJumps || !sys || !ix) continue;
    out.push({ stationId, systemId, system: sys[1], security: sys[0], jumps, index: o.need === 'factory' ? ix.manufacturing : ix.researchMaterial, lab: !!(services & 2) });
  }
  return out.sort((a, b) => a.index - b.index || a.jumps - b.jumps || a.stationId - b.stationId).slice(0, o.limit);
}

/** The nearest NPC station with a Laboratory to a system, by any route; null when none can be reached on the map. */
export function nearestLab(stations: readonly [number, number, number][], graph: Graph, from: number): { stationId: number; systemId: number; jumps: number } | null {
  const any = jumpsFrom(graph, from);
  let best: { stationId: number; systemId: number; jumps: number } | null = null;
  for (const [stationId, systemId, services] of stations) {
    const j = any.get(systemId);
    if (!(services & 2) || j == null) continue;
    if (!best || j < best.jumps || (j === best.jumps && stationId < best.stationId)) best = { stationId, systemId, jumps: j };
  }
  return best;
}

/** What a site is, worked out: its system's name and band, its high-sec jumps from Jita (null: no high-sec route), its index, whether it can research. */
export type SiteFacts = {
  system: string | null; security: number | null; band: SecBand;
  jitaJumps: number | null; nearJita: boolean;
  /** ESI's indices for the site's system; null while not read or when ESI lists none (`indexWhy` says which). */
  index: IndustryIndex | null; indexWhy: string | null;
  /** Research, copying and invention: an NPC station with a Laboratory, or any structure (taken as having a lab: its owner says otherwise). */
  canScience: boolean;
  tax: number | null;
};
export function siteFacts(site: IndustrySite, graph: Graph, jitaHigh: Map<number, number>, indices: Record<number, IndustryIndex> | null): SiteFacts {
  const sys = graph[site.systemId];
  const jitaJumps = jitaHigh.get(site.systemId) ?? null;
  const index = indices?.[site.systemId] ?? null;
  return {
    system: sys?.[1] ?? null, security: sys?.[0] ?? null, band: secBand(sys?.[0]),
    jitaJumps, nearJita: jitaJumps != null && jitaJumps <= NEAR_JITA_JUMPS,
    index, indexWhy: !indices ? 'Reading the industry indices…' : index ? null : `ESI lists no industry index for ${sys?.[1] ?? `system ${site.systemId}`}`,
    canScience: site.kind === 'npc' ? !!site.lab : true,
    tax: site.kind === 'npc' ? NPC_FACILITY_TAX : site.tax,
  };
}

/** The bundle's rigs a kind of structure takes (its size), Tech I first, by name. None for a station or a structure the app has no bonuses for. */
export function rigsFitting(ix: Indexed, kind: SiteKind): BundleRig[] {
  const size = RIG_SIZE[kind];
  if (!size) return [];
  return ix.b.rigs.filter((r) => r[1] === size).sort((a, b) => a[2] - b[2] || (ix.b.types[a[0]]?.[0] ?? '').localeCompare(ix.b.types[b[0]]?.[0] ?? ''));
}

/** A freight route between two systems, either way; the first one listed. */
export const routeBetween = (routes: readonly FreightRoute[], a: number, b: number): FreightRoute | null =>
  routes.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) ?? null;

/**
 * How goods get between a site and a market's system: the market's own system is `here`; a route set between them is
 * taken; with none, a high-sec site within NEAR_JITA_JUMPS of Jita carries to and from Jita itself (no ISK, said), and
 * anything else has no way set.
 */
export function legFor(site: { systemId: number }, facts: Pick<SiteFacts, 'nearJita' | 'jitaJumps'>, market: number, routes: readonly FreightRoute[]): Leg {
  if (site.systemId === market) return { kind: 'here' };
  const r = routeBetween(routes, site.systemId, market);
  if (r) return { kind: 'route', name: r.name, f: { perM3: r.perM3, collateral: r.collateral, min: r.min } };
  if (market === JITA_SYSTEM && facts.nearJita && facts.jitaJumps != null) return { kind: 'carry', jumps: facts.jitaJumps };
  return { kind: 'none' };
}

/** A site for an NPC station picked from the quiet list. */
export const stationSite = (p: StationPick, name: string): IndustrySite =>
  ({ id: `npc:${p.stationId}`, name, systemId: p.systemId, kind: 'npc', stationId: p.stationId, rigs: [], tax: NPC_FACILITY_TAX, ...(p.lab ? { lab: true } : {}) });
/** A site for a structure found by name: its kind from its type; rigs and tax yours to type. */
export const structureSite = (f: { id: number; name: string; systemId: number; typeId?: number }): IndustrySite =>
  ({ id: `st:${f.id}`, name: f.name, systemId: f.systemId, kind: kindOfType(f.typeId), structureId: f.id, rigs: [], tax: null });
/** A home typed by you: a system and a kind of structure, with no structure ID, so it holds nothing known. */
export const homeSite = (systemId: number, system: string, kind: SiteKind): IndustrySite =>
  ({ id: `home:${systemId}`, name: `Home in ${system}`, systemId, kind, rigs: [], tax: null });
