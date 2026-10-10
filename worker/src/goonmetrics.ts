/**
 * Home prices for the Industry tab (docs/notes/industry.md), read from Goonmetrics: a Goonswarm tool that publishes no
 * terms, no key and no limit, so it's read gently. Every six hours per hub, after the alts' hourly read on the `37` cron;
 * one call every 1.5 s, at most 50 types a call (its API's own limit); a User-Agent naming the project only. Each hub's
 * read is one row in `home_prices`; a hub whose read fails keeps its last good row, three failed calls in a row end the
 * round, and it isn't a watched job (as Abyss Tracker: someone else's site, and the tab says how old its figures are).
 * `GOONMETRICS_ON` switches it off, for if its authors object: off, nothing is read and the route says so.
 */
import INDUSTRY from '../../src/data/industryTypes.json' with { type: 'json' };
import { HOME_HUBS, HOME_REFRESH_MS, parseGoonmetrics, type HomeRow } from '../../src/lib/homeMarket';
import { BadRequest } from './sync';

export const GOONMETRICS_ON = true;
const API = 'https://goonmetrics.apps.goonswarm.org/api/price_data/';
const HEADERS = { 'User-Agent': 'jita-ledger (hobby tool)' };
/** How old a hub's last try may be before the round reads it again, less the slack below. */
export const REFRESH_MS = HOME_REFRESH_MS;
/** The alts' read ahead of this one varies in length, so a hub is due a little early rather than an hour late (the cadence would slip to 7 h). */
export const REFRESH_SLACK_MS = 30 * 60_000;
const PAUSE_MS = 1500;
const PER_CALL = 50;
const CALL_TIMEOUT_MS = 20_000;
/** No call is started this long after the cron's scheduled time: the invocation's wall limit is 15 minutes. */
export const BUDGET_MS = 10 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads each hub that is due: its last try (good or not) at least REFRESH_MS less the slack ago. However a round went, a hub is
 * not read again before then, with one exception: a round three failed calls in a row stopped isn't stamped, so the next hour
 * tries again (three calls at most while the site is down). The batches that succeeded are merged over the last good row's
 * types, so a batch Goonmetrics keeps refusing doesn't lose the rest, and the hub's `at` is when they were read. A call whose
 * answer isn't Goonmetrics' price data (a 200 with an HTML or error page) fails like any other. Returns what it did per hub: read,
 * partial (some batches failed or time ran out), fresh, later (out of time before it began) or failed. `pause`, `on` and
 * `deadline` (a time past which no call starts) are for the tests and the cron.
 */
export async function refreshHomePrices(db: D1Database, now = Date.now(), types: readonly number[] = (INDUSTRY as { watch: number[] }).watch, pause: (ms: number) => Promise<unknown> = sleep, on = GOONMETRICS_ON, deadline = Infinity) {
  if (!on) return { off: true as const };
  const rows = (await db.prepare('SELECT hub, at, tried, data FROM home_prices').all<{ hub: number; at: number; tried: number; data: string }>()).results;
  const kept = new Map(rows.map((r) => [r.hub, r]));
  const done: Record<string, 'read' | 'partial' | 'fresh' | 'later' | 'failed'> = {};
  let error: string | null = null, inARow = 0, calls = 0;
  for (const hub of HOME_HUBS) {
    const old = kept.get(hub.id);
    if (now - Math.max(old?.tried ?? 0, old?.at ?? 0) < REFRESH_MS - REFRESH_SLACK_MS) { done[hub.short] = 'fresh'; continue; }
    if (Date.now() > deadline) { done[hub.short] = 'later'; continue; }
    const got: Record<number, HomeRow> = {};
    let ok = true, cut = false;
    for (let i = 0; i < types.length; i += PER_CALL) {
      if (Date.now() > deadline) { cut = true; break; }
      if (calls++) await pause(PAUSE_MS);
      const ask = types.slice(i, i + PER_CALL);
      try {
        const res = await fetch(`${API}?station_id=${hub.id}&type_id=${ask.join(',')}`, { headers: HEADERS, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
        if (!res.ok) { await res.body?.cancel(); throw new Error(`Goonmetrics answered ${res.status} for ${hub.short}`); }
        const body = await res.text();
        const parsed = body.includes('<price_data') ? parseGoonmetrics(body) : {};
        if (!ask.some((t) => parsed[t])) throw new Error(`Goonmetrics answered something other than prices for ${hub.short}`);
        Object.assign(got, parsed);
        inARow = 0;
      } catch (e) {
        ok = false;
        error ??= e instanceof Error ? e.message : String(e);
        if (++inARow >= 3) { done[hub.short] = 'failed'; return { done, error, stopped: true }; }
      }
    }
    try {
      if (Object.keys(got).length) {
        const merged = { ...(old ? (JSON.parse(old.data) as Record<number, HomeRow>) : {}), ...got };
        await db.prepare(`INSERT INTO home_prices (hub, source, at, data, tried) VALUES (?1, 'goonmetrics', ?2, ?3, ?2)
          ON CONFLICT(hub) DO UPDATE SET source = excluded.source, at = excluded.at, data = excluded.data, tried = excluded.tried`).bind(hub.id, now, JSON.stringify(merged)).run();
        done[hub.short] = ok && !cut ? 'read' : 'partial';
      } else {
        // Nothing came back (a hub with fewer than three batches, all refused): the try is stamped so it isn't repeated hourly.
        if (old) await db.prepare('UPDATE home_prices SET tried = ?2 WHERE hub = ?1').bind(hub.id, now).run();
        done[hub.short] = 'failed';
      }
    } catch (e) {
      // A write that throws mustn't make the next hour read the whole hub again.
      error ??= e instanceof Error ? e.message : String(e);
      done[hub.short] = 'failed';
      try { if (old) await db.prepare('UPDATE home_prices SET tried = ?2 WHERE hub = ?1').bind(hub.id, now).run(); } catch { /* nothing more to do */ }
    }
  }
  return { done, error, stopped: false };
}

/** For `GET /v1/home/prices?hub=`: a hub's last good read, null before the first, or `off` when switched off. */
export async function homePrices(db: D1Database, hub: number, on = GOONMETRICS_ON): Promise<{ off: true } | { hub: number; source: string; at: string; prices: Record<string, HomeRow> } | null> {
  if (!HOME_HUBS.some((h) => h.id === hub)) throw new BadRequest('Not a hub the cloud reads');
  if (!on) return { off: true };
  const r = await db.prepare('SELECT hub, source, at, data FROM home_prices WHERE hub = ?1').bind(hub).first<{ hub: number; source: string; at: number; data: string }>();
  return r ? { hub: r.hub, source: r.source, at: new Date(r.at).toISOString(), prices: JSON.parse(r.data) } : null;
}
