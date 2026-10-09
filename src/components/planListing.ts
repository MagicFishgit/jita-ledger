import { useEffect, useMemo, useState } from 'react';
import { rates } from '../lib/fees';
import { FILL_WINDOW, recentRange } from '../lib/fills';
import { useFlow, watchedDays } from '../lib/flowStore';
import { jitaOrders, marketHistory, type OrderLite } from '../lib/market';
import { listMarket, placeMoved, planListPrice, planProgress, skipPlanItem, type ListMarket, type PlanItem, type PlanListPrice, type TradePlan } from '../lib/plans';
import type { MarketMove } from '../lib/prospects';
import { planListRows, type PlanListRow } from '../lib/positions';
import { update, useData } from '../lib/store';
import { toast } from '../lib/toast';
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

/**
 * Each item's Jita book (and, with `history`, its history), read when `key` (the type IDs, sorted, comma-joined) names it,
 * then every REREAD_MS while the tab is in view and once on coming back into view. Books are cached and shared in flight
 * (market.ts), so two lists reading one item cost one request.
 */
function useItemReads(key: string, history: boolean): Record<number, Read> {
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
          history ? marketHistory(id).catch(() => null) : Promise.resolve(null),
        ]).then(([book, hist]) => { if (live) setReads((m) => ({ ...m, [id]: { book, hist } })); });
      }
    };
    readAll();
    const t = setInterval(readAll, REREAD_MS);
    const onShow = () => { if (document.visibilityState === 'visible') readAll(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { live = false; clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [key, history]);
  return reads;
}

export function usePlanListing(): PricedRow[] {
  const d = useData();
  const flow = useFlow();
  const rows = useMemo(() => planListRows(d, d.settings),
    [d.plans, d.positions, d.txs, d.journal, d.orders, d.settings, d.stock]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = [...new Set(rows.map((r) => r.item.typeId))].sort((a, b) => a - b).join(',');
  const reads = useItemReads(key, true);
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

/** How long a started plan asks for its bids, on the checklist and To do: its week. */
const PLACING_MS = 7 * 86400_000;

/** One plan item still to place, against its live Jita book. */
export type PlaceCheck = {
  /** Its book has been asked for at least once this visit. */
  read: boolean;
  /** The book couldn't be read: whether the market moved can't be told. */
  failed: boolean;
  /** Others' best bid and cheapest listing (your own orders left out); null with no book, or nobody bidding or listing. */
  bestBuy: number | null; bestSell: number | null;
  /** Market moved's rule on the plan's prices (`placeMoved`); null when not moved or not known. */
  move: MarketMove | null;
};

/**
 * Every bid still to place in a plan of the last week (`planProgress`' waiting), against its live Jita book, keyed
 * `${planId}:${typeId}`: the checklist and To do say when the market has moved from the plan's prices and offer Skip it
 * (the plans review, 9 October 2026). The books are read here, as the list step's are, since nothing else reads an item
 * with no order of yours open on it; with nothing waiting, nothing is read.
 */
export function usePlacingCheck(): Record<string, PlaceCheck> {
  const d = useData();
  const waiting = useMemo(() => {
    const orders = Object.values(d.orders);
    const trades = { txs: Object.values(d.txs), ignored: d.ignored };
    const out: { plan: TradePlan; item: PlanItem }[] = [];
    for (const p of d.plans) {
      if (Date.now() - Date.parse(p.at) > PLACING_MS) continue;
      for (const item of planProgress(p, orders, d.positions, trades).waiting) out.push({ plan: p, item });
    }
    return out;
  }, [d.plans, d.orders, d.positions, d.txs, d.ignored]);
  const key = [...new Set(waiting.map((x) => x.item.typeId))].sort((a, b) => a - b).join(',');
  const reads = useItemReads(key, false);
  return useMemo(() => {
    const yours = Object.values(d.orders).map((o) => o.orderId);
    const out: Record<string, PlaceCheck> = {};
    for (const { plan, item } of waiting) {
      const x = reads[item.typeId];
      const m = x?.book ? listMarket(x.book, yours, null) : null;
      out[`${plan.id}:${item.typeId}`] = {
        read: !!x, failed: !!x && !x.book, bestBuy: m?.bestBuy ?? null, bestSell: m?.bestSell ?? null, move: placeMoved(item, m),
      };
    }
    return out;
  }, [waiting, reads, d.orders]);
}

/**
 * "Skip it", from the checklist or To do: the plan no longer asks for the item, keeping when and the book it read so the
 * row can say why. Its position stays as it is: a bid placed for it later still counts as placing it.
 */
export function skipPlaceBid(planId: string, typeId: number, name: string, book: { bestBuy: number | null; bestSell: number | null }) {
  update((x) => ({ plans: skipPlanItem(x.plans, planId, typeId, { at: new Date().toISOString(), bestBuy: book.bestBuy, bestSell: book.bestSell }) }));
  toast(`Skipped ${name}: the plan won’t ask for it again. Its position stays as it is, and a bid placed for it later still counts.`);
}

/** "Place it after all": the skip undone, so the checklist and To do ask for it again. */
export function unskipPlaceBid(planId: string, typeId: number) {
  update((x) => ({ plans: skipPlanItem(x.plans, planId, typeId, null) }));
}
