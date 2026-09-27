/**
 * What share of a market your own orders actually capture, measured from your wallet.
 *
 * `settings.share` drives everything that estimates speed or size --- what an item can take, how long
 * a flip lasts, how many runs a loyalty market absorbs --- and it was a guess. The user had it at 50%;
 * their own trades said a median 1.2% of sellers' volume on their buys and 5.8% of buyers' volume on
 * their sells. So this turns the guess into a measurement.
 *
 * For each item and day you traded in the station, your filled units against that day's volume on your
 * side: sellers dumping into bids for a buy, buyers taking listings for a sell (the split is
 * `buyerShare`, with its stated limits). Only days you traded are counted, so it reads high rather than
 * low: a day with an order out and no fills isn't in it.
 *
 * Pure: takes transactions and history, returns the measurement.
 */

import { buyerShare, COMPETITION_MAX } from './split';
import type { HistRow, Tx } from './types';

export type ShareMeasure = {
  /** Item-days counted on each side. */
  buyDays: number; sellDays: number;
  /** Median share of your side's volume you filled, 0 to 1, or null with no days. */
  buyMedian: number | null; sellMedian: number | null;
  /** The setting that reproduces this, in percent: see suggestShare. Null without enough to go on. */
  suggested: number | null;
  /** Whether there were enough days to suggest anything (MIN_SHARE_DAYS in all). */
  enough: boolean;
};

/** Days of trading, across items, before a measurement is worth suggesting a setting from. */
export const MIN_SHARE_DAYS = 10;
/** A side with fewer days than this is left out of the suggestion: one day of buying said "100%". */
export const MIN_SIDE_DAYS = 3;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Days of trading looked back over. ESI keeps 30 days of wallet transactions. */
export const SHARE_DAYS = 30;

/**
 * The setting to use: halfway between your buying and your selling (a round trip needs both), divided
 * by the most the app scales a share up for a quiet market (COMPETITION_MAX), since that's what most
 * markets you trade will get. Rounded to half a percent, at least half a percent.
 */
export function suggestShare(buyMedian: number | null, sellMedian: number | null): number | null {
  const sides = [buyMedian, sellMedian].filter((x): x is number => x != null);
  if (!sides.length) return null;
  const captured = sides.reduce((a, b) => a + b, 0) / sides.length;
  return Math.max(0.5, Math.round(((captured * 100) / COMPETITION_MAX) * 2) / 2);
}

export function measureShare(
  txs: Pick<Tx, 'source' | 'typeId' | 'isBuy' | 'qty' | 'date' | 'locationId'>[],
  history: Record<number, HistRow[]>,
  locationId: number,
  now = Date.now(),
): ShareMeasure {
  const since = now - SHARE_DAYS * 86400_000;
  const days = new Map<string, number>(); // "type|B|date" → units you filled
  for (const t of txs) {
    if (t.source !== 'esi' || t.locationId !== locationId || Date.parse(t.date) < since) continue;
    const k = `${t.typeId}|${t.isBuy ? 'B' : 'S'}|${t.date.slice(0, 10)}`;
    days.set(k, (days.get(k) ?? 0) + t.qty);
  }
  const buys: number[] = [], sells: number[] = [];
  const buyers = new Map<number, number>();
  for (const [k, qty] of days) {
    const [id, side, date] = k.split('|');
    const rows = history[Number(id)];
    const row = rows?.find((r) => r.date === date);
    if (!rows || !row || !(row.volume > 0)) continue;
    if (!buyers.has(Number(id))) buyers.set(Number(id), buyerShare(rows.slice(-30)));
    const b = buyers.get(Number(id))!;
    const sideVolume = row.volume * (side === 'B' ? 1 - b : b);
    if (!(sideVolume > 0)) continue;
    (side === 'B' ? buys : sells).push(Math.min(1, qty / sideVolume));
  }
  const buyMedian = median(buys), sellMedian = median(sells);
  const enough = buys.length + sells.length >= MIN_SHARE_DAYS;
  const suggested = enough
    ? suggestShare(buys.length >= MIN_SIDE_DAYS ? buyMedian : null, sells.length >= MIN_SIDE_DAYS ? sellMedian : null)
    : null;
  return { buyDays: buys.length, sellDays: sells.length, buyMedian, sellMedian, suggested, enough };
}

/** Which items to fetch history for: those you traded in the station lately, most ISK first, at most `max`. */
export function sharedTypes(txs: Pick<Tx, 'source' | 'typeId' | 'qty' | 'unitPrice' | 'date' | 'locationId'>[], locationId: number, max = 60, now = Date.now()): number[] {
  const since = now - SHARE_DAYS * 86400_000;
  const isk = new Map<number, number>();
  for (const t of txs) {
    if (t.source !== 'esi' || t.locationId !== locationId || Date.parse(t.date) < since) continue;
    isk.set(t.typeId, (isk.get(t.typeId) ?? 0) + t.qty * t.unitPrice);
  }
  return [...isk.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id);
}
