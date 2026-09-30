# Several characters, stage 2b: what each character earned and mined. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each card on the Characters page says, for a period you choose, what that character earned (by the same rules as the Wallet's "All income against play") and what it mined (an estimate at the Mining tab's valuation, beside the earnings and never added to them), with an all-characters total. The main's own figures on the Wallet, Results and Positions don't move by a single ISK.

**Architecture:** The income sum lives today inside a React hook (`useActivityEvents`) and a component (`AllIncome` in `Wallet.tsx`). It is lifted into a pure module, `lib/income.ts`, that takes a ledger as an argument, after a recording of the main's present figures has been committed (Task 1), so the move is proven not to drift. An alt's pulled copy is turned into a `Data`-shaped value by a pure `lib/altLedger.ts`, so the same rules run on it unchanged; it is built once per revision. The main's ledger store is never written with anything of an alt's; in that same first task a second test seeds alts with trades, journal and mining and proves the main's ledger and figures are identical with and without them, so every later task runs against it.

**Tech Stack:** React, TypeScript, Vite, idb-keyval; Playwright (`playwright-core` 1.61.1, `page.clock`) for the recording and the isolation test; the stage 1 Worker routes and the stage 2a alt store, live since 30 September 2026.

**Spec:** `docs/superpowers/specs/2026-09-30-multi-character-design.md`, section 3 ("In the browser": `lib/altLedger.ts`, `lib/income.ts`, "What the figures are") and "Testing" ("Isolation"). The stage 2a plan, `docs/superpowers/plans/2026-09-30-multi-character-browser.md`, and `docs/notes/characters.md` say what's already built.

## Global Constraints

- **Alt data has no path into the main's ledger.** `altStore.ts` still imports from `./store` only `dataGeneration`, `mergeChars` and `onClearAll`, and only `App.tsx` and `Characters.tsx` import it (the tests in `scripts/check.mjs` stay as they are). `altLedger.ts` and `income.ts` take a ledger as an argument and import nothing from `./store` but the `Data` *type*. Nothing new calls `update()` with an alt's value; the only writes the Characters page makes stay `chars` (a clone state set by hand) and the public type names `useEnsureNames` looks up.
- **The main's figures don't move.** `npm run check-income` (Task 1) compares the Wallet's "All income against play" and Results' "By activity" with a recording made before any code moved; it must pass after every task.
- **Pure rules stay pure**: `income.ts`, `altLedger.ts`, `emptyData.ts`, `everyItem.ts` (moved to `lib/`), `roster.ts`, `prefs.ts`, `mining.ts` import nothing from `./config`, React or the DOM, and from `./store` only types (type imports are stripped by the test runner). `constants.ts` holds the plain constants they need.
- **How the app looks and speaks** (`docs/notes/app-conventions.md`): figures are tiles; a figure says what it covers and how old it is; "–" with why for not known, never a zero; a tip longer than a sentence is a lead line, then bullets ("• "); nothing past a 390 px screen; lists keyed by ID; `useNow()` for anything relative.
- **What an alt's "earned" can't include is said on its card**: ships it lost (its killmails aren't read), freelance jobs (not read for alts). Ore it mined and hauled to the main is the main's income when the main sells it.
- **Verify before claiming**: `npm run check` and `npm run build` every task; `npm run check-income` from Task 1 on; `npm run check-pages` and `npm run check-phone` for any task touching a page; a look in a real browser for the Characters page.
- **Branch**: `multi-character-earned`, merged `--ff-only` to `main` at the end, deleted, then `npm run deployed`.
- **Commit messages explain the reasoning** and end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01D3Zx5fms2TWhEQgdkabhCf
  ```
- **Test characters**: main `95210486`, alts `900001` "Miner Two", `900002` "Miner Three", `900003` "Hauler Four" (the page check's), and in production `2122193260` "FannySchmeller".

## Review Focus

Conditions the spec implies that a task's obvious tests wouldn't reach. Each has a test or a check in the task named.

1. **The recording moves with the clock.** The page check's ledgers are generated relative to `Date.now()` and the Wallet's window starts at a UTC midnight, so the same ledger gives other figures an hour later. The recording pins both: the generator's `NOW` from `FIXED_NOW`, and the browser's clock with `page.clock.setFixedTime`. Task 1.
2. **ESI's item groups unreachable.** The page check refuses every request, so without stubs only the four activities that need no item groups (Trading, Hauling, Freelance, Combat) would ever be recorded, and the drift the spec names (Trading counted twice, loyalty stores mixed) would go unseen. The recording stubs ESI's market-group and loyalty-offer routes with canned types, so every activity has a figure. Task 1; and on a card, "Earned" says when the groups couldn't be read. Task 5.
3. **An alt just added, or never trading.** No trades, journal or mining yet: its card says "Not read yet" before its first read and "Nothing earned in 7 days" after, never a zero standing for "not known". Task 5 (the page check's Hauler Four, nothing read).
4. **A pull lands while the page is open.** The alt's income is worked out once per revision, not on every render or every minute's roster read: `altLedger` returns the same object for the same pulled copy, and the income memo is keyed on it. Task 3 (identity tests) and Task 5.
5. **Ore with no price.** An ore with no Jita bid, or pricing that failed, shows its m³ and "not priced", never 0 ISK; the ISK figure says how many ores it covers. Task 4 (`minedTotal`) and Task 5.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/ledgers.mjs` (new) | The page check's generated ledgers and alts, moved out of `pages.mjs` so the income check uses the same ones; `NOW` from `FIXED_NOW` when set. |
| `scripts/income.mjs` (new), `scripts/income-golden.json` (new) | `npm run check-income`: the main's income figures against the recording, and the isolation test (both Task 1). |
| `src/lib/everyItem.ts` (moved from `components/`) | Every item worked out as a position; memoised per ledger. |
| `src/lib/income.ts` (new) | The pure income sum: activity events and the "All income" rows, for any ledger. |
| `src/components/activityEvents.ts` | The hook, now a thin wrapper that takes a ledger. |
| `src/lib/attribution.ts` | `loadTypeSets` keeps one answer per set of loyalty stores. |
| `src/lib/emptyData.ts` (new, Task 2) | The empty ledger, moved out of `store.ts` so pure modules and tests can build one. |
| `src/lib/constants.ts`, `src/lib/config.ts` | `SKILL_FALLBACK_IDS` moves to `constants.ts`. |
| `src/lib/altLedger.ts` (new) | An alt's pulled copy as a `Data`-shaped value, once per revision. |
| `src/lib/orePricing.ts` (new) | `priceOres`, moved out of `Mining.tsx`. |
| `src/lib/mining.ts` | `minedTotal`: units, m³ and ISK over a set of records, with what couldn't be priced. |
| `src/lib/wallet.ts` | `Days`, `periodStart`: the Wallet's period rule, shared. |
| `src/components/Characters.tsx` | The period choice, Earned and Mined on each card, the all-characters total. |
| `src/components/charIncome.ts` (new) | `useCharIncome` and `useMined`: the hooks the page reads. |

---

### Task 1: Record the main's income figures, and prove alts don't touch them, before anything moves

**Files:**
- Create: `scripts/ledgers.mjs`, `scripts/income.mjs`, `scripts/income-golden.json`
- Modify: `scripts/pages.mjs` (imports its ledgers from `ledgers.mjs`), `package.json` (`check-income`), `.github/workflows/deploy.yml` (runs it), `CLAUDE.md` (the command list)

**Interfaces:**
- Produces (`scripts/ledgers.mjs`): `NOW`, `DAY`, `iso`, `rng`, `withBalances`, `small()`, `large()`, `alt(charId, name, i)`, `ALTS`, `altStoreOf(list)`, `charsOf(list)`, `ownerAuth()`, `strangerAuth()`, `JITA`, `AMARR`, and `CANNED_SETS` (the item groups the income check stubs, Step 3).
- Produces (`npm run check-income`): exits 0 when the figures match `scripts/income-golden.json`; with `RECORD=1` it writes the file instead.

- [ ] **Step 1: Move the ledgers out of `pages.mjs`, unchanged**

Cut from `scripts/pages.mjs` everything under `// ---- Ledgers ----` up to (not including) `const ALL = …`, plus the `alt`, `ALTS`, `altStoreOf`, `charsOf` block under `// ---- Alts ----`, into `scripts/ledgers.mjs`, exporting each name. Replace `const NOW = Date.now();` with:

```js
/**
 * When the ledgers are built from. `FIXED_NOW` (an ISO time) pins it, for the income check's recording: the pages
 * work their windows out from UTC midnights, so the same ledger built an hour later gives other figures.
 */
export const NOW = process.env.FIXED_NOW ? Date.parse(process.env.FIXED_NOW) : Date.now();
```

Move `OWNER_AUTH` and `STRANGER_AUTH` there as functions (so `expiresAt` follows `NOW`):

```js
export const ownerAuth = () => ({ accessToken: 'test', refreshToken: 'test', expiresAt: NOW + 86400_000, characterId: 95210486, characterName: 'Owner', scopes: [] });
export const strangerAuth = () => ({ ...ownerAuth(), characterId: 12345, characterName: 'Stranger' });
```

In `pages.mjs`, import them (`import { NOW, DAY, iso, small, large, ALTS, altStoreOf, charsOf, ownerAuth, strangerAuth } from './ledgers.mjs';`), keep `const ALL = { empty: {}, small: small(), large: large() };` and the `chars` loop where they were, and replace `OWNER_AUTH` / `STRANGER_AUTH` with `ownerAuth()` / `strangerAuth()`.

- [ ] **Step 2: The page check still passes, untouched**

Run: `npm run check-pages 2>&1 | tail -1`
Expected: `all 109 page loads passed`

- [ ] **Step 3: The canned item groups**

In `scripts/ledgers.mjs`, after `large()`:

```js
/**
 * Stand-ins for ESI's item groups (lib/attribution.ts reads them), from the large ledger's made-up types, so every
 * activity Results and the Wallet count has trades in it: filaments bought, abyssal loot, planetary goods and
 * loyalty-store goods sold. The loyalty store is corp 1000035's, the one the large ledger holds points with.
 */
export const CANNED_SETS = {
  groups: { 2457: [900000, 900007], 2458: [], 2459: [], 2460: [], 2461: [], 2479: [900014, 900021], 1333: [900028], 1334: [900035], 1335: [], 1336: [], 1337: [] },
  lpOffers: { 1000035: [900042, 900049] },
};
```

Check the group IDs against `src/lib/attribution.ts` (`FILAMENT_GROUPS`, `ABYSSAL_MATERIALS_GROUP`, `PI_GROUPS`) and use exactly those; any group it reads that isn't listed answers `[]`.

- [ ] **Step 4: The income check, recording half**

Create `scripts/income.mjs`:

```js
// The main's income figures, pinned. `npm run check-income` builds the large ledger at a fixed time, opens the Wallet
// and Results in a browser whose clock is fixed at that time and whose ESI answers only the item groups (canned, so
// every activity has a figure), and compares what "All income against play" and "By activity" say with
// scripts/income-golden.json. `RECORD=1` writes that file instead. It was recorded before the income sum moved out of
// the Wallet (stage 2b of several characters), so the move, and anything after it, can't drift unseen.
process.env.FIXED_NOW ??= '2026-09-30T15:00:00Z';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const { NOW, large, ownerAuth, CANNED_SETS } = await import('./ledgers.mjs');

const PORT = 5189;
const BASE = `http://localhost:${PORT}/jita-ledger/`;
process.env.VITE_CLOUD_URL = 'http://127.0.0.1:9';
const GOLDEN = new URL('./income-golden.json', import.meta.url);

/** ESI, as far as the income sum needs it: the item groups and the loyalty store's offers. Everything else fails. */
function esi(route) {
  const u = new URL(route.request().url());
  const group = u.pathname.match(/\/markets\/groups\/(\d+)\/?$/);
  if (group) return route.fulfill({ json: { market_group_id: Number(group[1]), name: `Group ${group[1]}`, types: CANNED_SETS.groups[group[1]] ?? [] } });
  const store = u.pathname.match(/\/loyalty\/stores\/(\d+)\/offers\/?$/);
  if (store) return route.fulfill({ json: (CANNED_SETS.lpOffers[store[1]] ?? []).map((t, i) => ({ offer_id: i + 1, type_id: t, quantity: 1, lp_cost: 1000, isk_cost: 100000, required_items: [] })) });
  return route.abort();
}

async function open(browser, ledger, altStore) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
  await page.clock.setFixedTime(new Date(NOW));
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}/`)) return route.continue();
    if (u.includes('esi.evetech.net')) return esi(route);
    return route.abort();
  });
  await page.goto(BASE);
  await page.evaluate(async ([d, auth, alts]) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('jita-ledger:auth', JSON.stringify(auth));
    const openDb = (db) => new Promise((res, rej) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onerror = rej; q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
    for (const [db, put] of [['jita-ledger', d], ['jita-ledger-cache', {}], ['jita-ledger-alts', alts]]) {
      const h = await openDb(db);
      await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
      h.close();
    }
  }, [ledger, ownerAuth(), altStore]);
  await page.reload();
  await page.waitForSelector('.page', { timeout: 20_000 });
  return page;
}

/** What a panel says, row by row: each row's text with its whitespace collapsed. */
async function panelRows(page, title) {
  const panel = page.locator('.panel', { has: page.locator('.panel-title', { hasText: title }) }).first();
  await panel.waitFor({ timeout: 10_000 });
  return (await panel.locator('.kv, tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** The Wallet's "All income against play" at each period, and Results' "By activity". */
async function figures(page) {
  const out = {};
  for (const days of [1, 7, 30, 90]) {
    // The Wallet reads its period when it mounts, so leave for another page and come back.
    await page.evaluate((v) => { localStorage.setItem('jita-ledger:wallet-days', String(v)); location.hash = '#todo'; }, days);
    await page.waitForTimeout(500);
    await page.evaluate(() => { location.hash = '#wallet'; });
    await page.waitForTimeout(2500);
    out[`wallet ${days}`] = await panelRows(page, 'All income against play');
  }
  await page.evaluate(() => { location.hash = '#results'; });
  await page.waitForTimeout(2500);
  out.results = await panelRows(page, 'By activity');
  return out;
}

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
let failed = 0;
try {
  const page = await open(browser, large(), {});
  const got = await figures(page);
  await page.close();
  if (process.env.RECORD === '1') {
    writeFileSync(GOLDEN, JSON.stringify(got, null, 2) + '\n');
    console.log(`recorded ${Object.keys(got).length} sets of figures to scripts/income-golden.json`);
  } else {
    const want = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    for (const k of Object.keys(want)) {
      const a = JSON.stringify(got[k]), b = JSON.stringify(want[k]);
      if (a !== b) { failed++; console.log(`  FAIL ${k}\n       recorded ${b}\n       now      ${a}`); } else console.log(`  ok   ${k}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? `\n${failed} sets of the main's income figures moved` : '\nthe main\'s income figures are as recorded');
process.exit(failed ? 1 : 0);
```

The Wallet reads its period once, when the page mounts (`useState(readDays)`), hence the visit to To do in between. Panels are `section.panel` with a `.panel-title` (`components/ui.tsx`); Results' is titled "By activity" (`Results.tsx`).

Add to `package.json`'s scripts: `"check-income": "node scripts/income.mjs"`.

- [ ] **Step 4b: The alts trade and mine**

In `scripts/ledgers.mjs`'s `alt(charId, name, i)`, give alts 0 and 1 some activity of their own, under their own `charId`: a buy and a resale of one item (`txs`), a sale of something never bought, the matching `journal` `transaction_tax` rows and a `bounty_prizes` row, and `mining` records (three ores over the last week, keyed `${charId}:${date}:${systemId}:${typeId}`). Alt 2 stays with nothing read. `npm run check-pages` still passes (the 2a Characters page reads only their meta, net worth and jobs).

- [ ] **Step 4c: The isolation half (the spec's Testing, "Isolation")**

It comes now, before anything reads an alt's records, so every later task runs against it. In `scripts/income.mjs`, after the recording comparison:

```js
/**
 * Isolation: the main's ledger and figures are the same with alts in this browser as without. The alt store is seeded
 * with alts' own trades, journal and mining; `chars` stays empty (the roster read that fills it can't run: the cloud is
 * unreachable). Compared: the ledger as the app holds it after every page below has been opened, less `names` (a page's
 * lookup may add an item name, a game fact) and `chars`; and what the Wallet, Results and Positions say.
 */
async function snapshot(page) {
  const out = {};
  for (const hash of ['wallet', 'results', 'positions', 'characters', 'hustles/mining']) {
    await page.evaluate((h) => { location.hash = `#${h}`; }, hash);
    await page.waitForTimeout(2500);
    // Characters and Mining are opened so any path they have into the ledger runs; their own text differs by design.
    if (hash !== 'characters' && hash !== 'hustles/mining') out[hash] = (await page.locator('.page').innerText()).replace(/\s+/g, ' ');
  }
  out.ledger = await page.evaluate(async () => {
    // The app's own instance of the store, by the URL it loaded it from, or the import makes a second, empty one.
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/lib\/store\.ts/.test(n));
    const { getData } = await import(url);
    const { names: _n, chars: _c, ...rest } = getData();
    return JSON.stringify(rest);
  });
  return out;
}
```

Run it twice on the large ledger with `chars: {}`: once with `{}` for the alt store and once with `altStoreOf(ALTS.large)`. Fail, listing each key whose value differs (for a page, 200 characters around the first index that differs). Print `ok   isolation` when all match.

- [ ] **Step 4d: See it catch a leak**

Plant one where it could really happen: in `Characters.tsx`, an effect that writes one of an alt's trades into the main's ledger (`useEffect(() => { const tx = /* the first alt's first trade */; if (tx) update((x) => ({ txs: { ...x.txs, [tx.id]: tx } })); }, [alts]);`). The page may call `update`; the alt store may not (the import guard fails it), so the page is where a leak would be written. Run `npm run check-income`, see `FAIL ledger` (and the Wallet's or Results' text differ), revert, `git diff --stat` shows `Characters.tsx` unchanged, and say so in the commit.

- [ ] **Step 5: Record, and see that it isn't trivial**

Run: `RECORD=1 npm run check-income && cat scripts/income-golden.json | head -40`
Expected: every Wallet period and Results have rows, and between them Abyssal, Planets, Loyalty and "Sold, never bought" each show a figure (the stubs reached the app). If an activity is missing, fix the stubs, not the golden file. Then run it plain twice: `npm run check-income` → `ok   isolation` and `the main's income figures are as recorded`, both times.

- [ ] **Step 6: Run it in the deploy, and list it**

In `.github/workflows/deploy.yml`, after the `npm run check-phone` step, add a step `- run: npm run check-income`. In `CLAUDE.md`'s command block, after `check-phone`, add:

```
npm run check-income  # the main's income figures against a recording, and alts proven not to touch the main's ledger
```

- [ ] **Step 7: Commit**

```bash
git add scripts/ledgers.mjs scripts/income.mjs scripts/income-golden.json scripts/pages.mjs package.json .github/workflows/deploy.yml CLAUDE.md
git commit   # message: why the recording and the isolation test come first (the spec's drift cases; the final review of 2a), how the recording is pinned (FIXED_NOW, the fixed clock, the canned groups), what it recorded, and the planted leak it caught
```

---

### Task 2: Lift the income sum into `lib/income.ts`

**Files:**
- Move: `src/components/everyItem.ts` → `src/lib/everyItem.ts` (importers: `Omega.tsx`, `Wallet.tsx`, `Results.tsx`)
- Create: `src/lib/income.ts`
- Modify: `src/components/activityEvents.ts`, `src/components/Wallet.tsx` (`AllIncome`), `src/lib/attribution.ts` (`loadTypeSets`)
- Test: `scripts/check.mjs`

**Interfaces:**
- Produces (`src/lib/everyItem.ts`): `everything(typeId, excluded)`, `everyItemCalcs(d: Data): ItemCalc[]`, now memoised per `d.txs`/`d.journal`/`d.orders`/`d.settings`/`d.meta.rateHistory`/`d.ignored` identity (a one-slot cache per ledger object: `WeakMap<Data['txs'], …>` keyed on `d.txs`, checking the other five are the same objects).
- Produces (`src/lib/income.ts`):
  ```ts
  export type LossActs = Record<number, CombatActivity>;
  export type Acts = { events: DayEvent[]; others: { t: number; isk: number; typeId: number }[]; typeSets: TypeSets | null };
  export function activityEvents(d: Data, sets: TypeSets | null, failed: boolean, lossActs: LossActs, posCalc: { c: PositionCalc }[]): Acts;
  export type IncomeRow = { key: string; said: string; isk: number; tip: string };
  export function incomeRows(calcs: ItemCalc[], acts: Acts, since: number, now: number): { rows: IncomeRow[]; earned: number };
  export const ACTIVITY_WHAT: Record<Activity, string>;   // moved from components/activityEvents.ts
  ```
- Produces (`src/components/activityEvents.ts`): `useActivityEvents(ledger?: Data)`, the same return shape as today (`{ events, others, typeSets, failed, posCalc, lossActs, ready }`); with no argument it reads `useData()` as now.

- [ ] **Step 1: Move `everyItem.ts` to `lib/`**

`git mv src/components/everyItem.ts src/lib/everyItem.ts`; fix its imports (`./positions`, `./longRange`, `type Data` from `./store`) and the three importers (`../lib/everyItem`). Add the memo:

```ts
/** One ledger's answer, kept while the inputs it read are the same objects (the store replaces what changes). */
const memo = new WeakMap<object, { key: unknown[]; calcs: ItemCalc[] }>();
export function everyItemCalcs(d: Data): ItemCalc[] {
  const key = [d.journal, d.orders, d.settings, d.meta.rateHistory, d.ignored];
  const hit = memo.get(d.txs);
  if (hit && hit.key.every((k, i) => k === key[i])) return hit.calcs;
  const calcs = computeEveryItem(d);
  memo.set(d.txs, { key, calcs });
  return calcs;
}
```

with the present body renamed `computeEveryItem`. Run `npm run build && npm run check-income`: both pass (nothing's behaviour changed).

- [ ] **Step 2: Write the failing tests for `income.ts`**

In `scripts/check.mjs`, above the final `console.log(failed ? …)`, add (the ledger is built by hand so every figure can be checked on paper):

```js
console.log('\n--- what a ledger earned (income.ts) ---');
{
  const { activityEvents, incomeRows } = await import('../src/lib/income.ts');
  const { everyItemCalcs } = await import('../src/lib/everyItem.ts');
  const { emptyData } = await import('../src/lib/emptyData.ts');
  const T0 = Date.parse('2026-09-20T00:00:00Z');
  const at = (h) => new Date(T0 + h * 3600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const tx = (id, typeId, h, isBuy, qty, unitPrice) => [id, { id, source: 'esi', typeId, date: at(h), isBuy, qty, unitPrice, locationId: 60003760 }];
  const d = {
    ...emptyData(),
    txs: Object.fromEntries([
      tx('a1', 100, 0, true, 10, 1000), tx('a2', 100, 24, false, 10, 1500),   // traded: bought 10,000, sold 15,000
      tx('l1', 200, 48, false, 5, 2000),                                      // loot: never bought, sold 10,000
      tx('f1', 300, 1, true, 1, 50000),                                       // a filament bought
      tx('y1', 400, 60, false, 1, 80000),                                     // abyssal loot sold
    ]),
    journal: Object.fromEntries([
      ['j1', { id: 'j1', date: at(24), refType: 'transaction_tax', amount: -500, contextId: 'a2' }],
      ['j2', { id: 'j2', date: at(48), refType: 'transaction_tax', amount: -300, contextId: 'l1' }],
      ['j3', { id: 'j3', date: at(60), refType: 'transaction_tax', amount: -2000, contextId: 'y1' }],
      ['j4', { id: 'j4', date: at(30), refType: 'bounty_prizes', amount: 7000 }],
    ]),
  };
  const sets = { filaments: new Set([300]), abyssLoot: new Set([400]), pi: new Set(), lpGoods: new Set() };
  const acts = activityEvents(d, sets, false, {}, []);
  const since = T0, now = T0 + 5 * 86400_000;
  const { rows, earned } = incomeRows(everyItemCalcs(d), acts, since, now);
  const by = Object.fromEntries(rows.map((r) => [r.key, r.isk]));
  // Trading is every item bought and sold again by its profit (15,000 − 10,000 − the 500 tax), counted once: the
  // activity events hold no Trading here (no positions), and the row isn't added to them.
  eq('  trading, every item, by its profit', Math.round(by.trading), 4500);
  eq('  abyssal: loot sold after tax, less the filament', Math.round(by.Abyssal), 80000 - 2000 - 50000);
  eq('  combat: the bounty', by.Combat, 7000);
  eq('  sold, never bought: the loot after its tax', Math.round(by.loot), 10000 - 300);
  eq('  all income is the rows added up', Math.round(earned), 4500 + 28000 + 7000 + 9700);
  // The window's first millisecond counts, the one before it doesn't (the Wallet's inWindow and itemResult's since − 1).
  const late = incomeRows(everyItemCalcs(d), acts, T0 + 48 * 3600_000, now);
  eq('    from the loot sale\'s own millisecond: it counts', Math.round(Object.fromEntries(late.rows.map((r) => [r.key, r.isk])).loot), 9700);
  const later = incomeRows(everyItemCalcs(d), acts, T0 + 48 * 3600_000 + 1, now);
  eq('    one millisecond after it: it doesn\'t', Object.fromEntries(later.rows.map((r) => [r.key, r.isk])).loot, undefined);
  // Without the item groups, only what needs none counts, and nothing is "sold, never bought".
  const bare = activityEvents(d, null, true, {}, []);
  const b = Object.fromEntries(incomeRows(everyItemCalcs(d), bare, since, now).rows.map((r) => [r.key, r.isk]));
  eq('  without the item groups: no abyssal, no loot row', [b.Abyssal, b.loot], [undefined, undefined]);
  eq('    bounties still count', b.Combat, 7000);
}
```

`eq`'s rows filter drops rows under 1 ISK, as `AllIncome` does, which is why a row that isn't there reads `undefined`. Work each expected figure out again before running: if one is wrong on paper, fix the test, and if the code disagrees with paper, the code is wrong only if it also disagrees with the Wallet today (`check-income`).

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm run check 2>&1 | grep -A3 "what a ledger earned" | head`
Expected: an import failure (`income.ts` and `emptyData.ts` don't exist).

- [ ] **Step 3b: `emptyData.ts`, so a test can build a ledger**

```ts
import type { Data } from './store';
import { DEFAULT_SETTINGS } from './fees';
import { DEFAULT_ALERTS, DEFAULT_PREFS } from './prefs';

/** An empty ledger: what a new browser starts from, and what an alt's copy is filled into (altLedger.ts). */
export const emptyData = (): Data => ({
  settings: { ...DEFAULT_SETTINGS },
  txs: {}, journal: {}, orders: {}, positions: [], watchlist: [], names: {}, ignored: [], meta: {},
  prefs: { ...DEFAULT_PREFS }, alerts: { ...DEFAULT_ALERTS }, alertLog: [], goals: [], tags: {}, nearDone: [],
  killmails: {}, netWorth: [], unusualOk: [], leave: [], safetyTimes: {}, notSnipes: [], plans: [], mining: {}, chars: {},
});
```

Copy the field list from `store.ts`'s `empty` as it is when you do this, and make `store.ts` use `emptyData` in its place (`const empty = emptyData;` or replace its uses). `npm run build` passes; the tests now fail only on `income.ts`.

- [ ] **Step 4: Write `income.ts` from the code as it is**

Create `src/lib/income.ts`. `activityEvents` is the body of `useActivityEvents`'s `useMemo` moved verbatim, with its inputs as arguments (`d`, `sets`, `failed`, `lossActs`, and `posCalc` for the realized-profit series), including `LOSS_ACTIVITY` and `WITHOUT_SETS`. `incomeRows` is `AllIncome`'s computation from `items` to `earned`, with its colours left behind (a row carries `key`; the component maps `key` to a colour). `ACTIVITY_WHAT` moves here with the words unchanged; `ACTIVITY_COLOR` stays in `components/activityEvents.ts`. The loot row's `key` is `'loot'`, trading's `'trading'`, each activity's its name, exactly as `AllIncome` keys them today.

```ts
import type { Data } from './store';
import { netLoss, type CombatActivity } from './combat';
import { rates } from './fees';
import { isFreelanceTrade } from './freelance';
import { countedIn, type PositionCalc } from './positions';
import { nettedJournal } from './refunds';
import { attribute, otherSales, type DayEvent, type TypeSets } from './results';
import { isTrade, isUnbought, itemResult, type ItemCalc } from './longRange';
import { ACTIVITIES } from './prefs';
import type { Activity } from './types';
// …the moved code…
```

Check each import is pure (no `./config`, React or the DOM); if `combat.ts` or `freelance.ts` import `./config`, move the one function needed into a pure module first, or pass it in, and say which in the commit.

- [ ] **Step 5: The hook and the panel read it**

`components/activityEvents.ts`: `useActivityEvents(ledger?: Data)` reads `const live = useData(); const d = ledger ?? live;`, keeps its effects (item groups from `d.meta.lpBalances`' stores, names, loss classification, `posCalc`) and returns `useMemo(() => activityEvents(d, sets, failed, lossActs, posCalc), […same deps…])` spread with `failed`, `posCalc`, `lossActs`, `ready` as before. `Wallet.tsx`'s `AllIncome`: `const { rows, earned } = useMemo(() => incomeRows(calcs, acts, since, now), [calcs, acts, since, now]);`, the JSX unchanged but for `color: key === 'trading' ? ACTIVITY_COLOR.Trading : key === 'loot' ? '#adbfcf' : ACTIVITY_COLOR[key as Activity]`.

`lib/attribution.ts`'s `loadTypeSets` keeps a `Map<string, Promise<TypeSets>>` by the sorted stores instead of one slot, so the main's and an alt's (different loyalty stores) don't evict each other; a failed load is deleted from the map as now.

- [ ] **Step 6: Everything passes, and the figures didn't move**

Run: `npm run check 2>&1 | tail -1 && npm run build 2>&1 | tail -1 && npm run check-income 2>&1 | tail -1 && npm run check-pages 2>&1 | tail -1`
Expected: `all passed`, a clean build, `the main's income figures are as recorded`, `all 109 page loads passed`.

- [ ] **Step 7: Commit**

---

### Task 3: An alt's copy as a ledger (`altLedger.ts`)

**Files:**
- Create: `src/lib/altLedger.ts`
- Modify: `src/lib/constants.ts` / `src/lib/config.ts` (`SKILL_FALLBACK_IDS` moves)
- Test: `scripts/check.mjs`

**Interfaces:**
- Consumes (`roster.ts`, stage 2a): `AltSaved = { rev; records; docs; addedAt? }`; (Task 2) `emptyData(): Data`.
- Produces: `altLedger(saved: AltSaved, byHand?: 'alpha' | 'omega'): Data`, returning the same object for the same `saved` object and `byHand`.

What the cloud writes for an alt (read from `worker/src/sheet.ts` and `archive.ts`, 30 September 2026): records `txs`, `journal`, `orders`, `names`, `netWorth` (keyed by date), `mining`; documents `meta` (`walletBalance`, `walletAt`, `totalSp`, `skillSp`, `activeSkills`, `cloneDetected`, `cloneSince`, `skillQueue`, `attributes`, `lpBalances`; **no `skillIds`**), `skills` (trained level by skill ID), `stock`. Not read for an alt: killmails, freelance jobs, contracts, planets, standings.

- [ ] **Step 1: Move `SKILL_FALLBACK_IDS` to `constants.ts`**

Cut it from `config.ts` into `constants.ts`, beside `SKILL_NAMES`; `config.ts` already re-exports `constants`, so its importers are unchanged. `npm run build` passes.

- [ ] **Step 2: Write the failing tests**

```js
console.log('\n--- an alt\'s copy as a ledger (altLedger.ts) ---');
{
  const { altLedger } = await import('../src/lib/altLedger.ts');
  const { applyAltPull, emptyAlt } = await import('../src/lib/roster.ts');
  const { SKILL_FALLBACK_IDS } = await import('../src/lib/constants.ts');
  const saved = {
    rev: 4, records: {
      txs: { 1: { id: '1', source: 'esi', typeId: 34, date: '2026-09-29T10:00:00Z', isBuy: false, qty: 100, unitPrice: 5, locationId: 60003760 } },
      netWorth: { '2026-09-28': { date: '2026-09-28', total: 2e8, wallet: 1e8 }, '2026-09-29': { date: '2026-09-29', total: 3e8, wallet: 1e8 } },
      mining: { 'a': { charId: 900001, date: '2026-09-29', systemId: 30000142, typeId: 1230, qty: 5000 } },
    },
    docs: { meta: { cloneDetected: 'alpha', walletBalance: 1e8 }, skills: { [SKILL_FALLBACK_IDS.acc]: 3, [SKILL_FALLBACK_IDS.br]: 2 } },
  };
  const d = altLedger(saved);
  eq('  its trades, journal and mining are its own', [Object.keys(d.txs), Object.keys(d.journal), Object.keys(d.mining)], [['1'], [], ['a']]);
  eq('  its net-worth points, oldest first', d.netWorth.map((p) => p.date), ['2026-09-28', '2026-09-29']);
  eq('  its trade skills set its fees', [d.settings.acc, d.settings.br, d.settings.trade], [3, 2, 0]);
  eq('  its clone state as read', d.settings.clone, 'alpha');
  eq('  standings 0, and nothing of a position, tag or Personal mark', [d.settings.faction, d.settings.corp, d.positions.length, Object.keys(d.tags).length, d.ignored.length], [0, 0, 0, 0, 0]);
  eq('  no killmails: the cloud doesn\'t read an alt\'s', Object.keys(d.killmails).length, 0);
  eq('    set by hand, when the skills can\'t tell', altLedger({ ...saved, docs: { ...saved.docs, meta: {} } }, 'alpha').settings.clone, 'alpha');
  eq('    not known either way: taken as Omega (the same when nothing is past the caps)', altLedger({ ...saved, docs: { ...saved.docs, meta: {} } }).settings.clone, 'omega');
  eq('  the same copy gives the same object (worked out once a revision)', altLedger(saved) === d, true);
  const next = applyAltPull(saved, { rev: 5, next: null, records: [], docs: [] });
  eq('    a new revision gives a new one', altLedger(next) === d, false);
  eq('  an alt with nothing read is an empty ledger with Omega fees', [Object.keys(altLedger(emptyAlt()).txs).length, altLedger(emptyAlt()).settings.clone], [0, 'omega']);
}
```

Run `npm run check`: it fails on the missing `altLedger.ts`.

- [ ] **Step 3: `altLedger.ts`**

```ts
import type { Data } from './store';
import type { AltSaved } from './roster';
import { SKILL_FALLBACK_IDS, SKILL_NAMES, type SkillKey } from './constants';
import { DEFAULT_SETTINGS, sanitizeSettings } from './fees';
import { emptyData } from './emptyData';
import type { NetWorthPoint } from './types';

/**
 * An alt's copy as the cloud pulled it, as a ledger the app's own rules read unchanged (docs/notes/characters.md).
 * What an alt doesn't have is supplied empty: positions, tags, Personal marks, killmails (not read for an alt). Its
 * fees come from its own trade skills and clone state with standings 0; a clone state nobody can tell is taken as
 * Omega, which is the same thing when nothing is past Alpha's caps. Worked out once for each pulled copy: the alt
 * store replaces the copy when its revision moves, so the same copy means the same answer.
 */
const memo = new WeakMap<AltSaved, Map<string, Data>>();

export function altLedger(saved: AltSaved, byHand?: 'alpha' | 'omega'): Data {
  const key = byHand ?? '';
  const hit = memo.get(saved)?.get(key);
  if (hit) return hit;
  const rec = <T>(kind: string) => (saved.records[kind] ?? {}) as Record<string, T>;
  const meta = (saved.docs.meta ?? {}) as Data['meta'];
  const skills = (saved.docs.skills ?? {}) as Record<number, number>;
  const detected = (meta as { cloneDetected?: 'alpha' | 'omega' }).cloneDetected;
  const levels = Object.fromEntries((Object.keys(SKILL_NAMES) as SkillKey[]).map((k) => [k, skills[SKILL_FALLBACK_IDS[k]] ?? 0]));
  const d: Data = {
    ...emptyData(),
    txs: rec('txs'), journal: rec('journal'), orders: rec('orders'), names: rec('names'), mining: rec('mining'),
    netWorth: Object.values(rec<NetWorthPoint>('netWorth')).sort((a, b) => a.date.localeCompare(b.date)),
    meta, skills, stock: saved.docs.stock as Data['stock'],
    settings: sanitizeSettings({ ...DEFAULT_SETTINGS, ...levels, clone: detected ?? byHand ?? 'omega', faction: 0, corp: 0 }),
  };
  if (!memo.has(saved)) memo.set(saved, new Map());
  memo.get(saved)!.set(key, d);
  return d;
}
```

`names` records come keyed as strings from the pull; if `Data['names']` is keyed by number, the object still reads the same. Run `npm run check`: `all passed`. Run `npm run build`.

- [ ] **Step 4: Commit**

---

### Task 4: Ore pricing shared, and what a set of mining records comes to

**Files:**
- Create: `src/lib/orePricing.ts` (`priceOres` moved from `components/hustles/Mining.tsx`)
- Modify: `src/components/hustles/Mining.tsx` (imports it), `src/lib/mining.ts` (`minedTotal`)
- Test: `scripts/check.mjs`

**Interfaces:**
- Produces: `priceOres(types, nameOf, skills, corp, tax): Promise<{ vols: Record<number, number>; worth: Record<number, OreWorth> }>` (unchanged signature, new home).
- Produces (`mining.ts`): `minedTotal(records: MiningRecord[], volumeOf: (t: number) => number | null, worthOf: (t: number) => number | null): { units: number; m3: number | null; isk: number; priced: number; ores: number }` — `m3` null when any ore's volume isn't known; `isk` over the priced ores only; `priced` of `ores` says how many were.

- [ ] **Step 1: Move `priceOres`**

Cut `priceOres` and its `Bundle` type from `Mining.tsx` into `src/lib/orePricing.ts`, export it, and import it back in `Mining.tsx` (its own imports move with it: `adjustedPricesShared`, `stationTax`, `esi`, `JITA_44`, `jitaBook`, `resolveIds`, `typeInfo`, `unitValue`, `yieldOf`, `Site`, and the dynamic `import('../data/typeMaterials.json')`, whose path becomes `'../data/typeMaterials.json'`). The bundle must stay its own chunk: `npm run build` lists `typeMaterials-*.js` separately.

- [ ] **Step 2: Test `minedTotal`**

```js
console.log('\n--- what a set of mining records comes to (minedTotal) ---');
{
  const { minedTotal } = await import('../src/lib/mining.ts');
  const r = (typeId, qty) => ({ charId: 900001, date: '2026-09-29', systemId: 30000142, typeId, qty });
  const vol = { 1228: 0.15, 1230: 0.1 }, worth = { 1228: 16, 1230: null };
  const got = minedTotal([r(1228, 1000), r(1228, 500), r(1230, 2000)], (t) => vol[t] ?? null, (t) => worth[t] ?? null);
  eq('  units, m³, and ISK over what could be priced', [got.units, Math.round(got.m3), got.isk, got.priced, got.ores], [3500, 425, 24000, 1, 2]);
  const noVol = minedTotal([r(9999, 10)], () => null, () => null);
  eq('  an ore with no known volume: m³ not known, never 0', [noVol.m3, noVol.isk, noVol.priced], [null, 0, 0]);
  eq('  nothing mined', minedTotal([], () => 1, () => 1), { units: 0, m3: 0, isk: 0, priced: 0, ores: 0 });
}
```

- [ ] **Step 3: `minedTotal`**

```ts
/**
 * What a set of mining records comes to: units, m³ and ISK at the valuation given. An ore with no known volume makes
 * the m³ unknown rather than short; one with no price adds nothing to the ISK, and `priced` of `ores` says how many
 * were. The Characters page's "Mined" is this: an estimate beside what was earned, never part of it.
 */
export function minedTotal(records: MiningRecord[], volumeOf: (t: number) => number | null, worthOf: (t: number) => number | null) {
  const by = new Map<number, number>();
  for (const r of records) by.set(r.typeId, (by.get(r.typeId) ?? 0) + r.qty);
  let units = 0, m3: number | null = 0, isk = 0, priced = 0;
  for (const [t, q] of by) {
    units += q;
    const v = volumeOf(t);
    m3 = m3 == null || v == null ? null : m3 + q * v;
    const w = worthOf(t);
    if (w != null) { isk += q * w; priced++; }
  }
  return { units, m3, isk, priced, ores: by.size };
}
```

`npm run check`, `npm run build`, `npm run check-pages` (Mining changed): all pass. Commit.

---

### Task 5: Earned and Mined on the Characters page

**Files:**
- Modify: `src/lib/wallet.ts` (`Days`, `PERIOD_DAYS`, `periodStart`), `src/components/Wallet.tsx` (uses them), `src/components/Characters.tsx`
- Create: `src/components/charIncome.ts`
- Test: `scripts/check.mjs` (`periodStart`), `npm run check-pages`, `npm run check-phone`, `npm run check-income` (isolation included), a browser look

**Interfaces:**
- Produces (`wallet.ts`): `type Days = 1 | 7 | 30 | 90`; `PERIOD_DAYS: Days[]`; `periodStart(days: Days, now: number): number` — `days === 1 ? now − DAY : startOfUtcDay(now) − (days − 1) × DAY`, the Wallet's rule as it is.
- Produces (`charIncome.ts`): `useCharIncome(d: Data, since: number, now: number): { ready: boolean; failed: boolean; earned: number; rows: IncomeRow[] }`; `useMinedWorth(types: number[]): { volumeOf; worthOf; pricing: boolean }` (one `priceOres` for every character's mined ores, at the main's skills, standing and tax).

- [ ] **Step 1: The Wallet's period rule, shared**

Move `Days` and the window rule from `Wallet.tsx` into `lib/wallet.ts` as above (`startOfUtcDay` comes along if it's local to Wallet). Test it in `check.mjs`:

```js
{
  const { periodStart } = await import('../src/lib/wallet.ts');
  const now = Date.parse('2026-09-30T15:00:00Z');
  eq('  the period: 24 hours back, or whole UTC days', [periodStart(1, now), periodStart(7, now)].map((t) => new Date(t).toISOString()), ['2026-09-29T15:00:00.000Z', '2026-09-24T00:00:00.000Z']);
}
```

`Wallet.tsx` uses `periodStart(days, now)`. `npm run check-income` still passes.

- [ ] **Step 2: The hooks**

`components/charIncome.ts`:

```ts
/**
 * What a character earned in a window, by the Wallet's rules (lib/income.ts), for any ledger: yours, or an alt's as
 * altLedger builds it. Worked out once for each ledger object and window: an alt's ledger is the same object until its
 * revision moves, so a page re-rendering every minute doesn't redo it.
 */
export function useCharIncome(d: Data, since: number, now: number) {
  const acts = useActivityEvents(d);
  const calcs = useMemo(() => everyItemCalcs(d), [d]);
  const out = useMemo(() => incomeRows(calcs, acts, since, now), [calcs, acts, since, now]);
  return { ready: acts.ready, failed: acts.failed, earned: out.earned, rows: out.rows };
}
```

`useMinedWorth(types)` is `Mining.tsx`'s pricing effect (Task 4's `priceOres`, run once every name is known, keyed on the sorted types), returning `volumeOf`, `worthOf` (via `bestWay`) and `pricing`. Note `useActivityEvents(d)` loads the item groups for `d.meta.lpBalances`' stores, which for an alt are its own (the cloud's sheet reads them).

`useCharIncome` is a hook, so the page calls it once per card: make each `Card` call it for its own ledger (the main's `d`, or `altLedger(saved, byHand)`), and report its `earned` up through a callback for the all-characters tile (`onEarned(charId, isk | null)` into a `Record<number, number | null>` held by the page).

- [ ] **Step 3: The page**

In `Characters.tsx`:
- A period choice in the page head's actions: `<Seg label="Period" value={days} onChange={setDays} options={PERIOD_DAYS.map(…)} />`, the Wallet's labels ("24 hours", "7 days"…), kept per browser under `jita-ledger:chars-days` (default 7), read in `try` like the Wallet's.
- Each card's tiles gain two after Training:
  - **Earned**: `iskBigSigned(earned)` in the period's colour rules (positive `--pos`, negative `--neg`); "–" with "Reading which items belong to which activity…" until `ready`; for an alt with nothing read yet (`totalSp == null` and no records), "–" with "Not read yet". Its note says the period ("in 7 days"). Its tip lists the rows (`• Trading, every item: +1.2 M`), then, for an alt: "Ships it lost aren't counted: the cloud doesn't read an alt's killmails. Nor are freelance jobs. Ore it hauled to you and you sold is yours when you sell it." When `failed`: "ESI's item groups couldn't be read, so abyssal, planets, loyalty and things never bought aren't counted."
  - **Mined**: its ISK (`iskBig(isk)`) when any ore was priced, with the note "`m³` m³, `priced` of `ores` ores priced" (or "not priced" when none were); "–" with "Nothing mined in 7 days" when there are no records in the period. Its tip: "An estimate at your own valuation (the Mining tab's: the best of selling it raw, compressed or reprocessed at your skills, after tax). It's beside what was earned, never added to it: ore becomes ISK when it's sold, and then it counts where it's sold."
  - The records: the main's `d.mining` records whose `charId` is the main's; an alt's `altLedger(…).mining`. The period for mining is by date: records with `date >= new Date(since).toISOString().slice(0, 10)`.
- The all-characters tiles gain **Earned, all characters**: the sum of the cards' reported `earned` that are known, "`n` of `m` counted" under it, and a tip saying each is by the Wallet's rules and alts' leave out ships lost and freelance.
- The main's card gets Earned and Mined from its own ledger, so the page's main figure for Earned is the Wallet's "All income" for the same period.

- [ ] **Step 4: Checks**

Run: `npm run check 2>&1 | tail -1 && npm run build 2>&1 | tail -1 && npm run check-pages 2>&1 | tail -1 && npm run check-phone 2>&1 | tail -1 && npm run check-income 2>&1 | tail -2`
Expected: all pass, `ok   isolation` among them: the page now reads the alts' records, and the main's ledger and figures must be exactly as without them.

- [ ] **Step 5: Look at it**

Dev server on a spare port with the cloud pointed nowhere, the alt store seeded as in 2a's look (with Task 1's trades and mining): each period shows Earned and Mined on all cards and the total; the tips read as laid out; Hauler Four says "Not read yet"; 390 px nothing past the edge. Delete the test browser's data afterwards.

- [ ] **Step 6: Commit**

---

### Task 6: Ship, and read FannySchmeller's earnings

- [ ] **Step 1**: `git status --short && npm run check && npm run build && npm run check-pages && npm run check-phone && npm run check-income` — clean tree, all pass.
- [ ] **Step 2**: merge `--ff-only` to `main`, push, delete the branch, `npm run deployed` → `Shipped.`; grep the deployed Characters chunk for "Earned, all characters".
- [ ] **Step 3**: The owner opens Characters: FannySchmeller's card shows Earned and Mined for 7 days. Its trades (36) and journal (83) are in the cloud; compare its Earned with what its own wallet journal says it gained (a D1 query summing its journal by ref type over the period) and explain any difference in `docs/notes/characters.md`.
- [ ] **Step 4**: Notes: `characters.md` (what the card counts, what it leaves out and why, the recording and the isolation test), `positions-results.md` (the income sum now lives in `lib/income.ts`, recorded by `check-income`), `.claude/rules/characters.md` paths gain `altLedger.ts`, `charIncome.ts`; `.claude/rules/positions-results.md` (or whichever rule covers Results and the Wallet) gains `income.ts`, `everyItem.ts`. Commit, ship.
