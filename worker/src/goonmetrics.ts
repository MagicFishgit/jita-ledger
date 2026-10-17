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
 * Where each hub's next round starts, and the types no round has reached since (scan_meta 'goonmetrics'; Industry stage 4, correction
 * 16). A round that starts from the first batch every time and is always cut at the same call (a rate limit) never reaches its last
 * batches; starting after the last batch tried covers them over a few rounds. A hub read before this was kept takes its row as read.
 */
type RoundState = { next: Record<string, number>; unread: Record<string, number[]> };
async function roundState(db: D1Database): Promise<RoundState> {
  try {
    const r = await db.prepare(`SELECT data FROM scan_meta WHERE key = 'goonmetrics'`).first<{ data: string }>();
    const s = r ? (JSON.parse(r.data) as Partial<RoundState>) : {};
    return { next: s.next ?? {}, unread: s.unread ?? {} };
  } catch { return { next: {}, unread: {} }; }
}

/**
 * Reads each hub that is due: its last try (good or not) at least REFRESH_MS less the slack ago. However a round went, a hub is
 * not read again before then, with one exception: a hub none of whose calls came back when three failed in a row stopped the round isn't stamped, so the next hour
 * tries again (three calls at most while the site is down); one some of whose batches came back is merged and stamped (partial). The batches that succeeded are merged over the last good row's
 * types, so a batch Goonmetrics keeps refusing doesn't lose the rest, and the hub's `at` is when they were read. A call whose
 * answer isn't Goonmetrics' price data (a 200 with an HTML or error page) fails like any other. Returns what it did per hub: read,
 * partial (some batches failed or time ran out), fresh, later (out of time before it began) or failed. `pause`, `on` and
 * `deadline` (a time past which no call starts) are for the tests and the cron.
 */
export async function refreshHomePrices(db: D1Database, now = Date.now(), types: readonly number[] = (INDUSTRY as { watch: number[] }).watch, pause: (ms: number) => Promise<unknown> = sleep, on = GOONMETRICS_ON, deadline = Infinity) {
  if (!on) return { off: true as const };
  const rows = (await db.prepare('SELECT hub, at, tried, data FROM home_prices').all<{ hub: number; at: number; tried: number; data: string }>()).results;
  const kept = new Map(rows.map((r) => [r.hub, r]));
  const state = await roundState(db);
  const wanted = new Set(types);
  const done: Record<string, 'read' | 'partial' | 'fresh' | 'later' | 'failed'> = {};
  let error: string | null = null, inARow = 0, calls = 0;
  // A hub's try is stamped on its row, or on a stub (at 0: never read) when it has none yet.
  const stamp = (hub: number) => db.prepare(`INSERT INTO home_prices (hub, source, at, data, tried) VALUES (?1, 'goonmetrics', 0, '{}', ?2)
    ON CONFLICT(hub) DO UPDATE SET tried = excluded.tried`).bind(hub, now).run();
  // Writes what a hub's batches brought (merged over its last good row, pruned to the types asked for now) and stamps the try;
  // with nothing back, only the stamp. It sets done[hub] itself.
  const save = async (hub: (typeof HOME_HUBS)[number], old: { data: string } | undefined, got: Record<number, HomeRow>, how: 'read' | 'partial'): Promise<boolean> => {
    try {
      if (Object.keys(got).length) {
        // Pruned to the types asked for now, so one that has left the watch set doesn't stay in the row for good.
        const merged = Object.fromEntries(Object.entries({ ...(old ? (JSON.parse(old.data) as Record<number, HomeRow>) : {}), ...got }).filter(([t]) => wanted.has(Number(t))));
        await db.prepare(`INSERT INTO home_prices (hub, source, at, data, tried) VALUES (?1, 'goonmetrics', ?2, ?3, ?2)
          ON CONFLICT(hub) DO UPDATE SET source = excluded.source, at = excluded.at, data = excluded.data, tried = excluded.tried`).bind(hub.id, now, JSON.stringify(merged)).run();
        done[hub.short] = how;
      } else {
        // Nothing came back (a hub with fewer than three batches, all refused): the try is stamped so it isn't repeated hourly.
        await stamp(hub.id);
        done[hub.short] = 'failed';
      }
      return true;
    } catch (e) {
      // A write that throws mustn't make the next hour read the whole hub again.
      error ??= e instanceof Error ? e.message : String(e);
      done[hub.short] = 'failed';
      // With no row yet, a stub (at 0: never read) carries the stamp; if even that throws, say so and move on.
      try { await stamp(hub.id); } catch (e2) { console.error('goonmetrics: could not stamp the try', e2); }
      return false;
    }
  };
  // Where the hub's next round starts (after the last batch tried, or where this one started when it tried them all), and which of
  // its types no round has reached since: the old list (all of them for a hub never read, none for one read before this was kept),
  // less every batch that came back, when the save stored them (a write that threw must not mark types reached that the row lacks).
  const settle = (hub: number, old: unknown, start: number, tried: number, n: number, came: number[], batches: number[][], stored: boolean) => {
    state.next[hub] = tried >= n ? start : (start + tried) % n;
    const back = new Set(stored ? came.flatMap((k) => batches[k]) : []);
    state.unread[hub] = (state.unread[hub] ?? (old ? [] : [...types])).filter((t) => wanted.has(t) && !back.has(t));
  };
  // Kept, or said in the log: a write that throws (even in `prepare`, as the stage-1 test's broken D1 does) never stops the round.
  const keepState = async () => {
    try { await db.prepare('INSERT INTO scan_meta (key, data) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET data = excluded.data').bind('goonmetrics', JSON.stringify(state)).run(); }
    catch (e) { console.error('goonmetrics: could not keep where the round stopped', e); }
  };
  for (const hub of HOME_HUBS) {
    const old = kept.get(hub.id);
    if (now - Math.max(old?.tried ?? 0, old?.at ?? 0) < REFRESH_MS - REFRESH_SLACK_MS) { done[hub.short] = 'fresh'; continue; }
    if (Date.now() > deadline) { done[hub.short] = 'later'; continue; }
    const got: Record<number, HomeRow> = {};
    let ok = true, cut = false;
    const batches: number[][] = [];
    for (let i = 0; i < types.length; i += PER_CALL) batches.push(types.slice(i, i + PER_CALL));
    const n = batches.length, start = (state.next[hub.id] ?? 0) % Math.max(1, n);
    const came: number[] = [];
    let tried = 0;
    for (let j = 0; j < n; j++) {
      const k = (start + j) % n, ask = batches[k];
      if (Date.now() > deadline) { cut = true; break; }
      if (calls++) await pause(PAUSE_MS);
      tried++;
      try {
        const res = await fetch(`${API}?station_id=${hub.id}&type_id=${ask.join(',')}`, { headers: HEADERS, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
        if (!res.ok) { await res.body?.cancel(); throw new Error(`Goonmetrics answered ${res.status} for ${hub.short}`); }
        const body = await res.text();
        const parsed = body.includes('<price_data') ? parseGoonmetrics(body) : {};
        if (!ask.some((t) => parsed[t])) throw new Error(`Goonmetrics answered something other than prices for ${hub.short}`);
        Object.assign(got, parsed);
        came.push(k);
        inARow = 0;
      } catch (e) {
        ok = false;
        error ??= e instanceof Error ? e.message : String(e);
        if (++inARow >= 3) {
          // Batches of this hub that did come are kept and the hub stamped (partial): throwing them away read the same hub again
          // every hour. A hub none of whose calls came back is left unstamped: the site is down, three calls an hour at most.
          let stored = false;
          if (Object.keys(got).length) stored = await save(hub, old, got, 'partial'); else done[hub.short] = 'failed';
          settle(hub.id, old, start, tried, n, came, batches, stored);
          await keepState();
          return { done, error, stopped: true };
        }
      }
    }
    const stored = await save(hub, old, got, ok && !cut ? 'read' : 'partial');
    settle(hub.id, old, start, tried, n, came, batches, stored);
  }
  await keepState();
  return { done, error, stopped: false };
}

/** For `GET /v1/home/prices?hub=`: a hub's last good read, null before the first, or `off` when switched off. */
export async function homePrices(db: D1Database, hub: number, on = GOONMETRICS_ON): Promise<{ off: true } | { hub: number; source: string; at: string; prices: Record<string, HomeRow>; unread?: number[] } | null> {
  if (!HOME_HUBS.some((h) => h.id === hub)) throw new BadRequest('Not a hub the cloud reads');
  if (!on) return { off: true };
  const r = await db.prepare('SELECT hub, source, at, data FROM home_prices WHERE hub = ?1').bind(hub).first<{ hub: number; source: string; at: number; data: string }>();
  // A stub row (at 0) only carries a try's stamp: the hub was never read.
  if (!r || r.at <= 0) return null;
  const unread = (await roundState(db)).unread[hub] ?? [];
  return { hub: r.hub, source: r.source, at: new Date(r.at).toISOString(), prices: JSON.parse(r.data), ...(unread.length ? { unread } : {}) };
}
