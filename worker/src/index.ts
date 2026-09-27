/**
 * Jita Ledger's cloud: the Worker behind the app on GitHub Pages.
 *
 * The app stays a static site. This holds the ledger in a D1 database so it survives any one browser, is
 * the same on every device, and (later) keeps working while no tab is open. Every request carries the EVE
 * access token the app already has; `caller` checks it and everything is keyed by that character.
 */
import { AuthError, caller } from './auth';
import { archive, noteJob } from './archive';
import { dropLogin, EveError, keepLogin, type Purpose } from './eve';
import { BadRequest, pull, push, status, type PushBody } from './sync';

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
  const keys = (await env.DB.prepare('SELECT purpose, token_char_id AS charId, token_char_name AS name, scopes, updated_at AS at FROM keys WHERE char_id = ?1')
    .bind(charId).all<{ purpose: string; charId: number; name: string; scopes: string; at: number }>()).results
    .map((k) => ({ ...k, scopes: k.scopes.split(' ').filter(Boolean).length }));
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
  /** The timer: every hour, the archive for every ledger that has a login kept for the cloud. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const ledgers = (await env.DB.prepare(`SELECT char_id FROM keys WHERE purpose = 'main'`).all<{ char_id: number }>()).results;
    ctx.waitUntil((async () => {
      for (const l of ledgers) {
        try { await runArchive(env, l.char_id); } catch (e) { console.error('archive failed', l.char_id, e); }
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
      const who = local && env.DEV_AUTH_CHAR && request.headers.get('Authorization') === 'Bearer dev-token'
        ? { charId: Number(env.DEV_AUTH_CHAR), name: 'Local test', scopes: [] }
        : await caller(request, env.EVE_CLIENT_ID);
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
