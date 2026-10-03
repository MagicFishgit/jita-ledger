/**
 * The Research tab's getting-started rules (stage 1 of docs/superpowers/specs/2026-10-03-rd-agents-design.md): which
 * fields there are and what each asks, the skills a pick still lacks and how long they take, each corporation's reach at
 * a character's standings (step 2), what step 3 lists, the pick it starts from, and a field's year of prices. The shared
 * rules (points a day, access, the ranking) are research.ts; the research behind both is
 * `.playwright-mcp/research/rd-agents/draft.md`. Pure: no config, store, React or DOM, so `npm run check` loads it.
 */
import { ACCESS, CORP_BELOW_FACTION, DATACORE_OF, effectiveStanding, openLevel, rpPerDay, type HelperAgent, type RankedAgent, type RdAgent, type StandingRow } from './research';
import { spForLevel, trainingDays, type Attributes, type SkillDogma } from './training';
import type { HistRow } from './types';

const DAY_MS = 86_400_000;

/** The skills research asks for, by type ID (CCP's static data, build 3569502). */
export const SKILL = {
  science: 3402, mechanics: 3392, cpu: 3426, powerGrid: 3413, labOp: 3406, research: 3403, rpm: 12179,
  negotiation: 3356, connections: 3359, diplomacy: 3357, social: 3355,
} as const;

/**
 * Each field that makes a datacore (DATACORE_OF's keys): its name, and the one prerequisite it asks for besides Science V
 * (static data, dogma 182/277): Mechanics V for the four starship engineerings, Mechanical, Molecular and Rocket Science;
 * CPU Management V for Electromagnetic Physics, Electronic and Nanite Engineering; Power Grid Management V for the rest.
 */
export const FIELDS: Record<number, { name: string; needs: number }> = {
  11433: { name: 'High Energy Physics', needs: SKILL.powerGrid },
  11441: { name: 'Plasma Physics', needs: SKILL.powerGrid },
  11442: { name: 'Nanite Engineering', needs: SKILL.cpu },
  11443: { name: 'Hydromagnetic Physics', needs: SKILL.powerGrid },
  11444: { name: 'Amarr Starship Engineering', needs: SKILL.mechanics },
  11445: { name: 'Minmatar Starship Engineering', needs: SKILL.mechanics },
  11446: { name: 'Graviton Physics', needs: SKILL.powerGrid },
  11447: { name: 'Laser Physics', needs: SKILL.powerGrid },
  11448: { name: 'Electromagnetic Physics', needs: SKILL.cpu },
  11449: { name: 'Rocket Science', needs: SKILL.mechanics },
  11450: { name: 'Gallente Starship Engineering', needs: SKILL.mechanics },
  11451: { name: 'Nuclear Physics', needs: SKILL.powerGrid },
  11452: { name: 'Mechanical Engineering', needs: SKILL.mechanics },
  11453: { name: 'Electronic Engineering', needs: SKILL.cpu },
  11454: { name: 'Caldari Starship Engineering', needs: SKILL.mechanics },
  11455: { name: 'Quantum Physics', needs: SKILL.powerGrid },
  11529: { name: 'Molecular Engineering', needs: SKILL.mechanics },
};

/** A field's datacore by name: "Datacore - " and the field, but CCP's Amarr and Gallente ones are Amarrian and Gallentean. */
export function datacoreName(field: number): string {
  const n = FIELDS[field]?.name;
  if (!n) return `Datacore #${DATACORE_OF[field] ?? field}`;
  return `Datacore - ${n.replace(/^Amarr /, 'Amarrian ').replace(/^Gallente /, 'Gallentean ')}`;
}

/** Names for the skills here that aren't fields, so the tab names them without asking ESI. */
export const SKILL_NAMES: Record<number, string> = {
  [SKILL.science]: 'Science', [SKILL.mechanics]: 'Mechanics', [SKILL.cpu]: 'CPU Management', [SKILL.powerGrid]: 'Power Grid Management',
  [SKILL.labOp]: 'Laboratory Operation', [SKILL.research]: 'Research', [SKILL.rpm]: 'Research Project Management',
  [SKILL.negotiation]: 'Negotiation', [SKILL.connections]: 'Connections', [SKILL.diplomacy]: 'Diplomacy', [SKILL.social]: 'Social',
  ...Object.fromEntries(Object.entries(FIELDS).map(([id, f]) => [id, f.name])),
};

/** A skill's training figures and prerequisites, from the static data (so a training time needs no ESI read). */
type Dogma = SkillDogma & { req: [number, number][] };
const INT = 165, MEM = 166, CHA = 164;
const DOGMA: Record<number, Dogma> = {
  [SKILL.science]: { rank: 1, primary: INT, secondary: MEM, req: [] },
  [SKILL.mechanics]: { rank: 1, primary: INT, secondary: MEM, req: [] },
  [SKILL.cpu]: { rank: 1, primary: INT, secondary: MEM, req: [] },
  [SKILL.powerGrid]: { rank: 1, primary: INT, secondary: MEM, req: [] },
  [SKILL.labOp]: { rank: 1, primary: INT, secondary: MEM, req: [[SKILL.science, 3]] },
  [SKILL.research]: { rank: 1, primary: INT, secondary: MEM, req: [[SKILL.science, 3]] },
  [SKILL.rpm]: { rank: 8, primary: MEM, secondary: CHA, req: [[SKILL.labOp, 5], [SKILL.research, 5]] },
  [SKILL.social]: { rank: 1, primary: CHA, secondary: INT, req: [] },
  [SKILL.negotiation]: { rank: 2, primary: CHA, secondary: INT, req: [[SKILL.social, 1]] },
  [SKILL.connections]: { rank: 3, primary: CHA, secondary: INT, req: [[SKILL.social, 3]] },
  [SKILL.diplomacy]: { rank: 1, primary: CHA, secondary: INT, req: [[SKILL.social, 2]] },
  ...Object.fromEntries(Object.entries(FIELDS).map(([id, f]) => [id, { rank: 5, primary: INT, secondary: MEM, req: [[SKILL.science, 5], [f.needs, 5]] } satisfies Dogma])),
};

/**
 * What a character lacks to start research in a field at an agent of a level: Science V, the field's prerequisite at V,
 * and the field at the agent's level (taken as the agent's own level: EVE University's example; a 2023 player report
 * disagrees). Null when its skills haven't been read: lacking nothing and not known are different answers.
 */
export function skillGaps(field: number, level: number, skills: Record<number, number> | undefined): { id: number; level: number }[] | null {
  if (!skills) return null;
  const f = FIELDS[field];
  const want: [number, number][] = [[SKILL.science, 5], ...(f ? [[f.needs, 5] as [number, number]] : []), [field, level]];
  return want.filter(([id, l]) => (skills[id] ?? 0) < l).map(([id, l]) => ({ id, level: l }));
}

export type PlanLevel = { id: number; from: number; to: number; days: number };

/**
 * How long the targets take to train at the character's attributes, each skill's prerequisites first (each skill once, to
 * the highest level anything asks of it), from the points already in each skill (its level's floor when none are read).
 * Null when the attributes or skills aren't read, or a skill here has no figures: never "0 days" for not known.
 */
export function trainingPlan(targets: { id: number; level: number }[], o: {
  skills: Record<number, number> | undefined; sp: Record<number, number> | undefined; attrs: Attributes | undefined; alpha: boolean;
}): { days: number; levels: PlanLevel[] } | null {
  const skills = o.skills ?? {};
  const want = new Map<number, number>();
  let unknown = false;
  const add = (id: number, level: number) => {
    const dg = DOGMA[id];
    if (!dg) { unknown = true; return; }
    for (const [r, l] of dg.req) add(r, l);
    if ((skills[id] ?? 0) < level && (want.get(id) ?? 0) < level) want.set(id, level);
  };
  for (const t of targets) add(t.id, t.level);
  if (!want.size && !unknown) return { days: 0, levels: [] };
  if (unknown || !o.attrs || !o.skills) return null;
  const levels: PlanLevel[] = [];
  for (const [id, to] of want) {
    const dg = DOGMA[id], from = skills[id] ?? 0;
    const have = Math.max(o.sp?.[id] ?? 0, spForLevel(dg.rank, from));
    levels.push({ id, from, to, days: trainingDays(dg, o.attrs, have, to, o.alpha) });
  }
  return { days: levels.reduce((n, x) => n + x.days, 0), levels };
}

/**
 * An ordinary agent (security or distribution: running its missions is how standing with its corporation rises) takes
 * the agent's, its corporation's or its faction's effective standing, whichever is highest, no standing counting as 0;
 * a corporation at −2 or under shuts all its agents but level 1 (EVE University, *NPC standings*). Only R&D agents add
 * the "corporation no more than 2 below" rule (research.ts `agentAccess`).
 */
export function helperAccess(level: number, corp: number | null, faction: number | null, agent: number | null): boolean {
  const need = ACCESS[Math.min(4, Math.max(1, Math.round(level))) as 1 | 2 | 3 | 4];
  if (level > 1 && (corp ?? 0) <= -2) return false;
  return Math.max(corp ?? 0, faction ?? 0, agent ?? 0) >= need;
}

/** One corporation with R&D agents, at a character's standings: step 2's row. */
export type CorpReach = {
  corp: number; faction: number;
  /** Raw as ESI gives them, and effective (Connections, or Diplomacy for a negative one); null is no standing. */
  corpRaw: number | null; factionRaw: number | null; corpEff: number | null; factionEff: number | null;
  /** The highest R&D level open now (0: none). */
  open: 0 | 1 | 2 | 3 | 4;
  /** The next level and what opens it: the corporation at `corp`, or the faction at `viaFaction.faction` with the corporation at `viaFaction.corp`. */
  next: { level: 1 | 2 | 3 | 4; corp: number; viaFaction: { faction: number; corp: number } } | null;
  /** Its R&D agents by level. */
  byLevel: Record<1 | 2 | 3 | 4, number>;
  /** High-sec jumps from Jita to its nearest R&D agent; null when none is on a high-sec route. */
  nearest: number | null;
  /** Its security and distribution agents this character can use now, best level first, then nearest. */
  helpers: (HelperAgent & { jumps: number | null })[];
};

const standingIn = (rows: StandingRow[] | null, type: StandingRow['type'], id: number) =>
  rows?.find((r) => r.type === type && r.id === id)?.standing ?? null;

/**
 * Step 2: every corporation with R&D agents at a character's standings (null: not read, worked out as no standing, which
 * the caller says), ordered by its faction's effective standing, then by how near its nearest R&D agent is.
 */
export function corpReach(agents: RdAgent[], helpers: HelperAgent[], o: {
  standings: StandingRow[] | null; connections: number; diplomacy: number; jumpsTo: (system: number) => number | null;
}): CorpReach[] {
  const eff = (raw: number | null) => effectiveStanding(raw, o.connections, o.diplomacy);
  const byCorp = new Map<number, RdAgent[]>();
  for (const a of agents) byCorp.set(a.corp, [...(byCorp.get(a.corp) ?? []), a]);
  const out: CorpReach[] = [];
  for (const [corp, list] of byCorp) {
    const faction = list[0].faction;
    const corpRaw = standingIn(o.standings, 'npc_corp', corp), factionRaw = standingIn(o.standings, 'faction', faction);
    const corpEff = eff(corpRaw), factionEff = eff(factionRaw);
    const open = openLevel(corpEff, factionEff);
    const nextLevel = open < 4 ? ((open + 1) as 1 | 2 | 3 | 4) : null;
    const byLevel: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const a of list) byLevel[a.level]++;
    const jumps = list.map((a) => o.jumpsTo(a.system)).filter((j): j is number => j != null);
    const usable = helpers.filter((h) => h.corp === corp && helperAccess(h.level, corpEff, factionEff, eff(standingIn(o.standings, 'agent', h.id))))
      .map((h) => ({ ...h, jumps: o.jumpsTo(h.system) }))
      .sort((a, b) => b.level - a.level || (a.jumps ?? Infinity) - (b.jumps ?? Infinity) || a.id - b.id);
    out.push({
      corp, faction, corpRaw, factionRaw, corpEff, factionEff, open,
      next: nextLevel ? { level: nextLevel, corp: ACCESS[nextLevel], viaFaction: { faction: ACCESS[nextLevel], corp: ACCESS[nextLevel] - CORP_BELOW_FACTION } } : null,
      byLevel, nearest: jumps.length ? Math.min(...jumps) : null, helpers: usable,
    });
  }
  return out.sort((a, b) => (b.factionEff ?? 0) - (a.factionEff ?? 0) || (a.nearest ?? Infinity) - (b.nearest ?? Infinity) || a.corp - b.corp);
}

/** The highest R&D level open at any corporation: what step 2 offers as the start. */
export const startLevel = (corps: CorpReach[]): 0 | 1 | 2 | 3 | 4 => corps.reduce<0 | 1 | 2 | 3 | 4>((m, c) => (c.open > m ? c.open : m), 0);

/**
 * Step 3's agents: those open now and those one level past what their corporation opens ("nearly can": one more step of
 * standing), in the ranking's order. Further than that is a different plan, and would bury the table.
 */
export function listedAgents(ranked: RankedAgent[], corps: CorpReach[]): RankedAgent[] {
  const open = new Map(corps.map((c) => [c.corp, c.open]));
  return ranked.filter((r) => r.open || r.agent.level <= (open.get(r.agent.corp) ?? 0) + 1).sort(byPayThenNear);
}

/**
 * Open before closed, priced before unpriced, more ISK a day, more RP a day, then the nearer (one off a high-sec route
 * last); else as ranked (the sort is stable). rankAgents breaks ties by agent ID, which put a 37-jump agent above an
 * 8-jump one paying the same.
 */
export function byPayThenNear(a: RankedAgent, b: RankedAgent): number {
  return Number(b.open) - Number(a.open) || Number(b.iskDay != null) - Number(a.iskDay != null) || (b.iskDay ?? 0) - (a.iskDay ?? 0)
    || b.rpDay - a.rpDay || (a.jumps ?? Infinity) - (b.jumps ?? Infinity);
}

/**
 * The pick the walkthrough starts from: the best-ranked agent and field the character can reach, its standings opening
 * the agent (skills are trained on the way, so they don't gate it), one on a high-sec route from Jita first (an agent
 * off it only when nothing else is open). Best is ISK a day (priced before unpriced), then RP a day, then the nearer;
 * else the ranking's own order. Null when nothing is open.
 */
export function pickDefault(ranked: RankedAgent[]): RankedAgent | null {
  const open = ranked.filter((r) => r.open);
  const onRoute = open.filter((r) => r.jumps != null);
  return [...(onRoute.length ? onRoute : open)].sort(byPayThenNear)[0] ?? null;
}

/** How many agents Research Project Management V lets one character run: one, and one more a level. */
/**
 * What a level of Connections adds to an agent's points a day (step 1's Connections line), through the character's own
 * standing with that agent: the formula's standing term, lifted by 4% of its gap to 10 a level. Null with no standing
 * with the agent (no standing stays none, whatever the skills, so there's nothing to say: the spec); 0 for a negative
 * one, which Diplomacy lifts instead. `level` is the Connections level reached, against the one before it.
 */
export function connectionsRp(o: { agentRaw: number | null; level: number; diplomacy: number; field: number; agentLevel: number; negotiation: number }): number | null {
  if (o.agentRaw == null) return null;
  const at = (l: number) => rpPerDay({ field: o.field, agentLevel: o.agentLevel, negotiation: o.negotiation, agentStanding: effectiveStanding(o.agentRaw, l, o.diplomacy) });
  return at(o.level) - at(o.level - 1);
}

export const MAX_AGENTS = 6;

/**
 * The six agents a character would run: the best-paying distinct agents open to it on a high-sec route from Jita, each in
 * its best-paying field (whether two may research one field isn't confirmed; the walkthrough says so), in the ranking's
 * order. Only priced ones count, so the caller says "Pricing…" until every datacore's book is read: a sum taken before
 * would read as what six agents make. Fewer than six when fewer are open.
 */
export function bestAgents(ranked: RankedAgent[], n = MAX_AGENTS): RankedAgent[] {
  const seen = new Set<number>();
  const out: RankedAgent[] = [];
  for (const r of ranked) {
    if (!r.open || r.jumps == null || r.iskDay == null || seen.has(r.agent.id)) continue;
    seen.add(r.agent.id);
    out.push(r);
    if (out.length === n) break;
  }
  return out;
}

/**
 * What the "six agents, a month" tile says: "Pricing…" while any datacore's book is still read; unpriced when any of them
 * couldn't be read (that field may be the best-paying, so a sum without it would read as complete and be short); else
 * the best agents (`bestAgents`) and thirty days of them at today's bids.
 */
export type SixAgents = { state: 'pricing' } | { state: 'unpriced'; failed: number } | { state: 'ok'; agents: RankedAgent[]; month: number };
export function sixAgents(ranked: RankedAgent[], o: { pricing: boolean; failed: number }): SixAgents {
  if (o.pricing) return { state: 'pricing' };
  if (o.failed > 0) return { state: 'unpriced', failed: o.failed };
  const agents = bestAgents(ranked);
  return { state: 'ok', agents, month: agents.reduce((n, r) => n + (r.iskDay ?? 0), 0) * 30 };
}

/** A field's datacore over the year, from The Forge's daily history: now (the last 30 days), a year ago, units a day, and each month. */
export type FieldYear = {
  /** The last 30 days' volume-weighted average price; null with no trading in them. */
  price: number | null;
  /** The same over 335–395 days back, a year ago; null with none then. */
  yearAgo: number | null;
  /** price ÷ yearAgo − 1. */
  change: number | null;
  /** Units traded a day over the last 30 calendar days (a day ESI omits traded nothing). */
  perDay: number | null;
  /** Each 30-day stretch of the last year with trading, oldest first: its volume-weighted price. */
  months: { to: string; price: number }[];
};

export function fieldYear(rows: HistRow[], now: number): FieldYear {
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const vw = (xs: HistRow[]) => {
    const v = xs.reduce((n, r) => n + r.volume, 0);
    return v > 0 ? xs.reduce((n, r) => n + r.average * r.volume, 0) / v : null;
  };
  const within = (from: number, to: number) => { const a = iso(now - from * DAY_MS), b = iso(now - to * DAY_MS); return rows.filter((r) => r.date >= a && r.date < b); };
  const last = rows.filter((r) => r.date >= iso(now - 30 * DAY_MS));
  const price = vw(last), yearAgo = vw(within(395, 335));
  const months: FieldYear['months'] = [];
  for (let i = 11; i >= 0; i--) {
    const p = vw(within((i + 1) * 30, i * 30));
    if (p != null) months.push({ to: iso(now - i * 30 * DAY_MS), price: p });
  }
  return {
    price, yearAgo, change: price != null && yearAgo != null && yearAgo > 0 ? price / yearAgo - 1 : null,
    perDay: rows.length ? last.reduce((n, r) => n + r.volume, 0) / 30 : null, months,
  };
}
