/**
 * EVE from the Worker: the logins it keeps, and ESI.
 *
 * A login reaches the Worker as a refresh token from the app's own PKCE login (a public client: no secret
 * is needed to refresh it). Refreshing may hand back a new refresh token, so the newest is always stored.
 */
import { open, seal } from './crypto';

const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
const ESI = 'https://esi.evetech.net';
export const HEADERS = { 'X-Compatibility-Date': '2025-08-26', 'User-Agent': 'jita-ledger-cloud (github.com/MagicFishgit/jita-ledger)', Accept: 'application/json' };

export type Purpose = 'main' | 'mailer';
export type Login = { access: string; charId: number; name: string; scopes: string[] };

export class EveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function claims(access: string): { charId: number; name: string; scopes: string[]; exp: number } {
  const part = access.split('.')[1] ?? '';
  const c = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))) as { sub?: string; name?: string; scp?: string | string[]; exp?: number };
  const m = /^CHARACTER:EVE:(\d+)$/.exec(c.sub ?? '');
  if (!m) throw new EveError(400, 'That login isn’t for a character');
  return { charId: Number(m[1]), name: c.name ?? '', scopes: Array.isArray(c.scp) ? c.scp : c.scp ? [c.scp] : [], exp: (c.exp ?? 0) * 1000 };
}
const asLogin = (access: string): Login => { const { exp: _exp, ...who } = claims(access); return { access, ...who }; };

/** Trade a refresh token for an access token (and maybe a new refresh token). */
export async function refresh(refreshToken: string, clientId: string): Promise<{ access: string; refresh: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) throw new EveError(res.status, `EVE refused the login (${body.error_description ?? body.error ?? res.status}); log in for the cloud again`);
  return { access: body.access_token, refresh: body.refresh_token ?? refreshToken };
}

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };

/** Keep a login for a ledger, after proving it works by refreshing it once. */
export async function keepLogin(env: Env, ledgerChar: number, purpose: Purpose, refreshToken: string): Promise<Login> {
  const t = await refresh(refreshToken, env.EVE_CLIENT_ID);
  const who = claims(t.access);
  if (purpose === 'main' && who.charId !== ledgerChar) throw new EveError(400, `That login is ${who.name}, not the character whose ledger this is`);
  if (purpose === 'mailer' && who.charId === ledgerChar) throw new EveError(400, `${who.name} is the character alerts go to; the sender has to be your other character`);
  await env.DB.prepare(`
    INSERT INTO keys (char_id, purpose, token_char_id, token_char_name, scopes, refresh_enc, updated_at, access_enc, access_exp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(char_id, purpose) DO UPDATE SET token_char_id = excluded.token_char_id, token_char_name = excluded.token_char_name,
      scopes = excluded.scopes, refresh_enc = excluded.refresh_enc, updated_at = excluded.updated_at,
      access_enc = excluded.access_enc, access_exp = excluded.access_exp`)
    .bind(ledgerChar, purpose, who.charId, who.name, who.scopes.join(' '), await seal(env.TOKEN_KEY, t.refresh), Date.now(), await seal(env.TOKEN_KEY, t.access), who.exp).run();
  return asLogin(t.access);
}

export async function dropLogin(env: Env, ledgerChar: number, purpose: Purpose): Promise<void> {
  const row = await env.DB.prepare('SELECT refresh_enc FROM keys WHERE char_id = ?1 AND purpose = ?2').bind(ledgerChar, purpose).first<{ refresh_enc: string }>();
  await env.DB.prepare('DELETE FROM keys WHERE char_id = ?1 AND purpose = ?2').bind(ledgerChar, purpose).run();
  if (!row) return;
  // Revoke it at EVE too, best effort: the Worker no longer has it either way.
  try {
    const token = await open(env.TOKEN_KEY, row.refresh_enc);
    await fetch('https://login.eveonline.com/v2/oauth/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token_type_hint: 'refresh_token', token, client_id: env.EVE_CLIENT_ID }).toString(),
    });
  } catch { /* gone from here regardless */ }
}

/**
 * An access token for a kept login. One still good for two more minutes is reused; otherwise the refresh
 * token is traded and the rotated one stored. Every five-minute round needs one, and trading the refresh
 * token that often would rotate it nearly three hundred times a day for nothing.
 */
export async function useLogin(env: Env, ledgerChar: number, purpose: Purpose): Promise<Login | null> {
  const row = await env.DB.prepare('SELECT refresh_enc, access_enc, access_exp FROM keys WHERE char_id = ?1 AND purpose = ?2')
    .bind(ledgerChar, purpose).first<{ refresh_enc: string; access_enc: string | null; access_exp: number | null }>();
  if (!row) return null;
  if (row.access_enc && (row.access_exp ?? 0) > Date.now() + 120_000) {
    try { return asLogin(await open(env.TOKEN_KEY, row.access_enc)); } catch { /* refresh below */ }
  }
  const t = await refresh(await open(env.TOKEN_KEY, row.refresh_enc), env.EVE_CLIENT_ID);
  await env.DB.prepare('UPDATE keys SET refresh_enc = ?3, updated_at = ?4, access_enc = ?5, access_exp = ?6 WHERE char_id = ?1 AND purpose = ?2')
    .bind(ledgerChar, purpose, await seal(env.TOKEN_KEY, t.refresh), Date.now(), await seal(env.TOKEN_KEY, t.access), claims(t.access).exp).run();
  return asLogin(t.access);
}

/** One ESI GET. `token` for authenticated routes. Returns the body and how many pages there are. */
export async function esiGet<T>(path: string, opts: { token?: string; query?: Record<string, string | number | undefined> } = {}): Promise<{ data: T; pages: number }> {
  const url = new URL(ESI + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { ...HEADERS, ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) } });
    if (res.ok) return { data: (await res.json()) as T, pages: Number(res.headers.get('X-Pages') ?? 1) || 1 };
    if ([502, 503, 504].includes(res.status) && attempt < 2) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new EveError(res.status, `ESI ${res.status} on ${path}${body.error ? `: ${body.error}` : ''}`);
  }
}

/** Every page of a paged ESI route. */
export async function esiAll<T>(path: string, opts: { token?: string; query?: Record<string, string | number | undefined> } = {}): Promise<T[]> {
  const first = await esiGet<T[]>(path, { ...opts, query: { ...opts.query, page: 1 } });
  const out = [...first.data];
  for (let p = 2; p <= Math.min(first.pages, 50); p++) out.push(...(await esiGet<T[]>(path, { ...opts, query: { ...opts.query, page: p } })).data);
  return out;
}

/** DELETE on ESI. A 404 means it was already gone, which is what was wanted. */
export async function esiDelete(path: string, token: string): Promise<void> {
  const res = await fetch(ESI + path, { method: 'DELETE', headers: { ...HEADERS, Authorization: `Bearer ${token}` } });
  await res.body?.cancel();
  if (!res.ok && res.status !== 404) throw new EveError(res.status, `ESI ${res.status} on DELETE ${path}`);
}

/** POST to ESI (names lookups, mail). */
export async function esiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(ESI + path, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new EveError(res.status, `ESI ${res.status} on ${path}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
