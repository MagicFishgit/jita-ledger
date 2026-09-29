/**
 * The mining ledger: what you mined, by day, system and ore, from ESI (GET /characters/{id}/mining, scope
 * esi-industry.read_character_mining.v1: one row per day, system and type with its quantity, the last 30 days, cached 10
 * minutes). The rows are kept as records so they outlive ESI's 30 days, each with the character that mined it, so a
 * multiboxed fleet is more characters rather than a rebuild (the user's plan, 29 September 2026). Pure.
 */

export type RawMining = { date: string; solar_system_id: number; type_id: number; quantity: number };

export type MiningRecord = { charId: number; date: string; systemId: number; typeId: number; qty: number };

export const miningKey = (r: Pick<MiningRecord, 'charId' | 'date' | 'systemId' | 'typeId'>): string => `${r.charId}:${r.date}:${r.systemId}:${r.typeId}`;

export function readMining(raw: RawMining[], charId: number): MiningRecord[] {
  return raw.filter((x) => x.quantity > 0).map((x) => ({ charId, date: x.date, systemId: x.solar_system_id, typeId: x.type_id, qty: x.quantity }));
}

/**
 * What was mined since the last read, from two reads of the ledger: each row's quantity grown since. The cloud reads it
 * every 10 minutes (ESI's cache), so each tick is roughly 10 minutes of mining, which is what sessions are made of. The
 * first read is only a baseline (nothing can be said about when it was mined); a row that shrank (ESI correcting
 * itself) says nothing either.
 */
export type MiningTick = { at: number; systemId: number; typeId: number; qty: number };

export function miningTicks(prev: Record<string, number> | null, now: MiningRecord[], at: number): MiningTick[] {
  if (!prev) return [];
  const out: MiningTick[] = [];
  for (const r of now) {
    const grew = r.qty - (prev[miningKey(r)] ?? 0);
    if (grew > 0) out.push({ at, systemId: r.systemId, typeId: r.typeId, qty: grew });
  }
  return out;
}

/** A read of the ledger as the next one is compared against. */
export const miningSnapshot = (rows: MiningRecord[]): Record<string, number> => Object.fromEntries(rows.map((r) => [miningKey(r), r.qty]));

/** How far apart the cloud's reads are: ESI's cache on the ledger. */
export const READ_EVERY_MS = 10 * 60_000;
/** Ticks this far apart or more belong to different sessions: one quiet read is a break, two are a new session. */
export const SESSION_GAP_MS = 25 * 60_000;

export type MiningSession = {
  /** When mining started (up to a read before the first tick) and the last read that saw any. */
  start: number; end: number;
  /** Units by ore, and the systems it was in. */
  byType: Record<number, number>; systems: number[];
};

/**
 * Mining sessions from the cloud's ticks: runs of ticks no more than SESSION_GAP_MS apart. A tick says something was
 * mined in the read window before it, so a session starts one read interval before its first tick; its length is
 * good to about ten minutes either way, which is ESI's cache, not something the app can sharpen.
 */
export function miningSessions(ticks: MiningTick[], every = READ_EVERY_MS, gap = SESSION_GAP_MS): MiningSession[] {
  const sorted = [...ticks].sort((a, b) => a.at - b.at);
  const out: MiningSession[] = [];
  let cur: MiningSession | null = null;
  for (const t of sorted) {
    if (!cur || t.at - cur.end > gap) {
      cur = { start: t.at - every, end: t.at, byType: {}, systems: [] };
      out.push(cur);
    }
    cur.end = t.at;
    cur.byType[t.typeId] = (cur.byType[t.typeId] ?? 0) + t.qty;
    if (!cur.systems.includes(t.systemId)) cur.systems.push(t.systemId);
  }
  return out;
}
