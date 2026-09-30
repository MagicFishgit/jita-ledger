/**
 * Each mining hull's mastery tiers: the fit you can fly the day you get in it, a solid one, and the one that gets the most
 * out of it before the next step. Fits name their items (resolved to IDs at run time, like everything else here); the
 * yields are never written here but worked out from ESI's dogma (lib/miningYield.ts), and every price is Jita's. The
 * crystals follow what you mine: a fit says which kind (Type A, B or C, I or II) and the family comes from your ore. Pure.
 */

import type { CrystalKind, FitItem, Tier } from './fits';

export * from './fits';

const n = (x: FitItem) => x.qty ?? 1;

export type Family = 'Simple' | 'Coherent' | 'Variegated' | 'Complex' | 'Abyssal' | 'Mercoxit'
  | 'Ubiquitous Moon' | 'Common Moon' | 'Uncommon Moon' | 'Rare Moon' | 'Exceptional Moon';

/** Which crystal family each ore takes, by the ore's base name (every grade and compressed form shares it). */
export const FAMILIES: [Family, string[]][] = [
  ['Simple', ['Veldspar', 'Scordite', 'Pyroxeres', 'Plagioclase', 'Mordunium']],
  ['Coherent', ['Hedbergite', 'Hemorphite', 'Jaspet', 'Kernite', 'Omber', 'Ytirium', 'Griemeer', 'Nocxite']],
  ['Variegated', ['Crokite', 'Dark Ochre', 'Gneiss', 'Kylixium']],
  ['Complex', ['Arkonor', 'Bistot', 'Spodumain', 'Eifyrium', 'Ducinium', 'Hezorime', 'Ueganite']],
  ['Abyssal', ['Bezdnacine', 'Rakovene', 'Talassonite']],
  ['Mercoxit', ['Mercoxit']],
  ['Ubiquitous Moon', ['Zeolites', 'Sylvite', 'Bitumens', 'Coesite']],
  ['Common Moon', ['Cobaltite', 'Euxenite', 'Titanite', 'Scheelite']],
  ['Uncommon Moon', ['Otavite', 'Sperrylite', 'Vanadinite', 'Chromite']],
  ['Rare Moon', ['Carnotite', 'Zircon', 'Pollucite', 'Cinnabar']],
  ['Exceptional Moon', ['Xenotime', 'Monazite', 'Loparite', 'Ytterbite']],
];

export function oreFamily(oreName: string): Family | null {
  for (const [f, ores] of FAMILIES) if (ores.some((o) => new RegExp(`\\b${o}\\b`).test(oreName))) return f;
  return null;
}

/** The base ore an ore's name belongs to: "Scordite" for "Scordite II-Grade" or "Compressed Scordite", "Zeolites" for "Brimful Zeolites". */
export function oreBase(oreName: string): string | null {
  for (const [, ores] of FAMILIES) for (const o of ores) if (new RegExp(`\\b${o}\\b`).test(oreName)) return o;
  return null;
}

/** A grade's short label beside its base: "II-Grade", "Brimful", or the base's own name for the plain ore. */
export function gradeLabel(oreName: string, base: string): string {
  return oreName === base ? base : oreName.replace(base, '').replace(/\s+/g, ' ').trim() || oreName;
}

/** A grade to offer: an ore as mined, not its compressed forms. */
export const isMinedForm = (name: string) => !/\bCompressed\b/.test(name);

/**
 * Where a grade sits, poorest first: 0-Grade (the starter-space ore, fewer minerals), the plain ore, then II-, III- and
 * IV-Grade; a moon ore's Brimful and Glistening. Anything else goes last.
 */
export function gradeRank(label: string, base: string): number {
  if (label === base) return 0;
  const g = /^(0|I{1,3}|IV)-Grade$/.exec(label.trim());
  if (g) return g[1] === '0' ? -1 : g[1] === 'IV' ? 4 : g[1].length;
  return label === 'Brimful' ? 1 : label === 'Glistening' ? 2 : 9;
}

/** The crystal's name in the game: "Simple Asteroid Mining Crystal Type A II", "Rare Moon Mining Crystal Type B I". */
export function crystalName(family: Family, kind: CrystalKind): string {
  return `${family}${family.endsWith('Moon') ? '' : ' Asteroid'} Mining Crystal Type ${kind}`;
}

/**
 * Mercoxit takes deep-core lasers, and the fits' own swap for them like for like (ESI, 30 September 2026): a Modulated
 * Deep Core Strip Miner II takes a Modulated Strip Miner II's 60 CPU and 12 powergrid (a Strip Miner I's 60 and 10, an
 * ORE Strip Miner's 50 and 10); a Modulated Deep Core Miner II takes 80 and 3 (Miner II 80 and 4, EP-S 65 and 3, Miner I
 * 60 and 2). That's how miners do it: EVE Workbench's newest Skiff fit carries two deep-core strip miners and 80 Mercoxit
 * crystals in its cargo for the swap.
 */
export const DEEP_CORE: Record<string, string> = {
  'Modulated Strip Miner II': 'Modulated Deep Core Strip Miner II', 'Strip Miner I': 'Modulated Deep Core Strip Miner II',
  'ORE Strip Miner': 'Modulated Deep Core Strip Miner II',
  'Miner II': 'Modulated Deep Core Miner II', 'Miner I': 'Modulated Deep Core Miner II', 'ORE Miner': 'Modulated Deep Core Miner II',
  'EP-S Gaussian Scoped Mining Laser': 'Modulated Deep Core Miner II',
};
const isDeepCore = (name: string) => /^Modulated Deep Core /.test(name);
/** +16% on lasers that need Deep Core Mining, 250 of a hull's 400 calibration; there is no small or large one. */
export const DEEP_CORE_RIG = 'Medium Deep Core Mining Optimization I';

export type MercoxitFit = {
  tier: Tier;
  /** The lasers swapped, old name to new. */
  swapped: [string, string][];
  /** The deep-core rig: in place of `replaced`, no room beside the fit's rigs, or not made for this hull's rig size. */
  rig: { added: true; replaced: string } | { added: false; why: 'noRoom' | 'size' };
};

/**
 * A tier's Mercoxit version: its ore lasers swapped for deep-core ones, loaded with Mercoxit Type A crystals (what the
 * Mercoxit miners lost on zKillboard carry: Type A II on 21 Procurers and 15 Mackinaws of their last 400, Type B II on 5
 * Outriders; A leaves least residue on a scarce rock), tech II where the tier's own crystals were, and the deep-core
 * rig in place of a tank rig (a shield reinforcer before a field extender, never a processor rig, which the fit's CPU may
 * lean on) when the calibration still fits. Null for a fit with no ore lasers (ice, or a booster with none).
 */
export function mercoxitTier(t: Tier, rigCost: (name: string) => number | null, calibration: number, mediumRigs: boolean): MercoxitFit | null {
  const swapped = t.high.filter((x) => DEEP_CORE[x.name]).map((x): [string, string] => [x.name, DEEP_CORE[x.name]]);
  if (!swapped.length && !t.high.some((x) => isDeepCore(x.name))) return null;
  const high = t.high.map((x) => (DEEP_CORE[x.name] ? { ...x, name: DEEP_CORE[x.name] } : x));
  const crystal = { kind: (t.crystal?.kind.endsWith('II') ? 'A II' : 'A I') as CrystalKind, spares: t.crystal?.spares ?? 2 };
  let rigs = t.rigs;
  let rig: MercoxitFit['rig'] = { added: false, why: mediumRigs ? 'noRoom' : 'size' };
  if (mediumRigs && !t.rigs.some((x) => x.name === DEEP_CORE_RIG)) {
    const flat = t.rigs.flatMap((x) => Array.from({ length: n(x) }, () => x.name));
    const order = [/Shield Reinforcer/, /Core Defense Field Extender/].flatMap((re) => flat.map((nm, i) => (re.test(nm) ? i : -1)).filter((i) => i >= 0));
    const cost = (nm: string) => rigCost(nm);
    for (const i of order) {
      const rest = flat.filter((_, j) => j !== i);
      const costs = [...rest, DEEP_CORE_RIG].map(cost);
      if (costs.some((c) => c == null)) continue;
      if ((costs as number[]).reduce((a, b) => a + b, 0) > calibration) continue;
      rig = { added: true, replaced: flat[i] };
      const next = [...rest, DEEP_CORE_RIG];
      rigs = [...new Set(next)].map((name) => ({ name, qty: next.filter((x) => x === name).length }));
      break;
    }
  }
  const train: [string, number][] = t.key === 'max' ? [...t.train, ['Deep Core Mining', 5]] : t.train;
  return { tier: { ...t, high, crystal, rigs, train }, swapped, rig };
}

/**
 * The family to show crystals for: the one most of your ore (by units) belongs to, else Simple, which is what high-sec
 * belts are mostly made of.
 */
export function mainFamily(mined: { name: string; units: number }[]): Family {
  const by = new Map<Family, number>();
  for (const m of mined) { const f = oreFamily(m.name); if (f && f !== 'Mercoxit') by.set(f, (by.get(f) ?? 0) + m.units); }
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Simple';
}
