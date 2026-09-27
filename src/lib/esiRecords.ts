/**
 * ESI's answers turned into the ledger's records, shared by the app's sync (`sync.ts`) and the cloud Worker's
 * hourly archive (`worker/src/archive.ts`), so a trade or an order stored by either is the same record.
 *
 * Deliberately imports nothing: the Worker can't load the app's type modules (they reach browser-only
 * config), so the shapes are written out here and the app's own types accept them.
 */

export type RawTx = {
  transaction_id: number; date: string; is_buy: boolean; quantity: number;
  type_id: number; unit_price: number; location_id: number; journal_ref_id?: number;
};
export type RawJournal = {
  id: number; date: string; ref_type: string; amount?: number; balance?: number;
  context_id?: number; context_id_type?: string;
  first_party_id?: number; second_party_id?: number; description?: string; reason?: string;
};
export type RawCharOrder = {
  order_id: number; type_id: number; is_buy_order?: boolean; price: number;
  volume_total: number; volume_remain: number; issued: string; state?: string; location_id: number; escrow?: number;
};
export type RawAsset = { item_id: number; type_id: number; quantity: number; location_id: number; location_flag: string; location_type: string; is_blueprint_copy?: boolean };

export type TxRecord = {
  id: string; source: 'esi'; typeId: number; date: string; isBuy: boolean; qty: number; unitPrice: number; locationId: number;
};
export type JournalRecord = {
  id: string; date: string; refType: string; amount: number; contextId?: number; contextIdType?: string; balance?: number;
  firstPartyId?: number; secondPartyId?: number; description?: string; reason?: string;
};
export type OrderVersion = { issued: string; price: number; remain: number };
export type OrderRecord = {
  orderId: number; typeId: number; isBuy: boolean; price: number; volumeTotal: number; volumeRemain: number;
  issued: string; state: string; locationId: number; escrow?: number; seen?: OrderVersion[];
};
export type StockRecord = {
  at: string; jita: Record<number, number>; total: Record<number, number>; inContainers: number;
  byLocation?: Record<number, Record<number, number>>; nested?: Record<number, number>;
};

export function toTx(t: RawTx): TxRecord {
  return {
    id: String(t.transaction_id), source: 'esi', typeId: t.type_id, date: t.date, isBuy: t.is_buy,
    qty: t.quantity, unitPrice: t.unit_price, locationId: t.location_id,
  };
}

export function toJournal(j: RawJournal): JournalRecord {
  return {
    id: String(j.id), date: j.date, refType: j.ref_type, amount: j.amount ?? 0,
    contextId: j.context_id, contextIdType: j.context_id_type, balance: j.balance,
    firstPartyId: j.first_party_id, secondPartyId: j.second_party_id,
    description: j.description, reason: j.reason || undefined,
  };
}

export function toOrder(o: RawCharOrder, fallbackState: string): OrderRecord {
  return {
    orderId: o.order_id, typeId: o.type_id, isBuy: !!o.is_buy_order, price: o.price,
    volumeTotal: o.volume_total, volumeRemain: o.volume_remain, issued: o.issued,
    state: o.state ?? fallbackState, locationId: o.location_id, escrow: o.escrow,
  };
}

/**
 * An order as synced, with its history carried over from what was stored. A version is added whenever
 * its `issued` time or price has moved since the last one seen.
 */
export function withHistory<T extends OrderRecord>(prev: T | undefined, next: T): T {
  const seen = prev?.seen?.length ? [...prev.seen] : prev ? [{ issued: prev.issued, price: prev.price, remain: prev.volumeRemain }] : [];
  const last = seen[seen.length - 1];
  if (!last || last.issued !== next.issued || last.price !== next.price) seen.push({ issued: next.issued, price: next.price, remain: next.volumeRemain });
  return { ...next, seen };
}

/**
 * Count what the character is holding, per item.
 *
 * ESI reports an item's location as whatever contains it, so anything inside a can or a ship is
 * listed against that container's id rather than a station. Those cannot be attributed to a place,
 * so they are counted separately and reported rather than quietly folded in.
 */
export function countStock(raw: RawAsset[], jitaId: number): StockRecord {
  const jita: Record<number, number> = {};
  const total: Record<number, number> = {};
  const byLocation: Record<number, Record<number, number>> = {};
  const nested: Record<number, number> = {};
  const stations = new Set(raw.filter((a) => a.location_type === 'station').map((a) => a.location_id));
  const itemIds = new Set(raw.map((a) => a.item_id));
  let inContainers = 0;
  for (const a of raw) {
    // A blueprint copy shares its type with the original, so any price for it would be the
    // original's: one copy of a battleship blueprint would read as billions. Copies can't be sold on
    // the market at all, so they are not stock and are left out of every count.
    if (a.is_blueprint_copy) continue;
    total[a.type_id] = (total[a.type_id] ?? 0) + a.quantity;
    if (a.location_id === jitaId && a.location_flag === 'Hangar') {
      jita[a.type_id] = (jita[a.type_id] ?? 0) + a.quantity;
    }
    if (a.location_type === 'item' && !stations.has(a.location_id)) inContainers += a.quantity;
    // Inside something you own (a ship, a can): counted apart. A structure's hangar is also an
    // "item" location, but the structure is not yours, which is how the two are told apart.
    if (a.location_type === 'item' && itemIds.has(a.location_id)) {
      nested[a.type_id] = (nested[a.type_id] ?? 0) + a.quantity;
    } else if (a.location_flag === 'Hangar') {
      const loc = (byLocation[a.location_id] ??= {});
      loc[a.type_id] = (loc[a.type_id] ?? 0) + a.quantity;
    }
  }
  return { at: new Date().toISOString(), jita, total, inContainers, byLocation, nested };
}

/**
 * What the Wallet page calls net worth, from the same parts: the wallet, stock listed in sell orders,
 * everything held valued at CCP's rough global average, buy-order escrow, and loyalty points at the rate
 * the Loyalty pricing found (only for as many points as that plan could place). `liquid` is what could be
 * freed without selling anything.
 */
export function netWorthOf(p: {
  wallet: number;
  orders: OrderRecord[];
  stockTotal: Record<number, number> | undefined;
  roughPrices: Record<number, number>;
  lp: { corporationId: number; points: number }[];
  lpRate: Record<number, { rate: number; lp?: number | null }> | undefined;
}): { total: number; wallet: number; liquid: number } {
  const open = p.orders.filter((o) => o.state === 'open');
  const sellValue = open.filter((o) => !o.isBuy).reduce((t, o) => t + o.price * o.volumeRemain, 0);
  const escrow = open.filter((o) => o.isBuy).reduce((t, o) => t + (o.escrow ?? o.price * o.volumeRemain), 0);
  let assets = 0;
  for (const [id, q] of Object.entries(p.stockTotal ?? {})) assets += (p.roughPrices[Number(id)] ?? 0) * q;
  let lpValue = 0;
  for (const b of p.lp) {
    const r = p.lpRate?.[b.corporationId];
    if (r?.lp == null) continue;
    lpValue += Math.min(b.points, r.lp) * r.rate;
  }
  return { total: p.wallet + sellValue + assets + escrow + lpValue, wallet: p.wallet, liquid: p.wallet + escrow + sellValue };
}
