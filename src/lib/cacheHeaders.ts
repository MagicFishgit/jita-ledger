/**
 * When ESI's copy of an answer lets go, from its headers. ESI has always said so in Expires, and the app times its reads
 * by it (the next sync, the book cache, the cloud's stored history). On 27 January 2026 CCP began moving routes to
 * caches cleared when something happens (a skill finishing), where "the `Expires` header is no longer meaningful" and
 * clients should "use the `Cache-Control` header"; only skills and the skill queue so far, more to come. Market routes
 * still answer `cache-control: public` with Expires on their old cycle (checked 29 September 2026). So, as HTTP has it:
 * a max-age wins (less any Age); no-cache or no-store says no time at all, and the caller's own fallback applies (the
 * browser revalidates by ETag); otherwise Expires, as a time-to-live off ESI's own Date, so a skewed clock can't move it.
 * Pure.
 */
export type HeaderLike = { get(name: string): string | null };

export function cacheUntil(h: HeaderLike, now = Date.now()): number | null {
  const cc = (h.get('Cache-Control') ?? '').toLowerCase();
  if (/\b(no-cache|no-store)\b/.test(cc)) return null;
  const m = /(?:^|[\s,])max-age=(\d+)/.exec(cc);
  if (m) {
    const ttl = Number(m[1]) - (Number(h.get('Age') ?? 0) || 0);
    return ttl > 0 ? now + ttl * 1000 : null;
  }
  const exp = Date.parse(h.get('Expires') ?? '');
  if (!Number.isFinite(exp)) return null;
  const svr = Date.parse(h.get('Date') ?? '');
  return Number.isFinite(svr) ? now + (exp - svr) : exp;
}

/**
 * ESI's rate-limit headers: the group, what's left and the limit. Market orders have had one since 24 February 2026
 * ("market-order", 12,000 tokens per 15 minutes, a 2xx costing 2), counted per IP when unauthenticated, so the cloud
 * logs the lowest it saw each run: whether its IP is shared with anyone else is unknown.
 */
export function rateLimitOf(h: HeaderLike): { group: string; remaining: number; limit: string } | null {
  const group = h.get('X-Ratelimit-Group'), left = h.get('X-Ratelimit-Remaining');
  if (!group || left == null || !Number.isFinite(Number(left))) return null;
  return { group, remaining: Number(left), limit: h.get('X-Ratelimit-Limit') ?? '' };
}
