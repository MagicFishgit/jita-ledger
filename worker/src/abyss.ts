/**
 * Abyss Tracker's figures for the Abyssal page (src/lib/abyssTracker.ts says what they are). Its API is public but sends
 * no CORS header, so the cloud reads it: the 35 tier-and-weather summaries once a day, one request at a time with a pause
 * between (the hourly job, when the oldest is over 20 hours old), and a fit's EFT and performance when the page opens it,
 * kept a week. Every request names itself as a hobby tool; nothing about other pilots is kept.
 */

import { compactCell, compactPerformance, type TrackerCell, type TrackerFitDetail } from '../../src/lib/abyssTracker';
import { BadRequest } from './sync';

const API = 'https://webapi.abysstracker.com';
const HEADERS = { 'User-Agent': 'jita-ledger (hobby tool)', Accept: 'application/json' };
const CELL_AGE = 20 * 3600_000;
const FIT_AGE = 7 * 86400_000;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Abyss Tracker answered ${res.status} for ${path.split('?')[0]}`);
  const body = (await res.json()) as { success?: boolean; result?: Record<string, unknown>; message?: string };
  if (!body.success) throw new Error(`Abyss Tracker: ${body.message ?? 'no result'} for ${path.split('?')[0]}`);
  return body.result ?? null;
}

/** Refresh the cells over 20 hours old, oldest first. Returns how many were read, and the first failure if any. */
export async function refreshAbyss(db: D1Database, now = Date.now()): Promise<{ read: number; error: string | null }> {
  const rows = (await db.prepare(`SELECT tier, weather, at FROM abyss_cells`).all<{ tier: number; weather: number; at: number }>()).results;
  const at = new Map(rows.map((r) => [`${r.tier}:${r.weather}`, r.at]));
  const due: [number, number][] = [];
  for (let tier = 0; tier <= 6; tier++) for (let weather = 0; weather <= 4; weather++) {
    if (now - (at.get(`${tier}:${weather}`) ?? 0) > CELL_AGE) due.push([tier, weather]);
  }
  due.sort((a, b) => (at.get(`${a[0]}:${a[1]}`) ?? 0) - (at.get(`${b[0]}:${b[1]}`) ?? 0));
  let read = 0, failedInARow = 0;
  let error: string | null = null;
  for (const [tier, weather] of due) {
    try {
      const result = await get(`/Overview/GetOverviewData?tier=${tier}&weather=${weather}`);
      failedInARow = 0;
      if (result) {
        const cell = compactCell(tier, weather, Date.now(), result);
        await db.prepare(`INSERT INTO abyss_cells (tier, weather, at, json) VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT (tier, weather) DO UPDATE SET at = excluded.at, json = excluded.json`).bind(tier, weather, cell.at, JSON.stringify(cell)).run();
        read++;
      }
    } catch (e) {
      // A third party being down leaves yesterday's figures standing; the page says how old they are. One cell failing
      // is passed over (it's the oldest, so it comes first next hour and would otherwise hold every other cell back for
      // good); three in a row is the site being down, so the rest wait for the next hour.
      error ??= e instanceof Error ? e.message : String(e);
      if (++failedInARow >= 3) break;
    }
    await pause(800);
  }
  return { read, error };
}

export async function abyssCells(db: D1Database): Promise<TrackerCell[]> {
  const rows = (await db.prepare(`SELECT json FROM abyss_cells ORDER BY tier, weather`).all<{ json: string }>()).results;
  return rows.map((r) => JSON.parse(r.json) as TrackerCell);
}

/** A fit's EFT and performance, from the week's copy or Abyss Tracker. The ID is Abyss Tracker's (a GUID). */
export async function abyssFit(db: D1Database, id: string, now = Date.now()): Promise<TrackerFitDetail> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequest('Not an Abyss Tracker fit ID');
  const row = await db.prepare(`SELECT at, json FROM abyss_fits WHERE id = ?1`).bind(id).first<{ at: number; json: string }>();
  if (row && now - row.at < FIT_AGE) return JSON.parse(row.json) as TrackerFitDetail;
  const eft = await get(`/Fit/GetEftById?id=${id}&type=eft`);
  await pause(300);
  let missed = false;
  const perf = await get(`/Fit/GetPerformanceById?id=${id}`).catch(() => { missed = true; return null; });
  await pause(300);
  const tts = await get(`/Fit/GetTierTypeStats?fitId=${id}`).catch(() => { missed = true; return null; });
  const detail: TrackerFitDetail = { id, at: now, eft: String(eft?.eft ?? ''), perf: compactPerformance(perf, tts) };
  if (!detail.eft) throw new Error('Abyss Tracker gave no fit for that ID');
  // A fit whose performance reads failed isn't kept, either of them: without the survival figures (GetTierTypeStats) it
  // would say "not run there" everywhere for a week over one bad answer. It's asked again next time.
  if (missed) return detail;
  await db.prepare(`INSERT INTO abyss_fits (id, at, json) VALUES (?1, ?2, ?3) ON CONFLICT (id) DO UPDATE SET at = excluded.at, json = excluded.json`)
    .bind(id, now, JSON.stringify(detail)).run();
  return detail;
}
