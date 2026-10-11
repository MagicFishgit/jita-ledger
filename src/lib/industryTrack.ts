/**
 * Your industry jobs and blueprints, as the app keeps them (docs/notes/industry.md; spec
 * docs/superpowers/specs/2026-10-10-industry-design.md, stage 2). Jobs are records of their own, kind `jobs`, keyed by
 * job ID, kept past ESI's 90 days; blueprints a synced document, `blueprints`. Several writers keep the same job (the
 * main's browser sync and the cloud's hourly archive; for an alt, the cloud's sheet), so every writer merges onto what it
 * holds (`mergeJob`): what's seen only while a job runs (its blueprint's ME and TE, the system's index, the EIV) is never
 * dropped by a writer that saw it later. Pure: no config, store, React or DOM. The Worker imports it, so it imports only
 * blueprints.ts and industry.ts, which are pure too.
 */
import { readBlueprints, type OwnedBlueprint, type RawBlueprint } from './blueprints';
import {
  copyCost, eivOf, inventionCost, manufacturingCost, NPC_FACILITY_TAX, researchCost, rigFor, structureBonus,
  type Activity, type Clone, type Indexed, type IndustryIndex, type JobCost, type SecBand, type SiteKind,
} from './industry';
import type { IndustrySite } from './prefs';

/**
 * ESI's /characters/{id}/industry/jobs/ row: OpenAPI at 2026-08-18 (`.playwright-mcp/research/rd-agents/openapi.json`). The
 * required fields as ESI requires them, the rest optional. The Worker reads at 2025-08-26 (worker/src/eve.ts), whose schema
 * for this route is identical; the first real read is the check of the data (docs/notes/industry.md).
 */
export type RawJob = {
  job_id: number; installer_id: number; facility_id: number; station_id: number; activity_id: number;
  blueprint_id: number; blueprint_type_id: number; blueprint_location_id: number; output_location_id: number;
  runs: number; status: string; duration: number; start_date: string; end_date: string;
  product_type_id?: number; licensed_runs?: number; successful_runs?: number; probability?: number; cost?: number;
  completed_date?: string; completed_character_id?: number; pause_date?: string;
};

/**
 * How long after a job's start it may first be seen and still be checked (jobCheck): ESI holds jobs five minutes and the
 * hourly cron sometimes starts late, so an alt's job started just before a `:37` read is first seen 61 to 65 minutes on
 * (spec, Revision 2).
 */
export const FIRST_SIGHT_MS = 90 * 60_000;

/** ESI's activity IDs, as the Industry window names them. */
export const ACTIVITY_SAID: Record<number, string> = { 1: 'Manufacturing', 3: 'TE research', 4: 'ME research', 5: 'Copying', 7: 'Reverse engineering', 8: 'Invention', 9: 'Reaction', 11: 'Reaction' };
/** The activities the rules cost (industry.ts), by ESI's ID. Reactions and reverse engineering aren't modelled. */
export const ACTIVITY_OF: Partial<Record<number, Activity>> = { 1: 'manufacturing', 3: 'researchTime', 4: 'researchMaterial', 5: 'copying', 8: 'invention' };
/** What runs in a science slot (research, copying, invention, reverse engineering): every other activity in a factory slot. */
export const SCIENCE_ACTIVITIES: ReadonlySet<number> = new Set([3, 4, 5, 7, 8]);

/**
 * What only a writer who saw the job running can know (spec, "At first sight"): its blueprint's ME and TE as last read
 * for its item ID, the system it ran in, that system's index for its activity, and the EIV a run at that hour's adjusted
 * prices. Each is null when not known: never 0.
 */
export type FirstSight = {
  me: number | null; te: number | null; systemId: number | null; index: number | null; eiv: number | null;
  /** When it was taken (correction 21): a record's earliest `seenAt` may be a sighting of the job paused, hours before. */
  at?: string;
};

/** A job as kept: ESI's fields, units a manufacturing run makes (industryEiv.json `out`), when it was first seen, and its first sight. */
export type JobRecord = {
  jobId: number; activity: number; blueprintId: number; blueprintTypeId: number; productTypeId: number | null;
  runs: number; licensedRuns: number | null; successfulRuns: number | null; probability: number | null;
  /** "The sum of job installation fee and industry facility tax" (ESI): what the game charged. */
  cost: number | null;
  facilityId: number; stationId: number;
  /** Where its products land (ESI's `output_location_id`): List what you built looks for them there. */
  outputId: number;
  start: string; end: string; completed: string | null;
  /** ESI's: active, paused, ready, delivered, cancelled or reverted. */
  status: string;
  /** Units a manufacturing run makes; null for any other activity, or when the reader couldn't say. */
  perRun: number | null;
  /** When it was first seen, by whichever writer saw it first. */
  seenAt: string;
  /** Present only when it was first seen while active. */
  first?: FirstSight;
};

const RANK: Record<string, number> = { active: 0, paused: 0, ready: 1, delivered: 2, cancelled: 2, reverted: 2 };
const rank = (s: string): number => RANK[s] ?? 0;
const num = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/** A record in one key order, so two equal records stringify alike whichever writer built them. */
function shape(x: JobRecord): JobRecord {
  const f = x.first;
  return {
    jobId: x.jobId, activity: x.activity, blueprintId: x.blueprintId, blueprintTypeId: x.blueprintTypeId, productTypeId: x.productTypeId,
    runs: x.runs, licensedRuns: x.licensedRuns, successfulRuns: x.successfulRuns, probability: x.probability, cost: x.cost,
    facilityId: x.facilityId, stationId: x.stationId, outputId: x.outputId, start: x.start, end: x.end, completed: x.completed, status: x.status,
    perRun: x.perRun, seenAt: x.seenAt,
    ...(f ? { first: { me: f.me, te: f.te, systemId: f.systemId, index: f.index, eiv: f.eiv, ...(f.at ? { at: f.at } : {}) } } : {}),
  };
}

/** ESI's row as kept, seen at `seenAt`; `perRun` is kept for manufacturing only. */
export function toJob(r: RawJob, seenAt: string, perRun: number | null): JobRecord {
  return shape({
    jobId: r.job_id, activity: r.activity_id, blueprintId: r.blueprint_id, blueprintTypeId: r.blueprint_type_id,
    productTypeId: num(r.product_type_id), runs: r.runs, licensedRuns: num(r.licensed_runs), successfulRuns: num(r.successful_runs),
    probability: num(r.probability), cost: num(r.cost), facilityId: r.facility_id, stationId: r.station_id ?? r.facility_id,
    outputId: r.output_location_id ?? r.station_id ?? r.facility_id, start: r.start_date, end: r.end_date,
    completed: r.completed_date ?? null, status: r.status, perRun: r.activity_id === 1 ? perRun : null, seenAt,
  });
}

/**
 * The blueprint whose ME 0 materials a job's EIV is worked out on: invention's is the Tech II blueprint it makes (ESI's
 * `product_type_id`), as `inventionCost` charges 2% of the Tech II product's EIV an attempt; every other activity's its own.
 */
export const eivBlueprintOf = (j: Pick<JobRecord, 'activity' | 'blueprintTypeId' | 'productTypeId'>): number | null =>
  j.activity === 8 ? j.productTypeId : j.blueprintTypeId;

export type SightInputs = {
  /** The blueprint's ME and TE as last read for the job's blueprint item ID; null when not held or not read. */
  bp: { me: number; te: number } | null;
  systemId: number | null;
  indices: Record<number, IndustryIndex> | null;
  adjusted: Record<number, number> | null;
  /** industryEiv.json's `eiv`. */
  eiv: Record<string, [number, number][]> | null;
};

/** The first-sight fields, for a job seen while active; undefined for one first seen after it ended. */
export function firstSight(j: JobRecord, o: SightInputs): FirstSight | undefined {
  if (j.status !== 'active') return undefined;
  const act = ACTIVITY_OF[j.activity];
  const sys = o.systemId != null ? o.indices?.[o.systemId] : undefined;
  const bp = eivBlueprintOf(j);
  const mats = bp != null ? o.eiv?.[String(bp)] : undefined;
  return {
    me: o.bp?.me ?? null, te: o.bp?.te ?? null, systemId: o.systemId,
    index: act && sys ? sys[act] : null,
    eiv: mats && o.adjusted ? eivOf(mats, o.adjusted) : null,
    at: j.seenAt,
  };
}

/**
 * One job as two writers saw it, merged (spec, "Two writers merge, never overwrite"). First-sight fields, once present, are
 * never dropped: the earliest-seen record's, else the other's. The earliest `seenAt` wins. ESI's own fields (status, end,
 * cost, completed) come from the record with the later status (a delivered, cancelled or reverted job over a ready one,
 * ready over active or paused), on a tie from `incoming`, the read being written now: a read time on every record would
 * change at every read and push every job every sync. Units a run: either's. Returns `stored` itself when nothing changed,
 * so a writer pushes only what moved; a stored value that isn't this job's record gives way.
 */
export function mergeJob(stored: JobRecord | undefined | null, incoming: JobRecord): JobRecord {
  if (!stored || typeof stored !== 'object' || stored.jobId !== incoming.jobId || typeof stored.seenAt !== 'string') return incoming;
  const sAt = Date.parse(stored.seenAt), iAt = Date.parse(incoming.seenAt);
  const earlier = iAt < sAt ? incoming : stored;
  const later = earlier === stored ? incoming : stored;
  const esi = rank(incoming.status) >= rank(stored.status) ? incoming : stored;
  const first = earlier.first ?? later.first;
  const next = shape({ ...esi, seenAt: earlier.seenAt, perRun: incoming.perRun ?? stored.perRun, first });
  return JSON.stringify(next) === JSON.stringify(shape(stored)) ? stored : next;
}

/** ESI's rows the writer doesn't hold yet. */
export const newJobs = (raw: readonly RawJob[], stored: Readonly<Record<string, JobRecord>>): RawJob[] =>
  raw.filter((r) => Number.isInteger(r?.job_id) && !stored[String(r.job_id)]);

/** What a writer knows while it reads: the time, units a run by blueprint, its blueprints by item ID, each station's system, the indices, prices and EIV table. */
export type JobsContext = Omit<SightInputs, 'bp' | 'systemId'> & {
  seenAt: string;
  perRun: (blueprintTypeId: number) => number | null;
  bp: (itemId: number) => { me: number; te: number } | null;
  systemOf: (stationId: number) => number | null;
};

/**
 * ESI's list folded onto what the writer holds: each row merged onto its record; one not held is seen now, with its
 * first-sight fields while active (a held job is never sighted again, whatever it shows). The records that changed.
 */
export function readJobs(raw: readonly RawJob[], stored: Readonly<Record<string, JobRecord>>, c: JobsContext): JobRecord[] {
  const out: JobRecord[] = [];
  for (const r of raw) {
    if (!Number.isInteger(r?.job_id)) continue;
    const held = stored[String(r.job_id)];
    let j = toJob(r, c.seenAt, c.perRun(r.blueprint_type_id));
    if (!held) {
      const f = firstSight(j, { bp: c.bp(r.blueprint_id), systemId: c.systemOf(j.stationId), indices: c.indices, adjusted: c.adjusted, eiv: c.eiv });
      if (f) j = shape({ ...j, first: f });
    }
    const m = mergeJob(held, j);
    if (m !== held) out.push(m);
  }
  return out;
}

/** Units a job made: runs × units a run, for manufacturing; null when it isn't manufacturing or units a run aren't known. */
export const jobUnits = (j: JobRecord): number | null => (j.activity === 1 && j.perRun != null ? (j.successfulRuns ?? j.runs) * j.perRun : null);

/**
 * Whether a job can be checked against what EVE charged (jobCheck): first seen running within FIRST_SIGHT_MS of its start,
 * judged by when its first sight was taken (`first.at`; a record from before it was kept falls back to `seenAt`).
 */
export const checkable = (j: JobRecord): boolean => !!j.first && Date.parse(j.first.at ?? j.seenAt) - Date.parse(j.start) <= FIRST_SIGHT_MS;

// --- Blueprints ------------------------------------------------------------------------------------------------------

/** One blueprint as ESI lists it, as a row: item ID, type, where, its flag, quantity (−1 original, −2 copy, n unused), runs (−1 an original), ME, TE. */
export type BpRow = [itemId: number, typeId: number, locationId: number, flag: string, quantity: number, runs: number, me: number, te: number];
/**
 * Your blueprints, sorted by item ID, and the names of the containers, ships and structures they sit in, by location ID
 * (`''`: asked, and it has none, or the structure refused the reader). Absent is not read; an empty list is read.
 */
export type BlueprintsDoc = {
  list: BpRow[]; names?: Record<string, string>;
  /**
   * Which of the places are containers or ships of the character's own (their item IDs, found in its assets read), so a
   * reader can say container or structure without working it out again. Asset item IDs are 13 digits like structures'
   * (every `item_id` in a real asset read, 155 rows, is 1.044e12 to 1.056e12), so an ID's size can't tell them apart.
   */
  items?: number[];
};
/** A document is one D1 row (2 MB at most); 20,000 rows are about 1.2 MB. */
export const MAX_BLUEPRINTS = 20_000;

export const isStationId = (id: number): boolean => id >= 60_000_000 && id < 64_000_000;
export const isStructureId = (id: number): boolean => id >= 1_000_000_000_000;
const isInt = (n: unknown): n is number => Number.isInteger(n);
const okRow = (r: unknown): r is BpRow => Array.isArray(r) && r.length === 8 && isInt(r[0]) && r[0] > 0 && isInt(r[1]) && r[1] > 0 && isInt(r[2])
  && typeof r[3] === 'string' && isInt(r[4]) && r[4] >= -2 && isInt(r[5]) && r[5] >= -1 && isInt(r[6]) && r[6] >= 0 && r[6] <= 10 && isInt(r[7]) && r[7] >= 0 && r[7] <= 20;

function withNames(list: BpRow[], names: Record<string, string> | undefined, items?: unknown): BlueprintsDoc {
  const used = new Set(list.map((r) => String(r[2])));
  const kept = Object.entries(names ?? {}).filter(([k, v]) => used.has(k) && typeof v === 'string').sort(([a], [b]) => Number(a) - Number(b));
  const held = Array.isArray(items) ? [...new Set(items.filter((n): n is number => isInt(n) && used.has(String(n))))].sort((a, b) => a - b) : [];
  return { list, ...(kept.length ? { names: Object.fromEntries(kept) } : {}), ...(held.length ? { items: held } : {}) };
}

/** ESI's blueprints as the document, with the names already known for the places they're in. */
export function toBlueprintsDoc(raw: readonly RawBlueprint[], names?: Record<string, string>, items?: readonly number[]): BlueprintsDoc {
  const list = raw.map((b): BpRow => [b.item_id, b.type_id, b.location_id, b.location_flag, b.quantity, b.runs, b.material_efficiency, b.time_efficiency])
    .filter(okRow).sort((a, b) => a[0] - b[0]).slice(0, MAX_BLUEPRINTS);
  return withNames(list, names, items);
}

/** The document as stored or pulled, cleaned: undefined (not read) when it isn't one; a row that isn't one dropped. */
export function sanitizeBlueprints(v: unknown): BlueprintsDoc | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !Array.isArray((v as BlueprintsDoc).list)) return undefined;
  const x = v as { list: unknown[]; names?: unknown; items?: unknown };
  const list = x.list.filter(okRow).slice(0, MAX_BLUEPRINTS);
  const names = x.names && typeof x.names === 'object' && !Array.isArray(x.names) ? (x.names as Record<string, string>) : undefined;
  return withNames(list, names, x.items);
}

/**
 * Whether a blueprints read that started at `startedAt` may be written over what's held (`blueprintsAt`, stamped at each
 * read's start by both writers, the sync and the Blueprints page): not when a read that started later has landed, or an
 * older read finishing late would put its doc and its time over a newer one's.
 */
export function readLands(heldAt: string | undefined, startedAt: number): boolean {
  if (!heldAt) return true;
  const t = Date.parse(heldAt);
  return !Number.isFinite(t) || t <= startedAt;
}

const ownedMemo = new WeakMap<BlueprintsDoc, OwnedBlueprint[]>();
/** The document read as the Blueprints page reads ESI (blueprints.ts readBlueprints). */
export function ownedOf(doc: BlueprintsDoc): OwnedBlueprint[] {
  let hit = ownedMemo.get(doc);
  if (!hit) {
    hit = readBlueprints(doc.list.map((r): RawBlueprint => ({ item_id: r[0], type_id: r[1], location_id: r[2], location_flag: r[3], quantity: r[4], runs: r[5], material_efficiency: r[6], time_efficiency: r[7] })));
    ownedMemo.set(doc, hit);
  }
  return hit;
}

/** A blueprint's ME and TE by its item ID, as last read; null when it isn't held or nothing was read. */
export function bpAt(doc: BlueprintsDoc | undefined, itemId: number): { me: number; te: number } | null {
  const r = doc?.list.find((x) => x[0] === itemId);
  return r ? { me: r[6], te: r[7] } : null;
}

/**
 * A job's blueprint by its item ID for first sight (correction 20): in the read just taken, else in the doc held before it.
 * Whether ESI lists a blueprint while it's installed in a job isn't known; "as last read" is the spec's rule.
 */
export const bpFrom = (fresh: BlueprintsDoc | undefined | null, held: BlueprintsDoc | undefined | null) => (itemId: number): { me: number; te: number } | null =>
  bpAt(fresh ?? undefined, itemId) ?? bpAt(held ?? undefined, itemId);

/**
 * The places the document doesn't name yet, by how each is named: containers and ships (by /assets/names), structures (by
 * /universe/structures). Stations are named by anyone. An asset's item ID is 13 digits, like a structure's, so the size says
 * nothing: a place that is one of the character's own item IDs (`itemIds`, from its assets read) is a container or ship;
 * a 13-digit one that isn't is a structure. With no assets read (`itemIds` null) nothing can be told apart, so no place is
 * classified and none is marked named: it is asked again next time. `items` is every container or ship found, named or not.
 */
export function placesToName(doc: BlueprintsDoc, itemIds: ReadonlySet<number> | null | undefined): { items: number[]; structures: number[] } {
  if (!itemIds) return { items: [], structures: [] };
  const ids = [...new Set(doc.list.map((r) => r[2]))].filter((id) => !isStationId(id)).sort((a, b) => a - b);
  const toName = ids.filter((id) => !(String(id) in (doc.names ?? {})));
  return { items: toName.filter((id) => itemIds.has(id)), structures: toName.filter((id) => !itemIds.has(id) && isStructureId(id)) };
}

/** The doc's places that are containers or ships: the ones already found, and those among this read's item IDs. */
export const itemPlaces = (doc: BlueprintsDoc, itemIds: ReadonlySet<number> | null | undefined): number[] =>
  [...new Set(doc.list.map((r) => r[2]))].filter((id) => (doc.items ?? []).includes(id) || !!itemIds?.has(id)).sort((a, b) => a - b);

// --- Slots -----------------------------------------------------------------------------------------------------------

/**
 * Slots in use, from a character's jobs: running (active or paused, not past its end) and finished but not delivered
 * (ready, or active past its end): a finished job holds its slot until it's delivered (forum reports; EVE University's
 * "Industry" page doesn't say; checked in game after shipping, limits.md).
 * Manufacturing takes a factory slot, research, copying, invention and reverse engineering a science slot; reactions have
 * slots of their own, not modelled.
 */
export function slotsUsed(jobs: readonly JobRecord[], now: number): { factory: number; science: number; running: number; ready: number } {
  let factory = 0, science = 0, running = 0, ready = 0;
  for (const j of jobs) {
    if (j.status !== 'active' && j.status !== 'paused' && j.status !== 'ready') continue;
    if (j.activity === 1) factory++; else if (SCIENCE_ACTIVITIES.has(j.activity)) science++; else continue;
    if (j.status === 'ready' || (j.status === 'active' && Date.parse(j.end) <= now)) ready++; else running++;
  }
  return { factory, science, running, ready };
}

// --- What EVE charged, against what the app works out (spec, "The job check, and what it measures") -------------------

/** Where a job ran, as the app knows it: an NPC station (its 0.25% tax, no bonus), or one of your sites (its kind, rigs, band and typed tax). */
export type JobPlace = { kind: SiteKind; rigs: readonly number[]; band: SecBand; tax: number | null; siteId: string | null };
/** A cost more than this share off what EVE charged is said. */
export const CHECK_TOLERANCE = 0.01;
/** The most a structure's owner can charge (EVE University, "Tax"): a measure over it means the inputs moved. */
export const MAX_FACILITY_TAX = 0.1;

/** Where a job ran: an NPC station by its own facility tax; a structure only when it's one of your sites; else null (its bonuses aren't known). */
export function jobPlace(job: JobRecord, sites: readonly IndustrySite[], bandOf: (site: IndustrySite) => SecBand): JobPlace | null {
  if (isStationId(job.facilityId)) return { kind: 'npc', rigs: [], band: 'high', tax: NPC_FACILITY_TAX, siteId: sites.find((s) => s.stationId === job.facilityId)?.id ?? null };
  const site = sites.find((s) => s.structureId === job.facilityId);
  return site ? { kind: site.kind, rigs: site.rigs, band: bandOf(site), tax: site.tax, siteId: site.id } : null;
}

const late = (job: JobRecord): string => {
  const min = Math.round((Date.parse(job.seenAt) - Date.parse(job.start)) / 60_000);
  return `first seen ${min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`} after it started: the index and prices may have moved since it was installed`;
};

/**
 * (Named `jobCostFor`, not `jobCostOf`: that is industry.ts's rule on a base, which the cost functions below use.)
 * The cost the app works out for a job from what was kept at its first sight (the index and the EIV a run, its blueprint's
 * ME and TE for research) and where it ran: the rules of industry.ts, as the finder charges them. A reason instead when it
 * can't: not modelled, seen after it ended or too late, an input not kept, a structure that isn't your site.
 */
export function jobCostFor(ix: Indexed, job: JobRecord, place: JobPlace | null, clone: Clone): { cost: JobCost } | { why: string } {
  const act = ACTIVITY_OF[job.activity];
  if (!act) return { why: `${ACTIVITY_SAID[job.activity] ?? 'This activity'} isn’t modelled` };
  const f = job.first;
  if (!f) return { why: 'first seen after it ended: its index and EIV weren’t kept' };
  if (!checkable(job)) return { why: late(job) };
  if (f.index == null) return { why: 'the system’s index wasn’t read when it was seen' };
  if (f.eiv == null) return { why: 'its estimated item value wasn’t known when it was seen (an adjusted price was missing)' };
  if (!place) return { why: 'it ran at a structure that isn’t one of your build sites, so its bonuses aren’t known' };
  const sb = structureBonus(ix, place.kind);
  const rig = rigFor(ix, place.rigs, place.kind, place.band, act === 'manufacturing' ? job.productTypeId : null, act);
  const at = { index: f.index, structure: sb.cost, rig: rig.cost, tax: place.tax, clone };
  if (act === 'manufacturing') return { cost: manufacturingCost(f.eiv, job.runs, at) };
  if (act === 'copying') return { cost: copyCost(f.eiv, job.licensedRuns ?? 1, job.runs, at) };
  if (act === 'invention') return { cost: inventionCost(f.eiv, job.runs, at) };
  // Research: levels from the blueprint's own as kept at first sight (a TE level is 2%), a job's runs being levels.
  const from = act === 'researchMaterial' ? f.me : f.te == null ? null : Math.floor(f.te / 2);
  if (from == null) return { why: `its ${act === 'researchMaterial' ? 'ME' : 'TE'} wasn’t read when it was seen` };
  return { cost: researchCost(f.eiv, from, Math.min(10, from + job.runs), at) };
}

export type JobCheck =
  | { state: 'unchecked'; why: string }
  /** `sccShare`: at an NPC station, for research and copying, what EVE charged over the app's base besides the index part and the tax: the SCC reading a real job settles. */
  | { state: 'checked'; app: number; charged: number; parts: JobCost; differs: boolean; sccShare?: number };

/** A finished or running job's cost as EVE charged it (ESI's `cost`) against the app's; said when more than 1% apart. */
export function jobCheck(ix: Indexed, job: JobRecord, place: JobPlace | null, clone: Clone): JobCheck {
  if (job.cost == null) return { state: 'unchecked', why: 'ESI gives no cost for it' };
  const r = jobCostFor(ix, job, place, clone);
  if ('why' in r) return { state: 'unchecked', why: r.why };
  if (r.cost.tax == null) return { state: 'unchecked', why: 'the facility tax there isn’t typed (what the job measures is offered on the site)' };
  if (r.cost.alpha == null) return { state: 'unchecked', why: 'the clone state isn’t read, so the Alpha tax may be in it' };
  const app = r.cost.total, charged = job.cost;
  const act = ACTIVITY_OF[job.activity];
  const scc = place?.kind === 'npc' && (act === 'copying' || act === 'researchMaterial' || act === 'researchTime') && r.cost.base > 0
    ? (charged - (r.cost.index + r.cost.bonus + (r.cost.tax ?? 0) + (r.cost.alpha ?? 0))) / r.cost.base : null;
  return { state: 'checked', app, charged, parts: r.cost, differs: Math.abs(app - charged) > CHECK_TOLERANCE * Math.max(charged, 1), ...(scc != null ? { sccShare: scc } : {}) };
}

/**
 * The facility tax a manufacturing job at one of your structure sites paid (spec): (ESI's cost − the base × (index ×
 * bonuses + SCC + Alpha tax)) ÷ the base, to 0.01%. Only offered, with Use this, never written by itself. A reason instead
 * where it can't measure: another activity, an NPC station or a structure that isn't your site, the clone state not read
 * (the Alpha tax may be in the cost), seen too late, or a figure no structure can charge.
 */
export function measuredTax(ix: Indexed, job: JobRecord, place: JobPlace | null, clone: Clone): { tax: number; why?: undefined } | { why: string; tax?: undefined } {
  if (job.activity !== 1) return { why: 'only a manufacturing job measures the facility tax' };
  if (!place || place.kind === 'npc' || !place.siteId) return { why: 'only a job at one of your structure sites measures its tax' };
  if (clone === 'unknown') return { why: 'the clone state isn’t read, so the Alpha tax may be in its cost' };
  if (job.cost == null) return { why: 'ESI gives no cost for it' };
  const r = jobCostFor(ix, job, { ...place, tax: 0 }, clone);
  if ('why' in r) return { why: r.why };
  const tax = (job.cost - (r.cost.index + r.cost.bonus + r.cost.scc + (r.cost.alpha ?? 0))) / r.cost.base;
  if (!Number.isFinite(tax) || tax < -0.0005) return { why: 'what it measures is under nothing: its index or prices moved since' };
  if (tax > MAX_FACILITY_TAX + 0.0005) return { why: `what it measures, ${(tax * 100).toFixed(1)}%, is more than a structure can charge (10%): its index or prices moved since` };
  return { tax: Math.max(0, Math.round(tax * 10_000) / 10_000) };
}
