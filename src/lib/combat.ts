/**
 * Kills and losses, read from killmails and priced the way they actually cost you.
 *
 * Every item is valued at Jita's daily average on the day it happened, from market history, and that
 * value is stored and never worked out again. A ship lost in March cost you March's prices; re-pricing
 * it at today's would rewrite what the loss was. Refits are the exception, because a refit is bought
 * today.
 *
 * Nothing here touches the network, so all of it can be tested.
 */

import type { HistRow, Killmail, KillItem, KillParty } from './types';

export type RawKillItem = {
  item_type_id: number; flag: number; quantity_destroyed?: number; quantity_dropped?: number; singleton?: number;
  items?: RawKillItem[];
};
export type RawParty = {
  character_id?: number; corporation_id?: number; alliance_id?: number; faction_id?: number;
  ship_type_id?: number; weapon_type_id?: number; damage_done?: number; damage_taken?: number;
  final_blow?: boolean; security_status?: number; items?: RawKillItem[];
};
export type RawKillmail = {
  killmail_id: number; killmail_time: string; solar_system_id: number;
  victim: RawParty; attackers: RawParty[];
};

/** Items nested in containers are flattened, keeping the outermost slot flag. */
export function flattenItems(items: RawKillItem[] | undefined, flag?: number): KillItem[] {
  const out: KillItem[] = [];
  for (const it of items ?? []) {
    out.push({ typeId: it.item_type_id, dropped: it.quantity_dropped ?? 0, destroyed: it.quantity_destroyed ?? 0, flag: flag ?? it.flag });
    out.push(...flattenItems(it.items, flag ?? it.flag));
  }
  return out;
}

const party = (p: RawParty): KillParty => ({
  characterId: p.character_id, corporationId: p.corporation_id, allianceId: p.alliance_id, factionId: p.faction_id,
  shipTypeId: p.ship_type_id, weaponTypeId: p.weapon_type_id,
  damage: p.damage_done ?? p.damage_taken ?? 0, finalBlow: p.final_blow, security: p.security_status,
});

/** A loss when you were the victim, a kill when you were on the attacker list. */
export function readKillmail(raw: RawKillmail, hash: string, characterId: number): Killmail {
  return {
    id: raw.killmail_id,
    hash,
    time: raw.killmail_time,
    systemId: raw.solar_system_id,
    kind: raw.victim.character_id === characterId ? 'loss' : 'kill',
    victim: party(raw.victim),
    attackers: raw.attackers.map(party),
    items: flattenItems(raw.victim.items),
  };
}

const DAY = 86400_000;

/**
 * The average price on a day, or the nearest earlier day that traded within a fortnight.
 *
 * ESI history leaves out days with no trades, so a gap on the day itself just means nobody traded that
 * item then; the last price before it is the honest stand-in. Nothing after the day is used, since that
 * would be pricing the loss with knowledge from its future.
 */
export function priceOnDay(rows: HistRow[], day: string, lookbackDays = 14): { price: number; date: string } | null {
  const target = Date.parse(day + 'T00:00:00Z');
  let best: HistRow | null = null;
  for (const r of rows) {
    const t = Date.parse(r.date + 'T00:00:00Z');
    if (t > target || t < target - lookbackDays * DAY) continue;
    if (!best || t > Date.parse(best.date + 'T00:00:00Z')) best = r;
  }
  return best ? { price: best.average, date: best.date } : null;
}

/** Everything priced on the killmail's day. The ship counts as destroyed: a hull never drops. */
export function valueKillmail(
  km: Pick<Killmail, 'time' | 'victim' | 'items'>,
  priceOf: (typeId: number) => number | null,
): NonNullable<Killmail['value']> {
  const items: Record<number, number> = {};
  const unpriced = new Set<number>();
  const unit = (id: number) => {
    if (id in items) return items[id];
    const p = priceOf(id);
    if (p == null) { unpriced.add(id); items[id] = 0; return 0; }
    items[id] = p;
    return p;
  };
  const ship = km.victim.shipTypeId ? unit(km.victim.shipTypeId) : 0;
  let dropped = 0, destroyed = ship;
  for (const it of km.items) {
    const p = unit(it.typeId);
    dropped += p * it.dropped;
    destroyed += p * it.destroyed;
  }
  return { priceDate: km.time.slice(0, 10), ship, items, dropped, destroyed, total: dropped + destroyed, unpriced: [...unpriced] };
}

/** Abyssal pockets are their own systems, numbered in a band of their own. */
export const isAbyssalSystem = (systemId: number) => systemId >= 32000000 && systemId < 33000000;

/** Inventory groups whose ships exist to carry cargo. Matched on the group's name, read from ESI. */
export const HAULER_GROUPS = ['Hauler', 'Industrial', 'Deep Space Transport', 'Blockade Runner', 'Freighter', 'Jump Freighter', 'Industrial Command Ship'];

export type CombatActivity = 'Abyssal' | 'Hauling' | 'PvP' | 'PvE';

/**
 * What you were doing when it happened, from what the killmail itself shows.
 *
 * An abyssal pocket is a system of its own. A lost hauler is a hauling loss whoever shot it. Past
 * those, any player on the other side makes it PvP and otherwise it was the NPCs.
 */
export function activityOf(km: Pick<Killmail, 'kind' | 'systemId' | 'victim' | 'attackers'>, victimGroup: string | null): CombatActivity {
  if (isAbyssalSystem(km.systemId)) return 'Abyssal';
  if (km.kind === 'loss' && victimGroup && HAULER_GROUPS.includes(victimGroup)) return 'Hauling';
  if (km.kind === 'loss') return km.attackers.some((a) => a.characterId) ? 'PvP' : 'PvE';
  return km.victim.characterId ? 'PvP' : 'PvE';
}

/**
 * Insurance paid for a loss: the payout in the journal soonest after it, within two days.
 * Matched rather than estimated, so a loss nobody insured shows as exactly that.
 */
export function matchInsurance(
  losses: Pick<Killmail, 'id' | 'time'>[],
  payouts: { id: string; date: string; amount: number }[],
): Record<number, number> {
  const used = new Set<string>();
  const out: Record<number, number> = {};
  for (const l of [...losses].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    const t = Date.parse(l.time);
    const hit = payouts
      .filter((p) => !used.has(p.id) && p.amount > 0 && Date.parse(p.date) >= t && Date.parse(p.date) - t <= 2 * DAY)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
    if (hit) { used.add(hit.id); out[l.id] = hit.amount; }
  }
  return out;
}

/** What a loss cost you: its value on the day less any insurance paid for it. */
export const netLoss = (km: Killmail) => Math.max(0, (km.value?.total ?? 0) - (km.insurance ?? 0));

export type CombatStats = {
  kills: number; losses: number;
  destroyed: number; lost: number;
  /** ISK destroyed as a share of all the ISK involved. */
  efficiency: number | null;
  /** The most PvP kills could have paid you (everything that dropped) against what PvP cost you. */
  pvpDropped: number; pvpLost: number;
};

export function combatStats(list: (Killmail & { activity: CombatActivity })[]): CombatStats {
  const kills = list.filter((k) => k.kind === 'kill');
  const losses = list.filter((k) => k.kind === 'loss');
  const destroyed = kills.reduce((t, k) => t + (k.value?.total ?? 0), 0);
  const lost = losses.reduce((t, k) => t + netLoss(k), 0);
  return {
    kills: kills.length, losses: losses.length, destroyed, lost,
    efficiency: destroyed + lost > 0 ? destroyed / (destroyed + lost) : null,
    pvpDropped: kills.filter((k) => k.activity === 'PvP').reduce((t, k) => t + (k.value?.dropped ?? 0), 0),
    pvpLost: losses.filter((k) => k.activity === 'PvP').reduce((t, k) => t + netLoss(k), 0),
  };
}

/** Cargo and fleet hangar flags: what a hauler was carrying, as opposed to what it had fitted. */
export const CARGO_FLAGS = new Set([5, 155]);

/**
 * The lowest cargo you have been ganked for in each hull class, through a system on the watch list.
 *
 * That is a gank line learned the hard way: someone decided your ship was worth killing at that
 * value, so anything above it on the same route is bait. Only losses to players count --- dying to
 * rats says nothing about gankers.
 */
export function learnedGankLines(
  losses: Killmail[],
  hullOf: (shipTypeId: number) => string | null,
  gankSystems: Set<number>,
): Record<string, { value: number; killmailId: number; systemId: number }> {
  const out: Record<string, { value: number; killmailId: number; systemId: number }> = {};
  for (const km of losses) {
    if (km.kind !== 'loss' || !km.value || !gankSystems.has(km.systemId)) continue;
    if (!km.attackers.some((a) => a.characterId)) continue;
    const hull = km.victim.shipTypeId ? hullOf(km.victim.shipTypeId) : null;
    if (!hull) continue;
    const cargo = km.items.filter((i) => CARGO_FLAGS.has(i.flag))
      .reduce((t, i) => t + (km.value!.items[i.typeId] ?? 0) * (i.dropped + i.destroyed), 0);
    if (cargo <= 0) continue;
    if (!out[hull] || cargo < out[hull].value) out[hull] = { value: cargo, killmailId: km.id, systemId: km.systemId };
  }
  return out;
}

/** The line in force for a hull: yours, lowered by what your losses have taught, if you let them. */
export function gankLineFor(
  hull: string,
  mine: Record<string, number>,
  learned: Record<string, { value: number }>,
  learn: boolean,
): { line: number | null; from: 'yours' | 'learned' | null } {
  const set = mine[hull] ?? null;
  const got = learn ? learned[hull]?.value ?? null : null;
  if (set == null && got == null) return { line: null, from: null };
  if (got != null && (set == null || got < set)) return { line: got, from: 'learned' };
  return { line: set, from: 'yours' };
}

/**
 * A list for the Multibuy window's "Import from clipboard": one "Name N" per line, the format its own tooltip gives
 * ("Veldspar 4", or "4 Veldspar"; seen in the user's client, 29 September 2026). It was "Name xN" until then, which the
 * tooltip doesn't list.
 */
export function multibuy(lines: { name: string; qty: number }[]): string {
  return lines.filter((l) => l.qty > 0).map((l) => `${l.name} ${l.qty}`).join('\n');
}

/**
 * A killmail's inventory flag (a number) as the fittings API names the slot: 11–18 low, 19–26 mid, 27–34 high, 92–99
 * rigs, 125–132 subsystems, 164–171 service slots, 87 the drone bay, 158 the fighter bay, 5 the cargo hold. Anything else
 * (fleet hangar, ore hold…) isn't part of a fit. The API takes RigSlot0–2 and SubSystemSlot0–3 only.
 */
export function fitSlot(flag: number): string | null {
  if (flag >= 11 && flag <= 18) return `LoSlot${flag - 11}`;
  if (flag >= 19 && flag <= 26) return `MedSlot${flag - 19}`;
  if (flag >= 27 && flag <= 34) return `HiSlot${flag - 27}`;
  if (flag >= 92 && flag <= 94) return `RigSlot${flag - 92}`;
  if (flag >= 125 && flag <= 128) return `SubSystemSlot${flag - 125}`;
  if (flag >= 164 && flag <= 171) return `ServiceSlot${flag - 164}`;
  if (flag === 87) return 'DroneBay';
  if (flag === 158) return 'FighterBay';
  if (flag === 5) return 'Cargo';
  return null;
}

export type FittingItem = { flag: string; quantity: number; type_id: number };

/**
 * A lost ship as a fitting to save in game (POST /characters/{id}/fittings), so its fitting window's Buy All re-buys it:
 * modules, rigs and subsystems in their slots, drones in the drone bay, and what was in the cargo hold. A charge loaded in
 * a gun shares the gun's slot on a killmail, and a fitting holds one module a slot, so `isCharge` (from the item's
 * category) moves charges to the cargo. The name is cut to the 50 characters a fitting takes.
 */
export function fittingFromLoss(k: Pick<Killmail, 'items' | 'victim' | 'time'>, shipName: string, place: string, isCharge: (typeId: number) => boolean):
  { name: string; description: string; ship_type_id: number; items: FittingItem[] } | null {
  if (!k.victim.shipTypeId) return null;
  const items = new Map<string, FittingItem>();
  const taken = new Set<string>();
  for (const i of k.items) {
    const slot = fitSlot(i.flag);
    const qty = i.dropped + i.destroyed;
    if (!slot || qty <= 0) continue;
    const moduleSlot = /Slot\d$/.test(slot);
    const flag = moduleSlot && (isCharge(i.typeId) || taken.has(slot)) ? 'Cargo' : slot;
    if (moduleSlot && flag === slot) taken.add(slot);
    const key = `${flag}|${i.typeId}`;
    const cur = items.get(key);
    if (cur) cur.quantity += qty; else items.set(key, { flag, quantity: qty, type_id: i.typeId });
  }
  const day = k.time.slice(0, 10);
  return {
    name: `${shipName} (lost ${day})`.slice(0, 50),
    description: `Saved by Jita Ledger from your loss of this ship on ${day} in ${place}.`.slice(0, 500),
    ship_type_id: k.victim.shipTypeId,
    items: [...items.values()],
  };
}

/** Who landed the final blow: the attacker the killmail marks, else whoever did most damage. */
export function finalBlow(attackers: KillParty[]): KillParty | null {
  return attackers.find((a) => a.finalBlow) ?? [...attackers].sort((a, b) => b.damage - a.damage)[0] ?? null;
}

/**
 * The ships that were on a kill, most common first, at most `max` kinds and a count of the rest: a fleet gank can put
 * hundreds on one killmail, and a list of each is no use. A killmail records each attacker's ship and weapon, never
 * their fit.
 */
export function fleetShips(attackers: KillParty[], max = 6): { ships: { typeId: number; n: number }[]; rest: number; unknown: number } {
  const count = new Map<number, number>();
  let unknown = 0;
  for (const a of attackers) {
    if (a.shipTypeId) count.set(a.shipTypeId, (count.get(a.shipTypeId) ?? 0) + 1);
    else unknown++;
  }
  const all = [...count].map(([typeId, n]) => ({ typeId, n })).sort((a, b) => b.n - a.n || a.typeId - b.typeId);
  return { ships: all.slice(0, max), rest: all.slice(max).reduce((t, x) => t + x.n, 0), unknown };
}
