/**
 * The mining ledger, watched: every ten minutes (ESI's cache on it) the cloud reads each ledger's mining, and each of its alts', keeps what
 * grew since the read before as ticks (when you were mining, and how much), and pushes the rows that changed as the
 * app's own mining records, so they outlive ESI's 30 days whether or not a browser is open. The app turns ticks into
 * sessions and ISK an hour (src/lib/mining.ts). Needs esi-industry.read_character_mining.v1 on the cloud's login.
 */
import { isBaseline, miningKey, miningSnapshot, miningTicks, readMining, READ_EVERY_MS, type RawMining } from '../../src/lib/mining';
import { esiAll, esiGet, readerLogin, stillKept, type Reader } from './eve';
import { noteJob } from './archive';
import { push } from './sync';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };

const SCOPE = 'esi-industry.read_character_mining.v1';
/** The ship you're in, read with the ledger so each tick knows its hull. */
const SHIP_SCOPE = 'esi-location.read_ship_type.v1';
/** Ticks kept: enough for a quarter's sessions. */
const KEEP_MS = 90 * 86400_000;

/**
 * One character's read, when ten minutes have passed since its last. `who` says whose login is used and whose data
 * it is (eve.ts, Reader): every row here is filed under `who.char`. Returns how many ticks it kept, or null when it
 * didn't read (not due, no login, no permission) or the character was removed while it was being read.
 */
export async function readMiningRound(env: Env, who: Reader, now = Date.now()): Promise<number | null> {
  const db = env.DB;
  const char = who.char;
  const state = await db.prepare('SELECT at, data FROM mining_state WHERE char_id = ?1').bind(char).first<{ at: number; data: string }>();
  // A little under ESI's ten minutes, so a round a few seconds early doesn't wait another five.
  if (state && now - state.at < READ_EVERY_MS - 60_000) return null;
  const login = await readerLogin(env, who);
  if (!login || !login.scopes.includes(SCOPE)) return null;
  const rows = readMining(await esiAll<RawMining>(`/characters/${char}/mining/`, { token: login.access }), char);
  // A snapshot too old to compare with is only a baseline (mining.ts, isBaseline): no ticks from this read.
  const prev = state && !isBaseline(state.at, now) ? (JSON.parse(state.data) as Record<string, number>) : null;
  // The hull you're in now stands for the ten minutes before: the read before would have seen a change of ship. Read
  // every time, a baseline included, and kept on the snapshot: an alt's "right now" is this.
  const ship = login.scopes.includes(SHIP_SCOPE)
    ? await esiGet<{ ship_type_id: number }>(`/characters/${char}/ship/`, { token: login.access }).then((r) => r.data.ship_type_id).catch(() => null)
    : null;
  const ticks = miningTicks(prev, rows, now);
  if (!(await stillKept(db, who))) return null;
  const stmts = [
    db.prepare(`INSERT INTO mining_state (char_id, at, data, ship_type_id) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(char_id) DO UPDATE SET at = excluded.at, data = excluded.data, ship_type_id = excluded.ship_type_id`)
      .bind(char, now, JSON.stringify(miningSnapshot(rows)), ship),
    ...ticks.map((t) => db.prepare('INSERT INTO mining_ticks (char_id, at, system_id, type_id, qty, ship_type_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(char, t.at, t.systemId, t.typeId, t.qty, ship)),
    db.prepare('DELETE FROM mining_ticks WHERE char_id = ?1 AND at < ?2').bind(char, now - KEEP_MS),
  ];
  await db.batch(stmts);
  // Rows that grew (or are new) go up as records, like the app's own sync makes them. The first read sends them all;
  // so does one after a gap, measured against the stored snapshot whatever its age: the records are the ledger itself.
  const stored = state ? (JSON.parse(state.data) as Record<string, number>) : null;
  const changed = rows.filter((r) => !stored || stored[miningKey(r)] !== r.qty);
  if (changed.length) await push(db, char, { records: changed.map((r) => ({ k: 'mining', i: miningKey(r), d: r })), docs: [] });
  await noteJob(db, char, 'mining', { ok: true, detail: { rows: rows.length, ticks: ticks.length, pushed: changed.length } });
  return ticks.length;
}

/** The ticks of the last `days`, for the app's sessions. */
export async function miningTicksFor(db: D1Database, charId: number, days: number, now = Date.now()) {
  return (await db.prepare('SELECT at, system_id AS systemId, type_id AS typeId, qty, ship_type_id AS shipTypeId FROM mining_ticks WHERE char_id = ?1 AND at > ?2 ORDER BY at')
    .bind(charId, now - Math.min(90, Math.max(1, days)) * 86400_000).all<{ at: number; systemId: number; typeId: number; qty: number; shipTypeId: number | null }>()).results;
}
