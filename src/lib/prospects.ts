import type { BookLevel, HistRow, ProspectFilters, ProspectStats, ProspectWarning, RoundTrip, SellsTo } from './types';
import { buyerShare, dayCount, listingShareSaid, LONG_QUEUE_DAYS, NOBODY_BUYS, perDaySaid, queueLengthSaid, queuePaceSaid, type SellQueue } from './split';
import { askBothWindows, askReachDays, bidBothWindows, bidReachDays, FILL_RARE, FILL_TYPICAL, FILL_WINDOW, reachedAsk, recentAskReach, recentBidReach, recentRange, RECENT_MIN } from './fills';
import { tickDown, tickUp } from './tick';
import { isk, pct, units } from './format';

const DAY = 86400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const startOf = (t: number) => Date.parse(dayKey(t) + 'T00:00:00Z');

/** Middle value, or the mean of the middle two. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Average units a day and volume-weighted price over the last `days` calendar days of history.
 *
 * ESI leaves out days with no trades, so dividing by the rows present would spread seven trading days
 * from the last two months over one week and overstate a thin item's pace many times over. The
 * divisor is the number of days in the window. The window ends on the latest day ESI has published
 * when the item traded then (history runs a day behind, sometimes two before the daily update), and on
 * yesterday otherwise. No history at all is null, not zero: we don't know.
 */
export function recentAverages(rows: HistRow[], days = 7, now = Date.now()): { avgVol: number | null; avgPrice: number | null } {
  if (!rows.length) return { avgVol: null, avgPrice: null };
  const today = startOf(now);
  const last = Date.parse(rows[rows.length - 1].date + 'T00:00:00Z');
  const end = last >= today - 2 * DAY && last < today ? last : today - DAY;
  const from = end - (days - 1) * DAY;
  const recent = rows.filter((r) => { const t = Date.parse(r.date + 'T00:00:00Z'); return t >= from && t <= end; });
  const vol = recent.reduce((s, r) => s + r.volume, 0);
  const val = recent.reduce((s, r) => s + r.volume * r.average, 0);
  return { avgVol: vol / days, avgPrice: vol > 0 ? val / vol : null };
}

/**
 * Units a typical day trades: the median over the last `days` calendar days, days with no trades
 * counting as zero. Unlike an average, one enormous day (often your own buying) can't inflate it.
 */
export function typicalDailyVolume(rows: HistRow[], days = 14, now = Date.now()): number | null {
  if (!rows.length) return null;
  const today = startOf(now);
  const last = Date.parse(rows[rows.length - 1].date + 'T00:00:00Z');
  const end = last >= today - 2 * DAY && last < today ? last : today - DAY;
  const byDay = new Map(rows.map((r) => [r.date, r.volume]));
  const vols: number[] = [];
  for (let i = 0; i < days; i++) vols.push(byDay.get(dayKey(end - i * DAY)) ?? 0);
  return median(vols);
}

/**
 * Units a day to expect when judging how fast something sells: the typical day (median of 14), which
 * against the Jita books was closer than the week's average (a median 0.82 of what traded, against 0.6).
 * But an item that trades on fewer than half its days has a median of zero, and it does sell: then the
 * 14-day average over calendar days stands in.
 */
export function paceDay(rows: HistRow[], now = Date.now()): number | null {
  const typical = typicalDailyVolume(rows, 14, now);
  if (typical == null) return null;
  return typical > 0 ? typical : recentAverages(rows, 14, now).avgVol;
}

/**
 * Reduce ESI's daily history to the handful of numbers a screener needs.
 *
 * The window is the 30 complete days ending yesterday: today's history is still filling and
 * ESI runs about a day behind. ESI leaves days with no trades out of the response entirely,
 * so a gap is not missing data — it is a day nothing sold, which is exactly what we came to
 * measure. Returns null when nothing traded in the window, the honest answer for a dead item.
 */
export function statsFrom(typeId: number, rows: HistRow[], now = Date.now()): ProspectStats | null {
  const end = startOf(now - DAY);
  const within = (r: HistRow, days: number) => {
    const t = Date.parse(r.date + 'T00:00:00Z');
    return t >= end - (days - 1) * DAY && t <= end;
  };

  const w30 = rows.filter((r) => within(r, 30));
  if (!w30.length) return null;
  const w90 = rows.filter((r) => within(r, 90));

  const vols = w30.map((r) => r.volume);
  const total = vols.reduce((a, b) => a + b, 0);
  const avg30 = w30.reduce((s, r) => s + r.average, 0) / w30.length;
  const avg90 = w90.length ? w90.reduce((s, r) => s + r.average, 0) / w90.length : avg30;

  const byDay = new Map(w30.map((r) => [r.date, r.volume]));
  const spark: number[] = [];
  for (let i = 29; i >= 0; i--) spark.push(byDay.get(dayKey(end - i * DAY)) ?? 0);

  const unitsPerDay = median(vols);
  // The last week of the window, oldest first, for the margin line and the spike check.
  const recent = [...w30].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  const usualPrice = median(w30.map((r) => r.average));
  const spike = recent.some((r) =>
    unitsPerDay > 0 && r.volume > SPIKE_VOLUME * unitsPerDay &&
    usualPrice > 0 && Math.abs(r.average / usualPrice - 1) > SPIKE_PRICE);

  const lows = recentRange(rows, 14, now);
  // The latest day's average against the median of the days before it: a price level that has just shifted,
  // which makes a spread between the old level and the new one look like margin.
  const sorted = [...w30].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const before = sorted.slice(-14, -1).map((r) => r.average);
  const usualBefore = before.length >= 5 ? median(before) : 0;
  const lastMove = latest && within(latest, 3) && usualBefore > 0 ? latest.average / usualBefore - 1 : 0;
  // The last few days against the month before them: a climb over several days, which `lastMove` (the latest day
  // alone against the fortnight, which the climb is already part of) misses. Volume-weighted over the days, against
  // the median day's average over the RUN_UP_BEFORE days before them. 0, never absent, when it can't be said.
  const latestT = latest ? Date.parse(latest.date + 'T00:00:00Z') : NaN;
  const ago = (r: HistRow) => (latestT - Date.parse(r.date + 'T00:00:00Z')) / DAY;
  const lastDays = rows.filter((r) => ago(r) >= 0 && ago(r) < RUN_UP_DAYS);
  const monthBefore = rows.filter((r) => ago(r) >= RUN_UP_DAYS && ago(r) < RUN_UP_DAYS + RUN_UP_BEFORE).map((r) => r.average);
  const runUpBase = monthBefore.length >= 5 ? median(monthBefore) : 0;
  const lastVol = lastDays.reduce((t, r) => t + r.volume, 0);
  const lastAvg = lastVol > 0 ? lastDays.reduce((t, r) => t + r.volume * r.average, 0) / lastVol : 0;
  const runUp = latest && within(latest, 3) && runUpBase > 0 && lastAvg > 0 ? lastAvg / runUpBase - 1 : 0;
  return {
    typeId,
    at: new Date(now).toISOString(),
    daysTraded: Math.min(30, w30.length),
    tradesPerDay: median(w30.map((r) => r.order_count)),
    unitsPerDay,
    spikiness: total > 0 ? Math.max(...vols) / total : 1,
    dailyRange: median(w30.map((r) => (r.average > 0 ? (r.highest - r.lowest) / r.average : 0))),
    trend: avg90 > 0 ? avg30 / avg90 - 1 : 0,
    avgPrice: avg30,
    spark,
    buyerShare: buyerShare(w30),
    high30: Math.max(...w30.map((r) => r.highest)),
    spike,
    range7: recent.map((r) => (r.average > 0 ? (r.highest - r.lowest) / r.average : 0)),
    lows14: lows.lows,
    lowsEnd: lows.end,
    highs14: lows.highs,
    lastMove,
    runUp,
    runUpBase,
    ...roundTripCounts(rows, lows.end),
  };
}

/**
 * The horizons Place and leave's round trips are counted within, in whole days. A horizon of a day or less counts the same
 * day: history is daily, so a day that reached both the bid and the sale is the nearest it can say to "within 12 hours".
 */
export const ROUND_TRIP_DAYS = [1, 3, 7, 14, 30];
/** Start days looked back over: the plans review's backtest (9 October 2026), two months before the plan. */
export const ROUND_TRIP_STARTS = 60;
/**
 * Fewer start days than this priced, no rate is said and the planner leaves the item out of Place and leave: a rate from a
 * handful of days is mostly noise, and stood in as 0% or 100% it would rank the item for no reason. A third of the 60.
 */
export const ROUND_TRIP_MIN = 20;

/** Days of history a count looks at: the start days, the fortnight before the oldest, and one more where it ends two days back. */
const ROUND_TRIP_SPAN = ROUND_TRIP_STARTS + FILL_WINDOW + 1;
const kthBuf = new Float64Array(FILL_WINDOW);
/** The k-th lowest (or highest) of the FILL_WINDOW days from `from` that traded (`NaN` didn't); null when fewer traded. */
function kthOf(xs: Float64Array, from: number, k: number, desc: boolean): number | null {
  let n = 0;
  for (let i = from; i < from + FILL_WINDOW; i++) {
    const v = xs[i];
    if (v !== v) continue;
    let j = n++;
    while (j > 0 && (desc ? kthBuf[j - 1] < v : kthBuf[j - 1] > v)) { kthBuf[j] = kthBuf[j - 1]; j--; }
    kthBuf[j] = v;
  }
  return n >= k ? kthBuf[k - 1] : null;
}

/**
 * Place and leave's own pricing re-run on each of the last ROUND_TRIP_STARTS days to `end` (the day the item's 14 days end
 * on, `recentRange`'s), and how often it came round: on each start day, the bid it would have placed that morning
 * (`reachedBid` of the 14 days before, as `recentRange` ends them) reached by a day's low, and then (that day or later) its
 * sale (`reachedAsk`) by a day's high, within each of ROUND_TRIP_DAYS. A start day is counted for a horizon only when the
 * whole horizon has happened; one whose fortnight can't price both sides, or prices the sale at or under the bid, isn't.
 *
 * The plans review's backtest (`.playwright-mcp/research/plans-review/backtest.mjs`) is the reference, matched start day for
 * start day on the 2 October plan's 33 items. The 2 October plan (12-hour horizon) expected +67.6 M within 12 hours, the
 * planner taking each side as reached on half the days; re-run this way on each item's 60 days before the plan, its prices
 * round-tripped within a day on a median 7% of start days, 3 days 21%, 7 days 39%, and 6 of the 33 did within 7 days in
 * fact. One pass over the history a start day, about 0.2 ms an item, so the cloud's daily scan of ~15,000 items can afford it.
 */
export function roundTripCounts(rows: Pick<HistRow, 'date' | 'lowest' | 'highest'>[], end: string): { roundTrip: number[]; roundTripOf: number[] } {
  const e = Date.parse(end + 'T00:00:00Z');
  const lo = new Float64Array(ROUND_TRIP_SPAN).fill(NaN), hi = new Float64Array(ROUND_TRIP_SPAN).fill(NaN);
  const first = dayKey(e - (ROUND_TRIP_SPAN - 1) * DAY);
  // Indexed by days before `end`.
  for (const r of rows) {
    if (r.date < first || r.date > end) continue;
    const d = Math.round((e - Date.parse(r.date + 'T00:00:00Z')) / DAY);
    lo[d] = r.lowest; hi[d] = r.highest;
  }
  const trips = ROUND_TRIP_DAYS.map(() => 0), of = ROUND_TRIP_DAYS.map(() => 0);
  const longest = ROUND_TRIP_DAYS[ROUND_TRIP_DAYS.length - 1];
  for (let s = ROUND_TRIP_STARTS - 1; s >= 0; s--) {
    // The fortnight that morning, as recentRange ends it: on the day before, or two days before when only that one traded
    // (history running behind), else the day before.
    const w = lo[s + 1] === lo[s + 1] ? s + 1 : lo[s + 2] === lo[s + 2] ? s + 2 : s + 1;
    const bid = kthOf(lo, w, FILL_TYPICAL, false), ask = kthOf(hi, w, FILL_TYPICAL, true);
    if (bid == null || ask == null || ask <= bid) continue;
    // The day, counted from the start day, the sale was reached after the bid; -1 when it wasn't by `end`.
    let filled = false, trip = -1;
    for (let i = 0, last = Math.min(longest - 1, s); i <= last; i++) {
      if (!filled && lo[s - i] <= bid) filled = true;
      if (filled && hi[s - i] >= ask) { trip = i; break; }
    }
    for (let h = 0; h < ROUND_TRIP_DAYS.length && s >= ROUND_TRIP_DAYS[h] - 1; h++) {
      of[h]++;
      if (trip >= 0 && trip < ROUND_TRIP_DAYS[h]) trips[h]++;
    }
  }
  return { roundTrip: trips, roundTripOf: of };
}

/**
 * Which of ROUND_TRIP_DAYS a horizon is counted within: the longest not past it (a horizon under a day is the same day), so a
 * horizon between two is never credited with the longer one's round trips. None ("any") is the longest.
 */
export function roundTripIndex(horizonDays: number | null | undefined): number {
  const last = ROUND_TRIP_DAYS.length - 1;
  if (horizonDays == null || !Number.isFinite(horizonDays)) return last;
  let i = 0;
  while (i < last && ROUND_TRIP_DAYS[i + 1] <= horizonDays + 1e-9) i++;
  return i;
}

/** How often Place and leave's prices round-tripped within a horizon, from the stats' counts. See `RoundTrip`. */
export function roundTripRate(s: Pick<ProspectStats, 'roundTrip' | 'roundTripOf'>, horizonDays: number | null | undefined): RoundTrip {
  const i = roundTripIndex(horizonDays);
  const days = ROUND_TRIP_DAYS[i];
  const trips = s.roundTrip?.[i], of = s.roundTripOf?.[i];
  if (typeof trips !== 'number' || typeof of !== 'number' || !Number.isFinite(trips) || !Number.isFinite(of)) return { days, sameDay: days === 1, trips: null, of: null, rate: null };
  return { days, sameDay: days === 1, trips, of, rate: of >= ROUND_TRIP_MIN ? trips / of : null };
}

/** "within 12 h", "within a day", "within 7 days": the horizon a round trip was counted within, as the plan's words have it. */
export const roundTripWithin = (days: number, horizonDays: number | null | undefined) => `within ${horizonDays != null && horizonDays < 1 ? horizonShort(horizonDays) : horizonSaid(days)}`;
const withinSaid = (t: RoundTrip, horizonDays: number | null | undefined) => roundTripWithin(t.days, horizonDays);

/** One line: "Round trip within 12 h on 7% of past days", or why it can't be said. */
export function roundTripSaid(t: RoundTrip, horizonDays: number | null | undefined): string {
  if (t.of == null) return 'Round trips not measured: these prices predate it, so scan again';
  if (t.rate == null) return `Too little history to say how often it round-trips: ${units(t.of)} of the last ${ROUND_TRIP_STARTS} days could be priced`;
  return `Round trip ${withinSaid(t, horizonDays)} on ${pct(t.rate, 0)} of past days`;
}

/** A tip laid out (tipText.ts): the line, then how it's counted, then what the plan does with it. */
export function roundTripTip(t: RoundTrip, horizonDays: number | null | undefined): string {
  const within = withinSaid(t, horizonDays);
  return [
    t.rate != null && t.trips != null && t.of != null ? `${roundTripSaid(t, horizonDays)}: ${units(t.trips)} of the last ${units(t.of)} days.` : `${roundTripSaid(t, horizonDays)}.`,
    [
      `• Each of the last ${ROUND_TRIP_STARTS} days, Place and leave’s prices as it would have set them that morning, from the 14 days before.`,
      `• A round trip: the bid reached (the day’s low at or under it), then the sale (a day’s high at or over it), ${within}.`,
      ...(t.sameDay ? [`• History is daily, so ${within} counts a day that reached both: the nearest it can say.`] : []),
      '• A day whose 14 days before couldn’t price both sides isn’t counted.',
    ].join('\n'),
    'The plan expects what a round trip makes times this: ISK a day and the return a day are scaled by it, the margin isn’t.',
  ].join('\n\n');
}

/**
 * The latest day's average this far from the days before it, up or down, and the price has moved rather than
 * wobbled. True Sansha EM Armor Hardener went from about 3.6 M to 7.5 M; the scan showed a 59% flip buying at the
 * old level and selling at the new, with both prices "reached" on days that traded from 3 M to 9 M.
 */
export const MOVED = 0.5;

/**
 * The last RUN_UP_DAYS days' average this far over the median day of the RUN_UP_BEFORE days before them: the price
 * has run up, and a spread priced off the climb is gone when it falls back. The Vigilance Resonance Key traded about
 * 21-23 M through August and early September, then 28 M, then 36-45 M from 24 September: the user's first plan put
 * 40% of its ISK in at 24.96 M to sell at 35.99 M, an ask reached only on the climb's days. By 1 October the best ask
 * was 29.93 M. `lastMove` (the latest day alone) read +28% that morning, under MOVED. Upward only: a fall is caught by
 * the ask's recent reach (askToPlace).
 */
export const RUN_UP = 0.5;
/**
 * Place and leave's bar for the same run-up: its orders sit behind the front for weeks, priced where trading reached on
 * half the fortnight, so the climb's own days set its ask. The Vigilance Resonance Key on the cloud's 1 October 2026 scan
 * was +40% (ESI's last 3 days, 28-30 September, averaged 31.98 M against a month's median day of 22.89 M): under RUN_UP,
 * and Place and leave priced its sell at 36.82 M from the climb's days, behind 109 listed units at ~9 a day. At the
 * front, only RUN_UP flags it.
 */
export const RUN_UP_PATIENT = 0.3;
/** The run-up bar that applies: Place and leave's, or the front's. */
export const runUpBar = (patient?: boolean) => (patient ? RUN_UP_PATIENT : RUN_UP);
export const RUN_UP_DAYS = 3;
export const RUN_UP_BEFORE = 30;

/** A day counts as a spike when it trades this many times the usual volume... */
export const SPIKE_VOLUME = 5;
/** ...at an average this far from the usual price. Volume alone is just a busy day. */
export const SPIKE_PRICE = 0.1;
/** A best bid this far above the highest trade of the month is bait, not a market. */
export const ESCROW_OVER = 0.1;
/** The best price holding more than this share of the stock visible on its side... */
export const WALL_SHARE = 0.5;
/** ...and more than this many days of the item's whole daily volume, is a wall. */
export const WALL_DAYS = 3;

/**
 * Page 1 plus distinct random others. Page 1 is always in, because it has to be fetched
 * anyway to learn how many pages there are.
 */
export function pickPages(total: number, want: number, rnd: () => number = Math.random): number[] {
  const pool = Array.from({ length: Math.max(0, total - 1) }, (_, i) => i + 2);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [1, ...pool.slice(0, Math.max(0, Math.min(want, total) - 1))];
}

/** When a quick and a deep scan last ran to the end. */
export type ScanRuns = { quick?: string; deep?: string; /** The cloud's daily full-market scan. */ cloud?: string };
/** Scan data older than this is a bit stale: prices and volumes have moved. */
export const SCAN_STALE_HOURS = 6;
/** Older than this, it's old: trading history refreshes daily. */
export const SCAN_OLD_HOURS = 24;
/** A deep scan older than this, or none at all, is worth running again: it checks every candidate. */
export const DEEP_STALE_DAYS = 7;
/**
 * The cloud's full-market scan runs once a day, after the day's history, and the five-minute watch keeps its best
 * candidates' prices live between runs, so it's fresh for a day and a bit (a scan finishing late, a missed day).
 */
export const CLOUD_FRESH_HOURS = 30;

export type ScanFreshness = {
  level: 'none' | 'fresh' | 'stale' | 'old';
  /** When the data was last refreshed by a finished scan, or by the last pricing for a scan from before this was kept. */
  last: string | null;
  lastDepth: 'quick' | 'deep' | 'cloud' | null;
  deepAt: string | null;
  deepStale: boolean;
};

/**
 * How current the Prospects data is, for the pages that work from it (the planner, hub arbitrage, Reprocessing's scanner). `fallback` is the newest price in the cache, for a scan run before
 * finishing times were kept: better than calling it "never".
 */
export function scanFreshness(runs: ScanRuns | undefined, fallback: string | null, now = Date.now()): ScanFreshness {
  const finished = [runs?.quick, runs?.deep, runs?.cloud].filter((x): x is string => !!x).sort();
  const last = finished.pop() ?? fallback ?? null;
  const hours = last ? (now - Date.parse(last)) / 3600_000 : null;
  const cloud = !!last && last === runs?.cloud;
  const [fresh, old] = cloud ? [CLOUD_FRESH_HOURS, CLOUD_FRESH_HOURS + SCAN_OLD_HOURS] : [SCAN_STALE_HOURS, SCAN_OLD_HOURS];
  const level = hours == null ? 'none' : hours < fresh ? 'fresh' : hours < old ? 'stale' : 'old';
  const deepAt = runs?.deep ?? null;
  // A full-market scan covers more than a deep one: a recent one leaves nothing for a deep scan to add.
  const cloudRecent = !!runs?.cloud && (now - Date.parse(runs.cloud)) / 86400_000 <= DEEP_STALE_DAYS;
  return {
    level, last,
    lastDepth: cloud ? 'cloud' : last && last === runs?.deep ? 'deep' : last && last === runs?.quick ? 'quick' : null,
    deepAt,
    deepStale: !cloudRecent && (!deepAt || (now - Date.parse(deepAt)) / 86400_000 > DEEP_STALE_DAYS),
  };
}

/**
 * The horizons offered, in days: 4 and 12 hours and a day for fast flips, then longer. Null is "any":
 * nothing is left out for being slow, and slow is flagged. Speeds come from daily volume, so an hour
 * horizon means "busy enough to flip this fast on an average day", not a promise it fills in 4 hours.
 */
export const HORIZONS: (number | null)[] = [4 / 24, 12 / 24, 1, 3, 7, 14, 30, null];

/** A horizon as a person would say it: "4 hours", "a day", "3 days". */
export function horizonSaid(days: number): string {
  if (days < 1) { const h = Math.round(days * 24); return `${h} hour${h === 1 ? '' : 's'}`; }
  return days === 1 ? 'a day' : `${+days.toFixed(1)} days`;
}
/** Short, for a button: "4 h", "1 d". */
export const horizonShort = (days: number) => (days < 1 ? `${Math.round(days * 24)} h` : `${+days.toFixed(1)} d`);
/** A position that takes longer than this to buy in and sell out ties ISK up for weeks, and says so. */
export const SLOW_DAYS = 30;
/** A saved horizon that isn't one of the choices (typed in before they existed) snaps to the nearest one. */
export function snapHorizon(days: number | null | undefined): number | null {
  if (days === null) return null;
  if (days == null || !Number.isFinite(days) || days <= 0) return DEFAULT_FILTERS.horizonDays;
  // Nearest by ratio, not difference: 5 days is nearer 7 than 3 in the way a person means it, and a
  // tenth of a day must not snap to a day.
  const opts = HORIZONS.filter((h): h is number => h != null);
  const off = (h: number) => Math.abs(Math.log(h / days));
  return opts.reduce((best, h) => (off(h) < off(best) ? h : best), opts[0]);
}

export const DEFAULT_FILTERS: ProspectFilters = {
  budget: 250_000_000,
  horizonDays: 3,
  minTrades: 5,
  minDays: 20,
  minRoi: 0.03,
  maxSpikiness: 0.5,
  demoteFlagged: false,
};

/**
 * Does this item change hands often enough, and steadily enough, to trade every day?
 *
 * spikiness is the one that earns its keep. An item can move 30,000 units in a month and
 * still be no use to you if it all went on a single day; days traded alone waves that through.
 */
export function passesGate(
  s: Pick<ProspectStats, 'daysTraded' | 'tradesPerDay' | 'spikiness'>,
  f: ProspectFilters,
): boolean {
  return s.daysTraded >= f.minDays && s.tradesPerDay >= f.minTrades && s.spikiness <= f.maxSpikiness;
}

/**
 * Which window said a price at the front isn't reached: the fortnight (fewer than FILL_RARE of the last 14 days) or,
 * the fortnight being fine, the last few days (fewer than RECENT_MIN of the last RECENT_DAYS). Null: the front is
 * reached on both, or nothing can be said.
 */
export type ReachWindow = 'fortnight' | 'recent' | null;

/**
 * The bid you'd actually place. One legal step above the best, if the bulk of trading has been getting down there on
 * at least FILL_RARE of the last 14 days *and* RECENT_MIN of the last RECENT_DAYS. Otherwise it's where trading did
 * reach on both: the higher of the bid reached on half the fortnight and the one reached on 3 of the last 5 days
 * (`bidBothWindows`). A best bid nobody sells into is not a price you can buy at, and one only an older price level
 * reached isn't either (fills.ts, RECENT_DAYS). `window` says which test the front failed, so a flag can say "not
 * reached lately" rather than "not reached". Without the lows (stats cached before they were kept) it's the step
 * above the best, and nothing is claimed; with too few recent days traded to say, the fortnight decides alone.
 */
export function bidToPlace(bestBuy: number, lows?: (number | null)[] | null): { top: number; buy: number; bidReach: number | null; recentReach: number | null; window: ReachWindow; raised: boolean } {
  const top = tickUp(bestBuy);
  const bidReach = lows ? bidReachDays(lows, top) : null;
  const recentReach = lows ? recentBidReach(lows, top) : null;
  const window: ReachWindow = bidReach == null ? null : bidReach < FILL_RARE ? 'fortnight' : recentReach != null && recentReach < RECENT_MIN ? 'recent' : null;
  const reached = lows && window ? bidBothWindows(lows) : null;
  const buy = reached != null && reached > top ? reached : top;
  return { top, buy, bidReach, recentReach, window, raised: buy !== top };
}

/**
 * The ask you'd actually list at, the other half of the same test. One legal step under the best ask, if the bulk of
 * trading has been getting up there on FILL_RARE of the last 14 days and RECENT_MIN of the last RECENT_DAYS;
 * otherwise where it did on both, the lower of the two windows' asks (`askBothWindows`). An ask nobody buys at is not
 * a price you can sell at. True Sansha EM Armor Hardener, a month around 3.4 M with one day at 7 M, showed a 59% flip
 * buying where it had traded and selling where it had just jumped to; neither side would fill. Without the highs it's
 * the step under the best.
 */
export function askToPlace(bestSell: number, highs?: (number | null)[] | null): { top: number; sell: number; askReach: number | null; recentReach: number | null; window: ReachWindow; lowered: boolean } {
  const top = tickDown(bestSell);
  const askReach = highs ? askReachDays(highs, top) : null;
  const recentReach = highs ? recentAskReach(highs, top) : null;
  const window: ReachWindow = askReach == null ? null : askReach < FILL_RARE ? 'fortnight' : recentReach != null && recentReach < RECENT_MIN ? 'recent' : null;
  const reached = highs && window ? askBothWindows(highs) : null;
  const sell = reached != null && reached < top ? reached : top;
  return { top, sell, askReach, recentReach, window, lowered: sell !== top };
}

/**
 * How far Place and leave's prices may sit from today's book before "Market moved" says the market has left them: a bid
 * more than this under today's best bid or over it, or a sale more than this over today's cheapest listing.
 */
export const MARKET_MOVED = 0.05;

/** Which of Place and leave's prices today's book has left, and by how much (fractions of today's best bid or cheapest listing). */
export type MarketMove = {
  /** `under`/`over` today's best bid; `atOnce`: at or over the cheapest listing, so it buys from the listings there and then. */
  bid: { side: 'under' | 'over' | 'atOnce'; by: number } | null;
  sell: { by: number } | null;
};

/**
 * Place and leave prices both sides where the bulk of trading reached on half of the last 14 days, wherever today's book
 * is (the recent window was left off it on purpose: it took 30% of its candidates). On the user's second plan (2 October
 * 2026) the market had left a third of it within the hour: bids above today's best or at the cheapest listing, which
 * buys at once (Raging Dark Filament at 1.711 M against a 1.44 M best bid, Imperial Navy Infiltrator's 1.658 M over a
 * 1.608 M listing), sales over today's listings (Gravid Modulated Strip Miner Mutaplasmid to sell at 13.8 M against
 * 11.31 M), and bids 8-17% under today's best (Compressed Fullerite-C84 at 7,639 against 9,250). Judged on the book the
 * planner is given: the scan's, made live by the five-minute watch for the items it watches. Null when neither moved.
 */
export function marketMoved(buy: number, sell: number, bestBuy: number | null, bestSell: number | null): MarketMove | null {
  let bid: MarketMove['bid'] = null, ask: MarketMove['sell'] = null;
  if (bestSell != null && bestSell > 0 && buy >= bestSell) bid = { side: 'atOnce', by: buy / bestSell - 1 };
  else if (bestBuy != null && bestBuy > 0) {
    const off = buy / bestBuy - 1;
    if (off > MARKET_MOVED + 1e-12) bid = { side: 'over', by: off };
    else if (-off > MARKET_MOVED + 1e-12) bid = { side: 'under', by: -off };
  }
  if (bestSell != null && bestSell > 0 && sell / bestSell - 1 > MARKET_MOVED + 1e-12) ask = { by: sell / bestSell - 1 };
  return bid || ask ? { bid, sell: ask } : null;
}

/** The Market moved flag's reason for one item: which side moved, by how much, and the fortnight its prices come from. */
export function marketMovedSaid(m: MarketMove, bestBuy: number | null, bestSell: number | null): string {
  const by = (x: number) => pct(x, x < 0.1 ? 1 : 0);
  const lines: string[] = [];
  if (m.bid?.side === 'atOnce') lines.push(`Your bid would be at or over today’s cheapest listing of ${isk(bestSell)}: it would buy at once, from the listings, rather than wait.`);
  else if (m.bid?.side === 'over') lines.push(`Your bid would be ${by(m.bid.by)} over today’s best bid of ${isk(bestBuy)}: the market has fallen since, so you’d pay more than buyers bid today.`);
  else if (m.bid) lines.push(`Your bid would be ${by(m.bid.by)} under today’s best bid of ${isk(bestBuy)}: the market has risen since, so it may not fill.`);
  if (m.sell) lines.push(`The plan sells ${by(m.sell.by)} over today’s cheapest listing of ${isk(bestSell)}: the market has fallen since, and it would wait behind cheaper listings.`);
  return `Today’s book has moved away from the prices Place and leave would use.\n\n${lines.map((x) => `• ${x}`).join('\n')}\n\n`
    + `Place and leave prices both sides where the bulk of trading reached on half of the last ${FILL_WINDOW} days, wherever today’s book is. More than ${pct(MARKET_MOVED, 0)} from today’s book, those days aren’t today’s market.`;
}

export type BookShape = {
  buyOrders: number; sellOrders: number;
  topBuys: BookLevel[]; topSells: BookLevel[];
};

/**
 * The ways a good-looking spread turns out not to be one. Surfaced next to the item rather
 * than folded into the score, because whether they matter depends on how you trade.
 */
export function warningsFor(
  stats: Pick<ProspectStats, 'dailyRange' | 'trend' | 'tradesPerDay'> & Partial<Pick<ProspectStats, 'high30' | 'spike' | 'unitsPerDay' | 'lastMove' | 'runUp'>>,
  book: BookShape,
  spreadPct: number,
  estOrders: number,
  /** The run-up bar: RUN_UP at the front, RUN_UP_PATIENT for Place and leave (`runUpBar`). */
  runUpAt = RUN_UP,
): ProspectWarning[] {
  const out: ProspectWarning[] = [];
  // Few orders on a side means the gap is wide because nobody is standing there.
  if (book.buyOrders < 5 || book.sellOrders < 5) out.push('thin');
  // Today's gap is far wider than this item's habitual daily range, so expect it to close.
  if (stats.dailyRange > 0 && spreadPct > 2.5 * stats.dailyRange) out.push('fluke');
  if (stats.trend < -0.1) out.push('falling');
  // Hundreds of listings against a handful of trades: a queue, not a market.
  if (stats.tradesPerDay > 0 && estOrders / stats.tradesPerDay > 20) out.push('crowded');
  // The front of the book held by one price with days of the market's volume behind it: stock placed
  // to make the book look solid, and liable to be pulled the moment traders line up behind it.
  if (isWall(book.topSells, stats.unitsPerDay) || isWall(book.topBuys, stats.unitsPerDay)) out.push('wall');
  // A bid well above anything paid all month needs escrow nobody honest puts up. The classic margin
  // scam: the order is backed by a sliver of ISK and vanishes when you haul stock in to fill it.
  const bid = book.topBuys[0]?.price;
  if (bid != null && stats.high30 != null && stats.high30 > 0 && bid > stats.high30 * (1 + ESCROW_OVER)) out.push('escrow');
  // A recent day far busier than usual at an unusual price: someone may be moving it to lure traders in.
  if (stats.spike) out.push('spike');
  if (stats.lastMove != null && Math.abs(stats.lastMove) > MOVED) out.push('moved');
  // Absent on stats from before it was kept: nothing is claimed (the planner says to scan again).
  if (stats.runUp != null && stats.runUp > runUpAt) out.push('runUp');
  return out;
}

/**
 * A wall: the best price on a side (the one you'd queue behind) holding more than half the visible
 * stock and more than WALL_DAYS of the item's whole daily volume. A big order deeper in the book is
 * just a big order, and a big one at the front of a market that moves that much in a day is just
 * supply — neither is what traders chase and get stranded behind. Needs another price to compare
 * against, and a known pace.
 */
export function isWall(levels: BookLevel[], unitsPerDay?: number): boolean {
  if (levels.length < 2 || !(unitsPerDay != null && unitsPerDay > 0)) return false;
  const total = levels.reduce((t, l) => t + l.volume, 0);
  const front = levels[0].volume;
  return total > 0 && front > WALL_SHARE * total && front > WALL_DAYS * unitsPerDay;
}

/**
 * Price levels a book summary keeps a side: the cloud's full scan (`LEVELS` in worker/src/scan.ts), the browser's book reads
 * (`levels(…, 7)` in market.ts) and the cloud's watched books (`bookOf` in worker/src/alerts.ts). A side with fewer was read
 * whole.
 */
export const BOOK_LEVELS = 7;

/** Where a sell queue is counted to: the price the bulk of trading got up to on FILL_RARE of the last 14 days. */
export const queueCeiling = (highs: (number | null)[]): number | null => reachedAsk(highs, FILL_RARE);

/**
 * How far past the best ask the cloud's full scan keeps an item's Jita listings while it reads the book, to count the
 * queue (`sellsToOf`). On the whole Forge book of 2 October 2026, 192,167 of Jita's 223,245 sell prices sat within twice
 * their item's best ask; a listing dearer than that is no queue anyone selling at the front waits in. A ceiling past it
 * (a fat finger at the front) is counted only this far, and says "at least".
 */
export const SELLS_COUNTED_TO = 2;

/**
 * The units listed at or under the queue's ceiling, from a whole sell side's prices ([price, units], any order): what the
 * full scan keeps beside the seven levels. Counted no further than SELLS_COUNTED_TO times the best ask, which is all the
 * scan keeps, and the price it was counted to says so.
 */
export function sellsToOf(side: Iterable<[number, number]>, bestSell: number, ceiling: number): SellsTo {
  const price = Math.min(ceiling, SELLS_COUNTED_TO * bestSell);
  let units = 0;
  for (const [p, u] of side) if (p <= price) units += u;
  return { price, units };
}

/**
 * The stock a listing at `sell` queues with, from a book summary's sell levels (cheapest first). `front` is one step under
 * the best ask, where a listing at the front goes.
 *
 * Priced at the front or above it, a listing joins the queue: at the front it's one step under everyone, but the queue
 * undercuts it back, so what it competes with is everything listed at prices buyers have been paying, up to where trading
 * reached on FILL_RARE of the last 14 days (or up to its own price, if that's higher: a patient ask behind the front).
 * Listings above that aren't selling, and aren't a queue anyone waits in. Priced under the front (a lowered ask, a
 * patient one under the book), nothing is ahead of it. Without the highs, nothing listed is known to be reached, so only
 * what's at or under its own price counts.
 *
 * `atLeast`: the summary kept all BOOK_LEVELS prices it keeps and every one is under the ceiling, so the side may hold
 * more. With fewer levels, the side was read whole and the count is exact.
 *
 * `sellsTo`, the cloud scan's count over the whole side, settles that case: counted to this queue's own ceiling it is the
 * count (`countedTo`), exact; counted to a lower price (twice the best ask, or a ceiling worked out before the browser's
 * own watched highs raised it), at least that. A live book merged over the scan's can hold more than the morning's count,
 * so the levels still win where they're more, as a lower bound. Counted past the ceiling, it can't be cut back, and the
 * levels answer as before. Absent (a Worker a version behind, the browser's own scan, the alert round's books), nothing
 * changes.
 */
export function listedQueue(topSells: BookLevel[], sell: number, front: number, highs?: (number | null)[] | null, sellsTo?: SellsTo | null): { units: number; atLeast: boolean; upTo: number; countedTo?: number } {
  const rare = sell >= front && highs ? queueCeiling(highs) : null;
  const upTo = rare != null && rare > sell ? rare : sell;
  const within = topSells.filter((l) => l.price <= upTo);
  const units = within.reduce((t, l) => t + l.volume, 0);
  const atLeast = topSells.length >= BOOK_LEVELS && within.length === topSells.length;
  if (!atLeast || !sellsTo || !(sellsTo.price <= upTo) || !(sellsTo.units >= 0)) return { units, atLeast, upTo };
  return { units: Math.max(units, sellsTo.units), atLeast: sellsTo.price < upTo || units > sellsTo.units, upTo, countedTo: sellsTo.price };
}

/**
 * How a Long queue's count was made, for its tip: over the whole sell side by the cloud's daily scan (`countedTo`), or from
 * the book summary's cheapest BOOK_LEVELS prices; and whether there are likely more. Empty when the levels read the side
 * whole.
 */
export function queueCountSaid(q: { atLeast: boolean; upTo: number; countedTo?: number }): string {
  if (q.countedTo != null && q.countedTo < q.upTo) return ` The cloud’s daily scan counted every listing up to ${isk(q.countedTo)}, so there are likely more.`;
  if (q.countedTo != null && !q.atLeast) return ' Every listing up to there was counted when the cloud’s daily scan read the whole book.';
  return q.atLeast ? ` The scan keeps the cheapest ${BOOK_LEVELS} prices a side, and every one is under it, so there are likely more.` : '';
}

/**
 * Prospects' Long queue reason for one item: the count, how many days of buyers it is and their pace, the typical day and
 * the share bought from listings behind that pace, and where it was counted to. The queue is said as Orders says it
 * (`queueLengthSaid`, `perDaySaid` in split.ts), so a slow bulk market's 0.3 a day and 0.4% bought from listings don't
 * read as "the 0 a day" and "the 0%", as they did until the final review (2 October 2026). Paragraphs, not bullets: the
 * reason also shows inline under the item's row.
 */
export function longQueueSaid(q: SellQueue & { upTo: number; countedTo?: number }, unitsPerDay: number, share: number): string {
  const length = q.perDay > 0
    ? `${queueLengthSaid(q)} here, who take ${perDaySaid(q.perDay)} from listings, over the ${LONG_QUEUE_DAYS} that make a long queue`
    : `${NOBODY_BUYS} here, so the queue doesn’t clear`;
  return `${q.atLeast ? 'At least ' : ''}${units(q.units)} units are listed at prices buyers have been paying: ${length}.\n\n`
    + `That’s a typical day’s ${dayCount(unitsPerDay)} units × the ${listingShareSaid(share)} bought from listings, ${queuePaceSaid(q.from)}.\n\n`
    + `Counted up to ${isk(q.upTo)}, where trading got up to on ${FILL_RARE} of the last ${FILL_WINDOW} days: listings above it aren’t selling.${queueCountSaid(q)}\n\n`
    + 'New stock waits behind them, and sellers that deep in a queue undercut each other, so the price you’d sell at may not hold.';
}

/**
 * A book side without your own orders in it (levels are by price, so each of yours comes off its price's level): a wall of
 * yours, or a bid of yours above what the item trades at, is no trap for you. The user's Small Ghoul Compact Energy
 * Nosferatu buy order (4,438 left at 2,229, the best bid) was called a wall and put on To do as a suspicious market
 * (30 September 2026).
 */
export function withoutOwn(levels: BookLevel[], own: { price: number; volume: number }[]): BookLevel[] {
  const left = new Map<number, number>();
  for (const o of own) left.set(o.price, (left.get(o.price) ?? 0) + o.volume);
  return levels.map((l) => ({ ...l, volume: l.volume - Math.min(l.volume, left.get(l.price) ?? 0) })).filter((l) => l.volume > 0);
}

/**
 * Roughly what an item could pay in a day, before we spend a request on its live book.
 *
 * An item can only pay if it habitually moves further in a day than the fees cost to get in
 * and out — `breakEven` is that threshold, the spread at which a trade nets nothing. Below it
 * no spread survives the round trip however much volume there is, which is why the busiest
 * items on the market (minerals, extractors) are usually the worst things to trade.
 */
export function expectedEdge(
  s: Pick<ProspectStats, 'dailyRange' | 'avgPrice' | 'unitsPerDay'>,
  breakEven: number,
  share: number,
): number {
  const edge = s.dailyRange - breakEven;
  return edge <= 0 ? 0 : edge * s.avgPrice * s.unitsPerDay * share;
}

export type SortKey = 'name' | 'roi' | 'roiDay' | 'canTake' | 'flip' | 'net' | 'trades' | 'days' | 'volume' | 'traded' | 'iskPerDay' | 'capital' | 'flags';

/** ISK that changes hands in an item a day, both sides: the median day's units at the 30-day average price. */
export const tradedPerDay = (s: Pick<ProspectStats, 'unitsPerDay' | 'avgPrice'>) => s.unitsPerDay * s.avgPrice;
/** How many of the busiest markets the Busy markets view shows. */
export const BUSY_SHOWN = 100;
export type Sort = { key: SortKey; dir: 'asc' | 'desc' };

/** Numbers read best biggest-first; a name reads best A to Z. */
export const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = {
  name: 'asc', roi: 'desc', roiDay: 'desc', canTake: 'desc', net: 'desc', trades: 'desc', days: 'desc',
  volume: 'desc', traded: 'desc', iskPerDay: 'desc', flags: 'asc',
  // Less tied up for the same return is the better trade.
  capital: 'asc',
  // The only one where small is good: a fast flip beats a slow one.
  flip: 'asc',
};

type Sortable = {
  typeId: number;
  roi: number; net: number; iskPerDay: number; capital: number; canTake: number; daysToFlip: number;
  roiPerDay?: number;
  traded?: number;
  warnings: unknown[];
  stats: { tradesPerDay: number; daysTraded: number; unitsPerDay: number };
};

const valueOf = (p: Sortable, k: SortKey): number => {
  switch (k) {
    case 'roi': return p.roi;
    case 'roiDay': return p.roiPerDay ?? 0;
    case 'canTake': return p.canTake;
    case 'flip': return p.daysToFlip;
    case 'net': return p.net;
    case 'trades': return p.stats.tradesPerDay;
    case 'days': return p.stats.daysTraded;
    case 'volume': return p.stats.unitsPerDay;
    case 'traded': return p.traded ?? 0;
    case 'iskPerDay': return p.iskPerDay;
    case 'capital': return p.capital;
    case 'flags': return p.warnings.length;
    default: return 0;
  }
};

/**
 * Order the table.
 *
 * Demoting flagged items stays the outer key when it is on, so picking a column sorts within the
 * clean items and the flagged ones separately rather than mixing them back together.
 */
export function sortProspects<T extends Sortable>(
  rows: T[],
  sort: Sort,
  nameOf: (typeId: number) => string,
  demoteFlagged = false,
): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (demoteFlagged && a.warnings.length !== b.warnings.length) return a.warnings.length - b.warnings.length;
    if (sort.key === 'name') return sign * nameOf(a.typeId).localeCompare(nameOf(b.typeId));
    const d = valueOf(a, sort.key) - valueOf(b, sort.key);
    // Equal values fall back to name, so the order never jitters between renders.
    return d !== 0 ? sign * d : nameOf(a.typeId).localeCompare(nameOf(b.typeId));
  });
}

/**
 * ISK an item could take inside a horizon, at your share of its daily trade. Uses the item's own
 * average price rather than a live quote, so it can be worked out for everything scanned, not just
 * the handful that have been priced against the book.
 */
export function absorbable(
  s: Pick<ProspectStats, 'unitsPerDay' | 'avgPrice'>,
  sharePct: number,
  days: number,
): number {
  return s.unitsPerDay * (sharePct / 100) * s.avgPrice * days;
}
