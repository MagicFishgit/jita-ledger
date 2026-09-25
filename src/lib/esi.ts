import { ESI_BASE, ESI_COMPAT_DATE } from './config';
import { getAccessToken } from './auth';

export class EsiError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}

// A small gate so a watchlist refresh doesn't fire dozens of requests at once.
const MAX_CONCURRENT = 4;
let active = 0;
const waiting: (() => void)[] = [];
async function gate<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Opts = {
  auth?: boolean;
  query?: Record<string, string | number | undefined>;
  method?: 'GET' | 'POST';
  body?: unknown;
};

/**
 * `expires` is when ESI's own cache for this route lets go, from its Expires header. ESI caches
 * server-side, so asking again before then returns the identical body --- knowing the moment is
 * the difference between polling blind and asking exactly when there is something new.
 */
export async function esi<T>(path: string, opts: Opts = {}): Promise<{ data: T; pages: number | null; expires: number | null }> {
  return gate(async () => {
    const url = new URL(ESI_BASE + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { Accept: 'application/json', 'X-Compatibility-Date': ESI_COMPAT_DATE };
      if (opts.auth) headers.Authorization = 'Bearer ' + (await getAccessToken());
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      let res: Response;
      try {
        res = await fetch(url, {
          method: opts.method ?? 'GET',
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
      } catch {
        throw new EsiError(0, 'Couldn’t reach ESI. Check your connection; ESI may also be down.');
      }
      if (res.ok) {
        const p = res.headers.get('X-Pages');
        // Expires and Date come off the same server clock, so their difference is a true
        // time-to-live. Comparing ESI's Expires against ours directly would be wrong by however
        // far the browser's clock has drifted.
        const exp = Date.parse(res.headers.get('Expires') ?? '');
        const svr = Date.parse(res.headers.get('Date') ?? '');
        const expires = !Number.isFinite(exp) ? null
          : Number.isFinite(svr) ? Date.now() + (exp - svr)
          : exp;
        // Some routes answer 204 with no body at all (the /ui/ ones), so don't demand JSON.
        const text = await res.text();
        return { data: (text ? JSON.parse(text) : undefined) as T, pages: p ? Number(p) : null, expires };
      }
      if ([502, 503, 504].includes(res.status) && attempt === 0) { await sleep(1200); continue; }
      const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
      let msg = `ESI returned ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg += `: ${j.error}`;
      } catch { /* no body */ }
      if (res.status === 420 || res.status === 429) msg = 'ESI’s rate limit was reached. Wait a minute, then try again.';
      if (res.status === 403) msg += '. Your login may be missing a permission; log out and in again.';
      throw new EsiError(res.status, msg, retryAfter);
    }
  });
}

/** Fetches every page of a paginated route. */
export async function esiAllPages<T>(path: string, opts: Opts = {}): Promise<T[]> {
  const first = await esi<T[]>(path, { ...opts, query: { ...opts.query, page: 1 } });
  const out = [...first.data];
  if (first.pages != null) {
    const rest = [];
    for (let p = 2; p <= Math.min(first.pages, 50); p++) rest.push(esi<T[]>(path, { ...opts, query: { ...opts.query, page: p } }));
    (await Promise.all(rest)).forEach((r) => out.push(...r.data));
    return out;
  }
  // X-Pages wasn't readable: keep asking while pages come back full.
  let last = first.data.length;
  for (let p = 2; last >= 1000 && p <= 50; p++) {
    try {
      const r = await esi<T[]>(path, { ...opts, query: { ...opts.query, page: p } });
      if (!r.data.length) break;
      out.push(...r.data);
      last = r.data.length;
    } catch (e) {
      if (e instanceof EsiError && [400, 404, 500].includes(e.status)) break;
      throw e;
    }
  }
  return out;
}
