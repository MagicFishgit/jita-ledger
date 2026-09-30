import { useEffect, useState } from 'react';
import { hasScope } from '../../lib/auth';
import { SCOPE } from '../../lib/config';
import { esi } from '../../lib/esi';
import { useAuth } from '../../lib/hooks';
import { system } from '../../lib/universe';

/**
 * Where you are right now, read live when the page opens (ESI caches the ship and location 5 seconds, online a minute):
 * the ship you're in, the system, and whether you're logged in. Needs the location permissions; says nothing without.
 */
export type Live = { ship: number | null; system: string | null; online: boolean | null };

export function useRightNow(): Live | null {
  const auth = useAuth();
  const [now, setNow] = useState<Live | null>(null);
  useEffect(() => {
    if (!auth || !(hasScope(SCOPE.shipType) || hasScope(SCOPE.location) || hasScope(SCOPE.online))) return;
    let alive = true;
    (async () => {
      const cid = auth.characterId;
      const [ship, loc, on] = await Promise.all([
        hasScope(SCOPE.shipType) ? esi<{ ship_type_id: number }>(`/characters/${cid}/ship/`, { auth: true }).then((r) => r.data.ship_type_id).catch(() => null) : null,
        hasScope(SCOPE.location) ? esi<{ solar_system_id: number }>(`/characters/${cid}/location/`, { auth: true }).then((r) => system(r.data.solar_system_id)).then((x) => `${x.name} ${x.security.toFixed(1)}`).catch(() => null) : null,
        hasScope(SCOPE.online) ? esi<{ online: boolean }>(`/characters/${cid}/online/`, { auth: true }).then((r) => r.data.online).catch(() => null) : null,
      ]);
      if (alive) setNow({ ship, system: loc, online: on });
    })();
    return () => { alive = false; };
  }, [auth?.characterId]); // eslint-disable-line react-hooks/exhaustive-deps
  return now;
}
