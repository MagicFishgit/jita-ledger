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
import { alertMail, isStaleAlertMail, mailKey, orderFacts, orderFindings, piFindings, REPEAT_MS, shouldAlert, tidyEvery, type Finding } from '../../src/lib/alerts';
import { readColony, type PlanetHead, type RawColony } from '../../src/lib/colony';
import type { OrderRecord, TxRecord } from '../../src/lib/esiRecords';
import { sanitizeSettings, type Settings } from '../../src/lib/fees';
import { recentRange } from '../../src/lib/fills';
import { observedFlow, sidePaceOf, type FlowDay } from '../../src/lib/flow';
import { sanitizeAlerts } from '../../src/lib/prefs';
import { paceDay } from '../../src/lib/prospects';
import { byUrgency, judgeOrder, type Relist } from '../../src/lib/relist';
import { buyerShare, type BookSold } from '../../src/lib/split';
import type { AlertConfig, AlertLogEntry, HistRow } from '../../src/lib/types';
import { noteJob } from './archive';
import { esiDelete, esiGet, esiPost, HEADERS, useLogin, type Login } from './eve';
import { flowFor, unpack } from './market';

const JITA_44 = 60003760;
const PLEX = 44992;
const THE_FORGE = 10000002;
const PLEX_MARKET = 19000001;
const S = {
  planets: 'esi-planets.manage_planets.v1',
  mailRead: 'esi-mail.read_mail.v1',
  mailOrganize: 'esi-mail.organize_mail.v1',
};
/** A book older than this means the market watch has stalled; judging an order on it could say the wrong thing. */
const BOOK_MAX_AGE = 15 * 60_000;
/** Histories fetched in one round at most; the rest come in the next. ESI adds a day at a time. */
const HIST_PER_ROUND = 60;
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

/** The Forge's daily history for each item (PLEX's own market for PLEX): kept in D1 until ESI's copy expires. */
async function histories(db: D1Database, types: number[], now: number): Promise<Record<number, HistRow[]>> {
  const out: Record<number, HistRow[]> = {};
  const due = new Set(types);
  for (let i = 0; i < types.length; i += 90) {
    const part = types.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, expires, rows FROM hist WHERE type_id IN (${inList(part.length)})`).bind(...part)
      .all<{ type_id: number; expires: number; rows: string }>()).results;
    for (const r of rows) {
      out[r.type_id] = JSON.parse(r.rows);
      if (r.expires > now) due.delete(r.type_id);
    }
  }
  const fetchList = [...due].slice(0, HIST_PER_ROUND);
  const set = db.prepare('INSERT INTO hist (type_id, expires, rows) VALUES (?1, ?2, ?3) ON CONFLICT(type_id) DO UPDATE SET expires = excluded.expires, rows = excluded.rows');
  const stmts: D1PreparedStatement[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, fetchList.length) }, async () => {
    while (next < fetchList.length) {
      const t = fetchList[next++];
      try {
        const res = await fetch(`https://esi.evetech.net/markets/${t === PLEX ? PLEX_MARKET : THE_FORGE}/history/?type_id=${t}`, { headers: HEADERS });
        if (!res.ok) { await res.body?.cancel(); continue; }
        // Two months is more than any rule reads: 14 days of pace and reach, 30 rows of split.
        const rows = ((await res.json()) as HistRow[]).slice(-60);
        const exp = Date.parse(res.headers.get('Expires') ?? '');
        out[t] = rows;
        stmts.push(set.bind(t, Number.isFinite(exp) ? exp : now + 3600_000, JSON.stringify(rows)));
      } catch { /* kept from last time, or tried next round */ }
    }
  }));
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return out;
}

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
export async function judgeAll(db: D1Database, charId: number, settings: Settings, now = Date.now()): Promise<{ list: Relist[]; unread: number }> {
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
  const since = new Date(now - OWN_FILL_MS).toISOString();
  const txs = (await db.prepare(`SELECT data FROM records WHERE char_id = ?1 AND kind = 'txs' AND data IS NOT NULL AND json_extract(data, '$.date') >= ?2`)
    .bind(charId, since).all<{ data: string }>()).results.map((r) => JSON.parse(r.data) as TxRecord);

  let unread = 0;
  const list: Relist[] = [];
  for (const o of mine) {
    const book = books[o.typeId];
    if (!book) { unread++; continue; }
    const h = hist[o.typeId];
    // As the app's order check: the typical day, history's split, the last 14 days' lows; nothing when
    // there's no history.
    const watched: FlowDay = observedFlow({ [o.typeId]: flow[o.typeId] ?? {} }, o.typeId, now);
    const perDay = sidePaceOf({ daily: h ? paceDay(h, now) : null, buyers: h ? buyerShare(h.slice(-30)) : undefined, sold: book.sold, watched }, o.isBuy).perDay;
    const x = judgeOrder(o, { book: book.orders, perDay, avgCost: costs[o.typeId], lows: h ? recentRange(h, undefined, now).lows : null, txs }, settings, now);
    if (!x.gone) list.push(x);
  }
  return { list: list.sort(byUrgency), unread };
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

export type AlertRound = { ran: boolean; judged: number; unread: number; found: number; mailed: number; mailId: number | null; tidied: number | null; why?: string };

/**
 * One round for one ledger: tidy old mail, then, when alerts and mail are on and the interval has passed,
 * judge the orders (and hourly the colonies), and mail whatever the rules say is worth it, once.
 */
export async function alertRound(env: Env, charId: number, now = Date.now()): Promise<AlertRound> {
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
    const { list, unread } = await judgeAll(env.DB, charId, settings, now);
    out.judged = list.length; out.unread = unread;
    const names = await namesFor(env.DB, charId, [...new Set(list.map((x) => x.typeId))]);
    findings.push(...orderFindings(list, (id) => names[id] ?? `Item #${id}`));
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

  const logged = (await env.DB.prepare('SELECT key, kind, at, title, text FROM alert_log WHERE char_id = ?1 AND at > ?2').bind(charId, now - REPEAT_MS)
    .all<{ key: string; kind: AlertLogEntry['kind']; at: number; title: string; text: string }>()).results
    .map((r): AlertLogEntry => ({ key: r.key, kind: r.kind, at: new Date(r.at).toISOString(), title: r.title, text: r.text }));
  const mail = findings.filter((f) => cfg.mailEv[f.kind] && shouldAlert({ ...f, key: mailKey(f) }, cfg, logged, now));
  if (mail.length) {
    out.mailId = await send(env, charId, mail, cfg);
    out.mailed = mail.length;
    const log = env.DB.prepare(`INSERT INTO alert_log (char_id, key, kind, at, title, text) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(char_id, key) DO UPDATE SET kind = excluded.kind, at = excluded.at, title = excluded.title, text = excluded.text`);
    await env.DB.batch([
      ...mail.map((f) => log.bind(charId, mailKey(f), f.kind, now, f.title, f.text)),
      env.DB.prepare('DELETE FROM alert_log WHERE char_id = ?1 AND at < ?2').bind(charId, now - 7 * 86400_000),
    ]);
  }
  await noteJob(env.DB, charId, 'alerts', { ok: true, detail: { judged: out.judged, unread: out.unread, found: out.found, mailed: out.mailed } });
  return out;
}

/** What a round would judge and mail right now, sending nothing: for checking the cloud against the app. */
export async function previewRound(env: Env, charId: number, now = Date.now()) {
  const cfg = sanitizeAlerts(await doc<Partial<AlertConfig>>(env.DB, charId, 'alerts'));
  const settings = sanitizeSettings(await doc<Partial<Settings>>(env.DB, charId, 'settings'));
  const { list, unread } = await judgeAll(env.DB, charId, settings, now);
  const names = await namesFor(env.DB, charId, [...new Set(list.map((x) => x.typeId))]);
  const findings = orderFindings(list, (id) => names[id] ?? `Item #${id}`);
  return {
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
