/**
 * Jita Ledger's cloud: the Worker behind the app on GitHub Pages.
 *
 * The app stays a static site. This holds the ledger in a D1 database so it survives any one browser, is
 * the same on every device, and (later) keeps working while no tab is open. Every request carries the EVE
 * access token the app already has; `caller` checks it and everything is keyed by that character.
 */
import { AuthError, caller } from './auth';
import { isOwner } from '../../src/lib/constants';
import { alertRound, bookOf, judgeAll, leaveSummary, previewRound, testRound, trackRecord, trackSummary } from './alerts';
import { dailyChecks, shareSummary } from './checks';
import { watchdog } from './watchdog';
import { miningTicksFor, readMiningRound } from './mining';
import { fullScan, markScanStarted, scanDue, scanStatus, scanStream } from './scan';
import { lastSnipes, sightings, sniperRound, snipeSummary } from './snipe';

/** One minute past each five: ESI refreshes The Forge's book at about :x0:30 and :x5:30. Also in wrangler.toml. */
const SNIPER_CRON = '1-59/5 * * * *';
import { sanitizeSettings, type Settings } from '../../src/lib/fees';
import { archive, noteJob, refreshOrders } from './archive';
import { flowFor, hoursFor, pricesFor, unpack, watchMarkets } from './market';
import { dropLogin, EveError, keepLogin, ledgerReader, type Purpose } from './eve';
import { BadRequest, pull, push, status, type PushBody } from './sync';
import { rateReport } from './rate';
import { blueprintMarket } from './blueprints';
import { abyssCells, abyssFit, refreshAbyss } from './abyss';

export interface Env {
  DB: D1Database;
  EVE_CLIENT_ID: string;
  /** Comma-separated origins the app is served from. */
  ALLOWED_ORIGINS: string;
  /**
   * Local testing only: `wrangler dev --var DEV_AUTH_CHAR:<id>` lets the token "dev-token" stand for that
   * character, so the app can be tested end to end without a real EVE login. It is never set in
   * wrangler.toml, and it is ignored unless the request itself is addressed to localhost.
   */
  DEV_AUTH_CHAR?: string;
  /** 32 random bytes, base64: seals the refresh tokens the background jobs use. A secret, never in wrangler.toml. */
  TOKEN_KEY: string;
  /** Where the app lives, for the links in alert mail. */
  APP_URL: string;
}

/**
 * The five-minute round. Each ledger's open orders first (when ESI's twenty-minute copy has turned
 * over), so an order placed since the hourly archive has its book read; then every watched book; then
 * each ledger's alerts, judged on the books just read. One chain, so the alerts never read a half-done watch.
 */
async function fiveMinutes(env: Env) {
  const ledgers = (await env.DB.prepare(`SELECT char_id FROM keys WHERE purpose = 'main'`).all<{ char_id: number }>()).results.map((r) => r.char_id);
  for (const id of ledgers) {
    try { await refreshOrders(env, id); } catch (e) {
      await noteJob(env.DB, id, 'orders', { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    // The mining ledger, every ten minutes: sessions and records (mining.ts). Only with the mining permission.
    try { await readMiningRound(env, ledgerReader(id)); } catch (e) {
      await noteJob(env.DB, id, 'mining', { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  try { console.log('market watch', JSON.stringify(await watchMarkets(env.DB))); } catch (e) { console.error('market watch failed', e); }
  // ESI's rate limits are counted per IP; whether the Worker's is shared with anyone else shows here (rate.ts).
  console.log('esi rate limit', JSON.stringify(rateReport()));
  for (const id of ledgers) {
    // Each ledger's orders judged once: the track record checks "Clears in" against what happened, and the
    // alerts mail what's worth it.
    let judged: Awaited<ReturnType<typeof judgeAll>> | undefined;
    try {
      const row = await env.DB.prepare(`SELECT data FROM docs WHERE char_id = ?1 AND key = 'settings'`).bind(id).first<{ data: string }>();
      judged = await judgeAll(env.DB, id, sanitizeSettings(row ? (JSON.parse(row.data) as Partial<Settings>) : null));
      await trackRecord(env.DB, id, judged);
    } catch (e) { console.error('track record failed', id, e); }
    try {
      const r = await alertRound(env, id, Date.now(), judged);
      if (r.ran) console.log('alerts', id, JSON.stringify(r));
    } catch (e) {
      await noteJob(env.DB, id, 'alerts', { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    // Anything the cloud does for this ledger failing twice in a row is mailed.
    try {
      const w = await watchdog(env, id);
      if (w.mailed) console.log('watchdog', id, JSON.stringify(w));
    } catch (e) { console.error('watchdog failed', id, e); }
  }
}

/** The watched books for some items, as book summaries, when read in the last 15 minutes: live prices for a scan. */
async function freshBooks(db: D1Database, types: number[]) {
  const out: Record<number, ReturnType<typeof bookOf>> = {};
  const now = Date.now();
  for (let i = 0; i < types.length; i += 90) {
    const part = types.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, orders, sold, at FROM books WHERE type_id IN (${part.map((_, n) => `?${n + 1}`).join(',')})`).bind(...part)
      .all<{ type_id: number; orders: string; sold: string | null; at: number }>()).results;
    for (const r of rows) if (now - r.at <= 15 * 60_000) out[r.type_id] = bookOf(unpack(r.orders), r.at, r.sold ? JSON.parse(r.sold) : undefined);
  }
  return out;
}

/** The day's full-market scan, when one is due and none is running; noted under ledger 0. */
async function runScan(env: Env) {
  if (!(await scanDue(env.DB))) return;
  await markScanStarted(env.DB);
  try {
    const meta = await fullScan(env.DB);
    console.log('full scan', JSON.stringify(meta));
    await noteJob(env.DB, 0, 'scan', { ok: true, detail: meta });
  } catch (e) {
    console.error('full scan failed', e);
    await noteJob(env.DB, 0, 'scan', { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Run the archive for one ledger and note how it went. */
async function runArchive(env: Env, charId: number) {
  try {
    const detail = await archive(env, charId);
    await noteJob(env.DB, charId, 'archive', { ok: true, detail });
    return detail;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await noteJob(env.DB, charId, 'archive', { ok: false, error });
    throw e;
  }
}

/** What the background side holds for a ledger: its logins (never the tokens) and what each job last did. */
async function background(env: Env, charId: number) {
  // `at` is the last time the login worked (handed over, or refreshed); `refusedAt` when EVE started refusing it.
  const keys = (await env.DB.prepare('SELECT purpose, token_char_id AS charId, token_char_name AS name, scopes, updated_at AS at, refused_at AS refusedAt, refused FROM keys WHERE char_id = ?1')
    .bind(charId).all<{ purpose: string; charId: number; name: string; scopes: string; at: number; refusedAt: number | null; refused: string | null }>()).results
    .map((k) => ({ ...k, scopes: k.scopes.split(' ').filter(Boolean).length, scopeNames: k.scopes.split(' ').filter(Boolean) }));
  const jobs = (await env.DB.prepare('SELECT job, last_run AS lastRun, last_ok AS lastOk, last_error AS lastError, detail FROM jobs WHERE char_id = ?1')
    .bind(charId).all<{ job: string; lastRun: number; lastOk: number | null; lastError: string | null; detail: string | null }>()).results
    .map((j) => ({ ...j, detail: j.detail ? JSON.parse(j.detail) : null }));
  return { keys, jobs };
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function cors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * A few real ESI calls made from Cloudflare, with ESI's own limit headers: whether ESI treats requests from
 * here any differently from a home connection. Cloudflare's outgoing addresses are shared.
 */
async function esiCheck() {
  const urls = [
    'https://esi.evetech.net/markets/10000002/orders/?type_id=34&order_type=all',
    'https://esi.evetech.net/markets/10000002/orders/?type_id=2185&order_type=all',
    'https://esi.evetech.net/markets/10000002/history/?type_id=2185',
    'https://esi.evetech.net/status/',
  ];
  const out = [];
  for (const url of urls) {
    const t = Date.now();
    const res = await fetch(url, { headers: { 'X-Compatibility-Date': '2025-08-26', 'User-Agent': 'jita-ledger-cloud (github.com/MagicFishgit/jita-ledger)' } });
    const h: Record<string, string> = {};
    res.headers.forEach((v, k) => { if (/ratelimit|error-limit|x-pages|expires|retry/i.test(k)) h[k] = v; });
    out.push({ url, status: res.status, ms: Date.now() - t, headers: h });
    await res.body?.cancel();
  }
  return out;
}

export default {
  /**
   * The timers. Every five minutes the watched books are read (ESI's copy of a book lasts five); every hour,
   * at seven past, the archive runs for every ledger that has a login kept for the cloud.
   */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '*/5 * * * *') {
      ctx.waitUntil(fiveMinutes(env));
      return;
    }
    // The sniper: a minute after each of ESI's five-minute refreshes of the book, so it reads a fresh one.
    if (event.cron === SNIPER_CRON) {
      ctx.waitUntil(sniperRound(env).then(async (r) => {
        console.log('sniper', JSON.stringify(r), 'esi rate limit', JSON.stringify(rateReport()));
        // A read that lost too much of the book is a failure; one skipped because the book hadn't changed isn't anything.
        const skipped = (r as { skipped?: string }).skipped;
        if (skipped) { if (/pages failed/.test(skipped)) await noteJob(env.DB, 0, 'sniper', { ok: false, error: skipped }); }
        else await noteJob(env.DB, 0, 'sniper', { ok: true, detail: r });
      }).catch(async (e) => {
        console.error('sniper failed', e);
        await noteJob(env.DB, 0, 'sniper', { ok: false, error: e instanceof Error ? e.message : String(e) });
      }));
      return;
    }
    // The day's full-market scan, just after ESI publishes the day's history.
    if (event.cron === '25 11 * * *') {
      ctx.waitUntil(runScan(env));
      return;
    }
    const ledgers = (await env.DB.prepare(`SELECT char_id FROM keys WHERE purpose = 'main'`).all<{ char_id: number }>()).results;
    ctx.waitUntil((async () => {
      for (const l of ledgers) {
        try { await runArchive(env, l.char_id); } catch (e) { console.error('archive failed', l.char_id, e); }
      }
      // Once a day: the Sniper's listings and each ledger's share, checked against what happened.
      try {
        const r = await dailyChecks(env);
        console.log('daily checks', JSON.stringify(r));
        if (!('skipped' in r)) await noteJob(env.DB, 0, 'checks', { ok: true, detail: r });
      } catch (e) {
        console.error('daily checks failed', e);
        await noteJob(env.DB, 0, 'checks', { ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      // The hourly run catches up a day's scan the daily one missed (or the first, after a deploy).
      try {
        await runScan(env);
      } finally {
        // Then Abyss Tracker's figures for the Abyssal page: whatever is over 20 hours old, one request at a time (about a
        // minute for all 35). After the scan, so it never takes from the scan's time budget; each is saved as it's read,
        // so a run cut short carries on the next hour.
        try { console.log('abyss tracker', JSON.stringify(await refreshAbyss(env.DB))); } catch (e) { console.error('abyss tracker failed', e); }
      }
    })());
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const c = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: c });
    const url = new URL(request.url);
    try {
      if (url.pathname === '/v1/health') return json({ ok: true }, 200, c);
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const dev = !!(local && env.DEV_AUTH_CHAR && request.headers.get('Authorization') === 'Bearer dev-token');
      const who = dev
        ? { charId: Number(env.DEV_AUTH_CHAR), name: 'Local test', scopes: [] }
        : await caller(request, env.EVE_CLIENT_ID);
      // A private ledger: a genuine EVE login isn't enough, it has to be the owner's character (constants.ts).
      if (!dev && !isOwner(who.charId)) return json({ error: 'This Jita Ledger is private: only its owner can use it.' }, 403, c);
      if (url.pathname === '/v1/push' && request.method === 'POST') {
        return json(await push(env.DB, who.charId, (await request.json()) as PushBody), 200, c);
      }
      if (url.pathname === '/v1/pull' && request.method === 'GET') {
        const since = Number(url.searchParams.get('since') ?? 0) || 0;
        return json(await pull(env.DB, who.charId, since, url.searchParams.get('after')), 200, c);
      }
      if (url.pathname === '/v1/status' && request.method === 'GET') {
        return json({ character: who, ...(await status(env.DB, who.charId)), background: await background(env, who.charId) }, 200, c);
      }
      if (url.pathname === '/v1/keys' && request.method === 'POST') {
        const body = (await request.json()) as { purpose?: string; refreshToken?: string };
        const purpose = body.purpose === 'mailer' ? 'mailer' : body.purpose === 'main' ? 'main' : null;
        if (!purpose || !body.refreshToken) throw new BadRequest('Say which login this is and send its refresh token');
        const kept = await keepLogin(env, who.charId, purpose as Purpose, body.refreshToken);
        return json({ kept: { purpose, charId: kept.charId, name: kept.name, scopes: kept.scopes.length } }, 200, c);
      }
      if (url.pathname === '/v1/keys' && request.method === 'DELETE') {
        const purpose = url.searchParams.get('purpose') === 'mailer' ? 'mailer' : 'main';
        await dropLogin(env, who.charId, purpose);
        return json({ dropped: purpose }, 200, c);
      }
      if (url.pathname === '/v1/jobs/archive' && request.method === 'POST') return json(await runArchive(env, who.charId), 200, c);
      // The mining ledger's ticks (what grew between the cloud's reads), for the app's sessions.
      if (url.pathname === '/v1/mining/ticks' && request.method === 'GET') {
        return json(await miningTicksFor(env.DB, who.charId, Number(url.searchParams.get('days') ?? 30) || 30), 200, c);
      }
      if (url.pathname === '/v1/jobs/market' && request.method === 'POST') return json(await watchMarkets(env.DB), 200, c);
      if (url.pathname === '/v1/alerts/test' && request.method === 'POST') return json(await testRound(env, who.charId), 200, c);
      if (url.pathname === '/v1/alerts/preview' && request.method === 'GET') return json(await previewRound(env, who.charId), 200, c);
      // What the cloud has mailed this ledger in the last week (one row per alert, at its latest mailing): the app's
      // own alert log holds only what that browser raised, so a new phone read "0" while mail was going out.
      if (url.pathname === '/v1/alerts/log' && request.method === 'GET') {
        const rows = (await env.DB.prepare(`SELECT key, kind, at, title, text FROM alert_log WHERE char_id = ?1 AND at > ?2 ORDER BY at DESC LIMIT 200`)
          .bind(who.charId, Date.now() - 7 * 86400_000).all<{ key: string; kind: string; at: number; title: string; text: string }>()).results;
        return json(rows, 200, c);
      }
      if (url.pathname === '/v1/track' && request.method === 'GET') {
        return json({
          ...(await trackSummary(env.DB, who.charId)),
          leave: await leaveSummary(env.DB, who.charId),
          snipes: await snipeSummary(env.DB),
          share: await shareSummary(env.DB, who.charId),
        }, 200, c);
      }
      if (url.pathname === '/v1/flow' && request.method === 'GET') {
        const types = (url.searchParams.get('types') ?? '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 500);
        return json(await flowFor(env.DB, types), 200, c);
      }
      if (url.pathname === '/v1/scan/meta' && request.method === 'GET') {
        const row = await env.DB.prepare(`SELECT data FROM scan_meta WHERE key = 'scan'`).first<{ data: string }>();
        return json(row ? JSON.parse(row.data) : null, 200, c);
      }
      if (url.pathname === '/v1/scan' && request.method === 'GET') {
        const body = await scanStream(env.DB);
        return body ? new Response(body, { headers: { ...c, 'Content-Type': 'application/json' } }) : json(null, 200, c);
      }
      if (url.pathname === '/v1/scan/status' && request.method === 'GET') return json(await scanStatus(env.DB), 200, c);
      // Abyss Tracker, read by the cloud for the Abyssal page: every tier and weather, and one fit when it's opened.
      if (url.pathname === '/v1/abyss' && request.method === 'GET') return json(await abyssCells(env.DB), 200, c);
      if (url.pathname === '/v1/jobs/abyss' && request.method === 'POST') return json(await refreshAbyss(env.DB), 200, c);
      if (url.pathname === '/v1/abyss/fit' && request.method === 'GET') return json(await abyssFit(env.DB, url.searchParams.get('id') ?? ''), 200, c);
      if (url.pathname === '/v1/blueprints/market' && request.method === 'POST') {
        const body = (await request.json()) as { types?: unknown };
        const types = Array.isArray(body.types) ? body.types.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 5000) : [];
        return json(await blueprintMarket(types, who.charId), 200, c);
      }
      if (url.pathname === '/v1/snipes/seen' && request.method === 'GET') {
        const types = (url.searchParams.get('types') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);
        return json(await sightings(env.DB, types), 200, c);
      }
      if (url.pathname === '/v1/snipes' && request.method === 'GET') {
        // Listings are the market's; bids are kept for what anyone holds, so each caller sees only its own items'.
        const read = await lastSnipes(env.DB);
        const stock = await env.DB.prepare(`SELECT data FROM docs WHERE char_id = ?1 AND key = 'stock'`).bind(who.charId).first<{ data: string }>();
        const mine = new Set(Object.keys((stock ? JSON.parse(stock.data) : {})?.jita ?? {}).map(Number));
        return json(read ? { ...read, bids: read.bids.filter((b) => mine.has(b.typeId)) } : null, 200, c);
      }
      if (url.pathname === '/v1/books' && request.method === 'GET') {
        const types = (url.searchParams.get('types') ?? '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 500);
        return json(await freshBooks(env.DB, types), 200, c);
      }
      if (url.pathname === '/v1/hours' && request.method === 'GET') {
        const types = (url.searchParams.get('types') ?? '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 500);
        return json(await hoursFor(env.DB, types), 200, c);
      }
      if (url.pathname === '/v1/prices' && request.method === 'GET') {
        const type = Number(url.searchParams.get('type'));
        const hours = Math.min(24 * 90, Number(url.searchParams.get('hours') ?? 24 * 14) || 24 * 14);
        return json(await pricesFor(env.DB, type, hours), 200, c);
      }
      if (url.pathname === '/v1/esi-check' && request.method === 'GET') return json(await esiCheck(), 200, c);
      return json({ error: 'Not found' }, 404, c);
    } catch (e) {
      if (e instanceof AuthError) return json({ error: e.message }, e.status, c);
      if (e instanceof BadRequest) return json({ error: e.message }, 400, c);
      if (e instanceof EveError) return json({ error: e.message }, e.status >= 400 && e.status < 500 ? 400 : 502, c);
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, 500, c);
    }
  },
};
