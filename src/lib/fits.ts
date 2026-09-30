/**
 * A ship fit as the progression trees show it (Mining, Abyssal, Hauling): slots of named items, drones, charges, cargo,
 * implants, the skills a tier asks for and where the fit comes from; and the ways out of the app: EFT text for the fitting
 * window's import, Multibuy lines, and a saved fitting (ESI). Names are resolved to IDs at run time. Pure.
 */

import { multibuy } from './combat';

export type TierKey = 'start' | 'solid' | 'max';
export const TIER_SAID: Record<TierKey, string> = { start: 'Just in', solid: 'Solid', max: 'Max' };

/** A fitted item, how many, and the charge loaded in each (a command burst's). */
export type FitItem = { name: string; qty?: number; charge?: string };
/** A crystal kind: A (yield), B (faster, more residue), C (clears rocks), in tech I or II. */
export type CrystalKind = 'A I' | 'A II' | 'B I' | 'B II' | 'C I' | 'C II';

export type Tier = {
  key: TierKey;
  /** What this tier is about, in a line or two. */
  what: string;
  high: FitItem[]; mid: FitItem[]; low: FitItem[]; rigs: FitItem[]; drones?: FitItem[];
  /** Loaded in each modulated laser, with spares in the cargo. */
  crystal?: { kind: CrystalKind; spares: number };
  implants?: string[];
  /** Anything else carried, such as spare charges. */
  cargo?: FitItem[];
  /** Skills this tier asks for beyond what the fit itself requires, as [name, level]. */
  train: [string, number][];
  /** Where the fit comes from, with a date. */
  source: string;
};

const n = (x: FitItem) => x.qty ?? 1;
const modulated = (name: string) => /^Modulated /.test(name);

/** The fit in EFT form, which the game's fitting window imports (Import from clipboard) and every fitting tool reads. */
export function eftText(hull: string, label: string, t: Tier, crystal: string | null): string {
  const each = (xs: FitItem[], charge?: (x: FitItem) => string | null) => xs.flatMap((x) => Array.from({ length: n(x) }, () => {
    const c = charge?.(x) ?? x.charge;
    return c ? `${x.name}, ${c}` : x.name;
  }));
  const loaded = (x: FitItem) => (crystal && modulated(x.name) ? crystal : null);
  const lasers = t.high.filter((x) => modulated(x.name)).reduce((s, x) => s + n(x), 0);
  const cargo = [...(crystal && t.crystal && lasers ? [`${crystal} x${t.crystal.spares}`] : []), ...(t.cargo ?? []).map((x) => `${x.name} x${n(x)}`)];
  const blocks = [
    [`[${hull}, ${label}]`, ...each(t.low)], each(t.mid), each(t.high, loaded), each(t.rigs),
    (t.drones ?? []).map((x) => `${x.name} x${n(x)}`), cargo,
  ];
  return blocks.filter((b, i) => i === 0 || b.length).map((b) => b.join('\n')).join('\n\n');
}

/** Everything to buy for the fit, hull included, as Multibuy lines ("Name N"): crystals loaded and spare together. */
export function fitMultibuy(hull: string, t: Tier, crystal: string | null, withHull = true): { text: string; lines: number } {
  const all = new Map<string, number>();
  const add = (name: string, q: number) => all.set(name, (all.get(name) ?? 0) + q);
  if (withHull) add(hull, 1);
  for (const x of [...t.high, ...t.mid, ...t.low, ...t.rigs, ...(t.drones ?? []), ...(t.cargo ?? [])]) { add(x.name, n(x)); if (x.charge) add(x.charge, n(x)); }
  const lasers = t.high.filter((x) => modulated(x.name)).reduce((s, x) => s + n(x), 0);
  if (crystal && t.crystal && lasers) add(crystal, lasers + t.crystal.spares);
  for (const i of t.implants ?? []) add(i, 1);
  const lines = [...all.entries()].map(([name, qty]) => ({ name, qty }));
  return { text: multibuy(lines), lines: lines.length };
}

export type FittingBody = { name: string; description: string; ship_type_id: number; items: { flag: string; quantity: number; type_id: number }[] };

/**
 * The fit as a saved fitting (POST /characters/{id}/fittings, scope esi-fittings.write_fittings.v1): each module in its
 * own slot, drones in the drone bay, crystals in the cargo (a fitting holds modules in slots; the game loads charges from
 * the cargo). Null while any name is unresolved: a fitting missing a module is worse than none.
 */
export function fittingBody(hullId: number, hull: string, label: string, t: Tier, crystal: string | null, idOf: (name: string) => number | null): FittingBody | null {
  const items: FittingBody['items'] = [];
  const slots = (xs: FitItem[], prefix: string) => {
    let i = 0;
    for (const x of xs) for (let k = 0; k < n(x); k++) items.push({ flag: `${prefix}${i++}`, quantity: 1, type_id: idOf(x.name) ?? NaN });
  };
  slots(t.high, 'HiSlot'); slots(t.mid, 'MedSlot'); slots(t.low, 'LoSlot'); slots(t.rigs, 'RigSlot');
  for (const x of t.drones ?? []) items.push({ flag: 'DroneBay', quantity: n(x), type_id: idOf(x.name) ?? NaN });
  const lasers = t.high.filter((x) => modulated(x.name)).reduce((s, x) => s + n(x), 0);
  if (crystal && t.crystal && lasers) items.push({ flag: 'Cargo', quantity: lasers + t.crystal.spares, type_id: idOf(crystal) ?? NaN });
  const charges = new Map<string, number>();
  for (const x of [...t.high, ...t.mid, ...t.low]) if (x.charge) charges.set(x.charge, (charges.get(x.charge) ?? 0) + n(x));
  for (const x of t.cargo ?? []) charges.set(x.name, (charges.get(x.name) ?? 0) + n(x));
  for (const [nm, q] of charges) items.push({ flag: 'Cargo', quantity: q, type_id: idOf(nm) ?? NaN });
  if (items.some((x) => !Number.isFinite(x.type_id))) return null;
  return {
    name: `${hull} ${label}`.slice(0, 50),
    description: `Saved by Jita Ledger: the ${label} fit for the ${hull}.`.slice(0, 500),
    ship_type_id: hullId, items,
  };
}

/** The items a fit has, by name, with counts: for pricing and name lookup. */
export function fitItems(t: Tier, crystal: string | null): FitItem[] {
  const lasers = t.high.filter((x) => modulated(x.name)).reduce((s, x) => s + n(x), 0);
  const charges = [...t.high, ...t.mid, ...t.low].filter((x) => x.charge).map((x) => ({ name: x.charge!, qty: n(x) }));
  return [...t.high, ...t.mid, ...t.low, ...t.rigs, ...(t.drones ?? []), ...charges, ...(t.cargo ?? []),
    ...(crystal && t.crystal && lasers ? [{ name: crystal, qty: lasers + t.crystal.spares }] : [])];
}
