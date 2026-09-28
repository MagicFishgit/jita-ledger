/**
 * The watchdog round: mails a ledger when a job the cloud runs for it (or for everyone: the scan, the Sniper, the
 * daily checks) has failed twice in a row, through the same mail step as the alerts. Which failures count and what
 * the mail says are in src/lib/watchdog.ts; `noteJob` keeps the count.
 */
import { mailKey } from '../../src/lib/alerts';
import { sanitizeAlerts } from '../../src/lib/prefs';
import type { AlertConfig } from '../../src/lib/types';
import { WATCH_FAILS, watchdogFinding } from '../../src/lib/watchdog';
import { mailFindings } from './alerts';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string; APP_URL: string };

export async function watchdog(env: Env, charId: number, now = Date.now()): Promise<{ failing: number; mailed: number }> {
  const db = env.DB;
  const rows = (await db.prepare(`SELECT char_id, job, fails, failing_since, last_error, warned FROM jobs WHERE char_id IN (?1, 0) AND fails >= ?2`)
    .bind(charId, WATCH_FAILS).all<{ char_id: number; job: string; fails: number; failing_since: number | null; last_error: string | null; warned: number | null }>()).results;
  const due = rows.map((r) => ({ r, f: watchdogFinding({ job: r.job, fails: r.fails, failingSince: r.failing_since, lastError: r.last_error, warned: r.warned }, now) }))
    .filter((x): x is { r: typeof rows[number]; f: NonNullable<typeof x.f> } => x.f != null);
  if (!due.length) return { failing: rows.length, mailed: 0 };
  const hasSender = await db.prepare(`SELECT 1 AS y FROM keys WHERE char_id = ?1 AND purpose = 'mailer'`).bind(charId).first();
  if (!hasSender) return { failing: rows.length, mailed: 0 };
  const row = await db.prepare(`SELECT data FROM docs WHERE char_id = ?1 AND key = 'alerts'`).bind(charId).first<{ data: string }>();
  const cfg = sanitizeAlerts(row ? (JSON.parse(row.data) as Partial<AlertConfig>) : null);
  if (!cfg.on || !cfg.mail) return { failing: rows.length, mailed: 0 };
  const { mailed } = await mailFindings(env, charId, due.map((x) => x.f), cfg, now);
  if (!mailed) return { failing: rows.length, mailed: 0 };
  // What went out is in the alert log at this moment: those streaks are warned, so the next mail is a day off.
  const sent = new Set((await db.prepare(`SELECT key FROM alert_log WHERE char_id = ?1 AND at = ?2`).bind(charId, now).all<{ key: string }>()).results.map((r) => r.key));
  const warn = db.prepare('UPDATE jobs SET warned = ?3 WHERE char_id = ?1 AND job = ?2');
  const stmts = due.filter((x) => sent.has(mailKey(x.f))).map((x) => warn.bind(x.r.char_id, x.r.job, now));
  if (stmts.length) await db.batch(stmts);
  return { failing: rows.length, mailed: stmts.length };
}
