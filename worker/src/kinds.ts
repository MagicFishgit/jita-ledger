/**
 * What category each type is in, as ESI has it (type → group → category), looked up once and kept in D1 (`type_kinds`),
 * as the app's `typeKind` keeps it in the browser. The Sniper needs it for every listing and every high bid for what a
 * ledger holds, to leave blueprints out of its mail unless asked (src/lib/snipe.ts, `splitBlueprints`), so it can't wait
 * for a browser to have looked one up.
 *
 * Measured on the read of 1 October 2026 (23:27 UTC): 82 listings, 24 of them blueprints (category 9), about 80 types and
 * 40 groups to ask for the first time; after that only a type never listed before.
 */
import { esiGet } from './eve';

/** New types looked up in one call at most: the rest are asked for next time, and read as not known meanwhile. */
export const KIND_LOOKUPS = 150;
/** Lookups in flight at once. */
const AT_ONCE = 6;

const inList = (n: number) => Array.from({ length: n }, (_, i) => `?${i + 1}`).join(',');

/**
 * The categories of these types: kept ones read from D1, new ones from ESI and kept. A type ESI didn't answer for is
 * left out of the map (and kept nowhere), so it is asked for again next time.
 */
export async function categoriesOf(db: D1Database, types: number[], now = Date.now()): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const want = [...new Set(types)].filter((t) => Number.isInteger(t) && t > 0);
  for (let i = 0; i < want.length; i += 90) {
    const part = want.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT type_id, category_id FROM type_kinds WHERE type_id IN (${inList(part.length)})`).bind(...part)
      .all<{ type_id: number; category_id: number }>()).results;
    for (const r of rows) out.set(r.type_id, r.category_id);
  }
  const missing = want.filter((t) => !out.has(t)).slice(0, KIND_LOOKUPS);
  if (!missing.length) return out;
  const groups = new Map<number, number>();
  const found: { type: number; group: number; category: number }[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: AT_ONCE }, async () => {
    while (next < missing.length) {
      const type = missing[next++];
      try {
        const group = (await esiGet<{ group_id?: number }>(`/universe/types/${type}/`)).data.group_id;
        if (!Number.isInteger(group)) continue;
        let category = groups.get(group!);
        if (category == null) {
          const kept = await db.prepare('SELECT category_id AS c FROM type_kinds WHERE group_id = ?1 LIMIT 1').bind(group).first<{ c: number }>();
          category = kept?.c ?? (await esiGet<{ category_id?: number }>(`/universe/groups/${group}/`)).data.category_id;
          if (!Number.isInteger(category)) continue;
          groups.set(group!, category!);
        }
        out.set(type, category!);
        found.push({ type, group: group!, category: category! });
      } catch { /* not known this time: asked for again next time */ }
    }
  }));
  if (found.length) {
    const keep = db.prepare('INSERT OR REPLACE INTO type_kinds (type_id, group_id, category_id, at) VALUES (?1, ?2, ?3, ?4)');
    await db.batch(found.map((f) => keep.bind(f.type, f.group, f.category, now)));
  }
  return out;
}
