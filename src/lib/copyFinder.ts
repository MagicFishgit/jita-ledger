/**
 * The Copies section's finder (docs/notes/industry.md, stage 3): each kind of copy that sold in The Forge this week, worked
 * out for one lab slot at the shown character's skills, clone and lab (the build site's, or the nearest Laboratory), and what
 * a real copy job of yours says about the copy cost's two readings that aren't checked yet. Browser only, pure: the Worker
 * imports copyMarket.ts, and this reads stage 2's job check and the finder's types (correction 9).
 */
import type { OwnedBlueprint } from './blueprints';
import { copyKindKey, type Ask, type CopySummary, type KindSold } from './copyMarket';
import { activityOf, copyCost, copyTime, DAY_S, eivOf, lacking, researchCost, researchTime, rigFor, SCC_COPY, structureBonus, type Clone, type Indexed, type JobCost } from './industry';
import type { BpoWhere, LabSite } from './industryRank';
import { ACTIVITY_OF, jobCheck, MEASURE_BAND, type JobPlace, type JobRecord } from './industryTrack';

/** Under this many sales a week, what a kind sells at is one or two buyers' prices (spec). */
export const THIN_SALES = 3;
/** Research to the kind's ME and TE that takes longer than this is flagged: payback leaves the research's time out. */
export const RESEARCH_LONG_DAYS = 30;

export function thinSaid(k: Pick<KindSold, 'contracts' | 'sellers'>): string | null {
  if (k.sellers <= 1) return '1 seller: one person’s prices';
  if (k.contracts < THIN_SALES) return `${k.contracts} sale${k.contracts === 1 ? '' : 's'} this week: too few to say what it sells at`;
  return null;
}

/** The best original of a type a character holds (highest ME, then TE); null when none is held or its blueprints aren't read. */
export function heldOriginal(owned: readonly OwnedBlueprint[] | null, typeId: number): { me: number; te: number } | null {
  let best: { me: number; te: number } | null = null;
  for (const b of owned ?? []) if (!b.copy && b.typeId === typeId && (!best || b.me > best.me || (b.me === best.me && b.te > best.te))) best = { me: b.me, te: b.te };
  return best;
}

export type CopyLeft = 'notInBundle' | 'invented' | 'noCopying';
export type CopyFinderRow = {
  kind: KindSold; bp: number;
  /** A run's price: the median sold, or the median ask now when that's lower (correction 7). */
  price: { perRun: number; from: 'sold' | 'asks' };
  /** A run's copy time (s); runs a day a lab slot makes; runs a day sold (everyone); yours at the share, capped by the slot. */
  time: number; labRuns: number; soldRuns: number; yourRuns: number; limit: 'market' | 'slot';
  eiv: number | null;
  /** A run's copy job at the lab; null with no Laboratory reached, its index not read, or no EIV. */
  cost: JobCost | null;
  /** Whether that cost is whole: false while the lab's tax or the Alpha tax (clone not read) isn't known. */
  costKnown: boolean | null;
  iskDay: number | null;
  research: 'held' | { me: [from: number, to: number]; te: [from: number, to: number]; days: number | null; cost: number | null };
  /** What the original costs: 0 when held, NPCs' price in The Forge, else null. */
  bpoPrice: number | null;
  payback: number | null;
  buildDay: number | null;
  thin: string | null;
  /** Skills lacking for copying and, unless the original is held whole, for researching it. */
  lacking: { id: number; level: number }[];
};
export type CopyRowInput = {
  ix: Indexed; kind: KindSold; ask: Ask | null;
  /** Days counted in the window: at least one is used (correction 16). */
  days: number;
  skills: Record<number, number>; clone: Clone;
  /** Where copying and research run (labFor); null when no Laboratory can be reached. */
  lab: LabSite | null;
  adjusted: Record<number, number> | null;
  /** The industry share, in percent. */
  share: number;
  held: { me: number; te: number } | null;
  bpo: BpoWhere;
  /** The finder's profit a day for one factory slot of this blueprint at an ME and TE; null when it can't say. */
  build: (bp: number, me: number, te: number) => number | null;
};

export function copyRow(o: CopyRowInput): CopyFinderRow | CopyLeft {
  const { ix, kind: k } = o;
  const bp = ix.bp.get(k.typeId);
  if (!bp) return 'notInBundle';
  if (ix.inventedFrom.has(k.typeId)) return 'invented';
  const copy = activityOf(bp, 'copying'), mfg = activityOf(bp, 'manufacturing');
  if (!copy || !mfg) return 'noCopying';
  const lab = o.lab;
  const sb = structureBonus(ix, lab?.kind ?? 'npc');
  const rig = (a: 'copying' | 'researchMaterial' | 'researchTime') => (lab ? rigFor(ix, lab.rigs, lab.kind, lab.band, null, a) : { material: 1, time: 1, cost: 1 });
  const time = copyTime(ix, copy[0], 1, 1, o.skills, sb.time, rig('copying').time);
  const labRuns = DAY_S / time;
  const soldRuns = (k.copies * k.runs) / Math.max(1, o.days);
  const atShare = (soldRuns * o.share) / 100;
  const yourRuns = Math.min(labRuns, atShare);
  const askMedian = o.ask ? o.ask[1] : null;
  const price = askMedian != null && askMedian < k.perRun ? { perRun: askMedian, from: 'asks' as const } : { perRun: k.perRun, from: 'sold' as const };
  const eiv = o.adjusted ? eivOf(mfg[1], o.adjusted) : null;
  const cost = eiv != null && lab?.index ? copyCost(eiv, 1, 1, { index: lab.index.copying, structure: sb.cost, rig: rig('copying').cost, tax: lab.tax, clone: o.clone }) : null;
  const iskDay = cost ? yourRuns * (price.perRun - cost.total) : null;
  const held = o.held;
  const rme = activityOf(bp, 'researchMaterial'), rte = activityOf(bp, 'researchTime');
  let research: CopyFinderRow['research'];
  if (held && held.me >= k.me && held.te >= k.te) research = 'held';
  else {
    // From the held original's levels (a TE level is 2%), never past the kind's: copies keep the original's ME and TE.
    const meFrom = Math.min(held?.me ?? 0, k.me), teFrom = Math.min(Math.floor((held?.te ?? 0) / 2), k.te / 2);
    const meT = rme ? researchTime(ix, rme[0], 'me', meFrom, k.me, o.skills, sb.time, rig('researchMaterial').time) : null;
    const teT = rte ? researchTime(ix, rte[0], 'te', teFrom, k.te / 2, o.skills, sb.time, rig('researchTime').time) : null;
    const at = (a: 'researchMaterial' | 'researchTime') => (lab?.index ? { index: lab.index[a], structure: sb.cost, rig: rig(a).cost, tax: lab.tax, clone: o.clone } : null);
    const meA = at('researchMaterial'), teA = at('researchTime');
    const meC = eiv != null && meA ? researchCost(eiv, meFrom, k.me, meA).total : null;
    const teC = eiv != null && teA ? researchCost(eiv, teFrom, k.te / 2, teA).total : null;
    research = { me: [meFrom, k.me], te: [teFrom * 2, k.te], days: lab && meT != null && teT != null ? (meT + teT) / DAY_S : null, cost: meC != null && teC != null ? meC + teC : null };
  }
  const bpoPrice = held ? 0 : o.bpo.state === 'forge' ? o.bpo.price : null;
  const researchIsk = research === 'held' ? 0 : research.cost;
  const payback = research !== 'held' && bpoPrice != null && researchIsk != null && iskDay != null && iskDay > 0 ? (bpoPrice + researchIsk) / iskDay : null;
  // Copying's skills, and research's (about a quarter of blueprints need some to research: the pump, Metallurgy I and Armor Rigging I).
  const need = new Map<number, number>();
  for (const { id, level } of [...lacking(copy[2], o.skills), ...(research === 'held' ? [] : [rme, rte].flatMap((a) => (a ? lacking(a[2], o.skills) : [])))]) need.set(id, Math.max(need.get(id) ?? 0, level));
  const needs = [...need].map(([id, level]) => ({ id, level }));
  return {
    kind: k, bp: bp[0], price, time, labRuns, soldRuns, yourRuns, limit: labRuns < atShare ? 'slot' : 'market', eiv, cost,
    costKnown: cost ? cost.tax != null && cost.alpha != null : null, iskDay, research, bpoPrice, payback,
    buildDay: o.build(bp[0], k.me, k.te), thin: thinSaid(k), lacking: needs,
  };
}

/** Every kind sold, ranked by ISK a day (unpriced last, then by type and runs), and how many were left out and why. */
export function copyRows(o: Omit<CopyRowInput, 'kind' | 'ask' | 'held' | 'bpo' | 'days'> & {
  summary: CopySummary; heldOf: (typeId: number) => { me: number; te: number } | null; bpoOf: (bp: number) => BpoWhere;
}): { rows: CopyFinderRow[]; left: Record<CopyLeft, number> } {
  const rows: CopyFinderRow[] = [], left: Record<CopyLeft, number> = { notInBundle: 0, invented: 0, noCopying: 0 };
  for (const k of o.summary.sold) {
    const r = copyRow({ ...o, kind: k, days: o.summary.days, ask: o.summary.asks[copyKindKey(k)] ?? null, held: o.heldOf(k.typeId), bpo: o.bpoOf(k.typeId) });
    if (typeof r === 'string') left[r]++; else rows.push(r);
  }
  rows.sort((a, b) => (b.iskDay ?? -Infinity) - (a.iskDay ?? -Infinity) || a.kind.typeId - b.kind.typeId || a.kind.runs - b.kind.runs);
  return { rows, left };
}

/** Under a week counted, how many days so far (spec); nothing at a week. */
export function countingSaid(s: Pick<CopySummary, 'days'>): string | null {
  if (s.days >= 7) return null;
  if (s.days <= 0) return 'Counting what sells: it began with the cloud’s last read; the next, six hours on, is the first to count.';
  return `Counting what sells: ${s.days < 1 ? 'less than a day' : `${Math.round(s.days * 10) / 10} days`} so far.`;
}
/** A comparison that spanned more than 6.5 hours missed what was listed and sold within it (correction 16). */
export function gapSaid(s: Pick<CopySummary, 'gapHours'>): string | null {
  return s.gapHours > 6.5 ? `The longest stretch between two reads was ${Math.round(s.gapHours)} h: copies listed and sold within it were missed.` : null;
}

// --- What a real job says about the copy cost (correction 15) ----------------------------------------------------------

export type CostReading =
  | { state: 'unchecked' }
  | { state: 'agrees' | 'differs'; jobId: number; start: string; who: string; app: number; charged: number; nearer: 'multiplied' | 'added' | null; alike?: boolean };
/** A job with where it ran (stage 2's `jobPlace`), its character's clone and whose it is ("Your", "Builder Alt’s"). */
export type CheckedJob = { job: JobRecord; place: JobPlace | null; clone: Clone; who: string };

/**
 * Which reading of a cost rig ESI's charge sits nearer: the app's, the rig multiplying the structure's bonus on the index part,
 * or the rig added to it. Null when the two are within twice what the index's four decimals and a tax typed to 0.01% move
 * the charge: at a low index they can't be told apart.
 */
export function rigNearer(base: number, index: number, structure: number, rig: number, rest: number, charged: number): 'multiplied' | 'added' | null {
  const mult = base * index * structure * rig + rest, added = base * index * (structure + rig - 1) + rest;
  const noise = base * (0.00005 * structure * rig + 0.00005);
  if (Math.abs(mult - added) <= 2 * noise) return null;
  return Math.abs(charged - mult) <= Math.abs(charged - added) ? 'multiplied' : 'added';
}

/**
 * The newest checked job (stage 2's `jobCheck`: first seen within 90 minutes, its inputs kept, the tax and clone known) that
 * settles each reading: a copy job at an NPC station for copying's SCC (its `sccShare` against SCC_COPY, to the measure's
 * band), and a copy or research job at one of your structure sites with a rig that cuts that activity's cost.
 */
export function copyReadings(ix: Indexed, jobs: readonly CheckedJob[]): { scc: CostReading; rig: CostReading } {
  let scc: CostReading = { state: 'unchecked' }, rig: CostReading = { state: 'unchecked' };
  for (const x of [...jobs].sort((a, b) => Date.parse(b.job.start) - Date.parse(a.job.start) || b.job.jobId - a.job.jobId)) {
    const act = ACTIVITY_OF[x.job.activity];
    if ((act !== 'copying' && act !== 'researchMaterial' && act !== 'researchTime') || !x.place) continue;
    const c = jobCheck(ix, x.job, x.place, x.clone);
    if (c.state !== 'checked' || !(c.parts.base > 0)) continue;
    const head = { jobId: x.job.jobId, start: x.job.start, who: x.who, app: c.app, charged: c.charged };
    if (scc.state === 'unchecked' && act === 'copying' && x.place.kind === 'npc' && c.sccShare != null)
      scc = { state: Math.abs(c.sccShare - SCC_COPY) <= MEASURE_BAND ? 'agrees' : 'differs', ...head, nearer: null };
    if (rig.state === 'unchecked' && x.place.kind !== 'npc') {
      const r = rigFor(ix, x.place.rigs, x.place.kind, x.place.band, null, act);
      if (r.cost < 1) {
        const sb = structureBonus(ix, x.place.kind), p = c.parts;
        // A structure with no cost bonus of its own (an Astrahus, a Fortizar): adding the rig's and multiplying are the same (M16).
        rig = sb.cost === 1 ? { state: c.differs ? 'differs' : 'agrees', ...head, nearer: null, alike: true }
          : { state: c.differs ? 'differs' : 'agrees', ...head, nearer: rigNearer(p.base, p.index / p.base, sb.cost, r.cost, (p.tax ?? 0) + p.scc + (p.alpha ?? 0), c.charged) };
      }
    }
  }
  return { scc, rig };
}

/** The copy cost's tip: each reading, checked or not. The rig's line only where the lab has a rig that cuts copying's cost. */
export function readingsSaid(r: { scc: CostReading; rig: CostReading }, labCostRig: boolean, date: (iso: string) => string): string[] {
  const isk = (n: number) => Math.round(n).toLocaleString('en-US');
  const out = [r.scc.state === 'unchecked'
    ? 'Copying’s SCC is taken as EVE Ref’s 4% of the job’s base: not yet checked against a copy job of yours (one at an NPC station, seen within 90 minutes of its start, settles it).'
    : r.scc.state === 'agrees' ? `Copying’s SCC checked: ${r.scc.who.toLowerCase() === 'your' ? 'your' : r.scc.who} copy job of ${date(r.scc.start)} at an NPC station paid it.`
      : `Copying’s SCC: ${r.scc.who.toLowerCase() === 'your' ? 'your' : r.scc.who} copy job of ${date(r.scc.start)} at an NPC station paid ${isk(r.scc.charged)} ISK where the app worked out ${isk(r.scc.app)}: the copy costs here may be off.`];
  if (!labCostRig) return out;
  const g = r.rig, whose = g.state === 'unchecked' ? '' : g.who.toLowerCase() === 'your' ? 'your' : g.who;
  out.push(g.state === 'unchecked'
    ? 'The copy rig’s cost bonus is taken as multiplying the structure’s: not yet checked against a job of yours (a copy or research job at one of your structure sites with such a rig, its tax typed, settles it).'
    : g.state === 'differs' ? `The copy rig’s cost bonus: ${whose} job of ${date(g.start)} paid ${isk(g.charged)} ISK where the app worked out ${isk(g.app)}: the costs here with a rig may be off.`
      : g.nearer === 'added' ? `The copy rig’s cost bonus: ${whose} job of ${date(g.start)} paid within 1% of the app’s figure, but nearer the rig adding to the structure’s bonus than multiplying it, so the costs here with a rig may be a little high.`
        : g.nearer === 'multiplied' ? `The copy rig’s cost bonus checked: ${whose} job of ${date(g.start)} paid the app’s figure, the rig multiplying the structure’s bonus.`
          : g.alike ? `The copy rig’s cost bonus: ${whose} job of ${date(g.start)} paid within 1% of the app’s figure; the structure has no cost bonus of its own, so adding the rig’s and multiplying are the same.`
            : `The copy rig’s cost bonus: ${whose} job of ${date(g.start)} paid within 1% of the app’s figure; at that index adding and multiplying can’t be told apart.`);
  return out;
}
