/**
 * Industry jobs and blueprints, read by the cloud (docs/notes/industry.md, stage 2): the main's jobs in the hourly archive
 * (its blueprints are its browser's to read), an alt's blueprints and jobs in its hourly sheet. The rules are the browser's
 * own (src/lib/industryTrack.ts); this is the I/O around them, with the reader's login.
 */
import EIV from '../../src/data/industryEiv.json' with { type: 'json' };
import type { RawBlueprint } from '../../src/lib/blueprints';
import { parseIndices, type IndustryIndex } from '../../src/lib/industry';
import { bpFrom, isStationId, isStructureId, itemPlaces, newJobs, placesToName, readJobs, toBlueprintsDoc, type BlueprintsDoc, type JobRecord, type RawJob } from '../../src/lib/industryTrack';
import { esiAll, esiGet, esiPost, EveError } from './eve';

export const SCOPE_JOBS = 'esi-industry.read_character_jobs.v1';
export const SCOPE_BLUEPRINTS = 'esi-characters.read_blueprints.v1';
const SCOPE_ASSETS = 'esi-assets.read_assets.v1';
const SCOPE_STRUCTURES = 'esi-universe.read_structures.v1';
const E = EIV as unknown as { eiv: Record<string, [number, number][]>; out: Record<string, [number, number]> };

/** CCP's adjusted prices (/markets/prices/, no login): what a job's EIV is worked out on. */
async function adjustedPrices(): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  for (const p of (await esiGet<{ type_id: number; adjusted_price?: number }[]>('/markets/prices/')).data) if (p.adjusted_price) out[p.type_id] = p.adjusted_price;
  return out;
}

/**
 * A character's jobs, every status for 90 days, folded onto what D1 holds (`stored`). Units a run come from the bundled
 * table for every row; what a job not held yet needs to be sighted (the indices, the prices, its station's system) is read
 * only when one turns up running. A lookup that fails leaves that field not known. The records that changed.
 */
export async function readJobsFor(char: number, token: string, o: { bps: BlueprintsDoc | null; held?: BlueprintsDoc | null; stored: (ids: string[]) => Promise<Map<string, JobRecord>>; now?: number }): Promise<JobRecord[]> {
  const { data: raw } = await esiGet<RawJob[]>(`/characters/${char}/industry/jobs/`, { token, query: { include_completed: 'true' } });
  const held = Object.fromEntries(await o.stored(raw.filter((r) => Number.isInteger(r?.job_id)).map((r) => String(r.job_id))));
  const running = newJobs(raw, held).filter((r) => r.status === 'active');
  let indices: Record<number, IndustryIndex> | null = null, adjusted: Record<number, number> | null = null;
  const systems = new Map<number, number | null>();
  if (running.length) {
    indices = await esiGet<{ solar_system_id: number; cost_indices: { activity: string; cost_index: number }[] }[]>('/industry/systems/').then((r) => parseIndices(r.data)).catch(() => null);
    adjusted = await adjustedPrices().catch(() => null);
    for (const id of new Set(running.map((r) => r.station_id))) {
      try {
        if (isStationId(id)) systems.set(id, (await esiGet<{ system_id: number }>(`/universe/stations/${id}/`)).data.system_id);
        else if (isStructureId(id)) systems.set(id, (await esiGet<{ solar_system_id: number }>(`/universe/structures/${id}/`, { token })).data.solar_system_id);
      } catch { systems.set(id, null); }
    }
  }
  return readJobs(raw, held, {
    seenAt: new Date(o.now ?? Date.now()).toISOString(), perRun: (bp) => E.out[String(bp)]?.[1] ?? null, bp: bpFrom(o.bps, o.held),
    systemOf: (id) => systems.get(id) ?? null, indices, adjusted, eiv: E.eiv,
  });
}

/**
 * A character's blueprints as the `blueprints` doc, the places they sit in named once each with its own login: containers
 * and ships by /assets/names (the assets permission; "None" is no name), structures by /universe/structures (refused: `''`).
 * `itemIds` is the character's own asset item IDs from the assets read of the same run (null: not read, so nothing is
 * classified and nothing marked named); asset item IDs are 13 digits like structures', so their size tells nothing
 * (industryTrack.ts placesToName). Mirrors the browser's readBlueprintsNow.
 */
export async function readBlueprintsFor(char: number, token: string, scopes: string[], prev: BlueprintsDoc | null, itemIds?: ReadonlySet<number> | null): Promise<BlueprintsDoc> {
  const raw = await esiAll<RawBlueprint>(`/characters/${char}/blueprints/`, { token });
  const draft = toBlueprintsDoc(raw, prev?.names, prev?.items);
  const want = placesToName(draft, itemIds);
  const names: Record<string, string> = { ...(draft.names ?? {}) };
  if (scopes.includes(SCOPE_ASSETS)) {
    for (let i = 0; i < want.items.length; i += 1000) {
      const part = want.items.slice(i, i + 1000);
      try {
        const got = new Map((await esiPost<{ item_id: number; name: string }[]>(`/characters/${char}/assets/names/`, part, token)).map((n) => [n.item_id, n.name]));
        for (const id of part) { const n = got.get(id); names[String(id)] = n && n !== 'None' ? n : ''; }
      } catch { /* named on a later read */ }
    }
  }
  if (scopes.includes(SCOPE_STRUCTURES)) {
    for (const id of want.structures) {
      try { names[String(id)] = (await esiGet<{ name: string }>(`/universe/structures/${id}/`, { token })).data.name; }
      catch (e) { if (e instanceof EveError && (e.status === 401 || e.status === 403)) names[String(id)] = ''; }
    }
  }
  return toBlueprintsDoc(raw, names, itemPlaces(draft, itemIds));
}
