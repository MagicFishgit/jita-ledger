import { JITA_44 } from './config';
import { esi } from './esi';
import { adjustedPricesShared, jitaBook, resolveIds } from './market';
import type { OreWorth } from './mining';
import { stationTax, unitValue, yieldOf, type Materials, type Site } from './reprocess';
import { typeInfo } from './universe';

type Bundle = { types: Record<string, Materials> };

/**
 * What each ore is worth three ways, after tax (lib/mining.ts `bestWay`): into its own Jita bids, compressed into
 * the compressed form's bids ("Compressed " + its name, trimmed: ESI names Scordite 0-Grade with a trailing space), or
 * reprocessed at your skills at Jita 4-4 and the minerals sold into their bids. With each ore's volume a unit.
 */
export async function priceOres(types: number[], nameOf: (t: number) => string, skills: Record<number, number>, corp: Parameters<typeof stationTax>[0], tax: number) {
  const [bundle, adjusted, station] = await Promise.all([
    import('../data/typeMaterials.json').then((m) => m.default as unknown as Bundle).catch(() => null),
    adjustedPricesShared().catch(() => ({} as Record<number, number>)),
    esi<{ reprocessing_efficiency?: number }>(`/universe/stations/${JITA_44}/`).then(({ data }) => data.reprocessing_efficiency ?? 0.5).catch(() => 0.5),
  ]);
  const site: Site = { kind: 'station', base: station, tax: stationTax(corp) };
  const bid = new Map<number, number | null>();
  const bidOf = async (t: number) => { if (!bid.has(t)) bid.set(t, (await jitaBook(t).catch(() => null))?.bestBuy ?? null); return bid.get(t) ?? null; };
  const vols: Record<number, number> = {}, worth: Record<number, OreWorth> = {};
  const compressed = (t: number) => `Compressed ${nameOf(t).trim()}`;
  const compressedIds = await resolveIds([...new Set(types.map(compressed))]).then((x) => x.inventory_types ?? []).catch(() => []);
  for (const t of types) {
    vols[t] = (await typeInfo(t).catch(() => null))?.volume ?? 0;
    const raw = await bidOf(t);
    const cid = compressedIds.find((c) => c.name === compressed(t))?.id;
    const comp = cid ? await bidOf(cid) : null;
    const m = bundle?.types[String(t)];
    let reprocessed: number | null = null;
    if (m) {
      for (const [mat] of m[1]) await bidOf(mat);
      reprocessed = unitValue(m, yieldOf(m, skills, site), (id) => bid.get(id) ?? null, (id) => adjusted[id] ?? null, site.tax, tax);
    }
    worth[t] = { raw: raw != null ? raw * (1 - tax) : null, compressed: comp != null ? comp * (1 - tax) : null, reprocessed };
  }
  return { vols, worth };
}
