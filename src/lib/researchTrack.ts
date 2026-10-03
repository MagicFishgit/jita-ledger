/**
 * Tracking R&D agents that run (stage 2 of docs/superpowers/specs/2026-10-03-rd-agents-design.md): a card per agent from
 * the research read, the totals across characters, what the datacores fetch listed rather than sold into bids, and where
 * a field's price sits in its year (for "when to cash in"). The mechanic's own rules are research.ts; the getting-started
 * ones researchStart.ts. Pure: no config, store, React or DOM, so `npm run check` loads it (To do and the Wallet read it
 * too).
 *
 * Nothing not known reads as zero: a rate the formula can't work out (skills or standings not read, an agent the bundle
 * doesn't hold) is null, never a match; datacores with no bid to sell into are null, never 0 ISK.
 */
import { DATACORE_FEE, DATACORE_OF, RATE_TOLERANCE, RP_PER_DATACORE, datacoreValue, datacoresFor, effectiveStanding, rpNow, rpPerDay, type RdAgent, type ResearchRow, type StandingRow } from './research';
import { SKILL } from './researchStart';
import type { HistRow } from './types';

const DAY_MS = 86_400_000;

/** One running agent, as its card says it. */
export type AgentCard = {
  agentId: number;
  /** The field's skill type ID, as the read gives it. */
  field: number;
  /** The field's datacore; null for a field that makes none (the bundle drops those, but a read could name one). */
  datacore: number | null;
  /** ESI's points a day: what accrues now. */
  rpDay: number;
  /**
   * What it should be at the character's skills and standing with the agent (EVE University's formula, `rpPerDay`); null
   * when the skills or standings aren't read, or the agent isn't in the bundle (its level unknown).
   */
  rpDayShould: number | null;
  /**
   * The two differ past RATE_TOLERANCE: more than 2 RP, or more than 2% of what it should be, either one. The client keeps
   * the old rate until the agent is reopened (forum 419534, 2023), so a skill or standing gained since reads lower.
   */
  differs: boolean;
  /** Points held now: CCP's formula, the remainder plus points a day since the start. */
  rpNow: number;
  /** Whole datacores the points buy at RP_PER_DATACORE (assumed). */
  datacores: number;
  /**
   * Those datacores walked down the bids given after sales tax, less the fee each (`datacoreValue`): `units` is how many
   * the bids take. Null without a bid paying over the fee; a known nothing with no whole datacore yet.
   */
  worth: { total: number; units: number } | null;
  /** ISK a day at ESI's rate: RP a day ÷ RP_PER_DATACORE × one datacore at the top bid after tax and the fee; null unpriced. */
  iskDay: number | null;
  /** Until the next whole datacore at ESI's rate; null while the rate is 0. */
  nextInMs: number | null;
};

/**
 * A running agent's card. `agent` is the bundle's (null when it doesn't hold it); `skills` the character's trained levels
 * (undefined: not read); `standings` raw, as ESI gives them (null: not read; none for the agent is no standing); `bids`
 * the field's datacore's Jita bids, the character's own taken out (null: not read, or couldn't be); `salesTax` the
 * character's own rate.
 */
export function agentCard(row: ResearchRow, agent: RdAgent | null, skills: Record<number, number> | undefined, standings: StandingRow[] | null,
  bids: { price: number; volume: number }[] | null, salesTax: number, now: number): AgentCard {
  const datacore = DATACORE_OF[row.skillTypeId] ?? null;
  let rpDayShould: number | null = null;
  if (agent && skills && standings) {
    const raw = standings.find((s) => s.type === 'agent' && s.id === row.agentId)?.standing ?? null;
    rpDayShould = rpPerDay({
      field: skills[row.skillTypeId] ?? 0, agentLevel: agent.level, negotiation: skills[SKILL.negotiation] ?? 0,
      agentStanding: effectiveStanding(raw, skills[SKILL.connections] ?? 0, skills[SKILL.diplomacy] ?? 0),
    });
  }
  const gap = rpDayShould == null ? 0 : Math.abs(row.pointsPerDay - rpDayShould);
  const differs = rpDayShould != null && (gap > RATE_TOLERANCE.rp || gap > RATE_TOLERANCE.share * rpDayShould);
  const held = rpNow(row, now);
  const datacores = datacoresFor(held);
  const walked = datacore == null ? null : datacores === 0 ? { total: 0, units: 0 } : datacoreValue(bids, datacores, salesTax);
  const top = datacore == null ? null : datacoreValue(bids, 0, salesTax)?.perUnit ?? null;
  return {
    agentId: row.agentId, field: row.skillTypeId, datacore, rpDay: row.pointsPerDay, rpDayShould, differs, rpNow: held, datacores,
    worth: walked && { total: walked.total, units: walked.units },
    iskDay: top == null ? null : row.pointsPerDay / RP_PER_DATACORE * top,
    nextInMs: row.pointsPerDay > 0 ? ((datacores + 1) * RP_PER_DATACORE - held) / row.pointsPerDay * DAY_MS : null,
  };
}

/** One character's cards, and whether its research was read at all (a card can only come from a read). */
export type CharCards = { charId: number; isMain: boolean; read: boolean; cards: AgentCard[] };

export type ResearchTotals = {
  agents: number; rpDay: number; datacores: number;
  /** What every waiting datacore fetches; null when any card with datacores waiting couldn't be valued (never a part-sum), or no agent counts. */
  worth: number | null;
  /** Cards with datacores waiting and no worth. */
  unpriced: number;
  /** Thirty days at ESI's rates and today's top bids; null when any card's ISK a day is unknown, or no agent counts. */
  iskMonth: number | null;
  monthUnpriced: number;
  mainRead: boolean;
  /** Alts whose research was read, of every alt. */
  alts: { read: number; of: number };
};

/**
 * The totals across characters: only those whose research was read count (an alt the cloud hasn't read yet, or whose
 * login lacks the permission, adds nothing, and the count says how many alts did). A sum with a part unpriced is no sum:
 * the Six agents tile's lesson (research.md), where a book that couldn't be read may be the biggest part.
 */
export function researchTotals(chars: CharCards[]): ResearchTotals {
  const counted = chars.filter((c) => c.read).flatMap((c) => c.cards);
  const unpriced = counted.filter((x) => x.datacores > 0 && x.worth == null).length;
  const monthUnpriced = counted.filter((x) => x.iskDay == null).length;
  const alts = chars.filter((c) => !c.isMain);
  return {
    agents: counted.length,
    rpDay: counted.reduce((n, x) => n + x.rpDay, 0),
    datacores: counted.reduce((n, x) => n + x.datacores, 0),
    worth: !counted.length || unpriced ? null : counted.reduce((n, x) => n + (x.worth?.total ?? 0), 0),
    unpriced,
    iskMonth: !counted.length || monthUnpriced ? null : counted.reduce((n, x) => n + (x.iskDay ?? 0), 0) * 30,
    monthUnpriced,
    mainRead: chars.some((c) => c.isMain && c.read),
    alts: { read: alts.filter((c) => c.read).length, of: alts.length },
  };
}

/**
 * What `units` datacores fetch listed rather than sold into bids: at `listAt` (fills.ts' `listingPrice`, as every listing
 * the app prices), after sales tax, the broker fee (its 100 ISK minimum, as fees.ts) and the agent's fee each. Null with
 * none held, no price to list at, or a price that doesn't cover the fees. A listing waits for a buyer; the bids pay now.
 */
export function listedWorth(units: number, listAt: number | null, salesTax: number, brokerFee: number): { total: number; perUnit: number } | null {
  if (!(units > 0) || listAt == null || !(listAt > 0)) return null;
  const rev = units * listAt;
  const total = rev * (1 - salesTax) - Math.max(100, rev * brokerFee) - units * DATACORE_FEE;
  return total > 0 ? { total, perUnit: total / units } : null;
}

/**
 * Where a field's price sits in its year, for "when to cash in": the latest day's average against every day of the last
 * 365 that traded (The Forge's history), like with like rather than a bid against averages. `above` is the share of those
 * days (the latest among them) priced under it. Null under 30 days traded in the year, or with nothing traded in the last
 * 30: too little to place it.
 */
export function yearPercentile(rows: HistRow[], now: number): { price: number; date: string; above: number; days: number } | null {
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const from = iso(now - 365 * DAY_MS);
  const year = rows.filter((r) => r.date >= from && r.volume > 0 && Number.isFinite(r.average)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const latest = year[year.length - 1];
  if (!latest || latest.date < iso(now - 30 * DAY_MS) || year.length < 30) return null;
  return { price: latest.average, date: latest.date, above: year.filter((r) => r.average < latest.average).length / year.length, days: year.length };
}
