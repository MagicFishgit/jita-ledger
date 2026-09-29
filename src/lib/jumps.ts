/**
 * Jumps across New Eden's stargates, worked out here rather than asked of ESI one route at a time: the Freelance tab
 * needs the distance from Jita to hundreds of systems (every job's broadcast systems and offices). The map comes from
 * CCP's static data (src/data/universeGraph.json, scripts/universe-graph.mjs): each system with a gate, its security, its
 * name and where its gates lead. Pure.
 */
export type Graph = Record<string, [security: number, name: string, next: number[]]>;

/** High-sec as the game shows it: a security of 0.45 and up rounds to 0.5. */
export const HIGH_SEC = 0.45;

/** Jumps from one system to every system reachable through those `ok` allows (the start always counts). */
export function jumpsFrom(g: Graph, from: number, ok: (id: number, security: number) => boolean = () => true): Map<number, number> {
  const out = new Map<number, number>([[from, 0]]);
  let frontier = [from];
  while (frontier.length) {
    const next: number[] = [];
    for (const s of frontier) {
      const d = out.get(s)! + 1;
      for (const n of g[s]?.[2] ?? []) {
        if (out.has(n)) continue;
        const sys = g[n];
        if (!sys || !ok(n, sys[0])) continue;
        out.set(n, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

/** The three views of the map the Freelance tab needs from Jita: any route, high-sec only, and high-sec avoiding the gank systems. */
export type Reach = { any: Map<number, number>; high: Map<number, number>; safe: Map<number, number> };

export function reachFrom(g: Graph, from: number, gankNames: string[]): Reach {
  const gank = new Set(Object.entries(g).filter(([, v]) => gankNames.includes(v[1])).map(([k]) => Number(k)));
  return {
    any: jumpsFrom(g, from),
    high: jumpsFrom(g, from, (_, sec) => sec >= HIGH_SEC),
    safe: jumpsFrom(g, from, (id, sec) => sec >= HIGH_SEC && !gank.has(id)),
  };
}

/**
 * How a system is reached from Jita: the high-sec jumps (null when there's no route that stays in high-sec), and whether
 * that shortest route runs through Uedama or Sivala, with how many more jumps it takes to go round them (null when you
 * can't).
 */
export function routeTo(r: Reach, system: number): { jumps: number | null; anyJumps: number | null; throughGank: boolean; aroundExtra: number | null } {
  const high = r.high.get(system) ?? null, safe = r.safe.get(system) ?? null;
  return {
    jumps: high, anyJumps: r.any.get(system) ?? null,
    throughGank: high != null && (safe == null || safe > high),
    aroundExtra: high != null && safe != null && safe > high ? safe - high : null,
  };
}
