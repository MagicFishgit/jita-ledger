/**
 * Which findings become alerts, and when to stay quiet.
 *
 * The checking itself happens elsewhere (orders against the live book, colonies, positions); this only
 * decides whether a finding is worth interrupting you for. Pure, so the rules can be tested.
 */

import type { AlertConfig, AlertEvent, AlertLogEntry } from './types';

export const ALERT_LABELS: Record<AlertEvent, { label: string; what: string }> = {
  move: { label: 'Order worth moving', what: 'An order of yours is beaten and the queue ahead won’t clear inside your wait time' },
  clearing: { label: 'Beaten but clearing', what: 'You’re undercut, but the stock ahead will clear on its own — usually just noise' },
  squeeze: { label: 'Margin squeeze', what: 'A position’s daily range has narrowed close to its break-even spread' },
  pi: { label: 'PI programme ending', what: 'An extraction programme ends within a day, or has ended' },
  scam: { label: 'Suspicious market', what: 'A wall, escrow bait or price spike appears on something you trade or watch' },
  backup: { label: 'Backup overdue', what: 'Your last backup is more than two weeks old' },
};

/** Quiet hours run overnight in EVE time, when you are most likely asleep and least likely to act. */
export const QUIET_FROM = 23;
export const QUIET_TO = 7;
export const isQuiet = (t: number) => { const h = new Date(t).getUTCHours(); return h >= QUIET_FROM || h < QUIET_TO; };

/** Don't raise the same finding twice inside this window. */
export const REPEAT_MS = 6 * 3600_000;

/** Events judged in ISK, so the minimum applies to them. */
const BY_ISK: AlertEvent[] = ['move', 'clearing'];

export type Finding = {
  kind: AlertEvent; key: string; title: string; text: string; isk?: number;
  /** The item it's about, when there is one: `text` starts with its name, which a mail makes a link. */
  typeId?: number; name?: string;
};

export function shouldAlert(f: Finding, cfg: AlertConfig, log: AlertLogEntry[], now: number): boolean {
  if (!cfg.on || !cfg.ev[f.kind]) return false;
  if (cfg.quiet && isQuiet(now)) return false;
  if (BY_ISK.includes(f.kind) && (f.isk ?? 0) < cfg.minIsk) return false;
  return !log.some((l) => !l.test && l.key === f.key && now - Date.parse(l.at) < REPEAT_MS);
}

/** The countdown to the next check, from when checking started. */
export function nextCheckIn(startedAt: number, intervalMin: number, now: number): number {
  const p = intervalMin * 60_000;
  if (!(p > 0)) return 0;
  const elapsed = Math.max(0, now - startedAt);
  return p - (elapsed % p);
}

/** Every alert mail's subject starts with this, which is how the app finds its own mails to tidy away. */
export const MAIL_SUBJECT = 'Jita Ledger';
/** One mail holds at most this many alerts; a burst beyond it is summed up in a line. */
const MAIL_MAX = 15;

const escapeMail = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The EVE mail for one check's alerts: everything found at once in a single mail rather than one each.
 *
 * EVE mail takes a small set of HTML. An item's name becomes a `showinfo:` link, which opens the item
 * in the client. EVE mail has no link that opens a market window, so each item also gets a link to the
 * app (`#orders?market=ID`), which asks ESI to open that market when it loads: the client asks before
 * following a web link, the browser opens the app, the app opens the window. Colours are ARGB, as the
 * client writes them.
 */
/** "30 minutes", "an hour", "a day", "3 days": how long a mail is kept, said as a person would. */
export function keepSaid(min: number): string {
  if (min < 60) return `${min} minutes`;
  if (min < 1440) return min === 60 ? 'an hour' : `${Math.round(min / 60)} hours`;
  const d = Math.round(min / 1440);
  return d === 1 ? 'a day' : d === 7 ? 'a week' : `${d} days`;
}

export function alertMail(findings: Finding[], opts: { appUrl: string; keepMin: number | null; test?: boolean }): { subject: string; body: string } {
  const n = findings.length;
  const first = findings[0];
  const subject = `${MAIL_SUBJECT}: ${opts.test ? 'test — ' : ''}${n === 1 ? first.title : `${n} alerts`}`.slice(0, 1000);
  const line = (f: Finding) => {
    const text = escapeMail(f.text);
    if (f.typeId && f.name && f.text.startsWith(f.name)) {
      return `<a href="showinfo:${f.typeId}">${escapeMail(f.name)}</a>${text.slice(escapeMail(f.name).length)}`;
    }
    return text;
  };
  const build = (shown: Finding[]) => [
    `<font size="14" color="#ff5cd3f2"><b>Jita Ledger</b></font><br>`,
    ...shown.map((f) => `<br><font color="#fff2b15c"><b>${escapeMail(f.title)}</b></font><br>${line(f)}<br>`
      + (f.typeId ? `<a href="${opts.appUrl}#orders?market=${f.typeId}">Open its market in game</a><br>` : '')),
    n > shown.length ? `<br>…and ${n - shown.length} more in the app.<br>` : '',
    findings.some((f) => f.kind === 'move' || f.kind === 'clearing')
      ? `<br><a href="${opts.appUrl}#orders">Open your orders in Jita Ledger</a><br>`
      : `<br><a href="${opts.appUrl}#tonight">Open Tonight’s run in Jita Ledger</a><br>`,
    `<br><font color="#ff8095a8">${opts.keepMin == null ? 'Alert mails are kept' : `This mail is deleted after ${keepSaid(opts.keepMin)}, read or not`}. Change that, or turn mail alerts off, in Jita Ledger → Settings → Alerts.</font>`,
  ].join('');
  // ESI refuses a body over 10,000 characters. Whole alerts are left out rather than a tag cut in half.
  let count = Math.min(n, MAIL_MAX);
  let body = build(findings.slice(0, count));
  while (body.length > 10000 && count > 1) body = build(findings.slice(0, --count));
  return { subject, body };
}

/**
 * Whether a mail header is one of the app's own alert mails, old enough to delete: from you or your
 * sending character, with the app's subject.
 */
export function isStaleAlertMail(m: { from?: number; subject?: string; timestamp?: string }, senders: number[], keepMin: number, now: number): boolean {
  return m.from != null && senders.includes(m.from) && !!m.subject?.startsWith(MAIL_SUBJECT + ':') && !!m.timestamp && now - Date.parse(m.timestamp) > keepMin * 60_000;
}

/**
 * How often to look for old alert mails: a sixth of the time they're kept, between 5 minutes and an
 * hour. Hourly alone would leave a 30-minute mail sitting for up to 90.
 */
export function tidyEvery(keepMin: number): number {
  return Math.min(60, Math.max(5, keepMin / 6)) * 60_000;
}
