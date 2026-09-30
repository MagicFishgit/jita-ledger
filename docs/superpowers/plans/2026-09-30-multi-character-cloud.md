# Several characters, stage 1: the cloud. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Worker can keep an alt's login under the main's ledger, read that alt into rows under the alt's own character ID, and serve them read-only, without any row of an alt's reaching the main's ledger and without changing what the main's own jobs do.

**Architecture:** An alt is a row in a new `alts` table plus a `keys` row `(ledger, 'alt:<id>')`. Every reader is told whose login it uses and whose data it writes (`Reader = { ledger, purpose, char }`) and refuses to write unless the login is that character's. Alts get a full read on a cron of their own and a mining read at the end of the five-minute round. The Worker's code is tested in `npm run check` against an in-memory SQLite stand-in for D1 built from the real migrations, with `fetch` stubbed for ESI.

**Tech Stack:** Cloudflare Worker (TypeScript, D1), Node 24 with `node:sqlite` for tests, the app's shared pure modules in `src/lib`.

**Spec:** `docs/superpowers/specs/2026-09-30-multi-character-design.md` (sections 1 and 2, and stage 1 of "Stages"). Stages 2 to 4 (the browser, Mining, the Wallet) get their own plans once this one is live.

## Global Constraints

- **This stage ships dark.** No page adds an alt until stage 2, so in production nothing reads an alt yet. What production proves is that the main's jobs are unchanged.
- **A migration only adds**, and old code must run on the new schema: the deploy applies migrations before the new Worker.
- **The Worker's code, and any `src/lib` module it imports, stays loadable by Node's type stripping**: no parameter properties (`constructor(public x)`), no enums, no namespaces. And free of `./config`, `./store`, React and the DOM, even for a type import (`tsc -p worker` pulls in whatever they import).
- **Node 22.13 or newer** for `node:sqlite` (this machine has 24.18; `deploy-worker.yml` runs `npm run check` on Node 24; the site's `deploy.yml` doesn't run `check`).
- **The main's and the mail sender's logins are not changed**: the `main` and `mailer` rows, `/v1/keys` for them, and every flow that uses them behave as today.
- **Only `useLogin` takes the ledger and the purpose.** Every ESI path, every table bind, `push` and `noteJob` take the character whose data it is.
- **Verify before claiming**: `npm run check` and `npm run build` for every task; `npm run check-pages` before shipping.
- **Branch**: work continues on `multi-character` (it holds the spec and this plan), merged `--ff-only` to `main` at the end, then deleted both sides, then `npm run deployed`.
- **Commit messages explain the reasoning** (what was wrong, why, the evidence) and end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
  ```
- **Test characters**: main `95210486`, alt `900001` "Miner Two", mail sender `900777` "Postmaster".

## Review Focus

Conditions the spec implies that a task's obvious tests wouldn't reach. Each has a test in the task named.

1. **An alt removed while it is being read** (its `keys` row deleted between the login and the write): nothing is written for it. Task 3 (mining) and Task 4 (the full read).
2. **ESI answers an empty mining ledger** (a new alt that has never mined): the read succeeds, stores an empty snapshot, makes no ticks and pushes nothing. Task 3.
3. **An alt route with an ID that isn't a number, or is a character not on the caller's roster**: 404, and no query keyed by it runs. Task 5.
4. **A sender login for a character that was removed from the roster**: accepted as the sender, since nothing reads it as an alt any more. Task 5.
5. **A login marked refused that then refreshes successfully** (what a clash between the `:37` read and a five-minute round would leave behind): the refusal is cleared. Task 5.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/d1.mjs` (new) | The D1 stand-in: SQLite in memory from `worker/migrations`, fake EVE tokens, a kept-login seeder, a `fetch` stub. |
| `scripts/check-worker.mjs` (new) | Tests that run the Worker's own code against the stand-in. |
| `scripts/alpha-caps.mjs` (new) | Generates `src/lib/alphaCaps.ts` from CCP's `cloneGrades.jsonl`. |
| `src/lib/alphaCaps.ts` (new, generated) | Alpha's level cap per skill. |
| `src/lib/roster.ts` (new) | Pure rules: `cloneState`, `usableSkills`, `sortLogin`. Shared with the Worker. |
| `src/lib/mining.ts` | Gains `isBaseline`. |
| `src/lib/watchdog.ts`, `src/lib/alerts.ts` | The watchdog's wording and keys by character. |
| `worker/migrations/0016_alts.sql` (new) | The `alts` table; `mining_state.ship_type_id`. |
| `worker/src/eve.ts` | `Purpose` with `alt:<id>`, `Reader`, `readerLogin`, `stillKept`, `keepHandedOver`, `revoke`. |
| `worker/src/mining.ts`, `worker/src/archive.ts` | Readers told whose login and whose data. |
| `worker/src/sheet.ts` (new) | An alt's skills, queue, attributes, clone state and wallet, as its `skills` and `meta` docs. |
| `worker/src/alts.ts` (new) | The roster, an alt's full read, the two alt rounds, removal, what the routes return. |
| `worker/src/index.ts` | The alt routes, the `37` cron, alt mining in the five-minute round, the caller check, `/v1/status` without alt rows. |
| `worker/src/watchdog.ts`, `worker/src/market.ts`, `worker/src/sync.ts` | By-character quieting; alts out of the market watch; the `chars` document allowed. |

---

### Task 1: The Worker's code runs in `npm run check`

**Files:**
- Create: `scripts/d1.mjs`, `scripts/check-worker.mjs`
- Modify: `worker/src/eve.ts:16-19`, `worker/src/auth.ts:26-28`, `package.json` (the `check` script)

**Interfaces:**
- Produces, from `scripts/d1.mjs`: `d1()` returning `{ prepare, batch, rows(sql, ...args), run(sql, ...args) }`; `TOKEN_KEY`; `fakeToken(charId, name, scopes, expMs?)`; `testEnv(db, extra?)`; `keepKey(db, ledger, purpose, charId, name, scopes, opts?)`; `stubFetch(routes)` returning `{ calls, restore }`.

- [ ] **Step 1: Write the stand-in**

Create `scripts/d1.mjs`:

```js
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
```

- [ ] **Step 2: Write the first tests, which fail**

Create `scripts/check-worker.mjs`:

```js
// The Worker's own code, run against an in-memory stand-in for D1 (scripts/d1.mjs) with ESI stubbed.
// Run with: npm run check   (after the pure-logic tests)
import fs from 'node:fs';
import { d1, fakeToken, keepKey, stubFetch, testEnv } from './d1.mjs';

let failed = 0;
// Objects are compared whatever order their keys came in (counts come back grouped by character, lowest ID first);
// arrays keep their order.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const eq = (label, got, want) => {
  const g = JSON.stringify(canon(got)), w = JSON.stringify(canon(want));
  if (g !== w) { failed++; console.log(`  FAIL ${label}: got ${g}, want ${w}`); }
};
const rejects = async (label, fn, re) => {
  try { await fn(); failed++; console.log(`  FAIL ${label}: didn't throw`); } catch (e) {
    if (!re.test(String(e?.message ?? e))) { failed++; console.log(`  FAIL ${label}: threw "${e?.message ?? e}"`); }
  }
};

const MAIN = 95210486, ALT = 900001, SENDER = 900777;
/** Every table a character's data lives in, as "table:charId" → rows: what a reader may and may not have touched. */
const TABLES = ['records', 'docs', 'revs', 'jobs', 'mining_state', 'mining_ticks', 'safety_seen'];
const counts = (db) => Object.fromEntries(TABLES.flatMap((t) => db.rows(`SELECT char_id AS c, COUNT(*) AS n FROM ${t} GROUP BY char_id`).map((r) => [`${t}:${r.c}`, r.n])));
const under = (db, char) => Object.fromEntries(Object.entries(counts(db)).filter(([k]) => k.endsWith(`:${char}`)));

console.log('--- every Worker module loads in the test runner ---');
{
  // Node strips types and nothing more: a parameter property or an enum anywhere stops the file loading.
  for (const f of fs.readdirSync(new URL('../worker/src/', import.meta.url)).filter((x) => x.endsWith('.ts'))) {
    let ok = true;
    try { await import(`../worker/src/${f}`); } catch (e) { ok = String(e?.message ?? e); }
    eq(`  ${f}`, ok, true);
  }
}

console.log('\n--- the cloud copy is one character\'s at a time ---');
{
  const db = d1();
  const { push, pull } = await import('../worker/src/sync.ts');
  await push(db, MAIN, { records: [{ k: 'txs', i: 'a', d: { x: 1 } }], docs: [{ key: 'stock', d: { mine: true } }] });
  await push(db, ALT, { records: [{ k: 'txs', i: 'b', d: { x: 2 } }, { k: 'mining', i: 'm', d: { q: 3 } }], docs: [] });
  const mine = await pull(db, MAIN, 0, null), theirs = await pull(db, ALT, 0, null);
  eq('  the main pulls only its own records', mine.records.map((r) => r.i), ['a']);
  eq('  and its own documents', mine.docs.map((x) => x.key), ['stock']);
  eq('  an alt pulls only its own', theirs.records.map((r) => r.i).sort(), ['b', 'm']);
  eq('  each has its own revision', [mine.rev, theirs.rev], [1, 1]);
  eq('  rows are filed under the character pushed for', counts(db), { [`records:${MAIN}`]: 1, [`records:${ALT}`]: 2, [`docs:${MAIN}`]: 1, [`revs:${MAIN}`]: 1, [`revs:${ALT}`]: 1 });
}

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
```

(`fakeToken`, `keepKey`, `stubFetch`, `testEnv`, `rejects`, `under` and `SENDER` are used from Task 3 on.)

- [ ] **Step 3: Run it and see the load test fail**

Run: `node --disable-warning=ExperimentalWarning --import ./scripts/register.mjs scripts/check-worker.mjs`

Expected: `FAIL   eve.ts: got "TypeScript parameter property is not supported in strip-only mode"`, the same for every file that imports it (`alerts.ts`, `archive.ts`, `index.ts`, `mining.ts`, `safety.ts`, `snipe.ts`, `watchdog.ts`, …) and for `auth.ts`. The cloud-copy section passes.

- [ ] **Step 4: Replace the two parameter-property constructors**

In `worker/src/eve.ts`, replace:

```ts
export class EveError extends Error {
  /** `reason`: what EVE's login said, when it refused a refresh token. */
  constructor(public status: number, message: string, public reason?: string) { super(message); }
}
```

with:

```ts
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
```

In `worker/src/auth.ts`, replace:

```ts
export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
```

with:

```ts
export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
```

- [ ] **Step 5: Run it and see it pass**

Run: `node --disable-warning=ExperimentalWarning --import ./scripts/register.mjs scripts/check-worker.mjs`

Expected: `all passed`. If another file still fails to load, its message names the syntax; rewrite that the same way (erasable syntax only) and run again.

- [ ] **Step 6: Make `npm run check` run both**

In `package.json`, replace the `check` line with:

```json
    "check": "node --import ./scripts/register.mjs scripts/check.mjs && node --disable-warning=ExperimentalWarning --import ./scripts/register.mjs scripts/check-worker.mjs",
```

Run: `npm run check && npm run build`

Expected: two `all passed` lines, then the build finishing without type errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/d1.mjs scripts/check-worker.mjs package.json worker/src/eve.ts worker/src/auth.ts
git commit -F - <<'EOF'
Tests: the Worker's own code runs in npm run check, against SQLite standing in for D1

Until now only the pure rules were tested; the Worker's SQL and its ESI reads were checked by hand against a
local wrangler dev. Reading alts means telling "whose login" from "whose data" in readers where the two have
always been one character (readMiningRound binds some tables by its argument and others by the login's
character), and a slip there writes an alt's rows into the main's ledger. Only running the real statements
shows that.

scripts/d1.mjs is SQLite in memory (node:sqlite) built from the real migrations, with the part of D1's interface
the Worker uses, a fake EVE token (a kept token is only decoded, never verified), a login sealed as keepLogin
seals one, and a fetch stub for ESI. scripts/check-worker.mjs runs after the pure tests in npm run check, which
the Worker's deploy already runs on Node 24.

Two classes stopped every Worker module loading under Node's type stripping: EveError and AuthError used
constructor parameter properties. Their fields are spelled out now; nothing else changes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 2: Alpha's caps, and the pure rules

**Files:**
- Create: `scripts/alpha-caps.mjs`, `src/lib/alphaCaps.ts` (generated), `src/lib/roster.ts`
- Test: `scripts/check.mjs` (a new section above its closing `console.log(failed ? …)` line)

**Interfaces:**
- Produces: `ALPHA_SKILL_CAPS: Record<number, number>`, `ALPHA_CAPS_BUILD: number` (`src/lib/alphaCaps.ts`).
- Produces (`src/lib/roster.ts`): `type CloneState = 'alpha' | 'omega' | 'unknown'`; `type SkillLevel = { id: number; trained: number; active: number }`; `cloneState(skills: SkillLevel[], caps: Record<number, number>): CloneState`; `usableSkills(trained: Record<number, number>, active?: Record<number, number>): Record<number, number>`; `type Asked = 'main' | 'mailer' | 'alt'`; `type Sorted = { as: Asked } | { refuse: 'notMain' | 'isMain' | 'isAlt' }`; `sortLogin(asked: Asked, char: number, ledger: number, mailer: number | null, onRoster: boolean): Sorted`.

- [ ] **Step 1: Write the generator**

Create `scripts/alpha-caps.mjs`:

```js
// Alpha's skill limits, from CCP's static data (SDE): ESI has no clone-state field and no list of what an Alpha can
// use. Run after a game update changes them:
//
//   curl -sS https://developers.eveonline.com/static-data/tranquility/latest.jsonl      # its buildNumber
//   curl -sSO https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-<build>-jsonl.zip
//   unzip the archive's cloneGrades.jsonl, then
//   node scripts/alpha-caps.mjs <path to cloneGrades.jsonl> <build>
//
// Writes src/lib/alphaCaps.ts. The file has one grade a race (Caldari, Minmatar, Amarr, Gallente); on build 3561556
// (30 September 2026) all four list the same 175 skills at the same levels, and this stops if that ever changes,
// since the app keeps one cap a skill.
import fs from 'node:fs';

const [file, build] = process.argv.slice(2);
if (!file || !build) { console.error('usage: node scripts/alpha-caps.mjs <cloneGrades.jsonl> <build>'); process.exit(1); }

const grades = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const caps = new Map();
for (const g of grades) {
  for (const s of g.skills ?? []) {
    if (caps.has(s.typeID) && caps.get(s.typeID) !== s.level) { console.error(`The grades disagree on skill ${s.typeID}: ${caps.get(s.typeID)} and ${s.level}`); process.exit(1); }
    caps.set(s.typeID, s.level);
  }
}
const ids = [...caps.keys()].sort((a, b) => a - b);
const lines = [];
for (let i = 0; i < ids.length; i += 10) lines.push('  ' + ids.slice(i, i + 10).map((id) => `${id}: ${caps.get(id)},`).join(' '));
fs.writeFileSync(new URL('../src/lib/alphaCaps.ts', import.meta.url), `// Generated by scripts/alpha-caps.mjs from CCP's static data (cloneGrades.jsonl). Don't edit by hand.

/** The static data build these came from. */
export const ALPHA_CAPS_BUILD = ${Number(build)};

/**
 * The highest level of each skill an Alpha clone can use, by skill type ID. A skill not listed can't be used by an
 * Alpha at all (cap 0). Levels trained above a cap stay trained and go inactive while the account is Alpha.
 */
export const ALPHA_SKILL_CAPS: Record<number, number> = {
${lines.join('\n')}
};
`);
console.log(`${ids.length} skills from ${grades.length} grades`);
```

- [ ] **Step 2: Generate the caps**

Run: `node scripts/alpha-caps.mjs .playwright-mcp/sde/cloneGrades.jsonl 3561556`

Expected: `175 skills from 4 grades`, and `src/lib/alphaCaps.ts` written. (`.playwright-mcp/` is gitignored; the generated file is what's committed. If the copy there is gone, the script's header says how to fetch it.)

- [ ] **Step 3: Write the failing tests**

In `scripts/check.mjs`, above the final `console.log(failed ? …)` line, add:

```js
console.log('\n--- several characters: clone state, and whose login came back ---');
{
  const { ALPHA_SKILL_CAPS } = await import('../src/lib/alphaCaps.ts');
  const { ALPHA_CAPS } = await import('../src/lib/constants.ts');
  const { cloneState, usableSkills, sortLogin } = await import('../src/lib/roster.ts');
  const MINING = 3386, BARGE = 17940, BROKER = 3446, TRADE = 3443, ACCOUNTING = 16622;
  eq('  175 skills an Alpha can use', Object.keys(ALPHA_SKILL_CAPS).length, 175);
  eq('  Mining to IV, and Mining Barge not at all', [ALPHA_SKILL_CAPS[MINING], ALPHA_SKILL_CAPS[BARGE] ?? 0], [4, 0]);
  // The trade caps the app has used since before this list (constants.ts) agree with CCP's.
  eq('  the trade skills\' caps agree with the ones the fees already use', [ALPHA_SKILL_CAPS[BROKER], ALPHA_SKILL_CAPS[TRADE], ALPHA_SKILL_CAPS[ACCOUNTING] ?? 0], [ALPHA_CAPS.br, ALPHA_CAPS.trade, ALPHA_CAPS.acc]);

  const sk = (id, trained, active = trained) => ({ id, trained, active });
  eq('  a skill usable below its trained level: Alpha, for certain', cloneState([sk(MINING, 5, 4), sk(BARGE, 3, 0)], ALPHA_SKILL_CAPS), 'alpha');
  eq('  a skill usable above Alpha\'s cap: Omega', cloneState([sk(MINING, 5), sk(BROKER, 2)], ALPHA_SKILL_CAPS), 'omega');
  eq('  a skill Alpha can\'t use at all, usable: Omega', cloneState([sk(BARGE, 1)], ALPHA_SKILL_CAPS), 'omega');
  eq('  nothing past Alpha\'s limits: ESI can\'t tell', cloneState([sk(MINING, 4), sk(BROKER, 2), sk(BARGE, 0)], ALPHA_SKILL_CAPS), 'unknown');
  eq('  no skills read: can\'t tell', cloneState([], ALPHA_SKILL_CAPS), 'unknown');
  eq('  what it can use: the trained level, or the active one where they differ', usableSkills({ [MINING]: 5, [BARGE]: 3, [BROKER]: 2 }, { [MINING]: 4, [BARGE]: 0 }), { [MINING]: 4, [BARGE]: 0, [BROKER]: 2 });
  eq('    and the trained levels when nothing is capped', usableSkills({ [MINING]: 5 }), { [MINING]: 5 });

  // EVE's page picks the character, so the cloud sorts out who came back. Main 1, mail sender 7, an alt 2.
  eq('  adding an alt, and an alt came back', sortLogin('alt', 2, 1, 7, false), { as: 'alt' });
  eq('    an alt handed over again', sortLogin('alt', 2, 1, 7, true), { as: 'alt' });
  eq('    the main came back: kept as the main\'s login', sortLogin('alt', 1, 1, 7, false), { as: 'main' });
  eq('    the mail sender came back: kept as the sender\'s', sortLogin('alt', 7, 1, 7, false), { as: 'mailer' });
  eq('  a sender login that is an alt can\'t be kept', sortLogin('mailer', 2, 1, 7, true), { refuse: 'isAlt' });
  eq('    one that was removed from the roster can', sortLogin('mailer', 2, 1, 7, false), { as: 'mailer' });
  eq('    and the main can\'t mail itself, as before', sortLogin('mailer', 1, 1, null, false), { refuse: 'isMain' });
  eq('  the main\'s login has to be the main, as before', [sortLogin('main', 1, 1, null, false), sortLogin('main', 2, 1, null, false)], [{ as: 'main' }, { refuse: 'notMain' }]);
}
```

- [ ] **Step 4: Run it and see it fail**

Run: `npm run check`

Expected: the run stops with `Cannot find module …/src/lib/roster.ts`.

- [ ] **Step 5: Write the rules**

Create `src/lib/roster.ts`:

```ts
/**
 * Several characters in one ledger: the rules that need no I/O, shared with the cloud Worker (so free of the store,
 * config and React). An alt is a character on another of your accounts whose login the cloud keeps and reads; it
 * never logs in to the app, and its data lives under its own character ID.
 */

/** Alpha or Omega right now, as far as ESI lets it be told. */
export type CloneState = 'alpha' | 'omega' | 'unknown';
/** One skill as ESI reports it: the level trained, and the level usable now. They differ only while Alpha caps it. */
export type SkillLevel = { id: number; trained: number; active: number };

/**
 * ESI has no clone-state field. A skill usable below its trained level is an Alpha's cap at work, for certain. A skill
 * usable above Alpha's cap for it (`caps`, from CCP's static data; a skill not listed has cap 0) can only be an
 * Omega's. A character that has trained nothing past Alpha's limits looks the same either way: unknown.
 */
export function cloneState(skills: SkillLevel[], caps: Record<number, number>): CloneState {
  if (skills.some((s) => s.active < s.trained)) return 'alpha';
  if (skills.some((s) => s.active > (caps[s.id] ?? 0))) return 'omega';
  return 'unknown';
}

/** What a character can use now: its trained levels, with the active level wherever the two differ. */
export function usableSkills(trained: Record<number, number>, active?: Record<number, number>): Record<number, number> {
  return active ? { ...trained, ...active } : trained;
}

/** Which login the app asked EVE for. */
export type Asked = 'main' | 'mailer' | 'alt';
export type Sorted = { as: Asked } | { refuse: 'notMain' | 'isMain' | 'isAlt' };

/**
 * EVE's login page, not the app, decides which character a login is for, and it has already stopped that
 * character's earlier logins with a different set of permissions by the time the cloud is handed the new one. So a
 * wrong pick while adding an alt is kept as what it is: the main as the main's login, the mail sender as the
 * sender's (the alt flow asks for the main's permissions, which include sending and tidying mail). Both are offered
 * on EVE's page whenever you're still signed in to the main account there.
 *
 * The reverse can't be kept: a sender login has two permissions and can't read for an alt. `onRoster`: the character
 * is an alt of this ledger now (one removed from the roster is nobody's alt, and may be the sender).
 */
export function sortLogin(asked: Asked, char: number, ledger: number, mailer: number | null, onRoster: boolean): Sorted {
  if (asked === 'main') return char === ledger ? { as: 'main' } : { refuse: 'notMain' };
  if (asked === 'mailer') return char === ledger ? { refuse: 'isMain' } : onRoster ? { refuse: 'isAlt' } : { as: 'mailer' };
  if (char === ledger) return { as: 'main' };
  if (char === mailer) return { as: 'mailer' };
  return { as: 'alt' };
}
```

- [ ] **Step 6: Run the tests and the build**

Run: `npm run check && npm run build`

Expected: both `all passed`; the build clean. If a cap assertion fails, the generated file is the evidence: print `ALPHA_SKILL_CAPS[<id>]` and correct the test's expectation only if CCP's figure is what the file says (the type IDs above are Mining 3386, Mining Barge 17940, Broker Relations 3446, Trade 3443, Accounting 16622).

- [ ] **Step 7: Commit**

```bash
git add scripts/alpha-caps.mjs src/lib/alphaCaps.ts src/lib/roster.ts scripts/check.mjs
git commit -F - <<'EOF'
Several characters: Alpha's caps from CCP's static data, clone state, and whose login came back

The alts go back and forth between Alpha and Omega, and ESI has no field that says which a character is. Its
skills answer gives a trained and an active level, which differ only while Alpha caps a skill. That settles
Alpha. Omega needs to know what Alpha may use: CCP's static data has it (cloneGrades.jsonl, four grades, one a
race, each the same 175 skills at the same levels on build 3561556). scripts/alpha-caps.mjs turns that into
src/lib/alphaCaps.ts and stops if the grades ever disagree. A character with nothing trained past Alpha's limits
can't be told apart, and cloneState says so.

sortLogin is the rule for a login the cloud is handed: EVE's page picks the character and has already stopped its
earlier logins, so a wrong pick while adding an alt is kept as what it is (the main's login, or the mail
sender's); only a sender login that turns out to be an alt is refused, since two permissions can't read for it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 3: The roster's tables, a `Reader`, and mining told whose login and whose data

**Files:**
- Create: `worker/migrations/0016_alts.sql`
- Modify: `worker/src/eve.ts` (the `Purpose` type at line 13; `useLogin`'s refusal message at line 98; new exports at the end of the logins section), `worker/src/mining.ts` (whole file), `src/lib/mining.ts` (after `SESSION_GAP_MS`), `worker/src/index.ts:57` and `:13`
- Test: `scripts/check.mjs`, `scripts/check-worker.mjs`

**Interfaces:**
- Consumes: `d1`, `keepKey`, `stubFetch`, `testEnv` (Task 1).
- Produces (`worker/src/eve.ts`): `type Purpose = 'main' | 'mailer' | \`alt:${number}\``; `altPurpose(altId: number): Purpose`; `type Reader = { ledger: number; purpose: Purpose; char: number }`; `ledgerReader(charId: number): Reader`; `altReader(ledger: number, altId: number): Reader`; `readerLogin(env, who: Reader): Promise<Login | null>`; `stillKept(db: D1Database, who: Reader): Promise<boolean>`.
- Produces (`worker/src/mining.ts`): `readMiningRound(env, who: Reader, now?: number): Promise<number | null>`.
- Produces (`src/lib/mining.ts`): `isBaseline(prevAt: number | null | undefined, now: number): boolean`.
- Produces: tables `alts (char_id, ledger, name, added_at, removed_at)`; column `mining_state.ship_type_id`.

- [ ] **Step 1: Write the migration**

Create `worker/migrations/0016_alts.sql`:

```sql
-- Several characters in one ledger. An alt is a character on another of the owner's accounts: the cloud keeps its
-- login under the main's ledger (keys: char_id = the main, purpose = 'alt:<its id>') and reads it into rows under
-- its own character ID. This table is the lasting record of which characters are alts of which ledger, so that a
-- removed alt whose data was kept is still known not to be a ledger of its own (the market watch reads every
-- ledger's open orders), and so alts are never found by matching the text of a purpose.
CREATE TABLE IF NOT EXISTS alts (
  char_id INTEGER PRIMARY KEY,   -- the alt
  ledger INTEGER NOT NULL,       -- the main whose ledger it feeds
  name TEXT,
  added_at INTEGER NOT NULL,
  removed_at INTEGER             -- set when removed with its data kept; the row goes when its data is deleted
);
CREATE INDEX IF NOT EXISTS alts_by_ledger ON alts (ledger);

-- The hull at the last mining read, whether or not anything was mined: an alt's "right now" comes from here, since
-- the browser holds no alt login to ask ESI with.
ALTER TABLE mining_state ADD COLUMN ship_type_id INTEGER;
```

- [ ] **Step 2: Write the failing tests**

In `scripts/check.mjs`, inside the "several characters" section from Task 2, add at its end:

```js
  const { isBaseline, SESSION_GAP_MS } = await import('../src/lib/mining.ts');
  const T = Date.parse('2026-10-01T15:00:00Z');
  eq('  a mining snapshot ten minutes old is compared with', isBaseline(T - 10 * 60_000, T), false);
  eq('    one older than a session gap is only a baseline', isBaseline(T - SESSION_GAP_MS - 1, T), true);
  eq('    and so is there being none', isBaseline(null, T), true);
```

In `scripts/check-worker.mjs`, above the final `console.log(failed ? …)` line, add:

```js
/** The permissions a login handed over by the app carries that the readers look for. */
const SCOPES = [
  'esi-wallet.read_character_wallet.v1', 'esi-markets.read_character_orders.v1', 'esi-assets.read_assets.v1',
  'esi-characters.read_loyalty.v1', 'esi-skills.read_skills.v1', 'esi-skills.read_skillqueue.v1',
  'esi-industry.read_character_mining.v1', 'esi-location.read_ship_type.v1', 'esi-mail.send_mail.v1', 'esi-mail.organize_mail.v1',
];
/** A ledger with its main's login kept, and one alt on its roster with its own. */
async function ledgerWithAlt() {
  const db = d1();
  await keepKey(db, MAIN, 'main', MAIN, 'Main', SCOPES);
  await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', SCOPES);
  db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', ALT, MAIN, 'Miner Two', Date.now());
  return { db, env: testEnv(db) };
}
const T0 = Date.parse('2026-10-01T15:00:00Z');
const MIN = 60_000;
const VELDSPAR = 1230, SCORDITE = 1228, VENTURE = 32880, SYSTEM = 30000142;
const mined = (veld, scor) => [
  { date: '2026-10-01', solar_system_id: SYSTEM, type_id: VELDSPAR, quantity: veld },
  ...(scor ? [{ date: '2026-10-01', solar_system_id: SYSTEM, type_id: SCORDITE, quantity: scor }] : []),
];

console.log('\n--- mining: whose login, whose data ---');
{
  const { readMiningRound } = await import('../worker/src/mining.ts');
  const { altReader, ledgerReader } = await import('../worker/src/eve.ts');

  // The main, as it has always been read: everything under its own ID.
  {
    const { db, env } = await ledgerWithAlt();
    let qty = 1000;
    const f = stubFetch([[`/characters/${MAIN}/mining/`, () => mined(qty)], [`/characters/${MAIN}/ship/`, { ship_type_id: VENTURE }]]);
    eq('  the main\'s first read is a baseline: no ticks', await readMiningRound(env, ledgerReader(MAIN), T0), 0);
    qty = 1600;
    eq('    ten minutes on, what grew is one tick', await readMiningRound(env, ledgerReader(MAIN), T0 + 10 * MIN), 1);
    eq('    a read before ESI\'s ten minutes are up isn\'t made', await readMiningRound(env, ledgerReader(MAIN), T0 + 12 * MIN), null);
    f.restore();
    eq('    all of it under the main', counts(db), { [`records:${MAIN}`]: 1, [`revs:${MAIN}`]: 1, [`jobs:${MAIN}`]: 1, [`mining_state:${MAIN}`]: 1, [`mining_ticks:${MAIN}`]: 1 });
    eq('    the tick is what grew, in the hull it was in', db.rows('SELECT qty, ship_type_id AS ship FROM mining_ticks'), [{ qty: 600, ship: VENTURE }]);
    eq('    the ship is kept on the snapshot, from the first read on', db.rows('SELECT ship_type_id AS ship FROM mining_state'), [{ ship: VENTURE }]);
  }

  // An alt: its login is kept under the main's ledger, and every row it makes is under its own ID.
  {
    const { db, env } = await ledgerWithAlt();
    const before = under(db, MAIN);
    let qty = 500;
    const f = stubFetch([[`/characters/${ALT}/mining/`, () => mined(qty, 200)], [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }]]);
    await readMiningRound(env, altReader(MAIN, ALT), T0);
    qty = 900;
    eq('  an alt\'s second read makes its tick', await readMiningRound(env, altReader(MAIN, ALT), T0 + 10 * MIN), 1);
    f.restore();
    eq('    nothing of it is under the main', under(db, MAIN), before);
    eq('    all of it is under the alt', counts(db), { [`records:${ALT}`]: 2, [`revs:${ALT}`]: 1, [`jobs:${ALT}`]: 1, [`mining_state:${ALT}`]: 1, [`mining_ticks:${ALT}`]: 1 });
    eq('    its records carry its own character', db.rows(`SELECT id FROM records WHERE kind = 'mining' ORDER BY id`).map((r) => r.id.split(':')[0]), [String(ALT), String(ALT)]);
    eq('    ESI was asked about the alt only', f.calls.every((c) => c.path.startsWith(`/characters/${ALT}/`)), true);
  }

  // The reader refuses to write for a character its login isn't.
  {
    const { db, env } = await ledgerWithAlt();
    const before = counts(db);
    const f = stubFetch([[/mining|ship/, []]]);
    await rejects('  an alt\'s login asked to write as the main: refused', () => readMiningRound(env, { ledger: MAIN, purpose: `alt:${ALT}`, char: MAIN }, T0), /wrong purpose/);
    await rejects('  the main\'s login asked to write as an alt: refused', () => readMiningRound(env, { ledger: MAIN, purpose: 'main', char: ALT }, T0), /wrong purpose/);
    await keepKey(db, MAIN, 'alt:900002', 900003, 'Someone Else', SCOPES);
    await rejects('  a login kept as one alt that is another character\'s: refused', () => readMiningRound(env, altReader(MAIN, 900002), T0), /is character 900003, not 900002/);
    f.restore();
    eq('    and nothing was written, or asked of ESI', [counts(db), f.calls.length], [before, 0]);
  }

  // After a gap the stored snapshot is a baseline: what grew can't be dated to the last ten minutes.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('INSERT INTO mining_state (char_id, at, data) VALUES (?, ?, ?)', ALT, T0 - 40 * MIN, JSON.stringify({ [`${ALT}:2026-10-01:${SYSTEM}:${VELDSPAR}`]: 100 }));
    const f = stubFetch([[`/characters/${ALT}/mining/`, mined(5000)], [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }]]);
    eq('  a read 40 minutes after the last makes no tick', await readMiningRound(env, altReader(MAIN, ALT), T0), 0);
    f.restore();
    eq('    the snapshot moves on, and the record is kept', [db.rows('SELECT at FROM mining_state')[0].at, db.rows(`SELECT COUNT(*) AS n FROM records WHERE kind = 'mining'`)[0].n, db.rows('SELECT COUNT(*) AS n FROM mining_ticks')[0].n], [T0, 1, 0]);
  }

  // A character that has never mined.
  {
    const { db, env } = await ledgerWithAlt();
    const f = stubFetch([[`/characters/${ALT}/mining/`, []], [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }]]);
    eq('  an empty mining ledger is a read, with nothing to keep', await readMiningRound(env, altReader(MAIN, ALT), T0), 0);
    f.restore();
    eq('    a snapshot and a job, no records', counts(db), { [`jobs:${ALT}`]: 1, [`mining_state:${ALT}`]: 1 });
  }

  // Removed while it was being read: the login is gone by the time there's something to write.
  {
    const { db, env } = await ledgerWithAlt();
    const f = stubFetch([
      [`/characters/${ALT}/mining/`, () => { db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`); return mined(700); }],
      [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }],
    ]);
    eq('  an alt removed mid-read', await readMiningRound(env, altReader(MAIN, ALT), T0), null);
    f.restore();
    eq('    gets no rows back', counts(db), {});
  }
}
```

- [ ] **Step 3: Run and see them fail**

Run: `npm run check`

Expected: the pure section fails with `isBaseline is not a function`. Comment nothing out; go on to implement.

- [ ] **Step 4: The pure baseline rule**

In `src/lib/mining.ts`, after the `SESSION_GAP_MS` line, add:

```ts
/**
 * Whether the stored snapshot is too old to compare with. What grew since it could have been mined at any time in
 * between, and a tick says "mined in the ten minutes before this read": after a refused login or a removed and
 * re-added character, one read would otherwise turn a day's mining into a single tick, which the sessions then show
 * as ten minutes of impossible yield. Such a read only sets a new baseline.
 */
export const isBaseline = (prevAt: number | null | undefined, now: number): boolean => prevAt == null || now - prevAt > SESSION_GAP_MS;
```

- [ ] **Step 5: `Purpose`, `Reader` and the login check**

In `worker/src/eve.ts`, replace:

```ts
export type Purpose = 'main' | 'mailer';
```

with:

```ts
/**
 * What a kept login is for: the ledger's own character (`main`), the character its alert mail is sent from
 * (`mailer`), or one of its alts (`alt:<its character ID>`, migration 0016).
 */
export type Purpose = 'main' | 'mailer' | `alt:${number}`;
export const altPurpose = (altId: number): Purpose => `alt:${Math.trunc(altId)}`;
```

In `useLogin`, replace the refusal's message line:

```ts
      throw new EveError(e.status, `EVE refused the cloud’s login for ${row.token_char_name ?? (purpose === 'main' ? 'your character' : 'your sender')} (${e.reason ?? e.status}); hand the cloud your login again`, e.reason);
```

with:

```ts
      const whose = row.token_char_name ?? (purpose === 'main' ? 'your character' : purpose === 'mailer' ? 'your sender' : 'one of your characters');
      throw new EveError(e.status, `EVE refused the cloud’s login for ${whose} (${e.reason ?? e.status}); hand the cloud ${purpose === 'main' || purpose === 'mailer' ? 'your' : 'that'} login again`, e.reason);
```

After `useLogin` (before the `/** One ESI GET.` comment), add:

```ts
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
```

- [ ] **Step 6: The mining reader**

Replace the body of `worker/src/mining.ts` from its imports down to the end of `readMiningRound` with:

```ts
import { isBaseline, miningKey, miningSnapshot, miningTicks, readMining, READ_EVERY_MS, type RawMining } from '../../src/lib/mining';
import { esiAll, esiGet, readerLogin, stillKept, type Reader } from './eve';
import { noteJob } from './archive';
import { push } from './sync';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };

const SCOPE = 'esi-industry.read_character_mining.v1';
/** The ship you're in, read with the ledger so each tick knows its hull. */
const SHIP_SCOPE = 'esi-location.read_ship_type.v1';
/** Ticks kept: enough for a quarter's sessions. */
const KEEP_MS = 90 * 86400_000;

/**
 * One character's read, when ten minutes have passed since its last. `who` says whose login is used and whose data
 * it is (eve.ts, Reader): every row here is filed under `who.char`. Returns how many ticks it kept, or null when it
 * didn't read (not due, no login, no permission) or the character was removed while it was being read.
 */
export async function readMiningRound(env: Env, who: Reader, now = Date.now()): Promise<number | null> {
  const db = env.DB;
  const char = who.char;
  const state = await db.prepare('SELECT at, data FROM mining_state WHERE char_id = ?1').bind(char).first<{ at: number; data: string }>();
  // A little under ESI's ten minutes, so a round a few seconds early doesn't wait another five.
  if (state && now - state.at < READ_EVERY_MS - 60_000) return null;
  const login = await readerLogin(env, who);
  if (!login || !login.scopes.includes(SCOPE)) return null;
  const rows = readMining(await esiAll<RawMining>(`/characters/${char}/mining/`, { token: login.access }), char);
  // A snapshot too old to compare with is only a baseline (mining.ts, isBaseline): no ticks from this read.
  const prev = state && !isBaseline(state.at, now) ? (JSON.parse(state.data) as Record<string, number>) : null;
  // The hull you're in now stands for the ten minutes before: the read before would have seen a change of ship. Read
  // every time, a baseline included, and kept on the snapshot: an alt's "right now" is this.
  const ship = login.scopes.includes(SHIP_SCOPE)
    ? await esiGet<{ ship_type_id: number }>(`/characters/${char}/ship/`, { token: login.access }).then((r) => r.data.ship_type_id).catch(() => null)
    : null;
  const ticks = miningTicks(prev, rows, now);
  if (!(await stillKept(db, who))) return null;
  const stmts = [
    db.prepare(`INSERT INTO mining_state (char_id, at, data, ship_type_id) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(char_id) DO UPDATE SET at = excluded.at, data = excluded.data, ship_type_id = excluded.ship_type_id`)
      .bind(char, now, JSON.stringify(miningSnapshot(rows)), ship),
    ...ticks.map((t) => db.prepare('INSERT INTO mining_ticks (char_id, at, system_id, type_id, qty, ship_type_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(char, t.at, t.systemId, t.typeId, t.qty, ship)),
    db.prepare('DELETE FROM mining_ticks WHERE char_id = ?1 AND at < ?2').bind(char, now - KEEP_MS),
  ];
  await db.batch(stmts);
  // Rows that grew (or are new) go up as records, like the app's own sync makes them. The first read sends them all;
  // so does one after a gap, measured against the stored snapshot whatever its age: the records are the ledger itself.
  const stored = state ? (JSON.parse(state.data) as Record<string, number>) : null;
  const changed = rows.filter((r) => !stored || stored[miningKey(r)] !== r.qty);
  if (changed.length) await push(db, char, { records: changed.map((r) => ({ k: 'mining', i: miningKey(r), d: r })), docs: [] });
  await noteJob(db, char, 'mining', { ok: true, detail: { rows: rows.length, ticks: ticks.length, pushed: changed.length } });
  return ticks.length;
}
```

Leave `miningTicksFor` below it as it is. Update the file's header comment: replace "the cloud reads each ledger's mining" with "the cloud reads each ledger's mining, and each of its alts'".

- [ ] **Step 7: The main's call**

In `worker/src/index.ts`, change the import on line 22 to include the new helper:

```ts
import { dropLogin, EveError, keepLogin, ledgerReader, type Purpose } from './eve';
```

and in `fiveMinutes` replace:

```ts
    try { await readMiningRound(env, id); } catch (e) {
```

with:

```ts
    try { await readMiningRound(env, ledgerReader(id)); } catch (e) {
```

- [ ] **Step 8: Run the tests and the build**

Run: `npm run check && npm run build`

Expected: both `all passed`; the build clean (`tsc -p worker` included).

- [ ] **Step 9: Check the migration on D1's own engine**

Run:

```bash
cd worker && npx wrangler d1 migrations apply jita-ledger --local && npx wrangler d1 execute jita-ledger --local --command "SELECT name FROM sqlite_master WHERE name IN ('alts','alts_by_ledger'); SELECT ship_type_id FROM mining_state LIMIT 1;" && cd ..
```

Expected: the migration listed as applied, both names returned, and no error from the second statement. (The stand-in is SQLite, not D1; this is the one check that the file runs on wrangler's.)

- [ ] **Step 10: Commit**

```bash
git add worker/migrations/0016_alts.sql worker/src/eve.ts worker/src/mining.ts worker/src/index.ts src/lib/mining.ts scripts/check.mjs scripts/check-worker.mjs
git commit -F - <<'EOF'
Cloud: a reader is told whose login it uses and whose data it writes, and mining is the first

readMiningRound took one character ID and used it two ways: mining_state, push and noteJob were bound by the
argument, while the ESI paths, the records and mining_ticks were bound by the login's character. They were the
same only because a ledger's login is always the ledger's own character. With an alt's login kept under the
main's ledger they differ, and the obvious refactor pushes an alt's mining into the main's records and flips
mining_state between two characters every round.

A Reader is { ledger, purpose, char }: only useLogin takes the ledger and the purpose, everything else takes
char, and readerLogin refuses before anything is read when the login isn't the character the reader writes for.
The tests run the real SQL (scripts/check-worker.mjs): an alt's two reads leave every row under the alt and the
main's counts untouched; an alt's login asked to write as the main is refused; an alt removed mid-read gets
nothing back; an empty mining ledger is a read with nothing to keep.

Two changes reach the main's mining too. The ship is read on every read and kept on mining_state (the first read
skipped it), since an alt's "right now" will come from there. And a snapshot older than a session gap, 25
minutes, is only a baseline: before, the first read after a refused login turned everything mined in the gap
into one tick, which the app shows as ten minutes of impossible yield.

Migration 0016 adds the alts table (which characters are alts of which ledger, surviving removal) and
mining_state.ship_type_id. It only adds, so the Worker now live runs on it unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 4: An alt's full read: `archive`, and its sheet

**Files:**
- Create: `worker/src/sheet.ts`, `worker/src/alts.ts`
- Modify: `worker/src/archive.ts` (`ArchiveResult`, `archive`, a new `roughPrices`), `worker/src/index.ts` (`runArchive`)
- Test: `scripts/check-worker.mjs`

**Interfaces:**
- Consumes: `Reader`, `readerLogin`, `stillKept`, `ledgerReader`, `altReader` (Task 3); `cloneState`, `CloneState`, `ALPHA_SKILL_CAPS` (Task 2).
- Produces (`worker/src/archive.ts`): `archive(env, who: Reader, opts?: { prices?: Record<number, number> }): Promise<ArchiveResult>` where `ArchiveResult` gains `wallet?: number | null` and `lp?: { corporationId: number; points: number }[] | null`; `roughPrices(): Promise<Record<number, number>>`.
- Produces (`worker/src/sheet.ts`): `readSheet(env, who: Reader, extra: { wallet: number | null; lp: { corporationId: number; points: number }[] | null }, now?: number): Promise<SheetResult>` with `type SheetResult = { skills: number; clone: CloneState | null; pushed: number }`.
- Produces (`worker/src/alts.ts`): `type AltRow = { charId: number; name: string | null; addedAt: number }`; `rosterOf(db, ledger): Promise<AltRow[]>`; `onRoster(db, ledger, altId): Promise<boolean>`; `isAlt(db, charId): Promise<boolean>`; `altReaders(db): Promise<Reader[]>`; `readAlt(env, who: Reader, prices?): Promise<ArchiveResult & { clone: CloneState | null }>`.

- [ ] **Step 1: Write the failing tests**

In `scripts/check-worker.mjs`, above the final `console.log(failed ? …)` line, add:

```js
/** ESI's answers for one character: a trade, a journal entry, an open order, a hangar item, a wrap in asset safety. */
function esiFor(char, over = {}) {
  const c = `/characters/${char}`;
  const MINING = 3386, BARGE = 17940;
  return [
    [`${c}/wallet/transactions/`, [{ transaction_id: 11, date: '2026-10-01T10:00:00Z', is_buy: false, quantity: 100, type_id: VELDSPAR, unit_price: 20, location_id: 60003760 }]],
    [`${c}/wallet/journal/`, [{ id: 21, date: '2026-10-01T10:00:00Z', ref_type: 'market_transaction', amount: 2000, balance: 5000, context_id: 11, first_party_id: 1, second_party_id: char }]],
    [`${c}/orders/`, [{ order_id: 31, type_id: SCORDITE, price: 30, volume_total: 10, volume_remain: 10, issued: '2026-10-01T09:00:00Z', location_id: 60003760 }]],
    [`${c}/orders/history/`, []],
    [`${c}/assets/`, [
      { item_id: 5001, type_id: 60, quantity: 1, location_id: 2004, location_flag: 'AssetSafety', location_type: 'other', is_singleton: true },
      { item_id: 5002, type_id: VELDSPAR, quantity: 100, location_id: 5001, location_flag: 'Hangar', location_type: 'item' },
      { item_id: 5003, type_id: SCORDITE, quantity: 10, location_id: 60003760, location_flag: 'Hangar', location_type: 'station' },
    ]],
    [new RegExp(`^POST ${c}/assets/names/$`), []],
    [/^POST \/universe\/names\/$/, [{ id: VELDSPAR, name: 'Veldspar' }, { id: SCORDITE, name: 'Scordite' }]],
    ['/markets/prices/', [{ type_id: VELDSPAR, average_price: 20 }, { type_id: SCORDITE, average_price: 30 }]],
    [`${c}/loyalty/points/`, [{ corporation_id: 1000035, loyalty_points: 1234 }]],
    [`${c}/wallet/`, over.wallet ?? 5000],
    [`${c}/skills/`, { total_sp: 900000, skills: over.skills ?? [
      { skill_id: MINING, trained_skill_level: 5, active_skill_level: 4, skillpoints_in_skill: 256000 },
      { skill_id: BARGE, trained_skill_level: 3, active_skill_level: 0, skillpoints_in_skill: 32000 },
    ] }],
    [`${c}/skillqueue/`, [{ skill_id: MINING, finished_level: 5, queue_position: 0, finish_date: '2026-10-03T00:00:00Z', start_date: '2026-10-01T00:00:00Z' }]],
    [`${c}/attributes/`, { intelligence: 20, memory: 21, perception: 22, willpower: 23, charisma: 19 }],
    [new RegExp(`^POST /characters/${SENDER}/mail/$`), 777],
  ];
}

console.log('\n--- an alt\'s full read ---');
{
  const { archive } = await import('../worker/src/archive.ts');
  const { readAlt, altReaders, rosterOf, onRoster, isAlt } = await import('../worker/src/alts.ts');
  const { altReader, ledgerReader } = await import('../worker/src/eve.ts');
  const docOf = (db, char, key) => { const r = db.rows('SELECT data FROM docs WHERE char_id = ? AND key = ?', char, key)[0]; return r ? JSON.parse(r.data) : null; };
  const kinds = (db, char) => Object.fromEntries(db.rows('SELECT kind, COUNT(*) AS n FROM records WHERE char_id = ? GROUP BY kind', char).map((r) => [r.kind, r.n]));

  // The main, as it has always been copied, with alert mail on and a sender: the case where an alt's read must stay silent.
  const withSender = async () => {
    const x = await ledgerWithAlt();
    await keepKey(x.db, MAIN, 'mailer', SENDER, 'Postmaster', SCOPES);
    const { push } = await import('../worker/src/sync.ts');
    await push(x.db, MAIN, { records: [], docs: [{ key: 'alerts', d: { on: true, mail: true, quiet: false } }] });
    return x;
  };
  {
    const { db, env } = await withSender();
    const f = stubFetch(esiFor(MAIN));
    const r = await archive(env, ledgerReader(MAIN));
    f.restore();
    eq('  the main\'s copy: a trade, a journal entry, an order, as before', [r.trades, r.journal, r.orders, r.stock], [1, 1, 1, true]);
    eq('    its records are under the main', kinds(db, MAIN), { journal: 1, names: 2, netWorth: 1, orders: 1, txs: 1 });
    eq('    it notes its orders read', db.rows(`SELECT job FROM jobs WHERE char_id = ? ORDER BY job`, MAIN).map((x) => x.job), ['orders']);
    eq('    it hands back the wallet and the points it read', [r.wallet, r.lp], [5000, [{ corporationId: 1000035, points: 1234 }]]);
  }

  {
    const { db, env } = await withSender();
    const before = under(db, MAIN);
    const f = stubFetch(esiFor(ALT));
    const r = await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt\'s read: the same kinds, under the alt', kinds(db, ALT), { journal: 1, names: 2, netWorth: 1, orders: 1, txs: 1 });
    eq('    nothing of it under the main', under(db, MAIN), before);
    eq('    its jobs are the copy and the sheet, not an orders read', db.rows('SELECT job FROM jobs WHERE char_id = ? ORDER BY job', ALT).map((x) => x.job), ['archive', 'sheet']);
    eq('    its wrap is registered', db.rows('SELECT wrap_id FROM safety_seen WHERE char_id = ? AND wrap_id != 0', ALT).map((x) => x.wrap_id), [5001]);
    eq('    and the main is not mailed about it', f.calls.filter((c) => c.method === 'POST' && /\/mail\//.test(c.path)).length, 0);
    eq('    ESI was asked about the alt only', f.calls.filter((c) => /^\/characters\//.test(c.path)).every((c) => c.path.startsWith(`/characters/${ALT}/`)), true);
    const meta = docOf(db, ALT, 'meta');
    eq('    its sheet: usable below trained is Alpha', [r.clone, meta.cloneDetected], ['alpha', 'alpha']);
    eq('    only the capped skills are listed as active', meta.activeSkills, { 3386: 4, 17940: 0 });
    eq('    wallet, points, queue and attributes are there', [meta.walletBalance, meta.lpBalances, meta.skillQueue.length, meta.attributes.memory, meta.totalSp], [5000, [{ corporationId: 1000035, points: 1234 }], 1, 21, 900000]);
    eq('    the first read can\'t say since when', meta.cloneSince ?? null, null);
    eq('    its skills are the trained levels', docOf(db, ALT, 'skills'), { 3386: 5, 17940: 3 });
  }

  // Omega again: the cloud saw the change, so it can say since when. And a read that changes nothing pushes nothing.
  {
    const { db, env } = await withSender();
    let f = stubFetch(esiFor(ALT));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    const rev1 = db.rows('SELECT rev FROM revs WHERE char_id = ?', ALT)[0].rev;
    f = stubFetch(esiFor(ALT));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  a read that finds nothing new pushes nothing', db.rows('SELECT rev FROM revs WHERE char_id = ?', ALT)[0].rev, rev1);
    f = stubFetch(esiFor(ALT, { skills: [{ skill_id: 3386, trained_skill_level: 5, active_skill_level: 5 }, { skill_id: 17940, trained_skill_level: 3, active_skill_level: 3 }] }));
    const r = await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    const meta = docOf(db, ALT, 'meta');
    eq('  upgraded: a skill past Alpha\'s cap is usable, so Omega', [r.clone, meta.cloneDetected, meta.activeSkills], ['omega', 'omega', {}]);
    eq('    and the change is dated', typeof meta.cloneSince, 'string');
  }

  // Removed while the copy was running.
  {
    const { db, env } = await withSender();
    const routes = esiFor(ALT);
    routes[0] = [`/characters/${ALT}/wallet/transactions/`, () => { db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`); return []; }];
    const f = stubFetch(routes);
    await readAlt(env, altReader(MAIN, ALT)).catch(() => undefined);
    f.restore();
    eq('  an alt removed mid-read gets no records, documents or jobs', [kinds(db, ALT), db.rows('SELECT COUNT(*) AS n FROM docs WHERE char_id = ?', ALT)[0].n, db.rows('SELECT COUNT(*) AS n FROM jobs WHERE char_id = ?', ALT)[0].n], [{}, 0, 0]);
  }

  // The roster.
  {
    const { db } = await ledgerWithAlt();
    db.run('INSERT INTO alts (char_id, ledger, name, added_at, removed_at) VALUES (?, ?, ?, ?, ?)', 900002, MAIN, 'Gone', 1, 2);
    eq('  the roster is the alts not removed', (await rosterOf(db, MAIN)).map((a) => [a.charId, a.name]), [[ALT, 'Miner Two']]);
    eq('  on the roster: an alt of this ledger, not removed', [await onRoster(db, MAIN, ALT), await onRoster(db, MAIN, 900002), await onRoster(db, 123, ALT)], [true, false, false]);
    eq('  an alt is an alt, removed or not', [await isAlt(db, ALT), await isAlt(db, 900002), await isAlt(db, MAIN)], [true, true, false]);
    eq('  the alts to read are the ones with a login', await altReaders(db), [{ ledger: MAIN, purpose: `alt:${ALT}`, char: ALT }]);
  }
}
```

- [ ] **Step 2: Run and see them fail**

Run: `npm run check`

Expected: `Cannot find module …/worker/src/alts.ts`.

- [ ] **Step 3: `archive` takes a `Reader`**

In `worker/src/archive.ts`:

Change the `eve` import to:

```ts
import { esiAll, esiGet, esiPost, readerLogin, stillKept, useLogin, type Reader } from './eve';
```

Replace the `ArchiveResult` type with:

```ts
export type ArchiveResult = {
  trades: number; journal: number; orders: number; names: number; stock: boolean; netWorth: number | null;
  /** The wallet balance and loyalty points this read saw, for an alt's sheet (sheet.ts); absent without the permission. */
  wallet?: number | null; lp?: { corporationId: number; points: number }[] | null;
};
```

Add, above `archive`:

```ts
/** CCP's rough price for every type, in one request: what net worth and an asset-safety wrap are valued at. */
export async function roughPrices(): Promise<Record<number, number>> {
  const prices: Record<number, number> = {};
  for (const p of (await esiGet<{ type_id: number; average_price?: number }[]>('/markets/prices/')).data) if (p.average_price) prices[p.type_id] = p.average_price;
  return prices;
}
```

Replace the opening of `archive`:

```ts
export async function archive(env: Env, charId: number): Promise<ArchiveResult> {
  const login = await useLogin(env, charId, 'main');
  if (!login) throw new Error('No login kept for the cloud');
  const { access: token, scopes } = login;
  const db = env.DB;
```

with:

```ts
/**
 * `who` says whose login is used and whose data it is (eve.ts, Reader): everything below is read for, and filed
 * under, `who.char`. For an alt two things a ledger gets are left out: the asset-safety mail (its first read would
 * mail the main about every wrap the alt has) and the `orders` job row (nothing refreshes or judges an alt's orders).
 * `opts.prices`: CCP's rough prices when the caller already has them (an hour's alts share one fetch).
 */
export async function archive(env: Env, who: Reader, opts: { prices?: Record<number, number> } = {}): Promise<ArchiveResult> {
  const login = await readerLogin(env, who);
  if (!login) throw new Error('No login kept for the cloud');
  const { access: token, scopes } = login;
  const charId = who.char;
  const alt = who.char !== who.ledger;
  const db = env.DB;
  let rough = opts.prices;
  const prices = async () => (rough ??= await roughPrices());
```

In the orders block, replace:

```ts
    await noteJob(db, charId, 'orders', { ok: true, detail: { orders: r.changed.length } });
```

with:

```ts
    if (!alt) await noteJob(db, charId, 'orders', { ok: true, detail: { orders: r.changed.length } });
```

In the net-worth block, replace:

```ts
    const { data: wallet } = await esiGet<number>(`/characters/${charId}/wallet/`, { token });
    const prices: Record<number, number> = {};
    for (const p of (await esiGet<{ type_id: number; average_price?: number }[]>('/markets/prices/')).data) if (p.average_price) prices[p.type_id] = p.average_price;
    const lp = has(scopes, S.loyalty)
      ? (await esiGet<{ corporation_id: number; loyalty_points: number }[]>(`/characters/${charId}/loyalty/points/`, { token })).data.map((b) => ({ corporationId: b.corporation_id, points: b.loyalty_points }))
      : [];
    const meta = await doc<{ lpRate?: Record<number, { rate: number; lp?: number | null }> }>(db, charId, 'meta');
    const nw = netWorthOf({ wallet, orders, stockTotal, roughPrices: prices, lp, lpRate: meta?.lpRate });
```

with:

```ts
    const { data: wallet } = await esiGet<number>(`/characters/${charId}/wallet/`, { token });
    const lp = has(scopes, S.loyalty)
      ? (await esiGet<{ corporation_id: number; loyalty_points: number }[]>(`/characters/${charId}/loyalty/points/`, { token })).data.map((b) => ({ corporationId: b.corporation_id, points: b.loyalty_points }))
      : [];
    result.wallet = wallet;
    result.lp = has(scopes, S.loyalty) ? lp : null;
    const meta = await doc<{ lpRate?: Record<number, { rate: number; lp?: number | null }> }>(db, charId, 'meta');
    const nw = netWorthOf({ wallet, orders, stockTotal, roughPrices: await prices(), lp, lpRate: meta?.lpRate });
```

Replace the push and the asset-safety mail at the end:

```ts
  if (records.length || docs.length) {
    for (let i = 0; i < Math.max(records.length, 1); i += 2000) {
      await push(db, charId, { records: records.slice(i, i + 2000), docs: i === 0 ? docs : [] });
    }
  }

  // A wrap just registered in asset safety: mailed once, with what's in it at CCP's estimated prices.
  if (freshWraps.length) {
    try {
      const prices: Record<number, number> = {};
      for (const p of (await esiGet<{ type_id: number; average_price?: number }[]>('/markets/prices/')).data) if (p.average_price) prices[p.type_id] = p.average_price;
      const mailed = await mailSafety(env, charId, safetyFindings(freshWraps, (id) => prices[id]));
```

with:

```ts
  // Removed while this ran (an alt taken off the roster): nothing of it goes back in.
  if ((records.length || docs.length) && (await stillKept(db, who))) {
    for (let i = 0; i < Math.max(records.length, 1); i += 2000) {
      await push(db, charId, { records: records.slice(i, i + 2000), docs: i === 0 ? docs : [] });
    }
  }

  // A wrap just registered in asset safety: mailed once, with what's in it at CCP's estimated prices. A ledger's
  // only: the mail goes to the character it's read for, and an alt is never mailed.
  if (freshWraps.length && !alt) {
    try {
      const at = await prices();
      const mailed = await mailSafety(env, charId, safetyFindings(freshWraps, (id) => at[id]));
```

`registerSafety` runs before the push and writes `safety_seen`; guard it the same way. In the assets block replace:

```ts
    const reg = await registerSafety(db, charId, withNames);
```

with:

```ts
    // For an alt, only while it's still on the roster: this writes safety_seen before the push below is reached.
    const reg = alt && !(await stillKept(db, who)) ? { known: new Map(), fresh: [] } : await registerSafety(db, charId, withNames);
```

In `refreshOrders`, leave `useLogin(env, charId, 'main')` as it is: it is a ledger's job only.

- [ ] **Step 4: The main's call in `index.ts`**

In `runArchive`, replace:

```ts
    const detail = await archive(env, charId);
```

with:

```ts
    const detail = await archive(env, ledgerReader(charId));
```

- [ ] **Step 5: The sheet**

Create `worker/src/sheet.ts`:

```ts
/**
 * An alt's sheet: what the app's own sync reads for the main in the browser, read by the cloud for a character that
 * never logs in to the app. Its skills (the `skills` doc, trained levels, the main's shape) and a `meta` doc with the
 * main's field names (wallet, skill points, queue, attributes, loyalty points, clone state), so the app's own rules
 * read an alt unchanged. Run with the hourly copy (alts.ts), which hands it the wallet and points it already read.
 */
import { ALPHA_SKILL_CAPS } from '../../src/lib/alphaCaps';
import { cloneState, type CloneState } from '../../src/lib/roster';
import { esiGet, readerLogin, stillKept, type Reader } from './eve';
import { push } from './sync';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };

const S = { skills: 'esi-skills.read_skills.v1', queue: 'esi-skills.read_skillqueue.v1' };

type RawSkill = { skill_id: number; trained_skill_level: number; active_skill_level: number; skillpoints_in_skill?: number };
type RawQueue = {
  skill_id: number; finished_level: number; finish_date?: string; start_date?: string; queue_position: number;
  training_start_sp?: number; level_start_sp?: number; level_end_sp?: number;
};
type Attributes = { intelligence: number; memory: number; perception: number; willpower: number; charisma: number };

export type SheetResult = { skills: number; clone: CloneState | null; pushed: number };

async function doc<T>(db: D1Database, charId: number, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT data FROM docs WHERE char_id = ?1 AND key = ?2').bind(charId, key).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as T) : null;
}

/** A meta doc without the time its wallet was read: a read that changed nothing else isn't worth a push. */
const settled = (m: Record<string, unknown>) => JSON.stringify({ ...m, walletAt: '' });

export async function readSheet(
  env: Env, who: Reader, extra: { wallet: number | null; lp: { corporationId: number; points: number }[] | null }, now = Date.now(),
): Promise<SheetResult> {
  const login = await readerLogin(env, who);
  if (!login) throw new Error('No login kept for this character');
  const db = env.DB, token = login.access, char = who.char;
  const before = await doc<Record<string, unknown>>(db, char, 'meta');
  const meta: Record<string, unknown> = { ...(before ?? {}) };
  const docs: { key: string; d: unknown }[] = [];
  let clone: CloneState | null = null;
  let count = 0;

  if (login.scopes.includes(S.skills)) {
    const { data } = await esiGet<{ skills: RawSkill[]; total_sp?: number }>(`/characters/${char}/skills/`, { token });
    count = data.skills.length;
    const trained = Object.fromEntries(data.skills.map((x) => [x.skill_id, x.trained_skill_level]));
    if (JSON.stringify(await doc<Record<string, number>>(db, char, 'skills')) !== JSON.stringify(trained)) docs.push({ key: 'skills', d: trained });
    meta.skillSp = Object.fromEntries(data.skills.map((x) => [x.skill_id, x.skillpoints_in_skill ?? 0]));
    if (data.total_sp != null) meta.totalSp = data.total_sp;
    // Only the skills Alpha is capping: what the character can use is its trained level everywhere else (usableSkills).
    meta.activeSkills = Object.fromEntries(data.skills.filter((x) => x.active_skill_level < x.trained_skill_level).map((x) => [x.skill_id, x.active_skill_level]));
    clone = cloneState(data.skills.map((x) => ({ id: x.skill_id, trained: x.trained_skill_level, active: x.active_skill_level })), ALPHA_SKILL_CAPS);
    // "Since" is known only for a change the cloud saw happen: the first read can't say when the state began.
    const was = (before?.cloneDetected as CloneState | undefined) ?? 'unknown';
    if (before && was !== clone) meta.cloneSince = new Date(now).toISOString();
    if (clone === 'unknown') delete meta.cloneDetected; else meta.cloneDetected = clone;

    if (login.scopes.includes(S.queue)) {
      try {
        const { data: q } = await esiGet<RawQueue[]>(`/characters/${char}/skillqueue/`, { token });
        meta.skillQueue = [...q].sort((a, b) => a.queue_position - b.queue_position).map((x) => ({
          skillId: x.skill_id, level: x.finished_level, finish: x.finish_date ?? null, start: x.start_date ?? null,
          trainingStartSp: x.training_start_sp, levelStartSp: x.level_start_sp, levelEndSp: x.level_end_sp,
        }));
      } catch { /* the queue is a preview; the sheet does not hang on it */ }
    }
    try {
      const { data: at } = await esiGet<Attributes>(`/characters/${char}/attributes/`, { token });
      meta.attributes = { intelligence: at.intelligence, memory: at.memory, perception: at.perception, willpower: at.willpower, charisma: at.charisma };
    } catch { /* training time is a nicety */ }
  }
  if (extra.wallet != null) { meta.walletBalance = extra.wallet; meta.walletAt = new Date(now).toISOString(); }
  if (extra.lp) meta.lpBalances = extra.lp;

  if (!before || settled(before) !== settled(meta)) docs.push({ key: 'meta', d: meta });
  if (docs.length && (await stillKept(db, who))) await push(db, char, { records: [], docs });
  return { skills: count, clone, pushed: docs.length };
}
```

- [ ] **Step 6: The roster and the full read**

Create `worker/src/alts.ts`:

```ts
/**
 * Alts: characters on the owner's other accounts, read by the cloud and never logged in to the app.
 *
 * An alt's login is kept under the main's ledger (keys: purpose `alt:<id>`), and everything read for it is filed
 * under its own character ID, in the same kinds and documents as a ledger, so the main's ledger never holds a row of
 * an alt's. The `alts` table (migration 0016) is the roster. Alts are found through it, never by matching a purpose.
 */
import type { CloneState } from '../../src/lib/roster';
import { archive, noteJob, type ArchiveResult } from './archive';
import { altReader, stillKept, type Reader } from './eve';
import { readSheet } from './sheet';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string; APP_URL: string };

export type AltRow = { charId: number; name: string | null; addedAt: number };

/** A ledger's alts, in the order they were added. Removed ones aren't on it. */
export async function rosterOf(db: D1Database, ledger: number): Promise<AltRow[]> {
  return (await db.prepare('SELECT char_id AS charId, name, added_at AS addedAt FROM alts WHERE ledger = ?1 AND removed_at IS NULL ORDER BY added_at, char_id')
    .bind(ledger).all<AltRow>()).results;
}

export async function onRoster(db: D1Database, ledger: number, altId: number): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 AS y FROM alts WHERE char_id = ?1 AND ledger = ?2 AND removed_at IS NULL').bind(altId, ledger).first());
}

/** Whether a character is anyone's alt, removed or not: such a character is never a ledger of its own. */
export async function isAlt(db: D1Database, charId: number): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 AS y FROM alts WHERE char_id = ?1').bind(charId).first());
}

/** Every alt there is a login for, as a reader. They are read whether or not their main's own login is kept. */
export async function altReaders(db: D1Database): Promise<Reader[]> {
  const rows = (await db.prepare(`SELECT a.ledger AS ledger, a.char_id AS char FROM alts a
      JOIN keys k ON k.char_id = a.ledger AND k.purpose = 'alt:' || a.char_id
      WHERE a.removed_at IS NULL ORDER BY a.added_at, a.char_id`).all<{ ledger: number; char: number }>()).results;
  return rows.map((r) => altReader(r.ledger, r.char));
}

/** Notes an alt's job, unless the alt was removed meanwhile: a row left behind would greet a re-add with an old streak. */
async function note(db: D1Database, who: Reader, job: string, outcome: { ok: true; detail: unknown } | { ok: false; error: string }) {
  if (await stillKept(db, who)) await noteJob(db, who.char, job, outcome);
}
const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * An alt's full read: the copy a ledger gets hourly (archive.ts), then its sheet (sheet.ts), each noted as a job
 * under the alt. Throws what failed, after noting it.
 */
export async function readAlt(env: Env, who: Reader, prices?: Record<number, number>): Promise<ArchiveResult & { clone: CloneState | null }> {
  let copied: ArchiveResult;
  try {
    copied = await archive(env, who, { prices });
    await note(env.DB, who, 'archive', { ok: true, detail: copied });
  } catch (e) {
    await note(env.DB, who, 'archive', { ok: false, error: said(e) });
    throw e;
  }
  try {
    const sheet = await readSheet(env, who, { wallet: copied.wallet ?? null, lp: copied.lp ?? null });
    await note(env.DB, who, 'sheet', { ok: true, detail: sheet });
    return { ...copied, clone: sheet.clone };
  } catch (e) {
    await note(env.DB, who, 'sheet', { ok: false, error: said(e) });
    throw e;
  }
}
```

- [ ] **Step 7: Run the tests and the build**

Run: `npm run check && npm run build`

Expected: both `all passed`; the build clean. If `tsc -p worker` reports `useLogin` unused in `archive.ts`, it is still used by `refreshOrders`; if it reports another unused import, remove that import.

If the "removed mid-read" test shows a `safety_seen` or `jobs` row, the guard in Step 3 for `registerSafety` or `note` in Step 6 is missing.

- [ ] **Step 8: Commit**

```bash
git add worker/src/archive.ts worker/src/sheet.ts worker/src/alts.ts worker/src/index.ts scripts/check-worker.mjs
git commit -F - <<'EOF'
Cloud: an alt's full read, filed under the alt

archive takes a Reader now. Almost every use of its character ID already meant "whose data"; the two that didn't
were the login lookup and mailSafety, which uses its argument as the mail's recipient, the owner of the alert
settings and the owner of the sender. An alt's first read finds every wrap it has as new, so passed the ledger it
would have mailed the main about all of them, and passed the alt it would have stayed silent only because an alt
has no sender. It is skipped for an alt outright, with the orders job row, which nothing refreshes or judges for
an alt. CCP's rough prices were fetched twice inside one read; they're fetched once, or handed in.

sheet.ts is what the browser's sync reads for the main, done by the cloud for a character that never logs in:
skills, queue, attributes, and clone state from cloneState, written as the alt's skills and meta docs with the
main's field names. "Since" is set only for a change the cloud saw; the first read can't say when the state
began. A read that changes nothing but the wallet's timestamp pushes nothing.

alts.ts holds the roster (from the alts table, never by matching a purpose) and readAlt, the two in order, each
noted as a job under the alt unless it was removed meanwhile.

Tested against the real SQL: an alt's read leaves the main's rows untouched and asks ESI only about the alt, with
a sender kept and alert mail on it sends no mail, a second identical read leaves the revision where it was, an
Alpha becoming Omega is dated, and an alt removed mid-read gets nothing back.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 5: Handing an alt over, the alt routes, and removal

**Files:**
- Modify: `worker/src/eve.ts` (`keepLogin` becomes `keepHandedOver`; `dropLogin`'s revoke becomes `revoke`), `worker/src/alts.ts` (`altsStatus`, `altTicks`, `removeAlt`), `worker/src/index.ts` (`background`, the caller check, `/v1/keys`, the `/v1/alts` routes)
- Test: `scripts/check-worker.mjs`

**Interfaces:**
- Consumes: `sortLogin`, `Asked` (Task 2); `altPurpose`, `altReader`, `Reader` (Task 3); `rosterOf`, `onRoster`, `isAlt`, `readAlt` (Task 4).
- Produces (`worker/src/eve.ts`): `keepHandedOver(env, ledger: number, asked: Asked, refreshToken: string): Promise<{ as: Asked; login: Login }>`; `revoke(env, refreshToken: string): Promise<void>`.
- Produces (`worker/src/alts.ts`): `altsStatus(db, ledger)`, `altTicks(db, ledger, days, now?)`, `removeAlt(env, ledger, altId, data: 'keep' | 'delete')`.
- Produces (routes): `GET /v1/alts`, `GET /v1/alts/mining/ticks?days=`, `GET /v1/alts/<id>/pull?since=&after=`, `POST /v1/alts/<id>/read`, `DELETE /v1/alts/<id>?data=keep|delete`; `POST /v1/keys` accepting `purpose: 'alt'` and answering `{ kept: { purpose, as, charId, name, scopes } }`.

- [ ] **Step 1: Write the failing tests**

In `scripts/check-worker.mjs`, above the final `console.log(failed ? …)` line, add:

```js
console.log('\n--- handing a login over, and the alt routes ---');
{
  const worker = (await import('../worker/src/index.ts')).default;
  const { useLogin } = await import('../worker/src/eve.ts');
  /** A request as the main, the way a local test stands a character in for the login (DEV_AUTH_CHAR). */
  const ask = async (env, method, path, body) => {
    const res = await worker.fetch(new Request(`http://localhost${path}`, {
      method, headers: { Authorization: 'Bearer dev-token', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    }), env);
    return { status: res.status, body: await res.json() };
  };
  /** EVE's login answering a refresh with a token for `char`; and its revoke. */
  const eve = (char, name) => [
    [/^POST \/v2\/oauth\/token$/, { access_token: fakeToken(char, name, SCOPES), refresh_token: `rotated-${char}` }],
    [/^POST \/v2\/oauth\/revoke$/, {}],
  ];
  const fresh = async () => {
    const db = d1();
    await keepKey(db, MAIN, 'main', MAIN, 'Main', SCOPES);
    await keepKey(db, MAIN, 'mailer', SENDER, 'Postmaster', ['esi-mail.send_mail.v1', 'esi-mail.organize_mail.v1']);
    return { db, env: testEnv(db, { DEV_AUTH_CHAR: String(MAIN) }) };
  };
  const keysOf = (db) => db.rows('SELECT purpose, token_char_id AS c FROM keys WHERE char_id = ? ORDER BY purpose', MAIN).map((k) => `${k.purpose}=${k.c}`);

  // Adding an alt: the three characters EVE's page might hand back.
  {
    const { db, env } = await fresh();
    let f = stubFetch(eve(ALT, 'Miner Two'));
    let r = await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x' });
    f.restore();
    eq('  an alt came back: kept as an alt', [r.status, r.body.kept.as, r.body.kept.charId, r.body.kept.name], [200, 'alt', ALT, 'Miner Two']);
    eq('    its login sits under the main\'s ledger, beside the two that were there', keysOf(db), [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`]);
    eq('    and it is on the roster', db.rows('SELECT char_id AS c, ledger AS l, name, removed_at AS gone FROM alts'), [{ c: ALT, l: MAIN, name: 'Miner Two', gone: null }]);

    f = stubFetch(eve(MAIN, 'Main'));
    r = await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x' });
    f.restore();
    eq('  the main came back: kept as the main\'s login, nothing added', [r.body.kept.as, keysOf(db).length, db.rows('SELECT COUNT(*) AS n FROM alts')[0].n], ['main', 3, 1]);

    f = stubFetch(eve(SENDER, 'Postmaster'));
    r = await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x' });
    f.restore();
    eq('  the mail sender came back: kept as the sender\'s login, nothing added', [r.body.kept.as, keysOf(db), db.rows('SELECT COUNT(*) AS n FROM alts')[0].n], ['mailer', [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`], 1]);
    eq('    with the permissions it came back with, so mail carries on', db.rows(`SELECT scopes FROM keys WHERE purpose = 'mailer'`)[0].scopes.includes('esi-mail.send_mail.v1'), true);
  }

  // The reverse slip: a sender login that turns out to be an alt.
  {
    const { db, env } = await fresh();
    let f = stubFetch(eve(ALT, 'Miner Two'));
    await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x' });
    const r = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'y' });
    f.restore();
    eq('  a sender login that is an alt is refused, saying what happened', [r.status, /one of your characters, not your mail sender/.test(r.body.error), /Hand Miner Two over again/.test(r.body.error)], [400, true, true]);
    eq('    the real sender is left alone', keysOf(db).includes(`mailer=${SENDER}`), true);
    eq('    the alt\'s login is marked refused at once', db.rows('SELECT refused_at IS NOT NULL AS r FROM keys WHERE purpose = ?', `alt:${ALT}`)[0].r, 1);
    eq('    and the login that can\'t be kept is revoked at EVE', f.calls.some((c) => c.path === '/v2/oauth/revoke'), true);

    // Once removed from the roster, the same character may be the sender.
    f = stubFetch(eve(ALT, 'Miner Two'));
    await ask(env, 'DELETE', `/v1/alts/${ALT}?data=keep`);
    const r2 = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'y' });
    f.restore();
    eq('  a character removed from the roster can be the sender', [r2.status, r2.body.kept.as, keysOf(db)], [200, 'mailer', [`mailer=${ALT}`, `main=${MAIN}`]]);
  }

  // The main's and the sender's own hand-overs, as before.
  {
    const { db, env } = await fresh();
    let f = stubFetch(eve(ALT, 'Miner Two'));
    const r = await ask(env, 'POST', '/v1/keys', { purpose: 'main', refreshToken: 'x' });
    f.restore();
    eq('  a main login that isn\'t the main is refused, as before', [r.status, /not the character whose ledger this is/.test(r.body.error)], [400, true]);
    f = stubFetch(eve(MAIN, 'Main'));
    const r2 = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'x' });
    f.restore();
    eq('  the main can\'t be its own sender, as before', [r2.status, /the sender has to be your other character/.test(r2.body.error)], [400, true]);
    eq('    and nothing changed', keysOf(db), [`mailer=${SENDER}`, `main=${MAIN}`]);
    eq('  an unknown purpose is refused', (await ask(env, 'POST', '/v1/keys', { purpose: 'owner', refreshToken: 'x' })).status, 400);
  }

  // What an app version behind sees, and what the alt routes give.
  {
    const { db, env } = await ledgerWithAlt();
    env.DEV_AUTH_CHAR = String(MAIN);
    const { push } = await import('../worker/src/sync.ts');
    await push(db, ALT, { records: [{ k: 'txs', i: 'alt-trade', d: { typeId: VELDSPAR } }], docs: [{ key: 'meta', d: { walletBalance: 5000 } }] });
    await push(db, MAIN, { records: [{ k: 'txs', i: 'main-trade', d: { typeId: SCORDITE } }], docs: [] });
    db.run('INSERT INTO mining_state (char_id, at, data, ship_type_id) VALUES (?, ?, ?, ?)', ALT, T0, '{}', VENTURE);
    db.run('INSERT INTO mining_ticks (char_id, at, system_id, type_id, qty, ship_type_id) VALUES (?, ?, ?, ?, ?, ?)', ALT, Date.now() - MIN, SYSTEM, VELDSPAR, 400, VENTURE);
    db.run('INSERT INTO mining_ticks (char_id, at, system_id, type_id, qty, ship_type_id) VALUES (?, ?, ?, ?, ?, ?)', MAIN, Date.now() - MIN, SYSTEM, VELDSPAR, 999, VENTURE);
    db.run('INSERT INTO jobs (char_id, job, last_run, last_ok) VALUES (?, ?, ?, ?)', ALT, 'mining', T0, T0);

    const status = await ask(env, 'GET', '/v1/status');
    eq('  /v1/status lists only the main\'s and the sender\'s logins', status.body.background.keys.map((k) => k.purpose), ['main']);
    const list = (await ask(env, 'GET', '/v1/alts')).body;
    eq('  /v1/alts: the roster', list.map((a) => [a.charId, a.name, a.rev, a.ship, a.shipAt, a.refusedAt]), [[ALT, 'Miner Two', 1, VENTURE, T0, null]]);
    eq('    with its permissions and its jobs', [list[0].scopes.length, list[0].jobs.map((j) => j.job)], [SCOPES.length, ['mining']]);
    const pulled = (await ask(env, 'GET', `/v1/alts/${ALT}/pull?since=0`)).body;
    eq('  an alt\'s pull is the alt\'s ledger', [pulled.records.map((x) => x.i), pulled.docs.map((x) => x.key), pulled.rev], [['alt-trade'], ['meta'], 1]);
    eq('  the main\'s pull is the main\'s', (await ask(env, 'GET', '/v1/pull?since=0')).body.records.map((x) => x.i), ['main-trade']);
    const ticks = (await ask(env, 'GET', '/v1/alts/mining/ticks?days=30')).body;
    eq('  the alts\' ticks carry their character, and leave the main\'s out', ticks.map((t) => [t.charId, t.qty]), [[ALT, 400]]);

    eq('  a character not on the roster: not found', [(await ask(env, 'GET', '/v1/alts/12345/pull?since=0')).status, (await ask(env, 'GET', `/v1/alts/${MAIN}/pull?since=0`)).status], [404, 404]);
    eq('  an ID that isn\'t a number: not found', [(await ask(env, 'GET', '/v1/alts/abc/pull')).status, (await ask(env, 'GET', '/v1/alts/1;DROP/pull')).status], [404, 404]);
    eq('  a caller that is an alt is refused everything', (await ask({ ...env, DEV_AUTH_CHAR: String(ALT) }, 'GET', '/v1/status')).status, 403);
  }

  // Removing: what is kept and what goes.
  {
    const make = async () => {
      const x = await ledgerWithAlt();
      x.env.DEV_AUTH_CHAR = String(MAIN);
      const { push } = await import('../worker/src/sync.ts');
      await push(x.db, ALT, { records: [{ k: 'txs', i: 't', d: {} }], docs: [{ key: 'meta', d: {} }] });
      x.db.run('INSERT INTO mining_state (char_id, at, data) VALUES (?, ?, ?)', ALT, T0, '{}');
      x.db.run('INSERT INTO mining_ticks (char_id, at, system_id, type_id, qty) VALUES (?, ?, ?, ?, ?)', ALT, T0, SYSTEM, VELDSPAR, 1);
      x.db.run('INSERT INTO jobs (char_id, job, last_run, fails) VALUES (?, ?, ?, ?)', ALT, 'mining', T0, 5);
      x.db.run('INSERT INTO safety_seen (char_id, wrap_id, first_seen, start_known) VALUES (?, ?, ?, ?)', ALT, 0, T0, 1);
      return x;
    };
    let { db, env } = await make();
    let f = stubFetch(eve(ALT, 'Miner Two'));
    eq('  removing an alt', (await ask(env, 'DELETE', `/v1/alts/${ALT}?data=keep`)).body, { removed: ALT, data: 'keep' });
    f.restore();
    eq('    its login is revoked and dropped', [f.calls.some((c) => c.path === '/v2/oauth/revoke'), db.rows('SELECT COUNT(*) AS n FROM keys WHERE purpose LIKE ?', 'alt:%')[0].n], [true, 0]);
    eq('    keeping its data: records stay, the mining baseline and old job streaks go', under(db, ALT), { [`records:${ALT}`]: 1, [`docs:${ALT}`]: 1, [`revs:${ALT}`]: 1, [`mining_ticks:${ALT}`]: 1, [`safety_seen:${ALT}`]: 1 });
    eq('    it is off the roster but still known as an alt', [(await ask(env, 'GET', '/v1/alts')).body, db.rows('SELECT removed_at IS NOT NULL AS gone FROM alts')[0].gone], [[], 1]);
    eq('    and its data can\'t be reached', (await ask(env, 'GET', `/v1/alts/${ALT}/pull?since=0`)).status, 404);

    ({ db, env } = await make());
    f = stubFetch(eve(ALT, 'Miner Two'));
    await ask(env, 'DELETE', `/v1/alts/${ALT}?data=delete`);
    f.restore();
    eq('  deleting its data: only its revision is left, so it never restarts', [under(db, ALT), db.rows('SELECT COUNT(*) AS n FROM alts')[0].n], [{ [`revs:${ALT}`]: 1 }, 0]);
    eq('    and the main is untouched', db.rows('SELECT COUNT(*) AS n FROM keys WHERE purpose = ?', 'main')[0].n, 1);
  }

  // A refusal that a later refresh clears: what two jobs refreshing one login at once would leave behind.
  {
    const db = d1();
    const env = testEnv(db);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', SCOPES, { expired: true, refusedAt: T0, refused: 'invalid_grant' });
    const f = stubFetch(eve(ALT, 'Miner Two'));
    const login = await useLogin(env, MAIN, `alt:${ALT}`);
    f.restore();
    eq('  a refused login that then refreshes is no longer refused', [login.charId, db.rows('SELECT refused_at AS r, refused FROM keys')[0]], [ALT, { r: null, refused: null }]);
  }
}
```

- [ ] **Step 2: Run and see them fail**

Run: `npm run check`

Expected: failures starting at `an alt came back: kept as an alt` (the Worker answers 400, "Say which login this is").

- [ ] **Step 3: `keepHandedOver` and `revoke`**

In `worker/src/eve.ts`, add to the imports:

```ts
import { sortLogin, type Asked } from '../../src/lib/roster';
```

Replace `keepLogin` and `dropLogin` (from `/** Keep a login for a ledger` to the end of `dropLogin`) with:

```ts
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
  await db.prepare(`
    INSERT INTO keys (char_id, purpose, token_char_id, token_char_name, scopes, refresh_enc, updated_at, access_enc, access_exp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(char_id, purpose) DO UPDATE SET token_char_id = excluded.token_char_id, token_char_name = excluded.token_char_name,
      scopes = excluded.scopes, refresh_enc = excluded.refresh_enc, updated_at = excluded.updated_at,
      access_enc = excluded.access_enc, access_exp = excluded.access_exp, refused_at = NULL, refused = NULL, refused_warned = NULL`)
    .bind(ledger, purpose, who.charId, who.name, who.scopes.join(' '), await seal(env.TOKEN_KEY, t.refresh), Date.now(), await seal(env.TOKEN_KEY, t.access), who.exp).run();
  if (sorted.as === 'alt') {
    await db.prepare(`INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(char_id) DO UPDATE SET ledger = excluded.ledger, name = excluded.name, removed_at = NULL`)
      .bind(who.charId, ledger, who.name, Date.now()).run();
  }
  return { as: sorted.as, login: asLogin(t.access) };
}

export async function dropLogin(env: Env, ledgerChar: number, purpose: Purpose): Promise<void> {
  const row = await env.DB.prepare('SELECT refresh_enc FROM keys WHERE char_id = ?1 AND purpose = ?2').bind(ledgerChar, purpose).first<{ refresh_enc: string }>();
  await env.DB.prepare('DELETE FROM keys WHERE char_id = ?1 AND purpose = ?2').bind(ledgerChar, purpose).run();
  if (!row) return;
  // Revoke it at EVE too, best effort: the Worker no longer has it either way.
  try { await revoke(env, await open(env.TOKEN_KEY, row.refresh_enc)); } catch { /* a token that won't open is gone already */ }
}
```

- [ ] **Step 4: What the routes return, and removal**

In `worker/src/alts.ts`, change the `eve` import to:

```ts
import { altPurpose, altReader, dropLogin, stillKept, type Reader } from './eve';
```

and add at the end of the file:

```ts
/** The roster as the app shows it: each alt's login (never the token), its jobs, its revision, and its ship when last read. */
export async function altsStatus(db: D1Database, ledger: number) {
  const rows = (await db.prepare(`SELECT a.char_id AS charId, a.name AS name, a.added_at AS addedAt, k.scopes AS scopes, k.updated_at AS at,
        k.refused_at AS refusedAt, k.refused AS refused, (SELECT rev FROM revs WHERE char_id = a.char_id) AS rev, m.ship_type_id AS ship, m.at AS shipAt
      FROM alts a
      LEFT JOIN keys k ON k.char_id = a.ledger AND k.purpose = 'alt:' || a.char_id
      LEFT JOIN mining_state m ON m.char_id = a.char_id
      WHERE a.ledger = ?1 AND a.removed_at IS NULL ORDER BY a.added_at, a.char_id`).bind(ledger)
    .all<{ charId: number; name: string | null; addedAt: number; scopes: string | null; at: number | null; refusedAt: number | null; refused: string | null; rev: number | null; ship: number | null; shipAt: number | null }>()).results;
  const out = [];
  for (const r of rows) {
    const jobs = (await db.prepare('SELECT job, last_run AS lastRun, last_ok AS lastOk, last_error AS lastError FROM jobs WHERE char_id = ?1 ORDER BY job').bind(r.charId)
      .all<{ job: string; lastRun: number; lastOk: number | null; lastError: string | null }>()).results;
    out.push({ ...r, scopes: (r.scopes ?? '').split(' ').filter(Boolean), rev: r.rev ?? 0, jobs });
  }
  return out;
}

/** Every alt's ticks of the last `days`, each with its character: sessions are built one character at a time. */
export async function altTicks(db: D1Database, ledger: number, days: number, now = Date.now()) {
  return (await db.prepare(`SELECT t.char_id AS charId, t.at AS at, t.system_id AS systemId, t.type_id AS typeId, t.qty AS qty, t.ship_type_id AS shipTypeId
      FROM mining_ticks t JOIN alts a ON a.char_id = t.char_id
      WHERE a.ledger = ?1 AND a.removed_at IS NULL AND t.at > ?2 ORDER BY t.at`)
    .bind(ledger, now - Math.min(90, Math.max(1, days)) * 86400_000)
    .all<{ charId: number; at: number; systemId: number; typeId: number; qty: number; shipTypeId: number | null }>()).results;
}

/**
 * Take an alt off the roster: its login is revoked at EVE and dropped. Either way its mining snapshot and its job
 * rows go, so a later re-add starts from a fresh baseline and no old failing streak. `keep` leaves what was read,
 * unreachable until the character is added again, and the alt stays known as one (it is never a ledger of its own).
 * `delete` removes it all. Its revision row stays in both: a revision that restarted would let a device holding the
 * old one miss everything after a re-add.
 */
export async function removeAlt(env: Env, ledger: number, altId: number, data: 'keep' | 'delete'): Promise<void> {
  await dropLogin(env, ledger, altPurpose(altId));
  const db = env.DB;
  const gone = (table: string) => db.prepare(`DELETE FROM ${table} WHERE char_id = ?1`).bind(altId);
  const stmts = [gone('mining_state'), gone('jobs')];
  if (data === 'delete') stmts.push(gone('records'), gone('docs'), gone('mining_ticks'), gone('safety_seen'), db.prepare('DELETE FROM alts WHERE char_id = ?1 AND ledger = ?2').bind(altId, ledger));
  else stmts.push(db.prepare('UPDATE alts SET removed_at = ?3 WHERE char_id = ?1 AND ledger = ?2').bind(altId, ledger, Date.now()));
  await db.batch(stmts);
}
```

- [ ] **Step 5: The routes**

In `worker/src/index.ts`:

Replace the `eve` import with, and add the two below it:

```ts
import { altReader, dropLogin, EveError, keepHandedOver, ledgerReader } from './eve';
import { altsStatus, altTicks, isAlt, onRoster, readAlt, removeAlt } from './alts';
```

In `background`, replace the `keys` query's SQL:

```ts
  const keys = (await env.DB.prepare('SELECT purpose, token_char_id AS charId, token_char_name AS name, scopes, updated_at AS at, refused_at AS refusedAt, refused FROM keys WHERE char_id = ?1')
```

with:

```ts
  // The main's and the sender's only. An alt's login is on /v1/alts: an app version behind turns every refused login
  // listed here, other than the main's, into "log in a sender", which for an alt is the login that stops its own.
  const keys = (await env.DB.prepare(`SELECT purpose, token_char_id AS charId, token_char_name AS name, scopes, updated_at AS at, refused_at AS refusedAt, refused FROM keys WHERE char_id = ?1 AND purpose IN ('main', 'mailer')`)
```

In `fetch`, after the owner check line (`if (!dev && !isOwner(who.charId)) return json(…403…)`), add:

```ts
      // An alt is read by the cloud and never logs in: as a caller it could push a ledger over its own cloud copy.
      if (await isAlt(env.DB, who.charId)) return json({ error: 'This character is read by the cloud as one of its owner’s characters; it doesn’t log in to Jita Ledger.' }, 403, c);
```

Replace the `POST /v1/keys` block:

```ts
      if (url.pathname === '/v1/keys' && request.method === 'POST') {
        const body = (await request.json()) as { purpose?: string; refreshToken?: string };
        const purpose = body.purpose === 'mailer' ? 'mailer' : body.purpose === 'main' ? 'main' : null;
        if (!purpose || !body.refreshToken) throw new BadRequest('Say which login this is and send its refresh token');
        const kept = await keepLogin(env, who.charId, purpose as Purpose, body.refreshToken);
        return json({ kept: { purpose, charId: kept.charId, name: kept.name, scopes: kept.scopes.length } }, 200, c);
      }
```

with:

```ts
      if (url.pathname === '/v1/keys' && request.method === 'POST') {
        const body = (await request.json()) as { purpose?: string; refreshToken?: string };
        const asked = body.purpose === 'mailer' || body.purpose === 'main' || body.purpose === 'alt' ? body.purpose : null;
        if (!asked || !body.refreshToken) throw new BadRequest('Say which login this is and send its refresh token');
        // `as` is what it was kept as: EVE's page picks the character, so an alt hand-over can come back as the
        // main or the sender (eve.ts, keepHandedOver). `purpose` repeats it for an app version behind.
        const kept = await keepHandedOver(env, who.charId, asked, body.refreshToken);
        return json({ kept: { purpose: kept.as, as: kept.as, charId: kept.login.charId, name: kept.login.name, scopes: kept.login.scopes.length } }, 200, c);
      }
```

After the `DELETE /v1/keys` block, add:

```ts
      // Alts (alts.ts): the owner's other characters, read by the cloud. New paths, so a Worker a version behind
      // answers 404 and can never hand the main's ledger back as an alt's; each checks the alt is on the caller's roster.
      if (url.pathname === '/v1/alts' && request.method === 'GET') return json(await altsStatus(env.DB, who.charId), 200, c);
      if (url.pathname === '/v1/alts/mining/ticks' && request.method === 'GET') {
        return json(await altTicks(env.DB, who.charId, Number(url.searchParams.get('days') ?? 30) || 30), 200, c);
      }
      const alt = /^\/v1\/alts\/(\d{1,15})(?:\/(pull|read))?$/.exec(url.pathname);
      if (alt) {
        const altId = Number(alt[1]);
        if (!(await onRoster(env.DB, who.charId, altId))) return json({ error: 'That character isn’t one of yours.' }, 404, c);
        if (alt[2] === 'pull' && request.method === 'GET') {
          const since = Number(url.searchParams.get('since') ?? 0) || 0;
          return json(await pull(env.DB, altId, since, url.searchParams.get('after')), 200, c);
        }
        if (alt[2] === 'read' && request.method === 'POST') return json(await readAlt(env, altReader(who.charId, altId)), 200, c);
        if (!alt[2] && request.method === 'DELETE') {
          const data = url.searchParams.get('data') === 'delete' ? 'delete' : 'keep';
          await removeAlt(env, who.charId, altId, data);
          return json({ removed: altId, data }, 200, c);
        }
      }
```

In the `DELETE /v1/keys` block, the `purpose` constant is `'mailer' | 'main'` by inference and needs no type import; leave it.

- [ ] **Step 6: Run the tests and the build**

Run: `npm run check && npm run build`

Expected: both `all passed`; the build clean. If `tsc -p worker` reports `Purpose` or `keepLogin` as an unknown or unused import in `index.ts`, the import line from Step 5 wasn't applied whole.

- [ ] **Step 7: Commit**

```bash
git add worker/src/eve.ts worker/src/alts.ts worker/src/index.ts scripts/check-worker.mjs
git commit -F - <<'EOF'
Cloud: handing an alt over, the alt routes, and removal

The main's and the mail sender's hand-overs behave as before. The new one, purpose 'alt', is sorted by who came
back: EVE's page picks the character, and it has already stopped that character's earlier logins with a different
set of permissions by the time the Worker is asked. Adding an alt while still signed in to the main account at EVE
offers the main and the mail character, so either picked by mistake is kept as its own login (the main's, the
sender's) and nothing is added. The reverse, a sender login that turns out to be an alt, can't read for it: it is
refused, the alt's login is marked refused at once, the login is revoked, the real sender is left alone, and the
message says what happened and what to do.

/v1/status no longer lists every login of the ledger, only the main's and the sender's: an app version behind
turns any refused login it is shown, other than the main's, into "log in a sender", which for an alt is that same
slip. Alts are on new paths (/v1/alts, its pull, ticks, read and delete), each checking the roster, so a Worker a
version behind answers 404 and can't return the main's ledger as an alt's. A caller that is an alt is refused.

Removing drops the mining snapshot and the job rows either way, so a re-add starts from a fresh baseline with no
old failing streak; keeping the data leaves the alt known as one, so its open orders never enter the market watch
as a ledger's; deleting leaves only its revision, which must never restart.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 6: When alts are read: a cron of their own, and mining in the five-minute round

**Files:**
- Modify: `worker/src/alts.ts` (`altsHourly`, `altsMining`), `worker/src/index.ts` (`fiveMinutes`, `scheduled`), `worker/wrangler.toml` (`[triggers]`)
- Test: `scripts/check-worker.mjs`

**Interfaces:**
- Consumes: `altReaders`, `readAlt` (Task 4); `readMiningRound` (Task 3); `roughPrices` (Task 4).
- Produces (`worker/src/alts.ts`): `altsHourly(env): Promise<{ alts: number; read: number; failed: number }>`; `altsMining(env, now?): Promise<{ alts: number; read: number; failed: number }>`.
- Produces: cron `37 * * * *`.

- [ ] **Step 1: Write the failing tests**

In `scripts/check-worker.mjs`, above the final `console.log(failed ? …)` line, add:

```js
console.log('\n--- when alts are read ---');
{
  const worker = (await import('../worker/src/index.ts')).default;
  const { altsMining } = await import('../worker/src/alts.ts');
  const run = async (env, cron) => { const waits = []; await worker.scheduled({ cron }, env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };

  {
    const { db, env } = await ledgerWithAlt();
    const f = stubFetch([[`/characters/${ALT}/mining/`, mined(300)], [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }]]);
    const r = await altsMining(env, T0);
    f.restore();
    eq('  the alts\' mining round reads each alt with a login', [r, under(db, ALT)], [{ alts: 1, read: 1, failed: 0 }, { [`records:${ALT}`]: 1, [`revs:${ALT}`]: 1, [`jobs:${ALT}`]: 1, [`mining_state:${ALT}`]: 1 }]);
  }

  // A failing alt is noted under the alt and doesn't stop the next.
  {
    const { db, env } = await ledgerWithAlt();
    await keepKey(db, MAIN, 'alt:900002', 900002, 'Miner Three', SCOPES);
    db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', 900002, MAIN, 'Miner Three', Date.now() + 1);
    const f = stubFetch([
      [`/characters/${ALT}/mining/`, new Response(JSON.stringify({ error: 'boom' }), { status: 500 })],
      ['/characters/900002/mining/', mined(50)], ['/characters/900002/ship/', { ship_type_id: VENTURE }],
    ]);
    const r = await altsMining(env, T0);
    f.restore();
    eq('  one alt failing doesn\'t stop the next', r, { alts: 2, read: 1, failed: 1 });
    eq('    and the failure is noted under that alt', db.rows('SELECT char_id AS c, last_error IS NOT NULL AS bad FROM jobs ORDER BY char_id'), [{ c: ALT, bad: 1 }, { c: 900002, bad: 0 }]);
  }
  // The cron, last: before it is matched by name it falls through to the hourly archive and the full-market scan.
  {
    const { db, env } = await ledgerWithAlt();
    // A second alt whose login is gone: on the roster, nothing to read it with.
    db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', 900002, MAIN, 'No Login', Date.now());
    const f = stubFetch([...esiFor(ALT), ...esiFor(MAIN)]);
    await run(env, '37 * * * *');
    f.restore();
    const asked = (char) => f.calls.filter((c) => c.path.startsWith(`/characters/${char}/`)).length;
    eq('  the :37 cron reads the alts, and not the main', [asked(ALT) > 0, asked(MAIN), asked(900002)], [true, 0, 0]);
    eq('    each alt\'s copy and sheet are noted', db.rows('SELECT job FROM jobs WHERE char_id = ? ORDER BY job', ALT).map((x) => x.job), ['archive', 'sheet']);
    eq('    CCP\'s prices are fetched once for the round', f.calls.filter((c) => c.path === '/markets/prices/').length, 1);
    eq('    nothing is noted for the main', db.rows('SELECT COUNT(*) AS n FROM jobs WHERE char_id = ?', MAIN)[0].n, 0);
  }
}
```

- [ ] **Step 2: Run and see them fail**

Run: `npm run check`

Expected: the run stops with `altsMining is not a function`. (The cron's test is last on purpose: until the cron is matched by name it falls through to the hourly archive and the full-market scan, which is slow against a stub.)

- [ ] **Step 3: The two rounds**

In `worker/src/alts.ts`, change the imports to:

```ts
import type { CloneState } from '../../src/lib/roster';
import { archive, noteJob, roughPrices, type ArchiveResult } from './archive';
import { altPurpose, altReader, dropLogin, stillKept, type Reader } from './eve';
import { readMiningRound } from './mining';
import { readSheet } from './sheet';
```

and add after `readAlt`:

```ts
/**
 * Every alt's full read, one after another: the `37 * * * *` cron. A cron of its own because the hourly one carries
 * the full-market scan, whose 11-minute budget inside the 15-minute limit doesn't know alt reads ran ahead of it, and
 * the five-minute round has 30 s of CPU and the main's alerts to get through. One alt failing doesn't stop the next;
 * its failure is its own job row, which the watchdog mails by character.
 */
export async function altsHourly(env: Env): Promise<{ alts: number; read: number; failed: number }> {
  const readers = await altReaders(env.DB);
  if (!readers.length) return { alts: 0, read: 0, failed: 0 };
  // CCP's rough prices, once for the round. Without them each read fetches its own.
  const prices = await roughPrices().catch(() => undefined);
  let read = 0, failed = 0;
  for (const who of readers) {
    try { await readAlt(env, who, prices); read++; } catch (e) { failed++; console.error('alt read failed', who.char, e); }
  }
  return { alts: readers.length, read, failed };
}

/** Every alt's mining ledger, when its ten minutes are up: run at the end of the five-minute round. */
export async function altsMining(env: Env, now = Date.now()): Promise<{ alts: number; read: number; failed: number }> {
  const readers = await altReaders(env.DB);
  let read = 0, failed = 0;
  for (const who of readers) {
    try { if ((await readMiningRound(env, who, now)) != null) read++; } catch (e) { failed++; await note(env.DB, who, 'mining', { ok: false, error: said(e) }); }
  }
  return { alts: readers.length, read, failed };
}
```

(`note` and `said` are already in the file from Task 4; `noteJob` stays imported for `note`.)

- [ ] **Step 4: The cron and the round**

In `worker/src/index.ts`, change the `alts` import to:

```ts
import { altsHourly, altsMining, altsStatus, altTicks, isAlt, onRoster, readAlt, removeAlt } from './alts';
```

Below the `SNIPER_CRON` constant add:

```ts
/** The alts' hourly read, on a cron of its own (alts.ts, altsHourly). Also in wrangler.toml. */
const ALTS_CRON = '37 * * * *';
```

At the end of `fiveMinutes`, after the closing brace of the second `for (const id of ledgers)` loop, add:

```ts
  // Last, so nothing of a ledger's waits on an alt: each alt's mining, when its ten minutes are up.
  try { const r = await altsMining(env); if (r.read || r.failed) console.log('alts mining', JSON.stringify(r)); } catch (e) { console.error('alts mining failed', e); }
```

In `scheduled`, after the sniper's `if (event.cron === SNIPER_CRON) { … return; }` block, add:

```ts
    // The alts' full reads. Matched by name: anything unmatched below is taken for the hourly archive.
    if (event.cron === ALTS_CRON) {
      ctx.waitUntil(altsHourly(env).then((r) => console.log('alts hourly', JSON.stringify(r))).catch((e) => console.error('alts hourly failed', e)));
      return;
    }
```

In `worker/wrangler.toml`, replace the `[triggers]` comment and line:

```toml
# Background jobs: the market watch every five minutes, the sniper a minute after each (ESI refreshes The Forge's
# book at about :x0:30 and :x5:30), the archive hourly at seven past, and the full-market scan daily at 11:25 EVE,
# after ESI publishes the day's history (the hourly run catches up a missed one).
[triggers]
crons = ["*/5 * * * *", "1-59/5 * * * *", "7 * * * *", "25 11 * * *"]
```

with:

```toml
# Background jobs: the market watch every five minutes, the sniper a minute after each (ESI refreshes The Forge's
# book at about :x0:30 and :x5:30), the archive hourly at seven past, the alts' full reads hourly at 37 past (a cron
# of their own: on the :07 one they would run ahead of a scan whose time budget doesn't know about them), and the
# full-market scan daily at 11:25 EVE, after ESI publishes the day's history (the hourly run catches up a missed one).
[triggers]
crons = ["*/5 * * * *", "1-59/5 * * * *", "7 * * * *", "37 * * * *", "25 11 * * *"]
```

- [ ] **Step 5: Run the tests and the build**

Run: `npm run check && npm run build`

Expected: both `all passed`; the build clean.

- [ ] **Step 6: Commit**

```bash
git add worker/src/alts.ts worker/src/index.ts worker/wrangler.toml scripts/check-worker.mjs
git commit -F - <<'EOF'
Cloud: alts are read hourly on a cron of their own, and their mining at the end of the five-minute round

The spec first had alt reads in the five-minute round; that round gets 30 s of CPU whatever cpu_ms says and has
the main's orders, market watch and alerts to get through. On the existing hourly cron they would run ahead of
the full-market scan, which stops starting fetches after 11 minutes of a 15-minute limit and doesn't know alt
reads came first. So they have 37 * * * *: the hourly CPU allowance, 15 minutes to themselves, CCP's prices
fetched once for the round. The scheduled handler's last branch is the hourly archive, so the new cron is matched
by name before it; the test runs the handler with that cron and checks the main isn't read.

Mining stays every ten minutes, at the very end of the five-minute round, so nothing of a ledger's waits on an
alt. One alt failing is noted under that alt and doesn't stop the next.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 7: The watchdog, by character

**Files:**
- Modify: `src/lib/watchdog.ts` (`WatchFacts.lost`, `watchdogFinding`, `LOGIN_STOPS`, `RefusedLogin`, `loginLostFinding`; new `ALT_JOB_SAID`), `src/lib/alerts.ts:230` and `:290`, `worker/src/watchdog.ts` (whole function)
- Test: `scripts/check.mjs`, `scripts/check-worker.mjs`

**Interfaces:**
- Consumes: `rosterOf` (Task 4).
- Produces (`src/lib/watchdog.ts`): `watchdogFinding(j: JobRow, now: number, alt?: { charId: number; name: string }): Finding | null`; `RefusedLogin.purpose: 'main' | 'mailer' | 'alt'` with `charId?: number`; `ALT_JOB_SAID`.

- [ ] **Step 1: Write the failing tests**

In `scripts/check.mjs`, inside the "several characters" section, add at its end:

```js
  const { watchdogFinding, loginLostFinding } = await import('../src/lib/watchdog.ts');
  const job = { job: 'mining', fails: 3, failingSince: T - 3600_000, lastError: 'ESI 502', warned: null };
  const mine = watchdogFinding(job, T), theirs = watchdogFinding(job, T, { charId: 900001, name: 'Miner Two' });
  eq('  the main\'s failing job is worded and keyed as before', [mine.key, /^Reading your mining ledger has failed 3 times/.test(mine.text)], [`watchdog:mining:${job.failingSince}`, true]);
  eq('  an alt\'s names the character, in its key and its words', [theirs.key, /^Reading Miner Two’s mining ledger has failed 3 times/.test(theirs.text), /Miner Two/.test(theirs.watch.meanwhile)], [`watchdog:900001:mining:${job.failingSince}`, true, true]);
  eq('    and says whose login it is when the error looks like one', [watchdogFinding({ ...job, lastError: 'ESI 401' }, T, { charId: 900001, name: 'Miner Two' }).watch.alt, mine.watch.alt ?? null], ['Miner Two', null]);
  eq('    a job with no wording of its own still names it', /for Miner Two/.test(watchdogFinding({ ...job, job: 'novel' }, T, { charId: 900001, name: 'Miner Two' }).text), true);
  const refused = { name: 'Miner Two', since: T - 20 * 60_000, reason: 'invalid_grant', warned: null };
  const lostAlt = loginLostFinding({ ...refused, purpose: 'alt', charId: 900001 }, T);
  eq('  an alt\'s refused login is mailed, by name', [lostAlt.key, lostAlt.title, /Hand Miner Two over again/.test(lostAlt.text), lostAlt.watch.lost], [`watchdog:login:alt:900001:${refused.since}`, 'Cloud lost Miner Two’s login', true, { purpose: 'alt', name: 'Miner Two' }]);
  eq('  the main\'s is keyed and titled as before', [loginLostFinding({ ...refused, purpose: 'main', name: 'Main' }, T).key, loginLostFinding({ ...refused, purpose: 'main', name: 'Main' }, T).title], [`watchdog:login:main:${refused.since}`, 'Cloud lost your login']);
  eq('  the sender\'s can\'t be mailed, as before', loginLostFinding({ ...refused, purpose: 'mailer' }, T), null);
  const { alertMail } = await import('../src/lib/alerts.ts');
  const mail = alertMail([lostAlt], { appUrl: 'https://app.test/', keepMin: null });
  eq('  the mail says where to hand an alt over', [/Miner Two/.test(mail.subject), /Characters/.test(mail.body), /Settings → Your data/.test(mail.body)], [true, true, false]);
  const jobMail = alertMail([watchdogFinding({ ...job, lastError: 'ESI 401' }, T, { charId: 900001, name: 'Miner Two' })], { appUrl: 'https://app.test/', keepMin: null });
  eq('    and an alt\'s job that needs its login says whose, not "your"', [/hand the cloud Miner Two’s login again: Jita Ledger → Characters/.test(jobMail.body), /your login again/.test(jobMail.body)], [true, false]);
```

In `scripts/check-worker.mjs`, above the final `console.log(failed ? …)` line, add:

```js
console.log('\n--- the watchdog, by character ---');
{
  const { watchdog } = await import('../worker/src/watchdog.ts');
  const { push } = await import('../worker/src/sync.ts');
  const setUp = async () => {
    const { db, env } = await ledgerWithAlt();
    await keepKey(db, MAIN, 'mailer', SENDER, 'Postmaster', SCOPES);
    await push(db, MAIN, { records: [], docs: [{ key: 'alerts', d: { on: true, mail: true, quiet: false } }] });
    return { db, env };
  };
  const failing = (db, char, job, error) => db.run('INSERT INTO jobs (char_id, job, last_run, last_error, fails, failing_since) VALUES (?, ?, ?, ?, ?, ?)', char, job, T0, error, 3, T0 - 30 * MIN);
  const mailBody = (f) => { const c = f.calls.find((x) => x.method === 'POST' && x.path === `/characters/${SENDER}/mail/`); return c ? JSON.parse(c.body) : null; };

  // An alt's login refused: its own job mail is quieted, the main's is not.
  {
    const { db, env } = await setUp();
    db.run('UPDATE keys SET refused_at = ?, refused = ? WHERE purpose = ?', T0 - 20 * MIN, 'invalid_grant', `alt:${ALT}`);
    failing(db, ALT, 'mining', 'EVE refused the cloud’s login for Miner Two (invalid_grant); hand the cloud that login again');
    failing(db, MAIN, 'archive', 'ESI 401 on /characters/95210486/wallet/');
    const f = stubFetch([[new RegExp(`^POST /characters/${SENDER}/mail/$`), 555]]);
    const r = await watchdog(env, MAIN, T0);
    f.restore();
    const m = mailBody(f);
    eq('  one mail, to the main', [r.mailed, m?.recipients?.[0]?.recipient_id], [2, MAIN]);
    eq('    it says the alt\'s login was lost, by name', /Cloud lost Miner Two’s login/.test(m?.body ?? ''), true);
    eq('    and still says the main\'s own job is failing', /Copying your ledger from ESI/.test(m?.body ?? ''), true);
    eq('    the alt\'s job, explained by its login, isn\'t mailed as well', /Reading Miner Two’s mining ledger/.test(m?.body ?? ''), false);
    eq('    the refusal is marked warned on the alt\'s login', db.rows('SELECT refused_warned AS w FROM keys WHERE purpose = ?', `alt:${ALT}`)[0].w, T0);
  }

  // The main's login refused: the alt's failing job is still mailed.
  {
    const { db, env } = await setUp();
    db.run('UPDATE keys SET refused_at = ?, refused = ? WHERE purpose = ?', T0 - 20 * MIN, 'invalid_grant', 'main');
    failing(db, MAIN, 'archive', 'EVE refused the cloud’s login for Main (invalid_grant); hand the cloud your login again');
    failing(db, ALT, 'mining', 'ESI 401 on /characters/900001/mining/');
    const f = stubFetch([[new RegExp(`^POST /characters/${SENDER}/mail/$`), 556]]);
    await watchdog(env, MAIN, T0);
    f.restore();
    const m = mailBody(f);
    eq('  the main\'s lost login quiets the main\'s jobs, not the alt\'s', [/Cloud lost your login/.test(m?.body ?? ''), /Copying your ledger from ESI/.test(m?.body ?? ''), /Reading Miner Two’s mining ledger/.test(m?.body ?? '')], [true, false, true]);
  }

  // An alt no longer on the roster isn't mailed about.
  {
    const { db, env } = await setUp();
    db.run('UPDATE alts SET removed_at = ? WHERE char_id = ?', T0, ALT);
    failing(db, ALT, 'mining', 'ESI 502');
    const f = stubFetch([[new RegExp(`^POST /characters/${SENDER}/mail/$`), 557]]);
    const r = await watchdog(env, MAIN, T0);
    f.restore();
    eq('  a removed alt\'s old job row is nobody\'s', [r.failing, mailBody(f)], [0, null]);
  }
}
```

- [ ] **Step 2: Run and see them fail**

Run: `npm run check`

Expected: the pure tests fail first (`an alt's names the character…`: the key has no character and the text says "your").

- [ ] **Step 3: The wording and the keys**

In `src/lib/watchdog.ts`:

After the `JOB_SAID` constant, add:

```ts
/**
 * The jobs the cloud runs for one of your other characters (an alt: alts.ts in the Worker), worded with its name.
 * "Your" is the main: the mail goes to it, about someone else.
 */
export const ALT_JOB_SAID: Record<string, { label: (name: string) => string; retry: string; meanwhile: (name: string) => string }> = {
  archive: { label: (n) => `Copying ${n}’s wallet, orders and assets from ESI`, retry: 'every hour', meanwhile: (n) => `${n}’s new trades, journal entries and assets aren’t copied to the cloud` },
  sheet: { label: (n) => `Reading ${n}’s skills and wallet`, retry: 'every hour', meanwhile: (n) => `${n}’s skills, queue, clone state and wallet balance stay as they were last read` },
  mining: { label: (n) => `Reading ${n}’s mining ledger`, retry: 'every 10 minutes', meanwhile: (n) => `${n}’s mining isn’t turned into sessions, and nothing it mined past ESI’s 30 days is kept by the cloud` },
};
```

In `WatchFacts`, replace:

```ts
  lost?: { purpose: 'main' | 'mailer'; name: string };
```

with:

```ts
  lost?: { purpose: 'main' | 'mailer' | 'alt'; name: string };
  /** Set when the job is one the cloud runs for an alt: its name, so the mail says whose login to hand over. */
  alt?: string;
```

Replace `watchdogFinding` with:

```ts
/**
 * The mail for a job failing WATCH_FAILS times or more in a row, when one is due: at the streak's start, then daily.
 * `alt`: the job is one the cloud runs for another of your characters; its words name it and its key carries its ID,
 * or two alts failing the same job at the same moment would be one finding.
 */
export function watchdogFinding(j: JobRow, now: number, alt?: { charId: number; name: string }): Finding | null {
  if (j.fails < WATCH_FAILS || j.failingSince == null) return null;
  if (j.warned != null && now - j.warned < REWARN_H * 3600_000) return null;
  const theirs = alt ? ALT_JOB_SAID[j.job] : undefined;
  const said = alt
    ? { label: theirs?.label(alt.name) ?? `The cloud’s “${j.job}” job for ${alt.name}`, retry: theirs?.retry ?? 'on its schedule', meanwhile: theirs?.meanwhile(alt.name) ?? `what it does for ${alt.name} has stopped` }
    : JOB_SAID[j.job] ?? { label: `The cloud’s “${j.job}” job`, retry: 'on its schedule', meanwhile: 'what it does has stopped' };
  const login = loginError(j.lastError);
  return {
    kind: 'watchdog', key: alt ? `watchdog:${alt.charId}:${j.job}:${j.failingSince}` : `watchdog:${j.job}:${j.failingSince}`, title: 'Cloud job failing',
    text: `${said.label} has failed ${j.fails} times in a row.${j.lastError ? ` The last error: ${j.lastError}.` : ''}`,
    watch: { job: j.job, label: said.label, fails: j.fails, since: j.failingSince, error: j.lastError, retry: said.retry, meanwhile: said.meanwhile, login, ...(alt ? { alt: alt.name } : {}) },
  };
}
```

Replace `LOGIN_STOPS`, `RefusedLogin` and `loginLostFinding` (keeping the long comment above `loginLostFinding`, with its last sentence changed as shown) with:

```ts
/** What stops while each login is refused. */
export const LOGIN_STOPS: Record<'main' | 'mailer' | 'alt', string> = {
  main: 'your ledger isn’t copied from ESI, your orders and planets aren’t read, so nothing about them is mailed, and old alert mail isn’t tidied',
  mailer: 'no alert mail can be sent',
  alt: 'its mining, wallet, assets and skills aren’t read',
};

/** `charId`: the character, for an alt's login (its key needs it; the main and the sender are one each). */
export type RefusedLogin = { purpose: 'main' | 'mailer' | 'alt'; charId?: number; name: string | null; since: number; reason: string | null; warned: number | null };

/**
 * The mail for a refused login, when one is due: once it has lasted `LOGIN_GRACE_MS` outside EVE's downtime, then
 * daily. A refused login stops every job that needs it at once, so it's one mail, not one per job as each fails twice:
 * the user's trading login stopped on 29 September 2026 and three mails came over two hours, one each for the alert
 * checks, the orders and the ledger copy. The refusal is kept on the login (`keys.refused_at`); a refresh that works, or
 * the login handed over again, clears it. The trading login's is mailed, and an alt's, by name. A refused sender can't
 * send the mail that would say so, so that one shows only in the app (Settings, To do).
 */
export function loginLostFinding(k: RefusedLogin, now: number): Finding | null {
  if (k.purpose === 'mailer') return null;
  if (now - k.since < LOGIN_GRACE_MS || isDowntime(now)) return null;
  if (k.warned != null && now - k.warned < REWARN_H * 3600_000) return null;
  const alt = k.purpose === 'alt';
  const name = k.name ?? (alt ? 'one of your characters' : 'your character');
  const label = `The cloud’s login for ${name}`;
  const why = k.reason ? ` (${k.reason})` : '';
  return {
    kind: 'watchdog', key: alt ? `watchdog:login:alt:${k.charId}:${k.since}` : `watchdog:login:${k.purpose}:${k.since}`,
    title: alt ? `Cloud lost ${name}’s login` : 'Cloud lost your login',
    text: alt
      ? `EVE refused the cloud’s login for ${name}${why}. Hand ${name} over again: Characters.`
      : `EVE refused the cloud’s login for ${name}${why}. Hand it your login again: Settings → Your data.`,
    watch: {
      job: 'login', label, fails: 0, since: k.since, error: k.reason, retry: 'every few minutes', meanwhile: LOGIN_STOPS[k.purpose], login: true,
      lost: { purpose: k.purpose, name },
    },
  };
}
```

In `src/lib/alerts.ts`, replace line 230:

```ts
  if (f.watch?.lost) return `hand the cloud your login again`;
```

with:

```ts
  if (f.watch?.lost) return f.watch.lost.purpose === 'alt' ? `hand the cloud ${f.watch.lost.name}’s login again` : `hand the cloud your login again`;
```

and replace line 290:

```ts
      advice('red', `hand the cloud your login for ${w.lost.name} again: Jita Ledger → Settings → Your data`),
```

with:

```ts
      advice('red', w.lost.purpose === 'alt'
        ? `hand the cloud ${w.lost.name}’s login again: Jita Ledger → Characters`
        : `hand the cloud your login for ${w.lost.name} again: Jita Ledger → Settings → Your data`),
```

and, a few lines below in the same function, replace:

```ts
        ? advice('red', 'hand the cloud your login again: Jita Ledger → Settings → Your data')
```

with:

```ts
        ? advice('red', w.alt ? `hand the cloud ${w.alt}’s login again: Jita Ledger → Characters` : 'hand the cloud your login again: Jita Ledger → Settings → Your data')
```

- [ ] **Step 4: The round**

In `worker/src/watchdog.ts`, add the imports:

```ts
import { loginLostFinding, WATCH_FAILS, watchdogFinding, type RefusedLogin } from '../../src/lib/watchdog';
import { rosterOf } from './alts';
```

(the first replaces the existing `watchdog` import line), and replace the function's body from `const db = env.DB;` down to the `if (!due.length && !lost.length)` line with:

```ts
  const db = env.DB;
  // This ledger's own jobs, the ones run for everyone (char 0), and its alts', each alt's worded with its name.
  const alts = await rosterOf(db, charId);
  const nameOf = new Map(alts.map((a) => [a.charId, a.name ?? `character ${a.charId}`]));
  const ids = [charId, 0, ...alts.map((a) => a.charId)];
  const rows = (await db.prepare(`SELECT char_id, job, fails, failing_since, last_error, warned FROM jobs WHERE fails >= ?1 AND char_id IN (${ids.map((_, i) => `?${i + 2}`).join(',')})`)
    .bind(WATCH_FAILS, ...ids).all<{ char_id: number; job: string; fails: number; failing_since: number | null; last_error: string | null; warned: number | null }>()).results;
  // A login EVE refused is one mail of its own, and the jobs failing for want of it aren't mailed one by one.
  const refused = (await db.prepare(`SELECT purpose, token_char_id AS char, token_char_name AS name, refused_at, refused, refused_warned FROM keys WHERE char_id = ?1 AND refused_at IS NOT NULL`)
    .bind(charId).all<{ purpose: string; char: number; name: string | null; refused_at: number; refused: string | null; refused_warned: number | null }>()).results;
  const kind = (purpose: string): RefusedLogin['purpose'] => (purpose === 'main' || purpose === 'mailer' ? purpose : 'alt');
  const lost = refused.map((k) => ({ k, f: loginLostFinding({ purpose: kind(k.purpose), charId: k.char, name: k.name, since: k.refused_at, reason: k.refused, warned: k.refused_warned }, now) }))
    .filter((x): x is { k: typeof refused[number]; f: NonNullable<typeof x.f> } => x.f != null);
  // A refused login explains the login-looking failures of the character whose jobs need it, and no one else's: the
  // main's (or the sender's, without which the main's alert round fails) for the ledger's own jobs, an alt's for that
  // alt's. It used to be "any refused login quiets them all", so a refused alt would have silenced the main's.
  const quiet = new Set(refused.map((k) => (kind(k.purpose) === 'alt' ? k.char : charId)));
  const due = rows.map((r) => ({
    r,
    f: watchdogFinding({ job: r.job, fails: r.fails, failingSince: r.failing_since, lastError: r.last_error, warned: r.warned }, now,
      nameOf.has(r.char_id) ? { charId: r.char_id, name: nameOf.get(r.char_id)! } : undefined),
  })).filter((x): x is { r: typeof rows[number]; f: NonNullable<typeof x.f> } => x.f != null && !(x.f.watch?.login && quiet.has(x.r.char_id)));
```

The rest of the function is unchanged: it already binds `warn` by `x.r.char_id` and `warnLogin` by `x.k.purpose`, which for an alt is its `alt:<id>` row.

Update the file's header comment: after "has failed twice in a row, or EVE has refused its login" add ", its alts' jobs and logins included, by name".

- [ ] **Step 5: Run the tests and the build**

Run: `npm run check && npm run build`

Expected: both `all passed`; the build clean.

If a watchdog test in `check-worker.mjs` shows no mail at all (`mailBody` null), the alert settings are gating it. Print what the defaults are and set what the gate needs in `setUp`'s `alerts` doc:

```bash
node --import ./scripts/register.mjs -e "import('./src/lib/prefs.ts').then((m) => console.log(JSON.stringify(m.sanitizeAlerts({ on: true, mail: true }), null, 1)))"
```

The watchdog kind has to be on in both `ev` and `mailEv`, and `T0` (15:00 UTC) outside any quiet hours.

- [ ] **Step 6: Commit**

```bash
git add src/lib/watchdog.ts src/lib/alerts.ts worker/src/watchdog.ts scripts/check.mjs scripts/check-worker.mjs
git commit -F - <<'EOF'
Watchdog: failing jobs and refused logins are told apart by character

Three things in the watchdog assumed one character. It read job rows for the ledger and the shared jobs only, so
an alt's failing read would never be mailed. Its words say "your" and its keys carry only the job, so two alts
failing the same job at the same moment would be one finding, worded as the main's. And any refused login of the
ledger dropped every login-looking job finding, so a refused alt would have silenced the main's own failing jobs,
and the reverse.

The round now also reads its alts' job rows, through the roster, and words each with the character's name and keys
it by the character. A refused login quiets only the jobs of the character it belongs to. An alt's refused login
is mailed, by name, pointing at the Characters page; the sender's still can't be, since it would send the mail.
The main's findings keep their old keys, so nothing already mailed is mailed again.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 8: Alts out of the market watch, the `chars` document, and the words that said otherwise

**Files:**
- Modify: `worker/src/market.ts` (`watchedTypes`), `worker/src/sync.ts:15`, `src/lib/constants.ts` (the `OWNER_CHARS` comment), `docs/notes/app-conventions.md` (the owner-lock bullet's last sentence), `docs/notes/eve-facts.md`, `docs/notes/gotchas.md`, `CLAUDE.md`
- Create: `docs/notes/characters.md`, `.claude/rules/characters.md`
- Test: `scripts/check-worker.mjs`

**Interfaces:**
- Produces: the `chars` document accepted by `push` and returned by `pull`.

- [ ] **Step 1: Write the failing tests**

In `scripts/check-worker.mjs`, above the final `console.log(failed ? …)` line, add:

```js
console.log('\n--- an alt is never a ledger ---');
{
  const { watchedTypes } = await import('../worker/src/market.ts');
  const { push, pull } = await import('../worker/src/sync.ts');
  const { db } = await ledgerWithAlt();
  db.run('INSERT INTO alts (char_id, ledger, name, added_at, removed_at) VALUES (?, ?, ?, ?, ?)', 900002, MAIN, 'Gone', 1, 2);
  const open = (typeId) => ({ typeId, state: 'open' });
  await push(db, MAIN, { records: [{ k: 'orders', i: '1', d: open(34) }, { k: 'watchlist', i: '36', d: { typeId: 36 } }], docs: [] });
  await push(db, ALT, { records: [{ k: 'orders', i: '2', d: open(VELDSPAR) }], docs: [] });
  await push(db, 900002, { records: [{ k: 'orders', i: '3', d: open(SCORDITE) }], docs: [] });
  eq('  the market watch reads the main\'s items, not an alt\'s, removed or not', (await watchedTypes(db)).sort((a, b) => a - b), [34, 36]);

  await push(db, MAIN, { records: [], docs: [{ key: 'chars', d: { [ALT]: { name: 'Miner Two' } } }] });
  eq('  the list of your characters is a document the cloud keeps', (await pull(db, MAIN, 0, null)).docs.map((x) => x.key), ['chars']);
}
```

- [ ] **Step 2: Run and see them fail**

Run: `npm run check`

Expected: `the market watch reads the main's items…: got [34,36,1228,1230]`, then `Unknown document: chars` thrown by `push`.

- [ ] **Step 3: The market watch**

In `worker/src/market.ts`, replace the body of `watchedTypes` down to the `const asked` statement with:

```ts
  // Ledgers only. An alt's orders are kept like a ledger's, under its own ID, but nothing judges them, and its sell
  // orders would add books to read every five minutes; one removed with its data kept leaves orders open for good.
  const held = (await db.prepare(`
    SELECT DISTINCT CAST(json_extract(data, '$.typeId') AS INTEGER) AS t FROM records
      WHERE kind = 'orders' AND data IS NOT NULL AND json_extract(data, '$.state') = 'open' AND char_id NOT IN (SELECT char_id FROM alts)
    UNION SELECT CAST(json_extract(data, '$.typeId') AS INTEGER) FROM records
      WHERE kind = 'positions' AND data IS NOT NULL AND json_extract(data, '$.status') = 'open' AND char_id NOT IN (SELECT char_id FROM alts)
    UNION SELECT CAST(id AS INTEGER) FROM records WHERE kind = 'watchlist' AND data IS NOT NULL AND char_id NOT IN (SELECT char_id FROM alts)`).all<{ t: number }>()).results;
  const asked = (await db.prepare(`SELECT CAST(j.value AS INTEGER) AS t FROM docs, json_each(docs.data, '$.types') AS j WHERE docs.key = 'watch' AND docs.char_id NOT IN (SELECT char_id FROM alts)`)
    .all<{ t: number }>()).results;
```

and in the doc comment above it replace "Every item any ledger trades or watches" with "Every item any ledger trades or watches (a ledger: never an alt, which is only read)".

- [ ] **Step 4: The `chars` document**

In `worker/src/sync.ts`, replace the `DOC_KEYS` comment and line:

```ts
// `costs` and `watch` are docs only the cloud reads: the browser's cost basis per item, for the alert checks,
// and the items it asks to have watched (Prospects candidates, loyalty outputs), with the filters to judge them by.
export const DOC_KEYS = new Set(['settings', 'meta', 'prefs', 'alerts', 'stock', 'skills', 'ignored', 'nearDone', 'unusualOk', 'costs', 'watch', 'leave', 'safetyTimes', 'notSnipes', 'plans']);
```

with:

```ts
// `costs` and `watch` are docs only the cloud reads: the browser's cost basis per item, for the alert checks,
// and the items it asks to have watched (Prospects candidates, loyalty outputs), with the filters to judge them by.
// `chars` is which characters are yours (the main's ledger holds that and nothing else of an alt's); allowed here
// before any app sends it, since a push naming a document the Worker doesn't know is refused whole.
export const DOC_KEYS = new Set(['settings', 'meta', 'prefs', 'alerts', 'stock', 'skills', 'ignored', 'nearDone', 'unusualOk', 'costs', 'watch', 'leave', 'safetyTimes', 'notSnipes', 'plans', 'chars']);
```

- [ ] **Step 5: Run the tests and the build**

Run: `npm run check && npm run build`

Expected: both `all passed`; the build clean.

- [ ] **Step 6: The owner lock's words**

In `src/lib/constants.ts`, replace the end of the `OWNER_CHARS` comment:

```ts
 * the owner's Cloudflare account. Character IDs are public in EVE, so this needn't be secret. Add an alt here to let
 * it in.
 */
```

with:

```ts
 * the owner's Cloudflare account. Character IDs are public in EVE, so this needn't be secret.
 *
 * **Never add an alt here.** A character let in logs in to the app as a ledger of its own: the browser's one store
 * would take its trades in with the main's, and the first cloud sync would push the main's whole ledger under the
 * alt's ID. An alt is read by the cloud instead, with a login handed to it (worker/src/alts.ts), and the Worker
 * refuses a caller that is an alt.
 */
```

In `docs/notes/app-conventions.md`, in the first bullet ("The app is its owner's alone"), replace its last sentence:

```
To let an alt in, add its character ID.
```

with:

```
**Never add an alt to `OWNER_CHARS`**: a character let in is a ledger of its own in the one browser store, and the
  first cloud sync would push the main's ledger under its ID. Alts are read by the cloud (see characters.md).
```

- [ ] **Step 7: The notes**

Create `docs/notes/characters.md`:

```markdown
# Several characters

Decisions worth not undoing. How alts (characters on the owner's other accounts) are kept apart from the main.

- **An alt feeds the one ledger and never logs in to the app** (decided with the user, 30 September 2026; the design
  is `docs/superpowers/specs/2026-09-30-multi-character-design.md`). Their accounts: the main account holds the trading
  character and a second one used only to send alert mail; each alt account has one character for now and may grow
  into industry and planets. Their one fear was information getting jumbled, so the separation is structural: an alt's
  login is handed to the cloud once, everything read for it is filed under its own character ID, and the main's ledger
  holds no row of an alt's.
- **The roster is the `alts` table, the login a `keys` row `(the main, 'alt:<id>')`** (migration 0016, `worker/src/alts.ts`).
  Alts are found through the table, never by matching a purpose's text, and a removed alt whose data was kept stays in
  it (`removed_at`), so it is still known not to be a ledger: the market watch reads every ledger's open orders.
- **A reader is told whose login it uses and whose data it writes** (`Reader` in `worker/src/eve.ts`). Only `useLogin`
  takes the ledger and the purpose; every ESI path, table, `push` and `noteJob` take `char`; `readerLogin` refuses
  before anything is read when the login isn't that character's. `readMiningRound` was written when the two were one
  character and bound some tables by its argument and others by the login's: refactored naively it pushed an alt's
  mining into the main's records. `scripts/check-worker.mjs` runs each reader for an alt against real SQL and checks
  the main's rows are untouched.
- **EVE's page picks the character, so the cloud sorts out who came back** (`sortLogin` in `lib/roster.ts`,
  `keepHandedOver`). Adding an alt while still signed in to the main account at EVE offers the main and the mail
  character; either, picked by mistake, is kept as its own login and nothing is added. A sender login that turns out
  to be an alt is refused, its alt's login marked refused at once. The main's and the sender's own flows are unchanged:
  the user asked for care with logins.
- **Alts are read hourly on a cron of their own** (`37 * * * *`, `altsHourly`) and their mining every ten minutes at the
  end of the five-minute round. Not on the `:07` cron: the full-market scan's 11-minute budget doesn't know alt reads
  ran ahead of it. Not in the five-minute round: 30 s of CPU.
- **What isn't done for an alt**: order refresh and judging, alerts, opportunity mail, the track record, share
  measuring, the Sniper's bids, asset-safety mail, killmails, the `orders` job row. An alt's first `archive` would
  otherwise mail the main about every wrap it holds.
- **Clone state is worked out, and can be unknown** (`cloneState`): Alpha when a skill is usable below its trained
  level, Omega when one is usable above Alpha's cap (`lib/alphaCaps.ts`, from CCP's `cloneGrades.jsonl`), else it can't
  be told. "Since" is kept only for a change the cloud saw.
- **The watchdog is by character**: an alt's job findings name it and carry its ID in their key, and a refused login
  quiets only its own character's job mails. It used to be "any refused login quiets them all".
- **An app version behind is shown no alt logins** (`/v1/status` lists only `main` and `mailer`): its To do turns every
  refused login it sees, other than the main's, into "log in a sender", which for an alt is the login that stops its own.
- **Removing an alt** drops its mining snapshot and job rows either way (a re-add starts from a fresh baseline with no
  old failing streak) and never its `revs` row (a revision that restarted would let a device holding the old one miss
  what follows).
- **Stage 1 shipped dark**: the cloud side only. The browser (the Characters page, the alt store), Mining across
  characters and the Wallet's transfers are stages 2 to 4 of the spec.
```

Create `.claude/rules/characters.md`:

```markdown
---
paths:
  - "worker/src/{alts,sheet}.ts"
  - "src/lib/{roster,alphaCaps}.ts"
  - "scripts/{d1,check-worker,alpha-caps}.mjs"
---

# Several characters

These files are covered by `docs/notes/characters.md`, imported below: how alts are kept apart from the main (whose
login, whose data; the roster; who came back from EVE's login). If the note's text doesn't follow this paragraph, Read
that file before changing anything here.

@../../docs/notes/characters.md
```

In `docs/notes/eve-facts.md`, add these bullets after the bullet that begins "**Logging in with a different set of permissions stops the logins issued before it.**":

```markdown
- **That rule is per character, not per account, and EVE enforces it at its own login page.** The mail character, on
  the same account as the main, kept its two-permission login through the main's relog on 29 September 2026. And the
  earlier login is already stopped by the time the app or the Worker is handed the new one, so refusing a login
  afterwards protects nothing: a wrong character picked on EVE's chooser has to be kept as what it is
  (characters.md).
- **An account holds up to three characters, and EVE's login asks for the account, then which of its characters.** It
  remembers the account last used, so logging in a character on another account means signing out on EVE's page first.
- **An Alpha account can't be in game at the same time as any other account** (the user, 30 September 2026).
- **Alpha's skill limits are in CCP's static data, not ESI**: `cloneGrades.jsonl` (build 3561556, 30 September 2026)
  has four grades, one a race, each the same 175 skills at the same levels (Mining IV, Broker Relations II, Trade III;
  Accounting and Mining Barge absent, so not usable at all). ESI's skills answer gives a trained and an active level,
  which differ only while Alpha caps a skill; a character with nothing past the limits can't be told apart.
- **A `player_donation` journal entry has the giver as `first_party_id` and the receiver as `second_party_id`**
  (the user's journal, 30 September 2026: two entries, the main second on both). It held no contract payment between
  characters to check the same of.
```

In `docs/notes/gotchas.md`, add as the first bullet:

```markdown
- **The Worker's code is tested in `npm run check`, so it must stay loadable by Node's type stripping**
  (`scripts/check-worker.mjs` on `scripts/d1.mjs`: SQLite in memory from the real migrations, `fetch` stubbed). No
  constructor parameter properties (`constructor(public status: number)`), no enums, no namespaces: one in any file
  stops every Worker module that imports it loading, with "TypeScript parameter property is not supported in
  strip-only mode". The stand-in is SQLite, not D1: a new migration still gets `wrangler d1 migrations apply --local`.
```

- [ ] **Step 8: CLAUDE.md**

In `CLAUDE.md`:

Replace:

```
npm run check    # pure-logic tests, fast, no network
```

with:

```
npm run check    # pure-logic tests, then the Worker's own code on an in-memory D1 stand-in; fast, no network
```

In the Timers paragraph, replace:

```
runs each ledger's alert round, in that order in one chain; hourly at :07 the archive, then once a day after 12:00
UTC the daily checks
```

with:

```
runs each ledger's alert round, then each alt's mining, in that order in one chain; hourly at :07 the archive, then
once a day after 12:00 UTC the daily checks; hourly at :37 every alt's full read (`altsHourly`)
```

(The original wraps across two lines in the file; match it as it is there.)

In "Notes by topic", add to the list that is loaded when a covered file is read, after the `loyalty-hustles.md` line:

```
- `characters.md`: alts, and how they are kept apart from the main (whose login, whose data; the roster).
```

- [ ] **Step 9: Check the rule file and run everything**

Run:

```bash
python3 - <<'EOF'
import re, glob, io, os, itertools
try:
    import yaml
except ImportError:
    yaml = None
def expand(p):
    m = re.search(r'\{([^{}]*)\}', p)
    return [p] if not m else list(itertools.chain.from_iterable(expand(p[:m.start()] + o + p[m.end():]) for o in m.group(1).split(',')))
t = io.open('.claude/rules/characters.md', encoding='utf-8').read()
m = re.match(r'^---\n(.*?)\n---\n', t, re.S)
pats = yaml.safe_load(m.group(1))['paths'] if yaml else re.findall(r'^\s*-\s*"(.*)"\s*$', m.group(1), re.M)
missing = [e for p in pats for e in expand(p) if not os.path.isfile(e)]
print('patterns with no file:', missing or 'none')
print('import resolves:', os.path.isfile(os.path.normpath(os.path.join('.claude/rules', re.findall(r'^@(\S+)$', t, re.M)[0]))))
EOF
npm run check && npm run build && npm run check-pages
```

Expected: `patterns with no file: none`, `import resolves: True`, both `all passed`, the build clean, every page passing.

- [ ] **Step 10: Commit**

```bash
git add worker/src/market.ts worker/src/sync.ts src/lib/constants.ts docs/notes CLAUDE.md .claude/rules/characters.md scripts/check-worker.mjs
git commit -F - <<'EOF'
Cloud: an alt is never a ledger, and the words that said to make it one

watchedTypes had no character filter at all: it watched every item anyone's records held an open order on. An
alt's orders are kept under its own ID like a ledger's, so its sell orders would have added books to read every
five minutes, and one removed with its data kept would leave them open for good. It now leaves out every
character in the alts table, removed ones included.

The Worker accepts a chars document, the list of which characters are yours, before any app sends one: a push
naming a document the Worker doesn't know is refused whole, and the site and the Worker deploy in either order.

constants.ts and the app-conventions note both ended "to let an alt in, add its character ID". That is the one
way to mix the ledgers: a character let in is a ledger of its own in the browser's single store, and the first
cloud sync pushes the main's ledger under its ID. Both now say never to, and why.

Notes: a new characters.md with a rule of its own, EVE's login facts as the user set them out (per character, at
EVE's page, accounts and their characters, Alpha's caps in the static data, a donation's parties), and the gotcha
that the Worker's code must stay loadable by Node's type stripping.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 9: Ship it, and prove the main is unchanged

**Files:** none changed. This stage ships dark, so what production proves is that the main's own jobs behave as before.

- [ ] **Step 1: Everything, once more, from a clean tree**

Run: `git status --short && npm run check && npm run build && npm run check-pages && npm run check-phone`

Expected: nothing uncommitted; both `all passed`; the build clean; every page passing at both widths.

- [ ] **Step 2: The Worker on wrangler's own runtime, locally**

Run, in one terminal:

```bash
cd worker && npx wrangler d1 migrations apply jita-ledger --local && npx wrangler dev --port 8787 --var DEV_AUTH_CHAR:90000001 --test-scheduled
```

and in another:

```bash
curl -s -H 'Authorization: Bearer dev-token' localhost:8787/v1/alts
curl -s -H 'Authorization: Bearer dev-token' localhost:8787/v1/alts/mining/ticks
curl -s -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer dev-token' localhost:8787/v1/alts/123/pull
curl -s -H 'Authorization: Bearer dev-token' localhost:8787/v1/status | head -c 300
curl -s "localhost:8787/__scheduled?cron=37+*+*+*+*"
```

Expected: `[]`, `[]`, `404`, a status whose `background.keys` is `[]`, and `Ran scheduled event`, with the first terminal logging `alts hourly {"alts":0,"read":0,"failed":0}`. Stop `wrangler dev`.

- [ ] **Step 3: Merge and push**

```bash
git checkout main && git merge --ff-only multi-character && git push origin main && git branch -d multi-character
```

(The branch was never pushed, so there is no remote branch to delete.)

- [ ] **Step 4: Wait for both deploys**

Run: `npm run deployed`

Expected: `ok` for "Deploy to GitHub Pages" and for "Deploy the cloud Worker", then `Shipped.` If the Worker's run failed, its log is printed: fix that before anything else.

- [ ] **Step 5: The migration is live**

Run:

```bash
cd worker && npx wrangler d1 execute jita-ledger --remote --command "SELECT name FROM sqlite_master WHERE name = 'alts'; SELECT COUNT(*) AS alts FROM alts; SELECT COUNT(*) AS with_ship_column FROM pragma_table_info('mining_state') WHERE name = 'ship_type_id';" && cd ..
```

Expected: `alts`, `0`, `1`.

- [ ] **Step 6: The main's jobs, through one round of each**

Run `cd worker && npx wrangler tail jita-ledger-cloud` and leave it through the next five-minute round and the next `:07`. Expected in the log: `market watch …`, `alerts 95210486 …` when a round is due, no `alts mining` line (it logs only when it read or failed), no exception. Then:

```bash
npx wrangler d1 execute jita-ledger --remote --command "SELECT job, datetime(last_run / 1000, 'unixepoch') AS last_run, last_ok = last_run AS ok, fails, last_error FROM jobs WHERE char_id = 95210486 ORDER BY job"
```

Expected: `archive`, `orders`, `mining` and `alerts` each with `ok` 1 and `fails` 0, their `last_run` after the deploy. `mining` after the deploy shows the ship was read (`SELECT ship_type_id FROM mining_state WHERE char_id = 95210486` is a number, or NULL only if the login lacks the ship permission).

The `:37` cron is new: Cloudflare took 26 minutes to first fire the last new one. Don't look for `alts hourly {"alts":0,…}` in the tail until half an hour after the deploy.

- [ ] **Step 7: Say what shipped and what hasn't**

Report to the user: stage 1 is live and dark (no alt can be added until stage 2's Characters page); the main's jobs were watched through a round and are unchanged; what the tests cover and the two things only a real alt will prove (EVE's login, and ESI read as an alt). Then write the stage 2 plan.

---

## After shipping (30 September 2026)

Stage 1 shipped as `f9fd2b7..5f32c3b`: eight task commits, each reviewed on its own, then a whole-branch review, one
fix commit (`a3d8478`) and a follow-up (`5f32c3b`). What changed against this plan's text, and what is carried on.

**Where the shipped code differs from the tasks above** (the whole-branch review's fixes; `docs/notes/characters.md`
has the reasons):

- `stillKept` gates an alt's writes only, in `archive` and `readMiningRound`. The tasks gated the main too.
- `readMiningRound` pushes its records before it advances the snapshot.
- `keepHandedOver` writes the `keys` row and the `alts` row in one batch.
- `removeAlt` refuses anything that isn't an alt on the ledger's roster.
- `useLogin` marks a login refused only if the row still holds the token it tried.
- `DELETE /v1/keys` answers 400 to anything but `purpose=main` or `purpose=mailer` (it used to treat anything else
  as the main's).
- The `archive` job's detail doesn't carry `wallet` and `lp`.
- `scripts/check-worker.mjs` replaces the global `fetch` with a guard: a test that reaches the network fails the run.

**For the stage 2 plan** (the browser):

- An alt's stored `meta.walletAt` only advances when something else changed, so "as of" on the Characters page comes
  from the `sheet` job's `lastOk` in `GET /v1/alts`, not from `walletAt`. `Meta` in `src/lib/types.ts` needs
  `cloneSince` and `activeSkills`.
- An alt removed with its data kept can't have that data deleted later except by adding it again and then deleting:
  it's off the roster, so its route answers 404. The Remove dialog has to say so.
- With no sender kept yet, the mail character picked while adding an alt is stored as an alt, and a later sender
  hand-over for it is refused with "hand it over again on the Characters page", where the remedy is to remove it
  from the roster first. Word that case, or have the add flow ask.
- With the main's watch stopped, an alt hand-over that comes back as the main re-creates the `main` row and the
  main's cloud jobs resume. The toast has to say so.
- `POST /v1/keys` answers `kept: { purpose, as, charId, name, scopes }`; `as` is what it was kept as.

**Left as they are, on purpose:**

- A refused `main` or `mailer` hand-over isn't revoked at EVE: whether revoking one login ends a same-permission
  sibling login of that character isn't known.
- A failed `/ship/` read blanks the stored hull for that read: a kept hull would carry the time of a read that
  didn't see it.
- A refused main or sender login no longer quiets login-looking failures of the shared jobs (scan, sniper, checks):
  they use no login.

**Small things not done** (none changes behaviour today):

- `scripts/d1.mjs` `now()` treats only `SELECT`/`WITH` as returning rows (an `INSERT … RETURNING` in a batch wouldn't).
- `scripts/alpha-caps.mjs` checks only that grades agree on a skill's level, not that they list the same skills, and
  doesn't validate the build number.
- `usableSkills` returns the caller's own object when nothing is capped.
- `Reader.purpose` admits `'mailer'` at the type level; a malformed `Reader` is refused only when a read is due.
- `stillKept`-then-write isn't atomic: a removal landing between them leaves rows under the alt's own ID (never the
  main's); after `data=delete` those rows belong to an ID no longer in `alts`.
- `readSheet` reports `pushed` even when nothing was pushed, fetches the login a second time, and duplicates
  `archive.ts`'s `doc` helper.
- `altsStatus` runs one `jobs` query per alt; `isAlt` adds one read to every authenticated request.
- `altsHourly` doesn't log a failed `roughPrices()`.
- The `alts` upsert would re-home an alt already on another ledger's roster (not reachable with one owner).
- `watchdog.ts` `kind()` takes any unknown purpose for an alt's.
- No test for `POST /v1/alts/<id>/read` through the route, for a re-added alt's revision carrying on, for paging an
  alt's pull, or for `altTicks`' ledger filter.
- The main's archive test prints `asset safety registered …` into the run's output.
