/**
 * The hourly archive: what the app's own sync does, done by the Worker so it happens whether or not a
 * browser is open. ESI keeps only 30 days of wallet history; a ledger nobody opens for a month used to lose
 * the gap for good.
 *
 * Reads the character's wallet transactions, journal, orders (open and history), assets and loyalty points
 * with the kept login, turns them into the same records the app makes (`src/lib/esiRecords.ts`), and pushes
 * only what's new or changed, so browsers pull it like any other device's changes. Once a day it also keeps
 * a net-worth point, computed exactly as the Wallet page does.
 */
import {
  countStock, netWorthOf, toJournal, toOrder, toTx, withHistory,
  type OrderRecord, type RawAsset, type RawCharOrder, type RawJournal, type RawTx,
} from '../../src/lib/esiRecords';
import { esiAll, esiGet, esiPost, useLogin } from './eve';
import { push } from './sync';

const JITA_44 = 60003760;
const has = (scopes: string[], s: string) => scopes.includes(s);
const S = {
  wallet: 'esi-wallet.read_character_wallet.v1',
  orders: 'esi-markets.read_character_orders.v1',
  assets: 'esi-assets.read_assets.v1',
  loyalty: 'esi-characters.read_loyalty.v1',
};

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };

export type ArchiveResult = { trades: number; journal: number; orders: number; names: number; stock: boolean; netWorth: number | null };

async function ids(db: D1Database, charId: number, kind: string): Promise<Set<string>> {
  const rows = (await db.prepare('SELECT id FROM records WHERE char_id = ?1 AND kind = ?2 AND data IS NOT NULL').bind(charId, kind).all<{ id: string }>()).results;
  return new Set(rows.map((r) => r.id));
}
async function doc<T>(db: D1Database, charId: number, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT data FROM docs WHERE char_id = ?1 AND key = ?2').bind(charId, key).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as T) : null;
}

export async function archive(env: Env, charId: number): Promise<ArchiveResult> {
  const login = await useLogin(env, charId, 'main');
  if (!login) throw new Error('No login kept for the cloud');
  const { access: token, scopes } = login;
  const db = env.DB;
  const records: { k: string; i: string; d: unknown }[] = [];
  const docs: { key: string; d: unknown }[] = [];
  const result: ArchiveResult = { trades: 0, journal: 0, orders: 0, names: 0, stock: false, netWorth: null };
  const typeIds = new Set<number>();

  // Trades: newest first, walking back only while pages still hold trades the ledger doesn't have.
  if (has(scopes, S.wallet)) {
    const known = await ids(db, charId, 'txs');
    let fromId: number | undefined;
    for (let loop = 0; loop < 10; loop++) {
      const { data } = await esiGet<RawTx[]>(`/characters/${charId}/wallet/transactions/`, { token, query: { from_id: fromId } });
      if (!data.length) break;
      let fresh = 0;
      for (const t of data) {
        const id = String(t.transaction_id);
        if (known.has(id)) continue;
        fresh++;
        records.push({ k: 'txs', i: id, d: toTx(t) });
        typeIds.add(t.type_id);
      }
      result.trades += fresh;
      const minId = Math.min(...data.map((t) => t.transaction_id));
      if (fresh === 0 || data.length < 500 || (fromId !== undefined && minId >= fromId)) break;
      fromId = minId - 1;
    }
    const knownJ = await ids(db, charId, 'journal');
    for (const j of await esiAll<RawJournal>(`/characters/${charId}/wallet/journal/`, { token })) {
      if (knownJ.has(String(j.id))) continue;
      records.push({ k: 'journal', i: String(j.id), d: toJournal(j) });
      result.journal++;
    }
  }

  // Orders: every version of each order is kept (a price change is how its fee is found), so each is
  // merged onto the stored record and only pushed when it moved.
  let orders: OrderRecord[] = [];
  if (has(scopes, S.orders)) {
    const [open, hist] = await Promise.all([
      esiGet<RawCharOrder[]>(`/characters/${charId}/orders/`, { token }).then((r) => r.data),
      esiAll<RawCharOrder>(`/characters/${charId}/orders/history/`, { token }),
    ]);
    const fetched = new Map<string, OrderRecord>();
    for (const o of hist) fetched.set(String(o.order_id), toOrder(o, 'closed'));
    for (const o of open) fetched.set(String(o.order_id), toOrder(o, 'open'));
    const stored = new Map<string, OrderRecord>();
    const idsList = [...fetched.keys()];
    for (let i = 0; i < idsList.length; i += 90) {
      const part = idsList.slice(i, i + 90);
      const rows = (await db.prepare(`SELECT id, data FROM records WHERE char_id = ?1 AND kind = 'orders' AND id IN (${part.map((_, n) => `?${n + 2}`).join(',')})`)
        .bind(charId, ...part).all<{ id: string; data: string | null }>()).results;
      for (const r of rows) if (r.data) stored.set(r.id, JSON.parse(r.data));
    }
    for (const [id, o] of fetched) {
      const merged = withHistory(stored.get(id), o);
      if (JSON.stringify(merged) !== JSON.stringify(stored.get(id))) { records.push({ k: 'orders', i: id, d: merged }); result.orders++; }
      typeIds.add(o.typeId);
    }
    // Everything open now, for net worth, whether or not it changed.
    orders = [...fetched.values()];
  }

  // Assets: a snapshot, replaced whole; pushed only when the counts moved.
  let stockTotal: Record<number, number> | undefined;
  if (has(scopes, S.assets)) {
    const stock = countStock(await esiAll<RawAsset>(`/characters/${charId}/assets/`, { token }), JITA_44);
    stockTotal = stock.total;
    const prev = await doc<{ at?: string }>(db, charId, 'stock');
    const same = prev && JSON.stringify({ ...prev, at: '' }) === JSON.stringify({ ...stock, at: '' });
    if (!same) { docs.push({ key: 'stock', d: stock }); result.stock = true; }
  } else {
    stockTotal = (await doc<{ total?: Record<number, number> }>(db, charId, 'stock'))?.total;
  }

  // Names for items the ledger hasn't named yet. ESI rejects a whole batch over one bad ID, so a failed
  // batch falls back to one lookup per item.
  const named = await ids(db, charId, 'names');
  const unnamed = [...typeIds].filter((id) => !named.has(String(id)));
  for (let i = 0; i < unnamed.length; i += 500) {
    const part = unnamed.slice(i, i + 500);
    try {
      const got = await esiPost<{ id: number; name: string }[]>('/universe/names/', part);
      for (const n of got) { records.push({ k: 'names', i: String(n.id), d: n.name }); result.names++; }
    } catch {
      for (const id of part.slice(0, 40)) {
        try {
          const { data } = await esiGet<{ name: string }>(`/universe/types/${id}/`);
          records.push({ k: 'names', i: String(id), d: data.name }); result.names++;
        } catch { /* named another time */ }
      }
    }
  }

  // Net worth, once a day, the Wallet page's way: kept when today has no point or it moved over 0.5%.
  if (has(scopes, S.wallet)) {
    const { data: wallet } = await esiGet<number>(`/characters/${charId}/wallet/`, { token });
    const prices: Record<number, number> = {};
    for (const p of (await esiGet<{ type_id: number; average_price?: number }[]>('/markets/prices/')).data) if (p.average_price) prices[p.type_id] = p.average_price;
    const lp = has(scopes, S.loyalty)
      ? (await esiGet<{ corporation_id: number; loyalty_points: number }[]>(`/characters/${charId}/loyalty/points/`, { token })).data.map((b) => ({ corporationId: b.corporation_id, points: b.loyalty_points }))
      : [];
    const meta = await doc<{ lpRate?: Record<number, { rate: number; lp?: number | null }> }>(db, charId, 'meta');
    const nw = netWorthOf({ wallet, orders, stockTotal, roughPrices: prices, lp, lpRate: meta?.lpRate });
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.prepare(`SELECT data FROM records WHERE char_id = ?1 AND kind = 'netWorth' AND id = ?2`).bind(charId, today).first<{ data: string | null }>();
    const cur = row?.data ? (JSON.parse(row.data) as { total: number }) : null;
    if (nw.total > 0 && (!cur || Math.abs(cur.total - nw.total) >= nw.total * 0.005)) {
      records.push({ k: 'netWorth', i: today, d: { date: today, total: nw.total, wallet: nw.wallet, liquid: nw.liquid } });
      result.netWorth = nw.total;
    }
  }

  if (records.length || docs.length) {
    for (let i = 0; i < Math.max(records.length, 1); i += 2000) {
      await push(db, charId, { records: records.slice(i, i + 2000), docs: i === 0 ? docs : [] });
    }
  }
  return result;
}

/** Records what a job did, for the Settings panel. */
export async function noteJob(db: D1Database, charId: number, job: string, outcome: { ok: true; detail: unknown } | { ok: false; error: string }) {
  const now = Date.now();
  await db.prepare(`
    INSERT INTO jobs (char_id, job, last_run, last_ok, last_error, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(char_id, job) DO UPDATE SET last_run = excluded.last_run,
      last_ok = COALESCE(excluded.last_ok, jobs.last_ok), last_error = excluded.last_error,
      detail = COALESCE(excluded.detail, jobs.detail)`)
    .bind(charId, job, now, outcome.ok ? now : null, outcome.ok ? null : outcome.error, outcome.ok ? JSON.stringify(outcome.detail) : null).run();
}
