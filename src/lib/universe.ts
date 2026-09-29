import { get, set } from 'idb-keyval';
import { esi, EsiError } from './esi';
import { cacheStore } from './store';
import type { Endpoint } from './courier';
import { hasScope } from './auth';
import { SCOPE } from './config';
import { parsePlanetType, type PiPlanet } from './pi';

/**
 * Stations, systems, planets and routes.
 *
 * None of this ever changes, so everything here is cached in IndexedDB for good rather than for a
 * few minutes. That matters: finding the Barren planets in a region means a request per planet, and
 * doing it twice would be rude to ESI and slow for you.
 */

const mem = new Map<string, unknown>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (mem.has(key)) return mem.get(key) as T;
  const hit = (await get(key, cacheStore).catch(() => undefined)) as T | undefined;
  if (hit !== undefined) { mem.set(key, hit); return hit; }
  const val = await fn();
  mem.set(key, val);
  await set(key, val, cacheStore).catch(() => undefined);
  return val;
}

export type SystemInfo = { systemId: number; name: string; security: number; planetIds: number[] };

export const system = (id: number) => cached(`sys:${id}`, async () => {
  const { data } = await esi<{ name: string; security_status: number; planets?: { planet_id: number }[] }>(`/universe/systems/${id}/`);
  return {
    systemId: id, name: data.name, security: data.security_status,
    planetIds: (data.planets ?? []).map((p) => p.planet_id),
  } satisfies SystemInfo;
});

export const station = (id: number) => cached(`stn:${id}`, async () => {
  const { data } = await esi<{ name: string; system_id: number }>(`/universe/stations/${id}/`);
  return { name: data.name, systemId: data.system_id };
});

/** Station IDs sit in a fixed band; anything above it is a player structure. */
export const isStation = (locationId: number) => locationId >= 60000000 && locationId < 64000000;

/** Player structure IDs sit far above every NPC ID range. */
export const isStructure = (locationId: number) => locationId >= 1_000_000_000_000;
/** Solar system IDs: known space, then wormholes, then abyssal pockets. */
export const isSystem = (locationId: number) => locationId >= 30_000_000 && locationId < 33_000_000;

/**
 * A player structure, as far as ESI will say.
 *
 * - `unchecked`: the login lacks esi-universe.read_structures.v1, so nothing was asked. Not evidence
 *   of anything.
 * - `refused`: ESI answered Forbidden. It says that to anyone not on the structure's access list
 *   ("returns Forbidden for all inputs" in its own spec), so this is the real signal: you can't dock.
 * - `failed`: anything else --- a network error or ESI having a bad minute.
 *
 * Names can change, so a found structure is kept for a day, not for good; a refusal for an hour.
 */
export type StructureRead =
  | { status: 'found'; name: string; systemId: number }
  | { status: 'unchecked' | 'refused' | 'failed' };

const structureMem = new Map<number, { at: number; read: StructureRead }>();
export async function structureInfo(id: number): Promise<StructureRead> {
  if (!hasScope(SCOPE.structures)) return { status: 'unchecked' };
  const key = `structure:${id}`;
  const hit = structureMem.get(id) ?? ((await get(key, cacheStore).catch(() => undefined)) as { at: number; read: StructureRead } | undefined);
  const ttl = hit?.read.status === 'found' ? 24 * 3600_000 : 3600_000;
  if (hit && hit.read.status !== 'failed' && Date.now() - hit.at < ttl) return hit.read;
  let read: StructureRead;
  try {
    const { data } = await esi<{ name: string; solar_system_id: number }>(`/universe/structures/${id}/`, { auth: true });
    read = { status: 'found', name: data.name, systemId: data.solar_system_id };
  } catch (e) {
    read = { status: e instanceof EsiError && e.status === 403 ? 'refused' : 'failed' };
  }
  const entry = { at: Date.now(), read };
  structureMem.set(id, entry);
  if (read.status !== 'failed') await set(key, entry, cacheStore).catch(() => undefined);
  return read;
}

/**
 * What a contract's endpoint really is.
 *
 * A player structure answers 401 unless you have docking access, and that refusal is the useful
 * part: a destination you cannot look up is a destination you may not be able to deliver to.
 */
export async function endpoint(locationId: number): Promise<Endpoint> {
  if (isStation(locationId)) {
    try {
      const s = await station(locationId);
      const sys = await system(s.systemId);
      return { kind: 'station', systemId: s.systemId, security: sys.security, name: s.name };
    } catch {
      return { kind: 'station', systemId: null, security: null, name: null };
    }
  }
  // Without the structures permission nothing was asked, which says nothing about the structure.
  // Only ESI's refusal is the "you can't dock there" signal.
  const read = await structureInfo(locationId);
  if (read.status !== 'found') return { kind: 'structure', systemId: null, security: null, name: null, unchecked: read.status === 'unchecked' };
  try {
    const sys = await system(read.systemId);
    return { kind: 'structure', systemId: read.systemId, security: sys.security, name: read.name };
  } catch {
    return { kind: 'structure', systemId: read.systemId, security: null, name: read.name };
  }
}

/**
 * Jumps on a high-sec-only route, or null when there isn't one.
 *
 * The route endpoint is one of the few that still lives under a version prefix rather than the
 * compatibility-date root, so this path is spelled out rather than built like the others. A 404
 * here is an answer --- no such route exists --- not a failure.
 */
export async function secureJumps(from: number, to: number): Promise<number | null> {
  if (from === to) return 0;
  const route = await secureRoute(from, to);
  return route ? route.length - 1 : null;
}

/**
 * Every system on the high-sec-only route, start and end included, or null when there isn't one.
 * Kept whole rather than as a jump count so a route can be checked for the gank systems on it.
 */
export async function secureRoute(from: number, to: number): Promise<number[] | null> {
  if (from === to) return [from];
  return cached(`route-sys:${from}:${to}`, async () => {
    try {
      const { data } = await esi<number[]>(`/v1/route/${from}/${to}/`, { query: { flag: 'secure' } });
      return data.length > 0 ? data : null;
    } catch (e) {
      if (e instanceof EsiError && e.status === 404) return null;
      throw e;
    }
  });
}

export type TypeInfo = { name: string; groupId: number; marketGroupId: number | null; volume: number; packagedVolume: number | null };

/** Static facts about an item type. They do not change, so they are kept for good. */
export const typeInfo = (id: number) => cached(`type:${id}`, async () => {
  const { data } = await esi<{ name: string; group_id: number; market_group_id?: number; volume?: number; packaged_volume?: number }>(`/universe/types/${id}/`);
  return {
    name: data.name, groupId: data.group_id, marketGroupId: data.market_group_id ?? null,
    volume: data.volume ?? 0, packagedVolume: data.packaged_volume ?? null,
  } satisfies TypeInfo;
});

/** An inventory group's name, such as "Deep Space Transport". */
export const groupName = (id: number) => cached(`group:${id}`, async () => {
  const { data } = await esi<{ name: string }>(`/universe/groups/${id}/`);
  return data.name;
});

/** An inventory group's category, such as Module or Charge. */
const groupCategory = (id: number) => cached(`group-cat:${id}`, async () => {
  const { data } = await esi<{ category_id: number }>(`/universe/groups/${id}/`);
  return data.category_id;
});
/** Category 6 is Ship: every hull, from a rookie ship to a titan. */
export const SHIP_CATEGORY = 6;

/** An item's name as ESI gives it (English, as the client's are) and whether it's a ship. Kept for good, like the type. */
export async function typeKind(typeId: number): Promise<{ name: string; ship: boolean }> {
  const t = await typeInfo(typeId);
  return { name: t.name, ship: (await groupCategory(t.groupId)) === SHIP_CATEGORY };
}
const categoryName = (id: number) => cached(`category:${id}`, async () => {
  const { data } = await esi<{ name: string }>(`/universe/categories/${id}/`);
  return data.name;
});

/** The broad kind of an item: Ship, Module, Charge, Implant, Commodity... Kept for good, like the type. */
export async function itemCategory(typeId: number): Promise<string> {
  const t = await typeInfo(typeId);
  return categoryName(await groupCategory(t.groupId));
}

/** Region and system for a station, for reading another hub's market. */
export const stationPlace = (id: number) => cached(`stn-place:${id}`, async () => {
  const s = await station(id);
  const { data: sys } = await esi<{ constellation_id: number }>(`/universe/systems/${s.systemId}/`);
  const { data: con } = await esi<{ region_id: number }>(`/universe/constellations/${sys.constellation_id}/`);
  return { name: s.name, systemId: s.systemId, regionId: con.region_id };
});

export const regionSystems = (regionId: number) => cached(`region-sys:${regionId}`, async () => {
  const { data: region } = await esi<{ constellations: number[] }>(`/universe/regions/${regionId}/`);
  const cons = await Promise.all(region.constellations.map((c) =>
    esi<{ systems: number[] }>(`/universe/constellations/${c}/`).then((r) => r.data.systems).catch(() => [])));
  return cons.flat();
});

export const planet = (id: number) => cached(`planet:${id}`, async () => {
  const { data } = await esi<{ name: string; system_id: number; type_id: number }>(`/universe/planets/${id}/`);
  return { name: data.name, systemId: data.system_id, typeId: data.type_id };
});

export const typeName = (id: number) => cached(`typename:${id}`, async () => {
  const { data } = await esi<{ name: string }>(`/universe/types/${id}/`);
  return data.name;
});

/**
 * Every planet in a region whose system sits in the chosen security band.
 *
 * This is the expensive one --- a request per planet --- so it reports progress and everything it
 * learns is kept. Running it a second time on the same region costs nothing.
 */
export async function scanPlanets(
  regionId: number,
  keepSystem: (security: number) => boolean,
  onProgress: (done: number, total: number) => void,
  signal?: { stopped: boolean },
): Promise<PiPlanet[]> {
  const ids = await regionSystems(regionId);
  const systems: SystemInfo[] = [];
  for (let i = 0; i < ids.length; i += 8) {
    if (signal?.stopped) break;
    const batch = await Promise.all(ids.slice(i, i + 8).map((s) => system(s).catch(() => null)));
    systems.push(...batch.filter((s): s is SystemInfo => !!s));
    onProgress(Math.min(i + 8, ids.length), ids.length);
  }

  const wanted = systems.filter((s) => keepSystem(s.security));
  const planetIds = wanted.flatMap((s) => s.planetIds.map((p) => ({ p, s })));
  const out: PiPlanet[] = [];
  for (let i = 0; i < planetIds.length; i += 8) {
    if (signal?.stopped) break;
    const batch = await Promise.all(planetIds.slice(i, i + 8).map(async ({ p, s }) => {
      try {
        const info = await planet(p);
        const t = parsePlanetType(await typeName(info.typeId));
        return t ? { planetId: p, name: info.name, type: t, systemId: s.systemId, systemName: s.name, security: s.security } : null;
      } catch { return null; }
    }));
    out.push(...batch.filter((x): x is PiPlanet => !!x));
    onProgress(Math.min(i + 8, planetIds.length), planetIds.length);
  }
  return out;
}

/** Jita, for working out how far a system is from home. */
export const JITA_SYSTEM = 30000142;

/** Regions a Jita trader can reach without a long trip. */
export const NEAR_JITA: { id: number; name: string }[] = [
  { id: 10000002, name: 'The Forge' },
  { id: 10000020, name: 'Tash-Murkon' },
  { id: 10000016, name: 'Lonetrek' },
  { id: 10000033, name: 'The Citadel' },
  { id: 10000032, name: 'Sinq Laison' },
  { id: 10000030, name: 'Heimatar' },
  { id: 10000042, name: 'Metropolis' },
  { id: 10000043, name: 'Domain' },
  { id: 10000064, name: 'Essence' },
];
