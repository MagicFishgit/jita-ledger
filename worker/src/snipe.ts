/**
 * The sniper's read. Every five minutes, a minute after ESI refreshes The Forge's book (about :x0:30 and :x5:30
 * EVE), every order is read once: each item's Jita sells cut to the cheapest few, its best Jita bid kept, and the
 * cheap ends judged against the daily full scan's stats (src/lib/snipe.ts). The result is kept whole in scan_meta
 * ('snipes') for the Sniper page, and each ledger with a sending character is mailed what clears its own bar, at
 * its own rates, through the same mail step as the alert round.
 *
 * Measured on 28 September 2026: the whole book is 404 pages and 96 MB, read in 14 s from a PC and about a minute
 * from the cloud (six connections at a time), with 0.3 s of parsing: cheap enough for every five minutes.
 */
import type { Finding } from '../../src/lib/alerts';
import { rates, sanitizeSettings, type Settings } from '../../src/lib/fees';
import { iskBig } from '../../src/lib/format';
import { sanitizeAlerts } from '../../src/lib/prefs';
import {
  BASE_RATES, findBid, findListing, judgeBids, judgeListings, KEEP_SELLS, notYours, SEEN_DAYS, SNIPE_FLOOR, splitBlueprints,
  type SnipeBid, type SnipeListing, type SnipeOrder, type SnipeRead, type SnipeStats,
} from '../../src/lib/snipe';
import { tickDown } from '../../src/lib/tick';
import { snipeOutcome } from '../../src/lib/track';
import type { AlertConfig, HistRow, Stock } from '../../src/lib/types';
import { mailFindings, namesAnywhere } from './alerts';
import { eachHistory } from './hist';
import { categoriesOf } from './kinds';
import { page, type RawOrder } from './scan';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string; APP_URL: string };

const THE_FORGE = 10000002;
const JITA_44 = 60003760;
const NPC_DURATION = 365;
/** At most this many listings in one mail: the rest are on the Sniper page. */
const MAIL_LISTINGS = 8;

const inList = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `?${i + from}`).join(',');

async function docOf<T>(db: D1Database, charId: number, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT data FROM docs WHERE char_id = ?1 AND key = ?2').bind(charId, key).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as T) : null;
}

/** What the Sniper saw of some items in the last month, for marking buys of them as found by it. */
export async function sightings(db: D1Database, types: number[]) {
  const out: { typeId: number; lo: number; hi: number; firstSeen: number; lastSeen: number }[] = [];
  for (let i = 0; i < types.length; i += 90) {
    const part = types.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, lo, hi, first_seen, last_seen FROM snipe_seen WHERE type_id IN (${inList(part.length)})`).bind(...part)
      .all<{ type_id: number; lo: number; hi: number; first_seen: number; last_seen: number }>()).results;
    for (const r of rows) out.push({ typeId: r.type_id, lo: r.lo, hi: r.hi, firstSeen: r.first_seen, lastSeen: r.last_seen });
  }
  return out;
}

export async function lastSnipes(db: D1Database): Promise<SnipeRead | null> {
  const row = await db.prepare(`SELECT data FROM scan_meta WHERE key = 'snipes'`).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as SnipeRead) : null;
}

type Bid = { id: number; price: number; units: number; minVolume: number; issued: string };

/** Reads the book (unless ESI hasn't changed it since the last read), keeps what it finds, and mails each ledger. */
export async function sniperRound(env: Env, now = Date.now()) {
  const db = env.DB;
  const last = await lastSnipes(db);
  // ESI serves the same book until it expires: reading it again would find nothing new.
  if (last?.expires && Date.parse(last.expires) > now) return { skipped: 'book unchanged since the last read' };

  const sells = new Map<number, SnipeOrder[]>();
  const more = new Set<number>();
  const npc = new Set<number>();
  // NPC sellers anywhere in The Forge, the lowest price for each item: a resale is never valued above it. Read from this
  // read of the book rather than the daily scan's: it costs one map, is five minutes old rather than a day, and needs no
  // scan row for the item.
  const npcAt = new Map<number, number>();
  const bids = new Map<number, Bid>();
  const fold = (o: RawOrder) => {
    if (!o.is_buy_order && (o.duration ?? 0) >= NPC_DURATION) {
      const was = npcAt.get(o.type_id);
      if (was == null || o.price < was) npcAt.set(o.type_id, o.price);
    }
    if (o.location_id !== JITA_44) return;
    if (o.is_buy_order) {
      const b = bids.get(o.type_id);
      if (!b || o.price > b.price) bids.set(o.type_id, { id: o.order_id, price: o.price, units: o.volume_remain, minVolume: o.min_volume ?? 1, issued: o.issued ?? '' });
      return;
    }
    if ((o.duration ?? 0) >= NPC_DURATION) npc.add(o.type_id);
    let list = sells.get(o.type_id);
    if (!list) { list = []; sells.set(o.type_id, list); }
    // Only the cheap end matters; the rest is counted as "more".
    if (list.length >= KEEP_SELLS && o.price >= list[list.length - 1].price) { more.add(o.type_id); return; }
    let i = list.length;
    while (i > 0 && list[i - 1].price > o.price) i--;
    list.splice(i, 0, { id: o.order_id, price: o.price, units: o.volume_remain, total: o.volume_total, issued: o.issued ?? '' });
    if (list.length > KEEP_SELLS) { list.pop(); more.add(o.type_id); }
  };
  const base = `https://esi.evetech.net/markets/${THE_FORGE}/orders/?order_type=all`;
  const first = await page(`${base}&page=1`);
  first.orders.forEach(fold);
  let next = 2, failed = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next <= first.pages) {
      const p = next++;
      try { (await page(`${base}&page=${p}`)).orders.forEach(fold); } catch { failed++; }
    }
  }));
  // A read missing much of the book would call listings mistakes that aren't: keep the last one instead.
  if (failed > first.pages / 10) return { skipped: `${failed} of ${first.pages} pages failed` };

  // The detector's first test needs only the book: a gap at the cheap end wide enough to pay at the best rates.
  const keep = 1 - BASE_RATES.f - BASE_RATES.t;
  const candidates = [...sells].filter(([t, l]) => {
    if (npc.has(t) || !l.length) return false;
    const next = l.find((o) => o.price > l[0].price);
    return !next || tickDown(next.price) * keep >= l[0].price * (1 + SNIPE_FLOOR.margin);
  }).map(([t]) => t);
  // Bids only matter for what somebody holds in Jita.
  const ledgers = (await db.prepare(`SELECT char_id FROM keys WHERE purpose = 'main'`).all<{ char_id: number }>()).results.map((r) => r.char_id);
  const stocks = new Map<number, Stock | null>();
  for (const id of ledgers) stocks.set(id, await docOf<Stock>(db, id, 'stock'));
  const held = new Set<number>();
  for (const s of stocks.values()) for (const t of Object.keys(s?.jita ?? {})) if (bids.has(Number(t))) held.add(Number(t));

  const want = [...new Set([...candidates, ...held])];
  const stats = new Map<number, SnipeStats>();
  for (let i = 0; i < want.length; i += 90) {
    const part = want.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, stats FROM scan_items WHERE type_id IN (${inList(part.length)})`).bind(...part)
      .all<{ type_id: number; stats: string }>()).results;
    for (const r of rows) stats.set(r.type_id, JSON.parse(r.stats) as SnipeStats);
  }
  const listings: SnipeListing[] = [];
  for (const t of candidates) {
    const x = findListing(t, sells.get(t)!, more.has(t), stats.get(t), now, npcAt.get(t));
    if (x) listings.push(x);
  }
  // Each listing's category, for leaving blueprints out unless asked (page and mail alike): kept in D1, so only types
  // never listed before go to ESI. One it couldn't read is null, left out with the blueprints, and asked for next round.
  const kinds = await categoriesOf(db, listings.map((l) => l.typeId), now).catch((e) => { console.error('sniper categories failed', e); return new Map<number, number>(); });
  for (const l of listings) l.category = kinds.get(l.typeId) ?? null;
  const kept: SnipeBid[] = [];
  for (const t of held) {
    const x = findBid(t, bids.get(t)!, stats.get(t), npcAt.get(t));
    if (x) kept.push(x);
  }
  const read: SnipeRead = { at: new Date(now).toISOString(), expires: first.expires ?? null, pages: first.pages, listings, bids: kept };
  await db.prepare('INSERT INTO scan_meta (key, data) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET data = excluded.data').bind('snipes', JSON.stringify(read)).run();
  // Every listing shown, remembered for a month: a buy of one is then marked as found by the Sniper. What it claimed
  // (relist at `resale`) is kept as first shown, to be checked against what the item traded at afterwards.
  const saw = db.prepare(`INSERT INTO snipe_seen (order_id, type_id, lo, hi, first_seen, last_seen, resale, clean, doubts, units)
    VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(order_id) DO UPDATE SET lo = excluded.lo, hi = excluded.hi, last_seen = excluded.last_seen`);
  await db.batch([
    ...listings.map((l) => saw.bind(l.orderIds[0], l.typeId, l.cheapest, l.top, now, l.resale, l.doubts.length ? 0 : 1, l.doubts.join(','), l.units)),
    db.prepare('DELETE FROM snipe_seen WHERE last_seen < ?1').bind(now - SEEN_DAYS * 86400_000),
  ]);

  const mailed: Record<number, number> = {};
  for (const id of ledgers) {
    try { mailed[id] = await mailLedger(env, id, read, stocks.get(id) ?? null, now); } catch (e) { console.error('sniper mail failed', id, e); }
  }
  return { pages: first.pages, failed, candidates: candidates.length, listings: listings.length, clean: listings.filter((l) => !l.doubts.length).length, bids: kept.length, mailed };
}

/**
 * The Sniper, checked: each listing it showed at least a day ago and not yet settled, against its item's daily
 * history since (`snipeOutcome`): did trading get up to the relist price it gave within a week?
 */
export async function settleSnipes(db: D1Database, now = Date.now()): Promise<{ open: number; settled: number }> {
  const open = (await db.prepare(`SELECT order_id, type_id, first_seen, resale FROM snipe_seen WHERE outcome IS NULL AND resale IS NOT NULL AND first_seen < ?1`)
    .bind(now - 86400_000).all<{ order_id: number; type_id: number; first_seen: number; resale: number }>()).results;
  if (!open.length) return { open: 0, settled: 0 };
  const rows = new Map<number, HistRow[]>();
  await eachHistory(db, [...new Set(open.map((r) => r.type_id))], now, (t, h) => rows.set(t, h), { cap: 400 });
  const set = db.prepare('UPDATE snipe_seen SET outcome = ?2, reached_days = ?3 WHERE order_id = ?1');
  const stmts: D1PreparedStatement[] = [];
  for (const r of open) {
    // Every item the Sniper judges had history; none now means the read failed, so it waits for the next day.
    const h = rows.get(r.type_id);
    if (!h) continue;
    const o = snipeOutcome(r.first_seen, r.resale, h, now);
    if (o) stmts.push(set.bind(r.order_id, o.outcome, o.days));
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { open: open.length, settled: stmts.length };
}

type Tally = { n: number; reached: number };
/** What the Sniper's listings of the last 30 days came to: clean ones, doubted ones, and each doubt on its own. */
export async function snipeSummary(db: D1Database, now = Date.now()) {
  const rows = (await db.prepare(`SELECT clean, doubts, outcome, reached_days FROM snipe_seen WHERE outcome IS NOT NULL AND first_seen > ?1`)
    .bind(now - 30 * 86400_000).all<{ clean: number; doubts: string | null; outcome: string; reached_days: number | null }>()).results;
  const tally = (list: typeof rows): Tally => ({ n: list.length, reached: list.filter((r) => r.outcome === 'reached').length });
  const clean = rows.filter((r) => r.clean === 1);
  const days = clean.filter((r) => r.reached_days != null).map((r) => r.reached_days!).sort((a, b) => a - b);
  const byDoubt: Record<string, Tally> = {};
  for (const d of ['flood', 'moved', 'thin', 'stale', 'several']) {
    const t = tally(rows.filter((r) => (r.doubts ?? '').split(',').includes(d)));
    if (t.n) byDoubt[d] = t;
  }
  return { clean: { ...tally(clean), medianDays: days.length ? days[days.length >> 1] : null }, doubted: tally(rows.filter((r) => r.clean === 0)), byDoubt };
}

/** Mails one ledger the listings and bids that clear its own bar, at its own rates. */
async function mailLedger(env: Env, charId: number, read: SnipeRead, stock: Stock | null, now: number): Promise<number> {
  const hasSender = await env.DB.prepare(`SELECT 1 AS y FROM keys WHERE char_id = ?1 AND purpose = 'mailer'`).bind(charId).first();
  if (!hasSender) return 0;
  const cfg: AlertConfig = sanitizeAlerts(await docOf<Partial<AlertConfig>>(env.DB, charId, 'alerts'));
  if (!cfg.on || !cfg.mail || !cfg.ev.snipe || !cfg.mailEv.snipe) return 0;
  const settings = sanitizeSettings(await docOf<Partial<Settings>>(env.DB, charId, 'settings'));
  const r = rates(settings);
  const bar = { minIsk: cfg.snipeMinIsk, minPct: cfg.snipeMinPct };
  // Your own orders aren't snipes for you, or bids to sell into (notYours).
  const open = (await env.DB.prepare(`SELECT id FROM records WHERE char_id = ?1 AND kind = 'orders' AND data IS NOT NULL AND json_extract(data, '$.state') = 'open'`)
    .bind(charId).all<{ id: string }>()).results.map((x) => Number(x.id));
  const theirs = notYours(read, new Set(open));
  // Blueprints only when asked, set aside before the mail's few are picked, or they'd take the places and go unsent.
  const rows = splitBlueprints(judgeListings(theirs.listings, r, settings.share, bar), cfg.snipeBlueprints).shown.filter((x) => x.worth).slice(0, MAIL_LISTINGS);
  const heldRows = judgeBids(theirs.bids, r, stock?.jita ?? {}, bar).filter((x) => x.worth);
  if (!rows.length && !heldRows.length) return 0;
  const names = await namesAnywhere(env.DB, charId, [...rows.map((x) => x.typeId), ...heldRows.map((x) => x.typeId)]);
  const price = (p: number) => Math.round(p).toLocaleString('en-US');
  const findings: Finding[] = [
    ...rows.map((x): Finding => {
      const name = names[x.typeId] ?? `Item #${x.typeId}`;
      return {
        kind: 'snipe', key: `snipe:${x.orderIds[0]}@${x.cheapest}`, title: 'Mistake listing', typeId: x.typeId, name, isk: x.profit,
        text: `${name}: ${x.units.toLocaleString('en-US')} listed at ${price(x.cheapest)} where it trades at ${price(x.fair)}. Buy and relist at ${price(x.resale)}${x.npc != null && x.resale >= x.npc ? ', what NPCs sell it for elsewhere in The Forge,' : ''} for ${iskBig(x.profit)} after fees.`,
        snipe: { side: 'buy', units: x.units, cheapest: x.cheapest, top: x.top, cost: x.cost, resale: x.resale, fair: x.fair, nextAsk: x.nextAsk, profit: x.profit, pct: x.pct, pricedAt: x.pricedAt, orders: x.orderIds.length, sellDays: x.sellDays, ...(x.npc != null ? { npc: x.npc } : {}) },
      };
    }),
    ...heldRows.map((x): Finding => {
      const name = names[x.typeId] ?? `Item #${x.typeId}`;
      return {
        kind: 'snipe', key: `snipebid:${x.orderId}@${x.price}`, title: 'High bid for what you hold', typeId: x.typeId, name, isk: x.gain,
        text: `${name}: a bid at ${price(x.price)} for what you hold, well over where it trades (${price(x.fair)}). Selling ${x.qty.toLocaleString('en-US')} into it gets ${iskBig(x.gain)} more than listing.`,
        snipe: { side: 'sell', qty: x.qty, held: x.held, price: x.price, proceeds: x.proceeds, gain: x.gain, fair: x.fair, minVolume: x.minVolume, ...(x.npc != null ? { npc: x.npc } : {}) },
      };
    }),
  ];
  return (await mailFindings(env, charId, findings, cfg, now)).mailed;
}
