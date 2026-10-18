import { useMemo } from 'react';
import { homeAgo } from '../../lib/homeMarket';
import { useNow } from '../../lib/hooks';
import { legCost, NO_ROUTE_WHY, othersBook, sellAt, type Leg, type Market, type Sale } from '../../lib/industryRank';
import { JITA_SYSTEM, legFor } from '../../lib/industrySites';
import { watchedFlow } from '../../lib/flowStore';
import type { Buy, Sell, Sold } from '../../lib/piPlan';
import { soldOf } from '../../lib/piPlan';
import type { PiIndex } from '../../lib/piBundle';
import type { IndustryChar } from './industryChars';
import { homeSaid } from './industryFinder';
import { useHomeHistory, useHomeHubs, useHomeQuotes, useIndustryDoc, useLiveBooks, useScanCache } from './industryMarket';

/** One unit's net at the better place, uncapped (for the chart: `sell(id, 1)` would be capped on a thin P4). */
export type UnitNet = { isk: number | null; where: 'jita' | 'home' | null; why: string | null };
export type PlanetMarket = { sell: Sell; buy: Buy; unit: (typeId: number) => UnitNet; ready: boolean; said: string };

/** A sale's makes: so large that a week's sales are bounded by the market's pace at your share, never by what's made, and a sale doesn't depend on the amount asked for. */
const ANY_MAKES = 1e9;
const NO_HUB_WHY = 'no home hub picked: pick one on the Industry tab';
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

  const noHub = useMemo(() => {
    if (hub) return null;
    return homeSaid({ hub: null, home, hubMissing }, now, homeAgo) ?? NO_HUB_WHY;
  }, [hub, home, hubMissing, now]);

  const fns = useMemo(() => {
    const share = doc.share;
    const jitaLeg: Leg = hub ? legFor({ systemId: hub.systemId }, { nearJita: false, jitaJumps: null }, JITA_SYSTEM, doc.freight) : NO_LEG;
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
      const jita = hub ? sellAt('jita', m, { broker: c.broker, tax: c.tax, leg: jitaLeg, volume: volume(t), makes: ANY_MAKES, share, now })
        : unpriced('jita', noHub ?? NO_HUB_WHY);
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
    // A unit bought: Jita's ask plus freight in on the hub's route (its minimum spread over a week at your share of the pace, so it
    // never depends on the amount), or the hub's sell.
    const buyUnit = (t: number): { jita: number | null; jitaWhy: string | null; home: number | null; homeWhy: string | null } => {
      const s = salesOf(t);
      let jitaP: number | null = null, jitaWhy: string | null = null;
      const ask = s.m.jita?.ask ?? null;
      if (!hub) jitaWhy = noHub ?? NO_HUB_WHY;
      else if (!s.m.jita) jitaWhy = 'No Jita book this morning';
      else if (ask == null) jitaWhy = 'none listed in Jita';
      else {
        const cap = s.jita.pace != null && s.jita.pace > 0 ? (s.jita.pace * share) / 100 : 0;
        const f = legCost(jitaLeg, volume(t), ask, cap > 0 ? 7 * cap : ANY_MAKES);
        if (f == null) jitaWhy = NO_ROUTE_WHY; else jitaP = ask + f;
      }
      let homeP: number | null = null, homeWhy: string | null = null;
      if (!hub) homeWhy = noHub ?? NO_HUB_WHY;
      else if (s.m.home?.sell != null) homeP = s.m.home.sell;
      else homeWhy = s.home.why ?? `No price at ${hub.short}`;
      return { jita: jitaP, jitaWhy, home: homeP, homeWhy };
    };
    const buy: Buy = (t, perDay) => {
      const u = buyUnit(t);
      const opts = (['home', 'jita'] as const).filter((p) => where === 'best' || where === p)
        .map((p) => ({ p, v: u[p] })).filter((x): x is { p: 'home' | 'jita'; v: number } => x.v != null).sort((a, b) => a.v - b.v);
      if (opts.length) return { isk: opts[0].v * perDay, where: opts[0].p, why: null };
      const why = [...new Set((['home', 'jita'] as const).filter((p) => where === 'best' || where === p).map((p) => u[p === 'jita' ? 'jitaWhy' : 'homeWhy']).filter((w): w is string => !!w))].join('; ');
      return { isk: null, where: null, why: why || 'no price read' };
    };
    return { sell, buy, unit };
  }, [doc.share, doc.freight, doc.hubFees, doc.sell, hub, noHub, cache, liveBooks, homeHist, home, c, ix, now]);

  const waiting = scan.state === 'loading' ? 'Reading the market scan held in this browser…'
    : !hasScan ? 'No market scan here yet: the cloud’s comes every morning.'
      : hub && home.pending ? `Reading ${hub.short}’s prices from the cloud…` : null;
  const hubSaid = homeSaid({ hub, home, hubMissing }, now, homeAgo);
  const said = waiting ?? [
    hub ? hubSaid : (hubSaid ?? NO_HUB_WHY),
    hub && doc.hubFees[hub.id] == null ? `${hub.short}’s broker fee isn’t typed, so home sales are ranked before it.` : null,
    hub ? `Jita is reached by the freight route from ${hub.short} on the Industry tab.` : null,
  ].filter(Boolean).join(' ');
  return { ...fns, ready: !waiting, said };
}
