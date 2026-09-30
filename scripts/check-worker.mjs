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
  const eve = (char, name) => [
    [/^POST \/v2\/oauth\/token$/, { access_token: fakeToken(char, name, SCOPES), refresh_token: `rotated-${char}` }],
    [/^POST \/v2\/oauth\/revoke$/, {}],
  ];
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
    eq('  the mail sender came back: kept as the sender\'s login, nothing added', [r.body.kept.as, keysOf(db), db.rows('SELECT COUNT(*) AS n FROM alts')[0].n], ['mailer', [`alt:${ALT}=${ALT}`, `mailer=${SENDER}`, `main=${MAIN}`], 1]);
    eq('    with the permissions it came back with, so mail carries on', db.rows(`SELECT scopes FROM keys WHERE purpose = 'mailer'`)[0].scopes.includes('esi-mail.send_mail.v1'), true);
  }

  // The reverse slip: a sender login that turns out to be an alt.
  {
    const { db, env } = await fresh();
    let f = stubFetch(eve(ALT, 'Miner Two'));
    await ask(env, 'POST', '/v1/keys', { purpose: 'alt', refreshToken: 'x' });
    const r = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'y' });
    f.restore();
    eq('  a sender login that is an alt is refused, saying what happened', [r.status, /one of your characters, not your mail sender/.test(r.body.error), /Hand Miner Two over again/.test(r.body.error)], [400, true, true]);
    eq('    the real sender is left alone', keysOf(db).includes(`mailer=${SENDER}`), true);
    eq('    the alt\'s login is marked refused at once', db.rows('SELECT refused_at IS NOT NULL AS r FROM keys WHERE purpose = ?', `alt:${ALT}`)[0].r, 1);
    eq('    and the login that can\'t be kept is revoked at EVE', f.calls.some((c) => c.path === '/v2/oauth/revoke'), true);

    // Once removed from the roster, the same character may be the sender.
    f = stubFetch(eve(ALT, 'Miner Two'));
    await ask(env, 'DELETE', `/v1/alts/${ALT}?data=keep`);
    const r2 = await ask(env, 'POST', '/v1/keys', { purpose: 'mailer', refreshToken: 'y' });
    f.restore();
    eq('  a character removed from the roster can be the sender', [r2.status, r2.body.kept.as, keysOf(db)], [200, 'mailer', [`mailer=${ALT}`, `main=${MAIN}`]]);
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
}

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
