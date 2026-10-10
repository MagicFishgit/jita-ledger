/**
 * Where NPCs sell the Industry tab's blueprints (docs/notes/industry.md). The morning scan reads every order in The Forge;
 * NPCs' sell orders run 365 days, so each blueprint the tab ranks is kept with its lowest NPC price and the stations
 * selling it, whatever the scan's candidate gate (which keeps only items traded both ways in Jita). One row a run in
 * `industry_npc`; D1 keeps the latest complete read and, beside it, any newer partial one, and only those two, so the
 * browser can say "NPCs don't sell it in The Forge" only after a read that missed no page.
 */
import type { NpcRow } from '../../src/lib/industryRank';

/** NPC sell orders of the blueprints asked for, by blueprint and station: the lowest price at each. */
export type BpoSellers = Map<number, Map<number, number>>;

/** One order into the fold, if it's an NPC's sell order (365 days) of a blueprint asked for. */
export function foldBpo(out: BpoSellers, want: ReadonlySet<number>, o: { type_id: number; location_id: number; price: number; is_buy_order: boolean; duration?: number }) {
  if (o.is_buy_order || (o.duration ?? 0) < 365 || !want.has(o.type_id)) return;
  let m = out.get(o.type_id);
  if (!m) out.set(o.type_id, (m = new Map()));
  const was = m.get(o.location_id);
  if (was == null || o.price < was) m.set(o.location_id, o.price);
}

/** The row kept: each blueprint's lowest NPC price and every station selling it, cheapest first, then by ID. Complete when no page failed. */
export function npcRowOf(out: BpoSellers, at: number, pagesFailed: number): NpcRow {
  const sellers: NpcRow['sellers'] = {};
  for (const [bp, st] of [...out].sort((a, b) => a[0] - b[0])) {
    const list = [...st].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    sellers[bp] = [list[0][1], list.map(([s]) => s)];
  }
  return { at: new Date(at).toISOString(), complete: pagesFailed === 0, pagesFailed, sellers };
}

/** Saves a run's row, then keeps only the latest complete row and, beside it, a newer partial one. */
export async function saveNpcRow(db: D1Database, run: number, row: NpcRow): Promise<void> {
  await db.batch([
    db.prepare(`INSERT INTO industry_npc (run, at, complete, pages_failed, data) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(run) DO UPDATE SET at = excluded.at, complete = excluded.complete, pages_failed = excluded.pages_failed, data = excluded.data`)
      .bind(run, Date.parse(row.at), row.complete ? 1 : 0, row.pagesFailed, JSON.stringify(row.sellers)),
    db.prepare(`DELETE FROM industry_npc WHERE run != ?1 AND (complete = 0 OR run < (SELECT MAX(run) FROM industry_npc WHERE complete = 1))`).bind(run),
  ]);
}

/** For `GET /v1/industry/npc`: the latest complete read, and a partial one only when it's newer. Nulls before any run. */
export async function npcRows(db: D1Database): Promise<{ complete: NpcRow | null; partial: NpcRow | null }> {
  const rows = (await db.prepare('SELECT run, at, complete, pages_failed, data FROM industry_npc ORDER BY run DESC')
    .all<{ run: number; at: number; complete: number; pages_failed: number; data: string }>()).results;
  const read = (r: (typeof rows)[number]): NpcRow => ({ at: new Date(r.at).toISOString(), complete: !!r.complete, pagesFailed: r.pages_failed, sellers: JSON.parse(r.data) });
  const complete = rows.find((r) => r.complete) ?? null;
  const partial = rows.find((r) => !r.complete && (!complete || r.run > complete.run)) ?? null;
  return { complete: complete ? read(complete) : null, partial: partial ? read(partial) : null };
}
