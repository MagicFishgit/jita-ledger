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
export type MiningTick = { at: number; systemId: number; typeId: number; qty: number; shipTypeId?: number | null };

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

/**
 * Whether the stored snapshot is too old to compare with. What grew since it could have been mined at any time in
 * between, and a tick says "mined in the ten minutes before this read": after a refused login or a removed and
 * re-added character, one read would otherwise turn a day's mining into a single tick, which the sessions then show
 * as ten minutes of impossible yield. Such a read only sets a new baseline.
 */
export const isBaseline = (prevAt: number | null | undefined, now: number): boolean => prevAt == null || now - prevAt > SESSION_GAP_MS;

export type MiningSession = {
  /** When mining started (up to a read before the first tick) and the last read that saw any. */
  start: number; end: number;
  /** Units by ore, and the systems it was in. */
  byType: Record<number, number>; systems: number[];
  /** The ship it was mined in, when the cloud could read it: the one most ticks were in. */
  ship: number | null;
};

/**
 * Mining sessions from the cloud's ticks: runs of ticks no more than SESSION_GAP_MS apart. A tick says something was
 * mined in the read window before it, so a session starts one read interval before its first tick; its length is
 * good to about ten minutes either way, which is ESI's cache, not something the app can sharpen.
 */
export function miningSessions(ticks: MiningTick[], every = READ_EVERY_MS, gap = SESSION_GAP_MS): MiningSession[] {
  const sorted = [...ticks].sort((a, b) => a.at - b.at);
  const out: MiningSession[] = [];
  const ships: Record<number, number>[] = [];
  let cur: MiningSession | null = null;
  for (const t of sorted) {
    if (!cur || t.at - cur.end > gap) {
      cur = { start: t.at - every, end: t.at, byType: {}, systems: [], ship: null };
      out.push(cur);
      ships.push({});
    }
    cur.end = t.at;
    cur.byType[t.typeId] = (cur.byType[t.typeId] ?? 0) + t.qty;
    if (!cur.systems.includes(t.systemId)) cur.systems.push(t.systemId);
    if (t.shipTypeId) { const s = ships[ships.length - 1]; s[t.shipTypeId] = (s[t.shipTypeId] ?? 0) + t.qty; }
  }
  out.forEach((s, i) => { const top = Object.entries(ships[i]).sort((a, b) => b[1] - a[1])[0]; s.ship = top ? Number(top[0]) : null; });
  return out;
}

// --- What it was worth ----------------------------------------------------------------------------------------------

/**
 * An ore's worth a unit, three ways, each after sales tax: its own Jita bid, its compressed form's bid (compression keeps
 * one unit for one, at a hundredth of the volume), or reprocessed at your yield into minerals sold into the bids (less the
 * refinery's tax). The best is what it's valued at; null where there's no bid.
 */
export type OreWorth = { raw: number | null; compressed: number | null; reprocessed: number | null };
export type Way = keyof OreWorth;

export function bestWay(w: OreWorth): { way: Way; perUnit: number } | null {
  let best: { way: Way; perUnit: number } | null = null;
  for (const way of ['raw', 'compressed', 'reprocessed'] as Way[]) {
    const v = w[way];
    if (v != null && v > 0 && (!best || v > best.perUnit)) best = { way, perUnit: v };
  }
  return best;
}

export type DayTotal = { date: string; units: number; m3: number; isk: number };

/** Each of the last `days` days (oldest first, today last), with what was mined and its worth; a day without mining is zero. */
export function byDay(records: MiningRecord[], days: number, today: string, volumeOf: (t: number) => number | null, worthOf: (t: number) => number | null): DayTotal[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  const out: DayTotal[] = Array.from({ length: days }, (_, i) => ({ date: new Date(end - (days - 1 - i) * 86400_000).toISOString().slice(0, 10), units: 0, m3: 0, isk: 0 }));
  const at = new Map(out.map((d, i) => [d.date, i]));
  for (const r of records) {
    const i = at.get(r.date);
    if (i == null) continue;
    out[i].units += r.qty;
    out[i].m3 += r.qty * (volumeOf(r.typeId) ?? 0);
    out[i].isk += r.qty * (worthOf(r.typeId) ?? 0);
  }
  return out;
}

export type OreTotal = { typeId: number; units: number; m3: number; isk: number; systems: number[]; days: number };

/** Each ore mined in the records, biggest worth first. */
export function byOre(records: MiningRecord[], volumeOf: (t: number) => number | null, worthOf: (t: number) => number | null): OreTotal[] {
  const m = new Map<number, OreTotal & { dates: Set<string> }>();
  for (const r of records) {
    const cur = m.get(r.typeId) ?? { typeId: r.typeId, units: 0, m3: 0, isk: 0, systems: [], days: 0, dates: new Set<string>() };
    cur.units += r.qty;
    cur.m3 += r.qty * (volumeOf(r.typeId) ?? 0);
    cur.isk += r.qty * (worthOf(r.typeId) ?? 0);
    if (!cur.systems.includes(r.systemId)) cur.systems.push(r.systemId);
    cur.dates.add(r.date);
    m.set(r.typeId, cur);
  }
  return [...m.values()].map(({ dates, ...o }) => ({ ...o, days: dates.size })).sort((a, b) => b.isk - a.isk || b.m3 - a.m3);
}

export type SessionStats = { minutes: number; m3: number; isk: number; m3PerMin: number; iskPerHour: number };

/** A session's size and pace. Its length is good to about ten minutes (ESI's cache on the ledger). */
export function sessionStats(s: MiningSession, volumeOf: (t: number) => number | null, worthOf: (t: number) => number | null): SessionStats {
  const minutes = Math.max(1, (s.end - s.start) / 60_000);
  let m3 = 0, isk = 0;
  for (const [t, q] of Object.entries(s.byType)) { m3 += q * (volumeOf(Number(t)) ?? 0); isk += q * (worthOf(Number(t)) ?? 0); }
  return { minutes, m3, isk, m3PerMin: m3 / minutes, iskPerHour: (isk / minutes) * 60 };
}

/** The middle of a list, or null. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// --- Scaling up --------------------------------------------------------------------------------------------------------

/** Hours of mining a step pays for itself in: what it costs over what it adds an hour. Null when it adds nothing. */
export function paybackHours(cost: number, fromM3PerMin: number, toM3PerMin: number, iskPerM3: number): number | null {
  const gain = (toM3PerMin - fromM3PerMin) * 60 * iskPerM3;
  return gain > 0 && cost > 0 ? cost / gain : null;
}

/**
 * What a set of mining records comes to: units, m³ and ISK at the valuation given. An ore with no known volume makes
 * the m³ unknown rather than short; one with no price adds nothing to the ISK, and `priced` of `ores` says how many
 * were. The Characters page's "Mined" is this: an estimate beside what was earned, never part of it.
 */
export function minedTotal(records: MiningRecord[], volumeOf: (t: number) => number | null, worthOf: (t: number) => number | null) {
  const by = new Map<number, number>();
  for (const r of records) by.set(r.typeId, (by.get(r.typeId) ?? 0) + r.qty);
  let units = 0, m3: number | null = 0, isk = 0, priced = 0;
  for (const [t, q] of by) {
    units += q;
    const v = volumeOf(t);
    m3 = m3 == null || v == null ? null : m3 + q * v;
    const w = worthOf(t);
    if (w != null) { isk += q * w; priced++; }
  }
  return { units, m3, isk, priced, ores: by.size };
}

// --- Across characters -------------------------------------------------------------------------------------------------

export type CharTick = MiningTick & { charId: number };
export type CharSession = MiningSession & { charId: number };

/**
 * Sessions built one character at a time, then all of them in start order. Two characters mining at once read their
 * ledgers in the same rounds, so their ticks interleave a read apart: built together they would be one session with both
 * ores summed and a doubled pace.
 */
export function sessionsByCharacter(ticks: CharTick[], every = READ_EVERY_MS, gap = SESSION_GAP_MS): CharSession[] {
  const by = new Map<number, CharTick[]>();
  for (const t of ticks) { const l = by.get(t.charId); if (l) l.push(t); else by.set(t.charId, [t]); }
  const out: CharSession[] = [];
  for (const [charId, list] of by) for (const s of miningSessions(list, every, gap)) out.push({ ...s, charId });
  return out.sort((a, b) => a.start - b.start || a.charId - b.charId);
}

export type CharTotals = { units: number; m3: number | null; isk: number; priced: number; ores: number; days: number };

/** Each character's mining: `minedTotal` plus the days it mined on. */
export function perCharacter(records: MiningRecord[], volumeOf: (t: number) => number | null, worthOf: (t: number) => number | null): Map<number, CharTotals> {
  const by = new Map<number, MiningRecord[]>();
  for (const r of records) { const l = by.get(r.charId); if (l) l.push(r); else by.set(r.charId, [r]); }
  const out = new Map<number, CharTotals>();
  for (const [charId, list] of by) out.set(charId, { ...minedTotal(list, volumeOf, worthOf), days: new Set(list.map((r) => r.date)).size });
  return out;
}

/**
 * An alt's right-now from the cloud: the ship at its last mining read, and whether its ledger grew in that read or the one
 * before. `at` is that read's time however old it is, since the page says how old; where the alt is and whether it is
 * logged in aren't read.
 */
export function altRightNow(entry: { ship: number | null; shipAt: number | null }, ticks: { at: number }[], every = READ_EVERY_MS): { ship: number | null; at: number | null; mining: boolean } {
  if (entry.shipAt == null) return { ship: null, at: null, mining: false };
  const from = entry.shipAt - every;
  return { ship: entry.ship, at: entry.shipAt, mining: ticks.some((t) => t.at >= from) };
}
