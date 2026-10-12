/**
 * Home markets for the Industry tab (docs/notes/industry.md, stage 4): a structure's own market, read hourly by the cloud with the
 * login of the character you pick (the hub's reader), for the watch set's types only. Goonmetrics' two hubs are read with the main
 * unless you chose otherwise (home_markets holds every choice); any hub you add needs a reader. One home_books row a structure:
 * the last good read apart from the last try. A read cut short, or with a page failed, is never stored: a structure's pages are
 * shuffled by type, so part of them would price every type wrong. Last on the `37` cron with a deadline of its own; not a watched
 * job (a hub refused until the user is accepted would mail daily, and the tab says each hub's state).
 */
import INDUSTRY from '../../src/data/industryTypes.json' with { type: 'json' };
import { foldStructurePage, structureSummary, type Agg, type RawOrder, type StructureRow } from '../../src/lib/bookFold';
import { HOME_HUBS, type HomeBookAnswer, type HubLogin, type HubState } from '../../src/lib/homeMarket';
import { onRoster } from './alts';
import { altPurpose, altReader, EveError, esiGet, HEADERS, ledgerReader, readerLogin, type Reader } from './eve';
import { BadRequest } from './sync';

export const SCOPE_STRUCTURE_MARKETS = 'esi-markets.structure_markets.v1';
/**
 * A hub is read again once its last try is this old: hourly, on a cron at :37. `tried` is stamped when the step reaches the hub, about
 * a minute past :37 on an ordinary hour and up to about 13½ on the worst (the alts' read, Goonmetrics and the copy round run ahead of
 * it, and no page starts past 14 minutes). A hub stamped at :50:30 is only 47.5 minutes old when the next hour's step starts at :38,
 * so 50 would skip it and read it two hours on, in exactly the hour that cut it short. The deadline bounds that variance and the cron
 * is hourly, so 45 can neither skip a hub nor read one twice in an hour.
 */
export const BOOK_DUE_MS = 45 * 60_000;
/** No page is asked for past this from the cron's time: the invocation stops at 15 minutes. */
export const BOOKS_BUDGET_MS = 14 * 60_000;
/** A market over this many pages isn't read at all: part of one is never stored. */
export const MAX_PAGES = 300;
/** Hubs added a ledger, besides Goonmetrics' two: each is a read an hour. */
export const MAX_ADDED = 10;
const PAGE_TIMEOUT_MS = 20_000;
const ESI = 'https://esi.evetech.net';
const WATCH: ReadonlySet<number> = new Set((INDUSTRY as { watch: number[] }).watch);

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string };
export type Hub = { id: number; name: string; systemId: number; regionId: number; reader: number; kept: 'default' | 'added'; off: boolean };
const iso = (t: number) => new Date(t).toISOString();
const isStructure = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1e12;

/** A ledger's hubs: Goonmetrics' two (read with the main unless a row says otherwise), then every hub added and not removed. */
export async function hubsOf(db: D1Database, ledger: number): Promise<Hub[]> {
  const rows = (await db.prepare('SELECT structure_id AS id, name, system_id AS systemId, region_id AS regionId, reader, removed_at AS removedAt FROM home_markets WHERE ledger = ?1 ORDER BY added_at, structure_id')
    .bind(ledger).all<{ id: number; name: string; systemId: number; regionId: number; reader: number; removedAt: number | null }>()).results;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return [
    ...HOME_HUBS.map((h): Hub => { const r = byId.get(h.id); return { id: h.id, name: h.name, systemId: h.systemId, regionId: h.region, reader: r?.reader ?? ledger, kept: 'default', off: r?.removedAt != null }; }),
    ...rows.filter((r) => r.removedAt == null && !HOME_HUBS.some((h) => h.id === r.id))
      .map((r): Hub => ({ id: r.id, name: r.name, systemId: r.systemId, regionId: r.regionId, reader: r.reader, kept: 'added', off: false })),
  ];
}

/** Whether a reader's login can read a structure's market, from what the cloud keeps: one of yours, a login kept, not refused, the permission held. */
async function loginOf(db: D1Database, ledger: number, reader: number): Promise<HubLogin> {
  if (reader !== ledger && !(await onRoster(db, ledger, reader))) return 'notYours';
  const k = await db.prepare('SELECT scopes, refused_at AS refusedAt FROM keys WHERE char_id = ?1 AND purpose = ?2')
    .bind(ledger, reader === ledger ? 'main' : altPurpose(reader)).first<{ scopes: string; refusedAt: number | null }>();
  if (!k) return 'none';
  if (k.refusedAt != null) return 'refused';
  return k.scopes.split(' ').includes(SCOPE_STRUCTURE_MARKETS) ? 'ok' : 'permission';
}

/**
 * One page of a structure's market with the reader's token. A 502 to 504 is tried twice more, as esiGet does, but never past the
 * round's deadline: a page asked just before it still ends within its own 20 s, inside the invocation's 15 minutes.
 */
async function page(structure: number, p: number, token: string, deadline = Infinity): Promise<{ orders: RawOrder[]; pages: number }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${ESI}/markets/structures/${structure}/?page=${p}`, { headers: { ...HEADERS, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    if (res.ok) return { orders: (await res.json()) as RawOrder[], pages: Number(res.headers.get('X-Pages') ?? 1) || 1 };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if ([502, 503, 504].includes(res.status) && attempt < 2 && Date.now() + 1500 < deadline) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    throw new EveError(res.status, `ESI ${res.status}${body.error ? `: ${body.error}` : ''}`);
  }
}

export type BookRead = { done: 'read'; pages: number; types: number } | { done: 'refused' | 'failed' | 'cut'; error: string } | { done: 'skipped'; login: HubLogin } | { done: 'later' };

/**
 * Reads one hub's market with its reader's login. A login that can't read it is skipped before EVE is asked (the list says why from
 * the keys); a 403 is the structure refusing this reader (not on its access list), dated from the first refusal in a row by the
 * same reader; anything else that stops the read is stamped with why, and the last good read stands. `want` is for the tests.
 */
export async function readHomeBook(env: Env, ledger: number, hub: { id: number; reader: number }, o: { now?: number; deadline?: number; want?: ReadonlySet<number> } = {}): Promise<BookRead> {
  const db = env.DB, now = o.now ?? Date.now(), deadline = o.deadline ?? Infinity, want = o.want ?? WATCH;
  const login = await loginOf(db, ledger, hub.reader);
  if (login !== 'ok') return { done: 'skipped', login };
  if (Date.now() > deadline) return { done: 'later' };
  const who: Reader = hub.reader === ledger ? ledgerReader(ledger) : altReader(ledger, hub.reader);
  let token: string;
  try {
    const l = await readerLogin(env, who);
    if (!l) return { done: 'skipped', login: 'none' };
    token = l.access;
  } catch (e) {
    // useLogin has marked the login refused (keys.refused_at): the list says so from there.
    if (e instanceof EveError && (e.status === 400 || e.status === 401)) return { done: 'skipped', login: 'refused' };
    throw e;
  }
  // A try that stored nothing: its time, its reader and why. `refused` dates a run of refusals by one reader from its first; a
  // failure of another kind says nothing of access and keeps it; another reader starts afresh.
  const stamp = async (error: string, refused: boolean) => {
    await db.prepare(`INSERT INTO home_books (structure_id, tried, reader, error, refused_at) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(structure_id) DO UPDATE SET tried = excluded.tried, error = excluded.error,
        refused_at = CASE WHEN home_books.reader IS NOT excluded.reader THEN excluded.refused_at
          WHEN excluded.refused_at IS NULL THEN home_books.refused_at ELSE COALESCE(home_books.refused_at, excluded.refused_at) END,
        reader = excluded.reader`).bind(hub.id, now, hub.reader, error, refused ? now : null).run();
  };
  const aggs = new Map<number, Agg>();
  let p = 1, pages = 1;
  try {
    const first = await page(hub.id, 1, token, deadline);
    pages = first.pages;
    if (pages > MAX_PAGES) {
      const error = `Its market runs to ${pages} pages, more than the ${MAX_PAGES} the cloud reads in one go`;
      await stamp(error, false);
      return { done: 'failed', error };
    }
    foldStructurePage(aggs, first.orders, want);
    for (p = 2; p <= pages; p++) {
      if (Date.now() > deadline) {
        const error = `Cut short at page ${p} of ${pages} by the cloud’s time limit`;
        await stamp(error, false);
        return { done: 'cut', error };
      }
      // The token is asked for again before each page: `useLogin` may hand back one with only two minutes left, and a read of a
      // hundred pages outlasts that. ESI answers an expired token with a 403, which would be stamped as the structure refusing this
      // reader. It returns the cached token while it has time, so how logins refresh is unchanged.
      const again = await readerLogin(env, who);
      if (!again) throw new Error('The reader’s login is no longer kept');
      token = again.access;
      foldStructurePage(aggs, (await page(hub.id, p, token, deadline)).orders, want);
    }
  } catch (e) {
    const said = e instanceof Error ? e.message : String(e);
    if (e instanceof EveError && e.status === 403) { await stamp(said, true); return { done: 'refused', error: said }; }
    const error = p > 1 ? `Page ${p} of ${pages} failed (${said})` : said;
    await stamp(error, false);
    return { done: 'failed', error };
  }
  const data = structureSummary(aggs), types = Object.keys(data).length;
  await db.prepare(`INSERT INTO home_books (structure_id, at, data, pages, types, tried, reader, error, refused_at, read_by) VALUES (?1, ?2, ?3, ?4, ?5, ?2, ?6, NULL, NULL, ?6)
    ON CONFLICT(structure_id) DO UPDATE SET at = excluded.at, data = excluded.data, pages = excluded.pages, types = excluded.types, tried = excluded.tried,
      reader = excluded.reader, error = NULL, refused_at = NULL, read_by = excluded.read_by`).bind(hub.id, now, JSON.stringify(data), pages, types, hub.reader).run();
  return { done: 'read', pages, types };
}

/**
 * The hourly round, last on the `37` cron: every hub of every ledger whose last try is BOOK_DUE_MS old, each structure once, least
 * recently read first (by its last good read, so one cut short goes first next time and one long market can't keep another
 * unread). No page past `deadline`.
 */
export async function refreshHomeBooks(env: Env, now = Date.now(), o: { deadline?: number; want?: ReadonlySet<number> } = {}): Promise<{ hubs: number; done: Record<string, BookRead['done']> }> {
  const db = env.DB;
  const ledgers = (await db.prepare(`SELECT char_id AS id FROM keys WHERE purpose = 'main'`).all<{ id: number }>()).results.map((r) => r.id);
  const books = new Map((await db.prepare('SELECT structure_id AS id, at, tried FROM home_books').all<{ id: number; at: number; tried: number }>()).results.map((r) => [r.id, r]));
  const due: { ledger: number; hub: Hub }[] = [];
  // A book is the structure's, so each is read once a round. There is one ledger (the app is its owner's alone, app-conventions.md);
  // were there two naming the same structure, it would be read with the first one's reader and serve both.
  const seen = new Set<number>();
  for (const ledger of ledgers) {
    for (const hub of await hubsOf(db, ledger)) {
      if (hub.off || seen.has(hub.id) || now - (books.get(hub.id)?.tried ?? 0) < BOOK_DUE_MS) continue;
      seen.add(hub.id);
      due.push({ ledger, hub });
    }
  }
  due.sort((a, b) => (books.get(a.hub.id)?.at ?? 0) - (books.get(b.hub.id)?.at ?? 0) || a.hub.id - b.hub.id);
  const done: Record<string, BookRead['done']> = {};
  for (const { ledger, hub } of due) {
    try { done[hub.id] = (await readHomeBook(env, ledger, hub, { now, deadline: o.deadline, want: o.want })).done; }
    catch (e) { done[hub.id] = 'failed'; console.error('home book failed', hub.id, e); }
  }
  return { hubs: due.length, done };
}

/** `GET /v1/home/markets`: the ledger's hubs, each with its reader, whether that login can read it, and its own reads. */
export async function homeMarketsFor(db: D1Database, ledger: number): Promise<{ hubs: HubState[] }> {
  const hubs = await hubsOf(db, ledger);
  type Row = { id: number; at: number; tried: number; error: string | null; refusedAt: number | null; pages: number | null; types: number; reader: number | null; readBy: number | null };
  const books = new Map((await db.prepare('SELECT structure_id AS id, at, tried, error, refused_at AS refusedAt, pages, types, reader, read_by AS readBy FROM home_books').all<Row>()).results.map((r) => [r.id, r]));
  const names = new Map<number, string | null>();
  const nameOf = async (char: number): Promise<string | null> => {
    if (!names.has(char)) {
      const r = char === ledger
        ? await db.prepare(`SELECT token_char_name AS name FROM keys WHERE char_id = ?1 AND purpose = 'main'`).bind(ledger).first<{ name: string | null }>()
        : await db.prepare('SELECT name FROM alts WHERE char_id = ?1 AND ledger = ?2').bind(char, ledger).first<{ name: string | null }>();
      names.set(char, r?.name ?? null);
    }
    return names.get(char) ?? null;
  };
  const out: HubState[] = [];
  for (const h of hubs) {
    const b = books.get(h.id);
    out.push({
      id: h.id, name: h.name, systemId: h.systemId, regionId: h.regionId, kept: h.kept, off: h.off,
      reader: h.reader, readerName: await nameOf(h.reader), readerIsMain: h.reader === ledger, login: await loginOf(db, ledger, h.reader),
      book: b ? {
        at: b.at > 0 ? iso(b.at) : null, tried: iso(b.tried), error: b.error, refusedAt: b.refusedAt != null ? iso(b.refusedAt) : null,
        pages: b.pages, types: b.at > 0 ? b.types : null, reader: b.reader, readerName: b.reader != null ? await nameOf(b.reader) : null,
        readBy: b.readBy, readByName: b.readBy != null ? await nameOf(b.readBy) : null,
      } : null,
    });
  }
  return { hubs: out };
}

/** `GET /v1/home/book?hub=`: a hub's last good read of its own market, or null before one. Only a hub of the caller's. */
export async function homeBookFor(db: D1Database, ledger: number, hub: number): Promise<HomeBookAnswer> {
  if (!(await hubsOf(db, ledger)).some((h) => h.id === hub)) throw new BadRequest('Not one of your home markets');
  const r = await db.prepare('SELECT at, data FROM home_books WHERE structure_id = ?1').bind(hub).first<{ at: number; data: string }>();
  return r && r.at > 0 ? { hub, at: iso(r.at), rows: JSON.parse(r.data) as Record<string, StructureRow> } : null;
}

/** A system's region, read publicly (no login): a hub added needs it for the home region's history. */
async function regionOf(systemId: number): Promise<number> {
  const sys = (await esiGet<{ constellation_id: number }>(`/universe/systems/${systemId}/`)).data;
  return (await esiGet<{ region_id: number }>(`/universe/constellations/${sys.constellation_id}/`)).data.region_id;
}

/**
 * `POST /v1/home/markets`: read a hub with this reader, adding it when it's new (its name and system from the structure found, its
 * region read publicly) or switching a default back on. The reader is the ledger's own character or an alt on its roster.
 */
export async function setHomeMarket(db: D1Database, ledger: number, body: { hub?: unknown; reader?: unknown; name?: unknown; systemId?: unknown }, now = Date.now()): Promise<{ ok: true }> {
  const hub = Number(body.hub), reader = Number(body.reader);
  if (!isStructure(hub)) throw new BadRequest('Say which structure: its ID');
  if (!Number.isInteger(reader) || (reader !== ledger && !(await onRoster(db, ledger, reader)))) throw new BadRequest('That character isn’t one of yours');
  const known = HOME_HUBS.find((h) => h.id === hub);
  const row = await db.prepare('SELECT name, system_id AS systemId, region_id AS regionId, removed_at AS removedAt FROM home_markets WHERE ledger = ?1 AND structure_id = ?2')
    .bind(ledger, hub).first<{ name: string; systemId: number; regionId: number; removedAt: number | null }>();
  // Going live as one of the added hubs (new, or one removed and added back) counts against the cap; a default or a live hub changing reader doesn't.
  if (!known && (!row || row.removedAt != null)) {
    const added = (await db.prepare('SELECT structure_id AS id FROM home_markets WHERE ledger = ?1 AND removed_at IS NULL').bind(ledger).all<{ id: number }>()).results
      .filter((r) => !HOME_HUBS.some((h) => h.id === r.id)).length;
    if (added >= MAX_ADDED) throw new BadRequest(`${MAX_ADDED} home markets is the most the cloud reads, besides Goonmetrics’ two: remove one to add another`);
  }
  let name: string, systemId: number, regionId: number;
  if (known) ({ name, systemId, regionId } = { name: known.name, systemId: known.systemId, regionId: known.region });
  else if (row) ({ name, systemId, regionId } = row);
  else {
    name = typeof body.name === 'string' && body.name.trim() && body.name.length <= 120 ? body.name.trim() : '';
    systemId = Number(body.systemId);
    if (!name || !Number.isInteger(systemId) || systemId < 30_000_000 || systemId >= 33_000_000) throw new BadRequest('A new home market needs its name and system');
    regionId = await regionOf(systemId);
  }
  await db.prepare(`INSERT INTO home_markets (ledger, structure_id, name, system_id, region_id, reader, added_at, removed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)
    ON CONFLICT(ledger, structure_id) DO UPDATE SET reader = excluded.reader, removed_at = NULL`).bind(ledger, hub, name, systemId, regionId, reader, now).run();
  return { ok: true };
}

/** `DELETE /v1/home/markets?hub=`: stop reading a default (a row kept with removed_at), or take an added hub off the list. */
export async function dropHomeMarket(db: D1Database, ledger: number, hub: number, now = Date.now()): Promise<{ ok: true }> {
  const known = HOME_HUBS.find((h) => h.id === hub);
  if (known) {
    await db.prepare(`INSERT INTO home_markets (ledger, structure_id, name, system_id, region_id, reader, added_at, removed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?1, ?6, ?6)
      ON CONFLICT(ledger, structure_id) DO UPDATE SET removed_at = excluded.removed_at`).bind(ledger, hub, known.name, known.systemId, known.region, now).run();
    return { ok: true };
  }
  const r = await db.prepare('UPDATE home_markets SET removed_at = ?3 WHERE ledger = ?1 AND structure_id = ?2 AND removed_at IS NULL').bind(ledger, hub, now).run();
  if (!r.meta.changes) throw new BadRequest('Not one of your home markets');
  return { ok: true };
}

/** `POST /v1/home/read?hub=`: one hub read at once with its reader (after adding it, or Read it now), and its state back. */
export async function readHomeNow(env: Env, ledger: number, hub: number): Promise<HubState> {
  const h = (await hubsOf(env.DB, ledger)).find((x) => x.id === hub);
  if (!h || h.off) throw new BadRequest('Not one of the home markets the cloud reads');
  await readHomeBook(env, ledger, h);
  return (await homeMarketsFor(env.DB, ledger)).hubs.find((x) => x.id === hub)!;
}
