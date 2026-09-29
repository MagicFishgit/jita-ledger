/**
 * Watching the Jita books around the clock (every five minutes, the life of ESI's copy of a book).
 *
 * The app already learns who trades an item by comparing two reads of its book (`bookFills` in
 * src/lib/flow.ts): a shrunken sell order was bought from, a shrunken buy order was sold into. It could only
 * do that while a tab was open. This does it all day for every item any ledger has orders, positions or
 * watchlist entries on, so "Clears in", the buyer/seller split and the selling times rest on measured trade
 * instead of history's guess. It also keeps the best prices hour by hour, where ESI's history is daily.
 */
import { bookFills, MAX_GAP_H, type FlowDay, type OrderLite } from '../../src/lib/flow';
import { soldFrom, type BookSold } from '../../src/lib/split';
import { noteRate } from './rate';

const JITA_44 = 60003760;
const THE_FORGE = 10000002;
const PLEX = 44992;
const PLEX_MARKET = 19000001;
const HEADERS = { 'X-Compatibility-Date': '2025-08-26', 'User-Agent': 'jita-ledger-cloud (github.com/MagicFishgit/jita-ledger)', Accept: 'application/json' };

type Raw = { order_id: number; is_buy_order: boolean; price: number; volume_remain: number; volume_total?: number; location_id: number };

/** The most items one round reads. Each is one to a few ESI pages; the round's limits are far above this. */
export const MAX_WATCHED = 400;

/**
 * Every item any ledger trades or watches: open Jita orders, open positions, the watchlist, and the items a
 * browser asked to have watched (its `watch` doc: the best candidates from its last Prospects scan and its
 * loyalty spend plan), so those are ranked on measured trade before any ISK goes in. What's held comes first;
 * the asked-for list fills the rest up to MAX_WATCHED.
 */
export async function watchedTypes(db: D1Database): Promise<number[]> {
  const held = (await db.prepare(`
    SELECT DISTINCT CAST(json_extract(data, '$.typeId') AS INTEGER) AS t FROM records
      WHERE kind = 'orders' AND data IS NOT NULL AND json_extract(data, '$.state') = 'open'
    UNION SELECT CAST(json_extract(data, '$.typeId') AS INTEGER) FROM records
      WHERE kind = 'positions' AND data IS NOT NULL AND json_extract(data, '$.status') = 'open'
    UNION SELECT CAST(id AS INTEGER) FROM records WHERE kind = 'watchlist' AND data IS NOT NULL`).all<{ t: number }>()).results;
  const asked = (await db.prepare(`SELECT CAST(j.value AS INTEGER) AS t FROM docs, json_each(docs.data, '$.types') AS j WHERE docs.key = 'watch'`)
    .all<{ t: number }>()).results;
  const out = new Set<number>();
  for (const r of [...held, ...asked]) if (Number.isFinite(r.t) && r.t > 0 && out.size < MAX_WATCHED) out.add(r.t);
  return [...out];
}

/** One item's Jita book, every page, with ESI's Expires as the stamp of that snapshot. Null if any page failed. */
async function readBook(typeId: number): Promise<{ orders: OrderLite[]; stamp: number; sold: BookSold } | null> {
  const plex = typeId === PLEX;
  const base = `https://esi.evetech.net/markets/${plex ? PLEX_MARKET : THE_FORGE}/orders/?type_id=${typeId}&order_type=all`;
  const all: Raw[] = [];
  let pages = 1, stamp = NaN;
  for (let p = 1; p <= Math.min(pages, 20); p++) {
    const res = await fetch(`${base}&page=${p}`, { headers: HEADERS });
    noteRate(res.headers);
    if (!res.ok) { await res.body?.cancel(); return null; }
    if (p === 1) {
      pages = Number(res.headers.get('X-Pages') ?? 1) || 1;
      stamp = Date.parse(res.headers.get('Expires') ?? '');
    }
    all.push(...((await res.json()) as Raw[]));
  }
  if (!Number.isFinite(stamp)) return null;
  const here = plex ? all : all.filter((o) => o.location_id === JITA_44);
  return { stamp, sold: soldFrom(here), orders: here.map((o) => ({ id: o.order_id, isBuy: o.is_buy_order, price: o.price, volume: o.volume_remain })) };
}

const pack = (orders: OrderLite[]) => JSON.stringify(orders.map((o) => [o.id, o.isBuy ? 1 : 0, o.price, o.volume]));
export const unpack = (s: string): OrderLite[] => (JSON.parse(s) as [number, number, number, number][]).map(([id, b, price, volume]) => ({ id, isBuy: b === 1, price, volume }));

export type WatchResult = { items: number; read: number; counted: number; failed: number };

/** One round: read every watched book, compare each with its last read, keep what traded and the prices. */
export async function watchMarkets(db: D1Database): Promise<WatchResult> {
  const types = await watchedTypes(db);
  const result: WatchResult = { items: types.length, read: 0, counted: 0, failed: 0 };
  if (!types.length) return result;
  const prev = new Map<number, { stamp: number; orders: string }>();
  for (let i = 0; i < types.length; i += 90) {
    const part = types.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, stamp, orders FROM books WHERE type_id IN (${part.map((_, n) => `?${n + 1}`).join(',')})`)
      .bind(...part).all<{ type_id: number; stamp: number; orders: string }>()).results;
    for (const r of rows) prev.set(r.type_id, r);
  }

  const stmts: D1PreparedStatement[] = [];
  const now = Date.now();
  const hour = Math.floor(now / 3600_000);
  const setBook = db.prepare('INSERT INTO books (type_id, stamp, orders, at, sold) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(type_id) DO UPDATE SET stamp = excluded.stamp, orders = excluded.orders, at = excluded.at, sold = excluded.sold');
  const addFlow = db.prepare(`
    INSERT INTO flow (type_id, day, h, sell, buy, new_sell, new_buy, buy_low, sell_high, front_sell, front_buy, reprice_sell, reprice_buy)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    ON CONFLICT(type_id, day) DO UPDATE SET h = h + excluded.h, sell = sell + excluded.sell, buy = buy + excluded.buy,
      new_sell = new_sell + excluded.new_sell, new_buy = new_buy + excluded.new_buy,
      buy_low = MIN(COALESCE(buy_low, excluded.buy_low), COALESCE(excluded.buy_low, buy_low)),
      sell_high = MAX(COALESCE(sell_high, excluded.sell_high), COALESCE(excluded.sell_high, sell_high)),
      front_sell = front_sell + excluded.front_sell, front_buy = front_buy + excluded.front_buy,
      reprice_sell = reprice_sell + excluded.reprice_sell, reprice_buy = reprice_buy + excluded.reprice_buy`);
  const addHour = db.prepare(`
    INSERT INTO flow_hod (type_id, day, hod, h, sell, buy) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(type_id, day, hod) DO UPDATE SET h = h + excluded.h, sell = sell + excluded.sell, buy = buy + excluded.buy`);
  const setPrice = db.prepare(`
    INSERT INTO prices (type_id, hour, best_buy, best_sell, buy_units, sell_units) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(type_id, hour) DO UPDATE SET best_buy = excluded.best_buy, best_sell = excluded.best_sell,
      buy_units = excluded.buy_units, sell_units = excluded.sell_units`);

  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, types.length) }, async () => {
    while (next < types.length) {
      const typeId = types[next++];
      let book: Awaited<ReturnType<typeof readBook>>;
      try { book = await readBook(typeId); } catch { book = null; }
      if (!book) { result.failed++; continue; }
      result.read++;
      const was = prev.get(typeId);
      if (was && book.stamp > was.stamp) {
        const hours = (book.stamp - was.stamp) / 3600_000;
        // A gap over half an hour (the job didn't run) would hide orders listed and bought out in between.
        if (hours <= MAX_GAP_H) {
          const f = bookFills(unpack(was.orders), book.orders);
          const day = new Date(book.stamp).toISOString().slice(0, 10);
          stmts.push(addFlow.bind(typeId, day, hours, f.sell, f.buy, f.newSell, f.newBuy, f.buyLow ?? null, f.sellHigh ?? null,
            f.frontSell ?? 0, f.frontBuy ?? 0, f.repriceSell ?? 0, f.repriceBuy ?? 0));
          stmts.push(addHour.bind(typeId, day, new Date(book.stamp).getUTCHours(), hours, f.sell, f.buy));
          result.counted++;
        }
      }
      if (!was || book.stamp !== was.stamp) stmts.push(setBook.bind(typeId, book.stamp, pack(book.orders), now, JSON.stringify(book.sold)));
      const bids = book.orders.filter((o) => o.isBuy), asks = book.orders.filter((o) => !o.isBuy);
      const bestBuy = bids.length ? Math.max(...bids.map((o) => o.price)) : null;
      const bestSell = asks.length ? Math.min(...asks.map((o) => o.price)) : null;
      const at = (list: OrderLite[], p: number | null) => (p == null ? null : list.filter((o) => o.price === p).reduce((t, o) => t + o.volume, 0));
      stmts.push(setPrice.bind(typeId, hour, bestBuy, bestSell, at(bids, bestBuy), at(asks, bestSell)));
    }
  }));
  // Hour-of-day counts are only worth a few weeks; once an hour, the oldest go.
  if (new Date(now).getUTCMinutes() < 5) stmts.push(db.prepare('DELETE FROM flow_hod WHERE day < ?1').bind(new Date(now - HOD_DAYS * 86400_000).toISOString().slice(0, 10)));
  for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200));
  return result;
}

/** Days of hour-of-day counts kept. */
export const HOD_DAYS = 28;

/** Each item's trade by UTC hour of day, summed over the last `days` days: hours watched and units each side. */
export async function hoursFor(db: D1Database, types: number[], days = HOD_DAYS) {
  const since = new Date(Date.now() - (days - 1) * 86400_000).toISOString().slice(0, 10);
  const out: Record<number, { hod: number; h: number; sell: number; buy: number; days: number }[]> = {};
  for (let i = 0; i < types.length; i += 90) {
    const part = types.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, hod, SUM(h) AS h, SUM(sell) AS sell, SUM(buy) AS buy, COUNT(DISTINCT day) AS days FROM flow_hod
      WHERE day >= ?1 AND type_id IN (${part.map((_, n) => `?${n + 2}`).join(',')}) GROUP BY type_id, hod`)
      .bind(since, ...part).all<{ type_id: number; hod: number; h: number; sell: number; buy: number; days: number }>()).results;
    for (const r of rows) (out[r.type_id] ??= []).push({ hod: r.hod, h: r.h, sell: r.sell, buy: r.buy, days: r.days });
  }
  return out;
}

/** The watched trade for some items over the last `days` UTC days, shaped like the app's flow log. */
export async function flowFor(db: D1Database, types: number[], days = 14) {
  const since = new Date(Date.now() - (days - 1) * 86400_000).toISOString().slice(0, 10);
  const out: Record<number, Record<string, FlowDay>> = {};
  for (let i = 0; i < types.length; i += 90) {
    const part = types.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, day, h, sell, buy, new_sell, new_buy, buy_low, sell_high, front_sell, front_buy, reprice_sell, reprice_buy
      FROM flow WHERE day >= ?1 AND type_id IN (${part.map((_, n) => `?${n + 2}`).join(',')})`)
      .bind(since, ...part).all<{ type_id: number; day: string; h: number; sell: number; buy: number; new_sell: number; new_buy: number;
        buy_low: number | null; sell_high: number | null; front_sell: number; front_buy: number; reprice_sell: number; reprice_buy: number }>()).results;
    for (const r of rows) {
      (out[r.type_id] ??= {})[r.day] = {
        h: r.h, sell: r.sell, buy: r.buy, newSell: r.new_sell, newBuy: r.new_buy,
        buyLow: r.buy_low ?? undefined, sellHigh: r.sell_high ?? undefined,
        frontSell: r.front_sell, frontBuy: r.front_buy, repriceSell: r.reprice_sell, repriceBuy: r.reprice_buy,
      };
    }
  }
  return out;
}

/** An item's best prices hour by hour, oldest first. */
export async function pricesFor(db: D1Database, typeId: number, hours = 24 * 14) {
  const from = Math.floor(Date.now() / 3600_000) - hours;
  return (await db.prepare('SELECT hour, best_buy AS bestBuy, best_sell AS bestSell, buy_units AS buyUnits, sell_units AS sellUnits FROM prices WHERE type_id = ?1 AND hour >= ?2 ORDER BY hour')
    .bind(typeId, from).all<{ hour: number; bestBuy: number | null; bestSell: number | null; buyUnits: number | null; sellUnits: number | null }>()).results;
}
