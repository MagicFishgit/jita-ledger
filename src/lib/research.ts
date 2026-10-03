/**
 * Research (R&D) agents: points a day, who can use which agent, and what the datacores fetch. The user, 2 October 2026:
 * research agents "generate research points over time and this is great to just have going passively and forget about and
 * cache in later". Every rule here is from the research of 2 October 2026 (`.playwright-mcp/research/rd-agents/draft.md`,
 * with each figure's source); the spec is `docs/superpowers/specs/2026-10-03-rd-agents-design.md`.
 *
 * - Points a day: (1 + (20 + 5 × Negotiation + agent standing) / 100) × (field skill + agent level)², EVE University's
 *   *Datacore farming* and *Research missions*, checked against three characters by a player (forum 419534, September
 *   2023). The 20 is what's left of agent quality (Incursion 1.5, May 2011: every agent "+20 in terms of payout"). The
 *   agent standing is the *effective* standing with the agent itself, not its corporation or faction.
 * - A datacore costs RP_PER_DATACORE points and DATACORE_FEE ISK, bought from the agent in person. 100 is CCP's 2012 dev
 *   blog, the static data (attribute 1155's default) and EVE University; CCP's support page (edited 2024) says 50, 100 or
 *   150 by field. Assumed 100 until a real purchase is seen.
 * - Points now: CCP's formula in ESI's spec, remainder + points a day × days since the start.
 * Pure: no config, store, React or DOM (the Worker may import it, and `npm run check` loads it through type stripping).
 */
import { walkBids, type PriceVolume } from './relist';

const DAY_MS = 86_400_000;

/** The formula's 20: what's left of agent quality (Incursion 1.5, May 2011: every agent "+20 in terms of payout"). */
export const QUALITY_BONUS = 20;
/** Research points a datacore costs: assumed (CCP 2012; CCP's support page says 50–150 by field). */
export const RP_PER_DATACORE = 100;
/** ISK the agent charges for each datacore on top of the points (CCP 2012, CCP support 2024, EVE University). */
export const DATACORE_FEE = 10_000;
/**
 * Effective standing an R&D agent of each level asks for, with its corporation; or with its faction, the corporation
 * then no more than CORP_BELOW_FACTION under it. EVE University, *Research missions*: "Either corporation standing of the
 * required agent level (L1: -2.00, L2: 1.00, L3: 3.00, L4: 5.00) or faction standing of the required level and
 * corporation standing of no more than 2 below the required level" (the rule "to prevent players from grinding up faction
 * standings to start research with all of that faction's agents"). Other agents take faction standing alone.
 */
export const ACCESS: Record<1 | 2 | 3 | 4, number> = { 1: -2, 2: 1, 3: 3, 4: 5 };
export const CORP_BELOW_FACTION = 2;
/** ESI's points a day and the formula's are said to differ past 2 RP or 2% (the client keeps the old rate until the
 *  agent is reopened, forum 419534, 2023). */
export const RATE_TOLERANCE = { rp: 2, share: 0.02 };

/** Field skill type ID → its datacore's type ID: the 17 that make one (dogma 182 on the datacore). Read from CCP's static
 *  data, build 3569502 (2 October 2026), by `scripts/research-agents.mjs`, which keeps only these fields: Astronautic
 *  Engineering and Hypernet Science, which some agents list, make no datacore. Names don't map one to one ("Amarr Starship
 *  Engineering" makes "Datacore - Amarrian Starship Engineering"). */
export const DATACORE_OF: Record<number, number> = {
  11433: 20411, // High Energy Physics
  11441: 20412, // Plasma Physics
  11442: 20416, // Nanite Engineering
  11443: 20171, // Hydromagnetic Physics
  11444: 20421, // Amarr Starship Engineering → Datacore - Amarrian Starship Engineering
  11445: 20172, // Minmatar Starship Engineering
  11446: 20419, // Graviton Physics
  11447: 20413, // Laser Physics
  11448: 20417, // Electromagnetic Physics
  11449: 20420, // Rocket Science
  11450: 20410, // Gallente Starship Engineering → Datacore - Gallentean Starship Engineering
  11451: 20423, // Nuclear Physics
  11452: 20424, // Mechanical Engineering
  11453: 20418, // Electronic Engineering
  11454: 25887, // Caldari Starship Engineering
  11455: 20414, // Quantum Physics
  11529: 20415, // Molecular Engineering
};

/** One standing as ESI's `/characters/{id}/standings/` gives it: raw, signs kept, `type` from its `from_type`. */
export type StandingRow = { id: number; type: 'agent' | 'npc_corp' | 'faction'; standing: number };
/** ESI's `/characters/{id}/standings/` row. */
export type RawStanding = { from_id: number; from_type: string; standing: number };

const STANDING_TYPES: ReadonlySet<string> = new Set<StandingRow['type']>(['agent', 'npc_corp', 'faction']);

/**
 * Every standing ESI gives, kept whole (`meta.standings.list`, the main's from the browser's sync, an alt's from the
 * cloud's sheet): sorted by ID, then type, each row built in one key order, so the same answer is the same string
 * whatever order ESI sent it in. The cloud pushes an alt's meta doc only when its string changes, so an order that moved
 * would push a revision every hour. Signs are kept, and a standing at 0 is kept: it exists (Connections lifts it), where a
 * missing entry is no standing at all. A type ESI's spec doesn't name (none today) or a standing that isn't a number is
 * left out rather than guessed at.
 */
export function toStandings(raw: RawStanding[]): StandingRow[] {
  return raw
    .filter((x) => STANDING_TYPES.has(x.from_type) && typeof x.standing === 'number' && Number.isFinite(x.standing) && Number.isFinite(x.from_id))
    .map((x) => ({ id: x.from_id, type: x.from_type as StandingRow['type'], standing: x.standing }))
    .sort((a, b) => a.id - b.id || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
}
/** One agent's research as ESI's `/characters/{id}/agents_research/` gives it. */
export type ResearchRow = { agentId: number; skillTypeId: number; startedAt: string; pointsPerDay: number; remainderPoints: number };
/**
 * ESI's `/characters/{id}/agents_research/` row, as its OpenAPI spec gives it (compatibility date 2026-08-18, read 2
 * October 2026; the route needs the permission, so it couldn't be probed): every field required.
 */
export type RawResearch = { agent_id: number; skill_type_id: number; started_at: string; points_per_day: number; remainder_points: number };

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * Every agent researching for the character (`meta.research.agents`: the main's from the browser's sync, an alt's from
 * the cloud's sheet), in the app's names, sorted by agent (then field), each row built in one key order, so the same
 * answer is the same string whatever order ESI sent it in: the cloud pushes an alt's meta doc only when its string
 * changes. The start is kept as ESI wrote it, and the remainder with its sign: what a purchase does to it hasn't been seen
 * (it may go below zero). A row with no readable start or a figure that isn't a number is left out rather than guessed at.
 * An empty answer is an empty list: read, with no agent running.
 */
export function toResearch(raw: RawResearch[]): ResearchRow[] {
  return raw
    .filter((x) => finite(x.agent_id) && finite(x.skill_type_id) && finite(x.points_per_day) && finite(x.remainder_points)
      && typeof x.started_at === 'string' && Number.isFinite(Date.parse(x.started_at)))
    .map((x) => ({ agentId: x.agent_id, skillTypeId: x.skill_type_id, startedAt: x.started_at, pointsPerDay: x.points_per_day, remainderPoints: x.remainder_points }))
    .sort((a, b) => a.agentId - b.agentId || a.skillTypeId - b.skillTypeId);
}

/** EVE's notification that an R&D agent offers a research mission (static data's notification type 70). */
export const MISSION_NOTICE = 'ResearchMissionAvailableMsg';

/**
 * When EVE last offered a research mission: the newest `ResearchMissionAvailableMsg`'s timestamp, as ESI wrote it, or
 * null when none is in the read. Only the time is kept: what the notification's text carries hasn't been seen.
 */
export function researchMissionAt(notes: { type: string; timestamp: string }[]): string | null {
  let best: string | null = null, bestT = -Infinity;
  for (const n of notes) {
    if (n.type !== MISSION_NOTICE) continue;
    const t = Date.parse(n.timestamp);
    if (Number.isFinite(t) && t > bestT) { best = n.timestamp; bestT = t; }
  }
  return best;
}
/** A research agent from the bundle (`src/data/researchAgents.json`); `fields` are skill type IDs in DATACORE_OF. */
export type RdAgent = { id: number; name: string; level: 1 | 2 | 3 | 4; corp: number; faction: number; station: number; system: number; fields: number[] };
/** A security or distribution agent of a corporation with research agents: the way to raise standing with it. */
export type HelperAgent = { id: number; name: string; level: number; corp: number; division: 'security' | 'distribution'; station: number; system: number };

/** Research points a day (EVE University's formula, above). No standing with the agent adds nothing. */
export function rpPerDay(o: { field: number; agentLevel: number; negotiation: number; agentStanding: number | null }): number {
  const base = o.field + o.agentLevel;
  return (1 + (QUALITY_BONUS + 5 * o.negotiation + (o.agentStanding ?? 0)) / 100) * base * base;
}

/**
 * Effective standing: null (no standing) stays null; friendly raw + (10 − raw) × 4% × Connections; negative likewise with
 * Diplomacy. EVE University, *NPC standings*: Connections is "4% standings increase, per level, for non-criminal NPC
 * entities that you have positive or 0 standings with", Diplomacy the same "with NPC entities you have negative standings
 * with", and "Skills do not apply to no standing" (until a first change, which can never be undone). The corporations
 * with research agents are none of them criminal, so Criminal Connections never applies.
 */
export function effectiveStanding(raw: number | null, connections: number, diplomacy: number): number | null {
  if (raw == null) return null;
  const skill = raw >= 0 ? connections : diplomacy;
  return raw + (10 - raw) * 0.04 * skill;
}

/** Can a character use an R&D agent of this level, given its effective corporation and faction standing (null = none)?
 *  No standing counts as 0 here (EVE University's level 2 case: a faction at 1.00 with the corporation above −1.00). */
export function agentAccess(level: 1 | 2 | 3 | 4, corp: number | null, faction: number | null): boolean {
  const need = ACCESS[level], c = corp ?? 0, f = faction ?? 0;
  return c >= need || (f >= need && c >= need - CORP_BELOW_FACTION);
}

/** The highest R&D level open at these standings, or 0. */
export function openLevel(corp: number | null, faction: number | null): 0 | 1 | 2 | 3 | 4 {
  for (const level of [4, 3, 2, 1] as const) if (agentAccess(level, corp, faction)) return level;
  return 0;
}

/** CCP's formula: remainder + per day × days since start. */
export function rpNow(row: ResearchRow, at: number): number {
  return row.remainderPoints + row.pointsPerDay * (at - Date.parse(row.startedAt)) / DAY_MS;
}

/** Whole datacores at the cost (none under none: a remainder may go below zero after a purchase, unseen). */
export function datacoresFor(rp: number, cost = RP_PER_DATACORE): number {
  return Math.max(0, Math.floor(rp / cost));
}

/**
 * What `units` datacores fetch walked down Jita's bids after sales tax, less the fee each; null without bids. Only bids
 * that pay more than the fee after tax take any (a book's escrow bait at 0.02 ISK would otherwise read as −10,000 a
 * datacore), and what they can't take is valued at nothing: `total` covers the `units` the bids take, `perUnit` is their
 * average. With none held, `perUnit` is what one would fetch at the top bid. Null when no bid covers the fee.
 */
export function datacoreValue(bids: { price: number; volume: number }[] | null, units: number, salesTax: number): { total: number; perUnit: number; units: number } | null {
  const paying: PriceVolume[] = (bids ?? []).filter((b) => b.volume > 0 && b.price * (1 - salesTax) > DATACORE_FEE);
  if (!paying.length) return null;
  if (units <= 0) return { total: 0, perUnit: Math.max(...paying.map((b) => b.price)) * (1 - salesTax) - DATACORE_FEE, units: 0 };
  const walked = walkBids(units, paying, salesTax);
  const total = walked.value - walked.sold * DATACORE_FEE;
  return { total, perUnit: total / walked.sold, units: walked.sold };
}

/** Agents a character can use or nearly can, each with RP a day there and ISK a day at the field's net per datacore, best first. */
export type RankedAgent = { agent: RdAgent; field: number; datacore: number; open: boolean; rpDay: number; iskDay: number | null; jumps: number | null };

const standingOf = (rows: StandingRow[] | null, type: StandingRow['type'], id: number) =>
  rows?.find((r) => r.type === type && r.id === id)?.standing ?? null;

/**
 * Every (agent, field) pair: `open` from its corporation's and faction's effective standing; RP a day at the character's
 * skills (the field at least the agent's level, else what it would be once trained to it); ISK a day at the field's net
 * per datacore (null while unpriced); best ISK a day first, open ones before closed.
 *
 * - `skills`: trained levels by skill type ID. The field level an agent asks for is taken as its own level (EVE
 *   University's example; a 2023 player report disagrees), so a field under it counts at it.
 * - `standings`: raw, as ESI gives them; null when not read yet, which is worked out as no standing at all (only level 1
 *   opens). The caller says "Not read yet", never "no standing".
 * - `netPerDatacore`: keyed by the **datacore's** type ID (DATACORE_OF's values): what one fetches after sales tax and the
 *   fee (`datacoreValue(…).perUnit`), null or missing while unpriced.
 * - Ties fall to RP a day, then the agent's ID, then the field's, so the order can't jitter between renders.
 */
export function rankAgents(agents: RdAgent[], o: { skills: Record<number, number>; standings: StandingRow[] | null;
  connections: number; diplomacy: number; negotiation: number; netPerDatacore: Record<number, number | null>;
  jumpsTo: (system: number) => number | null }): RankedAgent[] {
  const eff = (raw: number | null) => effectiveStanding(raw, o.connections, o.diplomacy);
  const out: RankedAgent[] = [];
  for (const agent of agents) {
    const open = agentAccess(agent.level, eff(standingOf(o.standings, 'npc_corp', agent.corp)), eff(standingOf(o.standings, 'faction', agent.faction)));
    const agentStanding = eff(standingOf(o.standings, 'agent', agent.id));
    const jumps = o.jumpsTo(agent.system);
    for (const field of agent.fields) {
      const datacore = DATACORE_OF[field];
      if (datacore == null) continue;
      const rpDay = rpPerDay({ field: Math.max(o.skills[field] ?? 0, agent.level), agentLevel: agent.level, negotiation: o.negotiation, agentStanding });
      const net = o.netPerDatacore[datacore];
      out.push({ agent, field, datacore, open, rpDay, iskDay: net == null ? null : rpDay / RP_PER_DATACORE * net, jumps });
    }
  }
  return out.sort((a, b) => Number(b.open) - Number(a.open)
    || (a.iskDay == null ? 1 : 0) - (b.iskDay == null ? 1 : 0) || (b.iskDay ?? 0) - (a.iskDay ?? 0)
    || b.rpDay - a.rpDay || a.agent.id - b.agent.id || a.field - b.field);
}
