/**
 * One item's Jita market as List loot and "List your stock" judge it: the live book with your own orders taken out,
 * the last 14 days' highs (with what the app watched), a typical day and the buyer/seller split. I/O; the rules are in
 * lootList.ts.
 */
import { FILL_WINDOW, recentRange } from './fills';
import { watchedDays, watchedFlow } from './flowStore';
import type { LootMarket } from './lootList';
import { jitaOrders, marketHistory } from './market';
import { paceDay } from './prospects';
import { buyerShare, tradingSplit } from './split';
import type { HistRow } from './types';

export async function readLootMarket(typeId: number, mine: ReadonlySet<number>): Promise<{ market: LootMarket; history: HistRow[] }> {
  const [book, h] = await Promise.all([jitaOrders(typeId), marketHistory(typeId).catch(() => [] as HistRow[])]);
  const perDay = h.length ? paceDay(h) : null;
  return {
    history: h,
    market: {
      // Your own orders aren't the market you'd list into.
      others: book.orders.filter((o) => !mine.has(o.id)),
      highs: h.length ? recentRange(h, FILL_WINDOW, Date.now(), watchedDays(typeId)).highs : null,
      perDay,
      buyers: tradingSplit({ history: h.length ? buyerShare(h.slice(-30)) : null, book: book.sold, watched: watchedFlow(typeId), typicalDay: perDay }).share,
    },
  };
}

/** Runs `fn` over `xs`, `n` at a time. */
export async function pool<T>(xs: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (next < xs.length) await fn(xs[next++]); }));
}
