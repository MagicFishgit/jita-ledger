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

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
