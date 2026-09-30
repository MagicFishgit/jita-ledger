/**
 * Alts: characters on the owner's other accounts, read by the cloud and never logged in to the app.
 *
 * An alt's login is kept under the main's ledger (keys: purpose `alt:<id>`), and everything read for it is filed
 * under its own character ID, in the same kinds and documents as a ledger, so the main's ledger never holds a row of
 * an alt's. The `alts` table (migration 0016) is the roster. Alts are found through it, never by matching a purpose.
 */
import type { CloneState } from '../../src/lib/roster';
import { archive, noteJob, type ArchiveResult } from './archive';
import { altReader, stillKept, type Reader } from './eve';
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
