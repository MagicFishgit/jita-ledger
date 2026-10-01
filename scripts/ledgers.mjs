// The ledgers the browser checks seed (scripts/pages.mjs, scripts/income.mjs): an empty, a small and a large one,
// the owner's stand-in login, and the alts' own database. Built from NOW, so they are the same every run for one NOW.

export const ownerAuth = () => ({ accessToken: 'test', refreshToken: 'test', expiresAt: NOW + 86400_000, characterId: 95210486, characterName: 'Owner', scopes: [] });
export const strangerAuth = () => ({ ...ownerAuth(), characterId: 12345, characterName: 'Stranger' });

/** A seeded random number generator, so the large ledger is the same every run. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const JITA = 60003760, AMARR = 60008494;
export const DAY = 86400_000;
/**
 * When the ledgers are built from. `FIXED_NOW` (an ISO time) pins it, for the income check's recording: the pages
 * work their windows out from UTC midnights, so the same ledger built an hour later gives other figures.
 */
export const NOW = process.env.FIXED_NOW ? Date.parse(process.env.FIXED_NOW) : Date.now();
export const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Journal entries with balances assigned in date order, as ESI gives them. */
export function withBalances(entries, start) {
  entries.sort((a, b) => a.date.localeCompare(b.date));
  let bal = start;
  const out = {};
  for (const e of entries) { bal += e.amount; out[e.id] = { ...e, balance: Math.round(bal * 100) / 100 }; }
  return { journal: out, balance: bal };
}

export function small() {
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

export function large() {
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
    // Kinds the Wallet has no group for too, so "Other income" and "Other spending" have something to open.
    const kind = pick(['bounty_prizes', 'agent_mission_reward', 'player_donation', 'contract_price', 'planetary_import_tax', 'insurance', 'contract_reward', 'lp_store', 'player_trading', 'kill_right_fee', 'asset_safety_recovery_tax', 'war_fee']);
    const amount = ['planetary_import_tax', 'lp_store', 'asset_safety_recovery_tax', 'war_fee'].includes(kind) ? -Math.round(r() * 5e6) : Math.round(r() * 3e7);
    journal.push({ id: String(jid++), date: iso(t), refType: kind, amount, firstPartyId: 1000000 + Math.floor(r() * 50), secondPartyId: 95210486, description: kind });
  }
  // Freelance rewards (Results' and the Wallet's Freelance lines): two inside the week, one older than a month.
  for (const [d, amount] of [[2, 12_000_000], [5, 7_500_000], [40, 3_000_000]]) journal.push({ id: String(jid++), date: iso(NOW - d * DAY), refType: 'freelance_jobs_reward', amount, firstPartyId: 1000999, secondPartyId: 95210486, description: 'freelance_jobs_reward' });
  // Daily goal payouts and AIR rewards (the Rewards line): today, inside the week and older than a month.
  for (const [d, refType, amount] of [[0, 'daily_goal_payouts', 445_000], [3, 'air_career_program_reward', 75_000], [45, 'daily_goal_payouts', 400_000]]) journal.push({ id: String(jid++), date: iso(NOW - d * DAY - 3_600_000), refType, amount, firstPartyId: 1000418, secondPartyId: 95210486, description: refType });
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
    // Asset safety in all three states: waiting with no known countdown (as the user's was), waiting and dated
    // because the cloud saw it go in, and delivered.
    safety: [
      { id: 1055765149463, state: 'waiting', stationId: null, items: { 2006: 1, 16233: 1, 17366: 2, 16236: 1, 2185: 5, 34: 12000 }, name: 'K7D-II - Iserlohn Fortress', firstSeen: iso(NOW - 6 * DAY), startKnown: false,
        // As packed: two station containers (one named), one of them with a blueprint copy too, a ship with drones in
        // its bay, and a ship lying loose.
        holders: [
          { id: 1044519007308, typeId: 17366, name: 'Minerals for the rebuild', items: { 34: 12000 }, contents: [{ typeId: 34, q: 12000 }, { typeId: 47971, q: 1, copy: true }] },
          { id: 1044519007309, typeId: 17366, items: { 16236: 1 } },
          { id: 1044914025438, typeId: 2006, items: { 2185: 5 }, contents: [{ typeId: 2185, q: 5, bay: 'Drone bay' }] },
        ],
        loose: { 16233: 1 }, contents: [{ typeId: 16233, q: 1 }] },
      { id: 1055765149464, state: 'waiting', stationId: null, items: { 35: 800 }, name: 'Test Citadel With A Rather Long Name', firstSeen: iso(NOW - 2 * DAY), startKnown: true },
      { id: 1055765149465, state: 'delivered', stationId: AMARR, items: { 36: 50 }, firstSeen: iso(NOW - 21 * DAY), startKnown: true, deliveredAt: iso(NOW - 3600_000) },
    ],
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
  // The main's own mining, beside the alts' (ALTS below), so the Mining tab has every character's to add up: one ore the
  // ledger names (34) and two it doesn't (Scordite, Veldspar), so the unpriced path is drawn too. Mining isn't income:
  // nothing the income check records reads it.
  const mining = {};
  for (const [typeId, d, qty] of [[34, 1, 12000], [1228, 3, 24000], [1230, 3, 8000], [1228, 8, 30000]]) {
    const date = iso(NOW - d * DAY).slice(0, 10), charId = 95210486;
    mining[`${charId}:${date}:30000142:${typeId}`] = { charId, date, systemId: 30000142, typeId, qty };
  }
  const ids = Object.keys(txs);
  return {
    names, txs, journal: j, orders, positions, stock, killmails, netWorth, mining,
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

/**
 * Stand-ins for ESI's item groups (lib/attribution.ts reads them), from the large ledger's made-up types, so every
 * activity Results and the Wallet count has trades in it: filaments bought, abyssal loot, planetary goods and
 * loyalty-store goods sold. The loyalty store is corp 1000035's, the one the large ledger holds points with.
 */
export const CANNED_SETS = {
  groups: { 2457: [900000, 900007], 2458: [], 2459: [], 2460: [], 2461: [], 2479: [900014, 900021], 1333: [900028], 1334: [900035], 1335: [], 1336: [], 1337: [] },
  lpOffers: { 1000035: [900042, 900049] },
};

/**
 * The sales tax alts 0 and 1 pay, as their journal shows it. Both have Accounting V trained (`skills`), but alt 0 is an
 * Alpha, and Accounting is Omega only (constants.ts ALPHA_CAPS), so it pays the full 7.5%; alt 1, its clone state not
 * told apart and so taken as Omega (lib/altLedger.ts), pays 7.5% less 55%.
 */
export const ALT_TAX = [0.075, 0.075 * (1 - 0.11 * 5)];
const ACCOUNTING = 16622;

/**
 * What alts 0 and 1 did on their own account: a buy and a resale of one item, a sale of something never bought, the
 * tax and a bounty for them, and mining of three ores over the last week. All under their own character. The main's
 * figures must not move because of any of it (scripts/income.mjs, "isolation"). Alt 2 has read nothing.
 *
 * Their figures come from their journal, not from estimates: each sale's tax is what the alt pays (`ALT_TAX`), so the
 * fee match (lib/feeMatch.ts, by second and within half of what the rate predicts) claims it. Shaped as ESI gives them:
 * a sale's `market_transaction` row names it by `contextId`, its `transaction_tax` row names nothing (eve-facts), so
 * results.ts' by-ID tax lookup finds none and estimates at the alt's own rate, which is what the row says. Trade IDs
 * are ESI's transaction IDs as strings (lib/esiRecords.ts), so a `contextId` finds its trade. The final review found the alts' 3.37% rows rejected against the 7.5% an Accounting-less alt is
 * predicted to pay, and contextIds that named no trade, so their Earned ran on estimates alone.
 */
function ownWork(charId, i) {
  if (i > 1) return {};
  const at = (d) => iso(NOW - d * DAY);
  const tx = (n, typeId, d, isBuy, qty, unitPrice) => { const id = String(charId * 100 + n); return [id, { id, charId, source: 'esi', typeId, date: at(d), isBuy, qty, unitPrice, locationId: JITA }]; };
  const txs = Object.fromEntries([tx(1, 2185, 3, true, 20, 700000), tx(2, 2185, 2, false, 15, 820000), tx(3, 20420, 1, false, 40, 1500000)]);
  const sale = (n) => ({ contextId: charId * 100 + n });
  const p = `${charId}-`;
  const j = (id, d, refType, amount, extra = {}) => [id, { id, charId, date: at(d), refType, amount, balance: 0, ...extra }];
  // To the cent, as ESI gives an amount.
  const tax = (gross) => -Math.round(gross * ALT_TAX[i] * 100) / 100;
  const journal = Object.fromEntries([
    j(`${p}j1`, 2, 'market_transaction', 15 * 820000, sale(2)), j(`${p}j2`, 2, 'transaction_tax', tax(15 * 820000)),
    j(`${p}j3`, 1, 'market_transaction', 40 * 1500000, sale(3)), j(`${p}j4`, 1, 'transaction_tax', tax(40 * 1500000)),
    j(`${p}j5`, 1, 'bounty_prizes', 8_000_000),
  ]);
  const mining = {};
  [[34, 6, 30000], [1230, 4, 18000], [1228, 2, 9000]].forEach(([typeId, d, qty]) => {
    const date = at(d).slice(0, 10);
    mining[`${charId}:${date}:30000142:${typeId}`] = { charId, date, systemId: 30000142, typeId, qty };
  });
  return { txs, journal, mining };
}

/**
 * An alt as the browser keeps it (src/lib/altStore.ts): its roster entry, and the rows pulled for it. Three kinds,
 * by `i`: 0 read and well (an Alpha, mid-queue); 1 with a job failing and its clone state not told apart; 2 just
 * added and refused, with nothing read yet, so every figure on its card is "not known".
 *
 * The Alpha's skills are shaped as the cloud's sheet read writes them (worker/src/sheet.ts, check-worker.mjs): Mining
 * trained to V that Alpha lets it use at IV, and Mining Barge trained to III that Alpha can't use at all, so `activeSkills`
 * lists only those two, each below its trained level. It once gave Mining an active IV over a trained III, which ESI never
 * sends, so the page check never drew a capped skill (the final review of stage 3).
 */
export function alt(charId, name, i) {
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
    records: { netWorth: { [day]: { date: day, total: 12.5e6 * (i + 1), wallet: 4.2e6 * (i + 1) } }, ...ownWork(charId, i) },
    docs: {
      meta: {
        walletBalance: 4.2e6 * (i + 1), walletAt: iso(NOW - 1700_000), totalSp: 1.2e6,
        ...(i === 0 ? { cloneDetected: 'alpha', cloneSince: iso(NOW - 2 * DAY), activeSkills: { 3386: 4, 17940: 0 } } : {}),
        skillQueue: i === 0 ? [{ skillId: 3380, level: 4, finish: iso(NOW + 2 * DAY), start: iso(NOW - DAY) }]
          : [{ skillId: 3386, level: 4, finish: iso(NOW + 2 * DAY), start: iso(NOW - DAY) }, { skillId: 3380, level: 4, finish: iso(NOW + 6 * DAY) }],
      },
      skills: i === 0 ? { 3386: 5, 17940: 3, 3380: 3, [ACCOUNTING]: 5 } : { 3386: 3, 3380: 3, [ACCOUNTING]: 5 },
    },
  };
  return { entry, saved };
}
export const ALTS = { empty: [], small: [alt(900001, 'Miner Two', 0)], large: [alt(900001, 'Miner Two', 0), alt(900002, 'Miner Three', 1), alt(900003, 'Hauler Four', 2)] };
/** The alt store's database as it would be on disk: the roster as last read, and each alt's copy. */
export const altStoreOf = (list) => Object.fromEntries([['roster', { at: NOW - 60_000, list: list.map((a) => a.entry) }], ...list.map((a) => [`alt:${a.entry.charId}`, a.saved])]);
/** Which characters are yours, as the ledger itself holds it. */
export const charsOf = (list) => Object.fromEntries(list.map((a) => [a.entry.charId, { name: a.entry.name }]));

/**
 * A journal with ISK moved between the owner and its alts (`list`, shaped as ALTS): 100 M sent to the first alt, 20.25 M
 * back from the last, and with two alts or more a 45.5 M contract price to the second, then any `extra` entries; the
 * balances assigned again in date order from where the journal started, as `withBalances` does. The contract price is
 * synthetic, there for a second kind of part: no contract entry between two characters has been seen in real data
 * (docs/notes/eve-facts.md), so its parties here aren't evidence of how EVE writes one.
 */
export function withTransfers(journal, list, extra = []) {
  const main = ownerAuth().characterId, first = list[0].entry.charId, last = list[list.length - 1].entry.charId;
  const old = Object.values(journal).sort((a, b) => a.date.localeCompare(b.date));
  const start = old.length ? old[0].balance - old[0].amount : 1e9;
  const sent = [
    { id: 'move-out', date: iso(NOW - 2 * DAY), refType: 'player_donation', amount: -100_000_000, firstPartyId: main, secondPartyId: first, description: 'Owner deposited cash into an alt’s account' },
    { id: 'move-back', date: iso(NOW - DAY), refType: 'player_donation', amount: 20_250_000, firstPartyId: last, secondPartyId: main, description: 'An alt deposited cash into Owner’s account' },
    ...(list.length > 1 ? [{ id: 'move-contract', date: iso(NOW - 3 * DAY), refType: 'contract_price', amount: -45_500_000, firstPartyId: main, secondPartyId: list[1].entry.charId, description: 'Contract price' }] : []),
    ...extra,
  ];
  return withBalances([...old.map(({ balance: _b, ...e }) => e), ...sent], start).journal;
}
