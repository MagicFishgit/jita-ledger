/**
 * Reprocessing: what an item breaks down into where you refine it, at your skills, and what that's worth. The user
 * asked for a page to find items worth buying to reprocess (the Experimental ZW-4100 Torpedo Launcher traded at its
 * minerals' value) with profit by skill level and by where you refine: NPC station, or a player structure in high,
 * low or null-sec. The rules (EVE University's Reprocessing page, checked against the SDE on 29 September 2026):
 *
 * - Modules, charges and ships ("scrapmetal"): the place's base yield × (1 + 2% × Scrapmetal Processing), 55% at best
 *   anywhere. Rigs, structures, security and implants don't touch it.
 * - Ore, ice and moon ore: base × (1 + 3% × Reprocessing) × (1 + 2% × Reprocessing Efficiency) × (1 + 2% × the ore's
 *   own processing skill, named by the ore: `oreSkill`) × (1 + implant). An NPC station's base is its own (ESI's
 *   reprocessing_efficiency, 0.5 at Jita 4-4); an Upwell structure's is (50% + rig: T1 1, T2 3) × security (with a
 *   rig: high 1.00, low 1.06, null 1.12) × (1 + structure: Athanor 2%, Tatara 5.5%). Up to ~90.6% in null.
 * - Output comes in whole batches (`portionSize`): what's left under a batch stays. Each batch's output is rounded
 *   down per material, the conservative reading (a ZW-4100's 7 Mexallon at 55% gives 3 a unit, not 3.85).
 * - Tax: an NPC station takes 5% at 0 standing to its owner, falling to 0% at 6.67 (the straight line between is
 *   inferred); a structure's owner sets its own. It's charged on CCP's adjusted price of what comes out.
 * Pure.
 */
/** A type's materials as bundled: portion size, what one portion gives at 100%, and an ore's processing skill. */
export type Materials = [portion: number, mats: [number, number][], oreSkill?: number];

export const REPROCESSING = 3385;
export const REPROCESSING_EFFICIENCY = 3389;
export const SCRAPMETAL_PROCESSING = 12196;
export const METALLURGY = 3409;

export const IMPLANTS = { none: 0, rx801: 0.01, rx802: 0.02, rx804: 0.04 } as const;
export type Implant = keyof typeof IMPLANTS;

export type Site =
  | { kind: 'station'; base: number; tax: number }
  | { kind: 'structure'; structure: 'athanor' | 'tatara' | 'other'; rig: 'none' | 't1' | 't2'; sec: 'high' | 'low' | 'null'; tax: number };

const RIG = { none: 0, t1: 1, t2: 3 } as const;
const SEC = { high: 1, low: 1.06, null: 1.12 } as const;
const STRUCTURE = { athanor: 0.02, tatara: 0.055, other: 0 } as const;

/** An NPC station's tax at your standing with its owner: 5% at 0, none from 6.67 up. */
export function stationTax(standing: number): number {
  return Math.max(0, Math.min(0.05, 0.05 - 0.0075 * Math.max(0, standing)));
}

/** The place's base yield for ore, and for everything else. */
export function siteBase(site: Site, ore: boolean): number {
  if (site.kind === 'station') return site.base;
  if (!ore) return 0.5;
  const rigged = site.rig !== 'none';
  return ((50 + RIG[site.rig]) / 100) * (rigged ? SEC[site.sec] : 1) * (1 + STRUCTURE[site.structure]);
}

/** Your yield on an item at a place: its share of each material that comes out. */
export function yieldOf(m: Materials, skills: Record<number, number>, site: Site, implant: Implant = 'none'): number {
  const lv = (id: number) => Math.max(0, Math.min(5, skills[id] ?? 0));
  const ore = m[2] != null;
  if (!ore) return siteBase(site, false) * (1 + 0.02 * lv(SCRAPMETAL_PROCESSING));
  return siteBase(site, true) * (1 + 0.03 * lv(REPROCESSING)) * (1 + 0.02 * lv(REPROCESSING_EFFICIENCY)) * (1 + 0.02 * lv(m[2]!)) * (1 + IMPLANTS[implant]);
}

export type Output = { batches: number; left: number; out: [number, number][] };

/** What `qty` units give at a yield: whole batches, each material rounded down per batch. */
export function reprocessOutput(m: Materials, qty: number, y: number): Output {
  const batches = Math.floor(qty / m[0]);
  const out = m[1].map(([id, q]) => [id, Math.floor(q * y) * batches] as [number, number]).filter(([, q]) => q > 0);
  return { batches, left: qty - batches * m[0], out };
}

export type Worth = {
  /** What the output fetches: sold into the Jita bids after sales tax, per material and in all. */
  gross: number;
  perMaterial: { id: number; qty: number; each: number | null; value: number }[];
  /** The reprocessing tax on it, at CCP's adjusted prices. */
  tax: number;
  /** Anything the bids don't price: left out of the value rather than guessed. */
  unpriced: number[];
  net: number;
};

/** What an output is worth to you: sold into the bids (sales tax only), less the reprocessing tax. */
export function outputWorth(o: Output, bid: (id: number) => number | null | undefined, adjusted: (id: number) => number | null | undefined, taxRate: number, salesTax: number): Worth {
  const perMaterial = o.out.map(([id, qty]) => {
    const each = bid(id);
    return { id, qty, each: each != null && each > 0 ? each : null, value: each != null && each > 0 ? each * qty * (1 - salesTax) : 0 };
  });
  const gross = perMaterial.reduce((t, m) => t + m.value, 0);
  const tax = taxRate * o.out.reduce((t, [id, qty]) => t + (adjusted(id) ?? 0) * qty, 0);
  return { gross, perMaterial, tax, unpriced: perMaterial.filter((m) => m.each == null).map((m) => m.id), net: gross - tax };
}

/** The skill that moves an item's yield, and your yield at each of its levels, the rest as they are. */
export function yieldByLevel(m: Materials, skills: Record<number, number>, site: Site, implant: Implant = 'none'): { skill: number; levels: number[] } {
  const skill = m[2] ?? SCRAPMETAL_PROCESSING;
  return { skill, levels: [0, 1, 2, 3, 4, 5].map((l) => yieldOf(m, { ...skills, [skill]: l }, site, implant)) };
}

/** An item listed under what its output fetches, from the cached books (the cloud's daily full scan). */
export type ScanHit = {
  typeId: number;
  /** The cheapest listing, and what one unit's output fetches after sales tax and reprocessing tax, at your yield. */
  ask: number;
  value: number;
  /** Units listed under that value (whole batches), and what buying and reprocessing them makes. */
  units: number;
  profit: number;
  /** The same at the best yield the skill that moves it gives (Scrapmetal Processing, or the ore's own skill, at V). */
  valueBest: number;
  profitBest: number;
};

/** What one unit's output fetches at a yield: in the bids after sales tax, less the reprocessing tax. */
export function unitValue(m: Materials, y: number, bid: (id: number) => number | null | undefined, adjusted: (id: number) => number | null | undefined, taxRate: number, salesTax: number): number {
  const w = outputWorth(reprocessOutput(m, m[0], y), bid, adjusted, taxRate, salesTax);
  return w.net / m[0];
}

/**
 * Every item listed under what its output fetches (the ZW-4100 case), from books: each listing level under the value,
 * in whole batches, what buying and reprocessing it makes. Items making less than `minProfit` even at the best yield
 * are left out. Most profitable at your yield first.
 */
export function scanUnderValue(
  types: Record<string, Materials>,
  books: Record<number, { topSells: { price: number; volume: number }[]; topBuys: { price: number; volume: number }[] }>,
  skills: Record<number, number>, site: Site, implant: Implant, salesTax: number,
  adjusted: (id: number) => number | null | undefined, minProfit: number,
): ScanHit[] {
  const bid = (id: number) => books[id]?.topBuys?.[0]?.price ?? null;
  const out: ScanHit[] = [];
  for (const [key, m] of Object.entries(types)) {
    const id = Number(key);
    const sells = books[id]?.topSells;
    if (!sells?.length) continue;
    const y = yieldOf(m, skills, site, implant);
    const best = yieldByLevel(m, skills, site, implant).levels[5];
    const value = unitValue(m, y, bid, adjusted, site.tax, salesTax);
    const valueBest = unitValue(m, best, bid, adjusted, site.tax, salesTax);
    const walk = (v: number) => {
      let units = 0, profit = 0;
      for (const s of sells) { if (s.price >= v) break; units += s.volume; profit += (v - s.price) * s.volume; }
      const whole = Math.floor(units / m[0]) * m[0];
      return { units: whole, profit: units > 0 ? profit * (whole / units) : 0 };
    };
    const now = walk(value), top = walk(valueBest);
    if (top.profit < minProfit) continue;
    out.push({ typeId: id, ask: sells[0].price, value, units: now.units, profit: now.profit, valueBest, profitBest: top.profit });
  }
  return out.sort((a, b) => b.profit - a.profit || b.profitBest - a.profitBest);
}
