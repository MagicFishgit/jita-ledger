import { ABYSSAL_MATERIALS_GROUP, FILAMENT_GROUPS, groupTypes, loyaltyOffers } from './market';
import type { TypeSets } from './results';

/**
 * Which items belong to which activity, read from ESI rather than kept as a list.
 *
 * Planetary goods are market groups 1333 to 1337 (raw through advanced), checked against ESI. Loyalty
 * goods are whatever the stores you hold points with sell. Mutaplasmids live in a tree of their own
 * and are recognised by name by the caller, as the Abyssal page does.
 */
export const PI_GROUPS = [1333, 1334, 1335, 1336, 1337];

/**
 * One answer per set of loyalty stores, so the main's and an alt's (whose stores differ) don't evict each other when
 * both are shown. A load that fails is forgotten, so the next asks again.
 */
const cached = new Map<string, Promise<TypeSets>>();

export function loadTypeSets(corps: number[]): Promise<TypeSets> {
  const key = [...corps].sort().join(',');
  const hit = cached.get(key);
  if (hit) return hit;
  const p = (async () => {
    const [filaments, loot, pi, offers] = await Promise.all([
      groupTypes(FILAMENT_GROUPS),
      groupTypes([ABYSSAL_MATERIALS_GROUP]),
      groupTypes(PI_GROUPS),
      Promise.all(corps.map((c) => loyaltyOffers(c).catch(() => []))),
    ]);
    return {
      filaments: new Set(filaments), abyssLoot: new Set(loot), pi: new Set(pi),
      lpGoods: new Set(offers.flat().map((o) => o.typeId)),
    };
  })();
  cached.set(key, p);
  p.catch(() => { if (cached.get(key) === p) cached.delete(key); });
  return p;
}
