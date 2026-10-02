/**
 * Alert mail from the cloud, so an order worth moving or a colony about to stop reaches you in game with
 * no browser open.
 *
 * It asks exactly what the app's own checks ask, with the same code: each open Jita order judged against
 * the book the market watch has just read (`judgeOrder`), its side's pace from history blended with the
 * watched trade (`sidePaceOf`), and the same findings and mail (`orderFindings`, `piFindings`,
 * `alertMail`). What it adds is only where the answers come from: D1 instead of the browser's stores.
 *
 * It runs for a ledger that has handed the cloud both logins (the trading character's, and a second
 * character to send from, since a mail to yourself doesn't show until you relog) and has alerts and alert
 * mail switched on in Settings, at the check interval chosen there. Squeeze and suspicious-market alerts
 * stay with the browser: they read signals the cloud doesn't keep.
 */
import { alertMail, isStaleAlertMail, mailKey, orderFacts, orderFindings, piFindings, repeatMs, shouldAlert, tidyEvery, type Finding } from '../../src/lib/alerts';
import { readColony, type PlanetHead, type RawColony } from '../../src/lib/colony';
import type { OrderRecord, TxRecord } from '../../src/lib/esiRecords';
import { rates, sanitizeSettings, type Settings } from '../../src/lib/fees';
import { FILL_WINDOW, recentRange } from '../../src/lib/fills';
import { observedFlow, RELIST_MIN_H, sidePaceOf, type FlowDay, type OrderLite } from '../../src/lib/flow';
import { judgeProspect, type Book } from '../../src/lib/evaluate';
import { leaveOutcome, leaveRatio, predictionOutcome, type LeaveOutcome } from '../../src/lib/track';
import { DEFAULT_FILTERS, passesGate, statsFrom } from '../../src/lib/prospects';
import { sanitizeAlerts, sanitizeLeave } from '../../src/lib/prefs';
import { paceDay } from '../../src/lib/prospects';
import { byUrgency, judgeOrder, type Relist } from '../../src/lib/relist';
import { planTargets, sanitizePlans } from '../../src/lib/plans';
import { buyerShare, competitionShare, type BookSold } from '../../src/lib/split';
import type { AlertConfig, AlertLogEntry, BookLevel, Prospect, ProspectFilters } from '../../src/lib/types';
import { noteJob } from './archive';
import { esiDelete, esiGet, esiPost, useLogin, type Login } from './eve';
import { flowFor, unpack } from './market';
import { histories } from './hist';

const JITA_44 = 60003760;
const PLEX = 44992;
const S = {
  planets: 'esi-planets.manage_planets.v1',
  mailRead: 'esi-mail.read_mail.v1',
  mailOrganize: 'esi-mail.organize_mail.v1',
};
/** A book older than this means the market watch has stalled; judging an order on it could say the wrong thing. */
const BOOK_MAX_AGE = 15 * 60_000;
/** Your own buys count as fills for this long (`fillingNow` in fills.ts). */
const OWN_FILL_MS = 3 * 86400_000;
/** Colonies change slowly and a programme's end is known a day ahead, so they're read hourly. */
const PI_EVERY = 60 * 60_000;

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string; APP_URL: string };

async function doc<T>(db: D1Database, charId: number, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT data FROM docs WHERE char_id = ?1 AND key = ?2').bind(charId, key).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as T) : null;
}
async function lastRun(db: D1Database, charId: number, job: string): Promise<number> {
  return (await db.prepare('SELECT last_run FROM jobs WHERE char_id = ?1 AND job = ?2').bind(charId, job).first<{ last_run: number }>())?.last_run ?? 0;
}
const inList = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `?${i + from}`).join(',');

async function namesFor(db: D1Database, charId: number, ids: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90).map(String);
    const rows = (await db.prepare(`SELECT id, data FROM records WHERE char_id = ?1 AND kind = 'names' AND data IS NOT NULL AND id IN (${inList(part.length, 2)})`)
      .bind(charId, ...part).all<{ id: string; data: string }>()).results;
    for (const r of rows) out[Number(r.id)] = JSON.parse(r.data);
  }
  return out;
}

/**
 * Every open Jita order judged against the book the market watch last read, the way the Orders page judges
 * it. Orders whose book is missing or stale are left out and counted, never judged on old data.
 */
export type Judged = {
  list: Relist[]; unread: number;
  /** For each order you're leaving, the pace the planner's model expects it to fill at, in units a day. */
  pace?: Record<number, number>;
};

export async function judgeAll(db: D1Database, charId: number, settings: Settings, now = Date.now()): Promise<Judged> {
  const mine = (await db.prepare(`SELECT data FROM records WHERE char_id = ?1 AND kind = 'orders' AND data IS NOT NULL AND json_extract(data, '$.state') = 'open'`)
    .bind(charId).all<{ data: string }>()).results
    .map((r) => JSON.parse(r.data) as OrderRecord)
    .filter((o) => o.volumeRemain > 0 && (o.typeId === PLEX || o.locationId === JITA_44));
  const types = [...new Set(mine.map((o) => o.typeId))];
  if (!types.length) return { list: [], unread: 0 };

  const books: Record<number, { orders: ReturnType<typeof unpack>; sold: BookSold | undefined }> = {};
  for (let i = 0; i < types.length; i += 90) {
    const part = types.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, orders, sold, at FROM books WHERE type_id IN (${inList(part.length)})`).bind(...part)
      .all<{ type_id: number; orders: string; sold: string | null; at: number }>()).results;
    for (const r of rows) if (now - r.at <= BOOK_MAX_AGE) books[r.type_id] = { orders: unpack(r.orders), sold: r.sold ? JSON.parse(r.sold) : undefined };
  }
  const hist = await histories(db, types, now);
  const flow = await flowFor(db, types);
  const costs = (await doc<Record<string, number>>(db, charId, 'costs')) ?? {};
  // Items you're leaving orders on (the planner's "Place and leave"): told to move only when trading stops reaching them.
  const leave = new Set(sanitizeLeave(await doc<unknown>(db, charId, 'leave')));
  // The plan each item belongs to while its position is open (planTargets), so a plan's buy is never raised into a loss.
  // A ledger whose app hasn't written plans has none: judged as before.
  const plans = sanitizePlans(await doc<unknown>(db, charId, 'plans'));
  const positions = plans.length
    ? (await db.prepare(`SELECT data FROM records WHERE char_id = ?1 AND kind = 'positions' AND data IS NOT NULL`).bind(charId).all<{ data: string }>()).results
      // A row that doesn't parse, or isn't a position, is skipped: never the whole round.
      .map((r): unknown => { try { return JSON.parse(r.data); } catch { return null; } })
      .filter((p): p is { id: string; typeId: number; status: 'open' | 'closed' } => !!p && typeof p === 'object'
        && typeof (p as { id?: unknown }).id === 'string' && typeof (p as { typeId?: unknown }).typeId === 'number'
        && ((p as { status?: unknown }).status === 'open' || (p as { status?: unknown }).status === 'closed'))
    : [];
  const targets = planTargets(plans, positions, rates(settings));
  const since = new Date(now - OWN_FILL_MS).toISOString();
  const txs = (await db.prepare(`SELECT data FROM records WHERE char_id = ?1 AND kind = 'txs' AND data IS NOT NULL AND json_extract(data, '$.date') >= ?2`)
    .bind(charId, since).all<{ data: string }>()).results.map((r) => JSON.parse(r.data) as TxRecord);

  let unread = 0;
  // Your other orders on an item aren't rivals or bids to sell into (judgeOrder).
  const yours = mine.map((o) => o.orderId);
  const list: Relist[] = [];
  const pace: Record<number, number> = {};
  for (const o of mine) {
    const book = books[o.typeId];
    if (!book) { unread++; continue; }
    const h = hist[o.typeId];
    // As the app's order check: the typical day, history's split, the last 14 days' lows; nothing when
    // there's no history.
    const watched: FlowDay = observedFlow({ [o.typeId]: flow[o.typeId] ?? {} }, o.typeId, now);
    const perDay = sidePaceOf({ daily: h ? paceDay(h, now) : null, buyers: h ? buyerShare(h.slice(-30)) : undefined, sold: book.sold, watched }, o.isBuy).perDay;
    const range = h ? recentRange(h, undefined, now, flow[o.typeId]) : null;
    const x = judgeOrder(o, { book: book.orders, perDay, avgCost: costs[o.typeId], lows: range?.lows ?? null, highs: range?.highs ?? null, leave: leave.has(o.typeId), txs, watched, yours, plan: targets[o.typeId] ?? null }, settings, now);
    if (!x.gone) list.push(x);
    // Left behind the front on purpose: the planner's pace for it (`throughput`), its side's trade at your share,
    // scaled for the orders it queues among and for how often trading reaches its price.
    if (x.left && !x.gone && perDay && x.reach) {
      const rivals = book.orders.filter((b) => b.isBuy === o.isBuy && b.id !== o.orderId).length;
      pace[o.orderId] = perDay * competitionShare(settings.share, rivals) * (x.reach / FILL_WINDOW);
    }
  }
  return { list: list.sort(byUrgency), unread, pace };
}

type RawPlanetHead = { planet_id: number; planet_type: string; solar_system_id: number; upgrade_level: number; num_pins: number; last_update: string };

/** Extraction programmes ending or ended, read from the colonies themselves. */
async function colonyFindings(db: D1Database, charId: number, token: string, now: number): Promise<Finding[]> {
  const heads: PlanetHead[] = (await esiGet<RawPlanetHead[]>(`/characters/${charId}/planets/`, { token })).data.map((p) => ({
    planetId: p.planet_id, planetType: p.planet_type, solarSystemId: p.solar_system_id,
    upgradeLevel: p.upgrade_level, numPins: p.num_pins, lastUpdate: p.last_update,
  }));
  const colonies = [];
  for (const h of heads) colonies.push(readColony(h, (await esiGet<RawColony>(`/characters/${charId}/planets/${h.planetId}/`, { token })).data, now));
  const systems: Record<number, string> = {};
  for (const id of new Set(heads.map((h) => h.solarSystemId))) {
    try { systems[id] = (await esiGet<{ name: string }>(`/universe/systems/${id}/`)).data.name; } catch { /* planet named instead */ }
  }
  const products = [...new Set(colonies.flatMap((c) => c.extractors.map((e) => e.productTypeId).filter((t): t is number => t != null)))];
  const names = await namesFor(db, charId, products);
  return piFindings(colonies, (id) => systems[id], (id) => names[id], now);
}

/** Send one mail from the second character to the trading one. Returns the mail's ID. */
async function send(env: Env, charId: number, findings: Finding[], cfg: AlertConfig, test = false): Promise<number> {
  const sender = await useLogin(env, charId, 'mailer');
  if (!sender) throw new Error('No sending character is kept');
  const { subject, body } = alertMail(findings, { appUrl: env.APP_URL, keepMin: cfg.mailKeepMin, test });
  return esiPost<number>(`/characters/${sender.charId}/mail/`, {
    approved_cost: 0, subject, body, recipients: [{ recipient_id: charId, recipient_type: 'character' }],
  }, sender.access);
}

type MailHeader = { mail_id: number; from?: number; subject?: string; timestamp?: string };

/**
 * Delete alert mails older than the setting, as the app does: only mails from you or the sending
 * character whose subject starts "Jita Ledger:", and the sender's copy too when it can.
 */
async function tidy(env: Env, charId: number, main: Login, cfg: AlertConfig, now: number): Promise<number | null> {
  const keep = cfg.mailKeepMin;
  if (keep == null || !main.scopes.includes(S.mailRead) || !main.scopes.includes(S.mailOrganize)) return null;
  if (now - (await lastRun(env.DB, charId, 'mailtidy')) < tidyEvery(keep)) return null;
  const mailer = await env.DB.prepare(`SELECT token_char_id AS id FROM keys WHERE char_id = ?1 AND purpose = 'mailer'`).bind(charId).first<{ id: number }>();
  const senders = mailer ? [charId, mailer.id] : [charId];
  const stale: MailHeader[] = [];
  let last: number | undefined;
  for (let page = 0; page < 6; page++) {
    const { data } = await esiGet<MailHeader[]>(`/characters/${charId}/mail/`, { token: main.access, query: { last_mail_id: last } });
    stale.push(...data.filter((m) => isStaleAlertMail(m, senders, keep, now)));
    if (data.length < 50) break;
    last = Math.min(...data.map((m) => m.mail_id));
  }
  let sender: Login | null = null;
  if (mailer && stale.some((m) => m.from === mailer.id)) sender = await useLogin(env, charId, 'mailer').catch(() => null);
  let gone = 0;
  for (const m of stale) {
    await esiDelete(`/characters/${charId}/mail/${m.mail_id}/`, main.access);
    gone++;
    // The sender's Sent copy, best effort.
    if (sender && m.from === sender.charId && sender.scopes.includes(S.mailOrganize)) await esiDelete(`/characters/${sender.charId}/mail/${m.mail_id}/`, sender.access).catch(() => undefined);
  }
  await noteJob(env.DB, charId, 'mailtidy', { ok: true, detail: { deleted: gone } });
  return gone;
}

/**
 * A book as Prospects sees it, from the orders the watch last read. The watch keeps only Jita's orders, so NPC sellers
 * elsewhere in The Forge come from the day's full scan (`npcAnywhere`), when given.
 */
export function bookOf(orders: OrderLite[], at: number, sold: Book['sold'], npcAnywhere?: number | null): Book {
  const levels = (side: OrderLite[], desc: boolean): BookLevel[] => {
    const out: BookLevel[] = [];
    for (const o of [...side].sort((a, b) => (desc ? b.price - a.price : a.price - b.price))) {
      const last = out[out.length - 1];
      if (last && last.price === o.price) last.volume += o.volume;
      else if (out.length < 7) out.push({ price: o.price, volume: o.volume });
    }
    return out;
  };
  const bids = orders.filter((o) => o.isBuy), asks = orders.filter((o) => !o.isBuy);
  const topBuys = levels(bids, true), topSells = levels(asks, false);
  return {
    at: new Date(at).toISOString(), bestBuy: topBuys[0]?.price ?? null, bestSell: topSells[0]?.price ?? null,
    buyOrders: bids.length, sellOrders: asks.length, topBuys, topSells, npcSell: false, sold,
    ...(npcAnywhere != null && npcAnywhere > 0 ? { npcAnywhere } : {}),
  };
}

/**
 * NPCs' lowest price anywhere in The Forge for each of these items, as the day's full scan noted it. A row from a Worker
 * before it noted them, or no row, is none: nothing changes.
 */
async function npcPrices(db: D1Database, types: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (let i = 0; i < types.length; i += 90) {
    const part = types.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, json_extract(book, '$.npcAnywhere') AS npc FROM scan_items WHERE type_id IN (${inList(part.length)})`).bind(...part)
      .all<{ type_id: number; npc: number | null }>()).results;
    for (const r of rows) if (typeof r.npc === 'number' && r.npc > 0) out.set(r.type_id, r.npc);
  }
  return out;
}

/** Most opportunities in one mail. */
const OPP_PER_MAIL = 3;

/**
 * The watched items that clear this ledger's Prospects filters now, judged exactly as Prospects judges them
 * (`judgeProspect`) on the book the watch just read, history, and what was watched. Only items with no warning
 * flag, watched at least RELIST_MIN_H, and not already traded. `fresh` are the ones that didn't qualify at the
 * last check: an item is mailed when it opens up, not every round it stays open.
 */
export type OppStages = { candidates: number; withBook: number; withHistory: number; watched: number; passFilters: number; priced: number; clean: number };

export async function opportunities(db: D1Database, charId: number, settings: Settings, now = Date.now(), record = true): Promise<{ qualifying: Prospect[]; fresh: Prospect[]; checked: number; stages: OppStages }> {
  const watch = await doc<{ types?: number[]; filters?: Partial<ProspectFilters> }>(db, charId, 'watch');
  const held = new Set((await db.prepare(`SELECT CAST(json_extract(data, '$.typeId') AS INTEGER) AS t FROM records WHERE char_id = ?1 AND data IS NOT NULL AND
      ((kind = 'orders' AND json_extract(data, '$.state') = 'open') OR (kind = 'positions' AND json_extract(data, '$.status') = 'open'))`)
    .bind(charId).all<{ t: number }>()).results.map((r) => r.t));
  const types = (watch?.types ?? []).filter((t) => !held.has(t)).slice(0, 200);
  const stages: OppStages = { candidates: types.length, withBook: 0, withHistory: 0, watched: 0, passFilters: 0, priced: 0, clean: 0 };
  if (!types.length) return { qualifying: [], fresh: [], checked: 0, stages };
  const filters: ProspectFilters = { ...DEFAULT_FILTERS, ...(watch?.filters ?? {}), busy: false, partial: false };

  const books: Record<number, Book> = {};
  // What NPCs sell it at elsewhere in The Forge leaves an item out as Prospects does (judgeProspect): from the full scan.
  const npc = await npcPrices(db, types).catch(() => new Map<number, number>());
  for (let i = 0; i < types.length; i += 90) {
    const part = types.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, orders, sold, at FROM books WHERE type_id IN (${inList(part.length)})`).bind(...part)
      .all<{ type_id: number; orders: string; sold: string | null; at: number }>()).results;
    for (const r of rows) if (now - r.at <= BOOK_MAX_AGE) books[r.type_id] = bookOf(unpack(r.orders), r.at, r.sold ? JSON.parse(r.sold) : undefined, npc.get(r.type_id));
  }
  const fresh = types.filter((t) => books[t]);
  stages.withBook = fresh.length;
  const hist = await histories(db, fresh, now);
  const flow = await flowFor(db, fresh, 14, now);
  const qualifying: Prospect[] = [];
  let checked = 0;
  for (const t of fresh) {
    const rows = hist[t];
    if (!rows) continue;
    checked++; stages.withHistory++;
    const watched = observedFlow({ [t]: flow[t] ?? {} }, t, now);
    if (watched.h < RELIST_MIN_H) continue;
    stages.watched++;
    const stats = statsFrom(t, rows, now);
    if (!stats || !passesGate(stats, filters)) continue;
    stages.passFilters++;
    const book = books[t];
    const p = judgeProspect(stats, book, settings, filters, book.buyOrders + book.sellOrders, false, { days: flow[t], flow: watched });
    if (!p) continue;
    stages.priced++;
    if (!p.warnings.length) { stages.clean++; qualifying.push(p); }
  }

  // Which of them are new since the last check; items that stopped qualifying are forgotten, so they can be
  // mailed again the next time they open up. Items this round couldn't judge (a stale book) are left as they were.
  const seen = new Set((await db.prepare('SELECT type_id FROM opp_seen WHERE char_id = ?1').bind(charId).all<{ type_id: number }>()).results.map((r) => r.type_id));
  const nowIn = new Set(qualifying.map((p) => p.typeId));
  const judged = new Set(fresh.filter((t) => hist[t]));
  const stmts: D1PreparedStatement[] = [];
  for (const p of qualifying) if (!seen.has(p.typeId)) stmts.push(db.prepare('INSERT OR IGNORE INTO opp_seen (char_id, type_id, since) VALUES (?1, ?2, ?3)').bind(charId, p.typeId, now));
  for (const t of seen) if (judged.has(t) && !nowIn.has(t)) stmts.push(db.prepare('DELETE FROM opp_seen WHERE char_id = ?1 AND type_id = ?2').bind(charId, t));
  if (record) for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { qualifying, fresh: qualifying.filter((p) => !seen.has(p.typeId)).sort((a, b) => b.iskPerDay - a.iskPerDay), checked, stages };
}

/** Names for items a ledger may never have traded: its own names first, then ESI's. */
export async function namesAnywhere(db: D1Database, charId: number, ids: number[]): Promise<Record<number, string>> {
  const out = await namesFor(db, charId, ids);
  const missing = ids.filter((id) => !out[id]);
  if (missing.length) {
    try { for (const n of await esiPost<{ id: number; name: string }[]>('/universe/names/', missing)) out[n.id] = n.name; } catch { /* left as numbers */ }
  }
  return out;
}

/**
 * "Clears in", checked against what happened. Each beaten order's prediction is kept once per order and price;
 * the order reaching the front (or selling out) resolves it, a new price or a cancel voids it, and one still not
 * at the front after TRACK_DAYS is late. Rounds whose books were stale leave predictions as they were.
 */
export async function trackRecord(db: D1Database, charId: number, judged: Judged, now = Date.now()): Promise<{ added: number; resolved: number }> {
  const stmts: D1PreparedStatement[] = [];
  const add = db.prepare('INSERT OR IGNORE INTO predictions (char_id, order_id, price, type_id, is_buy, at, hours, ahead) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)');
  let added = 0;
  for (const x of judged.list) {
    if (!x.beaten || !Number.isFinite(x.hoursToFront) || x.hoursToFront <= 0) continue;
    stmts.push(add.bind(charId, x.orderId, x.price, x.typeId, x.isBuy ? 1 : 0, now, x.hoursToFront, x.aheadUnits));
    added++;
  }
  const open = (await db.prepare('SELECT order_id, price, at FROM predictions WHERE char_id = ?1 AND outcome IS NULL').bind(charId)
    .all<{ order_id: number; price: number; at: number }>()).results;
  // "Place and leave", checked: each left order's expected pace at its price, against what it fills.
  const leaveAdd = db.prepare(`INSERT OR IGNORE INTO leave_track (char_id, order_id, price, type_id, is_buy, at, pred, remain0, remain, seen_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?6)`);
  for (const x of judged.list) {
    const pred = judged.pace?.[x.orderId];
    if (pred && pred > 0) { stmts.push(leaveAdd.bind(charId, x.orderId, x.price, x.typeId, x.isBuy ? 1 : 0, now, pred, x.volumeRemain)); added++; }
  }
  const leaving = (await db.prepare('SELECT order_id, price, at, pred, remain0, remain, seen_at FROM leave_track WHERE char_id = ?1 AND outcome IS NULL').bind(charId)
    .all<{ order_id: number; price: number; at: number; pred: number; remain0: number; remain: number; seen_at: number }>()).results;
  const byOrder = new Map(judged.list.map((x) => [x.orderId, x]));
  const resolve = db.prepare('UPDATE predictions SET outcome = ?4, resolved_at = ?5 WHERE char_id = ?1 AND order_id = ?2 AND price = ?3');
  let resolved = 0;
  const gone = [...new Set([...open, ...leaving].filter((p) => !byOrder.has(p.order_id)).map((p) => String(p.order_id)))];
  const records = new Map<string, { state: string; volumeRemain: number }>();
  for (let i = 0; i < gone.length; i += 90) {
    const part = gone.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT id, data FROM records WHERE char_id = ?1 AND kind = 'orders' AND id IN (${inList(part.length, 2)})`)
      .bind(charId, ...part).all<{ id: string; data: string | null }>()).results;
    for (const r of rows) if (r.data) records.set(r.id, JSON.parse(r.data));
  }
  for (const p of open) {
    const outcome = predictionOutcome(p, byOrder.get(p.order_id), records.get(String(p.order_id)), now);
    if (outcome) { stmts.push(resolve.bind(charId, p.order_id, p.price, outcome, now)); resolved++; }
  }
  const leaveDone = db.prepare('UPDATE leave_track SET outcome = ?4, filled = ?5, days = ?6, resolved_at = ?7 WHERE char_id = ?1 AND order_id = ?2 AND price = ?3');
  const leaveSeen = db.prepare('UPDATE leave_track SET remain = ?4, seen_at = ?5 WHERE char_id = ?1 AND order_id = ?2 AND price = ?3');
  for (const p of leaving) {
    const x = byOrder.get(p.order_id);
    const row = { at: p.at, remain0: p.remain0, remain: p.remain, seenAt: p.seen_at, pred: p.pred };
    const o: LeaveOutcome | null = leaveOutcome(row, x && { price: x.price, volumeRemain: x.volumeRemain, left: x.left }, records.get(String(p.order_id)), p.price, now);
    if (o) { stmts.push(leaveDone.bind(charId, p.order_id, p.price, o.outcome, o.filled, o.days, now)); resolved++; }
    // Still at its price: note what's left, when it changes or hourly, so its end is known to within the hour.
    else if (x && (x.volumeRemain !== p.remain || now - p.seen_at >= 3600_000)) stmts.push(leaveSeen.bind(charId, p.order_id, p.price, x.volumeRemain, now));
  }
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { added, resolved };
}

/** How "Clears in" has done on this ledger's orders over the last 30 days. */
export async function trackSummary(db: D1Database, charId: number, now = Date.now()) {
  const rows = (await db.prepare(`SELECT at, hours, outcome, resolved_at FROM predictions WHERE char_id = ?1 AND outcome IN ('front', 'late') AND resolved_at > ?2`)
    .bind(charId, now - 30 * 86400_000).all<{ at: number; hours: number; outcome: string; resolved_at: number }>()).results;
  const ratios = rows.map((r) => (r.outcome === 'front' ? (r.resolved_at - r.at) / 3600_000 / r.hours : Infinity)).sort((a, b) => a - b);
  const within = ratios.filter((x) => x <= 2).length;
  return { checked: rows.length, within2x: within, medianRatio: ratios.length ? ratios[ratios.length >> 1] : null };
}

/** How "Place and leave" has done: left orders' fills against the pace expected, over the last 30 days. */
export async function leaveSummary(db: D1Database, charId: number, now = Date.now()) {
  const rows = (await db.prepare(`SELECT pred, filled, days FROM leave_track WHERE char_id = ?1 AND outcome = 'checked' AND resolved_at > ?2`)
    .bind(charId, now - 30 * 86400_000).all<{ pred: number; filled: number; days: number }>()).results;
  const ratios = rows.map((r) => leaveRatio({ outcome: 'checked', filled: r.filled, days: r.days }, r.pred)).filter((x): x is number => x != null).sort((a, b) => a - b);
  const m = ratios.length >> 1;
  return {
    checked: ratios.length,
    medianRatio: !ratios.length ? null : ratios.length % 2 ? ratios[m] : (ratios[m - 1] + ratios[m]) / 2,
    none: rows.filter((r) => r.filled === 0).length,
  };
}

export type AlertRound = { ran: boolean; judged: number; unread: number; found: number; mailed: number; mailId: number | null; tidied: number | null; why?: string };

/**
 * One round for one ledger: tidy old mail, then, when alerts and mail are on and the interval has passed,
 * judge the orders (and hourly the colonies), and mail whatever the rules say is worth it, once.
 */
export async function alertRound(env: Env, charId: number, now = Date.now(), judgedAlready?: { list: Relist[]; unread: number }): Promise<AlertRound> {
  const out: AlertRound = { ran: false, judged: 0, unread: 0, found: 0, mailed: 0, mailId: null, tidied: null };
  const hasSender = await env.DB.prepare(`SELECT 1 AS y FROM keys WHERE char_id = ?1 AND purpose = 'mailer'`).bind(charId).first();
  if (!hasSender) return { ...out, why: 'no sender' };
  const cfg = sanitizeAlerts(await doc<Partial<AlertConfig>>(env.DB, charId, 'alerts'));
  const main = await useLogin(env, charId, 'main');
  if (!main) return { ...out, why: 'no login' };
  // Old mail goes on its own cadence, even with alerts off, as in the app.
  try { out.tidied = await tidy(env, charId, main, cfg, now); } catch (e) {
    await noteJob(env.DB, charId, 'mailtidy', { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
  if (!cfg.on || !cfg.mail) return { ...out, why: 'alert mail is off' };
  // The cron comes every five minutes; the check interval is the user's. A minute's slack keeps a
  // five-minute interval from slipping to ten.
  if (now - (await lastRun(env.DB, charId, 'alerts')) < cfg.interval * 60_000 - 60_000) return { ...out, why: 'not due' };
  out.ran = true;

  const settings = sanitizeSettings(await doc<Partial<Settings>>(env.DB, charId, 'settings'));
  const findings: Finding[] = [];
  if ((cfg.ev.move && cfg.mailEv.move) || (cfg.ev.clearing && cfg.mailEv.clearing)) {
    const { list, unread } = judgedAlready ?? await judgeAll(env.DB, charId, settings, now);
    out.judged = list.length; out.unread = unread;
    const names = await namesFor(env.DB, charId, [...new Set(list.map((x) => x.typeId))]);
    findings.push(...orderFindings(list, (id) => names[id] ?? `Item #${id}`));
  }
  if (cfg.ev.opportunity && cfg.mailEv.opportunity) {
    const o = await opportunities(env.DB, charId, settings, now);
    const top = o.fresh.slice(0, OPP_PER_MAIL);
    // The rest that newly qualify are counted in the mail, not dropped: they're in Prospects.
    const more = o.fresh.length - top.length;
    const names = await namesAnywhere(env.DB, charId, top.map((p) => p.typeId));
    for (const p of top) {
      const flow = observedFlow({ [p.typeId]: (await flowFor(env.DB, [p.typeId]))[p.typeId] ?? {} }, p.typeId, now);
      const name = names[p.typeId] ?? `Item #${p.typeId}`;
      findings.push({
        kind: 'opportunity', key: `opp:${p.typeId}`, title: 'Trade worth a look', typeId: p.typeId, name,
        text: `${name}: buy at ${Math.round(p.buy).toLocaleString('en-US')}, list at ${Math.round(p.sell).toLocaleString('en-US')}, ${(p.roi * 100).toFixed(1)}% after fees.`,
        opp: { buy: p.buy, sell: p.sell, roi: p.roi, iskPerDay: p.iskPerDay, qty: p.qty, daysToFlip: p.daysToFlip, watchedH: flow.h, bought: flow.sell, dumped: flow.buy, more: p === top[top.length - 1] ? more : 0 },
      });
    }
  }
  if (cfg.ev.pi && cfg.mailEv.pi && main.scopes.includes(S.planets) && now - (await lastRun(env.DB, charId, 'pi')) >= PI_EVERY - 60_000) {
    try {
      const pi = await colonyFindings(env.DB, charId, main.access, now);
      findings.push(...pi);
      await noteJob(env.DB, charId, 'pi', { ok: true, detail: { findings: pi.length } });
    } catch (e) {
      await noteJob(env.DB, charId, 'pi', { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  out.found = findings.length;

  const sent = await mailFindings(env, charId, findings, cfg, now);
  out.mailId = sent.mailId;
  out.mailed = sent.mailed;
  await noteJob(env.DB, charId, 'alerts', { ok: true, detail: { judged: out.judged, unread: out.unread, found: out.found, mailed: out.mailed } });
  return out;
}

/**
 * Mail whatever of `findings` the settings say to mail and hasn't gone out lately (the same order at the same price
 * within "Remind me again after"), as one mail, and remember it. The alert round and the sniper both send through here.
 */
export async function mailFindings(env: Env, charId: number, findings: Finding[], cfg: AlertConfig, now = Date.now()): Promise<{ mailId: number | null; mailed: number }> {
  const logged = (await env.DB.prepare('SELECT key, kind, at, title, text FROM alert_log WHERE char_id = ?1 AND at > ?2').bind(charId, now - repeatMs(cfg))
    .all<{ key: string; kind: AlertLogEntry['kind']; at: number; title: string; text: string }>()).results
    .map((r): AlertLogEntry => ({ key: r.key, kind: r.kind, at: new Date(r.at).toISOString(), title: r.title, text: r.text }));
  const mail = findings.filter((f) => cfg.mailEv[f.kind] && shouldAlert({ ...f, key: mailKey(f) }, cfg, logged, now));
  if (!mail.length) return { mailId: null, mailed: 0 };
  const mailId = await send(env, charId, mail, cfg);
  const log = env.DB.prepare(`INSERT INTO alert_log (char_id, key, kind, at, title, text) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(char_id, key) DO UPDATE SET kind = excluded.kind, at = excluded.at, title = excluded.title, text = excluded.text`);
  await env.DB.batch([
    ...mail.map((f) => log.bind(charId, mailKey(f), f.kind, now, f.title, f.text)),
    env.DB.prepare('DELETE FROM alert_log WHERE char_id = ?1 AND at < ?2').bind(charId, now - 7 * 86400_000),
  ]);
  return { mailId, mailed: mail.length };
}

/** What a round would judge and mail right now, sending nothing: for checking the cloud against the app. */
export async function previewRound(env: Env, charId: number, now = Date.now()) {
  const cfg = sanitizeAlerts(await doc<Partial<AlertConfig>>(env.DB, charId, 'alerts'));
  const settings = sanitizeSettings(await doc<Partial<Settings>>(env.DB, charId, 'settings'));
  const { list, unread } = await judgeAll(env.DB, charId, settings, now);
  const names = await namesFor(env.DB, charId, [...new Set(list.map((x) => x.typeId))]);
  const findings = orderFindings(list, (id) => names[id] ?? `Item #${id}`);
  const opp = await opportunities(env.DB, charId, settings, now, false);
  const oppNames = await namesAnywhere(env.DB, charId, opp.qualifying.map((p) => p.typeId));
  return {
    opportunities: { checked: opp.checked, stages: opp.stages, qualifying: opp.qualifying.map((p) => ({ typeId: p.typeId, name: oppNames[p.typeId], buy: p.buy, sell: p.sell, roi: p.roi, iskPerDay: p.iskPerDay, isNew: opp.fresh.includes(p) })) },
    unread,
    orders: list.map((x) => ({ orderId: x.orderId, typeId: x.typeId, name: names[x.typeId], isBuy: x.isBuy, price: x.price, verdict: x.verdict, newPrice: x.newPrice, hoursToFront: x.hoursToFront, why: x.why })),
    findings: findings.map((f) => ({ key: mailKey(f), kind: f.kind, text: f.text, isk: f.isk, passes: cfg.mailEv[f.kind] && shouldAlert({ ...f, key: mailKey(f) }, cfg, [], now) })),
  };
}

/**
 * A test mail from the cloud, built from one of your real orders as the app's test is, so what arrives
 * is what an alert about it would say. Proves the whole path: the sender's login, ESI's mail, the client.
 */
export async function testRound(env: Env, charId: number, now = Date.now()): Promise<{ mailId: number; about: string }> {
  const cfg = sanitizeAlerts(await doc<Partial<AlertConfig>>(env.DB, charId, 'alerts'));
  const settings = sanitizeSettings(await doc<Partial<Settings>>(env.DB, charId, 'settings'));
  const { list } = await judgeAll(env.DB, charId, settings, now);
  const x = list.find((v) => v.verdict === 'move') ?? list.find((v) => v.verdict === 'dry') ?? list.find((v) => v.beaten) ?? list[0];
  let finding: Finding;
  if (x) {
    const name = (await namesFor(env.DB, charId, [x.typeId]))[x.typeId] ?? `Item #${x.typeId}`;
    const found = orderFindings([x], () => name)[0];
    finding = found
      ? { ...found, key: 'test' }
      : { kind: 'clearing', key: 'test', title: x.beaten ? 'Order beaten' : 'Order at the front', typeId: x.typeId, name, text: `${name}: ${x.why}.`, order: orderFacts(x) };
  } else {
    finding = { kind: 'move', key: 'test', title: 'Order worth moving', typeId: 34, name: 'Tritanium',
      text: 'Tritanium: this is how an alert will be announced. You have no open orders in Jita the cloud has read a book for.' };
  }
  return { mailId: await send(env, charId, [finding], cfg, true), about: finding.name ?? '' };
}
