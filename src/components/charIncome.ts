import { useEffect, useMemo, useState } from 'react';
import { everyItemCalcs } from '../lib/everyItem';
import { rates } from '../lib/fees';
import { incomeRows } from '../lib/income';
import { bestWay, type OreWorth } from '../lib/mining';
import { priceOres } from '../lib/orePricing';
import { useData, type Data } from '../lib/store';
import { useActivityEvents } from './activityEvents';
import { useEnsureNames } from './common';

/**
 * What a character earned in a window, by the Wallet's rules (lib/income.ts), for any ledger: yours, or an alt's as
 * altLedger builds it. Worked out once for each ledger object and window: an alt's ledger is the same object until its
 * revision moves, so a page re-rendering doesn't redo it. Give it `since` and `now` rounded to the minute (the
 * Characters page redraws every 30 seconds for its other times, and a rolling 24 hours moves its start with `now`).
 */
export function useCharIncome(d: Data, since: number, now: number) {
  const acts = useActivityEvents(d);
  const calcs = useMemo(() => everyItemCalcs(d), [d]);
  const out = useMemo(() => incomeRows(calcs, acts, since, now), [calcs, acts, since, now]);
  return { ready: acts.ready, failed: acts.failed, earned: out.earned, rows: out.rows };
}

/**
 * What a unit of each ore is worth, and its volume, for every character's mining at once: one `priceOres` (the Mining
 * tab's three ways, lib/mining.ts `bestWay`) at your own skills, standing and tax, whoever mined it. An ore is priced
 * once it has a name, since a compressed form is found by name ("Compressed Scordite"): yours, or the one in the alt's
 * own copy (`names`, which the cloud pushes with its trades). The named ones are priced, not all or none: one ore
 * whose name never came used to leave every character's Mined unpriced for the rest of the visit (the final review of
 * stage 2b). An ore ESI never names stays unpriced, and the tile counts it so. `pricing` while names are still being
 * looked up or prices read. When the set of named ores changes, only those not yet priced some way are read (a new
 * name used to price every named ore again). A volume ESI couldn't give reads as not known (null), never 0 m³. The
 * Mining tab uses it too, with every alt's names, so an alt's ore is priced there as it is here; `worth` is each ore's
 * three ways, for its table.
 */
export function useMinedWorth(types: number[], names: Record<number, string>[] = []) {
  const d = useData();
  const sorted = [...new Set(types)].sort((a, b) => a - b);
  const nameOf = (t: number): string | undefined => d.names[t] ?? names.find((n) => n[t])?.[t];
  // Only what no ledger names is looked up (and kept in yours, as any page's lookup is).
  const looking = useEnsureNames(sorted.filter((t) => !nameOf(t)));
  const named = sorted.filter((t) => !!nameOf(t));
  const [vol, setVol] = useState<Record<number, number>>({});
  const [worth, setWorth] = useState<Record<number, OreWorth>>({});
  const [pricing, setPricing] = useState(false);
  const key = named.join(',');
  useEffect(() => {
    // What's priced some way already stays; one that priced no way (its bids unread) is tried again.
    const todo = named.filter((t) => !(worth[t] && bestWay(worth[t])));
    if (!todo.length) return;
    let alive = true;
    setPricing(true);
    priceOres(todo, (t) => nameOf(t) ?? '', d.skills ?? {}, d.settings.corp, rates(d.settings).t)
      // Kept beside what was priced before, so an ore that leaves the set and comes back is still known meanwhile.
      .then(({ vols, worth: out }) => { if (alive) { setVol((x) => ({ ...x, ...vols })); setWorth((x) => ({ ...x, ...out })); setPricing(false); } })
      .catch(() => { if (alive) setPricing(false); });
    // A run cut off by a new set of ores isn't pricing any more.
    return () => { alive = false; setPricing(false); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = pricing || looking;
  return useMemo(() => ({
    volumeOf: (t: number): number | null => vol[t] || null,
    worthOf: (t: number): number | null => (worth[t] ? bestWay(worth[t])?.perUnit ?? null : null),
    pricing: busy, worth: worth as Readonly<Record<number, OreWorth>>,
  }), [vol, worth, busy]);
}
