/**
 * "Check my hangar" on Positions: which of what you hold could be counted against a position. The user (3 October 2026)
 * came back from exploration with loot in a container in Jita 4-4 named "Lewds", some of it items their plan had buy
 * orders on, and asked whether selling it affects the plan. It does: a position counts every Jita sale of its item after
 * it opened (`matchTx` in positions.ts), and EVE's trades don't say which stack a unit came from, so a loot sale is taken
 * from the position's own units. "create a button to click in positions that checks my jita inventory and then gives me a
 * list of items that is there that could affect orders", then, on the design, "rather let the button have me choose where
 * to look".
 *
 * Pure: the places you hold things in, from a fresh read of your assets (with the names you gave containers and ships),
 * what counts as held in each, and the rows for the place picked. The modal (components/HangarCheck.tsx) reads and draws.
 * Nothing here is saved or synced.
 */
import { JITA_44 } from './constants';
import { ASSET_SAFETY_WRAP, bayOf, type RawAsset } from './esiRecords';
import { rates, type Settings } from './fees';
import { fmtDateTime, units } from './format';
import { computePosition, planPosition, type PositionCalc } from './positions';
import { planTargets } from './plans';
import type { Data } from './store';
import type { Order, Position } from './types';

/** ESI holds a character's assets an hour: what it answers was read up to an hour before it lets go. */
export const ASSETS_HELD_MS = 3600_000;
/** When ESI's copy of your assets was taken, from when it lets go (`cacheUntil`); null when it names no time. */
export const assetsTakenAt = (expires: number | null): number | null => (expires == null ? null : expires - ASSETS_HELD_MS);

/** A container or ship you own, on the way down to a stack: its item, its type and the name you gave it (null when none). */
export type HolderStep = { id: number; typeId: number; name: string | null };

/**
 * Units of one item that count as held, where they lie: the containers and ships around them from the outermost in, the
 * flag the outermost thing has at the place ("Hangar", "Deliveries"), and where in a ship they sit ("Cargo hold", "Drone
 * bay"; null loose or in a container).
 */
export type Stack = { typeId: number; q: number; chain: HolderStep[]; flag: string; bay: string | null };

/**
 * Somewhere in a place to look: its hangar, another of the station's own bays (deliveries), a container or ship with its
 * path (the ship, then the can in its cargo), or the whole place. `units` held there, at any depth.
 */
export type Spot = { key: string; kind: 'hangar' | 'flag' | 'holder' | 'all'; path: HolderStep[]; flag?: string; units: number };

/** A station, structure or system you hold things in, its spots, and every stack held there. */
export type Place = { id: number; units: number; spots: Spot[]; stacks: Stack[] };

/** What's picked: a place and one of its spots (`Spot.key`). */
export type HangarPick = { place: number; spot: string };

/** The name you gave something, as ESI's `/assets/names` gives it: "None" and blanks are no name. */
const given = (n: string | undefined): string | null => {
  const t = n?.trim();
  return t && t !== 'None' ? t : null;
};

/** Your things by item, what lies directly in each, and every asset safety wrap with everything in it at any depth. */
function indexOf(raw: RawAsset[]) {
  const byId = new Map(raw.map((a) => [a.item_id, a]));
  const inside = new Map<number, RawAsset[]>();
  for (const a of raw) if (byId.has(a.location_id) && a.location_id !== a.item_id) inside.set(a.location_id, [...(inside.get(a.location_id) ?? []), a]);
  // A wrap waiting (location 2004) or delivered and not unpacked (type 60 in a station's hangar): the Wallet's asset
  // safety panel shows them, and nothing in one can be sold until it's unpacked.
  const wrapped = new Set<number>();
  for (const w of raw) {
    if (w.type_id !== ASSET_SAFETY_WRAP && w.location_flag !== 'AssetSafety') continue;
    const stack = [w];
    while (stack.length) {
      const a = stack.pop()!;
      if (wrapped.has(a.item_id)) continue;
      wrapped.add(a.item_id);
      stack.push(...(inside.get(a.item_id) ?? []));
    }
  }
  return { byId, inside, wrapped };
}

/** The things that hold other things (containers, ships), outside asset safety: the IDs to ask `/assets/names` about. */
export function holderIds(raw: RawAsset[]): number[] {
  const { inside, wrapped } = indexOf(raw);
  return [...inside.entries()].filter(([id, list]) => !wrapped.has(id) && list.some((a) => !wrapped.has(a.item_id))).map(([id]) => id);
}

/**
 * Whether units count as held: packaged things you could sell. Not a blueprint copy (every count leaves them out: a copy
 * shares its original's type and price), not anything fitted to a ship (charges loaded in a gun share its slot), and not
 * an assembled item (`is_singleton`: a ship in use, a container, an unpacked module, which the market won't take as it is).
 */
const isHeld = (a: RawAsset) => !a.is_blueprint_copy && a.type_id !== ASSET_SAFETY_WRAP && !a.is_singleton && bayOf(a.location_flag) !== 'Fitted';

/**
 * Every place you hold things in, from a fresh read of your assets: Jita 4-4 first (always, with its hangar, so there's
 * somewhere to fall back on), then by how many units are held there. Under each, its hangar, any other bay of its own
 * with something in it (deliveries), every container and ship holding something, nested as a path, and the whole place.
 * Asset safety wraps and everything in them are left out: they have their own panel on the Wallet.
 */
export function readPlaces(raw: RawAsset[], names: ReadonlyMap<number, string>, jitaId = JITA_44): Place[] {
  const { byId, wrapped } = indexOf(raw);
  const step = (a: RawAsset): HolderStep => ({ id: a.item_id, typeId: a.type_id, name: given(names.get(a.item_id)) });
  const byPlace = new Map<number, Stack[]>();
  for (const a of raw) {
    if (wrapped.has(a.item_id) || !isHeld(a)) continue;
    // Up through the containers and ships around it to the place: a station, a structure (whose hangar is an "item"
    // location that isn't one of yours) or a solar system.
    const chain: HolderStep[] = [];
    const seen = new Set([a.item_id]);
    let top = a;
    while (byId.has(top.location_id) && !seen.has(top.location_id)) {
      top = byId.get(top.location_id)!;
      seen.add(top.item_id);
      chain.unshift(step(top));
    }
    const bay = chain.length ? bayOf(a.location_flag) ?? null : null;
    const list = byPlace.get(top.location_id) ?? [];
    list.push({ typeId: a.type_id, q: a.quantity, chain, flag: top.location_flag, bay });
    byPlace.set(top.location_id, list);
  }
  if (!byPlace.has(jitaId)) byPlace.set(jitaId, []);

  const sum = (xs: Stack[]) => xs.reduce((n, x) => n + x.q, 0);
  const places: Place[] = [];
  for (const [id, stacks] of byPlace) {
    const units = sum(stacks);
    if (!units && id !== jitaId) continue;
    const spots: Spot[] = [];
    const loose = stacks.filter((x) => !x.chain.length);
    const hangar = sum(loose.filter((x) => x.flag === 'Hangar'));
    if (hangar || id === jitaId) spots.push({ key: 'hangar', kind: 'hangar', path: [], units: hangar });
    const flags = [...new Set(loose.filter((x) => x.flag !== 'Hangar').map((x) => x.flag))].sort();
    for (const f of flags) spots.push({ key: `flag:${f}`, kind: 'flag', path: [], flag: f, units: sum(loose.filter((x) => x.flag === f)) });
    // Every container and ship holding something, depth first, the bigger first among those side by side.
    const holders = new Map<number, { path: HolderStep[]; units: number }>();
    for (const x of stacks) x.chain.forEach((h, i) => {
      const was = holders.get(h.id);
      if (was) was.units += x.q; else holders.set(h.id, { path: x.chain.slice(0, i + 1), units: x.q });
    });
    const under = (depth: number, parent: number | null): void => {
      const kids = [...holders.entries()].filter(([, h]) => h.path.length === depth + 1 && (parent == null || h.path[depth - 1].id === parent))
        .sort((a, b) => b[1].units - a[1].units || a[0] - b[0]);
      for (const [hid, h] of kids) {
        spots.push({ key: `item:${hid}`, kind: 'holder', path: h.path, units: h.units });
        under(depth + 1, hid);
      }
    };
    under(0, null);
    spots.push({ key: 'all', kind: 'all', path: [], units });
    places.push({ id, units, spots, stacks });
  }
  return places.sort((a, b) => (b.id === jitaId ? 1 : 0) - (a.id === jitaId ? 1 : 0) || b.units - a.units || a.id - b.id);
}

/** The pick kept from last time, while that place and spot are still there; else Jita 4-4's hangar. */
export function resolvePick(places: Place[], kept: HangarPick | null, jitaId = JITA_44): HangarPick {
  if (kept && places.some((p) => p.id === kept.place && p.spots.some((s) => s.key === kept.spot))) return kept;
  return { place: jitaId, spot: 'hangar' };
}

/** Whether a stack lies in a spot. */
export function inSpot(x: Stack, spot: string): boolean {
  if (spot === 'all') return true;
  if (spot === 'hangar') return !x.chain.length && x.flag === 'Hangar';
  if (spot.startsWith('flag:')) return !x.chain.length && x.flag === spot.slice(5);
  return x.chain.some((h) => `item:${h.id}` === spot);
}

/** Where some units of one item lie in the place picked, as one line of "Hangar 10 · Lewds 12". */
export type Where = { key: string; chain: HolderStep[]; flag: string; bay: string | null; q: number };

/** A container or ship's path as you'd find it in game: "Battle Chicken › Equipment"; one with no name goes by its type. */
export const pathLabel = (path: HolderStep[], typeName: (id: number) => string): string => path.map((s) => s.name ?? typeName(s.typeId)).join(' › ');

/** A station's own bay by its flag: "Hangar", "Deliveries". */
export const flagLabel = (flag: string): string => (flag === 'Hangar' ? 'Hangar' : bayOf(flag) ?? flag);

/** Where units lie, in words: "Hangar", "Lewds", "Battle Chicken › Drone bay", "Battle Chicken › Equipment". */
export const whereLabel = (w: Pick<Where, 'chain' | 'flag' | 'bay'>, typeName: (id: number) => string): string =>
  !w.chain.length ? flagLabel(w.flag) : pathLabel(w.chain, typeName) + (w.bay ? ` › ${w.bay}` : '');

/**
 * When each of ESI's copies behind a row was taken, ms: your assets (this read), your trades and your orders (the last
 * sync's). ESI holds them an hour, an hour and 20 minutes (eve-facts.md), so they're of different ages, and a fill, a
 * listing or a sale between two of them shows in one and not the other (`Stale`). Null when not known.
 */
export type Copies = { assets: number | null; trades: number | null; orders: number | null };
/** ESI holds your trades an hour and your orders 20 minutes (eve-facts.md). */
export const TRADES_HELD_MS = 3600_000;
export const ORDERS_HELD_MS = 20 * 60_000;

/**
 * The copies' times: your assets' from this read (`assetsTakenAt`); your trades' from when the sync said ESI lets them go
 * (`meta.expiries`, and this browser's `tradesFreshAt`) less the hour it holds them, or the newest trade held if that's
 * later (the cloud may have brought newer ones, as `tradesReadTo` in freelance.ts reads it); your orders' from their
 * expiry less 20 minutes. Each is as late as can be shown: an earlier read can only make more rows doubtful, never fewer.
 */
export function copiesOf(d: { meta?: { expiries?: { transactions?: string; orders?: string }; tradesFreshAt?: string }; txs?: Record<string, { source: string; date: string }> }, assets: number | null): Copies {
  const at = (iso: string | undefined, held: number) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t - held : -Infinity; };
  const newest = Object.values(d.txs ?? {}).reduce((m, t) => (t.source === 'esi' ? Math.max(m, ts(t.date)) : m), -Infinity);
  const trades = Math.max(at(d.meta?.expiries?.transactions, TRADES_HELD_MS), at(d.meta?.tradesFreshAt, TRADES_HELD_MS), Number.isFinite(newest) ? newest : -Infinity);
  const orders = at(d.meta?.expiries?.orders, ORDERS_HELD_MS);
  return { assets, trades: Number.isFinite(trades) ? trades : null, orders: Number.isFinite(orders) ? orders : null };
}

/**
 * Why a row's count may be off, ESI's copies being of different ages (the review of 3 October 2026). Each makes units
 * read as not the position's that are, and the Exclude the lead would advise would take real sales out of the position:
 * - `bought`: your hangar's copy is newer than your trades', and a buy order of yours has filled more than your trades
 *   show, or one was still open when your orders were read before the hangar's copy (it may have filled in between): units
 *   in the hangar the position doesn't have yet. A plan's bids filling is exactly this;
 * - `listed`: an open sell order of yours placed after the hangar's copy: its units are in that copy and on the order;
 * - `sold`: a sale your trades show after the hangar's copy, not from a sell order placed before it (into a bid, say): the
 *   position has let them go and the copy still holds them; or one after your orders were read from a sell order of yours,
 *   whose units the orders still list.
 * `bought` clears once your trades and orders are read again past the hangar's copy (Check for new trades); `listed` and
 * `sold` once ESI lets go of its copy of your hangar and it's read again.
 */
export type Stale = 'bought' | 'listed' | 'sold';

/** One item in the place picked that an open position counts. */
export type TrackedRow = {
  typeId: number;
  /** Units held in the place picked, and where they lie in it. */
  here: number; where: Where[];
  /** The position to open: the plan's when a plan holds the item, else the earliest opened; and every open one of the item. */
  pos: Position; positions: Position[];
  /**
   * What the open positions of the item count as their own stock, together (two can be open: each trade is one's, by
   * `ownerAt`); null when one couldn't be worked out.
   */
  stock: number | null;
  /**
   * The plan holding the item (`planTargets`: the newest with its position open) and what it counts as its own stock: its
   * view of the position (`planPosition`), which from a position it took over doesn't count what was held before it.
   * `earlier`: those units held at the plan's start not sold since, the earlier trading's.
   */
  plan: { id: string; name: string; stock: number; earlier: number } | null;
  /**
   * A position counting every station, not only Jita 4-4 ("Only Jita 4-4 trades" off): its sales and orders anywhere
   * count, so its held units and orders are every station's. Otherwise they're Jita 4-4's, as its stock and sales are.
   */
  wide: boolean;
  /** Units held where the position counts, in this read: Jita 4-4's whole station (hangar, deliveries, every container and ship), or every place. */
  held: number;
  /** Units on your open sell orders and still to buy on your open buy orders, where the position counts; null when orders aren't read. */
  listed: number | null; buying: number | null;
  /**
   * Units held and listed beyond what the open positions count as their own: the ones whose sale a position would take
   * from its own stock. Never below 0; null when the stock or the orders aren't known. Against the whole positions, never a
   * plan's view: what a position held before a plan started is its own, and a plan's view sells it first (`heldSold`), so
   * excluding its sales would break the position.
   */
  notPositions: number | null;
  /** Why the count may be off, from the copies' different ages; empty when it can be trusted (or no copies were given). */
  stale: Stale[];
  /** Whether a sale where the pick is would count: always in Jita 4-4; elsewhere only for a position not limited to it. */
  countsHere: boolean;
};

/** One item in the place picked that no open position counts but an open Jita 4-4 order of yours covers. */
export type OrdersRow = { typeId: number; here: number; where: Where[]; listed: number; buying: number };

export type HangarCheck = {
  /**
   * Items an open position counts: those with units that aren't the position's first (ones whose count can be trusted,
   * then ones that may be off), the most first; then the rest.
   */
  tracked: TrackedRow[];
  /** Items with an open Jita 4-4 order of yours and no open position: selling them doesn't touch a position. */
  ordersOnly: OrdersRow[];
  /** The place picked isn't Jita 4-4. */
  outside: boolean;
};

const ts = (iso: string) => Date.parse(iso);
/** When an order was placed, as far as the app saw: its first version (a price change moves `issued`). */
const placedAt = (o: Order) => ts((o.seen?.[0] ?? o).issued);
const filledOf = (o: Order) => Math.max(0, o.volumeTotal - o.volumeRemain);
const pricesOf = (o: Order) => new Set([o.price, ...(o.seen ?? []).map((v) => v.price)]);
/** Trade and order times are to the second; a bid that buys at once does so in the second it's placed. */
const SLACK_MS = 1000;

/**
 * The rows for the place picked. `ordersKnown`: whether your orders have been read; without them the listing and what
 * isn't the position's can't be said, and no item can be said to have an order. A Jita-only position's held units and
 * orders are Jita 4-4's, as its stock and sales are; one counting every station's are every station's. The second list
 * is Jita 4-4 orders'. `copies`: when ESI's copies were taken, to say which counts may be off (`Stale`); without it, or
 * without the hangar's time, none is said to be.
 */
export function hangarCheck(x: { d: Data; s: Settings; places: Place[]; pick: HangarPick; ordersKnown: boolean; copies?: Copies; jitaId?: number }): HangarCheck {
  const { d, s, places, pick, ordersKnown, copies } = x;
  const jitaId = x.jitaId ?? JITA_44;
  const place = places.find((p) => p.id === pick.place);
  const here = new Map<number, { q: number; where: Map<string, Where> }>();
  for (const st of place?.stacks ?? []) {
    if (!inSpot(st, pick.spot)) continue;
    const t = here.get(st.typeId) ?? { q: 0, where: new Map<string, Where>() };
    t.q += st.q;
    const key = `${st.chain.map((h) => h.id).join('>')}|${st.bay ?? ''}|${st.chain.length ? '' : st.flag}`;
    const w = t.where.get(key);
    if (w) w.q += st.q; else t.where.set(key, { key, chain: st.chain, flag: st.flag, bay: st.bay, q: st.q });
    here.set(st.typeId, t);
  }
  const heldIn = (typeId: number, wide: boolean) => places.filter((p) => wide || p.id === jitaId)
    .reduce((n, p) => n + p.stacks.filter((st) => st.typeId === typeId).reduce((m, st) => m + st.q, 0), 0);
  const orders = Object.values(d.orders ?? {});
  const open = orders.filter((o: Order) => o.state === 'open' && o.volumeRemain > 0);
  const onOrders = (typeId: number, buy: boolean, wide: boolean) => open.filter((o) => o.typeId === typeId && o.isBuy === buy && (wide || o.locationId === jitaId))
    .reduce((n, o) => n + o.volumeRemain, 0);
  const txs = Object.values(d.txs ?? {}).filter((t) => t.source === 'esi').sort((a, b) => ts(a.date) - ts(b.date));
  // Where your trades begin: a bid placed before that has fills the ledger never held.
  const firstTrade = txs.length ? ts(txs[0].date) : Infinity;
  const targets = planTargets(d.plans ?? [], d.positions ?? [], rates(s));
  // Loose in the hangar first, then a station's other bays, then what's in containers and ships, the most first.
  const rank = (w: Where) => (!w.chain.length ? (w.flag === 'Hangar' ? 0 : 1) : 2);
  const whereOf = (m: Map<string, Where>) => [...m.values()].sort((a, b) => rank(a) - rank(b) || b.q - a.q || a.key.localeCompare(b.key));

  /**
   * Units your bids of the item have filled that your trades don't show. A standing bid fills at its own price, so trades
   * at one of its prices are its fills first, each bid in the order placed; then a bid that bought at once from listings
   * paid their prices (never more than its own), from the second it was placed. A bid placed before your trades begin is
   * held to its fills since the app first saw it (`seen[0].remain`), the rest predating the ledger.
   */
  const unrecordedFills = (typeId: number, inScope: (loc: number | undefined) => boolean): number => {
    const bids = orders.filter((o) => o.isBuy && o.typeId === typeId && inScope(o.locationId)).sort((a, b) => placedAt(a) - placedAt(b) || a.orderId - b.orderId);
    const buys = txs.filter((t) => t.isBuy && t.typeId === typeId && inScope(t.locationId)).map((t) => ({ t, left: t.qty }));
    const need = new Map(bids.map((o) => [o.orderId, placedAt(o) >= firstTrade - SLACK_MS ? filledOf(o) : Math.max(0, (o.seen?.[0]?.remain ?? o.volumeRemain) - o.volumeRemain)]));
    const take = (o: Order, from: number, ok: (price: number) => boolean) => {
      let n = need.get(o.orderId) ?? 0;
      for (const b of buys) {
        if (n <= 0) break;
        if (b.left <= 0 || (b.t.locationId != null && b.t.locationId !== o.locationId) || ts(b.t.date) < from || !ok(b.t.unitPrice)) continue;
        const k = Math.min(n, b.left);
        b.left -= k; n -= k;
      }
      need.set(o.orderId, n);
    };
    for (const o of bids) { const own = pricesOf(o); take(o, firstTrade, (p) => own.has(p)); }
    for (const o of bids) { const top = Math.max(...pricesOf(o)); take(o, placedAt(o) - SLACK_MS, (p) => p <= top); }
    return [...need.values()].reduce((n, v) => n + v, 0);
  };

  /** Why a type's count may be off (`Stale`), from its orders and trades where the positions count. */
  const staleOf = (typeId: number, wide: boolean): Stale[] => {
    if (!copies || copies.assets == null) return [];
    const inScope = (loc: number | undefined) => wide || loc === jitaId;
    // A copy whose time isn't known is taken as long ago: anything could have happened since.
    const A = copies.assets, T = copies.trades ?? -Infinity, O = copies.orders ?? -Infinity;
    const mine = orders.filter((o) => o.typeId === typeId && inScope(o.locationId));
    const out: Stale[] = [];
    if (A > T && (unrecordedFills(typeId, inScope) > 0 || (O < A && mine.some((o) => o.isBuy && o.state === 'open' && o.volumeRemain > 0)))) out.push('bought');
    const sells = mine.filter((o) => !o.isBuy);
    if (sells.some((o) => o.state === 'open' && o.volumeRemain > 0 && placedAt(o) > A)) out.push('listed');
    // A listing sells at its own price, so a sale at one of a sell order's prices is taken to be from it. A sale into a bid
    // at exactly a listing's price reads as from the listing and isn't flagged: rare, and only after the hangar's copy.
    const fromOne = (list: Order[], price: number) => list.some((o) => pricesOf(o).has(price));
    const listedBefore = sells.filter((o) => placedAt(o) <= A);
    const sales = txs.filter((t) => !t.isBuy && t.typeId === typeId && inScope(t.locationId));
    if (sales.some((t) => (ts(t.date) > A && !fromOne(listedBefore, t.unitPrice)) || (ts(t.date) > O && fromOne(sells, t.unitPrice)))) out.push('sold');
    return out;
  };

  const tracked: TrackedRow[] = [];
  const ordersOnly: OrdersRow[] = [];
  for (const [typeId, h] of here) {
    const positions = (d.positions ?? []).filter((p) => p.status === 'open' && p.typeId === typeId)
      .sort((a, b) => ts(a.openedAt) - ts(b.openedAt) || (a.id < b.id ? -1 : 1));
    const where = whereOf(h.where);
    if (!positions.length) {
      const listed = ordersKnown ? onOrders(typeId, false, false) : 0, buying = ordersKnown ? onOrders(typeId, true, false) : 0;
      if (listed || buying) ordersOnly.push({ typeId, here: h.q, where, listed, buying });
      continue;
    }
    const wide = positions.some((p) => !p.jitaOnly);
    const listed = ordersKnown ? onOrders(typeId, false, wide) : null;
    const buying = ordersKnown ? onOrders(typeId, true, wide) : null;
    const wholes = new Map<string, PositionCalc>();
    let stock: number | null = 0;
    for (const p of positions) {
      try { const c = computePosition(p, d, s); wholes.set(p.id, c); if (stock != null) stock += c.stock; } catch { stock = null; }
    }
    // The plan holding the item, on whichever of its open positions the plan's item names.
    let plan: TrackedRow['plan'] = null;
    const t = targets[typeId];
    const pl = t ? (d.plans ?? []).find((y) => y.id === t.planId) : undefined;
    const item = pl?.items.find((i) => i.typeId === typeId && positions.some((p) => p.id === i.positionId));
    const planPos = item ? positions.find((p) => p.id === item.positionId) : undefined;
    const whole = planPos ? wholes.get(planPos.id) : undefined;
    if (pl && planPos && whole) {
      try {
        const v = planPosition(planPos, pl, d, s, whole);
        plan = { id: pl.id, name: pl.name, stock: v.c.stock, earlier: v.shared ? Math.max(0, v.held - v.heldSold) : 0 };
      } catch { plan = null; }
    }
    const held = heldIn(typeId, wide);
    tracked.push({
      typeId, here: h.q, where, pos: planPos ?? positions[0], positions, stock, plan, wide, held, listed, buying,
      notPositions: stock != null && listed != null ? Math.max(0, held + listed - stock) : null,
      stale: staleOf(typeId, wide),
      countsHere: pick.place === jitaId || wide,
    });
  }
  const tier = (r: TrackedRow) => ((r.notPositions ?? 0) > 0 ? (r.stale.length ? 1 : 0) : 2);
  tracked.sort((a, b) => tier(a) - tier(b) || (b.notPositions ?? 0) - (a.notPositions ?? 0) || b.here - a.here || a.typeId - b.typeId);
  ordersOnly.sort((a, b) => b.here - a.here || a.typeId - b.typeId);
  return { tracked, ordersOnly, outside: pick.place !== jitaId };
}

/**
 * The rows the lead speaks of, and the ones it leaves out as possibly off. Only rows where a sale in the place picked
 * would count: outside Jita 4-4 a Jita-only position's row sits under "Sold here they don't count", and a lead telling you
 * to Exclude sales beside it read as the opposite (the review). A row whose count may be off (`Stale`) is said apart.
 */
export function leadRows(c: HangarCheck): { sure: TrackedRow[]; unsure: TrackedRow[] } {
  const over = c.tracked.filter((r) => (r.notPositions ?? 0) > 0 && r.countsHere);
  return { sure: over.filter((r) => !r.stale.length), unsure: over.filter((r) => r.stale.length > 0) };
}

/**
 * The lead's first sentence: "10 of Datacore - Rocket Science aren't the position's." Without the item's name yet, never
 * "Item #20420" in a sentence: "Some of it isn't the position's."
 */
export function leadSaid(sure: TrackedRow[], name: (typeId: number) => string | null): string | null {
  if (!sure.length) return null;
  if (sure.length > 1) return `${units(sure.length)} items have units that aren’t their position’s.`;
  const r = sure[0], n = r.notPositions ?? 0, nm = name(r.typeId);
  return nm ? `${units(n)} of ${nm} ${n === 1 ? 'isn’t' : 'aren’t'} the position’s.` : 'Some of it isn’t the position’s.';
}

/** Why a row's count may be off, in its cell: "May include units bought since your trades were read, 3 Oct, 14:02 ET." */
export function staleSaid(stale: Stale[], copies: Copies | undefined): string | null {
  if (!stale.length) return null;
  // The time kept on one line: a narrow cell broke "8 Oct" across two.
  const when = (t: number | null | undefined) => (t != null && Number.isFinite(t) ? `, ${fmtDateTime(t).replace(/ /g, '\u00a0')}` : '');
  const parts: string[] = [];
  if (stale.includes('bought')) parts.push(`bought since your trades were read${when(copies?.trades)}`);
  const moved = [stale.includes('listed') && 'listed', stale.includes('sold') && 'sold'].filter(Boolean).join(' or ');
  if (moved) parts.push(`${moved} since ESI’s copy of your hangar${when(copies?.assets)}`);
  return `May include units ${parts.join(', or ')}.`;
}

/**
 * The plan's share under the position's stock: none when the plan counts it all and holds nothing ("0 / all the plan's"
 * read as if something were; the Plan chip names the plan), "all the plan's" when it counts it all, else its part and
 * what's from before it.
 */
export function planShare(r: Pick<TrackedRow, 'plan' | 'stock'>): string | null {
  if (!r.plan) return null;
  if (r.plan.stock === r.stock && !r.plan.earlier) return r.plan.stock ? 'all the plan’s' : null;
  return `the plan’s ${units(r.plan.stock)}${r.plan.earlier > 0 ? `, ${units(r.plan.earlier)} from before it` : ''}`;
}
