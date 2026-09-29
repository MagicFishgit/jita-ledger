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

/**
 * The ladder, for a solo miner in high-sec who means to grow into a fleet. Each rung's ship, the mining module it fits
 * and how many, and a yield where EVE University publishes one (for an average-skilled pilot; its Mining page, May 2026):
 * Venture with two Miner I about 250 m³ a minute, Retriever with two Strip Miner I about 840, a Hulk mining solo about
 * 1,600. Where none is published the rung has none, rather than a guess. The skills each needs come from ESI (the ship's
 * and module's own requirements), the prices from Jita.
 */
export type RungKey = 'venture' | 'barge' | 'exhumer' | 'fleet';
export type Rung = {
  key: RungKey; title: string;
  /** The ship this rung is priced on, and others that fill the same rung. */
  ship: number; alternatives: { typeId: number; why: string }[];
  module: { typeId: number; count: number } | null;
  /** m³ a minute for an average pilot, with where the figure is from; null when nobody publishes one. */
  m3PerMin: number | null; source: string | null;
  what: string;
};

export const RUNGS: Rung[] = [
  {
    key: 'venture', title: 'Venture', ship: 32880, alternatives: [{ typeId: 89240, why: 'the Pioneer, a mining destroyer: more yield and hold, little more training' }],
    module: { typeId: 483, count: 2 }, m3PerMin: 250, source: 'EVE University, an average pilot with two Miner I',
    what: 'The mining frigate: cheap, quick to train, a small ore hold. Where everyone starts.',
  },
  {
    key: 'barge', title: 'Retriever', ship: 17478, alternatives: [{ typeId: 17480, why: 'the Procurer, for a tank that survives gankers' }, { typeId: 17476, why: 'the Covetor, for yield with a small hold' }],
    module: { typeId: 17482, count: 2 }, m3PerMin: 840, source: 'EVE University, an average pilot with two Strip Miner I',
    what: 'A mining barge: several times a Venture, and the Retriever’s 27,500 m³ hold means fewer trips to the station.',
  },
  {
    key: 'exhumer', title: 'Hulk', ship: 22544, alternatives: [{ typeId: 22546, why: 'the Skiff, the tanky one, safer solo in high-sec' }, { typeId: 22548, why: 'the Mackinaw, a 31,500 m³ hold for long unattended runs' }],
    module: { typeId: 17912, count: 2 }, m3PerMin: 1600, source: 'EVE University, a Hulk mining solo',
    what: 'The tech II barges. The Hulk mines most and is a ganker’s favourite; solo in high-sec the Skiff or Mackinaw often pays better for staying alive.',
  },
  {
    key: 'fleet', title: 'A boosted fleet', ship: 42244, alternatives: [{ typeId: 28606, why: 'the Orca: bigger boosts, a 150,000 m³ ore hold and a fleet hangar' }],
    module: null, m3PerMin: null, source: null,
    what: 'A Porpoise or Orca boosting and compressing for barges on your other accounts. EVE University puts a boosted fleet at 15 to 20 M ISK an hour or more. Following several accounts is the app’s next step for mining.',
  },
];

/** Hours of mining a step pays for itself in: what it costs over what it adds an hour. Null when it adds nothing. */
export function paybackHours(cost: number, fromM3PerMin: number, toM3PerMin: number, iskPerM3: number): number | null {
  const gain = (toM3PerMin - fromM3PerMin) * 60 * iskPerM3;
  return gain > 0 && cost > 0 ? cost / gain : null;
}
