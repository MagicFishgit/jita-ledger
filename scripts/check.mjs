// Verification harness for the pure logic that has no UI to eyeball.
// Run with: npm run check   (Node strips the TypeScript types natively)
import { statsFrom, pickPages, passesGate, warningsFor, expectedEdge, sortProspects, FIRST_DIR, DEFAULT_FILTERS } from '../src/lib/prospects.ts';
import { priceUp, tickDown } from '../src/lib/tick.ts';
import { dueForSync } from '../src/lib/schedule.ts';
import { adviseRelist, byUrgency, weightedLevel, marketBest } from '../src/lib/relist.ts';
import { valueOffer, byIskPerLp, patientPrice, instantPrice, daysToClear, planFor, notesFor, spendPlan } from '../src/lib/loyalty.ts';
import { parseFilament, byTier, runsFrom, TIERS } from '../src/lib/abyssal.ts';
import { judgeCourier, byRewardPerJump, byUsefulness, roundTrips, tally, HAULERS, effectiveCapacity, hullClassOf } from '../src/lib/courier.ts';
import { parsePlanetType, planetsFor, estimate, inBand, P0_PER_P1, sortSystems, rankProducts, refineVerdict, RAW_PER_HOUR, MADE_PER_HOUR, BASIC_FACTORY, P1_PER_P2, setupSteps, P1_TO_P0 } from '../src/lib/pi.ts';
import { classify, readExtractor, contentsOf, readColony, byAttention, typesIn, valueOf } from '../src/lib/colony.ts';
import { check, byUrgency as bySkillUrgency, readiness, injectorYield, SP_FLOOR, skillsOf, trainedOptions, HAULING_SKILLS } from '../src/lib/skills.ts';
import { iskPerHour, RUN_MINUTES } from '../src/lib/abyssal.ts';
import { buyerShare, sideVolume, competitionShare, roundTripDays, returnPerDay, EVEN_SPLIT, COMPETITION_MIN, COMPETITION_MAX } from '../src/lib/split.ts';
import { calcWith, RELIST_LEFT, breakEvenSell, breakEvenSpread } from '../src/lib/fees.ts';
import { walkBids } from '../src/lib/relist.ts';
import { isWall } from '../src/lib/prospects.ts';
import { nearMisses, squeezed as isSqueezed } from '../src/lib/signals.ts';
import { exportTax, PI_BASE, HIGHSEC_NPC_TAX } from '../src/lib/pi.ts';
import { allocate } from '../src/lib/planner.ts';
import { priceHub, shipment, goingRate } from '../src/lib/arbitrage.ts';
import { shouldAlert, nextCheckIn } from '../src/lib/alerts.ts';
import { spForLevel, spPerMinute, trainingDays, monthlyGain } from '../src/lib/training.ts';
import { categoryOf, flows, feeLeak, balanceAt, balanceSeries, autoTag, nextTag, goalEta, runwayDays, unusual, csvCell } from '../src/lib/wallet.ts';
import { readKillmail, priceOnDay, valueKillmail, activityOf, matchInsurance, learnedGankLines, gankLineFor, multibuy } from '../src/lib/combat.ts';
import { orderTonight, summarise, MINUTES } from '../src/lib/tonight.ts';
import { byDay, totals, perHour, attribute } from '../src/lib/results.ts';
import { sanitizePrefs, sanitizeAlerts, effectiveMotion } from '../src/lib/prefs.ts';

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

console.log('\n--- what a hauler actually holds ---');
// These were wrong once: "freighter = 1,100,000" was an expanded fit presented as the hull. A
// Charon holds 465,000 before rigs, and telling someone otherwise sends them to a contract they
// cannot pick up. Guard the order of magnitude rather than the exact figure.
const cap = Object.fromEntries(HAULERS.map((h) => [h.name.split(' ')[0], h.m3]));
eq('a freighter is a few hundred thousand, not a million', cap.Freighter, 465000);
eq('a jump freighter holds less than a freighter', cap.Jump < cap.Freighter, true);
eq('a DST holds more than an industrial', cap['Deep'] > cap.Industrial, true);
eq('an Orca beats a DST', cap['Orca'] > cap['Deep'], true);
// A blockade runner is small: it survives by being quick, not by being big.
eq('a blockade runner is the smallest of them', Math.min(...HAULERS.map((h) => h.m3)), cap.Blockade);
// The Bowhead must never appear as a freighter: its hold is 4,000, the bay takes ships only.
if (HAULERS.some((h) => /Bowhead/i.test(h.name))) {
  failed++; console.log('  FAIL the Bowhead carries assembled ships, not courier cargo');
}
// Every preset must be a real, positive volume.
if (HAULERS.some((h) => !(h.m3 > 0))) { failed++; console.log('  FAIL a hauler preset with no capacity'); }

console.log('\n--- your skills, not a stranger\u2019s, decide what fits ---');
const freighter = HAULERS.find((h) => /^Freighter/.test(h.name));
const none = () => 0;
eq('an untrained pilot gets the bare hull', effectiveCapacity(freighter, none).m3, 465000);
eq('  and nothing is claimed for them', effectiveCapacity(freighter, none).from.length, 0);
// freighterBonusC1 and C2 are both 5, tied to the two skills a freighter requires. Both compound.
const allV = (n) => (n === 'Caldari Freighter' || n === 'Advanced Spaceship Command' ? 5 : 0);
eq('both freighter bonuses apply at V', effectiveCapacity(freighter, allV).m3, Math.round(465000 * 1.25 * 1.25));
eq('  naming the skills doing the work', effectiveCapacity(freighter, allV).from.length, 2);
// Any race satisfies the racial half, same as the skills panel.
eq('a Gallente freighter pilot gets the same', effectiveCapacity(freighter, (n) => (n === 'Gallente Freighter' ? 5 : 0)).m3, Math.round(465000 * 1.25));
// Part-trained is part of the bonus, not all or nothing.
eq('three levels give three levels of bonus', effectiveCapacity(freighter, (n) => (n === 'Caldari Freighter' ? 3 : 0)).m3, Math.round(465000 * 1.15));
// The Orca's bonus attribute names the stat, so it is applied; the classes whose attributes do not
// say what they modify get nothing rather than a guess.
const orca = HAULERS.find((h) => /^Orca/.test(h.name));
eq('the Orca bonus applies', effectiveCapacity(orca, (n) => (n === 'Industrial Command Ships' ? 5 : 0)).m3, Math.round(70000 * 1.25));
const dst = HAULERS.find((h) => /^Deep Space/.test(h.name));
eq('a class with no verified cargo bonus is left alone', effectiveCapacity(dst, () => 5).m3, dst.m3);
// A freighter pilot should see contracts an untrained one cannot take.
const bigHaul = { contractId: 9, reward: 50_000_000, collateral: 0, volume: 600_000, daysToComplete: 5, dateExpired: '2026-10-30T00:00:00Z', startId: 1, endId: 2, title: '' };
const trainedLimits = { ...LIM, maxVolume: effectiveCapacity(freighter, allV).m3 };
has('600,000 m3 is too big for a bare freighter', judgeCourier(bigHaul, stn(0.9), stn(0.8), 10, { ...LIM, maxVolume: 465000 }, NOWC).flags, 'tooBig');
eq('  but not for a trained one', judgeCourier(bigHaul, stn(0.9), stn(0.8), 10, trainedLimits, NOWC).takeable, true);

console.log('\n--- planets ---');
eq('ESI planet type names parse', parsePlanetType('Planet (Barren)'), 'Barren');
eq('  including the shattered ones we do not want', parsePlanetType('Planet (Shattered)'), null);
eq('  and anything else', parsePlanetType('Jita IV'), null);
has('plasmoids come from lava', planetsFor('Plasmoids'), 'Lava');
has('  and storm', planetsFor('Plasmoids'), 'Storm');
has('  and plasma', planetsFor('Plasmoids'), 'Plasma');
if (planetsFor('Plasmoids').includes('Ice')) { failed++; console.log('  FAIL ice planets do not yield suspended plasma'); }
eq('an unknown product has no planets', planetsFor('Nanites').length, 0);
eq('high-sec band', inBand(0.5, 'high'), true);
eq('  0.45 is not high-sec', inBand(0.4, 'high'), false);
eq('low-sec band', inBand(0.3, 'low'), true);
eq('  and null is not low-sec', inBand(0.0, 'low'), false);
// Every raw material must refine into something, and every product come from somewhere.
eq('fifteen products, fifteen inputs', Object.keys(P1_TO_P0).length, 15);

console.log('\n--- the factory ratio, which was wrong by an order of magnitude ---');
// A Basic Industry Facility: 3,000 raw per 30 minutes for 20 refined. That is 150 raw per unit, not
// the 14 this once used --- which flattered refining roughly tenfold.
eq('150 raw make one refined unit', P0_PER_P1, 150);
eq('  which is the schematic, not a guess', BASIC_FACTORY.rawPerCycle / BASIC_FACTORY.madePerCycle, 150);
eq('one factory eats 6,000 raw an hour', RAW_PER_HOUR, 6000);
eq('  and returns 40', MADE_PER_HOUR, 40);
eq('sixteen refined units make one processed good', P1_PER_P2, 16);

console.log('\n--- what a day of extraction comes to ---');
let est = estimate(1000, 4, 100, 20000, 0.02, 0.01);
eq('a day of extraction across four planets', est.rawPerDay, 1000 * 24 * 4);
eq('refined at the real ratio', est.madePerDay, (1000 * 24 * 4) / 150);
eq('raw value is net of fees', est.rawValue, 96_000 * 100 * 0.97);
eq('refined value likewise', est.madeValue, (96_000 / 150) * 20_000 * 0.97);
// A factory fed below its rate does not stop existing; it runs fewer cycles. One is still needed.
eq('a slow extractor still needs one factory', est.factories, 1);
eq('  which idles most of the time', Math.round(est.utilisation * 100), Math.round(1000 / 6000 * 100));
// Factories are per planet: four colonies cannot pool their extraction into one factory.
est = estimate(6000, 4, 100, 20000, 0.02, 0.01);
eq('one factory exactly keeps up with 6,000 an hour', est.factories, 1);
eq('  and is busy all the time', Math.round(est.utilisation * 100), 100);
est = estimate(13000, 1, 100, 20000, 0.02, 0.01);
eq('13,000 an hour needs three factories', est.factories, 3);
eq('  the third barely used', Math.round(est.utilisation * 100), Math.round(13000 / 18000 * 100));
eq('extracting nothing needs no factories', estimate(0, 4, 100, 20000, 0.02, 0.01).factories, 0);
eq('no planets, no income', estimate(1000, 0, 100, 2000, 0.02, 0.01).rawValue, 0);
eq('an unpriced product is worth nothing rather than NaN', estimate(1000, 4, null, null, 0.02, 0.01).madeValue, 0);

console.log('\n--- refine it, or sell it as it comes out ---');
eq('double the value is worth refining', refineVerdict(2.4).worth, true);
eq('a clear gain is worth refining', refineVerdict(1.3).worth, true);
eq('a coin-flip is not worth the factories', refineVerdict(1.02).worth, false);
eq('  and says so plainly', refineVerdict(1.02).short, 'Barely matters');
eq('a loss says sell it raw', refineVerdict(0.6).short, 'Sell it raw');
eq('nothing priced is not a recommendation', refineVerdict(0).worth, false);

console.log('\n--- which product to make ---');
// Same raw cost for every product, so the ranking is on what the refined unit fetches.
const prices = { Plasmoids: 500, 'Suspended Plasma': 3, Water: 100, 'Aqueous Liquids': 1 };
let ranked = rankProducts((n) => prices[n] ?? null, 0, 0);
eq('all fifteen are ranked', ranked.length, 15);
eq('the most valuable refined product leads', ranked[0].p1, 'Plasmoids');
// 1,000 raw makes 6.67 units, so 6.67 x 500.
eq('  valued per thousand units of extraction', Math.round(ranked[0].refinedPer1000Raw), Math.round((1000 / 150) * 500));
eq('  against what that raw would fetch unrefined', ranked[0].rawPer1000Raw, 1000 * 3);
eq('  giving the gain from refining', Math.round(ranked[0].uplift * 100), Math.round(((1000 / 150) * 500) / 3000 * 100));
// Refining Aqueous Liquids at these prices is a loss, and must not be dressed up as a gain.
const water = ranked.find((p) => p.p1 === 'Water');
eq('a poor product still reports its real uplift', Math.round(water.uplift * 100) / 100, Math.round(((1000 / 150) * 100) / 1000 * 100) / 100);
eq('  and is judged accordingly', refineVerdict(water.uplift).worth, false);
// Nothing priced must not crash the ranking or invent an order.
eq('unpriced products still appear', rankProducts(() => null, 0, 0).length, 15);
eq('  worth nothing rather than NaN', rankProducts(() => null, 0, 0)[0].refinedPer1000Raw, 0);
// Availability is carried so a scarce input can be seen, not silently preferred.
eq('availability counts the planet types', ranked.find((p) => p.p1 === 'Plasmoids').availability, 3);

console.log('\n--- the build guide follows the decision ---');
const withFactories = setupSteps('Plasmoids', true);
const rawOnly = setupSteps('Plasmoids', false);
if (!withFactories.some((s) => /Basic Industry Facility/.test(s.title))) {
  failed++; console.log('  FAIL refining should tell you to build a factory');
}
if (rawOnly.some((s) => /Basic Industry Facility/.test(s.title))) {
  failed++; console.log('  FAIL selling raw should not tell you to build factories');
}
if (!rawOnly.some((s) => /launchpad/i.test(s.title))) {
  failed++; console.log('  FAIL every colony needs somewhere to put the output');
}
// Surveying must come before anything is placed; doing it later is the classic wasted colony.
const surveyAt = withFactories.findIndex((s) => /Survey/i.test(s.title));
const extractorAt = withFactories.findIndex((s) => /extractor control unit/i.test(s.title));
eq('survey comes before the extractor is placed', surveyAt < extractorAt && surveyAt >= 0, true);
// The routing step is the one people miss, so it must be there whenever there is a factory.
if (!withFactories.some((s) => /Route/i.test(s.title))) {
  failed++; console.log('  FAIL routing is the step people miss and must be spelled out');
}
if (!withFactories.some((s) => `${s.body} ${s.tip ?? ''}`.includes('150'))) {
  failed++; console.log('  FAIL the guide should state the ratio that drives the decision');
}

console.log('\n--- ordering PI systems, which runs against the instinct ---');
const sys = [
  { name: 'Safe far', security: 1.0, jumps: 20 },
  { name: 'Rich near', security: 0.5, jumps: 3 },
  { name: 'Middle', security: 0.7, jumps: 9 },
];
// Lower security means richer planets, so "best yield" puts 0.5 first, not 1.0.
eq('best yield takes the lowest security', sortSystems(sys, 'yield')[0].name, 'Rich near');
eq('  and the highest last', sortSystems(sys, 'yield')[2].name, 'Safe far');
eq('closest to Jita is by jumps', sortSystems(sys, 'near')[0].name, 'Rich near');
eq('safest is the old order', sortSystems(sys, 'safe')[0].name, 'Safe far');
// A system whose jumps have not arrived yet must not pretend to be next door.
const pending = [{ name: 'Unknown', security: 0.5, jumps: null }, { name: 'Known', security: 0.5, jumps: 12 }];
eq('unknown distance sorts last, not first', sortSystems(pending, 'near')[0].name, 'Known');
eq('  and does not disturb the yield order', sortSystems(pending, 'yield').length, 2);

console.log('\n--- reading a colony, which is mostly about when it stops ---');
const NOWP = Date.parse('2026-09-26T12:00:00Z');
const hoursOut = (h) => new Date(NOWP + h * 3600_000).toISOString();
const extractor = (h, qty = 3000, cycle = 3600) => ({
  pin_id: 1, type_id: 2848, expiry_time: h == null ? undefined : hoursOut(h),
  extractor_details: { cycle_time: cycle, product_type_id: 2268, qty_per_cycle: qty, heads: [{ head_id: 0 }, { head_id: 1 }] },
});
// Pins say what they are by their shape, so no table of type IDs can go stale.
eq('an extraction unit is an extractor', classify(extractor(48)), 'extractor');
eq('a schematic makes it a factory', classify({ pin_id: 2, type_id: 1, factory_details: { schematic_id: 65 } }), 'factory');
eq('anything else that holds things is storage', classify({ pin_id: 3, type_id: 1, contents: [{ type_id: 2268, amount: 10 }] }), 'storage');

// The state that costs people money: a programme that ended while they were not looking.
eq('a running programme', readExtractor(extractor(72), NOWP).state, 'running');
eq('one about to end', readExtractor(extractor(6), NOWP).state, 'endingSoon');
eq('  and a day out is still "soon"', readExtractor(extractor(23), NOWP).state, 'endingSoon');
eq('  but three days out is not', readExtractor(extractor(72), NOWP).state, 'running');
eq('one that has ended', readExtractor(extractor(-5), NOWP).state, 'expired');
eq('  and it says how long ago', Math.round(readExtractor(extractor(-5), NOWP).hours), -5);
// An extractor with no programme never started; that is not the same as one that ran out.
eq('no expiry at all is idle', readExtractor(extractor(null), NOWP).state, 'idle');
eq('no quantity is idle too', readExtractor(extractor(48, 0), NOWP).state, 'idle');
// Output per hour comes off the cycle, and an ended programme produces nothing.
eq('per-hour rate from the cycle', readExtractor(extractor(48, 3000, 1800), NOWP).unitsPerHour, 6000);
eq('an hour-long cycle is the quantity', readExtractor(extractor(48, 3000, 3600), NOWP).unitsPerHour, 3000);
eq('an expired programme produces nothing', readExtractor(extractor(-1), NOWP).unitsPerHour, 0);
eq('and so does an idle one', readExtractor(extractor(null), NOWP).unitsPerHour, 0);
eq('heads are counted', readExtractor(extractor(48), NOWP).heads, 2);

// Storage is merged across every pin that holds anything.
eq('contents merge by type', contentsOf([
  { pin_id: 1, type_id: 1, contents: [{ type_id: 2268, amount: 100 }] },
  { pin_id: 2, type_id: 1, contents: [{ type_id: 2268, amount: 50 }, { type_id: 2270, amount: 7 }] },
]), [{ typeId: 2268, amount: 150 }, { typeId: 2270, amount: 7 }]);
eq('nothing stored is no rows', contentsOf([{ pin_id: 1, type_id: 1 }]).length, 0);

const head = { planetId: 40001, planetType: 'lava', solarSystemId: 30000142, upgradeLevel: 4, numPins: 6, lastUpdate: hoursOut(-1) };
let col = readColony(head, { pins: [extractor(-3)], links: [{}] }, NOWP);
has('an ended programme is flagged', col.warnings, 'expired');
eq('  and nothing is coming out', col.unitsPerHour, 0);
col = readColony(head, { pins: [extractor(100), extractor(4)], links: [{}] }, NOWP);
has('one ending soon is flagged even when another is fine', col.warnings, 'endingSoon');
eq('  and the soonest deadline is the one reported', Math.round(col.soonest), 4);
eq('  with both still producing', col.unitsPerHour, 6000);
has('a colony with no extractor is flagged', readColony(head, { pins: [], links: [] }, NOWP).warnings, 'noExtractor');
has('extracting with nowhere to send it is flagged',
  readColony(head, { pins: [extractor(100)], links: [] }, NOWP).warnings, 'nothingRouted');

// Trouble first: an expired colony outranks one merely ending soon.
const ended = readColony(head, { pins: [extractor(-2)], links: [{}] }, NOWP);
const soon = readColony(head, { pins: [extractor(3)], links: [{}] }, NOWP);
const fine = readColony(head, { pins: [extractor(200)], links: [{}] }, NOWP);
eq('what has stopped comes first', [fine, soon, ended].sort(byAttention)[0].warnings[0], 'expired');
eq('  then what is about to', [fine, soon, ended].sort(byAttention)[1].warnings[0], 'endingSoon');

console.log('\n--- what the colonies are worth ---');
const withStock = readColony(head, {
  pins: [extractor(100), { pin_id: 9, type_id: 1, contents: [{ type_id: 2268, amount: 5000 }] }],
  links: [{}],
}, NOWP);
eq('every type touched is offered for pricing', typesIn([withStock]).sort(), [2268]);
let colVal = valueOf([withStock], () => 100);
eq('production is per hour at the net price', colVal.perHour, 3000 * 100);
eq('  and a day is twenty-four of them', colVal.perDay, 3000 * 100 * 24);
eq('stock already out of the ground is counted apart', colVal.stored, 5000 * 100);
// An unpriceable item understates the total rather than poisoning it with NaN.
colVal = valueOf([withStock], () => null);
eq('nothing priced is zero, not NaN', colVal.perHour, 0);
eq('  and it says how much it could not price', colVal.unpriced, 2);


{
// ============================ the redesign's logic ============================

console.log('\n--- which side of the volume fills you ---');
// A day that closed near its high traded mostly into sell orders: buyers taking listings.
eq('average at the high is all buyers', buyerShare([{ average: 110, highest: 110, lowest: 90 }]), 1);
eq('average at the low is all sellers', buyerShare([{ average: 90, highest: 110, lowest: 90 }]), 0);
eq('midway is even', buyerShare([{ average: 100, highest: 110, lowest: 90 }]), 0.5);
eq('median across days', buyerShare([
  { average: 95, highest: 110, lowest: 90 }, { average: 100, highest: 110, lowest: 90 }, { average: 108, highest: 110, lowest: 90 },
]), 0.5);
// A flat day says nothing about who traded, and no history at all falls back to even.
eq('flat days are skipped', buyerShare([{ average: 100, highest: 100, lowest: 100 }]), EVEN_SPLIT);
eq('no rows is even', buyerShare([]), EVEN_SPLIT);
eq('a sell order only sees buyers', sideVolume(1000, 0.3, false), 300);
eq('a buy order only sees sellers', sideVolume(1000, 0.3, true), 700);

console.log('\n--- competing for the queue ---');
// Sixty competitors is the pivot: your base share, unchanged.
eq('at the pivot the share is the base', competitionShare(10, 60), 0.1);
eq('a crowd cuts it, but not below the floor', competitionShare(10, 600), 0.1 * COMPETITION_MIN);
eq('few rivals raise it, but not above the cap', competitionShare(10, 5), 0.1 * COMPETITION_MAX);
eq('a zero count is treated as one', competitionShare(10, 0), 0.1 * COMPETITION_MAX);

console.log('\n--- time tied up, and return per day ---');
// 1,000 a day, even split, 10% share: 50 a day each way, so 100 units takes 2 + 2 days.
eq('round trip is both sides in turn', roundTripDays(100, 1000, 0.5, 0.1), 4);
eq('a side that never trades never finishes', roundTripDays(100, 1000, 1, 0.1) === Infinity, true);
eq('return per day divides by the days', returnPerDay(0.1, 4), 0.025);
// Minutes still count as an hour, so a near-instant flip is not credited with an infinite rate.
eq('a flip in minutes is floored at an hour', returnPerDay(0.01, 0.001), 0.01 * 24);
eq('no time known is no rate', Number.isNaN(returnPerDay(0.1, Infinity)), true);
// A fast small return beats a slow big one, which is the point of the column.
if (!(returnPerDay(0.06, 0.25) > returnPerDay(0.12, 7))) { failed++; console.log('  FAIL fast turnover should rank higher'); }

console.log('\n--- relisting costs a fee on what is left ---');
const RR = { f: 0.015, t: 0.0338, d: 0.5, k: 0.0075, be: 0 };
const base0 = calcWith({ buy: 1000, sell: 1200, qty: 1000 }, RR, 5);
const two = calcWith({ buy: 1000, sell: 1200, qty: 1000, nSell: 2 }, RR, 5);
// Two changes on a 1.2M sell order, each on the half assumed left: 2 x 0.0075 x 600k.
eq('two sell relists cost on half the order', two.relist, 2 * 0.0075 * 1200 * 1000 * RELIST_LEFT);
eq('and come straight off the profit', base0.net - two.net, two.relist);
eq('the 100 ISK floor still holds per change', calcWith({ buy: 1, sell: 2, qty: 1, nBuy: 3 }, RR, 5).relist, 300);
// Break-even rises with relists, and matches the calculator's own figure.
eq('break-even with no relists is cost over what a sale keeps', breakEvenSell(1000, RR, 0), 1000 / (1 - 0.015 - 0.0338));
eq('two relists lift it', breakEvenSell(1000, RR, 2) > breakEvenSell(1000, RR, 0), true);
eq('break-even spread with no relists is the rate figure', breakEvenSpread(RR, 0), (1 + 0.015) / (1 - 0.015 - 0.0338) - 1);

console.log('\n--- walking the bids to dump stock ---');
const bids = [{ price: 100, volume: 10 }, { price: 90, volume: 5 }, { price: 95, volume: 5 }];
let w = walkBids(12, bids, 0.05);
eq('the best bid is taken first, then the next', w.value, (10 * 100 + 2 * 95) * 0.95);
eq('  and it all went', w.left, 0);
w = walkBids(30, bids, 0);
eq('what the book cannot take is reported, not priced', w.left, 10);
eq('  and only what sold is valued', w.value, 10 * 100 + 5 * 95 + 5 * 90);

console.log('\n--- suspicious markets ---');
eq('one price holding most of the side is a wall', isWall([{ price: 1, volume: 900 }, { price: 2, volume: 100 }]), true);
eq('an even book is not', isWall([{ price: 1, volume: 500 }, { price: 2, volume: 500 }]), false);
eq('a single level cannot be judged', isWall([{ price: 1, volume: 900 }]), false);
const deepBook = { buyOrders: 40, sellOrders: 40, topBuys: [{ price: 100, volume: 10 }, { price: 99, volume: 10 }], topSells: [{ price: 110, volume: 10 }, { price: 111, volume: 10 }] };
has('a bid far above anything paid all month is escrow bait',
  warningsFor({ ...st, high30: 80 }, deepBook, 0.09, 100), 'escrow');
if (warningsFor({ ...st, high30: 120 }, deepBook, 0.09, 100).includes('escrow')) { failed++; console.log('  FAIL a normal bid is not bait'); }
has('a spike flag carries through', warningsFor({ ...st, spike: true }, deepBook, 0.09, 100), 'spike');
// statsFrom finds the spike: one day at 8x the volume and 30% off the usual price.
const spiky = statsFrom(20, rows(30, (i) => (i === 2 ? { volume: 8000, average: 130, highest: 140, lowest: 120 } : {})), NOW);
eq('a busy day at an odd price is a spike', spiky.spike, true);
const busy = statsFrom(21, rows(30, (i) => (i === 2 ? { volume: 8000 } : {})), NOW);
eq('a busy day at the usual price is not', busy.spike, false);
eq('the month high is kept for the escrow check', spiky.high30, 140);
eq('the last week of ranges is kept, oldest first', steady.range7.length, 7);
eq('buyer share comes from the days themselves', steady.buyerShare, 0.5);

console.log('\n--- trades a position skipped ---');
const JITA = 60003760;
const posA = { id: 'a', typeId: 34, openedAt: '2026-09-10T00:00:00Z', status: 'open', jitaOnly: true, excluded: [], included: [] };
const tx = (id, date, loc = JITA, typeId = 34) => ({ id, source: 'esi', typeId, date, isBuy: true, qty: 5, unitPrice: 10, locationId: loc });
let near = nearMisses(posA, [tx('1', '2026-09-08T00:00:00Z'), tx('2', '2026-09-12T00:00:00Z'), tx('3', '2026-09-12T00:00:00Z', 60008494)], [posA], new Set(), JITA);
eq('a buy just before the start is suggested', near.map((n) => n.tx.id).sort(), ['1', '3']);
eq('  as before', near.find((n) => n.tx.id === '1').why, 'before');
eq('a trade in another station on a Jita-only position is suggested', near.find((n) => n.tx.id === '3').why, 'elsewhere');
near = nearMisses(posA, [tx('1', '2026-07-01T00:00:00Z')], [posA], new Set(), JITA);
eq('months before the start is not plausibly its stock', near.length, 0);
near = nearMisses(posA, [tx('1', '2026-09-08T00:00:00Z')], [posA], new Set(['1']), JITA);
eq('something you dealt with is not raised again', near.length, 0);
const posOld = { ...posA, id: 'old', openedAt: '2026-09-01T00:00:00Z', closedAt: '2026-09-09T00:00:00Z', status: 'closed' };
near = nearMisses(posA, [tx('1', '2026-09-08T00:00:00Z')], [posA, posOld], new Set(), JITA);
eq('a trade another position counts is left alone', near.length, 0);
eq('a closed position suggests nothing', nearMisses({ ...posA, status: 'closed' }, [tx('1', '2026-09-08T00:00:00Z')], [posA], new Set(), JITA).length, 0);

console.log('\n--- margin squeeze ---');
eq('a range falling to near break-even is a squeeze', isSqueezed([0.136, 0.128, 0.117, 0.104, 0.093, 0.086, 0.081], 0.07), true);
eq('a steady thin item is not', isSqueezed([0.08, 0.081, 0.079, 0.08, 0.08], 0.07), false);
eq('a falling but still wide range is not', isSqueezed([0.5, 0.4, 0.3], 0.07), false);
eq('too little history says nothing', isSqueezed([0.1, 0.05], 0.07), false);

console.log('\n--- PI customs tax on base values ---');
eq('raw is taxed on 5 ISK a unit', exportTax(1000, PI_BASE.raw, 0.1), 500);
eq('refined on 400', exportTax(10, PI_BASE.refined, HIGHSEC_NPC_TAX), 400);
eq('no rate, no tax', exportTax(10, PI_BASE.refined, 0), 0);

console.log('\n--- loyalty spend capped by ISK as well as points ---');
const candI = (offerId, iskPerLp, lpCost, profit, outlay) =>
  ({ v: { offerId, typeId: offerId, quantity: 1, lpCost, iskPerLp, profit, outlay, runs: 1e9 }, unitsAllowed: null });
picks = spendPlan([candI(1, 1500, 1000, 1_500_000, 10_000_000)], 100_000, 25_000_000);
eq('the ISK runs out before the points', picks[0].runs, 2);
eq('  and the ISK spent is reported', picks[0].iskSpent, 20_000_000);
picks = spendPlan([candI(1, 1500, 1000, 1_500_000, 10_000_000), candI(2, 1000, 1000, 1_000_000, 0)], 5000, 25_000_000);
eq('an offer needing no ISK still takes the points left', picks.find((x) => x.offerId === 2).runs, 3);
eq('no cap means points decide', spendPlan([candI(1, 1500, 1000, 1_500_000, 10_000_000)], 5000)[0].runs, 5);

console.log('\n--- the capital planner ---');
const pr = (typeId, roiPerDay, buy, perDay, warnings = [], net = 10) =>
  ({ typeId, roiPerDay, buy, qty: 1000, daysToFlip: (1000 * buy) / perDay, net, warnings });
let plan2 = allocate([pr(1, 0.02, 100, 50_000), pr(2, 0.05, 100, 20_000), pr(3, 0.09, 100, 1e9, ['escrow'])], { isk: 1_000_000, slots: 10, horizonDays: 3, maxShare: 1 });
eq('bait is never planned', plan2.rows.some((r) => r.p.typeId === 3), false);
eq('the fastest payer goes first', plan2.rows[0].p.typeId, 2);
eq('  filled to what it absorbs in the horizon', plan2.rows[0].isk, 60_000);
eq('two slots per item', plan2.slotsUsed, 4);
plan2 = allocate([pr(1, 0.02, 100, 1e9), pr(2, 0.05, 100, 1e9)], { isk: 1_000_000, slots: 2, horizonDays: 3, maxShare: 1 });
eq('out of slots stops it', plan2.rows.length, 1);
plan2 = allocate([pr(1, 0.02, 100, 1e9)], { isk: 1_000_000, slots: 10, horizonDays: 3, maxShare: 0.25 });
eq('the per-item cap holds', plan2.rows[0].isk, 250_000);
eq('  and the rest is idle', plan2.idle, 750_000);
eq('  because the markets ran out', plan2.limit, 'markets');

console.log('\n--- hub arbitrage ---');
const q = { typeId: 1, m3: 10, jitaBestBuy: 900, jitaBestSell: 1000, hubBestSell: 1300, hubUnitsPerDay: 1000, hubBuyers: 0.5 };
let hub = priceHub(q, 'sells', { f: 0.015, t: 0.0338 }, 10, 7);
eq('buying from sells costs the ask', hub.cost, 1000);
eq('listing a step under the hub', hub.listAt, 1299);
eq('gross is net of the hub fees', hub.gross, 1299 * (1 - 0.015 - 0.0338) - 1000);
eq('the lot is what the hub takes in the window', hub.lot, 350);
eq('a loser before hauling is dropped', priceHub({ ...q, hubBestSell: 1000 }, 'sells', { f: 0.015, t: 0.0338 }, 10, 7), null);
const ship = shipment([hub, { ...hub, typeId: 2, m3: 30, lot: 100 }], 700_000, 1);
eq('cargo adds up', ship.m3, 350 * 10 + 100 * 30);
eq('hauling is spread by volume', ship.haulPerUnit[2], 700_000 * 30 / (350 * 10 + 100 * 30));
eq('the going rate is the median', goingRate([{ reward: 100, volume: 1 }, { reward: 300, volume: 1 }, { reward: 9e9, volume: 1 }]), 300);

console.log('\n--- alerts ---');
const CFG = { on: true, browser: false, interval: 5, minIsk: 5e6, quiet: false, ev: { move: true, clearing: false, squeeze: true, pi: true, scam: true, backup: true } };
const F = { kind: 'move', key: 'o1', title: 't', text: 'x', isk: 10e6 };
const noon = Date.parse('2026-09-26T12:00:00Z');
eq('a big move alerts', shouldAlert(F, CFG, [], noon), true);
eq('off is off', shouldAlert(F, { ...CFG, on: false }, [], noon), false);
eq('a switched-off event is quiet', shouldAlert({ ...F, kind: 'clearing' }, CFG, [], noon), false);
eq('small ISK is below the line', shouldAlert({ ...F, isk: 1e6 }, CFG, [], noon), false);
eq('the ISK line does not apply to a PI programme', shouldAlert({ kind: 'pi', key: 'p', title: '', text: '' }, CFG, [], noon), true);
eq('quiet hours hold at 2am EVE', shouldAlert(F, { ...CFG, quiet: true }, [], Date.parse('2026-09-26T02:00:00Z')), false);
eq('the same thing is not raised twice', shouldAlert(F, CFG, [{ at: new Date(noon - 3600_000).toISOString(), kind: 'move', key: 'o1', title: '', text: '' }], noon), false);
eq('  unless it has been a while', shouldAlert(F, CFG, [{ at: new Date(noon - 7 * 3600_000).toISOString(), kind: 'move', key: 'o1', title: '', text: '' }], noon), true);
eq('a test alert does not block the real one', shouldAlert(F, CFG, [{ at: new Date(noon).toISOString(), kind: 'move', key: 'o1', title: '', text: '', test: true }], noon), true);
eq('the countdown wraps', nextCheckIn(0, 5, 6 * 60_000), 4 * 60_000);

console.log('\n--- training time and what it earns ---');
eq('level one of a rank 1 skill', spForLevel(1, 1), 250);
eq('level five of a rank 1 skill', spForLevel(1, 5), 256000);
eq('rank scales it', spForLevel(3, 5), 768000);
const sk = { rank: 1, primary: 166, secondary: 168 };
const attrs = { intelligence: 20, memory: 24, perception: 20, willpower: 20, charisma: 19 };
eq('primary plus half the secondary', spPerMinute(sk, attrs, false), 34);
eq('alpha trains at half speed', spPerMinute(sk, attrs, true), 17);
eq('days from the points already in', Math.round(trainingDays(sk, attrs, 256000 - 34 * 1440, 5, false) * 1e6) / 1e6, 1);
eq('level two rounds up as the game does', spForLevel(1, 2), 1415);
eq('nothing to train when maxed', trainingDays(sk, attrs, 300000, 5, false), 0);
const pace = { sales: 1e9, ordersPlaced: 2e9, relistFees: 10e6 };
eq('accounting saves 11% of the base tax on sales', monthlyGain('acc', 3, pace, 7.5, 0.015), 1e9 * 0.075 * 0.11);
eq('broker relations saves 0.3 points on orders', monthlyGain('br', 2, pace, 7.5, 0.024), 2e9 * 0.003);
eq('  but not below the 1% floor', monthlyGain('br', 4, pace, 7.5, 0.012), 2e9 * 0.002);
eq('ABR cuts the relist fee share', Math.round(monthlyGain('abr', 0, pace, 7.5, 0.015)), Math.round(10e6 * (1 - 0.44 / 0.5)));
eq('a maxed skill gains nothing', monthlyGain('acc', 5, pace, 7.5, 0.015), 0);

console.log('\n--- the wallet journal ---');
eq('trades are left to the transactions', categoryOf({ refType: 'market_transaction', amount: -5 }), null);
eq('escrow is your own ISK moving', categoryOf({ refType: 'market_escrow', amount: -5 }), null);
eq('bounties are income', categoryOf({ refType: 'bounty_prizes', amount: 5 }).key, 'bounties');
eq('a courier reward is income', categoryOf({ refType: 'contract_reward', amount: 5 }).key, 'courier');
eq('broker fees are fees', categoryOf({ refType: 'brokers_fee', amount: -5 }).key, 'fees');
eq('jump clones are personal', categoryOf({ refType: 'jump_clone_activation_fee', amount: -5 }).kind, 'Personal');
eq('office rent is business', categoryOf({ refType: 'office_rental_fee', amount: -5 }).kind, 'Business');
const J = (id, date, refType, amount, extra = {}) => ({ id, date, refType, amount, ...extra });
const tx2 = (id, date, isBuy, qty, unitPrice, typeId = 34) => ({ id, source: 'esi', typeId, date, isBuy, qty, unitPrice });
const fl = flows(
  [J('1', '2026-09-20T00:00:00Z', 'bounty_prizes', 1000), J('2', '2026-09-20T00:00:00Z', 'brokers_fee', -50), J('3', '2026-09-20T00:00:00Z', 'market_escrow', -99999)],
  [tx2('a', '2026-09-20T00:00:00Z', false, 10, 100), tx2('b', '2026-09-20T00:00:00Z', true, 5, 100), tx2('c', '2026-09-20T00:00:00Z', false, 1, 500, 99)],
  (t) => (t.id === 'c' ? { tracked: false, tag: 'loot' } : { tracked: true, tag: 'other' }),
  Date.parse('2026-09-01T00:00:00Z'),
);
eq('money in adds bounties and sales', fl.inTotal, 1000 + 1000 + 500);
eq('escrow is not spending', fl.outTotal, 50 + 500);
eq('an untracked sale is loot, not trading', fl.ins.find((l) => l.key === 'loot').amount, 500);
eq('a tracked buy is stock', fl.outs.find((l) => l.key === 'stock').amount, 500);
const jr = [
  J('10', '2026-09-20T00:00:00Z', 'brokers_fee', -100, { contextId: 7 }), J('11', '2026-09-21T00:00:00Z', 'brokers_fee', -30, { contextId: 7 }),
  J('12', '2026-09-21T00:00:00Z', 'transaction_tax', -80), J('13', '2026-09-21T00:00:00Z', 'planetary_export_tax', -5),
];
const leak = feeLeak(jr, Date.parse('2026-09-01T00:00:00Z'));
eq('the first fee on an order is the listing', leak.broker, 100);
eq('  later ones on it are price changes', leak.relists, 30);
eq('sales tax and PI tax are counted', leak.sales + leak.pi, 85);
const bal = [J('1', '2026-09-20T00:00:00Z', 'x', 1, { balance: 100 }), J('2', '2026-09-21T00:00:00Z', 'x', 1, { balance: 150 })];
eq('balance after a moment is the last entry before it', balanceAt(bal, Date.parse('2026-09-20T12:00:00Z')), 100);
eq('the series runs oldest first', balanceSeries(bal, 0).map((p) => p.balance), [100, 150]);
eq('a sale of something never bought is loot', autoTag(tx2('z', '', false, 1, 1, 5), new Set([34])), 'loot');
eq('tags cycle', nextTag('other'), 'loot');
eq('a goal already reached takes no days', goalEta(10, 5, 1), 0);
eq('no growth, no ETA', goalEta(1, 5, 0), null);
eq('ETA is the gap over growth', goalEta(1, 5, 2), 2);
eq('runway is wallet over burn', runwayDays(100, 10), 10);
const odd = unusual([
  J('1', '2026-09-01T00:00:00Z', 'player_donation', 5e6, { firstPartyId: 9 }),
  J('2', '2026-09-02T00:00:00Z', 'player_donation', 5e6, { firstPartyId: 9 }),
  J('3', '2026-09-03T00:00:00Z', 'player_donation', -50e6, { secondPartyId: 8 }),
], Date.parse('2026-08-01T00:00:00Z'));
eq('a first donation from a stranger is flagged, a second is not', odd.filter((u) => u.kind === 'donationIn').map((u) => u.id), ['1']);
eq('a large gift out is flagged', odd.some((u) => u.kind === 'donationOut'), true);
eq('CSV quotes what needs it', csvCell('a,b'), '"a,b"');

console.log('\n--- killmails ---');
const rawKm = {
  killmail_id: 5, killmail_time: '2026-09-10T21:14:00Z', solar_system_id: 30002768,
  victim: { character_id: 77, corporation_id: 1, ship_type_id: 100, damage_taken: 5000,
    items: [{ item_type_id: 200, flag: 5, quantity_dropped: 2 }, { item_type_id: 300, flag: 27, quantity_destroyed: 1, items: [{ item_type_id: 400, flag: 0, quantity_destroyed: 3 }] }] },
  attackers: [{ character_id: 88, damage_done: 5000, final_blow: true, security_status: -9.9 }],
};
const km = readKillmail(rawKm, 'h', 77);
eq('your own ship dying is a loss', km.kind, 'loss');
eq('nested items are flattened under their container slot', km.items.map((i) => [i.typeId, i.flag]), [[200, 5], [300, 27], [400, 27]]);
eq('someone else dying is a kill', readKillmail(rawKm, 'h', 88).kind, 'kill');
const hist = [{ date: '2026-09-08', average: 10 }, { date: '2026-09-10', average: 12 }, { date: '2026-09-11', average: 99 }];
eq('priced on the day itself', priceOnDay(hist, '2026-09-10').price, 12);
eq('a quiet day takes the last trade before it', priceOnDay(hist, '2026-09-09').price, 10);
eq('never a price from after the day', priceOnDay([{ date: '2026-09-11', average: 99 }], '2026-09-10'), null);
const val = valueKillmail(km, (id) => ({ 100: 1000, 200: 10, 300: 50, 400: 1 }[id] ?? null));
eq('the hull counts as destroyed', val.destroyed, 1000 + 50 + 3);
eq('dropped items are counted apart', val.dropped, 20);
eq('everything together', val.total, 1073);
eq('an unpriceable item is named, not guessed', valueKillmail(km, () => null).unpriced.length, 4);
eq('an abyssal pocket is its own activity', activityOf({ ...km, systemId: 32000123 }, 'Cruiser'), 'Abyssal');
eq('a hauler loss is hauling', activityOf(km, 'Deep Space Transport'), 'Hauling');
eq('a combat ship shot by players is PvP', activityOf(km, 'Cruiser'), 'PvP');
eq('shot by rats is PvE', activityOf({ ...km, attackers: [{ damage: 1 }] }, 'Cruiser'), 'PvE');
eq('insurance is matched to the loss after it', matchInsurance([{ id: 5, time: '2026-09-10T21:14:00Z' }], [
  { id: 'a', date: '2026-09-09T00:00:00Z', amount: 1 }, { id: 'b', date: '2026-09-11T00:00:00Z', amount: 38e6 },
])[5], 38e6);
const kmv = { ...km, value: val };
const learned = learnedGankLines([kmv], () => 'Deep Space Transport', new Set([30002768]));
eq('a ganked hauler teaches the line its cargo', learned['Deep Space Transport'].value, 20);
eq('losses outside the gank systems teach nothing', Object.keys(learnedGankLines([kmv], () => 'X', new Set([1]))).length, 0);
eq('the lower of yours and learned is used', gankLineFor('Deep Space Transport', { 'Deep Space Transport': 1e9 }, learned, true).line, 20);
eq('unless learning is off', gankLineFor('Deep Space Transport', { 'Deep Space Transport': 1e9 }, learned, false).line, 1e9);
eq('no line at all when neither exists', gankLineFor('Freighter', {}, {}, true).line, null);
eq('multibuy is name x qty per line', multibuy([{ name: 'Gila', qty: 1 }, { name: 'Hammerhead II', qty: 5 }]), 'Gila x1\nHammerhead II x5');

console.log('\n--- gank bait ---');
{
  const ok = { kind: 'station', systemId: 1, security: 0.9, name: 'A' };
  const job = { contractId: 1, reward: 20e6, collateral: 1.2e9, volume: 30000, daysToComplete: 3, dateExpired: '2099-01-01T00:00:00Z', startId: 1, endId: 2, title: '' };
  const lim = { maxVolume: 60000, maxCollateral: 5e9, minRewardPerJump: 0 };
  let v = judgeCourier(job, ok, ok, 10, lim, Date.now(), { through: true, line: 1e9 });
  has('collateral over the line through a gank system is bait', v.flags, 'gankBait');
  eq('  which you should not leave with', v.takeable, false);
  eq('  but it is not unsafe in itself', v.safe, true);
  eq('under the line is fine', judgeCourier(job, ok, ok, 10, lim, Date.now(), { through: true, line: 2e9 }).flags.includes('gankBait'), false);
  eq('a route around the gank systems is fine', judgeCourier(job, ok, ok, 10, lim, Date.now(), { through: false, line: 1e9 }).flags.includes('gankBait'), false);
  eq('no line, no claim', judgeCourier(job, ok, ok, 10, lim, Date.now(), { through: true, line: null }).flags.includes('gankBait'), false);
  eq('a DST group is its hull class', hullClassOf('Deep Space Transport'), 'Deep Space Transport');
  eq('the Orca group is the Orca', hullClassOf('Industrial Command Ship'), 'Orca');
  eq('a combat ship has no hauling class', hullClassOf('Cruiser'), null);
}

console.log('\n--- tonight and results ---');
const it = (id, stake, kind = 'move') => ({ id, kind, title: '', detail: '', stake, action: { label: '' } });
eq('most ISK first', orderTonight([it('a', 1), it('b', 5), it('c', 3)]).map((x) => x.id), ['b', 'c', 'a']);
const sum = summarise([it('a', 10), it('b', 5, 'piExpired')], new Set(['a']));
eq('what is left', sum.left, 1);
eq('  its ISK', sum.stake, 5);
eq('  and its rough time', sum.minutes, MINUTES.piExpired);
eq('  half done', sum.frac, 0.5);
const acts = ['Trading', 'Abyssal'];
const series = byDay([{ t: Date.parse('2026-09-25T10:00:00Z'), activity: 'Trading', isk: 5 }, { t: Date.parse('2026-09-26T10:00:00Z'), activity: 'Abyssal', isk: 7 },
  { t: Date.parse('2026-08-01T10:00:00Z'), activity: 'Trading', isk: 99 }], 2, Date.parse('2026-09-26T12:00:00Z'), acts);
eq('each day in its own bucket, outside the window ignored', series.map((d) => d.values), [[5, 0], [0, 7]]);
eq('totals per activity', totals(series, 2), [5, 7]);
eq('per hour needs hours', perHour(100, undefined, 7), null);
eq('per hour over the period', perHour(700, 7, 7), 100);
{
  const sets = { filaments: new Set([1]), abyssLoot: new Set([2]), pi: new Set([3]), lpGoods: new Set([4]) };
  const T = (id, typeId, isBuy, qty, unitPrice) => ({ id, typeId, date: '2026-09-20T10:00:00Z', isBuy, qty, unitPrice });
  const ev = attribute({
    txs: [T('a', 1, true, 2, 100), T('b', 2, false, 1, 1000), T('c', 3, false, 10, 50), T('d', 4, false, 1, 900), T('e', 9, false, 1, 5000), T('f', 2, false, 1, 777)],
    journal: [
      { date: '2026-09-20T11:00:00Z', refType: 'transaction_tax', amount: -30, contextId: 'b' },
      { date: '2026-09-20T12:00:00Z', refType: 'planetary_export_tax', amount: -40 },
      { date: '2026-09-20T12:00:00Z', refType: 'lp_store', amount: -500 },
      { date: '2026-09-20T12:00:00Z', refType: 'contract_reward', amount: 2000 },
      { date: '2026-09-20T12:00:00Z', refType: 'bounty_prizes', amount: 300 },
      { date: '2026-09-20T12:00:00Z', refType: 'brokers_fee', amount: -8 },
    ],
    tracked: new Set(['f']), realized: [{ t: 1, isk: 55 }], losses: [{ t: 2, activity: 'Hauling', isk: 400 }], sets, salesTax: 0.1,
  });
  const by = (a) => ev.filter((e) => e.activity === a).reduce((t, e) => t + e.isk, 0);
  eq('trading is what positions realized', by('Trading'), 55);
  eq('abyssal: loot sold after its actual tax, less filaments bought', by('Abyssal'), 1000 - 30 - 200);
  eq('planets: goods sold after estimated tax, less customs', by('Planets'), 500 - 50 - 40);
  eq('loyalty: store goods sold less the ISK the store took', by('Loyalty'), 900 - 90 - 500);
  eq('hauling: courier rewards less the hauler lost', by('Hauling'), 2000 - 400);
  eq('combat: bounties', by('Combat'), 300);
  eq('a trade a position counts is never double-counted', ev.some((e) => e.isk === 777 || e.isk === 777 * 0.9), false);
  eq('an item belonging to nothing is left out', ev.some((e) => e.isk === 4500), false);
}

console.log('\n--- prefs ---');
eq('an unknown theme falls back', sanitizePrefs({ theme: 'Jove' }).theme, 'Caldari');
eq('motion left unset follows the system', effectiveMotion(undefined, true), 'Calm');
eq('  or full when not asked', effectiveMotion(undefined, false), 'Full');
eq('a chosen motion wins', effectiveMotion('Off', false), 'Off');
eq('only the one-month pack is assumed', sanitizePrefs({}).omegaPacks, { 1: 500, 3: null, 6: null, 12: null });
eq('alerts start off', sanitizeAlerts({}).on, false);
eq('an odd interval falls back', sanitizeAlerts({ interval: 7 }).interval, 5);

}

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
