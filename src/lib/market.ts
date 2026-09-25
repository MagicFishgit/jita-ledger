import { get, set } from 'idb-keyval';
import { esi } from './esi';
import { GLOBAL_PLEX_MARKET, JITA_44, PLEX_TYPE, THE_FORGE } from './config';
import { cacheStore } from './store';
import type { BookLevel, HistRow, MarketSnap } from './types';

type IdsResponse = {
  inventory_types?: { id: number; name: string }[];
  factions?: { id: number; name: string }[];
  corporations?: { id: number; name: string }[];
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

type RawMarketOrder = { order_id: number; is_buy_order: boolean; price: number; volume_remain: number; location_id: number };

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
export type OrderLite = { id: number; isBuy: boolean; price: number; volume: number };

// Raw orders are kept beside the summary rather than in it: MarketSnap gets persisted to
// IndexedDB by the watchlist and the scan, and this list is far too big to store per item.
const bookCache = new Map<number, { at: number; expires: number | null; snap: Omit<MarketSnap, 'avgVol7' | 'avgPrice7'>; raw: OrderLite[] }>();

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
export async function jitaOrders(typeId: number, force = false): Promise<{ orders: OrderLite[]; expires: number | null }> {
  const e = await readBook(typeId, force);
  return { orders: e.raw, expires: e.expires };
}

async function readBook(typeId: number, force: boolean) {
  const hit = bookCache.get(typeId);
  if (!force && hit && Date.now() - hit.at < 5 * 60_000) return hit;
  // A forced read is someone asking again on purpose, so go past the browser's copy of it.
  const { orders, expires } = await fetchBook(typeId, force);
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
    topBuys: levels(buys, 5),
    topSells: levels(sells, 5),
  };
  const raw: OrderLite[] = here.map((o) => ({ id: o.order_id, isBuy: o.is_buy_order, price: o.price, volume: o.volume_remain }));
  const entry = { at: Date.now(), expires, snap, raw };
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

/** Reads every page of an item's book, keeping the first page's expiry. */
async function fetchBook(typeId: number, fresh: boolean) {
  const path = `/markets/${regionFor(typeId)}/orders/`;
  const query = { order_type: 'all', type_id: typeId };
  const first = await esi<RawMarketOrder[]>(path, { query: { ...query, page: 1 }, fresh });
  const orders = [...first.data];
  const pages = Math.min(first.pages ?? 1, 20);
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        esi<RawMarketOrder[]>(path, { query: { ...query, page: i + 2 }, fresh })
          .then((r) => r.data)
          .catch(() => [] as RawMarketOrder[])),
    );
    rest.forEach((r) => orders.push(...r));
  }
  return { orders, expires: first.expires };
}

/** Daily history for the whole of The Forge (most of it is Jita). Cached for 3 hours. */
export async function marketHistory(typeId: number): Promise<HistRow[]> {
  const key = `hist:${typeId}`;
  const cached = (await get(key, cacheStore)) as { at: number; rows: HistRow[] } | undefined;
  if (cached && Date.now() - cached.at < 3 * 3600_000) return cached.rows;
  const { data } = await esi<HistRow[]>(`/markets/${regionFor(typeId)}/history/`, { query: { type_id: typeId } });
  const rows = [...data].sort((a, b) => a.date.localeCompare(b.date));
  await set(key, { at: Date.now(), rows }, cacheStore).catch(() => undefined);
  return rows;
}

export function recentAverages(rows: HistRow[], days = 7) {
  const recent = rows.slice(-days);
  if (!recent.length) return { avgVol: null, avgPrice: null };
  const vol = recent.reduce((s, r) => s + r.volume, 0);
  const val = recent.reduce((s, r) => s + r.volume * r.average, 0);
  return { avgVol: vol / recent.length, avgPrice: vol > 0 ? val / vol : null };
}

export async function snapshot(typeId: number, force = false): Promise<MarketSnap> {
  const [book, hist] = await Promise.all([jitaBook(typeId, force), marketHistory(typeId)]);
  const { avgVol, avgPrice } = recentAverages(hist, 7);
  return { ...book, avgVol7: avgVol, avgPrice7: avgPrice };
}
