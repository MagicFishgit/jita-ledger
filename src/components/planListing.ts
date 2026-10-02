import { useEffect, useMemo, useState } from 'react';
import { rates } from '../lib/fees';
import { FILL_WINDOW, recentRange } from '../lib/fills';
import { useFlow, watchedDays } from '../lib/flowStore';
import { jitaOrders, marketHistory, type OrderLite } from '../lib/market';
import { listMarket, planListPrice, type ListMarket, type PlanListPrice } from '../lib/plans';
import { planListRows, type PlanListRow } from '../lib/positions';
import { useData } from '../lib/store';
import type { HistRow } from '../lib/types';

/**
 * The list step's rows with their prices, shared by the plan's checklist (the planner and Positions' Plans panel) and To do.
 * The rows come from the ledger (`planListRows`); the prices need each item's Jita book and history, which nothing else reads
 * for an item with no open order (`orderCheck` reads only those), so they're read here, again every five minutes while shown.
 * A read that fails is said by the row, never thrown: the page check refuses every request outside the app.
 */

/** Re-read the books this often while a list is shown: ESI's copy of a book turns over every five minutes. */
const REREAD_MS = 5 * 60_000;

/** One item's reads: undefined until tried; null where it failed. */
type Read = { book: OrderLite[] | null; hist: HistRow[] | null };

export type PricedRow = PlanListRow & {
  /** Priced without a book until its first read of a visit (`read`): the plan's own price for Place and leave, none at the front. */
  priced: PlanListPrice;
  /** Whether its book and history have been asked for at least once: a front plan's price needs them. */
  read: boolean;
};

export function usePlanListing(): PricedRow[] {
  const d = useData();
  const flow = useFlow();
  const rows = useMemo(() => planListRows(d, d.settings),
    [d.plans, d.positions, d.txs, d.journal, d.orders, d.settings, d.stock]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = [...new Set(rows.map((r) => r.item.typeId))].sort((a, b) => a - b).join(',');
  const [reads, setReads] = useState<Record<number, Read>>({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    const ids = key.split(',').map(Number);
    // Not while the tab is hidden: it reads once more on coming back into view, as the other pages do.
    const readAll = () => {
      if (document.visibilityState === 'hidden') return;
      for (const id of ids) {
        Promise.all([
          jitaOrders(id).then((r) => r.orders).catch(() => null),
          marketHistory(id).catch(() => null),
        ]).then(([book, hist]) => { if (live) setReads((m) => ({ ...m, [id]: { book, hist } })); });
      }
    };
    readAll();
    const t = setInterval(readAll, REREAD_MS);
    const onShow = () => { if (document.visibilityState === 'visible') readAll(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { live = false; clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [key]);
  return useMemo(() => {
    const r = rates(d.settings);
    const yours = Object.values(d.orders).map((o) => o.orderId);
    return rows.map((row) => {
      const x = reads[row.item.typeId];
      if (!x) return { ...row, priced: planListPrice(row.item, row.plan.patient, row.units, row.unitCost!, r, null), read: false };
      const highs = x.hist?.length ? recentRange(x.hist, FILL_WINDOW, Date.now(), watchedDays(row.item.typeId)).highs : null;
      // A book that couldn't be read leaves the front without a price; Place and leave still has its own, and the history.
      const m: ListMarket | null = x.book ? listMarket(x.book, yours, highs) : row.plan.patient ? { bestSell: null, bestBuy: null, highs } : null;
      return { ...row, priced: planListPrice(row.item, row.plan.patient, row.units, row.unitCost!, r, m), read: true };
    });
  }, [rows, reads, flow, d.orders, d.settings]); // eslint-disable-line react-hooks/exhaustive-deps
}
