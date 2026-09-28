/**
 * Asset safety: when a structure holding your things is destroyed or you lose access, EVE wraps them up and, after
 * 20 days, delivers the wrap to the nearest low-sec station (high-sec from high-sec). From day 5 you can have it
 * delivered by hand to a station in the same system instead. Unpacking after an automatic delivery to another system
 * costs 15% of each item's estimated price; by hand within the system, 0.5% (EVE University's summary of CCP's
 * rules, checked 28 September 2026). ESI lists the wrap and what's in it, but not when it goes in or when it's
 * delivered: so the countdown comes from what the client shows, typed in once, or from when the cloud first saw
 * the wrap, when that was within the hour of it going in. Pure.
 */
import type { SafetyHolder, SafetyWrap } from './esiRecords';

export const MANUAL_DAYS = 5;
export const AUTO_DAYS = 20;
export const AUTO_FEE = 0.15;
export const MANUAL_FEE = 0.005;
const DAY = 86400_000;

/** A countdown as the client shows it ("14d 7h 24m 32s"), or typed near enough ("14d 7h", "3 h 5 m"): milliseconds. */
export function parseCountdown(text: string): number | null {
  const t = text.trim().toLowerCase();
  // Only numbers with d, h, m or s after them, and spaces: anything else isn't a countdown.
  if (!/^(\d+(\.\d+)?\s*[dhms]\s*)+$/.test(t)) return null;
  let ms = 0;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/g)) {
    ms += Number(m[1]) * ({ d: DAY, h: 3600_000, m: 60_000, s: 1000 } as const)[m[2] as 'd' | 'h' | 'm' | 's'];
  }
  return ms > 0 ? ms : null;
}

/** Time left the way the client says it: "14d 7h 24m 32s", dropping units that are zero from the front. */
export function formatCountdown(ms: number): string {
  if (!(ms > 0)) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts = [[d, 'd'], [h, 'h'], [m, 'm'], [sec, 's']] as const;
  const first = parts.findIndex(([v]) => v > 0);
  return parts.slice(first).map(([v, u]) => `${v}${u}`).join(' ');
}

export type SafetyTimes = {
  /** When it's delivered automatically, and from when it can be delivered by hand; null when unknown. */
  autoAt: number | null;
  manualAt: number | null;
  /** Where that came from: the countdown you typed, or the cloud having seen it go in. */
  from: 'typed' | 'seen' | null;
};

/** The wrap's dates: from the countdown you typed if any, else from when the cloud saw it go in, else unknown. */
export function safetyTimes(w: Pick<SafetyWrap, 'firstSeen' | 'startKnown'>, typed?: { autoAt: string } | null): SafetyTimes {
  if (typed && Number.isFinite(Date.parse(typed.autoAt))) {
    const autoAt = Date.parse(typed.autoAt);
    return { autoAt, manualAt: autoAt - (AUTO_DAYS - MANUAL_DAYS) * DAY, from: 'typed' };
  }
  if (w.startKnown && w.firstSeen) {
    const start = Date.parse(w.firstSeen);
    return { autoAt: start + AUTO_DAYS * DAY, manualAt: start + MANUAL_DAYS * DAY, from: 'seen' };
  }
  return { autoAt: null, manualAt: null, from: null };
}

/** What the wrap's items are worth at CCP's estimated prices, and what unpacking them costs either way. */
export function unpackCost(items: Record<number, number>, price: (typeId: number) => number | null | undefined) {
  let value = 0;
  const unpriced: number[] = [];
  for (const [id, q] of Object.entries(items)) {
    const p = price(Number(id));
    if (p != null && p > 0) value += p * q; else unpriced.push(Number(id));
  }
  return { value, auto: value * AUTO_FEE, manual: value * MANUAL_FEE, unpriced };
}

/**
 * A container or ship with everything in it: what it's worth at these prices (itself included; anything without a
 * price counts as nothing, as in `unpackCost`, and blueprint copies have none), how many things are inside it at any
 * depth (copies included), and whether any price was
 * found at all.
 */
export function holderWorth(h: SafetyHolder, price: (typeId: number) => number | null | undefined): { value: number; inside: number; priced: boolean } {
  let value = 0, inside = 0, priced = false;
  const own = price(h.typeId);
  if (own != null && own > 0) { value += own; priced = true; }
  // Blueprint copies count as things inside (listed in `contents`) but are worth nothing on the market.
  for (const [id, q] of Object.entries(h.items)) {
    const p = price(Number(id));
    if (p != null && p > 0) { value += p * q; priced = true; }
  }
  inside += h.contents ? h.contents.reduce((n, s) => n + s.q, 0) : Object.values(h.items).reduce((n, q) => n + q, 0);
  for (const c of h.holders ?? []) {
    const w = holderWorth(c, price);
    value += w.value; inside += 1 + w.inside; priced ||= w.priced;
  }
  return { value, inside, priced };
}
