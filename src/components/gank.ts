import { useEffect, useMemo, useState } from 'react';
import { GANK_SYSTEMS } from '../lib/arbitrage';
import { learnedGankLines } from '../lib/combat';
import { hullClassOf, type HullClass } from '../lib/courier';
import { shipGroup } from '../lib/killmails';
import { resolveIds } from '../lib/market';
import type { Data } from '../lib/store';

/**
 * The gank systems and the gank lines your own losses have taught, shared by Hauling and Combat.
 * The systems are named rather than numbered so a renumbering cannot quietly break the check.
 */
export function useLearnedGankLines(d: Pick<Data, 'killmails'>) {
  const [gankIds, setGankIds] = useState<Set<number>>(new Set());
  const [hulls, setHulls] = useState<Record<number, HullClass | null>>({});
  useEffect(() => {
    resolveIds(GANK_SYSTEMS).then((r) => setGankIds(new Set((r.systems ?? []).map((s) => s.id)))).catch(() => undefined);
  }, []);
  // Which hull each lost ship was, for learning the gank line from your own losses.
  const losses = useMemo(() => Object.values(d.killmails).filter((k) => k.kind === 'loss' && k.value), [d.killmails]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<number, HullClass | null> = {};
      for (const k of losses) if (k.victim.shipTypeId && !(k.victim.shipTypeId in out)) out[k.victim.shipTypeId] = hullClassOf(await shipGroup(k.victim.shipTypeId));
      if (alive) setHulls(out);
    })().catch(() => undefined);
    return () => { alive = false; };
  }, [losses]);
  const learned = useMemo(() => learnedGankLines(losses, (id) => hulls[id] ?? null, gankIds), [losses, hulls, gankIds]);
  return { gankIds, hulls, learned };
}
