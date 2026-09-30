/**
 * EVE from the Worker: the logins it keeps, and ESI.
 *
 * A login reaches the Worker as a refresh token from the app's own PKCE login (a public client: no secret
 * is needed to refresh it). Refreshing may hand back a new refresh token, so the newest is always stored.
 */
import { open, seal } from './crypto';
import { sortLogin, type Asked } from '../../src/lib/roster';

const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
const ESI = 'https://esi.evetech.net';
export const HEADERS = { 'X-Compatibility-Date': '2025-08-26', 'User-Agent': 'jita-ledger-cloud (github.com/MagicFishgit/jita-ledger)', Accept: 'application/json' };

/**
 * What a kept login is for: the ledger's own character (`main`), the character its alert mail is sent from
 * (`mailer`), or one of its alts (`alt:<its character ID>`, migration 0016).
 */
export type Purpose = 'main' | 'mailer' | `alt:${number}`;
export const altPurpose = (altId: number): Purpose => `alt:${Math.trunc(altId)}`;
export type Login = { access: string; charId: number; name: string; scopes: string[] };

// Fields spelled out, not constructor parameter properties: Node's type stripping, which the tests run on, takes
// only syntax it can erase (scripts/check-worker.mjs).
export class EveError extends Error {
  status: number;
  /** What EVE's login said, when it refused a refresh token. */
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
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
  if (!res.ok || !body.access_token) {
    const reason = body.error_description ?? body.error ?? String(res.status);
    throw new EveError(res.status, `EVE refused the login (${reason}); log in for the cloud again`, reason);
  }
  return { access: body.access_token, refresh: body.refresh_token ?? refreshToken };
}

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };

/** Revoke a refresh token at EVE, best effort: the Worker no longer has it either way. */
export async function revoke(env: Env, refreshToken: string): Promise<void> {
  try {
    await fetch('https://login.eveonline.com/v2/oauth/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token_type_hint: 'refresh_token', token: refreshToken, client_id: env.EVE_CLIENT_ID }).toString(),
    });
  } catch { /* gone from here regardless */ }
}

/**
 * Keep a login handed over for a ledger, after proving it works by refreshing it once. `asked` is what the app asked
 * EVE for; which character it turned out to be decides what it's kept as (roster.ts, sortLogin): EVE's page picks the
 * character, and has already stopped that character's earlier logins, so a wrong pick while adding an alt is kept as
 * the main's or the sender's login. It is a working one, and may be the only one left.
 */
export async function keepHandedOver(env: Env, ledger: number, asked: Asked, refreshToken: string): Promise<{ as: Asked; login: Login }> {
  const t = await refresh(refreshToken, env.EVE_CLIENT_ID);
  const who = claims(t.access);
  const db = env.DB;
  const mailer = await db.prepare(`SELECT token_char_id AS id FROM keys WHERE char_id = ?1 AND purpose = 'mailer'`).bind(ledger).first<{ id: number }>();
  const onRoster = !!(await db.prepare('SELECT 1 AS y FROM alts WHERE char_id = ?1 AND ledger = ?2 AND removed_at IS NULL').bind(who.charId, ledger).first());
  const sorted = sortLogin(asked, who.charId, ledger, mailer?.id ?? null, onRoster);
  if ('refuse' in sorted) {
    if (sorted.refuse === 'notMain') throw new EveError(400, `That login is ${who.name}, not the character whose ledger this is`);
    if (sorted.refuse === 'isMain') throw new EveError(400, `${who.name} is the character alerts go to; the sender has to be your other character`);
    // A sender login for one of your characters. EVE has already stopped the login the cloud reads it with, and this
    // one (two permissions) can't read for it: say so now rather than let the next read find out, and don't leave a
    // live login the cloud won't use.
    await db.prepare('UPDATE keys SET refused_at = COALESCE(refused_at, ?3), refused = ?4 WHERE char_id = ?1 AND purpose = ?2')
      .bind(ledger, altPurpose(who.charId), Date.now(), 'stopped by a sender login for the same character').run();
    await revoke(env, t.refresh);
    throw new EveError(400, `That was ${who.name}, one of your characters, not your mail sender. EVE allows a character one set of permissions, so that login has stopped the one the cloud reads ${who.name} with. Hand ${who.name} over again on the Characters page.`);
  }
  const purpose: Purpose = sorted.as === 'alt' ? altPurpose(who.charId) : sorted.as;
  // The login and its roster row land together: a login with no row would be live, sealed and listed nowhere.
  const stmts = [db.prepare(`
    INSERT INTO keys (char_id, purpose, token_char_id, token_char_name, scopes, refresh_enc, updated_at, access_enc, access_exp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(char_id, purpose) DO UPDATE SET token_char_id = excluded.token_char_id, token_char_name = excluded.token_char_name,
      scopes = excluded.scopes, refresh_enc = excluded.refresh_enc, updated_at = excluded.updated_at,
      access_enc = excluded.access_enc, access_exp = excluded.access_exp, refused_at = NULL, refused = NULL, refused_warned = NULL`)
    .bind(ledger, purpose, who.charId, who.name, who.scopes.join(' '), await seal(env.TOKEN_KEY, t.refresh), Date.now(), await seal(env.TOKEN_KEY, t.access), who.exp)];
  if (sorted.as === 'alt') {
    stmts.push(db.prepare(`INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(char_id) DO UPDATE SET ledger = excluded.ledger, name = excluded.name, removed_at = NULL`)
      .bind(who.charId, ledger, who.name, Date.now()));
  }
  await db.batch(stmts);
  return { as: sorted.as, login: asLogin(t.access) };
}

export async function dropLogin(env: Env, ledgerChar: number, purpose: Purpose): Promise<void> {
  const row = await env.DB.prepare('SELECT refresh_enc FROM keys WHERE char_id = ?1 AND purpose = ?2').bind(ledgerChar, purpose).first<{ refresh_enc: string }>();
  await env.DB.prepare('DELETE FROM keys WHERE char_id = ?1 AND purpose = ?2').bind(ledgerChar, purpose).run();
  if (!row) return;
  // Revoke it at EVE too, best effort: the Worker no longer has it either way.
  try { await revoke(env, await open(env.TOKEN_KEY, row.refresh_enc)); } catch { /* a token that won't open is gone already */ }
}

/**
 * An access token for a kept login. One still good for two more minutes is reused; otherwise the refresh
 * token is traded and the rotated one stored. Every five-minute round needs one, and trading the refresh
 * token that often would rotate it nearly three hundred times a day for nothing.
 */
export async function useLogin(env: Env, ledgerChar: number, purpose: Purpose): Promise<Login | null> {
  const row = await env.DB.prepare('SELECT refresh_enc, access_enc, access_exp, token_char_name FROM keys WHERE char_id = ?1 AND purpose = ?2')
    .bind(ledgerChar, purpose).first<{ refresh_enc: string; access_enc: string | null; access_exp: number | null; token_char_name: string | null }>();
  if (!row) return null;
  if (row.access_enc && (row.access_exp ?? 0) > Date.now() + 120_000) {
    try { return asLogin(await open(env.TOKEN_KEY, row.access_enc)); } catch { /* refresh below */ }
  }
  let t: { access: string; refresh: string };
  try {
    t = await refresh(await open(env.TOKEN_KEY, row.refresh_enc), env.EVE_CLIENT_ID);
  } catch (e) {
    // A 400 or 401 from EVE's login is a refusal (invalid_grant: "Character grant missing/expired"), not a hiccup:
    // only handing the login over again fixes it. Kept on the login, so Settings, To do and the watchdog can say which
    // one it is, once, rather than every job that needs it failing in its own words.
    if (e instanceof EveError && (e.status === 400 || e.status === 401)) {
      // Only if the row still holds the token that was tried: another job may have refreshed it a moment ago, and its
      // rotated token works.
      await env.DB.prepare('UPDATE keys SET refused_at = COALESCE(refused_at, ?3), refused = ?4 WHERE char_id = ?1 AND purpose = ?2 AND refresh_enc = ?5')
        .bind(ledgerChar, purpose, Date.now(), e.reason ?? e.message, row.refresh_enc).run();
      const whose = row.token_char_name ?? (purpose === 'main' ? 'your character' : purpose === 'mailer' ? 'your sender' : 'one of your characters');
      throw new EveError(e.status, `EVE refused the cloud’s login for ${whose} (${e.reason ?? e.status}); hand the cloud ${purpose === 'main' || purpose === 'mailer' ? 'your' : 'that'} login again`, e.reason);
    }
    throw e;
  }
  await env.DB.prepare('UPDATE keys SET refresh_enc = ?3, updated_at = ?4, access_enc = ?5, access_exp = ?6, refused_at = NULL, refused = NULL, refused_warned = NULL WHERE char_id = ?1 AND purpose = ?2')
    .bind(ledgerChar, purpose, await seal(env.TOKEN_KEY, t.refresh), Date.now(), await seal(env.TOKEN_KEY, t.access), claims(t.access).exp).run();
  return asLogin(t.access);
}

/**
 * Whose login a reader uses, and whose data it reads and writes. For a ledger the two are one character. For an alt
 * the login is kept under the main's ledger and the data is the alt's own: only `useLogin` takes `ledger` and
 * `purpose`; every ESI path, every table, `push` and `noteJob` take `char`. The readers were written when the two
 * were always equal (readMiningRound bound some tables by its argument and others by the login's character), so a
 * reader asks for its login through `readerLogin`, which refuses a mismatch before anything is read.
 */
export type Reader = { ledger: number; purpose: Purpose; char: number };
export const ledgerReader = (charId: number): Reader => ({ ledger: charId, purpose: 'main', char: charId });
export const altReader = (ledger: number, altId: number): Reader => ({ ledger, purpose: altPurpose(altId), char: altId });

/** The reader's login, or null when none is kept. Throws when the login isn't the character the reader writes for. */
export async function readerLogin(env: Env, who: Reader): Promise<Login | null> {
  if ((who.purpose === 'main') !== (who.char === who.ledger)) throw new Error(`A reader for character ${who.char} under ledger ${who.ledger} has the wrong purpose (${who.purpose})`);
  if (who.purpose !== 'main' && who.purpose !== altPurpose(who.char)) throw new Error(`A reader for character ${who.char} has the wrong purpose (${who.purpose})`);
  const login = await useLogin(env, who.ledger, who.purpose);
  if (login && login.charId !== who.char) throw new Error(`The login kept as ${who.purpose} is character ${login.charId}, not ${who.char}`);
  return login;
}

/** Whether the reader's login is still kept: checked before writing, so an alt removed mid-read gets no rows back. */
export async function stillKept(db: D1Database, who: Reader): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 AS y FROM keys WHERE char_id = ?1 AND purpose = ?2').bind(who.ledger, who.purpose).first());
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
