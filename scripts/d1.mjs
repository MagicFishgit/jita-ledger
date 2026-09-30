// A stand-in for Cloudflare's D1, so the Worker's own code runs in `npm run check`: SQLite in memory (node:sqlite,
// Node 22.13+), built from the real migrations in worker/migrations, with the part of D1's interface the Worker
// uses (prepare, bind, first, all, run, batch). And what a test needs beside it: an EVE access token that reads as a
// character's (the Worker only decodes a kept token, it never checks its signature), a login kept the way keepLogin
// keeps one, and a `fetch` that answers for ESI and EVE's login from a table.
//
// Why: making the readers serve alts means telling "whose login" from "whose data" in code where the two have always
// been one character. A slip writes an alt's rows into the main's ledger, and only running the real SQL shows it.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../worker/migrations');

export function d1() {
  const db = new DatabaseSync(':memory:');
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  // D1 stores a bound boolean as 0 or 1; node:sqlite refuses one.
  const plain = (a) => a.map((v) => (typeof v === 'boolean' ? Number(v) : v));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, plain(a)),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    now: () => { const s = db.prepare(sql); return /^\s*(SELECT|WITH)\b/i.test(sql) ? { results: s.all(...args) } : (s.run(...args), { results: [] }); },
  });
  return {
    prepare: (sql) => stmt(sql),
    // One batch is one transaction, as in D1: all of it lands or none does.
    batch: async (list) => {
      db.exec('BEGIN');
      try { const out = list.map((s) => s.now()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    /** For a test's own looks and seeds, outside the Worker's code. */
    rows: (sql, ...args) => db.prepare(sql).all(...args),
    run: (sql, ...args) => { db.prepare(sql).run(...args); },
  };
}

export const TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');

/** An access token the Worker reads as this character's: a JWT in shape, with `exp` in seconds as EVE gives it. */
export const fakeToken = (charId, name, scopes = [], expMs = Date.now() + 3600_000) =>
  `h.${Buffer.from(JSON.stringify({ sub: `CHARACTER:EVE:${charId}`, name, scp: scopes, exp: Math.floor(expMs / 1000) })).toString('base64')}.s`;

export const testEnv = (db, extra = {}) => ({
  DB: db, EVE_CLIENT_ID: 'client', TOKEN_KEY, APP_URL: 'https://app.test/', ALLOWED_ORIGINS: 'http://localhost:5173', ...extra,
});

/**
 * A login kept for a ledger, sealed as the Worker seals one. Its access token is good for an hour, so `useLogin`
 * uses it without going to EVE; `opts.expired` makes it stale, so `useLogin` refreshes it (stub EVE's token route).
 */
export async function keepKey(db, ledger, purpose, charId, name, scopes, opts = {}) {
  const { seal } = await import('../worker/src/crypto.ts');
  const exp = opts.expired ? Date.now() - 60_000 : Date.now() + 3600_000;
  await db.prepare(`INSERT INTO keys (char_id, purpose, token_char_id, token_char_name, scopes, refresh_enc, updated_at, access_enc, access_exp, refused_at, refused)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
    .bind(ledger, purpose, charId, name, scopes.join(' '), await seal(TOKEN_KEY, `refresh-${charId}`), Date.now(),
      await seal(TOKEN_KEY, fakeToken(charId, name, scopes, exp)), exp, opts.refusedAt ?? null, opts.refused ?? null).run();
}

/**
 * Replaces `fetch` with a table of [test, answer]. A test is a path ("/characters/1/mining/") or a RegExp tried
 * against "METHOD /path". An answer is a value (sent as JSON, one page), a Response, or a function of (url, init)
 * returning either. Anything unmatched is a 404 that says which route was missing. `calls` lists what was asked.
 */
export function stubFetch(routes) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init.method ?? 'GET';
    calls.push({ method, path: url.pathname, url: url.href, body: init.body ?? null });
    for (const [test, answer] of routes) {
      if (typeof test === 'string' ? url.pathname !== test : !test.test(`${method} ${url.pathname}`)) continue;
      const body = typeof answer === 'function' ? await answer(url, init) : answer;
      if (body instanceof Response) return body;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Pages': '1' } });
    }
    return new Response(JSON.stringify({ error: `no stub for ${method} ${url.pathname}` }), { status: 404 });
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
