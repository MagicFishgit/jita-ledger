import { useEffect, useMemo, useState } from 'react';
import { homeAgo } from '../../lib/homeMarket';
import { units } from '../../lib/format';
import { useNow, useStable } from '../../lib/hooks';
import { HOME_DEPTH, legCost, NO_ROUTE_WHY, othersBook, sellAt, type Freight, type Leg, type Market, type Sale } from '../../lib/industryRank';
import { JITA_SYSTEM, legFor } from '../../lib/industrySites';
import { watchedFlow } from '../../lib/flowStore';
import type { Buy, Fallback, PlanPlanet, Sell, Sold } from '../../lib/piPlan';
import { boughtAtHome, boughtOf, jitaSteps, soldAtHome, soldOf, type BuyPlace } from '../../lib/piPlan';
import { planetTypeOf, radiusMap, type PiIndex } from '../../lib/piBundle';
import { customsRate, type Tax } from '../../lib/planetsDoc';
import { reloadApp } from '../../lib/reload';
import { useData } from '../../lib/store';
import { planet as planetInfo, system as systemInfo, typeName, type SystemInfo } from '../../lib/universe';
import { loadRadii } from './planetsBundle';
import type { IndustryChar } from './industryChars';
import { homeSaid } from './industryFinder';
import { useHomeHistoryRead, useHomeHubs, useHomeQuotes, useIndustryDoc, useLiveRead, useScanCache, type Loaded, type ReadCount } from './industryMarket';

/**
 * One unit's net at the better place, uncapped (for the chart: `sell(id, 1)` would be capped on a thin P4). `book`: what that
 * place's price was read from (Ruling T12-2), so a value says it where it shows: Jita's book read live now, or this morning's
 * scan; the hub's own market's read, or Goonmetrics'. Null with no value.
 */
export type UnitBook = 'now' | 'morning' | 'hub' | 'goonmetrics';
export type UnitNet = { isk: number | null; where: 'jita' | 'home' | null; why: string | null; book?: UnitBook | null; fallback?: Fallback | null };
export type PlanetMarket = {
  sell: Sell; buy: Buy; unit: (typeId: number) => UnitNet; ready: boolean; said: string;
  /** Whether any of the goods named in `live` has its Jita book read live yet: the planner ranks again on them only then. */
  live: boolean;
  /**
   * Whether every read for the goods named in `live` has come back or failed: their Jita books, and with a hub, its region's history
   * (planner fix 2: Plan it works its setups out on the live reads once they're all in, never batch by batch).
   */
  settled: boolean;
  /** Reads still out when `settled` came by the bound (`LIVE_READ_BOUND_MS`) rather than every read coming back: said beside the rows. */
  late: number;
  /** The hub → Jita route Jita's sales and purchases are priced on (null: none picked, or no hub), so `PlanInput.freight` uses the same one. */
  freight: Freight | null;
  /** What the live pass ranks again on, said after "Working them out again": Jita's books now, or the hub region's trading history when Jita isn't used. */
  liveSaid: string;
  /** How far the live reads have got (planets-flow.md, step 4's progress): Jita's books, and the hub region's histories still to read. */
  reads: { books: ReadCount; history: ReadCount; hub: string | null };
};

/** A sale's makes: so large that a week's sales are bounded by the market's pace at your share, never by what's made, and a sale doesn't depend on the amount asked for. */
const ANY_MAKES = 1e9;
const NO_HUB_WHY = 'no home hub picked: pick one on the Industry tab';
/** A pace of 0 at Jita: said with the freight minimum only on a route that has one (Brave's Jita ↔ C-J6MT has none). */
const nothingTradedWhy = (f: Freight | null) => (f?.min != null && f.min > 0
  ? 'nothing traded in Jita in the last 14 days, so a freight minimum can’t be spread over its sales'
  : 'nothing traded in Jita in the last 14 days');
const NO_LEG: Leg = { kind: 'none' };
const HERE: Leg = { kind: 'here' };

const unpriced = (place: 'jita' | 'home', why: string): Sale => ({
  place, list: null, listNet: null, bid: null, bidNet: null, pace: null, listPace: null, bidPace: null, split: 0.5, splitFrom: 'even', paceFrom: null, freight: null, brokerKnown: false, why,
});

/**
 * Prices for every planetary good, at Jita and the home hub, for the Planets tab (and nothing else). The morning scan is the
 * baseline for all 83 goods; `live` names the goods the planner shows, whose Jita books are read live (and the hub region's
 * history, for the pace there), as Industry's finder does for its top rows: nothing is read for a good not named.
 *
 * Home is the `industry` doc's hub (its own market's read, else Goonmetrics', as the finder), sold at after your sales tax and
 * the hub's broker fee as typed; Jita is reached by the doc's freight route from the hub (`legFor` on the hub's system), the
 * haul from the planets to the hub being the planner's upkeep, not ISK. Each place's `Sale` is worked out once a good, with the
 * freight minimum spread over a week's sales at your share, so what `sell` and `buy` return keep the planner's contract: a unit
 * never nets more (or costs less) as the amount grows, and nothing is charged per call. No hub, or no route, leaves the home
 * side and Jita with its reason, never a 0.
 */
export function usePlanetMarket(c: IndustryChar, ix: PiIndex | null, opts: { live?: readonly number[]; counted?: boolean } = {}): PlanetMarket {
  const [doc] = useIndustryDoc();
  const scan = useScanCache();
  const { hubs, markets } = useHomeHubs();
  const hub = hubs.find((h) => h.id === doc.hub) ?? null;
  const hubMissing = doc.hub != null && !hub ? markets : null;
  // What the prices close over, keyed on what it holds (the final review's I2): the character is rebuilt on every write to the
  // ledger, and keyed on it the prices, and the planner after them, were worked out again for nothing. The fees and `feeKnown`
  // are numbers and a flag, so equal by value already.
  const own = useStable(c.own), hubOrders = useStable(c.hubOrders);
  const { broker, tax } = c;
  const home = useHomeQuotes(hub, hubOrders);
  const liveTypes = useMemo(() => [...new Set(opts.live ?? [])], [opts.live]);
  // The reads are counted only where the count is shown (`counted`: Plan held to a good), so a page that doesn't show it isn't drawn for each read.
  const { books: liveBooks, settled: booksSettled, late: booksLate, count: booksCount } = useLiveRead(liveTypes, !!opts.counted);
  const { rows: homeHist, settled: histSettled, late: histLate, count: histCount } = useHomeHistoryRead(liveTypes, hub?.region ?? null, !!opts.counted);
  const now = useNow(60_000);
  const cache = scan.state === 'ok' ? scan.value : null;
  const hasScan = !!cache && Object.keys(cache.stats).length > 0;

  const jitaLeg: Leg = useMemo(() => (hub ? legFor({ systemId: hub.systemId }, { nearJita: false, jitaJumps: null }, JITA_SYSTEM, doc.freight) : NO_LEG), [hub, doc.freight]);
  // Read at the time the memo runs, as useFinder does (a ticking clock here would give sell, buy and unit a new identity each minute
  // and the page would plan again for nothing): it only feeds the home history's day-granular rules.
  const noHub = useMemo(() => (hub ? null : homeSaid({ hub: null, home, hubMissing }, Date.now(), homeAgo) ?? NO_HUB_WHY), [hub, home, hubMissing]);

  const fns = useMemo(() => {
    const share = doc.share;
    const now = Date.now();
    const hubFee = hub ? doc.hubFees[hub.id] ?? null : null;
    const flows = new Map<number, ReturnType<typeof watchedFlow>>();
    const marketOf = (t: number): Market => {
      const b = cache?.books[t];
      const l = liveBooks[t];
      if (!flows.has(t)) flows.set(t, watchedFlow(t));
      return {
        jita: l ? othersBook(l, own, t, true) : b ? othersBook(b, own, t, false) : null,
        stats: cache?.stats[t] ?? null, watched: flows.get(t) ?? null,
        home: home.quote(t), homeRead: home.read && !home.unwatched(t) && !home.unread.has(t),
        ...(homeHist[t] ? { homeHist: homeHist[t] } : {}),
      };
    };
    const volume = (t: number) => ix?.byId.get(t)?.volume ?? 0;
    const sales = new Map<number, { jita: Sale; home: Sale; m: Market; bare?: Sale }>();
    const salesOf = (t: number) => {
      let s = sales.get(t);
      if (s) return s;
      const m = marketOf(t);
      let jita = hub ? sellAt('jita', m, { broker, tax, leg: jitaLeg, volume: volume(t), makes: ANY_MAKES, share, now })
        : unpriced('jita', noHub ?? NO_HUB_WHY);
      // A pace of 0 spreads the freight minimum over nothing: unpriced, never priced without it.
      if (hub && jitaLeg.kind === 'route' && jita.pace === 0) jita = unpriced('jita', nothingTradedWhy(jitaLeg.f));
      const homeSale = hub ? sellAt('home', m, { broker: hubFee, tax, leg: HERE, volume: volume(t), makes: ANY_MAKES, share, now, hubName: hub.short })
        : unpriced('home', noHub ?? NO_HUB_WHY);
      s = { jita, home: homeSale, m };
      sales.set(t, s);
      return s;
    };
    const where = hub ? doc.sell : 'jita';
    // Ruling F11: with Sell set to the hub, a good it doesn't price is valued at Jita's: on the freight route, after freight, as
    // Either values Jita; with no route, Jita's own before freight (`bare`), said. Worked out here once, so every reader gets it.
    const route = jitaLeg.kind !== 'none';
    const jitaFor = (t: number): Sale => {
      const s = salesOf(t);
      if (route) return s.jita;
      return (s.bare ??= sellAt('jita', s.m, { broker, tax, leg: HERE, volume: volume(t), makes: ANY_MAKES, share, now }));
    };
    // Sell set to Jita with no freight route: Jita's own prices before freight (the user, 24 October 2026: "i dont care about a freight
    // route being set. when I click on Jita I just want to see the sell prices in Jita so I can compare them vs my corp hub"), said in
    // `said`. Either still needs the route: setting the hub against Jita before the haul would favour Jita by the haul's cost.
    const jitaHere = (t: number): Sale => (hub && where === 'jita' ? jitaFor(t) : salesOf(t).jita);
    const sell: Sell = (t, perDay): Sold => {
      const s = salesOf(t);
      if (hub && where === 'home') return soldAtHome(perDay, { home: s.home, jita: jitaFor(t) }, share, hub.short, route, jitaLeg.kind === 'here');
      return soldOf(perDay, { jita: jitaHere(t), home: s.home }, where, share);
    };
    const unit = (t: number): UnitNet => {
      const s = salesOf(t);
      const at = { home: s.home, jita: jitaHere(t) };
      const nets = (['home', 'jita'] as const).filter((p) => where === 'best' || where === p)
        .map((p) => ({ p, v: Math.max(at[p].listNet ?? -Infinity, at[p].bidNet ?? -Infinity), why: at[p].why }));
      const best = nets.filter((x) => x.v > -Infinity).sort((a, b) => b.v - a.v)[0];
      // The book `marketOf` priced it on: Jita's live one when read, else this morning's scan; at the hub, its quote's source.
      const book: UnitBook | null = !best ? null : best.p === 'jita' ? (liveBooks[t] ? 'now' : 'morning') : s.m.home?.source === 'structure' ? 'hub' : 'goonmetrics';
      if (best) return { isk: best.v, where: best.p, why: null, book };
      // Ruling F11: the hub doesn't price it: Jita's, said.
      if (hub && where === 'home') {
        const j = jitaFor(t), v = Math.max(j.listNet ?? -Infinity, j.bidNet ?? -Infinity);
        if (v > -Infinity) return { isk: v, where: 'jita', why: null, book: liveBooks[t] ? 'now' : 'morning', fallback: { hub: hub.short, list: j.list, route, carried: jitaLeg.kind === 'here', hubWhy: s.home.why } };
        nets.push({ p: 'jita', v, why: j.why ? `Jita: ${j.why}` : null });
      }
      return { isk: null, where: null, why: [...new Set(nets.map((x) => x.why).filter((w): w is string => !!w))].join('; ') || 'no price read' };
    };
    // Each place's offer for a good, as steps cheapest first up to its max (Ruling T11-7), never depending on the amount. Jita
    // (Ruling T11-3): others' listings, a week's need bought up them, held to your share of its day in The Forge (`jitaSteps`), each
    // level with its own freight in on the hub's route (the route's minimum spread over a week at your share), so a unit's cost only
    // rises up the book. The hub: its own read's levels, a week's need up them; or Goonmetrics' best sell, up to a tenth of its
    // weekly movement (HOME_DEPTH). `buy` then fills across the places allowed cheapest first (`boughtOf`), as `soldOf` sells.
    const placesOf = new Map<number, { jita: BuyPlace; home: BuyPlace }>();
    const offerOf = (t: number) => {
      let o = placesOf.get(t);
      if (o) return o;
      const s = salesOf(t);
      const jita: BuyPlace = { place: 'jita', at: 'Jita', steps: [], maxSaid: null, why: null };
      const ask = s.m.jita?.ask ?? null;
      const pace = s.jita.pace;
      if (!hub) jita.why = noHub ?? NO_HUB_WHY;
      else if (!s.m.jita) jita.why = 'No Jita book this morning';
      else if (ask == null) jita.why = 'none listed in Jita';
      else if (jitaLeg.kind === 'none') jita.why = NO_ROUTE_WHY;
      // Buying is held to your share of the day, so a day not known can't be bought on, never bought without a cap.
      else if (pace == null) jita.why = s.jita.why ?? 'No history this morning to say how much trades in Jita';
      else if (!(pace > 0)) jita.why = nothingTradedWhy(jitaLeg.kind === 'route' ? jitaLeg.f : null);
      else {
        const off = jitaSteps(s.m.jita.asks ?? [{ price: ask, volume: Infinity }], pace, share);
        const week = 7 * ((pace * share) / 100);
        const steps = off.steps.map((x) => ({ units: x.units, unit: x.unit + (legCost(jitaLeg, volume(t), x.unit, week) ?? NaN) }));
        if (steps.some((x) => !Number.isFinite(x.unit))) jita.why = NO_ROUTE_WHY;
        else { jita.steps = steps; jita.maxSaid = off.maxSaid; if (!(off.max > 0)) jita.why = `Jita supplies none: ${off.maxSaid}`; }
      }
      const home: BuyPlace = { place: 'home', at: hub?.short ?? 'the hub', steps: [], maxSaid: null, why: null };
      const q = s.m.home;
      if (!hub) home.why = noHub ?? NO_HUB_WHY;
      else if (!q || q.sell == null) home.why = s.home.why ?? `No price at ${hub.short}`;
      else if (q.source === 'structure') {
        const levels = q.sells ?? [];
        const listed = levels.reduce((n, l) => n + l.volume, 0);
        home.steps = levels.map((l) => ({ units: l.volume / 7, unit: l.price }));
        home.maxSaid = `what its best listings hold for a week (${units(listed)} listed)`;
        if (!(listed > 0)) home.why = `too thin to buy a week’s need at ${hub.short}`;
      } else if (q.weekly == null) home.why = `${hub.short}’s weekly movement isn’t known, so its depth can’t be judged`;
      else {
        home.steps = [{ units: q.weekly / (7 * HOME_DEPTH), unit: q.sell }];
        home.maxSaid = `a tenth of its weekly movement, ${units(q.weekly)} a week`;
        if (!(q.weekly > 0)) home.why = `too thin to buy a week’s need at ${hub.short}`;
      }
      o = { jita, home };
      placesOf.set(t, o);
      return o;
    };
    const buy: Buy = (t, perDay) => {
      const o = offerOf(t);
      // Ruling F11b: with Sell at the hub, an input it doesn't sell is bought at Jita's asks with the freight in, wholly, said.
      if (hub && where === 'home') return boughtAtHome(perDay, o, hub.short);
      const places = (['home', 'jita'] as const).filter((p) => where === 'best' || where === p).map((p) => o[p]);
      const b = boughtOf(perDay, places);
      // Bought at Jita alone because the hub supplies none of it (no price there, its depth not known): the hub's reason is kept,
      // so the page can say why. A hub that's only dearer has nothing to say.
      const homeNone = !o.home.steps.some((x) => x.units > 0);
      return b.isk != null && where === 'best' && hub && homeNone && b.where?.length === 1 && b.where[0] === 'jita' ? { ...b, note: o.home.why } : b;
    };
    return { sell, buy, unit };
  }, [doc.share, doc.hubFees, doc.sell, hub, noHub, jitaLeg, cache, liveBooks, homeHist, home, own, broker, tax, ix]);

  // Prices are after the character's fees: skills not read would price at an untrained character's, as Industry's finder waits on.
  const waiting = !c.feeKnown ? (c.isMain ? 'Your skills aren’t read yet: they come with the next sync, and prices are after your fees at them.' : `${c.name}’s skills aren’t read yet (the cloud reads them hourly); prices are after its fees at them.`)
    : scan.state === 'loading' ? 'Reading the market scan held in this browser…'
      : !hasScan ? 'No market scan here yet: the cloud’s comes every morning.'
        : hubMissing?.status === 'loading' ? 'Reading your home markets from the cloud…'
          : hub && home.pending ? `Reading ${hub.short}’s prices from the cloud…` : null;
  const hubSaid = homeSaid({ hub, home, hubMissing }, now, homeAgo);
  const liveCount = Object.keys(liveBooks).length;
  const jitaSource = liveCount > 0 ? 'the planner’s goods on Jita’s books now, the rest on this morning’s' : 'this morning’s Jita books';
  const usesHome = !!hub && doc.sell !== 'jita';
  // Under 'home' nothing sells or is bought at Jita, so nothing is said of it.
  const usesJita = !hub || doc.sell !== 'home';
  const said = waiting ?? (!hub
    ? (hubMissing
      // A hub picked that isn't known here (the cloud's list off, failing, a version behind, or no longer listing it): said in
      // that state's words, as Industry's To do does (`hubWhy`), never "pick one".
      ? `${(hubSaid ?? 'Your home hub isn’t known here.').replace(/\.?$/, '.')} Jita is priced through your home hub’s freight route, so nothing is priced while the hub isn’t known here.`
      : `${(hubSaid ?? 'No home hub picked: pick one on the Industry tab.').replace(/\.?$/, '.')} Jita is priced through the hub’s freight route, so nothing is priced until then.`)
    : [
      usesHome ? hubSaid : null,
      !usesJita ? null
        : jitaLeg.kind === 'route' ? `Jita: ${jitaSource}, reached by ${jitaLeg.name} from ${hub.short}.`
          : jitaLeg.kind === 'none' ? (doc.sell === 'jita'
            ? `Jita: ${jitaSource}, before freight: no freight route between ${hub.short} and Jita is picked on the Industry tab, so the haul isn’t counted, and inputs can’t be bought there.`
            : `No freight route between ${hub.short} and Jita is picked on the Industry tab, so nothing is priced at Jita.`)
            : `Jita: ${jitaSource}.`,
      usesHome && doc.hubFees[hub.id] == null ? `${hub.short}’s broker fee isn’t typed, so home sales are ranked before it.` : null,
      // Ruling F11: what the hub doesn't price is valued at Jita's, and each figure built on it says so.
      !usesJita ? (jitaLeg.kind !== 'none' ? `What ${hub.short} doesn’t price is valued at Jita’s, after ${jitaLeg.kind === 'route' ? jitaLeg.name : 'the carry'}, and what it doesn’t sell is bought at Jita with the freight in; each says so.`
        : `What ${hub.short} doesn’t price is valued at Jita’s before freight (no freight route is picked on the Industry tab), and says so; what it doesn’t sell can’t be bought at Jita without one.`) : null,
    ].filter(Boolean).join(' '));
  return { ...fns, ready: !waiting, said, live: liveCount > 0, settled: booksSettled && histSettled, late: booksLate + histLate, freight: jitaLeg.kind === 'route' ? jitaLeg.f : null,
    liveSaid: usesJita ? 'on Jita’s books now' : `on the trading history of ${hub!.short}’s region`,
    reads: { books: booksCount, history: histCount, hub: hub?.short ?? null } };
}

/** A planet of the chosen system as the planner takes it, with its type's ID and, for a type with no planetary industry (Shattered, Scorched Barren), ESI's name for it. */
export type SystemPlanet = PlanPlanet & { typeId: number; typeName: string | null };
export type SystemPlanets = { system: SystemInfo; planets: SystemPlanet[] };
/** A read that failed: `reload` when it was the radii chunk, which can't be asked for again in the same page (gotchas.md). */
export type SystemState = Loaded<SystemPlanets> | { state: 'failed'; error: string; retry: () => void; reload: true };
type Raw = { system: SystemInfo; planets: { planetId: number; name: string; typeId: number; typeName: string | null }[]; radii: Map<number, number> };
const NO_TAX: Tax = { rate: null, from: 'none', npc: 0, interbus: false };

/**
 * A system's planets for the planner: the system and each planet read publicly from ESI (kept for good, as the universe module
 * keeps them), each one's PI type from the bundle by its type ID (null for Shattered and Scorched Barren, named from ESI so the
 * page can say what it is), its radius from the radii chunk, and its customs tax from the `planets` doc (`customsRate`), worked
 * out again whenever the doc or the character's Customs Code Expertise changes without reading anything again.
 */
export function useSystemPlanets(systemId: number | null, ix: PiIndex | null, cce: number | null): SystemState {
  const doc = useData().planets;
  const [got, setGot] = useState<{ id: number | null; st: { state: 'loading' } | { state: 'ok'; raw: Raw } | { state: 'failed'; error: string; reload: boolean } }>({ id: null, st: { state: 'loading' } });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (systemId == null || !ix) return;
    let alive = true;
    setGot({ id: systemId, st: { state: 'loading' } });
    (async () => {
      let radiiRow: number[] | undefined;
      try { radiiRow = (await loadRadii())[String(systemId)]; } catch {
        if (alive) setGot({ id: systemId, st: { state: 'failed', error: 'the planets’ sizes couldn’t be loaded just now', reload: true } });
        return;
      }
      try {
        const sys = await systemInfo(systemId);
        const planets = await Promise.all(sys.planetIds.map(async (id) => {
          const p = await planetInfo(id);
          const known = planetTypeOf(ix, p.typeId);
          // A type the bundle lacks has no PI: its name only says which it is ("Planet (Shattered)"), so a failed read leaves it unnamed.
          return { planetId: id, name: p.name, typeId: p.typeId, typeName: known ? null : await typeName(p.typeId).catch(() => null) };
        }));
        if (alive) setGot({ id: systemId, st: { state: 'ok', raw: { system: sys, planets, radii: radiusMap(radiiRow) } } });
      } catch (e) {
        if (alive) setGot({ id: systemId, st: { state: 'failed', error: `couldn’t read the system from ESI: ${e instanceof Error ? e.message : String(e)}`, reload: false } });
      }
    })();
    return () => { alive = false; };
  }, [systemId, ix, attempt]);
  const st = got.id === systemId ? got.st : { state: 'loading' as const };
  const raw = st.state === 'ok' ? st.raw : null;
  const value = useMemo((): SystemPlanets | null => {
    if (!raw || !ix) return null;
    const sec = raw.system.security;
    return {
      system: raw.system,
      planets: raw.planets.map((p) => {
        const t = planetTypeOf(ix, p.typeId);
        return { planetId: p.planetId, name: p.name, type: t, typeId: p.typeId, typeName: p.typeName, radiusKm: raw.radii.get(p.planetId) ?? null,
          tax: t ? customsRate(doc, raw.system.systemId, sec, t, p.planetId, cce) : NO_TAX };
      }),
    };
  }, [raw, ix, doc, cce]);
  if (st.state === 'failed') return st.reload ? { state: 'failed', error: st.error, retry: () => void reloadApp(), reload: true } : { state: 'failed', error: st.error, retry: () => setAttempt((n) => n + 1) };
  return value ? { state: 'ok', value } : { state: 'loading' };
}
