import { get, set } from 'idb-keyval';
import { esi, EsiError } from './esi';
import { cacheStore } from './store';
import type { Endpoint } from './courier';
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
  try {
    const { data } = await esi<{ name: string; solar_system_id: number }>(`/universe/structures/${locationId}/`, { auth: true });
    const sys = await system(data.solar_system_id);
    return { kind: 'structure', systemId: data.solar_system_id, security: sys.security, name: data.name };
  } catch {
    return { kind: 'structure', systemId: null, security: null, name: null };
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
  return cached(`route:${from}:${to}`, async () => {
    try {
      const { data } = await esi<number[]>(`/v1/route/${from}/${to}/`, { query: { flag: 'secure' } });
      return data.length > 0 ? data.length - 1 : null;
    } catch (e) {
      if (e instanceof EsiError && e.status === 404) return null;
      throw e;
    }
  });
}

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
