// ISK a day as a week and a month, and set against a month of Omega. Pure: no config, store, React or DOM.
// Thirty days is Research's convention (`iskMonth` in researchTrack.ts). Not known is null, never 0.

export type Periods = { day: number; week: number; month: number };

export function periods(day: number | null | undefined): Periods | null {
  if (day == null || !Number.isFinite(day)) return null;
  return { day, week: day * 7, month: day * 30 };
}

/** The PLEX price a month of Omega is worked out at: the one typed in Settings when over 0, else the market's last read. */
export function plexPriceOf(typed: number, read: number | null | undefined): number | null {
  if (typed > 0) return typed;
  return read != null && read > 0 ? read : null;
}

/** What a month of Omega costs in ISK, the way Omega works it out; null when the price or the count isn't known. */
export function monthOfOmega(plexPerMonth: number, price: number | null): number | null {
  return price != null && price > 0 && plexPerMonth > 0 ? price * plexPerMonth : null;
}

/** A month's ISK as a share of one month of Omega (1 = it pays for it exactly); null when either is missing or not positive. */
export function omegaShare(month: number | null, plexPerMonth: number, plexPrice: number | null): number | null {
  if (month == null || !Number.isFinite(month) || month <= 0) return null;
  const cost = monthOfOmega(plexPerMonth, plexPrice);
  return cost == null ? null : month / cost;
}

/** "15%" up to 100%, then "1.4×". */
export function shareSaid(share: number): string {
  return share > 1 ? `${(Math.round(share * 10) / 10).toFixed(1)}×` : `${Math.round(share * 100)}%`;
}
