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
import { isDowntime } from '../../src/lib/watchdog';
import {
  countStock, mergeSafety, nameHolders, netWorthOf, unnamedHolders, toJournal, toOrder, toTx, withHistory,
  type OrderRecord, type RawAsset, type RawCharOrder, type RawJournal, type RawTx, type SafetyWrap, type StockRecord,
} from '../../src/lib/esiRecords';
import { esiAll, esiGet, esiPost, readerLogin, stillKept, useLogin, type Reader } from './eve';
import { mailSafety, registerSafety, safetyFindings } from './safety';
import { push } from './sync';

const JITA_44 = 60003760;
const has = (scopes: string[], s: string) => scopes.includes(s);
const S = {
  wallet: 'esi-wallet.read_character_wallet.v1',
  orders: 'esi-markets.read_character_orders.v1',
  assets: 'esi-assets.read_assets.v1',
  loyalty: 'esi-characters.read_loyalty.v1',
};

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string; APP_URL: string };

export type ArchiveResult = {
  trades: number; journal: number; orders: number; names: number; stock: boolean; netWorth: number | null;
  /** The wallet balance and loyalty points this read saw, for an alt's sheet (sheet.ts); absent without the permission. */
  wallet?: number | null; lp?: { corporationId: number; points: number }[] | null;
};

async function ids(db: D1Database, charId: number, kind: string): Promise<Set<string>> {
  const rows = (await db.prepare('SELECT id FROM records WHERE char_id = ?1 AND kind = ?2 AND data IS NOT NULL').bind(charId, kind).all<{ id: string }>()).results;
  return new Set(rows.map((r) => r.id));
}
async function doc<T>(db: D1Database, charId: number, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT data FROM docs WHERE char_id = ?1 AND key = ?2').bind(charId, key).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as T) : null;
}

/**
 * The character's open orders (and with `closed`, its order history too), each merged onto the stored
 * record with its versions. Returns the records that changed, for the caller to push, and every order read.
 */
export async function readOrders(db: D1Database, charId: number, token: string, closed: boolean): Promise<{ changed: { k: string; i: string; d: unknown }[]; all: OrderRecord[] }> {
  const [open, hist] = await Promise.all([
    esiGet<RawCharOrder[]>(`/characters/${charId}/orders/`, { token }).then((r) => r.data),
    closed ? esiAll<RawCharOrder>(`/characters/${charId}/orders/history/`, { token }) : Promise.resolve([] as RawCharOrder[]),
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
  const changed: { k: string; i: string; d: unknown }[] = [];
  for (const [id, o] of fetched) {
    const merged = withHistory(stored.get(id), o);
    if (JSON.stringify(merged) !== JSON.stringify(stored.get(id))) changed.push({ k: 'orders', i: id, d: merged });
  }
  return { changed, all: [...fetched.values()] };
}

/** ESI caches a character's orders for twenty minutes, so reading them more often shows nothing new. */
export const ORDERS_EVERY_MS = 20 * 60_000;

/**
 * Between hourly archives, the open orders alone, so an order placed or repriced since is watched and
 * judged within twenty minutes rather than an hour.
 */
export async function refreshOrders(env: Env, charId: number): Promise<number | null> {
  const last = await env.DB.prepare(`SELECT last_run FROM jobs WHERE char_id = ?1 AND job = 'orders'`).bind(charId).first<{ last_run: number }>();
  if (last && Date.now() - last.last_run < ORDERS_EVERY_MS) return null;
  const login = await useLogin(env, charId, 'main');
  if (!login || !has(login.scopes, S.orders)) return null;
  const r = await readOrders(env.DB, charId, login.access, false);
  if (r.changed.length) await push(env.DB, charId, { records: r.changed, docs: [] });
  await noteJob(env.DB, charId, 'orders', { ok: true, detail: { orders: r.changed.length } });
  return r.changed.length;
}

/** CCP's rough price for every type, in one request: what net worth and an asset-safety wrap are valued at. */
export async function roughPrices(): Promise<Record<number, number>> {
  const prices: Record<number, number> = {};
  for (const p of (await esiGet<{ type_id: number; average_price?: number }[]>('/markets/prices/')).data) if (p.average_price) prices[p.type_id] = p.average_price;
  return prices;
}

/**
 * `who` says whose login is used and whose data it is (eve.ts, Reader): everything below is read for, and filed
 * under, `who.char`. For an alt two things a ledger gets are left out: the asset-safety mail (its first read would
 * mail the main about every wrap the alt has) and the `orders` job row (nothing refreshes or judges an alt's orders).
 * `opts.prices`: CCP's rough prices when the caller already has them (an hour's alts share one fetch).
 */
export async function archive(env: Env, who: Reader, opts: { prices?: Record<number, number> } = {}): Promise<ArchiveResult> {
  const login = await readerLogin(env, who);
  if (!login) throw new Error('No login kept for the cloud');
  const { access: token, scopes } = login;
  const charId = who.char;
  const alt = who.char !== who.ledger;
  const db = env.DB;
  let rough = opts.prices;
  const prices = async () => (rough ??= await roughPrices());
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
    const r = await readOrders(db, charId, token, true);
    if (!alt) await noteJob(db, charId, 'orders', { ok: true, detail: { orders: r.changed.length } });
    records.push(...r.changed);
    result.orders = r.changed.length;
    for (const o of r.all) typeIds.add(o.typeId);
    // Everything open now, for net worth, whether or not it changed.
    orders = r.all;
  }

  // Assets: a snapshot, replaced whole; pushed only when the counts moved.
  let stockTotal: Record<number, number> | undefined;
  let freshWraps: SafetyWrap[] = [];
  if (has(scopes, S.assets)) {
    const stock = countStock(await esiAll<RawAsset>(`/characters/${charId}/assets/`, { token }), JITA_44);
    stockTotal = stock.total;
    const prev = await doc<StockRecord>(db, charId, 'stock');
    // Asset safety: wraps registered once by the cloud, which alone can date them, and what was learned carried
    // forward. Newly registered ones are mailed below. The containers and ships in them are named as you named them;
    // the wrap itself has no name in ESI ("None", not the lost structure's the client shows).
    const wraps = stock.safety ?? [];
    let holderNames = new Map<number, string>();
    const holders = unnamedHolders(prev?.safety, wraps);
    if (holders.length) {
      try {
        const got = await esiPost<{ item_id: number; name: string }[]>(`/characters/${charId}/assets/names/`, holders, token);
        holderNames = new Map(got.map((n) => [n.item_id, n.name]));
      } catch (e) { console.log('asset safety container names failed', e instanceof Error ? e.message : String(e)); }
    }
    const withNames = nameHolders(wraps, holderNames);
    // For an alt, only while it's still on the roster: this writes safety_seen before the push below is reached.
    const reg = alt && !(await stillKept(db, who)) ? { known: new Map(), fresh: [] } : await registerSafety(db, charId, withNames);
    stock.safety = mergeSafety(prev?.safety, withNames, reg.known);
    freshWraps = reg.fresh;
    for (const w of wraps) for (const id of Object.keys(w.items)) typeIds.add(Number(id));
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
    const lp = has(scopes, S.loyalty)
      ? (await esiGet<{ corporation_id: number; loyalty_points: number }[]>(`/characters/${charId}/loyalty/points/`, { token })).data.map((b) => ({ corporationId: b.corporation_id, points: b.loyalty_points }))
      : [];
    result.wallet = wallet;
    result.lp = has(scopes, S.loyalty) ? lp : null;
    const meta = await doc<{ lpRate?: Record<number, { rate: number; lp?: number | null }> }>(db, charId, 'meta');
    const nw = netWorthOf({ wallet, orders, stockTotal, roughPrices: await prices(), lp, lpRate: meta?.lpRate });
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.prepare(`SELECT data FROM records WHERE char_id = ?1 AND kind = 'netWorth' AND id = ?2`).bind(charId, today).first<{ data: string | null }>();
    const cur = row?.data ? (JSON.parse(row.data) as { total: number }) : null;
    if (nw.total > 0 && (!cur || Math.abs(cur.total - nw.total) >= nw.total * 0.005)) {
      records.push({ k: 'netWorth', i: today, d: { date: today, total: nw.total, wallet: nw.wallet, liquid: nw.liquid } });
      result.netWorth = nw.total;
    }
  }

  // Removed while this ran (an alt taken off the roster): nothing of it goes back in.
  if ((records.length || docs.length) && (!alt || (await stillKept(db, who)))) {
    for (let i = 0; i < Math.max(records.length, 1); i += 2000) {
      await push(db, charId, { records: records.slice(i, i + 2000), docs: i === 0 ? docs : [] });
    }
  }

  // A wrap just registered in asset safety: mailed once, with what's in it at CCP's estimated prices. A ledger's
  // only: the mail goes to the character it's read for, and an alt is never mailed.
  if (freshWraps.length && !alt) {
    try {
      const at = await prices();
      const mailed = await mailSafety(env, charId, safetyFindings(freshWraps, (id) => at[id]));
      console.log('asset safety registered', charId, JSON.stringify({ wraps: freshWraps.map((w) => w.id), mailed }));
    } catch (e) { console.error('asset safety mail failed', charId, e); }
  }
  return result;
}

/** Records what a job did, for the Settings panel. */
export async function noteJob(db: D1Database, charId: number, job: string, outcome: { ok: true; detail: unknown } | { ok: false; error: string }) {
  const now = Date.now();
  // Failures in a row feed the watchdog (watchdog.ts), except in EVE's daily downtime, when ESI fails for everyone.
  const counts = !outcome.ok && !isDowntime(now) ? 1 : 0;
  await db.prepare(`
    INSERT INTO jobs (char_id, job, last_run, last_ok, last_error, detail, fails, failing_since) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CASE WHEN ?7 = 1 THEN ?3 END)
    ON CONFLICT(char_id, job) DO UPDATE SET last_run = excluded.last_run,
      last_ok = COALESCE(excluded.last_ok, jobs.last_ok), last_error = excluded.last_error,
      detail = COALESCE(excluded.detail, jobs.detail),
      fails = CASE WHEN excluded.last_ok IS NOT NULL THEN 0 ELSE jobs.fails + ?7 END,
      failing_since = CASE WHEN excluded.last_ok IS NOT NULL THEN NULL WHEN ?7 = 1 THEN COALESCE(jobs.failing_since, excluded.last_run) ELSE jobs.failing_since END,
      warned = CASE WHEN excluded.last_ok IS NOT NULL THEN NULL ELSE jobs.warned END`)
    .bind(charId, job, now, outcome.ok ? now : null, outcome.ok ? null : outcome.error, outcome.ok ? JSON.stringify(outcome.detail) : null, counts).run();
}
