// The main's income figures, pinned. `npm run check-income` builds the large ledger at a fixed time, opens the Wallet
// and Results in a browser whose clock is fixed at that time and whose ESI answers only the item groups (canned, so
// every activity has a figure), and compares what "All income against play" and "By activity" say with
// scripts/income-golden.json. `RECORD=1` writes that file instead. It was recorded before the income sum moved out of
// the Wallet (stage 2b of several characters), so the move, and anything after it, can't drift unseen.
process.env.FIXED_NOW ??= '2026-09-30T15:00:00Z';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const { NOW, large, ownerAuth, CANNED_SETS, ALTS, altStoreOf } = await import('./ledgers.mjs');

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
    const openDb = (db) => new Promise((res, rej) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onerror = rej; q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains('kv')) q.result.createObjectStore('kv'); }; });
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
    // The resource timing list comes back empty under the fixed clock, so the URL is the one Vite serves it at.
    const url = `${location.origin}/jita-ledger/src/lib/store.ts`;
    const { getData } = await import(url);
    const { names: _n, chars: _c, ...rest } = getData();
    if (!Object.keys(rest.txs ?? {}).length) throw new Error('the store imported is empty: a second instance');
    return JSON.stringify(rest);
  });
  return out;
}

/** Confirms the alts reached the browser, or the comparison would pass with nothing to compare. Returns what's missing. */
async function altsLoaded(page) {
  const missing = [];
  await page.evaluate(() => { location.hash = '#characters'; });
  await page.waitForTimeout(2500);
  const text = await page.locator('.page').innerText();
  for (const a of ALTS.large) if (!text.includes(a.entry.name)) missing.push(`${a.entry.name} is not on the Characters page`);
  const saved = await page.evaluate(() => new Promise((res) => {
    const q = indexedDB.open('jita-ledger-alts');
    q.onerror = () => res(null);
    q.onsuccess = () => {
      const h = q.result;
      if (!h.objectStoreNames.contains('kv')) return res(null);
      const g = h.transaction('kv').objectStore('kv').get('alt:900001');
      g.onsuccess = () => res(g.result ?? null); g.onerror = () => res(null);
    };
  }));
  const r = saved?.records ?? {};
  for (const k of ['txs', 'journal', 'mining']) if (!Object.keys(r[k] ?? {}).length) missing.push(`alt:900001 holds no ${k}`);
  if (!Object.values(r.mining ?? {}).every((m) => m.charId === 900001) || !Object.keys(r.mining ?? {}).length) missing.push('alt:900001 mining records are not its own');
  return missing;
}

/** Runs the comparison: the ledger with and without alts in this browser. */
async function isolation(browser) {
  const L = { ...large(), chars: {} };
  const snaps = [];
  let loaded = [];
  for (const store of [{}, altStoreOf(ALTS.large)]) {
    const page = await open(browser, L, store);
    snaps.push(await snapshot(page));
    if (Object.keys(store).length) loaded = await altsLoaded(page);
    await page.close();
  }
  const [without, withAlts] = snaps;
  let bad = 0;
  for (const m of loaded) { bad++; console.log(`  FAIL isolation: the alts didn't load: ${m}`); }
  if (!loaded.length) console.log('  ok   alts loaded (names on the Characters page, records in jita-ledger-alts)');
  for (const k of Object.keys(without)) {
    if (without[k] === withAlts[k]) continue;
    bad++;
    const a = without[k], c = withAlts[k];
    let d = 0; while (d < a.length && a[d] === c[d]) d++;
    console.log(`  FAIL isolation ${k}\n       without alts ...${a.slice(Math.max(0, d - 100), d + 100)}...\n       with alts    ...${c.slice(Math.max(0, d - 100), d + 100)}...`);
  }
  if (!bad) console.log('  ok   isolation');
  return bad;
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
    // The recording pins the app as it renders today, quirks included ("Spent on play −0 ISK"). A deliberate change to
    // the Wallet's or Results' wording or formatting means re-recording with RECORD=1 in the same commit, saying why.
    const want = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    for (const k of Object.keys(want)) {
      const a = JSON.stringify(got[k]), b = JSON.stringify(want[k]);
      if (a !== b) { failed++; console.log(`  FAIL ${k}\n       recorded ${b}\n       now      ${a}`); } else console.log(`  ok   ${k}`);
    }
  }
  failed += await isolation(browser);
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? `\n${failed} failures: the main's income figures moved, or an alt reached the main's ledger` : '\nthe main\'s income figures are as recorded');
process.exit(failed ? 1 : 0);
