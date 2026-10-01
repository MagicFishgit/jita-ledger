// Every page, opened with an empty, a small and a large ledger. A page fails when it throws, shows its error
// boundary ("This page hit an error"), or React logs a warning (a duplicate key, a missing one). Run it with
// `npm run check-pages`: it starts its own Vite server and a headless Chromium (Playwright's, already on this
// machine for the Playwright MCP), and refuses every request that isn't to that server, so it needs no network and
// each page also has to survive ESI and the cloud being unreachable.
//
// Why: the Wallet once crashed the whole app on a ledger with trades but no journal, and Results keyed a list by
// item name that only broke with two positions on one item. Rich hand-made seeds don't find those; an empty store,
// a thin one and a big generated one, on every page, do.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const PORT = 5188;
const BASE = `http://localhost:${PORT}/jita-ledger/`;
/** Where the browser stores are seeded from: the app's origin, but not the app. */
const SEED_PAGE = `${BASE}src/lib/constants.ts`;
// The cloud is somewhere nothing answers, so it fails fast rather than reaching the real one.
process.env.VITE_CLOUD_URL = 'http://127.0.0.1:9';


import { NOW, DAY, iso, small, large, ALTS, altStoreOf, charsOf, ownerAuth, strangerAuth, withBalances } from './ledgers.mjs';

const PAGES = [
  'wallet', 'todo', 'calculator', 'calculator?type=34', 'prospects', 'watchlist', 'planner', 'arbitrage', 'sniper', 'reprocess',
  'positions', 'positions/{first}', 'orders', 'loot', 'blueprints', 'results', 'loyalty',
  'hustles/abyssal', 'hustles/courier', 'hustles/planets', 'hustles/mining', 'hustles/freelance', 'combat', 'characters', 'omega',
  'settings/account', 'settings/skills', 'settings/rates', 'settings/alerts', 'settings/appearance', 'settings/data', 'settings/scan',
];

const ALL = { empty: {}, small: small(), large: large() };

for (const [name, list] of Object.entries(ALTS)) if (list.length) ALL[name].chars = charsOf(list);

/**
 * ISK sent to the first alt and some back from the last (a donation each way, and a contract price on the large ledger),
 * so the Wallet draws its "Between your characters" line and the phone check measures it at 390 px. Added here only:
 * check-income's ledger holds no characters, and as donations to strangers these would move the play it records.
 */
function withTransfers(journal, list) {
  const main = ownerAuth().characterId, first = list[0].entry.charId, last = list[list.length - 1].entry.charId;
  const old = Object.values(journal).sort((a, b) => a.date.localeCompare(b.date));
  const start = old.length ? old[0].balance - old[0].amount : 1e9;
  const sent = [
    { id: 'move-out', date: iso(NOW - 2 * DAY), refType: 'player_donation', amount: -100_000_000, firstPartyId: main, secondPartyId: first, description: 'Owner deposited cash into an alt’s account' },
    { id: 'move-back', date: iso(NOW - DAY), refType: 'player_donation', amount: 20_250_000, firstPartyId: last, secondPartyId: main, description: 'An alt deposited cash into Owner’s account' },
    ...(list.length > 1 ? [{ id: 'move-contract', date: iso(NOW - 3 * DAY), refType: 'contract_price', amount: -45_500_000, firstPartyId: main, secondPartyId: list[1].entry.charId, description: 'Contract price' }] : []),
  ];
  return withBalances([...old.map(({ balance: _b, ...e }) => e), ...sent], start).journal;
}
for (const [name, list] of Object.entries(ALTS)) if (list.length) ALL[name].journal = withTransfers(ALL[name].journal, list);
// `LEDGER=large PAGE=results npm run check-pages` runs just those (comma-separated), for working on one.
const only = (v) => (v ? v.split(',') : null);
const LEDGERS = Object.fromEntries(Object.entries(ALL).filter(([k]) => !only(process.env.LEDGER) || only(process.env.LEDGER).includes(k)));
const SHOWN = PAGES.filter((p) => !only(process.env.PAGE) || only(process.env.PAGE).some((x) => p.startsWith(x)));
/**
 * `PHONE=1`: at a phone's width (390 px, touch) instead, where a page also fails if anything sticks out past the
 * right edge of the screen. A table that scrolls sideways inside its own box is fine; only what the page can't show is not.
 */
const PHONE = process.env.PHONE === '1';
/** `SHOTS=dir`: also save a screenshot of each page there, tall enough to see most of it, for looking over by eye. */
const SHOTS = process.env.SHOTS;
const VIEW = PHONE ? { viewport: { width: 390, height: SHOTS ? 2200 : 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: SHOTS ? 1800 : 900 } };

/** What sticks out past the right edge of the page area, outermost first: a short description of each. */
async function overflow(page) {
  return page.evaluate(() => {
    const content = document.querySelector('.content');
    if (!content) return [];
    const limit = content.getBoundingClientRect().right + 1;
    const out = [];
    const bad = new Set();
    for (const el of content.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.right <= limit) continue;
      // Inside a box that scrolls sideways and itself fits: the table-in-a-box case, which is fine on a phone. A box
      // that only hides what sticks out is not: that content is cut off (Omega's comparison lost its Omega column).
      let boxed = false, cut = false;
      for (let p = el.parentElement; p && p !== content; p = p.parentElement) {
        const x = getComputedStyle(p).overflowX;
        if (p.getBoundingClientRect().right > limit) continue;
        if (x === 'auto' || x === 'scroll') { boxed = true; break; }
        if (x === 'hidden' || x === 'clip') { cut = true; break; }
      }
      if (boxed || getComputedStyle(el).position === 'fixed') continue;
      if (cut && r.left >= limit) continue; // wholly outside and hidden: an off-screen piece of a carousel or a clipped decoration
      bad.add(el);
      if (bad.has(el.parentElement)) continue;
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      out.push(`${el.tagName.toLowerCase()}${cls} ${Math.round(r.right - limit)} px ${cut ? 'cut off' : 'over'}: “${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50)}”`);
    }
    return out.slice(0, 6);
  });
}

/** A name each ledger's Positions page must show, proving the seed reached the app. */
const PROOF = { small: 'Hammerhead II', large: 'Test Item' };

/**
 * The Mining tab under an alt, on the large ledger: its filter and Show for kept in this browser, as a visit leaves them,
 * so the deploy draws what the plain visit never does (it always shows the main): an Alpha alt's pilot, with a hull open
 * so its tiers draw too; an alt whose login was refused and nothing read; and a kept character no longer on the roster.
 * Each must show text only that path draws (`proof`), or it would pass on the main's pilot: the roster loads after the
 * page first draws, and until then the tab falls back to the main.
 */
const MINING_CASES = [
  { label: 'Miner Two picked and shown', keep: { 'mining-char': '900001', 'mining-show': '900001' },
    proof: ['What Miner Two mined', 'Yields at Miner Two’s skills', 'Trained to V; Alpha uses IV: Omega opens it', 'Alpha can’t use it: Omega opens it'] },
  { label: 'Miner Two shown, the Procurer open', open: 17480, proof: ['Miner Two’s pace in it', 'From ESI’s figures, without boosts'] },
  { label: 'Hauler Four shown, refused and never read', keep: { 'mining-show': '900003' },
    proof: ['What your characters mined', 'Not read: EVE refused Hauler Four’s login', 'Its login was refused: hand it over again on the Characters page'] },
  { label: 'a kept character no longer on the roster', keep: { 'mining-char': '999999' }, proof: ['What your characters mined', 'Yields at your skills'] },
];

// ---- Run ----------------------------------------------------------------------------------------------------

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const failures = [];
let checked = 0;
try {
  for (const [name, data] of Object.entries(LEDGERS)) {
    const page = await browser.newPage(VIEW);
    await page.route('**/*', (route) => (route.request().url().startsWith(`http://localhost:${PORT}/`) ? route.continue() : route.abort()));
    let problems = [];
    page.on('pageerror', (e) => problems.push(`threw: ${e.message.split('\n')[0]}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/^Warning: /.test(t)) problems.push(`React: ${t.split('\n')[0].replace(/%s/g, '').slice(0, 160)}`);
    });
    // Seed: the ledger into its store, nothing in the cache or localStorage, then load the app on it. Written from a
    // page on the app's origin that isn't the app (Vite serves a module as it is): under the open app, the ledger it
    // holds in memory could be written back over the seed (docs/notes/gotchas.md).
    await page.goto(SEED_PAGE);
    await page.evaluate(async ([d, auth, alts]) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('jita-ledger:auth', JSON.stringify(auth));
      const open = (db) => new Promise((res, rej) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onerror = rej; q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
      for (const [db, put] of [['jita-ledger', d], ['jita-ledger-cache', {}], ['jita-ledger-alts', alts]]) {
        const h = await open(db);
        if (!h.objectStoreNames.contains('kv')) continue;
        await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
        h.close();
      }
    }, [data, ownerAuth(), altStoreOf(ALTS[name] ?? [])]);
    await page.goto(BASE);
    await page.waitForSelector('.page', { timeout: 20_000 });
    // The seed has to have reached the app, or every page below passes on an empty store.
    if (PROOF[name]) {
      await page.evaluate(() => { location.hash = '#positions'; });
      await page.waitForTimeout(1000);
      if (!(await page.locator('.page', { hasText: PROOF[name] }).count())) failures.push({ ledger: name, page: 'positions', problems: [`the ${name} ledger didn't load: no “${PROOF[name]}”`] });
    }
    // And the alts' seed has to have reached the Characters page, or it passes on an empty roster.
    if (ALTS[name]?.length) {
      await page.evaluate(() => { location.hash = '#characters'; });
      await page.waitForTimeout(1000);
      if (!(await page.locator('.page', { hasText: ALTS[name][0].entry.name }).count())) failures.push({ ledger: name, page: 'characters', problems: [`the ${name} ledger's alts didn't load: no “${ALTS[name][0].entry.name}”`] });
    }
    /** One page load judged: a throw or React warning since `problems` was cleared, the error boundary, no page, past the edge. */
    const judge = async (label) => {
      const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
      if (boundary) problems.push(`error boundary: ${(await page.locator('.notice.err[role="alert"] pre').first().innerText().catch(() => '')).slice(0, 160)}`);
      if (!(await page.locator('.page').count())) problems.push('no page rendered');
      if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out: ${o}`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}-${name}-${label.replace(/[^a-z0-9]+/gi, '_')}.png` });
      checked++;
      const unique = [...new Set(problems)];
      if (unique.length) failures.push({ ledger: name, page: label, problems: unique });
      process.stdout.write(unique.length ? `  FAIL ${name} #${label}\n${unique.map((x) => `       ${x}`).join('\n')}\n` : `  ok   ${name} #${label}\n`);
    };
    const first = data.positions?.[0]?.id;
    for (const p of SHOWN) {
      if (p.includes('{first}') && !first) continue;
      const hash = p.replace('{first}', first ?? '');
      problems = [];
      await page.evaluate((h) => { location.hash = `#${h}`; }, hash);
      await page.waitForTimeout(1500);
      await judge(hash);
    }
    if (name === 'large' && SHOWN.includes('hustles/mining')) {
      for (const c of MINING_CASES) {
        problems = [];
        if (c.keep) {
          // Kept as a visit leaves them, then the tab opened afresh (it reads them as it mounts): another page first,
          // since setting the hash it already has wouldn't draw it again.
          await page.evaluate((keep) => {
            for (const k of ['mining-char', 'mining-show']) localStorage.removeItem(`jita-ledger:${k}`);
            for (const [k, v] of Object.entries(keep)) localStorage.setItem(`jita-ledger:${k}`, v);
            location.hash = '#settings/appearance';
          }, c.keep);
          await page.waitForTimeout(500);
          await page.evaluate(() => { location.hash = '#hustles/mining'; });
        } else {
          // A hull opened in the tree (the list on a phone), where the alt's tiers draw.
          await page.locator(`${PHONE ? '.mtree-row' : '.mtree-node'}:has(img[src*="/types/${c.open}/"])`).first().click().catch((e) => problems.push(`couldn't open the hull: ${e.message.split('\n')[0]}`));
        }
        await page.waitForTimeout(1500);
        for (const t of c.proof) if (!(await page.locator('.page', { hasText: t }).count())) problems.push(`not drawn: no “${t}”`);
        await judge(`hustles/mining (${c.label})`);
      }
      await page.evaluate(() => { for (const k of ['mining-char', 'mining-show']) localStorage.removeItem(`jita-ledger:${k}`); });
    }
    await page.close();
  }
  // The site is public: without the owner's login, only the landing page, with nothing of the ledger's in it and
  // nothing run behind it (not one request to ESI), even with a ledger in this browser.
  if (!only(process.env.LEDGER) && !only(process.env.PAGE)) {
    for (const [who, auth] of [['logged out', null], ['someone else', strangerAuth()]]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      let esiCalls = 0;
      await page.route('**/*', (route) => {
        const u = route.request().url();
        if (u.startsWith(`http://localhost:${PORT}/`)) return route.continue();
        if (u.includes('esi.evetech.net')) esiCalls++;
        return route.abort();
      });
      await page.goto(SEED_PAGE);
      await page.evaluate(async ([d, a, alts]) => {
        localStorage.clear(); sessionStorage.clear();
        if (a) localStorage.setItem('jita-ledger:auth', JSON.stringify(a));
        for (const [db, put] of [['jita-ledger', d], ['jita-ledger-alts', alts]]) {
          const h = await new Promise((res) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
          await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
          h.close();
        }
      }, [ALL.large, auth, altStoreOf(ALTS.large)]);
      await page.goto(BASE);
      await page.waitForTimeout(2500);
      esiCalls = 0;
      for (const hash of ['wallet', 'orders', 'positions', 'prospects', 'characters', 'settings/data']) {
        await page.evaluate((h) => { location.hash = `#${h}`; }, hash);
        await page.waitForTimeout(700);
        const problems = [];
        if (!(await page.locator('.landing').count())) problems.push('no landing page');
        if (await page.locator('.page').count()) problems.push('a page of the app showed');
        if (await page.locator('body', { hasText: PROOF.large }).count()) problems.push('the ledger showed');
        if (await page.locator('body', { hasText: ALTS.large[0].entry.name }).count()) problems.push('an alt showed');
        checked++;
        if (problems.length) failures.push({ ledger: who, page: hash, problems });
        process.stdout.write(problems.length ? `  FAIL ${who} #${hash}\n${problems.map((x) => `       ${x}`).join('\n')}\n` : `  ok   ${who} #${hash}\n`);
      }
      const extra = [];
      if (esiCalls) extra.push(`${esiCalls} requests to ESI while logged out`);
      if (auth && !(await page.locator('.landing', { hasText: 'isn’t this ledger’s owner' }).count())) extra.push('no word that they were logged out');
      if (auth && (await page.evaluate(() => localStorage.getItem('jita-ledger:auth')))) extra.push('their login was kept');
      checked++;
      if (extra.length) failures.push({ ledger: who, page: 'landing', problems: extra });
      process.stdout.write(extra.length ? `  FAIL ${who}: ${extra.join('; ')}\n` : `  ok   ${who}: nothing ran${auth ? ', logged straight out' : ''}\n`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failures.length ? `\n${failures.length} of ${checked} page loads failed` : `\nall ${checked} page loads passed`);
process.exit(failures.length ? 1 : 0);
