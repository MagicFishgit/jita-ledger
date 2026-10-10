import { ALPHA_SKILL_CAPS } from './alphaCaps';
import { lacking, MAX_SLOTS, productOf, SKILL, type BpActivity, type Clone, type Indexed } from './industry';
import { buildRow, finderBlueprints, productKind, type Row, type RowInput } from './industryRank';

/**
 * The ladder on Start (docs/notes/industry.md; the spec's "Start: the ladder"): seven rungs from a first job in a
 * high-sec NPC station to capitals. Each has the skills it needs, what it opens and how many blueprints, whether an Alpha
 * can climb it (read from CCP's caps for any Alpha character, main or alt: an alt's pilot marks only skills trained past
 * their cap, so a level an Alpha can't train would otherwise read as days of training), and where the shown character
 * stands: by its skills, and for building at home by the sites added. Its blueprints and jobs aren't read until stage 2.
 * Pure: no config, store, React or DOM.
 */

export type RungKey = 'npc' | 'research' | 'slots' | 'copy' | 'home' | 't2' | 'capital';
export type Need = { skill: number; level: number; name: string };
export type Rung = { key: RungKey; title: string; opens: string; needs: Need[] };

const ind = (level: number): Need => ({ skill: SKILL.industry, level, name: 'Industry' });
const mass = (level: number): Need => ({ skill: SKILL.massProduction, level, name: 'Mass Production' });
const lab = (level: number): Need => ({ skill: SKILL.labOp, level, name: 'Laboratory Operation' });
const science = (level: number): Need => ({ skill: SKILL.science, level, name: 'Science' });

/**
 * The rungs and the levels each asks for. The spec names the skills; the levels are this plan's: a rung asks for the
 * first level that does its job (Mass Production I runs a second job, Science I a copy), "More slots" for the five
 * levels and the advanced skill's first, Capitals for Capital Ship Construction III (the first capital hulls: I opens
 * none of the 29). Prerequisites aren't listed here: the skill rows say "Needs X first" from ESI
 * (Mass Production and Advanced Industry need Industry III; Research and Laboratory Operation, Science III; Metallurgy,
 * Science IV; Capital Ship Construction, Industry V, Advanced Industry V and Mechanics V: ESI, 10 October 2026).
 */
export const RUNGS: Rung[] = [
  {
    key: 'npc', title: 'Build in a high-sec NPC station', needs: [ind(1), mass(1)],
    opens: 'A factory slot in any NPC station with a Factory, and an original bought from NPCs, which builds for ever. Mass Production I runs a second job.',
  },
  {
    key: 'research', title: 'Research ME first', needs: [lab(1), { skill: SKILL.metallurgy, level: 1, name: 'Metallurgy' }, { skill: SKILL.research, level: 1, name: 'Research' }],
    opens: 'Material efficiency on your originals, in a station with a Laboratory: ME 8 takes a fraction of ME 10’s time, and each finder row’s detail gives the days at your skills.',
  },
  {
    key: 'slots', title: 'More slots', needs: [mass(5), { skill: SKILL.advancedMassProduction, level: 1, name: 'Advanced Mass Production' }, lab(5), { skill: SKILL.advancedLabOp, level: 1, name: 'Advanced Laboratory Operation' }],
    opens: `Up to ${MAX_SLOTS} factory jobs and ${MAX_SLOTS} science jobs at once. What limits most items is what the market takes, so each slot builds another item.`,
  },
  {
    key: 'copy', title: 'Copy, and sell copies', needs: [science(1)],
    opens: 'Copies keep the original’s ME and TE: build from them in more places, or sell them on contracts.',
  },
  {
    key: 'home', title: 'Build at home', needs: [],
    opens: 'An Azbel or Raitaru with rigs in null-sec builds for less (a rig counts 2.1 times there), with materials bought there or freighted in, and ships sold at home.',
  },
  {
    key: 't2', title: 'Tech II through invention', needs: [science(5)],
    opens: 'Invent Tech II copies from Tech I copies: Science V, the item’s two sciences and its race’s encryption skill, and datacores, which R&D agents make.',
  },
  {
    key: 'capital', title: 'Capitals', needs: [ind(5), { skill: SKILL.advancedIndustry, level: 5, name: 'Advanced Industry' }, { skill: SKILL.capitalShips, level: 3, name: 'Capital Ship Construction' }],
    opens: 'Carriers, dreadnoughts and force auxiliaries (Capital Ship Construction IV and V build supercarriers and titans), in a structure with a Standup Capital Shipyard.',
  },
];

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const listed = (xs: string[], last: 'and' | 'or') => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${last} ${xs[xs.length - 1]}`);

/** The level of a skill an Alpha can use (CCP's cloneGrades: a skill not listed, none). */
export const alphaCapOf = (skill: number): number => ALPHA_SKILL_CAPS[skill] ?? 0;

/**
 * The levels a character can use: an Alpha's held to CCP's caps. A main's skills are what it trained (its pilot carries
 * no caps); an alt's are already what it can use, so capping again changes nothing.
 */
export function usable(skills: Record<number, number>, clone: Clone): Record<number, number> {
  if (clone !== 'alpha') return skills;
  return Object.fromEntries(Object.entries(skills).map(([id, l]) => [id, Math.min(l, alphaCapOf(Number(id)))]));
}

/** A rung's needs past what an Alpha can use. */
export const beyondAlpha = (r: Rung): Need[] => r.needs.filter((n) => n.level > alphaCapOf(n.skill));

/** What a rung says about Alpha: "Needs Omega" for an Alpha, "Clone state not read" when unknown (never "Alpha"); nothing for Omega or a rung Alpha climbs. */
export function omegaSaid(r: Rung, clone: Clone): string | null {
  const over = beyondAlpha(r);
  if (!over.length || clone === 'omega') return null;
  const uses = over.filter((n) => alphaCapOf(n.skill) > 0).map((n) => `uses ${n.name} to ${ROMAN[alphaCapOf(n.skill)]}`);
  const cant = over.filter((n) => alphaCapOf(n.skill) === 0).map((n) => n.name);
  const said = [...uses, ...(cant.length ? [`can’t use ${listed(cant, 'or')}`] : [])].join(', and ');
  return clone === 'alpha' ? `Needs Omega: Alpha ${said}.` : `Clone state not read: an Alpha ${said}.`;
}

/** One skill row's words for an Alpha, in place of its training time (SkillNeeds' `beyond`): null where an Alpha can use the level, or the clone isn't Alpha. */
export function needBeyond(clone: Clone, skill: number, level: number): string | null {
  if (clone !== 'alpha') return null;
  const cap = alphaCapOf(skill);
  if (level <= cap) return null;
  return cap ? `Alpha uses ${ROMAN[cap]}: Omega opens ${ROMAN[level]}` : 'Alpha can’t use it: Omega opens it';
}

/** Every need up to and including a rung, at the highest level any asks. */
export function cumulative(key: RungKey): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of RUNGS) {
    for (const n of r.needs) out[n.skill] = Math.max(out[n.skill] ?? 0, n.level);
    if (r.key === key) break;
  }
  return out;
}

/** A character's usable levels raised to what the rung (and every rung before it) asks: what it could do on that rung. */
function onRung(key: RungKey, skills: Record<number, number>, clone: Clone): Record<number, number> {
  const out = { ...usable(skills, clone) };
  for (const [id, l] of Object.entries(cumulative(key))) out[Number(id)] = Math.max(out[Number(id)] ?? 0, l);
  return out;
}

const can = (act: BpActivity | 0 | undefined, s: Record<number, number>) => !!act && lacking(act[2], s).length === 0;

/**
 * How many blueprints a rung opens, from the bundle's skill lists against the character's usable levels raised to the
 * rung's: Tech I originals the finder ranks that it can build (rung 1), research (2) and copy (4); Tech II items whose Tech I
 * it can invent from (6); capital hulls it can build (7). None for More slots and Build at home: a count of slots, and a place.
 */
export function rungCount(ix: Indexed, key: RungKey, skills: Record<number, number>, clone: Clone): { n: number; of: number } | null {
  const s = onRung(key, skills, clone);
  const t1 = () => finderBlueprints(ix);
  if (key === 'npc') { const all = t1(); return { n: all.filter((bp) => can(bp[2], s)).length, of: all.length }; }
  if (key === 'research') { const all = t1(); return { n: all.filter((bp) => can(bp[4], s)).length, of: all.length }; }
  if (key === 'copy') { const all = t1(); return { n: all.filter((bp) => can(bp[3], s)).length, of: all.length }; }
  if (key === 't2') {
    const all = [...ix.t2];
    return { n: all.filter((t2) => { const from = ix.inventedFrom.get(t2); const bp = from != null ? ix.bp.get(from) : undefined; return !!bp && can(bp[6], s); }).length, of: all.length };
  }
  if (key === 'capital') {
    const all = ix.b.bps.filter((bp) => { const p = productOf(bp); return !!p && productKind(ix, p.type) === 'capital'; });
    return { n: all.filter((bp) => can(bp[2], s)).length, of: all.length };
  }
  return null;
}

export type RungState = 'done' | 'here' | 'next' | 'ahead';
export type RungView = { rung: Rung; met: boolean | null; state: RungState };
/**
 * Where the character stands. A rung is met when its needs are all within the usable levels (Build at home: when a
 * structure is among the sites added). "Here" is the last of an unbroken run of met rungs from the first, "next" the one
 * after it; a rung met past a gap stays "ahead" (its words still say the skills cover it). Skills not read: nothing is
 * judged.
 */
export function ladderOf(o: { skills: Record<number, number> | null; clone: Clone; structureSite: boolean }): { rungs: RungView[]; here: number | null } {
  if (!o.skills) return { rungs: RUNGS.map((rung) => ({ rung, met: null, state: 'ahead' })), here: null };
  const s = usable(o.skills, o.clone);
  const met = RUNGS.map((r) => (r.key === 'home' ? o.structureSite : r.needs.every((n) => (s[n.skill] ?? 0) >= n.level)));
  let here: number | null = null;
  for (let i = 0; i < met.length && met[i]; i++) here = i;
  const next = here == null ? 0 : here + 1;
  return { rungs: RUNGS.map((rung, i) => ({ rung, met: met[i], state: here != null && i < here ? 'done' : i === here ? 'here' : i === next ? 'next' : 'ahead' })), here };
}

/** The finder's priced rows a rung opens (manufacturing skills within the usable levels raised to the rung's), best profit a day first, losing ones too. */
export function rowsOpened(ix: Indexed, rows: readonly Row[], key: RungKey, skills: Record<number, number>, clone: Clone): Row[] {
  const s = onRung(key, skills, clone);
  return rows.filter((r) => r.day && can(ix.bp.get(r.bp)?.[2] ?? 0, s)).sort((a, b) => b.day!.profit - a.day!.profit);
}

/** The rows that make a profit, of those. */
export const paying = (rows: readonly Row[]): Row[] => rows.filter((r) => r.day && r.day.profit > 0);

/**
 * Research's worth on the rows rung 2 opens: the ten best at the finder's ME and TE (losing ones too: research is what
 * can turn one), each priced again at ME 0 / TE 0 and at ME 10 / TE 20, best at ME 10 first. What one slot makes a day
 * either way; a row that still loses at ME 10 is left out.
 */
export function researchedRows(input: Omit<RowInput, 'bp'>, opened: readonly Row[], n = 3): { row: Row; at0: number | null; at10: number }[] {
  const out: { row: Row; at0: number | null; at10: number }[] = [];
  for (const row of opened.slice(0, 10)) {
    const bp = input.ix.bp.get(row.bp);
    if (!bp) continue;
    const at10 = buildRow({ ...input, bp, me: 10, te: 20 }).day?.profit;
    if (at10 == null || !(at10 > 0)) continue;
    out.push({ row, at0: buildRow({ ...input, bp, me: 0, te: 0 }).day?.profit ?? null, at10 });
  }
  return out.sort((a, b) => b.at10 - a.at10).slice(0, n);
}

/** One item a slot: what the best `slots` paying rows make a day together, and how many there were to fill them. */
export function slotsPay(opened: readonly Row[], slots: number): { profit: number; items: number } {
  const top = paying(opened).slice(0, slots);
  return { profit: top.reduce((a, r) => a + r.day!.profit, 0), items: top.length };
}

/**
 * What a figure summed over these rows leaves out, as phrases for "before …": the facility tax or the hub's broker fee when
 * not typed, the Alpha tax when the clone state isn't read (Row.costKnown, carried finding P1). Empty when whole.
 */
export function beforeSaid(rows: readonly Row[], hubName?: string | null): string[] {
  const out: string[] = [];
  if (rows.some((r) => r.taxPerPct != null)) out.push('the facility tax');
  if (rows.some((r) => r.brokerPerPct != null)) out.push(`the broker fee${hubName ? ` at ${hubName}` : ''}`);
  if (rows.some((r) => r.costKnown === false && r.taxPerPct == null)) out.push('the Alpha tax');
  return out;
}
