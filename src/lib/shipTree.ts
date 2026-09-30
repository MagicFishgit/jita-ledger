/**
 * A progression tree of ships, as the Mining, Abyssal and Hauling pages draw it: every hull a node on a grid (column: how
 * far along; row: which lane), paths between them, and each node's state for you. Pure.
 */

export type TreeNode = {
  id: number;
  /** Column (left to right: how far along) and row in the chart. */
  col: number; row: number;
  lane: string;
  /** What it's for, in a line. */
  role: string;
  /** Only where it makes sense: a limit, a warning, where to find it. */
  note?: string;
};

export type NodeState = 'here' | 'flyable' | 'close' | 'locked';

/**
 * A hull's state for you: `here` when it's the ship you're in (or the one the page knows you use), `flyable` when every
 * skill it needs is trained, `close` when the missing ones are in your queue, else `locked`.
 */
export function nodeState(
  needs: { skill: number; level: number }[] | undefined, skills: Record<number, number> | undefined,
  queued: (skill: number, level: number) => boolean, isHere: boolean,
): NodeState {
  if (isHere) return 'here';
  if (!needs || !skills) return 'locked';
  const missing = needs.filter((n) => (skills[n.skill] ?? 0) < n.level);
  if (!missing.length) return 'flyable';
  return missing.every((n) => queued(n.skill, n.level)) ? 'close' : 'locked';
}

/**
 * How a path is drawn, in grid units (a node's centre is its column and row plus a half): straight out of one node, an S
 * round the midpoint between their columns, straight into the other. The S takes the whole way when the rows are one
 * apart and tightens as they grow further apart, so a long drop stays in the gap between columns rather than cutting
 * across the corners of the nodes beside it (Venture → Venture Consortium Issue clipped the Pioneer's).
 */
export function edgeShape(a: { col: number; row: number }, b: { col: number; row: number }) {
  const x1 = a.col + 0.5, y1 = a.row + 0.5, x2 = b.col + 0.5, y2 = b.row + 0.5, m = (x1 + x2) / 2;
  const w = ((x2 - x1) / 2) / Math.max(1, Math.abs(b.row - a.row));
  return { x1, y1, x2, y2, m, xa: m - w, xb: m + w };
}

/**
 * What's wrong with a tree's layout, as ShipTree draws it: two nodes in one place, a path to a node that isn't there, or a
 * path drawn behind a node it doesn't join (which reads as passing through it: Gila → Vagabond once ran behind Cerberus).
 * This walks each path (`edgeShape`) in grid units against every other node's box: 91% of a column wide, and about 0.22
 * of a row high at the chart's narrowest (a node is ~46 px tall on a row 168 × 0.68 px high). Empty means none.
 */
export function treeProblems(nodes: TreeNode[], edges: [number, number][]): string[] {
  const out: string[] = [];
  const at = new Map<string, number>();
  for (const n of nodes) {
    const k = `${n.col},${n.row}`;
    if (at.has(k)) out.push(`${at.get(k)} and ${n.id} both at ${k}`);
    at.set(k, n.id);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const [a, b] of edges) {
    const A = byId.get(a), B = byId.get(b);
    if (!A || !B) { out.push(`path ${a} → ${b} names a node that isn't there`); continue; }
    const { x1, y1, x2, y2, m, xa, xb } = edgeShape(A, B);
    const points: [number, number][] = [];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100, u = 1 - t;
      points.push([x1 + (xa - x1) * t, y1], [xb + (x2 - xb) * t, y2],
        [u * u * u * xa + 3 * u * u * t * m + 3 * u * t * t * m + t * t * t * xb, u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2]);
    }
    const hit = new Set<number>();
    for (const [x, y] of points) {
      for (const n of nodes) {
        if (n.id === a || n.id === b || hit.has(n.id)) continue;
        if (Math.abs(x - (n.col + 0.5)) < 0.455 && Math.abs(y - (n.row + 0.5)) < 0.22) hit.add(n.id);
      }
    }
    for (const n of hit) out.push(`path ${a} → ${b} runs behind ${n}`);
  }
  return out;
}
