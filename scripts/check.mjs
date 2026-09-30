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
import { isWall, paceDay } from '../src/lib/prospects.ts';
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
  // Starting a plan: the game can't place several buy orders at once, so a plan is positions plus a checklist.
  const { newPlan, placedOrder, planProgress, sanitizePlans } = await import('../src/lib/plans.ts');
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
  eq('plans from disk: malformed ones are dropped', sanitizePlans([tp, { id: 'x' }, null, { ...tp, id: 'p2', items: [{ typeId: 'no' }] }]).map((p) => p.id), ['p1']);
  const e = { item: { key: 'plan:p1:35' }, seenAt: Date.parse(at), lastAt: Date.parse(at) };
  eq('To do: a plan’s order ticks off once placed, waits while not, and goes when the plan does',
    [judgePlaceBuy(e, { plan: true, placed: { units: 50_000, price: 7 } }), judgePlaceBuy(e, { plan: true, placed: null }), judgePlaceBuy(e, { plan: false, placed: null })],
    ['Placed: 50,000 at 7.', null, false]);
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
  eq('  never in place of a processor rig, and not past 400 calibration (300 + 250)', mercoxitTier(hulk, rigCost, 400, true).rig, { added: false, why: 'noRoom' });
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
  eq('Multibuy: the hull, every item once with its count, crystals loaded and spare together', fitMultibuy('Hulk', t, c).text.split('\n'), ['Hulk 1', 'Modulated Strip Miner II 2', 'Mining Survey Chipset II 1', 'Mining Laser Upgrade II 3', 'Medium Core Defense Field Extender II 1', 'Mining Drone II 5', `${c} 4`]);
  const ids = { 'Modulated Strip Miner II': 17912, 'Mining Survey Chipset II': 2333, 'Mining Laser Upgrade II': 28576, 'Medium Core Defense Field Extender II': 31794, 'Mining Drone II': 10250, [c]: 60283 };
  const body = fittingBody(22544, 'Hulk', 'Solid', t, c, (n) => ids[n] ?? null);
  eq('a saved fitting: each module its own slot, drones in the bay, crystals in the cargo', body.items.map((i) => `${i.flag}:${i.type_id}x${i.quantity}`), ['HiSlot0:17912x1', 'HiSlot1:17912x1', 'MedSlot0:2333x1', 'LoSlot0:28576x1', 'LoSlot1:28576x1', 'LoSlot2:28576x1', 'RigSlot0:31794x1', 'DroneBay:10250x5', 'Cargo:60283x4']);
  eq('  and none while a name is unresolved', fittingBody(22544, 'Hulk', 'Solid', t, c, (n) => (n === c ? null : ids[n])), null);
  const burst = { ...t, high: [{ name: 'Mining Foreman Burst II', charge: 'Mining Laser Optimization Charge' }], crystal: undefined };
  eq('a burst carries its charge: in the EFT line, and bought with it', [eftText('Porpoise', 'x', burst, null).includes('Mining Foreman Burst II, Mining Laser Optimization Charge'), fitMultibuy('Porpoise', burst, null).text.includes('Mining Laser Optimization Charge 1')], [true, true]);
  eq('every hull but the Rorqual and Perseverance has three tiers, and every one is on the tree', [HULLS.filter((h) => !MASTERY[h.id]).map((h) => h.name), Object.values(MASTERY).every((x) => x.map((y) => y.key).join() === 'start,solid,max'), Object.keys(MASTERY).every((id) => HULLS.some((h) => h.id === Number(id)))], [['Rorqual', 'Perseverance'], true, true]);
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
  eq('Prospects prices the scoop’s buy where trading reached, not one step over the best bid', [scoop.top, scoop.buy, scoop.bidReach, scoop.raised], [101.7 * M, 104.9 * M, 1, true]);
  const busy = bidToPlace(100, [99, 98, 100, 97, 99, 98, 99, 100, 98, 97, 99, 98, 99, 98]);
  eq('  a bid trading reaches every day stays one step over the best', [busy.buy, busy.raised], [100.1, false]);
  eq('  without the lows, nothing is claimed', bidToPlace(100, undefined), { top: 100.1, buy: 100.1, bidReach: null, raised: false });

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
  const { jobLedgers, rewardJob } = await import('../src/lib/freelance.ts');
  // The user's Scordite job (29 September 2026): 38,132,412 bought at 11.76–11.79, then 813,258 at 21.96 by mistake and
  // relisted; three rewards so far.
  const id = 'b11ad07b-2c43-4136-8be1-fa88aedae466';
  const job = { id, name: 'ISK Scordite best ISK for delivery', state: 'Active', standing: 'Committed', perUnit: 17, perPlayer: null, types: [92374, 1228], created: '2026-09-14T00:00:00Z', expires: null, delivered: 0 };
  const reason = `project_id=${id}:project_name=ISK Scordite best ISK for delivery`;
  eq('a reward names its job', rewardJob(reason), id);
  const J = (amount) => ({ date: '2026-09-29T11:40:00Z', refType: 'freelance_jobs_reward', amount, reason });
  const T = (tid, qty, unitPrice, isBuy = true, typeId = 92374) => ({ id: tid, typeId, date: '2026-09-29T11:30:00Z', isBuy, qty, unitPrice });
  const l = jobLedgers([job], [J(231057235.19), J(255106158.37), J(90780000), { date: 'x', refType: 'bounty_prizes', amount: 5, reason }],
    [T('a', 4909800, 11.76), T('b', 361663, 11.77), T('c', 32860949, 11.79), T('d', 813258, 21.96), T('p', 5, 1, true, 34), T('x', 99, 1)], new Set(['x'])).get(id);
  const { isFreelanceTrade } = await import('../src/lib/freelance.ts');
  eq('a freelance trade: an item a joined job takes, after it began', [isFreelanceTrade([{ types: [92374], created: '2026-09-14T00:00:00Z' }], { typeId: 92374, date: '2026-09-29T11:21:34Z' }),
    isFreelanceTrade([{ types: [92374], created: '2026-09-30T00:00:00Z' }], { typeId: 92374, date: '2026-09-29T11:21:34Z' }), isFreelanceTrade([{ types: [92374], created: null }], { typeId: 34, date: 'x' })], [true, false, false]);
  eq('its rewards, payments, what its items cost, delivered at its rate', [Math.round(l.rewards), l.payments, l.bought, Math.round(l.cost), l.delivered], [576943394, 3, 38945670, Math.round(4909800 * 11.76 + 361663 * 11.77 + 32860949 * 11.79 + 813258 * 21.96), 33937847]);
  const avg = l.cost / l.bought;
  eq('  profit on what’s delivered, and what’s bought and not yet delivered at average cost', [Math.round(l.profit), l.heldUnits, Math.round(l.heldCost)], [Math.round(576943393.56 - avg * 33937847), 38945670 - 33937847, Math.round((38945670 - 33937847) * avg)]);
  const { categoryOf, flows } = await import('../src/lib/wallet.ts');
  const { attribute } = await import('../src/lib/results.ts');
  eq('the Wallet: a reward is Freelance rewards, not Other income', categoryOf({ refType: 'freelance_jobs_reward', amount: 1 }).label, 'Freelance rewards');
  const fl = flows([], [T('a', 100, 12)], () => ({ tracked: false, tag: 'other', freelance: true }), 0);
  eq('  and the items bought for it are their own line, not Other purchases', fl.outs.map((l) => [l.key, Math.round(l.amount)]), [['freelanceBuys', 1200]]);
  const ev = attribute({ txs: [T('a', 100, 12)], journal: [J(1700)], tracked: new Set(), realized: [], losses: [], sets: { filaments: new Set(), abyssLoot: new Set(), pi: new Set(), lpGoods: new Set() }, freelance: () => true, salesTax: 0.03 });
  eq('Results: Freelance is the rewards less what the items cost', ev.map((e) => [e.activity, Math.round(e.isk)]), [['Freelance', -1200], ['Freelance', 1700]]);
  eq('  a trade before the job began, or tagged Personal, isn’t its', jobLedgers([{ ...job, created: '2026-09-30T00:00:00Z' }], [], [T('a', 10, 11)], new Set()).get(id).bought, 0);
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
  eq('without highs nothing is claimed', askToPlace(100, null), { top: 99.99, sell: 99.99, askReach: null, lowered: false });
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

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
