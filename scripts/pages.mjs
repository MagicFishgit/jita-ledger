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

const PORT = Number(process.env.PORT) || 5188;
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
 * Place and leave's round trips (`roundTrip`, the plans review, 9 October 2026), within 1, 3, 7, 14 and 30 days: 990101
 * came round within 3 days on 26 of 58 start days (45%), 990108 on 20 of 58; 990102 could be priced on too few days to
 * say; 990105 never came round; 990104's stats predate the count as they predate the run-up (PLANNER_TRIPS).
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
  // Round trips within 1, 3, 7, 14 and 30 days, of the start days each could count.
  const trips = (roundTrip) => ({ roundTrip, roundTripOf: [60, 58, 54, 47, 31] });
  const book = (typeId, bid, ask) => ({ at: new Date(now - 600_000).toISOString(), bestBuy: bid, bestSell: ask, buyOrders: 30, sellOrders: 30,
    topBuys: [{ price: bid, volume: 40 }, { price: bid - 1000, volume: 40 }], topSells: [{ price: ask, volume: 40 }, { price: ask + 1000, volume: 40 }], npcSell: false });
  const items = {
    990101: [stats(990101, flat(1 * M), flat(1.4 * M), trips([12, 26, 33, 40, 25])), book(990101, 1 * M, 1.4 * M)],
    990102: [stats(990102, [...Array(9).fill(1 * M), 1.1 * M, 1.12 * M, 1.1 * M, 1.11 * M, 1.13 * M], flat(1.5 * M), { roundTrip: [1, 2, 3, 3, 1], roundTripOf: [15, 14, 12, 10, 3] }), book(990102, 1 * M, 1.5 * M)],
    990103: [stats(990103, flat(1 * M), flat(1.4 * M), { runUp: 0.8, runUpBase: 0.8 * M, ...trips([6, 12, 20, 25, 15]) }), book(990103, 1 * M, 1.4 * M)],
    990104: [stats(990104, flat(1 * M), flat(1.4 * M), { runUp: undefined, runUpBase: undefined, roundTrip: undefined, roundTripOf: undefined }), book(990104, 1 * M, 1.4 * M)],
    990105: [stats(990105, flat(1 * M), flat(1.4 * M), trips([0, 0, 0, 0, 0])), { ...book(990105, 1 * M, 1.4 * M), topSells: [{ price: 1.4 * M, volume: 6000 }, { price: 1.401 * M, volume: 6000 }] }],
    990106: [stats(990106, flat(1 * M), flat(1.4 * M), trips([12, 26, 33, 40, 25])), { ...book(990106, 1 * M, 1.4 * M), npcAnywhere: 1.3 * M }],
    990107: [stats(990107, flat(1 * M), flat(1.4 * M), trips([12, 26, 33, 40, 25])), { ...book(990107, 1 * M, 1.4 * M), npcAnywhere: 1.5 * M }],
    990108: [stats(990108, flat(1 * M), flat(1.4 * M), trips([10, 20, 30, 35, 20])), book(990108, 0.8 * M, 0.9 * M)],
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
 * which only Place and leave prices, carries "Market moved", so it's left out of the mix by default and the mix says so
 * (the plans review, 9 October 2026). With "Keep items whose market moved" on (kept per browser too) it's back, and its
 * flag's tip says which side moved and by how much.
 */
/**
 * Place and leave's round trips (3 days, the planner's default horizon): 990101's row and the mix line say how often it came
 * round; 990104 (stats from before the count) asks for a scan; 990102 and 990105 are left out and counted; and with
 * "Keep items whose market moved" on, the start dialog says the plan's horizon and what history expects of its 2 items.
 */
const PLANNER_TRIPS = {
  said: ['1 from before round trips were counted', '1 with too little history to say how often it round-trips', '1 that never round-tripped within 3 days in the last 60 days',
    'predates Place and leave’s count of round trips', 'History says it round-trips within 3 days on 45% of the last 60 days', 'Each item’s at how often it round-tripped within 3 days on past days'],
  row: ['45%', 'of past days, within 3 days'], rowTip: 'Round trip within 3 days on 45% of past days',
  kept: 'About 1 of these 2 round-trips within 3 days, history says',
  dialog: ['in buy orders, a 3-day plan (Place and leave)', 'About 1 of these 2 round-trips within 3 days, history says', 'if every one came round'],
};
const PLANNER_LEAVE = {
  out: ['1 left out because its market moved', 'Keep items whose market moved (1)', 'Off: 1 left out'],
  kept: 'On: 1 kept, with the Market moved flag in the mix.',
  flag: 'Market moved', tip: ['Your bid would be at or over today’s cheapest listing of 900,000 ISK', 'The plan sells 56% over today’s cheapest listing of 900,000 ISK', 'half of the last 14 days'],
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
      // The Research tab on these ledgers: the stand-in login holds no standings or research permission and the main's clone
      // state was never read, so it must say all three (never "no standing" for every corporation, never call the main Alpha,
      // never a step 4 that waits on a read this login can't make).
      if (hash === 'hustles/research') {
        for (const t of ['Log in again: this login wasn’t given the permission to read your standings.', 'Clone state not read', '17 datacores’ books couldn’t be read just now',
          'Log in again to read your research: this login wasn’t given EVE’s permission to read R&D agents.'])
          if (!(await page.locator('.page', { hasText: t }).count())) problems.push(`not drawn on the Research tab: “${t}”`);
        if (await page.locator('.page', { hasText: 'Needs Omega' }).count()) problems.push('the Research tab calls a main whose clone state isn’t read Alpha');
      }
      // Check my hangar with the stand-in login, which holds no assets permission: it says so and how to get it, and reads
      // nothing (every request outside this server is refused anyway).
      if (hash === 'positions') {
        await page.locator('.head-actions button', { hasText: 'Check my hangar' }).click().catch((e) => problems.push(`couldn't click Check my hangar: ${e.message.split('\n')[0]}`));
        await page.waitForTimeout(400);
        if (!(await page.locator('dialog.confirm[open] .notice', { hasText: 'needs EVE’s permission to read your assets, which this login wasn’t given. Log in again and EVE asks for it.' }).count())) problems.push('Check my hangar without the assets permission doesn’t say to log in again');
        if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out with Check my hangar open: ${o}`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
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
      // By default the moved item is left out of the mix, and the page says so.
      const pageText = (await page.locator('.page').innerText().catch(() => '')).replace(/\s+/g, ' ');
      for (const t of PLANNER_LEAVE.out) if (!pageText.includes(t)) problems.push(`not drawn in Place and leave: “${t}”`);
      if (await page.locator('.page table .flag', { hasText: PLANNER_LEAVE.flag }).count()) problems.push('in the mix by default, and shouldn’t be: an item flagged Market moved');
      // How often each item came round within the horizon: its row, the mix line, the tile, and the items left out for it.
      for (const t of PLANNER_TRIPS.said) if (!pageText.includes(t)) problems.push(`not drawn in Place and leave: “${t}”`);
      const tripCell = page.locator('.page table tbody tr', { hasText: '990101' }).locator('td.round-trip');
      const tripText = (await tripCell.innerText().catch(() => '')).replace(/\s+/g, ' ');
      for (const t of PLANNER_TRIPS.row) if (!tripText.includes(t)) problems.push(`not drawn: 990101's round trip “${t}” (${tripText})`);
      if ((await tripCell.getAttribute('data-tip-title').catch(() => null)) !== PLANNER_TRIPS.rowTip) problems.push(`990101's round trip tip isn't “${PLANNER_TRIPS.rowTip}”`);
      for (const t of ['990102', '990104', '990105']) if (await page.locator('.page table tbody tr', { hasText: t }).count()) problems.push(`in the Place-and-leave mix, and shouldn’t be: ${t}`);
      if (/\b(0|100)% of past days/.test(pageText.replace(/45% of past days/g, ''))) problems.push('a round trip said as 0% or 100% where it isn’t known');
      await judge('planner (place and leave)');
      // "Keep items whose market moved" brings it back, with its flag and the flag's tip.
      problems = [];
      await page.evaluate(() => {
        localStorage.setItem('jita-ledger:planner', JSON.stringify({ patient: true, keepMoved: true }));
        location.hash = '#settings/appearance';
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => { location.hash = '#planner'; });
      await page.waitForTimeout(1500);
      if (!(await page.locator('.page', { hasText: PLANNER_LEAVE.kept }).count())) problems.push(`not drawn with keep on: “${PLANNER_LEAVE.kept}”`);
      if (!(await page.locator('.page', { hasText: PLANNER_TRIPS.kept }).count())) problems.push(`not drawn with keep on: “${PLANNER_TRIPS.kept}”`);
      // The start dialog's lead: the plan's horizon, and what history says of its round trips. Cancelled: nothing starts.
      await page.getByRole('button', { name: 'Start this plan' }).first().click().catch(() => problems.push('no Start this plan button in Place and leave'));
      const startDialog = page.locator('dialog.confirm[open]');
      await startDialog.waitFor({ timeout: 5000 }).catch(() => undefined);
      const startSaid = (await startDialog.innerText().catch(() => '')).replace(/\s+/g, ' ');
      for (const t of PLANNER_TRIPS.dialog) if (!startSaid.includes(t)) problems.push(`not drawn: the start dialog's “${t}” (${startSaid.slice(0, 200)})`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}-planner-start-dialog.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const moved = page.locator('.page table .flag', { hasText: PLANNER_LEAVE.flag });
      if (!(await moved.count())) problems.push(`not drawn in Place and leave with keep on: no “${PLANNER_LEAVE.flag}” flag`);
      else {
        const tip = (await moved.first().getAttribute('data-tip')) ?? '';
        for (const t of PLANNER_LEAVE.tip) if (!tip.includes(t)) problems.push(`not drawn: the Market moved tip's “${t}” (${tip.slice(0, 120)})`);
      }
      await judge('planner (place and leave, keeping moved items)');
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
  // its real Jita book and its history, the dates moved so the last day is yesterday, and the browser holds its real
  // watched flow moved the same way, so "Feeds a long queue" (paced by that watching blended with the book's split) and
  // the sell's after-a-move line are drawn on any day the check runs.
  if (SHOWN.includes('orders') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('plan'))) {
    const M = 1e6, PX = 47466, TRIT = 34, KEY = 89156, JITA = 60003760, ID = 7433389018;
    // Clone Soldier Transporter Tag, left by a Place-and-leave plan an hour ago (the plans review, 9 October 2026): its bid
    // placed two days before that and raised since isn't the plan's, its listing placed since is. ESI refuses its book.
    const CS = 33140, CS_BID = 7433389245, CS_SELL = 7435352999;
    const fs = await import('node:fs');
    const arb = JSON.parse(fs.readFileSync(new URL('./fixtures/orders-queue.json', import.meta.url), 'utf8'));
    const ARB = arb.typeId, DAY_MS = 86400_000;
    const shift = Date.parse(new Date(Date.now() - DAY_MS).toISOString().slice(0, 10)) - Date.parse(arb.history.at(-1).date);
    const arbHistory = arb.history.map((r) => ({ ...r, date: new Date(Date.parse(r.date) + shift).toISOString().slice(0, 10) }));
    // Its watched flow, moved the same way (a day landing after today dropped): four whole days before today, 81 h with
    // 33 times the best sell price improved and none of them the user's, so others undercut it about 0.41 times an hour,
    // the busiest third of the research's moves, and its Move it says how long a move to the front lasted there.
    const today = new Date().toISOString().slice(0, 10);
    const arbFlow = Object.fromEntries(Object.entries(arb.flow).map(([d, f]) => [new Date(Date.parse(d) + shift).toISOString().slice(0, 10), f]).filter(([d]) => d <= today));
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
        [CS_BID]: { orderId: CS_BID, typeId: CS, isBuy: true, price: 29.23 * M, volumeTotal: 4, volumeRemain: 4, issued: iso(planAt + 600_000), state: 'open', locationId: JITA,
          seen: [{ issued: iso(planAt - 2 * DAY_MS), price: 28.82 * M, remain: 4 }, { issued: iso(planAt + 600_000), price: 29.23 * M, remain: 4 }] },
        [CS_SELL]: { orderId: CS_SELL, typeId: CS, isBuy: false, price: 33.4 * M, volumeTotal: 1, volumeRemain: 1, issued: iso(planAt + 900_000), state: 'open', locationId: JITA },
      },
      leave: [CS], leaveFrom: { [CS]: iso(planAt) },
      // The Key's bid has bought 2 of its 15, in the hangar: an at-the-front plan's stock to list, whose book ESI refuses here.
      txs: { k1: { id: 'k1', source: 'esi', typeId: KEY, date: iso(planAt + 5 * 60_000), isBuy: true, qty: 2, unitPrice: 24.95 * M, locationId: JITA } },
      stock: { at: new Date(Date.now() - 600_000).toISOString(), jita: { [ARB]: arb.hangar, [KEY]: 2 }, total: { [ARB]: arb.hangar, [KEY]: 2 }, inContainers: 0 },
      names: { [PX]: 'Praxis', [TRIT]: 'Tritanium', [KEY]: 'Vigilance Resonance Key', [ARB]: arb.name, [CS]: 'Clone Soldier Transporter Tag' },
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
    await page.evaluate(async ([d, auth, cache]) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('jita-ledger:auth', JSON.stringify(auth));
      for (const [db, put] of [['jita-ledger', d], ['jita-ledger-cache', cache], ['jita-ledger-alts', {}]]) {
        const h = await new Promise((res) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
        if (!h.objectStoreNames.contains('kv')) { h.close(); continue; }
        await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
        h.close();
      }
    }, [ledger, { ...ownerAuth(), scopes: ['esi-ui.open_window.v1'] }, { flow: { log: { [ARB]: arbFlow }, ends: {} } }]);
    await page.goto(`${BASE}#orders`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    await page.waitForTimeout(1000);
    // Leave alone belongs to a plan's own orders: the Clone Soldier bid from before the plan gets the usual advice and says
    // why, the listing placed since is left; Leave alone on the bid leaves every order of the item, Leaving it then neither.
    // Before the check, while every order is listed (its book is refused, so it has no row once checked).
    {
      const btn = (id) => page.locator(`tr[data-order="${id}"] .acts button`, { hasText: /^(Leave alone|Leaving it)$/ });
      const said = async () => [await btn(CS_BID).innerText({ timeout: 5000 }).catch(() => '–'), await btn(CS_SELL).innerText({ timeout: 5000 }).catch(() => '–')].map((t) => t.trim().toLowerCase());
      const at = await said();
      if (at.join() !== 'leave alone,leaving it') problems.push(`Clone Soldier's bid from before the plan and listing since read “${at.join('”, “')}”, not “Leave alone”, “Leaving it”`);
      const why = (await btn(CS_BID).getAttribute('data-tip', { timeout: 5000 }).catch(() => '')) ?? '';
      if (!why.includes('This one was placed before it, so it gets the usual advice')) problems.push(`not drawn: why Clone Soldier's bid isn't left (${why.slice(0, 120)})`);
      await btn(CS_BID).click({ timeout: 5000 }).catch((e) => problems.push(`couldn't press Leave alone: ${e.message.split('\n')[0]}`));
      await page.waitForTimeout(300);
      if ((await said()).join() !== 'leaving it,leaving it') problems.push(`Leave alone on the bid didn't leave every Clone Soldier order: ${(await said()).join(', ')}`);
      await btn(CS_SELL).click({ timeout: 5000 }).catch((e) => problems.push(`couldn't press Leaving it: ${e.message.split('\n')[0]}`));
      await page.waitForTimeout(300);
      if ((await said()).join() !== 'leave alone,leave alone') problems.push(`Leaving it didn't stop leaving every Clone Soldier order: ${(await said()).join(', ')}`);
    }
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
    // How long a move to the front lasted on markets as busy as the Arbalest's sell side (approved 3 October 2026): under
    // its Move to, on that row alone.
    const after = page.locator(`tr[data-order="${arb.sell.orderId}"] [data-tip-title="After a move"]`);
    if (!(await after.count())) problems.push('not drawn: no “After a move” line under the Arbalest sell’s Move to');
    else {
      const line = (await after.first().innerText()).replace(/\s+/g, ' ');
      if (!line.includes('After a move, half were beaten again within about 1.6 h')) problems.push(`the Arbalest sell's after-a-move line reads “${line}”`);
      const tip = (await after.first().getAttribute('data-tip')) ?? '';
      for (const want of ['undercut the best sell price about 0.41 times an hour', 'busiest third', 'Half lasted about 1.6 h', '42% were beaten again within an hour, 57% within 3 h',
        '415 of your 1,216 price changes', 'not a forecast for this order', 'Left out: the 105 beaten again within 10 minutes']) if (!tip.includes(want)) problems.push(`not drawn: the after-a-move tip's “${want}”`);
    }
    if ((await page.locator('[data-tip-title="After a move"]').count()) !== 1) problems.push(`${await page.locator('[data-tip-title="After a move"]').count()} after-a-move lines, not the Arbalest sell's one: only a Move it to the front carries it`);
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
    // The after-a-move tip as it's drawn, for looking over by eye.
    if (SHOTS && (await after.count())) {
      await after.first().scrollIntoViewIfNeeded().catch(() => undefined);
      await after.first().hover().catch(() => undefined);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}-plan-orders-after-move.png` });
      await page.mouse.move(0, 0);
    }
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
    process.stdout.write(unique.length ? `  FAIL plan #orders\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   plan #orders (Keep it, the plan chip, a buy over its resale, a buy feeding a long queue, a move’s after-a-move line, a plan’s Leave alone on its own orders), #todo (that buy, the Key to list) and #planner (the checklist, its list part with no book)\n');
    await page.close();
  }
  // A ledger from before `leaveFrom` (the plans review, 9 October 2026): `leave` holds the 2 October Place-and-leave plan's
  // Clone Soldier Transporter Tag, whose position closed on 3 October, beside one of its items still open and loot left by
  // hand. Once the cloud's first pull of the visit is in (stubbed here), the app lets go of the plan item left behind, once,
  // and pushes `leave`; the `leaveFrom` it writes as done stays in this browser. Loaded again with Clone Soldier left by
  // hand once more, nothing is let go: it ran once.
  if (SHOWN.includes('orders') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('plan'))) {
    const CS = 33140, C32 = 62404, LOOT = 34, AT = '2026-10-02T15:36:31.972Z', iso = (t) => new Date(t).toISOString();
    const ledger = {
      settings: { acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, clone: 'omega', target: 5, share: 7.5, waitHours: 3 },
      plans: [{ id: 'oct2', name: '2 Oct · 999.16 M ISK in 33 items', at: AT, isk: 999e6, horizonDays: 0.5, patient: true,
        items: [{ typeId: CS, buyAt: 29.37e6, units: 1, sellAt: 33.4e6, positionId: 'cs' }, { typeId: C32, buyAt: 18020, units: 7221, sellAt: 20070, positionId: 'c32' }] }],
      positions: [{ id: 'cs', typeId: CS, openedAt: '2026-09-30T00:41:37.568Z', closedAt: '2026-10-03T11:25:24.313Z', status: 'closed', jitaOnly: true, excluded: [], included: [] },
        { id: 'c32', typeId: C32, openedAt: AT, status: 'open', jitaOnly: true, excluded: [], included: [] }],
      orders: { 7433389245: { orderId: 7433389245, typeId: CS, isBuy: true, price: 29.23e6, volumeTotal: 4, volumeRemain: 4, issued: '2026-10-02T22:27:17Z', state: 'open', locationId: 60003760,
        seen: [{ issued: '2026-09-30T00:43:08Z', price: 28.82e6, remain: 4 }, { issued: '2026-10-02T22:27:17Z', price: 29.23e6, remain: 4 }] } },
      leave: [CS, C32, LOOT],
      names: { [CS]: 'Clone Soldier Transporter Tag', [C32]: 'Compressed Fullerite-C32', [LOOT]: 'Tritanium' },
      meta: { walletBalance: 1e9, lastSync: iso(Date.now() - 600_000) },
      // Met the cloud before, nothing waiting: its next pull is the visit's first.
      cloud: { charId: ownerAuth().characterId, rev: 1, started: true, dirty: { r: [], d: [] } },
    };
    const page = await browser.newPage(VIEW);
    const pushed = [];
    let pulls = 0;
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (route.request().url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      if (url.pathname === '/v1/pull') { pulls++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rev: 1, next: null, records: [], docs: [] }) }); }
      if (url.pathname === '/v1/push') { pushed.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rev: 1 + pushed.length }) }); }
      return route.abort();
    });
    const problems = [];
    page.on('pageerror', (e) => problems.push(`threw: ${e.message.split('\n')[0]}`));
    const seed = (put) => page.evaluate(async ([d, auth]) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('jita-ledger:auth', JSON.stringify(auth));
      const h = await new Promise((res) => { const q = indexedDB.open('jita-ledger'); q.onsuccess = () => res(q.result); q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
      await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(d)) st.put(v, k); t.oncomplete = res; });
      h.close();
    }, [put, ownerAuth()]);
    const stored = () => page.evaluate(async () => {
      const h = await new Promise((res) => { const q = indexedDB.open('jita-ledger'); q.onsuccess = () => res(q.result); });
      const get = (k) => new Promise((res) => { const q = h.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); });
      const out = { leave: await get('leave'), leaveFrom: await get('leaveFrom') };
      h.close();
      return out;
    });
    await page.goto(SEED_PAGE);
    await seed(ledger);
    await page.goto(`${BASE}#orders`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    // The pull, then the push 3 s after the change.
    for (let i = 0; i < 40 && !pushed.some((b) => b.docs?.some((x) => x.key === 'leave')); i++) await page.waitForTimeout(250);
    await page.waitForTimeout(400);
    const first = await page.goto(SEED_PAGE).then(() => stored());
    if (!pulls) problems.push('the cloud was never pulled');
    if (JSON.stringify(first.leave) !== JSON.stringify([C32, LOOT])) problems.push(`the first load left ${JSON.stringify(first.leave)}, not the open plan item and the loot (Clone Soldier let go)`);
    if (JSON.stringify(first.leaveFrom) !== '{}') problems.push(`the first load didn't mark it done: leaveFrom ${JSON.stringify(first.leaveFrom)}`);
    const sent = pushed.flatMap((b) => b.docs ?? []);
    const sentLeave = sent.filter((x) => x.key === 'leave').at(-1)?.d;
    if (JSON.stringify(sentLeave) !== JSON.stringify([C32, LOOT])) problems.push(`the cloud wasn't sent the new leave: ${JSON.stringify(sent.map((x) => x.key))}`);
    if (sent.some((x) => x.key === 'leaveFrom')) problems.push('the done mark went to the cloud: it stays in this browser');
    // Clone Soldier left by hand again (its position still closed): a second load lets nothing go.
    await seed({ ...ledger, leave: [CS, C32, LOOT], leaveFrom: {} });
    pushed.length = 0;
    await page.goto(`${BASE}#orders`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    await page.waitForTimeout(4500);
    const again = await page.goto(SEED_PAGE).then(() => stored());
    if (JSON.stringify(again.leave) !== JSON.stringify([CS, C32, LOOT])) problems.push(`the second load let go again: ${JSON.stringify(again.leave)}`);
    if (pushed.some((b) => b.docs?.some((x) => x.key === 'leave'))) problems.push('the second load pushed leave');
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'plan', page: 'orders (leave from before leaveFrom)', problems: unique });
    process.stdout.write(unique.length ? `  FAIL plan #orders (leave from before leaveFrom)\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   plan #orders (a ledger from before leaveFrom: the closed plan item let go once, after the first pull, and pushed)\n');
    await page.close();
  }
  // Left orders the market has left since they were placed (the plans review, 9 October 2026): a bid of 1,000 at 100 first
  // placed five days ago at 99 and raised since, trading's lows at 95 on the nine days before it and 104 to 108 on the five
  // since; a listing of 10 at 120 placed five days ago, the highs at 125 before and 112 down to 108 since. Both left by hand.
  // ESI answers their books and histories (the days moved so the last is yesterday), nothing else. Orders must say under
  // each verdict that it hasn't been reached on any of the 5 days since, and Clears in "0 of 5 days since placed" (a listing's "since listed"); To do
  // must list each once, as "Not reached since you placed it" under Needs action, the bid's opening copying 104. Both widths.
  if (SHOWN.includes('orders') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('plan'))) {
    const JITA = 60003760, DAY_MS = 86400_000, BID = 990301, LIST = 990302, BID_ID = 8800001, LIST_ID = 8800002;
    const yesterday = Date.parse(new Date(Date.now() - DAY_MS).toISOString().slice(0, 10));
    const day = (i) => new Date(yesterday - (13 - i) * DAY_MS).toISOString().slice(0, 10);
    const placed = new Date(Date.parse(day(9) + 'T12:00:00Z')).toISOString(), raised = new Date(Date.now() - DAY_MS).toISOString();
    const hist = {
      [BID]: Array.from({ length: 14 }, (_, i) => ({ date: day(i), average: 112, highest: 116, lowest: i < 9 ? 95 : 104 + (i - 9), volume: 1000, order_count: 20 })),
      [LIST]: Array.from({ length: 14 }, (_, i) => ({ date: day(i), average: 110, highest: i < 9 ? 125 : 112 - (i - 9), lowest: 100, volume: 1000, order_count: 20 })),
    };
    const books = { [BID]: [[BID_ID, 1, 100, 1000], [8800011, 1, 103, 500], [8800012, 0, 121, 300]], [LIST]: [[LIST_ID, 0, 120, 10], [8800021, 0, 118, 5], [8800022, 1, 100, 50]] };
    const ledger = {
      settings: { acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, clone: 'omega', target: 5, share: 7.5, waitHours: 3 },
      orders: {
        [BID_ID]: { orderId: BID_ID, typeId: BID, isBuy: true, price: 100, volumeTotal: 1000, volumeRemain: 1000, issued: raised, state: 'open', locationId: JITA,
          seen: [{ issued: placed, price: 99, remain: 1000 }, { issued: raised, price: 100, remain: 1000 }] },
        [LIST_ID]: { orderId: LIST_ID, typeId: LIST, isBuy: false, price: 120, volumeTotal: 10, volumeRemain: 10, issued: placed, state: 'open', locationId: JITA, seen: [{ issued: placed, price: 120, remain: 10 }] },
      },
      leave: [BID, LIST],
      names: { [BID]: 'Left Bid Fixture', [LIST]: 'Left Listing Fixture' },
      meta: { walletBalance: 1e9, lastSync: new Date(Date.now() - 600_000).toISOString() },
    };
    const page = await browser.newPage(VIEW);
    await page.addInitScript(() => {
      window.__copied = [];
      try { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (t) => { window.__copied.push(t); } }); } catch { /* no clipboard: the check says so */ }
    });
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (route.request().url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      const t = url.searchParams.get('type_id');
      if (url.hostname === 'esi.evetech.net' && url.pathname === '/markets/10000002/history/' && hist[t]) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(Date.now() + 3600_000).toUTCString() }, body: JSON.stringify(hist[t]) });
      }
      if (url.hostname === 'esi.evetech.net' && url.pathname === '/markets/10000002/orders/' && books[t]) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(Date.now() + 300_000).toUTCString(), 'x-pages': '1' },
          body: JSON.stringify(books[t].map(([id, buy, price, volume]) => ({ order_id: id, type_id: Number(t), location_id: JITA, is_buy_order: buy === 1, price, volume_remain: volume, volume_total: volume, issued: placed, duration: 90, min_volume: 1, range: 'region' }))) });
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
        await new Promise((res) => { const tr = h.transaction('kv', 'readwrite'); const st = tr.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); tr.oncomplete = res; });
        h.close();
      }
    }, [ledger, { ...ownerAuth(), scopes: ['esi-ui.open_window.v1'] }]);
    await page.goto(`${BASE}#orders`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Check prices|Check again/ }).click().catch((e) => problems.push(`couldn't check prices: ${e.message.split('\n')[0]}`));
    await page.waitForSelector(`tr[data-order="${BID_ID}"] .flag:has-text("Move it")`, { timeout: 20_000 }).catch(() => problems.push('not drawn: no “Move it” on the left bid'));
    await page.waitForTimeout(800);
    const row = async (id) => (await page.locator(`tr[data-order="${id}"]`).innerText().catch(() => '')).replace(/\s+/g, ' ');
    const bidRow = await row(BID_ID), listRow = await row(LIST_ID);
    for (const want of ['Not reached on any of the 5 days since you placed it; today’s best bid is 3.0% over.', 'not reached', '0 of 5 days since placed', '104']) if (!bidRow.includes(want)) problems.push(`not drawn on the left bid's row: “${want}” (${bidRow.slice(0, 200)})`);
    if (!(await page.locator(`tr[data-order="${LIST_ID}"] .flag`, { hasText: 'Move it' }).count())) problems.push('not drawn: no “Move it” on the left listing');
    for (const want of ['Not reached on any of the 5 days since you listed it; today’s cheapest listing is 1.7% under.', '0 of 5 days since listed', '112']) if (!listRow.includes(want)) problems.push(`not drawn on the left listing's row: “${want}” (${listRow.slice(0, 200)})`);
    if (bidRow.includes('of the last 14 days') || listRow.includes('of the last 14 days')) problems.push('a left order the market has left still reads “of the last 14 days”');
    const why = (await page.locator(`tr[data-order="${BID_ID}"] .flag`).first().getAttribute('data-tip').catch(() => '')) ?? '';
    if (!why.includes('At 104, the lowest trading got down to since you placed it (on 1 of those days), it still makes')) problems.push(`the left bid's verdict tip doesn't say where it moves (${why.slice(0, 200)})`);
    if (!PHONE) {
      const s = await sideways(page);
      if (s?.over > 0) problems.push(`the orders table scrolls sideways: ${s.over} px past its ${s.width} px box`);
    }
    let boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-left-orders.png` });
    // To do: one item each, Needs action, the bid's opening copying 104.
    await page.evaluate(() => { location.hash = '#todo'; });
    const items = page.locator('.tn-item', { hasText: 'Not reached since you placed it' });
    await items.first().waitFor({ timeout: 10_000 }).catch(() => problems.push('not drawn: no “Not reached since you placed it” item on To do'));
    const texts = (await items.allInnerTexts().catch(() => [])).map((t) => t.replace(/\s+/g, ' '));
    if (texts.length !== 2) problems.push(`To do lists ${texts.length} “Not reached since you placed it” items, not the bid's and the listing's`);
    const bidItem = texts.find((t) => t.includes('Left Bid Fixture buy order')) ?? '';
    for (const want of ['Not reached on any of the 5 days since you placed it', 'Move it to 104 ISK']) if (!bidItem.includes(want)) problems.push(`not drawn: the bid's To do item's “${want}” (${bidItem.slice(0, 200)})`);
    if (!texts.some((t) => t.includes('Left Listing Fixture sell order') && t.includes('Move it to 112 ISK'))) problems.push('not drawn: the listing’s To do item moving it to 112');
    if (await page.locator('.tn-item', { hasText: 'Left Bid Fixture' }).count() !== 1) problems.push('the left bid has more than one To do item');
    await page.getByRole('button', { name: /Needs action/ }).click().catch((e) => problems.push(`couldn't filter To do: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(300);
    if ((await page.locator('.tn-item', { hasText: 'Not reached since you placed it' }).count()) !== 2) problems.push('the “Not reached since you placed it” items aren’t under Needs action');
    await page.locator('.tn-item', { hasText: 'Left Bid Fixture' }).getByRole('button', { name: 'Open in game' }).click().catch((e) => problems.push(`couldn't open the bid in game: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(500);
    const copied = await page.evaluate(() => window.__copied ?? []);
    if (!copied.includes('104')) problems.push(`opening the bid's item didn't copy 104: ${JSON.stringify(copied)}`);
    boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary on To do');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out on To do: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-left-todo.png` });
    await page.evaluate(() => localStorage.removeItem('jita-ledger:todo-filter'));
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'plan', page: 'orders (not reached since placed)', problems: unique });
    process.stdout.write(unique.length ? `  FAIL plan #orders (not reached since placed)\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   plan #orders (a left bid and listing not reached since placed: said under the verdict and in Clears in) and #todo (one item each, Needs action, the move copied)\n');
    await page.close();
  }
  // A plan that took over a position with earlier trading (the user's second plan, 2 October 2026): Datacore - Rocket
  // Science's position open for a week, 9,372 sold before the plan and 2,000 of the 2,628 it held sold since, the plan's bid
  // of 188 not filled. Showing the plan's positions must count it from the plan's start (nothing bought or sold, nothing
  // left out) and say it's shared; the list without a plan shows it whole. And its Imperial Navy Infiltrator bid, over the
  // cheapest listing, bought 11 at once with no order to show yet: the checklist must count it placed, saying so, and To
  // do must not ask for it (Raging Dark Filament, not placed, keeps the checklist up). And two of the four bids the user
  // cancelled with nothing bought (8 October 2026): Fierce Exotic Filament's, its position still open, and Chaotic Exotic
  // Filament's, its position closed too. The checklist must say each is dropped, never asked for again, and To do must
  // not ask to place either (nor anything at all about the closed one). Every request outside this server is refused.
  // Both widths.
  if (SHOWN.includes('positions') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('plan'))) {
    const JITA = 60003760, RS = 20420, INF = 31866, RD = 47894, FE = 47889, CE = 47891, FG = 47901, DAY_MS = 86400_000;
    const planAt = Date.now() - 3600_000, iso = (t) => new Date(t).toISOString();
    const tx = (id, typeId, isBuy, qty, price, t) => ({ id, source: 'esi', typeId, date: iso(t), isBuy, qty, unitPrice: price, locationId: JITA });
    const ledger = {
      settings: { acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, target: 5, share: 7.5, waitHours: 3 },
      plans: [{ id: 'mur4lko4xsll6o', name: '2 Oct · 999.16 M ISK in 33 items', at: iso(planAt), isk: 999156436.25, horizonDays: 0.5, patient: true,
        items: [{ typeId: RS, buyAt: 85_540, units: 188, sellAt: 94_430, positionId: 'rs' }, { typeId: INF, buyAt: 1_658_000, units: 11, sellAt: 1_836_000, positionId: 'inf' },
          { typeId: RD, buyAt: 1_711_000, units: 8, sellAt: 1_983_000, positionId: 'rd' },
          { typeId: FE, buyAt: 2_813_000, units: 9, sellAt: 3_443_000, positionId: 'fe' }, { typeId: CE, buyAt: 21_470_000, units: 2, sellAt: 24_390_000, positionId: 'ce' },
          { typeId: FG, buyAt: 2_158_000, units: 6, sellAt: 2_486_000, positionId: 'fg' }] }],
      positions: [{ id: 'rs', typeId: RS, openedAt: iso(planAt - 8 * DAY_MS), status: 'open', jitaOnly: true, excluded: [], included: [] },
        { id: 'inf', typeId: INF, openedAt: iso(planAt), status: 'open', jitaOnly: true, excluded: [], included: [] },
        { id: 'rd', typeId: RD, openedAt: iso(planAt), status: 'open', jitaOnly: true, excluded: [], included: [] },
        { id: 'fe', typeId: FE, openedAt: iso(planAt), status: 'open', jitaOnly: true, excluded: [], included: [] },
        { id: 'ce', typeId: CE, openedAt: iso(planAt), closedAt: iso(planAt + 1_800_000), status: 'closed', jitaOnly: true, excluded: [], included: [] },
        { id: 'fg', typeId: FG, openedAt: iso(planAt), status: 'open', jitaOnly: true, excluded: [], included: [] }],
      txs: {
        b1: tx('b1', RS, true, 12_000, 80_720, planAt - 8 * DAY_MS + 300_000),
        s1: tx('s1', RS, false, 9372, 93_516, planAt - 2 * DAY_MS),
        s2: tx('s2', RS, false, 2000, 96_980, planAt + 1_200_000),
        i1: tx('i1', INF, true, 11, 1_608_000, planAt + 600_000),
      },
      orders: {
        7434267823: { orderId: 7434267823, typeId: RS, isBuy: false, price: 96_980, volumeTotal: 4924, volumeRemain: 628, issued: iso(planAt - 1.2 * DAY_MS), state: 'open', locationId: JITA },
        7435100906: { orderId: 7435100906, typeId: RS, isBuy: true, price: 85_540, volumeTotal: 188, volumeRemain: 188, issued: iso(planAt + 720_000), state: 'open', locationId: JITA },
        // Cancelled with nothing bought, as ESI's order history keeps them.
        7435099667: { orderId: 7435099667, typeId: FE, isBuy: true, price: 2_813_000, volumeTotal: 9, volumeRemain: 9, issued: iso(planAt + 556_000), state: 'cancelled', locationId: JITA },
        7435098339: { orderId: 7435098339, typeId: CE, isBuy: true, price: 21_470_000, volumeTotal: 2, volumeRemain: 2, issued: iso(planAt + 411_000), state: 'cancelled', locationId: JITA },
      },
      names: { [RS]: 'Datacore - Rocket Science', [INF]: 'Imperial Navy Infiltrator', [RD]: 'Raging Dark Filament', [FE]: 'Fierce Exotic Filament', [CE]: 'Chaotic Exotic Filament', [FG]: 'Fierce Gamma Filament' },
      meta: { walletBalance: 1e9, lastSync: iso(Date.now() - 600_000) },
      // The plan's Leave alone, as starting it left them: skipping Raging Dark Filament lets it go, Place it after all puts it back.
      leave: [RD, FG], leaveFrom: { [RD]: iso(planAt), [FG]: iso(planAt) },
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
    // Late in the case Fierce Gamma Filament's book answers too, risen 10% over the plan's bid, so both bids left can be skipped.
    let fgBook = false;
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (route.request().url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      if (fgBook && url.hostname === 'esi.evetech.net' && url.pathname === '/markets/10000002/orders/' && url.searchParams.get('type_id') === String(FG)) {
        const book = [[5, true, 2_400_000, 10], [6, false, 2_450_000, 10]];
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(Date.now() + 300_000).toUTCString(), 'x-pages': '1' },
          body: JSON.stringify(book.map(([id, buy, price, volume]) => ({ order_id: id, type_id: FG, location_id: JITA, is_buy_order: buy, price, volume_remain: volume, volume_total: volume, issued: iso(planAt - DAY_MS), duration: 90, min_volume: 1, range: 'region' }))) });
      }
      if (url.hostname === 'esi.evetech.net' && url.pathname === '/markets/10000002/history/' && url.searchParams.get('type_id') === String(INF)) {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(Date.now() + 3600_000).toUTCString() }, body: JSON.stringify(infHistory) });
      }
      // Raging Dark Filament's book as it stood within the hour of the plan (2 October 2026): bids at 1,440,000, listings
      // from 1,741,000, so the plan's bid of 1,711,000 sits 19% over today's best and its sale 14% over the cheapest listing.
      if (url.hostname === 'esi.evetech.net' && url.pathname === '/markets/10000002/orders/' && url.searchParams.get('type_id') === String(RD)) {
        const book = [[1, true, 1_440_000, 30], [2, true, 1_400_000, 50], [3, false, 1_741_000, 20], [4, false, 1_748_000, 40]];
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { expires: new Date(Date.now() + 300_000).toUTCString(), 'x-pages': '1' },
          body: JSON.stringify(book.map(([id, buy, price, volume]) => ({ order_id: id, type_id: RD, location_id: JITA, is_buy_order: buy, price, volume_remain: volume, volume_total: volume, issued: iso(planAt - DAY_MS), duration: 90, min_volume: 1, range: 'region' }))) });
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
    if (!plans.includes('Place and leave, a 12-hour plan')) problems.push(`not drawn: the Plans panel's “Place and leave, a 12-hour plan” (${plans.slice(0, 160)})`);
    if (!/2 of 6\s*2 dropped/.test(plans)) problems.push(`the Plans panel doesn't count 2 of 6 placed and 2 dropped (${plans.slice(0, 200)})`);
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
    // The panel's title is drawn in capitals (innerText gives them so).
    if (!placing.toLowerCase().includes('placing 2 oct · 999.16 m isk in 33 items, a 12-hour plan')) problems.push(`the checklist doesn’t name the plan with its horizon (${placing.slice(0, 120)})`);
    if (!placing.includes('the order shows only in your order history')) problems.push('not drawn: the checklist doesn’t say where the order went');
    if (!placing.includes('2 of 6 placed, 2 dropped')) problems.push(`the checklist doesn't count 2 of 6 placed, 2 dropped (${placing.slice(0, 120)})`);
    // The bids cancelled with nothing bought: dropped, said and never asked for again.
    const rowText = async (n) => (await page.locator('#placing tbody tr', { hasText: n }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    /** A document of the ledger as the app saved it (it writes 250 ms after a change). */
    const stored = (key) => page.evaluate(async (k) => {
      const h = await new Promise((res) => { const q = indexedDB.open('jita-ledger'); q.onsuccess = () => res(q.result); });
      const v = await new Promise((res) => { const r = h.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
      h.close();
      return v;
    }, key);
    const feRow = await rowText('Fierce Exotic Filament'), ceRow = await rowText('Chaotic Exotic Filament');
    for (const want of ['Bid cancelled with nothing bought: not placed again', 'Your bid of 9 at 2,813,000 ISK']) if (!feRow.includes(want)) problems.push(`not drawn: the checklist's cancelled Fierce Exotic Filament “${want}” (${feRow.slice(0, 200)})`);
    if (!/Position closed \d+ \w+: not placed again/.test(ceRow)) problems.push(`not drawn: the checklist's “Position closed …: not placed again” for Chaotic Exotic Filament (${ceRow.slice(0, 200)})`);
    if (/Not yet/.test(feRow) || /Not yet/.test(ceRow)) problems.push('the checklist reads a dropped item as “Not yet”');
    // Raging Dark Filament, not placed, against its live book: the market has moved, said with the figures, and Skip it.
    await page.locator('#placing tbody tr', { hasText: 'Raging Dark Filament' }).locator('.placing-moved').waitFor({ timeout: 10_000 }).catch(() => undefined);
    const rdRow = await rowText('Raging Dark Filament');
    for (const want of ['The market has moved since the plan priced it', 'Its bid of 1,711,000 ISK is 19% over today’s best bid of 1,440,000 ISK', 'It sells at 1,983,000 ISK, 14% over today’s cheapest listing of 1,741,000 ISK', 'or place it anyway'])
      if (!rdRow.toLowerCase().includes(want.toLowerCase())) problems.push(`not drawn: the checklist's moved Raging Dark Filament “${want}” (${rdRow.slice(0, 220)})`);
    if (!(await page.locator('#placing tbody tr', { hasText: 'Raging Dark Filament' }).getByRole('button', { name: 'Skip it' }).count())) problems.push('not drawn: Skip it on the moved Raging Dark Filament');
    // Fierce Gamma Filament's book is refused: still to place, saying it wasn't checked, never moved and never Skip it.
    const fgRow = await rowText('Fierce Gamma Filament');
    if (!fgRow.includes('Not yet') || !fgRow.includes('Its Jita book couldn’t be read, so it isn’t checked against today’s market')) problems.push(`not drawn: the checklist's unread Fierce Gamma Filament (${fgRow.slice(0, 200)})`);
    if (fgRow.includes('Skip it') || fgRow.includes('has moved')) problems.push('the checklist says the market moved for an item whose book couldn’t be read');
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
    // Its item says the market moved, with the figures, and offers Skip it, which takes it off as the checklist's does.
    const rdItem = page.locator('.tn-item:not(.done)', { hasText: 'Place a buy order: 8 × Raging Dark Filament' });
    await rdItem.filter({ hasText: 'The market has moved' }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    const rdTodo = (await rdItem.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    for (const want of ['Part of 2 Oct · 999.16 M ISK in 33 items, a 12-hour plan.', 'The market has moved since the plan priced it', '19% over today’s best bid of 1,440,000 ISK', 'Skip it, or open it in game']) if (!rdTodo.includes(want)) problems.push(`not drawn: To do's moved Raging Dark Filament “${want}” (${rdTodo.slice(0, 220)})`);
    const fgTodo = (await page.locator('.tn-item:not(.done)', { hasText: 'Place a buy order: 6 × Fierce Gamma Filament' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!fgTodo.includes('Its Jita book couldn’t be read, so it isn’t checked against today’s market.')) problems.push(`not drawn: To do doesn't say Fierce Gamma Filament wasn't checked (${fgTodo.slice(0, 200)})`);
    const skipBtn = rdItem.first().getByRole('button', { name: 'Skip it' });
    if (!(await skipBtn.count())) problems.push('not drawn: Skip it on To do’s moved Raging Dark Filament');
    else {
      if (SHOTS) { await rdItem.first().scrollIntoViewIfNeeded().catch(() => undefined); await page.screenshot({ path: `${SHOTS}-plan-shared-todo-moved.png` }); }
      await skipBtn.click();
      await page.locator('.tn-item.done', { hasText: 'Raging Dark Filament' }).waitFor({ timeout: 5000 }).catch(() => undefined);
      const doneText = (await page.locator('.tn-item.done', { hasText: 'Raging Dark Filament' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (!doneText.includes('You skipped it: the market had moved from the plan’s prices.')) problems.push(`To do doesn't say Raging Dark Filament was skipped (${doneText.slice(0, 160)})`);
      if (await page.locator('.tn-item:not(.done)', { hasText: 'Place a buy order: 8 × Raging Dark Filament' }).count()) problems.push('To do still asks for Raging Dark Filament after Skip it');
      // The plan no longer holds it: its empty position is offered for closing, and its Leave alone has ended.
      const closeIt = (await page.locator('.tn-item:not(.done)', { hasText: 'You skipped it on 2 Oct' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (!closeIt.includes('Raging Dark Filament') || !closeIt.includes('nothing was bought and no order is on it')) problems.push(`not drawn: To do's close item for the skipped Raging Dark Filament's empty position (${closeIt.slice(0, 200)})`);
      await page.waitForTimeout(600);
      const [lv, lf] = [await stored('leave'), await stored('leaveFrom')];
      if (lv?.includes(RD) || lf?.[RD] !== undefined || !lv?.includes(FG)) problems.push(`skipping didn't end Raging Dark Filament's Leave alone, or touched another's (leave ${JSON.stringify(lv)}, leaveFrom ${JSON.stringify(lf)})`);
    }
    if (await page.locator('.tn-item', { hasText: 'Place a buy order: 11 × Imperial Navy Infiltrator' }).count()) problems.push('To do asks for the Infiltrator’s buy order, which bought at once');
    if (await page.locator('.tn-item', { hasText: 'Place a buy order: 9 × Fierce Exotic Filament' }).count()) problems.push('To do asks again for Fierce Exotic Filament’s buy order, which you cancelled');
    if (await page.locator('.tn-item', { hasText: 'Chaotic Exotic Filament' }).count()) problems.push('To do lists something for Chaotic Exotic Filament, cancelled and its position closed');
    // And asks to list what it bought: one item, at the plan's price, something to act on.
    const listItem = page.locator('.tn-item', { hasText: 'List what the plan bought' });
    await page.locator('.tn-item', { hasText: 'List patiently today' }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    if ((await listItem.count()) !== 1) problems.push(`To do lists ${await listItem.count()} “List what the plan bought” items, not the Infiltrator's one`);
    const listText = (await listItem.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    for (const want of ['List 11 × Imperial Navy Infiltrator at 1,836,000 ISK', 'Bought for 2 Oct · 999.16 M ISK in 33 items, a 12-hour plan.', 'List patiently today: 1,836,000 ISK']) if (!listText.includes(want)) problems.push(`not drawn: the To do list item's “${want}” (${listText.slice(0, 200)})`);
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
    // The checklist after Skip it: Raging Dark Filament skipped, saying why with the book it read, and counted dropped;
    // Place it after all puts it back, the market still moved.
    await page.evaluate(() => { location.hash = '#planner'; });
    await page.waitForTimeout(1500);
    const after = (await page.locator('#placing').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!after.includes('2 of 6 placed, 3 dropped')) problems.push(`the checklist doesn't count the skip as dropped: 2 of 6 placed, 3 dropped (${after.slice(0, 160)})`);
    const rdSkipped = await rowText('Raging Dark Filament');
    for (const want of ['the market had moved', 'When you skipped it, the best bid was 1,440,000 ISK and the cheapest listing 1,741,000 ISK, against the plan’s bid of 1,711,000 ISK and sale of 1,983,000 ISK', 'Place it after all'])
      if (!rdSkipped.toLowerCase().includes(want.toLowerCase())) problems.push(`not drawn: the checklist's skipped Raging Dark Filament “${want}” (${rdSkipped.slice(0, 260)})`);
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out on the planner after Skip it: ${o}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-plan-shared-skipped.png` });
    await page.locator('#placing tbody tr', { hasText: 'Raging Dark Filament' }).getByRole('button', { name: 'Place it after all' }).click().catch((e) => problems.push(`couldn't undo the skip: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(800);
    const undone = await rowText('Raging Dark Filament');
    await page.waitForTimeout(600);
    const [lv2, lf2] = [await stored('leave'), await stored('leaveFrom')];
    if (!lv2?.includes(RD) || lf2?.[RD] !== iso(planAt)) problems.push(`Place it after all didn't leave Raging Dark Filament's orders alone again from the plan's start (leave ${JSON.stringify(lv2)}, leaveFrom ${JSON.stringify(lf2)})`);
    if (!undone.includes('The market has moved since the plan priced it') || !(await page.locator('#placing tbody tr', { hasText: 'Raging Dark Filament' }).getByRole('button', { name: 'Skip it' }).count())) problems.push(`Place it after all doesn't ask for it again (${undone.slice(0, 160)})`);
    await page.evaluate(() => { location.hash = '#positions'; });
    await page.waitForTimeout(1200);
    const plans2 = (await page.locator('section[aria-label="Plans"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!/2 of 6\s*2 dropped/.test(plans2)) problems.push(`the Plans panel doesn't count it back once undone: 2 of 6, 2 dropped (${plans2.slice(0, 200)})`);
    // Skipping the last bid waiting keeps the checklist up for the plan's week, so Place it after all stays in reach.
    fgBook = true;
    await page.evaluate(() => { location.hash = '#planner'; location.reload(); });
    await page.waitForSelector('.page', { timeout: 20_000 });
    for (const n of ['Raging Dark Filament', 'Fierce Gamma Filament']) {
      const row = page.locator('#placing tbody tr', { hasText: n });
      await row.locator('.placing-moved').waitFor({ timeout: 10_000 }).catch(() => problems.push(`not drawn: ${n} as moved once its book read`));
      await row.getByRole('button', { name: 'Skip it' }).click().catch(() => undefined);
      await page.waitForTimeout(500);
    }
    const allSkipped = (await page.locator('#placing').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!/placing 2 oct/i.test(allSkipped) || !allSkipped.includes('2 of 6 placed, 4 dropped')) problems.push(`the checklist goes once the last bid is skipped (${allSkipped.slice(0, 160)})`);
    if ((await page.locator('#placing').getByRole('button', { name: 'Place it after all' }).count()) !== 2) problems.push('Place it after all isn’t on both skipped rows once nothing waits');
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'plan shared', page: 'positions', problems: unique });
    process.stdout.write(unique.length ? `  FAIL plan shared #positions\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   plan shared #positions (a position the plan took over, counted from its start; the list step), #planner (a bid bought at once, the list part, a bid the market has moved from, Skip it and its undo), #todo (that bid, skipped there) and the position page\n');
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
  // Since the tracking (stage 2): the main has two agents running and a research mission offered, one alt has one running
  // (in Mechanical Engineering, whose book is refused) and the others say why theirs isn't read, so the cards come first,
  // the totals count 1 of the 4 alts, and the walkthrough is folded until opened.
  // Since cash-in (Task 6 of the plan): the reminder is on at 300,000 ISK, so Shitsu Ashoma's six datacores are a To do item
  // under Needs action (Okila Tsurvalen's one, under the amount, and Itirikko Innishi's, its book refused, aren't), the
  // Wallet's research card shows the main's agents with every character's inside data-alts, and the journal's one
  // datacore fee reads as "Datacores from agents".
  // Seeded in a ledger of its own: never the shared large one, which check-income records. Both widths.
  if (SHOWN.includes('hustles/research') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('research'))) {
    const now = Date.now(), iso = (t) => new Date(t).toISOString();
    const BID = { 20418: 92700, 20416: 92610, 20411: 92360, 20413: 91950, 20420: 88170, 20414: 88070, 25887: 88010, 20412: 88010, 20417: 88000,
      20171: 87050, 20415: 87000, 20423: 86100, 20419: 85630, 20421: 81590, 20410: 80010, 20172: 52370, 20424: 25060 };
    // Electronic Engineering's bids hold only 4 (Shitsu Ashoma's six: 4 into the bids, the other 2 valued listed); Graviton
    // Physics' best bid is under the 10,000 ISK fee, with a listing at 85,000 (Okila Tsurvalen's one: listing is the way
    // out). The histories stay at the bids above, so the walkthrough's year and a listing's reach read as before.
    const BOOK = { 20418: { volume: 4 }, 20419: { bid: 9_000, ask: 85_000 } };
    const ledger = {
      prefs: { researchCashIn: { on: true, isk: 300_000 } },
      // A bounty, then six datacores bought from an agent (the fee, 10,000 ISK each), so the Wallet draws in full.
      journal: {
        1: { id: '1', date: iso(now - 2 * 86400_000), refType: 'bounty_prizes', amount: 20_000_000, balance: 70_000_000, firstPartyId: 1000125, secondPartyId: 95210486, description: 'Bounty' },
        2: { id: '2', date: iso(now - 86400_000), refType: 'datacore_fee', amount: -60_000, balance: 69_940_000, firstPartyId: 95210486, secondPartyId: 3016563, description: 'Datacores' },
      },
      // Graviton Physics III for Okila Tsurvalen's card: its rate should be 35, where ESI still says 33.75.
      skills: { 3402: 5, 3426: 5, 3413: 5, 3392: 5, 11453: 4, 11446: 3, 3356: 4, 3359: 4, 3355: 4 },
      meta: {
        lastSync: iso(now - 600_000), cloneDetected: 'omega', walletBalance: 69_940_000,
        attributes: { intelligence: 24, memory: 24, perception: 20, willpower: 20, charisma: 23 },
        // And a little standing with Shitsu Ashoma itself (0.50 raw, 2.02 at Connections IV), so step 1's Connections line
        // says what its next level adds there: (10 − 0.5) × 4% of the standing term, × (4 + 2)², +0.14 RP a day.
        standings: { at: iso(now - 600_000), list: [{ id: 500001, type: 'faction', standing: 3.63 }, { id: 1000035, type: 'npc_corp', standing: 7.04 }, { id: 3016563, type: 'agent', standing: 0.5 }] },
        // The pick's agent running (Shitsu Ashoma, Lai Dai level 2, in Electronic Engineering): step 4 ticks itself off. 12.5
        // days at 50.4 is 630 RP, six whole datacores, far from a boundary. And Okila Tsurvalen in Graviton Physics at the
        // rate it was given at Negotiation III (33.75), where the formula now says 35: "open the agent to update it".
        research: { at: iso(now - 900_000), agents: [
          { agentId: 3011520, skillTypeId: 11446, startedAt: iso(now - 4 * 86400_000), pointsPerDay: 33.75, remainderPoints: 20 },
          { agentId: 3016563, skillTypeId: 11453, startedAt: iso(now - 12.5 * 86400_000), pointsPerDay: 50.4, remainderPoints: 0 },
        ] },
        researchMissionAt: iso(now - 3 * 3600_000),
      },
    };
    // An alt the cloud has read (skills, queue) but not yet its standings or research: the first hourly read after the Worker
    // deploys, its login holding both permissions.
    const ALT = 900077, ok = (job, ago) => ({ job, lastRun: now - ago, lastOk: now - ago, lastError: null });
    const SCOPES_BEFORE = ['esi-characters.read_standings.v1', 'esi-skills.read_skills.v1'];
    const altEntry = { charId: ALT, name: 'Research Alt', addedAt: now - 5 * 86400_000, scopes: [...SCOPES_BEFORE, 'esi-characters.read_agents_research.v1'],
      at: now - 3600_000, refusedAt: null, refused: null, rev: 2, ship: null, shipAt: null, jobs: [ok('archive', 1800_000), ok('sheet', 1700_000)] };
    const altSaved = { rev: 2, addedAt: altEntry.addedAt, records: {}, docs: { skills: { 3402: 4, 3392: 3 }, meta: { cloneDetected: 'omega', attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 } } } };
    // An alt the cloud has read running Itirikko Innishi (Lai Dai, level 1) in Mechanical Engineering, whose book is refused:
    // its card's worth and the totals' say so, never 0 ISK and never a part-sum. 30 days at 4.8 is 144 RP, one datacore.
    const AGENT = 900080;
    const agentEntry = { ...altEntry, charId: AGENT, name: 'Agent Alt' };
    const agentSaved = { rev: 3, addedAt: altEntry.addedAt, records: {}, docs: { skills: { 3402: 5, 3392: 5, 11452: 1 }, meta: { cloneDetected: 'omega', attributes: altSaved.docs.meta.attributes,
      standings: { list: [{ id: 500001, type: 'faction', standing: 0.5 }] },
      research: { agents: [{ agentId: 3011552, skillTypeId: 11452, startedAt: iso(now - 30 * 86400_000), pointsPerDay: 4.8, remainderPoints: 0 }] } } } };
    // And an Alpha alt (its sheet read it as Alpha) whose login was handed over before the app asked for the research
    // permission, and one whose login EVE refused with nothing read.
    const ALPHA = 900078, LOST = 900079;
    const alphaEntry = { ...altEntry, charId: ALPHA, name: 'Alpha Alt', scopes: SCOPES_BEFORE };
    const alphaSaved = { ...altSaved, docs: { skills: { 3402: 4 }, meta: { cloneDetected: 'alpha', attributes: altSaved.docs.meta.attributes, standings: { list: [] } } } };
    const lostEntry = { ...altEntry, charId: LOST, name: 'Lost Alt', refusedAt: now - 7200_000, refused: 'invalid_grant', rev: 0, jobs: [] };
    // And one whose login EVE refused after the cloud had read its standings and research (no agent running): what was read
    // still shows, as of that read, saying nothing more is read until the login is handed over (never "it reads it hourly").
    const STALE = 900081;
    const staleEntry = { ...altEntry, charId: STALE, name: 'Stale Alt', refusedAt: now - 7200_000, refused: 'invalid_grant', rev: 4, jobs: [ok('archive', 9000_000), ok('sheet', 8000_000)] };
    const staleSaved = { rev: 4, addedAt: altEntry.addedAt, records: {}, docs: { skills: { 3402: 4, 3392: 3 }, meta: { cloneDetected: 'omega', attributes: altSaved.docs.meta.attributes,
      standings: { list: [{ id: 500001, type: 'faction', standing: 1.2 }] }, research: { agents: [] } } } };
    const altStore = { roster: { at: now - 60_000, list: [altEntry, agentEntry, alphaEntry, lostEntry, staleEntry] }, [`alt:${ALT}`]: altSaved, [`alt:${AGENT}`]: agentSaved, [`alt:${STALE}`]: staleSaved,
      [`alt:${ALPHA}`]: alphaSaved, [`alt:${LOST}`]: { rev: 0, records: {}, docs: {} } };
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
        const bid = BID[type], o = BOOK[type] ?? {};
        // A datacore's bids, deepest first, and a listing; a skillbook (anything else asked) one listing at 1.5 M.
        return json(bid ? [
          { order_id: type * 10 + 1, type_id: type, location_id: 60003760, is_buy_order: true, price: o.bid ?? bid, volume_remain: o.volume ?? 4000, volume_total: 5000, issued: iso(now - 86400_000), duration: 90, min_volume: 1, range: 'station' },
          { order_id: type * 10 + 2, type_id: type, location_id: 60003760, is_buy_order: false, price: o.ask ?? Math.round(bid * 1.05), volume_remain: 900, volume_total: 1000, issued: iso(now - 86400_000), duration: 90, min_volume: 1, range: 'region' },
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
        // The agents' systems by name (To do says where to cash in), every other ID as a station.
        const SYSTEMS = { 30000168: 'Friggi', 30000171: 'Otitoh', 30002788: 'Inaro' };
        const ids = JSON.parse(req.postData() ?? '[]');
        return json(ids.map((id) => (SYSTEMS[id] ? { id, name: SYSTEMS[id], category: 'solar_system' } : { id, name: `Agent Station ${id}`, category: 'station' })));
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
    // The Wallet first: its research card shows totals only, so it never loads the agents bundle (83 KB).
    const bundleAsked = [];
    page.on('request', (r) => { if (/researchAgents/.test(r.url())) bundleAsked.push(r.url()); });
    await page.goto(`${BASE}#wallet`);
    await page.waitForFunction(() => {
      const c = document.querySelector('section[aria-label="R&D agents"]');
      return !!c?.querySelector('[data-research="wallet-main"]') && !/Pricing…/.test(c.textContent ?? '');
    }, null, { timeout: 30_000 }).catch(() => problems.push('the Wallet’s research card never settled, opened first'));
    await page.waitForTimeout(500);
    if (bundleAsked.length) problems.push(`the Wallet loaded the agents bundle it never uses: ${bundleAsked[0]}`);
    await page.goto(`${BASE}#hustles/research`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    if (!bundleAsked.length) await page.waitForTimeout(1000);
    if (!bundleAsked.length) problems.push('the Research tab never asked for the agents bundle (the Wallet check above would mean nothing)');
    const text = async () => (await page.locator('.page').innerText().catch(() => '')).replace(/\s+/g, ' ');
    // The tracking first: agents run, so their cards lead, priced once the books are in, and the walkthrough is folded.
    await page.waitForFunction(() => document.querySelectorAll('.rd-card').length === 3 && !/Pricing…/.test(document.querySelector('.page')?.textContent ?? ''), null, { timeout: 30_000 })
      .catch(() => problems.push('the cards never settled: three agents running, every datacore priced'));
    await page.waitForTimeout(500);
    const track = (await page.locator('section[aria-label="Your agents"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    for (const t of ['Shitsu Ashoma, level 2 Lai Dai Corporation', 'Okila Tsurvalen, level 2 Lai Dai Corporation', 'Itirikko Innishi, level 1 Lai Dai Corporation',
      // The stale rate: ESI's 33.75 where the formula says 35.
      'The formula says 35.0: open the agent to update it',
      // A mission offered, three hours ago: the time only, on the tab, never on a card.
      'A research mission was offered 3 h ago.',
      // Every alt's state in its own words (Review Focus 1–2): not read yet, the permission missing, the login refused.
      'Not read yet: Research Alt’s research comes with the cloud’s next hourly read.',
      'Hand the cloud Alpha Alt’s login again: it was handed over without the permission to read R&D agents.',
      'Not read: EVE refused Lost Alt’s login; hand it over again on the Characters page.',
      // The totals count only the characters read, and say so; Mechanical Engineering's book refused: no part-sum.
      '3 agents: yours, 2 of 5 alts read.',
      // Worth now: Itirikko's book couldn't be read (Try again); the month also misses Okila's, read with no bid over the fee.
      '1 agent’s book couldn’t be read just now, so nothing is summed.',
      '1 agent’s book couldn’t be read just now; 1 agent has no bid over the fee in Jita now, so nothing is summed.',
      // Like with like (the review of 3 October 2026): the bids take 4 of Shitsu's 6, the other 2 valued listed; Okila's
      // one has no bid over the fee, so listing is the way out.
      'The bids take 4 of 6 now (', 'the other 2 valued listed, about',
      'Listed, if you wait for a buyer: no bid in Jita pays more than the 10,000 ISK fee after tax, so listing is the way out.',
      '100 RP each, assumed: CCP 2012; CCP’s support page says 50–150 by field'])
      if (!track.includes(t)) problems.push(`not drawn in the tracking: “${t}”`);
    // Titles and tile labels are drawn in capitals (innerText follows the CSS).
    for (const t of ['Datacores you can buy', 'When to cash in', 'Daily missions']) if (!track.toLowerCase().includes(t.toLowerCase())) problems.push(`not drawn in the tracking: “${t}”`);
    if (/mission[^.]*waiting/i.test(track)) problems.push('the tracking says a mission is waiting: EVE only said one was offered');
    for (const id of [ALT, ALPHA, LOST]) if (/No agents running/.test(await page.locator(`[data-research="${id}"]`).innerText().catch(() => ''))) problems.push(`the tracking says “No agents running” for ${id}, whose research wasn’t read`);
    // The alt whose login was refused after a read: its research as of that read, and why nothing more comes.
    const stale = (await page.locator('[data-research="900081"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!stale.includes('As the cloud last read it') || !stale.includes('EVE refused Stale Alt’s login; hand it over again on the Characters page.') || /hourly/.test(stale))
      problems.push(`the alt refused after a read doesn’t say its research is as of that read and why nothing more comes: “${stale}”`);
    if (/Listed: –|NaN/.test(track)) problems.push('the tracking says “Listed: –” without a reason, or NaN');
    const tilesOf = async (agent) => page.locator('.rd-card', { hasText: agent }).first().locator('.tile').evaluateAll((ts) => Object.fromEntries(ts.map((t) => [t.querySelector('.tile-l')?.firstChild?.textContent?.trim(), t.querySelector('.tile-v')?.textContent?.trim()]))).catch(() => ({}));
    const shitsu = await tilesOf('Shitsu Ashoma'), itirikko = await tilesOf('Itirikko Innishi'), okila = await tilesOf('Okila Tsurvalen');
    if (shitsu['RP a day'] !== '50.4' || shitsu['Datacores you can buy'] !== '6' || !/ISK$/.test(shitsu['Worth now'] ?? '')) problems.push(`Shitsu Ashoma’s card isn’t 50.4 RP a day, six datacores and a worth in ISK: ${JSON.stringify(shitsu)}`);
    if (okila['RP a day'] !== '33.8' || okila['Datacores you can buy'] !== '1' || !/ISK$/.test(okila['Worth now'] ?? '')) problems.push(`Okila Tsurvalen’s card isn’t ESI’s 33.75 a day and one datacore worth a listing in ISK: ${JSON.stringify(okila)}`);
    if (itirikko['Datacores you can buy'] !== '1' || itirikko['Worth now'] !== '–') problems.push(`Itirikko Innishi’s card, its book refused, isn’t one datacore worth “–”: ${JSON.stringify(itirikko)}`);
    if (!(await page.locator('.rd-card', { hasText: 'Itirikko Innishi' }).innerText().catch(() => '')).includes('Jita’s book couldn’t be read just now')) problems.push('Itirikko Innishi’s card doesn’t say why its worth is “–”');
    const totalsTiles = await page.locator('[data-research="totals"] .tile').evaluateAll((ts) => Object.fromEntries(ts.map((t) => [t.querySelector('.tile-l')?.firstChild?.textContent?.trim(), t.querySelector('.tile-v')?.textContent?.trim()]))).catch(() => ({}));
    if (totalsTiles['Datacores waiting'] !== '8' || totalsTiles['Worth now'] !== '–' || totalsTiles['A month'] !== '–') problems.push(`the totals aren’t 8 datacores with worth and month unsummed: ${JSON.stringify(totalsTiles)}`);
    if (await page.locator('.step-card').count()) problems.push('the walkthrough isn’t folded below the cards while agents run');
    // The cash-in reminder, as set: on at 300,000 ISK.
    const remind = page.locator('.rd-cashin [role="checkbox"]');
    if ((await remind.getAttribute('aria-checked').catch(() => null)) !== 'true' || (await page.locator('#rd-cashin').inputValue().catch(() => '')) !== '300,000') problems.push('the cash-in reminder isn’t drawn on at 300,000 ISK');
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}-research-cards.png` });
      await remind.scrollIntoViewIfNeeded().catch(() => undefined); await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}-research-cashin.png` });
    }
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out in the tracking: ${o}`);
    // Open the walkthrough. The pick is the nearest of Lai Dai's level 2 agents in Electronic Engineering (scripts/check.mjs
    // works it out from the bundle), priced once the books are in.
    await page.locator('.rd-walk-head .panel-toggle').click().catch((e) => problems.push(`couldn't open the walkthrough: ${e.message.split('\n')[0]}`));
    await page.waitForFunction(() => /Steps 1 to 3 follow one pick: Shitsu Ashoma/.test(document.querySelector('.page')?.textContent ?? '') && !/Pricing…/.test(document.querySelector('.page')?.textContent ?? ''), null, { timeout: 30_000 })
      .catch(() => problems.push('the main’s walkthrough never settled on Shitsu Ashoma with every datacore priced'));
    await page.waitForTimeout(500);
    const mainText = await text();
    // RP a day for a level 2 agent at Electronic Engineering IV, Negotiation IV, standing 2.02 with the agent: (1 + 42.02/100) × (4 + 2)²
    // (ESI's 50.4 on the card is within 2 RP and 2% of it, so the card says nothing); Connections V adds 0.14 more.
    for (const t of ['Steps 1 to 3 follow one pick: Shitsu Ashoma, level 2 Lai Dai Corporation, in Electronic Engineering', '51.1 RP a day', '+0.14 RP a day at Shitsu Ashoma',
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
    // Step 4 ticks itself off once the read shows the pick's agent running, saying what the read shows.
    const step4 = page.locator('.step-card[aria-label^="Step 4"]');
    if ((await step4.locator('.hexn').innerText().catch(() => '')) !== '✓') problems.push('step 4 isn’t ticked though the main’s research read shows Shitsu Ashoma running');
    if (!(await step4.innerText().catch(() => '')).replace(/\s+/g, ' ').includes('The app’s read of your research at')
      || !mainText.includes('shows Shitsu Ashoma researching Electronic Engineering since')) problems.push('step 4 doesn’t say the read shows Shitsu Ashoma researching Electronic Engineering');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-research-main.png` });
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out for the main: ${o}`);
    // Shown for the alt: its standings aren't read yet, so nothing may say "no standing" for it.
    await page.locator('[role="group"][aria-label="Show for"] button', { hasText: 'Research Alt' }).click().catch((e) => problems.push(`couldn't show the alt: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(1500);
    const altText = await text();
    for (const t of ['Not read yet: Research Alt’s standings come with the cloud’s next hourly read.', 'Start with a level 1 agent:', 'standings not read yet: level 1 agents only',
      // Its research isn't read yet either: step 4 says it ticks once the cloud's next hourly read shows it.
      'once the cloud’s read of Research Alt’s research shows',
      // Its level 1 agents open only if its standing allows: never "Open now", never "the best open to" it.
      'Open if Research Alt’s standing with', 'the best level 1 agent']) if (!altText.includes(t)) problems.push(`not drawn for the alt: “${t}”`);
    const altSteps = (await page.locator('.step-card[aria-label^="Step 2"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (/no standing/.test(altText)) problems.push('the alt’s walkthrough says “no standing” for standings not read yet');
    for (const t of ['Open now', 'the best open to Research Alt']) if (altText.includes(t)) problems.push(`the alt whose standings aren’t read says “${t}”`);
    if (!altSteps.includes('Not read yet')) problems.push('the alt’s standings cells don’t say “Not read yet”');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-research-alt.png` });
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out for the alt: ${o}`);
    // The Alpha alt: Needs Omega, said, with no training time; the refused one: hand its login over again.
    // The Alpha alt's login was handed over before the app asked for the research permission: step 4 says to hand it over.
    for (const [who, want] of [['Alpha Alt', ['Needs Omega', 'Alpha Alt is Alpha', 'Hand the cloud Alpha Alt’s login again: it was handed over without the permission to read R&D agents.']],
      ['Lost Alt', ['Not read: EVE refused Lost Alt’s login; hand it over again on the Characters page.']],
      // Refused after a read: its standings as of that read, and step 4 says nothing more is read until it's handed over.
      ['Stale Alt', ['Stale Alt’s standings as the cloud last read them', 'EVE refused Stale Alt’s login; hand it over again on the Characters page.', 'nothing more is read until the login is handed over']]]) {
      await page.locator('[role="group"][aria-label="Show for"] button', { hasText: who }).click().catch((e) => problems.push(`couldn't show ${who}: ${e.message.split('\n')[0]}`));
      await page.waitForTimeout(1200);
      const t = await text();
      for (const x of want) if (!t.includes(x)) problems.push(`not drawn for ${who}: “${x}”`);
      if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out for ${who}: ${o}`);
    }
    if (await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count()) problems.push('error boundary on the Research tab');

    // To do: Shitsu Ashoma's six datacores, worth more than the 300,000 ISK amount, to cash in; nothing for Okila Tsurvalen's
    // one (under it) or Itirikko Innishi's (its book refused). The stand-in login can't set a destination: Open Research.
    await page.goto(`${BASE}#todo`);
    await page.waitForFunction(() => /Cash in at Shitsu Ashoma, Friggi/.test(document.querySelector('.page')?.textContent ?? ''), null, { timeout: 30_000 })
      .catch(() => problems.push('To do never listed Shitsu Ashoma’s datacores to cash in, with its system'));
    await page.waitForTimeout(500);
    const cash = page.locator('.tn-item', { hasText: 'Cash in at Shitsu Ashoma' });
    const cashText = (await cash.innerText().catch(() => '')).replace(/\s+/g, ' ');
    for (const t of ['Cash in at Shitsu Ashoma, Friggi: 6 datacores, worth', 'Your Electronic Engineering research, worth more than your 300,000 ISK at Jita’s prices now.',
      'Buy them from the agent in person, docked in its station']) if (!cashText.includes(t)) problems.push(`not drawn in To do’s cash-in item: “${t}”`);
    // The same worth as the tab's card (researchWorth.ts prices both).
    if (!shitsu['Worth now'] || !cashText.includes(`worth ${shitsu['Worth now']}`)) problems.push(`To do’s worth for Shitsu Ashoma isn’t the card’s ${shitsu['Worth now']}`);
    // The kind and the button are drawn in capitals (innerText follows the CSS).
    for (const t of ['cash in datacores', 'open research']) if (!cashText.toLowerCase().includes(t)) problems.push(`not drawn in To do’s cash-in item: “${t}”`);
    if ((await page.locator('.tn-item', { hasText: 'Cash in at' }).count()) !== 1) problems.push('To do lists a cash-in item other than Shitsu Ashoma’s (Okila Tsurvalen’s is under the amount, Itirikko Innishi’s unpriced)');
    await page.locator('[role="group"][aria-label="Show"] button', { hasText: 'Needs action' }).click().catch((e) => problems.push(`couldn't show Needs action: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(300);
    if (!(await page.locator('.tn-item', { hasText: 'Cash in at Shitsu Ashoma' }).count())) problems.push('the cash-in item isn’t under Needs action');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-research-todo.png` });
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out in To do: ${o}`);
    if (await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count()) problems.push('error boundary on To do');

    // The Wallet's research card: the main's agents outside data-alts, every character's inside it, never in net worth;
    // and the journal's datacore fee under its own line.
    await page.goto(`${BASE}#wallet`);
    await page.waitForFunction(() => {
      const c = document.querySelector('section[aria-label="R&D agents"]');
      return !!c?.querySelector('[data-research="wallet-main"]') && !/Pricing…/.test(c.textContent ?? '');
    }, null, { timeout: 30_000 }).catch(() => problems.push('the Wallet’s research card never settled'));
    await page.waitForTimeout(500);
    const rdCard = page.locator('section[aria-label="R&D agents"]');
    const rdText = (await rdCard.innerText().catch(() => '')).replace(/\s+/g, ' ');
    const tilesIn = (sel) => page.locator(`${sel} .tile`).evaluateAll((ts) => Object.fromEntries(ts.map((t) => [t.querySelector('.tile-l')?.firstChild?.textContent?.trim(), t.querySelector('.tile-v')?.textContent?.trim()]))).catch(() => ({}));
    const yours = await tilesIn('[data-research="wallet-main"]'), every = await tilesIn('[data-research="wallet-all"]');
    if (yours['RP a day'] !== (50.4 + 33.75).toFixed(1) || yours['Datacores waiting'] !== '7' || !/ISK$/.test(yours['Worth now'] ?? '') || yours['A month'] !== '–')
      problems.push(`the Wallet’s card isn’t the main’s two agents (84.2 RP a day, 7 datacores, a worth in ISK, no month: Okila’s field has no bid over the fee): ${JSON.stringify(yours)}`);
    if (every['Datacores waiting'] !== '8' || every['Worth now'] !== '–') problems.push(`the Wallet’s card across characters isn’t 8 datacores with the worth unsummed: ${JSON.stringify(every)}`);
    for (const t of ['2 agents running.', '3 agents: yours, 2 of 5 alts read.', 'Waiting datacores aren’t in net worth', '1 agent has no bid over the fee in Jita now, so nothing is summed.'])
      if (!rdText.includes(t)) problems.push(`not drawn on the Wallet’s research card: “${t}”`);
    if (await page.locator('[data-alts] [data-research="wallet-main"]').count()) problems.push('the main’s research figures sit inside data-alts');
    if (!(await page.locator('[data-alts] [data-research="wallet-all"]').count())) problems.push('the research figures across characters aren’t inside data-alts');
    const flowsText = (await page.locator('section.panel', { hasText: 'Money out' }).first().innerText().catch(() => '')).toLowerCase();
    if (!flowsText.includes('datacores from agents')) problems.push('the datacore fee isn’t under “Datacores from agents” in money out');
    if (SHOTS) { await rdCard.scrollIntoViewIfNeeded().catch(() => undefined); await page.waitForTimeout(800); await page.screenshot({ path: `${SHOTS}-research-wallet.png` }); }
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out on the Wallet: ${o}`);
    // Switched off on the tab, the amount kept: the item leaves To do unticked, neither open nor done.
    await page.goto(`${BASE}#hustles/research`);
    await page.locator('.rd-cashin [role="checkbox"]').click().catch((e) => problems.push(`couldn't switch the cash-in reminder off: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(500);
    if ((await page.locator('.rd-cashin [role="checkbox"]').getAttribute('aria-checked').catch(() => null)) !== 'false' || (await page.locator('#rd-cashin').inputValue().catch(() => '')) !== '300,000')
      problems.push('switching the cash-in reminder off didn’t keep its amount');
    await page.goto(`${BASE}#todo`);
    await page.waitForTimeout(1500);
    if (await page.locator('.tn-item', { hasText: 'Cash in at' }).count()) problems.push('switched off, the cash-in item stays on To do (open or done)');
    const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    if (!esiAsked) problems.push('ESI was never asked: the books weren’t read');
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'research', page: 'hustles/research', problems: unique });
    process.stdout.write(unique.length ? `  FAIL research #hustles/research\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   research #hustles/research (three agents’ cards and the totals, 2 of 5 alts read; the main’s walkthrough priced, Lai Dai at no standing; an alt whose standings aren’t read; To do’s cash-in item and the Wallet’s card)\n');
    await page.close();
  }
  // Positions' "Check my hangar" (3 October 2026): the user's loot in a container named "Lewds", some of it an item their
  // plan bids on. ESI answers the assets read (12 of the plan's datacore loose in the hangar, which its position bought;
  // Lewds holding 10 more, a blueprint copy, Tritanium no position or order covers, and drones on a sell order; a ship,
  // Battle Chicken, with a Damage Control II fitted, of an item a position holds 2 of loose, and drones in its bay; 4 of the
  // datacore in Amarr), the names you gave the container and the ship, and Amarr's name. Picked: Lewds, then the whole
  // station, then Amarr, each judged; then closed and opened again on the pick kept. A ledger of its own, both widths.
  if (SHOWN.includes('positions') && (!only(process.env.LEDGER) || only(process.env.LEDGER).includes('hangar'))) {
    const now = Date.now(), iso = (t) => new Date(t).toISOString();
    const JITA_ = 60003760, AMARR_ = 60008494, CID = ownerAuth().characterId;
    const RS = 20420, DC = 2048, HH = 2185, TRIT = 34, CAN = 17366, SHIP = 24698, BP = 24699, LEWDS = 1_050_000_000_001, CHICKEN = 1_050_000_000_002;
    const planAt = iso(now - 2 * 86400_000);
    const pos = (id, typeId, openedAt) => ({ id, typeId, openedAt, status: 'open', jitaOnly: true, excluded: [], included: [] });
    const ledger = {
      names: { [RS]: 'Datacore - Rocket Science', [DC]: 'Damage Control II', [HH]: 'Hammerhead II', [TRIT]: 'Tritanium', [CAN]: 'Station Container', [SHIP]: 'Drake', [BP]: 'Drake Blueprint' },
      // The plan opened the datacore's position and bought 12 of its 20; a position on Damage Control II bought 2; one on
      // Drake Blueprint holds none (a copy of it shares its type: never stock).
      positions: [pos('hc-rs', RS, planAt), pos('hc-dc', DC, iso(now - 5 * 86400_000)), pos('hc-bp', BP, iso(now - 3 * 86400_000))],
      plans: [{ id: 'hc-plan', name: 'Datacore plan', at: planAt, isk: 1_700_000, horizonDays: 7, patient: true, items: [{ typeId: RS, buyAt: 85_000, units: 20, sellAt: 95_000, positionId: 'hc-rs' }] }],
      txs: {
        hc1: { id: 'hc1', source: 'esi', typeId: RS, date: iso(now - 86400_000), isBuy: true, qty: 12, unitPrice: 85_000, locationId: JITA_ },
        hc2: { id: 'hc2', source: 'esi', typeId: DC, date: iso(now - 4 * 86400_000), isBuy: true, qty: 2, unitPrice: 600_000, locationId: JITA_ },
      },
      orders: {
        // The plan's bid has filled 14, 2 more than the trades show (filled since your trades were read).
        1: { orderId: 1, typeId: RS, isBuy: true, price: 85_000, volumeTotal: 20, volumeRemain: 6, issued: iso(now - 1.5 * 86400_000), state: 'open', locationId: JITA_ },
        2: { orderId: 2, typeId: HH, isBuy: false, price: 900_000, volumeTotal: 6, volumeRemain: 5, issued: iso(now - 86400_000), state: 'open', locationId: JITA_ },
        // One of the Damage Control IIs listed 3 minutes ago, after ESI's copy of the hangar (10 minutes old) that still holds it.
        3: { orderId: 3, typeId: DC, isBuy: false, price: 650_000, volumeTotal: 1, volumeRemain: 1, issued: iso(now - 180_000), state: 'open', locationId: JITA_, seen: [{ issued: iso(now - 180_000), price: 650_000, remain: 1 }] },
      },
      // The last sync read your trades 6 minutes ago and your orders 2 minutes ago (ESI holds them an hour and 20 minutes),
      // both after the hangar's first copy: only the listing placed since it may be off.
      meta: { lastSync: iso(now - 60_000), expiries: { transactions: iso(now + 54 * 60_000), orders: iso(now + 18 * 60_000) } },
    };
    const A = (item_id, type_id, location_id, location_flag, location_type, quantity = 1, extra = {}) => ({ item_id, type_id, location_id, location_flag, location_type, quantity, ...extra });
    const assets = [
      A(9001, RS, JITA_, 'Hangar', 'station', 12), A(9002, DC, JITA_, 'Hangar', 'station', 2),
      A(LEWDS, CAN, JITA_, 'Hangar', 'station', 1, { is_singleton: true }),
      A(9011, RS, LEWDS, 'Unlocked', 'item', 10), A(9012, TRIT, LEWDS, 'Unlocked', 'item', 100), A(9013, HH, LEWDS, 'Unlocked', 'item', 3),
      A(9014, BP, LEWDS, 'Unlocked', 'item', 1, { is_blueprint_copy: true }),
      A(CHICKEN, SHIP, JITA_, 'Hangar', 'station', 1, { is_singleton: true }),
      A(9021, DC, CHICKEN, 'LoSlot0', 'item', 1), A(9022, HH, CHICKEN, 'DroneBay', 'item', 2),
      A(9031, RS, AMARR_, 'Hangar', 'station', 4),
    ];
    const page = await browser.newPage(VIEW);
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-expose-headers': '*' };
    let assetsAsked = 0, namesAsked = 0;
    // Later reads: ESI's copy of the hangar taken 10 seconds ago (after your trades and orders were read), the names refused,
    // or the assets read failing.
    const esiNow = { assetsAge: 600, names: true, assetsFail: false };
    await page.route('**/*', (route) => {
      const req = route.request(), url = new URL(req.url());
      if (req.url().startsWith(`http://localhost:${PORT}/`)) return route.continue();
      if (url.hostname !== 'esi.evetech.net') return route.abort();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      // ESI holds assets an hour: this copy lets go in 50 minutes, so it was taken 10 minutes ago.
      const json = (body, maxAge = 3000) => route.fulfill({ status: 200, contentType: 'application/json', headers: { ...cors, 'cache-control': `max-age=${maxAge}`, 'x-pages': '1' }, body: JSON.stringify(body) });
      if (url.pathname === `/characters/${CID}/assets/`) {
        assetsAsked++;
        if (esiNow.assetsFail) return route.fulfill({ status: 500, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: 'Internal error' }) });
        return json(assets, 3600 - esiNow.assetsAge);
      }
      if (url.pathname === `/characters/${CID}/assets/names/` && req.method() === 'POST') {
        namesAsked++;
        if (!esiNow.names) return route.fulfill({ status: 403, contentType: 'application/json', headers: cors, body: JSON.stringify({ error: 'Forbidden' }) });
        const given = { [LEWDS]: 'Lewds', [CHICKEN]: 'Battle Chicken' };
        return json(JSON.parse(req.postData() ?? '[]').map((id) => ({ item_id: id, name: given[id] ?? 'None' })));
      }
      if (url.pathname === '/universe/names/' && req.method() === 'POST') {
        const ids = JSON.parse(req.postData() ?? '[]');
        return json(ids.filter((id) => id === AMARR_).map((id) => ({ id, name: 'Amarr VIII (Oris) - Emperor Family Academy', category: 'station' })));
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
    }, [ledger, { ...ownerAuth(), scopes: ['esi-assets.read_assets.v1'] }]);
    await page.goto(`${BASE}#positions`);
    await page.waitForSelector('.page', { timeout: 20_000 });
    await page.waitForTimeout(1200);
    const dialog = page.locator('dialog.confirm[open]');
    const open = async () => {
      await page.locator('.head-actions button', { hasText: 'Check my hangar' }).click().catch((e) => problems.push(`couldn't click Check my hangar: ${e.message.split('\n')[0]}`));
      await page.waitForSelector('#hc-where', { timeout: 15_000 }).catch(() => problems.push('the hangar was never read: no place to pick'));
    };
    const pickSpot = async (v) => { await page.selectOption('#hc-where', v).catch((e) => problems.push(`couldn't pick ${v}: ${e.message.split('\n')[0]}`)); await page.waitForTimeout(400); };
    const row = (type) => dialog.locator(`[data-hc="tracked"] tr[data-type="${type}"]`);
    await open();
    const said = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!said.includes('ESI’s copy of your assets was taken')) problems.push('doesn’t say when ESI’s copy of the assets was taken');
    if ((await page.inputValue('#hc-where').catch(() => '')) !== `${JITA_}/hangar`) problems.push('the first pick isn’t Jita 4-4’s hangar');
    const options = await page.locator('#hc-where option').evaluateAll((os) => os.map((o) => `${o.parentElement?.getAttribute('label')}|${o.value}|${o.textContent}`)).catch(() => []);
    for (const [v, label] of [[`${JITA_}/hangar`, 'Jita 4-4|Jita 4-4 hangar · 14 units'], [`${JITA_}/item:${LEWDS}`, 'Jita 4-4|Lewds · 113 units'], [`${JITA_}/item:${CHICKEN}`, 'Jita 4-4|Battle Chicken · 2 units'],
      [`${AMARR_}/hangar`, 'Amarr VIII (Oris) - Emperor Family Academy|Amarr VIII (Oris) - Emperor Family Academy hangar · 4 units']])
      if (!options.some((o) => { const [g, val, t] = o.split('|'); return val === v && `${g}|${t}`.startsWith(label); })) problems.push(`no “${label}” to pick (${options.join('; ')})`);
    // Lewds: the plan's datacore, 10 of them not the position's (of 22 in Jita 4-4: the hangar's 12, Lewds' 10, not the copy).
    await pickSpot(`${JITA_}/item:${LEWDS}`);
    if (!(await row(RS).count())) problems.push('Lewds: no row for the plan’s Datacore - Rocket Science');
    else {
      if ((await row(RS).getAttribute('data-not')) !== '10') problems.push(`Lewds: “Not the position’s” is ${await row(RS).getAttribute('data-not')}, not 10`);
      const t = (await row(RS).innerText()).replace(/\s+/g, ' ');
      // Lowercased: the plan's flag and the link are drawn in capitals.
      for (const w of ['of the 22 you hold in Jita 4-4', 'Plan: Datacore plan', 'Open the position']) if (!t.toLowerCase().includes(w.toLowerCase())) problems.push(`Lewds: the datacore’s row doesn’t say “${w}”: “${t.slice(0, 200)}”`);
    }
    if (!(await dialog.locator('.notice', { hasText: '10 of Datacore - Rocket Science aren’t the position’s. Selling those units counts against the position (and the plan): sell them and Exclude each sale on the position’s page' }).count())) problems.push('Lewds: no lead line naming the datacore’s 10 and saying to Exclude each sale');
    if (await dialog.locator('[data-hc="unsure"]').count()) problems.push('Lewds: a count said to be off, with every copy read after the hangar’s');
    if (await dialog.locator('[data-hc="soft"]').count()) problems.push('Lewds: the line about purchases since your trades were read, with your trades read after the hangar’s copy');
    if (await row(BP).count()) problems.push('Lewds: the blueprint copy is counted (a row for Drake Blueprint)');
    if (!(await dialog.locator('[data-hc="orders"] li', { hasText: 'Hammerhead II' }).count())) problems.push('Lewds: the drones on a sell order aren’t in the second list');
    if ((await dialog.innerText().catch(() => '')).includes('Tritanium')) problems.push('Lewds: Tritanium, which no position or order covers, is listed');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out with Lewds picked: ${o}`);
    if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}-hangar-lewds.png` }); }
    // A tooltip inside the dialog shows inside it: a modal is in the browser's top layer, over a tooltip drawn at the root.
    if (!PHONE) {
      await dialog.locator('th', { hasText: 'Not the position’s' }).locator('.tip-i').hover().catch(() => undefined);
      await page.waitForTimeout(300);
      if (!(await dialog.locator('.tooltip', { hasText: 'Units are alike' }).isVisible().catch(() => false))) problems.push('a column’s tooltip doesn’t show inside the dialog');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}-hangar-tip.png` });
      await page.mouse.move(5, 5);
    }
    // The whole station: the fitted Damage Control II isn't held, so its position's 2 loose are its own; the one listed after
    // the hangar's copy is in the copy and on the order, so 1 reads as not the position's, said to be possibly off and kept
    // out of the lead (the review: an Exclude advised on it would take a real sale out of the position).
    await pickSpot(`${JITA_}/all`);
    if ((await row(DC).getAttribute('data-here').catch(() => null)) !== '2' || (await row(DC).getAttribute('data-not').catch(() => null)) !== '1')
      problems.push(`the whole station: Damage Control II reads ${await row(DC).getAttribute('data-here').catch(() => '?')} held, ${await row(DC).getAttribute('data-not').catch(() => '?')} not the position’s, not 2 and 1 (the fitted one counted?)`);
    if ((await row(DC).getAttribute('data-stale').catch(() => null)) !== 'listed') problems.push(`the whole station: Damage Control II listed after the hangar’s copy isn’t said to be off (data-stale “${await row(DC).getAttribute('data-stale').catch(() => '')}”)`);
    if (!(await row(DC).innerText().catch(() => '')).replace(/\s+/g, ' ').includes('May include units listed since ESI’s copy of your hangar')) problems.push('the whole station: Damage Control II’s cell doesn’t say why it may be off');
    if (!(await dialog.locator('[data-hc="unsure"] .notice', { hasText: 'Damage Control II’s count may be off.' }).count())) problems.push('the whole station: no line saying Damage Control II’s count may be off');
    if (!(await dialog.locator('[data-hc="unsure"] .notice', { hasText: 'read again once ESI lets go of its copy of your hangar' }).count())) problems.push('the whole station: the line doesn’t say to read again once ESI lets go of the hangar’s copy');
    if (await dialog.locator('[data-hc="unsure"] button', { hasText: 'Check for new trades' }).count()) problems.push('the whole station: Check for new trades offered for a listing, which only a newer copy of the hangar clears');
    if (!(await dialog.locator('.notice.warn', { hasText: '10 of Datacore - Rocket Science aren’t the position’s.' }).count())) problems.push('the whole station: the lead doesn’t name the datacore alone');
    if ((await dialog.locator('[data-hc="orders"] li[data-type="2185"]').getAttribute('data-here').catch(() => null)) !== '5') problems.push('the whole station: the drones aren’t 5 (Lewds’ 3 and the drone bay’s 2)');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out with the whole station picked: ${o}`);
    if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}-hangar-all.png` }); }
    // Amarr: the Jita-only position doesn't count a sale there, and says so.
    await pickSpot(`${AMARR_}/hangar`);
    if (!(await dialog.locator('.notice', { hasText: 'Sold here they don’t count against a position, which tracks Jita 4-4 only' }).count())) problems.push('Amarr: doesn’t say a sale there doesn’t count for a Jita-only position');
    if (!(await row(RS).count())) problems.push('Amarr: the datacore isn’t listed');
    if (await dialog.locator('.notice', { hasText: 'Exclude each sale' }).count()) problems.push('Amarr: a lead to Exclude sales beside “Sold here they don’t count” (the review)');
    if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}-hangar-amarr.png` }); }
    // Closed and opened again: the hangar read afresh, the pick kept. This time ESI refuses the names, and its copy of the
    // hangar is 10 seconds old, about 6 minutes newer than your trades (past one read pass): the plan's bid has filled 2 more
    // than the trades show, so at least 8 of the 10 aren't the position's and up to 2 more may be its fills, still in the
    // lead; and a line says what no copy can show, with ESI's next copy of your trades not due, so no Check for new trades.
    await pickSpot(`${JITA_}/item:${LEWDS}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    if (await dialog.count()) problems.push('Escape didn’t close the dialog');
    Object.assign(esiNow, { assetsAge: 10, names: false });
    await open();
    if ((await page.inputValue('#hc-where').catch(() => '')) !== `${JITA_}/item:${LEWDS}`) problems.push('opened again, Lewds isn’t picked');
    if (assetsAsked < 2 || namesAsked < 2) problems.push(`the assets and names weren’t read afresh on opening again (${assetsAsked} assets reads, ${namesAsked} names reads)`);
    const again = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!again.includes('The names you gave your containers and ships couldn’t be read just now, so they go by their type.')) problems.push('names refused: the dialog doesn’t say they go by their type');
    const relabelled = await page.locator('#hc-where option').evaluateAll((os) => os.map((o) => `${o.value}|${o.textContent}`)).catch(() => []);
    if (!relabelled.some((o) => o.startsWith(`${JITA_}/item:${LEWDS}|Station Container · 113 units`))) problems.push(`names refused: Lewds doesn’t go by its type (${relabelled.join('; ').slice(0, 200)})`);
    const [least, fills] = [await row(RS).getAttribute('data-least').catch(() => null), await row(RS).getAttribute('data-fills').catch(() => null)];
    if (least !== '8' || fills !== '2') problems.push(`the bid’s 2 fills the trades don’t show: the datacore reads at least ${least}, ${fills} maybe fills, not 8 and 2`);
    if (await row(RS).getAttribute('data-stale').catch(() => null)) problems.push('the datacore is said to be off for its bid’s fills: they’re said apart, the row stays');
    // The table's cell at a desk, the line under the name on a phone ("at least 8, of the 22 …").
    if (!/at least 8,? of the 22 you hold in Jita 4-4/.test((await row(RS).innerText().catch(() => '')).replace(/\s+/g, ' '))) problems.push('the datacore’s cell doesn’t say “at least 8”');
    if (!(await dialog.locator('.notice.warn', { hasText: 'At least 8 of Datacore - Rocket Science aren’t the position’s; up to 2 more may be your bid’s fills since your trades were read' }).count())) problems.push('the lead doesn’t say at least 8, and up to 2 more may be the bid’s fills');
    if (!(await dialog.locator('[data-hc="soft"]', { hasText: 'Bought any from a listing, or did a bid of yours fill, since your trades were read at' }).count())) problems.push('no line about purchases and fills since your trades were read');
    if (!(await dialog.locator('[data-hc="soft"]', { hasText: 'Check for new trades won’t bring them in before then' }).count())) problems.push('the line doesn’t say Check for new trades won’t help before ESI’s next copy');
    if (await dialog.locator('[data-hc="soft"] button').count()) problems.push('Check for new trades offered before ESI’s next copy of your trades is due');
    if (PHONE) for (const o of await overflow(page)) problems.push(`sticks out with a count that may be off: ${o}`);
    if (SHOTS) { await page.waitForTimeout(600); await page.screenshot({ path: `${SHOTS}-hangar-unsure.png` }); }
    // A failed read says so; the last read stays behind it.
    esiNow.assetsFail = true;
    await dialog.locator('.hc-read button', { hasText: 'Read again' }).click().catch((e) => problems.push(`couldn't click Read again: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(800);
    if (!(await dialog.locator('.notice.err', { hasText: 'Couldn’t read your assets: ESI returned 500' }).count())) problems.push('a failed read doesn’t say it couldn’t read your assets');
    const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
    if (boundary) problems.push('error boundary');
    checked++;
    const unique = [...new Set(problems)];
    if (unique.length) failures.push({ ledger: 'hangar', page: 'positions', problems: unique });
    process.stdout.write(unique.length ? `  FAIL hangar #positions\n${unique.map((x) => `       ${x}`).join('\n')}\n` : '  ok   hangar #positions (Check my hangar: Lewds’ loot of the plan’s datacore, 10 not the position’s; the fitted module and the copy left out; the drones on a sell order; a listing after the hangar’s copy said to be off; Amarr; the pick kept, the names refused, at least 8 with a bid’s 2 fills said apart and the line about your trades; a failed read)\n');
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
