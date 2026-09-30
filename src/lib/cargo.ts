/**
 * What a hauling fit carries, worked out from ESI's dogma the way the mining yields are (lib/miningYield.ts): each hold's
 * base size on the hull, the hull's bonuses to it and the skill each scales with, and on the cargo hold alone the fitted
 * Expanded Cargoholds (×1.275 for a II), cargo rigs (+15% for a I) and Reinforced Bulkheads (×0.89 for a II), none of
 * them stacking-penalised (ESI marks 149 and 614 stackable). Specialised holds (ore, planetary, fleet hangar…) aren't
 * touched by expanders or rigs. Also the hull's structure, which expanders cut (×0.77) and bulkheads raise (×1.25).
 * Read 30 September 2026 from ESI and CCP's static data (which skill each bonus follows, its "traits"). Pure.
 */

import { units } from './format';
import type { TypeDogma } from './miningYield';

export type HoldKey = 'cargo' | 'fleet' | 'ore' | 'mineral' | 'ice' | 'gas' | 'ammo' | 'pi' | 'commandCenter' | 'infrastructure' | 'shipBay' | 'fuel';

/** Each hold's size attribute (cargo is the type's own capacity, attribute 38). */
export const HOLD_ATTR: Record<HoldKey, number> = {
  cargo: 38, fleet: 912, ore: 1556, mineral: 1558, ice: 3136, gas: 1557, ammo: 1573, pi: 1653, commandCenter: 1646,
  infrastructure: 5646, shipBay: 908, fuel: 1549,
};

export const HOLD_SAID: Record<HoldKey, string> = {
  cargo: 'Cargo hold', fleet: 'Fleet hangar', ore: 'Ore hold', mineral: 'Mineral hold', ice: 'Ice hold', gas: 'Gas hold',
  ammo: 'Ammo hold', pi: 'Planetary commodities hold', commandCenter: 'Command center hold', infrastructure: 'Infrastructure hold',
  shipBay: 'Ship maintenance bay', fuel: 'Fuel bay',
};

/** Holds that take any cargo, so a courier package fits: the cargo hold and a fleet hangar. */
export const GENERAL_HOLDS: HoldKey[] = ['cargo', 'fleet'];

/**
 * Every hull effect that grows a hold: the attribute its size sits in (`bonus`), the hold it grows (`hold`), and the skill
 * it scales with, from CCP's traits for the hull matched to the effect that applies them (ESI carries the effect and its
 * size, not the skill). Unknown effects are ignored.
 */
export const CARGO_RULES: { effect: number; bonus: number; hold: HoldKey; skill: number }[] = [
  { effect: 529, bonus: 494, hold: 'cargo', skill: 3343 }, // Amarr Hauler (Bestower, Sigil, Prorator)
  { effect: 727, bonus: 495, hold: 'cargo', skill: 3342 }, // Caldari Hauler (Badger, Tayra, Crane)
  { effect: 726, bonus: 496, hold: 'cargo', skill: 3340 }, // Gallente Hauler (Nereus, Iteron Mark V, Viator, the Quafe Miasmos)
  { effect: 728, bonus: 493, hold: 'cargo', skill: 3341 }, // Minmatar Hauler (Wreathe, Mammoth, Prowler)
  { effect: 5477, bonus: 814, hold: 'ammo', skill: 3341 }, { effect: 8275, bonus: 3210, hold: 'gas', skill: 3341 }, // Hoarder
  { effect: 5479, bonus: 813, hold: 'mineral', skill: 3340 }, { effect: 8199, bonus: 3157, hold: 'ice', skill: 3340 }, // Kryos
  { effect: 5478, bonus: 813, hold: 'pi', skill: 3340 }, // Epithal
  { effect: 8323, bonus: 3241, hold: 'ore', skill: 3340 }, // Miasmos
  { effect: 5067, bonus: 3187, hold: 'ore', skill: 17940 }, // Mining Barge: +5% a level (Retriever, Mackinaw)
  { effect: 8251, bonus: 3198, hold: 'ore', skill: 22551 }, // Exhumers: +2.5% a level (Mackinaw)
  { effect: 12050, bonus: 5647, hold: 'infrastructure', skill: 81032 }, // Squall, Deluge, Torrent
  { effect: 12057, bonus: 5649, hold: 'infrastructure', skill: 81044 }, // Avalanche
  { effect: 5874, bonus: 807, hold: 'fleet', skill: 19719 }, // Transport Ships: a Deep Space Transport's fleet hangar
  { effect: 1668, bonus: 887, hold: 'cargo', skill: 20524 }, { effect: 1669, bonus: 889, hold: 'cargo', skill: 20526 },
  { effect: 1670, bonus: 890, hold: 'cargo', skill: 20527 }, { effect: 1671, bonus: 893, hold: 'cargo', skill: 20528 }, // racial Freighter: freighters and jump freighters
  { effect: 5998, bonus: 1983, hold: 'shipBay', skill: 34327 }, // ORE Freighter: the Bowhead's ship bay
  { effect: 8278, bonus: 3212, hold: 'ore', skill: 29637 }, { effect: 8279, bonus: 3211, hold: 'cargo', skill: 29637 }, // Industrial Command Ships
];

/** Every skill a hold follows at V, and the rigging skills: the ceiling a hull is shown against. */
export const CARGO_FIVE: Record<number, number> = Object.fromEntries([...CARGO_RULES.map((r) => r.skill), 26253, 26254].map((s) => [s, 5]));

/** Fitted modules and rigs that change the cargo hold or the hull's structure, by the effect that applies it. */
const CARGO_MULT_EFFECT = 59, CARGO_RIG_EFFECT = 836, CARGO_DRAWBACK_EFFECT = 5868, STRUCTURE_MULT_EFFECT = 3047, BULKHEAD_STRUCTURE_EFFECT = 60;

/**
 * A rig's drawback (attribute 1138, −10 on the Transverse Bulkheads' cargo) shrinks by its rigging skill's −10% a level
 * (1139): Armor Rigging for the armour rigs, where CCP files the Transverse Bulkheads (group 773), Astronautics Rigging for
 * the navigation rigs (782). ESI, 30 September 2026.
 */
const RIGGING_SKILL: Record<number, number> = { 773: 26253, 782: 26254 };

export type Holds = Partial<Record<HoldKey, number>>;

/** Each hold's size for this hull, fit and skills. `modules` is every fitted module and rig, one entry per unit. */
export function holdsFor(hull: TypeDogma, modules: TypeDogma[], skills: Record<number, number>): Holds {
  const lvl = (s: number) => Math.max(0, Math.min(5, skills[s] ?? 0));
  const out: Holds = {};
  for (const [key, attr] of Object.entries(HOLD_ATTR) as [HoldKey, number][]) {
    const base = hull.attrs[attr];
    if (!base) continue;
    let size = base;
    for (const r of CARGO_RULES) if (r.hold === key && hull.effects.includes(r.effect)) size *= 1 + ((hull.attrs[r.bonus] ?? 0) * lvl(r.skill)) / 100;
    if (key === 'cargo') {
      for (const m of modules) {
        if (m.effects.includes(CARGO_MULT_EFFECT)) size *= m.attrs[149] ?? 1;
        if (m.effects.includes(CARGO_RIG_EFFECT)) size *= 1 + (m.attrs[614] ?? 0) / 100;
        if (m.effects.includes(CARGO_DRAWBACK_EFFECT)) size *= 1 + ((m.attrs[1138] ?? -10) * (1 - 0.1 * lvl(RIGGING_SKILL[m.group] ?? 0))) / 100;
      }
    }
    out[key] = size;
  }
  return out;
}

/** Each hold with room in it, as one line: "Cargo 7,250 m³ · Fleet hangar 62,500 m³". */
export const holdsSaid = (h: Holds) => (Object.entries(h) as [HoldKey, number][]).filter(([, v]) => v > 0)
  .map(([k, v]) => `${HOLD_SAID[k].replace(/ hold$/, '')} ${units(Math.round(v))} m³`).join(' · ');

/** What a courier package can use: the cargo hold and any fleet hangar. */
export const generalSpace = (h: Holds) => GENERAL_HOLDS.reduce((t, k) => t + (h[k] ?? 0), 0);

/** The hull's structure hit points with its fitted expanders (×0.77) and bulkheads (×1.25); skills (Mechanics) left out. */
export function structureFor(hull: TypeDogma, modules: TypeDogma[]): number {
  let hp = hull.attrs[9] ?? 0;
  for (const m of modules) if (m.effects.includes(STRUCTURE_MULT_EFFECT) || m.effects.includes(BULKHEAD_STRUCTURE_EFFECT)) hp *= m.attrs[150] ?? 1;
  return hp;
}

/**
 * A bare hull's effective hit points against even damage, with no skills or modules: each layer's hit points (shield 263,
 * armour 265, structure 9) over the mean of its four resonances (shield 271–274, armour 267–270, structure 109–113). The
 * floor a fit starts from; a fit's own tank comes from the fit, not from here.
 */
export function bareEhp(hull: TypeDogma): number {
  const a = (k: number, d = 0) => hull.attrs[k] ?? d;
  const layer = (hp: number, res: number[]) => { const m = res.reduce((t, x) => t + x, 0) / res.length; return m > 0 ? hp / m : hp; };
  return layer(a(263), [271, 272, 273, 274].map((k) => a(k, 1))) + layer(a(265), [267, 268, 269, 270].map((k) => a(k, 1))) + layer(a(9), [113, 111, 109, 110].map((k) => a(k, 1)));
}
