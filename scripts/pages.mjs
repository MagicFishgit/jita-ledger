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
    const M = 1e6, PX = 47466, TRIT = 34, KEY = 89156, JITA = 60003760, ID = 7433389018;
    // The plan started an hour ago, so its checklist shows on any day the check runs: the Key's 15 placed five minutes
    // before it, after its position opened (Task 3's case), and Praxis not yet placed for it.
    const planAt = Date.now() - 3600_000, iso = (t) => new Date(t).toISOString();
    const seen = [['00:42:35', 206.3], ['08:39:24', 206.7], ['11:22:15', 207.1]].map(([t, p]) => ({ issued: `2026-09-30T${t}Z`, price: p * M, remain: 1 }));
    const books = {
      [PX]: [[ID, 1, 207.1 * M, 1], [9001, 1, 208.3 * M, 4], [9002, 1, 200 * M, 5], [9003, 0, 225 * M, 2], [9004, 0, 230 * M, 10]],
      [TRIT]: [[1, 1, 4.5, 800_000], [9011, 1, 4.4, 5_000_000], [9012, 0, 4.55, 9_000_000]],
    };
    const ledger = {
      settings: { acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, target: 5, share: 7.5, waitHours: 3 },
      plans: [{ id: 'mundr0gwk1vekg', name: '30 Sept · 991.64 M ISK in 4 items', at: iso(planAt), isk: 991640000, horizonDays: 7, patient: false,
        items: [{ typeId: PX, buyAt: 206.3 * M, units: 1, sellAt: 226 * M, positionId: 'px' }, { typeId: KEY, buyAt: 24.95 * M, units: 16, sellAt: 35.99 * M, positionId: 'key' }] }],
      positions: [{ id: 'px', typeId: PX, openedAt: iso(planAt), status: 'open', jitaOnly: true, excluded: [], included: [] },
        { id: 'key', typeId: KEY, openedAt: iso(planAt - 6 * 60_000), status: 'open', jitaOnly: true, excluded: [], included: [] }],
      orders: {
        [ID]: { orderId: ID, typeId: PX, isBuy: true, price: 207.1 * M, volumeTotal: 1, volumeRemain: 1, issued: seen[2].issued, state: 'open', locationId: JITA, seen },
        1: { orderId: 1, typeId: TRIT, isBuy: true, price: 4.5, volumeTotal: 1_000_000, volumeRemain: 800_000, issued: '2026-10-01T08:00:00Z', state: 'open', locationId: JITA },
        7433386979: { orderId: 7433386979, typeId: KEY, isBuy: true, price: 24.95 * M, volumeTotal: 15, volumeRemain: 15, issued: iso(planAt - 5 * 60_000), state: 'open', locationId: JITA },
      },
      names: { [PX]: 'Praxis', [TRIT]: 'Tritanium', [KEY]: 'Vigilance Resonance Key' },
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
    let boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-orders.png` });
    // The plan's checklist on the planner: the Key's order from before the plan counted, never a nudge to replace it.
    await page.evaluate(() => { location.hash = '#planner'; });
    await page.waitForTimeout(1500);
    const placing = (await page.locator('#placing').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!placing.includes('Already placed: 15 of 16 (before the plan)')) problems.push(`not drawn: the checklist's “Already placed: 15 of 16 (before the plan)” (${placing.slice(0, 120)})`);
    if (!placing.includes('EVE can’t change an order’s quantity')) problems.push('not drawn: the checklist’s note on the 1 more');
    boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary on the planner');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out on the planner: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-checklist.png` });
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'plan', page: 'orders', problems: unique });
    process.stdout.write(unique.length ? `  FAIL plan #orders\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   plan #orders (Keep it, the plan chip, a buy over its resale) and #planner (the checklist)\n');
    await page.close();
  }
  // Every freelance job you did (the user's six, 1 October 2026), rebuilt as a browser that never saw them does: only the
  // journal's rewards and the ore bought are seeded, ESI answers the jobs' public details and the ore groups from the
  // fixture, and one reward names a job ESI won't describe (404). The corporations you were in are not seeded: the tab
  // reads them on opening, from ESI's answers as they stood on 1 October 2026 (the history a day behind, ending with
  // School of Applied Knowledge; TEMP TAX HAVEN founded by the character at 19:39:23). Seeded as a sync would have left
  // them, this check drew the tax while the user's tab, opened before its first sync, read "not recorded" on every job
  // and "–" for the totals (2 October 2026). Without this the deploy never drew the history. Both widths.
  if (SHOWN.includes('hustles/freelance') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('freelance'))) {
    const fs = await import('node:fs');
    const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/freelance-history.json', import.meta.url), 'utf8'));
    const GONE = 'deadbeef-0000-4000-8000-000000000000';
    const journal = Object.fromEntries([...fx.journal, { id: '26090000001', date: '2026-09-28T08:00:00Z', refType: 'freelance_jobs_reward', amount: 5_000_000, balance: 1e9,
      firstPartyId: 1000413, secondPartyId: 95210486, description: '-', reason: `project_id=${GONE}:project_name=Old \\u2713 job` }].map((e) => [e.id, e]));
    const ledger = {
      // And 5,000,000 Veldspar not bought (mined, or contracted from the alt) sold during the Veldspar job: said apart.
      txs: Object.fromEntries([...fx.txs, { id: '6880000001', source: 'esi', typeId: 92372, date: '2026-09-20T12:00:00Z', isBuy: false, qty: 5_000_000, unitPrice: 7.15, locationId: 60003760 }].map((t) => [t.id, t])), journal,
      meta: { walletBalance: 1979735843.56, lastSync: new Date(Date.now() - 600_000).toISOString(),
        freelance: { at: '2026-10-01T21:00:00Z', jobs: [] } },
    };
    const details = Object.fromEntries(fx.jobs.map((j) => [j.id, j]));
    const page = await browser.newPage(VIEW);
    let asked = 0;
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (route.request().url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      if (url.hostname !== 'esi.evetech.net') return route.abort();
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'cache-control': 'max-age=0, must-revalidate' }, body: JSON.stringify(body) });
      let m = /^\/freelance-jobs\/([0-9a-f-]{36})\/?$/.exec(url.pathname);
      if (m) { asked++; return details[m[1]] ? json(200, details[m[1]]) : json(404, { error: 'Not found' }); }
      m = /^\/universe\/groups\/(\d+)\/$/.exec(url.pathname);
      if (m && fx.groups[m[1]]) return json(200, { group_id: Number(m[1]), name: 'Ore', types: fx.groups[m[1]] });
      if (url.pathname === '/characters/affiliation/') return json(200, [{ character_id: 95210486, corporation_id: 98845591 }]);
      if (url.pathname === '/characters/95210486/corporationhistory/') return json(200, [{ corporation_id: 1000044, record_id: 64702728, start_date: '2025-05-30T01:17:00Z' }]);
      if (url.pathname === '/corporations/1000044/') return json(200, { name: 'School of Applied Knowledge', tax_rates: { isk: 11, loyalty_point: 0 } });
      if (url.pathname === '/corporations/98845591/') return json(200, { name: 'TEMP TAX HAVEN', ticker: 'ABAAA', tax_rates: { isk: 0, loyalty_point: 0 }, creator_id: 95210486, ceo_id: 95210486, date_founded: '2026-10-01T19:39:23Z' });
      return route.abort();
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
    await page.goto(`${BASE}#hustles/freelance`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    await page.waitForSelector('.fl-history', { timeout: 20_000 }).catch(() => problems.push('not drawn: no history panel'));
    await page.waitForTimeout(2000);
    const text = (await page.locator('.fl-history').innerText().catch(() => '')).replace(/\s+/g, ' ');
    // The six jobs' figures, worked out by hand (scripts/check.mjs), and the job ESI won't describe.
    for (const t of ['Every job you did', '/!\\ Mining Kernite', '..::Buy Back::.. Scordite - all type ✓', 'Galine Bro', '813,258', '17.86 M ISK at cost', '1.01 B ISK', '278.58 M ISK',
      '993.87 M ISK', '386.31 M ISK', 'worked out', 'Old ✓ job', 'ESI won’t describe it', '5,000,000 sold for', 'that weren’t bought for it: left out of the profit']) if (!text.includes(t)) problems.push(`not drawn: “${t}”`);
    // A floor: the sync and the tab can both ask; the seventh is the job ESI answers 404 for.
    if (asked < 7) problems.push(`ESI was asked for ${asked} jobs' details, not the seven the journal names`);
    const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out: ${o}`);
    if (SHOTS) { await page.locator('.fl-history').scrollIntoViewIfNeeded().catch(() => undefined); await page.screenshot({ path: `${SHOTS}-freelance-history.png` }); }
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'freelance', page: 'hustles/freelance', problems: unique });
    process.stdout.write(unique.length ? `  FAIL freelance #hustles/freelance\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   freelance #hustles/freelance (every job you did, rebuilt from the journal)\n');
    await page.close();
  }
  // The Sniper with finds (2 October 2026: blueprints out unless asked, and Copy for Multibuy). The cloud answers its
  // read, six finds from the read of 1 October 23:27 UTC: a module, a battery and a script, an Epithal Blueprint, a
  // reaction formula (category 9, no "Blueprint" in its name) and a Thrasher Blueprint the read gives no category for (a
  // Worker a version behind), which ESI answers here. Without this the deploy never drew a find, the switch or the copy.
  if (SHOWN.includes('sniper') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('sniper'))) {
    const now = Date.now(), iso = (t) => new Date(t).toISOString();
    const L = (typeId, category, units, cost, cheapest, resale, fair, nextAsk, perDay, daysTraded, doubts = []) => ({
      typeId, orderIds: [typeId * 10], units, cost, cheapest, top: cheapest, resale, fair, nextAsk, pricedAt: iso(now - 20 * 60_000), partly: false,
      perDay, daysTraded, lastMove: 0, doubts, ...(category === undefined ? {} : { category }) });
    const read = { at: iso(now - 60_000), expires: iso(now + 240_000), pages: 406, bids: [], listings: [
      L(6721, 7, 133, 7_811_090, 58_730, 98_850, 98_935, 98_860, 100, 30), L(17771, 23, 6, 18_000_000, 3_000_000, 3_990_000, 3_990_000, 4_798_000, 4, 19),
      L(29001, 8, 496, 3_537_968, 7_133, 12_290, 12_360, 12_300, 2544, 30), L(990, 9, 8, 51_200_000, 6_400_000, 8_473_000, 8_479_000, 8_474_000, 3, 30),
      L(46233, 9, 137, 137_000_000, 1_000_000, 1_200_000, 1_200_000, 1_495_000, 5, 23, ['flood']), L(16243, undefined, 5, 40_000_000, 8_000_000, 10_990_000, 12_000_000, 11_000_000, 3, 30)] };
    const names = { 6721: 'Small Focused Anode Particle Stream I', 17771: 'Medium AutoCannon Battery', 29001: 'Tracking Speed Script', 990: 'Epithal Blueprint', 46233: 'Synth Blue Pill Booster Reaction Formula', 16243: 'Thrasher Blueprint' };
    const ledger = { names, alerts: { snipeMinIsk: 1e6, snipeMinPct: 5 }, meta: { walletBalance: 1e9, lastSync: iso(now - 600_000) } };
    const page = await browser.newPage(VIEW);
    // What the page puts on the clipboard, kept where the check can read it.
    await page.addInitScript(() => {
      window.__copied = [];
      try { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (t) => { window.__copied.push(t); } }); } catch { /* no clipboard: the check says so */ }
    });
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
    let typeAsked = 0;
    await page.route('**/*', (route) => {
      const req = route.request(), url = new URL(req.url());
      if (req.url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { ...cors, 'cache-control': 'max-age=3600' }, body: JSON.stringify(body) });
      if (url.host === '127.0.0.1:9' && url.pathname === '/v1/snipes') return json(read);
      if (url.hostname === 'esi.evetech.net' && /^\/universe\/types\/16243\/?$/.test(url.pathname)) { typeAsked++; return json({ type_id: 16243, name: names[16243], group_id: 487, published: true }); }
      if (url.hostname === 'esi.evetech.net' && /^\/universe\/groups\/487\/?$/.test(url.pathname)) return json({ group_id: 487, name: 'Destroyer Blueprint', category_id: 9 });
      return route.abort();
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
    await page.goto(`${BASE}#sniper`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    const worth = page.locator('section.panel', { hasText: 'Worth sniping' });
    const inWorth = async (n) => (await worth.locator('table tbody tr', { hasText: n }).count()) > 0;
    // The switch counts the three blueprints once the Thrasher's category has come back from ESI.
    await page.waitForSelector('button[role="checkbox"]:has-text("Include blueprints (3)")', { timeout: 20_000 }).catch(() => problems.push('not drawn: “Include blueprints (3)”'));
    await page.waitForTimeout(1200);
    if (!typeAsked) problems.push('the Thrasher, with no category from the cloud, was never looked up');
    if (await page.locator('button[role="checkbox"]:has-text("Include blueprints")').getAttribute('aria-checked') !== 'false') problems.push('blueprints are in by default');
    for (const n of [names[6721], names[17771], names[29001]]) if (!(await inWorth(n))) problems.push(`not drawn in Worth sniping: ${n}`);
    for (const n of [names[990], names[16243]]) if (await inWorth(n)) problems.push(`a blueprint in Worth sniping with the switch off: ${n}`);
    if (!(await worth.locator('.note', { hasText: '2 blueprints clear your bar too, left out' }).count())) problems.push('not drawn: “2 blueprints clear your bar too, left out”');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-blueprints-off.png` });
    // One find copied for Multibuy: "Name N", and what it should come to.
    await page.getByRole('button', { name: `Copy ${names[6721]} for Multibuy` }).click().catch((e) => problems.push(`couldn't copy a find: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(400);
    let copied = await page.evaluate(() => window.__copied);
    if (copied.at(-1) !== `${names[6721]} 133`) problems.push(`a find copied as ${JSON.stringify(copied.at(-1))}, not “${names[6721]} 133”`);
    const toasted = (await page.locator('.toasts').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!toasted.includes('7,811,090 ISK') || !toasted.includes('no price limit')) problems.push(`the copy's toast doesn't say the total and the price limit: ${toasted.slice(0, 200)}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-multibuy-toast.png` });
    // Switched on, the blueprints join the list, and Copy all copies every find shown.
    await page.locator('button[role="checkbox"]:has-text("Include blueprints")').click();
    await page.waitForTimeout(800);
    for (const n of [names[990], names[16243]]) if (!(await inWorth(n))) problems.push(`not drawn in Worth sniping with the switch on: ${n}`);
    await worth.getByRole('button', { name: /Copy all 5 for Multibuy/ }).click().catch((e) => problems.push(`couldn't copy all: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(400);
    copied = await page.evaluate(() => window.__copied);
    const lines = (copied.at(-1) ?? '').split('\n');
    if (lines.length !== 5 || !lines.includes(`${names[990]} 8`) || !lines.includes(`${names[16243]} 5`)) problems.push(`Copy all copied ${JSON.stringify(copied.at(-1))}`);
    const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-blueprints-on.png` });
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'sniper', page: 'sniper', problems: unique });
    process.stdout.write(unique.length ? `  FAIL sniper #sniper\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   sniper #sniper (blueprints out unless asked, the switch, Copy for Multibuy)\n');
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
