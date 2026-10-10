/**
 * Industry's rules (docs/notes/industry.md; spec docs/superpowers/specs/2026-10-10-industry-design.md): what a job uses,
 * how long it takes and what the game charges for it, for manufacturing, ME and TE research, copying and invention; the
 * slots a character has; which rigs help a product; the bundle's shape (src/data/industry.json, scripts/industry-bundle.mjs).
 * Pure: no config, store, React or DOM, so check.mjs loads it and the Worker may import it. Every rule was checked against
 * EVE Ref's industry API on the research's Large Trimark Armor Pump I and its Tech II (scripts/fixtures/industry-everef.json).
 */

export type Activity = 'manufacturing' | 'copying' | 'researchMaterial' | 'researchTime' | 'invention';
/** One activity of a blueprint: time (s, a run), materials a run, skills, products (an invention product carries its chance). */
export type BpActivity = [time: number, materials: [number, number][], skills: [number, number][], products: number[][]];
export type BundleBp = [bp: number, maxRuns: number, manufacturing: BpActivity | 0, copying: BpActivity | 0, researchMaterial: BpActivity | 0, researchTime: BpActivity | 0, invention: BpActivity | 0];
/** A type: name, group, category, packaged volume (m³), CCP's base price (0: none), mineable (minerals, ice products, moon materials). */
export type BundleType = [name: string, group: number, category: number, volume: number, basePrice: number, mineable: 0 | 1];
export type RigKind = 'material' | 'time' | 'cost';
/** A rig: type, size (2 M-Set, 3 L-Set, 4 XL-Set), tech (1, 2), what it helps, its time / material / cost bonus (%), and its multipliers by security. */
export type BundleRig = [type: number, size: number, tech: number, mods: [Activity, RigKind, number][], values: [time: number, material: number, cost: number], sec: [high: number, low: number, nul: number]];
export type IndustryBundle = {
  build: number; released: string; source: string;
  bps: BundleBp[];
  types: Record<string, BundleType>;
  groups: Record<string, [name: string, category: number]>;
  filters: Record<string, [name: string, categories: number[], groups: number[]]>;
  rigs: BundleRig[];
  /** Raitaru, Azbel, Sotiyo: material, cost, time. */
  structures: Record<string, [number, number, number]>;
  /** NPC stations: station, system, services (1 a Factory, 2 a Laboratory). */
  stations: [number, number, number][];
  /** Skills: rank, primary, secondary, the bonus attribute it carries (0: none), and its value a level. */
  skills: Record<string, [number, number, number, number, number]>;
};

/** The bundle, indexed once for the lookups every row makes. */
export type Indexed = {
  b: IndustryBundle;
  bp: Map<number, BundleBp>;
  /** A manufacturing product's blueprint. */
  byProduct: Map<number, BundleBp>;
  /** Blueprints some blueprint invents: Tech II, costed through invention. */
  t2: Set<number>;
  /** A Tech II blueprint → the Tech I blueprint that invents it. */
  inventedFrom: Map<number, number>;
  rig: Map<number, BundleRig>;
};

const ACT: Record<Activity, 2 | 3 | 4 | 5 | 6> = { manufacturing: 2, copying: 3, researchMaterial: 4, researchTime: 5, invention: 6 };

export function indexBundle(b: IndustryBundle): Indexed {
  const ix: Indexed = { b, bp: new Map(), byProduct: new Map(), t2: new Set(), inventedFrom: new Map(), rig: new Map(b.rigs.map((r) => [r[0], r])) };
  for (const x of b.bps) {
    ix.bp.set(x[0], x);
    const m = x[2];
    if (m && m[3][0]) ix.byProduct.set(m[3][0][0], x);
  }
  for (const x of b.bps) {
    const inv = x[6];
    if (!inv) continue;
    for (const p of inv[3]) if (ix.bp.has(p[0])) { ix.t2.add(p[0]); ix.inventedFrom.set(p[0], x[0]); }
  }
  return ix;
}

/** One activity of a blueprint, or null when it has none. */
export const activityOf = (bp: BundleBp, a: Activity): BpActivity | null => (bp[ACT[a]] || null) as BpActivity | null;
/** A type's name from the bundle; "Item #id" when it isn't in it. */
export const nameOf = (ix: Indexed, id: number): string => ix.b.types[id]?.[0] ?? `Item #${id}`;
/** What a blueprint builds and how many a run, or null for one that builds nothing. */
export function productOf(bp: BundleBp): { type: number; perRun: number } | null {
  const m = bp[2];
  return m && m[3][0] ? { type: m[3][0][0], perRun: m[3][0][1] } : null;
}

/**
 * The SCC surcharge on manufacturing and invention: 4% of the job's base since patch 21.06 (1 February 2024); EVE Ref
 * charges the same.
 */
export const SCC = 0.04;
/**
 * Copying's SCC: EVE Ref's calculator charges 4% of the job base (its copying output, 9 October 2026: base 3,151,808, SCC
 * 126,072); EVE University's copy formula has none. EVE Ref's reading until a copy job in an NPC station settles it.
 */
export const SCC_COPY = 0.04;
/**
 * Research's SCC: 2% since 17 July 2025 (CCP, "Exploration & Industry Balance Rework", called temporary), charged here on
 * the research job's base, the research's reading: CCP doesn't say on what. A research job in an NPC station settles it.
 */
export const SCC_RESEARCH = 0.02;
/** The Alpha clone tax on a job's base (EVE University; EVE Ref's `alpha_clone_tax`). */
export const ALPHA_TAX = 0.0025;
/** An NPC station's facility tax (EVE University, "Manufacturing", "Tax"): ESI's /industry/facilities gives none. */
export const NPC_FACILITY_TAX = 0.0025;
/** Copying, research and invention are charged on 2% of the estimated item value (EVE University; EVE Ref). */
export const COPY_BASE = 0.02;
export const RESEARCH_BASE = 0.02;
export const INVENTION_BASE = 0.02;
/**
 * Seconds to research a rank 1 blueprint to each level, 0 to 10 (EVE University, "Research"). A blueprint's own first-level
 * time in the static data is already rank × 105.
 */
export const LEVEL_MOD = [0, 105, 250, 595, 1414, 3360, 8000, 19000, 45255, 107700, 256000] as const;
/** Slots of each kind at most (EVE University, "Industry skills"): 1, Mass Production V and Advanced Mass Production V. */
export const MAX_SLOTS = 11;
export const DAY_S = 86_400;

/** The industry skills the rules read. Capital Ship Construction is for the ladder's last rung. */
export const SKILL = {
  industry: 3380, advancedIndustry: 3388, massProduction: 3387, advancedMassProduction: 24625,
  labOp: 3406, advancedLabOp: 24624, science: 3402, research: 3403, metallurgy: 3409, capitalShips: 22242,
} as const;

/** Where a job runs: an NPC station, an engineering complex, a citadel (no role bonus), or a structure the app has no bonuses for. */
export type SiteKind = 'npc' | 'raitaru' | 'azbel' | 'sotiyo' | 'astrahus' | 'fortizar' | 'keepstar' | 'other';
export const STRUCTURE_TYPE = { raitaru: 35825, azbel: 35826, sotiyo: 35827, astrahus: 35832, fortizar: 35833, keepstar: 35834 } as const;
/** The rig size a kind takes: M-Set (2) on a Raitaru or Astrahus, L-Set (3) on an Azbel or Fortizar, XL-Set (4) on a Sotiyo or Keepstar. */
export const RIG_SIZE: Record<SiteKind, number> = { npc: 0, other: 0, raitaru: 2, astrahus: 2, azbel: 3, fortizar: 3, sotiyo: 4, keepstar: 4 };
export const KIND_SAID: Record<SiteKind, string> = {
  npc: 'NPC station', raitaru: 'Raitaru', azbel: 'Azbel', sotiyo: 'Sotiyo', astrahus: 'Astrahus', fortizar: 'Fortizar', keepstar: 'Keepstar', other: 'a structure the app has no bonuses for',
};
/** A structure's kind from its type (ESI's /universe/structures `type_id`). */
export function kindOfType(typeId: number | null | undefined): SiteKind {
  for (const [k, id] of Object.entries(STRUCTURE_TYPE)) if (id === typeId) return k as SiteKind;
  return 'other';
}

export type SecBand = 'high' | 'low' | 'null' | 'unknown';
/**
 * A system's band for a rig's multiplier: 0.45 and up is high-sec, above 0 low-sec, the rest (wormholes too) null. As
 * reprocess.ts reads it. A security that isn't known (NaN, undefined, null) is 'unknown', never null-sec: null-sec has the
 * best rig multiplier, so a system not yet resolved must not take it (Task 2's review).
 */
export const secBand = (security: number | null | undefined): SecBand =>
  typeof security !== 'number' || !Number.isFinite(security) ? 'unknown' : security >= 0.45 ? 'high' : security > 0 ? 'low' : 'null';

export type Bonus = { material: number; time: number; cost: number };
export const NO_BONUS: Bonus = { material: 1, time: 1, cost: 1 };

/** An engineering complex's role bonus (dogma 2600 material, 2601 cost, 2602 time); none for a station, a citadel or another structure. */
export function structureBonus(ix: Indexed, kind: SiteKind): Bonus {
  const id = (STRUCTURE_TYPE as Record<string, number>)[kind];
  const s = id != null ? ix.b.structures[id] : undefined;
  return s ? { material: s[0], cost: s[1], time: s[2] } : NO_BONUS;
}

/** Whether a product is in one of the static data's rig filters (0 is every product). */
export function inFilter(ix: Indexed, filter: number, product: number | null): boolean {
  if (!filter) return true;
  const f = ix.b.filters[filter], t = product != null ? ix.b.types[product] : null;
  return !!f && !!t && (f[1].includes(t[2]) || f[2].includes(t[1]));
}

/**
 * What a site's rigs do for one product's activity: of each kind, the best rig that fits the structure and helps that
 * product, at the site's security (1 + bonus% × multiplier). Two rigs of one kind on one product don't stack here: the
 * better is taken. A rig of another size, or any rig at an NPC station, does nothing.
 */
export function rigFor(ix: Indexed, rigs: readonly number[], kind: SiteKind, band: SecBand, product: number | null, activity: Activity): Bonus {
  const out = { ...NO_BONUS };
  const size = RIG_SIZE[kind];
  if (!size || band === 'unknown') return out; // a security not known takes no multiplier, never null-sec's
  const sec = band === 'high' ? 0 : band === 'low' ? 1 : 2;
  const at: Record<RigKind, 0 | 1 | 2> = { time: 0, material: 1, cost: 2 };
  for (const id of rigs) {
    const r = ix.rig.get(id);
    if (!r || r[1] !== size) continue;
    for (const [act, k, filter] of r[3]) {
      if (act !== activity || !inFilter(ix, filter, product)) continue;
      out[k] = Math.min(out[k], 1 + (r[4][at[k]] * r[5][sec]) / 100);
    }
  }
  return out;
}

/**
 * What one job uses: max(runs, ceil(round(runs × qty × (1 − ME/100) × structure × rig, 2))) of each material, rounded per
 * job and not per run (Qoi, "Formulas for EVE Industry" v2.2, 2016; EVE University, "Research" and "Manufacturing"). The
 * round to two places keeps 3,995.000000001 at 3,995. A material needed once a run can't fall below the runs.
 */
export function materialsFor(mats: readonly [number, number][], runs: number, me: number, structure: number, rig: number): [number, number][] {
  const mod = (1 - me / 100) * structure * rig;
  return mats.map(([t, q]) => [t, Math.max(runs, Math.ceil(Math.round(runs * q * mod * 100) / 100))]);
}

/** A skill's level-scaled bonus as the bundle reads it from dogma: 1 + bonus/100 × level, or 1 when it carries another. */
function skillBonus(ix: Indexed, skill: number, attr: number, skills: Record<number, number>): number {
  const s = ix.b.skills[skill];
  return s && s[3] === attr ? 1 + (s[4] / 100) * Math.max(0, Math.min(5, skills[skill] ?? 0)) : 1;
}

/**
 * The skills' share of a manufacturing job's time: Industry (−4% a level), Advanced Industry (−3%), and each skill the
 * blueprint requires that carries dogma 1982 (−1% a level: the science and advanced construction skills a Tech II item
 * asks for). How EVE Ref's Tech II time comes out (4 h 8 min 12 s for the Large Trimark Armor Pump II at III and III).
 */
export function manufacturingSkills(ix: Indexed, required: readonly [number, number][], skills: Record<number, number>): number {
  let f = skillBonus(ix, SKILL.industry, 440, skills) * skillBonus(ix, SKILL.advancedIndustry, 1961, skills);
  for (const [id] of required) f *= skillBonus(ix, id, 1982, skills);
  return f;
}

/** A manufacturing run's time: base × (1 − TE/100) × the skills × structure × rig. */
export const jobTime = (base: number, te: number, skills: number, structure: number, rig: number): number =>
  base * (1 - te / 100) * skills * structure * rig;

/** A day's runs, the research's job length: as many as finish in a day, at least one; a copy's own runs cap it. */
export function runsPerDay(timePerRun: number, cap?: number | null): number {
  const n = Math.max(1, Math.floor(DAY_S / timePerRun));
  return cap != null && cap > 0 ? Math.min(n, cap) : n;
}

/** Copying: copy time × runs × copies × (1 − 5% × Science) × (1 − 3% × Advanced Industry) × structure × rig. TE doesn't touch it. */
export const copyTime = (ix: Indexed, base: number, runs: number, copies: number, skills: Record<number, number>, structure: number, rig: number): number =>
  base * runs * copies * skillBonus(ix, SKILL.science, 452, skills) * skillBonus(ix, SKILL.advancedIndustry, 1961, skills) * structure * rig;

/**
 * ME or TE research from one level to another (0 to 10; a TE level is 2%, so TE 20 is level 10): the blueprint's first-level
 * time (rank × 105 s already) × (LEVEL_MOD[to] − LEVEL_MOD[from]) ÷ 105 × (1 − 5% × Metallurgy) for ME or (1 − 5% × Research)
 * for TE × (1 − 3% × Advanced Industry) × structure × rig.
 */
export function researchTime(ix: Indexed, base: number, what: 'me' | 'te', from: number, to: number, skills: Record<number, number>, structure: number, rig: number): number {
  if (to <= from) return 0;
  const skill = what === 'me' ? skillBonus(ix, SKILL.metallurgy, 468, skills) : skillBonus(ix, SKILL.research, 453, skills);
  return (base * (LEVEL_MOD[to] - LEVEL_MOD[from])) / 105 * skill * skillBonus(ix, SKILL.advancedIndustry, 1961, skills) * structure * rig;
}

/** Invention's time an attempt: base × (1 − 3% × Advanced Industry) × structure × rig. No science skill shortens it (EVE Ref). */
export const inventionTime = (ix: Indexed, base: number, skills: Record<number, number>, structure: number, rig: number): number =>
  base * skillBonus(ix, SKILL.advancedIndustry, 1961, skills) * structure * rig;

/**
 * Invention's chance: base × (1 + (science 1 + science 2) / 30 + encryption / 40) × (1 + decryptor) (EVE University;
 * EVE Ref's 0.4335 for a base of 0.34 at III, III and III). Decryptors aren't modelled: 0.
 */
export const inventionChance = (base: number, science1: number, science2: number, encryption: number, decryptor = 0): number =>
  base * (1 + (science1 + science2) / 30 + encryption / 40) * (1 + decryptor);

export type Clone = 'alpha' | 'omega' | 'unknown';
/** Where a job is charged: the system's index for the activity, the structure's and the rigs' cost bonuses, the facility tax (null: not known), the clone. */
export type CostAt = { index: number; structure: number; rig: number; tax: number | null; clone: Clone };
export type JobCost = {
  base: number;
  /** The system's index × base, and what the structure's and rigs' cost bonuses take off that part only (≤ 0). */
  index: number; bonus: number;
  /** The facility tax; null when it isn't known (a structure whose owner's tax isn't typed or measured). */
  tax: number | null;
  scc: number;
  /** The Alpha clone tax: 0 for Omega, null when the clone state isn't known (left out, and said). */
  alpha: number | null;
  /** Everything known: a facility tax or Alpha tax not known is left out. */
  total: number;
};

/**
 * A job's cost: base × (index × structure × rig + facility tax + SCC + Alpha tax). The bonuses come off the index part
 * only, as EVE Ref's output splits them (`system_cost_bonuses`: −4% of `system_cost_index` in an Azbel).
 */
export function jobCostOf(base: number, c: CostAt, scc: number): JobCost {
  const index = base * c.index;
  const bonus = index * (c.structure * c.rig - 1);
  const tax = c.tax == null ? null : base * c.tax;
  const sccPart = base * scc;
  const alpha = c.clone === 'alpha' ? base * ALPHA_TAX : c.clone === 'omega' ? 0 : null;
  return { base, index, bonus, tax, scc: sccPart, alpha, total: index + bonus + (tax ?? 0) + sccPart + (alpha ?? 0) };
}

/** Manufacturing: on the estimated item value of the runs. */
export const manufacturingCost = (eivRun: number, runs: number, c: CostAt): JobCost => jobCostOf(eivRun * runs, c, SCC);
/** Copying: on 2% of the estimated item value of every run on every copy (the product's ME 0 manufacturing materials). */
export const copyCost = (eivRun: number, runs: number, copies: number, c: CostAt): JobCost => jobCostOf(COPY_BASE * eivRun * runs * copies, c, SCC_COPY);
/** ME or TE research: on 2% of the EIV × the level table's steps ÷ 105, without the blueprint's rank (EVE University's table). */
export const researchCost = (eivRun: number, from: number, to: number, c: CostAt): JobCost =>
  jobCostOf((RESEARCH_BASE * eivRun * (LEVEL_MOD[to] - LEVEL_MOD[from])) / 105, c, SCC_RESEARCH);
/** Invention: on 2% of the Tech II product's EIV (one run) for each attempt. */
export const inventionCost = (eivT2Run: number, attempts: number, c: CostAt): JobCost => jobCostOf(INVENTION_BASE * eivT2Run * attempts, c, SCC);

/** The estimated item value of one run: its ME 0 materials at CCP's adjusted prices; null when any of them has none. */
export function eivOf(mats: readonly [number, number][], adjusted: Record<number, number>): number | null {
  let v = 0;
  for (const [t, q] of mats) {
    const p = adjusted[t];
    if (p == null || !Number.isFinite(p)) return null;
    v += q * p;
  }
  return v;
}

/** Factory and science slots from skills: 1 + Mass Production + Advanced Mass Production, 1 + Laboratory Operation + Advanced Laboratory Operation, at most 11 each. */
export function slots(ix: Indexed, skills: Record<number, number>): { factory: number; science: number } {
  const add = (ids: number[], attr: number) => ids.reduce((n, id) => {
    const s = ix.b.skills[id];
    return n + (s && s[3] === attr ? s[4] * Math.max(0, Math.min(5, skills[id] ?? 0)) : 0);
  }, 1);
  return {
    factory: Math.min(MAX_SLOTS, add([SKILL.massProduction, SKILL.advancedMassProduction], 450)),
    science: Math.min(MAX_SLOTS, add([SKILL.labOp, SKILL.advancedLabOp], 471)),
  };
}

/** Skills an activity asks for that a character lacks, with the level it asks. */
export const lacking = (required: readonly [number, number][], skills: Record<number, number>): { id: number; level: number }[] =>
  required.filter(([id, lvl]) => (skills[id] ?? 0) < lvl).map(([id, level]) => ({ id, level }));

/** ESI's /industry/systems/ answer, per system. A system is kept only with all five indices. */
export type IndustryIndex = { manufacturing: number; copying: number; invention: number; researchMaterial: number; researchTime: number };
const INDEX_OF: Record<string, keyof IndustryIndex> = {
  manufacturing: 'manufacturing', copying: 'copying', invention: 'invention',
  researching_material_efficiency: 'researchMaterial', researching_time_efficiency: 'researchTime',
};
export function parseIndices(raw: readonly { solar_system_id: number; cost_indices: readonly { activity: string; cost_index: number }[] }[]): Record<number, IndustryIndex> {
  const out: Record<number, IndustryIndex> = {};
  for (const s of raw) {
    const x: Partial<IndustryIndex> = {};
    for (const c of s.cost_indices ?? []) {
      const k = INDEX_OF[c.activity];
      if (k && Number.isFinite(c.cost_index) && c.cost_index >= 0) x[k] = c.cost_index;
    }
    if (Object.keys(x).length === 5) out[s.solar_system_id] = x as IndustryIndex;
  }
  return out;
}

/** The index an activity is charged at. */
export const indexFor = (ix: IndustryIndex, a: Activity): number => ix[a];
