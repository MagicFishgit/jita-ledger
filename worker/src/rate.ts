import { rateLimitOf, type HeaderLike } from '../../src/lib/cacheHeaders';

/** The lowest rate-limit budget left per ESI group since the last report, for the log. */
const low = new Map<string, { remaining: number; limit: string }>();

export function noteRate(h: HeaderLike): void {
  const r = rateLimitOf(h);
  if (!r) return;
  const was = low.get(r.group);
  if (!was || r.remaining < was.remaining) low.set(r.group, { remaining: r.remaining, limit: r.limit });
}

/** What was left at the lowest, per group, since the last call ("market-order: 11,500 left of 12000/15m"); null if nothing said. */
export function rateReport(): Record<string, string> | null {
  if (!low.size) return null;
  const out = Object.fromEntries([...low].map(([g, r]) => [g, `${r.remaining} left of ${r.limit}`]));
  low.clear();
  return out;
}
