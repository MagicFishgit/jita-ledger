// Verification harness for the pure logic that has no UI to eyeball.
// Run with: npm run check   (Node strips the TypeScript types natively)
import { statsFrom, pickPages, passesGate, warningsFor, expectedEdge, sortProspects, FIRST_DIR, DEFAULT_FILTERS } from '../src/lib/prospects.ts';
import { dueForSync } from '../src/lib/schedule.ts';
import { adviseRelist, byUrgency } from '../src/lib/relist.ts';

let failed = 0;
const eq = (label, got, want) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) < 1e-9 : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.log(`  FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
const DAY = 86400_000;
const NOW = Date.parse('2026-09-24T12:00:00Z');
const dayAgo = (n) => new Date(NOW - n * DAY).toISOString().slice(0, 10);
const rows = (n, f = () => ({})) =>
  Array.from({ length: n }, (_, i) => ({
    date: dayAgo(i + 1), average: 100, highest: 110, lowest: 90, volume: 1000, order_count: 20, ...f(i),
  }));

console.log('--- statsFrom ---');
const steady = statsFrom(1, rows(30), NOW);
eq('daysTraded steady', steady.daysTraded, 30);
eq('tradesPerDay', steady.tradesPerDay, 20);
eq('unitsPerDay', steady.unitsPerDay, 1000);
eq('spikiness steady', steady.spikiness, 1 / 30);
eq('dailyRange', steady.dailyRange, 0.2);
eq('spark length', steady.spark.length, 30);

// The case the whole page exists to reject: a healthy monthly total, all on one day.
const spike = statsFrom(2, [{ date: dayAgo(1), average: 100, highest: 110, lowest: 90, volume: 30000, order_count: 40 }], NOW);
eq('daysTraded spike', spike.daysTraded, 1);
eq('spikiness spike', spike.spikiness, 1);

// Gaps are real: ESI omits days with no trades.
const gappy = statsFrom(3, rows(30).filter((_, i) => i % 3 === 0), NOW);
eq('daysTraded gappy', gappy.daysTraded, 10);
eq('spark zeroes on gaps', gappy.spark.filter((v) => v === 0).length, 20);

// A falling price shows as a negative trend.
const falling = statsFrom(4, rows(90, (i) => ({ average: 100 + i })), NOW);
if (!(falling.trend < -0.05)) { failed++; console.log(`  FAIL trend falling: ${falling.trend}`); }

// Dead items return null rather than flattering stats.
eq('dead item', statsFrom(5, [{ date: '2025-01-01', average: 1, highest: 1, lowest: 1, volume: 5, order_count: 1 }], NOW), null);
eq('no rows', statsFrom(6, [], NOW), null);
eq('excludes today', statsFrom(7, [{ date: dayAgo(0), average: 1, highest: 1, lowest: 1, volume: 5, order_count: 1 }], NOW), null);

console.log('\n--- pickPages ---');
const seq = (() => { let i = 1; return () => ((i = (i * 9301 + 49297) % 233280), i / 233280); })();
for (const [total, want] of [[408, 20], [5, 20], [1, 20], [20, 20]]) {
  const p = pickPages(total, want, seq);
  eq(`pickPages(${total},${want}) length`, p.length, Math.min(total, want));
  eq(`pickPages(${total},${want}) distinct`, new Set(p).size, p.length);
  if (p.some((n) => n < 1 || n > total)) { failed++; console.log(`  FAIL out of range: ${p}`); }
  if (p[0] !== 1) { failed++; console.log(`  FAIL must include page 1: ${p}`); }
}

console.log('\n--- passesGate ---');
const base = { daysTraded: 25, tradesPerDay: 10, spikiness: 0.2 };
const gate = (over) => passesGate({ ...base, ...over }, DEFAULT_FILTERS);
eq('healthy passes', gate({}), true);
eq('trades once a month fails', gate({ daysTraded: 1, tradesPerDay: 1 }), false);
eq('too few trading days fails', gate({ daysTraded: 19 }), false);
eq('boundary trading days passes', gate({ daysTraded: 20 }), true);
eq('too few trades fails', gate({ tradesPerDay: 4 }), false);
eq('boundary trades passes', gate({ tradesPerDay: 5 }), true);
eq('one big day fails', gate({ spikiness: 0.51 }), false);
eq('boundary spikiness passes', gate({ spikiness: 0.5 }), true);
// A month of volume on one day is the exact case this page exists to reject.
eq('spike month rejected', passesGate(spike, DEFAULT_FILTERS), false);
eq('steady month accepted', passesGate(steady, DEFAULT_FILTERS), true);

console.log('\n--- warningsFor ---');
const deep = { buyOrders: 40, sellOrders: 40, topBuys: [], topSells: [] };
const st = { dailyRange: 0.08, trend: 0, tradesPerDay: 20 };
eq('clean', warningsFor(st, deep, 0.09, 100), []);
eq('thin book', warningsFor(st, { ...deep, sellOrders: 4 }, 0.09, 100), ['thin']);
eq('fluke spread', warningsFor(st, deep, 0.3, 100), ['fluke']);
eq('falling knife', warningsFor({ ...st, trend: -0.2 }, deep, 0.09, 100), ['falling']);
eq('crowded book', warningsFor(st, deep, 0.09, 500), ['crowded']);
eq('all at once', warningsFor({ dailyRange: 0.05, trend: -0.5, tradesPerDay: 2 }, { ...deep, buyOrders: 1 }, 0.9, 400),
   ['thin', 'fluke', 'falling', 'crowded']);
// No habitual range to compare against means no fluke claim.
eq('no range, no fluke', warningsFor({ ...st, dailyRange: 0 }, deep, 5, 100), []);

console.log('\n--- expectedEdge ---');
const BE = 0.073; // break-even spread at a 1.5% broker fee and 3.38% sales tax
// Mexallon: enormous volume, 0.14% daily range. No amount of turnover survives the fees.
eq('thin range pays nothing', expectedEdge({ dailyRange: 0.0014, avgPrice: 100, unitsPerDay: 1e9 }, BE, 0.1), 0);
eq('range exactly at break-even pays nothing', expectedEdge({ dailyRange: BE, avgPrice: 1e6, unitsPerDay: 100 }, BE, 0.1), 0);
// A wide daily range on modest volume beats a razor spread on huge volume.
const wide = expectedEdge({ dailyRange: 0.2, avgPrice: 1e6, unitsPerDay: 50 }, BE, 0.1);
const fat = expectedEdge({ dailyRange: 0.02, avgPrice: 100, unitsPerDay: 1e9 }, BE, 0.1);
if (!(wide > 0 && fat === 0)) { failed++; console.log(`  FAIL ranking: wide=${wide} fat=${fat}`); }
eq('edge scales with share', expectedEdge({ dailyRange: 0.173, avgPrice: 1000, unitsPerDay: 10 }, BE, 0.5), 0.1 * 1000 * 10 * 0.5);

console.log('\n--- demoting flagged items ---');
// rankProspects does this sort; replicated here because it lives behind ESI and store imports.
const order = (list, demote) => [...list]
  .sort((a, b) => (demote ? a.warnings.length - b.warnings.length : 0) || b.roi - a.roi)
  .map((x) => x.id);
const list = [
  { id: 'messy-best', roi: 2.8, warnings: ['thin', 'fluke'] },
  { id: 'clean-ok', roi: 0.2, warnings: [] },
  { id: 'one-flag', roi: 0.9, warnings: ['falling'] },
  { id: 'clean-good', roi: 0.5, warnings: [] },
];
eq('off: pure return order', order(list, false), ['messy-best', 'one-flag', 'clean-good', 'clean-ok']);
eq('on: clean first, then by flag count', order(list, true), ['clean-good', 'clean-ok', 'one-flag', 'messy-best']);
// A single common flag must still beat a pile of them.
eq('one flag outranks three', order([
  { id: 'three', roi: 9, warnings: ['thin', 'fluke', 'crowded'] },
  { id: 'one', roi: 0.1, warnings: ['falling'] },
], true), ['one', 'three']);
// Within a group, return still decides.
eq('return decides within a group', order([
  { id: 'lo', roi: 0.1, warnings: ['thin'] },
  { id: 'hi', roi: 0.4, warnings: ['falling'] },
], true), ['hi', 'lo']);

console.log('\n--- dueForSync ---');
const T = Date.parse('2026-09-25T12:00:00Z');
const at = (min) => new Date(T + min * 60_000).toISOString();
const due = (m) => dueForSync(m, T);
eq('never synced -> ask now', due({}), true);
// The floor holds even when ESI says data is already available.
eq('synced 30s ago -> wait', due({ lastSync: at(-0.5), nextSyncAt: at(-99) }), false);
// Follow ESI's clock, not ours.
eq('expiry still ahead -> wait', due({ lastSync: at(-5), nextSyncAt: at(10) }), false);
eq('expiry passed -> ask', due({ lastSync: at(-5), nextSyncAt: at(-1) }), true);
eq('expiry exactly now -> ask', due({ lastSync: at(-5), nextSyncAt: at(0) }), true);
// Without an expiry, fall back to the old fixed interval.
eq('no expiry, 10 min -> wait', due({ lastSync: at(-10) }), false);
eq('no expiry, 20 min -> ask', due({ lastSync: at(-20) }), true);
eq('unparseable expiry falls back', due({ lastSync: at(-20), nextSyncAt: 'not a date' }), true);
eq('unparseable expiry, too soon', due({ lastSync: at(-2), nextSyncAt: 'not a date' }), false);
// The old blind poll would have fired here; ESI has nothing new for another 40 minutes.
eq('old 15-min poll would waste a call', due({ lastSync: at(-16), nextSyncAt: at(44) }), false);
// After a failure, sync pushes nextSyncAt out so a broken sync is not retried every 60 s forever.
eq('failed sync backs off', due({ lastSync: at(-90), nextSyncAt: at(4) }), false);
eq('backoff elapsed -> retry', due({ lastSync: at(-90), nextSyncAt: at(-1) }), true);

console.log('\n--- sortProspects ---');
const mk = (id, name, o = {}) => ({
  typeId: id, _name: name, roi: 0, net: 0, iskPerDay: 0, capital: 0, warnings: [],
  stats: { tradesPerDay: 0, daysTraded: 0, unitsPerDay: 0 }, ...o,
});
const NAMES = {};
const rowsOf = (...rs) => { rs.forEach((r) => (NAMES[r.typeId] = r._name)); return rs; };
const nm = (id) => NAMES[id];
const ids = (rs) => rs.map((r) => NAMES[r.typeId]);

const set = rowsOf(
  mk(1, 'Alpha', { roi: 0.1, stats: { tradesPerDay: 900, daysTraded: 30, unitsPerDay: 5000 }, iskPerDay: 10 }),
  mk(2, 'Bravo', { roi: 0.9, stats: { tradesPerDay: 10, daysTraded: 21, unitsPerDay: 50 }, iskPerDay: 300 }),
  mk(3, 'Charlie', { roi: 0.5, stats: { tradesPerDay: 400, daysTraded: 30, unitsPerDay: 900 }, iskPerDay: 50 }),
);
// The example from the request: click volume, get the highest-volume items first.
eq('volume desc', ids(sortProspects(set, { key: 'volume', dir: 'desc' }, nm)), ['Alpha', 'Charlie', 'Bravo']);
eq('volume asc', ids(sortProspects(set, { key: 'volume', dir: 'asc' }, nm)), ['Bravo', 'Charlie', 'Alpha']);
eq('return desc', ids(sortProspects(set, { key: 'roi', dir: 'desc' }, nm)), ['Bravo', 'Charlie', 'Alpha']);
eq('isk/day desc', ids(sortProspects(set, { key: 'iskPerDay', dir: 'desc' }, nm)), ['Bravo', 'Charlie', 'Alpha']);
eq('name asc', ids(sortProspects(set, { key: 'name', dir: 'asc' }, nm)), ['Alpha', 'Bravo', 'Charlie']);
eq('name desc', ids(sortProspects(set, { key: 'name', dir: 'desc' }, nm)), ['Charlie', 'Bravo', 'Alpha']);
// A first click should show the interesting end of each column.
eq('numbers open biggest-first', FIRST_DIR.volume, 'desc');
eq('names open A-Z', FIRST_DIR.name, 'asc');

// Ties fall back to name so the order cannot jitter between renders.
const tied = rowsOf(mk(4, 'Zulu', { roi: 0.2 }), mk(5, 'Kilo', { roi: 0.2 }), mk(6, 'Echo', { roi: 0.2 }));
eq('ties break by name', ids(sortProspects(tied, { key: 'roi', dir: 'desc' }, nm)), ['Echo', 'Kilo', 'Zulu']);

// Demotion stays the outer key, so a column sorts within each shelf.
const mixed = rowsOf(
  mk(7, 'Flagged-big', { stats: { tradesPerDay: 0, daysTraded: 0, unitsPerDay: 9999 }, warnings: ['thin'] }),
  mk(8, 'Clean-small', { stats: { tradesPerDay: 0, daysTraded: 0, unitsPerDay: 1 }, warnings: [] }),
  mk(9, 'Clean-big', { stats: { tradesPerDay: 0, daysTraded: 0, unitsPerDay: 500 }, warnings: [] }),
);
eq('demote off: pure volume', ids(sortProspects(mixed, { key: 'volume', dir: 'desc' }, nm, false)), ['Flagged-big', 'Clean-big', 'Clean-small']);
eq('demote on: clean first, still by volume', ids(sortProspects(mixed, { key: 'volume', dir: 'desc' }, nm, true)), ['Clean-big', 'Clean-small', 'Flagged-big']);

// Sorting must not mutate the caller's array.
const orig = [...set];
sortProspects(set, { key: 'roi', dir: 'asc' }, nm);
eq('does not mutate input', ids(set), ids(orig));

console.log('\n--- adviseRelist ---');
const R = { k: 0.00375, f: 0.015, t: 0.0338 };
const o = (id, isBuy, price, volume = 1) => ({ id, isBuy, price, volume });
const sell = { orderId: 1, typeId: 34, isBuy: false, price: 1000, volumeRemain: 100 };
const buy = { orderId: 5, typeId: 34, isBuy: true, price: 1000, volumeRemain: 100 };

// --- being in front ---
let r = adviseRelist(sell, { book: [o(1, false, 1000)] }, R);
eq('alone: front', r.verdict, 'front');
eq('alone: no best', r.best, null);
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 1000)] }, R);
eq('tied is still front', r.verdict, 'front');
r = adviseRelist(sell, { book: [o(1, false, 1000), o(9, true, 500)] }, R);
eq('other side is not competition', r.verdict, 'front');

// --- the case this exists for: a shallow queue on a fast item is not worth chasing ---
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 40)] }, { ...R });
eq('no volume data: cannot reassure, so move', r.verdict, 'move');
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 40)], dailyVolume: 5000 }, R);
eq('40 ahead of 5000/day: wait', r.verdict, 'wait');
eq('wait still reports the ahead depth', r.aheadUnits, 40);
eq('wait knows how many rivals', r.aheadOrders, 1);
// 40/5000 of a day = 11.5 min
if (!(r.hoursToFront > 0.15 && r.hoursToFront < 0.25)) { failed++; console.log(`  FAIL hoursToFront ${r.hoursToFront}`); }

// A deep queue on the same item is worth moving for.
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 20000)], dailyVolume: 5000 }, R);
eq('20000 ahead of 5000/day: move', r.verdict, 'move');
eq('move: ahead units', r.aheadUnits, 20000);
eq('move: ~4 days', Math.round(r.hoursToFront), 96);

// Only orders strictly in front count towards the queue.
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 30), o(3, false, 1100, 9999)], dailyVolume: 5000 }, R);
eq('orders behind you are not ahead of you', r.aheadUnits, 30);

// --- buy side mirrors it ---
r = adviseRelist(buy, { book: [o(5, true, 1000), o(6, true, 1010, 25)], dailyVolume: 5000 }, R);
eq('buy: shallow queue waits', r.verdict, 'wait');
eq('buy: moves up', r.newPrice, 1011);
r = adviseRelist(buy, { book: [o(5, true, 1000), o(6, true, 1010, 40000)], dailyVolume: 5000 }, R);
eq('buy: deep queue moves', r.verdict, 'move');

// --- chasing into a loss ---
// Matching them nets 950 * (1 - 0.015 - 0.0338) = 903.6, under a 960 average cost.
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 950, 99999)], dailyVolume: 5000, avgCost: 960 }, R);
eq('sell under cost: loss', r.verdict, 'loss');
// Same book, cheaper stock: worth moving.
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 950, 99999)], dailyVolume: 5000, avgCost: 500 }, R);
eq('sell above cost: move', r.verdict, 'move');
// Bidding 1011 when the best sell nets only 1000 * 0.9512 = 951 is buying at a loss.
r = adviseRelist(buy, { book: [o(5, true, 1000), o(6, true, 1010, 99999)], dailyVolume: 5000, bestSell: 1000 }, R);
eq('buy above resale: loss', r.verdict, 'loss');
r = adviseRelist(buy, { book: [o(5, true, 1000), o(6, true, 1010, 99999)], dailyVolume: 5000, bestSell: 5000 }, R);
eq('buy with room: move', r.verdict, 'move');

// Nothing legal below the floor.
r = adviseRelist({ orderId: 9, typeId: 34, isBuy: false, price: 0.02, volumeRemain: 10 },
  { book: [o(9, false, 0.02), o(10, false, 0.01, 9999)], dailyVolume: 5000 }, R);
eq('cannot undercut 0.01: loss', r.verdict, 'loss');

// --- costs still work ---
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 99999)], dailyVolume: 5000 }, R);
eq('new price a step under them', r.newPrice, 989.9);
eq('revenue given up', r.give, (1000 - 989.9) * 100);
eq('fee on the new value', r.fee, R.k * 989.9 * 100);
r = adviseRelist({ orderId: 7, typeId: 34, isBuy: false, price: 5, volumeRemain: 1 },
  { book: [o(7, false, 5), o(8, false, 4, 9999)], dailyVolume: 5000 }, R);
eq('100 ISK fee floor', r.fee, 100);

// The patience threshold is a setting, so the same book can read either way.
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 1000)], dailyVolume: 5000 }, R);
eq('default 4 h: 1000 of 5000/day (4.8 h) moves', r.verdict, 'move');
eq('patient trader leaves it', adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 1000)], dailyVolume: 5000 }, R, 8).verdict, 'wait');
eq('impatient trader moves it', adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 40)], dailyVolume: 5000 }, R, 0).verdict, 'move');
eq('very patient leaves a long queue', adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 20000)], dailyVolume: 5000 }, R, 168).verdict, 'wait');
// Being in front never depends on patience.
eq('front regardless of threshold', adviseRelist(sell, { book: [o(1, false, 1000)] }, R, 0).verdict, 'front');

console.log('\n--- rival concentration and your own queue ---');
// One wall: when it fills you are straight at the front.
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 900), o(3, false, 995, 100)], dailyVolume: 5000 }, R);
eq('one wall: rivals counted', r.aheadOrders, 2);
eq('one wall: top rival is most of it', Math.round(r.topRivalShare * 100), 90);
// A crowd: no single order dominates.
const crowd = Array.from({ length: 20 }, (_, i) => o(100 + i, false, 990 + i * 0.01, 50));
r = adviseRelist(sell, { book: [o(1, false, 1000), ...crowd], dailyVolume: 5000 }, R);
eq('crowd: rivals counted', r.aheadOrders, 20);
eq('crowd: no one dominates', Math.round(r.topRivalShare * 100), 5);
// Your own stock is its own wait, on top of the queue.
r = adviseRelist({ orderId: 1, typeId: 34, isBuy: false, price: 1000, volumeRemain: 2500 },
  { book: [o(1, false, 1000), o(2, false, 990, 5000)], dailyVolume: 5000 }, R);
eq('your stock is half a day', Math.round(r.yourHours), 12);
eq('queue ahead is a day', Math.round(r.hoursToFront), 24);
// With no volume data neither can be stated.
r = adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 10)] }, R);
eq('no volume: your wait unknown', Number.isFinite(r.yourHours), false);
// Nobody ahead means no concentration to report.
eq('alone: no top rival', adviseRelist(sell, { book: [o(1, false, 1000)] }, R).topRivalShare, 0);

console.log('\n--- byUrgency ---');
const u = (verdict, atRisk) => ({ verdict, atRisk });
eq('real relists first, then ISK at stake',
   [u('front', 999), u('wait', 500), u('move', 10), u('loss', 1), u('move', 900)]
     .sort(byUrgency).map((x) => `${x.verdict}:${x.atRisk}`),
   ['move:900', 'move:10', 'loss:1', 'wait:500', 'front:999']);

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
