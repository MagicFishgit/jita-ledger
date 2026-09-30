/**
 * Alts: characters on the owner's other accounts, read by the cloud and never logged in to the app.
 *
 * An alt's login is kept under the main's ledger (keys: purpose `alt:<id>`), and everything read for it is filed
 * under its own character ID, in the same kinds and documents as a ledger, so the main's ledger never holds a row of
 * an alt's. The `alts` table (migration 0016) is the roster. Alts are found through it, never by matching a purpose.
 */
import type { CloneState } from '../../src/lib/roster';
import { archive, noteJob, roughPrices, type ArchiveResult } from './archive';
import { altPurpose, altReader, dropLogin, stillKept, type Reader } from './eve';
import { readMiningRound } from './mining';
import { readSheet } from './sheet';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string; APP_URL: string };

export type AltRow = { charId: number; name: string | null; addedAt: number };

/** A ledger's alts, in the order they were added. Removed ones aren't on it. */
export async function rosterOf(db: D1Database, ledger: number): Promise<AltRow[]> {
  return (await db.prepare('SELECT char_id AS charId, name, added_at AS addedAt FROM alts WHERE ledger = ?1 AND removed_at IS NULL ORDER BY added_at, char_id')
    .bind(ledger).all<AltRow>()).results;
}

export async function onRoster(db: D1Database, ledger: number, altId: number): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 AS y FROM alts WHERE char_id = ?1 AND ledger = ?2 AND removed_at IS NULL').bind(altId, ledger).first());
}

/** Whether a character is anyone's alt, removed or not: such a character is never a ledger of its own. */
export async function isAlt(db: D1Database, charId: number): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 AS y FROM alts WHERE char_id = ?1').bind(charId).first());
}

/** Every alt there is a login for, as a reader. They are read whether or not their main's own login is kept. */
export async function altReaders(db: D1Database): Promise<Reader[]> {
  const rows = (await db.prepare(`SELECT a.ledger AS ledger, a.char_id AS char FROM alts a
      JOIN keys k ON k.char_id = a.ledger AND k.purpose = 'alt:' || a.char_id
      WHERE a.removed_at IS NULL ORDER BY a.added_at, a.char_id`).all<{ ledger: number; char: number }>()).results;
  return rows.map((r) => altReader(r.ledger, r.char));
}

/** Notes an alt's job, unless the alt was removed meanwhile: a row left behind would greet a re-add with an old streak. */
async function note(db: D1Database, who: Reader, job: string, outcome: { ok: true; detail: unknown } | { ok: false; error: string }) {
  if (await stillKept(db, who)) await noteJob(db, who.char, job, outcome);
}
const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * An alt's full read: the copy a ledger gets hourly (archive.ts), then its sheet (sheet.ts), each noted as a job
 * under the alt. Throws what failed, after noting it.
 */
export async function readAlt(env: Env, who: Reader, prices?: Record<number, number>): Promise<ArchiveResult & { clone: CloneState | null }> {
  let copied: ArchiveResult;
  try {
    copied = await archive(env, who, { prices });
    await note(env.DB, who, 'archive', { ok: true, detail: copied });
  } catch (e) {
    await note(env.DB, who, 'archive', { ok: false, error: said(e) });
    throw e;
  }
  try {
    const sheet = await readSheet(env, who, { wallet: copied.wallet ?? null, lp: copied.lp ?? null });
    await note(env.DB, who, 'sheet', { ok: true, detail: sheet });
    return { ...copied, clone: sheet.clone };
  } catch (e) {
    await note(env.DB, who, 'sheet', { ok: false, error: said(e) });
    throw e;
  }
}

/**
 * Every alt's full read, one after another: the `37 * * * *` cron. A cron of its own because the hourly one carries
 * the full-market scan, whose 11-minute budget inside the 15-minute limit doesn't know alt reads ran ahead of it, and
 * the five-minute round has 30 s of CPU and the main's alerts to get through. One alt failing doesn't stop the next;
 * its failure is its own job row, which the watchdog mails by character.
 */
export async function altsHourly(env: Env): Promise<{ alts: number; read: number; failed: number }> {
  const readers = await altReaders(env.DB);
  if (!readers.length) return { alts: 0, read: 0, failed: 0 };
  // CCP's rough prices, once for the round. Without them each read fetches its own.
  const prices = await roughPrices().catch(() => undefined);
  let read = 0, failed = 0;
  for (const who of readers) {
    try { await readAlt(env, who, prices); read++; } catch (e) { failed++; console.error('alt read failed', who.char, e); }
  }
  return { alts: readers.length, read, failed };
}

/** Every alt's mining ledger, when its ten minutes are up: run at the end of the five-minute round. */
export async function altsMining(env: Env, now = Date.now()): Promise<{ alts: number; read: number; failed: number }> {
  const readers = await altReaders(env.DB);
  let read = 0, failed = 0;
  for (const who of readers) {
    try { if ((await readMiningRound(env, who, now)) != null) read++; } catch (e) { failed++; await note(env.DB, who, 'mining', { ok: false, error: said(e) }); }
  }
  return { alts: readers.length, read, failed };
}

/** The roster as the app shows it: each alt's login (never the token), its jobs, its revision, and its ship when last read. */
export async function altsStatus(db: D1Database, ledger: number) {
  const rows = (await db.prepare(`SELECT a.char_id AS charId, a.name AS name, a.added_at AS addedAt, k.scopes AS scopes, k.updated_at AS at,
        k.refused_at AS refusedAt, k.refused AS refused, (SELECT rev FROM revs WHERE char_id = a.char_id) AS rev, m.ship_type_id AS ship, m.at AS shipAt
      FROM alts a
      LEFT JOIN keys k ON k.char_id = a.ledger AND k.purpose = 'alt:' || a.char_id
      LEFT JOIN mining_state m ON m.char_id = a.char_id
      WHERE a.ledger = ?1 AND a.removed_at IS NULL ORDER BY a.added_at, a.char_id`).bind(ledger)
    .all<{ charId: number; name: string | null; addedAt: number; scopes: string | null; at: number | null; refusedAt: number | null; refused: string | null; rev: number | null; ship: number | null; shipAt: number | null }>()).results;
  const out = [];
  for (const r of rows) {
    const jobs = (await db.prepare('SELECT job, last_run AS lastRun, last_ok AS lastOk, last_error AS lastError FROM jobs WHERE char_id = ?1 ORDER BY job').bind(r.charId)
      .all<{ job: string; lastRun: number; lastOk: number | null; lastError: string | null }>()).results;
    out.push({ ...r, scopes: (r.scopes ?? '').split(' ').filter(Boolean), rev: r.rev ?? 0, jobs });
  }
  return out;
}

/** Every alt's ticks of the last `days`, each with its character: sessions are built one character at a time. */
export async function altTicks(db: D1Database, ledger: number, days: number, now = Date.now()) {
  return (await db.prepare(`SELECT t.char_id AS charId, t.at AS at, t.system_id AS systemId, t.type_id AS typeId, t.qty AS qty, t.ship_type_id AS shipTypeId
      FROM mining_ticks t JOIN alts a ON a.char_id = t.char_id
      WHERE a.ledger = ?1 AND a.removed_at IS NULL AND t.at > ?2 ORDER BY t.at`)
    .bind(ledger, now - Math.min(90, Math.max(1, days)) * 86400_000)
    .all<{ charId: number; at: number; systemId: number; typeId: number; qty: number; shipTypeId: number | null }>()).results;
}

/**
 * Take an alt off the roster: its login is revoked at EVE and dropped. Either way its mining snapshot and its job
 * rows go, so a later re-add starts from a fresh baseline and no old failing streak. `keep` leaves what was read,
 * unreachable until the character is added again, and the alt stays known as one (it is never a ledger of its own).
 * `delete` removes it all. Its revision row stays in both: a revision that restarted would let a device holding the
 * old one miss everything after a re-add.
 */
export async function removeAlt(env: Env, ledger: number, altId: number, data: 'keep' | 'delete'): Promise<void> {
  await dropLogin(env, ledger, altPurpose(altId));
  const db = env.DB;
  const gone = (table: string) => db.prepare(`DELETE FROM ${table} WHERE char_id = ?1`).bind(altId);
  const stmts = [gone('mining_state'), gone('jobs')];
  if (data === 'delete') stmts.push(gone('records'), gone('docs'), gone('mining_ticks'), gone('safety_seen'), db.prepare('DELETE FROM alts WHERE char_id = ?1 AND ledger = ?2').bind(altId, ledger));
  else stmts.push(db.prepare('UPDATE alts SET removed_at = ?3 WHERE char_id = ?1 AND ledger = ?2').bind(altId, ledger, Date.now()));
  await db.batch(stmts);
}
