// Verification harness for the pure logic that has no UI to eyeball.
// Run with: npm run check   (Node strips the TypeScript types natively)
import { statsFrom, pickPages, passesGate, warningsFor, expectedEdge, sortProspects, FIRST_DIR, DEFAULT_FILTERS, recentAverages, typicalDailyVolume } from '../src/lib/prospects.ts';
import { priceUp, tickDown } from '../src/lib/tick.ts';
import { dueForSync } from '../src/lib/schedule.ts';
import { adviseRelist, byUrgency, weightedLevel, marketBest } from '../src/lib/relist.ts';
import { valueOffer, byIskPerLp, patientPrice, instantPrice, daysToClear, planFor, notesFor, spendPlan } from '../src/lib/loyalty.ts';
import { parseFilament, byTier, runsFrom, TIERS } from '../src/lib/abyssal.ts';
import { judgeCourier, byRewardPerJump, byUsefulness, roundTrips, tally, HAULERS, effectiveCapacity, hullClassOf } from '../src/lib/courier.ts';
import { parsePlanetType, planetsFor, estimate, inBand, P0_PER_P1, sortSystems, rankProducts, refineVerdict, RAW_PER_HOUR, MADE_PER_HOUR, BASIC_FACTORY, P1_PER_P2, setupSteps, P1_TO_P0 } from '../src/lib/pi.ts';
import { classify, readExtractor, contentsOf, readColony, byAttention, typesIn, valueOf } from '../src/lib/colony.ts';
import { check, byUrgency as bySkillUrgency, readiness, skillsOf, trainedOptions, HAULING_SKILLS } from '../src/lib/skills.ts';
import { iskPerHour, RUN_MINUTES } from '../src/lib/abyssal.ts';
import { buyerShare, sideVolume, competitionShare, roundTripDays, returnPerDay, EVEN_SPLIT, COMPETITION_MIN, COMPETITION_MAX, tradingSplit, MIN_BOOK_SOLD } from '../src/lib/split.ts';
import { calcWith, RELIST_LEFT, breakEvenSell, breakEvenSpread } from '../src/lib/fees.ts';
import { walkBids } from '../src/lib/relist.ts';
import { isWall, paceDay, withoutOwn } from '../src/lib/prospects.ts';
import { nearMisses, squeezed as isSqueezed } from '../src/lib/signals.ts';
import { exportTax, PI_BASE, HIGHSEC_NPC_TAX } from '../src/lib/pi.ts';
import { allocate } from '../src/lib/planner.ts';
import { priceHub, shipment, goingRate } from '../src/lib/arbitrage.ts';
import { shouldAlert, nextCheckIn, alertMail, isStaleAlertMail, MAIL_SUBJECT, keepSaid, tidyEvery } from '../src/lib/alerts.ts';
import { spForLevel, spPerMinute, trainingDays, monthlyGain } from '../src/lib/training.ts';
import { categoryOf, flows, feeLeak, balanceAt, balanceSeries, autoTag, nextTag, runwayDays, unusual, csvCell } from '../src/lib/wallet.ts';
import { readKillmail, priceOnDay, valueKillmail, activityOf, matchInsurance, learnedGankLines, gankLineFor, multibuy } from '../src/lib/combat.ts';
import { orderTodo, remember, split, summarise, judgeOrder, judgePi, judgeScam, SESSION_MS } from '../src/lib/todo.ts';
import { fmtDateTime } from '../src/lib/format.ts';
import { bookFills, addFlow, observedFlow, pruneFlow, pace as sidePaceBlend, MAX_GAP_H } from '../src/lib/flow.ts';
import { byDay, totals, perHour, attribute, otherSales } from '../src/lib/results.ts';
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
// PL-0 Scoped Cargo Scanner's real book: one huge order at 45,000 makes 161 real units at 30,040
// look like 1% of the side. Against what the item trades in a day they're half a day's supply.
const pl0 = [lv(30040, 105), lv(30050, 56), lv(34780, 1995), lv(34800, 844), lv(34830, 619), lv(44990, 1), lv(45000, 9909)];
eq('without the day\'s volume the cheap listings look like a token', marketBest(pl0, false), 34780);
eq('with it they are the real cheapest seller', marketBest(pl0, false, 250), 30040);
eq('but a quarter of a day is the line: 161 units on an item trading 1,000 a day is still skippable', marketBest(pl0, false, 1000), 34780);
eq('a single fat-fingered unit is still skipped on a busy item', marketBest([lv(1000, 1), lv(7160, 5000)], false, 900), 7160);
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
// Already one step over the best bid, with trading only at the bid: nothing to move to. The user's Motley Compound
// (29 September 2026): 27 at 4,001 over a 4,000 bid, told to "Move it" to 4,001.
{
  const motley = [o(30, false, 4001, 27), o(31, false, 7000, 36), o(32, false, 7500, 1498), o(33, true, 4000, 1995), o(34, true, 3501, 9581)];
  // Its highs, 15 to 28 September: at the bid every day but two.
  const highs = [3501, 5000, 2500, 2500, 2500, 2500, 2510, 3000, 7546, 3001, 4000, 4000, 4000, 4000];
  const m = adviseRelist({ orderId: 30, typeId: 11733, isBuy: false, price: 4001, volumeRemain: 27 }, { book: motley, dailyVolume: 3, highs }, R);
  eq('one step over the bid already, trading only at the bid: wait, not a move to the same price', [m.verdict, /already one step over today’s best bid of 4,000/.test(m.why), /sell into that bid now/.test(m.why)], ['wait', true, true]);
}
// A token in front of real stock: the move is to the real front, not the token. The user's Small Focused Afocal Laser I
// (29 September 2026): 16 at 21,950, one unit listed at 5,003 (a tick over the 5,002 bid) ahead of 432 at 21,930.
{
  const afocal = [
    o(10, false, 5003, 1), o(11, false, 21930, 432), o(12, false, 21940, 1), o(13, false, 21950, 16), o(14, false, 21960, 211),
    o(15, false, 21970, 146), o(16, false, 21990, 5), o(17, false, 22000, 136), o(18, false, 24380, 501),
    o(20, true, 5002, 428), o(21, true, 5001, 298), o(22, true, 5000, 8288),
  ];
  // Its highs, 14 September to 27 September: the bulk of trading got up to ~21,950 on 6 of them.
  const highs = [21970, 2092, 12100, 21970, 21970, 5001, 21960, 21960, 20990, 20980, 20000, 20000, 5000, 21950];
  const a = adviseRelist({ orderId: 13, typeId: 6717, isBuy: false, price: 21950, volumeRemain: 16 }, { book: afocal, dailyVolume: 7.2, highs }, R);
  eq('a token in front of real stock: move to one step under the real front, not the token', [a.newPrice, a.verdict], [21920, 'move']);
  if (/5,00\d/.test(a.why)) { failed++; console.log(`  FAIL the token is still the target: ${a.why}`); }
  // Only the token ahead: the guard against chasing a mistake answers, as before.
  const alone = adviseRelist({ orderId: 11, typeId: 6717, isBuy: false, price: 21930, volumeRemain: 432 }, { book: afocal, dailyVolume: 7.2, highs }, R);
  eq('  only the token ahead: wait, it’s someone’s mistake or a token', [alone.verdict, /mistake or a token dump/.test(alone.why)], ['wait', true]);
}
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
// The target is per trade. Here the stock takes nearly two days to sell, so only a target over about 70%
// a trade would make the hour-for-hour saving worth a 31% cut.
eq('a target of 100% a trade would take the move', adviseRelist(skim, { book: skimBook, dailyVolume: 260 }, R, 4, 1).verdict, 'move');
eq('  60% a trade would not', adviseRelist(skim, { book: skimBook, dailyVolume: 260 }, R, 4, 0.6).verdict, 'wait');
// The user's Upgraded Explosive Coating I, 27 Sep 2026: one unit ahead, 36 of their own taking six days
// to sell. Getting in front saves about four hours of a six-day sale; at 5% a trade that's worth well under
// the ~1,600 ISK the move costs. Read as 5% a day, the rule had said move.
{
  const coating = { orderId: 1, typeId: 16321, isBuy: false, price: 9388, volumeRemain: 36 };
  const c = adviseRelist(coating, { book: [o(1, false, 9388, 36), o(2, false, 9380, 1), o(3, false, 9389, 35)], dailyVolume: 5.6 }, R, 4, 0.05);
  eq('one unit ahead of a six-day sale: leave it', c.verdict, 'wait');
  has('  and it says why', c.why, 'over the 6 days this stock takes to sell');
  eq('  the same with the stock selling in a day moves', adviseRelist({ ...coating, volumeRemain: 5 }, { book: [o(1, false, 9388, 5), o(2, false, 9380, 1)], dailyVolume: 5.6 }, R, 4, 0.05).verdict, 'move');
}
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
// Not asking is not the same as being refused: without the structures permission, the app must not
// call a structure a scam. It is still not safe, because nobody checked.
const unasked = { ...unknowable, unchecked: true };
cv = judgeCourier(job, unasked, unasked, null, LIM, NOWC);
eq('a structure nobody could ask about is unchecked, not accused', cv.flags.filter((f) => /Unknown|Unchecked/.test(f)), ['endUnchecked', 'startUnchecked']);
eq('  still not safe', cv.safe, false);
eq('  and no route claim about places we did not identify', cv.flags.includes('noSafeRoute'), false);
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
const byName = (re) => HAULERS.find((h) => re.test(h.name));
const at5 = (...skills) => (s) => (skills.includes(s) ? 5 : 0);
eq('a Charon at Caldari Freighter V holds 581,250; Advanced Spaceship Command moves agility, not cargo', effectiveCapacity(freighter, at5('Caldari Freighter', 'Advanced Spaceship Command')).m3, 581250);
eq('an Orca at Industrial Command Ships V: its 30,000 cargo grows, its 40,000 fleet hangar doesn’t', effectiveCapacity(byName(/^Orca/), at5('Industrial Command Ships')).m3, 77500);
eq('a Bustard at Transport Ships V: its fleet hangar grows to 62,500 beside the 5,000 cargo', effectiveCapacity(byName(/^Deep/), at5('Transport Ships')).m3, 67500);
eq('a Rhea at Caldari Freighter V: 180,000', effectiveCapacity(byName(/^Jump/), at5('Caldari Freighter')).m3, 180000);
// A freighter's only cargo bonus is its racial Freighter skill's (ESI, 30 September 2026: freighterBonusC1 moves velocity,
// Advanced Spaceship Command agility). It used to be counted twice.
const allV = (n) => (n === 'Caldari Freighter' || n === 'Advanced Spaceship Command' ? 5 : 0);
eq('one freighter bonus at V, not two', effectiveCapacity(freighter, allV).m3, Math.round(465000 * 1.25));
eq('  naming the skill doing the work', effectiveCapacity(freighter, allV).from.map((x) => x.skill), ['Caldari Freighter']);
// The preset is a Charon: another race's Freighter skill flies another race's freighter (the Hauling tree has them all).
eq('a Gallente freighter pilot gets nothing for a Charon', effectiveCapacity(freighter, (n) => (n === 'Gallente Freighter' ? 5 : 0)).m3, 465000);
// Part-trained is part of the bonus, not all or nothing.
eq('three levels give three levels of bonus', effectiveCapacity(freighter, (n) => (n === 'Caldari Freighter' ? 3 : 0)).m3, Math.round(465000 * 1.15));
const dst = HAULERS.find((h) => /^Deep Space/.test(h.name));
eq('a DST’s fleet hangar bonus applies to the hangar alone', effectiveCapacity(dst, () => 5).m3, 5000 + 62500);
// A freighter pilot should see contracts an untrained one cannot take.
const bigHaul = { contractId: 9, reward: 50_000_000, collateral: 0, volume: 550_000, daysToComplete: 5, dateExpired: '2026-10-30T00:00:00Z', startId: 1, endId: 2, title: '' };
const trainedLimits = { ...LIM, maxVolume: effectiveCapacity(freighter, allV).m3 };
has('550,000 m3 is too big for a bare freighter', judgeCourier(bigHaul, stn(0.9), stn(0.8), 10, { ...LIM, maxVolume: 465000 }, NOWC).flags, 'tooBig');
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
eq('the front holding most of the side and days of volume is a wall', isWall([{ price: 1, volume: 900 }, { price: 2, volume: 100 }], 100), true);
eq('an even book is not', isWall([{ price: 1, volume: 500 }, { price: 2, volume: 500 }], 100), false);
// The user's Small Ghoul Compact Energy Nosferatu bids (30 September 2026): their own 4,438 at 2,229 at the front, a market
// of ~230 a day. Their own order made the wall; taken off, the book is ordinary.
const ghoul = [{ price: 2229, volume: 4438 }, { price: 2228, volume: 91 }, { price: 2227, volume: 942 }, { price: 2226, volume: 495 }, { price: 2224, volume: 281 }, { price: 2223, volume: 1 }];
eq('your own order is no wall to you: taken off its price’s level first', [isWall(ghoul, 230), isWall(withoutOwn(ghoul, [{ price: 2229, volume: 4438 }]), 230), withoutOwn(ghoul, [{ price: 2229, volume: 4438 }])[0].price], [true, false, 2228]);
eq('  only your share comes off a level others are on too', withoutOwn([{ price: 5, volume: 300 }], [{ price: 5, volume: 100 }]), [{ price: 5, volume: 200 }]);
eq('a single level cannot be judged', isWall([{ price: 1, volume: 900 }], 100), false);
eq('a big order deeper in the book is just a big order', isWall([{ price: 1, volume: 50 }, { price: 2, volume: 900 }, { price: 3, volume: 50 }], 100), false);
eq('a big front on a market that clears it in a day is just supply', isWall([{ price: 1, volume: 900 }, { price: 2, volume: 100 }], 1000), false);
eq('without a known pace there is no claim', isWall([{ price: 1, volume: 900 }, { price: 2, volume: 100 }]), false);
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
// Out of slots with ISK idle: five small markets at 4% a flip that take 20 M each lose to five big ones at 2% that take
// 150 M each (the user asked the planner to "fill the given slots" intelligently, 29 September 2026).
const small = [1, 2, 3, 4, 5, 6].map((i) => pr(i, 0.04, 100, 20e6 / 3, [], 4));
const big = [11, 12, 13, 14, 15, 16].map((i) => pr(i, 0.02, 100, 150e6 / 3, [], 2));
plan2 = allocate([...small, ...big], { isk: 1e9, slots: 10, horizonDays: 3, maxShare: 1 });
eq('slots short: the mix is filled by ISK a day when that earns more', [plan2.ranked, plan2.rows.map((r) => r.p.typeId).sort((a, b) => a - b), Math.round(plan2.deployed / 1e6)], ['isk', [11, 12, 13, 14, 15], 750]);
eq('  and earns more than best return first would have', Math.round(plan2.perDay / 1e3), 5000);
plan2 = allocate([...small, ...big], { isk: 1e9, slots: 40, horizonDays: 3, maxShare: 1 });
eq('  with slots to spare, best return per day first as before', [plan2.ranked, plan2.rows[0].p.typeId], ['return', 1]);
{
  // What you already have working in an item uses the same flip capacity: a second plan on an item the first already
  // bids on was sized as if its market were empty (the user, 2 October 2026: "make that change to the planner").
  const { workingUnits } = await import('../src/lib/planner.ts');
  const one = pr(77, 0.05, 100, 10_000); // its market takes 100 units a day at 100
  const working = workingUnits([
    { typeId: 77, state: 'open', locationId: 60003760, volumeRemain: 40, isBuy: true },
    { typeId: 77, state: 'open', locationId: 60003760, volumeRemain: 20, isBuy: false },
    { typeId: 77, state: 'open', locationId: 60008494, volumeRemain: 500, isBuy: true },
    { typeId: 77, state: 'expired', locationId: 60003760, volumeRemain: 0, isBuy: true },
  ], { 77: 10 });
  eq('working: your open Jita buys and sells left, and the Jita hangar; not Amarr, not a closed order', working, { 77: 70 });
  eq('  a hangar not read yet counts as nothing held', workingUnits([{ typeId: 77, state: 'open', locationId: 60003760, volumeRemain: 40, isBuy: true }], null), { 77: 40 });
  const base = { isk: 100_000, slots: 10, horizonDays: 1, maxShare: 1 };
  eq('nothing working: the plan takes all 100 units its market takes', allocate([one], base).rows[0].units, 100);
  const sized = allocate([one], { ...base, working });
  eq('  40 in open buys and 30 held: it takes what is left, 30 of the 100', [sized.rows[0].units, sized.rows[0].takes, sized.rows[0].working, sized.filled], [30, 100, 70, 0]);
  const full = allocate([one, pr(78, 0.04, 100, 10_000)], { ...base, working: { 77: 100 } });
  eq('  100 working: no row, and counted as already filled', [full.rows.map((r) => r.p.typeId), full.filled], [[78], 1]);
}

{
  // Starting a plan: the game can't place several buy orders at once, so a plan is positions plus a checklist.
  const { newPlan, planPlacement: placement, planProgress, sanitizePlans } = await import('../src/lib/plans.ts');
  const placedOrder = (i, p, o, pos) => placement(i, p, o, pos)?.order ?? null;
  const { judgePlaceBuy } = await import('../src/lib/todo.ts');
  const at = '2026-09-29T18:00:00Z';
  const made = [];
  const tp = newPlan([{ p: { typeId: 34, buy: 3.5, sell: 3.9 }, units: 1_000_000 }, { p: { typeId: 35, buy: 7, sell: 8 }, units: 50_000 }],
    { id: 'p1', at, deployed: 3.85e6, horizonDays: 3, patient: true, name: 'Test plan' }, (t) => { made.push(t); return 'pos' + t; });
  eq('a started plan: each item’s bid, quantity and target, with its position', [tp.items.map((i) => [i.typeId, i.buyAt, i.units, i.sellAt, i.positionId]), made],
    [[[34, 3.5, 1_000_000, 3.9, 'pos34'], [35, 7, 50_000, 8, 'pos35']], [34, 35]]);
  const O = (orderId, typeId, isBuy, issued, extra = {}) => ({ orderId, typeId, isBuy, price: 3.5, volumeTotal: 1_000_000, volumeRemain: 1_000_000, issued, state: 'open', locationId: 60003760, ...extra });
  const orders = [
    O(1, 34, true, '2026-09-29T18:04:00Z'),
    O(2, 35, true, '2026-09-28T10:00:00Z'),                                                            // placed before the plan
    O(3, 35, false, '2026-09-29T18:10:00Z'),                                                           // a sell, not a buy
    O(4, 35, true, '2026-09-29T18:30:00Z', { locationId: 60008494 }),                                  // in Amarr
  ];
  eq('placed: a buy for the item in Jita since the plan started', [placedOrder(tp.items[0], tp, orders)?.orderId, placedOrder(tp.items[1], tp, orders)], [1, null]);
  eq('  an order repriced since but placed before doesn’t count', placedOrder(tp.items[1], tp, [O(5, 35, true, '2026-09-29T18:20:00Z', { seen: [{ issued: '2026-09-28T09:00:00Z', price: 7, remain: 1 }] })]), null);
  eq('  progress', [planProgress(tp, orders).placed, planProgress(tp, orders).of, planProgress(tp, orders).waiting.map((i) => i.typeId)], [1, 2, [35]]);
  {
    // The Vigilance Resonance Key case (30 September 2026): 15 placed at 00:36:15, the position opened 00:35:02, a plan for 16 at 00:41:37.
    const { planPlacement, placementNote } = await import('../src/lib/plans.ts');
    const vp = { at: '2026-09-30T00:41:37Z' };
    const vi = { typeId: 89156, buyAt: 24_950_000, units: 16, sellAt: 27e6, positionId: 'v' };
    const pos = [{ id: 'v', typeId: 89156, openedAt: '2026-09-30T00:35:02Z' }];
    const V = (orderId, issued, extra = {}) => O(orderId, 89156, true, issued, { price: 24_950_000, volumeTotal: 15, volumeRemain: 15, ...extra });
    const early = V(10, '2026-09-30T00:36:15Z');
    const pl = planPlacement(vi, vp, [early], pos);
    eq('placed before the plan, after its position opened: counted, 15 of 16', [pl?.order.orderId, pl?.before, pl?.units, placementNote(vi, pl).lead], [10, 15, 15, 'Already placed: 15 of 16 (before the plan)']);
    eq('  short of the plan: says EVE can’t change a quantity, never to replace it', placementNote(vi, pl).short, 'EVE can’t change an order’s quantity: the 1 more is a new order with its own fee, or leave it at 15.');
    eq('  covering the plan: nothing more said', placementNote({ units: 15 }, pl).short, null);
    eq('  an order from the day before isn’t', planPlacement(vi, vp, [V(11, '2026-09-29T00:36:15Z')], pos), null);
    eq('  placed before the position opened isn’t', planPlacement(vi, vp, [V(12, '2026-09-30T00:30:00Z')], pos), null);
    eq('  with no position before the plan, an hour counts and 61 minutes doesn’t',
      [planPlacement(vi, vp, [V(13, '2026-09-29T23:45:00Z')], [])?.order.orderId, planPlacement({ ...vi, positionId: null }, vp, [V(14, '2026-09-30T00:00:00Z')], [])?.order.orderId, planPlacement({ ...vi, positionId: null }, vp, [V(15, '2026-09-29T23:40:00Z')], [])],
      [13, 14, null]);
    eq('  a cancelled earlier order isn’t placed', planPlacement(vi, vp, [V(16, '2026-09-30T00:36:15Z', { state: 'cancelled' })], pos), null);
    // The final review's reproductions (1 October 2026): one order's units alone read "1 of 16 placed … the 15 more is a
    // new order" after the 1 more was placed as the note advised, and "6 of 16" for a plan placed in two batches.
    const late = V(17, '2026-09-30T00:44:02Z', { volumeTotal: 1, volumeRemain: 1 });
    const both = planPlacement(vi, vp, [early, late], pos);
    eq('  15 before and the 1 more since: 16 of 16, nothing more said', [both.order.orderId, both.units, both.before, placementNote(vi, both).lead, placementNote(vi, both).short], [17, 16, 15, '16 of 16 placed (15 before the plan)', null]);
    const batches = [V(20, '2026-09-30T00:44:00Z', { volumeTotal: 10, volumeRemain: 10 }), V(21, '2026-09-30T01:00:00Z', { volumeTotal: 6, volumeRemain: 6 })];
    const two = planPlacement(vi, vp, batches, pos);
    eq('  10 and then 6 since the plan: 16 of 16, the newer shown', [two.order.orderId, two.units, placementNote(vi, two).lead, placementNote(vi, two).short], [21, 16, '16 of 16 placed', null]);
    const gone = V(22, '2026-09-30T01:10:00Z', { state: 'cancelled' });
    eq('  a cancelled order since the plan that bought nothing isn’t counted', [planPlacement(vi, vp, [gone], pos), planPlacement(vi, vp, [...batches, gone], pos).units], [null, 16]);
    // A before-plan order that filled leaves your open orders (expired, or closed from the history read): it still counts,
    // so the checklist and To do don't ask for it again inside the plan's week.
    const filled = (state) => V(23, '2026-09-30T00:36:15Z', { state, volumeRemain: 0 });
    const plan1 = { ...vp, id: 'v', name: 'v', isk: 0, horizonDays: 7, patient: false, items: [vi] };
    for (const st of ['expired', 'closed']) {
      eq(`  filled before the plan (${st}): still placed, 15 of 16, and To do doesn’t ask again`,
        [placementNote(vi, planPlacement(vi, vp, [filled(st)], pos)).lead, planProgress(plan1, [filled(st)], pos).placed, placedOrder(vi, vp, [filled(st)], pos)?.orderId],
        ['Already placed: 15 of 16 (before the plan)', 1, 23]);
    }
    eq('  cancelled after buying some: counted, units were bought', planPlacement(vi, vp, [V(24, '2026-09-30T00:36:15Z', { state: 'cancelled', volumeRemain: 5 })], pos)?.units, 15);
    eq('  To do says the units summed', judgePlaceBuy({ item: { key: 'plan:v:89156' } }, { plan: true, placed: { units: both.units, price: both.order.price } }), 'Placed: 16 at 24,950,000.');
    // A plan reusing a position opened weeks before: a bid from then, filled long since, isn't placed for this plan.
    eq('  a position opened weeks before the plan: its old filled bid doesn’t count',
      planPlacement(vi, vp, [V(25, '2026-09-10T12:00:00Z', { state: 'expired', volumeRemain: 0 })], [{ id: 'v', typeId: 89156, openedAt: '2026-09-10T11:00:00Z' }]), null);
    // The day's edge: a position opened 25 hours before the plan gets only the hour, so its bid from 24.5 hours before doesn't count.
    eq('  a position opened just over a day before: only the hour',
      planPlacement(vi, vp, [V(26, '2026-09-29T00:11:37Z')], [{ id: 'v', typeId: 89156, openedAt: '2026-09-28T23:41:37Z' }]), null);
    eq('  progress counts it, so To do’s item ticks off too', [planProgress({ ...vp, id: 'v', name: 'v', isk: 0, horizonDays: 3, patient: false, items: [vi] }, [V(18, '2026-09-29T21:00:00Z')], [{ id: 'v', typeId: 89156, openedAt: '2026-09-29T20:00:00Z' }]).placed, planProgress({ ...vp, id: 'v', name: 'v', isk: 0, horizonDays: 3, patient: false, items: [vi] }, [V(18, '2026-09-29T21:00:00Z')], []).placed], [1, 0]);
  }
  eq('plans from disk: malformed ones are dropped', sanitizePlans([tp, { id: 'x' }, null, { ...tp, id: 'p2', items: [{ typeId: 'no' }] }]).map((p) => p.id), ['p1']);
  const e = { item: { key: 'plan:p1:35' }, seenAt: Date.parse(at), lastAt: Date.parse(at) };
  eq('To do: a plan’s order ticks off once placed, waits while not, and goes when the plan does',
    [judgePlaceBuy(e, { plan: true, placed: { units: 50_000, price: 7 } }), judgePlaceBuy(e, { plan: true, placed: null }), judgePlaceBuy(e, { plan: false, placed: null })],
    ['Placed: 50,000 at 7.', null, false]);
}

console.log('\n--- the checklist counts a bid that filled when it was placed ---');
{
  // Imperial Navy Infiltrator, in the user's second plan (2 October 2026, 15:36:31.972): its bid of 11 at 1,658,000 was over
  // the cheapest listing, so it bought 11 at 1,608,000 at 15:46:40 and never stood. ESI lists such an order only in your
  // order history, cached an hour, so the checklist and To do kept asking for it and the user thought them broken.
  const { planPlacement, placementNote, planProgress } = await import('../src/lib/plans.ts');
  const { judgePlaceBuy } = await import('../src/lib/todo.ts');
  const JITA = 60003760, INF = 31866, plan = { at: '2026-10-02T15:36:31.972Z' };
  const it = { typeId: INF, buyAt: 1_658_000, units: 11, sellAt: 1_836_000, positionId: 'inf' };
  const pos = [{ id: 'inf', typeId: INF, openedAt: plan.at }];
  const T = (id, typeId, qty, price, date) => ({ id, source: 'esi', typeId, date, isBuy: true, qty, unitPrice: price, locationId: JITA });
  const bought = T('6885107521', INF, 11, 1_608_000, '2026-10-02T15:46:40Z');
  const now = planPlacement(it, plan, [], pos, { txs: [bought], ignored: [] });
  eq('no order, the trade: placed, 11 of 11, bought at once at what it paid', [now?.units, now?.atOnce, now?.order, now?.price, now && placementNote(it, now).lead], [11, 11, null, 1_608_000, '11 of 11 bought at once']);
  eq('  and says where the order went', now && placementNote(it, now).atOnce, 'Your bid was at or over the cheapest listing, so it bought from the listings there and then: the order shows only in your order history, within the hour.');
  const hist = { orderId: 7435101234, typeId: INF, isBuy: true, price: 1_658_000, volumeTotal: 11, volumeRemain: 0, issued: '2026-10-02T15:46:40Z', state: 'expired', locationId: JITA };
  const later = planPlacement(it, plan, [hist], pos, { txs: [bought], ignored: [] });
  eq('  the order arrives from history: its fill explains the trade, 11 not 22', [later.units, later.atOnce, later.order?.orderId, placementNote(it, later).lead, placementNote(it, later).atOnce], [11, 0, 7435101234, '11 of 11 placed', null]);
  const part = { orderId: 2, typeId: INF, isBuy: true, price: 1_600_000, volumeTotal: 10, volumeRemain: 6, issued: '2026-10-02T15:50:00Z', state: 'open', locationId: JITA };
  const both = planPlacement({ ...it, units: 21 }, plan, [part], pos, { txs: [bought, T('f1', INF, 4, 1_600_000, '2026-10-02T16:10:00Z')], ignored: [] });
  eq('  a partly filled open order and a bid bought at once: 21 placed, 11 of them at once, the open one shown',
    [both.units, both.atOnce, both.order?.orderId, both.price, placementNote({ units: 21 }, both).lead], [21, 11, 2, 1_600_000, '21 of 21 placed (11 bought at once)']);
  eq('  a trade tagged Personal isn’t counted', planPlacement(it, plan, [], pos, { txs: [bought], ignored: ['6885107521'] }), null);
  eq('  nor one in another station, or a sale', [planPlacement(it, plan, [], pos, { txs: [{ ...bought, locationId: 60008494 }], ignored: [] }), planPlacement(it, plan, [], pos, { txs: [{ ...bought, isBuy: false }], ignored: [] })], [null, null]);
  // Clone Soldier Transporter Tag: the 30 September plan's bid, 4 at 28,980,000, still open under the 2 October plan. A
  // standing bid fills at its own price; two of it filling after the plan are its own, never a placement for the new one.
  const CS = 33140, cs = { typeId: CS, buyAt: 29_370_000, units: 1, sellAt: 33_400_000, positionId: 'cs' };
  const csPos = [{ id: 'cs', typeId: CS, openedAt: '2026-09-30T00:41:37.568Z' }];
  const oldBid = { orderId: 7433389245, typeId: CS, isBuy: true, price: 28_980_000, volumeTotal: 4, volumeRemain: 2, issued: '2026-09-30T22:49:27Z', state: 'open', locationId: JITA,
    seen: [{ issued: '2026-09-30T00:43:08Z', price: 28_820_000, remain: 4 }, { issued: '2026-09-30T17:42:56Z', price: 28_840_000, remain: 4 }, { issued: '2026-09-30T22:49:27Z', price: 28_980_000, remain: 4 }] };
  const oldFill = T('c1', CS, 2, 28_980_000, '2026-10-02T16:30:00Z');
  eq('  an older bid filling since is that bid’s, not a placement', planPlacement(cs, plan, [oldBid], csPos, { txs: [oldFill], ignored: [] }), null);
  eq('  but a buy beyond what it filled is', planPlacement(cs, plan, [oldBid], csPos, { txs: [oldFill, T('c2', CS, 1, 29_370_000, '2026-10-02T16:05:42Z')], ignored: [] })?.atOnce, 1);
  const p1 = { ...plan, id: 'p', name: 'p', isk: 0, horizonDays: 0.5, patient: true, items: [it] };
  eq('  progress counts it, so the checklist and To do tick it off', [planProgress(p1, [], pos, { txs: [bought], ignored: [] }).placed, planProgress(p1, [], pos).placed], [1, 0]);
  // Two bids before the plan inside its window (the review, 2 October 2026): the older bought 5 at once from listings, the
  // newer stands for 10. Only the newer counts as placed for the plan; the older's fill, at a listing's price, is its own.
  const at = Date.parse(plan.at), iso = (t) => new Date(t).toISOString();
  const older = { orderId: 30, typeId: INF, isBuy: true, price: 1_700_000, volumeTotal: 5, volumeRemain: 0, issued: iso(at - 30 * 60_000), state: 'expired', locationId: JITA };
  const newer = { orderId: 31, typeId: INF, isBuy: true, price: 1_650_000, volumeTotal: 10, volumeRemain: 10, issued: iso(at - 10 * 60_000), state: 'open', locationId: JITA };
  const two = planPlacement({ ...it, positionId: null }, plan, [older, newer], [], { txs: [T('o1', INF, 5, 1_608_000, iso(at - 30 * 60_000))], ignored: [] });
  eq('  an older bid before the plan that bought at once is its own: 10 placed, not 15', [two?.units, two?.atOnce, two?.order?.orderId], [10, 0, 31]);
  // A bid for 20 that bought 11 at once leaves 9 standing, which ESI shows up to 20 minutes late. Until then the note
  // mustn't call the 9 a new order to place: that is the duplicate the checklist exists to stop.
  const part20 = planPlacement({ ...it, units: 20 }, plan, [], pos, { txs: [bought], ignored: [] });
  const boughtAt = Date.parse(bought.date);
  eq('  a bid for 20 that bought 11 at once, its order not shown yet: the rest may still be standing',
    placementNote({ units: 20 }, part20, boughtAt + 5 * 60_000).short, 'The other 9 may still be standing as your bid: ESI shows your orders up to 20 minutes late, so check in game before placing more.');
  eq('  20 minutes on, with still no order, the rest is a new order', placementNote({ units: 20 }, part20, boughtAt + 21 * 60_000).short,
    'EVE can’t change an order’s quantity: the 9 more is a new order with its own fee, or leave it at 11.');
  const e = { item: { key: 'plan:p:31866' }, seenAt: Date.parse(plan.at), lastAt: Date.parse(plan.at) };
  eq('  To do says it was bought at once', [judgePlaceBuy(e, { plan: true, placed: { units: 11, price: 1_608_000, atOnce: 11 } }), judgePlaceBuy(e, { plan: true, placed: { units: 21, price: 1_600_000, atOnce: 11 } })],
    ['Bought at once: 11 at 1,608,000.', 'Placed: 21 at 1,600,000, 11 of them bought at once.']);
}

console.log('\n--- a plan counts a position it shares from its own start ---');
{
  // Datacore - Rocket Science (2 October 2026): its position open since 24 September, 12,000 bought and 9,372 sold for
  // 876,418,400 before the plan, 2,628 still listed at 96,980 by a sell order placed on 1 October. The plan (15:36:31.972)
  // took that position for its bid of 188 at 85,540, and the Plans panel and the plan's positions showed those sales as
  // the plan's. The user: each plan "its own contained thing", so the 2,628 held at the plan's start sell first and
  // aren't the plan's at all.
  const { computePosition, planPosition } = await import('../src/lib/positions.ts');
  const { planView } = await import('../src/lib/plans.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const S = sanitizeSettings({ override: true, brokerPct: 1.3, taxPct: 3.375 });
  const JITA = 60003760, RS = 20420, AT = '2026-10-02T15:36:31.972Z';
  const tx = (id, isBuy, qty, price, date, extra = {}) => ({ id, source: 'esi', typeId: RS, date, isBuy, qty, unitPrice: price, locationId: JITA, ...extra });
  const pos = { id: 'mug3pwlix67xqe', typeId: RS, openedAt: '2026-09-24T22:26:26.502Z', status: 'open', jitaOnly: true, excluded: [], included: [] };
  const plan = { id: 'mur4lko4xsll6o', at: AT, items: [{ typeId: RS, buyAt: 85_540, units: 188, sellAt: 94_430, positionId: pos.id }] };
  const sellSeen = [{ issued: '2026-10-01T10:58:01Z', price: 97_480, remain: 4924 }, { issued: '2026-10-02T14:03:55Z', price: 97_190, remain: 4628 }, { issued: '2026-10-02T15:19:38Z', price: 96_980, remain: 2628 }];
  const before = {
    b1: tx('b1', true, 12_000, 80_720, '2026-09-24T22:31:46Z'),
    s1: tx('s1', false, 7076, 92_370, '2026-09-28T12:00:00Z'),
    s2: tx('s2', false, 276, 97_480, '2026-10-01T12:50:51Z'), s3: tx('s3', false, 20, 97_190, '2026-10-02T14:04:33Z'), s4: tx('s4', false, 2000, 96_980, '2026-10-02T15:20:15Z'),
  };
  const sellOrder = (remain) => ({ orderId: 7434267823, typeId: RS, isBuy: false, price: 96_980, volumeTotal: 4924, volumeRemain: remain, issued: '2026-10-02T15:19:38Z', state: remain ? 'open' : 'expired', locationId: JITA, seen: sellSeen });
  const buyOrder = (remain) => ({ orderId: 7435100906, typeId: RS, isBuy: true, price: 85_540, volumeTotal: 188, volumeRemain: remain, issued: '2026-10-02T15:48:23Z', state: remain ? 'open' : 'expired', locationId: JITA, seen: [{ issued: '2026-10-02T15:48:23Z', price: 85_540, remain: 188 }] });
  const old = { 1: { orderId: 1, typeId: RS, isBuy: true, price: 80_720, volumeTotal: 12_000, volumeRemain: 0, issued: '2026-09-24T22:30:00Z', state: 'expired', locationId: JITA } };
  const ledger = (txs, orders) => ({ txs, orders: { ...old, ...orders }, journal: {}, meta: {}, positions: [pos], plans: [plan] });
  const cashOf = (c) => c.soldValue - c.boughtValue - c.brokerFees - c.salesTax;
  const books = (c) => Math.round(cashOf(c) + c.costOfStock + c.prepaidFees - c.oversoldNet);

  // As it stood at ~16:20: the plan's bid placed, nothing of it filled, nothing sold since.
  const now = ledger(before, { 7434267823: sellOrder(2628), 7435100906: buyOrder(188) });
  const whole0 = computePosition(pos, now, S);
  eq('the whole position: 12,000 bought, 9,372 sold for 876,418,400, 2,628 held', [whole0.bought, whole0.sold, whole0.soldValue, whole0.stock], [12_000, 9372, 876_418_400, 2628]);
  const v0 = planPosition(pos, plan, now, S);
  eq('the plan’s view: shared, holding 2,628 of the earlier trading’s, nothing bought or sold, no profit',
    [v0.shared, v0.held, v0.c.bought, v0.c.sold, v0.c.soldValue, v0.c.realized, v0.c.stock, v0.c.oversold], [true, 2628, 0, 0, 0, 0, 0, 0]);
  eq('  the sell order listing the earlier stock is none of the plan’s: only its own bid’s fee, prepaid', Math.round(v0.c.prepaidFees), Math.round(0.013 * 85_540 * 188));
  eq('  the view starts at the plan, the position doesn’t move', [planView(pos, plan, now.txs, 2628).openedAt, pos.openedAt], [AT, '2026-09-24T22:26:26.502Z']);

  // Then the plan's 188 fill, the earlier stock sells 2,000, then 1,000 more: 628 of those are the last of the earlier
  // stock, and the 372 beyond are the plan's sales, 188 against what it bought and 184 left out, with no cost guessed.
  const after = { ...before, p1: tx('p1', true, 188, 85_540, '2026-10-02T18:00:00Z'), s5: tx('s5', false, 2000, 96_980, '2026-10-02T19:00:00Z'), s6: tx('s6', false, 1000, 96_980, '2026-10-03T09:00:00Z') };
  const then = ledger(after, { 7434267823: sellOrder(0), 7435100906: buyOrder(0) });
  const mid = ledger({ ...before, p1: after.p1, s5: after.s5 }, { 7434267823: sellOrder(628), 7435100906: buyOrder(0) });
  const vMid = planPosition(pos, plan, mid, S);
  eq('the plan’s 188 filled and 2,000 of the earlier stock sold: nothing of the plan’s sold', [vMid.c.bought, vMid.c.sold, vMid.c.stock, vMid.heldSold, Math.round(vMid.c.realized)],
    [188, 0, 188, 2000, 0]);
  const wholeBefore = JSON.stringify(computePosition(pos, then, S));
  const v1 = planPosition(pos, plan, then, S);
  eq('  1,000 more: 628 the earlier stock’s, 372 the plan’s, 184 of them beyond what it bought', [v1.heldSold, v1.c.sold, v1.c.soldValue, v1.c.oversold, v1.c.stock], [2628, 372, 372 * 96_980, 184, 0]);
  const buyCost = 85_540 * 1.013;
  const tax = 96_980 * 0.03375;
  eq('  its profit is the 188 it bought, sold, less their own costs', Math.round(v1.c.realized), Math.round(188 * (96_980 - tax) - 188 * buyCost));
  eq('  nothing lost in the view', books(v1.c), Math.round(v1.c.realized));
  eq('  and the whole position is as it was: 12,188 bought, 12,372 sold', [JSON.stringify(computePosition(pos, then, S)) === wholeBefore, v1.whole.bought, v1.whole.sold], [true, 12_188, 12_372]);

  // Trades counted by hand belong to the plan only from its start, ESI's or typed in.
  const hand = { ...pos, included: ['a1', 'a2'] };
  const typed = { ...then, positions: [hand], txs: { ...then.txs,
    a1: tx('a1', true, 50, 80_000, '2026-09-30T10:00:00Z', { locationId: 60008494 }), a2: tx('a2', true, 10, 85_000, '2026-10-02T20:00:00Z', { locationId: 60008494 }),
    m1: { id: 'm1', source: 'manual', typeId: RS, positionId: pos.id, date: '2026-09-20T12:00:00Z', isBuy: true, qty: 500, unitPrice: 70_000 },
    m2: { id: 'm2', source: 'manual', typeId: RS, positionId: pos.id, date: '2026-10-02T12:00:00Z', isBuy: false, qty: 5, unitPrice: 96_000 },
    m3: { id: 'm3', source: 'manual', typeId: RS, positionId: pos.id, date: '2026-10-03T12:00:00Z', isBuy: true, qty: 7, unitPrice: 86_000 } } };
  const wHand = computePosition(hand, typed, S), vHand = planPosition(hand, plan, typed, S);
  eq('by hand: the whole counts all of them, the plan only those since it started', [wHand.bought, vHand.c.bought], [12_000 + 188 + 50 + 10 + 500 + 7, 188 + 10 + 7]);
  eq('  only those dated since are left in the view’s own list', planView(hand, plan, typed.txs).included, ['a2']);

  // A position the plan opened is the plan's whole.
  const own = { ...pos, id: 'own', openedAt: AT };
  const vOwn = planPosition(own, plan, { ...then, positions: [own] }, S);
  eq('a position opened by the plan isn’t shared, and is counted whole', [vOwn.shared, vOwn.held, planView(own, plan, then.txs) === own], [false, 0, true]);

  // A position opened for the plan, just before it, is the plan's whole (the review, 2 October 2026). The 30 September
  // plan's Vigilance Resonance Key: position opened 00:35:02.952, its bid of 15 at 24,950,000 placed 00:36:15 (the
  // checklist counts it as placed before the plan), the plan at 00:41:37.568; that bid was cancelled unfilled after the
  // plan started, and its 4,679,391 ISK fee is what the duplicate cost. As a view, the plan lost that fee. Clone Soldier
  // Transporter Tag's position, the 30 September plan's, is still a view under the 2 October plan: opened 2.6 days before
  // it, and its earlier bid has fees though nothing filled. Real orders, trades and fees, read-only from D1.
  const fs7 = await import('node:fs');
  const fx = JSON.parse(fs7.readFileSync(new URL('./fixtures/plan-positions.json', import.meta.url), 'utf8'));
  const SU = sanitizeSettings(fx.settings);
  const real = { txs: Object.fromEntries(fx.txs.map((t) => [t.id, t])), orders: Object.fromEntries(fx.orders.map((o) => [o.orderId, o])), journal: Object.fromEntries(fx.journal.map((j) => [j.id, j])), meta: {}, positions: fx.positions, plans: [fx.plan30, fx.plan2] };
  const [key, cs] = fx.positions;
  const keyWhole = computePosition(key, real, SU), keyPlan = planPosition(key, fx.plan30, real, SU);
  eq('the Key, opened for the plan 6.5 minutes before it, nothing traded before: counted whole, not shared',
    [keyPlan.c === keyPlan.whole, keyPlan.shared, keyPlan.held], [true, false, 0]);
  eq('  the cancelled bid’s 4,679,391 ISK fee stays in the plan’s figures: 16.75 M of fees, as the whole position',
    [Math.round(keyPlan.c.brokerFees), Math.round(keyWhole.brokerFees), Math.round(keyPlan.c.realized) === Math.round(keyWhole.realized)], [16_748_658, 16_748_658, true]);
  const csLater = planPosition(cs, fx.plan2, real, SU), csOwn = planPosition(cs, fx.plan30, real, SU);
  eq('Clone Soldier under the 2 October plan: still a view, from that plan’s start, and tagged', [csLater.c === csLater.whole, csLater.shared, csLater.held], [false, true, 0]);
  eq('  under the 30 September plan that opened it: whole', [csOwn.c === csOwn.whole, csOwn.shared], [true, false]);
  const keyTraded = { ...real, txs: { ...real.txs, early: { id: 'early', source: 'esi', typeId: 89156, date: '2026-09-30T00:40:00Z', isBuy: true, qty: 2, unitPrice: 24_950_000, locationId: JITA } } };
  eq('  the Key with a trade before the plan: a view, those 2 the earlier trading’s', [planPosition(key, fx.plan30, keyTraded, SU).shared, planPosition(key, fx.plan30, keyTraded, SU).held], [true, 2]);
  const early = { ...key, openedAt: '2026-09-29T00:41:37.000Z' };
  eq('  opened just over a day before the plan, nothing traded: a view', planPosition(early, fx.plan30, { ...real, positions: [early, cs] }, SU).shared, true);
}

console.log('\n--- the list step: what a plan bought, priced to list ---');
{
  // The user (2 October 2026), once a plan's buy fills: how to price the sell "so I don't mess up the intelligence the plan
  // set out to accomplish". The plan's sale price showed only in Orders' Plan chip, once a sell order existed. The real case,
  // read-only from D1 at 20:29 UTC with ESI's history and Jita books at 20:31 (scripts/fixtures/plan-list.json): the
  // Imperial Navy Infiltrator, 11 bought at once at 1,608,000 for a Place-and-leave plan selling at 1,836,000; Clone
  // Soldier Transporter Tag, in both plans on one position; Raging Dark Filament, 10 bought, and 1 more listed on 1
  // October, before its position opened, repriced since.
  const fs8 = await import('node:fs');
  const fx = JSON.parse(fs8.readFileSync(new URL('./fixtures/plan-list.json', import.meta.url), 'utf8'));
  const { sanitizeSettings, rates } = await import('../src/lib/fees.ts');
  const { planListRow, planListRows } = await import('../src/lib/positions.ts');
  const { planListPrice, planListSaid, listedSince, unitsToList, listMarket } = await import('../src/lib/plans.ts');
  const { recentRange } = await import('../src/lib/fills.ts');
  const { planListItem, judgePlanList, KIND_LABEL, needs } = await import('../src/lib/todo.ts');
  const S = sanitizeSettings(fx.settings), r = rates(S), NOW = Date.parse(fx.now);
  const INF = 31866, CS = 33140, RD = 47894, JITA = 60003760;
  const byId = (xs, k) => Object.fromEntries(xs.map((x) => [x[k], x]));
  const ledger = (o = {}) => ({
    txs: byId(fx.txs, 'id'), orders: byId(fx.orders, 'orderId'), journal: byId(fx.journal, 'id'), meta: {}, positions: fx.positions,
    plans: [fx.plan2, fx.plan30], stock: { at: fx.now, jita: fx.hangar, total: fx.hangar, inContainers: 0 }, ...o,
  });
  const market = (t) => listMarket(fx.books[t], fx.orders.map((x) => x.orderId), recentRange(fx.history[t], 14, NOW).highs);
  const d = ledger();
  const rows = planListRows(d, S);
  eq('stock to list: the Infiltrator 11, Clone Soldier 1, Raging Dark 10, each once, under the 2 October plan',
    rows.map((x) => [x.item.typeId, x.units, x.plan.id]).sort((a, b) => a[0] - b[0]), [[INF, 11, fx.plan2.id], [CS, 1, fx.plan2.id], [RD, 10, fx.plan2.id]]);
  const inf = rows.find((x) => x.item.typeId === INF);
  eq('  the Infiltrator’s 11 cost 1,608,000 each and the bid’s 228,036.71 ISK fee', Math.round(inf.unitCost * 100) / 100, Math.round((11 * 1_608_000 + 228_036.71) / 11 * 100) / 100);
  const rd = rows.find((x) => x.item.typeId === RD);
  eq('  Raging Dark: the 1 listed on 1 October, before its position, repriced after the plan, lists earlier stock: 10 to list, not 9',
    [rd.listed.units, rd.stock, rd.units], [0, 10, 10]);

  // A Place-and-leave plan lists at its own price, and says where today's List patiently is.
  const keep = 1 - r.f - r.t;
  const pat = planListPrice(inf.item, true, inf.units, inf.unitCost, r, market(INF));
  eq('Place and leave: the Infiltrator lists at the plan’s 1,836,000, beside List patiently today (1,836,000: the same fortnight), not moved',
    [pat.price, pat.from, pat.today, pat.other, pat.moved], [1_836_000, 'plan', 1_836_000, 1_836_000, null]);
  eq('  break-even is what they cost after the broker fee and sales tax, as Orders works it out: 1,708,000', pat.breakEven, 1_708_000);
  eq('  its profit after fees on the 11: +1.35 M', Math.round(pat.profit), Math.round(11 * (1_836_000 * keep - inf.unitCost)));
  const patSaid = planListSaid(pat, true);
  eq('  said: the plan’s price, and List patiently today beside it', [patSaid.from, patSaid.other, patSaid.moved, patSaid.floor],
    ['The plan’s price: list it and leave it', 'List patiently today: 1,836,000 ISK', null, null]);
  // At the front: today's listing price, floored at break-even.
  const front = planListPrice(inf.item, false, inf.units, inf.unitCost, r, market(INF));
  eq('at the front: today’s listing price, 1,608,000, is under break-even, so it lists at 1,708,000; the plan’s price beside it',
    [front.today, front.price, front.from, front.other], [1_608_000, 1_708_000, 'breakEven', 1_836_000]);
  eq('  and the market has moved down 12.4% from the plan', [front.moved?.dir, Math.round(front.moved.by * 1000) / 1000], ['down', -0.124]);
  const frontSaid = planListSaid(front, false);
  eq('  said: the floor, and the move', [frontSaid.floor, frontSaid.moved],
    ['Today’s listing price, 1,608,000 ISK, sells under what they cost after fees, so it lists at break-even, 1,708,000 ISK.', 'The market has moved down since the plan: today’s listing price, 1,608,000 ISK, is 12.4% under the plan’s 1,836,000 ISK.']);
  const under = planListPrice({ sellAt: 1_700_000 }, true, 11, inf.unitCost, r, market(INF));
  eq('a plan whose price sells under cost lists at break-even, never below', [under.price, under.from, planListSaid(under, true).floor],
    [1_708_000, 'breakEven', 'The plan’s 1,700,000 ISK sells under what they cost after fees, so it lists at break-even, 1,708,000 ISK.']);
  // Clone Soldier: the 2 October plan (Place and leave) holds it, the newer of two plans on its one position.
  const cs = rows.find((x) => x.item.typeId === CS);
  const csPat = planListPrice(cs.item, true, cs.units, cs.unitCost, r, market(CS));
  eq('Clone Soldier under the 2 October plan: 33,400,000, List patiently 31,490,000 today, moved down 5.7%',
    [csPat.price, csPat.today, csPat.moved?.dir, Math.round(csPat.moved.by * 1000) / 1000], [33_400_000, 31_490_000, 'down', -0.057]);
  eq('  said in a sentence, no new verdict', planListSaid(csPat, true).moved, 'The market has moved down since the plan: List patiently is 31,490,000 ISK today, 5.7% under the plan’s 33,400,000 ISK.');
  eq('  today’s figure makes +1.0%', Math.round((31_490_000 * keep / cs.unitCost - 1) * 1000) / 1000, 0.01);
  // Under the 30 September plan alone (at the front): today's listing price, over break-even, copied; within 5% of the plan's.
  const only30 = planListRows(ledger({ plans: [fx.plan30] }), S);
  const cs30 = only30.find((x) => x.item.typeId === CS);
  const csFront = planListPrice(cs30.item, false, cs30.units, cs30.unitCost, r, market(CS));
  eq('Clone Soldier under the 30 September plan alone: at the front, 31,890,000 over break-even 31,180,000, the plan’s 33,430,000 beside it, not moved',
    [only30.length, csFront.price, csFront.from, csFront.breakEven, csFront.other, csFront.moved], [1, 31_890_000, 'front', 31_180_000, 33_430_000, null]);
  // Nothing not known reads as zero.
  const noBook = planListPrice(inf.item, false, 11, inf.unitCost, r, null);
  eq('at the front with no book: no price, said so', [noBook.price, noBook.from, planListSaid(noBook, false).from], [null, null, 'Its Jita book couldn’t be read, so there’s no price at the front yet']);
  const noHighs = planListPrice(inf.item, true, 11, inf.unitCost, r, { ...market(INF), highs: null });
  eq('Place and leave with no history: the plan’s price, and no List patiently figure, said so', [noHighs.price, noHighs.today, planListSaid(noHighs, true).other],
    [1_836_000, null, 'No history to say where trading gets up to today']);
  eq('your own orders aren’t the market: a listing of yours under the front isn’t undercut',
    listMarket([{ id: 1, isBuy: false, price: 1_500_000, volume: 11 }, { id: 2, isBuy: false, price: 1_609_000, volume: 3 }, { id: 3, isBuy: true, price: 1_492_000, volume: 5 }], [1], null),
    { bestSell: 1_609_000, bestBuy: 1_492_000, highs: null });

  // What's on a sell order isn't to list; what the hangar doesn't hold can't be.
  const sell = (id, remain, total, placed, state = 'open', price = 1_836_000) => ({ orderId: id, typeId: INF, isBuy: false, price, volumeTotal: total, volumeRemain: remain, issued: placed, state, locationId: JITA, seen: [{ issued: placed, price, remain: total }] });
  const withOrders = (...os) => ledger({ orders: { ...byId(fx.orders, 'orderId'), ...byId(os, 'orderId') } });
  const rowOf = (dd, t = INF) => planListRow(fx.plan2, fx.plan2.items.find((i) => i.typeId === t), dd, S);
  eq('11 listed since the plan: nothing to list; 5 listed: 6', [rowOf(withOrders(sell(1, 11, 11, '2026-10-02T17:00:00Z'))).units, rowOf(withOrders(sell(1, 5, 5, '2026-10-02T17:00:00Z'))).units], [0, 6]);
  eq('  a listing in Amarr isn’t one in Jita', rowOf(withOrders({ ...sell(1, 11, 11, '2026-10-02T17:00:00Z'), locationId: 60008494 })).units, 11);
  eq('  the hangar holding 4: 4; not read yet: the 11 the trades say', [rowOf(ledger({ stock: { at: fx.now, jita: { [INF]: 4 }, total: {}, inContainers: 0 } })).units, rowOf(ledger({ stock: null })).units], [4, 11]);
  eq('unitsToList: the plan’s stock, no more than the whole position holds unlisted or the hangar holds',
    [unitsToList({ stock: 11, whole: 11, listed: 0, hangar: null }), unitsToList({ stock: 188, whole: 2816, listed: 0, hangar: 2816 }), unitsToList({ stock: 188, whole: 2816, listed: 2700, hangar: 116 }), unitsToList({ stock: 5, whole: 3, listed: 4, hangar: 9 })],
    [11, 188, 116, 0]);
  // Listed, then it sells: the order leaves the open ones before its trade arrives (ESI holds trades an hour). Units filled
  // on a listing since the position opened that no sale yet records still count as listed, so the item doesn't come back.
  const filled = withOrders(sell(1, 0, 11, '2026-10-02T17:00:00Z', 'expired'));
  eq('listed at 1,836,000 and filled, its trade not in yet: still nothing to list, even with the hangar read before the listing',
    [rowOf(filled).listed.units, rowOf(filled).listed.open, rowOf(filled).units], [11, 0, 0]);
  const soldTx = { id: 's1', source: 'esi', typeId: INF, date: '2026-10-02T17:30:00Z', isBuy: false, qty: 11, unitPrice: 1_836_000, locationId: JITA };
  const sold = ledger({ orders: { ...byId(fx.orders, 'orderId'), 1: sell(1, 0, 11, '2026-10-02T17:00:00Z', 'expired') }, txs: { ...byId(fx.txs, 'id'), s1: soldTx } });
  eq('  the trade arrives: the plan holds none, nothing filled is left unrecorded', [rowOf(sold).stock, rowOf(sold).listed.units, rowOf(sold).units], [0, 0, 0]);
  const cancelled = withOrders(sell(1, 11, 11, '2026-10-02T17:00:00Z', 'cancelled'));
  eq('  a listing cancelled unfilled puts them back: 11 to list', rowOf(cancelled).units, 11);
  eq('listedSince: a sell order’s placement is its first version, not the issued time a price change moves',
    listedSince([sell(1, 1, 1, '2026-10-01T09:51:50Z'), { ...sell(2, 1, 1, '2026-10-01T09:51:50Z'), issued: '2026-10-02T16:49:18Z', seen: [{ issued: '2026-10-01T09:51:50Z', price: 1, remain: 1 }, { issued: '2026-10-02T16:49:18Z', price: 2, remain: 1 }] }], INF, '2026-10-02T15:36:31.972Z', []).units, 0);

  // The earlier stock of a shared position is never the plan's to list: Datacore - Rocket Science (see the section above).
  const RS = 20420, AT = '2026-10-02T15:36:31.972Z';
  const tx = (id, isBuy, qty, price, date) => ({ id, source: 'esi', typeId: RS, date, isBuy, qty, unitPrice: price, locationId: JITA });
  const rsPos = { id: 'rs', typeId: RS, openedAt: '2026-09-24T22:26:26.502Z', status: 'open', jitaOnly: true, excluded: [], included: [] };
  const rsItem = { typeId: RS, buyAt: 85_540, units: 188, sellAt: 94_430, positionId: 'rs' };
  const rsPlan = { id: 'rsplan', name: 'rs', at: AT, isk: 0, horizonDays: 0.5, patient: true, items: [rsItem] };
  const rsSell = (remain) => ({ orderId: 7434267823, typeId: RS, isBuy: false, price: 96_980, volumeTotal: 4924, volumeRemain: remain, issued: '2026-10-02T15:19:38Z', state: 'open', locationId: JITA, seen: [{ issued: '2026-10-01T10:58:01Z', price: 97_480, remain: 4924 }] });
  const rsBuy = (remain) => ({ orderId: 7435100906, typeId: RS, isBuy: true, price: 85_540, volumeTotal: 188, volumeRemain: remain, issued: '2026-10-02T15:48:23Z', state: remain ? 'open' : 'expired', locationId: JITA });
  const rsBefore = { b1: tx('b1', true, 12_000, 80_720, '2026-09-24T22:31:46Z'), s1: tx('s1', false, 7076, 92_370, '2026-09-28T12:00:00Z'), s2: tx('s2', false, 276, 97_480, '2026-10-01T12:50:51Z'), s3: tx('s3', false, 20, 97_190, '2026-10-02T14:04:33Z'), s4: tx('s4', false, 2000, 96_980, '2026-10-02T15:20:15Z') };
  const rsLedger = (txs, orders, jita) => ({ txs, orders, journal: {}, meta: {}, positions: [rsPos], plans: [rsPlan], stock: jita == null ? null : { at: AT, jita: { [RS]: jita }, total: {}, inContainers: 0 } });
  eq('Rocket Science, the plan’s bid not filled: 2,628 held from before, on their sell order, none of it the plan’s to list',
    planListRow(rsPlan, rsItem, rsLedger(rsBefore, { 1: rsSell(2628), 2: rsBuy(188) }, 0), S).units, 0);
  const rsMid = { ...rsBefore, p1: tx('p1', true, 188, 85_540, '2026-10-02T18:00:00Z'), s5: tx('s5', false, 2000, 96_980, '2026-10-02T19:00:00Z') };
  eq('  its 188 filled, 628 of the earlier stock still listed: the 188 to list', planListRow(rsPlan, rsItem, rsLedger(rsMid, { 1: rsSell(628), 2: rsBuy(0) }, 188), S).units, 188);
  eq('  the earlier stock in the hangar, unlisted, beside the plan’s 188: still 188, never 816', planListRow(rsPlan, rsItem, rsLedger(rsMid, { 2: rsBuy(0) }, 816), S).units, 188);
  // Break-even is the plan's units' own (the review, 2 October 2026): the position page said the list step lists at a break-even
  // worked out on the whole position's average, 628 earlier units at 80,720 in it, where the list step uses the plan's 188.
  const rsRow = planListRow(rsPlan, rsItem, rsLedger(rsMid, { 1: rsSell(628), 2: rsBuy(0) }, 188), S);
  eq('  the plan’s units cost 85,540 and the bid’s fee; break-even on them 90,810, not the whole position’s 84,990',
    [Math.round(rsRow.unitCost), planListPrice(rsItem, true, rsRow.units, rsRow.unitCost, r, null).breakEven, planListPrice(rsItem, true, 1, rsRow.view.whole.avgCost, r, null).breakEven],
    [Math.round(85_540 * (1 + r.f)), 90_810, 84_990]);

  // On To do: one item per plan item, keyed by plan and item; Place and leave's versioned by its price, which opening copies.
  const item = planListItem({ planId: fx.plan2.id, planName: fx.plan2.name, patient: true, typeId: INF, units: 11, unitCost: inf.unitCost }, pat, 'Imperial Navy Infiltrator');
  eq('To do: a “List what the plan bought” item, something to do, keyed by plan and item, versioned by the price, copying it',
    [item.key, item.ver, item.kind, KIND_LABEL[item.kind], needs(item.kind), item.action.copy, item.action.typeId, item.title],
    [`planList:${fx.plan2.id}:${INF}`, '1836000', 'planList', 'List what the plan bought', 'act', 1_836_000, INF, 'List 11 × Imperial Navy Infiltrator at 1,836,000 ISK']);
  has('  its detail says the plan’s price and today’s beside it', item.detail, 'List patiently today: 1,836,000 ISK');
  eq('  a fill of more units keeps the version: a hand tick holds', planListItem({ planId: fx.plan2.id, planName: '', patient: true, typeId: INF, units: 6, unitCost: inf.unitCost }, pat, 'x').ver, item.ver);
  const nob = planListItem({ planId: fx.plan30.id, planName: fx.plan30.name, patient: false, typeId: INF, units: 11, unitCost: inf.unitCost }, noBook, 'Imperial Navy Infiltrator');
  eq('  at the front with no book: no price copied', [nob.action.copy, nob.title], [undefined, 'List 11 × Imperial Navy Infiltrator']);
  // At the front the price moves with the book, up to every five minutes, so a version by price would reopen a hand tick each
  // time (the review, 2 October 2026): it's versioned by the units to list instead, and the price copied is the build's.
  const frontItem = planListItem({ planId: fx.plan30.id, planName: fx.plan30.name, patient: false, typeId: INF, units: 11, unitCost: inf.unitCost }, front, 'Imperial Navy Infiltrator');
  const frontMoved = planListItem({ planId: fx.plan30.id, planName: fx.plan30.name, patient: false, typeId: INF, units: 11, unitCost: inf.unitCost }, { ...front, price: 1_750_000 }, 'Imperial Navy Infiltrator');
  eq('  at the front: versioned by the 11 to list, not the price; the price copied is today’s',
    [frontItem.ver, frontMoved.ver, nob.ver, frontItem.action.copy, frontMoved.action.copy], ['units:11', 'units:11', 'units:11', 1_708_000, 1_750_000]);
  const reading = planListItem({ planId: fx.plan30.id, planName: fx.plan30.name, patient: false, typeId: INF, units: 11, unitCost: inf.unitCost, reading: true }, noBook, 'Imperial Navy Infiltrator');
  eq('  while its book is first read, it says so rather than that it couldn’t be read', [reading.ver, reading.detail.includes('Reading'), reading.detail.includes('couldn’t be read')], ['units:11', true, false]);
  // It ticks off only on the ledger showing it listed or sold, never because it's absent.
  const e = { item, seenAt: NOW, lastAt: NOW };
  const judged = (dd) => { const row = rowOf(dd); return judgePlanList(e, { holds: true, row, hangarAt: dd.stock ? Date.parse(dd.stock.at) : null }); };
  eq('ticked off: listed (a sell order since the plan covers it), sold from that listing, then the trade',
    [judged(withOrders(sell(1, 11, 11, '2026-10-02T17:00:00Z'))), judged(filled), judged(sold)],
    ['Listed: 11 at 1,836,000 ISK.', 'Listed at 1,836,000 ISK and sold: the sale shows in your trades within the hour.', 'Sold: the plan holds none of what it bought.']);
  eq('  the hangar read that showed it reading none, no listing or sale shown: still being checked', judged(ledger({ stock: { at: fx.now, jita: {}, total: {}, inContainers: 0 } })), null);
  // Moved, used or fitted, it never shows as listed or sold: a newer hangar read holding none closes it, saying so (the review).
  const later = new Date(NOW + 3600_000).toISOString();
  eq('  a newer hangar read holding none, no listing or sale: closed, saying what the hangar shows',
    judged(ledger({ stock: { at: later, jita: {}, total: {}, inContainers: 0 } })), 'No longer in your Jita hangar (read 2 Oct, 21:31 ET): moved, used or listed since.');
  eq('  but a newer read still holding them leaves it to list', rowOf(ledger({ stock: { at: later, jita: { [INF]: 11 }, total: {}, inContainers: 0 } })).units, 11);
  eq('  the plan removed, its position closed or a newer plan holding it: it just goes', judgePlanList(e, { holds: false, row: null }), false);
}

console.log('\n--- the mining ledger ---');
{
  const { readMining, miningKey, miningTicks, miningSnapshot, miningSessions } = await import('../src/lib/mining.ts');
  const raw = [{ date: '2026-09-29', solar_system_id: 30000142, type_id: 1228, quantity: 12000 }, { date: '2026-09-29', solar_system_id: 30000142, type_id: 1230, quantity: 0 }];
  const recs = readMining(raw, 95210486);
  eq('ledger rows become records, keyed by the character that mined', [recs.length, miningKey(recs[0])], [1, '95210486:2026-09-29:30000142:1228']);
  const T = Date.parse('2026-09-29T19:00:00Z'), M = 60_000;
  eq('the first read is only a baseline', miningTicks(null, recs, T), []);
  const later = [{ ...recs[0], qty: 15500 }, { charId: 95210486, date: '2026-09-29', systemId: 30000142, typeId: 17463, qty: 800 }];
  eq('then what grew since, a new ore included', miningTicks(miningSnapshot(recs), later, T + 10 * M).map((t) => [t.typeId, t.qty]), [[1228, 3500], [17463, 800]]);
  eq('  a row that shrank says nothing', miningTicks({ [miningKey(recs[0])]: 20000 }, recs, T), []);
  const tick = (min, typeId, qty) => ({ at: T + min * M, systemId: 30000142, typeId, qty });
  const s = miningSessions([tick(0, 1228, 3000), tick(10, 1228, 3100), tick(20, 17463, 900), tick(80, 1228, 2000), tick(90, 1228, 2500)]);
  eq('ticks within 25 minutes of each other are one session; an hour apart, two', s.map((x) => [(x.end - x.start) / M, x.byType]), [[30, { 1228: 6100, 17463: 900 }], [20, { 1228: 4500 }]]);

  const sh = miningSessions([{ ...tick(0, 1228, 3000), shipTypeId: 17478 }, { ...tick(10, 1228, 3100), shipTypeId: 17478 }, { ...tick(20, 1228, 500), shipTypeId: 32880 }, tick(90, 1228, 100)]);
  eq('a session knows its ship: the one most was mined in; none when the cloud couldn’t read it', sh.map((x) => x.ship), [17478, null]);
  const { bestWay, byDay, byOre, sessionStats, median, paybackHours } = await import('../src/lib/mining.ts');
  eq('an ore is valued the best of three ways', [bestWay({ raw: 10, compressed: 11.5, reprocessed: 9 }), bestWay({ raw: null, compressed: null, reprocessed: null })], [{ way: 'compressed', perUnit: 11.5 }, null]);
  const vol = (t) => (t === 1228 ? 0.15 : 0.15), worth = (t) => (t === 1228 ? 12 : 13);
  const days = byDay([...recs, { ...recs[0], date: '2026-09-27', qty: 1000 }], 3, '2026-09-29', vol, worth);
  eq('by day: the last days, oldest first, a quiet day at zero', days.map((d) => [d.date, d.units, Math.round(d.isk)]), [['2026-09-27', 1000, 12000], ['2026-09-28', 0, 0], ['2026-09-29', 12000, 144000]]);
  eq('by ore: worth first, with its systems and days', byOre([...recs, { ...recs[0], date: '2026-09-27', qty: 1000, systemId: 30000144 }], vol, worth).map((o) => [o.typeId, o.units, o.systems.length, o.days]), [[1228, 13000, 2, 2]]);
  const st = sessionStats(s[0], vol, worth);
  eq('a session’s pace: m³ a minute and ISK an hour', [Math.round(st.minutes), Math.round(st.m3PerMin), Math.round(st.iskPerHour)], [30, 35, 169800]);
  eq('median', [median([3, 1, 2]), median([4, 1, 2, 3]), median([])], [2, 2.5, null]);
  eq('payback: a step’s cost over what it adds an hour', Math.round(paybackHours(60e6, 250, 840, 100)), 17);
  eq('  nothing when it adds nothing', paybackHours(60e6, 840, 840, 100), null);
}

console.log('\n--- mining yields, from dogma ---');
{
  const { fitYield } = await import('../src/lib/miningYield.ts');
  const near = (label, got, want, tol) => {
    const g = [got].flat(), w = [want].flat();
    const ok = g.length === w.length && g.every((x, i) => (typeof x === 'number' ? Math.abs(x - w[i]) <= Math.max(tol, 1e-9) : x === w[i]));
    if (!ok) { failed++; console.log(`  FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  };
  // ESI's own figures (29 September 2026), cut to what the yield reads.
  const T = (id, group, attrs, effects = []) => ({ id, group, attrs, effects });
  const skillDogma = { 3386: T(3386, 1218, { 434: 5 }), 3410: T(3410, 1218, { 434: 5 }), 16281: T(16281, 1218, { 780: -5 }) };
  const venture = T(32880, 1283, { 207: 2, 1842: 5 }, [5058, 5139]);
  const vci = T(89648, 1283, { 207: 2, 1842: 5, 6048: 50 }, [5058, 5139, 12753]);
  const prospect = T(33697, 1283, { 207: 2, 1842: 5, 3191: 5, 3177: 100 }, [5139, 5852, 8223]);
  const hulk = T(22544, 543, { 3181: 3, 3197: 6, 3230: -15, 3193: -3, 3178: -30, 3182: -3, 3194: -4 }, [8227, 8249, 8305, 8243, 8224, 8228, 8244]);
  const minerI = T(483, 54, { 77: 10, 73: 15000, 182: 3386, 5967: 0.01, 5969: 2, 3154: 0, 3153: 0 });
  const msm2 = T(17912, 483, { 77: 120, 73: 45000, 182: 3386, 604: 482, 5967: 0.01, 5969: 2, 3154: 34, 3153: 1 });
  const iceH2 = T(22229, 464, { 77: 1000, 73: 200000, 182: 16281, 5967: 0.01, 5969: 2, 3154: 34, 3153: 1 });
  const simpleA2 = T(60281, 482, { 782: 1.8, 3161: 1, 3160: 3.6, 3159: 0 });
  const simpleB2 = T(60283, 482, { 782: 1.8, 3161: 0.8, 3160: 30, 3159: 0 });
  const simpleC2 = T(60284, 482, { 782: 0.2, 3161: 1, 3160: 59, 3159: 28 });
  const mlu2 = T(28576, 546, { 434: 9 }, [1882]), iceUp2 = T(28578, 546, { 780: -9 }, [2479]);
  const all5 = { 3386: 5, 3410: 5, 16281: 5, 32918: 5, 33856: 5, 17940: 5, 22551: 5 };
  const v = fitYield(venture, minerI, 2, null, [], all5, skillDogma);
  eq('a Venture at all V: 10 m³ × 2 (the hull) × 1.25 (Mining Frigate) × 1.25 × 1.25 (Mining, Astrogeology) a laser each 15 s', [v.perCycle, v.cycle], [39.0625, 15]);
  eq('  two lasers, and crits add 1% × 200%: 318.75 m³ a minute', v.m3PerMin, 312.5 * 1.02);
  eq('  a Miner I leaves no residue', [v.residueChance, v.residuePerMin], [0, 0]);
  eq('untrained, the skills add nothing and the hull only its ×2', fitYield(venture, minerI, 2, null, [], {}, skillDogma).perCycle, 20);
  eq('the Consortium Issue crits half as often again', fitYield(vci, minerI, 2, null, [], all5, skillDogma).critChance, 0.015);
  eq('the Prospect has no ×2 (its dogma carries the number but no effect uses it); its role +100% does', fitYield(prospect, minerI, 1, null, [], all5, skillDogma).perCycle, 10 * 1.25 * 1.25 * 2 * 1.25 * 1.25);
  const h = fitYield(hulk, msm2, 2, simpleA2, [mlu2, mlu2, mlu2], all5, skillDogma);
  near('a Hulk at all V with Type A II and three MLU II: 120 × 1.8 × 1.15 × 1.3 × 1.25² × 1.09³ a laser', h.perCycle, 120 * 1.8 * 1.15 * 1.3 * 1.5625 * 1.09 ** 3, 1e-9);
  near('  every 45 s × 0.85 (role) × 0.85 (Exhumers V)', h.cycle, 45 * 0.85 * 0.85, 1e-9);
  eq('  about 2,460 m³ a minute, boosts left out', Math.round(h.m3PerMin), 2460);
  near('  residue: 34% + 3.6%, at the volume mined', h.residueChance, 0.376, 1e-9);
  const b = fitYield(hulk, msm2, 2, simpleB2, [mlu2, mlu2, mlu2], all5, skillDogma);
  near('Type B: the same per cycle, cycles 20% shorter, residue 34% + 30%', [b.perCycle / h.perCycle, b.cycle / h.cycle, b.residueChance].map((x) => Math.round(x * 1000) / 1000), [1, 0.8, 0.64], 0);
  const c = fitYield(hulk, msm2, 2, simpleC2, [], all5, skillDogma);
  eq('Type C clears a rock: a fifth of the yield, 93% residue at 29× the volume', [c.perCycle / fitYield(hulk, msm2, 2, null, [], all5, skillDogma).perCycle, c.residueChance, Math.round(c.residuePerMin / c.m3PerMin)], [0.2, 0.93, 26]);
  eq('a crystal in a laser that takes none does nothing', fitYield(venture, minerI, 2, simpleA2, [], all5, skillDogma).perCycle, 39.0625);
  const ice = fitYield(hulk, iceH2, 2, null, [iceUp2], all5, skillDogma);
  near('ice: a block a cycle, the cycle cut by the hull (−30%, −15%, −20%), Ice Harvesting (−25%) and the upgrade (−9%)', [ice.kind, ice.perCycle, ice.cycle], ['ice', 1000, 200 * 0.7 * 0.85 * 0.8 * 0.75 * 0.91], 1e-9);
  eq('  and Mining Laser Upgrades don’t touch ice', fitYield(hulk, iceH2, 2, null, [mlu2], all5, skillDogma).cycle, 200 * 0.7 * 0.85 * 0.8 * 0.75);
  const droneRig = T(32043, 778, { 434: 10, 293: -10 }, [623, 2713, 6763]), mercRig = T(32817, 1232, { 434: 16 }, [5069]);
  eq('a bonus counts only through an effect that reaches lasers: drone and Mercoxit rigs carry 434 too', fitYield(hulk, msm2, 2, null, [droneRig, mercRig], all5, skillDogma).perCycle, fitYield(hulk, msm2, 2, null, [], all5, skillDogma).perCycle);
  const mdcsm2 = T(24305, 483, { 77: 80, 73: 45000, 182: 3386, 183: 11395, 604: 663, 605: 482, 5967: 0.01, 5969: 2, 3154: 34, 3153: 1 });
  const mercA2 = T(18608, 663, { 782: 1.8, 3161: 1, 3160: 3.6, 3159: 0 });
  near('  but the Mercoxit rig reaches deep-core lasers: +16%', fitYield(hulk, mdcsm2, 2, mercA2, [mercRig], all5, skillDogma).perCycle / fitYield(hulk, mdcsm2, 2, mercA2, [], all5, skillDogma).perCycle, 1.16, 1e-12);
  near('a Hulk on Mercoxit at all V, two deep-core strip miners on Type A II, three MLU II: 80 × 1.8 × … a laser', fitYield(hulk, mdcsm2, 2, mercA2, [mlu2, mlu2, mlu2], all5, skillDogma).perCycle, 80 * 1.8 * 1.15 * 1.3 * 1.5625 * 1.09 ** 3, 1e-9);
  // Catalyst's crits: Mining Precision 90727 (6049 = 10 a level), Mining Exploitation 90728 (6050 = 5 a level), chipsets.
  const crits = { ...skillDogma, 90727: T(90727, 1218, { 6049: 10 }), 90728: T(90728, 1218, { 6050: 5 }) };
  const chip2 = T(2333, 49, { 6049: 20, 6050: 20, 6053: -20 }, [12759, 12760, 12761]);
  const hc = fitYield(hulk, msm2, 2, simpleB2, [mlu2, mlu2, mlu2, chip2], { ...all5, 90727: 5, 90728: 5 }, crits);
  near('crits: 1% × 1.5 (Precision V) × 1.2 (Chipset II), each 200% × 1.25 (Exploitation V) × 1.2', [hc.critChance, hc.critShare], [0.018, 0.018 * 3], 1e-12);
  near('residue: a chipset cuts the chance by its %, after the crystal’s added points: (34 + 30) × 0.8', hc.residueChance, 0.512, 1e-12);
  const pers = T(91174, 1283, { 6062: 100, 5820: 10, 5821: 5 }, [12771, 12772, 12773]);
  const iceL2 = T(37451, 54, { 77: 1000, 73: 300000, 182: 16281, 5967: 0.01, 5969: 2, 3154: 34, 3153: 1 });
  near('the Perseverance crits on ice: ×2 (role) × 1.5 (Mining Destroyer V), each ×1.25 bigger', [fitYield(pers, iceL2, 3, null, [], { ...all5, 89241: 5 }, crits).critChance, fitYield(pers, iceL2, 3, null, [], { ...all5, 89241: 5 }, crits).critShare], [0.03, 0.03 * 2.5], 1e-12);
}

console.log('\n--- hauling holds, from dogma ---');
{
  const { holdsFor, generalSpace, structureFor } = await import('../src/lib/cargo.ts');
  const near = (label, got, want, tol) => {
    const g = [got].flat(), w = [want].flat();
    if (!(g.length === w.length && g.every((x, i) => Math.abs(x - w[i]) <= tol))) { failed++; console.log(`  FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  };
  const T = (id, attrs, effects = []) => ({ id, group: 0, attrs, effects });
  // ESI's figures (30 September 2026), cut to what the holds read.
  const iteron = T(657, { 38: 5800, 496: 5, 9: 970 }, [726, 729]);
  const ech2 = T(1319, { 149: 1.275, 150: 0.77 }, [59, 3046, 3047]);
  const rig = T(31119, { 614: 15 }, [836, 2712]);
  const bulk = T(1335, { 149: 0.89, 150: 1.25 }, [59, 60, 657]);
  eq('an Iteron Mark V: 5,800 × 1.25 at Gallente Hauler V', holdsFor(iteron, [], { 3340: 5 }).cargo, 7250);
  near('  five Expanded Cargohold IIs (×1.275 each, no stacking penalty) and three cargo rigs (+15% each)', holdsFor(iteron, [ech2, ech2, ech2, ech2, ech2, rig, rig, rig], { 3340: 5 }).cargo, 7250 * 1.275 ** 5 * 1.15 ** 3, 1e-6);
  near('  its structure: 970 × 0.77 an expander, × 1.25 a bulkhead', [structureFor(iteron, [ech2, ech2]), structureFor(iteron, [bulk])], [970 * 0.77 * 0.77, 970 * 1.25], 1e-9);
  const charon = T(20185, { 38: 465000, 888: 5, 889: 5 }, [1615, 1669, 1673, 5901]);
  eq('a Charon at Caldari Freighter V holds 581,250: its only cargo bonus is the racial Freighter one (C1 moves velocity; Advanced Spaceship Command, agility)', holdsFor(charon, [], { 20526: 5, 20342: 5 }).cargo, 581250);
  const bustard = T(12731, { 38: 5000, 912: 50000, 807: 5 }, [730, 5874]);
  eq('a Bustard: Transport Ships V grows the fleet hangar, not the cargo; a package can use both', ((h) => [h.cargo, h.fleet, generalSpace(h)])(holdsFor(bustard, [], { 19719: 5 })), [5000, 62500, 67500]);
  const orca = T(28606, { 38: 30000, 912: 40000, 1556: 150000, 3211: 5, 3212: 5 }, [8278, 8279]);
  eq('an Orca at Industrial Command Ships V: cargo and ore hold grow, the fleet hangar doesn’t', ((h) => [h.cargo, h.fleet, h.ore, generalSpace(h)])(holdsFor(orca, [], { 29637: 5 })), [37500, 40000, 187500, 77500]);
  const epithal = T(655, { 38: 550, 1653: 45000, 1646: 6000, 813: 10 }, [729, 5478]);
  const trans = { id: 33900, group: 773, attrs: { 327: 25, 1138: -10 }, effects: [392, 5868] };
  eq('a Transverse Bulkhead rig costs 10% cargo, 5% at Armor Rigging V', [holdsFor(orca, [trans], { 29637: 5 }).cargo, holdsFor(orca, [trans], { 29637: 5, 26253: 5 }).cargo], [37500 * 0.9, 37500 * 0.95]);
  eq('  and never touches the fleet hangar', holdsFor(orca, [trans, trans, trans], { 29637: 5 }).fleet, 40000);
  const { bareEhp } = await import('../src/lib/cargo.ts');
  // The Badger's HP and resonances from ESI; the research's no-skill uniform EHP for it was 6,172.
  const badger = T(648, { 263: 1440, 265: 750, 9: 2060, 271: 1, 272: 0.5, 273: 0.6, 274: 0.8, 267: 0.5, 268: 0.9, 269: 0.75, 270: 0.55, 113: 0.67, 111: 0.67, 109: 0.67, 110: 0.67 });
  eq('a bare hull’s EHP against even damage: each layer over its mean resonance (the Badger: about 6,172)', Math.round(bareEhp(badger)), 6172);
  eq('an Epithal: +10% a level to the planetary hold only; expanders never reach a specialised hold', ((h) => [h.cargo, h.pi, h.commandCenter])(holdsFor(epithal, [ech2], { 3340: 5 })), [550 * 1.275, 67500, 6000]);
  // Mining hulls' ore holds (ESI, 30 September 2026): Mining Barge +5% a level (effect 5067, 3187) on the Retriever and
  // Mackinaw, Exhumers +2.5% a level (8251, 3198) on the Mackinaw.
  const retriever = { id: 17478, group: 463, attrs: { 1556: 27500, 3187: 5 }, effects: [5067] };
  const mackinaw = { id: 22548, group: 543, attrs: { 1556: 31500, 3187: 5, 3198: 2.5 }, effects: [5067, 8251] };
  eq('ore holds: a Retriever at Mining Barge V holds 34,375 m³, a Mackinaw at both V 44,297', [holdsFor(retriever, [], { 17940: 5 }).ore, Math.round(holdsFor(mackinaw, [], { 17940: 5, 22551: 5 }).ore)], [34375, 44297]);
  const { fitCpu } = await import('../src/lib/fitCpu.ts');
  // A Hulk's Solid fit on Mercoxit, from ESI's dogma (30 September 2026): two deep-core strip miners (60 CPU, needing Mining),
  // three Mining Laser Upgrade IIs (40 CPU, a 12.5% penalty on the lasers, needing Mining Upgrades), two Multispectrum
  // Shield Hardener IIs (44), a Mining Survey Chipset II (12), a Medium Shield Extender II (35).
  const cpuHull = { id: 22544, group: 543, attrs: { 48: 310 }, effects: [] };
  const laserD = { id: 24305, group: 483, attrs: { 50: 60, 182: 3386 }, effects: [] };
  const mluD = { id: 28576, group: 546, attrs: { 50: 40, 1082: 12.5, 182: 22578 }, effects: [] };
  const mods = [laserD, laserD, mluD, mluD, mluD, { attrs: { 50: 44 } }, { attrs: { 50: 44 } }, { attrs: { 50: 12 } }, { attrs: { 50: 35 } }].map((x) => ({ id: 0, group: 0, effects: [], ...x }));
  const procII = { id: 4399, group: 781, attrs: { 424: 9.6 }, effects: [] }, procI = { id: 4395, group: 781, attrs: { 424: 7.1 }, effects: [] };
  const sk = { 3426: { attrs: { 424: 5 } }, 22578: { attrs: { 927: -5 } } };
  const five = { 3426: 5, 22578: 5 };
  near('CPU: the lasers carry every upgrade’s penalty, cut by Mining Upgrades (120 × 1.09375³ + 3 × 40 + 135 = 412)', fitCpu(cpuHull, mods, [], five, sk).need, 412.0, 0.1);
  eq('  what the hull has at CPU Management V: none, a Tech I processor rig, a Tech II (387.5, 415.0, 424.7)', [fitCpu(cpuHull, mods, [], five, sk).output, fitCpu(cpuHull, mods, [procI], five, sk).output, fitCpu(cpuHull, mods, [procII], five, sk).output].map((x) => +x.toFixed(1)), [387.5, 415, 424.7]);
  eq('  so the Solid Hulk can’t lose its processor rig, but can step it down to Tech I', [fitCpu(cpuHull, mods, [], five, sk).need <= 387.5, fitCpu(cpuHull, mods, [procI], five, sk).need <= fitCpu(cpuHull, mods, [procI], five, sk).output], [false, true]);
}

console.log('\n--- hauling fits ---');
{
  const { HAUL_FITS } = await import('../src/lib/haulFits.ts');
  const { HAUL_HULLS } = await import('../src/lib/haulTree.ts');
  // Each hull's high, mid, low and rig slots (ESI, 30 September 2026).
  const SLOTS = {"648":[2,6,4,3],"649":[2,5,4,3],"650":[2,5,5,3],"651":[3,4,3,3],"652":[2,4,5,3],"653":[2,5,5,3],"654":[2,4,4,3],"655":[2,4,4,3],"656":[2,4,4,3],"657":[2,4,5,3],"1944":[2,3,6,3],"2863":[0,0,4,0],"12729":[2,4,2,2],"12731":[2,6,3,2],"12733":[2,2,4,2],"12735":[2,3,3,2],"12743":[2,3,3,2],"12745":[2,3,6,2],"12747":[2,5,4,2],"12753":[2,2,7,2],"19744":[2,4,6,3],"20183":[0,0,3,0],"20185":[0,0,3,0],"20187":[0,0,3,0],"20189":[0,0,3,0],"28606":[6,5,2,3],"28844":[0,0,3,0],"28846":[0,0,3,0],"28848":[0,0,3,0],"28850":[0,0,3,0],"34328":[0,3,3,3],"42244":[4,4,2,3],"81008":[4,5,3,3],"81040":[6,3,3,0],"81046":[4,4,2,2],"81047":[4,6,3,2]};
  const n = (xs) => xs.reduce((t, x) => t + (x.qty ?? 1), 0);
  eq('no hauling fit uses more slots than its hull has', Object.entries(HAUL_FITS).flatMap(([id, fits]) => fits.filter((f) => { const s = SLOTS[id]; return !s || n(f.high) > s[0] || n(f.mid) > s[1] || n(f.low) > s[2] || n(f.rigs) > s[3]; }).map((f) => `${id}: ${f.purpose}`)), []);
  eq('every hull with fits is on the tree', Object.keys(HAUL_FITS).filter((id) => !HAUL_HULLS.some((h) => h.id === Number(id))), []);
}

console.log('\n--- ship trees ---');
{
  const { treeProblems, edgeShape } = await import('../src/lib/shipTree.ts');
  const mining = await import('../src/lib/miningTree.ts');
  const haul = await import('../src/lib/haulTree.ts');
  const abyss = await import('../src/lib/abyssShips.ts');
  eq('a path one row down bends across the whole gap between columns, as it always did', edgeShape({ col: 0, row: 0 }, { col: 1, row: 1 }), { x1: 0.5, y1: 0.5, x2: 1.5, y2: 1.5, m: 1, xa: 0.5, xb: 1.5 });
  eq('  three rows down it bends within a third of that, clear of the nodes beside it', ((e) => [e.xa, e.xb].map((x) => +x.toFixed(3)))(edgeShape({ col: 0, row: 3 }, { col: 1, row: 0 })), [0.833, 1.167]);
  eq('a path drawn straight through a node is caught', treeProblems([{ id: 1, col: 0, row: 0, lane: 'a', role: '' }, { id: 2, col: 1, row: 0, lane: 'a', role: '' }, { id: 3, col: 2, row: 0, lane: 'a', role: '' }], [[1, 3]]), ['path 1 → 3 runs behind 2']);
  eq('  and two nodes in one place, and a path to nowhere', treeProblems([{ id: 1, col: 0, row: 0, lane: 'a', role: '' }, { id: 2, col: 0, row: 0, lane: 'a', role: '' }], [[1, 9]]), ['1 and 2 both at 0,0', 'path 1 → 9 names a node that isn\'t there']);
  eq('the mining tree: no path runs behind a ship it doesn’t join', treeProblems(mining.HULLS, mining.EDGES), []);
  eq('the hauling tree likewise', treeProblems(haul.HAUL_HULLS, haul.HAUL_EDGES), []);
  eq('the Abyssal tree likewise', treeProblems(abyss.ABYSS_SHIPS, abyss.ABYSS_EDGES), []);
  eq('every Abyssal ship has its fits, and every fit its ship on the tree', [abyss.ABYSS_SHIPS.filter((s) => !abyss.ABYSS_TIERS[s.id]?.length).map((s) => s.name), Object.keys(abyss.ABYSS_TIERS).filter((id) => !abyss.ABYSS_SHIPS.some((s) => s.id === Number(id)))], [[], []]);
  eq('every Abyssal fit is an Abyss Tracker fit ID, each once', ((ids) => [ids.filter((x) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)), ids.length - new Set(ids).size])(Object.values(abyss.ABYSS_TIERS).flat().map((t) => t.id)), [[], 0]);
  // The notes were a paragraph each, which the user found "really hard to read or understand at a glance" (30 September
  // 2026): they're points now, and these keep them from growing back into paragraphs.
  const pts = abyss.ABYSS_SHIPS.flatMap((sh) => (sh.points ?? []).map((p) => ({ ship: sh.name, ...p })));
  eq('every Abyssal ship has points and no paragraph note', abyss.ABYSS_SHIPS.filter((sh) => !sh.points?.length || sh.note).map((sh) => sh.name), []);
  eq('  each point a line: 140 characters at most, a quote 180', pts.filter((p) => p.text.length > (p.kind === 'quote' ? 180 : 140)).map((p) => `${p.ship}: ${p.text.slice(0, 40)}…`), []);
  eq('  every research figure names its source and year: they aren’t live', abyss.ABYSS_SHIPS.flatMap((sh) => (sh.stats ?? []).filter((x) => !/\b20\d\d\b/.test(x.source)).map((x) => `${sh.name}: ${x.label}`)), []);
  eq('  and the hauling classes’ gank points stay a line each', Object.values(haul.GANK_BY_CLASS).flatMap((g) => g.points).filter((p) => p.text.length > 140).map((p) => p.text.slice(0, 40)), []);
  eq('  no straight quotes or apostrophes in them (the app writes ’ and “ ”)', pts.filter((p) => /['"]/.test(p.text + (p.lead ?? ''))).map((p) => p.ship), []);
  eq('the Abyssal tree fits its grid: seven tiers across, nine lines down', abyss.ABYSS_SHIPS.filter((s) => s.col < 0 || s.col > 6 || s.row < 0 || s.row > 8).map((s) => s.name), []);
}

console.log('\n--- EFT fits ---');
{
  const { parseEft, eftToTier } = await import('../src/lib/eft.ts');
  // A Cerberus fit as Abyss Tracker gave it (30 September 2026), the empty sections included.
  const eft = "[Cerberus, rezdrhgds]\nCaldari Navy Ballistic Control System\nCaldari Navy Ballistic Control System\nCaldari Navy Ballistic Control System\nAssault Damage Control II\n\nThukker Large Cap Battery\nPith X-Type Large Shield Booster\nFederation Navy Stasis Webifier\nFederation Navy Stasis Webifier\nCorelum C-Type 10MN Afterburner\n\nHeavy Assault Missile Launcher II, Scourge Rage Heavy Assault Missile\nHeavy Assault Missile Launcher II, Scourge Rage Heavy Assault Missile\n\nMedium Ancillary Current Router I\nMedium EM Shield Reinforcer II\n\n\nHornet I x3\n\n\nAgency 'Hardshell' TB3 Dose I\nSynth Blue Pill Booster\n\n\nCaldari Navy Scourge Heavy Assault Missile x3000\nRaging Dark Filament x4\n";
  const p = parseEft(eft);
  eq('EFT: a drone listed twice is one line, summed', eftToTier(parseEft('[Gila, x]\n\n\n\n\nInfiltrator II x2\nInfiltrator II x5\n'), () => 18, { key: 'solid', what: '', source: '' }).drones, [{ name: 'Infiltrator II', qty: 7 }]);
  eq('EFT: the hull and name, and each slot section in order, repeats counted', [p.hull, p.name, p.low.map((x) => [x.name, x.qty]), p.mid.length, p.rigs.map((x) => x.name)], ['Cerberus', 'rezdrhgds', [['Caldari Navy Ballistic Control System', 3], ['Assault Damage Control II', 1]], 4, ['Medium Ancillary Current Router I', 'Medium EM Shield Reinforcer II']]);
  eq('  a module’s loaded charge after its comma', p.high, [{ name: 'Heavy Assault Missile Launcher II', qty: 2, charge: 'Scourge Rage Heavy Assault Missile' }]);
  eq('  what follows the rigs, with its counts', p.rest, [{ name: 'Hornet I', qty: 3 }, { name: "Agency 'Hardshell' TB3 Dose I", qty: 1 }, { name: 'Synth Blue Pill Booster', qty: 1 }, { name: 'Caldari Navy Scourge Heavy Assault Missile', qty: 3000 }, { name: 'Raging Dark Filament', qty: 4 }]);
  const cats = { 'Hornet I': 18, "Agency 'Hardshell' TB3 Dose I": 20, 'Synth Blue Pill Booster': 20, 'Caldari Navy Scourge Heavy Assault Missile': 8, 'Raging Dark Filament': 17 };
  const t = eftToTier(p, (n) => cats[n] ?? null, { key: 'solid', what: '', source: '' });
  eq('  sorted by category: drones, boosters with the implants, the rest to the cargo', [t.drones, t.implants, t.cargo.map((x) => x.name)], [[{ name: 'Hornet I', qty: 3 }], ["Agency 'Hardshell' TB3 Dose I", 'Synth Blue Pill Booster'], ['Caldari Navy Scourge Heavy Assault Missile', 'Raging Dark Filament']]);
  eq('  empty slots and offline marks are dropped; no header is no fit', [parseEft('[Worm, x]\n[Empty Low slot]\nDamage Control II /OFFLINE').low, parseEft('Damage Control II')], [[{ name: 'Damage Control II', qty: 1 }], null]);
}

console.log('\n--- abyssal filaments ---');
{
  const { filamentFacts } = await import('../src/lib/abyssal.ts');
  // ESI's own text for Cataclysmic Gamma and Tranquil Electrical (30 September 2026), cut to what's read.
  const cat = 'This Abyssal Filament will pull a <b>Tech I or Tech II Cruiser</b> into a pocket of Abyssal Deadspace experiencing <b>cataclysmic local environmental destabilization</b>, and bathed in the radioactive afterglow of a gamma-ray burst that will <b>reduce explosive resistance</b> but <b>enhance ship shield strength</b>.\n\n<b><color=yellow>Restrictions:</color></b>  Cannot be activated in 1.0 or 0.9 systems. Capsuleer will be flagged as suspect if activated in 0.8, 0.7 or 0.6 systems. \n\n<b><color=yellow>Warning:</color></b> Abyssal Deadspace is a particularly harsh and unforgiving environment. ... After <b><color=yellow>20 minutes</color></b> catastrophic collapse';
  eq('a filament’s own text: its ships, the weather’s penalty and bonus, the timer, where it can’t open and where it flags you', filamentFacts(cat), { ships: 'Tech I or Tech II Cruiser', penalty: 'reduce explosive resistance', bonus: 'enhance ship shield strength', minutes: 20, cannotOpenIn: ['1.0', '0.9'], suspectIn: ['0.8', '0.7', '0.6'] });
  const calm = 'will pull a <b>Tech I or Tech II Cruiser</b> into a pocket ... that will <b>reduce EM resistance</b> but <b>enhance ship capacitor recharging</b>. <b><color=yellow>Restrictions:</color></b> Cannot be activated in 1.0 or 0.9 systems.';
  eq('  no suspect flag below Raging, and nothing claimed that the text doesn’t say', filamentFacts(calm), { ships: 'Tech I or Tech II Cruiser', penalty: 'reduce EM resistance', bonus: 'enhance ship capacitor recharging', minutes: null, cannotOpenIn: ['1.0', '0.9'], suspectIn: [] });
}

console.log('\n--- mining fits ---');
{
  const { oreFamily, mainFamily, crystalName, eftText, fitMultibuy, fittingBody, fitItems, oreBase, gradeLabel, gradeRank, isMinedForm, mercoxitTier, DEEP_CORE_RIG } = await import('../src/lib/miningFits.ts');
  // Calibration from ESI (30 September 2026): the deep-core rig 250 of a hull's 400.
  const cal = { [DEEP_CORE_RIG]: 250, 'Medium EM Shield Reinforcer II': 75, 'Medium Core Defense Field Extender II': 75, 'Medium Core Defense Field Extender I': 50, 'Medium Processor Overclocking Unit II': 300 };
  const rigCost = (n) => cal[n] ?? null;
  const proc = { key: 'solid', what: '', high: [{ name: 'Modulated Strip Miner II', qty: 2 }], mid: [], low: [], rigs: [{ name: 'Medium Core Defense Field Extender II', qty: 2 }, { name: 'Medium EM Shield Reinforcer II' }], crystal: { kind: 'B II', spares: 2 }, train: [], source: '' };
  const m = mercoxitTier(proc, rigCost, 400, true);
  eq('Mercoxit: strip miners swap for deep-core ones, crystals to Type A of the same tech', [m.tier.high, m.tier.crystal, m.swapped], [[{ name: 'Modulated Deep Core Strip Miner II', qty: 2 }], { kind: 'A II', spares: 2 }, [['Modulated Strip Miner II', 'Modulated Deep Core Strip Miner II']]]);
  eq('  the deep-core rig takes a shield reinforcer’s place when the calibration fits (75 + 75 + 250)', [m.rig, m.tier.rigs], [{ added: true, replaced: 'Medium EM Shield Reinforcer II' }, [{ name: 'Medium Core Defense Field Extender II', qty: 2 }, { name: DEEP_CORE_RIG, qty: 1 }]]);
  const hulk = { ...proc, rigs: [{ name: 'Medium Processor Overclocking Unit II' }, { name: 'Medium Core Defense Field Extender II' }] };
  eq('  without a CPU check, never in place of a processor rig, and not past 400 calibration (300 + 250)', mercoxitTier(hulk, rigCost, 400, true).rig, { added: false, why: 'noRoom' });
  // The user's Hulk on Mercoxit (30 September 2026): Solid and Max kept their Tech II processor rig and mined less than
  // Just in. With a CPU check, the processor rig steps down to Tech I (150) to make room (150 + 250 of 400).
  cal['Medium Processor Overclocking Unit I'] = 150;
  // As on the Hulk: the CPU fits with a processor rig of either tech, not without one.
  const stepped = mercoxitTier(hulk, rigCost, 400, true, (t) => t.rigs.some((x) => /Processor/.test(x.name)));
  eq('  when the CPU needs a processor rig, the Tech II one steps down to Tech I and the field extender makes way', [stepped.rig, stepped.tier.rigs],
    [{ added: true, replaced: 'Medium Core Defense Field Extender II', downgraded: 'Medium Processor Overclocking Unit II', cpu: true }, [{ name: 'Medium Processor Overclocking Unit I', qty: 1 }, { name: DEEP_CORE_RIG, qty: 1 }]]);
  eq('  and it doesn’t when the CPU wouldn’t fit', mercoxitTier(hulk, rigCost, 400, true, () => false).rig, { added: false, why: 'noRoom' });
  eq('  a processor rig goes whole when the CPU fits without it and the calibration allows', mercoxitTier({ ...proc, rigs: [{ name: 'Medium Processor Overclocking Unit II' }] }, rigCost, 400, true, () => true).rig, { added: true, replaced: 'Medium Processor Overclocking Unit II', cpu: true });
  eq('  a tank rig still goes first, with no CPU asked (75 + 75 + 250)', mercoxitTier(proc, rigCost, 400, true, () => false).rig, { added: true, replaced: 'Medium EM Shield Reinforcer II' });
  eq('  small hulls have no deep-core rig to take', mercoxitTier({ ...proc, high: [{ name: 'Miner II', qty: 3 }], rigs: [] }, rigCost, 400, false).rig, { added: false, why: 'size' });
  eq('  a starting fit without crystals gets Type A I; Miner IIs become Modulated Deep Core Miner IIs', ((x) => [x.tier.high[0].name, x.tier.crystal.kind])(mercoxitTier({ ...proc, high: [{ name: 'Miner II', qty: 3 }], crystal: undefined }, rigCost, 400, false)), ['Modulated Deep Core Miner II', 'A I']);
  eq('  no version for a fit with no ore lasers (ice, a booster)', [mercoxitTier({ ...proc, high: [{ name: 'Ice Harvester II', qty: 2 }] }, rigCost, 400, true), mercoxitTier({ ...proc, high: [{ name: 'Mining Foreman Burst II' }] }, rigCost, 400, true)], [null, null]);
  eq('  the Max tier adds Deep Core Mining V against gas clouds', mercoxitTier({ ...proc, key: 'max', train: [['Exhumers', 5]] }, rigCost, 400, true).tier.train, [['Exhumers', 5], ['Deep Core Mining', 5]]);
  eq('an ore’s base, for every grade and form (ESI’s names, one with a trailing space)', ['Scordite II-Grade', 'Scordite 0-Grade ', 'Batch Compressed Scordite', 'Glistening Zeolites', 'Dark Ochre IV-Grade', 'Zuthrine'].map(oreBase), ['Scordite', 'Scordite', 'Scordite', 'Zeolites', 'Dark Ochre', null]);
  eq('a grade’s label beside its base', [gradeLabel('Scordite', 'Scordite'), gradeLabel('Scordite 0-Grade ', 'Scordite'), gradeLabel('Brimful Zeolites', 'Zeolites')], ['Scordite', '0-Grade', 'Brimful']);
  eq('grades run poorest first', ['IV-Grade', 'Scordite', 'II-Grade', '0-Grade', 'III-Grade'].sort((a, b) => gradeRank(a, 'Scordite') - gradeRank(b, 'Scordite')), ['0-Grade', 'Scordite', 'II-Grade', 'III-Grade', 'IV-Grade']);
  eq('  and a moon ore’s: plain, Brimful, Glistening', ['Glistening', 'Zeolites', 'Brimful'].sort((a, b) => gradeRank(a, 'Zeolites') - gradeRank(b, 'Zeolites')), ['Zeolites', 'Brimful', 'Glistening']);
  eq('compressed forms aren’t grades to mine', ['Scordite II-Grade', 'Compressed Scordite', 'Batch Compressed Scordite IV-Grade'].map(isMinedForm), [true, false, false]);
  const { MASTERY } = await import('../src/lib/miningMastery.ts');
  const { HULLS } = await import('../src/lib/miningTree.ts');
  eq('an ore’s crystal family, every grade and compressed form alike', ['Scordite', 'Compressed Massive Scordite', 'Dark Ochre III-Grade', 'Zeolites', 'Mercoxit', 'Tritanium'].map(oreFamily), ['Simple', 'Simple', 'Variegated', 'Ubiquitous Moon', 'Mercoxit', null]);
  eq('crystals are named the game’s way', [crystalName('Simple', 'A II'), crystalName('Rare Moon', 'B I'), crystalName('Mercoxit', 'A II')], ['Simple Asteroid Mining Crystal Type A II', 'Rare Moon Mining Crystal Type B I', 'Mercoxit Asteroid Mining Crystal Type A II']);
  eq('the family is what most of your ore takes; Simple before you’ve mined', [mainFamily([{ name: 'Scordite', units: 10 }, { name: 'Kernite', units: 50 }, { name: 'Omber', units: 20 }]), mainFamily([])], ['Coherent', 'Simple']);
  const t = { key: 'solid', what: '', high: [{ name: 'Modulated Strip Miner II', qty: 2 }], mid: [{ name: 'Mining Survey Chipset II' }], low: [{ name: 'Mining Laser Upgrade II', qty: 3 }], rigs: [{ name: 'Medium Core Defense Field Extender II' }], drones: [{ name: 'Mining Drone II', qty: 5 }], crystal: { kind: 'B II', spares: 2 }, train: [], source: '' };
  const c = 'Simple Asteroid Mining Crystal Type B II';
  eq('EFT: lows, mids, highs with their crystal, rigs, drones, cargo, a blank line between', eftText('Hulk', 'Jita Ledger Solid', t, c).split('\n\n'), [
    '[Hulk, Jita Ledger Solid]\nMining Laser Upgrade II\nMining Laser Upgrade II\nMining Laser Upgrade II', 'Mining Survey Chipset II',
    `Modulated Strip Miner II, ${c}\nModulated Strip Miner II, ${c}`, 'Medium Core Defense Field Extender II', 'Mining Drone II x5', `${c} x2`]);
  // A fitting can't hold implants or boosters, and what the game's import does with such a line isn't documented: Copy
  // fit leaves them out, Multibuy has them (30 September 2026).
  const withImplants = { ...t, implants: ["Inherent Implants 'Highwall' Mining MX-1003", 'Synth Blue Pill Booster'] };
  eq('EFT: implants and boosters are left out, and only them', eftText('Hulk', 'Jita Ledger Solid', withImplants, c), eftText('Hulk', 'Jita Ledger Solid', t, c));
  eq('  Multibuy has them', fitMultibuy('Hulk', withImplants, c).text.split('\n').slice(-2), ["Inherent Implants 'Highwall' Mining MX-1003 1", 'Synth Blue Pill Booster 1']);
  eq('Multibuy: the hull, every item once with its count, crystals loaded and spare together', fitMultibuy('Hulk', t, c).text.split('\n'), ['Hulk 1', 'Modulated Strip Miner II 2', 'Mining Survey Chipset II 1', 'Mining Laser Upgrade II 3', 'Medium Core Defense Field Extender II 1', 'Mining Drone II 5', `${c} 4`]);
  const ids = { 'Modulated Strip Miner II': 17912, 'Mining Survey Chipset II': 2333, 'Mining Laser Upgrade II': 28576, 'Medium Core Defense Field Extender II': 31794, 'Mining Drone II': 10250, [c]: 60283 };
  const body = fittingBody(22544, 'Hulk', 'Solid', t, c, (n) => ids[n] ?? null);
  eq('a saved fitting: each module its own slot, drones in the bay, crystals in the cargo', body.items.map((i) => `${i.flag}:${i.type_id}x${i.quantity}`), ['HiSlot0:17912x1', 'HiSlot1:17912x1', 'MedSlot0:2333x1', 'LoSlot0:28576x1', 'LoSlot1:28576x1', 'LoSlot2:28576x1', 'RigSlot0:31794x1', 'DroneBay:10250x5', 'Cargo:60283x4']);
  eq('  and none while a name is unresolved', fittingBody(22544, 'Hulk', 'Solid', t, c, (n) => (n === c ? null : ids[n])), null);
  const burst = { ...t, high: [{ name: 'Mining Foreman Burst II', charge: 'Mining Laser Optimization Charge' }], crystal: undefined };
  eq('a burst carries its charge: in the EFT line, and bought with it', [eftText('Porpoise', 'x', burst, null).includes('Mining Foreman Burst II, Mining Laser Optimization Charge'), fitMultibuy('Porpoise', burst, null).text.includes('Mining Laser Optimization Charge 1')], [true, true]);
  eq('every hull but the Rorqual and Perseverance has three tiers (and at most a labelled alternative), and every one is on the tree', [HULLS.filter((h) => !MASTERY[h.id]).map((h) => h.name), Object.values(MASTERY).every((x) => /^start,solid,max(,alt)?$/.test(x.map((y) => y.key).join()) && x.every((y) => y.key !== 'alt' || !!y.label)), Object.keys(MASTERY).every((id) => HULLS.some((h) => h.id === Number(id)))], [['Rorqual', 'Perseverance'], true, true]);
  // The Mackinaw's Max mined less than its Solid (ORE Strip Miners, 799 against 1,119 m³ a minute): the most it can mine is
  // Max now, and the no-residue fit is its alternative (30 September 2026).
  const mack = MASTERY[22548];
  eq('the Mackinaw’s Max is its Solid with both yield implants; the ORE Strip Miner fit is its no-residue alternative', [mack.find((t) => t.key === 'max').high, mack.find((t) => t.key === 'max').crystal.kind, mack.find((t) => t.key === 'max').implants.length, mack.find((t) => t.key === 'alt').label, mack.find((t) => t.key === 'alt').high[0].name],
    [mack.find((t) => t.key === 'solid').high, 'B II', 2, 'No residue', 'ORE Strip Miner']);
  eq('no fit asks for more slots than its hull has (ESI, 29 September 2026)', Object.entries(MASTERY).flatMap(([id, tiers]) => tiers.filter((x) => {
    const slots = { 32880: [3, 3, 1, 3], 89648: [3, 4, 1, 3], 89240: [4, 3, 2, 3], 89647: [4, 4, 2, 3], 89649: [5, 5, 3, 2], 33697: [3, 3, 4, 2], 37135: [3, 4, 3, 2], 17480: [2, 3, 3, 3], 17478: [2, 2, 3, 3], 17476: [2, 2, 3, 3], 22546: [2, 5, 3, 2], 22548: [2, 4, 3, 2], 22544: [2, 4, 3, 2], 42244: [4, 4, 2, 3], 28606: [6, 5, 2, 3] }[id];
    const n = (xs) => xs.reduce((s, y) => s + (y.qty ?? 1), 0);
    return !slots || n(x.high) > slots[0] || n(x.mid) > slots[1] || n(x.low) > slots[2] || n(x.rigs) > slots[3];
  }).map((x) => `${id}:${x.key}`)), []);
  eq('fit items include loaded charges and crystals, for pricing', fitItems(burst, null).map((x) => x.name), ['Mining Foreman Burst II', 'Mining Survey Chipset II', 'Mining Laser Upgrade II', 'Medium Core Defense Field Extender II', 'Mining Drone II', 'Mining Laser Optimization Charge']);
}

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
const CFG = { on: true, browser: false, interval: 5, minIsk: 5e6, quiet: false, repeatH: 4, ev: { move: true, clearing: false, squeeze: true, pi: true, scam: true, backup: true } };
const F = { kind: 'move', key: 'o1', title: 't', text: 'x', isk: 10e6 };
const noon = Date.parse('2026-09-26T12:00:00Z');
eq('a big move alerts', shouldAlert(F, CFG, [], noon), true);
eq('off is off', shouldAlert(F, { ...CFG, on: false }, [], noon), false);
eq('a switched-off event is quiet', shouldAlert({ ...F, kind: 'clearing' }, CFG, [], noon), false);
eq('small ISK is below the line', shouldAlert({ ...F, isk: 1e6 }, CFG, [], noon), false);
eq('the ISK line does not apply to a PI programme', shouldAlert({ kind: 'pi', key: 'p', title: '', text: '' }, CFG, [], noon), true);
eq('quiet hours hold at 2am EVE', shouldAlert(F, { ...CFG, quiet: true }, [], Date.parse('2026-09-26T02:00:00Z')), false);
eq('the same thing is not raised twice', shouldAlert(F, CFG, [{ at: new Date(noon - 3600_000).toISOString(), kind: 'move', key: 'o1', title: '', text: '' }], noon), false);
eq('  not after 3 h when you asked for 4', shouldAlert(F, CFG, [{ at: new Date(noon - 3 * 3600_000).toISOString(), kind: 'move', key: 'o1', title: '', text: '' }], noon), false);
eq('  unless it has been a while', shouldAlert(F, CFG, [{ at: new Date(noon - 5 * 3600_000).toISOString(), kind: 'move', key: 'o1', title: '', text: '' }], noon), true);
eq('  and after 2 h when you asked for 1', shouldAlert(F, { ...CFG, repeatH: 1 }, [{ at: new Date(noon - 2 * 3600_000).toISOString(), kind: 'move', key: 'o1', title: '', text: '' }], noon), true);
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
const other = flows(
  [J('o1', '2026-09-20T00:00:00Z', 'player_trading', 700, { description: 'Trade with Bob' }), J('o2', '2026-09-21T00:00:00Z', 'player_trading', 200, { description: 'Trade with Ann' }),
    J('o3', '2026-09-21T00:00:00Z', 'kill_right_fee', 90), J('o4', '2026-09-22T00:00:00Z', 'asset_safety_recovery_tax', -40)],
  [tx2('x', '2026-09-20T00:00:00Z', true, 2, 50, 35), tx2('y', '2026-09-21T00:00:00Z', true, 1, 300, 36), tx2('z', '2026-09-22T00:00:00Z', true, 1, 10, 35)],
  () => ({ tracked: false, tag: 'other' }), Date.parse('2026-09-01T00:00:00Z'),
);
const otherIn = other.ins.find((l) => l.key === 'otherIn');
eq('Other income opens to the kinds of entry behind it, biggest first', otherIn.parts.map((p) => [p.label, p.amount, p.count]), [['Player trading', 900, 2], ['Kill right fee', 90, 1]]);
eq('  and each kind to its entries', otherIn.parts[0].entries.map((e) => [e.text, e.amount]), [['Trade with Bob', 700], ['Trade with Ann', 200]]);
eq('money out’s parts are positive too', other.outs.find((l) => l.key === 'safety').parts[0].entries[0].amount, 40);
eq('Other purchases opens to the items bought', other.outs.find((l) => l.key === 'otherBuys').parts.map((p) => [p.typeId, p.amount, p.count]), [[36, 300, 1], [35, 110, 2]]);
const jr = [
  J('10', '2026-09-20T00:00:00Z', 'brokers_fee', -100, { contextId: 7 }), J('11', '2026-09-21T00:00:00Z', 'brokers_fee', -30, { contextId: 7 }),
  J('12', '2026-09-21T00:00:00Z', 'transaction_tax', -80), J('13', '2026-09-21T00:00:00Z', 'planetary_export_tax', -5),
];
const leak = feeLeak(jr, Date.parse('2026-09-01T00:00:00Z'), new Set(['11']));
eq('a fee matched as a price change is one', leak.relists, 30);
eq('  every other broker fee is a listing', leak.broker, 100);
eq('sales tax and PI tax are counted', leak.sales + leak.pi, 85);
eq('without matches nothing is called a price change', feeLeak(jr, 0).relists, 0);
const bal = [J('1', '2026-09-20T00:00:00Z', 'x', 1, { balance: 100 }), J('2', '2026-09-21T00:00:00Z', 'x', 1, { balance: 150 })];
eq('balance after a moment is the last entry before it', balanceAt(bal, Date.parse('2026-09-20T12:00:00Z')), 100);
eq('the series runs oldest first', balanceSeries(bal, 0).map((p) => p.balance), [100, 150]);
eq('a sale of something never bought is loot', autoTag(tx2('z', '', false, 1, 1, 5), new Set([34])), 'loot');
eq('tags cycle', nextTag('other'), 'loot');
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
eq('multibuy is “Name N” per line, as the Multibuy import’s tooltip gives it', multibuy([{ name: 'Gila', qty: 1 }, { name: 'Hammerhead II', qty: 5 }]), 'Gila 1\nHammerhead II 5');

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

console.log('\n--- measured pace: what the books did between checks ---');
{
  const o = (id, isBuy, price, volume) => ({ id, isBuy, price, volume });
  const prev = [o(1, false, 100, 10), o(2, false, 101, 50), o(3, false, 105, 20), o(4, true, 95, 30), o(5, true, 90, 40)];
  const quiet = { frontSell: 0, frontBuy: 0, repriceSell: 0, repriceBuy: 0 };
  eq('the same book twice: nothing happened', bookFills(prev, prev), { sell: 0, buy: 0, newSell: 0, newBuy: 0, ...quiet });
  const cur = [o(1, false, 100, 4), o(2, false, 101, 50), o(4, true, 95, 25), o(5, true, 90, 40)];
  eq('shrunken orders are sales on their side; a deep order vanishing is not', bookFills(prev, cur), { sell: 6, buy: 5, newSell: 0, newBuy: 0, ...quiet, sellHigh: 100, buyLow: 95 });
  eq('  a fill price is only taken from an order that shrank, not one that vanished', bookFills(prev, [o(2, false, 101, 50), o(3, false, 105, 20), o(4, true, 95, 30)]).buyLow, undefined);
  const deeper = [o(1, false, 100, 10), o(2, false, 101, 50), o(3, false, 105, 20), o(4, true, 95, 30), o(5, true, 90, 10)];
  eq('  and the lowest one that did is the day’s exact low', bookFills(prev, deeper).buyLow, 90);
  const bought = [o(2, false, 101, 50), o(3, false, 105, 20), o(4, true, 95, 30), o(5, true, 90, 40)];
  eq('  the best ask vanishing counts as bought out', bookFills(prev, bought).sell, 10);
  const undercut = [...prev.filter((x) => x.id !== 2), o(2, false, 99.9, 50), o(6, false, 99.8, 7), o(7, false, 103, 9)];
  eq('undercuts: new or repriced at the front count, deeper ones don’t', bookFills(prev, undercut).newSell, 57);
  eq('  the front improving counts once; a same-ID price change is a reprice', [bookFills(prev, undercut).frontSell, bookFills(prev, undercut).repriceSell], [1, 1]);
  eq('  buying out the best listing is not an undercut', bookFills(prev, bought).frontSell, 0);
  const t = Date.parse('2026-09-27T10:00:00Z');
  const f = { sell: 6, buy: 5, newSell: 0, newBuy: 0 };
  let log = addFlow({}, 34, t, 0.1, f);
  log = addFlow(log, 34, t + 360_000, 0.1, f);
  eq('intervals add up per item and day', observedFlow(log, 34, t), { h: 0.2, sell: 12, buy: 10, newSell: 0, newBuy: 0, ...quiet, buyLow: undefined, sellHigh: undefined });
  let lows = addFlow({}, 34, t, 0.1, { ...f, buyLow: 95, frontSell: 1 });
  lows = addFlow(lows, 34, t + 360_000, 0.1, { ...f, buyLow: 91, sellHigh: 120, frontSell: 1 });
  const day = lows[34]['2026-09-27'];
  eq('  a day keeps its lowest fill and highest sale, and adds up undercuts', [day.buyLow, day.sellHigh, day.frontSell], [91, 120, 2]);
  eq('  a gap longer than half an hour is not counted', addFlow(log, 34, t, MAX_GAP_H + 0.01, f), log);
  eq('  nor is the same snapshot read twice', addFlow(log, 34, t, 0, f), log);
  const old = addFlow({}, 35, t - 20 * 86400_000, 0.1, f);
  eq('  old days are dropped', Object.keys(pruneFlow({ ...old, ...log }, t)), ['34']);
  eq('pace: nothing watched is the guess', sidePaceBlend(240, 0, 0), 240);
  eq('  a day watched with no sale halves it rather than zeroing it', sidePaceBlend(240, 0, 24), 120);
  eq('  long watching converges on what was seen (576 a day)', Math.round(sidePaceBlend(240, 24000, 1000)), 568);
  eq('  no guess: watching alone once there’s six hours of it', [sidePaceBlend(null, 10, 5), sidePaceBlend(null, 12, 6)], [null, 48]);
}
console.log('\n--- who is trading: the best evidence first ---');
{
  eq('the book first, when its orders have sold enough', tradingSplit({ history: 0.9, book: { sell: 10, buy: 30 } }), { share: 0.25, from: 'book', watchedH: 0 });
  eq('  a book that has sold too little leaves it to history', tradingSplit({ history: 0.9, book: { sell: 1, buy: MIN_BOOK_SOLD - 2 } }).from, 'history');
  eq('  nothing at all: even', tradingSplit({}), { share: 0.5, from: 'even', watchedH: 0 });
  // Item 16423: 7 of its 10 listings were single units, which vanish when bought, so the book showed no
  // buyers at all. A side mostly of single units can't show its sales: history decides instead.
  eq('  a sell side of single units can’t show its buyers: history', tradingSplit({ history: 0.69, book: { sell: 0, buy: 1354, single: { sell: 7, buy: 0 }, orders: { sell: 10, buy: 4 } } }).from, 'history');
  // The Experimental ZW-4100 Torpedo Launcher (29 September 2026): its one Jita bid filled up and left the book, so the
  // book showed 105 sold from listings and nothing into bids; the cloud had watched 57 bought from listings, 157 sold
  // into bids. The book read 100% buyers and the blend 77.8%.
  const zw = { sell: 105, buy: 0, single: { sell: 7, buy: 0 }, orders: { sell: 30, buy: 0 } };
  eq('  a side with no orders can’t show what it sold: history, not the book', tradingSplit({ history: 0.6, book: zw }).from, 'history');
  eq('    so the launcher reads ~50%, not 77.8%', [+tradingSplit({ history: 0.6, book: zw, watched: { sell: 57, buy: 157, h: 28.4 }, typicalDay: 493 }).share.toFixed(3), +tradingSplit({ history: 0.6, book: { ...zw, orders: { sell: 30, buy: 1 } }, watched: { sell: 57, buy: 157, h: 28.4 }, typicalDay: 493 }).share.toFixed(3)], [0.499, 0.778]);
  eq('  multi-unit listings can: the book', tradingSplit({ history: 0.69, book: { sell: 0, buy: 1396, single: { sell: 17, buy: 0 }, orders: { sell: 37, buy: 5 } } }).from, 'book');
  const w = tradingSplit({ history: 0.9, book: { sell: 10, buy: 30 }, watched: { sell: 90, buy: 10, h: 12 }, typicalDay: 100 });
  eq('watching a typical day’s worth counts as much as the prior', w.share, (90 + 0.25 * 100) / 200);
  eq('  and then speaks for itself', w.from, 'watched');
  eq('  a little watching only nudges it', tradingSplit({ history: 0.9, book: { sell: 10, buy: 30 }, watched: { sell: 5, buy: 0, h: 1 }, typicalDay: 100 }).from, 'book');
  eq('  hours with no trade say nothing about the split', tradingSplit({ history: 0.9, watched: { sell: 0, buy: 0, h: 6 }, typicalDay: 100 }), { share: 0.9, from: 'history', watchedH: 6 });
  const day = (d, volume) => ({ date: d, average: 10, highest: 11, lowest: 9, volume, order_count: 1 });
  const now = Date.parse('2026-09-27T12:00:00Z');
  const busy = Array.from({ length: 14 }, (_, i) => day(new Date(now - (i + 1) * 86400_000).toISOString().slice(0, 10), i === 0 ? 1000 : 10));
  eq('pace day: the median, so one huge day doesn’t count', paceDay(busy, now), 10);
  const thin = [day('2026-09-26', 6), day('2026-09-22', 8), day('2026-09-18', 14)];
  eq('  an item trading on under half its days still sells: the 14-day average', paceDay(thin, now), 2);
}
console.log('\n--- cloud sync: what changed, and applying what came down ---');
{
  const { diffRecords, applyPulled, everything, sharedDoc, docValue } = await import('../src/lib/cloudSync.ts');
  const t1 = { id: 't1', qty: 1 }, t2 = { id: 't2', qty: 2 };
  const before = { t1, t2 };
  eq('an untouched map reports nothing', diffRecords('txs', before, before), { changed: [], removed: [] });
  eq('a new record, a removed one', diffRecords('txs', before, { t1, t3: { id: 't3' } }), { changed: ['t3'], removed: ['t2'] });
  eq('a rebuilt record with the same content is not a change', diffRecords('txs', before, { t1: { id: 't1', qty: 1 }, t2 }), { changed: [], removed: [] });
  eq('an edited one is', diffRecords('txs', before, { t1: { id: 't1', qty: 5 }, t2 }).changed, ['t1']);
  eq('positions go by their id', diffRecords('positions', [{ id: 'a', s: 1 }], [{ id: 'a', s: 2 }, { id: 'b' }]).changed, ['a', 'b']);
  const data = {
    txs: { t1 }, positions: [{ id: 'a', status: 'open' }, { id: 'b', status: 'open' }],
    netWorth: [{ date: '2026-09-25', total: 1 }, { date: '2026-09-27', total: 3 }],
    meta: { lastSeenAt: 'here', rateHistory: [1] }, prefs: { theme: 'Caldari', motion: 'Calm', perJump: 1 },
  };
  const patch = applyPulled(data, {
    records: [
      { k: 'txs', i: 't9', d: { id: 't9' } }, { k: 'txs', i: 't1', d: null },
      { k: 'positions', i: 'b', d: { id: 'b', status: 'closed' } }, { k: 'positions', i: 'c', d: { id: 'c', status: 'open' } },
      { k: 'positions', i: 'a', d: null },
      { k: 'netWorth', i: '2026-09-26', d: { date: '2026-09-26', total: 2 } },
    ],
    docs: [{ key: 'meta', d: { lastSeenAt: 'other device', rateHistory: [1, 2] } }, { key: 'prefs', d: { theme: 'Amarr', motion: 'Full', perJump: 9 } }],
  });
  eq('records arrive and deletions travel', Object.keys(patch.txs), ['t9']);
  eq('a changed position replaces its own, a new one goes first, a deleted one goes', patch.positions.map((p) => `${p.id}:${p.status}`), ['c:open', 'b:closed']);
  eq('net worth stays in date order', patch.netWorth.map((p) => p.total), [1, 2, 3]);
  eq('meta comes down, but this browser keeps its own visit', patch.meta, { lastSeenAt: 'here', rateHistory: [1, 2] });
  eq('prefs come down, but this screen keeps its motion', patch.prefs, { theme: 'Amarr', motion: 'Calm', perJump: 9 });
  eq('what goes up leaves this browser’s own fields out', [sharedDoc('meta', data.meta), docValue(data, 'prefs')], [{ rateHistory: [1] }, { theme: 'Caldari', perJump: 1 }]);
  const all = everything({ ...data, journal: {}, orders: {}, names: {}, killmails: {}, tags: {}, goals: [], watchlist: [] });
  eq('the first upload is every record and every doc there is', [all.records.map((r) => `${r.k}:${r.i}`), all.docs], [['txs:t1', 'positions:a', 'positions:b', 'netWorth:2026-09-25', 'netWorth:2026-09-27'], ['meta', 'prefs']]);
}
console.log('\n--- to do and results ---');
{
  const it = (key, stake, kind = 'move', extra = {}) => ({ key, ver: '1', kind, source: 'orders', title: '', detail: '', stake, action: { label: '' }, ...extra });
  eq('most ISK first', orderTodo([it('a', 1), it('b', 5), it('c', 3)]).map((x) => x.key), ['b', 'c', 'a']);
  const T0 = Date.parse('2026-09-27T10:00:00Z');
  const cant = () => null;
  const at = () => T0;
  // Seen, then the page loads again before the orders are checked: nothing is present, nothing can be judged.
  const m = remember({}, [it('order:1', 10), it('pi:2', 5, 'piEnding', { source: 'colonies' })], at, cant, T0);
  const reload = remember(m, [], at, cant, T0 + 60_000);
  eq('absent is not done: nothing is ticked off before a newer read', Object.values(reload).filter((e) => e.done).length, 0);
  eq('  both still listed, as being checked', split(reload, new Set()).open.map((o) => [o.e.item.key, o.checking]), [['order:1', true], ['pi:2', true]]);
  const later = remember(reload, [], at, (e) => (e.item.key === 'order:1' ? 'moved' : null), T0 + 120_000);
  eq('a newer read ticks it off, saying what changed', later['order:1'].done, { at: T0 + 120_000, how: 'moved' });
  eq('  the other keeps waiting', later['pi:2'].done, undefined);
  const s2 = summarise(split(later, new Set()));
  eq('  one left, half done', [s2.left, s2.frac], [1, 0.5]);
  eq('  its ISK and rough time', [s2.stake, s2.minutes], [5, 4]);
  eq('a finding that comes back is open again', remember(later, [it('order:1', 10)], at, cant, T0 + 180_000)['order:1'].done, undefined);
  const tick = (mm, key) => ({ ...mm, [key]: { ...mm[key], ticked: { ver: mm[key].item.ver, at: T0 } } });
  const both = [it('order:1', 10), it('scam:3:wall', 0, 'scam', { source: 'signals' })];
  const t = tick(tick(remember({}, both, at, cant, T0), 'order:1'), 'scam:3:wall');
  eq('a tick by hand holds on the same version', !!remember(t, both, at, cant, T0 + 3600_000)['order:1'].ticked, true);
  eq('  a new undercut reopens it', remember(t, [it('order:1', 10, 'move', { ver: '2' })], at, cant, T0 + 3600_000)['order:1'].ticked, undefined);
  const after = remember(t, both, at, cant, T0 + SESSION_MS + 1);
  eq('  a chore ticked by hand comes back after the session', after['order:1'].ticked, undefined);
  eq('  a warning stays seen while it lasts', !!after['scam:3:wall'].ticked, true);
  eq('  ticked items count as done', split(remember(t, both, at, cant, T0 + 1), new Set(['order:1', 'scam:3:wall'])).done.length, 2);
  eq('done and unjudged items are forgotten after the session', Object.keys(remember(later, [], at, cant, T0 + 120_000 + SESSION_MS + 1)), []);

  const e = { item: it('order:1', 10, 'move', { price: 100 }), seenAt: 0, lastAt: 0 };
  const v = (verdict, price = 100, extra = {}) => ({ gone: false, verdict, price, why: 'Only 3 ahead of you, about 2 h at this item’s pace', ...extra });
  const seen = { open: true, checkedAt: 1, bookRead: true };
  eq('an order the sync says closed', judgeOrder(e, { open: false, checkedAt: null, bookRead: false }), 'The order has closed: it filled, expired or was cancelled.');
  eq('  before any check: can’t say', judgeOrder(e, { open: true, checkedAt: null, bookRead: false }), null);
  eq('  the check that showed it can’t say', judgeOrder(e, { ...seen, checkedAt: 0, v: v('front', 99.5) }), null);
  eq('  its book failed to load: can’t say', judgeOrder(e, { ...seen, bookRead: false, v: v('front') }), null);
  eq('  gone from the book', judgeOrder(e, { ...seen, v: v('front', 100, { gone: true }) }), 'It’s no longer in the market: it filled, expired or was cancelled.');
  eq('  relisted to the front', judgeOrder(e, { ...seen, v: v('front', 99.5) }), 'You moved it to 99.50 ISK, and it’s at the front.');
  eq('  the queue cleared by itself', judgeOrder(e, { ...seen, v: v('front') }), 'It’s at the front now: the orders ahead of it have gone.');
  eq('  no longer worth moving', judgeOrder(e, { ...seen, v: v('wait') }), 'Not worth moving now: only 3 ahead of you, about 2 h at this item’s pace.');
  eq('  still worth moving is not done', judgeOrder(e, { ...seen, v: v('move', 99) }), null);
  const pe = { item: it('pi:9', 5, 'piEnding', { source: 'colonies' }), seenAt: 1000, lastAt: 1000 };
  const ends = Date.parse('2026-09-30T14:00:00Z');
  eq('PI: the same read can’t say', judgePi(pe, { readAt: 1000, extractor: null }, T0), null);
  eq('  a newer read with the heads reset', judgePi(pe, { readAt: 2000, extractor: { expiry: ends } }, T0), `The heads were reset: it runs until ${fmtDateTime(ends)}.`);
  eq('  a newer read, still ending', judgePi(pe, { readAt: 2000, extractor: { expiry: T0 + 3600_000 } }, T0), null);
  eq('  a newer read, no programme at all', judgePi(pe, { readAt: 2000, extractor: { expiry: null } }, T0), 'The extractor has no programme running now.');
  const se = { item: it('scam:3:wall', 0, 'scam', { source: 'signals' }), seenAt: 1000, lastAt: 1000 };
  eq('a wall needs a newer read to clear', [judgeScam(se, { tracked: true, signalAt: 1000 }), judgeScam(se, { tracked: true, signalAt: 2000 })], [null, 'The wall has gone.']);
  eq('  and on an item you only sell it just goes, unticked', judgeScam(se, { tracked: false, signalAt: 2000 }), false);
  const kept = remember({ [se.item.key]: se }, [], () => 0, () => false, 5000);
  eq('  a judge saying false forgets the item: not open, not done', Object.keys(kept), []);
  const { trackedTypes } = await import('../src/lib/signals.ts');
  const td = { positions: [{ typeId: 1, status: 'open' }, { typeId: 2, status: 'closed' }], watchlist: [{ typeId: 3 }],
    orders: { a: { typeId: 4, state: 'open', isBuy: false }, b: { typeId: 5, state: 'open', isBuy: true }, c: { typeId: 6, state: 'closed', isBuy: true } } };
  eq('suspicious markets are checked on positions, bids and the watchlist, not on what you only sell', trackedTypes(td).sort((a, b) => a - b), [1, 3, 5]);
}
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
  // The Wallet's "All income against play" adds the sales no activity counts (loot, ore), which the user asked for: "I have
  // other income as well" (30 September 2026).
  const inp = {
    txs: [T('a', 1, true, 2, 100), T('b', 2, false, 1, 1000), T('e', 9, false, 1, 5000), T('f', 9, false, 1, 777), T('g', 9, false, 1, 300), T('h', 1, false, 1, 50), T('i', 9, true, 1, 60)],
    journal: [{ date: '2026-09-20T11:00:00Z', refType: 'transaction_tax', amount: -150, contextId: 'e' }],
    tracked: new Set(['f']), realized: [], losses: [], sets, salesTax: 0.1,
  };
  eq('other sales: what no position or activity counts, after tax (the journal’s, else the rate)', otherSales(inp, new Set(['g'])).map((x) => x.isk), [5000 - 150, 50 - 5]);
}

console.log('\n--- recent averages over calendar days ---');
{
  const now = Date.parse('2026-09-26T12:00:00Z');
  const row = (date, volume, average = 100) => ({ date, volume, average, highest: average, lowest: average, order_count: 1 });
  const busy = ['19', '20', '21', '22', '23', '24', '25'].map((d) => row(`2026-09-${d}`, 70));
  eq('a busy item: seven days of rows over seven days', recentAverages(busy, 7, now).avgVol, 70);
  const thin = ['2026-07-30', '2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03', '2026-09-24'].map((d) => row(d, 70));
  eq('a thin item: only the rows inside the week count, spread over the week', recentAverages(thin, 7, now).avgVol, 10);
  eq('an item that stopped trading is zero, not its last pace', recentAverages([row('2026-08-01', 500)], 7, now).avgVol, 0);
  eq('  and has no price', recentAverages([row('2026-08-01', 500)], 7, now).avgPrice, null);
  eq('no history at all is unknown, not zero', recentAverages([], 7, now).avgVol, null);
  const late = ['18', '19', '20', '21', '22', '23', '24'].map((d) => row(`2026-09-${d}`, 70));
  eq('before the daily update, the window ends on the last published day', recentAverages(late, 7, now).avgVol, 70);
  eq('price is weighted by volume', recentAverages([row('2026-09-24', 1, 100), row('2026-09-25', 3, 200)], 7, now).avgPrice, 175);
  // PL-0 Scoped Cargo Scanner's real history, the last day being mostly your own buying.
  const pl0 = [['18', 146], ['19', 183], ['20', 167], ['21', 92], ['22', 245], ['23', 313], ['24', 1187], ['25', 3854]].map(([dd, v]) => row(`2026-09-${dd}`, v));
  eq('a typical day is the median, not dragged up by one huge day', typicalDailyVolume(pl0, 7, now), 245);
  eq('  where the average is', Math.round(recentAverages(pl0, 7, now).avgVol), 863);
}

console.log('\n--- matching fees and tax to orders and sales by the second ---');
{
  const { matchFees, withHistory, mergeOrders } = await import('../src/lib/feeMatch.ts');
  const rate = () => ({ f: 0.013, k: 0.013 * 0.2, t: 0.03375 });
  const O = (id, price, total, remain, issued, isBuy = false) => ({ orderId: id, typeId: 1, isBuy, price, volumeTotal: total, volumeRemain: remain, issued, state: 'open', locationId: 60003760 });
  const JE = (id, date, refType, amount) => ({ id, date, refType, amount });

  // History: the first sync sees the order; the next sees it at a new price and a new issued time.
  let o = withHistory(undefined, O(1, 34810, 2039, 2039, '2026-09-26T20:00:00Z'));
  eq('a new order starts its history', o.seen.length, 1);
  o = withHistory(o, O(1, 34810, 2030, 2030, '2026-09-26T20:00:00Z'));
  eq('a fill alone is not a price change', o.seen.length, 1);
  o = withHistory(o, O(1, 34770, 2030, 2030, '2026-09-27T09:15:04Z'));
  eq('a new price is a new version', o.seen.map((v) => v.price), [34810, 34770]);
  const o3 = mergeOrders({ 1: o }, { 1: O(1, 34700, 2030, 2030, '2026-09-27T12:00:00Z') })[1];
  eq('merging keeps history for orders already stored', o3.seen.length, 3);

  const journal = [
    JE('a', '2026-09-26T20:00:00Z', 'brokers_fee', -922700), // listing 2,039 at 34,810
    JE('b', '2026-09-27T09:15:04Z', 'brokers_fee', -183500), // moved to 34,770
    JE('c', '2026-09-27T09:15:04Z', 'brokers_fee', -5000),   // someone else's order in the same second
    JE('t1', '2026-09-27T10:00:00Z', 'transaction_tax', -5874.19),
    JE('t2', '2026-09-27T10:00:00Z', 'transaction_tax', -417.49),
  ];
  const sales = [
    { id: 's1', source: 'esi', typeId: 1, date: '2026-09-27T10:00:00Z', isBuy: false, qty: 5, unitPrice: 34810 },
    { id: 's2', source: 'esi', typeId: 2, date: '2026-09-27T10:00:00Z', isBuy: false, qty: 1, unitPrice: 12370 },
  ];
  const m = matchFees(journal, [o3], sales, rate);
  const f = m.byOrder.get(1);
  eq('the listing fee is read from the journal', [f.placement.amount, f.placement.actual], [922700, true]);
  eq('the price change is matched by its second, and by size over the other fee', [f.relists.length, f.relists[0].amount, f.relists[0].actual], [2, 183500, true]);
  eq('  and a change seen without a journal entry is estimated', f.relists[1].actual, false);
  eq('it counts as a price change for the fee leak', [...m.relistIds], ['b']);
  eq('two sales in one second each get their own tax', [m.taxByTx.get('s1'), m.taxByTx.get('s2')], [5874.19, 417.49]);
  // First seen after a change: the fee in that second is too small to be a placement.
  const late = { ...O(9, 1000, 1000, 800, '2026-09-27T11:00:00Z'), seen: [{ issued: '2026-09-27T11:00:00Z', price: 1000, remain: 800 }] };
  const m2 = matchFees([JE('x', '2026-09-27T11:00:00Z', 'brokers_fee', -2080)], [late], [], rate);
  eq('a small fee on the first version seen is a change, not the placement', [m2.byOrder.get(9).relists.length, m2.byOrder.get(9).placement.actual], [1, false]);
}

console.log('\n--- a position: fees belong to the units they were paid for ---');
{
  const { computePosition } = await import('../src/lib/positions.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  // PL-0 Scoped Cargo Scanner, as reported: 2,039 bought at 9,042, a sell order listing all of them at
  // 34,810, five sold. Broker fee 1.3%, sales tax 3.375%.
  const S = sanitizeSettings({ override: true, brokerPct: 1.3, taxPct: 3.375 });
  const JITA = 60003760, TYPE = 1;
  const tx = (id, isBuy, qty, price, date) => ({ id, source: 'esi', typeId: TYPE, date, isBuy, qty, unitPrice: price, locationId: JITA });
  const order = (id, isBuy, price, total, remain, state, issued) => ({ orderId: id, typeId: TYPE, isBuy, price, volumeTotal: total, volumeRemain: remain, issued, state, locationId: JITA });
  const d = {
    txs: {
      b1: tx('b1', true, 1000, 9042, '2026-09-25T10:00:00Z'), b2: tx('b2', true, 1039, 9042, '2026-09-25T12:00:00Z'),
      s1: tx('s1', false, 5, 34810, '2026-09-26T10:00:00Z'),
    },
    orders: {
      1: order(1, true, 9042, 1000, 0, 'closed', '2026-09-25T09:00:00Z'),
      2: order(2, true, 9042, 1039, 0, 'closed', '2026-09-25T11:00:00Z'),
      3: order(3, false, 34810, 2039, 2034, 'open', '2026-09-25T13:00:00Z'),
    },
    journal: {}, meta: {},
  };
  const pos = { id: 'p', typeId: TYPE, openedAt: '2026-09-25T00:00:00Z', status: 'open', jitaOnly: true, excluded: [], included: [] };
  const c = computePosition(pos, d, S);
  const buyFee = 0.013 * 9042 * 2039, sellFee = 0.013 * 34810 * 2039;
  eq('all four fees are still counted as paid', Math.round(c.brokerFees), Math.round(buyFee + sellFee));
  eq('the listing fee for the 2,034 unsold is prepaid, not a loss', Math.round(c.prepaidFees), Math.round(sellFee * 2034 / 2039));
  eq('the buy fee is part of what the stock cost', Math.round(c.avgCost * 100) / 100, Math.round((9042 + 0.013 * 9042) * 100) / 100);
  const expect = 5 * 34810 - 5 * (9042 * 1.013) - 5 * 34810 * 0.03375 - sellFee * 5 / 2039;
  eq('realized profit is the five sold, less their own share of fees', Math.round(c.realized), Math.round(expect));
  eq('  a sensible positive return, not -2325%', Math.round(c.roi * 100), Math.round(expect / (5 * 9042 * 1.013) * 100));
  const cash = 5 * 34810 - 2039 * 9042 - c.brokerFees - c.salesTax;
  eq('nothing lost: cash + stock at cost + prepaid fees = realized', Math.round(cash + c.costOfStock + c.prepaidFees), Math.round(c.realized));
  // A closed buy order that only half filled: the unfilled half of its fee is simply spent.
  const d2 = { ...d, orders: { 1: order(1, true, 9042, 2000, 1000, 'expired', '2026-09-25T09:00:00Z') }, txs: { b1: d.txs.b1 } };
  const c2 = computePosition(pos, d2, S);
  eq('an expired order\'s unfilled half is spent', Math.round(-c2.realized), Math.round(0.013 * 9042 * 1000));
  eq('  and its filled half is in the stock\'s cost', Math.round(c2.costOfStock), Math.round(1000 * 9042 + 0.013 * 9042 * 1000));
  // The sell order moved once to get back on top: its fee, from the journal, comes off profit.
  const moved = { ...d.orders[3], price: 34770, issued: '2026-09-26T09:00:00Z', seen: [
    { issued: '2026-09-25T13:00:00Z', price: 34810, remain: 2039 }, { issued: '2026-09-26T09:00:00Z', price: 34770, remain: 2039 }] };
  const d3 = { ...d, orders: { ...d.orders, 3: moved }, journal: { r: { id: 'r', date: '2026-09-26T09:00:00Z', refType: 'brokers_fee', amount: -184000 } } };
  const c3 = computePosition(pos, d3, S);
  eq('a price change is counted', [c3.priceChanges, c3.relistFees, c3.relistsEstimated], [1, 184000, 0]);
  // It was charged on the 2,039 left then; 5 have sold since, so they carry 5/2,039 of it and the rest is prepaid.
  eq('  the units sold since carry their share of it', Math.round(c.realized - c3.realized), Math.round(184000 * 5 / 2039));
  eq('  the rest waits with the units still listed', Math.round(c3.prepaidFees - c.prepaidFees), Math.round(184000 * 2034 / 2039));
  const cashAfter = 5 * 34810 - 2039 * 9042 - c3.brokerFees - c3.salesTax;
  eq('  and nothing is lost', Math.round(cashAfter + c3.costOfStock + c3.prepaidFees), Math.round(c3.realized));
}

console.log('\n--- positions: each trade and fee counted once, and no made-up costs ---');
{
  const { computePosition, startAfter, laterPosition } = await import('../src/lib/positions.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const S = sanitizeSettings({ override: true, brokerPct: 1.3, taxPct: 3.375 });
  const JITA = 60003760, TYPE = 7;
  const tx = (id, isBuy, qty, price, date) => ({ id, source: 'esi', typeId: TYPE, date, isBuy, qty, unitPrice: price, locationId: JITA });
  const order = (id, isBuy, price, total, remain, state, issued, seen) => ({ orderId: id, typeId: TYPE, isBuy, price, volumeTotal: total, volumeRemain: remain, issued, state, locationId: JITA, ...(seen ? { seen } : {}) });
  const fee = (id, date, amount) => ({ id, date, refType: 'brokers_fee', amount: -amount });
  const P = (id, openedAt, closedAt) => ({ id, typeId: TYPE, openedAt, ...(closedAt ? { closedAt, status: 'closed' } : { status: 'open' }), jitaOnly: true, excluded: [], included: [] });
  // What went in and out, against what the position says it made: nothing lost, nothing counted twice.
  const cashOf = (c) => c.soldValue - c.boughtValue - c.brokerFees - c.salesTax;
  const books = (c) => Math.round(cashOf(c) + c.costOfStock + c.prepaidFees - c.oversoldNet);

  // Overlap. A position closed at 14:53 today and a new one started "from today" (00:00, the default) both
  // cover the morning: the sale at 10:00 and the sell order placed at 09:00 belong to the first, which was
  // trading the item then. Before this, both counted them and the totals had them twice.
  const A = P('a', '2026-09-20T00:00:00Z', '2026-09-27T14:53:00Z'), B = P('b', '2026-09-27T00:00:00Z');
  const ov = {
    txs: {
      b1: tx('b1', true, 10, 100, '2026-09-26T10:00:00Z'),
      s1: tx('s1', false, 10, 150, '2026-09-27T10:00:00Z'),
      b2: tx('b2', true, 5, 100, '2026-09-27T16:00:00Z'),
    },
    orders: {
      1: order(1, true, 100, 10, 0, 'closed', '2026-09-26T09:00:00Z'),
      2: order(2, false, 150, 10, 0, 'closed', '2026-09-27T09:00:00Z'),
      3: order(3, true, 100, 5, 0, 'closed', '2026-09-27T15:30:00Z'),
    },
    journal: { f1: fee('f1', '2026-09-26T09:00:00Z', 100), f2: fee('f2', '2026-09-27T09:00:00Z', 100), f3: fee('f3', '2026-09-27T15:30:00Z', 100) },
    meta: {}, positions: [A, B],
  };
  const cA = computePosition(A, ov, S), cB = computePosition(B, ov, S);
  eq('overlap: the morning sale is the first position’s', [cA.sold, cB.sold], [10, 0]);
  eq('  and so is the sell order placed that morning', [Math.round(cA.brokerFees), Math.round(cB.brokerFees)], [200, 100]);
  eq('  the second shows the sale as another position’s', cB.rows.find((r) => r.tx.id === 's1')?.match, 'elsewhere');
  const whole = { ...ov, positions: [P('c', '2026-09-20T00:00:00Z')] };
  const cC = computePosition(whole.positions[0], whole, S);
  // Each prices its own stock with its own fees, so their profits needn't add up to one position's; the ISK does.
  eq('  the ISK in and out of the two is one position’s over the same days', Math.round(cashOf(cA) + cashOf(cB)), Math.round(cashOf(cC)));
  eq('  and their fees to its fees', Math.round(cA.brokerFees + cB.brokerFees), Math.round(cC.brokerFees));
  eq('  nothing lost on either', [books(cA), books(cB)], [Math.round(cA.realized), Math.round(cB.realized)]);
  const all = { id: 'all:7', typeId: TYPE, openedAt: '2003-05-06T00:00:00Z', status: 'open', jitaOnly: false, excluded: [], included: [] };
  const cAll = computePosition(all, ov, S);
  eq('  Results’ every-trade walk still sees every trade', [cAll.bought, cAll.sold, Math.round(cAll.brokerFees)], [15, 10, 300]);
  const handA = { ...A, included: [] }, handB = { ...B, included: ['s1'] };
  const cHandA = computePosition(handA, { ...ov, positions: [handA, handB] }, S);
  eq('  a trade added by hand goes where it was added', [cHandA.sold, computePosition(handB, { ...ov, positions: [handA, handB] }, S).sold], [0, 10]);

  // New starts can't overlap: after the last close of the item, whatever date was asked for.
  eq('a new start moves to after the last close', startAfter([A], TYPE, '2026-09-27T00:00:00Z'), '2026-09-27T14:53:00Z');
  eq('  a start after it is left alone', startAfter([A], TYPE, '2026-09-28T00:00:00Z'), '2026-09-28T00:00:00Z');
  eq('  other items don’t matter', startAfter([{ ...A, typeId: 8 }], TYPE, '2026-09-27T00:00:00Z'), '2026-09-27T00:00:00Z');
  eq('  moving a start ignores the position itself', startAfter([A], TYPE, '2026-09-21T00:00:00Z', A), '2026-09-21T00:00:00Z');
  eq('  and can’t move a later one back over an earlier one', startAfter([A, B], TYPE, '2026-09-19T00:00:00Z', B), '2026-09-27T14:53:00Z');
  eq('reopening is blocked by a later position of the item', [laterPosition(A, [A, B])?.id, laterPosition(B, [A, B])], ['b', undefined]);

  // A buy order placed the evening before the position's start (from 00:00, the default): 300 filled that
  // evening, 700 after. Its placing fee was dropped entirely, though the 700 counted.
  const pos2 = P('p2', '2026-09-26T00:00:00Z');
  const early = {
    txs: { e1: tx('e1', true, 300, 100, '2026-09-25T21:00:00Z'), e2: tx('e2', true, 700, 100, '2026-09-26T03:00:00Z') },
    orders: { 9: order(9, true, 100, 1000, 0, 'closed', '2026-09-25T20:00:00Z') },
    journal: { f: fee('f', '2026-09-25T20:00:00Z', 1300) }, meta: {}, positions: [pos2],
  };
  const cE = computePosition(pos2, early, S);
  eq('an order placed before the start: the share for units filled since counts', Math.round(cE.brokerFees), 910);
  eq('  in the cost of the stock', Math.round(cE.costOfStock), 70000 + 910);
  eq('  nothing lost', books(cE), Math.round(cE.realized));
  // The same order repriced after the start: `issued` moved into the window, and the whole placing fee counted.
  const repriced = { ...early,
    txs: { e1: early.txs.e1, e2: tx('e2', true, 700, 101, '2026-09-26T03:00:00Z') },
    orders: { 9: order(9, true, 101, 1000, 0, 'closed', '2026-09-26T02:00:00Z', [
      { issued: '2026-09-25T20:00:00Z', price: 100, remain: 1000 }, { issued: '2026-09-26T02:00:00Z', price: 101, remain: 700 }]) },
    journal: { f: fee('f', '2026-09-25T20:00:00Z', 1300), r: fee('r', '2026-09-26T02:00:00Z', 500) } };
  const cR = computePosition(pos2, repriced, S);
  eq('  repriced after the start: the placing share, not the whole fee, plus the change', Math.round(cR.brokerFees), 910 + 500);
  eq('  nothing lost', books(cR), Math.round(cR.realized));
  const gone = { ...early, orders: { 9: order(9, true, 100, 1000, 700, 'cancelled', '2026-09-25T20:00:00Z') }, txs: { e1: early.txs.e1 } };
  eq('  an order over before the start is none of its business', Math.round(computePosition(pos2, gone, S).brokerFees), 0);
  // The user's own case: a sell order placed 90 s before the position started, all its sales excluded by hand.
  const lootSell = { ...early, txs: { ...early.txs, s: tx('s', false, 11, 7790, '2026-09-26T05:00:00Z') },
    orders: { ...early.orders, 10: order(10, false, 7790, 48, 0, 'expired', '2026-09-25T23:58:30Z') }, journal: { ...early.journal, g: fee('g', '2026-09-25T23:58:30Z', 5201) } };
  eq('  nor one whose fills it doesn’t count', Math.round(computePosition({ ...pos2, excluded: ['s'] }, lootSell, S).brokerFees), 910);
  eq('  but it is when it counts them', Math.round(computePosition(pos2, lootSell, S).brokerFees), 910 + 5201);

  // Sold with no recorded buy: the units were costed at their own sale price, a made-up zero.
  const pos3 = P('p3', '2026-09-26T00:00:00Z');
  const loot = { txs: { s: tx('s', false, 10, 150, '2026-09-26T10:00:00Z') }, orders: {}, journal: {}, meta: {}, positions: [pos3] };
  const cL = computePosition(pos3, loot, S);
  eq('sold with no buy: left out of the profit, not given a cost', [cL.realized, cL.oversold, cL.oversoldValue], [0, 10, 1500]);
  const mixed = { ...loot, txs: { b: tx('b', true, 5, 100, '2026-09-26T09:00:00Z'), s: tx('s', false, 8, 150, '2026-09-26T10:00:00Z') } };
  const cM = computePosition(pos3, mixed, S);
  eq('  of 8 sold with 5 bought, the 5 count, with their share of the tax', Math.round(cM.realized), Math.round(5 * 150 - 500 - 8 * 150 * 0.03375 * 5 / 8));
  eq('  and the other 3 are said apart', [cM.oversold, cM.oversoldValue], [3, 450]);
  eq('  nothing lost', books(cM), Math.round(cM.realized));
}

console.log('\n--- does it come true: place and leave, the Sniper ---');
{
  const { leaveOutcome, leaveRatio, snipeOutcome, LEAVE_DAYS } = await import('../src/lib/track.ts');
  const H = 3600_000, D = 24 * H, T0 = Date.parse('2026-09-28T12:00:00Z');
  // A left bid for 1,000 expected to fill 100 a day.
  const row = { at: T0, remain0: 1000, remain: 1000, seenAt: T0, pred: 100 };
  eq('left order: still left at its price, undecided', leaveOutcome(row, { price: 50, volumeRemain: 900, left: true }, undefined, 50, T0 + 2 * D), null);
  const moved = leaveOutcome({ ...row, remain: 700, seenAt: T0 + 3 * D }, { price: 51, volumeRemain: 700, left: true }, undefined, 50, T0 + 3 * D + H);
  eq('  a new price closes it with what filled until then', moved, { outcome: 'checked', filled: 300, days: 3 });
  eq('  which is exactly the pace expected', leaveRatio(moved, 100), 1);
  eq('  under a day says nothing about a daily model', leaveOutcome({ ...row, remain: 990, seenAt: T0 + 5 * H }, { price: 51, volumeRemain: 990, left: true }, undefined, 50, T0 + 6 * H).outcome, 'void');
  eq('  no longer left alone closes it too', leaveOutcome({ ...row, remain: 800, seenAt: T0 + 2 * D }, { price: 50, volumeRemain: 800, left: false }, undefined, 50, T0 + 2 * D).filled, 200);
  eq('  after 14 days it is checked with what is left now', leaveOutcome(row, { price: 50, volumeRemain: 600, left: true }, undefined, 50, T0 + LEAVE_DAYS * D), { outcome: 'checked', filled: 400, days: LEAVE_DAYS });
  eq('  gone from the book, record still open: undecided', leaveOutcome({ ...row, seenAt: T0 + 2 * D }, undefined, { state: 'open', volumeRemain: 1000 }, 50, T0 + 2 * D + H), null);
  eq('  sold out: all of it, by the last time it was seen', leaveOutcome({ ...row, remain: 40, seenAt: T0 + 4 * D }, undefined, { state: 'closed', volumeRemain: 0 }, 50, T0 + 4 * D + H), { outcome: 'checked', filled: 1000, days: 4 });

  // The Sniper said relist at 1,000 on the 28th. Days after that one count, up to seven.
  const seen = Date.parse('2026-09-28T01:16:00Z');
  const rows = [{ date: '2026-09-28', highest: 1200 }, { date: '2026-09-30', highest: 990 }, { date: '2026-10-02', highest: 1001 }];
  eq('snipe: reached on the fourth day after (the day itself doesn’t count)', snipeOutcome(seen, 1000, rows, Date.parse('2026-10-03T12:00:00Z')), { outcome: 'reached', days: 4 });
  eq('  not reached yet, and the week isn’t in: undecided', snipeOutcome(seen, 1100, rows, Date.parse('2026-10-03T12:00:00Z')), null);
  eq('  not reached in the week: not', snipeOutcome(seen, 1100, rows, Date.parse('2026-10-07T12:00:00Z')), { outcome: 'not', days: null });
  eq('  a high after the week doesn’t count', snipeOutcome(seen, 1100, [...rows, { date: '2026-10-06', highest: 2000 }], Date.parse('2026-10-07T12:00:00Z')).outcome, 'not');

  const { leaveSaid, shareOver } = await import('../src/lib/track.ts');
  eq('left orders: nothing said from four', leaveSaid({ checked: 4, medianRatio: 0.4, none: 0 }), null);
  eq('  from five, the pace against what was expected', leaveSaid({ checked: 6, medianRatio: 0.42, none: 2 }),
    'Checked on your left orders over 30 days: they filled at about 0.4× the pace the planner expects (the middle of 6; 2 filled nothing).');
  eq('  close to it says so', leaveSaid({ checked: 5, medianRatio: 1.1, none: 0 }).includes('close to the pace'), true);
  const measured = { day: '2026-09-28', buyMedian: 0.012, sellMedian: 0.058, buyDays: 20, sellDays: 40, suggested: 2.5, setting: 10 };
  eq('share: a 10% setting against a measured 2.5% is 4× too big', shareOver(measured, 10), 4);
  eq('  nothing to say before a measurement suggests anything', shareOver({ ...measured, suggested: null }, 10), null);
}

console.log('\n--- asset safety ---');
{
  const { countStock, mergeSafety, nameHolders, unnamedHolders, bayOf } = await import('../src/lib/esiRecords.ts');
  const JITA = 60003760;
  // The user's wrap as ESI reported it (28 September 2026): the wrap flagged AssetSafety at location 2004, ships and
  // Station Containers inside it, and here a ship's fitting and a container's contents one level deeper.
  const A = (item_id, type_id, location_id, location_flag, location_type, quantity = 1) => ({ item_id, type_id, location_id, location_flag, location_type, quantity });
  const raw = [
    A(1055765149463, 60, 2004, 'AssetSafety', 'other'),
    A(1044914025438, 2006, 1055765149463, 'Hangar', 'item'),              // Omen
    A(1044795389103, 16233, 1055765149463, 'Hangar', 'item'),             // Prophecy
    A(1044519007308, 17366, 1055765149463, 'Hangar', 'item'),             // Station Container
    A(9001, 2185, 1044519007308, 'Unlocked', 'item', 5),                  // five drones in the container
    A(9002, 3001, 1044914025438, 'HiSlot0', 'item'),                      // a module fitted to the Omen
    A(9003, 34, JITA, 'Hangar', 'station', 1000),                         // ordinary Jita stock
    A(9004, 587, JITA, 'Hangar', 'station'),                              // a ship in Jita
    A(9005, 2046, 9004, 'HiSlot0', 'item'),                               // fitted to it
  ];
  const s = countStock(raw, JITA);
  eq('the wrap: waiting, everything inside it at any depth', [s.safety.length, s.safety[0].id, s.safety[0].state, s.safety[0].stationId, s.safety[0].items], [1, 1055765149463, 'waiting', null, { 2006: 1, 16233: 1, 17366: 1, 2185: 5, 3001: 1 }]);
  // The user asked to open the station containers in the list and see what's in them: kept as packed too.
  eq('  and as packed: the ship and the container with what’s in them', s.safety[0].holders, [
    { id: 1044914025438, typeId: 2006, items: { 3001: 1 }, contents: [{ typeId: 3001, q: 1, bay: 'Fitted' }] },
    { id: 1044519007308, typeId: 17366, items: { 2185: 5 }, contents: [{ typeId: 2185, q: 5 }] },
  ]);
  eq('  a ship with nothing in it lies loose', [s.safety[0].loose, s.safety[0].contents], [{ 16233: 1 }, [{ typeId: 16233, q: 1 }]]);
  // List loot reads the Jita hangar: the user's fitted Jackdaw and their Station Vault Containers with things in them
  // came up as loot to list (29 September 2026). They still count as stock; `holding` says which can't be sold as they are.
  eq('a fitted ship in the Jita hangar is stock, and marked as holding things', [s.jita[587], s.holding], [1, { 587: 1 }]);
  eq('  what’s fitted to a ship is counted, in the wrap or not; what’s in a container isn’t', s.fitted, { 3001: 1, 2046: 1 });
  // The user's Station Vault Containers: "I am using those". Assembled ones are counted apart (ESI's is_singleton).
  const vaults = countStock([{ ...A(9020, 17367, JITA, 'Hangar', 'station'), is_singleton: true }, A(9021, 17367, JITA, 'Hangar', 'station')], JITA);
  eq('  an assembled container is stock, and counted as assembled; a packaged one isn’t', [vaults.jita[17367], vaults.assembled], [2, { 17367: 1 }]);
  const cargo = countStock([...raw, A(9010, 3465, 1044914025438, 'Cargo', 'item'), A(9011, 34, 9010, 'Unlocked', 'item', 700)], JITA);
  eq('  a container in a ship’s cargo opens inside the ship, in its cargo hold', cargo.safety[0].holders[0], { id: 1044914025438, typeId: 2006, items: { 3001: 1 }, contents: [{ typeId: 3001, q: 1, bay: 'Fitted' }], holders: [{ id: 9010, typeId: 3465, items: { 34: 700 }, contents: [{ typeId: 34, q: 700 }], bay: 'Cargo hold' }] });
  // The user's wrap as ESI sent it at 18:07 UTC: "Equipment", a Station Container holding five blueprint copies and
  // nothing else, read as 0 inside, since copies are left out of every count; and ships' cargo and drones mixed in
  // with their fitting. A packaged ship (is_singleton false, their Sigil) can hold nothing, and ESI lists nothing in it.
  const theirs = countStock([
    A(1055765149463, 60, 2004, 'AssetSafety', 'other'),
    A(1044519007308, 17366, 1055765149463, 'Hangar', 'item'),
    { ...A(1044860817684, 47971, 1044519007308, 'Unlocked', 'item'), is_blueprint_copy: true },
    { ...A(1044884637797, 31032, 1044519007308, 'Unlocked', 'item'), is_blueprint_copy: true },
    A(1044795389103, 16233, 1055765149463, 'Hangar', 'item'),
    A(9101, 3001, 1044795389103, 'HiSlot0', 'item'), A(9102, 3001, 1044795389103, 'HiSlot1', 'item'),
    A(9103, 12818, 1044795389103, 'HiSlot0', 'item', 8),                    // charges loaded in the gun
    A(9104, 34, 1044795389103, 'Cargo', 'item', 4000), A(9105, 2185, 1044795389103, 'DroneBay', 'item', 5),
    A(1049387784911, 19744, 1055765149463, 'Hangar', 'item'),
  ], JITA);
  const equip = theirs.safety[0].holders.find((h) => h.typeId === 17366);
  eq('  a container of nothing but blueprint copies lists them, as copies', [equip.items, equip.contents], [{}, [{ typeId: 47971, q: 1, copy: true }, { typeId: 31032, q: 1, copy: true }]]);
  eq('  but they still count for nothing in the flat list', [theirs.safety[0].items[47971], theirs.total[47971]], [undefined, undefined]);
  const chicken = theirs.safety[0].holders.find((h) => h.typeId === 16233);
  eq('  a ship’s things by where they sit: fitted (loaded charges too), cargo hold, drone bay', chicken.contents,
    [{ typeId: 3001, q: 2, bay: 'Fitted' }, { typeId: 12818, q: 8, bay: 'Fitted' }, { typeId: 34, q: 4000, bay: 'Cargo hold' }, { typeId: 2185, q: 5, bay: 'Drone bay' }]);
  eq('  the packaged Sigil lies loose, holding nothing', theirs.safety[0].loose, { 19744: 1 });
  eq('ESI’s flags as the game names the bays', ['Hangar', 'Unlocked', 'LoSlot4', 'RigSlot0', 'SubSystemSlot2', 'Cargo', 'DroneBay', 'FighterTube2', 'SpecializedOreHold', 'FleetHangar', 'QuafeBay'].map(bayOf),
    [undefined, undefined, 'Fitted', 'Fitted', 'Fitted', 'Cargo hold', 'Drone bay', 'Fighter bay', 'Ore hold', 'Fleet hangar', 'Quafe bay']);
  eq('  and still counts in the flat list', [cargo.safety[0].items[3465], cargo.safety[0].items[34]], [1, 700]);
  eq('the containers and ships to ask names for', unnamedHolders(undefined, cargo.safety), [1044914025438, 9010, 1044519007308]);
  const named = nameHolders(cargo.safety, new Map([[1044519007308, 'Minerals'], [9010, 'None'], [1044914025438, ' ']]));
  eq('  named as you named them; ESI’s “None” and blanks are no name', [named[0].holders[0].name, named[0].holders[0].holders[0].name, named[0].holders[1].name], [undefined, undefined, 'Minerals']);
  eq('  a name known already isn’t asked again', unnamedHolders(named, cargo.safety), [1044914025438, 9010]);
  const kept = mergeSafety(named, cargo.safety);
  eq('  and carries over to the next read', kept[0].holders[1].name, 'Minerals');
  eq('  unless the next read brings a new one', mergeSafety(named, nameHolders(cargo.safety, new Map([[1044519007308, 'Ore']]))) [0].holders[1].name, 'Ore');
  eq('  its contents count as yours, the wrap itself doesn’t', [s.total[2006], s.total[2185], s.total[60]], [1, 5, undefined]);
  eq('  but not as inside ships and containers: only the Jita ship’s fitting is', s.nested, { 2046: 1 });
  eq('  nor as containers somewhere unknown', s.inContainers, 1);
  eq('  and Jita stock is untouched', s.jita, { 34: 1000, 587: 1 });
  const delivered = countStock(raw.map((a) => (a.item_id === 1055765149463 ? A(a.item_id, 60, 60008494, 'Hangar', 'station') : a)), JITA);
  eq('delivered: the wrap in a station hangar', [delivered.safety[0].state, delivered.safety[0].stationId, delivered.byLocation[60008494]], ['delivered', 60008494, undefined]);
  // What the cloud learned is carried forward by either writer; the cloud's own record wins.
  const prev = [{ ...s.safety[0], name: 'K7D-II - Iserlohn Fortress', firstSeen: '2026-09-28T16:12:11Z', startKnown: false }];
  eq('carried forward: the name, when first seen, whether its start is known', mergeSafety(prev, s.safety)[0], { ...s.safety[0], name: 'K7D-II - Iserlohn Fortress', firstSeen: '2026-09-28T16:12:11Z', startKnown: false });
  const k = new Map([[1055765149463, { firstSeen: '2026-09-28T16:12:11Z', startKnown: false, deliveredAt: '2026-10-13T00:00:00Z' }]]);
  eq('  a delivery date only once delivered', [mergeSafety(prev, s.safety, k)[0].deliveredAt, mergeSafety(prev, delivered.safety, k)[0].deliveredAt], [undefined, '2026-10-13T00:00:00Z']);
  eq('  a stock read without wraps kept has none', mergeSafety(prev, undefined), undefined);

  const { categoryOf: catOf } = await import('../src/lib/wallet.ts');
  eq('unpacking a delivered wrap is its own cost in the Wallet, not “Other”', catOf({ refType: 'asset_safety_recovery_tax', amount: -1_500_000 })?.label, 'Asset safety fee');
  const { parseCountdown, formatCountdown, safetyTimes, unpackCost, holderWorth } = await import('../src/lib/assetSafety.ts');
  const hp = { 2006: 10e6, 3001: 1e6, 3465: 5000, 34: 4 };
  eq('a ship with everything in it: itself, its fitting, a container and what’s in that', holderWorth(cargo.safety[0].holders[0], (id) => hp[id]), { value: 10e6 + 1e6 + 5000 + 2800, inside: 702, priced: true });
  eq('  nothing priced says so', holderWorth({ id: 1, typeId: 999, items: { 998: 3 } }, () => undefined), { value: 0, inside: 3, priced: false });
  eq('  blueprint copies count as inside, but for nothing', holderWorth(equip, (id) => ({ 17366: 30000, 47971: 9e6 })[id]), { value: 30000, inside: 2, priced: true });
  const D = 86400_000, H = 3600_000;
  eq('the countdown as the client shows it', parseCountdown('14d 7h 24m 32s'), 14 * D + 7 * H + 24 * 60_000 + 32_000);
  {
    // EVE's notification when things go into asset safety, as the goesi library declares its fields (YAML, FILETIME).
    const { parseSafetyNotice, withNotices, fromFiletime } = await import('../src/lib/assetSafety.ts');
    const { mergeSafety } = await import('../src/lib/esiRecords.ts');
    const ft = (iso) => (Date.parse(iso) + 11_644_473_600_000) * 10_000;
    eq('FILETIME ticks as a time', new Date(fromFiletime(ft('2026-10-18T09:30:00Z'))).toISOString(), '2026-10-18T09:30:00.000Z');
    const text = ['assetSafetyDurationFull: 1728000000000', 'assetSafetyDurationMinimum: 432000000000', `assetSafetyFullTimestamp: ${ft('2026-10-18T09:30:00Z')}`,
      `assetSafetyMinimumTimestamp: ${ft('2026-10-03T09:30:00Z')}`, 'isCorpOwned: false', 'newStationID: 60012526', 'solarsystemID: 30002659',
      'structureID: &id001 1035466617946', "structureLink: '<a href=\"showinfo:35832//1035466617946\">K7D-II - Iserlohn Fortress</a>'",
      'structureShowInfoData:', '- showinfo', '- 35832', '- *id001', 'structureTypeID: 35832'].join('\n');
    const note = parseSafetyNotice({ type: 'StructureItemsMovedToSafety', timestamp: '2026-09-28T09:30:00Z', text });
    eq('the notice read: when, the structure, the system, the destination', note, { at: '2026-09-28T09:30:00Z', manualAt: '2026-10-03T09:30:00.000Z', autoAt: '2026-10-18T09:30:00.000Z',
      structureId: 1035466617946, structure: 'K7D-II - Iserlohn Fortress', systemId: 30002659, stationId: 60012526 });
    eq('  not another kind, a corporation’s, or one without dates', [parseSafetyNotice({ type: 'StructureItemsDelivered', timestamp: 'x', text }),
      parseSafetyNotice({ type: 'StructureItemsMovedToSafety', timestamp: 'x', text: text.replace('isCorpOwned: false', 'isCorpOwned: true') }),
      parseSafetyNotice({ type: 'StructureItemsMovedToSafety', timestamp: 'x', text: 'isCorpOwned: false' })], [null, null, null]);
    const wrap = (id, extra = {}) => ({ id, state: 'waiting', stationId: null, items: {}, ...extra });
    const now = Date.parse('2026-09-29T10:00:00Z');
    const one = withNotices([wrap(5)], [note], now);
    eq('one wrap waiting, one notice: paired, and the wrap takes the structure’s name', [one[0].notice.autoAt, one[0].name], ['2026-10-18T09:30:00.000Z', 'K7D-II - Iserlohn Fortress']);
    eq('  which the dates then come from', safetyTimes(one[0], { autoAt: '2026-10-01T00:00:00Z' }), { autoAt: Date.parse('2026-10-18T09:30:00Z'), manualAt: Date.parse('2026-10-03T09:30:00Z'), from: 'notice' });
    const later = { ...note, at: '2026-09-29T08:00:00Z', structure: 'Other' };
    eq('  two and two: in the order they went in', withNotices([wrap(9), wrap(3)], [later, note], now).map((w) => [w.id, w.name]), [[9, 'Other'], [3, 'K7D-II - Iserlohn Fortress']]);
    eq('  two wraps, one notice: only the one the cloud saw appear within three hours after it',
      withNotices([wrap(3, { firstSeen: '2026-09-20T00:00:00Z' }), wrap(9, { firstSeen: '2026-09-28T11:07:00Z' })], [note], now).map((w) => w.name ?? null), [null, 'K7D-II - Iserlohn Fortress']);
    eq('  a notice long past its date, or a delivered wrap, pairs with nothing', [withNotices([wrap(5)], [{ ...note, autoAt: '2026-09-01T00:00:00Z' }], now)[0].notice, withNotices([wrap(5, { state: 'delivered' })], [note], now)[0].notice], [undefined, undefined]);
    eq('  and the next read of your assets keeps it', mergeSafety(one, [wrap(5)])[0].notice?.structure, 'K7D-II - Iserlohn Fortress');
  }
  eq('  near enough is fine', [parseCountdown('14d 7h'), parseCountdown(' 3 h 5 m '), parseCountdown('2D')], [14 * D + 7 * H, 3 * H + 5 * 60_000, 2 * D]);
  eq('  anything else isn’t one', [parseCountdown(''), parseCountdown('soon'), parseCountdown('14'), parseCountdown('14d then')], [null, null, null, null]);
  eq('shown back the client’s way, zero units dropped from the front', [formatCountdown(14 * D + 7 * H + 24 * 60_000 + 32_000), formatCountdown(7 * H + 5_000), formatCountdown(-1)], ['14d 7h 24m 32s', '7h 0m 5s', '0s']);
  const typedAt = '2026-10-12T23:36:00Z';
  eq('typed: delivered then, and by hand from 15 days before', safetyTimes({ startKnown: false }, { autoAt: typedAt }), { autoAt: Date.parse(typedAt), manualAt: Date.parse(typedAt) - 15 * D, from: 'typed' });
  eq('seen going in: 5 and 20 days from then', safetyTimes({ startKnown: true, firstSeen: '2026-10-01T00:00:00Z' }), { autoAt: Date.parse('2026-10-21T00:00:00Z'), manualAt: Date.parse('2026-10-06T00:00:00Z'), from: 'seen' });
  eq('  seen but not going in: unknown', safetyTimes({ startKnown: false, firstSeen: '2026-10-01T00:00:00Z' }), { autoAt: null, manualAt: null, from: null });
  eq('unpacking: 15% after the automatic delivery, 0.5% by hand, of CCP’s estimate', unpackCost({ 2006: 1, 3001: 2, 99: 1 }, (id) => ({ 2006: 1_000_000, 3001: 50_000 })[id]),
    { value: 1_100_000, auto: 165_000, manual: 5_500, unpriced: [99] });
}

console.log('\n--- a private ledger: the owner only ---');
{
  const { isOwner, OWNER_CHARS } = await import('../src/lib/constants.ts');
  eq('the owner’s character is let in', [isOwner(95210486), OWNER_CHARS.includes(95210486)], [true, true]);
  eq('  anyone else, or nobody, isn’t', [isOwner(12345), isOwner(null), isOwner(undefined)], [false, false, false]);
}

console.log('\n--- the light page a mail’s item link opens ---');
{
  const { openLink, parseMarket } = await import('../src/lib/openLink.ts');
  const back = (u) => parseMarket(new URL(u).searchParams.get('market'));
  eq('the link carries the ID and the name in one parameter, no &', openLink('https://x/jita-ledger/', 2185, 'Hammerhead II'), 'https://x/jita-ledger/open.html?market=2185~Hammerhead%20II');
  eq('  and reads back as it went in', back(openLink('https://x/', 2185, 'Hammerhead II')), { typeId: 2185, name: 'Hammerhead II' });
  eq('  names with quotes, tildes and ampersands survive', back(openLink('https://x/', 1, '\'Augmented\' A&B ~ C')), { typeId: 1, name: '\'Augmented\' A&B ~ C' });
  eq('  no name is fine', [openLink('https://x/', 34), back(openLink('https://x/', 34))], ['https://x/open.html?market=34', { typeId: 34, name: null }]);
  eq('  nonsense is nothing', [parseMarket('abc'), parseMarket(''), parseMarket(null), parseMarket('0')], [null, null, null, null]);
}

console.log('\n--- the cloud watchdog ---');
{
  const { watchdogFinding, isDowntime, loginError } = await import('../src/lib/watchdog.ts');
  const { alertMail } = await import('../src/lib/alerts.ts');
  const T = Date.parse('2026-09-28T14:00:00Z'), H = 3600_000;
  const row = { job: 'archive', fails: 2, failingSince: T - H, lastError: 'ESI 502', warned: null };
  eq('one failure is ESI having a moment', watchdogFinding({ ...row, fails: 1 }, T), null);
  const f = watchdogFinding(row, T);
  eq('the second in a row is mailed', [f.kind, f.key], ['watchdog', `watchdog:archive:${T - H}`]);
  eq('  not again the same day', watchdogFinding({ ...row, fails: 5, warned: T - 3 * H }, T), null);
  eq('  but again a day on, still failing', watchdogFinding({ ...row, fails: 30, warned: T - 25 * H }, T)?.kind, 'watchdog');
  eq('EVE’s downtime doesn’t count', [isDowntime(Date.parse('2026-09-28T11:05:00Z')), isDowntime(Date.parse('2026-09-28T10:50:00Z')), isDowntime(Date.parse('2026-09-28T11:31:00Z'))], [true, false, false]);
  eq('a login the cloud can’t use is told apart', [loginError('invalid_grant'), loginError('ESI 502'), loginError(null)], [true, false, false]);
  const m = alertMail([f], { appUrl: 'https://x/', keepMin: 60, now: T });
  eq('the mail: its subject', m.subject, 'Jita Ledger: cloud: copying your ledger from ESI failing');
  eq('  says to wait when it retries on its own', m.body.includes('RECOMMENDED: nothing yet: it tries again every hour'), true);
  eq('  and what has stopped meanwhile', m.body.includes('new trades, journal entries and orders aren’t copied'), true);
  const login = alertMail([watchdogFinding({ ...row, lastError: 'Token refresh failed: invalid_grant' }, T)], { appUrl: 'https://x/', keepMin: 60, now: T });
  eq('  and to log in again when that is what is wrong', login.body.includes('RECOMMENDED: hand the cloud your login again'), true);

  // A refused login is one mail (29 September 2026: three came over two hours, one per job, for one refused login).
  const { loginLostFinding, errorPredatesLogin, scopesMissing, LOGIN_GRACE_MS } = await import('../src/lib/watchdog.ts');
  const refused = { purpose: 'main', name: 'FIREDASH Visagie', since: T - 30 * 60_000, reason: 'Invalid refresh token. Character grant missing/expired.', warned: null };
  const lost = loginLostFinding(refused, T);
  eq('a refused login is mailed once it has lasted', [lost?.key, lost?.title], [`watchdog:login:main:${T - 30 * 60_000}`, 'Cloud lost your login']);
  eq('  not in its first minutes: every round tries again', loginLostFinding({ ...refused, since: T - LOGIN_GRACE_MS + 60_000 }, T), null);
  eq('  not during EVE’s downtime', loginLostFinding({ ...refused, since: Date.parse('2026-09-28T10:30:00Z') }, Date.parse('2026-09-28T11:10:00Z')), null);
  eq('  not again the same day', loginLostFinding({ ...refused, warned: T - 3 * H }, T), null);
  eq('  but again a day on', loginLostFinding({ ...refused, warned: T - 25 * H }, T)?.kind, 'watchdog');
  eq('  never the sender’s: it couldn’t send the mail that says so', loginLostFinding({ ...refused, purpose: 'mailer' }, T), null);
  const lm = alertMail([lost], { appUrl: 'https://x/', keepMin: 60, now: T });
  eq('  its subject says what to do', lm.subject, 'Jita Ledger: hand the cloud your login again');
  eq('  its body names the login, what EVE said and what has stopped', [
    lm.body.includes('RECOMMENDED: hand the cloud your login for FIREDASH Visagie again'), lm.body.includes('Character grant missing/expired'), lm.body.includes('your ledger isn’t copied from ESI'),
  ], [true, true, true]);
  eq('the error the cloud now gives is a login error', loginError('EVE refused the cloud’s login for FIREDASH Visagie (Invalid refresh token.); hand the cloud your login again'), true);
  const job = { lastRun: T - H, lastError: 'EVE refused the login (Invalid refresh token.); log in for the cloud again' };
  eq('a login error from before the login worked again is old news', errorPredatesLogin(job, [{ at: T - 10 * 60_000, refusedAt: null }]), true);
  eq('  not while the login is still refused', errorPredatesLogin(job, [{ at: T - 10 * 60_000, refusedAt: T - 5 * 60_000 }]), false);
  eq('  not when the login last worked before the failure', errorPredatesLogin(job, [{ at: T - 2 * H, refusedAt: null }]), false);
  eq('  and never for an error that isn’t about the login', errorPredatesLogin({ ...job, lastError: 'ESI 502' }, [{ at: T, refusedAt: null }]), false);
  eq('permissions the app has that the cloud lacks', scopesMissing(['a', 'b', 'c'], ['a', 'c']), ['b']);
  eq('  nothing said when the Worker doesn’t report them', scopesMissing(['a'], undefined), []);

  const { judgeCloudLogin } = await import('../src/lib/todo.ts');
  const e = { item: { key: 'cloudLogin:main' }, seenAt: T, lastAt: T };
  eq('To do: a refused login isn’t done because it went missing', judgeCloudLogin(e, { readAt: T, kept: true, refused: false }), null);
  eq('  done on a newer read that finds it working', judgeCloudLogin(e, { readAt: T + 60_000, kept: true, refused: false }), 'The cloud has your login again.');
  eq('  and just gone when the login was dropped instead', judgeCloudLogin(e, { readAt: T + 60_000, kept: false, refused: false }), false);
  const { judgeAltLogin } = await import('../src/lib/todo.ts');
  const ea = { item: { key: 'cloudLogin:alt:900001' }, seenAt: T, lastAt: T };
  eq('To do, an alt\'s login: not done on the read that showed it, nor on one not read this session', [judgeAltLogin(ea, { live: true, readAt: T, state: 'refused' }), judgeAltLogin(ea, { live: false, readAt: T + 60_000, state: 'working' }), judgeAltLogin(ea, { live: true, readAt: null, state: null })], [null, null, null]);
  eq('  still refused on a newer read: still open', judgeAltLogin(ea, { live: true, readAt: T + 60_000, state: 'refused' }), null);
  eq('  working on a newer read: done; gone from the roster on one: done too', [judgeAltLogin(ea, { live: true, readAt: T + 60_000, state: 'working' }), judgeAltLogin(ea, { live: true, readAt: T + 60_000, state: null })], ['The cloud has this login again.', 'No longer one of your characters.']);
  const { needs, inFilter, tickAll } = await import('../src/lib/todo.ts');
  eq('To do filter: warnings are for information, everything else needs action', ['move', 'scam', 'squeeze', 'backup', 'cloudLogin', 'piEnding'].map(needs), ['act', 'info', 'info', 'act', 'act', 'act']);
  eq('  all shows both', [inFilter('scam', 'all'), inFilter('move', 'act'), inFilter('move', 'info')], [true, true, false]);
  const mem = { a: { item: { key: 'a', ver: '1' }, seenAt: T, lastAt: T }, b: { item: { key: 'b', ver: '2' }, seenAt: T, lastAt: T, done: { at: T, how: 'x' } }, c: { item: { key: 'c', ver: '3' }, seenAt: T, lastAt: T, ticked: { ver: '3', at: T - 5 } } };
  const ticked = tickAll(mem, ['a', 'b', 'c', 'z'], T + 1);
  eq('  mark all ticks what’s open as its box would, and leaves the done, the already ticked and the unknown alone',
    [ticked.a.ticked, ticked.b.ticked, ticked.c.ticked.at, 'z' in ticked], [{ ver: '1', at: T + 1 }, undefined, T - 5, false]);
}

console.log('\n--- a finished position: close it, don’t lose it ---');
{
  const { computePosition, finishedPosition } = await import('../src/lib/positions.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const S = sanitizeSettings({ override: true, brokerPct: 1.3, taxPct: 3.375 });
  const JITA = 60003760;
  const order = (id, typeId, isBuy, price, total, remain, state, issued) => ({ orderId: id, typeId, isBuy, price, volumeTotal: total, volumeRemain: remain, issued, state, locationId: JITA });
  const pos = (typeId) => ({ id: 'p' + typeId, typeId, openedAt: '2026-09-26T00:00:00Z', status: 'open', jitaOnly: true, excluded: [], included: [] });
  // The user's Syndicate Gas Cloud Scoop: a buy for 2 at 99.79 M, cancelled with nothing filled. The app first
  // saw it just after a price change, whose 523,843 fee is in the journal to the second; the placing fee
  // before that was never matched, so it is estimated at the broker rate. Together, the cost of backing out.
  const scoop = { txs: {}, meta: {},
    orders: { 7430171495: order(7430171495, 28788, true, 99790000, 2, 2, 'cancelled', '2026-09-26T16:28:52Z') },
    journal: { f: { id: 'f', date: '2026-09-26T16:28:52Z', refType: 'brokers_fee', amount: -523843.05 } } };
  const c = computePosition(pos(28788), scoop, S);
  eq('backing out of an unfilled buy costs its fees: the price change, and the placing fee estimated', Math.round(c.realized), -Math.round(0.013 * 99790000 * 2 + 523843.05));
  eq('  the price change is the journal’s own figure', [Math.round(c.relistFees), c.relistsEstimated, c.brokerEstimatedOrders], [523843, 0, 1]);
  eq('  and the position is finished: backed out', finishedPosition(pos(28788), c, Object.values(scoop.orders)), 'backedOut');
  const reopened = [...Object.values(scoop.orders), order(2, 28788, true, 99800000, 2, 2, 'open', '2026-09-27T10:00:00Z')];
  eq('  not while another order on the item is open', finishedPosition(pos(28788), c, reopened), null);
  eq('  and a closed one is never flagged', finishedPosition({ ...pos(28788), status: 'closed' }, c, Object.values(scoop.orders)), null);
  eq('a position with nothing placed yet is not finished', finishedPosition(pos(34), { bought: 0, sold: 0, stock: 0, brokerFees: 0 }, []), null);
  eq('sold out, or dumped into bids, with no order open', finishedPosition(pos(34), { bought: 10, sold: 10, stock: 0, brokerFees: 50 }, [order(1, 34, false, 5, 10, 0, 'closed', '2026-09-26T10:00:00Z')]), 'soldOut');
  eq('stock left in the hangar is not finished', finishedPosition(pos(34), { bought: 10, sold: 4, stock: 6, brokerFees: 50 }, []), null);
}

console.log('\n--- goals ---');
{
  const G = await import('../src/lib/goals.ts');
  const NOW = Date.parse('2026-09-27T12:00:00Z');
  const t0 = '2026-09-01T00:00:00Z';
  const tx = (date, isBuy, qty, typeId = 44992) => ({ typeId, date, isBuy, qty, source: 'esi' });
  const base = (over = {}) => ({
    now: NOW,
    funds: { wallet: 1e9, liquid: 1.5e9, nw: 3e9 }, growth: { wallet: 50e6, liquid: null, nw: 20e6 },
    price: (id) => (id === 44992 ? 5e6 : null), held: () => 12, txs: [],
    earned: () => 0, skill: () => null, ...over,
  });

  eq('old wallet goals are read as ISK goals', G.normalizeGoal({ id: 'a', label: 'x', kind: 'nw', target: 5 }).measure, 'nw');
  eq('junk is dropped', G.normalizeGoal({ kind: 'afford', typeId: 0 }), null);
  eq('PLEX bought since the goal counts, sold PLEX comes off, earlier buys do not',
    G.netBought([tx('2026-08-01T00:00:00Z', true, 99), tx('2026-09-05T00:00:00Z', true, 120), tx('2026-09-10T00:00:00Z', false, 20)], 44992, Date.parse(t0)), 100);

  // Afford 500 PLEX at 5 M each, with 100 already bought on the market since the goal was set.
  const aff = { id: 'p', label: '500 PLEX', createdAt: t0, kind: 'afford', typeId: 44992, qty: 500, measure: 'wallet' };
  let p = G.goalProgress(aff, base({ txs: [tx('2026-09-05T00:00:00Z', true, 100)] }));
  eq('afford: what is bought comes off what is left', [p.acquired, p.remaining], [100, 400]);
  eq('  and what is left is priced live', p.costLeft, 400 * 5e6);
  eq('  2 B needed, 1 B in the wallet: not yet', p.affordable, false);
  eq('  progress counts what the wallet would buy too', p.frac, (100 + 200) / 500);
  eq('  ETA from how fast the wallet grows', p.etaDays, 1e9 / 50e6);
  p = G.goalProgress(aff, base({ funds: { wallet: 2.5e9, liquid: null, nw: null }, txs: [tx('2026-09-05T00:00:00Z', true, 100)] }));
  eq('  once the wallet covers the rest, it can be bought now', [p.affordable, p.etaDays], [true, 0]);
  eq('  but it is not done until it is bought', p.done, false);
  p = G.goalProgress(aff, base({ txs: [tx('2026-09-05T00:00:00Z', true, 500)] }));
  eq('  buying all of it finishes it', [p.done, p.frac], [true, 1]);
  p = G.goalProgress(aff, base({ price: () => null }));
  eq('  no price, no claim', [p.missing, p.affordable], ['price', false]);

  // Hold: PLEX from a count plus market trades; anything else from hangars and sell orders.
  const holdPlex = { id: 'h', label: '', createdAt: t0, kind: 'hold', typeId: 44992, qty: 500, startCount: 150 };
  p = G.goalProgress(holdPlex, base({ txs: [tx('2026-09-05T00:00:00Z', true, 50)] }));
  eq('hold PLEX: your count plus what you have bought since', p.have, 200);
  const holdItem = { id: 'i', label: '', createdAt: t0, kind: 'hold', typeId: 40520, qty: 20 };
  eq('hold an item: from hangars and orders', G.goalProgress(holdItem, base()).have, 12);
  eq('  without the assets permission it says so', G.goalProgress(holdItem, base({ held: () => null })).missing, 'assets');

  // ISK with a deadline: the pace it needs against the pace it has.
  const isk = { id: 'k', label: '', createdAt: t0, kind: 'isk', measure: 'wallet', target: 2e9, deadline: '2026-10-07T12:00:00Z' };
  p = G.goalProgress(isk, base());
  eq('isk: half way', p.frac, 0.5);
  eq('  needs 100 M a day to make a deadline ten days out', Math.round(p.needPerDay), 100e6);
  eq('  and at 50 M a day it will not', G.onPace(p), false);
  eq('no history for a measure, no ETA', G.goalProgress({ ...isk, measure: 'liquid' }, base()).etaDays, null);

  // Earn: counted from its start, paced over the days since.
  const earn = { id: 'e', label: '', createdAt: t0, kind: 'earn', source: 'trading', target: 1e9, from: '2026-09-17T12:00:00Z' };
  p = G.goalProgress(earn, base({ earned: (src, from, to) => (src === 'trading' && to === NOW ? 400e6 : 0) }));
  eq('earn: what was made since the start', p.have, 400e6);
  eq('  at 40 M a day over ten days', p.nowPerDay, 40e6);
  eq('  so fifteen more days', p.etaDays, 15);

  // Skill: done by level; ETA is the training time.
  const sk = { id: 's', label: '', createdAt: t0, kind: 'skill', skillId: 16622, level: 5 };
  p = G.goalProgress(sk, base({ skill: () => ({ level: 4, frac: 0.3, days: 12.5 }) }));
  eq('skill: level IV of V, 30% of the points, 12.5 days', [p.have, p.frac, p.etaDays, p.done], [4, 0.3, 12.5, false]);
  eq('  trained to V is done', G.goalProgress(sk, base({ skill: () => ({ level: 5, frac: 1, days: 0 }) })).done, true);
  eq('  no skills synced says so', G.goalProgress(sk, base()).missing, 'skills');
}

console.log('\n--- toasts queue, one at a time ---');
{
  const T = await import('../src/lib/toast.ts');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Waits for the thing itself rather than a fixed time: a busy machine runs timers late, and a fixed
  // wait then sees the next alert's clock run out too.
  const until = async (cond) => { for (let t = 0; t < 400 && !cond(); t++) await wait(5); };
  const texts = () => T.__peek().list.map((t) => t.text);
  T.setToastLife(0.15);
  T.toast('first'); T.toast('second'); T.toast('third');
  const now = () => T.__peek();
  eq('they queue in arrival order, the first in front', texts(), ['first', 'second', 'third']);
  await until(() => !texts().includes('first'));
  eq('only the front one ran its clock: one gone, the next forward', texts(), ['second', 'third']);
  T.pauseToasts();
  await wait(250);
  eq('hovering holds the clock', texts(), ['second', 'third']);
  T.resumeToasts();
  await until(() => !texts().includes('second'));
  eq('  and letting go resumes it', texts(), ['third']);
  T.setToastLife(null);
  await wait(250);
  eq('"until closed" keeps it', texts(), ['third']);
  T.dismiss(now().list[0].id);
  eq('closing it empties the queue', now().list.length, 0);
  // Hovering the last one and closing it takes the stack away before the pointer can leave it. The
  // next alert must still run its clock, not sit there paused for ever.
  T.setToastLife(0.06);
  T.toast('hovered');
  T.pauseToasts();
  T.dismiss(now().list[0].id);
  T.toast('next');
  await until(() => !now().list.length);
  eq('closing the last one while hovering does not leave the queue paused', now().list.length, 0);
  T.setToastLife(10);
}

console.log('\n--- whether trading reaches a bid ---');
{
  const F = await import('../src/lib/fills.ts');
  const { buyerShare: share2, MIN_TWO_SIDED } = await import('../src/lib/split.ts');
  const { bidToPlace } = await import('../src/lib/prospects.ts');
  const { adviseRelist: advise } = await import('../src/lib/relist.ts');
  const { alertMail: mail } = await import('../src/lib/alerts.ts');
  const M = 1e6;
  // Syndicate Gas Cloud Scoop, 12–25 Sep 2026, from ESI: each day's low, in millions.
  const scoopLows = [102.4, 104.45, 114.7, 105.7, 107.0, 103.5, 105.7, 104.9, 103.0, 103.7, 105.0, 99.99, 107.8, 110.5].map((x) => x * M);

  const now = Date.parse('2026-09-27T12:00:00Z');
  const rows = [{ date: '2026-09-24', lowest: 5, highest: 9, average: 7, volume: 1, order_count: 1 }, { date: '2026-09-26', lowest: 6, highest: 8, average: 7, volume: 1, order_count: 1 }];
  const rr = F.recentRange(rows, 3, now);
  eq('the last days, oldest first, a day with no trades is null', rr.lows, [5, null, 6]);
  eq('  highs likewise', rr.highs, [9, null, 8]);
  const w = { '2026-09-24': { buyLow: 4 }, '2026-09-25': { buyLow: 7, sellHigh: 11 }, '2026-09-26': { buyLow: 6.5, sellHigh: 8.5 } };
  const rw = F.recentRange(rows, 3, now, w);
  eq('a watched fill lower than ESI’s trimmed low counts; a higher one changes nothing', rw.lows, [4, 7, 6]);
  eq('  a watched day ESI shows as empty is filled in', rw.highs, [9, 11, 8.5]);
  const today = F.recentRange(rows, 3, now, { '2026-09-27': { buyLow: 3 } });
  eq('  watching today moves the window up to today, ahead of ESI’s history', [today.end, today.lows], ['2026-09-27', [null, 6, 3]]);
  eq('  and a scan’s kept lows take the fills watched since, over the same days', F.withWatchedLows([5, null, 6], '2026-09-26', w), [4, 7, 6]);
  eq('days the bulk of trading reached a bid', F.bidReachDays(scoopLows, 101.7 * M), 1);
  eq('  the scoop order at 99.79 M: none', F.bidReachDays(scoopLows, 99.79 * M), 0);
  eq('the bid reached on 7 of 14 days is the 7th lowest low', F.reachedBid(scoopLows), 104.9 * M);
  eq('  and there is none when fewer days traded', F.reachedBid([1, 2, null, null], 3), null);
  eq('the sell side counts days trading got up to an ask', F.askReachDays([10, null, 12, 9], 10), 2);

  const scoop = bidToPlace(101.6 * M, scoopLows);
  // Reached on 7 of the 14 days at 104.9 M; on 3 of the last 5 (103.7, 105.0, 99.99, 107.8, 110.5) only at 105.0 M.
  eq('Prospects prices the scoop’s buy where trading reached on both windows, not one step over the best bid', [scoop.top, scoop.buy, scoop.bidReach, scoop.raised, scoop.window], [101.7 * M, 105 * M, 1, true, 'fortnight']);
  const busy = bidToPlace(100, [99, 98, 100, 97, 99, 98, 99, 100, 98, 97, 99, 98, 99, 98]);
  eq('  a bid trading reaches every day stays one step over the best', [busy.buy, busy.raised], [100.1, false]);
  eq('  without the lows, nothing is claimed', bidToPlace(100, undefined), { top: 100.1, buy: 100.1, bidReach: null, recentReach: null, window: null, raised: false });

  // A day that traded only near the ask says nothing about dumping. Ten two-sided days at an even
  // split, then twenty quiet days trading high in the week's range with their average at their own low.
  const day = (i) => new Date(Date.parse('2026-08-28T00:00:00Z') + i * 86400_000).toISOString().slice(0, 10);
  const two = Array.from({ length: 10 }, (_, i) => ({ date: day(i), lowest: 90, highest: 110, average: 100 }));
  const one = Array.from({ length: 20 }, (_, i) => ({ date: day(10 + i), lowest: 108, highest: 109, average: 108, volume: 1 }));
  const withWide = [...two, ...one.map((r, i) => (i % 5 === 0 ? { ...r, lowest: 90, highest: 110, average: 100 } : r))];
  eq('one-sided days are skipped, so they stop reading as sellers dumping', share2(withWide), 0.5);
  eq('  the old reading would have said mostly sellers', share2(withWide.map(({ date, ...r }) => r)) < 0.2, true);
  eq('  with too few two-sided days, every day is read as before', share2([...two.slice(0, MIN_TWO_SIDED - 1), ...one]), share2([...two.slice(0, MIN_TWO_SIDED - 1), ...one].map(({ date, ...r }) => r)));

  // The user's order: a buy at 99.79 M, beaten by 101.6 M, selling on at 117.1 M.
  const RR2 = { k: 0.00375, f: 0.015, t: 0.0338 };
  const mine = { orderId: 7, typeId: 28788, isBuy: true, price: 99.79 * M, volumeRemain: 2 };
  const book = [{ id: 7, isBuy: true, price: 99.79 * M, volume: 2 }, { id: 8, isBuy: true, price: 101.6 * M, volume: 2 }, { id: 9, isBuy: false, price: 117.1 * M, volume: 3 }];
  const strict = advise(mine, { book, bestSell: 117.1 * M, lows: scoopLows, targetReturn: 0.07 }, RR2);
  eq('a buy trading doesn’t reach, with too little margin where it does: cancel it', strict.verdict, 'dry');
  eq('  it says how often trading reached it, and where it would', strict.why.includes('reached your bid on 0 of the last 14 days') && strict.why.includes('104,900,000') && strict.why.includes('under your 7.0% target'), true);
  eq('  and carries the counts', [strict.reach, strict.reachAt], [0, 104.9 * M]);
  const dear = advise(mine, { book, bestSell: 117.1 * M, lows: scoopLows, targetReturn: 0.07 }, { k: 0.015, f: 0.03, t: 0.075 });
  eq('  at dearer rates it says the move would lose money, not "0%"', dear.verdict === 'dry' && dear.why.includes('would lose') && !dear.why.includes('0.0%'), true);
  const easy = advise(mine, { book, bestSell: 117.1 * M, lows: scoopLows, targetReturn: 0.03 }, RR2);
  eq('with enough margin there, move to where trading reaches, not one step over the best bid', [easy.verdict, easy.newPrice], ['move', 104.9 * M]);
  const front = advise({ ...mine, price: 101.7 * M }, { book: [{ id: 7, isBuy: true, price: 101.7 * M, volume: 2 }, { id: 9, isBuy: false, price: 117.1 * M, volume: 3 }], bestSell: 117.1 * M, lows: scoopLows, targetReturn: 0.07 }, RR2);
  eq('  being in front doesn’t help when trading doesn’t come down to you', front.verdict, 'dry');
  eq('without the lows, the advice is as before', advise(mine, { book, bestSell: 117.1 * M }, RR2).newPrice, 101.7 * M);
  eq('a sell order is not judged this way', advise({ ...mine, isBuy: false }, { book, lows: scoopLows }, RR2).reach, null);
  eq('a buy trading reaches is judged as before', advise({ ...mine, price: 115 * M }, { book: [{ id: 7, isBuy: true, price: 115 * M, volume: 2 }, ...book.slice(1)], bestSell: 117.1 * M, lows: scoopLows, targetReturn: 0.07 }, RR2).verdict, 'front');

  // Datacore - Rocket Science: a buy of 10,000 at 83,230, repriced on 26 Sep, 4,133 filled by 27 Sep, while
  // ESI's history (to 25 Sep) had the bulk of trading reach 83,230 on only 2 of 14 days.
  const J = 60003760;
  const dcLows = [88150, 97010, 88620, 88140, 88280, 88440, 88470, 97820, 88110, 83990, 92200, 80570, 80630, 96300];
  const dc = { orderId: 11, typeId: 20420, isBuy: true, price: 83230, volumeRemain: 5867, locationId: J, seen: [{ issued: '2026-09-26T23:37:10Z', price: 83230, remain: 10000 }] };
  const at27 = Date.parse('2026-09-27T01:00:00Z');
  eq('an order that has shrunk since its price was set is being reached', F.fillingNow(dc, 5867, [], at27), true);
  eq('  so is one you bought at, lately, in the same station', F.fillingNow({ ...dc, seen: undefined }, null, [{ source: 'esi', typeId: 20420, isBuy: true, unitPrice: 83230, date: '2026-09-27T00:43:47Z', locationId: J }], at27), true);
  eq('  but not on a buy days ago, dearer than the bid, elsewhere, or someone else’s item', [
    { date: '2026-09-22T00:00:00Z' }, { unitPrice: 85000 }, { locationId: 60008494 }, { typeId: 34 },
  ].map((x) => F.fillingNow({ ...dc, seen: undefined }, null, [{ source: 'esi', typeId: 20420, isBuy: true, unitPrice: 83230, date: '2026-09-27T00:43:47Z', locationId: J, ...x }], at27)), [false, false, false, false]);
  eq('  a version first seen after it had already filled proves nothing by itself', F.fillingNow({ ...dc, seen: [{ issued: 'x', price: 83230, remain: 5867 }] }, 5867, [], at27), false);
  // Sells the same way, for a listing you're leaving: one that shrinks at its price is being bought from.
  eq('  a sell that has shrunk since its price was set is being reached too', F.fillingNow({ ...dc, isBuy: false }, 1, [], at27), true);
  eq('  so is one you sold at or above lately, but not below it', [83230, 90000, 80000].map((p) => F.fillingNow({ ...dc, isBuy: false, seen: undefined }, null, [{ source: 'esi', typeId: 20420, isBuy: false, unitPrice: p, date: '2026-09-27T00:43:47Z', locationId: J }], at27)), [true, true, false]);
  const dcBook = [{ id: 11, isBuy: true, price: 83230, volume: 5867 }, { id: 12, isBuy: true, price: 83210, volume: 397 }, { id: 13, isBuy: false, price: 89230, volume: 19 }];
  const dcArgs = { book: dcBook, bestSell: 89230, lows: dcLows, targetReturn: 0.1 };
  eq('by history alone, the datacore buy would be told to cancel', advise(dc, dcArgs, RR2).verdict, 'dry');
  const dcFilling = advise(dc, { ...dcArgs, filling: true }, RR2);
  eq('  but it is filling, so it is judged as any other buy: in front', [dcFilling.verdict, dcFilling.unreached], ['front', false]);

  const dryMail = mail([{ kind: 'move', key: 'd', title: 'Buy order unlikely to fill', typeId: 28788, name: 'Syndicate Gas Cloud Scoop', text: 'x', order: { ...strict } }], { appUrl: 'u/', keepMin: 30, now });
  eq('the mail says to cancel it, in the subject and the body', dryMail.subject === 'Jita Ledger: cancel Syndicate Gas Cloud Scoop buy' && dryMail.body.includes('RECOMMENDED: cancel this buy order'), true);
  const moveMail = mail([{ kind: 'move', key: 'm', title: 'Order worth moving', typeId: 28788, name: 'Syndicate Gas Cloud Scoop', text: 'x', order: { ...easy } }], { appUrl: 'u/', keepMin: 30, now });
  eq('  and a move to where trading reaches says why', moveMail.body.includes('Trading reached your bid on 0 of the last 14 days') && moveMail.body.includes('move your buy order up to 104,900,000 ISK'), true);
}

console.log('\n--- measuring your share ---');
{
  const S = await import('../src/lib/share.ts');
  const J = 60003760, now = Date.parse('2026-09-27T12:00:00Z');
  const day = (i) => new Date(now - i * 86400_000).toISOString().slice(0, 10);
  // An item trading 1,000 a day, its days' averages midway (so half buyers, half sellers).
  const hist = { 34: Array.from({ length: 30 }, (_, i) => ({ date: day(29 - i), lowest: 90, highest: 110, average: 100, volume: 1000, order_count: 50 })) };
  const tx = (i, isBuy, qty) => ({ source: 'esi', typeId: 34, isBuy, qty, unitPrice: 100, date: day(i) + 'T12:00:00Z', locationId: J });
  const trades = [...Array.from({ length: 6 }, (_, i) => tx(i + 1, true, 10)), ...Array.from({ length: 6 }, (_, i) => tx(i + 1, false, 30))];
  const m = S.measureShare(trades, hist, J, now);
  eq('buys: 10 of the 500 sellers sold a day is 2%', [m.buyDays, m.buyMedian], [6, 0.02]);
  eq('  sells: 30 of 500 is 6%', [m.sellDays, m.sellMedian], [6, 0.06]);
  eq('  suggested: halfway (4%), over the 1.5× the app gives a quiet market, to the half percent', m.suggested, 2.5);
  eq('one day of buying is too little to suggest anything', S.measureShare([tx(1, true, 500)], hist, J, now).suggested, null);
  const tenSells = Array.from({ length: 10 }, (_, i) => tx(i + 1, false, 30));
  eq('  a thin side is left out of the suggestion', S.measureShare([...tenSells, tx(2, true, 400)], hist, J, now).suggested, S.suggestShare(null, 0.06));
  eq('trades elsewhere, older than 30 days or typed in by hand don’t count', S.measureShare([{ ...tx(1, true, 10), locationId: 1 }, tx(40, true, 10), { ...tx(1, true, 10), source: 'manual' }], hist, J, now).buyDays, 0);
  eq('the items to fetch: traded here lately, most ISK first', S.sharedTypes([tx(1, true, 1), { ...tx(1, true, 5), typeId: 35 }, { ...tx(1, true, 9), locationId: 2, typeId: 36 }], J, 60, now), [35, 34]);
}

console.log('\n--- busy markets ---');
{
  const P = await import('../src/lib/prospects.ts');
  eq('ISK traded a day is the median day’s units at the average price', P.tradedPerDay({ unitsPerDay: 800000, avgPrice: 20000 }), 16e9);
  const mk = (typeId, traded) => ({ typeId, roi: 0, net: 0, iskPerDay: 0, capital: 0, canTake: 0, daysToFlip: 1, traded, warnings: [], stats: { tradesPerDay: 1, daysTraded: 30, unitsPerDay: 1 } });
  eq('the table sorts by it, busiest first', P.sortProspects([mk(1, 5), mk(2, 50), mk(3, 20)], { key: 'traded', dir: P.FIRST_DIR.traded }, String).map((p) => p.typeId), [2, 3, 1]);
}

console.log('\n--- how current the Prospects scan is ---');
{
  const P = await import('../src/lib/prospects.ts');
  const now = Date.parse('2026-09-27T12:00:00Z');
  const h = (n) => new Date(now - n * 3600_000).toISOString();
  eq('no scan at all', P.scanFreshness(undefined, null, now).level, 'none');
  eq('a quick scan an hour ago is fresh', [P.scanFreshness({ quick: h(1) }, null, now).level, P.scanFreshness({ quick: h(1) }, null, now).lastDepth], ['fresh', 'quick']);
  eq('  over 6 hours is stale, over a day old', [P.scanFreshness({ quick: h(7) }, null, now).level, P.scanFreshness({ quick: h(30) }, null, now).level], ['stale', 'old']);
  eq('the newest finished scan counts, of either depth', P.scanFreshness({ quick: h(30), deep: h(2) }, null, now).lastDepth, 'deep');
  eq('no deep scan, or one over a week old, is worth running again', [P.scanFreshness({ quick: h(1) }, null, now).deepStale, P.scanFreshness({ deep: h(24 * 8) }, null, now).deepStale, P.scanFreshness({ deep: h(24 * 2) }, null, now).deepStale], [true, true, false]);
  eq('a scan from before finishing times were kept is judged by its newest price', P.scanFreshness(undefined, h(10), now).level, 'stale');
  eq('the cloud’s daily full-market scan stays fresh through the day it covers', [P.scanFreshness({ cloud: h(20) }, null, now).level, P.scanFreshness({ cloud: h(20) }, null, now).lastDepth], ['fresh', 'cloud']);
  eq('  a missed day makes it stale, two old', [P.scanFreshness({ cloud: h(35) }, null, now).level, P.scanFreshness({ cloud: h(60) }, null, now).level], ['stale', 'old']);
  eq('  and a recent one leaves nothing for a deep scan to add', P.scanFreshness({ cloud: h(20) }, null, now).deepStale, false);
  eq('  a quick scan after it is the newest', P.scanFreshness({ cloud: h(20), quick: h(1) }, null, now).lastDepth, 'quick');
}

console.log('\n--- planner filters ---');
{
  const { plannerFilters, PLANNER_HORIZONS } = await import('../src/lib/planner.ts');
  const f = plannerFilters({ busy: true, minRoi: 0.05, horizonDays: null, budget: 1 }, 2e9, 7);
  eq('the planner never uses the Busy markets view', f.busy, false);
  eq('  keeps your other Prospects filters', f.minRoi, 0.05);
  eq('  and sizes to its own ISK and horizon, with partial fills', [f.budget, f.horizonDays, f.partial], [2e9, 7, true]);
  eq('  nothing saved is the defaults', plannerFilters(null, 1e9, 3).minRoi, 0.03);
  eq('its horizons are the Prospects ones without "any"', PLANNER_HORIZONS.includes(null), false);
}

console.log('\n--- loyalty: all on one item ---');
{
  const L = await import('../src/lib/loyalty.ts');
  const v = (offerId, iskPerLp, profit, lpCost = 1000, quantity = 1) => ({ offerId, typeId: offerId, quantity, lpCost, revenue: 0, iskCost: 0, itemsCost: 0, outlay: 100, profit, iskPerLp, runs: 0, totalProfit: 0, unpriced: [] });
  // Share 10%: a market with 10 buyers a day sells you one a day.
  const c = (id, rate, profit, buyersPerDay, lpCost = 1000) => ({ v: v(id, rate, profit, lpCost), sideUnitsPerDay: buyersPerDay, listAt: 100 });
  // 100,000 points. Offer 1: 100 runs, sells in 10 days. Offer 2: 8 runs, 16 days. Offer 3: 100 runs in 200 days.
  const cands = [c(1, 700, 0.7e6, 100), c(2, 900, 11e6, 5, 12000), c(3, 1500, 1.5e6, 5), c(4, 100, 0.1e6, 1000)];
  const picks = L.lazyPicks(cands, 10, 100000);
  eq('every run the points afford goes into the one item', picks.find((p) => p.v.offerId === 1).runs, 100);
  eq('within two weeks comes first; a slower one fills in behind it, flagged only past 30 days', picks.map((p) => [p.v.offerId, p.slow]), [[1, false], [2, false]]);
  eq('  a pile that would take months is never suggested, whatever its rate', picks.some((p) => p.v.offerId === 3), false);
  eq('  a poor rate is left out', picks.some((p) => p.v.offerId === 4), false);
  eq('ranked by what it makes: your points times its rate, less what’s left over', L.lazyPicks([c(1, 700, 0.7e6, 1000), c(2, 900, 11e6, 1000, 12000)], 10, 100000).map((p) => p.v.offerId), [2, 1]);
  const slow = L.lazyPicks([c(5, 900, 1e6, 10)], 10, 40000);
  eq('40 days to sell is shown, flagged slow', [slow.length, slow[0]?.slow, Math.round(slow[0]?.sellDays)], [1, true, 40]);
}

console.log('\n--- horizon ---');
{
  const { snapHorizon, HORIZONS, horizonSaid, horizonShort } = await import('../src/lib/prospects.ts');
  eq('the choices: 4 h, 12 h, then days', HORIZONS, [4 / 24, 12 / 24, 1, 3, 7, 14, 30, null]);
  eq('"any" stays any', snapHorizon(null), null);
  eq('a choice stays itself', [snapHorizon(14), snapHorizon(4 / 24)], [14, 4 / 24]);
  eq('a typed-in horizon snaps to the nearest choice, by ratio', [snapHorizon(5), snapHorizon(10), snapHorizon(60), snapHorizon(0.1), snapHorizon(0.7)], [7, 14, 30, 4 / 24, 12 / 24]);
  eq('said as a person would', [horizonSaid(4 / 24), horizonSaid(0.5), horizonSaid(1), horizonSaid(3)], ['4 hours', '12 hours', 'a day', '3 days']);
  eq('  and short on a button', [horizonShort(4 / 24), horizonShort(1), horizonShort(30)], ['4 h', '1 d', '30 d']);
  eq('nothing saved is the default', [snapHorizon(undefined), snapHorizon(0)], [3, 3]);
}

console.log('\n--- tooltip layout ---');
{
  const { tipBlocks, isWideTip } = await import('../src/lib/tipText.ts');
  eq('a one-line tip is one paragraph', tipBlocks('Just this.'), [{ kind: 'p', text: 'Just this.' }]);
  eq('paragraphs, bullets and an example', tipBlocks('Lead line.\n\n• one;\n• two.\n\nFor example: 5 units.').map((b) => b.kind), ['p', 'list', 'example']);
  eq('  the bullets keep their text', tipBlocks('• one;\n• two.')[0], { kind: 'list', items: ['one;', 'two.'] });
  eq('  the example loses its label and starts with a capital', tipBlocks('For example: buy 100 at 1 M.')[0], { kind: 'example', text: 'Buy 100 at 1 M.' });
  eq('  "Example:" works too', tipBlocks('Example: x')[0].kind, 'example');
  eq('a lead line followed by bullets in one paragraph splits', tipBlocks('Three kinds:\n• a\n• b').map((b) => b.kind), ['p', 'list']);
  eq('long or structured tips get the wide box', [isWideTip('short'), isWideTip('a\nb'), isWideTip('x'.repeat(201))], [false, true, true]);
}

console.log('\n--- ISK formatting ---');
{
  const F = await import('../src/lib/format.ts');
  eq('a whole amount drops its .00', F.isk(5000), '5,000 ISK');
  eq('  cents stay when there are cents', F.isk(5.5), '5.50 ISK');
  eq('  and a price in cents keeps both', F.isk(45010.25), '45,010.25 ISK');
  eq('  big amounts had none already', F.isk(423236), '423,236 ISK');
  eq('  rounding to a whole drops them too', F.isk(12.004), '12 ISK');
  eq('  no minus on a zero', F.isk(-0.001), '0 ISK');
  eq('  negatives keep their sign', F.isk(-1234.5), '\u22121,234.50 ISK');
  eq('millions drop trailing zeros', [4e6, 14.5e6, 14.81e6].map(F.iskBig), ['4 M ISK', '14.5 M ISK', '14.81 M ISK']);
  eq('  billions and trillions too', [2e9, 1.2e12].map(F.iskBig), ['2 B ISK', '1.2 T ISK']);
  eq('  under a million it is the plain amount', F.iskBig(64300), '64,300 ISK');
  eq('signed amounts follow', [F.iskSigned(5000), F.iskBigSigned(-3e6)], ['+5,000 ISK', '\u22123 M ISK']);
}

console.log('\n--- prefs ---');
eq('an unknown theme falls back', sanitizePrefs({ theme: 'Jove' }).theme, 'Caldari');
eq('motion left unset follows the system', effectiveMotion(undefined, true), 'Calm');
eq('  or full when not asked', effectiveMotion(undefined, false), 'Full');
eq('a chosen motion wins', effectiveMotion('Off', false), 'Off');
eq('only the one-month pack is assumed', sanitizePrefs({}).omegaPacks, { 1: 500, 3: null, 6: null, 12: null });
eq('alerts stay ten seconds unless set', sanitizePrefs({}).toastSeconds, 10);
eq('"until closed" is kept as null', sanitizePrefs({ toastSeconds: null }).toastSeconds, null);
eq('an odd duration falls back', sanitizePrefs({ toastSeconds: 7 }).toastSeconds, 10);
eq('alerts start off', sanitizeAlerts({}).on, false);
eq('an odd interval falls back', sanitizeAlerts({ interval: 7 }).interval, 5);
eq('remind again after 4 h unless you chose otherwise', [sanitizeAlerts({}).repeatH, sanitizeAlerts({ repeatH: 12 }).repeatH, sanitizeAlerts({ repeatH: 5 }).repeatH], [4, 12, 4]);
eq('mail starts off', sanitizeAlerts({}).mail, false);
eq('  and by mail only what you can act on in game, plus the cloud’s trades worth a look, mistake listings, its own failures and asset safety', Object.entries(sanitizeAlerts({}).mailEv).filter(([, v]) => v).map(([k]) => k), ['move', 'pi', 'opportunity', 'snipe', 'watchdog', 'safety']);
eq('  the Sniper’s bar starts at 5 M and 10%, and keeps what you set', [sanitizeAlerts({}).snipeMinIsk, sanitizeAlerts({}).snipeMinPct, sanitizeAlerts({ snipeMinIsk: 2e7, snipeMinPct: 15 }).snipeMinIsk], [5e6, 10, 2e7]);
// "Exclude blueprints, as they might be risky to try and sell" (the user, 2 October 2026): out unless switched on, and
// anything but a plain true (an older device's whole document, a stray value) reads as out.
eq('  the Sniper leaves blueprints out unless asked: only true lets them in', [sanitizeAlerts({}).snipeBlueprints, sanitizeAlerts({ snipeBlueprints: 'yes' }).snipeBlueprints, sanitizeAlerts({ snipeBlueprints: 1 }).snipeBlueprints, sanitizeAlerts({ snipeBlueprints: true }).snipeBlueprints], [false, false, false, true]);
eq('  a saved config from before opportunities gets them from the defaults', sanitizeAlerts({ ev: { move: true }, mailEv: { move: true } }).mailEv.opportunity, true);
eq('mails are deleted after 3 days unless set', sanitizeAlerts({}).mailKeepMin, 4320);
eq('"keep them" is kept as null', sanitizeAlerts({ mailKeepMin: null }).mailKeepMin, null);
eq('half an hour is a choice', sanitizeAlerts({ mailKeepMin: 30 }).mailKeepMin, 30);
eq('an odd keep falls back', sanitizeAlerts({ mailKeepMin: 5 }).mailKeepMin, 4320);
eq('a saved mail choice survives', sanitizeAlerts({ mailEv: { scam: true } }).mailEv.scam, true);

console.log('\n--- alert mail ---');
{
  const move = { kind: 'move', key: 'k1', title: 'Order worth moving', typeId: 2185, name: 'Hammerhead II',
    text: 'Hammerhead II sell order beaten — worth moving to 1,234 ISK (costs 2.1 M).' };
  const pi = { kind: 'pi', key: 'k2', title: 'PI programme ending', text: 'Tama: an extraction programme ends in 3 h.' };
  const one = alertMail([move], { appUrl: 'https://x.test/jita-ledger/', keepMin: 4320 });
  eq('one alert: its title is the subject', one.subject, 'Jita Ledger: Order worth moving');
  eq('  the item name opens its market, through the app', one.body.includes('<a href="https://x.test/jita-ledger/open.html?market=2185~Hammerhead%20II">Hammerhead II</a> sell order beaten'), true);
  eq('  and there is no second link for it', one.body.includes('Open its market in game') || one.body.includes('showinfo:'), false);
  eq('  the name is not repeated', one.body.split('Hammerhead II').length - 1, 1);
  eq('  an order alert links to the orders page', one.body.includes('https://x.test/jita-ledger/#orders'), true);
  eq('an alert with no item has no market link', alertMail([pi], { appUrl: 'u/', keepMin: 1440 }).body.includes('market='), false);
  eq('  and says when it goes', one.body.includes('deleted after 3 days, read or not'), true);
  eq('keep times read naturally', [30, 60, 360, 1440, 4320, 10080].map(keepSaid), ['30 minutes', 'an hour', '6 hours', 'a day', '3 days', 'a week']);
  eq('a short keep is tidied often enough', [30, 60, 1440].map((m) => tidyEvery(m) / 60_000), [5, 10, 60]);
  const two = alertMail([move, pi], { appUrl: 'https://x.test/', keepMin: null });
  eq('two alerts: one mail, both named in the subject', two.subject, 'Jita Ledger: Order worth moving · PI programme ending');
  eq('  both in the body', two.body.includes('Tama: an extraction') && two.body.includes('market=2185'), true);
  eq('  kept mails say so', two.body.includes('Alert mails are kept'), true);
  eq('a PI alert alone links to the to-do list', alertMail([pi], { appUrl: 'u/', keepMin: 1440 }).body.includes('u/#todo'), true);
  eq('  and a day reads as a day', alertMail([pi], { appUrl: 'u/', keepMin: 1440 }).body.includes('deleted after a day'), true);
  eq('a test says so in the subject', alertMail([move], { appUrl: '', keepMin: 4320, test: true }).subject, 'Jita Ledger: test — Order worth moving');
  const odd = { ...pi, text: 'A <b> & C', typeId: 5, name: 'Nope' };
  const oddBody = alertMail([odd], { appUrl: 'u/', keepMin: 4320 }).body;
  eq('text is escaped, and a name the text does not start with is not linked', oddBody.includes('A &lt;b&gt; &amp; C') && !oddBody.includes('>Nope</a>'), true);
  eq('  but its market still gets a line of its own', oddBody.includes('<a href="u/open.html?market=5~Nope">Open its market in game</a>'), true);
  const many = Array.from({ length: 40 }, (_, i) => ({ ...move, key: 'm' + i, text: 'Hammerhead II ' + 'x'.repeat(400) }));
  const big = alertMail(many, { appUrl: '', keepMin: 4320 });
  eq('a burst is capped and summed up', big.body.includes('…and 25 more in the app.'), true);
  eq('  and stays under ESI’s 10,000 characters', big.body.length <= 10000, true);
  const huge = alertMail(Array.from({ length: 15 }, (_, i) => ({ ...move, key: 'h' + i, text: 'Hammerhead II ' + 'y'.repeat(900) })), { appUrl: '', keepMin: 4320 });
  eq('long alerts are dropped whole to fit', huge.body.length <= 10000 && huge.body.includes('Settings → Alerts.') && huge.body.endsWith('</font>') && huge.body.includes('more in the app'), true);

  // With the order check's facts, a mail says what to do and why.
  const facts = { verdict: 'move', isBuy: false, price: 1234000, best: 1229000, gap: 5000, newPrice: 1228900, volumeRemain: 12,
    give: 61200, fee: 3100, cost: 64300, atRisk: 14808000, aheadUnits: 40, aheadOrders: 3, hoursToFront: 6.2, why: '40 ahead of you, about 6 h of waiting' };
  const at = Date.parse('2026-09-27T12:00:00Z');
  const rich = alertMail([{ ...move, order: facts }], { appUrl: 'u/', keepMin: 30, now: at });
  eq('an order alert says plainly what to do', rich.body.includes('RECOMMENDED: move your sell order down to 1,228,900 ISK'), true);
  eq('  and the subject says it too', rich.subject, 'Jita Ledger: move Hammerhead II sell to 1,228,900');
  eq('  with yours against the best, and by how much', rich.body.includes('1,234,000') && rich.body.includes('1,229,000') && rich.body.includes('(beaten by 5,000)'), true);
  eq('  what moving costs, split', rich.body.includes('64,300 ISK') && rich.body.includes('61,200 ISK lower price + 3,100 ISK fee') && rich.body.includes('14.81 M ISK'), true);
  eq('  and the queue ahead', rich.body.includes('3 orders, 40 units') && rich.body.includes('about 6 h to clear'), true);
  eq('  the name is still the market link', rich.body.includes('<a href="u/open.html?market=2185~Hammerhead%20II">Hammerhead II</a>'), true);
  const buyUp = alertMail([{ ...move, order: { ...facts, isBuy: true } }], { appUrl: 'u/', keepMin: 30, now: at });
  eq('a buy order moves up', buyUp.body.includes('move your buy order up to'), true);
  eq('  and costs a higher price, not a lower one', buyUp.body.includes('ISK higher price + ') && !buyUp.body.includes('lower price'), true);
  eq('the whole mail is in the larger text size, closed at the end', rich.body.startsWith('<font size="16">') && rich.body.endsWith('</font>'), true);
  eq('  with bigger titles', rich.body.includes('<font size="20"><font color="#fff2b15c"><b>ORDER WORTH MOVING'), true);
  const hold = alertMail([{ ...move, kind: 'clearing', title: 'Beaten but clearing', order: { ...facts, verdict: 'wait', why: 'Only 4 ahead of you, about 20 min at this item\'s pace', hoursToFront: Infinity } }], { appUrl: 'u/', keepMin: 30, now: at });
  eq('a hold says so, with the reason', hold.body.includes('RECOMMENDED: leave it where it is') && hold.body.includes('<i>Only 4 ahead of you'), true);
  eq('  and no cost of moving', hold.body.includes('Moving costs'), false);
  eq('  an unknown pace is said, not guessed', hold.body.includes('too little trading history'), true);
  eq('  its subject', hold.subject, 'Jita Ledger: Hammerhead II beaten, but hold');
  const piF = { kind: 'pi', key: 'p', title: 'PI programme ending', text: 'Tama: ends in 3 h.', pi: { system: 'Tama', systemId: 30002813, planetType: 'barren', product: 'Base Metals', ends: at + 3 * 3600_000 } };
  const piMail = alertMail([piF], { appUrl: 'u/', keepMin: 30, now: at });
  eq('a PI alert names the system as an in-game link', piMail.body.includes('<a href="showinfo:5//30002813">Tama</a>'), true);
  eq('  the planet and what it extracts', piMail.body.includes('Barren planet · extracting Base Metals'), true);
  eq('  and when to reset it, in EVE time', /RECOMMENDED: reset the extractor heads before 27 Sept?, 15:00 ET/.test(piMail.body), true);
  eq('  its subject', piMail.subject, 'Jita Ledger: PI ends in 3 h in Tama');
  const ended = alertMail([{ ...piF, title: 'PI programme ended', pi: { ...piF.pi, ends: at - 3600_000 } }], { appUrl: 'u/', keepMin: 30, now: at });
  eq('an ended programme is red and says it has stopped', ended.body.includes('ff6b7d') && ended.body.includes('it has stopped') && ended.subject === 'Jita Ledger: PI stopped in Tama', true);
  const both = alertMail([piF, { ...move, order: facts }], { appUrl: 'u/', keepMin: 30, now: at });
  eq('the order comes first, whatever order they were found in', both.subject, 'Jita Ledger: move Hammerhead II sell to 1,228,900 · PI ends in 3 h in Tama');
  eq('  in the body too', both.body.indexOf('ORDER WORTH MOVING') < both.body.indexOf('PI PROGRAMME ENDING'), true);
  eq('nothing EVE can’t draw', /&nbsp;|<hr|×/.test(both.body + rich.body + hold.body + ended.body), false);

  const now = Date.parse('2026-09-27T12:00:00Z');
  const h = (from, subject, daysAgo) => ({ from, subject, timestamp: new Date(now - daysAgo * 86400_000).toISOString() });
  eq('an old alert mail from me is stale', isStaleAlertMail(h(7, `${MAIL_SUBJECT}: 2 alerts`, 4), [7], 4320, now), true);
  eq('half an hour on, a 30-minute mail goes', isStaleAlertMail(h(7, `${MAIL_SUBJECT}: 2 alerts`, 31 / 1440), [7], 30, now), true);
  eq('  a young one is not', isStaleAlertMail(h(7, `${MAIL_SUBJECT}: 2 alerts`, 2), [7], 4320, now), false);
  eq('  nor one from someone else', isStaleAlertMail(h(8, `${MAIL_SUBJECT}: 2 alerts`, 9), [7], 4320, now), false);
  eq('one from my sending character is mine too', isStaleAlertMail(h(8, `${MAIL_SUBJECT}: 2 alerts`, 9), [7, 8], 4320, now), true);
  eq('  but not one with no sender', isStaleAlertMail({ subject: `${MAIL_SUBJECT}: x`, timestamp: new Date(now - 9 * 86400_000).toISOString() }, [7, 8], 4320, now), false);
  eq('  nor my own mail about something else', isStaleAlertMail(h(7, 'Jita Ledger notes', 9), [7], 4320, now), false);
}

}

console.log('\n--- cloud alerts share the app\'s rules ---');
{
  const { mailKey, orderFindings, piFindings } = await import('../src/lib/alerts.ts');
  const { sidePaceOf } = await import('../src/lib/flow.ts');
  const { judgeOrder } = await import('../src/lib/relist.ts');
  const { DEFAULT_SETTINGS } = await import('../src/lib/fees.ts');
  const facts = { verdict: 'move', isBuy: false, price: 100, best: 99, gap: 1, newPrice: 98.9, volumeRemain: 10, give: 11, fee: 5, cost: 16, atRisk: 1000, aheadUnits: 40, aheadOrders: 2, hoursToFront: 96, why: 'x' };
  const f = { kind: 'move', key: 'move:77:98.9', title: 't', text: 't', order: facts };
  eq('a mailed move is remembered by the order and your price', mailKey(f), 'move:77@100');
  eq('  so a fresh undercut on an order you left alone is not mailed again', mailKey({ ...f, key: 'move:77:97.5' }), 'move:77@100');
  eq('  but one after you moved it is', mailKey({ ...f, order: { ...facts, price: 98.9 } }) !== mailKey(f), true);
  eq('  a buy order to cancel keeps its own kind', mailKey({ ...f, key: 'dry:77:100' }), 'dry:77@100');
  eq('  anything without an order keeps its key', mailKey({ kind: 'pi', key: 'pi:1:2:soon', title: '', text: '' }), 'pi:1:2:soon');

  const base = { orderId: 1, typeId: 34, isBuy: false, price: 10, volumeRemain: 5, best: 9, beaten: true, live: true, gone: false, newPrice: 8.99, gap: 0.1, give: 1, fee: 1, cost: 2, atRisk: 6e6, aheadUnits: 3, aheadOrders: 1, hoursToFront: 50, why: 'Clears in 2 days' };
  const found = orderFindings([{ ...base, verdict: 'move' }, { ...base, orderId: 2, verdict: 'wait' }, { ...base, orderId: 3, verdict: 'front', beaten: false }], () => 'Tritanium');
  eq('order findings: a move and a beaten wait, nothing for the front', found.map((x) => x.key), ['move:1:8.99', 'clear:2:9']);
  eq('  each carries the order facts a mail spells out', found.every((x) => x.order && x.name === 'Tritanium'), true);

  const now = Date.parse('2026-09-27T12:00:00Z');
  const col = (expiry) => ({ head: { planetId: 9, planetType: 'barren', solarSystemId: 30000142 }, extractors: [{ pinId: 5, expiry, productTypeId: 2267 }] });
  eq('a programme ending in 3 h is said', piFindings([col(now + 3 * 3600_000)], () => 'Jita', () => 'Base Metals', now).map((x) => x.text), ['Jita: an extraction programme ends in 3 h.']);
  eq('  one that ended says so', piFindings([col(now - 1)], () => 'Jita', () => undefined, now)[0].key, `pi:5:${now - 1}:ended`);
  eq('  one two days out is not', piFindings([col(now + 48 * 3600_000)], () => 'Jita', () => undefined, now).length, 0);

  const none = { h: 0, sell: 0, buy: 0, newSell: 0, newBuy: 0 };
  eq('side pace with no watching is history\'s split of the typical day', sidePaceOf({ daily: 100, buyers: 0.25, sold: undefined, watched: none }, true).perDay, 75);
  eq('  a day watched pulls it halfway to what was seen', Math.round(sidePaceOf({ daily: 100, buyers: 0.25, sold: undefined, watched: { ...none, h: 24, buy: 25 } }, true).perDay), 50);

  const book = [{ id: 1, isBuy: false, price: 10, volume: 5 }, { id: 2, isBuy: false, price: 9, volume: 1 }];
  const o = { orderId: 1, typeId: 34, isBuy: false, price: 10, volumeRemain: 5, locationId: 60003760 };
  const j = judgeOrder(o, { book, perDay: 100, lows: null, txs: [] }, DEFAULT_SETTINGS, now);
  eq('judgeOrder reads the order from the live book, like the Orders page', [j.beaten, j.aheadUnits, j.gone], [true, 1, false]);
  eq('  and says gone when the book no longer has it', judgeOrder(o, { book: [book[1]], perDay: 100, lows: null, txs: [] }, DEFAULT_SETTINGS, now).gone, true);
}

console.log('\n--- long range ---');
{
  const { itemResult, isTrade, isUnbought, groupResults, inBandOrder, bandOf, PRICE_BANDS, HELD_BANDS, unitFor, bucketStarts, bucketIndex, profitByBucket } = await import('../src/lib/longRange.ts');
  const D = 86400_000, t0 = Date.parse('2026-09-01T00:00:00Z');
  const calc = {
    typeId: 1,
    buys: [{ t: t0, price: 100, qty: 10 }, { t: t0 + 2 * D, price: 120, qty: 10 }],
    sells: [{ t: t0 + D, price: 150, qty: 5 }, { t: t0 + 4 * D, price: 160, qty: 10 }],
    series: [{ t: t0, realized: 0 }, { t: t0 + D, realized: 240 }, { t: t0 + 4 * D, realized: 600 }],
  };
  const all = itemResult(calc, t0 - 1, t0 + 10 * D);
  eq('all of it: profit from the series, units and money sold', [all.profit, all.sold, all.revenue], [600, 15, 2350]);
  eq('  every unit had a buy before it', all.covered, 15);
  // Average cost: 5 at 100, then 5 left at 100 + 10 at 120 = 113.33 each.
  eq('  cost is average cost', Math.round(all.cost), 500 + 1133);
  // FIFO: 5 held 1 day; then 5 from the first lot held 4 days, 5 from the second held 2.
  eq('  held is first in, first out', all.heldDays, (5 * 1 + 5 * 4 + 5 * 2) / 15);
  const late = itemResult(calc, t0 + 2 * D, t0 + 10 * D);
  eq('a window takes only its own sales and profit', [late.profit, late.sold, late.covered], [360, 10, 10]);
  eq('  but earlier sales still used up stock', late.heldDays, (5 * 4 + 5 * 2) / 10);
  eq('a bought and resold item is a trade', isTrade(all), true);
  const loot = itemResult({ typeId: 2, buys: [], sells: [{ t: t0, price: 5, qty: 100 }], series: [{ t: t0, realized: -20 }] }, t0 - 1, t0 + D);
  eq('something sold but never bought is not', [isTrade(loot), isUnbought(loot), loot.covered, loot.heldDays], [false, true, 0, null]);
  const fee = itemResult({ typeId: 3, buys: [{ t: t0, price: 1, qty: 1 }], sells: [], series: [{ t: t0 + D, realized: -50 }] }, t0, t0 + 2 * D);
  eq('a fee on an item you bought counts, with nothing sold', isTrade(fee), true);
  const bid = itemResult({ typeId: 4, buys: [], sells: [], ordered: true, series: [{ t: t0 + D, realized: -3_180_000 }] }, t0, t0 + 2 * D);
  eq('  and so does the fee on a buy order that never filled', [isTrade(bid), bid.profit], [true, -3_180_000]);
  const withFees = itemResult({ ...calc, series: [{ t: t0, realized: 0, avgCost: 101 }, { t: t0 + D, realized: 240, avgCost: 101 }, { t: t0 + 2 * D, realized: 240, avgCost: 114 }, { t: t0 + 4 * D, realized: 600, avgCost: null }] }, t0 - 1, t0 + 10 * D);
  eq('  cost takes the Positions average, buy fees included', withFees.cost, 5 * 101 + 10 * 114);
  eq('price and time bands', [bandOf(PRICE_BANDS, 9_999), bandOf(PRICE_BANDS, 10_000), bandOf(PRICE_BANDS, 2e8), bandOf(HELD_BANDS, 0.5), bandOf(HELD_BANDS, 30), bandOf(HELD_BANDS, null)],
    ['Under 10 k', '10 k – 1 M', 'Over 100 M', 'Under a day', 'Longer', null]);
  const g = groupResults([all, { ...all, typeId: 9, profit: -100, avgSell: 5 }], (r) => bandOf(PRICE_BANDS, r.avgSell));
  eq('groups sum by key, best first', g.map((x) => [x.key, x.profit, x.items]), [['Under 10 k', 500, 2]]);
  eq('  bands keep their own order', inBandOrder([{ key: 'Longer', profit: 1, cost: 0, revenue: 0, items: 1 }, { key: 'Under a day', profit: 9, cost: 0, revenue: 0, items: 1 }], HELD_BANDS).map((x) => x.key), ['Under a day', 'Longer']);
  eq('days, weeks, months by length of period', [unitFor(90), unitFor(365), unitFor(1000)], ['day', 'week', 'month']);
  const weeks = bucketStarts(Date.parse('2026-09-02T10:00:00Z'), Date.parse('2026-09-20T00:00:00Z'), 'week');
  eq('weeks start on Monday, EVE time', weeks.map((t) => new Date(t).toISOString().slice(0, 10)), ['2026-08-31', '2026-09-07', '2026-09-14']);
  const months = bucketStarts(Date.parse('2026-11-15T00:00:00Z'), Date.parse('2027-02-01T00:00:00Z'), 'month');
  eq('months are calendar months, across a year end', months.map((t) => new Date(t).toISOString().slice(0, 7)), ['2026-11', '2026-12', '2027-01', '2027-02']);
  eq('a moment finds its bucket', [bucketIndex(weeks, weeks[1]), bucketIndex(weeks, weeks[1] - 1), bucketIndex(weeks, weeks[0] - 1)], [1, 0, -1]);
  const days = bucketStarts(t0, t0 + 5 * D, 'day');
  eq('profit lands in the bucket it was made in', profitByBucket([calc], days, t0 + 5 * D), [0, 240, 0, 0, 360, 0]);
  eq('  and a window starting later leaves earlier profit out', profitByBucket([calc], days.slice(2), t0 + 5 * D), [0, 0, 360, 0]);
}

console.log('\n--- sell into the bids when buyers don\'t take listings ---');
{
  const { sellIntoBid, judgeOrder: judge, byUrgency: urgency, LISTING_DAYS } = await import('../src/lib/relist.ts');
  const { DEFAULT_SETTINGS } = await import('../src/lib/fees.ts');
  const quietDay = { h: 170, sell: 0, buy: 400, newSell: 0, newBuy: 0 };
  const book = [{ id: 1, isBuy: false, price: 6000, volume: 500 }, { id: 9, isBuy: true, price: 5000, volume: 200 }, { id: 8, isBuy: true, price: 4000, volume: 1000 }];
  const x = { gone: false, price: 6000, volumeRemain: 500, aheadUnits: 0 };
  const loot = sellIntoBid({ isBuy: false }, x, { book, watched: quietDay }, 0.03);
  eq('500 units nobody bought from listings in a week: sell into the bids', loot != null && loot.daysToSell > LISTING_DAYS, true);
  eq('  the bids pay after tax only, walking down the book', Math.round(loot.proceeds), Math.round((200 * 5000 + 300 * 4000) * 0.97));
  // An item selling in bursts a couple of times a week looks dead to a day between them (the user's worry).
  eq('  not before a week of watching: a quiet day or three isn’t enough', [10, 30, 100, 167].map((h) => sellIntoBid({ isBuy: false }, x, { book, watched: { ...quietDay, h } }, 0.03)), [null, null, null, null]);
  eq('  a week with bursts that would clear it within the month says nothing', sellIntoBid({ isBuy: false }, x, { book, watched: { ...quietDay, sell: 2 * 150 } }, 0.03), null);
  eq('  not when your own listing has sold since its price was set', sellIntoBid({ isBuy: false, seen: [{ price: 6000, remain: 510 }] }, x, { book, watched: quietDay }, 0.03), null);
  eq('  not for a few units that sell within the month', sellIntoBid({ isBuy: false }, { ...x, volumeRemain: 3 }, { book, watched: quietDay }, 0.03), null);
  eq('  not when buyers do take listings', sellIntoBid({ isBuy: false }, x, { book, watched: { ...quietDay, sell: 400 } }, 0.03), null);
  eq('  never below what the stock cost', sellIntoBid({ isBuy: false }, x, { book, watched: quietDay, avgCost: 5500 }, 0.03), null);
  eq('  never for a buy order', sellIntoBid({ isBuy: true }, x, { book, watched: quietDay }, 0.03), null);
  const o = { orderId: 1, typeId: 34, isBuy: false, price: 6000, volumeRemain: 500, locationId: 60003760 };
  const v = judge(o, { book, perDay: 1, lows: null, txs: [], watched: quietDay }, DEFAULT_SETTINGS, Date.parse('2026-09-28T12:00:00Z'));
  eq('the Orders verdict is "sell to bids", saying why in one sentence', [v.verdict, v.why.startsWith('Buyers barely take listings here: nobody bought from listings in the 7 days watched')], ['bid', true]);
  eq('  it replaces the move on the same order, and sorts among other orders’ moves by ISK at stake', [v, { ...v, verdict: 'move', atRisk: v.atRisk * 2 }].sort(urgency)[0].verdict, 'move');
}

console.log('\n--- your other orders on an item are not rivals ---');
{
  // The user lists stock in batches while its buy order is still filling (28 September 2026).
  const { judgeOrder: judge } = await import('../src/lib/relist.ts');
  const { DEFAULT_SETTINGS } = await import('../src/lib/fees.ts');
  const at = Date.parse('2026-09-28T12:00:00Z');
  const O = (orderId, isBuy, price, volumeRemain) => ({ orderId, typeId: 34, isBuy, price, volumeRemain, locationId: 60003760 });
  const L = (id, isBuy, price, volume) => ({ id, isBuy, price, volume });
  const base = { perDay: 100, lows: null, txs: [] };
  // Batch A at 100 and batch B at 102, both yours; a rival at 103 behind them.
  const book = [L(21, false, 100, 50), L(22, false, 102, 50), L(23, false, 103, 500), L(31, true, 90, 1000), L(32, true, 80, 200)];
  const alone = judge(O(22, false, 102, 50), { ...base, book }, DEFAULT_SETTINGS, at);
  const known = judge(O(22, false, 102, 50), { ...base, book, yours: [21, 22, 31] }, DEFAULT_SETTINGS, at);
  eq('without knowing it’s yours, your cheaper batch reads as a rival to undercut', [alone.beaten, alone.best], [true, 100]);
  eq('  knowing, it isn’t: nothing of anyone else’s is ahead', [known.beaten, known.verdict, known.aheadUnits], [false, 'front', 0]);
  eq('  but its stock sells first, so this one takes longer to sell', [Math.round(alone.yourHours), Math.round(known.yourHours)], [12, 24]);
  const between = judge(O(22, false, 102, 50), { ...base, book: [...book, L(24, false, 101, 5)], yours: [21, 22, 31] }, DEFAULT_SETTINGS, at);
  eq('  a rival between your batches is still one to get in front of, without undercutting yourself', [between.beaten, between.best, between.newPrice], [true, 101, 100.9]);
  // Sell to bids: a quiet week, 500 units listed, and your own buy order the biggest bid.
  const quiet = { h: 170, sell: 0, buy: 400, newSell: 0, newBuy: 0 };
  const lot = judge(O(22, false, 102, 500), { ...base, book: [L(22, false, 102, 500), L(31, true, 90, 1000), L(32, true, 80, 200)], watched: quiet, yours: [22, 31] }, DEFAULT_SETTINGS, at);
  eq('“Sell to bids” walks only others’ bids: your own buy order is trading with yourself', [lot.verdict, lot.intoBids?.units, lot.intoBids?.top], ['bid', 200, 80]);
  const onlyYours = judge(O(22, false, 102, 500), { ...base, book: [L(22, false, 102, 500), L(31, true, 90, 1000)], watched: quiet, yours: [22, 31] }, DEFAULT_SETTINGS, at);
  eq('  and with only your own bid, it says nothing about selling into bids', onlyYours.verdict === 'bid', false);
  // The membrane with your own buy order the top bid: a sell is still never moved under it.
  const mHighs = [55190, 55190, 55210, 55230, 55260, 55310, 55310, 55310, 55310, 55310, 55270, 150000, 100100, 100100];
  const mBook = [L(7, false, 3_899_000, 1), L(8, false, 720_000, 2), L(10, true, 100_000, 462), L(11, true, 55_270, 4633)];
  const sell = judge({ ...O(7, false, 3_899_000, 1), typeId: 16423 }, { ...base, perDay: 2, book: mBook, highs: mHighs, yours: [7, 10] }, DEFAULT_SETTINGS, at);
  eq('  a sell isn’t moved under your own bid either: a listing there would sell to yourself', [sell.newPrice, sell.overBid], [100100, true]);
  eq('  and it doesn’t suggest selling into that bid, which is yours', [sell.why.includes('sell into'), sell.why.endsWith('so list one step above it at 100,100')], [false, true]);
}

console.log('\n--- an order too big to keep moving ---');
{
  const { tooBigToMove, judgeOrder: judge, FEE_TARGET } = await import('../src/lib/relist.ts');
  const { DEFAULT_SETTINGS } = await import('../src/lib/fees.ts');
  // The user's Small Ghoul Compact Energy Nosferatu buy, as recorded (28 September 2026): 50,000 placed to sit and
  // buy up over time, repriced 10 times since its history was kept, 49,062 left at 2,031, resale one step under 8,193.
  const seen = [['2026-09-26T23:38:39Z', 1863, 49478], ['2026-09-27T09:01:47Z', 1868, 49331], ['2026-09-27T11:57:50Z', 1872, 49330],
    ['2026-09-27T17:25:47Z', 1878, 49302], ['2026-09-27T17:42:34Z', 1876, 49302], ['2026-09-27T21:30:40Z', 1882, 49300],
    ['2026-09-28T12:37:06Z', 2012, 49283], ['2026-09-28T13:42:45Z', 2016, 49281], ['2026-09-28T15:15:24Z', 2019, 49222],
    ['2026-09-28T16:34:08Z', 2022, 49219], ['2026-09-28T17:46:09Z', 2028, 49158]].map(([issued, price, remain]) => ({ issued, price, remain }));
  const now = Date.parse('2026-09-28T19:30:00Z');
  const k = 0.0026, margin = 8192 * (1 - 0.013 - 0.03375) - 2031 * 1.013;
  const ghoul = tooBigToMove({ isBuy: true, seen }, { price: 2031, volumeRemain: 49062, gone: false }, { perDay: 881, margin }, k, now);
  eq('the Ghoul buy: each change charged on all 49,062 left, about 259 k', Math.round(ghoul.changeFee / 1000), 259);
  eq('  and winning about 42 units a change on its own record (416 filled over 10 changes)', [ghoul.from, ghoul.changes, Math.round(ghoul.unitsPerChange)], ['own', 10, 42]);
  eq('  so it warns, with the days to fill at its own pace and the escrow it holds', [ghoul.paceFrom, Math.round(ghoul.daysToFill), Math.round(ghoul.held / 1e6)], ['own', 216, 100]);
  eq('  and a size whose change costs a tenth of what it wins', [ghoul.suggest, Math.round(ghoul.suggestFee / ghoul.profitPerChange * 100)], [4500, Math.round(FEE_TARGET * 100)]);
  // Without its own record: the most a change can win, everything reaching the bids until someone else outbids it.
  const watched = { h: 27, sell: 782, buy: 994, newSell: 0, newBuy: 0, frontBuy: 26 };
  const fresh = tooBigToMove({ isBuy: true, seen: [seen[0]] }, { price: 2031, volumeRemain: 49062, gone: false }, { perDay: 881, watched, margin }, k, now);
  eq('  a fresh order is judged on the most a change can win: 881 a day over the time between outbids', [fresh.from, Math.round(fresh.unitsPerChange)], ['model', 38]);
  const mineWatched = tooBigToMove({ isBuy: true, seen: [{ ...seen[0], issued: '2026-09-28T10:00:00Z' }, ...Array.from({ length: 2 }, (_, i) => ({ issued: `2026-09-28T1${i + 1}:00:00Z`, price: 2030, remain: 49400 }))] },
    { price: 2031, volumeRemain: 49062, gone: false }, { perDay: 881, watched: { ...watched, frontBuy: 2 }, margin }, k, now);
  eq('  nothing when only your own moves improved the front: nobody else is outbidding you', mineWatched, null);
  // Datacore - Rocket Science, 4,924 left at 85,460 on a ~1,540 margin, 266 units won a change on its record.
  const rs = tooBigToMove({ isBuy: true, seen: [{ issued: '2026-09-25T00:00:00Z', price: 83000, remain: 6000 }, ...[1, 2, 3].map((i) => ({ issued: `2026-09-2${5 + i}T00:00:00Z`, price: 83000 + i * 800, remain: 6000 - i * 266 }))] },
    { price: 85460, volumeRemain: 4924, gone: false }, { perDay: 500, margin: 1540 }, k, Date.parse('2026-09-28T20:00:00Z'));
  eq('  on a thin margin the size suggested is still at least what one change wins', [Math.round(rs.unitsPerChange), rs.suggest], [359, 360]);
  eq('a 1,000-unit order on the same market says nothing: a change costs about 5 k', tooBigToMove({ isBuy: true, seen }, { price: 2031, volumeRemain: 1000, gone: false }, { perDay: 881, margin }, k, now), null);
  eq('nothing without a margin to lose', tooBigToMove({ isBuy: true, seen }, { price: 2031, volumeRemain: 49062, gone: false }, { perDay: 881, margin: -5 }, k, now), null);
  eq('nothing for an order that’s gone', tooBigToMove({ isBuy: true, seen }, { price: 2031, volumeRemain: 49062, gone: true }, { perDay: 881, margin }, k, now), null);
  // Through judgeOrder, the way Orders and the cloud see it.
  const book = [{ id: 1, isBuy: true, price: 2031, volume: 49062 }, { id: 2, isBuy: true, price: 2030, volume: 4449 }, { id: 3, isBuy: false, price: 8193, volume: 5 }];
  const x = judge({ orderId: 1, typeId: 5141, isBuy: true, price: 2031, volumeRemain: 49062, locationId: 60003760, seen }, { book, perDay: 881, lows: null, txs: [] }, DEFAULT_SETTINGS, now);
  eq('  Orders carries it on the order', [x.tooBig != null, x.tooBig?.from], [true, 'own']);
}

console.log('\n--- never leave a sell at a price trading doesn\'t reach ---');
{
  const { adviseRelist, tooBigToMove } = await import('../src/lib/relist.ts');
  const R = { k: 0.0026, f: 0.013, t: 0.03375 };
  // The user's Blood Raider Limited Ballistic Control (28 September 2026): 3 listed at 172,700, 10 cheaper ahead,
  // bids at ~62,000; buyers sweep listings in bulk now and then (up to 170,500 on the 20th), sellers dump into bids.
  const highs = [62020, 62020, 170400, 62020, 170400, 170400, 170500, 62060, 170000, 62060, 62060, 62070, 62080, 62080];
  const L = (id, isBuy, price, volume) => ({ id, isBuy, price, volume });
  const book = [L(1, false, 137300, 1), L(2, false, 140100, 7), L(3, false, 160000, 2), L(5, false, 172700, 3), L(6, false, 172800, 5), L(7, false, 175400, 93), L(9, true, 62080, 95), L(10, true, 62070, 181)];
  const mine = { orderId: 5, typeId: 23148, isBuy: false, price: 172700, volumeRemain: 3 };
  const br = adviseRelist(mine, { book, dailyVolume: 0.0039, highs }, R, 1, 0.05);
  eq('the Blood Raider: not “leave it” at a price trading reached on 0 of 14 days', [br.verdict, br.unreached, br.reach], ['move', true, 0]);
  eq('  but to where trading got up to on 4 of them, not chasing the front 21% down', [br.newPrice, Math.round(br.cost)], [170400, 6900 + Math.round(0.0026 * 170400 * 3)]);
  eq('  saying so', br.why, 'Nobody buys at your price (reached on 0 of the last 14 days), but the bulk of trading got up to 170,400 on 4 of them, so list there rather than chase the front at 137,200');
  eq('  unless that sells under what it cost', adviseRelist(mine, { book, dailyVolume: 0.0039, highs, avgCost: 170000 }, R, 1, 0.05).verdict, 'loss');
  eq('  a sell whose price is reached keeps its queue advice', adviseRelist({ ...mine, price: 170400 }, { book: book.map((o) => (o.id === 5 ? { ...o, price: 170400 } : o)), dailyVolume: 0.0039, highs }, R, 1, 0.05).unreached, false);
  eq('  and “too big” says nothing for 3 units a market barely feeds: a change wins under a unit', tooBigToMove({ isBuy: false, seen: [] }, { price: 172700, volumeRemain: 3, gone: false },
    { perDay: 0.0039, watched: { h: 28, sell: 0, buy: 37, newSell: 1, newBuy: 0, frontSell: 1 }, margin: 100000 }, 0.0026, Date.parse('2026-09-28T20:00:00Z')), null);
}

console.log('\n--- where a new listing sells, everywhere a listing is priced ---');
{
  const { listingPrice } = await import('../src/lib/fills.ts');
  const { patientPrice } = await import('../src/lib/loyalty.ts');
  const { priceHub } = await import('../src/lib/arbitrage.ts');
  // The membrane (28 September 2026): cheapest listing 724,900, best bid 100,000, trading up to ~55,310 on half the fortnight.
  const mem = [55190, 55190, 55210, 55230, 55260, 55310, 55310, 55310, 55310, 55310, 55270, 150000, 100100, 100100];
  eq('a sell side nothing trades near: where trading reaches, never under one step over the bid', listingPrice(724900, 100000, mem), 100100);
  eq('  trading reaching the front: one step under it, as before', listingPrice(101000, 100000, Array(14).fill(102000)), 100900);
  eq('  where trading reaches above the bid: there', listingPrice(724900, 100000, Array(14).fill(150000)), 150000);
  eq('  no history, or too little: one step under the cheapest listing', [listingPrice(724900, 100000, null), listingPrice(724900, 100000, [null, null, 60000, ...Array(11).fill(null)])], [724800, 724800]);
  eq('Loyalty values the membrane where it sells, not at 724,800', [Math.round(patientPrice({ bestSell: 724900, bestBuy: 100000, highs: mem }, 0.013, 0.03375).net), Math.round(patientPrice({ bestSell: 724900, bestBuy: 100000 }, 0.013, 0.03375).net)], [Math.round(100100 * (1 - 0.013 - 0.03375)), Math.round(724800 * (1 - 0.013 - 0.03375))]);
  const hub = { typeId: 16423, m3: 5, jitaBestBuy: 50000, jitaBestSell: 60000, hubBestSell: 724900, hubBestBuy: 100000, hubHighs: mem, hubUnitsPerDay: 100, hubBuyers: 0.5 };
  eq('Hub arbitrage lists at the hub where trading reaches too', priceHub(hub, 'sells', { f: 0.013, t: 0.03375 }, 5, 7)?.listAt, 100100);
}

console.log('\n--- a sniped item is never moved to a loss ---');
{
  const { heldCost } = await import('../src/lib/heldCost.ts');
  const { judgeOrder: judge } = await import('../src/lib/relist.ts');
  const { DEFAULT_SETTINGS } = await import('../src/lib/fees.ts');
  // Snipes aren't positions, so Orders had no cost for them (costBasis read open positions only).
  const T = (id, date, qty, unitPrice) => ({ id, date, qty, unitPrice });
  const snipe = [T('s1', '2026-09-27T10:00:00Z', 10, 50000)];
  eq('a snipe of 10 at 50,000, from a listing: that is what the 10 held cost', heldCost(snipe, 10, new Set(['s1']), 0.013), 50000);
  eq('  a fill of your own buy order paid the broker fee too', heldCost(snipe, 10, new Set(), 0.013), 50650);
  eq('  newest buys first, as many as you hold', heldCost([T('a', '2026-09-01T00:00:00Z', 100, 10000), T('b', '2026-09-27T00:00:00Z', 5, 20000)], 8, new Set(['a', 'b']), 0), (5 * 20000 + 3 * 10000) / 8);
  eq('  no buys (loot): no cost to fall under', heldCost([], 10, new Set(), 0.013), null);
  // Listed at 70,000, the front at 45,000: getting in front would sell under the 50,000 it cost.
  const book = [{ id: 1, isBuy: false, price: 70000, volume: 10 }, { id: 2, isBuy: false, price: 45000, volume: 3 }, { id: 3, isBuy: true, price: 30000, volume: 50 }];
  const o = { orderId: 1, typeId: 5973, isBuy: false, price: 70000, volumeRemain: 10, locationId: 60003760 };
  const now = Date.parse('2026-09-28T20:00:00Z');
  const blind = judge(o, { book, perDay: 20, lows: null, txs: [] }, DEFAULT_SETTINGS, now);
  const guarded = judge(o, { book, perDay: 20, lows: null, txs: [], avgCost: heldCost(snipe, 10, new Set(['s1']), 0.013) }, DEFAULT_SETTINGS, now);
  eq('without its cost, Orders can\'t tell that the front is under what the snipe cost', [blind.verdict === 'loss', blind.newPrice], [false, 44990]);
  eq('  with it: not worth it, it would sell under what the stock cost you', [guarded.verdict, guarded.why], ['loss', 'Matching them would sell under what the stock cost you']);
}

console.log('\n--- a sell priced under what it cost ---');
{
  const { underCost, judgeOrder: judge } = await import('../src/lib/relist.ts');
  const { judgeUnderCost } = await import('../src/lib/todo.ts');
  const { DEFAULT_SETTINGS } = await import('../src/lib/fees.ts');
  const R = { f: 0.013, t: 0.03375, k: 0.0026 };
  const u = underCost({ isBuy: false }, { price: 40000, volumeRemain: 10, gone: false }, 50000, R);
  eq('listed at 40,000 against a 50,000 cost: each sale loses, and it breaks even at 52,460', [Math.round(u.net), Math.round(u.lossPerUnit), Math.round(u.loss), u.breakEven], [38130, 11870, 118700, 52460]);
  eq('  nothing at or over break-even, for a buy, without a cost, or gone', [underCost({ isBuy: false }, { price: 52460, volumeRemain: 10, gone: false }, 50000, R), underCost({ isBuy: true }, { price: 40000, volumeRemain: 10, gone: false }, 50000, R), underCost({ isBuy: false }, { price: 40000, volumeRemain: 10, gone: false }, null, R), underCost({ isBuy: false }, { price: 40000, volumeRemain: 10, gone: true }, 50000, R)], [null, null, null, null]);
  // Said whatever the order is told: here it's at the front, where the queue alone says nothing is wrong.
  const x = judge({ orderId: 1, typeId: 34, isBuy: false, price: 40000, volumeRemain: 10, locationId: 60003760 }, { book: [{ id: 1, isBuy: false, price: 40000, volume: 10 }, { id: 2, isBuy: false, price: 60000, volume: 5 }], perDay: 5, lows: null, txs: [], avgCost: 50000 }, DEFAULT_SETTINGS, Date.parse('2026-09-28T20:00:00Z'));
  eq('  an order at the front still says it', [x.verdict, x.underCost != null], ['front', true]);
  const e = { key: 'under:1', item: { kind: 'underCost', price: 40000 }, seenAt: 1000 };
  eq('To do ticks it off once a newer check shows it raised', judgeUnderCost(e, { open: true, checkedAt: 2000, bookRead: true, v: { gone: false, price: 53000 } }), 'You moved it to 53,000 ISK, over what it cost.');
  eq('  but not on an older check, or while still under cost', [judgeUnderCost(e, { open: true, checkedAt: 500, bookRead: true, v: { gone: false, price: 53000 } }), judgeUnderCost(e, { open: true, checkedAt: 2000, bookRead: true, v: { gone: false, price: 40000, underCost: {} } })], [null, null]);
}

console.log('\n--- listing loot through the Sell window ---');
{
  const { parseLoot, judgeLoot, planLoot, importBlock, importPrice, lootTotals, judgeStock, priceBlock } = await import('../src/lib/lootList.ts');
  // The user's own pastes (29 September 2026): the Sell window's export, and the hangar copied in list view. A paste
  // through chat turned the tabs into runs of spaces, so both forms are tried with each.
  const exported = '4477    Small Gremlin Compact Energy Neutralizer    1    40000.0    40000.0\n207\tMjolnir Heavy Missile\t200\t74.48\t14896.0\n25709    Upgraded \'Malkuth\' Heavy Assault Missile Launcher I    1    19120.0    19120.0';
  eq('the Sell window export: type ID, name, quantity', parseLoot(exported).rows, [
    { typeId: 4477, name: 'Small Gremlin Compact Energy Neutralizer', qty: 1 }, { typeId: 207, name: 'Mjolnir Heavy Missile', qty: 200 },
    { typeId: 25709, name: "Upgraded 'Malkuth' Heavy Assault Missile Launcher I", qty: 1 }]);
  const hangar = "YO-5000 Rapid Heavy Missile Launcher    1\nPositron Cord\t734\n'Stoic' Core Equalizer I    2\nPositron Cord    1,000\nTritanium\t\tMineral\n\n";
  eq('a hangar copy: name and quantity (split stacks added up, an empty quantity is one)', parseLoot(hangar).rows, [
    { typeId: null, name: 'YO-5000 Rapid Heavy Missile Launcher', qty: 1 }, { typeId: null, name: 'Positron Cord', qty: 1734 },
    { typeId: null, name: "'Stoic' Core Equalizer I", qty: 2 }, { typeId: null, name: 'Tritanium', qty: 1 }]);
  const R = { f: 0.0127, t: 0.03375 };
  const L = (id, isBuy, price, volume) => ({ id, isBuy, price, volume });
  const highs = Array(14).fill(110);
  // Listings at 100 that trade up to 110; bids at 60: listing 50 units gains a lot over dumping.
  const good = judgeLoot({ typeId: 1, name: 'Good Loot', qty: 50 }, { others: [L(1, false, 100, 20), L(2, true, 60, 500)], highs, perDay: 200, buyers: 0.6 }, R, 7.5, 0.05);
  eq('worth listing: one step under the cheapest listing, well over the bids', [good.verdict, good.listAt], ['list', 99.99]);
  // Bids almost as good as a listing: not worth a slot.
  const close = judgeLoot({ typeId: 2, name: 'Close', qty: 50 }, { others: [L(1, false, 100, 20), L(2, true, 99, 500)], highs, perDay: 200, buyers: 0.6 }, R, 7.5, 0.05);
  eq('bids nearly as good as listing: sell into them', close.verdict, 'bids');
  // Buyers barely take listings: sell into the bids now.
  // The user's Small 'Hope' Hull Reconstructor I: months to sell listed, but far more than the bids pay.
  const slow = judgeLoot({ typeId: 3, name: 'Slow', qty: 18 }, { others: [L(1, false, 75000, 3), L(2, true, 1500, 900)], highs: Array(14).fill(80000), perDay: 3, buyers: 0.5 }, R, 7.5, 0.05);
  eq('slow but worth far more listed: list it, and say it\'s slow', [slow.verdict, slow.why.endsWith('slow, but worth the slot')], ['list', true]);
  const never = judgeLoot({ typeId: 3, name: 'Never', qty: 500 }, { others: [L(1, false, 100, 20), L(2, true, 60, 900)], highs, perDay: 0.2, buyers: 0.1 }, R, 7.5, 0.05);
  eq('  over a year to sell: the bids', [never.verdict, never.why.startsWith('Listed at 100 ISK it would take')], ['bids', true]);
  eq('no market at all: skip', judgeLoot({ typeId: 4, name: 'Nothing', qty: 5 }, { others: [], highs: null, perDay: null, buyers: 0.5 }, R, 7.5, 0.05).verdict, 'skip');
  // Held items stay out unless included; the listings fill the free slots best first.
  const held = judgeLoot({ typeId: 5, name: 'Held', qty: 50 }, { others: [L(1, false, 100, 20), L(2, true, 60, 500)], highs, perDay: 200, buyers: 0.6 }, R, 7.5, 0.05, 'position');
  const plan = planLoot([good, held, { ...good, typeId: 6, name: 'Second', perSlotDay: 1 }], 1, new Set());
  eq('an item with an open position is left out; one free slot goes to the best', plan.map((c) => c.verdict), ['list', 'held', 'noSlot']);
  eq('  unless you include it', planLoot([held], 5, new Set([5]))[0].verdict, 'list');
  eq('the import block: name, a tab, the price as the window reads it', [importBlock(plan, 'point'), importPrice(1234.5, 'comma'), importPrice(40000, 'point')], ['Good Loot\t99.99', '1234,50', '40000']);
  // Ships stay out unless included one by one: "the risk of it is too high for how expensive they can get".
  const ship = judgeLoot({ typeId: 7, name: 'Jackdaw', qty: 1 }, { others: [L(1, false, 40e6, 3), L(2, true, 30e6, 2)], highs: Array(14).fill(41e6), perDay: 5, buyers: 0.5 }, R, 7.5, 0.05, 'ship');
  const withShip = planLoot([good, ship], 5, new Set());
  eq('a ship is left out, and says why', [withShip[1].verdict, withShip[1].why.startsWith('A ship')], ['held', true]);
  eq('  unless you include it', planLoot([ship], 5, new Set([7]))[0].verdict, 'list');
  // The user asked for what it all comes to listed, and in the bids, beside the plan.
  const dump = judgeLoot({ typeId: 8, name: 'Dump', qty: 10 }, { others: [L(1, true, 50, 100)], highs: null, perDay: null, buyers: 0.5 }, R, 7.5, 0.05);
  const tot = lootTotals(planLoot([good, close, dump, ship], 1, new Set()));
  eq('totals: everything listed, everything in the bids, the plan; the ship left out of all three', [
    Math.round(tot.listed.isk) === Math.round(good.listNet + close.listNet), tot.listed.items, tot.listed.unpriced,
    Math.round(tot.bids.isk) === Math.round(good.bidsNet + close.bidsNet + dump.bidsNet), tot.bids.items,
    Math.round(tot.plan.isk) === Math.round(good.listNet + close.bidsNet + dump.bidsNet), tot.plan.waiting,
  ], [true, 2, 1, true, 3, true, 0]);
  // Stock you bought, for the same paste: priced as Orders prices a new listing, never under break-even.
  const RK = { f: 0.0127, t: 0.03375, k: 0.0026 };
  const mkt = { others: [L(1, false, 100, 20), L(2, true, 60, 500)], highs, perDay: 200, buyers: 0.6 };
  const ok = judgeStock({ typeId: 1, name: 'Bought', qty: 10 }, mkt, 80, RK, 7.5);
  eq('bought stock lists one step under the cheapest listing, over its break-even, with its profit after fees', [ok.price, ok.under, ok.breakEven, Math.round(ok.profit)],
    [99.99, false, 93.15, Math.round(99.99 * 10 * (1 - 0.03375) - Math.max(100, 0.0127 * 99.99 * 10) - 800)]);
  const dear = judgeStock({ typeId: 1, name: 'Dear', qty: 10 }, mkt, 97, RK, 7.5);
  eq('  bought dearer than it sells now: flagged, and priced at break-even, never under', [dear.under, dear.listAt, dear.price, dear.why.startsWith('Where it sells now')], [true, 99.99, 110.8, true]);
  const small = judgeStock({ typeId: 1, name: 'Small', qty: 3 }, { others: [L(1, false, 1500, 5)], highs: Array(14).fill(1600), perDay: 50, buyers: 0.5 }, 1494, RK, 7.5);
  eq('  a small order’s break-even covers the 100 ISK minimum broker fee, so it never shows a loss', [small.breakEven, small.profit >= 0], [1581, true]);
  eq('  nothing to price it from: no price', judgeStock({ typeId: 1, name: 'None', qty: 1 }, { others: [], highs: null, perDay: null, buyers: 0.5 }, 50, RK, 7.5).price, null);
  eq('  the block, as the Sell window takes it', priceBlock([{ name: 'Bought', price: 99.99 }, { name: 'Dear', price: 103 }], 'comma'), 'Bought\t99,99\nDear\t103');
  // Snipes still held are left out like ships: the user's Caldari Navy Uranium Charge S came up as loot to list.
  const { snipesHeld } = await import('../src/lib/sniped.ts');
  const held2 = snipesHeld([{ typeId: 21, at: '2026-09-27T10:00:00Z', units: 100 }, { typeId: 22, at: '2026-09-20T10:00:00Z', units: 5 }, { typeId: 21, at: '2026-09-28T10:00:00Z', units: 20 }],
    [{ typeId: 21, date: '2026-09-27T12:00:00Z', qty: 30, isBuy: false }, { typeId: 21, date: '2026-09-26T12:00:00Z', qty: 500, isBuy: false }, { typeId: 22, date: '2026-09-21T00:00:00Z', qty: 5, isBuy: false }]);
  eq('snipes still held: bought less sold since the first, nothing for one sold out', [...held2.entries()], [[21, { units: 90, at: '2026-09-27T10:00:00Z' }]]);
  const sniped = judgeLoot({ typeId: 21, name: 'Sniped', qty: 50 }, { others: [L(1, false, 100, 20), L(2, true, 60, 500)], highs, perDay: 200, buyers: 0.6 }, R, 7.5, 0.05, 'sniped');
  eq('  left out, and says why; in again once included', [planLoot([sniped], 5, new Set())[0].verdict, planLoot([sniped], 5, new Set())[0].why.startsWith('You sniped it'), planLoot([sniped], 5, new Set([21]))[0].verdict], ['held', true, 'list']);
}

console.log('\n--- when ESI’s copy lets go ---');
{
  const { cacheUntil, rateLimitOf } = await import('../src/lib/cacheHeaders.ts');
  const H = (o) => ({ get: (k) => o[Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase())] ?? null });
  const now = Date.parse('2026-09-29T07:47:00Z');
  // A market book as ESI sent it on 29 September 2026: public, Expires three seconds after its Date.
  eq('Expires as a time-to-live off ESI’s own Date, whatever our clock says', cacheUntil(H({ 'Cache-Control': 'public', Date: 'Tue, 29 Sep 2026 07:46:56 GMT', Expires: 'Tue, 29 Sep 2026 07:46:59 GMT' }), now), now + 3000);
  // Routes CCP moves to caches cleared by events: "the Expires header is no longer meaningful".
  eq('  a max-age wins over Expires, less any Age', cacheUntil(H({ 'Cache-Control': 'private, max-age=120', Age: '20', Expires: 'Tue, 29 Sep 2026 09:00:00 GMT', Date: 'Tue, 29 Sep 2026 07:46:56 GMT' }), now), now + 100_000);
  eq('  no-cache, no-store or a spent max-age name no time, so the caller’s fallback applies', [
    cacheUntil(H({ 'Cache-Control': 'no-cache', Expires: 'Tue, 29 Sep 2026 09:00:00 GMT' }), now), cacheUntil(H({ 'Cache-Control': 'private, no-store' }), now),
    cacheUntil(H({ 'Cache-Control': 'max-age=10', Age: '30' }), now), cacheUntil(H({}), now)], [null, null, null, null]);
  eq('  s-maxage isn’t max-age', cacheUntil(H({ 'Cache-Control': 's-maxage=60', Date: 'Tue, 29 Sep 2026 07:46:56 GMT', Expires: 'Tue, 29 Sep 2026 07:46:59 GMT' }), now), now + 3000);
  eq('the market-order rate limit as ESI states it', rateLimitOf(H({ 'X-Ratelimit-Group': 'market-order', 'X-Ratelimit-Limit': '12000/15m', 'X-Ratelimit-Remaining': '11752' })), { group: 'market-order', remaining: 11752, limit: '12000/15m' });
  eq('  and nothing on a route without one', rateLimitOf(H({ Expires: 'x' })), null);
}

console.log('\n--- the journal keeps each entry’s tax ---');
{
  const { toJournal, journalGainedTax } = await import('../src/lib/esiRecords.ts');
  const { diffRecords } = await import('../src/lib/cloudSync.ts');
  // A freelance reward as ESI's journal gives it: the user's 593,096,000 is 39,200,000 units × 17 × 0.89, the NPC
  // corporation's 11% withheld before the wallet. `tax` and `tax_receiver_id` "only apply to tax related transactions".
  const raw = { id: 23001, date: '2026-10-01T10:37:40Z', ref_type: 'freelance_jobs_reward', amount: 593_096_000, balance: 1e9, first_party_id: 1000125, second_party_id: 95210486,
    description: 'Freelance job reward', reason: 'project_id=0b6c6e0e-8b7f-4d39-9f43-6a1d9f4cbb11:project_name=Mothhat Scordite' };
  const taxed = toJournal({ ...raw, tax: 73_304_000, tax_receiver_id: 1000125 });
  eq('a journal row with tax and tax_receiver_id keeps both', [taxed.tax, taxed.taxReceiverId], [73_304_000, 1000125]);
  eq('  a row without them gains nothing (the record stays as it was)', JSON.stringify(toJournal(raw)).includes('tax'), false);
  eq('  a 0% tax is kept as 0, not dropped', toJournal({ ...raw, tax: 0, tax_receiver_id: 98845591 }).tax, 0);
  // The browser's sync puts each entry read over the one held ({ ...cur.journal, ...fetched.journal }); the cloud copy
  // pushes what diffRecords calls changed. An entry stored before the tax was kept is changed by gaining it.
  const before = { 23001: toJournal(raw), 23002: toJournal({ ...raw, id: 23002, ref_type: 'market_escrow', reason: undefined }) };
  const after = { ...before, 23001: taxed, 23002: toJournal({ ...raw, id: 23002, ref_type: 'market_escrow', reason: undefined }) };
  eq('  the sync’s merge takes the entry that gained its tax, and the cloud copy sends it', diffRecords('journal', before, after), { changed: ['23001'], removed: [] });
  eq('the cloud’s archive: an entry gaining a tax is sent again; one unchanged, or with none to give, isn’t',
    [journalGainedTax(toJournal(raw), taxed), journalGainedTax(taxed, taxed), journalGainedTax(toJournal(raw), toJournal(raw)), journalGainedTax(undefined, taxed), journalGainedTax(taxed, toJournal({ ...raw, tax: 0, tax_receiver_id: 98845591 }))],
    [true, false, false, true, true]);
}

console.log('\n--- freelance jobs to deliver to ---');
{
  const { readDeliverJob, priceDeliver, bestDeliver, deliverFlags } = await import('../src/lib/freelance.ts');
  // The Game Masters job as ESI gave it (29 September 2026): 1,000,000 ISK per Dairy Products, 10 per player.
  const gm = { id: 'x', name: 'FC Jotunn loves his Milk', state: 'Active', progress: { current: 1720, desired: 10000 }, reward: { initial: 10e9, remaining: 8.28e9 },
    details: { expires: '2026-10-05T09:00:00Z', creator: { corporation: { id: 216121397, name: 'Game Masters' } } },
    configuration: { method: 'DeliverItem', parameters: { corporation_item_delivery: { corporation_item_delivery: {
      item_type: { values: [{ value_type: 'item_type', values: ['3717'] }] }, corporation_office_location: { values: [{ value_type: 'station', values: ['60012256'] }] } } } } },
    contribution: { max_committed_participants: 10000, contribution_per_participant_limit: 10, reward_per_contribution: 1000000, submission_multiplier: 1 } };
  const job = readDeliverJob(gm);
  eq('a Deliver job read: what, where, per unit, how many left, the cap', [job.item, job.to, job.perUnit, job.unitsLeft, job.perPlayer, job.corp], [{ kind: 'type', ids: [3717] }, [{ kind: 'station', id: 60012256 }], 1000000, 8280, 10, 'Game Masters']);
  eq('  not a job of another kind, or one with nothing left to pay', [readDeliverJob({ ...gm, configuration: { ...gm.configuration, method: 'KillNPC' } }), readDeliverJob({ ...gm, reward: { initial: 1, remaining: 500000 } })], [null, null]);
  const d = priceDeliver(job, 3717, [{ price: 10990, volume: 4 }, { price: 11500, volume: 100 }]);
  eq('  buy the cheapest listings up to your cap: 10 units, ~110 k, for 10 M', [d.units, Math.round(d.cost), d.pay, Math.round(d.profit), d.limit], [10, 4 * 10990 + 6 * 11500, 10000000, 10000000 - (4 * 10990 + 6 * 11500), 'player']);
  // An uncapped ore job: only the listings under the reward are worth buying.
  const ore = { ...job, perUnit: 21, perPlayer: null, unitsLeft: 14_000_000 };
  const o = priceDeliver(ore, 1224, [{ price: 18, volume: 50000 }, { price: 20.5, volume: 10000 }, { price: 21, volume: 99999 }]);
  eq('  uncapped: only what’s listed under the reward', [o.units, o.limit, Math.round(o.profit)], [60000, 'listed', Math.round(50000 * 3 + 10000 * 0.5)]);
  eq('  nothing listed under it: nothing to do', priceDeliver(ore, 1224, [{ price: 25, volume: 10 }]), null);
  // A group job takes any of its items one apiece: the cheapest listings of all of them, cheapest first.
  const g = bestDeliver(ore, [1, 2], (t) => (t === 1 ? [{ price: 20, volume: 10 }, { price: 22, volume: 99 }] : [{ price: 19, volume: 10 }]));
  eq('  a group job buys every item under the reward, cheapest first, with the price range', [g.units, g.types.map((x) => [x.typeId, x.units]), g.low, g.high], [20, [[2, 10], [1, 10]], 19, 20]);
  // After your corporation's tax (the user's numbers, 1 October 2026): a job paying 17 a unit, Compressed Scordite at
  // 11.79 in Jita. Under an NPC corporation's 11% a unit pays 15.13, so a listing at 15.50 is a loss, not a buy.
  const scord = { ...job, perUnit: 17, perPlayer: null, unitsLeft: 50_000_000 };
  const book = [{ price: 11.79, volume: 1_000_000 }, { price: 15.5, volume: 100_000 }];
  const t11 = priceDeliver(scord, 62516, book, 0.11), t0 = priceDeliver(scord, 62516, book, 0);
  eq('after an 11% tax: what a unit pays you', t11.net, 15.13);
  eq('  the rewards after it', t11.pay, 1_000_000 * 15.13);
  eq('  the tax taken from them', t11.taxed, 1_000_000 * 17 * 0.11);
  eq('  the profit: 3.34 M on a million units', t11.profit, 3_340_000);
  eq('  only the listings under 15.13 are bought', [t11.units, t11.high, t11.taxRate], [1_000_000, 11.79, 0.11]);
  eq('at 0%: the profit is the whole margin, 5.21 M', t0.profit, 5_210_000 + 100_000 * (17 - 15.5));
  eq('  and the listing at 15.50 is worth buying', [t0.units, t0.high, t0.net, t0.taxed], [1_100_000, 15.5, 17, 0]);
  eq('  with no rate given, it prices at the job’s own rate', priceDeliver(scord, 62516, book).profit, t0.profit);
  eq('  a tax that leaves nothing under the reward: nothing to do', priceDeliver(scord, 62516, [{ price: 15.2, volume: 9 }], 0.11), null);
  const { readCorp, afterTax, taxPct } = await import('../src/lib/freelance.ts');
  const AT = '2026-10-01T21:00:00Z';
  // ESI's answers as given on 1 October 2026: the affiliation lookup, then the corporation (tax_rate is a fraction).
  eq('your corporation from ESI’s two answers', readCorp({ character_id: 95210486, corporation_id: 98845591 }, { name: 'TEMP TAX HAVEN', ticker: 'ABAAA', tax_rate: 0.000, member_count: 1 }, AT),
    { id: 98845591, name: 'TEMP TAX HAVEN', ticker: 'ABAAA', taxRate: 0, at: AT });
  eq('  an NPC corporation at 11%', readCorp({ corporation_id: 1000009 }, { name: 'Caldari Provisions', ticker: 'CP', tax_rate: 0.11 }, AT).taxRate, 0.11);
  // What the app is actually sent: with its X-Compatibility-Date (2026-08-18) ESI answers `tax_rates` in percent and no
  // `tax_rate` (both bodies as read on 1 October 2026). Reading only `tax_rate`, every sync read no corporation.
  const { corpRate } = await import('../src/lib/freelance.ts');
  const sak = { state: 'active', type: 'npc_owned', name: 'School of Applied Knowledge', ticker: 'SAK', member_count: 1695771, tax_rates: { isk: 11.0, loyalty_point: 0.0 }, war_eligible: false };
  const temp = { state: 'active', type: 'player_owned', name: 'TEMP TAX HAVEN', ticker: 'ABAAA', date_founded: '2026-10-01T19:39:23Z', ceo_id: 95210486, creator_id: 95210486, member_count: 1, tax_rates: { isk: 0.0, loyalty_point: 0.0 } };
  eq('  ESI’s answer under the app’s compatibility date: tax_rates.isk, in percent', [readCorp({ corporation_id: 1000044 }, sak, AT)?.taxRate, readCorp({ corporation_id: 98845591 }, temp, AT)?.taxRate], [0.11, 0]);
  eq('  a corporation’s rate either way; none given is none, never 0', [corpRate(sak), corpRate(temp), corpRate({ tax_rate: 0.075 }), corpRate({ name: 'X' }), corpRate({ tax_rates: { loyalty_point: 0 } }), corpRate(null)], [0.11, 0, 0.075, null, null, null]);
  eq('  no rate, no corporation or no name: not read, never 0%', [readCorp({ corporation_id: 1 }, { name: 'X', ticker: 'X' }, AT), readCorp(null, { name: 'X', ticker: 'X', tax_rate: 0 }, AT), readCorp({ corporation_id: 1 }, { ticker: 'X', tax_rate: 0 }, AT), readCorp({ corporation_id: 1 }, null, AT)], [null, null, null, null]);
  eq('the rate in words, naming the corporation', [afterTax({ name: 'TEMP TAX HAVEN', taxRate: 0 }), afterTax({ name: 'Caldari Provisions', taxRate: 0.11 }), afterTax(null), afterTax(undefined)],
    ['after TEMP TAX HAVEN’s 0% tax', 'after Caldari Provisions’ 11% tax', 'before tax: your corporation’s tax not read yet', 'before tax: your corporation’s tax not read yet']);
  eq('  a rate as the game shows it', [taxPct(0.11), taxPct(0), taxPct(0.075), taxPct(0.1)], ['11%', '0%', '7.5%', '10%']);
  const { bestOffice, whereToAccept, FILTER_HIDES } = await import('../src/lib/freelance.ts');
  const O = (id, extra) => ({ id, name: String(id), systemId: 1, security: 0.9, unseen: null, jumps: 5, anyJumps: 5, throughGank: false, aroundExtra: null, ...extra });
  eq('the office to deliver to: one you can see, on a high-sec route, fewest jumps, round the gank systems', [
    bestOffice([O(1, { jumps: 5 }), O(2, { jumps: 3 }), O(3, { jumps: 2, unseen: 'cantSee' }), O(4, { jumps: null, anyJumps: 1, security: 0.2 })]).id,
    bestOffice([O(1, { jumps: 3, throughGank: true, aroundExtra: 2 }), O(2, { jumps: 3 })]).id,
  ], [2, 2]);
  eq('where to accept: within 5 jumps of a broadcast system, the nearest named', [whereToAccept([10, 11], (s) => (s === 10 ? 9 : 4)), whereToAccept([10], () => 7), whereToAccept([], () => 1)],
    [{ fromJita: true, nearest: 11, jumps: 4 }, { fromJita: false, nearest: 10, jumps: 7 }, { fromJita: false, nearest: null, jumps: null }]);
  const now = Date.parse('2026-10-04T12:00:00Z');
  eq('flags: a structure ESI won’t describe, low-sec, no high-sec route, gank systems only when there’s no way round, ending within a day', [
    deliverFlags(O(1, { unseen: 'cantSee', systemId: null, jumps: null }), null, now),
    deliverFlags(O(1, { security: 0.3, jumps: null }), '2026-10-05T09:00:00Z', now),
    deliverFlags(O(1, { throughGank: true, aroundExtra: 3 }), null, now),
    deliverFlags(O(1, { throughGank: true, aroundExtra: null }), null, now),
  ], [['cantSee'], ['lowsec', 'noRoute', 'expiring'], [], ['gank']]);
  eq('  and what the default filters hide', FILTER_HIDES, { highsec: ['lowsec', 'noRoute'], gank: ['gank'], dock: ['cantSee', 'unchecked'] });
}

console.log('\n--- blueprints and their contracts ---');
{
  const { untar, csvFields, blueprintContracts, TarSink, TAR_DONE, vanishedSince } = await import('../src/lib/bpContracts.ts');
  const { readBlueprints, comparables, quoteBlueprint, scamFlags, tidy } = await import('../src/lib/blueprints.ts');
  // A tar made here: ustar headers (name, size in octal), each file padded to 512 bytes.
  const tar = (files) => {
    const parts = [];
    for (const [name, text] of files) {
      const body = new TextEncoder().encode(text), h = new Uint8Array(512);
      h.set(new TextEncoder().encode(name)); h.set(new TextEncoder().encode(body.length.toString(8).padStart(11, '0') + '\0'), 124);
      parts.push(h, body, new Uint8Array((512 - (body.length % 512)) % 512));
    }
    parts.push(new Uint8Array(1024));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
  };
  // The snapshot's columns, as EVE Ref wrote them on 29 September 2026.
  const contracts = 'collateral,contract_id,date_expired,date_issued,days_to_complete,end_location_id,issuer_corporation_id,issuer_id,price,reward,start_location_id,title,type,volume,http_last_modified,region_id,station_id,system_id,constellation_id,for_corporation,buyout\n'
    + '0,1,2026-10-10T00:00:00Z,2026-09-20T00:00:00Z,0,60003760,1,11,5000000,0,60003760,"10x ""Rifter"", cheap",item_exchange,0.1,x,10000002,60003760,30000142,1,,\n'
    + '0,2,2026-10-10T00:00:00Z,2026-09-20T00:00:00Z,0,60003760,1,12,9000000,0,60003760,mixed,item_exchange,0.1,x,10000002,60003760,30000142,1,,\n'
    + '0,3,2026-10-10T00:00:00Z,2026-09-20T00:00:00Z,0,60003760,1,13,0,20000000,60003760,WTB,item_exchange,0.1,x,10000002,60003760,30000142,1,,\n'
    + '0,4,2026-10-10T00:00:00Z,2026-09-20T00:00:00Z,0,60008494,1,14,7000000,0,60008494,elsewhere,item_exchange,0.1,x,10000043,60008494,30002187,1,,\n'
    + '0,5,2026-10-10T00:00:00Z,2026-09-20T00:00:00Z,0,60003760,1,15,800000000,0,60003760,Rifter BPO,item_exchange,0.01,x,10000002,60003760,30000142,1,,\n';
  const items = 'is_blueprint_copy,is_included,item_id,material_efficiency,quantity,record_id,runs,time_efficiency,type_id,http_last_modified,contract_id\n'
    + 'true,true,100,10,1,1,10,20,691,x,1\ntrue,true,101,10,1,2,10,20,691,x,1\n'
    + 'true,true,102,10,1,3,10,20,691,x,2\n"",true,103,,5,4,,,34,x,2\n'
    + '"",false,104,0,1,5,,0,691,x,3\n'
    + 'true,true,105,10,1,6,10,20,691,x,4\n'
    + '"",true,106,10,1,7,,20,691,x,5\n';
  const files = untar(tar([['meta.json', '{"scrape_end":"2026-09-29T09:30:43Z"}'], ['contracts.csv', contracts], ['contract_items.csv', items]]));
  eq('the snapshot’s files out of the tar', [...files.keys()], ['meta.json', 'contracts.csv', 'contract_items.csv']);
  eq('a CSV field with commas and doubled quotes', csvFields('1,"10x ""Rifter"", cheap",x'), ['1', '10x "Rifter", cheap', 'x']);
  const got = blueprintContracts(files, { region: 10000002, now: Date.parse('2026-09-29T00:00:00Z') });
  eq('blueprint-only sales in The Forge: not a bundle with minerals, a WTB, or another region', got.contracts.map((c) => c.id), [1, 5]);
  eq('  a copy with its runs; an original without', [got.contracts[0].items[0], got.contracts[1].items[0].runs, got.at], [{ typeId: 691, copy: true, me: 10, te: 20, runs: 10, qty: 1, itemId: 100 }, null, '2026-09-29T09:30:43Z']);
  // The sink the cloud decodes into: only the files wanted, stopping once they're in.
  const sink = new TarSink(['contracts.csv']);
  let stopped = false;
  try { for (const b of tar([['meta.json', '{}'], ['contracts.csv', 'a,b\n1,2\n'], ['contract_bids.csv', 'never read']])) sink.writeByte(b); } catch (e) { stopped = e === TAR_DONE; }
  eq('  the sink keeps what’s wanted and stops once it has it', [stopped, [...sink.files.keys()], new TextDecoder().decode(sink.files.get('contracts.csv'))], [true, ['contracts.csv'], 'a,b\n1,2\n']);
  // Vanished before expiry: gone, not expired, not relisted by the same seller (a reprice).
  const C = (id, issuer, itemId, expires = '2026-10-10T00:00:00Z') => ({ id, price: 1, issued: 'x', expires, stationId: 60003760, issuer, title: '', items: [{ typeId: 691, copy: true, me: 10, te: 20, runs: 10, qty: 1, itemId }] });
  const older = [C(1, 11, 100), C(2, 12, 200), C(3, 13, 300), C(4, 14, 400, '2026-09-28T00:00:00Z'), C(5, 15, 500)];
  const newer = [C(1, 11, 100), C(9, 12, 200), C(8, 99, 300)];
  eq('vanished before expiry: not still listed, repriced by its seller, or expired; bought and relisted by another counts', vanishedSince(older, newer, Date.parse('2026-09-29T00:00:00Z')).map((c) => c.id), [3, 5]);
  // Pricing a blueprint you hold.
  eq('your blueprints read: a copy, an original, a stack of unused originals', readBlueprints([
    { item_id: 1, type_id: 691, location_id: 7, location_flag: 'Hangar', quantity: -2, runs: 10, material_efficiency: 10, time_efficiency: 20 },
    { item_id: 2, type_id: 691, location_id: 7, location_flag: 'Hangar', quantity: -1, runs: -1, material_efficiency: 10, time_efficiency: 20 },
    { item_id: 3, type_id: 691, location_id: 7, location_flag: 'Hangar', quantity: 3, runs: -1, material_efficiency: 0, time_efficiency: 0 },
  ]).map((b) => [b.copy, b.runs, b.count, b.unused]), [[true, 10, 1, false], [false, null, 1, false], [false, null, 3, true]]);
  const K = (runs, each, extra = {}) => ({ typeId: 691, copy: true, me: 10, te: 20, runs, contractId: Math.round(each), each, count: 1, stationId: 60003760, title: '', issued: 'x', ...extra });
  const q = quoteBlueprint({ typeId: 691, copy: true, me: 10, te: 20, runs: 10 }, [K(10, 2e6), K(10, 2.2e6), K(10, 2.4e6), K(10, 9e6)], [K(10, 1.9e6), K(10, 2.1e6)]);
  eq('exact comparables: asks, what sold, and the price to list at (what sold, under the median ask)', [q.basis, q.asks, Math.round(q.low), Math.round(q.median), q.sold, q.suggest], ['exact', 4, 2150000, 2300000, 2, 2000000]);
  const r = quoteBlueprint({ typeId: 691, copy: true, me: 10, te: 20, runs: 10 }, [K(1, 300000), K(1, 320000), K(5, 1.2e6)], []);
  eq('  other runs scaled by runs^0.79, nothing sold: the cheapest quarter of asks', [r.basis, Math.round(r.cheapest.scaled), r.suggest], ['runs', Math.round(300000 * 10 ** 0.79), tidy(Math.min(...[300000 * 10 ** 0.79, 320000 * 10 ** 0.79, 1.2e6 * 2 ** 0.79].sort((a, b) => a - b).slice(0, 2).map((x, i, a) => a[0] + (a[1] - a[0]) * 0.5)))]);
  eq('  nothing like it: no price', quoteBlueprint({ typeId: 1, copy: true, me: 0, te: 0, runs: 1 }, [], []).suggest, null);
  const { unusedPrice } = await import('../src/lib/blueprints.ts');
  const researched = { basis: 'research', suggest: 3.2e9 };
  eq('an unused original: one step under the market’s cheapest listing, not researched ones’ 3.2 B; an exact contract match can undercut it; no listing, the contracts',
    [unusedPrice(researched, 1.135e9), unusedPrice({ basis: 'exact', suggest: 1.1e9 }, 1.135e9), unusedPrice({ basis: 'exact', suggest: 1.1e9 }, null)],
    [{ price: 1134000000, where: 'market' }, { price: 1.1e9, where: 'contract' }, { price: 1.1e9, where: 'contract' }]);
  eq('a title that claims what the contract isn’t', [scamFlags({ copy: true, me: 9, te: 18, title: '10/20 Fully Researched BPO', stationId: 60003760 }), scamFlags({ copy: false, me: 10, te: 20, title: 'ME10 TE20', stationId: 60008494 })],
    [['saysOriginal', 'saysResearch'], ['notJita']]);
}

console.log('\n--- what each freelance job made ---');
{
  const { rewardJob, isFreelanceTrade } = await import('../src/lib/freelance.ts');
  const id = 'b11ad07b-2c43-4136-8be1-fa88aedae466';
  const reason = `project_id=${id}:project_name=ISK Scordite best ISK for delivery`;
  eq('a reward names its job', rewardJob(reason), id);
  const J = (amount) => ({ date: '2026-09-29T11:40:00Z', refType: 'freelance_jobs_reward', amount, reason });
  const T = (tid, qty, unitPrice, isBuy = true, typeId = 92374) => ({ id: tid, typeId, date: '2026-09-29T11:30:00Z', isBuy, qty, unitPrice });
  eq('a freelance trade: an item a joined job takes, after it began', [isFreelanceTrade([{ types: [92374], created: '2026-09-14T00:00:00Z' }], { typeId: 92374, date: '2026-09-29T11:21:34Z' }),
    isFreelanceTrade([{ types: [92374], created: '2026-09-30T00:00:00Z' }], { typeId: 92374, date: '2026-09-29T11:21:34Z' }), isFreelanceTrade([{ types: [92374], created: null }], { typeId: 34, date: 'x' })], [true, false, false]);
  const { categoryOf, flows } = await import('../src/lib/wallet.ts');
  const { attribute } = await import('../src/lib/results.ts');
  eq('the Wallet: a reward is Freelance rewards, not Other income', categoryOf({ refType: 'freelance_jobs_reward', amount: 1 }).label, 'Freelance rewards');
  const fl = flows([], [T('a', 100, 12)], () => ({ tracked: false, tag: 'other', freelance: true }), 0);
  eq('  and the items bought for it are their own line, not Other purchases', fl.outs.map((l) => [l.key, Math.round(l.amount)]), [['freelanceBuys', 1200]]);
  const ev = attribute({ txs: [T('a', 100, 12)], journal: [J(1700)], tracked: new Set(), realized: [], losses: [], sets: { filaments: new Set(), abyssLoot: new Set(), pi: new Set(), lpGoods: new Set() }, freelance: () => true, salesTax: 0.03 });
  eq('Results: Freelance is the rewards less what the items cost', ev.map((e) => [e.activity, Math.round(e.isk)]), [['Freelance', -1200], ['Freelance', 1700]]);
}

console.log('\n--- every freelance job you did (the user’s six, 1 October 2026) ---');
{
  const fsF = await import('node:fs');
  const F = JSON.parse(fsF.readFileSync(new URL('./fixtures/freelance-history.json', import.meta.url), 'utf8'));
  const { jobFromDetail, jobHistory, isFreelanceTrade, readReward, corpSpans, corpsAt, rewardJobName, mergeJobs, stubJob, jobEnd, tradesReadTo, purchasesPending, TRADES_CACHE_MS } = await import('../src/lib/freelance.ts');
  const { flows } = await import('../src/lib/wallet.ts');
  const ME = 95210486;
  const typesOf = (raw) => {
    const it = raw.configuration.parameters.corporation_item_delivery.corporation_item_delivery.item_type.values[0];
    return it.value_type === 'item_group' ? it.values.flatMap((g) => F.groups[g]) : it.values.map(Number);
  };
  const jobs = F.jobs.map((r) => jobFromDetail(r, typesOf(r)));
  const ISK = 'b11ad07b-2c43-4136-8be1-fa88aedae466', VELD = 'a13f2971-a371-4eb0-947a-4b02a9d7edc2', MOTH = 'b050742a-481c-4929-ad87-366599b14cc6',
    KERN = '98750873-3cd7-4b65-b9c2-2f2ed0d8d23c', BB1 = '348b49ee-d66f-4ae4-b98e-eb05961781d2', BB2 = '5a528bf4-1bcf-4425-b626-d15061f87e60';
  const k = jobs.find((j) => j.id === KERN);
  eq('a finished job read from ESI’s details: its rate before tax, when it ran, who posted it, what it takes',
    [k.perUnit, k.created, k.finished, k.by, k.state, k.item, k.types.includes(62537), k.progress], [400, '2026-10-01T17:52:01.802Z', '2026-10-01T19:29:57.872Z', { character: 'Galine Bro', corp: 'Nova Genesis Aventure' }, 'Completed', { kind: 'group', ids: [457] }, true, { current: 2000000, desired: 2000000 }]);
  eq('a reward’s job name as ESI escapes it in the reason', [rewardJobName(F.journal.find((e) => e.reason.includes(KERN)).reason), rewardJobName(F.journal.find((e) => e.reason.includes(BB1)).reason), rewardJobName('x'), rewardJobName('project_id=x:project_name=a \\\\ b')],
    ['/!\\ Mining Kernite', '..::Buy Back::.. Scordite - all type ✓', null, 'a \\ b']);

  // The corporations you were in: ESI's history (a day behind on 1 October: still School of Applied Knowledge) and the one
  // you're in now, TEMP TAX HAVEN, which you founded at 19:39:23, after the Kernite reward and before the Buy Backs.
  const bodies = new Map(Object.entries(F.corps).map(([id, b]) => [Number(id), b]));
  const since = Date.parse('2026-09-29T11:30:18Z');
  const now = { id: 98845591, body: F.corps[98845591] };
  const spans = corpSpans(ME, F.corpHistory, since, bodies, now);
  eq('the corporations you were in since the first reward: the history’s, then the one you founded, from when you founded it', spans,
    [{ id: 1000044, name: 'School of Applied Knowledge', start: '2025-05-30T01:17:00Z', taxRate: 0.11 }, { id: 98845591, name: 'TEMP TAX HAVEN', start: '2026-10-01T19:39:23Z', taxRate: 0 }]);
  const behind = corpSpans(ME, F.corpHistory, since, bodies, { id: 98845591, body: { ...F.corps[98845591], creator_id: 1 } });
  eq('  one you didn’t found, not in the history yet: joined when, not known', behind[1].start, null);
  eq('  the history caught up: as it says', corpSpans(ME, [...F.corpHistory, { corporation_id: 98845591, start_date: '2026-10-01T19:40:00Z' }], since, bodies, now).map((x) => [x.id, x.start]),
    [[1000044, '2025-05-30T01:17:00Z'], [98845591, '2026-10-01T19:40:00Z']]);
  eq('  at a time after the history’s last entry while it’s behind: either corporation', [corpsAt(behind, Date.parse('2026-10-01T19:30:03Z')).map((x) => x.id), corpsAt(spans, Date.parse('2026-10-01T19:30:03Z')).map((x) => x.id), corpsAt(spans, Date.parse('2026-10-01T20:15:31Z')).map((x) => x.id), corpsAt(spans, Date.parse('2020-01-01T00:00:00Z'))],
    [[1000044, 98845591], [1000044], [98845591], []]);

  // The real anchors, as the user's ledger says (worked out by hand: each job's own purchases, lot by lot).
  const want = {
    [BB2]: { received: 330_000_000, tax: 0, delivered: 20_000_000, cost: 238_038_144.10, held: 0, profit: 91_961_855.90 },
    [BB1]: { received: 332_000_000, tax: 0, delivered: 20_000_000, cost: 238_147_164.01, held: 0, profit: 93_852_835.99 },
    [KERN]: { received: 712_000_000, tax: 88_000_000, delivered: 2_000_000, cost: 371_389_119.90, held: 0, profit: 340_610_880.10 },
    [MOTH]: { received: 244_887_976.7, tax: 30_267_053.3, delivered: 16_185_590, cost: 192_770_376.90, held: 0, profit: 52_117_599.80 },
    // 4,909,800 × 11.76 + 361,663 × 11.77 + 10,000,000 × 11.79 + 22,860,949 × 11.79 on 29 Sep, 46,914,809 × 11.91 on 1 Oct.
    // The 813,258 bought at 21.96 at 12:03:02 on 29 Sep went onto a sell order 44 s later and is still there: never delivered.
    [ISK]: { received: 1_286_764_453.73, tax: 159_038_303.27, delivered: 85_047_221, cost: 1_008_181_985.41, held: 813_258, profit: 278_582_468.32 },
    [VELD]: { received: 881_931_019.7, tax: 109_002_710.3, delivered: 99_093_373, cost: 745_182_164.96, held: 0, profit: 136_748_854.74 },
  };
  const pick = (r) => ({ received: Math.round(r.received * 100) / 100, tax: r.tax, delivered: r.delivered, cost: r.cost, held: r.held, profit: r.profit });
  const skip = new Set();
  // As the journal gives the tax, if ESI does: each reward's tax is its units at the job's rate less what it paid.
  const unitsOf = { '26092034024': 6_000_000, '26092017341': 16_860_949, '26091997022': 15_271_463, '26098695939': 40_293_373, '26098684443': 58_800_000, '26098766520': 16_185_590,
    '26098732630': 7_714_809, '26098720419': 39_200_000, '26100300463': 2_000_000, '26100497054': 20_000_000, '26100436303': 20_000_000 };
  const per = Object.fromEntries(jobs.map((j) => [j.id, j.perUnit]));
  const taxed = F.journal.map((e) => ({ ...e, tax: Math.round((unitsOf[e.id] * per[e.reason.slice(11, 47)] - e.amount) * 100) / 100 }));
  const exact = jobHistory({ jobs, journal: taxed, txs: F.txs, skip });
  eq('with the journal’s tax: newest first, each job’s rewards, tax, units, cost, leftover and profit', exact.rows.map((r) => [r.job.id, pick(r)]), Object.entries(want));
  eq('  every reward’s tax from the journal', exact.rows.flatMap((r) => r.rewards.map((x) => x.how)).every((h) => h === 'esi'), true);
  eq('  the total row', [exact.total.received, exact.total.payments, exact.total.tax, exact.total.delivered, exact.total.cost, exact.total.held, exact.total.heldCost, exact.total.profit, exact.total.unknown],
    [3_787_583_450.13, 11, 386_308_066.87, 242_326_184, 2_793_708_955.28, 813_258, 17_859_145.68, 993_874_494.85, 0]);
  const isk = exact.rows.find((r) => r.job.id === ISK);
  eq('  the leftover stays with the job paid next after it: ISK Scordite, at what it cost', [isk.heldCost, isk.low, isk.high, isk.fromStock], [17_859_145.68, 11.76, 11.91, 0]);
  // Four Scordite jobs ran over each other between 29 September and 1 October: each purchase is taken once.
  const scordLots = F.txs.filter((t) => t.typeId === 92374).reduce((s, t) => s + t.qty * t.unitPrice, 0);
  const scordRows = exact.rows.filter((r) => [ISK, MOTH, BB1, BB2].includes(r.job.id));
  eq('  overlapping Scordite jobs count each purchase once: their cost and leftover add up to what was bought', Math.round(scordRows.reduce((s, r) => s + r.cost + r.heldCost, 0) * 100), Math.round(scordLots * 100));

  // Without the journal's tax: worked out from the corporation you were in then, only where the reward is exact at its rate.
  const derived = jobHistory({ jobs, journal: F.journal, txs: F.txs, skip, corps: spans });
  eq('without it: the same figures, worked out from School of Applied Knowledge’s 11% and TEMP TAX HAVEN’s 0%', derived.rows.map((r) => [r.job.id, pick(r)]), Object.entries(want));
  eq('  each says how, and whose rate', derived.rows.map((r) => [...new Set(r.rewards.map((x) => `${x.how} ${x.corp} ${x.rate}`))]),
    [['derived TEMP TAX HAVEN 0'], ['derived TEMP TAX HAVEN 0'], ['derived School of Applied Knowledge 0.11'], ['derived School of Applied Knowledge 0.11'], ['derived School of Applied Knowledge 0.11'], ['derived School of Applied Knowledge 0.11']]);
  const none = jobHistory({ jobs, journal: F.journal, txs: F.txs, skip });
  eq('  with no corporation history read: no rate is assumed, the tax is not recorded and the units not known; the rewards still show',
    none.rows.map((r) => [r.received > 0, r.tax, r.taxUnknown, r.delivered, r.profit, r.rewards[0].why]), none.rows.map((r) => [true, 0, r.rewards.length, null, null, 'history']));
  eq('  and its total claims none of it: every payment not recorded, no job counted, nothing said to be left over',
    [none.total.payments, none.total.taxUnknown, none.total.unknown, none.total.delivered, none.total.cost, none.total.held, none.total.received], [11, 11, 6, 0, 0, 0, 3_787_583_450.13]);
  // Arithmetic alone can't tell: 593,096,000 is a whole number of units at 0% (34,888,000) as well as at 11% (39,200,000).
  const stale = jobHistory({ jobs, journal: F.journal, txs: F.txs, skip, corps: behind });
  const read = (id) => stale.rows.find((r) => r.job.id === ISK).rewards.find((x) => x.id === id);
  eq('  while ESI’s history is behind: a reward exact at only one of the two rates is worked out; one exact at both is not recorded',
    [read('26092017341').how, read('26092017341').rate, read('26098720419').how, read('26098720419').why, stale.rows.find((r) => r.job.id === KERN).delivered, stale.rows.find((r) => r.job.id === BB1).delivered],
    ['derived', 0.11, null, 'fits', null, 20_000_000]);
  eq('  a reward that fits no rate of the corporation then isn’t forced', readReward({ date: '2026-09-29T11:40:05Z', amount: 255106158.37 }, { ...jobs[0], perUnit: 16 }, spans).why, 'fits');
  eq('  a finished job’s deliveries can’t pass what everyone delivered to it', readReward({ date: '2026-10-01T20:15:31Z', amount: 415_000_000 }, jobs.find((j) => j.id === BB1), spans).why, 'fits');

  // A job paid after your trades are read: its units "not bought for it" may be purchases EVE hasn't shown yet. The user's
  // Добыча Veldspar* (2 October 2026): paid 208 M at 17:33:16 for 8,000,000 bought at 17:26:54; trades read to 17:00:11.
  const veld = { rewards: [{ at: '2026-10-02T17:33:16Z' }], fromStock: 8_000_000 };
  const readVeld = tradesReadTo('2026-10-02T18:00:11Z', Date.parse('2026-10-02T17:00:11Z'));
  eq('trades are read to when EVE’s copy was taken (an hour before new ones can appear) or the newest trade held, whichever is later',
    [TRADES_CACHE_MS, new Date(readVeld).toISOString(), new Date(tradesReadTo('2026-10-02T17:30:00Z', Date.parse('2026-10-02T17:00:11Z'))).toISOString(), tradesReadTo(undefined, null)],
    [3_600_000, '2026-10-02T17:00:11.000Z', '2026-10-02T17:00:11.000Z', null]);
  eq('  a job paid after that: its units not matched to a purchase may still be bought ones; paid before it, they are stock you didn’t buy',
    [purchasesPending(veld, readVeld), purchasesPending(veld, Date.parse('2026-10-02T18:05:00Z')), purchasesPending({ ...veld, fromStock: 0 }, readVeld), purchasesPending(veld, null), purchasesPending({ rewards: [], fromStock: 5 }, readVeld)],
    [true, false, false, true, false]);

  const T = (id, date, typeId = 92374) => ({ id, typeId, date, isBuy: true, qty: 1000, unitPrice: 11.9 });
  // The journal's tax is checked like a worked-out one: (amount + tax) must be a whole number of units at the job's rate.
  const isk1 = jobs.find((j) => j.id === ISK);
  const fit = readReward({ date: '2026-10-01T10:12:08Z', amount: 593_096_000, tax: 73_304_000 }, isk1, []);
  const misfit = readReward({ date: '2026-10-01T10:12:08Z', amount: 593_096_000, tax: 0.11 }, isk1, spans);
  const misfitNone = readReward({ date: '2026-10-01T10:12:08Z', amount: 593_096_000, tax: 0.11 }, isk1, []);
  eq('the journal’s tax when it comes out whole: 39,200,000 units from the journal', [fit.how, fit.units, fit.tax], ['esi', 39_200_000, 73_304_000]);
  eq('  when it doesn’t (a rate, not an amount): set aside, worked out instead, or not recorded with no history', [misfit.how, misfit.units, misfit.journalTax, misfitNone.how, misfitNone.units, misfitNone.journalTax],
    ['derived', 39_200_000, 0.11, null, null, 0.11]);
  // A job kept as Active that ESI stopped describing closes at its expiry, not never.
  const { isRunning } = await import('../src/lib/freelance.ts');
  const stuck = { ...isk1, state: 'Active', finished: null, expires: '2026-10-05T00:00:00Z' };
  eq('a job kept as running that ESI stopped describing closes at its expiry', [isFreelanceTrade([stuck], T('x', '2026-10-04T00:00:00Z')), isFreelanceTrade([stuck], T('y', '2026-10-06T00:00:00Z')),
    isRunning(stuck, Date.parse('2026-10-04T00:00:00Z')), isRunning(stuck, Date.parse('2026-10-06T00:00:00Z'))], [true, false, true, false]);
  const { possessive } = await import('../src/lib/freelance.ts');
  eq('a corporation’s possessive', [possessive('Caldari Provisions'), possessive('TEMP TAX HAVEN'), possessive('Mothhat')], ['Caldari Provisions’', 'TEMP TAX HAVEN’s', 'Mothhat’s']);

  // The Wallet: those purchases are freelance; a purchase after its job finished, or before one began, isn't.
  eq('the Wallet’s rule: purchases while a job ran are its, even once it’s finished; after it finished, or before it began, not',
    [isFreelanceTrade(jobs, T('a', '2026-09-29T12:03:02Z')), isFreelanceTrade(jobs, T('b', '2026-10-01T20:30:20Z')), isFreelanceTrade(jobs, T('c', '2026-10-01T21:00:00Z')),
      isFreelanceTrade(jobs, T('d', '2026-09-27T22:22:48Z', 20)), isFreelanceTrade(jobs, T('e', '2026-10-01T10:05:00Z', 92372)), isFreelanceTrade(jobs, T('f', '2026-10-01T09:58:16Z', 92372))],
    [true, true, false, false, false, true]);
  const fixtureBuys = F.txs.filter((t) => t.isBuy);
  const wallet = flows([], fixtureBuys, (tx) => ({ tracked: false, tag: 'other', freelance: isFreelanceTrade(jobs, tx) }), 0);
  const notKernite = fixtureBuys.filter((t) => t.typeId !== 20).reduce((s, t) => s + t.qty * t.unitPrice, 0);
  eq('  the user’s ore purchases are "Bought for freelance jobs", all but the Kernite from 27 September, before that job', wallet.outs.map((l) => [l.label, Math.round(l.amount)]),
    [['Bought for freelance jobs', Math.round(notKernite)], ['Other purchases', 8000 * 513.5]]);
  eq('  a job’s window ends when it finished: Veldspar at 10:00:16 on 1 October', jobEnd(jobs.find((j) => j.id === VELD)), Date.parse('2026-10-01T10:00:16.829Z'));
  const after = jobHistory({ jobs, journal: taxed, txs: [...F.txs, { ...T('late', '2026-10-01T21:00:00Z'), qty: 500_000 }], skip });
  eq('  and in the history: a purchase after every Scordite job finished is no job’s leftover', after.total.held, 813_258);

  // Delivered from stock not bought for it (mined, contracted from the alt, bought before it began): said apart, never costed at 0.
  const short = jobHistory({ jobs, journal: taxed, txs: F.txs, skip: new Set(['6884676459']) }).rows.find((r) => r.job.id === BB2);
  eq('units delivered beyond what you bought for it: from stock you didn’t buy, with no cost', [short.fromBought, short.fromStock, short.cost, short.profit],
    [3_814_410, 16_185_590, 45_429_623.1, Math.round((330_000_000 - 45_429_623.1) * 100) / 100]);
  const mined = jobHistory({ jobs: jobs.filter((j) => j.id === VELD), journal: taxed.filter((e) => e.reason.includes(VELD)), txs: [], skip }).rows[0];
  eq('  all of it, when nothing was bought', [mined.delivered, mined.fromBought, mined.fromStock, mined.cost, mined.profit], [99_093_373, 0, 99_093_373, 0, 881_931_019.7]);

  // A job ESI won't describe: its rewards still show, under the name the reward gives, and nothing is guessed.
  const gone = 'deadbeef-0000-4000-8000-000000000000';
  const lost = jobHistory({ jobs, journal: [...taxed, { id: '1', date: '2026-09-30T08:00:00Z', refType: 'freelance_jobs_reward', amount: 5_000_000, reason: `project_id=${gone}:project_name=Old \\u2713 job` }], txs: F.txs, skip });
  const g = lost.rows.find((r) => r.job.id === gone);
  eq('a job ESI won’t describe still lists its rewards, and claims nothing else', [g.job.name, g.job.described, g.received, g.delivered, g.profit, g.rewards[0].why, lost.total.unknown, lost.total.received],
    ['Old ✓ job', false, 5_000_000, null, null, 'rate', 1, 3_787_583_450.13 + 5_000_000]);
  eq('  nor does one kept as a stub', jobHistory({ jobs: [stubJob(KERN, 'x')], journal: taxed.filter((e) => e.reason.includes(KERN)), txs: F.txs, skip }).rows.map((r) => [r.received, r.tax, r.delivered, r.held]), [[712_000_000, 88_000_000, null, 0]]);

  // A sale takes what was left over, oldest first, for the job that purchase was left with: the 813,258 at 21.96 is ISK
  // Scordite's, whichever job runs when its sell order (7432972978) fills.
  const sale = { id: 's1', typeId: 92374, date: '2026-09-30T12:00:00Z', isBuy: false, qty: 813_258, unitPrice: 21.9 };
  const sold = jobHistory({ jobs, journal: [...taxed, { date: sale.date, refType: 'transaction_tax', amount: -600_000, contextId: 's1' }], txs: [...F.txs, sale], skip });
  const si = sold.rows.find((r) => r.job.id === ISK);
  const fetched = Math.round((813_258 * 21.9 - 600_000) * 100) / 100;
  eq('  sold again: what it fetched after the journal’s tax, less what it cost, in the profit of the job it was bought for', [si.sold, si.revenue, si.soldCost, si.held, si.profit, sold.rows.find((r) => r.job.id === MOTH).profit],
    [813_258, fetched, 17_859_145.68, 0, Math.round((278_582_468.32 + fetched - 17_859_145.68) * 100) / 100, 52_117_599.8]);
  // The review's reproductions (final-review.md, I1): the sell order filling at 20:10 on 1 October, during the first Buy Back.
  const fill = { id: 's2', typeId: 92374, date: '2026-10-01T20:10:00Z', isBuy: false, qty: 813_258, unitPrice: 21.96 };
  const during = jobHistory({ jobs, journal: taxed, txs: [...F.txs, fill], skip });
  const bb = during.rows.find((r) => r.job.id === BB1), isk2 = during.rows.find((r) => r.job.id === ISK);
  eq('  a leftover sold during a later job stays the earlier job’s: the Buy Back keeps its own purchases and profit', [bb.profit, bb.fromStock, bb.sold, isk2.sold, isk2.held],
    [93_852_835.99, 0, 0, 813_258, 0]);
  eq('  and after every Scordite job finished, the sale still clears it: nothing left over', jobHistory({ jobs, journal: taxed, txs: [...F.txs, { ...fill, id: 's3', date: '2026-10-02T09:00:00Z' }], skip }).total.held, 0);
  // 5,000,000 Veldspar not bought (mined, or contracted from the alt) sold on 20 September, while the Veldspar job ran.
  const mine = { id: 's4', typeId: 92372, date: '2026-09-20T12:00:00Z', isBuy: false, qty: 5_000_000, unitPrice: 7.15 };
  const v = jobHistory({ jobs, journal: taxed, txs: [...F.txs, mine], skip }).rows.find((r) => r.job.id === VELD);
  eq('  units sold while a job ran that weren’t bought for it: said apart, out of its profit, never costed at 0', [v.profit, v.sold, v.soldOther, v.soldOtherRevenue],
    [136_748_854.74, 0, 5_000_000, 35_750_000]);

  // Kept: nothing dropped, and a job ESI won't describe this time keeps what was read before.
  const merged = mergeJobs(jobs.slice(0, 3), [stubJob(ISK, 'x'), jobs[3]]);
  eq('the history after a read keeps every job, and a stub never replaces what was read', [merged.length, merged.find((j) => j.id === ISK).perUnit, merged.find((j) => j.id === ISK).described], [4, 17, true]);
  const { withRead } = await import('../src/lib/freelance.ts');
  // What the sync once did: ESI's joined list held only the job running, and replaced the list with it.
  const running = { ...jobs[0], id: 'aaaaaaaa-0000-4000-8000-000000000000', state: 'Active', finished: null, joined: true };
  const kept = withRead({ at: 'before', jobs, corps: spans }, { at: 'now', jobs: [running] });
  eq('  a read holding only the job running keeps every finished one, running first, and the corporations', [kept.at, kept.jobs.length, kept.jobs[0].id, kept.corps.length], ['now', 7, running.id, 2]);
  const { sharedDoc, applyPulled } = await import('../src/lib/cloudSync.ts');
  eq('  it stays in this browser: never sent to the cloud, and a pulled meta doesn’t replace it', [sharedDoc('meta', { freelance: { jobs }, walletBalance: 1 }), applyPulled({ meta: { freelance: { at: 'here', jobs } } }, { records: [], docs: [{ key: 'meta', d: { freelance: { at: 'there', jobs: [] }, walletBalance: 2 } }] }).meta.freelance.at],
    [{ walletBalance: 1 }, 'here']);
}

console.log('\n--- jumps across the stargates ---');
{
  const { jumpsFrom, reachFrom, routeTo } = await import('../src/lib/jumps.ts');
  // A little map: Jita (1) – A (2, high) – Uedama (3, high) – B (4, high); Jita – L (5, low) – B; A – C (6, high) – D (7) – B.
  const g = { 1: [0.95, 'Jita', [2, 5]], 2: [0.8, 'A', [1, 3, 6]], 3: [0.5, 'Uedama', [2, 4]], 4: [0.7, 'B', [3, 5, 7]], 5: [0.3, 'L', [1, 4]], 6: [0.9, 'C', [2, 7]], 7: [0.6, 'D', [6, 4]], 8: [0.9, 'Island', []] };
  const any = jumpsFrom(g, 1);
  eq('jumps any way', [any.get(4), any.get(8)], [2, undefined]);
  const r = reachFrom(g, 1, ['Uedama', 'Sivala']);
  eq('B: 3 jumps in high-sec through Uedama, 4 round it; 2 through low-sec', routeTo(r, 4), { jumps: 3, anyJumps: 2, throughGank: true, aroundExtra: 1 });
  eq('  L itself: no high-sec route', routeTo(r, 5).jumps, null);
}

console.log('\n--- a lost ship as a fitting ---');
{
  const { fitSlot, fittingFromLoss } = await import('../src/lib/combat.ts');
  eq('killmail flags as the fittings API names slots', [11, 18, 19, 27, 34, 92, 125, 87, 5, 90, 158].map(fitSlot), ['LoSlot0', 'LoSlot7', 'MedSlot0', 'HiSlot0', 'HiSlot7', 'RigSlot0', 'SubSystemSlot0', 'DroneBay', 'Cargo', null, 'FighterBay']);
  // A Jackdaw's fit: two launchers with charges loaded in them, a script in its guidance computer, drones, cargo ammo.
  const k = { time: '2026-09-29T10:00:00Z', victim: { shipTypeId: 34828, damage: 0 }, items: [
    { typeId: 2404, flag: 27, destroyed: 1, dropped: 0 }, { typeId: 27361, flag: 27, destroyed: 20, dropped: 0 },
    { typeId: 2404, flag: 28, destroyed: 0, dropped: 1 }, { typeId: 27361, flag: 28, destroyed: 20, dropped: 0 },
    { typeId: 35790, flag: 11, destroyed: 1, dropped: 0 }, { typeId: 35795, flag: 11, destroyed: 1, dropped: 0 },
    { typeId: 2488, flag: 87, destroyed: 2, dropped: 0 }, { typeId: 27361, flag: 5, destroyed: 0, dropped: 900 }, { typeId: 34, flag: 134, destroyed: 5, dropped: 0 },
  ] };
  const f = fittingFromLoss(k, 'Jackdaw', 'Uedama', (t) => t === 27361 || t === 35795);
  eq('modules in their slots; loaded charges and a script to the cargo with the rest; drones kept; an ore hold left out', f.items, [
    { flag: 'HiSlot0', quantity: 1, type_id: 2404 }, { flag: 'Cargo', quantity: 940, type_id: 27361 }, { flag: 'HiSlot1', quantity: 1, type_id: 2404 },
    { flag: 'LoSlot0', quantity: 1, type_id: 35790 }, { flag: 'Cargo', quantity: 1, type_id: 35795 }, { flag: 'DroneBay', quantity: 2, type_id: 2488 },
  ]);
  eq('  named with the day it was lost, within a fitting’s 50 characters', [f.name, f.ship_type_id], ['Jackdaw (lost 2026-09-29)', 34828]);
}

console.log('\n--- who killed you ---');
{
  const { finalBlow, fleetShips } = await import('../src/lib/combat.ts');
  const A = (shipTypeId, damage, finalBlow = false) => ({ shipTypeId, damage, finalBlow, characterId: 1 });
  const gank = [A(17480, 900), A(17480, 1200, true), A(17480, 800), A(16242, 600), A(16242, 500), A(24690, 3000), { damage: 10 }];
  eq('the final blow is the one the killmail marks, not the most damage', finalBlow(gank).damage, 1200);
  eq('  without a mark, the most damage', finalBlow([A(1, 5), A(2, 9)]).shipTypeId, 2);
  eq('  and nobody on an empty list', finalBlow([]), null);
  eq('a fleet: ships counted, most common first, the rest and the unknown apart',
    fleetShips(gank, 2), { ships: [{ typeId: 17480, n: 3 }, { typeId: 16242, n: 2 }], rest: 1, unknown: 1 });
}

console.log('\n--- your contracts ---');
{
  const { readContracts, couriersDue, itemsToRead, contractSaid } = await import('../src/lib/contracts.ts');
  const { judgeCourierJob } = await import('../src/lib/todo.ts');
  const me = 95210486;
  const C = (id, type, status, issuer, acceptor, extra = {}) => ({ contract_id: id, type, status, issuer_id: issuer, acceptor_id: acceptor, assignee_id: 0, date_issued: '2026-09-27T00:00:00Z', date_expired: '2026-10-10T00:00:00Z', for_corporation: false, ...extra });
  const list = readContracts([
    C(1, 'courier', 'in_progress', 7, me, { date_accepted: '2026-09-28T10:00:00Z', days_to_complete: 3, collateral: 500e6, reward: 20e6, end_location_id: 60008494 }),
    C(2, 'courier', 'finished', 7, me, { date_accepted: '2026-09-20T10:00:00Z', days_to_complete: 3 }),
    C(3, 'item_exchange', 'finished', me, 8, { price: 12e6 }), C(4, 'item_exchange', 'outstanding', me, 0), C(5, 'item_exchange', 'finished', 8, me),
    C(6, 'courier', 'in_progress', me, 9, { date_accepted: '2026-09-28T10:00:00Z', days_to_complete: 1 }),
  ]);
  eq('couriers you accepted and haven’t delivered, due at accepted + days to complete', couriersDue(list, me).map((c) => [c.contract.id, new Date(c.due).toISOString()]), [[1, '2026-10-01T10:00:00.000Z']]);
  eq('item exchanges finished with you on either side, whose items aren’t known yet', itemsToRead(list, me, { 5: [] }), [3]);
  eq('what a contract held, given then asked', contractSaid([{ typeId: 1, qty: 3, included: true }, { typeId: 2, qty: 1, included: false }], (t) => (t === 1 ? 'Rifter Blueprint' : 'Tritanium')), '3× Rifter Blueprint; asking 1× Tritanium');
  const e = { item: { key: 'courier:1', ver: '', kind: 'courier', source: 'contracts', title: '', detail: '', stake: 0, action: { label: '' } }, seenAt: 1000, lastAt: 1000 };
  eq('a courier ticks off on a newer read: delivered, or failed with the collateral lost', [judgeCourierJob(e, { readAt: 500, status: 'finished' }), judgeCourierJob(e, { readAt: 2000, status: 'in_progress' }), judgeCourierJob(e, { readAt: 2000, status: 'finished' }), judgeCourierJob(e, { readAt: 2000, status: 'failed' })],
    [null, null, 'Delivered.', 'It failed: the collateral went to the issuer.']);
}

console.log('\n--- industry jobs to deliver ---');
{
  const { judgeIndustry, jobWaiting } = await import('../src/lib/todo.ts');
  const now = Date.parse('2026-09-29T12:00:00Z');
  eq('a job waits to be delivered: marked ready, or active past its end', [jobWaiting({ status: 'ready', end: '2026-10-01T00:00:00Z' }, now), jobWaiting({ status: 'active', end: '2026-09-29T11:00:00Z' }, now), jobWaiting({ status: 'active', end: '2026-09-29T13:00:00Z' }, now)], [true, true, false]);
  const e = { item: { key: 'industry:60003760', ver: '11.12', kind: 'industry', source: 'industry', title: '', detail: '', stake: 0, action: { label: '' } }, seenAt: 1000, lastAt: 1000 };
  eq('ticked off only on a newer read with none of them waiting', [judgeIndustry(e, { readAt: 500, waiting: new Set() }), judgeIndustry(e, { readAt: 2000, waiting: new Set([12]) }), judgeIndustry(e, { readAt: 2000, waiting: new Set([99]) })], [null, null, 'All delivered.']);
}

console.log('\n--- what the skill queue is about to do ---');
{
  const { tradeSkillsComing } = await import('../src/lib/skillQueue.ts');
  const { DEFAULT_SETTINGS } = await import('../src/lib/fees.ts');
  const ids = { acc: 16622, br: 3446, abr: 16597, trade: 3443, retail: 3444, wholesale: 16596, tycoon: 18580 };
  const s = { ...DEFAULT_SETTINGS, clone: 'omega', acc: 3, br: 4, abr: 4, trade: 5, retail: 5, wholesale: 3, tycoon: 0, override: true, brokerPct: 9, taxPct: 9 };
  const now = Date.parse('2026-09-29T12:00:00Z');
  const got = tradeSkillsComing([
    { skillId: 16622, level: 4, finish: '2026-09-30T10:00:00Z' }, { skillId: 16622, level: 5, finish: '2026-10-04T10:00:00Z' },
    { skillId: 3339, level: 5, finish: '2026-10-05T00:00:00Z' }, { skillId: 16596, level: 4, finish: null }, { skillId: 3446, level: 4, finish: '2026-10-06T00:00:00Z' },
    { skillId: 16597, level: 5, finish: '2026-09-28T00:00:00Z' },
  ], ids, s, now);
  eq('trade skills coming: Accounting IV then V build on each other, a slot skill paused, nothing for other skills, a level held or already done',
    got.map((c) => [c.name, c.level, c.effects.map((e) => e.what)]), [['Accounting', 4, ['tax']], ['Accounting', 5, ['tax']], ['Wholesale', 4, ['slots']]]);
  eq('  worked out from skills, not typed-in figures; slots by 16 a Wholesale level', [+(got[0].effects[0].before * 100).toFixed(3) > +(got[1].effects[0].after * 100).toFixed(3), got[2].effects[0].after - got[2].effects[0].before], [true, 16]);
}

console.log('\n--- where a skill stands in the queue ---');
{
  const { skillStatus, progressOf, trainSaid, contractsAllowed, queuedTo } = await import('../src/lib/skillStatus.ts');
  const T = Date.parse('2026-09-29T12:00:00Z'), H = 3600_000;
  // Accounting (16622) III trained, IV training (started 2 h ago, 2 h to go, 10% of the level's points in it when it
  // started), V queued behind it.
  const q = [
    { skillId: 16622, level: 4, start: new Date(T - 2 * H).toISOString(), finish: new Date(T + 2 * H).toISOString(), trainingStartSp: 45255 + 0.1 * (256000 - 45255), levelStartSp: 45255, levelEndSp: 256000 },
    { skillId: 16622, level: 5, start: new Date(T + 2 * H).toISOString(), finish: new Date(T + 30 * H).toISOString() },
    { skillId: 3443, level: 2, start: new Date(T - 9 * H).toISOString(), finish: new Date(T - H).toISOString() },
  ];
  const s = skillStatus(16622, 3, q, T);
  eq('the level training now, and how far through it', [s.have, s.training?.level, Math.round(s.training.progress * 100)], [3, 4, 55]);
  eq('  the one queued behind it', s.queued.map((x) => x.level), [5]);
  eq('  and where it ends up', queuedTo(s), 5);
  eq('a level finished since the sync reads as trained', skillStatus(3443, 1, q, T).have, 2);
  eq('a skill not in the queue', skillStatus(3444, 2, q, T), { have: 2, training: null, queued: [] });
  eq('a paused queue trains nothing now', skillStatus(16622, 3, q.map((x) => ({ ...x, finish: null })), T).training, null);
  eq('  but still lists what is queued', skillStatus(16622, 3, q.map((x) => ({ ...x, finish: null })), T).queued.map((x) => x.level), [4, 5]);
  eq('progress from time alone when an older sync kept no points', progressOf({ skillId: 1, level: 1, finish: null }, T - H, T + 3 * H, T), 0.25);
  eq('a training time as the game says it', [trainSaid(40 * 60_000), trainSaid(5 * H + 20 * 60_000), trainSaid(3 * 24 * H + 4 * H), trainSaid(2 * 24 * H)], ['40 min', '5 h 20 min', '3 d 4 h', '2 d']);
  eq('Contracting: one contract, four more a level, 21 at V', [0, 1, 3, 5].map(contractsAllowed), [1, 5, 13, 21]);
  // The user's own queue as synced before the start was kept: finish dates only. The first unfinished entry trains.
  const old = [
    { skillId: 3895, level: 5, finish: new Date(T - H).toISOString() },
    { skillId: 3328, level: 4, finish: new Date(T + 30 * H).toISOString() },
    { skillId: 16595, level: 4, finish: new Date(T + 50 * H).toISOString() },
  ];
  const o = skillStatus(3328, 3, old, T);
  eq('an older sync: the first unfinished entry is the one training, begun when the one before it finished', [o.training?.level, Math.round(o.training.progress * 100)], [4, 3]);
  eq('  the next is only queued', [skillStatus(16595, 3, old, T).training, skillStatus(16595, 3, old, T).queued.map((x) => x.level)], [null, [4]]);
  eq('  and without an entry before it, how far through is unknown', skillStatus(3328, 3, old.slice(1), T).training?.progress, null);

  const { queueSaid } = await import('../src/lib/skillStatus.ts');
  const idle = { have: 0, training: null, queued: [] };
  const name = (id) => ({ 16596: 'Wholesale', 16598: 'Marketing' })[id];
  eq('said: training', queueSaid(s, null, T).text, 'Training IV: 2 h left');
  eq('  queued', queueSaid(skillStatus(16595, 3, old, T), null, T).tone, 'queued');
  eq('  a skill whose prerequisites you lack says so, not a time it can’t train in (Tycoon)', queueSaid(idle, { to: 1, days: 50 / 1440, injected: false, needs: [{ id: 16596, level: 5 }, { id: 16598, level: 4 }] }, T, name).text, 'Needs Wholesale V and Marketing IV first');
  eq('  a skillbook not injected', queueSaid(idle, { to: 1, days: 17 / 1440, injected: false, needs: [] }, T).text, 'Skillbook not injected; I takes 17 min once it is');
  eq('  otherwise the time to the level wanted', queueSaid({ have: 2, training: null, queued: [] }, { to: 4, days: 1.5, injected: true, needs: [] }, T).text, 'Not queued: IV takes 1 d 12 h');
  eq('  and nothing to do at V', queueSaid({ have: 5, training: null, queued: [] }, null, T).tone, 'max');
  // An Alpha alt's skill trained past Alpha's cap: Omega, never a time (it read "Not queued: V takes 1 min").
  eq('  Alpha caps it: trained to V, used at IV', queueSaid({ have: 4, training: null, queued: [] }, { to: 5, days: null, injected: true, needs: [], capped: { trained: 5, active: 4 } }, T),
    { text: 'Trained to V; Alpha uses IV: Omega opens it', tone: 'idle' });
  eq('  Alpha can\'t use it at all (Mining Barge trained to III)', queueSaid({ have: 0, training: null, queued: [] }, { to: 1, days: null, injected: true, needs: [], capped: { trained: 3, active: 0 } }, T).text,
    'Alpha can’t use it: Omega opens it');
}

console.log('\n--- purchases made in one go ---');
{
  const { multibuys, fittedShips, autoTag } = await import('../src/lib/wallet.ts');
  // The user's Jackdaw (29 September 2026): the hull and its fitting bought through the Multibuy window in one second.
  const at = '2026-09-29T00:10:51Z';
  const B = (id, typeId, qty, unitPrice, date = at) => ({ id, source: 'esi', typeId, date, isBuy: true, qty, unitPrice, locationId: 60003760 });
  const fit = [B('1', 34828, 1, 65360000), B('2', 2404, 5, 783400), B('3', 27361, 1000, 758.8), B('4', 2281, 2, 1828000)];
  const txs = [...fit, B('5', 34, 1000, 4, '2026-09-29T00:12:00Z'), { ...B('6', 35, 5, 10), isBuy: false }, B('7', 36, 1, 5, '2026-09-29T01:00:00Z'), B('8', 36, 1, 5, '2026-09-29T01:00:00Z'), B('9', 36, 1, 5, '2026-09-29T01:00:00Z')];
  const groups = multibuys(txs);
  eq('buys of several items in one second are one multibuy; a sale, a lone buy, or one item three times aren’t', groups.map((g) => [g.txIds, g.typeIds.length, g.value]), [[['1', '2', '3', '4'], 4, 65360000 + 3917000 + 758800 + 3656000]]);
  const fitted = fittedShips(groups, (t) => t === 34828);
  eq('  with a ship in it, it’s a fit to fly: guessed Personal', [autoTag(fit[1], new Set(), fitted), autoTag(txs[4], new Set(), fitted)], ['personal', 'other']);
  eq('  without one, no guess', fittedShips(groups, () => false).size, 0);
  // Two of the user's seven multibuys straddled a second (23:08:04–05); a gap over two seconds is two purchases.
  const split = multibuys([B('a', 1, 1, 1, '2026-09-28T23:08:04Z'), B('b', 2, 1, 1, '2026-09-28T23:08:04Z'), B('c', 3, 1, 1, '2026-09-28T23:08:05Z'), B('d', 4, 1, 1, '2026-09-28T23:08:05Z'), B('e', 5, 1, 1, '2026-09-28T23:08:09Z')]);
  eq('  a multibuy across a second boundary is one; one three seconds later isn’t in it', split.map((g) => g.txIds), [['a', 'b', 'c', 'd']]);
}

console.log('\n--- a fee a GM refunded counts as nothing ---');
{
  const { refundPairs, withRefunds } = await import('../src/lib/refunds.ts');
  const { matchFees } = await import('../src/lib/feeMatch.ts');
  const { brokerFeesPaid } = await import('../src/lib/standings.ts');
  const { categoryOf } = await import('../src/lib/wallet.ts');
  // The user's own entries (28 September 2026): the fat-fingered relist's fee, and CCP's refund of it.
  const fee = { id: '26087466253', date: '2026-09-28T01:24:26Z', refType: 'brokers_fee', amount: -467749600.65, firstPartyId: 95210486, secondPartyId: 1000035, description: 'Market order commission to broker authorized by: FIREDASH Visagie' };
  const gm = { id: '26090617268', date: '2026-09-28T22:54:39Z', refType: 'gm_cash_transfer', amount: 467749600.65, firstPartyId: 1000035, secondPartyId: 95210486, description: 'GM [18706980] issued transaction between Caldari Navy and FIREDASH Visagie', reason: 'Ticket #2734940' };
  const other = { id: 'x1', date: '2026-09-28T01:24:26Z', refType: 'brokers_fee', amount: -1200, secondPartyId: 1000035 };
  const pairs = refundPairs([fee, gm, other]);
  eq('the refund pairs with the fee it returns, to the cent', pairs.map((p) => [p.feeId, p.refundId, p.reason]), [['26087466253', '26090617268', 'Ticket #2734940']]);
  eq('  not a transfer of another amount, from another party, before the fee, or over 30 days after', [
    refundPairs([fee, { ...gm, amount: 467749600 }]).length, refundPairs([fee, { ...gm, firstPartyId: 1000132 }]).length,
    refundPairs([{ ...fee, date: '2026-09-29T00:00:00Z' }, gm]).length, refundPairs([fee, { ...gm, date: '2026-11-01T00:00:00Z' }]).length], [0, 0, 0, 0]);
  const net = withRefunds({ [fee.id]: fee, [gm.id]: gm, [other.id]: other });
  eq('both read as nothing, the fee keeping what it was; others untouched', [net[fee.id].amount, net[fee.id].refunded, net[gm.id].amount, net[other.id].amount], [0, -467749600.65, 0, -1200]);
  eq('  so the Wallet counts neither as income or a cost', [categoryOf(net[gm.id]), categoryOf(net[fee.id])], [null, null]);
  eq('  and what standings are worth leaves it out', Math.round(brokerFeesPaid(net, Date.parse('2026-09-29T00:00:00Z'), () => 0.013).paid), 1200);
  // The order that paid it: placed at 1,893, fat-fingered to 1,893,000, all 19,489 still on it.
  const order = { orderId: 7, typeId: 34, isBuy: false, price: 1893000, volumeTotal: 19489, volumeRemain: 19489, issued: fee.date, state: 'cancelled', locationId: 60003760,
    seen: [{ issued: '2026-09-28T01:20:30Z', price: 1893, remain: 19489 }, { issued: fee.date, price: 1893000, remain: 19489 }] };
  const rate = () => ({ f: 0.0133, t: 0.036, k: 0.00266, d: 0.8, be: 0 });
  const m = matchFees(Object.values(net), [order], [], rate).byOrder.get(7);
  eq('the order keeps the fee matched, at nothing, not an estimate in its place', [m.relists.length, m.relists[0]?.amount, m.relists[0]?.actual], [1, 0, true]);
}

console.log('\n--- reprocessing ---');
{
  const R = await import('../src/lib/reprocess.ts');
  const { default: bundle } = await import('../src/data/typeMaterials.json', { with: { type: 'json' } });
  const zw = bundle.types[8001], veld = bundle.types[1230];
  eq('the bundle: the ZW-4100 as the SDE has it, Veldspar in 100s naming Simple Ore Processing', [zw, veld[0], veld[2]], [[1, [[34, 3278], [35, 1725], [36, 7]]], 100, 60377]);
  const jita = { kind: 'station', base: 0.5, tax: R.stationTax(7.04) };
  const all5 = { [R.REPROCESSING]: 5, [R.REPROCESSING_EFFICIENCY]: 5, [R.SCRAPMETAL_PROCESSING]: 5, 60377: 5 };
  eq('modules: half at a station, 55% at Scrapmetal V, the same at a Tatara', [R.yieldOf(zw, {}, jita), R.yieldOf(zw, all5, jita), R.yieldOf(zw, all5, { kind: 'structure', structure: 'tatara', rig: 't2', sec: 'null', tax: 0 })].map((x) => +x.toFixed(4)), [0.5, 0.55, 0.55]);
  const t2 = (sec) => ({ kind: 'structure', structure: 'tatara', rig: 't2', sec, tax: 0 });
  eq('ore at max skills and RX-804: 72.4% at an NPC station, 80.9% / 85.8% / 90.6% at a T2 Tatara in high / low / null',
    [R.yieldOf(veld, all5, jita, 'rx804'), R.yieldOf(veld, all5, t2('high'), 'rx804'), R.yieldOf(veld, all5, t2('low'), 'rx804'), R.yieldOf(veld, all5, t2('null'), 'rx804')].map((x) => +(x * 100).toFixed(1)), [72.4, 80.9, 85.8, 90.6]);
  eq('the tax at an NPC station: 5% at 0 standing, 2.75% at 3, none at the user\'s 7.04', [R.stationTax(0), R.stationTax(3), R.stationTax(7.04)].map((x) => +x.toFixed(4)), [0.05, 0.0275, 0]);
  eq('one ZW-4100 at 55%: whole units of each, rounded down', R.reprocessOutput(zw, 1, 0.55).out, [[34, 1802], [35, 948], [36, 3]]);
  eq('250 Veldspar: two batches of 100, 50 left over', [R.reprocessOutput(veld, 250, 0.5).batches, R.reprocessOutput(veld, 250, 0.5).left, R.reprocessOutput(veld, 250, 0.5).out], [2, 50, [[34, 400]]]);
  const w = R.outputWorth(R.reprocessOutput(zw, 1, 0.5), (id) => ({ 34: 3.7, 35: 16.33, 36: 49.95 })[id], (id) => ({ 34: 3.5, 35: 15, 36: 45 })[id], 0.05, 0.03375);
  eq('its worth: sold into the bids after sales tax, less 5% tax on the adjusted price', [Math.round(w.gross), Math.round(w.tax), Math.round(w.net)], [Math.round((1639 * 3.7 + 862 * 16.33 + 3 * 49.95) * 0.96625), Math.round(0.05 * (1639 * 3.5 + 862 * 15 + 3 * 45)), Math.round((1639 * 3.7 + 862 * 16.33 + 3 * 49.95) * 0.96625 - 0.05 * (1639 * 3.5 + 862 * 15 + 3 * 45))]);
  eq('a structure found by name: its kind from its type, its band from its security', [R.siteFromStructure(35836, 0.52), R.siteFromStructure(35835, 0.44), R.siteFromStructure(35825, 0.05), R.siteFromStructure(undefined, -1)],
    [{ structure: 'tatara', sec: 'high' }, { structure: 'athanor', sec: 'low' }, { structure: 'other', sec: 'low' }, { structure: 'other', sec: 'null' }]);
  eq('yield by level of the skill that moves it', R.yieldByLevel(zw, {}, jita).levels.map((x) => +x.toFixed(2)), [0.5, 0.51, 0.52, 0.53, 0.54, 0.55]);
  // The scanner: the ZW-4100 listed at 20,000 (10 units) and 21,500 (50 units), minerals as bid on 29 September.
  const books = { 8001: { topSells: [{ price: 20000, volume: 10 }, { price: 21500, volume: 50 }, { price: 30000, volume: 5 }], topBuys: [] },
    34: { topSells: [], topBuys: [{ price: 3.7, volume: 1e9 }] }, 35: { topSells: [], topBuys: [{ price: 16.33, volume: 1e9 }] }, 36: { topSells: [], topBuys: [{ price: 49.95, volume: 1e9 }] } };
  const hits = R.scanUnderValue({ 8001: zw }, books, {}, jita, 'none', 0.03375, () => null, 1000);
  const v50 = R.unitValue(zw, 0.5, (id) => books[id].topBuys[0].price, () => null, 0, 0.03375);
  eq('the scanner: at 50% one unit fetches 19,606 after tax, under even the 20,000 listing, so nothing now', [Math.round(v50), hits[0]?.units, hits[0]?.profit], [19606, 0, 0]);
  eq('  but it\'s listed for what Scrapmetal V unlocks: all 60 under 55%\'s value', [hits.length, hits[0]?.profitBest > 0, R.scanUnderValue({ 8001: zw }, books, { [R.SCRAPMETAL_PROCESSING]: 5 }, jita, 'none', 0.03375, () => null, 1000)[0]?.units], [1, true, 60]);
  eq('  an item nothing is listed under at any yield is left out', R.scanUnderValue({ 8001: zw }, { ...books, 8001: { topSells: [{ price: 40000, volume: 5 }], topBuys: [] } }, {}, jita, 'none', 0.03375, () => null, 1000).length, 0);
}

console.log('\n--- an item\'s daily rhythm ---');
{
  const { busyHours, busySaid, spreadAtHour } = await import('../src/lib/rhythm.ts');
  const flat = Array.from({ length: 24 }, (_, hod) => ({ hod, h: 7, sell: 7, buy: 7, days: 7 }));
  eq('an even day has no busy hours', busyHours(flat, 'sell'), null);
  const evening = flat.map((b) => (b.hod >= 18 && b.hod < 22 ? { ...b, sell: 70 } : b));
  const w = busyHours(evening, 'sell');
  eq('buyers crowding 18-22 EVE time are found', [w?.from, w?.to, Math.round((w?.share ?? 0) * 100)], [18, 22, 67]);
  eq('  and said in EVE time and yours', busySaid(w, 'sell', 2), 'Buyers take listings most between 18:00 and 22:00 EVE time (20:00–00:00 yours): 67% of it in those 4 hours.');
  eq('  the window wraps past midnight', busyHours(flat.map((b) => (b.hod >= 22 || b.hod < 2 ? { ...b, buy: 70 } : b)), 'buy')?.from, 22);
  eq('  nothing before a week of watching', busyHours(evening.map((b) => ({ ...b, days: 5 })), 'sell'), null);
  eq('  nor on a handful of units', busyHours(evening.map((b) => ({ ...b, sell: b.hod === 19 ? 20 : 0 })), 'sell'), null);
  const hourNow = Math.floor(Date.parse('2026-10-10T19:30:00Z') / 3600_000);
  const pts = [];
  for (let d = 9; d >= 1; d--) pts.push({ hour: hourNow - d * 24, bestBuy: 100, bestSell: 105 + (d % 3) });
  pts.push({ hour: hourNow, bestBuy: 100, bestSell: 112 });
  const sp = spreadAtHour(pts, Date.parse('2026-10-10T19:30:00Z'));
  eq('the spread now against the median of the same hour on 9 earlier days', [Math.round(sp.now * 1000) / 10, Math.round(sp.usual * 1000) / 10, sp.days], [12, 6, 9]);
  eq('  nothing with under a week of that hour', spreadAtHour(pts.slice(4), Date.parse('2026-10-10T19:30:00Z')), null);
}

console.log('\n--- opportunity mail and relists over a period ---');
{
  const { alertMail: mail2 } = await import('../src/lib/alerts.ts');
  const { itemResult: ir } = await import('../src/lib/longRange.ts');
  const opp = { kind: 'opportunity', key: 'opp:2185', title: 'Trade worth a look', typeId: 2185, name: 'Hammerhead II', text: 'x',
    opp: { buy: 700000, sell: 760000, roi: 0.061, iskPerDay: 4200000, qty: 120, daysToFlip: 1.5, watchedH: 30, bought: 240, dumped: 180 } };
  const m = mail2([opp], { appUrl: 'https://x.test/jita-ledger/', keepMin: 1440 });
  eq('an opportunity mail leads with where to buy and list', m.body.includes('RECOMMENDED: buy at 700,000 ISK, list at 760,000 ISK'), true);
  eq('  its name opens the Calculator, not a market', [m.body.includes('#calculator?type=2185">Hammerhead II</a>'), m.body.includes('market=2185')], [true, false]);
  eq('  the subject says what and how much', m.subject, 'Jita Ledger: look at Hammerhead II, 6.1%');
  eq('  and it points to Prospects', m.body.includes('#prospects'), true);
  const D = 86400_000, t0 = Date.parse('2026-09-01T00:00:00Z');
  const c = { typeId: 1, buys: [], sells: [], series: [], relists: [{ t: t0 + D, amount: 500 }, { t: t0 + 5 * D, amount: 700 }] };
  eq('relists are counted in the period they were made', [ir(c, t0, t0 + 3 * D).relists, ir(c, t0, t0 + 3 * D).relistFees, ir(c, t0, t0 + 9 * D).relistFees], [1, 500, 1200]);
}

console.log('\n--- "Clears in", checked ---');
{
  const { predictionOutcome, TRACK_DAYS } = await import('../src/lib/track.ts');
  const p = { price: 100, at: 0 };
  eq('reached the front at the price it was predicted at', predictionOutcome(p, { price: 100, beaten: false }, undefined, 3600_000), 'front');
  eq('  still beaten: undecided', predictionOutcome(p, { price: 100, beaten: true }, undefined, 3600_000), null);
  eq('  moved to another price: void', predictionOutcome(p, { price: 99, beaten: true }, undefined, 3600_000), 'void');
  eq('  gone from the book while its record still says open: undecided, not void', predictionOutcome(p, undefined, { state: 'open', volumeRemain: 40 }, 3600_000), null);
  eq('  and once the record says it sold out: the front', predictionOutcome(p, undefined, { state: 'closed', volumeRemain: 0 }, 3600_000), 'front');
  eq('  closed with stock left (cancelled or expired): void', predictionOutcome(p, undefined, { state: 'cancelled', volumeRemain: 5 }, 3600_000), 'void');
  eq('  undecided for over two weeks: late', predictionOutcome(p, { price: 100, beaten: true }, undefined, (TRACK_DAYS + 1) * 86400_000), 'late');
  const { alertMail: mail3 } = await import('../src/lib/alerts.ts');
  const f = { kind: 'opportunity', key: 'opp:1', title: 'Trade worth a look', typeId: 1, name: 'X', text: 'x', opp: { buy: 1, sell: 2, roi: 0.1, iskPerDay: 5, qty: 1, daysToFlip: 1, watchedH: 7, bought: 1, dumped: 1, more: 4 } };
  eq('an opportunity mail counts the ones it didn’t name', mail3([f], { appUrl: 'u/', keepMin: 60 }).body.includes('4 more newly clear your filters: see Prospects.'), true);
}

console.log('\n--- the sell side judged like the buy side ---');
{
  const { askToPlace, bidToPlace: bid2 } = await import('../src/lib/prospects.ts');
  const { reachedAsk, withWatchedHighs } = await import('../src/lib/fills.ts');
  const M = 1e6;
  // True Sansha EM Armor Hardener: a month around 3-4 M, then one day at 7 M.
  const highs = [3.6, 2.9, 4.1, 3.0, 3.1, 3.2, 3.8, 4.0, 3.2, 3.3, 3.7, 3.9, 4.0, 7.5].map((x) => x * M);
  const lows = [3.38, 2.61, 3.89, 2.79, 2.83, 2.88, 3.48, 3.79, 2.95, 3.05, 3.52, 3.74, 3.82, 7.0].map((x) => x * M);
  const a = askToPlace(7.397 * M, highs);
  eq('an ask trading reached on 1 day of 14 is lowered to where it reached on half', [a.askReach, a.sell, a.lowered], [1, 3.7 * M, true]);
  eq('  the 7th highest high', reachedAsk(highs), 3.7 * M);
  const b = bid2(4.362 * M, lows);
  eq('  so the 59% flip that bought at 4.36 M and sold at 7.4 M leaves no margin at all', a.sell < b.buy, true);
  const busy = askToPlace(25_690, [25_700, 25_660, 25_900, 25_800, 25_720, 25_680, 25_750, 25_710, 25_700, 25_690, 25_900, 25_880, 25_700, 25_760]);
  eq('an ask trading gets up to on most days stays one step under the best', [busy.lowered, busy.sell], [false, 25_680]);
  eq('without highs nothing is claimed', askToPlace(100, null), { top: 99.99, sell: 99.99, askReach: null, recentReach: null, window: null, lowered: false });
  eq('the highest sale watched since a scan counts over the same days', withWatchedHighs([5, null, 6], '2026-09-26', { '2026-09-25': { sellHigh: 9 } }), [5, 9, 6]);
}

console.log('\n--- a price that just moved ---');
{
  const { statsFrom: sf, warningsFor: wf } = await import('../src/lib/prospects.ts');
  const { PLANNER_EXCLUDES: ex } = await import('../src/lib/planner.ts');
  const now = Date.parse('2026-09-27T18:00:00Z');
  const day = (i) => new Date(Date.parse('2026-09-26T00:00:00Z') - i * 86400_000).toISOString().slice(0, 10);
  const row = (i, avg) => ({ date: day(i), average: avg, lowest: avg * 0.9, highest: avg * 1.1, volume: 30, order_count: 10 });
  // True Sansha EM Armor Hardener's shape: two weeks around 3.6 M, then a day at 7.5 M.
  const sansha = [...Array.from({ length: 13 }, (_, k) => row(13 - k, 3.6e6)), row(0, 7.539e6)];
  const st = sf(13970, sansha, now);
  eq('the latest day at double the fortnight before is a move', Math.round(st.lastMove * 100), 109);
  const book = { buyOrders: 20, sellOrders: 20, topBuys: [{ price: 4.36e6, volume: 7 }], topSells: [{ price: 7.4e6, volume: 1 }] };
  eq('  flagged, and the planner leaves it out', [wf(st, book, 0.7, 40).includes('moved'), ex.includes('moved')], [true, true]);
  const calm = [...Array.from({ length: 13 }, (_, k) => row(13 - k, 3.6e6)), row(0, 3.9e6)];
  eq('  an ordinary day is not', wf(sf(13970, calm, now), book, 0.1, 40).includes('moved'), false);
}

console.log('\n--- where to list and wait ---');
{
  const { reachedAsk: ra, askReachDays: ard, FILL_MOST, FILL_TYPICAL } = await import('../src/lib/fills.ts');
  // Datacore - Rocket Science, 13-26 Sep 2026: each day's high from ESI.
  const highs = [97580, 99960, 99960, 97900, 97840, 97830, 97820, 88510, 92200, 92200, 97650, 89970, 96470, 94430];
  eq('the patient price: where trading got up to on half the days', [ra(highs, FILL_TYPICAL), ard(highs, ra(highs, FILL_TYPICAL))], [97650, 7]);
  eq('  the safer one: on most of them', [ra(highs, FILL_MOST), ard(highs, ra(highs, FILL_MOST))], [92200, 12]);
}

console.log('\n--- place and leave: orders behind the front on purpose ---');
{
  const { adviseRelist } = await import('../src/lib/relist.ts');
  const { orderFindings } = await import('../src/lib/alerts.ts');
  const R = { k: 0.0026, f: 0.013, t: 0.03375 };
  // A patient buy at 90 behind a front at 100 on an item trading ~100: its bid is reached on 9 of 14 days.
  const lows = [89, 92, 88, 95, 91, 87, 99, 93, 86, 96, 90, 94, 89, 97];
  const buy = { orderId: 1, typeId: 34, isBuy: true, price: 90, volumeRemain: 1000 };
  const book = [{ id: 1, isBuy: true, price: 90, volume: 1000 }, { id: 2, isBuy: true, price: 100, volume: 50_000 }, { id: 3, isBuy: false, price: 110, volume: 50_000 }];
  const plain = adviseRelist(buy, { book, dailyVolume: 10_000, bestSell: 110, lows }, R, 2, 0.05);
  const left = adviseRelist(buy, { book, dailyVolume: 10_000, bestSell: 110, lows, leave: true }, R, 2, 0.05);
  eq('  an ordinary order behind the front is told to move', plain.verdict, 'move');
  eq('  one you are leaving is told to wait, and says why', [left.verdict, left.left, left.why], ['wait', true, 'You’re leaving this one: the bulk of trading reached your bid on 6 of the last 14 days']);
  eq('  and raises no alert', orderFindings([{ ...left, typeId: 34 }], () => 'Tritanium').length, 0);
  // Trading moved up and away: the patient bid at 80 is reached on none of the days. That must be heard.
  const away = adviseRelist({ ...buy, price: 80 }, { book: [{ id: 1, isBuy: true, price: 80, volume: 1000 }, ...book.slice(1)], dailyVolume: 10_000, bestSell: 110, lows, leave: true, targetReturn: 0.05 }, R, 2, 0.05);
  eq('  but one trading no longer reaches is told to move to where it does, still behind the front', [away.verdict, away.unreached, away.newPrice], ['move', true, 91]);
  eq('    an ordinary one in the same spot goes to the front, as before', adviseRelist({ ...buy, price: 80 }, { book: [{ id: 1, isBuy: true, price: 80, volume: 1000 }, ...book.slice(1)], dailyVolume: 10_000, bestSell: 110, lows, targetReturn: 0.01 }, R, 2, 0.05).newPrice, 100.1);
  const mailed = orderFindings([{ ...away, typeId: 34 }], () => 'Tritanium');
  eq('    and that is mailed like any move', [mailed.length, mailed[0].kind, mailed[0].text.includes('rarely gets down to it')], [1, 'move', true]);
  // A patient sell at 120 over a front at 110; highs reach 120 on 7 of 14 days.
  const highs = [118, 121, 119, 125, 117, 122, 116, 123, 120, 115, 124, 114, 126, 113];
  const sell = { orderId: 5, typeId: 34, isBuy: false, price: 120, volumeRemain: 1000 };
  const sbook = [{ id: 5, isBuy: false, price: 120, volume: 1000 }, { id: 3, isBuy: false, price: 110, volume: 50_000 }, { id: 2, isBuy: true, price: 100, volume: 50_000 }];
  eq('  a sell you are leaving waits while trading reaches it', adviseRelist(sell, { book: sbook, dailyVolume: 10_000, highs, leave: true }, R, 2, 0.05).verdict, 'wait');
  const high = adviseRelist({ ...sell, price: 140 }, { book: [{ id: 5, isBuy: false, price: 140, volume: 1000 }, ...sbook.slice(1)], dailyVolume: 10_000, highs, leave: true }, R, 2, 0.05);
  eq('  and moves down to where trading gets up to once it no longer does', [high.verdict, high.newPrice, high.reach], ['move', 120, 0]);
  eq('    said the right way round', orderFindings([{ ...high, typeId: 34 }], () => 'Tritanium')[0].text.includes('sell order: trading rarely gets up to it'), true);
  eq('  unless that sells under what the stock cost', adviseRelist({ ...sell, price: 140 }, { book: [{ id: 5, isBuy: false, price: 140, volume: 1000 }, ...sbook.slice(1)], dailyVolume: 10_000, highs, leave: true, avgCost: 118 }, R, 2, 0.05).verdict, 'loss');
  const plainHigh = adviseRelist({ ...sell, price: 140 }, { book: [{ id: 5, isBuy: false, price: 140, volume: 1000 }, ...sbook.slice(1)], dailyVolume: 10_000, highs }, R, 2, 0.05);
  eq('  a sell you are not leaving, behind a front trading does reach, is judged on the queue as before', [plainHigh.unreached, plainHigh.newPrice, plainHigh.reach], [false, 109.9, 0]);

  // Every sell, since 28 September 2026: the user's Compact Layered Energized Membrane, one unit listed at 3,899,000,
  // 15 listings from 720,000 up ahead of it, the best bid 100,000; the fortnight's highs mostly the old 55,310, then
  // 150,000 on the day a buyer arrived and 100,100 (a listing one step over the bid, bought) since.
  const mHighs = [55190, 55190, 55210, 55230, 55260, 55310, 55310, 55310, 55310, 55310, 55270, 150000, 100100, 100100];
  const mBook = [{ id: 7, isBuy: false, price: 3_899_000, volume: 1 }, { id: 8, isBuy: false, price: 720_000, volume: 2 }, { id: 9, isBuy: false, price: 900_000, volume: 5 },
    { id: 10, isBuy: true, price: 100_000, volume: 462 }, { id: 11, isBuy: true, price: 55_270, volume: 4633 }];
  const membrane = adviseRelist({ orderId: 7, typeId: 16423, isBuy: false, price: 3_899_000, volumeRemain: 1 }, { book: mBook, dailyVolume: 2, highs: mHighs }, R, 2, 0.05);
  eq('an ordinary sell whose front isn’t reached either is moved to where trading reaches, not in front of the others', [membrane.verdict, membrane.unreached, membrane.reach], ['move', true, 0]);
  eq('  never under the best bid: where it reached before the market moved up, 55,310, would sell into it, so one step over', [membrane.reachAt, membrane.newPrice, membrane.overBid], [55310, 100100, true]);
  // Worded the way the user read it (28 September 2026), with selling into that bid now as the same-money option.
  eq('  and says so plainly', membrane.why, 'Nobody buys at your price or even at the front, 719,900 (reached on 0 of the last 14 days). Where it used to trade, 55,310, is below today’s best bid of 100,000, so list one step above it at 100,100, or sell into that bid now for about the same');
  const short = adviseRelist({ orderId: 7, typeId: 16423, isBuy: false, price: 3_899_000, volumeRemain: 600 }, { book: mBook.map((o) => (o.id === 7 ? { ...o, volume: 600 } : o)), dailyVolume: 2, highs: mHighs }, R, 2, 0.05);
  eq('  a bid too small for all of yours says how much it takes', short.why.endsWith('or sell into the bids now for about the same (that one takes 462 of your 600)'), true);
  eq('  mailed the right way round', orderFindings([{ ...membrane }], () => 'Membrane')[0].text.includes('sell order: trading rarely gets up to it'), true);
  const cheapest = adviseRelist({ orderId: 8, typeId: 16423, isBuy: false, price: 720_000, volumeRemain: 2 }, { book: mBook.filter((o) => o.id !== 7 && o.id !== 9), dailyVolume: 2, highs: mHighs }, R, 2, 0.05);
  eq('  the cheapest listing too, which the queue alone called “at the front”', [cheapest.verdict, cheapest.newPrice, cheapest.why.startsWith('Nobody buys at your price (reached on 0 of the last 14 days). Where it used to trade')], ['move', 100100, true]);
  const upHighs = mHighs.map((h) => (h < 100000 ? 150000 : h));
  eq('  where trading reaches over the best bid is where it goes', [adviseRelist({ orderId: 7, typeId: 16423, isBuy: false, price: 3_899_000, volumeRemain: 1 }, { book: mBook, dailyVolume: 2, highs: upHighs }, R, 2, 0.05).newPrice, adviseRelist({ orderId: 7, typeId: 16423, isBuy: false, price: 3_899_000, volumeRemain: 1 }, { book: mBook, dailyVolume: 2, highs: upHighs }, R, 2, 0.05).overBid], [150000, undefined]);
  eq('  not while your own listing is visibly selling', adviseRelist({ orderId: 7, typeId: 16423, isBuy: false, price: 3_899_000, volumeRemain: 1 }, { book: mBook, dailyVolume: 2, highs: mHighs, filling: true }, R, 2, 0.05).unreached, false);
  const thin = [null, null, 60000, null, null, null, 61000, null, null, null, null, 59000, null, null];
  eq('  an item traded on too few days to say where it reaches keeps its queue advice', adviseRelist({ orderId: 7, typeId: 16423, isBuy: false, price: 3_899_000, volumeRemain: 1 }, { book: mBook, dailyVolume: 2, highs: thin }, R, 2, 0.05).unreached, false);
  eq('  and it won’t sell under what the stock cost', adviseRelist({ orderId: 7, typeId: 16423, isBuy: false, price: 3_899_000, volumeRemain: 1 }, { book: mBook, dailyVolume: 2, highs: mHighs, avgCost: 150_000 }, R, 2, 0.05).verdict, 'loss');
}

console.log('\n--- place and leave: priced where trading reaches ---');
{
  const { judgeProspect } = await import('../src/lib/evaluate.ts');
  const Fl = await import('../src/lib/fills.ts');
  const { DEFAULT_SETTINGS } = await import('../src/lib/fees.ts');
  const { DEFAULT_FILTERS } = await import('../src/lib/prospects.ts');
  const now = Date.parse('2026-09-28T00:00:00Z');
  const hist = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now - (30 - i) * 86400_000).toISOString().slice(0, 10);
    return { date, average: 100, lowest: 88 + (i % 9), highest: 112 - (i % 8), volume: 20_000, order_count: 200 };
  });
  const st = statsFrom(34, hist, now);
  const book = { at: new Date(now).toISOString(), bestBuy: 90, bestSell: 110, buyOrders: 20, sellOrders: 20, topBuys: [{ price: 90, volume: 5000 }], topSells: [{ price: 110, volume: 5000 }] };
  const fl = { ...DEFAULT_FILTERS, budget: 1e12, horizonDays: 30, partial: true, minRoi: 0, minTrades: 0, minDays: 0 };
  const S = { ...DEFAULT_SETTINGS, share: 10, br: 5, acc: 5, abr: 5, clone: 'omega' };
  const front = judgeProspect(st, book, S, fl, 40);
  const leave = judgeProspect(st, book, S, { ...fl, patient: true }, 40);
  const pb = Fl.reachedBid(st.lows14), pa = Fl.reachedAsk(st.highs14);
  const P = await import('../src/lib/prospects.ts');
  eq('  at the front: as Prospects prices it', [front.buy, front.sell], [P.bidToPlace(90, st.lows14).buy, P.askToPlace(110, st.highs14).sell]);
  eq('  place and leave: where trading reaches on half the days, both sides', [leave.buy, leave.sell, leave.patient], [pb, pa, true]);
  // Units a day, each side scaled by how often trading reaches its price: between the two sides' slowdowns.
  const rb = Fl.bidReachDays(st.lows14, pb) / 14, ra = Fl.askReachDays(st.highs14, pa) / 14;
  const slower = (front.qty / front.daysToFlip) / (leave.qty / leave.daysToFlip);
  eq('    slower, by how often trading gets to its prices', slower >= 1 / Math.max(rb, ra) - 1e-9 && slower <= 1 / Math.min(rb, ra) + 1e-9, true);
  // A book whose front sits inside where trading happens: leaving it behind the front widens the margin.
  const inside = { ...book, bestBuy: 95, bestSell: 105, topBuys: [{ price: 95, volume: 5000 }], topSells: [{ price: 105, volume: 5000 }] };
  const f2 = judgeProspect(st, inside, S, fl, 40), l2 = judgeProspect(st, inside, S, { ...fl, patient: true }, 40);
  eq('    behind a front inside the range, a wider margin', [l2.buy < f2.buy, l2.sell > f2.sell, l2.roi > f2.roi], [true, true, true]);
  eq('    never flagged as not reached', leave.warnings.includes('unreached') || leave.warnings.includes('unreachedSell'), false);
  // The scoop case: the front bid sits below where trading reaches. The patient bid is where it reaches, above the front.
  const dead = judgeProspect(st, { ...book, bestBuy: 70, topBuys: [{ price: 70, volume: 5000 }] }, S, { ...fl, patient: true }, 40);
  eq('  with the front below where trading reaches, the bid is still where it reaches', dead.buy, pb);
  eq('  without the days to say where trading reaches, it is left out', judgeProspect({ ...st, lows14: undefined }, book, S, { ...fl, patient: true }, 40), null);

  // Market moved: priced on the fortnight wherever today's book is, a plan's prices can sit where today's market isn't.
  eq('  a book near the fortnight\'s prices: no Market moved', leave.warnings.includes('marketMoved'), false);
  const risen = { ...book, bestBuy: 100, bestSell: 120, topBuys: [{ price: 100, volume: 5000 }], topSells: [{ price: 120, volume: 5000 }] };
  const fallen = { ...book, bestBuy: 80, bestSell: 90, topBuys: [{ price: 80, volume: 5000 }], topSells: [{ price: 90, volume: 5000 }] };
  const lr = judgeProspect(st, risen, S, { ...fl, patient: true }, 40), lf = judgeProspect(st, fallen, S, { ...fl, patient: true }, 40);
  eq('  risen since: the bid 9% under today\'s best, flagged', [lr.buy, lr.warnings.includes('marketMoved')], [pb, true]);
  eq('  fallen since: the bid over the cheapest listing and the sale over it, flagged', [lf.buy >= 90, lf.sell > 90 * 1.05, lf.warnings.includes('marketMoved')], [true, true, true]);
  eq('  at the front, never: its prices come from today\'s book', [judgeProspect(st, risen, S, fl, 40)?.warnings.includes('marketMoved') ?? false, judgeProspect(st, fallen, S, fl, 40)?.warnings.includes('marketMoved') ?? false], [false, false]);
}

console.log('\n--- Market moved: the plan\'s items against their books on 2 October 2026 ---');
{
  // The user's second plan (15:36 UTC, Place and leave), each item's prices against its live Jita book at ~16:20 UTC,
  // the user's own orders taken out (.playwright-mcp/plan-check-2/check.json). Fallen: Raging Dark Filament, Imperial Navy
  // Infiltrator (its bid bought at once); spread gone: Gravid Modulated Strip Miner Mutaplasmid; risen: Compressed
  // Fullerite-C84, Vigor Compact Micro Auxiliary Power Core. Datacore - Rocket Science, 3% under, isn't moved.
  const P = await import('../src/lib/prospects.ts');
  const r = (m) => m && { bid: m.bid && { side: m.bid.side, by: Math.round(m.bid.by * 1000) / 1000 }, sell: m.sell && { by: Math.round(m.sell.by * 1000) / 1000 } };
  eq('the bar is 5%', P.MARKET_MOVED, 0.05);
  eq('risen: Compressed Fullerite-C84, the bid 17% under today’s best of 9,250', r(P.marketMoved(7639, 8954, 9250, 10_150)), { bid: { side: 'under', by: 0.174 }, sell: null });
  eq('  Vigor Compact Micro Auxiliary Power Core, 7.8% under', r(P.marketMoved(13_980_000, 16_320_000, 15_170_000, 17_830_000)), { bid: { side: 'under', by: 0.078 }, sell: null });
  eq('fallen: Raging Dark Filament, the bid 19% over today’s best and the sale 14% over the cheapest listing',
    r(P.marketMoved(1_711_000, 1_983_000, 1_440_000, 1_741_000)), { bid: { side: 'over', by: 0.188 }, sell: { by: 0.139 } });
  eq('  Imperial Navy Infiltrator: the bid over the cheapest listing, so it buys at once', r(P.marketMoved(1_658_000, 1_836_000, 1_492_000, 1_608_000)), { bid: { side: 'atOnce', by: 0.031 }, sell: { by: 0.142 } });
  eq('spread gone: Gravid Modulated Strip Miner Mutaplasmid, the sale 22% over the cheapest listing', r(P.marketMoved(11_265_000, 13_800_000, 11_300_000, 11_310_000)), { bid: null, sell: { by: 0.22 } });
  eq('not moved: Datacore - Rocket Science, 3% under', P.marketMoved(85_540, 94_430, 88_170, 96_000), null);
  eq('  exactly 5% either way isn’t more than 5%', [P.marketMoved(95, 100, 100, 200), P.marketMoved(105, 105, 100, 200), P.marketMoved(100, 210, 100, 200)], [null, null, null]);
  const said = P.marketMovedSaid(P.marketMoved(7639, 8954, 9250, 10_150), 9250, 10_150);
  eq('said: the lead, the side that moved and by how much, and the fortnight it comes from', said,
    'Today’s book has moved away from the prices Place and leave would use.\n\n'
    + '• Your bid would be 17% under today’s best bid of 9,250 ISK: the market has risen since, so it may not fill.\n\n'
    + 'Place and leave prices both sides where the bulk of trading reached on half of the last 14 days, wherever today’s book is. More than 5% from today’s book, those days aren’t today’s market.');
  has('  a bid that buys at once says so', P.marketMovedSaid(P.marketMoved(1_658_000, 1_836_000, 1_492_000, 1_608_000), 1_492_000, 1_608_000),
    '• Your bid would be at or over today’s cheapest listing of 1,608,000 ISK: it would buy at once, from the listings, rather than wait.\n• The plan sells 14% over today’s cheapest listing of 1,608,000 ISK: the market has fallen since, and it would wait behind cheaper listings.');
  has('  a bid over today’s best', P.marketMovedSaid(P.marketMoved(1_711_000, 1_983_000, 1_440_000, 1_741_000), 1_440_000, 1_741_000),
    '• Your bid would be 19% over today’s best bid of 1,440,000 ISK: the market has fallen since, so you’d pay more than buyers bid today.');
}

console.log('\n--- the planner prices from recent days (the user\'s first plan, 30 September 2026) ---');
{
  const fs3 = await import('node:fs');
  const fx = JSON.parse(fs3.readFileSync(new URL('./fixtures/plan-review.json', import.meta.url), 'utf8'));
  const P = await import('../src/lib/prospects.ts');
  const Fl = await import('../src/lib/fills.ts');
  const { judgeProspect } = await import('../src/lib/evaluate.ts');
  const { PLANNER_EXCLUDES: ex, plannerFilters } = await import('../src/lib/planner.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const M = 1e6;
  // The cloud's full scan the plan was priced from ran at 11:30 UTC on 29 September, with history to the 28th.
  const scanAt = Date.parse('2026-09-29T11:30:00Z');
  const st = (t) => P.statsFrom(t, fx[t].rows, scanAt);
  // The user's own settings (the synced document): broker 1.25% from skills and standings, tax 3.375%, share 7.5%.
  const S = sanitizeSettings({ acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, override: false, target: 5, share: 7.5 });
  const fl = plannerFilters(null, 1e9, 7);
  const book = (bid, ask) => ({ at: new Date(scanAt).toISOString(), bestBuy: bid, bestSell: ask, buyOrders: 20, sellOrders: 30, topBuys: [{ price: bid, volume: 1 }], topSells: [{ price: ask, volume: 1 }] });
  eq('the recent window: 5 days, reached on 2 of them', [Fl.RECENT_DAYS, Fl.RECENT_MIN], [5, 2]);

  // Caldari Navy Missile Guidance Computer: its lows at or under 270.7 M on 5 of the 14 days, mid-September, when it
  // traded 260-310 M; since 25 September at 359-375 M, with one dip.
  const gc = st(94063);
  eq('  the Guidance Computer\'s 14 days end on 28 September', gc.lowsEnd, '2026-09-28');
  const gcBid = P.bidToPlace(270.6 * M, gc.lows14);
  eq('the Guidance Computer\'s front bid, 270.7 M, is reached on 5 of 14 days but only 1 of the last 5', [gcBid.top, gcBid.bidReach, gcBid.recentReach], [270.7 * M, 5, 1]);
  eq('  so it is raised to where trading reached lately (3 of the last 5 days), and says the recent window decided', [gcBid.buy, gcBid.raised, gcBid.window], [369.5 * M, true, 'recent']);
  eq('  over its 359.9 M ask: it drops out of the planner rather than being priced from the older level', judgeProspect(gc, book(270.6 * M, 360 * M), S, fl, 50), null);
  eq('  a recent reach count is that window\'s alone', Fl.recentBidReach(gc.lows14, 270.7 * M), 1);

  // Praxis: the plan bought at 206.3 M and sold at 226 M. Its ask is reached on both windows; its bid wasn't reached
  // lately (0 of the last 5 days on ESI's lows), and the user had to raise it three times to 208.4 M before it filled.
  const px = st(47466);
  const pxAsk = P.askToPlace(226.1 * M, px.highs14);
  eq('Praxis\'s ask, 226 M, is reached on 4 of 14 days and 4 of the last 5: left where it is', [pxAsk.sell, pxAsk.askReach, pxAsk.recentReach, pxAsk.lowered, pxAsk.window], [226 * M, 4, 4, false, null]);
  const pxBid = P.bidToPlace(206.2 * M, px.lows14);
  eq('  its bid, 206.3 M, on 4 of 14 but none of the last 5: raised to 210.5 M, reached on 3 of the last 5', [pxBid.bidReach, pxBid.recentReach, pxBid.buy, pxBid.window], [4, 0, 210.5 * M, 'recent']);
  // The cloud watched bids fill at 207.1 M on the 27th and 204.0 M on the 28th: one more recent day, still under 2.
  const watchedPx = { '2026-09-27': { buyLow: 207.1 * M }, '2026-09-28': { buyLow: 204 * M } };
  const pxW = P.bidToPlace(206.2 * M, Fl.withWatchedLows(px.lows14, px.lowsEnd, watchedPx));
  eq('  with the fills the cloud watched, still reached on only 1 of the last 5', [pxW.recentReach, pxW.buy], [1, 210.5 * M]);
  eq('  at 210.5 M against 226 M it misses the 3% the planner asks: left out, where the plan expected +3.2%', judgeProspect(px, book(206.2 * M, 226.1 * M), S, fl, 50, false, { days: watchedPx }), null);
  const pxAny = judgeProspect(px, book(206.2 * M, 226.1 * M), S, { ...fl, minRoi: 0 }, 50, false, { days: watchedPx });
  eq('  priced anyway, it is flagged as not reached lately', [pxAny.buy, pxAny.bidWindow, pxAny.bidRecent, pxAny.warnings.includes('unreached')], [210.5 * M, 'recent', 1, true]);

  // A market reached on both windows keeps its front.
  const flat = Array.from({ length: 14 }, () => 100);
  eq('a bid reached on every day stays one step over the best', [P.bidToPlace(99.99, flat).buy, P.bidToPlace(99.99, flat).window], [100, null]);
  // Too few recent days traded to say where recent trading reaches: the fortnight alone decides, as before.
  const sparse = [95, 96, 94, 95, 97, 93, 96, 95, 94, 96, null, 99, null, null];
  eq('  with under 3 of the last 5 days traded, the recent window doesn\'t decide', [P.bidToPlace(95.99, sparse).recentReach, P.bidToPlace(95.99, sparse).window, P.bidToPlace(95.99, sparse).buy], [null, null, 96]);

  // The recent window's own prices: the 3rd-lowest low and the 3rd-highest high of the last 5 days.
  const lows = [90, 90, 90, 90, 90, 90, 90, 90, 90, 95, 96, 97, 98, 99];
  const highs = [120, 120, 120, 120, 120, 120, 120, 120, 120, 110, 109, 108, 107, 106];
  eq('the recent window\'s bid and ask, beside the fortnight\'s', [Fl.reachedBid(lows), Fl.recentBid(lows), Fl.reachedAsk(highs), Fl.recentAsk(highs)], [90, 97, 120, 108]);
  // Place and leave keeps to the fortnight (the coordinator's ruling, 1 October 2026): its orders sit behind the front
  // for weeks, and taking the recent window there too removed 30% of its candidates on the cloud's scan.
  const leave = judgeProspect({ ...px, lows14: lows, highs14: highs }, book(89, 121), S, { ...fl, patient: true, minRoi: 0 }, 50);
  eq('place and leave prices on the fortnight alone, wherever the last 5 days traded', [leave.buy, leave.sell, leave.patient, leave.bidWindow, leave.warnings.includes('unreached')], [90, 120, true, undefined, false]);
  const leaveRun = judgeProspect({ ...px, lows14: lows, highs14: highs, runUp: 0.6 }, book(89, 121), S, { ...fl, patient: true, minRoi: 0 }, 50);
  eq('  but a run-up is still flagged there, and the planner leaves it out', [leaveRun.warnings.includes('runUp'), ex.includes('runUp')], [true, true]);

  // Vigilance Resonance Key: about 21-23 M through August and early September, then 28 M, then 36-45 M from the 24th.
  const vk = st(89156);
  eq('the Vigilance Resonance Key ran up: its last 3 days average 60% over the month before them', [Math.round(vk.runUp * 100), Math.round(vk.runUpBase / 1e4) / 100], [60, 22.89]);
  const shape = { buyOrders: 20, sellOrders: 30, topBuys: [{ price: 1, volume: 1 }], topSells: [{ price: 2, volume: 1 }] };
  eq('  flagged as a run-up, and the planner leaves it out', [vk.runUp > P.RUN_UP, P.warningsFor(vk, shape, 0.1, 40).includes('runUp'), ex.includes('runUp')], [true, true, true]);
  for (const t of [47466, 33140, 94063]) {
    const s = st(t);
    eq(`  ${fx[t].name} did not (${Math.round(s.runUp * 100)}%)`, [s.runUp < P.RUN_UP, P.warningsFor(s, shape, 0.1, 40).includes('runUp')], [true, false]);
  }
  eq('  a run-up is worked out only when the latest day is recent; otherwise it is 0, never absent', P.statsFrom(89156, fx[89156].rows, Date.parse('2026-10-08T12:00:00Z')).runUp, 0);
  eq('  stats from before it was kept claim nothing', P.warningsFor({ ...vk, runUp: undefined }, shape, 0.1, 40).includes('runUp'), false);
}

console.log('\n--- a busy market\'s raises are kept back ---');
{
  const { judgeProspect, RAISES_RESERVED, RESERVE_WATCH_H, RESERVE_RATIO } = await import('../src/lib/evaluate.ts');
  const { DEFAULT_SETTINGS, rates } = await import('../src/lib/fees.ts');
  const { DEFAULT_FILTERS } = await import('../src/lib/prospects.ts');
  const now = Date.parse('2026-09-28T00:00:00Z');
  // A steady market trading between 90 and 110 every day: both fronts reached on every day.
  const hist = Array.from({ length: 30 }, (_, i) => ({ date: new Date(now - (30 - i) * 86400_000).toISOString().slice(0, 10), average: 100, lowest: 90, highest: 110, volume: 20_000, order_count: 200 }));
  const st = statsFrom(34, hist, now);
  const book = { at: new Date(now).toISOString(), bestBuy: 95, bestSell: 105, buyOrders: 20, sellOrders: 20, topBuys: [{ price: 95, volume: 5000 }], topSells: [{ price: 105, volume: 5000 }] };
  const fl = { ...DEFAULT_FILTERS, budget: 1e9, horizonDays: 30, partial: true, minRoi: 0, minTrades: 0, minDays: 0 };
  const S = { ...DEFAULT_SETTINGS, share: 10, br: 5, acc: 5, abr: 5, clone: 'omega' };
  const { k } = rates(S);
  eq('two raises a side, after a day of watching, where the front is beaten twice per unit filled', [RAISES_RESERVED, RESERVE_WATCH_H, RESERVE_RATIO], [2, 24, 2]);
  // Praxis's shape in the cloud's watch: 2.5 times as many new bids at the front as sold into bids, twice as many new
  // listings as bought.
  const busy = { h: 30, sell: 37, buy: 12, newSell: 74, newBuy: 30 };
  const p = judgeProspect(st, book, S, fl, 40, false, { flow: busy });
  const short = judgeProspect(st, book, S, fl, 40, false, { flow: { ...busy, h: 10 } });
  eq('at least twice as many units newly placed at the front as filled, on both sides, over 24+ hours: 2 raises a side', [p.raiseReserve?.buy, p.raiseReserve?.sell], [2, 2]);
  eq('  each a change fee on the order\'s value', p.raiseReserve.isk, 2 * k * p.buy + 2 * k * p.sell);
  eq('  the same prices and size without them', [short.buy, short.sell, short.qty], [p.buy, p.sell, p.qty]);
  eq('  and its return drops by those 4 change fees', short.roi - p.roi, (2 * k * p.buy + 2 * k * p.sell) * p.qty / p.capital);
  eq('  as does what it makes a day', short.iskPerDay > p.iskPerDay && short.roiPerDay > p.roiPerDay, true);
  const quiet = judgeProspect(st, book, S, fl, 40, false, { flow: { ...busy, newBuy: 5 } });
  eq('fewer new bids than sold into bids: none kept back on the buy side', [quiet.raiseReserve?.buy, quiet.raiseReserve?.sell], [0, 2]);
  const half = judgeProspect(st, book, S, fl, 40, false, { flow: { ...busy, newBuy: 18, newSell: 55.5 } });
  eq('one and a half times as many new as filled, on both sides: none', half.raiseReserve, undefined);
  eq('watched only 10 hours: none', short.raiseReserve, undefined);
  eq('nothing new placed on either side: none', judgeProspect(st, book, S, fl, 40, false, { flow: { h: 30, sell: 0, buy: 0, newSell: 0, newBuy: 0 } }).raiseReserve, undefined);
  eq('a plan placed to be left alone keeps none: it isn\'t moved', judgeProspect(st, book, S, { ...fl, patient: true }, 40, false, { flow: busy }).raiseReserve, undefined);
  // The reserve comes off before "Return ≥ %": a thin margin that only the raises eat is left out.
  const roiFree = short.roi;
  eq('  before the return filter', judgeProspect(st, book, S, { ...fl, minRoi: roiFree - (short.roi - p.roi) / 2 }, 40, false, { flow: busy }), null);
}

console.log('\n--- a long sell queue, a stricter run-up for Place and leave, and the planner\'s switch (2 October 2026) ---');
{
  const fs5 = await import('node:fs');
  // Read on 2 October 2026: the cloud's full scan of 1 October 11:25 UTC as scan_items held it, ESI's history to 30
  // September, and the cloud's watched flow (scripts/fixtures/planner-queue.json).
  const fx = JSON.parse(fs5.readFileSync(new URL('./fixtures/planner-queue.json', import.meta.url), 'utf8'));
  const P = await import('../src/lib/prospects.ts');
  const Sp = await import('../src/lib/split.ts');
  const { judgeProspect } = await import('../src/lib/evaluate.ts');
  const Pl = await import('../src/lib/planner.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  // The user's settings (the synced document): broker 1.25%, tax 3.375%, share 7.5%; the planner's 1 B over 7 days.
  const S = sanitizeSettings({ acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, override: false, target: 5, share: 7.5 });
  const fl = Pl.plannerFilters(null, 1e9, 7);
  const now = Date.parse('2026-10-02T10:00:00Z');

  eq('a long queue is over two weeks of buyers; Place and leave\'s run-up bar is 30%, the front\'s still 50%', [Sp.LONG_QUEUE_DAYS, P.RUN_UP_PATIENT, P.RUN_UP], [14, 0.3, 0.5]);
  eq('  a queue in days of buyers', Sp.sellQueue(16_200, 200, 'watched'), { units: 16_200, atLeast: false, perDay: 200, from: 'watched', days: 81, long: true });
  eq('  stock that sells within two weeks is no long queue', Sp.sellQueue(1000, 200, 'book').long, false);
  eq('  nothing claimed with no buyers to go on, or the split only assumed', [Sp.sellQueue(1000, NaN, 'book'), Sp.sellQueue(1000, 200, 'even'), Sp.sellQueue(1000, 0, 'even'), Sp.sellQueue(0, 200, 'book'), Sp.sellQueue(0, 0, 'book')], [null, null, null, null, null]);
  // A measured zero (the final review, 2 October 2026): the book or the watching saw nobody buy from listings, which is a
  // queue that doesn't clear, not nothing to say.
  const zero = Sp.sellQueue(1000, 0, 'book');
  eq('  a pace measured at zero is a long queue with no finite days', [zero?.units, zero?.perDay, zero?.from, zero?.days === Infinity, zero?.long], [1000, 0, 'book', true, true]);

  // How a queue is said, the same on Prospects and Orders. Prospects printed "the 0 a day" under 0.5 a day and "the 0%"
  // under 0.5% bought from listings: bulk markets that sell into bids, which is where long queues build.
  eq('  buyers a day: whole from 10, one decimal under it, never a 0 for a pace above nothing', [Sp.perDaySaid(250.4), Sp.perDaySaid(9.96), Sp.perDaySaid(0.3), Sp.perDaySaid(0.04)], ['about 250 a day', 'about 10 a day', 'about 0.3 a day', 'under 0.1 a day']);
  eq('  the share bought from listings: one decimal under 1%, never 0% for a share above nothing', [Sp.listingShareSaid(0.25), Sp.listingShareSaid(0.004), Sp.listingShareSaid(0.0002)], ['25%', '0.4%', 'under 0.1%']);
  eq('  a queue\'s length: about, at least where only part was seen, over a year past 365, and nobody seen buying',
    [Sp.queueLengthSaid({ days: 28.2, atLeast: false, perDay: 295 }), Sp.queueLengthSaid({ days: 17, atLeast: true, perDay: 250 }), Sp.queueLengthSaid({ days: 400, atLeast: true, perDay: 0.3 }), Sp.queueLengthSaid({ days: Infinity, atLeast: false, perDay: 0 })],
    ['about 28 days of buyers', 'at least 17 days of buyers', 'over a year of buyers', 'nobody has been seen buying from listings']);

  // 'Arbalest' Rapid Heavy Missile Launcher I: ~720 a day in The Forge, nearly all sold into bids at ~24.7k; the scan's
  // seven sell levels hold 4,361 units at 60,460-60,950; the cloud watched buyers take about 200 a day from listings.
  const a = fx[33440];
  const watched = { days: a.flow, flow: observedFlow({ 33440: a.flow }, 33440, now) };
  const arb = judgeProspect(a.stats, a.book, S, fl, a.orders, false, watched);
  eq('the Arbalest at the front: bought at 24,790 to sell at 60,450, the spread the user was caught by', [arb.buy, arb.sell], [24_790, 60_450]);
  eq('  flagged Long queue', arb.warnings.includes('longQueue'), true);
  eq('  every one of the scan\'s seven levels sits where buyers have paid, so at least 4,361, against the watched pace',
    [arb.queue.units, arb.queue.atLeast, arb.queue.from, arb.queue.upTo, Math.round(arb.queue.perDay), Math.round(arb.queue.days)], [4361, true, 'watched', 62_910, 250, 17]);
  eq('  buyers a day are the typical day × the share buying from listings', arb.queue.perDay, a.stats.unitsPerDay * arb.buyerShare);
  const arbBook = judgeProspect(a.stats, a.book, S, fl, a.orders);
  eq('  without the watch, the book\'s split: still flagged, and says so', [arbBook.warnings.includes('longQueue'), arbBook.queue.from, Math.round(arbBook.queue.days)], [true, 'book', 29]);
  const arbHist = judgeProspect(a.stats, { ...a.book, sold: undefined }, S, fl, a.orders);
  eq('  with history\'s guess alone: flagged, and the source is history', [arbHist.warnings.includes('longQueue'), arbHist.queue.from], [true, 'history']);
  has('  which the tip calls a guess', Sp.queuePaceSaid('history'), 'guessed');
  has('  and a rough one where sellers dump into bids', Sp.queuePaceSaid('history'), 'sell into the bids');
  eq('  the other sources say where they came from', [Sp.queuePaceSaid('watched').startsWith(Sp.SPLIT_SAID.watched), Sp.queuePaceSaid('book').startsWith(Sp.SPLIT_SAID.book)], [true, true]);
  // The tip, as Orders says a queue: the lower bound, the pace and share from the same helpers.
  const arbSaid = P.longQueueSaid(arb.queue, a.stats.unitsPerDay, arb.buyerShare);
  has('  the tip leads with the count and how many days of buyers it is', arbSaid, 'At least 4,361 units are listed at prices buyers have been paying: at least 17 days of buyers here, who take about 250 a day from listings');
  has('  then the typical day times the share bought from listings', arbSaid, `That’s a typical day’s ${a.stats.unitsPerDay} units × the ${Sp.listingShareSaid(arb.buyerShare)} bought from listings, ${Sp.queuePaceSaid('watched')}`);
  // A slow bulk market (invented for the test): 75 units a typical day, 0.4% of them bought from listings, 120 listed.
  const slowSaid = P.longQueueSaid({ ...Sp.sellQueue(120, 75 * 0.004, 'book'), upTo: 62_910 }, 75, 0.004);
  has('  a slow market\'s queue says its pace and share with a decimal, never a 0', slowSaid, 'over a year of buyers here, who take about 0.3 a day from listings');
  has('    the share too', slowSaid, '75 units × the 0.4% bought from listings');
  eq('    and no false zero anywhere in it', [/\b0 a day|the 0%/.test(slowSaid), /Infinity|NaN/.test(slowSaid)], [false, false]);
  const nobodySaid = P.longQueueSaid({ ...Sp.sellQueue(120, 0, 'book'), upTo: 62_910 }, 75, 0);
  has('  nobody seen buying from listings is said so', nobodySaid, 'nobody has been seen buying from listings here');
  eq('    with no days printed', /Infinity|over a year|about 0 /.test(nobodySaid), false);
  // Prospects drops an item nobody buys from listings: nothing fills a sell there, so it has no pace to rank (throughput).
  const nobody = { sell: 0, buy: 400, single: { sell: 0, buy: 0 }, orders: { sell: 10, buy: 10 } };
  eq('  a book whose listings have sold nothing: Prospects still drops the item, as before', judgeProspect(a.stats, { ...a.book, sold: nobody }, S, fl, a.orders), null);
  const arbEven = judgeProspect({ ...a.stats, buyerShare: undefined }, { ...a.book, sold: undefined }, S, fl, a.orders);
  eq('  with nothing to say who buys (an even split assumed), no flag and no queue', [arbEven.warnings.includes('longQueue'), arbEven.queue], [false, undefined]);
  const arbOld = judgeProspect({ ...a.stats, highs14: undefined }, a.book, S, fl, a.orders, false, { flow: watched.flow });
  eq('  stats from before the highs were kept: nothing listed counts as reached, no flag', [arbOld.warnings.includes('longQueue'), arbOld.queue?.units ?? 0], [false, 0]);
  const arbLeave = judgeProspect(a.stats, a.book, S, { ...fl, patient: true }, a.orders, false, watched);
  eq('  Place and leave sells at 27,100, in front of the whole queue: nothing ahead, no flag', [arbLeave.sell, arbLeave.warnings.includes('longQueue')], [27_100, false]);
  // A busy market whose seven levels hold under two weeks of buyers, and listings above where trading reaches.
  const calm = { ...a.book, topSells: [{ price: 60_460, volume: 500 }, { price: 60_470, volume: 500 }, { price: 90_000, volume: 50_000 }] };
  const calmP = judgeProspect(a.stats, calm, S, fl, a.orders, false, watched);
  eq('a queue under two weeks of buyers is not flagged, and stock above where trading reaches isn\'t counted', [calmP.warnings.includes('longQueue'), calmP.queue.units, calmP.queue.atLeast], [false, 1000, false]);
  // A side with fewer than the levels a summary keeps was read whole: its count is exact, not "at least".
  const whole = judgeProspect(a.stats, { ...a.book, topSells: a.book.topSells.slice(0, 3) }, S, fl, a.orders, false, watched);
  eq('  a side of three prices, all where buyers have paid, is counted whole, not "at least"', [P.BOOK_LEVELS, whole.queue.units, whole.queue.atLeast], [7, 333 + 1808 + 371, false]);

  // Vigilance Resonance Key: 21-23 M through early September, then a climb; ESI's last three days (28-30 September)
  // averaged 31.98 M against a month's median day of 22.89 M.
  const vk = P.statsFrom(89156, fx[89156].rows, Date.parse('2026-10-01T11:30:00Z'));
  eq('the Key\'s run-up on the cloud\'s 1 October scan: +40%, over Place and leave\'s 30% and under the front\'s 50%', Math.round(vk.runUp * 100), 40);
  const kb = fx[89156].book;
  const vkFront = judgeProspect(vk, kb, S, fl, fx[89156].orders);
  const vkLeave = judgeProspect(vk, kb, S, { ...fl, patient: true }, fx[89156].orders);
  eq('  at the front: not flagged', vkFront.warnings.includes('runUp'), false);
  eq('  placed and left, at 36.82 M from the climb\'s days: flagged', [vkLeave.sell, vkLeave.warnings.includes('runUp')], [36_820_000, true]);
  const inp = { isk: 1e9, slots: 10, horizonDays: 7, maxShare: 0.25 };
  eq('  so it is left out of a Place-and-leave plan, and kept in one at the front', [Pl.allocate([vkLeave], inp).rows.length, Pl.allocate([vkFront], inp).rows.length], [0, 1]);
  eq('  the bar said is the one that applied', [P.runUpBar(true), P.runUpBar(false), P.runUpBar(undefined)], [0.3, 0.5, 0.5]);
  eq('  warningsFor takes the bar it is given', [P.warningsFor(vk, { buyOrders: 20, sellOrders: 30, topBuys: [], topSells: [] }, 0.1, 40, P.RUN_UP_PATIENT).includes('runUp'), P.warningsFor(vk, { buyOrders: 20, sellOrders: 30, topBuys: [], topSells: [] }, 0.1, 40).includes('runUp')], [true, false]);

  // The switch: "Leave out flagged items", off by default.
  eq('the switch leaves out Falling, Bids and Sells not reached, Crowded, Thin, Slow, Long queue and Market moved', Pl.SWITCH_EXCLUDES, ['falling', 'unreached', 'unreachedSell', 'crowded', 'thin', 'slow', 'longQueue', 'marketMoved']);
  eq('  never what the planner already leaves out, and never Raises kept back (a cost, not a flag)', [Pl.SWITCH_EXCLUDES.some((w) => Pl.PLANNER_EXCLUDES.includes(w)), Pl.SWITCH_EXCLUDES.includes('raiseReserve')], [false, false]);
  const item = (typeId, warnings = [], extra = {}) => ({ typeId, roiPerDay: 0.05, buy: 100, qty: 1e6, daysToFlip: 1, net: 10, warnings, ...extra });
  const each = Pl.SWITCH_EXCLUDES.map((w, i) => item(100 + i, [w]));
  const raises = item(200, [], { raiseReserve: { buy: 2, sell: 2, isk: 1 } });
  const list = [...each, raises, item(201), item(202, ['wall']), item(203, ['falling', 'thin'])];
  const off = Pl.plannerPool(list), on = Pl.plannerPool(list, true);
  eq('  off: every flagged item stays in the pool, counted; the planner\'s own exclusions apart', [off.pool.length, off.excluded, off.flagged.total, off.allFlagged], [11, 1, 9, false]);
  eq('  on: only the clean one and the one with raises kept back', on.pool.map((p) => p.typeId), [200, 201]);
  eq('  how many by flag: an item with two counts under each, and once in the total',
    [on.flagged.total, on.flagged.byFlag], [9, { falling: 2, unreached: 1, unreachedSell: 1, crowded: 1, thin: 2, slow: 1, longQueue: 1, marketMoved: 1 }]);
  eq('  allocate follows the switch', [Pl.allocate(list, { ...inp, maxShare: 0.05 }).rows.length, Pl.allocate(list, { ...inp, slots: 40, maxShare: 0.05, leaveOutFlagged: true }).rows.map((r) => r.p.typeId).sort()], [5, [200, 201]]);
  const allOn = Pl.plannerPool([...each, item(202, ['wall'])], true);
  eq('  everything flagged, with the switch on: an empty pool that says why', [allOn.pool.length, allOn.flagged.total, allOn.allFlagged], [0, 8, true]);
  eq('  the same list with the switch off is not that', Pl.plannerPool([...each], false).allFlagged, false);
  eq('  nothing passed at all is not everything flagged', Pl.plannerPool([], true).allFlagged, false);
}

console.log('\n--- an NPC seller anywhere in The Forge keeps an item out of Prospects and caps the Sniper\'s resale; the scan counts the whole sell queue (2 October 2026) ---');
{
  const fs6 = await import('node:fs');
  // Read on 2 October 2026, all read-only: the cloud's full scan of 11:25 UTC, ESI's history, the whole Forge book at
  // 12:05 UTC and the Arbalest's whole Jita sell side at 11:34 UTC (scripts/fixtures/npc-anywhere.json).
  const fx = JSON.parse(fs6.readFileSync(new URL('./fixtures/npc-anywhere.json', import.meta.url), 'utf8'));
  const P = await import('../src/lib/prospects.ts');
  const { judgeProspect } = await import('../src/lib/evaluate.ts');
  const Pl = await import('../src/lib/planner.ts');
  const Sn = await import('../src/lib/snipe.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const S = sanitizeSettings({ acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, override: false, target: 5, share: 7.5 });
  // The user's saved Prospects filters (the cloud's `watch` doc), for the Busy markets view.
  const saved = { ...DEFAULT_FILTERS, budget: 1e9, horizonDays: 14, minTrades: 5, minDays: 20, minRoi: 0.03, maxSpikiness: 0.5 };
  const it = fx.items;
  const npcOf = (t) => Math.min(...it[t].npc.map(([, price]) => price));
  const withNpc = (t) => ({ ...it[t].book, npcAnywhere: npcOf(t) });

  // Command Carriers: 12 NPC orders in other Forge stations at 2,500 M, none in Jita (so Jita's npcSell never saw them),
  // while Jita's player listings start at 2,800 M and the Forge traded at exactly 2,500 M on 7 of 14 days.
  const cc = it[93983];
  eq('Command Carriers: NPCs sell it in 12 other Forge stations at 2,500 M, none in Jita', [cc.npc.length, npcOf(93983), cc.jita.some(([b, , , , d]) => !b && d >= 365), cc.book.npcSell], [12, 2.5e9, false, false]);
  // One book is 2,500 M, so a budget the user's 2,042 M wallet can't reach: the planner at 3 B.
  const big = Pl.plannerFilters(null, 3e9, 7);
  const ccOld = judgeProspect(cc.stats, cc.book, S, big, cc.orders);
  eq('  without the NPC price (a summary from a Worker a version behind): bought at 2,500 M to resell at 2,749.5 M', [ccOld?.buy, ccOld?.sell], [2.5e9, 2.7495e9]);
  eq('  with it, left out: NPCs sell it at 2,500 M, under where you\'d resell', judgeProspect(cc.stats, withNpc(93983), S, big, cc.orders), null);
  // Any NPC price, since the user approved it on 2 October 2026: "at or under where you'd resell" left skill books in.
  eq('  an NPC price over where you\'d resell leaves it out too', judgeProspect(cc.stats, { ...cc.book, npcAnywhere: 2.8e9 }, S, big, cc.orders), null);
  eq('  and at exactly the resale', judgeProspect(cc.stats, { ...cc.book, npcAnywhere: 2.7495e9 }, S, big, cc.orders), null);
  // Gallente Hauler (3340), a skill book, on the same scan: Jita listed from 470,400 with lowball bids at 1,236, and NPCs sold
  // it at 500,000 in 12 other Forge stations. Under "at or under the resale" it stayed in at 470,300, a four-figure return
  // on paper; now it's out of every view.
  const gh = fx.skill3340;
  eq('Gallente Hauler: NPCs sell it at 500,000 in 12 other Forge stations, none in Jita', [gh.npc.length, Math.min(...gh.npc.map(([, p]) => p)), gh.jita.some(([b, , , , d]) => !b && d >= 365), gh.book.npcSell], [12, 500_000, false, false]);
  const ghOld = judgeProspect(gh.stats, gh.book, S, big, gh.orders);
  eq('  without the NPC price: priced to resell at 470,300, a four-figure return on paper', [ghOld?.sell, ghOld?.roi > 10], [470_300, true]);
  eq('  with it, at 500,000 over that resale: left out', judgeProspect(gh.stats, { ...gh.book, npcAnywhere: 500_000 }, S, big, gh.orders), null);
  eq('    placed and left too', [!!judgeProspect(gh.stats, gh.book, S, Pl.plannerFilters(null, 3e9, 7, true), gh.orders), judgeProspect(gh.stats, { ...gh.book, npcAnywhere: 500_000 }, S, Pl.plannerFilters(null, 3e9, 7, true), gh.orders)], [true, null]);
  // Capital Ships (NPCs 450 M) and Amarr Carrier (550 M): at the front, trading already reaches the NPC price and the
  // margin is gone; the Busy markets view prices the top of the book, 487.9 M and 588.7 M, and showed them.
  const busy = { ...saved, busy: true, partial: true };
  for (const [t, top, npc] of [[20533, 487.9e6, 450e6], [24311, 588.7e6, 550e6]]) {
    const x = it[t];
    eq(`  ${x.name}: shown in Busy markets at ${top / 1e6} M without the NPC price`, judgeProspect(x.stats, x.book, S, busy, x.orders, true)?.sell, top);
    eq(`    left out with NPCs selling at ${npc / 1e6} M elsewhere in The Forge`, [npcOf(t), judgeProspect(x.stats, withNpc(t), S, busy, x.orders, true)], [npc, null]);
  }
  eq('  Gallente Hauler: shown in Busy markets at the top of the book without the NPC price, left out with it (over the resale)',
    [judgeProspect(gh.stats, gh.book, S, busy, gh.orders, true)?.sell, judgeProspect(gh.stats, { ...gh.book, npcAnywhere: 500_000 }, S, busy, gh.orders, true)], [470_300, null]);
  // Neurotoxin Recovery: no NPC orders anywhere in The Forge, 718 units in 14 days: a real player market. Its book read
  // every listing as bought (44 sold from listings, none into bids), so with the book's split nothing reaches a buy order;
  // history's split (56% buyers) prices it placed and left, 75.13 M to 88.88 M, and that's what the NPC rule must leave alone.
  const nr = it[25530];
  const nrBook = { ...nr.book, sold: undefined };
  const leave = Pl.plannerFilters(null, 3e9, 7, true);
  const nrP = judgeProspect(nr.stats, nrBook, S, leave, nr.orders);
  eq('Neurotoxin Recovery: no NPC orders anywhere, so kept, exactly as before', [nr.npc.length, nrP?.buy, nrP?.sell, JSON.stringify(judgeProspect(nr.stats, { ...nrBook, npcAnywhere: undefined }, S, leave, nr.orders)) === JSON.stringify(nrP)], [0, 75.13e6, 88.88e6, true]);

  // The Sniper: a listing well under where Command Carriers trades (a mistake at 2,000 M, invented to test the rule; the
  // next listing is the real 2,800 M) relists at most at the NPC price, never at the 2,749.5 M trading reached.
  const now = Date.parse('2026-10-02T12:10:00Z');
  const O = (id, price, units) => ({ id, price, units, total: units, issued: '2026-10-02T12:00:00Z' });
  const ccSt = { highs14: cc.stats.highs14, unitsPerDay: cc.stats.unitsPerDay, daysTraded: cc.stats.daysTraded, lastMove: cc.stats.lastMove };
  const free = Sn.findListing(93983, [O(1, 2e9, 1), O(2, 2.8e9, 1)], false, ccSt, now);
  const capped = Sn.findListing(93983, [O(1, 2e9, 1), O(2, 2.8e9, 1)], false, ccSt, now, 2.5e9);
  eq('the Sniper relists a Command Carriers at 2,749.5 M where trading reached, but at 2,500 M where NPCs sell it', [free?.resale, free?.npc, capped?.resale, capped?.npc], [2.7495e9, undefined, 2.5e9, 2.5e9]);
  eq('  a listing that pays against where it trades but not against the NPC price is no snipe', [!!Sn.findListing(93983, [O(1, 2.4e9, 1), O(2, 2.8e9, 1)], false, ccSt, now), Sn.findListing(93983, [O(1, 2.4e9, 1), O(2, 2.8e9, 1)], false, ccSt, now, 2.5e9)], [true, null]);
  eq('  an NPC price over the resale changes nothing', Sn.findListing(93983, [O(1, 2e9, 1), O(2, 2.8e9, 1)], false, ccSt, now, 3e9)?.resale, 2.7495e9);
  // The Sniper keeps its own rule (not part of the user's choice for Prospects): an NPC-sold skill book listed well under the
  // NPC price is still a snipe, relisted no dearer than the NPCs. Gallente Hauler at 100 a unit (invented), the next listing
  // its real 470,400.
  const ghSt = { highs14: gh.stats.highs14, unitsPerDay: gh.stats.unitsPerDay, daysTraded: gh.stats.daysTraded, lastMove: gh.stats.lastMove };
  const ghSnipe = Sn.findListing(3340, [O(1, 100_000, 20), O(2, 470_400, 46)], false, ghSt, now, 500_000);
  eq('  a skill book NPCs sell at 500,000, listed at 100,000: still a snipe, relisted one step under the next listing', [!!ghSnipe, ghSnipe?.resale, ghSnipe?.npc], [true, 470_300, 500_000]);
  // A high bid for one you hold is set against listing it, which can't fetch more than the NPC price either.
  const bid = { id: 9, price: 2.6e9, units: 1, minVolume: 1, issued: '2026-10-02T12:00:00Z' };
  eq('  a 2,600 M bid beats listing at the NPC\'s 2,500 M, not at 2,749.5 M', [Sn.findBid(93983, bid, ccSt), Sn.findBid(93983, bid, ccSt, 2.5e9)?.fair, Sn.findBid(93983, bid, ccSt, 2.5e9)?.npc], [null, 2.5e9, 2.5e9]);
  // The mail says why the relist is under where trading got up to, or it reads as a contradiction.
  const { alertMail: mailNpc } = await import('../src/lib/alerts.ts');
  const ccMail = mailNpc([{ kind: 'snipe', key: 'snipe:1@2000000000', title: 'Mistake listing', typeId: 93983, name: 'Command Carriers', isk: 390.6e6, text: 'x',
    snipe: { side: 'buy', units: 1, cheapest: 2e9, top: 2e9, cost: 2e9, resale: capped.resale, fair: capped.fair, nextAsk: capped.nextAsk, profit: 390.6e6, pct: 0.195, pricedAt: '2026-10-02T12:00:00Z', orders: 1, sellDays: 2, npc: capped.npc } }],
  { appUrl: 'https://x/', keepMin: 30, now });
  has('  the mail relists at the NPC price and says why', ccMail.body, 'relist at 2,500,000,000 ISK');
  has('    ', ccMail.body, 'NPCs sell it at 2,500,000,000 elsewhere in The Forge, so it relists no dearer');
  const bidMail = mailNpc([{ kind: 'snipe', key: 'snipebid:9@2600000000', title: 'High bid for what you hold', typeId: 93983, name: 'Command Carriers', isk: 1, text: 'x',
    snipe: { side: 'sell', qty: 1, price: 2.6e9, proceeds: 2.51e9, gain: 1, held: 1, fair: 2.5e9, minVolume: 1, npc: 2.5e9 } }], { appUrl: 'https://x/', keepMin: 30, now });
  has('  and a high bid\'s says listing gets no more than the NPCs', bidMail.body, 'NPCs sell it at 2,500,000,000 elsewhere in The Forge, so a listing gets no more.');

  // The whole-book count. 'Arbalest' Rapid Heavy Missile Launcher I on today's scan: the seven levels hold 2,781 units at
  // 60,280-60,370, every one under where trading got up to on 4 of 14 days (62,910 with the cloud's watched highs).
  const a = it[33440];
  const watched = { days: a.flow, flow: observedFlow({ 33440: a.flow }, 33440, Date.parse('2026-10-02T12:00:00Z')) };
  const fl = Pl.plannerFilters(null, 1e9, 7);
  const arb7 = judgeProspect(a.stats, a.book, S, fl, a.orders, false, watched);
  eq('the Arbalest on the seven levels alone: at least 2,781 up to 62,910, 11 days of buyers, not flagged',
    [arb7.queue.units, arb7.queue.atLeast, arb7.queue.upTo, Math.round(arb7.queue.days), arb7.warnings.includes('longQueue')], [2781, true, 62_910, 11, false]);
  const whole = fx.arbalestSells1134.filter(([p]) => p <= 62_910).reduce((t, [, u]) => t + u, 0);
  const arbW = judgeProspect(a.stats, { ...a.book, sellsTo: { price: 62_910, units: whole } }, S, fl, a.orders, false, watched);
  eq('  with the scan\'s whole-book count up to the same price (5,170 at 11:34): exact, 20 days, flagged Long queue',
    [whole, arbW.queue.units, arbW.queue.atLeast, arbW.queue.countedTo, Math.round(arbW.queue.days), arbW.warnings.includes('longQueue')], [5170, 5170, false, 62_910, 20, true]);
  eq('  a summary without the count (a Worker a version behind, the browser\'s own scan) is as before', JSON.stringify(judgeProspect(a.stats, { ...a.book, sellsTo: undefined }, S, fl, a.orders, false, watched)), JSON.stringify(arb7));

  // listedQueue with the count: exact only where it was counted to the queue's own ceiling.
  const lv = a.book.topSells;
  const highs = [60_000, 62_910, 62_910, 62_910, 62_910, 60_000];
  eq('the queue\'s ceiling is where trading got up to on FILL_RARE of the days', [P.queueCeiling(highs), P.queueCeiling([1, 2, 3])], [62_910, null]);
  const lq = (sellsTo) => P.listedQueue(lv, 60_270, 60_270, highs, sellsTo);
  eq('  counted to the ceiling: that count, exact', lq({ price: 62_910, units: 5170 }), { units: 5170, atLeast: false, upTo: 62_910, countedTo: 62_910 });
  eq('  counted to a lower price (twice the best ask, or a ceiling without the watched highs): at least that', lq({ price: 60_950, units: 4657 }), { units: 4657, atLeast: true, upTo: 62_910, countedTo: 60_950 });
  eq('  counted past the ceiling: the levels, as before', lq({ price: 70_000, units: 9000 }), { units: 2781, atLeast: true, upTo: 62_910 });
  eq('  a live book holding more than the morning\'s count (merged over the scan\'s): at least the levels', lq({ price: 62_910, units: 2000 }), { units: 2781, atLeast: true, upTo: 62_910, countedTo: 62_910 });
  eq('  where the levels already reach past the ceiling, they\'re exact and the count isn\'t needed', P.listedQueue([...lv.slice(0, 3), { price: 70_000, volume: 5 }], 60_270, 60_270, highs, { price: 62_910, units: 5170 }), { units: 353 + 186 + 13, atLeast: false, upTo: 62_910 });
  // What the tip says of each.
  has('  the tip: counted over the whole book', P.queueCountSaid({ atLeast: false, upTo: 62_910, countedTo: 62_910 }), 'counted when the cloud’s daily scan read the whole book');
  has('    counted short of the ceiling: how far, and likely more', P.queueCountSaid({ atLeast: true, upTo: 62_910, countedTo: 60_950 }), 'counted every listing up to 60,950 ISK, so there are likely more');
  has('    the seven levels alone, as before', P.queueCountSaid({ atLeast: true, upTo: 62_910 }), 'cheapest 7 prices a side, and every one is under it');
  eq('    a side read whole says nothing more', P.queueCountSaid({ atLeast: false, upTo: 62_910 }), '');
  // What the scan stores: every listing up to the ceiling, or up to SELLS_COUNTED_TO times the best ask where that's lower.
  const side = [[60_280, 353], [60_330, 1808], [62_910, 9], [62_930, 3963], [130_000, 50]];
  eq('the scan counts listings up to the ceiling', [P.SELLS_COUNTED_TO, P.sellsToOf(side, 60_280, 62_910)], [2, { price: 62_910, units: 2170 }]);
  eq('  and no further than twice the best ask, which is all it keeps', P.sellsToOf([[30_000, 4], ...side], 30_000, 62_910), { price: 60_000, units: 4 });

  // The cloud's five-minute watch sends live books for the best candidates, over the scan's: they hold only Jita's orders,
  // so what the scan read of the whole region and the whole side stays with them.
  const E = await import('../src/lib/evaluate.ts');
  const live = { ...a.book, at: '2026-10-02T12:30:00.000Z', topSells: a.book.topSells.slice(1), npcSell: false };
  const scanBook = { ...a.book, npcSell: false, npcAnywhere: 2.5e9, sellsTo: { price: 62_910, units: 5170 } };
  eq('a live book merged over the scan\'s keeps its NPC notes and whole-side count', E.overScan(live, scanBook), { ...live, npcAnywhere: 2.5e9, sellsTo: { price: 62_910, units: 5170 } });
  eq('  and an NPC seller in Jita, which the watch doesn\'t look for', E.overScan(live, { ...a.book, npcSell: true }).npcSell, true);
  eq('  with no scan book, or one without them, the live book as it is', [E.overScan(live, undefined), E.overScan(live, a.book)], [live, { ...live, npcSell: false }]);
}

console.log('\n--- an order knows its plan, and a buy is never raised into a loss (Praxis, 30 September 2026) ---');
{
  const fs4 = await import('node:fs');
  const fx = JSON.parse(fs4.readFileSync(new URL('./fixtures/plan-review.json', import.meta.url), 'utf8'));
  const { planTargets } = await import('../src/lib/plans.ts');
  const { judgeOrder: judgeOne, PLAN_KEEP, paidPerUnit } = await import('../src/lib/relist.ts');
  const { recentRange } = await import('../src/lib/fills.ts');
  const { sanitizeSettings, rates } = await import('../src/lib/fees.ts');
  const { orderFindings } = await import('../src/lib/alerts.ts');
  const { priceDown } = await import('../src/lib/tick.ts');
  const M = 1e6;
  // The user's settings (the synced document): broker 1.25% from skills and standings, tax 3.375%, wait 3 hours.
  const S = sanitizeSettings({ acc: 5, br: 5, abr: 5, trade: 5, retail: 5, wholesale: 4, tycoon: 0, clone: 'omega', faction: 3.6289558729999998, corp: 7.039647095, taxBase: 7.5, override: false, target: 5, share: 7.5, waitHours: 3 });
  const r = rates(S);
  const PX = 47466, KEY = 89156, ID = 7433389018, JITA = 60003760;
  const plan = { id: 'mundr0gwk1vekg', name: '30 Sept · 991.64 M ISK in 4 items', at: '2026-09-30T00:41:37.568Z', isk: 991640000, horizonDays: 7, patient: false, items: [
    { typeId: KEY, buyAt: 24.96 * M, units: 16, sellAt: 35.99 * M, positionId: 'mundijzchrgwxh' },
    { typeId: PX, buyAt: 206.3 * M, units: 1, sellAt: 226 * M, positionId: 'mundr0gxt6lx47' },
  ] };
  const positions = [{ id: 'mundijzchrgwxh', typeId: KEY, status: 'open' }, { id: 'mundr0gxt6lx47', typeId: PX, status: 'open' }];
  const targets = planTargets([plan], positions, r);
  eq('the plan expected 3.2% on Praxis at its own prices, after the broker fee both ways and tax', [targets[PX].planId, Math.round(targets[PX].expected * 1000) / 10], [plan.id, 3.2]);
  eq('  a raise must leave half of it', PLAN_KEEP, 0.5);
  // The plan's position closed, or deleted, or the item in a newer plan sharing its position: judged by no plan, or the newer.
  eq('a plan whose position closed applies to nothing', planTargets([plan], [positions[0], { ...positions[1], status: 'closed' }], r)[PX], undefined);
  eq('  nor one whose position was deleted', planTargets([plan], [positions[0]], r)[PX], undefined);
  eq('  nor a position that follows another item', planTargets([plan], [positions[0], { ...positions[1], typeId: 34 }], r)[PX], undefined);
  const newer = { ...plan, id: 'later', at: '2026-10-02T00:00:00Z', items: [{ ...plan.items[1], buyAt: 200 * M, sellAt: 230 * M }] };
  eq('  two plans on one open position: the newer one\'s prices, whatever order they come in', [planTargets([plan, newer], positions, r)[PX].planId, planTargets([newer, plan], positions, r)[PX].sellAt], ['later', 230 * M]);
  eq('  the older plan still holds its other item', planTargets([plan, newer], positions, r)[KEY].planId, plan.id);

  // Praxis's versions as the cloud kept them: placed at 206.3 M at 00:42, raised to 206.7 M at 08:39 and 207.1 M at
  // 11:22. Each change cost k on its price (516,890 and 517,890) plus the broker fee on the increase (the journal:
  // 521,891 and 522,892), which a bid's own broker fee at its present price already counts.
  const v = [
    { issued: '2026-09-30T00:42:35Z', price: 206.3 * M, remain: 1 },
    { issued: '2026-09-30T08:39:24Z', price: 206.7 * M, remain: 1 },
    { issued: '2026-09-30T11:22:15Z', price: 207.1 * M, remain: 1 },
  ];
  eq('the price changes paid so far, per unit left', paidPerUnit(v, r.k), r.k * (206.7 * M + 207.1 * M));
  eq('  none for an order never changed', paidPerUnit(v.slice(0, 1), r.k), 0);
  const order = (versions) => ({ orderId: ID, typeId: PX, isBuy: true, price: versions.at(-1).price, volumeTotal: 1, volumeRemain: 1, issued: versions.at(-1).issued, state: 'open', locationId: JITA, seen: versions });
  // Its book: a rival bid over it, the cheapest listing, a lowball bid and listings further up; ~10 a day sold into bids.
  const book = (mine, rival, rivalUnits, ask) => [
    { id: ID, isBuy: true, price: mine, volume: 1 }, { id: 1, isBuy: true, price: rival, volume: rivalUnits }, { id: 2, isBuy: true, price: 200 * M, volume: 5 },
    { id: 3, isBuy: false, price: ask, volume: 2 }, { id: 4, isBuy: false, price: 230 * M, volume: 10 },
  ];
  const at2 = Date.parse('2026-09-30T11:20:00Z'), at3 = Date.parse('2026-09-30T22:49:00Z');
  const range = recentRange(fx[PX].rows, 14, at3);
  const judge = (o, b, pl, now, extra = {}) => judgeOne(o, { book: b, perDay: 10, lows: range.lows, highs: range.highs, txs: [], yours: [ID], plan: pl, ...extra }, S, now);

  // The second raise: 206.7 M beaten by 2 at 207.0 M, listings selling at 225.6 M. Raising to 207.1 M leaves 2.1%, over half.
  const x2 = judge(order(v.slice(0, 2)), book(206.7 * M, 207 * M, 2, 225.7 * M), targets[PX], at2);
  eq('the second raise, to 207.1 M with listings at 225.6 M, still stands: 2.1% after fees, over half the plan\'s 3.2%', [x2.verdict, x2.newPrice, x2.keep, x2.plan?.planId], ['move', 207.1 * M, undefined, plan.id]);

  // The third: 207.1 M beaten by 4 at 208.3 M, listings at 224.9 M. Raising to 208.4 M, with three changes paid, leaves 0.9%.
  const b3 = book(207.1 * M, 208.3 * M, 4, 225 * M);
  const x3 = judge(order(v), b3, targets[PX], at3);
  eq('the third raise, to 208.4 M with listings at 224.9 M, is refused: keep it', [x3.verdict, x3.keep?.at, x3.keep?.resale, x3.keep?.from, Math.round(x3.keep?.ret * 1000) / 10, Math.round(x3.keep?.floor * 1000) / 10], ['loss', 208.4 * M, 224.9 * M, 'market', 0.9, 1.6]);
  eq('  said in order: don\'t raise, what raising leaves against what the plan expected, keep it at 207.1 M', x3.why,
    'Don’t raise it: at 208,400,000 it would make 0.9% after fees, counting the 1.03 M ISK already paid to change its price, selling on at 224,900,000 (where a listing sells now), under half the 3.2% the plan expected. Keep it at 207,100,000');
  eq('  and it isn\'t mailed: no "move" finding', orderFindings([x3], () => 'Praxis').length, 0);
  // The same order with no plan is guarded at break-even only: 0.9% is a profit, so the raise stands.
  const free = judge(order(v), b3, null, at3);
  eq('a buy with no plan is guarded at break-even only', [free.verdict, free.newPrice, free.keep, free.plan], ['move', 208.4 * M, undefined, undefined]);
  const loses = judge(order(v), book(207.1 * M, 208.3 * M, 4, 219 * M), null, at3);
  eq('  and refused where the raise would lose', [loses.verdict, loses.keep?.from], ['loss', 'market']);
  has('  saying so', loses.why, 'it would lose ');
  eq('  never with the plan\'s words', loses.why.includes('plan'), false);
  // The plan's sale price is lower than where a listing sells now: the plan's is what the raise is judged at.
  const lowPlan = judge(order(v), b3, { ...targets[PX], sellAt: 220 * M }, at3);
  eq('a plan selling lower than the market is judged at its own price', [lowPlan.verdict, lowPlan.keep?.resale, lowPlan.keep?.from], ['loss', 220 * M, 'plan']);
  has('  and says so', lowPlan.why, 'selling on at 220,000,000 (the plan’s price)');
  // A plan whose position closed: the order is judged as any buy.
  const closed = planTargets([plan], [{ ...positions[1], status: 'closed' }], r)[PX];
  eq('a plan whose position closed isn\'t applied to its order', judge(order(v), b3, closed, at3).verdict, 'move');
  // One you're leaving isn't told to move, or kept: it waits, as before.
  eq('a plan buy you\'re leaving waits, as before', [judge(order(v), b3, targets[PX], at3, { leave: true }).verdict, judge(order(v), b3, targets[PX], at3, { leave: true }).keep], ['wait', undefined]);

  // A buy whose own price already costs more than its resale pays back.
  eq('a buy that resells for more is not flagged', x3.overResale, undefined);
  const over = judge(order(v), book(207.1 * M, 208.3 * M, 4, 218 * M), null, at3);
  const net = 217.9 * M * (1 - r.f - r.t), paid = r.k * (206.7 * M + 207.1 * M);
  eq('a buy whose price already returns under break-even at the resale is flagged, with the bid that breaks even',
    [over.overResale?.resale, over.overResale?.breakEven, Math.round(over.overResale?.ret * 1000) / 10], [217.9 * M, priceDown((net - paid) / (1 + r.f)), Math.round((net / (207.1 * M * (1 + r.f) + paid) - 1) * 1000) / 10]);
  eq('  a sell never is', judge({ ...order(v), isBuy: false }, b3, null, at3).overResale, undefined);

  // A buy with no plan and no history (a new item): the book alone, and nothing it can't support.
  const bare = (b) => judgeOne(order(v), { book: b, perDay: 10, lows: null, highs: null, txs: [], yours: [ID] }, S, at3);
  eq('no history: priced one step under the cheapest listing, the book alone', [bare(b3).verdict, bare(book(207.1 * M, 208.3 * M, 4, 219 * M)).verdict], ['move', 'loss']);
  const noAsks = bare(b3.filter((b) => b.isBuy));
  eq('  no listings either: no guard, no flag, the queue decides', [noAsks.verdict, noAsks.keep, noAsks.overResale], ['move', undefined, undefined]);

  // A plan's sell told to go under the plan's price says what the plan expected; the guard is still its cost.
  const sellO = { orderId: 99, typeId: PX, isBuy: false, price: 226 * M, volumeTotal: 1, volumeRemain: 1, issued: '2026-10-01T10:49:35Z', state: 'open', locationId: JITA, seen: [{ issued: '2026-10-01T10:49:35Z', price: 226 * M, remain: 1 }] };
  const sBook = [{ id: 99, isBuy: false, price: 226 * M, volume: 1 }, { id: 5, isBuy: false, price: 221.9 * M, volume: 40 }, { id: 6, isBuy: true, price: 207.9 * M, volume: 1 }];
  const sell1 = judgeOne(sellO, { book: sBook, perDay: 10, avgCost: 208.4 * M, lows: range.lows, highs: range.highs, txs: [], yours: [99], plan: targets[PX] }, S, at3);
  eq('a plan\'s sell moved under its price', [sell1.verdict, sell1.newPrice], ['move', 221.8 * M]);
  has('  says what the plan expected', sell1.why, 'The plan expected to sell at 226,000,000');
  const sell2 = judgeOne(sellO, { book: sBook, perDay: 10, avgCost: 225 * M, lows: range.lows, highs: range.highs, txs: [], yours: [99], plan: targets[PX] }, S, at3);
  eq('  and under its cost is still not worth it', [sell2.verdict, sell2.keep], ['loss', undefined]);
  has('  saying both', sell2.why, 'under what the stock cost you. The plan expected to sell at 226,000,000');

  // To do: a move ticked off because a raise would no longer pay says what the guard said.
  const e = { item: { key: `order:${ID}`, kind: 'move', price: 207.1 * M }, seenAt: at3 - 600_000, lastAt: at3 - 600_000 };
  eq('To do: a move that now would raise into a loss is ticked off saying keep it', judgeOrder(e, { open: true, checkedAt: at3, bookRead: true, v: x3 }), `${x3.why}.`);
  eq('Praxis\'s floor is the plan\'s half, under the 5% target', x3.keep?.floorFrom, 'plan');

  // The floor is capped at your own target (the coordinator's ruling, 1 October 2026). The plan's Vigilance Resonance
  // Key was priced from a spike to make 36%: half of that refused a raise that still left 7.6% against the user's 5%.
  const ob = JSON.parse(fs4.readFileSync(new URL('./fixtures/order-books.json', import.meta.url), 'utf8'));
  const lite = (rows) => rows.map(([id, b, price, volume]) => ({ id, isBuy: b === 1, price, volume }));
  const KID = 7433389540;
  const keyV = [['2026-09-30T00:44:02Z', 24.96, 16], ['2026-09-30T01:13:08Z', 25.01, 16], ['2026-09-30T12:02:26Z', 25.07, 12], ['2026-09-30T18:43:54Z', 25.12, 9], ['2026-10-01T09:42:03Z', 25.2, 9]]
    .map(([issued, p, remain]) => ({ issued, price: p * M, remain }));
  const keyO = { orderId: KID, typeId: KEY, isBuy: true, price: 25.2 * M, volumeTotal: 16, volumeRemain: 7, issued: keyV.at(-1).issued, state: 'open', locationId: JITA, seen: keyV };
  const keyAt = Date.parse('2026-10-01T18:27:00Z');
  const keyJudge = (book, extra = {}) => judgeOne(keyO, { book, perDay: 10, lows: null, highs: null, txs: [], yours: [KID], plan: targets[KEY], ...extra }, S, keyAt);
  eq('the Key\'s plan expected 36%', Math.round(targets[KEY].expected * 100), 36);
  const k1 = keyJudge(lite(ob[KEY].step5));
  eq('the Key\'s raise to 25.24 M, leaving 7.6% selling at 29.19 M, clears your 5% target: it moves', [k1.verdict, k1.newPrice, k1.keep], ['move', 25.24 * M, undefined]);
  const lower = lite(ob[KEY].step5).map((o) => (!o.isBuy && o.price < 28.2 * M + 1 ? o : !o.isBuy ? { ...o, price: o.price - 1 * M } : o));
  const k2 = keyJudge(lower);
  eq('  listings at 28.2 M instead: 3.9%, under your target, kept', [k2.verdict, k2.keep?.floorFrom, Math.round(k2.keep?.ret * 1000) / 10], ['loss', 'target', 3.9]);
  has('  saying which floor it fell under', k2.why, 'under your 5% target (the plan expected 36%)');

  // A buy side's centre is weighed by ISK: 100,000 bids at 0.02 ISK were the Key's centre by units.
  const reviewBids = lite(ob[KEY].review).filter((o) => o.isBuy);
  eq('the Key\'s bids: by units their centre is the 0.02 ISK flood, by ISK where the real bids sit', [weightedLevel(reviewBids), weightedLevel(reviewBids, 'isk')], [0.02, 25.17 * M]);
  eq('  and the market\'s best bid isn\'t the flood any more', marketBest(reviewBids, true), 25.22 * M);
  const k3 = keyJudge(lite(ob[KEY].review));
  eq('the user\'s Key bid, 1 ahead at 25.22 M: not a token dump, a short queue', [k3.verdict, /token dump/.test(k3.why), k3.why], ['wait', false, 'Only 1 ahead of you, about 2 h at this item\'s pace']);
  eq('  nor at Step 5\'s book', /token dump/.test(k1.why), false);
  // The sentence's gap is never absurd: a share under double, else a multiple, at most "over 100 times".
  const gap = (rival) => adviseRelist({ orderId: 1, typeId: 34, isBuy: true, price: 100, volumeRemain: 1000 }, { book: [o(1, true, 100, 1000), o(2, true, rival, 1)] }, R).why;
  eq('a bid three times the book\'s', /priced 3\.0 times where the rest of the book sits \(100\)/.test(gap(300)), true);
  eq('  and five hundred times it', /priced over 100 times where the rest of the book sits/.test(gap(50_000)), true);
  eq('  a sell\'s gap stays a share', /priced 29% below/.test(adviseRelist(fatMine, { book: fatBook }, R).why), true);

  // Where an item trades, for the token guard, is anchored on history when it can say (the coordinator's ruling, 1
  // October 2026): halfway between the fortnight's median low and median high. A flood far from trading can't move it.
  const { tradedLevel } = await import('../src/lib/relist.ts');
  const rangeOf = (t) => recentRange(ob.hist[t], 14, keyAt);
  for (const [t, perDay, name] of [[6635, 40, 'Dual Modulated Light Energy Beam I'], [5141, 300, 'Small Ghoul Compact Energy Nosferatu']]) {
    const mineO = { ...ob.mine[t], state: 'open' };
    const rg = rangeOf(t);
    const judged = (lows, highs) => judgeOne(mineO, { book: lite(ob[t]), perDay, lows, highs, txs: [], yours: [mineO.orderId] }, S, keyAt);
    const withH = judged(rg.lows, rg.highs), bookOnly = judged(null, null);
    eq(`${name}: by the book alone a flood of high listings made its front a token`, /token dump/.test(bookOnly.why), true);
    eq(`  anchored on where it traded, it isn't one`, [/token dump/.test(withH.why), tradedLevel(rg.lows, rg.highs) != null], [false, true]);
  }
  eq('the Dual Modulated Light Energy Beam I traded around 144,000, not 599,100', Math.round(tradedLevel(rangeOf(6635).lows, rangeOf(6635).highs) / 1000), 144);
  // The Key's buy, round 1's case, is the same with its history.
  const kr = rangeOf(KEY);
  const kh = keyJudge(lite(ob[KEY].step5), { lows: kr.lows, highs: kr.highs });
  eq('the Key\'s buy with its history: still moves to 25.24 M, no token', [kh.verdict, kh.newPrice, /token dump/.test(kh.why)], ['move', 25.24 * M, false]);
  eq('  and at the review, still a short queue', keyJudge(lite(ob[KEY].review), { lows: kr.lows, highs: kr.highs }).why, 'Only 1 ahead of you, about 2 h at this item\'s pace');
  // The token case still reads as one with history: the Small Focused Afocal Laser I, one unit at 5,003 over a 5,002 bid
  // ahead of 432 at 21,930, trading up to ~21,950 on 6 of 14 days and down to the 5,000 bids on most.
  const afBook = [
    o(10, false, 5003, 1), o(11, false, 21930, 432), o(12, false, 21940, 1), o(13, false, 21950, 16), o(14, false, 21960, 211),
    o(15, false, 21970, 146), o(16, false, 21990, 5), o(17, false, 22000, 136), o(18, false, 24380, 501),
    o(20, true, 5002, 428), o(21, true, 5001, 298), o(22, true, 5000, 8288),
  ];
  const afHighs = [21970, 2092, 12100, 21970, 21970, 5001, 21960, 21960, 20990, 20980, 20000, 20000, 5000, 21950];
  const afLows = [5000, 2000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000];
  const af = adviseRelist({ orderId: 11, typeId: 6717, isBuy: false, price: 21930, volumeRemain: 432 }, { book: afBook, dailyVolume: 7.2, highs: afHighs, lows: afLows }, R);
  eq('the Afocal\'s token, with history: still a token', [af.verdict, /token dump/.test(af.why), /where it has traded \(12,993/.test(af.why)], ['wait', true, true]);
  // Without the days to say (fewer than FILL_RARE traded on either side), the book decides, as before.
  eq('too few traded days: the book decides', [tradedLevel([5000, 5000, 5000], afHighs), /where the rest of the book sits/.test(adviseRelist({ orderId: 11, typeId: 6717, isBuy: false, price: 21930, volumeRemain: 432 }, { book: afBook, dailyVolume: 7.2, highs: afHighs, lows: [5000, 5000, 5000] }, R).why)], [null, true]);
  eq('  and with no history at all', /where the rest of the book sits/.test(adviseRelist(fatMine, { book: fatBook }, R).why), true);
  // A bid far over where the item trades still reads as one, its gap never absurd.
  const bait = adviseRelist({ orderId: 1, typeId: 34, isBuy: true, price: 100, volumeRemain: 1000 }, { book: [o(1, true, 100, 1000), o(2, true, 50_000, 1)], lows: Array(14).fill(95), highs: Array(14).fill(110) }, R);
  eq('an escrow-bait bid, history says 102.5: a token, "over 100 times"', [bait.verdict, /priced over 100 times where it has traded \(102\.5/.test(bait.why)], ['wait', true]);
}

console.log('\n--- the sniper ---');
{
  const Sn = await import('../src/lib/snipe.ts');
  const now = Date.parse('2026-09-28T01:00:00Z');
  const ago = (min) => new Date(now - min * 60_000).toISOString();
  // Trading got up to 1,000,000 on half the last 14 days; the item trades 20 a day on 30 of 30 days.
  const highs = [1.02e6, 1e6, 1.01e6, 0.99e6, 1e6, 1.03e6, 1e6, 0.98e6, 1.04e6, 0.97e6, 1e6, 1.05e6, 0.96e6, 0.95e6];
  const st = { highs14: highs, unitsPerDay: 20, daysTraded: 30, lastMove: 0.05 };
  const O = (id, price, units, min = 5, total = units) => ({ id, price, units, total, issued: ago(min) });
  const book = [O(1, 500_000, 10), O(2, 980_000, 10), O(3, 990_000, 10)];
  const hit = Sn.findListing(34, book, false, st, now);
  eq('  one listing at half price: buy the 10, relist a step under the next', [hit.orderIds, hit.units, hit.cost, hit.resale, hit.nextAsk, hit.doubts], [[1], 10, 5_000_000, 979_900, 980_000, []]);
  eq('  a gap too small to pay after fees is nothing', Sn.findListing(34, [O(1, 960_000, 10), O(2, 980_000, 10)], false, st, now), null);
  // Your own orders aren't snipes for you, or bids to sell into (the user's 100,100 membrane relist, 28 September 2026).
  const bidRow = { typeId: 34, orderId: 77, price: 1.2e6, units: 5, minVolume: 1, fair: 1e6, issued: ago(5), doubts: [] };
  const mineOut = Sn.notYours({ listings: [hit], bids: [bidRow] }, new Set([1, 77]));
  eq('  your own cheap listing and your own bid are set aside', [mineOut.listings.length, mineOut.bids.length], [0, 0]);
  eq('  someone else\'s stay', [Sn.notYours({ listings: [hit], bids: [bidRow] }, new Set([2, 78])).listings.length, Sn.notYours({ listings: [hit], bids: [bidRow] }, new Set([2, 78])).bids.length], [1, 1]);
  // The membrane as listed: 100,100 against 724,900 next, trading up to ~55,310 on half the fortnight, or 100,100 once
  // the new level has held a week. The resale is never above where trading reaches, so it's no snipe either way.
  const mem = (h) => Sn.findListing(16423, [O(9, 100100, 1), O(10, 724900, 1), O(11, 725000, 1)], false, { highs14: h, unitsPerDay: 150, daysTraded: 30, lastMove: 0.8 }, now);
  eq('  a listing one step over the best bid, as Orders advises, isn\'t a snipe', [mem([55190, 55190, 55210, 55230, 55260, 55310, 55310, 55310, 55310, 55310, 55270, 150000, 100100, 100100]), mem(Array(14).fill(100100))], [null, null]);
  eq('  a flood (50 days of trading at the cheap price) is doubted', Sn.findListing(34, [O(1, 500_000, 1000), O(2, 980_000, 10)], false, st, now).doubts, ['flood']);
  eq('  so is one priced three days ago and still there', Sn.findListing(34, [O(1, 500_000, 10, 3 * 1440), O(2, 980_000, 10)], false, st, now).doubts, ['stale']);
  eq('  and one on an item whose price just moved', Sn.findListing(34, book, false, { ...st, lastMove: 0.8 }, now).doubts, ['moved']);
  eq('  a book cut short with every kept order cheap is a flood, not a hit', Sn.findListing(34, [O(1, 500_000, 1), O(2, 500_000, 1)], true, st, now), null);
  eq('  never relisted above where trading reaches, however dear the next listing', Sn.findListing(34, [O(1, 500_000, 10), O(2, 5_000_000, 1)], false, st, now).resale, 1_000_000);
  const [row] = Sn.judgeListings([hit], { f: 0.01268, t: 0.03375 }, 5, Sn.SNIPE_DEFAULTS);
  eq('  at your rates: profit, return, and days to resell at your share', [Math.round(row.profit), +(row.pct * 100).toFixed(1), row.sellDays], [4_344_032, 86.9, 10]);
  eq('  under your 5 M it is not worth a mail; at a 1 M bar it is', [row.worth, Sn.judgeListings([hit], { f: 0.01268, t: 0.03375 }, 5, { minIsk: 1e6, minPct: 10 })[0].worth], [false, true]);
  // A bid 10% over where the item trades, for something you hold.
  const bid = Sn.findBid(34, { id: 9, price: 1_100_000, units: 50, minVolume: 1, issued: ago(10) }, st);
  eq('  a bid well over where it trades is kept', [bid.price, bid.fair], [1_100_000, 1_000_000]);
  eq('  an ordinary bid is not', Sn.findBid(34, { id: 9, price: 900_000, units: 50, minVolume: 1, issued: ago(10) }, st), null);
  const held = Sn.judgeBids([bid], { f: 0.01268, t: 0.03375 }, { 34: 5 }, { minIsk: 1e5, minPct: 10 });
  eq('  selling your 5 into it beats listing by', [held[0].qty, Math.round(held[0].gain), held[0].worth], [5, 546_525, true]);
  eq('  a bid that wants more than you hold is left out', Sn.judgeBids([{ ...bid, minVolume: 10 }], { f: 0.01268, t: 0.03375 }, { 34: 5 }, Sn.SNIPE_DEFAULTS).length, 0);
  // What the mail says: the advice first, the item's name linking to its market.
  const { alertMail: mailOf } = await import('../src/lib/alerts.ts');
  const f = { kind: 'snipe', key: 'snipe:1@15000000', title: 'Mistake listing', typeId: 40554, name: 'Locust II', isk: 106.25e6, text: 'x',
    snipe: { side: 'buy', units: 24, cheapest: 15e6, top: 15e6, cost: 360e6, resale: 20.38e6, fair: 20.38e6, nextAsk: null, profit: 106.25e6, pct: 0.295, pricedAt: ago(120), orders: 1, sellDays: 22 } };
  const m = mailOf([f], { appUrl: 'https://x/', keepMin: 30, now });
  eq('  the subject leads with the snipe and what it makes', m.subject, 'Jita Ledger: snipe Locust II, 106.25 M ISK');
  eq('  the body says what to do, and links the name to its market and the page', [m.body.includes('RECOMMENDED: buy the 24 at 15,000,000 ISK, relist at 20,380,000 ISK'), m.body.includes('href="https://x/open.html?market=40554~'), m.body.includes('#sniper')], [true, true, true]);
  // The user asked for the profit right after the words, readable at a glance (28 September 2026).
  eq('  the heading says what it makes', m.body.includes('MISTAKE LISTING - POTENTIAL PROFIT 106.25 M ISK'), true);
  const hb = mailOf([{ kind: 'snipe', key: 'snipebid:9@1200000', title: 'High bid for what you hold', typeId: 34, name: 'Tritanium', isk: 546525, text: 'x',
    snipe: { side: 'sell', qty: 5, price: 1.2e6, proceeds: 5.8e6, gain: 546525, held: 5, fair: 1e6, minVolume: 1 } }], { appUrl: 'https://x/', keepMin: 30, now });
  eq('  so does a high bid\'s', hb.body.includes('HIGH BID FOR WHAT YOU HOLD - 546,525 ISK MORE THAN LISTING'), true);

  // Blueprints, by ESI's category, never by name. From the cloud's read of 1 October 2026 (23:27 UTC): a Small Focused
  // Anode Particle Stream I (category 7, a module), an Epithal Blueprint (9), and a Synth Blue Pill Booster Reaction
  // Formula, which is category 9 with no "Blueprint" in its name. A Thrasher Blueprint from a Worker a version behind
  // (no category on the listing) is looked up by the browser; a Medium AutoCannon Battery whose cloud lookup failed (null)
  // is too, and is a module (23); a Tracking Speed Script not looked up yet is unknown.
  const Li = (typeId, category) => ({ ...hit, typeId, orderIds: [typeId], ...(category === undefined ? {} : { category }) });
  const anode = Li(6721, 7), epithal = Li(990, 9), formula = Li(46233, 9), thrasher = Li(16243), battery = Li(17771, null), script = Li(29001);
  const looked = { 16243: 9, 17771: 23 };
  const all6 = [anode, epithal, formula, thrasher, battery, script];
  const off = Sn.splitBlueprints(all6, false, (t) => looked[t]);
  const ids = (l) => l.map((x) => x.typeId);
  eq('  blueprints are category 9: out unless asked, the reaction formula with them', [ids(off.shown), ids(off.blueprints)], [[6721, 17771], [990, 46233, 16243]]);
  eq('    one whose category isn’t known yet is held back with them, on the safe side', ids(off.unknown), [29001]);
  const on = Sn.splitBlueprints(all6, true, (t) => looked[t]);
  eq('    switched on, every listing shows, and the count of blueprints is the same', [ids(on.shown), on.blueprints.length], [[6721, 990, 46233, 16243, 17771, 29001], 3]);
  eq('    with no lookup to fall back on (the cloud\'s mail), the cloud\'s own category decides', ids(Sn.splitBlueprints(all6, false).shown), [6721]);
  // High bids for what you hold follow the same switch (the user, 2 October 2026: "yes i approve all 3 choices"): a bid for
  // a blueprint you hold, a module's, a Thrasher Blueprint's with no category from the cloud (a Worker a version behind)
  // and a Tracking Speed Script's not looked up yet.
  const Bi = (typeId, category) => ({ ...bid, typeId, orderId: typeId, ...(category === undefined ? {} : { category }) });
  const heldBids = Sn.judgeBids([Bi(990, 9), Bi(6721, 7), Bi(16243), Bi(29001)], { f: 0.01268, t: 0.03375 }, { 990: 5, 6721: 5, 16243: 5, 29001: 5 }, { minIsk: 1e5, minPct: 10 });
  eq('  a held bid row keeps the category the cloud gave its bid', heldBids.filter((x) => x.typeId === 990).map((x) => x.category), [9]);
  const bOff = Sn.splitBlueprints(heldBids, false, (t) => looked[t]);
  eq('  high bids for blueprints you hold are out unless asked, as listings are', [ids(bOff.shown), ids(bOff.blueprints).sort((a, b) => a - b)], [[6721], [990, 16243]]);
  eq('    a bid whose item isn\'t known yet is held back until it\'s looked up', ids(bOff.unknown), [29001]);
  eq('    switched on, every held bid shows', ids(Sn.splitBlueprints(heldBids, true, (t) => looked[t]).shown).sort((a, b) => a - b), [990, 6721, 16243, 29001]);
  eq('  the page counts listings and bids apart when there are both, and one kind as before',
    [Sn.blueprintsSaid(2, 1), Sn.blueprintsSaid(2, 0), Sn.blueprintsSaid(1, 0), Sn.blueprintsSaid(0, 1), Sn.blueprintsSaid(0, 3), Sn.blueprintsSaid(1, 1)],
    [{ said: '2 blueprint listings and 1 high bid for a blueprint you hold', many: true }, { said: '2 blueprints', many: true }, { said: '1 blueprint', many: false },
      { said: '1 high bid for a blueprint you hold', many: false }, { said: '3 high bids for blueprints you hold', many: true }, { said: '1 blueprint listing and 1 high bid for a blueprint you hold', many: true }]);

  // Copy for Multibuy (authorized by the user, 2 October 2026): "Name N", the cheap units only, with what it should come
  // to at the listings read, and that Multibuy has no price limit. The Anode Particle Stream as read: 133 at 58,730.
  const nm = { 6721: 'Small Focused Anode Particle Stream I', 990: 'Epithal Blueprint' };
  const nameOf = (t) => nm[t] ?? `Item #${t}`;
  const anodeRead = { typeId: 6721, units: 133, cost: 7_811_090, top: 58_730, nextAsk: 98_860 };
  // The read the finds came from, copied three minutes later: the Sniper reads every five, so a copy can be that old.
  const READ = '2026-10-01T23:27:00Z', copied = Date.parse(READ) + 3 * 60_000;
  const one = Sn.snipeMultibuy([anodeRead], nameOf, READ, copied);
  eq('  a find copies as "Name N", N the cheap units', [one.ok, one.block, one.lines], [true, 'Small Focused Anode Particle Stream I 133', 1]);
  eq('    and says what it should come to at the listings read, exactly, with the next listing up', [one.total, one.said.includes('7,811,090 ISK'), one.said.includes('58,730 ISK each'), one.said.includes('from 98,860 ISK each')], [7_811_090, true, true, true]);
  eq('    and that Multibuy has no price limit, so a dearer total means a listing has gone', [/no price limit/.test(one.said), one.said.includes('a total over 7,811,090 ISK')], [true, true]);
  const both = Sn.snipeMultibuy([anodeRead, { typeId: 990, units: 8, cost: 51_200_000, top: 6_400_000, nextAsk: 8_474_000 }], nameOf, READ, copied);
  eq('  all shown: a line each, and their total', [both.block, both.lines, both.total, both.said.includes('59,011,090 ISK')], ['Small Focused Anode Particle Stream I 133\nEpithal Blueprint 8', 2, 59_011_090, true]);
  // "At the listings just read" was said of a read up to five minutes old (the Task 1 review): its age is said instead.
  eq('  each says how old the read is, never "just read"', [one.said.startsWith('At the listings read 3 min ago it should come to 7,811,090 ISK'), both.said.startsWith('At the listings read 3 min ago the 2 should come to'), /just read/.test(one.said + both.said)], [true, true, false]);
  eq('    a read under a minute old is "just now"', Sn.snipeMultibuy([anodeRead], nameOf, READ, Date.parse(READ) + 20_000).said.startsWith('At the listings read just now'), true);
  eq('    and the tips say the same', Sn.listingsRead(READ, copied), 'the listings read 3 min ago');
  eq('  a name not read yet refuses the copy, whole', [Sn.snipeMultibuy([anodeRead, { ...anodeRead, typeId: 123 }], nameOf, READ, copied).ok, /names haven’t loaded/.test(Sn.snipeMultibuy([{ ...anodeRead, typeId: 123 }], nameOf, READ, copied).why)], [false, true]);
}

console.log('\n--- snipes you have taken ---');
{
  const Sd = await import('../src/lib/sniped.ts');
  const J = 60003760;
  const T = (id, date, qty, unitPrice, extra = {}) => ({ id, source: 'esi', typeId: 40554, date, isBuy: true, qty, unitPrice, locationId: J, ...extra });
  const txs = [
    T('a', '2026-09-28T01:20:00Z', 20, 15_000_000),                         // the Locust, bought from a listing
    T('b', '2026-09-28T01:21:30Z', 4, 15_100_000),                          // a second cheap order, a minute later
    T('c', '2026-09-26T10:00:00Z', 5, 19_000_000),                          // an ordinary buy two days before
    T('d', '2026-09-25T10:00:00Z', 3, 14_000_000),                          // one of your bids filling
    T('e', '2026-09-24T10:00:00Z', 1, 10_000_000, { isBuy: false }),        // a sale
    T('f', '2026-09-23T10:00:00Z', 1, 9_000_000),                           // tagged Personal
  ];
  // Buying from a listing takes the ISK as escrow in the same second; a bid of yours filling doesn't.
  const E = (id, date, amount) => ({ id, date, refType: 'market_escrow', amount });
  const journal = [E('j1', '2026-09-28T01:20:00Z', -300_000_000), E('j2', '2026-09-28T01:21:30Z', -60_400_000), E('j3', '2026-09-26T10:00:00Z', -95_000_000),
    E('j4', '2026-09-24T09:00:00Z', -42_000_000), E('j5', '2026-09-23T10:00:00Z', -9_000_000)];
  const bought = Sd.instantBuys(txs, journal, new Set(['f']));
  eq('  buys from listings only: not your bid filling, not a sale, not Personal', bought.map((t) => t.id).sort(), ['a', 'b', 'c']);
  eq('  a same-second escrow for a different amount is a buy order placed, not a purchase', Sd.instantBuys([txs[0]], [E('x', '2026-09-28T01:20:00Z', -450_000_000)], new Set()).length, 0);
  eq('  one you said wasn’t a snipe goes no further', Sd.instantBuys(txs, journal, new Set(['f']), new Set(['b'])).map((t) => t.id).sort(), ['a', 'c']);
  const { sanitizeNotSnipes } = await import('../src/lib/prefs.ts');
  eq('  the list keeps trade IDs only, once each', sanitizeNotSnipes(['a', 'a', 3, '', null, 'b']), ['a', 'b']);
  // A fitting's Buy All: 10 items across 23:08:04-05 (the user's, 28 September 2026). None of it is a snipe; two cheap
  // listings of one item a second apart still are.
  const fit = [0, 300, 600, 900, 1200].map((ms, i) => T('fit' + i, new Date(Date.parse('2026-09-28T23:08:04Z') + ms).toISOString(), 1, 25_760, { typeId: 6001 + i }));
  const same = [T('s1', '2026-09-28T02:00:00Z', 5, 1000), T('s2', '2026-09-28T02:00:01Z', 5, 1001), T('s3', '2026-09-28T02:00:02Z', 5, 1002)];
  const skip = Sd.notSnipeIds([...fit, ...same, txs[0]], ['c']);
  eq('  bought in one go with other items: not a snipe', fit.every((t) => skip.has(t.id)), true);
  eq('  but several listings of one item in a row still can be, and a lone buy is judged as ever', [same.some((t) => skip.has(t.id)), skip.has('a'), skip.has('c')], [false, false, true]);
  // The Sniper's "Copy for Multibuy" of everything shown (2 October 2026) buys several finds in one go: 3+ purchases of
  // 2+ items, the multibuy rule's shape. A purchase the Sniper had shown (its item, at a sighted price, while up) is a
  // snipe however it was bought; the rest of such a burst, and a fitting's Buy All, still aren't.
  const at = Date.parse('2026-10-02T09:00:00Z'), iso = (ms) => new Date(at + ms).toISOString();
  const sniperBuy = [T('m1', iso(0), 100, 58_730, { typeId: 6721 }), T('m2', iso(400), 33, 58_730, { typeId: 6721 }), T('m3', iso(800), 8, 6_400_000, { typeId: 990 }), T('m4', iso(1200), 2, 4_000, { typeId: 34 })];
  const shown = [{ typeId: 6721, lo: 58_730, hi: 58_730, firstSeen: at - 30 * 60_000, lastSeen: at - 5 * 60_000 }, { typeId: 990, lo: 6_400_000, hi: 6_400_000, firstSeen: at - 3600_000, lastSeen: at - 60_000 }];
  const skipSeen = Sd.notSnipeIds([...fit, ...sniperBuy], ['c'], shown);
  eq('  Sniper finds bought in one Multibuy stay snipes; what the Sniper didn\'t show in that burst doesn\'t', ['m1', 'm2', 'm3', 'm4'].map((id) => skipSeen.has(id)), [false, false, false, true]);
  eq('    a fitting\'s Buy All is still no snipe, and without sightings nothing changes', [fit.every((t) => skipSeen.has(t.id)), sniperBuy.every((t) => Sd.notSnipeIds(sniperBuy, []).has(t.id))], [true, true]);
  eq('    a sighting at another price, or long before, doesn\'t vouch for it', [Sd.notSnipeIds(sniperBuy, [], [{ ...shown[0], lo: 50_000, hi: 50_000 }]).has('m1'), Sd.notSnipeIds(sniperBuy, [], [{ ...shown[0], lastSeen: at - 3 * 3600_000 }]).has('m1')], [true, true]);
  // Which items Your snipes asks the cloud's sightings about (the final fix wave's ruling, 2 October 2026): only those
  // bought from a listing recently enough for a kept sighting to match. The cloud drops a sighting SEEN_DAYS after its
  // listing was last seen, and a player's listing lasts PLAYER_ORDER_DAYS at most, so an older buy can't match one; the
  // route takes 500 types, and every buy from a listing ever made would push the newest finds' marks out.
  const Sn2 = await import('../src/lib/snipe.ts');
  eq('  the window: a listing\'s longest life plus how long a sighting is kept, and the slack sighted() allows',
    [Sn2.PLAYER_ORDER_DAYS, Sn2.SEEN_DAYS, Sd.SIGHTING_WINDOW_MS], [90, 30, (90 + 30) * DAY + Sd.SEEN_SLACK_MIN * 60_000]);
  const asked = Sd.sightingTypes([
    T('o1', new Date(at - 121 * DAY).toISOString(), 1, 100, { typeId: 501 }),  // older than the window: no sighting can match
    T('o2', new Date(at - 119 * DAY).toISOString(), 1, 100, { typeId: 502 }),  // inside it
    T('o3', new Date(at - 2 * DAY).toISOString(), 1, 100, { typeId: 503 }),
    T('o4', new Date(at - 5 * DAY).toISOString(), 1, 100, { typeId: 502 }),   // the same item again: asked once
    T('o5', new Date(at - 3600_000).toISOString(), 1, 100, { typeId: 504 }),
  ], at);
  eq('  Your snipes asks about items bought from a listing inside the window, newest first, each once; an older buy is left out', asked, [504, 503, 502]);
  // "If an item is fit to a ship either quickly or later then it wasn't a snipe" (the user, 29 September 2026).
  const snipes = [{ typeId: 6001, units: 1 }, { typeId: 25861, units: 1 }, { typeId: 23013, units: 19_489 }, { typeId: 5321, units: 3 }];
  eq('  a snipe whose item is fitted to one of your ships is left out; a few charges loaded from a big ammo snipe don’t count',
    Sd.notFitted(snipes, { 6001: 1, 25861: 2, 23013: 200, 5321: 1 }).map((x) => x.typeId), [23013, 5321]);
  eq('  and nothing changes before assets say what’s fitted', Sd.notFitted(snipes, undefined).length, 4);
  const groups = Sd.groupBuys(bought);
  eq('  buys a minute apart are one snipe', groups.map((g) => [g.txIds, g.units, Math.round(g.avg)]), [[['c'], 5, 19_000_000], [['a', 'b'], 24, 15_016_667]]);
  // Trading got up to about 20.4 M on half of the 14 days before.
  const hist = Array.from({ length: 40 }, (_, i) => ({ date: new Date(Date.parse('2026-08-20T00:00:00Z') + i * 86400_000).toISOString().slice(0, 10), average: 20e6, lowest: 19e6, highest: 20.4e6 + (i % 3) * 1e5, volume: 18, order_count: 30 }));
  const rate = () => ({ f: 0.01268, t: 0.03375 });
  const seen = [{ typeId: 40554, lo: 15_000_000, hi: 15_100_000, firstSeen: Date.parse('2026-09-27T23:10:00Z'), lastSeen: Date.parse('2026-09-28T01:15:00Z') }];
  const taken = Sd.judgeTaken(groups, () => hist, rate, seen);
  eq('  the cheap one is a snipe, the ordinary buy is not', taken.map((x) => x.txIds), [['a', 'b']]);
  eq('  how far under, what it looked like, and that the Sniper had shown it', [+(taken[0].under * 100).toFixed(1), Math.round(taken[0].expected / 1e5) / 10, taken[0].byTool], [26.7, 108.8, true]);
  eq('  bought outside the sighting window, it was found by hand', Sd.judgeTaken(groups, () => hist, rate, [{ ...seen[0], lastSeen: Date.parse('2026-09-27T23:30:00Z') }])[0].byTool, false);
  // The C-IR Compact Guidance Disruptor: 3 sniped at 3,609, then 10 sold at 7,787, 7 of them loot you already had.
  const R = { f: 0.01268, t: 0.03375 };
  const cir = Sd.followSnipe({ units: 3, cost: 3 * 3609, at: '2026-09-27T19:24:00Z' },
    [{ id: 's1', date: '2026-09-27T20:00:00Z', qty: 10, unitPrice: 7787 }], [{ units: 10, fees: 987 }], () => undefined, R, 7800);
  eq('  only the sniped units count as sold; the rest were yours already', [cir.soldUnits, cir.extraSold, cir.left], [3, 7, 0]);
  eq('    and only they make its profit, with 3/10 of the listing fee', Math.round(cir.madeSoFar), Math.round(3 * 7787 * (1 - R.t) - 3 * 3609 - 987 * 0.3));
  eq('  a sale before the snipe is not its own', Sd.followSnipe({ units: 3, cost: 10827, at: '2026-09-27T19:24:00Z' }, [{ id: 's0', date: '2026-09-27T18:00:00Z', qty: 5, unitPrice: 7787 }], [], () => undefined, R, 7800).soldUnits, 0);
  // The fat finger: 19,489 bought at 749.50 and listed at 1,893,000, a 468 M fee, nothing sold yet.
  const ff = Sd.followSnipe({ units: 19489, cost: 19489 * 749.5, at: '2026-09-28T01:20:00Z' }, [], [{ units: 19489, fees: 467.8e6 }], () => undefined, R, 1893);
  eq('  a listing fee already paid waits on the unsold units, and counts in the end', [Math.round(ff.feesOnUnsold / 1e5) / 10, Math.round(ff.inTheEnd / 1e5) / 10], [467.8, -446.8]);
  eq('  the real tax is used when it was matched to the sale', Math.round(Sd.followSnipe({ units: 2, cost: 100, at: '2026-09-27T10:00:00Z' }, [{ id: 'x', date: '2026-09-27T11:00:00Z', qty: 4, unitPrice: 100 }], [], (id) => (id === 'x' ? 20 : undefined), R, 100).madeSoFar), 200 - 10 - 100);
}

console.log('\n--- when the next full-market scan runs ---');
{
  const { nextScanAt, dayBoundary } = await import('../worker/src/scanTimes.ts');
  const at = (iso) => Date.parse(iso);
  const iso = (n) => new Date(n).toISOString().slice(0, 16);
  eq('  done for today: tomorrow at 11:25', iso(nextScanAt(at('2026-09-27T20:25:00Z'), false, false)), '2026-09-28T11:25');
  eq('  before 11:25 and not yet due: today at 11:25', iso(nextScanAt(at('2026-09-27T09:00:00Z'), false, false)), '2026-09-27T11:25');
  eq('  missed or stopped short: the next hourly check', iso(nextScanAt(at('2026-09-27T20:25:00Z'), true, false)), '2026-09-27T21:07');
  eq('  due at 20:03: this hour\'s check is still ahead', iso(nextScanAt(at('2026-09-27T20:03:00Z'), true, false)), '2026-09-27T20:07');
  eq('  due at 11:10: the daily run comes before the next hourly one', iso(nextScanAt(at('2026-09-27T11:10:00Z'), true, false)), '2026-09-27T11:25');
  eq('  while one runs: the next daily one', iso(nextScanAt(at('2026-09-27T11:30:00Z'), true, true)), '2026-09-28T11:25');
  eq('  the day turns at 11:10, after ESI\'s 11:05 history', [iso(dayBoundary(at('2026-09-27T11:09:00Z'))), iso(dayBoundary(at('2026-09-27T11:11:00Z')))], ['2026-09-26T11:10', '2026-09-27T11:10']);
}

console.log('\n--- what standings are worth in broker fees ---');
{
  const { brokerRateAt, brokerFeesPaid, standingsWorth, measuredRates } = await import('../src/lib/standings.ts');
  const r4 = (x) => +(x * 100).toFixed(4);
  eq('  the user: Broker Relations V, Caldari State 2.188, Caldari Navy 7.040', r4(brokerRateAt(5, 2.188057744, 7.039647095)), 1.2936);
  eq('  no standings at V is 1.5%, both at 10 exactly 1%', [r4(brokerRateAt(5, 0, 0)), r4(brokerRateAt(5, 10, 10))], [1.5, 1]);
  eq('  Broker Relations IV with both at 10 is 1.3%', r4(brokerRateAt(4, 10, 10)), 1.3);
  const now = Date.parse('2026-09-27T23:00:00Z');
  const J = {
    a: { id: 'a', date: '2026-09-24T17:04:14Z', refType: 'brokers_fee', amount: -60_000_000 },
    b: { id: 'b', date: '2026-09-27T20:00:00Z', refType: 'brokers_fee', amount: -20_191_029 },
    c: { id: 'c', date: '2026-08-01T00:00:00Z', refType: 'brokers_fee', amount: -5_000_000 },
    d: { id: 'd', date: '2026-09-27T20:00:00Z', refType: 'transaction_tax', amount: -9_000_000 },
  };
  const flat = () => 0.012936;
  const p = brokerFeesPaid(J, now, flat);
  eq('  every broker fee the ledger holds, from the first one', [p.paid, p.count, p.from], [85_191_029, 3, '2026-08-01T00:00:00Z']);
  eq('  an empty journal', brokerFeesPaid({}, now, flat), { paid: 0, base: 0, count: 0, exact: 0, from: null, days: 0 });
  // The day's rate is measured from its placements: the median, so one wrong match (7%) and a 100 ISK minimum don't move it.
  const P = (id, date, fee, value) => [id, { placement: { journalId: id, value } }];
  const JP = {
    p1: { id: 'p1', date: '2026-09-24T17:10:00Z', refType: 'brokers_fee', amount: -1330 },
    p2: { id: 'p2', date: '2026-09-24T17:20:00Z', refType: 'brokers_fee', amount: -2660 },
    p3: { id: 'p3', date: '2026-09-24T17:30:00Z', refType: 'brokers_fee', amount: -7000 },
    p4: { id: 'p4', date: '2026-09-24T17:40:00Z', refType: 'brokers_fee', amount: -1330 },
    p5: { id: 'p5', date: '2026-09-24T17:50:00Z', refType: 'brokers_fee', amount: -100 },
    big: { id: 'big', date: '2026-09-24T18:00:00Z', refType: 'brokers_fee', amount: -13_300_000 },
  };
  const byOrder = new Map([P('p1', 0, 0, 100_000), P('p2', 0, 0, 200_000), P('p3', 0, 0, 100_000), P('p4', 0, 0, 100_000), P('p5', 0, 0, 10)]);
  const mr = measuredRates(byOrder, JP);
  eq('  a day\'s rate is the median of its placements', +(mr.get('2026-09-24') * 100).toFixed(4), 1.33);
  const pm = brokerFeesPaid({ big: JP.big }, now, () => 0.0223, mr);
  eq('  an unmatched fee that day is read at it, not at the record\'s setup 2.23%', [Math.round(pm.base), pm.exact], [1e9, 1]);
  eq('  fewer than 3 placements measure nothing', measuredRates(new Map([P('p1', 0, 0, 100_000)]), JP).size, 0);
  // One fee paid back when the rate was 1.5%: the trading behind it is 60 M / 1.5%, not 60 M / today's rate.
  const hist = (iso) => (iso < '2026-09-01' ? 0.015 : 0.012936);
  const q = brokerFeesPaid({ a: J.a, c: J.c }, now, hist);
  eq('  each fee over the rate you had when you paid it', Math.round(q.base), Math.round(60_000_000 / 0.012936 + 5_000_000 / 0.015));
  const w = standingsWorth(80_191_029 / 0.0129360, 5, 2.188057744, 7.039647095);
  const by = Object.fromEntries(w.cases.map((c) => [c.key, Math.round(c.fees / 1e5) / 10]));
  eq('  the same trading at other standings (M ISK)', by, { none: 93, you: 80.2, f5: 75, f10: 65.7, both: 62 });
  eq('  each case against your standings now', w.cases.find((c) => c.key === 'you').diff, 0);
  eq('  the curve runs 0 to 10 and meets you', [w.curve(7.039647095).length, w.curve(7.039647095)[0].x, w.curve(7.039647095)[20].x], [21, 0, 10]);
  eq('  already at 10 on both: no cases above you', standingsWorth(1e6, 5, 10, 10).cases.map((c) => c.key), ['none', 'you']);
}

console.log('\n--- several characters: clone state, and whose login came back ---');
{
  const { ALPHA_SKILL_CAPS } = await import('../src/lib/alphaCaps.ts');
  const { ALPHA_CAPS } = await import('../src/lib/constants.ts');
  const { cloneState, usableSkills, sortLogin } = await import('../src/lib/roster.ts');
  const MINING = 3386, BARGE = 17940, BROKER = 3446, TRADE = 3443, ACCOUNTING = 16622;
  eq('  175 skills an Alpha can use', Object.keys(ALPHA_SKILL_CAPS).length, 175);
  eq('  Mining to IV, and Mining Barge not at all', [ALPHA_SKILL_CAPS[MINING], ALPHA_SKILL_CAPS[BARGE] ?? 0], [4, 0]);
  // The trade caps the app has used since before this list (constants.ts) agree with CCP's.
  eq('  the trade skills\' caps agree with the ones the fees already use', [ALPHA_SKILL_CAPS[BROKER], ALPHA_SKILL_CAPS[TRADE], ALPHA_SKILL_CAPS[ACCOUNTING] ?? 0], [ALPHA_CAPS.br, ALPHA_CAPS.trade, ALPHA_CAPS.acc]);

  const sk = (id, trained, active = trained) => ({ id, trained, active });
  eq('  a skill usable below its trained level: Alpha, for certain', cloneState([sk(MINING, 5, 4), sk(BARGE, 3, 0)], ALPHA_SKILL_CAPS), 'alpha');
  eq('  a skill usable above Alpha\'s cap: Omega', cloneState([sk(MINING, 5), sk(BROKER, 2)], ALPHA_SKILL_CAPS), 'omega');
  eq('  a skill Alpha can\'t use at all, usable: Omega', cloneState([sk(BARGE, 1)], ALPHA_SKILL_CAPS), 'omega');
  eq('  nothing past Alpha\'s limits: ESI can\'t tell', cloneState([sk(MINING, 4), sk(BROKER, 2), sk(BARGE, 0)], ALPHA_SKILL_CAPS), 'unknown');
  eq('  no skills read: can\'t tell', cloneState([], ALPHA_SKILL_CAPS), 'unknown');
  eq('  what it can use: the trained level, or the active one where they differ', usableSkills({ [MINING]: 5, [BARGE]: 3, [BROKER]: 2 }, { [MINING]: 4, [BARGE]: 0 }), { [MINING]: 4, [BARGE]: 0, [BROKER]: 2 });
  eq('    and the trained levels when nothing is capped', usableSkills({ [MINING]: 5 }), { [MINING]: 5 });

  // EVE's page picks the character, so the cloud sorts out who came back. Main 1, mail sender 7, an alt 2.
  eq('  adding an alt, and an alt came back', sortLogin('alt', 2, 1, 7, false), { as: 'alt' });
  eq('    an alt handed over again', sortLogin('alt', 2, 1, 7, true), { as: 'alt' });
  eq('    the main came back: kept as the main\'s login', sortLogin('alt', 1, 1, 7, false), { as: 'main' });
  eq('    the mail sender came back: kept as the sender\'s', sortLogin('alt', 7, 1, 7, false), { as: 'mailer' });
  eq('  a sender login that is an alt can\'t be kept', sortLogin('mailer', 2, 1, 7, true), { refuse: 'isAlt' });
  eq('    one that was removed from the roster can', sortLogin('mailer', 2, 1, 7, false), { as: 'mailer' });
  eq('    and the main can\'t mail itself, as before', sortLogin('mailer', 1, 1, null, false), { refuse: 'isMain' });
  eq('  the main\'s login has to be the main, as before', [sortLogin('main', 1, 1, null, false), sortLogin('main', 2, 1, null, false)], [{ as: 'main' }, { refuse: 'notMain' }]);

  // This browser's own sender, picked while adding a character, goes to the cloud as the sender, not as an alt.
  const { handOverAs, stoppedBy } = await import('../src/lib/roster.ts');
  eq('  adding a character, and this browser\'s mail sender came back: sent as the sender', handOverAs('alt', 7, 7), 'mailer');
  eq('    anyone else, or no sender here: sent as an alt', [handOverAs('alt', 2, 7), handOverAs('alt', 2, null), handOverAs('alt', 2, undefined)], ['alt', 'alt', 'alt']);
  eq('    the sender that is already one of your characters: added back as an alt, not refused as a sender', handOverAs('alt', 7, 7, true), 'alt');
  eq('    the main\'s and the sender\'s own hand-overs are sent as asked', [handOverAs('main', 7, 7), handOverAs('mailer', 7, 7)], ['main', 'mailer']);
  // EVE stops a character's earlier logins with a different set of permissions: which of this browser's it stopped.
  const heldLogin = { characterId: 1, scopes: ['a', 'b'] };
  eq('  a login here for the same character, with the same set in another order: not stopped', stoppedBy(heldLogin, { charId: 1, scopes: ['b', 'a'] }), false);
  eq('    with a set that grew, or shrank: stopped', [stoppedBy(heldLogin, { charId: 1, scopes: ['a', 'b', 'c'] }), stoppedBy(heldLogin, { charId: 1, scopes: ['a'] })], [true, true]);
  eq('    the same count, different permissions: stopped', stoppedBy(heldLogin, { charId: 1, scopes: ['a', 'c'] }), true);
  eq('    another character, or no login here: nothing stopped', [stoppedBy(heldLogin, { charId: 2, scopes: ['a'] }), stoppedBy(null, { charId: 1, scopes: [] })], [false, false]);

  const { isBaseline, SESSION_GAP_MS } = await import('../src/lib/mining.ts');
  const T = Date.parse('2026-10-01T15:00:00Z');
  eq('  a mining snapshot ten minutes old is compared with', isBaseline(T - 10 * 60_000, T), false);
  eq('    one older than a session gap is only a baseline', isBaseline(T - SESSION_GAP_MS - 1, T), true);
  eq('    and so is there being none', isBaseline(null, T), true);
  const { watchdogFinding, loginLostFinding } = await import('../src/lib/watchdog.ts');
  const job = { job: 'mining', fails: 3, failingSince: T - 3600_000, lastError: 'ESI 502', warned: null };
  const mine = watchdogFinding(job, T), theirs = watchdogFinding(job, T, { charId: 900001, name: 'Miner Two' });
  eq('  the main\'s failing job is worded and keyed as before', [mine.key, /^Reading your mining ledger has failed 3 times/.test(mine.text)], [`watchdog:mining:${job.failingSince}`, true]);
  eq('  an alt\'s names the character, in its key and its words', [theirs.key, /^Reading Miner Two’s mining ledger has failed 3 times/.test(theirs.text), /Miner Two/.test(theirs.watch.meanwhile)], [`watchdog:900001:mining:${job.failingSince}`, true, true]);
  eq('    and says whose login it is when the error looks like one', [watchdogFinding({ ...job, lastError: 'ESI 401' }, T, { charId: 900001, name: 'Miner Two' }).watch.alt, mine.watch.alt ?? null], ['Miner Two', null]);
  eq('    a job with no wording of its own still names it', /for Miner Two/.test(watchdogFinding({ ...job, job: 'novel' }, T, { charId: 900001, name: 'Miner Two' }).text), true);
  const refused = { name: 'Miner Two', since: T - 20 * 60_000, reason: 'invalid_grant', warned: null };
  const lostAlt = loginLostFinding({ ...refused, purpose: 'alt', charId: 900001 }, T);
  eq('  an alt\'s refused login is mailed, by name', [lostAlt.key, lostAlt.title, /Hand Miner Two over again/.test(lostAlt.text), lostAlt.watch.lost], [`watchdog:login:alt:900001:${refused.since}`, 'Cloud lost Miner Two’s login', true, { purpose: 'alt', name: 'Miner Two' }]);
  eq('  the main\'s is keyed and titled as before', [loginLostFinding({ ...refused, purpose: 'main', name: 'Main' }, T).key, loginLostFinding({ ...refused, purpose: 'main', name: 'Main' }, T).title], [`watchdog:login:main:${refused.since}`, 'Cloud lost your login']);
  eq('  the sender\'s can\'t be mailed, as before', loginLostFinding({ ...refused, purpose: 'mailer' }, T), null);
  const { alertMail } = await import('../src/lib/alerts.ts');
  const mail = alertMail([lostAlt], { appUrl: 'https://app.test/', keepMin: null });
  eq('  the mail says where to hand an alt over', [/Miner Two/.test(mail.subject), /Characters/.test(mail.body), /Settings → Your data/.test(mail.body)], [true, true, false]);
  const jobMail = alertMail([watchdogFinding({ ...job, lastError: 'ESI 401' }, T, { charId: 900001, name: 'Miner Two' })], { appUrl: 'https://app.test/', keepMin: null });
  eq('    and an alt\'s job that needs its login says whose, not "your"', [/hand the cloud Miner Two’s login again: Jita Ledger → Characters/.test(jobMail.body), /your login again/.test(jobMail.body)], [true, false]);
}

console.log('\n--- which characters are yours ---');
{
  const { sanitizeChars } = await import('../src/lib/prefs.ts');
  const { isDocKey, applyPulled, everything, DOC_KEYS } = await import('../src/lib/cloudSync.ts');
  eq('  a character is an ID and a name', sanitizeChars({ 900001: { name: 'Miner Two' } }), { 900001: { name: 'Miner Two' } });
  eq('    with a clone state, when you set one by hand', sanitizeChars({ 900001: { name: 'Miner Two', clone: 'alpha' } }), { 900001: { name: 'Miner Two', clone: 'alpha' } });
  eq('    an unknown clone state is dropped, the character kept', sanitizeChars({ 900001: { name: 'Miner Two', clone: 'gamma' } }), { 900001: { name: 'Miner Two' } });
  eq('  what isn\'t one is left out', sanitizeChars({ abc: { name: 'x' }, 900002: { name: '' }, 900003: null, 900004: 'Miner', 900005: { name: 'Kept' } }), { 900005: { name: 'Kept' } });
  eq('  nothing, an array or a string is no characters', [sanitizeChars(null), sanitizeChars([1]), sanitizeChars('x')], [{}, {}, {}]);
  eq('  a long name is cut, not refused', sanitizeChars({ 1: { name: 'x'.repeat(100) } })[1].name.length, 64);
  eq('  a name is kept trimmed', sanitizeChars({ 1: { name: '  Miner Two \n' } })[1].name, 'Miner Two');

  // The roster's merge into chars (store.ts mergeChars writes what this returns, as a change from the cloud).
  const { mergeCharsDoc } = await import('../src/lib/prefs.ts');
  const held = { 900001: { name: 'Miner Two', clone: 'alpha' }, 900009: { name: 'Gone Off The Roster' } };
  eq('  the roster adds a character it lists', mergeCharsDoc(held, [{ charId: 900002, name: 'Miner Three' }]), { ...held, 900002: { name: 'Miner Three' } });
  eq('    renames one, keeping a clone state set by hand', mergeCharsDoc(held, [{ charId: 900001, name: 'Miner Two Renamed' }])[900001], { name: 'Miner Two Renamed', clone: 'alpha' });
  eq('    never removes one it no longer lists', Object.keys(mergeCharsDoc(held, [{ charId: 900002, name: 'Miner Three' }])).includes('900009'), true);
  eq('    a name it doesn\'t know keeps the one held', mergeCharsDoc(held, [{ charId: 900001, name: null }, { charId: 900002, name: 'Miner Three' }])[900001].name, 'Miner Two');
  eq('    or, for one not held, is "Character {id}"', mergeCharsDoc({}, [{ charId: 900003, name: null }]), { 900003: { name: 'Character 900003' } });
  eq('    nothing changed: null, so nothing is written', [mergeCharsDoc(held, [{ charId: 900001, name: 'Miner Two' }, { charId: 900009, name: null }]), mergeCharsDoc(held, [])], [null, null]);
  eq('    and what was held isn\'t changed in place', Object.keys(held), ['900001', '900009']);
  eq('  it is a synced document', [isDocKey('chars'), DOC_KEYS.includes('chars')], [true, true]);
  const base = { settings: {}, meta: {}, prefs: {}, chars: {} };
  eq('  one that comes down replaces the one here', applyPulled(base, { records: [], docs: [{ key: 'chars', d: { 900001: { name: 'Miner Two' } } }] }).chars, { 900001: { name: 'Miner Two' } });
  eq('  and goes up with a first upload', everything({ chars: { 900001: { name: 'Miner Two' } } }).docs.includes('chars'), true);

  const R = await import('../src/lib/roster.ts');
  const NOW2 = Date.parse('2026-10-01T15:00:00Z');
  const H = 3600_000;

  // An alt's pull, a page at a time.
  const page1 = { rev: 7, next: '5|txs|b', records: [{ k: 'txs', i: 'a', d: { q: 1 } }, { k: 'txs', i: 'b', d: { q: 2 } }], docs: [{ key: 'meta', d: { walletBalance: 5 } }] };
  const page2 = { rev: 7, next: null, records: [{ k: 'txs', i: 'a', d: null }, { k: 'mining', i: 'm', d: { qty: 3 } }], docs: [] };
  const half = R.applyAltPull(R.emptyAlt(), page1);
  eq('  a pull\'s first page is kept, and the revision waits for the last', [half.rev, Object.keys(half.records.txs), half.docs.meta], [0, ['a', 'b'], { walletBalance: 5 }]);
  const whole = R.applyAltPull(half, page2);
  eq('    the last page moves it, removes what was removed, and adds the rest', [whole.rev, Object.keys(whole.records.txs), Object.keys(whole.records.mining)], [7, ['b'], ['m']]);
  eq('    and what was stored before isn\'t changed in place', Object.keys(half.records.txs), ['a', 'b']);
  eq('    a pull keeps when the copy\'s alt was added', R.applyAltPull({ ...R.emptyAlt(), addedAt: 5 }, page2).addedAt, 5);

  // Which copy an alt's pull builds on. The Worker deletes an alt's rows outright on "Remove and delete" and keeps its
  // revision; a re-add after that is a new roster row with a new addedAt, one after "keep" the same row and addedAt.
  const heldCopy = { rev: 7, records: { txs: { b: { q: 2 } } }, docs: { meta: { walletBalance: 5 } }, addedAt: 100 };
  eq('  the same stay on the roster: the copy held, itself', R.altCopyFor(heldCopy, { rev: 9, addedAt: 100 }) === heldCopy, true);
  eq('  deleted and added again (a new addedAt): a fresh copy, from revision 0', R.altCopyFor(heldCopy, { rev: 9, addedAt: 200 }), { rev: 0, records: {}, docs: {}, addedAt: 200 });
  eq('    even when the revision happens to match', R.altCopyFor(heldCopy, { rev: 7, addedAt: 200 }).rev, 0);
  const legacy = { rev: 7, records: { txs: { b: { q: 2 } } }, docs: {} };
  const adopted = R.altCopyFor(legacy, { rev: 9, addedAt: 100 });
  eq('  a copy from before addedAt was kept: kept, and takes the roster\'s', [adopted.rev, Object.keys(adopted.records.txs), adopted.addedAt, adopted === legacy], [7, ['b'], 100, false]);
  eq('  a revision below the one held: a fresh copy', R.altCopyFor(heldCopy, { rev: 3, addedAt: 100 }), { rev: 0, records: {}, docs: {}, addedAt: 100 });
  eq('  nothing held: a fresh copy with the roster\'s addedAt', R.altCopyFor(undefined, { rev: 3, addedAt: 100 }), { rev: 0, records: {}, docs: {}, addedAt: 100 });

  // What a card shows.
  const meta = {
    walletBalance: 4_200_000, walletAt: '2026-10-01T14:00:00Z', totalSp: 1_200_000, cloneDetected: 'alpha', cloneSince: '2026-09-29T10:00:00Z',
    skillQueue: [
      { skillId: 3386, level: 3, finish: '2026-10-01T10:00:00Z' },
      { skillId: 3386, level: 4, finish: '2026-10-02T15:00:00Z' },
      { skillId: 3380, level: 4, finish: '2026-10-05T15:00:00Z' },
    ],
  };
  const points = [{ date: '2026-09-30', total: 11e6 }, { date: '2026-10-01', total: 12e6 }, { date: '2026-09-29', total: 9e6 }];
  const f = R.charFacts(meta, points, NOW2);
  eq('  a card\'s wallet, and when it was read', [f.wallet, f.walletAt], [4_200_000, '2026-10-01T14:00:00Z']);
  eq('  its net worth is the newest daily point, with its date', f.netWorth, { date: '2026-10-01', total: 12e6 });
  eq('  the skill in training is the first the queue hasn\'t finished', f.training, { skillId: 3386, level: 4, finish: '2026-10-02T15:00:00Z' });
  eq('  and the queue ends with its last', f.queueEnds, '2026-10-05T15:00:00Z');
  eq('  its clone state, and since when', [f.clone, f.cloneSince], ['alpha', '2026-09-29T10:00:00Z']);
  const none = R.charFacts(undefined, [], NOW2);
  eq('  a character nothing has been read for: nothing, not zeros', none, { wallet: null, walletAt: null, netWorth: null, clone: 'unknown', cloneSince: null, training: null, queueEnds: null, queueKnown: false, totalSp: null });
  eq('  a queue read and empty is known to be empty; one not read isn\'t', [R.charFacts({ skillQueue: [] }, [], NOW2).queueKnown, R.charFacts({ walletBalance: 5 }, [], NOW2).queueKnown], [true, false]);
  eq('    and a queue that has all finished was read', R.charFacts({ skillQueue: [{ skillId: 1, level: 1, finish: '2026-09-01T00:00:00Z' }] }, [], NOW2).queueKnown, true);
  eq('  a queue that has all finished is no training', R.charFacts({ skillQueue: [{ skillId: 1, level: 1, finish: '2026-09-01T00:00:00Z' }] }, [], NOW2).training, null);
  eq('  a paused queue (no finish time) still names its skill', R.charFacts({ skillQueue: [{ skillId: 9, level: 2, finish: null }] }, [], NOW2).training, { skillId: 9, level: 2, finish: null });
  eq('  an alt\'s facts come from its stored copy', R.altFacts({ rev: 3, records: { netWorth: { '2026-10-01': { date: '2026-10-01', total: 5 } } }, docs: { meta: { walletBalance: 7 } } }, NOW2).netWorth, { date: '2026-10-01', total: 5 });

  // The roster entry: when it was last read, and the state of its login.
  const entry = {
    charId: 900001, name: 'Miner Two', addedAt: NOW2 - 5 * 24 * H, scopes: ['a', 'b'], at: NOW2 - H, refusedAt: null, refused: null, rev: 3, ship: 32880, shipAt: NOW2 - 600_000,
    jobs: [
      { job: 'archive', lastRun: NOW2 - H, lastOk: NOW2 - H, lastError: null },
      { job: 'sheet', lastRun: NOW2 - H / 2, lastOk: NOW2 - H / 2, lastError: null },
      { job: 'mining', lastRun: NOW2 - 600_000, lastOk: NOW2 - 2 * H, lastError: 'ESI 502' },
    ],
  };
  eq('  last read: the newer of its copy and its sheet', R.lastRead(entry), NOW2 - H / 2);
  eq('    never, before either has run', R.lastRead({ ...entry, jobs: [] }), null);
  eq('  a job that failed since it last worked is failing', R.failingJobs(entry).map((j) => j.job), ['mining']);
  eq('  a login with every permission asked for', R.loginState(entry, ['a', 'b']), { state: 'working', missing: [] });
  eq('    one lacking some names them', R.loginState(entry, ['a', 'b', 'c']), { state: 'working', missing: ['c'] });
  eq('    one EVE refused', R.loginState({ ...entry, refusedAt: NOW2 - H, refused: 'invalid_grant' }, ['a']).state, 'refused');
  eq('    none kept', R.loginState({ ...entry, at: null, scopes: [] }, ['a']).state, 'none');

  // Alt data has no path into the main's ledger.
  const fs2 = await import('node:fs');
  const src = (p) => fs2.readFileSync(new URL(p, import.meta.url), 'utf8');
  // Every static import of './store' in the alt store, by its clause: named names are listed, a default or namespace
  // import (which would reach update: `import * as S`, then S.update) fails, and `import type` is allowed (it can't call
  // anything). A dynamic import('./store') fails too.
  const altSrc = src('../src/lib/altStore.ts');
  const STORE = String.raw`['"]\.\/store(?:\.[jt]s)?['"]`;
  const clauses = [...altSrc.matchAll(new RegExp(String.raw`\bimport\s*(type\b\s*)?([^'";]*?)\s*from\s*${STORE}`, 'g'))];
  const fromStores = clauses.filter((m) => !m[1]).flatMap((m) => {
    const named = /\{([^}]*)\}/.exec(m[2]);
    return named ? named[1].split(',').map((x) => x.trim()).filter((x) => x && !/^type\s/.test(x)) : [];
  }).sort();
  const wholeStore = [
    ...clauses.filter((m) => !m[1] && m[2].replace(/\{[^}]*\}/, '').replace(/,/g, '').trim()).map((m) => m[0]),
    ...[...altSrc.matchAll(new RegExp(String.raw`\bimport\s*\(\s*${STORE}\s*\)`, 'g'))].map((m) => m[0]),
  ];
  eq('  the alt store takes three things from the ledger\'s store, and update is not one', fromStores, ['dataGeneration', 'mergeChars', 'onClearAll']);
  eq('    and never the whole store (a default or namespace import, or a dynamic one)', wholeStore, []);
  // Alt data reaches a page only on purpose: a page that starts reading the alt store is added here in the commit that makes it.
  const walk = (dir) => fs2.readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}${e.name}/`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}${e.name}`] : []));
  const users = walk('../src/').filter((p) => /(from\s*|import\s*\(\s*)['"][^'"]*\/altStore['"]/.test(src(p))).map((p) => p.replace('../src/', '')).sort();
  eq('  and only the shell, the Characters page, the Mining and Research tabs, the Wallet and To do read the alt store', users, ['App.tsx', 'components/Characters.tsx', 'components/Todo.tsx', 'components/Wallet.tsx', 'components/hustles/Mining.tsx', 'components/hustles/Research.tsx']);
  eq('  an alt with nothing read yet: nothing, not zeros', R.altFacts(R.emptyAlt(), NOW2), { wallet: null, walletAt: null, netWorth: null, clone: 'unknown', cloneSince: null, training: null, queueEnds: null, queueKnown: false, totalSp: null });
  const readEmpty = R.altFacts({ rev: 1, records: {}, docs: { meta: { skillQueue: [] } } }, NOW2);
  eq('    an alt whose queue was read empty: known, and "Nothing in the queue"', [readEmpty.training, readEmpty.queueKnown, R.idleQueueSaid(readEmpty)], [null, true, 'Nothing in the queue']);
  eq('    one whose queue wasn\'t read says so, never that it\'s empty', R.idleQueueSaid(R.altFacts(R.emptyAlt(), NOW2)), 'Not read yet');
  eq('    and one training says neither', R.idleQueueSaid(f), null);
  // What an alt's card can claim was read, each part on its own evidence (altReadState).
  const MINING = 'esi-industry.read_character_mining.v1';
  const wantedScopes = ['esi-wallet.read_character_wallet.v1', MINING];
  const ent = (o = {}) => ({ charId: 900001, name: 'A', addedAt: 0, scopes: wantedScopes, at: NOW2, refusedAt: null, refused: null, rev: 1, ship: null, shipAt: null, jobs: [], ...o });
  const job = (name, lastOk) => ({ job: name, lastRun: NOW2, lastOk, lastError: lastOk ? null : 'ESI 502' });
  const sheetOnly = { rev: 1, records: {}, docs: { meta: { totalSp: 1e6 }, skills: { 3386: 3 } } };
  eq('  an alt whose skills were read but not its wallet or mining: neither is known', R.altReadState(sheetOnly, ent({ jobs: [job('sheet', NOW2), job('archive', null)] }), wantedScopes, MINING), { earned: false, mining: 'unread' });
  eq('    its wallet read worked with nothing in it: known, so "Nothing earned" is true', R.altReadState(sheetOnly, ent({ jobs: [job('archive', NOW2)] }), wantedScopes, MINING).earned, true);
  eq('    trades or journal kept: known', [R.altReadState({ ...sheetOnly, records: { txs: { 1: {} } } }, ent(), wantedScopes, MINING).earned, R.altReadState({ ...sheetOnly, records: { journal: { 1: {} } } }, ent(), wantedScopes, MINING).earned], [true, true]);
  eq('    mining kept, or its mining read worked: known', [R.altReadState({ ...sheetOnly, records: { mining: { a: {} } } }, ent(), wantedScopes, MINING).mining, R.altReadState(sheetOnly, ent({ jobs: [job('mining', NOW2)] }), wantedScopes, MINING).mining], ['read', 'read']);
  eq('    a working login without the mining permission: says so', R.altReadState(sheetOnly, ent({ scopes: ['esi-wallet.read_character_wallet.v1'] }), wantedScopes, MINING).mining, 'permission');
  eq('    a refused login: not read yet, whatever it lacked', R.altReadState(R.emptyAlt(), ent({ scopes: [], refusedAt: NOW2, refused: 'invalid_grant' }), wantedScopes, MINING), { earned: false, mining: 'unread' });
  eq('  when a job last worked', [R.jobOk(ent({ jobs: [job('archive', 123)] }), 'archive'), R.jobOk(ent({ jobs: [job('archive', null)] }), 'archive'), R.jobOk(ent(), 'mining')], [123, null, null]);
}

console.log('\n--- what a ledger earned (income.ts) ---');
{
  const { activityEvents, incomeRows } = await import('../src/lib/income.ts');
  const { everyItemCalcs } = await import('../src/lib/everyItem.ts');
  const { emptyData } = await import('../src/lib/emptyData.ts');
  const T0 = Date.parse('2026-09-20T00:00:00Z');
  const at = (h) => new Date(T0 + h * 3600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const tx = (id, typeId, h, isBuy, qty, unitPrice) => [id, { id, source: 'esi', typeId, date: at(h), isBuy, qty, unitPrice, locationId: 60003760 }];
  const d = {
    ...emptyData(),
    txs: Object.fromEntries([
      tx('a1', 100, 0, true, 10, 1000), tx('a2', 100, 24, false, 10, 1500),   // traded: bought 10,000, sold 15,000
      tx('l1', 200, 48, false, 5, 2000),                                      // loot: never bought, sold 10,000
      tx('f1', 300, 1, true, 1, 50000),                                       // a filament bought
      tx('y1', 400, 60, false, 1, 80000),                                     // abyssal loot sold
    ]),
    journal: Object.fromEntries([
      ['j1', { id: 'j1', date: at(24), refType: 'transaction_tax', amount: -500, contextId: 'a2' }],
      ['j2', { id: 'j2', date: at(48), refType: 'transaction_tax', amount: -300, contextId: 'l1' }],
      ['j3', { id: 'j3', date: at(60), refType: 'transaction_tax', amount: -2000, contextId: 'y1' }],
      ['j4', { id: 'j4', date: at(30), refType: 'bounty_prizes', amount: 7000 }],
      // A day's goal payout and an AIR reward, as the user's own (445,000 and 75,000 on 30 September 2026), and a
      // corporation's tax on the payout, which no NPC corporation takes: made up, to show it nets.
      ['j5', { id: 'j5', date: at(36), refType: 'daily_goal_payouts', amount: 445000 }],
      ['j6', { id: 'j6', date: at(36), refType: 'daily_goal_payouts_tax', amount: -44500 }],
      ['j7', { id: 'j7', date: at(40), refType: 'air_career_program_reward', amount: 75000 }],
    ]),
  };
  const sets = { filaments: new Set([300]), abyssLoot: new Set([400]), pi: new Set(), lpGoods: new Set() };
  const acts = activityEvents(d, sets, false, {}, []);
  const since = T0, now = T0 + 5 * 86400_000;
  const { rows, earned } = incomeRows(everyItemCalcs(d), acts, since, now);
  const by = Object.fromEntries(rows.map((r) => [r.key, r.isk]));
  // Trading is every item bought and sold again by its profit, counted once: the activity events hold no Trading here
  // (no positions), and the row isn't added to them. Its tax is the estimate at the ledger's own rate (7.5% at the empty
  // ledger's Accounting 0: 1,125 on the 15,000 sale), not the journal's 500: a position claims a tax by second and size
  // (feeMatch.ts, within half of what the rate expects), and 500 is 625 off. So 15,000 − 10,000 − 1,125, as the Wallet
  // counted it before income.ts. Abyssal and loot take their tax by transaction ID (results.ts), so the journal's
  // figures stand there.
  const { rates } = await import('../src/lib/fees.ts');
  const estimated = rates(d.settings).t * 15000;
  eq('    the estimate is 7.5% of the sale', estimated, 1125);
  eq('  trading, every item, by its profit', Math.round(by.trading), Math.round(15000 - 10000 - estimated));
  eq('  abyssal: loot sold after tax, less the filament', Math.round(by.Abyssal), 80000 - 2000 - 50000);
  eq('  combat: the bounty', by.Combat, 7000);
  eq('  rewards: the goal payout and the AIR reward, less the tax on the payout', by.Rewards, 445000 - 44500 + 75000);
  eq('  sold, never bought: the loot after its tax', Math.round(by.loot), 10000 - 300);
  eq('  all income is the rows added up', Math.round(earned), 3875 + 28000 + 7000 + 475500 + 9700);
  // The window's first millisecond counts, the one before it doesn't (the Wallet's inWindow and itemResult's since − 1).
  const late = incomeRows(everyItemCalcs(d), acts, T0 + 48 * 3600_000, now);
  eq('    from the loot sale\'s own millisecond: it counts', Math.round(Object.fromEntries(late.rows.map((r) => [r.key, r.isk])).loot), 9700);
  const later = incomeRows(everyItemCalcs(d), acts, T0 + 48 * 3600_000 + 1, now);
  eq('    one millisecond after it: it doesn\'t', Object.fromEntries(later.rows.map((r) => [r.key, r.isk])).loot, undefined);
  // Without the item groups, only what needs none counts, and nothing is "sold, never bought".
  const bare = activityEvents(d, null, true, {}, []);
  const b = Object.fromEntries(incomeRows(everyItemCalcs(d), bare, since, now).rows.map((r) => [r.key, r.isk]));
  eq('  without the item groups: no abyssal, no loot row', [b.Abyssal, b.loot], [undefined, undefined]);
  eq('    bounties still count', b.Combat, 7000);
  eq('    and rewards, which need none', b.Rewards, 475500);
  // A trade you tagged is no freelance job's on Results, as on the Wallet and the Freelance tab.
  const job = { id: 'j', name: 'x', state: 'Completed', standing: 'Unspecified', perUnit: 1, perPlayer: null, types: [100], created: at(-1), expires: null, delivered: 0, finished: at(30) };
  const withJob = { ...d, meta: { ...d.meta, freelance: { at: at(0), jobs: [job] } } };
  const fl = (x) => activityEvents(x, sets, false, {}, []).events.filter((e) => e.activity === 'Freelance').length;
  eq('  Results: a job’s item traded while it ran is Freelance, unless tagged', [fl(withJob), fl({ ...withJob, tags: { a1: 'trading' } })], [2, 1]);
  const { categoryOf } = await import('../src/lib/wallet.ts');
  const said = (refType, amount = 1) => categoryOf({ refType, amount })?.label;
  eq('  the Wallet: goals and AIR rewards are their own line, not Other income',
    ['daily_goal_payouts', 'air_career_program_reward', 'daily_challenge_reward', 'opportunity_reward'].map((r) => said(r)), Array(4).fill('Goals & AIR rewards'));
  eq('    bounties and missions stay where they were', ['bounty_prizes', 'agent_mission_reward'].map((r) => said(r)), ['Bounties & missions', 'Bounties & missions']);
  eq('    and the tax on a payout is a fee', said('daily_goal_payouts_tax', -1), 'Fees & tax');
}

console.log('\n--- an alt\'s copy as a ledger (altLedger.ts) ---');
{
  const { altLedger } = await import('../src/lib/altLedger.ts');
  const { applyAltPull, emptyAlt } = await import('../src/lib/roster.ts');
  const { SKILL_FALLBACK_IDS } = await import('../src/lib/constants.ts');
  const saved = {
    rev: 4, records: {
      txs: { 1: { id: '1', source: 'esi', typeId: 34, date: '2026-09-29T10:00:00Z', isBuy: false, qty: 100, unitPrice: 5, locationId: 60003760 } },
      netWorth: { '2026-09-28': { date: '2026-09-28', total: 2e8, wallet: 1e8 }, '2026-09-29': { date: '2026-09-29', total: 3e8, wallet: 1e8 } },
      mining: { 'a': { charId: 900001, date: '2026-09-29', systemId: 30000142, typeId: 1230, qty: 5000 } },
    },
    docs: { meta: { cloneDetected: 'alpha', walletBalance: 1e8 }, skills: { [SKILL_FALLBACK_IDS.acc]: 3, [SKILL_FALLBACK_IDS.br]: 2 } },
  };
  const d = altLedger(saved);
  eq('  its trades, journal and mining are its own', [Object.keys(d.txs), Object.keys(d.journal), Object.keys(d.mining)], [['1'], [], ['a']]);
  eq('  its net-worth points, oldest first', d.netWorth.map((p) => p.date), ['2026-09-28', '2026-09-29']);
  eq('  its trade skills set its fees', [d.settings.acc, d.settings.br, d.settings.trade], [3, 2, 0]);
  eq('  its clone state as read', d.settings.clone, 'alpha');
  eq('  standings 0, and nothing of a position, tag or Personal mark', [d.settings.faction, d.settings.corp, d.positions.length, Object.keys(d.tags).length, d.ignored.length], [0, 0, 0, 0, 0]);
  eq('  no killmails: the cloud doesn\'t read an alt\'s', Object.keys(d.killmails).length, 0);
  eq('    set by hand, when the skills can\'t tell', altLedger({ ...saved, docs: { ...saved.docs, meta: {} } }, 'alpha').settings.clone, 'alpha');
  eq('    not known either way: taken as Omega (the same when nothing is past the caps)', altLedger({ ...saved, docs: { ...saved.docs, meta: {} } }).settings.clone, 'omega');
  eq('  the same copy gives the same object (worked out once a revision)', altLedger(saved) === d, true);
  const next = applyAltPull(saved, { rev: 5, next: null, records: [], docs: [] });
  eq('    a new revision gives a new one', altLedger(next) === d, false);
  eq('  an alt with nothing read is an empty ledger with Omega fees', [Object.keys(altLedger(emptyAlt()).txs).length, altLedger(emptyAlt()).settings.clone], [0, 'omega']);
}

console.log('\n--- whose skills a tree reads: the pilot (pilot.ts) ---');
{
  // Every page reads the main as it always has (the store's own objects, so memos and effects keyed on them don't move);
  // Mining's Scaling up can be handed an alt, which reads what it can use, its own queue and its own clone state.
  const { pilotFrom } = await import('../src/lib/pilot.ts');
  const { altLedger } = await import('../src/lib/altLedger.ts');
  const { emptyAlt } = await import('../src/lib/roster.ts');
  const { emptyData } = await import('../src/lib/emptyData.ts');
  const MINING = 3386, BARGE = 17940, ASTRO = 3410;
  const queue = [{ skillId: ASTRO, level: 4, finish: '2026-10-02T10:00:00Z' }];
  const attributes = { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 };
  const main = { ...emptyData(), skills: { [MINING]: 5, [BARGE]: 3 }, meta: { skillQueue: queue, skillSp: { [MINING]: 256000 }, attributes } };
  main.settings = { ...main.settings, clone: 'omega' }; // a new ledger starts as Alpha (DEFAULT_SETTINGS)
  const me = { charId: 95210486, name: 'The Main', isMain: true };
  const p = pilotFrom(main, me, false);
  eq('  the main: the store\'s own skills, queue, skill points and attributes', [p.skills === main.skills, p.skillQueue === main.meta.skillQueue, p.skillSp === main.meta.skillSp, p.attributes === main.meta.attributes], [true, true, true, true]);
  eq('    who it is, as given', [p.charId, p.name, p.isMain], [95210486, 'The Main', true]);
  eq('    Alpha as the settings say', [p.alpha, pilotFrom({ ...main, settings: { ...main.settings, clone: 'alpha' } }, me, false).alpha], [false, true]);
  eq('    skills not read yet stay not read', pilotFrom(emptyData(), me, false).skills === undefined, true);
  const bare = { ...emptyData(), skills: {} };
  eq('    an empty map is passed on as it is: the main\'s path doesn\'t change', pilotFrom(bare, me, false).skills === bare.skills, true);

  // An Alpha alt trained to Mining V and Mining Barge III can use Mining IV and no Mining Barge (lib/alphaCaps.ts).
  const saved = {
    rev: 3, records: {},
    docs: {
      meta: { cloneDetected: 'alpha', activeSkills: { [MINING]: 4, [BARGE]: 0 }, skillQueue: queue, attributes },
      skills: { [MINING]: 5, [BARGE]: 3, [ASTRO]: 3 },
    },
  };
  const alt = altLedger(saved);
  const who = { charId: 900001, name: 'Miner Two', isMain: false };
  const a = pilotFrom(alt, who, true);
  eq('  an Alpha alt: the levels it can use, not the ones it trained', a.skills, { [MINING]: 4, [BARGE]: 0, [ASTRO]: 3 });
  eq('    its own queue and attributes, and Alpha from its settings', [a.skillQueue === alt.meta.skillQueue, a.attributes === alt.meta.attributes, a.alpha], [true, true, true]);
  eq('    who it is, as given', [a.charId, a.name, a.isMain], [900001, 'Miner Two', false]);
  // A new object on every call would re-run every effect keyed on the skills on every render, which re-renders.
  eq('    the same copy gives the same skills object each time', pilotFrom(alt, who, true).skills === a.skills, true);
  // What Alpha caps, with both levels: its training time is no answer (the points are there, so it read "takes 1 min").
  eq('    what Alpha caps, trained and used', a.capped, { [MINING]: { trained: 5, active: 4 }, [BARGE]: { trained: 3, active: 0 } });
  eq('    the same copy gives the same caps object each time (useTrainTimes keys on it)', pilotFrom(alt, who, true).capped === a.capped, true);
  eq('    the main has none: its path is as it was', [p.capped, pilotFrom({ ...main, meta: { ...main.meta, activeSkills: { [MINING]: 4 } } }, me, false).capped], [undefined, undefined]);
  const { alphaCap } = await import('../src/lib/pilot.ts');
  eq('    Omega opens Mining V (Alpha uses IV) and Mining Barge I (Alpha can\'t use it); not Mining IV, or Astrogeology',
    [alphaCap(a, MINING, 5), alphaCap(a, BARGE, 1), alphaCap(a, MINING, 4), alphaCap(a, ASTRO, 4), alphaCap(p, MINING, 5)],
    [{ trained: 5, active: 4 }, { trained: 3, active: 0 }, null, null, null]);
  const odd = altLedger({ ...saved, docs: { ...saved.docs, meta: { ...saved.docs.meta, activeSkills: { [MINING]: 4, [ASTRO]: 4 } }, skills: { [MINING]: 5, [ASTRO]: 3 } } });
  eq('    an active level over the trained one (ESI never sends it) is no cap', pilotFrom(odd, who, true).capped, { [MINING]: { trained: 5, active: 4 } });
  const omega = altLedger({ ...saved, docs: { ...saved.docs, meta: { cloneDetected: 'omega', skillQueue: queue } } });
  eq('  an Omega alt, nothing capped: its trained levels as they are', [pilotFrom(omega, who, true).skills === omega.skills, pilotFrom(omega, who, true).alpha, pilotFrom(omega, who, true).capped], [true, false, undefined]);
  // altLedger fills an unread skills doc in as {}: a character always has skills, so that is "not read", never "untrained".
  const unread = pilotFrom(altLedger(emptyAlt()), who, true);
  eq('  an alt whose skills the cloud hasn\'t read: not read, rather than nothing trained', [unread.skills === undefined, unread.skillQueue === undefined, unread.alpha], [true, true, false]);

  // Scaling up shown for an alt says whose skills a figure is at; every other page says "your", as it always has.
  const { whose, whoseStart, who: whoOf, skillsUnread } = await import('../src/lib/pilot.ts');
  eq('  whose skills, for the main and an alt', [whose(p), whoseStart(p), whoOf(p), whose(a), whoseStart(a), whoOf(a)], ['your', 'Your', 'you', 'Miner Two’s', 'Miner Two’s', 'Miner Two']);
  eq('  skills not read: an alt with none says so; the main is drawn as it always was', [skillsUnread(unread), skillsUnread(a), skillsUnread(pilotFrom(emptyData(), me, false))], [true, false, false]);
  // A refused login, or none, won't bring a first read: "Not read yet" would never resolve.
  const { unreadNote } = await import('../src/lib/pilot.ts');
  eq('  why not read: a first read to come, or a login to hand over again', [unreadNote(unread), unreadNote({ ...unread, lost: 'refused' }), unreadNote({ ...unread, lost: 'none' })],
    ['Not read yet: Miner Two’s skills come with the cloud’s first read', 'Not read: EVE refused Miner Two’s login; hand it over again on the Characters page', 'Not read: the cloud holds no login for Miner Two; hand one over on the Characters page']);
}

console.log('\n--- the alts the income check seeds earn by their journal (scripts/ledgers.mjs) ---');
{
  // The final review found their 3.37% tax rows rejected against the 7.5% an alt without Accounting is predicted to pay,
  // and journal rows naming no trade, so the isolation run's alt figures were estimates that never read their journal.
  const { ALTS, ALT_TAX, NOW: LNOW } = await import('./ledgers.mjs');
  const { altLedger } = await import('../src/lib/altLedger.ts');
  const { rates } = await import('../src/lib/fees.ts');
  const { matchFees } = await import('../src/lib/feeMatch.ts');
  const { activityEvents, incomeRows } = await import('../src/lib/income.ts');
  const { everyItemCalcs } = await import('../src/lib/everyItem.ts');
  const none = { filaments: new Set(), abyssLoot: new Set(), pi: new Set(), lpGoods: new Set() };
  // By hand: 15 resold at 820,000 of 20 bought at 700,000, less its tax; 40 never bought sold at 1.5 M, less its tax;
  // an 8 M bounty. The Alpha pays 7.5% whatever it trained (Accounting is Omega only), the other 3.375% at Accounting V.
  const byHand = (t) => (15 * 820000 - 15 * 700000 - 15 * 820000 * t) + 40 * 1500000 * (1 - t) + 8_000_000;
  for (const [i, a] of ALTS.large.slice(0, 2).entries()) {
    const d = altLedger(a.saved);
    const r = rates(d.settings);
    eq(`  ${a.entry.name}: the tax its skills and clone state predict is what its journal charged`, r.t, ALT_TAX[i]);
    const journal = Object.values(d.journal);
    const sales = Object.values(d.txs).filter((t) => !t.isBuy);
    // A tax row names no trade, as ESI's don't (eve-facts): it's the one in the sale's second.
    const taxOf = (t) => Math.abs(journal.find((e) => e.refType === 'transaction_tax' && e.date === t.date)?.amount ?? NaN);
    const m = matchFees(journal, Object.values(d.orders), Object.values(d.txs), () => r);
    eq('    each sale\'s tax is claimed from the journal (by second and size)', sales.map((t) => m.taxByTx.get(t.id)), sales.map(taxOf));
    eq('    each sale\'s journal rows name it', journal.filter((e) => e.contextId != null).every((e) => d.txs[String(e.contextId)]?.isBuy === false), true);
    const { earned } = incomeRows(everyItemCalcs(d), activityEvents(d, none, false, {}, []), LNOW - 10 * DAY, LNOW);
    eq(`    what it earned (${a.entry.name === 'Miner Two' ? '+64.38 M' : '+67.36 M'} on its card)`, Math.round(earned), Math.round(byHand(ALT_TAX[i])));
  }
}

console.log('\n--- what a set of mining records comes to (minedTotal) ---');
{
  const { minedTotal } = await import('../src/lib/mining.ts');
  const r = (typeId, qty) => ({ charId: 900001, date: '2026-09-29', systemId: 30000142, typeId, qty });
  const vol = { 1228: 0.15, 1230: 0.1 }, worth = { 1228: 16, 1230: null };
  const got = minedTotal([r(1228, 1000), r(1228, 500), r(1230, 2000)], (t) => vol[t] ?? null, (t) => worth[t] ?? null);
  eq('  units, m³, and ISK over what could be priced', [got.units, Math.round(got.m3), got.isk, got.priced, got.ores], [3500, 425, 24000, 1, 2]);
  const noVol = minedTotal([r(9999, 10)], () => null, () => null);
  eq('  an ore with no known volume: m³ not known, never 0', [noVol.m3, noVol.isk, noVol.priced], [null, 0, 0]);
  eq('  nothing mined', minedTotal([], () => 1, () => 1), { units: 0, m3: 0, isk: 0, priced: 0, ores: 0 });
}

console.log('\n--- mining across characters ---');
{
  const { sessionsByCharacter, miningSessions, perCharacter, altRightNow, READ_EVERY_MS } = await import('../src/lib/mining.ts');
  const M = 60_000, T = Date.parse('2026-09-30T12:00:00Z');
  const tk = (charId, min, typeId, qty) => ({ charId, at: T + min * M, systemId: 30000142, typeId, qty });
  // A reads at 0, 20, 40 and B at 10, 30: each is 20 minutes between its own ticks (one session), 10 between all of them
  const ticks = [tk(900001, 0, 1228, 100), tk(900002, 10, 1230, 50), tk(900001, 20, 1228, 100), tk(900002, 30, 1230, 50), tk(900001, 40, 1228, 100)];
  const by = sessionsByCharacter(ticks);
  eq('two characters mining at once are two sessions, each with its own ore and start', by.map((s) => [s.charId, s.start - T, s.end - T, s.byType]),
    [[900001, -10 * M, 40 * M, { 1228: 300 }], [900002, 0, 30 * M, { 1230: 100 }]]);
  const merged = miningSessions(ticks);
  eq('  without the character the same ticks are one session with both ores (the bug this prevents)', [merged.length, merged[0].byType], [1, { 1228: 300, 1230: 100 }]);
  eq('  sessions come back in start order, whatever order the ticks came in', sessionsByCharacter([...ticks].reverse()).map((s) => s.charId), [900001, 900002]);
  eq('  no ticks, no sessions', sessionsByCharacter([]), []);

  const r = (charId, date, typeId, qty) => ({ charId, date, systemId: 30000142, typeId, qty });
  const vol = { 1228: 0.15, 1230: 0.1 }, worth = { 1228: 16, 1230: 5 };
  const per = perCharacter([r(900001, '2026-09-28', 1228, 1000), r(900001, '2026-09-29', 1228, 500), r(900001, '2026-09-29', 1230, 100), r(900002, '2026-09-29', 1230, 2000), r(900003, '2026-09-29', 9999, 10)],
    (t) => vol[t] ?? null, (t) => worth[t] ?? null);
  const a = per.get(900001), b = per.get(900002), c = per.get(900003);
  eq('each character’s units, m³, ISK and distinct days', [a.units, Math.round(a.m3 * 100) / 100, a.isk, a.priced, a.ores, a.days], [1600, 235, 24500, 2, 2, 2]);
  eq('  another’s are its own', [b.units, Math.round(b.m3), b.isk, b.days], [2000, 200, 10000, 1]);
  eq('  an ore of unknown volume makes only that character’s m³ not known', [typeof b.m3, c.m3, c.isk, c.priced, c.days], ['number', null, 0, 0, 1]);
  eq('  nobody mined, nobody listed', perCharacter([], () => 1, () => 1).size, 0);

  const S = T + 5 * 60 * M;
  const at = (x) => [{ at: x }];
  eq('right now: a tick at the read that saw the ship', altRightNow({ ship: 17478, shipAt: S }, at(S)), { ship: 17478, at: S, mining: true });
  eq('  one in the read before it counts too', altRightNow({ ship: 17478, shipAt: S }, at(S - READ_EVERY_MS)).mining, true);
  // The read before can sit a little over ten minutes back (the round's mining step runs after the rest), or fifteen
  // after a skipped round: up to one and a half reads counts, past it doesn't.
  eq('  the read before, a little late (11 min back), counts', altRightNow({ ship: 17478, shipAt: S }, at(S - 1.1 * READ_EVERY_MS)).mining, true);
  eq('  and after a skipped round (15 min back)', altRightNow({ ship: 17478, shipAt: S }, at(S - 1.5 * READ_EVERY_MS)).mining, true);
  eq('  but not past that (16 min back)', altRightNow({ ship: 17478, shipAt: S }, at(S - 1.6 * READ_EVERY_MS)).mining, false);
  eq('  two reads back does not', altRightNow({ ship: 17478, shipAt: S }, at(S - 2 * READ_EVERY_MS - 1)).mining, false);
  eq('  no ticks: not mining, ship still said', altRightNow({ ship: 17478, shipAt: S }, []), { ship: 17478, at: S, mining: false });
  eq('  never read: nothing is said', altRightNow({ ship: null, shipAt: null }, at(S)), { ship: null, at: null, mining: false });
  eq('  read hours ago, still mining as of then, the time is that of the read', altRightNow({ ship: 17478, shipAt: S - 6 * 3600_000 }, at(S - 6 * 3600_000)), { ship: 17478, at: S - 6 * 3600_000, mining: true });
}

console.log('\n--- the Wallet\'s period, shared with the Characters page (periodStart) ---');
{
  const { periodStart } = await import('../src/lib/wallet.ts');
  const now = Date.parse('2026-09-30T15:00:00Z');
  eq('  the period: 24 hours back, or whole UTC days', [periodStart(1, now), periodStart(7, now)].map((t) => new Date(t).toISOString()), ['2026-09-29T15:00:00.000Z', '2026-09-24T00:00:00.000Z']);
}

console.log('\n--- transfers between your characters ---');
{
  const { ownIds, ownTransfer } = await import('../src/lib/roster.ts');
  const { describeRef } = await import('../src/lib/wallet.ts');
  const mine = ownIds(1, { '2': { name: 'A' }, '3': { name: 'B' } });
  eq('  ownIds: the main and every char', [...mine].sort(), [1, 2, 3]);
  eq('  ownIds: no main still holds the chars', [...ownIds(null, { '2': 1 })], [2]);
  const e = (refType, a, b) => ({ refType, firstPartyId: a, secondPartyId: b });
  eq('  main to alt donation', ownTransfer(e('player_donation', 1, 2), mine), true);
  eq('  alt to main donation', ownTransfer(e('player_donation', 2, 1), mine), true);
  eq('  alt to alt donation', ownTransfer(e('player_donation', 2, 3), mine), true);
  // Synthetic: no contract entry between two characters has been seen in real data (the user's one contract_reward names
  // the SCC, 1000132, as its payer), so this tests the rule as written, not the parties EVE really puts on one.
  eq('  contract_price between them', ownTransfer(e('contract_price', 1, 2), mine), true);
  eq('  player_trading between them', ownTransfer(e('player_trading', 2, 1), mine), true);
  eq('  a stranger to the main is not', ownTransfer(e('player_donation', 9, 1), mine), false);
  eq('  a missing party is not', ownTransfer({ refType: 'player_donation', firstPartyId: 1 }, mine), false);
  eq('  a bounty between yours is not', ownTransfer(e('bounty_prizes', 1, 2), mine), false);
  eq('  without the set is not', ownTransfer(e('player_donation', 1, 2), undefined), false);
  // CCP writes some entries with one party twice (the user's journal: 132 escrow releases and one sale to themselves).
  // The Wallet now always passes the set, and with no alts it is just the main, so a contract entry written that way
  // would have become "Between your characters" for someone with one character.
  eq('  one character on both sides is not', ownTransfer(e('contract_reward_deposited', 1, 1), mine), false);
  eq('  nor with only the main in the set', ownTransfer(e('player_donation', 1, 1), ownIds(1, {})), false);
  const don = { id: 'd', date: '2026-09-30T10:00:00Z', refType: 'player_donation', amount: -100e6, firstPartyId: 1, secondPartyId: 2 };
  const inn = { id: 'i', date: '2026-09-30T11:00:00Z', refType: 'player_donation', amount: 5e6, firstPartyId: 9, secondPartyId: 1 };
  const sk = { id: 's', date: '2026-09-30T12:00:00Z', refType: 'skill_purchase', amount: -2e6 };
  eq('  categoryOf: a main to alt donation is between with the set', categoryOf(don, mine), { key: 'between', label: 'Between your characters', kind: 'Transfer' });
  eq('  categoryOf: donationOut without it', categoryOf(don).key, 'donationOut');
  eq('  categoryOf: a stranger stays a donation with the set', categoryOf(inn, mine).key, 'donation');
  eq('  describeRef: a transfer', describeRef('player_donation', don, mine), 'Between your characters');
  eq('  describeRef: as today without', describeRef('player_donation', don), describeRef('player_donation'));
  const j = [don, inn, sk];
  const classOf = () => ({ tracked: false, tag: 'trading' });
  const since = Date.parse('2026-09-01T00:00:00Z');
  const w = flows(j, [], classOf, since, Infinity, mine);
  eq('  flows with the set: no donation line out', w.outs.map((l) => [l.key, l.amount]), [['skills', 2e6]]);
  eq('  flows with the set: the stranger stays in', w.ins.map((l) => [l.key, l.amount]), [['donation', 5e6]]);
  eq('  flows with the set: between.out', [w.between.in, w.between.out, w.between.count], [0, 100e6, 1]);
  eq('  flows with the set: outTotal leaves it out', w.outTotal, 2e6);
  const o = flows(j, [], classOf, since);
  eq('  flows without: today\'s lines', o.outs.map((l) => [l.key, l.amount]), [['donationOut', 100e6], ['skills', 2e6]]);
  eq('  flows without: between is empty', o.between, { in: 0, out: 0, count: 0, parts: [] });
  const back = { ...don, id: 'b', amount: 40e6, firstPartyId: 2, secondPartyId: 1 };
  eq('  between.in counts what an alt sent you', flows([back], [], classOf, since, Infinity, mine).between.in, 40e6);
  // The Wallet's line opens to its kinds and their entries, each way readable: a part says what went and what came
  // back, and each entry keeps its own sign and both its characters.
  // The contract price is synthetic, as above: it gives a second kind of part, not evidence of a contract's parties.
  const both = flows([don, back, { ...don, id: 'c', refType: 'contract_price', amount: -3e6 }], [], classOf, since, Infinity, mine).between;
  eq('  between: totals each way', [both.in, both.out, both.count], [40e6, 103e6, 3]);
  eq('  between: a part per kind, each way apart', both.parts.map((p) => [p.key, p.in, p.out, p.count, p.amount]), [['ref:player_donation', 40e6, 100e6, 2, 140e6], ['ref:contract_price', 0, 3e6, 1, 3e6]]);
  eq('  between: entries signed, biggest first, naming both parties', both.parts[0].entries.map((x) => [x.id, x.amount, x.first, x.second]), [['d', -100e6, 1, 2], ['b', 40e6, 2, 1]]);
  const big = { ...don, id: 'big', amount: -100e6 };
  eq('  unusual without the set flags the 100 M donation', unusual([big], since).map((u) => u.kind), ['donationOut']);
  eq('  unusual with the set does not', unusual([big], since, undefined, mine), []);
  const first = { ...inn, id: 'f', amount: 5e6, firstPartyId: 2, secondPartyId: 1 };
  eq('  unusual: a first donation from an alt is flagged without the set', unusual([first], since).map((u) => u.kind), ['donationIn']);
  eq('  unusual: and not with it', unusual([first], since, undefined, mine), []);
  eq('  unusual: a stranger\'s still is', unusual([inn], since, undefined, mine).map((u) => u.kind), ['donationIn']);
  const reward = { date: '2026-09-30T10:00:00Z', refType: 'contract_reward', amount: 7e6, firstPartyId: 2, secondPartyId: 1 };
  const inp = { txs: [], journal: [reward], tracked: new Set(), realized: [], losses: [], sets: { filaments: new Set(), abyssLoot: new Set(), pi: new Set(), lpGoods: new Set() }, salesTax: 0.03 };
  eq('  attribute: an alt\'s contract_reward is Hauling without the set', attribute(inp).map((x) => x.activity), ['Hauling']);
  eq('  attribute: not with it', attribute({ ...inp, mine }), []);
}

console.log('\n--- best ore by where it\'s found ---');
{
  const { ORE_WHERE, PLACES, rankOres, ORE_WHERE_SOURCE } = await import('../src/lib/oreWhere.ts');
  const { FAMILIES } = await import('../src/lib/miningFits.ts');
  const keys = new Set(PLACES.map((p) => p.key));
  eq('  places in display order', PLACES.map((p) => p.label), ['High-sec', 'Low-sec', 'Null-sec', 'Pochven', 'Wormholes', 'Moons', 'Ice']);
  const missing = FAMILIES.flatMap(([, ores]) => ores).filter((o) => !ORE_WHERE[o] || ORE_WHERE[o].found.length === 0);
  eq('  every base ore has somewhere it is found', missing, []);
  const badPlace = Object.entries(ORE_WHERE).filter(([, o]) => o.found.some((x) => !keys.has(x.place) || !x.where)).map(([k]) => k);
  eq('  every found place is a place, with words', badPlace, []);
  const at = (o, place) => ORE_WHERE[o].found.filter((x) => x.place === place).map((x) => x.how);
  eq('  Veldspar: a high-sec belt', at('Veldspar', 'highsec'), ['belt']);
  eq('  Veldspar: null-sec only by sov upgrade', at('Veldspar', 'nullsec'), ['sov']);
  eq('  Kernite: high-sec only as rare anomalies', at('Kernite', 'highsec'), ['rare']);
  eq('  Kernite: a low-sec belt', at('Kernite', 'lowsec'), ['belt']);
  eq('  Spodumain: Pochven only', ORE_WHERE.Spodumain.found.map((x) => x.place), ['pochven']);
  eq('  Mordunium carries its patch-note dispute', typeof ORE_WHERE.Mordunium.disputed, 'string');
  eq('  the four ubiquitous moon ores are disputed (high-sec)', ['Zeolites', 'Sylvite', 'Bitumens', 'Coesite'].map((o) => typeof ORE_WHERE[o].disputed), ['string', 'string', 'string', 'string']);
  eq('  the other moon ores are not', ['Cobaltite', 'Xenotime'].map((o) => ORE_WHERE[o].disputed), [undefined, undefined]);
  eq('  moon ores are drilled, place moon', ['Zeolites', 'Xenotime'].map((o) => ORE_WHERE[o].found.map((x) => `${x.place}/${x.how}`)), [['moon/drill'], ['moon/drill']]);
  eq('  Gelidus and Krystallos are disputed (low-sec)', ['Gelidus', 'Krystallos', 'Glare Crust'].map((o) => typeof ORE_WHERE[o].disputed), ['string', 'string', 'undefined']);
  eq('  ice is keyed by full name and found on ice belts', ORE_WHERE['Clear Icicle IV-Grade'].found.map((x) => `${x.place}/${x.how}`), ['ice/ice belt']);
  // The enriched ices under ESI's names (types 17975–17978 since they were graded), the research's in their detail.
  eq('  every ice type in the research is there', ['Clear Icicle', 'White Glaze', 'Blue Ice', 'Glacial Mass', 'Clear Icicle IV-Grade', 'White Glaze IV-Grade', 'Blue Ice IV-Grade', 'Glacial Mass IV-Grade', 'Glare Crust', 'Dark Glitter', 'Gelidus', 'Krystallos'].filter((n) => ORE_WHERE[n]?.kind !== 'ice'), []);
  eq('  an enriched ice says its old name', /Enriched Clear Icicle/.test(ORE_WHERE['Clear Icicle IV-Grade'].found[0].detail), true);
  eq('  wormhole sites as the research names them', ['Pyroxeres', 'Arkonor', 'Bistot'].map((n) => ORE_WHERE[n].found.find((x) => x.place === 'wormhole')?.where), ['Wormhole sites: Perimeter, Frontier, Core and Shattered', 'Wormhole sites: Perimeter, Frontier and Core', 'Wormhole sites']);
  eq('  sources carry a read date and a url', ORE_WHERE_SOURCE.every((s) => s.read === '1 October 2026' && s.url.startsWith('https://')), true);
  const row = (base, iskPerM3, iskPerHour) => ({ base, iskPerM3, iskPerHour });
  eq('  rank: by ISK an hour, ties by name', rankOres([row('Scordite', 1, 50), row('Veldspar', 2, 90), row('Plagioclase', 3, 50)], 'highsec').map((r) => r.base), ['Veldspar', 'Plagioclase', 'Scordite']);
  eq('  rank: one row with no pace falls back to ISK a m3', rankOres([row('Scordite', 5, null), row('Veldspar', 2, 90), row('Plagioclase', 3, 10)], 'highsec').map((r) => r.base), ['Scordite', 'Plagioclase', 'Veldspar']);
  eq('  rank: unpriced rows last, by name', rankOres([row('Veldspar', null, null), row('Scordite', 5, null), row('Plagioclase', null, null)], 'highsec').map((r) => r.base), ['Scordite', 'Plagioclase', 'Veldspar']);
  eq('  rank: an ore not found in the place is left out', rankOres([row('Veldspar', 2, 90), row('Hedbergite', 9, 99)], 'highsec').map((r) => r.base), ['Veldspar']);
  eq('  rank: an unknown base is left out', rankOres([row('Nonsense', 2, 90)], 'highsec'), []);
  const { rankedBy } = await import('../src/lib/oreWhere.ts');
  eq('  ranked by the hour when every row has one', rankedBy([row('Scordite', 1, 50), row('Veldspar', 2, 90), row('Hedbergite', 9, null)], 'highsec'), 'hour');
  eq('  else by the m3', rankedBy([row('Scordite', 5, null), row('Veldspar', 2, 90)], 'highsec'), 'm3');
  eq('  and by the m3 with no rows', rankedBy([], 'pochven'), 'm3');

  // ISK an hour: a row takes only a pace its ore can be mined at.
  const { kindOfBase, kindOfName, sessionKind, paceFor, measuredByKind } = await import('../src/lib/oreWhere.ts');
  eq('  kind by base: ore, moon ore, Mercoxit, ice, unknown', ['Scordite', 'Zeolites', 'Mercoxit', 'Glare Crust', 'Nonsense'].map(kindOfBase), ['ore', 'ore', 'mercoxit', 'ice', null]);
  eq('  kind by name: grades, ESI\'s trailing space, ice, not an ore', ['Scordite II-Grade', 'Scordite 0-Grade ', 'Brimful Zeolites', 'Mercoxit III-Grade', 'Clear Icicle IV-Grade', 'Tritanium'].map(kindOfName), ['ore', 'ore', 'ore', 'mercoxit', 'ice', null]);
  eq('  a session of one kind is that kind', sessionKind(['Scordite', 'Veldspar II-Grade']), 'ore');
  eq('  ore and ice in one session say nothing', sessionKind(['Scordite', 'Glare Crust']), null);
  eq('  an ore whose name isn\'t read yet says nothing', sessionKind(['Scordite', null]), null);
  const fit = (o) => ({ from: 'fit', hull: 'Hulk', tier: 'Solid', at: 'at your skills', m3PerMin: 1185, drones: false, unread: false, ice: false, mercoxit: false, ...o });
  eq('  no pace at all: open a ship', paceFor('ore', null), { m3PerMin: null, why: 'none' });
  eq('  an ore fit mines ore', paceFor('ore', fit()), { m3PerMin: 1185 });
  eq('  an ore fit mines no ice', paceFor('ice', fit()), { m3PerMin: null, why: 'fitIsOre' });
  eq('  an ore fit mines no Mercoxit', paceFor('mercoxit', fit()), { m3PerMin: null, why: 'needMercoxit' });
  eq('  an ice fit mines ice', paceFor('ice', fit({ ice: true, m3PerMin: 2100 })), { m3PerMin: 2100 });
  eq('  an ice fit mines no ore, nor Mercoxit', [paceFor('ore', fit({ ice: true })), paceFor('mercoxit', fit({ ice: true }))].map((p) => p.why), ['fitIsIce', 'fitIsIce']);
  eq('  the Mercoxit version mines Mercoxit', paceFor('mercoxit', fit({ mercoxit: true, m3PerMin: 572 })), { m3PerMin: 572 });
  eq('  and speaks for no other ore', paceFor('ore', fit({ mercoxit: true, m3PerMin: 572 })), { m3PerMin: null, why: 'fitIsMercoxit' });
  eq('  a fit still worked out is loading, never a zero', paceFor('ore', fit({ m3PerMin: null })), { m3PerMin: null, why: 'loading' });
  eq('  a drones-only fit says so', paceFor('ore', fit({ m3PerMin: null, drones: true })), { m3PerMin: null, why: 'drones' });
  // A booster tier with Mercoxit picked (no Mercoxit version) once told the Mercoxit row to pick Mercoxit.
  eq('  drones-only before Mercoxit and ice', [paceFor('mercoxit', fit({ m3PerMin: null, drones: true })), paceFor('ice', fit({ m3PerMin: null, drones: true }))].map((p) => p.why), ['drones', 'drones']);
  eq('  a fit ESI couldn\'t read says so, never "drones"', [paceFor('ore', fit({ m3PerMin: null, unread: true })), paceFor('ice', fit({ m3PerMin: null, unread: true })), paceFor('mercoxit', fit({ m3PerMin: null, unread: true }))].map((p) => p.why), ['unread', 'unread', 'unread']);
  const by = measuredByKind([
    { ship: 17480, kind: 'ore', m3PerMin: 500 }, { ship: 17480, kind: 'ore', m3PerMin: 700 }, { ship: 32880, kind: 'ore', m3PerMin: 100 },
    { ship: 37135, kind: 'ice', m3PerMin: 1800 }, { ship: 32880, kind: null, m3PerMin: 9999 },
  ], 17480);
  eq('  measured: ore in the ship you\'re in', by.ore, { m3PerMin: 600, sessions: 2, ship: 17480 });
  eq('  measured: ice in any ship when none in this one', by.ice, { m3PerMin: 1800, sessions: 1, ship: null });
  eq('  measured: no Mercoxit sessions, none', by.mercoxit, undefined);
  eq('  a measured ore pace prices ore', paceFor('ore', { from: 'measured', by }), { m3PerMin: 600 });
  eq('  and never Mercoxit it didn\'t mine', paceFor('mercoxit', { from: 'measured', by }), { m3PerMin: null, why: 'notMeasured' });
  eq('  measured with no ship: every session of the kind', measuredByKind([{ ship: 1, kind: 'ore', m3PerMin: 100 }, { ship: 2, kind: 'ore', m3PerMin: 300 }], null).ore, { m3PerMin: 200, sessions: 2, ship: null });
}

console.log('\n--- Orders: a buy that keeps adding stock to a long sell queue (2 October 2026) ---');
{
  const fs6 = await import('node:fs');
  // 'Arbalest' Rapid Heavy Missile Launcher I: ESI's Jita book at 11:59 UTC, its history to 30 September, the cloud's
  // watched flow, the user's buy and sell on it as that book had them, their hangar as the stock document read it at 12:44
  // (scripts/fixtures/orders-queue.json). ~640 a day trade, nearly all sold into bids at ~24.7k; 16,264 listed in Jita.
  const fx = JSON.parse(fs6.readFileSync(new URL('./fixtures/orders-queue.json', import.meta.url), 'utf8'));
  const R = await import('../src/lib/relist.ts');
  const Sp = await import('../src/lib/split.ts');
  const { sidePaceOf, PRIOR_HOURS } = await import('../src/lib/flow.ts');
  const { recentRange } = await import('../src/lib/fills.ts');
  const { sanitizeSettings } = await import('../src/lib/fees.ts');
  const S = sanitizeSettings(fx.settings);
  const now = Date.parse('2026-10-02T12:00:00Z');
  const book = fx.book.map(([id, b, price, volume]) => ({ id, isBuy: b === 1, price, volume }));
  const sold = Sp.soldFrom(fx.book.map(([, b, , left, total]) => ({ is_buy_order: b === 1, volume_remain: left, volume_total: total })));
  const range = recentRange(fx.history, undefined, now, fx.flow);
  const watched = observedFlow({ [fx.typeId]: fx.flow }, fx.typeId, now);
  const ev = { daily: paceDay(fx.history, now), buyers: buyerShare(fx.history.slice(-30)), sold, watched };
  const sellPace = sidePaceOf(ev, false);
  const yours = [fx.buy.orderId, fx.sell.orderId];
  const judged = (o, extra = {}) => R.judgeOrder(o, { book, perDay: sidePaceOf(ev, o.isBuy).perDay, lows: range.lows, highs: range.highs, txs: [], watched, yours, hangar: fx.hangar, sellPace, ...extra }, S, now);

  eq('the pace of buyers taking listings says where it came from: over a day watched, the watching', [Math.round(sellPace.perDay), sellPace.paceFrom, sellPace.watchedH >= PRIOR_HOURS], [295, 'watched', true]);
  const arb = judged(fx.buy);
  eq('the Arbalest\'s buy feeds a long queue', arb.feeds?.long, true);
  eq('  others\' listings up to where trading reached (62,910), yours listed and in the hangar, and what it still buys',
    [arb.feeds?.ahead, arb.feeds?.upTo, arb.feeds?.listed, arb.feeds?.hangar, arb.feeds?.toBuy, arb.feeds?.units, arb.feeds?.atLeast], [3370, 62_910, 1808, 737, 2352, 8267, false]);
  eq('  about 28 days of the 295 a day who buy from listings, measured from the watching', [Math.round(arb.feeds?.days), Math.round(arb.feeds?.perDay), arb.feeds?.from], [28, 295, 'watched']);
  const said = arb.feeds ? R.feedsQueueSaid(arb.feeds) : '';
  has('  its tip says how many days of buyers that is', said, 'about 28 days');
  has('  and where the buyers a day came from', said, Sp.queuePaceSaid('watched'));
  eq('  its tag says how many days of buyers', R.feedsQueueTag(arb.feeds), 'Feeds a long queue: about 28 days of buyers');
  // EVE can't make an order smaller (finding-trades: the plan checklist): cancelling and placing a smaller one is a new order.
  has('  and what to do: cancel it, or cancel and place a smaller one', said, 'cancel this buy, or cancel it and place a smaller one');
  has('    which is a new order with its own broker fee', said, 'a new order with its own broker fee');
  has('    and list what you hold first', said, 'list what you hold first');
  eq('    never "making it smaller": EVE can\'t shrink an order', /making it smaller|Consider cancelling/.test(said), false);
  // The brief's figures, read earlier the same day: 530 in the hangar and 2,557 still to buy, against ~200 a day.
  const brief = R.feedingQueue(fx.buy, { volumeRemain: 2557, gone: false }, { book, yours, highs: range.highs, hangar: 530, pace: { perDay: 200, watchedH: 115, paceFrom: 'watched' } });
  eq('  the brief\'s figures at 200 a day: 3,370 + 1,808 + 530 + 2,557, about 41 days', [brief?.units, Math.round(brief?.days), brief?.long], [8265, 41, true]);
  eq('  its sell is never tagged: only a buy adds stock', judged(fx.sell).feeds, undefined);

  // An ordinary buy (Review Focus 5): a market whose buyers take 600 a day from listings, 2,000 listed by others where
  // trading reaches, 300 of yours listed, and a buy for 1,000 more: 5.5 days.
  const calmBook = [{ id: 1, isBuy: false, price: 1010, volume: 100 }, { id: 2, isBuy: false, price: 1020, volume: 1900 }, { id: 3, isBuy: false, price: 1015, volume: 300 },
    { id: 4, isBuy: true, price: 900, volume: 1000 }, { id: 5, isBuy: false, price: 1500, volume: 50_000 }];
  const calmHighs = Array(14).fill(1050);
  const calm = R.feedingQueue({ orderId: 4, isBuy: true }, { volumeRemain: 1000, gone: false }, { book: calmBook, yours: [3, 4], highs: calmHighs, hangar: 0, pace: { perDay: 600, watchedH: 0, paceFrom: 'book' } });
  eq('an ordinary buy whose stock sells within two weeks is no long queue, and listings above where trading reaches aren\'t counted',
    [calm?.ahead, calm?.listed, calm?.units, calm?.days, calm?.long], [2000, 300, 3300, 5.5, false]);
  const calmOrder = { orderId: 4, typeId: 1, isBuy: true, price: 900, volumeRemain: 1000, locationId: 60003760 };
  eq('  so judgeOrder carries no tag', R.judgeOrder(calmOrder, { book: calmBook, perDay: 100, lows: Array(14).fill(890), highs: calmHighs, txs: [], yours: [3, 4], hangar: 0, sellPace: { perDay: 600, watchedH: 0, paceFrom: 'book' } }, S, now).feeds, undefined);
  const edge = R.feedingQueue({ orderId: 4, isBuy: true }, { volumeRemain: 500, gone: false }, { book: calmBook, yours: [3, 4], highs: calmHighs, hangar: 0, pace: { perDay: 200, watchedH: 0, paceFrom: 'book' } });
  eq('  nor at exactly two weeks of buyers: 2,800 against 200 a day', [edge?.days, edge?.long], [Sp.LONG_QUEUE_DAYS, false]);

  // Nothing known is never a zero.
  const q = (pace, extra = {}) => R.feedingQueue(fx.buy, { volumeRemain: fx.buy.volumeRemain, gone: false }, { book, yours, highs: range.highs, hangar: fx.hangar, pace, ...extra });
  eq('nothing said with no buyers a day to go on, or with the split only assumed',
    [q({ perDay: null, watchedH: 0, paceFrom: 'book' }), q({ perDay: 200, watchedH: 3, paceFrom: 'even' }), q({ perDay: 0, watchedH: 3, paceFrom: 'even' })], [null, null, null]);
  // A pace measured at zero (the final review, 2 October 2026): the book says nobody buys from listings, so the queue
  // doesn't clear. It was "nothing to say", and the buy went untagged.
  const none = q({ perDay: 0, watchedH: 0, paceFrom: 'book' });
  eq('a pace measured at zero from the book: a queue that doesn\'t clear, and long', [none?.units, none?.days === Infinity, none?.long], [3370 + 1808 + 737 + 2352, true, true]);
  eq('  judgeOrder tags it', judged(fx.buy, { sellPace: { perDay: 0, watchedH: 0, paceFrom: 'book' } }).feeds?.long, true);
  eq('  its tag says nobody has been seen buying from listings', none ? R.feedsQueueTag(none) : '', 'Feeds a long queue: nobody has been seen buying from listings');
  const noneSaid = none ? R.feedsQueueSaid(none) : '';
  has('  and so does its tip, with where that came from', noneSaid, `Nobody has been seen buying from listings, ${Sp.queuePaceSaid('book')}`);
  eq('    with no days or pace printed as a number', /about 0 |Infinity|NaN|over a year/.test(noneSaid), false);
  const noneWatched = q({ perDay: 0, watchedH: 8, paceFrom: 'watched' });
  has('  watched to nothing, the tip says how long it was watched', noneWatched ? R.feedsQueueSaid(noneWatched) : '', `Nobody has been seen buying from listings, ${Sp.queuePaceSaid('watched')} (8 h watched)`);
  const slow = q({ perDay: 0.3, watchedH: 0, paceFrom: 'book' });
  has('a slow pace is said with its decimal, not as 0', slow ? R.feedsQueueSaid(slow) : '', 'Buyers take about 0.3 a day from listings');
  eq('  and a queue past a year says so', slow ? R.feedsQueueTag(slow) : '', 'Feeds a long queue: over a year of buyers');
  eq('  nor for an order that\'s gone', R.feedingQueue(fx.buy, { volumeRemain: 2352, gone: true }, { book, yours, highs: range.highs, hangar: fx.hangar, pace: sellPace }), null);
  const noHist = q(sellPace, { highs: null });
  eq('  without history, others\' listings aren\'t counted: at least yours and what it still buys', [noHist?.ahead, noHist?.upTo, noHist?.units, noHist?.atLeast], [null, null, 1808 + 737 + 2352, true]);
  has('  and its tip says others\' listings aren\'t counted', noHist ? R.feedsQueueSaid(noHist) : '', 'aren’t counted');
  const noHangar = q(sellPace, { hangar: null });
  eq('  with the hangar unread, it isn\'t counted and the queue is at least the rest', [noHangar?.hangar, noHangar?.units, noHangar?.atLeast], [null, 3370 + 1808 + 2352, true]);
  has('  and its tip says so', noHangar ? R.feedsQueueSaid(noHangar) : '', 'hangar hasn’t been read');
  eq('  the cloud\'s alert round passes no sell pace: no tag there', judged(fx.buy, { sellPace: undefined }).feeds, undefined);

  // Where the pace came from: the watching once it carries at least half the weight, or alone when there's no prior.
  const w = (h) => ({ ...watched, h });
  eq('the pace\'s source: a book prior under a day watched, the watching from a day, history\'s guess with no book, the watching alone with no prior',
    [sidePaceOf({ ...ev, watched: w(10) }, false).paceFrom, sidePaceOf({ ...ev, watched: w(PRIOR_HOURS) }, false).paceFrom,
      sidePaceOf({ ...ev, sold: undefined, watched: w(0) }, false).paceFrom, sidePaceOf({ ...ev, daily: null, watched: w(10) }, false).paceFrom], ['book', 'watched', 'history', 'watched']);

  // On To do too (the user, 2 October 2026: "yes i approve all 3 choices"): one item per tagged buy, something to act on,
  // in the tag's own words, never mailed. Mirrors a sell priced under cost (`underCost`).
  const T = await import('../src/lib/todo.ts');
  const action = { label: 'Open in game', typeId: fx.typeId, route: `orders?show=${fx.typeId}` };
  const item = T.feedsQueueItem(arb, fx.name, action);
  eq('To do lists the Arbalest\'s buy: keyed by the order, its own kind, something to act on',
    [item?.key, item?.kind, item?.source, T.needs('feedsQueue'), T.KIND_LABEL.feedsQueue, item?.title], [`feeds:${fx.buy.orderId}`, 'feedsQueue', 'orders', 'act', 'Feeds a long queue', `${fx.name} buy order`]);
  eq('  what\'s at stake is what the order still has to spend', item?.stake, arb.atRisk);
  has('  in the tag\'s words: the queue and how long it takes', item?.detail ?? '', R.feedsQueueLead(arb.feeds));
  has('    and what to do', item?.detail ?? '', 'cancel this buy, or cancel it and place a smaller one');
  has('    the same words as the tip on Orders', R.feedsQueueSaid(arb.feeds), R.feedsQueueLead(arb.feeds));
  eq('  opening it copies no price: cancelling isn\'t one', item?.action.copy, undefined);
  eq('  its version is the order\'s price alone: not the pace, nor the units it fills (a buy filling all day would reopen a tick each time)',
    [item?.ver, T.feedsQueueItem(judged(fx.buy, { sellPace: { ...sellPace, perDay: 250 } }), fx.name, action)?.ver,
      T.feedsQueueItem({ ...judged(fx.buy), volumeRemain: fx.buy.volumeRemain - 100 }, fx.name, action)?.ver],
    [`feeds:${fx.buy.price}`, `feeds:${fx.buy.price}`, `feeds:${fx.buy.price}`]);
  eq('  nothing for a buy that isn\'t tagged, or for a sell', [T.feedsQueueItem(R.judgeOrder(calmOrder, { book: calmBook, perDay: 100, lows: Array(14).fill(890), highs: calmHighs, txs: [], yours: [3, 4], hangar: 0, sellPace: { perDay: 600, watchedH: 0, paceFrom: 'book' } }, S, now), 'x', action), T.feedsQueueItem(judged(fx.sell), fx.name, action)], [null, null]);
  // Ticked off like an order item: only by a newer check that read the book and no longer tags it, or the order closing.
  const e = { key: item.key, item, seenAt: 1000, lastAt: 1000 };
  const v = (extra = {}) => ({ gone: false, price: fx.buy.price, ...extra });
  eq('  absent is not done: an older check, a check that didn\'t read its book, or none at all say nothing',
    [T.judgeFeedsQueue(e, { open: true, checkedAt: 500, bookRead: true, v: v() }), T.judgeFeedsQueue(e, { open: true, checkedAt: 2000, bookRead: false, v: v() }), T.judgeFeedsQueue(e, { open: true, checkedAt: null, bookRead: false })], [null, null, null]);
  eq('    nor a newer check that still tags it', T.judgeFeedsQueue(e, { open: true, checkedAt: 2000, bookRead: true, v: v({ feeds: arb.feeds }) }), null);
  eq('  a newer check that read the book and no longer tags it ticks it off', T.judgeFeedsQueue(e, { open: true, checkedAt: 2000, bookRead: true, v: v() }), 'The latest check of its book no longer has what it buys feeding a long queue.');
  eq('  so does the order closing, or leaving the market', [T.judgeFeedsQueue(e, { open: false, checkedAt: null, bookRead: false }), T.judgeFeedsQueue(e, { open: true, checkedAt: 2000, bookRead: true, v: v({ gone: true }) })],
    ['The order has closed: it filled, expired or was cancelled.', 'It’s no longer in the market: it filled, expired or was cancelled.']);
  const kept = T.remember({ [item.key]: e }, [], () => 1000, (x) => T.judgeFeedsQueue(x, { open: true, checkedAt: 500, bookRead: true, v: v() }), 2000);
  eq('  gone from the list before a newer check: kept, waiting on it', [!!kept[item.key], kept[item.key]?.done], [true, undefined]);
}

console.log('\n--- a count tile filters the table below it ---');
{
  // The user, 2 October 2026: click a tile and the table shows only its rows; click it again and the filter clears.
  const F = await import('../src/lib/tileFilter.ts');
  const { shownVerdict } = await import('../src/lib/relist.ts');
  eq('pressing a tile turns it on; pressing it again lets go', [F.pressTile(null, 'move', 3), F.pressTile('move', 'move', 3)], ['move', null]);
  eq('  one at a time: pressing another moves the filter to it', F.pressTile('move', 'keep', 2), 'keep');
  eq('  a tile counting nothing can\'t be pressed, and leaves the one on as it was', [F.pressTile(null, 'wait', 0), F.pressTile('move', 'wait', 0)], [null, 'move']);
  eq('  but the one on can be let go of once its rows have gone', [F.pressTile('move', 'move', 0), F.canPress('move', 'move', 0), F.canPress(null, 'wait', 0), F.canPress(null, 'move', 3)], [null, true, false, true]);
  const rows = [{ id: 1, v: 'move' }, { id: 2, v: 'wait' }, { id: 3, v: 'move' }, { id: 4, v: 'front' }];
  const match = (r, k) => r.v === k;
  eq('  the rows it keeps, in their order', F.tileRows(rows, 'move', match).map((r) => r.id), [1, 3]);
  eq('  with none on, every row, the same list', F.tileRows(rows, null, match) === rows, true);
  eq('  the line over the table says how many of how many, and by which tile', F.showingSaid(3, 1234, 'Move it'), 'Showing 3 of 1,234: Move it');
  // Orders' verdict tiles and the figures under them count by what the verdict column shows, and filter by the same.
  const orders = [
    { verdict: 'move' }, { verdict: 'loss', keep: { price: 1 } }, { verdict: 'loss' }, { verdict: 'wait' }, { verdict: 'move' }, { verdict: 'dry' },
  ];
  eq('a raise the guard refused shows, counts and filters as Keep it, not Not worth it', orders.map(shownVerdict), ['move', 'keep', 'loss', 'wait', 'move', 'dry']);
  const count = (k) => orders.filter((x) => shownVerdict(x) === k).length;
  eq('  each tile\'s count is exactly the rows it shows', ['move', 'keep', 'loss', 'wait', 'dry', 'front', 'bid'].map((k) => F.tileRows(orders, k, (x, v) => shownVerdict(x) === v).length),
    ['move', 'keep', 'loss', 'wait', 'dry', 'front', 'bid'].map(count));
}

console.log('\n--- R&D agents: the rules ---');
{
  // The user, 2 October 2026: research agents "generate research points over time … great to just have going passively".
  // The figures are the research's (.playwright-mcp/research/rd-agents/draft.md): EVE University's formula, checked by a
  // player against three characters (2023), and the access rule from EVE University's Research missions page.
  const R = await import('../src/lib/research.ts');
  const fsR = await import('node:fs');
  const bundle = JSON.parse(fsR.readFileSync(new URL('../src/data/researchAgents.json', import.meta.url), 'utf8'));
  const graph = JSON.parse(fsR.readFileSync(new URL('../src/data/universeGraph.json', import.meta.url), 'utf8')).systems;
  const r2 = (x) => +x.toFixed(2);

  eq('RP a day at a level 4 agent: field IV, Negotiation IV, no agent standing; field V, Negotiation V, agent standing 2; and 10',
    [R.rpPerDay({ field: 4, agentLevel: 4, negotiation: 4, agentStanding: null }), R.rpPerDay({ field: 5, agentLevel: 4, negotiation: 5, agentStanding: 2 }),
      R.rpPerDay({ field: 5, agentLevel: 4, negotiation: 5, agentStanding: 10 })].map(r2), [89.6, 119.07, 125.55]);
  eq('  the named constants the copy states', [R.QUALITY_BONUS, R.RP_PER_DATACORE, R.DATACORE_FEE, R.ACCESS, R.CORP_BELOW_FACTION, R.RATE_TOLERANCE],
    [20, 100, 10_000, { 1: -2, 2: 1, 3: 3, 4: 5 }, 2, { rp: 2, share: 0.02 }]);

  eq('effective standing: Caldari State\'s 3.63 at Connections IV is 4.65; no standing stays none, whatever the skills',
    [r2(R.effectiveStanding(3.63, 4, 0)), R.effectiveStanding(null, 5, 5)], [4.65, null]);
  eq('  a negative standing goes through Diplomacy (−3 + 13 × 16%), never Connections',
    [r2(R.effectiveStanding(-3, 0, 4)), R.effectiveStanding(-3, 4, 0)], [-0.92, -3]);
  eq('  a standing that exists at 0 is lifted by Connections ("positive or 0", EVE University)', r2(R.effectiveStanding(0, 4, 0)), 1.6);

  eq('R&D access: the corporation at the level\'s standing, or the faction there with the corporation no more than 2 below',
    [R.agentAccess(4, 5.0, null), R.agentAccess(4, 3.0, 5.0), R.agentAccess(4, 2.9, 5.0), R.agentAccess(4, null, 4.65)], [true, true, false, false]);
  eq('  no standing counts as 0: level 2 opens on the faction alone (0 ≥ 1 − 2), level 1 to anyone, level 3 not (0 < 3 − 2)',
    [R.agentAccess(2, null, 4.65), R.agentAccess(1, null, null), R.agentAccess(3, null, 4.65), R.agentAccess(3, 1.0, 4.65)], [true, true, false, true]);
  eq('  level 1 shuts only below −2 both ways: corporation and faction both at −3, or the corporation over 2 under the faction\'s 0',
    [R.agentAccess(1, -3, -3), R.agentAccess(1, -5, null), R.agentAccess(1, -3, null)], [false, false, true]);
  eq('the highest level open: the main today (Lai Dai at none, Caldari State 4.65) has level 2; Lai Dai at 1.0 opens level 3',
    [R.openLevel(null, 4.65), R.openLevel(1.0, 4.65), R.openLevel(-3, -3), R.openLevel(5, null)], [2, 3, 0, 4]);

  const T = Date.parse('2026-10-01T12:00:00Z');
  eq('RP now is CCP\'s formula: remainder + per day × days since the start',
    R.rpNow({ agentId: 1, skillTypeId: 1, startedAt: new Date(T).toISOString(), pointsPerDay: 100, remainderPoints: 50 }, T + 1.5 * DAY), 200);
  eq('whole datacores at 100 RP, or at a cost given; never under none', [R.datacoresFor(250), R.datacoresFor(250, 50), R.datacoresFor(-40)], [2, 5, 0]);

  const tax = 0.03375;
  const five = R.datacoreValue([{ price: 92_700, volume: 3 }, { price: 92_000, volume: 10 }], 5, tax);
  const want5 = (3 * 92_700 + 2 * 92_000) * (1 - tax) - 5 * 10_000;
  eq('five datacores walked down the bids, after sales tax, less the fee each', [five?.total, five?.perUnit, five?.units], [want5, want5 / 5, 5]);
  eq('  no bids, or an empty book: nothing to say', [R.datacoreValue(null, 5, tax), R.datacoreValue([], 5, tax)], [null, null]);
  const twenty = R.datacoreValue([{ price: 92_700, volume: 3 }, { price: 92_000, volume: 10 }], 20, tax);
  const want13 = (3 * 92_700 + 10 * 92_000) * (1 - tax) - 13 * 10_000;
  eq('  more than the bids hold: the rest valued at nothing, the total only what the bids take, and how many',
    [twenty?.total, twenty?.perUnit, twenty?.units], [want13, want13 / 13, 13]);
  const bait = R.datacoreValue([{ price: 92_700, volume: 3 }, { price: 0.02, volume: 100_000 }], 5, tax);
  eq('  a bid that doesn\'t cover the fee takes nothing (escrow bait at 0.02 ISK would read as −10,000 a datacore)',
    [bait?.total, bait?.units], [3 * 92_700 * (1 - tax) - 3 * 10_000, 3]);
  eq('  only such bids: nothing to say', R.datacoreValue([{ price: 0.02, volume: 100_000 }], 5, tax), null);
  const none = R.datacoreValue([{ price: 92_700, volume: 3 }], 0, tax);
  eq('  none held: worth nothing, each at the top bid\'s net', [none?.total, none?.perUnit, none?.units], [0, 92_700 * (1 - tax) - 10_000, 0]);

  // Lai Dai (1000020, Caldari State 500001): a level 4 and a level 2; Carthum (1000064, Amarr Empire 500003): a level 1.
  const ag = (id, level, corp, faction, system, fields) => ({ id, name: `Agent ${id}`, level, corp, faction, station: 60000000 + id, system, fields });
  const agents = [ag(1, 4, 1000020, 500001, 30000001, [11453, 11446]), ag(2, 2, 1000020, 500001, 30000002, [11453]), ag(3, 1, 1000064, 500003, 30000003, [11444])];
  const standings = [{ id: 1, type: 'agent', standing: 2 }, { id: 500001, type: 'faction', standing: 3.63 }];
  const opts = { skills: { 11453: 4, 11444: 1 }, standings, connections: 4, diplomacy: 0, negotiation: 4,
    netPerDatacore: { 20418: 79_571, 20421: 68_836 }, jumpsTo: (s) => (s === 30000003 ? null : s - 30000000) };
  const ranked = R.rankAgents(agents, opts);
  eq('ranked: open ones first, best ISK a day first, the field at least the agent\'s level, the agent\'s own standing lifted by Connections, unpriced last',
    ranked.map((r) => [r.agent.id, r.field, r.datacore, r.open, r2(r.rpDay), r.iskDay == null ? null : Math.round(r.iskDay), r.jumps]),
    [[2, 11453, 20418, true, 50.4, Math.round(0.504 * 79_571), 2], [3, 11444, 20421, true, 5.6, Math.round(0.056 * 68_836), null],
      [1, 11453, 20418, false, r2(1.4328 * 64), Math.round(1.4328 * 64 / 100 * 79_571), 1], [1, 11446, 20419, false, r2(1.4328 * 64), null, 1]]);
  eq('  standings not read: worked out as none, so only level 1 is open', R.rankAgents(agents, { ...opts, standings: null }).filter((r) => r.open).map((r) => r.agent.id), [3]);

  // ESI's /characters/{id}/standings/ as it comes, in no order: every agent, corporation and faction, raw. Kept whole and
  // sorted by ID (the cloud compares the alt's meta doc as a string, so an order that moved would push every hour).
  const raw = [
    { from_id: 3008416, from_type: 'agent', standing: 2.1 },
    { from_id: 500001, from_type: 'faction', standing: 3.63 },
    { from_id: 1000125, from_type: 'npc_corp', standing: -1.25 },
    { from_id: 500010, from_type: 'faction', standing: -4.5 },
    { from_id: 1000020, from_type: 'npc_corp', standing: 0 },
  ];
  eq('standings kept whole: sorted by ID, signs kept, a standing at 0 kept (it isn\'t none), the type from ESI\'s from_type',
    R.toStandings(raw), [
      { id: 500001, type: 'faction', standing: 3.63 }, { id: 500010, type: 'faction', standing: -4.5 },
      { id: 1000020, type: 'npc_corp', standing: 0 }, { id: 1000125, type: 'npc_corp', standing: -1.25 },
      { id: 3008416, type: 'agent', standing: 2.1 },
    ]);
  eq('  the same answer in another order gives the same list, as a string too', JSON.stringify(R.toStandings([...raw].reverse())), JSON.stringify(R.toStandings(raw)));
  eq('  ESI\'s answer is left as it was', raw[0].from_id, 3008416);
  eq('  a type ESI doesn\'t name (none today) or a standing that isn\'t a number is left out, never guessed', R.toStandings([
    { from_id: 1, from_type: 'alliance', standing: 1 }, { from_id: 2, from_type: 'faction', standing: null }, { from_id: 3, from_type: 'faction', standing: 1 },
  ]), [{ id: 3, type: 'faction', standing: 1 }]);
  eq('  an empty answer is an empty list (read, with no standing anywhere)', R.toStandings([]), []);

  eq('the field → datacore map: 17 fields; Amarr Starship Engineering (11444) makes "Datacore - Amarrian Starship Engineering" (20421)',
    [Object.keys(R.DATACORE_OF).length, R.DATACORE_OF[11444], R.DATACORE_OF[11450], R.DATACORE_OF[11453]], [17, 20421, 20410, 20418]);

  const levels = [1, 2, 3, 4].map((l) => bundle.agents.filter((a) => a.level === l).length);
  eq('the bundle: 244 research agents (agent type 4), 78 / 81 / 53 / 32 at levels 1–4, by ID', [bundle.agents.length, levels,
    bundle.agents.every((a, i) => i === 0 || bundle.agents[i - 1].id < a.id)], [244, [78, 81, 53, 32], true]);
  has('  its source names the static data\'s build', bundle.source, '3569502');
  const listed = new Set(bundle.agents.flatMap((a) => a.fields));
  eq('  no field outside the map, every agent with one, and every field in the map offered somewhere',
    [[...listed].filter((f) => !(f in R.DATACORE_OF)), bundle.agents.filter((a) => !a.fields.length).length, Object.keys(R.DATACORE_OF).map(Number).filter((f) => !listed.has(f))], [[], 0, []]);
  eq('  every agent has a corporation, a faction, a station and a system', bundle.agents.filter((a) => !a.corp || !a.faction || !a.station || !a.system).length, 0);
  const laiDai4 = bundle.agents.filter((a) => a.corp === 1000020 && a.level === 4);
  eq('  Lai Dai\'s six level 4 agents each list Electronic Engineering, Graviton Physics and Caldari Starship Engineering',
    [laiDai4.length, laiDai4.every((a) => [11453, 11446, 11454].every((f) => a.fields.includes(f)))], [6, true]);
  const rdCorps = new Set(bundle.agents.map((a) => a.corp));
  eq('  helpers: 447 security and distribution agents (198 and 249) of levels 1–4, only of corporations with R&D agents, by ID',
    [bundle.helpers.length, bundle.helpers.filter((h) => h.division === 'security').length,
      bundle.helpers.filter((h) => !rdCorps.has(h.corp) || h.level < 1 || h.level > 4 || !['security', 'distribution'].includes(h.division)).length,
      bundle.helpers.every((h, i) => i === 0 || bundle.helpers[i - 1].id < h.id)], [447, 198, 0, true]);
  const named = (n) => bundle.helpers.find((h) => h.name === n);
  eq('  the research\'s Lai Dai helpers: Ehu Vantoh (level 3 security, Isaziwa), Tatsari Vaheda (level 4 distribution, Elonaya)',
    [named('Ehu Vantoh'), named('Tatsari Vaheda')].map((h) => h && [h.corp, h.level, h.division, graph[h.system]?.[1]]),
    [[1000020, 3, 'security', 'Isaziwa'], [1000020, 4, 'distribution', 'Elonaya']]);
}

console.log('\n--- R&D agents: the Research tab, getting started ---');
{
  // Stage 1 of the Research tab (docs/superpowers/specs/2026-10-03-rd-agents-design.md): the pick, the four steps' rules,
  // and the reads it shares. Figures from the research (.playwright-mcp/research/rd-agents/draft.md).
  const R = await import('../src/lib/research.ts');
  const S = await import('../src/lib/researchStart.ts');
  const { reachFrom } = await import('../src/lib/jumps.ts');
  const { shareInFlight } = await import('../src/lib/inFlight.ts');
  const fsR = await import('node:fs');
  const bundle = JSON.parse(fsR.readFileSync(new URL('../src/data/researchAgents.json', import.meta.url), 'utf8'));
  const graph = JSON.parse(fsR.readFileSync(new URL('../src/data/universeGraph.json', import.meta.url), 'utf8')).systems;
  const r2 = (x) => +x.toFixed(2);

  // A read shared while in flight (gotchas.md: a cache that only remembers finished answers asks twice when two ask at once).
  let calls = 0;
  const waiting = [];
  const read = shareInFlight((t, region) => `${region}:${t}`, (t, region) => { calls++; return new Promise((res, rej) => waiting.push({ res: () => res(`${region}:${t}:${calls}`), rej })); });
  const a = read(20418, 10000002), b = read(20418, 10000002), c = read(20419, 10000002);
  eq('a read asked for twice at once is one request, and another key is its own', calls, 2);
  waiting[0].res(); waiting[1].res();
  eq('  both askers get the one answer', [await a, await b, await c], ['10000002:20418:2', '10000002:20418:2', '10000002:20419:2']);
  const d2 = read(20418, 10000002), d3 = read(20418, 10000002);
  eq('  once it has landed, the next ask reads again (the function\'s own cache decides freshness)', calls, 3);
  waiting[2].rej(new Error('ESI 502'));
  const shared = await Promise.allSettled([d2, d3]);
  eq('  a failure is shared by whoever was waiting on it…', [shared.map((x) => x.status), calls], [['rejected', 'rejected'], 3]);
  const d4 = read(20418, 10000002);
  waiting[3].res();
  eq('  …and isn\'t kept: the ask after it reads again', [await d4, calls], ['10000002:20418:4', 4]);
  const marketSrc = fsR.readFileSync(new URL('../src/lib/market.ts', import.meta.url), 'utf8');
  has('  regionHistory is that shared read (market.ts can\'t load here: it reads import.meta.env)', marketSrc, 'export const regionHistory = shareInFlight(');

  eq('the bundle names every research agent\'s corporation and faction (static data, so the tab asks ESI for none)',
    [bundle.agents.filter((x) => !bundle.names?.[x.corp] || !bundle.names?.[x.faction]).length, bundle.names?.[1000020], bundle.names?.[500001]],
    [0, 'Lai Dai Corporation', 'Caldari State']);

  // The fields: the 17 that make a datacore, each with its own prerequisite beside Science V.
  eq('the fields: one for each datacore, named, each with its prerequisite (Mechanics, CPU or Power Grid Management V)',
    [Object.keys(S.FIELDS).sort(), S.FIELDS[11453].name, S.FIELDS[11453].needs, S.FIELDS[11446].needs, S.FIELDS[11449].needs],
    [Object.keys(R.DATACORE_OF).sort(), 'Electronic Engineering', 3426, 3413, 3392]);
  eq('  a datacore\'s name from its field, with CCP\'s two odd ones', [S.datacoreName(11453), S.datacoreName(11444), S.datacoreName(11450)],
    ['Datacore - Electronic Engineering', 'Datacore - Amarrian Starship Engineering', 'Datacore - Gallentean Starship Engineering']);

  // The skill gates rankAgents leaves to the page: Science V, the field's prerequisite at V, the field at the agent's level.
  eq('skill gaps for a level 2 Electronic Engineering agent: Science V and the field to II (CPU Management V is there)',
    S.skillGaps(11453, 2, { 3402: 4, 3426: 5 }), [{ id: 3402, level: 5 }, { id: 11453, level: 2 }]);
  eq('  Graviton Physics asks for Power Grid Management V; nothing lacking is an empty list; skills not read is null',
    [S.skillGaps(11446, 1, { 3402: 5 }), S.skillGaps(11446, 1, { 3402: 5, 3413: 5, 11446: 3 }), S.skillGaps(11446, 1, undefined)],
    [[{ id: 3413, level: 5 }, { id: 11446, level: 1 }], [], null]);

  // Training time at the character's attributes, prerequisites included, from the static data's ranks (no ESI read).
  const main = { intelligence: 24, memory: 24, perception: 20, willpower: 20, charisma: 23 };
  const first = S.trainingPlan(S.skillGaps(11453, 4, { 3402: 4, 3426: 5 }), { skills: { 3402: 4, 3426: 5 }, sp: { 3402: 45255 }, attrs: main, alpha: false });
  eq('the main\'s first agent: Science IV → V and the field 0 → IV at 24 / 24, about 8.4 days (the research\'s ≈ 8.5)',
    [r2(first.days), first.levels.map((x) => [x.id, x.from, x.to])], [r2((256000 - 45255) / 36 / 1440 + 226275 / 36 / 1440), [[3402, 4, 5], [11453, 0, 4]]]);
  const six = S.trainingPlan([{ id: 12179, level: 5 }], { skills: { 3402: 4 }, sp: {}, attrs: main, alpha: false });
  eq('  Research Project Management V brings its prerequisites (Laboratory Operation V, Research V), each once, in order',
    six.levels.map((x) => [x.id, x.from, x.to]), [[3406, 0, 5], [3403, 0, 5], [12179, 0, 5]]);
  eq('  points already in a level count (its floor when none are read); no attributes read is null, never 0 days',
    [r2(S.trainingPlan([{ id: 3402, level: 5 }], { skills: { 3402: 4 }, sp: { 3402: 100000 }, attrs: main, alpha: false }).days),
      r2(S.trainingPlan([{ id: 3402, level: 5 }], { skills: { 3402: 4 }, sp: {}, attrs: main, alpha: false }).days),
      S.trainingPlan([{ id: 3402, level: 5 }], { skills: { 3402: 4 }, sp: {}, attrs: undefined, alpha: false })],
    [r2(156000 / 36 / 1440), r2(210745 / 36 / 1440), null]);
  eq('  nothing to train is 0 days with no levels', S.trainingPlan([], { skills: {}, sp: {}, attrs: main, alpha: false }), { days: 0, levels: [] });

  // Ordinary agents (the way to raise standing) take the agent's, corporation's or faction's standing alone; a corporation
  // at −2 or under shuts all but level 1 (EVE University, NPC standings).
  eq('helpers: faction standing alone opens an ordinary agent, at −2 and under the corporation shuts all but level 1',
    [S.helperAccess(4, null, 5.0, null), S.helperAccess(4, null, 4.65, null), S.helperAccess(3, null, 4.65, null), S.helperAccess(2, -2.5, 4.65, null),
      S.helperAccess(1, -2.5, null, null), S.helperAccess(2, null, null, 1.2), S.helperAccess(1, null, null, null)],
    [true, false, true, false, true, true, true]);

  // The main today: Caldari State 3.63 raw (4.65 at Connections IV), Lai Dai at no standing.
  const reach = reachFrom(graph, 30000142, ['Uedama', 'Sivala']);
  const jumpsTo = (s) => reach.high.get(s) ?? null;
  const mainStandings = [{ id: 500001, type: 'faction', standing: 3.63 }];
  const corps = S.corpReach(bundle.agents, bundle.helpers, { standings: mainStandings, connections: 4, diplomacy: 0, jumpsTo });
  const laiDai = corps.find((x) => x.corp === 1000020);
  eq('step 2 for the main: Lai Dai at no standing, Caldari State 4.65, level 2 open, level 3 next (Lai Dai 1.00 with the faction at 3.00, or Lai Dai 3.00)',
    [laiDai.corpEff, r2(laiDai.factionEff), laiDai.open, laiDai.next], [null, 4.65, 2, { level: 3, corp: 3, viaFaction: { faction: 3, corp: 1 } }]);
  eq('  Caldari corporations first (their faction is the one with standing), each with its R&D agents counted by level',
    [corps.slice(0, 3).map((x) => x.faction), laiDai.byLevel], [[500001, 500001, 500001], { 1: 8, 2: 6, 3: 10, 4: 6 }]);
  const usable = laiDai.helpers.map((h) => h.name);
  eq('  its helpers usable now include Ehu Vantoh (level 3 security, Isaziwa, 5 jumps) and not its level 4s (Caldari State short of 5.00)',
    [usable.includes('Ehu Vantoh'), laiDai.helpers.find((h) => h.name === 'Ehu Vantoh')?.jumps, laiDai.helpers.some((h) => h.level === 4)], [true, 5, false]);
  eq('  ordered best level first, then nearest', laiDai.helpers.every((h, i, xs) => i === 0 || xs[i - 1].level > h.level || (xs[i - 1].level === h.level && (xs[i - 1].jumps ?? 1e9) <= (h.jumps ?? 1e9))), true);
  eq('  the highest level open anywhere is what\'s offered as the start: 2 for the main; 1 for an alt with nothing read',
    [S.startLevel(corps), S.startLevel(S.corpReach(bundle.agents, bundle.helpers, { standings: null, connections: 0, diplomacy: 0, jumpsTo }))], [2, 1]);

  // What step 3 lists: open, or one level past what the agent's corporation opens.
  const ranked = R.rankAgents(bundle.agents, { skills: { 3402: 5, 3426: 5, 11453: 4 }, standings: mainStandings, connections: 4, diplomacy: 0, negotiation: 4,
    netPerDatacore: { 20418: 79_571 }, jumpsTo });
  const listed = S.listedAgents(ranked, corps);
  const lvl = (corp, level) => listed.filter((x) => x.agent.corp === corp && x.agent.level === level).length > 0;
  eq('step 3 lists what opens now and one level past it: Lai Dai\'s level 2 and 3, not its 4; another empire\'s level 1 and 2, not 3',
    [lvl(1000020, 2), lvl(1000020, 3), lvl(1000020, 4), lvl(1000056, 1), lvl(1000056, 2), lvl(1000056, 3)], [true, true, false, true, true, false]);

  // The pick: the best-ranked agent and field the character can reach, the nearest of equals, one on a high-sec route first.
  const pick = S.pickDefault(ranked);
  eq('the main\'s default pick: a Lai Dai level 2 agent in Electronic Engineering, the nearer of two (Shitsu Ashoma, Friggi, 8 jumps), 50.4 RP a day',
    [pick.agent.name, pick.agent.corp, pick.agent.level, pick.field, pick.jumps, r2(pick.rpDay)], ['Shitsu Ashoma', 1000020, 2, 11453, 8, 50.4]);
  const row = (id, open, iskDay, rpDay, jumps) => ({ agent: { id, level: 2 }, field: 11453, datacore: 20418, open, rpDay, iskDay, jumps });
  eq('  and step 3\'s table starts with it: equal pay sorted nearest first, one off a high-sec route last (rankAgents ties by agent ID)',
    [listed.filter((r) => r.jumps != null)[0] === pick, listed.slice(0, 5).map((r) => [r.agent.name, r.jumps])],
    [true, [['Shitsu Ashoma', 8], ['Okila Tsurvalen', 9], ['Orulen Arala', 37], ['Versanen Osoni', null], ['Paara Nikkaken', null]]]);
  eq('  a closed agent is never the pick, however it pays; one off a high-sec route only when nothing else is open',
    [S.pickDefault([row(1, false, 9e5, 90, 1), row(2, true, 1e5, 50, null), row(3, true, 5e4, 40, 12)])?.agent.id,
      S.pickDefault([row(1, false, 9e5, 90, 1), row(2, true, 1e5, 50, null)])?.agent.id, S.pickDefault([row(1, false, 9e5, 90, 1)])], [3, 2, null]);
  eq('  priced beats unpriced; with nothing priced, the most RP a day', [S.pickDefault([row(1, true, null, 90, 2), row(2, true, 10, 20, 9)])?.agent.id,
    S.pickDefault([row(1, true, null, 20, 2), row(2, true, null, 50, 9)])?.agent.id], [2, 2]);

  eq('six agents: distinct, open, on a high-sec route and priced, in the ranking\'s order; fewer when fewer are',
    S.bestAgents([row(1, true, 100, 50, 3), row(1, true, 90, 50, 3), row(2, true, 80, 50, null), row(3, false, 70, 50, 2), row(4, true, 60, 50, 4), row(5, true, null, 50, 5)]).map((r) => r.agent.id), [1, 4]);
  eq('  at most six', S.bestAgents(Array.from({ length: 9 }, (_, i) => row(i + 1, true, 100 - i, 50, 1))).length, 6);

  // A field's year from The Forge's history: now (30 days, volume-weighted), a year ago, and units a day.
  const T0 = Date.parse('2026-10-03T12:00:00Z');
  const day = (n) => new Date(T0 - n * DAY).toISOString().slice(0, 10);
  const hist = [...Array.from({ length: 30 }, (_, i) => ({ date: day(i + 1), average: 100, highest: 101, lowest: 99, volume: 10, order_count: 5 })),
    { date: day(360), average: 80, highest: 81, lowest: 79, volume: 5, order_count: 2 }, { date: day(370), average: 70, highest: 71, lowest: 69, volume: 5, order_count: 2 }].reverse();
  const yr = S.fieldYear(hist, T0);
  eq('a field\'s year: now 100 over 30 days, a year ago 75 (volume-weighted, 335–395 days back), +33%, 10 a day',
    [yr.price, yr.yearAgo, r2(yr.change), yr.perDay], [100, 75, 0.33, 10]);
  eq('  no history: nothing to say, never zeros', S.fieldYear([], T0), { price: null, yearAgo: null, change: null, perDay: null, months: [] });
}

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
