import { useMemo, useState } from 'react';
import { iskBig } from '../../lib/format';
import { HOME_STALE_MS, homeQuote, hubOf, type HomeHub } from '../../lib/homeMarket';
import { watchedFlow } from '../../lib/flowStore';
import type { Indexed } from '../../lib/industry';
import {
  bpoWhere, finderBlueprints, LIVE_ROWS, othersBook, rankBuilds, type BpoWhere, type Market, type ProductKind, type Row, type RowInput,
} from '../../lib/industryRank';
import { JITA_SYSTEM, legFor, siteFacts, stationLabel, type SiteFacts } from '../../lib/industrySites';
import { HIGH_SEC, jumpsFrom, type Graph } from '../../lib/jumps';
import type { IndustrySite } from '../../lib/prefs';
import type { IndustryChar } from './industryChars';
import { useAdjusted, useHomeHistory, useHomePrices, useIndices, useIndustryDoc, useLiveBooks, useNpcRow, useScanCache, useStationNames, type HomeState, type Loaded, type NpcState } from './industryMarket';

/**
 * The finder's inputs, gathered once for Build and Start (docs/notes/industry.md): the site, its facts and legs, ESI's
 * indices and adjusted prices, the scan this browser holds, the cloud's NPC row, and live Jita books for the top rows,
 * then every finder blueprint ranked (rankBuilds) first on the morning's books and again with the top LIVE_ROWS' products
 * and materials on live ones (the Loyalty pattern). Reads nothing an earlier state can't use: nothing is ranked until the
 * site, the scan, the indices and the adjusted prices are in, and each says what it's waiting on.
 */
export type FinderView = { kind: ProductKind | 'all'; canBuild: boolean; bpoUpTo: number | null; sort: 'day' | 'unit' | 'payback'; sitesOpen: boolean | null };
export const FINDER_KEY = 'jita-ledger:industry-finder';
const DEFAULT_VIEW: FinderView = { kind: 'all', canBuild: false, bpoUpTo: null, sort: 'day', sitesOpen: null };
const readView = (): FinderView => { try { const v = { ...DEFAULT_VIEW, ...(JSON.parse(localStorage.getItem(FINDER_KEY) ?? '{}') as Partial<FinderView>) }; return FINDER_KINDS.includes(v.kind) ? v : { ...v, kind: 'all' }; } catch { return DEFAULT_VIEW; } };

/** The finder's view, kept per browser: kind, "Can build now", "BPO up to", the sort, and the sites panel open or shut. */
export function useFinderView(): [FinderView, (patch: Partial<FinderView>) => void] {
  const [v, setV] = useState(readView);
  return [v, (patch) => setV((x) => { const n = { ...x, ...patch }; try { localStorage.setItem(FINDER_KEY, JSON.stringify(n)); } catch { /* just not kept */ } return n; })];
}

export type Finder = {
  site: IndustrySite | null; facts: SiteFacts | null;
  /** What it's waiting on, as a sentence; null once rows are ranked. */
  waiting: { text: string; retry?: () => void } | null;
  rows: Row[]; live: boolean;
  /** The inputs the rows were ranked on, `market` the live-merged one once live books are in. */
  input: Omit<RowInput, 'bp'> | null;
  npc: NpcState; bpo: (bp: number) => BpoWhere;
  scan: Loaded<unknown>;
  /** The home hub picked, and its prices from the cloud. */
  hub: HomeHub | null; home: HomeState;
};

export function useFinder(c: IndustryChar, ix: Indexed, graph: Graph): Finder {
  const [doc] = useIndustryDoc();
  const site = doc.sites.find((s) => s.id === doc.site) ?? doc.sites[0] ?? null;
  const indices = useIndices(), adjusted = useAdjusted(), scan = useScanCache(), npc = useNpcRow();
  const jitaHigh = useMemo(() => jumpsFrom(graph, JITA_SYSTEM, (_, sec) => sec >= HIGH_SEC), [graph]);
  const idx = indices.state === 'ok' ? indices.value : null;
  const facts = useMemo(() => (site ? siteFacts(site, graph, jitaHigh, idx) : null), [site, graph, jitaHigh, idx]);
  const cache = scan.state === 'ok' ? scan.value : null;
  const hasScan = !!cache && Object.keys(cache.stats).length > 0;
  // Skills not read are not level 0: an empty or absent doc is waited for, never ranked at.
  const skills = c.pilot.skills && Object.keys(c.pilot.skills).length > 0 ? c.pilot.skills : undefined;
  const hub = hubOf(doc.hub);
  const home = useHomePrices(hub?.id ?? null);
  const prices = hub && home.status === 'ok' ? home.prices : null;

  const input = useMemo((): Omit<RowInput, 'bp'> | null => {
    if (!site || !facts || !facts.index || !cache || !hasScan || adjusted.state !== 'ok' || !skills) return null;
    const flows = new Map<number, ReturnType<typeof watchedFlow>>();
    const market = (t: number): Market => {
      const b = cache.books[t];
      if (!flows.has(t)) flows.set(t, watchedFlow(t));
      return { jita: b ? othersBook(b, c.own, t, false) : null, stats: cache.stats[t] ?? null, watched: flows.get(t) ?? null, home: prices ? homeQuote(prices[t]) : null, homeRead: !!prices };
    };
    return {
      ix, me: doc.assume.me, te: doc.assume.te, skills, clone: c.clone,
      site: { kind: site.kind, rigs: site.rigs, band: facts.band, tax: facts.tax, index: facts.index },
      adjusted: adjusted.value, market, sell: hub ? doc.sell : 'jita', share: doc.share,
      fees: { broker: c.broker, tax: c.tax, hubBroker: hub ? doc.hubFees[hub.id] ?? null : null },
      legs: { jita: legFor(site, facts, JITA_SYSTEM, doc.freight), home: hub ? legFor(site, facts, hub.systemId, doc.freight) : null },
      noShipsToJita: doc.noShipsToJita, jitaJumps: facts.jitaJumps, mines: c.mines, hubName: hub?.short ?? null, now: Date.now(),
    };
  }, [site, facts, cache, hasScan, adjusted, skills, c, ix, doc.assume, doc.share, doc.freight, doc.noShipsToJita, doc.sell, doc.hubFees, hub, prices]);

  const bps = useMemo(() => finderBlueprints(ix), [ix]);
  const first = useMemo(() => (input ? rankBuilds(input, bps) : []), [input, bps]);
  // The top rows' products and materials, read live; ranked again on them.
  const liveTypes = useMemo(() => [...new Set(first.filter((r) => r.day).slice(0, LIVE_ROWS).flatMap((r) => [r.product, ...r.materials.map((m) => m.type)]))], [first]);
  const liveBooks = useLiveBooks(liveTypes);
  // The home region's history for the top rows sold at home: their pace and split, where Goonmetrics' weekly movement stood in.
  const homeTypes = useMemo(() => (hub ? first.filter((r) => r.day && r.sale?.place === 'home').slice(0, LIVE_ROWS).map((r) => r.product) : []), [first, hub]);
  const homeHist = useHomeHistory(homeTypes, hub?.region ?? null);
  // Live Jita books and home histories are told apart: the count line says "on Jita's books now" only for the first.
  const live = Object.keys(liveBooks).length > 0, homeLive = Object.keys(homeHist).length > 0;
  const liveInput = useMemo(() => {
    if (!input || !(live || homeLive)) return input;
    const market = (t: number): Market => {
      const m = input.market(t), b = liveBooks[t];
      return { ...m, ...(b ? { jita: othersBook(b, c.own, t, true) } : {}), ...(homeHist[t] ? { homeHist: homeHist[t] } : {}) };
    };
    return { ...input, market };
  }, [input, live, homeLive, liveBooks, homeHist, c.own]);
  const rows = useMemo(() => (liveInput && (live || homeLive) ? rankBuilds(liveInput, bps) : first), [liveInput, live, homeLive, first, bps]);

  const npcRows = npc.status === 'ok' ? npc.rows : null;
  const bpo = (bp: number) => bpoWhere(npcRows, bp, ix.b.types[bp]?.[4] ?? 0);

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
  return { site, facts, waiting, rows, live, input: liveInput, npc, bpo, scan, hub, home };
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

/** What the home hub's prices are, as a sentence beside the choices (`now` ticks so "read 2 h ago" moves). */
export function homeSaid(f: Pick<Finder, 'hub' | 'home'>, now: number, ago: (iso: string, now: number) => string): string | null {
  const h = f.hub, st = f.home;
  if (!h) return null;
  if (st.status === 'off') return 'Home prices come from the cloud, which isn’t on in this browser (Settings → Your data).';
  if (st.status === 'loading') return `Reading ${h.short}’s prices from the cloud…`;
  if (st.status === 'behind') return 'The cloud is a version behind: home prices come once it’s updated.';
  if (st.status === 'failed') return `Couldn’t read ${h.short}’s prices from the cloud: ${st.error}.`;
  if (st.status === 'switched') return 'Goonmetrics isn’t read: the cloud has it switched off.';
  if (st.status === 'none') return `Not read yet: the cloud reads ${h.short}’s prices from Goonmetrics every six hours.`;
  const old = now - Date.parse(st.at) > HOME_STALE_MS;
  return `${h.short}’s prices: Goonmetrics, read ${ago(st.at, now)}${old ? ': older than a day' : ''}.`;
}
