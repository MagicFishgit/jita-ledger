import { useEffect, useMemo, useState } from 'react';
import type { IndustryIndex } from '../../lib/industry';
import { industrySystemsShared, resolveNames } from '../../lib/market';
import { sanitizeIndustry, type IndustryDoc } from '../../lib/prefs';
import { update, useData } from '../../lib/store';

/**
 * What the Industry tab reads besides its bundle (docs/notes/industry.md): ESI's indices (an hour, shared), NPC stations'
 * names, and the synced doc. Task 5B adds adjusted prices, the scan, the NPC row and live books; Task 6 home prices and
 * histories. Nothing read is never a zero: a read still going is `loading`, one refused `failed`, with its retry.
 */
export type Loaded<T> = { state: 'loading' } | { state: 'failed'; error: string; retry: () => void } | { state: 'ok'; value: T };

/** A shared read as a hook's state, read again on retry or when `key` changes. */
export function useShared<T>(read: () => Promise<T>, key = ''): Loaded<T> {
  const [st, setSt] = useState<Loaded<T>>({ state: 'loading' });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    setSt({ state: 'loading' });
    read().then((value) => { if (alive) setSt({ state: 'ok', value }); },
      (e) => { if (alive) setSt({ state: 'failed', error: e instanceof Error ? e.message : String(e), retry: () => setTries((n) => n + 1) }); });
    return () => { alive = false; };
  }, [tries, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

export const useIndices = (): Loaded<Record<number, IndustryIndex>> => useShared(industrySystemsShared);

/** NPC stations' names (ESI's /universe/names, one request for all asked), kept for the visit; one ESI didn't name reads "Station #id". */
const stationNames = new Map<number, string>();
export function useStationNames(ids: readonly number[]): Record<number, string> {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  const [ver, bump] = useState(0);
  useEffect(() => {
    const want = key ? key.split(',').map(Number).filter((id) => !stationNames.has(id)) : [];
    if (!want.length) return;
    let alive = true;
    resolveNames(want).then((got) => {
      for (const [id, n] of Object.entries(got)) stationNames.set(Number(id), n);
      if (alive) bump((n) => n + 1);
    }, () => undefined);
    return () => { alive = false; };
  }, [key]);
  return useMemo(() => Object.fromEntries((key ? key.split(',').map(Number) : []).map((id) => [id, stationNames.get(id) ?? `Station #${id}`])), [key, ver]);
}

/** The synced `industry` doc, and a writer that cleans each change as disk and the cloud do. */
export function useIndustryDoc(): [IndustryDoc, (patch: Partial<IndustryDoc>) => void] {
  const doc = useData().industry;
  return [doc, (patch) => update((x) => ({ industry: sanitizeIndustry({ ...x.industry, ...patch }) }))];
}
