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

export type Finding = { kind: AlertEvent; key: string; title: string; text: string; isk?: number };

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
