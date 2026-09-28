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
// The cloud is somewhere nothing answers, so it fails fast rather than reaching the real one.
process.env.VITE_CLOUD_URL = 'http://127.0.0.1:9';

const PAGES = [
  'wallet', 'todo', 'calculator', 'calculator?type=34', 'prospects', 'watchlist', 'planner', 'arbitrage', 'sniper',
  'positions', 'positions/{first}', 'orders', 'results', 'loyalty',
  'hustles/abyssal', 'hustles/courier', 'hustles/planets', 'hustles/injectors', 'combat', 'omega',
  'settings/account', 'settings/skills', 'settings/rates', 'settings/alerts', 'settings/appearance', 'settings/data', 'settings/scan',
];

// ---- Ledgers ------------------------------------------------------------------------------------------------

/** A seeded random number generator, so the large ledger is the same every run. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const JITA = 60003760, AMARR = 60008494;
const DAY = 86400_000;
const NOW = Date.now();
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Journal entries with balances assigned in date order, as ESI gives them. */
function withBalances(entries, start) {
  entries.sort((a, b) => a.date.localeCompare(b.date));
  let bal = start;
  const out = {};
  for (const e of entries) { bal += e.amount; out[e.id] = { ...e, balance: Math.round(bal * 100) / 100 }; }
  return { journal: out, balance: bal };
}

function small() {
  const T = 2185;
  const txs = {
    t1: { id: 't1', source: 'esi', typeId: T, date: iso(NOW - 3 * DAY), isBuy: true, qty: 10, unitPrice: 700000, locationId: JITA },
    t2: { id: 't2', source: 'esi', typeId: T, date: iso(NOW - 2 * DAY), isBuy: false, qty: 4, unitPrice: 790000, locationId: JITA },
    t3: { id: 't3', source: 'esi', typeId: 34, date: iso(NOW - DAY), isBuy: false, qty: 1000, unitPrice: 4.1, locationId: JITA },
  };
  const { journal, balance } = withBalances([
    { id: '1', date: iso(NOW - 3 * DAY - 60_000), refType: 'brokers_fee', amount: -91000 },
    { id: '2', date: iso(NOW - 2 * DAY), refType: 'market_transaction', amount: 3160000, contextId: 2 },
    { id: '3', date: iso(NOW - 2 * DAY), refType: 'transaction_tax', amount: -106650 },
  ], 250_000_000);
  return {
    names: { [T]: 'Hammerhead II', 34: 'Tritanium' },
    txs, journal,
    orders: { 1: { orderId: 1, typeId: T, isBuy: false, price: 790000, volumeTotal: 6, volumeRemain: 2, issued: iso(NOW - 2 * DAY - 3600_000), state: 'open', locationId: JITA } },
    positions: [{ id: 'p1', typeId: T, openedAt: iso(NOW - 4 * DAY), status: 'open', jitaOnly: true, excluded: [], included: [] }],
    meta: { walletBalance: balance, lastSync: iso(NOW - 3600_000) },
  };
}

function large() {
  const r = rng(20260928);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  // Real types first (minerals, drones, PLEX, datacores), then made-up IDs the pages can't look up.
  const real = { 34: 'Tritanium', 35: 'Pyerite', 36: 'Mexallon', 37: 'Isogen', 2185: 'Hammerhead II', 44992: 'PLEX', 20420: 'Datacore - Rocket Science', 33440: 'Heavy Afocal Laser I', 5141: 'Upgraded Explosive Coating I', 28788: 'Syndicate Gas Cloud Scoop' };
  const types = [...Object.keys(real).map(Number), ...Array.from({ length: 110 }, (_, i) => 900000 + i * 7)];
  const names = { ...real };
  for (const t of types) if (!names[t]) names[t] = `Test Item ${t}`;
  const base = Object.fromEntries(types.map((t) => [t, Math.round(10 ** (1 + r() * 7))]));

  const txs = {}, journal = [], orders = {};
  let tid = 1, jid = 1, oid = 7000000000;
  for (let i = 0; i < 4000; i++) {
    const typeId = pick(types), isBuy = r() < 0.45;
    const t = NOW - Math.floor(r() * 45 * DAY);
    const unitPrice = Math.round(base[typeId] * (0.9 + r() * 0.2) * 100) / 100;
    const qty = 1 + Math.floor(r() * (base[typeId] > 1e6 ? 5 : 500));
    const id = String(tid++);
    txs[id] = { id, source: 'esi', typeId, date: iso(t), isBuy, qty, unitPrice, locationId: r() < 0.9 ? JITA : AMARR };
    const value = qty * unitPrice;
    if (isBuy) { if (r() < 0.2) journal.push({ id: String(jid++), date: iso(t), refType: 'market_escrow', amount: -value }); }
    else {
      journal.push({ id: String(jid++), date: iso(t), refType: 'market_transaction', amount: value, contextId: Number(id) });
      journal.push({ id: String(jid++), date: iso(t), refType: 'transaction_tax', amount: -value * 0.0337 });
    }
  }
  for (let i = 0; i < 400; i++) {
    const typeId = pick(types), isBuy = r() < 0.4;
    const t = NOW - Math.floor(r() * 40 * DAY);
    const total = 1 + Math.floor(r() * 2000);
    const open = r() < 0.4;
    const price = Math.round(base[typeId] * (isBuy ? 0.95 : 1.05) * 100) / 100;
    const seen = r() < 0.3 ? [{ issued: iso(t), price, remain: total }, { issued: iso(t + 3600_000), price: Math.round(price * (isBuy ? 1.01 : 0.99) * 100) / 100, remain: Math.floor(total * 0.8) }] : undefined;
    const orderId = oid++;
    orders[orderId] = {
      orderId, typeId, isBuy, price: seen ? seen[1].price : price, volumeTotal: total,
      volumeRemain: open ? Math.floor(total * r()) + 1 : r() < 0.7 ? 0 : Math.floor(total / 2),
      issued: seen ? seen[1].issued : iso(t), state: open ? 'open' : pick(['closed', 'expired', 'cancelled']), locationId: r() < 0.95 ? JITA : AMARR,
      ...(isBuy && open ? { escrow: price * total * 0.5 } : {}), ...(seen ? { seen } : {}),
    };
    journal.push({ id: String(jid++), date: iso(t), refType: 'brokers_fee', amount: -Math.max(100, price * total * 0.013) });
    if (seen) journal.push({ id: String(jid++), date: seen[1].issued, refType: 'brokers_fee', amount: -Math.max(100, seen[1].price * seen[1].remain * 0.0039) });
  }
  for (let i = 0; i < 300; i++) {
    const t = NOW - Math.floor(r() * 60 * DAY);
    const kind = pick(['bounty_prizes', 'agent_mission_reward', 'player_donation', 'contract_price', 'planetary_import_tax', 'insurance', 'contract_reward', 'lp_store']);
    const amount = kind === 'planetary_import_tax' || kind === 'lp_store' ? -Math.round(r() * 5e6) : Math.round(r() * 3e7);
    journal.push({ id: String(jid++), date: iso(t), refType: kind, amount, firstPartyId: 1000000 + Math.floor(r() * 50), secondPartyId: 95210486, description: kind });
  }
  const { journal: j, balance } = withBalances(journal, 5_000_000_000);
  const traded = [...new Set(Object.values(txs).map((t) => t.typeId))];
  const positions = [];
  for (let i = 0; i < 40; i++) {
    const typeId = traded[i];
    const opened = NOW - Math.floor((10 + r() * 30) * DAY);
    const closed = i >= 30 ? opened + Math.floor(r() * 9 * DAY) : null;
    positions.push({ id: `p${i}`, typeId, openedAt: iso(opened), ...(closed ? { closedAt: iso(closed), status: 'closed' } : { status: 'open' }), jitaOnly: r() < 0.8, excluded: [], included: [] });
  }
  // Two positions on one item, the second started the day the first closed: what found Results' duplicate key.
  positions.push({ id: 'pov', typeId: positions[30].typeId, openedAt: positions[30].closedAt.slice(0, 10) + 'T00:00:00Z', status: 'open', jitaOnly: true, excluded: [], included: [] });
  const stockTypes = types.slice(0, 80);
  const stock = {
    at: iso(NOW - 3600_000), inContainers: 12,
    jita: Object.fromEntries(stockTypes.map((t) => [t, Math.floor(r() * 500)])),
    total: Object.fromEntries(stockTypes.map((t) => [t, Math.floor(r() * 800)])),
    byLocation: { [JITA]: Object.fromEntries(stockTypes.slice(0, 40).map((t) => [t, Math.floor(r() * 500)])) },
  };
  const killmails = {};
  for (let i = 0; i < 12; i++) {
    const loss = i % 2 === 0;
    const id = 130000000 + i;
    killmails[id] = {
      id, hash: `h${i}`, time: iso(NOW - Math.floor(r() * 50 * DAY)), systemId: pick([30000142, 30002187, 30045345]), kind: loss ? 'loss' : 'kill',
      victim: { characterId: loss ? 95210486 : 90000000 + i, shipTypeId: 587, damage: 1000 }, attackers: [{ characterId: loss ? 90000000 + i : 95210486, shipTypeId: 11379, damage: 1000, finalBlow: true }],
      items: [{ typeId: 2185, dropped: 1, destroyed: 2, flag: 87 }],
      ...(i < 8 ? { value: { priceDate: iso(NOW - 10 * DAY).slice(0, 10), ship: 5e6, items: { 2185: 7e5 }, dropped: 7e5, destroyed: 1.4e6, total: 7.1e6, unpriced: [] } } : {}),
    };
  }
  const netWorth = Array.from({ length: 30 }, (_, i) => ({ date: iso(NOW - (29 - i) * DAY).slice(0, 10), total: 8e9 + i * 5e7, wallet: 5e9 + i * 2e7, liquid: 6e9 + i * 3e7 }));
  const ids = Object.keys(txs);
  return {
    names, txs, journal: j, orders, positions, stock, killmails, netWorth,
    watchlist: types.slice(0, 10).map((typeId) => ({ typeId, addedAt: iso(NOW - 5 * DAY) })),
    goals: [
      { id: 'g1', label: 'Save 10 B', createdAt: iso(NOW - 20 * DAY), kind: 'isk', measure: 'wallet', target: 1e10 },
      { id: 'g2', label: '500 PLEX', createdAt: iso(NOW - 20 * DAY), kind: 'afford', typeId: 44992, qty: 500, measure: 'liquid' },
      { id: 'g3', label: 'Hold drones', createdAt: iso(NOW - 20 * DAY), kind: 'hold', typeId: 2185, qty: 100 },
      { id: 'g4', label: 'Earn 1 B', createdAt: iso(NOW - 20 * DAY), kind: 'earn', source: 'trading', target: 1e9, from: iso(NOW - 20 * DAY), deadline: iso(NOW + 10 * DAY) },
    ],
    ignored: ids.slice(0, 5), tags: Object.fromEntries(ids.slice(5, 40).map((id, i) => [id, i % 2 ? 'loot' : 'trading'])),
    leave: traded.slice(0, 3), nearDone: [],
    meta: { walletBalance: balance, lastSync: iso(NOW - 3600_000), lpBalances: [{ corporationId: 1000035, points: 250000 }] },
  };
}

const ALL = { empty: {}, small: small(), large: large() };
// `LEDGER=large PAGE=results npm run check-pages` runs just those (comma-separated), for working on one.
const only = (v) => (v ? v.split(',') : null);
const LEDGERS = Object.fromEntries(Object.entries(ALL).filter(([k]) => !only(process.env.LEDGER) || only(process.env.LEDGER).includes(k)));
const SHOWN = PAGES.filter((p) => !only(process.env.PAGE) || only(process.env.PAGE).some((x) => p.startsWith(x)));
/** A name each ledger's Positions page must show, proving the seed reached the app. */
const PROOF = { small: 'Hammerhead II', large: 'Test Item' };

// ---- Run ----------------------------------------------------------------------------------------------------

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const failures = [];
let checked = 0;
try {
  for (const [name, data] of Object.entries(LEDGERS)) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('**/*', (route) => (route.request().url().startsWith(`http://localhost:${PORT}/`) ? route.continue() : route.abort()));
    let problems = [];
    page.on('pageerror', (e) => problems.push(`threw: ${e.message.split('\n')[0]}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/^Warning: /.test(t)) problems.push(`React: ${t.split('\n')[0].replace(/%s/g, '').slice(0, 160)}`);
    });
    // Seed: the ledger into its store, nothing in the cache or localStorage, then load the app on it.
    await page.goto(BASE);
    await page.evaluate(async (d) => {
      localStorage.clear(); sessionStorage.clear();
      const open = (db) => new Promise((res, rej) => { const q = indexedDB.open(db); q.onsuccess = () => res(q.result); q.onerror = rej; q.onupgradeneeded = () => q.result.createObjectStore('kv'); });
      for (const [db, put] of [['jita-ledger', d], ['jita-ledger-cache', {}]]) {
        const h = await open(db);
        if (!h.objectStoreNames.contains('kv')) continue;
        await new Promise((res) => { const t = h.transaction('kv', 'readwrite'); const st = t.objectStore('kv'); st.clear(); for (const [k, v] of Object.entries(put)) st.put(v, k); t.oncomplete = res; });
        h.close();
      }
    }, data);
    await page.reload();
    await page.waitForSelector('.page', { timeout: 20_000 });
    // The seed has to have reached the app, or every page below passes on an empty store.
    if (PROOF[name]) {
      await page.evaluate(() => { location.hash = '#positions'; });
      await page.waitForTimeout(1000);
      if (!(await page.locator('.page', { hasText: PROOF[name] }).count())) failures.push({ ledger: name, page: 'positions', problems: [`the ${name} ledger didn't load: no “${PROOF[name]}”`] });
    }
    const first = data.positions?.[0]?.id;
    for (const p of SHOWN) {
      if (p.includes('{first}') && !first) continue;
      const hash = p.replace('{first}', first ?? '');
      problems = [];
      await page.evaluate((h) => { location.hash = `#${h}`; }, hash);
      await page.waitForTimeout(1500);
      const boundary = await page.locator('.notice.err[role="alert"]', { hasText: 'This page hit an error' }).count();
      if (boundary) problems.push(`error boundary: ${(await page.locator('.notice.err[role="alert"] pre').first().innerText().catch(() => '')).slice(0, 160)}`);
      if (!(await page.locator('.page').count())) problems.push('no page rendered');
      checked++;
      const unique = [...new Set(problems)];
      if (unique.length) failures.push({ ledger: name, page: hash, problems: unique });
      process.stdout.write(unique.length ? `  FAIL ${name} #${hash}\n${unique.map((x) => `       ${x}`).join('\n')}\n` : `  ok   ${name} #${hash}\n`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failures.length ? `\n${failures.length} of ${checked} page loads failed` : `\nall ${checked} page loads passed`);
process.exit(failures.length ? 1 : 0);
