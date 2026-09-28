/**
 * Once a day, checks of what the app claimed against what happened, like "Clears in" (predictions) but on a daily
 * clock: the Sniper's listings against what their items traded at since, and each ledger's share of the markets it
 * traded against its share setting, which sizes everything Prospects and the planner suggest.
 *
 * Run from the hourly job, the first time after 12:00 UTC each day: ESI's day of history is out at 11:05 EVE and
 * the day's scan starts at 11:25, so the history read here is mostly already in D1.
 */
import { JITA_44 } from '../../src/lib/constants';
import type { TxRecord } from '../../src/lib/esiRecords';
import { sanitizeSettings, type Settings } from '../../src/lib/fees';
import { measureShare, SHARE_DAYS, sharedTypes } from '../../src/lib/share';
import type { HistRow } from '../../src/lib/types';
import { eachHistory } from './hist';
import { settleSnipes } from './snipe';

type Env = { DB: D1Database };

const DAY = 86400_000;
/** The first hourly run at or after this hour (UTC) does the day's checks. */
const FROM_HOUR = 12;

export async function dailyChecks(env: Env, now = Date.now()) {
  const db = env.DB;
  const day = new Date(now).toISOString().slice(0, 10);
  if (new Date(now).getUTCHours() < FROM_HOUR) return { skipped: 'before 12:00' };
  const last = await db.prepare(`SELECT data FROM scan_meta WHERE key = 'checks'`).first<{ data: string }>();
  if (last && (JSON.parse(last.data) as { day?: string }).day === day) return { skipped: 'done today' };

  const snipes = await settleSnipes(db, now);
  const shares: Record<number, number | null | string> = {};
  const ledgers = (await db.prepare(`SELECT char_id FROM keys WHERE purpose = 'main'`).all<{ char_id: number }>()).results.map((r) => r.char_id);
  for (const id of ledgers) {
    try { shares[id] = (await measureShareFor(db, id, day, now)).suggested; } catch (e) { shares[id] = e instanceof Error ? e.message : String(e); }
  }
  const out = { day, at: now, snipes, shares };
  await db.prepare('INSERT INTO scan_meta (key, data) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET data = excluded.data').bind('checks', JSON.stringify(out)).run();
  return out;
}

/** What "Measure my share" in Settings measures, from the cloud's copy of the ledger, kept a row a day. */
async function measureShareFor(db: D1Database, charId: number, day: string, now: number) {
  const since = new Date(now - SHARE_DAYS * DAY).toISOString();
  const txs = (await db.prepare(`SELECT data FROM records WHERE char_id = ?1 AND kind = 'txs' AND data IS NOT NULL AND json_extract(data, '$.date') >= ?2`)
    .bind(charId, since).all<{ data: string }>()).results.map((r) => JSON.parse(r.data) as TxRecord);
  const types = sharedTypes(txs, JITA_44, 60, now);
  const history: Record<number, HistRow[]> = {};
  if (types.length) await eachHistory(db, types, now, (t, h) => { history[t] = h; }, { cap: 60 });
  const m = measureShare(txs, history, JITA_44, now);
  const row = await db.prepare(`SELECT data FROM docs WHERE char_id = ?1 AND key = 'settings'`).bind(charId).first<{ data: string }>();
  const settings = sanitizeSettings(row ? (JSON.parse(row.data) as Partial<Settings>) : null);
  await db.prepare(`INSERT INTO share_track (char_id, day, buy_median, sell_median, buy_days, sell_days, suggested, setting) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(char_id, day) DO UPDATE SET buy_median = excluded.buy_median, sell_median = excluded.sell_median, buy_days = excluded.buy_days,
      sell_days = excluded.sell_days, suggested = excluded.suggested, setting = excluded.setting`)
    .bind(charId, day, m.buyMedian, m.sellMedian, m.buyDays, m.sellDays, m.suggested, settings.share).run();
  return m;
}

/** The latest daily measurement of this ledger's share, or null before the first. */
export async function shareSummary(db: D1Database, charId: number) {
  const r = await db.prepare(`SELECT day, buy_median, sell_median, buy_days, sell_days, suggested, setting FROM share_track WHERE char_id = ?1 ORDER BY day DESC LIMIT 1`)
    .bind(charId).first<{ day: string; buy_median: number | null; sell_median: number | null; buy_days: number; sell_days: number; suggested: number | null; setting: number }>();
  return r ? { day: r.day, buyMedian: r.buy_median, sellMedian: r.sell_median, buyDays: r.buy_days, sellDays: r.sell_days, suggested: r.suggested, setting: r.setting } : null;
}
