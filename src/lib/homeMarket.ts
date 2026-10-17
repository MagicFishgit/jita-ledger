import type { StructureRow } from './bookFold';
import { withoutOwn } from './prospects';
import { ago, units } from './format';
import type { HomeQuote } from './industryRank';

/**
 * Home prices for the Industry tab (docs/notes/industry.md): Goonmetrics, a Goonswarm tool ("Goonmetrics © GARPA
 * 2012–2026") that gathers data from CCP and from members' client uploads, read by the cloud only (its API sends no CORS
 * header), gently, every six hours. Pure: the Worker parses with it and the browser reads what the Worker keeps.
 */

/** A home hub as the tab reads it: Goonmetrics' two, and any the cloud reads that you added. `short` names it beside the others. */
export type HomeHub = { id: number; name: string; short: string; systemId: number; region: number; regionName?: string; goonmetrics: boolean };
/** The hubs Goonmetrics tracks that the tab reads (its importing page, 9 October 2026). 1DQ1-A is left out: the research found almost nothing listed there. */
export const HOME_HUBS: readonly HomeHub[] = [
  // The Imperium's market at UALX-3 (the user, 10 October 2026: "1st Byzantigoon is probably the goons and therefor the imperium alliances market").
  { id: 1046664001931, name: 'UALX-3 - 1st Byzantigoon', short: 'UALX-3', systemId: 30004807, region: 10000061, regionName: 'Tenerifis', goonmetrics: true },
  // Goonswarm's staging.
  { id: 1049588174021, name: 'C-J6MT - Ceci n’est pas une keeptar', short: 'C-J6MT', systemId: 30000772, region: 10000009, regionName: 'Insmother', goonmetrics: true },
];
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

/** A structure's name beside the others: what follows its system's (UALX-3 - Mothership Bellicose is Mothership Bellicose). */
export const hubShort = (name: string): string => { const i = name.indexOf(' - '); const s = i > 0 ? name.slice(i + 3).trim() : ''; return s || name; };

/** Every hub the tab knows: Goonmetrics' two always (the cloud off, a version behind or failing too), then those you added that the cloud lists. */
export function hubsFrom(list: readonly HubState[] | null): HomeHub[] {
  return [...HOME_HUBS, ...(list ?? []).filter((h) => h.kept === 'added' && !h.off && !HOME_HUBS.some((g) => g.id === h.id))
    .map((h): HomeHub => ({ id: h.id, name: h.name, short: hubShort(h.name), systemId: h.systemId, region: h.regionId, goonmetrics: false }))];
}

/** A structure's own read speaks while under this old (the spec): it's read hourly, so one read missed still speaks. */
export const STRUCTURE_FRESH_MS = 2 * 3600_000;
export type HomeSpeaks = { source: 'structure' | 'goonmetrics'; at: string } | null;
/** Which price speaks at a hub: its own market's read while under two hours old, else Goonmetrics' (whatever its age, said), else none. */
export function homeSpeaks(book: { at: string } | null, gm: { at: string } | null, now: number): HomeSpeaks {
  if (book && now - Date.parse(book.at) < STRUCTURE_FRESH_MS) return { source: 'structure', at: book.at };
  return gm ? { source: 'goonmetrics', at: gm.at } : null;
}

/**
 * A hub's own read as it may speak: none for a default you switched to Nobody, since the cloud keeps its last read, which no longer
 * prices the hub. One rule for the finder (useHomeQuotes) and the section (HubLine).
 */
export const ownRead = <B>(book: B | null, state: Pick<HubState, 'off'> | null): B | null => (state?.off ? null : book);

/**
 * A type's quote from a structure's own read: its best sell and buy, its best sell levels (to buy a week's need up them) and what
 * its live orders sold (the split). The read held every order, so a type it lacks has none listed there, which is known (correction
 * 8). Weekly movement isn't in a structure's read: a Goonmetrics hub's figure is carried, labelled where it's said.
 */
export type HubOrder = { locationId: number; typeId: number; isBuy: boolean; price: number; volume: number; issued: string };
/**
 * Your orders that are in a hub's read of one type: that item's own, issued at or before the read. Prices carry four significant
 * figures, so another item's order at a level's price is ordinary and no part of it; `issued` moves on a reprice, so an order placed
 * or repriced after the read isn't in it (and is left alone, whatever its price).
 */
export const ordersInRead = (mine: readonly HubOrder[], typeId: number, readAt: string): HubOrder[] => mine.filter((o) => o.typeId === typeId && Date.parse(o.issued) <= Date.parse(readAt));
export function structureQuote(row: StructureRow | undefined, at: string, weekly: number | null, mine: readonly HubOrder[] = []): HomeQuote {
  // The read holds every order in the structure, yours included (ESI's orders carry no owner): your own come off the levels at their
  // exact prices, as `othersBook` does for Jita, so nothing is priced a tick under your own listing. An order whose price matches no
  // level (the read predates it) leaves the levels alone. `sold` stays as read, as Jita keeps its own.
  const sells = withoutOwn((row?.[1] ?? []).map(([price, volume]) => ({ price, volume })), mine.filter((o) => !o.isBuy));
  const buys = withoutOwn((row?.[0] ?? []).map(([price, volume]) => ({ price, volume })), mine.filter((o) => o.isBuy));
  return {
    sell: sells[0]?.price ?? null, buy: buys[0]?.price ?? null, weekly, at, source: 'structure',
    sells,
    ...(row ? { sold: { sell: row[4][0], buy: row[4][1], single: { sell: row[4][2], buy: row[4][3] }, orders: { sell: row[3], buy: row[2] } } } : {}),
  };
}

/**
 * A hub's read or price as an age: minutes up to 2 h 59, so an age at or near two hours (the rule's edge) never reads "2 h ago" on
 * both sides of it; the shared `ago` beyond.
 */
export function homeAgo(iso: string, now: number): string {
  const s = (now - Date.parse(iso)) / 1000;
  if (!(s >= 60)) return ago(iso, now);
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  if (m < 180) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''} ago`;
  return ago(iso, now);
}

/** How long the browser keeps a hub's own read: until the next hourly read could land (its `at` + an hour + a margin), 5 to 15 minutes. */
export function bookHoldMs(at: string | null, now: number): number {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return HOME_HOLD_MAX_MS;
  return Math.max(HOME_HOLD_MIN_MS, Math.min(HOME_HOLD_MAX_MS, t + 3600_000 + HOME_HOLD_MARGIN_MS - now));
}

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

/**
 * A hub's own market as a sentence, every state in its own words (spec, "Every state"): a reader whose login can't read it (no
 * permission, refused, none kept, not one of yours any more: each with where to fix it), not read yet, refused by the structure's
 * access list (and what stands in), failing, or read (by whom, when). `gm`: Goonmetrics tracks the hub, so its prices stand in, and
 * its refusal reads calmly ("Owner isn't on UALX-3's access list yet": Ruling 1). Goonmetrics' two are named UALX-3 and C-J6MT, a hub
 * you added by its structure's name (Ruling 2). A try by an earlier reader says nothing of this one's: only its last good read is said.
 */
export function ownMarketSaid(h: HubState, now: number, gm: boolean | 'tracked'): string {
  const name = hubOf(h.id)?.short ?? hubShort(h.name);
  const who = h.readerIsMain ? 'you' : h.readerName ?? `Character ${h.reader}`;
  // A default hub's refusal names the character, yours by your name, and reads calmly (Ruling 1).
  const named = h.readerName ?? (h.readerIsMain ? 'Your character' : `Character ${h.reader}`);
  const login = h.readerIsMain ? 'your login' : `${who}’s login`;
  if (h.off) return `Its own market isn’t read with a character${gm === true ? ': Goonmetrics’ prices only' : gm === 'tracked' ? '' : ': nothing prices it'}.`;
  if (h.login === 'notYours') return `Its own market’s reader, ${who}, isn’t one of your characters any more: pick another.`;
  if (h.login === 'none') return h.readerIsMain ? 'Its own market is read with your login, which the cloud doesn’t hold: hand it over under Settings → Your data.'
    : `Its own market is read with ${who}’s login, which the cloud doesn’t hold: hand it over on Characters.`;
  if (h.login === 'refused') return h.readerIsMain ? 'EVE refused the cloud’s login for you, which reads its own market: hand it over again under Settings → Your data.'
    : `EVE refused the cloud’s login for ${who}, which reads its own market: hand it over again on Characters.`;
  // The main's own cloud login without the permission is every hub's state from the deploy until it's handed over: a login to hand
  // over again, never a failure or a refusal (Review Focus 4).
  if (h.login === 'permission') return `Reading its own market needs EVE’s permission for structure markets: ${h.readerIsMain
    ? 'log in again here, then hand the cloud your login again (Settings → Your data)' : `hand the cloud ${who}’s login again on Characters`}.`;
  const b = h.book && h.book.reader === h.reader ? h.book : null;
  // The last good read, and whose it was (`readBy`, the read's, not the last try's) when that isn't this reader's.
  const last = h.book?.at ? ` The last good read was ${homeAgo(h.book.at, now)}${h.book.readBy != null && h.book.readBy !== h.reader && h.book.readByName ? `, with ${h.book.readByName}’s login` : ''}.` : '';
  if (!b) return `Its own market isn’t read yet: the cloud reads it hourly with ${login}.${last}`;
  // "Stand in" only where Goonmetrics' prices really do (`gm === true`: read and not switched off); where it tracks the hub but isn't
  // read, the refusal ends there (Ruling 3 of the fix round).
  if (b.refusedAt) return gm
    ? `${named} isn’t on ${name}’s access list yet (first refused ${homeAgo(b.refusedAt, now)})${gm === true ? ': Goonmetrics’ prices stand in' : ''}.${last}`
    : `EVE refused ${h.readerIsMain ? 'your' : `${who}’s`} read of ${name}: it isn’t on its access list (first refused ${homeAgo(b.refusedAt, now)}). Nothing stands in: Goonmetrics doesn’t track it.${last}`;
  // The Worker's words start a sentence: lower-cased inside this one, unless they start with an acronym (ESI).
  const why = /^[A-Z]{2}/.test(b.error ?? '') ? b.error : `${(b.error ?? '').charAt(0).toLowerCase()}${(b.error ?? '').slice(1)}`;
  if (b.error) return `Its own market’s last read, ${homeAgo(b.tried, now)}, failed (${why}).${b.at ? last : ' Nothing has been read yet.'}`;
  // A read has a time and, with it, its types and pages; a read with neither count says only when.
  return `Its own market was read ${homeAgo(b.at ?? b.tried, now)} with ${login}${b.types != null ? `: ${units(b.types)} of the watched items listed there${b.pages ? ` (${units(b.pages)} page${b.pages === 1 ? '' : 's'})` : ''}` : ''}.`;
}
