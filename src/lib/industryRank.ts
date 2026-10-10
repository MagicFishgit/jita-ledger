import { listingPrice, reachedBid, recentRange } from './fills';
import { median, paceDay, withoutOwn } from './prospects';
import { buyerShare, EVEN_SPLIT, tradingSplit, type BookSold, type SplitFrom } from './split';
import type { BookLevel, HistRow, ProspectStats } from './types';
import {
  copyCost, copyTime, DAY_S, eivOf, inventionChance, inventionCost, inventionTime, jobTime, lacking, manufacturingCost, manufacturingSkills,
  materialsFor, productOf, researchCost, researchTime, rigFor, runsPerDay, SKILL, structureBonus, type BpActivity, type BundleBp,
  type Clone, type Indexed, type IndustryIndex, type JobCost, type SecBand, type SiteKind,
} from './industry';

/**
 * The Industry finder's rules (docs/notes/industry.md): where each material comes from, what a product fetches where you'd
 * sell it, what freight costs, what one factory slot earns a day, and what each blueprint row comes to. Pure: no config,
 * store, React or DOM, so check.mjs loads it. Every figure not known stays null and says why; nothing is ever priced at 0
 * for not known.
 */

/** A site within this many high-sec jumps of Jita can carry to and from it, and sell ships there. */
export const NEAR_JITA_JUMPS = 10;
/** The home hub's market must move this many times a week's need before a material is bought there (the research's rule). */
export const HOME_DEPTH = 10;
/** The industry share by default: the part of each market's daily trade you'd sell, in percent (the research's figure for modules). */
export const DEFAULT_SHARE = 10;
/** Rows re-read on live Jita books after the first ranking on the morning's scan (the Loyalty pattern). */
export const LIVE_ROWS = 40;
/** Capital hulls sell on contracts, not the market: the finder leaves them out. Titans and supercarriers sit outside the static data's capital filter. */
const CAPITAL_GROUPS = new Set([30, 659]);

/** Units a typical day from the scan's 30 days (zeros on days nothing traded): paceDay's rule, the last 14 days' median, or their average when the median is 0. */
export function paceFromSpark(spark: readonly number[] | null | undefined): number | null {
  if (!spark?.length) return null;
  const last = spark.slice(-14);
  const m = median([...last]);
  return m > 0 ? m : last.reduce((s, v) => s + v, 0) / last.length;
}

/** A freight route's terms: ISK a m³ of packaged volume, a share of the goods' value for collateral, a minimum a contract (null: none stated). */
export type Freight = { perM3: number; collateral: number; min: number | null };
/** One contract: the minimum, or ISK a m³ × m³ + the collateral share × value, whichever is more. */
export const freightCost = (f: Freight, m3: number, value: number): number => Math.max(f.min ?? 0, f.perM3 * m3 + f.collateral * value);
/** A unit's share of a week's batch in one contract, so the minimum is spread over the batch. */
export const freightPerUnit = (f: Freight, volume: number, price: number, weekUnits: number): number => {
  const n = Math.max(1, weekUnits);
  return freightCost(f, volume * n, price * n) / n;
};

/**
 * How goods get between a site and a market: `here` (the site is the market's own system), `carry` (high-sec within
 * NEAR_JITA_JUMPS of Jita with no rate typed: you carry it, no ISK), `route` (a freight route picked), `none` (no way set).
 */
export type Leg = { kind: 'here' } | { kind: 'carry'; jumps: number } | { kind: 'route'; f: Freight; name: string } | { kind: 'none' };
/** What a leg costs a unit, or null when there's no way set. */
export const legCost = (l: Leg, volume: number, price: number, weekUnits: number): number | null =>
  l.kind === 'here' || l.kind === 'carry' ? 0 : l.kind === 'route' ? freightPerUnit(l.f, volume, price, weekUnits) : null;

/**
 * A week's materials travel in one contract, so a route's minimum is spread over the whole batch, not charged on each
 * material: the route's terms scaled up by minimum ÷ the batch's own cost when that's more than 1, with no minimum left.
 * Any other leg is as it was.
 */
export function batchLeg(leg: Leg, lines: readonly { volume: number; price: number; units: number }[]): Leg {
  if (leg.kind !== 'route') return leg;
  const raw = lines.reduce((s, x) => s + x.units * (leg.f.perM3 * x.volume + leg.f.collateral * x.price), 0);
  const scale = raw > 0 ? Math.max(1, (leg.f.min ?? 0) / raw) : 1;
  return { kind: 'route', name: leg.name, f: { perM3: leg.f.perM3 * scale, collateral: leg.f.collateral * scale, min: null } };
}

/**
 * Whether a product may be sold in Jita from a site: anything may, except a ship while "never haul ships to Jita" is on
 * and the site is outside high-sec or more than NEAR_JITA_JUMPS high-sec jumps from Jita (the user: "too bulky expensive
 * and risky").
 */
export function shipToJita(o: { ship: boolean; noShipsToJita: boolean; band: SecBand; jitaJumps: number | null }): boolean {
  if (!o.ship || !o.noShipsToJita) return true;
  return o.band === 'high' && o.jitaJumps != null && o.jitaJumps <= NEAR_JITA_JUMPS;
}

/** A Jita book as the finder reads it: everyone else's orders, the morning's or a live read. */
export type JitaBook = { ask: number | null; bid: number | null; bids: BookLevel[]; sold?: BookSold; at: string; live: boolean };
/** A home hub's prices as Goonmetrics gives them (Task 6): best sell and buy, weekly movement; null where not known. */
export type HomeQuote = { sell: number | null; buy: number | null; weekly: number | null; at: string };
/** What the finder knows of one item's markets. */
export type Market = {
  jita: JitaBook | null;
  stats: ProspectStats | null;
  watched?: { sell: number; buy: number; h: number } | null;
  home?: HomeQuote | null;
  /** The hub's prices have been read (the type may still be missing from them: Goonmetrics has no price for it); false before the first read. */
  homeRead?: boolean;
  /** The home region's daily history (Tenerifis, Insmother), once read; until then home pace is Goonmetrics' weekly movement ÷ 7. */
  homeHist?: HistRow[] | null;
};

/** What a Jita source says when no freight route from Jita is picked: the finder reads it back to tell "pick a route" from "nobody lists it". */
export const NO_ROUTE_WHY = 'no freight route from Jita';
export type Source = 'jita' | 'home' | 'mined';
export type SourceOption = { source: Source; price: number | null; why: string; pickable: boolean };
export type MaterialPick = { type: number; qty: number; pick: Source | null; price: number | null; options: SourceOption[]; patient: number | null };

/**
 * Where one material comes from for the steady profit a day: the cheapest delivered of Jita's best ask plus freight in, the
 * home hub's best sell (only where it moves HOME_DEPTH times the week's need), and mining it, valued at what it would sell
 * for (the home bid, else Jita's), never free. Mined is picked only for a mineable material and a builder who mines (its
 * mining records in the last 30 days): a bid is always under an ask, so without that it would win every mineral and read
 * as if every builder mined. Jita's patient price (a bid where trading reaches) is said beside it, never picked.
 */
export function sourceMaterial(o: {
  type: number; weekNeed: number; volume: number; mineable: boolean; mines: boolean;
  jita: { ask: number | null; bid: number | null; patient: number | null } | null;
  jitaLeg: Leg;
  home: HomeQuote | null; homeLeg: Leg | null; hubName: string | null;
  /** The hub's prices were read, so a type missing from them has no price there rather than being unread. */
  homeRead?: boolean;
}): Omit<MaterialPick, 'qty'> {
  const options: SourceOption[] = [];
  const ask = o.jita?.ask ?? null;
  if (ask == null) options.push({ source: 'jita', price: null, why: o.jita ? 'none listed in Jita' : 'no Jita book this morning', pickable: false });
  else {
    const f = legCost(o.jitaLeg, o.volume, ask, o.weekNeed);
    options.push(f == null ? { source: 'jita', price: null, why: NO_ROUTE_WHY, pickable: false }
      : { source: 'jita', price: ask + f, why: o.jitaLeg.kind === 'route' ? 'Jita’s best ask, plus freight' : o.jitaLeg.kind === 'carry' ? 'Jita’s best ask; you carry it' : 'Jita’s best ask', pickable: true });
  }
  if (o.home && o.homeLeg && o.hubName) {
    const at = o.hubName, sell = o.home.sell, weekly = o.home.weekly;
    const f = sell != null ? legCost(o.homeLeg, o.volume, sell, o.weekNeed) : null;
    options.push(sell == null ? { source: 'home', price: null, why: `none listed at ${at}`, pickable: false }
      : weekly == null ? { source: 'home', price: sell, why: `${at}’s weekly movement isn’t known, so its depth can’t be judged`, pickable: false }
        : weekly < HOME_DEPTH * o.weekNeed ? { source: 'home', price: sell, why: `too thin to buy a week’s need at ${at}`, pickable: false }
          : f == null ? { source: 'home', price: null, why: `no freight route from ${at}`, pickable: false }
            : { source: 'home', price: sell + f, why: `${at}’s best sell`, pickable: true });
  }
  else if (o.homeLeg && o.hubName) options.push({ source: 'home', price: null, why: o.homeRead ? `no price at ${o.hubName}` : `not read at ${o.hubName} yet`, pickable: false });
  if (o.mineable) {
    const value = o.home?.buy ?? o.jita?.bid ?? null;
    options.push(value == null ? { source: 'mined', price: null, why: 'no bid to value it at', pickable: false }
      : { source: 'mined', price: value, why: o.mines ? 'you mine: valued at what it would sell for' : 'valued at what it would sell for; not counted, since you haven’t mined in 30 days', pickable: o.mines });
  }
  let best: SourceOption | null = null;
  for (const x of options) if (x.pickable && x.price != null && (!best || x.price < best.price!)) best = x;
  return { type: o.type, pick: best?.source ?? null, price: best?.price ?? null, options, patient: o.jita?.patient ?? null };
}

/** A sale at one place, per unit after fees and freight out, with each side's pace. */
export type Sale = {
  place: 'jita' | 'home';
  /** The price to list at, and what a unit nets after the broker fee (left out when not known), sales tax and freight. */
  list: number | null; listNet: number | null;
  /** The best bid of others, and what a unit nets sold into it after sales tax and freight. */
  bid: number | null; bidNet: number | null;
  /** Units a typical day, and how much of it is buyers taking listings (share) and sellers selling into bids. */
  pace: number | null; listPace: number | null; bidPace: number | null;
  split: number; splitFrom: SplitFrom | 'goonmetrics';
  paceFrom: 'scan' | 'history' | 'goonmetrics' | null;
  freight: number | null; brokerKnown: boolean;
  /** Why it can't be sold there; null when it can. */
  why: string | null;
};

/**
 * What a product fetches at one place. Jita: `listingPrice` on others' book with this morning's highs, after your broker
 * fee and sales tax, less freight from the site; into the best bid after tax. Pace: the scan's typical day × the split
 * `tradingSplit` reads (the book's sold counts, history's guess, or even). A home hub: Goonmetrics' best sell less a tick,
 * checked against the home region's 14 days of highs once its history is read, after your sales tax and the hub's broker
 * fee (left out until typed or measured: ranked before it); its pace the home region's typical day × history's split, or,
 * until that history is read, Goonmetrics' weekly movement ÷ 7 at an even split. Freight's minimum is spread over a week's
 * sales at your share.
 */
export function sellAt(place: 'jita' | 'home', m: Market, o: { broker: number | null; tax: number; leg: Leg | null; volume: number; makes: number; share: number; now: number; hubName?: string | null }): Sale {
  const base: Sale = { place, list: null, listNet: null, bid: null, bidNet: null, pace: null, listPace: null, bidPace: null, split: EVEN_SPLIT, splitFrom: 'even', paceFrom: null, freight: null, brokerKnown: o.broker != null, why: null };
  let list: number | null, bid: number | null, pace: number | null, split: number, splitFrom: Sale['splitFrom'], paceFrom: Sale['paceFrom'];
  if (place === 'jita') {
    if (!m.jita) return { ...base, why: 'No Jita book this morning' };
    list = listingPrice(m.jita.ask, m.jita.bid, m.stats?.highs14);
    bid = m.jita.bid;
    pace = paceFromSpark(m.stats?.spark);
    const s = tradingSplit({ history: m.stats?.buyerShare ?? null, book: m.jita.sold ?? null, watched: m.watched ?? null, typicalDay: pace });
    split = s.share; splitFrom = s.from; paceFrom = pace != null ? 'scan' : null;
  } else {
    const h = m.home;
    if (!h) return { ...base, why: m.homeRead ? `No price at ${o.hubName ?? 'home'}` : `Not read at ${o.hubName ?? 'home'} yet` };
    const hist = m.homeHist && m.homeHist.length ? m.homeHist : null;
    list = listingPrice(h.sell, h.buy, hist ? recentRange(hist, 14, o.now).highs : null);
    bid = h.buy;
    if (hist) {
      pace = paceDay(hist, o.now);
      const s = tradingSplit({ history: buyerShare(hist.slice(-30)) });
      split = s.share; splitFrom = s.from; paceFrom = 'history';
    } else {
      pace = h.weekly != null ? h.weekly / 7 : null;
      split = EVEN_SPLIT; splitFrom = 'goonmetrics'; paceFrom = pace != null ? 'goonmetrics' : null;
    }
  }
  // A pace not known is never a pace of 0: the row says so, and isn't ranked on a guess.
  if (pace == null) return { ...base, list, bid, split, splitFrom, why: place === 'jita' ? 'No history this morning to say how fast it sells' : `Nothing says how fast it sells at ${o.hubName ?? 'home'}` };
  if (o.leg == null || o.leg.kind === 'none') return { ...base, list, bid, pace, split, splitFrom, paceFrom, why: place === 'jita' ? 'no freight route to Jita' : `no freight route to ${o.hubName ?? 'home'}` };
  const cap = pace != null ? (pace * o.share) / 100 : 0;
  const week = 7 * Math.min(o.makes, cap > 0 ? cap : o.makes);
  const ref = list ?? bid;
  const freight = ref != null ? legCost(o.leg, o.volume, ref, week) : null;
  const fee = o.broker ?? 0;
  return {
    ...base, list, bid, pace, split, splitFrom, paceFrom, freight,
    listNet: list != null && freight != null ? list * (1 - fee - o.tax) - freight : null,
    bidNet: bid != null && freight != null ? bid * (1 - o.tax) - freight : null,
    listPace: pace != null ? pace * split : null,
    bidPace: pace != null ? pace * (1 - split) : null,
    why: list == null && bid == null ? (place === 'jita' ? 'none listed or bid in Jita' : `none listed at ${o.hubName ?? 'home'}`) : null,
  };
}

/**
 * One factory slot's day: units onto listings and into bids, what they make, and whether the market, the slot or (Tech
 * II) the lab slot inventing for it limits it.
 */
export type SlotDay = { list: number; bids: number; units: number; profit: number; limit: 'market' | 'slot' | 'invention' };

/**
 * What one slot earns a day selling at one place: the better-paying side first, up to your share of its pace, then the
 * other side only where it pays, both together no more than the slot makes. A side that loses is still sold when it's the
 * better one: the row shows the loss rather than hiding it. Null when neither side has a price.
 */
export function slotDay(makes: number, sale: Sale, costUnit: number, share: number): SlotDay | null {
  const capOf = (pace: number | null) => (pace != null && pace > 0 ? (pace * share) / 100 : 0);
  const sides = ([
    { side: 'list', profit: sale.listNet == null ? null : sale.listNet - costUnit, cap: capOf(sale.listPace) },
    { side: 'bids', profit: sale.bidNet == null ? null : sale.bidNet - costUnit, cap: capOf(sale.bidPace) },
  ] as const).filter((s): s is typeof s & { profit: number } => s.profit != null).sort((a, b) => b.profit - a.profit);
  if (!sides.length) return null;
  let left = makes, profit = 0;
  const n = { list: 0, bids: 0 };
  sides.forEach((s, i) => {
    if (i > 0 && !(s.profit > 0)) return;
    const take = Math.min(left, s.cap);
    n[s.side] = take; left -= take; profit += take * s.profit;
  });
  const units = n.list + n.bids;
  return { list: n.list, bids: n.bids, units, profit, limit: units >= makes - 1e-9 ? 'slot' : 'market' };
}

/** Why a row isn't priced: no Jita book this morning; indices, adjusted prices or a material's price not known; no freight route to bring materials (or Tech II's datacores) from Jita (`noRoute`: pick one); nowhere it may be sold; (Tech II) its invention can't be costed. */
export type Missing = 'noBook' | 'noIndex' | 'noAdjusted' | 'noRoute' | 'noMaterials' | 'noSale' | 'noInvention';

export type RowSite = { kind: SiteKind; rigs: readonly number[]; band: SecBand; tax: number | null; index: IndustryIndex | null };
export type RowInput = {
  ix: Indexed; bp: BundleBp;
  me: number; te: number; copyRuns?: number | null;
  skills: Record<number, number>; clone: Clone;
  site: RowSite;
  adjusted: Record<number, number> | null;
  market: (type: number) => Market;
  sell: 'jita' | 'home' | 'best';
  share: number;
  fees: { broker: number; tax: number; hubBroker: number | null };
  /** site ↔ Jita and site ↔ the home hub (null: no hub picked). */
  legs: { jita: Leg; home: Leg | null };
  noShipsToJita: boolean; jitaJumps: number | null;
  mines: boolean; hubName: string | null;
  now: number;
  /** Where research, copying and invention run (industrySites' labFor): the site, or the nearest Laboratory; null when none can be reached. Tech II's invention needs it. */
  lab?: LabSite | null;
};

/** A Tech II copy as invented: ME 2, TE 4 (EVE University, "Invention"). Decryptors, which change them, aren't modelled. */
export const T2_ME = 2, T2_TE = 4;
/** Skills an invention lists that aren't its sciences: Capital Ship Construction and Outpost Construction gate some capital modules'. */
const NOT_SCIENCE = new Set<number>([SKILL.capitalShips, 3400]);
/** An encryption skill, by its name: the static data has no flag for it, and its level counts a quarter less than a science's. */
export const isEncryption = (ix: Indexed, skill: number): boolean => (ix.b.types[skill]?.[0] ?? '').endsWith('Encryption Methods');

/**
 * A Tech II unit's invention, a success at a time: the chance at the builder's skills (the two sciences a thirtieth a
 * level, the encryption skill a fortieth), attempts = 1 / chance, each attempt a one-run Tech I copy (the copy loses a run
 * an attempt) and its datacores, at the lab's index and bonuses. A success is a copy of `runsPerCopy` runs at ME 2 / TE 4.
 * `labPerDay` is what one lab slot invents for a day, copying included. Costs not known (skills not read, no lab, no index
 * there, a datacore nobody lists, no adjusted price) stay null, with `why`: skills not read are never level 0, so the
 * chance itself is null then.
 */
export type Invention = {
  from: number; chance: number | null; attempts: number | null; runsPerCopy: number; unitsPerCopy: number;
  sciences: { id: number; level: number }[]; encryption: { id: number; level: number } | null;
  /** Each datacore an attempt; and a day's, sourced like a material (qty: a day's, at the units a day made). */
  perAttempt: { type: number; qty: number }[];
  datacores: MaterialPick[];
  /** A success's datacores, invention jobs and one-run copies; and all of it a unit. */
  datacoreCost: number | null; job: JobCost | null; copy: JobCost | null; perUnit: number | null;
  /** Lab seconds a success (its copies and attempts), and units a day one lab slot invents for; null with the chance. */
  labSeconds: number | null; labPerDay: number | null;
  /** Datacores no freight route from Jita can bring (`noRoute`'s sibling). */
  noRoute: boolean;
  why: string | null;
};

export type Row = {
  bp: number; product: number; perRun: number; ship: boolean;
  time: number; runs: number; makes: number;
  materials: MaterialPick[]; materialCost: number | null;
  eiv: number | null; job: JobCost | null;
  costUnit: number | null;
  sales: Sale[]; sale: Sale | null; day: SlotDay | null;
  /** Tech II: its invention, costed into costUnit; null for Tech I. */
  invention: Invention | null;
  /** When the facility tax isn't known: what each 1% of it would cost a day. */
  taxPerPct: number | null;
  /** Whether the job's cost is whole: false while the facility tax or the Alpha tax (clone state) isn't known, so the profit is "before" it; null when the job isn't costed. */
  costKnown: boolean | null;
  /** When selling at a hub whose broker fee isn't known: what each 1% of it would cost a day. */
  brokerPerPct: number | null;
  lacking: { id: number; level: number }[];
  missing: Missing | null;
  /** Ships the switch keeps out of Jita from this site (only ones with a Jita book: ones that would otherwise have sold there). */
  shipsKeptHome: boolean;
};

/** One blueprint built at a site and sold where the choices say: a day's job, its materials, its cost, its sale, one slot's day. */
export function buildRow(o: RowInput): Row {
  const { ix, bp } = o;
  const m = bp[2] as BpActivity;
  const prod = productOf(bp)!;
  const t = ix.b.types[prod.type];
  const ship = t?.[2] === 6;
  // Tech II: built from an invented copy, at ME 2 / TE 4, a job no longer than the copy's runs.
  const from = ix.inventedFrom.get(bp[0]);
  const t1 = from != null ? ix.bp.get(from) : undefined;
  const t1Inv = t1 && t1[6] ? (t1[6] as BpActivity) : null;
  const invented = t1Inv ? t1Inv[3].find((p) => p[0] === bp[0]) ?? null : null;
  const me = invented ? T2_ME : o.me, te = invented ? T2_TE : o.te;
  const sb = structureBonus(ix, o.site.kind);
  const rig = rigFor(ix, o.site.rigs, o.site.kind, o.site.band, prod.type, 'manufacturing');
  const time = jobTime(m[0], te, manufacturingSkills(ix, m[2], o.skills), sb.time, rig.time);
  const runs = runsPerDay(time, invented ? o.copyRuns ?? invented[1] : o.copyRuns);
  const days = Math.max(1, (runs * time) / DAY_S);
  const made = runs * prod.perRun;
  const lab = t1 && t1Inv && invented ? inventionLab(o, t1, t1Inv, invented, prod.perRun) : null;
  // One factory slot fed by one lab slot: Tech II makes no more a day than the lab invents for.
  const makes = lab && lab.labPerDay != null ? Math.min(made / days, lab.labPerDay) : made / days;
  const need = materialsFor(m[1], runs, me, sb.material, rig.material);
  const week = (qty: number) => (qty * 7) / days;
  const lines = (price: (mk: Market) => number | null | undefined) => need.map(([type, qty]) => ({ volume: ix.b.types[type]?.[3] ?? 0, price: price(o.market(type)) ?? 0, units: week(qty) }));
  const jitaLeg = batchLeg(o.legs.jita, lines((mk) => mk.jita?.ask));
  const homeLeg = o.legs.home ? batchLeg(o.legs.home, lines((mk) => mk.home?.sell)) : null;
  const materials: MaterialPick[] = need.map(([type, qty]) => {
    const mk = o.market(type), mt = ix.b.types[type];
    const pick = sourceMaterial({
      type, weekNeed: week(qty), volume: mt?.[3] ?? 0, mineable: mt?.[5] === 1, mines: o.mines,
      jita: mk.jita ? { ask: mk.jita.ask, bid: mk.jita.bid, patient: mk.stats?.lows14 ? reachedBid(mk.stats.lows14) : null } : null,
      jitaLeg, home: mk.home ?? null, homeLeg, hubName: o.hubName, homeRead: mk.homeRead,
    });
    return { ...pick, qty };
  });
  const materialCost = materials.every((x) => x.price != null) ? materials.reduce((s, x) => s + x.qty * x.price!, 0) : null;
  const eiv = o.adjusted ? eivOf(m[1], o.adjusted) : null;
  const job = eiv != null && o.site.index ? manufacturingCost(eiv, runs, { index: o.site.index.manufacturing, structure: sb.cost, rig: rig.cost, tax: o.site.tax, clone: o.clone }) : null;
  const invention = t1 && lab ? inventionCosts(o, t1, lab, eiv, makes, jitaLeg, homeLeg) : null;
  const costUnit = materialCost != null && job && (!invented || invention?.perUnit != null) ? (materialCost + job.total) / made + (invention?.perUnit ?? 0) : null;

  const pm = o.market(prod.type);
  const jitaOk = shipToJita({ ship, noShipsToJita: o.noShipsToJita, band: o.site.band, jitaJumps: o.jitaJumps });
  const places: ('jita' | 'home')[] = o.sell === 'jita' ? ['jita'] : o.sell === 'home' ? ['home'] : ['jita', 'home'];
  const sales = places.filter((p) => (p === 'jita' ? jitaOk : o.legs.home != null)).map((p) => sellAt(p, pm, {
    broker: p === 'jita' ? o.fees.broker : o.fees.hubBroker, tax: o.fees.tax, leg: p === 'jita' ? o.legs.jita : o.legs.home,
    volume: t?.[3] ?? 0, makes, share: o.share, now: o.now, hubName: o.hubName,
  }));
  let sale: Sale | null = null, day: SlotDay | null = null;
  if (costUnit != null) for (const s of sales) {
    const d = s.why ? null : slotDay(makes, s, costUnit, o.share);
    if (d && (!day || d.profit > day.profit)) { sale = s; day = d; }
  }
  // The lab binds when it invents for fewer than the factory slot makes and every one of those sells.
  if (day && lab && lab.labPerDay != null && lab.labPerDay < made / days && day.limit === 'slot') day = { ...day, limit: 'invention' };
  // Materials (or a Tech II's datacores) nobody can bring in because no freight route from Jita is picked say so (the user's
  // first run at a null-sec home), not "a material nobody lists".
  const noRoute = (materialCost == null && materials.some((x) => !x.pick && x.options.some((q) => q.source === 'jita' && q.why === NO_ROUTE_WHY))) || !!invention?.noRoute;
  const missing: Missing | null = !pm.jita && !pm.home ? 'noBook' : !o.site.index ? 'noIndex' : eiv == null ? 'noAdjusted'
    : noRoute ? 'noRoute' : materialCost == null ? 'noMaterials' : invented && invention?.perUnit == null ? 'noInvention' : !day ? 'noSale' : null;
  // A tax not typed: the manufacturing job's, and the lab's too where the lab is the site, each 1% of their bases a day.
  const labTaxed = invention?.job && invention.copy && invention.job.tax == null ? ((invention.job.base + invention.copy.base) * makes) / invention.unitsPerCopy : 0;
  const siteTaxed = job != null && o.site.tax == null;
  return {
    bp: bp[0], product: prod.type, perRun: prod.perRun, ship, time, runs, makes, materials, materialCost, eiv, job, costUnit, sales, sale, day, invention,
    // Whole when nothing is left out of any job's cost: the build's, and a Tech II's invention and copies at the lab.
    costKnown: job ? job.tax != null && job.alpha != null && (!invention?.job || (invention.job.tax != null && invention.job.alpha != null && invention.copy?.tax != null && invention.copy.alpha != null)) : null,
    taxPerPct: siteTaxed || labTaxed > 0 ? ((siteTaxed ? job!.base / days : 0) + labTaxed) * 0.01 : null,
    brokerPerPct: day && sale?.place === 'home' && !sale.brokerKnown && sale.list != null ? day.list * sale.list * 0.01 : null,
    lacking: lackingAll(m[2], t1, o.skills), missing,
    shipsKeptHome: ship && !jitaOk && o.sell !== 'home' && !!pm.jita,
  };
}

/** The skills a row asks for: its manufacturing's, and for Tech II its Tech I's invention and copying too, each at the highest level asked. */
function lackingAll(made: [number, number][], t1: BundleBp | undefined, skills: Record<number, number>): { id: number; level: number }[] {
  const want = new Map<number, number>();
  const lists = [made, ...(t1 ? [(t1[6] || null)?.[2] ?? [], (t1[3] || null)?.[2] ?? []] : [])];
  for (const list of lists) for (const [id, l] of list) want.set(id, Math.max(want.get(id) ?? 0, l));
  return lacking([...want], skills);
}

type InventionLab = {
  inv: BpActivity; sciences: { id: number; level: number }[]; encryption: { id: number; level: number } | null;
  chance: number | null; attempts: number | null; runsPerCopy: number; unitsPerCopy: number; labSeconds: number | null; labPerDay: number | null;
};

/**
 * A Tech II row's lab: its chance, attempts and lab time, before any price (so the slot's units a day can be capped first).
 * With no skills read the chance is null: an unread skill is never level 0.
 */
function inventionLab(o: RowInput, t1: BundleBp, inv: BpActivity, invented: number[], perRun: number): InventionLab {
  const { ix } = o;
  const cp = t1[3] as BpActivity | 0;
  const read = Object.keys(o.skills).length > 0;
  const level = (id: number) => Math.max(0, Math.min(5, o.skills[id] ?? 0));
  const listed = inv[2].filter(([id]) => !NOT_SCIENCE.has(id));
  const enc = listed.find(([id]) => isEncryption(ix, id));
  const sciences = listed.filter(([id]) => !isEncryption(ix, id)).map(([id]) => ({ id, level: level(id) }));
  const encryption = enc ? { id: enc[0], level: level(enc[0]) } : null;
  const chance = read ? inventionChance(invented[2] ?? 0, sciences[0]?.level ?? 0, sciences[1]?.level ?? 0, encryption?.level ?? 0) : null;
  const attempts = chance == null ? null : chance > 0 ? 1 / chance : Infinity;
  const runsPerCopy = invented[1];
  const lab = o.lab ?? null;
  const sb = structureBonus(ix, lab?.kind ?? 'npc');
  const rigT = (a: 'invention' | 'copying') => (lab ? rigFor(ix, lab.rigs, lab.kind, lab.band, null, a).time : 1);
  const labSeconds = attempts == null ? null : attempts * (inventionTime(ix, inv[0], o.skills, sb.time, rigT('invention')) + (cp ? copyTime(ix, cp[0], 1, 1, o.skills, sb.time, rigT('copying')) : 0));
  const unitsPerCopy = runsPerCopy * perRun;
  return { inv, sciences, encryption, chance, attempts, runsPerCopy, unitsPerCopy, labSeconds, labPerDay: labSeconds == null ? null : Number.isFinite(labSeconds) && labSeconds > 0 ? (DAY_S / labSeconds) * unitsPerCopy : 0 };
}

/** A Tech II row's invention, priced: datacores sourced like materials, the invention jobs and the one-run copies at the lab. */
function inventionCosts(o: RowInput, t1: BundleBp, l: InventionLab, eivT2: number | null, makes: number, jitaLeg: Leg, homeLeg: Leg | null): Invention {
  const { ix } = o;
  const lab = o.lab ?? null;
  const attempts = l.attempts != null && Number.isFinite(l.attempts) ? l.attempts : null;
  const perDay = attempts != null ? (makes / l.unitsPerCopy) * attempts : 0;
  const datacores: MaterialPick[] = l.inv[1].map(([type, qty]) => {
    const mk = o.market(type), mt = ix.b.types[type];
    return {
      ...sourceMaterial({
        type, weekNeed: qty * perDay * 7, volume: mt?.[3] ?? 0, mineable: false, mines: false,
        jita: mk.jita ? { ask: mk.jita.ask, bid: mk.jita.bid, patient: mk.stats?.lows14 ? reachedBid(mk.stats.lows14) : null } : null,
        jitaLeg, home: mk.home ?? null, homeLeg, hubName: o.hubName, homeRead: mk.homeRead,
      }),
      qty: qty * perDay,
    };
  });
  const perAttempt = l.inv[1].reduce<number | null>((sum, [, qty], i) => (sum == null || datacores[i].price == null ? null : sum + qty * datacores[i].price!), 0);
  const eivT1 = o.adjusted && t1[2] ? eivOf((t1[2] as BpActivity)[1], o.adjusted) : null;
  const sb = structureBonus(ix, lab?.kind ?? 'npc');
  const at = (a: 'invention' | 'copying') => (lab?.index ? { index: lab.index[a], structure: sb.cost, rig: rigFor(ix, lab.rigs, lab.kind, lab.band, null, a).cost, tax: lab.tax, clone: o.clone } : null);
  const job = eivT2 != null && attempts != null && at('invention') ? inventionCost(eivT2, attempts, at('invention')!) : null;
  const copy = eivT1 != null && attempts != null && at('copying') ? copyCost(eivT1, 1, attempts, at('copying')!) : null;
  const datacoreCost = perAttempt != null && attempts != null ? perAttempt * attempts : null;
  const noRoute = datacores.some((d) => !d.pick && d.options.some((q) => q.source === 'jita' && q.why === NO_ROUTE_WHY));
  const why = l.chance == null ? 'skills not read, so the chance of success isn’t known' : !lab ? 'no Laboratory can be reached' : !lab.index ? 'no index for the lab’s system'
    : attempts == null ? 'no chance of success at these skills' : noRoute ? 'no freight route from Jita to bring the datacores' : datacoreCost == null ? 'a datacore nobody lists where it can be bought'
      : job == null || copy == null ? 'no adjusted price for it' : null;
  return {
    from: t1[0], chance: l.chance, attempts: l.attempts, runsPerCopy: l.runsPerCopy, unitsPerCopy: l.unitsPerCopy,
    sciences: l.sciences, encryption: l.encryption, perAttempt: l.inv[1].map(([type, qty]) => ({ type, qty })), datacores, datacoreCost, job, copy,
    perUnit: why ? null : (datacoreCost! + job!.total + copy!.total) / l.unitsPerCopy,
    labSeconds: l.labSeconds, labPerDay: l.labPerDay, noRoute, why,
  };
}

/** The finder's kinds, from a product's category, group and the static data's filters. */
export type ProductKind = 'rigs' | 'modules' | 'charges' | 'drones' | 'deployables' | 'hulls-small' | 'hulls-medium' | 'hulls-large' | 'hulls-other'
  | 'fuel' | 'structures' | 'components' | 'capital-parts' | 'capital' | 'other';
export function productKind(ix: Indexed, product: number): ProductKind {
  const t = ix.b.types[product];
  if (!t) return 'other';
  const [, group, cat] = t;
  const inF = (f: number) => { const x = ix.b.filters[f]; return !!x && (x[1].includes(cat) || x[2].includes(group)); };
  if (cat === 7) return ix.b.groups[group]?.[0].startsWith('Rig ') ? 'rigs' : 'modules';
  if (cat === 8) return 'charges';
  if (cat === 18 || cat === 87) return 'drones';
  if (cat === 22) return 'deployables';
  if (cat === 6) return inF(11) || CAPITAL_GROUPS.has(group) ? 'capital' : inF(5) || inF(6) ? 'hulls-small' : inF(7) || inF(8) ? 'hulls-medium' : inF(9) || inF(10) ? 'hulls-large' : 'hulls-other';
  if (group === 1136) return 'fuel';
  if (inF(13) || inF(15)) return 'capital-parts';
  if (inF(14)) return 'components';
  if (inF(12)) return 'structures';
  return 'other';
}

/** The blueprints the finder ranks: Tech I (not invention products: Tech II is costed through invention) and no capital hull. */
export function finderBlueprints(ix: Indexed): BundleBp[] {
  return ix.b.bps.filter((bp) => {
    const p = productOf(bp);
    return !!p && !!bp[2] && !ix.t2.has(bp[0]) && productKind(ix, p.type) !== 'capital';
  });
}

/** Tech II blueprints the finder costs through invention: every one invented from a Tech I (the 68 old originals on the market too), no capital hull. */
export function inventionBlueprints(ix: Indexed): BundleBp[] {
  return ix.b.bps.filter((bp) => {
    const p = productOf(bp);
    return !!p && !!bp[2] && ix.inventedFrom.has(bp[0]) && productKind(ix, p.type) !== 'capital';
  });
}

/** Every finder blueprint as a row, priced first, best profit a day first; rows not priced after, in the bundle's order. */
export function rankBuilds(o: Omit<RowInput, 'bp'>, bps: readonly BundleBp[]): Row[] {
  const rows = bps.map((bp) => buildRow({ ...o, bp }));
  return rows.sort((a, b) => (b.day ? b.day.profit : -Infinity) - (a.day ? a.day.profit : -Infinity));
}

/** The research step a row's detail offers: profit a day at each ME/TE, and days and ISK to research there from 0/0. */
export type MeLevel = { me: number; te: number; profit: number | null; days: number | null; cost: number | null };
/** Where research runs: the site when it has a Laboratory, else the nearest one, with its index and bonuses. */
export type LabSite = { kind: SiteKind; rigs: readonly number[]; band: SecBand; tax: number | null; index: IndustryIndex | null };
export const ME_LEVELS: [number, number][] = [[0, 0], [6, 0], [8, 0], [10, 0], [10, 20]];

/**
 * Profit a day at ME 0, 6, 8, 10 and 10/20, with the days and ISK to research a fresh original to each in one lab slot,
 * one level after another, at the lab's index and bonuses and the builder's skills. Research ISK is null while the lab's
 * index or the EIV isn't known.
 */
export function meLevels(o: RowInput, lab: LabSite): MeLevel[] {
  const { ix, bp } = o;
  const rme = bp[4], rte = bp[5];
  const sb = structureBonus(ix, lab.kind);
  const cost = (a: 'researchMaterial' | 'researchTime') => rigFor(ix, lab.rigs, lab.kind, lab.band, null, a);
  return ME_LEVELS.map(([me, te]) => {
    const row = buildRow({ ...o, me, te });
    const meT = rme ? researchTime(ix, rme[0], 'me', 0, me, o.skills, sb.time, cost('researchMaterial').time) : null;
    const teT = rte ? researchTime(ix, rte[0], 'te', 0, te / 2, o.skills, sb.time, cost('researchTime').time) : null;
    const at = (a: 'researchMaterial' | 'researchTime') => lab.index ? { index: lab.index[a], structure: sb.cost, rig: cost(a).cost, tax: lab.tax, clone: o.clone } : null;
    const meC = row.eiv != null && at('researchMaterial') ? researchCost(row.eiv, 0, me, at('researchMaterial')!).total : null;
    const teC = row.eiv != null && at('researchTime') ? researchCost(row.eiv, 0, te / 2, at('researchTime')!).total : null;
    return {
      me, te, profit: row.day?.profit ?? null,
      days: meT != null && teT != null ? (meT + teT) / DAY_S : null,
      cost: me === 0 && te === 0 ? 0 : meC != null && teC != null ? meC + teC : null,
    };
  });
}

/** What's held where the site is, per type (the builder's loose hangar stock there), and what it cost the builder. */
export type Held = { units: (type: number) => number; cost: (type: number, units: number) => number | null };

/**
 * What starting costs: the original (NPCs' price; null when no NPC sells it), research to the ME/TE assumed, and a day's
 * materials less what's held at the site. Held materials count here and in the shopping list only, never in the steady
 * profit a day, since they're one-off and carry no freight in.
 */
export function startUp(row: Row, o: { bpo: number | null; research: number | null; held: Held }): { bpo: number | null; research: number | null; materials: number | null; heldUnits: number; heldCost: number | null; total: number | null } {
  let materials = 0, heldUnits = 0, heldCost: number | null = 0, known = true;
  for (const x of [...row.materials, ...(row.invention?.datacores ?? [])]) {
    const h = Math.min(x.qty, Math.max(0, o.held.units(x.type)));
    heldUnits += h;
    if (h > 0) { const c = o.held.cost(x.type, h); heldCost = heldCost != null && c != null ? heldCost + c : null; }
    if (x.qty - h <= 0) continue;
    if (x.price == null) { known = false; continue; }
    materials += (x.qty - h) * x.price;
  }
  const mats = known ? materials : null;
  return { bpo: o.bpo, research: o.research, materials: mats, heldUnits, heldCost, total: o.bpo != null && o.research != null && mats != null ? o.bpo + o.research + mats : null };
}

/** What to buy for a day's job beyond what's held, per source: each line the units, the delivered price and the source picked. */
export function shoppingList(row: Row, held: Held): { type: number; qty: number; price: number | null; source: Source | null }[] {
  return [...row.materials, ...(row.invention?.datacores ?? [])].map((x) => ({ type: x.type, qty: Math.max(0, x.qty - Math.max(0, held.units(x.type))), price: x.price, source: x.pick })).filter((x) => x.qty > 0);
}

/** The morning scan's NPC sellers of every bundle blueprint in The Forge (`industry_npc`): price and stations, cheapest first. */
export type NpcRow = { at: string; complete: boolean; pagesFailed: number; sellers: Record<string, [price: number, stations: number[]]> };
export type BpoWhere =
  | { state: 'forge'; price: number; stations: number[] }
  | { state: 'notForge'; base: number | null; at: string }
  | { state: 'unknown'; base: number | null; missed: number }
  | { state: 'unread' };

/**
 * Where an original is sold, from the latest complete read and any newer partial one: the partial's sellers on top. In
 * The Forge, the price and stations. Not there after a complete read: NPCs don't sell it in The Forge (CCP's base price
 * beside, no payback). Not there with only a partial read: no seller found, the pages it missed said, no payback. No read
 * at all (the cloud off, a version behind, or no scan yet): not read.
 */
export function bpoWhere(rows: { complete: NpcRow | null; partial: NpcRow | null } | null, bp: number, basePrice: number): BpoWhere {
  if (!rows || (!rows.complete && !rows.partial)) return { state: 'unread' };
  const hit = rows.partial?.sellers[bp] ?? rows.complete?.sellers[bp];
  if (hit) return { state: 'forge', price: hit[0], stations: hit[1] };
  const base = basePrice > 0 ? basePrice : null;
  if (rows.complete) return { state: 'notForge', base, at: rows.complete.at };
  return { state: 'unknown', base, missed: rows.partial!.pagesFailed };
}

/** Days for the original to pay for itself out of one slot's profit a day; null with no original price or no profit. */
export const payback = (bpo: number | null, profitDay: number | null | undefined): number | null =>
  bpo != null && profitDay != null && profitDay > 0 ? bpo / profitDay : null;

/** How far back a mining record says a character mines. */
export const MINED_DAYS = 30;
/**
 * Whether a character mined in the last 30 days, by its own mining records (the Mining tab's: the main's in the ledger, an
 * alt's in its pulled copy): only then is "mined" picked as a material's source (sourceMaterial).
 */
export function minedLately(records: Record<string, { charId: number; date: string }>, charId: number, now: number): boolean {
  const since = new Date(now - MINED_DAYS * 86_400_000).toISOString().slice(0, 10);
  return Object.values(records).some((r) => r.charId === charId && r.date >= since);
}

/**
 * A Jita book as the finder reads it: everyone else's orders, the builder's own taken off their price's level (selling
 * into your own bid, or undercutting your own listing, is no sale). `live` when it's a read of now, not the morning's.
 */
export function othersBook(b: { bestBuy: number | null; bestSell: number | null; topBuys: BookLevel[]; topSells: BookLevel[]; sold?: BookSold; at: string },
  own: readonly { typeId: number; isBuy: boolean; price: number; volume: number }[], typeId: number, live: boolean): JitaBook {
  const mine = own.filter((o) => o.typeId === typeId);
  const asks = withoutOwn(b.topSells, mine.filter((o) => !o.isBuy));
  const bids = withoutOwn(b.topBuys, mine.filter((o) => o.isBuy));
  return { ask: asks[0]?.price ?? null, bid: bids[0]?.price ?? null, bids, ...(b.sold ? { sold: b.sold } : {}), at: b.at, live };
}

/**
 * The ore that gives the most of a material a m³ mined, at the builder's yield where it's refined: each ore's units of the
 * material a portion x yield / portion / its volume. Null when none of the ores given yields it.
 */
export function bestOreFor(material: number, ores: readonly { id: number; mats: [number, [number, number][], number?]; volume: number }[], yieldOf: (m: [number, [number, number][], number?]) => number): { id: number; perM3: number } | null {
  let best: { id: number; perM3: number } | null = null;
  for (const o of ores) {
    const q = o.mats[1].find(([t]) => t === material)?.[1];
    if (!q || !(o.volume > 0)) continue;
    const perM3 = (q * yieldOf(o.mats)) / o.mats[0] / o.volume;
    if (!best || perM3 > best.perM3) best = { id: o.id, perM3 };
  }
  return best;
}

/**
 * How long a read of the NPC row may be kept: until the next morning scan could have replaced it (the first 11:25 EVE time after the row's `at`,
 * plus ten minutes' margin) or 15 minutes, whichever is sooner; never negative. A row with no time is kept 15 minutes.
 */
export const NPC_HOLD_MS = 15 * 60_000;
export function npcHoldMs(at: string | null, now: number): number {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return NPC_HOLD_MS;
  const d = new Date(t);
  const scan = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 11, 25);
  const next = (scan > t ? scan : scan + 86_400_000) + 10 * 60_000;
  return Math.max(0, Math.min(NPC_HOLD_MS, next - now));
}
