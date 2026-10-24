/**
 * The chart of every planetary good (the Planets tab's Chart): the goods by tier, a good's recipe down to P0, the planet types a
 * P0 comes from, what a system's planets can't supply, and which setups can make a good there. Pure: the Worker may import it.
 *
 * "Can make" is read off the bundle by what each kind of setup sells (the planner's own kinds, piPlan.ts): P0 → P1 sells P1,
 * P0 → P2 a P2 one planet makes alone, a fed factory a P2 or P3, a factory on bought inputs a P2, P3 or P4, and a chain a P3 or
 * P4. Whether the ranked setup does make it is its roles' (`makingIn`), so the chart says both and agrees with the Plan section.
 */
import type { PlanetType } from './pi';
import type { Commodity, PiIndex, Schematic, Tier } from './piBundle';
import { shippedOutput, type Setup, type SetupKind } from './piPlan';

export const TIERS: readonly Tier[] = ['P0', 'P1', 'P2', 'P3', 'P4'];
const RANK: Record<Tier, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
const byName = (a: Commodity, b: Commodity) => a.name.localeCompare(b.name, 'en') || a.id - b.id;

/** Every good by tier, each tier by name. */
export function goodsByTier(ix: PiIndex): Record<Tier, Commodity[]> {
  const out: Record<Tier, Commodity[]> = { P0: [], P1: [], P2: [], P3: [], P4: [] };
  for (const c of ix.commodities) out[c.tier].push(c);
  for (const t of TIERS) out[t].sort(byName);
  return out;
}

/** The planet types a P0 is on, in the bundle's order of planet types. */
export function typesWith(ix: PiIndex, p0: number): PlanetType[] {
  return (Object.entries(ix.planetTypes) as [PlanetType, PiIndex['planetTypes'][PlanetType]][]).filter(([, d]) => d.p0.includes(p0)).map(([t]) => t);
}

/** One good of a recipe: how many of it one unit of the good at the top takes, all the way down, and the schematic making it (null for a P0). */
export type RecipeStep = { id: number; tier: Tier; need: number; schematic: Schematic | null };

/**
 * A good's recipe down to P0: each good in it once, the good itself first, then down a tier at a time (by name within a tier).
 * `need` sums every path to it, each step's inputs over its output a cycle: one Nanites takes 40 ÷ 5 = 8 Bacteria, and each
 * Bacteria 3,000 ÷ 20 = 150 Microorganisms, so 1,200. A good's inputs are always of a lower tier, so the tiers are summed top
 * down. A good the bundle doesn't know gives an empty recipe.
 */
export function recipeOf(ix: PiIndex, id: number): RecipeStep[] {
  const top = ix.byId.get(id);
  if (!top) return [];
  const need = new Map<number, number>([[id, 1]]);
  for (let t = RANK[top.tier]; t > 0; t--) {
    for (const [g, n] of [...need]) {
      if (ix.byId.get(g)?.tier !== TIERS[t]) continue;
      const s = ix.makes.get(g);
      if (!s) continue;
      for (const i of s.inputs) need.set(i.id, (need.get(i.id) ?? 0) + (n * i.qty) / s.out.qty);
    }
  }
  const step = (g: number): RecipeStep => ({ id: g, tier: ix.byId.get(g)?.tier ?? 'P0', need: need.get(g)!, schematic: ix.makes.get(g) ?? null });
  const below = [...need.keys()].filter((g) => g !== id && ix.byId.has(g)).map((g) => ix.byId.get(g)!)
    .sort((a, b) => RANK[b.tier] - RANK[a.tier] || byName(a, b));
  return [step(id), ...below.map((c) => step(c.id))];
}

/** The panel's inner width, and the narrowest a card can be and still hold the longest single name at 11 px beside its icon (6.3 px a character, 30 px of icon and padding). */
export const RECIPE_WIDTH = 566;
export const CARD_GAP = 10;
export const cardMin = (words: number) => Math.ceil(words * 6.3) + 30;
/**
 * The drawn recipe's grid in pixels: each column takes its share of the panel's width, but never less than a card that holds the
 * longest word (`longest`, in characters) plus the gap for the paths; past that the tree is wider than the panel and scrolls.
 * `halfW` and `halfH` are how much of a cell a card fills, for `treeProblems`.
 */
export function recipeGrid(cols: number, longest: number, width = RECIPE_WIDTH) {
  const colW = Math.min(180, Math.max(Math.floor(width / Math.max(1, cols)), cardMin(longest) + CARD_GAP));
  const cardW = colW - CARD_GAP, rowH = 54, cardH = 46;
  return { colW, rowH, cardW, cardH, halfW: cardW / 2 / colW, halfH: cardH / 2 / rowH };
}
/** The longest single word in any good's name (cards break names only at spaces). */
export const longestWord = (ix: PiIndex) => Math.max(...ix.commodities.flatMap((c) => c.name.split(/\s+/).map((w) => w.length)));

/** One card of the drawn recipe: a good at a depth, how many go into one of the picked good along this path, and the card it feeds. */
export type RecipeNode = { i: number; id: number; col: number; row: number; need: number; parent: number | null };

/**
 * The recipe as a tree to draw, left to right: the picked good at column 0, what it's made from at 1, and so on down to P0. A good
 * used by two parents appears once under each (so no line crosses another), with `need` the amount along that path; the leaves
 * take consecutive rows and a parent sits at the middle of its children, so every line joins neighbouring columns. A good the
 * bundle doesn't know gives no nodes. `edges` are [parent, child] node indexes, for `treeProblems`.
 */
export function recipeTree(ix: PiIndex, id: number): { nodes: RecipeNode[]; edges: [number, number][]; cols: number; rows: number } {
  const nodes: RecipeNode[] = [];
  const edges: [number, number][] = [];
  let leaf = 0, cols = 0;
  const walk = (g: number, col: number, need: number, parent: number | null): number => {
    const i = nodes.length;
    nodes.push({ i, id: g, col, row: 0, need, parent });
    cols = Math.max(cols, col + 1);
    const s = ix.makes.get(g);
    if (!s || !s.inputs.length) { nodes[i].row = leaf++; return nodes[i].row; }
    const rows = s.inputs.map((inp) => { const at = nodes.length; edges.push([i, at]); return walk(inp.id, col + 1, (need * inp.qty) / s.out.qty, i); });
    nodes[i].row = (Math.min(...rows) + Math.max(...rows)) / 2;
    return nodes[i].row;
  };
  if (ix.byId.has(id)) walk(id, 0, 1, null);
  return { nodes, edges, cols, rows: leaf };
}

/**
 * What a system can supply and which kinds of setup can make a good from its planets (`p0sOn`, `missingFor`, `canMake`, `CanMake`,
 * `CHAIN_P3_WHEN`) live in piPlan.ts, beside the setups whose rule they read: the planner held to one good says the same reasons
 * (Plan it), and piPlan can't import this file, which imports it. Re-exported here for the Chart.
 */
export { canMake, CHAIN_P3_WHEN, missingFor, p0sOn, type CanMake } from './piPlan';

/** Where a ranked setup makes a good: its planets that make it (that extract it, for a P0), how many a day, and whether it sells it. */
export type Making = { kind: SetupKind; planets: number[]; perDay: number; sold: boolean };

/** Each ranked setup that makes the good on one of its planets (a setup that couldn't be planned makes nothing), in the ranking's order. */
export function makingIn(setups: readonly Setup[], id: number): Making[] {
  const out: Making[] = [];
  for (const s of setups) {
    if (s.why != null) continue;
    const planets = new Set<number>();
    let perDay = 0;
    for (const r of s.roles) {
      if (r.does === 'unused') continue;
      const made = r.makes.filter((m) => m.id === id).reduce((n, m) => n + m.perDay, 0);
      const dug = r.extracts.filter((e) => e.p0 === id).reduce((n, e) => n + e.perHour * 24, 0);
      if (made > 0 || dug > 0) { planets.add(r.planetId); perDay += made + dug; }
    }
    if (planets.size) out.push({ kind: s.kind, planets: [...planets], perDay, sold: s.outputs.some((o) => o.id === id && shippedOutput(o)) });
  }
  return out;
}
