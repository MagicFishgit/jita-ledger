// The Worker's own code, run against an in-memory stand-in for D1 (scripts/d1.mjs) with ESI stubbed.
// Run with: npm run check   (after the pure-logic tests)
import fs from 'node:fs';
import { d1, fakeToken, keepKey, stubFetch, testEnv } from './d1.mjs';

let failed = 0;
// Objects are compared whatever order their keys came in (counts come back grouped by character, lowest ID first);
// arrays keep their order.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const eq = (label, got, want) => {
  const g = JSON.stringify(canon(got)), w = JSON.stringify(canon(want));
  if (g !== w) { failed++; console.log(`  FAIL ${label}: got ${g}, want ${w}`); }
};
const rejects = async (label, fn, re) => {
  try { await fn(); failed++; console.log(`  FAIL ${label}: didn't throw`); } catch (e) {
    if (!re.test(String(e?.message ?? e))) { failed++; console.log(`  FAIL ${label}: threw "${e?.message ?? e}"`); }
  }
};

const MAIN = 95210486, ALT = 900001, SENDER = 900777;
/** The two permissions Settings asks a sender for (auth.ts MAILER_SCOPES). */
const MAIL_ONLY = ['esi-mail.send_mail.v1', 'esi-mail.organize_mail.v1'];
/** Every table a character's data lives in, as "table:charId" → rows: what a reader may and may not have touched. */
const TABLES = ['records', 'docs', 'revs', 'jobs', 'mining_state', 'mining_ticks', 'safety_seen'];
const counts = (db) => Object.fromEntries(TABLES.flatMap((t) => db.rows(`SELECT char_id AS c, COUNT(*) AS n FROM ${t} GROUP BY char_id`).map((r) => [`${t}:${r.c}`, r.n])));
const under = (db, char) => Object.fromEntries(Object.entries(counts(db)).filter(([k]) => k.endsWith(`:${char}`)));

// No test reaches the network: anything not answered by a stub (stubFetch) is a failure, not a request. stubFetch
// puts back whatever was here when it was called, so this stays in place between tests.
globalThis.fetch = async (input) => {
  failed++;
  const url = input instanceof Request ? input.url : String(input);
  console.log(`  FAIL a test reached the network: ${url}`);
  return new Response(JSON.stringify({ error: 'no network in tests' }), { status: 599 });
};

console.log('--- every Worker module loads in the test runner ---');
{
  // Node strips types and nothing more: a parameter property or an enum anywhere stops the file loading.
  for (const f of fs.readdirSync(new URL('../worker/src/', import.meta.url)).filter((x) => x.endsWith('.ts'))) {
    let ok = true;
    try { await import(`../worker/src/${f}`); } catch (e) { ok = String(e?.message ?? e); }
    eq(`  ${f}`, ok, true);
  }
}

console.log('\n--- the cloud copy is one character\'s at a time ---');
{
  const db = d1();
  const { push, pull } = await import('../worker/src/sync.ts');
  await push(db, MAIN, { records: [{ k: 'txs', i: 'a', d: { x: 1 } }], docs: [{ key: 'stock', d: { mine: true } }] });
  await push(db, ALT, { records: [{ k: 'txs', i: 'b', d: { x: 2 } }, { k: 'mining', i: 'm', d: { q: 3 } }], docs: [] });
  const mine = await pull(db, MAIN, 0, null), theirs = await pull(db, ALT, 0, null);
  eq('  the main pulls only its own records', mine.records.map((r) => r.i), ['a']);
  eq('  and its own documents', mine.docs.map((x) => x.key), ['stock']);
  eq('  an alt pulls only its own', theirs.records.map((r) => r.i).sort(), ['b', 'm']);
  eq('  each has its own revision', [mine.rev, theirs.rev], [1, 1]);
  eq('  rows are filed under the character pushed for', counts(db), { [`records:${MAIN}`]: 1, [`records:${ALT}`]: 2, [`docs:${MAIN}`]: 1, [`revs:${MAIN}`]: 1, [`revs:${ALT}`]: 1 });
}

/** The permissions a login handed over by the app carries that the readers look for. */
const SCOPES = [
  'esi-wallet.read_character_wallet.v1', 'esi-markets.read_character_orders.v1', 'esi-assets.read_assets.v1',
  'esi-characters.read_loyalty.v1', 'esi-skills.read_skills.v1', 'esi-skills.read_skillqueue.v1',
  'esi-industry.read_character_mining.v1', 'esi-location.read_ship_type.v1', 'esi-mail.send_mail.v1', 'esi-mail.organize_mail.v1',
  'esi-characters.read_standings.v1', 'esi-characters.read_agents_research.v1',
];
/** A ledger with its main's login kept, and one alt on its roster with its own. */
async function ledgerWithAlt() {
  const db = d1();
  await keepKey(db, MAIN, 'main', MAIN, 'Main', SCOPES);
  await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', SCOPES);
  db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', ALT, MAIN, 'Miner Two', Date.now());
  return { db, env: testEnv(db) };
}
const T0 = Date.parse('2026-10-01T15:00:00Z');
const MIN = 60_000;
const VELDSPAR = 1230, SCORDITE = 1228, VENTURE = 32880, SYSTEM = 30000142;
const mined = (veld, scor) => [
  { date: '2026-10-01', solar_system_id: SYSTEM, type_id: VELDSPAR, quantity: veld },
  ...(scor ? [{ date: '2026-10-01', solar_system_id: SYSTEM, type_id: SCORDITE, quantity: scor }] : []),
];

console.log('\n--- mining: whose login, whose data ---');
{
  const { readMiningRound } = await import('../worker/src/mining.ts');
  const { altReader, ledgerReader } = await import('../worker/src/eve.ts');

  // The main, as it has always been read: everything under its own ID.
  {
    const { db, env } = await ledgerWithAlt();
    let qty = 1000;
    const f = stubFetch([[`/characters/${MAIN}/mining/`, () => mined(qty)], [`/characters/${MAIN}/ship/`, { ship_type_id: VENTURE }]]);
    eq('  the main\'s first read is a baseline: no ticks', await readMiningRound(env, ledgerReader(MAIN), T0), 0);
    eq('    and it already keeps the hull it was in', db.rows('SELECT ship_type_id AS ship FROM mining_state'), [{ ship: VENTURE }]);
    qty = 1600;
    eq('    ten minutes on, what grew is one tick', await readMiningRound(env, ledgerReader(MAIN), T0 + 10 * MIN), 1);
    eq('    a read before ESI\'s ten minutes are up isn\'t made', await readMiningRound(env, ledgerReader(MAIN), T0 + 12 * MIN), null);
    f.restore();
    eq('    all of it under the main', counts(db), { [`records:${MAIN}`]: 1, [`revs:${MAIN}`]: 1, [`jobs:${MAIN}`]: 1, [`mining_state:${MAIN}`]: 1, [`mining_ticks:${MAIN}`]: 1 });
    eq('    the tick is what grew, in the hull it was in', db.rows('SELECT qty, ship_type_id AS ship FROM mining_ticks'), [{ qty: 600, ship: VENTURE }]);
    eq('    the ship is kept on the snapshot, from the first read on', db.rows('SELECT ship_type_id AS ship FROM mining_state'), [{ ship: VENTURE }]);
  }

  // An alt: its login is kept under the main's ledger, and every row it makes is under its own ID.
  {
    const { db, env } = await ledgerWithAlt();
    const before = under(db, MAIN);
    let qty = 500;
    const f = stubFetch([[`/characters/${ALT}/mining/`, () => mined(qty, 200)], [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }]]);
    await readMiningRound(env, altReader(MAIN, ALT), T0);
    qty = 900;
    eq('  an alt\'s second read makes its tick', await readMiningRound(env, altReader(MAIN, ALT), T0 + 10 * MIN), 1);
    f.restore();
    eq('    nothing of it is under the main', under(db, MAIN), before);
    eq('    all of it is under the alt', counts(db), { [`records:${ALT}`]: 2, [`revs:${ALT}`]: 1, [`jobs:${ALT}`]: 1, [`mining_state:${ALT}`]: 1, [`mining_ticks:${ALT}`]: 1 });
    eq('    its records carry its own character', db.rows(`SELECT id FROM records WHERE kind = 'mining' ORDER BY id`).map((r) => r.id.split(':')[0]), [String(ALT), String(ALT)]);
    eq('    ESI was asked about the alt only', f.calls.every((c) => c.path.startsWith(`/characters/${ALT}/`)), true);
  }

  // The reader refuses to write for a character its login isn't.
  {
    const { db, env } = await ledgerWithAlt();
    const before = counts(db);
    const f = stubFetch([[/mining|ship/, []]]);
    await rejects('  an alt\'s login asked to write as the main: refused', () => readMiningRound(env, { ledger: MAIN, purpose: `alt:${ALT}`, char: MAIN }, T0), /wrong purpose/);
    await rejects('  the main\'s login asked to write as an alt: refused', () => readMiningRound(env, { ledger: MAIN, purpose: 'main', char: ALT }, T0), /wrong purpose/);
    await keepKey(db, MAIN, 'alt:900002', 900003, 'Someone Else', SCOPES);
    await rejects('  a login kept as one alt that is another character\'s: refused', () => readMiningRound(env, altReader(MAIN, 900002), T0), /is character 900003, not 900002/);
    f.restore();
    eq('    and nothing was written, or asked of ESI', [counts(db), f.calls.length], [before, 0]);
  }

  // After a gap the stored snapshot is a baseline: what grew can't be dated to the last ten minutes.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('INSERT INTO mining_state (char_id, at, data) VALUES (?, ?, ?)', ALT, T0 - 40 * MIN, JSON.stringify({ [`${ALT}:2026-10-01:${SYSTEM}:${VELDSPAR}`]: 100 }));
    const f = stubFetch([[`/characters/${ALT}/mining/`, mined(5000)], [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }]]);
    eq('  a read 40 minutes after the last makes no tick', await readMiningRound(env, altReader(MAIN, ALT), T0), 0);
    f.restore();
    eq('    the snapshot moves on, and the record is kept', [db.rows('SELECT at FROM mining_state')[0].at, db.rows(`SELECT COUNT(*) AS n FROM records WHERE kind = 'mining'`)[0].n, db.rows('SELECT COUNT(*) AS n FROM mining_ticks')[0].n], [T0, 1, 0]);
  }

  // A character that has never mined.
  {
    const { db, env } = await ledgerWithAlt();
    const f = stubFetch([[`/characters/${ALT}/mining/`, []], [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }]]);
    eq('  an empty mining ledger is a read, with nothing to keep', await readMiningRound(env, altReader(MAIN, ALT), T0), 0);
    f.restore();
    eq('    a snapshot and a job, no records', counts(db), { [`jobs:${ALT}`]: 1, [`mining_state:${ALT}`]: 1 });
  }

  // Removed while it was being read: the login is gone by the time there's something to write.
  {
    const { db, env } = await ledgerWithAlt();
    const f = stubFetch([
      [`/characters/${ALT}/mining/`, () => { db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`); return mined(700); }],
      [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }],
    ]);
    eq('  an alt removed mid-read', await readMiningRound(env, altReader(MAIN, ALT), T0), null);
    f.restore();
    eq('    gets no rows back', counts(db), {});
  }

  // The gate is for alts. A main whose login is dropped mid-read ("Stop keeping watch") has that read's rows, as before.
  {
    const { db, env } = await ledgerWithAlt();
    const f = stubFetch([
      [`/characters/${MAIN}/mining/`, () => { db.run('DELETE FROM keys WHERE purpose = ?', 'main'); return mined(700); }],
      [`/characters/${MAIN}/ship/`, { ship_type_id: VENTURE }],
    ]);
    eq('  a main whose login is dropped mid-read is still read', await readMiningRound(env, ledgerReader(MAIN), T0), 0);
    f.restore();
    eq('    and its rows are written', counts(db), { [`records:${MAIN}`]: 1, [`revs:${MAIN}`]: 1, [`jobs:${MAIN}`]: 1, [`mining_state:${MAIN}`]: 1 });
  }

  // The records go up before the snapshot moves: what changed is measured against the snapshot, so one that moved
  // ahead of a failed push would never send those rows again.
  {
    const { db, env } = await ledgerWithAlt();
    // The second write fails: with the snapshot first that is the records' push, after the snapshot moved.
    const real = db.batch; let calls = 0;
    db.batch = async (l) => { if (++calls === 2) throw new Error('D1 down'); return real(l); };
    const f = stubFetch([[`/characters/${ALT}/mining/`, mined(700)], [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }]]);
    await rejects('  a read whose write fails', () => readMiningRound(env, altReader(MAIN, ALT), T0), /D1 down/);
    await readMiningRound(env, altReader(MAIN, ALT), T0 + 10 * MIN);
    f.restore();
    eq('    and the next read still sends the records', db.rows(`SELECT COUNT(*) AS n FROM records WHERE kind = 'mining' AND char_id = ?`, ALT)[0].n, 1);
  }
}

/** ESI's answers for one character: a trade, a journal entry, an open order, a hangar item, a wrap in asset safety. */
function esiFor(char, over = {}) {
  const c = `/characters/${char}`;
  const MINING = 3386, BARGE = 17940;
  return [
    [`${c}/wallet/transactions/`, [{ transaction_id: 11, date: '2026-10-01T10:00:00Z', is_buy: false, quantity: 100, type_id: VELDSPAR, unit_price: 20, location_id: 60003760 }]],
    [`${c}/wallet/journal/`, [{ id: 21, date: '2026-10-01T10:00:00Z', ref_type: 'market_transaction', amount: 2000, balance: 5000, context_id: 11, first_party_id: 1, second_party_id: char }]],
    [`${c}/orders/`, [{ order_id: 31, type_id: SCORDITE, price: 30, volume_total: 10, volume_remain: 10, issued: '2026-10-01T09:00:00Z', location_id: 60003760 }]],
    [`${c}/orders/history/`, []],
    [`${c}/assets/`, [
      { item_id: 5001, type_id: 60, quantity: 1, location_id: 2004, location_flag: 'AssetSafety', location_type: 'other', is_singleton: true },
      { item_id: 5002, type_id: VELDSPAR, quantity: 100, location_id: 5001, location_flag: 'Hangar', location_type: 'item' },
      { item_id: 5003, type_id: SCORDITE, quantity: 10, location_id: 60003760, location_flag: 'Hangar', location_type: 'station' },
    ]],
    [new RegExp(`^POST ${c}/assets/names/$`), []],
    [/^POST \/universe\/names\/$/, [{ id: VELDSPAR, name: 'Veldspar' }, { id: SCORDITE, name: 'Scordite' }]],
    ['/markets/prices/', [{ type_id: VELDSPAR, average_price: 20 }, { type_id: SCORDITE, average_price: 30 }]],
    [`${c}/loyalty/points/`, [{ corporation_id: 1000035, loyalty_points: 1234 }]],
    [`${c}/wallet/`, over.wallet ?? 5000],
    [`${c}/skills/`, { total_sp: 900000, skills: over.skills ?? [
      { skill_id: MINING, trained_skill_level: 5, active_skill_level: 4, skillpoints_in_skill: 256000 },
      { skill_id: BARGE, trained_skill_level: 3, active_skill_level: 0, skillpoints_in_skill: 32000 },
    ] }],
    [`${c}/skillqueue/`, [{ skill_id: MINING, finished_level: 5, queue_position: 0, finish_date: '2026-10-03T00:00:00Z', start_date: '2026-10-01T00:00:00Z' }]],
    [`${c}/attributes/`, { intelligence: 20, memory: 21, perception: 22, willpower: 23, charisma: 19 }],
    // In no order, one of them negative: the sheet keeps them sorted by ID, signs kept.
    [`${c}/standings/`, over.standings ?? [
      { from_id: 3008416, from_type: 'agent', standing: 2.1 },
      { from_id: 1000125, from_type: 'npc_corp', standing: -1.25 },
      { from_id: 500001, from_type: 'faction', standing: 3.63 },
    ]],
    // Two R&D agents, in no order: the sheet keeps them sorted by agent.
    [`${c}/agents_research/`, over.research ?? [
      { agent_id: 3016563, skill_type_id: 11453, started_at: '2026-10-01T12:00:00Z', points_per_day: 50.4, remainder_points: 12.5 },
      { agent_id: 3008416, skill_type_id: 11446, started_at: '2026-09-20T08:30:00Z', points_per_day: 89.6, remainder_points: 0 },
    ]],
    [new RegExp(`^POST /characters/${SENDER}/mail/$`), 777],
  ];
}

console.log('\n--- an alt\'s full read ---');
{
  const { archive } = await import('../worker/src/archive.ts');
  const { readAlt, altReaders, rosterOf, onRoster, isAlt } = await import('../worker/src/alts.ts');
  const { altReader, ledgerReader } = await import('../worker/src/eve.ts');
  const docOf = (db, char, key) => { const r = db.rows('SELECT data FROM docs WHERE char_id = ? AND key = ?', char, key)[0]; return r ? JSON.parse(r.data) : null; };
  const kinds = (db, char) => Object.fromEntries(db.rows('SELECT kind, COUNT(*) AS n FROM records WHERE char_id = ? GROUP BY kind', char).map((r) => [r.kind, r.n]));

  // The main, as it has always been copied, with alert mail on and a sender: the case where an alt's read must stay silent.
  const withSender = async () => {
    const x = await ledgerWithAlt();
    await keepKey(x.db, MAIN, 'mailer', SENDER, 'Postmaster', SCOPES);
    const { push } = await import('../worker/src/sync.ts');
    await push(x.db, MAIN, { records: [], docs: [{ key: 'alerts', d: { on: true, mail: true, quiet: false } }] });
    return x;
  };
  {
    const { db, env } = await withSender();
    const f = stubFetch(esiFor(MAIN));
    const r = await archive(env, ledgerReader(MAIN));
    f.restore();
    eq('  the main\'s copy: a trade, a journal entry, an order, as before', [r.trades, r.journal, r.orders, r.stock], [1, 1, 1, true]);
    eq('    its records are under the main', kinds(db, MAIN), { journal: 1, names: 2, netWorth: 1, orders: 1, txs: 1 });
    eq('    it notes its orders read', db.rows(`SELECT job FROM jobs WHERE char_id = ? ORDER BY job`, MAIN).map((x) => x.job), ['orders']);
    eq('    it hands back the wallet and the points it read', [r.wallet, r.lp], [5000, [{ corporationId: 1000035, points: 1234 }]]);
    eq('    and its wrap in asset safety is still mailed, once', f.calls.filter((c) => c.method === 'POST' && c.path === `/characters/${SENDER}/mail/`).length, 1);
  }

  // A journal entry the cloud already holds, read again with a tax ESI now gives (records kept before the tax was): the
  // archive skipped every entry it held, so it never sent one; now it sends that entry once, and then nothing.
  {
    const { db, env } = await ledgerWithAlt();
    let f = stubFetch(esiFor(MAIN));
    await archive(env, ledgerReader(MAIN));
    f.restore();
    const rev = () => db.rows('SELECT rev FROM revs WHERE char_id = ?', MAIN)[0].rev;
    const stored = () => JSON.parse(db.rows(`SELECT data FROM records WHERE char_id = ? AND kind = 'journal' AND id = '21'`, MAIN)[0].data);
    const rev1 = rev();
    eq('  a journal entry held without a tax', stored().tax ?? null, null);
    const routes = esiFor(MAIN);
    const j = routes.findIndex((r) => r[0] === `/characters/${MAIN}/wallet/journal/`);
    routes[j] = [routes[j][0], routes[j][1].map((x) => ({ ...x, tax: 220, tax_receiver_id: 1000125 }))];
    f = stubFetch(routes);
    const r = await archive(env, ledgerReader(MAIN));
    f.restore();
    eq('    read again with its tax: sent again, carrying it', [r.journal, stored().tax, stored().taxReceiverId, rev() > rev1], [1, 220, 1000125, true]);
    const rev2 = rev();
    f = stubFetch(routes);
    const r3 = await archive(env, ledgerReader(MAIN));
    f.restore();
    eq('    and a read after that sends nothing more', [r3.journal, rev()], [0, rev2]);
  }

  // The push gate is for alts: a main whose login is dropped mid-read has that read's records, as before.
  {
    const { db, env } = await ledgerWithAlt();
    const routes = esiFor(MAIN);
    routes[0] = [`/characters/${MAIN}/wallet/transactions/`, () => { db.run('DELETE FROM keys WHERE purpose = ?', 'main'); return esiFor(MAIN)[0][1]; }];
    const f = stubFetch(routes);
    await archive(env, ledgerReader(MAIN));
    f.restore();
    eq('  a main whose login is dropped mid-copy still gets its records', kinds(db, MAIN), { journal: 1, names: 2, netWorth: 1, orders: 1, txs: 1 });
  }

  {
    const { db, env } = await withSender();
    const before = under(db, MAIN);
    const f = stubFetch(esiFor(ALT));
    const r = await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt\'s read: the same kinds, under the alt', kinds(db, ALT), { journal: 1, names: 2, netWorth: 1, orders: 1, txs: 1 });
    eq('    nothing of it under the main', under(db, MAIN), before);
    eq('    its jobs are the copy and the sheet, not an orders read', db.rows('SELECT job FROM jobs WHERE char_id = ? ORDER BY job', ALT).map((x) => x.job), ['archive', 'sheet']);
    eq('    its wrap is registered', db.rows('SELECT wrap_id FROM safety_seen WHERE char_id = ? AND wrap_id != 0', ALT).map((x) => x.wrap_id), [5001]);
    eq('    and the main is not mailed about it', f.calls.filter((c) => c.method === 'POST' && /\/mail\//.test(c.path)).length, 0);
    eq('    ESI was asked about the alt only', f.calls.filter((c) => /^\/characters\//.test(c.path)).every((c) => c.path.startsWith(`/characters/${ALT}/`)), true);
    const meta = docOf(db, ALT, 'meta');
    eq('    its sheet: usable below trained is Alpha', [r.clone, meta.cloneDetected], ['alpha', 'alpha']);
    eq('    only the capped skills are listed as active', meta.activeSkills, { 3386: 4, 17940: 0 });
    eq('    wallet, points, queue and attributes are there', [meta.walletBalance, meta.lpBalances, meta.skillQueue.length, meta.attributes.memory, meta.totalSp], [5000, [{ corporationId: 1000035, points: 1234 }], 1, 21, 900000]);
    eq('    the first read can\'t say since when', meta.cloneSince ?? null, null);
    eq('    its skills are the trained levels', docOf(db, ALT, 'skills'), { 3386: 5, 17940: 3 });
    eq('    the copy\'s job detail doesn\'t carry the wallet or the points', Object.keys(JSON.parse(db.rows(`SELECT detail FROM jobs WHERE char_id = ? AND job = 'archive'`, ALT)[0].detail)).filter((k) => k === 'wallet' || k === 'lp'), []);
  }

  // Omega again: the cloud saw the change, so it can say since when. And a read that changes nothing pushes nothing.
  {
    const { db, env } = await withSender();
    let f = stubFetch(esiFor(ALT));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    const rev1 = db.rows('SELECT rev FROM revs WHERE char_id = ?', ALT)[0].rev;
    f = stubFetch(esiFor(ALT));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  a read that finds nothing new pushes nothing', db.rows('SELECT rev FROM revs WHERE char_id = ?', ALT)[0].rev, rev1);
    f = stubFetch(esiFor(ALT, { skills: [{ skill_id: 3386, trained_skill_level: 5, active_skill_level: 5 }, { skill_id: 17940, trained_skill_level: 3, active_skill_level: 3 }] }));
    const r = await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    const meta = docOf(db, ALT, 'meta');
    eq('  upgraded: a skill past Alpha\'s cap is usable, so Omega', [r.clone, meta.cloneDetected, meta.activeSkills], ['omega', 'omega', {}]);
    eq('    and the change is dated', typeof meta.cloneSince, 'string');
  }

  // Standings, whole, for the Research tab (which R&D agents an alt can use): filed under the alt, sorted by ID, signs
  // kept, and no read time in the doc, since the sheet pushes the meta doc whenever it reads differently: a time in it
  // would be a new revision every hour. The alt's "read at" is its sheet job's.
  {
    const { db, env } = await withSender();
    const before = under(db, MAIN);
    const rev = () => db.rows('SELECT rev FROM revs WHERE char_id = ?', ALT)[0].rev;
    const sorted = [
      { id: 500001, type: 'faction', standing: 3.63 }, { id: 1000125, type: 'npc_corp', standing: -1.25 }, { id: 3008416, type: 'agent', standing: 2.1 },
    ];
    let f = stubFetch(esiFor(ALT));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt\'s standings: kept whole in its meta, sorted by ID, signs kept, with no read time', docOf(db, ALT, 'meta').standings, { list: sorted });
    eq('    read for the alt only', f.calls.filter((c) => /\/standings\/$/.test(c.path)).map((c) => c.path), [`/characters/${ALT}/standings/`]);
    eq('    nothing of it under the main', under(db, MAIN), before);
    eq('    the main\'s ledger holds no standings of the alt\'s', db.rows(`SELECT COUNT(*) AS n FROM docs WHERE char_id = ? AND data LIKE '%3008416%'`, MAIN)[0].n, 0);
    const rev1 = rev();

    f = stubFetch(esiFor(ALT, { standings: [...esiFor(ALT).find((r) => r[0] === `/characters/${ALT}/standings/`)[1]].reverse() }));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  the same standings read again, in another order: nothing pushed, no new revision', rev(), rev1);

    const routes = esiFor(ALT);
    routes[routes.findIndex((r) => r[0] === `/characters/${ALT}/standings/`)] = [`/characters/${ALT}/standings/`, new Response('{"error":"down"}', { status: 500 })];
    f = stubFetch(routes);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  a standings read that fails leaves them as they were, and pushes nothing', [docOf(db, ALT, 'meta').standings, rev()], [{ list: sorted }, rev1]);
    eq('    and the sheet still counts as read', db.rows(`SELECT fails, last_error AS e FROM jobs WHERE char_id = ? AND job = 'sheet'`, ALT), [{ fails: 0, e: null }]);

    f = stubFetch(esiFor(ALT, { standings: [{ from_id: 1000125, from_type: 'npc_corp', standing: 0.5 }, { from_id: 500001, from_type: 'faction', standing: 3.63 }] }));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  standings that moved go up, replacing the list whole', [docOf(db, ALT, 'meta').standings, rev() > rev1],
      [{ list: [{ id: 500001, type: 'faction', standing: 3.63 }, { id: 1000125, type: 'npc_corp', standing: 0.5 }] }, true]);
    eq('    and the main still has nothing of it', under(db, MAIN), before);
  }

  // A login without the standings permission: nothing asked, and nothing written, so the tab says "Not read yet".
  {
    const { db, env } = await withSender();
    db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', SCOPES.filter((s) => s !== 'esi-characters.read_standings.v1'));
    const f = stubFetch(esiFor(ALT));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt whose login lacks the standings permission: not asked, and no standings in its meta, not an empty list',
      [f.calls.some((c) => /\/standings\/$/.test(c.path)), 'standings' in docOf(db, ALT, 'meta')], [false, false]);
  }

  // R&D agents' research, for the Research tab's cards: filed under the alt, sorted by agent, and no read time in the doc
  // (the meta doc is pushed whenever it reads differently, so a time would be a new revision every hour; the alt's "read
  // at" is its sheet job's). Absent means not read: never an empty list for a read that didn't happen.
  {
    const { db, env } = await withSender();
    const before = under(db, MAIN);
    const rev = () => db.rows('SELECT rev FROM revs WHERE char_id = ?', ALT)[0].rev;
    const sorted = [
      { agentId: 3008416, skillTypeId: 11446, startedAt: '2026-09-20T08:30:00Z', pointsPerDay: 89.6, remainderPoints: 0 },
      { agentId: 3016563, skillTypeId: 11453, startedAt: '2026-10-01T12:00:00Z', pointsPerDay: 50.4, remainderPoints: 12.5 },
    ];
    let f = stubFetch(esiFor(ALT));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt\'s research: kept in its meta, sorted by agent, with no read time', docOf(db, ALT, 'meta').research, { agents: sorted });
    eq('    read for the alt only', f.calls.filter((c) => /\/agents_research\/$/.test(c.path)).map((c) => c.path), [`/characters/${ALT}/agents_research/`]);
    eq('    nothing of it under the main', under(db, MAIN), before);
    eq('    the main\'s ledger holds no research of the alt\'s', db.rows(`SELECT COUNT(*) AS n FROM docs WHERE char_id = ? AND data LIKE '%3016563%'`, MAIN)[0].n, 0);
    const rev1 = rev();

    f = stubFetch(esiFor(ALT, { research: [...esiFor(ALT).find((r) => r[0] === `/characters/${ALT}/agents_research/`)[1]].reverse() }));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  the same research read again, in another order: nothing pushed, no new revision', rev(), rev1);

    const routes = esiFor(ALT);
    routes[routes.findIndex((r) => r[0] === `/characters/${ALT}/agents_research/`)] = [`/characters/${ALT}/agents_research/`, new Response('{"error":"down"}', { status: 500 })];
    f = stubFetch(routes);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  a research read that fails leaves it as it was, and pushes nothing', [docOf(db, ALT, 'meta').research, rev()], [{ agents: sorted }, rev1]);
    eq('    and the sheet still counts as read', db.rows(`SELECT fails, last_error AS e FROM jobs WHERE char_id = ? AND job = 'sheet'`, ALT), [{ fails: 0, e: null }]);

    f = stubFetch(esiFor(ALT, { research: [] }));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  no agents running any more: an empty list goes up (read, "No agents running"), not nothing', [docOf(db, ALT, 'meta').research, rev() > rev1], [{ agents: [] }, true]);
    eq('    and the main still has nothing of it', under(db, MAIN), before);
  }

  // A first read that fails: nothing written, so the tab says "Not read yet", never "No agents running".
  {
    const { db, env } = await withSender();
    const routes = esiFor(ALT);
    routes[routes.findIndex((r) => r[0] === `/characters/${ALT}/agents_research/`)] = [`/characters/${ALT}/agents_research/`, new Response('{"error":"down"}', { status: 500 })];
    const f = stubFetch(routes);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt\'s first research read failing: no research in its meta (not an empty list), the rest of the sheet kept',
      ['research' in docOf(db, ALT, 'meta'), docOf(db, ALT, 'meta').standings?.list.length], [false, 3]);
  }

  // A login handed over before the app asked for the permission: nothing asked, nothing written.
  {
    const { db, env } = await withSender();
    db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', SCOPES.filter((s) => s !== 'esi-characters.read_agents_research.v1'));
    const f = stubFetch(esiFor(ALT));
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt whose login lacks the research permission: not asked, and no research in its meta, not an empty list',
      [f.calls.some((c) => /\/agents_research\/$/.test(c.path)), 'research' in docOf(db, ALT, 'meta')], [false, false]);
  }

  // Removed while the copy was running.
  {
    const { db, env } = await withSender();
    const routes = esiFor(ALT);
    routes[0] = [`/characters/${ALT}/wallet/transactions/`, () => { db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`); return []; }];
    const f = stubFetch(routes);
    await readAlt(env, altReader(MAIN, ALT)).catch(() => undefined);
    f.restore();
    eq('  an alt removed mid-read gets no records, documents or jobs', [kinds(db, ALT), db.rows('SELECT COUNT(*) AS n FROM docs WHERE char_id = ?', ALT)[0].n, db.rows('SELECT COUNT(*) AS n FROM jobs WHERE char_id = ?', ALT)[0].n], [{}, 0, 0]);
    eq('    nor a wrap registered, a revision or anything else under it', under(db, ALT), {});
  }

  // Removed after the copy, while the sheet is being read: the copy's rows stand, the sheet writes nothing.
  {
    const { db, env } = await withSender();
    const routes = esiFor(ALT);
    routes[routes.findIndex((r) => r[0] === `/characters/${ALT}/skills/`)] = [`/characters/${ALT}/skills/`, () => { db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`); return { total_sp: 1, skills: [] }; }];
    const f = stubFetch(routes);
    await readAlt(env, altReader(MAIN, ALT)).catch(() => undefined);
    f.restore();
    eq('  an alt removed while its sheet is read keeps the copy\'s records', kinds(db, ALT), { journal: 1, names: 2, netWorth: 1, orders: 1, txs: 1 });
    eq('    but the sheet wrote no skills or meta, and noted no sheet job', [docOf(db, ALT, 'skills'), docOf(db, ALT, 'meta'), db.rows(`SELECT job FROM jobs WHERE char_id = ? AND job = 'sheet'`, ALT)], [null, null, []]);
  }

  // The roster.
  {
    const { db } = await ledgerWithAlt();
    db.run('INSERT INTO alts (char_id, ledger, name, added_at, removed_at) VALUES (?, ?, ?, ?, ?)', 900002, MAIN, 'Gone', 1, 2);
    eq('  the roster is the alts not removed', (await rosterOf(db, MAIN)).map((a) => [a.charId, a.name]), [[ALT, 'Miner Two']]);
    eq('  on the roster: an alt of this ledger, not removed', [await onRoster(db, MAIN, ALT), await onRoster(db, MAIN, 900002), await onRoster(db, 123, ALT)], [true, false, false]);
    eq('  an alt is an alt, removed or not', [await isAlt(db, ALT), await isAlt(db, 900002), await isAlt(db, MAIN)], [true, true, false]);
    eq('  the alts to read are the ones with a login', await altReaders(db), [{ ledger: MAIN, purpose: `alt:${ALT}`, char: ALT }]);
  }
}

console.log('\n--- handing a login over, and the alt routes ---');
{
  const worker = (await import('../worker/src/index.ts')).default;
  const { useLogin } = await import('../worker/src/eve.ts');
  /** A request as the main, the way a local test stands a character in for the login (DEV_AUTH_CHAR). */
  const ask = async (env, method, path, body) => {
    const res = await worker.fetch(new Request(`http://localhost${path}`, {
      method, headers: { Authorization: 'Bearer dev-token', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    }), env);
    return { status: res.status, body: await res.json() };
  };
  /** EVE's login answering a refresh with a token for `char`; and its revoke. */
  const eve = (char, name, scopes = SCOPES) => [
    [/^POST \/v2\/oauth\/token$/, { access_token: fakeToken(char, name, scopes), refresh_token: `rotated-${char}` }],
    [/^POST \/v2\/oauth\/revoke$/, {}],
  ];
  /** The same, for a login with only the two permissions a sender is asked for in Settings. */
  const eveMail = (char, name) => eve(char, name, MAIL_ONLY);
  const fresh = async () => {
    const db = d1();
    await keepKey(db, MAIN, 'main', MAIN, 'Main', SCOPES);
    await keepKey(db, MAIN, 'mailer', SENDER, 'Postmaster', ['esi-mail.send_mail.v1', 'esi-mail.organize_mail.v1']);
    return { db, env: testEnv(db, { DEV_AUTH_CHAR: String(MAIN) }) };
  };
  const keysOf = (db) => db.rows('SELECT purpose, token_char_id AS c FROM keys WHERE char_id = ? ORDER BY purpose', MAIN).map((k) => `${k.purpose}=${k.c}`);

  // Adding an alt: the three characters EVE's page might hand back.
  {
    const { db, env } = await fresh();
    let f = stubFetch(eve(ALT, 'Miner Two'));
    let r = await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x' });
    f.restore();
    eq('  an alt came back: kept as an alt', [r.status, r.body.kept.as, r.body.kept.charId, r.body.kept.name], [200, 'alt', ALT, 'Miner Two']);
    eq('    its login sits under the main\'s ledger, beside the two that were there', keysOf(db), [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`]);
    eq('    and it is on the roster', db.rows('SELECT char_id AS c, ledger AS l, name, removed_at AS gone FROM alts'), [{ c: ALT, l: MAIN, name: 'Miner Two', gone: null }]);

    f = stubFetch(eve(MAIN, 'Main'));
    r = await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x' });
    f.restore();
    eq('  the main came back: kept as the main\'s login, nothing added', [r.body.kept.as, keysOf(db).length, db.rows('SELECT COUNT(*) AS n FROM alts')[0].n], ['main', 3, 1]);

    f = stubFetch(eve(SENDER, 'Postmaster'));
    r = await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x' });
    f.restore();
    // It used to be "nothing added": the user (19 October 2026) asked for their sender as a character too.
    eq('  the mail sender came back: kept as the sender\'s login, and added to the roster', [r.body.kept.as, r.body.kept.alt, keysOf(db), db.rows('SELECT char_id AS c FROM alts ORDER BY c').map((x) => x.c)], ['mailer', true, [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`], [ALT, SENDER]]);
    eq('    with the permissions it came back with, so mail carries on and it can be read', [db.rows(`SELECT scopes FROM keys WHERE purpose = 'mailer'`)[0].scopes.includes('esi-mail.send_mail.v1'), db.rows(`SELECT scopes FROM keys WHERE purpose = 'mailer'`)[0].scopes.split(' ').length], [true, SCOPES.length]);
  }

  // The reverse slip: a sender login that turns out to be an alt, with only the mail permissions (Settings asks those
  // while the cloud's sender isn't on the roster): it can't read for the alt, so it's refused, as before.
  {
    const { db, env } = await fresh();
    let f = stubFetch(eve(ALT, 'Miner Two'));
    await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x' });
    f.restore();
    f = stubFetch(eveMail(ALT, 'Miner Two'));
    const r = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'y', adding: false });
    f.restore();
    eq('  a sender login for an alt with only the mail permissions is refused, saying what happened', [r.status, /one of your characters, and the login carries only the permissions to send mail/.test(r.body.error), /Hand Miner Two over again/.test(r.body.error)], [400, true, true]);
    eq('    the real sender is left alone', keysOf(db).includes(`mailer=${SENDER}`), true);
    eq('    the alt\'s login is marked refused at once', db.rows('SELECT refused_at IS NOT NULL AS r FROM keys WHERE purpose = ?', `alt:${ALT}`)[0].r, 1);
    eq('    the real sender isn\'t', db.rows(`SELECT refused_at AS r FROM keys WHERE purpose = 'mailer'`)[0].r, null);
    eq('    and the login that can\'t be kept is revoked at EVE', f.calls.some((c) => c.path === '/v2/oauth/revoke'), true);

    // Once removed from the roster, the same character may be the sender.
    f = stubFetch(eveMail(ALT, 'Miner Two'));
    await ask(env, 'DELETE', `/v1/alts/${ALT}?data=keep`);
    const r2 = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'y', adding: false });
    f.restore();
    eq('  a character removed from the roster can be the sender', [r2.status, r2.body.kept.as, r2.body.kept.alt, keysOf(db)], [200, 'mailer', false, [`mailer=${ALT}`, `main=${MAIN}`]]);
  }

  // The main's and the sender's own hand-overs, as before.
  {
    const { db, env } = await fresh();
    let f = stubFetch(eve(ALT, 'Miner Two'));
    const r = await ask(env, 'POST', '/v1/keys', { purpose: 'main', refreshToken: 'x' });
    f.restore();
    eq('  a main login that isn\'t the main is refused, as before', [r.status, /not the character whose ledger this is/.test(r.body.error)], [400, true]);
    f = stubFetch(eve(MAIN, 'Main'));
    const r2 = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'x' });
    f.restore();
    eq('  the main can\'t be its own sender, as before', [r2.status, /the sender has to be your other character/.test(r2.body.error)], [400, true]);
    eq('    and nothing changed', keysOf(db), [`mailer=${SENDER}`, `main=${MAIN}`]);
    eq('  an unknown purpose is refused', (await ask(env, 'POST', '/v1/keys', { purpose: 'owner', refreshToken: 'x' })).status, 400);
  }

  // The archive job's detail is what the copy did, not the sheet's wallet and points.
  {
    const { db, env } = await ledgerWithAlt();
    env.DEV_AUTH_CHAR = String(MAIN);
    const f = stubFetch(esiFor(MAIN));
    const r = await ask(env, 'POST', '/v1/jobs/archive');
    f.restore();
    const detail = JSON.parse(db.rows(`SELECT detail FROM jobs WHERE char_id = ? AND job = 'archive'`, MAIN)[0].detail);
    eq('  the main\'s archive job: noted without the wallet and points', [Object.keys(detail).filter((k) => k === 'wallet' || k === 'lp'), detail.trades], [[], 1]);
    eq('    the route\'s own answer keeps them', r.body.wallet, 5000);
  }

  // Dropping a login names which.
  {
    const { db, env } = await fresh();
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', SCOPES);
    const f = stubFetch(eve(SENDER, 'Postmaster'));
    const bad = [(await ask(env, 'DELETE', `/v1/keys?purpose=alt:${ALT}`)).status, (await ask(env, 'DELETE', '/v1/keys')).status, (await ask(env, 'DELETE', '/v1/keys?purpose=mailr')).status];
    eq('  dropping an alt\'s login, no login or a typo: refused', bad, [400, 400, 400]);
    eq('    and nothing was dropped', keysOf(db), [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`]);
    const r = await ask(env, 'DELETE', '/v1/keys?purpose=mailer');
    eq('  dropping the sender still works, and leaves the main', [r.status, keysOf(db)], [200, [`alt:${ALT}=${ALT}`, `main=${MAIN}`]]);
    const r2 = await ask(env, 'DELETE', '/v1/keys?purpose=main');
    f.restore();
    eq('  and so does the main, when asked for by name', [r2.status, keysOf(db)], [200, [`alt:${ALT}=${ALT}`]]);
  }

  // The two halves of handing an alt over land together.
  {
    const { db, env } = await fresh();
    const { keepHandedOver } = await import('../worker/src/eve.ts');
    const real = db.batch;
    db.batch = async () => { throw new Error('D1 down'); };
    const f = stubFetch(eve(ALT, 'Miner Two'));
    await rejects('  a hand-over whose write fails', () => keepHandedOver(env, MAIN, 'alt', 'x'), /D1 down/);
    f.restore();
    db.batch = real;
    eq('    leaves no login without its roster row', [keysOf(db), db.rows('SELECT COUNT(*) AS n FROM alts')[0].n], [[`mailer=${SENDER}`, `main=${MAIN}`], 0]);
  }

  // What an app version behind sees, and what the alt routes give.
  {
    const { db, env } = await ledgerWithAlt();
    env.DEV_AUTH_CHAR = String(MAIN);
    const { push } = await import('../worker/src/sync.ts');
    await push(db, ALT, { records: [{ k: 'txs', i: 'alt-trade', d: { typeId: VELDSPAR } }], docs: [{ key: 'meta', d: { walletBalance: 5000 } }] });
    await push(db, MAIN, { records: [{ k: 'txs', i: 'main-trade', d: { typeId: SCORDITE } }], docs: [] });
    db.run('INSERT INTO mining_state (char_id, at, data, ship_type_id) VALUES (?, ?, ?, ?)', ALT, T0, '{}', VENTURE);
    db.run('INSERT INTO mining_ticks (char_id, at, system_id, type_id, qty, ship_type_id) VALUES (?, ?, ?, ?, ?, ?)', ALT, Date.now() - MIN, SYSTEM, VELDSPAR, 400, VENTURE);
    db.run('INSERT INTO mining_ticks (char_id, at, system_id, type_id, qty, ship_type_id) VALUES (?, ?, ?, ?, ?, ?)', MAIN, Date.now() - MIN, SYSTEM, VELDSPAR, 999, VENTURE);
    db.run('INSERT INTO jobs (char_id, job, last_run, last_ok) VALUES (?, ?, ?, ?)', ALT, 'mining', T0, T0);

    const status = await ask(env, 'GET', '/v1/status');
    eq('  /v1/status lists only the main\'s and the sender\'s logins', status.body.background.keys.map((k) => k.purpose), ['main']);
    const list = (await ask(env, 'GET', '/v1/alts')).body;
    eq('  the main\'s job list holds none of the alt\'s', status.body.background.jobs, []);
    eq('  /v1/alts: the roster', list.map((a) => [a.charId, a.name, a.rev, a.ship, a.shipAt, a.refusedAt]), [[ALT, 'Miner Two', 1, VENTURE, T0, null]]);
    eq('    with its permissions and its jobs', [list[0].scopes.length, list[0].jobs.map((j) => j.job)], [SCOPES.length, ['mining']]);
    const pulled = (await ask(env, 'GET', `/v1/alts/${ALT}/pull?since=0`)).body;
    eq('  an alt\'s pull is the alt\'s ledger', [pulled.records.map((x) => x.i), pulled.docs.map((x) => x.key), pulled.rev], [['alt-trade'], ['meta'], 1]);
    eq('  the main\'s pull is the main\'s', (await ask(env, 'GET', '/v1/pull?since=0')).body.records.map((x) => x.i), ['main-trade']);
    const ticks = (await ask(env, 'GET', '/v1/alts/mining/ticks?days=30')).body;
    eq('  the alts\' ticks carry their character, and leave the main\'s out', ticks.map((t) => [t.charId, t.qty]), [[ALT, 400]]);

    eq('  a character not on the roster: not found', [(await ask(env, 'GET', '/v1/alts/12345/pull?since=0')).status, (await ask(env, 'GET', `/v1/alts/${MAIN}/pull?since=0`)).status], [404, 404]);
    eq('  an ID that isn\'t a number: not found', [(await ask(env, 'GET', '/v1/alts/abc/pull')).status, (await ask(env, 'GET', '/v1/alts/1;DROP/pull')).status], [404, 404]);
    eq('  a caller that is an alt is refused everything', (await ask({ ...env, DEV_AUTH_CHAR: String(ALT) }, 'GET', '/v1/status')).status, 403);
  }

  // Removing: what is kept and what goes.
  {
    const make = async () => {
      const x = await ledgerWithAlt();
      x.env.DEV_AUTH_CHAR = String(MAIN);
      const { push } = await import('../worker/src/sync.ts');
      await push(x.db, ALT, { records: [{ k: 'txs', i: 't', d: {} }], docs: [{ key: 'meta', d: {} }] });
      x.db.run('INSERT INTO mining_state (char_id, at, data) VALUES (?, ?, ?)', ALT, T0, '{}');
      x.db.run('INSERT INTO mining_ticks (char_id, at, system_id, type_id, qty) VALUES (?, ?, ?, ?, ?)', ALT, T0, SYSTEM, VELDSPAR, 1);
      x.db.run('INSERT INTO jobs (char_id, job, last_run, fails) VALUES (?, ?, ?, ?)', ALT, 'mining', T0, 5);
      x.db.run('INSERT INTO safety_seen (char_id, wrap_id, first_seen, start_known) VALUES (?, ?, ?, ?)', ALT, 0, T0, 1);
      return x;
    };
    let { db, env } = await make();
    let f = stubFetch(eve(ALT, 'Miner Two'));
    eq('  removing an alt', (await ask(env, 'DELETE', `/v1/alts/${ALT}?data=keep`)).body, { removed: ALT, data: 'keep' });
    f.restore();
    eq('    its login is revoked and dropped', [f.calls.some((c) => c.path === '/v2/oauth/revoke'), db.rows('SELECT COUNT(*) AS n FROM keys WHERE purpose LIKE ?', 'alt:%')[0].n], [true, 0]);
    eq('    keeping its data: records stay, the mining baseline and old job streaks go', under(db, ALT), { [`records:${ALT}`]: 1, [`docs:${ALT}`]: 1, [`revs:${ALT}`]: 1, [`mining_ticks:${ALT}`]: 1, [`safety_seen:${ALT}`]: 1 });
    eq('    it is off the roster but still known as an alt', [(await ask(env, 'GET', '/v1/alts')).body, db.rows('SELECT removed_at IS NOT NULL AS gone FROM alts')[0].gone], [[], 1]);
    eq('    and its data can\'t be reached', (await ask(env, 'GET', `/v1/alts/${ALT}/pull?since=0`)).status, 404);

    ({ db, env } = await make());
    f = stubFetch(eve(ALT, 'Miner Two'));
    await ask(env, 'DELETE', `/v1/alts/${ALT}?data=delete`);
    f.restore();
    eq('  deleting its data: only its revision is left, so it never restarts', [under(db, ALT), db.rows('SELECT COUNT(*) AS n FROM alts')[0].n], [{ [`revs:${ALT}`]: 1 }, 0]);
    eq('    and the main is untouched', db.rows('SELECT COUNT(*) AS n FROM keys WHERE purpose = ?', 'main')[0].n, 1);
  }

  // Removing deletes by character ID: never a ledger's own, however it is called.
  {
    const { removeAlt } = await import('../worker/src/alts.ts');
    const { push } = await import('../worker/src/sync.ts');
    const { db, env } = await ledgerWithAlt();
    env.DEV_AUTH_CHAR = String(MAIN);
    await push(db, MAIN, { records: [{ k: 'txs', i: 'main-trade', d: {} }], docs: [{ key: 'stock', d: {} }] });
    db.run('INSERT INTO jobs (char_id, job, last_run) VALUES (?, ?, ?)', MAIN, 'archive', T0);
    const before = counts(db);
    await rejects('  removing the ledger itself, straight', () => removeAlt(env, MAIN, MAIN, 'delete'), /is not an alt of/);
    await rejects('  removing a character that isn\'t on the roster', () => removeAlt(env, MAIN, 12345, 'delete'), /is not an alt of/);
    eq('    the main\'s rows are all still there', [counts(db), db.rows('SELECT COUNT(*) AS n FROM keys')[0].n], [before, 2]);
    eq('  through the route: not found', (await ask(env, 'DELETE', `/v1/alts/${MAIN}?data=delete`)).status, 404);
    eq('    and the main\'s rows are still there', counts(db), before);
  }

  // A refusal that a later refresh clears: what two jobs refreshing one login at once would leave behind.
  {
    const db = d1();
    const env = testEnv(db);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', SCOPES, { expired: true, refusedAt: T0, refused: 'invalid_grant' });
    const f = stubFetch(eve(ALT, 'Miner Two'));
    const login = await useLogin(env, MAIN, `alt:${ALT}`);
    f.restore();
    eq('  a refused login that then refreshes is no longer refused', [login.charId, db.rows('SELECT refused_at AS r, refused FROM keys')[0]], [ALT, { r: null, refused: null }]);
  }

  // The loser of that race: EVE refuses the token it tried, but the row already holds the winner's rotated one.
  {
    const db = d1();
    const env = testEnv(db);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', SCOPES, { expired: true });
    const { seal } = await import('../worker/src/crypto.ts');
    const { TOKEN_KEY } = await import('./d1.mjs');
    let f = stubFetch([[/^POST \/v2\/oauth\/token$/, async () => {
      db.run('UPDATE keys SET refresh_enc = ?', await seal(TOKEN_KEY, 'rotated-by-the-other-job'));
      return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid refresh token' }), { status: 400 });
    }]]);
    await rejects('  a refresh EVE refuses', () => useLogin(env, MAIN, `alt:${ALT}`), /EVE refused/);
    f.restore();
    eq('    is not marked when the row already holds a newer token', db.rows('SELECT refused_at AS r FROM keys')[0].r, null);

    const db2 = d1();
    await keepKey(db2, MAIN, `alt:${ALT}`, ALT, 'Miner Two', SCOPES, { expired: true });
    f = stubFetch([[/^POST \/v2\/oauth\/token$/, new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid refresh token' }), { status: 400 })]]);
    await rejects('  and one that is refused with the row unchanged', () => useLogin(testEnv(db2), MAIN, `alt:${ALT}`), /EVE refused/);
    f.restore();
    eq('    is marked', [db2.rows('SELECT refused_at IS NOT NULL AS r, refused FROM keys')[0]], [{ r: 1, refused: 'Invalid refresh token' }]);
  }
}

console.log('\n--- when alts are read ---');
{
  const worker = (await import('../worker/src/index.ts')).default;
  const { altsMining } = await import('../worker/src/alts.ts');
  const run = async (env, cron) => { const waits = []; await worker.scheduled({ cron }, env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };

  {
    const { db, env } = await ledgerWithAlt();
    const f = stubFetch([[`/characters/${ALT}/mining/`, mined(300)], [`/characters/${ALT}/ship/`, { ship_type_id: VENTURE }]]);
    const r = await altsMining(env, T0);
    f.restore();
    eq('  the alts\' mining round reads each alt with a login', [r, under(db, ALT)], [{ alts: 1, read: 1, failed: 0 }, { [`records:${ALT}`]: 1, [`revs:${ALT}`]: 1, [`jobs:${ALT}`]: 1, [`mining_state:${ALT}`]: 1 }]);
  }

  // A failing alt is noted under the alt and doesn't stop the next.
  {
    const { db, env } = await ledgerWithAlt();
    await keepKey(db, MAIN, 'alt:900002', 900002, 'Miner Three', SCOPES);
    db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', 900002, MAIN, 'Miner Three', Date.now() + 1);
    const f = stubFetch([
      [`/characters/${ALT}/mining/`, new Response(JSON.stringify({ error: 'boom' }), { status: 500 })],
      ['/characters/900002/mining/', mined(50)], ['/characters/900002/ship/', { ship_type_id: VENTURE }],
    ]);
    const r = await altsMining(env, T0);
    f.restore();
    eq('  one alt failing doesn\'t stop the next', r, { alts: 2, read: 1, failed: 1 });
    eq('    and the failure is noted under that alt', db.rows('SELECT char_id AS c, last_error IS NOT NULL AS bad FROM jobs ORDER BY char_id'), [{ c: ALT, bad: 1 }, { c: 900002, bad: 0 }]);
  }
  // The cron, last: before it is matched by name it falls through to the hourly archive and the full-market scan.
  {
    const { db, env } = await ledgerWithAlt();
    // A second alt whose login is gone: on the roster, nothing to read it with.
    db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', 900002, MAIN, 'No Login', Date.now());
    const f = stubFetch([...esiFor(ALT), ...esiFor(MAIN)]);
    await run(env, '37 * * * *');
    f.restore();
    const asked = (char) => f.calls.filter((c) => c.path.startsWith(`/characters/${char}/`)).length;
    eq('  the :37 cron reads the alts, and not the main', [asked(ALT) > 0, asked(MAIN), asked(900002)], [true, 0, 0]);
    eq('    each alt\'s copy and sheet are noted', db.rows('SELECT job FROM jobs WHERE char_id = ? ORDER BY job', ALT).map((x) => x.job), ['archive', 'sheet']);
    eq('    CCP\'s prices are fetched once for the round', f.calls.filter((c) => c.path === '/markets/prices/').length, 1);
    eq('    nothing is noted for the main', db.rows('SELECT COUNT(*) AS n FROM jobs WHERE char_id = ?', MAIN)[0].n, 0);
    eq('    then home prices are asked for, after the alts (stubbed: no network)', f.calls.some((c) => c.path === '/api/price_data/'), true);
  }
}

console.log('\n--- the watchdog, by character ---');
{
  const { watchdog } = await import('../worker/src/watchdog.ts');
  const { push } = await import('../worker/src/sync.ts');
  const setUp = async () => {
    const { db, env } = await ledgerWithAlt();
    await keepKey(db, MAIN, 'mailer', SENDER, 'Postmaster', SCOPES);
    await push(db, MAIN, { records: [], docs: [{ key: 'alerts', d: { on: true, mail: true, quiet: false } }] });
    return { db, env };
  };
  const failing = (db, char, job, error) => db.run('INSERT INTO jobs (char_id, job, last_run, last_error, fails, failing_since) VALUES (?, ?, ?, ?, ?, ?)', char, job, T0, error, 3, T0 - 30 * MIN);
  const mailBody = (f) => { const c = f.calls.find((x) => x.method === 'POST' && x.path === `/characters/${SENDER}/mail/`); return c ? JSON.parse(c.body) : null; };

  // An alt's login refused: its own job mail is quieted, the main's is not.
  {
    const { db, env } = await setUp();
    db.run('UPDATE keys SET refused_at = ?, refused = ? WHERE purpose = ?', T0 - 20 * MIN, 'invalid_grant', `alt:${ALT}`);
    failing(db, ALT, 'mining', 'EVE refused the cloud’s login for Miner Two (invalid_grant); hand the cloud that login again');
    failing(db, MAIN, 'archive', 'ESI 401 on /characters/95210486/wallet/');
    const f = stubFetch([[new RegExp(`^POST /characters/${SENDER}/mail/$`), 555]]);
    const r = await watchdog(env, MAIN, T0);
    f.restore();
    const m = mailBody(f);
    eq('  one mail, to the main', [r.mailed, m?.recipients?.[0]?.recipient_id], [2, MAIN]);
    eq('    it says the alt\'s login was lost, by name', /Cloud lost Miner Two’s login/i.test(m?.body ?? ''), true);
    eq('    and still says the main\'s own job is failing', /Copying your ledger from ESI/.test(m?.body ?? ''), true);
    eq('    the alt\'s job, explained by its login, isn\'t mailed as well', /Reading Miner Two’s mining ledger/.test(m?.body ?? ''), false);
    eq('    the refusal is marked warned on the alt\'s login', db.rows('SELECT refused_warned AS w FROM keys WHERE purpose = ?', `alt:${ALT}`)[0].w, T0);
  }

  // The main's login refused: the alt's failing job is still mailed.
  {
    const { db, env } = await setUp();
    db.run('UPDATE keys SET refused_at = ?, refused = ? WHERE purpose = ?', T0 - 20 * MIN, 'invalid_grant', 'main');
    failing(db, MAIN, 'archive', 'EVE refused the cloud’s login for Main (invalid_grant); hand the cloud your login again');
    failing(db, ALT, 'mining', 'ESI 401 on /characters/900001/mining/');
    const f = stubFetch([[new RegExp(`^POST /characters/${SENDER}/mail/$`), 556]]);
    await watchdog(env, MAIN, T0);
    f.restore();
    const m = mailBody(f);
    eq('  the main\'s lost login quiets the main\'s jobs, not the alt\'s', [/Cloud lost your login/i.test(m?.body ?? ''), /Copying your ledger from ESI/.test(m?.body ?? ''), /Reading Miner Two’s mining ledger/.test(m?.body ?? '')], [true, false, true]);
  }

  // An alt no longer on the roster isn't mailed about.
  {
    const { db, env } = await setUp();
    db.run('UPDATE alts SET removed_at = ? WHERE char_id = ?', T0, ALT);
    failing(db, ALT, 'mining', 'ESI 502');
    const f = stubFetch([[new RegExp(`^POST /characters/${SENDER}/mail/$`), 557]]);
    const r = await watchdog(env, MAIN, T0);
    f.restore();
    eq('  a removed alt\'s old job row is nobody\'s', [r.failing, mailBody(f)], [0, null]);
  }
}

console.log('\n--- the mail sender as one of your characters (19 October 2026) ---');
{
  // The user added their mail sender on the Characters page, to start planetary industry on it, and the app refused it.
  // Now it joins the roster and the cloud reads it with the sender's login: one login does both jobs, since EVE allows a
  // character one set of permissions and refresh tokens rotate.
  const worker = (await import('../worker/src/index.ts')).default;
  const { altLogin, altReaderFor, readerLogin, senderReader, stillKept, keepHandedOver } = await import('../worker/src/eve.ts');
  const { altReaders, altsHourly } = await import('../worker/src/alts.ts');
  const { watchdog, watchdogFindings } = await import('../worker/src/watchdog.ts');
  const { push } = await import('../worker/src/sync.ts');
  const OTHER = 900888;
  const ask = async (env, method, path, body) => {
    const res = await worker.fetch(new Request(`http://localhost${path}`, {
      method, headers: { Authorization: 'Bearer dev-token', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    }), env);
    return { status: res.status, body: await res.json() };
  };
  const eve = (char, name, scopes = SCOPES) => [
    [/^POST \/v2\/oauth\/token$/, { access_token: fakeToken(char, name, scopes), refresh_token: `rotated-${char}` }],
    [/^POST \/v2\/oauth\/revoke$/, {}],
  ];
  /** The main, the sender (Postmaster) with only its two permissions, alert mail on, and Miner Two on the roster with its own login. */
  const setUp = async () => {
    const db = d1();
    await keepKey(db, MAIN, 'main', MAIN, 'Main', SCOPES);
    await keepKey(db, MAIN, 'mailer', SENDER, 'Postmaster', MAIL_ONLY);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', SCOPES);
    db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', ALT, MAIN, 'Miner Two', T0 - 86400_000);
    await push(db, MAIN, { records: [{ k: 'txs', i: 'main-trade', d: {} }], docs: [{ key: 'alerts', d: { on: true, mail: true, quiet: false } }] });
    return { db, env: testEnv(db, { DEV_AUTH_CHAR: String(MAIN) }) };
  };
  const keysOf = (db) => db.rows('SELECT purpose, token_char_id AS c FROM keys WHERE char_id = ? ORDER BY purpose', MAIN).map((k) => `${k.purpose}=${k.c}`);
  const rosterIds = (db) => db.rows('SELECT char_id AS c FROM alts WHERE removed_at IS NULL ORDER BY c').map((x) => x.c);
  const revoked = (f) => f.calls.some((c) => c.path === '/v2/oauth/revoke');
  /** Postmaster added from Characters: EVE's page handed back the cloud's own sender, with every permission. */
  const senderAdded = async () => {
    const x = await setUp();
    const f = stubFetch(eve(SENDER, 'Postmaster'));
    x.r = await ask(x.env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x', adding: true });
    f.restore();
    return x;
  };

  // Adding it from Characters: on the roster, read with the sender's login, which is kept, and no login of its own.
  {
    const { db, env, r } = await senderAdded();
    eq('  the sender added from Characters: kept as the sender and on the roster', [r.status, r.body.kept.as, r.body.kept.alt, r.body.kept.notAdded ?? null], [200, 'mailer', true, null]);
    eq('    no login of its own: the sender\'s does both', keysOf(db), [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`]);
    eq('    the sender\'s login now carries every permission it came back with', db.rows(`SELECT scopes FROM keys WHERE purpose = 'mailer'`)[0].scopes.split(' ').length, SCOPES.length);
    eq('    on the roster', rosterIds(db), [ALT, SENDER]);
    const list = (await ask(env, 'GET', '/v1/alts')).body;
    const it = list.find((a) => a.charId === SENDER);
    eq('    the roster lists its login as the sender\'s, working, and says it sends the mail', [it.sender, it.scopes.length, it.at != null, it.refusedAt], [true, SCOPES.length, true, null]);
    eq('    the other alt isn\'t the sender', list.find((a) => a.charId === ALT).sender, false);
    const status = (await ask(env, 'GET', '/v1/status')).body;
    eq('    the cloud\'s status says the sender is one of your characters', status.background.keys.map((k) => [k.purpose, k.alt]).sort(), [['mailer', true], ['main', false]]);
    eq('    the alts to read: Miner Two with its own login, Postmaster with the sender\'s', await altReaders(db), [{ ledger: MAIN, purpose: `alt:${ALT}`, char: ALT }, { ledger: MAIN, purpose: 'mailer', char: SENDER }]);
    eq('    which login each is read with', [await altLogin(db, MAIN, SENDER), await altLogin(db, MAIN, ALT), await altLogin(db, MAIN, OTHER)], ['mailer', `alt:${ALT}`, null]);
    eq('    as a reader', [await altReaderFor(db, MAIN, SENDER), await altReaderFor(db, MAIN, OTHER)], [{ ledger: MAIN, purpose: 'mailer', char: SENDER }, { ledger: MAIN, purpose: `alt:${OTHER}`, char: OTHER }]);
  }

  // The hourly read: with the sender's login, everything under its own ID, nothing of the main's touched; mail still goes.
  {
    const { db, env } = await senderAdded();
    db.run('DELETE FROM alts WHERE char_id = ?', ALT); // only the sender on the roster: the hourly round reads just it
    const before = under(db, MAIN);
    let f = stubFetch(esiFor(SENDER));
    const r = await altsHourly(env);
    f.restore();
    eq('  the hourly round reads the sender as an alt', r, { alts: 1, read: 1, failed: 0 });
    eq('    its records are under its own ID', Object.fromEntries(db.rows('SELECT kind, COUNT(*) AS n FROM records WHERE char_id = ? GROUP BY kind', SENDER).map((x) => [x.kind, x.n])), { journal: 1, names: 2, netWorth: 1, orders: 1, txs: 1 });
    eq('    its jobs are an alt\'s: the copy and the sheet', db.rows('SELECT job FROM jobs WHERE char_id = ? ORDER BY job', SENDER).map((x) => x.job), ['archive', 'sheet']);
    eq('    nothing of it under the main', under(db, MAIN), before);
    eq('    ESI was asked about the sender only', f.calls.filter((c) => /^\/characters\//.test(c.path)).every((c) => c.path.startsWith(`/characters/${SENDER}/`)), true);
    eq('    and no mail was sent for its read', f.calls.filter((c) => c.method === 'POST' && /\/mail\//.test(c.path)).length, 0);
    // Through the route the app calls right after adding it.
    f = stubFetch(esiFor(SENDER));
    const routed = await ask(env, 'POST', `/v1/alts/${SENDER}/read`);
    f.restore();
    eq('    a read asked for now uses the same login', [routed.status, f.calls.filter((c) => /^\/characters\//.test(c.path)).every((c) => c.path.startsWith(`/characters/${SENDER}/`))], [200, true]);
    // The watchdog's mail about the main's failing job goes out from it, as ever.
    db.run('INSERT INTO jobs (char_id, job, last_run, last_error, fails, failing_since) VALUES (?, ?, ?, ?, ?, ?)', MAIN, 'archive', T0, 'ESI 502', 3, T0 - 30 * MIN);
    f = stubFetch([[new RegExp(`^POST /characters/${SENDER}/mail/$`), 901]]);
    const w = await watchdog(env, MAIN, T0);
    f.restore();
    const sent = f.calls.find((c) => c.method === 'POST' && c.path === `/characters/${SENDER}/mail/`);
    eq('    mail still goes out from it, to the main', [w.mailed, sent ? JSON.parse(sent.body).recipients[0].recipient_id : null], [1, MAIN]);
  }

  // The guard: a reader on the sender's login writes only for the character that login is.
  {
    const { db, env } = await senderAdded();
    const before = counts(db);
    await rejects('  a sender reader for a character the sender isn\'t', () => readerLogin(env, senderReader(MAIN, ALT)), new RegExp(`is character ${SENDER}, not ${ALT}`));
    await rejects('    nor the main itself', () => readerLogin(env, senderReader(MAIN, MAIN)), /wrong purpose/);
    eq('    nothing was written', counts(db), before);
    eq('  still kept while it\'s the sender and on the roster', [await stillKept(db, senderReader(MAIN, SENDER)), await stillKept(db, senderReader(MAIN, ALT))], [true, false]);
  }

  // With only the two mail permissions, adding it does nothing, and says why.
  {
    const { db } = await setUp();
    const env = testEnv(db, { DEV_AUTH_CHAR: String(MAIN) });
    let f = stubFetch(eve(SENDER, 'Postmaster', MAIL_ONLY));
    const r = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'x', adding: true });
    f.restore();
    eq('  the sender added with only the mail permissions: still the sender, not added, and said', [r.status, r.body.kept.as, r.body.kept.alt, r.body.kept.notAdded], [200, 'mailer', false, 'mailOnly']);
    eq('    the roster is as it was, and the sender kept', [rosterIds(db), keysOf(db)], [[ALT], [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`]]);
    // An app version behind says nothing of adding: the scopes do. Its Settings hand-over asks only the two.
    f = stubFetch(eve(SENDER, 'Postmaster', MAIL_ONLY));
    const old = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'x' });
    f.restore();
    eq('  an app version behind, its plain sender hand-over: the sender, nothing added, nothing said', [old.body.kept.as, old.body.kept.alt, old.body.kept.notAdded ?? null, rosterIds(db)], ['mailer', false, null, [ALT]]);
    // A new app's Settings asks every permission while the sender is on the roster: that says nothing of adding.
    f = stubFetch(eve(SENDER, 'Postmaster'));
    const plain = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'x', adding: false });
    f.restore();
    eq('  "Let the cloud send alert mail" with every permission: the sender, never added', [plain.body.kept.alt, rosterIds(db)], [false, [ALT]]);
    // Its alt hand-over sent as the sender (this browser's sender picked on EVE's page) asks every permission: added.
    f = stubFetch(eve(SENDER, 'Postmaster'));
    const oldAdd = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'x' });
    f.restore();
    eq('  an app version behind, adding its sender as a character: added, as was asked', [oldAdd.body.kept.alt, rosterIds(db), keysOf(db)], [true, [ALT, SENDER], [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`]]);
  }

  // A roster alt handed over as the sender with every permission: the sender now, still on the roster, its own login gone.
  {
    const { db, env } = await setUp();
    const addedAt = db.rows('SELECT added_at AS t FROM alts WHERE char_id = ?', ALT)[0].t;
    // Proof first: a hand-over EVE refuses changes nothing, and leaves the alt's own login in place.
    let f = stubFetch([[/^POST \/v2\/oauth\/token$/, new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })]]);
    const bad = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'x', adding: false });
    f.restore();
    eq('  a sender hand-over EVE refuses: nothing changes', [bad.status, keysOf(db)], [400, [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`]]);
    // And one whose write fails leaves the alt's own login too: the two land together or not at all.
    const real = db.batch;
    db.batch = async () => { throw new Error('D1 down'); };
    f = stubFetch(eve(ALT, 'Miner Two'));
    await rejects('  a sender hand-over whose write fails', () => keepHandedOver(env, MAIN, 'mailer', 'x', false), /D1 down/);
    f.restore();
    db.batch = real;
    eq('    leaves the alt\'s own login where it was', keysOf(db), [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`]);
    f = stubFetch(eve(ALT, 'Miner Two'));
    const r = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'x', adding: false });
    f.restore();
    eq('  a roster alt as the sender, with every permission: accepted, still on the roster', [r.status, r.body.kept.as, r.body.kept.alt, rosterIds(db)], [200, 'mailer', true, [ALT]]);
    eq('    its own login is gone, the sender\'s reads it', [keysOf(db), await altReaders(db)], [[`mailer=${ALT}`, `main=${MAIN}`], [{ ledger: MAIN, purpose: 'mailer', char: ALT }]]);
    eq('    nothing was revoked at EVE', revoked(f), false);
    eq('    its stay on the roster is the same one', db.rows('SELECT added_at AS t FROM alts WHERE char_id = ?', ALT)[0].t, addedAt);
  }

  // Removing it from Characters: the reads stop, the mail goes on.
  for (const data of ['keep', 'delete']) {
    const { db, env } = await senderAdded();
    const f = stubFetch(eve(SENDER, 'Postmaster'));
    const r = await ask(env, 'DELETE', `/v1/alts/${SENDER}?data=${data}`);
    f.restore();
    eq(`  removing the sender from Characters (${data} its data): off the roster`, [r.status, rosterIds(db), (await ask(env, 'GET', '/v1/alts')).body.map((a) => a.charId)], [200, [ALT], [ALT]]);
    eq('    the sender\'s login stays, and nothing was revoked', [keysOf(db), revoked(f)], [[`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`], false]);
    eq('    and nothing reads it any more', [(await altReaders(db)).map((x) => x.char), await stillKept(db, senderReader(MAIN, SENDER))], [[ALT], false]);
    // Added again: the roster's own rules for a stay (after "keep" the same stay, after "delete" a new one).
    const was = db.rows('SELECT added_at AS t FROM alts WHERE char_id = ?', SENDER)[0]?.t ?? null;
    const g = stubFetch(eve(SENDER, 'Postmaster'));
    const again = await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'z', adding: true });
    g.restore();
    const stay = db.rows('SELECT added_at AS t, removed_at AS gone FROM alts WHERE char_id = ?', SENDER)[0];
    eq(`    added again: on the roster, read with the sender's login, ${data === 'keep' ? 'the same stay' : 'a new stay'}`,
      [again.body.kept.alt, stay.gone, data === 'keep' ? stay.t === was : was === null && stay.t > 0, (await altReaders(db)).map((x) => [x.char, x.purpose])], [true, null, true, [[ALT, `alt:${ALT}`], [SENDER, 'mailer']]]);
  }

  // A different sender later: the old one stays a character, with no login; handed over on Characters it gets its own.
  {
    const { db, env } = await senderAdded();
    let f = stubFetch(eve(OTHER, 'New Post'));
    const r = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'x', adding: false });
    f.restore();
    eq('  a new sender for another character: kept as the sender, not added', [r.body.kept.as, r.body.kept.alt, keysOf(db), rosterIds(db)], ['mailer', false, [`alt:${ALT}=${ALT}`, `mailer=${OTHER}`, `main=${MAIN}`], [ALT, SENDER]]);
    const old = (await ask(env, 'GET', '/v1/alts')).body.find((a) => a.charId === SENDER);
    eq('    the old sender stays on the roster with no login, and isn\'t the sender', [old.at, old.refusedAt, old.scopes, old.sender], [null, null, [], false]);
    eq('    and isn\'t read', (await altReaders(db)).map((x) => x.char), [ALT]);
    f = stubFetch(eve(SENDER, 'Postmaster'));
    const back = await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'y', adding: true });
    f.restore();
    eq('    handed over again on Characters: an ordinary login of its own', [back.body.kept.as, keysOf(db)], ['alt', [`alt:${ALT}=${ALT}`, `alt:${SENDER}=${SENDER}`, `mailer=${OTHER}`, `main=${MAIN}`]]);
  }

  // EVE refuses the sender's login: the alt reads as refused, and the watchdog has one refusal, not two.
  {
    const { db, env } = await senderAdded();
    db.run(`UPDATE keys SET refused_at = ?, refused = ? WHERE purpose = 'mailer'`, T0 - 20 * MIN, 'invalid_grant');
    db.run('INSERT INTO jobs (char_id, job, last_run, last_error, fails, failing_since) VALUES (?, ?, ?, ?, ?, ?)', SENDER, 'archive', T0, 'EVE refused the cloud’s login for Postmaster (invalid_grant); hand the cloud your login again', 3, T0 - 30 * MIN);
    db.run('INSERT INTO jobs (char_id, job, last_run, last_error, fails, failing_since) VALUES (?, ?, ?, ?, ?, ?)', ALT, 'mining', T0, 'ESI 401 on /characters/900001/mining/', 3, T0 - 30 * MIN);
    const it = (await ask(env, 'GET', '/v1/alts')).body.find((a) => a.charId === SENDER);
    eq('  the sender\'s login refused: the roster shows that alt refused too', [it.refusedAt, it.refused, it.sender], [T0 - 20 * MIN, 'invalid_grant', true]);
    const w = await watchdogFindings(db, MAIN, T0);
    eq('    one refused login, the sender\'s', w.refused.map((k) => [k.purpose, k.char]), [['mailer', SENDER]]);
    eq('    which can\'t be mailed, and no second finding for the alt', w.lost.length, 0);
    eq('    its own failing read is quieted by it; another alt\'s isn\'t', w.due.map((x) => x.r.char_id), [ALT]);
  }

  // Everything else an alt's login does: a structure search as the sender, with the sender's login.
  {
    const { db, env } = await setUp();
    const STRUCT = ['esi-search.search_structures.v1', 'esi-universe.read_structures.v1'];
    let f = stubFetch(eve(SENDER, 'Postmaster', [...SCOPES, ...STRUCT]));
    await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x', adding: true });
    f.restore();
    f = stubFetch([[`/characters/${SENDER}/search/`, { structure: [] }]]);
    const r = await ask(env, 'POST', '/v1/structures/search', { char: SENDER, q: 'Keepstar' });
    f.restore();
    eq('  a structure search as the sender uses the sender\'s login', [r.status, r.body.found, f.calls.map((c) => c.path)], [200, [], [`/characters/${SENDER}/search/`]]);
  }
}

console.log('\n--- the alert round judges a plan\'s order by its plan (Praxis, 30 September 2026) ---');
{
  const { judgeAll } = await import('../worker/src/alerts.ts');
  const { orderFindings } = await import('../src/lib/alerts.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/plan-review.json', import.meta.url), 'utf8'));
  const M = 1e6, PX = 47466, ID = 7433389018, NOW = Date.parse('2026-09-30T22:49:00Z');
  const settings = sanitizeSettings({ acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, target: 5, share: 7.5, waitHours: 3 });
  const plan = { id: 'mundr0gwk1vekg', name: '30 Sept · 991.64 M ISK in 4 items', at: '2026-09-30T00:41:37.568Z', isk: 991640000, horizonDays: 7, patient: false,
    items: [{ typeId: PX, buyAt: 206.3 * M, units: 1, sellAt: 226 * M, positionId: 'mundr0gxt6lx47' }] };
  // The order at its third raise: 207.1 M after two changes, 40 bid at 208.3 M ahead of it, listings at 225 M.
  const ledger = ({ plans, status = 'open', openedAt = plan.at } = {}) => {
    const db = d1();
    const seen = [['00:42:35', 206.3], ['08:39:24', 206.7], ['11:22:15', 207.1]].map(([t, p]) => ({ issued: `2026-09-30T${t}Z`, price: p * M, remain: 1 }));
    db.run('INSERT INTO records (char_id, kind, id, data, rev, updated_at) VALUES (?, ?, ?, ?, 1, 0)', MAIN, 'orders', String(ID), JSON.stringify({
      orderId: ID, typeId: PX, isBuy: true, price: 207.1 * M, volumeTotal: 1, volumeRemain: 1, issued: '2026-09-30T11:22:15Z', state: 'open', locationId: 60003760, escrow: 207.1 * M, seen }));
    db.run('INSERT INTO records (char_id, kind, id, data, rev, updated_at) VALUES (?, ?, ?, ?, 1, 0)', MAIN, 'positions', 'mundr0gxt6lx47', JSON.stringify({
      id: 'mundr0gxt6lx47', typeId: PX, openedAt, status, jitaOnly: true, excluded: [], included: [] }));
    if (plans !== undefined) db.run('INSERT INTO docs (char_id, key, data, rev, updated_at) VALUES (?, ?, ?, 1, 0)', MAIN, 'plans', JSON.stringify(plans));
    const book = [[ID, 1, 207.1 * M, 1], [1, 1, 208.3 * M, 40], [2, 1, 200 * M, 5], [3, 0, 225 * M, 2], [4, 0, 230 * M, 10]];
    db.run('INSERT INTO books (type_id, stamp, orders, sold, at) VALUES (?, ?, ?, ?, ?)', PX, NOW, JSON.stringify(book), null, NOW - 60_000);
    db.run('INSERT INTO hist (type_id, expires, rows) VALUES (?, ?, ?)', PX, NOW + 86400_000, JSON.stringify(fx[PX].rows));
    return db;
  };
  const judged = async (db) => {
    const { list } = await judgeAll(db, MAIN, settings, NOW);
    return { x: list[0], found: orderFindings(list, () => 'Praxis').map((f) => f.kind) };
  };
  const withPlan = await judged(ledger({ plans: [plan] }));
  eq('  with its plan in D1: keep it at 207.1 M, and no "move" alert', [withPlan.x?.verdict, withPlan.x?.keep?.at, withPlan.x?.plan?.planId, withPlan.found], ['loss', 208.4 * M, plan.id, []]);
  eq('    its words end "Keep it at 207,100,000"', /Keep it at 207,100,000$/.test(withPlan.x?.why ?? ''), true);
  const noDoc = await judged(ledger());
  eq('  with no plans doc, as before: moved and mailed', [noDoc.x?.verdict, noDoc.x?.newPrice, noDoc.x?.plan, noDoc.found], ['move', 208.4 * M, undefined, ['move']]);
  const closed = await judged(ledger({ plans: [plan], status: 'closed' }));
  eq('  a plan whose position closed is no plan', [closed.x?.verdict, closed.x?.plan], ['move', undefined]);
  const odd = await judged(ledger({ plans: { not: 'a list' } }));
  eq('  a plans doc it can\'t read is no plan, never an error', [odd.x?.verdict, odd.found], ['move', ['move']]);
  // A positions row that doesn't parse, or parses to nothing, is skipped; the plan's own position still counts.
  const broken = ledger({ plans: [plan] });
  broken.run('INSERT INTO records (char_id, kind, id, data, rev, updated_at) VALUES (?, ?, ?, ?, 1, 0)', MAIN, 'positions', 'bad', '{not json');
  broken.run('INSERT INTO records (char_id, kind, id, data, rev, updated_at) VALUES (?, ?, ?, ?, 1, 0)', MAIN, 'positions', 'nul', 'null');
  const survived = await judged(broken);
  eq('  a broken positions row is skipped, never the round', [survived.x?.verdict, survived.x?.plan?.planId], ['loss', plan.id]);
  // A plan item skipped on the checklist (the market had moved) is no plan's until a bid counts as placing it: the round
  // reads the skipped items' orders, any state, to tell (the plans review's fixes, 9 October 2026). A plan started at 02:00,
  // after Praxis's bid was first placed (00:42:35), its position opened then: the bid isn't the plan's placement.
  const skip = { at: '2026-09-30T02:10:00Z', bestBuy: 208.3 * M, bestSell: 225 * M };
  const late = { ...plan, at: '2026-09-30T02:00:00Z' };
  const lateHeld = await judged(ledger({ plans: [late], openedAt: late.at }));
  eq('  a plan holding it, not skipped: guarded by the plan', [lateHeld.x?.verdict, lateHeld.x?.plan?.planId], ['loss', plan.id]);
  const lateSkipped = await judged(ledger({ plans: [{ ...late, items: [{ ...late.items[0], skipped: skip }] }], openedAt: late.at }));
  eq('  skipped, nothing placed for it since: no plan, judged as any order and mailed', [lateSkipped.x?.verdict, lateSkipped.x?.plan, lateSkipped.found], ['move', undefined, ['move']]);
  const placedSince = await judged(ledger({ plans: [{ ...plan, items: [{ ...plan.items[0], skipped: skip }] }] }));
  eq('  skipped, but its bid counts as placing it: the plan’s again', [placedSince.x?.verdict, placedSince.x?.plan?.planId], ['loss', plan.id]);

  // Leave alone belongs to a plan's own orders (the plans review, 9 October 2026): with `leaveFrom`, an item a
  // Place-and-leave plan left is left only for orders first placed since its start. Praxis's bid was placed at 00:42:35
  // and raised twice since, so `issued` (11:22:15) is after a plan started at 08:00, and its first version isn't.
  const leftLedger = (from) => {
    const db = ledger();
    db.run('INSERT INTO docs (char_id, key, data, rev, updated_at) VALUES (?, ?, ?, 1, 0)', MAIN, 'leave', JSON.stringify([PX]));
    if (from !== undefined) db.run('INSERT INTO docs (char_id, key, data, rev, updated_at) VALUES (?, ?, ?, 1, 0)', MAIN, 'leaveFrom', JSON.stringify(from));
    return db;
  };
  const byHand = await judged(leftLedger());
  eq('  left with no `leaveFrom` doc (an app version behind, or by hand): left, as before, and not mailed', [byHand.x?.left, byHand.found], [true, []]);
  const since = await judged(leftLedger({ [PX]: '2026-09-30T00:41:37.568Z' }));
  eq('  left by a plan that started before it was placed: left', since.x?.left, true);
  const before = await judged(leftLedger({ [PX]: '2026-09-30T08:00:00Z' }));
  eq('  left by a plan that started after it was first placed: judged as any order, moved and mailed', [before.x?.left, before.x?.verdict, before.found], [false, 'move', ['move']]);
  const unreadable = await judged(leftLedger({ not: 'a time', [PX]: 12 }));
  eq('  a `leaveFrom` doc it can\'t read is no time, never an error', unreadable.x?.left, true);
}

console.log('\n--- the alert round judges a left order on the days since it was placed (the plans review, 9 October 2026) ---');
{
  // A Place-and-leave bid of 100, first placed on 2 October and raised to it on 7 October; trading's daily lows reached 95
  // on the 7 days before it was placed and 104 to 110 on the 7 since. The round used to read "reached on 7 of the last 14
  // days" and say nothing; now it's judged on the days since it was placed, moved to 104 and mailed as any move.
  const { judgeAll } = await import('../worker/src/alerts.ts');
  const { orderFindings } = await import('../src/lib/alerts.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const T = 62404, ID = 7435096529, NOW = Date.parse('2026-10-09T15:08:00Z');
  const settings = sanitizeSettings({ acc: 5, br: 5, abr: 5, clone: 'omega', override: true, brokerPct: 1, taxPct: 3, target: 5 });
  const rows = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(Date.parse('2026-09-25T00:00:00Z') + i * 86400_000).toISOString().slice(0, 10);
    return { date, average: 112, highest: 116, lowest: i < 7 ? 95 : 104 + (i - 7), volume: 1000, order_count: 20 };
  });
  const ledger = (first) => {
    const db = d1();
    const seen = [{ issued: first, price: 99, remain: 1000 }, { issued: '2026-10-07T12:00:00Z', price: 100, remain: 1000 }];
    db.run('INSERT INTO records (char_id, kind, id, data, rev, updated_at) VALUES (?, ?, ?, ?, 1, 0)', MAIN, 'orders', String(ID), JSON.stringify({
      orderId: ID, typeId: T, isBuy: true, price: 100, volumeTotal: 1000, volumeRemain: 1000, issued: '2026-10-07T12:00:00Z', state: 'open', locationId: 60003760, escrow: 100_000, seen }));
    db.run('INSERT INTO docs (char_id, key, data, rev, updated_at) VALUES (?, ?, ?, 1, 0)', MAIN, 'leave', JSON.stringify([T]));
    db.run('INSERT INTO books (type_id, stamp, orders, sold, at) VALUES (?, ?, ?, ?, ?)', T, NOW, JSON.stringify([[ID, 1, 100, 1000], [1, 1, 103, 500], [2, 0, 121, 300]]), null, NOW - 60_000);
    db.run('INSERT INTO hist (type_id, expires, rows) VALUES (?, ?, ?)', T, NOW + 86400_000, JSON.stringify(rows));
    return db;
  };
  const left = await judgeAll(ledger('2026-10-02T15:40:00Z'), MAIN, settings, NOW);
  const x = left.list[0];
  const found = orderFindings(left.list, () => 'Compressed Fullerite-C32');
  eq('  placed 2 October, not reached on any of the 7 days since: moved to 104, said so, and mailed as a move', [x?.left, x?.verdict, x?.newPrice, x?.since, found.map((f) => f.key)],
    [true, 'move', 104, { days: 7, traded: 7, reach: 0, to: 'since' }, [`move:${ID}:104`]]);
  eq('    in the words Orders and To do use', found[0]?.text.startsWith('Compressed Fullerite-C32 buy order: not reached on any of the 7 days since you placed it; today’s best bid is 3.0% over'), true);
  eq('    the 14 days’ count is kept as it was, and so is the pace Place and leave is checked against', [x?.reach, left.pace?.[ID] > 0], [7, true]);
  const fresh = await judgeAll(ledger('2026-10-07T12:00:00Z'), MAIN, settings, NOW);
  eq('  first placed on 7 October: two days, nothing new, nothing mailed', [fresh.list[0]?.verdict, fresh.list[0]?.since, orderFindings(fresh.list, () => 'x')], ['wait', undefined, []]);
}

console.log('\n--- the Sniper leaves blueprints out of the mail unless asked ---');
{
  const { sniperRound } = await import('../worker/src/snipe.ts');
  const { push } = await import('../worker/src/sync.ts');
  const JITA = 60003760, NOW = Date.parse('2026-10-02T09:01:00Z');
  // From the cloud's read of 1 October 2026: a module (Small Focused Anode Particle Stream I, group 53, category 7), an
  // Epithal Blueprint (group 108, category 9), and a Medium AutoCannon Battery whose type ESI won't describe this round.
  // And high bids for what the ledger holds in Jita (invented for the test): a Thrasher Blueprint (group 487, category 9)
  // and a Tracking Speed Script (group 907, category 8).
  const ANODE = 6721, EPITHAL = 990, BATTERY = 17771, THRASHER = 16243, SCRIPT = 29001;
  const db = d1();
  const env = testEnv(db);
  await keepKey(db, MAIN, 'main', MAIN, 'Main', SCOPES);
  await keepKey(db, MAIN, 'mailer', SENDER, 'Postmaster', SCOPES);
  const alerts = (more = {}) => push(db, MAIN, { records: [], docs: [{ key: 'alerts', d: { on: true, mail: true, quiet: false, snipeMinIsk: 1e6, snipeMinPct: 5, ...more } }] });
  await alerts();
  await push(db, MAIN, { records: [], docs: [{ key: 'stock', d: { at: new Date(NOW - 10 * MIN).toISOString(), jita: { [THRASHER]: 2, [SCRIPT]: 3000 }, total: { [THRASHER]: 2, [SCRIPT]: 3000 }, inContainers: 0 } }] });
  const stats = (fair, perDay) => JSON.stringify({ highs14: Array(14).fill(fair), unitsPerDay: perDay, daysTraded: 30, lastMove: 0 });
  for (const [t, fair, perDay] of [[ANODE, 98_935, 100], [EPITHAL, 8_479_000, 3], [BATTERY, 3_990_000, 4], [THRASHER, 12_000_000, 3], [SCRIPT, 12_360, 2544]]) db.run('INSERT INTO scan_items (type_id, stats, book, orders, run) VALUES (?, ?, ?, ?, ?)', t, stats(fair, perDay), '{}', 2, 1);
  // Each item's Jita sells: the cheap order, priced ten minutes before, then the next listing up.
  const sell = (id, type, price, volume) => ({ order_id: id, type_id: type, location_id: JITA, is_buy_order: false, price, volume_remain: volume, volume_total: volume, issued: new Date(NOW - 10 * MIN).toISOString(), duration: 90, min_volume: 1 });
  const buy = (id, type, price, volume) => ({ ...sell(id, type, price, volume), is_buy_order: true });
  const book = [sell(1, ANODE, 58_730, 133), sell(2, ANODE, 98_860, 50), sell(3, EPITHAL, 6_400_000, 8), sell(4, EPITHAL, 8_474_000, 3), sell(5, BATTERY, 3_000_000, 6), sell(6, BATTERY, 4_798_000, 2),
    buy(7, THRASHER, 13_500_000, 2), buy(8, SCRIPT, 14_500, 5000)];
  const names = { [ANODE]: 'Small Focused Anode Particle Stream I', [EPITHAL]: 'Epithal Blueprint', [BATTERY]: 'Medium AutoCannon Battery', [THRASHER]: 'Thrasher Blueprint', [SCRIPT]: 'Tracking Speed Script' };
  const routes = (mailId) => [
    ['/markets/10000002/orders/', book],
    [`/universe/types/${ANODE}/`, { type_id: ANODE, name: names[ANODE], group_id: 53 }],
    [`/universe/types/${EPITHAL}/`, { type_id: EPITHAL, name: names[EPITHAL], group_id: 108 }],
    [`/universe/types/${THRASHER}/`, { type_id: THRASHER, name: names[THRASHER], group_id: 487 }],
    [`/universe/types/${SCRIPT}/`, { type_id: SCRIPT, name: names[SCRIPT], group_id: 907 }],
    ['/universe/groups/53/', { group_id: 53, category_id: 7 }],
    ['/universe/groups/108/', { group_id: 108, category_id: 9 }],
    ['/universe/groups/487/', { group_id: 487, category_id: 9 }],
    ['/universe/groups/907/', { group_id: 907, category_id: 8 }],
    [/^POST \/universe\/names\/$/, (u, init) => JSON.parse(init.body).map((id) => ({ id, name: names[id], category: 'inventory_type' }))],
    [new RegExp(`^POST /characters/${SENDER}/mail/$`), mailId],
  ];
  const mailOf = (f) => { const c = f.calls.find((x) => x.method === 'POST' && x.path === `/characters/${SENDER}/mail/`); return c ? JSON.parse(c.body).body : ''; };

  let f = stubFetch(routes(801));
  const r1 = await sniperRound(env, NOW);
  f.restore();
  const read = JSON.parse(db.rows(`SELECT data FROM scan_meta WHERE key = 'snipes'`)[0].data);
  eq('  every listing carries its category, null where ESI didn\'t say', Object.fromEntries(read.listings.map((l) => [l.typeId, l.category])), { [ANODE]: 7, [EPITHAL]: 9, [BATTERY]: null });
  eq('  every held bid carries its category too', Object.fromEntries(read.bids.map((b) => [b.typeId, b.category])), { [THRASHER]: 9, [SCRIPT]: 8 });
  eq('    what was read is kept: type, group, category', db.rows('SELECT type_id AS t, group_id AS g, category_id AS c FROM type_kinds ORDER BY type_id'),
    [{ t: EPITHAL, g: 108, c: 9 }, { t: ANODE, g: 53, c: 7 }, { t: THRASHER, g: 487, c: 9 }, { t: SCRIPT, g: 907, c: 8 }]);
  eq('  off (the default), the mail names the module, not the blueprint, nor the one not known yet', [mailOf(f).includes(names[ANODE]), mailOf(f).includes(names[EPITHAL]), mailOf(f).includes(names[BATTERY])], [true, false, false]);
  eq('    and the high bid for the script you hold, not the one for the blueprint you hold', [r1.mailed[MAIN], mailOf(f).includes(names[SCRIPT]), mailOf(f).includes(names[THRASHER])], [2, true, false]);

  await alerts({ snipeBlueprints: true });
  f = stubFetch(routes(802));
  const r2 = await sniperRound(env, NOW + 5 * MIN);
  f.restore();
  eq('  switched on, the blueprint is mailed, and the one not known yet with it', [mailOf(f).includes(names[EPITHAL]), mailOf(f).includes(names[BATTERY])], [true, true]);
  eq('    and the high bid for the blueprint you hold', [r2.mailed[MAIN], mailOf(f).includes(names[THRASHER])], [3, true]);
  eq('    the next round asks ESI only for the type it couldn\'t read', f.calls.filter((c) => c.path.startsWith('/universe/types/') || c.path.startsWith('/universe/groups/')).map((c) => c.path), [`/universe/types/${BATTERY}/`]);
}

console.log('\n--- a high bid for what you hold: once per item, however the bids move, under its own switch (13 October 2026) ---');
{
  // The user's spam (13 October 2026): "sell Mutated Blood Sample into a high bid" every five minutes from 18:36 UTC. The
  // cloud's alert_log showed a new key each round, `snipebid:<order>@<price>`, as a bid war moved the best bid from 81,690 to
  // 84,000 across seven orders. Here the same war on a Tracking Speed Script held in Jita (the bids invented for the test).
  const { sniperRound } = await import('../worker/src/snipe.ts');
  const { push } = await import('../worker/src/sync.ts');
  const JITA = 60003760, NOW = Date.parse('2026-10-13T18:36:00Z');
  const ANODE = 6721, SCRIPT = 29001;
  const names = { [ANODE]: 'Small Focused Anode Particle Stream I', [SCRIPT]: 'Tracking Speed Script' };
  const ledger = async (alerts) => {
    const db = d1();
    await keepKey(db, MAIN, 'main', MAIN, 'Main', SCOPES);
    await keepKey(db, MAIN, 'mailer', SENDER, 'Postmaster', SCOPES);
    await push(db, MAIN, { records: [], docs: [{ key: 'alerts', d: { on: true, mail: true, quiet: false, snipeMinIsk: 1e6, snipeMinPct: 5, ...alerts } }] });
    await push(db, MAIN, { records: [], docs: [{ key: 'stock', d: { at: new Date(NOW - 10 * MIN).toISOString(), jita: { [SCRIPT]: 3000 }, total: { [SCRIPT]: 3000 }, inContainers: 0 } }] });
    const stats = (fair, perDay) => JSON.stringify({ highs14: Array(14).fill(fair), unitsPerDay: perDay, daysTraded: 30, lastMove: 0 });
    for (const [t, fair, perDay] of [[ANODE, 98_935, 100], [SCRIPT, 12_360, 2544]]) db.run('INSERT INTO scan_items (type_id, stats, book, orders, run) VALUES (?, ?, ?, ?, ?)', t, stats(fair, perDay), '{}', 2, 1);
    return { db, env: testEnv(db) };
  };
  const order = (id, type, buy, price, volume, at) => ({ order_id: id, type_id: type, location_id: JITA, is_buy_order: buy, price, volume_remain: volume, volume_total: volume, issued: new Date(at - 10 * MIN).toISOString(), duration: 90, min_volume: 1 });
  const routes = (book) => [
    ['/markets/10000002/orders/', book],
    [`/universe/types/${ANODE}/`, { type_id: ANODE, name: names[ANODE], group_id: 53 }],
    [`/universe/types/${SCRIPT}/`, { type_id: SCRIPT, name: names[SCRIPT], group_id: 907 }],
    ['/universe/groups/53/', { group_id: 53, category_id: 7 }],
    ['/universe/groups/907/', { group_id: 907, category_id: 8 }],
    [/^POST \/universe\/names\/$/, (u, init) => JSON.parse(init.body).map((id) => ({ id, name: names[id], category: 'inventory_type' }))],
    [new RegExp(`^POST /characters/${SENDER}/mail/$`), 901],
  ];
  const mails = (f) => f.calls.filter((x) => x.method === 'POST' && x.path === `/characters/${SENDER}/mail/`).map((c) => JSON.parse(c.body));
  const round = async (env, book, at) => {
    const f = stubFetch(routes(book));
    const r = await sniperRound(env, at);
    f.restore();
    return { mailed: r.mailed?.[MAIN] ?? 0, sent: mails(f) };
  };

  // The war: a new best bid, by another order at another price, every round.
  const war = [[0, 7444228112, 14_500], [5, 7444229218, 14_600], [10, 7443723102, 14_550], [15, 7444253168, 14_800], [4 * 60 + 5, 7444277247, 14_900]];
  const { db, env } = await ledger();
  const got = [];
  for (const [min, id, price] of war) got.push(await round(env, [order(id, SCRIPT, true, price, 5000, NOW + min * MIN)], NOW + min * MIN));
  eq('  a bid war on one item held: mailed once, then nothing while Remind me again after (4 h) runs, then once again', got.map((x) => x.mailed), [1, 0, 0, 0, 1]);
  eq('    the mail is the high bid', [got[0].sent.length, got[0].sent[0]?.subject], [1, 'Jita Ledger: sell Tracking Speed Script into a high bid']);
  eq('    remembered by the item alone, under its own kind', db.rows('SELECT key, kind FROM alert_log WHERE char_id = ?', MAIN), [{ key: `snipebid:${SCRIPT}`, kind: 'highBid' }]);
  eq('    and it says how to stop it', (got[0].sent[0]?.body ?? '').includes('Turn off mail about high bids in Jita Ledger → Settings → Alerts → Mail me about → High bid for what you hold.'), true);

  // Each switch on its own: a mistake listing (the anode at 58,730, next listing 98,860) and the high bid in one book.
  const both = (at) => [order(1, ANODE, false, 58_730, 133, at), order(2, ANODE, false, 98_860, 50, at), order(8, SCRIPT, true, 14_500, 5000, at)];
  const kinds = async (alerts) => {
    const { env: e, db: d } = await ledger(alerts);
    const r = await round(e, both(NOW), NOW);
    return [r.mailed, d.rows('SELECT kind FROM alert_log WHERE char_id = ? ORDER BY kind', MAIN).map((x) => x.kind)];
  };
  eq('  both on (an older config, without the new switch, takes Mistake listing\'s): both mailed', await kinds({}), [2, ['highBid', 'snipe']]);
  eq('  High bid for what you hold off under Tell me when: the listing still mailed, the bid not', await kinds({ ev: { highBid: false } }), [1, ['snipe']]);
  eq('    off under Mail me about: the same', await kinds({ mailEv: { highBid: false } }), [1, ['snipe']]);
  eq('  Mistake listing off under Tell me when: the bid still mailed, the listing not', await kinds({ ev: { snipe: false, highBid: true }, mailEv: { highBid: true } }), [1, ['highBid']]);
  eq('    off under Mail me about: the same', await kinds({ mailEv: { snipe: false, highBid: true } }), [1, ['highBid']]);
  eq('  an older config with Mistake listing off has high bids off too, as before', await kinds({ ev: { snipe: false } }), [0, []]);
}

console.log('\n--- the full scan notes NPC sellers anywhere in The Forge and counts the whole sell queue (2 October 2026) ---');
{
  const { fullScan } = await import('../worker/src/scan.ts');
  // Read on 2 October 2026 (scripts/fixtures/npc-anywhere.json): ESI's history after 11:05 UTC, the cloud's watched highs,
  // and the whole Forge book at 12:05 UTC: each item's Jita orders, and every NPC sell order elsewhere in The Forge.
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/npc-anywhere.json', import.meta.url), 'utf8'));
  const JITA = 60003760, NOW = Date.parse(fx.scanAt), DAY = 86400_000;
  const ARB = 33440, CC = 93983, CAPS = 20533, CARRIER = 24311, NEURO = 25530, MOLE = 11529;
  const ledgerDb = () => {
    const db = d1();
    for (const [t, x] of Object.entries(fx.items)) db.run('INSERT INTO hist (type_id, expires, rows) VALUES (?, ?, ?)', Number(t), NOW + DAY, JSON.stringify(x.hist));
    for (const [day, f] of Object.entries(fx.items[ARB].flow)) db.run(`INSERT INTO flow (type_id, day, h, sell, buy, new_sell, new_buy, buy_low, sell_high, front_sell, front_buy, reprice_sell, reprice_buy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ARB, day, f.h, f.sell, f.buy, f.newSell, f.newBuy, f.buyLow ?? null, f.sellHigh ?? null, f.frontSell, f.frontBuy, f.repriceSell, f.repriceBuy);
    return db;
  };
  let id = 1;
  const order = (t, location, buy, price, remain, total, duration) => ({ order_id: id++, type_id: Number(t), location_id: location, is_buy_order: !!buy, price, volume_remain: remain, volume_total: total, duration, issued: '2026-10-02T11:00:00Z', min_volume: 1, range: 'region' });
  const realBook = () => Object.entries(fx.items).flatMap(([t, x]) => [
    ...x.jita.map(([b, price, remain, total, duration]) => order(t, JITA, b, price, remain, total, duration)),
    ...x.npc.map(([loc, price, units]) => order(t, loc, false, price, units, units, 365)),
  ]);
  const scan = async (orders) => {
    const db = ledgerDb();
    const f = stubFetch([['/markets/10000002/orders/', orders], ['/markets/19000001/orders/', []]]);
    const meta = await fullScan(db, NOW);
    f.restore();
    const book = (t) => { const r = db.rows('SELECT book FROM scan_items WHERE type_id = ?', t)[0]; return r ? JSON.parse(r.book) : null; };
    return { meta, book };
  };
  const { book } = await scan(realBook());
  eq('  NPCs\' lowest price anywhere in The Forge, on each item they sell: none of them in Jita',
    Object.fromEntries([CC, CAPS, CARRIER, MOLE, NEURO, ARB].map((t) => [t, [book(t)?.npcAnywhere ?? null, book(t)?.npcSell]])),
    { [CC]: [2.5e9, false], [CAPS]: [450e6, false], [CARRIER]: [550e6, false], [MOLE]: [15e6, false], [NEURO]: [null, false], [ARB]: [null, false] });
  // The Arbalest: its seven kept prices all sit under 62,910, where trading got up to on 4 of 14 days with the cloud's
  // watched highs; counted over the whole side, 5,170 units are listed up to there.
  const arbSells = fx.items[ARB].jita.filter(([b]) => !b);
  const upTo = (list, p) => list.filter(([, price]) => price <= p).reduce((t, [, , remain]) => t + remain, 0);
  eq('  the Arbalest: every listing up to 62,910 counted, not only the seven cheapest prices', [book(ARB).topSells.length, book(ARB).topSells.at(-1).price <= 62_910, book(ARB).sellsTo], [7, true, { price: 62_910, units: upTo(arbSells, 62_910) }]);
  eq('    which is 5,170 on the book read at 12:05', book(ARB).sellsTo?.units, 5170);
  // Neurotoxin Recovery: the seven prices (86.9-88.0 M) all under its 89.0 M ceiling, so it's counted too.
  eq('  Neurotoxin Recovery: counted to its 89 M ceiling', book(NEURO).sellsTo, { price: 89e6, units: upTo(fx.items[NEURO].jita.filter(([b]) => !b), 89e6) });
  eq('  where a kept price already sits past the ceiling, the seven are exact and nothing is added', [book(CC).sellsTo, book(CAPS).sellsTo], [undefined, undefined]);
  eq('  the rest of the summary is as it was', Object.keys(book(ARB)).sort(), ['at', 'bestBuy', 'bestSell', 'buyOrders', 'npcSell', 'sellOrders', 'sold', 'sellsTo', 'topBuys', 'topSells'].sort());

  // A fat finger at the front: one unit at 25,000 (invented for the test), under a book whose ceiling is 62,910. The scan
  // keeps listings up to twice the best ask, so it counts to 50,000 and no further, in whichever order the pages came.
  const fat = order(ARB, JITA, 0, 25_000, 1, 1, 90);
  const arbOnly = realBook().filter((o) => o.type_id === ARB);
  const first = await scan([fat, ...arbOnly]);
  const last = await scan([...arbOnly, fat]);
  // Up to 50,000 the real book held only 4 units at 40,810 besides it.
  const fatTo = { price: 50_000, units: 1 + upTo(arbSells, 50_000) };
  eq('  a fat finger at 25,000: counted only to 50,000, twice the best ask, wherever it came in the pages', [fatTo.units, first.book(ARB).sellsTo, last.book(ARB).sellsTo], [5, fatTo, fatTo]);

  // A summary that throws (none has been seen; the final review, 2 October 2026) must not stop the run: the hourly carry-on
  // would stop at the same item every hour. Each item's plain book is stored instead, without the scan's notes.
  const plainDb = ledgerDb();
  let f = stubFetch([['/markets/10000002/orders/', realBook()], ['/markets/19000001/orders/', []]]);
  const summarised = [];
  const plainMeta = await fullScan(plainDb, NOW, (a) => { summarised.push(a); throw new Error('summary failed'); });
  f.restore();
  const plain = (t) => { const r = plainDb.rows('SELECT book FROM scan_items WHERE type_id = ?', t)[0]; return r ? JSON.parse(r.book) : null; };
  const { meta: fullMeta } = await scan(realBook());
  eq('  a summary that throws: every item still stored, and the run not cut short', [plainMeta.kept, plainMeta.partial], [fullMeta.kept, false]);
  eq('    each with its plain book: the levels, counts and what sold, without the NPC note or the whole-queue count',
    [Object.keys(plain(ARB)).sort(), plain(CC).npcAnywhere, plain(ARB).topSells, plain(ARB).sold], [['at', 'bestBuy', 'bestSell', 'buyOrders', 'npcSell', 'sellOrders', 'sold', 'topBuys', 'topSells'].sort(), undefined, book(ARB).topSells, book(ARB).sold]);
  eq('    and each item\'s kept sell prices are let go once it\'s summarised', [summarised.length, summarised.every((a) => a.deep.size === 0)], [fullMeta.kept, true]);
}

console.log('\n--- the Sniper relists no dearer than NPCs sell it anywhere in The Forge ---');
{
  const { sniperRound } = await import('../worker/src/snipe.ts');
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/npc-anywhere.json', import.meta.url), 'utf8'));
  const JITA = 60003760, NOW = Date.parse('2026-10-02T12:11:00Z'), CC = 93983;
  const db = d1();
  const env = testEnv(db);
  const cc = fx.items[CC];
  db.run('INSERT INTO scan_items (type_id, stats, book, orders, run) VALUES (?, ?, ?, ?, ?)', CC, JSON.stringify(cc.stats), JSON.stringify(cc.book), cc.orders, 1);
  let id = 1;
  const o = (location, price, units, duration = 90) => ({ order_id: id++, type_id: CC, location_id: location, is_buy_order: false, price, volume_remain: units, volume_total: units, issued: new Date(NOW - 10 * MIN).toISOString(), duration, min_volume: 1 });
  // A mistake at 2,000 M (invented for the test) in front of Jita's real listings, and NPCs' 12 real orders at 2,500 M elsewhere.
  const jitaSells = cc.jita.filter(([b]) => !b).map(([, price, remain]) => o(JITA, price, remain));
  const npcs = cc.npc.map(([loc, price, units]) => o(loc, price, units, 365));
  const routes = (book) => [['/markets/10000002/orders/', book], [`/universe/types/${CC}/`, { type_id: CC, name: cc.name, group_id: 257 }], ['/universe/groups/257/', { group_id: 257, category_id: 16 }]];
  let f = stubFetch(routes([o(JITA, 2e9, 1), ...jitaSells, ...npcs]));
  await sniperRound(env, NOW);
  f.restore();
  const listing = () => JSON.parse(db.rows(`SELECT data FROM scan_meta WHERE key = 'snipes'`)[0].data).listings.find((l) => l.typeId === CC);
  eq('  a Command Carriers listed at 2,000 M relists at the NPCs\' 2,500 M, not the 2,749.5 M trading reached', [listing()?.resale, listing()?.npc, listing()?.fair], [2.5e9, 2.5e9, 2.7495e9]);
  db.run(`DELETE FROM scan_meta WHERE key = 'snipes'`);
  f = stubFetch(routes([o(JITA, 2e9, 1), ...jitaSells]));
  await sniperRound(env, NOW + 5 * MIN);
  f.restore();
  eq('  with no NPC orders in the read, it relists where trading reached', [listing()?.resale, listing()?.npc], [2.7495e9, undefined]);
}

console.log('\n--- the opportunity mail leaves out whatever NPCs sell anywhere in The Forge ---');
{
  const { opportunities } = await import('../worker/src/alerts.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/npc-anywhere.json', import.meta.url), 'utf8'));
  // Molecular Engineering (a skill), read on 2 October 2026: Jita's book at 12:05 UTC, ESI's history, and NPCs' 12 real
  // orders elsewhere in The Forge at 15 M. At a 20 M budget it clears the filters with no flag, selling at about 14.4 M.
  const MOLE = 11529, NOW = Date.parse('2026-10-02T12:10:00Z');
  const x = fx.items[MOLE];
  const settings = sanitizeSettings({ acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, override: false, target: 5, share: 7.5 });
  const ledger = (scanBook) => {
    const db = d1();
    db.run('INSERT INTO docs (char_id, key, data, rev, updated_at) VALUES (?, ?, ?, 1, 0)', MAIN, 'watch', JSON.stringify({ types: [MOLE], filters: { budget: 20e6, horizonDays: 14, minTrades: 5, minDays: 20, minRoi: 0.03, maxSpikiness: 0.5 } }));
    const packed = x.jita.map(([b, price, remain], i) => [i + 1, b, price, remain]);
    db.run('INSERT INTO books (type_id, stamp, orders, sold, at) VALUES (?, ?, ?, ?, ?)', MOLE, NOW, JSON.stringify(packed), null, NOW - 60_000);
    db.run('INSERT INTO hist (type_id, expires, rows) VALUES (?, ?, ?)', MOLE, NOW + 86400_000, JSON.stringify(x.hist));
    // Watched long enough for the mail to judge it (RELIST_MIN_H), a few traded each side: invented for the test.
    for (const day of ['2026-10-01', '2026-10-02']) {
      db.run(`INSERT INTO flow (type_id, day, h, sell, buy, new_sell, new_buy) VALUES (?, ?, ?, ?, ?, ?, ?)`, MOLE, day, 12, 4, 4, 2, 2);
    }
    if (scanBook) db.run('INSERT INTO scan_items (type_id, stats, book, orders, run) VALUES (?, ?, ?, ?, ?)', MOLE, JSON.stringify(x.stats), JSON.stringify(scanBook), x.orders, 1);
    return db;
  };
  const judged = async (scanBook) => (await opportunities(ledger(scanBook), MAIN, settings, NOW, false)).qualifying.map((p) => [p.typeId, p.sell]);
  const kept = await judged(null);
  eq('  with no scan row, it qualifies, selling under the NPCs\' 15 M', [kept.length, kept[0]?.[1] < 15e6], [1, true]);
  // Any NPC price leaves it out, since the user approved it on 2 October 2026: at 15 M, over where it would resell, as
  // at 14 M, under it (invented for the test).
  eq('  NPCs at 15 M, over the resale: not mailed', await judged({ ...x.book, npcAnywhere: 15e6 }), []);
  eq('  NPCs at 14 M, under the resale: not mailed', await judged({ ...x.book, npcAnywhere: 14e6 }), []);
  eq('  a scan row from a Worker before the note: as with none', await judged(x.book), kept);
  // A browser a version behind doesn't know the flag and can still put a watch-only type in its watch doc: the mail reads
  // the flag from the scan's own row in D1 and leaves it out.
  const wdb = ledger(x.book);
  wdb.run('UPDATE scan_items SET stats = ? WHERE type_id = ?', JSON.stringify({ ...x.stats, watchOnly: true }), MOLE);
  eq('  a watch-only scan row in the watch doc: not mailed', (await opportunities(wdb, MAIN, settings, NOW, false)).qualifying, []);
}

console.log('\n--- the opportunity mail counts the sell queue on the scan\'s whole-book count, as Prospects does ---');
{
  const { opportunities } = await import('../worker/src/alerts.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/npc-anywhere.json', import.meta.url), 'utf8'));
  // The 'Arbalest' Rapid Heavy Missile Launcher I as read on 2 October 2026: Jita's book at 12:05 UTC, ESI's history and
  // the cloud's watched flow. At a 5 M budget it clears the filters, buying at 24,840 to sell at 40,800 (someone's 4 units
  // at 40,810 had come in front). The watch's seven live levels hold 2,775 units, about 12 days of buyers: no flag.
  const ARB = 33440, NOW = Date.parse('2026-10-02T12:10:00Z');
  const x = fx.items[ARB];
  const settings = sanitizeSettings({ acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, override: false, target: 5, share: 7.5 });
  const ledger = (scanBook) => {
    const db = d1();
    db.run('INSERT INTO docs (char_id, key, data, rev, updated_at) VALUES (?, ?, ?, 1, 0)', MAIN, 'watch', JSON.stringify({ types: [ARB], filters: { budget: 5e6, horizonDays: 14, minTrades: 5, minDays: 20, minRoi: 0.03, maxSpikiness: 0.5 } }));
    db.run('INSERT INTO books (type_id, stamp, orders, sold, at) VALUES (?, ?, ?, ?, ?)', ARB, NOW, JSON.stringify(x.jita.map(([b, price, remain], i) => [i + 1, b, price, remain])), null, NOW - 60_000);
    db.run('INSERT INTO hist (type_id, expires, rows) VALUES (?, ?, ?)', ARB, NOW + 86400_000, JSON.stringify(x.hist));
    for (const [day, f] of Object.entries(x.flow)) db.run(`INSERT INTO flow (type_id, day, h, sell, buy, new_sell, new_buy, buy_low, sell_high, front_sell, front_buy, reprice_sell, reprice_buy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ARB, day, f.h, f.sell, f.buy, f.newSell, f.newBuy, f.buyLow ?? null, f.sellHigh ?? null, f.frontSell, f.frontBuy, f.repriceSell, f.repriceBuy);
    if (scanBook) db.run('INSERT INTO scan_items (type_id, stats, book, orders, run) VALUES (?, ?, ?, ?, ?)', ARB, JSON.stringify(x.stats), JSON.stringify(scanBook), x.orders, 1);
    return db;
  };
  const judged = async (scanBook) => (await opportunities(ledger(scanBook), MAIN, settings, NOW, false)).qualifying.map((p) => [p.typeId, p.sell, p.queue?.units, p.queue?.atLeast]);
  eq('  with no scan row, the seven live levels: at least 2,775 listed, mailed as a clean trade', await judged(null), [[ARB, 40_800, 2775, true]]);
  // The full scan's own count of this book (the test above): 5,170 listed up to 62,910, where trading reached on 4 of 14.
  eq('  with the scan\'s whole-book count, 5,170 up to 62,910: about 22 days of buyers, Long queue, not mailed', await judged({ ...x.book, sellsTo: { price: 62_910, units: 5170 } }), []);
  eq('  a scan row without the count (a Worker behind, an old row), or with one it can\'t read: as before',
    [await judged(x.book), await judged({ ...x.book, sellsTo: '5170' }), await judged({ ...x.book, sellsTo: { price: 62_910 } })], [[[ARB, 40_800, 2775, true]], [[ARB, 40_800, 2775, true]], [[ARB, 40_800, 2775, true]]]);
}

console.log('\n--- an alt is never a ledger ---');
{
  const { watchedTypes } = await import('../worker/src/market.ts');
  const { push, pull } = await import('../worker/src/sync.ts');
  const { db } = await ledgerWithAlt();
  db.run('INSERT INTO alts (char_id, ledger, name, added_at, removed_at) VALUES (?, ?, ?, ?, ?)', 900002, MAIN, 'Gone', 1, 2);
  const open = (typeId) => ({ typeId, state: 'open' });
  await push(db, MAIN, { records: [{ k: 'orders', i: '1', d: open(34) }, { k: 'watchlist', i: '36', d: { typeId: 36 } }], docs: [] });
  await push(db, ALT, { records: [{ k: 'orders', i: '2', d: open(VELDSPAR) }], docs: [] });
  await push(db, 900002, { records: [{ k: 'orders', i: '3', d: open(SCORDITE) }], docs: [] });
  // An alt's open position and its watch list count for nothing either.
  await push(db, ALT, { records: [{ k: 'positions', i: 'p', d: { typeId: 35, status: 'open' } }], docs: [{ key: 'watch', d: { types: [37] } }] });
  eq('  the market watch reads the main\'s items, not an alt\'s, removed or not', (await watchedTypes(db)).sort((a, b) => a - b), [34, 36]);

  await push(db, MAIN, { records: [], docs: [{ key: 'chars', d: { [ALT]: { name: 'Miner Two' } } }] });
  eq('  the list of your characters is a document the cloud keeps', (await pull(db, MAIN, 0, null)).docs.map((x) => x.key), ['chars']);
}

console.log('\n--- the industry doc goes up like any other ---');
{
  const { push } = await import('../worker/src/sync.ts');
  const db = d1();
  const r = await push(db, MAIN, { records: [], docs: [{ key: 'industry', d: { sites: [], share: 10 } }] });
  eq('  a push carrying the industry doc is taken, not refused as unknown', [r.docs, db.rows(`SELECT key FROM docs WHERE char_id = ?`, MAIN).map((x) => x.key)], [1, ['industry']]);
}

console.log('\n--- the colonies doc goes up like any other ---');
{
  const { push } = await import('../worker/src/sync.ts');
  const db = d1();
  const r = await push(db, MAIN, { records: [], docs: [{ key: 'colonies', d: { colonies: [] } }] });
  eq('  a push carrying the colonies doc is taken, not refused as unknown', [r.docs, db.rows(`SELECT key FROM docs WHERE char_id = ?`, MAIN).map((x) => x.key)], [1, ['colonies']]);
}

console.log('\n--- the planets doc goes up like any other ---');
{
  const { push } = await import('../worker/src/sync.ts');
  const db = d1();
  const r = await push(db, MAIN, { records: [], docs: [{ key: 'planets', d: { systems: {}, programHours: 72 } }] });
  eq('  a push carrying the planets doc is taken, not refused as unknown', [r.docs, db.rows(`SELECT key FROM docs WHERE char_id = ?`, MAIN).map((x) => x.key)], [1, ['planets']]);
}

console.log('\n--- the full scan reads the Industry tab\'s watch set, and keeps NPCs\' blueprint sellers (Task 5A) ---');
{
  const { fullScan } = await import('../worker/src/scan.ts');
  const { npcRows, saveNpcRow } = await import('../worker/src/industryNpc.ts');
  const JITA = 60003760, NOW = Date.parse('2026-10-10T11:30:00Z'), DAY = 86400_000;
  // Invented for the test. Tritanium (34) trades both ways at a wide spread: a candidate anyway, and in the watch set. Fried
  // Interface Circuit (25601) is listed in Jita and nobody bids: the gate leaves it out, the watch set reads it. Armor Plates
  // (25605) has no Jita order at all. 30000 trades both ways and isn't in the watch set. NPCs sell the pump's blueprint
  // (25895) at 1,250,000 in two stations and a dearer copy of it in a third; and another blueprint nobody asked about.
  const industry = { watch: [34, 25601, 25605], bpos: [25895] };
  let id = 1;
  const order = (t, location, buy, price, remain, duration = 90) => ({ order_id: id++, type_id: t, location_id: location, is_buy_order: buy, price, volume_remain: remain, volume_total: remain, duration, issued: '2026-10-10T09:00:00Z', min_volume: 1, range: 'region' });
  const book = [
    order(34, JITA, true, 3, 1e6), order(34, JITA, false, 4, 1e6),
    order(25601, JITA, false, 4200, 5000),
    order(30000, JITA, true, 90, 100), order(30000, JITA, false, 110, 100),
    order(25895, 60001, false, 1_250_000, 10, 365), order(25895, 60002, false, 1_250_000, 10, 365), order(25895, 60003, false, 1_300_000, 10, 365),
    order(25895, 60004, false, 900_000, 1, 90), order(999, 60001, false, 5_000_000, 10, 365),
  ];
  const hist = Array.from({ length: 30 }, (_, i) => ({ date: new Date(NOW - (i + 1) * DAY).toISOString().slice(0, 10), average: 100, highest: 110, lowest: 90, volume: 1000, order_count: 20 })).reverse();
  const db = d1();
  for (const t of [34, 25601, 25605, 30000]) db.run('INSERT INTO hist (type_id, expires, rows) VALUES (?, ?, ?)', t, NOW + DAY, JSON.stringify(hist));
  const f = stubFetch([['/markets/10000002/orders/', book], ['/markets/19000001/orders/', []]]);
  const meta = await fullScan(db, NOW, undefined, industry);
  f.restore();
  const row = (t) => { const r = db.rows('SELECT stats FROM scan_items WHERE type_id = ?', t)[0]; return r ? JSON.parse(r.stats) : null; };
  eq('  a candidate in the watch set is a candidate as before, not watch-only', [row(34)?.typeId, row(34)?.watchOnly], [34, undefined]);
  eq('  a material traded one way only, left out by the gate, is read for the tab and marked watch-only', [row(25601)?.typeId, row(25601)?.watchOnly], [25601, true]);
  eq('  one with no Jita order gets no row (the tab says "No Jita book this morning")', row(25605), null);
  eq('  a candidate outside the watch set is as before', [row(30000)?.typeId, row(30000)?.watchOnly], [30000, undefined]);
  eq('  the run counts the watch set it read', [meta.checked, meta.watchOnly], [3, 1]);
  const rows = await npcRows(db);
  eq('  NPCs\' sellers of the tab\'s blueprints: the lowest price and every station, cheapest first; a player\'s order and a blueprint not asked about left out',
    [rows.complete?.sellers, rows.complete?.complete, rows.complete?.pagesFailed, rows.partial], [{ 25895: [1_250_000, [60001, 60002, 60003]] }, true, 0, null]);
  // What D1 keeps: the latest complete read, and a newer partial one beside it, and only those.
  const at = (t) => new Date(t).toISOString();
  const keep = d1();
  await saveNpcRow(keep, 1, { at: at(1000), complete: true, pagesFailed: 0, sellers: { 1: [10, [60001]] } });
  await saveNpcRow(keep, 2, { at: at(2000), complete: false, pagesFailed: 3, sellers: { 2: [20, [60002]] } });
  const both = await npcRows(keep);
  eq('  a partial read after a complete one: both kept, the partial\'s missed pages said', [both.complete?.sellers, both.partial?.sellers, both.partial?.pagesFailed], [{ 1: [10, [60001]] }, { 2: [20, [60002]] }, 3]);
  await saveNpcRow(keep, 3, { at: at(3000), complete: false, pagesFailed: 1, sellers: { 3: [30, [60003]] } });
  eq('    another partial one replaces the older partial', [keep.rows('SELECT run FROM industry_npc ORDER BY run').map((r) => r.run), (await npcRows(keep)).partial?.sellers], [[1, 3], { 3: [30, [60003]] }]);
  await saveNpcRow(keep, 4, { at: at(4000), complete: true, pagesFailed: 0, sellers: { 4: [40, [60004]] } });
  eq('    a complete read drops every older row', [keep.rows('SELECT run FROM industry_npc ORDER BY run').map((r) => r.run), (await npcRows(keep)).partial], [[4], null]);
  eq('  before any run: nothing, and nothing claimed', await npcRows(d1()), { complete: null, partial: null });
}

console.log('\n--- home prices from Goonmetrics, read gently by the cloud (Task 6) ---');
{
  const { refreshHomePrices, homePrices, REFRESH_MS } = await import('../worker/src/goonmetrics.ts');
  const NOW = Date.parse('2026-10-10T12:37:00Z');
  const xmlFor = (ids) => `<goonmetrics method="price_data" version="1.0"><price_data>${ids.map((id) => `<type id="${id}"><updated>2026-10-10T12:00:00Z</updated><all><weekly_movement>700</weekly_movement></all><buy><max>9.5</max><listed>100</listed></buy><sell><min>10</min><listed>200</listed></sell></type>`).join('')}</price_data></goonmetrics>`;
  // Every call answered from the type IDs it asks for, its User-Agent and size recorded; `fail` makes chosen calls fail.
  const run = async (db, { types, fail = () => false, html = () => false, now = NOW, on = true, deadline, slow = false } = {}) => {
    const real = globalThis.fetch, calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const ids = (url.searchParams.get('type_id') ?? '').split(',').map(Number);
      calls.push({ host: url.host, path: url.pathname, hub: Number(url.searchParams.get('station_id')), n: ids.length, ua: init.headers?.['User-Agent'] });
      if (fail(calls.length)) return new Response('busy', { status: 503 });
      if (html(calls.length)) return new Response('<html><body>Not found</body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      return new Response(xmlFor(ids), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    };
    let pauses = 0;
    try { return { r: await refreshHomePrices(db, now, types, async () => { pauses++; if (slow) await new Promise((r) => setTimeout(r, 80)); }, on, deadline), calls, pauses }; } finally { globalThis.fetch = real; }
  };
  const types = Array.from({ length: 120 }, (_, i) => 1000 + i);
  const d1WithRead = () => { const x = d1(); x.run("INSERT INTO home_prices (hub, source, at, data, tried) VALUES (1046664001931, 'goonmetrics', ?, '{}', ?), (1049588174021, 'goonmetrics', ?, '{}', ?)", NOW, NOW, NOW, NOW); return x; };
  const db = d1();
  const first = await run(db, { types });
  eq('  both hubs read, 50 types a call (3 calls a hub), a pause before every call but the first', [first.r.done, first.calls.length, first.calls.map((c) => c.n), first.pauses], [{ 'UALX-3': 'read', 'C-J6MT': 'read' }, 6, [50, 50, 20, 50, 50, 20], 5]);
  eq('    from Goonmetrics\' API, with a User-Agent naming the project only', [first.calls[0].host, first.calls[0].path, first.calls[0].ua], ['goonmetrics.apps.goonswarm.org', '/api/price_data/', 'jita-ledger (hobby tool)']);
  eq('    one row a hub, every type in it', db.rows('SELECT hub, source FROM home_prices ORDER BY hub').map((r) => [r.hub, r.source]), [[1046664001931, 'goonmetrics'], [1049588174021, 'goonmetrics']]);
  const served = await homePrices(db, 1046664001931);
  eq('  the route serves a hub\'s read', [Object.keys(served.prices).length, served.prices[1000]], [120, ['2026-10-10T12:00:00Z', 700, 9.5, 100, 10, 200]]);
  eq('  within six hours (less the half hour of slack) nothing is read again', [(await run(db, { types, now: NOW + REFRESH_MS - 40 * 60_000 })).calls.length], [0]);
  const stamped = db.rows('SELECT hub, tried FROM home_prices ORDER BY hub').map((r) => r.tried);
  eq('    each row says when it was tried', stamped, [NOW, NOW]);
  // Six hours on, C-J6MT's second call fails: the batches that came are merged over its last good row, and the hub is stamped.
  const later = await run(db, { types, now: NOW + REFRESH_MS, fail: (n) => n === 5 });
  const cj = await homePrices(db, 1049588174021);
  eq('  a hub with one failing call keeps every type (the good batches new, the failed one as it was), and says why', [later.r.done, later.r.error, Object.keys(cj.prices).length, cj.at], [{ 'UALX-3': 'read', 'C-J6MT': 'partial' }, 'Goonmetrics answered 503 for C-J6MT', 120, new Date(NOW + REFRESH_MS).toISOString()]);
  eq('    and is not read again within six hours, however its round went: one batch Goonmetrics keeps refusing costs nothing more', [(await run(db, { types, now: NOW + REFRESH_MS + 3600_000, fail: () => true })).calls.length, (await run(db, { types, now: NOW + REFRESH_MS + 5 * 3600_000 })).calls.length], [0, 0]);
  // A host that answers some calls and then fails every one (a rate limit): the round stops on the third failure in a row, but the
  // batches of the hub it was reading that came back are kept and the hub stamped, so it isn't read again for six hours.
  const big = Array.from({ length: 400 }, (_, i) => 1000 + i);
  const dbR = d1();
  const limited = await run(dbR, { types: big, fail: (n) => n > 10 });
  const cjR = await homePrices(dbR, 1049588174021);
  eq('  a host that answers 10 calls then fails: the first hub read whole, the second partly (2 of 8 batches), the round stopped', [limited.calls.length, limited.r.done, limited.r.stopped, Object.keys(cjR?.prices ?? {}).length], [13, { 'UALX-3': 'read', 'C-J6MT': 'partial' }, true, 100]);
  eq('    the partial hub is stamped: no call for it within six hours', [dbR.rows('SELECT hub, tried FROM home_prices ORDER BY hub').map((r) => r.tried), (await run(dbR, { types: big, now: NOW + 3600_000, fail: (n) => n > 10 })).calls.length], [[NOW, NOW], 0]);
  const dbD = d1();
  let day = 0;
  for (let h = 0; h < 24; h++) day += (await run(dbD, { types: big, now: NOW + h * 3600_000, fail: (n) => n > 10 })).calls.length;
  eq('    over 24 hourly rounds against that host: 4 rounds of 13 calls, not 13 an hour (312)', day <= 4 * 13, true);

  // A 200 that isn't Goonmetrics' prices (an HTML page, an error element, nothing) is a failed call and never wipes the last good row.
  const dbH = d1();
  await run(dbH, { types });
  const goodAt = (await homePrices(dbH, 1046664001931)).at;
  const noise = await run(dbH, { types, now: NOW + REFRESH_MS, html: () => true });
  eq('  a 200 HTML answer three times running ends the round and keeps the last good row', [noise.calls.length, noise.r.stopped, noise.r.error, (await homePrices(dbH, 1046664001931)).at === goodAt, Object.keys((await homePrices(dbH, 1046664001931)).prices).length], [3, true, 'Goonmetrics answered something other than prices for UALX-3', true, 120]);
  eq('    and, a round three failures stopped being unstamped, the next hour tries again: three calls at most', (await run(dbH, { types, now: NOW + REFRESH_MS + 3600_000, html: () => true })).calls.length, 3);
  const errored = await run(d1(), { types: types.slice(0, 50), now: NOW, html: (n) => n === 1 });
  eq('    one such answer among few: no row is written from it', [errored.r.done['UALX-3'], errored.r.done['C-J6MT']], ['failed', 'read']);
  eq('  a type tag with more than its id still parses', Object.keys((await import('../src/lib/homeMarket.ts')).parseGoonmetrics(xmlFor([5]).replace('<type id="5">', '<type id="5" name="x">'))), ['5']);
  // Every batch refused for a hub with a row: the try is stamped, so the next hours leave it alone (no hourly re-read of the hub).
  const dbS = d1();
  await run(dbS, { types: types.slice(0, 50) });
  const refused = await run(dbS, { types: types.slice(0, 50), now: NOW + REFRESH_MS, html: () => true });
  eq('  every call refused (fewer than three): the hubs are stamped as tried, and read again no sooner than six hours', [refused.r.done, (await run(dbS, { types: types.slice(0, 50), now: NOW + REFRESH_MS + 3600_000 })).calls.length], [{ 'UALX-3': 'failed', 'C-J6MT': 'failed' }, 0]);
  eq('    a hub is due a little early (the alts\' read ahead of it varies), not an hour late', (await run(d1WithRead(), { types: types.slice(0, 50), now: NOW + REFRESH_MS - 20 * 60_000 })).calls.length, 2);
  // A deadline that passes after a hub's first batches: what came is merged and stamped; the next hub waits for the next hour.
  const dbT = d1();
  const cut = await run(dbT, { types, deadline: Date.now() + 50, slow: true });
  eq('  time running out mid-hub: the batches read are kept and stamped (partial), the other hub is left', [cut.r.done, cut.calls.length, Object.keys((await homePrices(dbT, 1046664001931)).prices).length, dbT.rows('SELECT tried FROM home_prices').map((r) => r.tried)], [{ 'UALX-3': 'partial', 'C-J6MT': 'later' }, 2, 100, [NOW]]);
  // A first read whose write keeps throwing: a stub row carries the stamp, so the hub isn't read again every hour.
  const dbW = d1();
  const brokenWrite = { ...dbW, prepare: (sql) => { if (sql.includes('excluded.data')) throw new Error('disk full'); return dbW.prepare(sql); } };
  const w1 = await run(brokenWrite, { types });
  eq('  a first read whose write throws is stamped through a stub, which reads as never read', [w1.r.done, dbW.rows('SELECT hub, at, tried FROM home_prices ORDER BY hub').map((r) => [r.at, r.tried]), await homePrices(dbW, 1046664001931)], [{ 'UALX-3': 'failed', 'C-J6MT': 'failed' }, [[0, NOW], [0, NOW]], null]);
  eq('    and the next hours leave it alone: no re-read of 38 calls a hub every hour', (await run(brokenWrite, { types, now: NOW + 3600_000 })).calls.length, 0);
  // Types that leave the watch set leave the row.
  const dbP = d1();
  await run(dbP, { types });
  await run(dbP, { types: types.slice(0, 60), now: NOW + REFRESH_MS });
  eq('  a type that has left the watch set is pruned from the row', Object.keys((await homePrices(dbP, 1046664001931)).prices).length, 60);
  // Time: nothing is started after the cron's budget, and a hub cut short is merged and stamped.
  const late = await run(d1(), { types, deadline: Date.now() - 1 });
  eq('  past the budget no call starts, and the hubs are left for the next hour', [late.calls.length, late.r.done], [0, { 'UALX-3': 'later', 'C-J6MT': 'later' }]);
  const down = await run(d1(), { types, fail: () => true });
  eq('  three failed calls in a row end the round: the site is down', [down.calls.length, down.r.stopped], [3, true]);
  eq('  switched off: nothing read, and the route says so', [(await run(d1(), { types, on: false })).calls.length, await homePrices(d1(), 1046664001931, false)], [0, { off: true }]);
  eq('  before its first read: nothing, not an empty price list', await homePrices(d1(), 1049588174021), null);
  await rejects('  a hub the cloud doesn\'t read is refused', () => homePrices(d1(), 1030049082711), /Not a hub the cloud reads/);
}

console.log('\n--- the blueprints doc goes up like any other ---');
{
  const { push } = await import('../worker/src/sync.ts');
  const db = d1();
  const r = await push(db, MAIN, { records: [], docs: [{ key: 'blueprints', d: { list: [] } }] });
  eq('  a push carrying the blueprints doc is taken, not refused as unknown', [r.docs, db.rows('SELECT key FROM docs WHERE char_id = ?', MAIN).map((x) => x.key)], [1, ['blueprints']]);
}

console.log('\n--- the copyContracts doc goes up like any other ---');
{
  const { push } = await import('../worker/src/sync.ts');
  const db = d1();
  const r = await push(db, MAIN, { records: [], docs: [{ key: 'copyContracts', d: { list: [] } }] });
  eq('  a push carrying it is taken, not refused as unknown', [r.docs, db.rows('SELECT key FROM docs WHERE char_id = ?', MAIN).map((x) => x.key)], [1, ['copyContracts']]);
}

console.log('\n--- the copyContracts doc is merged onto D1\'s, never written over it (Task 15A fix round 1) ---');
{
  const { push, pull } = await import('../worker/src/sync.ts');
  const db = d1();
  const cc = (id, over = {}) => ({ id, issued: '2026-09-01T00:00:00Z', expires: '2026-10-15T00:00:00Z', status: 'outstanding', price: 9e6, availability: 'public', acceptor: null, completed: null, station: 60003760, copies: [[25895, 2]], ...over });
  const heldDoc = { list: [cc(100, { status: 'finished', acceptor: 777, completed: '2026-09-02T00:00:00Z', gone: '2026-10-05T00:00:00Z' }), cc(200)] };
  await push(db, MAIN, { records: [], docs: [{ key: 'copyContracts', d: heldDoc }] });
  const stored = () => JSON.parse(db.rows('SELECT data FROM docs WHERE char_id = ? AND key = ?', MAIN, 'copyContracts')[0].data);
  const r1 = await push(db, MAIN, { records: [], docs: [{ key: 'copyContracts', d: { list: [cc(200), cc(300)] } }] });
  eq('  a push of a 30-day doc keeps the old contract D1 held', stored().list.map((c) => c.id), [100, 200, 300]);
  const back = await pull(db, MAIN, r1.rev, null);
  eq('  the merged doc is at a revision after the push\'s, and a pull since the push\'s revision returns it', [back.rev > r1.rev, back.docs.some((x) => x.key === 'copyContracts')], [true, true]);
  const r2 = await push(db, MAIN, { records: [], docs: [{ key: 'copyContracts', d: stored() }] });
  const again = await pull(db, MAIN, r2.rev, null);
  eq('  a push whose doc is already the union writes no extra revision', [again.rev === r2.rev, again.docs.length], [true, 0]);
  const r3 = await push(db, MAIN, { records: [], docs: [{ key: 'copyContracts', d: stored() }] });
  eq('  a second push of the same doc writes no later revision', r3.rev, r2.rev + 1);
  // A doc that doesn't sanitize (a pre-15A backup's null) never writes over the history D1 holds.
  await push(db, MAIN, { records: [], docs: [{ key: 'copyContracts', d: null }] });
  eq('  a pushed null keeps the history D1 holds', stored().list.map((c) => c.id), [100, 200, 300]);
}

console.log('\n--- Industry stage 2: jobs and blueprints in the cloud (Task 9B) ---');
{
  const FXI = JSON.parse(fs.readFileSync(new URL('./fixtures/industry-everef.json', import.meta.url), 'utf8'));
  const { push, pull } = await import('../worker/src/sync.ts');
  const { archive } = await import('../worker/src/archive.ts');
  const { readAlt } = await import('../worker/src/alts.ts');
  const { altReader, ledgerReader } = await import('../worker/src/eve.ts');
  const docOf = (db, char, key) => { const r = db.rows('SELECT data FROM docs WHERE char_id = ? AND key = ?', char, key)[0]; return r ? JSON.parse(r.data) : null; };
  const jobOf = (db, char, id) => { const r = db.rows(`SELECT data FROM records WHERE char_id = ? AND kind = 'jobs' AND id = ?`, char, String(id))[0]; return r ? JSON.parse(r.data) : null; };
  const rev = (db, char) => db.rows('SELECT rev FROM revs WHERE char_id = ?', char)[0]?.rev ?? 0;
  const IND = [...SCOPES, 'esi-industry.read_character_jobs.v1', 'esi-characters.read_blueprints.v1', 'esi-universe.read_structures.v1'];
  const START = new Date(Date.now() - 20 * 60_000).toISOString(), END = new Date(Date.now() + 6 * 3600_000).toISOString();
  const rawJob = (char, over = {}) => ({ job_id: 801, installer_id: char, facility_id: 60003760, station_id: 60003760, activity_id: 1, blueprint_id: 7001, blueprint_type_id: 25895,
    blueprint_location_id: 60003760, output_location_id: 60003760, runs: 65, status: 'active', duration: 66000, start_date: START, end_date: END, product_type_id: 25894, licensed_runs: 40, cost: 17213916, ...over });
  const CONT = 1044519007308, STRUCT = 1046664001931;
  const rawBp = (over = {}) => ({ item_id: 7001, type_id: 25895, location_id: CONT, location_flag: 'Hangar', quantity: -1, runs: -1, material_efficiency: 10, time_efficiency: 20, ...over });
  /** ESI as the industry reads need it, ahead of esiFor's (the first matching route answers). */
  const industryRoutes = (char, over = {}) => [
    [`/characters/${char}/industry/jobs/`, over.jobs ?? [rawJob(char)]],
    [`/characters/${char}/blueprints/`, over.blueprints ?? [rawBp()]],
    // Real-range IDs: every asset item_id in a real read is 13 digits (1.044e12 to 1.056e12), like a structure's.
    [`/characters/${char}/assets/`, [{ item_id: CONT, type_id: 17366, quantity: 1, location_id: 60003760, location_flag: 'Hangar', location_type: 'station', is_singleton: true }]],
    [new RegExp(`^POST /characters/${char}/assets/names/$`), over.names ?? [{ item_id: CONT, name: 'Blueprints' }]],
    [`/universe/structures/${STRUCT}/`, { name: 'Raitaru Home', solar_system_id: 30000142 }],
    ['/industry/systems/', FXI.systems],
    ['/markets/prices/', Object.entries(FXI.adjusted).map(([t, p]) => ({ type_id: Number(t), adjusted_price: p, average_price: p }))],
    ['/universe/stations/60003760/', { system_id: 30000142, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' }],
  ];
  const jitaIndex = 0.1651, pumpEiv = 157590413.44605502 / 65;

  // The push: a job is merged onto D1's record, never written over it.
  {
    const db = d1();
    const first = { me: 10, te: 20, systemId: 30000142, index: jitaIndex, eiv: pumpEiv };
    const seen = { jobId: 801, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 65, licensedRuns: 40, successfulRuns: null, probability: null, cost: 17213916,
      facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: START, end: END, completed: null, status: 'active', perRun: 1, seenAt: START, first };
    await push(db, MAIN, { records: [{ k: 'jobs', i: '801', d: seen }], docs: [] });
    const late = { ...seen, status: 'delivered', completed: END, seenAt: END };
    delete late.first;
    const p2 = await push(db, MAIN, { records: [{ k: 'jobs', i: '801', d: late }], docs: [] });
    const got = jobOf(db, MAIN, 801);
    eq('  a jobs record is taken now, and one pushed without first-sight fields is merged onto D1\'s, never over it',
      [got.first, got.seenAt, got.status, got.completed], [first, START, 'delivered', END]);
    // The pushing browser skips its push's revision when it pulls (ownRevs), so what the merge added has to come at another.
    const pulled = async () => (await pull(db, MAIN, 0, null)).records.find((r) => r.k === 'jobs' && r.i === '801');
    const row2 = await pulled();
    eq('    written at a revision of its own after the push\'s, so the browser that pushed it pulls the merged job', [row2.r > p2.rev, row2.d.first], [true, first]);
    const p3 = await push(db, MAIN, { records: [{ k: 'jobs', i: '801', d: got }], docs: [] });
    eq('    a job pushed as D1 holds it is written at the push\'s own revision (no revision spent)', (await pulled()).r, p3.rev);
  }

  // The main's jobs, read by the hourly archive: first sight from the blueprints doc its browser keeps.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', 'main');
    await keepKey(db, MAIN, 'main', MAIN, 'Main', IND);
    await push(db, MAIN, { records: [], docs: [{ key: 'blueprints', d: { list: [[7001, 25895, CONT, 'Hangar', -1, -1, 10, 20]] } }] });
    let f = stubFetch([...industryRoutes(MAIN), ...esiFor(MAIN)]);
    const r = await archive(env, ledgerReader(MAIN));
    f.restore();
    const j = jobOf(db, MAIN, 801);
    eq('  the main\'s job kept under the main, seen running: its blueprint\'s ME and TE from the doc, Jita\'s index, the EIV a run',
      [r.jobs, j.perRun, j.first.me, j.first.te, j.first.systemId, j.first.index, Math.round(j.first.eiv * 65)], [1, 1, 10, 20, 30000142, jitaIndex, 157590413]);
    // The call is what's pinned (esiFor has no blueprints route, so a read would 404 and be swallowed).
    eq('    the archive reads no blueprints for the main (its browser does)', f.calls.some((c) => /\/blueprints\/$/.test(c.path)), false);
    const jobRev = () => db.rows(`SELECT rev FROM records WHERE char_id = ? AND kind = 'jobs' AND id = '801'`, MAIN)[0].rev;
    const r0 = jobRev();
    f = stubFetch([...industryRoutes(MAIN), ...esiFor(MAIN)]);
    await archive(env, ledgerReader(MAIN));
    f.restore();
    eq('    read again unchanged: the job isn\'t pushed again, and nothing new is sighted (no indices read)',
      [jobRev(), f.calls.some((c) => c.path === '/industry/systems/')], [r0, false]);
    f = stubFetch([...industryRoutes(MAIN, { jobs: [rawJob(MAIN, { status: 'delivered', completed_date: END })] }), ...esiFor(MAIN)]);
    await archive(env, ledgerReader(MAIN));
    f.restore();
    eq('    delivered: the status moves, the first sight stays', [jobOf(db, MAIN, 801).status, jobOf(db, MAIN, 801).first.me], ['delivered', 10]);
  }

  // A job the cloud saw before the main's browser pushed its blueprints doc: the levels are filled once the doc is there.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', 'main');
    await keepKey(db, MAIN, 'main', MAIN, 'Main', IND);
    const bare = { jobId: 801, activity: 1, blueprintId: 7001, blueprintTypeId: 25895, productTypeId: 25894, runs: 65, licensedRuns: 40, successfulRuns: null, probability: null, cost: 17213916,
      facilityId: 60003760, stationId: 60003760, outputId: 60003760, start: START, end: END, completed: null, status: 'active', perRun: 1, seenAt: START,
      first: { me: null, te: null, systemId: 30000142, index: jitaIndex, eiv: pumpEiv, at: START } };
    await push(db, MAIN, { records: [{ k: 'jobs', i: '801', d: bare }], docs: [{ key: 'blueprints', d: { list: [[7001, 25895, CONT, 'Hangar', -1, -1, 10, 20]] } }] });
    const f = stubFetch([...industryRoutes(MAIN), ...esiFor(MAIN)]);
    await archive(env, ledgerReader(MAIN));
    f.restore();
    const j = jobOf(db, MAIN, 801);
    eq('  a running job held without its levels: the archive fills them from the blueprints doc, the rest of first as it was',
      [j.first.me, j.first.te, j.first.systemId, j.first.index, j.first.at, j.seenAt], [10, 20, 30000142, jitaIndex, START, START]);
    await push(db, MAIN, { records: [{ k: 'jobs', i: '802', d: { ...bare, jobId: 802 } }], docs: [] });
    const h = stubFetch([...industryRoutes(MAIN, { jobs: [rawJob(MAIN, { job_id: 802, status: 'delivered', completed_date: END })] }), ...esiFor(MAIN)]);
    await archive(env, ledgerReader(MAIN));
    h.restore();
    eq('    one delivered meanwhile isn\'t filled', [jobOf(db, MAIN, 802).status, jobOf(db, MAIN, 802).first.me], ['delivered', null]);
  }

  // An alt's blueprints and jobs, read by its hourly sheet, filed under it.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', IND);
    const main = under(db, MAIN);
    const twoBps = [rawBp(), rawBp({ item_id: 7002, type_id: 25896, location_id: STRUCT, location_flag: 'CorpSAG1' })];
    let f = stubFetch([...industryRoutes(ALT, { blueprints: twoBps }), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt\'s blueprints: its doc, its container (one of its own asset item IDs) and its structure each named by the right call, which places are its own containers kept, no read time',
      docOf(db, ALT, 'blueprints'), { list: [[7001, 25895, CONT, 'Hangar', -1, -1, 10, 20], [7002, 25896, STRUCT, 'CorpSAG1', -1, -1, 10, 20]], names: { [CONT]: 'Blueprints', [STRUCT]: 'Raitaru Home' }, items: [CONT] });
    eq('    the container was named by /assets/names and not looked up as a structure; the structure the other way round',
      [f.calls.some((c) => c.path === `/universe/structures/${CONT}/`), f.calls.filter((c) => c.method === 'POST' && /assets\/names/.test(c.path)).every((c) => !String(c.body).includes(String(STRUCT))), f.calls.some((c) => c.path === `/universe/structures/${STRUCT}/`)], [false, true, true]);
    eq('    its job under it, sighted with its own blueprint\'s ME', [jobOf(db, ALT, 801)?.first?.me, docOf(db, ALT, 'meta').jobsRead], [10, true]);
    eq('    read once, by the sheet: the archive doesn\'t read an alt\'s jobs', f.calls.filter((c) => /\/industry\/jobs\/$/.test(c.path)).length, 1);
    eq('    nothing of it under the main', under(db, MAIN), main);
    const r1 = rev(db, ALT);
    f = stubFetch([...industryRoutes(ALT, { blueprints: twoBps }), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  read again unchanged: no new revision, and the container isn\'t named again', [rev(db, ALT), f.calls.some((c) => (c.method === 'POST' && /assets\/names/.test(c.path) && String(c.body).includes(String(CONT))) || c.path === `/universe/structures/${STRUCT}/`)], [r1, false]);
    f = stubFetch([...industryRoutes(ALT, { blueprints: twoBps, jobs: new Response('{"error":"down"}', { status: 500 }) }), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  a jobs read that fails leaves what was held, and the sheet still counts as read', [jobOf(db, ALT, 801)?.first?.me, db.rows(`SELECT fails FROM jobs WHERE char_id = ? AND job = 'sheet'`, ALT)[0].fails], [10, 0]);
  }

  // The archive read no assets this hour (the login lacks the permission here; a failed read gives the same: no item IDs): the
  // sheet classifies nothing: the blueprints are kept, no place is named or marked a container, none looked up as a structure.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', IND.filter((s) => s !== 'esi-assets.read_assets.v1'));
    const f = stubFetch([...industryRoutes(ALT, { blueprints: [rawBp(), rawBp({ item_id: 7002, type_id: 25896, location_id: STRUCT })] }), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  no assets read this hour: the blueprints are kept with no names and no containers, and no place is looked up',
      [docOf(db, ALT, 'blueprints'), f.calls.some((c) => /assets\/names|universe\/structures/.test(c.path))],
      [{ list: [[7001, 25895, CONT, 'Hangar', -1, -1, 10, 20], [7002, 25896, STRUCT, 'Hangar', -1, -1, 10, 20]] }, false]);
  }

  // A 401 from a structure is the token's, not the structure's: the place stays unnamed and is asked again (only a 403 is `''`).
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', IND);
    const routes = [...industryRoutes(ALT, { blueprints: [rawBp(), rawBp({ item_id: 7002, type_id: 25896, location_id: STRUCT })] }), ...esiFor(ALT)];
    routes.unshift([`/universe/structures/${STRUCT}/`, new Response('{"error":"token"}', { status: 401 })]);
    const f = stubFetch(routes);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  a structure that answers 401 is left unnamed, not marked refused', [String(STRUCT) in (docOf(db, ALT, 'blueprints').names ?? {}), docOf(db, ALT, 'blueprints').names[CONT]], [false, 'Blueprints']);
  }

  // A job running at a structure: its system is asked only with the structures permission.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', 'main');
    await keepKey(db, MAIN, 'main', MAIN, 'Main', IND.filter((s) => s !== 'esi-universe.read_structures.v1'));
    const f = stubFetch([...industryRoutes(MAIN, { jobs: [rawJob(MAIN, { facility_id: STRUCT, station_id: STRUCT })] }), ...esiFor(MAIN)]);
    await archive(env, ledgerReader(MAIN));
    f.restore();
    eq('  no structures permission: a job at a structure is kept with its system not known, and no structure is asked about',
      [f.calls.some((c) => /universe\/structures/.test(c.path)), jobOf(db, MAIN, 801)?.first?.systemId], [false, null]);
  }

  // A running job's blueprint may be missing from the read just taken: the doc held before stands in (correction 20).
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', IND);
    await push(db, ALT, { records: [], docs: [{ key: 'blueprints', d: { list: [[7001, 25895, CONT, 'Hangar', -1, -1, 10, 20]] } }] });
    const f = stubFetch([...industryRoutes(ALT, { blueprints: [] }), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt\'s job whose blueprint this read doesn\'t list is sighted with the ME held before it', jobOf(db, ALT, 801)?.first?.me, 10);
  }

  // A login handed over without the permissions: nothing asked, nothing written, no mark.
  {
    const { db, env } = await ledgerWithAlt();
    const f = stubFetch([...industryRoutes(ALT), ...esiFor(ALT)]);
    await readAlt(env, altReader(MAIN, ALT));
    f.restore();
    eq('  an alt whose login lacks them: not asked; no blueprints doc, no jobs, no jobsRead (not "none")',
      [f.calls.some((c) => /\/industry\/jobs\/$|\/blueprints\/$/.test(c.path)), docOf(db, ALT, 'blueprints'), jobOf(db, ALT, 801), 'jobsRead' in (docOf(db, ALT, 'meta') ?? {})], [false, null, null, false]);
  }

  // Taken off the roster while its jobs were read: nothing of it goes back in.
  {
    const { db, env } = await ledgerWithAlt();
    db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', IND);
    const routes = [...industryRoutes(ALT), ...esiFor(ALT)];
    routes[0] = [`/characters/${ALT}/industry/jobs/`, () => { db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`); return [rawJob(ALT)]; }];
    const f = stubFetch(routes);
    await readAlt(env, altReader(MAIN, ALT)).catch(() => undefined);
    f.restore();
    eq('  an alt removed mid-read gets no jobs and no blueprints doc', [jobOf(db, ALT, 801), docOf(db, ALT, 'blueprints')], [null, null]);
  }
}

console.log('\n--- what copies sell, read every six hours by the cloud (Task 14A) ---');
{
  const { refreshCopies, copiesFor, COPY_PART } = await import('../worker/src/copies.ts');
  const FX = JSON.parse(fs.readFileSync(new URL('./fixtures/copy-snapshots.json', import.meta.url), 'utf8'));
  const snap = (i, at = FX.snapshots[i].at) => ({ at, contracts: FX.snapshots[i].contracts.map(([id, price, expires, issuer, items]) => ({ id, price, issued: '', expires, stationId: 60003760, issuer, title: '',
    items: items.map(([typeId, copy, me, te, runs, qty, itemId]) => ({ typeId, copy: copy === 1, me, te, runs, qty, itemId })) })) });
  const [A, B, C] = FX.snapshots.map((s) => Date.parse(s.at));
  const H = 3_600_000;
  const n = (db, sql) => db.rows(sql)[0].n;
  const db = d1();
  const r1 = await refreshCopies(db, A + 120_000, { read: async () => snap(0), part: 40 });
  eq('  the first read keeps the set (96 contracts in rows of 40) and counts nothing sold', [r1, db.rows('SELECT part FROM copy_set ORDER BY part').map((r) => r.part), n(db, 'SELECT COUNT(*) AS n FROM copy_sold')],
    [{ done: 'read', contracts: 96, sold: 0, parts: 3 }, [0, 1, 2], 0]);
  const s1 = await copiesFor(db);
  eq('    and says counting has begun: 0 days, no reads, the asks known', [s1.days, s1.reads, s1.sold, Object.keys(s1.asks).length, s1.error], [0, 0, [], 11, null]);
  eq('  three hours on it isn\'t due', await refreshCopies(db, A + 3 * H, { read: async () => snap(1) }), { done: 'fresh' });
  eq('  six hours on: 16 sold, the set rewritten in one row', [await refreshCopies(db, B + 120_000, { read: async () => snap(1) }), n(db, 'SELECT COUNT(*) AS n FROM copy_set')], [{ done: 'read', contracts: 87, sold: 16, parts: 1 }, 1]);
  eq('  twelve: 12 more (28 kept)', [await refreshCopies(db, C + 120_000, { read: async () => snap(2) }), n(db, 'SELECT COUNT(*) AS n FROM copy_sold')], [{ done: 'read', contracts: 82, sold: 12, parts: 1 }, 28]);
  const s3 = await copiesFor(db);
  eq('  GET /v1/copies: the summary worked out in the round, with when it last tried', [s3.at, Math.round(s3.days * 1000) / 1000, s3.reads, s3.sold.length, s3.tried, s3.error], ['2026-10-11T12:01:00.000Z', 0.5, 2, 7, new Date(C + 120_000).toISOString(), null]);
  // EVE Ref stalled: the same snapshot six hours on compares nothing, says so, and is tried again the next hour.
  const same = await refreshCopies(db, C + 6 * H, { read: async () => snap(2) });
  const afterSame = await copiesFor(db);
  eq('  the same snapshot again: nothing compared, said as nothing newer (not an error), tried again an hour later', [same, n(db, 'SELECT COUNT(*) AS n FROM copy_sold'), afterSame.error, afterSame.stale, await refreshCopies(db, C + 6.5 * H, { read: async () => snap(2) }), await refreshCopies(db, C + 7 * H, { read: async () => snap(2) })],
    [{ done: 'same' }, 28, null, '2026-10-11T12:01:00.000Z', { done: 'fresh' }, { done: 'same' }]);
  eq('  a failed read keeps the set and what sold, says why, and waits for the next hour', [await refreshCopies(db, C + 12 * H, { read: async () => { throw new Error('EVE Ref answered 503 for public-contracts-latest.v2.tar.bz2'); } }), n(db, 'SELECT COUNT(*) AS n FROM copy_set'), n(db, 'SELECT COUNT(*) AS n FROM copy_sold'), (await copiesFor(db)).error, await refreshCopies(db, C + 12.5 * H, { read: async () => snap(2) })],
    [{ done: 'failed', error: 'EVE Ref answered 503 for public-contracts-latest.v2.tar.bz2' }, 1, 28, 'EVE Ref answered 503 for public-contracts-latest.v2.tar.bz2', { done: 'fresh' }]);
  eq('  out of time before it began: nothing read, nothing stamped', [await refreshCopies(db, C + 14 * H, { read: async () => snap(2), deadline: Date.now() - 1 }), JSON.parse(db.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data).tried], [{ done: 'later' }, C + 12 * H]);
  eq('  switched off: nothing read, and the route says so', [await refreshCopies(d1(), A, { read: async () => snap(0), on: false }), await copiesFor(d1(), false)], [{ off: true }, { off: true }]);
  eq('  before its first read: nothing, not an empty summary', await copiesFor(d1()), null);
  // The review of Task 14A: once a round has tried, the route says when and why even before a set is kept; null only when none has.
  const dbX = d1();
  await refreshCopies(dbX, A, { read: async () => { throw new Error('EVE Ref answered 503 for public-contracts-latest.v2.tar.bz2'); } });
  eq('  a first read that failed: when it tried and why, not "never read"', await copiesFor(dbX), { tried: new Date(A).toISOString(), error: 'EVE Ref answered 503 for public-contracts-latest.v2.tar.bz2' });
  // A kept set more than a week older than the new snapshot: compared, it would put a week of sales on one day.
  const dbOld = d1();
  await refreshCopies(dbOld, A + 120_000, { read: async () => snap(0) });
  const late = new Date(A + 8 * 86400_000).toISOString();
  eq('  a kept set over seven days old: the set replaced, nothing compared', [await refreshCopies(dbOld, A + 8 * 86400_000 + 120_000, { read: async () => snap(1, late) }), n(dbOld, 'SELECT COUNT(*) AS n FROM copy_sold'), (await copiesFor(dbOld)).reads],
    [{ done: 'read', contracts: 87, sold: 0, parts: 1 }, 0, 0]);
  // Your own characters (every login the cloud holds, every alt) are no one's market.
  const dbOwn = d1();
  const seller = FX.snapshots[1].contracts.find((x) => x[4].some((i) => i[0] === 21012 && i[4] === 40) && !FX.snapshots[2].contracts.some((y) => y[0] === x[0]))[3];
  dbOwn.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', seller, MAIN, 'Seller Alt', 1);
  for (const [i, t] of [[0, A], [1, B], [2, C]]) await refreshCopies(dbOwn, t + 120_000, { read: async () => snap(i) });
  eq('  an alt\'s sales and asks are left out of the summary (its row in copy_sold kept)', [(await copiesFor(dbOwn)).sold.some((x) => x.typeId === 21012 && x.runs === 40), n(dbOwn, `SELECT COUNT(*) AS n FROM copy_sold WHERE issuer = ${seller}`)], [false, 5]);
  // What sold is pruned after eight days; a round's own rows stay.
  const dbP = d1();
  dbP.run('INSERT INTO copy_sold (contract_id, type_id, me, te, runs, copies, price, issuer, at) VALUES (1, 693, 10, 20, 1, 1, 1, 7, ?)', A - 9 * 86400_000);
  await refreshCopies(dbP, A + 120_000, { read: async () => snap(0) });
  eq('  a sale kept over eight days is pruned', n(dbP, 'SELECT COUNT(*) AS n FROM copy_sold'), 0);
  // The default reader: EVE Ref's latest snapshot, asked once, with a User-Agent naming the project only.
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => { calls.push({ url: String(input), ua: init.headers?.['User-Agent'], timeout: init.signal instanceof AbortSignal }); return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); };
  let viaFetch;
  try { viaFetch = await refreshCopies(d1(), A); } finally { globalThis.fetch = real; }
  eq('  the default reader asks EVE Ref once, naming the project only, with a timeout; bytes that aren\'t a snapshot fail the round', [calls, viaFetch.done],
    [[{ url: 'https://data.everef.net/public-contracts/public-contracts-latest.v2.tar.bz2', ua: 'Jita Ledger (a personal EVE trading tool)', timeout: true }], 'failed']);
  eq('  a row holds 3,000 contracts', COPY_PART, 3000);
  // I5: the round stamps "interrupted" before it reads, so a round the cloud kills leaves a trace; after one, it waits six hours.
  const { INTERRUPTED } = await import('../worker/src/copies.ts');
  const dbI = d1();
  let mid = null;
  await refreshCopies(dbI, A + 120_000, { read: async () => { mid = JSON.parse(dbI.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data); return snap(0); } });
  eq('  stamped as interrupted, with the try\'s time, while the read is under way; the read\'s end writes over it',
    [mid?.error ?? null, mid?.tried ?? null, JSON.parse(dbI.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data).error], [INTERRUPTED, A + 120_000, null]);
  const dbK = d1();
  dbK.run("INSERT INTO scan_meta (key, data) VALUES ('copies', ?)", JSON.stringify({ tried: A, read: 0, error: INTERRUPTED, stale: null, reads: [] }));
  eq('  a first round the cloud stopped: the route says so', await copiesFor(dbK), { tried: new Date(A).toISOString(), error: INTERRUPTED });
  eq('  after a round the cloud stopped: not tried again an hour on, but six hours on', [await refreshCopies(dbK, A + H, { read: async () => snap(0) }), (await refreshCopies(dbK, A + 6 * H, { read: async () => snap(0) })).done], [{ done: 'fresh' }, 'read']);
  // A throw after the read (here D1 refusing the batch) is no kill: it says why, keeps the last round's set, and is tried the next hour.
  const dbF = d1();
  await refreshCopies(dbF, A + 120_000, { read: async () => snap(0), part: 40 });
  const refusing = { ...dbF, batch: async () => { throw new Error('D1 refused the batch'); } };
  const refused = await refreshCopies(refusing, B + 120_000, { read: async () => snap(1) }).catch((e) => ({ threw: String(e?.message ?? e) }));
  eq('  a write D1 refuses: said (not "interrupted"), the last round\'s set kept, tried again the next hour',
    [refused, JSON.parse(dbF.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data).error, n(dbF, 'SELECT COUNT(*) AS n FROM copy_set'), n(dbF, 'SELECT COUNT(*) AS n FROM copy_sold'), (await refreshCopies(dbF, B + H, { read: async () => snap(1) })).done],
    [{ done: 'failed', error: 'D1 refused the batch' }, 'D1 refused the batch', 3, 0, 'read']);
  // A partial snapshot (a page EVE Ref's scraper missed) makes a contract look sold; the next whole one brings it back and it's taken out.
  const ids = FX.snapshots.map((s) => new Set(s.contracts.map((x) => x[0])));
  const X = FX.snapshots[0].contracts.find((x) => ids[1].has(x[0]) && ids[2].has(x[0]) && x[4].every((i) => i[1] === 1))[0];
  const partial = (i, at) => { const s = snap(i, at); return { ...s, contracts: s.contracts.filter((x) => x.id !== X) }; };
  const dbPart = d1();
  await refreshCopies(dbPart, A + 120_000, { read: async () => snap(0) });
  const r2 = await refreshCopies(dbPart, B + 120_000, { read: async () => partial(1) });
  const hadX = n(dbPart, `SELECT COUNT(*) AS n FROM copy_sold WHERE contract_id = ${X}`);
  const r3 = await refreshCopies(dbPart, C + 120_000, { read: async () => snap(2) });
  eq('  a contract missing from one snapshot and back in the next: counted, then taken out (28 sold, as with whole snapshots)',
    [r2.sold, hadX, r3.back, n(dbPart, `SELECT COUNT(*) AS n FROM copy_sold WHERE contract_id = ${X}`), n(dbPart, 'SELECT COUNT(*) AS n FROM copy_sold'), (await copiesFor(dbPart)).sold.reduce((t, k) => t + k.contracts, 0)],
    [17, 1, 1, 0, 28, 28]);
  // The reader's copyIssuers see a copy its seller moved into a bundle the comparables leave out (correction 5): a reprice, not a sale.
  const dbB = d1();
  await refreshCopies(dbB, A + 120_000, { read: async () => snap(0) });
  const tempest = FX.snapshots[0].contracts.find((x) => x[4][0][0] === 693 && !ids[1].has(x[0]));
  const at06 = snap(1), issuers = new Map();
  for (const x of at06.contracts) for (const it of x.items) if (it.itemId) issuers.set(it.itemId, x.issuer);
  for (const it of tempest[4]) issuers.set(it[6], tempest[3]);
  eq('  a Tempest contract gone at 06:00 whose copy sits in a bundle of its seller\'s: 15 sold, not 16', (await refreshCopies(dbB, B + 120_000, { read: async () => ({ ...at06, copyIssuers: issuers }) })).sold, 15);
  // The review of Task 14A: a snapshot with no copy contracts, or under half those kept, is a partial one. Compared, every kept
  // contract it lacks would count as sold for good (96 of 96 on an empty 06:00); refused, nothing moves and the next hour tries again.
  const { compactCopies } = await import('../src/lib/copyMarket.ts');
  const dbE = d1();
  await refreshCopies(dbE, A + 120_000, { read: async () => snap(0), part: 40 });
  const keptRows = () => dbE.rows('SELECT data FROM copy_set ORDER BY part').flatMap((r) => JSON.parse(r.data)).length;
  const emptyRead = await refreshCopies(dbE, B + 120_000, { read: async () => ({ at: FX.snapshots[1].at, contracts: [] }) });
  const noneSaid = 'EVE Ref’s snapshot holds no copy contracts of The Forge: a snapshot cut short, nothing compared';
  eq('  an empty 06:00 snapshot: refused and said, no sale, the 00:00 set kept, its rows and summary as they were',
    [emptyRead, n(dbE, 'SELECT COUNT(*) AS n FROM copy_sold'), n(dbE, 'SELECT COUNT(*) AS n FROM copy_set'), keptRows(), (await copiesFor(dbE)).error, (await copiesFor(dbE)).reads],
    [{ done: 'failed', error: noneSaid }, 0, 3, 96, noneSaid, 0]);
  const part06 = (() => { const s = snap(1); return { ...s, contracts: s.contracts.slice(0, 40) }; })();
  const partN = compactCopies(part06.contracts).length;
  eq('  an hour on, a 06:00 snapshot with under half the copy contracts kept: refused the same way',
    [partN < 48, await refreshCopies(dbE, B + 120_000 + H, { read: async () => part06 }), n(dbE, 'SELECT COUNT(*) AS n FROM copy_sold'), keptRows()],
    [true, { done: 'failed', error: `EVE Ref’s snapshot holds ${partN} copy contracts of The Forge, under half the kept set (96): a snapshot cut short, or the market changed; nothing compared (1 of 6 in a row)` }, 0, 96]);
  eq('  then the whole 12:00 one: compared with the 00:00 set kept (25 sold, the six-hour count missed)',
    [await refreshCopies(dbE, C + 120_000, { read: async () => snap(2) }), n(dbE, 'SELECT COUNT(*) AS n FROM copy_sold')], [{ done: 'read', contracts: 82, sold: 25, parts: 1 }, 25]);
  const dbE0 = d1();
  eq('  an empty first snapshot: nothing kept, said', [await refreshCopies(dbE0, A, { read: async () => ({ at: FX.snapshots[0].at, contracts: [] }) }), n(dbE0, 'SELECT COUNT(*) AS n FROM copy_set'), await copiesFor(dbE0)],
    [{ done: 'failed', error: 'EVE Ref’s snapshot holds no copy contracts of The Forge: a snapshot cut short, nothing kept' }, 0, { tried: new Date(A).toISOString(), error: 'EVE Ref’s snapshot holds no copy contracts of The Forge: a snapshot cut short, nothing kept' }]);
  // The re-review's ruling: under half the kept set is refused only while it would be compared, and the sixth such snapshot in a
  // row (each a different one) is kept without counting a sale from it, so a market that really fell is read again.
  const { COPIES_RESET_AFTER, RESET_SAID } = await import('../worker/src/copies.ts');
  const dbH = d1();
  await refreshCopies(dbH, A + 120_000, { read: async () => snap(0) });
  await refreshCopies(dbH, B + 120_000, { read: async () => snap(1) });
  const small = (at) => { const s = snap(2, new Date(at).toISOString()); return { ...s, contracts: s.contracts.slice(0, 40) }; };
  const smallN = compactCopies(small(C).contracts).length;
  // Seven hourly tries: the first snapshot twice (counted once), then one a new snapshot each hour.
  const halvedAts = [C, C, C + H, C + 2 * H, C + 3 * H, C + 4 * H, C + 5 * H];
  const halvedRuns = [];
  for (const [i, t] of halvedAts.entries()) halvedRuns.push(await refreshCopies(dbH, C + 120_000 + i * H, { read: async () => small(t) }));
  const halvedSaid = (n) => `EVE Ref’s snapshot holds ${smallN} copy contracts of The Forge, under half the kept set (87): a snapshot cut short, or the market changed; nothing compared (${n} of 6 in a row)`;
  const stH = JSON.parse(dbH.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data);
  eq('  a market under half the kept set six times running: refused five times (the same snapshot counted once), then kept without counting a sale',
    [COPIES_RESET_AFTER, smallN < 87 / 2, halvedRuns, n(dbH, 'SELECT COUNT(*) AS n FROM copy_sold'), dbH.rows('SELECT data FROM copy_set').flatMap((r) => JSON.parse(r.data)).length, stH.note, stH.halved, stH.error, (await copiesFor(dbH)).note, (await copiesFor(dbH)).reads],
    [6, true, [1, 1, 2, 3, 4, 5].map((k) => ({ done: 'failed', error: halvedSaid(k) })).concat([{ done: 'read', contracts: smallN, sold: 0, parts: 1, reset: true }]), 16, smallN, RESET_SAID, null, null, RESET_SAID, 1]);
  eq('    and six hours on the kept set is compared again, the note gone', [(await refreshCopies(dbH, C + 120_000 + 12 * H, { read: async () => small(C + 12 * H) })).done, JSON.parse(dbH.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data).note], ['read', null]);
  // A kept set over a week old is replaced without comparing, so a set under half of it is no refusal.
  const dbG = d1();
  await refreshCopies(dbG, A + 120_000, { read: async () => snap(0) });
  eq('  a snapshot under half the set kept over seven days before: replaced, not refused, nothing counted',
    [await refreshCopies(dbG, A + 8 * 86400_000 + 120_000, { read: async () => small(A + 8 * 86400_000) }), n(dbG, 'SELECT COUNT(*) AS n FROM copy_sold'), JSON.parse(dbG.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data).error],
    [{ done: 'read', contracts: smallN, sold: 0, parts: 1 }, 0, null]);
  // The review of Task 14A: the kept file's ETag goes as If-None-Match, so EVE Ref unchanged is a 304 and no 6.6 MB download.
  const dbT = d1();
  await refreshCopies(dbT, A + 120_000, { read: async () => ({ ...snap(0), etag: '"v0"' }) });
  const asked = [];
  let downloaded = 0;
  const realT = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const tag = init.headers?.['If-None-Match'] ?? null;
    asked.push(tag);
    const same = tag === '"v0"';
    return { status: same ? 304 : 200, ok: !same, headers: new Headers(same ? {} : { ETag: '"v1"' }), arrayBuffer: async () => { downloaded++; return new Uint8Array([1, 2, 3]).buffer; } };
  };
  let r304;
  try { r304 = await refreshCopies(dbT, B + 120_000); } finally { globalThis.fetch = realT; }
  const stT = JSON.parse(dbT.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data);
  eq('  EVE Ref unchanged (304 to the kept ETag): the same snapshot, nothing downloaded, no sale, the set kept, tried again the next hour',
    [r304, asked, downloaded, n(dbT, 'SELECT COUNT(*) AS n FROM copy_sold'), n(dbT, 'SELECT COUNT(*) AS n FROM copy_set'), stT.stale, stT.error, stT.etag, await refreshCopies(dbT, B + 120_000 + 30 * 60_000, { read: async () => snap(1) })],
    [{ done: 'same' }, ['"v0"'], 0, 0, 1, '2026-10-11T00:01:04.000Z', null, '"v0"', { done: 'fresh' }]);
  eq('  a read keeps its file\'s ETag; the same snapshot downloaded again under a new one keeps that', [JSON.parse(dbT.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data).etag,
    (await refreshCopies(dbT, B + 120_000 + H, { read: async () => ({ ...snap(0), etag: '"v0b"' }) })).done, JSON.parse(dbT.rows("SELECT data FROM scan_meta WHERE key = 'copies'")[0].data).etag], ['"v0"', 'same', '"v0b"']);
}

console.log('\n--- the cloud searches structures as an alt, with the alt\'s own login (Task 17A) ---');
{
  const { searchStructures } = await import('../worker/src/structures.ts');
  const SEARCH = 'esi-search.search_structures.v1', READ = 'esi-universe.read_structures.v1';
  const setup = async (altScopes = [...SCOPES, SEARCH, READ]) => {
    const db = d1();
    await keepKey(db, MAIN, 'main', MAIN, 'Main', [...SCOPES, SEARCH, READ]);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', altScopes);
    db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', ALT, MAIN, 'Miner Two', Date.now());
    return { db, env: testEnv(db) };
  };
  const BELL = 1049999999999, BYZ = 1046664001931, HIDDEN = 1048888888888;
  // Whose login a call carried: the character in its access token's `sub`, or null for a public read.
  const whoAsked = (init) => { const t = (init.headers?.Authorization ?? '').replace('Bearer ', ''); return t ? JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()).sub : null; };
  const routes = (seen) => [
    [`/characters/${ALT}/search/`, (url, init) => { seen.push(['search', whoAsked(init), url.searchParams.get('categories'), url.searchParams.get('search'), url.searchParams.get('strict')]); return { structure: [BELL, HIDDEN, BYZ] }; }],
    [`/universe/structures/${BELL}/`, (url, init) => { seen.push(['structure', whoAsked(init)]); return { name: 'UALX-3 - Mothership Bellicose', owner_id: 98000001, solar_system_id: 30004807, type_id: 35834 }; }],
    [`/universe/structures/${BYZ}/`, (url, init) => { seen.push(['structure', whoAsked(init)]); return { name: 'UALX-3 - 1st Byzantigoon', owner_id: 98000002, solar_system_id: 30004807, type_id: 35834 }; }],
    [`/universe/structures/${HIDDEN}/`, () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })],
    ['/universe/systems/30004807/', (url, init) => { seen.push(['system', whoAsked(init)]); return { name: 'UALX-3', security_status: -0.18676190078258514, constellation_id: 20000703 }; }],
  ];
  {
    const { db, env } = await setup();
    const before = counts(db), seen = [];
    const f = stubFetch(routes(seen));
    const r = await searchStructures(env, MAIN, ALT, ' Bell ');
    f.restore();
    eq('  found as the alt: what it can read, in ESI\'s order; one it can\'t read left out', r.found, [
      { id: BELL, name: 'UALX-3 - Mothership Bellicose', systemId: 30004807, system: 'UALX-3', security: -0.18676190078258514, typeId: 35834 },
      { id: BYZ, name: 'UALX-3 - 1st Byzantigoon', systemId: 30004807, system: 'UALX-3', security: -0.18676190078258514, typeId: 35834 }]);
    eq('    the search and each structure with the alt\'s own login; the system read publicly, once', seen, [
      ['search', `CHARACTER:EVE:${ALT}`, 'structure', 'Bell', 'false'], ['structure', `CHARACTER:EVE:${ALT}`], ['system', null], ['structure', `CHARACTER:EVE:${ALT}`]]);
    eq('    nothing written under anyone', counts(db), before);
  }
  {
    const { env } = await setup();
    const f = stubFetch(routes([]));
    await rejects('  a character not on the roster is refused before EVE is asked', () => searchStructures(env, MAIN, 900555, 'Bellicose'), /isn’t one of yours/);
    await rejects('  fewer than three letters', () => searchStructures(env, MAIN, ALT, 'Be'), /three letters/);
    eq('    neither asked EVE anything', f.calls.length, 0);
    f.restore();
  }
  {
    const { env } = await setup(SCOPES);
    const f = stubFetch(routes([]));
    await rejects('  an alt\'s login handed over without the search permission: said, with where to fix it', () => searchStructures(env, MAIN, ALT, 'Bellicose'), /Miner Two’s login was handed over without EVE’s permission to search structures: hand it over again on Characters/);
    eq('    and EVE wasn\'t asked', f.calls.length, 0);
    f.restore();
  }
  {
    const { db, env } = await setup();
    db.run(`DELETE FROM keys WHERE purpose = 'alt:${ALT}'`);
    await rejects('  an alt with no login kept: said', () => searchStructures(env, MAIN, ALT, 'Bellicose'), /holds no login for Miner Two/);
  }
  {
    // An alt whose login EVE refuses: its access token stale, EVE's token route answering 400 (useLogin marks it refused).
    const db = d1();
    await keepKey(db, MAIN, 'main', MAIN, 'Main', [...SCOPES, SEARCH, READ]);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', [...SCOPES, SEARCH, READ], { expired: true });
    db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', ALT, MAIN, 'Miner Two', Date.now());
    const f = stubFetch([['/v2/oauth/token', () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Character grant missing/expired' }), { status: 400 })], ...routes([])]);
    await rejects('  an alt whose login EVE refuses: said in the login\'s own words', () => searchStructures(testEnv(db), MAIN, ALT, 'Bellicose'), /EVE refused the cloud’s login for Miner Two/);
    eq('    and no search was asked', f.calls.filter((c) => c.path.endsWith('/search/')).length, 0);
    f.restore();
  }
}

console.log('\n--- home markets: a structure\'s own market, read hourly by the cloud with its reader\'s login (Task 18A) ---');
{
  const H = await import('../worker/src/homeMarkets.ts');
  const UALX = 1046664001931, CJ = 1049588174021, BELL = 1049999999999;
  const MARKETS = 'esi-markets.structure_markets.v1';
  const NOW = Date.parse('2026-10-12T13:38:00Z'), HOUR = 3_600_000;
  const want = new Set([34, 35, 25894]);
  const o = (id, type, buy, price, remain, total = remain) => ({ order_id: id, type_id: type, location_id: BELL, is_buy_order: buy, price, volume_remain: remain, volume_total: total, min_volume: 1, duration: 90, issued: '2026-10-12T10:00:00Z', range: 'station' });
  const reply = (body, status = 200, pages = 1) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Pages': String(pages) } });
  const pagesOf = (list) => (url) => reply(list[Number(url.searchParams.get('page') ?? 1) - 1] ?? [], 200, list.length);
  const whoAsked = (init) => { const t = (init.headers?.Authorization ?? '').replace('Bearer ', ''); return t ? JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()).sub : null; };
  const PAGE1 = [o(1, 34, false, 5.1, 1000, 1500), o(2, 34, false, 5.0, 200), o(3, 34, true, 4.5, 800, 1000), o(4, 44992, false, 5e6, 3)];
  const PAGE2 = [o(5, 25894, false, 7.2e6, 4, 6), o(6, 34, false, 5.0, 300), o(7, 35, true, 11, 1, 1)];
  const setup = async ({ mainScopes = [...SCOPES, MARKETS], altScopes = [...SCOPES, MARKETS] } = {}) => {
    const db = d1();
    await keepKey(db, MAIN, 'main', MAIN, 'Main', mainScopes);
    await keepKey(db, MAIN, `alt:${ALT}`, ALT, 'Miner Two', altScopes);
    db.run('INSERT INTO alts (char_id, ledger, name, added_at) VALUES (?, ?, ?, ?)', ALT, MAIN, 'Miner Two', Date.now());
    return { db, env: testEnv(db) };
  };
  const book = (db, id) => db.rows('SELECT at, tried, reader, error, refused_at AS refusedAt, pages, types FROM home_books WHERE structure_id = ?', id)[0] ?? null;
  const addBell = async (db, reader = ALT) => {
    const f = stubFetch([
      ['/universe/systems/30004807/', (url, init) => (init.headers?.Authorization ? reply({ error: 'a public read sent a login' }, 400) : { name: 'UALX-3', constellation_id: 20000703 })],
      ['/universe/constellations/20000703/', { region_id: 10000061 }],
    ]);
    try { await H.setHomeMarket(db, MAIN, { hub: BELL, name: 'UALX-3 - Mothership Bellicose', systemId: 30004807, reader }, NOW); } finally { f.restore(); }
  };
  const round = async (env, routes, now = NOW, opts = {}) => { const f = stubFetch(routes); try { return { r: await H.refreshHomeBooks(env, now, { want, ...opts }), calls: f.calls }; } finally { f.restore(); } };
  const refused = () => reply({ error: 'Market access denied' }, 403);
  eq('  the Worker asks for the permission the browser does (config.ts\'s SCOPE.structureMarkets)', H.SCOPE_STRUCTURE_MARKETS,
    fs.readFileSync(new URL('../src/lib/config.ts', import.meta.url), 'utf8').match(/structureMarkets: '([^']+)'/)[1]);

  // The defaults, a hub added, and a round reading all three.
  {
    const { db, env } = await setup();
    eq('  the defaults: Goonmetrics\' two, read with the main, with no row in D1', (await H.hubsOf(db, MAIN)).map((h) => [h.id, h.reader, h.kept, h.off]), [[UALX, MAIN, 'default', false], [CJ, MAIN, 'default', false]]);
    await addBell(db);
    eq('  a hub added: its system and region (read publicly), and its reader', db.rows('SELECT ledger, structure_id AS id, name, system_id AS sys, region_id AS reg, reader, removed_at AS gone FROM home_markets'),
      [{ ledger: MAIN, id: BELL, name: 'UALX-3 - Mothership Bellicose', sys: 30004807, reg: 10000061, reader: ALT, gone: null }]);
    const before = counts(db), seen = [];
    const { r } = await round(env, [
      [`/markets/structures/${UALX}/`, (url, init) => { seen.push(['ualx', whoAsked(init)]); return refused(); }],
      [`/markets/structures/${CJ}/`, (url, init) => { seen.push(['cj', whoAsked(init)]); return refused(); }],
      [`/markets/structures/${BELL}/`, (url, init) => { seen.push(['bell', whoAsked(init), url.searchParams.get('page')]); return pagesOf([PAGE1, PAGE2])(url); }],
    ]);
    eq('  one round reads every hub: Goonmetrics\' two refused, Bellicose read with the alt\'s own login, page by page', [r.done, seen.sort((x, y) => String(x).localeCompare(String(y)))],
      [{ [UALX]: 'refused', [CJ]: 'refused', [BELL]: 'read' }, [['bell', `CHARACTER:EVE:${ALT}`, '1'], ['bell', `CHARACTER:EVE:${ALT}`, '2'], ['cj', `CHARACTER:EVE:${MAIN}`], ['ualx', `CHARACTER:EVE:${MAIN}`]]]);
    eq('    nothing written under the main or the alt: a market is nobody\'s records', counts(db), before);
    eq('    the read kept: its time, two pages, the watched types only (PLEX left out)', book(db, BELL), { at: NOW, tried: NOW, reader: ALT, error: null, refusedAt: null, pages: 2, types: 3 });
    const got = await H.homeBookFor(db, MAIN, BELL);
    eq('    each type\'s best levels, its order counts and what its live orders sold', [got.at, got.rows[34], got.rows[25894], got.rows[35]], [new Date(NOW).toISOString(),
      [[[4.5, 800]], [[5, 500], [5.1, 1000]], 1, 3, [500, 200, 0, 0]], [[], [[7200000, 4]], 0, 1, [2, 0, 0, 0]], [[[11, 1]], [], 1, 0, [0, 0, 0, 1]]]);
    eq('    a refusal kept: when, by whom, why, and nothing read', book(db, UALX), { at: 0, tried: NOW, reader: MAIN, error: 'ESI 403: Market access denied', refusedAt: NOW, pages: null, types: 0 });
    eq('    a hub never read: no book', await H.homeBookFor(db, MAIN, UALX), null);
    const list = (await H.homeMarketsFor(db, MAIN)).hubs;
    eq('  GET /v1/home/markets: each hub, its reader and login, its own reads (types null, not 0, for a hub never read)', list.map((h) => [h.id, h.kept, h.off, h.reader, h.readerName, h.readerIsMain, h.login, h.book?.refusedAt ?? null, h.book?.types ?? null]), [
      [UALX, 'default', false, MAIN, 'Main', true, 'ok', new Date(NOW).toISOString(), null], [CJ, 'default', false, MAIN, 'Main', true, 'ok', new Date(NOW).toISOString(), null],
      [BELL, 'added', false, ALT, 'Miner Two', false, 'ok', null, 3]]);
    // Within the hour nothing is asked again; an hour on, every hub again, least recently read first: by its last good read, not its
    // last try (the two refused were tried ten minutes after Bellicose was read, so by the try Bellicose would go first).
    eq('  40 minutes on: nothing asked', (await round(env, [], NOW + 40 * 60_000)).calls.length, 0);
    db.run('UPDATE home_books SET tried = ? WHERE structure_id IN (?, ?)', NOW + 10 * 60_000, UALX, CJ);
    const order = [];
    const again = await round(env, [
      [`/markets/structures/${UALX}/`, () => { order.push(UALX); return refused(); }], [`/markets/structures/${CJ}/`, () => { order.push(CJ); return refused(); }],
      [`/markets/structures/${BELL}/`, (url) => { order.push(BELL); return pagesOf([PAGE1, PAGE2])(url); }],
    ], NOW + HOUR + 10 * 60_000);
    eq('  an hour on: the hubs never read first, the one read last', [order.filter((x, i) => order.indexOf(x) === i), again.r.done[BELL]], [[UALX, CJ, BELL], 'read']);
    eq('    a hub refused again keeps when it was first refused', book(db, UALX).refusedAt, NOW);
    // Accepted at last: a read clears the refusal.
    await round(env, [[`/markets/structures/${UALX}/`, pagesOf([PAGE1])], [`/markets/structures/${CJ}/`, refused], [`/markets/structures/${BELL}/`, pagesOf([PAGE1, PAGE2])]], NOW + 3 * HOUR);
    eq('    a read clears the refusal', [book(db, UALX).refusedAt, book(db, UALX).error, book(db, UALX).at], [null, null, NOW + 3 * HOUR]);
  }

  // A read cut short, a page failing, a market too big: the last good read stands (Review Focus 1).
  {
    const { db, env } = await setup();
    await addBell(db);
    // Bellicose alone, so the deadline below falls inside its read and not in another hub's.
    await H.dropHomeMarket(db, MAIN, UALX, NOW);
    await H.dropHomeMarket(db, MAIN, CJ, NOW);
    await round(env, [[`/markets/structures/${BELL}/`, pagesOf([PAGE1, PAGE2])], [/markets\/structures/, refused]]);
    const good = db.rows('SELECT data FROM home_books WHERE structure_id = ?', BELL)[0].data;
    // Page 1 takes 400 ms against a 200 ms deadline: whatever runs before it (two lookups, the login opened), the deadline falls inside it.
    const slow = (list) => async (url) => { await new Promise((res) => setTimeout(res, 400)); return pagesOf(list)(url); };
    const cut = await round(env, [[`/markets/structures/${BELL}/`, slow([PAGE2, PAGE1])], [/markets\/structures/, refused]], NOW + HOUR, { deadline: Date.now() + 200 });
    eq('  the deadline passing after page 1 of 2: nothing stored, the try stamped with why', [cut.r.done[BELL], book(db, BELL), db.rows('SELECT data FROM home_books WHERE structure_id = ?', BELL)[0].data === good],
      ['cut', { at: NOW, tried: NOW + HOUR, reader: ALT, error: 'Cut short at page 2 of 2 by the cloud’s time limit', refusedAt: null, pages: 2, types: 3 }, true]);
    const failing = await round(env, [[`/markets/structures/${BELL}/`, (url) => (url.searchParams.get('page') === '2' ? reply({ error: 'boom' }, 500) : pagesOf([PAGE2, PAGE1])(url))], [/markets\/structures/, refused]], NOW + 2 * HOUR);
    eq('  page 2 answering 500: nothing stored, said', [failing.r.done[BELL], book(db, BELL).error, book(db, BELL).at, db.rows('SELECT data FROM home_books WHERE structure_id = ?', BELL)[0].data === good], ['failed', 'Page 2 of 2 failed (ESI 500: boom)', NOW, true]);
    const big = await round(env, [[`/markets/structures/${BELL}/`, () => reply([], 200, 301)], [/markets\/structures/, refused]], NOW + 3 * HOUR);
    eq('  a market over 300 pages: not read at all, said', [big.r.done[BELL], book(db, BELL).error, big.calls.filter((c) => c.path === `/markets/structures/${BELL}/`).length], ['failed', 'Its market runs to 301 pages, more than the 300 the cloud reads in one go', 1]);
    eq('    and its last good read still serves', (await H.homeBookFor(db, MAIN, BELL)).at, new Date(NOW).toISOString());
    // Access lost after reads worked (Review Focus 2): a 403 keeps the last good read whole, and is dated from that hour.
    const lost = await round(env, [[`/markets/structures/${BELL}/`, refused], [/markets\/structures/, refused]], NOW + 4 * HOUR);
    eq('  a refusal after a good read: the read kept (time, pages, types, data, whose), the refusal dated and said',
      [lost.r.done[BELL], book(db, BELL), db.rows('SELECT data, read_by AS readBy FROM home_books WHERE structure_id = ?', BELL)[0], (await H.homeBookFor(db, MAIN, BELL)).at],
      ['refused', { at: NOW, tried: NOW + 4 * HOUR, reader: ALT, error: 'ESI 403: Market access denied', refusedAt: NOW + 4 * HOUR, pages: 2, types: 3 }, { data: good, readBy: ALT }, new Date(NOW).toISOString()]);
    const said = (await H.homeMarketsFor(db, MAIN)).hubs.find((h) => h.id === BELL).book;
    eq('    and the list carries both: the refusal and the last good read, by whom', [said.refusedAt, said.at, said.readByName], [new Date(NOW + 4 * HOUR).toISOString(), new Date(NOW).toISOString(), 'Miner Two']);
  }

  // A reader whose login can't read: no call to EVE, said from the keys (Review Focus 4).
  {
    const { db, env } = await setup({ altScopes: SCOPES });
    await addBell(db);
    const r = await round(env, [[/markets\/structures/, refused]]);
    eq('  the alt\'s login without the permission: skipped, EVE not asked for it', [r.r.done[BELL], r.calls.some((c) => c.path === `/markets/structures/${BELL}/`), book(db, BELL)], ['skipped', false, null]);
    eq('    and the list says why', (await H.homeMarketsFor(db, MAIN)).hubs.find((h) => h.id === BELL).login, 'permission');
    db.run('UPDATE keys SET scopes = ?, refused_at = ?, refused = ? WHERE purpose = ?', [...SCOPES, MARKETS].join(' '), NOW, 'invalid_grant', `alt:${ALT}`);
    eq('  a login EVE refused: skipped, said', [(await round(env, [[/markets\/structures/, refused]], NOW + HOUR)).r.done[BELL], (await H.homeMarketsFor(db, MAIN)).hubs.find((h) => h.id === BELL).login], ['skipped', 'refused']);
    db.run('UPDATE alts SET removed_at = ? WHERE char_id = ?', NOW, ALT);
    eq('  a reader taken off the roster: skipped, never read with the main instead, said', [(await round(env, [[/markets\/structures/, refused]], NOW + 2 * HOUR)).calls.some((c) => c.path === `/markets/structures/${BELL}/`), (await H.homeMarketsFor(db, MAIN)).hubs.find((h) => h.id === BELL).login], [false, 'notYours']);
    db.run(`DELETE FROM keys WHERE purpose = 'main'`);
    eq('  no main login kept: no ledger to read for, nothing asked', (await round(env, [], NOW + 3 * HOUR)).calls.length, 0);
  }

  // The deploy-day state: the main's own cloud login, handed over before the permission was asked, reads nothing and says why
  // (Review Focus 4): "hand the cloud your login again", never a failure or a refusal.
  {
    const { db, env } = await setup({ mainScopes: SCOPES });
    const r = await round(env, [[/markets\/structures/, refused]]);
    eq('  the main\'s cloud login without the permission: both defaults skipped, EVE never asked, nothing stamped',
      [r.r.done, r.calls.filter((c) => c.path.startsWith('/markets/structures/')).length, db.rows('SELECT COUNT(*) AS n FROM home_books')[0].n], [{ [UALX]: 'skipped', [CJ]: 'skipped' }, 0, 0]);
    eq('    the list says the permission, for both, with no book to call a failure or a refusal',
      (await H.homeMarketsFor(db, MAIN)).hubs.map((h) => [h.id, h.readerIsMain, h.login, h.book]), [[UALX, true, 'permission', null], [CJ, true, 'permission', null]]);
  }

  // Choices: a default switched off and on, a reader that isn't yours, a hub without its place, the cap.
  {
    const { db, env } = await setup();
    await H.dropHomeMarket(db, MAIN, UALX, NOW);
    eq('  a default switched off: kept as a row with removed_at, listed off, not read', [(await H.hubsOf(db, MAIN)).find((h) => h.id === UALX).off, (await round(env, [[/markets\/structures/, refused]])).calls.some((c) => c.path === `/markets/structures/${UALX}/`)], [true, false]);
    await H.setHomeMarket(db, MAIN, { hub: UALX, reader: ALT }, NOW);
    eq('    and on again, with the alt reading it: no public read needed for a default\'s place', (await H.hubsOf(db, MAIN)).find((h) => h.id === UALX), { id: UALX, name: 'UALX-3 - 1st Byzantigoon', systemId: 30004807, regionId: 10000061, reader: ALT, kept: 'default', off: false });
    await rejects('  a reader that isn\'t one of yours', () => H.setHomeMarket(db, MAIN, { hub: CJ, reader: 900555 }, NOW), /isn’t one of yours/);
    await rejects('  a new hub without its name and system', () => H.setHomeMarket(db, MAIN, { hub: 1047777777777, reader: MAIN }, NOW), /needs its name and system/);
    await rejects('  a book of a hub that isn\'t yours', () => H.homeBookFor(db, MAIN, 1047777777777), /Not one of your home markets/);
    await rejects('  removing a hub you never added', () => H.dropHomeMarket(db, MAIN, 1047777777777, NOW), /Not one of your home markets/);
    for (let i = 0; i < H.MAX_ADDED; i++) db.run('INSERT INTO home_markets (ledger, structure_id, name, system_id, region_id, reader, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)', MAIN, 1047000000000 + i, `Hub ${i}`, 30004807, 10000061, MAIN, NOW);
    await rejects('  ten added is the most', () => H.setHomeMarket(db, MAIN, { hub: 1047999999999, name: 'One more', systemId: 30004807, reader: MAIN }, NOW), /10 home markets is the most/);
    db.run('INSERT INTO home_markets (ledger, structure_id, name, system_id, region_id, reader, added_at, removed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', MAIN, 1047888888888, 'Removed once', 30004807, 10000061, MAIN, NOW, NOW);
    await rejects('  an eleventh re-added from removed: refused with the cap\'s message', () => H.setHomeMarket(db, MAIN, { hub: 1047888888888, reader: MAIN }, NOW), /10 home markets is the most/);
    await H.setHomeMarket(db, MAIN, { hub: 1047000000000, reader: ALT }, NOW);
    eq('    a live hub changing reader is not counted again', db.rows('SELECT reader FROM home_markets WHERE structure_id = ?', 1047000000000)[0].reader, ALT);
  }

  // The hour's variance: a hub tried late in one hour is due at the next hour's start (BOOK_DUE_MS).
  {
    const { db, env } = await setup();
    await addBell(db);
    await H.dropHomeMarket(db, MAIN, UALX, NOW);
    await H.dropHomeMarket(db, MAIN, CJ, NOW);
    db.run('INSERT INTO home_books (structure_id, at, data, pages, types, tried, reader, read_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', BELL, NOW, '{}', 1, 0, NOW + 12.5 * 60_000, ALT, ALT);
    const r = await round(env, [[`/markets/structures/${BELL}/`, pagesOf([PAGE1])]], NOW + HOUR);
    eq('  a hub tried at :50:30 is due at the next hour\'s :38 (47.5 minutes on)', [r.r.done[BELL], book(db, BELL).tried], ['read', NOW + HOUR]);
  }

  // A token that runs out mid-read is asked for again before the next page, and its 403 is not the structure refusing the reader.
  {
    const { db, env } = await setup();
    await addBell(db);
    await H.dropHomeMarket(db, MAIN, UALX, NOW);
    await H.dropHomeMarket(db, MAIN, CJ, NOW);
    const fresh = fakeToken(ALT, 'Miner Two', [...SCOPES, MARKETS], Math.floor(Date.now() / 1000) + 7200);
    const seen = [];
    const f = stubFetch([
      ['/v2/oauth/token', () => ({ access_token: fresh, refresh_token: 'refresh-2' })],
      [`/markets/structures/${BELL}/`, (url, init) => {
        const t = (init.headers?.Authorization ?? '').replace('Bearer ', '');
        const n = Number(url.searchParams.get('page'));
        seen.push([n, t === fresh ? 'fresh' : 'old']);
        // The first token runs out after page 1: with two minutes left, the stored one is replaced on the next ask.
        if (n === 1) db.run('UPDATE keys SET access_exp = ? WHERE purpose = ?', Date.now() + 60_000, `alt:${ALT}`);
        return t === fresh || n === 1 ? pagesOf([PAGE1, PAGE2])(url) : refused();
      }],
    ]);
    let r;
    try { r = await H.refreshHomeBooks(env, NOW, { want }); } finally { f.restore(); }
    eq('  a token that expires mid-read: page 2 asks with a fresh one, the read lands, no refusal stamped', [r.done[BELL], seen, book(db, BELL).refusedAt, book(db, BELL).error], ['read', [[1, 'old'], [2, 'fresh']], null, null]);
  }

  // Read it now: one hub at once, with its reader, and its state back.
  {
    const { db, env } = await setup();
    await addBell(db, MAIN);
    const f = stubFetch([[`/markets/structures/${BELL}/`, pagesOf([PAGE1])]]);
    const st = await H.readHomeNow(env, MAIN, BELL);
    f.restore();
    // With the real watch set (no `want`): page 1 holds Tritanium, which it watches, and PLEX, which it doesn't.
    eq('  POST /v1/home/read: read at once with its reader, its state back', [st.id, st.login, st.book.types, st.book.error], [BELL, 'ok', 1, null]);
  }
}

console.log('\n--- Goonmetrics\' round starts where the last stopped, and says which types no round has reached (Task 18E) ---');
{
  const { refreshHomePrices, homePrices, REFRESH_MS } = await import('../worker/src/goonmetrics.ts');
  const NOW = Date.parse('2026-10-12T12:37:00Z'), CJ = 1049588174021;
  const xmlFor = (ids) => `<goonmetrics method="price_data" version="1.0"><price_data>${ids.map((id) => `<type id="${id}"><updated>2026-10-12T12:00:00Z</updated><all><weekly_movement>700</weekly_movement></all><buy><max>9.5</max><listed>100</listed></buy><sell><min>10</min><listed>200</listed></sell></type>`).join('')}</price_data></goonmetrics>`;
  const types = Array.from({ length: 400 }, (_, i) => 1000 + i);
  // A host that answers ten calls a round and then refuses every one (a rate limit no read has met yet).
  const round = async (db, now) => {
    const real = globalThis.fetch, asked = [];
    let n = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      asked.push([Number(url.searchParams.get('station_id')), Number(url.searchParams.get('type_id').split(',')[0])]);
      return ++n > 10 ? new Response('busy', { status: 429 }) : new Response(xmlFor(url.searchParams.get('type_id').split(',').map(Number)), { status: 200 });
    };
    try { return { r: await refreshHomePrices(db, now, types, async () => undefined, true), asked }; } finally { globalThis.fetch = real; }
  };
  const db = d1();
  const first = await round(db, NOW);
  eq('  the first round as before: UALX-3 whole, C-J6MT\'s first two batches, stopped', [first.asked.length, first.r.done, Object.keys((await homePrices(db, CJ)).prices).length], [13, { 'UALX-3': 'read', 'C-J6MT': 'partial' }, 100]);
  eq('    and the types no round has reached are said: C-J6MT\'s six batches not read', (await homePrices(db, CJ)).unread?.length, 300);
  const second = await round(db, NOW + REFRESH_MS);
  eq('  six hours on, C-J6MT starts at the batch after the last one tried (the 6th), not the first', second.asked.filter(([hub]) => hub === CJ)[0], [CJ, 1250]);
  for (let k = 2; k <= 4; k++) await round(db, NOW + k * REFRESH_MS);
  const cj = await homePrices(db, CJ);
  eq('  after five rounds every batch has been read once, and nothing is left unread', [Object.keys(cj.prices).length, cj.unread ?? []], [400, []]);
  // A hub read before this change: nothing kept of where it stopped, so it starts from the first batch and takes its row as read.
  const dbOld = d1();
  dbOld.run("INSERT INTO home_prices (hub, source, at, data, tried) VALUES (?, 'goonmetrics', ?, '{}', ?)", CJ, NOW - REFRESH_MS, NOW - REFRESH_MS);
  const old = await round(dbOld, NOW);
  eq('  a hub read before: from the first batch, its earlier types not said unread', [old.asked.filter(([hub]) => hub === CJ)[0], ((await homePrices(dbOld, CJ)).unread ?? []).length], [[CJ, 1000], 0]);
  // Review I1: types added to the watch set after a state was kept are unread for a hub, not "no price", when the next round is cut before them.
  const dbG = d1();
  await round(dbG, NOW);
  const grown = [...types, ...Array.from({ length: 50 }, (_, i) => 2000 + i)];
  {
    const real = globalThis.fetch;
    let n = 0;
    globalThis.fetch = async () => (++n > 3 ? new Response('busy', { status: 429 }) : new Response('x', { status: 429 }));
    try { await refreshHomePrices(dbG, NOW + REFRESH_MS, grown, async () => undefined, true); } finally { globalThis.fetch = real; }
  }
  const gu = (await homePrices(dbG, CJ)).unread ?? [];
  eq('  a type added to the watch set is unread for a hub whose round was cut before it', [2000, 2049].map((t) => gu.includes(t)), [true, true]);
  // Review M2: a never-read stub row (at 0) is a hub never read, so a cut first round serves its unreached types as unread.
  const dbS = d1();
  dbS.run("INSERT INTO home_prices (hub, source, at, data, tried) VALUES (?, 'goonmetrics', 0, '{}', ?)", CJ, NOW - REFRESH_MS);
  await round(dbS, NOW);
  eq('  a stub row (never read) cut short: its unreached types are unread', ((await homePrices(dbS, CJ)).unread ?? []).length, 300);
  // Ruling 18E-1: a save whose write throws leaves its batches unread (the row doesn't hold them), and the next round still moves on.
  const dbT = d1();
  const throwing = { ...dbT, prepare: (sql) => { if (sql.includes('home_prices') && sql.includes('excluded.data')) throw new Error('disk full'); return dbT.prepare(sql); } };
  await round(throwing, NOW);
  const kept = JSON.parse((await dbT.prepare(`SELECT data FROM scan_meta WHERE key = 'goonmetrics'`).first()).data);
  eq('  a save that throws: the batches stay unread, and the next round still moves on', [kept.unread[CJ].length, kept.next[CJ]], [400, 5]);
}

console.log('\n--- the main\'s colonies, kept hourly (Planets task 5) ---');
{
  const { mainColoniesHourly } = await import('../worker/src/planets.ts');
  const { alertRound } = await import('../worker/src/alerts.ts');
  const { push } = await import('../worker/src/sync.ts');
  const docOf = (db, char, key) => { const r = db.rows('SELECT data FROM docs WHERE char_id = ? AND key = ?', char, key)[0]; return r ? JSON.parse(r.data) : null; };
  const rev = (db, char) => db.rows('SELECT rev FROM revs WHERE char_id = ?', char)[0]?.rev ?? 0;
  const PLANETS = 'esi-planets.manage_planets.v1', PLANET = 40307990, SYSTEM = 30000142;
  // A fixed instant outside EVE's downtime (10:55–11:30 UTC, when a failure isn't counted): with the clock, "and notes the failure"
  // failed when the suite ran in that window (the final review). `mainColoniesHourly` notes its job at the same `now`, the clock its
  // hour's gate reads.
  const NOW = Date.parse('2026-10-18T14:00:00Z'), ENDED = new Date(NOW - 3 * 3600_000).toISOString();
  const heads = [{ planet_id: PLANET, planet_type: 'barren', solar_system_id: SYSTEM, upgrade_level: 4, num_pins: 1, last_update: new Date(NOW - 600_000).toISOString() }];
  const colony = { pins: [{ pin_id: 1001, type_id: 2848, expiry_time: ENDED, install_time: new Date(NOW - 86400_000).toISOString(), last_cycle_start: new Date(NOW - 7200_000).toISOString(),
    extractor_details: { cycle_time: 1800, product_type_id: 2268, qty_per_cycle: 500, heads: [{ head_id: 0 }] } }], links: [], routes: [] };
  const routes = (over = {}) => [[`/characters/${MAIN}/planets/`, over.heads ?? heads], [`/characters/${MAIN}/planets/${PLANET}/`, over.colony ?? colony]];
  const jobRow = (db, job) => db.rows('SELECT detail, last_ok FROM jobs WHERE char_id = ? AND job = ?', MAIN, job);

  {
    const db = d1(), env = testEnv(db);
    await keepKey(db, MAIN, 'main', MAIN, 'Main', [...SCOPES, PLANETS]);
    const f = stubFetch(routes());
    await mainColoniesHourly(env, MAIN, NOW);
    eq('  kept under the main', docOf(db, MAIN, 'colonies')?.colonies.map((c) => [c.planetId, c.planetType]), [[PLANET, 'Barren']]);
    eq('  read with PI alerts off (no alerts doc, no sender)', JSON.parse(jobRow(db, 'pi')[0].detail), { colonies: 1 });
    const planetReads = () => f.calls.filter((c) => c.path === `/characters/${MAIN}/planets/`).length;
    const r0 = rev(db, MAIN);
    await mainColoniesHourly(env, MAIN, NOW + 60_000);
    eq('  not read again before the hour is up', planetReads(), 1);
    await mainColoniesHourly(env, MAIN, NOW + 3600_000);
    eq('  the same read again writes nothing', [planetReads(), rev(db, MAIN)], [2, r0]);
    f.restore();
    // A read older than the kept colony (another writer's newer one) can't roll it back, and pushes nothing.
    const newer = { ...docOf(db, MAIN, 'colonies').colonies[0], lastUpdate: new Date(NOW + 86400_000).toISOString(), level: 5 };
    await push(db, MAIN, { records: [], docs: [{ key: 'colonies', d: { colonies: [newer] } }] });
    const r1 = rev(db, MAIN);
    const g = stubFetch(routes());
    await mainColoniesHourly(env, MAIN, NOW + 2 * 3600_000);
    g.restore();
    eq('  an older read leaves a newer kept colony as it is and pushes nothing', [docOf(db, MAIN, 'colonies').colonies[0].level, rev(db, MAIN)], [5, r1]);
  }
  {
    // A 500 from ESI keeps the document and notes the failure.
    const db = d1(), env = testEnv(db);
    await keepKey(db, MAIN, 'main', MAIN, 'Main', [...SCOPES, PLANETS]);
    let f = stubFetch(routes()); await mainColoniesHourly(env, MAIN, NOW); f.restore();
    const before = JSON.stringify(docOf(db, MAIN, 'colonies')), r0 = rev(db, MAIN);
    f = stubFetch([[`/characters/${MAIN}/planets/`, new Response(JSON.stringify({ error: 'boom' }), { status: 500 })]]);
    await mainColoniesHourly(env, MAIN, NOW + 2 * 3600_000); f.restore();
    eq('  a failed read keeps the document and the revision', [JSON.stringify(docOf(db, MAIN, 'colonies')), rev(db, MAIN)], [before, r0]);
    eq('  and notes the failure', [true, db.rows("SELECT fails FROM jobs WHERE char_id = ? AND job = 'pi'", MAIN)[0].fails], [true, 1]);
  }
  {
    // A login without the planets permission: nothing read, no job row.
    const db = d1(), env = testEnv(db);
    await keepKey(db, MAIN, 'main', MAIN, 'Main', SCOPES);
    const f = stubFetch(routes());
    await mainColoniesHourly(env, MAIN, NOW);
    eq('  without the permission: no ESI call, no document, no job row', [f.calls.length, docOf(db, MAIN, 'colonies'), jobRow(db, 'pi').length], [0, null, 0]);
    f.restore();
  }
  {
    // In one round: the hourly read, then the alert round with PI mail on. The ended programme is found from the kept document alone.
    const db = d1(), env = testEnv(db);
    await keepKey(db, MAIN, 'main', MAIN, 'Main', [...SCOPES, PLANETS]);
    await keepKey(db, MAIN, 'mailer', SENDER, 'Postmaster', SCOPES);
    await push(db, MAIN, { records: [], docs: [{ key: 'alerts', d: { on: true, mail: true, quiet: false } }] });
    let f = stubFetch(routes());
    await mainColoniesHourly(env, MAIN, NOW);
    f.restore();
    f = stubFetch([[new RegExp(`^POST /characters/${SENDER}/mail/$`), 777], [/^GET \/universe\/systems\//, { name: 'Jita' }]]);
    const r = await alertRound(env, MAIN, NOW);
    const mails = f.calls.filter((c) => c.method === 'POST' && c.path === `/characters/${SENDER}/mail/`);
    eq('  the round mails the ended programme without reading the planets', [r.found >= 1, mails.length, f.calls.some((c) => c.path.includes('/planets/')), /PI PROGRAMME ENDED/.test(String(mails[0]?.body))], [true, 1, false, true]);
    f.restore();
  }
  {
    // The final review's M1: an alert round whose PI part throws is the round's failure, never the 'pi' job's. It noted 'pi', which
    // stamped its last run, so the hourly read (gated on it) skipped; with a failure every round the colonies stopped being kept.
    const db = d1(), env = testEnv(db);
    await keepKey(db, MAIN, 'main', MAIN, 'Main', [...SCOPES, PLANETS]);
    await keepKey(db, MAIN, 'mailer', SENDER, 'Postmaster', SCOPES);
    await push(db, MAIN, { records: [], docs: [{ key: 'alerts', d: { on: true, mail: true, quiet: false } }] });
    let f = stubFetch(routes());
    await mainColoniesHourly(env, MAIN, NOW);
    f.restore();
    const piRow = () => db.rows("SELECT last_run, last_ok, fails, last_error FROM jobs WHERE char_id = ? AND job = 'pi'", MAIN)[0];
    const before = piRow();
    // The kept colonies can't be read for the round (a D1 error), so working out the PI findings throws.
    const failing = { ...db, prepare: (sql) => { const st = db.prepare(sql); return /FROM docs WHERE char_id = \?1 AND key = \?2/.test(sql) ? { ...st, bind: (...a) => { if (a[1] === 'colonies') throw new Error('D1 refused the read'); return st.bind(...a); } } : st; } };
    const errors = [], realError = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    f = stubFetch([[new RegExp(`^POST /characters/${SENDER}/mail/$`), 777], [/^GET \/universe\/systems\//, { name: 'Jita' }]]);
    try { await alertRound({ ...env, DB: failing }, MAIN, NOW + 600_000); } finally { console.error = realError; f.restore(); }
    eq('  an alert round whose PI part throws leaves the pi job as the hourly read left it', piRow(), before);
    const alertsDetail = JSON.parse(db.rows("SELECT detail FROM jobs WHERE char_id = ? AND job = 'alerts'", MAIN)[0]?.detail ?? 'null');
    eq('  … logged, and kept in the alert round\'s own detail', [errors.length, alertsDetail?.piError], [1, 'D1 refused the read']);
    // The next hour's read still happens: the alert round didn't stamp 'pi'.
    f = stubFetch(routes());
    await mainColoniesHourly(env, MAIN, NOW + 3600_000);
    eq('  … so the next hour\'s read still runs', f.calls.filter((c) => c.path === `/characters/${MAIN}/planets/`).length, 1);
    f.restore();
  }
}

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
