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

/** One item in the place picked that an open position counts. */
export type TrackedRow = {
  typeId: number;
  /** Units held in the place picked, and where they lie in it. */
  here: number; where: Where[];
  /** The open position of the item (the earliest opened, should there be two). */
  pos: Position;
  /** What the whole position counts as its own stock; null when it couldn't be worked out. */
  stock: number | null;
  /**
   * The plan holding the item (`planTargets`: the newest with its position open) and what it counts as its own stock: its
   * view of the position (`planPosition`), which from a position it took over doesn't count what was held before it.
   * `earlier`: those units held at the plan's start not sold since, the earlier trading's.
   */
  plan: { id: string; name: string; stock: number; earlier: number } | null;
  /** Units held in Jita 4-4 in this read, the whole station: hangar, deliveries, every container and ship. */
  jita: number;
  /** Units on your open Jita 4-4 sell orders and still to buy on your open Jita 4-4 buy orders; null when orders aren't read. */
  listed: number | null; buying: number | null;
  /**
   * Units in Jita 4-4, held and listed, beyond what the whole position counts as its own: the ones whose sale it would take
   * from its own stock. Never below 0; null when the stock or the orders aren't known. Against the whole position, never a
   * plan's view: what a position held before a plan started is its own, and a plan's view sells it first (`heldSold`), so
   * excluding its sales would break the position.
   */
  notPositions: number | null;
  /** Whether a sale where the pick is would count: always in Jita 4-4; elsewhere only for a position not limited to it. */
  countsHere: boolean;
};

/** One item in the place picked that no open position counts but an open Jita 4-4 order of yours covers. */
export type OrdersRow = { typeId: number; here: number; where: Where[]; listed: number; buying: number };

export type HangarCheck = {
  /** Items an open position counts: those with units that aren't the position's first, the most of those first. */
  tracked: TrackedRow[];
  /** Items with an open Jita 4-4 order of yours and no open position: selling them doesn't touch a position. */
  ordersOnly: OrdersRow[];
  /** The place picked isn't Jita 4-4. */
  outside: boolean;
};

const ts = (iso: string) => Date.parse(iso);

/**
 * The rows for the place picked. `ordersKnown`: whether your orders have been read; without them the listing and what
 * isn't the position's can't be said, and no item can be said to have an order. Orders are Jita 4-4's only, as the
 * positions' stock and sales are.
 */
export function hangarCheck(x: { d: Data; s: Settings; places: Place[]; pick: HangarPick; ordersKnown: boolean; jitaId?: number }): HangarCheck {
  const { d, s, places, pick, ordersKnown } = x;
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
  const jitaHeld = new Map<number, number>();
  for (const st of places.find((p) => p.id === jitaId)?.stacks ?? []) jitaHeld.set(st.typeId, (jitaHeld.get(st.typeId) ?? 0) + st.q);
  const open = Object.values(d.orders ?? {}).filter((o: Order) => o.state === 'open' && o.volumeRemain > 0 && o.locationId === jitaId);
  const onOrders = (typeId: number, buy: boolean) => open.filter((o) => o.typeId === typeId && o.isBuy === buy).reduce((n, o) => n + o.volumeRemain, 0);
  const targets = planTargets(d.plans ?? [], d.positions ?? [], rates(s));
  // Loose in the hangar first, then a station's other bays, then what's in containers and ships, the most first.
  const rank = (w: Where) => (!w.chain.length ? (w.flag === 'Hangar' ? 0 : 1) : 2);
  const whereOf = (m: Map<string, Where>) => [...m.values()].sort((a, b) => rank(a) - rank(b) || b.q - a.q || a.key.localeCompare(b.key));

  const tracked: TrackedRow[] = [];
  const ordersOnly: OrdersRow[] = [];
  for (const [typeId, h] of here) {
    const pos = (d.positions ?? []).filter((p) => p.status === 'open' && p.typeId === typeId)
      .sort((a, b) => ts(a.openedAt) - ts(b.openedAt) || (a.id < b.id ? -1 : 1))[0];
    const listed = ordersKnown ? onOrders(typeId, false) : null;
    const buying = ordersKnown ? onOrders(typeId, true) : null;
    const where = whereOf(h.where);
    if (!pos) {
      if (listed || buying) ordersOnly.push({ typeId, here: h.q, where, listed: listed ?? 0, buying: buying ?? 0 });
      continue;
    }
    let whole: PositionCalc | null = null;
    try { whole = computePosition(pos, d, s); } catch { whole = null; }
    let plan: TrackedRow['plan'] = null;
    const t = targets[typeId];
    const p = t ? (d.plans ?? []).find((pl) => pl.id === t.planId) : undefined;
    if (p && whole && p.items.some((i) => i.typeId === typeId && i.positionId === pos.id)) {
      try {
        const v = planPosition(pos, p, d, s, whole);
        plan = { id: p.id, name: p.name, stock: v.c.stock, earlier: v.shared ? Math.max(0, v.held - v.heldSold) : 0 };
      } catch { plan = null; }
    }
    const jita = jitaHeld.get(typeId) ?? 0;
    const stock = whole ? whole.stock : null;
    tracked.push({
      typeId, here: h.q, where, pos, stock, plan, jita, listed, buying,
      notPositions: stock != null && listed != null ? Math.max(0, jita + listed - stock) : null,
      countsHere: pick.place === jitaId || !pos.jitaOnly,
    });
  }
  tracked.sort((a, b) => ((b.notPositions ?? 0) > 0 ? 1 : 0) - ((a.notPositions ?? 0) > 0 ? 1 : 0) || (b.notPositions ?? 0) - (a.notPositions ?? 0) || b.here - a.here || a.typeId - b.typeId);
  ordersOnly.sort((a, b) => b.here - a.here || a.typeId - b.typeId);
  return { tracked, ordersOnly, outside: pick.place !== jitaId };
}
