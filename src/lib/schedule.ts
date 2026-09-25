import type { Meta } from './types';

/** Never ask again this soon, whatever the headers claim. Guards against a past or skewed Expires. */
export const MIN_GAP_MS = 60_000;
/** Used only when ESI never told us when to come back. */
export const FALLBACK_MS = 15 * 60_000;

/**
 * Is it worth asking ESI again yet?
 *
 * ESI caches server-side and hands back an Expires telling you when it will have something new.
 * Asking before then returns the identical body, so the schedule follows that moment rather than a
 * timer of our own --- a fixed 15-minute poll lands up to 15 minutes late on top of the hour ESI
 * holds wallet transactions for.
 */
export function dueForSync(meta: Pick<Meta, 'lastSync' | 'nextSyncAt'>, now = Date.now()): boolean {
  const last = meta.lastSync ? Date.parse(meta.lastSync) : 0;
  if (!Number.isFinite(last)) return true;
  if (now - last < MIN_GAP_MS) return false;
  const next = meta.nextSyncAt ? Date.parse(meta.nextSyncAt) : NaN;
  return now >= (Number.isFinite(next) ? next : last + FALLBACK_MS);
}
