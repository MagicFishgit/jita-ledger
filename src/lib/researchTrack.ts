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
import { withoutOwn } from './prospects';
import { SKILL } from './researchStart';
import type { BookLevel, HistRow } from './types';

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
  /**
   * Points held now: CCP's formula, the remainder plus points a day since the start. Null when the read's start can't be
   * read (`toResearch` leaves such rows out, but a stored copy could carry one): not known, never NaN.
   */
  rpNow: number | null;
  /** Whole datacores the points buy at RP_PER_DATACORE (assumed); null when the points aren't known. */
  datacores: number | null;
  /**
   * What the datacores fetch now (`sale`): sold into the bids where one pays over the fee, the units the bids don't take
   * valued listed. `units` is how many that covers. A known nothing with no whole datacore yet; null when nothing prices
   * any, or the points aren't known.
   */
  worth: { total: number; units: number } | null;
  /** How they sell, said on the card; null with no whole datacore, no datacore for the field, or the points not known. */
  sale: Sale | null;
  /** ISK a day at ESI's rate: RP a day ÷ RP_PER_DATACORE × one datacore at the top bid after tax and the fee; null unpriced. */
  iskDay: number | null;
  /** Until the next whole datacore at ESI's rate; null while the rate is 0. */
  nextInMs: number | null;
};

/** Why a listing can't price datacores: nothing listed to set a price against, or a price that doesn't cover the fees. */
export type ListWhy = 'noAsk' | 'noCover';

/**
 * How a running agent's datacores sell, like with like (the review of 3 October 2026 caught "Listed" under "Worth now"
 * beside a tip calling listing more: it priced every datacore at one ask, against bids walked for the units they take).
 * - `bids`: what Jita's bids take now, after tax and the fee each; null when no bid pays over the fee.
 * - `rest`: the units the bids don't take (all of them with no bid), valued listed; `total` null with `why` when a
 *   listing can't price them. Null when the bids take them all.
 * - `listed`: every one of them listed instead, to set against the bids.
 * - `listPays`: there are bids, and listing every one pays more than the worth (bids plus the rest listed).
 */
export type Sale = {
  bids: { total: number; units: number } | null;
  rest: { units: number; total: number | null; why: ListWhy | null } | null;
  listed: { total: number | null; why: ListWhy | null };
  listPays: boolean;
};

/**
 * A running agent's card. `agent` is the bundle's (null when it doesn't hold it); `skills` the character's trained levels
 * (undefined: not read); `standings` raw, as ESI gives them (null: not read; none for the agent is no standing); `bids`
 * the field's datacore's Jita bids with every character's own taken out (`othersSide`; null: not read, or couldn't be);
 * `salesTax` the character's own rate; `list` where a listing would sell (fills.ts' `listingPrice` on others' listings,
 * null with none) and the character's broker fee. Anything else that values datacores (To do, the Wallet) passes the
 * same, so its worth is the card's.
 */
export function agentCard(row: ResearchRow, agent: RdAgent | null, skills: Record<number, number> | undefined, standings: StandingRow[] | null,
  bids: { price: number; volume: number }[] | null, salesTax: number, now: number, list: { at: number | null; brokerFee: number }): AgentCard {
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
  const started = Number.isFinite(Date.parse(row.startedAt));
  const held = started ? rpNow(row, now) : null;
  const datacores = held == null ? null : datacoresFor(held);
  const top = datacore == null ? null : datacoreValue(bids, 0, salesTax)?.perUnit ?? null;
  const sale = datacore == null || datacores == null || datacores === 0 ? null : saleOf(datacores, bids, salesTax, list);
  const worth = datacores === 0 && datacore != null ? { total: 0, units: 0 } : sale ? worthOf(sale) : null;
  return {
    agentId: row.agentId, field: row.skillTypeId, datacore, rpDay: row.pointsPerDay, rpDayShould, differs, rpNow: held, datacores, worth,
    sale: sale && { ...sale, listPays: !!sale.bids && sale.listed.total != null && worth != null && sale.listed.total > worth.total },
    iskDay: top == null ? null : row.pointsPerDay / RP_PER_DATACORE * top,
    nextInMs: held != null && datacores != null && row.pointsPerDay > 0 ? ((datacores + 1) * RP_PER_DATACORE - held) / row.pointsPerDay * DAY_MS : null,
  };
}

/** How `units` datacores sell (Sale, `listPays` set by the card once the worth is known). */
function saleOf(units: number, bids: { price: number; volume: number }[] | null, salesTax: number, list: { at: number | null; brokerFee: number }): Sale {
  const listing = (n: number): { total: number | null; why: ListWhy | null } => {
    if (list.at == null || !(list.at > 0)) return { total: null, why: 'noAsk' };
    const v = listedWorth(n, list.at, salesTax, list.brokerFee);
    return v ? { total: v.total, why: null } : { total: null, why: 'noCover' };
  };
  const b = datacoreValue(bids, units, salesTax);
  const taken = b?.units ?? 0;
  return {
    bids: b && { total: b.total, units: b.units },
    rest: taken < units ? { units: units - taken, ...listing(units - taken) } : null,
    listed: listing(units),
    listPays: false,
  };
}

/** The worth a sale comes to: the bids' part and the rest listed, where each is priced; null when neither is. */
function worthOf(s: Sale): { total: number; units: number } | null {
  const rest = s.rest?.total != null ? { total: s.rest.total, units: s.rest.units } : null;
  if (!s.bids && !rest) return null;
  return { total: (s.bids?.total ?? 0) + (rest?.total ?? 0), units: (s.bids?.units ?? 0) + (rest?.units ?? 0) };
}

/** An open order of one of your characters in Jita 4-4, as the Research tab weighs a book. */
export type OwnOrder = { typeId: number; isBuy: boolean; price: number; volume: number };

/**
 * One side of a datacore's Jita book without any of your characters' open orders on it: selling one character's
 * datacores into its own bid, or another character's, is trading with yourself, no sale (market-reading.md: "Sell to
 * bids" walks others' bids only). Every figure that values datacores (the cards, To do's cash-in, the Wallet) passes its
 * bids through this before `agentCard`, so they agree.
 */
export function othersSide(levels: BookLevel[], own: OwnOrder[], typeId: number, buy: boolean): BookLevel[] {
  return withoutOwn(levels, own.filter((o) => o.typeId === typeId && o.isBuy === buy).map((o) => ({ price: o.price, volume: o.volume })));
}

/** One character's cards, and whether its research was read at all (a card can only come from a read). */
export type CharCards = { charId: number; isMain: boolean; read: boolean; cards: AgentCard[] };

export type ResearchTotals = {
  agents: number; rpDay: number;
  /** Whole datacores waiting; null when any card's points aren't known (never a part-sum). */
  datacores: number | null;
  /** What every waiting datacore fetches; null when any card with datacores waiting couldn't be valued, or whose points aren't known (never a part-sum), or no agent counts. */
  worth: number | null;
  /** Cards with datacores waiting and no worth. */
  unpriced: number;
  /** Cards whose points held aren't known (a start that can't be read). */
  unknown: number;
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
  const unknown = counted.filter((x) => x.datacores == null).length;
  const unpriced = counted.filter((x) => x.datacores != null && x.datacores > 0 && x.worth == null).length;
  const monthUnpriced = counted.filter((x) => x.iskDay == null).length;
  const alts = chars.filter((c) => !c.isMain);
  return {
    agents: counted.length,
    rpDay: counted.reduce((n, x) => n + x.rpDay, 0),
    datacores: unknown ? null : counted.reduce((n, x) => n + (x.datacores ?? 0), 0),
    worth: !counted.length || unpriced || unknown ? null : counted.reduce((n, x) => n + (x.worth?.total ?? 0), 0),
    unpriced, unknown,
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
