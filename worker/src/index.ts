/**
 * Jita Ledger's cloud: the Worker behind the app on GitHub Pages.
 *
 * The app stays a static site. This holds the ledger in a D1 database so it survives any one browser, is
 * the same on every device, and (later) keeps working while no tab is open. Every request carries the EVE
 * access token the app already has; `caller` checks it and everything is keyed by that character.
 */
import { AuthError, caller } from './auth';
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
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function cors(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      if (url.pathname === '/v1/status' && request.method === 'GET') return json({ character: who, ...(await status(env.DB, who.charId)) }, 200, c);
      if (url.pathname === '/v1/esi-check' && request.method === 'GET') return json(await esiCheck(), 200, c);
      return json({ error: 'Not found' }, 404, c);
    } catch (e) {
      if (e instanceof AuthError) return json({ error: e.message }, e.status, c);
      if (e instanceof BadRequest) return json({ error: e.message }, 400, c);
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, 500, c);
    }
  },
};
