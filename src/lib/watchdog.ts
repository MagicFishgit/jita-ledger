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
  mining: { label: 'Reading your mining ledger', retry: 'every 10 minutes', meanwhile: 'mining isn’t turned into sessions, and nothing mined past ESI’s 30 days is kept by the cloud' },
};

/**
 * The jobs the cloud runs for one of your other characters (an alt: alts.ts in the Worker), worded with its name.
 * "Your" is the main: the mail goes to it, about someone else.
 */
export const ALT_JOB_SAID: Record<string, { label: (name: string) => string; retry: string; meanwhile: (name: string) => string }> = {
  archive: { label: (n) => `Copying ${n}’s wallet, orders and assets from ESI`, retry: 'every hour', meanwhile: (n) => `${n}’s new trades, journal entries and assets aren’t copied to the cloud` },
  sheet: { label: (n) => `Reading ${n}’s skills and wallet`, retry: 'every hour', meanwhile: (n) => `${n}’s skills, queue, clone state and wallet balance stay as they were last read` },
  mining: { label: (n) => `Reading ${n}’s mining ledger`, retry: 'every 10 minutes', meanwhile: (n) => `${n}’s mining isn’t turned into sessions, and nothing it mined past ESI’s 30 days is kept by the cloud` },
};

/** An error that means the cloud's login no longer works: only logging in again fixes it. */
export const loginError = (e: string | null) => !!e && /invalid_grant|invalid_token|refresh|unauthori[sz]ed|\b401\b|revoked|no login|refused the/i.test(e);

export type JobRow = { job: string; fails: number; failingSince: number | null; lastError: string | null; warned: number | null };
export type WatchFacts = {
  job: string; label: string; fails: number; since: number; error: string | null; retry: string; meanwhile: string; login: boolean;
  /** Set when the mail is about a login EVE refused, rather than one job failing: whose it is. */
  lost?: { purpose: 'main' | 'mailer' | 'alt'; name: string };
  /** Set when the job is one the cloud runs for an alt: its name, so the mail says whose login to hand over. */
  alt?: string;
};

/**
 * The mail for a job failing WATCH_FAILS times or more in a row, when one is due: at the streak's start, then daily.
 * `alt`: the job is one the cloud runs for another of your characters; its words name it and its key carries its ID,
 * or two alts failing the same job at the same moment would be one finding.
 */
export function watchdogFinding(j: JobRow, now: number, alt?: { charId: number; name: string }): Finding | null {
  if (j.fails < WATCH_FAILS || j.failingSince == null) return null;
  if (j.warned != null && now - j.warned < REWARN_H * 3600_000) return null;
  const theirs = alt ? ALT_JOB_SAID[j.job] : undefined;
  const said = alt
    ? { label: theirs?.label(alt.name) ?? `The cloud’s “${j.job}” job for ${alt.name}`, retry: theirs?.retry ?? 'on its schedule', meanwhile: theirs?.meanwhile(alt.name) ?? `what it does for ${alt.name} has stopped` }
    : JOB_SAID[j.job] ?? { label: `The cloud’s “${j.job}” job`, retry: 'on its schedule', meanwhile: 'what it does has stopped' };
  const login = loginError(j.lastError);
  return {
    kind: 'watchdog', key: alt ? `watchdog:${alt.charId}:${j.job}:${j.failingSince}` : `watchdog:${j.job}:${j.failingSince}`, title: 'Cloud job failing',
    text: `${said.label} has failed ${j.fails} times in a row.${j.lastError ? ` The last error: ${j.lastError}.` : ''}`,
    watch: { job: j.job, label: said.label, fails: j.fails, since: j.failingSince, error: j.lastError, retry: said.retry, meanwhile: said.meanwhile, login, ...(alt ? { alt: alt.name } : {}) },
  };
}

/** How long a refusal has to last before it's mailed: every round tries again, so it has been refused at least twice. */
export const LOGIN_GRACE_MS = 10 * 60_000;

/** What stops while each login is refused. */
export const LOGIN_STOPS: Record<'main' | 'mailer' | 'alt', string> = {
  main: 'your ledger isn’t copied from ESI, your orders and planets aren’t read, so nothing about them is mailed, and old alert mail isn’t tidied',
  mailer: 'no alert mail can be sent',
  alt: 'its mining, wallet, assets and skills aren’t read',
};

/** `charId`: the character, for an alt's login (its key needs it; the main and the sender are one each). */
export type RefusedLogin = { purpose: 'main' | 'mailer' | 'alt'; charId?: number; name: string | null; since: number; reason: string | null; warned: number | null };

/**
 * The mail for a refused login, when one is due: once it has lasted `LOGIN_GRACE_MS` outside EVE's downtime, then
 * daily. A refused login stops every job that needs it at once, so it's one mail, not one per job as each fails twice:
 * the user's trading login stopped on 29 September 2026 and three mails came over two hours, one each for the alert
 * checks, the orders and the ledger copy. The refusal is kept on the login (`keys.refused_at`); a refresh that works, or
 * the login handed over again, clears it. The trading login's is mailed, and an alt's, by name. A refused sender can't
 * send the mail that would say so, so that one shows only in the app (Settings, To do).
 */
export function loginLostFinding(k: RefusedLogin, now: number): Finding | null {
  if (k.purpose === 'mailer') return null;
  if (now - k.since < LOGIN_GRACE_MS || isDowntime(now)) return null;
  if (k.warned != null && now - k.warned < REWARN_H * 3600_000) return null;
  const alt = k.purpose === 'alt';
  const name = k.name ?? (alt ? 'one of your characters' : 'your character');
  const label = `The cloud’s login for ${name}`;
  const why = k.reason ? ` (${k.reason})` : '';
  return {
    kind: 'watchdog', key: alt ? `watchdog:login:alt:${k.charId}:${k.since}` : `watchdog:login:${k.purpose}:${k.since}`,
    title: alt ? `Cloud lost ${name}’s login` : 'Cloud lost your login',
    text: alt
      ? `EVE refused the cloud’s login for ${name}${why}. Hand ${name} over again: Characters.`
      : `EVE refused the cloud’s login for ${name}${why}. Hand it your login again: Settings → Your data.`,
    watch: {
      job: 'login', label, fails: 0, since: k.since, error: k.reason, retry: 'every few minutes', meanwhile: LOGIN_STOPS[k.purpose], login: true,
      lost: { purpose: k.purpose, name },
    },
  };
}

/**
 * A job's login error from before its login last worked (handed over again, or refreshed since): Settings showed
 * "EVE refused the login" in red for up to an hour after the user had handed the cloud a new one, because the ledger
 * copy only runs at :07. `keys` are the logins the job uses.
 */
export function errorPredatesLogin(job: { lastRun: number; lastError: string | null }, keys: { at: number; refusedAt?: number | null }[]): boolean {
  return loginError(job.lastError) && keys.length > 0 && keys.every((k) => !k.refusedAt && k.at > job.lastRun);
}

/**
 * Permissions the app's own login has that the cloud's doesn't. Logging in to the app with a new set of permissions
 * replaces the character's grant, and the cloud's older login stops working (29 September 2026), but the cloud only
 * finds out when its cached access token runs out, up to twenty minutes later. This says so at once.
 */
export const scopesMissing = (app: string[], cloud: string[] | undefined): string[] => (cloud ? app.filter((s) => !cloud.includes(s)) : []);
