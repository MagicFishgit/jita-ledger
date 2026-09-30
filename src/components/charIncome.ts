import { useEffect, useMemo, useState } from 'react';
import { everyItemCalcs } from '../lib/everyItem';
import { rates } from '../lib/fees';
import { incomeRows } from '../lib/income';
import { bestWay, type OreWorth } from '../lib/mining';
import { priceOres } from '../lib/orePricing';
import { useData, type Data } from '../lib/store';
import { useActivityEvents } from './activityEvents';
import { useEnsureNames, useTypeName } from './common';

/**
 * What a character earned in a window, by the Wallet's rules (lib/income.ts), for any ledger: yours, or an alt's as
 * altLedger builds it. Worked out once for each ledger object and window: an alt's ledger is the same object until its
 * revision moves, so a page re-rendering every minute doesn't redo it.
 */
export function useCharIncome(d: Data, since: number, now: number) {
  const acts = useActivityEvents(d);
  const calcs = useMemo(() => everyItemCalcs(d), [d]);
  const out = useMemo(() => incomeRows(calcs, acts, since, now), [calcs, acts, since, now]);
  return { ready: acts.ready, failed: acts.failed, earned: out.earned, rows: out.rows };
}

/**
 * What a unit of each ore is worth, and its volume, for every character's mining at once: one `priceOres` (the Mining
 * tab's three ways, lib/mining.ts `bestWay`) at your own skills, standing and tax, whoever mined it. Priced once every
 * name is known, since a compressed form is found by name ("Compressed Scordite"), and again only when the set of ores
 * changes. A volume ESI couldn't give reads as not known (null), never 0 m³.
 */
export function useMinedWorth(types: number[]) {
  const d = useData();
  const name = useTypeName();
  const sorted = [...new Set(types)].sort((a, b) => a - b);
  useEnsureNames(sorted);
  const [vol, setVol] = useState<Record<number, number>>({});
  const [worth, setWorth] = useState<Record<number, OreWorth>>({});
  const [pricing, setPricing] = useState(false);
  const named = sorted.every((t) => !!d.names[t]);
  const key = `${sorted.join(',')}:${named}`;
  useEffect(() => {
    if (!named || !sorted.length) return;
    let alive = true;
    setPricing(true);
    priceOres(sorted, name, d.skills ?? {}, d.settings.corp, rates(d.settings).t)
      // Kept beside what was priced before, so an ore that leaves the set and comes back is still known meanwhile.
      .then(({ vols, worth: out }) => { if (alive) { setVol((x) => ({ ...x, ...vols })); setWorth((x) => ({ ...x, ...out })); setPricing(false); } })
      .catch(() => { if (alive) setPricing(false); });
    // A run cut off by a new set of ores, or by one waiting for its name, isn't pricing any more.
    return () => { alive = false; setPricing(false); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => ({
    volumeOf: (t: number): number | null => vol[t] || null,
    worthOf: (t: number): number | null => (worth[t] ? bestWay(worth[t])?.perUnit ?? null : null),
    pricing,
  }), [vol, worth, pricing]);
}
