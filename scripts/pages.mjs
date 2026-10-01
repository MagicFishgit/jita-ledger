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


import { small, large, ALTS, altStoreOf, charsOf, ownerAuth, strangerAuth, withTransfers } from './ledgers.mjs';

const PAGES = [
  'wallet', 'todo', 'calculator', 'calculator?type=34', 'prospects', 'watchlist', 'planner', 'arbitrage', 'sniper', 'reprocess',
  'positions', 'positions/{first}', 'orders', 'loot', 'blueprints', 'results', 'loyalty',
  'hustles/abyssal', 'hustles/courier', 'hustles/planets', 'hustles/mining', 'hustles/freelance', 'combat', 'characters', 'omega',
  'settings/account', 'settings/skills', 'settings/rates', 'settings/alerts', 'settings/appearance', 'settings/data', 'settings/scan',
];

const ALL = { empty: {}, small: small(), large: large() };

for (const [name, list] of Object.entries(ALTS)) if (list.length) ALL[name].chars = charsOf(list);

/**
 * ISK sent to the first alt and some back from the last (a donation each way, and a contract price on the large ledger:
 * ledgers.mjs `withTransfers`), so the Wallet draws its "Between your characters" line and the phone check measures it
 * at 390 px. The income check's recording holds no characters, and as donations to strangers these would move the play
 * it records; it proves the Wallet's figures equal with and without them on a ledger of its own. `MOVED`: the ledgers
 * given transfers, whose Wallet must draw the line, where a ledger without one must not.
 */
const MOVED = new Set();
for (const [name, list] of Object.entries(ALTS)) if (list.length) { ALL[name].journal = withTransfers(ALL[name].journal, list); MOVED.add(name); }
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
 * A scan for the large ledger, so Prospects and the Capital planner draw rows and their flags rather than an empty
 * state: four items (fake IDs), judged at the app's default rates (Alpha, 3% broker, 7.5% tax).
 * - 990101: both fronts reached on every day, and a watch of its book that sees more stock placed at each front than
 *   fills there: the planner keeps two raises a side back ("Raises kept back").
 * - 990102: its front bid reached on 9 of 14 days but none of the last 5 ("Bids not reached", not lately).
 * - 990103: ran up 80% over the month before: flagged on Prospects ("Ran up lately"), left out of the planner.
 * - 990104: stats from before the run-up was kept: the planner says to scan again, and no flag is claimed.
 */
function planScan(now) {
  const day = (i) => new Date(now - i * 86400_000).toISOString().slice(0, 10);
  const lowsEnd = day(1);
  const M = 1e6;
  const stats = (typeId, lows14, highs14, extra = {}) => ({
    typeId, at: new Date(now - 3600_000).toISOString(), daysTraded: 30, tradesPerDay: 60, unitsPerDay: 600, spikiness: 0.04,
    dailyRange: 0.3, trend: 0, avgPrice: 1.2 * M, spark: Array(30).fill(600), buyerShare: 0.5, high30: 1.6 * M, spike: false,
    range7: Array(7).fill(0.3), lows14, lowsEnd, highs14, lastMove: 0, runUp: 0, runUpBase: 1.2 * M, ...extra,
  });
  const flat = (x) => Array(14).fill(x);
  const book = (typeId, bid, ask) => ({ at: new Date(now - 600_000).toISOString(), bestBuy: bid, bestSell: ask, buyOrders: 30, sellOrders: 30,
    topBuys: [{ price: bid, volume: 40 }, { price: bid - 1000, volume: 40 }], topSells: [{ price: ask, volume: 40 }, { price: ask + 1000, volume: 40 }], npcSell: false });
  const items = {
    990101: [stats(990101, flat(1 * M), flat(1.4 * M)), book(990101, 1 * M, 1.4 * M)],
    990102: [stats(990102, [...Array(9).fill(1 * M), 1.1 * M, 1.12 * M, 1.1 * M, 1.11 * M, 1.13 * M], flat(1.5 * M)), book(990102, 1 * M, 1.5 * M)],
    990103: [stats(990103, flat(1 * M), flat(1.4 * M), { runUp: 0.8, runUpBase: 0.8 * M }), book(990103, 1 * M, 1.4 * M)],
    990104: [stats(990104, flat(1 * M), flat(1.4 * M), { runUp: undefined, runUpBase: undefined }), book(990104, 1 * M, 1.4 * M)],
  };
  const busy = { h: 15, sell: 18, buy: 6, newSell: 37, newBuy: 15, frontSell: 2, frontBuy: 2, repriceSell: 0, repriceBuy: 0 };
  return {
    prospects: {
      stats: Object.fromEntries(Object.entries(items).map(([t, [st]]) => [t, st])),
      books: Object.fromEntries(Object.entries(items).map(([t, [, b]]) => [t, b])),
      sample: { at: new Date(now - 3600_000).toISOString(), totalPages: 400, sampledPages: 400, minSampled: 1, counts: { 990101: 60, 990102: 60, 990103: 60, 990104: 60 } },
      runs: { cloud: new Date(now - 3600_000).toISOString() },
    },
    flow: { log: { 990101: { [day(1)]: busy, [day(0)]: busy } }, ends: {} },
  };
}
/** What the large ledger's Prospects and planner must draw from that scan, and what the planner's mix must not hold. */
const PLAN_PROOF = {
  prospects: { drawn: ['Ran up lately', 'Bids not reached'] },
  planner: { drawn: ['Raises kept back', 'Bids not reached'], note: 'Scan again before investing', absent: ['Ran up lately'] },
};

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
  // The best-ore panel's ISK an hour follows the tier open, at the alt's skills.
  { label: 'Miner Two shown, the Procurer open', open: 17480, proof: ['Miner Two’s pace in it', 'From ESI’s figures, without boosts', 'Solid Procurer, at Miner Two’s skills'] },
  { label: 'Hauler Four shown, refused and never read', keep: { 'mining-show': '900003' },
    proof: ['What your characters mined', 'Not read: EVE refused Hauler Four’s login', 'Its login was refused: hand it over again on the Characters page'] },
  { label: 'a kept character no longer on the roster', keep: { 'mining-char': '999999' }, proof: ['What your characters mined', 'Yields at your skills'] },
  // The best-ore panel priced: ESI answers for two ores from fixtures, so the deploy draws a priced row and an opened one,
  // not only the "couldn't read the names" state every other load draws (final review, M8).
  { label: 'the best-ore panel priced, Scordite opened', esi: true, proof: ['Best ore to mine'] },
];

/**
 * Two ores and a grade answering from ESI, with fake IDs (99xxxx) so the bundled materials stay out of it: priced as they
 * are and compressed. Anything else ESI is asked falls through to the refusal.
 */
const ORE_FIXTURE = {
  types: {
    990001: { name: 'Scordite', group: 990100, volume: 0.15, bid: 20 },
    990002: { name: 'Scordite II-Grade', group: 990100, volume: 0.15, bid: 24 },
    990003: { name: 'Compressed Scordite', group: 990101, volume: 0.0015, bid: 26 },
    990004: { name: 'Veldspar', group: 990102, volume: 0.1, bid: 15 },
  },
  groups: { 990100: [990001, 990002] },
};
async function answerOres(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (url.hostname !== 'esi.evetech.net') return route.fallback();
  const json = (body, headers = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(Date.now() + 300_000).toUTCString(), ...headers }, body: JSON.stringify(body) });
  const p = url.pathname;
  if (p === '/universe/ids/' && req.method() === 'POST') {
    const names = JSON.parse(req.postData() ?? '[]');
    const hits = Object.entries(ORE_FIXTURE.types).filter(([, t]) => names.includes(t.name)).map(([id, t]) => ({ id: Number(id), name: t.name }));
    return json(hits.length ? { inventory_types: hits } : {});
  }
  let m = /^\/universe\/types\/(\d+)\/$/.exec(p);
  if (m && ORE_FIXTURE.types[m[1]]) { const t = ORE_FIXTURE.types[m[1]]; return json({ type_id: Number(m[1]), name: t.name, group_id: t.group, market_group_id: 1, volume: t.volume, published: true }); }
  m = /^\/universe\/groups\/(\d+)\/$/.exec(p);
  if (m && ORE_FIXTURE.groups[m[1]]) return json({ group_id: Number(m[1]), name: 'Fixture ore', types: ORE_FIXTURE.groups[m[1]] });
  const t = p === '/markets/10000002/orders/' ? ORE_FIXTURE.types[url.searchParams.get('type_id')] : null;
  if (t) return json([{ order_id: 1, type_id: Number(url.searchParams.get('type_id')), location_id: 60003760, is_buy_order: true, price: t.bid, volume_remain: 1000, volume_total: 1000, issued: '2026-10-01T00:00:00Z', duration: 90, min_volume: 1, range: 'station' }], { 'x-pages': '1' });
  if (p === '/markets/prices/') return json([]);
  if (p === '/universe/stations/60003760/') return json({ station_id: 60003760, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', reprocessing_efficiency: 0.5 });
  return route.fallback();
}
/** A row of the best-ore table by its name: its cells' text, or null. */
const oreRow = (page, name) => page.evaluate((nm) => {
  const tr = [...document.querySelectorAll('table.bo-table tbody tr')].find((r) => [...r.querySelectorAll('.name')].some((x) => x.textContent.trim() === nm));
  return tr ? [...tr.children].map((td) => td.innerText.replace(/\s+/g, ' ').trim()) : null;
}, name);

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
    await page.evaluate(async ([d, auth, alts, scan]) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('jita-ledger:auth', JSON.stringify(auth));
      if (scan) {
        // Prospects sized to what the scan's items can take; the planner given ISK and slots (the large ledger's 400 orders fill its own).
        localStorage.setItem('jita-ledger:prospects', JSON.stringify({ f: { budget: 1e7, horizonDays: 3, minTrades: 5, minDays: 20, minRoi: 0.03, maxSpikiness: 0.5, demoteFlagged: true }, sort: { key: 'roiDay', dir: 'desc' } }));
        sessionStorage.setItem('jita-ledger:planner-session', JSON.stringify({ isk: 1e9, slots: 10 }));
      }
      const open = (db) => new Promise((res, rej) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onerror = rej; q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
      for (const [db, put] of [['jita-ledger', d], ['jita-ledger-cache', scan ?? {}], ['jita-ledger-alts', alts]]) {
        const h = await open(db);
        if (!h.objectStoreNames.contains('kv')) continue;
        await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
        h.close();
      }
    }, [data, ownerAuth(), altStoreOf(ALTS[name] ?? []), name === 'large' ? planScan(Date.now()) : null]);
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
      // The seeded transfers must reach the Wallet as their own line, or the phone check passes without measuring it.
      if (hash === 'wallet') {
        const drawn = await page.locator('.between-line', { hasText: 'Between your characters' }).count();
        if (MOVED.has(name) && !drawn) problems.push('not drawn: no “Between your characters” on a ledger with transfers');
        if (!MOVED.has(name) && drawn) problems.push('“Between your characters” drawn on a ledger with no transfer');
      }
      // The refused alt (Hauler Four) must reach To do as its own item, or the check passes without one.
      if (hash === 'todo' && ALTS[name]?.some((x) => x.entry.refusedAt != null)) {
        const refused = ALTS[name].find((x) => x.entry.refusedAt != null).entry;
        if (!(await page.locator('.page', { hasText: `Hand the cloud ${refused.name}’s login again` }).count())) problems.push(`not drawn: no To do item for ${refused.name}’s refused login`);
      }
      // The best-ore panel must draw with its place selector, and say plainly that it couldn't price: every request
      // outside this server is refused here, so ESI never names the ores (never a zero, never "Pricing…" for good).
      if (hash === 'hustles/mining') {
        if (!(await page.locator('.panel-title', { hasText: 'Best ore to mine' }).count())) problems.push('not drawn: no “Best ore to mine” panel');
        if (!(await page.locator('[role="group"][aria-label="Where it’s found"] button', { hasText: 'Null-sec' }).count())) problems.push('not drawn: no place selector on the best-ore panel');
        if (!(await page.locator('.page', { hasText: 'Couldn’t read the ores’ names from ESI just now' }).count())) problems.push('not drawn: the best-ore panel doesn’t say it couldn’t price');
      }
      // The large ledger's scan must reach Prospects and the planner with its flags, or both pass on an empty state.
      if (name === 'large' && PLAN_PROOF[hash]) {
        for (const t of PLAN_PROOF[hash].drawn) if (!(await page.locator('.page table .flag', { hasText: t }).count())) problems.push(`not drawn: no “${t}” flag`);
        for (const t of PLAN_PROOF[hash].absent ?? []) if (await page.locator('.page table', { hasText: t }).count()) problems.push(`in the table, and shouldn’t be: “${t}”`);
        if (PLAN_PROOF[hash].note && !(await page.locator('.page', { hasText: PLAN_PROOF[hash].note }).count())) problems.push(`not drawn: no “${PLAN_PROOF[hash].note}”`);
      }
      await judge(hash);
    }
    if (name === 'large' && SHOWN.includes('hustles/mining')) {
      for (const c of MINING_CASES) {
        problems = [];
        if (c.esi) await page.route('**/*', answerOres);
        if (c.keep || c.esi) {
          // Kept as a visit leaves them, then the tab opened afresh (it reads them as it mounts): another page first,
          // since setting the hash it already has wouldn't draw it again.
          await page.evaluate((keep) => {
            for (const k of ['mining-char', 'mining-show']) localStorage.removeItem(`jita-ledger:${k}`);
            for (const [k, v] of Object.entries(keep)) localStorage.setItem(`jita-ledger:${k}`, v);
            location.hash = '#settings/appearance';
          }, c.keep ?? {});
          await page.waitForTimeout(500);
          await page.evaluate(() => { location.hash = '#hustles/mining'; });
        } else {
          // A hull opened in the tree (the list on a phone), where the alt's tiers draw.
          await page.locator(`${PHONE ? '.mtree-row' : '.mtree-node'}:has(img[src*="/types/${c.open}/"])`).first().click().catch((e) => problems.push(`couldn't open the hull: ${e.message.split('\n')[0]}`));
        }
        await page.waitForTimeout(1500);
        for (const t of c.proof) if (!(await page.locator('.page', { hasText: t }).count())) problems.push(`not drawn: no “${t}”`);
        if (c.esi) {
          // A priced figure on Scordite's row, then its grades opened and the II-Grade priced.
          const priced = (cells) => !!cells && cells.some((x) => /^\d[\d,.]* ISK/.test(x));
          const scordite = await oreRow(page, 'Scordite');
          if (!priced(scordite)) problems.push(`the best-ore panel drew no priced Scordite: ${JSON.stringify(scordite)}`);
          await page.locator('table.bo-table button.expander[aria-label^="Scordite:"]').click().catch((e) => problems.push(`couldn't open Scordite: ${e.message.split('\n')[0]}`));
          await page.waitForTimeout(1500);
          const grade = await oreRow(page, 'Scordite II-Grade');
          if (!priced(grade)) problems.push(`the best-ore panel drew no priced Scordite II-Grade when opened: ${JSON.stringify(grade)}`);
          await page.unroute('**/*', answerOres);
        }
        await judge(`hustles/mining (${c.label})`);
      }
      await page.evaluate(() => { for (const k of ['mining-char', 'mining-show']) localStorage.removeItem(`jita-ledger:${k}`); });
    }
    await page.close();
  }
  // The Wallet open on an empty ledger that then fills under it, as a first sync or a restore does. A hook placed after
  // the page's early return for an empty ledger runs only once there is something to show, so React throws as the ledger
  // fills ("Rendered more hooks than during the previous render"); opened on a full ledger, or an empty one that stays
  // empty, the page never shows it. Filled through the app's own store (`update`, as from the cloud so nothing is
  // pushed), never IndexedDB under the open app (docs/notes/gotchas.md). Desktop only: the bug doesn't depend on width.
  if (!PHONE && SHOWN.includes('wallet') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('empty'))) {
    const page = await browser.newPage(VIEW);
    await page.route('**/*', (route) => (route.request().url().startsWith(`http://localhost:${PORT}/`) ? route.continue() : route.abort()));
    const problems = [];
    page.on('pageerror', (e) => problems.push(`threw: ${e.message.split('\n')[0]}`));
    page.on('console', (m) => { if (m.type() === 'error' && /^Warning: /.test(m.text())) problems.push(`React: ${m.text().split('\n')[0].replace(/%s/g, '').slice(0, 160)}`); });
    await page.goto(SEED_PAGE);
    await page.evaluate(async (auth) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('jita-ledger:auth', JSON.stringify(auth));
      const open = (db) => new Promise((res, rej) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onerror = rej; q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
      for (const db of ['jita-ledger', 'jita-ledger-cache', 'jita-ledger-alts']) {
        const h = await open(db);
        if (!h.objectStoreNames.contains('kv')) continue;
        await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); t.objectStore('kv').clear(); t.oncomplete = res; });
        h.close();
      }
    }, ownerAuth());
    await page.goto(`${BASE}#wallet`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    await page.waitForTimeout(1000);
    const flowsDrawn = () => page.locator('.page', { hasText: 'Where it came from, where it went' }).count();
    if (await flowsDrawn()) problems.push('didn’t open on the empty Wallet: it already shows flows');
    await page.evaluate(async (d) => {
      // The app's own instance of the store, by the URL it loaded it from: importing another would fill an empty copy.
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/lib\/store\.ts(\?|$)/.test(n)) ?? `${location.origin}/jita-ledger/src/lib/store.ts`;
      const { update } = await import(url);
      update(d, { origin: 'cloud' });
    }, small());
    await page.waitForTimeout(1500);
    const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push(`error boundary: ${(await page.locator('.notice.err[role="alert"] pre').first().innerText().catch(() => '')).slice(0, 160)}`);
    else if (!(await flowsDrawn())) problems.push('the ledger never reached the open Wallet: it still shows no flows, so this proved nothing');
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'empty, then filled', page: 'wallet', problems: unique });
    process.stdout.write(unique.length ? `  FAIL empty, then filled #wallet\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   empty, then filled #wallet\n');
    await page.close();
  }
  // Orders knowing a plan (task 2 of "plans that hold their margin"): the user's Praxis at its third raise, its plan open,
  // and a buy bidding over what it resells for. Its verdicts need a checked book, which every other load here refuses, so
  // ESI answers these two items' books (nothing else); without this the deploy never drew "Keep it", the plan's chip
  // or the red tag. Both widths, as the run's (PHONE).
  if (SHOWN.includes('orders') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('plan'))) {
    const M = 1e6, PX = 47466, TRIT = 34, JITA = 60003760, ID = 7433389018;
    const seen = [['00:42:35', 206.3], ['08:39:24', 206.7], ['11:22:15', 207.1]].map(([t, p]) => ({ issued: `2026-09-30T${t}Z`, price: p * M, remain: 1 }));
    const books = {
      [PX]: [[ID, 1, 207.1 * M, 1], [9001, 1, 208.3 * M, 4], [9002, 1, 200 * M, 5], [9003, 0, 225 * M, 2], [9004, 0, 230 * M, 10]],
      [TRIT]: [[1, 1, 4.5, 800_000], [9011, 1, 4.4, 5_000_000], [9012, 0, 4.55, 9_000_000]],
    };
    const ledger = {
      settings: { acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, target: 5, share: 7.5, waitHours: 3 },
      plans: [{ id: 'mundr0gwk1vekg', name: '30 Sept · 991.64 M ISK in 4 items', at: '2026-09-30T00:41:37.568Z', isk: 991640000, horizonDays: 7, patient: false,
        items: [{ typeId: PX, buyAt: 206.3 * M, units: 1, sellAt: 226 * M, positionId: 'px' }] }],
      positions: [{ id: 'px', typeId: PX, openedAt: '2026-09-30T00:41:37.568Z', status: 'open', jitaOnly: true, excluded: [], included: [] }],
      orders: {
        [ID]: { orderId: ID, typeId: PX, isBuy: true, price: 207.1 * M, volumeTotal: 1, volumeRemain: 1, issued: seen[2].issued, state: 'open', locationId: JITA, seen },
        1: { orderId: 1, typeId: TRIT, isBuy: true, price: 4.5, volumeTotal: 1_000_000, volumeRemain: 800_000, issued: '2026-10-01T08:00:00Z', state: 'open', locationId: JITA },
      },
      names: { [PX]: 'Praxis', [TRIT]: 'Tritanium' },
      meta: { walletBalance: 1e9, lastSync: new Date(Date.now() - 600_000).toISOString() },
    };
    const page = await browser.newPage(VIEW);
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (route.request().url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      const b = url.hostname === 'esi.evetech.net' && url.pathname === '/markets/10000002/orders/' ? books[url.searchParams.get('type_id')] : null;
      if (!b) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(Date.now() + 300_000).toUTCString(), 'x-pages': '1' },
        body: JSON.stringify(b.map(([id, buy, price, volume]) => ({ order_id: id, type_id: Number(url.searchParams.get('type_id')), location_id: JITA, is_buy_order: buy === 1, price, volume_remain: volume, volume_total: volume, issued: '2026-09-30T00:00:00Z', duration: 90, min_volume: 1, range: 'region' }))) });
    });
    const problems = [];
    page.on('pageerror', (e) => problems.push(`threw: ${e.message.split('\n')[0]}`));
    page.on('console', (m) => { if (m.type() === 'error' && /^Warning: /.test(m.text())) problems.push(`React: ${m.text().split('\n')[0].replace(/%s/g, '').slice(0, 160)}`); });
    await page.goto(SEED_PAGE);
    await page.evaluate(async ([d, auth]) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('jita-ledger:auth', JSON.stringify(auth));
      for (const [db, put] of [['jita-ledger', d], ['jita-ledger-cache', {}], ['jita-ledger-alts', {}]]) {
        const h = await new Promise((res) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
        if (!h.objectStoreNames.contains('kv')) { h.close(); continue; }
        await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
        h.close();
      }
    }, [ledger, ownerAuth()]);
    await page.goto(`${BASE}#orders`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Check prices|Check again/ }).click().catch((e) => problems.push(`couldn't check prices: ${e.message.split('\n')[0]}`));
    await page.waitForSelector('tbody .flag:has-text("Keep it")', { timeout: 20_000 }).catch(() => problems.push('not drawn: no “Keep it” verdict on Praxis'));
    await page.waitForTimeout(800);
    const praxis = (await page.locator(`tr[data-order="${ID}"]`).innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!praxis.includes('Keep it at 207,100,000')) problems.push(`not drawn: Praxis's reason in full under Keep it (${praxis.slice(0, 120)})`);
    if (praxis.includes('208,400,000 ISK')) problems.push('Praxis shows a price to raise to');
    if (!(await page.locator(`tr[data-order="${ID}"] .flag`, { hasText: 'Plan' }).count())) problems.push('not drawn: no “Plan” chip on Praxis');
    if (!(await page.locator('tr[data-order="1"]', { hasText: 'Pays more than it resells for' }).count())) problems.push('not drawn: no “Pays more than it resells for” on the Tritanium buy');
    if (!(await page.locator('.stat', { hasText: 'keep it: raising would cut below' }).locator('button').count())) problems.push('not drawn: no Keep it count beside “worth moving”');
    const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-orders.png` });
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'plan', page: 'orders', problems: unique });
    process.stdout.write(unique.length ? `  FAIL plan #orders\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   plan #orders (Keep it, the plan chip, a buy over its resale)\n');
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
