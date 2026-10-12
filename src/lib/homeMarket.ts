import type { HomeQuote } from './industryRank';
import type { StructureRow } from './bookFold';

/**
 * Home prices for the Industry tab (docs/notes/industry.md): Goonmetrics, a Goonswarm tool ("Goonmetrics © GARPA
 * 2012–2026") that gathers data from CCP and from members' client uploads, read by the cloud only (its API sends no CORS
 * header), gently, every six hours. Pure: the Worker parses with it and the browser reads what the Worker keeps.
 */

/** The hubs Goonmetrics tracks that the tab reads (its importing page, 9 October 2026). 1DQ1-A is left out: the research found almost nothing listed there. */
export const HOME_HUBS = [
  // The Imperium's market at UALX-3 (the user, 10 October 2026: "1st Byzantigoon is probably the goons and therefor the imperium alliances market").
  { id: 1046664001931, name: 'UALX-3 - 1st Byzantigoon', short: 'UALX-3', systemId: 30004807, region: 10000061, regionName: 'Tenerifis' },
  // Goonswarm's staging.
  { id: 1049588174021, name: 'C-J6MT - Ceci n’est pas une keeptar', short: 'C-J6MT', systemId: 30000772, region: 10000009, regionName: 'Insmother' },
] as const;
export type HomeHub = (typeof HOME_HUBS)[number];
export const hubOf = (id: number | null | undefined): HomeHub | null => HOME_HUBS.find((h) => h.id === id) ?? null;

/** Home prices older than this say so with their time. */
export const HOME_STALE_MS = 24 * 3600_000;

/** How old a hub's row may be before the cloud reads it again (the Worker's round), and how long the browser holds a read of it. */
export const HOME_REFRESH_MS = 6 * 3600_000;
export const HOME_HOLD_MAX_MS = 15 * 60_000;
/** A read already due again is still held this long, so a mount doesn't fetch the ~130 KB row each time. */
export const HOME_HOLD_MIN_MS = 5 * 60_000;
/** The margin after a hub's next refresh could land (the hourly cron fires at :37 and the read takes about two minutes). */
export const HOME_HOLD_MARGIN_MS = 10 * 60_000;
/**
 * How long the browser keeps a read of a hub's prices: until the cloud's next refresh could have replaced it (its `at` plus
 * HOME_REFRESH_MS plus a margin) or 15 minutes, whichever is sooner, but at least 5. A read with no time is kept 15 minutes.
 */
export function homeHoldMs(at: string | null, now: number): number {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return HOME_HOLD_MAX_MS;
  return Math.max(HOME_HOLD_MIN_MS, Math.min(HOME_HOLD_MAX_MS, t + HOME_REFRESH_MS + HOME_HOLD_MARGIN_MS - now));
}

/** One type's prices at a hub as kept: its `updated`, weekly movement, best buy and units listed, best sell and units listed; null where not known or none. */
export type HomeRow = [updated: string, weekly: number | null, buy: number | null, buyListed: number, sell: number | null, sellListed: number];

/**
 * Goonmetrics' `/api/price_data/` XML, by type. A type with no data reads `weekly_movement` −1.0 (not known: null), and a
 * side with no orders reads 0.00 with 0 listed (none: null), never a price or pace of 0. Read with a pattern a `<type>` at a
 * time: Workers have no DOMParser.
 */
export function parseGoonmetrics(xml: string): Record<number, HomeRow> {
  const out: Record<number, HomeRow> = {};
  // A blank field is not known, never 0 (Number('') is 0).
  const num = (block: string, re: RegExp) => { const s = re.exec(block)?.[1].trim(); const n = s ? Number(s) : NaN; return Number.isFinite(n) ? n : null; };
  for (const m of xml.matchAll(/<type\s+id="(\d+)"[^>]*>([\s\S]*?)<\/type>/g)) {
    const t = Number(m[1]), b = m[2];
    const updated = /<updated>([^<]+)<\/updated>/.exec(b)?.[1] ?? '';
    const weekly = num(b, /<weekly_movement>([^<]+)<\/weekly_movement>/);
    const buy = /<buy>([\s\S]*?)<\/buy>/.exec(b)?.[1] ?? '', sell = /<sell>([\s\S]*?)<\/sell>/.exec(b)?.[1] ?? '';
    const max = num(buy, /<max>([^<]+)<\/max>/), buyListed = num(buy, /<listed>([^<]+)<\/listed>/) ?? 0;
    const min = num(sell, /<min>([^<]+)<\/min>/), sellListed = num(sell, /<listed>([^<]+)<\/listed>/) ?? 0;
    out[t] = [updated, weekly != null && weekly >= 0 ? weekly : null, max != null && max > 0 && buyListed > 0 ? max : null, buyListed, min != null && min > 0 && sellListed > 0 ? min : null, sellListed];
  }
  return out;
}

/** A type's kept row as the finder reads it (industryRank's HomeQuote); null when the hub's read doesn't have it. */
export const homeQuote = (row: HomeRow | undefined): HomeQuote | null => (row ? { sell: row[4], buy: row[2], weekly: row[1], at: row[0] } : null);

/** Whether a reader's login, as the cloud keeps it, can read a structure's market: worked out from the cloud's keys, never by asking EVE. */
export type HubLogin = 'ok' | 'permission' | 'refused' | 'none' | 'notYours';
/** A hub's own market as the cloud last read it: the last good read (`at`, null before one, and whose it was: `readBy`) and the last try (when, whose, why it failed). */
export type HubBook = { at: string | null; tried: string; error: string | null; refusedAt: string | null; pages: number | null; types: number | null; reader: number | null; readerName: string | null; readBy: number | null; readByName: string | null };
/**
 * A home market as `GET /v1/home/markets` gives it (worker/src/homeMarkets.ts): Goonmetrics' two (`default`, read with the main
 * unless you chose otherwise, `off` when you stopped reading one) and those you added; its reader, whether that login can read it,
 * and its own reads (null before the first try).
 */
export type HubState = {
  id: number; name: string; systemId: number; regionId: number; kept: 'default' | 'added'; off: boolean;
  reader: number; readerName: string | null; readerIsMain: boolean; login: HubLogin; book: HubBook | null;
};
/** `GET /v1/home/book?hub=`: a hub's last good read of its own market, or null before one. */
export type HomeBookAnswer = { hub: number; at: string; rows: Record<string, StructureRow> } | null;
