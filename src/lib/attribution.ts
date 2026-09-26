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

let cached: { key: string; p: Promise<TypeSets> } | null = null;

export function loadTypeSets(corps: number[]): Promise<TypeSets> {
  const key = [...corps].sort().join(',');
  if (cached?.key === key) return cached.p;
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
  cached = { key, p };
  p.catch(() => { cached = null; });
  return p;
}
