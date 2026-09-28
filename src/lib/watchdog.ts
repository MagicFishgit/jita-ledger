/**
 * The cloud's watchdog. The jobs the cloud runs for you (copying your ledger, reading your orders, alert mail, the
 * daily scan, the Sniper) fail quietly: nobody is looking at Settings when one stops. So a job that fails twice in
 * a row is mailed, once, and again each day it keeps failing. Pure: which failures count, and what to say.
 */
import type { Finding } from './alerts';

/** Failures in a row before it's worth a mail: one is usually ESI having a moment. */
export const WATCH_FAILS = 2;
/** A streak still failing is mailed again after this long. */
export const REWARN_H = 24;

/**
 * EVE's daily downtime starts at 11:00 UTC and takes ESI with it for a few minutes, so every job that runs then
 * fails for everyone. Failures in this window don't count towards a streak.
 */
export function isDowntime(t: number): boolean {
  const d = new Date(t);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return m >= 10 * 60 + 55 && m < 11 * 60 + 30;
}

/** What each job does, how soon it tries again, and what stops while it fails. */
export const JOB_SAID: Record<string, { label: string; retry: string; meanwhile: string }> = {
  archive: { label: 'Copying your ledger from ESI', retry: 'every hour', meanwhile: 'new trades, journal entries and orders aren’t copied to the cloud, so the alerts work from what it last had' },
  orders: { label: 'Reading your market orders', retry: 'every 20 minutes', meanwhile: 'orders you placed or changed since aren’t seen by the alert checks' },
  alerts: { label: 'Checking your orders for alerts', retry: 'every few minutes', meanwhile: 'no alert mail is sent' },
  mailtidy: { label: 'Tidying old alert mail', retry: 'on its usual cadence', meanwhile: 'old alert mails stay in your inbox' },
  pi: { label: 'Reading your planets', retry: 'every hour', meanwhile: 'nothing warns you before an extractor stops' },
  scan: { label: 'The daily full-market scan', retry: 'every hour', meanwhile: 'Prospects and the planner work from the last scan that finished' },
  sniper: { label: 'The Sniper', retry: 'every five minutes', meanwhile: 'no mistake listings are found or mailed' },
  checks: { label: 'The daily checks', retry: 'every hour', meanwhile: 'the Sniper’s and your share’s records aren’t brought up to date' },
};

/** An error that means the cloud's login no longer works: only logging in again fixes it. */
export const loginError = (e: string | null) => !!e && /invalid_grant|invalid_token|refresh|unauthori[sz]ed|\b401\b|revoked|no login/i.test(e);

export type JobRow = { job: string; fails: number; failingSince: number | null; lastError: string | null; warned: number | null };
export type WatchFacts = { job: string; label: string; fails: number; since: number; error: string | null; retry: string; meanwhile: string; login: boolean };

/** The mail for a job failing WATCH_FAILS times or more in a row, when one is due: at the streak's start, then daily. */
export function watchdogFinding(j: JobRow, now: number): Finding | null {
  if (j.fails < WATCH_FAILS || j.failingSince == null) return null;
  if (j.warned != null && now - j.warned < REWARN_H * 3600_000) return null;
  const said = JOB_SAID[j.job] ?? { label: `The cloud’s “${j.job}” job`, retry: 'on its schedule', meanwhile: 'what it does has stopped' };
  const login = loginError(j.lastError);
  return {
    kind: 'watchdog', key: `watchdog:${j.job}:${j.failingSince}`, title: 'Cloud job failing',
    text: `${said.label} has failed ${j.fails} times in a row.${j.lastError ? ` The last error: ${j.lastError}.` : ''}`,
    watch: { job: j.job, label: said.label, fails: j.fails, since: j.failingSince, error: j.lastError, retry: said.retry, meanwhile: said.meanwhile, login },
  };
}
