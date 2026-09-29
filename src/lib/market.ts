import { get, set } from 'idb-keyval';
import { esi, esiAllPages } from './esi';
import { GLOBAL_PLEX_MARKET, JITA_44, PLEX_TYPE, THE_FORGE } from './config';
import { cacheStore } from './store';
import { buyerShare, soldFrom, tradingSplit, type BookSold } from './split';
import { loadFlow, recordRead, watchedFlow } from './flowStore';
import type { BookLevel, HistRow, MarketSnap } from './types';
import type { LpOffer } from './loyalty';
import type { PlanetHead, RawColony } from './colony';
import { paceDay, recentAverages } from './prospects';

type IdsResponse = {
  inventory_types?: { id: number; name: string }[];
  factions?: { id: number; name: string }[];
  corporations?: { id: number; name: string }[];
  systems?: { id: number; name: string }[];
  stations?: { id: number; name: string }[];
};

/** Exact item name, as shown in game, to its type ID. */
export async function resolveType(name: string): Promise<{ id: number; name: string } | null> {
  const clean = name.trim();
  if (!clean) return null;
  const { data } = await esi<IdsResponse>('/universe/ids/', { method: 'POST', body: [clean] });
  const t = data.inventory_types?.[0];
  return t ? { id: t.id, name: t.name } : null;
}

export async function resolveIds(names: string[]): Promise<IdsResponse> {
  const { data } = await esi<IdsResponse>('/universe/ids/', { method: 'POST', body: names });
  return data;
}

export async function resolveNames(ids: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  const uniq = [...new Set(ids)].filter((n) => Number.isFinite(n) && n > 0);
  for (let i = 0; i < uniq.length; i += 1000) {
    const { data } = await esi<{ id: number; name: string }[]>('/universe/names/', { method: 'POST', body: uniq.slice(i, i + 1000) });
    data.forEach((d) => (out[d.id] = d.name));
  }
  return out;
}

type RawMarketOrder = { order_id: number; is_buy_order: boolean; price: number; volume_remain: number; volume_total?: number; location_id: number; duration?: number };

/**
 * NPC market orders run for 365 days; a player's run for 90 at most. So an item NPCs sell shows itself
 * in the book, with no list of such items to keep up to date. Checked on Raven Blueprint, which NPCs
 * sell at a fixed price.
 */
export const NPC_DURATION = 365;

function levels(orders: RawMarketOrder[], n: number): BookLevel[] {
  const out: BookLevel[] = [];
  for (const o of orders) {
    const last = out[out.length - 1];
    if (last && last.price === o.price) last.volume += o.volume_remain;
    else if (out.length < n) out.push({ price: o.price, volume: o.volume_remain });
    else break;
  }
  return out;
}

/** PLEX has one global market; everything else is read from The Forge and filtered to Jita 4-4. */
const regionFor = (typeId: number) => (typeId === PLEX_TYPE ? GLOBAL_PLEX_MARKET : THE_FORGE);
/**
 * Whether an order at this location is one Jita Ledger can reason about. PLEX is the exception:
 * it trades on a single market for the whole game rather than in a station.
 */
export const tradedAtJita = (typeId: number, locationId: number) => typeId === PLEX_TYPE || locationId === JITA_44;
const atJita = tradedAtJita;

/** One order in the book, with its ID, so you can tell your own from the competition. */
export type { OrderLite } from './flow';
import type { OrderLite } from './flow';

// Raw orders are kept beside the summary rather than in it: MarketSnap gets persisted to
// IndexedDB by the watchlist and the scan, and this list is far too big to store per item.
const bookCache = new Map<number, { at: number; expires: number | null; stamp: number | null; partial: boolean; snap: Omit<MarketSnap, 'avgVol7' | 'avgPrice7'>; raw: OrderLite[] }>();

/** Jita 4-4 order book only (The Forge region data, filtered to the station). ESI caches this for 5 minutes. */
export async function jitaBook(typeId: number, force = false) {
  return (await readBook(typeId, force)).snap;
}

/**
 * Every live order for an item at Jita 4-4, with the moment ESI will have anything new.
 *
 * ESI caches this route for five minutes, so a relist made in game is not visible before then --- no
 * amount of re-checking changes that, and the expiry is what lets the page say so instead of looking
 * broken.
 */
export async function jitaOrders(typeId: number, force = false): Promise<{ orders: OrderLite[]; expires: number | null; sold: BookSold | undefined }> {
  const e = await readBook(typeId, force);
  return { orders: e.raw, expires: e.expires, sold: e.snap.sold };
}

/**
 * A book read is kept until ESI says it has a newer one, not for five minutes from when we read it: the
 * copy we got may already have been minutes old, and holding it a full five more put a relist made in
 * game up to ten minutes behind. Kept at least BOOK_MIN, so an Expires already past can't make every
 * read a request, and never past BOOK_MAX.
 */
const BOOK_MIN = 30_000;
const BOOK_MAX = 5 * 60_000;
const bookFresh = (hit: { at: number; expires: number | null }, now = Date.now()) =>
  now < Math.min(hit.at + BOOK_MAX, Math.max(hit.at + BOOK_MIN, hit.expires ?? hit.at + BOOK_MAX));

async function readBook(typeId: number, force: boolean) {
  const hit = bookCache.get(typeId);
  if (!force && hit && bookFresh(hit)) return hit;
  // A forced read is someone asking again on purpose, so go past the browser's copy of it.
  const { orders, expires, stamp, partial } = await fetchBook(typeId, force);
  const here = orders.filter((o) => atJita(typeId, o.location_id));
  const buys = here.filter((o) => o.is_buy_order).sort((a, b) => b.price - a.price);
  const sells = here.filter((o) => !o.is_buy_order).sort((a, b) => a.price - b.price);
  const snap = {
    typeId,
    fetchedAt: new Date().toISOString(),
    bestBuy: buys[0]?.price ?? null,
    bestSell: sells[0]?.price ?? null,
    buyOrders: buys.length,
    sellOrders: sells.length,
    topBuys: levels(buys, 7),
    topSells: levels(sells, 7),
    npcSell: sells.some((o) => (o.duration ?? 0) >= NPC_DURATION),
    sold: soldFrom(here),
  };
  const raw: OrderLite[] = here.map((o) => ({ id: o.order_id, isBuy: o.is_buy_order, price: o.price, volume: o.volume_remain }));
  const entry = { at: Date.now(), expires, stamp, partial, snap, raw };
  // Read this book before in this session? What changed since is who traded, whichever page asked.
  if (hit && !hit.partial && !partial) recordRead(typeId, { raw: hit.raw, stamp: hit.stamp }, { raw, stamp });
  bookCache.set(typeId, entry);
  return entry;
}

/**
 * Opens an item's market window in the running EVE client.
 *
 * This is the only market thing ESI will do for you: it cannot place, change or cancel an order,
 * so the most a tool can legitimately do is put the right window in front of you.
 */
export async function openMarketWindow(typeId: number): Promise<void> {
  await esi<void>('/ui/openwindow/marketdetails/', { auth: true, method: 'POST', query: { type_id: typeId } });
}

/** Opens a contract's window in the running EVE client (the only contract thing ESI does). */
export async function openContractWindow(contractId: number): Promise<void> {
  await esi<void>('/ui/openwindow/contract/', { auth: true, method: 'POST', query: { contract_id: contractId } });
}

/**
 * Make a station, structure or solar system your autopilot destination in the client, replacing any
 * route already set. It plots the route; it doesn't fly anything.
 */
export async function setDestination(destinationId: number): Promise<void> {
  await esi<void>('/ui/autopilot/waypoint/', {
    auth: true, method: 'POST',
    query: { add_to_beginning: 'false', clear_other_waypoints: 'true', destination_id: destinationId },
  });
}

/** Reads every page of an item's book, keeping the first page's expiry. */
async function fetchBook(typeId: number, fresh: boolean) {
  const path = `/markets/${regionFor(typeId)}/orders/`;
  const query = { order_type: 'all', type_id: typeId };
  const first = await esi<RawMarketOrder[]>(path, { query: { ...query, page: 1 }, fresh });
  const orders = [...first.data];
  const pages = Math.min(first.pages ?? 1, 20);
  // A page that fails is left out here, but the read is marked partial: its orders would otherwise look
  // like orders that had just been bought out.
  let partial = (first.pages ?? 1) > pages;
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        esi<RawMarketOrder[]>(path, { query: { ...query, page: i + 2 }, fresh })
          .then((r) => r.data)
          .catch(() => { partial = true; return [] as RawMarketOrder[]; })),
    );
    rest.forEach((r) => orders.push(...r));
  }
  return { orders, expires: first.expires, stamp: first.stamp, partial };
}

/** Daily history for the whole of The Forge (most of it is Jita). Cached for 3 hours. */
export async function marketHistory(typeId: number): Promise<HistRow[]> {
  return regionHistory(typeId, regionFor(typeId));
}

/** Daily history for an item in any region. Cached for 3 hours: ESI only adds a day at a time. */
export async function regionHistory(typeId: number, regionId: number): Promise<HistRow[]> {
  const key = regionId === THE_FORGE || regionId === GLOBAL_PLEX_MARKET ? `hist:${typeId}` : `hist:${regionId}:${typeId}`;
  const cached = (await get(key, cacheStore)) as { at: number; rows: HistRow[] } | undefined;
  if (cached && Date.now() - cached.at < 3 * 3600_000) return cached.rows;
  const { data } = await esi<HistRow[]>(`/markets/${regionId}/history/`, { query: { type_id: typeId } });
  const rows = [...data].sort((a, b) => a.date.localeCompare(b.date));
  await set(key, { at: Date.now(), rows }, cacheStore).catch(() => undefined);
  return rows;
}

/** One station's book in another region: another trade hub, for comparing against Jita. */
export async function stationBook(typeId: number, regionId: number, stationId: number, fresh = false) {
  const path = `/markets/${regionId}/orders/`;
  const first = await esi<RawMarketOrder[]>(path, { query: { order_type: 'all', type_id: typeId, page: 1 }, fresh });
  const orders = [...first.data];
  const pages = Math.min(first.pages ?? 1, 10);
  // A page that fails is not left out: half a book would present its best price as the best price.
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) =>
    esi<RawMarketOrder[]>(path, { query: { order_type: 'all', type_id: typeId, page: i + 2 }, fresh }).then((r) => r.data)));
  for (const page of rest) orders.push(...page);
  const here = orders.filter((o) => o.location_id === stationId);
  const buys = here.filter((o) => o.is_buy_order).sort((a, b) => b.price - a.price);
  const sells = here.filter((o) => !o.is_buy_order).sort((a, b) => a.price - b.price);
  return {
    bestBuy: buys[0]?.price ?? null, bestSell: sells[0]?.price ?? null,
    buyOrders: buys.length, sellOrders: sells.length,
    topBuys: levels(buys, 5), topSells: levels(sells, 5),
    sold: soldFrom(here),
  };
}

/** A skill's rank and training attributes, from its dogma. Static, so kept for good. */
/**
 * A skill's rank and attributes (for training time) and the skills it needs first: dogma 182–184 name them and 277–279
 * their levels (Tycoon: Wholesale V, Marketing IV; Scrapmetal Processing: Reprocessing Efficiency V, Metallurgy V).
 */
export async function skillDogma(typeId: number): Promise<{ rank: number; primary: number; secondary: number; req: [number, number][] } | null> {
  // "2": entries cached before the prerequisites were kept lack them.
  const key = `skill-dogma2:${typeId}`;
  const hit = (await get(key, cacheStore).catch(() => undefined)) as { rank: number; primary: number; secondary: number; req: [number, number][] } | undefined;
  if (hit) return hit;
  const { data } = await esi<{ dogma_attributes?: { attribute_id: number; value: number }[] }>(`/universe/types/${typeId}/`);
  const a = (id: number) => data.dogma_attributes?.find((x) => x.attribute_id === id)?.value;
  const rank = a(275), primary = a(180), secondary = a(181);
  if (rank == null || primary == null || secondary == null) return null;
  const req = ([[182, 277], [183, 278], [184, 279]] as const).map(([s, l]) => [a(s), a(l)] as const)
    .filter((x): x is readonly [number, number] => x[0] != null && x[1] != null).map(([s, l]) => [s, l] as [number, number]);
  const out = { rank, primary, secondary, req };
  await set(key, out, cacheStore).catch(() => undefined);
  return out;
}

// Lives with the other pure history rules so it can be tested; re-exported for existing callers.
export { recentAverages };

export async function snapshot(typeId: number, force = false): Promise<MarketSnap> {
  const [book, hist] = await Promise.all([jitaBook(typeId, force), marketHistory(typeId), loadFlow()]);
  const { avgVol, avgPrice } = recentAverages(hist, 7);
  const typical = paceDay(hist);
  const split = tradingSplit({ history: buyerShare(hist.slice(-30)), book: book.sold, watched: watchedFlow(typeId), typicalDay: typical });
  return { ...book, avgVol7: avgVol, avgPrice7: avgPrice, typicalVol: typical, buyerShare: split.share, splitFrom: split.from, watchedH: split.watchedH };
}

type RawOffer = {
  offer_id: number; type_id: number; quantity: number;
  lp_cost: number; isk_cost: number;
  required_items?: { type_id: number; quantity: number }[];
};

/** Everything a corporation's loyalty store will trade you. Public: no login needed to browse. */
export async function loyaltyOffers(corporationId: number): Promise<LpOffer[]> {
  const { data } = await esi<RawOffer[]>(`/loyalty/stores/${corporationId}/offers/`);
  return data.map((o) => ({
    offerId: o.offer_id, typeId: o.type_id, quantity: o.quantity,
    lpCost: o.lp_cost, iskCost: o.isk_cost,
    requiredItems: (o.required_items ?? []).map((r) => ({ typeId: r.type_id, quantity: r.quantity })),
  }));
}

/**
 * A rough price for every type in the game, in one request.
 *
 * This is a global average rather than a Jita quote, so it is only good enough to decide which
 * offers are worth pricing properly --- 300-odd offers would otherwise mean 400 book lookups before
 * anything could be shown.
 */
export async function roughPrices(): Promise<Record<number, number>> {
  const { data } = await esi<{ type_id: number; average_price?: number }[]>('/markets/prices/');
  const out: Record<number, number> = {};
  for (const p of data) if (p.average_price) out[p.type_id] = p.average_price;
  return out;
}

let rough: { at: number; p: Promise<Record<number, number>> } | null = null;
/** The same rough prices, fetched at most once an hour however many panels ask for them. */
export function roughPricesShared(): Promise<Record<number, number>> {
  if (!rough || Date.now() - rough.at > 3600_000) {
    const p = roughPrices();
    rough = { at: Date.now(), p };
    p.catch(() => { rough = null; });
  }
  return rough.p;
}

let adjusted: { at: number; p: Promise<Record<number, number>> } | null = null;
/**
 * CCP's adjusted price for every type (/markets/prices/, no login), which the reprocessing tax is charged on. Fetched
 * at most once an hour.
 */
export function adjustedPricesShared(): Promise<Record<number, number>> {
  if (!adjusted || Date.now() - adjusted.at > 3600_000) {
    const p = esi<{ type_id: number; adjusted_price?: number }[]>('/markets/prices/').then(({ data }) => {
      const out: Record<number, number> = {};
      for (const x of data) if (x.adjusted_price) out[x.type_id] = x.adjusted_price;
      return out;
    });
    adjusted = { at: Date.now(), p };
    p.catch(() => { adjusted = null; });
  }
  return adjusted.p;
}

/** Loyalty points held with each corporation. */
export async function loyaltyPoints(characterId: number): Promise<{ corporationId: number; points: number }[]> {
  const { data } = await esi<{ corporation_id: number; loyalty_points: number }[]>(
    `/characters/${characterId}/loyalty/points/`, { auth: true },
  );
  return data.map((d) => ({ corporationId: d.corporation_id, points: d.loyalty_points }))
    .sort((a, b) => b.points - a.points);
}

type RawGroup = { market_group_id: number; name: string; types?: number[]; parent_group_id?: number };

/** One market group. Static data, so the browser cache is welcome to it. */
export async function marketGroup(id: number): Promise<{ name: string; types: number[] }> {
  const { data } = await esi<RawGroup>(`/markets/groups/${id}/`);
  return { name: data.name, types: data.types ?? [] };
}

/**
 * Every type in the given market groups.
 *
 * Reading the groups rather than keeping a list of type IDs means the sets stay right when CCP adds
 * a filament, which they do. Only the named groups are fetched --- walking the whole tree would
 * mean a request per market group in the game, which is two thousand of them.
 */
export async function groupTypes(ids: number[]): Promise<number[]> {
  const groups = await Promise.all(ids.map((id) => marketGroup(id).catch(() => ({ name: '', types: [] as number[] }))));
  return [...new Set(groups.flatMap((g) => g.types))];
}

/** Market groups holding the five abyssal weather filaments, and the loot they pay out in. */
export const FILAMENT_GROUPS = [2457, 2458, 2459, 2460, 2461];
export const ABYSSAL_MATERIALS_GROUP = 2479;

export type RawContract = {
  contract_id: number; type: string; reward?: number; collateral?: number; volume?: number;
  days_to_complete?: number; date_expired: string; date_issued: string;
  start_location_id?: number; end_location_id?: number; title?: string; price?: number;
};

/** Every public contract in a region. Public: no login needed. */
export async function publicContracts(regionId: number): Promise<RawContract[]> {
  return esiAllPages<RawContract>(`/contracts/public/${regionId}/`);
}

type RawPlanetHead = {
  planet_id: number; planet_type: string; solar_system_id: number;
  upgrade_level: number; num_pins: number; last_update: string;
};

/** The planets you have a command centre on. */
export async function myPlanets(characterId: number): Promise<PlanetHead[]> {
  const { data } = await esi<RawPlanetHead[]>(`/characters/${characterId}/planets/`, { auth: true });
  return data.map((p) => ({
    planetId: p.planet_id, planetType: p.planet_type, solarSystemId: p.solar_system_id,
    upgradeLevel: p.upgrade_level, numPins: p.num_pins, lastUpdate: p.last_update,
  }));
}

/** One colony's layout: every pin, with extraction programmes and what each is holding. */
export async function colonyLayout(characterId: number, planetId: number): Promise<RawColony> {
  const { data } = await esi<RawColony>(`/characters/${characterId}/planets/${planetId}/`, { auth: true });
  return data;
}
