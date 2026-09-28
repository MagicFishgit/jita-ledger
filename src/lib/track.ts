/**
 * "Clears in", checked: what became of one prediction. Pure, shared with the cloud's `trackRecord`.
 */

/** Days after which a prediction nobody could settle is written off as late. */
export const TRACK_DAYS = 14;

export type Outcome = 'front' | 'void' | 'late';

/**
 * What became of a prediction made at `price`, from this round's judgement of the order (when the watch read its
 * book) and the stored order record:
 * - judged at another price: you moved it, so the prediction is void;
 * - judged and no longer beaten: it reached the front;
 * - not judged, and the record says closed: sold out means it reached the front on the way, anything left means
 *   cancelled or expired, which answers nothing;
 * - not judged while the record still says open: undecided. A sold-out order leaves the book within five
 *   minutes, but its record only says so after the next orders refresh; voiding it then would count every
 *   success as a void.
 * Undecided for longer than TRACK_DAYS is late.
 */
export function predictionOutcome(
  p: { price: number; at: number },
  judged: { price: number; beaten: boolean } | undefined,
  record: { state: string; volumeRemain: number } | undefined,
  now: number,
): Outcome | null {
  if (judged) {
    if (judged.price !== p.price) return 'void';
    if (!judged.beaten) return 'front';
  } else if (record && record.state !== 'open') {
    return record.volumeRemain === 0 ? 'front' : 'void';
  }
  return now - p.at > TRACK_DAYS * 86400_000 ? 'late' : null;
}

/**
 * "Place and leave", checked. The planner prices a left order's pace as its side's trade × your share of it
 * (scaled for the orders you queue among) × the share of days trading reaches its price (`throughput`). Each left
 * order is followed at the price it stands at, and what it actually filled is set against that.
 */
export const LEAVE_DAYS = 14;
/** The model is daily: anything shorter says nothing about it. */
export const LEAVE_MIN_DAYS = 1;

export type LeaveRow = { at: number; remain0: number; remain: number; seenAt: number; pred: number };
export type LeaveOutcome = { outcome: 'checked' | 'void'; filled: number; days: number };

/**
 * What became of one left order's expected pace. `judged` is this round's read of the order (its price, what's
 * left, and whether it's still left alone); `record` the stored order when the round didn't judge it. Closed at a
 * new price, when it stops being left alone, when its record closes, or after LEAVE_DAYS, with what it filled up to
 * the last time it was seen; under a day of that is void. Undecided otherwise, and the caller updates `remain`.
 */
export function leaveOutcome(
  row: LeaveRow,
  judged: { price: number; volumeRemain: number; left: boolean } | undefined,
  record: { state: string; volumeRemain: number } | undefined,
  price: number,
  now: number,
): LeaveOutcome | null {
  const close = (remain: number, until: number): LeaveOutcome => {
    const days = (until - row.at) / 86400_000;
    return { outcome: days >= LEAVE_MIN_DAYS ? 'checked' : 'void', filled: Math.max(0, row.remain0 - remain), days };
  };
  if (judged) {
    if (judged.price !== price || !judged.left) return close(row.remain, row.seenAt);
    if (now - row.at >= LEAVE_DAYS * 86400_000) return close(judged.volumeRemain, now);
    return null;
  }
  // Gone from the book: its record says how it ended once the orders refresh; until then, undecided.
  if (record && record.state !== 'open') return close(record.volumeRemain, row.seenAt);
  return now - row.at >= LEAVE_DAYS * 86400_000 ? close(row.remain, row.seenAt) : null;
}

/** Filled against expected, per day: 1 is exactly the pace the planner expects, 0.5 half of it. */
export const leaveRatio = (o: LeaveOutcome, pred: number) => (pred > 0 && o.days > 0 ? o.filled / o.days / pred : null);

/**
 * The Sniper, checked. Its claim on a listing is that the item trades up to the relist price it shows (`resale`),
 * so a buyer can relist there. Settled from the item's daily history after the sighting: the first day whose high
 * reached it, within SNIPE_CHECK_DAYS, or not. A day's high is where the bulk of its trading got up to (ESI trims
 * the extremes), and a day missing from the history is a day nothing traded.
 */
export const SNIPE_CHECK_DAYS = 7;

export function snipeOutcome(firstSeen: number, resale: number, rows: { date: string; highest: number }[], now: number):
  { outcome: 'reached' | 'not'; days: number | null } | null {
  const day0 = Date.parse(new Date(firstSeen).toISOString().slice(0, 10));
  for (const r of rows) {
    const d = Math.round((Date.parse(r.date) - day0) / 86400_000);
    if (d >= 1 && d <= SNIPE_CHECK_DAYS && r.highest >= resale) return { outcome: 'reached', days: d };
  }
  // The last day checked is in the history from 11:05 EVE the day after it ends.
  const settled = day0 + (SNIPE_CHECK_DAYS + 1) * 86400_000 + 12 * 3600_000;
  return now >= settled ? { outcome: 'not', days: null } : null;
}

/** Checked claims a record needs before it says anything: fewer is noise. */
export const TRACK_MIN = 5;

export type LeaveSummary = { checked: number; medianRatio: number | null; none: number };
export type SnipeSummary = {
  clean: { n: number; reached: number; medianDays: number | null };
  doubted: { n: number; reached: number };
  byDoubt: Record<string, { n: number; reached: number }>;
};
export type ShareSummary = {
  day: string; buyMedian: number | null; sellMedian: number | null; buyDays: number; sellDays: number; suggested: number | null; setting: number;
};

const times = (r: number) => `${r < 0.1 ? r.toFixed(2) : r.toFixed(1)}×`;

/** "Place and leave" checked, in a sentence; null until there are enough left orders to say it from. */
export function leaveSaid(l: LeaveSummary | undefined | null): string | null {
  if (!l || l.checked < TRACK_MIN || l.medianRatio == null) return null;
  const r = l.medianRatio;
  const pace = r >= 0.8 && r <= 1.25 ? 'close to the pace the planner expects' : `about ${times(r)} the pace the planner expects`;
  return `Checked on your left orders over 30 days: they filled at ${pace} (the middle of ${l.checked}${l.none ? `; ${l.none} filled nothing` : ''}).`;
}

/** How far your share setting is above what your own trades measured: 2 means sized twice as big. Null when it isn't known. */
export function shareOver(s: ShareSummary | undefined | null, setting: number): number | null {
  if (!s || s.suggested == null || !(s.suggested > 0)) return null;
  return setting / s.suggested;
}
/** Past this, sizes are enough off to say so where they're used. */
export const SHARE_OVER = 2;
