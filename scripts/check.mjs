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
import { check, byUrgency as bySkillUrgency, readiness, injectorYield, SP_FLOOR, skillsOf, trainedOptions, HAULING_SKILLS } from '../src/lib/skills.ts';
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
  eq('  and a sell order is never judged this way', F.fillingNow({ ...dc, isBuy: false }, 1, [], at27), false);
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
eq('mail starts off', sanitizeAlerts({}).mail, false);
eq('  and by mail only what you can act on in game, plus the cloud’s trades worth a look', Object.entries(sanitizeAlerts({}).mailEv).filter(([, v]) => v).map(([k]) => k), ['move', 'pi', 'opportunity']);
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
  eq('  the item name opens its market, through the app', one.body.includes('<a href="https://x.test/jita-ledger/#orders?market=2185">Hammerhead II</a> sell order beaten'), true);
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
  eq('  but its market still gets a line of its own', oddBody.includes('<a href="u/#orders?market=5">Open its market in game</a>'), true);
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
  eq('  the name is still the market link', rich.body.includes('<a href="u/#orders?market=2185">Hammerhead II</a>'), true);
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
  const quietDay = { h: 30, sell: 0, buy: 400, newSell: 0, newBuy: 0 };
  const book = [{ id: 1, isBuy: false, price: 6000, volume: 500 }, { id: 9, isBuy: true, price: 5000, volume: 200 }, { id: 8, isBuy: true, price: 4000, volume: 1000 }];
  const x = { gone: false, price: 6000, volumeRemain: 500, aheadUnits: 0 };
  const loot = sellIntoBid({ isBuy: false }, x, { book, watched: quietDay }, 0.03);
  eq('500 units nobody bought from listings in 30 h: sell into the bids', loot != null && loot.daysToSell > LISTING_DAYS, true);
  eq('  the bids pay after tax only, walking down the book', Math.round(loot.proceeds), Math.round((200 * 5000 + 300 * 4000) * 0.97));
  eq('  not before a day of watching', sellIntoBid({ isBuy: false }, x, { book, watched: { ...quietDay, h: 10 } }, 0.03), null);
  eq('  not when your own listing has sold since its price was set', sellIntoBid({ isBuy: false, seen: [{ price: 6000, remain: 510 }] }, x, { book, watched: quietDay }, 0.03), null);
  eq('  not for a few units that sell within the month', sellIntoBid({ isBuy: false }, { ...x, volumeRemain: 3 }, { book, watched: quietDay }, 0.03), null);
  eq('  not when buyers do take listings', sellIntoBid({ isBuy: false }, x, { book, watched: { ...quietDay, sell: 400 } }, 0.03), null);
  eq('  never below what the stock cost', sellIntoBid({ isBuy: false }, x, { book, watched: quietDay, avgCost: 5500 }, 0.03), null);
  eq('  never for a buy order', sellIntoBid({ isBuy: true }, x, { book, watched: quietDay }, 0.03), null);
  const o = { orderId: 1, typeId: 34, isBuy: false, price: 6000, volumeRemain: 500, locationId: 60003760 };
  const v = judge(o, { book, perDay: 1, lows: null, txs: [], watched: quietDay }, DEFAULT_SETTINGS, Date.parse('2026-09-28T12:00:00Z'));
  eq('the Orders verdict is "sell to bids", saying why in one sentence', [v.verdict, v.why.startsWith('Buyers barely take listings here: nobody bought from listings in the 30 h watched')], ['bid', true]);
  eq('  it replaces the move on the same order, and sorts among other orders’ moves by ISK at stake', [v, { ...v, verdict: 'move', atRisk: v.atRisk * 2 }].sort(urgency)[0].verdict, 'move');
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

console.log(failed ? `\n${failed} FAILURES` : '\nall passed');
process.exit(failed ? 1 : 0);
