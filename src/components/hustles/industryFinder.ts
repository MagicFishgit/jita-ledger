import { useMemo, useState } from 'react';
import { iskBig, units } from '../../lib/format';
import { HOME_STALE_MS, homeAgo, ownMarketSaid, type HomeHub } from '../../lib/homeMarket';
import { watchedFlow } from '../../lib/flowStore';
import type { Indexed } from '../../lib/industry';
import {
  bpoWhere, finderBlueprints, inventionBlueprints, LIVE_ROWS, othersBook, rankBuilds, type BpoWhere, type LabSite, type Market, type ProductKind, type Row, type RowInput,
} from '../../lib/industryRank';
import { type Sale } from '../../lib/industryRank';
import { SPLIT_SAID, type SplitFrom } from '../../lib/split';
import { finderSkills } from '../../lib/industryLadder';
import { JITA_SYSTEM, labFor, legFor, siteFacts, stationLabel, type SiteFacts } from '../../lib/industrySites';
import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
import type { IndustrySite } from '../../lib/prefs';
import type { OwnOrder } from '../../lib/researchTrack';
import type { IndustryChar } from './industryChars';
import { useAdjusted, useHomeHistory, useHomeHubs, useHomeQuotes, useIndices, useIndustryDoc, useLiveBooks, useNpcRow, useScanCache, useStationNames, type HomeSource, type Loaded, type MarketsState, type NpcState } from './industryMarket';

/**
 * The finder's inputs, gathered once for Build and Start (docs/notes/industry.md): the site, its facts and legs, ESI's
 * indices and adjusted prices, the scan this browser holds, the cloud's NPC row, and live Jita books for the top rows,
 * then every finder blueprint ranked (rankBuilds) first on the morning's books and again with the top LIVE_ROWS' products
 * and materials on live ones (the Loyalty pattern). Reads nothing an earlier state can't use: nothing is ranked until the
 * site, the scan, the indices and the adjusted prices are in, and each says what it's waiting on.
 */
export type FinderView = { kind: ProductKind | 'all'; tech: 'all' | 't1' | 't2'; canBuild: boolean; bpoUpTo: number | null; sort: 'day' | 'unit' | 'payback'; sitesOpen: boolean | null };
export const FINDER_KEY = 'jita-ledger:industry-finder';
const DEFAULT_VIEW: FinderView = { kind: 'all', tech: 'all', canBuild: false, bpoUpTo: null, sort: 'day', sitesOpen: null };
const readView = (): FinderView => { try { const v = { ...DEFAULT_VIEW, ...(JSON.parse(localStorage.getItem(FINDER_KEY) ?? '{}') as Partial<FinderView>) }; const w = ['all', 't1', 't2'].includes(v.tech) ? v : { ...v, tech: 'all' as const }; return FINDER_KINDS.includes(w.kind) ? w : { ...w, kind: 'all' as const }; } catch { return DEFAULT_VIEW; } };

/** The finder's view, kept per browser: kind, Tech I or II, "Can build now", "BPO up to", the sort, and the sites panel open or shut. */
export function useFinderView(): [FinderView, (patch: Partial<FinderView>) => void] {
  const [v, setV] = useState(readView);
  return [v, (patch) => setV((x) => { const n = { ...x, ...patch }; try { localStorage.setItem(FINDER_KEY, JSON.stringify(n)); } catch { /* just not kept */ } return n; })];
}

export type Finder = {
  site: IndustrySite | null; facts: SiteFacts | null;
  /** Where research, copying and invention run for the site (labFor), named; null with no site or no Laboratory reachable. */
  lab: { at: string; site: LabSite } | null;
  /** What it's waiting on, as a sentence; null once rows are ranked. */
  waiting: { text: string; retry?: () => void } | null;
  rows: Row[]; live: boolean;
  /** The inputs the rows were ranked on, `market` the live-merged one once live books are in. */
  input: Omit<RowInput, 'bp'> | null;
  npc: NpcState; bpo: (bp: number) => BpoWhere;
  scan: Loaded<unknown>;
  /** The home hub picked (Goonmetrics' or one the cloud reads), every hub the tab knows, what prices the hub, and the cloud's list's state while the hub picked isn't known. */
  hub: HomeHub | null; hubs: HomeHub[]; home: HomeSource; hubMissing: MarketsState | null;
};

/**
 * The finder's rows for the default site. `own`: whose open orders come off the books: the shown character's, or every
 * character's on Blueprints & jobs, where a row is worked out for its own character.
 */
export function useFinder(c: IndustryChar, ix: Indexed, graph: Graph, opts: { own?: OwnOrder[] } = {}): Finder {
  const own = opts.own ?? c.own;
  const [doc] = useIndustryDoc();
  const site = doc.sites.find((s) => s.id === doc.site) ?? doc.sites[0] ?? null;
  const indices = useIndices(), adjusted = useAdjusted(), scan = useScanCache(), npc = useNpcRow();
  const jitaHigh = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC), [graph]);
  const idx = indices.state === 'ok' ? indices.value : null;
  const facts = useMemo(() => (site ? siteFacts(site, graph, jitaHigh, idx) : null), [site, graph, jitaHigh, idx]);
  const lab = useMemo(() => (site && facts ? labFor(site, facts, ix.b.stations, graph, idx) : null), [site, facts, ix, graph, idx]);
  const cache = scan.state === 'ok' ? scan.value : null;
  const hasScan = !!cache && Object.keys(cache.stats).length > 0;
  // Skills not read are not level 0: an empty or absent doc is waited for, never ranked at.
  const skills = finderSkills(c.pilot.skills, c.clone);
  // Goonmetrics' two are always known; a hub you added comes from the cloud's list, asked for always, so Build's select offers every
  // hub you added whichever is picked (held 15 minutes and shared in flight: useHomeQuotes reads the same list).
  const { hubs, markets } = useHomeHubs();
  const hub = hubs.find((h) => h.id === doc.hub) ?? null;
  const hubMissing = doc.hub != null && !hub ? markets : null;
  const home = useHomeQuotes(hub, c.hubOrders);

  const input = useMemo((): Omit<RowInput, 'bp'> | null => {
    if (!site || !facts || !facts.index || !cache || !hasScan || adjusted.state !== 'ok' || !skills) return null;
    const flows = new Map<number, ReturnType<typeof watchedFlow>>();
    const market = (t: number): Market => {
      const b = cache.books[t];
      if (!flows.has(t)) flows.set(t, watchedFlow(t));
      return { jita: b ? othersBook(b, own, t, false) : null, stats: cache.stats[t] ?? null, watched: flows.get(t) ?? null, home: home.quote(t), homeRead: home.read && !home.unwatched(t) && !home.unread.has(t) };
    };
    return {
      ix, me: doc.assume.me, te: doc.assume.te, skills, clone: c.clone,
      site: { kind: site.kind, rigs: site.rigs, band: facts.band, tax: facts.tax, index: facts.index },
      adjusted: adjusted.value, market, sell: hub ? doc.sell : 'jita', share: doc.share,
      fees: { broker: c.broker, tax: c.tax, hubBroker: hub ? doc.hubFees[hub.id] ?? null : null },
      legs: { jita: legFor(site, facts, JITA_SYSTEM, doc.freight), home: hub ? legFor(site, facts, hub.systemId, doc.freight) : null },
      noShipsToJita: doc.noShipsToJita, jitaJumps: facts.jitaJumps, mines: c.mines, hubName: hub?.short ?? null, now: Date.now(),
      lab: lab?.site ?? null,
    };
  }, [site, facts, lab, cache, hasScan, adjusted, skills, c, ix, doc.assume, doc.share, doc.freight, doc.noShipsToJita, doc.sell, doc.hubFees, hub, home]);

  // Tech I and, through invention, Tech II: ranked together.
  const bps = useMemo(() => [...finderBlueprints(ix), ...inventionBlueprints(ix)], [ix]);
  const first = useMemo(() => (input ? rankBuilds(input, bps) : []), [input, bps]);
  // The top rows' products and materials, read live; ranked again on them.
  const liveTypes = useMemo(() => [...new Set(first.filter((r) => r.day).slice(0, LIVE_ROWS).flatMap((r) => [r.product, ...r.materials.map((m) => m.type), ...(r.invention?.datacores.map((d) => d.type) ?? [])]))], [first]);
  const liveBooks = useLiveBooks(liveTypes);
  // The home region's history for the top rows sold at home, and for rows priced there with no pace yet: a hub Goonmetrics doesn't
  // track has no weekly movement, so nothing there had a pace to be ranked by until its history was read (correction 10). The same
  // rescues a type Goonmetrics prices with its weekly movement unknown (its −1), which stage 1 never read the history of either.
  const homeTypes = useMemo(() => {
    if (!hub) return [];
    const sold = first.filter((r) => r.day && r.sale?.place === 'home');
    const fee = doc.hubFees[hub.id] ?? 0;
    // Every row with a home sale priced and unpaced, sold elsewhere or not at all: with Either a row's Jita sale gives it a day, and
    // without its home history read the hub could never win it (Either would pick Jita silently).
    const soldSet = new Set(sold);
    const unpaced = first.filter((r) => r.costUnit != null && !soldSet.has(r))
      .map((r) => ({ r, m: Math.max(-Infinity, ...r.sales.filter((x) => x.place === 'home' && x.paceFrom == null && (x.list ?? x.bid) != null).map((x) => (x.list ?? x.bid)! * (1 - fee) - r.costUnit!)) }))
      .filter((x) => x.m > 0).sort((x, y) => y.m - x.m).map((x) => x.r);
    return [...sold, ...unpaced].slice(0, LIVE_ROWS).map((r) => r.product);
  }, [first, hub, doc.hubFees]);
  const homeHist = useHomeHistory(homeTypes, hub?.region ?? null);
  // Live Jita books and home histories are told apart: the count line says "on Jita's books now" only for the first.
  const live = Object.keys(liveBooks).length > 0, homeLive = Object.keys(homeHist).length > 0;
  const liveInput = useMemo(() => {
    if (!input || !(live || homeLive)) return input;
    const market = (t: number): Market => {
      const m = input.market(t), b = liveBooks[t];
      return { ...m, ...(b ? { jita: othersBook(b, own, t, true) } : {}), ...(homeHist[t] ? { homeHist: homeHist[t] } : {}) };
    };
    return { ...input, market };
  }, [input, live, homeLive, liveBooks, homeHist, own]);
  const rows = useMemo(() => (liveInput && (live || homeLive) ? rankBuilds(liveInput, bps) : first), [liveInput, live, homeLive, first, bps]);

  const npcRows = npc.status === 'ok' ? npc.rows : null;
  // A Tech II row's original is the Tech I one its copies are made from.
  const bpo = (bp: number) => { const o = ix.inventedFrom.get(bp) ?? bp; return bpoWhere(npcRows, o, ix.b.types[o]?.[4] ?? 0); };

  const waiting = !site ? { text: 'Pick where you build first: add a site under Where you build, below.' }
    : !skills || !c.feeKnown ? { text: c.isMain ? 'Your skills aren’t read yet: they come with the next sync, and the finder works at them.' : `${c.name}’s skills aren’t read yet (the cloud reads them hourly); the finder works at them.` }
      : scan.state === 'loading' ? { text: 'Reading the market scan held in this browser…' }
        : !hasScan ? { text: 'No market scan here yet: the cloud’s comes every morning.' }
          : indices.state === 'loading' ? { text: 'Reading the industry indices…' }
            : indices.state === 'failed' ? { text: 'Couldn’t read ESI’s industry indices just now, so no job can be costed.', retry: indices.retry }
              : facts && !facts.index ? { text: facts.indexWhy ?? 'ESI lists no industry index for this system.' }
                : adjusted.state === 'loading' ? { text: 'Reading CCP’s adjusted prices…' }
                  : adjusted.state === 'failed' ? { text: 'Couldn’t read CCP’s adjusted prices just now, so no job can be costed.', retry: adjusted.retry }
                    : null;
  return { site, facts, lab, waiting, rows, live, input: liveInput, npc, bpo, scan, hub, hubs, home, hubMissing };
}

/**
 * The finder's kinds, short, for a row's line. The ship sizes follow the static data's rig filters (industry.json `filters` 5 to
 * 10, the groups each holds), not the hull's name: a Retriever is a mining barge, so a Medium ship; the Orca is an industrial
 * command ship, so Large.
 */
export const KIND_LABEL: Record<ProductKind | 'all', string> = {
  all: 'Everything', rigs: 'Rigs', modules: 'Modules', charges: 'Ammo and charges', components: 'Components', drones: 'Drones and fighters',
  deployables: 'Deployables', 'hulls-small': 'Small ships', 'hulls-medium': 'Medium ships', 'hulls-large': 'Large ships',
  'hulls-other': 'Other ships', fuel: 'Fuel blocks', structures: 'Structures', 'capital-parts': 'Capital parts', capital: 'Capitals', other: 'Other',
};
/** The same as the choice lists them, a ship size with the groups it holds. */
export const KIND_CHOICE: Record<ProductKind | 'all', string> = {
  ...KIND_LABEL,
  'hulls-small': 'Small ships: frigates, destroyers, shuttles', 'hulls-medium': 'Medium ships: cruisers, battlecruisers, haulers, barges',
  'hulls-large': 'Large ships: battleships, freighters, the Orca',
};
// 'hulls-other' is left out: every ship in the bundle sits in a size's groups or is a Titan or supercarrier (Capitals).
export const FINDER_KINDS: (ProductKind | 'all')[] = ['all', 'rigs', 'modules', 'charges', 'components', 'drones', 'deployables', 'hulls-small', 'hulls-medium', 'hulls-large', 'fuel', 'structures', 'capital-parts', 'other'];

/**
 * A count a day, said so a fraction doesn't read as noise: from one a day the count, under it as time between ("about one
 * every 2 days"). Tech II ships make it common (a two-day build at 26% a try is half a hull a day, and sells that way).
 */
export function everyDays(n: number): string {
  if (!(n > 0)) return 'none';
  const d = Math.round(1 / n);
  return d <= 1 ? 'about one a day' : `about one every ${units(d)} days`;
}
/** A count a day for a cell: "6", or "<1" under one a day (its time between is `everyDays`'). */
export const perDayCell = (n: number): string => (n >= 1 ? units(n) : '<1');
/** A count a day in a sentence: "6 a day", "about one every 2 days". */
export const aDaySaid = (n: number): string => (n >= 1 ? `${units(n)} a day` : everyDays(n));

/** What the BPO's column says: NPCs' price and where, or why there isn't one. */
export function bpoSaid(w: BpoWhere, npc: NpcState, station: (id: number) => string): { v: string; n: string } {
  if (w.state === 'forge') return { v: iskBig(w.price), n: `at ${station(w.stations[0])}${w.stations.length > 1 ? ` (and ${w.stations.length - 1} more)` : ''}` };
  if (w.state === 'notForge') return { v: '–', n: `NPCs don’t sell it in The Forge${w.base != null ? `; CCP’s base price ${iskBig(w.base)}` : ''}` };
  if (w.state === 'unknown') return { v: '–', n: `No NPC seller found (this morning’s read missed ${w.missed} page${w.missed === 1 ? '' : 's'})${w.base != null ? `; base price ${iskBig(w.base)}` : ''}` };
  if (npc.status === 'off') return { v: '–', n: 'NPC sellers come from the cloud’s morning scan, which isn’t on in this browser' };
  if (npc.status === 'loading') return { v: '…', n: 'Reading NPC sellers from the cloud…' };
  if (npc.status === 'behind') return { v: '–', n: 'The cloud is a version behind: NPC sellers come once it’s updated' };
  if (npc.status === 'failed') return { v: '–', n: `Couldn’t read NPC sellers from the cloud: ${npc.error}` };
  return { v: '–', n: 'The cloud hasn’t run a morning scan since it began keeping NPC sellers' };
}


/**
 * An NPC station's name for a sentence, said one way everywhere (Build's rows, the detail, the regions): its name once read;
 * "A station in <system>" when ESI gave none (null); the system's name alone while the name is still being read; never
 * "Station #…". `system` is the station's system when the caller knows it (a station in another region), else the bundle's.
 */
export function stationSaid(names: Record<number, string | null>, id: number, system: string | null): string {
  const n = names[id];
  if (typeof n === 'string' && n.trim()) return n;
  if (n === null) return system ? stationLabel(null, system) : 'A station';
  return system ?? '…';
}
/** `stationSaid` for stations of the bundle (the system comes from its station row and the map): the names read for `ids`. */
export function useStationSaid(ids: readonly number[], ix: Indexed, graph: Graph): (id: number, systemId?: number) => string {
  const names = useStationNames(ids);
  const systemOf = useMemo(() => new Map(ix.b.stations.map((s) => [s[0], s[1]] as const)), [ix]);
  return (id, systemId) => { const sys = systemId ?? systemOf.get(id); return stationSaid(names, id, sys != null ? graph[sys]?.[1] ?? null : null); };
}

/**
 * What prices the home hub, as a sentence beside the choices (`now` ticks so "read 2 h ago" moves): its own market's fresh read; else
 * Goonmetrics' with its time and, after it, what its own market's read says (correction 7, Review Focus 2 and 3); a hub Goonmetrics
 * doesn't track with no fresh read prices nothing, said; a hub picked that the cloud's list hasn't given yet says why.
 */
export function homeSaid(f: Pick<Finder, 'hub' | 'home' | 'hubMissing'>, now: number, ago: (iso: string, now: number) => string, o: { own?: boolean; loginHolds?: boolean } = {}): string | null {
  // `own: false` (To do): only which price speaks and its age; a refused or unreadable own market is said on the Industry tab alone (Ruling 1).
  const withOwn = o.own !== false;
  const h = f.hub, st = f.home;
  if (!h) {
    const m = f.hubMissing;
    if (!m) return null;
    return m.status === 'loading' ? 'Reading your home markets from the cloud…'
      : m.status === 'off' ? 'Your home hub is one the cloud reads, which isn’t on in this browser (Settings → Your data).'
        : m.status === 'behind' ? 'The cloud is a version behind: your home hub comes once it’s updated.'
          : m.status === 'failed' ? `Couldn’t read your home markets from the cloud: ${m.error}.`
            : 'Your home hub isn’t one the cloud reads any more: pick another on the Industry tab, or add it again under Home markets.';
  }
  if (st.pending) return `Reading ${h.short}’s prices from the cloud…`;
  // The list of items its read holds couldn't load (a failed chunk, never retried in place): Build offers a reload.
  const itemsLost = st.itemsFailed ? `${h.short}’s own market can’t be used: the list of items it holds couldn’t be loaded. ` : '';
  if (st.itemsFailed && !h.goonmetrics) return itemsLost.trim();
  if (st.speaks?.source === 'structure') return `${h.short}’s prices: its own market, read ${homeAgo(st.speaks.at, now)}.`;
  const hb = st.hub && !st.hub.off ? st.hub : null;
  const ownSaid = (gm: boolean | 'tracked') => (withOwn && hb ? ` ${ownMarketSaid(hb, now, gm, o.loginHolds)}` : '');
  if (!h.goonmetrics) {
    const b = st.book;
    if (b.status === 'off') return `${h.short}’s prices come from the cloud, which isn’t on in this browser (Settings → Your data).`;
    if (b.status === 'loading') return `Reading ${h.short}’s own market from the cloud…`;
    if (b.status === 'behind') return `The cloud is a version behind: ${h.short}’s own market comes once it’s updated.`;
    if (b.status === 'failed') return `Couldn’t read ${h.short}’s own market from the cloud: ${b.error}.`;
    // Its own refusal already says Goonmetrics doesn't track it.
    // ownMarketSaid says "Goonmetrics doesn't track it" only on its refusal branch: a login that can read, by the read's own reader.
    const refused = withOwn && !!hb?.book?.refusedAt && hb.login === 'ok' && hb.book.reader === hb.reader;
    return `${h.short} isn’t priced: ${refused ? '' : 'Goonmetrics doesn’t track it, and '}its own market has no read under two hours old.${ownSaid(false)}`;
  }
  const gm = st.gm;
  if (gm.status === 'off') return 'Home prices come from the cloud, which isn’t on in this browser (Settings → Your data).';
  if (gm.status === 'loading') return `Reading ${h.short}’s prices from the cloud…`;
  if (gm.status === 'behind') return 'The cloud is a version behind: home prices come once it’s updated.';
  if (gm.status === 'failed') return `Couldn’t read ${h.short}’s prices from the cloud: ${gm.error}.${ownSaid('tracked')}`;
  if (gm.status === 'switched') return `Goonmetrics isn’t read: the cloud has it switched off.${ownSaid('tracked')}`;
  if (gm.status === 'none') return `Not read yet: the cloud reads ${h.short}’s prices from Goonmetrics every six hours.${ownSaid('tracked')}`;
  if (gm.status !== 'ok') return null;
  const old = now - Date.parse(gm.at) > HOME_STALE_MS;
  const head = `${itemsLost}${h.short}’s prices: Goonmetrics, read ${ago(gm.at, now)}${old ? ': older than a day' : ''}.`;
  if (!withOwn) return head;
  // Why its own market isn't the one speaking (Review Focus 3): never the same words as one that still speaks. "That read" only
  // where the sentence before names a read; a login that can't read, or a read by another reader, says it whole.
  const plain = hb?.login === 'ok' && !!hb.book?.at && hb.book.reader === hb.reader && !hb.book.error && !hb.book.refusedAt;
  // A read that can't be used for want of its item list is fresh: the head already says why Goonmetrics speaks.
  const stale = st.book.status !== 'ok' || st.hub?.off || st.itemsFailed ? '' : plain ? ' That read is over two hours old, so Goonmetrics’ prices speak.'
    : !st.hub || (hb && hb.login !== 'ok' && hb.book?.at) ? ' Its own market’s last read is over two hours old, so Goonmetrics’ prices speak.' : '';
  // The list says it was read, but this browser couldn't fetch the read: say why Goonmetrics speaks.
  const fetchFailed = st.book.status === 'failed' && !st.hub?.off ? ` Its own market’s read couldn’t be fetched from the cloud just now (${st.book.error}), so Goonmetrics’ prices speak.` : '';
  return `${head}${ownSaid(true)}${fetchFailed}${stale}`;
}

/** Where a home sale's prices come from, for a row and the count line. */
export const homeFromSaid = (home: HomeSource): string => (home.speaks?.source === 'structure' ? 'its own market' : 'Goonmetrics’ prices');

/** How a home sale's pace and split were worked out, for the detail: Goonmetrics' weekly movement or the region's history, split by the hub's own book where it could tell. */
export function homePaceSaid(s: Sale, hubName: string): string {
  const book = `what the orders in ${hubName}’s market have sold`;
  if (s.paceFrom === 'goonmetrics') return s.splitFrom === 'book' ? `Goonmetrics’ weekly movement ÷ 7, split by ${book}, until the home history is read` : 'Goonmetrics’ weekly movement ÷ 7, at an even split, until the home history is read';
  return s.splitFrom === 'book' ? `the home region’s history, split by ${book}` : SPLIT_SAID[s.splitFrom as SplitFrom];
}
