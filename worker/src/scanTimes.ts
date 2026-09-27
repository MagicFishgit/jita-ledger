/**
 * When the full-market scan runs, as plain rules with no imports, so the tests can load them. The daily cron is at
 * 11:25 EVE, twenty minutes after ESI publishes the day's history (11:05); the hourly check at 7 past catches up a
 * run that was missed or stopped short.
 */

/** The most recent 11:10 EVE: history for the day before is out by then. */
export function dayBoundary(now: number): number {
  const d = new Date(now);
  const b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 11, 10);
  return b > now ? b - 86400_000 : b;
}

/**
 * When the next scan starts: the daily cron at 11:25 EVE, or the hourly check (7 past) when one is due now, i.e.
 * missed or stopped short. While one runs, the next is the next daily one.
 */
export function nextScanAt(now: number, due: boolean, running: boolean): number {
  const d = new Date(now);
  let daily = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 11, 25);
  if (daily <= now) daily += 86400_000;
  const hour = Math.floor(now / 3600_000) * 3600_000;
  const hourly = hour + 7 * 60_000 > now ? hour + 7 * 60_000 : hour + 3600_000 + 7 * 60_000;
  return !running && due ? Math.min(hourly, daily) : daily;
}
