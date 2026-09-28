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
  /** Wraps of your items in asset safety, or delivered and not yet unpacked. Absent on stock read before they were kept. */
  safety?: SafetyWrap[];
};

/**
 * The Asset Safety Wrap: when a structure holding your things is destroyed or you lose access to it, EVE puts them
 * in one of these (type 60, unpublished, so ESI's name lookup doesn't find it). Seen on the user's assets on 28
 * September 2026: the wrap flagged `AssetSafety` at location 2004 ("other": ESI doesn't say which system), and
 * everything in it listed inside it, ships with their fittings and containers with their contents a level deeper.
 */
export const ASSET_SAFETY_WRAP = 60;

export type SafetyWrap = {
  /** The wrap's item ID. */
  id: number;
  /** Still in asset safety, or delivered to a station and waiting to be unpacked. */
  state: 'waiting' | 'delivered';
  /** Where it was delivered. */
  stationId: number | null;
  /** Everything inside it, at any depth, by type. */
  items: Record<number, number>;
  /**
   * The same things as they're packed: the containers and ships lying in it, each with what's inside, and the rest
   * loose by type. Absent on wraps read before they were kept (then everything shows loose).
   */
  holders?: SafetyHolder[];
  loose?: Record<number, number>;
  /** What lies loose in it, blueprint copies included (absent on wraps read before copies were shown). */
  contents?: SafetyStack[];
  /**
   * A name for it. The client shows the lost structure's ("K7D-II - Iserlohn Fortress"), but ESI has none to give:
   * `/assets/names` answers "None" for a wrap (28 September 2026), so nothing fills this yet and it's carried if set.
   */
  name?: string;
  /** When the cloud first saw it, and whether that's within the hour of it going in (so the countdown is known). */
  firstSeen?: string;
  startKnown?: boolean;
  /** When it was first seen delivered. */
  deliveredAt?: string;
};

/** Something in a wrap that holds other things: a container with what's in it, a ship with its fitting and cargo. */
export type SafetyHolder = {
  id: number;
  typeId: number;
  /** The name you gave it in game, when it has one. */
  name?: string;
  /** What's directly inside it and holds nothing itself, by type. */
  items: Record<number, number>;
  /** What's directly inside it and holds things in turn, like a container in a ship's cargo. */
  holders?: SafetyHolder[];
  /** Where it sits in the ship holding it ("Cargo hold"); absent in a container or loose in the wrap. */
  bay?: string;
  /**
   * The same as `items` by where each sits in a ship (fitted, cargo hold, drone bay), with blueprint copies too:
   * `items` leaves copies out, as every count does, and a container of nothing but copies read as empty. Absent on
   * holders read before this was kept.
   */
  contents?: SafetyStack[];
};

/** One kind of thing lying in a wrap, container or ship: how many, where in a ship, and whether they're blueprint copies. */
export type SafetyStack = { typeId: number; q: number; bay?: string; copy?: true };

/**
 * Where in a ship an ESI location flag puts something, as the game names it; none for a container's or a hangar's
 * own flags. Charges loaded in a module share its slot, so they count as fitted too.
 */
export function bayOf(flag: string): string | undefined {
  if (flag === 'Hangar' || flag === 'Unlocked' || flag === 'Locked' || flag === 'AssetSafety') return undefined;
  if (/^(HiSlot|MedSlot|LoSlot|RigSlot|SubSystemSlot|ServiceSlot)/.test(flag)) return 'Fitted';
  const named: Record<string, string> = { Cargo: 'Cargo hold', DroneBay: 'Drone bay', FleetHangar: 'Fleet hangar', ShipHangar: 'Ship maintenance bay', FighterBay: 'Fighter bay' };
  if (named[flag]) return named[flag];
  if (/^FighterTube/.test(flag)) return 'Fighter bay';
  const words = flag.replace(/^Specialized/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Every container and ship in these wraps, at any depth. */
export function safetyHolders(wraps: SafetyWrap[] | undefined): SafetyHolder[] {
  const out: SafetyHolder[] = [];
  const walk = (hs: SafetyHolder[] | undefined) => { for (const h of hs ?? []) { out.push(h); walk(h.holders); } };
  for (const w of wraps ?? []) walk(w.holders);
  return out;
}

/** Containers and ships in `next` that `prev` has no name for: the ones to ask ESI about (1,000 at most a call). */
export function unnamedHolders(prev: SafetyWrap[] | undefined, next: SafetyWrap[] | undefined): number[] {
  const named = new Set(safetyHolders(prev).filter((h) => h.name).map((h) => h.id));
  return safetyHolders(next).filter((h) => !named.has(h.id)).map((h) => h.id).slice(0, 1000);
}

/** The wraps with names given to their containers and ships (from `/assets/names`); ESI's "None" is no name. */
export function nameHolders(wraps: SafetyWrap[], names: Map<number, string>): SafetyWrap[] {
  const named = (hs: SafetyHolder[] | undefined): SafetyHolder[] | undefined => hs?.map((h) => {
    const n = names.get(h.id)?.trim();
    const out: SafetyHolder = { ...h, ...(h.holders ? { holders: named(h.holders) } : {}) };
    if (n && n !== 'None') out.name = n;
    return out;
  });
  return wraps.map((w) => (w.holders ? { ...w, holders: named(w.holders) } : w));
}

/**
 * Carries forward what was learned about each wrap (its name, when it was first seen, when it was delivered) from
 * the stock read before: the browser and the cloud both write the stock record whole, and neither may lose what the
 * other found. `known` is the cloud's own record, which wins.
 */
export function mergeSafety(prev: SafetyWrap[] | undefined, next: SafetyWrap[] | undefined,
  known?: Map<number, Pick<SafetyWrap, 'firstSeen' | 'startKnown' | 'deliveredAt'>>): SafetyWrap[] | undefined {
  if (!next) return undefined;
  const before = new Map((prev ?? []).map((w) => [w.id, w]));
  // A container or ship keeps its item ID while it's in the wrap, and so the name it was given.
  const renamed = new Set(safetyHolders(next).filter((h) => h.name).map((h) => h.id));
  const holderNames = new Map(safetyHolders(prev).filter((h) => h.name && !renamed.has(h.id)).map((h) => [h.id, h.name!]));
  return nameHolders(next, holderNames).map((w) => {
    const was = before.get(w.id), k = known?.get(w.id);
    const out: SafetyWrap = { ...w };
    const name = w.name ?? was?.name;
    const firstSeen = k?.firstSeen ?? was?.firstSeen;
    const startKnown = k?.startKnown ?? was?.startKnown;
    const deliveredAt = w.state === 'delivered' ? (k?.deliveredAt ?? was?.deliveredAt) : undefined;
    if (name) out.name = name;
    if (firstSeen) out.firstSeen = firstSeen;
    if (startKnown != null) out.startKnown = startKnown;
    if (deliveredAt) out.deliveredAt = deliveredAt;
    return out;
  });
}

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
  // Asset safety: each wrap and everything inside it, at any depth. They are yours and count in the total, but are
  // told apart from ships and containers, and the wrap itself (worth nothing) isn't counted.
  const inside = new Map<number, RawAsset[]>();
  for (const a of raw) if (a.location_type === 'item') inside.set(a.location_id, [...(inside.get(a.location_id) ?? []), a]);
  const safe = new Set<number>();
  const safety: SafetyWrap[] = [];
  // What's directly in something, as packed: things holding things become holders, the rest is counted by type.
  // Blueprint copies are listed (a container of nothing else read as empty) but kept out of `loose`, like every count.
  const packed = (id: number, seen: Set<number>) => {
    const loose: Record<number, number> = {};
    const holders: SafetyHolder[] = [];
    const stacks = new Map<string, SafetyStack>();
    for (const a of inside.get(id) ?? []) {
      if (seen.has(a.item_id)) continue;
      seen.add(a.item_id);
      const bay = bayOf(a.location_flag);
      if (inside.has(a.item_id)) {
        const p = packed(a.item_id, seen);
        holders.push({
          id: a.item_id, typeId: a.type_id, items: p.loose, contents: p.contents,
          ...(p.holders.length ? { holders: p.holders } : {}), ...(bay ? { bay } : {}),
        });
        continue;
      }
      const copy = !!a.is_blueprint_copy;
      if (!copy) loose[a.type_id] = (loose[a.type_id] ?? 0) + a.quantity;
      const k = `${a.type_id}|${bay ?? ''}|${copy ? 1 : 0}`;
      const s = stacks.get(k);
      if (s) s.q += a.quantity;
      else stacks.set(k, { typeId: a.type_id, q: a.quantity, ...(bay ? { bay } : {}), ...(copy ? { copy: true as const } : {}) });
    }
    return { loose, holders, contents: [...stacks.values()] };
  };
  for (const w of raw) {
    if (w.type_id !== ASSET_SAFETY_WRAP && w.location_flag !== 'AssetSafety') continue;
    if (safe.has(w.item_id)) continue;
    const items: Record<number, number> = {};
    const stack = [...(inside.get(w.item_id) ?? [])];
    safe.add(w.item_id);
    while (stack.length) {
      const a = stack.pop()!;
      if (safe.has(a.item_id)) continue;
      safe.add(a.item_id);
      if (!a.is_blueprint_copy) items[a.type_id] = (items[a.type_id] ?? 0) + a.quantity;
      stack.push(...(inside.get(a.item_id) ?? []));
    }
    const waiting = w.location_flag === 'AssetSafety';
    const { loose, holders, contents } = packed(w.item_id, new Set([w.item_id]));
    safety.push({ id: w.item_id, state: waiting ? 'waiting' : 'delivered', stationId: waiting ? null : w.location_id, items, holders, loose, contents });
  }
  let inContainers = 0;
  for (const a of raw) {
    // A blueprint copy shares its type with the original, so any price for it would be the
    // original's: one copy of a battleship blueprint would read as billions. Copies can't be sold on
    // the market at all, so they are not stock and are left out of every count.
    if (a.is_blueprint_copy) continue;
    if (a.type_id === ASSET_SAFETY_WRAP) continue;
    total[a.type_id] = (total[a.type_id] ?? 0) + a.quantity;
    if (safe.has(a.item_id)) continue;
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
  return { at: new Date().toISOString(), jita, total, inContainers, byLocation, nested, safety };
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
