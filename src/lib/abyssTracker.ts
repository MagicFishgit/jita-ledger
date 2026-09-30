/**
 * Abyss Tracker (abysstracker.com, by the EVE Workbench team): the runs players log with it, summarised per tier and
 * weather, and each fit's measured performance. Its API is public but sends no CORS header, so the cloud reads it for the
 * app (worker/src/abyss.ts) and the app reads the cloud. The API's enums (from its own client, 30 September 2026): tiers
 * 0 Tranquil to 6 Cataclysmic; weathers 0 Electrical, 1 Dark, 2 Exotic, 3 Firestorm, 4 Gamma. Frigate and destroyer
 * figures are per pocket (three or two filaments). Runs are self-reported, so deaths are under-reported. Pure.
 */

import type { Weather } from './abyssal';

export const TRACKER_WEATHER: Weather[] = ['Electrical', 'Dark', 'Exotic', 'Firestorm', 'Gamma'];
export const trackerWeather = (w: Weather) => TRACKER_WEATHER.indexOf(w);

export type Band = { median: number; low: number; high: number } | null;

/** One of the most-run fits in a cell: Abyss Tracker's own figures for it (EHP in thousands, its engine at all V). */
export type TrackerFit = {
  id: string; name: string; shipId: number; shipName: string; shipClass: string;
  dps: number; ehpK: number; speed: number; cost: number; runs: number; tags: string[];
};

export type TrackerCell = {
  tier: number; weather: number; at: number;
  runs: number;
  frigate: Band; destroyer: Band; cruiser: Band;
  fits: TrackerFit[];
  drops: { typeId: number; name: string; rate: number }[];
};

/** A fit's performance where it ran: per tier and weather, runs, survival and ISK a run, with ISK an hour where known. */
export type FitPerformance = {
  runs: number; medianProfit: number | null; medianRunTime: string | null;
  cells: { tier: number; weather: number; runs: number; failed: number; survival: number; avgIsk: number; medianIsk: number | null; iskPerHour: number | null; breakEvenRuns: number | null }[];
};

export type TrackerFitDetail = { id: string; at: number; eft: string; perf: FitPerformance | null };

type Raw = Record<string, unknown>;
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const band = (x: unknown): Band => {
  const b = x as Raw | null;
  return b && typeof b.median === 'number' ? { median: num(b.median), low: num(b.lowThreshold), high: num(b.highThreshold) } : null;
};

/** The page's summary of `/Overview/GetOverviewData`: no run lists or pilot names, only the figures shown. */
export function compactCell(tier: number, weather: number, at: number, result: Raw): TrackerCell {
  const fits = Array.isArray(result.fits) ? (result.fits as Raw[]) : [];
  const drops = Array.isArray(result.dropRates) ? (result.dropRates as Raw[]) : [];
  return {
    tier, weather, at, runs: num(result.runCount),
    frigate: band(result.frigateData), destroyer: band(result.destroyerData), cruiser: band(result.cruiserData),
    fits: fits.map((f) => ({
      id: String(f.id ?? ''), name: String(f.name ?? '').trim(), shipId: num(f.shipId), shipName: String(f.shipName ?? ''), shipClass: String(f.shipClass ?? ''),
      dps: num(f.totalDps), ehpK: num(f.totalEhp), speed: num(f.maxSpeed), cost: num(f.totalCost), runs: num(f.runs),
      tags: Array.isArray(f.tags) ? (f.tags as Raw[]).map((t) => String(t.name ?? '')).filter(Boolean) : [],
    })).filter((f) => f.id && f.shipId),
    drops: drops.map((x) => ({ typeId: num(x.typeId), name: String(x.name ?? ''), rate: num(x.dropRate) })).filter((x) => x.typeId),
  };
}

/** A fit's performance from `/Fit/GetPerformanceById` (ISK an hour per cell) and `/Fit/GetTierTypeStats` (survival per cell). */
export function compactPerformance(perf: Raw | null, tts: Raw | null): FitPerformance | null {
  if (!perf && !tts) return null;
  const entries = Array.isArray(perf?.breakEvenEntries) ? (perf!.breakEvenEntries as Raw[]) : [];
  const cells = Array.isArray(tts?.cells) ? (tts!.cells as Raw[]) : [];
  return {
    runs: num(perf?.runCount ?? cells.reduce((t, c) => t + num(c.runCount), 0)),
    medianProfit: perf && typeof perf.medianProfitability === 'number' ? perf.medianProfitability : null,
    medianRunTime: perf && typeof perf.medianRunTime === 'string' ? perf.medianRunTime : null,
    cells: cells.map((c) => {
      const e = entries.find((x) => num(x.maxTier) === num(c.tier) && num(x.weather) === num(c.weather));
      return {
        tier: num(c.tier), weather: num(c.weather), runs: num(c.runCount), failed: num(c.failedCount), survival: num(c.survivalRate), avgIsk: num(c.averageIskRun),
        medianIsk: e ? num(e.medianIsk) : null, iskPerHour: e ? num(e.iskPerHour) : null, breakEvenRuns: e ? num(e.breakEvenRuns) : null,
      };
    }).sort((a, b) => b.runs - a.runs),
  };
}
