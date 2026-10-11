/**
 * The Blueprints & jobs section's rows (docs/notes/industry.md, stage 2): each character's slots, jobs ready and blueprints
 * held, with the industry skills it lacks for its next rung; the fleet's totals; one blueprint row a kind; an original's
 * next research step. Pure (check.mjs loads it), browser only: it reads the ladder and the finder's rules, which the Worker
 * has no use for, so it isn't industryTrack.ts. Nothing not read is a zero: a count is null with why.
 */
import type { OwnedBlueprint } from './blueprints';
import { eivOf, researchCost, researchTime, rigFor, slots, structureBonus, type BundleBp, type Clone, type Indexed } from './industry';
import { alphaCapOf, RUNGS, usable, type RungKey } from './industryLadder';
import type { LabSite } from './industryRank';
import { productKind } from './industryRank';
import { isStationId, slotsUsed, type JobRecord } from './industryTrack';
import { units } from './format';
import { lostSaid } from './pilot';
import { ROMAN } from './skillStatus';
import { spForLevel, trainingDays, type Attributes } from './training';

/** Where a character's read stands: read (with when), not read yet, the main's login lacking the permission, an alt's handed over without it, or its login lost. */
export type Read<T> =
  | { state: 'read'; value: T; at: number | null }
  | { state: 'unread' } | { state: 'login' } | { state: 'handOver' } | { state: 'lost'; why: 'refused' | 'none' };

const WHAT: Record<'jobs' | 'blueprints', string> = { jobs: 'industry jobs', blueprints: 'blueprints' };
/** Why a read isn't shown, as a sentence; null when read. The research tab's words (researchChars.ts), for jobs and blueprints. */
export function readWhy(c: { isMain: boolean; name: string }, r: Read<unknown>, what: 'jobs' | 'blueprints'): string | null {
  if (r.state === 'read') return null;
  if (r.state === 'unread') return c.isMain ? `Not read yet: your ${WHAT[what]} come with the next sync.` : `Not read yet: ${c.name}’s ${WHAT[what]} come with the cloud’s next hourly read.`;
  if (r.state === 'login') return `Log in again: this login wasn’t given EVE’s permission to read your ${WHAT[what]}.`;
  if (r.state === 'handOver') return `Hand the cloud ${c.name}’s login again: it was handed over without the permission to read ${WHAT[what]}.`;
  return r.why === 'refused' ? `Not read: EVE refused ${c.name}’s login; hand it over again on the Characters page.` : `Not read: the cloud holds no login for ${c.name}; hand one over on the Characters page.`;
}

export type CharIn = {
  charId: number; name: string; isMain: boolean; clone: Clone;
  /** Usable levels (finderSkills): undefined when not read. */
  skills: Record<number, number> | undefined;
  sp: Record<number, number> | undefined; attrs: Attributes | undefined;
  jobs: Read<JobRecord[]>; blueprints: Read<OwnedBlueprint[]>;
  /** An alt whose login EVE refused, or that has none (pilot.lost). */
  lost?: 'refused' | 'none';
};
export type CharRow = {
  charId: number; name: string; isMain: boolean;
  /** Slots from skills (`of`) and in use from jobs (`used`, null when jobs aren't read); null when skills aren't read. */
  factory: { used: number | null; of: number } | null;
  science: { used: number | null; of: number } | null;
  ready: number | null;
  originals: number | null; copies: number | null;
  /** The first rung with a skill it lacks: those skills, which need Omega, and the training time for the rest (null when not known); 'top' with none left; null when skills aren't read. */
  next: { title: string; lacking: { id: number; level: number; name: string; omega: boolean }[]; days: number | null } | 'top' | null;
  /** One sentence for what isn't shown, or that what's shown is as of the cloud's last read; null when everything is read and current. */
  why: string | null;
};

/** The industry skills lacking for the first rung (Build at home has none) the character's usable levels don't cover. */
function nextRung(ix: Indexed, c: CharIn): CharRow['next'] {
  if (!c.skills) return null;
  const have = usable(c.skills, c.clone);
  for (const r of RUNGS) {
    const lacking = r.needs.filter((n) => (have[n.skill] ?? 0) < n.level).map((n) => ({ id: n.skill, level: n.level, name: n.name, omega: c.clone === 'alpha' && n.level > alphaCapOf(n.skill) }));
    if (!lacking.length) continue;
    let days: number | null = 0;
    for (const l of lacking.filter((x) => !x.omega)) {
      const s = ix.b.skills[l.id];
      if (!s || !c.attrs || days == null) { days = null; break; }
      const dg = { rank: s[0], primary: s[1], secondary: s[2] };
      days += trainingDays(dg, c.attrs, Math.max(c.sp?.[l.id] ?? 0, spForLevel(dg.rank, c.skills[l.id] ?? 0)), l.level, c.clone === 'alpha');
    }
    return { title: r.title, lacking, days: lacking.every((x) => x.omega) ? null : days };
  }
  return 'top';
}

const lostLine = (c: CharIn): string | null => lostSaid({ isMain: c.isMain, name: c.name, pilot: { lost: c.lost } });

export function charRows(ix: Indexed, chars: readonly CharIn[], now: number): CharRow[] {
  return chars.map((c) => {
    const s = c.skills ? slots(ix, usable(c.skills, c.clone)) : null;
    const used = c.jobs.state === 'read' ? slotsUsed(c.jobs.value, now) : null;
    const bps = c.blueprints.state === 'read' ? c.blueprints.value : null;
    const jobsWhy = readWhy(c, c.jobs, 'jobs'), bpsWhy = readWhy(c, c.blueprints, 'blueprints');
    const anyRead = c.jobs.state === 'read' || c.blueprints.state === 'read';
    const lost = lostLine(c);
    // One sentence where one will do: read data from a lost login says it's the cloud's last read; nothing read at all says
    // why once (both unread alike, or both lost, whose sentence is the same).
    const why = anyRead
      ? [lost ? `As the cloud last read it. ${lost}` : null, jobsWhy, bpsWhy].filter(Boolean).join(' ') || null
      : readsWhy(c, c.jobs, c.blueprints);
    return {
      charId: c.charId, name: c.name, isMain: c.isMain,
      factory: s ? { used: used?.factory ?? null, of: s.factory } : null,
      science: s ? { used: used?.science ?? null, of: s.science } : null,
      ready: used?.ready ?? null,
      originals: bps ? bps.filter((b) => !b.copy).reduce((n, b) => n + b.count, 0) : null,
      copies: bps ? bps.filter((b) => b.copy).reduce((n, b) => n + b.count, 0) : null,
      next: nextRung(ix, c),
      why,
    };
  });
}

/** The fleet's totals, over the characters whose figure is read only, with how many were. */
export type Fleet = {
  factory: { used: number; of: number } | null; science: { used: number; of: number } | null;
  ready: number | null; originals: number | null; copies: number | null;
  jobsRead: number; bpsRead: number; of: number;
  /** Characters whose slots in use are known (skills and jobs both read). */
  slotsRead: number;
};
export function fleetTotals(rows: readonly CharRow[]): Fleet {
  const sum = (xs: (number | null)[]) => { const k = xs.filter((x): x is number => x != null); return k.length ? k.reduce((a, b) => a + b, 0) : null; };
  const slot = (k: 'factory' | 'science') => { const r = rows.map((x) => x[k]).filter((x): x is { used: number; of: number } => x != null && x.used != null); return r.length ? { used: r.reduce((a, b) => a + b.used, 0), of: r.reduce((a, b) => a + b.of, 0) } : null; };
  return {
    factory: slot('factory'), science: slot('science'), ready: sum(rows.map((r) => r.ready)),
    originals: sum(rows.map((r) => r.originals)), copies: sum(rows.map((r) => r.copies)),
    jobsRead: rows.filter((r) => r.ready != null).length, bpsRead: rows.filter((r) => r.originals != null).length, of: rows.length,
    slotsRead: rows.filter((r) => r.factory?.used != null).length,
  };
}

/** One row of the blueprints table: a kind a character holds, how many, and where (location ID, count), most first. */
export type BpKindRow = { key: string; charId: number; name: string; typeId: number; copy: boolean; unused: boolean; me: number; te: number; runs: number | null; count: number; where: [number, number][] };
/** Every character's blueprints, one row a kind and character, by character in the order given, then item ID order. */
export function blueprintKinds(chars: readonly { charId: number; name: string; owned: readonly OwnedBlueprint[] }[]): BpKindRow[] {
  const out: BpKindRow[] = [];
  for (const c of chars) {
    const by = new Map<string, BpKindRow>();
    for (const b of [...c.owned].sort((x, y) => x.typeId - y.typeId || x.itemId - y.itemId)) {
      const key = `${c.charId}|${b.typeId}|${b.copy ? 1 : 0}|${b.me}|${b.te}|${b.runs ?? ''}|${b.unused ? 'u' : ''}`;
      const r = by.get(key) ?? { key, charId: c.charId, name: c.name, typeId: b.typeId, copy: b.copy, unused: b.unused, me: b.me, te: b.te, runs: b.runs, count: 0, where: [] };
      r.count += b.count;
      const w = r.where.find((x) => x[0] === b.locationId);
      if (w) w[1] += b.count; else r.where.push([b.locationId, b.count]);
      by.set(key, r);
    }
    out.push(...[...by.values()].map((r) => ({ ...r, where: r.where.sort((a, b) => b[1] - a[1]) })));
  }
  return out;
}

/** An original's next research step: ME first to 10, then TE to 20 (a TE level is 2%), its time and cost at the lab. */
export type NextStep = { what: 'me' | 'te'; from: number; to: number; seconds: number; cost: number | null } | 'done' | 'copy' | 'none';
export function nextResearch(o: { ix: Indexed; bp: BundleBp; me: number; te: number; copy: boolean; skills: Record<number, number>; clone: Clone; lab: LabSite | null; adjusted: Record<number, number> | null }): NextStep {
  if (o.copy) return 'copy';
  const what = o.me < 10 ? 'me' : o.te < 20 ? 'te' : null;
  if (!what) return 'done';
  const act = what === 'me' ? o.bp[4] : o.bp[5];
  if (!act) return 'none';
  const from = what === 'me' ? o.me : Math.floor(o.te / 2), to = from + 1;
  const kind = o.lab?.kind ?? 'npc';
  const sb = structureBonus(o.ix, kind);
  const a = what === 'me' ? 'researchMaterial' : 'researchTime';
  const rig = o.lab ? rigFor(o.ix, o.lab.rigs, o.lab.kind, o.lab.band, null, a) : { material: 1, time: 1, cost: 1 };
  const seconds = researchTime(o.ix, act[0], what, from, to, o.skills, sb.time, rig.time);
  const m = o.bp[2];
  const eiv = m && o.adjusted ? eivOf(m[1], o.adjusted) : null;
  const cost = o.lab?.index && eiv != null ? researchCost(eiv, from, to, { index: o.lab.index[a], structure: sb.cost, rig: rig.cost, tax: o.lab.tax, clone: o.clone }).total : null;
  return { what, from: what === 'me' ? from : from * 2, to: what === 'me' ? to : to * 2, seconds, cost };
}

/**
 * The finder's inputs for one character's blueprint row: under All each row is worked out at its own character's usable
 * skills, clone, Jita broker fee and sales tax, and whether it mines, over the shown character's (spec, Revision 2). Null
 * when its skills aren't read: a row is never worked out at level 0.
 */
export function charInput<I extends { skills: Record<number, number>; clone: Clone; fees: { broker: number; tax: number; hubBroker: number | null }; mines: boolean }>(
  base: I, c: { skills: Record<number, number> | undefined; clone: Clone; broker: number; tax: number; mines: boolean },
): I | null {
  if (!c.skills) return null;
  return { ...base, skills: c.skills, clone: c.clone, fees: { ...base.fees, broker: c.broker, tax: c.tax }, mines: c.mines };
}

/**
 * A blueprint's place by its name. A station is named by ESI (`station`); anything else by the blueprints document: a
 * non-empty name as it is; a place in its `items` (the character's own containers and ships, found in its assets read) is a
 * container or ship, `''` meaning it hasn't named it; a place not in `items` with `''` is a structure its login can't see;
 * not named at all, and not known to be an item (without an assets read nothing can be told apart; asset item IDs are 13
 * digits like structures'), it can be any of the three.
 */
export function placeSaid(c: { isMain: boolean; name: string }, id: number, doc: { names: Readonly<Record<string, string>>; items: readonly number[] }, station: (id: number) => string): string {
  if (isStationId(id)) return station(id);
  const n = doc.names[String(id)];
  if (n) return n;
  if (doc.items.includes(id)) return n === '' ? `a container or ship ${c.isMain ? 'you haven’t' : `${c.name} hasn’t`} named` : 'a container or ship (not named yet)';
  return n === '' ? `a structure ${c.isMain ? 'your' : `${c.name}’s`} login can’t see` : 'a container, ship or structure (not named yet)';
}

/**
 * A job's place. A job runs in a station or a structure, never in a container: a station by ESI's name; a structure by the
 * blueprints document's name for it (`names`), else the one the main's sync named (`jobPlaces`, meta.industry.places), else
 * "a structure in <system>" from where it was first seen (`first.systemId`), else "a structure (not named yet)".
 */
export function jobPlaceSaid(j: Pick<JobRecord, 'stationId' | 'first'>, o: { names: Readonly<Record<string, string>>; jobPlaces: Readonly<Record<string, string>>; station: (id: number) => string; system: (id: number) => string | null }): string {
  if (isStationId(j.stationId)) return o.station(j.stationId);
  const k = String(j.stationId);
  const n = o.names[k] || o.jobPlaces[k];
  if (n) return n;
  const sys = j.first?.systemId != null ? o.system(j.first.systemId) : null;
  return sys ? `a structure in ${sys}` : 'a structure (not named yet)';
}

/** Why a character's jobs and blueprints aren't shown, in one sentence where both are alike; null when both are read. */
export function readsWhy(c: { isMain: boolean; name: string }, jobs: Read<unknown>, bps: Read<unknown>): string | null {
  const jw = readWhy(c, jobs, 'jobs'), bw = readWhy(c, bps, 'blueprints');
  if (!jw && !bw) return null;
  if (jw && bw && jobs.state === bps.state) {
    if (jobs.state === 'unread') return c.isMain ? 'Not read yet: your industry jobs and blueprints come with the next sync.' : `Not read yet: ${c.name}’s industry jobs and blueprints come with the cloud’s next hourly read.`;
    if (jobs.state === 'login') return 'Log in again: this login wasn’t given EVE’s permission to read your industry jobs and blueprints.';
    if (jobs.state === 'handOver') return `Hand the cloud ${c.name}’s login again: it was handed over without the permission to read industry jobs and blueprints.`;
    return jw;
  }
  return [jw, bw].filter(Boolean).join(' ');
}

/** How far back a rung's jobs are counted: ESI's own 90 days of jobs, so the figure doesn't grow with the records kept. */
export const RUNG_DONE_DAYS = 90;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/**
 * What the reads show of a rung (correction 14: they annotate it; skills still decide where you stand): jobs of its activity
 * in the last 90 days (cancelled and reverted ones aren't counted), and for research and copying what's held. Null when
 * nothing is read or nothing shows; More slots (Start's tiles say slots in use) and Build at home (a site) have none.
 */
export function rungDone(ix: Indexed, key: RungKey, r: { jobs: readonly JobRecord[] | null; blueprints: readonly OwnedBlueprint[] | null }, now: number): string | null {
  const recent = (r.jobs ?? []).filter((j) => j.status !== 'cancelled' && j.status !== 'reverted' && now - Date.parse(j.start) <= RUNG_DONE_DAYS * 86_400_000);
  const n = (acts: number[], also: (j: JobRecord) => boolean = () => true) => recent.filter((j) => acts.includes(j.activity) && also(j)).length;
  const since = 'in the last 90 days';
  const parts: string[] = [];
  const jobsSaid = (count: number, what: string) => { if (r.jobs && count) parts.push(`${plural(count, `${what} job`, `${what} jobs`)} ${since}`); };
  if (key === 'npc') jobsSaid(n([1], (j) => productKind(ix, j.productTypeId ?? 0) !== 'capital'), 'manufacturing');
  else if (key === 'research') {
    jobsSaid(n([3, 4]), 'research');
    const researched = (r.blueprints ?? []).filter((b) => !b.copy && (b.me > 0 || b.te > 0)).reduce((s, b) => s + b.count, 0);
    if (r.blueprints && researched) parts.push(plural(researched, 'original researched', 'originals researched'));
  } else if (key === 'copy') {
    jobsSaid(n([5]), 'copy');
    const copies = (r.blueprints ?? []).filter((b) => b.copy).reduce((s, b) => s + b.count, 0);
    if (r.blueprints && copies) parts.push(plural(copies, 'copy held', 'copies held'));
  } else if (key === 't2') jobsSaid(n([8]), 'invention');
  else if (key === 'capital') { const c = n([1], (j) => productKind(ix, j.productTypeId ?? 0) === 'capital'); if (r.jobs && c) parts.push(`${plural(c, 'capital', 'capitals')} ${since}`); }
  return parts.length ? parts.join('; ') : null;
}

/** "A", "A and B", "A, B and C". */
const andList = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * The Tech II chance tile's note: the skills invention needs and the character lacks, at I (EVE needs each at I to invent at
 * all), then the ones it has at their level, each skill once and levels in Roman numerals, then the attempts.
 */
export function chanceSaid(inv: { needs: number[]; sciences: { id: number; level: number }[]; encryption: { id: number; level: number } | null; attempts: number | null; runsPerCopy: number }, name: (id: number) => string, me: number, te: number): string {
  return [
    inv.needs.length ? `Needs ${andList(inv.needs.map((id) => `${name(id)} I`))} to invent; worked out at I` : null,
    [...inv.sciences, ...(inv.encryption ? [inv.encryption] : [])].filter((x) => !inv.needs.includes(x.id)).map((x) => `${name(x.id)} ${ROMAN[x.level]}`).join(', ') || null,
    `${inv.attempts != null ? inv.attempts.toFixed(2) : '–'} attempts a copy of ${units(inv.runsPerCopy)} run${inv.runsPerCopy === 1 ? '' : 's'}, at ME ${me} / TE ${te}`,
  ].filter(Boolean).join(' · ');
}
