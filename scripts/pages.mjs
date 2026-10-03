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
  'hustles/abyssal', 'hustles/courier', 'hustles/planets', 'hustles/mining', 'hustles/freelance', 'hustles/research', 'combat', 'characters', 'omega',
  'settings/account', 'settings/skills', 'settings/rates', 'settings/alerts', 'settings/appearance', 'settings/data', 'settings/scan',
];

const ALL = { empty: {}, small: small(), large: large() };
// The large ledger already has a little of the planner's 990101 working (planScan): 5 listed and 3 in the Jita hangar, so
// the mix sizes it after them and its "Already trading" tip says so (PLANNER_WORKING).
ALL.large.orders = { ...ALL.large.orders, 990101001: { orderId: 990101001, typeId: 990101, isBuy: false, price: 1_400_000, volumeTotal: 5, volumeRemain: 5, issued: new Date(Date.now() - 3600_000).toISOString(), state: 'open', locationId: 60003760 } };
ALL.large.stock = { ...ALL.large.stock, jita: { ...ALL.large.stock.jita, 990101: 3 } };

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

/**
 * Whether a table scrolls sideways inside its own box: what Orders did at 1440 px with the sidebar open, its controls cut
 * off past a scrollbar (the user, 2 October 2026). Null when there's no such box.
 */
const sideways = (page, sel = '.tbl-scroll') => page.evaluate((s) => {
  const box = document.querySelector(s);
  return box ? { over: box.scrollWidth - box.clientWidth, width: box.clientWidth } : null;
}, sel);

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
 * - 990105: 6,000 units listed at the best ask, where trading reaches, against 300 a day bought from listings (history's
 *   even guess on 600 a day): 20 days of buyers, "Long queue" on Prospects and in the planner's Flags column. With
 *   "Leave out flagged items" on, the planner leaves it out with 990102 and says so by flag (PLANNER_SWITCH).
 * - 990106: priced like 990101, but NPCs sell it elsewhere in The Forge at 1.3 M, under the 1,399,000 it would list at
 *   (`npcAnywhere`, the cloud scan's note): left out of Prospects and the planner, as Command Carriers was on 2 October 2026.
 * - 990107: the same with NPCs at 1.5 M, over where it would list: left out too, as every item NPCs sell anywhere in The
 *   Forge is since the user approved it on 2 October 2026 (Gallente Hauler, listed under the NPCs' 500,000, had stayed in).
 * - 990108: traded at 1 M to 1.4 M for the fortnight, but its book has fallen to 0.8 M / 0.9 M. At the front it isn't
 *   priced at all (its ask falls under where its bid has to go). Placed and left, it's bought where trading reached, at
 *   or over today's cheapest listing, and sold 55% over it: "Market moved" (PLANNER_LEAVE), as Imperial Navy Infiltrator
 *   was in the user's second plan.
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
    990105: [stats(990105, flat(1 * M), flat(1.4 * M)), { ...book(990105, 1 * M, 1.4 * M), topSells: [{ price: 1.4 * M, volume: 6000 }, { price: 1.401 * M, volume: 6000 }] }],
    990106: [stats(990106, flat(1 * M), flat(1.4 * M)), { ...book(990106, 1 * M, 1.4 * M), npcAnywhere: 1.3 * M }],
    990107: [stats(990107, flat(1 * M), flat(1.4 * M)), { ...book(990107, 1 * M, 1.4 * M), npcAnywhere: 1.5 * M }],
    990108: [stats(990108, flat(1 * M), flat(1.4 * M)), book(990108, 0.8 * M, 0.9 * M)],
  };
  const busy = { h: 15, sell: 18, buy: 6, newSell: 37, newBuy: 15, frontSell: 2, frontBuy: 2, repriceSell: 0, repriceBuy: 0 };
  return {
    prospects: {
      stats: Object.fromEntries(Object.entries(items).map(([t, [st]]) => [t, st])),
      books: Object.fromEntries(Object.entries(items).map(([t, [, b]]) => [t, b])),
      sample: { at: new Date(now - 3600_000).toISOString(), totalPages: 400, sampledPages: 400, minSampled: 1, counts: { 990101: 60, 990102: 60, 990103: 60, 990104: 60, 990105: 60, 990106: 60, 990107: 60, 990108: 60 } },
      runs: { cloud: new Date(now - 3600_000).toISOString() },
    },
    flow: { log: { 990101: { [day(1)]: busy, [day(0)]: busy } }, ends: {} },
  };
}
/** What the large ledger's Prospects and planner must draw from that scan, and what the planner's mix must not hold. */
const PLAN_PROOF = {
  prospects: { drawn: ['Ran up lately', 'Bids not reached', 'Long queue'], absent: ['990106', '990107'] },
  planner: { drawn: ['Raises kept back', 'Bids not reached', 'Long queue'], note: 'Scan again before investing', absent: ['Ran up lately', '990106', '990107'] },
};
/**
 * The planner again with "Leave out flagged items" switched on (kept per browser, read as the page opens): the flagged
 * items leave the mix and are counted by flag, while Raises kept back, a cost rather than a flag, stays.
 */
/** What 990101's "Already trading" tip must say at the front: the 8 units it already has working, and the plan sized after them. */
const PLANNER_WORKING = ['3 in your Jita hangar', '8 units already working', 'So this plan takes what’s left'];
const PLANNER_SWITCH = { drawn: ['Raises kept back'], note: '2 left out: 1 Bids not reached, 1 Long queue', absent: ['Bids not reached', 'Long queue'] };
/**
 * The planner priced to place and leave (kept per browser, read as the page opens), with slots for every item: 990108,
 * which only Place and leave prices, carries "Market moved", and its tip says which side moved and by how much.
 */
const PLANNER_LEAVE = { flag: 'Market moved', tip: ['Your bid would be at or over today’s cheapest listing of 900,000 ISK', 'The plan sells 56% over today’s cheapest listing of 900,000 ISK', 'half of the last 14 days'] };

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
      // The Research tab on these ledgers: the stand-in login holds no standings permission and the main's clone state was
      // never read, so it must say both (never "no standing" for every corporation, never call the main Alpha).
      if (hash === 'hustles/research') {
        for (const t of ['Log in again: this login wasn’t given the permission to read your standings.', 'Clone state not read', '17 datacores’ books couldn’t be read just now'])
          if (!(await page.locator('.page', { hasText: t }).count())) problems.push(`not drawn on the Research tab: “${t}”`);
        if (await page.locator('.page', { hasText: 'Needs Omega' }).count()) problems.push('the Research tab calls a main whose clone state isn’t read Alpha');
      }
      if (hash === 'hustles/mining') {
        if (!(await page.locator('.panel-title', { hasText: 'Best ore to mine' }).count())) problems.push('not drawn: no “Best ore to mine” panel');
        if (!(await page.locator('[role="group"][aria-label="Where it’s found"] button', { hasText: 'Null-sec' }).count())) problems.push('not drawn: no place selector on the best-ore panel');
        if (!(await page.locator('.page', { hasText: 'Couldn’t read the ores’ names from ESI just now' }).count())) problems.push('not drawn: the best-ore panel doesn’t say it couldn’t price');
      }
      // Orders fits at desktop width: the large ledger's 146 Jita orders, without a sideways scrollbar.
      if (!PHONE && name === 'large' && hash === 'orders') {
        const s = await sideways(page);
        if (!s) problems.push('not drawn: no orders table');
        else if (s.over > 0) problems.push(`the orders table scrolls sideways: ${s.over} px past its ${s.width} px box`);
      }
      // The large ledger's scan must reach Prospects and the planner with its flags, or both pass on an empty state.
      if (name === 'large' && PLAN_PROOF[hash]) {
        for (const t of PLAN_PROOF[hash].drawn) if (!(await page.locator('.page table .flag', { hasText: t }).count())) problems.push(`not drawn: no “${t}” flag`);
        for (const t of PLAN_PROOF[hash].absent ?? []) if (await page.locator('.page table', { hasText: t }).count()) problems.push(`in the table, and shouldn’t be: “${t}”`);
        if (PLAN_PROOF[hash].note && !(await page.locator('.page', { hasText: PLAN_PROOF[hash].note }).count())) problems.push(`not drawn: no “${PLAN_PROOF[hash].note}”`);
        if (hash === 'planner') {
          const tips = await page.locator('.page table .flag[data-tip-title="You already trade this"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tip') ?? ''));
          const tip = tips.find((t) => t.includes('units already working')) ?? '';
          for (const t of PLANNER_WORKING) if (!tip.includes(t)) problems.push(`not drawn: the Already trading tip's “${t}” (${(tips[0] ?? 'no tip').slice(0, 120)})`);
          // And sized after them: the units planned leave room for the 8 already working.
          const m = /takes what’s left: ([\d,]+) of the ([\d,]+) units/.exec(tip);
          const num = (x) => Number(x.replace(/,/g, ''));
          if (m && num(m[1]) > num(m[2]) - 8) problems.push(`not sized after what's working: ${m[1]} of the ${m[2]} units with 8 working`);
        }
      }
      await judge(hash);
    }
    if (name === 'large' && SHOWN.includes('planner')) {
      problems = [];
      await page.evaluate(() => {
        let kept = {};
        try { kept = JSON.parse(localStorage.getItem('jita-ledger:planner') || '{}'); } catch { /* none */ }
        localStorage.setItem('jita-ledger:planner', JSON.stringify({ ...kept, leaveOutFlagged: true }));
        location.hash = '#settings/appearance';
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => { location.hash = '#planner'; });
      await page.waitForTimeout(1500);
      for (const t of PLANNER_SWITCH.drawn) if (!(await page.locator('.page table .flag', { hasText: t }).count())) problems.push(`not drawn with the switch on: no “${t}” flag`);
      for (const t of PLANNER_SWITCH.absent) if (await page.locator('.page table', { hasText: t }).count()) problems.push(`in the mix with the switch on, and shouldn’t be: “${t}”`);
      if (!(await page.locator('.page', { hasText: PLANNER_SWITCH.note }).count())) problems.push(`not drawn: no “${PLANNER_SWITCH.note}”`);
      await judge('planner (leave out flagged items)');
      await page.evaluate(() => localStorage.removeItem('jita-ledger:planner'));
      problems = [];
      await page.evaluate(() => {
        localStorage.setItem('jita-ledger:planner', JSON.stringify({ patient: true }));
        sessionStorage.setItem('jita-ledger:planner-session', JSON.stringify({ isk: 1e9, slots: 20 }));
        location.hash = '#settings/appearance';
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => { location.hash = '#planner'; });
      await page.waitForTimeout(1500);
      const moved = page.locator('.page table .flag', { hasText: PLANNER_LEAVE.flag });
      if (!(await moved.count())) problems.push(`not drawn in Place and leave: no “${PLANNER_LEAVE.flag}” flag`);
      else {
        const tip = (await moved.first().getAttribute('data-tip')) ?? '';
        for (const t of PLANNER_LEAVE.tip) if (!tip.includes(t)) problems.push(`not drawn: the Market moved tip's “${t}” (${tip.slice(0, 120)})`);
      }
      await judge('planner (place and leave)');
      await page.evaluate(() => { localStorage.removeItem('jita-ledger:planner'); sessionStorage.setItem('jita-ledger:planner-session', JSON.stringify({ isk: 1e9, slots: 10 })); });
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
  // And the user's 'Arbalest' buy feeding a long sell queue (2 October 2026, scripts/fixtures/orders-queue.json): ESI answers
  // its real Jita book and its history, the dates moved so the last day is yesterday, so "Feeds a long queue" is drawn
  // (from the book's split: nothing is watched here) on any day the check runs.
  if (SHOWN.includes('orders') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('plan'))) {
    const M = 1e6, PX = 47466, TRIT = 34, KEY = 89156, JITA = 60003760, ID = 7433389018;
    const fs = await import('node:fs');
    const arb = JSON.parse(fs.readFileSync(new URL('./fixtures/orders-queue.json', import.meta.url), 'utf8'));
    const ARB = arb.typeId, DAY_MS = 86400_000;
    const shift = Date.parse(new Date(Date.now() - DAY_MS).toISOString().slice(0, 10)) - Date.parse(arb.history.at(-1).date);
    const arbHistory = arb.history.map((r) => ({ ...r, date: new Date(Date.parse(r.date) + shift).toISOString().slice(0, 10) }));
    // The plan started an hour ago, so its checklist shows on any day the check runs: the Key's 15 placed five minutes
    // before it, after its position opened (Task 3's case), and Praxis not yet placed for it.
    const planAt = Date.now() - 3600_000, iso = (t) => new Date(t).toISOString();
    const seen = [['00:42:35', 206.3], ['08:39:24', 206.7], ['11:22:15', 207.1]].map(([t, p]) => ({ issued: `2026-09-30T${t}Z`, price: p * M, remain: 1 }));
    const books = {
      [PX]: [[ID, 1, 207.1 * M, 1], [9001, 1, 208.3 * M, 4], [9002, 1, 200 * M, 5], [9003, 0, 225 * M, 2], [9004, 0, 230 * M, 10]],
      [TRIT]: [[1, 1, 4.5, 800_000], [9011, 1, 4.4, 5_000_000], [9012, 0, 4.55, 9_000_000]],
      // [order, buy, price, left, placed for]: what the orders have sold says who trades.
      [ARB]: arb.book,
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
        7433386979: { orderId: 7433386979, typeId: KEY, isBuy: true, price: 24.95 * M, volumeTotal: 15, volumeRemain: 13, issued: iso(planAt - 5 * 60_000), state: 'open', locationId: JITA },
        [arb.buy.orderId]: arb.buy,
        [arb.sell.orderId]: arb.sell,
      },
      // The Key's bid has bought 2 of its 15, in the hangar: an at-the-front plan's stock to list, whose book ESI refuses here.
      txs: { k1: { id: 'k1', source: 'esi', typeId: KEY, date: iso(planAt + 5 * 60_000), isBuy: true, qty: 2, unitPrice: 24.95 * M, locationId: JITA } },
      stock: { at: new Date(Date.now() - 600_000).toISOString(), jita: { [ARB]: arb.hangar, [KEY]: 2 }, total: { [ARB]: arb.hangar, [KEY]: 2 }, inContainers: 0 },
      names: { [PX]: 'Praxis', [TRIT]: 'Tritanium', [KEY]: 'Vigilance Resonance Key', [ARB]: arb.name },
      meta: { walletBalance: 1e9, lastSync: new Date(Date.now() - 600_000).toISOString() },
    };
    const page = await browser.newPage(VIEW);
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (route.request().url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      const esi = url.hostname === 'esi.evetech.net';
      if (esi && url.pathname === '/markets/10000002/history/' && url.searchParams.get('type_id') === String(ARB)) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(Date.now() + 3600_000).toUTCString() }, body: JSON.stringify(arbHistory) });
      }
      const b = esi && url.pathname === '/markets/10000002/orders/' ? books[url.searchParams.get('type_id')] : null;
      if (!b) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(Date.now() + 300_000).toUTCString(), 'x-pages': '1' },
        body: JSON.stringify(b.map(([id, buy, price, volume, total]) => ({ order_id: id, type_id: Number(url.searchParams.get('type_id')), location_id: JITA, is_buy_order: buy === 1, price, volume_remain: volume, volume_total: total ?? volume, issued: '2026-09-30T00:00:00Z', duration: 90, min_volume: 1, range: 'region' }))) });
    });
    const problems = [];
    page.on('pageerror', (e) => problems.push(`threw: ${e.message.split('\n')[0]}`));
    page.on('console', (m) => { if (m.type() === 'error' && /^Warning: /.test(m.text())) problems.push(`React: ${m.text().split('\n')[0].replace(/%s/g, '').slice(0, 160)}`); });
    await page.goto(SEED_PAGE);
    // Logged in with the market-window permission, so each row draws its In game button as the user's do: the width check
    // below measures the rows as they see them.
    await page.evaluate(async ([d, auth]) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('jita-ledger:auth', JSON.stringify(auth));
      for (const [db, put] of [['jita-ledger', d], ['jita-ledger-cache', {}], ['jita-ledger-alts', {}]]) {
        const h = await new Promise((res) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
        if (!h.objectStoreNames.contains('kv')) { h.close(); continue; }
        await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
        h.close();
      }
    }, [ledger, { ...ownerAuth(), scopes: ['esi-ui.open_window.v1'] }]);
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
    if (!(await page.locator('button.stat.press', { hasText: 'keep it: raising would cut below' }).count())) problems.push('not drawn: no Keep it count beside “worth moving”');
    const feeds = page.locator(`tr[data-order="${arb.buy.orderId}"] [data-tip-title="Feeds a long queue"]`);
    if (!(await feeds.count())) problems.push('not drawn: no “Feeds a long queue” on the Arbalest buy');
    else {
      const tip = (await feeds.first().getAttribute('data-tip')) ?? '';
      for (const want of ['days of the buyers who take listings', 'in your Jita hangar', 'This order still buys', 'cancel it and place a smaller one']) if (!tip.includes(want)) problems.push(`not drawn: the Long queue tip's “${want}”`);
    }
    if (await page.locator(`tr[data-order="${arb.sell.orderId}"] [data-tip-title="Feeds a long queue"]`).count()) problems.push('the Arbalest sell carries “Feeds a long queue”: only a buy adds stock');
    // The tiles filter the table (the user, 2 October 2026): Keep it shows only Praxis and, pressed again, every order;
    // the figure under it is pressed with it; "worth moving" shows only the Arbalest sell and Show all brings the rest
    // back; a tile counting nothing (Leave it) can't be pressed.
    {
      const ids = () => page.locator('table.ord tbody tr').evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-order')));
      const all = await ids();
      const keepTile = page.locator('button.vtile', { hasText: 'Keep it' });
      await keepTile.click().catch((e) => problems.push(`couldn't press Keep it: ${e.message.split('\n')[0]}`));
      await page.waitForTimeout(300);
      const kept = await ids();
      if (kept.length !== 1 || kept[0] !== String(ID)) problems.push(`pressing Keep it didn't show only Praxis: ${JSON.stringify(kept)} of ${all.length}`);
      if ((await keepTile.getAttribute('aria-pressed')) !== 'true') problems.push('the Keep it tile isn’t pressed while it filters');
      if ((await page.locator('button.stat.press', { hasText: 'keep it: raising would cut below' }).getAttribute('aria-pressed').catch(() => null)) !== 'true') problems.push('the Keep it figure isn’t pressed with its tile');
      const said = (await page.locator('.tile-showing').innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (!said.includes(`Showing 1 of ${all.length}: Keep it`)) problems.push(`not drawn: “Showing 1 of ${all.length}: Keep it” (${said})`);
      await keepTile.click().catch(() => undefined);
      await page.waitForTimeout(300);
      if ((await ids()).length !== all.length) problems.push(`pressing Keep it again didn't bring every order back: ${(await ids()).length} of ${all.length}`);
      if (await page.locator('.tile-showing').count()) problems.push('the “Showing” line stayed after the filter cleared');
      await page.locator('button.stat.press', { hasText: 'worth moving' }).click().catch((e) => problems.push(`couldn't press “worth moving”: ${e.message.split('\n')[0]}`));
      await page.waitForTimeout(300);
      const moving = await ids();
      if (moving.length !== 1 || moving[0] !== String(arb.sell.orderId)) problems.push(`pressing “worth moving” didn't show only the Arbalest sell: ${JSON.stringify(moving)}`);
      if ((await page.locator('button.vtile', { hasText: 'Move it' }).getAttribute('aria-pressed')) !== 'true') problems.push('the Move it tile isn’t pressed with “worth moving”');
      await page.locator('.tile-showing button', { hasText: 'Show all' }).click().catch((e) => problems.push(`couldn't press Show all: ${e.message.split('\n')[0]}`));
      await page.waitForTimeout(300);
      if ((await ids()).length !== all.length) problems.push(`Show all didn't bring every order back: ${(await ids()).length} of ${all.length}`);
      const idle = page.locator('button.vtile', { hasText: 'Leave it' });
      if ((await idle.getAttribute('aria-disabled')) !== 'true') problems.push('Leave it counts nothing here, and isn’t marked as not pressable');
      await idle.click().catch(() => undefined);
      await page.waitForTimeout(200);
      if ((await idle.getAttribute('aria-pressed')) !== 'false' || (await ids()).length !== all.length) problems.push('Leave it counts nothing, and pressing it filtered the table');
    }
    // Checked, every line under a figure drawn and the In game buttons there, Orders still fits at desktop width.
    if (!PHONE) {
      if (!(await page.locator('tbody .acts button', { hasText: 'In game' }).count())) problems.push('not drawn: no In game button on the checked rows');
      const s = await sideways(page);
      if (s?.over > 0) problems.push(`the checked orders table scrolls sideways: ${s.over} px past its ${s.width} px box`);
    }
    let boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-orders.png` });
    // The same buy on To do (approved 2 October 2026): one item, something to act on, in the tag's words; none for the sell.
    await page.evaluate(() => { location.hash = '#todo'; });
    const fed = page.locator('.tn-item', { hasText: 'Feeds a long queue' });
    await fed.first().waitFor({ timeout: 10_000 }).catch(() => problems.push('not drawn: no “Feeds a long queue” item on To do'));
    if ((await fed.count()) !== 1) problems.push(`To do lists ${await fed.count()} “Feeds a long queue” items, not the Arbalest buy's one`);
    const fedText = (await fed.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    for (const want of [`${arb.name} buy order`, 'days of the buyers who take listings', 'cancel it and place a smaller one']) if (!fedText.includes(want)) problems.push(`not drawn: the To do item's “${want}”`);
    // The Key's 2 bought for the at-the-front plan: one item to list, with no price while its book can't be read, said so.
    // Listed before its book's first read, saying so: wait for the read's answer.
    await page.locator('.tn-item', { hasText: 'Its Jita book couldn’t be read' }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    const keyList = (await page.locator('.tn-item', { hasText: 'List what the plan bought' }).allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' '));
    if (keyList.length !== 1) problems.push(`To do lists ${keyList.length} “List what the plan bought” items, not the Key's one`);
    else for (const want of ['List 2 × Vigilance Resonance Key', 'Its Jita book couldn’t be read', 'The plan priced it at 35,990,000 ISK']) if (!keyList[0].includes(want)) problems.push(`not drawn: the Key's list item's “${want}” (${keyList[0].slice(0, 160)})`);
    await page.getByRole('button', { name: /Needs action/ }).click().catch((e) => problems.push(`couldn't filter To do: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(300);
    if (!(await page.locator('.tn-item', { hasText: 'Feeds a long queue' }).count())) problems.push('the “Feeds a long queue” item isn’t under Needs action');
    boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary on To do');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out on To do: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-todo.png` });
    await page.evaluate(() => localStorage.removeItem('jita-ledger:todo-filter'));
    // The plan's checklist on the planner: the Key's order from before the plan counted, never a nudge to replace it.
    await page.evaluate(() => { location.hash = '#planner'; });
    await page.waitForTimeout(1500);
    const placing = (await page.locator('#placing').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!placing.includes('Already placed: 15 of 16 (before the plan)')) problems.push(`not drawn: the checklist's “Already placed: 15 of 16 (before the plan)” (${placing.slice(0, 120)})`);
    if (!placing.includes('EVE can’t change an order’s quantity')) problems.push('not drawn: the checklist’s note on the 1 more');
    for (const want of ['Bought: list it', 'At the front', 'Its Jita book couldn’t be read, so there’s no price at the front yet', 'The plan priced it at 35,990,000 ISK']) if (!placing.toLowerCase().includes(want.toLowerCase())) problems.push(`not drawn: the checklist's list part's “${want}”`);
    boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary on the planner');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out on the planner: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-checklist.png` });
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'plan', page: 'orders', problems: unique });
    process.stdout.write(unique.length ? `  FAIL plan #orders\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   plan #orders (Keep it, the plan chip, a buy over its resale, a buy feeding a long queue), #todo (that buy, the Key to list) and #planner (the checklist, its list part with no book)\n');
    await page.close();
  }
  // A plan that took over a position with earlier trading (the user's second plan, 2 October 2026): Datacore - Rocket
  // Science's position open for a week, 9,372 sold before the plan and 2,000 of the 2,628 it held sold since, the plan's bid
  // of 188 not filled. Showing the plan's positions must count it from the plan's start (nothing bought or sold, nothing
  // left out) and say it's shared; the list without a plan shows it whole. And its Imperial Navy Infiltrator bid, over the
  // cheapest listing, bought 11 at once with no order to show yet: the checklist must count it placed, saying so, and To
  // do must not ask for it (Raging Dark Filament, not placed, keeps the checklist up). Every request outside this server is
  // refused. Both widths.
  if (SHOWN.includes('positions') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('plan'))) {
    const JITA = 60003760, RS = 20420, INF = 31866, RD = 47894, DAY_MS = 86400_000;
    const planAt = Date.now() - 3600_000, iso = (t) => new Date(t).toISOString();
    const tx = (id, typeId, isBuy, qty, price, t) => ({ id, source: 'esi', typeId, date: iso(t), isBuy, qty, unitPrice: price, locationId: JITA });
    const ledger = {
      settings: { acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, target: 5, share: 7.5, waitHours: 3 },
      plans: [{ id: 'mur4lko4xsll6o', name: '2 Oct · 999.16 M ISK in 33 items', at: iso(planAt), isk: 999156436.25, horizonDays: 0.5, patient: true,
        items: [{ typeId: RS, buyAt: 85_540, units: 188, sellAt: 94_430, positionId: 'rs' }, { typeId: INF, buyAt: 1_658_000, units: 11, sellAt: 1_836_000, positionId: 'inf' },
          { typeId: RD, buyAt: 1_711_000, units: 8, sellAt: 1_983_000, positionId: 'rd' }] }],
      positions: [{ id: 'rs', typeId: RS, openedAt: iso(planAt - 8 * DAY_MS), status: 'open', jitaOnly: true, excluded: [], included: [] },
        { id: 'inf', typeId: INF, openedAt: iso(planAt), status: 'open', jitaOnly: true, excluded: [], included: [] },
        { id: 'rd', typeId: RD, openedAt: iso(planAt), status: 'open', jitaOnly: true, excluded: [], included: [] }],
      txs: {
        b1: tx('b1', RS, true, 12_000, 80_720, planAt - 8 * DAY_MS + 300_000),
        s1: tx('s1', RS, false, 9372, 93_516, planAt - 2 * DAY_MS),
        s2: tx('s2', RS, false, 2000, 96_980, planAt + 1_200_000),
        i1: tx('i1', INF, true, 11, 1_608_000, planAt + 600_000),
      },
      orders: {
        7434267823: { orderId: 7434267823, typeId: RS, isBuy: false, price: 96_980, volumeTotal: 4924, volumeRemain: 628, issued: iso(planAt - 1.2 * DAY_MS), state: 'open', locationId: JITA },
        7435100906: { orderId: 7435100906, typeId: RS, isBuy: true, price: 85_540, volumeTotal: 188, volumeRemain: 188, issued: iso(planAt + 720_000), state: 'open', locationId: JITA },
      },
      names: { [RS]: 'Datacore - Rocket Science', [INF]: 'Imperial Navy Infiltrator', [RD]: 'Raging Dark Filament' },
      meta: { walletBalance: 1e9, lastSync: iso(Date.now() - 600_000) },
    };
    // The Infiltrator's real history (scripts/fixtures/plan-list.json, read 2 October 2026), its days moved so the last is
    // yesterday: List patiently today beside the plan's 1,836,000 on the list step. Every other request is refused, its
    // book too, so the step draws the plan's own price without one.
    const fsP = await import('node:fs');
    const pl = JSON.parse(fsP.readFileSync(new URL('./fixtures/plan-list.json', import.meta.url), 'utf8'));
    const infRows = pl.history[INF];
    const infShift = Date.parse(new Date(Date.now() - DAY_MS).toISOString().slice(0, 10)) - Date.parse(infRows.at(-1).date);
    const infHistory = infRows.map((r) => ({ ...r, date: new Date(Date.parse(r.date) + infShift).toISOString().slice(0, 10) }));
    const page = await browser.newPage(VIEW);
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (route.request().url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      if (url.hostname === 'esi.evetech.net' && url.pathname === '/markets/10000002/history/' && url.searchParams.get('type_id') === String(INF)) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(Date.now() + 3600_000).toUTCString() }, body: JSON.stringify(infHistory) });
      }
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
    await page.goto(`${BASE}#positions`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    await page.waitForTimeout(1000);
    const cells = async () => page.evaluate(() => {
      const tr = [...document.querySelectorAll('.page table tbody tr')].find((r) => r.textContent.includes('Datacore - Rocket Science'));
      return tr ? [...tr.children].map((td) => td.innerText.replace(/\s+/g, ' ').trim()) : null;
    });
    const whole = await cells();
    if (!whole || whole[4] !== '11,372') problems.push(`the list without a plan doesn't show the whole position's 11,372 sold (${JSON.stringify(whole?.slice(3, 6))})`);
    const plans = (await page.locator('section[aria-label="Plans"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!plans.includes('1 shared with earlier trading, counted from the plan’s start')) problems.push(`not drawn: the Plans panel's “1 shared with earlier trading” (${plans.slice(0, 160)})`);
    if (plans.includes('left out of the profit')) problems.push('the Plans panel says units were left out: the earlier stock’s sales aren’t the plan’s at all');
    await page.getByRole('button', { name: 'Show its positions' }).click().catch((e) => problems.push(`couldn't show the plan's positions: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(600);
    const view = await cells();
    if (!view || view[3] !== '0' || view[4] !== '0') problems.push(`the plan's view of the shared position isn't counted from its start: bought, sold ${JSON.stringify(view?.slice(3, 5))}`);
    const tag = page.locator('.page table tbody tr', { hasText: 'Datacore - Rocket Science' }).locator('[data-tip-title="Shared with your earlier trading"]');
    if (!(await tag.count())) problems.push('not drawn: no “Shared since” tag on the shared position');
    else {
      const tip = (await tag.getAttribute('data-tip')) ?? '';
      for (const want of ['The 2,628 it held then are your earlier trading’s', '2,000 of them have sold since', 'Open it for the whole position']) if (!tip.includes(want)) problems.push(`not drawn: the Shared tag's “${want}”`);
    }
    if (await page.locator('.page table tbody tr', { hasText: 'Imperial Navy Infiltrator' }).locator('[data-tip-title="Shared with your earlier trading"]').count()) problems.push('the position the plan opened says it is shared');
    // The Plans panel's list step: the Infiltrator's 11, bought at once, to list at the plan's 1,836,000; never Rocket Science's earlier stock.
    await page.locator('section[aria-label="Plans"] .plan-list', { hasText: 'Imperial Navy Infiltrator' }).waitFor({ timeout: 10_000 }).catch(() => problems.push('not drawn: the Plans panel’s “Bought: list it” with the Infiltrator'));
    const plansList = (await page.locator('section[aria-label="Plans"] .plan-list').innerText().catch(() => '')).replace(/\s+/g, ' ');
    for (const want of ['Bought: list it · 2 Oct · 999.16 M ISK in 33 items', '1,836,000 ISK', 'The plan’s price: list it and leave it']) if (!plansList.toLowerCase().includes(want.toLowerCase())) problems.push(`not drawn: the Plans panel's list part's “${want}” (${plansList.slice(0, 160)})`);
    if (plansList.includes('Datacore - Rocket Science')) problems.push('the Plans panel lists Rocket Science’s earlier stock as the plan’s to list');
    let boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary on Positions');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out on Positions: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-shared-positions.png` });
    // The checklist: the Infiltrator placed by its trade, saying so; Raging Dark Filament not yet.
    await page.evaluate(() => { location.hash = '#planner'; });
    await page.waitForTimeout(1500);
    const placing = (await page.locator('#placing').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!placing.includes('11 of 11 bought at once at 1,608,000')) problems.push(`not drawn: the checklist's “11 of 11 bought at once at 1,608,000” (${placing.slice(0, 160)})`);
    if (!placing.includes('the order shows only in your order history')) problems.push('not drawn: the checklist doesn’t say where the order went');
    if (!placing.includes('2 of 3 placed')) problems.push(`the checklist doesn't count 2 of 3 placed (${placing.slice(0, 120)})`);
    // Its list part: the plan's own price, copied, with today's List patiently beside it from the history ESI gave.
    await page.locator('#placing .plan-list', { hasText: 'List patiently today' }).waitFor({ timeout: 10_000 }).catch(() => undefined);
    const listPart = (await page.locator('#placing .plan-list').innerText().catch(() => '')).replace(/\s+/g, ' ');
    for (const want of ['Bought: list it', 'Place and leave', 'Imperial Navy Infiltrator', '1,836,000 ISK', 'The plan’s price: list it and leave it', 'List patiently today: 1,836,000 ISK']) if (!listPart.toLowerCase().includes(want.toLowerCase())) problems.push(`not drawn: the checklist's list part's “${want}” (${listPart.slice(0, 200)})`);
    if (!(await page.locator('#placing .plan-list button.copy-price[aria-label="Copy 1836000"]').count())) problems.push('not drawn: a copy button for the price to list at');
    boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary on the planner');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out on the planner: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-shared-checklist.png` });
    // To do asks for the one not placed, never the one that bought at once.
    await page.evaluate(() => { location.hash = '#todo'; });
    await page.waitForTimeout(1500);
    if (!(await page.locator('.tn-item', { hasText: 'Raging Dark Filament' }).count())) problems.push('not drawn: To do doesn’t ask for Raging Dark Filament’s buy order');
    if (await page.locator('.tn-item', { hasText: 'Place a buy order: 11 × Imperial Navy Infiltrator' }).count()) problems.push('To do asks for the Infiltrator’s buy order, which bought at once');
    // And asks to list what it bought: one item, at the plan's price, something to act on.
    const listItem = page.locator('.tn-item', { hasText: 'List what the plan bought' });
    await page.locator('.tn-item', { hasText: 'List patiently today' }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    if ((await listItem.count()) !== 1) problems.push(`To do lists ${await listItem.count()} “List what the plan bought” items, not the Infiltrator's one`);
    const listText = (await listItem.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    for (const want of ['List 11 × Imperial Navy Infiltrator at 1,836,000 ISK', 'Bought for 2 Oct · 999.16 M ISK in 33 items', 'List patiently today: 1,836,000 ISK']) if (!listText.includes(want)) problems.push(`not drawn: the To do list item's “${want}” (${listText.slice(0, 200)})`);
    boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary on To do');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out on To do: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-shared-todo.png` });
    // The position page says what the plan sells at, beside List patiently and List safely.
    await page.evaluate(() => { location.hash = '#positions/inf'; });
    await page.waitForTimeout(1500);
    const posText = (await page.locator('.page').innerText().catch(() => '')).replace(/\s+/g, ' ');
    for (const want of ['The plan sells at', '1,836,000 ISK', 'Place and leave: 2 Oct · 999.16 M ISK in 33 items', 'List patiently']) if (!posText.toLowerCase().includes(want.toLowerCase())) problems.push(`not drawn: the position page's “${want}”`);
    boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary on the position page');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out on the position page: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-shared-position.png` });
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'plan shared', page: 'positions', problems: unique });
    process.stdout.write(unique.length ? `  FAIL plan shared #positions\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   plan shared #positions (a position the plan took over, counted from its start; the list step), #planner (a bid bought at once, and the list part), #todo and the position page\n');
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
    // And a job paid after the trades were read (the user's Добыча Veldspar*, 2 October 2026: 208 M at 17:33:16 for
    // 8,000,000 bought at 17:26:54, the trades read only to 17:00:11): its units aren't matched to a purchase yet, and it
    // must say so rather than call them stock you didn't buy. ESI's public details, description left out.
    const VELD = {"id": "e94d1cd6-d027-4b77-921d-8f37fcad9f08", "name": "Добыча Veldspar*", "state": "Completed", "last_modified": "2026-10-02T17:33:13.402Z", "progress": {"current": 8000000, "desired": 8000000}, "reward": {"initial": 208000000, "remaining": 0}, "details": {"career": "Industrialist", "created": "2026-10-02T16:00:29.558Z", "finished": "2026-10-02T17:33:13.456Z", "expires": "2026-10-16T16:00:00Z", "creator": {"character": {"id": 2124308466, "name": "Shoya Uitra"}, "corporation": {"id": 98841645, "name": "Autumn Stories"}}}, "configuration": {"version": 1, "parameters": {"corporation_item_delivery": {"corporation_item_delivery": {"item_type": {"values": [{"value_type": "item_group", "values": ["462"]}]}, "corporation_office_location": {"values": [{"value_type": "station", "values": ["60002296"]}, {"value_type": "structure", "values": ["1031058135975"]}]}}}}, "method": "DeliverItem"}, "contribution": {"max_committed_participants": 10000, "reward_per_contribution": 26, "submission_multiplier": 1}, "access_and_visibility": {"acl_protected": false, "broadcast_locations": [{"id": 30002738, "name": "Inoue"}, {"id": 30002053, "name": "Hek"}]}};
    const journal = Object.fromEntries([...fx.journal, { id: '26090000001', date: '2026-09-28T08:00:00Z', refType: 'freelance_jobs_reward', amount: 5_000_000, balance: 1e9,
      firstPartyId: 1000413, secondPartyId: 95210486, description: '-', reason: `project_id=${GONE}:project_name=Old \\u2713 job` },
      { id: '26103000001', date: '2026-10-02T17:33:16Z', refType: 'freelance_jobs_reward', amount: 208_000_000, balance: 2e9, firstPartyId: 1000413, secondPartyId: 95210486,
        description: '-', reason: `project_id=${VELD.id}:project_name=\\u0414\\u043e\\u0431\\u044b\\u0447\\u0430 Veldspar*` }].map((e) => [e.id, e]));
    const ledger = {
      // And 5,000,000 Veldspar not bought (mined, or contracted from the alt) sold during the Veldspar job: said apart.
      txs: Object.fromEntries([...fx.txs, { id: '6880000001', source: 'esi', typeId: 92372, date: '2026-09-20T12:00:00Z', isBuy: false, qty: 5_000_000, unitPrice: 7.15, locationId: 60003760 }].map((t) => [t.id, t])), journal,
      meta: { walletBalance: 1979735843.56, lastSync: new Date(Date.now() - 600_000).toISOString(),
        freelance: { at: '2026-10-01T21:00:00Z', jobs: [] } },
    };
    const details = Object.fromEntries([...fx.jobs, VELD].map((j) => [j.id, j]));
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
      '386.31 M ISK', 'worked out', 'Old ✓ job', 'ESI won’t describe it', '5,000,000 sold for', 'that weren’t bought for it: left out of the profit',
      'Добыча Veldspar*', '8,000,000 not matched to a purchase yet: your trades are read only to',
      // The profit's column folds under the job's name on a phone, where it says "so far".
      PHONE ? 'Profit 208 M ISK so far' : 'the cost may still come in']) if (!text.includes(t)) problems.push(`not drawn: “${t}”`);
    if (text.includes('8,000,000 from stock you didn’t buy for it')) problems.push('a job paid after the trades were read calls its units stock you didn’t buy');
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
  // The Research tab's walkthrough (stage 1 of R&D agents, 3 October 2026) for the main with its standings read as the
  // research found them (Caldari State 3.63, Lai Dai at no standing) and its skills as a trader's (Science V, CPU
  // Management V, Electronic Engineering IV, Negotiation and Connections IV), ESI answering the 17 datacores' Jita books
  // (the research's bids of 2 October 2026) and a year of The Forge's history; then shown for an alt whose standings the
  // cloud hasn't read yet. Without this the deploy draws only the walkthrough with every book refused and no standings.
  // Seeded in a ledger of its own: never the shared large one, which check-income records. Both widths.
  if (SHOWN.includes('hustles/research') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('research'))) {
    const now = Date.now(), iso = (t) => new Date(t).toISOString();
    const BID = { 20418: 92700, 20416: 92610, 20411: 92360, 20413: 91950, 20420: 88170, 20414: 88070, 25887: 88010, 20412: 88010, 20417: 88000,
      20171: 87050, 20415: 87000, 20423: 86100, 20419: 85630, 20421: 81590, 20410: 80010, 20172: 52370, 20424: 25060 };
    const ledger = {
      skills: { 3402: 5, 3426: 5, 3413: 5, 3392: 5, 11453: 4, 3356: 4, 3359: 4, 3355: 4 },
      meta: {
        lastSync: iso(now - 600_000), cloneDetected: 'omega',
        attributes: { intelligence: 24, memory: 24, perception: 20, willpower: 20, charisma: 23 },
        standings: { at: iso(now - 600_000), list: [{ id: 500001, type: 'faction', standing: 3.63 }, { id: 1000035, type: 'npc_corp', standing: 7.04 }] },
      },
    };
    // An alt the cloud has read (skills, queue) but not yet its standings: the first hourly read after the Worker deploys.
    const ALT = 900077, ok = (job, ago) => ({ job, lastRun: now - ago, lastOk: now - ago, lastError: null });
    const altEntry = { charId: ALT, name: 'Research Alt', addedAt: now - 5 * 86400_000, scopes: ['esi-characters.read_standings.v1', 'esi-skills.read_skills.v1'],
      at: now - 3600_000, refusedAt: null, refused: null, rev: 2, ship: null, shipAt: null, jobs: [ok('archive', 1800_000), ok('sheet', 1700_000)] };
    const altSaved = { rev: 2, addedAt: altEntry.addedAt, records: {}, docs: { skills: { 3402: 4, 3392: 3 }, meta: { cloneDetected: 'omega', attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 } } } };
    // And an Alpha alt (its sheet read it as Alpha), and one whose login EVE refused with nothing read.
    const ALPHA = 900078, LOST = 900079;
    const alphaEntry = { ...altEntry, charId: ALPHA, name: 'Alpha Alt' };
    const alphaSaved = { ...altSaved, docs: { skills: { 3402: 4 }, meta: { cloneDetected: 'alpha', attributes: altSaved.docs.meta.attributes, standings: { list: [] } } } };
    const lostEntry = { ...altEntry, charId: LOST, name: 'Lost Alt', refusedAt: now - 7200_000, refused: 'invalid_grant', rev: 0, jobs: [] };
    const altStore = { roster: { at: now - 60_000, list: [altEntry, alphaEntry, lostEntry] }, [`alt:${ALT}`]: altSaved, [`alt:${ALPHA}`]: alphaSaved, [`alt:${LOST}`]: { rev: 0, records: {}, docs: {} } };
    const page = await browser.newPage(VIEW);
    let esiAsked = 0;
    await page.route('**/*', (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      if (url.hostname !== 'esi.evetech.net') return route.abort();
      esiAsked++;
      const json = (body, headers = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(now + 300_000).toUTCString(), 'x-pages': '1', ...headers }, body: JSON.stringify(body) });
      const type = Number(url.searchParams.get('type_id'));
      // Mechanical Engineering's book can't be read: the six-agents tile must say so, never a smaller month as if complete.
      if (url.pathname === '/markets/10000002/orders/' && type === 20424) return route.abort();
      if (url.pathname === '/markets/10000002/orders/') {
        const bid = BID[type];
        // A datacore's bids, deepest first, and a listing; a skillbook (anything else asked) one listing at 1.5 M.
        return json(bid ? [
          { order_id: type * 10 + 1, type_id: type, location_id: 60003760, is_buy_order: true, price: bid, volume_remain: 4000, volume_total: 5000, issued: iso(now - 86400_000), duration: 90, min_volume: 1, range: 'station' },
          { order_id: type * 10 + 2, type_id: type, location_id: 60003760, is_buy_order: false, price: Math.round(bid * 1.05), volume_remain: 900, volume_total: 1000, issued: iso(now - 86400_000), duration: 90, min_volume: 1, range: 'region' },
        ] : [{ order_id: type * 10 + 3, type_id: type, location_id: 60003760, is_buy_order: false, price: 1_500_000, volume_remain: 5, volume_total: 5, issued: iso(now - 86400_000), duration: 90, min_volume: 1, range: 'region' }]);
      }
      if (url.pathname === '/markets/10000002/history/' && BID[type]) {
        // A year and a month of days, priced 10% higher a year ago, 20,000 units a day.
        return json(Array.from({ length: 400 }, (_, i) => {
          const avg = BID[type] * (1 + 0.1 * (i / 400));
          return { date: iso(now - (i + 1) * 86400_000).slice(0, 10), average: Math.round(avg), highest: Math.round(avg * 1.02), lowest: Math.round(avg * 0.98), volume: 20000, order_count: 300 };
        }));
      }
      if (url.pathname === '/universe/names/' && req.method() === 'POST') {
        const ids = JSON.parse(req.postData() ?? '[]');
        return json(ids.map((id) => ({ id, name: `Agent Station ${id}`, category: 'station' })));
      }
      return route.abort();
    });
    const problems = [];
    page.on('pageerror', (e) => problems.push(`threw: ${e.message.split('\n')[0]}`));
    page.on('console', (m) => { if (m.type() === 'error' && /^Warning: /.test(m.text())) problems.push(`React: ${m.text().split('\n')[0].replace(/%s/g, '').slice(0, 160)}`); });
    await page.goto(SEED_PAGE);
    await page.evaluate(async ([d, auth, alts]) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('jita-ledger:auth', JSON.stringify(auth));
      for (const [db, put] of [['jita-ledger', d], ['jita-ledger-cache', {}], ['jita-ledger-alts', alts]]) {
        const h = await new Promise((res) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
        if (!h.objectStoreNames.contains('kv')) { h.close(); continue; }
        await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
        h.close();
      }
    }, [ledger, ownerAuth(), altStore]);
    await page.goto(`${BASE}#hustles/research`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    // The pick is the nearest of Lai Dai's level 2 agents in Electronic Engineering (scripts/check.mjs works it out from the
    // bundle), priced once the books are in.
    await page.waitForFunction(() => /Shitsu Ashoma/.test(document.querySelector('.page')?.textContent ?? '') && !/Pricing…/.test(document.querySelector('.page')?.textContent ?? ''), null, { timeout: 30_000 })
      .catch(() => problems.push('the main’s walkthrough never settled on Shitsu Ashoma with every datacore priced'));
    await page.waitForTimeout(500);
    const text = async () => (await page.locator('.page').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const mainText = await text();
    // RP a day for a level 2 agent at Electronic Engineering IV, Negotiation IV, no standing with the agent: (1 + 40/100) × (4 + 2)².
    for (const t of ['Steps 1 to 3 follow one pick: Shitsu Ashoma, level 2 Lai Dai Corporation, in Electronic Engineering', '50.4 RP a day',
      '1 datacore’s book couldn’t be read just now, so no month is worked out', 'among the datacores priced (1 couldn’t be read)',
      'Start with a level 2 agent:', 'Ehu Vantoh', 'Your standings as the sync read them at']) if (!mainText.includes(t)) problems.push(`not drawn for the main: “${t}”`);
    const laiDai = await page.locator('.step-card[aria-label^="Step 2"] tbody tr', { hasText: 'Lai Dai Corporation' }).first().evaluate((tr) => [...tr.children].map((td) => td.innerText.replace(/\s+/g, ' ').trim())).catch(() => null);
    if (!laiDai) problems.push('not drawn: no Lai Dai row in step 2');
    else {
      if (!laiDai[1].startsWith('4.65')) problems.push(`Lai Dai's faction standing isn't Caldari State's 4.65 at Connections IV: ${laiDai[1]}`);
      if (laiDai[2] !== 'no standing') problems.push(`Lai Dai's own standing doesn't read as no standing: ${laiDai[2]}`);
      if (laiDai[3] !== 'Level 2') problems.push(`Lai Dai doesn't open level 2: ${laiDai[3]}`);
      if (!laiDai[4].startsWith('Level 3: Lai Dai Corporation at 1.00 (it has none)')) problems.push(`Lai Dai's next level doesn't ask for 1.00 with none held: ${laiDai[4]}`);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-research-main.png` });
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out for the main: ${o}`);
    // Shown for the alt: its standings aren't read yet, so nothing may say "no standing" for it.
    await page.locator('[role="group"][aria-label="Show for"] button', { hasText: 'Research Alt' }).click().catch((e) => problems.push(`couldn't show the alt: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(1500);
    const altText = await text();
    for (const t of ['Not read yet: Research Alt’s standings come with the cloud’s next hourly read.', 'Start with a level 1 agent:', 'standings not read yet: level 1 agents only',
      // Its level 1 agents open only if its standing allows: never "Open now", never "the best open to" it.
      'Open if Research Alt’s standing with', 'the best level 1 agent']) if (!altText.includes(t)) problems.push(`not drawn for the alt: “${t}”`);
    const altSteps = (await page.locator('.step-card[aria-label^="Step 2"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (/no standing/.test(altText)) problems.push('the alt’s walkthrough says “no standing” for standings not read yet');
    for (const t of ['Open now', 'the best open to Research Alt']) if (altText.includes(t)) problems.push(`the alt whose standings aren’t read says “${t}”`);
    if (!altSteps.includes('Not read yet')) problems.push('the alt’s standings cells don’t say “Not read yet”');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-research-alt.png` });
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out for the alt: ${o}`);
    // The Alpha alt: Needs Omega, said, with no training time; the refused one: hand its login over again.
    for (const [who, want] of [['Alpha Alt', ['Needs Omega', 'Alpha Alt is Alpha']], ['Lost Alt', ['Not read: EVE refused Lost Alt’s login; hand it over again on the Characters page.']]]) {
      await page.locator('[role="group"][aria-label="Show for"] button', { hasText: who }).click().catch((e) => problems.push(`couldn't show ${who}: ${e.message.split('\n')[0]}`));
      await page.waitForTimeout(1200);
      const t = await text();
      for (const x of want) if (!t.includes(x)) problems.push(`not drawn for ${who}: “${x}”`);
      if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out for ${who}: ${o}`);
    }
    const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    if (!esiAsked) problems.push('ESI was never asked: the books weren’t read');
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'research', page: 'hustles/research', problems: unique });
    process.stdout.write(unique.length ? `  FAIL research #hustles/research\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   research #hustles/research (the main’s walkthrough priced, Lai Dai at no standing; an alt whose standings aren’t read)\n');
    await page.close();
  }
  // The Sniper with finds (2 October 2026: blueprints out unless asked, and Copy for Multibuy). The cloud answers its
  // read, six finds from the read of 1 October 23:27 UTC: a module, a battery and a script, an Epithal Blueprint, a
  // reaction formula (category 9, no "Blueprint" in its name) and a Thrasher Blueprint the read gives no category for (a
  // Worker a version behind), which ESI answers here. Without this the deploy never drew a find, the switch or the copy.
  // And high bids for what the hangar holds, which the switch hides for blueprints too (approved the same day): the
  // Jackdaw's bid from the read of 2 October 15:06 UTC, and bids (invented) for a Caracal Blueprint (category 9 from the
  // cloud) and a Hound Blueprint the read gives no category for, which ESI answers here.
  if (SHOWN.includes('sniper') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('sniper'))) {
    const now = Date.now(), iso = (t) => new Date(t).toISOString();
    const L = (typeId, category, units, cost, cheapest, resale, fair, nextAsk, perDay, daysTraded, doubts = []) => ({
      typeId, orderIds: [typeId * 10], units, cost, cheapest, top: cheapest, resale, fair, nextAsk, pricedAt: iso(now - 20 * 60_000), partly: false,
      perDay, daysTraded, lastMove: 0, doubts, ...(category === undefined ? {} : { category }) });
    const read = { at: iso(now - 60_000), expires: iso(now + 240_000), pages: 406, bids: [], listings: [
      L(6721, 7, 133, 7_811_090, 58_730, 98_850, 98_935, 98_860, 100, 30), L(17771, 23, 6, 18_000_000, 3_000_000, 3_990_000, 3_990_000, 4_798_000, 4, 19),
      L(29001, 8, 496, 3_537_968, 7_133, 12_290, 12_360, 12_300, 2544, 30), L(990, 9, 8, 51_200_000, 6_400_000, 8_473_000, 8_479_000, 8_474_000, 3, 30),
      L(46233, 9, 137, 137_000_000, 1_000_000, 1_200_000, 1_200_000, 1_495_000, 5, 23, ['flood']), L(16243, undefined, 5, 40_000_000, 8_000_000, 10_990_000, 12_000_000, 11_000_000, 3, 30),
      // A Command Carriers listed at 2,000 M (invented) under Jita's real 2,800 M: relisted at NPCs' 2,500 M elsewhere in The
      // Forge, under the 2,749.5 M trading got up to (the cloud's read of 2 October 2026).
      { ...L(93983, 16, 1, 2e9, 2e9, 2.5e9, 2.7495e9, 2.8e9, 6.5, 30), npc: 2.5e9 }] };
    const B = (typeId, category, price, fair, units) => ({ typeId, orderId: typeId * 10 + 1, price, units, minVolume: 1, fair, issued: iso(now - 3600_000), doubts: [], ...(category === undefined ? {} : { category }) });
    read.bids = [B(34828, 6, 70_940_000, 64_710_000, 4), B(687, 9, 19_000_000, 15_000_000, 2), B(12035, undefined, 9_500_000, 8_000_000, 1)];
    const names = { 6721: 'Small Focused Anode Particle Stream I', 17771: 'Medium AutoCannon Battery', 29001: 'Tracking Speed Script', 990: 'Epithal Blueprint', 46233: 'Synth Blue Pill Booster Reaction Formula', 16243: 'Thrasher Blueprint', 93983: 'Command Carriers',
      34828: 'Jackdaw', 687: 'Caracal Blueprint', 12035: 'Hound Blueprint' };
    const jita = { 34828: 1, 687: 2, 12035: 1 };
    const ledger = { names, alerts: { snipeMinIsk: 1e6, snipeMinPct: 5 }, stock: { at: iso(now - 600_000), jita, total: jita, inContainers: 0 }, meta: { walletBalance: 1e9, lastSync: iso(now - 600_000) } };
    const page = await browser.newPage(VIEW);
    // What the page puts on the clipboard, kept where the check can read it.
    await page.addInitScript(() => {
      window.__copied = [];
      try { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (t) => { window.__copied.push(t); } }); } catch { /* no clipboard: the check says so */ }
    });
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
    let typeAsked = 0, houndAsked = 0;
    await page.route('**/*', (route) => {
      const req = route.request(), url = new URL(req.url());
      if (req.url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { ...cors, 'cache-control': 'max-age=3600' }, body: JSON.stringify(body) });
      if (url.host === '127.0.0.1:9' && url.pathname === '/v1/snipes') return json(read);
      if (url.hostname === 'esi.evetech.net' && /^\/universe\/types\/16243\/?$/.test(url.pathname)) { typeAsked++; return json({ type_id: 16243, name: names[16243], group_id: 487, published: true }); }
      if (url.hostname === 'esi.evetech.net' && /^\/universe\/groups\/487\/?$/.test(url.pathname)) return json({ group_id: 487, name: 'Destroyer Blueprint', category_id: 9 });
      if (url.hostname === 'esi.evetech.net' && /^\/universe\/types\/12035\/?$/.test(url.pathname)) { houndAsked++; return json({ type_id: 12035, name: names[12035], group_id: 105, published: true }); }
      if (url.hostname === 'esi.evetech.net' && /^\/universe\/groups\/105\/?$/.test(url.pathname)) return json({ group_id: 105, name: 'Frigate Blueprint', category_id: 9 });
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
    // The switch counts the three blueprint listings and the two held blueprint bids once the Thrasher's and the Hound's
    // categories have come back from ESI.
    await page.waitForSelector('button[role="checkbox"]:has-text("Include blueprints (5)")', { timeout: 20_000 }).catch(() => problems.push('not drawn: “Include blueprints (5)”'));
    await page.waitForTimeout(1200);
    if (!typeAsked) problems.push('the Thrasher, with no category from the cloud, was never looked up');
    if (!houndAsked) problems.push('the Hound Blueprint\'s bid, with no category from the cloud, was never looked up');
    const heldPanel = page.locator('section.panel', { hasText: 'High bids for what you hold' });
    const inHeld = async (n) => (await heldPanel.locator('table tbody tr', { hasText: n }).count()) > 0;
    if (!(await inHeld(names[34828]))) problems.push('not drawn in High bids for what you hold: the Jackdaw');
    for (const n of [names[687], names[12035]]) if (await inHeld(n)) problems.push(`a blueprint's bid in High bids for what you hold with the switch off: ${n}`);
    if (!(await heldPanel.locator('.note', { hasText: '2 high bids for blueprints you hold are left out.' }).count())) problems.push('not drawn: “2 high bids for blueprints you hold are left out.”');
    if (await page.locator('button[role="checkbox"]:has-text("Include blueprints")').getAttribute('aria-checked') !== 'false') problems.push('blueprints are in by default');
    for (const n of [names[6721], names[17771], names[29001], names[93983]]) if (!(await inWorth(n))) problems.push(`not drawn in Worth sniping: ${n}`);
    // Its relist says why it's under where trading got up to.
    if (!(await worth.locator('table tbody tr', { hasText: names[93983] }).filter({ hasText: 'NPCs sell at 2,500,000,000 ISK' }).count())) problems.push('not drawn: “NPCs sell at 2,500,000,000 ISK” under the Command Carriers relist');
    for (const n of [names[990], names[16243]]) if (await inWorth(n)) problems.push(`a blueprint in Worth sniping with the switch off: ${n}`);
    if (!(await worth.locator('.note', { hasText: '2 blueprint listings and 2 high bids for blueprints you hold clear your bar too, left out' }).count())) problems.push('not drawn: “2 blueprint listings and 2 high bids for blueprints you hold clear your bar too, left out”');
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
    for (const n of [names[34828], names[687], names[12035]]) if (!(await inHeld(n))) problems.push(`not drawn in High bids for what you hold with the switch on: ${n}`);
    if (await heldPanel.locator('.note', { hasText: 'left out' }).count()) problems.push('the held bids still say some are left out with the switch on');
    await worth.getByRole('button', { name: /Copy all 6 for Multibuy/ }).click().catch((e) => problems.push(`couldn't copy all: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(400);
    copied = await page.evaluate(() => window.__copied);
    const lines = (copied.at(-1) ?? '').split('\n');
    if (lines.length !== 6 || !lines.includes(`${names[990]} 8`) || !lines.includes(`${names[16243]} 5`)) problems.push(`Copy all copied ${JSON.stringify(copied.at(-1))}`);
    const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-blueprints-on.png` });
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'sniper', page: 'sniper', problems: unique });
    process.stdout.write(unique.length ? `  FAIL sniper #sniper\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   sniper #sniper (blueprints out unless asked, listings and held bids, the switch, Copy for Multibuy, a relist capped at the NPC price)\n');
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
