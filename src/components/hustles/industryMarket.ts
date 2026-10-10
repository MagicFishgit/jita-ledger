import { useEffect, useMemo, useState } from 'react';
import { cloudEnabled, cloudIndustryNpc, useCloud } from '../../lib/cloud';
import { EsiError, esi } from '../../lib/esi';
import { shareInFlight } from '../../lib/inFlight';
import type { IndustryIndex } from '../../lib/industry';
import type { NpcRow } from '../../lib/industryRank';
import { adjustedPricesShared, industrySystemsShared, jitaBook, resolveNames } from '../../lib/market';
import { nameReader } from '../../lib/nameReader';
import { sanitizeIndustry, type IndustryDoc } from '../../lib/prefs';
import { loadCache, useScanState, type ScanCache } from '../../lib/scan';
import type { BookSold } from '../../lib/split';
import { update, useData } from '../../lib/store';
import type { BookLevel } from '../../lib/types';

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

/**
 * NPC stations' names (ESI's /universe/names, one request for all asked), kept for the visit. A name read is a string, one ESI
 * didn't give (it answered without the ID, or refused it) is null, and one still being read, or whose lookup failed in a way
 * that says nothing about it (offline), is absent: the caller never saves a placeholder, and a later visit asks again
 * (nameReader.ts, tested).
 */
const stations = nameReader(resolveNames, (e) => e instanceof EsiError && (e.status === 400 || e.status === 404));
export function useStationNames(ids: readonly number[]): Record<number, string | null> {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',');
  const [ver, bump] = useState(0);
  useEffect(() => {
    const want = key ? key.split(',').map(Number) : [];
    if (!want.some((id) => !stations.known.has(id))) return;
    let alive = true;
    void stations.read(want).then(() => { if (alive) bump((n) => n + 1); });
    return () => { alive = false; };
  }, [key]);
  return useMemo(() => Object.fromEntries((key ? key.split(',').map(Number) : []).filter((id) => stations.known.has(id)).map((id) => [id, stations.known.get(id) ?? null])), [key, ver]);
}

/** The synced `industry` doc, and a writer that cleans each change as disk and the cloud do. */
export function useIndustryDoc(): [IndustryDoc, (patch: Partial<IndustryDoc>) => void] {
  const doc = useData().industry;
  return [doc, (patch) => update((x) => ({ industry: sanitizeIndustry({ ...x.industry, ...patch }) }))];
}

/** CCP's adjusted prices (an hour, shared): what a job's estimated item value is worked out on. */
export const useAdjusted = (): Loaded<Record<number, number>> => useShared(adjustedPricesShared);

/** The scan this browser holds (the cloud's morning scan once adopted, or its own), read again whenever a scan lands. */
export function useScanCache(): Loaded<ScanCache> {
  const saved = useScanState().saved;
  return useShared(loadCache, String(saved));
}

/**
 * The morning scan's NPC sellers of every blueprint (`GET /v1/industry/npc`): `off` with the cloud copy off in this
 * browser, `behind` when the Worker doesn't have the route yet (404), `failed` otherwise, else the rows (both null before
 * the first scan after the Worker began keeping them).
 */
export type NpcState = { status: 'off' } | { status: 'loading' } | { status: 'behind' } | { status: 'failed'; error: string }
  | { status: 'ok'; rows: { complete: NpcRow | null; partial: NpcRow | null } };
/** The cloud writes the NPC row once a morning: one read an hour is plenty, shared while in flight and kept for the visit. */
const NPC_HOLD_MS = 3_600_000;
let npcHeld: { at: number; read: ReturnType<typeof cloudIndustryNpc> } | null = null;
const npcRead = () => {
  if (npcHeld && Date.now() - npcHeld.at < NPC_HOLD_MS) return npcHeld.read;
  const read = cloudIndustryNpc();
  const held = { at: Date.now(), read };
  npcHeld = held;
  read.catch(() => { if (npcHeld === held) npcHeld = null; });
  return read;
};
export function useNpcRow(): NpcState {
  const cloud = useCloud();
  const [st, setSt] = useState<NpcState>(() => (cloudEnabled() ? { status: 'loading' } : { status: 'off' }));
  useEffect(() => {
    if (!cloudEnabled()) { setSt({ status: 'off' }); return; }
    if (!cloud.started) return;
    let alive = true;
    npcRead().then((rows) => { if (alive) setSt({ status: 'ok', rows: { complete: rows?.complete ?? null, partial: rows?.partial ?? null } }); },
      (e) => { if (alive) setSt((e as { status?: number }).status === 404 ? { status: 'behind' } : { status: 'failed', error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, [cloud.started]);
  return st;
}

type LiveBook = { bestBuy: number | null; bestSell: number | null; topBuys: BookLevel[]; topSells: BookLevel[]; sold?: BookSold; at: string };
/**
 * Jita books now for the types asked (jitaBook: kept until ESI has a newer one, shared in flight), four at a time in the
 * order asked: the top rows' products and materials, after a first ranking on the morning's books. One that can't be read
 * is left on the morning's book, which the row's tip says.
 */
export function useLiveBooks(types: readonly number[]): Record<number, LiveBook> {
  const key = types.join(',');
  const [got, setGot] = useState<Record<number, LiveBook>>({});
  useEffect(() => {
    let alive = true;
    const queue = key ? key.split(',').map(Number) : [];
    let next = 0, done = 0;
    // Each book landing re-ranked all 1,652 rows (about 25 ms) and reordered them 70 to 150 times: the books are held back and
    // set in batches (the first sixteen, so the rows move early, then every thirty-two, and the rest when the queue drains).
    let buf: Record<number, LiveBook> = {};
    const flush = () => { const b = buf; buf = {}; if (Object.keys(b).length) setGot((x) => ({ ...x, ...b })); };
    const work = async () => {
      while (alive && next < queue.length) {
        const t = queue[next++];
        const b = await jitaBook(t).catch(() => null);
        if (!alive) return;
        if (b) buf[t] = { bestBuy: b.bestBuy, bestSell: b.bestSell, topBuys: b.topBuys, topSells: b.topSells, ...(b.sold ? { sold: b.sold } : {}), at: b.fetchedAt };
        done++;
        if (done === 16 || (done > 16 && (done - 16) % 32 === 0) || done === queue.length) flush();
      }
    };
    for (let i = 0; i < 4; i++) void work();
    return () => { alive = false; };
  }, [key]);
  return got;
}

/** The regions the research found NPCs seeding Tech I originals in, besides The Forge (the scan's): looked in when a row opens. */
export const NPC_REGIONS: Record<number, string> = {
  10000016: 'Lonetrek', 10000043: 'Domain', 10000067: 'Genesis', 10000041: 'Syndicate', 10000057: 'Outer Ring', 10000023: 'Pure Blind', 10000011: 'Great Wildlands',
};
export type RegionSeller = { region: number; station: number; system: number; price: number };
/** NPCs' sell orders (365 days) of one original in each of NPC_REGIONS: seven public reads, shared while in flight. A region that can't be read is left out and counted; `read` names the ones that were. */
export const regionSellers = shareInFlight((bp: number) => String(bp), async (bp: number): Promise<{ sellers: RegionSeller[]; failed: number; read: number[] }> => {
  const sellers: RegionSeller[] = [];
  const read: number[] = [];
  let failed = 0;
  await Promise.all(Object.keys(NPC_REGIONS).map(Number).map(async (region) => {
    try {
      const { data } = await esi<{ location_id: number; system_id: number; price: number; duration: number; is_buy_order: boolean }[]>(`/markets/${region}/orders/`, { query: { order_type: 'sell', type_id: bp } });
      read.push(region);
      for (const o of data) if (!o.is_buy_order && o.duration >= 365) sellers.push({ region, station: o.location_id, system: o.system_id, price: o.price });
    } catch { failed++; }
  }));
  return { sellers: sellers.sort((a, b) => a.price - b.price || a.station - b.station), failed, read: read.sort((a, b) => a - b) };
});
