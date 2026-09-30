# Several characters, stage 2a: adding an alt and seeing it. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can add an alt from a new Characters page, see it being read by the cloud (clone state, wallet, net worth, the skill in training, when it was last read, the state of its login), hand its login over again, and remove it, with nothing of the alt's entering the main's ledger.

**Architecture:** The browser never holds an alt's login. "Add a character" sends the owner to EVE with a new login purpose whose refresh token goes straight to the Worker (stage 1's `POST /v1/keys` with `purpose: 'alt'`). A new module, `altStore.ts`, keeps a read-only copy of the cloud's roster and each alt's pulled rows in an IndexedDB database of its own. The main's ledger gains one synced document, `chars`: which characters are yours, never a record of theirs.

**Tech Stack:** React, TypeScript, Vite, idb-keyval; the Worker's stage 1 routes (`/v1/alts`, `/v1/alts/<id>/pull`, `/v1/alts/<id>/read`, `DELETE /v1/alts/<id>`), live since 30 September 2026.

**Spec:** `docs/superpowers/specs/2026-09-30-multi-character-design.md`, section 3 ("In the browser"), and the "After shipping" part of `docs/superpowers/plans/2026-09-30-multi-character-cloud.md`, which lists what this stage has to take into account.

**What this plan leaves for the next one (stage 2b):** what each character earned (`lib/income.ts`, lifted out of the Wallet's "All income against play", with a recording test first) and what it mined, on its card and in the all-characters tiles. It is split off on purpose: this half ends with a real alt being read in production, which is the first time EVE's login and ESI are exercised for an alt, and what that shows should come before more is built on it. Stages 3 (Mining across characters) and 4 (the Wallet's total, transfers, To do) follow as the spec has them.

## Global Constraints

- **Alt data has no path into the main's ledger.** `altStore.ts` imports from `./store` only `dataGeneration`, `mergeChars` and `onClearAll`: never `update`, `getData` or `useData`. Only `App.tsx` and `Characters.tsx` import `altStore.ts`. Both are tested.
- **The main's and the mail sender's logins are not changed**: `login`, `loginMailer`, `loginForCloud`, `loginMailerForCloud` and what `handleCallback` does for their purposes stay as they are. The one new login is `loginAltForCloud`.
- **The browser never stores an alt's token.** The `cloud-alt` branch of `handleCallback` returns the refresh token for the Worker and writes nothing to `localStorage`.
- **The site must tolerate the Worker being a version behind**: a missing field is null, never an error; `GET /v1/alts` answering 404 means the Worker doesn't know alts yet, and the page says so.
- **Pure rules stay pure**: `src/lib/roster.ts` and `src/lib/prefs.ts` import nothing from `./config`, `./store`, React or the DOM (the Worker and the test runner load them).
- **How the app looks and speaks** (`docs/notes/app-conventions.md`): facts are tiles and short lines, not paragraphs; a figure says how old it is; every list is keyed by the ID it stands for, never a label; relative times come from `useNow()` passed to `ago()`; nothing sticks out past a 390 px screen; a tooltip longer than a sentence is a lead line, bullets ("• "), then an example; no figure is invented, and a missing one shows as "–".
- **Verify before claiming**: `npm run check` and `npm run build` for every task; `npm run check-pages` and `npm run check-phone` for any task that changes a page; a look in a real browser for the page itself.
- **Branch**: `multi-character-browser`, merged `--ff-only` to `main` at the end, deleted, then `npm run deployed`.
- **Commit messages explain the reasoning** and end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
  ```
- **Test characters**: main `95210486`, alts `900001` "Miner Two", `900002` "Miner Three", `900003` "Hauler Four".

## Review Focus

Conditions the spec implies that a task's obvious tests wouldn't reach. Each has a test or a check in the task named.

1. **The Worker is a version behind** (`GET /v1/alts` answers 404): the Characters page says the cloud isn't ready, and "Add a character" does not send the owner to EVE for a login the Worker couldn't keep. Task 4 (the add handler) and Task 2 (`behind` in the store's state).
2. **The cloud can't be reached** (offline, or the page check's blocked network): the page draws the roster and the cards from what was last stored, says how old that is, and logs no React warning. Task 4 (the page check seeds the alt store and lets no request out).
3. **An alt's pull spans several pages**: the stored revision moves only when the last page has arrived, so a pull cut off halfway is repeated from the start. Task 2 (`applyAltPull`).
4. **"Clear all data" while an alt pull is in flight**: the pull's result is discarded. Task 2 (the generation check in `altStore.ts`; checked by reading, and by the clear test in Task 4's browser look).
5. **A character with nothing yet read** (just added; no `meta`, no net-worth point, no queue): its card shows "–" for each figure and "not read yet", not zeros. Task 2 (`charFacts` on an empty copy) and Task 4 (the page check's third alt).

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/prefs.ts` | Gains `CharsDoc` and `sanitizeChars`. |
| `src/lib/store.ts` | `Data.chars`; `mergeChars`; `onClearAll`. |
| `src/lib/cloudSync.ts`, `src/lib/cloud.ts` | `chars` as a synced document; the alt routes' client functions; an error's HTTP status. |
| `src/lib/roster.ts` | Gains the browser's pure rules: `RosterEntry`, `AltSaved`, `applyAltPull`, `charFacts`, `lastRead`, `loginState`, `failingJobs`. |
| `src/lib/altStore.ts` (new) | The alts' read-only copy in this browser: its own IndexedDB database, the roster read, the pulls. |
| `src/lib/auth.ts` | The `cloud-alt` login purpose. |
| `src/App.tsx` | What a returned alt login does; the sender-slot check; the page's registration; starting the alt store. |
| `src/components/Characters.tsx` (new) | The page. |
| `src/components/shell/nav.ts` | The page in the rail. |
| `scripts/pages.mjs` | The page in the page check, with no alts, one and several. |

---

### Task 1: `chars`, the one thing about an alt the main's ledger holds

**Files:**
- Modify: `src/lib/prefs.ts` (new exports, before `effectiveMotion`), `src/lib/store.ts`, `src/lib/cloudSync.ts:22`, `src/lib/cloud.ts` (the pull's sanitising)
- Test: `scripts/check.mjs`

**Interfaces:**
- Produces (`src/lib/prefs.ts`): `type CharsDoc = Record<string, { name: string; clone?: 'alpha' | 'omega' }>`; `sanitizeChars(v: unknown): CharsDoc`.
- Produces (`src/lib/store.ts`): `Data.chars: CharsDoc`; `mergeChars(found: { charId: number; name: string | null }[]): void`; `onClearAll(fn: () => Promise<void> | void): () => void`.

- [ ] **Step 1: Write the failing tests**

In `scripts/check.mjs`, above the final `console.log(failed ? …)` line, add:

```js
console.log('\n--- which characters are yours ---');
{
  const { sanitizeChars } = await import('../src/lib/prefs.ts');
  const { isDocKey, applyPulled, everything, DOC_KEYS } = await import('../src/lib/cloudSync.ts');
  eq('  a character is an ID and a name', sanitizeChars({ 900001: { name: 'Miner Two' } }), { 900001: { name: 'Miner Two' } });
  eq('    with a clone state, when you set one by hand', sanitizeChars({ 900001: { name: 'Miner Two', clone: 'alpha' } }), { 900001: { name: 'Miner Two', clone: 'alpha' } });
  eq('    an unknown clone state is dropped, the character kept', sanitizeChars({ 900001: { name: 'Miner Two', clone: 'gamma' } }), { 900001: { name: 'Miner Two' } });
  eq('  what isn\'t one is left out', sanitizeChars({ abc: { name: 'x' }, 900002: { name: '' }, 900003: null, 900004: 'Miner', 900005: { name: 'Kept' } }), { 900005: { name: 'Kept' } });
  eq('  nothing, an array or a string is no characters', [sanitizeChars(null), sanitizeChars([1]), sanitizeChars('x')], [{}, {}, {}]);
  eq('  a long name is cut, not refused', sanitizeChars({ 1: { name: 'x'.repeat(100) } })[1].name.length, 64);
  eq('  it is a synced document', [isDocKey('chars'), DOC_KEYS.includes('chars')], [true, true]);
  const base = { settings: {}, meta: {}, prefs: {}, chars: {} };
  eq('  one that comes down replaces the one here', applyPulled(base, { records: [], docs: [{ key: 'chars', d: { 900001: { name: 'Miner Two' } } }] }).chars, { 900001: { name: 'Miner Two' } });
  eq('  and goes up with a first upload', everything({ chars: { 900001: { name: 'Miner Two' } } }).docs.includes('chars'), true);
}
```

- [ ] **Step 2: Run and see it fail**

Run: `npm run check`

Expected: `sanitizeChars is not a function`.

- [ ] **Step 3: The sanitizer**

In `src/lib/prefs.ts`, above `/** The motion setting in force:`, add:

```ts
/**
 * Which characters are yours besides the one logged in: alts the cloud reads (docs/notes/characters.md). A character's
 * ID to its name, and a clone state set by hand for one ESI can't tell apart. It is the only thing about an alt the
 * main's ledger holds: who is yours, never a record of theirs. It is a document of its own, not a field of `prefs`:
 * sanitizePrefs keeps only the fields it knows, so an app version behind would have dropped it on its next save.
 */
export type CharsDoc = Record<string, { name: string; clone?: 'alpha' | 'omega' }>;

export function sanitizeChars(v: unknown): CharsDoc {
  const out: CharsDoc = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, x] of Object.entries(v as Record<string, unknown>)) {
    const c = x as { name?: unknown; clone?: unknown } | null;
    if (!/^\d{1,15}$/.test(id) || !c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name.trim()) continue;
    out[id] = { name: c.name.slice(0, 64), ...(c.clone === 'alpha' || c.clone === 'omega' ? { clone: c.clone } : {}) };
  }
  return out;
}
```

- [ ] **Step 4: The store**

In `src/lib/store.ts`:

Change the `prefs` import to:

```ts
import { DEFAULT_ALERTS, DEFAULT_PREFS, sanitizeAlerts, sanitizeChars, sanitizeLeave, sanitizeNotSnipes, sanitizePrefs, sanitizeSafetyTimes, type CharsDoc, type SafetyTimesDoc } from './prefs';
```

In the `Data` type, after the `safetyTimes` field, add:

```ts
  /**
   * Which characters are yours besides this one: alts the cloud reads (prefs.ts, CharsDoc). Who they are, never a
   * record of theirs: an alt's data lives in a database of its own (altStore.ts).
   */
  chars: CharsDoc;
```

In `KEYS`, add `'chars'` at the end of the list. In `empty()`, add `chars: {}` to the returned object.

In `initStore`, after `data.plans = sanitizePlans(data.plans);`, add:

```ts
  data.chars = sanitizeChars(data.chars);
```

In `importAll`, replace:

```ts
  for (const k of KEYS) (p as Record<string, unknown>)[k] = incoming[k] !== undefined ? incoming[k] : base[k];
```

with:

```ts
  for (const k of KEYS) (p as Record<string, unknown>)[k] = incoming[k] !== undefined ? incoming[k] : base[k];
  // Which characters are yours is about the cloud's roster, not about this ledger's trades: a backup from before
  // there were any says nothing of them, and must not turn past transfers to them back into donations.
  if (incoming.chars === undefined) delete p.chars; else p.chars = sanitizeChars(p.chars);
```

Before `export function useData()`, add:

```ts
/**
 * Adds characters the cloud's roster lists to `chars`, and corrects their names. The only way the alt store
 * (altStore.ts) reaches this ledger: it hands over who is yours, and nothing else it holds. Never removes one: a
 * character taken off the roster is still yours, and what you sent it stays a transfer.
 */
export function mergeChars(found: { charId: number; name: string | null }[]): void {
  const next: CharsDoc = { ...data.chars };
  let changed = false;
  for (const f of found) {
    const id = String(f.charId);
    const name = f.name ?? next[id]?.name ?? `Character ${f.charId}`;
    if (next[id]?.name !== name) { next[id] = { ...next[id], name }; changed = true; }
  }
  if (changed) update({ chars: next });
}

/** Run when everything is wiped (clearAll): for state kept beside the ledger, like the alts' copy. */
const clearHooks = new Set<() => Promise<void> | void>();
export function onClearAll(fn: () => Promise<void> | void): () => void {
  clearHooks.add(fn);
  return () => { clearHooks.delete(fn); };
}
```

In `clearAll`, after the `cacheStore` keys are deleted and before `data = empty();`, add:

```ts
  await Promise.all([...clearHooks].map((h) => h()));
```

- [ ] **Step 5: The cloud copy**

In `src/lib/cloudSync.ts`, replace the `DOC_KEYS` line:

```ts
export const DOC_KEYS = ['settings', 'meta', 'prefs', 'alerts', 'stock', 'skills', 'ignored', 'nearDone', 'unusualOk', 'leave', 'safetyTimes', 'notSnipes', 'plans'] as const;
```

with:

```ts
export const DOC_KEYS = ['settings', 'meta', 'prefs', 'alerts', 'stock', 'skills', 'ignored', 'nearDone', 'unusualOk', 'leave', 'safetyTimes', 'notSnipes', 'plans', 'chars'] as const;
```

In `src/lib/cloud.ts`, change the `prefs` import to include `sanitizeChars`:

```ts
import { sanitizeAlerts, sanitizeChars, sanitizeLeave, sanitizeNotSnipes, sanitizePrefs, sanitizeSafetyTimes } from './prefs';
```

and in `pullNow`, after `if (p.plans) p.plans = sanitizePlans(p.plans);`, add:

```ts
        if (p.chars) p.chars = sanitizeChars(p.chars);
```

(The Worker has accepted a `chars` document since stage 1.)

- [ ] **Step 6: Run the tests, the build and the pages**

Run: `npm run check && npm run build && npm run check-pages`

Expected: both `all passed`; the build clean; every page passing (the store gained a key: an empty, a small and a large ledger all load).

- [ ] **Step 7: Commit**

```bash
git add src/lib/prefs.ts src/lib/store.ts src/lib/cloudSync.ts src/lib/cloud.ts scripts/check.mjs
git commit -F - <<'EOF'
Several characters: the main's ledger learns which characters are yours, and nothing else about them

An alt's data will live in a database of its own in the browser, read from the cloud. The main's ledger needs one
thing about alts all the same: who they are, so that ISK sent to one can be told from a donation on any device,
before the alt store has loaded, and after an alt has been taken off the roster. That is `chars`: a character's ID
to its name, and a clone state set by hand for one ESI can't tell apart.

It is a synced document of its own rather than a field of prefs: sanitizePrefs keeps only the fields it knows, so
an app version behind would have dropped it on its next save. It is cleaned on load, on import and on pull like
the others. An imported backup that has no `chars` leaves the present one: the list is about the cloud's roster,
not about the ledger being restored.

mergeChars is the only way the alt store will reach this ledger (it adds and renames, never removes), and
onClearAll lets state kept beside the ledger be wiped with it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 2: The roster's pure rules, the cloud's alt routes, and the alt store

**Files:**
- Modify: `src/lib/roster.ts` (append), `src/lib/cloud.ts` (`call`, `keepCloudLogin`, new exports)
- Create: `src/lib/altStore.ts`
- Test: `scripts/check.mjs`

**Interfaces:**
- Consumes: `mergeChars`, `onClearAll`, `dataGeneration` (Task 1 and `store.ts`); `CloneState` (`roster.ts`, stage 1).
- Produces (`src/lib/roster.ts`): `type RosterEntry`, `type AltSaved`, `type AltPage`, `emptyAlt()`, `applyAltPull(saved, page)`, `type CharFacts`, `charFacts(meta, points, now)`, `altFacts(saved, now)`, `lastRead(entry)`, `loginState(entry, wanted)`, `failingJobs(entry)`.
- Produces (`src/lib/cloud.ts`): `type KeptLogin = { purpose: string; as?: 'main' | 'mailer' | 'alt'; charId: number; name: string }`; `keepCloudLogin(k: { purpose: 'main' | 'mailer' | 'alt'; refreshToken: string }): Promise<KeptLogin>`; `cloudAlts(): Promise<RosterEntry[]>`; `cloudAltPull(altId, since, after): Promise<AltPage>`; `cloudAltRead(altId): Promise<{ trades: number; journal: number; orders: number; clone: string | null }>`; `cloudRemoveAlt(altId, data: 'keep' | 'delete'): Promise<{ removed: number; data: string }>`. An `Error` thrown by a cloud call carries `status?: number`.
- Produces (`src/lib/altStore.ts`): `type AltsState = { ready: boolean; roster: RosterEntry[]; rosterAt: number | null; alts: Record<number, AltSaved>; error: string | null; behind: boolean; busy: boolean }`; `useAlts(): AltsState`; `refreshAlts(): Promise<void>`; `startAlts(): () => void`.

- [ ] **Step 1: Write the failing tests**

In `scripts/check.mjs`, inside the "which characters are yours" section from Task 1, add at its end:

```js
  const R = await import('../src/lib/roster.ts');
  const NOW2 = Date.parse('2026-10-01T15:00:00Z');
  const H = 3600_000;

  // An alt's pull, a page at a time.
  const page1 = { rev: 7, next: '5|txs|b', records: [{ k: 'txs', i: 'a', d: { q: 1 } }, { k: 'txs', i: 'b', d: { q: 2 } }], docs: [{ key: 'meta', d: { walletBalance: 5 } }] };
  const page2 = { rev: 7, next: null, records: [{ k: 'txs', i: 'a', d: null }, { k: 'mining', i: 'm', d: { qty: 3 } }], docs: [] };
  const half = R.applyAltPull(R.emptyAlt(), page1);
  eq('  a pull\'s first page is kept, and the revision waits for the last', [half.rev, Object.keys(half.records.txs), half.docs.meta], [0, ['a', 'b'], { walletBalance: 5 }]);
  const whole = R.applyAltPull(half, page2);
  eq('    the last page moves it, removes what was removed, and adds the rest', [whole.rev, Object.keys(whole.records.txs), Object.keys(whole.records.mining)], [7, ['b'], ['m']]);
  eq('    and what was stored before isn\'t changed in place', Object.keys(half.records.txs), ['a', 'b']);

  // What a card shows.
  const meta = {
    walletBalance: 4_200_000, walletAt: '2026-10-01T14:00:00Z', totalSp: 1_200_000, cloneDetected: 'alpha', cloneSince: '2026-09-29T10:00:00Z',
    skillQueue: [
      { skillId: 3386, level: 3, finish: '2026-10-01T10:00:00Z' },
      { skillId: 3386, level: 4, finish: '2026-10-02T15:00:00Z' },
      { skillId: 3380, level: 4, finish: '2026-10-05T15:00:00Z' },
    ],
  };
  const points = [{ date: '2026-09-30', total: 11e6 }, { date: '2026-10-01', total: 12e6 }, { date: '2026-09-29', total: 9e6 }];
  const f = R.charFacts(meta, points, NOW2);
  eq('  a card\'s wallet, and when it was read', [f.wallet, f.walletAt], [4_200_000, '2026-10-01T14:00:00Z']);
  eq('  its net worth is the newest daily point, with its date', f.netWorth, { date: '2026-10-01', total: 12e6 });
  eq('  the skill in training is the first the queue hasn\'t finished', f.training, { skillId: 3386, level: 4, finish: '2026-10-02T15:00:00Z' });
  eq('  and the queue ends with its last', f.queueEnds, '2026-10-05T15:00:00Z');
  eq('  its clone state, and since when', [f.clone, f.cloneSince], ['alpha', '2026-09-29T10:00:00Z']);
  const none = R.charFacts(undefined, [], NOW2);
  eq('  a character nothing has been read for: nothing, not zeros', none, { wallet: null, walletAt: null, netWorth: null, clone: 'unknown', cloneSince: null, training: null, queueEnds: null, totalSp: null });
  eq('  a queue that has all finished is no training', R.charFacts({ skillQueue: [{ skillId: 1, level: 1, finish: '2026-09-01T00:00:00Z' }] }, [], NOW2).training, null);
  eq('  a paused queue (no finish time) still names its skill', R.charFacts({ skillQueue: [{ skillId: 9, level: 2, finish: null }] }, [], NOW2).training, { skillId: 9, level: 2, finish: null });
  eq('  an alt\'s facts come from its stored copy', R.altFacts({ rev: 3, records: { netWorth: { '2026-10-01': { date: '2026-10-01', total: 5 } } }, docs: { meta: { walletBalance: 7 } } }, NOW2).netWorth, { date: '2026-10-01', total: 5 });

  // The roster entry: when it was last read, and the state of its login.
  const entry = {
    charId: 900001, name: 'Miner Two', addedAt: NOW2 - 5 * 24 * H, scopes: ['a', 'b'], at: NOW2 - H, refusedAt: null, refused: null, rev: 3, ship: 32880, shipAt: NOW2 - 600_000,
    jobs: [
      { job: 'archive', lastRun: NOW2 - H, lastOk: NOW2 - H, lastError: null },
      { job: 'sheet', lastRun: NOW2 - H / 2, lastOk: NOW2 - H / 2, lastError: null },
      { job: 'mining', lastRun: NOW2 - 600_000, lastOk: NOW2 - 2 * H, lastError: 'ESI 502' },
    ],
  };
  eq('  last read: the newer of its copy and its sheet', R.lastRead(entry), NOW2 - H / 2);
  eq('    never, before either has run', R.lastRead({ ...entry, jobs: [] }), null);
  eq('  a job that failed since it last worked is failing', R.failingJobs(entry).map((j) => j.job), ['mining']);
  eq('  a login with every permission asked for', R.loginState(entry, ['a', 'b']), { state: 'working', missing: [] });
  eq('    one lacking some names them', R.loginState(entry, ['a', 'b', 'c']), { state: 'working', missing: ['c'] });
  eq('    one EVE refused', R.loginState({ ...entry, refusedAt: NOW2 - H, refused: 'invalid_grant' }, ['a']).state, 'refused');
  eq('    none kept', R.loginState({ ...entry, at: null, scopes: [] }, ['a']).state, 'none');

  // Alt data has no path into the main's ledger.
  const fs2 = await import('node:fs');
  const src = (p) => fs2.readFileSync(new URL(p, import.meta.url), 'utf8');
  const fromStore = /import\s*\{([^}]*)\}\s*from\s*'\.\/store'/.exec(src('../src/lib/altStore.ts'));
  eq('  the alt store takes three things from the ledger\'s store, and update is not one', fromStore[1].split(',').map((x) => x.trim()).sort(), ['dataGeneration', 'mergeChars', 'onClearAll']);
```

- [ ] **Step 2: Run and see it fail**

Run: `npm run check`

Expected: `R.applyAltPull is not a function`.

- [ ] **Step 3: The pure rules**

Append to `src/lib/roster.ts`:

```ts
// --- In the browser: the roster as the cloud lists it, and an alt's copy ------------------------------------------

/** One alt as the cloud's roster lists it (GET /v1/alts): its login (never the token), its jobs, its ship when last read. */
export type RosterEntry = {
  charId: number; name: string | null; addedAt: number;
  /** The permissions its login carries; `at`: when the login last worked (null: none kept). */
  scopes: string[]; at: number | null; refusedAt: number | null; refused: string | null;
  /** The newest revision of its cloud copy: the browser pulls only when this has moved. */
  rev: number;
  ship: number | null; shipAt: number | null;
  jobs: { job: string; lastRun: number; lastOk: number | null; lastError: string | null }[];
};

/** An alt's cloud copy as this browser keeps it: its records by kind and ID, its documents, the revision reached. */
export type AltSaved = { rev: number; records: Record<string, Record<string, unknown>>; docs: Record<string, unknown> };
export const emptyAlt = (): AltSaved => ({ rev: 0, records: {}, docs: {} });

/** One page of GET /v1/alts/<id>/pull. `next` is the cursor for the page after it, null on the last. */
export type AltPage = { rev: number; next: string | null; records: { k: string; i: string; d: unknown }[]; docs: { key: string; d: unknown }[] };

/**
 * An alt's copy with one page of a pull applied. The revision moves only with the last page (`next` null): a pull cut
 * off halfway is then asked for again from the revision it started at, and the pages already applied are applied
 * again, which changes nothing. Returns a new copy; the one passed in is left as it was.
 */
export function applyAltPull(saved: AltSaved, page: AltPage): AltSaved {
  const records = { ...saved.records };
  const copied = new Set<string>();
  for (const r of page.records) {
    if (!copied.has(r.k)) { records[r.k] = { ...(records[r.k] ?? {}) }; copied.add(r.k); }
    if (r.d == null) delete records[r.k][r.i]; else records[r.k][r.i] = r.d;
  }
  const docs = { ...saved.docs };
  for (const x of page.docs) docs[x.key] = x.d;
  return { rev: page.next ? saved.rev : page.rev, records, docs };
}

/** What a character's card shows. Null where nothing has been read: a card never shows a zero for "not known". */
export type CharFacts = {
  wallet: number | null; walletAt: string | null;
  /** The newest daily net-worth point, with its date. */
  netWorth: { date: string; total: number } | null;
  clone: CloneState; cloneSince: string | null;
  /** The first level the queue hasn't finished (`finish` null while the queue is paused), and when the queue ends. */
  training: { skillId: number; level: number; finish: string | null } | null;
  queueEnds: string | null;
  totalSp: number | null;
};

type MetaLike = {
  walletBalance?: number; walletAt?: string; totalSp?: number; cloneDetected?: 'alpha' | 'omega'; cloneSince?: string;
  skillQueue?: { skillId: number; level: number; finish: string | null }[];
};

/** A character's card facts from its `meta` document and its net-worth points: the main's or an alt's alike. */
export function charFacts(meta: MetaLike | undefined, points: { date: string; total: number }[], now: number): CharFacts {
  const m = meta ?? {};
  const latest = [...points].sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null;
  const left = (m.skillQueue ?? []).filter((q) => !q.finish || Date.parse(q.finish) > now);
  const first = left[0];
  return {
    wallet: m.walletBalance ?? null, walletAt: m.walletAt ?? null,
    netWorth: latest ? { date: latest.date, total: latest.total } : null,
    clone: m.cloneDetected ?? 'unknown', cloneSince: m.cloneSince ?? null,
    training: first ? { skillId: first.skillId, level: first.level, finish: first.finish ?? null } : null,
    queueEnds: left.length ? left[left.length - 1].finish ?? null : null,
    totalSp: m.totalSp ?? null,
  };
}

export const altFacts = (saved: AltSaved, now: number): CharFacts =>
  charFacts(saved.docs.meta as MetaLike | undefined, Object.values(saved.records.netWorth ?? {}) as { date: string; total: number }[], now);

/** When the cloud last read an alt in full: the newer of its copy (`archive`) and its sheet. Null before either has run. */
export function lastRead(e: RosterEntry): number | null {
  const at = Math.max(0, ...e.jobs.filter((j) => j.job === 'archive' || j.job === 'sheet').map((j) => j.lastOk ?? 0));
  return at || null;
}

/** The jobs that have failed since they last worked. */
export const failingJobs = (e: RosterEntry) => e.jobs.filter((j) => j.lastError && (j.lastOk ?? 0) < j.lastRun);

/**
 * The state of an alt's login: refused by EVE, none kept, or working. `missing`: the permissions the app asks for
 * today that this login was handed over without (it keeps working; what needs them doesn't, until it's handed over again).
 */
export function loginState(e: RosterEntry, wanted: string[]): { state: 'working' | 'refused' | 'none'; missing: string[] } {
  if (e.refusedAt != null) return { state: 'refused', missing: [] };
  if (e.at == null) return { state: 'none', missing: [] };
  return { state: 'working', missing: wanted.filter((s) => !e.scopes.includes(s)) };
}
```

- [ ] **Step 4: The cloud's alt routes, from the browser**

In `src/lib/cloud.ts`:

Add to the type imports at the top:

```ts
import type { AltPage, RosterEntry } from './roster';
```

In `call`, replace:

```ts
  if (!res.ok) throw new Error(body.error ?? `The cloud answered ${res.status}`);
```

with:

```ts
  if (!res.ok) {
    // The status rides on the error: a 404 from a route the Worker doesn't have yet means it's a version behind.
    const err = new Error(body.error ?? `The cloud answered ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
```

Replace `keepCloudLogin` (its doc comment and body) with:

```ts
/** What the cloud kept a handed-over login as. `as` is missing from a Worker a version behind: then it is `purpose`. */
export type KeptLogin = { purpose: string; as?: 'main' | 'mailer' | 'alt'; charId: number; name: string };

/**
 * Hands a login to the cloud for its background jobs. The Worker refreshes it once to prove it works and keeps it
 * encrypted; this browser keeps nothing. For an alt, EVE's page picks the character, so the answer says what it was
 * kept as: the main's login or the sender's when one of those came back, and nothing is added (Worker: keepHandedOver).
 */
export async function keepCloudLogin(k: { purpose: 'main' | 'mailer' | 'alt'; refreshToken: string }): Promise<KeptLogin> {
  const res = await call<{ kept: KeptLogin }>('/v1/keys', { method: 'POST', body: JSON.stringify({ purpose: k.purpose, refreshToken: k.refreshToken }) });
  return res.kept;
}
```

After `dropCloudLogin`, add:

```ts
// Alts: the owner's other characters, read by the cloud and filed under their own IDs (docs/notes/characters.md).
// These routes are new paths: a Worker a version behind answers 404 (the error's `status`).

/** The roster: each alt's login (never the token), its jobs, its revision, its ship when last read. */
export const cloudAlts = () => call<RosterEntry[]>('/v1/alts');
/** One page of an alt's cloud copy changed since a revision. */
export const cloudAltPull = (altId: number, since: number, after: string | null) =>
  call<AltPage>(`/v1/alts/${altId}/pull?since=${since}${after ? `&after=${encodeURIComponent(after)}` : ''}`);
/** Runs an alt's full read now instead of at :37: right after adding one, it proves the login end to end. */
export const cloudAltRead = (altId: number) =>
  call<{ trades: number; journal: number; orders: number; clone: string | null }>(`/v1/alts/${altId}/read`, { method: 'POST' });
/** Takes an alt off the roster; its login is revoked at EVE. `keep` leaves what was read, `delete` removes it. */
export const cloudRemoveAlt = (altId: number, data: 'keep' | 'delete') =>
  call<{ removed: number; data: string }>(`/v1/alts/${altId}?data=${data}`, { method: 'DELETE' });
```

- [ ] **Step 5: The alt store**

Create `src/lib/altStore.ts`:

```ts
/**
 * The alts' copy in this browser, read-only. An alt (a character on another of your accounts) is read by the cloud
 * and never logs in here; this keeps what the cloud holds for each, in an IndexedDB database of its own, so the
 * Characters page draws at once and with the cloud out of reach.
 *
 * Nothing here writes an alt's record to the ledger. From the ledger's store it takes three things and no more:
 * `mergeChars` (who is yours: an ID and a name), `dataGeneration` (so a wipe isn't undone by a pull in flight) and
 * `onClearAll`. It does not import `update`, and a test keeps it that way (scripts/check.mjs).
 */
import { useSyncExternalStore } from 'react';
import { clear, createStore, del, get, keys, set } from 'idb-keyval';
import { cloudAltPull, cloudAlts, cloudEnabled } from './cloud';
import { applyAltPull, emptyAlt, type AltSaved, type RosterEntry } from './roster';
import { dataGeneration, mergeChars, onClearAll } from './store';

const db = createStore('jita-ledger-alts', 'kv');
const ROSTER = 'roster';
const altKey = (id: number) => `alt:${id}`;
/** The roster is read this often while the app is open; an alt is pulled only when its revision has moved. */
const EVERY_MS = 60_000;

export type AltsState = {
  /** What was stored has been loaded. */
  ready: boolean;
  roster: RosterEntry[];
  /** When the roster was last read from the cloud (from disk after a reload: what's shown may be that old). */
  rosterAt: number | null;
  alts: Record<number, AltSaved>;
  error: string | null;
  /** The Worker answered "not found": it is a version behind and doesn't know alts yet. */
  behind: boolean;
  busy: boolean;
};

let state: AltsState = { ready: false, roster: [], rosterAt: null, alts: {}, error: null, behind: false, busy: false };
const listeners = new Set<() => void>();
const setState = (p: Partial<AltsState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
// One subscribe function for good: an inline one is new each render, and React would resubscribe every time.
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useAlts = (): AltsState => useSyncExternalStore(subscribe, () => state);

async function load(): Promise<void> {
  const saved = (await get(ROSTER, db).catch(() => undefined)) as { at: number; list: RosterEntry[] } | undefined;
  const alts: Record<number, AltSaved> = {};
  for (const k of (await keys(db).catch(() => [])) as string[]) {
    const m = /^alt:(\d+)$/.exec(String(k));
    const v = m ? ((await get(k, db).catch(() => undefined)) as AltSaved | undefined) : undefined;
    if (m && v) alts[Number(m[1])] = v;
  }
  setState({ ready: true, roster: saved?.list ?? [], rosterAt: saved?.at ?? null, alts });
}

let running: Promise<void> | null = null;
/** Read the roster, and pull each alt whose revision has moved. One at a time: a second call joins the first. */
export function refreshAlts(): Promise<void> {
  running ??= read().finally(() => { running = null; });
  return running;
}

async function read(): Promise<void> {
  if (!cloudEnabled()) return;
  const gen = dataGeneration();
  setState({ busy: true });
  try {
    const roster = await cloudAlts();
    // Everything was wiped while this was in flight: putting the roster back would undo it.
    if (dataGeneration() !== gen) return;
    const alts = { ...state.alts };
    for (const id of Object.keys(alts).map(Number)) {
      if (roster.some((r) => r.charId === id)) continue;
      delete alts[id];
      await del(altKey(id), db).catch(() => undefined);
    }
    for (const r of roster) {
      let saved = alts[r.charId] ?? emptyAlt();
      if (saved.rev === r.rev) continue;
      // A revision below the one held can't be pulled from: start that alt's copy again.
      if (r.rev < saved.rev) saved = emptyAlt();
      let after: string | null = null;
      for (;;) {
        const page = await cloudAltPull(r.charId, saved.rev, after);
        saved = applyAltPull(saved, page);
        if (!page.next) break;
        after = page.next;
      }
      if (dataGeneration() !== gen) return;
      alts[r.charId] = saved;
      await set(altKey(r.charId), saved, db).catch(() => undefined);
    }
    const at = Date.now();
    await set(ROSTER, { at, list: roster }, db).catch(() => undefined);
    setState({ roster, rosterAt: at, alts, error: null, behind: false });
    // Who is yours, and nothing else, reaches the ledger.
    mergeChars(roster.map((r) => ({ charId: r.charId, name: r.name })));
  } catch (e) {
    const status = (e as { status?: number }).status;
    setState({ error: e instanceof Error ? e.message : String(e), behind: status === 404 });
  } finally {
    setState({ busy: false });
  }
}

onClearAll(async () => {
  await clear(db).catch(() => undefined);
  setState({ roster: [], rosterAt: null, alts: {}, error: null, behind: false });
});

/** Loads what's stored, reads the cloud, and keeps reading while the tab is in view. Returns the stop function. */
export function startAlts(): () => void {
  load().then(() => refreshAlts()).catch(() => undefined);
  const tick = setInterval(() => { if (document.visibilityState === 'visible') refreshAlts().catch(() => undefined); }, EVERY_MS);
  const onVisible = () => { if (document.visibilityState === 'visible') refreshAlts().catch(() => undefined); };
  document.addEventListener('visibilitychange', onVisible);
  return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
}
```

- [ ] **Step 6: Run the tests and the build**

Run: `npm run check; npm run build`

Expected: both `all passed`; the build clean. If `tsc` reports `clear` is not exported by `idb-keyval`, check `node_modules/idb-keyval/dist/index.d.ts`: it exports `clear(customStore?)`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/roster.ts src/lib/cloud.ts src/lib/altStore.ts scripts/check.mjs
git commit -F - <<'EOF'
Several characters: the alts' copy in the browser, read-only and in a database of its own

The cloud has read and served alts since stage 1. This is the browser's side of it, before any page: what the
roster and an alt's pulled rows look like, how a pull is applied, and where they are kept.

The alt store keeps the roster and each alt's rows in its own IndexedDB database. It reads the roster every
minute while the tab is in view and pulls an alt only when its revision has moved, so ten alts are one request a
minute, not ten. A pull's revision moves only with its last page, so one cut off halfway is asked for again from
where it started. A wipe of the ledger clears it and discards a pull in flight.

What keeps an alt's data out of the main's ledger is that the alt store cannot write to it: it imports
mergeChars, dataGeneration and onClearAll from the ledger's store, and not update. A test reads the import and
fails if that changes.

cloud.ts gains the alt routes and puts the HTTP status on its errors: /v1/alts answering 404 is how a page tells a
Worker that is a version behind from one that failed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 3: The one new login, and what the app does when it comes back

**Files:**
- Modify: `src/lib/auth.ts` (the `Purpose` type, a new export, `handleCallback`), `src/App.tsx` (the boot effect; starting the alt store)
- Test: `npm run check` and `npm run build` (this task adds no pure rule; its behaviour is checked in the browser in Task 4 and with a real login in Task 5)

**Interfaces:**
- Consumes: `keepCloudLogin`, `KeptLogin`, `cloudAltRead` (Task 2); `refreshAlts`, `startAlts` (Task 2).
- Produces (`src/lib/auth.ts`): `loginAltForCloud(): Promise<void>`; `handleCallback()` returning `cloudKey?: { purpose: 'main' | 'mailer' | 'alt'; refreshToken: string; name: string; charId: number }`.

- [ ] **Step 1: The login purpose**

In `src/lib/auth.ts`:

Replace:

```ts
type Purpose = 'main' | 'mailer' | 'cloud' | 'cloud-mailer';
```

with:

```ts
type Purpose = 'main' | 'mailer' | 'cloud' | 'cloud-mailer' | 'cloud-alt';
```

and its comment's first sentence, "Which login a redirect was for. The two `cloud` ones never stay in this browser", with "Which login a redirect was for. The three `cloud` ones never stay in this browser".

After `loginMailerForCloud`, add:

```ts
/**
 * A login for the cloud to read another of your characters with (an alt: docs/notes/characters.md). The same
 * permissions as the trading login, so the cloud's readers work on it unchanged. EVE's page picks the character: it
 * asks for an account, then which of its characters, and remembers the account last used. The cloud sorts out who
 * came back.
 */
export const loginAltForCloud = () => startLogin('cloud-alt', [...SCOPES, ...askedScopes()]);
```

Change `handleCallback`'s return type and its cloud branch. Replace the signature line:

```ts
export async function handleCallback(): Promise<{ handled: boolean; error?: string; cloudKey?: { purpose: 'main' | 'mailer'; refreshToken: string; name: string } }> {
```

with:

```ts
export async function handleCallback(): Promise<{ handled: boolean; error?: string; cloudKey?: { purpose: 'main' | 'mailer' | 'alt'; refreshToken: string; name: string; charId: number } }> {
```

and replace:

```ts
    if (saved.purpose === 'cloud' || saved.purpose === 'cloud-mailer') {
      return { handled: true, cloudKey: { purpose: saved.purpose === 'cloud' ? 'main' : 'mailer', refreshToken: got.refreshToken, name: got.characterName } };
    }
```

with:

```ts
    // For the cloud: hand the refresh token on, and keep nothing here. An alt's above all: a purpose this didn't
    // know would fall through to the trading login's slot below, and the owner check would then log the owner out.
    if (saved.purpose === 'cloud' || saved.purpose === 'cloud-mailer' || saved.purpose === 'cloud-alt') {
      const purpose = saved.purpose === 'cloud' ? 'main' : saved.purpose === 'cloud-mailer' ? 'mailer' : 'alt';
      return { handled: true, cloudKey: { purpose, refreshToken: got.refreshToken, name: got.characterName, charId: got.characterId } };
    }
```

(and delete the old one-line comment `// For the cloud: hand the refresh token on, and keep nothing here.` that stood above the replaced block, since the new comment says it.)

- [ ] **Step 2: What the app does with it**

In `src/App.tsx`:

Change the imports:

```ts
import { getAuth, getMailer, handleCallback, logout, logoutMailer } from './lib/auth';
```

```ts
import { cloudAltRead, cloudSummary, keepCloudLogin, runCloudArchive, startCloud } from './lib/cloud';
```

and add:

```ts
import { refreshAlts, startAlts } from './lib/altStore';
```

In the boot effect, replace the block from `// A login for the cloud's background jobs goes straight to the Worker; nothing stays here.` down to and including `await initStore();` with:

```ts
      await initStore();
      // A sender logged in to THIS browser that is one of the characters the cloud reads: it can't be both. EVE allows
      // a character one set of permissions, and whichever login came later stopped the other. Checked here, where the
      // list of your characters is loaded; the login itself comes back before the store has.
      const sender = getMailer();
      if (sender && getData().chars[String(sender.characterId)]) {
        await logoutMailer();
        setLoginErr(`${sender.characterName} is one of the characters the cloud reads for you, so it can’t also be logged in here as the mail sender: EVE allows a character one set of permissions, and the later login stops the earlier. It has been logged out here. If its card on the Characters page says its login was refused, hand it over again there.`);
      }
      // A login for the cloud's background jobs goes straight to the Worker; nothing stays here. After the store has
      // loaded, since an alt's hand-over ends by writing which characters are yours.
      if (cb.cloudKey) {
        const asked = cb.cloudKey.purpose;
        const said = (e: unknown) => (e instanceof Error ? e.message : String(e));
        keepCloudLogin(cb.cloudKey)
          .then(async (k) => {
            // What it was kept as. EVE's page picks the character, so an alt's hand-over can come back as the main or
            // the sender; a Worker a version behind doesn't say, and keeps only what was asked for.
            const as = k.as ?? asked;
            const slip = asked === 'alt' && as !== 'alt' ? ' To add a character on another account, sign out on EVE’s login page first, then sign in with that account.' : '';
            if (as === 'mailer') {
              toast(slip ? `That was ${k.name}, your mail sender, not another character. Nothing was added, and it still sends your alert mail.${slip}` : `The cloud will send alert mail from ${k.name}.`, slip ? 'warn' : 'ok');
              return;
            }
            if (as === 'alt') {
              toast(`${k.name} is now one of your characters. The cloud is reading it for the first time…`);
              try {
                const r = await cloudAltRead(k.charId);
                toast(`The cloud has read ${k.name}: ${units(r.trades)} trades, ${units(r.journal)} journal entries, ${units(r.orders)} orders${r.clone ? `, ${r.clone === 'alpha' ? 'Alpha' : r.clone === 'omega' ? 'Omega' : 'clone state not told apart'}` : ''}. It reads it every hour from now, and its mining every ten minutes.`);
              } catch (e) {
                toast(`The cloud keeps ${k.name}’s login, but its first read failed: ${said(e)}`, 'err');
              }
              await refreshAlts().catch(() => undefined);
              return;
            }
            // The main's login: run the ledger copy straight away rather than at 7 past the hour. It proves the login
            // end to end, and replaces the error an earlier login left on it (and on the orders read) with what happens now.
            if (slip) toast(`That was ${k.name}, your main, not another character. Nothing was added; the cloud’s login for it was renewed, and it keeps watch as ${k.name}.${slip}`, 'warn');
            try {
              const r = await runCloudArchive();
              if (!slip) toast(`The cloud now keeps watch as ${k.name}, with this app closed too. It has just read your ledger: ${r.trades || r.journal || r.orders ? `${units(r.trades)} new trades, ${units(r.journal)} journal entries, ${units(r.orders)} order changes` : 'nothing new'}.`);
            } catch (e) {
              toast(`The cloud keeps watch as ${k.name}, but its first read failed: ${said(e)}`, 'err');
            }
            await cloudSummary().catch(() => undefined);
          })
          .catch((e) => toast(
            `The cloud couldn’t keep that login: ${said(e)}${asked === 'mailer' && /one of your characters/.test(said(e)) ? ' To send mail from that character instead, remove it on the Characters page first, then log it in as the sender.' : ''}`, 'err'));
      }
```

(The old block's `keepCloudLogin(cb.cloudKey)` chain and the `await initStore();` line that followed it are what this replaces: the chain now starts after the store has loaded, and handles three outcomes instead of two.)

After the line `useEffect(() => { if (live) return startCloud(); }, [live]);`, add:

```ts
  // The alts' copy: the roster and each alt's rows, read from the cloud into a database of their own (altStore.ts).
  useEffect(() => { if (live) return startAlts(); }, [live]);
```

- [ ] **Step 3: Run the tests and the build**

Run: `npm run check && npm run build`

Expected: both `all passed`; the build clean.

- [ ] **Step 4: Check the main's and the sender's flows are untouched, by reading**

Run: `git diff -- src/lib/auth.ts`

Expected: the diff touches only the `Purpose` type and its comment, the new `loginAltForCloud`, and `handleCallback`'s signature and cloud branch. `login`, `loginMailer`, `loginForCloud`, `loginMailerForCloud`, the `mailer` branch and the final `writeAuth(got)` are unchanged lines.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/App.tsx
git commit -F - <<'EOF'
Several characters: the one new login, handing an alt to the cloud

An alt never logs in to the app. Its login is asked for with a new purpose, cloud-alt, carrying the trading
login's permissions, and handleCallback hands its refresh token on for the Worker and stores nothing: a purpose it
didn't know fell through to the trading login's slot, where the owner check would have logged the owner out. The
main's and the sender's own logins are untouched.

EVE's page picks the character, so the Worker says what it kept the login as, and the app says so in words. An
alt: it is read at once (POST /v1/alts/<id>/read), which proves the login end to end, and the toast says what came
back. The main or the mail sender, picked by mistake while still signed in to the main account at EVE: nothing was
added, that login was renewed, and how to get to another account's characters.

The hand-over now starts after the store has loaded, since an alt's ends by recording which characters are yours.
And a sender logged in to this browser that turns out to be one of your alts is logged out again with what
happened: EVE allows a character one set of permissions, so that login has stopped the alt's.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 4: The Characters page

**Files:**
- Create: `src/components/Characters.tsx`
- Modify: `src/components/shell/nav.ts`, `src/App.tsx` (the lazy page, `PAGES`, the render chain), `scripts/pages.mjs`, `CLAUDE.md` (the list of pages), `docs/notes/characters.md`, `.claude/rules/characters.md`
- Test: `scripts/check.mjs` (who may import the alt store), `npm run check-pages`, `npm run check-phone`, a look in a browser

**Interfaces:**
- Consumes: `useAlts`, `refreshAlts` (Task 2); `charFacts`, `altFacts`, `lastRead`, `loginState`, `failingJobs`, `CharFacts`, `RosterEntry` (Task 2); `cloudAlts`, `cloudRemoveAlt`, `cloudEnabled`, `setCloudEnabled` (`cloud.ts`); `loginAltForCloud`, `askedScopes` (`auth.ts`); `Data.chars` (Task 1).
- Produces: the page `characters` (`#characters`).

- [ ] **Step 1: The tests, failing**

In `scripts/check.mjs`, inside the "which characters are yours" section, after the assertion about what the alt store imports from the ledger's store, add:

```js
  // Alt data reaches a page only on purpose: a page that starts reading the alt store is added here in the commit that makes it.
  const walk = (dir) => fs2.readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}${e.name}/`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}${e.name}`] : []));
  const users = walk('../src/').filter((p) => /from\s*'[^']*\/altStore'/.test(src(p))).map((p) => p.replace('../src/', '')).sort();
  eq('  and only the shell and the Characters page read the alt store', users, ['App.tsx', 'components/Characters.tsx']);
```

Run: `npm run check`

Expected: FAIL `got ["App.tsx"], want ["App.tsx","components/Characters.tsx"]`.

In `scripts/pages.mjs`:

In `PAGES`, add `'characters'` after `'combat'`:

```js
  'hustles/abyssal', 'hustles/courier', 'hustles/planets', 'hustles/mining', 'hustles/freelance', 'combat', 'characters', 'omega',
```

After the `const ALL = { empty: {}, small: small(), large: large() };` line, add:

```js
// ---- Alts ---------------------------------------------------------------------------------------------------

/**
 * An alt as the browser keeps it (src/lib/altStore.ts): its roster entry, and the rows pulled for it. Three kinds,
 * by `i`: 0 read and well (an Alpha, mid-queue); 1 with a job failing and its clone state not told apart; 2 just
 * added and refused, with nothing read yet, so every figure on its card is "not known".
 */
function alt(charId, name, i) {
  const day = iso(NOW - DAY).slice(0, 10);
  const ok = (job, ago) => ({ job, lastRun: NOW - ago, lastOk: NOW - ago, lastError: null });
  const entry = {
    charId, name, addedAt: NOW - (5 - i) * DAY, scopes: [], at: NOW - 3600_000, refusedAt: i === 2 ? NOW - 7200_000 : null, refused: i === 2 ? 'invalid_grant' : null,
    rev: i === 2 ? 0 : 3, ship: i === 2 ? null : 32880, shipAt: i === 2 ? null : NOW - 600_000,
    jobs: i === 2 ? [] : [ok('archive', 1800_000), ok('sheet', 1700_000),
      i === 1 ? { job: 'mining', lastRun: NOW - 600_000, lastOk: NOW - 7200_000, lastError: 'ESI 502 on /characters/900002/mining/' } : ok('mining', 600_000)],
  };
  const saved = i === 2 ? { rev: 0, records: {}, docs: {} } : {
    rev: 3,
    records: { netWorth: { [day]: { date: day, total: 12.5e6 * (i + 1), wallet: 4.2e6 * (i + 1) } } },
    docs: {
      meta: {
        walletBalance: 4.2e6 * (i + 1), walletAt: iso(NOW - 1700_000), totalSp: 1.2e6,
        ...(i === 0 ? { cloneDetected: 'alpha', cloneSince: iso(NOW - 2 * DAY), activeSkills: { 3386: 4 } } : {}),
        skillQueue: [{ skillId: 3386, level: 4, finish: iso(NOW + 2 * DAY), start: iso(NOW - DAY) }, { skillId: 3380, level: 4, finish: iso(NOW + 6 * DAY) }],
      },
      skills: { 3386: 3, 3380: 3 },
    },
  };
  return { entry, saved };
}
const ALTS = { empty: [], small: [alt(900001, 'Miner Two', 0)], large: [alt(900001, 'Miner Two', 0), alt(900002, 'Miner Three', 1), alt(900003, 'Hauler Four', 2)] };
/** The alt store's database as it would be on disk: the roster as last read, and each alt's copy. */
const altStoreOf = (list) => Object.fromEntries([['roster', { at: NOW - 60_000, list: list.map((a) => a.entry) }], ...list.map((a) => [`alt:${a.entry.charId}`, a.saved])]);
/** Which characters are yours, as the ledger itself holds it. */
const charsOf = (list) => Object.fromEntries(list.map((a) => [a.entry.charId, { name: a.entry.name }]));
```

Give each ledger that has alts its `chars`. Directly after the `charsOf` definition above, add:

```js
for (const [name, list] of Object.entries(ALTS)) if (list.length) ALL[name].chars = charsOf(list);
```

In the seeding `page.evaluate` of the main loop, replace:

```js
      for (const [db, put] of [['jita-ledger', d], ['jita-ledger-cache', {}]]) {
```

with:

```js
      for (const [db, put] of [['jita-ledger', d], ['jita-ledger-cache', {}], ['jita-ledger-alts', alts]]) {
```

and its argument list: replace `}, [data, OWNER_AUTH]);` with `}, [data, OWNER_AUTH, altStoreOf(ALTS[name] ?? [])]);` and the callback's parameter `async ([d, auth]) => {` with `async ([d, auth, alts]) => {`.

After the `PROOF` check block (the `if (PROOF[name]) { … }`), add:

```js
    // And the alts' seed has to have reached the Characters page, or it passes on an empty roster.
    if (ALTS[name]?.length) {
      await page.evaluate(() => { location.hash = '#characters'; });
      await page.waitForTimeout(1000);
      if (!(await page.locator('.page', { hasText: ALTS[name][0].entry.name }).count())) failures.push({ ledger: name, page: 'characters', problems: [`the ${name} ledger's alts didn't load: no “${ALTS[name][0].entry.name}”`] });
    }
```

In the logged-out and stranger run, seed the alt store too and check no alt's name shows. Replace its seeding `page.evaluate` body:

```js
        const h = await new Promise((res) => { const q = indexedDB.open('jita-ledger'); q.onsuccess = () => res(q.result); q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
        await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(d)) st.put(v, k); t.oncomplete = res; });
        h.close();
      }, [ALL.large, auth]);
```

with:

```js
        for (const [db, put] of [['jita-ledger', d], ['jita-ledger-alts', alts]]) {
          const h = await new Promise((res) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
          await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
          h.close();
        }
      }, [ALL.large, auth, altStoreOf(ALTS.large)]);
```

(its callback's parameter becomes `async ([d, a, alts]) => {`), add `'characters'` to the hashes it visits:

```js
      for (const hash of ['wallet', 'orders', 'positions', 'prospects', 'characters', 'settings/data']) {
```

and after `if (await page.locator('body', { hasText: PROOF.large }).count()) problems.push('the ledger showed');` add:

```js
        if (await page.locator('body', { hasText: ALTS.large[0].entry.name }).count()) problems.push('an alt showed');
```

Run: `PAGE=characters npm run check-pages`

Expected: FAIL for the small and large ledgers: `the small ledger's alts didn't load: no “Miner Two”` (the page doesn't exist: an unknown page key shows the Wallet).

- [ ] **Step 2: The page in the rail**

In `src/components/shell/nav.ts`: add `Users` to the `lucide-react` import, add `'characters'` to `PageKey`:

```ts
  | 'positions' | 'orders' | 'loot' | 'blueprints' | 'results' | 'loyalty' | 'hustles' | 'combat' | 'characters' | 'omega' | 'settings';
```

and replace the Pilot group:

```ts
  { label: 'Pilot', items: [{ key: 'combat', label: 'Combat', icon: Swords }, { key: 'omega', label: 'Omega', icon: Gem }, { key: 'settings', label: 'Settings', icon: Settings2 }] },
```

with:

```ts
  {
    label: 'Pilot', items: [
      { key: 'combat', label: 'Combat', icon: Swords }, { key: 'characters', label: 'Characters', icon: Users },
      { key: 'omega', label: 'Omega', icon: Gem }, { key: 'settings', label: 'Settings', icon: Settings2 },
    ],
  },
```

In `src/App.tsx`: after the `Combat` lazy page add

```ts
const Characters = page<object>(() => import('./components/Characters'), 'Characters');
```

add `'characters'` to the `PAGES` set (after `'combat'`), and in the render chain, after `: page === 'combat' ? <Combat />`, add:

```tsx
              : page === 'characters' ? <Characters />
```

- [ ] **Step 3: The page**

Create `src/components/Characters.tsx`:

```tsx
import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react';
import { askedScopes, loginAltForCloud } from '../lib/auth';
import { refreshAlts, useAlts } from '../lib/altStore';
import { cloudAlts, cloudEnabled, cloudRemoveAlt, setCloudEnabled } from '../lib/cloud';
import { SCOPE_INFO, SCOPES } from '../lib/config';
import { chooseAsk } from '../lib/confirm';
import { ago, fmtDate, fmtDateTime, iskBig, until } from '../lib/format';
import { useAuth, useNow } from '../lib/hooks';
import { altFacts, charFacts, failingJobs, lastRead, loginState, type CharFacts, type CloneState, type RosterEntry } from '../lib/roster';
import { ROMAN } from '../lib/skillStatus';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
import { useEnsureNames, useTypeName } from './common';
import { Empty, Flag, Notice, PageHead, Panel, Tiles, type TileData } from './ui';

/**
 * Your characters: the one logged in here, and the alts the cloud reads for you (docs/notes/characters.md). An alt
 * is a character on another of your accounts. It never logs in to the app: its login is handed to the cloud once,
 * from here, and what the cloud reads for it is kept apart from this ledger, under its own name.
 */

const CLONE_SAID: Record<CloneState, string> = { alpha: 'Alpha', omega: 'Omega', unknown: 'Can’t tell' };
const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Wallet, net worth and the skill in training: a figure, or "–" with why, never a zero for "not known". */
function tiles(f: CharFacts, now: number, skill: (id: number) => string, live: boolean): TileData[] {
  const t = f.training;
  return [
    {
      l: 'Wallet', v: f.wallet != null ? iskBig(f.wallet) : '–',
      n: f.wallet == null ? 'Not read yet' : live ? `Read ${ago(f.walletAt ?? undefined, now)}` : `As last changed, ${ago(f.walletAt ?? undefined, now)}`,
      tip: live ? 'The ISK this character holds in game, read every 2 minutes while the app is open.' : 'The ISK this character held when the cloud last read it. The cloud reads it every hour; the time is when the balance last changed.',
    },
    {
      l: 'Net worth', v: f.netWorth ? iskBig(f.netWorth.total) : '–', n: f.netWorth ? `The ${fmtDate(f.netWorth.date)} point` : 'No daily point yet',
      tip: 'Wallet, escrow, stock on sell orders and everything it holds, at CCP’s rough average prices.\n\n• One point a day, kept when it moves by half a percent.\n• This is the newest point; its date is under the figure.\n• The Wallet page works your own out live, so that figure is newer than this one.',
    },
    {
      l: 'Training', v: t ? `${skill(t.skillId)} ${ROMAN[t.level] ?? t.level}` : '–',
      n: !t ? 'Nothing in the queue' : !t.finish ? 'The queue is paused' : `Done ${until(t.finish, now) ?? fmtDateTime(t.finish)}${f.queueEnds && f.queueEnds !== t.finish ? `; the queue ends ${fmtDate(f.queueEnds)}` : ''}`,
    },
  ];
}

function Card(props: {
  id: number; name: string; facts: CharFacts; now: number; skill: (id: number) => string;
  /** The alt's roster entry; absent for the character logged in here. */
  entry?: RosterEntry;
  /** A clone state set by hand, for one ESI can't tell apart. */
  byHand?: 'alpha' | 'omega';
  onClone?: (v: 'alpha' | 'omega' | undefined) => void;
  onHandOver?: () => void; onRemove?: () => void; busy?: boolean;
}) {
  const { id, name, facts, now, entry } = props;
  const [imgOk, setImgOk] = useState(true);
  const login = entry ? loginState(entry, [...SCOPES, ...askedScopes()]) : null;
  const failing = entry ? failingJobs(entry) : [];
  const read = entry ? lastRead(entry) : null;
  const clone: CloneState = facts.clone !== 'unknown' ? facts.clone : props.byHand ?? 'unknown';
  const cloneColor = clone === 'alpha' ? 'var(--acc2)' : clone === 'omega' ? 'var(--acc)' : 'var(--note)';
  return (
    <Panel label={name}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
        <div className="pilot">
          <div className="avatar">{imgOk && <img src={`https://images.evetech.net/characters/${id}/portrait?size=64`} alt="" onError={() => setImgOk(false)} />}</div>
          <div style={{ lineHeight: 1.2, minWidth: 0 }}>
            <div className="pilot-name" style={{ whiteSpace: 'normal' }}>{name}</div>
            <div className="pilot-sub" style={{ whiteSpace: 'normal' }}>{entry ? 'Read by the cloud' : 'Logged in here: this ledger’s character'}</div>
          </div>
        </div>
        <div className="row tight">
          <Flag color={cloneColor} title="Clone state"
            why={facts.clone !== 'unknown'
              ? 'Worked out from its skills: Alpha when a skill is usable below the level trained, Omega when one is usable above what an Alpha may use.'
              : 'ESI has no field for it, and this character has trained nothing past what an Alpha may use, so its skills look the same either way. Say which it is, if you like: it’s a label only.'}>
            {CLONE_SAID[clone]}{facts.clone === 'unknown' && props.byHand ? ' (you said)' : ''}{facts.cloneSince ? ` since ${fmtDate(facts.cloneSince)}` : ''}
          </Flag>
          {login?.state === 'refused' && <Flag color="var(--neg)" title="Login refused" why={`EVE has refused the cloud’s login for ${name} since ${fmtDateTime(entry!.refusedAt!)}${entry!.refused ? ` (${entry!.refused})` : ''}. Nothing is read for it until you hand it over again.`}>Login refused</Flag>}
          {login?.state === 'none' && <Flag color="var(--neg)" title="No login" why="The cloud holds no login for this character, so nothing is read for it. Hand it over again.">No login</Flag>}
          {login?.state === 'working' && login.missing.length > 0 && (
            <Flag color="var(--acc2)" title="Permissions missing"
              why={`This login was handed over before the app asked for these. It keeps working; what needs them doesn’t, until you hand it over again:\n\n${login.missing.map((s) => `• ${SCOPE_INFO[s]?.label ?? s}`).join('\n')}`}>
              {login.missing.length} permission{login.missing.length === 1 ? '' : 's'} missing
            </Flag>
          )}
        </div>
      </div>
      <Tiles inset min={170} items={tiles(facts, now, props.skill, !entry)} />
      {entry && facts.clone === 'unknown' && props.onClone && (
        <div className="row tight">
          <span className="note small">Alpha or Omega?</span>
          {(['alpha', 'omega'] as const).map((k) => (
            <button key={k} type="button" className="btn xs" aria-pressed={props.byHand === k} onClick={() => props.onClone!(props.byHand === k ? undefined : k)}
              style={props.byHand === k ? { borderColor: 'var(--acc)', color: '#fff' } : undefined}>{CLONE_SAID[k]}</button>
          ))}
        </div>
      )}
      {entry && (
        <p className="note small">
          {read ? `The cloud read it ${ago(new Date(read).toISOString(), now)}.` : 'The cloud hasn’t read it yet: its first full read runs when it’s added, then hourly at 37 minutes past.'}
          {entry.ship && entry.shipAt ? ` In ${props.skill(entry.ship)} at its mining read ${ago(new Date(entry.shipAt).toISOString(), now)}.` : ''}
          {failing.map((j) => ` ${j.job === 'mining' ? 'Its mining read' : j.job === 'sheet' ? 'Its skills read' : 'Its wallet and assets read'} is failing: ${j.lastError}.`).join('')}
        </p>
      )}
      {entry && (
        <div className="row">
          {(login?.state !== 'working' || (login?.missing.length ?? 0) > 0) && (
            <button type="button" className="btn sm primary" disabled={props.busy} onClick={props.onHandOver}><Cloud aria-hidden="true" />Hand the cloud this login again</button>
          )}
          <button type="button" className="btn sm quiet" disabled={props.busy} onClick={props.onRemove}><Trash2 aria-hidden="true" />Remove</button>
        </div>
      )}
    </Panel>
  );
}

export function Characters() {
  const d = useData();
  const auth = useAuth();
  const alts = useAlts();
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const cloudOn = cloudEnabled();

  const mine = charFacts({ ...d.meta, cloneDetected: d.settings.clone, cloneSince: undefined }, d.netWorth, now);
  const others = alts.roster.map((entry) => ({ entry, facts: altFacts(alts.alts[entry.charId] ?? { rev: 0, records: {}, docs: {} }, now) }));
  const everyone = [mine, ...others.map((o) => o.facts)];
  useEnsureNames([...everyone.flatMap((f) => (f.training ? [f.training.skillId] : [])), ...alts.roster.flatMap((r) => (r.ship ? [r.ship] : []))]);
  const skill = useTypeName();

  const known = (pick: (f: CharFacts) => number | null) => everyone.map(pick).filter((x): x is number => x != null);
  const wallets = known((f) => f.wallet), worths = known((f) => f.netWorth?.total ?? null);
  const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
  const total: TileData[] = [
    { l: 'Characters', v: String(everyone.length), n: others.length ? `You and ${others.length} the cloud reads` : 'Only the one logged in here' },
    {
      l: 'All wallets', v: wallets.length ? iskBig(sum(wallets)) : '–', n: `${wallets.length} of ${everyone.length} read`,
      tip: 'Every character’s ISK in game, added up.\n\n• Yours is read every 2 minutes while the app is open.\n• An alt’s is as the cloud last read it, hourly.\n• A character not read yet adds nothing, and the count under the figure says how many were.',
    },
    {
      l: 'All net worth', v: worths.length ? iskBig(sum(worths)) : '–', n: `${worths.length} of ${everyone.length} have a daily point`,
      tip: 'Each character’s newest daily net-worth point, added up.\n\n• A point is wallet, escrow, stock on sell orders and everything held, at CCP’s rough average prices.\n• The points can be from different days: each card says its own.\n• Your own ledger’s net worth, live, is on the Wallet page and is not changed by this.',
    },
  ];

  /** Send the owner to EVE for an alt's login, but not for one the cloud couldn't keep. */
  async function handOver() {
    setBusy(true);
    try {
      await cloudAlts();
    } catch (e) {
      setBusy(false);
      toast((e as { status?: number }).status === 404
        ? 'The cloud isn’t ready for other characters yet: its Worker is a version behind this app. Try again in a few minutes.'
        : `The cloud couldn’t be reached, so no login would be kept: ${said(e)}`, 'err');
      return;
    }
    loginAltForCloud().catch((e) => { setBusy(false); toast(said(e), 'err'); });
  }

  async function remove(entry: RosterEntry) {
    const name = entry.name ?? `Character ${entry.charId}`;
    const a = await chooseAsk({
      title: `Remove ${name}?`,
      body: `The cloud stops reading ${name} and its login is revoked at EVE. What it has read so far can be kept in the cloud or deleted.\n\nKept data isn’t shown anywhere until you add ${name} again, and can only be deleted after that. ${name} stays on your list of characters either way, so ISK you sent it still counts as a transfer.`,
      confirm: 'Remove and delete its data', alt: 'Remove, keep its data', danger: true,
    });
    if (a === 'no') return;
    setBusy(true);
    try {
      await cloudRemoveAlt(entry.charId, a === 'yes' ? 'delete' : 'keep');
      toast(`${name} is no longer read by the cloud.${a === 'yes' ? ' What it had read is deleted.' : ' What it had read is kept.'}`, 'info');
      await refreshAlts();
    } catch (e) {
      toast(`Couldn’t remove ${name}: ${said(e)}`, 'err');
    } finally {
      setBusy(false);
    }
  }

  const setClone = (id: number, v: 'alpha' | 'omega' | undefined) => update((x) => {
    const cur = x.chars[String(id)];
    if (!cur) return {};
    const { clone: _was, ...rest } = cur;
    return { chars: { ...x.chars, [String(id)]: v ? { ...rest, clone: v } : rest } };
  });

  const add = (
    <button type="button" className="btn primary" disabled={busy || !cloudOn || !auth} onClick={handOver}
      data-tip-title="Adding a character"
      data-tip={'EVE’s login asks for an account, then which of its characters, and remembers the account you used last.\n\n• For a character on another account, sign out on EVE’s login page first, then sign in with that account.\n• If it offers your main and your mail character, you’re still signed in to your main account.\n• Not in a private window: the login has to come back to this tab.\n\nThe login goes straight to the cloud. Nothing of it is kept in this browser.'}>
      <UserPlus aria-hidden="true" />Add a character
    </button>
  );

  return (
    <div className="page">
      <PageHead kicker="Pilot" title="Characters"
        lede="The character logged in here, and the ones on your other accounts that the cloud reads for you. Each keeps its own wallet, skills and mining under its own name; none of it enters this ledger."
        actions={<>{alts.busy && <span className="note small"><RefreshCw aria-hidden="true" style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> Reading…</span>}{add}</>} />

      {!cloudOn && (
        <Notice kind="warn" icon={CloudOff}>
          Other characters are read by the cloud, and the cloud copy is switched off in this browser.{' '}
          <button type="button" className="link-btn" onClick={() => { setCloudEnabled(true); refreshAlts().catch(() => undefined); }}>Switch it on</button>
        </Notice>
      )}
      {cloudOn && alts.behind && <Notice kind="warn">The cloud isn’t ready for other characters yet: its Worker is a version behind this app. It catches up within a few minutes of a release.</Notice>}
      {cloudOn && alts.error && !alts.behind && (
        <Notice kind="warn">
          The cloud couldn’t be reached just now ({alts.error}).{alts.rosterAt ? ` What’s below is as read ${ago(new Date(alts.rosterAt).toISOString(), now)}.` : ''}
        </Notice>
      )}

      <Tiles items={total} min={220} />

      <Card id={auth?.characterId ?? 0} name={auth?.characterName ?? 'Your character'} facts={mine} now={now} skill={skill} />
      {others.map(({ entry, facts }) => (
        <Card key={entry.charId} id={entry.charId} name={entry.name ?? `Character ${entry.charId}`} facts={facts} now={now} skill={skill} entry={entry} busy={busy}
          byHand={d.chars[String(entry.charId)]?.clone} onClone={(v) => setClone(entry.charId, v)} onHandOver={handOver} onRemove={() => remove(entry)} />
      ))}
      {alts.ready && !others.length && cloudOn && !alts.behind && (
        <Panel>
          <Empty icon={Users} action={add}>
            No other characters yet. Add one and the cloud reads its wallet, assets, skills and mining every hour, with this app closed too.
          </Empty>
        </Panel>
      )}
    </div>
  );
}
```

Notes for whoever types this in:
- `Flag`, `Tiles`, `Panel`, `Notice`, `Empty` and `PageHead` are in `src/components/ui.tsx`; read their props there. If `tsc` rejects a prop (for instance `Notice`'s `icon`), match the component as it is rather than changing it.
- "Hand the cloud this login again" uses the same flow as adding: EVE's page picks the character, and the Worker replaces that character's login. Its card can't force which character is picked; the toast on return names who came back.
- The `_was` in `setClone` is unused on purpose (the rest-sibling pattern `worker/src/eve.ts` uses for `_exp`).

- [ ] **Step 4: Run the page check, at both widths**

Run: `npm run check && npm run build && npm run check-pages && npm run check-phone`

Expected: `npm run check` passes in full (the alt store is imported by `App.tsx` and `components/Characters.tsx`, and by nothing else); the build is clean; every page passes at both widths, `characters` included for the empty, small and large ledgers, and the logged-out and stranger runs show no alt. A `sticks out:` failure on the phone run names the element: make that row wrap (`flexWrap: 'wrap'`, `minWidth: 0`, or `white-space: normal`), never by hiding it.

- [ ] **Step 5: Look at it**

Run `npm run dev`, open `http://localhost:5173/jita-ledger/` in a Playwright browser, and seed as the page check does: the stand-in owner login in `localStorage['jita-ledger:auth']`, then the three-alt roster in IndexedDB `jita-ledger-alts` / `kv` (the `altStoreOf(ALTS.large)` shape from `scripts/pages.mjs`), then `location.reload()` and go to `#characters`. Wait a second before each screenshot (pages animate in). Check by eye, at 1440 px and at 390 px:

- three tiles, then four cards: the one logged in here, Miner Two (Alpha, a wallet, a net-worth point with its date, a skill in training), Miner Three ("Can't tell" with the two buttons, and "Its mining read is failing: …"), Hauler Four (every figure "–", "Login refused", "The cloud hasn't read it yet", a primary "Hand the cloud this login again");
- the notice that the cloud couldn't be reached, with how old what's shown is (the dev server has no cloud);
- no text overflowing a tile or a button, nothing past the right edge at 390 px;
- hovering "Add a character" shows the laid-out tip (a lead line, bullets);
- clicking Remove opens the app's own dialog with three buttons and closes on Cancel;
- clicking Alpha on Miner Three's card labels it "Alpha (you said)" and a reload keeps it.

Fix what doesn't hold, and re-run Step 4.

- [ ] **Step 6: The notes**

In `CLAUDE.md`, in the list of pages in the first section, replace `Side hustles\n(Abyssal / Hauling / Planets / Mining / Freelance), Combat, Omega, Settings` (it wraps across lines; match the words) so that it reads `…, Combat, Characters (the alts the cloud reads), Omega, Settings …`. Change nothing else.

In `docs/notes/characters.md`, replace the last bullet (the one that begins "**Stage 1 is the cloud side only, and ships dark**") with:

```markdown
- **The browser never holds an alt's login, and its copy of an alt is read-only** (`lib/altStore.ts`, the Characters
  page). "Add a character" asks EVE for a login with the purpose `cloud-alt`; `handleCallback` hands its refresh token
  on for the Worker and stores nothing (a purpose it didn't know fell through to the trading login's slot, where the
  owner check would have logged the owner out). What the cloud holds for each alt is pulled into an IndexedDB database
  of its own, `jita-ledger-alts`, only when the alt's revision has moved: one roster request a minute, not one per alt.
- **What keeps an alt's rows out of the ledger is that the alt store can't write to it.** From `store.ts` it imports
  `mergeChars`, `dataGeneration` and `onClearAll`, never `update`; and only `App.tsx` and `Characters.tsx` import the
  alt store. Two tests in `scripts/check.mjs` read the source and fail if either changes. A later page that needs
  alt data is added to that list on purpose, in the commit that makes it read it.
- **`chars` is the one thing about an alt the main's ledger holds**: a synced document of its own, ID to name, and a
  clone state set by hand. Only the roster read writes it (`mergeChars`), it never removes one, and an imported backup
  without it leaves the present one. Not a field of `prefs`: `sanitizePrefs` would drop it on an older version's save.
- **A card never shows a zero for "not known"** (`charFacts`): an alt just added has no wallet, net-worth point or
  queue yet, and each reads "–" with why. An alt's net worth is its newest daily point and says its date; its wallet
  time is when the balance last changed, since the cloud pushes the sheet only when something other than a timestamp
  moved. When it was last read comes from its jobs (`lastRead`).
- **Stage 2a is the Characters page with the roster, and ends with a real alt being read.** What each character
  earned and mined (stage 2b), Mining across characters (3) and the Wallet's total and transfers (4) follow.
```

In `.claude/rules/characters.md`, add to `paths:` the line `  - "src/lib/altStore.ts"` and the line `  - "src/components/Characters.tsx"`, keeping the frontmatter valid YAML (each entry a double-quoted string).

- [ ] **Step 7: Commit**

```bash
git add src/components/Characters.tsx src/components/shell/nav.ts src/App.tsx scripts/pages.mjs CLAUDE.md docs/notes/characters.md .claude/rules/characters.md
git commit -F - <<'EOF'
Characters: add an alt, see the cloud reading it, hand its login over again, remove it

The page the cloud side was waiting for. A card for the character logged in here and one for each alt on the
roster: its clone state and since when, its wallet, its net worth, the skill in training and when the queue ends,
when the cloud last read it, the ship at its last mining read, and the state of its login. Above them, the wallets
and net worth of all of them added up, each saying how many characters it counts.

A figure that isn't known is "–" with why, never a zero: an alt just added has nothing read yet. Each figure says
how old it is: the main's wallet is live, an alt's is as the cloud last read it, and a net-worth figure is a daily
point with its date.

"Add a character" asks the cloud for the roster first and doesn't send the owner to EVE when the Worker is a
version behind or out of reach: EVE stops a character's earlier logins at its own page, so a login the cloud
couldn't keep would cost one for nothing. Its tip says what EVE's page does with accounts. Removing asks whether
to keep or delete what was read, and says that kept data can only be deleted after adding the character again.
A clone state ESI can't tell apart can be labelled by hand.

The page check runs it with no alts, one and three (one well, one with a failing job, one refused with nothing
read), seeding the alt store directly since it lets no request out, at desktop and phone width; and the
logged-out and stranger runs now seed an alt store and fail if an alt's name shows.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
EOF
```

---

### Task 5: Ship it, and read a real alt

**Files:** none changed by the first four steps. This is the stage where EVE's login and ESI are exercised for an alt for the first time, which no test here could do.

- [ ] **Step 1: Everything, from a clean tree**

Run: `git status --short && npm run check && npm run build && npm run check-pages && npm run check-phone`

Expected: nothing uncommitted; both `all passed`; the build clean; every page passing at both widths.

- [ ] **Step 2: Merge, push, and wait for the deploy**

```bash
git checkout main && git merge --ff-only multi-character-browser && git push origin main && git branch -d multi-character-browser
npm run deployed
```

Expected: `Shipped.` (The Worker's workflow runs too, since `src/lib` changed; the Worker's behaviour doesn't.) Then confirm the page is in the deployed bundle: `curl -s https://magicfishgit.github.io/jita-ledger/version.json`, and grep one of the page's own sentences in the deployed `Characters-*.js` ("Add a character").

- [ ] **Step 3: The main is untouched, before any alt exists**

In the live app, as the owner: the Characters page shows three tiles and one card (the main), with "No other characters yet". Wallet, Results and Positions show what they showed before. `npx wrangler d1 execute jita-ledger --remote --command "SELECT COUNT(*) AS alts FROM alts; SELECT key FROM docs WHERE char_id = 95210486 AND key = 'chars'"` shows 0 alts, and a `chars` row only if the app has pushed an (empty) one.

- [ ] **Step 4: The owner adds the first alt, watched**

This step is the owner's: it needs their EVE accounts. Ask them to, with `cd worker && npx wrangler tail jita-ledger-cloud` running in a terminal:

1. sign out on EVE's login page (login.eveonline.com) if they are signed in to the main account there;
2. in the app, Characters → Add a character, sign in with an alt's account, pick the character, accept the permissions;
3. read the two toasts that follow ("… is now one of your characters", then "The cloud has read …").

What the tail should show: `POST /v1/keys - Ok`, `POST /v1/alts/<id>/read - Ok`, then `GET /v1/alts` and `GET /v1/alts/<id>/pull`. No exception.

- [ ] **Step 5: What the cloud now holds, and that nothing crossed**

```bash
cd worker && npx wrangler d1 execute jita-ledger --remote --command "
SELECT char_id, ledger, name, removed_at FROM alts;
SELECT purpose, token_char_id, token_char_name, refused_at FROM keys WHERE char_id = 95210486 ORDER BY purpose;
SELECT char_id, kind, COUNT(*) AS n FROM records WHERE char_id IN (SELECT char_id FROM alts) GROUP BY char_id, kind;
SELECT char_id, key FROM docs WHERE char_id IN (SELECT char_id FROM alts) ORDER BY key;
SELECT char_id, job, last_ok = last_run AS ok, substr(COALESCE(last_error, ''), 1, 100) AS err FROM jobs WHERE char_id IN (SELECT char_id FROM alts);
SELECT COUNT(*) AS main_rows_naming_the_alt FROM records WHERE char_id = 95210486 AND kind = 'mining' AND id LIKE (SELECT char_id FROM alts LIMIT 1) || ':%';"
```

Expected: one `alts` row with `removed_at` NULL; `keys` rows `alt:<id>`, `mailer`, `main`, none refused; the alt's records by kind under its own ID (at least `journal` or `txs` if it has any wallet history, `netWorth`, `names`); its `stock`, `skills` and `meta` docs; its `archive` and `sheet` jobs ok; and 0 rows of the main's naming the alt. The main's and the sender's logins still work: `alerts` for the main is ok at the next five-minute round.

If the mail sender or the main came back instead (the toast says so), nothing was added: that is the slip the Worker absorbs, and the step is repeated after signing out at EVE.

- [ ] **Step 6: The card, and an hour on**

In the app the alt's card shows its wallet, clone state and the skill in training within a minute. After the next `:37` the tail shows `alts hourly {"alts":1,"read":1,"failed":0}`, and after a five-minute round with the alt's mining due, `alts mining {"alts":1,"read":1,"failed":0}`. Record what was learned in `docs/notes/characters.md` and `docs/notes/eve-facts.md` (what EVE's chooser did, how long the first read took, anything ESI answered that the stubs didn't), commit, ship.

- [ ] **Step 7: Say what shipped**

Report to the owner: the page is live, an alt is being read, what the production checks showed, and what only showed up with a real alt. Then write the stage 2b plan (what each character earned and mined).
