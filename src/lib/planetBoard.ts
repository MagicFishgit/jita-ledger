/**
 * The planet board (docs/notes/planets-board.md): how a setup's planets are laid out as cards, the goods that travel between them, and
 * each planet's "Build it" list, in the order you'd place it in game. Pure: it reads a setup the planner worked out and changes nothing
 * of it (piPlan.ts is untouched by the board).
 */
import type { PlanetType } from './pi';
import type { Facility, PiIndex } from './piBundle';
import { fitOf, maxFactories, maxHeads, type Layout } from './piFit';
import type { Role, Setup } from './piPlan';
import { dayCount } from './split';
import { units } from './format';

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const TIERS = ['P0', 'P1', 'P2', 'P3', 'P4'];
export const FACILITY_NAME: Record<Facility, [string, string]> = {
  basic: ['Basic Industry Facility', 'Basic Industry Facilities'],
  advanced: ['Advanced Industry Facility', 'Advanced Industry Facilities'],
  hightech: ['High-Tech Production Plant', 'High-Tech Production Plants'],
};
export const FACILITY_SHORT: Record<Facility, string> = { basic: 'Basic', advanced: 'Advanced', hightech: 'High-Tech' };
const listSaid = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * A setup as a board. `flow`: planets feeding a factory planet (a feed, a chain), drawn feeders on the left, the factory on the right,
 * a line from each feeder labelled with what it ships to the factory a day; `row`: every planet on its own (P0 → P1, P0 → P2, a factory
 * on bought inputs), cards in a row with no lines. A chain's feeders are grouped by character, in the order the setup names them.
 */
export type Board = {
  /** `team`: a factory character's, its feeders grouped by character (each group folded to one line on the page), its factory planets stacked. */
  layout: 'flow' | 'row' | 'team';
  factory: Role | null;
  /** Every factory planet (a factory character's several; a feed's or chain's one). */
  factories: Role[];
  /** `sends`: what the group's planets send the factory planets a day, by good, the most first (a team's). */
  groups: { charId: number | null; roles: Role[]; sends: { id: number; perDay: number }[] }[];
  /** What each feeder ships to the factory planet a day, by the feeder's role. */
  edges: Map<Role, { id: number; perDay: number }[]>;
};

export function boardOf(s: Pick<Setup, 'kind' | 'roles'> & { team?: Setup['team'] }): Board {
  const used = s.roles.filter((r) => r.does !== 'unused');
  if (s.kind === 'team') {
    const factories = used.filter((r) => r.does === 'factory');
    const feeders = used.filter((r) => r.does !== 'factory');
    const ids = new Set(factories.map((r) => r.planetId));
    // The factory character first, then the others as the setup names them; a group of each character's planets, factory planets apart.
    const order = [...new Set([...(s.team?.parts.map((p) => p.charId) ?? []), ...feeders.map((r) => r.charId)])];
    const groups = order.map((charId) => {
      const roles = feeders.filter((r) => r.charId === charId);
      const by = new Map<number, number>();
      for (const r of roles) for (const x of r.ships) if (typeof x.to === 'number' && ids.has(x.to)) by.set(x.id, (by.get(x.id) ?? 0) + x.perDay);
      return { charId, roles, sends: [...by].map(([id, perDay]) => ({ id, perDay })).sort((a, b) => b.perDay - a.perDay || a.id - b.id) };
    }).filter((g) => g.roles.length);
    const edges = new Map(feeders.map((r) => [r, r.ships.filter((x) => typeof x.to === 'number' && ids.has(x.to)).map((x) => ({ id: x.id, perDay: x.perDay }))] as const));
    return { layout: 'team', factory: factories[0] ?? null, factories, groups, edges };
  }
  const factory = (s.kind === 'feed' || s.kind === 'chain') ? used.find((r) => r.does === 'factory') ?? null : null;
  if (!factory) return { layout: 'row', factory: null, factories: [], groups: [{ charId: null, roles: used, sends: [] }], edges: new Map() };
  const feeders = used.filter((r) => r !== factory);
  const edges = new Map(feeders.map((r) => [r, r.ships.filter((x) => x.to === factory.planetId).map((x) => ({ id: x.id, perDay: x.perDay }))] as const));
  if (s.kind !== 'chain') return { layout: 'flow', factory, factories: [factory], groups: [{ charId: null, roles: feeders, sends: [] }], edges };
  const order = [...new Set(feeders.map((r) => r.charId))];
  return { layout: 'flow', factory, factories: [factory], groups: order.map((charId) => ({ charId, roles: feeders.filter((r) => r.charId === charId), sends: [] })), edges };
}

/** The planet's layout as Plan fits it: its extractors and heads, its factories, one launchpad and no storage (Plan's own reserve). */
export function layoutOfRole(role: Role): Layout {
  const count = (f: Facility) => role.makes.filter((m) => m.facility === f).reduce((n, m) => n + m.count, 0);
  return {
    ecus: role.extracts.length, heads: role.extracts.reduce((n, e) => n + Math.max(1, e.heads ?? 1), 0),
    basic: count('basic'), advanced: count('advanced'), hightech: count('hightech'), storage: 0, launchpads: 1,
  };
}

/**
 * The Command Center Upgrades level the layout needs: the lowest at which it fits on the planet's own size. `checked` false when the size
 * isn't known (nothing worked out), `level` null when no level holds it.
 */
export function levelNeeded(role: Role, ix: PiIndex, t: PlanetType | null, radiusKm: number | null): { level: number | null; checked: boolean } {
  if (!t || radiusKm == null || !(radiusKm > 0)) return { level: null, checked: false };
  const l = layoutOfRole(role);
  for (let lv = 0; lv < ix.planetTypes[t].cc.length; lv++) if (fitOf(ix, t, lv, l, radiusKm).fits) return { level: lv, checked: true };
  return { level: null, checked: true };
}

/**
 * Heads to reach the Basics' need, on one extraction line (the user, 25 October 2026: "the extra level will help me install more heads so i
 * can be sure to hit the 18k average extraction needed to run the 3 basic factories"). Only where the line's rate is short of what its
 * Basics take. A rate is never scaled by heads, so this is what more heads would need, not what they'd give: the most heads that fit for
 * this line at the character's level beside the planet's factories (`maxHeads`, its own radius, the other lines at their heads), the yield
 * a head needed at that many, and the yield a head its rate was learned at. Null where the line isn't short, has no rate, or nothing fits.
 */
export type HeadsNeed = { basics: number; take: number; heads: number; perHead: number; learnedPerHead: number | null; learnedHeads: number | null };
export function headsNeeded(role: Role, i: number, ix: PiIndex, t: PlanetType | null, cc: number | null, radiusKm: number | null): HeadsNeed | null {
  const e = role.extracts[i];
  if (!e) return null;
  // Its Basics: the ones on the P1 this line's P0 makes (each P0 makes one P1, and a planet runs one line a P0).
  const b = role.makes.find((m) => m.facility === 'basic' && !!ix.makes.get(m.id)?.inputs.some((x) => x.id === e.p0));
  if (!b || !e.rate || !(b.count > 0) || !t || cc == null || radiusKm == null || !(radiusKm > 0)) return null;
  const sch = ix.makes.get(b.id)!;
  const inp = sch.inputs.find((x) => x.id === e.p0)!;
  const take = b.count * (inp.qty * 3600) / sch.cycleSeconds;
  if (!(e.perHour < take - 1e-6)) return null;
  const l = layoutOfRole(role);
  const room = maxHeads(ix, t, cc, { ecus: l.ecus, basic: l.basic, advanced: l.advanced, hightech: l.hightech, storage: l.storage, launchpads: l.launchpads }, radiusKm);
  const others = role.extracts.reduce((n, x, j) => n + (j === i ? 0 : Math.max(1, x.heads ?? 1)), 0);
  const heads = Math.min(ix.maxHeads, room - others);
  if (!(heads >= 1)) return null;
  const lh = e.rate.heads > 0 ? e.rate.heads : null;
  return { basics: b.count, take, heads, perHead: take / heads, learnedPerHead: lh ? e.rate.perHour / lh : null, learnedHeads: lh };
}
/** "3 Basics take 18,000 an hour: at 7 heads that's 2,572 a head; this line was learned at 2,300 a head (5 heads)". */
export const headsNeedSaid = (h: HeadsNeed): string =>
  `${h.basics} Basic${h.basics === 1 ? ' takes' : 's take'} ${units(h.take)} an hour: at ${h.heads} head${h.heads === 1 ? '' : 's'} that’s ${units(h.perHead)} a head${h.learnedPerHead != null ? `; this line was learned at ${units(h.learnedPerHead)} a head (${+h.learnedHeads!.toFixed(1)} head${h.learnedHeads === 1 ? '' : 's'})` : ''}`;

/**
 * A factory planet's factories as the user builds them (Ruling F27; their own four, 27 October 2026: "6 Oxides, 6 Biocells, 6
 * Superconductors, 3 Gel-Matrix Biopaste: 21 of the 22 Advanced it holds"): each kind's count, the P2s first, then what they come to of
 * the Advanced the planet holds at the character's level beside one launchpad (`known`, else worked out; left out when its size or the
 * level isn't known). Null for a planet that isn't a factory planet of Advanced alone.
 */
export function factoryCounts(role: Role, ix: PiIndex, at: { t: PlanetType | null; cc: number | null; radiusKm: number | null } | null, known?: number): string | null {
  if (role.does !== 'factory') return null;
  const tier = (id: number) => TIERS.indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const ms = role.makes.filter((m) => m.count > 0).map((m, i) => ({ m, i })).sort((a, b) => tier(a.m.id) - tier(b.m.id) || a.i - b.i).map((x) => x.m);
  if (!ms.length || ms.some((m) => m.facility !== 'advanced')) return null;
  const n = ms.reduce((t, m) => t + m.count, 0);
  const holds = known ?? (at?.t && at.cc != null && at.radiusKm != null && at.radiusKm > 0 ? maxFactories(ix, at.t, at.cc, 'advanced', 1, at.radiusKm) : null);
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  return `${ms.map((m) => `${m.count} ${name(m.id)}`).join(', ')}${holds != null && holds > 0 ? `: ${n} of the ${holds} Advanced it holds` : `: ${n} Advanced`}`;
}

/** One step of "Build it": a stable `id` (a tick is kept by it) and its words. */
export type BuildStep = { id: string; text: string };

/**
 * A planet's build list, in the order you'd place it in game: the command centre at the level the layout needs, each extractor with its
 * heads on its P0, each factory on its schematic, the launchpad (Plan counts one and no storage), then the routes, from the ground up:
 * each P0 to its Basics, what they make to the launchpad, the launchpad to the factories of the next tier, and what those make back to it.
 */
export function buildSteps(role: Role, ix: PiIndex, need: { level: number | null; checked: boolean }, programHours: number | null,
  at: { t: PlanetType | null; cc: number | null; radiusKm: number | null } | null = null): BuildStep[] {
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  const tier = (id: number) => TIERS.indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const steps: BuildStep[] = [];
  steps.push({ id: 'cc', text: !need.checked ? 'Command centre: this planet’s size isn’t known, so the level its layout needs isn’t worked out'
    : need.level == null ? 'Command centre: no Command Center Upgrades level holds this layout on this planet'
      : need.level === 0 ? 'Command centre: no upgrade needed' : `Command centre, upgraded to level ${ROMAN[need.level]} (Command Center Upgrades ${ROMAN[need.level]})` });
  const programme = programHours != null && programHours > 0 ? (programHours % 24 === 0 ? `, a ${programHours / 24}-day programme` : `, a ${+programHours.toFixed(1)}-hour programme`) : '';
  const basics = role.makes.filter((m) => m.facility === 'basic');
  role.extracts.forEach((e, i) => {
    // A line short of what its Basics take: what more heads would need (never a promise: heads overlap and the planet depletes).
    const h = at ? headsNeeded(role, i, ix, at.t, at.cc, at.radiusKm) : null;
    steps.push({ id: `ecu:${e.p0}:${i}`, text: `Extractor control unit on ${name(e.p0)}, ${e.heads != null ? `${e.heads} head${e.heads === 1 ? '' : 's'}` : 'as many heads as fit'}${programme}${h ? ` (${headsNeedSaid(h)}: more heads overlap, and the yield a head falls, so it isn’t a promise)` : ''}` });
  });
  const facs = [...role.makes].filter((m) => m.count > 0).sort((a, b) => tier(a.id) - tier(b.id) || a.id - b.id);
  for (const m of facs) steps.push({ id: `fac:${m.facility}:${m.id}`, text: `${m.count} ${FACILITY_NAME[m.facility][m.count === 1 ? 0 : 1]} on ${name(m.id)}` });
  steps.push({ id: 'pad', text: role.does === 'factory'
    ? '1 Launchpad: what’s brought in lands here, and what the factories make collects here to leave'
    : '1 Launchpad: what the planet makes collects here to leave (Plan counts one, and no storage)' });
  // The routes: each P0 to its own Basics, then each tier's goods through the launchpad.
  role.extracts.forEach((e, i) => {
    const b = basics[i];
    steps.push({ id: `route:p0:${e.p0}:${i}`, text: b && b.count > 0 ? `Route ${name(e.p0)} from its extractor to its ${b.count === 1 ? 'Basic' : `${b.count} Basics`}` : `Route ${name(e.p0)} from its extractor to the launchpad` });
  });
  for (const m of facs) {
    const sch = ix.makes.get(m.id);
    const ins = (sch?.inputs ?? []).map((x) => x.id).filter((x) => tier(x) > 0);
    // A Basic's P0 comes straight from its extractor (above); anything else is drawn from the launchpad.
    if (m.facility !== 'basic' && ins.length) steps.push({ id: `route:in:${m.id}`, text: `Route ${listSaid(ins.map(name))} from the launchpad to ${m.count === 1 ? `the ${FACILITY_SHORT[m.facility]}` : `each of its ${m.count} ${FACILITY_SHORT[m.facility]}`} on ${name(m.id)}` });
    // A feeder making a P2 beside its P1 (a factory character's) ships both: said, so the P2's route isn't taken for a by-product.
    const beside = role.does === 'extract' && m.facility === 'advanced' ? role.ships.filter((x) => x.id === m.id && typeof x.to === 'number').reduce((n, x) => n + x.perDay, 0) : 0;
    const asWell = beside > 0 && role.ships.some((x) => typeof x.to === 'number' && x.id !== m.id) ? `: it ships ${dayCount(beside)} a day of it as well as its P1` : '';
    steps.push({ id: `route:out:${m.id}`, text: `Route ${name(m.id)} from ${m.count === 1 ? 'its factory' : `its ${m.count} factories`} to the launchpad${asWell}` });
  }
  return steps;
}

/** What a planet's build list rests on (its P0s and heads, its factories): a tick kept under another is cleared when it changes. */
export const roleSig = (role: Role): string =>
  `${role.does}|${role.extracts.map((e) => `${e.p0}h${e.heads ?? '?'}`).join('+')}|${role.makes.map((m) => `${m.id}x${m.count}`).sort().join(',')}`;

/**
 * A card's key, for Build it's ticks and for whether its check was asked for: the system, the good planned (or "all"), the setup's kind
 * (a kept plan is a kind of its own, `kept-feed`), the planet and the character. The kind is in it so ticking a planet's card in one setup
 * never ticks, or opens a check on, the same planet's card in another (Important 2 of the review).
 */
export const cardKey = (systemId: number, good: number | null, kind: string, planetId: number, charId: number): string =>
  `${systemId}:${good ?? 'all'}:${kind}:${planetId}:${charId}`;

/** Build it's ticks as this browser keeps them: by card, the layout they were ticked under (`roleSig`), the steps ticked and when. */
export type Ticks = Record<string, { sig: string; done: string[]; at: number }>;
/** The newest cards kept: a browser planning many systems and goods doesn't grow them without end. */
export const TICKS_KEPT = 300;
/** The steps ticked on a card under its layout now; none when what's held was ticked under another. */
export const ticksDone = (t: Ticks, key: string, sig: string): string[] => (t[key] && t[key].sig === sig ? t[key].done : []);
/**
 * The ticks without a card's entry kept under another layout: deleted, not ignored, so switching the plan back to that layout brings none
 * back (Minor 6 of the review). The same object when nothing goes.
 */
export function dropStale(t: Ticks, key: string, sig: string): Ticks {
  if (!t[key] || t[key].sig === sig) return t;
  const out = { ...t };
  delete out[key];
  return out;
}
/** The ticks after a step is ticked or unticked on a card: under its layout now, the newest `TICKS_KEPT` cards kept. */
export function ticked(t: Ticks, key: string, sig: string, id: string, on: boolean, now: number): Ticks {
  const cur = new Set(ticksDone(t, key, sig));
  if (on) cur.add(id); else cur.delete(id);
  const next: Ticks = { ...dropStale(t, key, sig), [key]: { sig, done: [...cur], at: now } };
  return Object.fromEntries(Object.entries(next).sort((a, b) => b[1].at - a[1].at).slice(0, TICKS_KEPT));
}
