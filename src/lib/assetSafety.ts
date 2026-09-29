/**
 * Asset safety: when a structure holding your things is destroyed or you lose access, EVE wraps them up and, after
 * 20 days, delivers the wrap to the nearest low-sec station (high-sec from high-sec). From day 5 you can have it
 * delivered by hand to a station in the same system instead. Unpacking after an automatic delivery to another system
 * costs 15% of each item's estimated price; by hand within the system, 0.5% (EVE University's summary of CCP's
 * rules, checked 28 September 2026). ESI lists the wrap and what's in it, but not when it goes in or when it's
 * delivered: so the countdown comes from what the client shows, typed in once, or from when the cloud first saw
 * the wrap, when that was within the hour of it going in, or, with the notifications permission, from the notification
 * EVE sends when things go in (`parseSafetyNotice`), which has the dates to the second. Pure.
 */
import type { SafetyHolder, SafetyNotice, SafetyWrap } from './esiRecords';

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
  /** Where that came from: EVE's notification, the countdown you typed, or the cloud having seen it go in. */
  from: 'notice' | 'typed' | 'seen' | null;
};

/** The wrap's dates: from EVE's notification, else the countdown you typed, else when the cloud saw it go in. */
export function safetyTimes(w: Pick<SafetyWrap, 'firstSeen' | 'startKnown' | 'notice'>, typed?: { autoAt: string } | null): SafetyTimes {
  const na = Date.parse(w.notice?.autoAt ?? ''), nm = Date.parse(w.notice?.manualAt ?? '');
  if (Number.isFinite(na) && Number.isFinite(nm)) return { autoAt: na, manualAt: nm, from: 'notice' };
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

/** Windows FILETIME (100 ns ticks since 1601), which the notification's timestamps are in, as a JavaScript time. */
export const fromFiletime = (ticks: number): number => ticks / 10_000 - 11_644_473_600_000;

/**
 * EVE's `StructureItemsMovedToSafety` notification, read. Its text is YAML (fields as the goesi library declares them):
 * assetSafetyFullTimestamp and assetSafetyMinimumTimestamp in FILETIME ticks, newStationID, solarsystemID, structureID,
 * structureLink (the structure's name, in a showinfo link), isCorpOwned. A corporation's wrap isn't one of your assets,
 * and anything that doesn't read as a date this century is refused rather than guessed at.
 */
export function parseSafetyNotice(n: { type: string; timestamp: string; text?: string }): SafetyNotice | null {
  if (n.type !== 'StructureItemsMovedToSafety' || !n.text) return null;
  const field = (k: string) => {
    const m = new RegExp(String.raw`^${k}:[ \t]*(?:&\w+[ \t]+)?(.*)$`, 'm').exec(n.text!);
    return m ? m[1].trim().replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1') : null;
  };
  if (field('isCorpOwned') === 'true') return null;
  const full = Number(field('assetSafetyFullTimestamp')), min = Number(field('assetSafetyMinimumTimestamp'));
  if (!(full > 0)) return null;
  const autoAt = fromFiletime(full);
  const manualAt = min > 0 ? fromFiletime(min) : autoAt - (AUTO_DAYS - MANUAL_DAYS) * DAY;
  if (!(autoAt > Date.UTC(2003, 0, 1) && autoAt < Date.UTC(2100, 0, 1))) return null;
  const num = (k: string) => { const v = Number(field(k)); return Number.isFinite(v) && v > 0 ? v : undefined; };
  const link = field('structureLink') ?? '';
  const structure = (/>([^<]+)</.exec(link)?.[1] ?? (/[<>]/.test(link) ? '' : link)).trim() || undefined;
  const out: SafetyNotice = { at: n.timestamp, manualAt: new Date(manualAt).toISOString(), autoAt: new Date(autoAt).toISOString() };
  const structureId = num('structureID'), systemId = num('solarsystemID'), stationId = num('newStationID');
  if (structureId) out.structureId = structureId;
  if (structure) out.structure = structure;
  if (systemId) out.systemId = systemId;
  if (stationId) out.stationId = stationId;
  return out;
}

/**
 * Notices paired with the wraps waiting for delivery. ESI doesn't say which wrap a notice is about (the wrap sits at
 * location 2004 with no name), so: one still to be delivered (not past its date by more than two days) per waiting wrap
 * without one, in the order they went in (item IDs rise over time, as notices do) when the counts match; else only a
 * wrap the cloud saw appear within three hours after a notice. A wrap keeps its notice, and takes the structure's name.
 */
export function withNotices(wraps: SafetyWrap[] | undefined, notices: SafetyNotice[], now: number): SafetyWrap[] | undefined {
  if (!wraps?.length || !notices.length) return wraps;
  const has = new Set(wraps.flatMap((w) => (w.notice ? [w.notice.at] : [])));
  const live = notices.filter((n) => !has.has(n.at) && Date.parse(n.autoAt) > now - 2 * DAY).sort((a, b) => a.at.localeCompare(b.at));
  const waiting = wraps.filter((w) => w.state === 'waiting' && !w.notice).sort((a, b) => a.id - b.id);
  const pairs = new Map<number, SafetyNotice>();
  if (waiting.length && waiting.length === live.length) waiting.forEach((w, i) => pairs.set(w.id, live[i]));
  else {
    const used = new Set<SafetyNotice>();
    for (const w of waiting) {
      if (!w.firstSeen) continue;
      const seen = Date.parse(w.firstSeen);
      const n = live.find((x) => !used.has(x) && seen - Date.parse(x.at) >= 0 && seen - Date.parse(x.at) <= 3 * 3600_000);
      if (n) { pairs.set(w.id, n); used.add(n); }
    }
  }
  if (!pairs.size) return wraps;
  return wraps.map((w) => {
    const n = pairs.get(w.id);
    return n ? { ...w, notice: n, ...(w.name || !n.structure ? {} : { name: n.structure }) } : w;
  });
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
