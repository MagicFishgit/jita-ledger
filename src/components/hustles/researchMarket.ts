import { useEffect, useMemo, useRef, useState } from 'react';
import { THE_FORGE } from '../../lib/config';
import { jitaBook, regionHistory } from '../../lib/market';
import type { BookLevel, HistRow } from '../../lib/types';

/**
 * The Jita books and The Forge's histories the Research tab reads: the 17 datacores' (what an agent's points fetch) and
 * the skillbooks a character hasn't injected yet. Each read is the app's own (`jitaBook`, kept until ESI has a newer
 * one; `regionHistory`, kept 3 hours; both shared while in flight, so a page drawn twice asks once), at most AT_ONCE at a
 * time and in the order asked (the datacores' books first: they rank the agents). Nothing read is never a zero: a read
 * still going is `undefined` ("Pricing…"), one ESI refused is `'failed'` ("–", with Try again).
 */
export type Book = { bid: number | null; bids: BookLevel[]; ask: number | null; asks: BookLevel[]; npc: number | null };
export type Read<T> = T | 'failed' | undefined;
/** `b:<type>` for a Jita book, `h:<type>` for The Forge's history. */
export type Want = `b:${number}` | `h:${number}`;

const AT_ONCE = 4;

export function useResearchMarket(wants: Want[]): { books: Record<number, Read<Book>>; hist: Record<number, Read<HistRow[]>>; failed: number; retry: () => void } {
  const [got, setGot] = useState<Record<string, Book | HistRow[] | 'failed'>>({});
  // What has landed, beside the state, so a run of the effect asks only for the rest. Set only by a run still current:
  // one cut short (the page gone, or drawn twice) leaves its reads to the next, which shares them while they're in flight.
  const settled = useRef(new Set<string>());
  const [tries, setTries] = useState(0);
  const key = wants.join(',');
  useEffect(() => {
    let alive = true;
    const queue = key.split(',').filter((w) => w && !settled.current.has(w));
    let next = 0;
    const work = async () => {
      while (alive && next < queue.length) {
        const w = queue[next++];
        const id = Number(w.slice(2));
        const v: Book | HistRow[] | 'failed' = w.startsWith('b:')
          ? await jitaBook(id).then((s): Book => ({ bid: s.bestBuy, bids: s.topBuys, ask: s.bestSell, asks: s.topSells, npc: s.npcAnywhere ?? null }), () => 'failed' as const)
          : await regionHistory(id, THE_FORGE).catch(() => 'failed' as const);
        if (!alive) return;
        settled.current.add(w);
        setGot((x) => ({ ...x, [w]: v }));
      }
    };
    for (let i = 0; i < AT_ONCE; i++) void work();
    return () => { alive = false; };
  }, [key, tries]);
  const { books, hist } = useMemo(() => {
    const books: Record<number, Read<Book>> = {}, hist: Record<number, Read<HistRow[]>> = {};
    for (const [w, v] of Object.entries(got)) {
      if (w.startsWith('b:')) books[Number(w.slice(2))] = v as Read<Book>;
      else hist[Number(w.slice(2))] = v as Read<HistRow[]>;
    }
    return { books, hist };
  }, [got]);
  const failed = Object.values(got).filter((v) => v === 'failed').length;
  const retry = () => {
    for (const [w, v] of Object.entries(got)) if (v === 'failed') settled.current.delete(w);
    setGot((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== 'failed')));
    setTries((n) => n + 1);
  };
  return { books, hist, failed, retry };
}
