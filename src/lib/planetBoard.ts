/**
 * The planet board (docs/notes/planets-board.md): how a setup's planets are laid out as cards, the goods that travel between them, and
 * each planet's "Build it" list, in the order you'd place it in game. Pure: it reads a setup the planner worked out and changes nothing
 * of it (piPlan.ts is untouched by the board).
 */
import type { PlanetType } from './pi';
import type { Facility, PiIndex } from './piBundle';
import { fitOf, type Layout } from './piFit';
import type { Role, Setup } from './piPlan';

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
  layout: 'flow' | 'row';
  factory: Role | null;
  groups: { charId: number | null; roles: Role[] }[];
  /** What each feeder ships to the factory planet a day, by the feeder's role. */
  edges: Map<Role, { id: number; perDay: number }[]>;
};

export function boardOf(s: Pick<Setup, 'kind' | 'roles'>): Board {
  const used = s.roles.filter((r) => r.does !== 'unused');
  const factory = (s.kind === 'feed' || s.kind === 'chain') ? used.find((r) => r.does === 'factory') ?? null : null;
  if (!factory) return { layout: 'row', factory: null, groups: [{ charId: null, roles: used }], edges: new Map() };
  const feeders = used.filter((r) => r !== factory);
  const edges = new Map(feeders.map((r) => [r, r.ships.filter((x) => x.to === factory.planetId).map((x) => ({ id: x.id, perDay: x.perDay }))] as const));
  if (s.kind !== 'chain') return { layout: 'flow', factory, groups: [{ charId: null, roles: feeders }], edges };
  const order = [...new Set(feeders.map((r) => r.charId))];
  return { layout: 'flow', factory, groups: order.map((charId) => ({ charId, roles: feeders.filter((r) => r.charId === charId) })), edges };
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

/** One step of "Build it": a stable `id` (a tick is kept by it) and its words. */
export type BuildStep = { id: string; text: string };

/**
 * A planet's build list, in the order you'd place it in game: the command centre at the level the layout needs, each extractor with its
 * heads on its P0, each factory on its schematic, the launchpad (Plan counts one and no storage), then the routes, from the ground up:
 * each P0 to its Basics, what they make to the launchpad, the launchpad to the factories of the next tier, and what those make back to it.
 */
export function buildSteps(role: Role, ix: PiIndex, need: { level: number | null; checked: boolean }, programHours: number | null): BuildStep[] {
  const name = (id: number) => ix.byId.get(id)?.name ?? `#${id}`;
  const tier = (id: number) => TIERS.indexOf(ix.byId.get(id)?.tier ?? 'P0');
  const steps: BuildStep[] = [];
  steps.push({ id: 'cc', text: !need.checked ? 'Command centre: this planet’s size isn’t known, so the level its layout needs isn’t worked out'
    : need.level == null ? 'Command centre: no Command Center Upgrades level holds this layout on this planet'
      : need.level === 0 ? 'Command centre: no upgrade needed' : `Command centre, upgraded to level ${ROMAN[need.level]} (Command Center Upgrades ${ROMAN[need.level]})` });
  const programme = programHours != null && programHours > 0 ? (programHours % 24 === 0 ? `, a ${programHours / 24}-day programme` : `, a ${+programHours.toFixed(1)}-hour programme`) : '';
  const basics = role.makes.filter((m) => m.facility === 'basic');
  role.extracts.forEach((e, i) => {
    steps.push({ id: `ecu:${e.p0}:${i}`, text: `Extractor control unit on ${name(e.p0)}, ${e.heads != null ? `${e.heads} head${e.heads === 1 ? '' : 's'}` : 'as many heads as fit'}${programme}` });
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
    steps.push({ id: `route:out:${m.id}`, text: `Route ${name(m.id)} from ${m.count === 1 ? 'its factory' : `its ${m.count} factories`} to the launchpad` });
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
