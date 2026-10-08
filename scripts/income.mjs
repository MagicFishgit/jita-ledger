// The main's income figures, pinned. `npm run check-income` builds the large ledger at a fixed time, opens the Wallet
// and Results in a browser whose clock is fixed at that time and whose ESI answers only the item groups (canned, so
// every activity has a figure), and compares what "All income against play" and "By activity" say with
// scripts/income-golden.json. `RECORD=1` writes that file instead. It was recorded before the income sum moved out of
// the Wallet (stage 2b of several characters), so the move, and anything after it, can't drift unseen. The Characters
// page's Earned for the main is checked against the Wallet's "All income" at each period too.
process.env.FIXED_NOW ??= '2026-09-30T15:00:00Z';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
const { NOW, DAY, iso, large, ownerAuth, CANNED_SETS, ALTS, altStoreOf, charsOf, withTransfers } = await import('./ledgers.mjs');

const PORT = Number(process.env.PORT) || 5189;
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
  // Seeded from a page on the app's origin that isn't the app (Vite serves a module as it is), then the app is opened
  // on it. Seeding under the open app raced it: the app holds the ledger in memory and writes it back (initStore runs
  // before the owner gate), and Task 5 of stage 2b saw the main's lpBalances lost that way (docs/notes/gotchas.md).
  await page.goto(`${BASE}src/lib/constants.ts`);
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
  await page.goto(BASE);
  await page.waitForSelector('.page', { timeout: 20_000 });
  return page;
}

/** What a panel says, row by row: each row's text with its whitespace collapsed. */
async function panelRows(page, title) {
  const panel = page.locator('.panel', { has: page.locator('.panel-title', { hasText: title }) }).first();
  await panel.waitFor({ timeout: 10_000 });
  // Read once the rows have stopped changing (the panel says "Reading…" until the item groups arrive), within 20 s.
  const read = async () => (await panel.locator('.kv, tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let last = null;
  for (let i = 0; i < 20; i++) {
    const rows = await read();
    if (rows.length && JSON.stringify(rows) === JSON.stringify(last)) return rows;
    last = rows;
    await page.waitForTimeout(1000);
  }
  return last;
}

/**
 * The Wallet's "All income against play" at each period, and Results' "By activity" (`got`, what's recorded); and the
 * periods whose panel said "Nothing earned" in place of its rows (`empty`, kept out of the recording, which predates it).
 */
async function figures(page) {
  const out = {}, empty = {};
  for (const days of [1, 7, 30, 90]) {
    // The Wallet reads its period when it mounts, so leave for another page and come back.
    await page.evaluate((v) => { localStorage.setItem('jita-ledger:wallet-days', String(v)); location.hash = '#todo'; }, days);
    await page.waitForTimeout(500);
    await page.evaluate(() => { location.hash = '#wallet'; });
    await page.waitForTimeout(2500);
    out[`wallet ${days}`] = await panelRows(page, 'All income against play');
    // The rows' own place holds "Nothing earned in …" when there are none. Not the note under the bars, which says
    // "Nothing earned in this window" whenever the sum is under zero.
    const panel = page.locator('.panel', { has: page.locator('.panel-title', { hasText: 'All income against play' }) }).first();
    empty[`wallet ${days}`] = (await panel.locator('.col > p.note', { hasText: 'Nothing earned' }).count()) > 0;
  }
  await page.evaluate(() => { location.hash = '#results'; });
  await page.waitForTimeout(2500);
  out.results = await panelRows(page, 'By activity');
  return { got: out, empty };
}

/**
 * The Characters page's Earned for the character logged in is the Wallet's "All income" for the same period: the same
 * function on the same ledger, with the same start (lib/wallet.ts periodStart). Read from the first card once it has
 * stopped changing (it says "–" while the item groups are read). A period with nothing earned is "–" on the card,
 * "Nothing earned in 24 hours", where the Wallet lists no rows and its All income is 0: the two agree then too (`empty`,
 * from `figures`). Returns a line for each period.
 */
async function charactersAgree(page, got, empty) {
  const lines = [];
  for (const days of [1, 7, 30, 90]) {
    await page.evaluate((v) => { localStorage.setItem('jita-ledger:chars-days', String(v)); location.hash = '#todo'; }, days);
    await page.waitForTimeout(500);
    await page.evaluate(() => { location.hash = '#characters'; });
    const tile = page.locator('section.panel', { has: page.locator('.pilot') }).first().locator('.tile', { hasText: 'Earned' });
    await tile.waitFor({ timeout: 10_000 });
    let last = null, card = null;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1000);
      const v = (await tile.locator('.tile-v').innerText()).trim();
      // "–" is settled only when it says nothing was earned; otherwise it's still reading the item groups.
      const nothing = v === '–' && (await tile.locator('.tile-n').innerText().catch(() => '')).startsWith('Nothing earned');
      if (v === last && (v !== '–' || nothing)) { card = v; break; }
      last = v;
    }
    const wallet = (got[`wallet ${days}`] ?? []).find((r) => r.startsWith('All income '))?.slice('All income '.length) ?? null;
    const none = card === '–' && empty[`wallet ${days}`];
    lines.push(card != null && (card === wallet || none)
      ? `  ok   characters ${days}: the main's Earned is the Wallet's All income (${none ? `nothing earned on both` : card})`
      : `  FAIL characters ${days}: the main's Earned reads ${card ?? last}, the Wallet's All income ${wallet}${empty[`wallet ${days}`] ? ' (nothing earned)' : ''}`);
  }
  return lines;
}

/**
 * A page's text once it has stopped changing: the same on two reads a second apart, within 20 s. A busy machine renders
 * the same page later, not differently, and a read taken mid-render (the item groups still "Reading…") failed the
 * comparison on 1 October 2026 while four runs on a quiet machine passed.
 */
async function settled(page) {
  let last = null;
  for (let i = 0; i < 40; i++) {
    // The Wallet's "All characters" line (data-alts) differs with alts by design: it adds each alt's own net worth beside the
    // main's. It is left out of the text compared here; that it never reaches the main's net worth or the ledger is what the
    // rest of this check (and the ledger comparison, unchanged) proves.
    const text = (await page.locator('.page').evaluate((el) => {
      const c = el.cloneNode(true);
      c.querySelectorAll('[data-alts]').forEach((n) => n.remove());
      return c.innerText ?? c.textContent;
    }).catch(() => '')).replace(/\s+/g, ' ');
    if (text && text === last) return text;
    last = text;
    await page.waitForTimeout(1000);
  }
  return last;
}

/**
 * JSON with every object's keys in sorted order: the ledgers are compared as values. The app writes a document's fields
 * in whatever order its updates land (`meta` gained `rateHistory` before `lastSeenAt` in one run and after in another),
 * which a string comparison read as a difference.
 */
const canonical = (json) => JSON.stringify(JSON.parse(json), (_k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  : v));

/** The main's pages the isolation test compares, each read once it has settled, keyed `wallet before` and so on. */
async function mainPages(page, when) {
  const out = {};
  for (const hash of ['results', 'positions', 'wallet']) {
    await page.evaluate((h) => { location.hash = `#${h}`; }, hash);
    await page.waitForTimeout(1000);
    out[`${hash} ${when}`] = await settled(page);
  }
  return out;
}

/**
 * Opens the Wallet once before anything is read. Its first visit prices the loyalty points in the background, and the
 * tile says "Pricing…" for as long as that visit lasts here (ESI is refused; 30 s on the page didn't end it); every
 * visit after it, for half an hour (lpTried), says "Not priced yet". Read first on its first visit and again after the
 * Characters page, that was the one difference, in both runs, the one without alts too. So the reads below start on
 * Results and come to the Wallet on its second visit.
 */
async function walletFirstVisit(page) {
  await page.evaluate(() => { location.hash = '#wallet'; });
  await page.waitForTimeout(2000);
}

/** An alt's card on the Characters page, by its name. */
const altCard = (page, name) => page.locator('section.panel', { has: page.locator('.pilot-name', { hasText: name }) }).first();

/**
 * Opens the Characters page and, with alts in this browser, waits until the first alt's Earned is a figure: its income
 * has been worked out from its own ledger (lib/altLedger.ts), through the same caches the main's pages use. Returns
 * what went wrong, if anything, and what each alt's Earned says once the page has settled.
 */
async function altIncome(page, withAlts) {
  await page.evaluate(() => { location.hash = '#characters'; });
  await page.waitForTimeout(1000);
  if (!withAlts) { await settled(page); return { missing: [], said: [] }; }
  const first = ALTS.large[0].entry.name;
  const earned = (name) => altCard(page, name).locator('.tile', { hasText: 'Earned' }).locator('.tile-v');
  let v = '';
  for (let i = 0; i < 20; i++) {
    v = (await earned(first).innerText().catch(() => '')).trim();
    if (v && v !== '–') break;
    await page.waitForTimeout(1000);
  }
  const missing = v && v !== '–' ? [] : [`${first}'s Earned still read “${v}” after 20 s: the alts' income never ran, so the reads after it prove nothing`];
  // The other cards finish too before the main's pages are read again.
  await settled(page);
  const said = [];
  for (const a of ALTS.large) said.push(`${a.entry.name} ${(await earned(a.entry.name).innerText().catch(() => '?')).trim()}`);
  return { missing, said };
}

/**
 * Isolation: the main's ledger and figures are the same with alts in this browser as without. The alt store is seeded
 * with alts' own trades, journal and mining; `chars` stays empty (the roster read that fills it can't run: the cloud is
 * unreachable).
 *
 * Read in this order, in each run: Results, Positions and the Wallet ("before", after a first visit to the Wallet,
 * `walletFirstVisit`); then the Characters page, waiting (with alts) until the first alt's Earned is a figure, so every
 * alt's ledger and income has been worked out; then Mining; then Results, Positions and the Wallet again ("after"), and
 * the ledger as the app holds it, less `names` (a page's lookup may add an item name, a game fact) and `chars`. Only
 * the Characters page builds an alt's ledger and income, and it does so through caches the main's pages share (fee
 * matches, every item's walk, the item groups), so a leak or eviction there would hand the main's pages an alt's
 * figure, or a stale one, only after it. The final review of stage 2b found the main's pages read before any alt's
 * ledger existed, which could see a write into the ledger and nothing else. Both "before" and "after" are compared
 * between the runs, and each "before" with its "after" within a run (without alts, that's the control: a difference
 * there too isn't an alt's doing).
 */
async function snapshot(page, withAlts) {
  await walletFirstVisit(page);
  const out = await mainPages(page, 'before');
  const alt = await altIncome(page, withAlts);
  await page.evaluate(() => { location.hash = '#hustles/mining'; });
  await page.waitForTimeout(1000);
  await settled(page);
  Object.assign(out, await mainPages(page, 'after'));
  out.ledger = await page.evaluate(async () => {
    // The app's own instance of the store, by the URL it loaded it from, or the import makes a second, empty one.
    // The resource timing list comes back empty under the fixed clock, so the URL is the one Vite serves it at.
    const url = `${location.origin}/jita-ledger/src/lib/store.ts`;
    const { getData } = await import(url);
    const { names: _n, chars: _c, ...rest } = getData();
    if (!Object.keys(rest.txs ?? {}).length) throw new Error('the store imported is empty: a second instance');
    return JSON.stringify(rest);
  }).then(canonical);
  return { texts: out, alt };
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
    const withAlts = Object.keys(store).length > 0;
    const page = await open(browser, L, store);
    snaps.push(await snapshot(page, withAlts));
    if (withAlts) loaded = await altsLoaded(page);
    await page.close();
  }
  const [without, withAlts] = snaps;
  let bad = 0;
  /** Where two texts first differ, with some of each around it. */
  const diff = (k, a, c, la, lc) => {
    let d = 0; while (d < a.length && a[d] === c[d]) d++;
    console.log(`  FAIL isolation ${k}\n       ${la} ...${a.slice(Math.max(0, d - 100), d + 100)}...\n       ${lc} ...${c.slice(Math.max(0, d - 100), d + 100)}...`);
  };
  for (const m of loaded) { bad++; console.log(`  FAIL isolation: the alts didn't load: ${m}`); }
  if (!loaded.length) console.log('  ok   alts loaded (names on the Characters page, records in jita-ledger-alts)');
  for (const m of withAlts.alt.missing) { bad++; console.log(`  FAIL isolation: ${m}`); }
  if (!withAlts.alt.missing.length) console.log(`  ok   the alts' income was worked out before the main's pages were read again (Earned: ${withAlts.alt.said.join(', ')})`);
  // Within the run with alts: what a page said before the Characters page and after it. The run without alts is the
  // control: a page that reads differently on a later visit there too isn't an alt's doing, so it's noted rather than
  // failed (the between-runs comparison below still holds that page to the run without alts). Failing the control as
  // well would let anything that changes between visits block a release.
  for (const h of ['results', 'positions', 'wallet']) {
    const steady = without.texts[`${h} before`] === without.texts[`${h} after`];
    const a = withAlts.texts[`${h} before`], c = withAlts.texts[`${h} after`];
    if (!steady) console.log(`  note ${h} reads differently on a later visit even without alts, so its before/after with alts proves nothing alone`);
    else if (a !== c) { bad++; diff(`${h}, with alts: changed once the Characters page had been opened`, a, c, 'before', 'after '); }
  }
  // Between the runs: every page read, before and after, and the ledger.
  for (const k of Object.keys(without.texts)) {
    if (without.texts[k] === withAlts.texts[k]) continue;
    bad++;
    diff(k, without.texts[k], withAlts.texts[k], 'without alts', 'with alts   ');
  }
  if (!bad) console.log('  ok   isolation (the Wallet, Results and Positions before and after the alts\' income, and the ledger)');
  return bad;
}

/**
 * The Wallet's figures that ISK moved between your characters must not move (`mine` on every `flows`, `unusual` and
 * goal call in Wallet.tsx), each read as the page shows it: money in and out, net cash flow, the day's biggest cost,
 * play (both panels), the runway, running costs, the month's report, the unusual-activity list and a cash-flow goal.
 * What reads the balance (Wallet today, Since your last visit, the balance line, net worth) moves on purpose and isn't
 * here. Stage 4's final review proved each call passes the set by reading only; the recording can't, since its ledger
 * holds no characters.
 */
const panel = (title) => (p) => p.locator('.panel', { has: p.locator('.panel-title', { hasText: title }) });
const CASH_GOAL = { id: 'gcash', label: 'Net 100 T', createdAt: iso(NOW - 20 * DAY), kind: 'earn', source: 'cashflow', target: 1e14, from: iso(NOW - 20 * DAY) };
const WALLET_FIGURES = [
  ['Money in', (p) => p.locator('.kv', { has: p.locator('.lbl', { hasText: /^Money in$/ }) })],
  ['Money out', (p) => p.locator('.kv', { has: p.locator('.lbl', { hasText: /^Money out$/ }) })],
  ['Net cash flow', (p) => p.locator('.kv', { has: p.locator('.lbl', { hasText: /^Net cash flow$/ }) })],
  ['Biggest cost today', (p) => p.locator('.tile', { has: p.locator('.tile-l', { hasText: 'Biggest cost today' }) })],
  ['Trading against play', panel('Trading against play')],
  ['All income against play', panel('All income against play')],
  ['Runway', panel(/^Runway$/)],
  ['Running costs', panel('Running costs')],
  ['the month’s report', panel(/ report$/)],
  ['Unusual activity', panel('Unusual activity')],
  ['the cash-flow goal', (p) => p.locator('.goal', { has: p.locator('.goal-name', { hasText: CASH_GOAL.label }) })],
];

/**
 * The same ledger, its `chars` holding the alts, with and without ISK moved between the owner and them (ledgers.mjs
 * `withTransfers`, balances assigned again in date order, plus one sent today that's more than everything else spent
 * today, so the day's biggest cost would name it if counted). Every figure in WALLET_FIGURES must read the same on both,
 * and the line "Between your characters" must be drawn only with the transfers in (else `chars` never reached the page
 * and the comparison proves nothing). Returns the number of failures.
 */
async function transfers(browser) {
  const list = ALTS.large;
  const ledger = () => { const L = large(); return { ...L, chars: charsOf(list), goals: [...L.goals, CASH_GOAL] }; };
  const without = ledger(), moved = ledger();
  const today0 = Date.parse(iso(NOW).slice(0, 10));
  const spentToday = Object.values(moved.journal).filter((e) => Date.parse(e.date) >= today0 && e.amount < 0).reduce((t, e) => t - e.amount, 0);
  moved.journal = withTransfers(moved.journal, list, [{
    id: 'move-today', date: iso(Math.max(today0, NOW - 3600_000)), refType: 'player_donation', amount: -(Math.ceil(spentToday / 1e8) * 1e8 + 1e8),
    firstPartyId: ownerAuth().characterId, secondPartyId: list[0].entry.charId, description: 'Owner deposited cash into an alt’s account',
  }]);
  const read = {};
  for (const [k, L] of [['without', without], ['with', moved]]) {
    const page = await open(browser, L, {});
    await page.evaluate(() => { location.hash = '#todo'; });
    await page.waitForTimeout(500);
    await page.evaluate(() => { location.hash = '#wallet'; });
    await settled(page);
    const out = { between: await page.locator('.between-line').count() };
    for (const [label, at] of WALLET_FIGURES) out[label] = (await at(page).first().innerText({ timeout: 5000 }).catch(() => null))?.replace(/\s+/g, ' ').trim() ?? null;
    read[k] = out;
    await page.close();
  }
  let bad = 0;
  const fail = (m) => { bad++; console.log(`  FAIL transfers: ${m}`); };
  if (!read.with.between) fail('no “Between your characters” on the Wallet with the transfers in: the ledger’s characters didn’t reach the page (then the figures below prove nothing), or the period’s flows no longer get them');
  if (read.without.between) fail('“Between your characters” drawn with no transfer in the ledger');
  for (const [label] of WALLET_FIGURES) {
    const a = read.with[label], b = read.without[label];
    if (a == null || b == null) { fail(`${label} isn’t on the Wallet ${a == null ? 'with' : 'without'} the transfers`); continue; }
    if (a === b) continue;
    let d = 0; while (d < a.length && a[d] === b[d]) d++;
    const at = (x) => `${d > 60 ? '…' : ''}${x.slice(Math.max(0, d - 60), d + 80)}${x.length > d + 80 ? '…' : ''}`;
    fail(`${label} moved with ISK sent between your characters, so a Wallet figure counts a transfer:\n       with the transfers    “${at(a)}”\n       without them          “${at(b)}”`);
  }
  if (!bad) console.log(`  ok   transfers between your characters move none of the Wallet's ${WALLET_FIGURES.length} figures compared (the balance's own excepted)`);
  return bad;
}

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
let failed = 0;
try {
  const page = await open(browser, large(), {});
  const { got, empty } = await figures(page);
  // Read before the page closes, said after the recording's lines.
  const agree = process.env.RECORD === '1' ? [] : await charactersAgree(page, got, empty);
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
    for (const line of agree) { if (line.startsWith('  FAIL')) failed++; console.log(line); }
  }
  failed += await isolation(browser);
  failed += await transfers(browser);
} finally {
  await browser.close();
  await server.close();
}
console.log(failed ? `\n${failed} failures: the main's income figures moved, the Characters page disagrees with the Wallet, an alt reached the main's ledger, or a transfer between your characters moved a Wallet figure` : '\nthe main\'s income figures are as recorded');
process.exit(failed ? 1 : 0);
