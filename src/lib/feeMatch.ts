/**
 * Which fee in the wallet journal belongs to which order, and which sales tax to which sale.
 *
 * ESI's journal gives neither: a broker fee or a sales-tax entry carries no order or trade ID at all
 * (checked on a real journal: 588 broker fees and 2,473 tax entries, not one with a context). What does
 * line up is time. A fee is charged the second an order is placed or its price is changed, and changing
 * the price moves the order's `issued` time to that second; sales tax is charged the second a sale
 * happens. So a fee is matched to an order by the exact second of one of its versions, and a tax to a
 * sale by the second it sold, with the amount deciding between entries in the same second.
 *
 * Anything that can't be matched is estimated from your rates, and says so.
 *
 * Pure: takes the journal, orders and trades, returns the matches.
 */

import type { JournalEntry, Order, Tx } from './types';
import { withHistory, type OrderVersion } from './esiRecords';

// Kept with the ESI record shapes (shared with the cloud Worker); re-exported for existing callers.
export { withHistory, type OrderVersion };

/** Merge a sync's orders onto the stored ones, keeping each order's history. */
export function mergeOrders(cur: Record<string, Order>, fetched: Record<string, Order>): Record<string, Order> {
  const out = { ...cur };
  for (const [id, o] of Object.entries(fetched)) out[id] = withHistory(cur[id], o);
  return out;
}

export type FeeRates = (iso: string) => { f: number; k: number; t: number };

/** A fee, when it was charged, and how many units were left on the order then (what it was charged on). */
export type OrderFee = {
  at: string; amount: number; actual: boolean; remain: number; journalId?: string;
  /** The order value it was charged on: the whole order for a placement, what was left for a price change. */
  value: number;
};
export type OrderFees = { placement: OrderFee; relists: OrderFee[] };
export type FeeMatches = {
  byOrder: Map<number, OrderFees>;
  /** Sales tax actually paid, by transaction ID, where the journal entry could be matched. */
  taxByTx: Map<string, number>;
  /** Journal entries matched as price changes, for the Wallet's fee leak. */
  relistIds: Set<string>;
};

/** A version counts as the placement when its fee is most of a full broker fee on the whole order. */
const PLACEMENT_SHARE = 0.75;

const second = (iso: string) => iso.slice(0, 19);

/** The unclaimed entry in the same second whose amount is closest to what was expected. */
function pick(list: JournalEntry[] | undefined, claimed: Set<string>, expected: number): JournalEntry | null {
  let best: JournalEntry | null = null;
  for (const e of list ?? []) {
    if (claimed.has(e.id)) continue;
    // By the amount charged, or for a fee a GM refunded (zero in the netted journal), the amount it was.
    const size = (x: JournalEntry) => Math.abs(x.refunded ?? x.amount);
    if (!best || Math.abs(size(e) - expected) < Math.abs(size(best) - expected)) best = e;
  }
  return best;
}

export function matchFees(journal: JournalEntry[], orders: Order[], txs: Tx[], rateAt: FeeRates): FeeMatches {
  const fees = new Map<string, JournalEntry[]>();
  const taxes = new Map<string, JournalEntry[]>();
  for (const e of journal) {
    const map = e.refType === 'brokers_fee' ? fees : e.refType === 'transaction_tax' ? taxes : null;
    if (!map) continue;
    const k = second(e.date);
    const list = map.get(k) ?? [];
    list.push(e);
    map.set(k, list);
  }
  const claimed = new Set<string>();
  const byOrder = new Map<number, OrderFees>();
  const relistIds = new Set<string>();

  // Oldest first, so an earlier order claims its placement fee before a later one in the same second.
  const sorted = [...orders].sort((a, b) => Date.parse((a.seen?.[0] ?? a).issued) - Date.parse((b.seen?.[0] ?? b).issued));
  for (const o of sorted) {
    const versions: OrderVersion[] = o.seen?.length ? o.seen : [{ issued: o.issued, price: o.price, remain: o.volumeRemain }];
    let placement: OrderFee | null = null;
    const relists: OrderFee[] = [];
    versions.forEach((v, i) => {
      const r = rateAt(v.issued);
      const full = Math.max(100, r.f * v.price * o.volumeTotal);
      // Raising a price also pays the broker fee on the increase, on every unit left: the user's Ghoul bid raised from
      // 1,882 to 2,012 paid 333 k where its other changes paid ~254 k, and their fat-fingered relist from 1,893 to
      // 1,893,000 paid 467.7 M. Without it, a big raise was matched to a smaller fee in the same second.
      const prev = i > 0 ? versions[i - 1] : null;
      const raise = prev && v.price > prev.price ? r.f * (v.price - prev.price) * v.remain : 0;
      const change = Math.max(100, r.k * v.price * v.remain + raise);
      // The first version seen is usually the placement, but if the app first saw the order after its
      // price had already been changed, it's a change: the fee's size tells the two apart.
      const expectPlacement = i === 0;
      const e = pick(fees.get(second(v.issued)), claimed, expectPlacement ? full : change);
      if (e) claimed.add(e.id);
      const amount = e ? Math.abs(e.amount) : expectPlacement ? full : change;
      // A refunded fee charges nothing but is told apart by what it was.
      const size = e ? Math.abs(e.refunded ?? e.amount) : amount;
      const isPlacement = expectPlacement && (!e || size >= PLACEMENT_SHARE * r.f * v.price * o.volumeTotal);
      const fee: OrderFee = { at: v.issued, amount, actual: !!e, remain: v.remain, journalId: e?.id, value: v.price * (isPlacement ? o.volumeTotal : v.remain) };
      if (isPlacement) placement = fee;
      else { relists.push(fee); if (e) relistIds.add(e.id); }
    });
    // A placement never seen: estimate it from the earliest price we know.
    if (!placement) {
      const v = versions[0];
      placement = { at: v.issued, amount: Math.max(100, rateAt(v.issued).f * v.price * o.volumeTotal), actual: false, remain: o.volumeTotal, value: v.price * o.volumeTotal };
    }
    byOrder.set(o.orderId, { placement, relists });
  }

  const taxByTx = new Map<string, number>();
  const sales = txs.filter((t) => !t.isBuy && t.source === 'esi').sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  for (const t of sales) {
    const expected = rateAt(t.date).t * t.qty * t.unitPrice;
    const e = pick(taxes.get(second(t.date)), claimed, expected);
    // Same second but nothing like the right size is someone else's sale.
    if (e && (expected <= 0 || Math.abs(Math.abs(e.amount) - expected) <= expected * 0.5)) {
      claimed.add(e.id);
      taxByTx.set(t.id, Math.abs(e.amount));
    }
  }
  return { byOrder, taxByTx, relistIds };
}
