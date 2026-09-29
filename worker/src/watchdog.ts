/**
 * The watchdog round: mails a ledger when a job the cloud runs for it (or for everyone: the scan, the Sniper, the
 * daily checks) has failed twice in a row, or EVE has refused its login, through the same mail step as the alerts. Which failures count and what
 * the mail says are in src/lib/watchdog.ts; `noteJob` keeps the count.
 */
import { mailKey } from '../../src/lib/alerts';
import { sanitizeAlerts } from '../../src/lib/prefs';
import type { AlertConfig } from '../../src/lib/types';
import { loginLostFinding, WATCH_FAILS, watchdogFinding } from '../../src/lib/watchdog';
import { mailFindings } from './alerts';

type Env = { DB: D1Database; EVE_CLIENT_ID: string; TOKEN_KEY: string; APP_URL: string };

export async function watchdog(env: Env, charId: number, now = Date.now()): Promise<{ failing: number; mailed: number }> {
  const db = env.DB;
  const rows = (await db.prepare(`SELECT char_id, job, fails, failing_since, last_error, warned FROM jobs WHERE char_id IN (?1, 0) AND fails >= ?2`)
    .bind(charId, WATCH_FAILS).all<{ char_id: number; job: string; fails: number; failing_since: number | null; last_error: string | null; warned: number | null }>()).results;
  // A login EVE refused is one mail of its own, and the jobs failing for want of it aren't mailed one by one.
  const refused = (await db.prepare(`SELECT purpose, token_char_name AS name, refused_at, refused, refused_warned FROM keys WHERE char_id = ?1 AND refused_at IS NOT NULL`)
    .bind(charId).all<{ purpose: 'main' | 'mailer'; name: string | null; refused_at: number; refused: string | null; refused_warned: number | null }>()).results;
  const lost = refused.map((k) => ({ k, f: loginLostFinding({ purpose: k.purpose, name: k.name, since: k.refused_at, reason: k.refused, warned: k.refused_warned }, now) }))
    .filter((x): x is { k: typeof refused[number]; f: NonNullable<typeof x.f> } => x.f != null);
  const due = rows.map((r) => ({ r, f: watchdogFinding({ job: r.job, fails: r.fails, failingSince: r.failing_since, lastError: r.last_error, warned: r.warned }, now) }))
    .filter((x): x is { r: typeof rows[number]; f: NonNullable<typeof x.f> } => x.f != null && !(refused.length && x.f.watch?.login));
  if (!due.length && !lost.length) return { failing: rows.length, mailed: 0 };
  const hasSender = await db.prepare(`SELECT 1 AS y FROM keys WHERE char_id = ?1 AND purpose = 'mailer'`).bind(charId).first();
  if (!hasSender) return { failing: rows.length, mailed: 0 };
  const row = await db.prepare(`SELECT data FROM docs WHERE char_id = ?1 AND key = 'alerts'`).bind(charId).first<{ data: string }>();
  const cfg = sanitizeAlerts(row ? (JSON.parse(row.data) as Partial<AlertConfig>) : null);
  if (!cfg.on || !cfg.mail) return { failing: rows.length, mailed: 0 };
  const { mailed } = await mailFindings(env, charId, [...lost.map((x) => x.f), ...due.map((x) => x.f)], cfg, now);
  if (!mailed) return { failing: rows.length, mailed: 0 };
  // What went out is in the alert log at this moment: those streaks are warned, so the next mail is a day off.
  const sent = new Set((await db.prepare(`SELECT key FROM alert_log WHERE char_id = ?1 AND at = ?2`).bind(charId, now).all<{ key: string }>()).results.map((r) => r.key));
  const warn = db.prepare('UPDATE jobs SET warned = ?3 WHERE char_id = ?1 AND job = ?2');
  const warnLogin = db.prepare('UPDATE keys SET refused_warned = ?3 WHERE char_id = ?1 AND purpose = ?2');
  const stmts = [
    ...due.filter((x) => sent.has(mailKey(x.f))).map((x) => warn.bind(x.r.char_id, x.r.job, now)),
    ...lost.filter((x) => sent.has(mailKey(x.f))).map((x) => warnLogin.bind(charId, x.k.purpose, now)),
  ];
  if (stmts.length) await db.batch(stmts);
  return { failing: rows.length, mailed: stmts.length };
}
