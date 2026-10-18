import { useEffect, useMemo, useState } from 'react';
import { homeAgo } from '../../lib/homeMarket';
import { useNow } from '../../lib/hooks';
import { fillCost, HOME_DEPTH, legCost, NO_ROUTE_WHY, othersBook, sellAt, type Freight, type Leg, type Market, type Sale } from '../../lib/industryRank';
import { JITA_SYSTEM, legFor } from '../../lib/industrySites';
import { watchedFlow } from '../../lib/flowStore';
import type { Buy, PlanPlanet, Sell, Sold } from '../../lib/piPlan';
import { soldOf } from '../../lib/piPlan';
import { decodeRadii, planetTypeOf, type PiIndex } from '../../lib/piBundle';
import { customsRate, type Tax } from '../../lib/planetsDoc';
import { reloadApp } from '../../lib/reload';
import { useData } from '../../lib/store';
import { planet as planetInfo, system as systemInfo, typeName, type SystemInfo } from '../../lib/universe';
import { loadRadii } from './planetsBundle';
import type { IndustryChar } from './industryChars';
import { homeSaid } from './industryFinder';
import { useHomeHistory, useHomeHubs, useHomeQuotes, useIndustryDoc, useLiveBooks, useScanCache, type Loaded } from './industryMarket';

/** One unit's net at the better place, uncapped (for the chart: `sell(id, 1)` would be capped on a thin P4). */
export type UnitNet = { isk: number | null; where: 'jita' | 'home' | null; why: string | null };
export type PlanetMarket = {
  sell: Sell; buy: Buy; unit: (typeId: number) => UnitNet; ready: boolean; said: string;
  /** Whether any of the goods named in `live` has its Jita book read live yet: the planner ranks again on them only then. */
  live: boolean;
  /** The hub → Jita route Jita's sales and purchases are priced on (null: none picked, or no hub), so `PlanInput.freight` uses the same one. */
  freight: Freight | null;
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
export function usePlanetMarket(c: IndustryChar, ix: PiIndex | null, opts: { live?: readonly number[] } = {}): PlanetMarket {
  const [doc] = useIndustryDoc();
  const scan = useScanCache();
  const { hubs, markets } = useHomeHubs();
  const hub = hubs.find((h) => h.id === doc.hub) ?? null;
  const hubMissing = doc.hub != null && !hub ? markets : null;
  const home = useHomeQuotes(hub, c.hubOrders);
  const liveTypes = useMemo(() => [...new Set(opts.live ?? [])], [opts.live]);
  const liveBooks = useLiveBooks(liveTypes);
  const homeHist = useHomeHistory(liveTypes, hub?.region ?? null);
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
        jita: l ? othersBook(l, c.own, t, true) : b ? othersBook(b, c.own, t, false) : null,
        stats: cache?.stats[t] ?? null, watched: flows.get(t) ?? null,
        home: home.quote(t), homeRead: home.read && !home.unwatched(t) && !home.unread.has(t),
        ...(homeHist[t] ? { homeHist: homeHist[t] } : {}),
      };
    };
    const volume = (t: number) => ix?.byId.get(t)?.volume ?? 0;
    const sales = new Map<number, { jita: Sale; home: Sale; m: Market }>();
    const salesOf = (t: number) => {
      let s = sales.get(t);
      if (s) return s;
      const m = marketOf(t);
      let jita = hub ? sellAt('jita', m, { broker: c.broker, tax: c.tax, leg: jitaLeg, volume: volume(t), makes: ANY_MAKES, share, now })
        : unpriced('jita', noHub ?? NO_HUB_WHY);
      // A pace of 0 spreads the freight minimum over nothing: unpriced, never priced without it.
      if (hub && jitaLeg.kind === 'route' && jita.pace === 0) jita = unpriced('jita', nothingTradedWhy(jitaLeg.f));
      const homeSale = hub ? sellAt('home', m, { broker: hubFee, tax: c.tax, leg: HERE, volume: volume(t), makes: ANY_MAKES, share, now, hubName: hub.short })
        : unpriced('home', noHub ?? NO_HUB_WHY);
      s = { jita, home: homeSale, m };
      sales.set(t, s);
      return s;
    };
    const where = hub ? doc.sell : 'jita';
    const sell: Sell = (t, perDay): Sold => {
      const s = salesOf(t);
      return soldOf(perDay, { jita: s.jita, home: s.home }, where, share);
    };
    const unit = (t: number): UnitNet => {
      const s = salesOf(t);
      const nets = (['home', 'jita'] as const).filter((p) => where === 'best' || where === p)
        .map((p) => ({ p, v: Math.max(s[p].listNet ?? -Infinity, s[p].bidNet ?? -Infinity), why: s[p].why }));
      const best = nets.filter((x) => x.v > -Infinity).sort((a, b) => b.v - a.v)[0];
      if (best) return { isk: best.v, where: best.p, why: null };
      return { isk: null, where: null, why: [...new Set(nets.map((x) => x.why).filter((w): w is string => !!w))].join('; ') || 'no price read' };
    };
    // What a unit costs to buy for `perDay` a day. Jita: its ask plus freight in on the hub's route, the minimum spread over a week of
    // the market's pace at your share (so it never depends on the amount). The hub: its own read's levels walked for a week's need
    // (`fillCost`), or Goonmetrics' best sell where it moves HOME_DEPTH times that need, else too thin. Both only rise with the amount.
    const buyUnit = (t: number, perDay: number): { jita: number | null; jitaWhy: string | null; home: number | null; homeWhy: string | null } => {
      const s = salesOf(t);
      const need = 7 * perDay;
      let jitaP: number | null = null, jitaWhy: string | null = null;
      const ask = s.m.jita?.ask ?? null;
      if (!hub) jitaWhy = noHub ?? NO_HUB_WHY;
      else if (!s.m.jita) jitaWhy = 'No Jita book this morning';
      else if (ask == null) jitaWhy = 'none listed in Jita';
      else if (jitaLeg.kind === 'none') jitaWhy = NO_ROUTE_WHY;
      else if (jitaLeg.kind === 'route' && s.jita.pace == null) jitaWhy = s.jita.why ?? 'No history this morning to say how fast it sells';
      else if (jitaLeg.kind === 'route' && !(s.jita.pace! > 0)) jitaWhy = nothingTradedWhy(jitaLeg.f);
      else {
        const cap = s.jita.pace != null && s.jita.pace > 0 ? (s.jita.pace * share) / 100 : 0;
        const f = legCost(jitaLeg, volume(t), ask, cap > 0 ? 7 * cap : ANY_MAKES);
        if (f == null) jitaWhy = NO_ROUTE_WHY; else jitaP = ask + f;
      }
      let homeP: number | null = null, homeWhy: string | null = null;
      const q = s.m.home;
      if (!hub) homeWhy = noHub ?? NO_HUB_WHY;
      else if (!q || q.sell == null) homeWhy = s.home.why ?? `No price at ${hub.short}`;
      else if (q.source === 'structure') {
        const avg = fillCost(q.sells ?? [], need);
        if (avg == null) homeWhy = `too thin to buy a week’s need at ${hub.short}`; else homeP = avg;
      } else if (q.weekly == null) homeWhy = `${hub.short}’s weekly movement isn’t known, so its depth can’t be judged`;
      else if (q.weekly < HOME_DEPTH * need) homeWhy = `too thin to buy a week’s need at ${hub.short}`;
      else homeP = q.sell;
      return { jita: jitaP, jitaWhy, home: homeP, homeWhy };
    };
    const buy: Buy = (t, perDay) => {
      const u = buyUnit(t, perDay);
      const opts = (['home', 'jita'] as const).filter((p) => where === 'best' || where === p)
        .map((p) => ({ p, v: u[p] })).filter((x): x is { p: 'home' | 'jita'; v: number } => x.v != null).sort((a, b) => a.v - b.v);
      // Bought at Jita because the hub couldn't take it (too thin for a week's need, its depth not known): the hub's reason is kept, so the page can say why.
      if (opts.length) return { isk: opts[0].v * perDay, where: opts[0].p, why: null, note: where === 'best' && opts[0].p === 'jita' && u.home == null && hub ? u.homeWhy : null };
      const why = [...new Set((['home', 'jita'] as const).filter((p) => where === 'best' || where === p).map((p) => u[p === 'jita' ? 'jitaWhy' : 'homeWhy']).filter((w): w is string => !!w))].join('; ');
      return { isk: null, where: null, why: why || 'no price read' };
    };
    return { sell, buy, unit };
  }, [doc.share, doc.hubFees, doc.sell, hub, noHub, jitaLeg, cache, liveBooks, homeHist, home, c, ix]);

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
          : jitaLeg.kind === 'none' ? `No freight route between ${hub.short} and Jita is picked on the Industry tab, so nothing is priced at Jita.`
            : `Jita: ${jitaSource}.`,
      usesHome && doc.hubFees[hub.id] == null ? `${hub.short}’s broker fee isn’t typed, so home sales are ranked before it.` : null,
    ].filter(Boolean).join(' '));
  return { ...fns, ready: !waiting, said, live: liveCount > 0, freight: jitaLeg.kind === 'route' ? jitaLeg.f : null };
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
        if (alive) setGot({ id: systemId, st: { state: 'ok', raw: { system: sys, planets, radii: new Map(radiiRow ? decodeRadii(radiiRow) : []) } } });
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
