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
/** Every table a character's data lives in, as "table:charId" → rows: what a reader may and may not have touched. */
const TABLES = ['records', 'docs', 'revs', 'jobs', 'mining_state', 'mining_ticks', 'safety_seen'];
const counts = (db) => Object.fromEntries(TABLES.flatMap((t) => db.rows(`SELECT char_id AS c, COUNT(*) AS n FROM ${t} GROUP BY char_id`).map((r) => [`${t}:${r.c}`, r.n])));
const under = (db, char) => Object.fromEntries(Object.entries(counts(db)).filter(([k]) => k.endsWith(`:${char}`)));

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

  // Removed while the copy was running.
  {
    const { db, env } = await withSender();
    const routes = esiFor(ALT);
    routes[0] = [`/characters/${ALT}/wallet/transactions/`, () => { db.run('DELETE FROM keys WHERE purpose = ?', `alt:${ALT}`); return []; }];
    const f = stubFetch(routes);
    await readAlt(env, altReader(MAIN, ALT)).catch(() => undefined);
    f.restore();
    eq('  an alt removed mid-read gets no records, documents or jobs', [kinds(db, ALT), db.rows('SELECT COUNT(*) AS n FROM docs WHERE char_id = ?', ALT)[0].n, db.rows('SELECT COUNT(*) AS n FROM jobs WHERE char_id = ?', ALT)[0].n], [{}, 0, 0]);
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

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
