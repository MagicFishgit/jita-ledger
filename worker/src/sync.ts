/**
 * The ledger's cloud copy: push what changed, pull what changed since a revision.
 *
 * A record is one item of a collection (a trade, a journal entry, a position), stored by kind and ID, so
 * two devices changing different things never collide. A doc is a whole small value (settings, stock),
 * where the newest write wins. Every push takes the character's next revision number, and a pull returns
 * everything after the revision a device last saw, in revision order, a page at a time.
 */

export const RECORD_KINDS = new Set([
  'txs', 'journal', 'orders', 'names', 'killmails', 'tags', 'positions', 'goals', 'watchlist', 'netWorth',
]);
export const DOC_KEYS = new Set(['settings', 'meta', 'prefs', 'alerts', 'stock', 'skills', 'ignored', 'nearDone', 'unusualOk']);

/** D1 takes a bound string up to 2 MB; records go up in chunks well under that. */
const CHUNK_BYTES = 900_000;
const MAX_RECORD_BYTES = 400_000;
const PAGE = 2000;

export type PushBody = {
  records?: { k: string; i: string; d: unknown }[];
  docs?: { key: string; d: unknown }[];
};

export class BadRequest extends Error {}

export async function push(db: D1Database, charId: number, body: PushBody): Promise<{ rev: number; records: number; docs: number }> {
  const records = body.records ?? [];
  const docs = body.docs ?? [];
  if (!records.length && !docs.length) return { rev: await currentRev(db, charId), records: 0, docs: 0 };

  const rows: { k: string; i: string; d: string | null }[] = [];
  for (const r of records) {
    if (!RECORD_KINDS.has(r.k)) throw new BadRequest(`Unknown record kind: ${r.k}`);
    if (typeof r.i !== 'string' || !r.i || r.i.length > 200) throw new BadRequest('A record needs an ID');
    const d = r.d == null ? null : JSON.stringify(r.d);
    if (d && d.length > MAX_RECORD_BYTES) throw new BadRequest(`A ${r.k} record is too large (${d.length} bytes)`);
    rows.push({ k: r.k, i: r.i, d });
  }
  for (const doc of docs) if (!DOC_KEYS.has(doc.key)) throw new BadRequest(`Unknown document: ${doc.key}`);

  const now = Date.now();
  // One batch is one transaction: the new revision and every write that carries it land together or not at
  // all. Each write reads the revision from the row the first statement just bumped.
  const REV = '(SELECT rev FROM revs WHERE char_id = ?1)';
  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT INTO revs (char_id, rev) VALUES (?1, 1) ON CONFLICT(char_id) DO UPDATE SET rev = rev + 1').bind(charId),
  ];
  // "WHERE true" keeps SQLite from reading ON CONFLICT as the start of a join on json_each.
  const upsert = db.prepare(`
    INSERT INTO records (char_id, kind, id, data, rev, updated_at)
    SELECT ?1, json_extract(value, '$.k'), json_extract(value, '$.i'), json_extract(value, '$.d'), ${REV}, ?2 FROM json_each(?3) WHERE true
    ON CONFLICT(char_id, kind, id) DO UPDATE SET data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at`);
  let chunk: typeof rows = [], size = 0;
  const flush = () => { if (chunk.length) stmts.push(upsert.bind(charId, now, JSON.stringify(chunk))); chunk = []; size = 0; };
  for (const r of rows) {
    const n = (r.d?.length ?? 4) + r.i.length + 40;
    if (size + n > CHUNK_BYTES) flush();
    chunk.push(r); size += n;
  }
  flush();
  const setDoc = db.prepare(`
    INSERT INTO docs (char_id, key, data, rev, updated_at) VALUES (?1, ?2, ?3, ${REV}, ?4)
    ON CONFLICT(char_id, key) DO UPDATE SET data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at`);
  for (const doc of docs) stmts.push(setDoc.bind(charId, doc.key, JSON.stringify(doc.d ?? null), now));
  stmts.push(db.prepare('SELECT rev FROM revs WHERE char_id = ?1').bind(charId));
  const results = await db.batch<{ rev: number }>(stmts);
  const rev = results[results.length - 1].results[0].rev;
  return { rev, records: rows.length, docs: docs.length };
}

async function currentRev(db: D1Database, charId: number): Promise<number> {
  return (await db.prepare('SELECT rev FROM revs WHERE char_id = ?1').bind(charId).first<{ rev: number }>())?.rev ?? 0;
}

type Cursor = { rev: number; kind: string; id: string };
const readCursor = (s: string | null): Cursor | null => {
  if (!s) return null;
  const [rev, kind, ...id] = s.split('|');
  return Number.isFinite(Number(rev)) ? { rev: Number(rev), kind: kind ?? '', id: id.join('|') } : null;
};

/**
 * Everything changed after revision `since`, records a page at a time. `after` continues within a page
 * boundary (a big push shares one revision). Docs come whole on the first page. `rev` is the newest
 * revision there is, which the device keeps once it has read to the end.
 */
export async function pull(db: D1Database, charId: number, since: number, after: string | null) {
  const cur = readCursor(after);
  const rev = await currentRev(db, charId);
  const docs = cur ? [] : (await db.prepare('SELECT key, data, rev FROM docs WHERE char_id = ?1 AND rev > ?2')
    .bind(charId, since).all<{ key: string; data: string; rev: number }>()).results;
  const q = cur
    ? db.prepare(`SELECT kind, id, data, rev FROM records WHERE char_id = ?1 AND rev <= ?2 AND
        (rev > ?3 OR (rev = ?3 AND (kind > ?4 OR (kind = ?4 AND id > ?5)))) ORDER BY rev, kind, id LIMIT ${PAGE}`)
      .bind(charId, rev, cur.rev, cur.kind, cur.id)
    : db.prepare(`SELECT kind, id, data, rev FROM records WHERE char_id = ?1 AND rev <= ?2 AND rev > ?3 ORDER BY rev, kind, id LIMIT ${PAGE}`)
      .bind(charId, rev, since);
  const records = (await q.all<{ kind: string; id: string; data: string | null; rev: number }>()).results;
  const last = records[records.length - 1];
  return {
    rev,
    docs: docs.map((d) => ({ key: d.key, d: JSON.parse(d.data), r: d.rev })),
    records: records.map((r) => ({ k: r.kind, i: r.id, d: r.data == null ? null : JSON.parse(r.data), r: r.rev })),
    next: records.length === PAGE && last ? `${last.rev}|${last.kind}|${last.id}` : null,
  };
}

/** What the cloud holds for a character, for the Settings panel. */
export async function status(db: D1Database, charId: number) {
  const kinds = (await db.prepare('SELECT kind, COUNT(*) AS n, MAX(updated_at) AS at FROM records WHERE char_id = ?1 AND data IS NOT NULL GROUP BY kind')
    .bind(charId).all<{ kind: string; n: number; at: number }>()).results;
  const docs = (await db.prepare('SELECT key, updated_at AS at FROM docs WHERE char_id = ?1').bind(charId).all<{ key: string; at: number }>()).results;
  return { rev: await currentRev(db, charId), kinds, docs };
}
