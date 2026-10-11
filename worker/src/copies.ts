/**
 * What blueprint copies sell for in The Forge (docs/notes/industry.md, stage 3). Every six hours, after Goonmetrics on the
 * `37` cron, the cloud reads EVE Ref's latest public-contract snapshot (filtered as it decompresses: blueprints.ts
 * readSnapshot), keeps The Forge's single-kind copy contracts as a set (`copy_set`, in rows of COPY_PART), and puts each
 * contract of the set kept last time that vanished before expiry, not relisted by its seller, in `copy_sold` (kept eight
 * days). The summary the Copies section reads is worked out once a round and kept in `scan_meta` ('copySummary'), beside the
 * round's own state ('copies'), all in one batch with the set. EVE Ref is someone else's site: one 6.6 MB file every six
 * hours, a User-Agent naming the project only, a 90-second timeout, not a watched job (the section says how old its read
 * is), and COPIES_ON switches it off.
 */
import type { BpContract } from '../../src/lib/bpContracts';
import { THE_FORGE } from '../../src/lib/constants';
import { COPY_KEEP_DAYS, COPY_WINDOW_DAYS, compactCopies, copiesSold, copySummary, itemIssuers, soldRows, type CopyRead, type CopyRow, type CopySummary, type SoldRow } from '../../src/lib/copyMarket';
import { LATEST, readSnapshot } from './blueprints';

export const COPIES_ON = true;
export const COPIES_REFRESH_MS = 6 * 3_600_000;
/** The alts' read ahead of it varies, so a read is due a little early rather than an hour late (Goonmetrics' slack). */
export const COPIES_SLACK_MS = 30 * 60_000;
/** After a try that failed, the next waits for the next hourly cron. */
export const COPIES_RETRY_MS = 50 * 60_000;
/** No read starts this long after the cron's scheduled time: Goonmetrics may run to 10 minutes; the invocation stops at 15. */
export const COPIES_BUDGET_MS = 12 * 60_000;
/** Contracts a `copy_set` row holds: about 280 KB of JSON, under D1's 2 MB a row (the set was 1.02 to 1.03 MB on 11 October 2026). */
export const COPY_PART = 3000;
/** Stamped before a read: a round the cloud stops (memory, the wall limit) can't write anything after, so this stays as its trace. */
export const INTERRUPTED = 'interrupted: the cloud stopped the read before it finished';
const DAY = 86_400_000;

/** A snapshot as the round reads it; `copyIssuers`: every copy of The Forge's item exchanges to its seller (ContractSink), else worked out from `contracts`. */
export type Snapshot = { at: string | null; contracts: BpContract[]; copyIssuers?: ReadonlyMap<number, number> };
/**
 * The round's state: when it last tried and last read (the Worker's clock), the last error (INTERRUPTED until a try ends), the
 * kept snapshot's time when EVE Ref's latest was still that one at the last try (not an error: nothing new to read), and each
 * comparison's span.
 */
export type CopiesState = { tried: number; read: number; error: string | null; stale: string | null; reads: CopyRead[] };

/** The default reader: EVE Ref's latest snapshot of The Forge, expiry judged at the snapshot's own time. */
export const latestSnapshot = (): Promise<Snapshot> => readSnapshot(LATEST, { region: THE_FORGE });

async function stateOf(db: D1Database): Promise<CopiesState> {
  const r = await db.prepare(`SELECT data FROM scan_meta WHERE key = 'copies'`).first<{ data: string }>();
  const s = r ? (JSON.parse(r.data) as Partial<CopiesState>) : {};
  return { tried: s.tried ?? 0, read: s.read ?? 0, error: s.error ?? null, stale: s.stale ?? null, reads: Array.isArray(s.reads) ? s.reads : [] };
}
const putMeta = (db: D1Database, key: string, v: unknown) =>
  db.prepare('INSERT INTO scan_meta (key, data) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET data = excluded.data').bind(key, JSON.stringify(v));

/** Every character whose login the cloud holds (a ledger, its sender, its alts) and every alt on a roster, removed ones too. */
export async function ownCharacters(db: D1Database): Promise<Set<number>> {
  const rows = (await db.prepare('SELECT char_id AS id FROM keys UNION SELECT token_char_id AS id FROM keys UNION SELECT char_id AS id FROM alts').all<{ id: number }>()).results;
  return new Set(rows.map((r) => r.id));
}

/**
 * One round, when due (the plan's "When it reads"): read the latest snapshot, compare it with the kept set, and in one batch keep
 * what sold, take back what a partial snapshot made look sold, replace the set, and write the summary and the state; then prune.
 * `read`, `on`, `deadline` and `part` are for the tests and the cron.
 */
export async function refreshCopies(db: D1Database, now = Date.now(), o: { read?: () => Promise<Snapshot>; on?: boolean; deadline?: number; part?: number } = {}) {
  if (!(o.on ?? COPIES_ON)) return { off: true as const };
  const st = await stateOf(db);
  // A read the cloud stopped waits the full six hours, never the hour: the same read would likely stop again.
  const retry = st.error === INTERRUPTED ? COPIES_REFRESH_MS - COPIES_SLACK_MS : COPIES_RETRY_MS;
  if (now - st.read < COPIES_REFRESH_MS - COPIES_SLACK_MS || now - st.tried < retry) return { done: 'fresh' as const };
  if (Date.now() > (o.deadline ?? Infinity)) return { done: 'later' as const };
  // Every way this round ends writes over it; one the cloud kills leaves it (I5).
  await putMeta(db, 'copies', { ...st, tried: now, error: INTERRUPTED }).run();
  const stamp = (error: string) => putMeta(db, 'copies', { ...st, tried: now, error }).run();
  let snap: Snapshot;
  try { snap = await (o.read ?? latestSnapshot)(); } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await stamp(error);
    return { done: 'failed' as const, error };
  }
  // What follows the read says how it ended too: a write D1 refuses, or a kept row that won't parse, is said and tried again the
  // next hour, never left as INTERRUPTED with the six hours' wait that only a round the cloud stops should get.
  let kept: { contracts: number; sold: number; parts: number; back: number };
  try {
    const at = snap.at ? Date.parse(snap.at) : NaN;
    if (!Number.isFinite(at)) { await stamp('EVE Ref’s snapshot says no time'); return { done: 'failed' as const, error: 'EVE Ref’s snapshot says no time' }; }
    const parts = (await db.prepare('SELECT part, at, data FROM copy_set ORDER BY part').all<{ part: number; at: number; data: string }>()).results;
    const keptAt = parts.length ? parts[0].at : null;
    if (keptAt != null && at <= keptAt) {
      // EVE Ref hasn't written a newer snapshot: not a failure, nothing to compare, and the next hour tries again.
      await putMeta(db, 'copies', { ...st, tried: now, error: null, stale: new Date(keptAt).toISOString() }).run();
      return { done: 'same' as const };
    }
    const current = compactCopies(snap.contracts);
    const newerIds = new Set(snap.contracts.map((c) => c.id));
    let sold: CopyRow[] = [];
    const reads = st.reads.filter((r) => r[1] > now - COPY_KEEP_DAYS * DAY);
    // A first read, or a kept set more than a week older than this one, compares nothing: a week of sales on one day is no pace.
    if (keptAt != null && at - keptAt <= COPY_WINDOW_DAYS * DAY) {
      const older = parts.flatMap((p) => JSON.parse(p.data) as CopyRow[]);
      sold = copiesSold(older, newerIds, snap.copyIssuers ?? itemIssuers(snap.contracts), at);
      reads.push([keptAt, at, sold.length]);
    }
    // The window: what's kept, less any contract back in this snapshot (a partial snapshot before made it look sold: M20), plus what sold now.
    const held = (await db.prepare('SELECT contract_id AS contractId, type_id AS typeId, me, te, runs, copies, price, issuer, at FROM copy_sold WHERE at > ?1')
      .bind(at - COPY_WINDOW_DAYS * DAY).all<SoldRow>()).results;
    const heldIds = new Set(held.map((r) => r.contractId));
    const back = held.filter((r) => newerIds.has(r.contractId)).map((r) => r.contractId);
    const fresh = soldRows(sold, at).filter((r) => !heldIds.has(r.contractId));
    const summary = copySummary({ sold: [...held.filter((r) => !newerIds.has(r.contractId)), ...fresh], current, reads, exclude: await ownCharacters(db), at });
    // One batch, one transaction (M18): what sold, what came back, the set, the summary and the state land together or not at all.
    const writes: D1PreparedStatement[] = [];
    // Ten rows a statement: nine values each, under D1's 100 bound parameters.
    for (let i = 0; i < fresh.length; i += 10) {
      const chunk = fresh.slice(i, i + 10);
      writes.push(db.prepare(`INSERT OR IGNORE INTO copy_sold (contract_id, type_id, me, te, runs, copies, price, issuer, at) VALUES ${chunk.map((_, n) => `(${Array.from({ length: 9 }, (_, k) => `?${n * 9 + k + 1}`).join(', ')})`).join(', ')}`)
        .bind(...chunk.flatMap((s) => [s.contractId, s.typeId, s.me, s.te, s.runs, s.copies, s.price, s.issuer, s.at])));
    }
    for (let i = 0; i < back.length; i += 90) { const ids = back.slice(i, i + 90); writes.push(db.prepare(`DELETE FROM copy_sold WHERE contract_id IN (${ids.map((_, n) => `?${n + 1}`).join(',')})`).bind(...ids)); }
    writes.push(db.prepare('DELETE FROM copy_set'));
    const size = o.part ?? COPY_PART;
    let p = 0;
    for (let i = 0; i < current.length || p === 0; i += size, p++) writes.push(db.prepare('INSERT INTO copy_set (part, at, data) VALUES (?1, ?2, ?3)').bind(p, at, JSON.stringify(current.slice(i, i + size))));
    writes.push(putMeta(db, 'copySummary', summary), putMeta(db, 'copies', { tried: now, read: now, error: null, stale: null, reads }));
    await db.batch(writes);
    kept = { contracts: current.length, sold: sold.length, parts: p, back: back.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await stamp(error).catch(() => undefined);
    return { done: 'failed' as const, error };
  }
  // Outside the try: the batch has written this round's state, which a stamp built from the last round's mustn't undo.
  await db.prepare('DELETE FROM copy_sold WHERE at <= ?1').bind(now - COPY_KEEP_DAYS * DAY).run();
  return { done: 'read' as const, contracts: kept.contracts, sold: kept.sold, parts: kept.parts, ...(kept.back ? { back: kept.back } : {}) };
}

/** For `GET /v1/copies`: the last round's summary with when it last tried, its error and whether EVE Ref had nothing newer; null before the first; `off` when switched off. */
export async function copiesFor(db: D1Database, on = COPIES_ON): Promise<{ off: true } | (CopySummary & { tried: string | null; error: string | null; stale: string | null }) | null> {
  if (!on) return { off: true };
  const rows = (await db.prepare(`SELECT key, data FROM scan_meta WHERE key IN ('copies', 'copySummary')`).all<{ key: string; data: string }>()).results;
  const sum = rows.find((r) => r.key === 'copySummary');
  if (!sum) return null;
  const st = rows.find((r) => r.key === 'copies');
  const s = st ? (JSON.parse(st.data) as Partial<CopiesState>) : {};
  return { ...(JSON.parse(sum.data) as CopySummary), tried: s.tried ? new Date(s.tried).toISOString() : null, error: s.error ?? null, stale: s.stale ?? null };
}
