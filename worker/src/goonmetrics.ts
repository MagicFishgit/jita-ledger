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
/** How old a hub's row may be before the round reads it again. */
export const REFRESH_MS = HOME_REFRESH_MS;
const PAUSE_MS = 1500;
const PER_CALL = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reads each hub whose row is six hours old or more. Returns what it did: per hub read, skipped (fresh) or failed (with the
 * first error), and whether three failures in a row stopped it. `pause` and `on` are for the tests.
 */
export async function refreshHomePrices(db: D1Database, now = Date.now(), types: readonly number[] = (INDUSTRY as { watch: number[] }).watch, pause: (ms: number) => Promise<unknown> = sleep, on = GOONMETRICS_ON) {
  if (!on) return { off: true as const };
  const rows = (await db.prepare('SELECT hub, at FROM home_prices').all<{ hub: number; at: number }>()).results;
  const at = new Map(rows.map((r) => [r.hub, r.at]));
  const done: Record<string, 'read' | 'fresh' | 'failed'> = {};
  let error: string | null = null, inARow = 0, calls = 0;
  for (const hub of HOME_HUBS) {
    if (now - (at.get(hub.id) ?? 0) < REFRESH_MS) { done[hub.short] = 'fresh'; continue; }
    const got: Record<number, HomeRow> = {};
    let ok = true;
    for (let i = 0; i < types.length; i += PER_CALL) {
      if (calls++) await pause(PAUSE_MS);
      try {
        const res = await fetch(`${API}?station_id=${hub.id}&type_id=${types.slice(i, i + PER_CALL).join(',')}`, { headers: HEADERS });
        if (!res.ok) { await res.body?.cancel(); throw new Error(`Goonmetrics answered ${res.status} for ${hub.short}`); }
        Object.assign(got, parseGoonmetrics(await res.text()));
        inARow = 0;
      } catch (e) {
        ok = false;
        error ??= e instanceof Error ? e.message : String(e);
        if (++inARow >= 3) { done[hub.short] = 'failed'; return { done, error, stopped: true }; }
      }
    }
    if (!ok) { done[hub.short] = 'failed'; continue; }
    await db.prepare(`INSERT INTO home_prices (hub, source, at, data) VALUES (?1, 'goonmetrics', ?2, ?3)
      ON CONFLICT(hub) DO UPDATE SET source = excluded.source, at = excluded.at, data = excluded.data`).bind(hub.id, now, JSON.stringify(got)).run();
    done[hub.short] = 'read';
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
