// Verification harness for the pure logic that has no UI to eyeball.
// Run with: npm run check   (Node strips the TypeScript types natively)
import { statsFrom, pickPages, passesGate, warningsFor, expectedEdge, sortProspects, FIRST_DIR, DEFAULT_FILTERS } from '../src/lib/prospects.ts';
import { priceUp, tickDown } from '../src/lib/tick.ts';
import { dueForSync } from '../src/lib/schedule.ts';
import { adviseRelist, byUrgency, weightedLevel, marketBest } from '../src/lib/relist.ts';
import { valueOffer, byIskPerLp, patientPrice, instantPrice, daysToClear, planFor, notesFor, spendPlan } from '../src/lib/loyalty.ts';
import { parseFilament, byTier, runsFrom, TIERS } from '../src/lib/abyssal.ts';
import { judgeCourier, byRewardPerJump, byUsefulness } from '../src/lib/courier.ts';
import { parsePlanetType, planetsFor, estimate, inBand, P0_PER_P1 } from '../src/lib/pi.ts';

let failed = 0;
const eq = (label, got, want) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) < 1e-9 : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failed++; console.log(`  FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};
const has = (label, got, want) => {
  if (!got.includes(want)) { failed++; console.log(`  FAIL ${label}: ${JSON.stringify(got)} should include ${JSON.stringify(want)}`); }
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

console.log('\n--- absorption: can an item take what I want to invest? ---');
// The model: an item can absorb (units/day x my share x price x horizon) inside my horizon.
const absorb = (unitsPerDay, price, sharePct, days) => unitsPerDay * (sharePct / 100) * price * days;
// 5,000 units/day at 1,000 ISK is 5M ISK/day of flow; at a 10% share that is 500k a day.
eq('1 day of a small market', absorb(5000, 1000, 10, 1), 500_000);
eq('3 days of the same', absorb(5000, 1000, 10, 3), 1_500_000);
// So it cannot take 500M inside 3 days, and should be filtered out.
if (absorb(5000, 1000, 10, 3) >= 500e6) { failed++; console.log('  FAIL small market should not absorb 500M'); }
// A Large Skill Injector market: ~2,000/day at ~750M is 1.5 trillion a day of flow.
if (!(absorb(2000, 750e6, 10, 1) >= 1e9)) { failed++; console.log('  FAIL big market should absorb 1B in a day'); }
// Doubling the horizon doubles what it can take; halving the share halves it.
eq('horizon scales it', absorb(5000, 1000, 10, 6), absorb(5000, 1000, 10, 3) * 2);
eq('share scales it', absorb(5000, 1000, 5, 3), absorb(5000, 1000, 10, 3) / 2);
// Days to flip is the inverse: what you put in over what flows per day.
const flipDays = (budget, unitsPerDay, price, sharePct) => budget / (unitsPerDay * (sharePct / 100) * price);
eq('500k into a 500k/day market takes a day', flipDays(500_000, 5000, 1000, 10), 1);
eq('250k takes half a day', flipDays(250_000, 5000, 1000, 10), 0.5);

console.log('\n--- sell plan: what to ask for stock you are holding ---');
// A sale nets price x (1 - broker fee - sales tax), so break-even is cost / that.
const plan = (avgCost, bestSell, f, t) => {
  const keep = 1 - f - t;
  const suggested = tickDown(bestSell);
  return { breakEven: priceUp(avgCost / keep), suggested, ok: suggested * keep >= avgCost };
};
let pl = plan(1000, 2000, 0.015, 0.0338);
eq('break-even is above cost, not equal to it', pl.breakEven > 1000, true);
eq('break-even rounds onto a legal price', pl.breakEven, 1052);
// Rounding must go UP: the step below would not actually cover the cost.
eq('break-even really breaks even', pl.breakEven * (1 - 0.015 - 0.0338) >= 1000, true);
eq('one step lower would not', (pl.breakEven - 1) * (1 - 0.015 - 0.0338) >= 1000, false);
eq('suggested undercuts the market', pl.suggested, 1999);
eq('a wide spread clears', pl.ok, true);
// Stock bought above what it now sells for cannot be sold at a profit.
pl = plan(2500, 2000, 0.015, 0.0338);
eq('bought too high: flagged as a loss', pl.ok, false);
eq('and break-even is above the market', pl.breakEven > pl.suggested, true);
// Fees decide it at the margin: the same prices clear at low fees and not at high ones.
eq('clears at a low fee', plan(1900, 2000, 0.01, 0.02).ok, true);
eq('does not clear at a high one', plan(1900, 2000, 0.05, 0.05).ok, false);

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
r = adviseRelist(sell, { book: [o(1, false, 1000, 100), o(2, false, 990, 99999)], dailyVolume: 5000 }, R);
eq('new price a step under them', r.newPrice, 989.9);
eq('revenue given up', r.give, (1000 - 989.9) * 100);
eq('fee on the new value', r.fee, R.k * 989.9 * 100);
r = adviseRelist({ orderId: 7, typeId: 34, isBuy: false, price: 5, volumeRemain: 1 },
  { book: [o(7, false, 5), o(8, false, 4, 9999)], dailyVolume: 5000 }, R);
eq('100 ISK fee floor', r.fee, 100);

// The patience threshold is a setting, so the same book can read either way. These use a realistic
// order size: on a one-unit order the 100 ISK fee floor alone is a tenth of its value, which drowns
// out everything else.
const big = { orderId: 1, typeId: 34, isBuy: false, price: 1000, volumeRemain: 10000 };
const cheapCut = (aheadVol) => ({ book: [o(1, false, 1000, 10000), o(2, false, 999, aheadVol)], dailyVolume: 5000 });
// A 0.11% cut to save 4.8 hours: worth making, and past the 4 h default.
r = adviseRelist(big, cheapCut(1000), R);
eq('default 4 h: a cheap cut saving 4.8 h moves', r.verdict, 'move');
eq('patient trader leaves it', adviseRelist(big, cheapCut(1000), R, 8).verdict, 'wait');
// Patience cannot force a move that does not pay: a relist fee is fixed, so buying back a few
// minutes with one can never beat simply waiting those minutes out.
eq('impatient, but a fee to save 11 minutes never pays', adviseRelist(big, cheapCut(40), R, 0).verdict, 'wait');
eq('very patient leaves a long queue', adviseRelist(sell, { book: [o(1, false, 1000), o(2, false, 990, 20000)], dailyVolume: 5000 }, R, 168).verdict, 'wait');
// Being in front never depends on patience.
eq('front regardless of threshold', adviseRelist(sell, { book: [o(1, false, 1000)] }, R, 0).verdict, 'front');

console.log('\n--- your own order is read from the live book, not the stale copy ---');
// You relisted in game from 1000 down to 985. ESI still reports 1000 for up to twenty minutes,
// but the book already shows 985 under the same order id. The book must win.
const stale = { orderId: 1, typeId: 34, isBuy: false, price: 1000, volumeRemain: 100 };
r = adviseRelist(stale, { book: [o(1, false, 985, 100), o(2, false, 990, 5000)], dailyVolume: 5000 }, R);
eq('uses the live price', r.price, 985);
eq('so it knows you are in front', r.beaten, false);
eq('and says the price is live', r.live, true);
// Without the fix the stale 1000 would look beaten by the 990 rival.
eq('the stale price would have said beaten', 990 < stale.price, true);
// Remaining volume comes from the book too: you may have partly filled since the sync.
r = adviseRelist(stale, { book: [o(1, false, 1000, 40), o(2, false, 990, 5000)], dailyVolume: 5000 }, R);
eq('uses the live remaining volume', r.volumeRemain, 40);
eq('and prices the relist on it', r.fee, Math.max(100, R.k * 989.9 * 40));
// An order that has left the book entirely filled, expired or was cancelled.
r = adviseRelist(stale, { book: [o(2, false, 990, 5000)], dailyVolume: 5000 }, R);
eq('gone from the book', r.gone, true);
eq('gone is not a relist', r.verdict, 'front');
// An empty book says nothing either way, so do not claim the order is gone.
r = adviseRelist(stale, { book: [], dailyVolume: 5000 }, R);
eq('empty book is not proof of anything', r.gone, false);
eq('falls back to the stored price', r.price, 1000);
eq('and says the price is not live', r.live, false);

console.log('\n--- weightedLevel ignores token quantities ---');
// One unit at two thirds the going rate must not move where the book says the item trades.
eq('a single cheap unit does not shift the level',
   weightedLevel([o(1, false, 5055, 1), o(2, false, 7160, 1230), o(3, false, 7161, 991)]), 7160);
eq('real volume does shift it',
   weightedLevel([o(1, false, 5055, 5000), o(2, false, 7160, 100)]), 5055);
eq('empty book has no level', weightedLevel([]), 0);

console.log('\n--- marketBest skips a price that is not the market ---');
const lv = (price, volume) => ({ price, volume });
// The Cap Recharger book, as aggregated levels. One unit at 5,055 must not be the answer.
const recharger = [lv(5055, 1), lv(7160, 1230), lv(7161, 991), lv(7164, 2), lv(7166, 1105)];
eq('sell side skips the fat finger', marketBest(recharger, false), 7160);
// The Capacitor Transmitter book: 217 units of genuinely cheap stock IS the market.
const transmitter = [lv(23800, 1), lv(23900, 54), lv(24800, 2), lv(24900, 15), lv(25000, 143)];
eq('real cheap supply is not skipped', marketBest(transmitter, false), 23800);
// Several token orders stacked below still get skipped, together.
eq('skips a run of token orders', marketBest([lv(1000, 1), lv(1100, 1), lv(7160, 5000)], false), 7160);
// But once the skipped stock stops being a rounding error, it counts.
eq('stops skipping when the volume is real', marketBest([lv(5000, 400), lv(7160, 1000)], false), 5000);
// Buy side mirrored: an absurdly high bid of one unit is not the market either.
eq('buy side skips an absurd bid', marketBest([lv(9000, 1), lv(7160, 1230), lv(7159, 900)], true), 7160);
eq('empty book has no best', marketBest([], false), null);
// A thin book has no outlier to skip: the level sits on one of its own prices, so the best price
// is never far from it. It must always answer with a price that is really in the book.
eq('a two-order book answers with its own best', marketBest([lv(1000, 1), lv(2000, 1)], false), 1000);
eq('and on the buy side', marketBest([lv(1000, 1), lv(2000, 1)], true), 2000);

console.log('\n--- a mistaken price is not the market ---');
// The reported book: someone listed one unit at 5,055 against a market sitting at 7,160-7,177.
const fatBook = [
  o(1, false, 5055, 1), o(2, false, 7160, 1230), o(3, false, 7161, 991), o(4, false, 7164, 2),
  o(5, false, 7166, 1105), o(6, false, 7167, 783), o(7, false, 7177, 33),
];
const fatMine = { orderId: 2, typeId: 1, isBuy: false, price: 7160, volumeRemain: 1230 };
for (const [label, ctx] of [
  ['with history', { book: fatBook, dailyVolume: 500 }],
  ['with a slow item', { book: fatBook, dailyVolume: 5 }],
  ['with no history at all', { book: fatBook }],
]) {
  const v = adviseRelist(fatMine, ctx, R);
  eq(`fat-finger ignored ${label}`, v.verdict, 'wait');
  if (!/mistake or a token dump/.test(v.why)) { failed++; console.log(`  FAIL reason ${label}: ${v.why}`); }
}
// Without history the other two checks cannot fire, so this guard is the only thing standing between
// the user and a 29% cut to chase one unit. That is the case it exists for.
eq('no history: the cut it prevented', Math.round(adviseRelist(fatMine, { book: fatBook }, R).cutPct * 100), 29);

// A market that has genuinely moved must NOT be mistaken for an outlier: real volume at the new
// level, a modest gap, and enough stock ahead that waiting it out would take days.
const moved = [
  o(1, false, 7000, 900), o(2, false, 7001, 800), o(3, false, 7002, 700),
  o(4, false, 7160, 1230),
];
const r2 = adviseRelist({ orderId: 4, typeId: 1, isBuy: false, price: 7160, volumeRemain: 1230 },
  { book: moved, dailyVolume: 800 }, R);
if (/mistake or a token dump/.test(r2.why)) { failed++; console.log(`  FAIL real move called an outlier: ${r2.why}`); }
eq('a repriced market is chased, not ignored', r2.verdict, 'move');
eq('  and it is a small cut', Math.round(r2.cutPct * 1000) / 10, 2.2);
eq('  to save days, not minutes', Math.round(r2.hoursToFront), 72);

// Buy side mirrored: someone bidding far above the book is equally not the market.
const fatBuy = [o(1, true, 9000, 1), o(2, true, 7160, 1230), o(3, true, 7159, 900)];
const rb = adviseRelist({ orderId: 2, typeId: 1, isBuy: true, price: 7160, volumeRemain: 1230 },
  { book: fatBuy }, R);
eq('buy side: absurd bid ignored', rb.verdict, 'wait');
if (!/above where the rest of the book sits/.test(rb.why)) { failed++; console.log(`  FAIL buy reason: ${rb.why}`); }

console.log('\n--- a big cut to get past a thin skim is not worth making ---');
// The reported case, from a real book. 488 units at 34,430, with only 217 cheaper units ahead
// spread from 23,800 to 28,000, and the real market clustered at 34,430-34,490.
const skim = { orderId: 1, typeId: 1, isBuy: false, price: 34430, volumeRemain: 488 };
const skimBook = [
  o(1, false, 34430, 488), o(10, false, 23800, 1), o(11, false, 23900, 54), o(12, false, 24800, 2),
  o(13, false, 24900, 15), o(14, false, 25000, 143), o(15, false, 28000, 2),
  o(16, false, 34440, 3), o(17, false, 34490, 37),
];
// 217 ahead against ~260/day is about 20 hours.
r = adviseRelist(skim, { book: skimBook, dailyVolume: 260 }, R);
eq('the queue ahead', r.aheadUnits, 217);
eq('about 20 hours of it', Math.round(r.hoursToFront), 20);
eq('the move is a 31% cut', Math.round(r.cutPct * 100), 31);
// Burning ~31% of the order to save 20 hours is a ~37%/day return for doing nothing.
if (!(r.waitingPaysDaily > 0.3)) { failed++; console.log(`  FAIL waiting should pay hugely: ${r.waitingPaysDaily}`); }
eq('so: wait, not move', r.verdict, 'wait');
if (!/holding your price/.test(r.why)) { failed++; console.log(`  FAIL reason should say so: ${r.why}`); }

// A small cut to save the same wait IS worth making.
const cheapMove = { orderId: 1, typeId: 1, isBuy: false, price: 100, volumeRemain: 500 };
r = adviseRelist(cheapMove, { book: [o(1, false, 100, 500), o(2, false, 99.9, 217)], dailyVolume: 260 }, R);
eq('a 0.1% cut for the same wait: move', r.verdict, 'move');

// The same logic on the buy side: bidding 31% more to get in front is equally bad.
const skimBuy = { orderId: 1, typeId: 1, isBuy: true, price: 23800, volumeRemain: 488 };
r = adviseRelist(skimBuy, { book: [o(1, true, 23800, 488), o(2, true, 34430, 217)], dailyVolume: 260 }, R);
eq('buy side: large raise waits too', r.verdict, 'wait');
if (!(r.cutPct > 0.4)) { failed++; console.log(`  FAIL buy cut should be large: ${r.cutPct}`); }

// Patience is still a setting, but it cannot force a ruinous move.
eq('even an impatient trader waits on a 31% cut', adviseRelist(skim, { book: skimBook, dailyVolume: 260 }, R, 0).verdict, 'wait');
// A higher target return makes you fussier about what is worth holding for.
eq('a 60%/day target would take the move', adviseRelist(skim, { book: skimBook, dailyVolume: 260 }, R, 4, 0.6).verdict, 'move');
// With no volume data there is no waiting to value, so it falls through to the old behaviour.
r = adviseRelist(skim, { book: skimBook }, R);
eq('unknown pace: cannot value waiting', r.waitingPaysDaily, 0);

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
  { book: [o(1, false, 1000, 2500), o(2, false, 990, 5000)], dailyVolume: 5000 }, R);
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

console.log('\n--- valuing a loyalty point offer ---');
const price = (map) => (id) => map[id] ?? null;
// A plain offer: 5,000 LP and 5M ISK for 1 item that nets 20M.
const plain = { offerId: 1, typeId: 100, quantity: 1, lpCost: 5000, iskCost: 5_000_000, requiredItems: [] };
let v = valueOffer(plain, price({ 100: { net: 20_000_000, buy: 21_000_000 } }), 50_000);
eq('revenue is what selling nets', v.revenue, 20_000_000);
eq('outlay is the store price', v.outlay, 5_000_000);
eq('profit', v.profit, 15_000_000);
eq('ISK per LP', v.iskPerLp, 3000);
eq('runs your points afford', v.runs, 10);
eq('and the total that is worth', v.totalProfit, 150_000_000);

// Required items are part of the cost, and ignoring them flatters the offer badly.
const withReq = { ...plain, offerId: 2, requiredItems: [{ typeId: 200, quantity: 5000 }] };
v = valueOffer(withReq, price({ 100: { net: 20_000_000, buy: 21_000_000 }, 200: { net: 900, buy: 1000 } }), 50_000);
eq('buying the required items counts', v.itemsCost, 5_000_000);
eq('so the outlay is both', v.outlay, 10_000_000);
eq('and the profit is lower', v.profit, 10_000_000);
eq('required items use the BUY price, not the sell', v.itemsCost, 5000 * 1000);

// Quantity multiplies the output, not the cost.
v = valueOffer({ ...plain, offerId: 3, quantity: 100 }, price({ 100: { net: 200_000, buy: 210_000 } }), 5000);
eq('quantity multiplies revenue', v.revenue, 20_000_000);
eq('one run affordable', v.runs, 1);

// An offer that loses money must be allowed to say so rather than being hidden.
v = valueOffer(plain, price({ 100: { net: 1_000_000, buy: 1_100_000 } }), 5000);
eq('a bad offer reports a loss', v.profit, -4_000_000);
if (!(v.iskPerLp < 0)) { failed++; console.log('  FAIL a loss should read negative per LP'); }

// No price for the thing you would receive: there is no honest number, so drop it.
eq('unpriceable output is dropped', valueOffer(plain, price({}), 5000), null);
// No price for a required item: keep it, but say the outlay is understated.
v = valueOffer(withReq, price({ 100: { net: 20_000_000, buy: 21_000_000 } }), 5000);
eq('unpriceable requirement is flagged', v.unpriced, [200]);
eq('  and its cost is left out rather than guessed', v.itemsCost, 0);

// Not enough points to run it even once.
eq('too few points means no runs', valueOffer(plain, price({ 100: { net: 20_000_000, buy: 21_000_000 } }), 100).runs, 0);
eq('  but it is still ranked on its merits', valueOffer(plain, price({ 100: { net: 20_000_000, buy: 21_000_000 } }), 100).iskPerLp, 3000);
// Degenerate offers cannot be valued.
eq('no LP cost', valueOffer({ ...plain, lpCost: 0 }, price({ 100: { net: 1, buy: 1 } }), 100), null);
eq('no quantity', valueOffer({ ...plain, quantity: 0 }, price({ 100: { net: 1, buy: 1 } }), 100), null);

console.log('\n--- ranking is per point, not per ISK ---');
// A small offer with a better rate beats a huge one with a worse rate: points are the scarce thing.
const small = { iskPerLp: 1200, totalProfit: 400_000 };
const huge = { iskPerLp: 900, totalProfit: 90_000_000 };
eq('better rate ranks first', [huge, small].sort(byIskPerLp)[0].iskPerLp, 1200);

console.log('\n--- what a unit of loyalty loot is actually worth ---');
// Listing it: one legal step under the cheapest ask, less broker fee and sales tax.
let up = patientPrice({ bestSell: 1_000_000, bestBuy: 800_000 }, 0.03, 0.02);
eq('patient sale undercuts the ask', up.buy, 1_000_000);
// One legal step below 1,000,000 is 999,900 --- four significant figures, not a hundredth.
eq('patient net is the undercut ask less both charges', up.net, 999_900 * 0.95);
// Selling into a standing bid costs no broker fee --- only the tax.
up = instantPrice({ bestSell: 1_000_000, bestBuy: 800_000 }, 0.02);
eq('instant sale takes the bid', up.net, 800_000 * 0.98);
eq('  and still reports what buying one costs', up.buy, 1_000_000);
eq('nothing bidding means no instant sale', instantPrice({ bestSell: 1_000_000, bestBuy: null }, 0.02), null);
// Nothing listed at all: the bid stands in rather than inventing an ask.
eq('no asks falls back to the bid', patientPrice({ bestSell: null, bestBuy: 500_000 }, 0.03, 0.02).buy, 500_000);
eq('an empty book cannot be priced', patientPrice({ bestSell: null, bestBuy: null }, 0.03, 0.02), null);

console.log('\n--- how long the selling takes ---');
eq('a day at 100 a day', daysToClear(100, 100), 1);
eq('ten days at 10 a day', daysToClear(100, 10), 10);
// You do not get the whole market: a tenth of the flow is ten times the wait.
eq('your share stretches it', daysToClear(100, 100, 10), 10);
if (Number.isFinite(daysToClear(100, null))) { failed++; console.log('  FAIL no history should not read as instant'); }
if (Number.isFinite(daysToClear(100, 0))) { failed++; console.log('  FAIL nothing trading should not read as instant'); }

console.log('\n--- what to actually do with the points ---');
const impl = { quantity: 1, lpCost: 375, runs: 666, profit: 300_000, totalProfit: 199_800_000 };
// Affording 666 implants is not the same as being able to sell 666 of them.
let lpp = planFor(impl, 5, 7, 100);
eq('the market caps the runs', lpp.runs, 35);
eq('  not what the points afford', lpp.affordable, 666);
eq('  and the total follows the runs', lpp.profit, 35 * 300_000);
eq('  and it says which limit bit', lpp.limitedBy, 'market');
// A busy market, and the points are what run out.
lpp = planFor(impl, 5000, 7, 100);
eq('a busy market leaves the points the limit', lpp.runs, 666);
eq('  and says so', lpp.limitedBy, 'points');
// Your share of the flow is part of the cap, not an afterthought.
eq('a tenth of the flow caps it ten times harder', planFor(impl, 500, 7, 10).runs, 350);
eq('  where the whole flow would not have', planFor(impl, 500, 7, 100).runs, 666);
// Multi-unit offers eat the absorption faster.
eq('quantity is counted against absorption', planFor({ ...impl, quantity: 10 }, 100, 7, 100).runs, 70);
// No history: the cap cannot be worked out, so it is not invented.
lpp = planFor(impl, null, 7, 100);
eq('no history means no cap', lpp.absorbable, null);
eq('  and the affordable count stands', lpp.runs, 666);
eq('  flagged as unknown rather than fine', lpp.limitedBy, 'unknown');
if (Number.isFinite(lpp.days)) { failed++; console.log('  FAIL an unknown pace should not read as a known one'); }
// With no points at all, the pace shown is still one run's worth rather than nothing.
eq('no points still shows one run\u2019s pace', planFor({ ...impl, runs: 0 }, 5, 7, 100).days, 0.2);

console.log('\n--- why an offer sits where it does ---');
// A capped plan always fills the horizon, so the pace judgment has to come from one run, not the plan.

const lpv = (o) => ({
  offerId: 1, typeId: 100, quantity: 10, lpCost: 1000, revenue: 10_000_000, iskCost: 0,
  itemsCost: 0, outlay: 0, profit: 1_000_000, iskPerLp: 1000, runs: 1, totalProfit: 1_000_000,
  unpriced: [], ...o,
});
const quick = { affordable: 5, absorbable: 50, runs: 5, units: 50, days: 0.5, limitedBy: 'points', profit: 5 };
const crawling = { affordable: 5, absorbable: 50, runs: 5, units: 50, days: 30, limitedBy: 'points', profit: 5 };
const unknownPace = { affordable: 5, absorbable: null, runs: 5, units: 50, days: Infinity, limitedBy: 'unknown', profit: 5 };
const squeezed = { affordable: 500, absorbable: 20, runs: 20, units: 20, days: 7, limitedBy: 'market', profit: 20 };
let notes = notesFor(lpv({ iskPerLp: 2500 }), { medianRate: 1000, plan: quick, runDays: 0.5, live: true });
has('twice the usual rate is called out', notes, 'topRate');
has('  and a quick seller says so', notes, 'fast');
has('more points than the market will take is called out', notesFor(lpv({}), { medianRate: 1000, plan: squeezed, runDays: 1, live: true }), 'capped');
has('a poor rate is called out', notesFor(lpv({ iskPerLp: 400 }), { medianRate: 1000, plan: quick, runDays: 0.5, live: true }), 'poorRate');
has('a loss is called out', notesFor(lpv({ profit: -5, iskPerLp: -1 }), { medianRate: 1000, plan: quick, runDays: 0.5, live: true }), 'loss');
// A loss is the story; whether the rate beats the median is not.
if (notesFor(lpv({ profit: -5, iskPerLp: 2500 }), { medianRate: 1000, plan: quick, runDays: 0.5, live: true }).includes('topRate')) {
  failed++; console.log('  FAIL a losing offer must not be praised for its rate');
}
has('nothing trading is a warning', notesFor(lpv({}), { medianRate: 1000, plan: unknownPace, runDays: Infinity, live: true }), 'illiquid');
has('a week to shift a single run is a warning', notesFor(lpv({}), { medianRate: 1000, plan: crawling, runDays: 30, live: true }), 'slow');
// Items you must buy first are real capital, and easy to overlook.
has('items you must front are called out', notesFor(lpv({ itemsCost: 4_000_000, outlay: 4_000_000 }), { medianRate: 1000, plan: quick, runDays: 0.5, live: true }), 'needsItems');
has('  and ISK left committed is called out', notesFor(lpv({ itemsCost: 7_000_000, outlay: 7_000_000 }), { medianRate: 1000, plan: quick, runDays: 0.5, live: true }), 'capitalHeavy');
has('an understated cost is flagged', notesFor(lpv({ unpriced: [7] }), { medianRate: 1000, plan: quick, runDays: 0.5, live: true }), 'unpriced');
has('a rough valuation says so', notesFor(lpv({}), { medianRate: 1000, plan: quick, runDays: 0.5, live: false }), 'rough');
has('worth listing rather than dumping', notesFor(lpv({}), { medianRate: 1000, plan: quick, runDays: 0.5, live: true, instantPerLp: 100 }), 'patienceMatters');
if (notesFor(lpv({}), { medianRate: 1000, plan: quick, runDays: 0.5, live: true, instantPerLp: 900 }).includes('patienceMatters')) {
  failed++; console.log('  FAIL a near-equal instant price needs no patience');
}

console.log('\n--- a capped plan is not the same as a slow item ---');
// The plan runs to the horizon by construction; the item itself sells a run in a day.
has('a market-capped plan on a fast item still reads fast',
  notesFor(lpv({}), { medianRate: 1000, plan: { ...squeezed, days: 7 }, runDays: 0.4, live: true }), 'fast');
if (notesFor(lpv({}), { medianRate: 1000, plan: { ...squeezed, days: 7 }, runDays: 0.4, live: true }).includes('slow')) {
  failed++; console.log('  FAIL filling the horizon is not the item being slow');
}

console.log('\n--- spending the whole pile, not one offer ---');
const cand = (offerId, typeId, iskPerLp, lpCost, profit, quantity = 1, runs = 1e9) =>
  ({ v: { offerId, typeId, quantity, lpCost, iskPerLp, profit, runs }, unitsAllowed: null });
// Best rate first.
let picks = spendPlan([cand(1, 10, 500, 1000, 500_000), cand(2, 20, 1500, 1000, 1_500_000)], 3000);
eq('the best rate is taken first', picks[0].offerId, 2);
eq('  and it takes everything it can', picks[0].runs, 3);
eq('  leaving nothing for the worse one', picks.length, 1);
// When the market caps the best one, the points move down the list rather than sitting idle.
picks = spendPlan([
  { ...cand(1, 10, 500, 1000, 500_000), unitsAllowed: 100 },
  { ...cand(2, 20, 1500, 1000, 1_500_000), unitsAllowed: 2 },
], 5000);
eq('the capped best one is taken to its limit', picks[0].runs, 2);
eq('  then the next best gets the rest', picks[1].offerId, 1);
eq('  which is the points left over', picks[1].runs, 3);
eq('  and the profit is both together', picks.reduce((t, p) => t + p.profit, 0), 2 * 1_500_000 + 3 * 500_000);
// Two offers for the SAME item compete for the same buyers.
picks = spendPlan([
  { ...cand(1, 10, 1500, 1000, 1_500_000), unitsAllowed: 5 },
  { ...cand(2, 10, 1000, 1000, 1_000_000), unitsAllowed: 5 },
], 100_000);
eq('the first offer takes the item\u2019s whole allowance', picks[0].runs, 5);
eq('  and the second gets none of it', picks.length, 1);
// Offers that lose money are never part of a plan, however many points are going spare.
eq('losing offers are left alone', spendPlan([cand(1, 10, -50, 1000, -50_000)], 100_000).length, 0);
// Multi-unit offers eat the allowance in units, not runs.
eq('quantity counts against the allowance',
  spendPlan([{ ...cand(1, 10, 500, 1000, 500_000, 10), unitsAllowed: 25 }], 100_000)[0].runs, 2);
// Not enough points for one run of anything.
eq('too few points buys nothing', spendPlan([cand(1, 10, 500, 1000, 500_000)], 999).length, 0);

console.log('\n--- telling a real filament from the junk in the same market group ---');
eq('a plain filament parses', parseFilament(1, 'Raging Dark Filament').tier, 'Raging');
eq('  and keeps its weather', parseFilament(1, 'Raging Dark Filament').weather, 'Dark');
eq('  and knows where it sits on the ladder', parseFilament(1, 'Raging Dark Filament').tierIndex, TIERS.indexOf('Raging'));
eq('the easiest tier is first', parseFilament(1, 'Tranquil Gamma Filament').tierIndex, 0);
// The filament market groups also carry event leftovers and warp matrix filaments. None are runs.
eq('expired event filaments are not runs', parseFilament(2, 'Expired Sinister Exotic Filament'), null);
eq('warp matrix filaments are not runs', parseFilament(3, 'Expired Curious Warp Matrix Filament'), null);
eq('jump filaments are not runs', parseFilament(4, 'Zarzakh Jump Filament'), null);
eq('a made-up tier is rejected', parseFilament(5, 'Furious Dark Filament'), null);
eq('a made-up weather is rejected', parseFilament(6, 'Raging Sunny Filament'), null);
// Ladder order, then weather, so the table reads as a progression.
const fl = (n) => parseFilament(1, n);
eq('sorted by difficulty first', [fl('Cataclysmic Dark Filament'), fl('Calm Gamma Filament')].sort(byTier)[0].tier, 'Calm');

console.log('\n--- what abyssal running actually paid, from the wallet ---');
const FIL = new Map([[100, fl('Raging Dark Filament')], [101, fl('Calm Exotic Filament')]]);
const LOOT = new Set([200, 201]);
const T0 = Date.parse('2026-09-01T00:00:00Z');
const tx = (typeId, isBuy, qty, unitPrice, day = 10) =>
  ({ typeId, isBuy, qty, unitPrice, date: `2026-09-${String(day).padStart(2, '0')}T12:00:00Z` });
let rs = runsFrom([
  tx(100, true, 10, 1_700_000),        // ten runs bought
  tx(200, false, 500, 40_000),         // loot sold
], FIL, LOOT, T0, 0.02);
eq('runs counted from filaments bought', rs.runs, 10);
eq('filament spend totalled', rs.spentOnFilaments, 17_000_000);
eq('loot proceeds are net of sales tax', rs.lootSold, 500 * 40_000 * 0.98);
eq('profit is loot less filaments', rs.profit, 500 * 40_000 * 0.98 - 17_000_000);
eq('and the number that matters is per run', rs.perRun, rs.profit / 10);
// Selling a filament is not running one, and buying loot is not looting it.
rs = runsFrom([tx(100, false, 5, 1_700_000), tx(200, true, 100, 40_000)], FIL, LOOT, T0, 0.02);
eq('selling filaments is not a run', rs.runs, 0);
eq('buying loot is not income', rs.lootSold, 0);
eq('  so there is no per-run figure to give', rs.perRun, null);
// Anything outside the window, or not abyssal at all, is none of this page's business.
eq('older transactions are outside the window', runsFrom([tx(100, true, 10, 1_700_000, 1)], FIL, LOOT, Date.parse('2026-09-05T00:00:00Z'), 0.02).runs, 0);
eq('unrelated items are ignored', runsFrom([tx(999, true, 10, 5), tx(998, false, 10, 5)], FIL, LOOT, T0, 0.02).runs, 0);
// Loot cannot be traced to the run it fell from, so the figure is pooled --- and says how pooled.
rs = runsFrom([tx(100, true, 90, 1_000_000), tx(101, true, 10, 70_000)], FIL, LOOT, T0, 0.02);
eq('the dominant filament is named', rs.topFilament.tier, 'Raging');
eq('  with its share of the runs', Math.round(rs.concentration * 100), 90);

console.log('\n--- courier contracts: a job or a trap ---');
const stn = (sec) => ({ kind: 'station', systemId: 30000142, security: sec, name: 'Somewhere' });
const unknowable = { kind: 'structure', systemId: null, security: null, name: null };
const job = {
  contractId: 1, reward: 20_000_000, collateral: 100_000_000, volume: 300_000,
  daysToComplete: 5, dateExpired: '2026-10-30T00:00:00Z', startId: 60003760, endId: 60000307, title: '',
};
const LIM = { maxVolume: 1_100_000, maxCollateral: 500_000_000, minRewardPerJump: 1_000_000 };
const NOWC = Date.parse('2026-09-26T00:00:00Z');
let cv = judgeCourier(job, stn(0.9), stn(0.8), 10, LIM, NOWC);
eq('a clean high-sec haul is safe', cv.safe, true);
eq('  and worth taking', cv.takeable, true);
eq('  paid per jump', cv.rewardPerJump, 2_000_000);
// The scam that costs people freighters: a destination you cannot even look up.
cv = judgeCourier(job, stn(0.9), unknowable, 10, LIM, NOWC);
has('an unresolvable destination is flagged', cv.flags, 'endUnknown');
eq('  and that is never safe', cv.safe, false);
// No high-sec route means the job cannot be done without leaving high-sec, whatever the endpoints say.
cv = judgeCourier(job, stn(0.9), stn(0.8), null, LIM, NOWC);
has('no secure route is flagged', cv.flags, 'noSafeRoute');
eq('  and that is not a relaxing evening', cv.safe, false);
has('a low-sec endpoint is flagged', judgeCourier(job, stn(0.9), stn(0.3), 10, LIM, NOWC).flags, 'lowsec');
// An unresolvable endpoint is already the story; don't also claim there is no route.
if (judgeCourier(job, stn(0.9), unknowable, null, LIM, NOWC).flags.includes('noSafeRoute')) {
  failed++; console.log('  FAIL cannot judge the route to a place we could not resolve');
}
// Fronting a fortune to earn a little is a bad bargain even when honest.
has('collateral dwarfing the reward is flagged',
  judgeCourier({ ...job, collateral: 5_000_000_000 }, stn(0.9), stn(0.8), 10, LIM, NOWC).flags, 'collateralHeavy');
has('  and over your own limit too',
  judgeCourier({ ...job, collateral: 5_000_000_000 }, stn(0.9), stn(0.8), 10, LIM, NOWC).flags, 'collateralOverLimit');
// Your hauler is the constraint the contract knows nothing about.
has('cargo bigger than your ship is flagged',
  judgeCourier(job, stn(0.9), stn(0.8), 10, { ...LIM, maxVolume: 62_000 }, NOWC).flags, 'tooBig');
eq('  which makes it not takeable', judgeCourier(job, stn(0.9), stn(0.8), 10, { ...LIM, maxVolume: 62_000 }, NOWC).takeable, false);
eq('  but not unsafe', judgeCourier(job, stn(0.9), stn(0.8), 10, { ...LIM, maxVolume: 62_000 }, NOWC).safe, true);
has('a trip that pays too little is flagged',
  judgeCourier({ ...job, reward: 500_000 }, stn(0.9), stn(0.8), 10, LIM, NOWC).flags, 'thinReward');
// A day to cross twenty jumps in a freighter is a way to make you forfeit the collateral.
has('an impossible deadline is flagged',
  judgeCourier({ ...job, daysToComplete: 1 }, stn(0.9), stn(0.8), 20, LIM, NOWC).flags, 'rushed');
has('one about to expire is flagged',
  judgeCourier({ ...job, dateExpired: '2026-09-26T02:00:00Z' }, stn(0.9), stn(0.8), 10, LIM, NOWC).flags, 'expiringSoon');
eq('best paid per jump ranks first',
  [judgeCourier({ ...job, reward: 5_000_000 }, stn(0.9), stn(0.8), 10, LIM, NOWC),
   judgeCourier(job, stn(0.9), stn(0.8), 10, LIM, NOWC)].sort(byRewardPerJump)[0].rewardPerJump, 2_000_000);

// A job you can actually take beats a better-paid one you cannot.
// Over the freighter limit, so it pays best and cannot be taken.
const bigPay = judgeCourier({ ...job, reward: 500_000_000, volume: 1_500_000 }, stn(0.9), stn(0.8), 10, LIM, NOWC);
const canDo = judgeCourier({ ...job, reward: 20_000_000, volume: 5_000 }, stn(0.9), stn(0.8), 10, LIM, NOWC);
eq('the takeable job is listed first', [bigPay, canDo].sort(byUsefulness)[0].c.reward, 20_000_000);
eq('  and the sort is still by pay within each group',
  [canDo, judgeCourier({ ...job, reward: 40_000_000, volume: 5_000 }, stn(0.9), stn(0.8), 10, LIM, NOWC)]
    .sort(byUsefulness)[0].c.reward, 40_000_000);

console.log('\n--- planets ---');
eq('ESI planet type names parse', parsePlanetType('Planet (Barren)'), 'Barren');
eq('  including the shattered ones we do not want', parsePlanetType('Planet (Shattered)'), null);
eq('  and anything else', parsePlanetType('Jita IV'), null);
// Where do I go to make Plasmoids? Suspended Plasma planets, and only those.
has('plasmoids come from lava', planetsFor('Plasmoids'), 'Lava');
has('  and storm', planetsFor('Plasmoids'), 'Storm');
has('  and plasma', planetsFor('Plasmoids'), 'Plasma');
if (planetsFor('Plasmoids').includes('Ice')) { failed++; console.log('  FAIL ice planets do not yield suspended plasma'); }
eq('an unknown product has no planets', planetsFor('Nanites').length, 0);
eq('high-sec band', inBand(0.5, 'high'), true);
eq('  0.45 is not high-sec', inBand(0.4, 'high'), false);
eq('low-sec band', inBand(0.3, 'low'), true);
eq('  and null is not low-sec', inBand(0.0, 'low'), false);
// The income is arithmetic on YOUR extraction rate, not a forecast.
let est = estimate(1000, 4, 100, 2000, 0.02, 0.01);
eq('a day of extraction across four planets', est.p0PerDay, 1000 * 24 * 4);
eq('refined into P1 at the schematic ratio', est.p1PerDay, (1000 * 24 * 4) / P0_PER_P1);
eq('raw value is net of fees', est.p0Value, 96_000 * 100 * 0.97);
eq('refining is worth it here', Math.round(est.uplift * 100) / 100, Math.round(((96_000 / P0_PER_P1) * 2000) / (96_000 * 100) * 100) / 100);
eq('no planets, no income', estimate(1000, 0, 100, 2000, 0.02, 0.01).p0Value, 0);
eq('an unpriced product is worth nothing rather than NaN', estimate(1000, 4, null, null, 0.02, 0.01).p1Value, 0);

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
