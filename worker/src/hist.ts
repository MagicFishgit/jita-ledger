/**
 * The Forge's daily market history per item (PLEX's own market for PLEX), kept in D1 until ESI's copy expires
 * (it refreshes once a day, at 11:05 EVE). The daily full-market scan fills it for every item it checks, so the
 * alert rounds rarely need to fetch any themselves.
 */
import type { HistRow } from '../../src/lib/types';
import { HEADERS } from './eve';

const THE_FORGE = 10000002;
const PLEX = 44992;
const PLEX_MARKET = 19000001;
/** Rows kept: the scan's trend compares 30 days with 90, and history omits days nothing traded. */
export const HIST_ROWS = 100;

const inList = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `?${i + from}`).join(',');

/**
 * Hands each item's history to `use` as soon as it's known, keeping none of it: the full-market scan works through
 * thousands, and holding them all would not fit in a Worker's memory. From D1 where ESI's copy hasn't expired,
 * fetched otherwise (at most `cap`, `concurrency` at a time) and written back in batches as it goes. An item whose
 * fetch fails, or that the cap or deadline leaves out, is given its expired copy if there is one, read from D1 only
 * then: after 11:05 EVE every copy has expired, and loading them all up front (about 10 KB each) would not fit.
 */
export async function eachHistory(
  db: D1Database, types: number[], now: number, use: (typeId: number, rows: HistRow[]) => void,
  opts: { cap?: number; concurrency?: number; deadline?: number } = {},
): Promise<{ cached: number; fetched: number; failed: number; remaining: number }> {
  const due: number[] = [];
  const hasStale = new Set<number>();
  let cached = 0, fetched = 0, failed = 0;
  for (let i = 0; i < types.length; i += 90) {
    const part = types.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, CASE WHEN expires > ?1 THEN rows END AS rows FROM hist WHERE type_id IN (${inList(part.length, 2)})`).bind(now, ...part)
      .all<{ type_id: number; rows: string | null }>()).results;
    const seen = new Set<number>();
    for (const r of rows) {
      seen.add(r.type_id);
      if (r.rows != null) { use(r.type_id, JSON.parse(r.rows)); cached++; } else { due.push(r.type_id); hasStale.add(r.type_id); }
    }
    for (const t of part) if (!seen.has(t)) due.push(t);
  }
  const stale = async (ts: number[]) => {
    const want = ts.filter((t) => hasStale.has(t));
    for (let i = 0; i < want.length; i += 90) {
      const part = want.slice(i, i + 90);
      const rows = (await db.prepare(`SELECT type_id, rows FROM hist WHERE type_id IN (${inList(part.length)})`).bind(...part)
        .all<{ type_id: number; rows: string }>()).results;
      for (const r of rows) use(r.type_id, JSON.parse(r.rows));
    }
  };
  const fetchList = due.slice(0, opts.cap ?? Infinity);
  const set = db.prepare('INSERT INTO hist (type_id, expires, rows) VALUES (?1, ?2, ?3) ON CONFLICT(type_id) DO UPDATE SET expires = excluded.expires, rows = excluded.rows');
  let stmts: D1PreparedStatement[] = [];
  const flush = async () => { if (stmts.length) { const s = stmts; stmts = []; await db.batch(s); } };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 6, fetchList.length) }, async () => {
    // Past the deadline no new fetch starts: a long run saves what it has and the next one carries on.
    while (next < fetchList.length && !(opts.deadline && Date.now() > opts.deadline)) {
      const t = fetchList[next++];
      try {
        const res = await fetch(`https://esi.evetech.net/markets/${t === PLEX ? PLEX_MARKET : THE_FORGE}/history/?type_id=${t}`, { headers: HEADERS });
        if (!res.ok) throw new Error(String(res.status));
        const rows = ((await res.json()) as HistRow[]).slice(-HIST_ROWS);
        const exp = Date.parse(res.headers.get('Expires') ?? '');
        use(t, rows);
        fetched++;
        stmts.push(set.bind(t, Number.isFinite(exp) ? exp : now + 3600_000, JSON.stringify(rows)));
        if (stmts.length >= 100) await flush();
      } catch {
        failed++;
        await stale([t]).catch(() => undefined);
      }
    }
  }));
  await flush();
  // Due but not fetched (beyond the cap or the deadline): what they had is still better than nothing.
  const remaining = due.length - next;
  await stale(due.slice(next));
  return { cached, fetched, failed, remaining };
}

/** The same, collected: for the alert rounds, which ask about a handful of items. */
export async function histories(db: D1Database, types: number[], now: number, cap = 60): Promise<Record<number, HistRow[]>> {
  const out: Record<number, HistRow[]> = {};
  await eachHistory(db, types, now, (t, rows) => { out[t] = rows; }, { cap });
  return out;
}
