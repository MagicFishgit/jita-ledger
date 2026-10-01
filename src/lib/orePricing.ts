import { JITA_44 } from './config';
import { esi } from './esi';
import { adjustedPricesShared, jitaBook, resolveIds } from './market';
import type { OreWorth } from './mining';
import { FAMILIES, gradeLabel, gradeRank, isMinedForm, oreBase } from './miningFits';
import { ORE_WHERE } from './oreWhere';
import { stationTax, unitValue, yieldOf, type Materials, type Site } from './reprocess';
import { groupTypes, typeInfo } from './universe';

type Bundle = { types: Record<string, Materials> };

/**
 * Books one call reads at once. `esi()` lets four requests out at a time for the whole app, so this isn't what keeps
 * ESI from being hammered; it keeps a batch of ~160 books (the best-ore panel: every ore and ice type, their compressed
 * forms and the minerals) from queueing ahead of everything else the page asks for, the tree's dogma and Scaling up's own
 * price among them, since the gate serves in order.
 */
const BOOKS_AT_ONCE = 8;

/**
 * At most `n` of the jobs handed to it running at once; the rest wait their turn, in order. A finishing job hands its
 * slot straight to the next one waiting: freed and taken a microtask apart, a caller arriving in between took it too.
 */
function limiter(n: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => waiting.push(r));
    else active++;
    try { return await job(); } finally { const next = waiting.shift(); if (next) next(); else active--; }
  };
}

/**
 * What each ore is worth three ways, after tax (lib/mining.ts `bestWay`): into its own Jita bids, compressed into
 * the compressed form's bids ("Compressed " + its name, trimmed: ESI names Scordite 0-Grade with a trailing space), or
 * reprocessed at your skills at Jita 4-4 and the minerals sold into their bids. With each ore's volume a unit.
 *
 * The types are priced side by side, each book read once for the whole call however many ores ask for it (a mineral
 * every ore reprocesses into is one read, shared while it's still in flight), at most `BOOKS_AT_ONCE` at a time.
 * `failed` lists the types something couldn't be read for: a book, its volume, its compressed form's name, the
 * materials bundle or the prices the reprocessing tax is charged on. Such a type's figures are what could be read, so
 * they can be low (a mineral not read counts as nothing in the reprocessed figure): say so and offer to try again,
 * never pass them off as its worth. `fresh` reads every book past the caches, for someone asking to price again.
 */
export async function priceOres(types: number[], nameOf: (t: number) => string, skills: Record<number, number>, corp: Parameters<typeof stationTax>[0], tax: number, opts: { fresh?: boolean } = {}) {
  let adjustedFailed = false;
  const [bundle, adjusted, station] = await Promise.all([
    import('../data/typeMaterials.json').then((m) => m.default as unknown as Bundle).catch(() => null),
    adjustedPricesShared().catch(() => { adjustedFailed = true; return {} as Record<number, number>; }),
    esi<{ reprocessing_efficiency?: number }>(`/universe/stations/${JITA_44}/`).then(({ data }) => data.reprocessing_efficiency ?? 0.5).catch(() => 0.5),
  ]);
  const site: Site = { kind: 'station', base: station, tax: stationTax(corp) };
  const limit = limiter(BOOKS_AT_ONCE);
  // Each book's best bid, as a promise so two ores asking at once share one read; `bid` holds the answers once in.
  const reads = new Map<number, Promise<number | null>>();
  const bid = new Map<number, number | null>();
  const unread = new Set<number>();
  const bidOf = (t: number): Promise<number | null> => {
    let p = reads.get(t);
    if (!p) {
      p = limit(() => jitaBook(t, !!opts.fresh)).then((b) => b.bestBuy ?? null, () => { unread.add(t); return null; })
        .then((v) => { bid.set(t, v); return v; });
      reads.set(t, p);
    }
    return p;
  };
  const vols: Record<number, number> = {}, worth: Record<number, OreWorth> = {};
  const failed = new Set<number>();
  const compressed = (t: number) => `Compressed ${nameOf(t).trim()}`;
  let namesFailed = false;
  const compressedIds = await resolveIds([...new Set(types.map(compressed))]).then((x) => x.inventory_types ?? []).catch(() => { namesFailed = true; return []; });
  await Promise.all(types.map(async (t) => {
    const info = await typeInfo(t).catch(() => null);
    vols[t] = info?.volume ?? 0;
    const cid = compressedIds.find((c) => c.name === compressed(t))?.id;
    const m = bundle?.types[String(t)];
    const [raw, comp] = await Promise.all([bidOf(t), cid ? bidOf(cid) : Promise.resolve(null), ...(m ? m[1].map(([mat]) => bidOf(mat)) : [])]);
    const reprocessed = m ? unitValue(m, yieldOf(m, skills, site), (id) => bid.get(id) ?? null, (id) => adjusted[id] ?? null, site.tax, tax) : null;
    worth[t] = { raw: raw != null ? raw * (1 - tax) : null, compressed: comp != null ? comp * (1 - tax) : null, reprocessed };
    const lost = !info || namesFailed || !bundle || unread.has(t) || (cid != null && unread.has(cid))
      || (!!m && (m[1].some(([mat]) => unread.has(mat)) || (adjustedFailed && site.tax > 0)));
    if (lost) failed.add(t);
  }));
  return { vols, worth, failed: types.filter((t) => failed.has(t)) };
}

/** Every base ore's ID, and every ice type's, resolved once by name. */
let baseIds: Promise<Record<string, number>> | null = null;
export function oreBaseIds(): Promise<Record<string, number>> {
  const ice = Object.entries(ORE_WHERE).filter(([, o]) => o.kind === 'ice').map(([n]) => n);
  baseIds ??= resolveIds([...new Set([...FAMILIES.flatMap(([, ores]) => ores), ...ice])])
    .then((x) => Object.fromEntries((x.inventory_types ?? []).map((t) => [t.name, t.id])))
    .catch((e) => { baseIds = null; throw e; });
  return baseIds;
}

/**
 * An ore's grades, poorest first, from its inventory group: the market types named for it that aren't a compressed form.
 * A moon ore's group holds all four ores of its rarity, hence the name check.
 */
export async function gradesOf(base: string, baseId: number): Promise<{ id: number; name: string }[]> {
  const types = await groupTypes((await typeInfo(baseId)).groupId);
  const infos = await Promise.all(types.map(async (id) => ({ id, info: await typeInfo(id).catch(() => null) })));
  return infos.filter((x) => x.info && x.info.marketGroupId != null && isMinedForm(x.info.name) && oreBase(x.info.name) === base)
    .map((x) => ({ id: x.id, name: x.info!.name }))
    .sort((a, b) => gradeRank(gradeLabel(a.name.trim(), base), base) - gradeRank(gradeLabel(b.name.trim(), base), base) || a.id - b.id);
}
