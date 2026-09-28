import type { Activity, AlertConfig, AlertEvent, Motion, Prefs, Theme } from './types';

/**
 * The accent pairs for each faction theme. Everything tinted in the app is mixed from these two, so a
 * theme is two colours and nothing else.
 */
export const THEMES: Record<Theme, [string, string]> = {
  Caldari: ['#5cd3f2', '#f2b15c'],
  Amarr: ['#f3c460', '#ee7d55'],
  Gallente: ['#62e3b8', '#8fadff'],
  Minmatar: ['#ff8a4c', '#eed79a'],
};

export const ALERT_SIZES: { value: number; label: string }[] = [
  { value: 1, label: 'Default' }, { value: 1.25, label: 'Large' }, { value: 1.5, label: 'Larger' }, { value: 1.85, label: 'Largest' },
];

/** How long alerts stay on screen. Null keeps each one until it is closed. */
export const TOAST_SECONDS: { value: number | null; label: string }[] = [
  { value: 5, label: '5 s' }, { value: 10, label: '10 s' }, { value: 20, label: '20 s' }, { value: 60, label: '1 min' }, { value: null, label: 'Until closed' },
];

export const ACTIVITIES: Activity[] = ['Trading', 'Loyalty', 'Planets', 'Hauling', 'Abyssal', 'Combat'];

export const DEFAULT_PREFS: Prefs = {
  theme: 'Caldari',
  alertSize: 1,
  toastSeconds: 10,
  hours: {},
  gankLines: {},
  learnFromLosses: true,
  perJump: 500_000,
  piTax: null,
  // 500 PLEX a month is the store's standing price and what the app has always assumed. The longer
  // packs change with sales and are not in any API, so they are blank until you read them off the store.
  omegaPacks: { 1: 500, 3: null, 6: null, 12: null },
  omegaPack: '1',
};

export const ALERT_EVENTS: AlertEvent[] = ['move', 'clearing', 'squeeze', 'pi', 'scam', 'backup', 'opportunity', 'snipe', 'watchdog', 'safety'];

export const DEFAULT_ALERTS: AlertConfig = {
  on: false,
  browser: false,
  interval: 5,
  minIsk: 5_000_000,
  quiet: false,
  ev: { move: true, clearing: false, squeeze: true, pi: true, scam: true, backup: true, opportunity: true, snipe: true, watchdog: true, safety: true },
  mail: false,
  // By mail, only what you can act on from inside the game: an order to move, a colony to reset.
  mailEv: { move: true, clearing: false, squeeze: false, pi: true, scam: false, backup: false, opportunity: true, snipe: true, watchdog: true, safety: true },
  mailKeepMin: 3 * 1440,
  repeatH: 4,
  snipeMinIsk: 5_000_000,
  snipeMinPct: 10,
};

/**
 * "Remind me again after": how long the same alert waits before it comes again. It was a fixed six hours, which
 * the user found too long once they understood it: left alone in space, a big order was mailed once and then
 * not again for six hours however often it was undercut.
 */
export const REPEAT_HOURS = [1, 2, 4, 6, 12, 24];

/** How long alert mails are kept before the app deletes them. Null keeps them. */
export const MAIL_KEEP: { value: number | null; label: string }[] = [
  { value: 30, label: '30 min' }, { value: 60, label: '1 hour' }, { value: 1440, label: '1 day' },
  { value: 3 * 1440, label: '3 days' }, { value: 7 * 1440, label: '1 week' }, { value: null, label: 'Keep them' },
];

const num = (v: unknown, d: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function sanitizePrefs(p: Partial<Prefs> | null | undefined): Prefs {
  const x = p ?? {};
  const theme = (Object.keys(THEMES) as Theme[]).includes(x.theme as Theme) ? (x.theme as Theme) : DEFAULT_PREFS.theme;
  const motion = (['Full', 'Calm', 'Off'] as Motion[]).includes(x.motion as Motion) ? (x.motion as Motion) : undefined;
  const size = ALERT_SIZES.some((s) => s.value === x.alertSize) ? (x.alertSize as number) : 1;
  const hours: Prefs['hours'] = {};
  for (const a of ACTIVITIES) {
    const h = x.hours?.[a];
    if (h != null && Number.isFinite(h) && h >= 0) hours[a] = Math.min(168, h);
  }
  const gankLines: Record<string, number> = {};
  for (const [k, v] of Object.entries(x.gankLines ?? {})) if (Number.isFinite(v) && v > 0) gankLines[k] = v;
  const packs = { ...DEFAULT_PREFS.omegaPacks };
  for (const k of ['1', '3', '6', '12'] as const) {
    const v = x.omegaPacks?.[k];
    packs[k] = v == null ? (k === '1' ? 500 : null) : Number.isFinite(v) && v > 0 ? v : packs[k];
  }
  return {
    theme,
    motion,
    alertSize: size,
    // Absent on prefs saved before this existed: take the default. An explicit null means "until closed".
    toastSeconds: x.toastSeconds === undefined ? DEFAULT_PREFS.toastSeconds
      : TOAST_SECONDS.some((o) => o.value === x.toastSeconds) ? (x.toastSeconds as number | null) : DEFAULT_PREFS.toastSeconds,
    hours,
    gankLines,
    learnFromLosses: x.learnFromLosses === undefined ? true : !!x.learnFromLosses,
    perJump: clamp(num(x.perJump, DEFAULT_PREFS.perJump), 0, 1e12),
    piTax: x.piTax == null || !Number.isFinite(x.piTax) ? null : clamp(x.piTax, 0, 1),
    omegaPacks: packs,
    omegaPack: (['1', '3', '6', '12'] as const).includes(x.omegaPack as '1') ? (x.omegaPack as Prefs['omegaPack']) : '1',
  };
}

export function sanitizeAlerts(a: Partial<AlertConfig> | null | undefined): AlertConfig {
  const x = a ?? {};
  const ev = { ...DEFAULT_ALERTS.ev };
  for (const k of ALERT_EVENTS) if (x.ev && typeof x.ev[k] === 'boolean') ev[k] = x.ev[k];
  const mailEv = { ...DEFAULT_ALERTS.mailEv };
  for (const k of ALERT_EVENTS) if (x.mailEv && typeof x.mailEv[k] === 'boolean') mailEv[k] = x.mailEv[k];
  return {
    on: !!x.on,
    browser: !!x.browser,
    interval: [5, 15, 30, 60].includes(x.interval as number) ? (x.interval as number) : 5,
    minIsk: clamp(num(x.minIsk, DEFAULT_ALERTS.minIsk), 0, 1e13),
    quiet: !!x.quiet,
    ev,
    mail: !!x.mail,
    mailEv,
    // Absent on settings saved before mail existed: take the default. An explicit null keeps mails.
    mailKeepMin: x.mailKeepMin === undefined ? DEFAULT_ALERTS.mailKeepMin
      : MAIL_KEEP.some((o) => o.value === x.mailKeepMin) ? (x.mailKeepMin as number | null) : DEFAULT_ALERTS.mailKeepMin,
    repeatH: REPEAT_HOURS.includes(x.repeatH as number) ? (x.repeatH as number) : DEFAULT_ALERTS.repeatH,
    snipeMinIsk: clamp(num(x.snipeMinIsk, DEFAULT_ALERTS.snipeMinIsk), 0, 1e13),
    snipeMinPct: clamp(num(x.snipeMinPct, DEFAULT_ALERTS.snipeMinPct), 0, 1000),
  };
}

/** The asset safety countdowns you typed in, by wrap item ID: when it's delivered automatically, and when you typed it. */
export type SafetyTimesDoc = Record<string, { autoAt: string; at: string }>;
export function sanitizeSafetyTimes(v: unknown): SafetyTimesDoc {
  const out: SafetyTimesDoc = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [id, x] of Object.entries(v as Record<string, unknown>)) {
    const t = x as { autoAt?: unknown; at?: unknown } | null;
    if (!/^\d+$/.test(id) || !t || typeof t.autoAt !== 'string' || !Number.isFinite(Date.parse(t.autoAt))) continue;
    out[id] = { autoAt: t.autoAt, at: typeof t.at === 'string' && Number.isFinite(Date.parse(t.at)) ? t.at : t.autoAt };
  }
  return out;
}

/** Items you're leaving orders on ("Place and leave"): type IDs, each once. */
export function sanitizeLeave(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is number => Number.isInteger(x) && x > 0))];
}

/** The motion setting in force: yours if you chose one, otherwise what the system asks for. */
export function effectiveMotion(chosen: Motion | undefined, reducedMotion: boolean): Motion {
  return chosen ?? (reducedMotion ? 'Calm' : 'Full');
}
