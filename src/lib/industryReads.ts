import type { RawBlueprint } from './blueprints';
import { esi, esiAllPages } from './esi';
import { adjustedPricesShared, industrySystemsShared } from './market';
import { bpFrom, isStationId, isStructureId, itemPlaces, lackUnits, newJobs, placesToName, readJobs, toBlueprintsDoc, type BlueprintsDoc, type JobRecord, type RawJob } from './industryTrack';
import { station, structureInfo } from './universe';

/**
 * The main's blueprints and industry jobs, read in the browser (the sync, and the Blueprints page's button): the I/O around
 * industryTrack.ts's rules. An alt's are read by the cloud (worker/src/industryJobs.ts), never here.
 */

/** industryEiv.json: every published blueprint's ME 0 materials and its product, units a run (scripts/industry-bundle.mjs). */
export type EivFile = { build: number; eiv: Record<string, [number, number][]>; out: Record<string, [number, number]> };
let eivP: Promise<EivFile> | null = null;
/** A chunk of its own, loaded the first time a job not held yet turns up, and kept. A failed load is asked again next time. */
export const loadEiv = (): Promise<EivFile> =>
  (eivP ??= import('../data/industryEiv.json').then((m) => m.default as unknown as EivFile).catch((e) => { eivP = null; throw e; }));

/**
 * Your blueprints, with the places they sit in named once each (asked only for a place not named yet): a container or ship
 * by the name you gave it (`/assets/names`, with the assets permission; ESI's "None" is no name), a structure by its own
 * (`/universe/structures`, with the structures permission). `''` marks a place asked and found nameless, so it isn't asked
 * again. A failed name lookup is asked again on the next read. `itemIds` is the character's own asset item IDs from the assets
 * read just taken (null: not read), which tell a container or ship from a structure (industryTrack.ts placesToName).
 */
export async function readBlueprintsNow(cid: number, prev: BlueprintsDoc | undefined, can: { assets: boolean; structures: boolean }, itemIds?: ReadonlySet<number> | null): Promise<BlueprintsDoc> {
  const raw = await esiAllPages<RawBlueprint>(`/characters/${cid}/blueprints/`, { auth: true });
  const draft = toBlueprintsDoc(raw, prev?.names, prev?.items);
  const want = placesToName(draft, itemIds);
  const names: Record<string, string> = { ...(draft.names ?? {}) };
  if (can.assets) {
    for (let i = 0; i < want.items.length; i += 1000) {
      const part = want.items.slice(i, i + 1000);
      try {
        const { data } = await esi<{ item_id: number; name: string }[]>(`/characters/${cid}/assets/names/`, { auth: true, method: 'POST', body: part });
        const got = new Map(data.map((n) => [n.item_id, n.name]));
        for (const id of part) { const n = got.get(id); names[String(id)] = n && n !== 'None' ? n : ''; }
      } catch { /* named on a later read */ }
    }
  }
  if (can.structures) {
    for (const id of want.structures) {
      const s = await structureInfo(id).catch(() => null);
      if (s?.status === 'found') names[String(id)] = s.name;
      else if (s?.status === 'refused') names[String(id)] = '';
    }
  }
  return toBlueprintsDoc(raw, names, itemPlaces(draft, itemIds));
}

/**
 * Your jobs, every status for 90 days (`include_completed`), folded onto what's held (industryTrack.ts readJobs). What a new
 * job needs is read only when one turns up: industryEiv.json (units a run, ME 0 materials), and for one running, ESI's
 * indices, CCP's adjusted prices and its station's system. A lookup that fails leaves that field not known, never 0.
 */
export async function readJobsNow(cid: number, stored: Record<string, JobRecord>, bps: BlueprintsDoc | undefined, heldBps: BlueprintsDoc | undefined): Promise<{ raw: RawJob[]; changed: JobRecord[] }> {
  const { data: raw } = await esi<RawJob[]>(`/characters/${cid}/industry/jobs/`, { auth: true, query: { include_completed: 'true' } });
  const fresh = newJobs(raw, stored);
  // Also when a held manufacturing job has no units a run (the table failed once): the merge fills it in.
  const eiv = fresh.length || lackUnits(raw, stored).length ? await loadEiv().catch(() => null) : null;
  const running = fresh.filter((r) => r.status === 'active');
  const [indices, adjusted] = running.length
    ? await Promise.all([industrySystemsShared().catch(() => null), adjustedPricesShared().catch(() => null)])
    : [null, null];
  const systems = new Map<number, number | null>();
  for (const id of new Set(running.map((r) => r.station_id))) {
    if (isStationId(id)) systems.set(id, (await station(id).catch(() => null))?.systemId ?? null);
    else if (isStructureId(id)) { const s = await structureInfo(id).catch(() => null); systems.set(id, s?.status === 'found' ? s.systemId : null); }
  }
  const changed = readJobs(raw, stored, {
    seenAt: new Date().toISOString(), perRun: (bp) => eiv?.out[String(bp)]?.[1] ?? null, bp: bpFrom(bps, heldBps),
    systemOf: (id) => systems.get(id) ?? null, indices, adjusted, eiv: eiv?.eiv ?? null,
  });
  return { raw, changed };
}
